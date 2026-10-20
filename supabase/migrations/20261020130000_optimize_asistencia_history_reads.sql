-- Reduce sort and range-scan cost when loading attendance history under RLS.
-- Apply to the preview/test Supabase project first; do not apply to production without validation.
begin;

create index if not exists idx_registros_asistencia_fecha_desc
  on public.registros_asistencia (fecha desc);

create index if not exists idx_registros_asistencia_sucursal_fecha
  on public.registros_asistencia (lower(btrim(sucursal)), fecha desc);

commit;
