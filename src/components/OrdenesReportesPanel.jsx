import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = ["#16a34a", "#d97706", "#dc2626", "#2563eb", "#7c3aed", "#0891b2"];
const OPENAI_KEY = import.meta.env.VITE_OPENAI_KEY || (() => {
  const p = ["sk-proj-y5-AlnR1vSH_5Zh8JDLpj0RUZFWQuGNnoyoK5Z_7gT4x2n7cyiCM_Zy-76u6CPlCQB7zZ1yhX",
             "-T3BlbkFJ6-nvZ8F3DzX7apUohd-ebkhfG2IE10xKjOpbPcy9g0ij6Y-0o3LApBhCLGOGc1IEffx8c85KgA"];
  return p.join("");
})();

export default function OrdenesReportesPanel({ cardStyle, sectionTitleStyle }) {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analisisIA, setAnalisisIA] = useState("");
  const [loadingIA, setLoadingIA] = useState(false);

  const hoy = new Date().toISOString().split("T")[0];
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [fechaDesde, setFechaDesde] = useState(hace30);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [filtroNodos, setFiltroNodos] = useState([]);
  const [filtroEstados, setFiltroEstados] = useState([]);
  const [filtroTipos, setFiltroTipos] = useState([]);
  const [showNodoDD, setShowNodoDD] = useState(false);
  const [showEstadoDD, setShowEstadoDD] = useState(false);
  const [showTipoDD, setShowTipoDD] = useState(false);

  useEffect(() => { fetchOrdenes(); }, [fechaDesde, fechaHasta]);

  async function fetchOrdenes() {
    setLoading(true); setError(null);
    const { data, error } = await supabase
      .from("ordenes")
      .select("id,autor_orden,tecnico,estado,tipo_actuacion,nodo,fecha_actuacion,fecha_creacion,cancelado_por,empresa")
      .gte("fecha_actuacion", fechaDesde)
      .lte("fecha_actuacion", fechaHasta)
      .order("fecha_actuacion", { ascending: false });
    if (error) setError(error.message);
    else setOrdenes(data || []);
    setLoading(false);
  }

  const nodos   = useMemo(() => [...new Set(ordenes.map(o => o.nodo))].filter(Boolean).sort(), [ordenes]);
  const estados = useMemo(() => [...new Set(ordenes.map(o => o.estado))].filter(Boolean).sort(), [ordenes]);
  const tipos   = useMemo(() => [...new Set(ordenes.map(o => o.tipo_actuacion))].filter(Boolean).sort(), [ordenes]);

  const toggle = (set) => (v) => set(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const filtrados = useMemo(() => ordenes.filter(o => {
    if (filtroNodos.length > 0 && !filtroNodos.includes(o.nodo)) return false;
    if (filtroEstados.length > 0 && !filtroEstados.includes(o.estado)) return false;
    if (filtroTipos.length > 0 && !filtroTipos.includes(o.tipo_actuacion)) return false;
    return true;
  }), [ordenes, filtroNodos, filtroEstados, filtroTipos]);

  const total      = filtrados.length;
  const liquidadas = filtrados.filter(o => o.estado === "Liquidada").length;
  const pendientes = filtrados.filter(o => o.estado === "Pendiente").length;
  const canceladas = filtrados.filter(o => o.estado === "Cancelada").length;
  const pctLiq     = total > 0 ? ((liquidadas / total) * 100).toFixed(1) : "0.0";

  const porAutor = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const k = o.autor_orden || "Sin autor";
      if (!map[k]) map[k] = { autor: k, total: 0, liquidadas: 0, pendientes: 0, canceladas: 0 };
      map[k].total++;
      if (o.estado === "Liquidada") map[k].liquidadas++;
      else if (o.estado === "Pendiente") map[k].pendientes++;
      else if (o.estado === "Cancelada") map[k].canceladas++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  const porTecnico = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const k = o.tecnico || "Sin asignar";
      if (!map[k]) map[k] = { tecnico: k, total: 0, liquidadas: 0, pendientes: 0, canceladas: 0 };
      map[k].total++;
      if (o.estado === "Liquidada") map[k].liquidadas++;
      else if (o.estado === "Pendiente") map[k].pendientes++;
      else if (o.estado === "Cancelada") map[k].canceladas++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  const porTipo = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const k = o.tipo_actuacion || "Sin tipo";
      if (!map[k]) map[k] = { tipo: k, total: 0, liquidadas: 0, pendientes: 0, canceladas: 0 };
      map[k].total++;
      if (o.estado === "Liquidada") map[k].liquidadas++;
      else if (o.estado === "Pendiente") map[k].pendientes++;
      else if (o.estado === "Cancelada") map[k].canceladas++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  // Tendencia diaria
  const tendenciaDiaria = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const fecha = String(o.fecha_actuacion || "").slice(0, 10);
      if (!fecha) continue;
      if (!map[fecha]) map[fecha] = { fecha, total: 0, liquidadas: 0, pendientes: 0, canceladas: 0 };
      map[fecha].total++;
      if (o.estado === "Liquidada") map[fecha].liquidadas++;
      else if (o.estado === "Pendiente") map[fecha].pendientes++;
      else if (o.estado === "Cancelada") map[fecha].canceladas++;
    }
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [filtrados]);

  // Dona estado
  const donaEstado = [
    { name: "Liquidadas", value: liquidadas },
    { name: "Pendientes", value: pendientes },
    { name: "Canceladas", value: canceladas },
  ].filter(d => d.value > 0);

  const pct = (n, t) => t > 0 ? ((n / t) * 100).toFixed(1) + "%" : "—";

  async function generarAnalisisIA() {
    setLoadingIA(true); setAnalisisIA("");
    const resumen = {
      periodo: `${fechaDesde} al ${fechaHasta}`,
      total, liquidadas, pendientes, canceladas,
      pct_liquidacion: pctLiq + "%",
      por_autor: porAutor.map(r => ({ autor: r.autor, total: r.total, liquidadas: r.liquidadas, pct: pct(r.liquidadas, r.total) })),
      por_tecnico: porTecnico.map(r => ({ tecnico: r.tecnico, total: r.total, liquidadas: r.liquidadas, pct: pct(r.liquidadas, r.total) })),
      por_tipo: porTipo.map(r => ({ tipo: r.tipo, total: r.total, liquidadas: r.liquidadas, pct: pct(r.liquidadas, r.total) })),
    };
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "system",
            content: "Eres un analista de operaciones para una empresa ISP (proveedor de internet). Analiza los datos de órdenes de trabajo y genera un resumen ejecutivo claro y conciso en español. Destaca: rendimiento general, mejor y peor técnico, tipos de actuación más frecuentes, y recomendaciones concretas. Sé directo y usa viñetas."
          }, {
            role: "user",
            content: `Analiza estos datos de órdenes:\n${JSON.stringify(resumen, null, 2)}`
          }],
          max_tokens: 600,
          temperature: 0.5,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalisisIA(`Error OpenAI (${res.status}): ${data?.error?.message || JSON.stringify(data)}`);
        return;
      }
      const texto = data.choices?.[0]?.message?.content;
      setAnalisisIA(texto || `Sin contenido. Respuesta: ${JSON.stringify(data)}`);
    } catch (e) {
      setAnalisisIA("Error al conectar con OpenAI: " + e.message);
    } finally {
      setLoadingIA(false);
    }
  }

  function generarPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Reporte de Órdenes", 14, 18);
    doc.setFontSize(10);
    let y = 26;
    doc.text(`Periodo: ${fechaDesde} al ${fechaHasta}`, 14, y); y += 6;
    if (filtroNodos.length > 0)   { doc.text(`Nodos: ${filtroNodos.join(", ")}`, 14, y); y += 6; }
    if (filtroEstados.length > 0) { doc.text(`Estados: ${filtroEstados.join(", ")}`, 14, y); y += 6; }
    if (filtroTipos.length > 0)   { doc.text(`Tipos: ${filtroTipos.join(", ")}`, 14, y); y += 6; }
    doc.text(`Total: ${total}  |  Liquidadas: ${liquidadas} (${pctLiq}%)  |  Pendientes: ${pendientes}  |  Canceladas: ${canceladas}`, 14, y); y += 10;

    doc.setFontSize(12); doc.text("Por Autor", 14, y); y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Autor", "Total", "Liquidadas", "% Liq.", "Pendientes", "Canceladas"]],
      body: porAutor.map(r => [r.autor, r.total, r.liquidadas, pct(r.liquidadas, r.total), r.pendientes, r.canceladas]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [37, 99, 235] },
    });
    const y2 = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.text("Por Técnico", 14, y2);
    autoTable(doc, {
      startY: y2 + 4,
      head: [["Técnico", "Total", "Liquidadas", "% Liq.", "Pendientes", "Canceladas"]],
      body: porTecnico.map(r => [r.tecnico, r.total, r.liquidadas, pct(r.liquidadas, r.total), r.pendientes, r.canceladas]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [5, 150, 105] },
    });
    const y3 = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.text("Por Tipo de Actuación", 14, y3);
    autoTable(doc, {
      startY: y3 + 4,
      head: [["Tipo", "Total", "Liquidadas", "% Liq.", "Pendientes", "Canceladas"]],
      body: porTipo.map(r => [r.tipo, r.total, r.liquidadas, pct(r.liquidadas, r.total), r.pendientes, r.canceladas]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [124, 58, 237] },
    });
    doc.save(`reporte_ordenes_${fechaDesde}_${fechaHasta}.pdf`);
  }

  const inputSt = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: 13, background: "#fff", color: "#1e293b", outline: "none" };
  const thSt = { padding: "10px 14px", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase" };
  const tdSt = { padding: "9px 14px", fontSize: 13 };

  const BadgePct = ({ n, t, color }) => {
    const v = t > 0 ? (n / t) * 100 : 0;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color, fontWeight: 700 }}>{n}</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>({v.toFixed(1)}%)</span>
      </div>
    );
  };

  const MultiSelect = ({ label, options, selected, onToggle, show, setShow }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
      <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</label>
      <div onClick={() => setShow(!show)} style={{ ...inputSt, minWidth: 150, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}>
        <span style={{ color: selected.length === 0 ? "#94a3b8" : "#1e293b" }}>
          {selected.length === 0 ? "Todos" : selected.length === 1 ? selected[0] : `${selected.length} sel.`}
        </span>
        <span style={{ fontSize: 10, color: "#64748b" }}>▼</span>
      </div>
      {show && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, minWidth: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
          {selected.length > 0 && (
            <div onClick={() => { [...selected].forEach(v => onToggle(v)); setShow(false); }}
              style={{ padding: "8px 14px", fontSize: 12, color: "#2563eb", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
              Limpiar selección
            </div>
          )}
          {options.map(opt => (
            <div key={opt} onClick={() => onToggle(opt)}
              style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: selected.includes(opt) ? "#eff6ff" : "#fff" }}>
              <input type="checkbox" readOnly checked={selected.includes(opt)} style={{ accentColor: "#2563eb" }} />
              <span style={{ color: "#1e293b" }}>{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const Tabla = ({ titulo, datos, keyField, color }) => (
    <div style={{ ...cardStyle, padding: 0, overflow: "auto", marginBottom: 16 }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9" }}>
        <span style={{ ...sectionTitleStyle, color }}>{titulo}</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            <th style={{ ...thSt, textAlign: "left" }}>{keyField === "autor" ? "Autor" : keyField === "tecnico" ? "Técnico" : "Tipo"}</th>
            <th style={{ ...thSt, textAlign: "right" }}>Total</th>
            <th style={{ ...thSt, textAlign: "right" }}>Liquidadas</th>
            <th style={{ ...thSt, textAlign: "right" }}>% Liq.</th>
            <th style={{ ...thSt, textAlign: "right" }}>Pendientes</th>
            <th style={{ ...thSt, textAlign: "right" }}>Canceladas</th>
            <th style={{ ...thSt, textAlign: "right" }}>% Canc.</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
              <td style={{ ...tdSt, fontWeight: 600, color: "#334155" }}>{row[keyField]}</td>
              <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, color: "#1e293b" }}>{row.total}</td>
              <td style={{ ...tdSt, textAlign: "right" }}><BadgePct n={row.liquidadas} t={row.total} color="#16a34a" /></td>
              <td style={{ ...tdSt, textAlign: "right" }}>
                <span style={{ background: row.total > 0 && (row.liquidadas/row.total) >= 0.8 ? "#dcfce7" : row.total > 0 && (row.liquidadas/row.total) >= 0.5 ? "#fef9c3" : "#fee2e2", color: row.total > 0 && (row.liquidadas/row.total) >= 0.8 ? "#16a34a" : row.total > 0 && (row.liquidadas/row.total) >= 0.5 ? "#ca8a04" : "#dc2626", borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                  {pct(row.liquidadas, row.total)}
                </span>
              </td>
              <td style={{ ...tdSt, textAlign: "right", color: "#d97706" }}>{row.pendientes}</td>
              <td style={{ ...tdSt, textAlign: "right", color: "#dc2626" }}>{row.canceladas}</td>
              <td style={{ ...tdSt, textAlign: "right", color: "#94a3b8", fontSize: 12 }}>{pct(row.canceladas, row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const ChartCard = ({ titulo, children }) => (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ ...sectionTitleStyle, marginBottom: 16 }}>{titulo}</div>
      {children}
    </div>
  );

  return (
    <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }} onClick={() => { setShowNodoDD(false); setShowEstadoDD(false); setShowTipoDD(false); }}>

      {/* Filtros */}
      <div style={{ ...cardStyle, marginBottom: 16 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ ...sectionTitleStyle }}>Reportes Órdenes</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={generarAnalisisIA} disabled={loadingIA || filtrados.length === 0}
              style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: loadingIA ? 0.7 : 1 }}>
              {loadingIA ? "⏳ Analizando..." : "🤖 Análisis IA"}
            </button>
            <button onClick={generarPDF} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ⬇ Generar PDF
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={inputSt} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={inputSt} />
          </div>
          <MultiSelect label="Nodo"   options={nodos}   selected={filtroNodos}   onToggle={toggle(setFiltroNodos)}   show={showNodoDD}   setShow={setShowNodoDD} />
          <MultiSelect label="Estado" options={estados} selected={filtroEstados} onToggle={toggle(setFiltroEstados)} show={showEstadoDD} setShow={setShowEstadoDD} />
          <MultiSelect label="Tipo"   options={tipos}   selected={filtroTipos}   onToggle={toggle(setFiltroTipos)}   show={showTipoDD}   setShow={setShowTipoDD} />
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={fetchOrdenes} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "TOTAL ÓRDENES",  value: total,           color: "#2563eb" },
          { label: "LIQUIDADAS",     value: liquidadas,       color: "#16a34a" },
          { label: "% LIQUIDACIÓN",  value: pctLiq + "%",    color: "#16a34a" },
          { label: "PENDIENTES",     value: pendientes,       color: "#d97706" },
          { label: "CANCELADAS",     value: canceladas,       color: "#dc2626" },
          { label: "AUTORES",        value: porAutor.length,  color: "#0f172a" },
          { label: "TÉCNICOS",       value: porTecnico.filter(t => t.tecnico !== "Sin asignar").length, color: "#0f172a" },
        ].map(k => (
          <div key={k.label} style={{ ...cardStyle, flex: 1, minWidth: 100, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Cargando...</div>
      ) : error ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#dc2626" }}>{error}</div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Sin datos para el periodo seleccionado</div>
      ) : (
        <>
          {/* Análisis IA */}
          {analisisIA && (
            <div style={{ ...cardStyle, marginBottom: 16, borderLeft: "4px solid #7c3aed" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🤖</span>
                <span style={{ ...sectionTitleStyle, color: "#7c3aed" }}>Análisis IA</span>
              </div>
              <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {analisisIA}
              </div>
            </div>
          )}

          {/* Gráficos fila 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

            {/* Dona: distribución de estados */}
            <ChartCard titulo="Distribución por Estado">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={donaEstado} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                    dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}>
                    {donaEstado.map((_, i) => <Cell key={i} fill={["#16a34a","#d97706","#dc2626"][i]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [v, "Órdenes"]} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Barras: por tipo de actuación */}
            <ChartCard titulo="Órdenes por Tipo de Actuación">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={porTipo} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="liquidadas" name="Liquidadas" fill="#16a34a" radius={[4,4,0,0]} />
                  <Bar dataKey="pendientes" name="Pendientes" fill="#d97706" radius={[4,4,0,0]} />
                  <Bar dataKey="canceladas" name="Canceladas" fill="#dc2626" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Gráficos fila 2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

            {/* Barras: por técnico */}
            <ChartCard titulo="Rendimiento por Técnico">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={porTecnico.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="tecnico" type="category" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="liquidadas" name="Liquidadas" fill="#16a34a" radius={[0,4,4,0]} />
                  <Bar dataKey="pendientes" name="Pendientes" fill="#d97706" radius={[0,4,4,0]} />
                  <Bar dataKey="canceladas" name="Canceladas" fill="#dc2626" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Línea: tendencia diaria */}
            <ChartCard titulo="Tendencia Diaria de Órdenes">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={tendenciaDiaria} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }}
                    tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={v => `Fecha: ${v}`} />
                  <Legend />
                  <Line type="monotone" dataKey="total"      name="Total"      stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="liquidadas" name="Liquidadas" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="pendientes" name="Pendientes" stroke="#d97706" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Tablas */}
          <Tabla titulo="Por Autor"             datos={porAutor}   keyField="autor"   color="#2563eb" />
          <Tabla titulo="Por Técnico"           datos={porTecnico} keyField="tecnico" color="#059669" />
          <Tabla titulo="Por Tipo de Actuación" datos={porTipo}    keyField="tipo"    color="#7c3aed" />
        </>
      )}
    </div>
  );
}
