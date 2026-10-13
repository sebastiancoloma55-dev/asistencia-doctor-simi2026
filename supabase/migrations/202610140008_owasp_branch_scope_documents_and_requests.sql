-- Restrict additional sensitive HR records to the employee's assigned branch.
DROP POLICY IF EXISTS scope_documentos_laborales_2026 ON public.documentos_laborales;
CREATE POLICY scope_documentos_laborales_2026 ON public.documentos_laborales AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.colaboradores c WHERE c.id=documentos_laborales.colaborador_id AND private.usuario_puede_ver_sucursal(c.sucursal_id,c.sucursal)))
WITH CHECK (EXISTS (SELECT 1 FROM public.colaboradores c WHERE c.id=documentos_laborales.colaborador_id AND private.usuario_puede_ver_sucursal(c.sucursal_id,c.sucursal)));

DROP POLICY IF EXISTS scope_historial_colaborador_2026 ON public.historial_colaborador;
CREATE POLICY scope_historial_colaborador_2026 ON public.historial_colaborador AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.usuario_es_admin_principal_2026()
  OR EXISTS (
    SELECT 1 FROM public.colaboradores c
    WHERE (c.id=historial_colaborador.colaborador_id
      OR regexp_replace(upper(coalesce(c.rut,'')),'[^0-9K]','','g')=regexp_replace(upper(coalesce(historial_colaborador.rut,'')),'[^0-9K]','','g'))
      AND private.usuario_puede_ver_sucursal(c.sucursal_id,c.sucursal)
  )
);

DROP POLICY IF EXISTS scope_papeletas_permiso_legacy_2026 ON public.papeletas_permiso;
CREATE POLICY scope_papeletas_permiso_legacy_2026 ON public.papeletas_permiso AS RESTRICTIVE FOR ALL TO authenticated
USING (private.usuario_puede_ver_sucursal(NULL::uuid,sucursal))
WITH CHECK (private.usuario_puede_ver_sucursal(NULL::uuid,sucursal));

DROP POLICY IF EXISTS scope_solicitudes_colaborador_2026 ON public.solicitudes;
CREATE POLICY scope_solicitudes_colaborador_2026 ON public.solicitudes AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.colaboradores c WHERE c.id=solicitudes.colaborador_id AND private.usuario_puede_ver_sucursal(c.sucursal_id,c.sucursal)))
WITH CHECK (EXISTS (SELECT 1 FROM public.colaboradores c WHERE c.id=solicitudes.colaborador_id AND private.usuario_puede_ver_sucursal(c.sucursal_id,c.sucursal)));

DROP POLICY IF EXISTS scope_gestiones_correo_2026 ON public.gestiones_correo;
CREATE POLICY scope_gestiones_correo_2026 ON public.gestiones_correo AS RESTRICTIVE FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.sucursales s WHERE s.id=gestiones_correo.sucursal_id AND private.usuario_puede_ver_sucursal(s.id,s.nombre))
  OR (gestiones_correo.sucursal_id IS NULL AND private.usuario_puede_ver_sucursal(NULL::uuid,NULL::text))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.sucursales s WHERE s.id=gestiones_correo.sucursal_id AND private.usuario_puede_ver_sucursal(s.id,s.nombre))
  OR (gestiones_correo.sucursal_id IS NULL AND private.usuario_puede_ver_sucursal(NULL::uuid,NULL::text))
);
