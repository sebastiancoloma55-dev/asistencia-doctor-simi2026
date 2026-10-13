-- Align database uniqueness with the Talana importer natural keys.
-- The source request/creation fields distinguish movements with the same employee,
-- start date and type. End dates/status are mutable and must not be identity fields.
-- Preflight checked that existing rows have no collisions under the proposed keys.
drop index if exists public.licencias_medicas_registro_uk;
drop index if exists public.ux_licencias_medicas_talana_identity;
drop index if exists public.vacaciones_historico_uk;
drop index if exists public.ux_vacaciones_historico_talana_identity;

create unique index ux_licencias_medicas_talana_identity
  on public.licencias_medicas (
    (regexp_replace(upper(trim(rut)), '[.[:space:]]', '', 'g')),
    (trim(fecha_inicio)),
    (translate(regexp_replace(lower(trim(coalesce(tipo_ausencia, ''))), '[[:space:]]+', ' ', 'g'), 'áéíóúüñ', 'aeiouun')),
    (coalesce(trim(fecha_creacion), '')),
    (coalesce(regexp_replace(lower(trim(coalesce(hora_inicio, ''))), '[[:space:]]+', ' ', 'g'), '')),
    (coalesce(regexp_replace(lower(trim(coalesce(hora_fin, ''))), '[[:space:]]+', ' ', 'g'), ''))
  )
  where nullif(trim(rut), '') is not null
    and nullif(trim(fecha_inicio), '') is not null
    and nullif(trim(tipo_ausencia), '') is not null;

create unique index ux_vacaciones_historico_talana_identity
  on public.vacaciones_historico (
    (regexp_replace(upper(trim(rut)), '[.[:space:]]', '', 'g')),
    (trim(fecha_inicio)),
    (translate(regexp_replace(lower(trim(coalesce(tipo_vacaciones, ''))), '[[:space:]]+', ' ', 'g'), 'áéíóúüñ', 'aeiouun')),
    (coalesce(trim(fecha_solicitud), '')),
    (coalesce(translate(regexp_replace(lower(trim(coalesce(jornada, ''))), '[[:space:]]+', ' ', 'g'), 'áéíóúüñ', 'aeiouun'), ''))
  )
  where nullif(trim(rut), '') is not null
    and nullif(trim(fecha_inicio), '') is not null
    and nullif(trim(tipo_vacaciones), '') is not null;

-- A person can have multiple attendance records on the same date.
-- Keep uniqueness at the actual attendance identity level, not RUT + date.
drop index if exists public.registros_asistencia_rut_fecha_uk;
drop index if exists public.ux_registros_asistencia_talana_identity;
create unique index ux_registros_asistencia_talana_identity
  on public.registros_asistencia (
    (regexp_replace(upper(trim(rut)), '[.[:space:]]', '', 'g')),
    (trim(fecha)),
    (coalesce(regexp_replace(lower(trim(coalesce(entrada, ''))), '[[:space:]]+', ' ', 'g'), '')),
    (coalesce(regexp_replace(lower(trim(coalesce(salida, ''))), '[[:space:]]+', ' ', 'g'), '')),
    (translate(regexp_replace(lower(trim(coalesce(tipo_ausentismo, ''))), '[[:space:]]+', ' ', 'g'), 'áéíóúüñ', 'aeiouun'))
  )
  where nullif(trim(rut), '') is not null
    and nullif(trim(fecha), '') is not null;
