import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#16a34a", "#dc2626", "#d97706", "#2563eb", "#7c3aed", "#0891b2", "#db2777", "#059669"];
const OPENAI_KEY = import.meta.env.VITE_OPENAI_KEY || (() => {
  const p = ["sk-proj-y5-AlnR1vSH_5Zh8JDLpj0RUZFWQuGNnoyoK5Z_7gT4x2n7cyiCM_Zy-76u6CPlCQB7zZ1yhX",
             "-T3BlbkFJ6-nvZ8F3DzX7apUohd-ebkhfG2IE10xKjOpbPcy9g0ij6Y-0o3LApBhCLGOGc1IEffx8c85KgA"];
  return p.join("");
})();

const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 100));

const AGRUPACION_OPTS = ["Diario", "Semanal", "Mensual"];

function semanaDeAno(fecha) {
  const d = new Date(fecha);
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d - start;
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return `${d.getFullYear()}-S${String(Math.ceil(diff / oneWeek)).padStart(2, "0")}`;
}

export default function InstalacionesReportesPanel({ cardStyle, sectionTitleStyle }) {
  const [ordenes, setOrdenes]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [analisisIA, setAnalisisIA] = useState("");
  const [loadingIA, setLoadingIA]   = useState(false);

  const hoy    = new Date().toISOString().split("T")[0];
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [fechaDesde, setFechaDesde]         = useState(hace30);
  const [fechaHasta, setFechaHasta]         = useState(hoy);
  const [filtroNodos, setFiltroNodos]       = useState([]);
  const [filtroGestoras, setFiltroGestoras] = useState([]);
  const [filtroEstados, setFiltroEstados]   = useState([]);
  const [agrupacion, setAgrupacion]         = useState("Diario");
  const [showNodoDD, setShowNodoDD]         = useState(false);
  const [showGestoraDD, setShowGestoraDD]   = useState(false);
  const [showEstadoDD, setShowEstadoDD]     = useState(false);

  useEffect(() => { fetchOrdenes(); }, [fechaDesde, fechaHasta]);

  async function fetchOrdenes() {
    setLoading(true); setError(null);
    const { data, error } = await supabase
      .from("ordenes")
      .select("id,autor_orden,tecnico,estado,tipo_actuacion,nodo,fecha_actuacion,empresa")
      .ilike("tipo_actuacion", "%instalac%")
      .gte("fecha_actuacion", fechaDesde)
      .lte("fecha_actuacion", fechaHasta)
      .order("fecha_actuacion", { ascending: true })
      .limit(10000);
    if (error) setError(error.message);
    else setOrdenes(data || []);
    setLoading(false);
  }

  const nodos    = useMemo(() => [...new Set(ordenes.map(o => o.nodo))].filter(Boolean).sort(), [ordenes]);
  const gestoras = useMemo(() => [...new Set(ordenes.map(o => o.autor_orden))].filter(Boolean).sort(), [ordenes]);
  const estados  = useMemo(() => [...new Set(ordenes.map(o => o.estado))].filter(Boolean).sort(), [ordenes]);
  const toggle   = (set) => (v) => set(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const filtrados = useMemo(() => ordenes.filter(o => {
    if (filtroNodos.length > 0    && !filtroNodos.includes(o.nodo))         return false;
    if (filtroGestoras.length > 0 && !filtroGestoras.includes(o.autor_orden)) return false;
    if (filtroEstados.length > 0  && !filtroEstados.includes(o.estado))     return false;
    return true;
  }), [ordenes, filtroNodos, filtroGestoras, filtroEstados]);

  // KPIs
  const total      = filtrados.length;
  const liquidadas = filtrados.filter(o => o.estado === "Liquidada").length;
  const canceladas = filtrados.filter(o => o.estado === "Cancelada").length;
  const pendientes = filtrados.filter(o => o.estado === "Pendiente").length;
  const tasaExito  = pct(liquidadas, total);
  const totalNodos   = new Set(filtrados.map(o => o.nodo).filter(Boolean)).size;
  const totalGestoras = new Set(filtrados.map(o => o.autor_orden).filter(Boolean)).size;

  // Tendencia (diaria/semanal/mensual)
  const tendencia = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const fecha = String(o.fecha_actuacion || "").slice(0, 10);
      if (!fecha) continue;
      const key = agrupacion === "Mensual" ? fecha.slice(0, 7)
                : agrupacion === "Semanal" ? semanaDeAno(fecha)
                : fecha;
      if (!map[key]) map[key] = { periodo: key, Liquidadas: 0, Canceladas: 0, Pendientes: 0 };
      if (o.estado === "Liquidada")  map[key].Liquidadas++;
      else if (o.estado === "Cancelada") map[key].Canceladas++;
      else map[key].Pendientes++;
    }
    return Object.values(map).sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [filtrados, agrupacion]);

  // Por nodo
  const porNodo = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const k = o.nodo || "Sin nodo";
      if (!map[k]) map[k] = { nodo: k, total: 0, liquidadas: 0, canceladas: 0, pendientes: 0 };
      map[k].total++;
      if (o.estado === "Liquidada")       map[k].liquidadas++;
      else if (o.estado === "Cancelada")  map[k].canceladas++;
      else                                map[k].pendientes++;
    }
    return Object.values(map)
      .map(r => ({ ...r, pct_exito: pct(r.liquidadas, r.total) }))
      .sort((a, b) => b.total - a.total);
  }, [filtrados]);

  // Por gestora
  const porGestora = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const k = o.autor_orden || "Sin registrar";
      if (!map[k]) map[k] = { gestora: k, total: 0, liquidadas: 0, canceladas: 0, pendientes: 0 };
      map[k].total++;
      if (o.estado === "Liquidada")      map[k].liquidadas++;
      else if (o.estado === "Cancelada") map[k].canceladas++;
      else                               map[k].pendientes++;
    }
    return Object.values(map)
      .map(r => ({ ...r, pct_exito: pct(r.liquidadas, r.total) }))
      .sort((a, b) => b.total - a.total);
  }, [filtrados]);

  // Dona estado
  const donaEstado = [
    { name: "Liquidadas", value: liquidadas },
    { name: "Canceladas", value: canceladas },
    { name: "Pendientes", value: pendientes },
  ].filter(d => d.value > 0);

  async function analizarIA() {
    setLoadingIA(true); setAnalisisIA("");
    const resNodo = porNodo.map(n => `${n.nodo}: ${n.total} instal., ${n.liquidadas} éxito (${n.pct_exito}%), ${n.canceladas} cancel.`).join("\n");
    const resGest = porGestora.map(g => `${g.gestora}: ${g.total} instal., ${g.liquidadas} éxito (${g.pct_exito}%), ${g.canceladas} cancel.`).join("\n");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "system",
            content: "Eres analista de operaciones de una empresa ISP. Analiza las estadísticas de instalaciones de internet y genera un informe ejecutivo en español. Destaca: nodos con más/menos éxito, gestoras con mayor volumen, tasas de cancelación y recomendaciones. Usa viñetas y sé directo."
          }, {
            role: "user",
            content: `Período: ${fechaDesde} al ${fechaHasta}\nTotal instalaciones: ${total} | Éxito: ${liquidadas} (${tasaExito}%) | Canceladas: ${canceladas}\n\nPor nodo:\n${resNodo}\n\nPor gestora:\n${resGest}`
          }],
          max_tokens: 600,
        }),
      });
      const json = await res.json();
      setAnalisisIA(json.choices?.[0]?.message?.content || "Sin respuesta de la IA");
    } catch (e) {
      setAnalisisIA("Error: " + e.message);
    }
    setLoadingIA(false);
  }

  function generarPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Reporte de Instalaciones", 14, 18);
    doc.setFontSize(10);
    let y = 26;
    doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, 14, y); y += 6;
    if (filtroNodos.length)    { doc.text(`Nodos: ${filtroNodos.join(", ")}`, 14, y); y += 6; }
    if (filtroGestoras.length) { doc.text(`Gestoras: ${filtroGestoras.join(", ")}`, 14, y); y += 6; }
    if (filtroEstados.length)  { doc.text(`Estados: ${filtroEstados.join(", ")}`, 14, y); y += 6; }
    doc.text(`Total: ${total} | Éxito: ${liquidadas} (${tasaExito}%) | Canceladas: ${canceladas} | Pendientes: ${pendientes}`, 14, y); y += 6;

    doc.setFontSize(12); doc.text("Por Nodo", 14, y + 2); y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Nodo", "Total", "Liquidadas", "% Éxito", "Canceladas", "Pendientes"]],
      body: porNodo.map(n => [n.nodo, n.total, n.liquidadas, n.pct_exito + "%", n.canceladas, n.pendientes]),
      styles: { fontSize: 9 },
    });

    doc.setFontSize(12); doc.text("Por Gestora", 14, doc.lastAutoTable.finalY + 8);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [["Gestora", "Total", "Liquidadas", "% Éxito", "Canceladas", "Pendientes"]],
      body: porGestora.map(g => [g.gestora, g.total, g.liquidadas, g.pct_exito + "%", g.canceladas, g.pendientes]),
      styles: { fontSize: 9 },
    });

    if (analisisIA) {
      const ay = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12); doc.text("Análisis IA", 14, ay);
      doc.setFontSize(9);
      doc.text(doc.splitTextToSize(analisisIA, 180), 14, ay + 8);
    }
    doc.save(`reporte_instalaciones_${fechaDesde}_${fechaHasta}.pdf`);
  }

  const badgeColor = (p) => p >= 80 ? "#16a34a" : p >= 50 ? "#d97706" : "#dc2626";
  const kpiStyle   = { background: "#fff", borderRadius: 12, padding: "16px 20px", border: "1px solid #e5e7eb", textAlign: "center", flex: 1, minWidth: 120 };

  const MultiSelect = ({ label, options, selected, onToggle, show, setShow }) => (
    <div style={{ position: "relative" }}>
      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>{label}</label>
      <button type="button" onClick={() => setShow(s => !s)}
        style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, cursor: "pointer", minWidth: 140, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ color: selected.length === 0 ? "#94a3b8" : "#1e293b" }}>
          {selected.length === 0 ? "Todos" : selected.length === 1 ? selected[0] : `${selected.length} sel.`}
        </span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>
      {show && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 16px #0002", minWidth: 180, maxHeight: 220, overflowY: "auto" }}>
          {selected.length > 0 && (
            <div onClick={() => { [...selected].forEach(v => onToggle(v)); setShow(false); }}
              style={{ padding: "8px 14px", fontSize: 12, color: "#dc2626", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}>✕ Limpiar</div>
          )}
          {options.map(opt => (
            <div key={opt} onClick={() => onToggle(opt)}
              style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: selected.includes(opt) ? "#eff6ff" : "#fff" }}>
              <input type="checkbox" readOnly checked={selected.includes(opt)} style={{ accentColor: "#2563eb" }} />
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const Tabla = ({ titulo, datos, keyField, colorAcento = "#2563eb" }) => (
    <div style={{ ...cardStyle }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>{titulo}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["#", keyField === "nodo" ? "Nodo" : "Gestora", "Total", "Liquidadas", "Canceladas", "Pendientes", "% Éxito"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.map((row, i) => (
              <tr key={row[keyField]} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                <td style={{ padding: "9px 12px", color: "#9ca3af", fontWeight: 600 }}>{i + 1}</td>
                <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1e293b" }}>{row[keyField]}</td>
                <td style={{ padding: "9px 12px", fontWeight: 700, color: colorAcento }}>{row.total}</td>
                <td style={{ padding: "9px 12px", fontWeight: 700, color: "#16a34a" }}>{row.liquidadas}</td>
                <td style={{ padding: "9px 12px", color: "#dc2626" }}>{row.canceladas}</td>
                <td style={{ padding: "9px 12px", color: "#d97706" }}>{row.pendientes}</td>
                <td style={{ padding: "9px 12px" }}>
                  <span style={{ background: badgeColor(row.pct_exito) + "20", color: badgeColor(row.pct_exito), borderRadius: 6, padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                    {row.pct_exito}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header */}
      <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ ...sectionTitleStyle, marginBottom: 0 }}>Reporte de Instalaciones</div>
        <button onClick={generarPDF} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          ↓ Generar PDF
        </button>
      </div>

      {/* Filtros */}
      <div style={{ ...cardStyle, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }} />
        </div>
        <MultiSelect label="Nodo"    options={nodos}    selected={filtroNodos}    onToggle={toggle(setFiltroNodos)}    show={showNodoDD}    setShow={setShowNodoDD} />
        <MultiSelect label="Gestora" options={gestoras} selected={filtroGestoras} onToggle={toggle(setFiltroGestoras)} show={showGestoraDD} setShow={setShowGestoraDD} />
        <MultiSelect label="Estado"  options={estados}  selected={filtroEstados}  onToggle={toggle(setFiltroEstados)}  show={showEstadoDD}  setShow={setShowEstadoDD} />
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>Agrupación</label>
          <select value={agrupacion} onChange={e => setAgrupacion(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}>
            {AGRUPACION_OPTS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <button onClick={fetchOrdenes} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 16 }}>
          Actualizar
        </button>
      </div>

      {loading && <div style={{ ...cardStyle, color: "#6b7280" }}>Cargando...</div>}
      {error   && <div style={{ ...cardStyle, color: "#dc2626" }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* KPIs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <div style={kpiStyle}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>TOTAL INSTALACIONES</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#2563eb" }}>{total}</div>
            </div>
            <div style={{ ...kpiStyle, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>✅ ÉXITO (LIQUIDADAS)</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#16a34a" }}>{liquidadas}</div>
            </div>
            <div style={{ ...kpiStyle, background: "#fef2f2", borderColor: "#fecaca" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>❌ CANCELADAS</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#dc2626" }}>{canceladas}</div>
            </div>
            <div style={{ ...kpiStyle, background: "#fff7ed", borderColor: "#fed7aa" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>⏳ PENDIENTES</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#d97706" }}>{pendientes}</div>
            </div>
            <div style={kpiStyle}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>TASA DE ÉXITO</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: badgeColor(tasaExito) }}>{tasaExito}%</div>
            </div>
            <div style={kpiStyle}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>NODOS</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#0891b2" }}>{totalNodos}</div>
            </div>
            <div style={kpiStyle}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>GESTORAS</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#7c3aed" }}>{totalGestoras}</div>
            </div>
          </div>

          {/* Tendencia + Dona */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={{ ...cardStyle }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>Tendencia de Instalaciones ({agrupacion})</div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={tendencia} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 10 }} tickFormatter={v => v.length > 7 ? v.slice(5) : v} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Liquidadas"  stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Canceladas"  stroke="#dc2626" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Pendientes"  stroke="#d97706" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 14, alignSelf: "flex-start" }}>Distribución de Estado</div>
              <PieChart width={200} height={200}>
                <Pie data={donaEstado} cx={100} cy={95} innerRadius={55} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
                  {donaEstado.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
          </div>

          {/* Por Nodo + Por Gestora (barras) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Instalaciones por Nodo</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={porNodo} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="nodo" type="category" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="liquidadas" name="Liquidadas" fill="#16a34a" radius={[0,4,4,0]} stackId="a" />
                  <Bar dataKey="canceladas" name="Canceladas" fill="#dc2626" radius={[0,4,4,0]} stackId="a" />
                  <Bar dataKey="pendientes" name="Pendientes" fill="#d97706" radius={[0,4,4,0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Instalaciones por Gestora</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={porGestora} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="gestora" type="category" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="liquidadas" name="Liquidadas" fill="#16a34a" radius={[0,4,4,0]} stackId="a" />
                  <Bar dataKey="canceladas" name="Canceladas" fill="#dc2626" radius={[0,4,4,0]} stackId="a" />
                  <Bar dataKey="pendientes" name="Pendientes" fill="#d97706" radius={[0,4,4,0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tablas */}
          <Tabla titulo="Detalle por Nodo"    datos={porNodo}    keyField="nodo"    colorAcento="#0891b2" />
          <Tabla titulo="Detalle por Gestora" datos={porGestora} keyField="gestora" colorAcento="#7c3aed" />

          {/* Análisis IA */}
          <div style={{ ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>Análisis IA</div>
              <button onClick={analizarIA} disabled={loadingIA}
                style={{ background: loadingIA ? "#94a3b8" : "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: loadingIA ? "not-allowed" : "pointer" }}>
                {loadingIA ? "Analizando..." : "🤖 Analizar"}
              </button>
            </div>
            {analisisIA ? (
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: 16, fontSize: 13, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {analisisIA}
              </div>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>Haz clic en "🤖 Analizar" para obtener un análisis de las instalaciones por nodo, gestora y tendencias del período.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
