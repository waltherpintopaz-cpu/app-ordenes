import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const pct = (a, b) => b === 0 ? 0 : Math.round((a / b) * 100);

function mesISO(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${new Date(y, d.getMonth()+1, 0).getDate()}`, label: `${y}-${m}` };
}

export default function DashboardEjecutivoPanel({ cardStyle, sectionTitleStyle }) {
  const [mesCurrent, setMesCurrent] = useState([]);
  const [mesAnterior, setMesAnterior] = useState([]);
  const [vencidas, setVencidas]     = useState([]);
  const [chatwoot, setChatwoot]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  const mc = mesISO(0);
  const ma = mesISO(-1);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const hoy = new Date().toISOString().split("T")[0];
    const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const hace3 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from("ordenes").select("id,tecnico,estado,tipo_actuacion,nodo,fecha_actuacion,autor_orden")
        .gte("fecha_actuacion", mc.desde).lte("fecha_actuacion", mc.hasta).limit(5000),
      supabase.from("ordenes").select("id,tecnico,estado,tipo_actuacion,nodo,fecha_actuacion,autor_orden")
        .gte("fecha_actuacion", ma.desde).lte("fecha_actuacion", ma.hasta).limit(5000),
      supabase.from("ordenes").select("id,tecnico,estado,fecha_actuacion,nodo,autor_orden")
        .eq("estado", "Pendiente").lte("fecha_actuacion", hace3).limit(200),
      supabase.from("chatwoot_stats").select("inbox_name,agent_name,open_count,fecha,nodo")
        .eq("fecha", hoy).limit(500),
    ]);

    setMesCurrent(r1.data || []);
    setMesAnterior(r2.data || []);
    setVencidas(r3.data || []);
    setChatwoot(r4.data || []);
    setUltimaActualizacion(new Date().toLocaleTimeString());
    setLoading(false);
  }

  // KPIs mes actual
  const kpiActual = useMemo(() => {
    const liq = mesCurrent.filter(o => o.estado === "Liquidada").length;
    const can = mesCurrent.filter(o => o.estado === "Cancelada").length;
    const pen = mesCurrent.filter(o => o.estado === "Pendiente").length;
    const ins = mesCurrent.filter(o => String(o.tipo_actuacion||"").toLowerCase().includes("instalac")).length;
    const tecs = new Set(mesCurrent.map(o=>o.tecnico).filter(Boolean)).size;
    const gests = new Set(mesCurrent.map(o=>o.autor_orden).filter(Boolean)).size;
    return { total: mesCurrent.length, liq, can, pen, ins, tecs, gests, tasaLiq: pct(liq, mesCurrent.length) };
  }, [mesCurrent]);

  // KPIs mes anterior
  const kpiAnterior = useMemo(() => {
    const liq = mesAnterior.filter(o => o.estado === "Liquidada").length;
    const can = mesAnterior.filter(o => o.estado === "Cancelada").length;
    const ins = mesAnterior.filter(o => String(o.tipo_actuacion||"").toLowerCase().includes("instalac")).length;
    return { total: mesAnterior.length, liq, can, ins, tasaLiq: pct(liq, mesAnterior.length) };
  }, [mesAnterior]);

  // Comparativo por nodo (mes actual vs anterior)
  const comparativoNodo = useMemo(() => {
    const nodos = [...new Set([...mesCurrent, ...mesAnterior].map(o=>o.nodo).filter(Boolean))];
    return nodos.map(nodo => ({
      nodo,
      [mc.label]: mesCurrent.filter(o=>o.nodo===nodo && o.estado==="Liquidada").length,
      [ma.label]: mesAnterior.filter(o=>o.nodo===nodo && o.estado==="Liquidada").length,
    })).sort((a,b)=>b[mc.label]-a[mc.label]);
  }, [mesCurrent, mesAnterior]);

  // Alertas
  const alertaVencidas = vencidas;
  const alertaTecnicos = useMemo(() => {
    const tecActivos = new Set(mesCurrent.filter(o=>o.estado==="Liquidada").map(o=>o.tecnico).filter(Boolean));
    const todosLosTecos = new Set(mesCurrent.map(o=>o.tecnico).filter(Boolean));
    return [...todosLosTecos].filter(t => !tecActivos.has(t)).map(t => {
      const ords = mesCurrent.filter(o=>o.tecnico===t);
      return { tecnico: t, ordenes: ords.length, pendientes: ords.filter(o=>o.estado==="Pendiente").length };
    });
  }, [mesCurrent]);
  const alertaChats = chatwoot.filter(c => c.open_count > 0);
  const totalChatsAbiertos = alertaChats.reduce((s,c)=>s+c.open_count,0);

  const delta = (actual, anterior) => {
    if (anterior === 0) return null;
    const d = actual - anterior;
    const p = Math.round((d / anterior) * 100);
    return { d, p, up: d >= 0 };
  };

  const KpiCard = ({ label, value, prev, color = "#2563eb", bg, bc, icon }) => {
    const dlt = prev !== undefined ? delta(value, prev) : null;
    return (
      <div style={{ background: bg || "#fff", borderRadius: 14, padding: "18px 20px", border: `1px solid ${bc || "#e5e7eb"}`, flex: 1, minWidth: 130 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{icon} {label}</div>
        <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
        {dlt && (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: dlt.up ? "#16a34a" : "#dc2626" }}>
            {dlt.up ? "▲" : "▼"} {Math.abs(dlt.p)}% vs mes anterior ({dlt.up ? "+" : ""}{dlt.d})
          </div>
        )}
        {dlt === null && prev !== undefined && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>Mes anterior: {prev}</div>
        )}
      </div>
    );
  };

  const AlertaBadge = ({ count, label, color, bg }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: bg, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, color }}>
      <span style={{ fontSize: 18 }}>{count > 0 ? "⚠" : "✅"}</span>
      <span>{count} {label}</span>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header */}
      <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ ...sectionTitleStyle, marginBottom: 2 }}>Dashboard Ejecutivo</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Mes actual: {mc.label} · Comparativo con {ma.label}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {ultimaActualizacion && <span style={{ fontSize: 11, color: "#9ca3af" }}>Actualizado: {ultimaActualizacion}</span>}
          <button onClick={fetchAll} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ↺ Actualizar
          </button>
        </div>
      </div>

      {loading && <div style={{ ...cardStyle, color: "#6b7280" }}>Cargando datos del mes...</div>}

      {!loading && (
        <>
          {/* Alertas */}
          <div style={{ ...cardStyle, background: alertaVencidas.length > 0 || alertaTecnicos.length > 0 || totalChatsAbiertos > 0 ? "#fffbeb" : "#f0fdf4", borderColor: alertaVencidas.length > 0 ? "#fcd34d" : "#bbf7d0" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 12 }}>🚨 Alertas del día</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <AlertaBadge count={alertaVencidas.length}    label="órdenes vencidas (+3 días pendiente)" color={alertaVencidas.length>0?"#b45309":"#16a34a"}    bg={alertaVencidas.length>0?"#fef3c7":"#dcfce7"} />
              <AlertaBadge count={alertaTecnicos.length}    label="técnicos sin liquidaciones este mes"   color={alertaTecnicos.length>0?"#dc2626":"#16a34a"}    bg={alertaTecnicos.length>0?"#fee2e2":"#dcfce7"} />
              <AlertaBadge count={totalChatsAbiertos}       label="chats abiertos ahora"                  color={totalChatsAbiertos>0?"#1d4ed8":"#16a34a"}       bg={totalChatsAbiertos>0?"#eff6ff":"#dcfce7"} />
            </div>

            {alertaVencidas.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", marginBottom: 6 }}>Órdenes vencidas:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {alertaVencidas.slice(0,10).map(o => (
                    <span key={o.id} style={{ background: "#fef3c7", color: "#92400e", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
                      {o.fecha_actuacion} · {o.tecnico || "Sin técnico"} · {o.nodo || "-"}
                    </span>
                  ))}
                  {alertaVencidas.length > 10 && <span style={{ color: "#d97706", fontSize: 12, fontWeight: 700 }}>+{alertaVencidas.length - 10} más</span>}
                </div>
              </div>
            )}

            {alertaTecnicos.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 6 }}>Técnicos sin liquidaciones:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {alertaTecnicos.map(t => (
                    <span key={t.tecnico} style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
                      {t.tecnico} ({t.ordenes} órdenes, {t.pendientes} pendientes)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* KPIs principales con comparativo */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <KpiCard label="Total Órdenes"   value={kpiActual.total}    prev={kpiAnterior.total}    color="#2563eb" icon="📋" />
            <KpiCard label="Liquidadas"      value={kpiActual.liq}      prev={kpiAnterior.liq}      color="#16a34a" bg="#f0fdf4" bc="#bbf7d0" icon="✅" />
            <KpiCard label="Canceladas"      value={kpiActual.can}      prev={kpiAnterior.can}      color="#dc2626" bg="#fef2f2" bc="#fecaca" icon="❌" />
            <KpiCard label="% Liquidación"   value={kpiActual.tasaLiq+"%"} prev={kpiAnterior.tasaLiq} color={kpiActual.tasaLiq>=80?"#16a34a":kpiActual.tasaLiq>=50?"#d97706":"#dc2626"} icon="📊" />
            <KpiCard label="Instalaciones"   value={kpiActual.ins}      prev={kpiAnterior.ins}      color="#7c3aed" bg="#faf5ff" bc="#e9d5ff" icon="📡" />
            <KpiCard label="Técnicos Activos" value={kpiActual.tecs}    color="#0891b2" icon="🔧" />
            <KpiCard label="Gestoras Activas" value={kpiActual.gests}   color="#db2777" icon="👩‍💼" />
          </div>

          {/* Comparativo por nodo */}
          {comparativoNodo.length > 0 && (
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>Comparativo Liquidaciones por Nodo — {ma.label} vs {mc.label}</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={comparativoNodo} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nodo" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey={ma.label} fill="#94a3b8" radius={[4,4,0,0]} />
                  <Bar dataKey={mc.label} fill="#2563eb" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Resumen Chatwoot */}
          {alertaChats.length > 0 && (
            <div style={{ ...cardStyle }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#1e293b" }}>💬 Chats Abiertos Ahora ({totalChatsAbiertos} total)</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Agente","Canal","Abiertos","Nodo"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alertaChats.sort((a,b)=>b.open_count-a.open_count).map((c, i) => (
                      <tr key={i} style={{ background: i%2===0?"#fff":"#f9fafb" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{c.agent_name}</td>
                        <td style={{ padding: "8px 12px", color: "#6b7280" }}>{c.inbox_name}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 6, padding: "2px 10px", fontWeight: 700 }}>{c.open_count}</span>
                        </td>
                        <td style={{ padding: "8px 12px", color: "#6b7280" }}>{c.nodo || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resumen rápido por nodo del mes */}
          <div style={{ ...cardStyle }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#1e293b" }}>Resumen del Mes por Nodo</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {[...new Set(mesCurrent.map(o=>o.nodo).filter(Boolean))].sort().map(nodo => {
                const ords = mesCurrent.filter(o=>o.nodo===nodo);
                const liq  = ords.filter(o=>o.estado==="Liquidada").length;
                const t    = pct(liq, ords.length);
                return (
                  <div key={nodo} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", border: "1px solid #e5e7eb", minWidth: 130, textAlign: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{nodo}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#2563eb" }}>{ords.length}</div>
                    <div style={{ fontSize: 11, color: t>=80?"#16a34a":t>=50?"#d97706":"#dc2626", fontWeight: 700 }}>{t}% éxito</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
