-- Enforce server-side branch scope for sensitive HR data.
-- Users without explicit global access must have a matching branch assignment.
-- Service-role import jobs bypass RLS as intended; browser-authenticated users do not.

CREATE OR REPLACE FUNCTION public.usuario_puede_ver_sucursal(p_sucursal_id uuid, p_sucursal_nombre text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN false
    WHEN public.usuario_es_admin_principal_2026() THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.usuarios_roles u
      WHERE u.activo = true
        AND (
          u.auth_user_id = (SELECT auth.uid())
          OR lower(u.email) = lower(coalesce((SELECT auth.jwt() ->> 'email'), ''))
        )
        AND (
          u.acceso_global = true
          OR EXISTS (
            SELECT 1
            FROM public.usuarios_sucursales us
            JOIN public.sucursales s ON s.id = us.sucursal_id
            WHERE us.usuario_rol_id = u.id
              AND (
                (p_sucursal_id IS NOT NULL AND us.sucursal_id = p_sucursal_id)
                OR (
                  nullif(btrim(p_sucursal_nombre), '') IS NOT NULL
                  AND lower(btrim(s.nombre)) = lower(btrim(p_sucursal_nombre))
                )
              )
          )
        )
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.usuario_puede_ver_sucursal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_puede_ver_sucursal(uuid, text) TO authenticated;

DROP POLICY IF EXISTS scope_sucursal_colaboradores_2026 ON public.colaboradores;
CREATE POLICY scope_sucursal_colaboradores_2026
  ON public.colaboradores AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.usuario_puede_ver_sucursal(sucursal_id, sucursal))
  WITH CHECK (public.usuario_puede_ver_sucursal(sucursal_id, sucursal));

DROP POLICY IF EXISTS scope_sucursal_licencias_2026 ON public.licencias_medicas;
CREATE POLICY scope_sucursal_licencias_2026
  ON public.licencias_medicas AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.usuario_puede_ver_sucursal(NULL::uuid, sucursal))
  WITH CHECK (public.usuario_puede_ver_sucursal(NULL::uuid, sucursal));

DROP POLICY IF EXISTS scope_sucursal_asistencia_2026 ON public.registros_asistencia;
CREATE POLICY scope_sucursal_asistencia_2026
  ON public.registros_asistencia AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.usuario_puede_ver_sucursal(NULL::uuid, sucursal))
  WITH CHECK (public.usuario_puede_ver_sucursal(NULL::uuid, sucursal));

DROP POLICY IF EXISTS scope_sucursal_vacaciones_2026 ON public.vacaciones_historico;
CREATE POLICY scope_sucursal_vacaciones_2026
  ON public.vacaciones_historico AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.usuario_puede_ver_sucursal(NULL::uuid, sucursal))
  WITH CHECK (public.usuario_puede_ver_sucursal(NULL::uuid, sucursal));

DROP POLICY IF EXISTS scope_sucursal_papeletas_2026 ON public.papeletas_permisos;
CREATE POLICY scope_sucursal_papeletas_2026
  ON public.papeletas_permisos AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.colaboradores c
      WHERE c.id = colaborador_id
        AND public.usuario_puede_ver_sucursal(c.sucursal_id, c.sucursal)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.colaboradores c
      WHERE c.id = colaborador_id
        AND public.usuario_puede_ver_sucursal(c.sucursal_id, c.sucursal)
    )
  );
