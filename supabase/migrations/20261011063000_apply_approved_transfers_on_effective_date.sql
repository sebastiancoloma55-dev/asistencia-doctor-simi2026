alter table public.traslados_personal
  add column if not exists aplicado_en timestamptz;

create or replace function public.resolver_traslado_personal(p_id uuid, p_estado text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.traslados_personal%rowtype;
  reviewer_id bigint;
  today_chile date := (now() at time zone 'America/Santiago')::date;
  applied boolean := false;
begin
  if p_estado not in ('APROBADO','RECHAZADO') then raise exception 'Estado de resolución no válido'; end if;
  if not (public.usuario_es_admin_principal_2026() or public.usuario_tiene_permiso('traslados_aprobar')) then
    raise exception 'No tienes permiso para aprobar o rechazar traslados';
  end if;
  reviewer_id := public.chat_usuario_actual_id();
  select * into item from public.traslados_personal where id=p_id for update;
  if not found then raise exception 'No existe la solicitud de traslado'; end if;
  if item.estado <> 'SOLICITADO' then raise exception 'La solicitud ya fue revisada'; end if;

  update public.traslados_personal
    set estado=p_estado, revisado_por=reviewer_id, revisado_en=now(), updated_at=now()
    where id=p_id;

  if p_estado='APROBADO' and item.fecha_inicio <= today_chile then
    if item.colaborador_id is not null then
      update public.colaboradores set sucursal_id=item.sucursal_destino_id, sucursal=item.sucursal_destino_nombre
      where id=item.colaborador_id;
    end if;
    update public.traslados_personal set aplicado_en=now() where id=p_id;
    applied := true;
  end if;

  insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
  values(item.solicitado_por,'TRASLADO_'||p_estado,'Solicitud de traslado '||lower(p_estado),
    'La solicitud para '||item.colaborador_nombre||' hacia '||item.sucursal_destino_nombre||
    ' fue '||lower(p_estado)||'.','traslado',null);

  return jsonb_build_object('success',true,'estado',p_estado,'maestro_actualizado',applied);
end;
$$;

create or replace function public.aplicar_traslados_personal_vigentes()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.traslados_personal%rowtype;
  total integer := 0;
  today_chile date := (now() at time zone 'America/Santiago')::date;
begin
  for item in
    select * from public.traslados_personal
    where estado='APROBADO' and aplicado_en is null and fecha_inicio <= today_chile
    order by fecha_inicio, created_at
    for update skip locked
  loop
    if item.colaborador_id is not null then
      update public.colaboradores
      set sucursal_id=item.sucursal_destino_id, sucursal=item.sucursal_destino_nombre
      where id=item.colaborador_id;
    end if;
    update public.traslados_personal set aplicado_en=now(), updated_at=now() where id=item.id;
    insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
    values(item.solicitado_por,'TRASLADO_APLICADO','Traslado aplicado',
      'El traslado aprobado de '||item.colaborador_nombre||' a '||item.sucursal_destino_nombre||
      ' entró en vigencia y fue aplicado al maestro de personal.','traslado',null);
    total := total + 1;
  end loop;
  return total;
end;
$$;
revoke all on function public.aplicar_traslados_personal_vigentes() from public, anon, authenticated;
grant execute on function public.aplicar_traslados_personal_vigentes() to service_role;
