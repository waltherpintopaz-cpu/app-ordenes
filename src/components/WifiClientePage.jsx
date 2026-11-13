import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Pagina publica /wifi/<token>: el cliente elige el nombre y la clave de su
// WiFi antes de la instalacion. El tecnico lo ve en su app y lo copia al
// equipo (2.4G y 5G con el mismo nombre + sufijo).
const CLAVES_DEBILES = new Set(["12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "password", "contraseña", "qwertyui", "abcdefgh", "12341234", "11223344"]);
const MAX_NOMBRE = 27; // 32 del SSID - " 2.4G"

export default function WifiClientePage() {
  const token = decodeURIComponent(window.location.pathname.replace(/^\/wifi\/?/, "").split("/")[0] || "");
  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);
  const [avisoDebil, setAvisoDebil] = useState(false);

  useEffect(() => {
    document.title = "Tu WiFi";
    if (!token) { setCargando(false); setInfo({ ok: false, error: "Link inválido." }); return; }
    supabase.rpc("wifi_form_info", { p_token: token }).then(({ data, error: e }) => {
      if (e || !data) setInfo({ ok: false, error: "No se pudo abrir el link. Intenta de nuevo en un momento." });
      else {
        setInfo(data);
        if (data.wifi_nombre) setNombre(data.wifi_nombre);
        if (data.wifi_clave) setClave(data.wifi_clave);
      }
      setCargando(false);
    });
  }, [token]);

  const empresa = info?.empresa || "";
  const esDim = /dim/i.test(empresa);
  const color = esDim ? "#e11d48" : "#1d4ed8";
  const nom = nombre.replace(/\s+/g, " ").trim();
  const debil = CLAVES_DEBILES.has(clave.trim().toLowerCase()) || /^(\d)\1+$/.test(clave.trim());

  const guardar = async (forzar = false) => {
    setError("");
    if (!nom) return setError("Escribe el nombre para tu WiFi.");
    if (nom.length > MAX_NOMBRE) return setError(`El nombre puede tener hasta ${MAX_NOMBRE} caracteres.`);
    if (clave.trim().length < 8) return setError("La clave debe tener al menos 8 caracteres.");
    if (debil && !forzar) { setAvisoDebil(true); return; }
    setAvisoDebil(false);
    setGuardando(true);
    const { data, error: e } = await supabase.rpc("wifi_form_guardar", { p_token: token, p_nombre: nom, p_clave: clave.trim() });
    setGuardando(false);
    if (e || !data?.ok) return setError(data?.error || "No se pudo guardar. Intenta de nuevo.");
    setListo(true);
  };

  const caja = { background: "#fff", borderRadius: 18, padding: 22, width: "100%", maxWidth: 420, boxShadow: "0 10px 30px rgba(15,23,42,0.12)", boxSizing: "border-box" };
  const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 17, border: "1.5px solid #cbd5e1", borderRadius: 12, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${color}18, #f8fafc 45%)`, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a", boxSizing: "border-box" }}>
      <div style={caja}>
        <div style={{ fontSize: 40, textAlign: "center" }}>📶</div>
        {cargando ? (
          <p style={{ textAlign: "center", color: "#64748b" }}>Cargando…</p>
        ) : !info?.ok ? (
          <p style={{ textAlign: "center", color: "#b91c1c", fontWeight: 600 }}>{info?.error || "Link inválido."}</p>
        ) : listo ? (
          <>
            <h2 style={{ textAlign: "center", margin: "6px 0 4px" }}>¡Listo{info.nombre ? `, ${info.nombre}` : ""}! ✅</h2>
            <p style={{ textAlign: "center", color: "#475569", marginTop: 0 }}>Tu técnico ya tiene estos datos y los pondrá en tu equipo:</p>
            <Resumen nom={nom} clave={clave.trim()} color={color} />
            <p style={{ textAlign: "center", fontSize: 13, color: "#64748b" }}>Si quieres cambiarlos, puedes volver a abrir este link antes de que termine la instalación.</p>
            <button onClick={() => setListo(false)} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1.5px solid ${color}`, background: "#fff", color, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Cambiar</button>
          </>
        ) : !info.editable ? (
          <>
            <h2 style={{ textAlign: "center", margin: "6px 0" }}>Tu instalación ya terminó</h2>
            {info.wifi_nombre && <Resumen nom={info.wifi_nombre} clave={info.wifi_clave || ""} color={color} />}
            <p style={{ textAlign: "center", color: "#475569" }}>Si necesitas cambiar tu WiFi, escríbenos por WhatsApp.</p>
          </>
        ) : (
          <>
            <h2 style={{ textAlign: "center", margin: "6px 0 2px", fontSize: 21 }}>Hola{info.nombre ? ` ${info.nombre}` : ""} 👋</h2>
            <p style={{ textAlign: "center", color: "#475569", marginTop: 0, fontSize: 15 }}>Elige el nombre y la clave de tu WiFi{empresa ? ` de ${empresa}` : ""}. Tu técnico los dejará configurados.</p>

            <label style={{ fontWeight: 700, fontSize: 14 }}>Nombre de tu WiFi</label>
            <input value={nombre} maxLength={MAX_NOMBRE} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Maria" style={{ ...inp, marginTop: 6 }} autoComplete="off" />
            <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "right", marginTop: 2 }}>{nom.length}/{MAX_NOMBRE}</div>

            <label style={{ fontWeight: 700, fontSize: 14 }}>Clave (mínimo 8 caracteres)</label>
            <div style={{ position: "relative", marginTop: 6 }}>
              <input value={clave} onChange={(e) => { setClave(e.target.value); setAvisoDebil(false); }} type={verClave ? "text" : "password"} placeholder="Ej: maria2026" style={{ ...inp, paddingRight: 70 }} autoComplete="off" />
              <button type="button" onClick={() => setVerClave((v) => !v)} style={{ position: "absolute", right: 8, top: 8, border: "none", background: "#f1f5f9", borderRadius: 8, padding: "6px 8px", fontSize: 12, cursor: "pointer" }}>{verClave ? "Ocultar" : "Ver"}</button>
            </div>

            {nom && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Así se verá tu WiFi:</div>
                <Resumen nom={nom} clave={clave.trim()} color={color} />
              </div>
            )}

            {avisoDebil && (
              <div style={{ marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 12, fontSize: 14, color: "#92400e" }}>
                ⚠️ Esta clave es fácil de adivinar y tus vecinos podrían usar tu internet. ¿Quieres usar otra?
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => setAvisoDebil(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #d97706", background: "#fff", color: "#92400e", fontWeight: 700, cursor: "pointer" }}>Cambiarla</button>
                  <button onClick={() => void guardar(true)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "#d97706", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Usar esta</button>
                </div>
              </div>
            )}

            {error && <div style={{ marginTop: 12, color: "#b91c1c", fontWeight: 600, fontSize: 14 }}>{error}</div>}

            {!avisoDebil && (
              <button onClick={() => void guardar(false)} disabled={guardando} style={{ marginTop: 16, width: "100%", padding: 14, borderRadius: 12, border: "none", background: color, color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer", opacity: guardando ? 0.6 : 1 }}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            )}
            {info.codigo && <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 12 }}>Orden {info.codigo}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function Resumen({ nom, clave, color }) {
  const fila = { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fff", borderRadius: 10, fontSize: 15, fontWeight: 700 };
  return (
    <div style={{ background: `${color}10`, border: `1px solid ${color}33`, borderRadius: 14, padding: 10, display: "grid", gap: 6, marginBottom: 12 }}>
      <div style={fila}>📶 {nom} 2.4G <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: "#64748b" }}>llega más lejos</span></div>
      <div style={fila}>📶 {nom} 5G <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: "#64748b" }}>más rápida</span></div>
      {clave && <div style={fila}>🔑 {clave}</div>}
    </div>
  );
}
