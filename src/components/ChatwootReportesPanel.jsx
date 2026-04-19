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

  useEffect(() => {
    fetchStats();
  }, [fechaDesde, fechaHasta]);

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

  const inboxes = useMemo(() => [...new Set(stats.map((s) => s.inbox_name))].filter(Boolean), [stats]);
  const agentes = useMemo(() => [...new Set(stats.map((s) => s.agent_name))].filter(Boolean), [stats]);

  const filtrados = useMemo(() => {
    return stats.filter((s) => {
      if (filtroInbox !== "todos" && s.inbox_name !== filtroInbox) return false;
      if (filtroAgente !== "todos" && s.agent_name !== filtroAgente) return false;
      return true;
    });
  }, [stats, filtroInbox, filtroAgente]);

  const agrupado = useMemo(() => {
    const map = {};
    for (const row of filtrados) {
      const key = `${row.inbox_name}__${row.agent_name}`;
      if (!map[key]) {
        map[key] = { inbox_name: row.inbox_name, agent_name: row.agent_name, total: 0 };
      }
      map[key].total += row.conversation_count || 0;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  const totalGeneral = agrupado.reduce((acc, r) => acc + r.total, 0);

  const inputSt = {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 13,
    background: "#fff",
    color: "#1e293b",
    outline: "none",
  };

  return (
    <div style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ ...sectionTitleStyle, marginBottom: 16 }}>Reportes Chatwoot</div>

        {/* Filtros */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
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
            <button
              onClick={fetchStats}
              style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* Tarjeta total */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ ...cardStyle, flex: 1, textAlign: "center", padding: "16px 12px" }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 6 }}>TOTAL CONVERSACIONES</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#2563eb" }}>{totalGeneral}</div>
        </div>
        <div style={{ ...cardStyle, flex: 1, textAlign: "center", padding: "16px 12px" }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 6 }}>CANALES</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a" }}>{inboxes.length}</div>
        </div>
        <div style={{ ...cardStyle, flex: 1, textAlign: "center", padding: "16px 12px" }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 6 }}>AGENTES</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a" }}>{agentes.length}</div>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontSize: 14 }}>Cargando...</div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: "center", color: "#dc2626", fontSize: 14 }}>{error}</div>
        ) : agrupado.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontSize: 14 }}>Sin datos para el periodo seleccionado</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase" }}>Canal</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase" }}>Agente</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase" }}>Conversaciones</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase" }}>% del total</th>
              </tr>
            </thead>
            <tbody>
              {agrupado.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                  <td style={{ padding: "11px 16px", color: "#1e293b", fontWeight: 500 }}>
                    <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>{row.inbox_name || "—"}</span>
                  </td>
                  <td style={{ padding: "11px 16px", color: "#334155" }}>{row.agent_name || "Sin asignar"}</td>
                  <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, color: "#1e293b" }}>{row.total}</td>
                  <td style={{ padding: "11px 16px", textAlign: "right", color: "#64748b" }}>
                    {totalGeneral > 0 ? ((row.total / totalGeneral) * 100).toFixed(1) + "%" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0" }}>
                <td colSpan={2} style={{ padding: "11px 16px", fontWeight: 700, color: "#1e293b", fontSize: 13 }}>Total</td>
                <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, color: "#2563eb", fontSize: 14 }}>{totalGeneral}</td>
                <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, color: "#64748b" }}>100%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
