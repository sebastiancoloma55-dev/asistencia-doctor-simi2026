-- Restrict freshness metadata to users who can access the corresponding HR module.
drop policy if exists actualizaciones_fuentes_select_authenticated on public.actualizaciones_fuentes;
drop policy if exists actualizaciones_fuentes_insert_authenticated on public.actualizaciones_fuentes;
drop policy if exists actualizaciones_fuentes_update_authenticated on public.actualizaciones_fuentes;

create policy actualizaciones_fuentes_select_by_module on public.actualizaciones_fuentes
for select to authenticated using (
  public.usuario_es_admin_principal_2026()
  or (modulo = 'colaboradores' and public.usuario_tiene_permiso('colaboradores'))
  or (modulo = 'sucursales' and public.usuario_tiene_permiso('sucursales'))
  or (modulo = 'config_sucursales' and public.usuario_tiene_alguno_permiso(array['mapas','sucursales']))
  or (modulo = 'config_correos' and public.usuario_tiene_alguno_permiso(array['configcorreos','correos']))
  or (modulo = 'asistencia' and public.usuario_tiene_permiso('asistencia'))
  or (modulo = 'licencias' and public.usuario_tiene_permiso('licencias'))
  or (modulo = 'vacaciones' and public.usuario_tiene_permiso('vacaciones'))
);

create policy actualizaciones_fuentes_insert_by_module on public.actualizaciones_fuentes
for insert to authenticated with check (
  public.usuario_es_admin_principal_2026()
  or (modulo = 'colaboradores' and public.usuario_tiene_permiso('colaboradores'))
  or (modulo = 'sucursales' and public.usuario_tiene_permiso('sucursales'))
  or (modulo = 'config_sucursales' and public.usuario_tiene_alguno_permiso(array['mapas','sucursales']))
  or (modulo = 'config_correos' and public.usuario_tiene_alguno_permiso(array['configcorreos','correos']))
  or (modulo = 'asistencia' and public.usuario_tiene_permiso('asistencia'))
  or (modulo = 'licencias' and public.usuario_tiene_permiso('licencias'))
  or (modulo = 'vacaciones' and public.usuario_tiene_permiso('vacaciones'))
);

create policy actualizaciones_fuentes_update_by_module on public.actualizaciones_fuentes
for update to authenticated using (
  public.usuario_es_admin_principal_2026()
  or (modulo = 'colaboradores' and public.usuario_tiene_permiso('colaboradores'))
  or (modulo = 'sucursales' and public.usuario_tiene_permiso('sucursales'))
  or (modulo = 'config_sucursales' and public.usuario_tiene_alguno_permiso(array['mapas','sucursales']))
  or (modulo = 'config_correos' and public.usuario_tiene_alguno_permiso(array['configcorreos','correos']))
  or (modulo = 'asistencia' and public.usuario_tiene_permiso('asistencia'))
  or (modulo = 'licencias' and public.usuario_tiene_permiso('licencias'))
  or (modulo = 'vacaciones' and public.usuario_tiene_permiso('vacaciones'))
) with check (
  public.usuario_es_admin_principal_2026()
  or (modulo = 'colaboradores' and public.usuario_tiene_permiso('colaboradores'))
  or (modulo = 'sucursales' and public.usuario_tiene_permiso('sucursales'))
  or (modulo = 'config_sucursales' and public.usuario_tiene_alguno_permiso(array['mapas','sucursales']))
  or (modulo = 'config_correos' and public.usuario_tiene_alguno_permiso(array['configcorreos','correos']))
  or (modulo = 'asistencia' and public.usuario_tiene_permiso('asistencia'))
  or (modulo = 'licencias' and public.usuario_tiene_permiso('licencias'))
  or (modulo = 'vacaciones' and public.usuario_tiene_permiso('vacaciones'))
);

grant select, insert, update on public.actualizaciones_fuentes to authenticated;
grant all on public.actualizaciones_fuentes to service_role;
