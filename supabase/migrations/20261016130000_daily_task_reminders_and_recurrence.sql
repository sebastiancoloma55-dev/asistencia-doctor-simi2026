-- Daily task reminders and reliable recurrence for Asistencia Doctor Simi.
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.tareas_recordatorios (
  tarea_id bigint not null references public.tareas(id) on delete cascade,
  tipo text not null check (tipo in ('ASIGNACION','VENCE_PRONTO','VENCIDA')),
  enviado_at timestamptz not null default now(),
  primary key (tarea_id, tipo)
);

alter table public.tareas_recordatorios enable row level security;
revoke all on public.tareas_recordatorios from public, anon, authenticated;
grant all on public.tareas_recordatorios to service_role;

create or replace function public.notificar_asignacion_tarea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsable_rol_id is not null then
    insert into public.tareas_recordatorios (tarea_id, tipo)
    values (new.id, 'ASIGNACION')
    on conflict do nothing;
    if found then
      insert into public.notificaciones
        (usuario_rol_id, tipo, titulo, mensaje, entidad_tipo, entidad_id)
      values
        (new.responsable_rol_id, 'TAREA_ASIGNADA', 'Nueva tarea asignada',
         'Tienes una tarea pendiente: "' || new.titulo || '". Vence el ' ||
         to_char(new.fecha_limite at time zone 'America/Santiago', 'DD-MM-YYYY HH24:MI') || '.',
         'tarea', new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificar_asignacion_tarea on public.tareas;
create trigger trg_notificar_asignacion_tarea
after insert on public.tareas
for each row execute function public.notificar_asignacion_tarea();

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
      and t.estado <> 'CANCELADA'
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
      insert into public.tareas_eventos
        (tarea_id, accion, estado_nuevo, usuario_email, detalle)
      values
        (new_id, 'GENERADA_RECURRENTEMENTE', 'PENDIENTE',
         'sistema@asistencia-doctor-simi.local',
         'Generada automáticamente desde la serie ' || latest.recurrencia_serie_id::text);
    end if;
  end loop;
  return created_count;
end;
$$;
revoke all on function public.generar_tareas_recurrentes() from public, anon, authenticated;
grant execute on function public.generar_tareas_recurrentes() to service_role;

create or replace function public.notificar_recordatorios_tareas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tareas%rowtype;
  n integer := 0;
begin
  for t in
    select * from public.tareas
    where estado not in ('APROBADA','CANCELADA','DEVUELTA')
      and fecha_limite > now()
      and fecha_limite <= now() + interval '30 minutes'
      and responsable_rol_id is not null
  loop
    insert into public.tareas_recordatorios(tarea_id,tipo)
    values(t.id,'VENCE_PRONTO') on conflict do nothing;
    if found then
      insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
      values(t.responsable_rol_id,'TAREA_RECORDATORIO','Tarea próxima a vencer',
        'Recuerda completar "' || t.titulo || '" antes de ' ||
        to_char(t.fecha_limite at time zone 'America/Santiago','DD-MM-YYYY HH24:MI') || '.',
        'tarea',t.id);
      n := n + 1;
    end if;
  end loop;

  for t in
    select * from public.tareas
    where estado not in ('APROBADA','CANCELADA','DEVUELTA')
      and fecha_limite <= now()
      and responsable_rol_id is not null
  loop
    insert into public.tareas_recordatorios(tarea_id,tipo)
    values(t.id,'VENCIDA') on conflict do nothing;
    if found then
      insert into public.notificaciones(usuario_rol_id,tipo,titulo,mensaje,entidad_tipo,entidad_id)
      values(t.responsable_rol_id,'TAREA_VENCIDA','Tarea vencida · indica su estado',
        'La tarea "' || t.titulo || '" venció sin quedar aprobada. Actualiza su estado e indica si fue realizada.',
        'tarea',t.id);
      n := n + 1;
    end if;
  end loop;

  n := n + public.generar_tareas_recurrentes();
  return n;
end;
$$;
revoke all on function public.notificar_recordatorios_tareas() from public, anon, authenticated;
grant execute on function public.notificar_recordatorios_tareas() to service_role;

do $$
begin
  if exists (select 1 from pg_namespace where nspname='cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='doctor-simi-task-reminders';
    perform cron.schedule('doctor-simi-task-reminders','*/15 * * * *',
      'select public.notificar_recordatorios_tareas();');
  end if;
end $$;
