-- The old manual-import uniqueness key (rut, start, end, type) is too broad:
-- Talana can legitimately have multiple records sharing those fields while differing
-- in creation date or time fields. The normalized Talana identity index is authoritative.
drop index if exists public.ux_licencias_medicas_manual_import_conflict;
create index if not exists idx_licencias_medicas_manual_import_lookup
  on public.licencias_medicas (rut, fecha_inicio, fecha_fin, tipo_ausencia);
