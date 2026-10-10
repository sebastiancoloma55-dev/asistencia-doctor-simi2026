-- Remove only exact duplicates; retain one policy with identical role, command, and expressions.
-- This preserves effective authorization while avoiding duplicate policy evaluation.
DROP POLICY IF EXISTS auditoria_eventos_ins ON public.auditoria_eventos;
DROP POLICY IF EXISTS auditoria_eventos_sel ON public.auditoria_eventos;
DROP POLICY IF EXISTS auditoria_eventos_upd ON public.auditoria_eventos;

DROP POLICY IF EXISTS coberturas_ins ON public.coberturas;
DROP POLICY IF EXISTS coberturas_sel ON public.coberturas;
DROP POLICY IF EXISTS coberturas_upd ON public.coberturas;

DROP POLICY IF EXISTS papeletas_permiso_ins ON public.papeletas_permiso;
DROP POLICY IF EXISTS papeletas_permiso_sel ON public.papeletas_permiso;
DROP POLICY IF EXISTS papeletas_permiso_upd ON public.papeletas_permiso;

DROP POLICY IF EXISTS vacaciones_historico_ins ON public.vacaciones_historico;
DROP POLICY IF EXISTS vacaciones_historico_sel ON public.vacaciones_historico;
DROP POLICY IF EXISTS vacaciones_historico_upd ON public.vacaciones_historico;
