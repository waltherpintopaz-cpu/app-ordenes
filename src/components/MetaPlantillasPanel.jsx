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
  { value: "NONE",     label: "Ninguno" },
  { value: "TEXT",     label: "Texto" },
  { value: "IMAGE",    label: "Imagen" },
  { value: "DOCUMENT", label: "Documento" },
  { value: "VIDEO",    label: "Video" },
];
const BTN_TIPOS = [
  { value: "NONE",        label: "Sin botón" },
  { value: "QUICK_REPLY", label: "Respuesta rápida" },
  { value: "URL",         label: "Ir al sitio web" },
  { value: "PHONE",       label: "Llamar a teléfono" },
];

const ESTADO_COLOR = {
  APPROVED:  { bg: "#f0fdf4", color: "#16a34a", border: "#86efac" },
  PENDING:   { bg: "#fffbeb", color: "#d97706", border: "#fcd34d" },
  REJECTED:  { bg: "#fff1f2", color: "#e11d48", border: "#fda4af" },
  PAUSED:    { bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" },
  DISABLED:  { bg: "#f1f5f9", color: "#94a3b8", border: "#e2e8f0" },
};

const badge = (estado) => {
  const s = ESTADO_COLOR[estado] || ESTADO_COLOR.DISABLED;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
      background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {estado}
    </span>
  );
};

const FORM_VACIO = {
  nombre: "", idioma: "es", categoria: "UTILITY",
  header_tipo: "NONE", header_texto: "",
  body: "", footer: "",
  btn_tipo: "NONE", btn_texto: "", btn_url: "",
  muestras: {},
};

/* Extrae los números de variables {{N}} de un texto */
const extraerVariables = (texto) => {
  const matches = [...texto.matchAll(/\{\{(\d+)\}\}/g)];
  const nums = [...new Set(matches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
  return nums;
};

export default function MetaPlantillasPanel() {
  const [tab, setTab] = useState("config");
  const [cfg, setCfg] = useState({
    waba_id: "", access_token: "",
    americanet_phone_id: "", americanet_phone_label: "",
    dim_phone_id: "", dim_phone_label: "",
  });
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgMsg, setCfgMsg] = useState("");

  const [empresa, setEmpresa] = useState("americanet");
  const [plantillas, setPlantillas] = useState([]);
  const [loadingP, setLoadingP] = useState(false);
  const [pMsg, setPMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [creando, setCreando] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [plantillaEditando, setPlantillaEditando] = useState(null); // { id, name }

  const bodyRef = useRef(null);
  const headerRef = useRef(null);

  /* ── Cargar config ── */
  useEffect(() => {
    supabase.from("meta_wa_config").select("*").eq("id", 1).maybeSingle()
      .then(({ data }) => { if (data) setCfg(data); });
  }, []);

  /* ── Insertar variable en un campo ── */
  const insertarVariable = (campo, ref) => {
    const el = ref.current;
    if (!el) return;
    const inicio = el.selectionStart ?? el.value.length;
    const fin    = el.selectionEnd   ?? el.value.length;
    const texto  = form[campo];
    const vars   = extraerVariables(texto);
    const siguiente = vars.length > 0 ? Math.max(...vars) + 1 : 1;
    const nueva = texto.slice(0, inicio) + `{{${siguiente}}}` + texto.slice(fin);
    setForm(f => ({ ...f, [campo]: nueva }));
    setTimeout(() => {
      const pos = inicio + `{{${siguiente}}}`.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  /* ── Guardar config ── */
  const guardarConfig = async () => {
    setSavingCfg(true); setCfgMsg("");
    try {
      const { error } = await supabase.from("meta_wa_config")
        .upsert({ id: 1, ...cfg, updated_at: new Date().toISOString() });
      if (error) throw error;
      setCfgMsg("✓ Configuración guardada");
    } catch (e) { setCfgMsg("Error: " + e.message); }
    finally { setSavingCfg(false); }
  };

  /* ── Cargar plantillas desde Meta ── */
  const cargarPlantillas = useCallback(async () => {
    if (!cfg.waba_id || !cfg.access_token) return setPMsg("Configura las credenciales primero.");
    setLoadingP(true); setPMsg("");
    try {
      const res = await fetch(
        `${META_BASE}/${cfg.waba_id}/message_templates?fields=id,name,language,category,status,components&limit=200&access_token=${cfg.access_token}`
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setPlantillas(json.data || []);
    } catch (e) { setPMsg("Error: " + e.message); }
    finally { setLoadingP(false); }
  }, [cfg.waba_id, cfg.access_token]);

  /* ── Eliminar plantilla ── */
  const eliminar = async (templateId, nombre) => {
    if (!window.confirm(`¿Eliminar plantilla "${nombre}"?`)) return;
    try {
      const res = await fetch(
        `${META_BASE}/${cfg.waba_id}/message_templates?hsm_id=${templateId}&name=${nombre}&access_token=${cfg.access_token}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setPlantillas(p => p.filter(t => t.id !== templateId));
      setPMsg("✓ Plantilla eliminada");
    } catch (e) { setPMsg("Error: " + e.message); }
  };

  /* ── Precargar formulario para editar ── */
  const editarPlantilla = (p) => {
    const prefix = empresa === "dim" ? "dim_" : "amn_";
    const nombre = p.name.startsWith(prefix) ? p.name.slice(prefix.length) : p.name;

    const header = p.components?.find(c => c.type === "HEADER");
    const body   = p.components?.find(c => c.type === "BODY");
    const footer = p.components?.find(c => c.type === "FOOTER");
    const btns   = p.components?.find(c => c.type === "BUTTONS");
    const btn    = btns?.buttons?.[0];

    let btn_tipo = "NONE";
    if (btn?.type === "QUICK_REPLY")   btn_tipo = "QUICK_REPLY";
    else if (btn?.type === "URL")      btn_tipo = "URL";
    else if (btn?.type === "PHONE_NUMBER") btn_tipo = "PHONE";

    setForm({
      nombre,
      idioma:       p.language || "es",
      categoria:    p.category || "UTILITY",
      header_tipo:  header?.format || "NONE",
      header_texto: header?.text   || "",
      body:         body?.text     || "",
      footer:       footer?.text   || "",
      btn_tipo,
      btn_texto:    btn?.text      || "",
      btn_url:      btn?.url || btn?.phone_number || "",
      muestras:     {},
    });
    setPlantillaEditando({ id: p.id, name: p.name });
    setShowForm(true);
    setFormMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ── Crear plantilla ── */
  const crearPlantilla = async () => {
    if (!form.nombre.trim()) return setFormMsg("El nombre es obligatorio.");
    if (!form.body.trim())   return setFormMsg("El cuerpo del mensaje es obligatorio.");
    setCreando(true); setFormMsg("");

    const prefix = empresa === "dim" ? "dim_" : "amn_";
    const nombreFinal = (prefix + form.nombre.trim().toLowerCase().replace(/\s+/g, "_")).slice(0, 512);

    const components = [];

    if (form.header_tipo !== "NONE") {
      const hComp = { type: "HEADER", format: form.header_tipo };
      if (form.header_tipo === "TEXT") hComp.text = form.header_texto;
      components.push(hComp);
    }

    /* Body con muestras de variables */
    const bodyComp = { type: "BODY", text: form.body };
    const varsBody = extraerVariables(form.body);
    if (varsBody.length > 0) {
      bodyComp.example = {
        body_text: [varsBody.map(n => form.muestras[`body_${n}`] || `ejemplo${n}`)]
      };
    }
    components.push(bodyComp);

    if (form.footer.trim()) components.push({ type: "FOOTER", text: form.footer });

    if (form.btn_tipo === "QUICK_REPLY") {
      components.push({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: form.btn_texto }] });
    } else if (form.btn_tipo === "URL") {
      components.push({ type: "BUTTONS", buttons: [{ type: "URL", text: form.btn_texto, url: form.btn_url }] });
    } else if (form.btn_tipo === "PHONE") {
      components.push({ type: "BUTTONS", buttons: [{ type: "PHONE_NUMBER", text: form.btn_texto, phone_number: form.btn_url }] });
    }

    try {
      /* Si estamos editando, eliminar la plantilla anterior primero */
      if (plantillaEditando) {
        const delRes = await fetch(
          `${META_BASE}/${cfg.waba_id}/message_templates?hsm_id=${plantillaEditando.id}&name=${plantillaEditando.name}&access_token=${cfg.access_token}`,
          { method: "DELETE" }
        );
        const delJson = await delRes.json();
        if (delJson.error) throw new Error("Error al eliminar la anterior: " + delJson.error.message);
      }

      const res = await fetch(`${META_BASE}/${cfg.waba_id}/message_templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.access_token}` },
        body: JSON.stringify({ name: nombreFinal, language: form.idioma, category: form.categoria, components }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setFormMsg(plantillaEditando
        ? "✓ Plantilla actualizada y enviada a revisión."
        : "✓ Plantilla enviada a revisión (estado: PENDIENTE).");
      setShowForm(false);
      setForm(FORM_VACIO);
      setPlantillaEditando(null);
      cargarPlantillas();
    } catch (e) { setFormMsg("Error: " + e.message); }
    finally { setCreando(false); }
  };

  /* ── Plantillas filtradas por empresa ── */
  const prefix = empresa === "dim" ? "dim_" : "amn_";
  const plantillasFiltradas = plantillas.filter(p => p.name.startsWith(prefix));

  /* ── Extraer body text de componentes ── */
  const getBodyText = (components = []) =>
    components.find(c => c.type === "BODY")?.text || "";

  /* Variables detectadas en el body del formulario */
  const varsBody = extraerVariables(form.body);

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e8edf5",
        boxShadow: "0 2px 16px rgba(15,23,42,0.06)", padding: "22px 26px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Plantillas Meta</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
              Gestiona plantillas de WhatsApp Business API (Meta oficial)
            </p>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #f1f5f9" }}>
          {[
            { key: "config",     label: "⚙ Configuración" },
            { key: "plantillas", label: "📋 Plantillas" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "8px 18px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                borderBottom: tab === t.key ? "2px solid #2563eb" : "2px solid transparent",
                background: "none", color: tab === t.key ? "#2563eb" : "#64748b",
                marginBottom: -2 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════
            TAB: CONFIGURACIÓN
        ══════════════════════ */}
        {tab === "config" && (
          <div style={{ display: "grid", gap: 20, maxWidth: 620 }}>

            <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", border: "1px solid #e2e8f0" }}>
              <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
                🔑 Credenciales Meta
              </p>
              <label style={lbl}>WABA ID</label>
              <input value={cfg.waba_id} onChange={e => setCfg(c => ({ ...c, waba_id: e.target.value }))}
                placeholder="Ej: 123456789012345" style={inp} />
              <label style={{ ...lbl, marginTop: 10 }}>Access Token (permanente)</label>
              <input value={cfg.access_token} onChange={e => setCfg(c => ({ ...c, access_token: e.target.value }))}
                placeholder="EAABxxxx..." style={{ ...inp, fontFamily: "monospace", fontSize: 11 }} />
            </div>

            {[
              { key: "americanet", label: "Americanet", color: "#0369a1", phoneIdKey: "americanet_phone_id", phoneLblKey: "americanet_phone_label" },
              { key: "dim",        label: "DIM",        color: "#7c3aed", phoneIdKey: "dim_phone_id",        phoneLblKey: "dim_phone_label" },
            ].map(emp => (
              <div key={emp.key} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px",
                border: `1.5px solid ${emp.color}33` }}>
                <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13, color: emp.color }}>
                  📲 Número para {emp.label}
                </p>
                <label style={lbl}>Identificador del número (Phone Number ID)</label>
                <input value={cfg[emp.phoneIdKey] || ""}
                  onChange={e => setCfg(c => ({ ...c, [emp.phoneIdKey]: e.target.value }))}
                  placeholder="Ej: 824888677376395"
                  style={{ ...inp, fontFamily: "monospace" }} />
                <label style={{ ...lbl, marginTop: 8 }}>Etiqueta del número (opcional)</label>
                <input value={cfg[emp.phoneLblKey] || ""}
                  onChange={e => setCfg(c => ({ ...c, [emp.phoneLblKey]: e.target.value }))}
                  placeholder="Ej: +51 950 485 133"
                  style={inp} />
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#94a3b8" }}>
                  Encuéntralo en Meta Developers → WhatsApp → Configuración de la API → "Identificador del número de teléfono"
                </p>
              </div>
            ))}

            <button onClick={guardarConfig} disabled={savingCfg} style={btn("#16a34a")}>
              {savingCfg ? "Guardando..." : "💾 Guardar configuración"}
            </button>

            {cfgMsg && (
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600,
                color: cfgMsg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{cfgMsg}</p>
            )}
          </div>
        )}

        {/* ══════════════════════
            TAB: PLANTILLAS
        ══════════════════════ */}
        {tab === "plantillas" && (
          <div>
            {/* Selector empresa + acciones */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { key: "americanet", label: "Americanet", color: "#0369a1" },
                  { key: "dim",        label: "DIM",        color: "#7c3aed" },
                ].map(e => (
                  <button key={e.key} onClick={() => setEmpresa(e.key)}
                    style={{ padding: "6px 16px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none",
                      cursor: "pointer",
                      background: empresa === e.key ? e.color : "#f1f5f9",
                      color: empresa === e.key ? "#fff" : "#64748b" }}>
                    {e.label}
                  </button>
                ))}
              </div>
              <button onClick={cargarPlantillas} disabled={loadingP}
                style={{ ...btn("#0369a1"), padding: "6px 14px", fontSize: 12 }}>
                {loadingP ? "Cargando..." : "🔄 Sincronizar"}
              </button>
              <button onClick={() => { setShowForm(v => !v); setFormMsg(""); setForm(FORM_VACIO); setPlantillaEditando(null); }}
                style={{ ...btn(showForm ? "#64748b" : "#16a34a"), padding: "6px 14px", fontSize: 12 }}>
                {showForm ? "✕ Cancelar" : "+ Nueva plantilla"}
              </button>
            </div>

            {pMsg && (
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 12,
                color: pMsg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{pMsg}</p>
            )}

            {/* ── Formulario nueva plantilla ── */}
            {showForm && (
              <div style={{ background: "#f8fafc", borderRadius: 14, padding: "20px 22px",
                border: "1.5px solid #e2e8f0", marginBottom: 20 }}>
                <p style={{ margin: "0 0 16px", fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
                  {plantillaEditando ? "✏ Editar plantilla" : "Nueva plantilla"} —{" "}
                  <span style={{ color: empresa === "dim" ? "#7c3aed" : "#0369a1" }}>
                    {empresa === "dim" ? "DIM" : "Americanet"}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginLeft: 8 }}>
                    prefijo: {prefix}
                  </span>
                  {plantillaEditando && (
                    <span style={{ fontSize: 11, color: "#d97706", marginLeft: 8 }}>
                      ⚠ Se eliminará la anterior y se creará una nueva
                    </span>
                  )}
                </p>

                {/* Nombre / Idioma / Categoría */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 14px" }}>
                  <div>
                    <label style={lbl}>Nombre *</label>
                    <input value={form.nombre}
                      onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="ej: confirmacion_servicio" style={inp} />
                    <p style={{ margin: "4px 0 0", fontSize: 10, color: "#94a3b8" }}>
                      Solo letras, números y guiones bajos
                    </p>
                  </div>
                  <div>
                    <label style={lbl}>Idioma</label>
                    <select value={form.idioma}
                      onChange={e => setForm(f => ({ ...f, idioma: e.target.value }))}
                      style={{ ...inp, cursor: "pointer" }}>
                      {IDIOMAS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Categoría</label>
                    <select value={form.categoria}
                      onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
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
                        style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none",
                          cursor: "pointer",
                          background: form.header_tipo === t.value ? "#2563eb" : "#e2e8f0",
                          color: form.header_tipo === t.value ? "#fff" : "#64748b" }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {form.header_tipo === "TEXT" && (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input ref={headerRef} value={form.header_texto}
                        onChange={e => setForm(f => ({ ...f, header_texto: e.target.value }))}
                        placeholder="Texto del encabezado" style={{ ...inp, flex: 1 }} />
                      <button onClick={() => insertarVariable("header_texto", headerRef)}
                        style={{ ...btn("#6366f1"), padding: "8px 12px", fontSize: 11, whiteSpace: "nowrap" }}>
                        + Variable
                      </button>
                    </div>
                  )}
                  {["IMAGE", "DOCUMENT", "VIDEO"].includes(form.header_tipo) && (
                    <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0", background: "#f1f5f9",
                      borderRadius: 6, padding: "6px 10px" }}>
                      ℹ La URL del archivo se enviará al momento de usar la plantilla.
                    </p>
                  )}
                </div>

                {/* Cuerpo */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={lbl}>Cuerpo del mensaje *</label>
                    <button onClick={() => insertarVariable("body", bodyRef)}
                      style={{ ...btn("#6366f1"), padding: "5px 12px", fontSize: 11 }}>
                      + Agregar variable
                    </button>
                  </div>
                  <textarea ref={bodyRef} value={form.body}
                    onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                    placeholder={"Hola {{1}}, tu servicio ha sido activado correctamente.\nFecha: {{2}}\nTécnico: {{3}}"}
                    rows={5} style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>
                    Usa "Agregar variable" para insertar {'{{1}}'}, {'{{2}}'}, etc. en la posición del cursor.
                  </p>
                </div>

                {/* Muestras de variables */}
                {varsBody.length > 0 && (
                  <div style={{ marginTop: 12, background: "#fffbeb", borderRadius: 10, padding: "12px 14px",
                    border: "1px solid #fcd34d" }}>
                    <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 12, color: "#92400e" }}>
                      📝 Muestras de variables
                    </p>
                    <p style={{ margin: "0 0 10px", fontSize: 11, color: "#78350f" }}>
                      Meta necesita ejemplos para revisar la plantilla. No incluyas datos reales de clientes.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {varsBody.map(n => (
                        <div key={n}>
                          <label style={{ ...lbl, color: "#92400e" }}>{'{{' + n + '}}'} — Muestra</label>
                          <input value={form.muestras[`body_${n}`] || ""}
                            onChange={e => setForm(f => ({ ...f, muestras: { ...f.muestras, [`body_${n}`]: e.target.value } }))}
                            placeholder={`Ej: ${n === 1 ? "Juan Pérez" : n === 2 ? "Plan Básico" : "valor " + n}`}
                            style={inp} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pie de página */}
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>Pie de página <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span></label>
                  <input value={form.footer}
                    onChange={e => setForm(f => ({ ...f, footer: e.target.value }))}
                    placeholder="Ej: No respondas a este mensaje" style={inp} />
                </div>

                {/* Botones */}
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>Botón de acción</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {BTN_TIPOS.map(t => (
                      <button key={t.value} onClick={() => setForm(f => ({ ...f, btn_tipo: t.value }))}
                        style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none",
                          cursor: "pointer",
                          background: form.btn_tipo === t.value ? "#2563eb" : "#e2e8f0",
                          color: form.btn_tipo === t.value ? "#fff" : "#64748b" }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {form.btn_tipo !== "NONE" && (
                    <div style={{ display: "grid",
                      gridTemplateColumns: form.btn_tipo !== "QUICK_REPLY" ? "1fr 1fr" : "1fr", gap: 8 }}>
                      <div>
                        <label style={lbl}>Texto del botón</label>
                        <input value={form.btn_texto}
                          onChange={e => setForm(f => ({ ...f, btn_texto: e.target.value }))}
                          placeholder="Ej: Ver detalles" style={inp} />
                      </div>
                      {form.btn_tipo === "URL" && (
                        <div>
                          <label style={lbl}>URL de destino</label>
                          <input value={form.btn_url}
                            onChange={e => setForm(f => ({ ...f, btn_url: e.target.value }))}
                            placeholder="https://..." style={inp} />
                        </div>
                      )}
                      {form.btn_tipo === "PHONE" && (
                        <div>
                          <label style={lbl}>Número de teléfono</label>
                          <input value={form.btn_url}
                            onChange={e => setForm(f => ({ ...f, btn_url: e.target.value }))}
                            placeholder="+51999999999" style={inp} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {formMsg && (
                  <p style={{ fontSize: 12, fontWeight: 600, margin: "12px 0 0",
                    color: formMsg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{formMsg}</p>
                )}

                <button onClick={crearPlantilla} disabled={creando}
                  style={{ ...btn("#2563eb"), marginTop: 16, width: "100%", padding: "10px" }}>
                  {creando ? "Enviando a Meta..." : "🚀 Crear y enviar a revisión"}
                </button>
              </div>
            )}

            {/* ── Lista de plantillas ── */}
            {!loadingP && plantillas.length === 0 && (
              <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "30px 0" }}>
                Haz clic en "Sincronizar" para cargar las plantillas de Meta.
              </p>
            )}
            {loadingP && (
              <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", padding: "24px 0" }}>
                Cargando plantillas...
              </p>
            )}
            {plantillasFiltradas.length === 0 && !loadingP && plantillas.length > 0 && (
              <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "20px 0" }}>
                No hay plantillas para {empresa === "dim" ? "DIM" : "Americanet"} (prefijo: {prefix}).
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
                      <span style={{ fontSize: 11, color: "#94a3b8", background: "#f1f5f9",
                        borderRadius: 6, padding: "1px 7px" }}>{p.category}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{p.language}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                      {getBodyText(p.components).slice(0, 200) || "—"}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button onClick={() => editarPlantilla(p)}
                      style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "none",
                        cursor: "pointer", background: "#eff6ff", color: "#2563eb", whiteSpace: "nowrap" }}>
                      ✏ Editar
                    </button>
                    <button onClick={() => eliminar(p.id, p.name)}
                      style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "none",
                        cursor: "pointer", background: "#fff1f2", color: "#e11d48", whiteSpace: "nowrap" }}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Estilos compartidos ── */
const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 4 };
const inp = {
  width: "100%", padding: "8px 11px", border: "1.5px solid #e2e8f0", borderRadius: 8,
  fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff",
};
const btn = (bg) => ({
  padding: "8px 18px", background: bg, color: "#fff", border: "none",
  borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
});
