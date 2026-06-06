import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Bot, Zap, AlertTriangle, CheckCircle, Power, PowerOff, Radio, List, Sparkles, CreditCard, Plus, X } from "lucide-react";

const DEFAULT_CONFIG = {
  bot_activo: true,
  averia_activa: false,
  averia_contexto: "",
  averia_tiempo_estimado: "",
  modo_bot: "lista",
  pago_rapido_activo: false,
  pago_rapido_inboxes: [],
};

const NODOS = [1, 2, 3, 4, 5, 6];
const NODO_LABELS = { 1:"Nod_01",2:"Nod_02",3:"Nod_03",4:"Nod_04",5:"Nod_04",6:"Nod_05" };
const nodoLabel = (n) => NODO_LABELS[n] || `Nod_0${n}`;

// ── Estilos ──────────────────────────────────────────────────────────────
const card = (extra = {}) => ({
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "20px 22px",
  marginBottom: 14,
  ...extra,
});

const cardTitle = {
  fontSize: 14, fontWeight: 700, color: "#111827",
  display: "flex", alignItems: "center", gap: 8,
  marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #f3f4f6",
};

const inp = {
  width: "100%", padding: "9px 12px", border: "1px solid #d1d5db",
  borderRadius: 8, fontSize: 13, color: "#111827",
  fontFamily: "inherit", boxSizing: "border-box", outline: "none",
};

const hint = { fontSize: 12, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 };

function Toggle({ on, onChange, disabled, colorOn = "#16a34a", colorOff = "#d1d5db" }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 52, height: 28, borderRadius: 14, border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: on ? colorOn : colorOff,
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 27 : 3,
        width: 22, height: 22, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

function InboxTags({ values, onAdd, onRemove }) {
  const [val, setVal] = useState("");
  function add() {
    const v = val.trim();
    if (!v || values.includes(v)) return;
    onAdd(v); setVal("");
  }
  return (
    <div>
      {values.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {values.map((v, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#ede9fe", border: "1px solid #c4b5fd", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "#5b21b6", fontWeight: 500 }}>
              {v}
              <button onClick={() => onRemove(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", fontSize: 15, lineHeight: 1, padding: "0 1px" }}>×</button>
            </span>
          ))}
        </div>
      )}
      {values.length === 0 && (
        <p style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic", margin: "0 0 8px" }}>Sin bandejas — agrega al menos una</p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text" value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Nombre exacto de bandeja..."
          style={{ ...inp, flex: 1 }}
        />
        <button onClick={add} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          + Agregar
        </button>
      </div>
    </div>
  );
}

export default function BotControlPanel() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [sectores, setSectores] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingNodo, setSavingNodo] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: cfg, error: e1 }, { data: secs, error: e2 }] = await Promise.all([
        supabase.from("bot_config").select("*").eq("id", 1).maybeSingle(),
        supabase.from("averias_sectores").select("*").order("nodo"),
      ]);
      if (e1) throw e1; if (e2) throw e2;
      if (cfg) setConfig(cfg);
      if (secs) {
        const map = {};
        secs.forEach(s => { map[s.nodo] = s; });
        setSectores(map);
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error al cargar: " + e.message });
    } finally { setLoading(false); }
  }

  async function save(patch) {
    setSaving(true); setMsg(null);
    const next = { ...config, ...patch };
    try {
      const { error } = await supabase.from("bot_config").upsert({ id: 1, ...next }, { onConflict: "id" });
      if (error) throw error;
      setConfig(next);
      setMsg({ type: "ok", text: "✓ Guardado" });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg({ type: "error", text: "Error: " + e.message });
    } finally { setSaving(false); }
  }

  async function saveNodo(nodo, patch) {
    setSavingNodo(nodo);
    const current = sectores[nodo] || { nodo, averia_activa: false, contexto: "", tiempo_estimado: "" };
    const next = { ...current, ...patch };
    try {
      const { error } = await supabase.from("averias_sectores").upsert({ ...next, nodo }, { onConflict: "nodo" });
      if (error) throw error;
      setSectores(prev => ({ ...prev, [nodo]: next }));
      setMsg({ type: "ok", text: `✓ ${nodoLabel(nodo)} guardado` });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: "error", text: "Error: " + e.message });
    } finally { setSavingNodo(null); }
  }

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#6b7280", fontSize: 14 }}>Cargando...</div>;

  const averiaActiva = config.averia_activa === true;
  const pagoRapido   = config.pago_rapido_activo === true;
  const modoIA       = config.modo_bot === "ia";
  const botActivo    = config.bot_activo !== false;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: botActivo ? "#dcfce7" : "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bot size={22} color={botActivo ? "#16a34a" : "#dc2626"} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>Control del Bot</div>
            <div style={{ fontSize: 12, color: botActivo ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
              {botActivo ? "● Activo" : "● Inactivo"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: modoIA ? "#f5f3ff" : "#eef2ff", color: modoIA ? "#6d28d9" : "#4f46e5", border: `1px solid ${modoIA ? "#ddd6fe" : "#c7d2fe"}` }}>
            {modoIA ? "🤖 IA" : "📋 Lista"}
          </span>
          {averiaActiva && <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>⚠️ Avería</span>}
          {pagoRapido   && <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>⚡ Pago rápido</span>}
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600, background: msg.type === "ok" ? "#f0fdf4" : "#fef2f2", color: msg.type === "ok" ? "#166534" : "#991b1b", border: `1px solid ${msg.type === "ok" ? "#bbf7d0" : "#fecaca"}` }}>
          {msg.text}
        </div>
      )}

      {/* ── Bot ON/OFF ── */}
      <div style={card()}>
        <div style={cardTitle}>
          <Power size={15} color={botActivo ? "#16a34a" : "#dc2626"} /> Estado del bot
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, color: "#6b7280", flex: 1, marginRight: 16 }}>
            {botActivo ? "Respondiendo mensajes automáticamente." : "Bot detenido — los mensajes van directo a asesores."}
          </div>
          <Toggle on={botActivo} onChange={() => save({ bot_activo: !botActivo })} disabled={saving} />
        </div>
        {!botActivo && (
          <div style={{ marginTop: 12, padding: "9px 13px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12, color: "#991b1b" }}>
            ⚠️ Bot desactivado. Los clientes no recibirán respuesta automática.
          </div>
        )}
      </div>

      {/* ── Modo ── */}
      <div style={card()}>
        <div style={cardTitle}>
          <Sparkles size={15} color="#7c3aed" /> Modo de atención
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { val: "lista", icon: <List size={18} />, label: "Lista Interactiva", desc: "Menú numerado clásico. El cliente navega paso a paso.", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
            { val: "ia",    icon: <Sparkles size={18} />, label: "Asistente IA", desc: "Conversación natural. La IA entiende y resuelve sin menús.", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
          ].map(opt => (
            <button
              key={opt.val}
              onClick={() => save({ modo_bot: opt.val })}
              disabled={saving || config.modo_bot === opt.val}
              style={{
                padding: "14px", borderRadius: 10, textAlign: "left", cursor: config.modo_bot === opt.val ? "default" : "pointer",
                border: `2px solid ${config.modo_bot === opt.val ? opt.border : "#e5e7eb"}`,
                background: config.modo_bot === opt.val ? opt.bg : "#f9fafb",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ color: config.modo_bot === opt.val ? opt.color : "#9ca3af" }}>{opt.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: config.modo_bot === opt.val ? opt.color : "#374151" }}>{opt.label}</span>
                {config.modo_bot === opt.val && (
                  <span style={{ marginLeft: "auto", background: opt.color, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 7px" }}>ACTIVO</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        {modoIA && (
          <div style={{ padding: "9px 13px", borderRadius: 8, background: "#fef3c7", border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
            ⚡ <b>Modo IA activo:</b> el agente responde en lenguaje natural, accede a datos del cliente y escala si no puede resolver.
          </div>
        )}
      </div>

      {/* ── Pago Rápido ── */}
      <div style={card({ borderColor: pagoRapido ? "#6ee7b7" : "#e5e7eb", background: pagoRapido ? "#f0fdf4" : "#fff" })}>
        <div style={cardTitle}>
          <CreditCard size={15} color={pagoRapido ? "#059669" : "#6b7280"} /> Validación rápida de pagos
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: pagoRapido ? 14 : 0 }}>
          <div style={{ fontSize: 13, color: "#6b7280", flex: 1, marginRight: 16 }}>
            {pagoRapido ? "Detecta comprobantes automáticamente y registra el pago sin pasar por el agente." : "Valida comprobantes con Vision directamente, sin usar el agente IA."}
          </div>
          <Toggle on={pagoRapido} onChange={() => save({ pago_rapido_activo: !pagoRapido })} disabled={saving} colorOn="#059669" />
        </div>
        {pagoRapido && (
          <>
            <div style={{ padding: "9px 13px", borderRadius: 8, background: "#d1fae5", border: "1px solid #6ee7b7", fontSize: 12, color: "#065f46", marginBottom: 14 }}>
              ⚡ <b>Flujo activo:</b> imagen detectada → Vision analiza → si es comprobante válido → registra en Mikrowisp → confirma al cliente → resuelve en 5 min.
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>📥 Bandejas permitidas</div>
              <div style={hint}>Solo estas bandejas procesarán comprobantes con Pago Rápido.</div>
              <div style={{ marginTop: 10 }}>
                <InboxTags
                  values={config.pago_rapido_inboxes || []}
                  onAdd={v => save({ pago_rapido_inboxes: [...(config.pago_rapido_inboxes || []), v] })}
                  onRemove={i => save({ pago_rapido_inboxes: (config.pago_rapido_inboxes || []).filter((_, j) => j !== i) })}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Avería masiva ── */}
      <div style={card({ borderColor: averiaActiva ? "#fca5a5" : "#e5e7eb", background: averiaActiva ? "#fff7f7" : "#fff" })}>
        <div style={cardTitle}>
          <AlertTriangle size={15} color={averiaActiva ? "#dc2626" : "#f59e0b"} /> Avería masiva
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: averiaActiva ? "#dc2626" : "#6b7280", fontWeight: averiaActiva ? 600 : 400, flex: 1, marginRight: 16 }}>
            {averiaActiva ? "⚠️ Modo avería activo — la IA responde con el contexto configurado." : "Sin averías activas."}
          </div>
          <Toggle on={averiaActiva} onChange={() => save({ averia_activa: !averiaActiva })} disabled={saving} colorOn="#dc2626" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Contexto para la IA
          </label>
          <textarea
            value={config.averia_contexto}
            onChange={e => setConfig(prev => ({ ...prev, averia_contexto: e.target.value }))}
            placeholder="Ej: Fibra cortada en Av. Larco sector norte. Equipo técnico en campo."
            rows={3}
            style={{ ...inp, resize: "vertical" }}
          />
          <div style={hint}>Describe la situación en lenguaje simple. La IA generará respuestas empáticas.</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Tiempo estimado <span style={{ color: "#9ca3af", fontWeight: 400, textTransform: "none" }}>(opcional — solo si tienes certeza)</span>
          </label>
          <input
            type="text"
            value={config.averia_tiempo_estimado || ""}
            onChange={e => setConfig(prev => ({ ...prev, averia_tiempo_estimado: e.target.value }))}
            placeholder="Ej: 2 horas  /  antes del mediodía  /  esta tarde"
            style={inp}
          />
          <div style={hint}>Si no lo sabes con certeza, déjalo vacío para que la IA no invente tiempos.</div>
        </div>

        <button
          onClick={() => save({})}
          disabled={saving}
          style={{ padding: "9px 20px", borderRadius: 8, border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13, background: "#6366f1", color: "#fff", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Guardando..." : "Guardar contexto"}
        </button>
      </div>

      {/* ── Averías por nodo ── */}
      <div style={card()}>
        <div style={cardTitle}>
          <Radio size={15} color="#0891b2" /> Averías por nodo / sector
        </div>
        <p style={{ ...hint, marginBottom: 14 }}>
          Activa una avería en un nodo específico. El bot responde automáticamente a clientes de ese sector que reporten sin servicio.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {NODOS.map(nodo => {
            const s = sectores[nodo] || { averia_activa: false, contexto: "", tiempo_estimado: "" };
            const activa = s.averia_activa === true;
            return (
              <div key={nodo} style={{ border: `1px solid ${activa ? "#fca5a5" : "#e5e7eb"}`, borderRadius: 10, padding: 14, background: activa ? "#fff7f7" : "#fafafa" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: activa ? 10 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: activa ? "#dc2626" : "#d1d5db" }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{nodoLabel(nodo)}</span>
                    {activa && <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 500 }}>Avería</span>}
                  </div>
                  <button
                    onClick={() => saveNodo(nodo, { averia_activa: !activa })}
                    disabled={savingNodo === nodo}
                    style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: savingNodo === nodo ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 12, background: activa ? "#dcfce7" : "#fee2e2", color: activa ? "#16a34a" : "#dc2626" }}
                  >
                    {activa ? "Resolver" : "Activar"}
                  </button>
                </div>

                {activa && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <textarea
                      value={s.contexto || ""}
                      onChange={e => setSectores(prev => ({ ...prev, [nodo]: { ...s, contexto: e.target.value } }))}
                      placeholder="Contexto (ej: fibra cortada en calle X)"
                      rows={2}
                      style={{ ...inp, resize: "vertical", fontSize: 12 }}
                    />
                    <div style={{ display: "flex", gap: 7 }}>
                      <input
                        type="text"
                        value={s.tiempo_estimado || ""}
                        onChange={e => setSectores(prev => ({ ...prev, [nodo]: { ...s, tiempo_estimado: e.target.value } }))}
                        placeholder="Tiempo estimado (opcional)"
                        style={{ ...inp, flex: 1, fontSize: 12 }}
                      />
                      <button
                        onClick={() => saveNodo(nodo, { contexto: s.contexto, tiempo_estimado: s.tiempo_estimado })}
                        disabled={savingNodo === nodo}
                        style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 12, cursor: savingNodo === nodo ? "not-allowed" : "pointer" }}
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ ...hint, marginTop: 14, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
          <b>Avería global:</b> afecta a todos los clientes. <b>Avería por nodo:</b> solo responde a clientes de ese sector cuando reportan sin servicio. La IA responde hasta 2 veces, luego escala a asesor.
        </div>
      </div>
    </div>
  );
}
