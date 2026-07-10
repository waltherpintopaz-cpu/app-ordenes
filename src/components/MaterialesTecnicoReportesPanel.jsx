import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { Settings, Save, X } from "lucide-react";

const norm = (v) => String(v || "").trim().toLowerCase();

const LS_PRECIOS_KEY = "materiales_tecnico_precios";
function loadPreciosLS() {
  try { return JSON.parse(localStorage.getItem(LS_PRECIOS_KEY) || "{}"); } catch { return {}; }
}
function savePreciosLS(obj) {
  try { localStorage.setItem(LS_PRECIOS_KEY, JSON.stringify(obj)); } catch {}
}

async function fetchAllPaged(table, selectCols, filtros = (q) => q) {
  const all = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    let q = supabase.from(table).select(selectCols).order("id", { ascending: true });
    q = filtros(q);
    const { data, error } = await q.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export default function MaterialesTecnicoReportesPanel({ cardStyle, sectionTitleStyle }) {
  const [movimientos, setMovimientos] = useState([]);
  const [liqMateriales, setLiqMateriales] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [catalogoMateriales, setCatalogoMateriales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroTecnico, setFiltroTecnico] = useState("todos");
  const [filtroMaterial, setFiltroMaterial] = useState("todos");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [expandido, setExpandido] = useState({});
  const [preciosLocal, setPreciosLocal] = useState(loadPreciosLS);
  const [showConfig, setShowConfig] = useState(false);
  const [preciosEdit, setPreciosEdit] = useState({});
  const [saveMsg, setSaveMsg] = useState("");
  const [plantillasGenerales, setPlantillasGenerales] = useState([]);
  const [plantillaElegida, setPlantillaElegida] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const [movData, liqMatData, liqData, catData] = await Promise.all([
          fetchAllPaged(
            "inventario_movimientos",
            "id,created_at,tecnico,item_nombre,cantidad,unidad",
            (q) => q.eq("tipo_item", "material").eq("movimiento", "salida").eq("motivo", "Asignacion a tecnico")
          ),
          fetchAllPaged("liquidacion_materiales", "liquidacion_id,material,cantidad,unidad"),
          fetchAllPaged("liquidaciones", "id,tecnico_liquida,fecha_liquidacion,codigo"),
          fetchAllPaged("materiales_catalogo", "nombre,costo_unitario"),
        ]);
        setMovimientos(movData);
        setLiqMateriales(liqMatData);
        setLiquidaciones(liqData);
        setCatalogoMateriales(catData);
      } catch (e) {
        setError(e?.message || "Error al cargar el reporte.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const liqPorId = useMemo(() => new Map(liquidaciones.map((l) => [l.id, l])), [liquidaciones]);

  const costoDefaultPorMaterial = useMemo(() => {
    const map = new Map();
    for (const m of catalogoMateriales) map.set(norm(m.nombre), Number(m.costo_unitario || 0));
    return map;
  }, [catalogoMateriales]);

  // Precio efectivo: localStorage (Configurar Precios) tiene prioridad sobre materiales_catalogo.costo_unitario
  function getPrecio(nombre) {
    const k = norm(nombre);
    if (preciosLocal[k] !== undefined) return Number(preciosLocal[k]);
    return costoDefaultPorMaterial.get(k) || 0;
  }

  const materialesUnicos = useMemo(() => {
    const map = new Map();
    for (const m of movimientos) {
      const k = norm(m.item_nombre);
      if (k && !map.has(k)) map.set(k, { nombre: m.item_nombre, costo_unitario: costoDefaultPorMaterial.get(k) || 0 });
    }
    for (const m of catalogoMateriales) {
      const k = norm(m.nombre);
      if (k && !map.has(k)) map.set(k, { nombre: m.nombre, costo_unitario: Number(m.costo_unitario || 0) });
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [movimientos, catalogoMateriales, costoDefaultPorMaterial]);

  function openConfig() {
    const saved = loadPreciosLS();
    const init = {};
    for (const m of materialesUnicos) {
      const k = norm(m.nombre);
      init[k] = saved[k] !== undefined ? saved[k] : m.costo_unitario;
    }
    setPreciosEdit(init);
    setShowConfig(true);
    setSaveMsg("");
    (async () => {
      try {
        const { data } = await supabase.from("app_config").select("valor").eq("id", "reporte_plantillas").maybeSingle();
        setPlantillasGenerales(Array.isArray(data?.valor) ? data.valor : []);
      } catch { setPlantillasGenerales([]); }
    })();
  }

  // Trae precio base + margen % de materiales de la plantilla elegida en Reportes > General.
  function importarDeReportesGeneral() {
    const plantilla = plantillasGenerales.find((p) => p.nombre === plantillaElegida);
    if (!plantilla) { setSaveMsg("Selecciona una plantilla primero."); return; }
    const precioBaseMat = plantilla.precioBaseMat || {};
    const margenPorMat = plantilla.margenPorMat || {};
    const margenGlobal = Number(plantilla.margenGlobal || 0) || 0;

    setPreciosEdit((prev) => {
      const next = { ...prev };
      let importados = 0;
      for (const m of materialesUnicos) {
        const tieneAjuste = precioBaseMat[m.nombre] !== undefined || margenPorMat[m.nombre] !== undefined;
        if (!tieneAjuste && !margenGlobal) continue;
        const base = precioBaseMat[m.nombre] !== undefined ? Number(precioBaseMat[m.nombre]) : m.costo_unitario;
        const margen = margenPorMat[m.nombre] !== undefined ? Number(margenPorMat[m.nombre]) : margenGlobal;
        next[norm(m.nombre)] = Number((base * (1 + margen / 100)).toFixed(2));
        importados += 1;
      }
      setSaveMsg(importados > 0 ? `Se importaron ${importados} precio(s) de "${plantillaElegida}". Revisa y da clic en Guardar.` : `La plantilla "${plantillaElegida}" no tiene ajustes de materiales.`);
      return next;
    });
  }

  function restablecerPrecio(k, valorDefault) {
    setPreciosEdit((prev) => ({ ...prev, [k]: valorDefault }));
  }

  function guardarPrecios() {
    savePreciosLS(preciosEdit);
    setPreciosLocal({ ...preciosEdit });
    setSaveMsg("Precios guardados correctamente");
    setTimeout(() => { setSaveMsg(""); setShowConfig(false); }, 1500);
  }

  const fechaEnRango = (fecha) => {
    if (!filtroFechaDesde && !filtroFechaHasta) return true;
    if (!fecha) return false;
    const f = String(fecha).slice(0, 10);
    if (filtroFechaDesde && f < filtroFechaDesde) return false;
    if (filtroFechaHasta && f > filtroFechaHasta) return false;
    return true;
  };

  // Agrupa por técnico -> por material: { asignado, liquidado }
  const porTecnico = useMemo(() => {
    const grupos = new Map();
    const getGrupo = (tecnico) => {
      const key = tecnico || "Sin asignar";
      if (!grupos.has(key)) grupos.set(key, new Map());
      return grupos.get(key);
    };
    const getMaterial = (mapa, nombre, unidad) => {
      const key = norm(nombre);
      if (!mapa.has(key)) mapa.set(key, { nombre: nombre || "-", unidad: unidad || "unidad", asignado: 0, liquidado: 0 });
      return mapa.get(key);
    };

    for (const m of movimientos) {
      if (!fechaEnRango(m.created_at)) continue;
      const mapa = getGrupo(m.tecnico);
      const item = getMaterial(mapa, m.item_nombre, m.unidad);
      item.asignado += Number(m.cantidad || 0);
    }
    for (const lm of liqMateriales) {
      const liq = liqPorId.get(lm.liquidacion_id);
      if (!liq) continue;
      if (!fechaEnRango(liq.fecha_liquidacion)) continue;
      const mapa = getGrupo(liq.tecnico_liquida);
      const item = getMaterial(mapa, lm.material, lm.unidad);
      item.liquidado += Number(lm.cantidad || 0);
    }

    let entries = [...grupos.entries()].map(([tecnico, mapa]) => {
      const materiales = [...mapa.values()]
        .map((it) => {
          const enPoder = Math.max(it.asignado - it.liquidado, 0);
          const precio = getPrecio(it.nombre);
          return { ...it, enPoder, precio, valorAsignado: it.asignado * precio, valorLiquidado: it.liquidado * precio, valorEnPoder: enPoder * precio };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      return [tecnico, materiales];
    });

    if (filtroTecnico !== "todos") entries = entries.filter(([t]) => t === filtroTecnico);
    if (filtroMaterial !== "todos") {
      entries = entries
        .map(([t, mats]) => [t, mats.filter((m) => m.nombre === filtroMaterial)])
        .filter(([, mats]) => mats.length > 0);
    }
    entries = entries.filter(([, mats]) => mats.length > 0);
    return entries.sort(([a], [b]) => a.localeCompare(b));
  }, [movimientos, liqMateriales, liqPorId, filtroTecnico, filtroMaterial, filtroFechaDesde, filtroFechaHasta, preciosLocal, costoDefaultPorMaterial]);

  const tecnicos = useMemo(
    () => ["todos", ...new Set(movimientos.map((m) => m.tecnico).filter(Boolean))].sort(),
    [movimientos]
  );
  const materialesLista = useMemo(
    () => ["todos", ...new Set(movimientos.map((m) => m.item_nombre).filter(Boolean))].sort(),
    [movimientos]
  );

  const totales = porTecnico.reduce(
    (acc, [, mats]) => {
      for (const m of mats) {
        acc.asignado += m.asignado; acc.liquidado += m.liquidado; acc.enPoder += m.enPoder;
        acc.valorAsignado += m.valorAsignado; acc.valorLiquidado += m.valorLiquidado; acc.valorEnPoder += m.valorEnPoder;
      }
      return acc;
    },
    { asignado: 0, liquidado: 0, enPoder: 0, valorAsignado: 0, valorLiquidado: 0, valorEnPoder: 0 }
  );

  const generarPdf = () => {
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const ahora = new Date();
    const fmtDate = (d) => d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

    const secciones = porTecnico.map(([tecnico, mats]) => {
      const filas = mats.map((m) => `
        <tr>
          <td>${esc(m.nombre)}</td>
          <td>${m.asignado.toFixed(2)} ${esc(m.unidad)}</td>
          <td>${m.liquidado.toFixed(2)} ${esc(m.unidad)}</td>
          <td>${m.enPoder.toFixed(2)} ${esc(m.unidad)}</td>
          <td>S/ ${m.valorEnPoder.toFixed(2)}</td>
        </tr>`).join("");
      return `
        <div class="tecnico-section">
          <div class="tecnico-header"><span class="tecnico-title">${esc(tecnico)}</span></div>
          <table><thead><tr><th>Material</th><th>Asignado</th><th>Liquidado</th><th>En su poder</th><th>Valor en poder</th></tr></thead>
          <tbody>${filas}</tbody></table>
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Materiales por Técnico ${fmtDate(ahora)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#1E293B;padding:24px}
.header{display:flex;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #1E4F9C}
.company{font-size:18px;font-weight:900;color:#1E4F9C}
.report-title{font-size:13px;font-weight:700;color:#374151;margin-top:4px}
.stats-row{display:flex;gap:10px;margin-bottom:16px}
.stat-card{flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px;text-align:center}
.stat-num{font-size:18px;font-weight:900;color:#1E4F9C}
.stat-label{font-size:9px;color:#94A3B8;font-weight:600}
.tecnico-section{margin-bottom:18px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;page-break-inside:avoid}
.tecnico-header{padding:8px 12px;background:#F8FAFC;border-bottom:1px solid #E2E8F0}
.tecnico-title{font-size:12px;font-weight:800}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{background:#1E4F9C;color:#fff;font-size:9px;padding:5px 8px;text-align:left}
td{padding:4px 8px;font-size:10px;border-bottom:1px solid #F1F5F9}
@media print{body{padding:12px}}
</style></head><body>
<div class="header">
  <div><div class="company">Americanet</div><div class="report-title">Reporte de Materiales por Técnico — Asignado / Liquidado / En Poder</div></div>
  <div style="text-align:right;color:#64748B;font-size:10px"><div><strong>Generado:</strong> ${fmtDate(ahora)}</div></div>
</div>
<div class="stats-row">
  <div class="stat-card"><div class="stat-num">${totales.asignado.toFixed(2)}</div><div class="stat-label">Total asignado</div></div>
  <div class="stat-card"><div class="stat-num">${totales.liquidado.toFixed(2)}</div><div class="stat-label">Total liquidado</div></div>
  <div class="stat-card"><div class="stat-num">${totales.enPoder.toFixed(2)}</div><div class="stat-label">Total en poder</div></div>
  <div class="stat-card"><div class="stat-num">S/ ${totales.valorEnPoder.toFixed(2)}</div><div class="stat-label">Valor en poder</div></div>
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
        <h2 style={sectionTitleStyle}>Materiales por Técnico — Asignado / Liquidado / En su poder</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
          Cuánto material se le asignó a cada técnico, cuánto ya liquidó (usó en órdenes), y cuánto tiene actualmente en su poder.
        </p>

        <div style={{ display: "flex", gap: 12, margin: "16px 0", flexWrap: "wrap" }}>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1e293b" }}>{totales.asignado.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Asignado</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#b45309" }}>{totales.liquidado.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Liquidado</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>{totales.enPoder.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>En su poder</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#7c3aed" }}>S/ {totales.valorEnPoder.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Valor en poder</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Técnico{" "}
            <select value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)} style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              {tecnicos.map((t) => <option key={t} value={t}>{t === "todos" ? "Todos" : t}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Material{" "}
            <select value={filtroMaterial} onChange={(e) => setFiltroMaterial(e.target.value)} style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              {materialesLista.map((m) => <option key={m} value={m}>{m === "todos" ? "Todos" : m}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Desde{" "}
            <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Hasta{" "}
            <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }} />
          </label>
          {(filtroFechaDesde || filtroFechaHasta) && (
            <button type="button" onClick={() => { setFiltroFechaDesde(""); setFiltroFechaHasta(""); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 12, cursor: "pointer" }}>
              ✕ Limpiar fecha
            </button>
          )}
          <button
            type="button"
            onClick={openConfig}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            <Settings size={15} /> Configurar Precios
          </button>
          <button
            type="button"
            onClick={generarPdf}
            disabled={porTecnico.length === 0}
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#1E4F9C", color: "#fff", fontWeight: 700, fontSize: 13, cursor: porTecnico.length === 0 ? "not-allowed" : "pointer", opacity: porTecnico.length === 0 ? 0.5 : 1 }}
          >
            📄 PDF
          </button>
        </div>
      </div>

      {porTecnico.length === 0 ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Sin materiales asignados o liquidados con los filtros seleccionados.</div>
      ) : (
        porTecnico.map(([tecnico, materiales]) => {
          const abierto = expandido[tecnico] !== false;
          const subtotal = materiales.reduce((acc, m) => { acc.asignado += m.asignado; acc.liquidado += m.liquidado; acc.enPoder += m.enPoder; acc.valorEnPoder += m.valorEnPoder; return acc; }, { asignado: 0, liquidado: 0, enPoder: 0, valorEnPoder: 0 });
          return (
            <div key={tecnico} style={cardStyle}>
              <button
                type="button"
                onClick={() => setExpandido((p) => ({ ...p, [tecnico]: !abierto }))}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{tecnico}</span>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  Asignado {subtotal.asignado.toFixed(2)} · Liquidado {subtotal.liquidado.toFixed(2)} · En poder {subtotal.enPoder.toFixed(2)} (S/ {subtotal.valorEnPoder.toFixed(2)}) {abierto ? "▲" : "▼"}
                </span>
              </button>

              {abierto && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#64748b" }}>
                      <th style={{ padding: "6px 8px" }}>Material</th>
                      <th style={{ padding: "6px 8px" }}>Asignado</th>
                      <th style={{ padding: "6px 8px" }}>Liquidado</th>
                      <th style={{ padding: "6px 8px" }}>En su poder</th>
                      <th style={{ padding: "6px 8px" }}>Valor S/</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiales.map((m) => (
                      <tr key={m.nombre} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px" }}><strong>{m.nombre}</strong></td>
                        <td style={{ padding: "6px 8px" }}>{m.asignado.toFixed(2)} {m.unidad}</td>
                        <td style={{ padding: "6px 8px" }}>{m.liquidado.toFixed(2)} {m.unidad}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{ fontWeight: 700, color: m.enPoder > 0 ? "#d97706" : "#16a34a" }}>{m.enPoder.toFixed(2)} {m.unidad}</span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>{m.valorEnPoder.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}

      {showConfig && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 680, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 8 }}>
              <Settings size={18} color="#1E4F9C" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Configuración de Precios de Materiales</h3>
              <button onClick={() => setShowConfig(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
              <select
                value={plantillaElegida}
                onChange={(e) => setPlantillaElegida(e.target.value)}
                style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid #bfdbfe", background: "#fff", color: "#1d4ed8", fontSize: 12 }}
              >
                <option value="">Elegir plantilla de Reportes General…</option>
                {plantillasGenerales.map((p) => <option key={p.id || p.nombre} value={p.nombre}>{p.nombre}</option>)}
              </select>
              <button
                type="button"
                onClick={importarDeReportesGeneral}
                disabled={!plantillaElegida}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "1px solid #bfdbfe", background: plantillaElegida ? "#eff6ff" : "#f3f4f6", color: plantillaElegida ? "#1d4ed8" : "#94a3b8", fontWeight: 600, fontSize: 12, cursor: plantillaElegida ? "pointer" : "not-allowed" }}
              >
                📥 Importar
              </button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#eff6ff" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #dbeafe" }}>Material</th>
                    <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #dbeafe", width: 110 }}>Precio S/</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: "1px solid #dbeafe", width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {materialesUnicos.map((m) => {
                    const k = norm(m.nombre);
                    return (
                      <tr key={k} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "7px 10px" }}>{m.nombre}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>
                          <input
                            type="number" min="0" step="0.01"
                            value={preciosEdit[k] ?? ""}
                            onChange={(e) => setPreciosEdit((prev) => ({ ...prev, [k]: e.target.value }))}
                            style={{ width: 90, border: "1px solid #d1d5db", borderRadius: 5, padding: "4px 7px", textAlign: "right", fontSize: 13 }}
                          />
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => restablecerPrecio(k, m.costo_unitario)}
                            title="Restablecer al costo original de la base de datos"
                            style={{ border: "1px solid #d1d5db", background: "#f8fafc", color: "#64748b", borderRadius: 5, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                          >
                            ↺ Default
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {saveMsg && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: "#dcfce7", color: "#16a34a", fontSize: 13 }}>
                {saveMsg}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setShowConfig(false)}
                style={{ padding: "7px 16px", borderRadius: 7, border: "1px solid #d1d5db", background: "#f3f4f6", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={guardarPrecios}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", borderRadius: 7, border: "none", background: "#1E4F9C", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                <Save size={14} /> Guardar Precios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
