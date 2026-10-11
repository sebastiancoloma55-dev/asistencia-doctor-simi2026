-- Trazabilidad común de la última carga manual y automática por apartado.
create table if not exists public.actualizaciones_fuentes (
  modulo text primary key,
  actualizado_en timestamptz not null default now(),
  archivo text,
  origen text not null default 'manual' check (origen in ('manual','bot','sistema')),
  usuario_email text,
  registros integer check (registros is null or registros >= 0),
  detalles jsonb not null default '{}'::jsonb
);

alter table public.actualizaciones_fuentes enable row level security;
drop policy if exists actualizaciones_fuentes_select_authenticated on public.actualizaciones_fuentes;
create policy actualizaciones_fuentes_select_authenticated
  on public.actualizaciones_fuentes for select to authenticated using (true);
drop policy if exists actualizaciones_fuentes_insert_authenticated on public.actualizaciones_fuentes;
create policy actualizaciones_fuentes_insert_authenticated
  on public.actualizaciones_fuentes for insert to authenticated with check (auth.uid() is not null);
drop policy if exists actualizaciones_fuentes_update_authenticated on public.actualizaciones_fuentes;
create policy actualizaciones_fuentes_update_authenticated
  on public.actualizaciones_fuentes for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

grant select, insert, update on public.actualizaciones_fuentes to authenticated;
grant all on public.actualizaciones_fuentes to service_role;

create index if not exists idx_actualizaciones_fuentes_fecha
  on public.actualizaciones_fuentes(actualizado_en desc);

comment on table public.actualizaciones_fuentes is
  'Última actualización de archivos por módulo; se actualiza en cargas manuales y en el bot Talana.';
