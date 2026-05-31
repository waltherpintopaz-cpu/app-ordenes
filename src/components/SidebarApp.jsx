import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import logoAmericanet from "../assets/americanet-logo-new-trimmed.png";
import { CreditCard, Trash2, XCircle, RefreshCw, Zap, MapPin } from "lucide-react";

// ─── Constantes ───────────────────────────────────────────────────────────────
const CW_BASE    = "https://chat.americanet.club";
const CW_TOKEN   = "Wm9K5UiCrfJPcgFJrWgxftYv";
const OAI_KEY    = String(import.meta.env.VITE_OPENAI_KEY || "").trim();
const PROXY_URL  = "https://n8n.americanet.space/webhook/sidebar-proxy";
const DIAGNO_BASE = import.meta.env.PROD ? "https://amnet-diagno.0lthka.easypanel.host" : "";
const ESTADOS_IGNORAR = ["pagado","PAGADO","paid","anulado","ANULADO","cancelled","canceled"];
// ─── Tokens por agente ───────────────────────────────────────────────────────
const AGENTES = {
  americanet: [
    { nombre: "Milagros Luna",  token: "WXJWQ21KODUvcllodTFPWW1rVVpOUT09" },
    { nombre: "Walter Pinto",   token: "SEppOWVXR1JRTkdnRm1Zd2t6UzM4QT09" },
    { nombre: "Sofia Rosales",  token: "LzNXSERnUHBMMS91b0NzUGFTVkFkZz09" },
  ],
  dimfiber: [
    { nombre: "Milagros Luna",  token: "SE8xNXBlNzBvR2NFTFlQVWl0Y0psZz09" },
    { nombre: "admin",          token: "YjQ4cmZEZHQyNnBNQ2Z5d0R4R1NnUT09" },
    { nombre: "Cynthia",        token: "a0dyNThoVUVpVkowVmMzdGtZdWErQT09" },
    { nombre: "Rosa",           token: "VlJPODIycXg2R0t2VXVBUk5kQzByZz09" },
  ],
};
// nod06 usa los mismos agentes que americanet
AGENTES.nod06 = AGENTES.americanet;

function getToken(empresa, nombre) {
  const lista = AGENTES[empresa] || AGENTES.americanet;
  return lista.find(a => a.nombre.toLowerCase() === (nombre||"").toLowerCase())?.token || null;
}

const PASARELAS = {
  americanet: ["Efectivo Oficina/Sucursal","Depósito bancario","Transferencia Bancaria","Walter Pinto","Americanet"],
  dimfiber:   ["Efectivo Oficina/Sucursal","Transferencia Bancaria","Aplicaciones bancarias","Pagos DIM","Americanet"],
  nod06:      ["Efectivo Oficina/Sucursal","Depósito bancario","Transferencia Bancaria","Walter Pinto","Americanet"],
};

async function mkwProxy(nodo, accion, payload, token) {
  const r = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodo, accion, payload, ...(token ? { token } : {}) }),
  });
  const json = await r.json();
  return json.data ?? json;
}

// ─── CSS global ───────────────────────────────────────────────────────────────
const globalCSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: 'Inter', system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
  .sb-panel * { font-family: 'Inter', system-ui, -apple-system, sans-serif !important; }
  .sb-tab-btn { transition: color .15s, border-color .15s; }
  .sb-btn-action { transition: opacity .15s, background .15s; }
  .sb-btn-action:hover:not(:disabled) { opacity: 0.88; }
  .sb-pulse::after { content:''; position:absolute; inset:0; border-radius:50%; background:inherit; animation: sbPing 1.5s ease infinite; }
  .sb-tbl { border-collapse: collapse; width: 100%; }
  .sb-tbl td, .sb-tbl th { padding: 7px 10px; vertical-align: middle; }
  .sb-tbl th { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; background: #003DA5; border-bottom: none; white-space: nowrap; }
  .sb-tbl td { font-size: 12px; color: #0A0A1A; border-bottom: 1px solid #D9E3F8; }
  .sb-tbl tr:last-child td { border-bottom: none; }
  .sb-tbl tr:nth-child(even) td { background: #F0F4FF; }
  .sb-tbl tr:hover td { background: #E8EFFF; }
  .sb-row-form { display: grid; grid-template-columns: 140px 1fr; align-items: center; gap: 0; border-bottom: 1px solid #D9E3F8; padding: 9px 0; }
  .sb-row-form:last-child { border-bottom: none; }
  .sb-row-form-label { font-size: 12px; font-weight: 600; color: #4B5563; }
  .sb-row-form-val { font-size: 12px; color: #0A0A1A; font-weight: 500; }
  @keyframes sbFadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes sbPing   { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(2.2);opacity:0} }
  @keyframes dotPulse { 0%,80%,100%{transform:scale(.55);opacity:.25} 40%{transform:scale(1);opacity:1} }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #D9E3F8; border-radius: 4px; }
`;

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  navy:    "#0A0A1A",
  blue:    "#003DA5",
  blueDk:  "#002d80",
  sky:     "#003DA5",
  skyDk:   "#002d80",
  slate:   "#4B5563",
  muted:   "#4B5563",
  border:  "#D9E3F8",
  bg:      "#F0F4FF",
  card:    "#FFFFFF",
  green:   "#00B140",
  greenLt: "#e6f9ee",
  amber:   "#d97706",
  amberLt: "#fffbeb",
  red:     "#DC2626",
  redLt:   "#fee2e2",
  purple:  "#003DA5",
  teal:    "#003DA5",
  accent:  "#E8EFFF",
};

const S = {
  root:   { fontFamily:"'Inter',system-ui,-apple-system,sans-serif", fontSize:13, color:T.navy, background:T.bg, minHeight:"100vh" },
  card:   { background:T.card, borderRadius:6, border:`1px solid ${T.border}`, marginBottom:8, overflow:"hidden" },
  label:  { fontSize:11, fontWeight:700, color:T.slate, marginBottom:3, display:"block", textTransform:"uppercase", letterSpacing:"0.4px" },
  val:    { fontWeight:600, color:T.navy, fontSize:13, lineHeight:1.4 },
  mono:   { fontFamily:"monospace", fontWeight:700, color:T.navy, fontSize:12 },
  badge:  (c,bg) => ({ background:bg||c, color:"#fff", borderRadius:3, padding:"2px 7px", fontSize:11, fontWeight:700, display:"inline-flex", alignItems:"center", gap:3 }),
  btn:    (c=T.blue) => ({ background:c, color:"#fff", border:"none", borderRadius:5, padding:"9px 14px", fontWeight:700, fontSize:12, cursor:"pointer", width:"100%", transition:"opacity .15s" }),
  btnSm:  (c=T.blue) => ({ background:c, color:"#fff", border:"none", borderRadius:4, padding:"4px 10px", fontWeight:700, fontSize:11, cursor:"pointer" }),
  btnOut: { background:"#fff", border:`1px solid #D9E3F8`, borderRadius:4, padding:"4px 10px", fontWeight:600, fontSize:11, cursor:"pointer", color:"#4B5563" },
  input:  { border:`1px solid #D9E3F8`, borderRadius:4, padding:"7px 10px", fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", color:"#0A0A1A", background:"#fff", fontFamily:"inherit" },
  select: { border:`1px solid #D9E3F8`, borderRadius:4, padding:"7px 10px", fontSize:13, width:"100%", boxSizing:"border-box", background:"#fff", color:"#0A0A1A", fontFamily:"inherit" },
  alert:  (ok) => ({ background:ok?"#e6f9ee":"#fee2e2", color:ok?"#00B140":"#DC2626", border:`1px solid ${ok?"#86efac":"#fca5a5"}`, borderRadius:5, padding:"9px 12px", fontSize:12, marginBottom:8, fontWeight:600 }),
  divider:{ borderTop:`1px solid #D9E3F8`, margin:"12px 0" },
  statCard: () => ({ background:T.card, border:`1px solid #D9E3F8`, borderRadius:5, padding:"8px 10px", display:"flex", flexDirection:"column", gap:2 }),
};

// ─── Splash (loading / sin contacto) ─────────────────────────────────────────
function Splash({ title, subtitle, loading }) {
  return (
    <div style={{ position:"fixed", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(145deg,#1a6fbc 0%,#0d5a9e 50%,#0a4882 100%)", overflow:"hidden", fontFamily:"'Plus Jakarta Sans','Inter',system-ui,sans-serif" }}>
      {/* Burbujas decorativas */}
      <div style={{ position:"absolute", width:220, height:220, borderRadius:"50%", background:"rgba(255,255,255,0.06)", top:-60, left:-70 }} />
      <div style={{ position:"absolute", width:160, height:160, borderRadius:"50%", background:"rgba(255,255,255,0.04)", bottom:40, right:-50 }} />
      <div style={{ position:"absolute", width:90, height:90, borderRadius:"50%", background:"rgba(255,255,255,0.05)", top:80, right:30 }} />

      {/* Logo */}
      <div style={{ position:"relative", zIndex:10, display:"flex", flexDirection:"column", alignItems:"center", gap:0 }}>
        <img src={logoAmericanet} alt="Americanet" style={{ height:90, marginBottom:24, filter:"brightness(0) invert(1)", opacity:0.95 }} />

        <div style={{ background:"#22c55e", borderRadius:20, padding:"4px 16px", marginBottom:6 }}>
          <span style={{ fontWeight:700, fontSize:11, color:"#fff", letterSpacing:0.8 }}>Panel de Agentes</span>
        </div>
        <div style={{ color:"rgba(255,255,255,0.45)", fontSize:10, letterSpacing:3, fontWeight:500, textTransform:"uppercase", marginBottom:36 }}>
          CRM · Chatwoot
        </div>

        {/* Animación de puntos */}
        {loading && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:"rgba(255,255,255,0.8)",
                animation:`dotPulse 1.4s ease-in-out ${i*0.16}s infinite` }} />
            ))}
          </div>
        )}
        {!loading && (
          <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11, marginTop:4, textAlign:"center" }}>
            Esperando conversación en Chatwoot...
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Persistencia de agente (cookie + localStorage) ──────────────────────────
function getStoredAgente() {
  const c = document.cookie.split(";").find(x => x.trim().startsWith("sb_agente="));
  if (c) return decodeURIComponent(c.split("=")[1].trim());
  return localStorage.getItem("sb_agente") || "";
}
function setStoredAgente(nombre) {
  const exp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `sb_agente=${encodeURIComponent(nombre)};expires=${exp};path=/;SameSite=None;Secure`;
  localStorage.setItem("sb_agente", nombre);
}
function clearStoredAgente() {
  document.cookie = "sb_agente=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=None;Secure";
  localStorage.removeItem("sb_agente");
}

// Lista única de agentes para el selector inicial
const TODOS_AGENTES = [
  "Milagros Luna", "Walter Pinto", "Sofia Rosales",
  "Cynthia", "Rosa", "admin",
];

// ─── Splash selección de agente ───────────────────────────────────────────────
function SplashAgente({ onSelect }) {
  const [sel, setSel] = useState("");
  return (
    <div style={{ position:"fixed", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(145deg,#1a6fbc 0%,#0d5a9e 50%,#0a4882 100%)", overflow:"hidden",
      fontFamily:"'Plus Jakarta Sans','Inter',system-ui,sans-serif", padding:24 }}>
      <div style={{ position:"absolute", width:220, height:220, borderRadius:"50%", background:"rgba(255,255,255,0.06)", top:-60, left:-70 }} />
      <div style={{ position:"absolute", width:160, height:160, borderRadius:"50%", background:"rgba(255,255,255,0.04)", bottom:40, right:-50 }} />

      <div style={{ position:"relative", zIndex:10, width:"100%", maxWidth:320 }}>
        <img src={logoAmericanet} alt="Americanet" style={{ height:60, display:"block", margin:"0 auto 20px", filter:"brightness(0) invert(1)", opacity:0.95 }} />
        <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:16, padding:"24px 20px", backdropFilter:"blur(8px)" }}>
          <div style={{ color:"#fff", fontWeight:800, fontSize:16, textAlign:"center", marginBottom:4 }}>¿Quién eres?</div>
          <div style={{ color:"rgba(255,255,255,0.6)", fontSize:12, textAlign:"center", marginBottom:20 }}>Selecciona tu nombre para continuar</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
            {TODOS_AGENTES.map(nombre => (
              <button key={nombre} onClick={() => setSel(nombre)}
                style={{ background: sel === nombre ? "#fff" : "rgba(255,255,255,0.12)",
                  color: sel === nombre ? T.navy : "#fff",
                  border: `2px solid ${sel === nombre ? "#fff" : "rgba(255,255,255,0.25)"}`,
                  borderRadius:10, padding:"11px 16px", fontWeight:700, fontSize:13,
                  cursor:"pointer", fontFamily:"inherit", textAlign:"left", transition:"all .15s",
                  display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ width:32, height:32, borderRadius:"50%", background: sel === nombre ? T.blue : "rgba(255,255,255,0.2)",
                  display:"inline-flex", alignItems:"center", justifyContent:"center",
                  fontSize:14, fontWeight:800, color:"#fff", flexShrink:0 }}>
                  {nombre[0]}
                </span>
                {nombre}
                {sel === nombre && <span style={{ marginLeft:"auto", fontSize:16 }}>✓</span>}
              </button>
            ))}
          </div>
          <button onClick={() => sel && onSelect(sel)} disabled={!sel}
            style={{ background: sel ? "#22c55e" : "rgba(255,255,255,0.2)", color:"#fff", border:"none",
              borderRadius:10, padding:"13px 16px", fontWeight:800, fontSize:14, cursor: sel ? "pointer" : "not-allowed",
              width:"100%", fontFamily:"inherit", opacity: sel ? 1 : 0.5, transition:"all .2s" }}>
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SidebarApp() {
  const contactLoadedRef = useRef(false);  // evita que urlParam sobreescriba postMessage
  const [contact, setContact]     = useState(null);  // datos de Chatwoot
  const [convId,  setConvId]      = useState(null);
  const [acctId,  setAcctId]      = useState("1");
  const [cliente, setCliente]     = useState(null);  // datos Supabase/Mikrowisp
  const [detalle, setDetalle]     = useState(null);  // GetClientsDetails
  const [facturas, setFacturas]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState(null);
  const [msg,     setMsg]         = useState(null);  // notificación
  const [tab,     setTab]         = useState("info"); // info | pago | prorroga
  // Pago manual
  const [formPago, setFormPago]   = useState({ pasarela: "Yape", monto: "", idfactura: "" });
  const [pagando,  setPagando]    = useState(false);
  const [deletingFact, setDeletingFact] = useState(null);
  const [deletingPago, setDeletingPago] = useState(null);
  const [menuAbierto,  setMenuAbierto]  = useState(null); // fid de la fila con menú abierto
  const [activando,    setActivando]    = useState(false);
  const [editForm,     setEditForm]     = useState({ nombre:"", movil:"", telefono:"", correo:"", cedula:"", direccion_principal:"" });
  const [guardando,    setGuardando]    = useState(false);
  // Comprobante Vision
  const [imgFile,  setImgFile]    = useState(null);
  const [imgPrev,  setImgPrev]    = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis]   = useState(null);
  const fileRef = useRef();
  // Prórroga
  const [prorrForm, setProrrForm] = useState({ fecha: "" });
  const [prorrInfo, setProrrInfo] = useState(null);
  const [prorrando, setProrrando] = useState(false);
  // Crear factura
  const [factForm,  setFactForm]  = useState({ vencimiento: "" });
  const [creando,   setCreando]   = useState(false);
  // Señal y mapa
  const [snOnu,    setSnOnu]    = useState(null);
  const [nodoReal, setNodoReal] = useState(null); // nodo del servidor de diagnóstico (de tabla clientes)
  const [senal,    setSenal]    = useState(null);   // { rx, oltRx, ts }
  const [senalLoad,setSenalLoad]= useState(false);
  const [showMap,    setShowMap]    = useState(false);
  const [factExpand, setFactExpand] = useState(null);
  const [debugMsgs,  setDebugMsgs] = useState([]);
  const isDebug = window.location.search.includes("debug");
  // Diagnóstico MikroTik
  const [diagLoad,   setDiagLoad]   = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [diagError,  setDiagError]  = useState(null);
  const [showDiag,   setShowDiag]   = useState(false);
  // Agente logueado (detectado de Chatwoot o seleccionado manualmente)
  const [agente, setAgente] = useState(() => getStoredAgente());
  // Búsqueda flexible cuando teléfono no encontrado
  const [dniBusq,      setDniBusq]      = useState("");
  const [dniBuscando,  setDniBuscando]  = useState(false);
  const [dniResultados,setDniResultados]= useState([]); // lista de resultados
  const [dniSel,       setDniSel]       = useState(null); // row seleccionado
  const [agregando,    setAgregando]    = useState(false);
  // Crear orden desde sidebar
  const [ordenForm,   setOrdenForm]   = useState({ tipoActuacion: "Incidencia Internet", fechaActuacion: new Date().toISOString().split("T")[0], tecnico: "", descripcion: "", coordenadas: "" });
  const [creandoOrden, setCreandoOrden] = useState(false);
  const [ordenCreada,  setOrdenCreada]  = useState(null);
  const [tecnicosLista, setTecnicosLista] = useState([]);
  const [showOrdenMap, setShowOrdenMap] = useState(false);

  // ── Escuchar mensaje de Chatwoot ──────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // ── postMessage: SIEMPRE activo (maneja cambios de conversación) ───────
    function onMsg(e) {
      let d = e.data;
      // Chatwoot a veces envía el payload como JSON string
      if (typeof d === "string") {
        try { d = JSON.parse(d); } catch(_) { return; }
      }
      if (d && typeof d === "object") {
        setDebugMsgs(prev => [...prev.slice(-4), { origin: e.origin, data: JSON.stringify(d).slice(0,200) }]);
      }
      if (!d || typeof d !== "object") return;

      // data puede venir como objeto o como JSON string dentro del objeto
      const payload = (typeof d.data === "string") ? (() => { try { return JSON.parse(d.data); } catch(_) { return {}; } })() : (d.data || {});

      let ct = null, cv = null;
      if (d.event === "appContext" && payload?.contact) {
        ct = payload.contact; cv = payload.conversation;
      } else if (d.event === "appContext" && d.data?.contact) {
        ct = d.data.contact; cv = d.data.conversation;
      } else if (d.contact?.phone_number !== undefined) {
        ct = d.contact; cv = d.conversation;
      } else if (d.message === "appContext" && d.contact) {
        ct = d.contact; cv = d.conversation;
      }

      // Detectar agente logueado en Chatwoot
      const cwAgent = payload?.currentAgent || d.currentAgent || d.data?.currentAgent;
      if (cwAgent?.name) {
        const nombre = cwAgent.name;
        setAgente(nombre);
        setStoredAgente(nombre);
      }

      if (ct) {
        const phone = ct.phone_number || ct.phoneNumber || "";
        const newConvId = String(cv?.id || "");
        contactLoadedRef.current = true;
        setContact(ct);
        setConvId(newConvId || null);
        setAcctId(String(cv?.account_id || "1"));
        if (phone) buscarCliente(phone);
        else {
          setCliente(null); setDetalle(null); setFacturas([]);
          setError("Este contacto no tiene número de teléfono registrado");
        }
      }
    }

    window.addEventListener("message", onMsg);

    // Notificar a Chatwoot que el iframe está listo
    const notifyReady = () => {
      try { window.parent.postMessage({ event: "iFrameLoaded" }, "*"); } catch(e) {}
    };
    notifyReady();
    setTimeout(notifyReady, 500);
    setTimeout(notifyReady, 1500);

    // ── URL params: solo carga inicial si no llega postMessage ─────────────
    const urlPhone  = params.get("phone") || params.get("phone_number") || "";
    const urlConvId = params.get("conv_id") || params.get("conversation_id") || "";
    const urlAcctId = params.get("account_id") || "1";

    const timers = [];

    if (urlPhone) {
      // Esperar 800ms por si llega postMessage primero
      const t = setTimeout(() => {
        if (contactLoadedRef.current) return;
        const rawPhone = urlPhone.replace(/[^\d]/g, "");
        if (rawPhone.length < 7) return; // template sin resolver
        setContact(prev => prev ? prev : { phone_number: urlPhone, name: "" });
        if (urlConvId) setConvId(prev => prev || urlConvId);
        setAcctId(prev => prev !== "1" ? prev : urlAcctId);
        buscarCliente(urlPhone);
      }, 800);
      timers.push(t);
    }

    // Fallback: si después de 1.5s no hay contacto, intentar Chatwoot API con conv_id
    if (urlConvId && !urlConvId.includes("{{")) {
      const acct = urlAcctId.includes("{{") ? "1" : urlAcctId;
      const t2 = setTimeout(async () => {
        if (contactLoadedRef.current) return;
        try {
          const res = await fetch(`${CW_BASE}/api/v1/accounts/${acct}/conversations/${urlConvId}`, {
            headers: { "api_access_token": CW_TOKEN },
          });
          const conv = await res.json();
          const phone = conv?.meta?.sender?.phone_number || "";
          const name  = conv?.meta?.sender?.name || "";
          if (phone) {
            contactLoadedRef.current = true;
            setContact({ phone_number: phone, name });
            setConvId(urlConvId);
            setAcctId(acct);
            buscarCliente(phone);
          }
        } catch(_) {}
      }, 1500);
      timers.push(t2);
    }

    // Demo / desarrollo
    if (process.env.NODE_ENV === "development" || params.has("demo")) {
      setTimeout(() => {
        setContact({ name: "DEMO", phone_number: "+51949529785" });
        buscarCliente("+51949529785");
      }, 600);
    }

    return () => { window.removeEventListener("message", onMsg); timers.forEach(clearTimeout); };
  }, []);

  function notify(text, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  function resetEstado() {
    setCliente(null); setDetalle(null); setFacturas([]);
    setAnalisis(null); setImgFile(null); setImgPrev(null);
    setProrrInfo(null); setProrrForm({ fecha: "" });
    setSnOnu(null); setNodoReal(null); setSenal(null);
    setShowMap(false); setDiagResult(null); setDiagError(null); setShowDiag(false);
    setDniResultados([]); setDniSel(null); setDniBusq("");
    setOrdenCreada(null);
  }

  // ── Cargar datos completos a partir de una row de mikrowisp_clientes ────────
  async function cargarDesdeRow(row) {
    const nodoNum = Number(row.nodo);
    const empresa = nodoNum === 5 ? "dimfiber" : nodoNum === 11 ? "nod06" : "americanet";
    const cli = { ...row, empresa };
    setCliente(cli);
    setError(null);

    const id = parseInt(cli.mikrowisp_id, 10);
    const [detRes, invRes] = await Promise.all([
      mkwProxy(nodoNum, "GetClientsDetails", { idcliente: id }).catch(() => null),
      mkwProxy(nodoNum, "GetInvoices",       { idcliente: id }).catch(() => null),
    ]);

    const clientes = detRes?.clientes || detRes?.datos || [];
    const detCliente = Array.isArray(clientes) ? clientes[0] : clientes;
    const servicio = Array.isArray(detCliente?.servicios) ? detCliente.servicios[0] : null;
    setDetalle({ ...detCliente, _servicio: servicio });
    // Pre-llenar form de edición con datos actuales
    setEditForm({
      nombre:            detCliente?.nombre            || "",
      movil:             detCliente?.movil             || "",
      telefono:          detCliente?.telefono          || "",
      correo:            detCliente?.correo            || "",
      cedula:            detCliente?.cedula            || "",
      direccion_principal: detCliente?.direccion_principal || "",
    });

    const facts = invRes?.facturas || (Array.isArray(invRes) ? invRes : []);
    setFacturas(facts);

    const pend = facts.find(f => !ESTADOS_IGNORAR.includes(f.estado));
    const pasarelaDefault = (PASARELAS[cli.empresa] || PASARELAS.americanet)[0];
    if (pend) {
      setFormPago(p => ({
        ...p, pasarela: pasarelaDefault,
        idfactura: String(pend.idfactura || pend.id || ""),
        monto: String(parseFloat(pend.total || pend.monto || 0).toFixed(2)),
      }));
    } else {
      setFormPago(p => ({ ...p, pasarela: pasarelaDefault }));
    }

    const pppuser = detRes?.datos?.[0]?.servicios?.[0]?.pppuser || detRes?.clientes?.[0]?.servicios?.[0]?.pppuser || "";
    if (pppuser) {
      const { data: snRows } = await supabase
        .from("clientes").select("sn_onu, nodo").eq("usuario_nodo", pppuser).limit(1);
      if (snRows?.[0]?.sn_onu) setSnOnu(snRows[0].sn_onu);
      if (snRows?.[0]?.nodo)   setNodoReal(snRows[0].nodo);
    }
  }

  // ── Buscar cliente por teléfono ───────────────────────────────────────────
  async function buscarCliente(phone) {
    setLoading(true);
    setError(null);
    resetEstado();

    try {
      const raw = phone.replace(/[^\d]/g, "");
      const local = raw.slice(-9);

      if (local.length < 7) {
        setError("Número de teléfono no disponible para este contacto");
        setLoading(false);
        return;
      }

      const buscar = async (t) => {
        const { data } = await supabase
          .from("mikrowisp_clientes")
          .select("mikrowisp_id,cedula,nombre,telefonos,nodo,estado")
          .ilike("telefonos", `%${t}%`);
        return data || [];
      };

      let rows = await buscar("51" + local);
      if (!rows.length) rows = await buscar(local);
      if (!rows.length && raw.length >= 11) rows = await buscar(raw);

      if (!rows.length) { setError("Cliente no encontrado para este número"); setLoading(false); return; }

      const row = rows.find(r => r.estado === "ACTIVO") || rows[0];
      await cargarDesdeRow(row);
    } catch(e) {
      setError("Error al cargar datos: " + e.message);
    }
    setLoading(false);
  }

  // ── Analizar comprobante con Vision ───────────────────────────────────────
  async function analizarImagen(file) {
    setAnalizando(true);
    setAnalisis(null);
    try {
      const b64 = await toBase64(file);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + OAI_KEY },
        body: JSON.stringify({
          model: "gpt-4o", max_tokens: 400,
          messages: [{ role: "user", content: [
            { type: "text", text: "Analiza esta imagen y responde SOLO con JSON sin markdown. Campos: es_comprobante (boolean), beneficiario (string), banco (string), monto (number), fecha (string DD/MM/YYYY), referencia (string)." },
            { type: "image_url", image_url: { url: b64, detail: "high" } }
          ]}]
        })
      });
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setAnalisis(parsed);
      if (parsed.monto) setFormPago(p => ({ ...p, monto: String(parseFloat(parsed.monto).toFixed(2)) }));
      if (parsed.banco) {
        const b = parsed.banco.toLowerCase();
        const opciones = PASARELAS[cliente?.empresa] || PASARELAS.americanet;
        // Buscar la opción más cercana al banco detectado por IA
        const match = opciones.find(o => o.toLowerCase().split(" ").some(w => b.includes(w) && w.length > 3))
          || (b.includes("deposit") || b.includes("banco") ? opciones.find(o => o.toLowerCase().includes("dep") || o.toLowerCase().includes("banc")) : null)
          || (b.includes("transfer") ? opciones.find(o => o.toLowerCase().includes("transfer")) : null)
          || opciones[0];
        setFormPago(p => ({ ...p, pasarela: match }));
      }
    } catch(e) {
      notify("Error analizando imagen: " + e.message, false);
    }
    setAnalizando(false);
  }

  function toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function onFileChange(e) {
    onImageFile(e.target.files?.[0]);
  }

  // Cerrar menú de acciones al hacer click fuera
  useEffect(() => {
    if (!menuAbierto) return;
    const close = () => setMenuAbierto(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuAbierto]);

  function onImageFile(file) {
    if (!file) return;
    setImgFile(file);
    setImgPrev(URL.createObjectURL(file));
    analizarImagen(file);
  }

  // Ctrl+V para pegar captura de pantalla
  useEffect(() => {
    function onPaste(e) {
      if (tab !== "pago") return;
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) { onImageFile(file); break; }
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [tab]);

  // ── Registrar pago ────────────────────────────────────────────────────────
  async function registrarPago() {
    if (!cliente || !formPago.idfactura || !formPago.monto) {
      return notify("Completa todos los campos", false);
    }
    setPagando(true);
    try {
      const tkn = getToken(cliente.empresa, agente);
      const res = await mkwProxy(Number(cliente.nodo), "PaidInvoice", {
        idcliente: parseInt(cliente.mikrowisp_id, 10),
        idfactura: parseInt(formPago.idfactura, 10),
        pasarela:  formPago.pasarela,
        cantidad:  parseFloat(formPago.monto),
      }, tkn);
      const estado = (res?.estado || res?.result || res?.status || "").toLowerCase();
      const msgRes = (res?.message || res?.mensaje || "").toLowerCase();
      const esError = estado === "error" || estado === "failed" || msgRes.includes("error") || msgRes.includes("no existe") || msgRes.includes("menor al total");

      if (esError) { notify("Mikrowisp rechazó el pago: " + (res?.message || res?.mensaje || estado), false); setPagando(false); return; }

      notify("✅ Pago registrado correctamente");

      // Enviar confirmación al cliente en Chatwoot
      if (convId) {
        const nombre   = cliente.nombre || "Cliente";
        const cedula   = cliente.cedula ? `\n🪪 DNI ${cliente.cedula}` : "";
        const montoStr = Number(formPago.monto).toFixed(2);
        const banco    = formPago.pasarela;
        const fecha    = analisis?.fecha || new Date().toLocaleDateString("es-PE");
        const ref      = analisis?.referencia ? `    Op. ${analisis.referencia}` : "";
        const texto    = `✅ *PAGO CONFIRMADO*\n\n👤 ${nombre}${cedula}\n\n💳 ${banco}          S/ ${montoStr}\n📅 ${fecha}${ref}\n\n⏱ Tu factura se actualizará en los próximos 5 minutos.\n¿Consultas? Escríbenos, un asesor te atenderá. 🙏`;
        await fetch(`${CW_BASE}/api/v1/accounts/${acctId}/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api_access_token": CW_TOKEN },
          body: JSON.stringify({ content: texto, message_type: "outgoing", private: false }),
        }).catch(() => {});
      }

      // Recargar facturas
      await buscarCliente(contact?.phone_number || "");
      setTab("info");
    } catch(e) {
      notify("Error: " + e.message, false);
    }
    setPagando(false);
  }

  // ── Crear factura ─────────────────────────────────────────────────────────
  async function crearFactura() {
    if (!cliente || !factForm.vencimiento) return notify("Selecciona la fecha de vencimiento", false);
    setCreando(true);
    try {
      const tkn = getToken(cliente.empresa, agente);
      const res = await mkwProxy(Number(cliente.nodo), "CreateInvoice", {
        idcliente:  parseInt(cliente.mikrowisp_id, 10),
        vencimiento: factForm.vencimiento,
      }, tkn);
      const ok = (res?.estado || "").toLowerCase() === "exito";
      if (!ok) { notify("Error: " + (res?.mensaje || res?.message || "Rechazado"), false); setCreando(false); return; }
      notify(`✅ Factura #${res.idfactura} creada correctamente`);
      setFactForm({ vencimiento: "" });
      await buscarCliente(contact?.phone_number || "");
    } catch(e) { notify("Error: " + e.message, false); }
    setCreando(false);
  }

  // ── Actualizar datos del cliente ─────────────────────────────────────────
  async function actualizarCliente() {
    if (!cliente) return;
    setGuardando(true);
    try {
      const tkn = getToken(cliente.empresa, agente);
      // Solo enviar campos que tienen valor
      const datos = {};
      if (editForm.nombre)            datos.nombre            = editForm.nombre.trim();
      if (editForm.movil)             datos.movil             = editForm.movil.trim();
      if (editForm.telefono)          datos.telefono          = editForm.telefono.trim();
      if (editForm.correo)            datos.correo            = editForm.correo.trim();
      if (editForm.cedula)            datos.cedula            = editForm.cedula.trim();
      if (editForm.direccion_principal) datos.direccion_principal = editForm.direccion_principal.trim();
      if (!Object.keys(datos).length) { notify("No hay cambios que guardar", false); setGuardando(false); return; }
      const res = await mkwProxy(Number(cliente.nodo), "UpdateUser", { idcliente: parseInt(cliente.mikrowisp_id, 10), datos }, tkn);
      const ok  = (res?.estado || "").toLowerCase() === "exito";
      if (!ok) { notify("Error: " + (res?.mensaje || res?.message || JSON.stringify(res)), false); }
      else { notify("✅ Datos actualizados correctamente"); await buscarCliente(contact?.phone_number || ""); setTab("info"); }
    } catch(e) { notify("Error: " + e.message, false); }
    setGuardando(false);
  }

  // ── Activar servicio (cliente suspendido/cortado) ─────────────────────────
  async function activarServicio() {
    if (!window.confirm(`¿Activar el servicio de ${cliente.nombre}?\nEl cliente pasará a estado ACTIVO.`)) return;
    setActivando(true);
    try {
      const tkn = getToken(cliente.empresa, agente);
      const res = await mkwProxy(Number(cliente.nodo), "ActiveService", { idcliente: parseInt(cliente.mikrowisp_id, 10) }, tkn);
      const ok  = (res?.estado || "").toLowerCase() === "exito";
      if (!ok) { notify("Error: " + (res?.mensaje || res?.message || JSON.stringify(res)), false); }
      else { notify("✅ Servicio activado correctamente"); await buscarCliente(contact?.phone_number || ""); }
    } catch(e) { notify("Error: " + e.message, false); }
    setActivando(false);
  }

  // ── Eliminar factura ─────────────────────────────────────────────────────
  async function eliminarFactura(fid) {
    if (!window.confirm(`¿Eliminar factura #${fid}?\nEsta acción no se puede deshacer.`)) return;
    setDeletingFact(fid);
    try {
      const tkn = getToken(cliente.empresa, agente);
      const res = await mkwProxy(Number(cliente.nodo), "DeleteInvoice", { idfactura: parseInt(fid, 10) }, tkn);
      const ok  = (res?.estado || "").toLowerCase() === "exito";
      if (!ok) { notify("Error: " + (res?.mensaje || res?.message || JSON.stringify(res)), false); }
      else { notify("✅ Factura #" + fid + " eliminada"); setFactExpand(null); await buscarCliente(contact?.phone_number || ""); }
    } catch(e) { notify("Error: " + e.message, false); }
    setDeletingFact(null);
  }

  // ── Eliminar pago ─────────────────────────────────────────────────────────
  async function eliminarPago(fid) {
    if (!window.confirm(`¿Eliminar el pago de la factura #${fid}?\nEsta acción no se puede deshacer.`)) return;
    setDeletingPago(fid);
    try {
      const tkn = getToken(cliente.empresa, agente);
      const res = await mkwProxy(Number(cliente.nodo), "DeleteTransaccion", { factura: parseInt(fid, 10) }, tkn);
      const ok  = (res?.estado || "").toLowerCase() === "exito";
      if (!ok) { notify("Error: " + (res?.mensaje || res?.message || JSON.stringify(res)), false); }
      else { notify("✅ Pago de factura #" + fid + " eliminado"); await buscarCliente(contact?.phone_number || ""); }
    } catch(e) { notify("Error: " + e.message, false); }
    setDeletingPago(null);
  }

  // ── Búsqueda flexible por DNI o nombre ──────────────────────────────────
  async function buscarPorDni() {
    const q = dniBusq.trim();
    if (q.length < 2) return notify("Ingresa DNI o nombre", false);
    setDniBuscando(true);
    setDniResultados([]);
    setDniSel(null);
    try {
      let qBuilder = supabase
        .from("mikrowisp_clientes")
        .select("mikrowisp_id,cedula,nombre,telefonos,nodo,estado")
        .limit(6);

      const isNumeric = /^\d+$/.test(q);
      if (isNumeric) {
        qBuilder = qBuilder.ilike("cedula", `%${q}%`);
      } else {
        // Buscar por cada palabra del nombre (en cualquier orden)
        const palabras = q.split(/\s+/).filter(p => p.length > 1);
        for (const p of palabras) qBuilder = qBuilder.ilike("nombre", `%${p}%`);
      }

      const { data } = await qBuilder;
      if (!data?.length) notify("No se encontró cliente", false);
      else setDniResultados(data);
    } catch(e) { notify("Error: " + e.message, false); }
    setDniBuscando(false);
  }

  async function verInfoCliente(row) {
    setError(null);
    setDniResultados([]);
    setDniSel(null);
    setDniBusq("");
    setLoading(true);
    try { await cargarDesdeRow(row); }
    catch(e) { setError("Error al cargar: " + e.message); }
    setLoading(false);
  }

  async function agregarTelefono() {
    if (!dniSel || !contact?.phone_number) return;
    setAgregando(true);
    try {
      const rawPhone = contact.phone_number.replace(/[^\d]/g, "");
      const telActual = dniSel.telefonos || "";
      if (telActual.includes(rawPhone)) {
        notify("Este número ya está registrado en el cliente", false);
        setAgregando(false); return;
      }
      const nuevoTel = telActual && telActual !== "EMPTY" ? `${telActual},${rawPhone}` : rawPhone;
      const { error: updErr } = await supabase
        .from("mikrowisp_clientes")
        .update({ telefonos: nuevoTel })
        .eq("mikrowisp_id", dniSel.mikrowisp_id);
      if (updErr) throw updErr;
      notify("✅ Número agregado");
      await verInfoCliente({ ...dniSel, telefonos: nuevoTel });
    } catch(e) { notify("Error al guardar: " + e.message, false); }
    setAgregando(false);
  }

  // ── Diagnóstico MikroTik ──────────────────────────────────────────────────
  async function consultarDiagnostico() {
    if (!cliente) return;
    setDiagLoad(true);
    setDiagError(null);
    setDiagResult(null);
    setShowDiag(true);
    try {
      const nodoNum = Number(cliente.nodo);
      // Usar nodo de tabla clientes (Nod_01, Nod_03...) si está disponible,
      // ya que el ID de Mikrowisp no coincide con la clave del router de diagnóstico
      const nodoStr = nodoReal || `Nod_${String(nodoNum).padStart(2,"0")}`;
      const pppuser = detalle?._servicio?.pppuser || svc?.pppuser || "";
      const res = await fetch(`${DIAGNO_BASE}/api/diagnostico-servicio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dni:      cliente.cedula || "",
          cliente:  cliente.nombre || "",
          nodo:     nodoStr,
          userPppoe: pppuser,
        }),
      });
      const json = await res.json().catch(()=>({}));
      if (json?.ok !== true) throw new Error(json?.error || "Sin respuesta del servidor de diagnóstico");
      setDiagResult(json);
    } catch(e) {
      setDiagError(e.message);
    }
    setDiagLoad(false);
  }

  function diagColor(estado) {
    const s = (estado||"").toLowerCase();
    if (s === "connected" || s === "conectado") return T.green;
    if (s === "disconnected" || s === "not-found" || s === "no-conectado" || s === "no-encontrado") return T.red;
    return T.amber;
  }

  // ── Consultar señal ONU ───────────────────────────────────────────────────
  async function consultarSenal() {
    if (!snOnu) return notify("No se encontró SN de ONU para este cliente", false);
    setSenalLoad(true);
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "SmartOltSignal", sn: snOnu }),
      });
      const json = await res.json();
      const base = json?.data;
      const fullStatus = base?.full_status_json || base?.response?.full_status_json || base?.response || base;
      const rx    = fullStatus?.["Optical status"]?.["Rx optical power(dBm)"]          || fullStatus?.["Rx optical power(dBm)"]          || "—";
      const oltRx = fullStatus?.["Optical status"]?.["OLT Rx ONT optical power(dBm)"]  || fullStatus?.["OLT Rx ONT optical power(dBm)"]  || "—";
      const estado = String(base?.response_code || fullStatus?.onu_status || fullStatus?.status || "—");
      setSenal({ rx: String(rx), oltRx: String(oltRx), estado, ts: new Date().toLocaleTimeString() });
    } catch(e) {
      notify("Error consultando señal: " + e.message, false);
    }
    setSenalLoad(false);
  }

  function senalColor(dbm) {
    const v = parseFloat(dbm);
    if (isNaN(v)) return "#94a3b8";
    if (v >= -24) return "#16a34a";
    if (v >= -27) return "#f59e0b";
    return "#dc2626";
  }

  function senalLabel(dbm) {
    const v = parseFloat(dbm);
    if (isNaN(v)) return "Sin datos";
    if (v >= -24) return "Excelente";
    if (v >= -27) return "Regular";
    return "Baja";
  }

  // ── Consultar elegibilidad prórroga ──────────────────────────────────────
  async function consultarProrroga() {
    if (!cliente) return;
    setProrrando(true);
    try {
      const factPendiente = facturas.find(f => !ESTADOS_IGNORAR.includes(f.estado));
      if (!factPendiente) { notify("No hay facturas pendientes para dar prórroga", false); setProrrando(false); return; }
      const venc  = new Date(factPendiente.vencimiento + "T00:00:00");
      const corte = new Date(venc); corte.setDate(corte.getDate() + 10);
      const max   = new Date(corte); max.setDate(max.getDate() + 10);
      const suspendido = ["SUSPENDIDO","CORTADO"].includes((detalle?.estado || "").toUpperCase());
      const diasMax = suspendido ? 3 : 10;
      const fechaMaxStr = new Date(corte.getTime() + diasMax * 86400000).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
      setProrrInfo({ idfactura: factPendiente.idfactura || factPendiente.id, vencimiento: factPendiente.vencimiento, corte: corte.toISOString(), max: max.toISOString(), diasMax, suspendido, fechaMaxStr });
    } catch(e) { notify("Error: " + e.message, false); }
    setProrrando(false);
  }

  async function registrarProrroga() {
    if (!cliente || !prorrInfo || !prorrForm.fecha) return notify("Selecciona la fecha de prórroga", false);
    setProrrando(true);
    try {
      const fechaStr = prorrForm.fecha;
      const corte    = new Date(prorrInfo.corte);
      const selected = new Date(fechaStr + "T00:00:00");
      const diffDias = Math.round((selected - corte) / 86400000);
      if (diffDias < 1 || diffDias > prorrInfo.diasMax) {
        notify(`Fecha fuera del rango permitido (máx. ${prorrInfo.diasMax} días)`, false);
        setProrrando(false); return;
      }
      const tkn = getToken(cliente.empresa, agente);
      const res = await mkwProxy(Number(cliente.nodo), "PromesaPago", {
        idcliente: parseInt(cliente.mikrowisp_id, 10),
        idfactura: parseInt(prorrInfo.idfactura, 10),
        fecha: fechaStr,
      });
      const ok = (res?.estado || res?.result || res?.status || "").toLowerCase() !== "error";
      if (!ok) { notify("Mikrowisp rechazó la prórroga: " + (res?.message || res?.mensaje || ""), false); setProrrando(false); return; }
      notify(`✅ Prórroga registrada hasta ${fechaStr}`);
      if (convId) {
        const texto = `⏳ *PRÓRROGA REGISTRADA*\n\nTu pago ha sido programado hasta el ${fechaStr}.\nRecuerda realizar el pago antes de esa fecha para evitar la suspensión del servicio. 🙏`;
        await fetch(`${CW_BASE}/api/v1/accounts/${acctId}/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api_access_token": CW_TOKEN },
          body: JSON.stringify({ content: texto, message_type: "outgoing", private: false }),
        }).catch(() => {});
      }
      setProrrInfo(null);
      setProrrForm({ fecha: "" });
      setTab("info");
    } catch(e) { notify("Error: " + e.message, false); }
    setProrrando(false);
  }

  // ── Cargar técnicos activos desde Supabase ───────────────────────────────
  useEffect(() => {
    supabase.from("usuarios").select("nombre,empresa").eq("rol","Tecnico").eq("activo",true).order("nombre")
      .then(({ data }) => { if (data?.length) setTecnicosLista(data); });
  }, []);

  // ── Pre-llenar coordenadas del servicio cuando cambia el cliente ─────────
  useEffect(() => {
    if (svc?.coordenadas) setOrdenForm(p => ({ ...p, coordenadas: svc.coordenadas }));
  }, [svc?.coordenadas]);

  // ── Crear orden desde sidebar ─────────────────────────────────────────────
  async function crearOrden() {
    if (!ordenForm.tipoActuacion || !ordenForm.tecnico.trim()) return notify("Selecciona tipo de actuación y técnico", false);
    setCreandoOrden(true);
    try {
      let codigo = "";
      const { data: codigoData } = await supabase.rpc("generar_codigo_orden");
      if (codigoData) {
        codigo = String(codigoData);
      } else {
        codigo = `ORD-${String(Date.now()).slice(-4)}-${new Date().getFullYear()}`;
      }

      const empresaOrden = cliente.empresa === "dimfiber" ? "DIM" : "Americanet";
      const payload = {
        empresa:        empresaOrden,
        codigo,
        generar_usuario: "NO",
        orden_tipo:     "ORDEN DE SERVICIO",
        tipo_actuacion: ordenForm.tipoActuacion,
        fecha_actuacion: ordenForm.fechaActuacion,
        estado:         "Pendiente",
        prioridad:      "Normal",
        dni:            cliente.cedula || "",
        nombre:         cliente.nombre || "",
        direccion:      detalle?.direccion_principal || "",
        celular:        detalle?.movil || (contact?.phone_number || "").replace(/[^\d]/g,"") || "",
        email:          detalle?.correo || "",
        nodo:           String(cliente.nodo),
        usuario_nodo:   svc?.pppuser || "",
        sn_onu:         snOnu || "",
        ubicacion:      ordenForm.coordenadas || "",
        descripcion:    ordenForm.descripcion || "",
        solicitar_pago: "NO",
        monto_cobrar:   0,
        autor_orden:    agente,
        tecnico:        ordenForm.tecnico,
        fecha_creacion: new Date().toISOString(),
      };

      let res = await supabase.from("ordenes").insert([payload]).select("id,codigo").single();
      if (res.error?.code === "23505") {
        const { data: newCod } = await supabase.rpc("generar_codigo_orden");
        if (newCod) { payload.codigo = String(newCod); res = await supabase.from("ordenes").insert([payload]).select("id,codigo").single(); }
      }
      if (res.error) throw res.error;

      const codigoFinal = res.data?.codigo || codigo;
      setOrdenCreada({ id: res.data?.id, codigo: codigoFinal });
      notify(`✅ Orden ${codigoFinal} creada`);

      if (convId) {
        const texto = `📋 *ORDEN CREADA*\n\nCódigo: *${codigoFinal}*\nTipo: ${ordenForm.tipoActuacion}\nTécnico: ${ordenForm.tecnico}${ordenForm.descripcion ? `\nDetalle: ${ordenForm.descripcion}` : ""}`;
        await fetch(`${CW_BASE}/api/v1/accounts/${acctId}/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api_access_token": CW_TOKEN },
          body: JSON.stringify({ content: texto, message_type: "outgoing", private: true }),
        }).catch(() => {});
      }
    } catch(e) {
      notify("Error al crear orden: " + e.message, false);
    }
    setCreandoOrden(false);
  }

  // ── Helpers de display ────────────────────────────────────────────────────
  const primerNombre = (n) => {
    if (!n) return "";
    const raw = n.includes(",") ? n.split(",")[1].trim().split(" ")[0] : n.split(" ")[0];
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  };

  const estadoColor = (e) => {
    const s = (e || "").toUpperCase();
    return s === "ACTIVO" ? "#16a34a" : s === "SUSPENDIDO" ? "#d97706" : s === "CORTADO" ? "#dc2626" : "#64748b";
  };

  const factPend = facturas.filter(f => !ESTADOS_IGNORAR.includes(f.estado));
  const factRecientes = [...facturas].slice(0, 5);
  const estadoServicio = (detalle?.estado || cliente?.estado || "").toUpperCase();
  const suspendido = estadoServicio === "SUSPENDIDO" || estadoServicio === "CORTADO";

  const svc = detalle?._servicio;
  const isOnline = svc?.status_user === "ONLINE";

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={S.root} className="sb-panel">
      <style>{globalCSS}</style>

      {/* ── Splash selección de agente (obligatorio) ── */}
      {!agente && <SplashAgente onSelect={nombre => {
        setAgente(nombre);
        setStoredAgente(nombre);
      }} />}

      {/* ── Splashes ── */}
      {agente && !contact && <Splash loading={false} />}
      {agente && contact && loading && <Splash loading={true} />}

      {/* ── Debug overlay ── */}
      {!contact && isDebug && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(0,0,0,0.85)", color:"#0f0", fontFamily:"monospace", fontSize:10, padding:10, zIndex:9999, maxHeight:200, overflowY:"auto" }}>
          <div style={{ color:"#ff0", marginBottom:4 }}>DEBUG — mensajes recibidos:</div>
          {debugMsgs.length === 0 && <div style={{ color:"#888" }}>Ningún mensaje aún. Esperando postMessage...</div>}
          {debugMsgs.map((m,i) => <div key={i} style={{ marginBottom:3, wordBreak:"break-all" }}><span style={{ color:"#888" }}>[{m.origin}]</span> {m.data}</div>)}
        </div>
      )}

      {/* ── Contenido ── */}
      {(!contact || loading) ? null : (
      <div style={{ padding:"0 0 4px" }}>

      {/* ══ TOPBAR minimalista ══ */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderBottom:`1px solid ${T.border}`, background:T.card }}>
        <img src={logoAmericanet} alt="Americanet" style={{ height:16, filter:"brightness(0) saturate(0) brightness(0.35)", opacity:0.5 }} />
        <span style={{ fontSize:11, color:T.muted, fontWeight:600, letterSpacing:"0.2px" }}>Panel de Agentes</span>
        <div style={{ flex:1 }} />
        {agente && (
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ background:T.accent, color:T.blue, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600, border:`1px solid ${T.border}` }}>
              {agente}
            </span>
            <button onClick={() => { setAgente(""); clearStoredAgente(); }}
              style={{ ...S.btnOut, fontSize:10, padding:"2px 7px" }}>
              Cambiar
            </button>
          </div>
        )}
      </div>

      {/* ── Notificación flotante ── */}
      {msg && (
        <div style={{ background:msg.ok ? T.greenLt : T.redLt, color:msg.ok ? T.green : T.red,
          border:`1px solid ${msg.ok?"#86efac":"#fca5a5"}`, borderRadius:0,
          padding:"8px 12px", fontSize:12, fontWeight:600, borderLeft:`3px solid ${msg.ok?T.green:T.red}` }}>
          {msg.text}
        </div>
      )}

      {/* ── Error + búsqueda flexible ── */}
      {error && !cliente && (
        <div style={{ margin:"8px", ...S.card, padding:"14px 16px" }}>
          <div style={{ fontWeight:700, color:T.red, fontSize:13, marginBottom:3 }}>Cliente no encontrado</div>
          <div style={{ fontSize:11, color:T.muted, marginBottom:12 }}>
            Número <strong>{contact?.phone_number}</strong> no está registrado en Mikrowisp.
          </div>
          <div style={{ fontWeight:600, fontSize:12, color:T.navy, marginBottom:6 }}>Buscar por DNI o nombre</div>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <input style={{ ...S.input, flex:1 }} type="text"
              placeholder="DNI o nombre (parcial)" value={dniBusq}
              onChange={e => { setDniBusq(e.target.value); setDniResultados([]); setDniSel(null); }}
              onKeyDown={e => e.key === "Enter" && buscarPorDni()} />
            <button onClick={buscarPorDni} disabled={dniBuscando}
              style={{ ...S.btnSm(T.blue), padding:"8px 14px", opacity:dniBuscando?0.6:1 }}>
              {dniBuscando ? "..." : "Buscar"}
            </button>
          </div>
          {dniResultados.length > 0 && (
            <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:"hidden", marginBottom:8 }}>
              {dniResultados.map((row, idx) => {
                const sel = dniSel?.mikrowisp_id === row.mikrowisp_id;
                return (
                  <div key={row.mikrowisp_id} onClick={() => setDniSel(sel ? null : row)}
                    style={{ background: sel ? T.accent : idx % 2 === 0 ? "#fff" : T.bg,
                      borderBottom: idx < dniResultados.length - 1 ? `1px solid ${T.border}` : "none",
                      padding:"8px 12px", cursor:"pointer",
                      borderLeft: sel ? `3px solid ${T.blue}` : "3px solid transparent" }}>
                    <div style={{ fontWeight:600, fontSize:12, color:T.navy }}>{row.nombre}</div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>
                      DNI {row.cedula} · #{row.mikrowisp_id} · Nodo {row.nodo} · <span style={{ color: row.estado==="ACTIVO"?T.green:T.red }}>{row.estado}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {dniSel && (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <button onClick={() => verInfoCliente(dniSel)} className="sb-btn-action"
                style={{ ...S.btn(T.blue) }}>Ver información del cliente</button>
              {contact?.phone_number && (
                <button onClick={agregarTelefono} disabled={agregando} className="sb-btn-action"
                  style={{ ...S.btn(T.green), opacity:agregando?0.6:1 }}>
                  {agregando ? "Guardando..." : `Agregar ${contact.phone_number} a este cliente`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Cliente cargado ── */}
      {cliente && !loading && (<>

        {/* ══ HEADER CLIENTE — fondo azul oscuro ══ */}
        <div style={{ background:T.blue, padding:"14px 14px 12px", position:"relative" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:15, color:"#fff", lineHeight:1.2, wordBreak:"break-word", letterSpacing:"-0.2px" }}>
                {cliente.nombre}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:5, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.65)" }}>#{cliente.mikrowisp_id}</span>
                <span style={{ background:
                  estadoServicio === "ACTIVO" ? T.green :
                  estadoServicio === "SUSPENDIDO" ? "#d97706" : T.red,
                  color:"#fff", borderRadius:3, padding:"2px 8px", fontSize:11, fontWeight:700 }}>
                  {estadoServicio || "ACTIVO"}
                </span>
                {svc && (
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ position:"relative", width:7, height:7, display:"inline-block" }}>
                      <span style={{ position:"absolute", inset:0, borderRadius:"50%", background:isOnline?"#4ade80":"rgba(255,255,255,0.4)" }} />
                      {isOnline && <span className="sb-pulse" style={{ position:"absolute", inset:0, borderRadius:"50%", background:"#4ade80" }} />}
                    </span>
                    <span style={{ fontSize:11, color:"rgba(255,255,255,0.65)" }}>{isOnline?"Online":"Offline"}</span>
                  </span>
                )}
              </div>
              <div style={{ display:"flex", gap:12, marginTop:6, flexWrap:"wrap" }}>
                <span style={{ fontSize:11, color:"rgba(255,255,255,0.55)" }}>Nodo <strong style={{ color:"rgba(255,255,255,0.9)" }}>{cliente.nodo}</strong></span>
                <span style={{ fontSize:11, color:"rgba(255,255,255,0.55)" }}>
                  <strong style={{ color:"rgba(255,255,255,0.9)", textTransform:"capitalize" }}>
                    {cliente.empresa === "dimfiber" ? "DimFiber" : "Americanet"}
                  </strong>
                </span>
                {cliente.cedula && <span style={{ fontSize:11, color:"rgba(255,255,255,0.55)" }}>DNI <strong style={{ color:"rgba(255,255,255,0.9)" }}>{cliente.cedula}</strong></span>}
              </div>
            </div>
            <button onClick={() => buscarCliente(contact?.phone_number || "")}
              style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.25)",
                borderRadius:4, padding:"5px 9px", cursor:"pointer", color:"#fff", fontSize:13, flexShrink:0 }}
              title="Recargar"><RefreshCw size={13} /></button>
          </div>
        </div>

        {/* ══ SERVICIO DE INTERNET ══ */}
        {svc && (
          <div style={{ background:T.bg, borderBottom:`1px solid ${T.border}`, padding:"10px 14px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:T.navy, textTransform:"uppercase", letterSpacing:"0.4px" }}>Servicio de internet</span>
              {svc.coordenadas && (() => {
                const [lat, lng] = svc.coordenadas.split(",").map(Number);
                if (!lat||!lng) return null;
                return (
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <button onClick={() => setShowMap(m => !m)}
                      style={{ ...S.btnOut, fontSize:10, padding:"2px 8px", color:T.blue, borderColor:T.border }}>
                      {showMap ? "Ocultar mapa" : "Ver mapa"}
                    </button>
                    <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
                      style={{ color:T.blue, fontSize:11, textDecoration:"none", fontWeight:600 }}>G↗</a>
                  </div>
                );
              })()}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"8px 16px" }}>
              {svc.perfil  && (
                <div>
                  <div style={S.label}>Plan</div>
                  <div style={{ fontWeight:700, fontSize:12, color:T.blue }}>{svc.perfil}</div>
                </div>
              )}
              {svc.ip && (
                <div>
                  <div style={S.label}>IP activa</div>
                  <div style={{ fontFamily:"monospace", fontWeight:700, color:T.navy, fontSize:12 }}>{svc.ip}</div>
                </div>
              )}
              {svc.pppuser && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <div style={S.label}>PPPoE</div>
                  <div style={{ fontFamily:"monospace", fontWeight:600, color:T.navy, fontSize:11 }}>{svc.pppuser}</div>
                </div>
              )}
              {svc.mac && (
                <div>
                  <div style={S.label}>MAC</div>
                  <div style={{ fontFamily:"monospace", fontWeight:600, color:T.navy, fontSize:10 }}>{svc.mac}</div>
                </div>
              )}
            </div>

            {/* Diagnóstico MikroTik */}
            <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: showDiag ? 8 : 0 }}>
                <span style={{ fontSize:11, fontWeight:600, color:T.muted }}>Diagnóstico MikroTik</span>
                <button onClick={consultarDiagnostico} disabled={diagLoad} className="sb-btn-action"
                  style={{ ...S.btnSm("#ea580c"), opacity:diagLoad?0.6:1, fontSize:10 }}>
                  {diagLoad ? "Consultando..." : "Diagnosticar"}
                </button>
              </div>
              {showDiag && !diagLoad && diagError && (
                <div style={{ background:T.redLt, border:`1px solid #fecaca`, borderRadius:5, padding:"8px 10px", fontSize:11, color:T.red }}>
                  {diagError}
                </div>
              )}
              {showDiag && !diagLoad && diagResult && (() => {
                const mk = diagResult.mikrotik || {};
                const c = diagColor(mk.estado);
                const isConn = ["connected","conectado"].includes((mk.estado||"").toLowerCase());
                return (
                  <div style={{ background: isConn ? T.greenLt : T.redLt, border:`1px solid ${c}40`, borderRadius:5, padding:"10px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                      <div style={{ position:"relative", width:9, height:9, flexShrink:0 }}>
                        <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:c }} />
                        {isConn && <div className="sb-pulse" style={{ position:"absolute", inset:0, borderRadius:"50%", background:c }} />}
                      </div>
                      <div style={{ fontWeight:700, fontSize:12, color:c }}>{isConn ? "Conectado" : "Desconectado"}</div>
                      <span style={{ fontSize:10, color:T.muted, marginLeft:"auto" }}>{mk.origen||"MikroTik"}</span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 14px" }}>
                      {[
                        ["IP", mk.ip], ["Uptime", mk.uptime], ["Router", mk.router?.nombre],
                        ["Profile", mk.profile], ["Caller-ID", mk.callerId], ["Último logout", mk.lastLoggedOut],
                      ].filter(([,v]) => v).map(([lbl, val]) => (
                        <div key={lbl}>
                          <div style={S.label}>{lbl}</div>
                          <div style={{ fontWeight:600, fontSize:11, color:T.navy }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {mk.disabled && <div style={{ marginTop:6, background:"#fef3c7", borderRadius:4, padding:"4px 8px", fontSize:11, color:"#92400e", fontWeight:600 }}>
                      Usuario deshabilitado en MikroTik
                    </div>}
                  </div>
                );
              })()}
            </div>

            {/* Mapa */}
            {showMap && svc.coordenadas && (() => {
              const [lat, lng] = svc.coordenadas.split(",").map(Number);
              const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.003},${lat-0.003},${lng+0.003},${lat+0.003}&layer=mapnik&marker=${lat},${lng}`;
              return <iframe src={mapUrl} title="Ubicación" style={{ width:"100%", height:160, borderRadius:5, border:`1px solid ${T.border}`, marginTop:8 }} loading="lazy" />;
            })()}

            {/* Señal ONU */}
            {snOnu && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:T.muted }}>
                    Señal ONU · <span style={{ fontFamily:"monospace", fontSize:10 }}>{snOnu}</span>
                  </span>
                  <button onClick={consultarSenal} disabled={senalLoad} className="sb-btn-action"
                    style={{ ...S.btnSm(senalLoad?T.muted:T.blue), opacity:senalLoad?0.6:1, fontSize:10 }}>
                    {senalLoad ? "Leyendo..." : "Consultar señal"}
                  </button>
                </div>
                {senal && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                    {[["Rx ONU", senal.rx],["Rx OLT", senal.oltRx]].map(([lbl,val]) => {
                      const c = senalColor(val);
                      const pct = Math.min(100, Math.max(0, ((parseFloat(val)||0)+35)/15*100));
                      return (
                        <div key={lbl} style={{ background:"#fff", borderRadius:5, padding:"8px 10px", border:`1px solid ${T.border}` }}>
                          <div style={S.label}>{lbl}</div>
                          <div style={{ fontWeight:700, fontSize:16, color:c, lineHeight:1 }}>{val} <span style={{ fontSize:10 }}>dBm</span></div>
                          <div style={{ background:T.bg, borderRadius:3, height:4, overflow:"hidden", margin:"5px 0 3px" }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:c, borderRadius:3 }} />
                          </div>
                          <div style={{ fontSize:10, fontWeight:600, color:c }}>{senalLabel(val)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {senal && <div style={{ fontSize:10, color:T.muted, textAlign:"right", marginTop:4 }}>Actualizado {senal.ts}</div>}
              </div>
            )}
          </div>
        )}

        {/* ══ BOTÓN ACTIVAR (solo si suspendido) ══ */}
        {suspendido && (
          <div style={{ padding:"8px 8px 0" }}>
            <button onClick={activarServicio} disabled={activando} className="sb-btn-action"
              style={{ ...S.btn(T.green), display:"flex", alignItems:"center", justifyContent:"center", gap:6, opacity:activando?0.6:1, borderRadius:5 }}>
              <Zap size={14} />{activando ? "Activando..." : "Activar servicio"}
            </button>
          </div>
        )}

        {/* ══ BANNER DEUDA ══ */}
        <div style={{ padding:"8px 8px 0" }}>
          {factPend.length > 0 ? (
            <div style={{ background:"#fffbeb", borderLeft:`3px solid #f59e0b`, borderRadius:5,
              border:`1px solid #fde68a`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px" }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#92400e", textTransform:"uppercase", letterSpacing:"0.3px" }}>Deuda pendiente</div>
                <div style={{ fontWeight:800, fontSize:18, color:T.navy, lineHeight:1.2, marginTop:2 }}>
                  S/ {Number(factPend[0]?.total||factPend[0]?.monto||0).toFixed(2)}
                </div>
                <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>
                  {factPend.length > 1 ? `${factPend.length} facturas pendientes` : `Vence ${factPend[0]?.vencimiento||"—"}`}
                </div>
              </div>
              <button onClick={() => setTab("pago")} className="sb-btn-action"
                style={{ background:T.green, color:"#fff", border:"none", borderRadius:5,
                  padding:"9px 16px", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                PAGAR →
              </button>
            </div>
          ) : (
            <div style={{ background:T.greenLt, borderLeft:`3px solid ${T.green}`, borderRadius:5,
              border:`1px solid #86efac`, display:"flex", alignItems:"center", gap:10, padding:"9px 12px" }}>
              <div style={{ fontWeight:600, color:T.green, fontSize:12 }}>Sin deuda pendiente</div>
              <span style={{ fontSize:11, color:T.muted }}>· Cliente al dia</span>
            </div>
          )}
        </div>

        {/* ══ TABS ══ */}
        <div style={{ background:T.card, marginTop:8, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, display:"flex" }}>
          {[["info","Facturas"],["pago","Pago"],["prorroga","Prorr."],["nueva","Factura"],["editar","Editar"],["orden","Orden"]].map(([t, label]) => (
            <button key={t} className="sb-tab-btn"
              onClick={() => { setTab(t); if (t === "prorroga" && !prorrInfo) consultarProrroga(); if (t === "orden") setOrdenCreada(null); }}
              style={{ flex:1, border:"none",
                borderBottom: tab === t ? `2px solid ${T.blue}` : "2px solid transparent",
                borderTop:"none", borderLeft:"none", borderRight:`1px solid ${T.border}`,
                background: tab === t ? T.accent : T.card,
                color: tab === t ? T.blue : T.muted,
                fontWeight: tab === t ? 700 : 500, fontSize:10,
                padding:"9px 2px", cursor:"pointer", fontFamily:"inherit" }}>
              {label}
            </button>
          ))}
        </div>

        {/* ══ TAB: FACTURAS ══ */}
        {tab === "info" && (
          <div style={{ margin:"8px", ...S.card }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:`1px solid ${T.border}` }}>
              <span style={{ fontWeight:700, fontSize:13, color:T.navy }}>Facturas</span>
              <span style={{ fontSize:11, color:T.muted }}>{factRecientes.length} registros</span>
            </div>
            {factRecientes.length === 0 ? (
              <div style={{ color:T.muted, fontSize:12, textAlign:"center", padding:24 }}>Sin facturas registradas</div>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table className="sb-tbl" style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:"left", padding:"8px 10px" }}>#Factura</th>
                      <th style={{ textAlign:"left", padding:"8px 10px" }}>Estado</th>
                      <th style={{ textAlign:"right", padding:"8px 10px" }}>Total</th>
                      <th style={{ textAlign:"left", padding:"8px 10px" }}>Vence</th>
                      <th style={{ textAlign:"left", padding:"8px 10px" }}>F. Pago</th>
                      <th style={{ textAlign:"left", padding:"8px 10px" }}>Forma</th>
                      <th style={{ textAlign:"center", padding:"8px 10px" }}>Acc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factRecientes.map((f) => {
                      const isPag = ["pagado","PAGADO","paid"].includes(f.estado);
                      const isAnu = ["anulado","ANULADO","cancelled","canceled"].includes(f.estado);
                      const fid   = f.idfactura || f.id;
                      // badge colors: PAGADO=green sólido, PENDIENTE=blue sólido, ANULADO=gris
                      const badgeBg = isPag ? T.green : isAnu ? "#9ca3af" : T.blue;
                      return (
                        <tr key={fid}>
                          <td style={{ fontWeight:600, color:T.blue, fontSize:12 }}>#{fid}</td>
                          <td>
                            <span style={{ background:badgeBg, color:"#fff", borderRadius:3, padding:"2px 7px", fontSize:10, fontWeight:700, display:"inline-block" }}>
                              {isPag ? "PAGADO" : isAnu ? "ANULADO" : "PENDIENTE"}
                            </span>
                          </td>
                          <td style={{ textAlign:"right", fontWeight:700, color:T.navy }}>S/ {Number(f.total||f.monto||0).toFixed(2)}</td>
                          <td style={{ color:T.muted, fontSize:11 }}>{f.vencimiento||"—"}</td>
                          <td style={{ color:T.muted, fontSize:11 }}>{f.fechapago||f.fecha_pago||"—"}</td>
                          <td style={{ color:T.muted, fontSize:11 }}>{f.pasarela||f.forma_pago||"—"}</td>
                          <td style={{ position:"relative" }}>
                            {/* Botón ⋮ */}
                            <button
                              onClick={e => { e.stopPropagation(); setMenuAbierto(menuAbierto === fid ? null : fid); }}
                              style={{ background:"none", border:"1px solid #e5e7eb", borderRadius:5, padding:"4px 9px",
                                cursor:"pointer", color:"#6b7280", fontSize:16, lineHeight:1, fontWeight:700,
                                letterSpacing:"1px", display:"block", margin:"0 auto" }}>
                              ···
                            </button>

                            {/* Dropdown */}
                            {menuAbierto === fid && (
                              <div onClick={e=>e.stopPropagation()}
                                style={{ position:"absolute", right:4, top:"100%", zIndex:999,
                                  background:"#fff", border:"1px solid #e5e7eb", borderRadius:7,
                                  boxShadow:"0 4px 16px rgba(0,0,0,0.12)", minWidth:160, overflow:"hidden" }}>
                                {!isPag && !isAnu && (
                                  <button onClick={() => { setFormPago(p=>({...p,idfactura:String(fid),monto:String(Number(f.total||0).toFixed(2))})); setTab("pago"); setMenuAbierto(null); }}
                                    style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"10px 14px",
                                      border:"none", background:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                                      color:"#003DA5", borderBottom:"1px solid #f3f4f6", fontFamily:"inherit" }}>
                                    <CreditCard size={14}/> Registrar pago
                                  </button>
                                )}
                                {isPag && (
                                  <button onClick={() => { eliminarPago(fid); setMenuAbierto(null); }}
                                    disabled={deletingPago===fid}
                                    style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"10px 14px",
                                      border:"none", background:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                                      color:"#b45309", borderBottom:"1px solid #f3f4f6", fontFamily:"inherit",
                                      opacity:deletingPago===fid?0.5:1 }}>
                                    <XCircle size={14}/> {deletingPago===fid?"Eliminando...":"Anular pago"}
                                  </button>
                                )}
                                <button onClick={() => { eliminarFactura(fid); setMenuAbierto(null); }}
                                  disabled={deletingFact===fid}
                                  style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"10px 14px",
                                    border:"none", background:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                                    color:"#b91c1c", fontFamily:"inherit",
                                    opacity:deletingFact===fid?0.5:1 }}>
                                  <Trash2 size={14}/> {deletingFact===fid?"Eliminando...":"Eliminar factura"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: PAGO ══ */}
        {tab === "pago" && (
          <div style={{ margin:"8px", ...S.card, padding:"14px 16px" }}>
            <div style={{ fontWeight:700, fontSize:13, color:T.navy, marginBottom:12 }}>Registrar pago</div>

            {/* Zona comprobante */}
            <div onClick={() => fileRef.current?.click()}
              style={{ border:`1.5px dashed ${T.border}`, borderRadius:5, padding:"14px", textAlign:"center",
                cursor:"pointer", marginBottom:10, background:imgPrev ? T.bg : "#fafafa" }}>
              {analizando
                ? <div style={{ color:T.muted, fontSize:12 }}>Analizando imagen con IA...</div>
                : imgPrev
                  ? <img src={imgPrev} alt="" style={{ maxWidth:"100%", maxHeight:110, borderRadius:4 }} />
                  : <div>
                      <div style={{ color:T.muted, fontWeight:600, fontSize:12 }}>Adjuntar comprobante</div>
                      <div style={{ color:T.muted, fontSize:11, marginTop:2 }}>
                        Clic aqui · o pega con <kbd style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:3, padding:"1px 4px", fontFamily:"monospace", fontSize:10 }}>Ctrl+V</kbd>
                      </div>
                    </div>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={onFileChange} />

            {analisis && (
              <div style={{ borderRadius:5, padding:"10px 12px", marginBottom:10, fontSize:12,
                background:analisis.es_comprobante ? T.greenLt : T.redLt,
                border:`1px solid ${analisis.es_comprobante ? "#86efac" : "#fca5a5"}` }}>
                {analisis.es_comprobante ? (<>
                  <div style={{ fontWeight:700, color:T.green, marginBottom:6 }}>Comprobante detectado</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 12px" }}>
                    <div><span style={{ color:T.muted }}>Banco </span><strong>{analisis.banco}</strong></div>
                    <div><span style={{ color:T.muted }}>Monto </span><strong>S/ {analisis.monto}</strong></div>
                    {analisis.fecha && <div><span style={{ color:T.muted }}>Fecha </span>{analisis.fecha}</div>}
                    {analisis.referencia && <div><span style={{ color:T.muted }}>Op. </span>{analisis.referencia}</div>}
                  </div>
                </>) : <div style={{ color:T.red, fontWeight:600 }}>No es un comprobante de pago valido</div>}
              </div>
            )}

            {/* Formulario en filas label+campo */}
            <div style={{ border:`1px solid ${T.border}`, borderRadius:5, overflow:"hidden", marginBottom:12 }}>
              {[
                { label:"Factura", content:(
                  <select style={{ ...S.select, border:"none", borderRadius:0 }}
                    value={formPago.idfactura} onChange={e => setFormPago(p => ({...p, idfactura:e.target.value}))}>
                    <option value="">— Seleccionar —</option>
                    {facturas.filter(f => !ESTADOS_IGNORAR.includes(f.estado)).map(f => (
                      <option key={f.idfactura||f.id} value={f.idfactura||f.id}>
                        #{f.idfactura||f.id} · S/ {Number(f.total||f.monto||0).toFixed(2)} · {f.vencimiento}
                      </option>
                    ))}
                  </select>
                )},
                { label:"Forma de pago", content:(
                  <select style={{ ...S.select, border:"none", borderRadius:0 }}
                    value={formPago.pasarela} onChange={e => setFormPago(p => ({...p, pasarela:e.target.value}))}>
                    {(PASARELAS[cliente?.empresa] || PASARELAS.americanet).map(p => <option key={p}>{p}</option>)}
                  </select>
                )},
                { label:"Monto (S/)", content:(
                  <input style={{ ...S.input, border:"none", borderRadius:0 }}
                    type="number" step="0.01" value={formPago.monto} placeholder="0.00"
                    onChange={e => setFormPago(p => ({...p, monto:e.target.value}))} />
                )},
              ].map(({ label, content }, i, arr) => (
                <div key={label}
                  style={{ display:"grid", gridTemplateColumns:"110px 1fr",
                    borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`,
                    fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>
                    {label}
                  </div>
                  <div>{content}</div>
                </div>
              ))}
            </div>

            <button onClick={registrarPago}
              disabled={pagando || !formPago.idfactura || !formPago.monto} className="sb-btn-action"
              style={{ ...S.btn(pagando || !formPago.idfactura || !formPago.monto ? "#9ca3af" : T.green),
                opacity: pagando || !formPago.idfactura || !formPago.monto ? 0.55 : 1, fontSize:13, padding:"11px 14px" }}>
              {pagando ? "Registrando..." : "Confirmar pago"}
            </button>
            {convId && <div style={{ color:T.muted, fontSize:11, textAlign:"center", marginTop:5 }}>Confirmacion automatica al cliente via Chatwoot</div>}
          </div>
        )}

        {/* ══ TAB: PRORROGA ══ */}
        {tab === "prorroga" && (
          <div style={{ margin:"8px", ...S.card, padding:"14px 16px" }}>
            <div style={{ fontWeight:700, fontSize:13, color:T.navy, marginBottom:12 }}>Prorroga de pago</div>
            {prorrando && <div style={{ color:T.muted, fontSize:12, textAlign:"center", padding:16 }}>Verificando elegibilidad...</div>}
            {!prorrando && !prorrInfo && <div style={{ color:T.muted, fontSize:12, textAlign:"center", padding:16 }}>Sin facturas pendientes para prorroga.</div>}
            {prorrInfo && (() => {
              const corteStr = new Date(prorrInfo.corte).toISOString().split("T")[0];
              const maxStr   = new Date(new Date(prorrInfo.corte).getTime() + prorrInfo.diasMax * 86400000).toISOString().split("T")[0];
              const diasOpciones = Array.from({ length: prorrInfo.diasMax }, (_, i) => {
                const d = new Date(prorrInfo.corte); d.setDate(d.getDate() + i + 1);
                return { dias: i + 1, fecha: d.toISOString().split("T")[0],
                  label: d.toLocaleDateString("es-PE", { day:"2-digit", month:"short" }) };
              });
              const diasSelec = prorrForm.fecha
                ? Math.round((new Date(prorrForm.fecha+"T00:00:00") - new Date(prorrInfo.corte)) / 86400000)
                : 0;
              return (<>
                <div style={{ border:`1px solid ${T.border}`, borderRadius:5, overflow:"hidden", marginBottom:12 }}>
                  {[["Factura", `#${prorrInfo.idfactura}`], ["Vencimiento", prorrInfo.vencimiento],
                    ["Dias maximos", `${prorrInfo.diasMax} dias`], ["Fecha limite", prorrInfo.fechaMaxStr]
                  ].map(([l, v], i, arr) => (
                    <div key={l} style={{ display:"grid", gridTemplateColumns:"130px 1fr",
                      borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                      <div style={{ padding:"7px 10px", background:T.bg, borderRight:`1px solid ${T.border}`,
                        fontSize:11, fontWeight:600, color:T.muted }}>{l}</div>
                      <div style={{ padding:"7px 10px", fontSize:12, fontWeight:600, color:T.navy }}>{v}</div>
                    </div>
                  ))}
                </div>
                {prorrInfo.suspendido && (
                  <div style={{ background:"#fffbeb", border:`1px solid #fde68a`, borderLeft:`3px solid #f59e0b`,
                    borderRadius:5, padding:"6px 10px", fontSize:11, color:"#92400e", fontWeight:600, marginBottom:10 }}>
                    Suspendido — maximo 3 dias de prorroga
                  </div>
                )}
                <div style={{ marginBottom:10 }}>
                  <label style={S.label}>Fecha limite de pago</label>
                  <input style={S.input} type="date" min={corteStr} max={maxStr} value={prorrForm.fecha}
                    onChange={e => setProrrForm({ fecha: e.target.value })} />
                  {prorrForm.fecha && (
                    <div style={{ marginTop:4, fontSize:11, color:T.blue, fontWeight:600 }}>
                      +{diasSelec} dia{diasSelec !== 1 ? "s" : ""} desde el corte
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:12 }}>
                  {diasOpciones.map(({ dias, fecha, label }) => (
                    <button key={dias} onClick={() => setProrrForm({ fecha })}
                      style={{ background: prorrForm.fecha === fecha ? T.blue : T.bg,
                        color: prorrForm.fecha === fecha ? "#fff" : T.slate,
                        border:`1px solid ${prorrForm.fecha === fecha ? T.blue : T.border}`,
                        borderRadius:5, padding:"5px 10px", fontSize:11, fontWeight:600,
                        cursor:"pointer", fontFamily:"inherit" }}>
                      +{dias}d · {label}
                    </button>
                  ))}
                </div>
                <button onClick={registrarProrroga} disabled={prorrando || !prorrForm.fecha} className="sb-btn-action"
                  style={{ ...S.btn(prorrando || !prorrForm.fecha ? "#9ca3af" : T.blue),
                    opacity: prorrando || !prorrForm.fecha ? 0.55 : 1 }}>
                  {prorrando ? "Registrando..." : "Confirmar prorroga"}
                </button>
                {convId && <div style={{ color:T.muted, fontSize:11, textAlign:"center", marginTop:5 }}>El cliente sera notificado automaticamente</div>}
              </>);
            })()}
          </div>
        )}

        {/* ══ TAB: NUEVA FACTURA ══ */}
        {tab === "nueva" && (
          <div style={{ margin:"8px", ...S.card, padding:"14px 16px" }}>
            <div style={{ fontWeight:700, fontSize:13, color:T.navy, marginBottom:4 }}>Nueva factura</div>
            <div style={{ color:T.muted, fontSize:11, marginBottom:12 }}>
              Para <strong style={{ color:T.navy }}>{cliente.nombre}</strong> · #{cliente.mikrowisp_id}
            </div>
            <div style={{ border:`1px solid ${T.border}`, borderRadius:5, overflow:"hidden", marginBottom:12 }}>
              {[["Nodo", String(cliente.nodo)], ["Empresa", cliente.empresa]].map(([l, v], i, arr) => (
                <div key={l} style={{ display:"grid", gridTemplateColumns:"110px 1fr",
                  borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ padding:"6px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted }}>{l}</div>
                  <div style={{ padding:"6px 10px", fontSize:12, color:T.navy, textTransform:"capitalize" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={S.label}>Fecha de vencimiento</label>
              <input style={S.input} type="date" value={factForm.vencimiento}
                min={new Date().toISOString().split("T")[0]}
                onChange={e => setFactForm(p => ({...p, vencimiento:e.target.value}))} />
            </div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
              {[
                ["Fin de mes", (() => { const d = new Date(); d.setMonth(d.getMonth()+1,0); return d.toISOString().split("T")[0]; })()],
                ["+30 dias",   (() => { const d = new Date(); d.setDate(d.getDate()+30); return d.toISOString().split("T")[0]; })()],
                ["+15 dias",   (() => { const d = new Date(); d.setDate(d.getDate()+15); return d.toISOString().split("T")[0]; })()],
              ].map(([lbl, val]) => (
                <button key={lbl} onClick={() => setFactForm(p => ({...p, vencimiento:val}))}
                  style={{ background:factForm.vencimiento===val?T.blue:T.bg,
                    color:factForm.vencimiento===val?"#fff":T.slate,
                    border:`1px solid ${factForm.vencimiento===val?T.blue:T.border}`,
                    borderRadius:5, padding:"5px 10px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                  {lbl}
                </button>
              ))}
            </div>
            <button onClick={crearFactura} disabled={creando || !factForm.vencimiento} className="sb-btn-action"
              style={{ ...S.btn(creando || !factForm.vencimiento ? "#9ca3af" : T.blue),
                opacity: creando || !factForm.vencimiento ? 0.55 : 1 }}>
              {creando ? "Creando factura..." : "Crear factura de servicios"}
            </button>
            <div style={{ color:T.muted, fontSize:11, textAlign:"center", marginTop:5 }}>Se registrara en Mikrowisp</div>
          </div>
        )}

        {/* ══ TAB: EDITAR CLIENTE ══ */}
        {tab === "editar" && (
          <div style={{ margin:"8px", ...S.card }}>
            <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}` }}>
              <div style={{ fontWeight:700, fontSize:13, color:T.navy }}>Editar datos del cliente</div>
              <div style={{ color:T.muted, fontSize:11, marginTop:2 }}>Solo modifica los campos que necesites cambiar.</div>
            </div>
            <div>
              {[
                { key:"nombre", label:"Nombre / Titular", type:"text", placeholder:"Ej: RAMIREZ GARCIA, JUAN CARLOS" },
                { key:"movil",  label:"Movil", type:"text", placeholder:"Ej: 987654321, 912345678", hint:"Varios numeros separados por coma" },
                { key:"telefono", label:"Telefono fijo", type:"text", placeholder:"Ej: 014441234" },
                { key:"correo", label:"Correo", type:"email", placeholder:"Ej: cliente@correo.com" },
                { key:"cedula", label:"DNI / Cedula", type:"text", placeholder:"Ej: 12345678" },
                { key:"direccion_principal", label:"Direccion", type:"text", placeholder:"Ej: Av. Los Alamos 123" },
              ].map(({ key, label, type, placeholder, hint }, i, arr) => (
                <div key={key} style={{ display:"grid", gridTemplateColumns:"120px 1fr",
                  borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ padding:"10px 12px", background:T.bg, borderRight:`1px solid ${T.border}`,
                    display:"flex", flexDirection:"column", justifyContent:"center" }}>
                    <span style={{ fontSize:11, fontWeight:600, color:T.muted }}>{label}</span>
                    {hint && <span style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{hint}</span>}
                  </div>
                  <div style={{ padding:"6px 10px" }}>
                    <input style={{ ...S.input, border:"none", padding:"4px 0", background:"transparent",
                      borderBottom:`1px solid ${T.border}`, borderRadius:0 }}
                      type={type} value={editForm[key]} placeholder={placeholder}
                      onChange={e => setEditForm(p => ({...p, [key]:e.target.value}))} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:"12px 14px" }}>
              <button onClick={actualizarCliente} disabled={guardando} className="sb-btn-action"
                style={{ ...S.btn(guardando ? "#9ca3af" : T.blue), opacity:guardando?0.55:1 }}>
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}

        {/* ══ TAB: CREAR ORDEN ══ */}
        {tab === "orden" && (
          <div style={{ margin:"8px", ...S.card, padding:"14px 16px" }}>
            <div style={{ fontWeight:700, fontSize:13, color:T.navy, marginBottom:4 }}>Crear orden de servicio</div>
            <div style={{ color:T.muted, fontSize:11, marginBottom:12 }}>
              Para <strong style={{ color:T.navy }}>{cliente.nombre}</strong> · DNI {cliente.cedula || "—"}
            </div>

            {/* Datos pre-llenados del cliente */}
            <div style={{ border:`1px solid ${T.border}`, borderRadius:5, overflow:"hidden", marginBottom:12 }}>
              {[
                ["Empresa",   cliente.empresa === "dimfiber" ? "DIM" : "Americanet"],
                ["Nodo",      String(cliente.nodo)],
                ["Dirección", detalle?.direccion_principal || "—"],
                ["Celular",   detalle?.movil || contact?.phone_number || "—"],
                ...(svc?.pppuser ? [["PPPoE", svc.pppuser]] : []),
              ].map(([l, v], i, arr) => (
                <div key={l} style={{ display:"grid", gridTemplateColumns:"90px 1fr",
                  borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ padding:"5px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>{l}</div>
                  <div style={{ padding:"5px 10px", fontSize:11, color:T.navy, fontWeight:500, wordBreak:"break-all" }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Si la orden ya fue creada — mostrar resultado */}
            {ordenCreada ? (
              <div style={{ background:T.greenLt, border:`1px solid #86efac`, borderLeft:`3px solid ${T.green}`, borderRadius:5, padding:"14px 16px", marginBottom:12 }}>
                <div style={{ fontWeight:800, fontSize:14, color:T.green, marginBottom:4 }}>Orden creada exitosamente</div>
                <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:15, color:T.navy, marginBottom:6 }}>{ordenCreada.codigo}</div>
                <div style={{ fontSize:11, color:T.muted }}>La orden fue registrada en el sistema y notificada como nota interna en esta conversación.</div>
                <button onClick={() => setOrdenCreada(null)} style={{ ...S.btnOut, marginTop:10, fontSize:11 }}>Crear otra orden</button>
              </div>
            ) : (<>
              {/* Formulario */}
              <div style={{ border:`1px solid ${T.border}`, borderRadius:5, overflow:"hidden", marginBottom:12 }}>
                {/* Tipo de actuación */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Tipo</div>
                  <div>
                    <select style={{ ...S.select, border:"none", borderRadius:0, fontSize:12 }}
                      value={ordenForm.tipoActuacion} onChange={e => setOrdenForm(p => ({...p, tipoActuacion:e.target.value}))}>
                      <option>Incidencia Internet</option>
                      <option>Instalacion Internet</option>
                      <option>Instalacion Internet y Cable</option>
                      <option>Instalacion TV</option>
                      <option>Mantenimiento</option>
                      <option>Visita Tecnica</option>
                      <option>Recojo de equipo</option>
                    </select>
                  </div>
                </div>
                {/* Fecha */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Fecha</div>
                  <div>
                    <input style={{ ...S.input, border:"none", borderRadius:0, fontSize:12 }} type="date"
                      value={ordenForm.fechaActuacion} onChange={e => setOrdenForm(p => ({...p, fechaActuacion:e.target.value}))} />
                  </div>
                </div>
                {/* Autor (read-only) */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Autor</div>
                  <div style={{ padding:"8px 10px", fontSize:12, color:T.navy, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ background:T.accent, color:T.blue, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700, border:`1px solid ${T.border}` }}>{agente || "—"}</span>
                  </div>
                </div>
                {/* Técnico */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Técnico</div>
                  <div>
                    {tecnicosLista.length > 0 ? (
                      <select style={{ ...S.select, border:"none", borderRadius:0, fontSize:12 }}
                        value={ordenForm.tecnico} onChange={e => setOrdenForm(p => ({...p, tecnico:e.target.value}))}>
                        <option value="">— Seleccionar —</option>
                        {tecnicosLista.map(t => <option key={t.nombre} value={t.nombre}>{t.nombre}</option>)}
                      </select>
                    ) : (
                      <input style={{ ...S.input, border:"none", borderRadius:0, fontSize:12 }} type="text"
                        placeholder="Nombre del técnico" value={ordenForm.tecnico}
                        onChange={e => setOrdenForm(p => ({...p, tecnico:e.target.value}))} />
                    )}
                  </div>
                </div>
                {/* Coordenadas */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>
                    <MapPin size={11} style={{ marginRight:3 }} />Coords.
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:0 }}>
                    <input style={{ ...S.input, border:"none", borderRadius:0, fontSize:11, flex:1, fontFamily:"monospace" }}
                      type="text" placeholder="-16.438490, -71.598208"
                      value={ordenForm.coordenadas}
                      onChange={e => { setOrdenForm(p => ({...p, coordenadas:e.target.value})); setShowOrdenMap(false); }} />
                    {(() => {
                      const [lat, lng] = (ordenForm.coordenadas || "").split(",").map(Number);
                      const valid = lat && lng && !isNaN(lat) && !isNaN(lng);
                      return valid ? (
                        <button onClick={() => setShowOrdenMap(m => !m)}
                          style={{ ...S.btnSm(showOrdenMap ? T.blueDk : T.blue), borderRadius:0, padding:"0 10px", height:"100%", fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>
                          {showOrdenMap ? "Ocultar" : "Ver mapa"}
                        </button>
                      ) : null;
                    })()}
                  </div>
                </div>
                {/* Mapa */}
                {showOrdenMap && (() => {
                  const [lat, lng] = (ordenForm.coordenadas || "").split(",").map(Number);
                  if (!lat || !lng) return null;
                  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.003},${lat-0.003},${lng+0.003},${lat+0.003}&layer=mapnik&marker=${lat},${lng}`;
                  return (
                    <div style={{ position:"relative" }}>
                      <iframe src={mapUrl} title="Ubicación orden" style={{ width:"100%", height:160, border:"none", display:"block" }} loading="lazy" />
                      <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
                        style={{ position:"absolute", bottom:6, right:8, background:"rgba(0,0,0,0.6)", color:"#fff", fontSize:10, padding:"3px 8px", borderRadius:4, textDecoration:"none", fontWeight:600 }}>
                        Google Maps ↗
                      </a>
                    </div>
                  );
                })()}
                {/* Descripción */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr" }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, paddingTop:10 }}>Detalle</div>
                  <div>
                    <textarea style={{ ...S.input, border:"none", borderRadius:0, fontSize:12, resize:"vertical", minHeight:60 }}
                      placeholder="Descripción del problema o trabajo (opcional)"
                      value={ordenForm.descripcion} onChange={e => setOrdenForm(p => ({...p, descripcion:e.target.value}))} />
                  </div>
                </div>
              </div>

              <button onClick={crearOrden} disabled={creandoOrden || !ordenForm.tipoActuacion || !ordenForm.tecnico.trim()}
                className="sb-btn-action"
                style={{ ...S.btn(creandoOrden || !ordenForm.tecnico.trim() ? "#9ca3af" : T.blue),
                  opacity: creandoOrden || !ordenForm.tecnico.trim() ? 0.55 : 1 }}>
                {creandoOrden ? "Creando orden..." : "Crear orden de servicio"}
              </button>
              {convId && <div style={{ color:T.muted, fontSize:11, textAlign:"center", marginTop:5 }}>Se enviará como nota interna en esta conversación</div>}
            </>)}
          </div>
        )}

        {/* ══ FOOTER ══ */}
        <div style={{ textAlign:"center", padding:"8px 0 14px" }}>
          <a href={`${cliente.empresa==="dimfiber"?"http://app.dimfiber.com":"https://americanet.club"}/index.php?r=clientes/view&id=${cliente.mikrowisp_id}`}
            target="_blank" rel="noopener noreferrer"
            style={{ color:T.muted, fontSize:11, textDecoration:"none" }}>
            Ver perfil completo en Mikrowisp ↗
          </a>
        </div>

      </>)}

      </div>)}
    </div>
  );
}
