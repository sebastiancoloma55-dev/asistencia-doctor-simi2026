-- Fix RLS on ending a coffee break: the owner must still be able to see
-- their own row after ended_at changes, while coworkers see active breaks only.
begin;

drop policy if exists cafecito_read_active_authenticated on public.cafecito_sesiones;
create policy cafecito_read_active_authenticated
on public.cafecito_sesiones
for select
to authenticated
using (ended_at is null or user_id = (select auth.uid()));

drop policy if exists cafecito_update_own on public.cafecito_sesiones;
create policy cafecito_update_own
on public.cafecito_sesiones
for update
to authenticated
using (user_id = (select auth.uid()) and ended_at is null)
with check (user_id = (select auth.uid()));

commit;
