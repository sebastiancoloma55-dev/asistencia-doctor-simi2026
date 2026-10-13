-- Global session invalidation marker for the RR. HH. application.
create table if not exists public.control_sesion_global (
  id integer primary key check (id = 1),
  nonce uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.control_sesion_global enable row level security;
revoke all on table public.control_sesion_global from anon, authenticated;
insert into public.control_sesion_global (id, nonce)
values (1, gen_random_uuid())
on conflict (id) do nothing;
