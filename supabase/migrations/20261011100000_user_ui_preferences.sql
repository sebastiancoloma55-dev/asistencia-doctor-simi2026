-- Per-user UI preferences. These settings never grant module access.
create table if not exists public.user_ui_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_ui_preferences_object check (jsonb_typeof(preferences) = 'object')
);
alter table public.user_ui_preferences enable row level security;
drop policy if exists "Users can read own UI preferences" on public.user_ui_preferences;
create policy "Users can read own UI preferences" on public.user_ui_preferences for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own UI preferences" on public.user_ui_preferences;
create policy "Users can insert own UI preferences" on public.user_ui_preferences for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own UI preferences" on public.user_ui_preferences;
create policy "Users can update own UI preferences" on public.user_ui_preferences for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all privileges on table public.user_ui_preferences from anon, authenticated;
grant select, insert, update on table public.user_ui_preferences to authenticated;
