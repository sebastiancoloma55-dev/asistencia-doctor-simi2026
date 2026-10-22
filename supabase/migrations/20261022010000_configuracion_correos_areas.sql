-- Configuración persistente de destinatarios y plantillas para Borradores Area.
-- Aplicar únicamente al proyecto Supabase previsto para la rama de Preview.
create table if not exists public.configuracion_correos_areas (
  area text primary key,
  correo_para text not null default '',
  correo_cc text not null default '',
  asunto_plantilla text not null default '',
  cuerpo_plantilla text not null default '',
  firma text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  constraint configuracion_correos_areas_area_not_blank check (length(trim(area)) > 0)
);

alter table public.configuracion_correos_areas enable row level security;

drop policy if exists "RRHH puede leer configuración de correos por área" on public.configuracion_correos_areas;
create policy "RRHH puede leer configuración de correos por área"
on public.configuracion_correos_areas for select to authenticated
using (exists (
  select 1 from public.perfiles_acceso p
  where p.user_id = auth.uid() and p.activo = true and p.rol in ('admin','rrhh')
));

drop policy if exists "Administradores pueden insertar configuración de correos por área" on public.configuracion_correos_areas;
create policy "Administradores pueden insertar configuración de correos por área"
on public.configuracion_correos_areas for insert to authenticated
with check (exists (
  select 1 from public.perfiles_acceso p
  where p.user_id = auth.uid() and p.activo = true and p.rol = 'admin'
));

drop policy if exists "Administradores pueden actualizar configuración de correos por área" on public.configuracion_correos_areas;
create policy "Administradores pueden actualizar configuración de correos por área"
on public.configuracion_correos_areas for update to authenticated
using (exists (
  select 1 from public.perfiles_acceso p
  where p.user_id = auth.uid() and p.activo = true and p.rol = 'admin'
))
with check (exists (
  select 1 from public.perfiles_acceso p
  where p.user_id = auth.uid() and p.activo = true and p.rol = 'admin'
));

grant select on public.configuracion_correos_areas to authenticated;
grant insert, update on public.configuracion_correos_areas to authenticated;

create index if not exists configuracion_correos_areas_updated_at_idx
on public.configuracion_correos_areas (updated_at desc);
