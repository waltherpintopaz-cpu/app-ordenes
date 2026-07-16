-- =========================================================
-- VLAN por orden (OLT Huawei: Nod_01, Nod_02, Nod_03)
-- Ejecutar una sola vez en Supabase SQL Editor.
--
-- Nod_01 y Nod_02 usan VLAN 100. Nod_03 usa VLAN 102 (nuevo
-- administrador OLT, todos los clientes nuevos de Nod_03 van ahi).
-- Nod_04/05/06 no usan este campo (quedan en NULL).
-- =========================================================

alter table ordenes
  add column if not exists vlan integer;

comment on column ordenes.vlan is 'VLAN de OLT Huawei asignada a la orden (solo Nod_01/02/03). Editable, puede haber excepciones.';
