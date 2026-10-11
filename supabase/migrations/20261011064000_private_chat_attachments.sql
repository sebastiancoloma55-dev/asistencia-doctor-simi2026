alter table public.chat_mensajes
  add column if not exists adjunto_path text,
  add column if not exists adjunto_nombre text,
  add column if not exists adjunto_mime text,
  add column if not exists adjunto_bytes bigint;

alter table public.chat_mensajes drop constraint if exists chat_mensajes_adjunto_size_check;
alter table public.chat_mensajes add constraint chat_mensajes_adjunto_size_check
  check (adjunto_bytes is null or (adjunto_bytes > 0 and adjunto_bytes <= 10485760));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('chat-adjuntos','chat-adjuntos',false,10485760,
  array['application/pdf','image/jpeg','image/png','image/webp','text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel','text/csv'])
on conflict (id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists chat_adjuntos_select_participant on storage.objects;
create policy chat_adjuntos_select_participant on storage.objects
for select to authenticated using (
  bucket_id='chat-adjuntos' and public.chat_puede_usar()
  and public.chat_es_participante((storage.foldername(name))[1]::uuid)
);
drop policy if exists chat_adjuntos_insert_participant on storage.objects;
create policy chat_adjuntos_insert_participant on storage.objects
for insert to authenticated with check (
  bucket_id='chat-adjuntos' and public.chat_puede_usar()
  and public.chat_es_participante((storage.foldername(name))[1]::uuid)
);
drop policy if exists chat_adjuntos_delete_uploader on storage.objects;
create policy chat_adjuntos_delete_uploader on storage.objects
for delete to authenticated using (
  bucket_id='chat-adjuntos' and public.chat_puede_usar()
  and public.chat_es_participante((storage.foldername(name))[1]::uuid)
);

drop policy if exists chat_mensajes_insert_member on public.chat_mensajes;
create policy chat_mensajes_insert_member on public.chat_mensajes
for insert to authenticated with check (
  public.chat_puede_usar()
  and remitente_id = public.chat_usuario_actual_id()
  and public.chat_es_participante(conversacion_id)
  and (adjunto_path is null or adjunto_path like conversacion_id::text || '/%')
);
