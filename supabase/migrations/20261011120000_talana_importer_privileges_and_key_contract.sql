-- Grants required by the Talana Edge Function when importing normalized historical reports.
-- These privileges are server-side only; no anon/public access is added.
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.colaboradores,
  public.licencias_medicas,
  public.vacaciones_historico,
  public.registros_asistencia,
  public.actualizaciones_fuentes
TO service_role;

-- Natural-key contract used by the importer (the unique indexes already exist):
-- colaboradores:        (rut)
-- licencias_medicas:    (rut, fecha_inicio, fecha_fin, tipo_ausencia)
-- vacaciones_historico: (rut, fecha_inicio, fecha_fin, tipo_vacaciones)
-- registros_asistencia: (rut, fecha)
