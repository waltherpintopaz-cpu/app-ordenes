import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../supabaseClient";

const VACIO = { titulo: "", descripcion: "", mensaje: "", compartido: false };

export default function MensajesRapidosPanel({ theme, sessionUser }) {
  const isDark = theme === "dark";
  const miNombre = String(sessionUser?.nombre || "").trim();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(VACIO);
  const [editingId, setEditingId] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error: e } = await supabase.from("mensajes_rapidos").select("*").order("orden", { ascending: true }).order("id", { ascending: true });
    setError(e ? e.message : "");
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async () => {
    const titulo = form.titulo.trim();
    const descripcion = form.descripcion.trim();
    const mensaje = form.mensaje.trim();
    if (!titulo || !descripcion || !mensaje) { setError("Completa título, descripción y mensaje."); return; }
    if (!miNombre) { setError("No se detectó tu usuario logueado."); return; }
    setGuardando(true);
    setError("");
    try {
      if (editingId) {
        const { error: e } = await supabase.from("mensajes_rapidos").update({ titulo, descripcion, mensaje, compartido: form.compartido }).eq("id", editingId);
        if (e) throw e;
      } else {
        const maxOrden = items.reduce((m, x) => Math.max(m, x.orden || 0), 0);
        const { error: e } = await supabase.from("mensajes_rapidos").insert([{ titulo, descripcion, mensaje, compartido: form.compartido, creado_por: miNombre, orden: maxOrden + 1 }]);
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

  const editar = (m) => { setEditingId(m.id); setForm({ titulo: m.titulo, descripcion: m.descripcion, mensaje: m.mensaje, compartido: !!m.compartido }); };
  const cancelarEdicion = () => { setEditingId(null); setForm(VACIO); };

  const eliminar = async (m) => {
    if (!window.confirm(`¿Eliminar el mensaje "${m.titulo}"?`)) return;
    const { error: e } = await supabase.from("mensajes_rapidos").delete().eq("id", m.id);
    if (e) { setError(e.message); return; }
    await cargar();
  };

  const misMensajes = items.filter((m) => m.creado_por === miNombre);
  const compartidosDeOtros = items.filter((m) => m.compartido && m.creado_por !== miNombre);

  const mover = async (m, direccion) => {
    const idx = misMensajes.findIndex((x) => x.id === m.id);
    const otroIdx = idx + direccion;
    if (otroIdx < 0 || otroIdx >= misMensajes.length) return;
    const otro = misMensajes[otroIdx];
    const ordenM = m.orden ?? idx;
    const ordenOtro = otro.orden ?? otroIdx;
    await Promise.all([
      supabase.from("mensajes_rapidos").update({ orden: ordenOtro }).eq("id", m.id),
      supabase.from("mensajes_rapidos").update({ orden: ordenM }).eq("id", otro.id),
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

  const renderItem = (m, editable, idx, total) => (
    <div key={m.id} style={{ background: cardBg, border: `1.5px solid ${m.compartido ? "#93c5fd" : borderColor}`, borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: textColor }}>{m.titulo}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: m.compartido ? "#dbeafe" : "#f1f5f9", color: m.compartido ? "#1d4ed8" : "#94a3b8" }}>
              {m.compartido ? "Compartido" : "Personal"}
            </span>
            {!editable && <span style={{ fontSize: 10, color: mutedColor }}>de {m.creado_por}</span>}
          </div>
          <div style={{ fontSize: 11, color: mutedColor, marginBottom: 4, fontStyle: "italic" }}>{m.descripcion}</div>
          <div style={{ fontSize: 12, color: textColor, whiteSpace: "pre-wrap", background: isDark ? "#0d172a" : "#f8fafc", borderRadius: 6, padding: "6px 8px" }}>{m.mensaje}</div>
        </div>
        {editable && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 4 }}>
              <button title="Subir" style={{ ...btn("#6b7280", true), padding: "3px 8px" }} onClick={() => mover(m, -1)} disabled={idx === 0}>↑</button>
              <button title="Bajar" style={{ ...btn("#6b7280", true), padding: "3px 8px" }} onClick={() => mover(m, 1)} disabled={idx === total - 1}>↓</button>
            </div>
            <button style={{ ...btn("#2563eb", true), padding: "3px 8px", fontSize: 11 }} onClick={() => editar(m)}>Editar</button>
            <button style={{ ...btn("#dc2626", true), padding: "3px 8px", fontSize: 11 }} onClick={() => eliminar(m)}>Eliminar</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 760 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1a3a6b", marginBottom: 4 }}>💬 Mensajes Rápidos</div>
        <div style={{ fontSize: 13, color: mutedColor }}>
          Respuestas cortas listas para enviar desde el sidebar de Chatwoot, con una descripción para saber qué dicen antes de mandarlas.
          Puedes dejarlas <strong>personales</strong> (solo tú las ves) o <strong>compartidas</strong> (las ve cualquier agente).
        </div>
        {!miNombre && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
            ⚠ No se detectó tu nombre de usuario logueado — no podrás crear mensajes hasta iniciar sesión correctamente.
          </div>
        )}
      </div>

      {/* Formulario alta/edición */}
      <div style={{ background: cardBg, border: `1.5px solid ${borderColor}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: textColor, marginBottom: 10 }}>
          {editingId ? "Editar mensaje rápido" : "Nuevo mensaje rápido"}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor, display: "block", marginBottom: 4 }}>Título</label>
          <input style={inputStyle} placeholder="Ej: Cómo pagar" value={form.titulo}
            onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor, display: "block", marginBottom: 4 }}>Descripción (para saber qué envía, no se manda al cliente)</label>
          <input style={inputStyle} placeholder="Ej: Explica los métodos de pago disponibles" value={form.descripcion}
            onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: mutedColor, display: "block", marginBottom: 4 }}>Mensaje que se envía al cliente</label>
          <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
            placeholder="Escribe el mensaje..." value={form.mensaje}
            onChange={(e) => setForm((p) => ({ ...p, mensaje: e.target.value }))} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: textColor, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={form.compartido} onChange={(e) => setForm((p) => ({ ...p, compartido: e.target.checked }))} />
          Compartir con todos los agentes (si no, solo tú lo ves)
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn("#1a3a6b")} onClick={guardar} disabled={guardando || !miNombre}>
            {guardando ? "Guardando..." : editingId ? "Guardar cambios" : "+ Agregar mensaje"}
          </button>
          {editingId && <button style={btn("#6b7280", true)} onClick={cancelarEdicion}>Cancelar</button>}
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{error}</div>}
      </div>

      {/* Mis mensajes */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: textColor, marginBottom: 8 }}>
          {loading ? "Cargando..." : `Mis mensajes (${misMensajes.length})`}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {misMensajes.map((m, i) => renderItem(m, true, i, misMensajes.length))}
          {!loading && misMensajes.length === 0 && (
            <div style={{ fontSize: 12, color: mutedColor, padding: "12px 4px" }}>Aún no tienes mensajes creados.</div>
          )}
        </div>
      </div>

      {/* Compartidos por otros */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: textColor, marginBottom: 8 }}>
          Compartidos por otros agentes ({compartidosDeOtros.length})
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {compartidosDeOtros.map((m) => renderItem(m, false, 0, 1))}
          {!loading && compartidosDeOtros.length === 0 && (
            <div style={{ fontSize: 12, color: mutedColor, padding: "12px 4px" }}>Nadie más ha compartido mensajes todavía.</div>
          )}
        </div>
      </div>
    </div>
  );
}
