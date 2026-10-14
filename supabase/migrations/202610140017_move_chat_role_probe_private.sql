-- Keep the active-role probe out of the exposed public RPC schema.
-- Existing RLS policies retain the function OID; authenticated needs private schema
-- usage and EXECUTE so the policy can evaluate it, but PostgREST cannot expose it
-- through the public schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER FUNCTION public.chat_usuario_rol_activo(bigint) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.chat_usuario_rol_activo(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.chat_usuario_rol_activo(bigint) TO authenticated;
