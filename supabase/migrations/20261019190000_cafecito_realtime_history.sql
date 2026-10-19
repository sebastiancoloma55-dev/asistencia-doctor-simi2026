-- Shared team view of break history and realtime change events.
begin;

drop policy if exists cafecito_read_active_authenticated on public.cafecito_sesiones;
create policy cafecito_read_active_authenticated
on public.cafecito_sesiones
for select
to authenticated
using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'cafecito_sesiones'
     ) then
    alter publication supabase_realtime add table public.cafecito_sesiones;
  end if;
end $$;

alter table public.cafecito_sesiones replica identity full;

commit;
