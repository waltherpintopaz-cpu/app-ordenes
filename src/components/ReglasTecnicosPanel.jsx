// Panel "Reglas técnicos" (Administración > Reglas técnicos), 2026-11-11.
//
// Interruptor POR TECNICO de la regla "una orden a la vez"
// (usuarios.regla_una_orden). Con la regla prendida, en la app:
//   - no puede Iniciar otra orden sin Liquidar o Liberar la que tiene;
//   - no ve el celular del cliente hasta Iniciar;
//   - no puede Finalizar jornada con una orden en proceso;
//   - le llega un aviso si pasa 3 h con una orden en proceso.
// Ademas muestra, por tecnico, las ordenes en proceso (en rojo desde 3 h) y
// las que libero en los ultimos 7 dias con su motivo.
// Requiere supabase/sql/20261111_regla_una_orden.sql.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "../supabaseClient";

const HORAS_ROJO = 3;
const norm = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function hace(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}
const fechaCorta = (iso) =>
  new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ReglasTecnicosPanel({ theme = "light" }) {
  const dark = theme === "dark";
  const c = {
    card: dark ? "#0f172a" : "#ffffff",
    borde: dark ? "#334155" : "#e2e8f0",
    texto: dark ? "#f1f5f9" : "#0f172a",
    sub: dark ? "#94a3b8" : "#64748b",
    fila: dark ? "#111c33" : "#f8fafc",
  };
  const [tecnicos, setTecnicos] = useState([]);
  const [enProceso, setEnProceso] = useState([]);
  const [liberaciones, setLiberaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [faltaSql, setFaltaSql] = useState(false);
  const [guardando, setGuardando] = useState("");
  const [abierto, setAbierto] = useState("");
  const [, setTick] = useState(0);

  const cargar = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const desde7 = new Date(Date.now() - 7 * 24 * 3600e3).toISOString();
    const [us, op, lib] = await Promise.all([
      supabase.from("usuarios").select("id,nombre,rol,activo,regla_una_orden").eq("activo", true),
      supabase.from("ordenes").select("id,codigo,nombre,tecnico,iniciada_en").not("iniciada_en", "is", null).ilike("estado", "%proceso%"),
      supabase.from("orden_liberaciones").select("id,codigo,tecnico,motivo,descripcion,created_at").gte("created_at", desde7).order("created_at", { ascending: false }),
    ]);
    if (us.error) {
      const msg = String(us.error.message || "").toLowerCase();
      setFaltaSql(msg.includes("regla_una_orden"));
      setCargando(false);
      return;
    }
    setFaltaSql(false);
    setTecnicos((us.data || []).filter((u) => norm(u.rol).startsWith("tecnic")).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))));
    setEnProceso(op.error ? [] : op.data || []);
    setLiberaciones(lib.error ? [] : lib.data || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
    const t1 = setInterval(() => void cargar(), 60 * 1000);
    const t2 = setInterval(() => setTick((x) => x + 1), 30 * 1000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [cargar]);

  const porTecnico = useMemo(() => {
    const m = {};
    for (const t of tecnicos) m[norm(t.nombre)] = { proceso: [], libs: [] };
    for (const o of enProceso) (m[norm(o.tecnico)] ||= { proceso: [], libs: [] }).proceso.push(o);
    for (const l of liberaciones) (m[norm(l.tecnico)] ||= { proceso: [], libs: [] }).libs.push(l);
    return m;
  }, [tecnicos, enProceso, liberaciones]);

  const cambiar = async (t, valor) => {
    setGuardando(t.id);
    const { error } = await supabase.from("usuarios").update({ regla_una_orden: valor }).eq("id", t.id);
    setGuardando("");
    if (error) return alert(`No se pudo guardar: ${error.message}`);
    setTecnicos((prev) => prev.map((x) => (x.id === t.id ? { ...x, regla_una_orden: valor } : x)));
  };

  const caja = { background: c.card, border: `1px solid ${c.borde}`, borderRadius: 14, padding: 18, color: c.texto };

  if (faltaSql) {
    return (
      <div style={caja}>
        <h3 style={{ margin: "0 0 6px" }}>Reglas para técnicos</h3>
        <p style={{ margin: 0, color: "#b45309" }}>
          Falta correr en Supabase el archivo <b>supabase/sql/20261111_regla_una_orden.sql</b>.
        </p>
      </div>
    );
  }

  return (
    <div style={caja}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17 }}>Reglas para técnicos · Una orden a la vez</h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: c.sub, maxWidth: 720, lineHeight: 1.5 }}>
            Con la regla <b>prendida</b>, el técnico debe <b>Liquidar</b> o <b>Liberar</b> la orden iniciada antes de iniciar otra,
            ve el celular del cliente recién al iniciar, no puede finalizar su jornada con una orden en proceso y recibe un aviso a las {HORAS_ROJO} h.
            Las órdenes en proceso de antes de la regla no cuentan.
          </p>
        </div>
        <button type="button" onClick={() => void cargar()}
          style={{ border: `1px solid ${c.borde}`, background: c.fila, color: c.texto, borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontSize: 13 }}>
          ↻ Actualizar
        </button>
      </div>

      {cargando ? (
        <p style={{ color: c.sub, marginTop: 16 }}>Cargando…</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {tecnicos.length === 0 && <p style={{ color: c.sub }}>No hay técnicos activos.</p>}
          {tecnicos.map((t) => {
            const d = porTecnico[norm(t.nombre)] || { proceso: [], libs: [] };
            const on = t.regla_una_orden === true;
            const ver = abierto === t.id;
            return (
              <div key={t.id} style={{ border: `1px solid ${c.borde}`, borderRadius: 12, padding: "12px 14px", background: c.fila }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: guardando ? "wait" : "pointer", minWidth: 260, flex: "1 1 260px" }}>
                    <span
                      onClick={(e) => { e.preventDefault(); if (!guardando) void cambiar(t, !on); }}
                      style={{
                        width: 42, height: 24, borderRadius: 12, background: on ? "#16a34a" : "#94a3b8", position: "relative",
                        transition: "background .15s", flexShrink: 0, opacity: guardando === t.id ? 0.6 : 1,
                      }}>
                      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
                    </span>
                    <span>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{t.nombre}</span>
                      <span style={{ display: "block", fontSize: 12, color: on ? "#16a34a" : c.sub }}>{on ? "Regla activa" : "Sin restricción"}</span>
                    </span>
                  </label>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: "2 1 300px" }}>
                    {d.proceso.length === 0 ? (
                      <span style={{ fontSize: 12, color: c.sub }}>Sin órdenes iniciadas</span>
                    ) : (
                      d.proceso.map((o) => {
                        const rojo = Date.now() - new Date(o.iniciada_en).getTime() >= HORAS_ROJO * 3600e3;
                        return (
                          <span key={o.id} title={o.nombre || ""}
                            style={{
                              fontSize: 12, fontWeight: 700, padding: "4px 9px", borderRadius: 8,
                              background: rojo ? "#fee2e2" : "#dbeafe", color: rojo ? "#b91c1c" : "#1d4ed8",
                              border: `1px solid ${rojo ? "#fca5a5" : "#93c5fd"}`,
                            }}>
                            {rojo ? "⏰ " : ""}{o.codigo} · en proceso hace {hace(o.iniciada_en)}
                          </span>
                        );
                      })
                    )}
                  </div>

                  <button type="button" onClick={() => setAbierto(ver ? "" : t.id)} disabled={!d.libs.length}
                    style={{
                      border: `1px solid ${d.libs.length >= 5 ? "#f97316" : c.borde}`, background: "transparent", color: d.libs.length >= 5 ? "#ea580c" : c.texto,
                      borderRadius: 9, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: d.libs.length ? "pointer" : "default",
                    }}>
                    ↩️ Liberó {d.libs.length} (7 días) {d.libs.length ? (ver ? "▲" : "▼") : ""}
                  </button>
                </div>

                {ver && d.libs.length > 0 && (
                  <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                    {d.libs.map((l) => (
                      <div key={l.id} style={{ fontSize: 12.5, borderLeft: "3px solid #ea580c", padding: "4px 10px", background: c.card, borderRadius: 6 }}>
                        <b>{l.codigo || "—"}</b> · {fechaCorta(l.created_at)} · <b>{l.motivo}</b>
                        <div style={{ color: c.sub }}>{l.descripcion}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
