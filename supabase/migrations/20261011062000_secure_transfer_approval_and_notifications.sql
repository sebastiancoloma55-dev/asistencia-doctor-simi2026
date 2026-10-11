-- Secure transfer decisions and notify users about new messages and transfer decisions.
drop policy if exists traslados_personal_update_reviewer on public.traslados_personal;
revoke update on public.traslados_personal from authenticated;
grant select, insert on public.traslados_personal to authenticated;

drop policy if exists traslados_personal_select_authorized on public.traslados_personal;
create policy traslados_personal_select_authorized on public.traslados_personal
for select to authenticated using (
  public.usuario_es_admin_principal_2026()
  or public.usuario_tiene_alguno_permiso(array['traslados','coberturas'])
);

create or replace function public.resolver_traslado_personal(p_id uuid, p_estado text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.traslados_personal%rowtype;
  reviewer_id bigint;
  today_chile date := (now() at time zone 'America/Santiago')::date;
begin
  if p_estado not in ('APROBADO','RECHAZADO') then
    raise exception 'Estado de resolución no válido';
  end if;
  if not (public.usuario_es_admin_principal_2026() or public.usuario_tiene_permiso('traslados_aprobar')) then
    raise exception 'No tienes permiso para aprobar o rechazar traslados';
  end if;
  reviewer_id := public.chat_usuario_actual_id();
  select * into item from public.traslados_personal where id=p_id for update;
  if not found then raise exception 'No existe la solicitud de traslado'; end if;
  if item.estado <> 'SOLICITADO' then raise exception 'La solicitud ya fue revisada'; end if;

  update public.traslados_personal
    set estado=p_estado, revisado_por=reviewer_id, revisado_en=now(), updated_at=now()
    where id=p_id;

  if p_estado='APROBADO' and item.fecha_inicio <= today_chile and item.colaborador_id is not null then
    update public.colaboradores
      set sucursal_id=item.sucursal_destino_id, sucursal=item.sucursal_destino_nombre
      where id=item.colaborador_id;
  end if;

  insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
  values(item.solicitado_por,'TRASLADO_'||p_estado,'Solicitud de traslado '||lower(p_estado),
    'La solicitud para '||item.colaborador_nombre||' hacia '||item.sucursal_destino_nombre||
    ' fue '||lower(p_estado)||'.','traslado',null);

  return jsonb_build_object('success',true,'estado',p_estado,
    'maestro_actualizado',(p_estado='APROBADO' and item.fecha_inicio <= today_chile and item.colaborador_id is not null));
end;
$$;
revoke all on function public.resolver_traslado_personal(uuid,text) from public, anon;
grant execute on function public.resolver_traslado_personal(uuid,text) to authenticated;

create or replace function public.notificar_chat_nuevo_mensaje()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare conv_title text;
begin
  select c.titulo into conv_title from public.chat_conversaciones c where c.id=new.conversacion_id;
  insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
  select p.usuario_rol_id,'CHAT_MENSAJE','Nuevo mensaje en '||coalesce(conv_title,'Chat'),
    'Tienes un nuevo mensaje de '||coalesce(u.nombre,u.email,'un usuario')||'.',
    'chat',null
  from public.chat_participantes p
  join public.usuarios_roles u on u.id=new.remitente_id
  where p.conversacion_id=new.conversacion_id
    and p.usuario_rol_id<>new.remitente_id;
  return new;
end;
$$;
drop trigger if exists chat_mensajes_notificar_participantes on public.chat_mensajes;
create trigger chat_mensajes_notificar_participantes
after insert on public.chat_mensajes
for each row execute function public.notificar_chat_nuevo_mensaje();

create or replace function public.notificar_solicitud_traslado()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
  select u.id,'TRASLADO_SOLICITADO','Nueva solicitud de traslado',
    'Revisar solicitud de '||new.colaborador_nombre||': '||new.sucursal_origen_nombre||' → '||new.sucursal_destino_nombre||'.',
    'traslado',null
  from public.usuarios_roles u
  where u.activo=true
    and (lower(u.email)='scoloma@farmaciasdoctorsimi.cl'
      or u.acceso_global=true
      or coalesce(u.permisos,'[]'::jsonb) ? 'traslados_aprobar');
  return new;
end;
$$;
drop trigger if exists traslados_notificar_solicitud on public.traslados_personal;
create trigger traslados_notificar_solicitud
after insert on public.traslados_personal
for each row execute function public.notificar_solicitud_traslado();
