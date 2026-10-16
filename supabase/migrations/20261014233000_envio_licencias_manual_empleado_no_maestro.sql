-- Permite registrar licencias aunque el colaborador aún no exista en el maestro.
-- Se conserva el registro manual independiente y se evita duplicar por RUT normalizado + período.
begin;
alter table public.envio_licencias_medicas
  alter column colaborador_id drop not null;
drop index if exists public.uq_envio_licencias_manual_duplicado;
create unique index if not exists uq_envio_licencias_manual_rut_inicio_dias
  on public.envio_licencias_medicas (
    regexp_replace(upper(rut), '[^0-9K]', '', 'g'),
    fecha_inicio,
    dias_corridos
  );
commit;
