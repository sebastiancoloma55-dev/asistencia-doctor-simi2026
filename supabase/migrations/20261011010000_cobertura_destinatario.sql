-- Coberturas: destinatario explícito y notificación sin crear traslado automáticamente.
alter table public.solicitudes_dotacion
  add column if not exists destinatario_id bigint
  references public.usuarios_roles(id) on delete set null;

create index if not exists idx_solicitudes_dotacion_destinatario_estado
  on public.solicitudes_dotacion (destinatario_id, estado, created_at desc);

create or replace function public.listar_destinatarios_cobertura()
returns table(id bigint, nombre text, email text, rol text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.usuario_es_admin_principal_2026()
      or public.usuario_tiene_alguno_permiso(array['traslados','amonestaciones'])) then
    raise exception 'No tienes permiso para consultar destinatarios de cobertura';
  end if;
  return query
    select ur.id, coalesce(nullif(ur.nombre,''), ur.email), ur.email, ur.rol
    from public.usuarios_roles ur
    where ur.activo = true
    order by coalesce(nullif(ur.nombre,''), ur.email);
end;
$$;

create or replace function public.crear_solicitud_dotacion_con_destinatario(
  p_sucursal_id uuid,
  p_sucursal_nombre text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_cantidad integer,
  p_cargo_requerido text,
  p_turno text,
  p_hora_inicio time,
  p_hora_fin time,
  p_motivo text,
  p_observaciones text,
  p_destinatario_id bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitante bigint;
  v_solicitud_id uuid;
  v_destinatario public.usuarios_roles%rowtype;
  v_mensaje text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para crear una solicitud';
  end if;
  if not (public.usuario_es_admin_principal_2026()
      or public.usuario_tiene_alguno_permiso(array['traslados','amonestaciones'])) then
    raise exception 'No tienes permiso para crear solicitudes de cobertura';
  end if;
  if p_fecha_inicio is null or p_fecha_fin is null or p_fecha_fin < p_fecha_inicio then
    raise exception 'El rango de fechas no es válido';
  end if;
  if coalesce(p_cantidad,0) < 1 then
    raise exception 'La cantidad de personas debe ser al menos 1';
  end if;
  if nullif(trim(p_motivo),'') is null then
    raise exception 'El motivo de la necesidad es obligatorio';
  end if;
  select * into v_destinatario
    from public.usuarios_roles
    where id = p_destinatario_id and activo = true;
  if not found then
    raise exception 'El usuario destinatario no existe o está inactivo';
  end if;
  v_solicitante := public.chat_usuario_actual_id();
  if v_solicitante is null then
    raise exception 'No se pudo identificar tu perfil de usuario';
  end if;

  insert into public.solicitudes_dotacion
    (sucursal_id, sucursal_nombre, fecha_inicio, fecha_fin, cantidad,
     cargo_requerido, turno, hora_inicio, hora_fin, motivo, observaciones,
     solicitada_por, estado, destinatario_id)
  values
    (p_sucursal_id, trim(p_sucursal_nombre), p_fecha_inicio, p_fecha_fin, p_cantidad,
     p_cargo_requerido, p_turno, p_hora_inicio, p_hora_fin, trim(p_motivo), p_observaciones,
     v_solicitante, 'PENDIENTE', p_destinatario_id)
  returning id into v_solicitud_id;

  v_mensaje := 'Necesidad de cobertura para ' || trim(p_sucursal_nombre)
    || ' (' || p_cargo_requerido || ', turno ' || p_turno || ') desde '
    || p_fecha_inicio::text || ' hasta ' || p_fecha_fin::text
    || '. Cantidad: ' || p_cantidad::text || '. Solicitud: ' || v_solicitud_id::text
    || '. Pendiente de buscar y confirmar al colaborador; no es un traslado creado.';

  insert into public.notificaciones
    (usuario_rol_id, tipo, titulo, mensaje, entidad_tipo, entidad_id, leida)
  values
    (p_destinatario_id, 'COBERTURA', 'Nueva necesidad de cobertura', v_mensaje,
     'solicitudes_dotacion', null, false);

  return v_solicitud_id;
end;
$$;

revoke all on function public.listar_destinatarios_cobertura() from public;
revoke all on function public.crear_solicitud_dotacion_con_destinatario(uuid,text,date,date,integer,text,text,time,time,text,text,bigint) from public;
grant execute on function public.listar_destinatarios_cobertura() to authenticated;
grant execute on function public.crear_solicitud_dotacion_con_destinatario(uuid,text,date,date,integer,text,text,time,time,text,text,bigint) to authenticated;
