-- Keep the full source fields needed from Talana's absence and attendance exports.
-- Idempotent because these additions may already exist in hosted Supabase.
alter table public.licencias_medicas
  add column if not exists gerencia text,
  add column if not exists centro_costo text,
  add column if not exists hora_inicio text,
  add column if not exists hora_fin text,
  add column if not exists numero_horas text,
  add column if not exists numero_minutos text,
  add column if not exists fecha_creacion text;

alter table public.registros_asistencia
  add column if not exists razon_social text,
  add column if not exists horas_trabajadas text,
  add column if not exists colacion text,
  add column if not exists horas_extra text,
  add column if not exists estado_edicion text,
  add column if not exists comentario_empleado text,
  add column if not exists editada text,
  add column if not exists editado_por text,
  add column if not exists observacion text,
  add column if not exists unidad_organizacional text,
  add column if not exists jefe text;

-- Guard against duplicate valid source identities while leaving legacy rows with
-- incomplete identity fields untouched for later review.
create unique index if not exists ux_licencias_medicas_talana_identity
  on public.licencias_medicas (
    (regexp_replace(upper(trim(rut)), '[.[:space:]]', '', 'g')),
    (trim(fecha_inicio)),
    (lower(trim(tipo_ausencia)))
  )
  where nullif(trim(rut), '') is not null
    and nullif(trim(fecha_inicio), '') is not null
    and nullif(trim(tipo_ausencia), '') is not null;

create unique index if not exists ux_vacaciones_historico_talana_identity
  on public.vacaciones_historico (
    (regexp_replace(upper(trim(rut)), '[.[:space:]]', '', 'g')),
    (trim(fecha_inicio)),
    (lower(trim(tipo_vacaciones)))
  )
  where nullif(trim(rut), '') is not null
    and nullif(trim(fecha_inicio), '') is not null
    and nullif(trim(tipo_vacaciones), '') is not null;

-- Attendance may legitimately have separate entry and exit marks on one date.
create unique index if not exists ux_registros_asistencia_talana_identity
  on public.registros_asistencia (
    (regexp_replace(upper(trim(rut)), '[.[:space:]]', '', 'g')),
    (trim(fecha)),
    (coalesce(nullif(trim(entrada), '-'), '')),
    (coalesce(nullif(trim(salida), '-'), '')),
    (lower(trim(coalesce(tipo_ausentismo, ''))))
  )
  where nullif(trim(rut), '') is not null
    and nullif(trim(fecha), '') is not null;
