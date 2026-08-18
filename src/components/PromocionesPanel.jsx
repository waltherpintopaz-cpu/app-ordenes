import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../supabaseClient";

const VACIO = { titulo: "", mensajes: [""] };

export default function PromocionesPanel({ theme }) {
  const isDark = theme === "dark";
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(VACIO);
  const [editingId, setEditingId] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error: e } = await supabase.from("promociones").select("*").order("orden", { ascending: true }).order("id", { ascending: true });
    setError(e ? e.message : "");
    setPromos(Array.isArray(data) ? data.map((p) => ({ ...p, mensajes: Array.isArray(p.mensajes) && p.mensajes.length ? p.mensajes : (p.mensaje ? [p.mensaje] : []) })) : []);
    setLoading(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const setBloque = (idx, valor) => setForm((p) => ({ ...p, mensajes: p.mensajes.map((m, i) => (i === idx ? valor : m)) }));
  const agregarBloque = () => setForm((p) => ({ ...p, mensajes: [...p.mensajes, ""] }));
  const quitarBloque = (idx) => setForm((p) => ({ ...p, mensajes: p.mensajes.filter((_, i) => i !== idx) }));

  const guardar = async () => {
    const titulo = form.titulo.trim();
    const mensajes = form.mensajes.map((m) => m.trim()).filter(Boolean);
    if (!titulo || mensajes.length === 0) { setError("Completa título y al menos un mensaje."); return; }
    setGuardando(true);
    setError("");
    try {
      const payload = { titulo, mensajes, mensaje: mensajes[0] };
      if (editingId) {
        const { error: e } = await supabase.from("promociones").update(payload).eq("id", editingId);
        if (e) throw e;
      } else {
        const maxOrden = promos.reduce((m, p) => Math.max(m, p.orden || 0), 0);
        const { error: e } = await supabase.from("promociones").insert([{ ...payload, orden: maxOrden + 1 }]);
        if (e) throw e;
      }
      setForm(VACIO);
      setEditingId(null);
      await cargar();
    } catch (e) {
      setError(String(e?.message || "No se pudo guardar."));
    } finally {
      setGuardando(false);
    }
  };

  const editar = (p) => { setEditingId(p.id); setForm({ titulo: p.titulo, mensajes: p.mensajes.length ? p.mensajes : [""] }); };
  const cancelarEdicion = () => { setEditingId(null); setForm(VACIO); };

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar la promoción "${p.titulo}"?`)) return;
    const { error: e } = await supabase.from("promociones").delete().eq("id", p.id);
    if (e) { setError(e.message); return; }
    await cargar();
  };

  const toggleActivo = async (p) => {
    const { error: e } = await supabase.from("promociones").update({ activo: !p.activo }).eq("id", p.id);
    if (e) { setError(e.message); return; }
    setPromos((prev) => prev.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x)));
  };

  const mover = async (p, direccion) => {
    const idx = promos.findIndex((x) => x.id === p.id);
    const otroIdx = idx + direccion;
    if (otroIdx < 0 || otroIdx >= promos.length) return;
    const otro = promos[otroIdx];
    const ordenP = p.orden ?? idx;
    const ordenOtro = otro.orden ?? otroIdx;
    await Promise.all([
      supabase.from("promociones").update({ orden: ordenOtro }).eq("id", p.id),
      supabase.from("promociones").update({ orden: ordenP }).eq("id", otro.id),
    ]);
    await cargar();
  };

  const cardBg = isDark ? "#1a2740" : "#fff";
  const borderColor = isDark ? "#2c3c58" : "#e2e8f0";
  const textColor = isDark ? "#e6ecf7" : "#111827";
  const mutedColor = isDark ? "#93a2bd" : "#6b7280";

  const inputStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${borderColor}`,
    fontSize: 13, boxSizing: "border-box", background: isDark ? "#0d172a" : "#fff", color: textColor,
  };
  const btn = (color = "#2563eb", outline = false) => ({
    padding: "7px 14px", borderRadius: 8, border: outline ? `1.5px solid ${color}` : "none",
    background: outline ? "transparent" : color, color: outline ? color : "#fff",
    fontWeight: 700, fontSize: 12, cursor: "pointer",
  });

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 760 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1a3a6b", marginBottom: 4 }}>🎁 Promociones</div>
        <div style={{ fontSize: 13, color: mutedColor }}>
          Estas promociones aparecen en el sidebar de Chatwoot cuando el agente confirma que el cliente sí tiene cobertura,
          para que pueda elegir y enviarla por WhatsApp con un clic. Cada promoción puede tener varios bloques de mensaje
          (ej: uno con la lista de planes, otro con la oferta especial) — se envían como mensajes separados, uno tras otro,
          en vez de un solo bloque largo.
        </div>
      </div>

      {/* Formulario alta/edición */}
      <div style={{ background: cardBg, border: `1.5px solid ${borderColor}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: textColor, marginBottom: 10 }}>
          {editingId ? "Editar promoción" : "Nueva promoción"}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor, display: "block", marginBottom: 4 }}>Título (solo referencia interna)</label>
          <input style={inputStyle} placeholder="Ej: Planes DIM + promo instalación gratis" value={form.titulo}
            onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} />
        </div>

        <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor, display: "block", marginBottom: 4 }}>
          Mensajes que se envían al cliente (uno por bloque, en orden)
        </label>
        <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
          {form.mensajes.map((bloque, idx) => (
            <div key={idx} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <div style={{ ...btn("#1a3a6b"), padding: "6px 9px", cursor: "default", flexShrink: 0 }}>{idx + 1}</div>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "inherit", flex: 1 }}
                placeholder={idx === 0 ? "Ej: 🌐 DIM Internet - Fibra Óptica\n\n🏠 Hogar · 400 Mbps · S/ 50\n⚡ Turbo · 600 Mbps · S/ 60..." : "Ej: 🎉 Instalación gratis + primer mes 50% de descuento..."}
                value={bloque} onChange={(e) => setBloque(idx, e.target.value)} />
              {form.mensajes.length > 1 && (
                <button style={{ ...btn("#dc2626", true), padding: "6px 9px", flexShrink: 0 }} onClick={() => quitarBloque(idx)}>✕</button>
              )}
            </div>
          ))}
        </div>
        <button style={{ ...btn("#2563eb", true), marginBottom: 12 }} onClick={agregarBloque}>+ Agregar otro bloque de mensaje</button>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn("#1a3a6b")} onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : editingId ? "Guardar cambios" : "+ Agregar promoción"}
          </button>
          {editingId && <button style={btn("#6b7280", true)} onClick={cancelarEdicion}>Cancelar</button>}
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{error}</div>}
      </div>

      {/* Lista */}
      <div>
        <div style={{ fontSize: 12, color: mutedColor, marginBottom: 8 }}>
          {loading ? "Cargando..." : `${promos.length} promoción${promos.length === 1 ? "" : "es"} · ${promos.filter((p) => p.activo).length} activa${promos.filter((p) => p.activo).length === 1 ? "" : "s"}`}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {promos.map((p, i) => (
            <div key={p.id} style={{ background: cardBg, border: `1.5px solid ${p.activo ? "#86efac" : borderColor}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: textColor }}>{p.titulo}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: p.activo ? "#dcfce7" : "#f1f5f9", color: p.activo ? "#16a34a" : "#94a3b8" }}>
                      {p.activo ? "Activa" : "Inactiva"}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#eff6ff", color: "#2563eb" }}>
                      {p.mensajes.length} mensaje{p.mensajes.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {p.mensajes.map((m, mi) => (
                    <div key={mi} style={{ fontSize: 12, color: mutedColor, whiteSpace: "pre-wrap", marginBottom: mi < p.mensajes.length - 1 ? 6 : 0, paddingLeft: 8, borderLeft: `2px solid ${borderColor}` }}>
                      {m}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button title="Subir" style={{ ...btn("#6b7280", true), padding: "3px 8px" }} onClick={() => mover(p, -1)} disabled={i === 0}>↑</button>
                    <button title="Bajar" style={{ ...btn("#6b7280", true), padding: "3px 8px" }} onClick={() => mover(p, 1)} disabled={i === promos.length - 1}>↓</button>
                  </div>
                  <button style={{ ...btn(p.activo ? "#d97706" : "#16a34a", true), padding: "3px 8px", fontSize: 11 }} onClick={() => toggleActivo(p)}>
                    {p.activo ? "Desactivar" : "Activar"}
                  </button>
                  <button style={{ ...btn("#2563eb", true), padding: "3px 8px", fontSize: 11 }} onClick={() => editar(p)}>Editar</button>
                  <button style={{ ...btn("#dc2626", true), padding: "3px 8px", fontSize: 11 }} onClick={() => eliminar(p)}>Eliminar</button>
                </div>
              </div>
            </div>
          ))}
          {!loading && promos.length === 0 && (
            <div style={{ fontSize: 12, color: mutedColor, padding: "12px 4px" }}>Aún no hay promociones creadas.</div>
          )}
        </div>
      </div>
    </div>
  );
}
