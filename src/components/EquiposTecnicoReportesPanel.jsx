import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

const ESTADO_COLORS = {
  almacen:   { bg: "#dbeafe", text: "#1d4ed8", label: "Almacén" },
  asignado:  { bg: "#dcfce7", text: "#16a34a", label: "Asignado" },
  liquidado: { bg: "#fef9c3", text: "#b45309", label: "Liquidado" },
};
const normalizeEstado = (e) => (e || "").toLowerCase();
const prefijoCodigo = (codigo) => {
  const c = String(codigo || "").toUpperCase();
  if (c.startsWith("DIM")) return "DIM";
  if (c.startsWith("AMN")) return "AMN";
  return "OTRO";
};
const estadoLabel = (e) => ESTADO_COLORS[normalizeEstado(e)]?.label || e || "—";
const estadoStyle = (e) => {
  const conf = ESTADO_COLORS[normalizeEstado(e)];
  return conf
    ? { background: conf.bg, color: conf.text, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 }
    : { background: "#f3f4f6", color: "#374151", borderRadius: 6, padding: "2px 8px", fontSize: 12 };
};

export default function EquiposTecnicoReportesPanel({ cardStyle, sectionTitleStyle }) {
  const [equipos, setEquipos] = useState([]);
  const [liqEquipos, setLiqEquipos] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [historicoPorEquipo, setHistoricoPorEquipo] = useState(new Map());
  const [fechaAsignacionMap, setFechaAsignacionMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroTecnico, setFiltroTecnico] = useState("todos");
  const [filtroPrefijo, setFiltroPrefijo] = useState("todos");
  const [expandido, setExpandido] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data: eqData, error: eqErr } = await supabase
          .from("equipos_catalogo")
          .select("id,empresa,tipo,marca,modelo,codigo_qr,serial_mac,estado,tecnico_asignado,precio_unitario")
          .in("estado", ["asignado", "liquidado"]);
        if (eqErr) throw eqErr;

        // Fecha de asignación (para "días en custodia") — última salida "Asignacion a tecnico" por código QR
        const codigosQrTodos = [...new Set((eqData || []).map((e) => String(e.codigo_qr || "").trim()).filter(Boolean))];
        const fechaAsignacionPorCodigo = new Map();
        if (codigosQrTodos.length) {
          const { data: movData } = await supabase
            .from("inventario_movimientos")
            .select("referencia,created_at")
            .eq("tipo_item", "equipo")
            .eq("movimiento", "salida")
            .eq("motivo", "Asignacion a tecnico")
            .in("referencia", codigosQrTodos)
            .order("created_at", { ascending: false });
          for (const m of (movData || [])) {
            const ref = String(m.referencia || "").trim();
            if (ref && !fechaAsignacionPorCodigo.has(ref)) fechaAsignacionPorCodigo.set(ref, m.created_at);
          }
        }

        const idsLiquidados = (eqData || []).filter((e) => normalizeEstado(e.estado) === "liquidado").map((e) => e.id);
        let liqEqData = [];
        if (idsLiquidados.length) {
          const { data, error: liqEqErr } = await supabase
            .from("liquidacion_equipos")
            .select("id_inventario,liquidacion_id")
            .in("id_inventario", idsLiquidados);
          if (liqEqErr) throw liqEqErr;
          liqEqData = data || [];
        }

        const liquidacionIds = [...new Set(liqEqData.map((l) => l.liquidacion_id).filter(Boolean))];
        let liqData = [];
        if (liquidacionIds.length) {
          const { data, error: liqErr } = await supabase
            .from("liquidaciones")
            .select("id,codigo,dni,nombre,nodo,tecnico_liquida,fecha_liquidacion,usuario_nodo")
            .in("id", liquidacionIds);
          if (liqErr) throw liqErr;
          liqData = data || [];
        }

        // Fallback: equipos liquidados sin match en liquidaciones "en vivo" — buscar en
        // el historial migrado de AppSheet (onu_liquidacion_relacion -> historial_appsheet_liquidaciones),
        // ya que en esas fechas la liquidacion se hacia en otro sistema.
        const idsConMatch = new Set(liqEqData.map((l) => l.id_inventario));
        const equiposSinMatch = (eqData || []).filter(
          (e) => normalizeEstado(e.estado) === "liquidado" && !idsConMatch.has(e.id)
        );
        const historico = new Map();
        const codigosQr = [...new Set(equiposSinMatch.map((e) => String(e.codigo_qr || "").trim()).filter(Boolean))];
        if (codigosQr.length) {
          const { data: relData } = await supabase
            .from("onu_liquidacion_relacion")
            .select("id_onu,liquidacion_codigo")
            .in("id_onu", codigosQr);
          const relPorOnu = new Map((relData || []).map((r) => [String(r.id_onu || "").trim().toUpperCase(), r.liquidacion_codigo]));

          const codigosLiq = [...new Set((relData || []).map((r) => r.liquidacion_codigo).filter(Boolean))];
          let liqHistData = [];
          if (codigosLiq.length) {
            const { data } = await supabase
              .from("historial_appsheet_liquidaciones")
              .select("*")
              .in("codigo", codigosLiq);
            liqHistData = data || [];
          }
          const liqHistPorCodigo = new Map(liqHistData.map((l) => [String(l.codigo || "").trim().toUpperCase(), l]));

          for (const e of equiposSinMatch) {
            const liqCodigo = relPorOnu.get(String(e.codigo_qr || "").trim().toUpperCase());
            if (!liqCodigo) continue;
            const liqHist = liqHistPorCodigo.get(String(liqCodigo).trim().toUpperCase());
            if (!liqHist) continue;
            historico.set(e.id, {
              codigo: liqHist.codigo,
              nombre: liqHist.nombre || liqHist.cliente,
              dni: liqHist.dni,
              nodo: liqHist.nodo,
              usuario_nodo: liqHist.usuario_pppoe || liqHist.usuario_nodo,
              fecha_liquidacion: liqHist.fecha,
              fuente: "Historial AppSheet",
            });
          }
        }

        setEquipos(eqData || []);
        setLiqEquipos(liqEqData);
        setLiquidaciones(liqData);
        setHistoricoPorEquipo(historico);
        setFechaAsignacionMap(fechaAsignacionPorCodigo);
      } catch (e) {
        setError(e?.message || "Error al cargar el reporte.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // id_inventario (equipos_catalogo.id) -> liquidación enriquecida
  const liquidacionPorEquipo = useMemo(() => {
    const liqPorId = new Map(liquidaciones.map((l) => [l.id, l]));
    const map = new Map();
    for (const le of liqEquipos) {
      const liq = liqPorId.get(le.liquidacion_id);
      if (liq) map.set(le.id_inventario, liq);
    }
    return map;
  }, [liqEquipos, liquidaciones]);

  const tecnicos = useMemo(
    () => ["todos", ...new Set(equipos.map((e) => e.tecnico_asignado).filter(Boolean))].sort(),
    [equipos]
  );

  const porTecnico = useMemo(() => {
    let base = filtroTecnico === "todos" ? equipos : equipos.filter((e) => e.tecnico_asignado === filtroTecnico);
    if (filtroPrefijo !== "todos") base = base.filter((e) => prefijoCodigo(e.codigo_qr) === filtroPrefijo);
    const grupos = new Map();
    for (const e of base) {
      const key = e.tecnico_asignado || "Sin asignar";
      if (!grupos.has(key)) grupos.set(key, { custodia: [], liquidados: [] });
      const g = grupos.get(key);
      if (normalizeEstado(e.estado) === "liquidado") {
        g.liquidados.push({ ...e, liq: liquidacionPorEquipo.get(e.id) || historicoPorEquipo.get(e.id) || null });
      } else {
        const fechaAsig = fechaAsignacionMap.get(String(e.codigo_qr || "").trim()) || null;
        const dias = fechaAsig ? Math.floor((Date.now() - new Date(fechaAsig).getTime()) / 86400000) : null;
        g.custodia.push({ ...e, fechaAsignacion: fechaAsig, diasCustodia: dias });
      }
    }
    for (const g of grupos.values()) {
      g.valorCustodia = g.custodia.reduce((s, e) => s + Number(e.precio_unitario || 0), 0);
      g.valorLiquidados = g.liquidados.reduce((s, e) => s + Number(e.precio_unitario || 0), 0);
    }
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [equipos, filtroTecnico, filtroPrefijo, liquidacionPorEquipo, historicoPorEquipo, fechaAsignacionMap]);

  const equiposVisibles = filtroPrefijo === "todos" ? equipos : equipos.filter((e) => prefijoCodigo(e.codigo_qr) === filtroPrefijo);
  const totalCustodia = equiposVisibles.filter((e) => normalizeEstado(e.estado) === "asignado").length;
  const totalLiquidados = equiposVisibles.filter((e) => normalizeEstado(e.estado) === "liquidado").length;

  const generarPdf = () => {
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const ahora = new Date();
    const fmtDate = (d) => d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
    const valorCustodiaTotal = porTecnico.reduce((s, [, g]) => s + g.valorCustodia, 0);
    const valorLiquidadosTotal = porTecnico.reduce((s, [, g]) => s + g.valorLiquidados, 0);

    const secciones = porTecnico.map(([tecnico, { custodia, liquidados, valorCustodia, valorLiquidados }]) => {
      const filasCustodia = custodia.map((e) => `
        <tr>
          <td>${esc(e.tipo || "-")}${e.marca ? ` · ${esc(e.marca)}` : ""}</td>
          <td>${esc(e.serial_mac || "-")}</td>
          <td>${esc(e.codigo_qr || "-")}</td>
          <td>${Number(e.precio_unitario || 0).toFixed(2)}</td>
          <td>${e.diasCustodia == null ? "—" : `${e.diasCustodia}d`}</td>
        </tr>`).join("");
      const filasLiquidados = liquidados.map((e) => `
        <tr>
          <td>${esc(e.tipo || "-")}${e.marca ? ` · ${esc(e.marca)}` : ""}</td>
          <td>${esc(e.codigo_qr || "-")}</td>
          <td>${esc(e.liq?.nombre || "—")}</td>
          <td>${esc(e.liq?.codigo || "—")}</td>
          <td>${e.liq?.fecha_liquidacion ? esc(String(e.liq.fecha_liquidacion).slice(0, 10)) : "—"}</td>
          <td>${Number(e.precio_unitario || 0).toFixed(2)}</td>
        </tr>`).join("");
      return `
        <div class="tecnico-section">
          <div class="tecnico-header">
            <span class="tecnico-title">${esc(tecnico)}</span>
            <span class="tecnico-sub">${custodia.length} en custodia (S/ ${valorCustodia.toFixed(2)}) · ${liquidados.length} liquidados (S/ ${valorLiquidados.toFixed(2)})</span>
          </div>
          ${custodia.length ? `
          <div class="sub-label">En custodia</div>
          <table><thead><tr><th>Tipo/Marca</th><th>Serial</th><th>Código QR</th><th>Valor S/</th><th>Días</th></tr></thead>
          <tbody>${filasCustodia}</tbody></table>` : ""}
          ${liquidados.length ? `
          <div class="sub-label">Liquidados</div>
          <table><thead><tr><th>Tipo/Marca</th><th>Código QR</th><th>Cliente</th><th>Orden</th><th>Fecha</th><th>Valor S/</th></tr></thead>
          <tbody>${filasLiquidados}</tbody></table>` : ""}
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Equipos por Técnico ${fmtDate(ahora)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#1E293B;padding:24px}
.header{display:flex;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #1E4F9C}
.company{font-size:18px;font-weight:900;color:#1E4F9C}
.report-title{font-size:13px;font-weight:700;color:#374151;margin-top:4px}
.stats-row{display:flex;gap:10px;margin-bottom:16px}
.stat-card{flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px;text-align:center}
.stat-num{font-size:20px;font-weight:900;color:#1E4F9C}
.stat-label{font-size:9px;color:#94A3B8;font-weight:600}
.tecnico-section{margin-bottom:18px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;page-break-inside:avoid}
.tecnico-header{display:flex;justify-content:space-between;padding:8px 12px;background:#F8FAFC;border-bottom:1px solid #E2E8F0}
.tecnico-title{font-size:12px;font-weight:800}
.tecnico-sub{font-size:10px;color:#64748B}
.sub-label{font-size:10px;font-weight:700;color:#64748B;padding:6px 12px 2px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{background:#1E4F9C;color:#fff;font-size:9px;padding:5px 8px;text-align:left}
td{padding:4px 8px;font-size:10px;border-bottom:1px solid #F1F5F9}
@media print{body{padding:12px}}
</style></head><body>
<div class="header">
  <div><div class="company">Americanet</div><div class="report-title">Reporte de Equipos por Técnico — Custodia y Liquidados</div></div>
  <div style="text-align:right;color:#64748B;font-size:10px"><div><strong>Generado:</strong> ${fmtDate(ahora)}</div></div>
</div>
<div class="stats-row">
  <div class="stat-card"><div class="stat-num">${equiposVisibles.length}</div><div class="stat-label">Total equipos</div></div>
  <div class="stat-card"><div class="stat-num">${totalCustodia}</div><div class="stat-label">En custodia (S/ ${valorCustodiaTotal.toFixed(2)})</div></div>
  <div class="stat-card"><div class="stat-num">${totalLiquidados}</div><div class="stat-label">Liquidados (S/ ${valorLiquidadosTotal.toFixed(2)})</div></div>
</div>
${secciones}
</body></html>`;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { window.alert("Permite ventanas emergentes para generar el PDF."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  if (loading) return <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Cargando reporte...</div>;
  if (error) return <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#dc2626" }}>{error}</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Equipos por Técnico — Custodia y Liquidados</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
          Qué equipo tiene cada técnico en custodia (asignado, aún sin liquidar) y cuáles ya liquidó — con cliente y orden.
        </p>

        <div style={{ display: "flex", gap: 12, margin: "16px 0", flexWrap: "wrap" }}>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b" }}>{equiposVisibles.length}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Total</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{totalCustodia}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>En custodia</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#b45309" }}>{totalLiquidados}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Liquidados</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Técnico{" "}
            <select value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)} style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              {tecnicos.map((t) => <option key={t} value={t}>{t === "todos" ? "Todos" : t}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Código{" "}
            <select value={filtroPrefijo} onChange={(e) => setFiltroPrefijo(e.target.value)} style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              <option value="todos">Todos</option>
              <option value="AMN">AMN (Americanet)</option>
              <option value="DIM">DIM</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
          <button
            type="button"
            onClick={generarPdf}
            disabled={porTecnico.length === 0}
            style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: 6, border: "none", background: "#1E4F9C", color: "#fff", fontWeight: 700, fontSize: 13, cursor: porTecnico.length === 0 ? "not-allowed" : "pointer", opacity: porTecnico.length === 0 ? 0.5 : 1 }}
          >
            📄 PDF
          </button>
        </div>
      </div>

      {porTecnico.length === 0 ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Sin equipos asignados o liquidados.</div>
      ) : (
        porTecnico.map(([tecnico, { custodia, liquidados, valorCustodia, valorLiquidados }]) => {
          const abierto = expandido[tecnico] !== false;
          return (
            <div key={tecnico} style={cardStyle}>
              <button
                type="button"
                onClick={() => setExpandido((p) => ({ ...p, [tecnico]: !abierto }))}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{tecnico}</span>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {custodia.length} en custodia (S/ {valorCustodia.toFixed(2)}) · {liquidados.length} liquidados (S/ {valorLiquidados.toFixed(2)}) {abierto ? "▲" : "▼"}
                </span>
              </button>

              {abierto && (
                <div style={{ marginTop: 14, display: "grid", gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", marginBottom: 6 }}>
                      En custodia ({custodia.length})
                    </div>
                    {custodia.length === 0 ? (
                      <p style={{ fontSize: 12, color: "#94a3b8" }}>Sin equipos en custodia.</p>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ textAlign: "left", color: "#64748b" }}>
                            <th style={{ padding: "6px 8px" }}>Tipo / Marca</th>
                            <th style={{ padding: "6px 8px" }}>Serial</th>
                            <th style={{ padding: "6px 8px" }}>Código QR</th>
                            <th style={{ padding: "6px 8px" }}>Valor S/</th>
                            <th style={{ padding: "6px 8px" }}>Días en custodia</th>
                            <th style={{ padding: "6px 8px" }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {custodia.map((e) => (
                            <tr key={e.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "6px 8px" }}><strong>{e.tipo || "-"}</strong>{e.marca ? ` · ${e.marca}` : ""}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.serial_mac || "-"}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.codigo_qr || "-"}</td>
                              <td style={{ padding: "6px 8px" }}>{Number(e.precio_unitario || 0).toFixed(2)}</td>
                              <td style={{ padding: "6px 8px" }}>
                                {e.diasCustodia == null ? "—" : (
                                  <span style={{ fontWeight: 700, color: e.diasCustodia > 30 ? "#dc2626" : e.diasCustodia > 15 ? "#d97706" : "#16a34a" }}>
                                    {e.diasCustodia}d
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "6px 8px" }}><span style={estadoStyle(e.estado)}>{estadoLabel(e.estado)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", textTransform: "uppercase", marginBottom: 6 }}>
                      Liquidados ({liquidados.length})
                    </div>
                    {liquidados.length === 0 ? (
                      <p style={{ fontSize: 12, color: "#94a3b8" }}>Sin equipos liquidados.</p>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ textAlign: "left", color: "#64748b" }}>
                            <th style={{ padding: "6px 8px" }}>Tipo / Marca</th>
                            <th style={{ padding: "6px 8px" }}>Código QR</th>
                            <th style={{ padding: "6px 8px" }}>Serial</th>
                            <th style={{ padding: "6px 8px" }}>Cliente</th>
                            <th style={{ padding: "6px 8px" }}>PPPoE</th>
                            <th style={{ padding: "6px 8px" }}>Orden</th>
                            <th style={{ padding: "6px 8px" }}>Fecha</th>
                            <th style={{ padding: "6px 8px" }}>Valor S/</th>
                            <th style={{ padding: "6px 8px" }}>Fuente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liquidados.map((e) => (
                            <tr key={e.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "6px 8px" }}><strong>{e.tipo || "-"}</strong>{e.marca ? ` · ${e.marca}` : ""}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.codigo_qr || "-"}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.serial_mac || "-"}</td>
                              <td style={{ padding: "6px 8px" }}>{e.liq?.nombre || "—"}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.liq?.usuario_nodo || "—"}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.liq?.codigo || "—"}</td>
                              <td style={{ padding: "6px 8px" }}>{e.liq?.fecha_liquidacion ? String(e.liq.fecha_liquidacion).slice(0, 10) : "—"}</td>
                              <td style={{ padding: "6px 8px" }}>{Number(e.precio_unitario || 0).toFixed(2)}</td>
                              <td style={{ padding: "6px 8px" }}>
                                {e.liq ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: e.liq.fuente === "Historial AppSheet" ? "#ede9fe" : "#dbeafe", color: e.liq.fuente === "Historial AppSheet" ? "#6d28d9" : "#1d4ed8" }}>
                                    {e.liq.fuente === "Historial AppSheet" ? "AppSheet" : "Sistema"}
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
