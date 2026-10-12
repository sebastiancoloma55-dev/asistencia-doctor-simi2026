-- Allow the principal administrator to manage shared workspace notes without weakening owner isolation.
DROP POLICY IF EXISTS rrhh_notas_update_2026 ON public.rrhh_notas;
CREATE POLICY rrhh_notas_update_2026
  ON public.rrhh_notas FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.usuario_es_admin_principal_2026()
  )
  WITH CHECK (
    (user_id = auth.uid() OR public.usuario_es_admin_principal_2026())
    AND (
      visibilidad = 'PERSONAL'
      OR public.usuario_es_admin_principal_2026()
      OR public.usuario_tiene_alguno_permiso(ARRAY['espacio','tareas']::text[])
    )
  );
