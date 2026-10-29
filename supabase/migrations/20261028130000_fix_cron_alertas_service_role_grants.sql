-- Restore only the table privileges required by the server-side alert cron.
-- Keep this limited to service_role; browser roles retain their existing RLS policies.
GRANT SELECT ON TABLE public.tareas TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notificaciones TO service_role;
