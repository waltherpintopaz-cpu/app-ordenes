import React, { useState } from "react";
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

const input = {
  width: "100%",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13,
  color: "#111827",
  background: "#fff",
  boxSizing: "border-box",
  fontFamily: "inherit",
  outline: "none",
  transition: "border-color .15s",
};

export default function LibroReclamacionesPage() {
  const [form, setForm] = useState(CAMPOS_VACIOS);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(null); // { codigo, tipo }
  const [error, setError] = useState(null);

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function generarCodigo(tipo) {
    const prefix = tipo === "reclamo" ? "REC" : "QJA";
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${fecha}-${rand}`;
  }

  async function enviar(e) {
    e.preventDefault();
    setError(null);

    if (!form.nombres.trim() || !form.dni.trim() || !form.telefono.trim() || !form.descripcion.trim() || !form.pedido.trim()) {
      setError("Por favor completa todos los campos obligatorios.");
      return;
    }
    if (form.dni.replace(/\D/g, "").length < 8) {
      setError("El DNI debe tener 8 dígitos.");
      return;
    }

    setEnviando(true);
    const codigo = generarCodigo(form.tipo);
    try {
      const { error: sbError } = await supabase.from("libro_reclamaciones").insert([{
        codigo,
        tipo:              form.tipo,
        nombres:           form.nombres.trim(),
        dni:               form.dni.replace(/\D/g, ""),
        telefono:          form.telefono.trim(),
        email:             form.email.trim() || null,
        direccion:         form.direccion.trim() || null,
        bien_contratado:   form.bien_contratado,
        monto_contratado:  form.monto_contratado ? parseFloat(form.monto_contratado) : null,
        descripcion:       form.descripcion.trim(),
        pedido:            form.pedido.trim(),
        estado:            "pendiente",
        fecha_registro:    new Date().toISOString(),
      }]);
      if (sbError) throw new Error(sbError.message);
      setEnviado({ codigo, tipo: form.tipo });
      setForm(CAMPOS_VACIOS);
    } catch (err) {
      setError("Ocurrió un error al enviar. Intenta nuevamente o comunícate al (054) 000-000.");
      console.error(err);
    }
    setEnviando(false);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #003DA5 0%, #0A2E5F 60%, #001a3a 100%)",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      padding: "32px 16px 48px",
    }}>
      {/* Burbujas decorativas */}
      <div style={{ position:"fixed", width:320, height:320, borderRadius:"50%", background:"rgba(255,255,255,0.04)", top:-100, left:-120, pointerEvents:"none" }} />
      <div style={{ position:"fixed", width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.03)", bottom:60, right:-60, pointerEvents:"none" }} />

      <div style={{ maxWidth: 560, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src={logoAmericanet} alt="Americanet" style={{ height: 48, filter: "brightness(0) invert(1)", opacity: 0.95 }} />
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 8, letterSpacing: 2, textTransform: "uppercase" }}>
            Fiber Solution S.A.C.
          </div>
        </div>

        {/* Tarjeta */}
        <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>

          {/* Cabecera */}
          <div style={{ background: "#003DA5", padding: "20px 24px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 10, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="#fff" strokeWidth="1.8" />
                <path d="M7 8h10M7 12h10M7 16h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>Libro de Reclamaciones</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2 }}>Americanet Fiber Solution S.A.C.</div>
            </div>
            <div style={{ background: "#22c55e", borderRadius: 6, padding: "4px 10px" }}>
              <span style={{ color: "#fff", fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>VIRTUAL</span>
            </div>
          </div>

          {/* Aviso legal */}
          <div style={{ background: "#EFF6FF", padding: "10px 20px", borderBottom: "1px solid #D9E3F8" }}>
            <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.7, margin: 0 }}>
              <strong style={{ color: "#003DA5" }}>Base legal:</strong> Ley N° 29571 · D.S. N° 011-2011-PCM · D.S. N° 058-2017-PCM.
              {" "}Plazo de respuesta: <strong>30 días calendario</strong>.
            </p>
          </div>

          {/* ── PANTALLA DE ÉXITO ── */}
          {enviado ? (
            <div style={{ padding: "40px 28px", textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: "#111827", marginBottom: 8 }}>
                {enviado.tipo === "reclamo" ? "Reclamo registrado" : "Queja registrada"}
              </div>
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, display: "inline-block", padding: "8px 20px", marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}>Código de seguimiento</span>
                <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 20, color: "#003DA5", marginTop: 2 }}>{enviado.codigo}</div>
              </div>
              <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.7, marginBottom: 24 }}>
                Hemos recibido tu {enviado.tipo}. Te daremos respuesta en un plazo máximo de <strong>30 días calendario</strong>.<br />
                Guarda tu código de seguimiento para consultas futuras.
              </p>
              <button
                onClick={() => setEnviado(null)}
                style={{ background: "#003DA5", color: "#fff", border: "none", borderRadius: 8, padding: "11px 28px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Registrar otro
              </button>
            </div>

          ) : (
            /* ── FORMULARIO ── */
            <form onSubmit={enviar} style={{ padding: "24px 24px 28px" }}>

              {/* Tipo */}
              <Field label="Tipo de registro" required>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[["reclamo", "📋 Reclamo", "Disconformidad con el servicio"],
                    ["queja",   "💬 Queja",   "Malestar por la atención recibida"]].map(([val, label, desc]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => set("tipo", val)}
                      style={{
                        border: `2px solid ${form.tipo === val ? "#003DA5" : "#E5E7EB"}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        background: form.tipo === val ? "#EFF6FF" : "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                        transition: "all .15s",
                      }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: form.tipo === val ? "#003DA5" : "#374151" }}>{label}</div>
                      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </Field>

              <hr style={{ border: "none", borderTop: "1px solid #F3F4F6", margin: "4px 0 16px" }} />

              {/* Datos personales */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Datos del reclamante</div>

              <Field label="Nombres y apellidos" required>
                <input style={input} placeholder="Ej: Juan Pérez García" value={form.nombres}
                  onChange={e => set("nombres", e.target.value)} />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="DNI" required>
                  <input style={input} placeholder="12345678" maxLength={8} value={form.dni}
                    onChange={e => set("dni", e.target.value.replace(/\D/g, ""))} />
                </Field>
                <Field label="Teléfono / Celular" required>
                  <input style={input} placeholder="9XXXXXXXX" value={form.telefono}
                    onChange={e => set("telefono", e.target.value)} />
                </Field>
              </div>

              <Field label="Correo electrónico">
                <input style={input} type="email" placeholder="correo@ejemplo.com" value={form.email}
                  onChange={e => set("email", e.target.value)} />
              </Field>

              <Field label="Dirección">
                <input style={input} placeholder="Calle, Urbanización, Distrito" value={form.direccion}
                  onChange={e => set("direccion", e.target.value)} />
              </Field>

              <hr style={{ border: "none", borderTop: "1px solid #F3F4F6", margin: "4px 0 16px" }} />

              {/* Datos del servicio */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Bien contratado</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Tipo de servicio">
                  <select style={{ ...input, background: "#fff" }} value={form.bien_contratado}
                    onChange={e => set("bien_contratado", e.target.value)}>
                    <option>Servicio de Internet</option>
                    <option>Servicio de Cable TV</option>
                    <option>Internet + Cable TV</option>
                    <option>Otro</option>
                  </select>
                </Field>
                <Field label="Monto mensual (S/)">
                  <input style={input} type="number" min="0" step="0.01" placeholder="0.00" value={form.monto_contratado}
                    onChange={e => set("monto_contratado", e.target.value)} />
                </Field>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid #F3F4F6", margin: "4px 0 16px" }} />

              {/* Detalle */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Detalle del {form.tipo}</div>

              <Field label="Descripción del problema" required>
                <textarea style={{ ...input, minHeight: 90, resize: "vertical", lineHeight: 1.6 }}
                  placeholder="Describe detalladamente lo ocurrido..."
                  value={form.descripcion}
                  onChange={e => set("descripcion", e.target.value)} />
              </Field>

              <Field label="¿Qué solicitas?" required>
                <textarea style={{ ...input, minHeight: 70, resize: "vertical", lineHeight: 1.6 }}
                  placeholder="Ej: Solicito la devolución del cobro indebido / corrección del servicio..."
                  value={form.pedido}
                  onChange={e => set("pedido", e.target.value)} />
              </Field>

              {error && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#DC2626", marginBottom: 14, fontWeight: 600 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={enviando}
                style={{
                  width: "100%",
                  background: enviando ? "#9CA3AF" : "#003DA5",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "14px 20px",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: enviando ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  boxShadow: enviando ? "none" : "0 4px 16px rgba(0,61,165,0.3)",
                  transition: "background .15s",
                }}>
                {enviando ? "Enviando..." : `Enviar ${form.tipo}`}
              </button>

              <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
                Al enviar aceptas que tus datos sean usados para gestionar tu {form.tipo} conforme a la Ley N° 29571.
              </p>

            </form>
          )}
        </div>

        {/* Pie */}
        <div style={{ textAlign: "center", marginTop: 20, color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
          INDECOPI · Libro de Reclamaciones Virtual · Americanet Fiber Solution S.A.C.
        </div>

      </div>
    </div>
  );
}
