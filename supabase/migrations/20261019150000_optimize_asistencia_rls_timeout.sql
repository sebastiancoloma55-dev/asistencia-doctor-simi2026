-- Optimize branch-scoped RLS for attendance history timeouts.
-- Keeps module permission policies and branch restrictions in force.
begin;

drop policy if exists scope_sucursal_asistencia_2026 on public.registros_asistencia;

create policy scope_sucursal_asistencia_20261019
on public.registros_asistencia
as restrictive
for all
to authenticated
using (
  (select public.usuario_es_admin_principal_2026())
  or lower(btrim(sucursal)) = any (
    coalesce((select private.usuario_sucursales_visibles()), array[]::text[])
  )
)
with check (
  (select public.usuario_es_admin_principal_2026())
  or lower(btrim(sucursal)) = any (
    coalesce((select private.usuario_sucursales_visibles()), array[]::text[])
  )
);

create index if not exists idx_registros_asistencia_sucursal_lower
on public.registros_asistencia (lower(btrim(sucursal)));

commit;
