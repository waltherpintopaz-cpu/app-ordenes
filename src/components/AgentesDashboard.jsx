import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";

/* ─── Chatwoot config ─────────────────────────────── */
const CW_BASE  = "https://chat.americanet.club";
const CW_TOKEN = "Wm9K5UiCrfJPcgFJrWgxftYv";
const CW_ACCT  = 1;
const CW_HEADERS = { "api_access_token": CW_TOKEN, "Content-Type": "application/json" };

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

  /* ═══════════════════════════════════════════════════
     Real-time fetch (agents + open convs + pending)
  ═══════════════════════════════════════════════════ */
  const fetchRealtime = useCallback(() => {
    setRtLoading(true);
    setRtError(null);

    const agentsP = fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCT}/agents`, { headers: CW_HEADERS })
      .then(r => { if (!r.ok) throw new Error(`Agents ${r.status}`); return r.json(); });

    const openP = fetch(
      `${CW_BASE}/api/v1/accounts/${CW_ACCT}/conversations?status=open&page=1`,
      { headers: CW_HEADERS }
    ).then(r => { if (!r.ok) throw new Error(`Open ${r.status}`); return r.json(); });

    const pendingP = fetch(
      `${CW_BASE}/api/v1/accounts/${CW_ACCT}/conversations?status=pending&page=1`,
      { headers: CW_HEADERS }
    ).then(r => { if (!r.ok) throw new Error(`Pending ${r.status}`); return r.json(); });

    Promise.all([agentsP, openP, pendingP])
      .then(([agentsData, openData, pendingData]) => {
        setAgents(Array.isArray(agentsData) ? agentsData : []);
        const payload = openData?.data?.payload || [];
        setOpenConvs(Array.isArray(payload) ? payload : []);
        setPendingCount(pendingData?.data?.meta?.all_count ?? 0);
        setLastRefresh(new Date());
        setElapsed(0);
        setRtLoading(false);
      })
      .catch(err => {
        setRtError(err.message || "Error al cargar datos en tiempo real");
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
    supabase
      .from("chatwoot_stats")
      .select("agent_name, conversation_count, resolved_count, open_count, pending_count")
      .gte("fecha", histDesde)
      .lte("fecha", histHasta)
      .then(({ data, error }) => {
        if (error) setHistError(error.message);
        else setHistStats(data || []);
        setHistLoading(false);
      });
  }, [histDesde, histHasta]);

  useEffect(() => { fetchHist(); }, [fetchHist]);

  /* ═══════════════════════════════════════════════════
     Bot logs fetch (bot_pagos_log)
  ═══════════════════════════════════════════════════ */
  const fetchBot = useCallback(() => {
    setBotLoading(true);
    setBotError(null);
    supabase
      .from("bot_pagos_log")
      .select("resultado, fecha")
      .gte("fecha", botDesde + "T00:00:00")
      .lte("fecha", botHasta + "T23:59:59")
      .then(({ data, error }) => {
        if (error) setBotError(error.message);
        else setBotLogs(data || []);
        setBotLoading(false);
      });
  }, [botDesde, botHasta]);

  useEffect(() => { fetchBot(); }, [fetchBot]);

  /* ═══════════════════════════════════════════════════
     Derived data
  ═══════════════════════════════════════════════════ */
  const visibleAgents = useMemo(
    () => agents.filter(a => a.name !== "Bot_agent"),
    [agents]
  );

  /* map agent name → open conv count */
  const convsByAgent = useMemo(() => {
    const map = {};
    openConvs.forEach(c => {
      const name = c.meta?.assignee?.name;
      if (name) map[name] = (map[name] || 0) + 1;
    });
    return map;
  }, [openConvs]);

  /* unassigned open convs */
  const unassignedCount = useMemo(
    () => openConvs.filter(c => !c.meta?.assignee).length,
    [openConvs]
  );

  /* waiting convs (waiting_since set) sorted oldest first, top 10 */
  const waitingConvs = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return openConvs
      .filter(c => c.waiting_since != null && c.waiting_since > 0)
      .map(c => ({ ...c, waitSec: now - c.waiting_since }))
      .sort((a, b) => b.waitSec - a.waitSec)
      .slice(0, 10);
  }, [openConvs]);

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
          <div style={sts}>Productividad Histórica por Agente</div>
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
          <div style={sts}>Bot de Pagos — Resultados</div>
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
            {/* Metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Aprobados (SI)",    count: botCounts.SI,        bg: "#f0fdf4", color: "#16a34a", icon: "✓" },
                { label: "Rechazados (NO)",   count: botCounts.NO,        bg: "#fef2f2", color: "#dc2626", icon: "✗" },
                { label: "Notificar",         count: botCounts.NOTIFICAR, bg: "#fffbeb", color: "#d97706", icon: "!" },
              ].map(m => (
                <div key={m.label} style={{
                  background: m.bg, border: `1px solid ${m.color}33`,
                  borderRadius: 10, padding: "16px 20px",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: m.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                    {m.icon} {m.label}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: m.color, lineHeight: 1 }}>
                    {m.count.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    {botLogs.length > 0 ? `${Math.round((m.count / botLogs.length) * 100)}% del total` : "—"}
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
          </>
        )}
      </div>
    </div>
  );
}
