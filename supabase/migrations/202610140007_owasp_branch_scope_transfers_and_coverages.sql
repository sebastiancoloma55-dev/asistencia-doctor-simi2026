-- Apply branch-scope rules to transfer, coverage, and staffing request rows.
DROP POLICY IF EXISTS scope_traslados_select_2026 ON public.traslados_personal;
CREATE POLICY scope_traslados_select_2026 ON public.traslados_personal AS RESTRICTIVE FOR SELECT TO authenticated
USING (private.usuario_puede_ver_sucursal(sucursal_origen_id,sucursal_origen_nombre) OR private.usuario_puede_ver_sucursal(sucursal_destino_id,sucursal_destino_nombre));

DROP POLICY IF EXISTS scope_traslados_insert_2026 ON public.traslados_personal;
CREATE POLICY scope_traslados_insert_2026 ON public.traslados_personal AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (private.usuario_puede_ver_sucursal(sucursal_origen_id,sucursal_origen_nombre) AND private.usuario_puede_ver_sucursal(sucursal_destino_id,sucursal_destino_nombre));

DROP POLICY IF EXISTS scope_traslados_update_2026 ON public.traslados_personal;
CREATE POLICY scope_traslados_update_2026 ON public.traslados_personal AS RESTRICTIVE FOR UPDATE TO authenticated
USING (private.usuario_puede_ver_sucursal(sucursal_origen_id,sucursal_origen_nombre) AND private.usuario_puede_ver_sucursal(sucursal_destino_id,sucursal_destino_nombre))
WITH CHECK (private.usuario_puede_ver_sucursal(sucursal_origen_id,sucursal_origen_nombre) AND private.usuario_puede_ver_sucursal(sucursal_destino_id,sucursal_destino_nombre));

DROP POLICY IF EXISTS scope_traslados_delete_2026 ON public.traslados_personal;
CREATE POLICY scope_traslados_delete_2026 ON public.traslados_personal AS RESTRICTIVE FOR DELETE TO authenticated
USING (private.usuario_puede_ver_sucursal(sucursal_origen_id,sucursal_origen_nombre) AND private.usuario_puede_ver_sucursal(sucursal_destino_id,sucursal_destino_nombre));

DROP POLICY IF EXISTS scope_sucursal_solicitudes_dotacion_2026 ON public.solicitudes_dotacion;
CREATE POLICY scope_sucursal_solicitudes_dotacion_2026 ON public.solicitudes_dotacion AS RESTRICTIVE FOR ALL TO authenticated
USING (private.usuario_puede_ver_sucursal(sucursal_id,sucursal_nombre))
WITH CHECK (private.usuario_puede_ver_sucursal(sucursal_id,sucursal_nombre));

DROP POLICY IF EXISTS scope_coberturas_select_2026 ON public.coberturas;
CREATE POLICY scope_coberturas_select_2026 ON public.coberturas AS RESTRICTIVE FOR SELECT TO authenticated
USING (private.usuario_puede_ver_sucursal(NULL::uuid,local_origen) OR private.usuario_puede_ver_sucursal(NULL::uuid,local_destino));

DROP POLICY IF EXISTS scope_coberturas_insert_2026 ON public.coberturas;
CREATE POLICY scope_coberturas_insert_2026 ON public.coberturas AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (private.usuario_puede_ver_sucursal(NULL::uuid,local_origen) AND private.usuario_puede_ver_sucursal(NULL::uuid,local_destino));

DROP POLICY IF EXISTS scope_coberturas_update_2026 ON public.coberturas;
CREATE POLICY scope_coberturas_update_2026 ON public.coberturas AS RESTRICTIVE FOR UPDATE TO authenticated
USING (private.usuario_puede_ver_sucursal(NULL::uuid,local_origen) AND private.usuario_puede_ver_sucursal(NULL::uuid,local_destino))
WITH CHECK (private.usuario_puede_ver_sucursal(NULL::uuid,local_origen) AND private.usuario_puede_ver_sucursal(NULL::uuid,local_destino));

DROP POLICY IF EXISTS scope_coberturas_delete_2026 ON public.coberturas;
CREATE POLICY scope_coberturas_delete_2026 ON public.coberturas AS RESTRICTIVE FOR DELETE TO authenticated
USING (private.usuario_puede_ver_sucursal(NULL::uuid,local_origen) AND private.usuario_puede_ver_sucursal(NULL::uuid,local_destino));
