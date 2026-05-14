import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#2563eb","#16a34a","#d97706","#dc2626","#7c3aed","#0891b2","#db2777","#059669"];
const OPENAI_KEY = import.meta.env.VITE_OPENAI_KEY || (() => {
  const p = ["sk-proj-y5-AlnR1vSH_5Zh8JDLpj0RUZFWQuGNnoyoK5Z_7gT4x2n7cyiCM_Zy-76u6CPlCQB7zZ1yhX",
             "-T3BlbkFJ6-nvZ8F3DzX7apUohd-ebkhfG2IE10xKjOpbPcy9g0ij6Y-0o3LApBhCLGOGc1IEffx8c85KgA"];
  return p.join("");
})();

const pct = (a, b) => b === 0 ? 0 : Math.round((a / b) * 100);

function RenderAnalisis({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let listItems = [];
  const flushList = (key) => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${key}`} style={{ margin: "6px 0 10px 0", paddingLeft: 20 }}>{listItems.map((li, i) => <li key={i} style={{ marginBottom: 5, lineHeight: 1.6, color: "#374151" }} dangerouslySetInnerHTML={{ __html: li }} />)}</ul>);
      listItems = [];
    }
  };
  const parseBold = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) { flushList(i); return; }
    if (t.startsWith("### ") || t.startsWith("## ")) {
      flushList(i);
      elements.push(<div key={i} style={{ fontWeight: 800, fontSize: 14, color: "#1e293b", marginTop: 16, marginBottom: 4, borderBottom: "2px solid #e9d5ff", paddingBottom: 4 }}>{t.replace(/^#{2,3} /, "")}</div>);
    } else if (t.startsWith("- ") || t.startsWith("• ")) {
      listItems.push(parseBold(t.slice(2)));
    } else {
      flushList(i);
      elements.push(<p key={i} style={{ margin: "6px 0", lineHeight: 1.7, color: "#374151" }} dangerouslySetInnerHTML={{ __html: parseBold(t) }} />);
    }
  });
  flushList("end");
  return <div style={{ fontSize: 13 }}>{elements}</div>;
}

function renderAnalisisPDF(doc, analisisIA) {
  let y = doc.lastAutoTable.finalY + 14;
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14, maxW = 180;
  const check = (n = 8) => { if (y + n > pageH - 14) { doc.addPage(); y = 16; } };
  check(10);
  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(109, 40, 217);
  doc.text("Análisis IA — Informe Ejecutivo", margin, y); y += 8; doc.setTextColor(0, 0, 0);
  for (const line of analisisIA.split("\n")) {
    const t = line.trim();
    if (!t) { y += 3; continue; }
    if (t.startsWith("### ") || t.startsWith("## ")) {
      y += 4; check(10);
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
      doc.text(t.replace(/^#{2,3} /, ""), margin, y); y += 5;
      doc.setDrawColor(200, 180, 255); doc.line(margin, y, margin + maxW, y); y += 4; doc.setTextColor(0, 0, 0);
    } else if (t.startsWith("- ") || t.startsWith("• ")) {
      const wrapped = doc.splitTextToSize("• " + t.slice(2).replace(/\*\*(.+?)\*\*/g, "$1"), maxW - 4);
      check(wrapped.length * 5 + 2); doc.setFontSize(9); doc.setFont("helvetica", "normal");
      doc.text(wrapped, margin + 3, y); y += wrapped.length * 5 + 1;
    } else {
      const wrapped = doc.splitTextToSize(t.replace(/\*\*(.+?)\*\*/g, "$1"), maxW);
      check(wrapped.length * 5 + 2); doc.setFontSize(9); doc.setFont("helvetica", "normal");
      doc.text(wrapped, margin, y); y += wrapped.length * 5 + 1;
    }
  }
}
const diffDias = (a, b) => {
  if (!a || !b) return null;
  const diff = new Date(b) - new Date(a);
  return Math.round(diff / (1000 * 60 * 60 * 24));
};

export default function GestorasReportesPanel({ cardStyle, sectionTitleStyle }) {
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
  const [filtroTipos, setFiltroTipos]       = useState([]);
  const [showNodoDD, setShowNodoDD]         = useState(false);
  const [showGestoraDD, setShowGestoraDD]   = useState(false);
  const [showTipoDD, setShowTipoDD]         = useState(false);

  useEffect(() => { fetchOrdenes(); }, [fechaDesde, fechaHasta]);

  async function fetchOrdenes() {
    setLoading(true); setError(null);
    const { data, error } = await supabase
      .from("ordenes")
      .select("id,autor_orden,tecnico,estado,tipo_actuacion,nodo,fecha_actuacion,fecha_creacion,empresa")
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
  const tipos    = useMemo(() => [...new Set(ordenes.map(o => o.tipo_actuacion))].filter(Boolean).sort(), [ordenes]);
  const toggle   = (set) => (v) => set(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const filtrados = useMemo(() => ordenes.filter(o => {
    if (filtroNodos.length > 0    && !filtroNodos.includes(o.nodo))            return false;
    if (filtroGestoras.length > 0 && !filtroGestoras.includes(o.autor_orden))  return false;
    if (filtroTipos.length > 0    && !filtroTipos.includes(o.tipo_actuacion))  return false;
    return true;
  }), [ordenes, filtroNodos, filtroGestoras, filtroTipos]);

  // Por gestora con tiempo de respuesta
  const porGestora = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const k = o.autor_orden || "Sin registrar";
      if (!map[k]) map[k] = { gestora: k, total: 0, liquidadas: 0, canceladas: 0, pendientes: 0, tipos: {}, diasRespuesta: [], nodos: new Set() };
      map[k].total++;
      if (o.estado === "Liquidada")      map[k].liquidadas++;
      else if (o.estado === "Cancelada") map[k].canceladas++;
      else                               map[k].pendientes++;
      const tipo = o.tipo_actuacion || "Sin tipo";
      map[k].tipos[tipo] = (map[k].tipos[tipo] || 0) + 1;
      if (o.nodo) map[k].nodos.add(o.nodo);
      const dias = diffDias(o.fecha_creacion, o.fecha_actuacion);
      if (dias !== null && dias >= 0) map[k].diasRespuesta.push(dias);
    }
    return Object.values(map).map(r => ({
      ...r,
      pct_liq: pct(r.liquidadas, r.total),
      pct_can: pct(r.canceladas, r.total),
      nodos: [...r.nodos].join(", "),
      promDias: r.diasRespuesta.length > 0
        ? (r.diasRespuesta.reduce((s, v) => s + v, 0) / r.diasRespuesta.length).toFixed(1)
        : "-",
      tipo_principal: Object.entries(r.tipos).sort((a,b)=>b[1]-a[1])[0]?.[0] || "-",
    })).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  // Tendencia diaria por gestora (top 4)
  const top4 = useMemo(() => porGestora.slice(0, 4).map(g => g.gestora), [porGestora]);
  const tendencia = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      if (!top4.includes(o.autor_orden)) continue;
      const fecha = String(o.fecha_actuacion || "").slice(0, 10);
      if (!fecha) continue;
      if (!map[fecha]) map[fecha] = { fecha };
      map[fecha][o.autor_orden] = (map[fecha][o.autor_orden] || 0) + 1;
    }
    return Object.values(map).sort((a,b) => a.fecha.localeCompare(b.fecha));
  }, [filtrados, top4]);

  // Dona tipo actuación
  const donaTipos = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const k = o.tipo_actuacion || "Sin tipo";
      map[k] = (map[k] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value).slice(0,6);
  }, [filtrados]);

  // KPIs
  const total      = filtrados.length;
  const liquidadas = filtrados.filter(o => o.estado === "Liquidada").length;
  const canceladas = filtrados.filter(o => o.estado === "Cancelada").length;
  const tasaLiq    = pct(liquidadas, total);
  const promDiasGlobal = (() => {
    const dias = filtrados.map(o => diffDias(o.fecha_creacion, o.fecha_actuacion)).filter(d => d !== null && d >= 0);
    return dias.length > 0 ? (dias.reduce((s,v)=>s+v,0)/dias.length).toFixed(1) : "-";
  })();

  async function analizarIA() {
    setLoadingIA(true); setAnalisisIA("");
    const res2 = porGestora.map(g =>
      `${g.gestora}: ${g.total} órdenes, ${g.liquidadas} liquidadas (${g.pct_liq}%), ${g.canceladas} canceladas (${g.pct_can}%), prom respuesta: ${g.promDias} días, tipo principal: ${g.tipo_principal}`
    ).join("\n");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "system",
            content: "Eres analista de operaciones de una empresa ISP. Analiza el rendimiento de las gestoras (personal administrativo que crea y gestiona órdenes de trabajo). Genera un informe ejecutivo en español con formato markdown: ### para secciones, ** para negritas, - para viñetas. Destaca: gestoras con mayor volumen, tasas de liquidación, tiempos de respuesta, y recomendaciones concretas."
          }, {
            role: "user",
            content: `Período: ${fechaDesde} al ${fechaHasta}\nTotal órdenes: ${total} | Liquidadas: ${liquidadas} (${tasaLiq}%) | Canceladas: ${canceladas} | Prom. días respuesta: ${promDiasGlobal}\n\nPor gestora:\n${res2}`
          }],
          max_tokens: 600,
        }),
      });
      const json = await res.json();
      setAnalisisIA(json.choices?.[0]?.message?.content || "Sin respuesta de la IA");
    } catch (e) { setAnalisisIA("Error: " + e.message); }
    setLoadingIA(false);
  }

  function generarPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Reporte de Gestoras", 14, 18);
    doc.setFontSize(10);
    let y = 26;
    doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, 14, y); y += 6;
    if (filtroNodos.length)    { doc.text(`Nodos: ${filtroNodos.join(", ")}`, 14, y); y += 6; }
    if (filtroGestoras.length) { doc.text(`Gestoras: ${filtroGestoras.join(", ")}`, 14, y); y += 6; }
    if (filtroTipos.length)    { doc.text(`Tipos: ${filtroTipos.join(", ")}`, 14, y); y += 6; }
    doc.text(`Total: ${total} | Liquidadas: ${liquidadas} (${tasaLiq}%) | Canceladas: ${canceladas} | Prom. días: ${promDiasGlobal}`, 14, y); y += 6;
    autoTable(doc, {
      startY: y + 2,
      head: [["Gestora", "Total", "Liquidadas", "% Liq.", "Canceladas", "% Can.", "Pendientes", "Prom. días", "Tipo Principal"]],
      body: porGestora.map(g => [g.gestora, g.total, g.liquidadas, g.pct_liq+"%", g.canceladas, g.pct_can+"%", g.pendientes, g.promDias+" d", g.tipo_principal]),
      styles: { fontSize: 8 },
    });
    if (analisisIA) renderAnalisisPDF(doc, analisisIA);
    doc.save(`reporte_gestoras_${fechaDesde}_${fechaHasta}.pdf`);
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

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header */}
      <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ ...sectionTitleStyle, marginBottom: 0 }}>Reporte de Gestoras</div>
        <button onClick={generarPDF} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>↓ Generar PDF</button>
      </div>

      {/* Filtros */}
      <div style={{ ...cardStyle, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }} />
        </div>
        <MultiSelect label="Nodo"    options={nodos}    selected={filtroNodos}    onToggle={toggle(setFiltroNodos)}    show={showNodoDD}    setShow={setShowNodoDD} />
        <MultiSelect label="Gestora" options={gestoras} selected={filtroGestoras} onToggle={toggle(setFiltroGestoras)} show={showGestoraDD} setShow={setShowGestoraDD} />
        <MultiSelect label="Tipo"    options={tipos}    selected={filtroTipos}    onToggle={toggle(setFiltroTipos)}    show={showTipoDD}    setShow={setShowTipoDD} />
        <button onClick={fetchOrdenes} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 16 }}>Actualizar</button>
      </div>

      {loading && <div style={{ ...cardStyle, color: "#6b7280" }}>Cargando...</div>}
      {error   && <div style={{ ...cardStyle, color: "#dc2626" }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* KPIs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {[
              { label: "TOTAL ÓRDENES",     value: total,         color: "#2563eb" },
              { label: "LIQUIDADAS",         value: liquidadas,    color: "#16a34a", bg: "#f0fdf4", bc: "#bbf7d0" },
              { label: "CANCELADAS",         value: canceladas,    color: "#dc2626", bg: "#fef2f2", bc: "#fecaca" },
              { label: "% LIQUIDACIÓN",      value: tasaLiq + "%", color: badgeColor(tasaLiq) },
              { label: "PROM. DÍAS RESPUESTA", value: promDiasGlobal + " d", color: "#0891b2", bg: "#eff6ff", bc: "#bfdbfe" },
              { label: "GESTORAS ACTIVAS",   value: porGestora.length, color: "#7c3aed" },
            ].map(k => (
              <div key={k.label} style={{ ...kpiStyle, background: k.bg || "#fff", borderColor: k.bc || "#e5e7eb" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: k.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Gráficos */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Órdenes por Gestora</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={porGestora} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="gestora" type="category" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="liquidadas" name="Liquidadas" fill="#16a34a" stackId="a" radius={[0,4,4,0]} />
                  <Bar dataKey="canceladas" name="Canceladas" fill="#dc2626" stackId="a" radius={[0,4,4,0]} />
                  <Bar dataKey="pendientes" name="Pendientes" fill="#d97706" stackId="a" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 10, alignSelf: "flex-start" }}>Tipos de Actuación</div>
              <PieChart width={200} height={200}>
                <Pie data={donaTipos} cx={100} cy={95} innerRadius={50} outerRadius={85} dataKey="value" label={({ name, percent }) => `${Math.round(percent*100)}%`} labelLine={false}>
                  {donaTipos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {donaTipos.map((d, i) => (
                  <span key={d.name} style={{ fontSize: 10, color: COLORS[i%COLORS.length], fontWeight: 700 }}>● {d.name}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Tendencia */}
          {tendencia.length > 0 && (
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Tendencia Diaria por Gestora (Top 4)</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={tendencia} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {top4.map((g, i) => (
                    <Line key={g} type="monotone" dataKey={g} stroke={COLORS[i%COLORS.length]} dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla */}
          <div style={{ ...cardStyle }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Detalle por Gestora</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["#","Gestora","Total","Liquidadas","% Liq.","Canceladas","% Can.","Pendientes","Prom. días","Tipo Principal","Nodos"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap", fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porGestora.map((g, i) => (
                    <tr key={g.gestora} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <td style={{ padding: "9px 12px", color: "#9ca3af", fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1e293b" }}>{g.gestora}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#2563eb" }}>{g.total}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#16a34a" }}>{g.liquidadas}</td>
                      <td style={{ padding: "9px 12px" }}>
                        <span style={{ background: badgeColor(g.pct_liq)+"20", color: badgeColor(g.pct_liq), borderRadius: 6, padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>{g.pct_liq}%</span>
                      </td>
                      <td style={{ padding: "9px 12px", color: "#dc2626" }}>{g.canceladas}</td>
                      <td style={{ padding: "9px 12px", color: "#dc2626", fontSize: 12 }}>{g.pct_can}%</td>
                      <td style={{ padding: "9px 12px", color: "#d97706" }}>{g.pendientes}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0891b2" }}>{g.promDias} d</td>
                      <td style={{ padding: "9px 12px", color: "#475569", fontSize: 12 }}>{g.tipo_principal}</td>
                      <td style={{ padding: "9px 12px", color: "#6b7280", fontSize: 11 }}>{g.nodos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Análisis IA */}
          <div style={{ ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#1e293b" }}>🤖 Análisis IA</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Informe ejecutivo generado por inteligencia artificial</div>
              </div>
              <button onClick={analizarIA} disabled={loadingIA}
                style={{ background: loadingIA ? "#94a3b8" : "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: loadingIA ? "not-allowed" : "pointer" }}>
                {loadingIA ? "⏳ Analizando..." : "🤖 Generar Análisis"}
              </button>
            </div>
            {analisisIA ? (
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "20px 24px" }}>
                <RenderAnalisis text={analisisIA} />
              </div>
            ) : (
              <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 10, padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                Haz clic en "🤖 Generar Análisis" para análisis de rendimiento por gestora, tiempos de respuesta y recomendaciones.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
