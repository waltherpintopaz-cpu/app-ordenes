import { useEffect, useState, useCallback, useRef } from "react";
import { Radio, RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient";

const XTREAM_PROXY_URL = String(import.meta.env.VITE_XTREAM_PROXY_URL || "").trim().replace(/\/+$/, "");
const REFRESH_MS = 15000;

function formatearDuracion(seg) {
  if (seg == null) return "—";
  if (seg < 60) return `${seg}s`;
  if (seg < 3600) return `${Math.floor(seg / 60)}min`;
  return `${Math.floor(seg / 3600)}h ${Math.floor((seg % 3600) / 60)}min`;
}

export default function MaxPlayerEnVivoPanel({ theme }) {
  const isDark = theme === "dark";
  const [online, setOnline] = useState([]);
  const [clientesMap, setClientesMap] = useState({}); // xtream_user_id -> {nombre, dni, nodo}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
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

  const thSt = { padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" };
  const tdSt = { padding: "10px 14px", verticalAlign: "middle", fontSize: 13 };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#16a34a", borderRadius: 10, padding: 8 }}><Radio size={22} color="#fff" /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: isDark ? "#e6ecf7" : undefined }}>Conectados en vivo</h2>
            <p style={{ margin: 0, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>
              {online.length} sesión{online.length !== 1 ? "es" : ""} activa{online.length !== 1 ? "s" : ""} ahora mismo
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

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflowX: "auto", overflowY: "hidden" }}>
        <table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: isDark ? "#16213a" : "#f8fafc" }}>
              <th style={thSt}>Cliente</th>
              <th style={thSt}>DNI</th>
              <th style={thSt}>Nodo</th>
              <th style={thSt}>Canal</th>
              <th style={thSt}>IP</th>
              <th style={thSt}>Dispositivo</th>
              <th style={thSt}>Duración</th>
            </tr>
          </thead>
          <tbody>
            {online.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: isDark ? "#93a2bd" : "#9ca3af" }}>
                {loading ? "Cargando..." : "No hay conexiones activas en este momento."}
              </td></tr>
            )}
            {online.map((o, i) => {
              const cliente = clientesMap[o.user_id];
              return (
                <tr key={i} style={{ borderTop: isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6" }}>
                  <td style={{ ...tdSt, color: isDark ? "#c3d3ee" : "#374151", fontWeight: 600 }}>{cliente?.nombre || o.username || "—"}</td>
                  <td style={tdSt}><span style={{ fontFamily: "monospace" }}>{cliente?.dni || "—"}</span></td>
                  <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#6b7280" }}>{cliente?.nodo || "—"}</td>
                  <td style={tdSt}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#16a34a", fontWeight: 700 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
                      {o.stream_name || `Canal ${o.stream_id}`}
                    </span>
                  </td>
                  <td style={{ ...tdSt, fontFamily: "monospace", fontSize: 12 }}>{o.user_ip}</td>
                  <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#6b7280", fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.user_agent}>{o.user_agent}</td>
                  <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#6b7280", whiteSpace: "nowrap" }}>{formatearDuracion(o.duration_seconds)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
