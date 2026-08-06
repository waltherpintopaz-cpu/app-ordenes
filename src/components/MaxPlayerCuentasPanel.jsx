import { useEffect, useState, useCallback, useMemo } from "react";
import { Tv, Search, Trash2, RefreshCw, Copy } from "lucide-react";
import { supabase } from "../supabaseClient";

// Mismas credenciales que usa SidebarApp.jsx para crear/eliminar cuentas IPTV.
const MP_TOKEN  = "mNTO0Z5ynAIsPx7LWBzFX90N";
const MP_DOMAIN = "1777119384974866697";

const ESTADO_COLOR = {
  ACTIVO: { bg: "#dcfce7", fg: "#166534" },
  SUSPENDIDO: { bg: "#fef3c7", fg: "#92400e" },
  CORTADO: { bg: "#fee2e2", fg: "#991b1b" },
};

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(String(text || "")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button onClick={copy} title="Copiar"
      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: copied ? "#16a34a" : "#9ca3af", display: "inline-flex" }}>
      <Copy size={12} />
    </button>
  );
}

export default function MaxPlayerCuentasPanel({ theme }) {
  const isDark = theme === "dark";
  const [cuentas, setCuentas] = useState([]);
  const [clientesMap, setClientesMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [eliminandoDni, setEliminandoDni] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: iptv, error: errIptv } = await supabase
        .from("iptv_clientes")
        .select("dni,iptv_usuario,iptv_password,iptv_user_id,nodo,creado_por,created_at")
        .order("created_at", { ascending: false });
      if (errIptv) throw errIptv;

      const dnis = (iptv || []).map((r) => r.dni).filter(Boolean);
      const mapa = {};
      if (dnis.length > 0) {
        const { data: mkw } = await supabase
          .from("mikrowisp_clientes")
          .select("cedula,nombre,estado")
          .in("cedula", dnis);
        (mkw || []).forEach((c) => {
          // Si el mismo DNI aparece en mas de un nodo, se prioriza el que este ACTIVO.
          if (!mapa[c.cedula] || c.estado === "ACTIVO") mapa[c.cedula] = c;
        });
      }
      setClientesMap(mapa);
      setCuentas(iptv || []);
    } catch (e) {
      setError("Error cargando cuentas: " + (e?.message || String(e)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return cuentas
      .map((c) => ({ ...c, cliente: clientesMap[c.dni] || null }))
      .filter((c) => {
        if (filtroEstado === "sin_cliente" && c.cliente) return false;
        if (filtroEstado && filtroEstado !== "sin_cliente" && c.cliente?.estado !== filtroEstado) return false;
        if (!q) return true;
        return (
          String(c.dni || "").toLowerCase().includes(q) ||
          String(c.iptv_usuario || "").toLowerCase().includes(q) ||
          String(c.cliente?.nombre || "").toLowerCase().includes(q)
        );
      });
  }, [cuentas, clientesMap, busqueda, filtroEstado]);

  const stats = useMemo(() => {
    const total = cuentas.length;
    const inactivas = cuentas.filter((c) => {
      const cli = clientesMap[c.dni];
      return !cli || cli.estado === "SUSPENDIDO" || cli.estado === "CORTADO";
    }).length;
    return { total, inactivas };
  }, [cuentas, clientesMap]);

  const eliminarCuenta = async (row) => {
    const nombreRef = row.cliente?.nombre || row.iptv_usuario;
    if (!window.confirm(`¿Eliminar la cuenta MaxPlayer de "${nombreRef}" (usuario ${row.iptv_usuario})?\n\nEsto la borra de MaxPlayer y de nuestro sistema. No se puede deshacer.`)) return;
    setEliminandoDni(row.dni);
    try {
      if (row.iptv_user_id) {
        const res = await fetch(`https://api.maxplayer.tv/v3/api/public/users/${row.iptv_user_id}`, {
          method: "DELETE",
          headers: { "Api-Token": MP_TOKEN },
        });
        // Si MaxPlayer ya no la tenia (404) igual seguimos y la limpiamos de nuestro lado.
        if (!res.ok && res.status !== 404) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.message || data?.error || `Error ${res.status} en MaxPlayer`);
        }
      }
      await supabase.from("iptv_clientes").delete().eq("dni", row.dni);
      setCuentas((prev) => prev.filter((c) => c.dni !== row.dni));
      showToast(`✅ Cuenta de ${nombreRef} eliminada`);
    } catch (e) {
      showToast("❌ Error: " + (e?.message || String(e)));
    }
    setEliminandoDni("");
  };

  const inputSt = { padding: "8px 12px", borderRadius: 8, border: isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb", fontSize: 13, background: isDark ? "#1a2740" : "#fff", color: isDark ? "#e6ecf7" : "#111827" };
  const thSt = { padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" };
  const tdSt = { padding: "10px 14px", verticalAlign: "middle", fontSize: 13 };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>
      {toast && (
        <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", borderRadius: 30, padding: "10px 24px", fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#2563eb", borderRadius: 10, padding: 8 }}><Tv size={22} color="#fff" /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: isDark ? "#e6ecf7" : undefined }}>Cuentas MaxPlayer</h2>
            <p style={{ margin: 0, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>
              {stats.total} cuenta{stats.total !== 1 ? "s" : ""} creadas · {stats.inactivas} de cliente{stats.inactivas !== 1 ? "s" : ""} inactivo{stats.inactivas !== 1 ? "s" : ""} o no encontrado
            </p>
          </div>
        </div>
        <button onClick={cargar} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: isDark ? "#93a2bd" : "#9ca3af" }} />
          <input
            style={{ ...inputSt, width: "100%", paddingLeft: 34, boxSizing: "border-box" }}
            placeholder="Buscar por DNI, usuario o nombre del cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={inputSt}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Cliente activo</option>
          <option value="SUSPENDIDO">Cliente suspendido</option>
          <option value="CORTADO">Cliente cortado</option>
          <option value="sin_cliente">Sin cliente encontrado</option>
        </select>
        <span style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280", whiteSpace: "nowrap" }}>{filas.length} de {cuentas.length}</span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#6b7280" }}>Cargando...</div>
      ) : (
        <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: isDark ? "#16213a" : "#f8fafc" }}>
                <th style={thSt}>Usuario MaxPlayer</th>
                <th style={thSt}>DNI</th>
                <th style={thSt}>Cliente</th>
                <th style={thSt}>Estado</th>
                <th style={thSt}>Nodo</th>
                <th style={thSt}>Creado</th>
                <th style={{ ...thSt, textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: isDark ? "#93a2bd" : "#9ca3af" }}>
                  {busqueda || filtroEstado ? "Sin resultados." : "Sin cuentas registradas."}
                </td></tr>
              )}
              {filas.map((c) => {
                const estado = c.cliente?.estado || null;
                const colores = estado ? ESTADO_COLOR[estado] : { bg: "#f3f4f6", fg: "#6b7280" };
                return (
                  <tr key={c.dni} style={{ borderTop: isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6" }}>
                    <td style={tdSt}>
                      <span style={{ fontFamily: "monospace" }}>{c.iptv_usuario}</span>
                      <CopyBtn text={c.iptv_usuario} />
                    </td>
                    <td style={tdSt}>
                      <span style={{ fontFamily: "monospace" }}>{c.dni}</span>
                      <CopyBtn text={c.dni} />
                    </td>
                    <td style={{ ...tdSt, color: isDark ? "#c3d3ee" : "#374151" }}>{c.cliente?.nombre || "—"}</td>
                    <td style={tdSt}>
                      <span style={{ background: colores.bg, color: colores.fg, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                        {estado || "No encontrado"}
                      </span>
                    </td>
                    <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#6b7280" }}>{c.nodo || "—"}</td>
                    <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#9ca3af", fontSize: 12 }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString("es-PE") : "—"}
                    </td>
                    <td style={{ ...tdSt, textAlign: "right" }}>
                      <button
                        onClick={() => eliminarCuenta(c)}
                        disabled={eliminandoDni === c.dni}
                        style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 600, cursor: eliminandoDni === c.dni ? "default" : "pointer", fontSize: 12, opacity: eliminandoDni === c.dni ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 5 }}
                      >
                        <Trash2 size={13} /> {eliminandoDni === c.dni ? "Eliminando..." : "Eliminar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
