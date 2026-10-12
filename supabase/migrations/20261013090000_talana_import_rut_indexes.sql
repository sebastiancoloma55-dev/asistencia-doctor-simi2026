-- Accelerate Talana batch imports that reconcile existing records by RUT.
-- These indexes are non-unique because each employee can legitimately have
-- multiple absences, vacation requests, and attendance records.
create index if not exists idx_licencias_medicas_rut_import
  on public.licencias_medicas (rut);
create index if not exists idx_vacaciones_historico_rut_import
  on public.vacaciones_historico (rut);
create index if not exists idx_colaboradores_rut_import
  on public.colaboradores (rut);
create index if not exists idx_registros_asistencia_rut_import
  on public.registros_asistencia (rut);
