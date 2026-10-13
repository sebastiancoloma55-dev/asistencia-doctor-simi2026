CREATE OR REPLACE FUNCTION private.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT auth.uid();
$function$;

CREATE OR REPLACE FUNCTION private.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT lower(coalesce(auth.jwt() ->> 'email', ''));
$function$;

REVOKE ALL ON FUNCTION private.current_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_email() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_email() TO authenticated;

DROP POLICY IF EXISTS auditoria_eventos_insert_identity_2026 ON public.auditoria_eventos;
CREATE POLICY auditoria_eventos_insert_identity_2026
ON public.auditoria_eventos
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.usuario_es_admin_principal_2026())
  OR (
    lower(coalesce(usuario_email, '')) = (SELECT private.current_user_email())
    AND (SELECT public.usuario_tiene_alguno_permiso(ARRAY[
      'dashboard','colaboradores','sucursales','asistencia','licencias','vacaciones',
      'papeletas','correos','coberturas','reportes','usuarios','auditoria',
      'configcorreos','mapas','tareas'
    ]::text[]))
  )
);

DROP POLICY IF EXISTS permiso_admin_principal_select_2026 ON public.usuarios_roles;
CREATE POLICY permiso_admin_principal_select_2026
ON public.usuarios_roles
FOR SELECT TO authenticated
USING (
  (SELECT public.usuario_actual_es_admin())
  OR (SELECT public.usuario_es_admin_principal_2026())
  OR auth_user_id = (SELECT private.current_user_id())
  OR lower(email) = (SELECT private.current_user_email())
);
