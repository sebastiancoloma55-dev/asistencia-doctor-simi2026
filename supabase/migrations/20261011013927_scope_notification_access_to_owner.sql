drop policy if exists permiso_modulo_select_2026 on public.notificaciones;
create policy permiso_modulo_select_2026 on public.notificaciones for select to authenticated
using ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','coberturas']::text[]));
drop policy if exists permiso_modulo_update_2026 on public.notificaciones;
create policy permiso_modulo_update_2026 on public.notificaciones for update to authenticated
using ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','coberturas']::text[]))
with check ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','coberturas']::text[]));
drop policy if exists permiso_modulo_insert_2026 on public.notificaciones;
create policy permiso_modulo_insert_2026 on public.notificaciones for insert to authenticated
with check ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','coberturas']::text[]));
drop policy if exists permiso_modulo_delete_2026 on public.notificaciones;
create policy permiso_modulo_delete_2026 on public.notificaciones for delete to authenticated
using ((public.usuario_es_admin() or usuario_rol_id = public.usuario_rol_actual_id()) and public.usuario_tiene_alguno_permiso(array['tareas','traslados','coberturas']::text[]));
