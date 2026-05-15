import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Bot, Zap, AlertTriangle, CheckCircle, Power, PowerOff, Radio, List, Sparkles } from "lucide-react";

const DEFAULT_CONFIG = {
  bot_activo: true,
  averia_activa: false,
  averia_contexto: "",
  averia_tiempo_estimado: "",
  modo_bot: "lista",
};

const NODOS = [1, 2, 3, 4, 5, 6];
const nodoLabel = (n) => `Nodo ${String(n).padStart(2, "0")}`;

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
      if (e1) throw e1;
      if (e2) throw e2;
      if (cfg) setConfig(cfg);
      if (secs) {
        const map = {};
        secs.forEach(s => { map[s.nodo] = s; });
        setSectores(map);
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error al cargar configuración: " + e.message });
    } finally {
      setLoading(false);
    }
  }

  async function saveNodo(nodo, patch) {
    setSavingNodo(nodo);
    const current = sectores[nodo] || { nodo, averia_activa: false, contexto: "", tiempo_estimado: "" };
    const next = { ...current, ...patch };
    try {
      const { error } = await supabase
        .from("averias_sectores")
        .upsert({ ...next, nodo }, { onConflict: "nodo" });
      if (error) throw error;
      setSectores(prev => ({ ...prev, [nodo]: next }));
      setMsg({ type: "ok", text: `${nodoLabel(nodo)} guardado` });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: "error", text: "Error: " + e.message });
    } finally {
      setSavingNodo(null);
    }
  }

  async function save(patch) {
    setSaving(true);
    setMsg(null);
    const next = { ...config, ...patch };
    try {
      const { error } = await supabase
        .from("bot_config")
        .upsert({ id: 1, ...next }, { onConflict: "id" });
      if (error) throw error;
      setConfig(next);
      setMsg({ type: "ok", text: "Guardado correctamente" });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg({ type: "error", text: "Error al guardar: " + e.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
      Cargando configuración...
    </div>
  );

  const cardStyle = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "24px",
    marginBottom: 20,
  };

  const sectionTitle = {
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <Bot size={24} color="#6366f1" />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>
          Control del Bot
        </h2>
      </div>

      {msg && (
        <div style={{
          padding: "10px 16px",
          borderRadius: 8,
          marginBottom: 16,
          background: msg.type === "ok" ? "#f0fdf4" : "#fef2f2",
          color: msg.type === "ok" ? "#166534" : "#991b1b",
          border: `1px solid ${msg.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
          fontSize: 14,
        }}>
          {msg.text}
        </div>
      )}

      {/* ── Bot ON/OFF ── */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          <Power size={18} color="#6366f1" />
          Estado del bot
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: config.bot_activo ? "#166534" : "#991b1b" }}>
              {config.bot_activo ? "✅ Bot activo" : "⛔ Bot detenido"}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              {config.bot_activo
                ? "El bot está respondiendo a los clientes normalmente."
                : "El bot no responde. Los mensajes entrantes se ignoran."}
            </div>
          </div>

          <button
            onClick={() => save({ bot_activo: !config.bot_activo })}
            disabled={saving}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: config.bot_activo ? "#fee2e2" : "#dcfce7",
              color: config.bot_activo ? "#dc2626" : "#16a34a",
            }}
          >
            {config.bot_activo
              ? <><PowerOff size={16} /> Detener bot</>
              : <><Power size={16} /> Activar bot</>}
          </button>
        </div>
      </div>

      {/* ── Modo del Bot ── */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          <Sparkles size={18} color="#7c3aed" />
          Modo de atención
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          Elige cómo responde el bot a los clientes. El cambio aplica de inmediato en las conversaciones nuevas.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Opción: Lista Interactiva */}
          <button
            onClick={() => save({ modo_bot: "lista" })}
            disabled={saving || config.modo_bot === "lista"}
            style={{
              padding: "18px 14px",
              borderRadius: 10,
              border: `2px solid ${config.modo_bot === "lista" ? "#6366f1" : "#e5e7eb"}`,
              background: config.modo_bot === "lista" ? "#eef2ff" : "#fafafa",
              cursor: config.modo_bot === "lista" ? "default" : "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <List size={20} color={config.modo_bot === "lista" ? "#6366f1" : "#9ca3af"} />
              <span style={{ fontWeight: 700, fontSize: 14, color: config.modo_bot === "lista" ? "#4338ca" : "#374151" }}>
                Lista Interactiva
              </span>
              {config.modo_bot === "lista" && (
                <span style={{ marginLeft: "auto", background: "#6366f1", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px" }}>
                  ACTIVO
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
              Menú numerado clásico (1. Pagos, 2. Soporte, 3. Consulta…). El cliente navega paso a paso por opciones fijas.
            </div>
          </button>

          {/* Opción: Asistente IA */}
          <button
            onClick={() => save({ modo_bot: "ia" })}
            disabled={saving || config.modo_bot === "ia"}
            style={{
              padding: "18px 14px",
              borderRadius: 10,
              border: `2px solid ${config.modo_bot === "ia" ? "#7c3aed" : "#e5e7eb"}`,
              background: config.modo_bot === "ia" ? "#f5f3ff" : "#fafafa",
              cursor: config.modo_bot === "ia" ? "default" : "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Sparkles size={20} color={config.modo_bot === "ia" ? "#7c3aed" : "#9ca3af"} />
              <span style={{ fontWeight: 700, fontSize: 14, color: config.modo_bot === "ia" ? "#6d28d9" : "#374151" }}>
                Asistente IA
              </span>
              {config.modo_bot === "ia" && (
                <span style={{ marginLeft: "auto", background: "#7c3aed", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px" }}>
                  ACTIVO
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
              Conversación natural con IA. El cliente escribe libremente y el agente entiende, busca su cuenta y resuelve sin menús.
            </div>
          </button>
        </div>

        {config.modo_bot === "ia" && (
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "#fef3c7", border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
            ⚡ <strong>Modo IA activo:</strong> el agente conversacional responde en lenguaje natural. Tiene acceso a datos del cliente, facturas, pagos y prórrogas. Escala a humano si no puede resolver.
          </div>
        )}
      </div>

      {/* ── Avería masiva ── */}
      <div style={{
        ...cardStyle,
        borderColor: config.averia_activa ? "#fca5a5" : "#e5e7eb",
        background: config.averia_activa ? "#fff7f7" : "#fff",
      }}>
        <div style={sectionTitle}>
          <AlertTriangle size={18} color={config.averia_activa ? "#dc2626" : "#f59e0b"} />
          Avería masiva
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: config.averia_activa ? "#dc2626" : "#374151" }}>
              {config.averia_activa ? "⚠️ Modo avería ACTIVO" : "Estado normal"}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              {config.averia_activa
                ? "La IA responde automáticamente con el contexto de la avería."
                : "Sin averías activas en este momento."}
            </div>
          </div>

          <button
            onClick={() => save({ averia_activa: !config.averia_activa })}
            disabled={saving}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: config.averia_activa ? "#dcfce7" : "#fee2e2",
              color: config.averia_activa ? "#16a34a" : "#dc2626",
            }}
          >
            {config.averia_activa
              ? <><CheckCircle size={16} /> Desactivar</>
              : <><Zap size={16} /> Activar avería</>}
          </button>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
            Contexto para la IA
          </label>
          <textarea
            value={config.averia_contexto}
            onChange={e => setConfig(prev => ({ ...prev, averia_contexto: e.target.value }))}
            placeholder="Ej: Fibra cortada en Av. Larco sector norte. Equipo técnico en campo. Tiempo estimado: 2 horas."
            rows={4}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 14,
              color: "#111827",
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
            Describe la situación en lenguaje simple. La IA generará respuestas empáticas basándose en este contexto.
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
            Tiempo estimado de solución
            <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(opcional — solo si tienes certeza)</span>
          </label>
          <input
            type="text"
            value={config.averia_tiempo_estimado || ""}
            onChange={e => setConfig(prev => ({ ...prev, averia_tiempo_estimado: e.target.value }))}
            placeholder="Ej: 2 horas  /  antes del mediodía  /  esta tarde"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 14,
              color: "#111827",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
            Si no lo sabes con certeza, déjalo vacío. La IA evitará dar tiempos cuando este campo esté vacío.
          </div>
        </div>

        <button
          onClick={() => save({})}
          disabled={saving}
          style={{
            marginTop: 12,
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
            background: "#6366f1",
            color: "#fff",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Guardando..." : "Guardar contexto"}
        </button>
      </div>

      {/* ── Averías por nodo ── */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          <Radio size={18} color="#0891b2" />
          Averías por nodo / sector
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          Activa una avería en un nodo específico. El bot responderá automáticamente a clientes de ese sector que reporten sin servicio.
        </div>

        {NODOS.map(nodo => {
          const s = sectores[nodo] || { averia_activa: false, contexto: "", tiempo_estimado: "" };
          const activa = s.averia_activa === true;
          return (
            <div key={nodo} style={{
              border: `1px solid ${activa ? "#fca5a5" : "#e5e7eb"}`,
              borderRadius: 10,
              padding: "16px",
              marginBottom: 12,
              background: activa ? "#fff7f7" : "#fafafa",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: activa ? 12 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: activa ? "#dc2626" : "#d1d5db",
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>
                    {nodoLabel(nodo)}
                  </span>
                  {activa && <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 500 }}>⚠️ Avería activa</span>}
                </div>
                <button
                  onClick={() => saveNodo(nodo, { averia_activa: !activa })}
                  disabled={savingNodo === nodo}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "none",
                    cursor: savingNodo === nodo ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                    background: activa ? "#dcfce7" : "#fee2e2",
                    color: activa ? "#16a34a" : "#dc2626",
                  }}
                >
                  {activa ? "Resolver" : "Activar"}
                </button>
              </div>

              {activa && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={s.contexto || ""}
                    onChange={e => setSectores(prev => ({ ...prev, [nodo]: { ...s, contexto: e.target.value } }))}
                    placeholder="Contexto para la IA (ej: fibra cortada en calle X)"
                    rows={2}
                    style={{
                      width: "100%", padding: "8px 10px", border: "1px solid #d1d5db",
                      borderRadius: 6, fontSize: 13, fontFamily: "inherit",
                      resize: "vertical", boxSizing: "border-box", color: "#111827"
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={s.tiempo_estimado || ""}
                      onChange={e => setSectores(prev => ({ ...prev, [nodo]: { ...s, tiempo_estimado: e.target.value } }))}
                      placeholder="Tiempo estimado (opcional)"
                      style={{
                        flex: 1, padding: "8px 10px", border: "1px solid #d1d5db",
                        borderRadius: 6, fontSize: 13, fontFamily: "inherit",
                        boxSizing: "border-box", color: "#111827"
                      }}
                    />
                    <button
                      onClick={() => saveNodo(nodo, { contexto: s.contexto, tiempo_estimado: s.tiempo_estimado })}
                      disabled={savingNodo === nodo}
                      style={{
                        padding: "8px 14px", borderRadius: 6, border: "none",
                        background: "#6366f1", color: "#fff", fontWeight: 600,
                        fontSize: 13, cursor: savingNodo === nodo ? "not-allowed" : "pointer"
                      }}
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

      {/* ── Info ── */}
      <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
        <strong>Avería global:</strong> afecta a todos los clientes. <strong>Avería por nodo:</strong> solo responde a clientes de ese sector cuando reportan sin servicio. La IA responde hasta 2 veces por conversación, luego escala a asesor.
      </div>
    </div>
  );
}
