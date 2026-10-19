-- Shared timed coffee-break presence for authenticated employees.
begin;

create table if not exists public.cafecito_sesiones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  display_name text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index if not exists uq_cafecito_sesiones_one_active_per_user
  on public.cafecito_sesiones (user_id)
  where ended_at is null;

create index if not exists idx_cafecito_sesiones_active_started
  on public.cafecito_sesiones (started_at)
  where ended_at is null;

alter table public.cafecito_sesiones enable row level security;

drop policy if exists cafecito_read_active_authenticated on public.cafecito_sesiones;
create policy cafecito_read_active_authenticated
on public.cafecito_sesiones
for select to authenticated
using (ended_at is null);

drop policy if exists cafecito_insert_own on public.cafecito_sesiones;
create policy cafecito_insert_own
on public.cafecito_sesiones
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and ended_at is null
  and started_at <= now() + interval '2 minutes'
);

drop policy if exists cafecito_update_own on public.cafecito_sesiones;
create policy cafecito_update_own
on public.cafecito_sesiones
for update to authenticated
using (user_id = (select auth.uid()) and ended_at is null)
with check (user_id = (select auth.uid()));

revoke all on public.cafecito_sesiones from anon;
grant select, insert, update on public.cafecito_sesiones to authenticated;

commit;
