import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://vgwbqbzpjlbkmxtfghdm.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_";

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const SUPABASE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_ANON_KEY
).trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES_IN_DELETE_ORDER = [
  "orden_fotos",
  "liquidacion_equipos",
  "liquidacion_materiales",
  "liquidacion_fotos",
  "cliente_fotos_liquidacion",
  "cliente_historial_instalaciones",
  "cliente_equipos_historial",
  "inventario_movimientos",
  "inventario_devolucion_solicitudes",
  "almacen_pe_movimientos",
  "almacen_pe_devolucion_solicitudes",
  "ordenes_usuario_liberaciones",
  "tecnico_ubicaciones",
  "tecnico_ubicacion_actual",
  "tecnico_turnos",
  "audit_deletes",
  "liquidaciones",
  "ordenes",
  "clientes",
  "materiales_asignados_tecnicos",
  "equipos_catalogo",
  "inventario_articulos",
  "materiales_catalogo",
  "modelos_equipo_catalogo",
  "marcas_tipo_equipo",
  "tipos_equipo_catalogo",
  "usuarios",
  "almacen_pe_items",
  "tecnico_seguimiento_config",
  "historial_appsheet_onus",
];

const DELETE_FILTER_COLUMNS = [
  "id",
  "detalle_key",
  "created_at",
  "fecha_creacion",
  "fecha_mov",
  "codigo",
  "username",
  "nombre",
  "item_id",
  "orden_id",
  "material_id",
  "tecnico",
  "ctoid",
];

function isMissingColumn(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

async function countRows(table) {
  const res = await supabase.from(table).select("*", { count: "exact", head: true });
  return { count: Number(res.count || 0), error: res.error || null };
}

async function deleteAllRows(table) {
  for (const col of DELETE_FILTER_COLUMNS) {
    const res = await supabase.from(table).delete().not(col, "is", null);
    if (!res.error) {
      return { ok: true, by: col };
    }
    if (isMissingColumn(res.error)) continue;
    return { ok: false, error: res.error };
  }
  return { ok: false, error: new Error("No se encontro columna util para delete().") };
}

async function run() {
  console.log(`Proyecto: ${SUPABASE_URL}`);
  console.log(`Tablas objetivo: ${TABLES_IN_DELETE_ORDER.length}`);
  const results = [];

  for (const table of TABLES_IN_DELETE_ORDER) {
    const before = await countRows(table);
    if (before.error) {
      results.push({ table, status: "error", stage: "count_before", error: before.error.message || String(before.error) });
      continue;
    }
    if (before.count === 0) {
      results.push({ table, status: "ok", before: 0, after: 0, note: "ya vacia" });
      continue;
    }

    const del = await deleteAllRows(table);
    if (!del.ok) {
      results.push({
        table,
        status: "error",
        before: before.count,
        stage: "delete",
        error: del.error?.message || String(del.error),
      });
      continue;
    }

    const after = await countRows(table);
    if (after.error) {
      results.push({
        table,
        status: "error",
        before: before.count,
        stage: "count_after",
        error: after.error.message || String(after.error),
      });
      continue;
    }

    results.push({
      table,
      status: after.count === 0 ? "ok" : "partial",
      before: before.count,
      after: after.count,
      by: del.by,
    });
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const error = results.filter((r) => r.status === "error").length;
  console.log(`\nResumen => ok: ${ok}, partial: ${partial}, error: ${error}\n`);
  for (const r of results) {
    if (r.status === "ok") {
      console.log(`[OK] ${r.table} | ${r.before ?? 0} -> ${r.after ?? 0}${r.note ? ` | ${r.note}` : ""}`);
    } else if (r.status === "partial") {
      console.log(`[PARTIAL] ${r.table} | ${r.before} -> ${r.after} | filtro: ${r.by}`);
    } else {
      console.log(`[ERROR] ${r.table} | etapa: ${r.stage} | ${r.error}`);
    }
  }

  if (error > 0 || partial > 0) {
    process.exitCode = 2;
  }
}

run().catch((err) => {
  console.error("Fallo general:", err?.message || err);
  process.exit(1);
});

