import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Pagina publica /wifi/<token>: el cliente elige el nombre y la clave de su
// WiFi antes de la instalacion. El tecnico lo ve en su app y lo copia al
// equipo (2.4G y 5G con el mismo nombre + sufijo).
// Branding igual al formulario "Agenda tu instalacion" (13-nov): Americanet
// azul/naranja, DIM azul/verde con su logo.
const CLAVES_DEBILES = new Set(["12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "password", "contraseña", "qwertyui", "abcdefgh", "12341234", "11223344"]);
const MAX_NOMBRE = 27; // 32 del SSID - " 2.4G"

const MARCAS = {
  am: {
    nombre: "Americanet", logo: "/americanet-logo-clean.png", logoAlto: 30,
    vars: "--az: #1E4F9C; --az2: #163d7a; --nar: #F47A20; --nar2: #f5a623; --nar-rgb: 244,122,32; --az-rgb: 30,79,156;",
    hero: "linear-gradient(135deg, #1E4F9C 0%, #163d7a 60%, #0f2c5c 100%)",
  },
  dim: {
    nombre: "DIM internet", logo: "/dim-logo-marca.png", logoAlto: 58,
    vars: "--az: #0A2FD6; --az2: #0b3fb8; --nar: #16a34a; --nar2: #22c55e; --nar-rgb: 22,163,74; --az-rgb: 10,47,214;",
    hero: "linear-gradient(135deg, #2b8fe0 0%, #0A2FD6 55%, #0a2696 100%)",
  },
};

const estilos = (m) => `
.wf-root { ${m.vars} --txt: #0f172a; --sub: #64748b; --borde: #e2e8f0;
  min-height: 100vh; font-family: Inter, system-ui, -apple-system, sans-serif; background: #f1f5fb; color: var(--txt); position: relative; overflow-x: hidden; }
.wf-hero { position: relative; height: 220px; background: ${m.hero}; overflow: hidden; }
.wf-hero::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 85% 20%, rgba(var(--nar-rgb),0.33), transparent 45%); }
.wf-burbuja { position: absolute; border-radius: 50%; background: linear-gradient(135deg, var(--nar), var(--nar2)); opacity: 0.25; animation: wf-flotar 9s ease-in-out infinite; }
.wf-onda { position: absolute; left: 50%; top: 58px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); animation: wf-onda 3.2s ease-out infinite; }
.wf-wrap { position: relative; max-width: 440px; margin: -160px auto 0; padding: 0 16px 40px; z-index: 1; }
.wf-logo { display: flex; justify-content: center; margin-bottom: 14px; animation: wf-bajar .6s cubic-bezier(.2,.8,.2,1) both; }
.wf-logo div { background: #fff; padding: 10px 18px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
.wf-logo img { display: block; }
.wf-card { background: #fff; border-radius: 20px; padding: 24px 20px 22px; box-shadow: 0 14px 40px rgba(15,23,42,0.12); animation: wf-subir .55s cubic-bezier(.2,.8,.2,1) .1s both; }
.wf-icono { width: 54px; height: 54px; border-radius: 16px; margin: 0 auto 10px; display: grid; place-items: center; background: linear-gradient(135deg, var(--nar), var(--nar2)); box-shadow: 0 8px 20px rgba(var(--nar-rgb),0.35); }
.wf-icono svg { animation: wf-latir 2.4s ease-in-out infinite; }
.wf-titulo { font-size: 22px; font-weight: 800; margin: 0 0 4px; letter-spacing: -0.01em; text-align: center; }
.wf-titulo span { background: linear-gradient(90deg, var(--nar), var(--nar2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.wf-lead { font-size: 14px; color: var(--sub); margin: 0 0 6px; line-height: 1.45; text-align: center; }
.wf-paso { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--az); text-transform: uppercase; letter-spacing: .06em; margin: 20px 0 10px; }
.wf-paso b { width: 22px; height: 22px; border-radius: 50%; background: var(--az); color: #fff; display: grid; place-items: center; font-size: 11px; }
.wf-paso::after { content: ""; flex: 1; height: 1px; background: var(--borde); }
.wf-inp { width: 100%; padding: 13px 14px; border: 1.5px solid var(--borde); border-radius: 12px; font-size: 16px; color: var(--txt); font-family: inherit; box-sizing: border-box; background: #f8fafc; transition: border-color .2s, box-shadow .2s, background .2s; outline: none; }
.wf-inp:focus { border-color: var(--nar); background: #fff; box-shadow: 0 0 0 4px rgba(var(--nar-rgb),0.15); }
.wf-ayuda { font-size: 11.5px; color: #94a3b8; margin: 5px 2px 0; display: flex; justify-content: space-between; }
.wf-ver { position: absolute; right: 8px; top: 8px; border: none; background: #eef2f7; color: #334155; border-radius: 9px; padding: 7px 10px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
.wf-prev { margin-top: 16px; border-radius: 16px; background: #0f172a; padding: 12px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); animation: wf-aparecer .35s both; }
.wf-prev-tit { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .07em; margin: 2px 4px 8px; }
.wf-red { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.06); color: #f8fafc; font-size: 15px; font-weight: 700; margin-bottom: 6px; word-break: break-all; }
.wf-red small { margin-left: auto; font-size: 11px; font-weight: 600; color: #94a3b8; white-space: nowrap; }
.wf-red.clave { background: rgba(var(--nar-rgb),0.16); color: #fff; margin-bottom: 0; }
.wf-aviso { margin-top: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 14px; padding: 12px; font-size: 14px; color: #92400e; animation: wf-aparecer .3s both; }
.wf-err { margin-top: 12px; color: #dc2626; font-weight: 600; font-size: 13.5px; animation: wf-sacudir .35s; }
.wf-enviar { margin-top: 18px; width: 100%; padding: 15px 0; border-radius: 14px; border: none; background: linear-gradient(90deg, var(--nar), var(--nar2), var(--nar)); background-size: 200% 100%; color: #fff; font-size: 16px; font-weight: 800; cursor: pointer; font-family: inherit; box-shadow: 0 10px 22px rgba(var(--nar-rgb),0.35); animation: wf-brillo 4s linear infinite; transition: transform .15s; }
.wf-enviar:active { transform: scale(.98); }
.wf-enviar:disabled { opacity: .7; cursor: default; }
.wf-sec { width: 100%; padding: 12px 0; border-radius: 12px; border: 1.5px solid var(--az); background: #fff; color: var(--az); font-weight: 700; font-size: 15px; cursor: pointer; font-family: inherit; }
.wf-pie { text-align: center; font-size: 11.5px; color: #94a3b8; margin-top: 14px; }
.wf-centro { text-align: center; }
.wf-check circle { stroke-dasharray: 160; stroke-dashoffset: 160; animation: wf-trazo .7s ease-out forwards; }
.wf-check path { stroke-dasharray: 50; stroke-dashoffset: 50; animation: wf-trazo .45s ease-out .55s forwards; }
.wf-confeti { position: fixed; top: -12px; width: 8px; height: 12px; border-radius: 2px; animation: wf-caer linear forwards; z-index: 2; pointer-events: none; }
.wf-pulso { animation: wf-pulso 1.4s ease-in-out infinite; }
@keyframes wf-flotar { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(14px,-18px) scale(1.08); } }
@keyframes wf-onda { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(26); opacity: 0; } }
@keyframes wf-bajar { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: none; } }
@keyframes wf-subir { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes wf-aparecer { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: none; } }
@keyframes wf-sacudir { 0%,100% { transform: none; } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
@keyframes wf-brillo { from { background-position: 0% 0; } to { background-position: 200% 0; } }
@keyframes wf-latir { 0%,100% { transform: none; } 50% { transform: scale(1.1); } }
@keyframes wf-pulso { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
@keyframes wf-trazo { to { stroke-dashoffset: 0; } }
@keyframes wf-caer { to { transform: translateY(105vh) rotate(540deg); opacity: .2; } }
@media (prefers-reduced-motion: reduce) { .wf-root *, .wf-root *::before, .wf-root *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`;

function IconoWifi({ size = 28, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 8.8a15 15 0 0 1 20 0" /><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16.1a5 5 0 0 1 7 0" /><circle cx="12" cy="19.6" r="1.2" fill={color} />
    </svg>
  );
}

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
  // Marca: por la empresa de la orden; mientras carga, por el dominio.
  const esDim = empresa ? /dim/i.test(empresa) : /dimfiber|dimperu/i.test(window.location.hostname);
  const m = esDim ? MARCAS.dim : MARCAS.am;
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

  const confetiColores = esDim ? ["#16a34a", "#22c55e", "#0A2FD6", "#2b8fe0", "#facc15"] : ["#F47A20", "#f5a623", "#1E4F9C", "#16a34a", "#60a5fa"];

  return (
    <div className="wf-root">
      <style>{estilos(m)}</style>
      <div className="wf-hero" aria-hidden="true">
        <div className="wf-burbuja" style={{ width: 160, height: 160, left: -40, top: 60 }} />
        <div className="wf-burbuja" style={{ width: 90, height: 90, right: 20, top: 20, animationDelay: "-3s" }} />
        <div className="wf-burbuja" style={{ width: 50, height: 50, right: "38%", top: 120, animationDelay: "-6s" }} />
        <div className="wf-onda" />
        <div className="wf-onda" style={{ animationDelay: "1.6s" }} />
      </div>
      {listo && Array.from({ length: 28 }).map((_, i) => (
        <span key={i} className="wf-confeti" style={{ left: `${(i * 37) % 100}%`, background: confetiColores[i % confetiColores.length], animationDuration: `${2.2 + (i % 5) * 0.35}s`, animationDelay: `${(i % 7) * 0.12}s` }} />
      ))}

      <div className="wf-wrap">
        <div className="wf-logo"><div><img src={m.logo} alt={m.nombre} style={{ height: m.logoAlto }} /></div></div>
        <div className="wf-card">
          {cargando ? (
            <div className="wf-centro">
              <div className="wf-icono wf-pulso"><IconoWifi /></div>
              <p className="wf-lead wf-pulso">Cargando tu formulario…</p>
            </div>
          ) : !info?.ok ? (
            <div className="wf-centro">
              <div className="wf-icono" style={{ background: "#fee2e2", boxShadow: "none" }}><IconoWifi color="#dc2626" /></div>
              <p style={{ color: "#b91c1c", fontWeight: 700, margin: 0 }}>{info?.error || "Link inválido."}</p>
              <p className="wf-lead" style={{ marginTop: 6 }}>Si necesitas ayuda, escríbenos por WhatsApp.</p>
            </div>
          ) : listo ? (
            <div className="wf-centro">
              <svg className="wf-check" width="64" height="64" viewBox="0 0 52 52" style={{ display: "block", margin: "0 auto 8px" }}>
                <circle cx="26" cy="26" r="24" fill="none" stroke="#16a34a" strokeWidth="3" />
                <path d="M15 27l7 7 15-16" fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h1 className="wf-titulo">¡Listo{info.nombre ? `, ${info.nombre}` : ""}! 🎉</h1>
              <p className="wf-lead">Tu técnico ya tiene estos datos y los dejará configurados en tu equipo.</p>
              <Vista nom={nom} clave={clave.trim()} />
              <p className="wf-pie" style={{ marginTop: 12 }}>¿Quieres cambiarlos? Puedes hacerlo hasta que termine la instalación.</p>
              <button className="wf-sec" onClick={() => setListo(false)}>Cambiar</button>
            </div>
          ) : !info.editable ? (
            <div className="wf-centro">
              <div className="wf-icono"><IconoWifi /></div>
              <h1 className="wf-titulo">Tu instalación <span>ya terminó</span></h1>
              {info.wifi_nombre && <Vista nom={info.wifi_nombre} clave={info.wifi_clave || ""} />}
              <p className="wf-lead" style={{ marginTop: 12 }}>Si necesitas cambiar tu WiFi, escríbenos por WhatsApp.</p>
            </div>
          ) : (
            <>
              <div className="wf-icono"><IconoWifi /></div>
              <h1 className="wf-titulo">Hola{info.nombre ? ` ${info.nombre}` : ""}, elige tu <span>WiFi</span> 👋</h1>
              <p className="wf-lead">Escribe el nombre y la clave que quieres. Tu técnico de {m.nombre} los dejará configurados. Toma 1 minuto. ⚡</p>

              <div className="wf-paso"><b>1</b> Nombre de tu WiFi</div>
              <input className="wf-inp" value={nombre} maxLength={MAX_NOMBRE} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Maria" autoComplete="off" />
              <div className="wf-ayuda"><span>Así lo verás en tu celular</span><span>{nom.length}/{MAX_NOMBRE}</span></div>

              <div className="wf-paso"><b>2</b> Clave</div>
              <div style={{ position: "relative" }}>
                <input className="wf-inp" value={clave} onChange={(e) => { setClave(e.target.value); setAvisoDebil(false); }} type={verClave ? "text" : "password"} placeholder="Ej: maria2026" style={{ paddingRight: 84 }} autoComplete="off" />
                <button type="button" className="wf-ver" onClick={() => setVerClave((v) => !v)}>{verClave ? "Ocultar" : "Ver"}</button>
              </div>
              <div className="wf-ayuda"><span>Mínimo 8 caracteres</span><span>{clave.trim().length}/8+</span></div>

              {nom && <Vista nom={nom} clave={clave.trim()} />}

              {avisoDebil && (
                <div className="wf-aviso">
                  ⚠️ Esta clave es fácil de adivinar y tus vecinos podrían usar tu internet. ¿Quieres usar otra?
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => setAvisoDebil(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #d97706", background: "#fff", color: "#92400e", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cambiarla</button>
                    <button onClick={() => void guardar(true)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "#d97706", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Usar esta</button>
                  </div>
                </div>
              )}

              {error && <div className="wf-err">{error}</div>}

              {!avisoDebil && (
                <button className="wf-enviar" onClick={() => void guardar(false)} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar mi WiFi"}
                </button>
              )}
              {info.codigo && <div className="wf-pie">🔒 Tus datos solo los ve tu técnico · Orden {info.codigo}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Vista previa tipo "lista de redes" del celular.
function Vista({ nom, clave }) {
  return (
    <div className="wf-prev">
      <div className="wf-prev-tit">Así se verá en tu celular</div>
      <div className="wf-red"><IconoWifi size={18} /> {nom} 2.4G <small>llega más lejos</small></div>
      <div className="wf-red"><IconoWifi size={18} /> {nom} 5G <small>más rápida</small></div>
      {clave && <div className="wf-red clave">🔑 {clave}</div>}
    </div>
  );
}
