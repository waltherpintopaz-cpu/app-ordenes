import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Bot, Zap, AlertTriangle, CheckCircle, Power, PowerOff } from "lucide-react";

const DEFAULT_CONFIG = {
  bot_activo: true,
  averia_activa: false,
  averia_contexto: "",
  averia_tiempo_estimado: "",
};

export default function BotControlPanel() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bot_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if (data) setConfig(data);
    } catch (e) {
      setMsg({ type: "error", text: "Error al cargar configuración: " + e.message });
    } finally {
      setLoading(false);
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

      {/* ── Info ── */}
      <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
        <strong>Modo avería:</strong> La IA responde hasta 2 veces por conversación usando el contexto ingresado. Al tercer mensaje del cliente, escala automáticamente a un asesor.
      </div>
    </div>
  );
}
