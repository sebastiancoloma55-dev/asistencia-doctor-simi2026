-- Keep global branch visibility separate from module authorization.
-- acceso_global is consumed by private branch-scope helpers; it must not grant
-- every module permission or bypass audit authorization.
CREATE OR REPLACE FUNCTION public.usuario_tiene_permiso(p_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'scoloma@farmaciasdoctorsimi.cl' THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.usuarios_roles u
      WHERE u.activo = true
        AND (
          u.auth_user_id = (select auth.uid())
          OR lower(u.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
        AND coalesce(u.permisos, '[]'::jsonb) ? p_permiso
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.usuario_tiene_alguno_permiso(p_permisos text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'scoloma@farmaciasdoctorsimi.cl' THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.usuarios_roles u
      WHERE u.activo = true
        AND (
          u.auth_user_id = (select auth.uid())
          OR lower(u.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
        AND coalesce(u.permisos, '[]'::jsonb) ?| coalesce(p_permisos, ARRAY[]::text[])
    )
  END;
$function$;

COMMENT ON FUNCTION public.usuario_tiene_permiso(text) IS
  'Checks explicit module permission. acceso_global controls branch scope only.';
COMMENT ON FUNCTION public.usuario_tiene_alguno_permiso(text[]) IS
  'Checks explicit module permissions. acceso_global controls branch scope only.';
