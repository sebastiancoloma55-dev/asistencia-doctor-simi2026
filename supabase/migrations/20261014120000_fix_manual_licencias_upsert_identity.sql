-- Manual historical license imports must use the same normalized natural key
-- as ux_licencias_medicas_talana_identity. This function upserts one row at a time
-- so duplicates within a single upload cannot abort the whole batch.
create or replace function public.upsert_licencias_medicas_batch(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb;
  v_processed integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows debe ser un arreglo JSON';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    insert into public.licencias_medicas (
      rut, nombre, empresa, cargo, sucursal, tipo_ausencia, motivo_ausencia,
      dias_ausencia, fecha_inicio, fecha_fin, observaciones, gerencia,
      centro_costo, hora_inicio, hora_fin, numero_horas, numero_minutos, fecha_creacion
    ) values (
      nullif(v_row->>'rut',''), nullif(v_row->>'nombre',''),
      nullif(v_row->>'empresa',''), nullif(v_row->>'cargo',''),
      nullif(v_row->>'sucursal',''), nullif(v_row->>'tipo_ausencia',''),
      nullif(v_row->>'motivo_ausencia',''),
      nullif(v_row->>'dias_ausencia','')::numeric,
      nullif(v_row->>'fecha_inicio',''), nullif(v_row->>'fecha_fin',''),
      nullif(v_row->>'observaciones',''), nullif(v_row->>'gerencia',''),
      nullif(v_row->>'centro_costo',''), nullif(v_row->>'hora_inicio',''),
      nullif(v_row->>'hora_fin',''), nullif(v_row->>'numero_horas',''),
      nullif(v_row->>'numero_minutos',''), nullif(v_row->>'fecha_creacion','')
    )
    on conflict (
      (regexp_replace(upper(trim(rut)), '[.[:space:]]', '', 'g')),
      (trim(fecha_inicio)),
      (translate(regexp_replace(lower(trim(coalesce(tipo_ausencia, ''))), '[[:space:]]+', ' ', 'g'), 'áéíóúüñ', 'aeiouun')),
      (coalesce(left(trim(fecha_creacion), 10), '')),
      (coalesce(regexp_replace(lower(trim(coalesce(hora_inicio, ''))), '[[:space:]]+', ' ', 'g'), '')),
      (coalesce(regexp_replace(lower(trim(coalesce(hora_fin, ''))), '[[:space:]]+', ' ', 'g'), ''))
    )
    where nullif(trim(rut), '') is not null
      and nullif(trim(fecha_inicio), '') is not null
      and nullif(trim(tipo_ausencia), '') is not null
    do update set
      nombre = excluded.nombre,
      empresa = excluded.empresa,
      cargo = excluded.cargo,
      sucursal = excluded.sucursal,
      motivo_ausencia = excluded.motivo_ausencia,
      dias_ausencia = excluded.dias_ausencia,
      fecha_fin = excluded.fecha_fin,
      observaciones = excluded.observaciones,
      gerencia = excluded.gerencia,
      centro_costo = excluded.centro_costo,
      numero_horas = excluded.numero_horas,
      numero_minutos = excluded.numero_minutos,
      fecha_creacion = excluded.fecha_creacion,
      hora_inicio = excluded.hora_inicio,
      hora_fin = excluded.hora_fin;

    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('procesados', v_processed);
end;
$$;

revoke all on function public.upsert_licencias_medicas_batch(jsonb) from public, anon;
grant execute on function public.upsert_licencias_medicas_batch(jsonb) to authenticated;
