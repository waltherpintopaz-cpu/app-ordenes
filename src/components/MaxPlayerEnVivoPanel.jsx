import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Radio, RefreshCw, Search } from "lucide-react";
import { supabase } from "../supabaseClient";

const XTREAM_PROXY_URL = String(import.meta.env.VITE_XTREAM_PROXY_URL || "").trim().replace(/\/+$/, "");
const REFRESH_MS = 15000;
const PAGE_SIZE_OPCIONES = [10, 25, 50, 100, 250];

function formatearDuracion(seg) {
  if (seg == null) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

// Codigo de pais (ISO 3166-1 alpha-2) -> emoji bandera, sin llamar a servicios externos.
function banderaDesdeCodigo(codigo) {
  if (!codigo || codigo.length !== 2) return null;
  const base = 127397;
  return String.fromCodePoint(...codigo.toUpperCase().split("").map((c) => c.charCodeAt(0) + base));
}

// divergence: diferencia entre lo que deberia haberse leido del stream y lo
// realmente leido. Igual criterio que el panel nativo de Xtream.
function colorEstado(divergence) {
  if (divergence == null) return "#9ca3af";
  if (divergence <= 10) return "#16a34a";
  if (divergence <= 50) return "#f59e0b";
  return "#dc2626";
}

const COLUMNAS = [
  { key: "cliente", label: "Cliente" },
  { key: "dni", label: "DNI" },
  { key: "stream_name", label: "Canal" },
  { key: "server_name", label: "Servidor" },
  { key: "user_agent", label: "Dispositivo" },
  { key: "duration_seconds", label: "Tiempo" },
  { key: "user_ip", label: "IP" },
  { key: "country_code", label: "País" },
];

export default function MaxPlayerEnVivoPanel({ theme }) {
  const isDark = theme === "dark";
  const [online, setOnline] = useState([]);
  const [clientesMap, setClientesMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState({ columna: null, dir: "asc" });
  const [pageSize, setPageSize] = useState(25);
  const [pagina, setPagina] = useState(1);
  const timerRef = useRef(null);

  const cargarClientes = useCallback(async () => {
    const { data } = await supabase.from("iptv_clientes").select("dni,nombre,nodo,xtream_user_id");
    const mapa = {};
    (data || []).forEach((c) => {
      if (c.xtream_user_id) mapa[c.xtream_user_id] = c;
    });
    setClientesMap(mapa);
  }, []);

  const cargarOnline = useCallback(async () => {
    if (!XTREAM_PROXY_URL) {
      setError("Falta configurar VITE_XTREAM_PROXY_URL.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${XTREAM_PROXY_URL}/api/xtream/online-all`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Error ${res.status}`);
      setOnline(data.online || []);
      setUltimaActualizacion(new Date());
    } catch (e) {
      setError(e?.message || "No se pudo cargar las conexiones en vivo.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargarClientes();
    cargarOnline();
  }, [cargarClientes, cargarOnline]);

  useEffect(() => {
    if (!autoRefresh) return;
    timerRef.current = setInterval(cargarOnline, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, cargarOnline]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let resultado = online.map((o) => {
      const cliente = clientesMap[o.user_id];
      return { ...o, cliente_nombre: cliente?.nombre || o.username || "", cliente_dni: cliente?.dni || "", cliente_nodo: cliente?.nodo || "" };
    });

    if (q) {
      resultado = resultado.filter((o) =>
        o.cliente_nombre.toLowerCase().includes(q) ||
        o.cliente_dni.toLowerCase().includes(q) ||
        String(o.username || "").toLowerCase().includes(q) ||
        String(o.stream_name || "").toLowerCase().includes(q) ||
        String(o.user_ip || "").toLowerCase().includes(q) ||
        String(o.user_agent || "").toLowerCase().includes(q) ||
        String(o.server_name || "").toLowerCase().includes(q)
      );
    }

    if (orden.columna) {
      const factor = orden.dir === "asc" ? 1 : -1;
      const campo = orden.columna === "cliente" ? "cliente_nombre" : orden.columna === "dni" ? "cliente_dni" : orden.columna;
      resultado = [...resultado].sort((a, b) => {
        const va = a[campo]; const vb = b[campo];
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
        return String(va || "").localeCompare(String(vb || "")) * factor;
      });
    }
    return resultado;
  }, [online, clientesMap, busqueda, orden]);

  useEffect(() => { setPagina(1); }, [busqueda, pageSize, online.length]);

  const totalPaginas = Math.max(1, Math.ceil(filas.length / pageSize));
  const filasPagina = filas.slice((pagina - 1) * pageSize, pagina * pageSize);

  const ordenarPor = (columna) => {
    setOrden((prev) => prev.columna === columna
      ? { columna, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { columna, dir: "asc" });
  };

  const inputSt = { padding: "8px 12px", borderRadius: 8, border: isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb", fontSize: 13, background: isDark ? "#1a2740" : "#fff", color: isDark ? "#e6ecf7" : "#111827" };
  const thSt = { padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" };
  const tdSt = { padding: "10px 14px", verticalAlign: "middle", fontSize: 13 };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#16a34a", borderRadius: 10, padding: 8 }}><Radio size={22} color="#fff" /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: isDark ? "#e6ecf7" : undefined }}>Conectados en vivo</h2>
            <p style={{ margin: 0, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>
              {online.length} sesión{online.length !== 1 ? "es" : ""} activa{online.length !== 1 ? "s" : ""}
              {ultimaActualizacion && ` · actualizado ${ultimaActualizacion.toLocaleTimeString("es-PE")}`}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280", cursor: "pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-actualizar (15s)
          </label>
          <button onClick={cargarOnline} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: isDark ? "#93a2bd" : "#9ca3af" }} />
          <input
            style={{ ...inputSt, width: "100%", paddingLeft: 34, boxSizing: "border-box" }}
            placeholder="Buscar por cliente, DNI, canal, IP, dispositivo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <label style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>Mostrar</label>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={inputSt}>
          {PAGE_SIZE_OPCIONES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280", whiteSpace: "nowrap" }}>{filas.length} de {online.length}</span>
      </div>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflowX: "auto", overflowY: "hidden" }}>
        <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: isDark ? "#16213a" : "#f8fafc" }}>
              <th style={{ ...thSt, cursor: "default" }}>Estado</th>
              {COLUMNAS.map((col) => (
                <th key={col.key} style={thSt} onClick={() => ordenarPor(col.key)}>
                  {col.label} {orden.columna === col.key ? (orden.dir === "asc" ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filasPagina.length === 0 && (
              <tr><td colSpan={COLUMNAS.length + 1} style={{ textAlign: "center", padding: 32, color: isDark ? "#93a2bd" : "#9ca3af" }}>
                {loading ? "Cargando..." : "No hay conexiones activas en este momento."}
              </td></tr>
            )}
            {filasPagina.map((o) => {
              const bandera = banderaDesdeCodigo(o.country_code);
              return (
                <tr key={o.activity_id} style={{ borderTop: isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6" }}>
                  <td style={tdSt} title={`Divergencia: ${o.divergence}${o.divergence <= 10 ? " (buena)" : o.divergence <= 50 ? " (regular)" : " (mala)"}`}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: colorEstado(o.divergence), display: "inline-block" }} />
                  </td>
                  <td style={{ ...tdSt, color: isDark ? "#c3d3ee" : "#374151", fontWeight: 600 }}>
                    {o.cliente_nombre || "—"}
                    {o.cliente_nodo && <span style={{ display: "block", fontWeight: 400, fontSize: 11, color: isDark ? "#93a2bd" : "#9ca3af" }}>{o.cliente_nodo}</span>}
                  </td>
                  <td style={tdSt}><span style={{ fontFamily: "monospace" }}>{o.cliente_dni || "—"}</span></td>
                  <td style={tdSt}>{o.stream_name || `Canal ${o.stream_id}`}</td>
                  <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#6b7280" }}>{o.server_name}</td>
                  <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#6b7280", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.user_agent}>{o.user_agent}</td>
                  <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#6b7280", fontFamily: "monospace", fontSize: 12 }}>{formatearDuracion(o.duration_seconds)}</td>
                  <td style={{ ...tdSt, fontFamily: "monospace", fontSize: 12 }}>{o.user_ip}</td>
                  <td style={tdSt}>{bandera ? <span title={o.country_code}>{bandera} {o.country_code}</span> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 16 }}>
          <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1}
            style={{ ...inputSt, cursor: pagina === 1 ? "default" : "pointer", opacity: pagina === 1 ? 0.5 : 1 }}>‹</button>
          <span style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>Página {pagina} de {totalPaginas}</span>
          <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
            style={{ ...inputSt, cursor: pagina === totalPaginas ? "default" : "pointer", opacity: pagina === totalPaginas ? 0.5 : 1 }}>›</button>
        </div>
      )}
    </div>
  );
}
