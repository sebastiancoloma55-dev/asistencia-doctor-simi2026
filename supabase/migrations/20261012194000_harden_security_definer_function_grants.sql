-- Remove API execution access from trigger-only SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.notificar_cambios_solicitud_dotacion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notificar_chat_nuevo_mensaje() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notificar_solicitud_traslado() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_historial_colaborador() FROM PUBLIC, anon, authenticated;

-- These helpers are used by authenticated application policies/functions, but never by anonymous clients.
REVOKE EXECUTE ON FUNCTION public.chat_es_participante(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_es_participante(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_puede_usar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_puede_usar() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_usuario_actual_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_usuario_actual_id() TO authenticated;
