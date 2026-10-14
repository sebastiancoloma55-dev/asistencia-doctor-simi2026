-- Optimize the final two auth-related RLS policy evaluations.
-- Keep existing authorization logic; evaluate helper functions once per statement.
DROP POLICY IF EXISTS permiso_admin_principal_select_2026 ON public.usuarios_roles;
CREATE POLICY permiso_admin_principal_select_2026
ON public.usuarios_roles
FOR SELECT
TO authenticated
USING (
  (SELECT public.usuario_es_admin_principal_2026())
  OR auth_user_id = (SELECT auth.uid())
  OR lower(email) = lower(coalesce((SELECT auth.jwt() ->> 'email'), ''))
);

DROP POLICY IF EXISTS auditoria_eventos_insert_identity_2026 ON public.auditoria_eventos;
CREATE POLICY auditoria_eventos_insert_identity_2026
ON public.auditoria_eventos
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.usuario_es_admin_principal_2026())
  OR (
    lower(coalesce(usuario_email, '')) = lower(coalesce((SELECT auth.jwt() ->> 'email'), ''))
    AND (SELECT public.usuario_tiene_alguno_permiso(ARRAY[
      'dashboard','colaboradores','sucursales','asistencia','licencias','vacaciones',
      'papeletas','correos','coberturas','reportes','usuarios','auditoria',
      'configcorreos','mapas','tareas'
    ]::text[]))
  )
);
