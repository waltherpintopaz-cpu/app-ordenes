import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

const META_BASE = "https://graph.facebook.com/v19.0";

const CATEGORIAS = ["UTILITY", "MARKETING", "AUTHENTICATION"];
const IDIOMAS = [
  { value: "es", label: "Español" },
  { value: "es_AR", label: "Español (Argentina)" },
  { value: "es_MX", label: "Español (México)" },
  { value: "en_US", label: "Inglés (EE.UU.)" },
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

  /* ── Cargar config ── */
  useEffect(() => {
    supabase.from("meta_wa_config").select("*").eq("id", 1).maybeSingle()
      .then(({ data }) => { if (data) setCfg(data); });
  }, []);

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

  /* ── Crear plantilla ── */
  const crearPlantilla = async () => {
    if (!form.nombre.trim()) return setFormMsg("El nombre es obligatorio.");
    if (!form.body.trim())   return setFormMsg("El cuerpo (body) es obligatorio.");
    setCreando(true); setFormMsg("");

    const prefix = empresa === "dim" ? "dim_" : "amn_";
    const nombreFinal = (prefix + form.nombre.trim().toLowerCase().replace(/\s+/g, "_")).slice(0, 512);

    const components = [];

    if (form.header_tipo !== "NONE") {
      const hComp = { type: "HEADER", format: form.header_tipo };
      if (form.header_tipo === "TEXT") hComp.text = form.header_texto;
      components.push(hComp);
    }

    components.push({ type: "BODY", text: form.body });

    if (form.footer.trim()) components.push({ type: "FOOTER", text: form.footer });

    if (form.btn_tipo === "QUICK_REPLY") {
      components.push({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: form.btn_texto }] });
    } else if (form.btn_tipo === "URL") {
      components.push({ type: "BUTTONS", buttons: [{ type: "URL", text: form.btn_texto, url: form.btn_url }] });
    } else if (form.btn_tipo === "PHONE") {
      components.push({ type: "BUTTONS", buttons: [{ type: "PHONE_NUMBER", text: form.btn_texto, phone_number: form.btn_url }] });
    }

    try {
      const res = await fetch(`${META_BASE}/${cfg.waba_id}/message_templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.access_token}` },
        body: JSON.stringify({ name: nombreFinal, language: form.idioma, category: form.categoria, components }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setFormMsg("✓ Plantilla enviada a revisión (estado: PENDING).");
      setShowForm(false);
      setForm(FORM_VACIO);
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

            {/* Credenciales globales */}
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

            {/* Números por empresa — ingreso manual */}
            {[
              { key: "americanet", label: "Americanet", color: "#0369a1", phoneIdKey: "americanet_phone_id", phoneLblKey: "americanet_phone_label" },
              { key: "dim",        label: "DIM",        color: "#7c3aed", phoneIdKey: "dim_phone_id",        phoneLblKey: "dim_phone_label" },
            ].map(emp => (
              <div key={emp.key} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px",
                border: `1.5px solid ${emp.color}33` }}>
                <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13, color: emp.color }}>
                  📲 Número para {emp.label}
                </p>
                <label style={lbl}>Phone Number ID</label>
                <input value={cfg[emp.phoneIdKey] || ""}
                  onChange={e => setCfg(c => ({ ...c, [emp.phoneIdKey]: e.target.value }))}
                  placeholder="Ej: 824888677376395"
                  style={{ ...inp, fontFamily: "monospace" }} />
                <label style={{ ...lbl, marginTop: 8 }}>Nombre / Etiqueta (opcional)</label>
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
              <button onClick={() => { setShowForm(v => !v); setFormMsg(""); }}
                style={{ ...btn("#16a34a"), padding: "6px 14px", fontSize: 12 }}>
                {showForm ? "✕ Cancelar" : "+ Nueva plantilla"}
              </button>
            </div>

            {pMsg && (
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 12,
                color: pMsg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{pMsg}</p>
            )}

            {/* ── Formulario nueva plantilla ── */}
            {showForm && (
              <div style={{ background: "#f8fafc", borderRadius: 14, padding: "18px 20px",
                border: "1.5px solid #e2e8f0", marginBottom: 20 }}>
                <p style={{ margin: "0 0 14px", fontWeight: 800, fontSize: 13, color: "#0f172a" }}>
                  Nueva plantilla — <span style={{ color: empresa === "dim" ? "#7c3aed" : "#0369a1" }}>
                    {empresa === "dim" ? "DIM" : "Americanet"}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginLeft: 8 }}>
                    (prefijo automático: {prefix})
                  </span>
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 14px" }}>
                  <div>
                    <label style={lbl}>Nombre *</label>
                    <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="ej: bienvenida_cliente" style={inp} />
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
                      {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Header */}
                <div style={{ marginTop: 12 }}>
                  <label style={lbl}>Header</label>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    {["NONE", "TEXT", "IMAGE", "DOCUMENT", "VIDEO"].map(t => (
                      <button key={t} onClick={() => setForm(f => ({ ...f, header_tipo: t }))}
                        style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none",
                          cursor: "pointer",
                          background: form.header_tipo === t ? "#2563eb" : "#e2e8f0",
                          color: form.header_tipo === t ? "#fff" : "#64748b" }}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {form.header_tipo === "TEXT" && (
                    <input value={form.header_texto} onChange={e => setForm(f => ({ ...f, header_texto: e.target.value }))}
                      placeholder="Texto del header" style={inp} />
                  )}
                  {["IMAGE", "DOCUMENT", "VIDEO"].includes(form.header_tipo) && (
                    <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>
                      La URL del archivo se proporciona al enviar el mensaje.
                    </p>
                  )}
                </div>

                {/* Body */}
                <div style={{ marginTop: 12 }}>
                  <label style={lbl}>Body * <span style={{ fontWeight: 400, color: "#94a3b8" }}>
                    (usa {'{{1}}'}, {'{{2}}'} para variables)
                  </span></label>
                  <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                    placeholder="Hola {{1}}, tu servicio {{2}} ha sido activado correctamente."
                    rows={4} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
                </div>

                {/* Footer */}
                <div style={{ marginTop: 10 }}>
                  <label style={lbl}>Footer <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span></label>
                  <input value={form.footer} onChange={e => setForm(f => ({ ...f, footer: e.target.value }))}
                    placeholder="Ej: No responder a este mensaje" style={inp} />
                </div>

                {/* Botones */}
                <div style={{ marginTop: 12 }}>
                  <label style={lbl}>Botón</label>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    {["NONE", "QUICK_REPLY", "URL", "PHONE"].map(t => (
                      <button key={t} onClick={() => setForm(f => ({ ...f, btn_tipo: t }))}
                        style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none",
                          cursor: "pointer",
                          background: form.btn_tipo === t ? "#2563eb" : "#e2e8f0",
                          color: form.btn_tipo === t ? "#fff" : "#64748b" }}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {form.btn_tipo !== "NONE" && (
                    <div style={{ display: "grid", gridTemplateColumns: form.btn_tipo !== "QUICK_REPLY" ? "1fr 1fr" : "1fr", gap: 8 }}>
                      <input value={form.btn_texto} onChange={e => setForm(f => ({ ...f, btn_texto: e.target.value }))}
                        placeholder="Texto del botón" style={inp} />
                      {form.btn_tipo === "URL" && (
                        <input value={form.btn_url} onChange={e => setForm(f => ({ ...f, btn_url: e.target.value }))}
                          placeholder="https://..." style={inp} />
                      )}
                      {form.btn_tipo === "PHONE" && (
                        <input value={form.btn_url} onChange={e => setForm(f => ({ ...f, btn_url: e.target.value }))}
                          placeholder="+51999999999" style={inp} />
                      )}
                    </div>
                  )}
                </div>

                {formMsg && (
                  <p style={{ fontSize: 12, fontWeight: 600, margin: "10px 0 0",
                    color: formMsg.startsWith("✓") ? "#16a34a" : "#dc2626" }}>{formMsg}</p>
                )}

                <button onClick={crearPlantilla} disabled={creando}
                  style={{ ...btn("#2563eb"), marginTop: 14 }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{p.name}</span>
                      {badge(p.status)}
                      <span style={{ fontSize: 11, color: "#94a3b8", background: "#f1f5f9",
                        borderRadius: 6, padding: "1px 7px" }}>{p.category}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{p.language}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                      {getBodyText(p.components).slice(0, 160) || "—"}
                    </p>
                  </div>
                  <button onClick={() => eliminar(p.id, p.name)}
                    style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "none",
                      cursor: "pointer", background: "#fff1f2", color: "#e11d48", whiteSpace: "nowrap" }}>
                    Eliminar
                  </button>
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
