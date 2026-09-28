import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

// Kardex = historial de movimientos de inventario, tabla inventario_movimientos
// (la misma que ya usan InventarioPanel/EquiposTecnicoReportesPanel/etc.).
// "movimiento" = "entrada" | "salida" (a veces "ingreso"/"salida" segun quien
// lo registro -- se normaliza al mostrar).
const MOVIMIENTO_LABEL = {
  entrada: { label: "Entrada", bg: "#dcfce7", text: "#16a34a" },
  ingreso: { label: "Entrada", bg: "#dcfce7", text: "#16a34a" },
  salida:  { label: "Salida",  bg: "#fee2e2", text: "#dc2626" },
};
function movimientoInfo(m) {
  const k = String(m || "").trim().toLowerCase();
  return MOVIMIENTO_LABEL[k] || { label: m || "—", bg: "#f3f4f6", text: "#374151" };
}

const PAGE_SIZE = 1000;

async function fetchAllPaged(table, columns, orderCol) {
  const filas = [];
  let offset = 0;
  while (true) {
    let q = supabase.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (orderCol) q = q.order(orderCol, { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    const chunk = data || [];
    filas.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return filas;
}

export default function KardexInventarioPanel({ cardStyle, sectionTitleStyle }) {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filtroMaterial, setFiltroMaterial] = useState("todos");
  const [filtroTecnico, setFiltroTecnico] = useState("todos");
  const [filtroNodo, setFiltroNodo] = useState("todos");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const columnas = "id,created_at,tipo_item,movimiento,motivo,item_nombre,referencia,cantidad,unidad,costo_unitario,tecnico,actor,nodo,almacen_id,almacen_nombre";
        let filas;
        try {
          filas = await fetchAllPaged("inventario_movimientos", columnas, "created_at");
        } catch (e) {
          // Igual que en InventarioPanel: si "nodo" o "almacen_*" no existen
          // en este entorno (columnas agregadas despues), reintentar sin ellas
          // en vez de romper todo el reporte.
          const msg = String(e?.message || "").toLowerCase();
          if (msg.includes("nodo") || msg.includes("almacen")) {
            filas = await fetchAllPaged("inventario_movimientos", "id,created_at,tipo_item,movimiento,motivo,item_nombre,referencia,cantidad,unidad,costo_unitario,tecnico,actor", "created_at");
          } else {
            throw e;
          }
        }
        setMovimientos(filas);
      } catch (e) {
        setError(e?.message || "Error al cargar el kardex.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const materiales = useMemo(
    () => ["todos", ...new Set(movimientos.map((m) => m.item_nombre).filter(Boolean))].sort(),
    [movimientos]
  );
  const tecnicos = useMemo(
    () => ["todos", ...new Set(movimientos.map((m) => m.tecnico).filter(Boolean))].sort(),
    [movimientos]
  );
  const nodos = useMemo(
    () => ["todos", ...new Set(movimientos.map((m) => m.nodo).filter(Boolean))].sort(),
    [movimientos]
  );

  const fechaEnRango = (fecha) => {
    if (!filtroFechaDesde && !filtroFechaHasta) return true;
    if (!fecha) return false;
    const f = String(fecha).slice(0, 10);
    if (filtroFechaDesde && f < filtroFechaDesde) return false;
    if (filtroFechaHasta && f > filtroFechaHasta) return false;
    return true;
  };

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return movimientos.filter((m) => {
      if (filtroMaterial !== "todos" && m.item_nombre !== filtroMaterial) return false;
      if (filtroTecnico !== "todos" && m.tecnico !== filtroTecnico) return false;
      if (filtroNodo !== "todos" && m.nodo !== filtroNodo) return false;
      if (!fechaEnRango(m.created_at)) return false;
      if (q) {
        const hay = `${m.item_nombre || ""} ${m.referencia || ""} ${m.motivo || ""} ${m.tecnico || ""} ${m.actor || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movimientos, filtroMaterial, filtroTecnico, filtroNodo, filtroFechaDesde, filtroFechaHasta, buscar]);

  const totalEntradas = filtrados.filter((m) => movimientoInfo(m.movimiento).label === "Entrada").length;
  const totalSalidas = filtrados.filter((m) => movimientoInfo(m.movimiento).label === "Salida").length;
  const valorTotal = filtrados.reduce((s, m) => s + (Number(m.cantidad) || 0) * (Number(m.costo_unitario) || 0), 0);

  const hayFiltrosActivos = filtroMaterial !== "todos" || filtroTecnico !== "todos" || filtroNodo !== "todos" || filtroFechaDesde || filtroFechaHasta || buscar.trim();

  const limpiarFiltros = () => {
    setFiltroMaterial("todos"); setFiltroTecnico("todos"); setFiltroNodo("todos");
    setFiltroFechaDesde(""); setFiltroFechaHasta(""); setBuscar("");
  };

  const generarPdf = () => {
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const ahora = new Date();
    const fmtDate = (d) => d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
    const fmtFechaHora = (iso) => iso ? new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "—";

    const chips = [];
    if (filtroMaterial !== "todos") chips.push(`Material: ${filtroMaterial}`);
    if (filtroTecnico !== "todos") chips.push(`Técnico: ${filtroTecnico}`);
    if (filtroNodo !== "todos") chips.push(`Nodo: ${filtroNodo}`);
    if (filtroFechaDesde) chips.push(`Desde: ${filtroFechaDesde}`);
    if (filtroFechaHasta) chips.push(`Hasta: ${filtroFechaHasta}`);
    if (buscar.trim()) chips.push(`Búsqueda: "${buscar.trim()}"`);

    const filas = filtrados.map((m) => {
      const info = movimientoInfo(m.movimiento);
      return `
        <tr>
          <td>${esc(fmtFechaHora(m.created_at))}</td>
          <td><span class="badge" style="background:${info.bg};color:${info.text}">${esc(info.label)}</span></td>
          <td>${esc(m.item_nombre || "-")}</td>
          <td style="text-align:right">${esc(m.cantidad ?? "-")} ${esc(m.unidad || "")}</td>
          <td>${esc(m.tecnico || "—")}</td>
          <td>${esc(m.nodo || "—")}</td>
          <td>${esc(m.motivo || "—")}</td>
          <td>${esc(m.referencia || "—")}</td>
        </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Kardex de Inventario ${fmtDate(ahora)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#1E293B;padding:24px}
.header{display:flex;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #1E4F9C}
.company{font-size:18px;font-weight:900;color:#1E4F9C}
.report-title{font-size:13px;font-weight:700;color:#374151;margin-top:4px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.chip{background:#EFF6FF;color:#1D4ED8;border-radius:999px;padding:3px 10px;font-size:10px;font-weight:600}
.stats-row{display:flex;gap:10px;margin-bottom:16px}
.stat-card{flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px;text-align:center}
.stat-num{font-size:20px;font-weight:900;color:#1E4F9C}
.stat-label{font-size:9px;color:#94A3B8;font-weight:600}
table{width:100%;border-collapse:collapse}
th{background:#1E4F9C;color:#fff;font-size:9px;padding:5px 8px;text-align:left}
td{padding:4px 8px;font-size:10px;border-bottom:1px solid #F1F5F9}
.badge{border-radius:6px;padding:2px 7px;font-size:9px;font-weight:700}
@media print{body{padding:12px}}
</style></head><body>
<div class="header">
  <div><div class="company">Americanet</div><div class="report-title">Kardex de Inventario</div></div>
  <div style="text-align:right;color:#64748B;font-size:10px"><div><strong>Generado:</strong> ${fmtDate(ahora)}</div></div>
</div>
${chips.length ? `<div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}
<div class="stats-row">
  <div class="stat-card"><div class="stat-num">${filtrados.length}</div><div class="stat-label">Movimientos</div></div>
  <div class="stat-card"><div class="stat-num">${totalEntradas}</div><div class="stat-label">Entradas</div></div>
  <div class="stat-card"><div class="stat-num">${totalSalidas}</div><div class="stat-label">Salidas</div></div>
  <div class="stat-card"><div class="stat-num">S/ ${valorTotal.toFixed(2)}</div><div class="stat-label">Valor movido</div></div>
</div>
<table>
  <thead><tr><th>Fecha</th><th>Tipo</th><th>Material</th><th>Cantidad</th><th>Técnico</th><th>Nodo</th><th>Motivo</th><th>Referencia</th></tr></thead>
  <tbody>${filas}</tbody>
</table>
</body></html>`;
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) { window.alert("Permite ventanas emergentes para generar el PDF."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  if (loading) return <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Cargando kardex...</div>;
  if (error) return <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#dc2626" }}>{error}</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Kardex de Inventario</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
          Historial completo de entradas y salidas de materiales — filtrable por material, técnico, nodo y fecha.
        </p>

        <div style={{ display: "flex", gap: 12, margin: "16px 0", flexWrap: "wrap" }}>
          <div style={{ ...cardStyle, flex: 1, minWidth: 110, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b" }}>{filtrados.length}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Movimientos</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 110, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{totalEntradas}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Entradas</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 110, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#dc2626" }}>{totalSalidas}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Salidas</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 110, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b" }}>S/ {valorTotal.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Valor movido</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Material<br />
            <select value={filtroMaterial} onChange={(e) => setFiltroMaterial(e.target.value)} style={{ marginTop: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", minWidth: 160 }}>
              {materiales.map((m) => <option key={m} value={m}>{m === "todos" ? "Todos" : m}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Técnico<br />
            <select value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)} style={{ marginTop: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", minWidth: 140 }}>
              {tecnicos.map((t) => <option key={t} value={t}>{t === "todos" ? "Todos" : t}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Nodo<br />
            <select value={filtroNodo} onChange={(e) => setFiltroNodo(e.target.value)} style={{ marginTop: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", minWidth: 120 }}>
              {nodos.map((n) => <option key={n} value={n}>{n === "todos" ? "Todos" : n}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Desde<br />
            <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} style={{ marginTop: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Hasta<br />
            <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} style={{ marginTop: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Buscar<br />
            <input type="text" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="motivo, referencia..." style={{ marginTop: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }} />
          </label>
          {hayFiltrosActivos && (
            <button type="button" onClick={limpiarFiltros} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 12, cursor: "pointer" }}>
              ✕ Limpiar filtros
            </button>
          )}
          <button
            type="button"
            onClick={generarPdf}
            disabled={filtrados.length === 0}
            style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: 6, border: "none", background: "#1E4F9C", color: "#fff", fontWeight: 700, fontSize: 13, cursor: filtrados.length === 0 ? "not-allowed" : "pointer", opacity: filtrados.length === 0 ? 0.5 : 1 }}
          >
            📄 Exportar PDF
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        {filtrados.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>Sin movimientos con estos filtros.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "8px 10px" }}>Fecha</th>
                  <th style={{ padding: "8px 10px" }}>Tipo</th>
                  <th style={{ padding: "8px 10px" }}>Material</th>
                  <th style={{ padding: "8px 10px" }}>Cantidad</th>
                  <th style={{ padding: "8px 10px" }}>Técnico</th>
                  <th style={{ padding: "8px 10px" }}>Nodo</th>
                  <th style={{ padding: "8px 10px" }}>Motivo</th>
                  <th style={{ padding: "8px 10px" }}>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((m) => {
                  const info = movimientoInfo(m.movimiento);
                  return (
                    <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "7px 10px", color: "#64748b" }}>{m.created_at ? new Date(m.created_at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                      <td style={{ padding: "7px 10px" }}><span style={{ background: info.bg, color: info.text, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{info.label}</span></td>
                      <td style={{ padding: "7px 10px", fontWeight: 600 }}>{m.item_nombre || "-"}</td>
                      <td style={{ padding: "7px 10px" }}>{m.cantidad ?? "-"} {m.unidad || ""}</td>
                      <td style={{ padding: "7px 10px" }}>{m.tecnico || "—"}</td>
                      <td style={{ padding: "7px 10px" }}>{m.nodo || "—"}</td>
                      <td style={{ padding: "7px 10px" }}>{m.motivo || "—"}</td>
                      <td style={{ padding: "7px 10px", fontFamily: "monospace" }}>{m.referencia || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
