import { useEffect, useState, useCallback, useMemo } from "react";
import { MonitorPlay, Users2, Tv2, Sparkles, Link2, ShieldAlert, RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient";
import { normalizarEtiquetaNodo } from "../utils/nodos.js";

const PLAN_COLOR = { Free: "#6b7280", Standard: "#2563eb", Premium: "#7c3aed" };

function KpiCard({ icon: Icon, label, value, sub, color, isDark }) {
  return (
    <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ background: `${color}1a`, borderRadius: 10, padding: 8, display: "flex" }}>
          <Icon size={18} color={color} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: isDark ? "#e6ecf7" : "#111827" }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: isDark ? "#93a2bd" : "#9ca3af" }}>{sub}</div> : null}
    </div>
  );
}

export default function MaxPlayerDashboardPanel({ theme }) {
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
        .select("dni,nodo,plan,es_demo,xtream_user_id,created_at")
        .order("created_at", { ascending: false });
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

  const stats = useMemo(() => {
    const total = cuentas.length;
    const activos = cuentas.filter((c) => clientesMap[c.dni]?.estado === "ACTIVO").length;
    const demos = cuentas.filter((c) => c.es_demo).length;
    const migradas = cuentas.filter((c) => c.xtream_user_id).length;
    const sinMigrar = total - migradas;
    const pctMigradas = total > 0 ? Math.round((migradas / total) * 100) : 0;

    const porPlan = { Free: 0, Standard: 0, Premium: 0 };
    cuentas.forEach((c) => {
      const p = c.plan || "Premium";
      if (porPlan[p] !== undefined) porPlan[p] += 1;
    });

    const porNodoMap = {};
    cuentas.forEach((c) => {
      const nodo = normalizarEtiquetaNodo(c.nodo) || "Sin nodo";
      porNodoMap[nodo] = (porNodoMap[nodo] || 0) + 1;
    });
    const topNodos = Object.entries(porNodoMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const recientes = [...cuentas].slice(0, 6);

    return { total, activos, demos, migradas, sinMigrar, pctMigradas, porPlan, topNodos, recientes };
  }, [cuentas, clientesMap]);

  const maxNodoCount = stats.topNodos[0]?.[1] || 1;
  const maxPlanCount = Math.max(1, ...Object.values(stats.porPlan));

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#2563eb", borderRadius: 10, padding: 8 }}><MonitorPlay size={22} color="#fff" /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: isDark ? "#e6ecf7" : undefined }}>Dashboard MaxPlayer</h2>
            <p style={{ margin: 0, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>Resumen general de cuentas IPTV</p>
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
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 20 }}>
            <KpiCard icon={Users2} label="Total cuentas" value={stats.total} color="#2563eb" isDark={isDark} />
            <KpiCard icon={Tv2} label="Clientes activos" value={stats.activos} color="#16a34a" isDark={isDark} />
            <KpiCard icon={Sparkles} label="Demos" value={stats.demos} color="#7c3aed" isDark={isDark} />
            <KpiCard icon={Link2} label="Con línea propia" value={`${stats.migradas} (${stats.pctMigradas}%)`} sub={`${stats.sinMigrar} en fuente compartida`} color="#0891b2" isDark={isDark} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", padding: 20 }}>
              <h3 style={{ margin: "0 0 14px 0", fontSize: 14, fontWeight: 700, color: isDark ? "#e6ecf7" : "#111827" }}>Cuentas por nodo (top 6)</h3>
              {stats.topNodos.length === 0 ? (
                <p style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#9ca3af" }}>Sin datos.</p>
              ) : stats.topNodos.map(([nodo, count]) => (
                <div key={nodo} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3, color: isDark ? "#c3d3ee" : "#374151" }}>
                    <span style={{ fontWeight: 600 }}>{nodo}</span>
                    <span>{count}</span>
                  </div>
                  <div style={{ background: isDark ? "#0f1a2e" : "#f1f5f9", borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${(count / maxNodoCount) * 100}%`, height: "100%", background: "#2563eb", borderRadius: 6 }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", padding: 20 }}>
              <h3 style={{ margin: "0 0 14px 0", fontSize: 14, fontWeight: 700, color: isDark ? "#e6ecf7" : "#111827" }}>Distribución por plan</h3>
              {Object.entries(stats.porPlan).map(([plan, count]) => (
                <div key={plan} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3, color: isDark ? "#c3d3ee" : "#374151" }}>
                    <span style={{ fontWeight: 600 }}>{plan}</span>
                    <span>{count}</span>
                  </div>
                  <div style={{ background: isDark ? "#0f1a2e" : "#f1f5f9", borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${(count / maxPlanCount) * 100}%`, height: "100%", background: PLAN_COLOR[plan] || "#6b7280", borderRadius: 6 }} />
                  </div>
                </div>
              ))}
              {stats.sinMigrar > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 11, color: isDark ? "#93a2bd" : "#9ca3af" }}>
                  <ShieldAlert size={13} />
                  {stats.sinMigrar} cuenta{stats.sinMigrar !== 1 ? "s" : ""} sin línea propia siguen en la fuente compartida.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
