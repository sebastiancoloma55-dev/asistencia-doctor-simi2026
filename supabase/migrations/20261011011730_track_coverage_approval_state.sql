-- Track approval/rejection on the source coverage row so rejected coverages do not appear as active.
ALTER TABLE public.coberturas
  ADD COLUMN IF NOT EXISTS estado_solicitud text NOT NULL DEFAULT 'APROBADA';
ALTER TABLE public.coberturas
  ALTER COLUMN estado_solicitud SET DEFAULT 'PENDIENTE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='coberturas_estado_solicitud_check'
      AND conrelid='public.coberturas'::regclass
  ) THEN
    ALTER TABLE public.coberturas
      ADD CONSTRAINT coberturas_estado_solicitud_check
      CHECK (estado_solicitud IN ('PENDIENTE','APROBADA','RECHAZADA'));
  END IF;
END $$;

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
  IF is_coverage AND item.cobertura_id IS NOT NULL THEN
    UPDATE public.coberturas
      SET estado_solicitud=CASE WHEN p_estado='APROBADO' THEN 'APROBADA' ELSE 'RECHAZADA' END
      WHERE id=item.cobertura_id;
  END IF;
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
