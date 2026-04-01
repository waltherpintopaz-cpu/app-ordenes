import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const LOGS_PAGE_SIZE = 50;

const accionColor = (a) => {
  if (!a) return { bg: "#f1f5f9", c: "#475569" };
  if (a.includes("eliminar")) return { bg: "#fee2e2", c: "#dc2626" };
  if (a.includes("crear")) return { bg: "#dcfce7", c: "#16a34a" };
  if (a.includes("editar")) return { bg: "#fef3c7", c: "#d97706" };
  if (a.includes("login")) return { bg: "#eff6ff", c: "#2563eb" };
  if (a.includes("logout")) return { bg: "#f3f4f6", c: "#6b7280" };
  if (a.includes("liquidac")) return { bg: "#f0fdf4", c: "#15803d" };
  return { bg: "#f1f5f9", c: "#475569" };
};

export default function LogsPanel({ cardStyle, inputStyle, sectionTitleStyle }) {
  const [logsData, setLogsData] = useState([]);
  const [logsCargando, setLogsCargando] = useState(true);
  const [filtroAccion, setFiltroAccion] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroCriticidad, setFiltroCriticidad] = useState("");
  const [page, setPage] = useState(1);

  const cargarLogs = () => {
    setLogsCargando(true);
    supabase.from("logs").select("*").order("fecha", { ascending: false }).limit(1000)
      .then(({ data, error }) => {
        if (error) console.error("[LogsPanel] Error cargando logs:", error.message);
        setLogsData(data || []);
        setLogsCargando(false);
      });
  };

  useEffect(() => {
    cargarLogs();
    const channel = supabase
      .channel("logs-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "logs" }, (payload) => {
        setLogsData(prev => [payload.new, ...prev].slice(0, 1000));
        setPage(1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const logsFiltrados = logsData.filter(l =>
    (!filtroAccion || l.accion?.includes(filtroAccion)) &&
    (!filtroUsuario || (l.usuario || "").toLowerCase().includes(filtroUsuario.toLowerCase())) &&
    (!filtroCategoria || l.categoria === filtroCategoria) &&
    (!filtroCriticidad || l.criticidad === filtroCriticidad)
  );

  const totalPags = Math.max(1, Math.ceil(logsFiltrados.length / LOGS_PAGE_SIZE));
  const logsPag = logsFiltrados.slice((page - 1) * LOGS_PAGE_SIZE, page * LOGS_PAGE_SIZE);

  const exportarCSV = () => {
    const cols = ["fecha", "usuario", "rol", "empresa", "accion", "categoria", "criticidad", "tabla", "registro_id", "dispositivo", "detalle"];
    const rows = logsFiltrados.map(l => cols.map(c => {
      const v = c === "detalle" ? JSON.stringify(l[c] || {}) : (l[c] || "");
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(","));
    const csv = [cols.join(","), ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const limpiarLogs = async (dias, soloNormales) => {
    if (!window.confirm(`¿Eliminar logs ${soloNormales ? "normales " : ""}anteriores a ${dias} días?`)) return;
    let q = supabase.from("logs").delete().lt("fecha", new Date(Date.now() - dias * 86400000).toISOString());
    if (soloNormales) q = q.eq("criticidad", "normal");
    await q;
    setLogsData(prev => prev.filter(l => {
      const viejo = new Date(l.fecha) < new Date(Date.now() - dias * 86400000);
      return !(viejo && (soloNormales ? l.criticidad === "normal" : true));
    }));
  };

  const inp = { ...inputStyle, margin: 0 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ ...sectionTitleStyle, marginBottom: 4 }}>Logs del sistema</h2>
          <div style={{ fontSize: 12, color: "#64748b" }}>{logsFiltrados.length} registros</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={cargarLogs} style={{ padding: "7px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#15803d", cursor: "pointer" }}>↺ Recargar</button>
          <button onClick={exportarCSV} style={{ padding: "7px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#1d4ed8", cursor: "pointer" }}>⬇ Exportar CSV</button>
          <button onClick={() => limpiarLogs(60, true)} style={{ padding: "7px 14px", background: "#fef3c7", border: "1px solid #fde047", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#92400e", cursor: "pointer" }}>🧹 Limpiar normales &gt;60d</button>
          <button onClick={() => limpiarLogs(365, false)} style={{ padding: "7px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#dc2626", cursor: "pointer" }}>🗑 Limpiar todo &gt;1 año</button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ ...cardStyle, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={filtroUsuario} onChange={e => { setFiltroUsuario(e.target.value); setPage(1); }} placeholder="Filtrar por usuario..." style={{ ...inp, width: 180 }} />
        <select value={filtroCategoria} onChange={e => { setFiltroCategoria(e.target.value); setPage(1); }} style={{ ...inp, width: 150 }}>
          <option value="">Todas categorías</option>
          <option value="orden">Orden</option>
          <option value="liquidacion">Liquidación</option>
          <option value="cliente">Cliente</option>
          <option value="sesion">Sesión</option>
        </select>
        <select value={filtroAccion} onChange={e => { setFiltroAccion(e.target.value); setPage(1); }} style={{ ...inp, width: 190 }}>
          <option value="">Todas las acciones</option>
          <option value="crear_orden">Crear orden</option>
          <option value="editar_orden">Editar orden</option>
          <option value="eliminar_orden">Eliminar orden</option>
          <option value="crear_liquidacion">Crear liquidación</option>
          <option value="editar_liquidacion">Editar liquidación</option>
          <option value="eliminar_cliente">Eliminar cliente</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
        </select>
        <select value={filtroCriticidad} onChange={e => { setFiltroCriticidad(e.target.value); setPage(1); }} style={{ ...inp, width: 150 }}>
          <option value="">Toda criticidad</option>
          <option value="critica">🔴 Crítica</option>
          <option value="normal">🟢 Normal</option>
        </select>
        {(filtroUsuario || filtroCategoria || filtroAccion || filtroCriticidad) && (
          <button onClick={() => { setFiltroUsuario(""); setFiltroCategoria(""); setFiltroAccion(""); setFiltroCriticidad(""); setPage(1); }} style={{ padding: "7px 12px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>✕ Limpiar</button>
        )}
      </div>

      {/* Tabla */}
      {logsCargando ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "#94a3b8", padding: 40 }}>Cargando logs...</div>
      ) : (
        <div style={{ border: "1px solid #f1f5f9", borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Fecha", "Usuario", "Rol", "Empresa", "Acción", "Criticidad", "Detalle", "Dispositivo"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontWeight: 700, fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1.5px solid #f1f5f9" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logsPag.map(l => {
                const ac = accionColor(l.accion);
                const det = l.detalle || {};
                return (
                  <tr key={l.id} style={{ borderTop: "1px solid #f8fafc" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#fafbff"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}>
                    <td style={{ padding: "9px 12px", color: "#475569", whiteSpace: "nowrap" }}>
                      {new Date(l.fecha).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0f172a" }}>{l.usuario || "-"}</td>
                    <td style={{ padding: "9px 12px", color: "#64748b" }}>{l.rol || "-"}</td>
                    <td style={{ padding: "9px 12px", color: "#64748b" }}>{l.empresa || "-"}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: ac.bg, color: ac.c }}>{l.accion || "-"}</span>
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: l.criticidad === "critica" ? "#dc2626" : "#16a34a" }}>
                        {l.criticidad === "critica" ? "🔴 Crítica" : "🟢 Normal"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", color: "#475569", maxWidth: 260, fontSize: 11 }}>
                      {det.codigo && <span><b>Orden:</b> {det.codigo} </span>}
                      {det.cliente && <span><b>Cliente:</b> {det.cliente} </span>}
                      {det.nombre && <span><b>Nombre:</b> {det.nombre} </span>}
                      {det.tecnico && <span><b>Técnico:</b> {det.tecnico} </span>}
                      {det.resultado && <span><b>Resultado:</b> {det.resultado} </span>}
                      {det.motivo && <span><b>Motivo:</b> {det.motivo}</span>}
                      {det.empresa && <span><b>Empresa:</b> {det.empresa}</span>}
                    </td>
                    <td style={{ padding: "9px 12px", color: "#94a3b8" }}>{l.dispositivo || "web"}</td>
                  </tr>
                );
              })}
              {logsPag.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>Sin logs con los filtros actuales</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          {logsFiltrados.length === 0 ? 0 : (page - 1) * LOGS_PAGE_SIZE + 1}–{Math.min(page * LOGS_PAGE_SIZE, logsFiltrados.length)} de {logsFiltrados.length}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#475569" }}>← Ant.</button>
          <span style={{ fontSize: 12, color: "#64748b", padding: "0 8px", alignSelf: "center" }}>Pág. {page} / {totalPags}</span>
          <button onClick={() => setPage(p => Math.min(totalPags, p + 1))} disabled={page >= totalPags} style={{ padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Sig. →</button>
        </div>
      </div>
    </div>
  );
}
