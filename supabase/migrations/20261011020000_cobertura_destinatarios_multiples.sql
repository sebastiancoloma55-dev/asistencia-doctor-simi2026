-- Selector de uno o varios destinatarios para una misma necesidad de cobertura.
-- La solicitud se registra una sola vez y cada destinatario recibe una notificación.
create table if not exists public.solicitud_dotacion_destinatarios (
  solicitud_id uuid not null references public.solicitudes_dotacion(id) on delete cascade,
  destinatario_id bigint not null references public.usuarios_roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (solicitud_id, destinatario_id)
);

alter table public.solicitud_dotacion_destinatarios enable row level security;

create index if not exists idx_solicitud_dotacion_destinatarios_usuario
  on public.solicitud_dotacion_destinatarios (destinatario_id, created_at desc);

create or replace function public.crear_solicitud_dotacion_con_destinatarios(
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
  p_destinatarios_ids bigint[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitante bigint;
  v_solicitud_id uuid;
  v_destinatario_id bigint;
  v_destinatarios bigint[];
  v_total_validos integer;
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

  select array_agg(distinct x order by x)
    into v_destinatarios
    from unnest(coalesce(p_destinatarios_ids, array[]::bigint[])) as x
   where x is not null;
  if coalesce(cardinality(v_destinatarios),0) = 0 then
    raise exception 'Selecciona al menos un usuario destinatario';
  end if;

  select count(*) into v_total_validos
    from public.usuarios_roles ur
   where ur.id = any(v_destinatarios)
     and ur.activo = true;
  if v_total_validos <> cardinality(v_destinatarios) then
    raise exception 'Uno o más destinatarios no existen o están inactivos';
  end if;

  v_solicitante := public.chat_usuario_actual_id();
  if v_solicitante is null then
    raise exception 'No se pudo identificar tu perfil de usuario';
  end if;

  -- Mantener el primer destinatario en la columna legacy para compatibilidad.
  v_destinatario_id := v_destinatarios[1];
  insert into public.solicitudes_dotacion
    (sucursal_id, sucursal_nombre, fecha_inicio, fecha_fin, cantidad,
     cargo_requerido, turno, hora_inicio, hora_fin, motivo, observaciones,
     solicitada_por, estado, destinatario_id)
  values
    (p_sucursal_id, trim(p_sucursal_nombre), p_fecha_inicio, p_fecha_fin, p_cantidad,
     p_cargo_requerido, p_turno, p_hora_inicio, p_hora_fin, trim(p_motivo), p_observaciones,
     v_solicitante, 'PENDIENTE', v_destinatario_id)
  returning id into v_solicitud_id;

  insert into public.solicitud_dotacion_destinatarios (solicitud_id, destinatario_id)
  select v_solicitud_id, unnest(v_destinatarios);

  v_mensaje := 'Necesidad de cobertura para ' || trim(p_sucursal_nombre)
    || ' (' || p_cargo_requerido || ', turno ' || p_turno || ') desde '
    || p_fecha_inicio::text || ' hasta ' || p_fecha_fin::text
    || '. Cantidad: ' || p_cantidad::text
    || '. Pendiente de buscar y confirmar al colaborador; no es un traslado creado.';

  insert into public.notificaciones
    (usuario_rol_id, tipo, titulo, mensaje, entidad_tipo, entidad_id, leida)
  select unnest(v_destinatarios), 'COBERTURA', 'Nueva necesidad de cobertura',
         v_mensaje, 'solicitudes_dotacion', v_solicitud_id, false;

  return v_solicitud_id;
end;
$$;

revoke all on function public.crear_solicitud_dotacion_con_destinatarios(uuid,text,date,date,integer,text,text,time,time,text,text,bigint[]) from public;
grant execute on function public.crear_solicitud_dotacion_con_destinatarios(uuid,text,date,date,integer,text,text,time,time,text,text,bigint[]) to authenticated;
