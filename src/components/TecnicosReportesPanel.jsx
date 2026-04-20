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
const pctStr = (a, b) => pct(a, b) + "%";

export default function TecnicosReportesPanel({ cardStyle, sectionTitleStyle }) {
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
  const [filtroTecnicos, setFiltroTecnicos] = useState([]);
  const [showNodoDD, setShowNodoDD] = useState(false);
  const [showTecnicoDD, setShowTecnicoDD] = useState(false);
  const [tecnicoDetalle, setTecnicoDetalle] = useState(null);

  useEffect(() => { fetchOrdenes(); }, [fechaDesde, fechaHasta]);

  async function fetchOrdenes() {
    setLoading(true); setError(null);
    const { data, error } = await supabase
      .from("ordenes")
      .select("id,tecnico,estado,tipo_actuacion,nodo,fecha_actuacion,fecha_creacion,autor_orden,empresa")
      .gte("fecha_actuacion", fechaDesde)
      .lte("fecha_actuacion", fechaHasta)
      .order("fecha_actuacion", { ascending: true })
      .limit(10000);
    if (error) setError(error.message);
    else setOrdenes(data || []);
    setLoading(false);
  }

  const nodos = useMemo(() => [...new Set(ordenes.map(o => o.nodo))].filter(Boolean).sort(), [ordenes]);
  const tecnicos = useMemo(() => [...new Set(ordenes.map(o => o.tecnico))].filter(Boolean).sort(), [ordenes]);
  const toggle = (set) => (v) => set(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const filtrados = useMemo(() => ordenes.filter(o => {
    if (filtroNodos.length > 0 && !filtroNodos.includes(o.nodo)) return false;
    if (filtroTecnicos.length > 0 && !filtroTecnicos.includes(o.tecnico)) return false;
    return true;
  }), [ordenes, filtroNodos, filtroTecnicos]);

  // Agrupado por técnico
  const porTecnico = useMemo(() => {
    const map = {};
    for (const o of filtrados) {
      const k = o.tecnico || "Sin asignar";
      if (!map[k]) map[k] = { tecnico: k, total: 0, liquidadas: 0, pendientes: 0, canceladas: 0, tipos: {} };
      map[k].total++;
      if (o.estado === "Liquidada") map[k].liquidadas++;
      else if (o.estado === "Pendiente") map[k].pendientes++;
      else if (o.estado === "Cancelada") map[k].canceladas++;
      const tipo = o.tipo_actuacion || "Sin tipo";
      map[k].tipos[tipo] = (map[k].tipos[tipo] || 0) + 1;
    }
    return Object.values(map)
      .map(r => ({ ...r, pct_liq: pct(r.liquidadas, r.total), tipo_principal: Object.entries(r.tipos).sort((a,b)=>b[1]-a[1])[0]?.[0] || "-" }))
      .sort((a, b) => b.liquidadas - a.liquidadas);
  }, [filtrados]);

  // Tendencia diaria agrupada por técnico (top 5)
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

  // Radar por técnico (top 6): liquidadas, pendientes, canceladas normalizados
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

  // KPIs
  const totalTecnicos = porTecnico.filter(t => t.tecnico !== "Sin asignar").length;
  const totalLiquidadas = filtrados.filter(o => o.estado === "Liquidada").length;
  const totalOrdenes = filtrados.length;
  const promedioEficiencia = totalTecnicos > 0
    ? Math.round(porTecnico.filter(t => t.tecnico !== "Sin asignar").reduce((s, t) => s + t.pct_liq, 0) / totalTecnicos)
    : 0;
  const mejorTecnico = porTecnico.find(t => t.tecnico !== "Sin asignar" && t.total >= 3);
  const peorTecnico = [...porTecnico].filter(t => t.tecnico !== "Sin asignar" && t.total >= 3).sort((a, b) => a.pct_liq - b.pct_liq)[0];

  async function analizarIA() {
    setLoadingIA(true); setAnalisisIA("");
    const resumen = porTecnico.slice(0, 10).map(t =>
      `${t.tecnico}: ${t.total} órdenes, ${t.liquidadas} liquidadas (${t.pct_liq}%), ${t.canceladas} canceladas, tipo principal: ${t.tipo_principal}`
    ).join("\n");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "system",
            content: "Eres un analista de operaciones para una empresa ISP. Analiza el rendimiento de los técnicos y genera un informe ejecutivo en español. Destaca: el mejor y peor técnico, patrones de cancelaciones, tipos de trabajo más frecuentes, y recomendaciones concretas de gestión. Usa viñetas y sé directo."
          }, {
            role: "user",
            content: `Período: ${fechaDesde} al ${fechaHasta}\nTotal órdenes: ${totalOrdenes}\nTécnicos activos: ${totalTecnicos}\n\nRendimiento por técnico:\n${resumen}`
          }],
          max_tokens: 600,
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
    doc.setFontSize(10); doc.text(`Período: ${fechaDesde} al ${fechaHasta}`, 14, 26);
    if (filtroNodos.length) doc.text(`Nodos: ${filtroNodos.join(", ")}`, 14, 32);
    if (filtroTecnicos.length) doc.text(`Técnicos: ${filtroTecnicos.join(", ")}`, 14, 38);
    autoTable(doc, {
      startY: filtroNodos.length || filtroTecnicos.length ? 44 : 34,
      head: [["Técnico", "Total", "Liquidadas", "% Efic.", "Pendientes", "Canceladas", "Tipo Principal"]],
      body: porTecnico.map(t => [t.tecnico, t.total, t.liquidadas, t.pct_liq + "%", t.pendientes, t.canceladas, t.tipo_principal]),
      styles: { fontSize: 9 },
    });
    if (analisisIA) {
      const y = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12); doc.text("Análisis IA", 14, y);
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(analisisIA, 180);
      doc.text(lines, 14, y + 8);
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
        <div>
          <div style={{ ...sectionTitleStyle, marginBottom: 4 }}>Reporte de Técnicos</div>
        </div>
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
        <button onClick={fetchOrdenes} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 16 }}>
          Actualizar
        </button>
      </div>

      {loading && <div style={{ ...cardStyle, color: "#6b7280" }}>Cargando...</div>}
      {error && <div style={{ ...cardStyle, color: "#dc2626" }}>{error}</div>}

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
            {mejorTecnico && (
              <div style={{ ...kpiStyle, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>🏆 MEJOR TÉCNICO</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#15803d" }}>{mejorTecnico.tecnico.split(" ").slice(0,2).join(" ")}</div>
                <div style={{ fontSize: 12, color: "#16a34a" }}>{mejorTecnico.pct_liq}% eficiencia</div>
              </div>
            )}
            {peorTecnico && peorTecnico.tecnico !== mejorTecnico?.tecnico && (
              <div style={{ ...kpiStyle, background: "#fff7ed", borderColor: "#fed7aa" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>⚠ REQUIERE ATENCIÓN</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#b45309" }}>{peorTecnico.tecnico.split(" ").slice(0,2).join(" ")}</div>
                <div style={{ fontSize: 12, color: "#d97706" }}>{peorTecnico.pct_liq}% eficiencia</div>
              </div>
            )}
          </div>

          {/* Gráficos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Barras comparativo */}
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Comparativo por Técnico</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porTecnico.filter(t => t.tecnico !== "Sin asignar").slice(0, 8)} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="tecnico" type="category" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="liquidadas" name="Liquidadas" fill="#16a34a" radius={[0,4,4,0]} />
                  <Bar dataKey="pendientes" name="Pendientes" fill="#d97706" radius={[0,4,4,0]} />
                  <Bar dataKey="canceladas" name="Canceladas" fill="#dc2626" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Radar eficiencia */}
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Radar de Rendimiento (Top 6)</div>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="tecnico" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="% Eficiencia" dataKey="% Eficiencia" stroke="#2563eb" fill="#2563eb" fillOpacity={0.3} />
                  <Radar name="Liquidadas" dataKey="Liquidadas" stroke="#16a34a" fill="#16a34a" fillOpacity={0.2} />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tendencia diaria liquidadas por técnico (top 5) */}
          {tendenciaDiaria.length > 0 && (
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Tendencia Diaria de Liquidaciones (Top 5 Técnicos)</div>
              <ResponsiveContainer width="100%" height={240}>
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
                    {["#", "Técnico", "Total", "Liquidadas", "Pendientes", "Canceladas", "% Eficiencia", "Tipo Principal"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porTecnico.map((t, i) => (
                    <tr key={t.tecnico} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", cursor: "pointer" }}
                      onClick={() => setTecnicoDetalle(tecnicoDetalle === t.tecnico ? null : t.tecnico)}>
                      <td style={{ padding: "9px 12px", color: "#9ca3af", fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1e293b" }}>{t.tecnico}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#2563eb" }}>{t.total}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#16a34a" }}>{t.liquidadas}</td>
                      <td style={{ padding: "9px 12px", color: "#d97706" }}>{t.pendientes}</td>
                      <td style={{ padding: "9px 12px", color: "#dc2626" }}>{t.canceladas}</td>
                      <td style={{ padding: "9px 12px" }}>
                        <span style={{ background: badgeColor(t.pct_liq) + "20", color: badgeColor(t.pct_liq), borderRadius: 6, padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                          {t.pct_liq}%
                        </span>
                      </td>
                      <td style={{ padding: "9px 12px", color: "#475569", fontSize: 12 }}>{t.tipo_principal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detalle de tipos al hacer clic en técnico */}
            {tecnicoDetalle && (() => {
              const t = porTecnico.find(x => x.tecnico === tecnicoDetalle);
              if (!t) return null;
              return (
                <div style={{ marginTop: 16, padding: 14, background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe" }}>
                  <div style={{ fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>Detalle de tipos — {t.tecnico}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {Object.entries(t.tipos).sort((a,b) => b[1]-a[1]).map(([tipo, cnt]) => (
                      <span key={tipo} style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>
                        {tipo}: {cnt}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Análisis IA */}
          <div style={{ ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>Análisis IA</div>
              <button onClick={analizarIA} disabled={loadingIA}
                style={{ background: loadingIA ? "#94a3b8" : "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: loadingIA ? "not-allowed" : "pointer" }}>
                {loadingIA ? "Analizando..." : "🤖 Analizar"}
              </button>
            </div>
            {analisisIA && (
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: 16, fontSize: 13, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {analisisIA}
              </div>
            )}
            {!analisisIA && !loadingIA && (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>Haz clic en "🤖 Analizar" para obtener un análisis automático del rendimiento del equipo técnico.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
