-- Ensure imported rows can receive generated primary keys.
-- Existing IDs are preserved; sequences are aligned to MAX(id) before enabling defaults.
BEGIN;

ALTER SEQUENCE public.licencias_medicas_id_seq OWNED BY public.licencias_medicas.id;
SELECT setval('public.licencias_medicas_id_seq', COALESCE((SELECT MAX(id) FROM public.licencias_medicas), 0) + 1, false);
ALTER TABLE public.licencias_medicas ALTER COLUMN id SET DEFAULT nextval('public.licencias_medicas_id_seq'::regclass);

ALTER SEQUENCE public.registros_asistencia_id_seq OWNED BY public.registros_asistencia.id;
SELECT setval('public.registros_asistencia_id_seq', COALESCE((SELECT MAX(id) FROM public.registros_asistencia), 0) + 1, false);
ALTER TABLE public.registros_asistencia ALTER COLUMN id SET DEFAULT nextval('public.registros_asistencia_id_seq'::regclass);

ALTER SEQUENCE public.vacaciones_historico_id_seq OWNED BY public.vacaciones_historico.id;
SELECT setval('public.vacaciones_historico_id_seq', COALESCE((SELECT MAX(id) FROM public.vacaciones_historico), 0) + 1, false);
ALTER TABLE public.vacaciones_historico ALTER COLUMN id SET DEFAULT nextval('public.vacaciones_historico_id_seq'::regclass);

COMMIT;
