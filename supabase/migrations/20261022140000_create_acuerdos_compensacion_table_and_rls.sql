create table if not exists public.acuerdos_compensacion (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  nombre text not null,
  rut text not null,
  cargo text,
  fecha_ingreso date,
  fecha_acuerdo date not null,
  fecha_trabajada_desde date not null,
  fecha_trabajada_hasta date not null,
  dias_compensar integer not null check (dias_compensar >= 1),
  fecha_descanso_acordada date not null,
  notas_internas text,
  generado_por text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint acuerdos_compensacion_fechas_validas check (fecha_trabajada_hasta >= fecha_trabajada_desde)
);
create index if not exists acuerdos_compensacion_created_at_idx on public.acuerdos_compensacion (created_at desc);
create index if not exists acuerdos_compensacion_colaborador_idx on public.acuerdos_compensacion (colaborador_id, created_at desc);
alter table public.acuerdos_compensacion enable row level security;
revoke all on public.acuerdos_compensacion from anon;
grant select, insert on public.acuerdos_compensacion to authenticated;
drop policy if exists acuerdos_compensacion_select_permiso on public.acuerdos_compensacion;
create policy acuerdos_compensacion_select_permiso on public.acuerdos_compensacion for select to authenticated using (public.usuario_tiene_alguno_permiso(array['acuerdos-compensacion','admin']::text[]));
drop policy if exists acuerdos_compensacion_insert_permiso on public.acuerdos_compensacion;
create policy acuerdos_compensacion_insert_permiso on public.acuerdos_compensacion for insert to authenticated with check (
  public.usuario_tiene_alguno_permiso(array['acuerdos-compensacion','admin']::text[])
  and created_by = auth.uid()
  and exists (
    select 1 from public.colaboradores c
    where c.id = colaborador_id
      and private.usuario_puede_ver_sucursal(c.sucursal_id, c.sucursal)
  )
);
notify pgrst, 'reload schema';
