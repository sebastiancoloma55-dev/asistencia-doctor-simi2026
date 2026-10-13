-- Remove redundant permissive SELECT policies.
-- Each table retains its equivalent permissive FOR ALL policy, while restrictive
-- module and branch-scope policies remain in force.
DROP POLICY IF EXISTS permisos_usuario_select_2026 ON public.colaboradores;
DROP POLICY IF EXISTS permisos_usuario_select_2026 ON public.documentos_laborales;
DROP POLICY IF EXISTS permisos_usuario_select_2026 ON public.papeletas_permisos;
DROP POLICY IF EXISTS permisos_usuario_select_2026 ON public.solicitudes;
DROP POLICY IF EXISTS permisos_usuario_select_2026 ON public.sucursales;
