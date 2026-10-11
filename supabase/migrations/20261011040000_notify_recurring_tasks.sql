-- Notify the assigned owner whenever a recurring task occurrence is generated.
create or replace function public.generar_tareas_recurrentes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  latest public.tareas%rowtype;
  next_due timestamptz;
  new_id bigint;
  created_count integer := 0;
  step_interval interval;
begin
  for latest in
    select t.*
    from public.tareas t
    join (
      select recurrencia_serie_id, max(fecha_limite) as fecha_limite
      from public.tareas
      where recurrencia_serie_id is not null
      group by recurrencia_serie_id
    ) last_task
      on last_task.recurrencia_serie_id = t.recurrencia_serie_id
     and last_task.fecha_limite = t.fecha_limite
    where t.recurrencia_serie_id is not null
      and t.recurrencia in ('DIARIA', 'SEMANAL', 'MENSUAL')
      and t.estado = 'APROBADA'
      and t.fecha_limite <= now()
  loop
    step_interval := case latest.recurrencia
      when 'DIARIA' then interval '1 day'
      when 'SEMANAL' then interval '1 week'
      when 'MENSUAL' then interval '1 month'
      else null
    end;
    if step_interval is null then continue; end if;

    next_due := latest.fecha_limite + step_interval;
    while next_due <= now() loop
      next_due := next_due + step_interval;
    end loop;

    new_id := null;
    insert into public.tareas (
      titulo, descripcion, responsable_rol_id, revisor_rol_id, sucursal_id,
      prioridad, estado, recurrencia, fecha_limite, clave_evento,
      creado_por_email, recurrencia_serie_id
    ) values (
      latest.titulo, latest.descripcion, latest.responsable_rol_id,
      latest.revisor_rol_id, latest.sucursal_id, latest.prioridad,
      'PENDIENTE', latest.recurrencia, next_due, null,
      latest.creado_por_email, latest.recurrencia_serie_id
    )
    on conflict do nothing
    returning id into new_id;

    if new_id is not null then
      created_count := created_count + 1;
      insert into public.tareas_eventos (
        tarea_id, accion, estado_nuevo, usuario_email, detalle
      ) values (
        new_id, 'GENERADA_RECURRENTEMENTE', 'PENDIENTE',
        'sistema@asistencia-doctor-simi.local',
        'Generada automáticamente desde la serie ' || latest.recurrencia_serie_id::text
      );
      insert into public.notificaciones (
        usuario_rol_id, tipo, titulo, mensaje, entidad_tipo, entidad_id
      ) values (
        latest.responsable_rol_id, 'TAREA_RECURRENTE',
        'Nueva tarea recurrente',
        'Se creó la siguiente ocurrencia de "' || latest.titulo || '" con vencimiento ' ||
          to_char(next_due at time zone 'America/Santiago', 'DD-MM-YYYY HH24:MI') || '.',
        'tarea', new_id
      );
    end if;
  end loop;
  return created_count;
end;
$$;

revoke all on function public.generar_tareas_recurrentes() from public, anon, authenticated;
grant execute on function public.generar_tareas_recurrentes() to service_role;
comment on function public.generar_tareas_recurrentes() is 'Genera y notifica la siguiente tarea recurrente solo cuando la última ocurrencia está aprobada y vencida; no duplica ocurrencias.';
