create extension if not exists pgcrypto;
create table if not exists public.talana_bot_config (
 id smallint primary key default 1 check(id=1), enabled boolean not null default false,
 interval_minutes integer not null default 30 check(interval_minutes between 30 and 1440),
 run_mode text not null default 'both' check(run_mode in ('both','manual','automatic')),
 report_types jsonb not null default '["ausentismos_historico","solicitudes_vacaciones_historicas"]'::jsonb,
 updated_at timestamptz not null default now(), updated_by text
);
insert into public.talana_bot_config(id) values(1) on conflict(id) do nothing;
create table if not exists public.talana_bot_runs (
 id uuid primary key default gen_random_uuid(), trigger_type text not null check(trigger_type in ('automatic','manual')),
 status text not null default 'running' check(status in ('queued','running','success','partial','failed')),
 started_at timestamptz not null default now(), finished_at timestamptz, reports_downloaded integer not null default 0,
 reports_uploaded integer not null default 0, error_summary text, details jsonb not null default '{}'::jsonb, requested_by text
);
create index if not exists idx_talana_bot_runs_started_at on public.talana_bot_runs(started_at desc);
create table if not exists public.talana_bot_files (
 id uuid primary key default gen_random_uuid(), run_id uuid references public.talana_bot_runs(id) on delete set null,
 report_type text not null, file_name text not null, storage_path text not null unique,
 mime_type text not null default 'application/octet-stream', size_bytes bigint not null default 0,
 sha256 text, uploaded_at timestamptz not null default now()
);
create index if not exists idx_talana_bot_files_uploaded_at on public.talana_bot_files(uploaded_at desc);
alter table public.talana_bot_config enable row level security;
alter table public.talana_bot_runs enable row level security;
alter table public.talana_bot_files enable row level security;
revoke all on public.talana_bot_config,public.talana_bot_runs,public.talana_bot_files from anon,authenticated;
grant select,insert,update on public.talana_bot_config,public.talana_bot_runs,public.talana_bot_files to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('talana-reportes','talana-reportes',false,20971520,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv','application/pdf','application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=20971520;
