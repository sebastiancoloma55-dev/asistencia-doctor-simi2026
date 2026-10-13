-- Harden SECURITY DEFINER functions that still used search_path=public.
-- All table references in these functions are schema-qualified.
ALTER FUNCTION public.generar_tareas_recurrentes() SET search_path = '';
ALTER FUNCTION public.notificar_cambios_solicitud_dotacion() SET search_path = '';
