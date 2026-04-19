import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

export default function ChatwootReportesPanel({ cardStyle, sectionTitleStyle }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const hoy = new Date().toISOString().split("T")[0];
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [fechaDesde, setFechaDesde] = useState(hace30);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [filtroInbox, setFiltroInbox] = useState("todos");
  const [filtroAgente, setFiltroAgente] = useState("todos");

  useEffect(() => { fetchStats(); }, [fechaDesde, fechaHasta]);

  async function fetchStats() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("chatwoot_stats")
      .select("*")
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .order("fecha", { ascending: false });
    if (error) setError(error.message);
    else setStats(data || []);
    setLoading(false);
  }

  const inboxes = useMemo(() => [...new Set(stats.map((s) => s.inbox_name))].filter(Boolean).sort(), [stats]);
  const agentes = useMemo(() => [...new Set(stats.map((s) => s.agent_name))].filter(Boolean).sort(), [stats]);

  const filtrados = useMemo(() => stats.filter((s) => {
    if (filtroInbox !== "todos" && s.inbox_name !== filtroInbox) return false;
    if (filtroAgente !== "todos" && s.agent_name !== filtroAgente) return false;
    return true;
  }), [stats, filtroInbox, filtroAgente]);

  const agrupado = useMemo(() => {
    const map = {};
    for (const row of filtrados) {
      const key = `${row.inbox_name}__${row.agent_name}`;
      if (!map[key]) {
        map[key] = {
          inbox_name: row.inbox_name,
          agent_name: row.agent_name,
          total: 0, resolved: 0, open: 0, pending: 0, snoozed: 0,
        };
      }
      map[key].total    += row.conversation_count || 0;
      map[key].resolved += row.resolved_count || 0;
      map[key].open     += row.open_count || 0;
      map[key].pending  += row.pending_count || 0;
      map[key].snoozed  += row.snoozed_count || 0;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  const totales = useMemo(() => agrupado.reduce((acc, r) => ({
    total: acc.total + r.total,
    resolved: acc.resolved + r.resolved,
    open: acc.open + r.open,
    pending: acc.pending + r.pending,
    snoozed: acc.snoozed + r.snoozed,
  }), { total: 0, resolved: 0, open: 0, pending: 0, snoozed: 0 }), [agrupado]);

  const inputSt = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: 13, background: "#fff", color: "#1e293b", outline: "none" };
  const thSt = { padding: "11px 14px", textAlign: "right", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase" };
  const tdSt = { padding: "10px 14px", textAlign: "right", fontSize: 13 };

  const badge = (text, bg, color) => (
    <span style={{ background: bg, color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{text}</span>
  );

  return (
    <div style={{ padding: "24px 16px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Filtros */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ ...sectionTitleStyle, marginBottom: 14 }}>Reportes Chatwoot</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Desde</label>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} style={inputSt} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Hasta</label>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} style={inputSt} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Canal</label>
            <select value={filtroInbox} onChange={(e) => setFiltroInbox(e.target.value)} style={inputSt}>
              <option value="todos">Todos los canales</option>
              {inboxes.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Agente</label>
            <select value={filtroAgente} onChange={(e) => setFiltroAgente(e.target.value)} style={inputSt}>
              <option value="todos">Todos los agentes</option>
              {agentes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={fetchStats} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "TOTAL", value: totales.total, color: "#2563eb" },
          { label: "ABIERTAS", value: totales.open, color: "#0891b2" },
          { label: "RESUELTAS", value: totales.resolved, color: "#16a34a" },
          { label: "PENDIENTES", value: totales.pending, color: "#d97706" },
          { label: "POSPUESTAS", value: totales.snoozed, color: "#7c3aed" },
          { label: "CANALES", value: inboxes.length, color: "#0f172a" },
          { label: "AGENTES", value: agentes.length, color: "#0f172a" },
        ].map((k) => (
          <div key={k.label} style={{ ...cardStyle, flex: 1, minWidth: 100, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>Cargando...</div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: "center", color: "#dc2626" }}>{error}</div>
        ) : agrupado.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>Sin datos para el periodo seleccionado</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ ...thSt, textAlign: "left" }}>Canal</th>
                <th style={{ ...thSt, textAlign: "left" }}>Agente</th>
                <th style={thSt}>Total</th>
                <th style={thSt}>Abiertas</th>
                <th style={thSt}>Resueltas</th>
                <th style={thSt}>Pendientes</th>
                <th style={thSt}>Pospuestas</th>
                <th style={thSt}>% Total</th>
              </tr>
            </thead>
            <tbody>
              {agrupado.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                  <td style={{ padding: "10px 14px" }}>
                    {badge(row.inbox_name || "—", "#eff6ff", "#2563eb")}
                  </td>
                  <td style={{ padding: "10px 14px", color: "#334155", fontWeight: 500 }}>{row.agent_name || "Sin asignar"}</td>
                  <td style={{ ...tdSt, fontWeight: 700, color: "#1e293b" }}>{row.total}</td>
                  <td style={{ ...tdSt, color: "#0891b2" }}>{row.open}</td>
                  <td style={{ ...tdSt, color: "#16a34a" }}>{row.resolved}</td>
                  <td style={{ ...tdSt, color: "#d97706" }}>{row.pending}</td>
                  <td style={{ ...tdSt, color: "#7c3aed" }}>{row.snoozed}</td>
                  <td style={{ ...tdSt, color: "#64748b" }}>
                    {totales.total > 0 ? ((row.total / totales.total) * 100).toFixed(1) + "%" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0", fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: "11px 14px", color: "#1e293b" }}>Total</td>
                <td style={{ ...tdSt, color: "#2563eb", fontSize: 14 }}>{totales.total}</td>
                <td style={{ ...tdSt, color: "#0891b2" }}>{totales.open}</td>
                <td style={{ ...tdSt, color: "#16a34a" }}>{totales.resolved}</td>
                <td style={{ ...tdSt, color: "#d97706" }}>{totales.pending}</td>
                <td style={{ ...tdSt, color: "#7c3aed" }}>{totales.snoozed}</td>
                <td style={{ ...tdSt, color: "#64748b" }}>100%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
