create table if not exists public.solicitudes_dotacion (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid references public.sucursales(id) on delete set null,
  sucursal_nombre text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  cantidad integer not null default 1 check (cantidad between 1 and 100),
  cargo_requerido text not null default 'AF' check (cargo_requerido in ('QF','AF','OTRO')),
  turno text not null check (turno in ('AM','PM','COMPLETO','FLEXIBLE')),
  hora_inicio time,
  hora_fin time,
  motivo text not null,
  observaciones text,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','APROBADA','RECHAZADA','CANCELADA','CUBIERTA')),
  solicitada_por bigint not null references public.usuarios_roles(id),
  revisada_por bigint references public.usuarios_roles(id),
  revisada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solicitudes_dotacion_fechas_validas check (fecha_fin >= fecha_inicio),
  constraint solicitudes_dotacion_horas_validas check (hora_inicio is null or hora_fin is null or hora_fin > hora_inicio)
);
create index if not exists solicitudes_dotacion_estado_fecha_idx on public.solicitudes_dotacion (estado, fecha_inicio, fecha_fin);
create index if not exists solicitudes_dotacion_sucursal_fecha_idx on public.solicitudes_dotacion (sucursal_id, fecha_inicio);
alter table public.solicitudes_dotacion enable row level security;
drop policy if exists solicitudes_dotacion_select_2026 on public.solicitudes_dotacion;
create policy solicitudes_dotacion_select_2026 on public.solicitudes_dotacion for select to authenticated using (public.usuario_es_admin_principal_2026() or public.usuario_tiene_alguno_permiso(array['traslados','coberturas']::text[]));
drop policy if exists solicitudes_dotacion_insert_2026 on public.solicitudes_dotacion;
create policy solicitudes_dotacion_insert_2026 on public.solicitudes_dotacion for insert to authenticated with check ((public.usuario_es_admin_principal_2026() or public.usuario_tiene_alguno_permiso(array['traslados','coberturas']::text[])) and solicitada_por = public.chat_usuario_actual_id() and estado = 'PENDIENTE');
drop policy if exists solicitudes_dotacion_update_2026 on public.solicitudes_dotacion;
create policy solicitudes_dotacion_update_2026 on public.solicitudes_dotacion for update to authenticated using (public.usuario_es_admin_principal_2026() or public.usuario_tiene_alguno_permiso(array['traslados','coberturas']::text[])) with check (public.usuario_es_admin_principal_2026() or public.usuario_tiene_alguno_permiso(array['traslados','coberturas']::text[]));
grant select, insert, update on public.solicitudes_dotacion to authenticated;
