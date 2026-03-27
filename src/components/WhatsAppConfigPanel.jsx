import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

const EMPRESAS = ["Americanet", "DIM"];
const LS_KEY = "whatsapp_config_local";

const VARIABLES = [
  { key: "{nombre}", desc: "Nombre del cliente" },
  { key: "{codigo}", desc: "Código de orden" },
  { key: "{empresa}", desc: "Nombre empresa" },
  { key: "{tecnico}", desc: "Técnico asignado" },
  { key: "{fecha}", desc: "Fecha de actuación" },
  { key: "{direccion}", desc: "Dirección" },
];

const TIPOS = [
  { key: "template_instalacion", label: "Instalación", color: "#2563eb", bg: "#eff6ff", dot: "#93c5fd" },
  { key: "template_incidencia", label: "Incidencia", color: "#d97706", bg: "#fffbeb", dot: "#fcd34d" },
  { key: "template_recuperacion", label: "Recuperación", color: "#7c3aed", bg: "#f5f3ff", dot: "#c4b5fd" },
  { key: "template_liquidacion", label: "Al liquidar", color: "#059669", bg: "#f0fdf4", dot: "#86efac" },
];

const defaultConfig = (emp) => ({
  empresa: emp,
  habilitado: false,
  base_url: "",
  api_key: "",
  instance_name: "",
  template_instalacion: "Estimado/a {nombre}, su orden de INSTALACIÓN #{codigo} ha sido generada. El técnico {tecnico} coordinará la visita. — {empresa}",
  template_incidencia: "Estimado/a {nombre}, su reporte #{codigo} fue registrado. Pronto un técnico lo atenderá. — {empresa}",
  template_recuperacion: "Estimado/a {nombre}, se generó la orden de recuperación #{codigo}. Coordinaremos con usted. — {empresa}",
  template_liquidacion: "Estimado/a {nombre}, su orden #{codigo} fue completada. ¡Gracias por preferir {empresa}!",
});

function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveToLS(map) {
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

export function getWhatsAppConfig(empresa) {
  const map = loadFromLS();
  return map?.[empresa] || defaultConfig(empresa);
}

function previewMsg(tpl, empresa) {
  return (tpl || "")
    .replace(/{nombre}/g, "Juan Pérez")
    .replace(/{codigo}/g, "ORD-001")
    .replace(/{empresa}/g, empresa || "Americanet")
    .replace(/{tecnico}/g, "Carlos López")
    .replace(/{fecha}/g, new Date().toLocaleDateString("es-PE"))
    .replace(/{direccion}/g, "Av. Principal 123");
}

export default function WhatsAppConfigPanel() {
  const [empresa, setEmpresa] = useState("Americanet");
  const [configs, setConfigs] = useState({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [activeTpl, setActiveTpl] = useState("template_instalacion");
  const [toast, setToast] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // Cargar desde localStorage y luego Supabase (si hay datos)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const saved = loadFromLS();
      const localMap = {};
      EMPRESAS.forEach((e) => {
        localMap[e] = saved?.[e] ? { ...defaultConfig(e), ...saved[e] } : defaultConfig(e);
      });
      if (alive) setConfigs(localMap);

      const { data, error } = await supabase
        .from("whatsapp_config")
        .select("*")
        .in("empresa", EMPRESAS);

      if (!alive) return;
      if (error) {
        showToast("No se pudo cargar Supabase: " + error.message, false);
        return;
      }
      if (data && data.length) {
        const dbMap = {};
        EMPRESAS.forEach((e) => { dbMap[e] = defaultConfig(e); });
        data.forEach((row) => {
          if (row?.empresa) dbMap[row.empresa] = { ...defaultConfig(row.empresa), ...row };
        });
        setConfigs(dbMap);
        saveToLS(dbMap);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  const cfg = configs[empresa] || defaultConfig(empresa);
  const set = (field, val) => {
    setConfigs((prev) => ({ ...prev, [empresa]: { ...(prev[empresa] || defaultConfig(empresa)), [field]: val } }));
  };

  const handleSave = async () => {
    const updated = { ...configs, [empresa]: { ...cfg, empresa } };
    saveToLS(updated);
    setConfigs(updated);
    setSaving(true);
    const payload = { ...cfg, empresa, updated_at: new Date().toISOString() };
    const { error } = await supabase
      .from("whatsapp_config")
      .upsert(payload, { onConflict: "empresa" });
    setSaving(false);
    if (error) {
      showToast("No se pudo guardar en Supabase: " + error.message, false);
      return;
    }
    showToast("Configuración guardada");
  };

  const insertVar = (v) => {
    const el = document.getElementById("tpl-area");
    if (!el) { set(activeTpl, (cfg[activeTpl] || "") + v); return; }
    const s = el.selectionStart, e2 = el.selectionEnd;
    const cur = cfg[activeTpl] || "";
    set(activeTpl, cur.slice(0, s) + v + cur.slice(e2));
    setTimeout(() => { el.focus(); el.setSelectionRange(s + v.length, s + v.length); }, 10);
  };

  const handleTest = async () => {
    if (!testPhone.trim()) { showToast("Ingresa un número de prueba", false); return; }
    if (!cfg.base_url || !cfg.api_key || !cfg.instance_name) {
      showToast("Completa URL, API Key e Instancia antes de probar", false); return;
    }
    setTesting(true); setTestResult(null);
    try {
      // Normalizar teléfono
      let phone = testPhone.trim().replace(/[\s\-\(\)]/g, "");
      if (phone.startsWith("+")) phone = phone.slice(1);
      if (/^9\d{8}$/.test(phone)) phone = "51" + phone;

      const tpl = cfg.template_instalacion || "Estimado/a {nombre}, esta es una prueba de conexión desde {empresa}.";
      const message = tpl
        .replace(/{nombre}/g, "Cliente Prueba")
        .replace(/{codigo}/g, "TEST-001")
        .replace(/{empresa}/g, empresa)
        .replace(/{tecnico}/g, "Técnico Demo")
        .replace(/{fecha}/g, new Date().toLocaleDateString("es-PE"))
        .replace(/{direccion}/g, "Av. Principal 123");

      const url = `${cfg.base_url.replace(/\/$/, "")}/message/sendText/${cfg.instance_name}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.api_key },
        body: JSON.stringify({ number: phone, text: message }),
      });

      const body = await res.text();
      let json = {};
      try { json = JSON.parse(body); } catch { json = { raw: body }; }

      if (res.ok) {
        setTestResult({ ok: true, msg: "Mensaje enviado a " + phone });
      } else {
        setTestResult({ ok: false, msg: `Error ${res.status}: ${body.slice(0, 200)}` });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: "No se pudo conectar: " + (e?.message || String(e)) });
    } finally { setTesting(false); }
  };

  const activeType = TIPOS.find((t) => t.key === activeTpl);

  return (
    <div style={s.page}>
      {toast && <div style={{ ...s.toast, background: toast.ok ? "#166534" : "#991b1b" }}>{toast.msg}</div>}

      <div style={s.pageHeader}>
        <div style={s.pageIconWrap}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21 11.5C21 16.747 16.747 21 11.5 21C9.657 21 7.932 20.485 6.468 19.592L3 21L4.408 17.532C3.515 16.068 3 14.343 3 12.5C3 7.253 7.253 3 12.5 3C17.747 3 21 7.253 21 11.5Z" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <h2 style={s.pageTitle}>Notificaciones WhatsApp</h2>
          <p style={s.pageSub}>Mensajes automáticos al cliente al crear o completar una orden</p>
        </div>
      </div>

      <div style={s.empresaRow}>
        {EMPRESAS.map((emp) => (
          <button key={emp} onClick={() => setEmpresa(emp)} style={{ ...s.empresaBtn, ...(empresa === emp ? s.empresaBtnActive : {}) }}>
            <span style={{ ...s.dot, background: configs[emp]?.habilitado ? "#22c55e" : "#cbd5e1" }} />
            {emp}
          </button>
        ))}
      </div>

      <div style={s.grid}>
        <div style={s.col}>

          {/* Toggle */}
          <div style={s.card}>
            <div style={s.toggleRow}>
              <div>
                <div style={s.cardLabel}>Activar para {empresa}</div>
                <div style={s.cardSub}>{cfg.habilitado ? "Activo — se enviará mensaje al crear y liquidar órdenes" : "Inactivo — no se enviará ningún mensaje"}</div>
              </div>
              <button onClick={() => set("habilitado", !cfg.habilitado)} style={{ ...s.toggle, background: cfg.habilitado ? "#2563eb" : "#e2e8f0" }}>
                <div style={{ ...s.knob, transform: cfg.habilitado ? "translateX(20px)" : "translateX(2px)" }} />
              </button>
            </div>
          </div>

          {/* Credentials */}
          <div style={s.card}>
            <div style={s.cardTitle}>Credenciales Evolution API</div>
            <div style={s.cardSub}>Datos de tu servidor Evolution API v2.3</div>
            <div style={s.fields}>
              <div style={s.fieldGroup}>
                <label style={s.label}>URL del servidor</label>
                <input style={s.input} placeholder="https://api.tuservidor.com" value={cfg.base_url || ""} onChange={(e) => set("base_url", e.target.value)} />
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>API Key</label>
                <div style={{ position: "relative" }}>
                  <input style={{ ...s.input, paddingRight: 36 }} type={showApiKey ? "text" : "password"} placeholder="********" value={cfg.api_key || ""} onChange={(e) => set("api_key", e.target.value)} />
                  <button onClick={() => setShowApiKey(!showApiKey)} style={s.eyeBtn}>{showApiKey ? "Ocultar" : "Ver"}</button>
                </div>
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Nombre de instancia</label>
                <input style={s.input} placeholder="mi-instancia" value={cfg.instance_name || ""} onChange={(e) => set("instance_name", e.target.value)} />
              </div>
            </div>
            {cfg.base_url && cfg.api_key && cfg.instance_name && (
              <div style={s.endpointBadge}>
                <span style={s.method}>POST</span>
                <code style={s.endpointCode}>{cfg.base_url.replace(/\/$/, "")}/message/sendText/<strong>{cfg.instance_name}</strong></code>
              </div>
            )}
          </div>

          {/* Test */}
          <div style={s.card}>
            <div style={s.cardTitle}>Probar conexión</div>
            <div style={s.cardSub}>Envía un mensaje de prueba a un número real</div>
            <div style={s.testRow}>
              <input style={{ ...s.input, flex: 1 }} placeholder="51987654321" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleTest()} />
              <button onClick={handleTest} disabled={testing} style={s.testBtn}>{testing ? "Enviando..." : "Enviar prueba"}</button>
            </div>
            {testResult && (
              <div style={{ ...s.testResult, background: testResult.ok ? "#f0fdf4" : "#fef2f2", color: testResult.ok ? "#166534" : "#991b1b", borderColor: testResult.ok ? "#bbf7d0" : "#fecaca" }}>
                {testResult.msg}
              </div>
            )}
          </div>
          <button onClick={handleSave} style={s.saveBtn} disabled={saving}>
            {saving ? "Guardando..." : "Guardar configuración — " + empresa}
          </button>
        </div>

        {/* Templates */}
        <div style={s.col}>
          <div style={s.card}>
            <div style={s.cardTitle}>Mensajes por tipo de orden</div>
            <div style={s.cardSub}>Haz clic en una variable para insertarla en el cursor</div>
            <div style={s.typeTabs}>
              {TIPOS.map((t) => (
                <button key={t.key} onClick={() => setActiveTpl(t.key)} style={{ ...s.typeTab, ...(activeTpl === t.key ? { background: t.bg, color: t.color, borderColor: t.dot } : {}) }}>
                  <span style={{ ...s.typeDot, background: t.color }} />{t.label}
                </button>
              ))}
            </div>
            <div style={s.varsWrap}>
              {VARIABLES.map((v) => (
                <button key={v.key} title={v.desc} onClick={() => insertVar(v.key)} style={s.varChip}>{v.key}</button>
              ))}
            </div>
            {activeType && (
              <div style={{ ...s.tplBlock, borderLeftColor: activeType.color }}>
                <div style={s.tplTypeLabel}>
                  <span style={{ ...s.tplDot, background: activeType.color }} />{activeType.label}
                </div>
                <textarea id="tpl-area" style={s.textarea} rows={4} value={cfg[activeTpl] || ""} onChange={(e) => set(activeTpl, e.target.value)} onFocus={() => setActiveTpl(activeTpl)} placeholder={`Mensaje para ${activeType.label}...`} />
                {cfg[activeTpl] && (
                  <div style={s.previewBox}>
                    <span style={s.previewLabel}>Vista previa</span>
                    <p style={s.previewText}>{previewMsg(cfg[activeTpl], empresa)}</p>
                  </div>
                )}
              </div>
            )}
            <div style={s.miniList}>
              {TIPOS.filter((t) => t.key !== activeTpl).map((t) => (
                <div key={t.key} onClick={() => setActiveTpl(t.key)} style={s.miniItem}>
                  <span style={{ ...s.miniDot, background: t.color }} />
                  <span style={s.miniLabel}>{t.label}</span>
                  <span style={s.miniPreview}>{previewMsg(cfg[t.key], empresa).slice(0, 60)}...</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "8px 4px 40px", fontFamily: "Inter, Arial, sans-serif", color: "#111827", position: "relative" },
  toast: { position: "fixed", top: 20, right: 20, padding: "12px 20px", borderRadius: 10, color: "#fff", fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" },
  pageHeader: { display: "flex", alignItems: "center", gap: 14, marginBottom: 24 },
  pageIconWrap: { width: 44, height: 44, borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  pageTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: "#163f86" },
  pageSub: { margin: "3px 0 0", fontSize: 13, color: "#5e718f" },
  empresaRow: { display: "flex", gap: 8, marginBottom: 20 },
  empresaBtn: { display: "flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 8, border: "1.5px solid #e4eaf4", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  empresaBtnActive: { background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" },
  dot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16, alignItems: "start" },
  col: { display: "grid", gap: 14 },
  card: { background: "#fff", borderRadius: 14, padding: "18px 20px", border: "1px solid #e4eaf4", boxShadow: "0 4px 16px -8px rgba(17,47,94,0.12)" },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#163f86", marginBottom: 3 },
  cardSub: { fontSize: 12, color: "#6b7280", marginBottom: 14 },
  cardLabel: { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 2 },
  toggleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 },
  toggle: { width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 },
  knob: { width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, transition: "transform 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" },
  fields: { display: "grid", gap: 12 },
  fieldGroup: { display: "grid", gap: 5 },
  label: { fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" },
  input: { width: "100%", padding: "9px 12px", border: "1.5px solid #e4eaf4", borderRadius: 8, fontSize: 13, color: "#111827", background: "#f8fafc", outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  eyeBtn: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0 },
  endpointBadge: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e4eaf4", borderRadius: 8 },
  method: { fontSize: 10, fontWeight: 700, background: "#2563eb", color: "#fff", padding: "2px 6px", borderRadius: 4, flexShrink: 0 },
  endpointCode: { fontSize: 11, color: "#374151", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  testRow: { display: "flex", gap: 8, alignItems: "center" },
  testBtn: { padding: "9px 16px", background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 8, color: "#166534", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" },
  testResult: { marginTop: 10, padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "1px solid" },
  saveBtn: { width: "100%", padding: "12px", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 8px rgba(37,99,235,0.25)" },
  typeTabs: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  typeTab: { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1.5px solid #e4eaf4", borderRadius: 7, background: "#f8fafc", color: "#374151", fontWeight: 600, fontSize: 12, cursor: "pointer" },
  typeDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  varsWrap: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px dashed #cbd5e1" },
  varChip: { padding: "4px 9px", background: "#fff", border: "1px solid #bfdbfe", borderRadius: 5, color: "#1d4ed8", fontSize: 11, fontFamily: "monospace", fontWeight: 600, cursor: "pointer" },
  tplBlock: { borderLeft: "3px solid #e4eaf4", paddingLeft: 14, marginBottom: 16 },
  tplTypeLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 },
  tplDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  textarea: { width: "100%", padding: "10px 12px", border: "1.5px solid #e4eaf4", borderRadius: 8, fontSize: 13, color: "#111827", background: "#f8fafc", outline: "none", resize: "vertical", fontFamily: "Inter, Arial, sans-serif", lineHeight: 1.6, boxSizing: "border-box" },
  previewBox: { marginTop: 8, padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 },
  previewLabel: { fontSize: 10, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 },
  previewText: { margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" },
  miniList: { display: "grid", gap: 8, borderTop: "1px solid #f1f5f9", paddingTop: 14, marginTop: 4 },
  miniItem: { display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "8px 10px", borderRadius: 8 },
  miniDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0, marginTop: 3 },
  miniLabel: { fontSize: 12, fontWeight: 700, color: "#374151", whiteSpace: "nowrap", minWidth: 80 },
  miniPreview: { fontSize: 11, color: "#9ca3af", lineHeight: 1.4 },
};












