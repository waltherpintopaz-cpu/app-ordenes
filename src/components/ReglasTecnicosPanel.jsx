import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

// Administracion > Reglas tecnicos: interruptor "una orden a la vez" por EQUIPO
// (tecnicos con el mismo "grupo"). Con la regla activa, el equipo no puede
// iniciar otra orden si tiene una En Proceso (debe liquidarla o reprogramarla)
// y el usuario/clave PPPoE se ve recien al Iniciar. Pensado para activarlo
// solo a quienes dejan ordenes sin liquidar.
const norm = (v) => String(v || "").trim().toLowerCase();
const esTecnico = (rol) => norm(rol).normalize("NFD").replace(/[̀-ͯ]/g, "") === "tecnico";

export default function ReglasTecnicosPanel({ ordenes = [] }) {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState("");
  const [error, setError] = useState("");

  const cargar = async () => {
    setCargando(true);
    const { data, error: e } = await supabase.from("usuarios").select("id,nombre,rol,grupo,activo,regla_una_orden").eq("activo", true).order("nombre");
    if (e) setError(e.message.includes("regla_una_orden") ? "Falta correr el SQL 20261113h_regla_una_orden.sql en esta base." : e.message);
    else { setError(""); setUsuarios((data || []).filter((u) => esTecnico(u.rol))); }
    setCargando(false);
  };
  useEffect(() => { void cargar(); }, []);

  // Equipos: mismo "grupo" (o el tecnico solo si no tiene grupo).
  const equipos = useMemo(() => {
    const m = new Map();
    for (const u of usuarios) {
      const k = norm(u.grupo) || `solo:${norm(u.nombre)}`;
      if (!m.has(k)) m.set(k, { clave: k, grupo: String(u.grupo || "").trim(), miembros: [] });
      m.get(k).miembros.push(u);
    }
    const hoy = Date.now();
    return [...m.values()].map((eq) => {
      const nombres = new Set(eq.miembros.map((u) => norm(u.nombre)));
      const enProceso = (ordenes || []).filter((o) => /proceso/i.test(String(o.estado || "")) && nombres.has(norm(o.tecnico)));
      const masVieja = enProceso.reduce((min, o) => {
        const f = String(o.fechaActuacion || "").slice(0, 10);
        const t = f ? new Date(`${f}T00:00:00`).getTime() : NaN;
        return Number.isFinite(t) && (min == null || t < min) ? t : min;
      }, null);
      const dias = masVieja != null ? Math.max(0, Math.floor((hoy - masVieja) / 86400000)) : null;
      return { ...eq, activa: eq.miembros.some((u) => u.regla_una_orden), enProceso, dias };
    }).sort((a, b) => (b.enProceso.length - a.enProceso.length) || a.miembros[0].nombre.localeCompare(b.miembros[0].nombre));
  }, [usuarios, ordenes]);

  const cambiar = async (eq, valor) => {
    setGuardando(eq.clave);
    const nombres = eq.miembros.map((u) => u.nombre);
    const { error: e } = await supabase.from("usuarios").update({ regla_una_orden: valor }).in("nombre", nombres);
    setGuardando("");
    if (e) { alert(`No se pudo guardar: ${e.message}`); return; }
    setUsuarios((prev) => prev.map((u) => (nombres.includes(u.nombre) ? { ...u, regla_una_orden: valor } : u)));
  };

  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 14, padding: "12px 16px", color: "#4c1d95", fontSize: 13.5, lineHeight: 1.5 }}>
        <b>Una orden a la vez (por equipo).</b> Con la regla activa, el equipo no puede <b>iniciar</b> otra orden mientras tenga una <b>En proceso</b>:
        primero la liquida o la reprograma. Además, el <b>usuario y clave PPPoE</b> se le muestran recién al apretar <b>Iniciar</b>.
        Actívala solo a los equipos que dejan órdenes sin liquidar.
      </div>
      {error && <div style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div>}
      {cargando ? <div style={{ color: "#64748b" }}>Cargando técnicos…</div> : equipos.map((eq) => (
        <div key={eq.clave} style={{ ...card, borderColor: eq.activa ? "#c4b5fd" : "#e2e8f0", background: eq.activa ? "#faf5ff" : "#fff" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0f172a" }}>
              {eq.miembros.map((u) => u.nombre).join(" + ")}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {eq.grupo ? `Equipo "${eq.grupo}"` : "Sin equipo"} · {eq.miembros.length} técnico{eq.miembros.length === 1 ? "" : "s"}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {eq.enProceso.length === 0 ? (
                <span style={{ fontSize: 11.5, fontWeight: 800, color: "#15803d", background: "#dcfce7", borderRadius: 999, padding: "2px 9px" }}>✅ Sin órdenes en proceso</span>
              ) : (
                <span style={{ fontSize: 11.5, fontWeight: 800, color: eq.enProceso.length > 1 || (eq.dias ?? 0) >= 1 ? "#fff" : "#1d4ed8", background: eq.enProceso.length > 1 || (eq.dias ?? 0) >= 1 ? "#dc2626" : "#dbeafe", borderRadius: 999, padding: "2px 9px" }}>
                  🔵 {eq.enProceso.length} en proceso{eq.dias ? ` · la más vieja de hace ${eq.dias} día${eq.dias === 1 ? "" : "s"}` : ""}
                </span>
              )}
              {eq.enProceso.slice(0, 4).map((o) => (
                <span key={o.id} title={o.nombre} style={{ fontSize: 11, color: "#475569", background: "#f1f5f9", borderRadius: 999, padding: "2px 8px" }}>{o.codigo}</span>
              ))}
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: guardando ? "wait" : "pointer", userSelect: "none" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: eq.activa ? "#6d28d9" : "#64748b" }}>{eq.activa ? "Regla activa" : "Sin regla"}</span>
            <span onClick={() => { if (!guardando) void cambiar(eq, !eq.activa); }}
              style={{ width: 46, height: 26, borderRadius: 999, background: eq.activa ? "#7c3aed" : "#cbd5e1", position: "relative", transition: "background .15s", opacity: guardando === eq.clave ? 0.6 : 1 }}>
              <span style={{ position: "absolute", top: 3, left: eq.activa ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}
