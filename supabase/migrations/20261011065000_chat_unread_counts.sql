create or replace function public.chat_listar_conversaciones()
returns table(
  id uuid,titulo text,tipo text,creado_por bigint,created_at timestamptz,
  updated_at timestamptz,unread_count bigint,last_message_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
declare current_id bigint;
begin
  if not public.chat_puede_usar() then raise exception 'No tienes permiso para usar el chat interno'; end if;
  current_id := public.chat_usuario_actual_id();
  return query
    select c.id,c.titulo,c.tipo,c.creado_por,c.created_at,c.updated_at,
      count(m.id) filter (
        where m.created_at > coalesce(p.last_read_at,p.joined_at)
          and m.remitente_id <> current_id
          and m.eliminado_at is null
      ) as unread_count,
      max(m.created_at) as last_message_at
    from public.chat_participantes p
    join public.chat_conversaciones c on c.id=p.conversacion_id
    left join public.chat_mensajes m on m.conversacion_id=c.id
    where p.usuario_rol_id=current_id
    group by c.id,c.titulo,c.tipo,c.creado_por,c.created_at,c.updated_at,p.last_read_at,p.joined_at
    order by c.updated_at desc
    limit 100;
end;
$$;
revoke all on function public.chat_listar_conversaciones() from public, anon;
grant execute on function public.chat_listar_conversaciones() to authenticated;
