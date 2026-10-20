-- Restringe historial de coberturas/solicitudes para perfiles de Productividad.
-- Importante: las políticas permisivas de PostgreSQL se combinan con OR;
-- por eso se eliminan las políticas anteriores amplias antes de crear las nuevas.

alter table public.coberturas enable row level security;
drop policy if exists coberturas_select on public.coberturas;
drop policy if exists permiso_modulo_select_2026 on public.coberturas;
drop policy if exists scope_coberturas_select_2026 on public.coberturas;
drop policy if exists simi_propiedad_select_coberturas on public.coberturas;
drop policy if exists coberturas_insert on public.coberturas;
drop policy if exists permiso_modulo_insert_2026 on public.coberturas;
drop policy if exists scope_coberturas_insert_2026 on public.coberturas;
drop policy if exists simi_propiedad_insert_coberturas on public.coberturas;
drop policy if exists coberturas_update on public.coberturas;
drop policy if exists permiso_modulo_update_2026 on public.coberturas;
drop policy if exists scope_coberturas_update_2026 on public.coberturas;
drop policy if exists simi_propiedad_update_coberturas on public.coberturas;
drop policy if exists permiso_modulo_delete_2026 on public.coberturas;
drop policy if exists scope_coberturas_delete_2026 on public.coberturas;
drop policy if exists simi_propiedad_delete_coberturas on public.coberturas;

create policy coberturas_select_own_or_authorized on public.coberturas
for select to authenticated
using (
  public.usuario_es_admin_principal_2026()
  or (
    public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
    and (
      (private.usuario_es_perfil_productividad() and creado_por_rol_id = public.chat_usuario_actual_id())
      or
      (not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
        and private.usuario_puede_ver_sucursal(null::uuid, local_destino))
    )
  )
);

create policy coberturas_insert_own_or_authorized on public.coberturas
for insert to authenticated
with check (
  public.usuario_es_admin_principal_2026()
  or (
    public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
    and (
      (private.usuario_es_perfil_productividad() and creado_por_rol_id = public.chat_usuario_actual_id())
      or
      (not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
        and private.usuario_puede_ver_sucursal(null::uuid, local_destino))
    )
  )
);

create policy coberturas_update_own_or_authorized on public.coberturas
for update to authenticated
using (
  public.usuario_es_admin_principal_2026()
  or (
    public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
    and (
      (private.usuario_es_perfil_productividad() and creado_por_rol_id = public.chat_usuario_actual_id())
      or
      (not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
        and private.usuario_puede_ver_sucursal(null::uuid, local_destino))
    )
  )
)
with check (
  public.usuario_es_admin_principal_2026()
  or (
    public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
    and (
      (private.usuario_es_perfil_productividad() and creado_por_rol_id = public.chat_usuario_actual_id())
      or
      (not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
        and private.usuario_puede_ver_sucursal(null::uuid, local_destino))
    )
  )
);

create policy coberturas_delete_own_or_authorized on public.coberturas
for delete to authenticated
using (
  public.usuario_es_admin_principal_2026()
  or (
    public.usuario_tiene_alguno_permiso(array['coberturas']::text[])
    and (
      (private.usuario_es_perfil_productividad() and creado_por_rol_id = public.chat_usuario_actual_id())
      or
      (not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(null::uuid, local_origen)
        and private.usuario_puede_ver_sucursal(null::uuid, local_destino))
    )
  )
);

-- Solicitudes: perfiles de Productividad ven las que crearon o las que les asignaron.
alter table public.solicitudes_dotacion enable row level security;
drop policy if exists scope_sucursal_solicitudes_dotacion_2026 on public.solicitudes_dotacion;
drop policy if exists solicitudes_dotacion_insert_2026 on public.solicitudes_dotacion;
drop policy if exists solicitudes_dotacion_select_2026 on public.solicitudes_dotacion;
drop policy if exists solicitudes_dotacion_select_asignados on public.solicitudes_dotacion;
drop policy if exists solicitudes_dotacion_update_2026 on public.solicitudes_dotacion;

create policy solicitudes_dotacion_select_own_or_assigned on public.solicitudes_dotacion
for select to authenticated
using (
  public.usuario_es_admin_principal_2026()
  or (
    public.usuario_tiene_alguno_permiso(array['coberturas','traslados']::text[])
    and (
      (
        private.usuario_es_perfil_productividad()
        and (
          solicitada_por = public.chat_usuario_actual_id()
          or exists (
            select 1 from public.solicitud_dotacion_responsables r
            where r.solicitud_id = solicitudes_dotacion.id
              and r.usuario_rol_id = public.chat_usuario_actual_id()
          )
        )
      )
      or (
        not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
      )
    )
  )
);

create policy solicitudes_dotacion_insert_own on public.solicitudes_dotacion
for insert to authenticated
with check (
  public.usuario_es_admin_principal_2026()
  or (
    public.usuario_tiene_alguno_permiso(array['coberturas','traslados']::text[])
    and solicitada_por = public.chat_usuario_actual_id()
    and estado = 'PENDIENTE'
    and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
  )
);

create policy solicitudes_dotacion_update_own_or_assigned on public.solicitudes_dotacion
for update to authenticated
using (
  public.usuario_es_admin_principal_2026()
  or (
    public.usuario_tiene_alguno_permiso(array['coberturas','traslados']::text[])
    and (
      (
        private.usuario_es_perfil_productividad()
        and (
          solicitada_por = public.chat_usuario_actual_id()
          or exists (
            select 1 from public.solicitud_dotacion_responsables r
            where r.solicitud_id = solicitudes_dotacion.id
              and r.usuario_rol_id = public.chat_usuario_actual_id()
          )
        )
      )
      or (
        not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
      )
    )
  )
)
with check (
  public.usuario_es_admin_principal_2026()
  or (
    public.usuario_tiene_alguno_permiso(array['coberturas','traslados']::text[])
    and (
      (
        private.usuario_es_perfil_productividad()
        and (
          solicitada_por = public.chat_usuario_actual_id()
          or exists (
            select 1 from public.solicitud_dotacion_responsables r
            where r.solicitud_id = solicitudes_dotacion.id
              and r.usuario_rol_id = public.chat_usuario_actual_id()
          )
        )
      )
      or (
        not private.usuario_es_perfil_productividad()
        and private.usuario_puede_ver_sucursal(sucursal_id, sucursal_nombre)
      )
    )
  )
);
