import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../supabaseClient";

const OLT_SSH_API = String(import.meta.env.VITE_OLT_SSH_API || "https://amnet-olt-signal.0lthka.easypanel.host").trim().replace(/\/$/, "");

function nivelSenal(rx) {
  if (rx == null || isNaN(rx)) return "sin_datos";
  if (rx >= -22) return "normal";
  if (rx >= -25) return "alerta";
  return "critico";
}

const NIVEL_CONFIG = {
  normal:    { label: "Normal",     color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", emoji: "🟢" },
  alerta:    { label: "Alerta",     color: "#d97706", bg: "#fffbeb", border: "#fde68a", emoji: "🟡" },
  critico:   { label: "Crítico",    color: "#dc2626", bg: "#fef2f2", border: "#fecaca", emoji: "🔴" },
  sin_datos: { label: "Sin datos",  color: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0", emoji: "⚪" },
};

function BarraSenal({ rx }) {
  const nivel = nivelSenal(rx);
  const cfg = NIVEL_CONFIG[nivel];
  const val = rx != null && !isNaN(rx) ? rx : null;
  // Mapear -30 dBm → 0%, -15 dBm → 100%
  const pct = val != null ? Math.max(0, Math.min(100, ((val + 30) / 15) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 80, height: 10, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: cfg.color, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, minWidth: 52 }}>
        {val != null ? `${val} dBm` : "—"}
      </span>
    </div>
  );
}

function TarjetaResumen({ emoji, label, count, color, bg, border, onClick, activo }) {
  return (
    <div onClick={onClick} style={{
      flex: 1, minWidth: 140, padding: "18px 20px", borderRadius: 16, background: activo ? bg : "#fff",
      border: `2px solid ${activo ? color : border}`, cursor: "pointer", transition: "all 0.2s",
      boxShadow: activo ? `0 4px 16px ${color}33` : "0 1px 4px #0001",
      display: "flex", flexDirection: "column", gap: 6, alignItems: "center",
    }}>
      <span style={{ fontSize: 32 }}>{emoji}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color }}>{count}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", textAlign: "center" }}>{label}</span>
    </div>
  );
}

export default function MonitorSeñalesPanel({ onCrearOrden }) {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState("todos");
  const [refreshing, setRefreshing] = useState({});
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [sortDir, setSortDir]   = useState("asc");

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, nodo, sn_onu, rx_signal, tx_signal, signal_updated_at, vlan")
      .not("sn_onu", "is", null)
      .neq("sn_onu", "")
      .order("rx_signal", { ascending: true, nullsFirst: false })
      .limit(2000);
    setClientes(data || []);
    setUltimaActualizacion(new Date().toLocaleTimeString());
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
    const ch = supabase.channel("monitor_senales")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clientes" }, (payload) => {
        const n = payload.new;
        setClientes(prev => prev.map(c => c.id === n.id ? { ...c, rx_signal: n.rx_signal, tx_signal: n.tx_signal, signal_updated_at: n.signal_updated_at } : c));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar]);

  const refrescarSenal = async (cli) => {
    const sn = String(cli.sn_onu || "").trim();
    if (!sn) return;
    setRefreshing(p => ({ ...p, [cli.id]: true }));
    try {
      const params = new URLSearchParams({ sn });
      if (cli.vlan) params.set("vlan", String(cli.vlan));
      const res  = await fetch(`${OLT_SSH_API}/signal?${params}`);
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        const now = new Date().toISOString();
        await supabase.from("clientes").update({ rx_signal: json.rxPower, tx_signal: json.txPower, signal_updated_at: now }).eq("id", cli.id);
        setClientes(prev => prev.map(c => c.id === cli.id ? { ...c, rx_signal: json.rxPower, tx_signal: json.txPower, signal_updated_at: now } : c));
      }
    } catch (_) {}
    setRefreshing(p => ({ ...p, [cli.id]: false }));
  };

  const stats = useMemo(() => {
    const s = { critico: 0, alerta: 0, normal: 0, sin_datos: 0 };
    for (const c of clientes) s[nivelSenal(parseFloat(c.rx_signal))]++;
    return s;
  }, [clientes]);

  const lista = useMemo(() => {
    let arr = clientes.filter(c => {
      if (filtro !== "todos" && nivelSenal(parseFloat(c.rx_signal)) !== filtro) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return String(c.nombre || "").toLowerCase().includes(b) || String(c.sn_onu || "").toLowerCase().includes(b) || String(c.nodo || "").toLowerCase().includes(b);
      }
      return true;
    });
    arr = arr.sort((a, b) => {
      const na = parseFloat(a.rx_signal ?? "NaN");
      const nb = parseFloat(b.rx_signal ?? "NaN");
      const av = isNaN(na) ? Infinity : na;
      const bv = isNaN(nb) ? Infinity : nb;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [clientes, filtro, busqueda, sortDir]);

  // Top 10 peores para gráfico
  const top10 = useMemo(() => {
    return clientes
      .filter(c => parseFloat(c.rx_signal) != null && !isNaN(parseFloat(c.rx_signal)))
      .sort((a, b) => parseFloat(a.rx_signal) - parseFloat(b.rx_signal))
      .slice(0, 10);
  }, [clientes]);

  const formatTime = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("es-PE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
    } catch { return "—"; }
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Monitor de Señales OLT</h2>
          {ultimaActualizacion && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>Actualizado: {ultimaActualizacion}</p>}
        </div>
        <button onClick={cargar} disabled={loading} style={{ padding: "10px 20px", background: "#1e40af", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "⏳ Cargando..." : "↺ Actualizar"}
        </button>
      </div>

      {/* Tarjetas resumen */}
      <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
        {[
          { key: "todos",    emoji: "📡", label: "Total con señal", count: clientes.length, color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
          { key: "critico",  ...NIVEL_CONFIG.critico,  count: stats.critico  },
          { key: "alerta",   ...NIVEL_CONFIG.alerta,   count: stats.alerta   },
          { key: "normal",   ...NIVEL_CONFIG.normal,   count: stats.normal   },
          { key: "sin_datos",...NIVEL_CONFIG.sin_datos, count: stats.sin_datos },
        ].map(t => (
          <TarjetaResumen key={t.key} {...t} activo={filtro === t.key} onClick={() => setFiltro(t.key === filtro ? "todos" : t.key)} />
        ))}
      </div>

      {/* Gráfico top 10 peores */}
      {top10.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 4px #0001" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Top 10 peores señales</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {top10.map(c => {
              const rx = parseFloat(c.rx_signal);
              const nivel = nivelSenal(rx);
              const cfg = NIVEL_CONFIG[nivel];
              const pct = Math.max(0, Math.min(100, ((rx + 30) / 15) * 100));
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, color: "#64748b", width: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.nombre}>{c.nombre || c.sn_onu}</span>
                  <div style={{ flex: 1, height: 14, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: cfg.color, borderRadius: 99, transition: "width 0.5s" }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, width: 58, textAlign: "right" }}>{rx} dBm</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Buscador + orden */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar cliente, SN o nodo…"
          style={{ flex: 1, minWidth: 200, padding: "9px 14px", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, outline: "none" }}
        />
        <button onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
          style={{ padding: "9px 16px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#374151" }}>
          Señal {sortDir === "asc" ? "▲ peor primero" : "▼ mejor primero"}
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px #0001" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Cargando señales…</div>
        ) : lista.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>No hay clientes con señal registrada.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Estado", "Cliente", "Nodo", "SN ONU", "Señal RX", "TX", "Última consulta", ""].map(h => (
                  <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((c, i) => {
                const rx = parseFloat(c.rx_signal);
                const nivel = nivelSenal(isNaN(rx) ? null : rx);
                const cfg = NIVEL_CONFIG[nivel];
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa", transition: "background 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = cfg.bg}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa"}>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                        {cfg.emoji} {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#1e293b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.nombre}>{c.nombre || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{c.nodo || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{c.sn_onu}</td>
                    <td style={{ padding: "10px 14px" }}><BarraSenal rx={isNaN(rx) ? null : rx} /></td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{c.tx_signal != null ? `${c.tx_signal} dBm` : "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#94a3b8" }}>{formatTime(c.signal_updated_at)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        <button onClick={() => refrescarSenal(c)} disabled={!!refreshing[c.id]} title="Consultar señal ahora"
                          style={{ padding: "5px 10px", background: refreshing[c.id] ? "#f1f5f9" : "#eff6ff", border: `1px solid ${refreshing[c.id] ? "#e2e8f0" : "#bfdbfe"}`, borderRadius: 8, fontSize: 12, cursor: refreshing[c.id] ? "wait" : "pointer", color: "#1e40af" }}>
                          {refreshing[c.id] ? "⏳" : "↺"}
                        </button>
                        {onCrearOrden && (
                          <button onClick={() => onCrearOrden(c)} title="Crear orden de visita"
                            style={{ padding: "5px 10px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#c2410c", fontWeight: 700 }}>
                            + Orden
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ marginTop: 10, fontSize: 11, color: "#cbd5e1", textAlign: "right" }}>{lista.length} clientes mostrados</p>
    </div>
  );
}
