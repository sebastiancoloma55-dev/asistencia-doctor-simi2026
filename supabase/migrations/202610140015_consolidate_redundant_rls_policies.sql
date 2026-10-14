-- Consolidate redundant permissive policies without broadening access.
-- Notifications remain restricted to the owner or admin; module policies were
-- redundant OR branches that could not further restrict that scope.
DROP POLICY IF EXISTS permiso_modulo_delete_2026 ON public.notificaciones;
DROP POLICY IF EXISTS permiso_modulo_insert_2026 ON public.notificaciones;
DROP POLICY IF EXISTS permiso_modulo_select_2026 ON public.notificaciones;
DROP POLICY IF EXISTS permiso_modulo_update_2026 ON public.notificaciones;

-- Keep the existing task-event scope policies for SELECT and INSERT; retain
-- admin-only maintenance for UPDATE and DELETE without a duplicate ALL policy.
DROP POLICY IF EXISTS tareas_eventos_admin_manage ON public.tareas_eventos;
CREATE POLICY tareas_eventos_admin_update
ON public.tareas_eventos FOR UPDATE TO authenticated
USING ((SELECT public.usuario_es_admin_principal_2026()))
WITH CHECK ((SELECT public.usuario_es_admin_principal_2026()));
CREATE POLICY tareas_eventos_admin_delete
ON public.tareas_eventos FOR DELETE TO authenticated
USING ((SELECT public.usuario_es_admin_principal_2026()));

-- The task-template read policy already admits the principal admin via the
-- permission helper. Separate admin writes from reads to remove overlapping SELECT.
DROP POLICY IF EXISTS tareas_plantillas_gestion_admin_2026 ON public.tareas_plantillas;
CREATE POLICY tareas_plantillas_admin_insert
ON public.tareas_plantillas FOR INSERT TO authenticated
WITH CHECK ((SELECT public.usuario_es_admin_principal_2026()));
CREATE POLICY tareas_plantillas_admin_update
ON public.tareas_plantillas FOR UPDATE TO authenticated
USING ((SELECT public.usuario_es_admin_principal_2026()))
WITH CHECK ((SELECT public.usuario_es_admin_principal_2026()));
CREATE POLICY tareas_plantillas_admin_delete
ON public.tareas_plantillas FOR DELETE TO authenticated
USING ((SELECT public.usuario_es_admin_principal_2026()));

-- Merge duplicate SELECT policies for user-role records while preserving the
-- ability of regular admins to list users and users to read their own profile.
DROP POLICY IF EXISTS usuarios_roles_lectura ON public.usuarios_roles;
DROP POLICY IF EXISTS permiso_admin_principal_select_2026 ON public.usuarios_roles;
CREATE POLICY permiso_admin_principal_select_2026
ON public.usuarios_roles FOR SELECT TO authenticated
USING (
  (SELECT public.usuario_actual_es_admin())
  OR (SELECT public.usuario_es_admin_principal_2026())
  OR auth_user_id = (SELECT auth.uid())
  OR lower(email) = lower(coalesce((SELECT auth.jwt() ->> 'email'), ''))
);
