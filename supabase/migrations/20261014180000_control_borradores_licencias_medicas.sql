-- Preparación solamente: NO ejecutar en Supabase hasta revisión y autorización de despliegue.
-- Evita que la misma licencia se incluya en borradores solicitados por usuarios distintos.
-- No almacena RUT, nombre, diagnóstico ni contenido del correo.

begin;

create table if not exists public.licencias_medicas_borradores_control (
  licencia_id bigint primary key
    references public.licencias_medicas(id) on delete cascade,
  sucursal text not null,
  periodo_desde date not null,
  periodo_hasta date not null,
  solicitado_por uuid not null default auth.uid(),
  solicitado_email text,
  solicitado_en timestamptz not null default now(),
  constraint licencias_borradores_periodo_valido
    check (periodo_hasta >= periodo_desde)
);

create index if not exists idx_licencias_borradores_control_solicitado_en
  on public.licencias_medicas_borradores_control (solicitado_en desc);

alter table public.licencias_medicas_borradores_control enable row level security;

-- La consulta solo revela IDs ya procesados a personal con permiso de licencias.
drop policy if exists licencias_borradores_control_select on public.licencias_medicas_borradores_control;
create policy licencias_borradores_control_select
  on public.licencias_medicas_borradores_control
  for select to authenticated
  using (public.usuario_tiene_permiso('licencias'));

-- No se permite insertar/modificar directamente desde el cliente.
-- La reserva debe pasar por la función atómica de abajo.
drop policy if exists licencias_borradores_control_no_insert_directo on public.licencias_medicas_borradores_control;
create policy licencias_borradores_control_no_insert_directo
  on public.licencias_medicas_borradores_control
  for insert to authenticated
  with check (false);

drop policy if exists licencias_borradores_control_no_update_directo on public.licencias_medicas_borradores_control;
create policy licencias_borradores_control_no_update_directo
  on public.licencias_medicas_borradores_control
  for update to authenticated
  using (false) with check (false);

drop policy if exists licencias_borradores_control_no_delete_directo on public.licencias_medicas_borradores_control;
create policy licencias_borradores_control_no_delete_directo
  on public.licencias_medicas_borradores_control
  for delete to authenticated
  using (false);

create or replace function public.reservar_licencias_medicas_borrador(
  p_licencia_ids bigint[],
  p_sucursal text,
  p_periodo_desde date,
  p_periodo_hasta date
)
returns table (licencia_id bigint, reservado boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada.';
  end if;

  if not coalesce(public.usuario_tiene_permiso('licencias'), false) then
    raise exception 'No tienes permiso para gestionar licencias médicas.';
  end if;

  if p_licencia_ids is null or cardinality(p_licencia_ids) = 0 then
    raise exception 'Debes seleccionar al menos una licencia.';
  end if;

  if p_sucursal is null or btrim(p_sucursal) = '' then
    raise exception 'La sucursal es obligatoria.';
  end if;

  if p_periodo_desde is null or p_periodo_hasta is null or p_periodo_hasta < p_periodo_desde then
    raise exception 'El período informado no es válido.';
  end if;

  return query
  with ids_solicitados as (
    select distinct unnest(p_licencia_ids) as id
  ),
  insertados as (
    insert into public.licencias_medicas_borradores_control
      (licencia_id, sucursal, periodo_desde, periodo_hasta, solicitado_por, solicitado_email)
    select i.id, btrim(p_sucursal), p_periodo_desde, p_periodo_hasta,
           auth.uid(), nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '')
    from ids_solicitados i
    join public.licencias_medicas lm on lm.id = i.id
    on conflict (licencia_id) do nothing
    returning public.licencias_medicas_borradores_control.licencia_id
  )
  select i.id, (ins.licencia_id is not null)
  from ids_solicitados i
  left join insertados ins on ins.licencia_id = i.id
  order by i.id;
end;
$function$;

revoke all on function public.reservar_licencias_medicas_borrador(bigint[], text, date, date) from public, anon;
grant execute on function public.reservar_licencias_medicas_borrador(bigint[], text, date, date) to authenticated;

commit;
