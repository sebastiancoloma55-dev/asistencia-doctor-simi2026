create or replace function public.historial_colaborador_buscar(p_rut text)
returns table(id bigint,rut text,accion text,antes jsonb,despues jsonb,actor_email text,created_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare normalized_rut text;
begin
  if not (public.usuario_es_admin_principal_2026() or public.usuario_tiene_permiso('colaboradores')) then
    raise exception 'No tienes permiso para consultar el historial de colaboradores';
  end if;
  normalized_rut := regexp_replace(upper(coalesce(p_rut,'')), '[^0-9K]', '', 'g');
  if normalized_rut !~ '^[0-9]{6,9}[0-9K]$' then raise exception 'RUT no válido'; end if;
  return query
    select h.id,h.rut,h.accion,h.antes,h.despues,h.actor_email,h.created_at
    from public.historial_colaborador h
    where regexp_replace(upper(coalesce(h.rut,'')), '[^0-9K]', '', 'g')=normalized_rut
    order by h.created_at desc limit 100;
end;
$$;
revoke all on function public.historial_colaborador_buscar(text) from public, anon;
grant execute on function public.historial_colaborador_buscar(text) to authenticated;
