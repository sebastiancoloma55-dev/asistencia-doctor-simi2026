-- Support date-overlap filtering in the email-draft absence protection flow.
-- This migration is isolated to the feature branch; do not apply to production without review.
begin;

create index if not exists idx_licencias_medicas_fecha_inicio_correo
  on public.licencias_medicas (fecha_inicio);
create index if not exists idx_licencias_medicas_fecha_fin_correo
  on public.licencias_medicas (fecha_fin);

create index if not exists idx_vacaciones_historico_fecha_inicio_correo
  on public.vacaciones_historico (fecha_inicio);
create index if not exists idx_vacaciones_historico_fecha_fin_correo
  on public.vacaciones_historico (fecha_fin);

create index if not exists idx_papeletas_permiso_fecha_inicio_correo
  on public.papeletas_permiso (fecha_inicio);
create index if not exists idx_papeletas_permiso_fecha_fin_correo
  on public.papeletas_permiso (fecha_fin);

commit;
