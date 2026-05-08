import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Clock, MessageSquare, Save, CreditCard, Banknote } from "lucide-react";

const DIAS = [
  { val: 1, label: "Lun" },
  { val: 2, label: "Mar" },
  { val: 3, label: "Mié" },
  { val: 4, label: "Jue" },
  { val: 5, label: "Vie" },
  { val: 6, label: "Sáb" },
  { val: 0, label: "Dom" },
];

const HORAS = Array.from({ length: 24 }, (_, i) => ({
  val: i,
  label: `${String(i).padStart(2, "0")}:00`,
}));

const DEFAULT = {
  horario_inicio: 8,
  horario_fin: 21,
  horario_dias: "1,2,3,4,5,6",
  mensaje_fuera_horario:
    "🕐 Gracias por contactarnos.\n\nNuestro horario de atención es:\n📅 *Lunes a Sábado: 8:00 am - 9:00 pm*\n\nTu mensaje quedó registrado y un asesor te responderá cuando estemos disponibles. 🙏",
  mensaje_espera_asesor:
    "⏳ Un asesor revisará tu caso y te responderá en breve.\n\nNuestro horario es *Lunes a Sábado de 8:00 am a 9:00 pm*. 🙏",
  nod06_yape_numero: "980 196 764",
  nod06_yape_titular: "Gustavo Ramírez",
  nod06_bcp_cuenta: "21515064826092",
  nod06_bcp_cci: "00221511506482609227",
  nod06_bcp_titular: "Gustavo Ramírez",
  nod06_comprobante_numero: "+51 980 196 764",
  amer_metodos_1:
    "💳 ::::: MÉTODOS DE PAGO 01 :::::\n🏦 BCP: 215 9869509 0 24\n💰 CCI BCP: 00221500986950902425\n📱 YAPE: 961 725 715\n👤 Americanet Fiber Solutions S.A.C.",
  amer_metodos_2:
    "💳 ::::: MÉTODOS DE PAGO 02 :::::\n🏦 Interbank: 3003142688665\n🏦 BCP: 215 31452862 0 63\n🏦 Banco de la Nación: 04-088-311855\n🏦 Caja Arequipa: 00317717802100001001\n📱 YAPE/PLIN: 989 521 677\n👤 Walter Pinto P.",
  dim_metodos:
    "💳 Caja Digital Soles: 00125001202100003012\n💳 BCP Soles: 21515624156071\n📲 Yape / Plin: 950170192\n👤 Cynthia Lizbeth Huanqui Mamani",
};

const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};

const label = {
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  display: "block",
  marginBottom: 6,
};

const input = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
  color: "#111827",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const hint = { fontSize: 12, color: "#9ca3af", marginTop: 4 };

export default function BotConfigPanel() {
  const [tab, setTab] = useState("horario");
  const [cfg, setCfg] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bot_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data) setCfg({ ...DEFAULT, ...data });
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from("bot_config")
      .upsert({ id: 1, ...cfg }, { onConflict: "id" });
    if (error) setMsg({ type: "error", text: "Error: " + error.message });
    else setMsg({ type: "ok", text: "Guardado correctamente" });
    setSaving(false);
    setTimeout(() => setMsg(null), 3000);
  }

  function set(key, val) {
    setCfg((prev) => ({ ...prev, [key]: val }));
  }

  function toggleDia(val) {
    const dias = cfg.horario_dias
      .split(",")
      .map(Number)
      .filter((d) => !isNaN(d));
    const next = dias.includes(val)
      ? dias.filter((d) => d !== val)
      : [...dias, val].sort((a, b) => a - b);
    set("horario_dias", next.join(","));
  }

  const diasActivos = cfg.horario_dias
    .split(",")
    .map(Number)
    .filter((d) => !isNaN(d));

  if (loading)
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
        Cargando configuración...
      </div>
    );

  const TABS = [
    { key: "horario", label: "Horario", icon: <Clock size={15} /> },
    { key: "mensajes", label: "Mensajes", icon: <MessageSquare size={15} /> },
    { key: "metodos", label: "Métodos de pago", icon: <Banknote size={15} /> },
    { key: "nod06", label: "Pagos Nod-06", icon: <CreditCard size={15} /> },
  ];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <Clock size={22} color="#6366f1" />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>
          Configuración del Bot
        </h2>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #e5e7eb", paddingBottom: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 16px",
              border: "none",
              borderBottom: tab === t.key ? "2px solid #6366f1" : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "#6366f1" : "#6b7280",
              marginBottom: -1,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, marginBottom: 16,
          background: msg.type === "ok" ? "#f0fdf4" : "#fef2f2",
          color: msg.type === "ok" ? "#166534" : "#991b1b",
          border: `1px solid ${msg.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
          fontSize: 14,
        }}>
          {msg.text}
        </div>
      )}

      {/* ── TAB: Horario ── */}
      {tab === "horario" && (
        <>
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={16} color="#6366f1" /> Días de atención
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DIAS.map((d) => {
                const activo = diasActivos.includes(d.val);
                return (
                  <button
                    key={d.val}
                    onClick={() => toggleDia(d.val)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: activo ? "2px solid #6366f1" : "2px solid #e5e7eb",
                      background: activo ? "#eef2ff" : "#f9fafb",
                      color: activo ? "#4f46e5" : "#6b7280",
                      fontWeight: activo ? 700 : 500,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <div style={{ ...hint, marginTop: 10 }}>
              Días en que el bot atiende automáticamente. Fuera de estos días → mensaje de horario.
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16 }}>
              Horario de atención
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Desde</label>
                <select
                  value={cfg.horario_inicio}
                  onChange={(e) => set("horario_inicio", Number(e.target.value))}
                  style={{ ...input }}
                >
                  {HORAS.map((h) => (
                    <option key={h.val} value={h.val}>{h.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Hasta</label>
                <select
                  value={cfg.horario_fin}
                  onChange={(e) => set("horario_fin", Number(e.target.value))}
                  style={{ ...input }}
                >
                  {HORAS.map((h) => (
                    <option key={h.val} value={h.val}>{h.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ ...hint, marginTop: 10 }}>
              Horario actual: {HORAS.find(h => h.val === cfg.horario_inicio)?.label} – {HORAS.find(h => h.val === cfg.horario_fin)?.label} (hora Lima)
            </div>
          </div>

          <div style={card}>
            <label style={{ ...label, fontSize: 15, fontWeight: 700, color: "#111827" }}>
              Mensaje fuera de horario
            </label>
            <textarea
              value={cfg.mensaje_fuera_horario}
              onChange={(e) => set("mensaje_fuera_horario", e.target.value)}
              rows={6}
              style={{ ...input, resize: "vertical" }}
            />
            <div style={hint}>
              Este mensaje se envía automáticamente cuando el cliente escribe fuera del horario configurado.
            </div>
          </div>
        </>
      )}

      {/* ── TAB: Mensajes ── */}
      {tab === "mensajes" && (
        <>
          <div style={card}>
            <label style={{ ...label, fontSize: 15, fontWeight: 700, color: "#111827" }}>
              Mensaje al escalar a asesor
            </label>
            <textarea
              value={cfg.mensaje_espera_asesor}
              onChange={(e) => set("mensaje_espera_asesor", e.target.value)}
              rows={5}
              style={{ ...input, resize: "vertical" }}
            />
            <div style={hint}>
              Se envía cuando el bot no puede resolver el caso y transfiere a un asesor humano.
            </div>
          </div>
        </>
      )}

      {/* ── TAB: Métodos de pago ── */}
      {tab === "metodos" && (
        <>
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🌐</span> Americanet — Bloque 1
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              Primer bloque de métodos de pago que se muestra a clientes Americanet.
            </div>
            <textarea
              value={cfg.amer_metodos_1}
              onChange={(e) => set("amer_metodos_1", e.target.value)}
              rows={7}
              style={{ ...input, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
            />
          </div>

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🌐</span> Americanet — Bloque 2
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              Segundo bloque de métodos de pago que se muestra a clientes Americanet.
            </div>
            <textarea
              value={cfg.amer_metodos_2}
              onChange={(e) => set("amer_metodos_2", e.target.value)}
              rows={8}
              style={{ ...input, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
            />
          </div>

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>📡</span> DIMfiber
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              Métodos de pago para clientes DIMfiber.
            </div>
            <textarea
              value={cfg.dim_metodos}
              onChange={(e) => set("dim_metodos", e.target.value)}
              rows={5}
              style={{ ...input, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
            />
          </div>
        </>
      )}

      {/* ── TAB: Pagos Nod-06 ── */}
      {tab === "nod06" && (
        <>
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>📲</span> Yape
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Número</label>
                <input
                  type="text"
                  value={cfg.nod06_yape_numero}
                  onChange={(e) => set("nod06_yape_numero", e.target.value)}
                  style={input}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Titular</label>
                <input
                  type="text"
                  value={cfg.nod06_yape_titular}
                  onChange={(e) => set("nod06_yape_titular", e.target.value)}
                  style={input}
                />
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🏦</span> BCP
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Cuenta</label>
                <input
                  type="text"
                  value={cfg.nod06_bcp_cuenta}
                  onChange={(e) => set("nod06_bcp_cuenta", e.target.value)}
                  style={input}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Titular</label>
                <input
                  type="text"
                  value={cfg.nod06_bcp_titular}
                  onChange={(e) => set("nod06_bcp_titular", e.target.value)}
                  style={input}
                />
              </div>
            </div>
            <div>
              <label style={label}>CCI</label>
              <input
                type="text"
                value={cfg.nod06_bcp_cci}
                onChange={(e) => set("nod06_bcp_cci", e.target.value)}
                style={input}
              />
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>📩</span> Número para recibir comprobantes
            </div>
            <input
              type="text"
              value={cfg.nod06_comprobante_numero}
              onChange={(e) => set("nod06_comprobante_numero", e.target.value)}
              style={input}
              placeholder="+51 980 196 764"
            />
            <div style={hint}>
              El bot indicará a los clientes nod_06 que envíen su comprobante a este número.
            </div>
          </div>
        </>
      )}

      {/* Botón guardar */}
      <button
        onClick={save}
        disabled={saving}
        style={{
          width: "100%",
          padding: "12px 20px",
          borderRadius: 10,
          border: "none",
          cursor: saving ? "not-allowed" : "pointer",
          fontWeight: 700,
          fontSize: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: saving ? "#a5b4fc" : "#6366f1",
          color: "#fff",
        }}
      >
        <Save size={18} />
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>
    </div>
  );
}
