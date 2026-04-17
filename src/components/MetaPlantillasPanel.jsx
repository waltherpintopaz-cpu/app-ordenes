import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

const META_BASE = "https://graph.facebook.com/v19.0";

const CATEGORIAS = [
  { value: "UTILITY",        label: "UTILITY — Notificaciones de servicio" },
  { value: "MARKETING",      label: "MARKETING — Promociones" },
  { value: "AUTHENTICATION", label: "AUTHENTICATION — Códigos de acceso" },
];
const IDIOMAS = [
  { value: "es",    label: "Español" },
  { value: "es_AR", label: "Español (Argentina)" },
  { value: "es_MX", label: "Español (México)" },
  { value: "en_US", label: "Inglés (EE.UU.)" },
];
const HEADER_TIPOS = [
  { value: "NONE", label: "Ninguno" }, { value: "TEXT", label: "Texto" },
  { value: "IMAGE", label: "Imagen" }, { value: "DOCUMENT", label: "Documento" },
  { value: "VIDEO", label: "Video" },
];
const BTN_TIPOS = [
  { value: "NONE", label: "Sin botón" }, { value: "QUICK_REPLY", label: "Respuesta rápida" },
  { value: "URL", label: "Ir al sitio web" }, { value: "PHONE", label: "Llamar a teléfono" },
];
const ESTADO_COLOR = {
  APPROVED: { bg: "#f0fdf4", color: "#16a34a", border: "#86efac" },
  PENDING:  { bg: "#fffbeb", color: "#d97706", border: "#fcd34d" },
  REJECTED: { bg: "#fff1f2", color: "#e11d48", border: "#fda4af" },
  PAUSED:   { bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" },
  DISABLED: { bg: "#f1f5f9", color: "#94a3b8", border: "#e2e8f0" },
};
const EMPRESAS = [
  { key: "americanet", label: "Americanet", color: "#0369a1" },
  { key: "dim",        label: "DIM",        color: "#7c3aed" },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const badge = (estado) => {
  const s = ESTADO_COLOR[estado] || ESTADO_COLOR.DISABLED;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
    background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{estado}</span>;
};
const extraerVariables = (texto) => {
  const matches = [...(texto || "").matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
};
const FORM_VACIO = {
  nombre: "", idioma: "es", categoria: "UTILITY",
  header_tipo: "NONE", header_texto: "", body: "", footer: "",
  btn_tipo: "NONE", btn_texto: "", btn_url: "", muestras: {},
};

/* Config vacía por empresa */
const cfgVacia = () => ({ americanet: { wabas: [] }, dim: { wabas: [] } });

export default function MetaPlantillasPanel() {
  const [tab, setTab] = useState("config");
  const [cfg, setCfg] = useState(cfgVacia());
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgMsg, setCfgMsg] = useState("");
  const [cfgEmpresa, setCfgEmpresa] = useState("americanet");
  const [wabasExpanded, setWabasExpanded] = useState({});

  /* Plantillas */
  const [pEmpresa, setPEmpresa] = useState("americanet");
  const [pWabaIdx, setPWabaIdx] = useState(0);
  const [plantillas, setPlantillas] = useState([]);
  const [loadingP, setLoadingP] = useState(false);
  const [pMsg, setPMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [creando, setCreando] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [plantillaEditando, setPlantillaEditando] = useState(null);
  const bodyRef = useRef(null);
  const headerRef = useRef(null);

  /* Prueba */
  const [prEmpresa, setPrEmpresa] = useState("americanet");
  const [prWabaIdx, setPrWabaIdx] = useState(0);
  const [prNumeroId, setPrNumeroId] = useState("");
  const [prPlantilla, setPrPlantilla] = useState("");
  const [prTelefono, setPrTelefono] = useState("");
  const [prVars, setPrVars] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [prMsg, setPrMsg] = useState("");

  /* ── Cargar config ── */
  useEffect(() => {
    supabase.from("meta_wa_config").select("config_json").eq("id", 1).maybeSingle()
      .then(({ data }) => {
        if (data?.config_json && Object.keys(data.config_json).length > 0)
          setCfg(data.config_json);
      });
  }, []);

  /* ── Guardar config ── */
  const guardarConfig = async () => {
    setSavingCfg(true); setCfgMsg("");
    try {
      const { error } = await supabase.from("meta_wa_config")
        .upsert({ id: 1, config_json: cfg, updated_at: new Date().toISOString() });
      if (error) throw error;
      setCfgMsg("✓ Configuración guardada");
    } catch (e) { setCfgMsg("Error: " + e.message); }
    finally { setSavingCfg(false); }
  };

  /* ── Helpers config ── */
  const updateWaba = (empresa, wabaIdx, field, value) =>
    setCfg(c => { const n = JSON.parse(JSON.stringify(c));
      n[empresa].wabas[wabaIdx][field] = value; return n; });

  const addWaba = (empresa) =>
    setCfg(c => { const n = JSON.parse(JSON.stringify(c));
      const id = uid();
      n[empresa].wabas.push({ id, waba_id: "", token: "", numeros: [] });
      setWabasExpanded(e => ({ ...e, [id]: true }));
      return n; });

  const removeWaba = (empresa, wabaIdx) =>
    setCfg(c => { const n = JSON.parse(JSON.stringify(c));
      n[empresa].wabas.splice(wabaIdx, 1); return n; });

  const addNumero = (empresa, wabaIdx) =>
    setCfg(c => { const n = JSON.parse(JSON.stringify(c));
      n[empresa].wabas[wabaIdx].numeros.push({ id: uid(), phone_number_id: "", nombre: "", numero: "" });
      return n; });

  const updateNumero = (empresa, wabaIdx, numIdx, field, value) =>
    setCfg(c => { const n = JSON.parse(JSON.stringify(c));
      n[empresa].wabas[wabaIdx].numeros[numIdx][field] = value; return n; });

  const removeNumero = (empresa, wabaIdx, numIdx) =>
    setCfg(c => { const n = JSON.parse(JSON.stringify(c));
      n[empresa].wabas[wabaIdx].numeros.splice(numIdx, 1); return n; });

  /* ── Waba/token activos para plantillas ── */
  const wabaActivoP = cfg[pEmpresa]?.wabas?.[pWabaIdx];

  /* ── Cargar plantillas ── */
  const cargarPlantillas = useCallback(async () => {
    if (!wabaActivoP?.waba_id || !wabaActivoP?.token)
      return setPMsg("Configura el WABA ID y Token para esta empresa primero.");
    setLoadingP(true); setPMsg("");
    try {
      const res = await fetch(
        `${META_BASE}/${wabaActivoP.waba_id}/message_templates?fields=id,name,language,category,status,components&limit=200&access_token=${wabaActivoP.token}`
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setPlantillas(json.data || []);
    } catch (e) { setPMsg("Error: " + e.message); }
    finally { setLoadingP(false); }
  }, [wabaActivoP]);

  /* ── Eliminar plantilla ── */
  const eliminar = async (templateId, nombre) => {
    if (!window.confirm(`¿Eliminar plantilla "${nombre}"?`)) return;
    try {
      const res = await fetch(
        `${META_BASE}/${wabaActivoP.waba_id}/message_templates?hsm_id=${templateId}&name=${nombre}&access_token=${wabaActivoP.token}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setPlantillas(p => p.filter(t => t.id !== templateId));
      setPMsg("✓ Plantilla eliminada");
    } catch (e) { setPMsg("Error: " + e.message); }
  };

  /* ── Editar plantilla ── */
  const editarPlantilla = (p) => {
    const prefix = pEmpresa === "dim" ? "dim_" : "amn_";
    const nombre = p.name.startsWith(prefix) ? p.name.slice(prefix.length) : p.name;
    const header = p.components?.find(c => c.type === "HEADER");
    const body   = p.components?.find(c => c.type === "BODY");
    const footer = p.components?.find(c => c.type === "FOOTER");
    const btn    = p.components?.find(c => c.type === "BUTTONS")?.buttons?.[0];
    let btn_tipo = "NONE";
    if (btn?.type === "QUICK_REPLY") btn_tipo = "QUICK_REPLY";
    else if (btn?.type === "URL")    btn_tipo = "URL";
    else if (btn?.type === "PHONE_NUMBER") btn_tipo = "PHONE";
    setForm({ nombre, idioma: p.language || "es", categoria: p.category || "UTILITY",
      header_tipo: header?.format || "NONE", header_texto: header?.text || "",
      body: body?.text || "", footer: footer?.text || "",
      btn_tipo, btn_texto: btn?.text || "", btn_url: btn?.url || btn?.phone_number || "", muestras: {} });
    setPlantillaEditando({ id: p.id, name: p.name });
    setShowForm(true); setFormMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ── Insertar variable ── */
  const insertarVariable = (campo, ref) => {
    const el = ref.current; if (!el) return;
    const inicio = el.selectionStart ?? el.value.length;
    const fin    = el.selectionEnd   ?? el.value.length;
    const texto  = form[campo];
    const siguiente = extraerVariables(texto).length > 0 ? Math.max(...extraerVariables(texto)) + 1 : 1;
    const nueva = texto.slice(0, inicio) + `{{${siguiente}}}` + texto.slice(fin);
    setForm(f => ({ ...f, [campo]: nueva }));
    setTimeout(() => { const pos = inicio + `{{${siguiente}}}`.length; el.focus(); el.setSelectionRange(pos, pos); }, 0);
  };

  /* ── Crear / actualizar plantilla ── */
  const crearPlantilla = async () => {
    if (!form.nombre.trim()) return setFormMsg("El nombre es obligatorio.");
    if (!form.body.trim())   return setFormMsg("El cuerpo del mensaje es obligatorio.");
    setCreando(true); setFormMsg("");
    const prefix = pEmpresa === "dim" ? "dim_" : "amn_";
    const nombreFinal = (prefix + form.nombre.trim().toLowerCase().replace(/\s+/g, "_")).slice(0, 512);
    const components = [];
    if (form.header_tipo !== "NONE") {
      const hComp = { type: "HEADER", format: form.header_tipo };
      if (form.header_tipo === "TEXT") hComp.text = form.header_texto;
      components.push(hComp);
    }
    const bodyComp = { type: "BODY", text: form.body };
    const varsBody = extraerVariables(form.body);
    if (varsBody.length > 0)
      bodyComp.example = { body_text: [varsBody.map(n => form.muestras[`body_${n}`] || `ejemplo${n}`)] };
    components.push(bodyComp);
    if (form.footer.trim()) components.push({ type: "FOOTER", text: form.footer });
    if (form.btn_tipo === "QUICK_REPLY")
      components.push({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: form.btn_texto }] });
    else if (form.btn_tipo === "URL")
      components.push({ type: "BUTTONS", buttons: [{ type: "URL", text: form.btn_texto, url: form.btn_url }] });
    else if (form.btn_tipo === "PHONE")
      components.push({ type: "BUTTONS", buttons: [{ type: "PHONE_NUMBER", text: form.btn_texto, phone_number: form.btn_url }] });
    try {
      if (plantillaEditando) {
        const delRes = await fetch(
          `${META_BASE}/${wabaActivoP.waba_id}/message_templates?hsm_id=${plantillaEditando.id}&name=${plantillaEditando.name}&access_token=${wabaActivoP.token}`,
          { method: "DELETE" });
        const delJson = await delRes.json();
        if (delJson.error) throw new Error("Error al eliminar la anterior: " + delJson.error.message);
      }
      const res = await fetch(`${META_BASE}/${wabaActivoP.waba_id}/message_templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${wabaActivoP.token}` },
        body: JSON.stringify({ name: nombreFinal, language: form.idioma, category: form.categoria, components }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setFormMsg(plantillaEditando ? "✓ Plantilla actualizada." : "✓ Plantilla enviada a revisión (PENDIENTE).");
      setShowForm(false); setForm(FORM_VACIO); setPlantillaEditando(null);
      cargarPlantillas();
    } catch (e) { setFormMsg("Error: " + e.message); }
    finally { setCreando(false); }
  };

  /* ── Enviar prueba ── */
  const enviarPrueba = async () => {
    if (!prTelefono.trim()) return setPrMsg("Ingresa el número de destino.");
    if (!prPlantilla)       return setPrMsg("Selecciona una plantilla.");
    const waba   = cfg[prEmpresa]?.wabas?.[prWabaIdx];
    const numero = waba?.numeros?.find(n => n.id === prNumeroId);
    if (!waba?.token)           return setPrMsg("Configura las credenciales de esta empresa.");
    if (!numero?.phone_number_id) return setPrMsg("Selecciona un número de envío.");
    setEnviando(true); setPrMsg("");
    const plantilla = plantillas.find(p => p.name === prPlantilla);
    if (!plantilla) return (setPrMsg("Plantilla no encontrada. Sincroniza primero."), setEnviando(false));
    const bodyComp = plantilla.components?.find(c => c.type === "BODY");
    const vars = extraerVariables(bodyComp?.text || "");
    const components = vars.length > 0 ? [{
      type: "body",
      parameters: vars.map(n => ({ type: "text", text: prVars[`v${n}`] || `{{${n}}}` })),
    }] : [];
    try {
      const res = await fetch(`${META_BASE}/${numero.phone_number_id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${waba.token}` },
        body: JSON.stringify({
          messaging_product: "whatsapp", to: prTelefono.replace(/\D/g, ""), type: "template",
          template: { name: plantilla.name, language: { code: plantilla.language },
            ...(components.length > 0 ? { components } : {}) },
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setPrMsg("✓ Mensaje enviado a +" + prTelefono.replace(/\D/g, ""));
    } catch (e) { setPrMsg("Error: " + e.message); }
    finally { setEnviando(false); }
  };

  const prefix = pEmpresa === "dim" ? "dim_" : "amn_";
  const plantillasFiltradas = plantillas.filter(p => p.name.startsWith(prefix));
  const getBodyText = (components = []) => components.find(c => c.type === "BODY")?.text || "";
  const varsBody = extraerVariables(form.body);

  /* ════ RENDER ════ */
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e8edf5",
        boxShadow: "0 2px 16px rgba(15,23,42,0.06)", padding: "22px 26px" }}>

        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Plantillas Meta</h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
            Gestiona plantillas de WhatsApp Business API (Meta oficial)
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #f1f5f9" }}>
          {[{ key: "config", label: "⚙ Configuración" }, { key: "plantillas", label: "📋 Plantillas" }, { key: "prueba", label: "📤 Enviar prueba" }]
            .map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ padding: "8px 18px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                  borderBottom: tab === t.key ? "2px solid #2563eb" : "2px solid transparent",
                  background: "none", color: tab === t.key ? "#2563eb" : "#64748b", marginBottom: -2 }}>
                {t.label}
              </button>
            ))}
        </div>

        {/* ══ TAB: CONFIGURACIÓN ══ */}
        {tab === "config" && (
          <div>
            {/* Selector empresa */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {EMPRESAS.map(e => (
                <button key={e.key} onClick={() => setCfgEmpresa(e.key)}
                  style={{ padding: "7px 20px", fontSize: 13, fontWeight: 700, borderRadius: 9, border: "none",
                    cursor: "pointer", background: cfgEmpresa === e.key ? e.color : "#f1f5f9",
                    color: cfgEmpresa === e.key ? "#fff" : "#64748b" }}>
                  {e.label}
                </button>
              ))}
            </div>

            {/* Lista de WABAs */}
            <div style={{ display: "grid", gap: 14, maxWidth: 660 }}>
              {(cfg[cfgEmpresa]?.wabas || []).map((waba, wi) => (
                <div key={waba.id} style={{ background: "#f8fafc", borderRadius: 14, border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
                  {/* Header WABA */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", cursor: "pointer", background: "#f1f5f9" }}
                    onClick={() => setWabasExpanded(e => ({ ...e, [waba.id]: !e[waba.id] }))}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
                      {wabasExpanded[waba.id] ? "▾" : "▸"} WABA {wi + 1}
                      {waba.waba_id && <span style={{ fontSize: 11, color: "#64748b", fontWeight: 400, marginLeft: 8 }}>{waba.waba_id}</span>}
                    </span>
                    <button onClick={e => { e.stopPropagation(); if (window.confirm("¿Eliminar este WABA?")) removeWaba(cfgEmpresa, wi); }}
                      style={{ background: "none", border: "none", color: "#e11d48", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
                  </div>

                  {/* Body WABA */}
                  {wabasExpanded[waba.id] && (
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ display: "grid", gap: 10 }}>
                        <div>
                          <label style={lbl}>WABA ID</label>
                          <input value={waba.waba_id} onChange={e => updateWaba(cfgEmpresa, wi, "waba_id", e.target.value)}
                            placeholder="Ej: 1177872660476042" style={{ ...inp, fontFamily: "monospace" }} />
                        </div>
                        <div>
                          <label style={lbl}>Access Token (permanente)</label>
                          <input value={waba.token} onChange={e => updateWaba(cfgEmpresa, wi, "token", e.target.value)}
                            placeholder="EAABxxxx..." style={{ ...inp, fontFamily: "monospace", fontSize: 11 }} />
                        </div>
                      </div>

                      {/* Números */}
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: "#475569" }}>
                            📲 Números de teléfono
                          </p>
                          <button onClick={() => addNumero(cfgEmpresa, wi)}
                            style={{ ...btnS("#0369a1"), fontSize: 11, padding: "4px 12px" }}>
                            + Agregar número
                          </button>
                        </div>

                        {waba.numeros.length === 0 && (
                          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Sin números. Haz clic en "Agregar número".</p>
                        )}

                        <div style={{ display: "grid", gap: 10 }}>
                          {waba.numeros.map((num, ni) => (
                            <div key={num.id} style={{ background: "#fff", borderRadius: 10,
                              border: "1px solid #e2e8f0", padding: "12px 14px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 12, color: "#0f172a" }}>
                                  {num.nombre || `Número ${ni + 1}`}
                                </span>
                                <button onClick={() => removeNumero(cfgEmpresa, wi, ni)}
                                  style={{ background: "none", border: "none", color: "#e11d48", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                <div>
                                  <label style={lbl}>Nombre / Rol</label>
                                  <input value={num.nombre} onChange={e => updateNumero(cfgEmpresa, wi, ni, "nombre", e.target.value)}
                                    placeholder="Ej: Ventas, Pagos..." style={inp} />
                                </div>
                                <div>
                                  <label style={lbl}>Phone Number ID</label>
                                  <input value={num.phone_number_id} onChange={e => updateNumero(cfgEmpresa, wi, ni, "phone_number_id", e.target.value)}
                                    placeholder="824888677376395" style={{ ...inp, fontFamily: "monospace", fontSize: 11 }} />
                                </div>
                                <div>
                                  <label style={lbl}>Número (display)</label>
                                  <input value={num.numero} onChange={e => updateNumero(cfgEmpresa, wi, ni, "numero", e.target.value)}
                                    placeholder="+51 950 485 133" style={inp} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <button onClick={() => addWaba(cfgEmpresa)}
                style={{ ...btnS("#6366f1"), padding: "9px", width: "100%", fontSize: 13 }}>
                + Agregar WABA para {EMPRESAS.find(e => e.key === cfgEmpresa)?.label}
              </button>
            </div>

            <div style={{ marginTop: 20, maxWidth: 660 }}>
              <button onClick={guardarConfig} disabled={savingCfg} style={{ ...btnS("#16a34a"), padding: "10px 28px", fontSize: 13 }}>
                {savingCfg ? "Guardando..." : "💾 Guardar configuración"}
              </button>
              {cfgMsg && <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 600,
                color: cfgMsg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{cfgMsg}</p>}
            </div>
          </div>
        )}

        {/* ══ TAB: PLANTILLAS ══ */}
        {tab === "plantillas" && (
          <div>
            {/* Empresa + WABA selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {EMPRESAS.map(e => (
                  <button key={e.key} onClick={() => { setPEmpresa(e.key); setPWabaIdx(0); setPlantillas([]); }}
                    style={{ padding: "6px 16px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none",
                      cursor: "pointer", background: pEmpresa === e.key ? e.color : "#f1f5f9",
                      color: pEmpresa === e.key ? "#fff" : "#64748b" }}>
                    {e.label}
                  </button>
                ))}
              </div>

              {/* Selector WABA si hay más de uno */}
              {(cfg[pEmpresa]?.wabas?.length || 0) > 1 && (
                <select value={pWabaIdx} onChange={e => { setPWabaIdx(Number(e.target.value)); setPlantillas([]); }}
                  style={{ ...inp, width: "auto", fontSize: 12, cursor: "pointer" }}>
                  {cfg[pEmpresa].wabas.map((w, i) => (
                    <option key={w.id} value={i}>WABA {i + 1} — {w.waba_id || "sin configurar"}</option>
                  ))}
                </select>
              )}

              <button onClick={cargarPlantillas} disabled={loadingP}
                style={{ ...btnS("#0369a1"), padding: "6px 14px", fontSize: 12 }}>
                {loadingP ? "Cargando..." : "🔄 Sincronizar"}
              </button>
              <button onClick={() => { setShowForm(v => !v); setFormMsg(""); setForm(FORM_VACIO); setPlantillaEditando(null); }}
                style={{ ...btnS(showForm ? "#64748b" : "#16a34a"), padding: "6px 14px", fontSize: 12 }}>
                {showForm ? "✕ Cancelar" : "+ Nueva plantilla"}
              </button>
            </div>

            {pMsg && <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 12,
              color: pMsg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{pMsg}</p>}

            {/* Formulario nueva/editar plantilla */}
            {showForm && (
              <div style={{ background: "#f8fafc", borderRadius: 14, padding: "20px 22px",
                border: "1.5px solid #e2e8f0", marginBottom: 20 }}>
                <p style={{ margin: "0 0 16px", fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
                  {plantillaEditando ? "✏ Editar plantilla" : "Nueva plantilla"} —{" "}
                  <span style={{ color: EMPRESAS.find(e => e.key === pEmpresa)?.color }}>
                    {EMPRESAS.find(e => e.key === pEmpresa)?.label}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginLeft: 8 }}>prefijo: {prefix}</span>
                  {plantillaEditando && <span style={{ fontSize: 11, color: "#d97706", marginLeft: 8 }}>⚠ Se eliminará la anterior</span>}
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 14px" }}>
                  <div>
                    <label style={lbl}>Nombre *</label>
                    <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="ej: confirmacion_servicio" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Idioma</label>
                    <select value={form.idioma} onChange={e => setForm(f => ({ ...f, idioma: e.target.value }))}
                      style={{ ...inp, cursor: "pointer" }}>
                      {IDIOMAS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Categoría</label>
                    <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                      style={{ ...inp, cursor: "pointer" }}>
                      {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Encabezado */}
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>Encabezado</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {HEADER_TIPOS.map(t => (
                      <button key={t.value} onClick={() => setForm(f => ({ ...f, header_tipo: t.value }))}
                        style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none", cursor: "pointer",
                          background: form.header_tipo === t.value ? "#2563eb" : "#e2e8f0",
                          color: form.header_tipo === t.value ? "#fff" : "#64748b" }}>{t.label}</button>
                    ))}
                  </div>
                  {form.header_tipo === "TEXT" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input ref={headerRef} value={form.header_texto}
                        onChange={e => setForm(f => ({ ...f, header_texto: e.target.value }))}
                        placeholder="Texto del encabezado" style={{ ...inp, flex: 1 }} />
                      <button onClick={() => insertarVariable("header_texto", headerRef)}
                        style={{ ...btnS("#6366f1"), padding: "8px 12px", fontSize: 11 }}>+ Variable</button>
                    </div>
                  )}
                  {["IMAGE","DOCUMENT","VIDEO"].includes(form.header_tipo) && (
                    <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0", background: "#f1f5f9", borderRadius: 6, padding: "6px 10px" }}>
                      ℹ La URL del archivo se enviará al momento de usar la plantilla.
                    </p>
                  )}
                </div>

                {/* Cuerpo */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={lbl}>Cuerpo del mensaje *</label>
                    <button onClick={() => insertarVariable("body", bodyRef)}
                      style={{ ...btnS("#6366f1"), padding: "5px 12px", fontSize: 11 }}>+ Agregar variable</button>
                  </div>
                  <textarea ref={bodyRef} value={form.body}
                    onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                    placeholder={"Hola {{1}}, tu servicio ha sido activado.\nFecha: {{2}}"}
                    rows={5} style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />
                </div>

                {/* Muestras de variables */}
                {varsBody.length > 0 && (
                  <div style={{ marginTop: 12, background: "#fffbeb", borderRadius: 10, padding: "12px 14px", border: "1px solid #fcd34d" }}>
                    <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 12, color: "#92400e" }}>📝 Muestras de variables</p>
                    <p style={{ margin: "0 0 10px", fontSize: 11, color: "#78350f" }}>Meta necesita ejemplos para revisar. No uses datos reales.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {varsBody.map(n => (
                        <div key={n}>
                          <label style={{ ...lbl, color: "#92400e" }}>{"{{" + n + "}}"} — Muestra</label>
                          <input value={form.muestras[`body_${n}`] || ""}
                            onChange={e => setForm(f => ({ ...f, muestras: { ...f.muestras, [`body_${n}`]: e.target.value } }))}
                            placeholder={n === 1 ? "Juan Pérez" : n === 2 ? "Plan Básico" : "valor " + n} style={inp} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pie + Botón */}
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>Pie de página <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span></label>
                  <input value={form.footer} onChange={e => setForm(f => ({ ...f, footer: e.target.value }))}
                    placeholder="Ej: No respondas a este mensaje" style={inp} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>Botón de acción</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {BTN_TIPOS.map(t => (
                      <button key={t.value} onClick={() => setForm(f => ({ ...f, btn_tipo: t.value }))}
                        style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none", cursor: "pointer",
                          background: form.btn_tipo === t.value ? "#2563eb" : "#e2e8f0",
                          color: form.btn_tipo === t.value ? "#fff" : "#64748b" }}>{t.label}</button>
                    ))}
                  </div>
                  {form.btn_tipo !== "NONE" && (
                    <div style={{ display: "grid", gridTemplateColumns: form.btn_tipo !== "QUICK_REPLY" ? "1fr 1fr" : "1fr", gap: 8 }}>
                      <div><label style={lbl}>Texto del botón</label>
                        <input value={form.btn_texto} onChange={e => setForm(f => ({ ...f, btn_texto: e.target.value }))} placeholder="Ver detalles" style={inp} /></div>
                      {form.btn_tipo === "URL" && <div><label style={lbl}>URL</label>
                        <input value={form.btn_url} onChange={e => setForm(f => ({ ...f, btn_url: e.target.value }))} placeholder="https://..." style={inp} /></div>}
                      {form.btn_tipo === "PHONE" && <div><label style={lbl}>Teléfono</label>
                        <input value={form.btn_url} onChange={e => setForm(f => ({ ...f, btn_url: e.target.value }))} placeholder="+51999999999" style={inp} /></div>}
                    </div>
                  )}
                </div>

                {formMsg && <p style={{ fontSize: 12, fontWeight: 600, margin: "12px 0 0",
                  color: formMsg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{formMsg}</p>}
                <button onClick={crearPlantilla} disabled={creando}
                  style={{ ...btnS("#2563eb"), marginTop: 16, width: "100%", padding: "10px" }}>
                  {creando ? "Enviando a Meta..." : "🚀 Crear y enviar a revisión"}
                </button>
              </div>
            )}

            {/* Lista plantillas */}
            {!loadingP && plantillas.length === 0 && (
              <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "30px 0" }}>
                Haz clic en "Sincronizar" para cargar las plantillas.
              </p>
            )}
            {loadingP && <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", padding: "24px 0" }}>Cargando plantillas...</p>}
            {plantillasFiltradas.length === 0 && !loadingP && plantillas.length > 0 && (
              <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "20px 0" }}>
                No hay plantillas con prefijo {prefix}.
              </p>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              {plantillasFiltradas.map(p => (
                <div key={p.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8edf5",
                  padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{p.name}</span>
                      {badge(p.status)}
                      <span style={{ fontSize: 11, color: "#94a3b8", background: "#f1f5f9", borderRadius: 6, padding: "1px 7px" }}>{p.category}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{p.language}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                      {getBodyText(p.components).slice(0, 200) || "—"}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button onClick={() => editarPlantilla(p)}
                      style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "none",
                        cursor: "pointer", background: "#eff6ff", color: "#2563eb", whiteSpace: "nowrap" }}>✏ Editar</button>
                    <button onClick={() => eliminar(p.id, p.name)}
                      style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "none",
                        cursor: "pointer", background: "#fff1f2", color: "#e11d48", whiteSpace: "nowrap" }}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ TAB: ENVIAR PRUEBA ══ */}
        {tab === "prueba" && (
          <div style={{ maxWidth: 560 }}>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#64748b" }}>
              Envía un mensaje de prueba usando una plantilla aprobada.
            </p>

            {/* Empresa */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Empresa</label>
              <div style={{ display: "flex", gap: 6 }}>
                {EMPRESAS.map(e => (
                  <button key={e.key} onClick={() => { setPrEmpresa(e.key); setPrWabaIdx(0); setPrNumeroId(""); setPrPlantilla(""); setPlantillas([]); }}
                    style={{ padding: "7px 18px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", cursor: "pointer",
                      background: prEmpresa === e.key ? e.color : "#f1f5f9",
                      color: prEmpresa === e.key ? "#fff" : "#64748b" }}>{e.label}</button>
                ))}
              </div>
            </div>

            {/* WABA selector */}
            {(cfg[prEmpresa]?.wabas?.length || 0) > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>WABA</label>
                <select value={prWabaIdx} onChange={e => { setPrWabaIdx(Number(e.target.value)); setPrNumeroId(""); setPrPlantilla(""); setPlantillas([]); }}
                  style={{ ...inp, cursor: "pointer" }}>
                  {cfg[prEmpresa].wabas.map((w, i) => (
                    <option key={w.id} value={i}>WABA {i + 1} — {w.waba_id || "sin configurar"}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Número emisor */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Enviar desde (número)</label>
              {(cfg[prEmpresa]?.wabas?.[prWabaIdx]?.numeros?.length || 0) === 0 ? (
                <p style={{ fontSize: 12, color: "#dc2626", background: "#fff1f2", borderRadius: 8, padding: "8px 12px", margin: 0 }}>
                  No hay números configurados para esta empresa. Ve a Configuración.
                </p>
              ) : (
                <select value={prNumeroId} onChange={e => { setPrNumeroId(e.target.value); setPrPlantilla(""); setPlantillas([]); }}
                  style={{ ...inp, cursor: "pointer" }}>
                  <option value="">— Seleccionar número —</option>
                  {cfg[prEmpresa].wabas[prWabaIdx].numeros.map(n => (
                    <option key={n.id} value={n.id}>{n.nombre} {n.numero && `— ${n.numero}`}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Cargar plantillas del WABA seleccionado */}
            {prNumeroId && plantillas.length === 0 && (
              <button onClick={async () => {
                const waba = cfg[prEmpresa]?.wabas?.[prWabaIdx];
                if (!waba?.waba_id || !waba?.token) return setPrMsg("Configura WABA ID y Token primero.");
                setLoadingP(true);
                const res = await fetch(`${META_BASE}/${waba.waba_id}/message_templates?fields=id,name,language,category,status,components&limit=200&access_token=${waba.token}`);
                const json = await res.json();
                if (!json.error) setPlantillas(json.data || []);
                setLoadingP(false);
              }} style={{ ...btnS("#0369a1"), marginBottom: 14, fontSize: 12 }}>
                {loadingP ? "Cargando..." : "🔄 Cargar plantillas"}
              </button>
            )}

            {/* Plantilla */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Plantilla</label>
              {plantillas.filter(p => p.name.startsWith(prEmpresa === "dim" ? "dim_" : "amn_") && p.status === "APPROVED").length === 0 ? (
                <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                  {plantillas.length > 0 ? "No hay plantillas APROBADAS." : "Carga las plantillas primero."}
                </p>
              ) : (
                <select value={prPlantilla} onChange={e => { setPrPlantilla(e.target.value); setPrVars({}); }}
                  style={{ ...inp, cursor: "pointer" }}>
                  <option value="">— Seleccionar plantilla —</option>
                  {plantillas.filter(p => p.name.startsWith(prEmpresa === "dim" ? "dim_" : "amn_") && p.status === "APPROVED")
                    .map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              )}
            </div>

            {/* Vista previa */}
            {prPlantilla && (() => {
              const p = plantillas.find(t => t.name === prPlantilla);
              const bodyText = getBodyText(p?.components);
              return bodyText ? (
                <div style={{ marginBottom: 14, background: "#f0f9ff", borderRadius: 10, padding: "10px 14px", border: "1px solid #bae6fd" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#0369a1" }}>Vista previa:</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#0f172a", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{bodyText}</p>
                </div>
              ) : null;
            })()}

            {/* Variables */}
            {prPlantilla && (() => {
              const p = plantillas.find(t => t.name === prPlantilla);
              const vars = extraerVariables(getBodyText(p?.components));
              return vars.length > 0 ? (
                <div style={{ marginBottom: 14, background: "#fffbeb", borderRadius: 10, padding: "12px 14px", border: "1px solid #fcd34d" }}>
                  <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 12, color: "#92400e" }}>Valores de las variables</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                    {vars.map(n => (
                      <div key={n}>
                        <label style={{ ...lbl, color: "#92400e" }}>{"{{" + n + "}}"}</label>
                        <input value={prVars[`v${n}`] || ""} onChange={e => setPrVars(v => ({ ...v, [`v${n}`]: e.target.value }))}
                          placeholder={`Valor para {{${n}}}`} style={inp} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Destino */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Número de destino</label>
              <input value={prTelefono} onChange={e => setPrTelefono(e.target.value)}
                placeholder="Ej: 51999888777 (con código de país, sin +)" style={inp} />
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>Perú → 51XXXXXXXXX</p>
            </div>

            <button onClick={enviarPrueba} disabled={enviando} style={{ ...btnS("#16a34a"), width: "100%", padding: "10px" }}>
              {enviando ? "Enviando..." : "📤 Enviar mensaje de prueba"}
            </button>
            {prMsg && <p style={{ margin: "12px 0 0", fontSize: 12, fontWeight: 600,
              color: prMsg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{prMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 4 };
const inp = { width: "100%", padding: "8px 11px", border: "1.5px solid #e2e8f0", borderRadius: 8,
  fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" };
const btnS = (bg) => ({ padding: "8px 18px", background: bg, color: "#fff", border: "none",
  borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer" });
