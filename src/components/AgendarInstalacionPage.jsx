import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { MapPin, CheckCircle2, Loader2, User } from "lucide-react";

// Formulario web OPCIONAL para los datos de instalacion -- alternativa al
// ida-y-vuelta por WhatsApp (pedido explicito del usuario, 2026-10-26). El
// link lo genera el bot (ver generarLinkFormularioInstalacion en
// bot-pagos-comprobante/server.mjs) como "/agendar-instalacion/<token>" --
// SOLO el token en la URL, sin conv_id ni telefono (pedido explicito del
// usuario, 2026-10-26: el link con "?conv=...&tel=...&tok=..." se veia
// largo y sospechoso, tipo phishing). El token es la UNICA credencial --
// esta pagina lo resuelve al cargar (accion FormularioInstalacionResolver)
// para saber si es valido y precargar el celular, sin exponer esos datos
// en la URL. SIN login, quien lo abre es un prospecto, no alguien con
// cuenta en el panel. El envio NUNCA agenda directo: pasa server-a-server
// por diagno hacia bot-pagos-comprobante (accion
// FormularioInstalacionEnviar), que reusa el MISMO flujo de confirmacion
// por WhatsApp que ya tiene el chat normal -- el cliente sigue confirmando
// por su cuenta antes de que se cree la orden.
const DIAGNO_BASE = import.meta.env.PROD ? "https://amnet-diagno.0lthka.easypanel.host" : "";
const PROXY_URL = `${DIAGNO_BASE}/api/mikrowisp-proxy`;

// Mismo proveedor y llave que ya usa SidebarApp.jsx (buscarDniORuc) para
// autocompletar el nombre del titular al crear una orden -- esa llave ya
// vive hardcodeada en el bundle publico de la app principal, asi que
// reusarla aca (otra pagina publica) no expone nada nuevo.
const DNI_API_KEY = "cGVydWRldnMucHJvZHVjdGlvbi5maXRjb2RlcnMuNjllMTNmNDYxYzlhY2M1YmI0MjI2YTcx";

// Google Maps -- vuelto a esto desde Leaflet/OpenStreetMap (pedido
// explicito del usuario, 2026-10-26) una vez confirmado que el mapa en
// blanco NO era un problema de la API key de Google, sino un bug de
// timing en React (ver el useEffect del mapa mas abajo: dependia de []
// pero el <div> del mapa no existia todavia en el primer render por el
// loader de "resolviendo"). Con ese fix, Google Maps funciona igual.
const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
const loadGoogleMapsSdk = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("Sin navegador."));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (window.__gmapsPromise) return window.__gmapsPromise;
  window.__gmapsPromise = new Promise((resolve, reject) => {
    // Google llama a esto cuando la API key esta mal, restringida a otro
    // dominio, o la "Maps JavaScript API" no esta habilitada -- en ese
    // caso el script SI carga (no dispara onerror) pero el mapa se queda
    // vacio y gris, sin ningun aviso visible. Con este hook al menos se
    // detecta y se muestra el fallback en vez de quedar en silencio total.
    window.gm_authFailure = () => reject(new Error("Google Maps rechazo la API key (dominio no autorizado, o la API no esta habilitada/facturada en Google Cloud)."));
    const script = document.createElement("script");
    script.id = "google-maps-js-sdk";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("No se pudo cargar el mapa."));
    document.head.appendChild(script);
  });
  return window.__gmapsPromise;
};

// Pin propio (persona + globo de estado) en vez del puntito de color por
// defecto -- pedido explicito del usuario (2026-10-26: "icono mas
// atractivo"). Mismo diseño que ya usa CoberturaMapaModal.jsx en el panel
// principal, adaptado al formato de icono que espera un Marker de Google
// (url + scaledSize + anchor, en vez de L.icon de Leaflet). estado:
// undefined="verificando", true="cobertura", false="fuera de cobertura".
function pinClienteIcon(maps, estado, size = 40) {
  const w = size, h = Math.round(size * 1.35);
  const badgeColor = estado === undefined ? "#94a3b8" : estado ? "#16a34a" : "#dc2626";
  const badgeGlyph = estado === undefined
    ? `<circle cx="0" cy="0" r="2.2" fill="#fff"/>`
    : estado
      ? `<path d="M-3 0.5 L-1 2.5 L3.2 -2.2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M-2.4 -2.4 L2.4 2.4 M2.4 -2.4 L-2.4 2.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="49" viewBox="0 0 36 49">
    <defs>
      <filter id="s" x="-60%" y="-20%" width="220%" height="170%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#0f172a" flood-opacity="0.45"/>
      </filter>
    </defs>
    <path filter="url(#s)" d="M18 0C8.6 0 1 7.6 1 17c0 12.7 17 29 17 29s17-16.3 17-29C35 7.6 27.4 0 18 0z" fill="#2563eb"/>
    <circle cx="18" cy="17" r="12.5" fill="rgba(255,255,255,0.18)"/>
    <circle cx="18" cy="12.3" r="3.6" fill="#fff"/>
    <path d="M9.5 24.5c1.6-4.6 5-6.9 8.5-6.9s6.9 2.3 8.5 6.9c-2.3 2-5.3 3.2-8.5 3.2s-6.2-1.2-8.5-3.2z" fill="#fff"/>
    <g transform="translate(28,9)">
      <circle r="6.2" fill="${badgeColor}" stroke="#fff" stroke-width="1.8"/>
      ${badgeGlyph}
    </g>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(w, h),
    anchor: new maps.Point(w / 2, h),
  };
}

// Centro por defecto del mapa (Arequipa) -- solo para encuadrar al abrir,
// no tiene nada que ver con la cobertura real.
const CENTRO_DEFAULT = { lat: -16.409, lng: -71.537 };

const DIAS_SEMANA_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// "valor" es el texto EXACTO que recibe el bot en dia_horario (no cambiarlo).
// "fin" en minutos del dia: el turno de HOY se puede elegir solo si falta al
// menos 1 hora para que termine (tiempo minimo para que llegue el tecnico).
const HORARIOS = [
  { valor: "Mañana (8:00am - 11:30am)", nombre: "Mañana", rango: "8:00 – 11:30 am", icono: "🌅", fin: 11 * 60 + 30 },
  { valor: "Mediodía (11:30am - 2:30pm)", nombre: "Mediodía", rango: "11:30 am – 2:30 pm", icono: "☀️", fin: 14 * 60 + 30 },
  { valor: "Tarde (2:30pm - 5:30pm)", nombre: "Tarde", rango: "2:30 – 5:30 pm", icono: "🌇", fin: 17 * 60 + 30 },
];
const MARGEN_HOY_MIN = 60;

// Fecha LOCAL del celular (antes usaba toISOString, que es UTC: despues de
// las 7pm en Peru ya daba el dia siguiente y "mañana" salia pasado mañana).
const pad2 = (n) => String(n).padStart(2, "0");
const isoLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hoyISO = () => isoLocal(new Date());

function horarioDisponible(fechaIso, h) {
  if (fechaIso !== hoyISO()) return true;
  const ahora = new Date();
  return ahora.getHours() * 60 + ahora.getMinutes() <= h.fin - MARGEN_HOY_MIN;
}

// Proximos dias habiles (sin domingos) como botones rapidos. HOY se incluye
// solo si todavia queda algun turno disponible (pedido del usuario, 2026-11-09:
// el bot ya aceptaba instalacion el mismo dia, pero el formulario empezaba
// recien desde mañana).
function proximosDias(cantidad = 6) {
  const dias = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; dias.length < cantidad && i < 14; i++) {
    const iso = isoLocal(d);
    const esHoy = i === 0;
    if (d.getDay() !== 0 && (!esHoy || HORARIOS.some((h) => horarioDisponible(iso, h)))) {
      dias.push({ iso, etiqueta: esHoy ? "Hoy" : i === 1 ? "Mañana" : DIAS_CORTO[d.getDay()], num: d.getDate(), mes: MESES_CORTO[d.getMonth()] });
    }
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

const ESTILOS = `
.ai-root { --az: #1E4F9C; --az2: #163d7a; --nar: #F47A20; --nar2: #f5a623; --txt: #0f172a; --sub: #64748b; --borde: #e2e8f0;
  min-height: 100vh; font-family: Inter, system-ui, -apple-system, sans-serif; background: #f1f5fb; color: var(--txt); position: relative; overflow-x: hidden; }
.ai-hero { position: relative; height: 210px; background: linear-gradient(135deg, var(--az) 0%, var(--az2) 60%, #0f2c5c 100%); overflow: hidden; }
.ai-hero::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 85% 20%, rgba(244,122,32,0.35), transparent 45%); }
.ai-burbuja { position: absolute; border-radius: 50%; background: linear-gradient(135deg, var(--nar), var(--nar2)); opacity: 0.25; animation: ai-flotar 9s ease-in-out infinite; }
.ai-onda { position: absolute; left: 50%; top: 58px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); animation: ai-onda 3.2s ease-out infinite; }
.ai-wrap { position: relative; max-width: 460px; margin: -150px auto 0; padding: 0 16px 40px; z-index: 1; }
.ai-logo { display: flex; justify-content: center; margin-bottom: 14px; animation: ai-bajar .6s cubic-bezier(.2,.8,.2,1) both; }
.ai-logo div { background: #fff; padding: 10px 18px; border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
.ai-logo img { height: 30px; display: block; }
.ai-card { background: #fff; border-radius: 20px; padding: 24px 20px 22px; box-shadow: 0 14px 40px rgba(15,23,42,0.12); animation: ai-subir .55s cubic-bezier(.2,.8,.2,1) .1s both; }
.ai-titulo { font-size: 21px; font-weight: 800; margin: 0 0 4px; letter-spacing: -0.01em; }
.ai-titulo span { background: linear-gradient(90deg, var(--nar), var(--nar2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.ai-lead { font-size: 13.5px; color: var(--sub); margin: 0 0 20px; line-height: 1.45; }
.ai-sec { animation: ai-subir .5s cubic-bezier(.2,.8,.2,1) both; margin-bottom: 16px; }
.ai-paso { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--az); text-transform: uppercase; letter-spacing: .06em; margin: 22px 0 12px; }
.ai-paso b { width: 22px; height: 22px; border-radius: 50%; background: var(--az); color: #fff; display: grid; place-items: center; font-size: 11px; }
.ai-paso::after { content: ""; flex: 1; height: 1px; background: var(--borde); }
.ai-label { font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 6px; display: block; }
.ai-inp { width: 100%; padding: 12px 13px; border: 1.5px solid var(--borde); border-radius: 12px; font-size: 15px; color: var(--txt); font-family: inherit; box-sizing: border-box; background: #f8fafc; transition: border-color .2s, box-shadow .2s, background .2s; outline: none; }
.ai-inp:focus { border-color: var(--nar); background: #fff; box-shadow: 0 0 0 4px rgba(244,122,32,0.15); }
.ai-err { font-size: 12px; color: #dc2626; margin: 6px 0 0; animation: ai-sacudir .35s; }
.ai-ok { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 12.5px; color: #15803d; font-weight: 600; background: #f0fdf4; padding: 6px 10px; border-radius: 8px; animation: ai-aparecer .35s both; }
.ai-ayuda { font-size: 11.5px; color: #94a3b8; margin: 0 0 8px; }
.ai-mapa { width: 100%; height: 230px; border-radius: 14px; border: 1.5px solid var(--borde); background: #e2e8f0; }
.ai-btn-sec { display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px; border-radius: 10px; border: 1.5px solid var(--az); background: #eef3fb; color: var(--az); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: transform .15s; }
.ai-btn-sec:active { transform: scale(.96); }
.ai-dias { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: none; }
.ai-dias::-webkit-scrollbar { display: none; }
.ai-dia { flex: 0 0 auto; min-width: 64px; padding: 9px 6px 8px; border-radius: 14px; border: 1.5px solid var(--borde); background: #fff; cursor: pointer; text-align: center; font-family: inherit; color: var(--txt); transition: transform .18s, border-color .18s, background .18s, box-shadow .18s; animation: ai-aparecer .4s both; }
.ai-dia small { display: block; font-size: 11px; font-weight: 700; color: var(--sub); text-transform: capitalize; }
.ai-dia strong { display: block; font-size: 22px; font-weight: 800; line-height: 1.15; }
.ai-dia em { display: block; font-size: 11px; font-style: normal; color: var(--sub); }
.ai-dia.hoy small { color: var(--nar); }
.ai-dia.sel { background: linear-gradient(160deg, var(--nar), #ea6a10); border-color: transparent; color: #fff; transform: translateY(-2px); box-shadow: 0 8px 18px rgba(244,122,32,0.35); }
.ai-dia.sel small, .ai-dia.sel em { color: rgba(255,255,255,0.9); }
.ai-turnos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ai-turno { padding: 11px 6px; border-radius: 14px; border: 1.5px solid var(--borde); background: #fff; cursor: pointer; text-align: center; font-family: inherit; color: var(--txt); transition: transform .18s, border-color .18s, background .18s, box-shadow .18s; }
.ai-turno span { font-size: 20px; display: block; }
.ai-turno strong { display: block; font-size: 13px; margin-top: 2px; }
.ai-turno em { display: block; font-size: 10.5px; font-style: normal; color: var(--sub); margin-top: 2px; }
.ai-turno.sel { border-color: var(--az); background: #eef3fb; box-shadow: 0 6px 16px rgba(30,79,156,0.18); transform: translateY(-2px); }
.ai-turno.sel strong { color: var(--az); }
.ai-turno:disabled { opacity: .45; cursor: not-allowed; background: #f8fafc; }
.ai-enviar { width: 100%; padding: 14px 0; border-radius: 14px; border: none; background: linear-gradient(90deg, var(--nar), var(--nar2), var(--nar)); background-size: 200% 100%; color: #fff; font-size: 15.5px; font-weight: 800; cursor: pointer; font-family: inherit; box-shadow: 0 10px 22px rgba(244,122,32,0.35); animation: ai-brillo 4s linear infinite; transition: transform .15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
.ai-enviar:active { transform: scale(.98); }
.ai-enviar:disabled { opacity: .75; cursor: default; }
.ai-centro { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; text-align: center; }
.ai-pulso { animation: ai-pulso 1.4s ease-in-out infinite; }
.ai-check circle { stroke-dasharray: 160; stroke-dashoffset: 160; animation: ai-trazo .7s ease-out forwards; }
.ai-check path { stroke-dasharray: 50; stroke-dashoffset: 50; animation: ai-trazo .45s ease-out .55s forwards; }
.ai-confeti { position: absolute; top: -12px; width: 8px; height: 12px; border-radius: 2px; animation: ai-caer linear forwards; }
.ai-girar { animation: ai-girar 1s linear infinite; }
@keyframes ai-flotar { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(14px,-18px) scale(1.08); } }
@keyframes ai-onda { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(26); opacity: 0; } }
@keyframes ai-bajar { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: none; } }
@keyframes ai-subir { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes ai-aparecer { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: none; } }
@keyframes ai-sacudir { 0%,100% { transform: none; } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
@keyframes ai-brillo { from { background-position: 0% 0; } to { background-position: 200% 0; } }
@keyframes ai-pulso { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.94); opacity: .6; } }
@keyframes ai-trazo { to { stroke-dashoffset: 0; } }
@keyframes ai-caer { to { transform: translateY(105vh) rotate(540deg); opacity: .2; } }
@keyframes ai-girar { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ai-root *, .ai-root *::before, .ai-root *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`;

const LOGO_URL = "/americanet-logo-clean.png";

function Fondo({ children }) {
  return (
    <div className="ai-root">
      <style>{ESTILOS}</style>
      <div className="ai-hero" aria-hidden="true">
        <div className="ai-burbuja" style={{ width: 160, height: 160, left: -40, top: 60 }} />
        <div className="ai-burbuja" style={{ width: 90, height: 90, right: 20, top: 20, animationDelay: "-3s" }} />
        <div className="ai-burbuja" style={{ width: 50, height: 50, right: "38%", top: 120, animationDelay: "-6s" }} />
        <div className="ai-onda" />
        <div className="ai-onda" style={{ animationDelay: "1.6s" }} />
      </div>
      {children}
    </div>
  );
}

function Logo() {
  return <div className="ai-logo"><div><img src={LOGO_URL} alt="Americanet" /></div></div>;
}

function parsearPlanesConPromo(planesTv, promoActiva) {
  const re = /([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s*·\s*(\d+)\s*Mbps\s*·\s*S\/\s*(\d+)/gi;
  const planes = [];
  let m;
  while ((m = re.exec(planesTv || ""))) {
    const [, nombre, vel, precio] = m;
    const precioNum = Number(precio);
    const label = promoActiva
      ? `${nombre} · ${vel} Mbps · S/${precioNum} → S/${Math.round(precioNum / 2)} primer mes (promo 50%)`
      : `${nombre} · ${vel} Mbps · S/${precioNum}`;
    planes.push({ valor: nombre, label });
  }
  return planes;
}


export default function AgendarInstalacionPage() {
  // Token como ultimo segmento de la ruta ("/agendar-instalacion/<token>"),
  // no como query string -- ver nota arriba.
  const tok = window.location.pathname.split("/agendar-instalacion/")[1]?.split(/[/?]/)[0] || "";

  const [resolviendo, setResolviendo] = useState(true);
  const [linkInvalido, setLinkInvalido] = useState(false);

  const [planes, setPlanes] = useState([]);
  const [form, setForm] = useState({ dni: "", celular_titular: "", direccion: "", plan: "", fecha: "", horario: "", correo: "" });
  const [nombreDni, setNombreDni] = useState("");
  const [buscandoDni, setBuscandoDni] = useState(false);
  const [dniNoEncontrado, setDniNoEncontrado] = useState(false);

  const [ubicacion, setUbicacion] = useState(null); // {lat,lng}
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState("");
  const [coberturaEstado, setCoberturaEstado] = useState(null); // null | "revisando" | true | false
  const [mapaError, setMapaError] = useState(false);
  const [vistaSatelital, setVistaSatelital] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState({}); // { campo: mensaje } -- uno por campo, no solo el primero
  const [errorEnvio, setErrorEnvio] = useState("");
  const [enviado, setEnviado] = useState(false);

  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const markerRef = useRef(null);
  const coberturaTimerRef = useRef(null);

  useEffect(() => {
    supabase.from("bot_pagos_v3_config").select("planes_tv,promocion_activa,promocion_texto").eq("id", 1).maybeSingle()
      .then(({ data }) => setPlanes(parsearPlanesConPromo(data?.planes_tv, !!(data?.promocion_activa && data?.promocion_texto))))
      .catch(() => {});
  }, []);

  // Resuelve el token al cargar -- confirma que el link es valido ANTES de
  // mostrar el formulario (si no, no tiene sentido dejar que alguien llene
  // todo para recien enterarse al final que el link estaba vencido), y de
  // paso precarga el celular guardado del lado del servidor.
  useEffect(() => {
    if (!tok) { setResolviendo(false); setLinkInvalido(true); return; }
    fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "FormularioInstalacionResolver", payload: { token: tok } }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res?.ok || !res.data?.ok) { setLinkInvalido(true); return; }
        setForm((f) => ({ ...f, celular_titular: res.data.telefono || "" }));
        // Si el cliente ya compartio su ubicacion GPS por WhatsApp antes de
        // abrir este link (ej. al confirmar cobertura), se precarga el pin
        // en vez de hacerlo marcarla de nuevo a mano (pedido explicito del
        // usuario, 2026-10-26).
        if (res.data.ubicacion?.lat != null && res.data.ubicacion?.lng != null) {
          setUbicacion({ lat: res.data.ubicacion.lat, lng: res.data.ubicacion.lng });
        }
      })
      .catch(() => setLinkInvalido(true))
      .finally(() => setResolviendo(false));
  }, [tok]);

  // DNI -> nombre completo (RENIEC) apenas llega a 8 digitos -- pedido
  // explicito del usuario (2026-10-26), igual que ya hace SidebarApp.jsx
  // al crear una orden. Solo informativo (se muestra, no se envia aparte --
  // el bot ya obtiene el nombre el solo por DNI del lado del servidor).
  // Si no se encuentra, se avisa (antes se quedaba en blanco sin explicar
  // nada -- el cliente no tenia forma de notar un DNI mal tecleado).
  useEffect(() => {
    if (form.dni.length !== 8) { setNombreDni(""); setDniNoEncontrado(false); return; }
    let cancelado = false;
    setBuscandoDni(true);
    setDniNoEncontrado(false);
    fetch(`https://api.perudevs.com/api/v1/dni/simple?document=${form.dni}&key=${DNI_API_KEY}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelado) return;
        const nombre = data?.estado && data?.resultado?.nombre_completo ? data.resultado.nombre_completo : "";
        setNombreDni(nombre);
        setDniNoEncontrado(!nombre);
      })
      .catch(() => { if (!cancelado) { setNombreDni(""); setDniNoEncontrado(false); } })
      .finally(() => { if (!cancelado) setBuscandoDni(false); });
    return () => { cancelado = true; };
  }, [form.dni]);

  // Mapa interactivo -- click o arrastrar el pin marca la ubicacion, mas
  // intuitivo que solo el boton de geolocalizacion (pedido explicito del
  // usuario, 2026-10-26: util tambien cuando el cliente no esta fisicamente
  // en su casa en ese momento, puede marcarla a ojo en el mapa igual).
  useEffect(() => {
    // "resolviendo" en las dependencias: mientras es true, esta pantalla
    // muestra SOLO el loader (ver el early-return mas abajo), asi que el
    // <div> del mapa ni existe en el DOM todavia -- si este efecto corriera
    // una sola vez al montar (deps []), se ejecutaria ANTES de que el div
    // exista, mapRef.current seria null, y el mapa nunca se inicializaria
    // (bug real reportado en vivo, 2026-10-26: mapa en blanco sin ningun
    // error). Al depender de "resolviendo", el efecto se vuelve a evaluar
    // apenas termina de resolverse el token y el formulario real (con el
    // div del mapa) recien se monta.
    if (resolviendo || !mapRef.current || mapObjRef.current) return;
    let cancelado = false;
    loadGoogleMapsSdk().then((maps) => {
      if (cancelado || !mapRef.current || mapObjRef.current) return;
      const centro = ubicacion || CENTRO_DEFAULT;
      // gestureHandling "greedy": sin esto, el mapa (al estar dentro de una
      // pagina con scroll normal) exige "usar 2 dedos" para moverlo en
      // celular -- con 1 dedo simplemente se scrollea la pagina y el mapa
      // no reacciona (queja real del usuario, 2026-10-26). fullscreenControl
      // true: boton nativo de Google para ampliar el mapa a pantalla
      // completa (pedido explicito del usuario, "posibilidad de ampliar
      // mapa") -- el boton de vista satelital es propio (mas chico y
      // simple que el selector nativo de Google), ver botonSatelital abajo.
      const mapa = new maps.Map(mapRef.current, { center: centro, zoom: ubicacion ? 16 : 13, streetViewControl: false, mapTypeControl: false, fullscreenControl: true, gestureHandling: "greedy" });
      const marker = new maps.Marker({ position: centro, map: mapa, draggable: true, icon: pinClienteIcon(maps, undefined) });
      mapObjRef.current = mapa;
      markerRef.current = marker;
      const actualizar = (pos) => setUbicacion({ lat: pos.lat(), lng: pos.lng() });
      marker.addListener("dragend", () => actualizar(marker.getPosition()));
      mapa.addListener("click", (e) => { marker.setPosition(e.latLng); actualizar(e.latLng); });
    }).catch(() => { if (!cancelado) setMapaError(true); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolviendo]);

  // Boton propio de vista satelital -- mas chico y simple que el selector
  // nativo de Google (pedido explicito del usuario, 2026-10-26).
  useEffect(() => {
    mapObjRef.current?.setMapTypeId(vistaSatelital ? "satellite" : "roadmap");
  }, [vistaSatelital]);

  // Chequeo de cobertura EN VIVO mientras se mueve el pin -- SOLO pide
  // true/false al backend (accion FormularioCoberturaCheck), nunca la
  // geometria real de las zonas -- exponer el mapa de cobertura completo a
  // cualquiera que abra este link publico no es buena idea (discutido con
  // el usuario, 2026-10-26), pero confirmar si ese punto puntual esta
  // cubierto es informacion segura de compartir.
  useEffect(() => {
    if (!ubicacion) { setCoberturaEstado(null); return; }
    if (mapObjRef.current) mapObjRef.current.panTo(ubicacion);
    if (markerRef.current) markerRef.current.setPosition(ubicacion);
    setCoberturaEstado("revisando");
    clearTimeout(coberturaTimerRef.current);
    coberturaTimerRef.current = setTimeout(() => {
      fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "FormularioCoberturaCheck", payload: { lat: ubicacion.lat, lng: ubicacion.lng } }),
      })
        .then((r) => r.json())
        .then((data) => setCoberturaEstado(data?.ok ? !!data.data?.cubierto : null))
        .catch(() => setCoberturaEstado(null));
    }, 600);
    return () => clearTimeout(coberturaTimerRef.current);
  }, [ubicacion]);

  // Pin propio (persona + globo de estado) segun el resultado de cobertura
  // -- mas intuitivo directo en el mapa que solo el texto debajo del boton,
  // y mas atractivo que el puntito de color por defecto (pedido del
  // usuario, 2026-10-26).
  useEffect(() => {
    if (!markerRef.current || !window.google?.maps) return;
    markerRef.current.setIcon(pinClienteIcon(window.google.maps, coberturaEstado === "revisando" ? undefined : coberturaEstado));
  }, [coberturaEstado]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const [otraFecha, setOtraFecha] = useState(false);
  const dias = proximosDias();
  const elegirFecha = (iso) => {
    setForm((f) => {
      const h = HORARIOS.find((x) => x.valor === f.horario);
      // Si el turno ya elegido no esta disponible para la nueva fecha (ej.
      // "Mañana" y se cambia a HOY por la tarde), se limpia.
      return { ...f, fecha: iso, horario: h && !horarioDisponible(iso, h) ? "" : f.horario };
    });
    setErrores((e) => ({ ...e, fecha: undefined, horario: undefined }));
  };

  const pedirUbicacion = () => {
    setErrorUbicacion("");
    if (!navigator.geolocation) { setErrorUbicacion("Tu navegador no permite compartir ubicación -- márcala en el mapa o escríbenos por WhatsApp."); return; }
    setBuscandoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setBuscandoUbicacion(false); },
      () => { setErrorUbicacion("No se pudo obtener tu ubicación -- márcala directo en el mapa de abajo."); setBuscandoUbicacion(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const fechaEsDomingo = (iso) => iso && new Date(iso + "T00:00:00").getDay() === 0;

  // Devuelve TODOS los errores a la vez (uno por campo), no solo el
  // primero -- antes el cliente corregia un campo, reenviaba, y recien ahi
  // se enteraba del siguiente error, uno por uno (queja real del usuario,
  // 2026-10-26).
  const validar = () => {
    const errs = {};
    if (!/^\d{8}$/.test(form.dni.trim())) errs.dni = "El DNI debe tener 8 dígitos.";
    if (!/^\d{9}$/.test(form.celular_titular.replace(/\D/g, ""))) errs.celular_titular = "El celular debe tener 9 dígitos.";
    if (!form.direccion.trim()) errs.direccion = "Falta la dirección.";
    if (!form.plan) errs.plan = "Elige un plan.";
    if (!form.fecha) errs.fecha = "Elige un día.";
    else if (form.fecha < hoyISO()) errs.fecha = "Esa fecha ya pasó -- elige otro día.";
    else if (fechaEsDomingo(form.fecha)) errs.fecha = "Los domingos no hacemos instalaciones -- elige otro día.";
    const turno = HORARIOS.find((h) => h.valor === form.horario);
    if (!turno) errs.horario = "Elige un horario.";
    else if (form.fecha && !horarioDisponible(form.fecha, turno)) errs.horario = "Ese horario de hoy ya pasó -- elige otro.";
    return errs;
  };

  const enviar = async (e) => {
    e.preventDefault();
    const errs = validar();
    if (Object.keys(errs).length) { setErrores(errs); return; }
    setErrores({});
    setErrorEnvio("");
    setEnviando(true);
    try {
      const fechaObj = new Date(form.fecha + "T00:00:00");
      const diaHorario = `${DIAS_SEMANA_ES[fechaObj.getDay()]} ${form.fecha.slice(8, 10)}/${form.fecha.slice(5, 7)}, ${form.horario}`;
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "FormularioInstalacionEnviar",
          payload: {
            token: tok,
            dni: form.dni.trim(), celular_titular: form.celular_titular.trim(), direccion: form.direccion.trim(),
            plan: form.plan, dia_horario: diaHorario, correo: form.correo.trim() || null,
            lat: ubicacion?.lat ?? null, lng: ubicacion?.lng ?? null,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.ok) throw new Error(data?.error || "No se pudo enviar");
      setEnviado(true);
    } catch (err) {
      setErrorEnvio("No se pudo enviar tus datos -- intenta de nuevo o escríbenos directo por WhatsApp.");
    } finally {
      setEnviando(false);
    }
  };

  if (resolviendo) {
    return (
      <Fondo>
        <div className="ai-centro" style={{ minHeight: "auto", marginTop: -130 }}>
          <Logo />
          <div className="ai-card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px" }}>
            <Loader2 size={20} color="#F47A20" className="ai-girar" />
            <span className="ai-pulso" style={{ fontSize: 14, color: "#475569" }}>Cargando tu formulario...</span>
          </div>
        </div>
      </Fondo>
    );
  }

  if (linkInvalido) {
    return (
      <Fondo>
        <div className="ai-wrap">
          <Logo />
          <div className="ai-card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
            <h2 className="ai-titulo" style={{ fontSize: 18 }}>Este link ya no es válido</h2>
            <p className="ai-lead" style={{ margin: 0 }}>Puede que haya vencido. Pide uno nuevo por WhatsApp y te lo enviamos al toque.</p>
          </div>
        </div>
      </Fondo>
    );
  }

  if (enviado) {
    const colores = ["#F47A20", "#f5a623", "#1E4F9C", "#16a34a", "#60a5fa"];
    return (
      <Fondo>
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 2 }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className="ai-confeti" style={{ left: `${(i * 37) % 100}%`, background: colores[i % colores.length], animationDuration: `${2.2 + (i % 5) * 0.35}s`, animationDelay: `${(i % 7) * 0.12}s` }} />
          ))}
        </div>
        <div className="ai-wrap">
          <Logo />
          <div className="ai-card" style={{ textAlign: "center" }}>
            <svg className="ai-check" width="76" height="76" viewBox="0 0 52 52" style={{ marginBottom: 10 }}>
              <circle cx="26" cy="26" r="24" fill="none" stroke="#16a34a" strokeWidth="3" />
              <path d="M15 27l7 7 15-16" fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 className="ai-titulo">¡Listo, <span>recibimos tus datos</span>!</h2>
            <p className="ai-lead">Vuelve a WhatsApp: te mostraremos un resumen para que lo confirmes antes de agendar tu instalación.</p>
            {/* window.close() solo funciona si el navegador lo permite (ej. la
                pestaña/webview en la que WhatsApp abrio este link) -- si no
                hace nada, el cliente igual puede volver a WhatsApp a mano,
                asi que es un boton de "mejor esfuerzo", nunca indispensable. */}
            <button type="button" className="ai-enviar" onClick={() => window.close()}>
              Volver a WhatsApp
            </button>
          </div>
        </div>
      </Fondo>
    );
  }

  const turnoSel = HORARIOS.find((h) => h.valor === form.horario);
  const fechaSelTexto = form.fecha
    ? (() => { const d = new Date(form.fecha + "T00:00:00"); return `${DIAS_SEMANA_ES[d.getDay()]} ${d.getDate()} de ${MESES_CORTO[d.getMonth()]}`; })()
    : "";
  const esFechaDeLista = dias.some((d) => d.iso === form.fecha);

  return (
    <Fondo>
      <div className="ai-wrap">
        <Logo />
        <form className="ai-card" onSubmit={enviar} noValidate>
          <h1 className="ai-titulo">Agenda tu <span>instalación</span></h1>
          <p className="ai-lead">Llena tus datos aquí, es más rápido que escribirlos por WhatsApp. Te toma menos de 2 minutos. ⚡</p>

          <div className="ai-paso" style={{ marginTop: 4 }}><b>1</b> Tus datos</div>
          <div className="ai-sec" style={{ animationDelay: ".15s" }}>
            <label className="ai-label">DNI del titular</label>
            <input className="ai-inp" value={form.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="12345678" />
            {buscandoDni && <p className="ai-ayuda" style={{ margin: "6px 0 0" }}>Buscando...</p>}
            {!buscandoDni && nombreDni && <div className="ai-ok"><User size={14} /> {nombreDni}</div>}
            {!buscandoDni && dniNoEncontrado && <p className="ai-err">No encontramos ese DNI -- revisa que esté bien escrito.</p>}
            {errores.dni && <p className="ai-err">{errores.dni}</p>}
          </div>
          <div className="ai-sec" style={{ animationDelay: ".2s" }}>
            <label className="ai-label">Celular del titular</label>
            <input className="ai-inp" value={form.celular_titular} onChange={(e) => set("celular_titular", e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" placeholder="987654321" />
            {errores.celular_titular && <p className="ai-err">{errores.celular_titular}</p>}
          </div>
          <div className="ai-sec" style={{ animationDelay: ".25s" }}>
            <label className="ai-label">Correo <span style={{ color: "#94a3b8", fontWeight: 500 }}>(opcional)</span></label>
            <input className="ai-inp" type="email" value={form.correo} onChange={(e) => set("correo", e.target.value)} placeholder="tucorreo@ejemplo.com" />
          </div>

          <div className="ai-paso"><b>2</b> ¿Dónde instalamos?</div>
          <div className="ai-sec" style={{ animationDelay: ".3s" }}>
            <label className="ai-label">Dirección exacta</label>
            <input className="ai-inp" value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Jr./Av., número, urbanización/zona" />
            {errores.direccion && <p className="ai-err">{errores.direccion}</p>}
          </div>
          <div className="ai-sec" style={{ animationDelay: ".35s" }}>
            <label className="ai-label">Ubicación en el mapa</label>
            <p className="ai-ayuda">Toca el mapa o arrastra el pin hasta tu casa -- aunque no estés ahí en este momento.</p>
            {mapaError ? (
              <p className="ai-err" style={{ margin: "0 0 8px" }}>No se pudo cargar el mapa -- usa el botón de abajo o describe bien la dirección arriba, igual podemos confirmar por WhatsApp.</p>
            ) : (
              <div style={{ position: "relative" }}>
                <div ref={mapRef} className="ai-mapa" />
                {/* Chico y propio en vez del selector nativo de Google (pedido
                    explicito del usuario, 2026-10-26) -- el boton nativo de
                    "ampliar" (fullscreen) ya lo pone Google solo abajo a la
                    derecha (fullscreenControl:true en el useEffect del mapa). */}
                <button
                  type="button"
                  onClick={() => setVistaSatelital((v) => !v)}
                  style={{ position: "absolute", top: 8, left: 8, zIndex: 1, padding: "6px 10px", borderRadius: 8, border: "none", background: "#fff", color: "#334155", fontSize: 11.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.2)", fontFamily: "inherit" }}
                >
                  {vistaSatelital ? "🗺️ Mapa" : "🛰️ Satélite"}
                </button>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
              <button type="button" className="ai-btn-sec" onClick={pedirUbicacion} disabled={buscandoUbicacion}>
                {buscandoUbicacion ? <Loader2 size={14} className="ai-girar" /> : <MapPin size={14} />} {buscandoUbicacion ? "Obteniendo..." : "Usar mi ubicación actual"}
              </button>
              {coberturaEstado === "revisando" && <span className="ai-pulso" style={{ fontSize: 12, color: "#94a3b8" }}>Revisando cobertura...</span>}
              {coberturaEstado === true && <span className="ai-ok" style={{ marginTop: 0 }}>✅ Zona con cobertura</span>}
              {coberturaEstado === false && <span style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>⚠️ Fuera del mapa de cobertura, lo confirmamos igual</span>}
            </div>
            {errorUbicacion && <p className="ai-err">{errorUbicacion}</p>}
          </div>

          <div className="ai-paso"><b>3</b> Tu plan</div>
          <div className="ai-sec" style={{ animationDelay: ".4s" }}>
            <select className="ai-inp" value={form.plan} onChange={(e) => set("plan", e.target.value)}>
              <option value="">Elige un plan...</option>
              {planes.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
            </select>
            {errores.plan && <p className="ai-err">{errores.plan}</p>}
          </div>

          <div className="ai-paso"><b>4</b> ¿Cuándo te instalamos?</div>
          <div className="ai-sec" style={{ animationDelay: ".45s" }}>
            <label className="ai-label">Día</label>
            <div className="ai-dias">
              {dias.map((d, i) => (
                <button
                  key={d.iso}
                  type="button"
                  className={`ai-dia${d.etiqueta === "Hoy" ? " hoy" : ""}${form.fecha === d.iso ? " sel" : ""}`}
                  style={{ animationDelay: `${0.5 + i * 0.05}s` }}
                  onClick={() => { setOtraFecha(false); elegirFecha(d.iso); }}
                >
                  <small>{d.etiqueta}</small>
                  <strong>{d.num}</strong>
                  <em>{d.mes}</em>
                </button>
              ))}
              <button
                type="button"
                className={`ai-dia${otraFecha || (form.fecha && !esFechaDeLista) ? " sel" : ""}`}
                style={{ animationDelay: `${0.5 + dias.length * 0.05}s` }}
                onClick={() => setOtraFecha(true)}
              >
                <small>Otra</small>
                <strong>📅</strong>
                <em>fecha</em>
              </button>
            </div>
            {(otraFecha || (form.fecha && !esFechaDeLista)) && (
              <input className="ai-inp" style={{ marginTop: 8 }} type="date" min={hoyISO()} value={form.fecha} onChange={(e) => elegirFecha(e.target.value)} />
            )}
            {errores.fecha && <p className="ai-err">{errores.fecha}</p>}
          </div>
          <div className="ai-sec" style={{ animationDelay: ".5s" }}>
            <label className="ai-label">Horario</label>
            <div className="ai-turnos">
              {HORARIOS.map((h) => {
                const disponible = !form.fecha || horarioDisponible(form.fecha, h);
                return (
                  <button
                    key={h.valor}
                    type="button"
                    disabled={!disponible}
                    className={`ai-turno${form.horario === h.valor ? " sel" : ""}`}
                    onClick={() => { set("horario", h.valor); setErrores((e) => ({ ...e, horario: undefined })); }}
                  >
                    <span>{h.icono}</span>
                    <strong>{h.nombre}</strong>
                    <em>{disponible ? h.rango : "Ya pasó"}</em>
                  </button>
                );
              })}
            </div>
            <p className="ai-ayuda" style={{ margin: "8px 0 0" }}>Instalamos de lunes a sábado, de 8:00 am a 5:30 pm.</p>
            {errores.horario && <p className="ai-err">{errores.horario}</p>}
          </div>

          {fechaSelTexto && turnoSel && (
            <div className="ai-ok" style={{ background: "#fff7ed", color: "#c2410c", margin: "4px 0 16px", padding: "10px 12px", fontSize: 13 }}>
              🗓️ Instalación el <b style={{ textTransform: "capitalize" }}>{fechaSelTexto}</b>, turno {turnoSel.nombre.toLowerCase()}
            </div>
          )}

          {Object.keys(errores).some((k) => errores[k]) && (
            <p className="ai-err" style={{ margin: "0 0 12px", fontSize: 13 }}>Revisa los campos marcados en rojo.</p>
          )}
          {errorEnvio && <p className="ai-err" style={{ margin: "0 0 12px", fontSize: 13 }}>{errorEnvio}</p>}

          <button type="submit" className="ai-enviar" disabled={enviando}>
            {enviando ? <><Loader2 size={18} className="ai-girar" /> Enviando...</> : "Enviar mis datos 🚀"}
          </button>
          <p className="ai-ayuda" style={{ textAlign: "center", margin: "12px 0 0" }}>🔒 Tus datos solo se usan para agendar tu instalación.</p>
        </form>
      </div>
    </Fondo>
  );
}
