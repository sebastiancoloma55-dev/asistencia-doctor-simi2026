-- Applied to the connected Supabase project on 2026-10-10.
-- Add a primary key after confirming existing IDs were unique and non-null.
ALTER TABLE public.licencias_medicas
  ADD CONSTRAINT licencias_medicas_pkey PRIMARY KEY (id);

-- Remove default PUBLIC/anonymous execution from privileged helper functions.
-- Keep authenticated execution where the application/RLS policies require it.
REVOKE ALL PRIVILEGES ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.tiene_rol(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiene_rol(text[]) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.usuario_actual_es_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_actual_es_admin() TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.usuario_es_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_es_admin() TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.usuario_es_admin_principal_2026() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_es_admin_principal_2026() TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.usuario_rol_actual_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_rol_actual_id() TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.usuario_tiene_alguno_permiso(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_tiene_alguno_permiso(text[]) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.usuario_tiene_permiso(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_tiene_permiso(text) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.usuarios_tareas_asignables() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuarios_tareas_asignables() TO authenticated;
