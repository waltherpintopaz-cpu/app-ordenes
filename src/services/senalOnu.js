// Señal de la ONU + liquidacion de una orden, para el panel de datos del chat
// (web y app usan la misma logica; 13-nov).
// - Señal medida por el tecnico al liquidar: liquidaciones.parametro
// - Señal guardada del cliente: clientes.rx_signal/tx_signal (se actualiza sola)
// - Señal EN VIVO: se consulta a la OLT (VSOL para nodos DIM 04-07, Huawei
//   para 01-03) y se guarda en clientes.

const CAMPOS_LIQ = "resultado_final,tecnico_liquida,observacion_final,parametro,caja_nap,sn_onu_liquidacion,codigo_etiqueta,cobro_realizado,monto_cobrado,medio_pago,fecha_liquidacion,fotos";

export const calidadSenal = (rx) => {
  const n = Number(String(rx ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!String(rx ?? "").trim() || !Number.isFinite(n) || n === 0) return null;
  const v = n > 0 ? -n : n;
  if (v >= -25) return { v, txt: v.toFixed(2).replace(/\.?0+$/, ""), t: "Buena", c: "#15803d", bg: "#f0fdf4", b: "#bbf7d0" };
  if (v >= -27) return { v, txt: v.toFixed(2).replace(/\.?0+$/, ""), t: "Regular", c: "#b45309", bg: "#fffbeb", b: "#fde68a" };
  return { v, txt: v.toFixed(2).replace(/\.?0+$/, ""), t: "Mala", c: "#b91c1c", bg: "#fef2f2", b: "#fecaca" };
};

export const haceTexto = (iso) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
};

// Liquidacion (la ultima) + señal guardada del cliente.
export async function cargarLiquidacionYSenal(supabase, orden) {
  const id = Number(orden?.id);
  const codigo = String(orden?.codigo || "").trim();
  let liq = null;
  try {
    if (Number.isFinite(id) && id > 0 && id < 1e12) {
      ({ data: liq } = await supabase.from("liquidaciones").select(CAMPOS_LIQ).eq("orden_original_id", id).order("id", { ascending: false }).limit(1).maybeSingle());
    }
    if (!liq && codigo) {
      ({ data: liq } = await supabase.from("liquidaciones").select(CAMPOS_LIQ).eq("codigo", codigo).order("id", { ascending: false }).limit(1).maybeSingle());
    }
  } catch { liq = null; }
  const dni = String(orden?.dni || "").trim();
  let sn = String(liq?.sn_onu_liquidacion || orden?.sn_onu || orden?.snOnu || "").trim();
  let cli = null;
  try {
    const sel = "rx_signal,tx_signal,signal_updated_at,sn_onu,nodo";
    if (sn) ({ data: cli } = await supabase.from("clientes").select(sel).eq("sn_onu", sn).order("signal_updated_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle());
    if (!cli && dni) ({ data: cli } = await supabase.from("clientes").select(sel).eq("dni", dni).order("signal_updated_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle());
  } catch { cli = null; }
  if (!sn) sn = String(cli?.sn_onu || "").trim();
  const fotos = Array.isArray(liq?.fotos) ? liq.fotos.filter((u) => typeof u === "string" && u) : [];
  return { liq, cli, sn, fotos };
}

// Que OLT consultar segun el nodo ("Nod_06", "NOD_06", "nod06"...).
const tipoOlt = (nodo, sn) => {
  const k = String(nodo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = k.match(/^NOD0*(\d+)$/);
  if (m) return Number(m[1]) >= 4 ? "vsol" : "huawei";
  return /^HWTC/i.test(String(sn || "")) ? "huawei" : "";
};

// Consulta EN VIVO a la OLT. apis = { vsol, huawei } (URLs base).
// Devuelve { rx, tx, at } o lanza error con mensaje legible.
export async function consultarSenalEnVivo(supabase, { sn, nodo, apis }) {
  const snUp = String(sn || "").trim().toUpperCase();
  if (!snUp) throw new Error("La orden no tiene SN de ONU.");
  const tipo = tipoOlt(nodo, snUp);
  const orden = tipo === "huawei" ? ["huawei", "vsol"] : tipo === "vsol" ? ["vsol"] : ["vsol", "huawei"];
  let ultimoError = "No se pudo leer la señal.";
  for (const t of orden) {
    const base = String(apis?.[t] || "").trim().replace(/\/+$/, "");
    if (!base) continue;
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
      const res = await fetch(`${base}/signal?sn=${encodeURIComponent(snUp)}`, ctrl ? { signal: ctrl.signal, cache: "no-store" } : undefined);
      if (timer) clearTimeout(timer);
      const json = await res.json().catch(() => ({}));
      if (!json.ok || json.rxPower == null) { ultimoError = json.error || `Error HTTP ${res.status}`; continue; }
      const at = new Date().toISOString();
      // Guardar en la ficha del cliente (asi el resto del sistema la ve).
      supabase.from("clientes").update({ rx_signal: json.rxPower, tx_signal: json.txPower ?? null, signal_updated_at: at }).eq("sn_onu", snUp)
        .then(() => {}, () => {});
      return { rx: json.rxPower, tx: json.txPower, at };
    } catch (e) {
      ultimoError = /abort/i.test(String(e?.name || e?.message)) ? "La OLT tardó demasiado en responder." : String(e?.message || e);
    }
  }
  throw new Error(ultimoError);
}
