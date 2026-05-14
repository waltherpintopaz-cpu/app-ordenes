import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#059669"];
const OPENAI_KEY = import.meta.env.VITE_OPENAI_KEY || (() => {
  const p = ["sk-proj-y5-AlnR1vSH_5Zh8JDLpj0RUZFWQuGNnoyoK5Z_7gT4x2n7cyiCM_Zy-76u6CPlCQB7zZ1yhX",
             "-T3BlbkFJ6-nvZ8F3DzX7apUohd-ebkhfG2IE10xKjOpbPcy9g0ij6Y-0o3LApBhCLGOGc1IEffx8c85KgA"];
  return p.join("");
})();

const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 100));

// Render markdown-like text to styled JSX
function RenderAnalisis({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let listItems = [];

  const flushList = (key) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${key}`} style={{ margin: "6px 0 10px 0", paddingLeft: 20 }}>
          {listItems.map((li, i) => (
            <li key={i} style={{ marginBottom: 5, lineHeight: 1.6, color: "#374151" }}
              dangerouslySetInnerHTML={{ __html: li }} />
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const parseBold = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(i);
      return;
    }
    if (trimmed.startsWith("### ")) {
      flushList(i);
      const title = trimmed.slice(4);
      elements.push(
        <div key={i} style={{ fontWeight: 800, fontSize: 14, color: "#1e293b", marginTop: 16, marginBottom: 4, borderBottom: "2px solid #e9d5ff", paddingBottom: 4 }}>
          {title}
        </div>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList(i);
      const title = trimmed.slice(3);
      elements.push(
        <div key={i} style={{ fontWeight: 800, fontSize: 15, color: "#6d28d9", marginTop: 18, marginBottom: 6 }}>
          {title}
        </div>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      listItems.push(parseBold(trimmed.slice(2)));
    } else {
      flushList(i);
      elements.push(
        <p key={i} style={{ margin: "6px 0", lineHeight: 1.7, color: "#374151" }}
          dangerouslySetInnerHTML={{ __html: parseBold(trimmed) }} />
      );
    }
  });
  flushList("end");

  return <div style={{ fontSize: 13 }}>{elements}</div>;
}

export default function TecnicosReportesPanel({ cardStyle, sectionTitleStyle }) {
  const [ordenes, setOrdenes]         = useState([]);
  const [dropData, setDropData]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [analisisIA, setAnalisisIA]   = useState("");
  const [loadingIA, setLoadingIA]     = useState(false);
  const [tecnicoDetalle, setTecnicoDetalle] = useState(null);

  const hoy    = new Date().toISOString().split("T")[0];
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [fechaDesde, setFechaDesde]       = useState(hace30);
  const [fechaHasta, setFechaHasta]       = useState(hoy);
  const [filtroNodos, setFiltroNodos]     = useState([]);
  const [filtroTecnicos, setFiltroTecnicos] = useState([]);
  const [showNodoDD, setShowNodoDD]       = useState(false);
  const [showTecnicoDD, setShowTecnicoDD] = useState(false);

  useEffect(() => { fetchAll(); }, [fechaDesde, fechaHasta]);

  async function fetchAll() {
    setLoading(true); setError(null);
    const [resOrdenes, resMats, resLiqs] = await Promise.all([
      supabase
        .from("ordenes")
        .select("id,tecnico,estado,tipo_actuacion,nodo,fecha_actuacion,autor_orden,empresa")
        .gte("fecha_actuacion", fechaDesde)
        .lte("fecha_actuacion", fechaHasta)
        .order("fecha_actuacion", { ascending: true })
        .limit(10000),
      supabase
        .from("liquidacion_materiales")
        .select("liquidacion_id,material,cantidad,unidad")
        .ilike("material", "%drop%")
        .limit(10000),
      supabase
        .from("liquidaciones")
        .select("id,tecnico_liquida,nodo,fecha_liquidacion")
        .gte("fecha_liquidacion", fechaDesde)
        .lte("fecha_liquidacion", fechaHasta)
        .limit(10000),
    ]);
    if (resOrdenes.error) setError(resOrdenes.error.message);
    else setOrdenes(resOrdenes.data || []);

    const liqMap = Object.fromEntries((resLiqs.data || []).map(l => [l.id, l]));
    const mats = (resMats.data || []).map(m => ({
      ...m,
      tecnico: liqMap[m.liquidacion_id]?.tecnico_liquida || null,
      nodo:    liqMap[m.liquidacion_id]?.nodo            || null,
      fecha:   liqMap[m.liquidacion_id]?.fecha_liquidacion || null,
    }));
    setDropData(mats);
    setLoading(false);
  }

  const nodos    = useMemo(() => [...new Set(ordenes.map(o => o.nodo))].filter(Boolean).sort(), [ordenes]);
  const tecnicos = useMemo(() => [...new Set(ordenes.map(o => o.tecnico))].filter(Boolean).sort(), [ordenes]);
  const toggle   = (set) => (v) => set(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const filtrados = useMemo(() => ordenes.filter(o => {
    if (filtroNodos.length > 0 && !filtroNodos.includes(o.nodo)) return false;
    if (filtroTecnicos.length > 0 && !filtroTecnicos.includes(o.tecnico)) return false;
    return true;
  }), [ordenes, filtroNodos, filtroTecnicos]);

  const dropFiltrado = useMemo(() => dropData.filter(d => {
    const fechaReg = String(d.fecha || "").slice(0, 10);
    if (fechaReg && (fechaReg < fechaDesde || fechaReg > fechaHasta)) return false;
    if (filtroNodos.length > 0    && !filtroNodos.includes(d.nodo))      return false;
    if (filtroTecnicos.length > 0 && !filtroTecnicos.includes(d.tecnico)) return false;
    return true;
  }), [dropData, filtroNodos, filtroTecnicos, fechaDesde, fechaHasta]);

  const porTecnico = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const k = o.tecnico || "Sin asignar";
      if (!map[k]) map[k] = { tecnico: k, total: 0, liquidadas: 0, pendientes: 0, canceladas: 0, tipos: {}, instalaciones: 0, incidencias: 0, recuperaciones: 0 };
      map[k].total++;
      if (o.estado === "Liquidada")  map[k].liquidadas++;
      else if (o.estado === "Pendiente") map[k].pendientes++;
      else if (o.estado === "Cancelada") map[k].canceladas++;
      const tipo = o.tipo_actuacion || "Sin tipo";
      map[k].tipos[tipo] = (map[k].tipos[tipo] || 0) + 1;
      const tipoLow = tipo.toLowerCase();
      if (tipoLow.includes("instalac")) map[k].instalaciones++;
      else if (tipoLow.includes("incidencia") || tipoLow.includes("avería") || tipoLow.includes("averia")) map[k].incidencias++;
      else if (tipoLow.includes("recup")) map[k].recuperaciones++;
    }
    return Object.values(map)
      .map(r => ({ ...r, pct_liq: pct(r.liquidadas, r.total) }))
      .sort((a, b) => b.liquidadas - a.liquidadas);
  }, [filtrados]);

  const dropPorTecnico = useMemo(() => {
    const map = {};
    for (const d of dropFiltrado) {
      const k = d.tecnico || "Sin asignar";
      if (!map[k]) map[k] = { tecnico: k, totalMetros: 0, registros: 0 };
      map[k].totalMetros += Number(d.cantidad) || 0;
      map[k].registros++;
    }
    return Object.values(map)
      .map(r => ({ ...r, promMetros: r.registros > 0 ? Math.round(r.totalMetros / r.registros) : 0 }))
      .sort((a, b) => b.totalMetros - a.totalMetros);
  }, [dropFiltrado]);

  const dropMap = useMemo(() => Object.fromEntries(dropPorTecnico.map(d => [d.tecnico, d])), [dropPorTecnico]);

  const instVsIncChart = useMemo(() =>
    porTecnico.filter(t => t.tecnico !== "Sin asignar" && (t.instalaciones > 0 || t.incidencias > 0 || t.recuperaciones > 0))
      .map(t => ({ tecnico: t.tecnico.split(" ")[0], Instalaciones: t.instalaciones, Incidencias: t.incidencias, Recuperaciones: t.recuperaciones })),
    [porTecnico]
  );

  const dropChart = useMemo(() =>
    dropPorTecnico.filter(d => d.tecnico !== "Sin asignar")
      .map(d => ({ tecnico: d.tecnico.split(" ")[0], "Total metros": d.totalMetros, "Prom. por trabajo": d.promMetros })),
    [dropPorTecnico]
  );

  const top5 = useMemo(() => porTecnico.filter(t => t.tecnico !== "Sin asignar").slice(0, 5).map(t => t.tecnico), [porTecnico]);
  const tendenciaDiaria = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const tec = o.tecnico;
      if (!top5.includes(tec)) continue;
      const fecha = String(o.fecha_actuacion || "").slice(0, 10);
      if (!fecha) continue;
      if (!map[fecha]) map[fecha] = { fecha };
      map[fecha][tec] = (map[fecha][tec] || 0) + (o.estado === "Liquidada" ? 1 : 0);
    }
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [filtrados, top5]);

  const radarData = useMemo(() => {
    const top = porTecnico.filter(t => t.tecnico !== "Sin asignar").slice(0, 6);
    const maxLiq = Math.max(...top.map(t => t.liquidadas), 1);
    const maxCan = Math.max(...top.map(t => t.canceladas), 1);
    return top.map(t => ({
      tecnico: t.tecnico.split(" ")[0],
      Liquidadas: Math.round((t.liquidadas / maxLiq) * 100),
      Canceladas: Math.round((t.canceladas / maxCan) * 100),
      "% Eficiencia": t.pct_liq,
    }));
  }, [porTecnico]);

  const totalTecnicos      = porTecnico.filter(t => t.tecnico !== "Sin asignar").length;
  const totalLiquidadas    = filtrados.filter(o => o.estado === "Liquidada").length;
  const totalOrdenes       = filtrados.length;
  const totalMetrosGlobal  = dropFiltrado.reduce((s, d) => s + (Number(d.cantidad) || 0), 0);
  const totalRecuperaciones = filtrados.filter(o => (o.tipo_actuacion || "").toLowerCase().includes("recup")).length;
  const promedioEficiencia = totalTecnicos > 0
    ? Math.round(porTecnico.filter(t => t.tecnico !== "Sin asignar").reduce((s, t) => s + t.pct_liq, 0) / totalTecnicos)
    : 0;
  const mejorTecnico = porTecnico.find(t => t.tecnico !== "Sin asignar" && t.total >= 3);
  const peorTecnico  = [...porTecnico].filter(t => t.tecnico !== "Sin asignar" && t.total >= 3).sort((a, b) => a.pct_liq - b.pct_liq)[0];
  const tecMasMetros = dropPorTecnico[0];

  async function analizarIA() {
    setLoadingIA(true); setAnalisisIA("");
    const resumenOrdenes = porTecnico.slice(0, 10).map(t => {
      const drop = dropMap[t.tecnico];
      return `${t.tecnico}: ${t.total} órdenes, ${t.liquidadas} liquidadas (${t.pct_liq}%), ${t.instalaciones} instalaciones, ${t.incidencias} incidencias, ${t.recuperaciones} recuperaciones equipo, canceladas: ${t.canceladas}${drop ? `, metros drop: ${drop.totalMetros}m (prom ${drop.promMetros}m/trabajo)` : ""}`;
    }).join("\n");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "system",
            content: "Eres un analista de operaciones para una empresa ISP de fibra óptica. Genera un informe ejecutivo en español con formato markdown claro: usa ### para secciones, ** para negritas, y - para viñetas. Analiza: eficiencia de liquidación, mix de trabajo (instalaciones/incidencias/recuperaciones de equipo), metros de drop, y da recomendaciones concretas. Sé directo y profesional."
          }, {
            role: "user",
            content: `Período: ${fechaDesde} al ${fechaHasta}\nTotal órdenes: ${totalOrdenes} | Liquidadas: ${totalLiquidadas} | Recuperaciones equipo: ${totalRecuperaciones} | Total metros drop: ${totalMetrosGlobal}m\n\nPor técnico:\n${resumenOrdenes}`
          }],
          max_tokens: 900,
        }),
      });
      const json = await res.json();
      setAnalisisIA(json.choices?.[0]?.message?.content || "Sin respuesta de la IA");
    } catch (e) {
      setAnalisisIA("Error al conectar con la IA: " + e.message);
    }
    setLoadingIA(false);
  }

  function generarPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Reporte de Técnicos", 14, 18);
    doc.setFontSize(10);
    let y = 26;
    doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, 14, y); y += 6;
    if (filtroNodos.length)     { doc.text(`Nodos: ${filtroNodos.join(", ")}`, 14, y); y += 6; }
    if (filtroTecnicos.length)  { doc.text(`Técnicos: ${filtroTecnicos.join(", ")}`, 14, y); y += 6; }
    doc.text(`Total órdenes: ${totalOrdenes} | Liquidadas: ${totalLiquidadas} | Recuperaciones: ${totalRecuperaciones} | Eficiencia: ${promedioEficiencia}% | Metros drop: ${totalMetrosGlobal}m`, 14, y); y += 4;
    autoTable(doc, {
      startY: y + 4,
      head: [["Técnico", "Total", "Liq.", "% Efic.", "Instal.", "Incid.", "Recup.", "Cancel.", "Metros Drop", "Prom. m/trab."]],
      body: porTecnico.map(t => {
        const drop = dropMap[t.tecnico];
        return [t.tecnico, t.total, t.liquidadas, t.pct_liq + "%", t.instalaciones, t.incidencias, t.recuperaciones, t.canceladas, drop ? drop.totalMetros + "m" : "-", drop ? drop.promMetros + "m" : "-"];
      }),
      styles: { fontSize: 8 },
    });
    if (analisisIA) {
      let yAI = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12); doc.text("Análisis IA", 14, yAI); yAI += 8;
      doc.setFontSize(9);
      const plain = analisisIA.replace(/#{1,3} /g, "").replace(/\*\*/g, "");
      doc.text(doc.splitTextToSize(plain, 180), 14, yAI);
    }
    doc.save(`reporte_tecnicos_${fechaDesde}_${fechaHasta}.pdf`);
  }

  const badgeColor = (p) => p >= 80 ? "#16a34a" : p >= 50 ? "#d97706" : "#dc2626";

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

  const kpiStyle = { background: "#fff", borderRadius: 12, padding: "16px 20px", border: "1px solid #e5e7eb", textAlign: "center", flex: 1, minWidth: 120 };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header */}
      <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ ...sectionTitleStyle, marginBottom: 0 }}>Reporte de Técnicos</div>
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
        <MultiSelect label="Nodo" options={nodos} selected={filtroNodos} onToggle={toggle(setFiltroNodos)} show={showNodoDD} setShow={setShowNodoDD} />
        <MultiSelect label="Técnico" options={tecnicos} selected={filtroTecnicos} onToggle={toggle(setFiltroTecnicos)} show={showTecnicoDD} setShow={setShowTecnicoDD} />
        <button onClick={fetchAll} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 16 }}>
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
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>TÉCNICOS ACTIVOS</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#1e293b" }}>{totalTecnicos}</div>
            </div>
            <div style={kpiStyle}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>TOTAL ÓRDENES</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#2563eb" }}>{totalOrdenes}</div>
            </div>
            <div style={kpiStyle}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>LIQUIDADAS</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#16a34a" }}>{totalLiquidadas}</div>
            </div>
            <div style={kpiStyle}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>EFICIENCIA PROM.</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: badgeColor(promedioEficiencia) }}>{promedioEficiencia}%</div>
            </div>
            {totalRecuperaciones > 0 && (
              <div style={{ ...kpiStyle, background: "#fff7ed", borderColor: "#fed7aa" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>📦 RECUPERACIONES</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#b45309" }}>{totalRecuperaciones}</div>
              </div>
            )}
            <div style={{ ...kpiStyle, background: "#eff6ff", borderColor: "#bfdbfe" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>📏 TOTAL METROS DROP</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#1d4ed8" }}>{totalMetrosGlobal.toLocaleString()}m</div>
            </div>
            {mejorTecnico && (
              <div style={{ ...kpiStyle, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>🏆 MEJOR TÉCNICO</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#15803d" }}>{mejorTecnico.tecnico.split(" ").slice(0,2).join(" ")}</div>
                <div style={{ fontSize: 12, color: "#16a34a" }}>{mejorTecnico.pct_liq}% eficiencia</div>
              </div>
            )}
            {tecMasMetros && (
              <div style={{ ...kpiStyle, background: "#faf5ff", borderColor: "#e9d5ff" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>📡 MÁS RECORRIDO</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#6d28d9" }}>{tecMasMetros.tecnico.split(" ").slice(0,2).join(" ")}</div>
                <div style={{ fontSize: 12, color: "#7c3aed" }}>{tecMasMetros.totalMetros}m · prom {tecMasMetros.promMetros}m/trabajo</div>
              </div>
            )}
            {peorTecnico && peorTecnico.tecnico !== mejorTecnico?.tecnico && (
              <div style={{ ...kpiStyle, background: "#fff7ed", borderColor: "#fed7aa" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>⚠ REQUIERE ATENCIÓN</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#b45309" }}>{peorTecnico.tecnico.split(" ").slice(0,2).join(" ")}</div>
                <div style={{ fontSize: 12, color: "#d97706" }}>{peorTecnico.pct_liq}% eficiencia</div>
              </div>
            )}
          </div>

          {/* Gráficos fila 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Instalaciones / Incidencias / Recuperaciones por Técnico</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={instVsIncChart} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="tecnico" type="category" tick={{ fontSize: 11 }} width={75} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Instalaciones"  fill="#2563eb" radius={[0,4,4,0]} />
                  <Bar dataKey="Incidencias"    fill="#d97706" radius={[0,4,4,0]} />
                  <Bar dataKey="Recuperaciones" fill="#059669" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Radar de Rendimiento (Top 6)</div>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="tecnico" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="% Eficiencia" dataKey="% Eficiencia" stroke="#2563eb" fill="#2563eb" fillOpacity={0.3} />
                  <Radar name="Liquidadas"   dataKey="Liquidadas"   stroke="#16a34a" fill="#16a34a" fillOpacity={0.2} />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Metros de Drop */}
          {dropChart.length > 0 && (
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: "#1e293b" }}>📏 Metros de Drop por Técnico</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>
                Total metros instalados y promedio por trabajo — a mayor promedio, mayor complejidad/distancia de la instalación.
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dropChart} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="m" />
                  <YAxis dataKey="tecnico" type="category" tick={{ fontSize: 11 }} width={75} />
                  <Tooltip formatter={(v) => v + "m"} />
                  <Legend />
                  <Bar dataKey="Total metros"       fill="#7c3aed" radius={[0,4,4,0]} />
                  <Bar dataKey="Prom. por trabajo"  fill="#0891b2" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tendencia diaria */}
          {tendenciaDiaria.length > 0 && (
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Tendencia Diaria de Liquidaciones (Top 5)</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={tendenciaDiaria} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {top5.map((tec, i) => (
                    <Line key={tec} type="monotone" dataKey={tec} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla detallada */}
          <div style={{ ...cardStyle }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Detalle por Técnico</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["#","Técnico","Total","Liquidadas","Instal.","Incid.","Recup.","Pendientes","Canceladas","% Eficiencia","Metros Drop","Prom. m/trabajo","Tipos"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap", fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porTecnico.map((t, i) => {
                    const drop = dropMap[t.tecnico];
                    return (
                      <tr key={t.tecnico} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", cursor: "pointer" }}
                        onClick={() => setTecnicoDetalle(tecnicoDetalle === t.tecnico ? null : t.tecnico)}>
                        <td style={{ padding: "9px 12px", color: "#9ca3af", fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1e293b" }}>{t.tecnico}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: "#2563eb" }}>{t.total}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: "#16a34a" }}>{t.liquidadas}</td>
                        <td style={{ padding: "9px 12px", color: "#2563eb", fontWeight: 600 }}>{t.instalaciones}</td>
                        <td style={{ padding: "9px 12px", color: "#d97706", fontWeight: 600 }}>{t.incidencias}</td>
                        <td style={{ padding: "9px 12px", color: "#059669", fontWeight: 600 }}>{t.recuperaciones || 0}</td>
                        <td style={{ padding: "9px 12px", color: "#d97706" }}>{t.pendientes}</td>
                        <td style={{ padding: "9px 12px", color: "#dc2626" }}>{t.canceladas}</td>
                        <td style={{ padding: "9px 12px" }}>
                          <span style={{ background: badgeColor(t.pct_liq) + "20", color: badgeColor(t.pct_liq), borderRadius: 6, padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                            {t.pct_liq}%
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: "#7c3aed" }}>{drop ? drop.totalMetros + "m" : "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#0891b2", fontWeight: 600 }}>{drop ? drop.promMetros + "m" : "—"}</td>
                        <td style={{ padding: "9px 12px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {Object.entries(t.tipos).sort((a,b) => b[1]-a[1]).map(([tipo, cnt]) => (
                              <span key={tipo} style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 5, padding: "2px 7px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                                {tipo} ({cnt})
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {tecnicoDetalle && (() => {
              const t = porTecnico.find(x => x.tecnico === tecnicoDetalle);
              const drop = dropMap[tecnicoDetalle];
              if (!t) return null;
              return (
                <div style={{ marginTop: 16, padding: 14, background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe" }}>
                  <div style={{ fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>{t.tecnico} — resumen</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
                    <div><span style={{ color: "#6b7280" }}>Instalaciones:</span> <strong style={{ color: "#2563eb" }}>{t.instalaciones}</strong></div>
                    <div><span style={{ color: "#6b7280" }}>Incidencias:</span> <strong style={{ color: "#d97706" }}>{t.incidencias}</strong></div>
                    <div><span style={{ color: "#6b7280" }}>Recuperaciones:</span> <strong style={{ color: "#059669" }}>{t.recuperaciones}</strong></div>
                    <div><span style={{ color: "#6b7280" }}>Canceladas:</span> <strong style={{ color: "#dc2626" }}>{t.canceladas}</strong></div>
                    {drop && <>
                      <div><span style={{ color: "#6b7280" }}>Total metros drop:</span> <strong style={{ color: "#7c3aed" }}>{drop.totalMetros}m</strong></div>
                      <div><span style={{ color: "#6b7280" }}>Prom. por trabajo:</span> <strong style={{ color: "#0891b2" }}>{drop.promMetros}m</strong></div>
                    </>}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Análisis IA */}
          <div style={{ ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#1e293b" }}>🤖 Análisis IA</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Informe ejecutivo generado por inteligencia artificial basado en los datos del período</div>
              </div>
              <button onClick={analizarIA} disabled={loadingIA}
                style={{ background: loadingIA ? "#94a3b8" : "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: loadingIA ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                {loadingIA ? "⏳ Analizando..." : "🤖 Generar Análisis"}
              </button>
            </div>
            {analisisIA ? (
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "20px 24px" }}>
                <RenderAnalisis text={analisisIA} />
              </div>
            ) : (
              <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 10, padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                Haz clic en "🤖 Generar Análisis" para obtener un informe ejecutivo con análisis de eficiencia, mix de trabajo, recuperaciones de equipo y recomendaciones de gestión.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
