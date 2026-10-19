-- Optimize branch-scoped reads for medical leave history.
-- IMPORTANT: review and validate with test users before applying to production.
begin;

-- Materialize the user's allowed branch names once per statement rather than
-- re-running a correlated SECURITY DEFINER branch lookup for every history row.
create or replace function private.usuario_sucursales_visibles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(array_agg(distinct lower(btrim(s.nombre))), array[]::text[])
  from public.sucursales s
  where exists (
    select 1
    from public.usuarios_roles u
    where u.activo = true
      and (
        u.auth_user_id = (select auth.uid())
        or lower(u.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
      and u.acceso_global = true
  )
  or exists (
    select 1
    from public.usuarios_roles u
    join public.usuarios_sucursales us on us.usuario_rol_id = u.id
    where u.activo = true
      and (
        u.auth_user_id = (select auth.uid())
        or lower(u.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
      and us.sucursal_id = s.id
  );
$function$;

revoke all on function private.usuario_sucursales_visibles() from public;
revoke all on function private.usuario_sucursales_visibles() from anon;
grant execute on function private.usuario_sucursales_visibles() to authenticated;

-- The existing branch policy invokes a row-correlated helper for each record.
-- Replace the SELECT path with a branch-array check while preserving module access.
drop policy if exists permisos_usuario_select_2026 on public.licencias_medicas;
drop policy if exists permiso_modulo_select_2026 on public.licencias_medicas;
drop policy if exists scope_sucursal_licencias_2026 on public.licencias_medicas;

create policy licencias_select_authorized_20261019
on public.licencias_medicas
for select to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['licencias','reportes']::text[])
  and (
    public.usuario_es_admin_principal_2026()
    or lower(btrim(sucursal)) = any (coalesce((select private.usuario_sucursales_visibles()), array[]::text[]))
  )
);

-- Recreate write policies so removing the old ALL policy cannot remove scope checks.
drop policy if exists permisos_usuario_insert_2026 on public.licencias_medicas;
drop policy if exists permiso_modulo_insert_2026 on public.licencias_medicas;
drop policy if exists permisos_usuario_update_2026 on public.licencias_medicas;
drop policy if exists permiso_modulo_update_2026 on public.licencias_medicas;
drop policy if exists permisos_usuario_delete_2026 on public.licencias_medicas;
drop policy if exists permiso_modulo_delete_2026 on public.licencias_medicas;

create policy licencias_insert_authorized_20261019
on public.licencias_medicas
for insert to authenticated
with check (
  public.usuario_tiene_alguno_permiso(array['licencias']::text[])
  and (
    public.usuario_es_admin_principal_2026()
    or lower(btrim(sucursal)) = any (coalesce((select private.usuario_sucursales_visibles()), array[]::text[]))
  )
);

create policy licencias_update_authorized_20261019
on public.licencias_medicas
for update to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['licencias']::text[])
  and (
    public.usuario_es_admin_principal_2026()
    or lower(btrim(sucursal)) = any (coalesce((select private.usuario_sucursales_visibles()), array[]::text[]))
  )
)
with check (
  public.usuario_tiene_alguno_permiso(array['licencias']::text[])
  and (
    public.usuario_es_admin_principal_2026()
    or lower(btrim(sucursal)) = any (coalesce((select private.usuario_sucursales_visibles()), array[]::text[]))
  )
);

create policy licencias_delete_authorized_20261019
on public.licencias_medicas
for delete to authenticated
using (
  public.usuario_tiene_alguno_permiso(array['licencias']::text[])
  and (
    public.usuario_es_admin_principal_2026()
    or lower(btrim(sucursal)) = any (coalesce((select private.usuario_sucursales_visibles()), array[]::text[]))
  )
);

create index if not exists idx_licencias_medicas_sucursal_lower
on public.licencias_medicas (lower(btrim(sucursal)));

commit;
