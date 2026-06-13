import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Clock, MessageSquare, Save, CreditCard, Banknote, ShieldCheck, Plus, Trash2, Bell, History, RefreshCw, CheckCircle, XCircle, AlertTriangle, Power, AlertOctagon, Menu, Pencil, Lock, Bot, CalendarClock, Users, Settings, Zap } from "lucide-react";

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
  feriados: [],
  mensaje_fuera_horario:
    "🕐 Gracias por contactarnos.\n\nNuestro horario de atención es:\n📅 *Lunes a Sábado: 8:00 am - 9:00 pm*\n\nTu mensaje quedó registrado y un asesor te responderá cuando estemos disponibles. 🙏",
  mensaje_espera_asesor:
    "✅ Recibimos tu mensaje y un asesor te atenderá en breve. Puedes seguir escribiendo — todo queda registrado. 🙏\nNuestro horario es Lunes a Sábado, 8:00 am – 9:00 pm.",
  inboxes_excluidos: "DIM Ventas, Ventas Meta",
  nod06_yape_numero: "980 196 764",
  nod06_yape_titular: "Gustavo Ramírez",
  nod06_bcp_cuenta: "21515064826092",
  nod06_bcp_cci: "00221511506482609227",
  nod06_bcp_titular: "Gustavo Ramírez",
  nod06_comprobante_numero: "+51 980 196 764",
  notif_grupo_principal: "120363420240336066@g.us",
  notif_numeros_adicionales: "",
  beneficiarios: [
    { nombre: "Walter Ernesto Pinto Paz", tokens: "walter,ernesto,pinto,pin,paz", nodos: "todos", nodo_notificar: "", pasarela: "Walter Pinto", accion: "SI" },
    { nombre: "Americanet Fiber Solutions Sac", tokens: "americanet", nodos: "1,2,3,4,5,6,7,8,9,10", nodo_notificar: "11", pasarela: "Americanet", accion: "SI" },
    { nombre: "Cynthia Hua / Cynthia L Huanqui M", tokens: "cynthia,hua,huanqui", nodos: "5", nodo_notificar: "", pasarela: "Pagos DIM", accion: "SI" },
  ],
  horario_texto: "lunes a sábado de 8am a 9pm",
  prorroga_tolerancia_amer: 10,
  prorroga_tolerancia_dim: 14,
  prorroga_max_consecutivos: 3,
  prorroga_max_dias_activo: 10,
  prorroga_max_dias_suspendido: 3,
  equipo_soporte_id: 1,
  equipo_ventas_id: 2,
  equipo_pagos_id: 3,
  bot_agent_id: 10,
  comprobante_dias_max: 7,
  bancos_excepcion_anio: "Scotiabank",
  modo_bot: "ia",
  bot_activo: true,
  averia_activa: false,
  averia_contexto: "",
  averia_tiempo_estimado: "",
  menu_principal: "═══════════════════════════\n*Soporte en línea*\n═══════════════════════════\n¿En qué te ayudamos?\n\n1️⃣ Validar pago\n2️⃣ Métodos de pago\n3️⃣ Soporte técnico\n4️⃣ Contactar asesor\n5️⃣ Planes y servicios\n6️⃣ Prórroga de pago\n7️⃣ Mi cuenta\n\n_Responde del 1 al 7_",
  menu_opcion_invalida: "⚠️ Opción no válida. Por favor responde del *1 al 7*:\n\n1️⃣ Validar pago\n2️⃣ Métodos de pago\n3️⃣ Soporte técnico\n4️⃣ Contactar asesor\n5️⃣ Planes y servicios\n6️⃣ Prórroga de pago\n7️⃣ Mi cuenta",
  menu_micuenta: "📊 *Mi cuenta*\n\n¿Qué deseas consultar?\n\n❶ Estado de cuenta\n❷ Métodos de pago\n❸ App de TV\n❹ Volver al menú\n\n_Responde del 1 al 4 — o escribe *menu* para salir_",
  amer_metodos_1:
    "💳 ::::: MÉTODOS DE PAGO 01 :::::\n🏦 BCP: 215 9869509 0 24\n💰 CCI BCP: 00221500986950902425\n📱 YAPE: 961 725 715\n👤 Americanet Fiber Solutions S.A.C.",
  amer_metodos_2:
    "💳 ::::: MÉTODOS DE PAGO 02 :::::\n🏦 Interbank: 3003142688665\n🏦 BCP: 215 31452862 0 63\n🏦 Banco de la Nación: 04-088-311855\n🏦 Caja Arequipa: 00317717802100001001\n📱 YAPE/PLIN: 989 521 677\n👤 Walter Pinto P.",
  dim_metodos:
    "💳 Caja Digital Soles: 00125001202100003012\n💳 BCP Soles: 21515624156071\n📲 Yape / Plin: 950170192\n👤 Cynthia Lizbeth Huanqui Mamani",
  nod11_metodos:
    "📲 *Yape*\nNúmero: 980 196 764\nTitular: Gustavo Ramírez\n\n🏦 *BCP*\nCuenta: 21515064826092\nCCI: 00221511506482609227\nTitular: Gustavo Ramírez",
};

// ── Estilos base ──────────────────────────────────────────────────────────
const inp = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 13,
  color: "#111827",
  fontFamily: "inherit",
  boxSizing: "border-box",
  background: "#fff",
};

const lbl = {
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  display: "block",
  marginBottom: 5,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const hint = { fontSize: 12, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 };

const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "20px 22px",
  marginBottom: 14,
};

const cardTitle = (color = "#6366f1") => ({
  fontSize: 14,
  fontWeight: 700,
  color: "#111827",
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 16,
  paddingBottom: 12,
  borderBottom: "1px solid #f3f4f6",
});

const infoBanner = (color = "blue") => {
  const map = {
    blue:   { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" },
    yellow: { bg: "#fffbeb", border: "#fde68a", color: "#92400e" },
    green:  { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534" },
    red:    { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" },
  };
  const s = map[color] || map.blue;
  return { padding: "10px 14px", borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: 13, marginBottom: 16 };
};

const NODO_LABELS = { 1:"Nod_01",7:"Nod_01",8:"Nod_01",9:"Nod_01",2:"Nod_02",3:"Nod_03",10:"Nod_03",5:"Nod_04",6:"Nod_04",11:"Nod_06" };

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
        <input
          type="text"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none", fontFamily: "inherit", color: "#111827" }}
        />
        <button onClick={add} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          + Agregar
        </button>
      </div>
      {hintText && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 }}>{hintText}</div>}
    </div>
  );
}

const RESULTADO_STYLES = {
  SI:        { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0", icon: <CheckCircle size={13} /> },
  NO:        { bg: "#fef2f2", color: "#991b1b", border: "#fecaca", icon: <XCircle size={13} /> },
  NOTIFICAR: { bg: "#fffbeb", color: "#92400e", border: "#fde68a", icon: <AlertTriangle size={13} /> },
};

const SIDEBAR_GROUPS = [
  {
    label: "Operación",
    items: [
      { key: "estado",   label: "Estado",   icon: <Zap size={15} /> },
      { key: "horario",  label: "Horario",  icon: <Clock size={15} /> },
    ],
  },
  {
    label: "Mensajería",
    items: [
      { key: "menu",      label: "Menú",      icon: <Menu size={15} /> },
      { key: "mensajes",  label: "Mensajes",  icon: <MessageSquare size={15} /> },
    ],
  },
  {
    label: "Pagos",
    items: [
      { key: "metodos",  label: "Métodos de pago",  icon: <Banknote size={15} /> },
      { key: "nod06",    label: "Pagos Nod-06",      icon: <CreditCard size={15} /> },
      { key: "prorroga", label: "Prórrogas",          icon: <CalendarClock size={15} /> },
      { key: "pagos",    label: "Validación",         icon: <ShieldCheck size={15} /> },
    ],
  },
  {
    label: "Equipo",
    items: [
      { key: "equipos",   label: "Equipos",  icon: <Users size={15} /> },
    ],
  },
  {
    label: "Reportes",
    items: [
      { key: "historial", label: "Historial", icon: <History size={15} /> },
    ],
  },
];

export default function BotConfigPanel() {
  const [tab, setTab] = useState("estado");
  const [cfg, setCfg] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const [historial, setHistorial] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFiltro, setHistFiltro] = useState("todos");
  const [histDesde, setHistDesde] = useState("");
  const [histHasta, setHistHasta] = useState("");
  const [histPage, setHistPage] = useState(0);
  const HIST_PER_PAGE = 20;
  const [editingBenef, setEditingBenef] = useState([]);

  const loadHistorial = useCallback(async () => {
    setHistLoading(true);
    let q = supabase
      .from("bot_pagos_log")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(500);
    if (histFiltro !== "todos") q = q.eq("resultado", histFiltro);
    if (histDesde) q = q.gte("fecha", histDesde + "T00:00:00");
    if (histHasta) q = q.lte("fecha", histHasta + "T23:59:59");
    const { data, error } = await q;
    setHistPage(0);
    if (error) setMsg({ type: "error", text: "Error al cargar historial: " + error.message });
    setHistorial(data || []);
    setHistLoading(false);
  }, [histFiltro, histDesde, histHasta]);

  useEffect(() => {
    if (tab === "historial") loadHistorial();
  }, [tab, loadHistorial]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bot_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data) {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
      if (Array.isArray(clean.beneficiarios)) {
        clean.beneficiarios = clean.beneficiarios.map(b => {
          if (b.pasarela) return b;
          const def = DEFAULT.beneficiarios.find(d => d.nombre === b.nombre);
          return { ...b, pasarela: def?.pasarela || "" };
        });
      }
      setCfg({ ...DEFAULT, ...clean });
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const cfgToSave = {
      ...cfg,
      beneficiarios: (cfg.beneficiarios || []).map(b => ({
        ...b,
        tokens: Array.isArray(b.tokens)
          ? b.tokens
          : String(b.tokens || "").split(",").map(t => t.trim()).filter(Boolean),
      })),
    };
    const { error } = await supabase
      .from("bot_config")
      .upsert({ id: 1, ...cfgToSave }, { onConflict: "id" });
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
  function toggleEditBenef(idx) {
    setEditingBenef(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  }
  function setBenef(idx, key, val) {
    set("beneficiarios", beneficiarios.map((b, i) => i === idx ? { ...b, [key]: val } : b));
  }
  function addBenef() {
    const newIdx = beneficiarios.length;
    set("beneficiarios", [...beneficiarios, { nombre: "", tokens: "", nodos: "todos", nodo_notificar: "", pasarela: "", accion: "SI" }]);
    setEditingBenef(prev => [...prev, newIdx]);
  }
  function removeBenef(idx) {
    set("beneficiarios", beneficiarios.filter((_, i) => i !== idx));
  }

  if (loading)
    return <div style={{ padding: 60, textAlign: "center", color: "#6b7280", fontSize: 14 }}>Cargando configuración...</div>;

  // ── Layout ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100%", background: "#f8fafc", minHeight: 600 }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div style={{ width: 210, background: "#fff", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0 }}>

        {/* Bot status header */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: cfg.bot_activo ? "#dcfce7" : "#fee2e2",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Bot size={20} color={cfg.bot_activo ? "#16a34a" : "#dc2626"} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>Bot Pagos</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: cfg.bot_activo ? "#16a34a" : "#dc2626", marginTop: 2 }}>
                {cfg.bot_activo ? "● Activo" : "● Inactivo"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{
              padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: cfg.modo_bot === "ia" ? "#eef2ff" : "#f0fdf4",
              color: cfg.modo_bot === "ia" ? "#4f46e5" : "#16a34a",
              border: `1px solid ${cfg.modo_bot === "ia" ? "#c7d2fe" : "#bbf7d0"}`,
            }}>
              {cfg.modo_bot === "ia" ? "🤖 IA" : "📋 Lista"}
            </span>
            {cfg.averia_activa && (
              <span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
                ⚠️ Avería
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {SIDEBAR_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 4 }}>
              <div style={{ padding: "8px 16px 4px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {group.label}
              </div>
              {group.items.map(item => (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                    padding: "8px 16px", border: "none", cursor: "pointer", textAlign: "left",
                    background: tab === item.key ? "#eef2ff" : "transparent",
                    borderLeft: `3px solid ${tab === item.key ? "#6366f1" : "transparent"}`,
                    color: tab === item.key ? "#4f46e5" : "#4b5563",
                    fontWeight: tab === item.key ? 700 : 400,
                    fontSize: 13,
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Save button in sidebar */}
        {tab !== "historial" && (
          <div style={{ padding: "12px 14px", borderTop: "1px solid #f3f4f6" }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "10px 0", borderRadius: 9, border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: 13,
                background: saving ? "#a5b4fc" : "#6366f1",
                color: "#fff",
              }}
            >
              <Save size={15} />
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", maxWidth: 720 }}>

        {/* Toast */}
        {msg && (
          <div style={{
            padding: "10px 16px", borderRadius: 8, marginBottom: 16,
            background: msg.type === "ok" ? "#f0fdf4" : "#fef2f2",
            color: msg.type === "ok" ? "#166534" : "#991b1b",
            border: `1px solid ${msg.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
            fontSize: 13, fontWeight: 600,
          }}>
            {msg.text}
          </div>
        )}

        {/* ── Estado ── */}
        {tab === "estado" && (
          <>
            {/* Modo de atención */}
            <div style={card}>
              <div style={cardTitle()}>
                <Bot size={16} color="#6366f1" /> Modo de atención
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                {[
                  { val: "ia",    label: "🤖 Agente IA",    desc: "Conversación libre. La IA entiende cualquier mensaje." },
                  { val: "lista", label: "📋 Menú Lista", desc: "El cliente elige una opción numerada del menú (1-7)." },
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => set("modo_bot", opt.val)}
                    style={{
                      flex: 1, padding: "14px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                      border: cfg.modo_bot === opt.val ? "2px solid #6366f1" : "2px solid #e5e7eb",
                      background: cfg.modo_bot === opt.val ? "#eef2ff" : "#f9fafb",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: cfg.modo_bot === opt.val ? "#4f46e5" : "#374151", marginBottom: 4 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
              <div style={hint}>El cambio se aplica en máx 5 minutos.</div>
            </div>

            {/* Bot ON/OFF */}
            <div style={card}>
              <div style={cardTitle()}>
                <Power size={16} color={cfg.bot_activo ? "#16a34a" : "#dc2626"} /> Estado del bot
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {cfg.bot_activo ? "El bot está activo y respondiendo mensajes automáticamente." : "El bot está desactivado. Los mensajes irán directo a asesores."}
                </div>
                <button
                  onClick={() => set("bot_activo", !cfg.bot_activo)}
                  style={{
                    width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
                    background: cfg.bot_activo ? "#16a34a" : "#d1d5db",
                    position: "relative", transition: "background 0.2s", flexShrink: 0, marginLeft: 16,
                  }}
                >
                  <span style={{
                    position: "absolute", top: 3, left: cfg.bot_activo ? 27 : 3,
                    width: 22, height: 22, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>
              {!cfg.bot_activo && (
                <div style={{ ...infoBanner("red"), marginTop: 12, marginBottom: 0 }}>
                  ⚠️ El bot está desactivado. Guarda los cambios para que el ajuste se refleje.
                </div>
              )}
            </div>

            {/* Avería */}
            <div style={card}>
              <div style={cardTitle()}>
                <AlertOctagon size={16} color={cfg.averia_activa ? "#d97706" : "#9ca3af"} /> Modo avería masiva
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: cfg.averia_activa ? 16 : 0 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {cfg.averia_activa ? "Activo — el bot notifica a los clientes sobre la avería antes de escalar." : "Inactivo — operación normal."}
                </div>
                <button
                  onClick={() => set("averia_activa", !cfg.averia_activa)}
                  style={{
                    width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
                    background: cfg.averia_activa ? "#d97706" : "#d1d5db",
                    position: "relative", transition: "background 0.2s", flexShrink: 0, marginLeft: 16,
                  }}
                >
                  <span style={{
                    position: "absolute", top: 3, left: cfg.averia_activa ? 27 : 3,
                    width: 22, height: 22, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>
              {cfg.averia_activa && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Descripción de la avería</label>
                    <textarea
                      value={cfg.averia_contexto}
                      onChange={e => set("averia_contexto", e.target.value)}
                      rows={3}
                      style={{ ...inp, resize: "vertical" }}
                      placeholder="Ej: Avería en fibra principal sector norte. Técnicos trabajando en la solución."
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Tiempo estimado de resolución</label>
                    <input
                      type="text"
                      value={cfg.averia_tiempo_estimado}
                      onChange={e => set("averia_tiempo_estimado", e.target.value)}
                      style={inp}
                      placeholder="Ej: 2 horas, antes de las 6pm, mañana por la mañana"
                    />
                  </div>
                  <div style={infoBanner("yellow")}>
                    🔔 Con avería activa el bot informa a los clientes afectados y evita registrar pagos hasta que se resuelva.
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ── Horario ── */}
        {tab === "horario" && (
          <>
            <div style={card}>
              <div style={cardTitle()}>
                <Clock size={16} color="#6366f1" /> Días y horario de atención
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Días activos</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DIAS.map(d => {
                    const activo = diasActivos.includes(d.val);
                    return (
                      <button
                        key={d.val}
                        onClick={() => toggleDia(d.val)}
                        style={{
                          padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                          border: activo ? "2px solid #6366f1" : "2px solid #e5e7eb",
                          background: activo ? "#eef2ff" : "#f9fafb",
                          color: activo ? "#4f46e5" : "#6b7280",
                          fontWeight: activo ? 700 : 500,
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <div style={hint}>Fuera de estos días → mensaje de horario.</div>
              </div>

              <div style={{ display: "flex", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Desde</label>
                  <select value={cfg.horario_inicio} onChange={e => set("horario_inicio", Number(e.target.value))} style={inp}>
                    {HORAS.map(h => <option key={h.val} value={h.val}>{h.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Hasta</label>
                  <select value={cfg.horario_fin} onChange={e => set("horario_fin", Number(e.target.value))} style={inp}>
                    {HORAS.map(h => <option key={h.val} value={h.val}>{h.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ ...hint, marginTop: 8 }}>
                Horario actual: {HORAS.find(h => h.val === cfg.horario_inicio)?.label} – {HORAS.find(h => h.val === cfg.horario_fin)?.label} (hora Lima)
              </div>
            </div>

            <div style={card}>
              <div style={cardTitle()}>
                <MessageSquare size={16} color="#6366f1" /> Mensajes de horario
              </div>
              <div>
                <label style={lbl}>Descripción del horario (para el agente IA)</label>
                <input
                  type="text"
                  value={cfg.horario_texto}
                  onChange={e => set("horario_texto", e.target.value)}
                  style={inp}
                  placeholder="lunes a sábado de 8am a 9pm"
                />
                <div style={hint}>Texto que el agente IA menciona en conversaciones.</div>
              </div>
              <div>
                <label style={lbl}>Mensaje fuera de horario</label>
                <textarea
                  value={cfg.mensaje_fuera_horario}
                  onChange={e => set("mensaje_fuera_horario", e.target.value)}
                  rows={5}
                  style={{ ...inp, resize: "vertical" }}
                />
              </div>
            </div>

            <div style={card}>
              <div style={cardTitle()}>
                📅 Feriados
              </div>
              <div style={hint}>En estas fechas el bot responde como fuera de horario, sin importar el día de la semana.</div>
              <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
                <input type="date" id="input-feriado" style={{ ...inp, width: "auto", flex: 1 }} />
                <button
                  onClick={() => {
                    const inp2 = document.getElementById("input-feriado");
                    const val = inp2?.value;
                    if (!val) return;
                    const feriados = Array.isArray(cfg.feriados) ? cfg.feriados : [];
                    if (!feriados.includes(val)) set("feriados", [...feriados, val].sort());
                    inp2.value = "";
                  }}
                  style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  + Agregar
                </button>
              </div>
              {Array.isArray(cfg.feriados) && cfg.feriados.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {cfg.feriados.map(f => {
                    const [y, m, d] = f.split("-");
                    return (
                      <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "#f3f4f6", border: "1px solid #e5e7eb", fontSize: 13, color: "#374151" }}>
                        📅 {d}/{m}/{y}
                        <button onClick={() => set("feriados", cfg.feriados.filter(x => x !== f))} style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", padding: 0, fontSize: 15 }}>×</button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#9ca3af" }}>Sin feriados configurados.</div>
              )}
            </div>
          </>
        )}

        {/* ── Menú ── */}
        {tab === "menu" && (
          <>
            <div style={infoBanner("blue")}>
              💡 Usa <b>*texto*</b> para negrita y <b>_texto_</b> para cursiva (formato WhatsApp). Los cambios se reflejan en máx 5 min.
            </div>

            {[
              { key: "menu_principal",    title: "Menú principal",        desc: "Se muestra cuando el cliente escribe por primera vez o escribe 'menu'.", rows: 12 },
              { key: "menu_micuenta",     title: "Menú Mi cuenta",         desc: "Se muestra cuando el cliente elige la opción 7 (Mi cuenta).",              rows: 10 },
              { key: "menu_opcion_invalida", title: "Mensaje opción inválida", desc: "Se muestra cuando el cliente responde algo que no es una opción del menú.",  rows: 10 },
            ].map(item => (
              <div key={item.key} style={card}>
                <div style={cardTitle()}>
                  <Menu size={16} color="#6366f1" /> {item.title}
                </div>
                <div style={{ ...hint, marginBottom: 10 }}>{item.desc}</div>
                <textarea
                  value={cfg[item.key]}
                  onChange={e => set(item.key, e.target.value)}
                  rows={item.rows}
                  style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
                />
              </div>
            ))}
          </>
        )}

        {/* ── Mensajes ── */}
        {tab === "mensajes" && (
          <>
            <div style={card}>
              <div style={cardTitle()}>
                <MessageSquare size={16} color="#6366f1" /> Mensaje al escalar a asesor
              </div>
              <textarea
                value={cfg.mensaje_espera_asesor}
                onChange={e => set("mensaje_espera_asesor", e.target.value)}
                rows={5}
                style={{ ...inp, resize: "vertical" }}
              />
              <div style={hint}>Se envía cuando el bot transfiere a un asesor humano.</div>
            </div>

            <div style={card}>
              <div style={cardTitle()}>
                <Settings size={16} color="#6366f1" /> Inboxes excluidos del bot
              </div>
              <TagInput
                values={(cfg.inboxes_excluidos || "").split(",").map(s => s.trim()).filter(Boolean)}
                onChange={arr => set("inboxes_excluidos", arr.join(", "))}
                placeholder="Nombre exacto de bandeja..."
                hint="El bot no responderá en estos canales."
              />
            </div>
          </>
        )}

        {/* ── Métodos de pago ── */}
        {tab === "metodos" && (
          <>
            {[
              { key: "amer_metodos_1", title: "🌐 Americanet — Bloque 1", desc: "Primer bloque de métodos para clientes Americanet.",    rows: 7 },
              { key: "amer_metodos_2", title: "🌐 Americanet — Bloque 2", desc: "Segundo bloque de métodos para clientes Americanet.",   rows: 8 },
              { key: "dim_metodos",    title: "📡 DIMfiber",              desc: "Métodos de pago para clientes DIMfiber.",               rows: 5 },
              { key: "nod11_metodos",  title: "🔌 Nod-11",                desc: "Métodos de pago para clientes del Nodo 11.",            rows: 6 },
            ].map(item => (
              <div key={item.key} style={card}>
                <div style={cardTitle()}>
                  {item.title}
                </div>
                <div style={{ ...hint, marginBottom: 10 }}>{item.desc}</div>
                <textarea
                  value={cfg[item.key]}
                  onChange={e => set(item.key, e.target.value)}
                  rows={item.rows}
                  style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
                />
              </div>
            ))}
          </>
        )}

        {/* ── Pagos Nod-06 ── */}
        {tab === "nod06" && (
          <>
            <div style={card}>
              <div style={cardTitle()}>
                📲 Yape
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Número</label>
                  <input type="text" value={cfg.nod06_yape_numero} onChange={e => set("nod06_yape_numero", e.target.value)} style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Titular</label>
                  <input type="text" value={cfg.nod06_yape_titular} onChange={e => set("nod06_yape_titular", e.target.value)} style={inp} />
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={cardTitle()}>
                🏦 BCP
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Cuenta</label>
                  <input type="text" value={cfg.nod06_bcp_cuenta} onChange={e => set("nod06_bcp_cuenta", e.target.value)} style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Titular</label>
                  <input type="text" value={cfg.nod06_bcp_titular} onChange={e => set("nod06_bcp_titular", e.target.value)} style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>CCI</label>
                <input type="text" value={cfg.nod06_bcp_cci} onChange={e => set("nod06_bcp_cci", e.target.value)} style={inp} />
              </div>
            </div>

            <div style={card}>
              <div style={cardTitle()}>
                📩 Número para recibir comprobantes
              </div>
              <input type="text" value={cfg.nod06_comprobante_numero} onChange={e => set("nod06_comprobante_numero", e.target.value)} style={inp} placeholder="+51 980 196 764" />
              <div style={hint}>El bot indicará a los clientes Nod-06 que envíen su comprobante a este número.</div>
            </div>
          </>
        )}

        {/* ── Prórrogas ── */}
        {tab === "prorroga" && (
          <>
            <div style={infoBanner("blue")}>
              💡 Estos valores controlan cuándo se ofrece prórroga y cuántos días se pueden conceder.
            </div>

            <div style={card}>
              <div style={cardTitle()}>
                <CalendarClock size={16} color="#6366f1" /> Período de tolerancia
              </div>
              <div style={infoBanner("yellow")}>
                ⚠️ Durante la tolerancia el servicio sigue activo. El bot informa la fecha límite y <b>no registra prórroga</b>. Solo ofrece prórroga si el servicio ya está suspendido.
              </div>
              <div style={{ display: "flex", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Americanet (días)</label>
                  <input type="number" min={0} max={30} value={cfg.prorroga_tolerancia_amer} onChange={e => set("prorroga_tolerancia_amer", Number(e.target.value))} style={{ ...inp, width: 90 }} />
                  <div style={hint}>Días después del vencimiento antes de suspender.</div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>DimFiber (días)</label>
                  <input type="number" min={0} max={30} value={cfg.prorroga_tolerancia_dim} onChange={e => set("prorroga_tolerancia_dim", Number(e.target.value))} style={{ ...inp, width: 90 }} />
                  <div style={hint}>Días después del vencimiento antes de suspender.</div>
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={cardTitle()}>
                <CalendarClock size={16} color="#6366f1" /> Límites de prórroga
              </div>
              <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Días máx. (servicio activo)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="number" min={1} max={30} value={cfg.prorroga_max_dias_activo} onChange={e => set("prorroga_max_dias_activo", Number(e.target.value))} style={{ ...inp, width: 80 }} />
                    <span style={{ fontSize: 13, color: "#6b7280" }}>días</span>
                  </div>
                  <div style={hint}>Desde el corte para clientes aún activos.</div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Días máx. (suspendido)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="number" min={1} max={30} value={cfg.prorroga_max_dias_suspendido} onChange={e => set("prorroga_max_dias_suspendido", Number(e.target.value))} style={{ ...inp, width: 80 }} />
                    <span style={{ fontSize: 13, color: "#6b7280" }}>días</span>
                  </div>
                  <div style={hint}>Desde hoy para clientes con servicio suspendido.</div>
                </div>
              </div>
              <div>
                <label style={lbl}>Prórrogas consecutivas máximas</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" min={1} max={10} value={cfg.prorroga_max_consecutivos} onChange={e => set("prorroga_max_consecutivos", Number(e.target.value))} style={{ ...inp, width: 80 }} />
                  <span style={{ fontSize: 13, color: "#6b7280" }}>seguidas</span>
                </div>
                <div style={hint}>Si el cliente supera este límite, se escala a un asesor de pagos.</div>
              </div>
            </div>
          </>
        )}

        {/* ── Equipos ── */}
        {tab === "equipos" && (
          <>
            <div style={infoBanner("blue")}>
              💡 IDs de los equipos en Chatwoot. El bot los usa al escalar conversaciones. Encuéntralos en Configuración → Equipos.
            </div>

            <div style={card}>
              <div style={cardTitle()}>
                <Users size={16} color="#6366f1" /> Equipos de Chatwoot
              </div>
              {[
                { key: "equipo_soporte_id", label: "Equipo Soporte", desc: "Problemas técnicos y averías",   color: "#2563eb" },
                { key: "equipo_pagos_id",   label: "Equipo Pagos",   desc: "Validación de comprobantes",    color: "#16a34a" },
                { key: "equipo_ventas_id",  label: "Equipo Ventas",  desc: "Nuevos clientes y planes",      color: "#d97706" },
              ].map(eq => (
                <div key={eq.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{eq.label}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>{eq.desc}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>ID</span>
                    <input
                      type="number" min={1}
                      value={cfg[eq.key]}
                      onChange={e => set(eq.key, Number(e.target.value))}
                      style={{ ...inp, width: 70, textAlign: "center" }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={card}>
              <div style={cardTitle()}>
                <Bot size={16} color="#6366f1" /> Agente Bot
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>ID del Bot_agent</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>El bot se auto-asigna con este ID al retomar una conversación.</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>ID</span>
                  <input
                    type="number" min={1}
                    value={cfg.bot_agent_id}
                    onChange={e => set("bot_agent_id", Number(e.target.value))}
                    style={{ ...inp, width: 70, textAlign: "center" }}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Validación pagos ── */}
        {tab === "pagos" && (
          <>
            {/* Beneficiarios */}
            <div style={card}>
              <div style={cardTitle()}>
                <ShieldCheck size={16} color="#6366f1" /> Beneficiarios válidos
              </div>
              <div style={{ ...hint, marginBottom: 14 }}>
                Nombres aceptados en comprobantes. El bot valida que los tokens del beneficiario coincidan con el comprobante (tolerancia OCR).
              </div>

              {beneficiarios.map((b, idx) => {
                const editing = isEditing(idx);
                const readonlyInp = { ...inp, background: "#f9fafb", color: "#6b7280", cursor: "default", border: "1px solid #f3f4f6" };
                return (
                  <div key={idx} style={{ border: `1px solid ${editing ? "#6366f1" : "#e5e7eb"}`, borderRadius: 10, padding: 14, marginBottom: 10, background: editing ? "#fafafe" : "#fdfdfd" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
                        Beneficiario {idx + 1}
                        {!editing && <Lock size={11} color="#d1d5db" />}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => toggleEditBenef(idx)}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                            background: editing ? "#eef2ff" : "#f3f4f6",
                            color: editing ? "#4f46e5" : "#374151",
                          }}
                        >
                          {editing ? <><CheckCircle size={12} /> Listo</> : <><Pencil size={12} /> Editar</>}
                        </button>
                        {editing && (
                          <button onClick={() => { removeBenef(idx); setEditingBenef(prev => prev.filter(i => i !== idx)); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", padding: 4 }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={lbl}>Nombre completo</label>
                        <input type="text" value={b.nombre} onChange={e => editing && setBenef(idx, "nombre", e.target.value)} readOnly={!editing} style={editing ? inp : readonlyInp} placeholder="Walter Ernesto Pinto Paz" />
                      </div>
                      <div>
                        <label style={lbl}>Pasarela de pago</label>
                        <input type="text" value={b.pasarela || ""} onChange={e => editing && setBenef(idx, "pasarela", e.target.value)} readOnly={!editing} style={editing ? inp : readonlyInp} placeholder="Walter Pinto" />
                        {editing && <div style={hint}>Valor exacto que se envía a la API de Mikrowisp.</div>}
                      </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={lbl}>Tokens de validación</label>
                      {editing ? (
                        <TagInput
                          values={Array.isArray(b.tokens) ? b.tokens : String(b.tokens || "").split(",").map(t => t.trim()).filter(Boolean)}
                          onChange={arr => setBenef(idx, "tokens", arr)}
                          placeholder="walter"
                          hint="El bot acepta si detecta al menos 2 de estos tokens en el comprobante."
                        />
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                          {(Array.isArray(b.tokens) ? b.tokens : String(b.tokens || "").split(",").map(t => t.trim()).filter(Boolean)).map((t, ti) => (
                            <span key={ti} style={{ padding: "2px 8px", borderRadius: 5, background: "#f3f4f6", border: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280" }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={lbl}>Nodos válidos</label>
                        <input type="text" value={b.nodos} onChange={e => editing && setBenef(idx, "nodos", e.target.value)} readOnly={!editing} style={editing ? inp : readonlyInp} placeholder="todos  ó  1,2,3,5" />
                      </div>
                      <div>
                        <label style={lbl}>Nodo NOTIFICAR</label>
                        <input type="text" value={b.nodo_notificar || ""} onChange={e => editing && setBenef(idx, "nodo_notificar", e.target.value)} readOnly={!editing} style={editing ? inp : readonlyInp} placeholder="11  (vacío si no aplica)" />
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={addBenef}
                style={{
                  display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
                  width: "100%", padding: "9px 16px", borderRadius: 8,
                  border: "2px dashed #c7d2fe", background: "#eef2ff",
                  color: "#4f46e5", fontWeight: 600, fontSize: 13, cursor: "pointer",
                }}
              >
                <Plus size={14} /> Agregar beneficiario
              </button>
            </div>

            {/* Parámetros */}
            <div style={card}>
              <div style={cardTitle()}>
                <ShieldCheck size={16} color="#6366f1" /> Parámetros de validación
              </div>
              <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Antigüedad máxima del comprobante</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="number" min={1} max={30} value={cfg.comprobante_dias_max} onChange={e => set("comprobante_dias_max", Number(e.target.value))} style={{ ...inp, width: 80 }} />
                    <span style={{ fontSize: 13, color: "#6b7280" }}>días</span>
                  </div>
                  <div style={hint}>Comprobantes más antiguos serán rechazados automáticamente.</div>
                </div>
              </div>
              <div>
                <label style={lbl}>Bancos con excepción de año</label>
                <TagInput
                  values={(cfg.bancos_excepcion_anio || "").split(",").map(s => s.trim()).filter(Boolean)}
                  onChange={arr => set("bancos_excepcion_anio", arr.join(", "))}
                  placeholder="Scotiabank"
                  hint="Para estos bancos el bot corrige automáticamente el año si aparece incorrecto."
                />
              </div>
            </div>

            {/* Notificaciones */}
            <div style={card}>
              <div style={cardTitle()}>
                <Bell size={16} color="#6366f1" /> Notificaciones de pago
              </div>
              <div style={{ ...hint, marginBottom: 14 }}>
                Destinos donde el bot envía avisos cuando llega un comprobante (revisión o beneficiario incorrecto).
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Grupo principal de WhatsApp</label>
                <input type="text" value={cfg.notif_grupo_principal} onChange={e => set("notif_grupo_principal", e.target.value)} style={inp} placeholder="120363420240336066@g.us" />
                <div style={hint}>ID del grupo en formato Evolution API. Termina en @g.us para grupos.</div>
              </div>
              <div>
                <label style={lbl}>Números adicionales</label>
                <TagInput
                  values={(cfg.notif_numeros_adicionales || "").split(",").map(s => s.trim()).filter(Boolean)}
                  onChange={arr => set("notif_numeros_adicionales", arr.join(", "))}
                  placeholder="51980196764"
                  hint="Números personales que también recibirán el aviso. Sin + ni espacios."
                />
              </div>
            </div>
          </>
        )}

        {/* ── Historial ── */}
        {tab === "historial" && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={cardTitle()}>
                <History size={16} color="#6366f1" /> Historial de validaciones
              </div>
              <button
                onClick={loadHistorial}
                disabled={histLoading}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: 12, color: "#374151" }}
              >
                <RefreshCw size={12} style={{ animation: histLoading ? "spin 1s linear infinite" : "none" }} />
                Actualizar
              </button>
            </div>

            {/* Filtros */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={lbl}>Resultado</label>
                <select value={histFiltro} onChange={e => setHistFiltro(e.target.value)} style={{ ...inp, width: "auto", minWidth: 130 }}>
                  <option value="todos">Todos</option>
                  <option value="SI">✅ Aprobados</option>
                  <option value="NO">❌ Rechazados</option>
                  <option value="NOTIFICAR">⚠️ Notificar</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Desde</label>
                <input type="date" value={histDesde} onChange={e => setHistDesde(e.target.value)} style={{ ...inp, width: "auto" }} />
              </div>
              <div>
                <label style={lbl}>Hasta</label>
                <input type="date" value={histHasta} onChange={e => setHistHasta(e.target.value)} style={{ ...inp, width: "auto" }} />
              </div>
              {(histDesde || histHasta) && (
                <button onClick={() => { setHistDesde(""); setHistHasta(""); }} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: 12, color: "#6b7280" }}>
                  Limpiar fechas
                </button>
              )}
            </div>

            {/* Resumen */}
            {historial.length > 0 && (() => {
              const aprobados  = historial.filter(h => h.resultado === "SI");
              const rechazados = historial.filter(h => h.resultado === "NO");
              const notificar  = historial.filter(h => h.resultado === "NOTIFICAR");
              const sumaMontos = aprobados.reduce((acc, h) => acc + (Number(h.monto) || 0), 0);
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.2fr", gap: 10, marginBottom: 16 }}>
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#166534" }}>{aprobados.length}</div>
                    <div style={{ fontSize: 11, color: "#166534", fontWeight: 600 }}>Aprobados</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#991b1b" }}>{rechazados.length}</div>
                    <div style={{ fontSize: 11, color: "#991b1b", fontWeight: 600 }}>Rechazados</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#92400e" }}>{notificar.length}</div>
                    <div style={{ fontSize: 11, color: "#92400e", fontWeight: 600 }}>Notificar</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "#eef2ff", border: "1px solid #c7d2fe", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#4f46e5" }}>
                      {sumaMontos > 0 ? `S/ ${sumaMontos.toFixed(2)}` : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: "#4f46e5", fontWeight: 600 }}>Total cobrado</div>
                  </div>
                </div>
              );
            })()}

            {/* Tabla */}
            {histLoading ? (
              <div style={{ textAlign: "center", padding: 32, color: "#6b7280", fontSize: 14 }}>Cargando...</div>
            ) : historial.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "#9ca3af", fontSize: 14 }}>Sin registros para los filtros seleccionados.</div>
            ) : (() => {
              const totalPages = Math.ceil(historial.length / HIST_PER_PAGE);
              const pagina = historial.slice(histPage * HIST_PER_PAGE, (histPage + 1) * HIST_PER_PAGE);
              function formatCliente(c) {
                if (!c) return "-";
                // Formato IA: "12345678_APELLIDO NOMBRE_..." → extraer solo nombre
                const parts = c.split("_");
                if (parts.length >= 3 && /^\d{6,}$/.test(parts[0])) {
                  return parts[1].split(",").reverse().join(" ").trim().substring(0, 22) ||
                         parts.slice(1, 3).join(" ").substring(0, 22);
                }
                return c.substring(0, 22);
              }
              return (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["Fecha", "Cliente", "Nodo", "Monto", "Banco", "Beneficiario", "Resultado", "Motivo"].map(h => (
                            <th key={h} style={{ padding: "9px 10px", textAlign: h === "Monto" ? "right" : "left", fontWeight: 700, color: "#6b7280", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagina.map(row => {
                          const s = RESULTADO_STYLES[row.resultado] || RESULTADO_STYLES.NO;
                          const fechaLocal = row.fecha ? new Date(row.fecha).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
                          const clienteDisplay = formatCliente(row.cliente);
                          return (
                            <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6", transition: "background 0.1s" }}
                              onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                            >
                              <td style={{ padding: "9px 10px", whiteSpace: "nowrap", color: "#6b7280" }}>{fechaLocal}</td>
                              <td style={{ padding: "9px 10px", fontWeight: 600, color: "#111827", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.cliente}>{clienteDisplay}</td>
                              <td style={{ padding: "9px 10px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 6, background: "#f3f4f6", fontSize: 12, fontWeight: 600, color: "#374151" }}>
                                  {NODO_LABELS[Number(row.nodo)] || row.nodo || "-"}
                                </span>
                              </td>
                              <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 600, color: row.monto ? "#166534" : "#d1d5db", whiteSpace: "nowrap" }}>
                                {row.monto ? `S/ ${Number(row.monto).toFixed(2)}` : "—"}
                              </td>
                              <td style={{ padding: "9px 10px", color: "#374151", whiteSpace: "nowrap" }}>{row.banco || <span style={{ color: "#d1d5db" }}>—</span>}</td>
                              <td style={{ padding: "9px 10px", color: "#374151", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.beneficiario}>{row.beneficiario || <span style={{ color: "#d1d5db" }}>—</span>}</td>
                              <td style={{ padding: "9px 10px" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontWeight: 700, fontSize: 11 }}>
                                  {s.icon} {row.resultado}
                                </span>
                              </td>
                              <td style={{ padding: "9px 10px", color: "#6b7280", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.motivo}>{row.motivo || <span style={{ color: "#d1d5db" }}>—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginación */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid #f3f4f6" }}>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Mostrando {histPage * HIST_PER_PAGE + 1}–{Math.min((histPage + 1) * HIST_PER_PAGE, historial.length)} de {historial.length} registros
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        onClick={() => setHistPage(p => Math.max(0, p - 1))}
                        disabled={histPage === 0}
                        style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #e5e7eb", background: histPage === 0 ? "#f9fafb" : "#fff", color: histPage === 0 ? "#d1d5db" : "#374151", fontSize: 12, fontWeight: 600, cursor: histPage === 0 ? "default" : "pointer" }}
                      >
                        ← Ant.
                      </button>
                      <span style={{ fontSize: 12, color: "#6b7280", padding: "0 4px" }}>
                        {histPage + 1} / {totalPages}
                      </span>
                      <button
                        onClick={() => setHistPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={histPage >= totalPages - 1}
                        style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #e5e7eb", background: histPage >= totalPages - 1 ? "#f9fafb" : "#fff", color: histPage >= totalPages - 1 ? "#d1d5db" : "#374151", fontSize: 12, fontWeight: 600, cursor: histPage >= totalPages - 1 ? "default" : "pointer" }}
                      >
                        Sig. →
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}
