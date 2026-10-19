-- Shared, opt-in team availability and quick messages for the coffee panel.
begin;
create table if not exists public.cafecito_estado_equipo (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  estado text not null default 'available' check (estado in ('available','needs_cover')),
  mensaje text check (mensaje is null or mensaje in ('Ya vuelvo','Disponible para consultas','Necesito cobertura','En una tarea urgente')),
  updated_at timestamptz not null default now()
);
alter table public.cafecito_estado_equipo enable row level security;
drop policy if exists cafecito_estado_read_authenticated on public.cafecito_estado_equipo;
create policy cafecito_estado_read_authenticated on public.cafecito_estado_equipo for select to authenticated using (true);
drop policy if exists cafecito_estado_insert_own on public.cafecito_estado_equipo;
create policy cafecito_estado_insert_own on public.cafecito_estado_equipo for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists cafecito_estado_update_own on public.cafecito_estado_equipo;
create policy cafecito_estado_update_own on public.cafecito_estado_equipo for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.cafecito_estado_equipo from anon;
grant select, insert, update on public.cafecito_estado_equipo to authenticated;
do $$ begin
 if exists (select 1 from pg_publication where pubname='supabase_realtime') and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cafecito_estado_equipo') then
  alter publication supabase_realtime add table public.cafecito_estado_equipo;
 end if;
end $$;
commit;
