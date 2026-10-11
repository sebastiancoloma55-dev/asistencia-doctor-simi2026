-- The Talana Edge Function uses the server-side service_role client to import
-- historical vacation requests and employee master data. These grants are
-- limited to the importer-required operations; no public/anon permissions added.
GRANT SELECT, INSERT, UPDATE ON TABLE public.vacaciones_historico TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.colaboradores TO service_role;
