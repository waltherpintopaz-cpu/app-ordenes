import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Save, Power, Clock, MessageSquare, ShieldCheck, Banknote, Bell, Users, CalendarClock, AlertOctagon, Radio, Plus, Trash2, Pencil, Lock, CheckCircle, RefreshCw, Wifi, Gift } from "lucide-react";

const DIAGNO_BASE = import.meta.env.PROD ? "https://amnet-diagno.0lthka.easypanel.host" : "";
const PROXY_URL = `${DIAGNO_BASE}/api/mikrowisp-proxy`;

// Configuración INDEPENDIENTE de bot-pagos-comprobante -- separada a
// propósito de bot_config (que sigue siendo del n8n v2 en producción).
// Nadie más lee ni escribe esta tabla.

const DEFAULT = {
  bot_activo: true,
  modo_bot: "ia",
  inboxes_prueba: "",
  inbox_ventas: "",
  telefonos_prueba_prospecto: "",
  horario_inicio: 8,
  horario_fin: 21,
  horario_dias: "1,2,3,4,5,6",
  feriados: [],
  mensaje_espera_asesor: "Un asesor revisará tu caso en breve.",
  mensaje_fuera_horario: "Estamos fuera de horario de atención, te responderemos apenas abramos.",
  beneficiarios: [],
  comprobante_dias_max: 7,
  bancos_excepcion_anio: "",
  amer_metodos_1: "",
  amer_metodos_2: "",
  planes_tv: "",
  promocion_activa: false,
  promocion_texto: "",
  nod06_yape_numero: "",
  nod06_yape_titular: "",
  nod06_bcp_cuenta: "",
  nod06_bcp_titular: "",
  notif_grupo_principal: "",
  equipo_soporte_id: null,
  equipo_pagos_id: null,
  prorroga_max_consecutivos: 2,
  prorroga_max_dias_activo: 10,
  prorroga_max_dias_suspendido: 3,
  pagos_timeout_escalar_min: 15,
  averia_activa: false,
  averia_contexto: "",
  averia_tiempo_estimado: "",
};

const DIAS = [{ val: 1, label: "Lun" }, { val: 2, label: "Mar" }, { val: 3, label: "Mié" }, { val: 4, label: "Jue" }, { val: 5, label: "Vie" }, { val: 6, label: "Sáb" }, { val: 0, label: "Dom" }];
const HORAS = Array.from({ length: 24 }, (_, i) => ({ val: i, label: `${String(i).padStart(2, "0")}:00` }));

const inp = { width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, color: "#111827", fontFamily: "inherit", boxSizing: "border-box", background: "#fff" };
const lbl = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" };
const hint = { fontSize: 12, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 };
const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 22px", marginBottom: 14 };
const cardTitle = () => ({ fontSize: 14, fontWeight: 700, color: "#111827", display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" });
const infoBanner = (color = "blue") => {
  const map = { blue: { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" }, yellow: { bg: "#fffbeb", border: "#fde68a", color: "#92400e" }, green: { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534" }, red: { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" } };
  const s = map[color] || map.blue;
  return { padding: "10px 14px", borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: 13, marginBottom: 16 };
};

function TagInput({ values = [], onChange, placeholder = "Agregar...", hint: hintText }) {
  const [inputVal, setInputVal] = useState("");
  function add() {
    const v = inputVal.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setInputVal("");
  }
  return (
    <div>
      {values.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {values.map((v, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "#4f46e5", fontWeight: 500 }}>
              {v}
              <button onClick={() => onChange(values.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#818cf8", fontSize: 15, lineHeight: 1, padding: "0 1px", marginLeft: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input type="text" value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder}
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none", fontFamily: "inherit", color: "#111827" }} />
        <button onClick={add} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Agregar</button>
      </div>
      {hintText && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 }}>{hintText}</div>}
    </div>
  );
}

export default function BotPagosV3ConfigPanel() {
  const [cfg, setCfg] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [editingBenef, setEditingBenef] = useState([]);
  const [inboxesDisponibles, setInboxesDisponibles] = useState([]);
  const [cargandoInboxes, setCargandoInboxes] = useState(false);
  const [errorInboxes, setErrorInboxes] = useState("");

  useEffect(() => { load(); }, []);

  async function cargarInboxes() {
    setCargandoInboxes(true);
    setErrorInboxes("");
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "ChatwootListarInboxes", payload: {} }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "No se pudo cargar la lista de inboxes.");
      setInboxesDisponibles(json?.data?.inboxes || []);
    } catch (err) {
      setErrorInboxes(String(err?.message || err));
    } finally {
      setCargandoInboxes(false);
    }
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.from("bot_pagos_v3_config").select("*").eq("id", 1).maybeSingle();
    if (!error && data) {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
      setCfg({ ...DEFAULT, ...clean });
    } else if (error) {
      setLoadError(error.message || "No se pudo cargar la configuración del bot nuevo.");
    }
    setLoading(false);
  }

  async function save() {
    if (loadError) {
      setMsg({ type: "error", text: "No se guardó: falló cargar la configuración real antes de editar." });
      return;
    }
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.from("bot_pagos_v3_config").upsert({ id: 1, ...cfg, actualizado_en: new Date().toISOString() }, { onConflict: "id" });
    if (error) setMsg({ type: "error", text: "Error: " + error.message });
    else setMsg({ type: "ok", text: "✓ Guardado correctamente" });
    setSaving(false);
    setTimeout(() => setMsg(null), 3000);
  }

  function set(key, val) { setCfg(prev => ({ ...prev, [key]: val })); }
  function toggleDia(val) {
    const dias = cfg.horario_dias.split(",").map(Number).filter(d => !isNaN(d));
    const next = dias.includes(val) ? dias.filter(d => d !== val) : [...dias, val].sort((a, b) => a - b);
    set("horario_dias", next.join(","));
  }
  const diasActivos = cfg.horario_dias.split(",").map(Number).filter(d => !isNaN(d));
  const beneficiarios = Array.isArray(cfg.beneficiarios) ? cfg.beneficiarios : [];
  function isEditing(idx) { return editingBenef.includes(idx); }
  function toggleEditBenef(idx) { setEditingBenef(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]); }
  function setBenef(idx, key, val) { set("beneficiarios", beneficiarios.map((b, i) => i === idx ? { ...b, [key]: val } : b)); }
  function addBenef() {
    const newIdx = beneficiarios.length;
    set("beneficiarios", [...beneficiarios, { nombre: "", tokens: "", nodos: "todos", pasarela: "" }]);
    setEditingBenef(prev => [...prev, newIdx]);
  }
  function removeBenef(idx) { set("beneficiarios", beneficiarios.filter((_, i) => i !== idx)); }

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#6b7280", fontSize: 14 }}>Cargando configuración...</div>;
  if (loadError) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ color: "#dc2626", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>No se pudo cargar la configuración del bot nuevo.</div>
      <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>{loadError}</div>
      <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 16 }}>¿Ya corriste el SQL que crea la tabla bot_pagos_v3_config?</div>
      <button onClick={load} style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Reintentar</button>
    </div>
  );

  return (
    <div style={{ padding: "24px 28px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: cfg.bot_activo ? "#dcfce7" : "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Radio size={20} color={cfg.bot_activo ? "#16a34a" : "#dc2626"} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>Bot Pagos v3 — configuración independiente</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>No comparte nada con la configuración del bot actual (n8n). Separado a propósito.</div>
          </div>
        </div>
        <button onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 9, border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, background: saving ? "#a5b4fc" : "#6366f1", color: "#fff" }}>
          <Save size={15} /> {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {msg && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, background: msg.type === "ok" ? "#f0fdf4" : "#fef2f2", color: msg.type === "ok" ? "#166534" : "#991b1b", border: `1px solid ${msg.type === "ok" ? "#bbf7d0" : "#fecaca"}`, fontSize: 13, fontWeight: 600 }}>
          {msg.text}
        </div>
      )}

      {/* Inboxes de prueba */}
      <div style={card}>
        <div style={cardTitle()}><Radio size={16} color="#16a34a" /> Inboxes de prueba</div>
        <div style={infoBanner(cfg.inboxes_prueba ? "green" : "red")}>
          {cfg.inboxes_prueba ? "✅ El bot SOLO procesa mensajes de estos inboxes." : "⚠️ Vacío: el bot no procesa NINGÚN mensaje todavía."}
        </div>
        <TagInput values={(cfg.inboxes_prueba || "").split(",").map(s => s.trim()).filter(Boolean)} onChange={arr => set("inboxes_prueba", arr.join(", "))} placeholder="Nombre exacto del inbox..." />

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={cargarInboxes}
            disabled={cargandoInboxes}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 7, border: "1px solid #6366f1", background: "#fff", color: "#6366f1", fontSize: 12, fontWeight: 600, cursor: cargandoInboxes ? "wait" : "pointer" }}
          >
            <RefreshCw size={13} /> {cargandoInboxes ? "Cargando..." : "Ver inboxes reales de Chatwoot"}
          </button>
          {errorInboxes && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{errorInboxes}</div>}
          {inboxesDisponibles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {inboxesDisponibles.map((ib) => {
                const yaAgregado = (cfg.inboxes_prueba || "").split(",").map(s => s.trim()).includes(ib.nombre);
                return (
                  <button
                    key={ib.id}
                    disabled={yaAgregado}
                    onClick={() => {
                      const actuales = (cfg.inboxes_prueba || "").split(",").map(s => s.trim()).filter(Boolean);
                      set("inboxes_prueba", [...actuales, ib.nombre].join(", "));
                    }}
                    style={{
                      padding: "5px 10px", borderRadius: 999, fontSize: 12, cursor: yaAgregado ? "default" : "pointer",
                      border: "1px solid #d1d5db", background: yaAgregado ? "#f3f4f6" : "#eef2ff",
                      color: yaAgregado ? "#9ca3af" : "#4338ca",
                    }}
                  >
                    {yaAgregado ? "✓ " : "+ "}{ib.nombre}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bandeja de Ventas -- la del numero que va en publicidad. Un
          numero NO identificado como cliente que escribe aqui entra al
          "Modo Ventas" (persona de vendedora experta, ver
          procesarVentas en server.mjs) en vez del router normal. Si ya
          es cliente real, sigue el flujo normal igual. */}
      <div style={card}>
        <div style={cardTitle()}><Wifi size={16} color="#16a34a" /> Bandeja de Ventas (publicidad)</div>
        <label style={lbl}>Nombre exacto del inbox en Chatwoot</label>
        <input type="text" value={cfg.inbox_ventas} onChange={e => set("inbox_ventas", e.target.value)} style={inp} placeholder="DIM Ventas" />
        <div style={hint}>Un número no identificado como cliente que escriba a esta bandeja recibe trato de prospecto nuevo (modo ventas: planes/precios, sin sonar a IA genérica). Si ya es cliente real, se le atiende normal.</div>

        <div style={{ marginTop: 10 }}>
          <button
            onClick={cargarInboxes}
            disabled={cargandoInboxes}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 7, border: "1px solid #6366f1", background: "#fff", color: "#6366f1", fontSize: 12, fontWeight: 600, cursor: cargandoInboxes ? "wait" : "pointer" }}
          >
            <RefreshCw size={13} /> {cargandoInboxes ? "Cargando..." : "Ver inboxes reales de Chatwoot"}
          </button>
          {errorInboxes && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{errorInboxes}</div>}
          {inboxesDisponibles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {inboxesDisponibles.map((ib) => {
                const seleccionado = cfg.inbox_ventas === ib.nombre;
                return (
                  <button
                    key={ib.id}
                    disabled={seleccionado}
                    onClick={() => set("inbox_ventas", ib.nombre)}
                    style={{
                      padding: "5px 10px", borderRadius: 999, fontSize: 12, cursor: seleccionado ? "default" : "pointer",
                      border: "1px solid #d1d5db", background: seleccionado ? "#f3f4f6" : "#eef2ff",
                      color: seleccionado ? "#9ca3af" : "#4338ca",
                    }}
                  >
                    {seleccionado ? "✓ " : "+ "}{ib.nombre}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e5e7eb" }}>
          <label style={lbl}>Números de prueba (forzar trato de prospecto aunque ya sean clientes)</label>
          <TagInput values={(cfg.telefonos_prueba_prospecto || "").split(",").map(s => s.trim()).filter(Boolean)} onChange={arr => set("telefonos_prueba_prospecto", arr.join(", "))} placeholder="949529785" />
          <div style={hint}>Solo para pruebas del Modo Ventas sin usar un número real desconocido — no modifica ningún dato del cliente real.</div>
        </div>
      </div>

      {/* Estado */}
      <div style={card}>
        <div style={cardTitle()}><Power size={16} color={cfg.bot_activo ? "#16a34a" : "#dc2626"} /> Estado</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{cfg.bot_activo ? "Activo (dentro de los inboxes de prueba, en modo sombra en el servidor)." : "Inactivo — no procesa nada."}</div>
          <button onClick={() => set("bot_activo", !cfg.bot_activo)} style={{ width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", background: cfg.bot_activo ? "#16a34a" : "#d1d5db", position: "relative", flexShrink: 0, marginLeft: 16 }}>
            <span style={{ position: "absolute", top: 3, left: cfg.bot_activo ? 27 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={lbl}>Modo</label>
          <div style={{ display: "flex", gap: 10 }}>
            {[{ val: "ia", label: "🤖 Agente IA" }, { val: "lista", label: "📋 Menú lista (no implementado aún)" }].map(opt => (
              <button key={opt.val} onClick={() => set("modo_bot", opt.val)} disabled={opt.val === "lista"} style={{ flex: 1, padding: "10px 12px", borderRadius: 9, cursor: opt.val === "lista" ? "not-allowed" : "pointer", textAlign: "left", border: cfg.modo_bot === opt.val ? "2px solid #6366f1" : "2px solid #e5e7eb", background: opt.val === "lista" ? "#f9fafb" : (cfg.modo_bot === opt.val ? "#eef2ff" : "#fff"), opacity: opt.val === "lista" ? 0.6 : 1, fontSize: 13, fontWeight: 600, color: cfg.modo_bot === opt.val ? "#4f46e5" : "#374151" }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Horario */}
      <div style={card}>
        <div style={cardTitle()}><Clock size={16} color="#6366f1" /> Horario (solo para escalar a un humano -- pagos sigue 24/7)</div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Días activos</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DIAS.map(d => {
              const activo = diasActivos.includes(d.val);
              return <button key={d.val} onClick={() => toggleDia(d.val)} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, border: activo ? "2px solid #6366f1" : "2px solid #e5e7eb", background: activo ? "#eef2ff" : "#f9fafb", color: activo ? "#4f46e5" : "#6b7280", fontWeight: activo ? 700 : 500 }}>{d.label}</button>;
            })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Desde</label>
            <select value={cfg.horario_inicio} onChange={e => set("horario_inicio", Number(e.target.value))} style={inp}>{HORAS.map(h => <option key={h.val} value={h.val}>{h.label}</option>)}</select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Hasta</label>
            <select value={cfg.horario_fin} onChange={e => set("horario_fin", Number(e.target.value))} style={inp}>{HORAS.map(h => <option key={h.val} value={h.val}>{h.label}</option>)}</select>
          </div>
        </div>
      </div>

      {/* Mensajes */}
      <div style={card}>
        <div style={cardTitle()}><MessageSquare size={16} color="#6366f1" /> Mensajes</div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Al escalar a un asesor (dentro de horario)</label>
          <textarea value={cfg.mensaje_espera_asesor} onChange={e => set("mensaje_espera_asesor", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} />
        </div>
        <div>
          <label style={lbl}>Fuera de horario</label>
          <textarea value={cfg.mensaje_fuera_horario} onChange={e => set("mensaje_fuera_horario", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} />
        </div>
      </div>

      {/* Validación de pagos / beneficiarios */}
      <div style={card}>
        <div style={cardTitle()}><ShieldCheck size={16} color="#6366f1" /> Beneficiarios válidos</div>
        <div style={{ ...hint, marginBottom: 14 }}>Nombres aceptados en comprobantes. Acepta si detecta al menos 2 de los tokens en el comprobante, y el nodo del cliente coincide.</div>
        {beneficiarios.map((b, idx) => {
          const editing = isEditing(idx);
          const readonlyInp = { ...inp, background: "#f9fafb", color: "#6b7280", cursor: "default", border: "1px solid #f3f4f6" };
          return (
            <div key={idx} style={{ border: `1px solid ${editing ? "#6366f1" : "#e5e7eb"}`, borderRadius: 10, padding: 14, marginBottom: 10, background: editing ? "#fafafe" : "#fdfdfd" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>Beneficiario {idx + 1} {!editing && <Lock size={11} color="#d1d5db" />}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => toggleEditBenef(idx)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: editing ? "#eef2ff" : "#f3f4f6", color: editing ? "#4f46e5" : "#374151" }}>
                    {editing ? <><CheckCircle size={12} /> Listo</> : <><Pencil size={12} /> Editar</>}
                  </button>
                  {editing && <button onClick={() => { removeBenef(idx); setEditingBenef(prev => prev.filter(i => i !== idx)); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", padding: 4 }}><Trash2 size={14} /></button>}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><label style={lbl}>Nombre completo</label><input type="text" value={b.nombre} onChange={e => editing && setBenef(idx, "nombre", e.target.value)} readOnly={!editing} style={editing ? inp : readonlyInp} /></div>
                <div><label style={lbl}>Pasarela Mikrowisp</label><input type="text" value={b.pasarela || ""} onChange={e => editing && setBenef(idx, "pasarela", e.target.value)} readOnly={!editing} style={editing ? inp : readonlyInp} /></div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Tokens de validación</label>
                {editing ? (
                  <TagInput values={Array.isArray(b.tokens) ? b.tokens : String(b.tokens || "").split(",").map(t => t.trim()).filter(Boolean)} onChange={arr => setBenef(idx, "tokens", arr)} placeholder="walter" />
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                    {(Array.isArray(b.tokens) ? b.tokens : String(b.tokens || "").split(",").map(t => t.trim()).filter(Boolean)).map((t, ti) => <span key={ti} style={{ padding: "2px 8px", borderRadius: 5, background: "#f3f4f6", border: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280" }}>{t}</span>)}
                  </div>
                )}
              </div>
              <div><label style={lbl}>Nodos válidos</label><input type="text" value={b.nodos} onChange={e => editing && setBenef(idx, "nodos", e.target.value)} readOnly={!editing} style={editing ? inp : readonlyInp} placeholder="todos  ó  1,2,3,5" /></div>
            </div>
          );
        })}
        <button onClick={addBenef} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", width: "100%", padding: "9px 16px", borderRadius: 8, border: "2px dashed #c7d2fe", background: "#eef2ff", color: "#4f46e5", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <Plus size={14} /> Agregar beneficiario
        </button>
        <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Antigüedad máx. comprobante (días)</label>
            <input type="number" min={1} max={30} value={cfg.comprobante_dias_max} onChange={e => set("comprobante_dias_max", Number(e.target.value))} style={{ ...inp, width: 90 }} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={lbl}>Bancos con excepción de año (corrige automático)</label>
          <TagInput values={(cfg.bancos_excepcion_anio || "").split(",").map(s => s.trim()).filter(Boolean)} onChange={arr => set("bancos_excepcion_anio", arr.join(", "))} placeholder="Scotiabank" />
        </div>
      </div>

      {/* Métodos de pago */}
      <div style={card}>
        <div style={cardTitle()}><Banknote size={16} color="#6366f1" /> Métodos de pago</div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>Americanet — bloque 1</label><textarea value={cfg.amer_metodos_1} onChange={e => set("amer_metodos_1", e.target.value)} rows={5} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 13 }} /></div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>Americanet — bloque 2</label><textarea value={cfg.amer_metodos_2} onChange={e => set("amer_metodos_2", e.target.value)} rows={5} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 13 }} /></div>
        <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Nod-06 Yape número</label><input type="text" value={cfg.nod06_yape_numero} onChange={e => set("nod06_yape_numero", e.target.value)} style={inp} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Nod-06 Yape titular</label><input type="text" value={cfg.nod06_yape_titular} onChange={e => set("nod06_yape_titular", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Nod-06 BCP cuenta</label><input type="text" value={cfg.nod06_bcp_cuenta} onChange={e => set("nod06_bcp_cuenta", e.target.value)} style={inp} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Nod-06 BCP titular</label><input type="text" value={cfg.nod06_bcp_titular} onChange={e => set("nod06_bcp_titular", e.target.value)} style={inp} /></div>
        </div>
      </div>

      {/* Planes de internet/TV -- unico texto, no varia por marca/nodo (a
          diferencia de metodos de pago arriba) -- lo responde el Modo IA
          incluso a contactos nuevos sin cuenta identificada todavia. */}
      <div style={card}>
        <div style={cardTitle()}><Wifi size={16} color="#6366f1" /> Planes de internet / TV</div>
        <label style={lbl}>Texto que responde el bot (planes, precios, pantallas, canales)</label>
        <textarea value={cfg.planes_tv} onChange={e => set("planes_tv", e.target.value)} rows={8} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 13 }} />
        <div style={hint}>Se usa tal cual, con emojis y saltos de línea. Si queda vacío, el bot deriva a un asesor en vez de inventar planes/precios.</div>
      </div>

      {/* Promoción -- solo se usa en el Modo Ventas (ver procesarVentas en
          server.mjs), Carla la menciona con naturalidad cuando tiene
          sentido, nunca en cada mensaje. */}
      <div style={card}>
        <div style={cardTitle()}><Gift size={16} color={cfg.promocion_activa ? "#16a34a" : "#9ca3af"} /> Promoción (solo bandeja de Ventas)</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{cfg.promocion_activa ? "Activa — Carla la menciona cuando tiene sentido." : "Inactiva — Carla no la menciona."}</div>
          <button onClick={() => set("promocion_activa", !cfg.promocion_activa)} style={{ width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", background: cfg.promocion_activa ? "#16a34a" : "#d1d5db", position: "relative", flexShrink: 0, marginLeft: 16 }}>
            <span style={{ position: "absolute", top: 3, left: cfg.promocion_activa ? 27 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </button>
        </div>
        <label style={lbl}>Texto de la promoción</label>
        <textarea value={cfg.promocion_texto} onChange={e => set("promocion_texto", e.target.value)} rows={5} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 13 }} />
        <div style={hint}>Describe también a qué plan(es) aplica y la condición (ej. prepago) — Carla lo usa tal cual para explicarlo si el cliente pregunta.</div>
      </div>

      {/* Notificación / equipos */}
      <div style={card}>
        <div style={cardTitle()}><Bell size={16} color="#6366f1" /> Notificación al grupo + equipos Chatwoot</div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Grupo de WhatsApp (formato Evolution API)</label>
          <input type="text" value={cfg.notif_grupo_principal} onChange={e => set("notif_grupo_principal", e.target.value)} style={inp} placeholder="120363420240336066@g.us" />
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}><label style={lbl}>ID equipo Soporte</label><input type="number" value={cfg.equipo_soporte_id || ""} onChange={e => set("equipo_soporte_id", Number(e.target.value))} style={{ ...inp, width: 90 }} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>ID equipo Pagos</label><input type="number" value={cfg.equipo_pagos_id || ""} onChange={e => set("equipo_pagos_id", Number(e.target.value))} style={{ ...inp, width: 90 }} /></div>
        </div>
      </div>

      {/* Prórroga */}
      <div style={card}>
        <div style={cardTitle()}><CalendarClock size={16} color="#6366f1" /> Prórroga de pago</div>
        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Días máx. (activo)</label><input type="number" min={1} max={10} value={cfg.prorroga_max_dias_activo} onChange={e => set("prorroga_max_dias_activo", Number(e.target.value))} style={{ ...inp, width: 90 }} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Días máx. (suspendido)</label><input type="number" min={1} max={10} value={cfg.prorroga_max_dias_suspendido} onChange={e => set("prorroga_max_dias_suspendido", Number(e.target.value))} style={{ ...inp, width: 90 }} /></div>
        </div>
        <div>
          <label style={lbl}>Prórrogas consecutivas máximas (la siguiente escala)</label>
          <input type="number" min={1} max={10} value={cfg.prorroga_max_consecutivos} onChange={e => set("prorroga_max_consecutivos", Number(e.target.value))} style={{ ...inp, width: 90 }} />
          <div style={hint}>Tope duro absoluto: 10 días, sin importar lo que se configure aquí.</div>
        </div>
      </div>

      {/* Avería */}
      <div style={card}>
        <div style={cardTitle()}><AlertOctagon size={16} color={cfg.averia_activa ? "#d97706" : "#9ca3af"} /> Avería masiva (solo este bot — no afecta al bot actual)</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: cfg.averia_activa ? 14 : 0 }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{cfg.averia_activa ? "Activa — el bot responde con IA en vez de procesar normal." : "Inactiva."}</div>
          <button onClick={() => set("averia_activa", !cfg.averia_activa)} style={{ width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", background: cfg.averia_activa ? "#d97706" : "#d1d5db", position: "relative", flexShrink: 0, marginLeft: 16 }}>
            <span style={{ position: "absolute", top: 3, left: cfg.averia_activa ? 27 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </button>
        </div>
        {cfg.averia_activa && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Contexto</label>
              <textarea value={cfg.averia_contexto} onChange={e => set("averia_contexto", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} />
            </div>
            <div>
              <label style={lbl}>Tiempo estimado</label>
              <input type="text" value={cfg.averia_tiempo_estimado} onChange={e => set("averia_tiempo_estimado", e.target.value)} style={inp} placeholder="2 horas" />
            </div>
          </>
        )}
      </div>

      {/* Timeout de escalamiento */}
      <div style={card}>
        <div style={cardTitle()}><Users size={16} color="#6366f1" /> Timeout de escalamiento</div>
        <label style={lbl}>Minutos antes de volver a avisar si nadie atiende</label>
        <input type="number" min={1} max={120} value={cfg.pagos_timeout_escalar_min} onChange={e => set("pagos_timeout_escalar_min", Number(e.target.value))} style={{ ...inp, width: 90 }} />
      </div>
    </div>
  );
}
