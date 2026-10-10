-- Antes, cada asignacion/devolucion de material a un tecnico hacia un
-- read-modify-write desde el navegador: leia cantidad_disponible/cantidad_asignada
-- del estado en memoria (cargado al abrir el panel), sumaba/restaba en JS, y
-- escribia el valor final con un UPDATE. Si el panel quedaba abierto varios dias
-- (como con Admin General asignando material a Luis Fernando Pacsi Pomaleque en
-- 7 fechas distintas), cada guardado podia pisar el incremento hecho por otra
-- sesion/dia anterior -- se detecto una desincronizacion real de hasta -492
-- metros de Cable Drop y -227 grapas en un tecnico, auditando todo el historial.
--
-- Esta funcion hace el ajuste en una sola sentencia SQL (UPDATE ... SET x = x + delta),
-- atomica por fila a nivel de Postgres sin importar cuantas sesiones esten
-- escribiendo a la vez -- elimina la clase de bug por completo.
create or replace function ajustar_material_tecnico(
  p_tecnico text,
  p_material_id integer,
  p_material_nombre text,
  p_unidad text,
  p_delta_disponible numeric,
  p_delta_asignado numeric
) returns void
language plpgsql
as $$
declare
  v_id bigint;
  v_disponible numeric;
  v_asignado numeric;
begin
  select id, cantidad_disponible, cantidad_asignada
    into v_id, v_disponible, v_asignado
  from materiales_asignados_tecnicos
  where tecnico = p_tecnico
    and lower(trim(material_nombre)) = lower(trim(p_material_nombre))
    and lower(trim(unidad)) = lower(trim(coalesce(p_unidad, 'unidad')))
  for update;

  if v_id is null then
    if p_delta_disponible < 0 or p_delta_asignado < 0 then
      raise exception 'No existe asignacion previa de % para % (no se puede restar).', p_material_nombre, p_tecnico;
    end if;
    insert into materiales_asignados_tecnicos
      (tecnico, material_id, material_nombre, cantidad_asignada, cantidad_disponible, unidad, fecha_asignacion)
    values
      (p_tecnico, p_material_id, p_material_nombre, p_delta_asignado, p_delta_disponible, coalesce(p_unidad, 'unidad'), now());
    return;
  end if;

  v_disponible := greatest(0, v_disponible + p_delta_disponible);
  v_asignado := greatest(0, v_asignado + p_delta_asignado);

  if v_disponible <= 0 and v_asignado <= 0 then
    delete from materiales_asignados_tecnicos where id = v_id;
  else
    update materiales_asignados_tecnicos
      set cantidad_disponible = v_disponible,
          cantidad_asignada = v_asignado
      where id = v_id;
  end if;
end;
$$;

comment on function ajustar_material_tecnico is
  'Ajusta (suma o resta) el saldo de un material asignado a un tecnico de forma atomica. '
  'Usar en vez de leer el saldo actual en el cliente, calcular el nuevo valor en JS y hacer un UPDATE directo.';
