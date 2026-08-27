import { useEffect, useState, useCallback } from "react";
import { Film, RefreshCw, Users, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { normalizarEtiquetaNodo } from "../utils/nodos.js";

const XTREAM_PROXY_URL = String(import.meta.env.VITE_XTREAM_PROXY_URL || "").trim().replace(/\/+$/, "");
const RANGOS_DIAS = [7, 30, 90];
const TIER_RANK = { Free: 0, Standard: 1, Premium: 2 };
const TIER_COLOR = {
  Free: { bg: "#dcfce7", fg: "#166534" },
  Standard: { bg: "#dbeafe", fg: "#1e40af" },
  Premium: { bg: "#ede9fe", fg: "#7c3aed" },
  Otro: { bg: "#f3f4f6", fg: "#6b7280" },
};

function formatearDuracion(seg) {
  if (!seg) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function formatearFecha(iso) {
  if (!iso) return "—";
  const diffSeg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSeg < 3600) return `hace ${Math.max(1, Math.floor(diffSeg / 60))} min`;
  if (diffSeg < 86400) return `hace ${Math.floor(diffSeg / 3600)} h`;
  return `hace ${Math.floor(diffSeg / 86400)} d`;
}

function TierBadge({ tier }) {
  const c = TIER_COLOR[tier] || TIER_COLOR.Otro;
  return <span style={{ background: c.bg, color: c.fg, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>{tier}</span>;
}

export default function MaxPlayerCanalesPanel({ theme }) {
  const isDark = theme === "dark";
  const [dias, setDias] = useState(30);
  const [canales, setCanales] = useState([]);
  const [clientesMap, setClientesMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Modal de clientes por canal
  const [canalSel, setCanalSel] = useState(null);
  const [viewers, setViewers] = useState(null);
  const [cargandoViewers, setCargandoViewers] = useState(false);
  const [viewersError, setViewersError] = useState("");

  const cargarClientes = useCallback(async () => {
    const { data } = await supabase.from("iptv_clientes").select("dni,nombre,nodo,plan,es_demo,xtream_user_id");
    const mapa = {};
    (data || []).forEach((c) => { if (c.xtream_user_id) mapa[c.xtream_user_id] = c; });
    setClientesMap(mapa);
  }, []);

  const cargarCanales = useCallback(async () => {
    if (!XTREAM_PROXY_URL) { setError("Falta configurar VITE_XTREAM_PROXY_URL."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${XTREAM_PROXY_URL}/api/xtream/top-channels-global`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: dias, limit: 40 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Error ${res.status}`);
      setCanales(data.channels || []);
    } catch (e) {
      setError(e?.message || "No se pudo cargar el ranking de canales.");
    }
    setLoading(false);
  }, [dias]);

  useEffect(() => { cargarClientes(); }, [cargarClientes]);
  useEffect(() => { cargarCanales(); }, [cargarCanales]);

  const abrirViewers = async (canal) => {
    if (!XTREAM_PROXY_URL) return;
    setCanalSel(canal);
    setViewers(null);
    setViewersError("");
    setCargandoViewers(true);
    try {
      const res = await fetch(`${XTREAM_PROXY_URL}/api/xtream/channel-viewers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream_id: canal.stream_id, days: dias, limit: 100 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Error ${res.status}`);
      setViewers(data.viewers || []);
    } catch (e) {
      setViewersError(e?.message || "No se pudo cargar los clientes de este canal.");
    }
    setCargandoViewers(false);
  };

  const inputSt = { padding: "8px 12px", borderRadius: 8, border: isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb", fontSize: 13, background: isDark ? "#1a2740" : "#fff", color: isDark ? "#e6ecf7" : "#111827" };
  const thSt = { padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" };
  const tdSt = { padding: "8px 12px", verticalAlign: "middle", fontSize: 13 };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#7c3aed", borderRadius: 10, padding: 8 }}><Film size={22} color="#fff" /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: isDark ? "#e6ecf7" : undefined }}>Canales más vistos</h2>
            <p style={{ margin: 0, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>
              Ranking real (se descartan reconexiones menores a 1 minuto) — últimos {dias} días
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={inputSt}>
            {RANGOS_DIAS.map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
          </select>
          <button onClick={cargarCanales} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: isDark ? "#16213a" : "#f8fafc" }}>
              <th style={thSt}>#</th>
              <th style={thSt}>Canal</th>
              <th style={thSt}>Nivel</th>
              <th style={thSt}>Reproducciones</th>
              <th style={thSt}>Clientes</th>
              <th style={thSt}>Tiempo total</th>
              <th style={{ ...thSt, textAlign: "right" }}>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {canales.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: isDark ? "#93a2bd" : "#9ca3af" }}>
                {loading ? "Cargando..." : "Sin datos de reproducción en este período."}
              </td></tr>
            )}
            {canales.map((c, i) => (
              <tr key={c.stream_id} style={{ borderTop: isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6" }}>
                <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#9ca3af" }}>{i + 1}</td>
                <td style={{ ...tdSt, color: isDark ? "#e6ecf7" : "#111827", fontWeight: 600 }}>{c.stream_name || `Canal ${c.stream_id}`}</td>
                <td style={tdSt}><TierBadge tier={c.tier} /></td>
                <td style={tdSt}>{c.veces.toLocaleString("es-PE")}</td>
                <td style={tdSt}>{c.clientes_distintos}</td>
                <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#6b7280" }}>{formatearDuracion(c.total_seconds)}</td>
                <td style={{ ...tdSt, textAlign: "right" }}>
                  <button onClick={() => abrirViewers(c)} title="Ver clientes que lo ven"
                    style={{ background: "#ede9fe", color: "#7c3aed", border: "none", borderRadius: 8, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Users size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canalSel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}
          onClick={() => setCanalSel(null)}>
          <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, padding: 22, width: 620, maxWidth: "94vw", maxHeight: "82vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isDark ? "#e6ecf7" : "#111827" }}>{canalSel.stream_name}</h3>
              <button onClick={() => setCanalSel(null)} style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#93a2bd" : "#6b7280" }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <TierBadge tier={canalSel.tier} />
              <span style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>últimos {dias} días</span>
            </div>

            {cargandoViewers ? (
              <div style={{ textAlign: "center", padding: 30, color: isDark ? "#93a2bd" : "#6b7280", fontSize: 13 }}>Cargando...</div>
            ) : viewersError ? (
              <div style={{ fontSize: 13, color: "#dc2626" }}>{viewersError}</div>
            ) : !viewers || viewers.length === 0 ? (
              <div style={{ fontSize: 13, color: isDark ? "#93a2bd" : "#9ca3af" }}>Nadie vio este canal en el período elegido.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thSt, padding: "6px 8px" }}>Cliente</th>
                      <th style={{ ...thSt, padding: "6px 8px" }}>Plan</th>
                      <th style={{ ...thSt, padding: "6px 8px" }}>Veces</th>
                      <th style={{ ...thSt, padding: "6px 8px" }}>Tiempo</th>
                      <th style={{ ...thSt, padding: "6px 8px" }}>Última vez</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewers.map((v, i) => {
                      const cliente = clientesMap[v.user_id];
                      const clienteRank = cliente ? TIER_RANK[cliente.plan] : null;
                      const canalRank = TIER_RANK[canalSel.tier];
                      const alerta = cliente && !cliente.es_demo && canalRank != null && clienteRank != null && clienteRank < canalRank;
                      return (
                        <tr key={v.user_id} style={{ borderTop: i > 0 ? (isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6") : "none" }}>
                          <td style={{ padding: "7px 8px", fontSize: 12.5, color: isDark ? "#e6ecf7" : "#111827" }}>
                            {alerta && <span title="Plan contratado no incluye este canal — no es demo" style={{ marginRight: 5, cursor: "help" }}>⚠️</span>}
                            {cliente?.nombre || v.username || "—"}
                            {cliente?.nodo && <span style={{ display: "block", fontSize: 11, color: isDark ? "#93a2bd" : "#9ca3af" }}>{normalizarEtiquetaNodo(cliente.nodo)} · {cliente.dni}</span>}
                          </td>
                          <td style={{ padding: "7px 8px" }}>
                            {cliente?.es_demo ? <span style={{ background: "#ede9fe", color: "#7c3aed", borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>DEMO</span>
                              : cliente?.plan ? <TierBadge tier={cliente.plan} /> : <span style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#9ca3af" }}>—</span>}
                          </td>
                          <td style={{ padding: "7px 8px", fontSize: 12.5 }}>{v.veces}</td>
                          <td style={{ padding: "7px 8px", fontSize: 12.5, color: isDark ? "#93a2bd" : "#6b7280" }}>{formatearDuracion(v.total_seconds)}</td>
                          <td style={{ padding: "7px 8px", fontSize: 12.5, color: isDark ? "#93a2bd" : "#6b7280" }}>{formatearFecha(v.last_seen)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p style={{ fontSize: 11, color: isDark ? "#93a2bd" : "#9ca3af", marginTop: 10 }}>
                  ⚠️ = cliente activo (no demo) cuyo plan contratado no incluye este canal — candidato a subir de plan o limitar acceso.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
