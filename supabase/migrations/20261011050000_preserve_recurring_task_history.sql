-- Preserve recurring task history: deleting a series root must not cascade-delete all occurrences.
alter table public.tareas drop constraint if exists tareas_recurrencia_serie_fk;
alter table public.tareas
  add constraint tareas_recurrencia_serie_fk
  foreign key (recurrencia_serie_id) references public.tareas(id) on delete restrict;
