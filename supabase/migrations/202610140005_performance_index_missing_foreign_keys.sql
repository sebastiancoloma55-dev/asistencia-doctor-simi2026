-- Cover foreign keys identified by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS chat_conversaciones_creado_por_idx ON public.chat_conversaciones (creado_por);
CREATE INDEX IF NOT EXISTS chat_mensajes_remitente_id_idx ON public.chat_mensajes (remitente_id);
CREATE INDEX IF NOT EXISTS chat_participantes_agregado_por_idx ON public.chat_participantes (agregado_por);
CREATE INDEX IF NOT EXISTS historial_colaborador_colaborador_id_fk_idx ON public.historial_colaborador (colaborador_id);
CREATE INDEX IF NOT EXISTS solicitudes_dotacion_revisada_por_idx ON public.solicitudes_dotacion (revisada_por);
CREATE INDEX IF NOT EXISTS solicitudes_dotacion_solicitada_por_idx ON public.solicitudes_dotacion (solicitada_por);
CREATE INDEX IF NOT EXISTS talana_bot_files_run_id_idx ON public.talana_bot_files (run_id);
CREATE INDEX IF NOT EXISTS traslados_personal_revisado_por_idx ON public.traslados_personal (revisado_por);
CREATE INDEX IF NOT EXISTS traslados_personal_solicitado_por_idx ON public.traslados_personal (solicitado_por);
CREATE INDEX IF NOT EXISTS traslados_personal_sucursal_destino_id_idx ON public.traslados_personal (sucursal_destino_id);
CREATE INDEX IF NOT EXISTS traslados_personal_sucursal_origen_id_idx ON public.traslados_personal (sucursal_origen_id);
