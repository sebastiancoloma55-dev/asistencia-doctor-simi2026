drop policy if exists solicitudes_dotacion_update_2026 on public.solicitudes_dotacion;
create policy solicitudes_dotacion_update_2026 on public.solicitudes_dotacion
for update to authenticated
using (public.usuario_es_admin_principal_2026() or public.usuario_tiene_permiso('traslados_aprobar'))
with check (public.usuario_es_admin_principal_2026() or public.usuario_tiene_permiso('traslados_aprobar'));

create or replace function public.notificar_cambios_solicitud_dotacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
  v_mensaje text;
begin
  if tg_op = 'INSERT' then
    v_titulo := 'Nueva necesidad de cobertura';
    v_mensaje := 'Sucursal: ' || new.sucursal_nombre || '. Cargo: ' || new.cargo_requerido || '. Turno: ' || new.turno || '. Período: ' || new.fecha_inicio::text || ' a ' || new.fecha_fin::text || '. Cantidad: ' || new.cantidad::text || '. Motivo: ' || new.motivo;
    insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,leida)
    select u.id,'COBERTURA_DOTACION',v_titulo,v_mensaje,'solicitud_dotacion',false
    from public.usuarios_roles u
    where coalesce(u.activo,true)
      and u.id <> new.solicitada_por
      and (coalesce(u.permisos,'[]'::jsonb) ?| array['traslados','coberturas'] or lower(coalesce(u.email,''))='scoloma@farmaciasdoctorsimi.cl');
    return new;
  end if;
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    v_titulo := case when new.estado='APROBADA' then 'Necesidad de cobertura aprobada' when new.estado='RECHAZADA' then 'Necesidad de cobertura rechazada' else 'Actualización de necesidad de cobertura' end;
    v_mensaje := 'Tu solicitud para ' || new.sucursal_nombre || ' (' || new.fecha_inicio::text || ' a ' || new.fecha_fin::text || ') cambió a estado: ' || new.estado || '.';
    insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,leida)
    values(new.solicitada_por,'COBERTURA_DOTACION',v_titulo,v_mensaje,'solicitud_dotacion',false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificar_solicitud_dotacion on public.solicitudes_dotacion;
create trigger trg_notificar_solicitud_dotacion
after insert or update of estado on public.solicitudes_dotacion
for each row execute function public.notificar_cambios_solicitud_dotacion();
