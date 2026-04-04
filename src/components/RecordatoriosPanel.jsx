import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "../supabaseClient";

const PRIOS = [
  { key: "alta",   label: "Alta",   color: "#EF4444", bg: "#FEF2F2", border: "#FECACA" },
  { key: "normal", label: "Normal", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  { key: "baja",   label: "Baja",   color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" }
];

const emptyForm = { titulo: "", descripcion: "", prioridad: "normal", fecha_vencimiento: "", foto_url: "" };

function pInfo(p) { return PRIOS.find((x) => x.key === p) || PRIOS[1]; }

function fmtFecha(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso; }
}

function isVenc(f) { return !!f && new Date(f) < new Date(); }

export default function RecordatoriosPanel({ sessionUser }) {
  const userId = String(sessionUser?.id || sessionUser?.username || "");

  const [recs, setRecs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState("pendientes");
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [editId, setEditId]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    supabase.from("recordatorios").select("*")
      .eq("usuario_id", userId)
      .order("completado", { ascending: true })
      .order("created_at", { ascending: false })
      .then(({ data }) => { setRecs(data || []); setLoading(false); });
  }, [userId]);

  const pendientes  = recs.filter((r) => !r.completado);
  const completados = recs.filter((r) => r.completado);
  const lista       = filtro === "completados" ? completados : pendientes;

  const abrirNuevo = () => { setForm(emptyForm); setEditId(null); setModal(true); };
  const abrirEditar = (r) => {
    setForm({
      titulo: r.titulo || "",
      descripcion: r.descripcion || "",
      prioridad: r.prioridad || "normal",
      fecha_vencimiento: r.fecha_vencimiento ? r.fecha_vencimiento.slice(0, 16) : "",
      foto_url: r.foto_url || ""
    });
    setEditId(r.id);
    setModal(true);
  };

  const subirFoto = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) { alert("Solo se aceptan imágenes."); return; }
    setUploadingFoto(true);
    try {
      const ext = file.name.split(".").pop().toLowerCase() || "jpg";
      const fileName = `recordatorios/${userId}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("fotos").upload(fileName, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("fotos").getPublicUrl(fileName);
      setForm((p) => ({ ...p, foto_url: urlData?.publicUrl || "" }));
    } catch (e) {
      alert("Error al subir foto: " + (e?.message || "intenta de nuevo"));
    } finally {
      setUploadingFoto(false);
    }
  }, [userId]);

  const guardar = async () => {
    if (!form.titulo.trim()) { alert("Ingresa un título."); return; }
    setSaving(true);
    try {
      const fechaIso = form.fecha_vencimiento ? new Date(form.fecha_vencimiento).toISOString() : null;
      const payload = {
        usuario_id: userId,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        prioridad: form.prioridad,
        fecha_vencimiento: fechaIso,
        foto_url: form.foto_url || ""
      };
      if (editId) {
        await supabase.from("recordatorios").update(payload).eq("id", editId);
        setRecs((prev) => prev.map((r) => r.id === editId ? { ...r, ...payload } : r));
      } else {
        const { data: nd } = await supabase.from("recordatorios")
          .insert({ ...payload, completado: false }).select().maybeSingle();
        if (nd) setRecs((prev) => [nd, ...prev]);
      }
      setModal(false);
    } finally { setSaving(false); }
  };

  const toggleRec = async (r) => {
    const nuevo = !r.completado;
    setRecs((prev) => prev.map((x) => x.id === r.id ? { ...x, completado: nuevo } : x));
    await supabase.from("recordatorios").update({ completado: nuevo }).eq("id", r.id);
  };

  const eliminarRec = async (r) => {
    if (!window.confirm(`¿Eliminar "${r.titulo}"?`)) return;
    await supabase.from("recordatorios").delete().eq("id", r.id);
    setRecs((prev) => prev.filter((x) => x.id !== r.id));
  };

  const s = {
    wrap:      { maxWidth: 860, margin: "0 auto", padding: "0 0 40px 0" },
    header:    { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12 },
    title:     { fontSize: 22, fontWeight: 800, color: "#0A2E5F", margin: 0 },
    sub:       { fontSize: 12, color: "#94A3B8", marginTop: 4 },
    badge:     (n) => ({ background: n > 0 ? "#1E4F9C" : "#E2E8F0", color: n > 0 ? "#fff" : "#64748B", borderRadius: 999, padding: "4px 14px", fontWeight: 800, fontSize: 13 }),
    addBtn:    { background: "#1E4F9C", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" },
    tabs:      { display: "flex", gap: 8, marginBottom: 18 },
    tab:       (a) => ({ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: a ? "#1E4F9C" : "#F1F5F9", color: a ? "#fff" : "#64748B" }),
    card:      (prio, done) => ({ background: "#fff", borderRadius: 14, borderLeft: `4px solid ${prio.color}`, padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", opacity: done ? 0.72 : 1, display: "flex", gap: 12, alignItems: "flex-start" }),
    checkbox:  (done) => ({ width: 22, height: 22, borderRadius: 6, border: `2px solid ${done ? "#22C55E" : "#CBD5E1"}`, background: done ? "#22C55E" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, fontSize: 12, color: "#fff", userSelect: "none" }),
    cardTitle: (done) => ({ fontSize: 15, fontWeight: 700, color: done ? "#94A3B8" : "#0F172A", textDecoration: done ? "line-through" : "none", margin: "0 0 4px 0" }),
    cardDesc:  { fontSize: 13, color: "#64748B", margin: "0 0 8px 0" },
    prioPill:  (p) => ({ background: p.bg, color: p.color, border: `1px solid ${p.border}`, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }),
    fechaSpan: (v) => ({ fontSize: 11, color: v ? "#EF4444" : "#94A3B8" }),
    thumb:     { width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0 },
    actions:   { display: "flex", gap: 6, marginLeft: "auto", flexShrink: 0 },
    editBtn:   { background: "#F1F5F9", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#475569", fontWeight: 600 },
    delBtn:    { background: "#FEF2F2", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#EF4444", fontWeight: 600 },
    empty:     { textAlign: "center", padding: "48px 0", color: "#94A3B8" },
    overlay:   { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 },
    modal:     { background: "#fff", borderRadius: 18, padding: 28, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" },
    mTitle:    { fontSize: 17, fontWeight: 800, color: "#0A2E5F", margin: "0 0 18px 0" },
    label:     { fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 5, display: "block" },
    input:     { width: "100%", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#1E293B", background: "#F8FAFC", boxSizing: "border-box", marginBottom: 12 },
    pBtns:     { display: "flex", gap: 8, marginBottom: 14 },
    pBtn:      (p, sel) => ({ flex: 1, padding: "9px 0", border: `2px solid ${p.color}`, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, background: sel ? p.color : "#fff", color: sel ? "#fff" : p.color }),
    saveBtn:   { width: "100%", background: "#1E4F9C", color: "#fff", border: "none", borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 15, cursor: "pointer", marginTop: 8 }
  };

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>🔔 Recordatorios</h2>
          <p style={s.sub}>Privados · solo tú los ves</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={s.badge(pendientes.length)}>
            {pendientes.length} pendiente{pendientes.length !== 1 ? "s" : ""}
          </span>
          <button style={s.addBtn} onClick={abrirNuevo}>+ Nuevo</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {[
          { key: "pendientes",  label: `Pendientes (${pendientes.length})` },
          { key: "completados", label: `Completados (${completados.length})` }
        ].map((t) => (
          <button key={t.key} style={s.tab(filtro === t.key)} onClick={() => setFiltro(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p style={{ color: "#94A3B8", textAlign: "center" }}>Cargando...</p>
      ) : lista.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔕</div>
          <p style={{ fontWeight: 700, margin: 0 }}>
            {filtro === "completados" ? "Sin completados aún" : "Sin recordatorios pendientes"}
          </p>
          {filtro === "pendientes" && (
            <p style={{ fontSize: 13, marginTop: 6 }}>Haz clic en "+ Nuevo" para agregar uno</p>
          )}
        </div>
      ) : lista.map((r) => {
        const prio = pInfo(r.prioridad);
        const venc = isVenc(r.fecha_vencimiento);
        return (
          <div key={r.id} style={s.card(prio, r.completado)}>
            <div style={s.checkbox(r.completado)} onClick={() => toggleRec(r)}>
              {r.completado ? "✓" : ""}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={s.cardTitle(r.completado)}>{r.titulo}</p>
              {r.descripcion && <p style={s.cardDesc}>{r.descripcion}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={s.prioPill(prio)}>{prio.label}</span>
                {r.fecha_vencimiento && (
                  <span style={s.fechaSpan(venc)}>
                    {venc ? "⚠ " : "📅 "}{fmtFecha(r.fecha_vencimiento)}
                  </span>
                )}
              </div>
            </div>
            {r.foto_url && (
              <img src={r.foto_url} alt="" style={s.thumb}
                onError={(e) => { e.target.style.display = "none"; }} />
            )}
            <div style={s.actions}>
              <button style={s.editBtn} onClick={() => abrirEditar(r)}>Editar</button>
              <button style={s.delBtn} onClick={() => eliminarRec(r)}>✕</button>
            </div>
          </div>
        );
      })}

      {/* Modal */}
      {modal && (
        <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) setModal(false); }}>
          <div style={s.modal}>
            <h3 style={s.mTitle}>{editId ? "Editar recordatorio" : "Nuevo recordatorio"}</h3>

            <label style={s.label}>Título *</label>
            <input style={s.input} value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="¿Qué debes recordar?" autoFocus />

            <label style={s.label}>Descripción</label>
            <textarea style={{ ...s.input, height: 72, resize: "vertical" }}
              value={form.descripcion}
              onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
              placeholder="Detalles adicionales..." />

            <label style={s.label}>Prioridad</label>
            <div style={s.pBtns}>
              {PRIOS.map((p) => (
                <button key={p.key} style={s.pBtn(p, form.prioridad === p.key)}
                  onClick={() => setForm((prev) => ({ ...prev, prioridad: p.key }))}>
                  {p.label}
                </button>
              ))}
            </div>

            <label style={s.label}>Fecha límite (opcional)</label>
            <input type="datetime-local" style={s.input}
              value={form.fecha_vencimiento}
              onChange={(e) => setForm((p) => ({ ...p, fecha_vencimiento: e.target.value }))} />

            <label style={s.label}>Foto (opcional)</label>
            {form.foto_url ? (
              <div style={{ position: "relative", marginBottom: 12 }}>
                <img src={form.foto_url} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, display: "block" }}
                  onError={(e) => { e.target.style.display = "none"; }} />
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, foto_url: "" }))}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 999, width: 26, height: 26, cursor: "pointer", color: "#fff", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✕
                </button>
              </div>
            ) : (
              <div
                style={{
                  border: `2px dashed ${dragOver ? "#1E4F9C" : "#CBD5E1"}`,
                  borderRadius: 12, padding: "22px 16px", textAlign: "center",
                  background: dragOver ? "#EEF4FF" : "#F8FAFC",
                  cursor: "pointer", marginBottom: 12, transition: "all .15s",
                  color: dragOver ? "#1E4F9C" : "#94A3B8", fontSize: 13,
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) subirFoto(f); }}
              >
                {uploadingFoto ? (
                  <span>Subiendo foto...</span>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                    <div style={{ fontWeight: 700 }}>Arrastra una imagen aquí</div>
                    <div style={{ fontSize: 12, marginTop: 3 }}>o toca para seleccionar</div>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) subirFoto(f); e.target.value = ""; }}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button style={{ ...s.saveBtn, background: "#F1F5F9", color: "#475569", flex: 1 }}
                onClick={() => setModal(false)}>
                Cancelar
              </button>
              <button style={{ ...s.saveBtn, flex: 2 }} onClick={guardar} disabled={saving}>
                {saving ? "Guardando..." : editId ? "Guardar cambios" : "Crear recordatorio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
