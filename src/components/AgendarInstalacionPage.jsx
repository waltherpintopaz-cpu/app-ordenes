import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { MapPin, CheckCircle2, Loader2 } from "lucide-react";

// Formulario web OPCIONAL para los datos de instalacion -- alternativa al
// ida-y-vuelta por WhatsApp (pedido explicito del usuario, 2026-10-26). El
// link lo genera el bot (ver generarLinkFormularioInstalacion en
// bot-pagos-comprobante/server.mjs) con conv/tel/tok en la URL -- SIN login,
// quien lo abre es un prospecto, no alguien con cuenta en el panel. El envio
// NUNCA agenda directo: pasa server-a-server por diagno hacia
// bot-pagos-comprobante (accion FormularioInstalacionEnviar), que reusa el
// MISMO flujo de confirmacion por WhatsApp que ya tiene el chat normal --
// el cliente sigue confirmando por su cuenta antes de que se cree la orden.
const DIAGNO_BASE = import.meta.env.PROD ? "https://amnet-diagno.0lthka.easypanel.host" : "";
const PROXY_URL = `${DIAGNO_BASE}/api/mikrowisp-proxy`;

const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "28px 24px", maxWidth: 440, width: "100%", boxShadow: "0 4px 24px rgba(15,23,42,0.06)" };
const label = { fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6, display: "block" };
const inp = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#0f172a", fontFamily: "inherit", boxSizing: "border-box", background: "#fff" };
const field = { marginBottom: 14 };

function parsearNombresPlanes(planesTv) {
  const re = /([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s*·\s*(\d+)\s*Mbps\s*·\s*S\/\s*(\d+)/gi;
  const nombres = [];
  let m;
  while ((m = re.exec(planesTv || ""))) nombres.push(`${m[1]} (${m[2]} Mbps, S/${m[3]})`);
  return nombres;
}

export default function AgendarInstalacionPage() {
  const params = new URLSearchParams(window.location.search);
  const conv = params.get("conv") || "";
  const tel = params.get("tel") || "";
  const tok = params.get("tok") || "";

  const [planes, setPlanes] = useState([]);
  const [form, setForm] = useState({ dni: "", celular_titular: tel, direccion: "", plan: "", dia_horario: "", correo: "" });
  const [ubicacion, setUbicacion] = useState(null); // {lat,lng}
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    supabase.from("bot_pagos_v3_config").select("planes_tv").eq("id", 1).maybeSingle()
      .then(({ data }) => setPlanes(parsearNombresPlanes(data?.planes_tv)))
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pedirUbicacion = () => {
    setErrorUbicacion("");
    if (!navigator.geolocation) { setErrorUbicacion("Tu navegador no permite compartir ubicación -- escríbenos por WhatsApp para enviarla."); return; }
    setBuscandoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setBuscandoUbicacion(false); },
      () => { setErrorUbicacion("No se pudo obtener tu ubicación -- revisa los permisos de ubicación del navegador, o compártela por WhatsApp."); setBuscandoUbicacion(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const validar = () => {
    if (!/^\d{8}$/.test(form.dni.trim())) return "El DNI debe tener 8 dígitos.";
    if (!/^\d{9}$/.test(form.celular_titular.replace(/\D/g, ""))) return "El celular debe tener 9 dígitos.";
    if (!form.direccion.trim()) return "Falta la dirección.";
    if (!form.plan) return "Elige un plan.";
    if (!form.dia_horario.trim()) return "Falta el día/horario de preferencia.";
    return "";
  };

  const enviar = async (e) => {
    e.preventDefault();
    const msg = validar();
    if (msg) { setError(msg); return; }
    setError("");
    setEnviando(true);
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "FormularioInstalacionEnviar",
          payload: {
            conv_id: conv, phone: tel, token: tok,
            dni: form.dni.trim(), celular_titular: form.celular_titular.trim(), direccion: form.direccion.trim(),
            plan: form.plan, dia_horario: form.dia_horario.trim(), correo: form.correo.trim() || null,
            lat: ubicacion?.lat ?? null, lng: ubicacion?.lng ?? null,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.ok) throw new Error(data?.error || "No se pudo enviar");
      setEnviado(true);
    } catch (err) {
      setError("No se pudo enviar tus datos -- intenta de nuevo o escríbenos directo por WhatsApp.");
    } finally {
      setEnviando(false);
    }
  };

  if (!conv || !tel || !tok) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc" }}>
        <div style={card}>
          <p style={{ fontSize: 14, color: "#475569" }}>Este link no es válido. Pide uno nuevo por WhatsApp.</p>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc" }}>
        <div style={{ ...card, textAlign: "center" }}>
          <CheckCircle2 size={40} color="#16a34a" style={{ marginBottom: 12 }} />
          <h2 style={{ fontSize: 17, color: "#0f172a", margin: "0 0 8px" }}>¡Listo!</h2>
          <p style={{ fontSize: 14, color: "#475569", margin: 0 }}>Recibimos tus datos. Vuelve a WhatsApp -- te vamos a mostrar un resumen para que confirmes antes de agendar.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc" }}>
      <form style={card} onSubmit={enviar}>
        <h2 style={{ fontSize: 17, color: "#0f172a", margin: "0 0 4px" }}>Agenda tu instalación</h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>Llena tus datos aquí, es más rápido que escribirlos por WhatsApp.</p>

        <div style={field}>
          <label style={label}>DNI</label>
          <input style={inp} value={form.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="12345678" required />
        </div>
        <div style={field}>
          <label style={label}>Celular del titular</label>
          <input style={inp} value={form.celular_titular} onChange={(e) => set("celular_titular", e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" placeholder="987654321" required />
        </div>
        <div style={field}>
          <label style={label}>Dirección exacta</label>
          <input style={inp} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Jr./Av., número, urbanización/zona" required />
        </div>
        <div style={field}>
          <label style={label}>Ubicación GPS</label>
          {ubicacion ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
              <CheckCircle2 size={16} /> Ubicación capturada
            </div>
          ) : (
            <button type="button" onClick={pedirUbicacion} disabled={buscandoUbicacion} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "1px solid #2563eb", background: "#eff6ff", color: "#2563eb", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {buscandoUbicacion ? <Loader2 size={14} /> : <MapPin size={14} />} {buscandoUbicacion ? "Obteniendo..." : "Usar mi ubicación actual"}
            </button>
          )}
          {errorUbicacion && <p style={{ fontSize: 12, color: "#dc2626", margin: "6px 0 0" }}>{errorUbicacion}</p>}
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "6px 0 0" }}>Opcional, pero ayuda a que el técnico llegue exacto. Si no la compartes aquí, te la podemos pedir por WhatsApp.</p>
        </div>
        <div style={field}>
          <label style={label}>Plan</label>
          <select style={inp} value={form.plan} onChange={(e) => set("plan", e.target.value)} required>
            <option value="">Elige un plan...</option>
            {planes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={field}>
          <label style={label}>Día y horario de preferencia</label>
          <input style={inp} value={form.dia_horario} onChange={(e) => set("dia_horario", e.target.value)} placeholder="Ej. lunes por la mañana" required />
        </div>
        <div style={field}>
          <label style={label}>Correo (opcional)</label>
          <input style={inp} type="email" value={form.correo} onChange={(e) => set("correo", e.target.value)} placeholder="tucorreo@ejemplo.com" />
        </div>

        {error && <p style={{ fontSize: 13, color: "#dc2626", margin: "0 0 12px" }}>{error}</p>}

        <button type="submit" disabled={enviando} style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 700, cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.7 : 1 }}>
          {enviando ? "Enviando..." : "Enviar datos"}
        </button>
      </form>
    </div>
  );
}
