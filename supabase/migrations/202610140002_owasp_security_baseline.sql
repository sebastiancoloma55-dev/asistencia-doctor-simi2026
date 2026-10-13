-- OWASP baseline hardening for the existing Supabase project.
-- These changes were applied directly and verified in Supabase on 2026-10-14.
-- Statements are intentionally repeatable so the repository can catch up with the live DB.

DO $security_hardening$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', r.tablename);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated', r.tablename);
  END LOOP;
END
$security_hardening$;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon;

ALTER TABLE public.control_sesion_global ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.control_sesion_global FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.control_sesion_global FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.control_sesion_global TO authenticated;

DROP POLICY IF EXISTS control_sesion_global_read_authenticated ON public.control_sesion_global;
CREATE POLICY control_sesion_global_read_authenticated
  ON public.control_sesion_global FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS control_sesion_global_update_admin ON public.control_sesion_global;
CREATE POLICY control_sesion_global_update_admin
  ON public.control_sesion_global FOR UPDATE TO authenticated
  USING (public.usuario_es_admin_principal_2026())
  WITH CHECK (public.usuario_es_admin_principal_2026());

DROP POLICY IF EXISTS control_sesion_global_insert_admin ON public.control_sesion_global;
DROP POLICY IF EXISTS control_sesion_global_delete_admin ON public.control_sesion_global;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.control_sesion_global FROM authenticated;

ALTER FUNCTION public.listar_destinatarios_cobertura() SET search_path = '';
ALTER FUNCTION public.usuario_actual_es_admin() SET search_path = '';
ALTER FUNCTION public.usuario_es_admin() SET search_path = '';
ALTER FUNCTION public.usuario_rol_actual_id() SET search_path = '';
ALTER FUNCTION public.crear_solicitud_dotacion_con_destinatario(uuid, text, date, date, integer, text, text, time without time zone, time without time zone, text, text, bigint) SET search_path = '';
ALTER FUNCTION public.crear_solicitud_dotacion_con_destinatarios(uuid, text, date, date, integer, text, text, time without time zone, time without time zone, text, text, bigint[]) SET search_path = '';

DROP POLICY IF EXISTS permiso_admin_principal_insert_2026 ON public.auditoria_eventos;
CREATE POLICY auditoria_eventos_insert_identity_2026
  ON public.auditoria_eventos
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.usuario_es_admin_principal_2026()
    OR (
      lower(coalesce(usuario_email, '')) =
        lower(coalesce((SELECT auth.jwt() ->> 'email'), ''))
      AND public.usuario_tiene_alguno_permiso(ARRAY[
        'dashboard','colaboradores','sucursales','asistencia','licencias',
        'vacaciones','papeletas','correos','coberturas','reportes','usuarios',
        'auditoria','configcorreos','mapas','tareas'
      ]::text[])
    )
  );
