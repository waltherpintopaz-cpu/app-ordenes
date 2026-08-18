import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../supabaseClient";

const VACIO = { titulo: "", mensaje: "" };

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
    setPromos(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async () => {
    const titulo = form.titulo.trim();
    const mensaje = form.mensaje.trim();
    if (!titulo || !mensaje) { setError("Completa título y mensaje."); return; }
    setGuardando(true);
    setError("");
    try {
      if (editingId) {
        const { error: e } = await supabase.from("promociones").update({ titulo, mensaje }).eq("id", editingId);
        if (e) throw e;
      } else {
        const maxOrden = promos.reduce((m, p) => Math.max(m, p.orden || 0), 0);
        const { error: e } = await supabase.from("promociones").insert([{ titulo, mensaje, orden: maxOrden + 1 }]);
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

  const editar = (p) => { setEditingId(p.id); setForm({ titulo: p.titulo, mensaje: p.mensaje }); };
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
          para que pueda elegir y enviar una por WhatsApp con un clic.
        </div>
      </div>

      {/* Formulario alta/edición */}
      <div style={{ background: cardBg, border: `1.5px solid ${borderColor}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: textColor, marginBottom: 10 }}>
          {editingId ? "Editar promoción" : "Nueva promoción"}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor, display: "block", marginBottom: 4 }}>Título (solo referencia interna)</label>
          <input style={inputStyle} placeholder="Ej: Primer mes 50% dcto." value={form.titulo}
            onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor, display: "block", marginBottom: 4 }}>Mensaje que se envía al cliente por WhatsApp</label>
          <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontFamily: "inherit" }}
            placeholder="Ej: 🎉 ¡Promoción especial! Tu primer mes con 50% de descuento en el plan de 100 Mbps..."
            value={form.mensaje} onChange={(e) => setForm((p) => ({ ...p, mensaje: e.target.value }))} />
        </div>
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
                  </div>
                  <div style={{ fontSize: 12, color: mutedColor, whiteSpace: "pre-wrap" }}>{p.mensaje}</div>
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
