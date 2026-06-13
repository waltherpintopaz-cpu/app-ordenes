import React, { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "../supabaseClient";
import logoAmericanet from "../assets/americanet-logo-new-trimmed.png";

const CAMPOS_VACIOS = {
  tipo: "reclamo",
  nombres: "",
  dni: "",
  telefono: "",
  email: "",
  direccion: "",
  bien_contratado: "Servicio de Internet",
  monto_contratado: "",
  descripcion: "",
  pedido: "",
};

const ESTADOS = {
  pendiente:  { label: "Pendiente",  color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  en_proceso: { label: "En proceso", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  resuelto:   { label: "Resuelto",   color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
  cerrado:    { label: "Cerrado",    color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" },
};

function fmtFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function diasTranscurridos(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
        {label} {required && <span style={{ color: "#DC2626" }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = {
  width: "100%", border: "1px solid #D1D5DB", borderRadius: 8,
  padding: "10px 12px", fontSize: 13, color: "#111827", background: "#fff",
  boxSizing: "border-box", fontFamily: "inherit", outline: "none",
};

// ── PDF ────────────────────────────────────────────────────────────────────────
function generarPDF(r) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  let y = 0;

  // Cabecera azul
  doc.setFillColor(0, 61, 165);
  doc.rect(0, 0, W, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("LIBRO DE RECLAMACIONES", W / 2, 16, { align: "center" });
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text("Americanet Fiber Solution S.A.C.", W / 2, 23, { align: "center" });
  doc.setFontSize(9);
  doc.text("Ley N° 29571 · D.S. N° 011-2011-PCM · D.S. N° 058-2017-PCM", W / 2, 29, { align: "center" });
  doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text(`Código: ${r.codigo}`, W / 2, 37, { align: "center" });

  y = 50;
  doc.setTextColor(17, 24, 39);

  const bloque = (titulo, filas) => {
    doc.setFillColor(239, 246, 255);
    doc.rect(14, y, W - 28, 7, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 61, 165);
    doc.text(titulo.toUpperCase(), 18, y + 5);
    y += 10;
    doc.setFont("helvetica", "normal"); doc.setTextColor(17, 24, 39);
    filas.forEach(([label, val]) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.text(label + ":", 18, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(String(val || "—"), 130);
      doc.text(lines, 60, y);
      y += lines.length * 5 + 2;
    });
    y += 4;
  };

  const est = ESTADOS[r.estado] || ESTADOS.pendiente;
  bloque("Estado del trámite", [
    ["Tipo",            r.tipo === "reclamo" ? "RECLAMO" : "QUEJA"],
    ["Estado",          est.label],
    ["Fecha registro",  fmtFecha(r.fecha_registro)],
    ["Días transcurridos", diasTranscurridos(r.fecha_registro) + " de 30 días hábiles"],
    ...(r.fecha_respuesta ? [["Fecha respuesta", fmtFecha(r.fecha_respuesta)]] : []),
  ]);

  bloque("Datos del reclamante", [
    ["Nombres",   r.nombres],
    ["DNI",       r.dni],
    ["Teléfono",  r.telefono],
    ["Correo",    r.email || "—"],
    ["Dirección", r.direccion || "—"],
  ]);

  bloque("Bien contratado", [
    ["Servicio", r.bien_contratado || "—"],
    ["Monto mensual", r.monto_contratado ? `S/ ${Number(r.monto_contratado).toFixed(2)}` : "—"],
  ]);

  bloque("Detalle del " + (r.tipo === "reclamo" ? "reclamo" : "queja"), [
    ["Descripción", r.descripcion],
    ["Pedido",      r.pedido],
  ]);

  if (r.respuesta) {
    bloque("Respuesta de la empresa", [
      ["Respuesta", r.respuesta],
    ]);
  }

  // Pie
  doc.setFillColor(243, 244, 246);
  doc.rect(0, 282, W, 15, "F");
  doc.setFontSize(7.5); doc.setTextColor(107, 114, 128); doc.setFont("helvetica", "normal");
  doc.text("Si no está conforme con la respuesta, puede acudir a INDECOPI: www.indecopi.gob.pe · 224-7777", W / 2, 289, { align: "center" });
  doc.text(`Documento generado el ${new Date().toLocaleDateString("es-PE")}`, W / 2, 293, { align: "center" });

  doc.save(`Reclamo-${r.codigo}.pdf`);
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────────
export default function LibroReclamacionesPage() {
  const params = new URLSearchParams(window.location.search);
  const codigoParam = params.get("codigo") || "";

  const [tab, setTab] = useState(codigoParam ? "consultar" : "registrar");

  // ── Tab Registrar ──
  const [form, setForm]     = useState(CAMPOS_VACIOS);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado]   = useState(null);
  const [errorForm, setErrorForm] = useState(null);

  // ── Tab Consultar ──
  const [codigo, setCodigo]     = useState(codigoParam);
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorBusq, setErrorBusq] = useState(null);

  // Auto-buscar si viene código por URL
  useEffect(() => {
    if (codigoParam) buscarCodigo(codigoParam);
  }, []);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function generarCodigo(tipo) {
    const prefix = tipo === "reclamo" ? "REC" : "QJA";
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${fecha}-${rand}`;
  }

  async function enviar(e) {
    e.preventDefault();
    setErrorForm(null);
    if (!form.nombres.trim() || !form.dni.trim() || !form.telefono.trim() || !form.descripcion.trim() || !form.pedido.trim()) {
      setErrorForm("Por favor completa todos los campos obligatorios."); return;
    }
    if (form.dni.replace(/\D/g, "").length < 8) {
      setErrorForm("El DNI debe tener 8 dígitos."); return;
    }
    setEnviando(true);
    const codigoNuevo = generarCodigo(form.tipo);
    try {
      const { error } = await supabase.from("libro_reclamaciones").insert([{
        codigo:           codigoNuevo,
        tipo:             form.tipo,
        nombres:          form.nombres.trim(),
        dni:              form.dni.replace(/\D/g, ""),
        telefono:         form.telefono.trim(),
        email:            form.email.trim() || null,
        direccion:        form.direccion.trim() || null,
        bien_contratado:  form.bien_contratado,
        monto_contratado: form.monto_contratado ? parseFloat(form.monto_contratado) : null,
        descripcion:      form.descripcion.trim(),
        pedido:           form.pedido.trim(),
        estado:           "pendiente",
        fecha_registro:   new Date().toISOString(),
      }]);
      if (error) throw new Error(error.message);
      setEnviado({ codigo: codigoNuevo, tipo: form.tipo });
      setForm(CAMPOS_VACIOS);
    } catch (err) {
      setErrorForm("Error al enviar. Intenta nuevamente o llámanos al (054) 000-000.");
    }
    setEnviando(false);
  }

  async function buscarCodigo(c) {
    const q = (c || codigo).trim().toUpperCase();
    if (!q) { setErrorBusq("Ingresa tu código de seguimiento."); return; }
    setBuscando(true); setErrorBusq(null); setResultado(null);
    const { data, error } = await supabase
      .from("libro_reclamaciones")
      .select("*")
      .eq("codigo", q)
      .single();
    if (error || !data) setErrorBusq("No se encontró ningún registro con ese código.");
    else setResultado(data);
    setBuscando(false);
  }

  const trackingURL = `${window.location.origin}/libro-reclamaciones?codigo=${resultado?.codigo || ""}`;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#003DA5 0%,#0A2E5F 60%,#001a3a 100%)",
      fontFamily: "'Inter',system-ui,-apple-system,sans-serif", padding: "32px 16px 48px" }}>
      <div style={{ position:"fixed", width:320, height:320, borderRadius:"50%", background:"rgba(255,255,255,0.04)", top:-100, left:-120, pointerEvents:"none" }} />
      <div style={{ position:"fixed", width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.03)", bottom:60, right:-60, pointerEvents:"none" }} />

      <div style={{ maxWidth: 560, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src={logoAmericanet} alt="Americanet" style={{ height: 46, filter: "brightness(0) invert(1)", opacity: 0.95 }} />
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 7, letterSpacing: 2, textTransform: "uppercase" }}>
            Fiber Solution S.A.C.
          </div>
        </div>

        {/* Tarjeta */}
        <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>

          {/* Cabecera */}
          <div style={{ background: "#003DA5", padding: "18px 22px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="#fff" strokeWidth="1.8"/>
                <path d="M7 8h10M7 12h10M7 16h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>Libro de Reclamaciones</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 }}>Americanet Fiber Solution S.A.C.</div>
            </div>
            <div style={{ background: "#22c55e", borderRadius: 6, padding: "4px 10px" }}>
              <span style={{ color: "#fff", fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>VIRTUAL</span>
            </div>
          </div>

          {/* Aviso legal */}
          <div style={{ background: "#EFF6FF", padding: "8px 20px", borderBottom: "1px solid #D9E3F8" }}>
            <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.7, margin: 0 }}>
              <strong style={{ color: "#003DA5" }}>Base legal:</strong> Ley N° 29571 · D.S. N° 011-2011-PCM · D.S. N° 058-2017-PCM.
              Plazo de respuesta: <strong>30 días calendario</strong>.
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB" }}>
            {[["registrar", "📋 Registrar reclamo"], ["consultar", "🔍 Consultar mi reclamo"]].map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, border: "none", borderBottom: `3px solid ${tab === t ? "#003DA5" : "transparent"}`,
                  background: tab === t ? "#EFF6FF" : "#fff", color: tab === t ? "#003DA5" : "#6B7280",
                  fontWeight: tab === t ? 700 : 500, fontSize: 13, padding: "13px 8px",
                  cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                {label}
              </button>
            ))}
          </div>

          {/* ══ TAB REGISTRAR ══ */}
          {tab === "registrar" && (<>
            {enviado ? (
              <div style={{ padding: "36px 28px", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
                <div style={{ fontWeight: 800, fontSize: 19, color: "#111827", marginBottom: 8 }}>
                  {enviado.tipo === "reclamo" ? "Reclamo registrado" : "Queja registrada"}
                </div>
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, display: "inline-block", padding: "8px 22px", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}>Código de seguimiento</div>
                  <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 22, color: "#003DA5", marginTop: 2 }}>{enviado.codigo}</div>
                </div>
                <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.7, marginBottom: 20 }}>
                  Recibirás respuesta en máximo <strong>30 días calendario</strong>.<br/>
                  Guarda tu código para hacer seguimiento.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={() => { setTab("consultar"); setCodigo(enviado.codigo); setTimeout(() => buscarCodigo(enviado.codigo), 100); }}
                    style={{ background: "#003DA5", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    Ver seguimiento
                  </button>
                  <button onClick={() => setEnviado(null)}
                    style={{ background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 8, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    Registrar otro
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={enviar} style={{ padding: "22px 22px 26px" }}>

                {/* Tipo */}
                <Field label="Tipo de registro" required>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[["reclamo","📋 Reclamo","Disconformidad con el servicio"],
                      ["queja","💬 Queja","Malestar por la atención recibida"]].map(([val, label, desc]) => (
                      <button key={val} type="button" onClick={() => set("tipo", val)}
                        style={{ border: `2px solid ${form.tipo === val ? "#003DA5" : "#E5E7EB"}`,
                          borderRadius: 10, padding: "10px 12px", background: form.tipo === val ? "#EFF6FF" : "#fff",
                          cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all .15s" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: form.tipo === val ? "#003DA5" : "#374151" }}>{label}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{desc}</div>
                      </button>
                    ))}
                  </div>
                </Field>

                <hr style={{ border: "none", borderTop: "1px solid #F3F4F6", margin: "4px 0 14px" }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Datos del reclamante</div>

                <Field label="Nombres y apellidos" required>
                  <input style={inp} placeholder="Ej: Juan Pérez García" value={form.nombres} onChange={e => set("nombres", e.target.value)} />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="DNI" required>
                    <input style={inp} placeholder="12345678" maxLength={8} value={form.dni} onChange={e => set("dni", e.target.value.replace(/\D/g, ""))} />
                  </Field>
                  <Field label="Teléfono / Celular" required>
                    <input style={inp} placeholder="9XXXXXXXX" value={form.telefono} onChange={e => set("telefono", e.target.value)} />
                  </Field>
                </div>
                <Field label="Correo electrónico">
                  <input style={inp} type="email" placeholder="correo@ejemplo.com" value={form.email} onChange={e => set("email", e.target.value)} />
                </Field>
                <Field label="Dirección">
                  <input style={inp} placeholder="Calle, Urbanización, Distrito" value={form.direccion} onChange={e => set("direccion", e.target.value)} />
                </Field>

                <hr style={{ border: "none", borderTop: "1px solid #F3F4F6", margin: "4px 0 14px" }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Bien contratado</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Tipo de servicio">
                    <select style={{ ...inp, background: "#fff" }} value={form.bien_contratado} onChange={e => set("bien_contratado", e.target.value)}>
                      <option>Servicio de Internet</option>
                      <option>Servicio de Cable TV</option>
                      <option>Internet + Cable TV</option>
                      <option>Otro</option>
                    </select>
                  </Field>
                  <Field label="Monto mensual (S/)">
                    <input style={inp} type="number" min="0" step="0.01" placeholder="0.00" value={form.monto_contratado} onChange={e => set("monto_contratado", e.target.value)} />
                  </Field>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid #F3F4F6", margin: "4px 0 14px" }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Detalle</div>

                <Field label="Descripción del problema" required>
                  <textarea style={{ ...inp, minHeight: 85, resize: "vertical", lineHeight: 1.6 }}
                    placeholder="Describe detalladamente lo ocurrido..."
                    value={form.descripcion} onChange={e => set("descripcion", e.target.value)} />
                </Field>
                <Field label="¿Qué solicitas?" required>
                  <textarea style={{ ...inp, minHeight: 65, resize: "vertical", lineHeight: 1.6 }}
                    placeholder="Ej: Solicito la devolución del cobro indebido..."
                    value={form.pedido} onChange={e => set("pedido", e.target.value)} />
                </Field>

                {errorForm && (
                  <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#DC2626", marginBottom: 12, fontWeight: 600 }}>
                    {errorForm}
                  </div>
                )}

                <button type="submit" disabled={enviando}
                  style={{ width: "100%", background: enviando ? "#9CA3AF" : "#003DA5", color: "#fff", border: "none",
                    borderRadius: 10, padding: "14px", fontWeight: 700, fontSize: 15,
                    cursor: enviando ? "not-allowed" : "pointer", fontFamily: "inherit",
                    boxShadow: enviando ? "none" : "0 4px 16px rgba(0,61,165,0.3)" }}>
                  {enviando ? "Enviando..." : `Enviar ${form.tipo}`}
                </button>
                <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
                  Al enviar aceptas que tus datos sean usados para gestionar tu {form.tipo} conforme a la Ley N° 29571.
                </p>
              </form>
            )}
          </>)}

          {/* ══ TAB CONSULTAR ══ */}
          {tab === "consultar" && (
            <div style={{ padding: "22px 22px 26px" }}>
              <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 14, lineHeight: 1.6 }}>
                Ingresa el código que recibiste al registrar tu reclamo o queja.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <input style={{ ...inp, flex: 1, textTransform: "uppercase", fontFamily: "monospace", fontWeight: 700, letterSpacing: 1 }}
                  placeholder="Ej: REC-20260613-4821"
                  value={codigo}
                  onChange={e => setCodigo(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && buscarCodigo()}
                />
                <button onClick={() => buscarCodigo()} disabled={buscando}
                  style={{ background: "#003DA5", color: "#fff", border: "none", borderRadius: 8,
                    padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: buscando ? "not-allowed" : "pointer",
                    fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {buscando ? "..." : "Consultar"}
                </button>
              </div>

              {errorBusq && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#DC2626", fontWeight: 600, textAlign: "center" }}>
                  {errorBusq}
                </div>
              )}

              {resultado && (() => {
                const est = ESTADOS[resultado.estado] || ESTADOS.pendiente;
                const dias = diasTranscurridos(resultado.fecha_registro);
                const diasRestantes = Math.max(0, 30 - dias);
                const pct = Math.min(100, Math.round((dias / 30) * 100));

                return (
                  <div>
                    {/* Estado */}
                    <div style={{ background: est.bg, border: `1px solid ${est.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, marginBottom: 3 }}>Estado actual</div>
                          <div style={{ fontWeight: 800, fontSize: 18, color: est.color }}>{est.label}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, marginBottom: 3 }}>Código</div>
                          <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 14, color: "#003DA5" }}>{resultado.codigo}</div>
                        </div>
                      </div>
                      {/* Barra de tiempo */}
                      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 5 }}>
                        Día {dias} de 30 · {diasRestantes > 0 ? `${diasRestantes} días restantes` : "Plazo vencido"}
                      </div>
                      <div style={{ background: "#E5E7EB", borderRadius: 4, height: 6, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "#DC2626" : pct > 70 ? "#D97706" : "#003DA5", borderRadius: 4, transition: "width .5s" }} />
                      </div>
                    </div>

                    {/* Datos */}
                    <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
                      {[
                        ["Tipo",        resultado.tipo === "reclamo" ? "Reclamo" : "Queja"],
                        ["Registrado",  fmtFecha(resultado.fecha_registro)],
                        ["Nombre",      resultado.nombres],
                        ["Servicio",    resultado.bien_contratado || "—"],
                      ].map(([l, v], i, arr) => (
                        <div key={l} style={{ display: "grid", gridTemplateColumns: "110px 1fr", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                          <div style={{ padding: "8px 12px", background: "#F9FAFB", fontSize: 11, fontWeight: 600, color: "#6B7280", display: "flex", alignItems: "center" }}>{l}</div>
                          <div style={{ padding: "8px 12px", fontSize: 12, color: "#111827", fontWeight: 500 }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Descripción */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Tu {resultado.tipo}</div>
                    <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#374151", lineHeight: 1.7, marginBottom: 14 }}>
                      {resultado.descripcion}
                    </div>

                    {/* Respuesta */}
                    {resultado.respuesta ? (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Respuesta de Americanet</div>
                        <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderLeft: "4px solid #16A34A", borderRadius: 8, padding: "14px 16px", fontSize: 13, color: "#111827", lineHeight: 1.7, marginBottom: 16 }}>
                          {resultado.respuesta}
                          {resultado.fecha_respuesta && (
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 8 }}>Respondido el {fmtFecha(resultado.fecha_respuesta)}</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#92400E", marginBottom: 16 }}>
                        Tu {resultado.tipo} está siendo revisado. Recibirás respuesta en un máximo de <strong>30 días calendario</strong>.
                      </div>
                    )}

                    {/* Botón PDF */}
                    <button onClick={() => generarPDF(resultado)}
                      style={{ width: "100%", background: "#003DA5", color: "#fff", border: "none", borderRadius: 10,
                        padding: "13px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                        boxShadow: "0 4px 16px rgba(0,61,165,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Descargar constancia en PDF
                    </button>

                    <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
                      Si no estás conforme puedes acudir a INDECOPI · 224-7777 · www.indecopi.gob.pe
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

        </div>

        <div style={{ textAlign: "center", marginTop: 18, color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
          INDECOPI · Libro de Reclamaciones Virtual · Americanet Fiber Solution S.A.C.
        </div>
      </div>
    </div>
  );
}
