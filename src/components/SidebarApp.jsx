import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import logoAmericanet from "../assets/americanet-logo-new-trimmed.png";
import { CreditCard, Trash2, XCircle, RefreshCw, Zap, MapPin, Send, FileText } from "lucide-react";

// ─── Constantes ───────────────────────────────────────────────────────────────
const CW_BASE    = "https://chat.americanet.club";
const CW_TOKEN   = "Wm9K5UiCrfJPcgFJrWgxftYv";
const OAI_KEY    = String(import.meta.env.VITE_OPENAI_KEY || "").trim();
const PROXY_URL  = "https://n8n.americanet.space/webhook/sidebar-proxy";
const DIAGNO_BASE = import.meta.env.PROD ? "https://amnet-diagno.0lthka.easypanel.host" : "";
const MKW_TOKEN       = "LzNXSERnUHBMMS91b0NzUGFTVkFkZz09";
const MKW_NOD04_TOKEN = "THlaZzQ2UEQ2dHEyUjFBTkdIQ2UzUT09";
async function mkwDirect(esDim, endpoint, body) {
  const base = DIAGNO_BASE || "";
  const url = esDim ? `${base}/api/mikrowisp-nod04/${endpoint}` : `${base}/api/mikrowisp/${endpoint}`;
  const token = esDim ? MKW_NOD04_TOKEN : MKW_TOKEN;
  const res = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ token, ...body }) });
  const json = await res.json().catch(()=>({}));
  return json;
}
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
  americanet: ["Depósito bancario","Transferencia Bancaria","Efectivo Oficina/Sucursal","Walter Pinto","Americanet"],
  dimfiber:   ["Pagos DIM","Transferencia Bancaria","Aplicaciones bancarias","Efectivo Oficina/Sucursal","Americanet"],
  nod06:      ["Depósito bancario","Transferencia Bancaria","Efectivo Oficina/Sucursal","Walter Pinto","Americanet"],
};

const DIM_NODOS = new Set(["nod_04","nod_05","nod_06"]);
const empresaPorNodo = (n) => DIM_NODOS.has(String(n||"").trim().toLowerCase()) ? "DIM" : "Americanet";
const OLT_SSH_API = String(import.meta.env.VITE_OLT_SSH_API || "https://amnet-olt-signal.0lthka.easypanel.host").trim().replace(/\/$/, "");
const NODOS_OLT_SSH = new Set(["Nod_04", "Nod_05", "Nod_06"]);
const NODOS_BASE = ["Nod_01","Nod_02","Nod_03","Nod_04","Nod_05","Nod_06"];

const NODO_USUARIO_RULES = {
  NOD_01: { prefix:"user",     start:801, suffix:"@americanet", pad:0 },
  NOD_02: { prefix:"usuario_", start:600, suffix:"",            pad:0 },
  NOD_03: { prefix:"",         start:501, suffix:"@americanet", pad:4 },
  NOD_04: { prefix:"user",     start:467, suffix:"@fiber",      pad:0 },
  NOD_05: { prefix:"",         start:1,   suffix:"@dim",        pad:3 },
  NOD_06: { prefix:"",         start:130, suffix:"@amnet",      pad:0 },
};
const NODO_PASSWORD_RULES = {
  NOD_01:"madrid0021", NOD_02:"speedy2000", NOD_03:"aqp0021",
  NOD_04:"uchumayo0021", NOD_05:"selva0021", NOD_06:"apipa0021",
};
const normalizeNodoKey = (v="") => String(v||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"_");
function listarUsuariosParaNodo(nodo="", usados=[], cantidad=8) {
  const key = normalizeNodoKey(nodo);
  const rule = NODO_USUARIO_RULES[key];
  if (!rule) return [];
  const prefix=String(rule.prefix||""), suffix=String(rule.suffix||""), base=Number(rule.start||1), pad=Number(rule.pad||0);
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(\\d+)${suffix.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,"i");
  const usadosSet = new Set((usados||[]).map(v=>String(v||"").trim().toLowerCase()));
  const nums = (usados||[]).map(v=>{ const m=String(v||"").match(pattern); return m?Number(m[1]):NaN; }).filter(Number.isFinite);
  const maxUsado = nums.length ? Math.max(...nums) : base-1;
  const resultado=[]; let n=Math.max(base,maxUsado+1);
  while (resultado.length < cantidad) {
    const numText = pad>0 ? String(n).padStart(pad,"0") : String(n);
    const candidate = `${prefix}${numText}${suffix}`;
    resultado.push({ usuario:candidate, ocupado: usadosSet.has(candidate.toLowerCase()) });
    n++; if (n>base+9999) break;
  }
  return resultado;
}
const DNI_API_KEY = "cGVydWRldnMucHJvZHVjdGlvbi5maXRjb2RlcnMuNjllMTNmNDYxYzlhY2M1YmI0MjI2YTcx";

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
  .sb-hora-num::-webkit-outer-spin-button, .sb-hora-num::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
  .sb-hora-num[type=number] { -moz-appearance:textfield; }
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
  const [suspendiendo, setSuspendiendo] = useState(false);
  const [editForm,     setEditForm]     = useState({ nombre:"", movil:"", telefono:"", correo:"", cedula:"", direccion_principal:"" });
  const [guardando,    setGuardando]    = useState(false);
  // Comprobante Vision
  const [imgFile,  setImgFile]    = useState(null);
  const [imgPrev,  setImgPrev]    = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis]   = useState(null);
  const fileRef = useRef();
  // Prórroga
  const [prorrForm,   setProrrForm]   = useState({ fecha: "", calMes: "" });
  const [prorrInfo,   setProrrInfo]   = useState(null);
  const [prorrando,   setProrrando]   = useState(false);
  const [prorrActiva, setProrrActiva] = useState(null); // { idfactura, fecha } tras confirmar
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
  const [diagLoad,       setDiagLoad]       = useState(false);
  const [diagResult,     setDiagResult]     = useState(null);
  const [diagError,      setDiagError]      = useState(null);
  const [showDiag,       setShowDiag]       = useState(false);
  const [showDiagDetail, setShowDiagDetail] = useState(false);
  const [showSenalDetail,setShowSenalDetail]= useState(false);
  const [autoLoad,       setAutoLoad]       = useState(0);
  // Agente logueado (detectado de Chatwoot o seleccionado manualmente)
  const [agente, setAgente] = useState(() => getStoredAgente());
  // Búsqueda flexible cuando teléfono no encontrado
  const [dniBusq,      setDniBusq]      = useState("");
  const [dniBuscando,  setDniBuscando]  = useState(false);
  const [dniResultados,setDniResultados]= useState([]); // lista de resultados
  const [dniSel,       setDniSel]       = useState(null); // row seleccionado
  const [agregando,    setAgregando]    = useState(false);
  // Crear orden desde sidebar
  const [ordenForm,   setOrdenForm]   = useState({ ordenTipo:"ORDEN DE SERVICIO", tipoActuacion:"Incidencia Internet", fechaActuacion:new Date().toISOString().split("T")[0], hora:"", prioridad:"Normal", tecnico:"", autorOrden:"", descripcion:"", coordenadas:"", nombre:"", dni:"", celular:"", email:"", direccion:"", contacto:"", empresa:"Americanet", nodo:"", velocidad:"", precioPlan:"", usuarioNodo:"", passwordUsuario:"", snOnu:"", cajaNap:"", solicitarPago:"SI", montoCobrar:"" });
  const [showOrdenNuevo,    setShowOrdenNuevo]    = useState(false);
  const [buscandoDniNew,    setBuscandoDniNew]    = useState(false);
  const [usuariosNodo,      setUsuariosNodo]      = useState([]);
  const [showUsuarioDrop,   setShowUsuarioDrop]   = useState(false);
  const [buscandoCoords,    setBuscandoCoords]    = useState(false);
  const [coordsLista,       setCoordsLista]       = useState([]);
  const [creandoOrden, setCreandoOrden] = useState(false);
  const [ordenCreada,  setOrdenCreada]  = useState(null);
  const [tecnicosLista, setTecnicosLista] = useState([]);
  const [autorLista,    setAutorLista]    = useState([]);
  const [showOrdenMap,  setShowOrdenMap]  = useState(false);
  // Editar servicio
  const [perfiles,      setPerfiles]      = useState([]);
  const [loadingPerf,   setLoadingPerf]   = useState(false);
  const [errorPerf,     setErrorPerf]     = useState(false);
  const [svcForm,       setSvcForm]       = useState({ id_perfil:"", precio:"", pppuser:"", ppppass:"", ip:"" });
  const [guardandoSvc,  setGuardandoSvc]  = useState(false);
  const [ordenesCliente,      setOrdenesCliente]      = useState([]);
  const [liquidacionesCliente,setLiquidacionesCliente] = useState([]);
  const [historialLoad, setHistorialLoad] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [notasCliente,  setNotasCliente]  = useState([]);
  const [showNotas,     setShowNotas]     = useState(false);
  const [notaNueva,     setNotaNueva]     = useState("");
  const [notaGuardando, setNotaGuardando] = useState(false);
  // ── Mini-wizard Mikrowisp (sidebar) ──────────────────────────────────────
  const [mwOpen,         setMwOpen]         = useState(false);
  const [mwBusqVal,      setMwBusqVal]      = useState("");
  const [mwBusqDesde,    setMwBusqDesde]    = useState("");
  const [mwBusqHasta,    setMwBusqHasta]    = useState("");
  const [mwBusqLoad,     setMwBusqLoad]     = useState(false);
  const [mwBusqEliminados, setMwBusqEliminados] = useState(false);
  const [mwResultados,   setMwResultados]   = useState([]);
  const [mwCliSupa,     setMwCliSupa]     = useState(null);   // cliente encontrado en Supabase
  const [mwStep,        setMwStep]        = useState(0);      // 0=buscar 1=agregar 2=servicio 3=ok
  const [mwAgregando,   setMwAgregando]   = useState(false);
  const [mwMkwId,       setMwMkwId]       = useState(null);
  const [mwPerfiles,    setMwPerfiles]    = useState([]);
  const [mwRedes,       setMwRedes]       = useState([]);
  const [mwPlantillas,  setMwPlantillas]  = useState([]);
  const [mwPlantillaId, setMwPlantillaId] = useState(2);
  const [mwForm,        setMwForm]        = useState({ id_perfil:"", id_red_ipv4:"", userppp:"", passppp:"", costo:"", fecha_instalacion:"", coordenadas:"", ip:"" });
  const [mwIpLoad,      setMwIpLoad]      = useState(false);
  const [mwWizardLiq,   setMwWizardLiq]   = useState([]);
  const [mwCreandoSvc,  setMwCreandoSvc]  = useState(false);
  const [mwSvcOk,       setMwSvcOk]       = useState(false);
  const [mwMsg,         setMwMsg]         = useState("");
  // Paso 3 — Facturas
  const [mwFactSub,     setMwFactSub]     = useState(1);   // 1=pago inst, 2=prorrateo
  const [mwFactModo,    setMwFactModo]    = useState("normal"); // normal | libre
  const [mwFactMonto,   setMwFactMonto]   = useState("");
  const [mwFactVence,   setMwFactVence]   = useState("");
  const [mwFactPagada,  setMwFactPagada]  = useState(true);
  const [mwFactPasarela,setMwFactPasarela]= useState("Efectivo Oficina/Sucursal");
  const [mwFactDesc,    setMwFactDesc]    = useState("");
  const [mwFactCreando, setMwFactCreando] = useState(false);
  const [mwFactDone,    setMwFactDone]    = useState(false);
  const [mwProrrFecha,  setMwProrrFecha]  = useState("");
  const [mwProrrVence,  setMwProrrVence]  = useState("");
  const [mwProrrPrec,   setMwProrrPrec]   = useState("");
  const [mwProrrMonto,  setMwProrrMonto]  = useState("");
  // Paso 4 — Sync
  const [mwSyncLoad,    setMwSyncLoad]    = useState(false);
  const [mwSyncDone,    setMwSyncDone]    = useState(false);
  const [mwSmsSent,     setMwSmsSent]     = useState(false);

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

  function copiarAlPortapapeles(valor, etiqueta = "Valor") {
    if (!valor) return;
    navigator.clipboard.writeText(String(valor)).then(
      () => notify(`${etiqueta} copiado: ${valor}`, true),
      () => notify("No se pudo copiar", false)
    );
  }

  function resetEstado() {
    setCliente(null); setDetalle(null); setFacturas([]);
    setAnalisis(null); setImgFile(null); setImgPrev(null);
    setProrrInfo(null); setProrrForm({ fecha: "" });
    setSnOnu(null); setNodoReal(null); setSenal(null);
    setShowMap(false); setDiagResult(null); setDiagError(null); setShowDiag(false); setShowDiagDetail(false); setShowSenalDetail(false); setAutoLoad(0);
    setDniResultados([]); setDniSel(null); setDniBusq("");
    setOrdenCreada(null);
    setOrdenesCliente([]); setLiquidacionesCliente([]);
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

    // Señal de carga completa para auto-consulta
    setAutoLoad(Date.now());

    // Cargar historial de órdenes y liquidaciones del cliente
    if (row.cedula) { cargarHistorialOrdenes(row.cedula); cargarNotas(row.cedula); }
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

      // Enviar confirmación al cliente vía n8n (igual que prórroga)
      if (contact?.phone_number) {
        const nombreRaw = cliente?.nombre || "";
        const nombreFmt = nombreRaw
          ? (nombreRaw.includes(",")
            ? nombreRaw.split(",").reverse().join(" ").trim()
            : nombreRaw).toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
          : "cliente";
        const montoStr  = Number(formPago.monto).toFixed(2);
        const banco     = formPago.pasarela || "banco";
        const fecha     = analisis?.fecha || new Date().toLocaleDateString("es-PE");
        const ref       = analisis?.referencia ? `\n🔖 Op. ${analisis.referencia}` : "";

        // Obtener URL del PDF de la boleta vía GetInvoice
        let urlPdf = "";
        try {
          const invRes = await mkwProxy(Number(cliente.nodo), "GetInvoice", {
            idfactura: parseInt(formPago.idfactura, 10),
          }, tkn);
          urlPdf = invRes?.factura?.urlpdf || invRes?.urlpdf || "";
        } catch { /* silencioso */ }

        const pdfLinea = urlPdf ? `\n\n📄 *Boleta:* ${urlPdf}` : "";
        const texto = `*PAGO VALIDADO* ✅\n\nHola ${nombreFmt}, tu pago de *S/ ${montoStr}* (${banco}) del ${fecha} ha sido verificado con éxito.${ref}${pdfLinea}\n\nGracias por tu confianza. 💙\nTu servicio continúa activo.`;
        await fetch(PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: "ChatwootMessage",
            payload: { phone: contact.phone_number, message: texto, account_id: acctId || "1" },
          }),
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

  // ── Cargar perfiles/planes disponibles ───────────────────────────────────
  async function cargarPerfiles(force = false) {
    if ((perfiles.length || loadingPerf) && !force) return;
    setLoadingPerf(true);
    setErrorPerf(false);
    try {
      const tkn = getToken(cliente.empresa, agente);
      const res = await mkwProxy(Number(cliente.nodo), "GetPerfiles", {}, tkn);
      const lista = res?.datos || res?.perfiles || (Array.isArray(res) ? res : []);
      if (!lista.length) { setErrorPerf(true); }
      else setPerfiles(lista.filter(p => p.estado === "ACTIVADO"));
    } catch { setErrorPerf(true); }
    setLoadingPerf(false);
  }

  // ── Editar servicio (plan, PPPoE, IP) ─────────────────────────────────────
  async function editarServicio() {
    if (!cliente || !svcForm.id_perfil) return notify("Selecciona un plan", false);
    setGuardandoSvc(true);
    try {
      const tkn = getToken(cliente.empresa, agente);
      const svc = detalle?._servicio;
      const payload = {
        id_servicio: svc.id,
        id_router:   Number(svc.nodo),
        id_perfil:   Number(svcForm.id_perfil),
      };
      if (svcForm.pppuser.trim()) payload.userppp = svcForm.pppuser.trim();
      if (svcForm.ppppass.trim()) payload.passppp = svcForm.ppppass.trim();
      if (svcForm.ip.trim())      payload.ip      = svcForm.ip.trim();
      const res = await mkwProxy(Number(cliente.nodo), "EditService", payload, tkn);
      const ok = (res?.estado || res?.code || "").toString().toLowerCase() === "exito"
               || (res?.estado || res?.code || "").toString() === "200";
      if (!ok) { notify("Error: " + (res?.mensaje || res?.message || JSON.stringify(res)), false); }
      else {
        notify("✅ Servicio actualizado correctamente");
        await buscarCliente(contact?.phone_number || "");
        setTab("info");
      }
    } catch(e) { notify("Error: " + e.message, false); }
    setGuardandoSvc(false);
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

  // ── Suspender servicio (cliente activo) ───────────────────────────────────
  async function suspenderServicio() {
    if (!window.confirm(`¿Suspender el servicio de ${cliente.nombre}?\nEl cliente pasará a estado SUSPENDIDO.`)) return;
    setSuspendiendo(true);
    try {
      const tkn = getToken(cliente.empresa, agente);
      const res = await mkwProxy(Number(cliente.nodo), "SuspendService", { idcliente: parseInt(cliente.mikrowisp_id, 10) }, tkn);
      const ok  = (res?.estado || "").toLowerCase() === "exito";
      if (!ok) { notify("Error: " + (res?.mensaje || res?.message || JSON.stringify(res)), false); }
      else { notify("⚠️ Servicio suspendido"); await buscarCliente(contact?.phone_number || ""); }
    } catch(e) { notify("Error: " + e.message, false); }
    setSuspendiendo(false);
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
  // ── MW wizard helpers ─────────────────────────────────────────────────────
  const MW_NODO_MAP  = { "Nod_01":1, "Nod_02":2, "Nod_03":10, "Nod_04":5, "Nod_06":11 };
  const MW_NODOS_OK  = ["Nod_01","Nod_03","Nod_04"];
  const mwEsDim = (nodo) => ["Nod_04","Nod_05","Nod_06"].includes(String(nodo||""));

  async function mwBuscarEnClientes() {
    const q = mwBusqVal.trim();
    const desde = mwBusqDesde.trim();
    const hasta = mwBusqHasta.trim();
    if (!q && !desde && !hasta) return setMwMsg("Ingresa DNI, nombre o rango de fechas.");
    setMwBusqLoad(true); setMwCliSupa(null); setMwResultados([]); setMwMsg("");
    try {
      let query = supabase.from("clientes")
        .select("id,nombre,dni,celular,email,direccion,nodo,velocidad,precio_plan,fecha_registro,ubicacion,usuario_nodo,password_usuario,en_mikrowisp")
        .in("nodo", MW_NODOS_OK)
        .order("fecha_registro", { ascending: false })
        .limit(50);
      if (!mwBusqEliminados) query = query.or("en_mikrowisp.is.null,en_mikrowisp.eq.false");
      else query = query.eq("en_mikrowisp", true);
      if (q) {
        const isNum = /^\d+$/.test(q);
        query = isNum ? query.ilike("dni", `%${q}%`) : query.ilike("nombre", `%${q}%`);
      }
      if (desde) query = query.gte("fecha_registro", desde);
      if (hasta) query = query.lte("fecha_registro", hasta + "T23:59:59");
      const { data } = await query;
      if (!data?.length) { setMwMsg("Sin pendientes para los filtros aplicados."); }
      else if (data.length === 1 && q) { mwSeleccionarCliente(data[0]); }
      else { setMwResultados(data); }
    } catch(e) { setMwMsg("Error: " + e.message); }
    setMwBusqLoad(false);
  }

  function mwSeleccionarCliente(c) {
    setMwCliSupa(c);
    setMwResultados([]);
    setMwWizardLiq([]);
    setMwForm({ id_perfil:"", id_red_ipv4:"", userppp: c.usuario_nodo||"", passppp: c.password_usuario||"",
      costo: String(c.precio_plan||""), fecha_instalacion: c.fecha_registro ? String(c.fecha_registro).split("T")[0] : new Date().toISOString().split("T")[0],
      coordenadas: c.ubicacion||"", ip:"" });
    setMwStep(1);
    // Cargar liquidaciones del cliente
    const dni = String(c.dni||"").replace(/\D/g,"");
    if (dni) {
      supabase.from("liquidaciones")
        .select("codigo,tipo_actuacion,fecha_liquidacion,tecnico_liquida,monto_cobrado,medio_pago,cobro_realizado")
        .eq("dni", dni).order("fecha_liquidacion", { ascending: false }).limit(5)
        .then(({ data }) => setMwWizardLiq(data || []));
    }
  }

  async function mwAgregarMkw() {
    if (!mwCliSupa) return;
    const dni = String(mwCliSupa.dni||"").replace(/\D/g,"");
    if (!dni) return setMwMsg("El cliente no tiene DNI.");
    setMwAgregando(true); setMwMsg("");
    const extraerId = (r) =>
      r?.datos?.[0]?.id || r?.data?.[0]?.id ||
      r?.idcliente || r?.id_cliente || r?.id ||
      r?.datos?.id || r?.data?.id;
    try {
      const esDim = mwEsDim(mwCliSupa.nodo);
      // Verificar si ya existe (igual que App.jsx: directo al backend diagno)
      const check = await mkwDirect(esDim, "GetClientsDetails", { cedula: dni });
      const existe = extraerId(check);
      if (existe) {
        setMwMkwId(existe);
        await mwCargarPerfiles(mwCliSupa.nodo, existe);
        setMwStep(2);
        return;
      }
      // Crear cliente nuevo
      const add = await mkwDirect(esDim, "NewUser", {
        nombre:               String(mwCliSupa.nombre||"").trim(),
        cedula:               dni,
        correo:               String(mwCliSupa.email||"").trim(),
        telefono:             "",
        movil:                String(mwCliSupa.celular||"").trim(),
        direccion_principal:  String(mwCliSupa.direccion||"").trim(),
        codigo:               dni,
      });
      if (add?.estado === "error") throw new Error(add?.mensaje || "Error Mikrowisp");
      let nuevoId = extraerId(add);
      // Si no devuelve ID, re-buscar (cliente ya existía)
      if (!nuevoId) {
        const retry = await mkwDirect(esDim, "GetClientsDetails", { cedula: dni });
        nuevoId = extraerId(retry);
      }
      if (!nuevoId) throw new Error(add?.mensaje || add?.message || "Sin ID de respuesta");
      const updateDatos = { codigo: dni };
      if (mwCliSupa.direccion) updateDatos.direccion_principal = String(mwCliSupa.direccion).trim();
      if (mwCliSupa.email)     updateDatos.correo              = String(mwCliSupa.email).trim();
      await mkwDirect(esDim, "UpdateUser", { idcliente: nuevoId, datos: updateDatos });
      setMwMkwId(nuevoId);
      if (mwCliSupa.id) supabase.from("clientes").update({ en_mikrowisp: true }).eq("id", mwCliSupa.id).then(()=>{});
      await mwCargarPerfiles(mwCliSupa.nodo, nuevoId);
      setMwStep(2);
    } catch(e) { setMwMsg("Error: " + e.message); }
    setMwAgregando(false);
  }

  async function mwCargarPerfiles(nodo, mkwId) {
    const nodoNum = MW_NODO_MAP[nodo] ?? 1;
    const esDim = mwEsDim(nodo);
    const n = esDim ? 5 : nodoNum;
    const [pR, rR, plR] = await Promise.all([
      mkwProxy(n, "GetPerfiles", {}),
      mkwProxy(n, "GetRedesIpv4", { id_router: nodoNum }),
      mkwProxy(n, "GetPlantillasFacturacion", {}),
    ]);
    const perfs = (pR?.datos || pR?.perfiles || (Array.isArray(pR)?pR:[])).filter(p=>p.estado==="ACTIVADO");
    const redes = rR?.datos || (Array.isArray(rR)?rR:[]);
    const plants = plR?.plantillas || (Array.isArray(plR)?plR:[]);
    setMwPerfiles(perfs); setMwRedes(redes); setMwPlantillas(plants);
    if (plants.length) setMwPlantillaId(plants[0].id);
    if (redes.length) setMwForm(f=>({...f, id_red_ipv4: String(redes[redes.length-1].id)}));
    setMwMkwId(mkwId);
  }

  async function mwBuscarIpMikrotik() {
    const pppuser = mwForm.userppp;
    if (!pppuser) return;
    const nodo = mwCliSupa?.nodo || "Nod_01";
    setMwIpLoad(true);
    try {
      const res = await fetch(`${DIAGNO_BASE}/api/diagnostico-servicio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo, userPppoe: pppuser, dni: "", cliente: "" }),
      });
      const json = await res.json().catch(() => ({}));
      const ip = json?.mikrotik?.ip || "";
      if (ip) setMwForm(f => ({ ...f, ip }));
      else setMwMsg("No se encontró IP activa en MikroTik para este usuario.");
    } catch { setMwMsg("Error al consultar MikroTik."); }
    setMwIpLoad(false);
  }

  async function mwCrearServicio() {
    if (!mwMkwId || !mwForm.id_perfil || !mwForm.id_red_ipv4) return setMwMsg("Selecciona plan y rango IPv4.");
    setMwCreandoSvc(true); setMwMsg("");
    try {
      const nodo = mwCliSupa?.nodo || "Nod_01";
      const nodoNum = MW_NODO_MAP[nodo] ?? 1;
      const esDim = mwEsDim(nodo);
      const n = esDim ? 5 : nodoNum;
      const payload = { id_cliente: mwMkwId, id_router: nodoNum, id_perfil: Number(mwForm.id_perfil), id_red_ipv4: Number(mwForm.id_red_ipv4) };
      if (mwForm.userppp)           payload.userppp           = mwForm.userppp;
      if (mwForm.passppp)           payload.passppp           = mwForm.passppp;
      if (mwForm.costo)             payload.costo             = Number(mwForm.costo);
      if (mwForm.ip)                payload.ipv4              = [mwForm.ip];
      if (mwForm.coordenadas)       payload.coordenadas       = mwForm.coordenadas;
      if (mwForm.fecha_instalacion) payload.fecha_instalacion = mwForm.fecha_instalacion;
      const res = await mkwProxy(n, "NewService", payload);
      const ok = res?.estado==="exito" || String(res?.code)==="200" || res?.id;
      if (!ok) throw new Error(res?.mensaje || res?.message || "Error al crear servicio");
      // NewService no guarda coordenadas — usar EditService para actualizarlas
      if (mwForm.coordenadas) {
        try {
          const cliDet = await mkwProxy(n, "GetClientsDetails", { idcliente: mwMkwId });
          const svcObj = cliDet?.datos?.[0]?.servicios?.[0] || cliDet?.data?.[0]?.servicios?.[0];
          if (svcObj?.id) {
            await mkwProxy(n, "EditService", {
              id_servicio: svcObj.id,
              id_router:   nodoNum,
              id_perfil:   Number(mwForm.id_perfil),
              id_red_ipv4: Number(mwForm.id_red_ipv4),
              coordenadas: mwForm.coordenadas,
              ...(mwForm.costo ? { costo: Number(mwForm.costo) } : {}),
            }).catch(()=>{});
          }
        } catch { /* coordenadas no críticas */ }
      }
      await mkwProxy(n, "ChangeFacturacionConfig", { id_cliente: mwMkwId, id_plantilla: mwPlantillaId || 2 }).catch(()=>{});
      // Pre-llenar facturas
      const fechaInst = mwForm.fecha_instalacion || new Date().toISOString().split("T")[0];
      setMwFactVence(fechaInst);
      setMwFactMonto(mwForm.costo || String(mwCliSupa?.precio_plan || ""));
      setMwSvcOk(true); setMwStep(3);
    } catch(e) { setMwMsg("Error: " + e.message); }
    setMwCreandoSvc(false);
  }

  async function mwCrearFactura() {
    if (!mwMkwId) return setMwMsg("Sin ID de cliente MW.");
    if (!mwFactMonto || !mwFactVence) return setMwMsg("Ingresa monto y fecha de vencimiento.");
    if (mwFactModo === "libre" && !mwFactDesc) return setMwMsg("Ingresa una descripción para la factura.");
    setMwFactCreando(true); setMwMsg("");
    try {
      const nodo = mwCliSupa?.nodo || "Nod_01";
      const nodoNum = MW_NODO_MAP[nodo] ?? 1;
      const esDim = mwEsDim(nodo);
      const n = esDim ? 5 : nodoNum;
      let idfactura;
      if (mwFactModo === "libre") {
        const d = await mkwProxy(n, "CreateInvoiceLibre", { id_cliente: mwMkwId, fecha_vencimiento: mwFactVence, items: [{ descripcion: mwFactDesc, cantidad: 1, precio: parseFloat(mwFactMonto), impuesto: 18 }] });
        if (!(d?.code === "200" || d?.factura_id)) throw new Error(d?.mensaje || "No se pudo crear la factura");
        idfactura = d?.factura_id;
      } else {
        const d = await mkwProxy(n, "CreateInvoice", { idcliente: mwMkwId, vencimiento: mwFactVence });
        if (!(d?.estado === "exito" || d?.idfactura)) throw new Error(d?.mensaje || "No se pudo crear la factura");
        idfactura = d?.idfactura;
      }
      if (mwFactPagada && idfactura) {
        await mkwProxy(n, "PaidInvoice", { idcliente: mwMkwId, idfactura: parseInt(idfactura, 10), pasarela: mwFactPasarela, cantidad: parseFloat(mwFactMonto) });
      }
      setMwFactDone(true);
      setMwFactSub(2);
      // Pre-llenar prorrateo
      const fechaInst = mwForm.fecha_instalacion || new Date().toISOString().split("T")[0];
      setMwProrrFecha(fechaInst);
      setMwProrrPrec(mwForm.costo || String(mwCliSupa?.precio_plan || ""));
      const instDate = new Date(fechaInst + "T00:00:00");
      let proxVence = new Date(instDate.getFullYear(), instDate.getMonth() + 1, 2);
      if (Math.round((proxVence - instDate) / 86400000) < 10) proxVence = new Date(instDate.getFullYear(), instDate.getMonth() + 2, 2);
      setMwProrrVence(proxVence.toISOString().split("T")[0]);
    } catch(e) { setMwMsg("Error: " + e.message); }
    setMwFactCreando(false);
  }

  async function mwCrearProrrateo() {
    if (!mwMkwId || !mwProrrVence) return setMwMsg("Falta fecha de próximo vencimiento.");
    const montoFinal = parseFloat(mwProrrMonto) || (() => {
      const instDate = new Date((mwProrrFecha || mwForm.fecha_instalacion || new Date().toISOString().split("T")[0]) + "T00:00:00");
      const venceDate = new Date(mwProrrVence + "T00:00:00");
      const prec = parseFloat(mwProrrPrec) || 0;
      if (!prec || venceDate <= instDate) return 0;
      const dias = Math.round((venceDate - instDate) / 86400000);
      const inicio = new Date(venceDate); inicio.setMonth(inicio.getMonth() - 1);
      const periodo = Math.round((venceDate - inicio) / 86400000);
      return periodo > 0 ? Math.round(prec * dias / periodo) : 0;
    })();
    if (!montoFinal) return setMwMsg("No se pudo calcular el monto.");
    setMwFactCreando(true); setMwMsg("");
    try {
      const nodo = mwCliSupa?.nodo || "Nod_01";
      const nodoNum = MW_NODO_MAP[nodo] ?? 1;
      const esDim = mwEsDim(nodo);
      const n = esDim ? 5 : nodoNum;
      const desc = mwCliSupa?.velocidad ? `Prorrateo Plan ${mwCliSupa.velocidad}` : "Prorrateo servicio internet";
      const d = await mkwProxy(n, "CreateInvoiceLibre", { id_cliente: mwMkwId, fecha_vencimiento: mwProrrVence, items: [{ descripcion: desc, cantidad: 1, precio: montoFinal, impuesto: 18 }] });
      if (!(d?.code === "200" || d?.factura_id)) throw new Error(d?.mensaje || "No se pudo crear el prorrateo");
      setMwStep(4);
    } catch(e) { setMwMsg("Error: " + e.message); }
    setMwFactCreando(false);
  }

  async function mwSincronizar() {
    if (!mwMkwId || !mwCliSupa) return;
    setMwSyncLoad(true); setMwMsg("");
    // Mismo NODO_LABEL_FALLBACK que App.jsx (Nod_03=3, no 10)
    const NODO_LABEL_FALLBACK = { "Nod_01":1, "Nod_02":2, "Nod_03":3, "Nod_04":5, "Nod_06":11 };
    try {
      const nodo = mwCliSupa.nodo || "Nod_01";
      const esDim = mwEsDim(nodo);
      const n = esDim ? 5 : (MW_NODO_MAP[nodo] ?? 1);
      const dni = String(mwCliSupa.dni || "").replace(/\D/g, "");
      // 1. Empujar datos Supabase → Mikrowisp (igual que App.jsx post-agregar)
      const datosUpdate = { codigo: dni };
      if (mwCliSupa.nombre)    datosUpdate.nombre              = String(mwCliSupa.nombre).trim();
      if (mwCliSupa.direccion) datosUpdate.direccion_principal = String(mwCliSupa.direccion).trim();
      if (mwCliSupa.email)     datosUpdate.correo              = String(mwCliSupa.email).trim();
      await mkwProxy(n, "UpdateUser", { idcliente: mwMkwId, datos: datosUpdate }).catch(()=>{});
      // 2. Jalar datos desde Mikrowisp por cédula (igual que mkwConsultarCedula en App.jsx)
      const resp = await mkwProxy(n, "GetClientsDetails", { cedula: dni });
      const raw = resp?.datos?.[0] ?? resp?.data ?? resp;
      const d = {
        id:       raw?.idcliente ?? raw?.id ?? mwMkwId,
        cedula:   raw?.cedula ?? dni,
        nombre:   raw?.nombre ?? raw?.name ?? "",
        movil:    raw?.movil ?? raw?.telefono ?? "",
        estado:   raw?.estado ?? "",
        servicios: raw?.servicios ?? [],
      };
      if (!d.id) throw new Error("Mikrowisp no devolvió idcliente");
      // 3. Normalizar teléfono Nod_04 (prefijo 51) igual que App.jsx
      const movilRaw = String(d.movil || "").trim();
      const movil = esDim
        ? movilRaw.split(",").map(t => { const s=t.trim(); return s && !s.startsWith("51") ? "51"+s : s; }).filter(Boolean).join(",")
        : movilRaw;
      // 4. Calcular nodo numérico con mismo fallback que App.jsx
      const nodoServicio = d.servicios?.[0]?.nodo ?? null;
      const nodoFallback = NODO_LABEL_FALLBACK[String(nodo).trim()] ?? null;
      const nodoNum = nodoServicio !== null ? Number(nodoServicio) : (nodoFallback !== null ? Number(nodoFallback) : null);
      // 5. DELETE + INSERT (evita conflictos en índices funcionales, igual que App.jsx)
      let delQ = supabase.from("mikrowisp_clientes").delete().eq("mikrowisp_id", d.id);
      if (nodoNum !== null) delQ = delQ.eq("nodo", nodoNum); else delQ = delQ.is("nodo", null);
      await delQ;
      const row = {
        mikrowisp_id: d.id,
        cedula:       String(d.cedula || "").trim(),
        nombre:       String(d.nombre || "").trim(),
        telefonos:    movil,
        estado:       String(d.estado || "").trim(),
        nodo:         nodoNum,
        updated_at:   new Date().toISOString(),
        agregado_por: String(agente || "").trim() || null,
      };
      const { error } = await supabase.from("mikrowisp_clientes").insert(row);
      if (error) throw new Error(error.message);
      if (mwCliSupa.id) await supabase.from("clientes").update({ en_mikrowisp: true, mikrowisp_sync_ok: true }).eq("id", mwCliSupa.id);
      setMwSyncDone(true);
    } catch(e) { setMwMsg("Error: " + e.message); }
    setMwSyncLoad(false);
  }

  async function mwEnviarSms() {
    if (!mwMkwId || !mwCliSupa) return;
    try {
      const nodo = mwCliSupa.nodo || "Nod_01";
      const nodoNum = MW_NODO_MAP[nodo] ?? 1;
      const esDim = mwEsDim(nodo);
      const n = esDim ? 5 : nodoNum;
      const dni = String(mwCliSupa.dni || "").replace(/\D/g, "");
      const msg = `BIENVENIDA ${String(mwCliSupa.nombre || "").trim()} ${dni} ${dni}`;
      const res = await mkwProxy(n, "NewSMS", { idcliente: mwMkwId, mensaje: msg });
      const ok = res?.estado === "exito" || res?.success === true || String(res?.code) === "200" || res?.id;
      if (ok) {
        setMwSmsSent(true);
        setMwMsg("✓ SMS enviado correctamente");
      } else {
        setMwMsg("⚠ Respuesta inesperada: " + (res?.mensaje || res?.message || JSON.stringify(res)));
      }
    } catch(e) { setMwMsg("Error SMS: " + e.message); }
  }

  function mwReset() {
    setMwOpen(false); setMwBusqVal(""); setMwBusqDesde(""); setMwBusqHasta(""); setMwCliSupa(null); setMwResultados([]); setMwStep(0);
    setMwAgregando(false); setMwMkwId(null); setMwPerfiles([]); setMwRedes([]);
    setMwPlantillas([]); setMwCreandoSvc(false); setMwSvcOk(false); setMwMsg("");
    setMwForm({ id_perfil:"", id_red_ipv4:"", userppp:"", passppp:"", costo:"", fecha_instalacion:"", coordenadas:"" });
    setMwFactSub(1); setMwFactModo("normal"); setMwFactMonto(""); setMwFactVence(""); setMwFactPagada(true);
    setMwFactDesc(""); setMwFactCreando(false); setMwFactDone(false);
    setMwProrrFecha(""); setMwProrrVence(""); setMwProrrPrec(""); setMwProrrMonto("");
    setMwSyncLoad(false); setMwSyncDone(false); setMwSmsSent(false);
  }

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
      let updQ = supabase
        .from("mikrowisp_clientes")
        .update({ telefonos: nuevoTel })
        .eq("mikrowisp_id", dniSel.mikrowisp_id);
      if (dniSel.nodo !== null && dniSel.nodo !== undefined) updQ = updQ.eq("nodo", dniSel.nodo);
      else updQ = updQ.is("nodo", null);
      const { error: updErr } = await updQ;
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

  function fmtUptime(raw) {
    if (!raw) return "—";
    const w = parseInt(raw.match(/(\d+)w/)?.[1] || 0);
    const d = parseInt(raw.match(/(\d+)d/)?.[1] || 0);
    const h = parseInt(raw.match(/(\d+)h/)?.[1] || 0);
    const m = parseInt(raw.match(/(\d+)m/)?.[1] || 0);
    const dias = w * 7 + d;
    const partes = [];
    if (dias > 0) partes.push(`${dias} ${dias === 1 ? "día" : "días"}`);
    if (h > 0)   partes.push(`${h}h`);
    if (m > 0)   partes.push(`${m}m`);
    return partes.length ? partes.join(", ") : "< 1m";
  }

  function fmt12h(fechaStr) {
    if (!fechaStr || fechaStr === "0000-00-00" || fechaStr === "0000-00-00 00:00:00") return "—";
    const d = new Date(fechaStr.replace(" ", "T"));
    if (isNaN(d)) return fechaStr;
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const mes  = meses[d.getMonth()];
    const dia  = d.getDate();
    let h      = d.getHours();
    const min  = String(d.getMinutes()).padStart(2,"0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${mes} ${dia}, ${h}:${min} ${ampm}`;
  }

  // ── Consultar señal ONU ───────────────────────────────────────────────────
  async function consultarSenal() {
    if (!snOnu) return notify("No se encontró SN de ONU para este cliente", false);
    setSenalLoad(true);
    try {
      const esOltSsh = NODOS_OLT_SSH.has(String(nodoReal || ""));
      if (esOltSsh) {
        // Nod_04/05/06 — SSH OLT API
        const params = new URLSearchParams({ sn: snOnu });
        if (nodoReal) params.set("nodo", nodoReal);
        const res = await fetch(`${OLT_SSH_API}/signal?${params}`);
        const json = await res.json().catch(() => ({}));
        if (!json.ok) throw new Error(json.error || "No se pudo obtener señal OLT.");
        setSenal({
          rx: json.rxPower != null ? String(json.rxPower) : "—",
          oltRx: json.txPower != null ? String(json.txPower) : "—",
          estado: "—",
          ts: new Date().toLocaleTimeString(),
        });
      } else {
        // Nod_01/02/03 — SmartOLT via proxy
        const res = await fetch(PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "SmartOltSignal", sn: snOnu }),
        });
        const json = await res.json();
        const base = json?.data;
        const fullStatus = base?.full_status_json || base?.response?.full_status_json || base?.response || base;
        const rx    = fullStatus?.["Optical status"]?.["Rx optical power(dBm)"]         || fullStatus?.["Rx optical power(dBm)"]         || "—";
        const oltRx = fullStatus?.["Optical status"]?.["OLT Rx ONT optical power(dBm)"] || fullStatus?.["OLT Rx ONT optical power(dBm)"] || "—";
        const estado = String(base?.response_code || fullStatus?.onu_status || fullStatus?.status || "—");
        setSenal({ rx: String(rx), oltRx: String(oltRx), estado, ts: new Date().toLocaleTimeString() });
      }
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
      // Extensión hasta fin del mes del corte
      const extDate = new Date(corte.getFullYear(), corte.getMonth() + 1, 0);
      const extStr  = extDate.toISOString().split("T")[0];
      setProrrInfo({ idfactura: factPendiente.idfactura || factPendiente.id, vencimiento: factPendiente.vencimiento, corte: corte.toISOString(), max: max.toISOString(), diasMax, suspendido, fechaMaxStr, extStr });
    } catch(e) { notify("Error: " + e.message, false); }
    setProrrando(false);
  }

  async function registrarProrroga() {
    if (!cliente || !prorrInfo || !prorrForm.fecha) return notify("Selecciona la fecha de prórroga", false);
    setProrrando(true);
    try {
      const fechaStr = prorrForm.fecha;
      const corte      = new Date(prorrInfo.corte);
      const selected   = new Date(fechaStr + "T00:00:00");
      const diffDias   = Math.round((selected - corte) / 86400000);
      const esExt      = diffDias > prorrInfo.diasMax;
      const extDias    = prorrInfo.extStr
        ? Math.round((new Date(prorrInfo.extStr + "T00:00:00") - corte) / 86400000)
        : prorrInfo.diasMax;
      if (diffDias < 1 || diffDias > extDias) {
        notify(`Fecha fuera del rango permitido (máx. hasta fin de mes)`, false);
        setProrrando(false); return;
      }
      const tkn = getToken(cliente.empresa, agente);
      const res = await mkwProxy(Number(cliente.nodo), "PromesaPago", {
        idcliente:   parseInt(cliente.mikrowisp_id, 10),
        idfactura:   parseInt(prorrInfo.idfactura, 10),
        fechalimite: fechaStr,
        descripcion: `Prórroga ${esExt ? "extendida" : "registrada"} por ${agente || "agente"} vía Chatwoot`,
      }, tkn);
      const ok = (res?.estado || res?.result || res?.status || "").toLowerCase() !== "error";
      if (!ok) { notify("Mikrowisp rechazó la prórroga: " + (res?.message || res?.mensaje || ""), false); setProrrando(false); return; }
      notify(`✅ Prórroga registrada hasta ${fechaStr}`);
      if (contact?.phone_number) {
        const nombreRaw = cliente?.nombre || "";
        const nombre = nombreRaw.includes(",")
          ? nombreRaw.split(",")[1].trim().split(" ")[0]
          : nombreRaw.split(" ")[0];
        const nombreFmt = nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase() : "cliente";
        const fechaFormato = new Date(fechaStr + "T00:00:00").toLocaleDateString("es-PE", { day:"2-digit", month:"2-digit", year:"numeric" });
        const texto = `*PRÓRROGA ACEPTADA* ✅\n\nHola ${nombreFmt}, tu prórroga fue aprobada.\nTu servicio se mantiene activo hasta el ${fechaFormato}. Gracias por tu confianza. 💙`;
        await fetch(PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: "ChatwootMessage",
            payload: { phone: contact.phone_number, message: texto, account_id: acctId || "1" },
          }),
        }).catch(() => {});
      }
      setProrrInfo(null);
      setProrrForm({ fecha: "", calMes: "" });
      setTab("info");
    } catch(e) { notify("Error: " + e.message, false); }
    setProrrando(false);
  }

  // ── Historial de órdenes y liquidaciones del cliente ─────────────────────
  async function cargarNotas(dni) {
    if (!dni) return;
    const { data } = await supabase.from("notas_clientes")
      .select("id,nota,autor,created_at")
      .eq("dni", String(dni).replace(/\D/g,""))
      .order("created_at", { ascending: false }).limit(20);
    setNotasCliente(data || []);
  }

  async function guardarNota(dni) {
    const dniLimpio = String(dni || "").replace(/\D/g,"");
    if (!notaNueva.trim() || !dniLimpio) return;
    setNotaGuardando(true);
    const { data, error } = await supabase.from("notas_clientes").insert([{
      dni:    dniLimpio,
      nota:   notaNueva.trim(),
      autor:  agente || "—",
    }]).select("id,nota,autor,created_at").single();
    if (!error && data) { setNotasCliente(prev => [data, ...prev]); setNotaNueva(""); }
    setNotaGuardando(false);
  }

  async function eliminarNota(id) {
    await supabase.from("notas_clientes").delete().eq("id", id);
    setNotasCliente(prev => prev.filter(n => n.id !== id));
  }

  async function cargarHistorialOrdenes(cedula) {
    if (!cedula) return;
    setHistorialLoad(true);
    const [ordRes, liqRes] = await Promise.all([
      supabase.from("ordenes")
        .select("id,codigo,tipo_actuacion,estado,fecha_actuacion,tecnico,autor_orden,descripcion,fecha_creacion")
        .eq("dni", cedula).order("fecha_creacion", { ascending: false }).limit(8),
      supabase.from("liquidaciones")
        .select("codigo,tipo_actuacion,fecha_liquidacion,tecnico_liquida,resultado_final,monto_cobrado,cobro_realizado")
        .eq("dni", cedula).order("fecha_liquidacion", { ascending: false }).limit(8),
    ]);
    if (ordRes.data) setOrdenesCliente(ordRes.data);
    if (liqRes.data) setLiquidacionesCliente(liqRes.data);
    setHistorialLoad(false);
  }

  // ── Cargar técnicos y usuarios activos desde Supabase ────────────────────
  useEffect(() => {
    supabase.from("usuarios").select("nombre,rol,empresa").eq("activo",true).order("nombre")
      .then(({ data }) => {
        if (data?.length) {
          setTecnicosLista(data.filter(u => u.rol === "Tecnico"));
          setAutorLista(data.filter(u => u.rol !== "Tecnico"));
        }
      });
  }, []);

  // ── Pre-llenar coordenadas del servicio cuando cambia el cliente ─────────
  useEffect(() => {
    const coords = detalle?._servicio?.coordenadas;
    if (coords) setOrdenForm(p => ({ ...p, coordenadas: coords }));
  }, [detalle?._servicio?.coordenadas]);

  // ── Auto-consultar señal y diagnóstico cuando todo el cliente esté cargado
  useEffect(() => {
    if (!autoLoad || !cliente) return;
    void consultarDiagnostico();
    if (snOnu) void consultarSenal();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  // ── WhatsApp al cliente al crear orden ───────────────────────────────────
  async function sendWhatsAppOrden(ordenData = {}) {
    try {
      const numero = String(ordenData.celular || "").trim();
      if (!numero) return;
      const empresa = String(ordenData.empresa || "Americanet").trim();
      let waCfg = {};
      try {
        const { data } = await supabase.from("whatsapp_config").select("*").eq("empresa", empresa).maybeSingle();
        if (data) waCfg = data;
        else {
          const raw = localStorage.getItem("whatsapp_config_local");
          if (raw) waCfg = JSON.parse(raw)?.[empresa] || {};
        }
      } catch {
        const raw = localStorage.getItem("whatsapp_config_local");
        try { if (raw) waCfg = JSON.parse(raw)?.[empresa] || {}; } catch { return; }
      }
      if (!waCfg.habilitado || !waCfg.base_url || !waCfg.api_key || !waCfg.instance_name) return;

      const tipoOrden = String(ordenData.tipo_actuacion || "").toUpperCase();
      let tpl = waCfg.template_instalacion || "";
      if (tipoOrden.includes("INCIDEN")) tpl = waCfg.template_incidencia || "";
      else if (tipoOrden.includes("RECUP") || tipoOrden.includes("RECOJ")) tpl = waCfg.template_recuperacion || "";
      if (!tpl.trim()) return;

      const message = tpl
        .replace(/{nombre}/g, ordenData.nombre || "")
        .replace(/{codigo}/g, ordenData.codigo || "")
        .replace(/{empresa}/g, empresa)
        .replace(/{tecnico}/g, ordenData.tecnico || "")
        .replace(/{fecha}/g, ordenData.fecha_actuacion || "")
        .replace(/{direccion}/g, ordenData.direccion || "")
        .replace(/{resultado}/g, "");

      let phone = numero.replace(/[\s\-\(\)]/g, "");
      if (phone.startsWith("+")) phone = phone.slice(1);
      if (/^9\d{8}$/.test(phone)) phone = "51" + phone;

      const url = `${waCfg.base_url.replace(/\/$/, "")}/message/sendText/${waCfg.instance_name}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: waCfg.api_key },
          body: JSON.stringify({ number: phone, text: message }),
          signal: ctrl.signal,
        });
      } finally { clearTimeout(t); }
    } catch { /* silencioso */ }
  }

  // ── WhatsApp al cliente tras crear orden ─────────────────────────────────
  async function sendWhatsAppOrden(payload) {
    const phone = contact?.phone_number;
    if (!phone) return;
    const nombre = String(payload.nombre || "").split(",")[0].split(" ")[0];
    const nombreFmt = nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase() : "cliente";
    const fecha = payload.fecha_actuacion ? new Date(payload.fecha_actuacion + "T00:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"2-digit",year:"numeric"}) : "";
    const texto = `📋 *NUEVA ORDEN DE SERVICIO*\n\nHola ${nombreFmt}, se ha generado una orden para tu servicio.\n\n*Código:* ${payload.codigo}\n*Tipo:* ${payload.tipo_actuacion}\n*Técnico:* ${payload.tecnico}\n*Fecha:* ${fecha}${payload.descripcion ? `\n*Detalle:* ${payload.descripcion}` : ""}\n\nGracias por confiar en nosotros. 💙`;
    await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "ChatwootMessage", payload: { phone, message: texto, account_id: acctId || "1" } }),
    }).catch(() => {});
  }

  // ── Crear orden desde sidebar ─────────────────────────────────────────────
  async function crearOrden() {
    if (!ordenForm.tipoActuacion || !ordenForm.tecnico.trim() || !ordenForm.autorOrden.trim()) return notify("Selecciona tipo, autor y técnico", false);
    if (!cliente && (!ordenForm.nombre.trim() || !ordenForm.dni.trim())) return notify("Ingresa nombre y DNI del cliente nuevo", false);
    setCreandoOrden(true);
    try {
      let codigo = "";
      const { data: codigoData } = await supabase.rpc("generar_codigo_orden");
      if (codigoData) {
        codigo = String(codigoData);
      } else {
        codigo = `ORD-${String(Date.now()).slice(-4)}-${new Date().getFullYear()}`;
      }

      const empresaOrden = cliente
        ? (cliente.empresa === "dimfiber" ? "DIM" : "Americanet")
        : (ordenForm.nodo ? empresaPorNodo(ordenForm.nodo) : ordenForm.empresa);
      const esInstalacion = ["Instalacion Internet","Instalacion Internet y Cable","Instalacion TV"].includes(ordenForm.tipoActuacion);
      const payload = {
        empresa:        empresaOrden,
        codigo,
        generar_usuario: esInstalacion ? "SI" : "NO",
        orden_tipo:     ordenForm.ordenTipo || "ORDEN DE SERVICIO",
        tipo_actuacion: ordenForm.tipoActuacion,
        fecha_actuacion: ordenForm.fechaActuacion,
        hora:           ordenForm.hora || null,
        estado:         "Pendiente",
        prioridad:      ordenForm.prioridad || "Normal",
        dni:            cliente ? (cliente.cedula || "") : ordenForm.dni.trim(),
        nombre:         cliente ? (cliente.nombre || "") : ordenForm.nombre.trim(),
        direccion:      cliente ? (detalle?.direccion_principal || "") : ordenForm.direccion.trim(),
        celular:        cliente ? (detalle?.movil || (contact?.phone_number||"").replace(/[^\d]/g,"") || "") : ((contact?.phone_number||"").replace(/[^\d]/g,"") || ordenForm.celular.trim()),
        email:          cliente ? (detalle?.correo || "") : ordenForm.email.trim(),
        contacto:       ordenForm.contacto || "",
        velocidad:      ordenForm.velocidad || "",
        precio_plan:    ordenForm.precioPlan ? Number(ordenForm.precioPlan) : null,
        nodo:           cliente ? String(cliente.nodo) : ordenForm.nodo.trim(),
        usuario_nodo:   cliente ? (svc?.pppuser || "") : ordenForm.usuarioNodo.trim(),
        password_usuario: cliente ? (detalle?._servicio?.ppppass || "") : ordenForm.passwordUsuario.trim(),
        sn_onu:         cliente ? (snOnu || "") : ordenForm.snOnu.trim(),
        caja_nap:       ordenForm.cajaNap || "",
        ubicacion:      ordenForm.coordenadas || "",
        descripcion:    ordenForm.descripcion || "",
        solicitar_pago: ordenForm.solicitarPago || "SI",
        monto_cobrar:   ordenForm.solicitarPago === "SI" ? (parseFloat(ordenForm.montoCobrar) || 0) : 0,
        autor_orden:    ordenForm.autorOrden || agente,
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

      // WhatsApp al cliente
      void sendWhatsAppOrden({ ...payload, codigo: codigoFinal });

      // Notificación push al técnico asignado
      if (ordenForm.tecnico) {
        void supabase.functions.invoke("send-push-notification", {
          body: {
            tecnico_nombre: ordenForm.tecnico,
            title: "Nueva orden asignada",
            body: `${codigoFinal} — ${payload.nombre || "Cliente"}`,
            data: {
              tipo: "nueva_orden",
              orden_codigo: String(codigoFinal),
              orden_id: String(res.data?.id || ""),
            },
          },
        });
      }

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

  // ── Búsqueda DNI RENIEC para orden nueva ─────────────────────────────────
  async function buscarDniNuevo() {
    const dni = ordenForm.dni.trim();
    if (dni.length !== 8) return notify("El DNI debe tener 8 dígitos", false);
    setBuscandoDniNew(true);
    try {
      // Primero busca en Supabase clientes internos
      const { data: srvs } = await supabase.from("clientes")
        .select("nombre,direccion,celular,email,nodo,usuario_nodo,caja_nap,sn_onu")
        .eq("dni", dni).order("id",{ascending:false}).limit(1);
      if (srvs?.[0]) {
        const c = srvs[0];
        setOrdenForm(p=>({ ...p,
          nombre:    c.nombre    || p.nombre,
          direccion: c.direccion || p.direccion,
          celular:   c.celular   || p.celular,
          email:     c.email     || p.email,
          nodo:      c.nodo      || p.nodo,
          usuarioNodo: c.usuario_nodo || p.usuarioNodo,
          cajaNap:   c.caja_nap  || p.cajaNap,
          snOnu:     c.sn_onu    || p.snOnu,
          empresa:   c.nodo ? empresaPorNodo(c.nodo) : p.empresa,
        }));
        notify("✅ Cliente encontrado en base de datos");
      } else {
        // Consultar RENIEC via perudevs
        const ctrl = new AbortController();
        const timer = setTimeout(()=>ctrl.abort(), 8000);
        try {
          const res = await fetch(`https://api.perudevs.com/api/v1/dni/simple?document=${dni}&key=${DNI_API_KEY}`, { signal:ctrl.signal });
          const data = await res.json();
          clearTimeout(timer);
          if (data?.estado && data?.resultado?.nombre_completo) {
            setOrdenForm(p=>({ ...p, nombre: data.resultado.nombre_completo }));
            notify("✅ Nombre obtenido de RENIEC");
          } else {
            notify("DNI no encontrado en RENIEC", false);
          }
        } finally { clearTimeout(timer); }
      }
    } catch(e) { notify("Error al buscar DNI: " + e.message, false); }
    setBuscandoDniNew(false);
  }

  // ── Cargar usuarios disponibles cuando cambia el nodo ────────────────────
  async function cargarUsuariosNodo(nodo) {
    if (!nodo) { setUsuariosNodo([]); return; }
    try {
      const { data } = await supabase.from("ordenes")
        .select("usuario_nodo,estado")
        .eq("nodo", nodo)
        .not("usuario_nodo","is",null);
      const usados = (data||[])
        .filter(o => !["cancelada","cancelado"].includes((o.estado||"").toLowerCase()) && o.usuario_nodo)
        .map(o => o.usuario_nodo);
      // También de clientes
      const { data: clts } = await supabase.from("clientes").select("usuario_nodo").eq("nodo",nodo);
      const usadosClientes = (clts||[]).map(c=>c.usuario_nodo).filter(Boolean);
      const todosUsados = [...new Set([...usados,...usadosClientes])];
      setUsuariosNodo(listarUsuariosParaNodo(nodo, todosUsados, 10));
      const pwd = NODO_PASSWORD_RULES[normalizeNodoKey(nodo)];
      setOrdenForm(p=>({ ...p, empresa: empresaPorNodo(nodo), passwordUsuario: pwd || p.passwordUsuario }));
    } catch(e) {}
  }

  // ── Extraer coordenadas del chat (todos los escenarios) ─────────────────
  async function extraerCoordsDeChat() {
    if (!contact?.phone_number) return notify("No hay número de contacto", false);
    setBuscandoCoords(true);
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "GetChatwootMessages",
          payload: { phone: contact.phone_number, account_id: acctId || "1", ...(convId ? { conv_id: convId } : {}) },
        }),
      });
      const data = await res.json();
      if (!data.ok) { notify("No se pudo obtener mensajes: " + (data.error||""), false); setBuscandoCoords(false); return; }

      const messages = (data.messages || []).slice().reverse(); // más recientes primero
      const found = [];
      const seen = new Set();

      const addCoord = (lat, lng) => {
        const key = `${parseFloat(lat).toFixed(5)},${parseFloat(lng).toFixed(5)}`;
        if (!seen.has(key)) { seen.add(key); found.push(`${lat}, ${lng}`); }
      };

      for (const msg of messages) {
        // Escenario 1: content_attributes con lat/long
        const ca = msg.content_attributes || {};
        const caLat = ca.lat ?? ca.latitude ?? ca.Lat;
        const caLng = ca.long ?? ca.longitude ?? ca.lng ?? ca.Lng ?? ca.Long;
        if (caLat != null && caLng != null) addCoord(caLat, caLng);

        // Escenario 2: items con botón "Ver en el mapa"
        for (const item of (ca.items || [])) {
          const iLat = item.lat ?? item.latitude;
          const iLng = item.long ?? item.longitude ?? item.lng;
          if (iLat != null && iLng != null) { addCoord(iLat, iLng); continue; }
          const url = String(item.value || item.url || item.link || "");
          const um = url.match(/[?&](?:q|query)=(-?\d+\.?\d+),(-?\d+\.?\d+)/) ||
                     url.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+)/) ||
                     url.match(/(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
          if (um) addCoord(um[1], um[2]);
        }

        const text = String(msg.content || "");

        // Escenario 3: @lat,lng (Google Maps zoom URL)
        const m1 = text.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (m1) addCoord(m1[1], m1[2]);

        // Escenario 4: ?q= &q= &query=
        const m2 = text.match(/[?&](?:q|query)=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (m2) addCoord(m2[1], m2[2]);

        // Escenario 5: Latitude:/Longitude: texto
        const mLat = text.match(/Latitude[:\s]+(-?\d+\.?\d+)/i);
        const mLng = text.match(/Longitude[:\s]+(-?\d+\.?\d+)/i);
        if (mLat && mLng) addCoord(mLat[1], mLng[1]);

        // Escenario 6: Google Maps /place/@lat,lng
        const m3 = text.match(/google\.com\/maps.*\/@(-?\d+\.?\d+),(-?\d+\.?\d+)/);
        if (m3) addCoord(m3[1], m3[2]);

        // Escenario 7: OpenStreetMap mlat/mlon
        const m4 = text.match(/mlat=(-?\d+\.?\d+).*mlon=(-?\d+\.?\d+)/);
        if (m4) addCoord(m4[1], m4[2]);

        // Escenario 8: texto plano con coordenadas
        const m5 = text.match(/(-?\d{1,3}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
        if (m5) addCoord(m5[1], m5[2]);

        // Escenario 9: attachments (coordinates_lat/long de Chatwoot)
        for (const att of (msg.attachments || [])) {
          const aLat = att.coordinates_lat ?? att.lat ?? att.latitude;
          const aLng = att.coordinates_long ?? att.long ?? att.longitude ?? att.lng;
          if (aLat != null && aLng != null) addCoord(aLat, aLng);
        }
      }

      if (found.length === 1) {
        setOrdenForm(p => ({ ...p, coordenadas: found[0] }));
        setCoordsLista([]);
        notify(`📍 Coordenadas: ${found[0]}`);
      } else if (found.length > 1) {
        setCoordsLista(found);
        notify(`📍 Se encontraron ${found.length} ubicaciones — seleccioná una`);
      } else {
        notify("No se encontró ubicación en los mensajes recientes", false);
      }
    } catch(e) {
      notify("Error: " + e.message, false);
    }
    setBuscandoCoords(false);
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
                const sel = dniSel?.mikrowisp_id === row.mikrowisp_id && dniSel?.nodo === row.nodo;
                return (
                  <div key={`${row.mikrowisp_id}-${row.nodo}`} onClick={() => setDniSel(sel ? null : row)}
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

          {/* ── Mini-wizard Mikrowisp ── */}
          <div style={S.divider} />
          <button onClick={() => { setMwOpen(v=>!v); if(!mwOpen) { setMwStep(0); setMwCliSupa(null); setMwMsg(""); } }}
            style={{ ...S.btn(mwOpen?"#6b7280":"#d97706"), display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom: mwOpen?8:0 }}>
            🚀 {mwOpen ? "Cerrar Setup Mikrowisp" : "Setup Mikrowisp"}
          </button>

          {mwOpen && (
            <div style={{ border:`1.5px solid #fcd34d`, borderRadius:8, overflow:"hidden", marginBottom:8 }}>
              {/* Header pasos */}
              <div style={{ background:"#fffbeb", padding:"8px 12px", borderBottom:`1px solid #fcd34d`, display:"flex", gap:2 }}>
                {["Buscar","Agregar","Servicio","Facturas","Sync"].map((s,i) => (
                  <div key={i} style={{ flex:1, textAlign:"center", fontSize:9, fontWeight:700,
                    color: mwStep===i?"#d97706": mwStep>i?"#16a34a":"#94a3b8",
                    borderBottom:`2px solid ${mwStep===i?"#d97706":mwStep>i?"#16a34a":"transparent"}`, paddingBottom:4 }}>
                    {mwStep>i?"✓":""}{s}
                  </div>
                ))}
              </div>

              <div style={{ padding:"12px" }}>

                {/* PASO 0 — Buscar */}
                {mwStep===0 && (
                  <div style={{ display:"grid", gap:8 }}>
                    <div style={{ fontSize:11, color:"#92400e" }}>
                      Pendientes MW — Nod_01 · Nod_03 · Nod_04 · sin registrar
                    </div>
                    {/* DNI / nombre */}
                    <input style={{ ...S.input, fontSize:12 }} placeholder="DNI o nombre (opcional)..."
                      value={mwBusqVal} onChange={e=>setMwBusqVal(e.target.value)}
                      onKeyDown={e=>e.key==="Enter" && mwBuscarEnClientes()} />
                    {/* Rango fechas */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      <div>
                        <label style={{ ...S.label }}>Desde</label>
                        <input type="date" style={{ ...S.input, fontSize:12 }}
                          value={mwBusqDesde} onChange={e=>setMwBusqDesde(e.target.value)} />
                      </div>
                      <div>
                        <label style={{ ...S.label }}>Hasta</label>
                        <input type="date" style={{ ...S.input, fontSize:12 }}
                          value={mwBusqHasta} onChange={e=>setMwBusqHasta(e.target.value)} />
                      </div>
                    </div>
                    <button onClick={() => { setMwBusqEliminados(v=>!v); setMwResultados([]); setMwMsg(""); }}
                      style={{ ...S.btnOut, fontSize:11, color: mwBusqEliminados?"#dc2626":"#92400e", borderColor: mwBusqEliminados?"#fca5a5":"#fcd34d", background: mwBusqEliminados?"#fff5f5":"#fffbeb" }}>
                      {mwBusqEliminados ? "✕ Ocultar eliminados" : "🗑 Ver eliminados de MW"}
                    </button>
                    <button onClick={mwBuscarEnClientes} disabled={mwBusqLoad||(!mwBusqVal.trim()&&!mwBusqDesde&&!mwBusqHasta)}
                      style={{ ...S.btn(mwBusqEliminados?"#dc2626":T.blue), opacity:(mwBusqLoad||(!mwBusqVal.trim()&&!mwBusqDesde&&!mwBusqHasta))?0.5:1 }}>
                      {mwBusqLoad?"Buscando...": mwBusqEliminados?"🔍 Buscar eliminados":"🔍 Buscar pendientes"}
                    </button>
                    {/* Lista resultados */}
                    {mwResultados.length > 0 && (
                      <div style={{ border:`1px solid ${mwBusqEliminados?"#fca5a5":"#fcd34d"}`, borderRadius:6, overflow:"hidden" }}>
                        <div style={{ padding:"6px 10px", background: mwBusqEliminados?"#fff5f5":"#fffbeb", borderBottom:`1px solid ${mwBusqEliminados?"#fca5a5":"#fcd34d"}`, fontSize:10, fontWeight:700, color: mwBusqEliminados?"#dc2626":"#92400e" }}>
                          {mwResultados.length} {mwBusqEliminados?"eliminado":"pendiente"}{mwResultados.length!==1?"s":""} — click para seleccionar
                        </div>
                        {mwResultados.map((c, i) => (
                          <div key={c.id||c.dni} onClick={() => mwSeleccionarCliente(c)}
                            style={{ padding:"8px 10px", cursor:"pointer", background: i%2===0?"#fff":"#fffbeb",
                              borderBottom: i<mwResultados.length-1?`1px solid #fde68a`:"none",
                              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:12, color:"#0f172a" }}>{c.nombre}</div>
                              <div style={{ fontSize:10, color:"#64748b", marginTop:1 }}>
                                DNI {c.dni} · <span style={{ color:"#0369a1", fontWeight:600 }}>{c.nodo}</span> · {String(c.fecha_registro||"").split("T")[0]}
                              </div>
                            </div>
                            <span style={{ fontSize:10, color:"#d97706", fontWeight:700 }}>Setup →</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {mwMsg && <div style={{ fontSize:11, color:T.red, fontWeight:600 }}>{mwMsg}</div>}
                  </div>
                )}

                {/* PASO 1 — Confirmar cliente y agregar a MW */}
                {mwStep===1 && mwCliSupa && (
                  <div style={{ display:"grid", gap:8 }}>
                    <div style={{ background:"#f0f9ff", border:`1px solid #bae6fd`, borderRadius:6, padding:"10px 12px" }}>
                      <div style={{ fontWeight:800, fontSize:13, color:"#0f172a", marginBottom:4 }}>{mwCliSupa.nombre}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"3px 12px", fontSize:11, color:"#475569" }}>
                        <span onClick={() => copiarAlPortapapeles(mwCliSupa.dni, "DNI")} title="Click para copiar DNI" style={{ cursor:"pointer" }}>DNI: <strong>{mwCliSupa.dni}</strong></span>
                        <span>Nodo: <strong>{mwCliSupa.nodo}</strong></span>
                        <span>Plan: <strong>{mwCliSupa.velocidad||"—"}</strong></span>
                        <span>S/: <strong>{mwCliSupa.precio_plan||"—"}</strong></span>
                        {mwCliSupa.celular && <span style={{gridColumn:"1/-1"}}>Tel: <strong>{mwCliSupa.celular}</strong></span>}
                        {mwCliSupa.direccion && <span style={{gridColumn:"1/-1"}}>Dir: <strong>{mwCliSupa.direccion}</strong></span>}
                        {mwCliSupa.email && <span style={{gridColumn:"1/-1"}}>Email: <strong>{mwCliSupa.email}</strong></span>}
                      </div>
                    </div>
                    {!MW_NODOS_OK.includes(String(mwCliSupa.nodo||"")) && (
                      <div style={{ background:"#fef9c3", border:`1px solid #fde047`, borderRadius:6, padding:"8px 10px", fontSize:11, color:"#854d0e", fontWeight:600 }}>
                        ⚠ Nodo {mwCliSupa.nodo} no habilitado para Mikrowisp (solo Nod_01, Nod_03, Nod_04).
                      </div>
                    )}
                    {MW_NODOS_OK.includes(String(mwCliSupa.nodo||"")) && (
                      <button onClick={mwAgregarMkw} disabled={mwAgregando}
                        style={{ ...S.btn("#f59e0b"), opacity:mwAgregando?0.6:1 }}>
                        {mwAgregando?"Agregando...":"➕ Agregar a Mikrowisp"}
                      </button>
                    )}
                    <button onClick={()=>{setMwStep(0);setMwCliSupa(null);setMwMsg("");}}
                      style={{ ...S.btnOut, textAlign:"center" }}>← Volver</button>
                    {mwMsg && <div style={{ fontSize:11, color:T.red, fontWeight:600 }}>{mwMsg}</div>}
                  </div>
                )}

                {/* Panel liquidaciones — visible en pasos 2 y 3 */}
                {(mwStep===2 || mwStep===3) && mwWizardLiq.length > 0 && (
                  <div style={{ background:"#f5f3ff", border:"1.5px solid #d8b4fe", borderRadius:10, padding:"10px 14px", marginBottom:4 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:"#7c3aed", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>📋 Liquidaciones del cliente</div>
                    <div style={{ display:"grid", gap:6 }}>
                      {mwWizardLiq.map((l,i) => {
                        const cobrado = l.cobro_realizado===true || l.cobro_realizado==="SI" || l.cobro_realizado===1;
                        return (
                          <div key={i} style={{ background:"#fff", border:`1px solid ${cobrado?"#86efac":"#fde047"}`, borderRadius:8, padding:"8px 10px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                                <span style={{ fontWeight:800, fontSize:12, color:"#7c3aed" }}>{l.codigo}</span>
                                <span style={{ fontSize:10, background: cobrado?"#dcfce7":"#fef9c3", color: cobrado?"#15803d":"#854d0e", padding:"1px 6px", borderRadius:99, fontWeight:700 }}>{cobrado?"✓ Cobrado":"Pendiente"}</span>
                              </div>
                              {l.monto_cobrado && <span style={{ fontWeight:800, fontSize:12, color: cobrado?"#16a34a":"#92400e" }}>S/{l.monto_cobrado}</span>}
                            </div>
                            <div style={{ fontSize:11, color:"#64748b", marginTop:3, display:"flex", gap:8, flexWrap:"wrap" }}>
                              {l.tipo_actuacion && <span>{l.tipo_actuacion}</span>}
                              {l.medio_pago && <span>· {l.medio_pago}</span>}
                              {l.tecnico_liquida && <span>· {l.tecnico_liquida}</span>}
                              {l.fecha_liquidacion && <span>· {String(l.fecha_liquidacion).slice(0,10)}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PASO 2 — Crear servicio */}
                {mwStep===2 && (
                  <div style={{ display:"grid", gap:8 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#16a34a" }}>✓ Cliente en Mikrowisp (ID: {mwMkwId})</div>
                    <div>
                      <label style={{ ...S.label }}>Plan *</label>
                      <select style={S.select} value={mwForm.id_perfil} onChange={e=>{
                        const pid=e.target.value; const pl=mwPerfiles.find(p=>String(p.id)===pid);
                        setMwForm(f=>({...f,id_perfil:pid,costo:pl?String(pl.costo):f.costo}));
                      }}>
                        <option value="">— Seleccionar plan —</option>
                        {mwPerfiles.map(p=><option key={p.id} value={p.id}>{p.plan} — S/{p.costo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...S.label }}>Rango IPv4 *</label>
                      <select style={S.select} value={mwForm.id_red_ipv4} onChange={e=>setMwForm(f=>({...f,id_red_ipv4:e.target.value}))}>
                        <option value="">— Seleccionar rango —</option>
                        {mwRedes.map(r=><option key={r.id} value={r.id}>{r.red} ({r.disponibles??'?'} disp.)</option>)}
                      </select>
                    </div>
                    {mwPlantillas.length > 0 && (
                      <div>
                        <label style={{ ...S.label }}>Plantilla de facturación *</label>
                        <select style={S.select} value={mwPlantillaId} onChange={e=>setMwPlantillaId(Number(e.target.value))}>
                          {mwPlantillas.map(p => {
                            const cfg = p.datos?.config || {};
                            return <option key={p.id} value={p.id}>{p.nombre} — Día pago: {cfg.diapago} · Corte: {cfg.corteautomatico} días · {cfg.tipopago==="0"?"Prepago":"Postpago"}</option>;
                          })}
                        </select>
                      </div>
                    )}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      <div>
                        <label style={{ ...S.label }}>Fecha instalación</label>
                        <input type="date" style={{...S.input,fontSize:12}} value={mwForm.fecha_instalacion} onChange={e=>setMwForm(f=>({...f,fecha_instalacion:e.target.value}))} />
                      </div>
                      <div>
                        <label style={{ ...S.label }}>Costo mensual S/</label>
                        <input type="number" style={{...S.input,fontSize:12}} value={mwForm.costo} onChange={e=>setMwForm(f=>({...f,costo:e.target.value}))} />
                      </div>
                      <div>
                        <label style={{ ...S.label }}>Usuario PPP</label>
                        <input style={{...S.input,fontSize:12}} value={mwForm.userppp} onChange={e=>setMwForm(f=>({...f,userppp:e.target.value}))} />
                      </div>
                      <div>
                        <label style={{ ...S.label }}>Contraseña PPP</label>
                        <input style={{...S.input,fontSize:12}} value={mwForm.passppp} onChange={e=>setMwForm(f=>({...f,passppp:e.target.value}))} />
                      </div>
                    </div>
                    <div>
                      <label style={{ ...S.label }}>IP asignada <span style={{fontWeight:400,textTransform:"none"}}>(opcional)</span></label>
                      <div style={{ display:"flex", gap:6 }}>
                        <input style={{...S.input,fontSize:12,fontFamily:"monospace",flex:1}} placeholder="192.168.x.x" value={mwForm.ip} onChange={e=>setMwForm(f=>({...f,ip:e.target.value}))} />
                        <button onClick={mwBuscarIpMikrotik} disabled={mwIpLoad||!mwForm.userppp}
                          style={{ padding:"8px 10px", background:mwIpLoad?"#d1fae5":"#f0fdf4", border:"1.5px solid #86efac", borderRadius:8, fontSize:11, fontWeight:700, color:"#15803d", cursor:"pointer", whiteSpace:"nowrap", opacity:(!mwForm.userppp)?0.5:1 }}>
                          {mwIpLoad?"...":"🔍 IP MikroTik"}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={{ ...S.label }}>Coordenadas <span style={{fontWeight:400,textTransform:"none"}}>(opcional)</span></label>
                      <input style={{...S.input,fontSize:11,fontFamily:"monospace"}} placeholder="-16.438490, -71.598208" value={mwForm.coordenadas} onChange={e=>setMwForm(f=>({...f,coordenadas:e.target.value}))} />
                    </div>
                    <button onClick={mwCrearServicio} disabled={mwCreandoSvc||!mwForm.id_perfil||!mwForm.id_red_ipv4}
                      style={{ ...S.btn("#16a34a"), opacity:(mwCreandoSvc||!mwForm.id_perfil||!mwForm.id_red_ipv4)?0.5:1 }}>
                      {mwCreandoSvc?"Creando servicio...":"✓ Crear Servicio"}
                    </button>
                    {mwMsg && <div style={{ fontSize:11, color:T.red, fontWeight:600 }}>{mwMsg}</div>}
                  </div>
                )}

                {/* PASO 3 — Facturas */}
                {mwStep===3 && (() => {
                  const c = "#7c3aed", bo = "#d8b4fe";
                  const empresa = mwEsDim(mwCliSupa?.nodo) ? "dimfiber" : "americanet";
                  const pasarelas = PASARELAS[empresa] || PASARELAS.americanet;
                  // Cálculo prorrateo
                  const instDate = mwProrrFecha ? new Date(mwProrrFecha + "T00:00:00") : null;
                  const venceDate = mwProrrVence ? new Date(mwProrrVence + "T00:00:00") : null;
                  const prec = parseFloat(mwProrrPrec) || 0;
                  let diasSvc = 0, diasPer = 0, montoAuto = "";
                  if (instDate && venceDate && venceDate > instDate) {
                    diasSvc = Math.round((venceDate - instDate) / 86400000);
                    const ini = new Date(venceDate); ini.setMonth(ini.getMonth() - 1);
                    diasPer = Math.round((venceDate - ini) / 86400000);
                    if (prec > 0 && diasPer > 0) montoAuto = String(Math.round(prec * diasSvc / diasPer));
                  }
                  return (
                    <div style={{ display:"grid", gap:8 }}>
                      {/* Sub-tabs */}
                      <div style={{ display:"flex", gap:4 }}>
                        {[{s:1,l:"1️⃣ Pago instalación"},{s:2,l:"2️⃣ Prorrateo"}].map(({s,l})=>(
                          <button key={s} onClick={()=>setMwFactSub(s)}
                            style={{ flex:1, padding:"6px", borderRadius:6, border:"none", fontSize:10, fontWeight:700, cursor:"pointer",
                              background: mwFactSub===s?c:"#f5f3ff", color: mwFactSub===s?"#fff":c }}>
                            {mwFactDone && s===1 ? "✓ "+l : l}
                          </button>
                        ))}
                      </div>

                      {/* Sub-paso 1: Pago instalación */}
                      {mwFactSub===1 && (
                        <div style={{ display:"grid", gap:8 }}>
                          <div style={{ display:"flex", gap:4 }}>
                            {[{m:"normal",l:"📄 Normal"},{m:"libre",l:"🎁 Libre/Promo"}].map(({m,l})=>(
                              <button key={m} onClick={()=>setMwFactModo(m)}
                                style={{ flex:1, padding:"5px", borderRadius:5, border:"none", fontSize:10, fontWeight:700, cursor:"pointer",
                                  background: mwFactModo===m?c:"#f5f3ff", color: mwFactModo===m?"#fff":c }}>{l}
                              </button>
                            ))}
                          </div>
                          {mwFactModo==="libre" && (
                            <input style={{...S.input,fontSize:12}} placeholder="Ej: Instalación Plan 100Mbps"
                              value={mwFactDesc} onChange={e=>setMwFactDesc(e.target.value)} />
                          )}
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                            <div>
                              <label style={S.label}>Monto S/ *</label>
                              <input type="number" step="0.01" style={{...S.input,fontSize:12}} placeholder="50.00"
                                value={mwFactMonto} onChange={e=>setMwFactMonto(e.target.value)} />
                            </div>
                            <div>
                              <label style={S.label}>Vencimiento *</label>
                              <input type="date" style={{...S.input,fontSize:12}}
                                value={mwFactVence} onChange={e=>setMwFactVence(e.target.value)} />
                            </div>
                          </div>
                          <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12, fontWeight:600, color:c }}>
                            <input type="checkbox" checked={mwFactPagada} onChange={e=>setMwFactPagada(e.target.checked)} style={{ width:14, height:14 }} />
                            Registrar como pagada
                          </label>
                          {mwFactPagada && (
                            <select style={{...S.select,fontSize:12}} value={mwFactPasarela} onChange={e=>setMwFactPasarela(e.target.value)}>
                              {pasarelas.map(p=><option key={p}>{p}</option>)}
                            </select>
                          )}
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={mwCrearFactura} disabled={mwFactCreando||!mwFactMonto||!mwFactVence||(mwFactModo==="libre"&&!mwFactDesc)}
                              style={{ ...S.btn(c), flex:1, opacity:(mwFactCreando||!mwFactMonto||!mwFactVence)?0.5:1 }}>
                              {mwFactCreando?"Creando...":"✓ Crear y continuar →"}
                            </button>
                            <button onClick={()=>{setMwFactDone(true);setMwFactSub(2);setMwProrrFecha(mwForm.fecha_instalacion);setMwProrrPrec(mwForm.costo||String(mwCliSupa?.precio_plan||""));}}
                              style={{ ...S.btnOut }}>Omitir</button>
                          </div>
                        </div>
                      )}

                      {/* Sub-paso 2: Prorrateo */}
                      {mwFactSub===2 && (
                        <div style={{ display:"grid", gap:8 }}>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                            <div>
                              <label style={S.label}>F. Instalación</label>
                              <input type="date" style={{...S.input,fontSize:11}} value={mwProrrFecha} onChange={e=>setMwProrrFecha(e.target.value)} />
                            </div>
                            <div>
                              <label style={S.label}>Próx. Vence *</label>
                              <input type="date" style={{...S.input,fontSize:11}} value={mwProrrVence} onChange={e=>setMwProrrVence(e.target.value)} />
                            </div>
                            <div>
                              <label style={S.label}>Precio S/</label>
                              <input type="number" step="0.01" style={{...S.input,fontSize:11}} value={mwProrrPrec} onChange={e=>setMwProrrPrec(e.target.value)} />
                            </div>
                          </div>
                          {montoAuto && (
                            <div style={{ background:"#f5f3ff", border:`1px solid ${bo}`, borderRadius:6, padding:"8px 10px", fontSize:11, color:c, fontWeight:700 }}>
                              S/{prec.toFixed(2)} × {diasSvc}d / {diasPer}d = <span style={{ fontSize:14 }}>S/{montoAuto}</span>
                            </div>
                          )}
                          <div>
                            <label style={S.label}>Monto prorrateo S/ <span style={{fontWeight:400,textTransform:"none"}}>(editable)</span></label>
                            <input type="number" step="0.01" style={{...S.input,fontSize:12}} placeholder={montoAuto||"Auto-calculado"}
                              value={mwProrrMonto} onChange={e=>setMwProrrMonto(e.target.value)} />
                          </div>
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={mwCrearProrrateo} disabled={mwFactCreando||!mwProrrVence||!(parseFloat(mwProrrMonto||montoAuto)>0)}
                              style={{ ...S.btn(c), flex:1, opacity:(mwFactCreando||!mwProrrVence)?0.5:1 }}>
                              {mwFactCreando?"Creando...":"✓ Crear prorrateo →"}
                            </button>
                            <button onClick={()=>setMwStep(4)} style={{ ...S.btnOut }}>Omitir</button>
                          </div>
                        </div>
                      )}

                      {mwMsg && <div style={{ fontSize:11, color:T.red, fontWeight:600 }}>{mwMsg}</div>}
                    </div>
                  );
                })()}

                {/* PASO 4 — Sync */}
                {mwStep===4 && (
                  <div style={{ display:"grid", gap:10 }}>
                    <div style={{ fontSize:11, color:"#64748b" }}>Sincroniza los datos del cliente entre Supabase y Mikrowisp para que n8n los use.</div>
                    {mwSyncDone ? (
                      <div style={{ background:"#fff7ed", border:"1.5px solid #fdba74", borderRadius:8, padding:"12px", display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:22 }}>✅</span>
                        <div style={{ fontWeight:800, fontSize:12, color:"#c2410c" }}>Sincronizado correctamente</div>
                      </div>
                    ) : (
                      <button onClick={mwSincronizar} disabled={mwSyncLoad}
                        style={{ ...S.btn("#0369a1"), opacity:mwSyncLoad?0.6:1 }}>
                        {mwSyncLoad?"⏳ Sincronizando...":"📱 Sincronizar con Mikrowisp"}
                      </button>
                    )}
                    <button onClick={mwEnviarSms} disabled={mwSmsSent}
                      style={{ ...S.btn("#7c3aed"), opacity:mwSmsSent?0.6:1 }}>
                      {mwSmsSent?"✓ SMS enviado":"💬 Enviar SMS Bienvenida"}
                    </button>
                    {mwMsg && <div style={{ fontSize:11, color:mwMsg.startsWith("✓")? T.green : T.red, fontWeight:600 }}>{mwMsg}</div>}
                    <button onClick={mwReset}
                      style={{ ...S.btn(mwSyncDone?"#16a34a":"#6b7280") }}>
                      {mwSyncDone?"✅ Finalizar":"Cerrar"}
                    </button>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ── Orden nueva para cliente no registrado ── */}
          <div style={S.divider} />
          <button onClick={() => { setShowOrdenNuevo(v=>!v); setOrdenCreada(null); setOrdenForm(p=>({...p, tipoActuacion:"Instalacion Internet", ordenTipo:"ORDEN DE SERVICIO", celular:(contact?.phone_number||"").replace(/[^\d]/g,"") })); }}
            style={{ ...S.btn(showOrdenNuevo ? "#6b7280" : "#7c3aed"), display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            📋 {showOrdenNuevo ? "Cancelar" : "Crear orden de instalación"}
          </button>

          {showOrdenNuevo && (<>
            {ordenCreada ? (
              <div style={{ background:T.greenLt, border:`1px solid #86efac`, borderLeft:`3px solid ${T.green}`, borderRadius:5, padding:"12px 14px", marginTop:10 }}>
                <div style={{ fontWeight:800, fontSize:13, color:T.green, marginBottom:4 }}>✅ Orden creada: {ordenCreada.codigo}</div>
                <button onClick={() => { setOrdenCreada(null); setShowOrdenNuevo(false); }} style={{ ...S.btnOut, fontSize:11 }}>Cerrar</button>
              </div>
            ) : (() => {
              const LBL = "#7c3aed"; const BG = "#faf5ff";
              const fila = (label, content, last=false) => (
                <div style={{ display:"grid", gridTemplateColumns:"90px 1fr", borderBottom:last?"none":`1px solid ${T.border}` }}>
                  <div style={{ padding:"7px 10px", background:BG, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:LBL, display:"flex", alignItems:"center" }}>{label}</div>
                  <div>{content}</div>
                </div>
              );
              const inp = (key, placeholder, type="text") => (
                <input style={{...S.input,border:"none",borderRadius:0,fontSize:12}} type={type} placeholder={placeholder}
                  value={ordenForm[key]} onChange={e=>setOrdenForm(p=>({...p,[key]:e.target.value}))} />
              );
              const sel = (key, opts, onChange) => (
                <select style={{...S.select,border:"none",borderRadius:0,fontSize:12}} value={ordenForm[key]}
                  onChange={onChange || (e=>setOrdenForm(p=>({...p,[key]:e.target.value})))}>
                  {opts.map(o=>Array.isArray(o)?<option key={o[0]} value={o[0]}>{o[1]}</option>:<option key={o}>{o}</option>)}
                </select>
              );
              const horaPicker = () => {
                const h24str=ordenForm.hora||""; const [hhStr,mmStr]=h24str.split(":"); const hh24=parseInt(hhStr||"0",10);
                const cur12=hh24===0?12:hh24>12?hh24-12:hh24; const curAmpm=hh24>=12?"PM":"AM"; const curMm=mmStr||"00";
                const aA=(h)=>{const n=parseInt(h,10);if(isNaN(n))return"AM";return(n>=1&&n<=6)?"PM":"AM";};
                const sH=(h,mm,ampm)=>{let h2=parseInt(h,10);if(isNaN(h2)||h2<1||h2>12)return"";if(ampm==="PM")h2=h2===12?12:h2+12;else h2=h2===12?0:h2;return`${String(h2).padStart(2,"0")}:${String(parseInt(mm||"0",10)).padStart(2,"0")}`;};
                return(<div style={{display:"flex",gap:4,alignItems:"center",padding:"6px 8px"}}>
                  <input type="number" min="1" max="12" style={{...S.input,width:44,textAlign:"center",padding:"4px",fontSize:13,fontWeight:700,border:`1px solid ${T.border}`,borderRadius:4}} value={h24str?cur12:""} placeholder="H" onChange={e=>{setOrdenForm(p=>({...p,hora:sH(e.target.value,curMm,aA(e.target.value))}));}} />
                  <span style={{fontWeight:800,color:T.muted}}>:</span>
                  <input type="number" min="0" max="59" style={{...S.input,width:44,textAlign:"center",padding:"4px",fontSize:13,fontWeight:700,border:`1px solid ${T.border}`,borderRadius:4}} value={h24str?curMm:""} placeholder="MM" onChange={e=>{const mm=String(parseInt(e.target.value||"0",10)).padStart(2,"0");setOrdenForm(p=>({...p,hora:sH(cur12,mm,curAmpm)}));}} />
                  <button type="button" onClick={()=>{const na=curAmpm==="AM"?"PM":"AM";setOrdenForm(p=>({...p,hora:sH(cur12,curMm,na)}));}} style={{padding:"5px 10px",borderRadius:5,border:`2px solid ${curAmpm==="PM"?"#f59e0b":"#3b82f6"}`,background:curAmpm==="PM"?"#fef3c7":"#eff6ff",color:curAmpm==="PM"?"#92400e":"#1e40af",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{h24str?curAmpm:"AM/PM"}</button>
                  {h24str&&<span style={{fontSize:11,color:T.muted,fontWeight:600}}>{cur12}:{curMm} {curAmpm}</span>}
                </div>);
              };
              const esInst = ["Instalacion Internet","Instalacion Internet y Cable","Instalacion TV"].includes(ordenForm.tipoActuacion);
              const empAutoNodo = ordenForm.nodo ? empresaPorNodo(ordenForm.nodo) : ordenForm.empresa;
              return (
                <div style={{ border:`2px solid #7c3aed33`, borderRadius:8, overflow:"hidden", marginTop:10 }}>
                  {/* Encabezado */}
                  <div style={{ background:"#7c3aed", padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ color:"#fff", fontWeight:800, fontSize:12 }}>📋 PASO 1 · Datos de la orden</span>
                  </div>
                  <div style={{ background:"#fff" }}>
                    {fila("Tipo orden", sel("ordenTipo", ["ORDEN DE SERVICIO","INCIDENCIA","MANTENIMIENTO","RECUPERACION DE EQUIPO"]))}
                    {fila("Actuación", sel("tipoActuacion", ["Instalacion Internet","Instalacion Internet y Cable","Instalacion TV","Incidencia Internet","Mantenimiento","Visita Tecnica","Recojo de equipo"]))}
                    {fila("Fecha", inp("fechaActuacion","",  "date"))}
                    {fila("Hora", horaPicker())}
                    {fila("Prioridad", sel("prioridad", ["Normal","Alta","Urgente"]))}
                    {fila("Cobrar", sel("solicitarPago", ["SI","NO"], e => setOrdenForm(p => ({...p, solicitarPago:e.target.value, montoCobrar: e.target.value==="NO"?"":p.montoCobrar}))))}
                    {ordenForm.solicitarPago === "SI" && fila("Monto S/", inp("montoCobrar", "0.00", "number"))}
                  </div>

                  <div style={{ background:"#7c3aed", padding:"8px 12px" }}>
                    <span style={{ color:"#fff", fontWeight:800, fontSize:12 }}>👤 PASO 2 · Datos del cliente</span>
                  </div>
                  <div style={{ background:"#fff" }}>
                    {fila("DNI *",
                      <div style={{ display:"flex", alignItems:"center", gap:0 }}>
                        <input style={{...S.input,border:"none",borderRadius:0,fontSize:12,flex:1}} type="text" placeholder="12345678" maxLength={8}
                          value={ordenForm.dni} onChange={e=>setOrdenForm(p=>({...p,dni:e.target.value.replace(/\D/g,"")}))}
                          onKeyDown={e=>e.key==="Enter"&&buscarDniNuevo()} />
                        <button onClick={buscarDniNuevo} disabled={buscandoDniNew||ordenForm.dni.length!==8}
                          style={{...S.btnSm(buscandoDniNew?"#9ca3af":"#7c3aed"),borderRadius:0,padding:"0 12px",height:"100%",fontSize:11,flexShrink:0,opacity:ordenForm.dni.length!==8?0.5:1}}>
                          {buscandoDniNew?"...":"🔍 Buscar"}
                        </button>
                      </div>
                    )}
                    {fila("Nombre *", inp("nombre","APELLIDOS, Nombres"))}
                    {fila("Celular", inp("celular","987654321"))}
                    {fila("Email", inp("email","correo@ejemplo.com","email"))}
                    {fila("Dirección", inp("direccion","Av. ..."))}
                  </div>

                  <div style={{ background:"#7c3aed", padding:"8px 12px" }}>
                    <span style={{ color:"#fff", fontWeight:800, fontSize:12 }}>🌐 PASO 3 · Servicio</span>
                  </div>
                  <div style={{ background:"#fff" }}>
                    {fila("Nodo",
                      <select style={{...S.select,border:"none",borderRadius:0,fontSize:12}} value={ordenForm.nodo}
                        onChange={e=>{
                          const n=e.target.value;
                          setOrdenForm(p=>({...p,nodo:n,empresa:empresaPorNodo(n),usuarioNodo:""}));
                          setUsuariosNodo([]);
                          setShowUsuarioDrop(false);
                          if(n) cargarUsuariosNodo(n);
                        }}>
                        <option value="">— Seleccionar —</option>
                        {NODOS_BASE.map(n=><option key={n} value={n}>{n} ({empresaPorNodo(n)})</option>)}
                      </select>
                    )}
                    {fila("Empresa", <div style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:empAutoNodo==="DIM"?"#7c3aed":T.blue}}>{empAutoNodo || "— selecciona nodo —"}</div>)}
                    {esInst && fila("Velocidad", sel("velocidad", [["","Seleccionar"],"100 Mbps","200 Mbps","300 Mbps","400 Mbps","500 Mbps","600 Mbps","800 Mbps","1000 Mbps"]))}
                    {esInst && fila("Precio plan", inp("precioPlan","S/ 0.00","number"))}
                    {fila("Usuario nodo",
                      <div style={{position:"relative"}}>
                        <input style={{...S.input,border:"none",borderRadius:0,fontSize:12}} placeholder={NODO_USUARIO_RULES[normalizeNodoKey(ordenForm.nodo)]?`Ej: ${listarUsuariosParaNodo(ordenForm.nodo,[],1)[0]?.usuario||""}` : "user730@americanet"}
                          value={ordenForm.usuarioNodo}
                          onChange={e=>setOrdenForm(p=>({...p,usuarioNodo:e.target.value}))}
                          onFocus={()=>setShowUsuarioDrop(true)}
                          onBlur={()=>setTimeout(()=>setShowUsuarioDrop(false),150)} />
                        {showUsuarioDrop && usuariosNodo.length>0 && (
                          <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:`1px solid ${T.border}`,borderRadius:6,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",zIndex:999,maxHeight:200,overflowY:"auto"}}>
                            {usuariosNodo.map((u,i)=>(
                              <div key={u.usuario} onMouseDown={()=>{setOrdenForm(p=>({...p,usuarioNodo:u.usuario}));setShowUsuarioDrop(false);}}
                                style={{padding:"8px 12px",cursor:u.ocupado?"default":"pointer",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",
                                  color:u.ocupado?"#dc2626":i===0?"#1e40af":"#374151",fontWeight:i===0?700:400,
                                  background:i===0&&!u.ocupado?"#eff6ff":"transparent",borderBottom:i<usuariosNodo.length-1?`1px solid ${T.border}`:"none"}}>
                                <span>{u.usuario}{i===0&&!u.ocupado?" ✓":""}</span>
                                {u.ocupado&&<span style={{fontSize:10,background:"#fef2f2",color:"#dc2626",borderRadius:4,padding:"1px 6px",fontWeight:700}}>Ocupado</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {fila("Contraseña PPP", inp("passwordUsuario", "aqp0021"))}
                    {fila("SN ONU", inp("snOnu","HWTC12345678"))}
                    {fila("Caja NAP", inp("cajaNap","NAP-01"))}
                    {fila("Coordenadas",
                      <div style={{display:"flex",flexDirection:"column"}}>
                        <div style={{display:"flex",alignItems:"center"}}>
                          <input style={{...S.input,border:"none",borderRadius:0,fontSize:11,flex:1,fontFamily:"monospace"}} type="text" placeholder="-16.438490, -71.598208"
                            value={ordenForm.coordenadas} onChange={e=>setOrdenForm(p=>({...p,coordenadas:e.target.value}))} />
                          <button onClick={extraerCoordsDeChat} disabled={buscandoCoords}
                            style={{...S.btnSm("#16a34a"),borderRadius:0,padding:"0 8px",height:"100%",fontSize:11,whiteSpace:"nowrap",flexShrink:0,opacity:buscandoCoords?0.6:1}}>
                            {buscandoCoords?"...":"📍 Chat"}
                          </button>
                        </div>
                        {(() => {
                          const [lat,lng]=(ordenForm.coordenadas||"").split(",").map(Number);
                          if(!lat||!lng||isNaN(lat)||isNaN(lng)) return null;
                          const mapUrl=`https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.003},${lat-0.003},${lng+0.003},${lat+0.003}&layer=mapnik&marker=${lat},${lng}`;
                          return(<div style={{position:"relative",marginTop:4}}>
                            <iframe src={mapUrl} title="Ubicación" style={{width:"100%",height:130,border:`1px solid ${T.border}`,borderRadius:4,display:"block"}} loading="lazy" />
                            <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
                              style={{position:"absolute",bottom:6,right:8,background:"rgba(0,0,0,0.6)",color:"#fff",fontSize:10,padding:"3px 8px",borderRadius:4,textDecoration:"none",fontWeight:600}}>
                              Google Maps ↗
                            </a>
                          </div>);
                        })()}
                        {/* Selector múltiples ubicaciones */}
                        {coordsLista.length > 0 && (
                          <div style={{ marginTop:4, background:"#f0fdf4", border:`1px solid #86efac`, borderRadius:4, padding:"6px 8px" }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", marginBottom:4 }}>📍 {coordsLista.length} ubicaciones — elegí:</div>
                            {coordsLista.map((c,i) => (
                              <div key={i} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
                                <button onClick={()=>{ setOrdenForm(p=>({...p,coordenadas:c})); setCoordsLista([]); }}
                                  style={{...S.btnSm(ordenForm.coordenadas===c?"#16a34a":T.blue),fontSize:10,flex:1,textAlign:"left",padding:"3px 8px",fontFamily:"monospace"}}>
                                  {ordenForm.coordenadas===c?"✓ ":""}{c}
                                </button>
                                <a href={`https://maps.google.com/?q=${c}`} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:T.blue,fontWeight:600}}>G↗</a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ background:"#7c3aed", padding:"8px 12px" }}>
                    <span style={{ color:"#fff", fontWeight:800, fontSize:12 }}>👷 PASO 4 · Asignación</span>
                  </div>
                  <div style={{ background:"#fff" }}>
                    {fila("Autor *",
                      <select style={{...S.select,border:"none",borderRadius:0,fontSize:12}} value={ordenForm.autorOrden} onChange={e=>setOrdenForm(p=>({...p,autorOrden:e.target.value}))}>
                        <option value="">— Seleccionar —</option>
                        {autorLista.map(u=><option key={u.nombre} value={u.nombre}>{u.nombre}{u.rol!=="Tecnico"?` (${u.rol})`:""}</option>)}
                      </select>
                    )}
                    {fila("Técnico *",
                      tecnicosLista.length>0
                        ? <select style={{...S.select,border:"none",borderRadius:0,fontSize:12}} value={ordenForm.tecnico} onChange={e=>setOrdenForm(p=>({...p,tecnico:e.target.value}))}>
                            <option value="">— Seleccionar —</option>
                            {tecnicosLista.map(t=><option key={t.nombre} value={t.nombre}>{t.nombre}</option>)}
                          </select>
                        : inp("tecnico","Nombre del técnico")
                    )}
                    {fila("Observación",
                      <textarea style={{...S.input,border:"none",borderRadius:0,fontSize:12,resize:"vertical",minHeight:50}} placeholder="Descripción del trabajo (opcional)" value={ordenForm.descripcion} onChange={e=>setOrdenForm(p=>({...p,descripcion:e.target.value}))} />,
                      true
                    )}
                  </div>
                  {/* ── Checklist de progreso ── */}
                  {(() => {
                    const checks = [
                      { label:"DNI",         ok: ordenForm.dni.length===8 },
                      { label:"Nombre",      ok: !!ordenForm.nombre.trim() },
                      { label:"Dirección",   ok: !!ordenForm.direccion.trim() },
                      { label:"Nodo",        ok: !!ordenForm.nodo },
                      { label:"Usuario nodo",ok: !!ordenForm.usuarioNodo.trim() },
                      { label:"Tipo",        ok: !!ordenForm.tipoActuacion },
                      { label:"Fecha",       ok: !!ordenForm.fechaActuacion },
                      { label:"Hora",        ok: !!ordenForm.hora },
                      { label:"Autor",       ok: !!ordenForm.autorOrden },
                      { label:"Técnico",     ok: !!ordenForm.tecnico.trim() },
                    ];
                    const ok = checks.filter(c=>c.ok).length;
                    const pct = Math.round(ok/checks.length*100);
                    return (
                      <div style={{padding:"10px 12px",background:"#faf5ff",borderTop:`1px solid #7c3aed33`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                          <span style={{fontSize:11,fontWeight:700,color:"#7c3aed"}}>Progreso del formulario</span>
                          <span style={{fontSize:13,fontWeight:800,color:"#7c3aed"}}>{pct}%</span>
                        </div>
                        <div style={{background:"#e9d5ff",borderRadius:4,height:6,overflow:"hidden",marginBottom:8}}>
                          <div style={{width:`${pct}%`,height:"100%",background:"#7c3aed",borderRadius:4,transition:"width .3s"}} />
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                          {checks.map(c=>(
                            <span key={c.label} style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:600,
                              background:c.ok?"#f0fdf4":"#fef2f2",color:c.ok?"#16a34a":"#dc2626",
                              border:`1px solid ${c.ok?"#86efac":"#fca5a5"}`}}>
                              {c.ok?"✓":"○"} {c.label}
                            </span>
                          ))}
                        </div>
                        <button onClick={crearOrden}
                          disabled={creandoOrden||!ordenForm.tecnico.trim()||!ordenForm.autorOrden.trim()||!ordenForm.nombre.trim()||!ordenForm.dni.trim()||!ordenForm.nodo}
                          style={{...S.btn("#7c3aed"),opacity:(creandoOrden||!ordenForm.tecnico.trim()||!ordenForm.autorOrden.trim()||!ordenForm.nombre.trim()||!ordenForm.dni.trim()||!ordenForm.nodo)?0.55:1}}>
                          {creandoOrden ? "Creando orden..." : `Guardar orden · ${ok}/${checks.length} campos`}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </>)}
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
                {cliente.cedula && (
                  <span
                    onClick={() => copiarAlPortapapeles(cliente.cedula, "DNI")}
                    title="Click para copiar DNI"
                    style={{ fontSize:11, color:"rgba(255,255,255,0.55)", cursor:"pointer" }}
                  >DNI <strong style={{ color:"rgba(255,255,255,0.9)" }}>{cliente.cedula}</strong></span>
                )}
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
                  <div
                    onClick={() => copiarAlPortapapeles(svc.ip, "IP")}
                    title="Click para copiar IP"
                    style={{ fontFamily:"monospace", fontWeight:700, color:T.navy, fontSize:12, cursor:"pointer" }}
                  >{svc.ip}</div>
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
              {/* Fila compacta siempre visible */}
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, fontWeight:600, color:T.muted, flexShrink:0 }}>MikroTik</span>
                {diagLoad && <span style={{ fontSize:10, color:T.muted }}>Consultando...</span>}
                {!diagLoad && diagError && (
                  <span style={{ fontSize:10, color:T.red, flex:1 }}>Sin respuesta</span>
                )}
                {!diagLoad && diagResult && (() => {
                  const mk = diagResult.mikrotik || {};
                  const c  = diagColor(mk.estado);
                  const isConn = ["connected","conectado"].includes((mk.estado||"").toLowerCase());
                  const resumen = isConn
                    ? `Activo hace: ${fmtUptime(mk.uptime)}`
                    : `Inactivo desde: ${fmt12h(mk.lastLoggedOut)}`;
                  return (
                    <div onClick={() => setShowDiagDetail(v => !v)}
                      style={{ display:"flex", alignItems:"center", gap:6, flex:1, cursor:"pointer",
                        background: isConn ? T.greenLt : T.redLt, borderRadius:5, padding:"5px 8px",
                        border:`1px solid ${c}40` }}>
                      <div style={{ position:"relative", width:8, height:8, flexShrink:0 }}>
                        <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:c }} />
                        {isConn && <div className="sb-pulse" style={{ position:"absolute", inset:0, borderRadius:"50%", background:c }} />}
                      </div>
                      <span style={{ fontWeight:700, fontSize:11, color:c }}>{isConn ? "Conectado" : "Desconectado"}</span>
                      <span style={{ fontSize:10, color:T.muted, flex:1 }}>{resumen}</span>
                      <span style={{ fontSize:10, color:T.muted }}>{showDiagDetail ? "▲" : "▼"}</span>
                    </div>
                  );
                })()}
                <button onClick={consultarDiagnostico} disabled={diagLoad} className="sb-btn-action"
                  title="Refrescar diagnóstico"
                  style={{ ...S.btnSm("#ea580c"), opacity:diagLoad?0.6:1, fontSize:10, flexShrink:0, padding:"4px 7px" }}>
                  <RefreshCw size={11}/>
                </button>
              </div>

              {/* Detalle expandible */}
              {showDiagDetail && !diagLoad && diagResult && (() => {
                const mk = diagResult.mikrotik || {};
                const c = diagColor(mk.estado);
                const isConn = ["connected","conectado"].includes((mk.estado||"").toLowerCase());
                const nombreFmt = (cliente?.nombre||"")
                  .split(",").reverse().join(" ").trim()
                  .toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase()) || "cliente";
                return (
                  <div style={{ marginTop:8, background: isConn ? T.greenLt : T.redLt, border:`1px solid ${c}40`, borderRadius:5, padding:"10px 12px" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 14px" }}>
                      {[
                        ["IP", mk.ip],
                        [isConn ? "Activo hace" : "Inactivo desde", isConn ? fmtUptime(mk.uptime) : fmt12h(mk.lastLoggedOut)],
                        ["Router", mk.router?.nombre],
                        ["Profile", mk.profile],
                        ["Caller-ID", mk.callerId],
                      ].filter(([,v]) => v).map(([lbl, val]) => (
                        <div key={lbl}>
                          <div style={S.label}>{lbl}</div>
                          <div style={{ fontWeight:600, fontSize:11, color:T.navy }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {mk.disabled && (
                      <div style={{ marginTop:6, background:"#fef3c7", borderRadius:4, padding:"4px 8px", fontSize:11, color:"#92400e", fontWeight:600 }}>
                        Usuario deshabilitado en MikroTik
                      </div>
                    )}
                    {contact?.phone_number && (
                      <button onClick={async () => {
                          const texto = isConn
                            ? `Hola ${nombreFmt}, revisamos tu servicio y está funcionando correctamente ✅\nLleva activo ${fmtUptime(mk.uptime)} sin interrupciones.`
                            : `Hola ${nombreFmt}, revisamos tu servicio y detectamos que no está conectado desde las ${fmt12h(mk.lastLoggedOut)}. Estamos revisando la situación. 🔧`;
                          await fetch(PROXY_URL, {
                            method:"POST", headers:{"Content-Type":"application/json"},
                            body: JSON.stringify({ accion:"ChatwootMessage", payload:{ phone: contact.phone_number, message: texto, account_id: acctId||"1" } }),
                          }).catch(()=>{});
                          notify("✅ Diagnóstico enviado al cliente");
                        }}
                        style={{ display:"flex", alignItems:"center", gap:6, marginTop:10, padding:"7px 12px",
                          border:"none", borderRadius:6, background:"#0369a1", cursor:"pointer", fontSize:11,
                          fontWeight:600, color:"#fff", fontFamily:"inherit" }}>
                        <Send size={13}/> Enviar al cliente
                      </button>
                    )}
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
                {/* Fila compacta */}
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:T.muted, flexShrink:0 }}>Señal</span>
                  {senalLoad && <span style={{ fontSize:10, color:T.muted }}>Leyendo...</span>}
                  {!senalLoad && senal && (() => {
                    const c   = senalColor(senal.rx);
                    const lbl = senalLabel(senal.rx);
                    return (
                      <div onClick={() => setShowSenalDetail(v => !v)}
                        style={{ display:"flex", alignItems:"center", gap:6, flex:1, cursor:"pointer",
                          background:"#fff", borderRadius:5, padding:"5px 8px", border:`1px solid ${c}40` }}>
                        <span style={{ fontWeight:700, fontSize:12, color:c, fontFamily:"monospace" }}>{senal.rx} dBm</span>
                        <span style={{ fontSize:10, fontWeight:600, color:c }}>{lbl}</span>
                        <span style={{ fontSize:10, color:T.muted, marginLeft:"auto" }}>{showSenalDetail ? "▲" : "▼"}</span>
                      </div>
                    );
                  })()}
                  {!senalLoad && !senal && <span style={{ fontSize:10, color:T.muted }}>—</span>}
                  <button onClick={consultarSenal} disabled={senalLoad} className="sb-btn-action"
                    title="Refrescar señal"
                    style={{ ...S.btnSm(senalLoad?T.muted:T.blue), opacity:senalLoad?0.6:1, fontSize:10, flexShrink:0, padding:"4px 7px" }}>
                    <RefreshCw size={11}/>
                  </button>
                </div>

                {/* Detalle expandible */}
                {showSenalDetail && senal && (
                  <div style={{ marginTop:8 }}>
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
                    <div style={{ fontSize:10, color:T.muted, textAlign:"right", marginTop:4 }}>
                      SN: {snOnu} · {senal.ts}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ BOTONES ACTIVAR / SUSPENDER ══ */}
        {(suspendido || estadoServicio === "ACTIVO") && (
          <div style={{ padding:"8px 8px 0", display:"flex", gap:6 }}>
            {suspendido && (
              <button onClick={activarServicio} disabled={activando} className="sb-btn-action"
                style={{ ...S.btn(T.green), flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, opacity:activando?0.6:1, borderRadius:5 }}>
                <Zap size={14} />{activando ? "Activando..." : "Activar servicio"}
              </button>
            )}
            {estadoServicio === "ACTIVO" && (
              <button onClick={suspenderServicio} disabled={suspendiendo} className="sb-btn-action"
                style={{ ...S.btn(T.amber), flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, opacity:suspendiendo?0.6:1, borderRadius:5 }}>
                <Zap size={14} />{suspendiendo ? "Suspendiendo..." : "Suspender servicio"}
              </button>
            )}
          </div>
        )}

        {/* ══ BANNER ORDEN ACTIVA ══ */}
        {(() => {
          const ESTADOS_FINALES = ["liquidada","cancelada","completada","finalizada"];
          const activas = ordenesCliente.filter(o => !ESTADOS_FINALES.includes((o.estado||"").toLowerCase()));
          if (!activas.length) return null;
          const ultima = activas[0];
          return (
            <div style={{ padding:"8px 8px 0" }}>
              <div style={{ background:"#eff6ff", borderLeft:`3px solid #3b82f6`, border:`1px solid #bfdbfe`,
                borderRadius:5, padding:"10px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#1d4ed8", textTransform:"uppercase", letterSpacing:"0.3px", marginBottom:2 }}>
                    {activas.length === 1 ? "Orden activa" : `${activas.length} órdenes activas`}
                  </div>
                  <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:12, color:"#1e3a8a" }}>{ultima.codigo}</div>
                  <div style={{ fontSize:11, color:"#3b82f6", marginTop:1 }}>
                    {ultima.tipo_actuacion} · {ultima.tecnico || "Sin técnico"} · {(ultima.fecha_actuacion||"").slice(0,10)}
                  </div>
                </div>
                <button onClick={() => setShowHistorial(true)}
                  style={{ background:"#3b82f6", color:"#fff", border:"none", borderRadius:5,
                    padding:"6px 12px", fontWeight:700, fontSize:11, cursor:"pointer", flexShrink:0 }}>
                  Ver →
                </button>
              </div>
            </div>
          );
        })()}

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

        {/* ══ HISTORIAL COLAPSABLE ══ */}
        {(ordenesCliente.length > 0 || liquidacionesCliente.length > 0) && (
          <div style={{ padding:"6px 8px 0" }}>
            <button onClick={() => setShowHistorial(v => !v)}
              style={{ width:"100%", background:showHistorial ? T.accent : T.bg,
                border:`1px solid ${T.border}`, borderRadius:5, padding:"7px 12px",
                display:"flex", alignItems:"center", justifyContent:"space-between",
                cursor:"pointer", fontFamily:"inherit" }}>
              <span style={{ fontSize:11, fontWeight:700, color:T.blue }}>
                Historial de órdenes y liquidaciones
              </span>
              <span style={{ fontSize:12, color:T.muted, fontWeight:700 }}>
                {showHistorial ? "▲ Ocultar" : "▼ Ver"}
              </span>
            </button>

            {showHistorial && (
              <div style={{ ...S.card, padding:"12px 14px", marginTop:6 }}>
                {historialLoad && <div style={{ color:T.muted, fontSize:12, textAlign:"center", padding:8 }}>Cargando...</div>}

                {/* Órdenes */}
                {ordenesCliente.length > 0 && (<>
                  <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Órdenes</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:12 }}>
                    {ordenesCliente.map(o => {
                      const FINALES = ["liquidada","cancelada","completada","finalizada"];
                      const finalizada = FINALES.includes((o.estado||"").toLowerCase());
                      const cancelada  = (o.estado||"").toLowerCase() === "cancelada";
                      const color = finalizada ? "#16a34a" : cancelada ? "#9ca3af" : "#f59e0b";
                      const bg    = finalizada ? "#f0fdf4"  : cancelada ? "#f9fafb"  : "#fffbeb";
                      const border= finalizada ? "#86efac"  : cancelada ? "#e5e7eb"  : "#fde68a";
                      return (
                        <div key={o.id} style={{ background:bg, border:`1px solid ${border}`, borderRadius:5, padding:"8px 10px" }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                            <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:11, color:T.navy }}>{o.codigo}</span>
                            <span style={{ background:color, color:"#fff", borderRadius:3, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{o.estado||"Pendiente"}</span>
                          </div>
                          <div style={{ fontSize:11, color:T.muted }}>{o.tipo_actuacion} · {o.tecnico||"—"} · {(o.fecha_actuacion||"").slice(0,10)}</div>
                          {o.descripcion && <div style={{ fontSize:10, color:"#64748b", marginTop:2, fontStyle:"italic" }}>{o.descripcion.slice(0,70)}{o.descripcion.length>70?"…":""}</div>}
                        </div>
                      );
                    })}
                  </div>
                </>)}

                {/* Liquidaciones */}
                {liquidacionesCliente.length > 0 && (<>
                  <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Liquidaciones</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    {liquidacionesCliente.map((l, i) => (
                      <div key={i} style={{ background:T.greenLt, border:`1px solid #86efac`, borderRadius:5, padding:"8px 10px" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:11, color:T.navy }}>{l.codigo||"—"}</span>
                          {l.monto_cobrado > 0 && <span style={{ fontWeight:700, fontSize:11, color:T.green }}>S/ {Number(l.monto_cobrado).toFixed(2)}</span>}
                        </div>
                        <div style={{ fontSize:11, color:T.muted }}>{l.tipo_actuacion} · {l.tecnico_liquida||"—"} · {String(l.fecha_liquidacion||"").slice(0,10)||"—"}</div>
                        {l.resultado_final && <div style={{ fontSize:10, color:T.green, marginTop:2, fontWeight:600 }}>{l.resultado_final}</div>}
                      </div>
                    ))}
                  </div>
                </>)}
              </div>
            )}
          </div>
        )}

        {/* ══ TABS ══ */}
        <div style={{ background:T.card, marginTop:8, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, display:"flex" }}>
          {[["info","Facturas"],["pago","Pago"],["prorroga","Prorr."],["nueva","Factura"],["editar","Editar"],["orden","Orden"]].map(([t, label]) => (
            <button key={t} className="sb-tab-btn"
              onClick={() => { setTab(t); if (t === "prorroga" && !prorrInfo) consultarProrroga(); if (t === "orden") setOrdenCreada(null); if (t === "editar") cargarPerfiles(); }}
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
                      <th style={{ textAlign:"left", padding:"6px 6px" }}>#Fac.</th>
                      <th style={{ textAlign:"left", padding:"6px 6px" }}>Estado</th>
                      <th style={{ textAlign:"right", padding:"6px 6px" }}>Total</th>
                      <th style={{ textAlign:"left", padding:"6px 6px" }}>Vence</th>
                      <th style={{ textAlign:"left", padding:"6px 6px" }}>Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factRecientes.map((f) => {
                      const isPag = ["pagado","PAGADO","paid"].includes(f.estado);
                      const isAnu = ["anulado","ANULADO","cancelled","canceled"].includes(f.estado);
                      const fid   = f.idfactura || f.id;
                      const badgeBg = isPag ? T.green : isAnu ? "#9ca3af" : T.blue;
                      return (
                        <React.Fragment key={fid}>
                          <tr onClick={e => { e.stopPropagation(); setMenuAbierto(menuAbierto === fid ? null : fid); }}
                            style={{ cursor:"pointer", background: menuAbierto === fid ? T.accent : "transparent" }}>
                            <td style={{ fontWeight:600, color:T.blue, fontSize:11, padding:"7px 6px" }}>#{fid}</td>
                            <td style={{ padding:"7px 6px" }}>
                              <span style={{ background:badgeBg, color:"#fff", borderRadius:3, padding:"2px 6px", fontSize:9, fontWeight:700, display:"inline-block" }}>
                                {isPag ? "PAGADO" : isAnu ? "ANULADO" : "PENDIENTE"}
                              </span>
                            </td>
                            <td style={{ textAlign:"right", fontWeight:700, color:T.navy, fontSize:11, padding:"7px 6px" }}>S/ {Number(f.total||f.monto||0).toFixed(2)}</td>
                            <td style={{ color:T.muted, fontSize:10, padding:"7px 6px" }}>{f.vencimiento||"—"}</td>
                            <td style={{ color:T.muted, fontSize:10, padding:"7px 6px" }}>
                              {(f.fechapago && f.fechapago !== "0000-00-00") ? f.fechapago : "—"}
                              {(f.formapago||f.pasarela||f.forma_pago) && <div style={{ fontSize:9, color:T.muted, marginTop:1 }}>{f.formapago||f.pasarela||f.forma_pago}</div>}
                            </td>
                          </tr>

                          {/* Acciones inline al tocar la fila */}
                          {menuAbierto === fid && (
                            <tr onClick={e=>e.stopPropagation()}>
                              <td colSpan={5} style={{ padding:"0 6px 8px 6px", background:T.accent }}>
                                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                  {!isPag && !isAnu && (
                                    <button onClick={() => { setFormPago(p=>({...p,idfactura:String(fid),monto:String(Number(f.total||0).toFixed(2))})); setTab("pago"); setMenuAbierto(null); }}
                                      style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px",
                                        border:"none", borderRadius:6, background:T.blue, cursor:"pointer", fontSize:11, fontWeight:600,
                                        color:"#fff", fontFamily:"inherit" }}>
                                      <CreditCard size={13}/> Registrar pago
                                    </button>
                                  )}
                                  {isPag && (
                                    <button onClick={() => { eliminarPago(fid); setMenuAbierto(null); }}
                                      disabled={deletingPago===fid}
                                      style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px",
                                        border:"none", borderRadius:6, background:"#b45309", cursor:"pointer", fontSize:11, fontWeight:600,
                                        color:"#fff", fontFamily:"inherit", opacity:deletingPago===fid?0.5:1 }}>
                                      <XCircle size={13}/> {deletingPago===fid?"Eliminando...":"Anular pago"}
                                    </button>
                                  )}
                                  <button onClick={() => { eliminarFactura(fid); setMenuAbierto(null); }}
                                    disabled={deletingFact===fid}
                                    style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px",
                                      border:"none", borderRadius:6, background:"#b91c1c", cursor:"pointer", fontSize:11, fontWeight:600,
                                      color:"#fff", fontFamily:"inherit", opacity:deletingFact===fid?0.5:1 }}>
                                    <Trash2 size={13}/> {deletingFact===fid?"Eliminando...":"Eliminar factura"}
                                  </button>
                                  {f.urlpdf && (
                                    <a href={f.urlpdf} target="_blank" rel="noopener noreferrer"
                                      style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px",
                                        border:"none", borderRadius:6, background:"#059669", cursor:"pointer", fontSize:11, fontWeight:600,
                                        color:"#fff", fontFamily:"inherit", textDecoration:"none" }}>
                                      <FileText size={13}/> Ver PDF
                                    </a>
                                  )}
                                  {f.urlpdf && contact?.phone_number && (
                                    <button onClick={async () => {
                                        setMenuAbierto(null);
                                        const nombreRaw = cliente?.nombre || "";
                                        const nombreFmt = nombreRaw
                                          ? (nombreRaw.includes(",")
                                            ? nombreRaw.split(",").reverse().join(" ").trim()
                                            : nombreRaw).toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
                                          : "cliente";
                                        const texto = `Hola ${nombreFmt}, te compartimos el PDF de tu factura *#${fid}* por *S/ ${Number(f.total||0).toFixed(2)}*:\n\n📄 ${f.urlpdf}\n\nCualquier consulta estamos a tu disposición. 💙`;
                                        await fetch(PROXY_URL, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ accion: "ChatwootMessage", payload: { phone: contact.phone_number, message: texto, account_id: acctId || "1" } }),
                                        }).catch(() => {});
                                        notify("✅ PDF enviado al cliente");
                                      }}
                                      style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px",
                                        border:"none", borderRadius:6, background:"#0369a1", cursor:"pointer", fontSize:11, fontWeight:600,
                                        color:"#fff", fontFamily:"inherit" }}>
                                      <Send size={13}/> Enviar PDF
                                    </button>
                                  )}
                                </div>

                                {/* ── Detalle de factura ── */}
                                <div style={{ marginTop:10, padding:"10px 12px", background:"#f8fafc", borderRadius:6, border:"1px solid #e2e8f0" }}>
                                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(80px, 1fr))", gap:"6px 12px", fontSize:10, color:"#475569" }}>
                                    {f.emitido && (
                                      <div>
                                        <div style={{ fontWeight:700, color:"#94a3b8", textTransform:"uppercase", fontSize:9, marginBottom:2 }}>Emitido</div>
                                        <div style={{ fontWeight:600, color:"#0f172a" }}>{f.emitido}</div>
                                      </div>
                                    )}
                                    {f.tipo_factura && (
                                      <div>
                                        <div style={{ fontWeight:700, color:"#94a3b8", textTransform:"uppercase", fontSize:9, marginBottom:2 }}>Tipo</div>
                                        <div style={{ fontWeight:600, color:"#0f172a" }}>{f.tipo_factura}</div>
                                      </div>
                                    )}
                                    {f.subtotal2 && (
                                      <div>
                                        <div style={{ fontWeight:700, color:"#94a3b8", textTransform:"uppercase", fontSize:9, marginBottom:2 }}>Subtotal</div>
                                        <div style={{ fontWeight:600, color:"#0f172a" }}>{f.subtotal2}</div>
                                      </div>
                                    )}
                                    {f.impuesto2 && (
                                      <div>
                                        <div style={{ fontWeight:700, color:"#94a3b8", textTransform:"uppercase", fontSize:9, marginBottom:2 }}>IGV</div>
                                        <div style={{ fontWeight:600, color:"#0f172a" }}>{f.impuesto2}</div>
                                      </div>
                                    )}
                                    {f.cobrado != null && (
                                      <div>
                                        <div style={{ fontWeight:700, color:"#94a3b8", textTransform:"uppercase", fontSize:9, marginBottom:2 }}>Cobrado</div>
                                        <div style={{ fontWeight:600, color: Number(f.cobrado) >= Number(f.total) ? "#16a34a" : Number(f.cobrado) > 0 ? "#d97706" : "#94a3b8" }}>
                                          S/ {Number(f.cobrado).toFixed(2)}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Historial de pagos */}
                                  {Array.isArray(f.operaciones) && f.operaciones.length > 0 && (
                                    <div style={{ marginTop:10 }}>
                                      <div style={{ fontWeight:700, color:"#94a3b8", textTransform:"uppercase", fontSize:9, marginBottom:6 }}>Pagos registrados</div>
                                      {f.operaciones.map((op, i) => (
                                        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                                          padding:"5px 8px", background:"#fff", borderRadius:4, border:"1px solid #e2e8f0",
                                          marginBottom: i < f.operaciones.length - 1 ? 4 : 0, fontSize:10 }}>
                                          <div>
                                            <div style={{ fontWeight:600, color:"#0f172a" }}>{op.forma_pago || "—"}</div>
                                            <div style={{ color:"#94a3b8", fontSize:9 }}>
                                              {op.fecha_pago ? op.fecha_pago.slice(0,16).replace("T"," ") : "—"}
                                              {op.transaccion ? ` · Ref: ${op.transaccion}` : ""}
                                            </div>
                                          </div>
                                          <div style={{ fontWeight:700, color:"#16a34a", fontSize:11 }}>S/ {Number(op.cobrado||0).toFixed(2)}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
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
              const minDate = new Date(prorrInfo.corte); minDate.setDate(minDate.getDate() + 1);
              const maxDate = new Date(prorrInfo.corte); maxDate.setDate(maxDate.getDate() + prorrInfo.diasMax);
              const minStr  = minDate.toISOString().split("T")[0];
              const maxStr  = maxDate.toISOString().split("T")[0];
              const extStr  = prorrInfo.extStr || maxStr;
              const esSelExt = prorrForm.fecha && prorrForm.fecha > maxStr;
              const diasSelec = prorrForm.fecha
                ? Math.round((new Date(prorrForm.fecha+"T00:00:00") - new Date(prorrInfo.corte)) / 86400000)
                : 0;

              // ── Calendario custom ─────────────────────────────────────────
              const calBase  = prorrForm.calMes
                ? new Date(prorrForm.calMes + "-01T00:00:00")
                : new Date(minStr + "T00:00:00");
              const calYear  = calBase.getFullYear();
              const calMonth = calBase.getMonth();
              const primerDia = new Date(calYear, calMonth, 1).getDay();
              const diasEnMes = new Date(calYear, calMonth + 1, 0).getDate();
              const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
              const DIAS_SEMANA = ["Do","Lu","Ma","Mi","Ju","Vi","Sa"];
              const calKey = `${calYear}-${String(calMonth+1).padStart(2,"0")}`;
              const irMes = (delta) => {
                const nd = new Date(calYear, calMonth + delta, 1);
                setProrrForm(p => ({ ...p, calMes: `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}` }));
              };

              return (<>
                <div style={{ border:`1px solid ${T.border}`, borderRadius:5, overflow:"hidden", marginBottom:12 }}>
                  {[["Factura", `#${prorrInfo.idfactura}`], ["Vencimiento", prorrInfo.vencimiento],
                    ["Días máx.", `${prorrInfo.diasMax} días`], ["Fecha límite", prorrInfo.fechaMaxStr]
                  ].map(([l, v], i, arr) => (
                    <div key={l} style={{ display:"grid", gridTemplateColumns:"110px 1fr",
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
                    Suspendido — máximo 3 días de prórroga
                  </div>
                )}

                {/* ── Calendario interactivo ── */}
                <div style={{ border:`1px solid ${T.border}`, borderRadius:8, overflow:"hidden", marginBottom:12, userSelect:"none" }}>
                  {/* Cabecera mes */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    background:T.blue, padding:"8px 12px" }}>
                    <button onClick={() => irMes(-1)}
                      style={{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:4,
                        color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", padding:"2px 10px", lineHeight:1.4 }}>‹</button>
                    <span style={{ color:"#fff", fontWeight:700, fontSize:13 }}>{MESES[calMonth]} {calYear}</span>
                    <button onClick={() => irMes(1)}
                      style={{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:4,
                        color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", padding:"2px 10px", lineHeight:1.4 }}>›</button>
                  </div>
                  {/* Días semana */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:T.accent }}>
                    {DIAS_SEMANA.map(d => (
                      <div key={d} style={{ textAlign:"center", padding:"5px 0", fontSize:10, fontWeight:700, color:T.blue }}>{d}</div>
                    ))}
                  </div>
                  {/* Celdas */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:"#fff" }}>
                    {Array.from({ length: primerDia }).map((_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: diasEnMes }, (_, i) => {
                      const dia = i + 1;
                      const fechaStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
                      const selec    = fechaStr === prorrForm.fecha;
                      const valida   = fechaStr >= minStr && fechaStr <= maxStr;
                      const esExt    = !valida && fechaStr > maxStr && fechaStr <= extStr;
                      const clickable = valida || esExt;
                      const esDom    = (primerDia + i) % 7 === 0;
                      // Colores: normal=azul, extendida=naranja, seleccionada extendida=ámbar
                      const bgSelec  = esExt || selec && esSelExt ? "#f59e0b" : T.blue;
                      const colorNormal = valida ? (esDom ? "#dc2626" : T.navy) : esExt ? "#92400e" : "#d1d5db";
                      return (
                        <div key={dia}
                          onClick={() => clickable && setProrrForm(p => ({ ...p, fecha: fechaStr }))}
                          style={{
                            textAlign:"center", padding:"7px 0", fontSize:12,
                            fontWeight: selec ? 800 : clickable ? 600 : 400,
                            cursor: clickable ? "pointer" : "default",
                            color: selec ? "#fff" : colorNormal,
                            background: selec ? bgSelec : esExt ? "#fffbeb" : "transparent",
                            borderRadius: selec ? "50%" : esExt ? 4 : 0,
                            margin: selec ? "1px auto" : 0,
                            width: selec ? 28 : "auto",
                            height: selec ? 28 : "auto",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            transition:"background .1s",
                          }}
                          onMouseEnter={e => { if (clickable && !selec) e.currentTarget.style.background = esExt ? "#fde68a" : T.accent; }}
                          onMouseLeave={e => { if (!selec) e.currentTarget.style.background = esExt ? "#fffbeb" : "transparent"; }}>
                          {dia}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Fecha seleccionada */}
                {prorrForm.fecha ? (
                  <div style={{
                    background: esSelExt ? "#fffbeb" : T.accent,
                    border: `1px solid ${esSelExt ? "#fde68a" : T.border}`,
                    borderLeft: `3px solid ${esSelExt ? "#f59e0b" : T.blue}`,
                    borderRadius:5, padding:"8px 12px", marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between"
                  }}>
                    <div>
                      <div style={{ fontSize:11, color: esSelExt ? "#92400e" : T.muted, fontWeight:600 }}>
                        {esSelExt ? "⚠️ Prórroga extendida" : "Fecha seleccionada"}
                      </div>
                      <div style={{ fontSize:13, fontWeight:800, color:T.navy }}>
                        {new Date(prorrForm.fecha+"T00:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"long",year:"numeric"})}
                      </div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color: esSelExt ? "#f59e0b" : T.blue }}>
                      +{diasSelec} día{diasSelec!==1?"s":""}
                    </div>
                  </div>
                ) : (
                  <div style={{ color:T.muted, fontSize:11, textAlign:"center", marginBottom:12 }}>
                    Toca un día resaltado para seleccionar la fecha
                  </div>
                )}

                <button onClick={registrarProrroga} disabled={prorrando || !prorrForm.fecha} className="sb-btn-action"
                  style={{ ...S.btn(prorrando || !prorrForm.fecha ? "#9ca3af" : esSelExt ? "#f59e0b" : T.blue),
                    opacity: prorrando || !prorrForm.fecha ? 0.55 : 1 }}>
                  {prorrando ? "Registrando..." : esSelExt ? "Confirmar prórroga extendida" : "Confirmar prórroga"}
                </button>
                {convId && <div style={{ color:T.muted, fontSize:11, textAlign:"center", marginTop:5 }}>El cliente será notificado automáticamente</div>}
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
        {tab === "editar" && (<>
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

          {/* ── Editar servicio ── */}
          {detalle?._servicio && (
            <div style={{ ...S.card, marginTop:8 }}>
              <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ fontWeight:700, fontSize:13, color:T.navy }}>Editar servicio</div>
                <div style={{ fontSize:11, color:T.muted }}>Plan actual: <strong>{detalle._servicio.perfil}</strong></div>
              </div>
              <div>
                {/* Plan */}
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"10px 12px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Plan</div>
                  <div style={{ padding:"6px 10px", display:"flex", alignItems:"center", gap:6 }}>
                    <select style={{ ...S.input, border:"none", padding:"4px 0", background:"transparent", borderBottom:`1px solid ${T.border}`, borderRadius:0, fontSize:12, flex:1 }}
                      value={svcForm.id_perfil}
                      onChange={e => {
                        const pid = e.target.value;
                        const plan = perfiles.find(p => String(p.id) === pid);
                        setSvcForm(f => ({ ...f, id_perfil: pid, precio: plan ? plan.costo : f.precio }));
                      }}>
                      <option value="">— {loadingPerf ? "Cargando..." : errorPerf ? "Error al cargar" : "Seleccionar plan"} —</option>
                      {perfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.plan} — S/ {p.costo}</option>
                      ))}
                    </select>
                    <button onClick={() => cargarPerfiles(true)} title="Recargar planes"
                      style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:5, padding:"3px 7px", cursor:"pointer", fontSize:12, color:T.muted, flexShrink:0 }}>
                      ↺
                    </button>
                  </div>
                </div>
                {/* Precio */}
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"10px 12px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Precio (S/)</div>
                  <div style={{ padding:"6px 10px" }}>
                    <input style={{ ...S.input, border:"none", padding:"4px 0", background:"transparent", borderBottom:`1px solid ${T.border}`, borderRadius:0 }}
                      type="number" step="0.01" placeholder={detalle._servicio.costo || "0.00"}
                      value={svcForm.precio}
                      onChange={e => setSvcForm(f => ({ ...f, precio: e.target.value }))} />
                  </div>
                </div>
                {/* PPPoE usuario */}
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"10px 12px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Usuario PPPoE</div>
                  <div style={{ padding:"6px 10px" }}>
                    <input style={{ ...S.input, border:"none", padding:"4px 0", background:"transparent", borderBottom:`1px solid ${T.border}`, borderRadius:0, fontFamily:"monospace", fontSize:11 }}
                      type="text" placeholder={detalle._servicio.pppuser || "user@americanet"}
                      value={svcForm.pppuser}
                      onChange={e => setSvcForm(f => ({ ...f, pppuser: e.target.value }))} />
                  </div>
                </div>
                {/* PPPoE contraseña */}
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"10px 12px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Contraseña PPPoE</div>
                  <div style={{ padding:"6px 10px" }}>
                    <input style={{ ...S.input, border:"none", padding:"4px 0", background:"transparent", borderBottom:`1px solid ${T.border}`, borderRadius:0, fontFamily:"monospace", fontSize:11 }}
                      type="text" placeholder={detalle._servicio.ppppass || "contraseña"}
                      value={svcForm.ppppass}
                      onChange={e => setSvcForm(f => ({ ...f, ppppass: e.target.value }))} />
                  </div>
                </div>
                {/* IP */}
                <div style={{ display:"grid", gridTemplateColumns:"120px 1fr" }}>
                  <div style={{ padding:"10px 12px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>IP</div>
                  <div style={{ padding:"6px 10px" }}>
                    <input style={{ ...S.input, border:"none", padding:"4px 0", background:"transparent", borderBottom:`1px solid ${T.border}`, borderRadius:0, fontFamily:"monospace", fontSize:11 }}
                      type="text" placeholder={detalle._servicio.ip || "192.168.x.x"}
                      value={svcForm.ip}
                      onChange={e => setSvcForm(f => ({ ...f, ip: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div style={{ padding:"12px 14px" }}>
                <button onClick={editarServicio} disabled={guardandoSvc || !svcForm.id_perfil} className="sb-btn-action"
                  style={{ ...S.btn(guardandoSvc || !svcForm.id_perfil ? "#9ca3af" : "#7c3aed"), opacity: guardandoSvc || !svcForm.id_perfil ? 0.55 : 1 }}>
                  {guardandoSvc ? "Guardando..." : "Actualizar servicio"}
                </button>
              </div>
            </div>
          )}
        </>)}

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
              {/* Botones rápidos de tipo */}
              <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                {[
                  { label:"🔧 Incidencia",    tipo:"Incidencia Internet",         orden:"INCIDENCIA",           cobrar:"NO" },
                  { label:"📡 Instalación",   tipo:"Instalacion Internet",         orden:"ORDEN DE SERVICIO",    cobrar:"SI" },
                  { label:"📺 Cable",         tipo:"Instalacion Internet y Cable", orden:"ORDEN DE SERVICIO",    cobrar:"SI" },
                  { label:"📦 Recuperación",  tipo:"Recojo de equipo",             orden:"RECUPERACION DE EQUIPO", cobrar:"NO" },
                ].map(({ label, tipo, orden:ot, cobrar }) => (
                  <button key={tipo} onClick={() => setOrdenForm(p=>({...p, tipoActuacion:tipo, ordenTipo:ot, solicitarPago:cobrar, montoCobrar: cobrar==="NO" ? "" : p.montoCobrar }))}
                    style={{ ...S.btnSm(ordenForm.tipoActuacion===tipo ? T.blue : "#e5e7eb"),
                      color: ordenForm.tipoActuacion===tipo ? "#fff" : T.slate,
                      borderRadius:20, padding:"5px 12px", fontSize:11, fontFamily:"inherit" }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Formulario */}
              <div style={{ border:`1px solid ${T.border}`, borderRadius:5, overflow:"hidden", marginBottom:12 }}>
                {/* Tipo de orden */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Orden</div>
                  <div>
                    <select style={{ ...S.select, border:"none", borderRadius:0, fontSize:12 }}
                      value={ordenForm.ordenTipo} onChange={e => {
                        const ot = e.target.value;
                        const tipoMap = {
                          "ORDEN DE SERVICIO":     "Instalacion Internet",
                          "INCIDENCIA":            "Incidencia Internet",
                          "MANTENIMIENTO":         "Mantenimiento",
                          "RECUPERACION DE EQUIPO":"Recojo de equipo",
                        };
                        setOrdenForm(p=>({...p, ordenTipo:ot, tipoActuacion: tipoMap[ot] || p.tipoActuacion }));
                      }}>
                      <option>ORDEN DE SERVICIO</option>
                      <option>INCIDENCIA</option>
                      <option>MANTENIMIENTO</option>
                      <option>RECUPERACION DE EQUIPO</option>
                    </select>
                  </div>
                </div>
                {/* Tipo de actuación */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Actuación</div>
                  <div>
                    <select style={{ ...S.select, border:"none", borderRadius:0, fontSize:12 }}
                      value={ordenForm.tipoActuacion} onChange={e => {
                        const ta = e.target.value;
                        const ordenMap = {
                          "Instalacion Internet":         "ORDEN DE SERVICIO",
                          "Instalacion Internet y Cable": "ORDEN DE SERVICIO",
                          "Instalacion TV":               "ORDEN DE SERVICIO",
                          "Incidencia Internet":          "INCIDENCIA",
                          "Mantenimiento":                "MANTENIMIENTO",
                          "Visita Tecnica":               "ORDEN DE SERVICIO",
                          "Recojo de equipo":             "RECUPERACION DE EQUIPO",
                        };
                        const cobrarMap = {
                          "Instalacion Internet": "SI", "Instalacion Internet y Cable": "SI", "Instalacion TV": "SI",
                          "Incidencia Internet": "NO", "Mantenimiento": "NO", "Visita Tecnica": "NO", "Recojo de equipo": "NO",
                        };
                        const cobrar = cobrarMap[ta] ?? p.solicitarPago;
                        setOrdenForm(p => ({...p, tipoActuacion: ta, ordenTipo: ordenMap[ta] || p.ordenTipo, solicitarPago: cobrar, montoCobrar: cobrar==="NO" ? "" : p.montoCobrar }));
                      }}>
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
                {/* Hora — sin spinners, con auto AM/PM */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Hora</div>
                  <div style={{ padding:"6px 8px" }}>
                    {(() => {
                      const h24str = ordenForm.hora || "";
                      const [hhStr, mmStr] = h24str.split(":");
                      const hh24 = parseInt(hhStr || "0", 10);
                      const cur12 = hh24 === 0 ? 12 : hh24 > 12 ? hh24 - 12 : hh24;
                      const curAmpm = hh24 >= 12 ? "PM" : "AM";
                      const curMm = mmStr || "00";
                      const aA = (h) => { const n=parseInt(h,10); if(isNaN(n)) return "AM"; return (n>=1&&n<=6)?"PM":"AM"; };
                      const sH = (h,mm,ampm) => { let h2=parseInt(h,10); if(isNaN(h2)||h2<1||h2>12) return ""; if(ampm==="PM") h2=h2===12?12:h2+12; else h2=h2===12?0:h2; return `${String(h2).padStart(2,"0")}:${String(parseInt(mm||"0",10)).padStart(2,"0")}`; };
                      return (
                        <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                          <input type="number" min="1" max="12" className="sb-hora-num"
                            style={{ ...S.input, width:44, textAlign:"center", padding:"5px 4px", fontSize:14, fontWeight:800 }}
                            value={h24str ? cur12 : ""} placeholder="H"
                            onChange={e => { const ampm=aA(e.target.value); setOrdenForm(p=>({...p,hora:sH(e.target.value,curMm,ampm)})); }}
                            onBlur={e => { const h=parseInt(e.target.value,10); if(!h||h<1||h>12) return; setOrdenForm(p=>({...p,hora:sH(h,curMm,aA(h))})); }} />
                          <span style={{ fontWeight:800, fontSize:16, color:T.muted }}>:</span>
                          <input type="number" min="0" max="59" className="sb-hora-num"
                            style={{ ...S.input, width:44, textAlign:"center", padding:"5px 4px", fontSize:14, fontWeight:800 }}
                            value={h24str ? curMm : ""} placeholder="MM"
                            onChange={e => { const mm=String(parseInt(e.target.value||"0",10)).padStart(2,"0"); setOrdenForm(p=>({...p,hora:sH(cur12,mm,curAmpm)})); }} />
                          <button type="button"
                            onClick={() => { const na=curAmpm==="AM"?"PM":"AM"; setOrdenForm(p=>({...p,hora:sH(cur12,curMm,na)})); }}
                            style={{ padding:"6px 12px", borderRadius:6, border:`2px solid ${curAmpm==="PM"?"#f59e0b":"#3b82f6"}`, background:curAmpm==="PM"?"#fef3c7":"#eff6ff", color:curAmpm==="PM"?"#92400e":"#1e40af", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                            {h24str ? curAmpm : "AM/PM"}
                          </button>
                          {h24str && <span style={{ fontSize:12, color:T.muted, fontWeight:700 }}>{cur12}:{curMm} {curAmpm}</span>}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                {/* Prioridad */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Prioridad</div>
                  <div>
                    <select style={{ ...S.select, border:"none", borderRadius:0, fontSize:12 }}
                      value={ordenForm.prioridad} onChange={e => setOrdenForm(p => ({...p, prioridad:e.target.value}))}>
                      <option>Normal</option>
                      <option>Alta</option>
                      <option>Urgente</option>
                    </select>
                  </div>
                </div>
                {/* Solicitar pago */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Cobrar</div>
                  <div>
                    <select style={{ ...S.select, border:"none", borderRadius:0, fontSize:12 }}
                      value={ordenForm.solicitarPago} onChange={e => setOrdenForm(p => ({...p, solicitarPago:e.target.value, montoCobrar: e.target.value==="NO" ? "" : p.montoCobrar}))}>
                      <option value="SI">SI</option>
                      <option value="NO">NO</option>
                    </select>
                  </div>
                </div>
                {/* Monto a cobrar */}
                {ordenForm.solicitarPago === "SI" && (
                  <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Monto S/</div>
                    <div>
                      <input type="number" step="0.01" placeholder="0.00"
                        style={{ ...S.input, border:"none", borderRadius:0, fontSize:12 }}
                        value={ordenForm.montoCobrar} onChange={e => setOrdenForm(p => ({...p, montoCobrar:e.target.value}))} />
                    </div>
                  </div>
                )}
                {/* Campos solo para instalación */}
                {["Instalacion Internet","Instalacion Internet y Cable","Instalacion TV"].includes(ordenForm.tipoActuacion) && (<>
                  {/* Nodo — seleccionable para instalaciones */}
                  <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Nodo</div>
                    <div>
                      <select style={{ ...S.select, border:"none", borderRadius:0, fontSize:12 }}
                        value={ordenForm.nodo || `Nod_${String(cliente.nodo).padStart(2,"0")}`}
                        onChange={e => {
                          const n = e.target.value;
                          setOrdenForm(p=>({...p, nodo:n, empresa:empresaPorNodo(n), usuarioNodo:""}));
                          setUsuariosNodo([]);
                          setShowUsuarioDrop(false);
                          if(n) cargarUsuariosNodo(n);
                        }}>
                        {NODOS_BASE.map(n => <option key={n} value={n}>{n} ({empresaPorNodo(n)})</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Velocidad</div>
                    <div>
                      <select style={{ ...S.select, border:"none", borderRadius:0, fontSize:12 }}
                        value={ordenForm.velocidad} onChange={e => setOrdenForm(p=>({...p, velocidad:e.target.value}))}>
                        <option value="">— Seleccionar —</option>
                        {["100 Mbps","200 Mbps","300 Mbps","400 Mbps","500 Mbps","600 Mbps","800 Mbps","1000 Mbps"].map(v=><option key={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Precio plan</div>
                    <div>
                      <input style={{ ...S.input, border:"none", borderRadius:0, fontSize:12 }} type="number" placeholder="S/ 0.00"
                        value={ordenForm.precioPlan} onChange={e => setOrdenForm(p=>({...p, precioPlan:e.target.value}))} />
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Usuario nodo</div>
                    <div style={{ position:"relative" }}>
                      <input style={{ ...S.input, border:"none", borderRadius:0, fontSize:12 }}
                        placeholder="user@americanet"
                        value={ordenForm.usuarioNodo}
                        onChange={e => setOrdenForm(p=>({...p, usuarioNodo:e.target.value}))}
                        onFocus={() => { setShowUsuarioDrop(true); const n = ordenForm.nodo || `Nod_${String(cliente.nodo).padStart(2,"0")}`; if(!usuariosNodo.length && n) cargarUsuariosNodo(n); }}
                        onBlur={() => setTimeout(()=>setShowUsuarioDrop(false),150)} />
                      {showUsuarioDrop && usuariosNodo.length > 0 && (
                        <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#fff", border:`1px solid ${T.border}`, borderRadius:6, boxShadow:"0 4px 16px rgba(0,0,0,0.12)", zIndex:999, maxHeight:180, overflowY:"auto" }}>
                          {usuariosNodo.map((u,i) => (
                            <div key={u.usuario} onMouseDown={() => { setOrdenForm(p=>({...p, usuarioNodo:u.usuario})); setShowUsuarioDrop(false); }}
                              style={{ padding:"8px 12px", cursor:u.ocupado?"default":"pointer", fontSize:12, display:"flex", justifyContent:"space-between", alignItems:"center",
                                color:u.ocupado?"#dc2626":i===0?"#1e40af":"#374151", fontWeight:i===0?700:400,
                                background:i===0&&!u.ocupado?"#eff6ff":"transparent", borderBottom:i<usuariosNodo.length-1?`1px solid ${T.border}`:"none" }}>
                              <span>{u.usuario}{i===0&&!u.ocupado?" ✓":""}</span>
                              {u.ocupado && <span style={{ fontSize:10, background:"#fef2f2", color:"#dc2626", borderRadius:4, padding:"1px 6px", fontWeight:700 }}>Ocupado</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Contraseña PPP</div>
                    <div>
                      <input style={{ ...S.input, border:"none", borderRadius:0, fontSize:12 }} type="text" placeholder="aqp0021"
                        value={ordenForm.passwordUsuario} onChange={e => setOrdenForm(p=>({...p, passwordUsuario:e.target.value}))} />
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>SN ONU</div>
                    <div>
                      <input style={{ ...S.input, border:"none", borderRadius:0, fontSize:12 }} type="text" placeholder="HWTC12345678"
                        value={ordenForm.snOnu} onChange={e => setOrdenForm(p=>({...p, snOnu:e.target.value}))} />
                    </div>
                  </div>
                </>)}
                {/* Autor */}
                <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ padding:"8px 10px", background:T.bg, borderRight:`1px solid ${T.border}`, fontSize:11, fontWeight:600, color:T.muted, display:"flex", alignItems:"center" }}>Autor</div>
                  <div>
                    {autorLista.length > 0 ? (
                      <select style={{ ...S.select, border:"none", borderRadius:0, fontSize:12 }}
                        value={ordenForm.autorOrden} onChange={e => setOrdenForm(p => ({...p, autorOrden:e.target.value}))}>
                        <option value="">— Seleccionar autor —</option>
                        {autorLista.map(u => <option key={u.nombre} value={u.nombre}>{u.nombre}{u.rol !== "Tecnico" ? ` (${u.rol})` : ""}</option>)}
                      </select>
                    ) : (
                      <div style={{ padding:"8px 10px", fontSize:12, color:T.muted, fontStyle:"italic" }}>Cargando usuarios...</div>
                    )}
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
                  <div style={{ display:"flex", flexDirection:"column" }}>
                    <div style={{ display:"flex", alignItems:"center" }}>
                      <input style={{ ...S.input, border:"none", borderRadius:0, fontSize:11, flex:1, fontFamily:"monospace" }}
                        type="text" placeholder="-16.438490, -71.598208"
                        value={ordenForm.coordenadas}
                        onChange={e => { setOrdenForm(p => ({...p, coordenadas:e.target.value})); setShowOrdenMap(false); }} />
                      <button onClick={extraerCoordsDeChat} disabled={buscandoCoords}
                        title="Extraer ubicación del chat"
                        style={{ ...S.btnSm("#16a34a"), borderRadius:0, padding:"0 8px", height:"100%", fontSize:11, whiteSpace:"nowrap", flexShrink:0, opacity:buscandoCoords?0.6:1 }}>
                        {buscandoCoords ? "..." : "📍 Chat"}
                      </button>
                    </div>
                    {/* Selector cuando hay múltiples ubicaciones */}
                    {coordsLista.length > 0 && (
                      <div style={{ borderTop:`1px solid ${T.border}`, padding:"6px 8px", background:"#f0fdf4" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", marginBottom:5 }}>
                          📍 {coordsLista.length} ubicaciones encontradas — elegí una:
                        </div>
                        {coordsLista.map((c, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                            <button onClick={() => { setOrdenForm(p=>({...p,coordenadas:c})); setCoordsLista([]); setShowOrdenMap(false); }}
                              style={{ ...S.btnSm(ordenForm.coordenadas===c ? T.green : T.blue), fontSize:10, flex:1, textAlign:"left", padding:"4px 8px", fontFamily:"monospace" }}>
                              {ordenForm.coordenadas===c ? "✓ " : ""}{c}
                            </button>
                            <a href={`https://maps.google.com/?q=${c}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize:10, color:T.blue, textDecoration:"none", fontWeight:600, flexShrink:0 }}>G↗</a>
                          </div>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const [lat, lng] = (ordenForm.coordenadas || "").split(",").map(Number);
                      const valid = lat && lng && !isNaN(lat) && !isNaN(lng);
                      return valid ? (
                        <div style={{ display:"flex" }}>
                        <button onClick={() => setShowOrdenMap(m => !m)}
                          style={{ ...S.btnSm(showOrdenMap ? T.blueDk : T.blue), borderRadius:0, flex:1, padding:"4px 10px", fontSize:10, whiteSpace:"nowrap" }}>
                          {showOrdenMap ? "Ocultar mapa" : "Ver mapa"}
                        </button>
                        </div>
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

              <button onClick={crearOrden} disabled={creandoOrden || !ordenForm.tipoActuacion || !ordenForm.tecnico.trim() || !ordenForm.autorOrden.trim()}
                className="sb-btn-action"
                style={{ ...S.btn(creandoOrden || !ordenForm.tecnico.trim() || !ordenForm.autorOrden.trim() ? "#9ca3af" : T.blue),
                  opacity: creandoOrden || !ordenForm.tecnico.trim() || !ordenForm.autorOrden.trim() ? 0.55 : 1 }}>
                {creandoOrden ? "Creando orden..." : "Crear orden de servicio"}
              </button>
              {convId && <div style={{ color:T.muted, fontSize:11, textAlign:"center", marginTop:5 }}>Se enviará como nota interna en esta conversación</div>}
            </>)}
          </div>
        )}

        {/* ══ SETUP MIKROWISP ══ */}
        <div style={{ padding:"8px 8px 0" }}>
          <div style={S.divider} />
          <button onClick={() => { setMwOpen(v=>!v); if(!mwOpen) { setMwStep(0); setMwCliSupa(null); setMwMsg(""); } }}
            style={{ ...S.btn(mwOpen?"#6b7280":"#d97706"), display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom: mwOpen?8:0 }}>
            🚀 {mwOpen ? "Cerrar Setup Mikrowisp" : "Setup Mikrowisp"}
          </button>
          {mwOpen && (
            <div style={{ border:`1.5px solid #fcd34d`, borderRadius:8, overflow:"hidden", marginBottom:8 }}>
              <div style={{ background:"#fffbeb", padding:"8px 12px", borderBottom:`1px solid #fcd34d`, display:"flex", gap:2 }}>
                {["Buscar","Agregar","Servicio","Facturas","Sync"].map((s,i) => (
                  <div key={i} style={{ flex:1, textAlign:"center", fontSize:9, fontWeight:700,
                    color: mwStep===i?"#d97706": mwStep>i?"#16a34a":"#94a3b8",
                    borderBottom:`2px solid ${mwStep===i?"#d97706":mwStep>i?"#16a34a":"transparent"}`, paddingBottom:4 }}>
                    {mwStep>i?"✓":""}{s}
                  </div>
                ))}
              </div>
              <div style={{ padding:"12px" }}>
                {mwStep===0 && (
                  <div style={{ display:"grid", gap:8 }}>
                    <div style={{ fontSize:11, color:"#92400e" }}>Pendientes MW — Nod_01 · Nod_03 · Nod_04 · sin registrar</div>
                    <input style={{ ...S.input, fontSize:12 }} placeholder="DNI o nombre (opcional)..."
                      value={mwBusqVal} onChange={e=>setMwBusqVal(e.target.value)}
                      onKeyDown={e=>e.key==="Enter" && mwBuscarEnClientes()} />
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      <div><label style={S.label}>Desde</label><input type="date" style={{ ...S.input, fontSize:12 }} value={mwBusqDesde} onChange={e=>setMwBusqDesde(e.target.value)} /></div>
                      <div><label style={S.label}>Hasta</label><input type="date" style={{ ...S.input, fontSize:12 }} value={mwBusqHasta} onChange={e=>setMwBusqHasta(e.target.value)} /></div>
                    </div>
                    <button onClick={() => { setMwBusqEliminados(v=>!v); setMwResultados([]); setMwMsg(""); }}
                      style={{ ...S.btnOut, fontSize:11, color: mwBusqEliminados?"#dc2626":"#92400e", borderColor: mwBusqEliminados?"#fca5a5":"#fcd34d", background: mwBusqEliminados?"#fff5f5":"#fffbeb" }}>
                      {mwBusqEliminados ? "✕ Ocultar eliminados" : "🗑 Ver eliminados de MW"}
                    </button>
                    <button onClick={mwBuscarEnClientes} disabled={mwBusqLoad||(!mwBusqVal.trim()&&!mwBusqDesde&&!mwBusqHasta)}
                      style={{ ...S.btn(mwBusqEliminados?"#dc2626":T.blue), opacity:(mwBusqLoad||(!mwBusqVal.trim()&&!mwBusqDesde&&!mwBusqHasta))?0.5:1 }}>
                      {mwBusqLoad?"Buscando...": mwBusqEliminados?"🔍 Buscar eliminados":"🔍 Buscar pendientes"}
                    </button>
                    {mwResultados.length > 0 && (
                      <div style={{ border:`1px solid ${mwBusqEliminados?"#fca5a5":"#fcd34d"}`, borderRadius:6, overflow:"hidden" }}>
                        <div style={{ padding:"6px 10px", background: mwBusqEliminados?"#fff5f5":"#fffbeb", borderBottom:`1px solid ${mwBusqEliminados?"#fca5a5":"#fcd34d"}`, fontSize:10, fontWeight:700, color: mwBusqEliminados?"#dc2626":"#92400e" }}>
                          {mwResultados.length} {mwBusqEliminados?"eliminado":"pendiente"}{mwResultados.length!==1?"s":""} — click para seleccionar
                        </div>
                        {mwResultados.map((c, i) => (
                          <div key={c.id||c.dni} onClick={() => mwSeleccionarCliente(c)}
                            style={{ padding:"8px 10px", cursor:"pointer", background: i%2===0?"#fff": mwBusqEliminados?"#fff5f5":"#fffbeb",
                              borderBottom: i<mwResultados.length-1?`1px solid ${mwBusqEliminados?"#fecaca":"#fde68a"}`:"none",
                              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:12, color:"#0f172a" }}>{c.nombre}</div>
                              <div style={{ fontSize:10, color:"#64748b", marginTop:1 }}>DNI {c.dni} · <span style={{ color:"#0369a1", fontWeight:600 }}>{c.nodo}</span> · {String(c.fecha_registro||"").split("T")[0]}</div>
                            </div>
                            <span style={{ fontSize:10, color:"#d97706", fontWeight:700 }}>Setup →</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {mwMsg && <div style={{ fontSize:11, color:T.red, fontWeight:600 }}>{mwMsg}</div>}
                  </div>
                )}
                {mwStep===1 && mwCliSupa && (
                  <div style={{ display:"grid", gap:8 }}>
                    <div style={{ background:"#f0f9ff", border:`1px solid #bae6fd`, borderRadius:6, padding:"10px 12px" }}>
                      <div style={{ fontWeight:800, fontSize:13, color:"#0f172a", marginBottom:4 }}>{mwCliSupa.nombre}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"3px 12px", fontSize:11, color:"#475569" }}>
                        <span onClick={() => copiarAlPortapapeles(mwCliSupa.dni, "DNI")} title="Click para copiar DNI" style={{ cursor:"pointer" }}>DNI: <strong>{mwCliSupa.dni}</strong></span>
                        <span>Nodo: <strong>{mwCliSupa.nodo}</strong></span>
                        <span>Plan: <strong>{mwCliSupa.velocidad||"—"}</strong></span>
                        <span>S/: <strong>{mwCliSupa.precio_plan||"—"}</strong></span>
                        {mwCliSupa.celular && <span style={{gridColumn:"1/-1"}}>Tel: <strong>{mwCliSupa.celular}</strong></span>}
                        {mwCliSupa.direccion && <span style={{gridColumn:"1/-1"}}>Dir: <strong>{mwCliSupa.direccion}</strong></span>}
                        {mwCliSupa.email && <span style={{gridColumn:"1/-1"}}>Email: <strong>{mwCliSupa.email}</strong></span>}
                      </div>
                    </div>
                    {!MW_NODOS_OK.includes(String(mwCliSupa.nodo||"")) && (
                      <div style={{ background:"#fef9c3", border:`1px solid #fde047`, borderRadius:6, padding:"8px 10px", fontSize:11, color:"#854d0e", fontWeight:600 }}>
                        ⚠ Nodo {mwCliSupa.nodo} no habilitado para Mikrowisp (solo Nod_01, Nod_03, Nod_04).
                      </div>
                    )}
                    {MW_NODOS_OK.includes(String(mwCliSupa.nodo||"")) && (
                      <button onClick={mwAgregarMkw} disabled={mwAgregando} style={{ ...S.btn("#f59e0b"), opacity:mwAgregando?0.6:1 }}>
                        {mwAgregando?"Agregando...":"➕ Agregar a Mikrowisp"}
                      </button>
                    )}
                    <button onClick={()=>{setMwStep(0);setMwCliSupa(null);setMwMsg("");}} style={{ ...S.btnOut, textAlign:"center" }}>← Volver</button>
                    {mwMsg && <div style={{ fontSize:11, color:T.red, fontWeight:600 }}>{mwMsg}</div>}
                  </div>
                )}

                {/* Panel liquidaciones — visible en pasos 2 y 3 (instancia cliente encontrado) */}
                {(mwStep===2 || mwStep===3) && mwWizardLiq.length > 0 && (
                  <div style={{ background:"#f5f3ff", border:"1.5px solid #d8b4fe", borderRadius:10, padding:"10px 14px", marginBottom:4 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:"#7c3aed", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>📋 Liquidaciones del cliente</div>
                    <div style={{ display:"grid", gap:6 }}>
                      {mwWizardLiq.map((l,i) => {
                        const cobrado = l.cobro_realizado===true || l.cobro_realizado==="SI" || l.cobro_realizado===1;
                        return (
                          <div key={i} style={{ background:"#fff", border:`1px solid ${cobrado?"#86efac":"#fde047"}`, borderRadius:8, padding:"8px 10px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                                <span style={{ fontWeight:800, fontSize:12, color:"#7c3aed" }}>{l.codigo}</span>
                                <span style={{ fontSize:10, background: cobrado?"#dcfce7":"#fef9c3", color: cobrado?"#15803d":"#854d0e", padding:"1px 6px", borderRadius:99, fontWeight:700 }}>{cobrado?"✓ Cobrado":"Pendiente"}</span>
                              </div>
                              {l.monto_cobrado && <span style={{ fontWeight:800, fontSize:12, color: cobrado?"#16a34a":"#92400e" }}>S/{l.monto_cobrado}</span>}
                            </div>
                            <div style={{ fontSize:11, color:"#64748b", marginTop:3, display:"flex", gap:8, flexWrap:"wrap" }}>
                              {l.tipo_actuacion && <span>{l.tipo_actuacion}</span>}
                              {l.medio_pago && <span>· {l.medio_pago}</span>}
                              {l.tecnico_liquida && <span>· {l.tecnico_liquida}</span>}
                              {l.fecha_liquidacion && <span>· {String(l.fecha_liquidacion).slice(0,10)}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PASO 2 — Crear servicio */}
                {mwStep===2 && (
                  <div style={{ display:"grid", gap:8 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#16a34a" }}>✓ Cliente en Mikrowisp (ID: {mwMkwId})</div>
                    <div>
                      <label style={{ ...S.label }}>Plan *</label>
                      <select style={S.select} value={mwForm.id_perfil} onChange={e=>{ const pid=e.target.value; const pl=mwPerfiles.find(p=>String(p.id)===pid); setMwForm(f=>({...f,id_perfil:pid,costo:pl?String(pl.costo):f.costo})); }}>
                        <option value="">— Seleccionar plan —</option>
                        {mwPerfiles.map(p=><option key={p.id} value={p.id}>{p.plan} — S/{p.costo}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...S.label }}>Rango IPv4 *</label>
                      <select style={S.select} value={mwForm.id_red_ipv4} onChange={e=>setMwForm(f=>({...f,id_red_ipv4:e.target.value}))}>
                        <option value="">— Seleccionar rango —</option>
                        {mwRedes.map(r=><option key={r.id} value={r.id}>{r.red} ({r.disponibles??'?'} disp.)</option>)}
                      </select>
                    </div>
                    {mwPlantillas.length > 0 && (
                      <div>
                        <label style={{ ...S.label }}>Plantilla de facturación *</label>
                        <select style={S.select} value={mwPlantillaId} onChange={e=>setMwPlantillaId(Number(e.target.value))}>
                          {mwPlantillas.map(p => {
                            const cfg = p.datos?.config || {};
                            return <option key={p.id} value={p.id}>{p.nombre} — Día pago: {cfg.diapago} · Corte: {cfg.corteautomatico} días · {cfg.tipopago==="0"?"Prepago":"Postpago"}</option>;
                          })}
                        </select>
                      </div>
                    )}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      <div><label style={{ ...S.label }}>Fecha instalación</label><input type="date" style={{...S.input,fontSize:12}} value={mwForm.fecha_instalacion} onChange={e=>setMwForm(f=>({...f,fecha_instalacion:e.target.value}))} /></div>
                      <div><label style={{ ...S.label }}>Costo mensual S/</label><input type="number" style={{...S.input,fontSize:12}} value={mwForm.costo} onChange={e=>setMwForm(f=>({...f,costo:e.target.value}))} /></div>
                      <div><label style={{ ...S.label }}>Usuario PPP</label><input style={{...S.input,fontSize:12}} value={mwForm.userppp} onChange={e=>setMwForm(f=>({...f,userppp:e.target.value}))} /></div>
                      <div><label style={{ ...S.label }}>Contraseña PPP</label><input style={{...S.input,fontSize:12}} value={mwForm.passppp} onChange={e=>setMwForm(f=>({...f,passppp:e.target.value}))} /></div>
                    </div>
                    <div>
                      <label style={{ ...S.label }}>IP asignada <span style={{fontWeight:400,textTransform:"none"}}>(opcional)</span></label>
                      <div style={{ display:"flex", gap:6 }}>
                        <input style={{...S.input,fontSize:12,fontFamily:"monospace",flex:1}} placeholder="192.168.x.x" value={mwForm.ip} onChange={e=>setMwForm(f=>({...f,ip:e.target.value}))} />
                        <button onClick={mwBuscarIpMikrotik} disabled={mwIpLoad||!mwForm.userppp} style={{padding:"8px 10px",background:mwIpLoad?"#d1fae5":"#f0fdf4",border:"1.5px solid #86efac",borderRadius:8,fontSize:11,fontWeight:700,color:"#15803d",cursor:"pointer",whiteSpace:"nowrap",opacity:(!mwForm.userppp)?0.5:1}}>{mwIpLoad?"...":"🔍 IP MikroTik"}</button>
                      </div>
                    </div>
                    <div>
                      <label style={{ ...S.label }}>Coordenadas <span style={{fontWeight:400,textTransform:"none"}}>(opcional)</span></label>
                      <input style={{...S.input,fontSize:11,fontFamily:"monospace"}} placeholder="-16.438490, -71.598208" value={mwForm.coordenadas} onChange={e=>setMwForm(f=>({...f,coordenadas:e.target.value}))} />
                    </div>
                    <button onClick={mwCrearServicio} disabled={mwCreandoSvc||!mwForm.id_perfil||!mwForm.id_red_ipv4}
                      style={{ ...S.btn("#16a34a"), opacity:(mwCreandoSvc||!mwForm.id_perfil||!mwForm.id_red_ipv4)?0.5:1 }}>
                      {mwCreandoSvc?"Creando servicio...":"✓ Crear Servicio"}
                    </button>
                    {mwMsg && <div style={{ fontSize:11, color:T.red, fontWeight:600 }}>{mwMsg}</div>}
                  </div>
                )}

                {/* PASO 3 — Facturas */}
                {mwStep===3 && (() => {
                  const c="#7c3aed", bo="#d8b4fe";
                  const empresa=mwEsDim(mwCliSupa?.nodo)?"dimfiber":"americanet";
                  const pasarelas=PASARELAS[empresa]||PASARELAS.americanet;
                  const instDate=mwProrrFecha?new Date(mwProrrFecha+"T00:00:00"):null;
                  const venceDate=mwProrrVence?new Date(mwProrrVence+"T00:00:00"):null;
                  const prec=parseFloat(mwProrrPrec)||0;
                  let diasSvc=0,diasPer=0,montoAuto="";
                  if(instDate&&venceDate&&venceDate>instDate){diasSvc=Math.round((venceDate-instDate)/86400000);const ini=new Date(venceDate);ini.setMonth(ini.getMonth()-1);diasPer=Math.round((venceDate-ini)/86400000);if(prec>0&&diasPer>0)montoAuto=String(Math.round(prec*diasSvc/diasPer));}
                  return(<div style={{display:"grid",gap:8}}>
                    <div style={{display:"flex",gap:4}}>{[{s:1,l:"1️⃣ Pago instalación"},{s:2,l:"2️⃣ Prorrateo"}].map(({s,l})=>(<button key={s} onClick={()=>setMwFactSub(s)} style={{flex:1,padding:"6px",borderRadius:6,border:"none",fontSize:10,fontWeight:700,cursor:"pointer",background:mwFactSub===s?c:"#f5f3ff",color:mwFactSub===s?"#fff":c}}>{mwFactDone&&s===1?"✓ "+l:l}</button>))}</div>
                    {mwFactSub===1&&(<div style={{display:"grid",gap:8}}>
                      <div style={{display:"flex",gap:4}}>{[{m:"normal",l:"📄 Normal"},{m:"libre",l:"🎁 Libre/Promo"}].map(({m,l})=>(<button key={m} onClick={()=>setMwFactModo(m)} style={{flex:1,padding:"5px",borderRadius:5,border:"none",fontSize:10,fontWeight:700,cursor:"pointer",background:mwFactModo===m?c:"#f5f3ff",color:mwFactModo===m?"#fff":c}}>{l}</button>))}</div>
                      {mwFactModo==="libre"&&<input style={{...S.input,fontSize:12}} placeholder="Ej: Instalación Plan 100Mbps" value={mwFactDesc} onChange={e=>setMwFactDesc(e.target.value)} />}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                        <div><label style={S.label}>Monto S/ *</label><input type="number" step="0.01" style={{...S.input,fontSize:12}} placeholder="50.00" value={mwFactMonto} onChange={e=>setMwFactMonto(e.target.value)} /></div>
                        <div><label style={S.label}>Vencimiento *</label><input type="date" style={{...S.input,fontSize:12}} value={mwFactVence} onChange={e=>setMwFactVence(e.target.value)} /></div>
                      </div>
                      <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,fontWeight:600,color:c}}><input type="checkbox" checked={mwFactPagada} onChange={e=>setMwFactPagada(e.target.checked)} style={{width:14,height:14}} />Registrar como pagada</label>
                      {mwFactPagada&&<select style={{...S.select,fontSize:12}} value={mwFactPasarela} onChange={e=>setMwFactPasarela(e.target.value)}>{pasarelas.map(p=><option key={p}>{p}</option>)}</select>}
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={mwCrearFactura} disabled={mwFactCreando||!mwFactMonto||!mwFactVence||(mwFactModo==="libre"&&!mwFactDesc)} style={{...S.btn(c),flex:1,opacity:(mwFactCreando||!mwFactMonto||!mwFactVence)?0.5:1}}>{mwFactCreando?"Creando...":"✓ Crear y continuar →"}</button>
                        <button onClick={()=>{setMwFactDone(true);setMwFactSub(2);setMwProrrFecha(mwForm.fecha_instalacion);setMwProrrPrec(mwForm.costo||String(mwCliSupa?.precio_plan||""));}} style={{...S.btnOut}}>Omitir</button>
                      </div>
                    </div>)}
                    {mwFactSub===2&&(<div style={{display:"grid",gap:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                        <div><label style={S.label}>F. Instalación</label><input type="date" style={{...S.input,fontSize:11}} value={mwProrrFecha} onChange={e=>setMwProrrFecha(e.target.value)} /></div>
                        <div><label style={S.label}>Próx. Vence *</label><input type="date" style={{...S.input,fontSize:11}} value={mwProrrVence} onChange={e=>setMwProrrVence(e.target.value)} /></div>
                        <div><label style={S.label}>Precio S/</label><input type="number" step="0.01" style={{...S.input,fontSize:11}} value={mwProrrPrec} onChange={e=>setMwProrrPrec(e.target.value)} /></div>
                      </div>
                      {montoAuto&&<div style={{background:"#f5f3ff",border:`1px solid ${bo}`,borderRadius:6,padding:"8px 10px",fontSize:11,color:c,fontWeight:700}}>S/{prec.toFixed(2)} × {diasSvc}d / {diasPer}d = <span style={{fontSize:14}}>S/{montoAuto}</span></div>}
                      <div><label style={S.label}>Monto prorrateo S/ <span style={{fontWeight:400,textTransform:"none"}}>(editable)</span></label><input type="number" step="0.01" style={{...S.input,fontSize:12}} placeholder={montoAuto||"Auto-calculado"} value={mwProrrMonto} onChange={e=>setMwProrrMonto(e.target.value)} /></div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={mwCrearProrrateo} disabled={mwFactCreando||!mwProrrVence||!(parseFloat(mwProrrMonto||montoAuto)>0)} style={{...S.btn(c),flex:1,opacity:(mwFactCreando||!mwProrrVence)?0.5:1}}>{mwFactCreando?"Creando...":"✓ Crear prorrateo →"}</button>
                        <button onClick={()=>setMwStep(4)} style={{...S.btnOut}}>Omitir</button>
                      </div>
                    </div>)}
                    {mwMsg&&<div style={{fontSize:11,color:T.red,fontWeight:600}}>{mwMsg}</div>}
                  </div>);
                })()}

                {/* PASO 4 — Sync */}
                {mwStep===4 && (
                  <div style={{ display:"grid", gap:10 }}>
                    <div style={{ fontSize:11, color:"#64748b" }}>Sincroniza los datos del cliente entre Supabase y Mikrowisp para que n8n los use.</div>
                    {mwSyncDone?(<div style={{background:"#fff7ed",border:"1.5px solid #fdba74",borderRadius:8,padding:"12px",display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:22}}>✅</span><div style={{fontWeight:800,fontSize:12,color:"#c2410c"}}>Sincronizado correctamente</div></div>):(<button onClick={mwSincronizar} disabled={mwSyncLoad} style={{...S.btn("#0369a1"),opacity:mwSyncLoad?0.6:1}}>{mwSyncLoad?"⏳ Sincronizando...":"📱 Sincronizar con Mikrowisp"}</button>)}
                    <button onClick={mwEnviarSms} disabled={mwSmsSent} style={{...S.btn("#7c3aed"),opacity:mwSmsSent?0.6:1}}>{mwSmsSent?"✓ SMS enviado":"💬 Enviar SMS Bienvenida"}</button>
                    {mwMsg&&<div style={{fontSize:11,color:mwMsg.startsWith("✓")?T.green:T.red,fontWeight:600}}>{mwMsg}</div>}
                    <button onClick={mwReset} style={{...S.btn(mwSyncDone?"#16a34a":"#6b7280")}}>{mwSyncDone?"✅ Finalizar":"Cerrar"}</button>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>

        {/* ══ NOTAS DEL CLIENTE ══ */}
        <div style={{ padding:"6px 8px 0" }}>
          <button onClick={() => setShowNotas(v => !v)}
            style={{ width:"100%", background: showNotas ? T.accent : T.bg,
              border:`1px solid ${T.border}`, borderRadius:5, padding:"7px 12px",
              display:"flex", alignItems:"center", justifyContent:"space-between",
              cursor:"pointer", fontFamily:"inherit" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#7c3aed" }}>
              📝 Notas del cliente {notasCliente.length > 0 && <span style={{ background:"#7c3aed", color:"#fff", borderRadius:99, padding:"1px 7px", fontSize:10, marginLeft:4 }}>{notasCliente.length}</span>}
            </span>
            <span style={{ fontSize:12, color:T.muted, fontWeight:700 }}>{showNotas ? "▲ Ocultar" : "▼ Ver"}</span>
          </button>
          {showNotas && (
            <div style={{ background:"#faf5ff", border:`1px solid #e9d5ff`, borderRadius:"0 0 6px 6px", padding:"10px 10px 8px" }}>
              {/* Formulario nueva nota */}
              <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                <textarea
                  placeholder="Agregar nota..."
                  value={notaNueva}
                  onChange={e => setNotaNueva(e.target.value)}
                  rows={2}
                  style={{ flex:1, padding:"7px 9px", border:"1.5px solid #d8b4fe", borderRadius:6, fontSize:12, fontFamily:"inherit", resize:"vertical", outline:"none" }}
                />
                <button onClick={() => guardarNota(cliente.cedula || detalle?.cedula)}
                  disabled={notaGuardando || !notaNueva.trim()}
                  style={{ padding:"0 12px", background: notaNueva.trim() ? "#7c3aed" : "#e9d5ff", color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:700, cursor: notaNueva.trim() ? "pointer" : "default", alignSelf:"stretch" }}>
                  {notaGuardando ? "..." : "✓"}
                </button>
              </div>
              {/* Lista de notas */}
              {notasCliente.length === 0 ? (
                <div style={{ fontSize:11, color:T.muted, textAlign:"center", padding:"6px 0" }}>Sin notas registradas</div>
              ) : (
                <div style={{ display:"grid", gap:6 }}>
                  {notasCliente.map(n => (
                    <div key={n.id} style={{ background:"#fff", border:"1px solid #e9d5ff", borderRadius:6, padding:"8px 10px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                        <div style={{ fontSize:10, color:"#7c3aed", fontWeight:700 }}>
                          {n.autor} · {new Date(n.created_at).toLocaleDateString("es-PE",{day:"2-digit",month:"short",year:"numeric"})} {new Date(n.created_at).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}
                        </div>
                        <button onClick={() => eliminarNota(n.id)}
                          style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#dc2626", padding:"0 2px", lineHeight:1 }}>✕</button>
                      </div>
                      <div style={{ fontSize:12, color:"#1e293b", lineHeight:1.5, whiteSpace:"pre-wrap" }}>{n.nota}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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
