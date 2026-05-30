import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import logoAmericanet from "../assets/americanet-logo-new-trimmed.png";

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
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .sb-panel * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif !important; }
  .sb-tab-btn { transition: all .18s ease; }
  .sb-tab-btn:hover { filter: brightness(0.95); }
  .sb-btn-action { transition: all .15s ease; }
  .sb-btn-action:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .sb-card { animation: sbFadeUp .25s ease both; }
  .sb-pulse::after { content:''; position:absolute; inset:0; border-radius:50%; background:inherit; animation: sbPing 1.5s ease infinite; }
  @keyframes sbFadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes sbPing   { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(2.2);opacity:0} }
  @keyframes dotPulse { 0%,80%,100%{transform:scale(.55);opacity:.25} 40%{transform:scale(1);opacity:1} }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
`;

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  navy:    "#0f172a",
  blue:    "#2563eb",
  blueDk:  "#1e40af",
  sky:     "#0ea5e9",
  skyDk:   "#0284c7",
  slate:   "#475569",
  muted:   "#94a3b8",
  border:  "#e2e8f0",
  bg:      "#f1f5f9",
  card:    "#ffffff",
  green:   "#059669",
  greenLt: "#d1fae5",
  amber:   "#d97706",
  amberLt: "#fef3c7",
  red:     "#dc2626",
  redLt:   "#fee2e2",
  purple:  "#7c3aed",
  teal:    "#0d9488",
};

const S = {
  root:   { fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif", fontSize:13, color:T.navy, background:T.bg, minHeight:"100vh", letterSpacing:"-0.01em" },
  card:   { background:T.card, borderRadius:16, boxShadow:"0 1px 3px rgba(15,23,42,0.06),0 8px 24px rgba(15,23,42,0.08)", marginBottom:10, overflow:"hidden" },
  label:  { fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1.2, marginBottom:4, display:"block" },
  val:    { fontWeight:700, color:T.navy, fontSize:14, lineHeight:1.3 },
  mono:   { fontFamily:"'JetBrains Mono','Fira Code',monospace", fontWeight:600, color:T.navy, fontSize:11, letterSpacing:0 },
  badge:  (c,bg) => ({ background:bg||c+"15", color:c, borderRadius:20, padding:"3px 10px", fontSize:10, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4, letterSpacing:0.3 }),
  btn:    (c=T.blue) => ({ background:c, color:"#fff", border:"none", borderRadius:12, padding:"12px 16px", fontWeight:700, fontSize:12, cursor:"pointer", width:"100%", letterSpacing:0.1, transition:"all .15s" }),
  btnSm:  (c=T.blue) => ({ background:c, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontWeight:700, fontSize:11, cursor:"pointer" }),
  btnOut: { background:"none", border:`1.5px solid ${T.border}`, borderRadius:8, padding:"5px 12px", fontWeight:600, fontSize:10, cursor:"pointer", color:T.slate },
  input:  { border:`1.5px solid ${T.border}`, borderRadius:10, padding:"10px 13px", fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", color:T.navy, background:"#fff", fontFamily:"inherit", transition:"border .15s" },
  select: { border:`1.5px solid ${T.border}`, borderRadius:10, padding:"10px 13px", fontSize:13, width:"100%", boxSizing:"border-box", background:"#fff", color:T.navy, fontFamily:"inherit" },
  alert:  (ok) => ({ background:ok?T.greenLt:T.redLt, color:ok?T.green:T.red, border:`1px solid ${ok?"#6ee7b7":"#fca5a5"}`, borderRadius:12, padding:"11px 15px", fontSize:12, marginBottom:10, fontWeight:600 }),
  divider:{ borderTop:`1px solid ${T.border}`, margin:"14px 0" },
  statCard: (accent) => ({ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:"10px 12px", display:"flex", flexDirection:"column", gap:2 }),
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
      <div style={{ padding:"10px 10px 4px" }}>

      {/* Header mini */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <img src={logoAmericanet} alt="Americanet" style={{ height:22, filter:"brightness(0) saturate(0) brightness(0.4)", opacity:0.5 }} />
        <span style={{ fontSize:10, color:T.muted, fontWeight:600, letterSpacing:0.5 }}>Panel de Agentes</span>
        <div style={{ flex:1 }} />
        {/* Agente activo + botón cambiar */}
        {agente && (
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ background:T.blue+"18", borderRadius:6, padding:"3px 8px", fontSize:10, fontWeight:700, color:T.blue }}>
              👤 {agente}
            </div>
            <button onClick={() => { setAgente(""); clearStoredAgente(); }}
              style={{ ...S.btnOut, fontSize:9, padding:"3px 7px" }}>
              Cambiar
            </button>
          </div>
        )}
        {msg && <div style={{ background:msg.ok?"#f0fdf4":"#fef2f2", color:msg.ok?T.green:T.red, border:`1px solid ${msg.ok?"#bbf7d0":"#fecaca"}`, borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:600 }}>{msg.text}</div>}
      </div>

      {/* Error + búsqueda flexible */}
      {error && !cliente && (
        <div style={{ ...S.card, padding:"16px 18px", border:`1.5px solid #fecaca` }}>
          <div style={{ fontWeight:800, color:T.red, fontSize:13, marginBottom:4 }}>Cliente no encontrado</div>
          <div style={{ fontSize:11, color:T.muted, marginBottom:14 }}>
            Número <strong>{contact?.phone_number}</strong> no está registrado en Mikrowisp.
          </div>

          <div style={{ fontWeight:700, fontSize:12, color:T.navy, marginBottom:8 }}>Buscar cliente</div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <input style={{ ...S.input, flex:1 }} type="text"
              placeholder="DNI o nombre (parcial, cualquier orden)" value={dniBusq}
              onChange={e => { setDniBusq(e.target.value); setDniResultados([]); setDniSel(null); }}
              onKeyDown={e => e.key === "Enter" && buscarPorDni()} />
            <button onClick={buscarPorDni} disabled={dniBuscando}
              style={{ ...S.btnSm(T.blue), padding:"9px 14px", opacity:dniBuscando?0.6:1 }}>
              {dniBuscando ? "..." : "Buscar"}
            </button>
          </div>

          {/* Lista de resultados */}
          {dniResultados.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:10 }}>
              {dniResultados.map(row => {
                const sel = dniSel?.mikrowisp_id === row.mikrowisp_id;
                return (
                  <div key={row.mikrowisp_id} onClick={() => setDniSel(sel ? null : row)}
                    style={{ background: sel ? "#f0fdf4" : T.bg, border:`1.5px solid ${sel?"#86efac":T.border}`,
                      borderRadius:10, padding:"10px 12px", cursor:"pointer", transition:"all .15s" }}>
                    <div style={{ fontWeight:700, fontSize:12, color:T.navy }}>{row.nombre}</div>
                    <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>
                      DNI: {row.cedula} · ID: #{row.mikrowisp_id} · Nodo: {row.nodo} · {row.estado}
                    </div>
                    {row.telefonos && row.telefonos !== "EMPTY" &&
                      <div style={{ fontSize:10, color:T.muted }}>📞 {row.telefonos}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Acciones para el resultado seleccionado */}
          {dniSel && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={() => verInfoCliente(dniSel)} className="sb-btn-action"
                style={{ ...S.btn(T.blue), fontSize:11, padding:"9px 12px" }}>
                👁 Ver información del cliente
              </button>
              {contact?.phone_number && (
                <button onClick={agregarTelefono} disabled={agregando} className="sb-btn-action"
                  style={{ ...S.btn(agregando ? T.muted : T.green), opacity:agregando?0.6:1, fontSize:11, padding:"9px 12px" }}>
                  {agregando ? "Guardando..." : `➕ Agregar ${contact.phone_number} y ver info`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Cliente cargado ── */}
      {cliente && !loading && (<>

        {/* ══ HERO HEADER ══ */}
        <div style={{ ...S.card, marginBottom:10 }}>
          {/* Banner */}
          <div style={{ background: suspendido
            ? "linear-gradient(135deg,#7f1d1d 0%,#b91c1c 100%)"
            : "linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 50%,#2563eb 100%)",
            padding:"18px 16px 14px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", width:160, height:160, borderRadius:"50%", background:"rgba(255,255,255,0.04)", top:-50, right:-40 }} />
            <div style={{ position:"absolute", width:90, height:90, borderRadius:"50%", background:"rgba(255,255,255,0.06)", bottom:-30, left:-20 }} />

            <div style={{ display:"flex", alignItems:"center", gap:14, position:"relative" }}>
              {/* Avatar circular */}
              <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(255,255,255,0.2)", border:"2.5px solid rgba(255,255,255,0.4)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ color:"#fff", fontWeight:900, fontSize:20 }}>{primerNombre(cliente.nombre)[0]}</span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:"#fff", fontWeight:800, fontSize:18, lineHeight:1.1 }}>{primerNombre(cliente.nombre)}</div>
                <div style={{ color:"rgba(255,255,255,0.55)", fontSize:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:1 }}>{cliente.nombre}</div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, flexWrap:"wrap" }}>
                  <span style={{ background: suspendido?"rgba(255,255,255,0.15)":"rgba(16,185,129,0.25)", border:`1px solid ${suspendido?"rgba(255,255,255,0.2)":"rgba(16,185,129,0.5)"}`, borderRadius:20, padding:"2px 10px", color:"#fff", fontSize:10, fontWeight:700 }}>
                    {estadoServicio||"ACTIVO"}
                  </span>
                  {svc && (
                    <span style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,0.1)", borderRadius:20, padding:"2px 10px" }}>
                      <span style={{ position:"relative", width:7, height:7, display:"inline-block" }}>
                        <span style={{ position:"absolute", inset:0, borderRadius:"50%", background:isOnline?"#4ade80":"#94a3b8" }} />
                        {isOnline && <span className="sb-pulse" style={{ position:"absolute", inset:0, borderRadius:"50%", background:"#4ade80" }} />}
                      </span>
                      <span style={{ color:"rgba(255,255,255,0.8)", fontSize:10, fontWeight:600 }}>{isOnline?"En línea":"Sin señal"}</span>
                    </span>
                  )}
                </div>
              </div>
              <button onClick={()=>buscarCliente(contact?.phone_number||"")}
                style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, width:32, height:32, color:"#fff", fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                ↺
              </button>
            </div>
          </div>

          {/* Stats grid 2x2 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, padding:"12px 14px 4px" }}>
            {[
              { label:"DNI", val:cliente.cedula||"—", icon:"🪪", accent:T.sky },
              { label:"ID Cliente", val:`#${cliente.mikrowisp_id}`, icon:"🔢", accent:T.purple },
              { label:"Nodo", val:String(cliente.nodo), icon:"📡", accent:T.teal },
              { label:"Empresa", val:cliente.empresa, icon:"🏢", accent:T.blue },
            ].map(item => (
              <div key={item.label} style={{ background:T.bg, borderRadius:10, padding:"10px 12px", border:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4 }}>
                  <span style={{ fontSize:12 }}>{item.icon}</span>
                  <span style={{ fontSize:9, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1 }}>{item.label}</span>
                </div>
                <div style={{ fontWeight:800, fontSize:14, color:T.navy, textTransform:"capitalize" }}>{item.val}</div>
              </div>
            ))}
          </div>

          {/* Servicio de internet */}
          {svc && <div style={{ margin:"8px 14px 0", background:"#f8faff", borderRadius:12, padding:"14px", border:`1px solid #dbeafe` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:T.blue+"15", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🌐</div>
                <span style={{ fontSize:11, fontWeight:800, color:T.navy }}>Servicio</span>
              </div>
              {svc.coordenadas && (() => {
                const [lat, lng] = svc.coordenadas.split(",").map(Number);
                if (!lat||!lng) return null;
                return (
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <button onClick={()=>setShowMap(m=>!m)}
                      style={{ background:showMap?T.sky:"rgba(14,165,233,0.1)", color:showMap?"#fff":T.sky, border:`1px solid ${showMap?T.sky:"rgba(14,165,233,0.3)"}`, borderRadius:8, padding:"3px 10px", fontSize:10, fontWeight:700, cursor:"pointer" }}>
                      📍 {showMap?"Ocultar":"Ver mapa"}
                    </button>
                    <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
                      style={{ color:T.sky, fontSize:10, textDecoration:"none", fontWeight:700 }}>G↗</a>
                  </div>
                );
              })()}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px 16px" }}>
              {svc.perfil  && <div><div style={S.label}>Plan</div><div style={{ fontWeight:800, color:T.blue, fontSize:12, lineHeight:1.3 }}>{svc.perfil}</div></div>}
              {svc.ip      && <div><div style={S.label}>IP Activa</div><div style={{ ...S.mono, fontSize:12, color:T.teal }}>{svc.ip}</div></div>}
              {svc.pppuser && <div><div style={S.label}>PPPoE</div><div style={{ ...S.mono, fontSize:11 }}>{svc.pppuser}</div></div>}
              {svc.mac     && <div><div style={S.label}>MAC</div><div style={{ ...S.mono, fontSize:10 }}>{svc.mac}</div></div>}
            </div>

            {/* Diagnóstico MikroTik */}
            <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${T.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: showDiag?10:0 }}>
                <span style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:0.8 }}>⚡ Diagnóstico MikroTik</span>
                <button onClick={consultarDiagnostico} disabled={diagLoad} className="sb-btn-action"
                  style={{ background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", border:"none", borderRadius:7, padding:"5px 12px", fontSize:10, fontWeight:700, cursor:diagLoad?"not-allowed":"pointer", opacity:diagLoad?0.7:1 }}>
                  {diagLoad?"Consultando...":"⚡ Diagnosticar"}
                </button>
              </div>
              {showDiag && !diagLoad && diagError && (
                <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:9, padding:"10px 12px", fontSize:11, color:T.red, fontWeight:500 }}>
                  {diagError}
                </div>
              )}
              {showDiag && !diagLoad && diagResult && (() => {
                const mk = diagResult.mikrotik || {};
                const c = diagColor(mk.estado);
                const isConn = ["connected","conectado"].includes((mk.estado||"").toLowerCase());
                return (
                  <div style={{ background: isConn?"#f0fdf4":"#fef2f2", border:`1.5px solid ${c}30`, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <div style={{ position:"relative", width:10, height:10, flexShrink:0 }}>
                        <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:c }} />
                        {isConn && <div className="sb-pulse" style={{ position:"absolute", inset:0, borderRadius:"50%", background:c }} />}
                      </div>
                      <div style={{ fontWeight:800, fontSize:13, color:c }}>
                        {isConn?"Conectado":"Desconectado"}
                      </div>
                      <span style={{ fontSize:10, color:T.muted, marginLeft:"auto" }}>{mk.origen||"MikroTik"}</span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 14px" }}>
                      {[
                        ["IP",          mk.ip],
                        ["Uptime",      mk.uptime],
                        ["Router",      mk.router?.nombre],
                        ["Profile",     mk.profile],
                        ["Caller-ID",   mk.callerId],
                        ["Último logout", mk.lastLoggedOut],
                      ].filter(([,v])=>v).map(([lbl,val])=>(
                        <div key={lbl}>
                          <div style={S.label}>{lbl}</div>
                          <div style={{ fontWeight:600, fontSize:11, color:T.navy }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {mk.disabled && <div style={{ marginTop:8, background:"#fef3c7", borderRadius:7, padding:"5px 10px", fontSize:11, color:"#92400e", fontWeight:700 }}>⚠️ Usuario deshabilitado en MikroTik</div>}
                  </div>
                );
              })()}
            </div>

            {/* Mapa */}
            {showMap && svc.coordenadas && (() => {
              const [lat, lng] = svc.coordenadas.split(",").map(Number);
              const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.003},${lat-0.003},${lng+0.003},${lat+0.003}&layer=mapnik&marker=${lat},${lng}`;
              return <iframe src={mapUrl} title="Ubicación" style={{ width:"100%", height:180, borderRadius:10, border:`1px solid ${T.border}`, marginTop:10 }} loading="lazy" />;
            })()}

            {/* Señal */}
            {snOnu && <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${T.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:0.8 }}>📶 Señal · <span style={{ fontFamily:"monospace", textTransform:"none" }}>{snOnu}</span></span>
                <button onClick={consultarSenal} disabled={senalLoad} className="sb-btn-action"
                  style={{ ...S.btnSm(senalLoad?T.muted:T.blue), opacity:senalLoad?0.6:1, fontSize:10 }}>
                  {senalLoad?"Leyendo...":"Consultar señal"}
                </button>
              </div>
              {senal && (<>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[["Rx ONU", senal.rx],["Rx OLT", senal.oltRx]].map(([lbl,val])=>{
                    const c = senalColor(val);
                    const pct = Math.min(100, Math.max(0, ((parseFloat(val)||0)+35)/15*100));
                    return (
                      <div key={lbl} style={{ background:"#fff", borderRadius:9, padding:"10px 12px", border:`1.5px solid ${c}30` }}>
                        <div style={S.label}>{lbl}</div>
                        <div style={{ fontWeight:800, fontSize:18, color:c, lineHeight:1 }}>{val}</div>
                        <div style={{ fontSize:10, color:c, marginBottom:6 }}>dBm</div>
                        <div style={{ background:T.bg, borderRadius:4, height:5, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:c, borderRadius:4, transition:"width .6s ease" }} />
                        </div>
                        <div style={{ fontSize:10, fontWeight:700, color:c, marginTop:4 }}>{senalLabel(val)}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize:10, color:T.muted, textAlign:"right", marginTop:5 }}>Actualizado {senal.ts}</div>
              </>)}
            </div>}
          </div>}
          <div style={{ height:14 }} />
        </div>

        {/* ══ DEUDA ══ */}
        {factPend.length > 0 ? (
          <div style={{ ...S.card, marginBottom:10, overflow:"hidden" }}>
            <div style={{ background:"linear-gradient(135deg,#f59e0b 0%,#d97706 100%)", padding:"14px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ color:"#fff", fontWeight:900, fontSize:11, letterSpacing:1, textTransform:"uppercase", opacity:0.8, marginBottom:2 }}>Deuda pendiente</div>
                  <div style={{ color:"#fff", fontWeight:900, fontSize:26, lineHeight:1 }}>S/ {Number(factPend[0]?.total||factPend[0]?.monto||0).toFixed(2)}</div>
                  <div style={{ color:"rgba(255,255,255,0.7)", fontSize:10, marginTop:3 }}>
                    {factPend.length > 1 ? `${factPend.length} facturas` : `Vence ${factPend[0]?.vencimiento||"—"}`}
                  </div>
                </div>
                <button onClick={()=>setTab("pago")} className="sb-btn-action"
                  style={{ background:"#fff", border:"none", borderRadius:12, padding:"10px 18px", color:T.amber, fontWeight:800, fontSize:12, cursor:"pointer", boxShadow:"0 4px 12px rgba(0,0,0,0.15)" }}>
                  Pagar →
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ ...S.card, marginBottom:10, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, borderLeft:`4px solid ${T.green}` }}>
            <div style={{ width:40, height:40, borderRadius:12, background:T.greenLt, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>✅</div>
            <div>
              <div style={{ fontWeight:800, color:T.green, fontSize:14 }}>Sin deuda pendiente</div>
              <div style={{ fontSize:11, color:T.teal, marginTop:2 }}>Cliente al día con sus pagos</div>
            </div>
          </div>
        )}

        {/* ══ TABS ══ */}
        <div style={{ background:T.card, borderRadius:14, padding:5, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, marginBottom:10, boxShadow:"0 1px 3px rgba(15,23,42,0.06)" }}>
          {[["info","📋","Facturas"],["pago","💳","Pago"],["prorroga","⏳","Prórroga"],["nueva","🧾","Nueva"]].map(([t,icon,label])=>(
            <button key={t} className="sb-tab-btn" onClick={()=>{ setTab(t); if(t==="prorroga"&&!prorrInfo) consultarProrroga(); }}
              style={{ border:"none", borderRadius:10, padding:"9px 4px", fontWeight:700, fontSize:10, cursor:"pointer", fontFamily:"inherit", transition:"all .2s",
                background: tab===t ? T.blue : "transparent",
                color: tab===t ? "#fff" : T.muted,
                boxShadow: tab===t ? `0 4px 12px ${T.blue}35` : "none",
              }}>
              <div style={{ fontSize:15, marginBottom:2 }}>{icon}</div>
              {label}
            </button>
          ))}
        </div>

        {/* ══ TAB: FACTURAS ══ */}
        {tab==="info" && (
          <div style={{ ...S.card, padding:"16px 16px 8px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:13, color:T.navy }}>Historial de facturas</div>
              <span style={{ fontSize:10, color:T.muted, fontWeight:600 }}>{factRecientes.length} registros</span>
            </div>
            {factRecientes.length===0
              ? <div style={{ color:T.muted, fontSize:12, textAlign:"center", padding:24 }}>Sin facturas registradas</div>
              : factRecientes.map((f,i)=>{
                  const isPag = ["pagado","PAGADO","paid"].includes(f.estado);
                  const isAnu = ["anulado","ANULADO","cancelled","canceled"].includes(f.estado);
                  const c     = isPag?T.green:isAnu?T.muted:T.amber;
                  const bg    = isPag?T.greenLt:isAnu?"#f1f5f9":T.amberLt;
                  const fid   = f.idfactura||f.id;
                  const open  = factExpand === fid;
                  return (
                    <div key={fid} style={{ marginBottom:6 }}>
                      <div onClick={()=>setFactExpand(open?null:fid)}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:open?bg:T.bg, border:`1px solid ${open?c+"40":T.border}`, cursor:"pointer", transition:"all .2s" }}>
                        {/* Indicador color */}
                        <div style={{ width:36, height:36, borderRadius:10, background:c+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <span style={{ fontSize:16 }}>{isPag?"✅":isAnu?"🚫":"⏳"}</span>
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:800, fontSize:16, color:T.navy, lineHeight:1 }}>S/ {Number(f.total||f.monto||0).toFixed(2)}</div>
                          <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>
                            {isPag?`Pagado ${f.fechapago||f.fecha_pago||""}`:isAnu?"Anulada":`Vence ${f.vencimiento||"—"}`}
                            <span style={{ marginLeft:6, opacity:0.5 }}>· #{fid}</span>
                          </div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                          <span style={{ ...S.badge(c,bg), fontSize:9 }}>{f.estado}</span>
                          <span style={{ color:T.muted, fontSize:10, transition:"transform .2s", display:"inline-block", transform:open?"rotate(180deg)":"none" }}>▾</span>
                        </div>
                      </div>

                      {open && (
                        <div style={{ background:"#f8fafc", borderRadius:"0 0 10px 10px", padding:"12px 14px", border:`1px solid ${T.border}`, borderTop:"none", marginTop:-2 }}>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 14px", marginBottom:10 }}>
                            {[
                              ["N° Factura", `#${fid}`], ["Estado", f.estado||"—"],
                              ["Emitido", f.emitido||"—"], ["Vencimiento", f.vencimiento||"—"],
                              ["Total", `S/ ${Number(f.total||0).toFixed(2)}`], ["Cobrado", `S/ ${Number(f.cobrado||0).toFixed(2)}`],
                              ["Fecha pago", f.fechapago||f.fecha_pago||"—"], ["Forma pago", f.pasarela||f.forma_pago||"—"],
                            ].filter(([,v])=>v).map(([lbl,val])=>(
                              <div key={lbl}>
                                <div style={S.label}>{lbl}</div>
                                <div style={{ fontWeight:600, fontSize:11, color:T.navy }}>{val}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {!isPag && !isAnu && (
                              <button onClick={(e)=>{ e.stopPropagation(); setFormPago(p=>({...p, idfactura:String(fid), monto:String(Number(f.total||0).toFixed(2))})); setTab("pago"); setFactExpand(null); }}
                                style={{ ...S.btn(T.green), fontSize:11, padding:"9px 12px" }}>
                                💳 Pagar esta factura
                              </button>
                            )}
                            {isPag && (
                              <button onClick={(e)=>{ e.stopPropagation(); eliminarPago(fid); }}
                                disabled={deletingPago===fid}
                                style={{ ...S.btnOut, fontSize:11, padding:"9px 12px", borderColor:"#f97316", color:"#f97316", opacity:deletingPago===fid?0.6:1 }}>
                                {deletingPago===fid ? "Eliminando..." : "🗑 Eliminar pago"}
                              </button>
                            )}
                            <button onClick={(e)=>{ e.stopPropagation(); eliminarFactura(fid); }}
                              disabled={deletingFact===fid}
                              style={{ ...S.btnOut, fontSize:11, padding:"9px 12px", borderColor:T.red, color:T.red, opacity:deletingFact===fid?0.6:1 }}>
                              {deletingFact===fid ? "Eliminando..." : "🗑 Eliminar factura"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* ══ TAB: PAGO ══ */}
        {tab==="pago" && (
          <div style={{ ...S.card, padding:"16px 18px" }}>
            <div style={{ fontWeight:800, fontSize:13, color:T.navy, marginBottom:14 }}>Registrar pago</div>

            <div onClick={()=>fileRef.current?.click()} style={{ border:`2px dashed ${T.border}`, borderRadius:12, padding:"20px 16px", textAlign:"center", cursor:"pointer", marginBottom:12, background:imgPrev?"#f8fafc":T.bg }}>
              {analizando?<div style={{ color:T.slate, fontSize:12 }}>🔍 Analizando con IA...</div>
              :imgPrev?<img src={imgPrev} alt="" style={{ maxWidth:"100%", maxHeight:130, borderRadius:8 }} />
              :<div><div style={{ fontSize:28, marginBottom:6 }}>📎</div>
                <div style={{ color:T.slate, fontWeight:700, fontSize:12 }}>Subir comprobante</div>
                <div style={{ color:T.muted, fontSize:11, marginTop:3 }}>Clic para adjuntar · o pega con <kbd style={{ background:"#e2e8f0", borderRadius:4, padding:"1px 5px", fontFamily:"monospace", fontSize:10 }}>Ctrl+V</kbd></div>
              </div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={onFileChange} />

            {analisis&&(
              <div style={{ borderRadius:10, padding:"12px 14px", marginBottom:12, fontSize:12, background:analisis.es_comprobante?"#f0fdf4":"#fef2f2", border:`1px solid ${analisis.es_comprobante?"#bbf7d0":"#fecaca"}` }}>
                {analisis.es_comprobante?(<>
                  <div style={{ fontWeight:800, color:T.green, marginBottom:8 }}>✅ Comprobante detectado</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"5px 12px" }}>
                    <div><span style={{ color:T.slate }}>Banco </span><strong>{analisis.banco}</strong></div>
                    <div><span style={{ color:T.slate }}>Monto </span><strong>S/ {analisis.monto}</strong></div>
                    {analisis.fecha&&<div><span style={{ color:T.slate }}>Fecha </span>{analisis.fecha}</div>}
                    {analisis.referencia&&<div><span style={{ color:T.slate }}>Op. </span>{analisis.referencia}</div>}
                  </div>
                </>):<div style={{ color:T.red, fontWeight:600 }}>❌ No es comprobante de pago válido</div>}
              </div>
            )}

            <div style={{ display:"grid", gap:10, marginBottom:14 }}>
              <div><label style={S.label}>Factura a pagar</label>
                <select style={S.select} value={formPago.idfactura} onChange={e=>setFormPago(p=>({...p,idfactura:e.target.value}))}>
                  <option value="">— Seleccionar factura —</option>
                  {facturas.filter(f=>!ESTADOS_IGNORAR.includes(f.estado)).map(f=>(
                    <option key={f.idfactura||f.id} value={f.idfactura||f.id}>#{f.idfactura||f.id} · S/ {Number(f.total||f.monto||0).toFixed(2)} · {f.vencimiento}</option>
                  ))}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={S.label}>Forma de pago</label>
                  <select style={S.select} value={formPago.pasarela} onChange={e=>setFormPago(p=>({...p,pasarela:e.target.value}))}>
                    {(PASARELAS[cliente?.empresa] || PASARELAS.americanet).map(p => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div><label style={S.label}>Monto (S/)</label>
                  <input style={S.input} type="number" step="0.01" value={formPago.monto} onChange={e=>setFormPago(p=>({...p,monto:e.target.value}))} placeholder="0.00" />
                </div>
              </div>
            </div>
            <button onClick={registrarPago} disabled={pagando||!formPago.idfactura||!formPago.monto} className="sb-btn-action"
              style={{ ...S.btn(pagando||!formPago.idfactura||!formPago.monto?T.muted:T.green), opacity:pagando||!formPago.idfactura||!formPago.monto?0.55:1 }}>
              {pagando?"Registrando...":"✅ Confirmar pago"}
            </button>
            {convId&&<div style={{ color:T.muted, fontSize:10, textAlign:"center", marginTop:6 }}>Confirmación automática al cliente vía Chatwoot</div>}
          </div>
        )}

        {/* ══ TAB: PRÓRROGA ══ */}
        {tab==="prorroga" && (
          <div style={{ ...S.card, padding:"16px 18px" }}>
            <div style={{ fontWeight:800, fontSize:13, color:T.navy, marginBottom:14 }}>Prórroga de pago</div>
            {prorrando&&<div style={{ color:T.muted, fontSize:12, textAlign:"center", padding:20 }}>Verificando elegibilidad...</div>}
            {!prorrando&&!prorrInfo&&<div style={{ color:T.muted, fontSize:12, textAlign:"center", padding:20 }}>Sin facturas pendientes para prórroga.</div>}
            {prorrInfo&&(()=>{
              const corteStr = new Date(prorrInfo.corte).toISOString().split("T")[0];
              const maxStr   = new Date(new Date(prorrInfo.corte).getTime() + prorrInfo.diasMax * 86400000).toISOString().split("T")[0];
              // Días disponibles para botones rápidos
              const diasOpciones = Array.from({ length: prorrInfo.diasMax }, (_, i) => {
                const d = new Date(prorrInfo.corte); d.setDate(d.getDate() + i + 1);
                return { dias: i + 1, fecha: d.toISOString().split("T")[0],
                  label: d.toLocaleDateString("es-PE", { day:"2-digit", month:"short" }) };
              });
              const diasSelec = prorrForm.fecha
                ? Math.round((new Date(prorrForm.fecha+"T00:00:00") - new Date(prorrInfo.corte)) / 86400000)
                : 0;
              return (<>
                {/* Info factura */}
                <div style={{ background:"#faf5ff", border:"1px solid #e9d5ff", borderRadius:12, padding:"12px 16px", marginBottom:14 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 14px" }}>
                    {[["Factura",`#${prorrInfo.idfactura}`],["Vencimiento",prorrInfo.vencimiento],
                      ["Días máx.",`${prorrInfo.diasMax} días`],["Límite",prorrInfo.fechaMaxStr]].map(([l,v])=>(
                      <div key={l}><div style={S.label}>{l}</div><div style={{ ...S.val, fontSize:12, color:l.includes("Días")||l==="Límite"?T.purple:T.navy }}>{v}</div></div>
                    ))}
                  </div>
                  {prorrInfo.suspendido&&<div style={{ marginTop:8, background:"#fef3c7", borderRadius:8, padding:"6px 10px", fontSize:11, color:"#92400e", fontWeight:700 }}>⚠️ Suspendido — máx. 3 días</div>}
                </div>

                {/* Calendario */}
                <div style={{ marginBottom:12 }}>
                  <label style={S.label}>Selecciona la fecha límite de pago</label>
                  <input style={{ ...S.input, fontSize:14, padding:"10px 12px", cursor:"pointer" }}
                    type="date" min={corteStr} max={maxStr} value={prorrForm.fecha}
                    onChange={e => setProrrForm({ fecha: e.target.value })} />
                  {prorrForm.fecha && (
                    <div style={{ marginTop:6, fontSize:11, color:T.purple, fontWeight:700, textAlign:"center" }}>
                      +{diasSelec} día{diasSelec !== 1 ? "s" : ""} desde el corte · hasta el {new Date(prorrForm.fecha+"T00:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"long",year:"numeric"})}
                    </div>
                  )}
                </div>

                {/* Botones rápidos por día */}
                <div style={{ marginBottom:14 }}>
                  <div style={S.label}>Acceso rápido</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {diasOpciones.map(({ dias, fecha, label }) => (
                      <button key={dias} onClick={() => setProrrForm({ fecha })}
                        style={{ background: prorrForm.fecha === fecha ? T.purple : T.bg,
                          color: prorrForm.fecha === fecha ? "#fff" : T.slate,
                          border: `1px solid ${prorrForm.fecha === fecha ? T.purple : T.border}`,
                          borderRadius:8, padding:"6px 10px", fontSize:11, fontWeight:700,
                          cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}>
                        +{dias}d · {label}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={registrarProrroga} disabled={prorrando||!prorrForm.fecha} className="sb-btn-action"
                  style={{ ...S.btn(prorrando||!prorrForm.fecha?T.muted:T.purple), opacity:prorrando||!prorrForm.fecha?0.55:1 }}>
                  {prorrando?"Registrando...":"⏳ Confirmar prórroga"}
                </button>
                {convId&&<div style={{ color:T.muted, fontSize:10, textAlign:"center", marginTop:6 }}>El cliente será notificado automáticamente</div>}
              </>);
            })()}
          </div>
        )}

        {/* ══ TAB: NUEVA FACTURA ══ */}
        {tab==="nueva" && (
          <div style={{ ...S.card, padding:"16px 18px" }}>
            <div style={{ fontWeight:800, fontSize:13, color:T.navy, marginBottom:4 }}>🧾 Nueva factura</div>
            <div style={{ color:T.muted, fontSize:11, marginBottom:14 }}>Crear factura para <strong style={{ color:T.navy }}>{primerNombre(cliente.nombre)}</strong> #{cliente.mikrowisp_id}</div>

            <div style={{ background:T.bg, borderRadius:10, padding:"12px 14px", marginBottom:14, border:`1px solid ${T.border}`, display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 14px", fontSize:12 }}>
              {[["Cliente", cliente.nombre?.split(",")[0]||cliente.nombre],["ID", `#${cliente.mikrowisp_id}`],["Nodo", cliente.nodo],["Empresa", cliente.empresa]].map(([l,v])=>(
                <div key={l}><div style={S.label}>{l}</div><div style={{ ...S.val, fontSize:12, textTransform:"capitalize" }}>{v}</div></div>
              ))}
            </div>

            <div style={{ marginBottom:10 }}>
              <label style={S.label}>Fecha de vencimiento</label>
              <input style={S.input} type="date" value={factForm.vencimiento} min={new Date().toISOString().split("T")[0]}
                onChange={e=>setFactForm(p=>({...p,vencimiento:e.target.value}))} />
            </div>

            <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
              {[
                ["Fin de mes", (()=>{ const d=new Date(); d.setMonth(d.getMonth()+1,0); return d.toISOString().split("T")[0]; })()],
                ["+30 días",   (()=>{ const d=new Date(); d.setDate(d.getDate()+30); return d.toISOString().split("T")[0]; })()],
                ["+15 días",   (()=>{ const d=new Date(); d.setDate(d.getDate()+15); return d.toISOString().split("T")[0]; })()],
              ].map(([lbl,val])=>(
                <button key={lbl} onClick={()=>setFactForm(p=>({...p,vencimiento:val}))}
                  style={{ background:factForm.vencimiento===val?T.blue:T.bg, color:factForm.vencimiento===val?"#fff":T.slate,
                    border:`1px solid ${factForm.vencimiento===val?T.blue:T.border}`, borderRadius:8, padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  {lbl}
                </button>
              ))}
            </div>

            <button onClick={crearFactura} disabled={creando||!factForm.vencimiento} className="sb-btn-action"
              style={{ ...S.btn(creando||!factForm.vencimiento?T.muted:T.blue), opacity:creando||!factForm.vencimiento?0.55:1 }}>
              {creando?"Creando factura...":"🧾 Crear factura de servicios"}
            </button>
            <div style={{ color:T.muted, fontSize:10, textAlign:"center", marginTop:6 }}>Se registrará en Mikrowisp</div>
          </div>
        )}

        {/* ══ FOOTER ══ */}
        <div style={{ textAlign:"center", padding:"8px 0 16px" }}>
          <a href={`${cliente.empresa==="dimfiber"?"http://app.dimfiber.com":"https://americanet.club"}/index.php?r=clientes/view&id=${cliente.mikrowisp_id}`}
            target="_blank" rel="noopener noreferrer"
            style={{ color:T.muted, fontSize:11, textDecoration:"none", fontWeight:500 }}>
            Ver perfil completo en Mikrowisp ↗
          </a>
        </div>

      </>)}

      </div>)}
    </div>
  );
}
