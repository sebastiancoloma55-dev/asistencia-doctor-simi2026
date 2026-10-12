-- Medical leave and attendance data must never be accessible to anonymous API clients.
REVOKE ALL PRIVILEGES ON TABLE public.licencias_medicas FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON TABLE public.registros_asistencia FROM PUBLIC, anon;

-- Preserve intended authenticated app access and privileged server-side bot imports.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.licencias_medicas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.registros_asistencia TO authenticated, service_role;
