-- OWASP Top 10 hardening: remove permissive RLS policies that override module/sucursal restrictions.
-- Review and test in a preview/staging database before applying to production.
begin;

-- Audit trail: authenticated users with audit permission may read; only the principal admin may update/delete.
drop policy if exists auditoria_eventos_select on public.auditoria_eventos;
drop policy if exists auditoria_eventos_update on public.auditoria_eventos;
-- Keep auditoria_eventos_insert_identity_2026, permiso_admin_principal_select_2026,
-- permiso_admin_principal_update_2026 and permiso_admin_principal_delete_2026.

-- Coberturas: module permission AND branch scope must both pass.
drop policy if exists coberturas_insert on public.coberturas;
drop policy if exists coberturas_select on public.coberturas;
drop policy if exists coberturas_update on public.coberturas;
drop policy if exists permiso_modulo_delete_2026 on public.coberturas;
drop policy if exists permiso_modulo_insert_2026 on public.coberturas;
drop policy if exists permiso_modulo_select_2026 on public.coberturas;
drop policy if exists permiso_modulo_update_2026 on public.coberturas;
drop policy if exists scope_coberturas_delete_2026 on public.coberturas;
drop policy if exists scope_coberturas_insert_2026 on public.coberturas;
drop policy if exists scope_coberturas_select_2026 on public.coberturas;
drop policy if exists scope_coberturas_update_2026 on public.coberturas;

create policy coberturas_select_authorized_2026 on public.coberturas
for select to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
  and (
    private.usuario_puede_ver_sucursal(null::uuid, local_origen)
    or private.usuario_puede_ver_sucursal(null::uuid, local_destino)
  )
);
create policy coberturas_insert_authorized_2026 on public.coberturas
for insert to authenticated
with check (
  public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
  and private.usuario_puede_ver_sucursal(null::uuid, local_destino)
);
create policy coberturas_update_authorized_2026 on public.coberturas
for update to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
  and private.usuario_puede_ver_sucursal(null::uuid, local_destino)
)
with check (
  public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
  and private.usuario_puede_ver_sucursal(null::uuid, local_destino)
);
create policy coberturas_delete_authorized_2026 on public.coberturas
for delete to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
  and private.usuario_puede_ver_sucursal(null::uuid, local_destino)
);

-- Papeletas: eliminate the legacy ALL policy and broad CRUD policies.
-- Deletes remain restricted to the principal administrator, as the existing policy intended.
drop policy if exists scope_papeletas_permiso_legacy_2026 on public.papeletas_permiso;
drop policy if exists papeletas_permiso_insert on public.papeletas_permiso;
drop policy if exists papeletas_permiso_select on public.papeletas_permiso;
drop policy if exists papeletas_permiso_update on public.papeletas_permiso;
drop policy if exists permiso_modulo_insert_2026 on public.papeletas_permiso;
drop policy if exists permiso_modulo_select_2026 on public.papeletas_permiso;
drop policy if exists permiso_modulo_update_2026 on public.papeletas_permiso;

create policy papeletas_select_authorized_2026 on public.papeletas_permiso
for select to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['papeletas','reportes']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, sucursal)
);
create policy papeletas_insert_authorized_2026 on public.papeletas_permiso
for insert to authenticated
with check (
  public.usuario_tiene_alguno_permiso(array['papeletas']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, sucursal)
);
create policy papeletas_update_authorized_2026 on public.papeletas_permiso
for update to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['papeletas']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, sucursal)
)
with check (
  public.usuario_tiene_alguno_permiso(array['papeletas']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, sucursal)
);
-- Keep papeletas_delete_admin_principal_only.

-- Trigger-only SECURITY DEFINER functions were flagged by the advisor because of default EXECUTE grants.
-- They are trigger handlers, not intended public RPC endpoints. All relation references in these bodies
-- are schema-qualified; empty search_path prevents object-shadowing attacks.
alter function public.notificar_asignacion_tarea() set search_path = '';
alter function public.tg_auditar_envio_licencia_manual() set search_path = '';

-- Vacation history: permission and branch scope are checked together for every operation.
drop policy if exists scope_sucursal_vacaciones_2026 on public.vacaciones_historico;
drop policy if exists permiso_modulo_delete_2026 on public.vacaciones_historico;
drop policy if exists permiso_modulo_insert_2026 on public.vacaciones_historico;
drop policy if exists permiso_modulo_select_2026 on public.vacaciones_historico;
drop policy if exists permiso_modulo_update_2026 on public.vacaciones_historico;
drop policy if exists vacaciones_historico_insert on public.vacaciones_historico;
drop policy if exists vacaciones_historico_select on public.vacaciones_historico;
drop policy if exists vacaciones_historico_update on public.vacaciones_historico;

create policy vacaciones_historico_select_authorized_2026 on public.vacaciones_historico
for select to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['vacaciones','reportes']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, sucursal)
);
create policy vacaciones_historico_insert_authorized_2026 on public.vacaciones_historico
for insert to authenticated
with check (
  public.usuario_tiene_alguno_permiso(array['vacaciones']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, sucursal)
);
create policy vacaciones_historico_update_authorized_2026 on public.vacaciones_historico
for update to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['vacaciones']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, sucursal)
)
with check (
  public.usuario_tiene_alguno_permiso(array['vacaciones']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, sucursal)
);
create policy vacaciones_historico_delete_authorized_2026 on public.vacaciones_historico
for delete to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['vacaciones']::text[])
  and private.usuario_puede_ver_sucursal(null::uuid, sucursal)
);

commit;
