-- Ajuste de seguridad para la migración 20261014180000.
-- Preparación solamente: no ejecutar en Supabase sin autorización de despliegue.
-- La reserva solo acepta licencias de la sucursal y del período que se muestran al usuario.

begin;

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
    insert into public.licencias_medicas_borradores_control as control
      (licencia_id, sucursal, periodo_desde, periodo_hasta, solicitado_por, solicitado_email)
    select i.id, btrim(p_sucursal), p_periodo_desde, p_periodo_hasta,
           auth.uid(), nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '')
    from ids_solicitados i
    join public.licencias_medicas lm on lm.id = i.id
    where lower(btrim(coalesce(lm.sucursal, ''))) = lower(btrim(p_sucursal))
      and (lm.created_at at time zone 'America/Santiago')::date between p_periodo_desde and p_periodo_hasta
    on conflict (licencia_id) do nothing
    returning control.licencia_id
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
