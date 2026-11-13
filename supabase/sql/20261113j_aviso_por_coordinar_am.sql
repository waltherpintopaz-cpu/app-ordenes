-- SOLO AMERICANET: aviso diario (8:00 Lima) a administradores y gestoras si hay
-- ordenes "Por coordinar" con 3 dias o mas sin que el cliente se comunique.
create or replace function public.aviso_por_coordinar() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  v_lista text;
  v_nombre text;
begin
  select count(*), string_agg(coalesce(codigo, '') || ' ' || split_part(trim(coalesce(nombre, '')), ' ', 1), ', ' order by por_coordinar_desde)
    into v_n, v_lista
    from (select codigo, nombre, por_coordinar_desde from public.ordenes
           where por_coordinar_desde is not null and por_coordinar_desde < now() - interval '3 days'
             and lower(coalesce(estado, '')) like '%pendient%'
           order by por_coordinar_desde limit 6) x;
  select count(*) into v_n from public.ordenes
   where por_coordinar_desde is not null and por_coordinar_desde < now() - interval '3 days'
     and lower(coalesce(estado, '')) like '%pendient%';
  if coalesce(v_n, 0) = 0 then return; end if;
  for v_nombre in
    select distinct trim(u.nombre) from public.usuarios u
     where u.activo is true and public.chat_rol_norm(u.rol) in ('administrador', 'gestora')
  loop
    perform public.chat_push_enviar(v_nombre,
      '⏸ ' || v_n || ' orden' || case when v_n = 1 then '' else 'es' end || ' por coordinar sin respuesta',
      'Hace +3 días esperando al cliente: ' || coalesce(v_lista, '') || case when v_n > 6 then '…' else '' end || '. Llámalos o ponles fecha.',
      jsonb_build_object('tipo', 'por_coordinar', 'cantidad', v_n::text));
  end loop;
exception when others then
  raise warning 'aviso_por_coordinar: %', sqlerrm;
end
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'aviso_por_coordinar_8am_lima';
select cron.schedule('aviso_por_coordinar_8am_lima', '0 13 * * *', 'select public.aviso_por_coordinar()');
