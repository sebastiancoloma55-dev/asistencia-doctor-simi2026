-- Link temporary coverage requests to the transfer review queue without changing permanent branch assignment.
ALTER TABLE public.coberturas
  ALTER COLUMN colaborador_id TYPE text USING colaborador_id::text;

ALTER TABLE public.traslados_personal
  ADD COLUMN IF NOT EXISTS tipo_movimiento text NOT NULL DEFAULT 'TRASLADO',
  ADD COLUMN IF NOT EXISTS cobertura_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'traslados_personal_tipo_movimiento_check'
      AND conrelid = 'public.traslados_personal'::regclass
  ) THEN
    ALTER TABLE public.traslados_personal
      ADD CONSTRAINT traslados_personal_tipo_movimiento_check
      CHECK (tipo_movimiento IN ('TRASLADO','COBERTURA'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'traslados_personal_cobertura_id_fkey'
      AND conrelid = 'public.traslados_personal'::regclass
  ) THEN
    ALTER TABLE public.traslados_personal
      ADD CONSTRAINT traslados_personal_cobertura_id_fkey
      FOREIGN KEY (cobertura_id) REFERENCES public.coberturas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS traslados_personal_cobertura_unica
  ON public.traslados_personal(cobertura_id)
  WHERE cobertura_id IS NOT NULL;

-- Only the principal superadministrator can delete generated permission slips.
DROP POLICY IF EXISTS permiso_modulo_delete_2026 ON public.papeletas_permiso;
DROP POLICY IF EXISTS papeletas_delete_admin_principal_only ON public.papeletas_permiso;
CREATE POLICY papeletas_delete_admin_principal_only
  ON public.papeletas_permiso FOR DELETE TO authenticated
  USING (public.usuario_es_admin_principal_2026());

CREATE OR REPLACE FUNCTION public.resolver_traslado_personal(p_id uuid, p_estado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  item public.traslados_personal%rowtype;
  reviewer_id bigint;
  today_chile date := (now() at time zone 'America/Santiago')::date;
  applied boolean := false;
  is_coverage boolean := false;
BEGIN
  IF p_estado NOT IN ('APROBADO','RECHAZADO') THEN RAISE EXCEPTION 'Estado de resolución no válido'; END IF;
  IF NOT (public.usuario_es_admin_principal_2026() OR public.usuario_tiene_permiso('traslados_aprobar')) THEN RAISE EXCEPTION 'No tienes permiso para aprobar o rechazar traslados'; END IF;
  reviewer_id := public.chat_usuario_actual_id();
  SELECT * INTO item FROM public.traslados_personal WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe la solicitud de traslado'; END IF;
  IF item.estado <> 'SOLICITADO' THEN RAISE EXCEPTION 'La solicitud ya fue revisada'; END IF;
  is_coverage := COALESCE(item.tipo_movimiento,'TRASLADO') = 'COBERTURA';
  UPDATE public.traslados_personal SET estado=p_estado,revisado_por=reviewer_id,revisado_en=now(),updated_at=now() WHERE id=p_id;
  IF p_estado='APROBADO' AND item.fecha_inicio <= today_chile THEN
    IF NOT is_coverage AND item.colaborador_id IS NOT NULL THEN
      UPDATE public.colaboradores SET sucursal_id=item.sucursal_destino_id,sucursal=item.sucursal_destino_nombre WHERE id=item.colaborador_id;
      applied := true;
    END IF;
    UPDATE public.traslados_personal SET aplicado_en=now(),updated_at=now() WHERE id=p_id;
  END IF;
  INSERT INTO public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
  VALUES(item.solicitado_por,
    CASE WHEN is_coverage THEN 'COBERTURA_'||p_estado ELSE 'TRASLADO_'||p_estado END,
    CASE WHEN is_coverage THEN 'Solicitud de cobertura '||lower(p_estado) ELSE 'Solicitud de traslado '||lower(p_estado) END,
    CASE WHEN is_coverage THEN 'La cobertura temporal de '||item.colaborador_nombre||' en '||item.sucursal_destino_nombre||' fue '||lower(p_estado)||'. La sucursal maestra no se modifica por una cobertura temporal.'
      ELSE 'La solicitud para '||item.colaborador_nombre||' hacia '||item.sucursal_destino_nombre||' fue '||lower(p_estado)||'.' END,
    CASE WHEN is_coverage THEN 'cobertura' ELSE 'traslado' END,item.cobertura_id);
  RETURN jsonb_build_object('success',true,'estado',p_estado,'maestro_actualizado',applied,'tipo_movimiento',COALESCE(item.tipo_movimiento,'TRASLADO'),'cobertura_temporal',is_coverage);
END;
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_traslados_personal_vigentes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  item public.traslados_personal%rowtype;
  total integer := 0;
  today_chile date := (now() at time zone 'America/Santiago')::date;
  is_coverage boolean;
BEGIN
  FOR item IN
    SELECT * FROM public.traslados_personal
    WHERE estado='APROBADO' AND aplicado_en IS NULL AND fecha_inicio <= today_chile
    ORDER BY fecha_inicio,created_at FOR UPDATE SKIP LOCKED
  LOOP
    is_coverage := COALESCE(item.tipo_movimiento,'TRASLADO') = 'COBERTURA';
    IF NOT is_coverage AND item.colaborador_id IS NOT NULL THEN
      UPDATE public.colaboradores SET sucursal_id=item.sucursal_destino_id,sucursal=item.sucursal_destino_nombre WHERE id=item.colaborador_id;
    END IF;
    UPDATE public.traslados_personal SET aplicado_en=now(),updated_at=now() WHERE id=item.id;
    INSERT INTO public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
    VALUES(item.solicitado_por,
      CASE WHEN is_coverage THEN 'COBERTURA_APLICADA' ELSE 'TRASLADO_APLICADO' END,
      CASE WHEN is_coverage THEN 'Cobertura temporal autorizada' ELSE 'Traslado aplicado' END,
      CASE WHEN is_coverage THEN 'La cobertura temporal de '||item.colaborador_nombre||' en '||item.sucursal_destino_nombre||' entró en vigencia. El maestro de sucursal permanente se mantiene sin cambios.'
        ELSE 'El traslado aprobado de '||item.colaborador_nombre||' a '||item.sucursal_destino_nombre||' entró en vigencia y fue aplicado al maestro de personal.' END,
      CASE WHEN is_coverage THEN 'cobertura' ELSE 'traslado' END,item.cobertura_id);
    total := total + 1;
  END LOOP;
  RETURN total;
END;
$function$;
