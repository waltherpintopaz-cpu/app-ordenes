import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Clock, MessageSquare, Save, CreditCard, Banknote, ShieldCheck, Plus, Trash2, Bell, History, RefreshCw, CheckCircle, XCircle, AlertTriangle, Power, AlertOctagon, Menu, Pencil, Lock } from "lucide-react";

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
    "⏳ Un asesor revisará tu caso y te responderá en breve.\n\nNuestro horario es *Lunes a Sábado de 8:00 am a 9:00 pm*. 🙏",
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
  comprobante_dias_max: 7,
  bancos_excepcion_anio: "Scotiabank",
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

const RESULTADO_STYLES = {
  SI:        { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0", icon: <CheckCircle size={13} /> },
  NO:        { bg: "#fef2f2", color: "#991b1b", border: "#fecaca", icon: <XCircle size={13} /> },
  NOTIFICAR: { bg: "#fffbeb", color: "#92400e", border: "#fde68a", icon: <AlertTriangle size={13} /> },
};

export default function BotConfigPanel() {
  const [tab, setTab] = useState("horario");
  const [cfg, setCfg] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Historial state
  const [historial, setHistorial] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFiltro, setHistFiltro] = useState("todos");
  const [histFecha, setHistFecha] = useState("");

  const loadHistorial = useCallback(async () => {
    setHistLoading(true);
    let q = supabase
      .from("bot_pagos_log")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(100);
    if (histFiltro !== "todos") q = q.eq("resultado", histFiltro);
    if (histFecha) q = q.gte("fecha", histFecha + "T00:00:00").lte("fecha", histFecha + "T23:59:59");
    const { data } = await q;
    setHistorial(data || []);
    setHistLoading(false);
  }, [histFiltro, histFecha]);

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
      // Si beneficiarios vienen de Supabase sin `pasarela`, completar desde DEFAULT por nombre
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
    { key: "estado", label: "Estado", icon: <Power size={15} /> },
    { key: "horario", label: "Horario", icon: <Clock size={15} /> },
    { key: "menu", label: "Menú", icon: <Menu size={15} /> },
    { key: "mensajes", label: "Mensajes", icon: <MessageSquare size={15} /> },
    { key: "metodos", label: "Métodos de pago", icon: <Banknote size={15} /> },
    { key: "nod06", label: "Pagos Nod-06", icon: <CreditCard size={15} /> },
    { key: "pagos", label: "Validación pagos", icon: <ShieldCheck size={15} /> },
    { key: "historial", label: "Historial", icon: <History size={15} /> },
  ];

  // Helpers para beneficiarios
  const beneficiarios = Array.isArray(cfg.beneficiarios) ? cfg.beneficiarios : [];
  const [editingBenef, setEditingBenef] = useState([]);

  function isEditing(idx) { return editingBenef.includes(idx); }

  function toggleEditBenef(idx) {
    setEditingBenef(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  }

  function setBenef(idx, key, val) {
    const next = beneficiarios.map((b, i) => i === idx ? { ...b, [key]: val } : b);
    set("beneficiarios", next);
  }

  function addBenef() {
    const newIdx = beneficiarios.length;
    set("beneficiarios", [...beneficiarios, { nombre: "", tokens: "", nodos: "todos", nodo_notificar: "", pasarela: "", accion: "SI" }]);
    setEditingBenef(prev => [...prev, newIdx]);
  }

  function removeBenef(idx) {
    set("beneficiarios", beneficiarios.filter((_, i) => i !== idx));
  }

  // Parse números adicionales para preview
  const numerosAdicionales = (cfg.notif_numeros_adicionales || "")
    .split(",").map(s => s.trim()).filter(Boolean);

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

      {/* ── TAB: Estado del bot ── */}
      {tab === "estado" && (
        <>
          {/* Bot ON/OFF */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Power size={16} color={cfg.bot_activo ? "#16a34a" : "#dc2626"} />
                  Estado del bot
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {cfg.bot_activo ? "El bot está activo y respondiendo mensajes automáticamente." : "El bot está desactivado. Todos los mensajes irán directo a asesores."}
                </div>
              </div>
              <button
                onClick={() => set("bot_activo", !cfg.bot_activo)}
                style={{
                  width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
                  background: cfg.bot_activo ? "#16a34a" : "#d1d5db",
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
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
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#991b1b" }}>
                ⚠️ El bot está desactivado. Guarda los cambios para que el ajuste se refleje.
              </div>
            )}
          </div>

          {/* Avería */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <AlertOctagon size={16} color={cfg.averia_activa ? "#d97706" : "#9ca3af"} />
                  Modo avería
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {cfg.averia_activa ? "Activo — el bot notifica a los clientes sobre la avería." : "Inactivo — operación normal."}
                </div>
              </div>
              <button
                onClick={() => set("averia_activa", !cfg.averia_activa)}
                style={{
                  width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
                  background: cfg.averia_activa ? "#d97706" : "#d1d5db",
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
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
                  <label style={label}>Descripción de la avería</label>
                  <textarea
                    value={cfg.averia_contexto}
                    onChange={e => set("averia_contexto", e.target.value)}
                    rows={3}
                    style={{ ...input, resize: "vertical" }}
                    placeholder="Ej: Avería en fibra principal sector norte. Técnicos trabajando en la solución."
                  />
                </div>
                <div>
                  <label style={label}>Tiempo estimado de resolución</label>
                  <input
                    type="text"
                    value={cfg.averia_tiempo_estimado}
                    onChange={e => set("averia_tiempo_estimado", e.target.value)}
                    style={input}
                    placeholder="Ej: 2 horas, antes de las 6pm, mañana por la mañana"
                  />
                </div>
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 13, color: "#92400e" }}>
                  🔔 Con avería activa el bot informa a los clientes afectados y evita registrar pagos hasta que se resuelva.
                </div>
              </>
            )}
          </div>
        </>
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

          {/* Feriados */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              📅 Feriados
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>
              En estas fechas el bot responderá como si fuera fuera de horario, independientemente del día de la semana.
            </div>

            {/* Agregar feriado */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                type="date"
                id="input-feriado"
                style={{ ...input, width: "auto", flex: 1 }}
              />
              <button
                onClick={() => {
                  const inp = document.getElementById("input-feriado");
                  const val = inp?.value;
                  if (!val) return;
                  const feriados = Array.isArray(cfg.feriados) ? cfg.feriados : [];
                  if (!feriados.includes(val)) set("feriados", [...feriados, val].sort());
                  inp.value = "";
                }}
                style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + Agregar
              </button>
            </div>

            {/* Lista de feriados */}
            {Array.isArray(cfg.feriados) && cfg.feriados.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {cfg.feriados.map((f) => {
                  const [y, m, d] = f.split("-");
                  const label = `${d}/${m}/${y}`;
                  return (
                    <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "#f3f4f6", border: "1px solid #e5e7eb", fontSize: 13, color: "#374151" }}>
                      📅 {label}
                      <button
                        onClick={() => set("feriados", cfg.feriados.filter((x) => x !== f))}
                        style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", padding: 0, lineHeight: 1, fontSize: 15 }}
                        title="Quitar"
                      >×</button>
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

      {/* ── TAB: Menú ── */}
      {tab === "menu" && (
        <>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16, padding: "10px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8 }}>
            💡 Usa <b>*texto*</b> para negrita y <b>_texto_</b> para cursiva (formato WhatsApp). Los cambios se reflejan en máx 5 min.
          </div>

          <div style={card}>
            <label style={{ ...label, fontSize: 15, fontWeight: 700, color: "#111827" }}>
              Menú principal
            </label>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              Se muestra cuando el cliente escribe por primera vez o escribe "menu".
            </div>
            <textarea
              value={cfg.menu_principal}
              onChange={e => set("menu_principal", e.target.value)}
              rows={12}
              style={{ ...input, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
            />
          </div>

          <div style={card}>
            <label style={{ ...label, fontSize: 15, fontWeight: 700, color: "#111827" }}>
              Menú "Mi cuenta"
            </label>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              Se muestra cuando el cliente elige la opción 7 (Mi cuenta).
            </div>
            <textarea
              value={cfg.menu_micuenta}
              onChange={e => set("menu_micuenta", e.target.value)}
              rows={10}
              style={{ ...input, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
            />
          </div>

          <div style={card}>
            <label style={{ ...label, fontSize: 15, fontWeight: 700, color: "#111827" }}>
              Mensaje opción inválida
            </label>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              Se muestra cuando el cliente responde algo que no es una opción válida del menú.
            </div>
            <textarea
              value={cfg.menu_opcion_invalida}
              onChange={e => set("menu_opcion_invalida", e.target.value)}
              rows={10}
              style={{ ...input, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
            />
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

          <div style={card}>
            <label style={{ ...label, fontSize: 15, fontWeight: 700, color: "#111827" }}>
              Inboxes excluidos del bot
            </label>
            <input
              type="text"
              value={cfg.inboxes_excluidos}
              onChange={(e) => set("inboxes_excluidos", e.target.value)}
              style={input}
              placeholder="DIM Ventas, Ventas Meta"
            />
            <div style={hint}>
              Nombres exactos de los inboxes separados por coma. El bot no responderá en estos canales.
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

      {/* ── TAB: Validación pagos ── */}
      {tab === "pagos" && (
        <>
          {/* Beneficiarios */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} color="#6366f1" /> Beneficiarios válidos
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
              Nombres aceptados en comprobantes. El bot valida que al menos 2 tokens coincidan (tolerancia OCR).
            </div>

            {beneficiarios.map((b, idx) => {
              const editing = isEditing(idx);
              const readonlyInput = {
                ...input,
                background: "#f3f4f6",
                color: "#6b7280",
                cursor: "default",
                border: "1px solid #e5e7eb",
              };
              return (
                <div key={idx} style={{ border: `1px solid ${editing ? "#6366f1" : "#e5e7eb"}`, borderRadius: 10, padding: 14, marginBottom: 12, background: editing ? "#fafafe" : "#f9fafb" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Beneficiario {idx + 1}</span>
                      {!editing && <Lock size={12} color="#9ca3af" />}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => toggleEditBenef(idx)}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                          background: editing ? "#eef2ff" : "#f3f4f6",
                          color: editing ? "#4f46e5" : "#374151",
                        }}
                      >
                        {editing ? <><CheckCircle size={13} /> Listo</> : <><Pencil size={13} /> Editar</>}
                      </button>
                      {editing && (
                        <button
                          onClick={() => { removeBenef(idx); setEditingBenef(prev => prev.filter(i => i !== idx)); }}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", padding: 4 }}
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={label}>Nombre completo</label>
                    <input
                      type="text"
                      value={b.nombre}
                      onChange={e => editing && setBenef(idx, "nombre", e.target.value)}
                      readOnly={!editing}
                      style={editing ? input : readonlyInput}
                      placeholder="Walter Ernesto Pinto Paz"
                    />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={label}>Tokens de validación <span style={{ color: "#9ca3af", fontWeight: 400 }}>(separados por coma)</span></label>
                    <input
                      type="text"
                      value={b.tokens}
                      onChange={e => editing && setBenef(idx, "tokens", e.target.value)}
                      readOnly={!editing}
                      style={editing ? input : readonlyInput}
                      placeholder="walter,ernesto,pinto,paz"
                    />
                    {editing && <div style={hint}>El bot acepta si detecta al menos 2 de estos tokens en el comprobante.</div>}
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={label}>Pasarela de pago</label>
                    <input
                      type="text"
                      value={b.pasarela || ""}
                      onChange={e => editing && setBenef(idx, "pasarela", e.target.value)}
                      readOnly={!editing}
                      style={editing ? input : readonlyInput}
                      placeholder="Ej: Walter Pinto, Americanet, Pagos DIM"
                    />
                    {editing && <div style={hint}>Valor exacto que se enviará a la API al registrar el pago.</div>}
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={label}>Nodos válidos</label>
                      <input
                        type="text"
                        value={b.nodos}
                        onChange={e => editing && setBenef(idx, "nodos", e.target.value)}
                        readOnly={!editing}
                        style={editing ? input : readonlyInput}
                        placeholder="todos  ó  1,2,3,5"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={label}>Nodo que genera NOTIFICAR</label>
                      <input
                        type="text"
                        value={b.nodo_notificar || ""}
                        onChange={e => editing && setBenef(idx, "nodo_notificar", e.target.value)}
                        readOnly={!editing}
                        style={editing ? input : readonlyInput}
                        placeholder="11  (dejar vacío si no aplica)"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={addBenef}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 8,
                border: "2px dashed #c7d2fe", background: "#eef2ff",
                color: "#4f46e5", fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%",
                justifyContent: "center",
              }}
            >
              <Plus size={15} /> Agregar beneficiario
            </button>
          </div>

          {/* Parámetros de validación */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 16 }}>
              Parámetros de validación
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Antigüedad máxima del comprobante</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={1} max={30}
                    value={cfg.comprobante_dias_max}
                    onChange={e => set("comprobante_dias_max", Number(e.target.value))}
                    style={{ ...input, width: 80 }}
                  />
                  <span style={{ fontSize: 14, color: "#6b7280" }}>días</span>
                </div>
                <div style={hint}>Comprobantes más antiguos serán rechazados.</div>
              </div>
            </div>

            <div>
              <label style={label}>Bancos con excepción de año <span style={{ color: "#9ca3af", fontWeight: 400 }}>(separados por coma)</span></label>
              <input
                type="text"
                value={cfg.bancos_excepcion_anio}
                onChange={e => set("bancos_excepcion_anio", e.target.value)}
                style={input}
                placeholder="Scotiabank, BCP"
              />
              <div style={hint}>Para estos bancos el bot corrige automáticamente el año si aparece incorrecto en el comprobante.</div>
            </div>
          </div>

          {/* Notificaciones */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <Bell size={16} color="#6366f1" /> Notificaciones de pago
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
              Destinos donde el bot envía avisos cuando llega un comprobante (revisión o beneficiario incorrecto).
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={label}>Grupo principal de WhatsApp</label>
              <input
                type="text"
                value={cfg.notif_grupo_principal}
                onChange={e => set("notif_grupo_principal", e.target.value)}
                style={input}
                placeholder="120363420240336066@g.us"
              />
              <div style={hint}>ID del grupo en formato Evolution API. Termina en @g.us para grupos.</div>
            </div>

            <div>
              <label style={label}>Números adicionales <span style={{ color: "#9ca3af", fontWeight: 400 }}>(separados por coma)</span></label>
              <input
                type="text"
                value={cfg.notif_numeros_adicionales}
                onChange={e => set("notif_numeros_adicionales", e.target.value)}
                style={input}
                placeholder="51980196764, 51949529785"
              />
              <div style={hint}>Números personales que también recibirán el aviso. Sin + ni espacios.</div>

              {numerosAdicionales.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {numerosAdicionales.map((n, i) => (
                    <span key={i} style={{
                      padding: "3px 10px", borderRadius: 20, background: "#eef2ff",
                      color: "#4f46e5", fontSize: 12, fontWeight: 600,
                    }}>
                      📱 {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── TAB: Historial ── */}
      {tab === "historial" && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", display: "flex", alignItems: "center", gap: 8 }}>
              <History size={16} color="#6366f1" /> Historial de validaciones
            </div>
            <button
              onClick={loadHistorial}
              disabled={histLoading}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: 13, color: "#374151" }}
            >
              <RefreshCw size={13} style={{ animation: histLoading ? "spin 1s linear infinite" : "none" }} />
              Actualizar
            </button>
          </div>

          {/* Filtros */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <label style={{ ...label, marginBottom: 4 }}>Resultado</label>
              <select
                value={histFiltro}
                onChange={e => setHistFiltro(e.target.value)}
                style={{ ...input, width: "auto", minWidth: 130 }}
              >
                <option value="todos">Todos</option>
                <option value="SI">✅ Aprobados</option>
                <option value="NO">❌ Rechazados</option>
                <option value="NOTIFICAR">⚠️ Notificar</option>
              </select>
            </div>
            <div>
              <label style={{ ...label, marginBottom: 4 }}>Fecha</label>
              <input
                type="date"
                value={histFecha}
                onChange={e => setHistFecha(e.target.value)}
                style={{ ...input, width: "auto" }}
              />
            </div>
            {histFecha && (
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button
                  onClick={() => setHistFecha("")}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: 13, color: "#6b7280" }}
                >
                  Limpiar fecha
                </button>
              </div>
            )}
          </div>

          {/* Contadores del día */}
          {historial.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {["SI", "NO", "NOTIFICAR"].map(r => {
                const count = historial.filter(h => h.resultado === r).length;
                const s = RESULTADO_STYLES[r];
                return (
                  <div key={r} style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{count}</div>
                    <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{r === "SI" ? "Aprobados" : r === "NO" ? "Rechazados" : "Notificar"}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tabla */}
          {histLoading ? (
            <div style={{ textAlign: "center", padding: 32, color: "#6b7280", fontSize: 14 }}>Cargando...</div>
          ) : historial.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "#9ca3af", fontSize: 14 }}>Sin registros para los filtros seleccionados.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    {["Fecha", "Cliente", "Nodo", "Banco", "Beneficiario", "Resultado", "Motivo"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.map((row, i) => {
                    const s = RESULTADO_STYLES[row.resultado] || RESULTADO_STYLES.NO;
                    const fechaLocal = row.fecha ? new Date(row.fecha).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
                    return (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#6b7280" }}>{fechaLocal}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 600, color: "#111827", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.cliente}>{row.cliente || "-"}</td>
                        <td style={{ padding: "8px 10px", color: "#374151" }}>{row.nodo || "-"}</td>
                        <td style={{ padding: "8px 10px", color: "#374151", whiteSpace: "nowrap" }}>{row.banco || "-"}</td>
                        <td style={{ padding: "8px 10px", color: "#374151", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.beneficiario}>{row.beneficiario || "-"}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontWeight: 700, fontSize: 12 }}>
                            {s.icon} {row.resultado}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", color: "#6b7280", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.motivo}>{row.motivo || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ ...hint, textAlign: "right", marginTop: 8 }}>Últimos {historial.length} registros</div>
            </div>
          )}
        </div>
      )}

      {/* Botón guardar — oculto en pestaña historial */}
      <button
        onClick={save}
        disabled={saving}
        style={{
          display: tab === "historial" ? "none" : "flex",
          width: "100%",
          padding: "12px 20px",
          borderRadius: 10,
          border: "none",
          cursor: saving ? "not-allowed" : "pointer",
          fontWeight: 700,
          fontSize: 15,
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
