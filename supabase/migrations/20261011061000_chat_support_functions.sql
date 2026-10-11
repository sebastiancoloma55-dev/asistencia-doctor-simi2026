create or replace function public.chat_listar_usuarios()
returns table(id bigint, nombre text, email text, rol text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.chat_puede_usar() then
    raise exception 'No tienes permiso para usar el chat interno';
  end if;
  return query
    select u.id, coalesce(nullif(trim(u.nombre), ''), u.email), u.email, u.rol
    from public.usuarios_roles u
    where u.activo = true
    order by coalesce(nullif(trim(u.nombre), ''), u.email);
end;
$$;
revoke all on function public.chat_listar_usuarios() from public, anon;
grant execute on function public.chat_listar_usuarios() to authenticated;

create or replace function public.chat_marcar_leido(p_conversacion uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.chat_es_participante(p_conversacion) or not public.chat_puede_usar() then
    raise exception 'No autorizado para esta conversación';
  end if;
  update public.chat_participantes
    set last_read_at = now()
  where conversacion_id = p_conversacion
    and usuario_rol_id = public.chat_usuario_actual_id();
end;
$$;
revoke all on function public.chat_marcar_leido(uuid) from public, anon;
grant execute on function public.chat_marcar_leido(uuid) to authenticated;

create or replace function public.actualizar_chat_conversacion_timestamp()
returns trigger language plpgsql set search_path = ''
as $$
begin
  update public.chat_conversaciones set updated_at = now()
  where id = new.conversacion_id;
  return new;
end;
$$;
drop trigger if exists chat_mensajes_actualizar_conversacion on public.chat_mensajes;
create trigger chat_mensajes_actualizar_conversacion
after insert on public.chat_mensajes
for each row execute function public.actualizar_chat_conversacion_timestamp();
