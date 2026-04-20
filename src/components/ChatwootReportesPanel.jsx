import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ChatwootReportesPanel({ cardStyle, sectionTitleStyle }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const hoy = new Date().toISOString().split("T")[0];
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [fechaDesde, setFechaDesde] = useState(hace30);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [filtroInboxes, setFiltroInboxes] = useState([]);
  const [filtroAgentes, setFiltroAgentes] = useState([]);
  const [showInboxDD, setShowInboxDD] = useState(false);
  const [showAgenteDD, setShowAgenteDD] = useState(false);

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

  const toggleInbox = (v) => setFiltroInboxes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  const toggleAgente = (v) => setFiltroAgentes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const filtrados = useMemo(() => stats.filter((s) => {
    if (filtroInboxes.length > 0 && !filtroInboxes.includes(s.inbox_name)) return false;
    if (filtroAgentes.length > 0 && !filtroAgentes.includes(s.agent_name)) return false;
    return true;
  }), [stats, filtroInboxes, filtroAgentes]);

  const agrupado = useMemo(() => {
    const map = {};
    for (const row of filtrados) {
      const key = `${row.inbox_name}__${row.agent_name}`;
      if (!map[key]) {
        map[key] = { inbox_name: row.inbox_name, agent_name: row.agent_name, total: 0, resolved: 0, open: 0, pending: 0, snoozed: 0 };
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
    total: acc.total + r.total, resolved: acc.resolved + r.resolved,
    open: acc.open + r.open, pending: acc.pending + r.pending, snoozed: acc.snoozed + r.snoozed,
  }), { total: 0, resolved: 0, open: 0, pending: 0, snoozed: 0 }), [agrupado]);

  function generarPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Reporte Chatwoot", 14, 18);
    doc.setFontSize(10);
    doc.text(`Periodo: ${fechaDesde} al ${fechaHasta}`, 14, 26);
    if (filtroInboxes.length > 0) doc.text(`Canales: ${filtroInboxes.join(", ")}`, 14, 32);
    if (filtroAgentes.length > 0) doc.text(`Agentes: ${filtroAgentes.join(", ")}`, 14, 38);

    autoTable(doc, {
      startY: 44,
      head: [["Canal", "Agente", "Total", "Abiertas", "Resueltas", "Pendientes", "Pospuestas", "% Total"]],
      body: [
        ...agrupado.map(r => [
          r.inbox_name || "—", r.agent_name || "Sin asignar",
          r.total, r.open, r.resolved, r.pending, r.snoozed,
          totales.total > 0 ? ((r.total / totales.total) * 100).toFixed(1) + "%" : "—"
        ]),
        ["TOTAL", "", totales.total, totales.open, totales.resolved, totales.pending, totales.snoozed, "100%"]
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
      footStyles: { fillColor: [241, 245, 249], fontStyle: "bold" },
      didDrawRow: (data) => {
        if (data.row.index === agrupado.length - 1) data.row.cells[0].styles = { fontStyle: "bold" };
      }
    });

    doc.save(`reporte_chatwoot_${fechaDesde}_${fechaHasta}.pdf`);
  }

  const inputSt = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: 13, background: "#fff", color: "#1e293b", outline: "none" };
  const thSt = { padding: "11px 14px", textAlign: "right", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase" };
  const tdSt = { padding: "10px 14px", textAlign: "right", fontSize: 13 };

  const MultiSelect = ({ label, options, selected, onToggle, show, setShow }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
      <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</label>
      <div onClick={() => setShow(!show)} style={{ ...inputSt, minWidth: 160, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}>
        <span style={{ color: selected.length === 0 ? "#94a3b8" : "#1e293b" }}>
          {selected.length === 0 ? `Todos` : selected.length === 1 ? selected[0] : `${selected.length} seleccionados`}
        </span>
        <span style={{ fontSize: 10, color: "#64748b" }}>▼</span>
      </div>
      {show && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, minWidth: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
          <div onClick={() => { onToggle && setShow(false); selected.length > 0 && selected.forEach(() => {}); setShow(false); }}
            style={{ padding: "8px 14px", fontSize: 13, color: "#2563eb", cursor: "pointer", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }}
            onClick={() => { selected.forEach(v => onToggle(v)); selected.length > 0 ? selected.forEach(v => onToggle(v)) : null; setShow(false); }}>
          </div>
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

  return (
    <div style={{ padding: "24px 16px", maxWidth: 1100, margin: "0 auto" }} onClick={() => { setShowInboxDD(false); setShowAgenteDD(false); }}>

      {/* Filtros */}
      <div style={{ ...cardStyle, marginBottom: 16 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ ...sectionTitleStyle }}>Reportes Chatwoot</div>
          <button onClick={generarPDF} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            ⬇ Generar PDF
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Desde</label>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} style={inputSt} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Hasta</label>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} style={inputSt} />
          </div>
          <MultiSelect label="Canal" options={inboxes} selected={filtroInboxes} onToggle={toggleInbox} show={showInboxDD} setShow={setShowInboxDD} />
          <MultiSelect label="Agente" options={agentes} selected={filtroAgentes} onToggle={toggleAgente} show={showAgenteDD} setShow={setShowAgenteDD} />
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
                    <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>{row.inbox_name || "—"}</span>
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
