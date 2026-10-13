-- Keep the row-scope authorization helper out of the exposed public API schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER FUNCTION public.usuario_puede_ver_sucursal(uuid, text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.usuario_puede_ver_sucursal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.usuario_puede_ver_sucursal(uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS usuarios_sucursales_usuario_sucursal_idx
  ON public.usuarios_sucursales (usuario_rol_id, sucursal_id);
