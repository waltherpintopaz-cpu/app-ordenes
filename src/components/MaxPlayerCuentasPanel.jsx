import { useEffect, useState, useCallback, useMemo } from "react";
import { Tv, Search, Trash2, RefreshCw, Copy, Plus, Send, X, Activity, Columns3 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { normalizarEtiquetaNodo } from "../utils/nodos.js";

// Mismas credenciales que usa SidebarApp.jsx para crear/eliminar cuentas IPTV.
const MP_TOKEN  = "mNTO0Z5ynAIsPx7LWBzFX90N";
const MP_DOMAIN = "1777119384974866697";
const MP_NODO_SUFFIX = { 1:1, 2:2, 3:3, 5:4, 11:6 };
const NODOS = ["Nod_01", "Nod_02", "Nod_03", "Nod_04", "Nod_05", "Nod_06"];
const EMPRESAS_WHATSAPP = ["Americanet", "DIM"];
const XTREAM_BOUQUETS_TODOS = [1, 2, 3, 4, 5, 6, 7];
// Planes IPTV — cada uno es superset del anterior. 1=TV_BASICO 2=TV_PREMIUN
// 3=PELICULAS 4=SERIES 5=TV_DIGITAL 6=Privado 7=Free.
const PLANES_IPTV = {
  Free: [7],
  Standard: [1, 3, 7],
  Premium: [1, 2, 3, 4, 7],
};
const PLANES_IPTV_NOMBRES = Object.keys(PLANES_IPTV);
// Xtream propio — misma linea dedicada por cliente que crea SidebarApp.jsx,
// via proxy (server/xtreamProxyServer.mjs) para no exponer la API key en el navegador.
const XTREAM_PROXY_URL = String(import.meta.env.VITE_XTREAM_PROXY_URL || "").trim().replace(/\/+$/, "");

async function crearLineaXtreamPropia(usernameBase, maxConnections, expHoras = null, bouquets = XTREAM_BOUQUETS_TODOS) {
  if (!XTREAM_PROXY_URL) throw new Error("Falta configurar VITE_XTREAM_PROXY_URL");
  const rXUser = `src_${usernameBase}`;
  const rXPass = Math.random().toString(36).slice(2, 12);
  const rRes = await fetch(`${XTREAM_PROXY_URL}/api/xtream/create-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: rXUser,
      password: rXPass,
      max_connections: maxConnections,
      ...(expHoras ? { never: false, exp_hours: expHoras } : { never: true }),
      bouquets,
    }),
  });
  const rData = await rRes.json().catch(() => ({}));
  if (!rRes.ok || !rData?.success) {
    throw new Error(rData?.error || `Error Xtream ${rRes.status}`);
  }
  return { xtream_user_id: rData.user_id, xtream_username: rData.username, xtream_password: rData.password };
}

async function eliminarLineaXtreamPropia(xtreamUserId) {
  if (!xtreamUserId || !XTREAM_PROXY_URL) return;
  try {
    await fetch(`${XTREAM_PROXY_URL}/api/xtream/manage-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", user_id: xtreamUserId }),
    });
  } catch (_) { /* limpieza best-effort */ }
}

/** Crea la linea Xtream dedicada + la cuenta en MaxPlayer + guarda en iptv_clientes. */
async function crearCuentaMaxPlayer({ dniRaw, nodoRaw, nombreRaw, maxConnections, creadoPor, expHoras = null, esDemo = false, plan = "Premium" }) {
  const dni = String(dniRaw || "").replace(/\D/g, "");
  if (!dni) throw new Error("Sin DNI para crear usuario IPTV");
  const nodoStr = String(nodoRaw || "").trim();
  const matchNod = nodoStr.match(/^Nod_0?(\d+)$/i);
  const nodoNum = matchNod ? parseInt(matchNod[1], 10) : (MP_NODO_SUFFIX[Number(nodoRaw)] ?? 1);
  const iptvUser = `${dni}-${nodoNum}`;
  const iptvPass = dni.slice(0, 3) + dni.slice(3).split("").sort(() => Math.random() - 0.5).join("");
  const pantallas = Number(maxConnections) > 0 ? Number(maxConnections) : 1;
  // Las demos siempre llevan el catalogo completo, sin importar el plan seleccionado.
  const bouquetsPlan = esDemo ? XTREAM_BOUQUETS_TODOS : (PLANES_IPTV[plan] || PLANES_IPTV.Premium);

  const lineaXtream = await crearLineaXtreamPropia(iptvUser, pantallas, expHoras, bouquetsPlan);

  const res = await fetch("https://api.maxplayer.tv/v3/api/public/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Token": MP_TOKEN },
    body: JSON.stringify({ domain_id: MP_DOMAIN, iptv_user: lineaXtream.xtream_username, iptv_pass: lineaXtream.xtream_password, username: iptvUser, password: iptvPass }),
  });
  const data = await res.json();
  if (!res.ok) {
    await eliminarLineaXtreamPropia(lineaXtream.xtream_user_id);
    throw new Error(data?.message || data?.error || `Error ${res.status}`);
  }
  const userId = String(data.user_id || "");
  await fetch("https://api.maxplayer.tv/v3/api/public/users/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Api-Token": MP_TOKEN },
    body: JSON.stringify({ user_id: userId, password: iptvPass }),
  });

  const payload = {
    dni, iptv_usuario: iptvUser, iptv_password: iptvPass, iptv_user_id: userId,
    nodo: normalizarEtiquetaNodo(nodoRaw) || null, creado_por: creadoPor || null,
    xtream_user_id: lineaXtream.xtream_user_id, xtream_username: lineaXtream.xtream_username,
    max_connections: pantallas, nombre: String(nombreRaw || "").trim() || null,
    es_demo: esDemo, plan: esDemo ? "Premium" : plan,
    demo_exp_at: (esDemo && expHoras) ? new Date(Date.now() + Number(expHoras) * 3600000).toISOString() : null,
  };
  let upsertRes = await supabase.from("iptv_clientes").upsert(payload, { onConflict: "dni" });
  if (upsertRes.error) {
    const msg = String(upsertRes.error.message || "");
    const m = msg.match(/column ['"]?([a-z_]+)['"]? .*does not exist/i);
    if (m && Object.prototype.hasOwnProperty.call(payload, m[1])) {
      const retry = { ...payload };
      delete retry[m[1]];
      await supabase.from("iptv_clientes").upsert(retry, { onConflict: "dni" });
    } else if (upsertRes.error) {
      throw upsertRes.error;
    }
  }
  return { iptv_usuario: iptvUser, iptv_password: iptvPass, iptv_user_id: userId, xtream_user_id: lineaXtream.xtream_user_id, nombre: payload.nombre, nodo: payload.nodo, max_connections: pantallas, es_demo: esDemo };
}

function normalizarTelefonoPe(telefono) {
  let phone = String(telefono || "").replace(/[\s\-()]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (/^9\d{8}$/.test(phone)) phone = "51" + phone;
  return phone;
}

const primerNombre = (n) => {
  const raw = String(n || "").trim();
  if (!raw) return "cliente";
  const base = raw.includes(",") ? raw.split(",")[1]?.trim().split(" ")[0] : raw.split(" ")[0];
  if (!base) return "cliente";
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
};

/** Envia las credenciales por WhatsApp usando el mismo texto que SidebarApp.jsx (enviarIPTV). */
async function enviarCredencialesWhatsapp({ empresa, celular, nombre, iptv_usuario, iptv_password }) {
  const phone = normalizarTelefonoPe(celular);
  if (!phone) return { ok: false, msg: "Ingresa un celular válido." };
  const { data: cfg } = await supabase
    .from("whatsapp_config")
    .select("base_url,api_key,instance_name,habilitado")
    .eq("empresa", empresa)
    .maybeSingle();
  if (!cfg?.habilitado || !cfg?.base_url || !cfg?.api_key || !cfg?.instance_name) {
    return { ok: false, msg: `WhatsApp no está configurado/habilitado para ${empresa}.` };
  }
  const nombreFmt = primerNombre(nombre);
  const texto = `📺 *CREDENCIALES MAXPLAYER*\n\nHola ${nombreFmt}, aquí están tus datos de acceso a *MaxPlayer*:\n\n*Usuario:* ${iptv_usuario}\n*Contraseña:* ${iptv_password}\n\nDescarga la app *MaxPlayer* e ingresa con estos datos. 🎬\n\n💡 *Tip:* Para una mejor experiencia conecta tu TV por *cable de red* o a la red *WiFi 5GHz* con buena cobertura.`;
  const url = `${cfg.base_url.replace(/\/$/, "")}/message/sendText/${cfg.instance_name}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.api_key },
      body: JSON.stringify({ number: phone, text: texto }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, msg: `Error ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e?.message || "Error de red enviando el mensaje." };
  }
}

function formatearUltimaConexion(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffSeg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSeg < 60) return "hace unos segundos";
  if (diffSeg < 3600) return `hace ${Math.floor(diffSeg / 60)} min`;
  if (diffSeg < 86400) return `hace ${Math.floor(diffSeg / 3600)} h`;
  if (diffSeg < 86400 * 30) return `hace ${Math.floor(diffSeg / 86400)} d`;
  return d.toLocaleDateString("es-PE");
}

function formatearDuracion(seg) {
  if (seg == null) return "—";
  if (seg < 60) return `${seg}s`;
  if (seg < 3600) return `${Math.floor(seg / 60)}min`;
  return `${Math.floor(seg / 3600)}h ${Math.floor((seg % 3600) / 60)}min`;
}

const COLUMNAS_CUENTAS = [
  { key: "usuario",        label: "Usuario MaxPlayer", defecto: false },
  { key: "dni",             label: "DNI",               defecto: true },
  { key: "cliente",         label: "Nombre",            defecto: true },
  { key: "estado",          label: "Estado",            defecto: false },
  { key: "nodo",            label: "Nodo",               defecto: true },
  { key: "plan",            label: "Plan",               defecto: true },
  { key: "pantallas",       label: "Pantallas",          defecto: true },
  { key: "ultimaConexion",  label: "Última conexión",    defecto: true },
  { key: "creado",          label: "Creación",           defecto: true },
];
const COLUMNAS_STORAGE_KEY = "maxplayer_cuentas_columnas_v1";

function cargarColumnasVisibles() {
  const base = Object.fromEntries(COLUMNAS_CUENTAS.map((c) => [c.key, c.defecto]));
  try {
    const guardado = JSON.parse(localStorage.getItem(COLUMNAS_STORAGE_KEY) || "null");
    if (guardado && typeof guardado === "object") return { ...base, ...guardado };
  } catch (_) { /* localStorage no disponible o corrupto: usar defecto */ }
  return base;
}

const ESTADO_COLOR = {
  ACTIVO: { bg: "#dcfce7", fg: "#166534" },
  SUSPENDIDO: { bg: "#fef3c7", fg: "#92400e" },
  CORTADO: { bg: "#fee2e2", fg: "#991b1b" },
};

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(String(text || "")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button onClick={copy} title="Copiar"
      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: copied ? "#16a34a" : "#9ca3af", display: "inline-flex" }}>
      <Copy size={12} />
    </button>
  );
}

function IconActionBtn({ onClick, disabled, title, bg, fg, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        background: bg, color: fg, border: "none", borderRadius: 8, width: 30, height: 30,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, marginLeft: 6,
      }}
    >
      {children}
    </button>
  );
}

export default function MaxPlayerCuentasPanel({ theme, soloBusquedaDni = false }) {
  const isDark = theme === "dark";
  const [cuentas, setCuentas] = useState([]);
  const [clientesMap, setClientesMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDni, setBusquedaDni] = useState("");
  const [yaBusco, setYaBusco] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [eliminandoDni, setEliminandoDni] = useState("");
  const [toast, setToast] = useState("");

  // Crear cuenta
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [crearForm, setCrearForm] = useState({ dni: "", nombre: "", nodo: NODOS[0], pantallas: "1", plan: "Premium" });
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [creando, setCreando] = useState(false);
  const [crearMsg, setCrearMsg] = useState("");

  // Enviar credenciales
  const [envioRow, setEnvioRow] = useState(null);
  const [envioCelular, setEnvioCelular] = useState("");
  const [envioEmpresa, setEnvioEmpresa] = useState(EMPRESAS_WHATSAPP[0]);
  const [enviando, setEnviando] = useState(false);

  // Editar pantallas
  const [actualizandoDni, setActualizandoDni] = useState("");

  // Columnas visibles de la tabla (elegibles por el usuario, persistidas)
  const [columnasVisibles, setColumnasVisibles] = useState(cargarColumnasVisibles);
  const [mostrarColumnas, setMostrarColumnas] = useState(false);

  const toggleColumna = (key) => {
    setColumnasVisibles((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(COLUMNAS_STORAGE_KEY, JSON.stringify(next)); } catch (_) { /* best-effort */ }
      return next;
    });
  };

  // Ver conexiones (online + historial en vivo desde Xtream)
  const [conexionesRow, setConexionesRow] = useState(null);
  const [conexionesData, setConexionesData] = useState(null);
  const [cargandoConexiones, setCargandoConexiones] = useState(false);
  const [conexionesError, setConexionesError] = useState("");

  // Crear demo
  const [mostrarDemo, setMostrarDemo] = useState(false);
  const [demoForm, setDemoForm] = useState({ nombre: "", pantallas: "1", horas: "24" });
  const [creandoDemo, setCreandoDemo] = useState(false);
  const [demoMsg, setDemoMsg] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const cargar = useCallback(async (dniExacto) => {
    setLoading(true);
    setError("");
    try {
      let query = supabase
        .from("iptv_clientes")
        .select("dni,iptv_usuario,iptv_password,iptv_user_id,nodo,creado_por,created_at,xtream_user_id,max_connections,nombre,es_demo,plan,ultima_conexion,en_linea,ips_24h")
        .order("created_at", { ascending: false });
      query = dniExacto ? query.eq("dni", dniExacto) : query;
      let { data: iptv, error: errIptv } = await query;
      if (errIptv && /column .*ultima_conexion|column .*en_linea|column .*ips_24h/i.test(errIptv.message || "")) {
        // Migracion supabase/sql/20260826_iptv_ultima_conexion.sql aun no corrida.
        let fallback = supabase
          .from("iptv_clientes")
          .select("dni,iptv_usuario,iptv_password,iptv_user_id,nodo,creado_por,created_at,xtream_user_id,max_connections,nombre,es_demo,plan")
          .order("created_at", { ascending: false });
        fallback = dniExacto ? fallback.eq("dni", dniExacto) : fallback;
        ({ data: iptv, error: errIptv } = await fallback);
      }
      if (errIptv) throw errIptv;

      const dnis = (iptv || []).map((r) => r.dni).filter(Boolean);
      const mapa = {};
      if (dnis.length > 0) {
        const { data: mkw } = await supabase
          .from("mikrowisp_clientes")
          .select("cedula,nombre,estado")
          .in("cedula", dnis);
        (mkw || []).forEach((c) => {
          // Si el mismo DNI aparece en mas de un nodo, se prioriza el que este ACTIVO.
          if (!mapa[c.cedula] || c.estado === "ACTIVO") mapa[c.cedula] = c;
        });
      }
      setClientesMap(mapa);
      setCuentas(iptv || []);
    } catch (e) {
      setError("Error cargando cuentas: " + (e?.message || String(e)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!soloBusquedaDni) cargar();
  }, [cargar, soloBusquedaDni]);

  const buscarPorDniGestor = () => {
    const dni = busquedaDni.trim();
    if (!/^\d{8}$/.test(dni)) {
      setError("Ingresa un DNI válido de 8 dígitos.");
      return;
    }
    setError("");
    setYaBusco(true);
    cargar(dni);
  };

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return cuentas
      .map((c) => ({ ...c, cliente: clientesMap[c.dni] || null }))
      .filter((c) => {
        if (filtroEstado === "sin_cliente" && c.cliente) return false;
        if (filtroEstado && filtroEstado !== "sin_cliente" && c.cliente?.estado !== filtroEstado) return false;
        if (!q) return true;
        return (
          String(c.dni || "").toLowerCase().includes(q) ||
          String(c.iptv_usuario || "").toLowerCase().includes(q) ||
          String(c.nombre || c.cliente?.nombre || "").toLowerCase().includes(q)
        );
      });
  }, [cuentas, clientesMap, busqueda, filtroEstado]);

  const stats = useMemo(() => {
    const total = cuentas.length;
    const inactivas = cuentas.filter((c) => {
      const cli = clientesMap[c.dni];
      return !cli || cli.estado === "SUSPENDIDO" || cli.estado === "CORTADO";
    }).length;
    return { total, inactivas };
  }, [cuentas, clientesMap]);

  const eliminarCuenta = async (row) => {
    const nombreRef = row.nombre || row.cliente?.nombre || row.iptv_usuario;
    if (!window.confirm(`¿Eliminar la cuenta MaxPlayer de "${nombreRef}" (usuario ${row.iptv_usuario})?\n\nEsto la borra de MaxPlayer y de nuestro sistema. No se puede deshacer.`)) return;
    setEliminandoDni(row.dni);
    try {
      if (row.iptv_user_id) {
        const res = await fetch(`https://api.maxplayer.tv/v3/api/public/users/${row.iptv_user_id}`, {
          method: "DELETE",
          headers: { "Api-Token": MP_TOKEN },
        });
        // Si MaxPlayer ya no la tenia (404) igual seguimos y la limpiamos de nuestro lado.
        if (!res.ok && res.status !== 404) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.message || data?.error || `Error ${res.status} en MaxPlayer`);
        }
      }
      await eliminarLineaXtreamPropia(row.xtream_user_id);
      await supabase.from("iptv_clientes").delete().eq("dni", row.dni);
      setCuentas((prev) => prev.filter((c) => c.dni !== row.dni));
      showToast(`✅ Cuenta de ${nombreRef} eliminada`);
    } catch (e) {
      showToast("❌ Error: " + (e?.message || String(e)));
    }
    setEliminandoDni("");
  };

  const buscarClientePorDni = async () => {
    const dni = crearForm.dni.trim();
    if (!/^\d{8}$/.test(dni)) return;
    setBuscandoCliente(true);
    try {
      const { data } = await supabase
        .from("mikrowisp_clientes")
        .select("nombre,nodo,estado")
        .eq("cedula", dni);
      const match = (data || []).find((c) => c.estado === "ACTIVO") || (data || [])[0] || null;
      if (match) {
        const nodoNormalizado = normalizarEtiquetaNodo(match.nodo);
        setCrearForm((p) => ({ ...p, nombre: match.nombre || p.nombre, nodo: NODOS.includes(nodoNormalizado) ? nodoNormalizado : p.nodo }));
        setCrearMsg("");
      } else {
        setCrearMsg("No se encontró un cliente con ese DNI en Mikrowisp — completa nombre y nodo manualmente.");
      }
    } catch (_) {
      setCrearMsg("No se pudo buscar el cliente, completa manualmente.");
    }
    setBuscandoCliente(false);
  };

  const handleCrearCuenta = async () => {
    const dni = crearForm.dni.trim();
    if (!/^\d{8}$/.test(dni)) return setCrearMsg("Ingresa un DNI válido de 8 dígitos.");
    if (!crearForm.nombre.trim()) return setCrearMsg("Ingresa el nombre del cliente.");
    setCreando(true);
    setCrearMsg("");
    try {
      const nueva = await crearCuentaMaxPlayer({
        dniRaw: dni,
        nodoRaw: crearForm.nodo,
        nombreRaw: crearForm.nombre,
        maxConnections: crearForm.pantallas,
        creadoPor: "Panel MaxPlayer",
        plan: crearForm.plan,
      });
      setCuentas((prev) => [{ dni, iptv_usuario: nueva.iptv_usuario, iptv_password: nueva.iptv_password, iptv_user_id: nueva.iptv_user_id, xtream_user_id: nueva.xtream_user_id, nodo: nueva.nodo, nombre: nueva.nombre, max_connections: nueva.max_connections, created_at: new Date().toISOString(), creado_por: "Panel MaxPlayer" }, ...prev.filter((c) => c.dni !== dni)]);
      showToast(`✅ Cuenta creada: ${nueva.iptv_usuario}`);
      setMostrarCrear(false);
      setCrearForm({ dni: "", nombre: "", nodo: NODOS[0], pantallas: "1", plan: "Premium" });
    } catch (e) {
      setCrearMsg(e?.message || "No se pudo crear la cuenta.");
    }
    setCreando(false);
  };

  const handleCrearDemo = async () => {
    if (!demoForm.nombre.trim()) return setDemoMsg("Ingresa un nombre o identificador (ej. nombre del prospecto).");
    setCreandoDemo(true);
    setDemoMsg("");
    // DNI sintetico de 8 digitos (el prospecto no esta registrado como cliente real).
    const dniDemo = String(90000000 + (Date.now() % 9999999)).slice(0, 8);
    try {
      const nueva = await crearCuentaMaxPlayer({
        dniRaw: dniDemo,
        nodoRaw: "Nod_01",
        nombreRaw: `DEMO - ${demoForm.nombre.trim()}`,
        maxConnections: demoForm.pantallas,
        creadoPor: "Panel MaxPlayer (demo)",
        expHoras: Number(demoForm.horas),
        esDemo: true,
      });
      setCuentas((prev) => [{ dni: dniDemo, iptv_usuario: nueva.iptv_usuario, iptv_password: nueva.iptv_password, iptv_user_id: nueva.iptv_user_id, xtream_user_id: nueva.xtream_user_id, nodo: nueva.nodo, nombre: nueva.nombre, max_connections: nueva.max_connections, es_demo: true, created_at: new Date().toISOString(), creado_por: "Panel MaxPlayer (demo)" }, ...prev]);
      showToast(`✅ Demo creada: ${nueva.iptv_usuario} (vence en ${demoForm.horas}h)`);
      setMostrarDemo(false);
      setDemoForm({ nombre: "", pantallas: "1", horas: "24" });
    } catch (e) {
      setDemoMsg(e?.message || "No se pudo crear la demo.");
    }
    setCreandoDemo(false);
  };

  const abrirEnviar = (row) => {
    setEnvioRow(row);
    setEnvioCelular("");
    setEnvioEmpresa(EMPRESAS_WHATSAPP[0]);
  };

  const handleEnviar = async () => {
    if (!envioRow) return;
    setEnviando(true);
    const r = await enviarCredencialesWhatsapp({
      empresa: envioEmpresa,
      celular: envioCelular,
      nombre: envioRow.nombre || envioRow.cliente?.nombre || "",
      iptv_usuario: envioRow.iptv_usuario,
      iptv_password: envioRow.iptv_password,
    });
    setEnviando(false);
    if (r.ok) {
      showToast(`✅ Credenciales enviadas (${envioEmpresa})`);
      setEnvioRow(null);
    } else {
      showToast("❌ " + r.msg);
    }
  };

  const actualizarPantallas = async (row, nuevoValor) => {
    if (!row.xtream_user_id) {
      showToast("❌ Esta cuenta no tiene línea Xtream asociada (creada antes de la actualización), no se puede editar.");
      return;
    }
    if (!XTREAM_PROXY_URL) {
      showToast("❌ Falta configurar VITE_XTREAM_PROXY_URL.");
      return;
    }
    setActualizandoDni(row.dni);
    try {
      const res = await fetch(`${XTREAM_PROXY_URL}/api/xtream/manage-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", user_id: row.xtream_user_id, max_connections: Number(nuevoValor) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Error ${res.status}`);
      await supabase.from("iptv_clientes").update({ max_connections: Number(nuevoValor) }).eq("dni", row.dni);
      setCuentas((prev) => prev.map((c) => (c.dni === row.dni ? { ...c, max_connections: Number(nuevoValor) } : c)));
      showToast(`✅ Pantallas actualizadas a ${nuevoValor}`);
    } catch (e) {
      showToast("❌ " + (e?.message || String(e)));
    }
    setActualizandoDni("");
  };

  const actualizarPlan = async (row, nuevoPlan) => {
    if (!row.xtream_user_id) {
      showToast("❌ Esta cuenta no tiene línea Xtream asociada (creada antes de la actualización), no se puede editar.");
      return;
    }
    if (!XTREAM_PROXY_URL) {
      showToast("❌ Falta configurar VITE_XTREAM_PROXY_URL.");
      return;
    }
    setActualizandoDni(row.dni);
    try {
      const bouquets = PLANES_IPTV[nuevoPlan] || PLANES_IPTV.Premium;
      const res = await fetch(`${XTREAM_PROXY_URL}/api/xtream/manage-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", user_id: row.xtream_user_id, bouquets }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Error ${res.status}`);
      await supabase.from("iptv_clientes").update({ plan: nuevoPlan }).eq("dni", row.dni);
      setCuentas((prev) => prev.map((c) => (c.dni === row.dni ? { ...c, plan: nuevoPlan } : c)));
      showToast(`✅ Plan actualizado a ${nuevoPlan}`);
    } catch (e) {
      showToast("❌ " + (e?.message || String(e)));
    }
    setActualizandoDni("");
  };

  const abrirConexiones = async (row) => {
    if (!row.xtream_user_id) {
      showToast("❌ Esta cuenta no tiene línea Xtream asociada (creada antes de la actualización).");
      return;
    }
    if (!XTREAM_PROXY_URL) {
      showToast("❌ Falta configurar VITE_XTREAM_PROXY_URL.");
      return;
    }
    setConexionesRow(row);
    setConexionesData(null);
    setConexionesError("");
    setCargandoConexiones(true);
    try {
      const [resConn, resTop, resStatus] = await Promise.all([
        fetch(`${XTREAM_PROXY_URL}/api/xtream/connections`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: row.xtream_user_id, limit: 30 }),
        }),
        fetch(`${XTREAM_PROXY_URL}/api/xtream/top-channels`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: row.xtream_user_id, limit: 5 }),
        }),
        fetch(`${XTREAM_PROXY_URL}/api/xtream/xtream-status`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: [row.xtream_user_id] }),
        }),
      ]);
      const data = await resConn.json().catch(() => ({}));
      if (!resConn.ok || !data?.success) throw new Error(data?.error || `Error ${resConn.status}`);
      const topData = await resTop.json().catch(() => ({}));
      const statusData = await resStatus.json().catch(() => ({}));
      setConexionesData({
        ...data,
        channels: topData?.success ? topData.channels : [],
        xtreamStatus: statusData?.success ? statusData.result?.[String(row.xtream_user_id)] : null,
      });
    } catch (e) {
      setConexionesError(e?.message || "No se pudo cargar las conexiones.");
    }
    setCargandoConexiones(false);
  };

  const inputSt = { padding: "8px 12px", borderRadius: 8, border: isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb", fontSize: 13, background: isDark ? "#1a2740" : "#fff", color: isDark ? "#e6ecf7" : "#111827" };
  const thSt = { padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" };
  const tdSt = { padding: "10px 14px", verticalAlign: "middle", fontSize: 13 };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>
      {toast && (
        <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", borderRadius: 30, padding: "10px 24px", fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#2563eb", borderRadius: 10, padding: 8 }}><Tv size={22} color="#fff" /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: isDark ? "#e6ecf7" : undefined }}>Cuentas MaxPlayer</h2>
            {!soloBusquedaDni && (
              <p style={{ margin: 0, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>
                {stats.total} cuenta{stats.total !== 1 ? "s" : ""} creadas · {stats.inactivas} de cliente{stats.inactivas !== 1 ? "s" : ""} inactivo{stats.inactivas !== 1 ? "s" : ""} o no encontrado
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setMostrarCrear(true); setCrearMsg(""); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            <Plus size={14} /> Crear cuenta
          </button>
          <button onClick={() => { setMostrarDemo(true); setDemoMsg(""); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            <Plus size={14} /> Crear demo
          </button>
          {!soloBusquedaDni && (
            <button onClick={() => cargar()} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              <RefreshCw size={14} /> Actualizar
            </button>
          )}
          {!soloBusquedaDni && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setMostrarColumnas((v) => !v)} title="Elegir columnas visibles"
                style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                <Columns3 size={14} /> Columnas
              </button>
              {mostrarColumnas && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setMostrarColumnas(false)} />
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 9999, background: isDark ? "#1a2740" : "#fff", border: isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", padding: 10, width: 210 }}>
                    {COLUMNAS_CUENTAS.map((col) => (
                      <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: 13, color: isDark ? "#e6ecf7" : "#111827", cursor: "pointer" }}>
                        <input type="checkbox" checked={!!columnasVisibles[col.key]} onChange={() => toggleColumna(col.key)} />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {soloBusquedaDni ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            style={{ ...inputSt, flex: "1 1 220px" }}
            placeholder="DNI del cliente (8 dígitos)"
            value={busquedaDni}
            maxLength={8}
            onChange={(e) => setBusquedaDni(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && buscarPorDniGestor()}
          />
          <button onClick={buscarPorDniGestor} style={{ display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            <Search size={14} /> Buscar
          </button>
        </div>
      ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: isDark ? "#93a2bd" : "#9ca3af" }} />
          <input
            style={{ ...inputSt, width: "100%", paddingLeft: 34, boxSizing: "border-box" }}
            placeholder="Buscar por DNI, usuario o nombre del cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={inputSt}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Cliente activo</option>
          <option value="SUSPENDIDO">Cliente suspendido</option>
          <option value="CORTADO">Cliente cortado</option>
          <option value="sin_cliente">Sin cliente encontrado</option>
        </select>
        <span style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280", whiteSpace: "nowrap" }}>{filas.length} de {cuentas.length}</span>
      </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#6b7280" }}>Cargando...</div>
      ) : (
        <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflowX: "auto", overflowY: "hidden" }}>
          <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: isDark ? "#16213a" : "#f8fafc" }}>
                {columnasVisibles.usuario && <th style={thSt}>Usuario MaxPlayer</th>}
                {columnasVisibles.dni && <th style={thSt}>DNI</th>}
                {columnasVisibles.cliente && <th style={thSt}>Nombre</th>}
                {columnasVisibles.estado && <th style={thSt}>Estado</th>}
                {columnasVisibles.nodo && <th style={thSt}>Nodo</th>}
                {columnasVisibles.plan && <th style={thSt}>Plan</th>}
                {columnasVisibles.pantallas && <th style={thSt}>Pantallas</th>}
                {columnasVisibles.ultimaConexion && <th style={thSt}>Última conexión</th>}
                {columnasVisibles.creado && <th style={thSt}>Creación</th>}
                <th style={{ ...thSt, textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={COLUMNAS_CUENTAS.filter((c) => columnasVisibles[c.key]).length + 1} style={{ textAlign: "center", padding: 32, color: isDark ? "#93a2bd" : "#9ca3af" }}>
                  {soloBusquedaDni
                    ? (yaBusco ? "No se encontró una cuenta con ese DNI." : "Ingresa un DNI y presiona Buscar.")
                    : (busqueda || filtroEstado ? "Sin resultados." : "Sin cuentas registradas.")}
                </td></tr>
              )}
              {filas.map((c) => {
                const estado = c.cliente?.estado || null;
                const colores = estado ? ESTADO_COLOR[estado] : { bg: "#f3f4f6", fg: "#6b7280" };
                return (
                  <tr key={c.dni} style={{ borderTop: isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6" }}>
                    {columnasVisibles.usuario && (
                      <td style={tdSt}>
                        <span style={{ fontFamily: "monospace" }}>{c.iptv_usuario}</span>
                        <CopyBtn text={c.iptv_usuario} />
                      </td>
                    )}
                    {columnasVisibles.dni && (
                      <td style={tdSt}>
                        <span style={{ fontFamily: "monospace" }}>{c.dni}</span>
                        <CopyBtn text={c.dni} />
                      </td>
                    )}
                    {columnasVisibles.cliente && (
                      <td style={{ ...tdSt, color: isDark ? "#c3d3ee" : "#374151" }}>
                        {c.es_demo && <span style={{ background: "#ede9fe", color: "#7c3aed", borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 800, marginRight: 6 }}>DEMO</span>}
                        {(c.ips_24h || 0) > (c.max_connections || 1) && (
                          <span title={`${c.ips_24h} IPs distintas en las últimas 24h (contrató ${c.max_connections || 1} pantalla${(c.max_connections || 1) !== 1 ? "s" : ""})`}
                            style={{ background: "#fef3c7", color: "#92400e", borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 800, marginRight: 6, cursor: "help" }}>
                            ⚠ COMPARTIDA
                          </span>
                        )}
                        {c.nombre || c.cliente?.nombre || "—"}
                      </td>
                    )}
                    {columnasVisibles.estado && (
                      <td style={tdSt}>
                        <span style={{ background: colores.bg, color: colores.fg, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                          {estado || "No encontrado"}
                        </span>
                      </td>
                    )}
                    {columnasVisibles.nodo && (
                      <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#6b7280" }}>{normalizarEtiquetaNodo(c.nodo) || "—"}</td>
                    )}
                    {columnasVisibles.plan && (
                      <td style={tdSt}>
                        <select
                          value={c.plan || "Premium"}
                          disabled={actualizandoDni === c.dni || !c.xtream_user_id}
                          onChange={(e) => actualizarPlan(c, e.target.value)}
                          title={!c.xtream_user_id ? "Cuenta antigua sin línea Xtream asociada" : "Editar plan"}
                          style={{ ...inputSt, padding: "4px 8px", fontSize: 12, opacity: !c.xtream_user_id ? 0.5 : 1 }}
                        >
                          {PLANES_IPTV_NOMBRES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                    )}
                    {columnasVisibles.pantallas && (
                      <td style={tdSt}>
                        <select
                          value={c.max_connections || 1}
                          disabled={actualizandoDni === c.dni || !c.xtream_user_id}
                          onChange={(e) => actualizarPantallas(c, e.target.value)}
                          title={!c.xtream_user_id ? "Cuenta antigua sin línea Xtream asociada" : "Editar pantallas"}
                          style={{ ...inputSt, padding: "4px 8px", fontSize: 12, opacity: !c.xtream_user_id ? 0.5 : 1 }}
                        >
                          {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                    )}
                    {columnasVisibles.ultimaConexion && (
                      <td style={tdSt}>
                        {c.en_linea ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#16a34a", fontWeight: 700, fontSize: 12 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
                            En línea
                          </span>
                        ) : (
                          <span style={{ color: isDark ? "#93a2bd" : "#6b7280", fontSize: 12 }}>{formatearUltimaConexion(c.ultima_conexion)}</span>
                        )}
                      </td>
                    )}
                    {columnasVisibles.creado && (
                      <td style={{ ...tdSt, color: isDark ? "#93a2bd" : "#9ca3af", fontSize: 12 }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString("es-PE") : "—"}
                      </td>
                    )}
                    <td style={{ ...tdSt, textAlign: "right", whiteSpace: "nowrap" }}>
                      <IconActionBtn
                        onClick={() => abrirConexiones(c)}
                        disabled={!c.xtream_user_id}
                        title={!c.xtream_user_id ? "Cuenta antigua sin línea Xtream asociada" : "Ver conexiones"}
                        bg="#eff6ff" fg="#2563eb"
                      >
                        <Activity size={15} />
                      </IconActionBtn>
                      <IconActionBtn onClick={() => abrirEnviar(c)} title="Enviar credenciales por WhatsApp" bg="#dcfce7" fg="#16a34a">
                        <Send size={15} />
                      </IconActionBtn>
                      <IconActionBtn
                        onClick={() => eliminarCuenta(c)}
                        disabled={eliminandoDni === c.dni}
                        title={eliminandoDni === c.dni ? "Eliminando..." : "Eliminar cuenta"}
                        bg="#fee2e2" fg="#dc2626"
                      >
                        <Trash2 size={15} />
                      </IconActionBtn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mostrarCrear && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}
          onClick={() => !creando && setMostrarCrear(false)}>
          <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, padding: 22, width: 380, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isDark ? "#e6ecf7" : "#111827" }}>Crear cuenta MaxPlayer</h3>
              <button onClick={() => setMostrarCrear(false)} style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#93a2bd" : "#6b7280" }}><X size={18} /></button>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>DNI</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input style={{ ...inputSt, flex: 1 }} value={crearForm.dni} maxLength={8}
                onChange={(e) => setCrearForm((p) => ({ ...p, dni: e.target.value.replace(/\D/g, "") }))} placeholder="8 dígitos" />
              <button onClick={buscarClientePorDni} disabled={buscandoCliente} style={{ ...inputSt, cursor: "pointer", fontWeight: 600 }}>
                {buscandoCliente ? "..." : "Buscar"}
              </button>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Nombre</label>
            <input style={{ ...inputSt, width: "100%", boxSizing: "border-box", marginBottom: 10 }} value={crearForm.nombre}
              onChange={(e) => setCrearForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre del cliente" />
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Nodo</label>
                <select style={{ ...inputSt, width: "100%", boxSizing: "border-box" }} value={crearForm.nodo}
                  onChange={(e) => setCrearForm((p) => ({ ...p, nodo: e.target.value }))}>
                  {NODOS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ width: 90 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Pantallas</label>
                <select style={{ ...inputSt, width: "100%", boxSizing: "border-box" }} value={crearForm.pantallas}
                  onChange={(e) => setCrearForm((p) => ({ ...p, pantallas: e.target.value }))}>
                  {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Plan</label>
            <select style={{ ...inputSt, width: "100%", boxSizing: "border-box", marginBottom: 10 }} value={crearForm.plan}
              onChange={(e) => setCrearForm((p) => ({ ...p, plan: e.target.value }))}>
              {PLANES_IPTV_NOMBRES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {crearMsg && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>{crearMsg}</div>}
            <button onClick={handleCrearCuenta} disabled={creando}
              style={{ width: "100%", background: creando ? "#9ca3af" : "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: creando ? "default" : "pointer", fontSize: 13 }}>
              {creando ? "Creando..." : "Crear cuenta"}
            </button>
          </div>
        </div>
      )}

      {mostrarDemo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}
          onClick={() => !creandoDemo && setMostrarDemo(false)}>
          <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, padding: 22, width: 360, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isDark ? "#e6ecf7" : "#111827" }}>Crear cuenta demo</h3>
              <button onClick={() => setMostrarDemo(false)} style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#93a2bd" : "#6b7280" }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280", marginTop: 0, marginBottom: 14 }}>
              Para prospectos que aún no son clientes registrados. Vence sola pasadas las horas elegidas.
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Nombre / identificador</label>
            <input style={{ ...inputSt, width: "100%", boxSizing: "border-box", marginBottom: 10 }} value={demoForm.nombre}
              onChange={(e) => setDemoForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Ej. Juan (prospecto Nod_03)" />
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Pantallas</label>
                <select style={{ ...inputSt, width: "100%", boxSizing: "border-box" }} value={demoForm.pantallas}
                  onChange={(e) => setDemoForm((p) => ({ ...p, pantallas: e.target.value }))}>
                  {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Duración</label>
                <select style={{ ...inputSt, width: "100%", boxSizing: "border-box" }} value={demoForm.horas}
                  onChange={(e) => setDemoForm((p) => ({ ...p, horas: e.target.value }))}>
                  {[12,24,48,72].map((h) => <option key={h} value={h}>{h} horas</option>)}
                </select>
              </div>
            </div>
            {demoMsg && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>{demoMsg}</div>}
            <button onClick={handleCrearDemo} disabled={creandoDemo}
              style={{ width: "100%", background: creandoDemo ? "#9ca3af" : "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: creandoDemo ? "default" : "pointer", fontSize: 13 }}>
              {creandoDemo ? "Creando..." : "Crear demo"}
            </button>
          </div>
        </div>
      )}

      {conexionesRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}
          onClick={() => setConexionesRow(null)}>
          <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, padding: 22, width: 520, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isDark ? "#e6ecf7" : "#111827" }}>Conexiones</h3>
              <button onClick={() => setConexionesRow(null)} style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#93a2bd" : "#6b7280" }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280", marginBottom: 14 }}>
              {conexionesRow.nombre || conexionesRow.cliente?.nombre || conexionesRow.iptv_usuario} · <span style={{ fontFamily: "monospace" }}>{conexionesRow.iptv_usuario}</span>
            </div>

            {cargandoConexiones ? (
              <div style={{ textAlign: "center", padding: 30, color: isDark ? "#93a2bd" : "#6b7280", fontSize: 13 }}>Cargando...</div>
            ) : conexionesError ? (
              <div style={{ fontSize: 13, color: "#dc2626" }}>{conexionesError}</div>
            ) : (
              <>
                {conexionesData?.xtreamStatus && !conexionesData.xtreamStatus.enabled && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
                    ⚠ Esta línea está deshabilitada directamente en Xtream (no coincide con el estado del sistema).
                  </div>
                )}

                {(conexionesRow?.ips_24h || 0) > (conexionesRow?.max_connections || 1) && (
                  <div style={{ background: "#fef3c7", color: "#92400e", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
                    ⚠ {conexionesRow.ips_24h} IPs distintas en las últimas 24h — contrató {conexionesRow.max_connections || 1} pantalla{(conexionesRow.max_connections || 1) !== 1 ? "s" : ""}. Posible cuenta compartida.
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  En línea ahora ({conexionesData?.online?.length || 0})
                </div>
                {(!conexionesData?.online || conexionesData.online.length === 0) ? (
                  <div style={{ fontSize: 13, color: isDark ? "#93a2bd" : "#9ca3af", marginBottom: 16 }}>Sin conexiones activas.</div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    {conexionesData.online.map((o, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: i > 0 ? (isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6") : "none", fontSize: 12 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, color: "#16a34a" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} /> {o.stream_name || `Canal ${o.stream_id}`}
                          </div>
                          <div style={{ color: isDark ? "#93a2bd" : "#6b7280", marginTop: 2 }}>{o.user_ip} · {o.user_agent}</div>
                        </div>
                        <div style={{ color: isDark ? "#93a2bd" : "#6b7280", whiteSpace: "nowrap" }}>{formatearDuracion(o.duration_seconds)}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Historial reciente
                </div>
                {(!conexionesData?.history || conexionesData.history.length === 0) ? (
                  <div style={{ fontSize: 13, color: isDark ? "#93a2bd" : "#9ca3af" }}>Sin conexiones registradas.</div>
                ) : (
                  <div>
                    {conexionesData.history.map((h, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: i > 0 ? (isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6") : "none", fontSize: 12 }}>
                        <div>
                          <div style={{ fontWeight: 600, color: isDark ? "#c3d3ee" : "#374151" }}>{h.stream_name || `Canal ${h.stream_id}`}</div>
                          <div style={{ color: isDark ? "#93a2bd" : "#6b7280", marginTop: 2 }}>{h.user_ip} · {h.user_agent}</div>
                        </div>
                        <div style={{ textAlign: "right", color: isDark ? "#93a2bd" : "#6b7280", whiteSpace: "nowrap" }}>
                          <div>{formatearUltimaConexion(h.started_at)}</div>
                          <div>{formatearDuracion(h.duration_seconds)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {conexionesData?.channels?.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 6px" }}>
                      Canales más vistos
                    </div>
                    <div>
                      {conexionesData.channels.map((ch, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: i > 0 ? (isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6") : "none", fontSize: 12 }}>
                          <span style={{ color: isDark ? "#c3d3ee" : "#374151", fontWeight: 600 }}>{ch.stream_name || `Canal ${ch.stream_id}`}</span>
                          <span style={{ color: isDark ? "#93a2bd" : "#6b7280", whiteSpace: "nowrap" }}>{ch.veces}x · {formatearDuracion(ch.total_seconds)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {envioRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}
          onClick={() => !enviando && setEnvioRow(null)}>
          <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, padding: 22, width: 360, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isDark ? "#e6ecf7" : "#111827" }}>Enviar credenciales</h3>
              <button onClick={() => setEnvioRow(null)} style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#93a2bd" : "#6b7280" }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280", marginBottom: 12 }}>
              {envioRow.nombre || envioRow.cliente?.nombre || envioRow.iptv_usuario} · <span style={{ fontFamily: "monospace" }}>{envioRow.iptv_usuario}</span>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Remitente</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {EMPRESAS_WHATSAPP.map((e) => (
                <button key={e} onClick={() => setEnvioEmpresa(e)}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: envioEmpresa === e ? "1.5px solid #2563eb" : (isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb"), background: envioEmpresa === e ? (isDark ? "#16213a" : "#eff6ff") : "transparent", color: envioEmpresa === e ? "#2563eb" : (isDark ? "#c3d3ee" : "#374151"), fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  {e}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Celular</label>
            <input style={{ ...inputSt, width: "100%", boxSizing: "border-box", marginBottom: 14 }} value={envioCelular}
              onChange={(e) => setEnvioCelular(e.target.value)} placeholder="9XXXXXXXX" />
            <button onClick={handleEnviar} disabled={enviando || !envioCelular.trim()}
              style={{ width: "100%", background: (enviando || !envioCelular.trim()) ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: (enviando || !envioCelular.trim()) ? "default" : "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Send size={14} /> {enviando ? "Enviando..." : "Enviar por WhatsApp"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
