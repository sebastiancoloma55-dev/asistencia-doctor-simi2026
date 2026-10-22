-- Configuración persistente de destinatarios y plantillas para áreas de Casa Matriz y Central.
-- Se agrega en Preview mediante migración; no modifica la configuración de sucursales.
create table if not exists public.configuracion_correos_areas (
  area text primary key,
  correo_para text not null default '',
  correo_cc text not null default '',
  asunto_plantilla text not null default '',
  cuerpo_plantilla text not null default '',
  firma text not null default '',
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint configuracion_correos_areas_area_not_blank check (length(trim(area)) > 0)
);

alter table public.configuracion_correos_areas enable row level security;

drop policy if exists "areas_mail_select_authorized" on public.configuracion_correos_areas;
create policy "areas_mail_select_authorized"
on public.configuracion_correos_areas for select to authenticated
using (
  public.usuario_es_admin_principal_2026()
  or exists (
    select 1 from public.usuarios_roles ur
    where lower(ur.email) = lower(coalesce(auth.jwt()->>'email',''))
      and ur.activo is distinct from false
      and (
        ur.acceso_global is true
        or ur.permisos @> '["correos"]'::jsonb
        or ur.permisos @> '["configcorreos"]'::jsonb
      )
  )
);

drop policy if exists "areas_mail_insert_authorized" on public.configuracion_correos_areas;
create policy "areas_mail_insert_authorized"
on public.configuracion_correos_areas for insert to authenticated
with check (
  public.usuario_es_admin_principal_2026()
  or exists (
    select 1 from public.usuarios_roles ur
    where lower(ur.email) = lower(coalesce(auth.jwt()->>'email',''))
      and ur.activo is distinct from false
      and (
        ur.acceso_global is true
        or ur.permisos @> '["configcorreos"]'::jsonb
      )
  )
);

drop policy if exists "areas_mail_update_authorized" on public.configuracion_correos_areas;
create policy "areas_mail_update_authorized"
on public.configuracion_correos_areas for update to authenticated
using (
  public.usuario_es_admin_principal_2026()
  or exists (
    select 1 from public.usuarios_roles ur
    where lower(ur.email) = lower(coalesce(auth.jwt()->>'email',''))
      and ur.activo is distinct from false
      and (
        ur.acceso_global is true
        or ur.permisos @> '["configcorreos"]'::jsonb
      )
  )
)
with check (
  public.usuario_es_admin_principal_2026()
  or exists (
    select 1 from public.usuarios_roles ur
    where lower(ur.email) = lower(coalesce(auth.jwt()->>'email',''))
      and ur.activo is distinct from false
      and (
        ur.acceso_global is true
        or ur.permisos @> '["configcorreos"]'::jsonb
      )
  )
);

grant select on public.configuracion_correos_areas to authenticated;
grant insert, update on public.configuracion_correos_areas to authenticated;

insert into public.configuracion_correos_areas (area, correo_para, correo_cc, asunto_plantilla, cuerpo_plantilla, firma)
values
('ADMINISTRACION','','','Comunicación interna – ADMINISTRACION','Estimados/as de ADMINISTRACION:

Junto con saludar, comparto la siguiente información para su revisión y gestión:

[Escribe aquí el detalle de la comunicación]

Quedo atento/a a sus comentarios.

Saludos cordiales,
Farmacias de Similares Chile S.A.','Saludos cordiales,
Farmacias de Similares Chile S.A.'),
('APERTURAS Y REMODELACIONES','','','Comunicación interna – APERTURAS Y REMODELACIONES','',''),
('ARRIENDOS Y PATENTES','','','Comunicación interna – ARRIENDOS Y PATENTES','',''),
('AUDITORIA INTERNA','','','Comunicación interna – AUDITORIA INTERNA','',''),
('BOTARGUEROS','','','Comunicación interna – BOTARGUEROS','',''),
('CD CONCEPCION','','','Comunicación interna – CD CONCEPCION','',''),
('CENTRAL','','','Comunicación interna – CENTRAL','',''),
('CEPIP Y CAMPAÑAS','','','Comunicación interna – CEPIP Y CAMPAÑAS','',''),
('COMPRAS','','','Comunicación interna – COMPRAS','',''),
('CONTABILIDAD','','','Comunicación interna – CONTABILIDAD','',''),
('CONTRALORIA','','','Comunicación interna – CONTRALORIA','',''),
('DIRECCION TECNICA','','','Comunicación interna – DIRECCION TECNICA','',''),
('DISEÑO GRAFICO','','','Comunicación interna – DISEÑO GRAFICO','',''),
('DISTRIBUCION','','','Comunicación interna – DISTRIBUCION','',''),
('FRANQUICIAS','','','Comunicación interna – FRANQUICIAS','',''),
('INSUMOS','','','Comunicación interna – INSUMOS','',''),
('MANTENCION','','','Comunicación interna – MANTENCION','',''),
('OPERACIONES','','','Comunicación interna – OPERACIONES','',''),
('PREVENCION DE RIESGOS','','','Comunicación interna – PREVENCION DE RIESGOS','',''),
('RECURSOS HUMANOS','','','Comunicación interna – RECURSOS HUMANOS','',''),
('SIMI - SAE','','','Comunicación interna – SIMI - SAE','',''),
('TECNOLOGIA','','','Comunicación interna – TECNOLOGIA','',''),
('TRANSPORTES','','','Comunicación interna – TRANSPORTES','',''),
('VENTAS','','','Comunicación interna – VENTAS','',''),
('VISITADORES MEDICOS','','','Comunicación interna – VISITADORES MEDICOS','','')
on conflict (area) do nothing;

create or replace function public.actualizar_configuracion_correos_areas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists configuracion_correos_areas_updated_at on public.configuracion_correos_areas;
create trigger configuracion_correos_areas_updated_at
before update on public.configuracion_correos_areas
for each row execute function public.actualizar_configuracion_correos_areas_updated_at();
