import { useCallback, useEffect, useMemo, useState } from "react";

const HUAWEI_OLT_SNMP_API = String(import.meta.env.VITE_HUAWEI_OLT_SNMP_API || "https://huawei-olt-snmp.wolgest.com").trim().replace(/\/$/, "");

const ESTADO = {
  online:         { label: "Online",          dot: "#22c55e", text: "#15803d", bg: "#dcfce7" },
  power_fail:     { label: "Power Fail",      dot: "#f59e0b", text: "#92400e", bg: "#fef3c7" },
  los:            { label: "Sin señal (LOS)", dot: "#ef4444", text: "#991b1b", bg: "#fee2e2" },
  admin_disabled: { label: "Deshabilitado",   dot: "#6b7280", text: "#374151", bg: "#e5e7eb" },
};
const ESTADO_DESCONOCIDO = { label: "Desconocido", dot: "#d1d5db", text: "#6b7280", bg: "#f3f4f6" };

const PAGE_SIZE = 100;

export default function OnuInventarioPanel({ theme }) {
  const isDark = theme === "dark";
  const [onus, setOnus] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaInput, setBusquedaInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [generadoEn, setGeneradoEn] = useState(null);

  const cargar = useCallback(async ({ refresh = false } = {}) => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (estadoFiltro) params.set("estado", estadoFiltro);
      if (busqueda) params.set("q", busqueda);
      if (refresh) params.set("refresh", "1");
      const json = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-list?${params}`).then(r => r.json());
      if (json.cargando) {
        setError("");
        setOnus([]);
        setTotal(0);
        setGeneradoEn(null);
        return; // el useEffect de reintento se encarga de volver a preguntar
      }
      if (!json.ok) throw new Error(json.error || "Error consultando el listado de ONUs.");
      setOnus(Array.isArray(json.onus) ? json.onus : []);
      setTotal(Number(json.total) || 0);
      setGeneradoEn(json.generadoEn || null);
    } catch (e) {
      setError(String(e?.message || "Error consultando el servicio SNMP."));
      setOnus([]);
    } finally {
      setCargando(false);
    }
  }, [page, estadoFiltro, busqueda]);

  useEffect(() => { cargar(); }, [cargar]);

  // Primer recorrido en curso en el servidor (recien reiniciado el servicio):
  // reintenta solo cada 10s hasta que el cache este listo, sin que el
  // usuario tenga que refrescar la pagina a mano.
  useEffect(() => {
    if (total > 0 || cargando) return undefined;
    const id = setInterval(() => cargar(), 10000);
    return () => clearInterval(id);
  }, [total, cargando, cargar]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const conteoEstados = useMemo(() => {
    const c = { online: 0, power_fail: 0, los: 0, admin_disabled: 0 };
    for (const o of onus) if (c[o.estado] != null) c[o.estado]++;
    return c;
  }, [onus]);

  const fmtGenerado = generadoEn ? new Date(generadoEn).toLocaleString("es-PE") : "—";

  const s = {
    card: { border: isDark ? "1px solid #2c3c58" : "1px solid #dbe4ef", borderRadius: 14, background: isDark ? "#1a2740" : "#fff", padding: 16 },
    input: { border: isDark ? "1px solid #2c3c58" : "1px solid #cbd5e1", borderRadius: 10, padding: "9px 12px", background: isDark ? "#0d172a" : "#fff", color: isDark ? "#e6ecf7" : "#0f172a", fontSize: 13 },
    th: { padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: isDark ? "#93a2bd" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", background: isDark ? "#16213a" : "#fafafa", whiteSpace: "nowrap" },
    td: { padding: "9px 12px", fontSize: 13, color: isDark ? "#e6ecf7" : "#111827" },
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={s.card}>
        <h2 style={{ margin: 0, fontSize: 22, color: isDark ? "#7fa1d4" : "#183b62" }}>Central OLT — Inventario de ONUs</h2>
        <p style={{ margin: "6px 0 0", color: isDark ? "#93a2bd" : "#64748b", fontSize: 13 }}>
          Listado completo directo de la OLT Huawei (SNMP propio, sin SmartOLT) · {total} ONUs registradas · Generado {fmtGenerado}
        </p>
      </div>

      <div style={{ ...s.card, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { key: "", label: "Todos" },
            { key: "online", label: "Online" },
            { key: "power_fail", label: "Power Fail" },
            { key: "los", label: "LOS" },
            { key: "admin_disabled", label: "Deshabilitado" },
          ].map(t => (
            <button key={t.key} type="button" onClick={() => { setPage(1); setEstadoFiltro(t.key); }}
              style={{
                padding: "7px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: estadoFiltro === t.key ? "none" : (isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb"),
                background: estadoFiltro === t.key ? "#1d4ed8" : (isDark ? "#16213a" : "#f9fafb"),
                color: estadoFiltro === t.key ? "#fff" : (isDark ? "#c3d3ee" : "#374151"),
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <form onSubmit={e => { e.preventDefault(); setPage(1); setBusqueda(busquedaInput.trim()); }} style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
          <input value={busquedaInput} onChange={e => setBusquedaInput(e.target.value)} placeholder="Buscar SN, nombre o zona…" style={{ ...s.input, flex: 1 }} />
          <button type="submit" style={{ ...s.input, cursor: "pointer", fontWeight: 700, background: "#1d4ed8", color: "#fff", border: "none" }}>Buscar</button>
        </form>
        <button type="button" onClick={() => cargar({ refresh: true })} disabled={cargando}
          style={{ padding: "9px 14px", background: "#ea580c", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: cargando ? "wait" : "pointer" }}>
          {cargando ? "Actualizando…" : "↺ Forzar recorrido nuevo"}
        </button>
      </div>

      {error ? <div style={{ ...s.card, color: "#b91c1c", fontWeight: 600 }}>{error}</div> : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(conteoEstados).map(([k, v]) => (
          <div key={k} style={{ ...s.card, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flex: "1 1 140px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: ESTADO[k]?.dot }} />
            <span style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>{ESTADO[k]?.label}</span>
            <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 14, color: isDark ? "#e6ecf7" : "#111827" }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["", "Nombre", "Zona", "SN", "Puerto", "RX (dBm)", "TX (dBm)"].map((h, i) => (
                  <th key={i} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando && onus.length === 0 ? (
                <tr><td colSpan={7} style={{ ...s.td, textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#9ca3af" }}>Cargando…</td></tr>
              ) : total === 0 && !error ? (
                <tr><td colSpan={7} style={{ ...s.td, textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#9ca3af" }}>
                  Generando el primer inventario completo desde la OLT — puede tardar unos minutos. Se actualiza solo, no hace falta recargar la página.
                </td></tr>
              ) : onus.length === 0 ? (
                <tr><td colSpan={7} style={{ ...s.td, textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#9ca3af" }}>Sin resultados.</td></tr>
              ) : onus.map((o, i) => {
                const cfg = ESTADO[o.estado] || ESTADO_DESCONOCIDO;
                return (
                  <tr key={`${o.sn}-${i}`} style={{ borderTop: isDark ? "1px solid #24324c" : "1px solid #f3f4f6" }}>
                    <td style={{ ...s.td, width: 28 }}>
                      <span title={cfg.label} style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: cfg.dot }} />
                    </td>
                    <td style={s.td}>{o.nombre || <span style={{ color: isDark ? "#5b6b8a" : "#d1d5db" }}>—</span>}</td>
                    <td style={s.td}>{o.zona || "—"}</td>
                    <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12 }}>{o.sn}</td>
                    <td style={{ ...s.td, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>{o.composite}/{o.onuId}</td>
                    <td style={s.td}>{o.rxPower != null ? `${o.rxPower.toFixed(2)}` : "—"}</td>
                    <td style={s.td}>{o.txPower != null ? `${o.txPower.toFixed(2)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>
        <span>Página {page} de {totalPages} · {total} ONUs</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{ ...s.input, cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}>← Anterior</button>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{ ...s.input, cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}>Siguiente →</button>
        </div>
      </div>
    </div>
  );
}
