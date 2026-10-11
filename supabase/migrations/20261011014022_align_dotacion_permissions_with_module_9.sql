drop policy if exists solicitudes_dotacion_select_2026 on public.solicitudes_dotacion;
create policy solicitudes_dotacion_select_2026 on public.solicitudes_dotacion for select to authenticated
using (public.usuario_es_admin_principal_2026() or public.usuario_tiene_alguno_permiso(array['traslados','amonestaciones']::text[]));
drop policy if exists solicitudes_dotacion_insert_2026 on public.solicitudes_dotacion;
create policy solicitudes_dotacion_insert_2026 on public.solicitudes_dotacion for insert to authenticated
with check ((public.usuario_es_admin_principal_2026() or public.usuario_tiene_alguno_permiso(array['traslados','amonestaciones']::text[])) and solicitada_por = public.chat_usuario_actual_id() and estado = 'PENDIENTE');
create or replace function public.notificar_cambios_solicitud_dotacion()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_titulo text; v_mensaje text;
begin
  if tg_op = 'INSERT' then
    v_titulo := 'Nueva necesidad de cobertura';
    v_mensaje := 'Sucursal: ' || new.sucursal_nombre || '. Cargo: ' || new.cargo_requerido || '. Turno: ' || new.turno || '. Período: ' || new.fecha_inicio::text || ' a ' || new.fecha_fin::text || '. Cantidad: ' || new.cantidad::text || '. Motivo: ' || new.motivo;
    insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,leida)
    select u.id,'COBERTURA_DOTACION',v_titulo,v_mensaje,'solicitud_dotacion',false
    from public.usuarios_roles u
    where coalesce(u.activo,true) and u.id <> new.solicitada_por
      and (coalesce(u.permisos,'[]'::jsonb) ?| array['traslados','amonestaciones'] or lower(coalesce(u.email,''))='scoloma@farmaciasdoctorsimi.cl');
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
drop policy if exists permiso_modulo_select_2026 on public.notificaciones;
create policy permiso_modulo_select_2026 on public.notificaciones for select to authenticated
using ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','amonestaciones']::text[]));
drop policy if exists permiso_modulo_update_2026 on public.notificaciones;
create policy permiso_modulo_update_2026 on public.notificaciones for update to authenticated
using ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','amonestaciones']::text[]))
with check ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','amonestaciones']::text[]));
drop policy if exists permiso_modulo_insert_2026 on public.notificaciones;
create policy permiso_modulo_insert_2026 on public.notificaciones for insert to authenticated
with check ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','amonestaciones']::text[]));
drop policy if exists permiso_modulo_delete_2026 on public.notificaciones;
create policy permiso_modulo_delete_2026 on public.notificaciones for delete to authenticated
using ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','amonestaciones']::text[]));
