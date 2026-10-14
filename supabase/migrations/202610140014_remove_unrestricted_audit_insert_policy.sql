-- Remove the legacy unconditional INSERT policy; it OR-ed with the identity policy
-- and allowed any authenticated user to forge audit rows.
DROP POLICY IF EXISTS auditoria_eventos_insert ON public.auditoria_eventos;
