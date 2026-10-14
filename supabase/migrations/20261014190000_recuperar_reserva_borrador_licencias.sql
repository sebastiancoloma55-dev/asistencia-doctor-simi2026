-- Control de recuperación para reservas cuyo borrador no llegó a abrirse.
-- Preparación solamente: no ejecutar en Supabase sin autorización explícita.
begin;

-- El cliente solo puede leer IDs si su permiso de licencias lo permite.
revoke all privileges on table public.licencias_medicas_borradores_control from public, anon, authenticated;
grant select on table public.licencias_medicas_borradores_control to authenticated;

create or replace function public.liberar_reserva_licencias_medicas_borrador(
  p_licencia_ids bigint[]
)
returns table (licencia_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada.';
  end if;
  if not coalesce(public.usuario_tiene_permiso('licencias'), false) then
    raise exception 'No tienes permiso para gestionar licencias médicas.';
  end if;
  if p_licencia_ids is null or cardinality(p_licencia_ids) = 0 then
    raise exception 'Debes indicar al menos una licencia.';
  end if;

  return query
    delete from public.licencias_medicas_borradores_control c
    where c.licencia_id = any(p_licencia_ids)
      and c.solicitado_por = auth.uid()
    returning c.licencia_id;
end;
$function$;

revoke all on function public.liberar_reserva_licencias_medicas_borrador(bigint[]) from public, anon;
grant execute on function public.liberar_reserva_licencias_medicas_borrador(bigint[]) to authenticated;

commit;
