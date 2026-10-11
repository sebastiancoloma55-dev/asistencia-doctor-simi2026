-- Chat interno con conversaciones privadas/grupales y gestión de traslados de personal.
create or replace function public.chat_usuario_actual_id()
returns bigint
language sql stable security definer
set search_path = ''
as $$
  select u.id
  from public.usuarios_roles u
  where u.activo = true
    and (u.auth_user_id = (select auth.uid())
      or lower(u.email) = lower(coalesce((select auth.jwt() ->> 'email'), '')))
  order by (u.auth_user_id = (select auth.uid())) desc nulls last
  limit 1
$$;

create or replace function public.chat_puede_usar()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.usuario_es_admin_principal_2026()
      or public.usuario_tiene_alguno_permiso(array['chat','chat_interno'])
$$;

create table if not exists public.chat_conversaciones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default 'Conversación',
  tipo text not null default 'PRIVADA' check (tipo in ('PRIVADA','GRUPO')),
  creado_por bigint not null references public.usuarios_roles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_participantes (
  conversacion_id uuid not null references public.chat_conversaciones(id) on delete cascade,
  usuario_rol_id bigint not null references public.usuarios_roles(id) on delete cascade,
  agregado_por bigint references public.usuarios_roles(id),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversacion_id, usuario_rol_id)
);

create table if not exists public.chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.chat_conversaciones(id) on delete cascade,
  remitente_id bigint not null references public.usuarios_roles(id),
  contenido text not null check (char_length(trim(contenido)) between 1 and 5000),
  created_at timestamptz not null default now(),
  editado_at timestamptz,
  eliminado_at timestamptz
);

create index if not exists chat_mensajes_conversacion_fecha_idx
  on public.chat_mensajes(conversacion_id, created_at desc);
create index if not exists chat_participantes_usuario_idx
  on public.chat_participantes(usuario_rol_id, conversacion_id);
create index if not exists chat_conversaciones_actualizacion_idx
  on public.chat_conversaciones(updated_at desc);

create or replace function public.chat_es_participante(p_conversacion uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_participantes p
    where p.conversacion_id = p_conversacion
      and p.usuario_rol_id = public.chat_usuario_actual_id()
  )
$$;

alter table public.chat_conversaciones enable row level security;
alter table public.chat_participantes enable row level security;
alter table public.chat_mensajes enable row level security;

drop policy if exists chat_conversaciones_select_member on public.chat_conversaciones;
create policy chat_conversaciones_select_member on public.chat_conversaciones
for select to authenticated using (
  public.chat_puede_usar() and
  (public.chat_es_participante(id) or creado_por = public.chat_usuario_actual_id()
   or public.usuario_es_admin_principal_2026())
);

drop policy if exists chat_conversaciones_insert_authorized on public.chat_conversaciones;
create policy chat_conversaciones_insert_authorized on public.chat_conversaciones
for insert to authenticated with check (
  public.chat_puede_usar() and creado_por = public.chat_usuario_actual_id()
);

drop policy if exists chat_conversaciones_update_member on public.chat_conversaciones;
create policy chat_conversaciones_update_member on public.chat_conversaciones
for update to authenticated using (
  public.chat_puede_usar() and (creado_por = public.chat_usuario_actual_id() or public.usuario_es_admin_principal_2026())
) with check (
  public.chat_puede_usar() and (creado_por = public.chat_usuario_actual_id() or public.usuario_es_admin_principal_2026())
);

drop policy if exists chat_participantes_select_member on public.chat_participantes;
create policy chat_participantes_select_member on public.chat_participantes
for select to authenticated using (
  public.chat_puede_usar() and public.chat_es_participante(conversacion_id)
);

drop policy if exists chat_participantes_insert_creator on public.chat_participantes;
create policy chat_participantes_insert_creator on public.chat_participantes
for insert to authenticated with check (
  public.chat_puede_usar() and (
    exists (select 1 from public.chat_conversaciones c
      where c.id = conversacion_id and c.creado_por = public.chat_usuario_actual_id())
    or public.usuario_es_admin_principal_2026()
  )
  and exists (select 1 from public.usuarios_roles u where u.id = usuario_rol_id and u.activo = true)
);

drop policy if exists chat_participantes_update_self_read on public.chat_participantes;
create policy chat_participantes_update_self_read on public.chat_participantes
for update to authenticated using (
  public.chat_puede_usar() and usuario_rol_id = public.chat_usuario_actual_id()
) with check (
  public.chat_puede_usar() and usuario_rol_id = public.chat_usuario_actual_id()
);

drop policy if exists chat_mensajes_select_member on public.chat_mensajes;
create policy chat_mensajes_select_member on public.chat_mensajes
for select to authenticated using (
  public.chat_puede_usar() and public.chat_es_participante(conversacion_id)
);

drop policy if exists chat_mensajes_insert_member on public.chat_mensajes;
create policy chat_mensajes_insert_member on public.chat_mensajes
for insert to authenticated with check (
  public.chat_puede_usar()
  and remitente_id = public.chat_usuario_actual_id()
  and public.chat_es_participante(conversacion_id)
);

grant select, insert, update on public.chat_conversaciones to authenticated;
grant select, insert, update on public.chat_participantes to authenticated;
grant select, insert on public.chat_mensajes to authenticated;
grant all on public.chat_conversaciones, public.chat_participantes, public.chat_mensajes to service_role;

create table if not exists public.traslados_personal (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references public.colaboradores(id) on delete set null,
  rut text,
  colaborador_nombre text not null,
  cargo text,
  sucursal_origen_id uuid references public.sucursales(id) on delete set null,
  sucursal_origen_nombre text not null,
  sucursal_destino_id uuid references public.sucursales(id) on delete set null,
  sucursal_destino_nombre text not null,
  fecha_solicitud date not null default (now() at time zone 'America/Santiago')::date,
  fecha_inicio date not null,
  fecha_termino date,
  indefinido boolean not null default false,
  motivo text not null,
  observaciones text,
  estado text not null default 'SOLICITADO'
    check (estado in ('SOLICITADO','APROBADO','RECHAZADO','CANCELADO','COMPLETADO')),
  solicitado_por bigint not null references public.usuarios_roles(id),
  revisado_por bigint references public.usuarios_roles(id),
  revisado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint traslados_origen_destino_diferentes check (
    lower(trim(sucursal_origen_nombre)) <> lower(trim(sucursal_destino_nombre))
  ),
  constraint traslados_fechas_validas check (
    (indefinido and fecha_termino is null) or
    (not indefinido and (fecha_termino is null or fecha_termino >= fecha_inicio))
  )
);

create index if not exists traslados_personal_estado_fecha_idx
  on public.traslados_personal(estado, fecha_inicio);
create index if not exists traslados_personal_colaborador_idx
  on public.traslados_personal(colaborador_id, fecha_inicio desc);

alter table public.traslados_personal enable row level security;

drop policy if exists traslados_personal_select_authorized on public.traslados_personal;
create policy traslados_personal_select_authorized on public.traslados_personal
for select to authenticated using (
  public.usuario_es_admin_principal_2026()
  or public.usuario_tiene_alguno_permiso(array['traslados','coberturas','mapas'])
);

drop policy if exists traslados_personal_insert_authorized on public.traslados_personal;
create policy traslados_personal_insert_authorized on public.traslados_personal
for insert to authenticated with check (
  (public.usuario_es_admin_principal_2026()
   or public.usuario_tiene_alguno_permiso(array['traslados','coberturas']))
  and solicitado_por = public.chat_usuario_actual_id()
  and estado = 'SOLICITADO'
);

drop policy if exists traslados_personal_update_reviewer on public.traslados_personal;
create policy traslados_personal_update_reviewer on public.traslados_personal
for update to authenticated using (
  public.usuario_es_admin_principal_2026()
  or public.usuario_tiene_alguno_permiso(array['traslados_aprobar'])
) with check (
  public.usuario_es_admin_principal_2026()
  or public.usuario_tiene_alguno_permiso(array['traslados_aprobar'])
);

grant select, insert, update on public.traslados_personal to authenticated;
grant all on public.traslados_personal to service_role;

comment on table public.chat_conversaciones is 'Conversaciones privadas y grupales del chat interno de Asistencia Doctor Simi.';
comment on table public.chat_mensajes is 'Mensajes internos; RLS limita lectura y escritura a participantes autorizados.';
comment on table public.traslados_personal is 'Solicitudes e historial de traslados entre sucursales, con aprobación y trazabilidad.';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_mensajes'
     ) then
    alter publication supabase_realtime add table public.chat_mensajes;
  end if;
end $$;
