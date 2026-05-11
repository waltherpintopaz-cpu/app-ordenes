import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";

/* Datos en tiempo real vienen de Supabase (sincronizado por n8n cada 5 min) */

/* ─── Mapeo nodo lógico → nodos mikrowisp ─────────── */
const NODOS = [
  { label: "Todos",  value: "todos", ids: [] },
  { label: "Nod_01", value: "Nod_01", ids: [1, 7, 8, 9] },
  { label: "Nod_02", value: "Nod_02", ids: [2] },
  { label: "Nod_03", value: "Nod_03", ids: [3, 10] },
  { label: "Nod_04", value: "Nod_04", ids: [5, 6] },
  { label: "Nod_06", value: "Nod_06", ids: [11] },
];
const NODO_MAP = { 1:"Nod_01",7:"Nod_01",8:"Nod_01",9:"Nod_01",2:"Nod_02",3:"Nod_03",10:"Nod_03",5:"Nod_04",6:"Nod_04",11:"Nod_06" };

/* ─── helpers ──────────────────────────────────────── */
function isoToday() { return new Date().toISOString().split("T")[0]; }
function isoAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
}

function fmtElapsed(seconds) {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function waitColor(seconds) {
  if (seconds == null) return "#6b7280";
  if (seconds < 300)  return "#16a34a"; // green  < 5 min
  if (seconds < 900)  return "#d97706"; // yellow 5-15 min
  return "#dc2626";                      // red    > 15 min
}

const STATUS_DOT = {
  online:  "#16a34a",
  busy:    "#f59e0b",
  offline: "#9ca3af",
};

const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};

const badge = (bg, color) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: bg,
  color,
  borderRadius: 8,
  padding: "4px 12px",
  fontWeight: 700,
  fontSize: 13,
  marginRight: 8,
});

/* ─── Main component ───────────────────────────────── */
export default function AgentesDashboard({ cardStyle, sectionTitleStyle }) {
  const cs  = cardStyle        || card;
  const sts = sectionTitleStyle || { fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1e293b" };

  /* ── Real-time state ── */
  const [agents,       setAgents]       = useState([]);
  const [openConvs,    setOpenConvs]    = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [unassignedRt, setUnassignedRt] = useState(0);
  const [rtLoading,    setRtLoading]    = useState(true);
  const [rtError,      setRtError]      = useState(null);
  const [lastRefresh,  setLastRefresh]  = useState(null);
  const [elapsed,      setElapsed]      = useState(0);

  /* ── Historical state ── */
  const [histStats,    setHistStats]    = useState([]);
  const [histLoading,  setHistLoading]  = useState(false);
  const [histError,    setHistError]    = useState(null);
  const [histDesde,    setHistDesde]    = useState(isoAgo(30));
  const [histHasta,    setHistHasta]    = useState(isoToday());

  /* ── Bot state ── */
  const [botLogs,      setBotLogs]      = useState([]);
  const [botLoading,   setBotLoading]   = useState(false);
  const [botError,     setBotError]     = useState(null);
  const [botDesde,     setBotDesde]     = useState(isoAgo(30));
  const [botHasta,     setBotHasta]     = useState(isoToday());
  const [botDetalle,   setBotDetalle]   = useState(null); // null | "SI" | "NO" | "NOTIFICAR"
  const [botRowsExp,   setBotRowsExp]   = useState([]);  // índices de filas expandidas

  /* ── Filtros globales ── */
  const [filtroNodo,   setFiltroNodo]   = useState("todos");
  const [filtroTel,    setFiltroTel]    = useState("");

  /* ═══════════════════════════════════════════════════
     Real-time fetch — lee de Supabase (n8n sincroniza cada 5 min)
  ═══════════════════════════════════════════════════ */
  const fetchRealtime = useCallback(() => {
    setRtLoading(true);
    setRtError(null);

    Promise.all([
      supabase.from("bot_agentes_estado").select("*").order("agent_name"),
      supabase.from("bot_conversaciones_espera").select("*").order("waiting_since"),
      supabase.from("bot_chat_totales").select("*").eq("id", 1).maybeSingle(),
    ]).then(([{ data: agentsData, error: e1 }, { data: esperaData, error: e2 }, { data: totales, error: e3 }]) => {
      if (e1 || e2 || e3) {
        setRtError("Error al cargar datos: " + (e1?.message || e2?.message || e3?.message));
        setRtLoading(false);
        return;
      }
      // Mapear al formato que espera el resto del componente
      setAgents((agentsData || []).map(a => ({
        id: a.agent_id,
        name: a.agent_name,
        availability_status: a.availability,
        _open_count: a.open_count,
        _waiting_count: a.waiting_count,
      })));
      // openConvs: usamos bot_conversaciones_espera para la sección de espera
      setOpenConvs((esperaData || []).map(c => ({
        id: c.conv_id,
        meta: { assignee: { id: c.assignee_id, name: c.assignee_name } },
        waiting_since: c.waiting_since,
        created_at: c.created_at,
        inbox_id: c.inbox_id,
      })));
      setPendingCount(totales?.pending_total ?? 0);
      setUnassignedRt(totales?.unassigned ?? 0);
      setLastRefresh(new Date());
      setElapsed(0);
      setRtLoading(false);
    });
  }, []);

  /* first load + 60s auto-refresh */
  useEffect(() => {
    fetchRealtime();
    const interval = setInterval(fetchRealtime, 60000);
    return () => clearInterval(interval);
  }, [fetchRealtime]);

  /* elapsed counter (counts up every second) */
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  /* ═══════════════════════════════════════════════════
     Historical fetch (chatwoot_stats)
  ═══════════════════════════════════════════════════ */
  const fetchHist = useCallback(() => {
    setHistLoading(true);
    setHistError(null);
    const nodoIds = NODOS.find(n => n.value === filtroNodo)?.ids || [];
    let q = supabase
      .from("chatwoot_stats")
      .select("agent_name, conversation_count, resolved_count, open_count, pending_count, nodo")
      .gte("fecha", histDesde)
      .lte("fecha", histHasta);
    if (nodoIds.length > 0) q = q.in("nodo", nodoIds);
    q.then(({ data, error }) => {
      if (error) setHistError(error.message);
      else setHistStats(data || []);
      setHistLoading(false);
    });
  }, [histDesde, histHasta, filtroNodo]);

  useEffect(() => { fetchHist(); }, [fetchHist]);

  /* ═══════════════════════════════════════════════════
     Bot logs fetch (bot_pagos_log)
  ═══════════════════════════════════════════════════ */
  const fetchBot = useCallback(() => {
    setBotLoading(true);
    setBotError(null);
    const nodoIds = NODOS.find(n => n.value === filtroNodo)?.ids || [];
    let q = supabase
      .from("bot_pagos_log")
      .select("resultado, fecha, telefono, nodo, cliente, banco, beneficiario, motivo, conv_id")
      .gte("fecha", botDesde + "T00:00:00")
      .lte("fecha", botHasta + "T23:59:59");
    if (nodoIds.length > 0) q = q.in("nodo", nodoIds);
    if (filtroTel.trim().length >= 7) q = q.ilike("telefono", `%${filtroTel.trim()}%`);
    q.then(({ data, error }) => {
      if (error) setBotError(error.message);
      else setBotLogs(data || []);
      setBotLoading(false);
    });
  }, [botDesde, botHasta, filtroNodo, filtroTel]);

  useEffect(() => { fetchBot(); }, [fetchBot]);

  /* ═══════════════════════════════════════════════════
     Derived data
  ═══════════════════════════════════════════════════ */
  const visibleAgents = useMemo(
    () => agents.filter(a => a.name !== "Bot_agent"),
    [agents]
  );

  /* map agent name → open conv count (viene directo del campo _open_count) */
  const convsByAgent = useMemo(() => {
    const map = {};
    agents.forEach(a => { map[a.name] = a._open_count || 0; });
    return map;
  }, [agents]);

  const unassignedCount = unassignedRt;

  /* nodo activo label */
  const nodoLabel = filtroNodo === "todos" ? null : filtroNodo;
  const nodoIds   = NODOS.find(n => n.value === filtroNodo)?.ids || [];

  /* waiting convs filtradas por nodo si aplica */
  const waitingConvs = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return openConvs
      .filter(c => c.waiting_since != null && c.waiting_since > 0)
      .filter(c => nodoIds.length === 0 || nodoIds.includes(c.nodo))
      .map(c => ({ ...c, waitSec: now - c.waiting_since }))
      .sort((a, b) => b.waitSec - a.waitSec)
      .slice(0, 10);
  }, [openConvs, nodoIds]);

  /* historical: aggregate per agent */
  const histByAgent = useMemo(() => {
    const map = {};
    histStats.forEach(row => {
      const name = row.agent_name || "Sin agente";
      if (!map[name]) map[name] = { agent_name: name, conversation_count: 0, resolved_count: 0 };
      map[name].conversation_count += (row.conversation_count || 0);
      map[name].resolved_count     += (row.resolved_count     || 0);
    });
    return Object.values(map)
      .map(r => ({
        ...r,
        tasa: r.conversation_count > 0 ? Math.round((r.resolved_count / r.conversation_count) * 100) : 0,
      }))
      .sort((a, b) => b.resolved_count - a.resolved_count);
  }, [histStats]);

  /* bot counts */
  const botCounts = useMemo(() => {
    const counts = { SI: 0, NO: 0, NOTIFICAR: 0 };
    botLogs.forEach(r => {
      const k = String(r.resultado || "").trim().toUpperCase();
      if (k in counts) counts[k]++;
    });
    return counts;
  }, [botLogs]);

  const botChartData = [
    { name: "Aprobados (SI)",   value: botCounts.SI,       fill: "#16a34a" },
    { name: "Rechazados (NO)",  value: botCounts.NO,       fill: "#dc2626" },
    { name: "Notificar",        value: botCounts.NOTIFICAR, fill: "#d97706" },
  ];

  /* ─── Styles ─────────────────────────────── */
  const inputStyle = {
    border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px",
    fontSize: 13, color: "#374151",
  };

  const thStyle = {
    textAlign: "left", padding: "8px 12px", fontSize: 12,
    fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb",
    background: "#f9fafb",
  };
  const tdStyle = {
    padding: "8px 12px", fontSize: 13, color: "#1e293b",
    borderBottom: "1px solid #f1f5f9",
  };

  /* ─── Render ─────────────────────────────── */
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4px 0 40px" }}>

      {/* ── Filtros globales ─────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Nodo</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {NODOS.map(n => (
              <button
                key={n.value}
                onClick={() => setFiltroNodo(n.value)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "2px solid",
                  borderColor: filtroNodo === n.value ? "#6366f1" : "#e5e7eb",
                  background:  filtroNodo === n.value ? "#eef2ff" : "#f9fafb",
                  color:       filtroNodo === n.value ? "#4f46e5" : "#6b7280",
                }}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Teléfono (bot de pagos)</div>
          <input
            type="text"
            value={filtroTel}
            onChange={e => setFiltroTel(e.target.value)}
            placeholder="Ej: 956123456"
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, width: 180, color: "#111827" }}
          />
        </div>
      </div>

      {/* ── Auto-refresh indicator ────────────────────── */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {lastRefresh
            ? `Actualizado hace ${fmtElapsed(elapsed)}`
            : "Cargando…"}
        </span>
        <button
          onClick={fetchRealtime}
          disabled={rtLoading}
          style={{
            background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
            padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: rtLoading ? "default" : "pointer",
            opacity: rtLoading ? 0.6 : 1,
          }}
        >
          {rtLoading ? "Actualizando…" : "↺ Actualizar"}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 1 — Real-time agent status
      ══════════════════════════════════════════════════ */}
      <div style={cs}>
        <div style={sts}>Estado de Agentes en Tiempo Real</div>

        {rtError && (
          <div style={{ background: "#fef2f2", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
            Error: {rtError}
          </div>
        )}

        {rtLoading && !agents.length ? (
          <div style={{ color: "#94a3b8", fontSize: 13, padding: "20px 0" }}>Cargando agentes…</div>
        ) : (
          <>
            {/* Agent cards grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 14,
              marginBottom: 18,
            }}>
              {visibleAgents.map(agent => {
                const status = agent.availability_status || "offline";
                const dotColor = STATUS_DOT[status] || STATUS_DOT.offline;
                const convCount = convsByAgent[agent.name] || 0;
                return (
                  <div
                    key={agent.id}
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {/* Name + status dot */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: dotColor, flexShrink: 0,
                          boxShadow: `0 0 6px ${dotColor}99`,
                        }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", lineHeight: 1.3, wordBreak: "break-word" }}>
                        {agent.name}
                      </span>
                    </div>
                    {/* Status label */}
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500, textTransform: "capitalize" }}>
                      {status === "online" ? "En línea" : status === "busy" ? "Ocupado" : "Desconectado"}
                    </div>
                    {/* Conv count */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontSize: 24, fontWeight: 800, color: "#6366f1", lineHeight: 1 }}>
                        {convCount}
                      </span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>conv. abiertas</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Alert badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {unassignedCount > 0 && (
                <span style={badge("#fef2f2", "#dc2626")}>
                  ⚠ Sin asignar: {unassignedCount}
                </span>
              )}
              {unassignedCount === 0 && (
                <span style={badge("#f0fdf4", "#16a34a")}>
                  ✓ Sin asignar: 0
                </span>
              )}
              {pendingCount > 0 && (
                <span style={badge("#fffbeb", "#d97706")}>
                  ⏳ Pendientes: {pendingCount}
                </span>
              )}
              {pendingCount === 0 && (
                <span style={badge("#f0fdf4", "#16a34a")}>
                  ✓ Pendientes: 0
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 2 — Waiting conversations alert
      ══════════════════════════════════════════════════ */}
      <div style={cs}>
        <div style={sts}>Conversaciones en Espera</div>

        {rtLoading && !openConvs.length ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>Cargando…</div>
        ) : waitingConvs.length === 0 ? (
          <div style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>
            ✓ No hay conversaciones en espera actualmente
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>#Conv</th>
                  <th style={thStyle}>Asignado a</th>
                  <th style={thStyle}>Esperando desde</th>
                  <th style={thStyle}>Tiempo de espera</th>
                </tr>
              </thead>
              <tbody>
                {waitingConvs.map(c => {
                  const color  = waitColor(c.waitSec);
                  const bgColor = color === "#16a34a" ? "#f0fdf4"
                                : color === "#d97706" ? "#fffbeb"
                                : "#fef2f2";
                  return (
                    <tr key={c.id}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#6366f1" }}>
                        #{c.id}
                      </td>
                      <td style={tdStyle}>
                        {c.meta?.assignee?.name || <em style={{ color: "#9ca3af" }}>Sin asignar</em>}
                      </td>
                      <td style={{ ...tdStyle, color: "#64748b" }}>
                        {c.waiting_since
                          ? new Date(c.waiting_since * 1000).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td style={{ ...tdStyle }}>
                        <span style={{
                          background: bgColor, color, borderRadius: 6,
                          padding: "2px 10px", fontWeight: 700, fontSize: 12,
                        }}>
                          {fmtElapsed(c.waitSec)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
              Mostrando hasta 10 conversaciones. Verde &lt;5min · Amarillo 5-15min · Rojo &gt;15min
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 3 — Historical productivity
      ══════════════════════════════════════════════════ */}
      <div style={cs}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={sts}>Productividad Histórica por Agente</span>
            {filtroNodo !== "todos" && (
              <span style={{ padding: "2px 10px", borderRadius: 20, background: "#eef2ff", color: "#4f46e5", fontSize: 12, fontWeight: 700 }}>{filtroNodo}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Desde</label>
            <input
              type="date" value={histDesde} style={inputStyle}
              onChange={e => setHistDesde(e.target.value)}
            />
            <label style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Hasta</label>
            <input
              type="date" value={histHasta} style={inputStyle}
              onChange={e => setHistHasta(e.target.value)}
            />
          </div>
        </div>

        {histError && (
          <div style={{ background: "#fef2f2", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
            Error: {histError}
          </div>
        )}

        {histLoading ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>Cargando estadísticas…</div>
        ) : histByAgent.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>
            Sin datos para el rango seleccionado.
          </div>
        ) : (
          <>
            {/* Table */}
            <div style={{ overflowX: "auto", marginBottom: 24 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Agente</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Total atendidos</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Resueltos</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Tasa %</th>
                  </tr>
                </thead>
                <tbody>
                  {histByAgent.map(row => (
                    <tr key={row.agent_name}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{row.agent_name}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{row.conversation_count.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "#6366f1", fontWeight: 700 }}>
                        {row.resolved_count.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <span style={{
                          background: row.tasa >= 70 ? "#f0fdf4" : row.tasa >= 40 ? "#fffbeb" : "#fef2f2",
                          color:      row.tasa >= 70 ? "#16a34a" : row.tasa >= 40 ? "#d97706" : "#dc2626",
                          borderRadius: 6, padding: "2px 8px", fontWeight: 700,
                        }}>
                          {row.tasa}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bar chart */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>
              Conversaciones resueltas por agente
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={histByAgent} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="agent_name"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  angle={-30} textAnchor="end" interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Tooltip
                  formatter={(val, name) => [val, name === "resolved_count" ? "Resueltos" : "Atendidos"]}
                  labelStyle={{ fontSize: 12, fontWeight: 700 }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="resolved_count" name="Resueltos" radius={[4, 4, 0, 0]}>
                  {histByAgent.map((_, i) => (
                    <Cell key={i} fill={i % 2 === 0 ? "#6366f1" : "#818cf8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 4 — Bot vs Asesores (bot_pagos_log)
      ══════════════════════════════════════════════════ */}
      <div style={cs}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={sts}>Bot de Pagos</span>
            {filtroNodo !== "todos" && (
              <span style={{ padding: "2px 10px", borderRadius: 20, background: "#eef2ff", color: "#4f46e5", fontSize: 12, fontWeight: 700 }}>{filtroNodo}</span>
            )}
            {filtroTel.trim().length >= 7 && (
              <span style={{ padding: "2px 10px", borderRadius: 20, background: "#f0fdf4", color: "#166534", fontSize: 12, fontWeight: 700 }}>📱 {filtroTel.trim()}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Desde</label>
            <input
              type="date" value={botDesde} style={inputStyle}
              onChange={e => setBotDesde(e.target.value)}
            />
            <label style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Hasta</label>
            <input
              type="date" value={botHasta} style={inputStyle}
              onChange={e => setBotHasta(e.target.value)}
            />
          </div>
        </div>

        {botError && (
          <div style={{ background: "#fef2f2", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
            Error: {botError}
          </div>
        )}

        {botLoading ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>Cargando registros del bot…</div>
        ) : (
          <>
            {/* Metric cards — clickeables para ver detalle */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
              {[
                { key: "SI",        label: "Aprobados (SI)",    count: botCounts.SI,        bg: "#f0fdf4", color: "#16a34a", icon: "✓" },
                { key: "NO",        label: "Rechazados (NO)",   count: botCounts.NO,        bg: "#fef2f2", color: "#dc2626", icon: "✗" },
                { key: "NOTIFICAR", label: "Notificar",         count: botCounts.NOTIFICAR, bg: "#fffbeb", color: "#d97706", icon: "!" },
              ].map(m => (
                <div
                  key={m.label}
                  onClick={() => { setBotDetalle(prev => prev === m.key ? null : m.key); setBotRowsExp([]); }}
                  style={{
                    background: m.bg, border: `2px solid ${botDetalle === m.key ? m.color : m.color + "33"}`,
                    borderRadius: 10, padding: "16px 20px", cursor: "pointer",
                    boxShadow: botDetalle === m.key ? `0 0 0 3px ${m.color}22` : "none",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: m.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                    {m.icon} {m.label}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: m.color, lineHeight: 1 }}>
                    {m.count.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    {botLogs.length > 0 ? `${Math.round((m.count / botLogs.length) * 100)}% del total` : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: m.color, marginTop: 6, fontWeight: 600 }}>
                    {botDetalle === m.key ? "▲ Ocultar detalle" : "▼ Ver detalle"}
                  </div>
                </div>
              ))}
            </div>

            {/* Pie chart */}
            {botLogs.length > 0 && (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={botChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={true}
                  >
                    {botChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => [val, "Registros"]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}

            {botLogs.length === 0 && (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>
                Sin registros del bot para el rango seleccionado.
              </div>
            )}

            {/* Tabla de detalle al hacer clic en una tarjeta */}
            {botDetalle && (() => {
              const COLOR = { SI: "#16a34a", NO: "#dc2626", NOTIFICAR: "#d97706" };
              const BG    = { SI: "#f0fdf4", NO: "#fef2f2", NOTIFICAR: "#fffbeb" };
              const LABEL = { SI: "Aprobados", NO: "Rechazados", NOTIFICAR: "Notificar" };
              const color = COLOR[botDetalle];
              const rows  = botLogs.filter(r => r.resultado === botDetalle)
                                   .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
              return (
                <div style={{ marginTop: 20, border: `1px solid ${color}44`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ background: BG[botDetalle], padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color, fontSize: 14 }}>
                      {LABEL[botDetalle]} — {rows.length} registro{rows.length !== 1 ? "s" : ""}
                    </span>
                    <button onClick={() => { setBotDetalle(null); setBotRowsExp([]); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#6b7280", fontSize: 18, lineHeight: 1 }}>×</button>
                  </div>
                  {rows.length === 0 ? (
                    <div style={{ padding: 20, color: "#9ca3af", fontSize: 13 }}>Sin registros.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            {["Fecha", "Cliente", "Teléfono", "Nodo", "Banco", "Beneficiario", "Motivo"].map(h => (
                              <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const fecha = r.fecha ? new Date(r.fecha).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
                            const expandido = botRowsExp.includes(i);
                            const toggleRow = () => setBotRowsExp(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
                            return (
                              <>
                                <tr
                                  key={i}
                                  onClick={toggleRow}
                                  style={{ borderBottom: expandido ? "none" : "1px solid #f1f5f9", background: expandido ? BG[botDetalle] : i % 2 === 0 ? "#fff" : "#fafafa", cursor: "pointer" }}
                                >
                                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap", color: "#6b7280" }}>{fecha}</td>
                                  <td style={{ padding: "7px 10px", fontWeight: 600, color: "#111827", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cliente || "—"}</td>
                                  <td style={{ padding: "7px 10px", color: "#374151", whiteSpace: "nowrap" }}>{r.telefono || "—"}</td>
                                  <td style={{ padding: "7px 10px", color: "#374151" }}>{r.nodo || "—"}</td>
                                  <td style={{ padding: "7px 10px", color: "#374151", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.banco || "—"}</td>
                                  <td style={{ padding: "7px 10px", color: "#374151", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.beneficiario || "—"}</td>
                                  <td style={{ padding: "7px 10px", color: "#6b7280", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.motivo || "—"}</td>
                                </tr>
                                {expandido && (
                                  <tr key={i + "_exp"} style={{ background: BG[botDetalle], borderBottom: "1px solid #f1f5f9" }}>
                                    <td colSpan={7} style={{ padding: "10px 16px" }}>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: 12 }}>
                                        <div><span style={{ fontWeight: 600, color: "#374151" }}>Cliente: </span><span style={{ color: "#111827" }}>{r.cliente || "—"}</span></div>
                                        <div><span style={{ fontWeight: 600, color: "#374151" }}>Teléfono: </span><span style={{ color: "#111827" }}>{r.telefono || "—"}</span></div>
                                        <div><span style={{ fontWeight: 600, color: "#374151" }}>Banco: </span><span style={{ color: "#111827" }}>{r.banco || "—"}</span></div>
                                        <div><span style={{ fontWeight: 600, color: "#374151" }}>Beneficiario: </span><span style={{ color: "#111827" }}>{r.beneficiario || "—"}</span></div>
                                        <div style={{ gridColumn: "1 / -1" }}><span style={{ fontWeight: 600, color: "#374151" }}>Motivo: </span><span style={{ color: "#111827" }}>{r.motivo || "—"}</span></div>
                                        {r.conv_id && <div style={{ gridColumn: "1 / -1" }}><span style={{ fontWeight: 600, color: "#374151" }}>Conv ID: </span><span style={{ color: "#6b7280", fontFamily: "monospace" }}>{r.conv_id}</span></div>}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
