-- Preview migration: enforce own-history rules for Productivity profiles.
-- Do not apply to the shared production database until the preview is approved.

alter table public.coberturas enable row level security;
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
drop policy if exists simi_propiedad_delete_coberturas on public.coberturas;
drop policy if exists simi_propiedad_insert_coberturas on public.coberturas;
drop policy if exists simi_propiedad_select_coberturas on public.coberturas;
drop policy if exists simi_propiedad_update_coberturas on public.coberturas;

create policy cobertura_select_con_permiso_y_propiedad
on public.coberturas for select to authenticated
using (
  usuario_es_admin_principal_2026()
  or (
    usuario_tiene_alguno_permiso(array['coberturas','amonestaciones']::text[])
    and (
      (private.usuario_es_perfil_productividad()
        and creado_por_rol_id = chat_usuario_actual_id())
      or
      (not private.usuario_es_perfil_productividad()
        and (
          private.usuario_puede_ver_sucursal(null::uuid, local_origen)
          or private.usuario_puede_ver_sucursal(null::uuid, local_destino)
        ))
    )
  )
);

create policy cobertura_insert_con_propiedad
on public.coberturas for insert to authenticated
with check (
  usuario_es_admin_principal_2026()
  or (
    usuario_tiene_alguno_permiso(array['coberturas','amonestaciones']::text[])
    and creado_por_rol_id = chat_usuario_actual_id()
    and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
    and private.usuario_puede_ver_sucursal(null::uuid, local_destino)
  )
);

create policy cobertura_update_con_propiedad
on public.coberturas for update to authenticated
using (
  usuario_es_admin_principal_2026()
  or (
    usuario_tiene_alguno_permiso(array['coberturas','amonestaciones']::text[])
    and (
      (private.usuario_es_perfil_productividad()
        and creado_por_rol_id = chat_usuario_actual_id())
      or
      (not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
        and private.usuario_puede_ver_sucursal(null::uuid, local_destino))
    )
  )
)
with check (
  usuario_es_admin_principal_2026()
  or (
    usuario_tiene_alguno_permiso(array['coberturas','amonestaciones']::text[])
    and (
      (private.usuario_es_perfil_productividad()
        and creado_por_rol_id = chat_usuario_actual_id())
      or
      (not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
        and private.usuario_puede_ver_sucursal(null::uuid, local_destino))
    )
  )
);

create policy cobertura_delete_con_propiedad
on public.coberturas for delete to authenticated
using (
  usuario_es_admin_principal_2026()
  or (
    usuario_tiene_alguno_permiso(array['coberturas','amonestaciones']::text[])
    and (
      (private.usuario_es_perfil_productividad()
        and creado_por_rol_id = chat_usuario_actual_id())
      or
      (not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
        and private.usuario_puede_ver_sucursal(null::uuid, local_destino))
    )
  )
);

-- The broad branch-scope policy previously granted access to all rows when
-- combined with the owner-only policy. Replace it with a single combined rule.
drop policy if exists scope_sucursal_solicitudes_dotacion_2026 on public.solicitudes_dotacion;
drop policy if exists solicitudes_dotacion_select_2026 on public.solicitudes_dotacion;
drop policy if exists solicitudes_dotacion_select_asignados on public.solicitudes_dotacion;
drop policy if exists solicitudes_dotacion_insert_2026 on public.solicitudes_dotacion;
drop policy if exists solicitudes_dotacion_update_2026 on public.solicitudes_dotacion;
drop policy if exists solicitudes_dotacion_delete_2026 on public.solicitudes_dotacion;

create policy solicitudes_dotacion_select_propias_o_por_sucursal
on public.solicitudes_dotacion for select to authenticated
using (
  usuario_es_admin_principal_2026()
  or (
    private.usuario_es_perfil_productividad()
    and (
      solicitada_por = chat_usuario_actual_id()
      or exists (
        select 1 from public.solicitud_dotacion_responsables r
        where r.solicitud_id = solicitudes_dotacion.id
          and r.usuario_rol_id = chat_usuario_actual_id()
      )
    )
  )
  or (
    not private.usuario_es_perfil_productividad()
    and usuario_tiene_alguno_permiso(array['traslados','coberturas','amonestaciones']::text[])
    and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
  )
);

create policy solicitudes_dotacion_insert_propias
on public.solicitudes_dotacion for insert to authenticated
with check (
  usuario_es_admin_principal_2026()
  or (
    usuario_tiene_alguno_permiso(array['traslados','coberturas','amonestaciones']::text[])
    and solicitada_por = chat_usuario_actual_id()
    and estado = 'PENDIENTE'
    and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
  )
);

create policy solicitudes_dotacion_update_propias_o_aprobador
on public.solicitudes_dotacion for update to authenticated
using (
  usuario_es_admin_principal_2026()
  or (
    private.usuario_es_perfil_productividad()
    and solicitada_por = chat_usuario_actual_id()
    and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
  )
  or (
    not private.usuario_es_perfil_productividad()
    and usuario_tiene_permiso('traslados_aprobar')
    and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
  )
)
with check (
  usuario_es_admin_principal_2026()
  or (
    private.usuario_es_perfil_productividad()
    and solicitada_por = chat_usuario_actual_id()
    and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
  )
  or (
    not private.usuario_es_perfil_productividad()
    and usuario_tiene_permiso('traslados_aprobar')
    and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
  )
);

create policy solicitudes_dotacion_delete_propias_o_admin
on public.solicitudes_dotacion for delete to authenticated
using (
  usuario_es_admin_principal_2026()
  or (
    private.usuario_es_perfil_productividad()
    and solicitada_por = chat_usuario_actual_id()
  )
  or (
    not private.usuario_es_perfil_productividad()
    and usuario_tiene_alguno_permiso(array['traslados','coberturas','amonestaciones']::text[])
    and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
  )
);

-- Allow an authorized creator to assign the selected responsible users to their own alert.
drop policy if exists deny_direct_access_coverage_recipients on public.solicitud_dotacion_responsables;
drop policy if exists solicitud_dotacion_responsables_select on public.solicitud_dotacion_responsables;
drop policy if exists solicitud_dotacion_responsables_insert_own on public.solicitud_dotacion_responsables;

create policy solicitud_dotacion_responsables_select_own_or_admin
on public.solicitud_dotacion_responsables for select to authenticated
using (
  usuario_es_admin_principal_2026()
  or usuario_rol_id = chat_usuario_actual_id()
  or asignado_por = chat_usuario_actual_id()
  or exists (
    select 1 from public.solicitudes_dotacion s
    where s.id = solicitud_dotacion_responsables.solicitud_id
      and s.solicitada_por = chat_usuario_actual_id()
  )
  or (
    not private.usuario_es_perfil_productividad()
    and usuario_tiene_alguno_permiso(array['traslados','coberturas','amonestaciones']::text[])
  )
);

create policy solicitud_dotacion_responsables_insert_own
on public.solicitud_dotacion_responsables for insert to authenticated
with check (
  asignado_por = chat_usuario_actual_id()
  and usuario_tiene_alguno_permiso(array['traslados','coberturas','amonestaciones']::text[])
  and exists (
    select 1 from public.solicitudes_dotacion s
    where s.id = solicitud_dotacion_responsables.solicitud_id
      and (
        s.solicitada_por = chat_usuario_actual_id()
        or usuario_es_admin_principal_2026()
      )
  )
);
