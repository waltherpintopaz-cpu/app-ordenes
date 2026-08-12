import { useEffect, useState, useCallback, useMemo } from "react";
import { BarChart2, RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient";
import { normalizarEtiquetaNodo } from "../utils/nodos.js";

export default function MaxPlayerReportesPanel({ theme }) {
  const isDark = theme === "dark";
  const [cuentas, setCuentas] = useState([]);
  const [clientesMap, setClientesMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: iptv, error: errIptv } = await supabase
        .from("iptv_clientes")
        .select("dni,nodo,plan,es_demo,xtream_user_id");
      if (errIptv) throw errIptv;

      const dnis = (iptv || []).map((r) => r.dni).filter(Boolean);
      const mapa = {};
      if (dnis.length > 0) {
        const { data: mkw } = await supabase
          .from("mikrowisp_clientes")
          .select("cedula,estado")
          .in("cedula", dnis);
        (mkw || []).forEach((c) => {
          if (!mapa[c.cedula] || c.estado === "ACTIVO") mapa[c.cedula] = c;
        });
      }
      setClientesMap(mapa);
      setCuentas(iptv || []);
    } catch (e) {
      setError("Error cargando datos: " + (e?.message || String(e)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filas = useMemo(() => {
    const mapa = {};
    for (const c of cuentas) {
      const nodo = normalizarEtiquetaNodo(c.nodo) || "Sin nodo";
      if (!mapa[nodo]) {
        mapa[nodo] = { nodo, total: 0, activos: 0, Free: 0, Standard: 0, Premium: 0, propia: 0, compartida: 0, demos: 0 };
      }
      const row = mapa[nodo];
      row.total += 1;
      if (clientesMap[c.dni]?.estado === "ACTIVO") row.activos += 1;
      const plan = c.plan || "Premium";
      if (row[plan] !== undefined) row[plan] += 1;
      if (c.xtream_user_id) row.propia += 1; else row.compartida += 1;
      if (c.es_demo) row.demos += 1;
    }
    return Object.values(mapa).sort((a, b) => b.total - a.total);
  }, [cuentas, clientesMap]);

  const totales = useMemo(() => filas.reduce((acc, r) => ({
    total: acc.total + r.total,
    activos: acc.activos + r.activos,
    Free: acc.Free + r.Free,
    Standard: acc.Standard + r.Standard,
    Premium: acc.Premium + r.Premium,
    propia: acc.propia + r.propia,
    compartida: acc.compartida + r.compartida,
    demos: acc.demos + r.demos,
  }), { total: 0, activos: 0, Free: 0, Standard: 0, Premium: 0, propia: 0, compartida: 0, demos: 0 }), [filas]);

  const thSt = { padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" };
  const tdSt = { padding: "10px 14px", verticalAlign: "middle", fontSize: 13, whiteSpace: "nowrap" };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#2563eb", borderRadius: 10, padding: 8 }}><BarChart2 size={22} color="#fff" /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: isDark ? "#e6ecf7" : undefined }}>Reportes MaxPlayer</h2>
            <p style={{ margin: 0, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>Resumen de cuentas por nodo</p>
          </div>
        </div>
        <button onClick={cargar} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#6b7280" }}>Cargando...</div>
      ) : (
        <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflowX: "auto", overflowY: "hidden" }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: isDark ? "#16213a" : "#f8fafc" }}>
                <th style={thSt}>Nodo</th>
                <th style={thSt}>Total</th>
                <th style={thSt}>Activos</th>
                <th style={thSt}>Free</th>
                <th style={thSt}>Standard</th>
                <th style={thSt}>Premium</th>
                <th style={thSt}>Línea propia</th>
                <th style={thSt}>Compartida</th>
                <th style={thSt}>Demos</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: isDark ? "#93a2bd" : "#9ca3af" }}>Sin cuentas registradas.</td></tr>
              )}
              {filas.map((r) => (
                <tr key={r.nodo} style={{ borderTop: isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6" }}>
                  <td style={{ ...tdSt, fontWeight: 700, color: isDark ? "#e6ecf7" : "#111827" }}>{r.nodo}</td>
                  <td style={tdSt}>{r.total}</td>
                  <td style={{ ...tdSt, color: "#16a34a", fontWeight: 600 }}>{r.activos}</td>
                  <td style={tdSt}>{r.Free}</td>
                  <td style={tdSt}>{r.Standard}</td>
                  <td style={tdSt}>{r.Premium}</td>
                  <td style={{ ...tdSt, color: "#0891b2" }}>{r.propia}</td>
                  <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#9ca3af" }}>{r.compartida}</td>
                  <td style={{ ...tdSt, color: "#7c3aed" }}>{r.demos}</td>
                </tr>
              ))}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: isDark ? "2px solid #2c3c58" : "2px solid #e5e7eb", background: isDark ? "#16213a" : "#f8fafc" }}>
                  <td style={{ ...tdSt, fontWeight: 800, color: isDark ? "#e6ecf7" : "#111827" }}>Total</td>
                  <td style={{ ...tdSt, fontWeight: 800 }}>{totales.total}</td>
                  <td style={{ ...tdSt, fontWeight: 800, color: "#16a34a" }}>{totales.activos}</td>
                  <td style={{ ...tdSt, fontWeight: 800 }}>{totales.Free}</td>
                  <td style={{ ...tdSt, fontWeight: 800 }}>{totales.Standard}</td>
                  <td style={{ ...tdSt, fontWeight: 800 }}>{totales.Premium}</td>
                  <td style={{ ...tdSt, fontWeight: 800, color: "#0891b2" }}>{totales.propia}</td>
                  <td style={{ ...tdSt, fontWeight: 800, color: isDark ? "#93a2bd" : "#9ca3af" }}>{totales.compartida}</td>
                  <td style={{ ...tdSt, fontWeight: 800, color: "#7c3aed" }}>{totales.demos}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
