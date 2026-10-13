-- Enforce branch authorization inside SECURITY DEFINER business RPCs.
CREATE OR REPLACE FUNCTION public.crear_solicitud_dotacion_con_destinatario(
  p_sucursal_id uuid, p_sucursal_nombre text, p_fecha_inicio date, p_fecha_fin date,
  p_cantidad integer, p_cargo_requerido text, p_turno text,
  p_hora_inicio time without time zone, p_hora_fin time without time zone,
  p_motivo text, p_observaciones text, p_destinatario_id bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_solicitante bigint; v_solicitud_id uuid; v_destinatario public.usuarios_roles%rowtype; v_mensaje text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión para crear una solicitud'; END IF;
  IF NOT (public.usuario_es_admin_principal_2026() OR public.usuario_tiene_alguno_permiso(ARRAY['traslados','amonestaciones'])) THEN RAISE EXCEPTION 'No tienes permiso para crear solicitudes de cobertura'; END IF;
  IF nullif(btrim(p_sucursal_nombre),'') IS NULL THEN RAISE EXCEPTION 'Debes seleccionar una sucursal válida'; END IF;
  IF p_sucursal_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sucursales s WHERE s.id=p_sucursal_id AND s.activa=true AND lower(btrim(s.nombre))=lower(btrim(p_sucursal_nombre))) THEN RAISE EXCEPTION 'La sucursal seleccionada no coincide con una sucursal activa'; END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.sucursales s WHERE s.activa=true AND lower(btrim(s.nombre))=lower(btrim(p_sucursal_nombre))) THEN RAISE EXCEPTION 'La sucursal seleccionada no existe o está inactiva';
  END IF;
  IF NOT private.usuario_puede_ver_sucursal(p_sucursal_id,p_sucursal_nombre) THEN RAISE EXCEPTION 'No tienes acceso autorizado a la sucursal seleccionada'; END IF;
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL OR p_fecha_fin < p_fecha_inicio THEN RAISE EXCEPTION 'El rango de fechas no es válido'; END IF;
  IF coalesce(p_cantidad,0) < 1 THEN RAISE EXCEPTION 'La cantidad de personas debe ser al menos 1'; END IF;
  IF nullif(trim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'El motivo de la necesidad es obligatorio'; END IF;
  SELECT * INTO v_destinatario FROM public.usuarios_roles WHERE id=p_destinatario_id AND activo=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'El usuario destinatario no existe o está inactivo'; END IF;
  v_solicitante := public.chat_usuario_actual_id();
  IF v_solicitante IS NULL THEN RAISE EXCEPTION 'No se pudo identificar tu perfil de usuario'; END IF;
  INSERT INTO public.solicitudes_dotacion(sucursal_id,sucursal_nombre,fecha_inicio,fecha_fin,cantidad,cargo_requerido,turno,hora_inicio,hora_fin,motivo,observaciones,solicitada_por,estado,destinatario_id)
  VALUES(p_sucursal_id,trim(p_sucursal_nombre),p_fecha_inicio,p_fecha_fin,p_cantidad,p_cargo_requerido,p_turno,p_hora_inicio,p_hora_fin,trim(p_motivo),p_observaciones,v_solicitante,'PENDIENTE',p_destinatario_id)
  RETURNING id INTO v_solicitud_id;
  v_mensaje := 'Necesidad de cobertura para '||trim(p_sucursal_nombre)||' ('||p_cargo_requerido||', turno '||p_turno||') desde '||p_fecha_inicio::text||' hasta '||p_fecha_fin::text||'. Cantidad: '||p_cantidad::text||'. Solicitud: '||v_solicitud_id::text||'. Pendiente de buscar y confirmar al colaborador; no es un traslado creado.';
  INSERT INTO public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id,leida) VALUES(p_destinatario_id,'COBERTURA','Nueva necesidad de cobertura',v_mensaje,'solicitudes_dotacion',NULL,false);
  RETURN v_solicitud_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_solicitud_dotacion_con_destinatarios(
  p_sucursal_id uuid, p_sucursal_nombre text, p_fecha_inicio date, p_fecha_fin date,
  p_cantidad integer, p_cargo_requerido text, p_turno text,
  p_hora_inicio time without time zone, p_hora_fin time without time zone,
  p_motivo text, p_observaciones text, p_destinatarios_ids bigint[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_solicitante bigint; v_solicitud_id uuid; v_destinatario_id bigint; v_destinatarios bigint[]; v_total_validos integer; v_mensaje text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión para crear una solicitud'; END IF;
  IF NOT (public.usuario_es_admin_principal_2026() OR public.usuario_tiene_alguno_permiso(ARRAY['traslados','amonestaciones'])) THEN RAISE EXCEPTION 'No tienes permiso para crear solicitudes de cobertura'; END IF;
  IF nullif(btrim(p_sucursal_nombre),'') IS NULL THEN RAISE EXCEPTION 'Debes seleccionar una sucursal válida'; END IF;
  IF p_sucursal_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sucursales s WHERE s.id=p_sucursal_id AND s.activa=true AND lower(btrim(s.nombre))=lower(btrim(p_sucursal_nombre))) THEN RAISE EXCEPTION 'La sucursal seleccionada no coincide con una sucursal activa'; END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.sucursales s WHERE s.activa=true AND lower(btrim(s.nombre))=lower(btrim(p_sucursal_nombre))) THEN RAISE EXCEPTION 'La sucursal seleccionada no existe o está inactiva';
  END IF;
  IF NOT private.usuario_puede_ver_sucursal(p_sucursal_id,p_sucursal_nombre) THEN RAISE EXCEPTION 'No tienes acceso autorizado a la sucursal seleccionada'; END IF;
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL OR p_fecha_fin < p_fecha_inicio THEN RAISE EXCEPTION 'El rango de fechas no es válido'; END IF;
  IF coalesce(p_cantidad,0) < 1 THEN RAISE EXCEPTION 'La cantidad de personas debe ser al menos 1'; END IF;
  IF nullif(trim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'El motivo de la necesidad es obligatorio'; END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_destinatarios FROM unnest(coalesce(p_destinatarios_ids,ARRAY[]::bigint[])) AS x WHERE x IS NOT NULL;
  IF coalesce(cardinality(v_destinatarios),0)=0 THEN RAISE EXCEPTION 'Selecciona al menos un usuario destinatario'; END IF;
  SELECT count(*) INTO v_total_validos FROM public.usuarios_roles ur WHERE ur.id=ANY(v_destinatarios) AND ur.activo=true;
  IF v_total_validos <> cardinality(v_destinatarios) THEN RAISE EXCEPTION 'Uno o más destinatarios no existen o están inactivos'; END IF;
  v_solicitante := public.chat_usuario_actual_id();
  IF v_solicitante IS NULL THEN RAISE EXCEPTION 'No se pudo identificar tu perfil de usuario'; END IF;
  v_destinatario_id := v_destinatarios[1];
  INSERT INTO public.solicitudes_dotacion(sucursal_id,sucursal_nombre,fecha_inicio,fecha_fin,cantidad,cargo_requerido,turno,hora_inicio,hora_fin,motivo,observaciones,solicitada_por,estado,destinatario_id)
  VALUES(p_sucursal_id,trim(p_sucursal_nombre),p_fecha_inicio,p_fecha_fin,p_cantidad,p_cargo_requerido,p_turno,p_hora_inicio,p_hora_fin,trim(p_motivo),p_observaciones,v_solicitante,'PENDIENTE',v_destinatario_id)
  RETURNING id INTO v_solicitud_id;
  INSERT INTO public.solicitud_dotacion_destinatarios(solicitud_id,destinatario_id) SELECT v_solicitud_id,unnest(v_destinatarios);
  v_mensaje := 'Necesidad de cobertura para '||trim(p_sucursal_nombre)||' ('||p_cargo_requerido||', turno '||p_turno||') desde '||p_fecha_inicio::text||' hasta '||p_fecha_fin::text||'. Cantidad: '||p_cantidad::text||'. Solicitud: '||v_solicitud_id::text||'. Pendiente de buscar y confirmar al colaborador; no es un traslado creado.';
  INSERT INTO public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id,leida) SELECT unnest(v_destinatarios),'COBERTURA','Nueva necesidad de cobertura',v_mensaje,'solicitudes_dotacion',NULL,false;
  RETURN v_solicitud_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolver_traslado_personal(p_id uuid, p_estado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE item public.traslados_personal%rowtype; reviewer_id bigint; today_chile date := (now() at time zone 'America/Santiago')::date; applied boolean := false; is_coverage boolean := false;
BEGIN
  IF p_estado NOT IN ('APROBADO','RECHAZADO') THEN RAISE EXCEPTION 'Estado de resolución no válido'; END IF;
  IF NOT (public.usuario_es_admin_principal_2026() OR public.usuario_tiene_permiso('traslados_aprobar')) THEN RAISE EXCEPTION 'No tienes permiso para aprobar o rechazar traslados'; END IF;
  reviewer_id := public.chat_usuario_actual_id();
  SELECT * INTO item FROM public.traslados_personal WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe la solicitud de traslado'; END IF;
  IF item.estado <> 'SOLICITADO' THEN RAISE EXCEPTION 'La solicitud ya fue revisada'; END IF;
  IF NOT private.usuario_puede_ver_sucursal(item.sucursal_origen_id,item.sucursal_origen_nombre) OR NOT private.usuario_puede_ver_sucursal(item.sucursal_destino_id,item.sucursal_destino_nombre) THEN RAISE EXCEPTION 'No tienes acceso a ambas sucursales para resolver este traslado'; END IF;
  is_coverage := coalesce(item.tipo_movimiento,'TRASLADO')='COBERTURA';
  UPDATE public.traslados_personal SET estado=p_estado,revisado_por=reviewer_id,revisado_en=now(),updated_at=now() WHERE id=p_id;
  IF is_coverage AND item.cobertura_id IS NOT NULL THEN UPDATE public.coberturas SET estado_solicitud=CASE WHEN p_estado='APROBADO' THEN 'APROBADA' ELSE 'RECHAZADA' END WHERE id=item.cobertura_id; END IF;
  IF p_estado='APROBADO' AND item.fecha_inicio <= today_chile THEN
    IF NOT is_coverage AND item.colaborador_id IS NOT NULL THEN UPDATE public.colaboradores SET sucursal_id=item.sucursal_destino_id,sucursal=item.sucursal_destino_nombre WHERE id=item.colaborador_id; applied := true; END IF;
    UPDATE public.traslados_personal SET aplicado_en=now(),updated_at=now() WHERE id=p_id;
  END IF;
  INSERT INTO public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
  VALUES(item.solicitado_por,CASE WHEN is_coverage THEN 'COBERTURA_'||p_estado ELSE 'TRASLADO_'||p_estado END,CASE WHEN is_coverage THEN 'Solicitud de cobertura '||lower(p_estado) ELSE 'Solicitud de traslado '||lower(p_estado) END,CASE WHEN is_coverage THEN 'La cobertura temporal de '||item.colaborador_nombre||' en '||item.sucursal_destino_nombre||' fue '||lower(p_estado)||'. La sucursal maestra no se modifica por una cobertura temporal.' ELSE 'La solicitud para '||item.colaborador_nombre||' hacia '||item.sucursal_destino_nombre||' fue '||lower(p_estado)||'.' END,CASE WHEN is_coverage THEN 'cobertura' ELSE 'traslado' END,item.cobertura_id);
  RETURN jsonb_build_object('success',true,'estado',p_estado,'maestro_actualizado',applied,'tipo_movimiento',coalesce(item.tipo_movimiento,'TRASLADO'),'cobertura_temporal',is_coverage);
END;
$function$;
