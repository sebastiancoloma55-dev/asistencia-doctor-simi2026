-- Registro manual independiente para preparación de correos de licencias médicas.
-- Preparación solamente: NO ejecutar en Supabase ni desplegar sin autorización.
begin;

create table if not exists public.envio_licencias_medicas (
  id uuid primary key default gen_random_uuid(),
  fecha_registro date not null,
  colaborador_id uuid not null references public.colaboradores(id),
  rut text not null,
  nombre_colaborador text not null,
  cargo text,
  sucursal_id uuid references public.sucursales(id),
  sucursal_nombre text,
  correo_sucursal text,
  correo_copia text,
  fecha_inicio date not null,
  dias_corridos integer not null check (dias_corridos between 1 and 365),
  fecha_termino date generated always as (fecha_inicio + (dias_corridos - 1)) stored,
  fecha_retorno date generated always as (fecha_inicio + dias_corridos) stored,
  observacion_administrativa text check (observacion_administrativa is null or char_length(observacion_administrativa) <= 500),
  estado_correo text not null default 'guardada'
    check (estado_correo in ('guardada','borrador_solicitado','correo_confirmado_manual')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_envio_licencias_created_at on public.envio_licencias_medicas(created_at desc);
create index if not exists idx_envio_licencias_rut on public.envio_licencias_medicas(rut);
create index if not exists idx_envio_licencias_inicio on public.envio_licencias_medicas(fecha_inicio);
create unique index if not exists uq_envio_licencias_manual_duplicado
  on public.envio_licencias_medicas(colaborador_id, fecha_inicio, dias_corridos);

create table if not exists public.envio_licencias_medicas_auditoria (
  id bigint generated always as identity primary key,
  licencia_manual_id uuid not null references public.envio_licencias_medicas(id) on delete cascade,
  accion text not null check (accion in ('INSERT','UPDATE')),
  usuario_id uuid default auth.uid(),
  ocurrido_en timestamptz not null default now(),
  datos_anteriores jsonb,
  datos_nuevos jsonb
);
create index if not exists idx_envio_licencias_auditoria_registro
  on public.envio_licencias_medicas_auditoria(licencia_manual_id, ocurrido_en desc);

create or replace function public.tg_auditar_envio_licencia_manual()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if TG_OP='INSERT' then
    new.updated_at := now();
    insert into public.envio_licencias_medicas_auditoria(licencia_manual_id,accion,usuario_id,datos_nuevos)
    values(new.id,'INSERT',auth.uid(),to_jsonb(new));
    return new;
  end if;
  new.updated_at := now();
  insert into public.envio_licencias_medicas_auditoria(licencia_manual_id,accion,usuario_id,datos_anteriores,datos_nuevos)
  values(new.id,'UPDATE',auth.uid(),to_jsonb(old),to_jsonb(new));
  return new;
end $$;
drop trigger if exists tg_auditar_envio_licencia_manual on public.envio_licencias_medicas;
create trigger tg_auditar_envio_licencia_manual
before insert or update on public.envio_licencias_medicas
for each row execute function public.tg_auditar_envio_licencia_manual();

alter table public.envio_licencias_medicas enable row level security;
alter table public.envio_licencias_medicas_auditoria enable row level security;
drop policy if exists envio_licencias_select on public.envio_licencias_medicas;
create policy envio_licencias_select on public.envio_licencias_medicas
for select to authenticated using (public.usuario_tiene_permiso('envio_licencias'));
drop policy if exists envio_licencias_insert on public.envio_licencias_medicas;
create policy envio_licencias_insert on public.envio_licencias_medicas
for insert to authenticated with check (
  public.usuario_tiene_permiso('envio_licencias') and created_by = auth.uid()
);
drop policy if exists envio_licencias_update on public.envio_licencias_medicas;
create policy envio_licencias_update on public.envio_licencias_medicas
for update to authenticated using (public.usuario_tiene_permiso('envio_licencias'))
with check (public.usuario_tiene_permiso('envio_licencias'));
drop policy if exists envio_licencias_no_delete on public.envio_licencias_medicas;
create policy envio_licencias_no_delete on public.envio_licencias_medicas
for delete to authenticated using (false);

drop policy if exists envio_licencias_auditoria_select on public.envio_licencias_medicas_auditoria;
create policy envio_licencias_auditoria_select on public.envio_licencias_medicas_auditoria
for select to authenticated using (public.usuario_tiene_permiso('envio_licencias'));
drop policy if exists envio_licencias_auditoria_no_direct_write on public.envio_licencias_medicas_auditoria;
create policy envio_licencias_auditoria_no_direct_write on public.envio_licencias_medicas_auditoria
for all to authenticated using (false) with check (false);

grant select, insert, update on public.envio_licencias_medicas to authenticated;
grant select on public.envio_licencias_medicas_auditoria to authenticated;
grant usage, select on sequence public.envio_licencias_medicas_auditoria_id_seq to authenticated;
commit;
