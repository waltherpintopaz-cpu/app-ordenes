import http from "node:http";
import { RouterOSAPI } from "node-routeros";

const DEFAULT_SUPABASE_URL = "https://vgwbqbzpjlbkmxtfghdm.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_";
const DEFAULT_MIKROWISP_API_BASE = "https://americanet.club/api/v1";
const DEFAULT_MIKROWISP_TOKEN = "LzNXSERnUHBMMS91b0NzUGFTVkFkZz09";
const DEFAULT_MIKROWISP_NOD04_API_BASE = "https://app.dimfiber.com/api/v1";
const DEFAULT_MIKROWISP_NOD04_TOKEN = "THlaZzQ2UEQ2dHEyUjFBTkdIQ2UzUT09";
const DEFAULT_SMARTOLT_API_BASE = "https://americanet.smartolt.com/api";
const WISPRO_BASE = "https://www.cloud.wispro.co/api/v1";
const DEFAULT_SMARTOLT_TOKEN = "0cb1ad391ea4458cab6efe97769c761d";
const DEFAULT_CHATWOOT_BASE = "https://chat.americanet.club";
const DEFAULT_CHATWOOT_TOKEN = "Wm9K5UiCrfJPcgFJrWgxftYv";
const SERVER_HOST = String(process.env.DIAGNOSTICO_SERVER_HOST || "127.0.0.1").trim() || "127.0.0.1";
const SERVER_PORT = Number(process.env.DIAGNOSTICO_SERVER_PORT || 8787) || 8787;
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();
const MIKROWISP_API_BASE =
  String(process.env.MIKROWISP_API_BASE || DEFAULT_MIKROWISP_API_BASE).trim().replace(/\/+$/, "") || DEFAULT_MIKROWISP_API_BASE;
const MIKROWISP_TOKEN = String(process.env.MIKROWISP_TOKEN || DEFAULT_MIKROWISP_TOKEN).trim();
const MIKROWISP_NOD04_API_BASE =
  String(process.env.MIKROWISP_NOD04_API_BASE || DEFAULT_MIKROWISP_NOD04_API_BASE).trim().replace(/\/+$/, "") || DEFAULT_MIKROWISP_NOD04_API_BASE;
const MIKROWISP_NOD04_TOKEN = String(process.env.MIKROWISP_NOD04_TOKEN || DEFAULT_MIKROWISP_NOD04_TOKEN).trim();
const SMARTOLT_API_BASE =
  String(process.env.SMARTOLT_API_BASE || process.env.VITE_API_BASE_URL || DEFAULT_SMARTOLT_API_BASE)
    .trim()
    .replace(/\/+$/, "") || DEFAULT_SMARTOLT_API_BASE;
const SMARTOLT_TOKEN = String(process.env.SMARTOLT_TOKEN || process.env.VITE_SMART_OLT_TOKEN || DEFAULT_SMARTOLT_TOKEN).trim();
const CHATWOOT_BASE = String(process.env.CHATWOOT_BASE || DEFAULT_CHATWOOT_BASE).trim().replace(/\/+$/, "") || DEFAULT_CHATWOOT_BASE;
const CHATWOOT_TOKEN = String(process.env.CHATWOOT_TOKEN || DEFAULT_CHATWOOT_TOKEN).trim();
// Proxy hacia las acciones reales de huawei-olt-signal (reiniciar/eliminar/
// velocidad) -- el token NUNCA va en una VITE_* (esas quedan visibles en el
// bundle publico del navegador, ver historial). Se queda solo server-side
// aca, el frontend le pega a este proxy sin conocer el token.
const HUAWEI_OLT_SNMP_API = String(process.env.HUAWEI_OLT_SNMP_API || "https://huawei-olt-snmp.wolgest.com").trim().replace(/\/+$/, "");
const HUAWEI_ACCION_TOKEN = String(process.env.HUAWEI_ACCION_TOKEN || "").trim();
// Mismo patron que arriba, pero para el servicio VSOL (olt-signal, nodos
// DIM) -- el ACCION_TOKEN de ese servicio protege su /averia-config (guarda
// un bot token de Telegram) y no debe viajar al navegador.
const OLT_SSH_API = String(process.env.OLT_SSH_API || "https://amnet-olt-signal.0lthka.easypanel.host").trim().replace(/\/+$/, "");
// "vsol" (DIM, via OLT_SSH_API /signal) o "huawei" (Americanet, via
// HUAWEI_OLT_SNMP_API /onu-info) -- ambos devuelven el mismo campo
// "rxPower", asi que el resto de handleActualizarContactoChatwoot no
// necesita saber cual proveedor respondio.
const OLT_SIGNAL_PROVIDER = String(process.env.OLT_SIGNAL_PROVIDER || "vsol").trim().toLowerCase();
const VSOL_ACCION_TOKEN = String(process.env.VSOL_ACCION_TOKEN || "").trim();
// La key de OpenAI NUNCA debe vivir en el navegador (antes estaba en varios
// paneles como VITE_OPENAI_KEY, 100% extraible del bundle publico -- ver
// auditoria de seguridad, 2026-09-28). Ahora solo vive aca, server-side.
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const MIKROTIK_ROUTERS_TABLE = "mikrotik_routers";
const MIKROTIK_NODO_ROUTER_TABLE = "mikrotik_nodo_router";
const MOROSOS_ADDRESS_LIST = String(process.env.MIKROTIK_MOROSOS_LIST || "moroso_").trim() || "moroso_";

// Mismas reglas que ya usa el frontend (SidebarApp.jsx/App.jsx) para sugerir
// usuario/password al crear una orden -- se duplican aca (server) para poder
// generar el lote correlativo con el mismo patron sin depender del frontend.
const NODO_USUARIO_RULES = {
  NOD_01: { prefix: "user", suffix: "@americanet", pad: 0 },
  NOD_02: { prefix: "usuario_", suffix: "", pad: 0 },
  NOD_03: { prefix: "", suffix: "@americanet", pad: 4 },
  NOD_04: { prefix: "user", suffix: "@fiber", pad: 0 },
  NOD_05: { prefix: "", suffix: "@dim", pad: 3 },
  NOD_06: { prefix: "", suffix: "@amnet", pad: 0 },
  NOD_07: { prefix: "Acliente", suffix: "", pad: 0 },
};
const NODO_PASSWORD_RULES = {
  NOD_01: "madrid0021", NOD_02: "speedy2000", NOD_03: "aqp0021",
  NOD_04: "uchumayo0021", NOD_05: "selva0021", NOD_06: "apipa0021",
};

const ROUTERS = {
  tiabaya: {
    id: "tiabaya",
    nombre: "Router Tiabaya",
    host: String(process.env.MIKROTIK_ROUTER_TIABAYA_HOST || "").trim(),
    port: Number(process.env.MIKROTIK_ROUTER_TIABAYA_PORT || 8730) || 8730,
    user: String(process.env.MIKROTIK_ROUTER_TIABAYA_USER || "").trim(),
    password: String(process.env.MIKROTIK_ROUTER_TIABAYA_PASSWORD || "").trim(),
    nodos: ["Nod_01", "Nod_02", "Nod_03"],
  },
  congata: {
    id: "congata",
    nombre: "Router Congata",
    host: String(process.env.MIKROTIK_ROUTER_CONGATA_HOST || "").trim(),
    port: Number(process.env.MIKROTIK_ROUTER_CONGATA_PORT || 8000) || 8000,
    user: String(process.env.MIKROTIK_ROUTER_CONGATA_USER || "").trim(),
    password: String(process.env.MIKROTIK_ROUTER_CONGATA_PASSWORD || "").trim(),
    nodos: ["Nod_04"],
  },
  apipa: {
    id: "apipa",
    nombre: "Router Apipa",
    host: String(process.env.MIKROTIK_ROUTER_APIPA_HOST || "").trim(),
    port: Number(process.env.MIKROTIK_ROUTER_APIPA_PORT || 8730) || 8730,
    user: String(process.env.MIKROTIK_ROUTER_APIPA_USER || "").trim(),
    password: String(process.env.MIKROTIK_ROUTER_APIPA_PASSWORD || "").trim(),
    nodos: ["Nod_06"],
  },
};

const buildEnvRouters = () =>
  Object.fromEntries(
    Object.entries(ROUTERS).map(([key, value]) => [
      key,
      {
        ...value,
        nodos: [...(Array.isArray(value.nodos) ? value.nodos : [])],
      },
    ])
  );

// Excepciones confirmadas por el usuario (2026-09-28): estos 2 numeros
// pelados NO siguen el patron "N -> Nod_0N" normal -- son codigos legacy
// de una numeracion vieja que ya no corresponde al nodo del mismo numero.
const NODO_NUMERO_LEGACY_EXCEPCIONES = { "9": "NOD_01", "10": "NOD_03" };

const normalizeNodo = (value = "") => {
  const base = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
  if (NODO_NUMERO_LEGACY_EXCEPCIONES[base]) return NODO_NUMERO_LEGACY_EXCEPCIONES[base];
  // Datos legacy: 156 ordenes en Supabase (confirmado 2026-09-28) tienen
  // "nodo" guardado como numero pelado ("1", "5"...) en vez de "Nod_01" --
  // vienen de una importacion vieja. Sin esto, resolveRouterByNodo no
  // encontraba router para esas ordenes ("No hay router configurado para
  // el nodo 1."), aunque el nodo real SI esta configurado.
  if (/^\d+$/.test(base)) return `NOD_${base.padStart(2, "0")}`;
  return base;
};

const normalizeRouterKey = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const findRouterByNodo = (routers, nodo = "") => {
  const key = normalizeNodo(nodo);
  return Object.values(routers || {}).find((router) => router.nodos.some((item) => normalizeNodo(item) === key)) || null;
};

const readJsonBody = async (req) => {
  const raw = (await readRawBody(req)).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
};

const readRawBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const writeJson = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS,DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-Token, token, Authorization, X-App-Token",
  });
  res.end(JSON.stringify(data));
};

// Antes cualquiera que conociera la URL de este servidor podia llamar estos
// endpoints sin autenticarse y cortar/activar clientes reales o crear
// credenciales PPPoE en el MikroTik de produccion (hallazgo de auditoria,
// 2026-09-28). Ahora exigen un token compartido que solo conoce el panel,
// enviado como header "X-App-Token" y configurado server-side via
// DIAGNOSTICO_INTERNAL_TOKEN (nunca en una VITE_*, para que no termine en
// el bundle publico -- el panel lo manda pero el valor real solo vive en
// las variables de entorno del backend y del build del panel privado).
const INTERNAL_API_TOKEN = String(process.env.DIAGNOSTICO_INTERNAL_TOKEN || "").trim();
const RUTAS_PROTEGIDAS_INTERNAS = new Set([
  "/api/diagnostico-servicio/suspender",
  "/api/diagnostico-servicio/activar",
  "/api/diagnostico-servicio/crear-secrets-lote",
  "/api/diagnostico-servicio/sync-router",
  "/api/diagnostico-servicio/sync-all",
  "/api/clientes/sincronizar-estados-mikrowisp",
  "/api/cruce-mac-aplicar",
  "/api/clientes/revisar-prorrateos-vencidos",
]);
const requiereAuthInterna = (req) => RUTAS_PROTEGIDAS_INTERNAS.has(String(req.url || "").split("?")[0]);
const tieneTokenInternoValido = (req) => {
  if (!INTERNAL_API_TOKEN) return false;
  const recibido = String(req.headers["x-app-token"] || "").trim();
  return recibido === INTERNAL_API_TOKEN;
};

const pickFirst = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const buildRouterInfo = (router) => ({
  id: router?.id,
  nombre: router?.nombre,
  host: router?.host,
  port: router?.port,
});

const buildRouterConfigError = (router) => {
  const missing = [];
  if (!router?.host) missing.push("host");
  if (!router?.port) missing.push("port");
  if (!router?.user) missing.push("user");
  if (!router?.password) missing.push("password");
  return missing.length ? `Falta configurar ${missing.join(", ")} para ${router?.nombre || "router"} en .env.diagnostico.local` : "";
};

const formatErrorDetail = (error) => {
  const detail =
    typeof error === "string"
      ? error
      : pickFirst(error?.message, error?.error?.message, error?.error, error?.reason, error?.code, error?.errno);
  return String(detail || "Error desconocido");
};

const withTimeout = async (promise, ms, label) =>
  await Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} excedió ${ms / 1000}s`)), ms);
    }),
  ]);

const fetchSupabaseRows = async (table, query = "") => {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${table} HTTP ${res.status}: ${text || "sin detalle"}`);
  }
  return res.json();
};

const mergeRouterRow = (base, row = {}) => {
  const port = Number(row?.port);
  return {
    ...(base || {}),
    id: normalizeRouterKey(row?.router_key) || base?.id || normalizeRouterKey(row?.nombre),
    nombre: pickFirst(row?.nombre, base?.nombre),
    host: pickFirst(row?.host, base?.host),
    port: Number.isFinite(port) && port > 0 ? port : base?.port || 8730,
    user: pickFirst(row?.api_user, base?.user),
    password: pickFirst(row?.api_password, base?.password),
    nodos: [...(Array.isArray(base?.nodos) ? base.nodos : [])],
  };
};

const loadRoutersConfigFromSupabase = async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const [routerRows, nodoRows] = await Promise.all([
      fetchSupabaseRows(
        MIKROTIK_ROUTERS_TABLE,
        "select=router_key,nombre,host,port,api_user,api_password,activo&activo=eq.true&order=router_key.asc"
      ),
      fetchSupabaseRows(
        MIKROTIK_NODO_ROUTER_TABLE,
        "select=nodo,router_key,activo&activo=eq.true&order=nodo.asc"
      ),
    ]);

    const routers = buildEnvRouters();
    let hasSupabaseRouters = false;
    (Array.isArray(routerRows) ? routerRows : []).forEach((row) => {
      const key = normalizeRouterKey(row?.router_key);
      if (!key) return;
      const merged = mergeRouterRow(routers[key], row);
      if (!merged.host || !merged.user || !merged.password) return;
      routers[key] = merged;
      hasSupabaseRouters = true;
    });

    const activeMaps = Array.isArray(nodoRows) ? nodoRows : [];
    if (activeMaps.length) {
      Object.values(routers).forEach((router) => {
        router.nodos = [];
      });
      activeMaps.forEach((row) => {
        const key = normalizeRouterKey(row?.router_key);
        const nodo = String(row?.nodo || "").trim();
        if (!key || !nodo || !routers[key]) return;
        routers[key].nodos.push(nodo);
      });
    }

    return hasSupabaseRouters ? routers : null;
  } catch (error) {
    console.warn("No se pudo cargar configuración MikroTik desde Supabase. Se usará .env.", error);
    return null;
  }
};

// Migracion a VLAN 102: originalmente solo clientes de Nod_03, pero ya se
// estan pasando clientes de OTROS nodos tambien a este mismo Mikrotik fisico
// (router_key "nod03_nuevo" -- el nombre quedo de cuando era exclusivo de
// Nod_03, pero ahora es el router VLAN 102 general). El resto de cada nodo
// (VLAN 100 o sin VLAN) sigue en su router de siempre. Se resuelve por VLAN
// del cliente, SIN filtrar por nodo -- antes el chequeo de vlan==102 solo
// corria "if (nodo === NOD_03)", asi que un cliente VLAN 102 de otro nodo
// (ej. Nod_01) caia siempre al router equivocado (el de su nodo de toda la
// vida) y mostraba "Desconectado" aunque estuviera conectado de verdad.
const ROUTER_KEY_VLAN102 = "nod03_nuevo";

const fetchClienteVlanPorPppoe = async (userPppoe = "") => {
  const user = String(userPppoe || "").trim();
  if (!user || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const rows = await fetchSupabaseRows(
      "clientes",
      `select=vlan&usuario_nodo=eq.${encodeURIComponent(user)}&limit=1`
    );
    const vlan = Array.isArray(rows) && rows[0] ? rows[0].vlan : null;
    return vlan == null ? null : Number(vlan);
  } catch (error) {
    console.warn("No se pudo consultar VLAN del cliente para enrutar Mikrotik.", error);
    return null;
  }
};

const resolveRouterByNodo = async (nodo = "", userPppoe = "") => {
  const routers = (await loadRoutersConfigFromSupabase()) || buildEnvRouters();
  let router = null;
  const vlan = await fetchClienteVlanPorPppoe(userPppoe);
  if (vlan === 102 && routers[ROUTER_KEY_VLAN102]) {
    router = routers[ROUTER_KEY_VLAN102];
  }
  if (!router) router = findRouterByNodo(routers, nodo);
  if (!router) throw new Error(`No hay router configurado para el nodo ${nodo || "-"}.`);
  const configError = buildRouterConfigError(router);
  if (configError) throw new Error(configError);
  return router;
};

const connectToRouter = async (router) => {
  const api = new RouterOSAPI({
    host: router.host,
    port: router.port,
    user: router.user,
    password: router.password,
    timeout: 8,
  });

  let asyncSocketError = null;
  api.on("error", (error) => {
    asyncSocketError = error;
    console.error(`MikroTik error [${router.nombre}] ${router.host}:${router.port}`, error);
  });
  api.on("close", () => {
    if (asyncSocketError) {
      console.warn(`MikroTik conexión cerrada tras error [${router.nombre}] ${router.host}:${router.port}`);
    }
  });

  try {
    await withTimeout(api.connect(), 10000, `Conexión a ${router.nombre}`);
  } catch (error) {
    const detail = formatErrorDetail(asyncSocketError || error);
    try {
      await api.close();
    } catch {
      // noop
    }
    throw new Error(`No se pudo consultar ${router.nombre} (${router.host}:${router.port}): ${detail}`);
  }

  return {
    api,
    router,
    getSocketError: () => asyncSocketError,
  };
};

const connectRouterByNodo = async (nodo = "", userPppoe = "") => {
  const router = await resolveRouterByNodo(nodo, userPppoe);
  return connectToRouter(router);
};

const connectRouterByKey = async (routerKey = "") => {
  const routers = (await loadRoutersConfigFromSupabase()) || buildEnvRouters();
  const key = normalizeRouterKey(routerKey);
  const router = routers[key];
  if (!router) throw new Error(`Router "${routerKey}" no encontrado.`);
  const configError = buildRouterConfigError(router);
  if (configError) throw new Error(configError);
  return connectToRouter(router);
};

const closeRouterApiSafe = async (api) => {
  try {
    await api.close();
  } catch {
    // noop
  }
};

// ── Cache de IPs por router (sync masivo) ───────────────────────────────
// En vez de conectar al Mikrotik una vez por cada busqueda individual (lento
// y con cuelgues intermitentes cuando el router tarda en responder), se trae
// TODA la lista de secrets+activos de un router de una sola conexion y se
// guarda en Supabase. Las busquedas normales primero miran esta cache
// (instantaneo) y solo conectan en vivo al Mikrotik si no encuentran nada
// ahi (fallback, mismo comportamiento que antes).
const MIKROTIK_IP_CACHE_TABLE = "mikrotik_ip_cache";

const upsertIpCacheRows = async (routerKey, rows) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !rows.length) return;
  const url = `${SUPABASE_URL}/rest/v1/${MIKROTIK_IP_CACHE_TABLE}?on_conflict=router_key,usuario_pppoe`;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(chunk.map((r) => ({ ...r, router_key: routerKey, actualizado_en: new Date().toISOString() }))),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase ${MIKROTIK_IP_CACHE_TABLE} upsert HTTP ${res.status}: ${text || "sin detalle"}`);
    }
  }
};

const lookupIpCache = async (routerKey, userPppoe) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const rows = await fetchSupabaseRows(
      MIKROTIK_IP_CACHE_TABLE,
      `select=ip,origen,profile,actualizado_en&router_key=eq.${encodeURIComponent(routerKey)}&usuario_pppoe=eq.${encodeURIComponent(userPppoe)}&limit=1`
    );
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (error) {
    console.warn("No se pudo consultar mikrotik_ip_cache.", error);
    return null;
  }
};

const syncRouterIpCache = async (routerKey) => {
  let connection = null;
  try {
    connection = await connectRouterByKey(routerKey);
    const { api, router } = connection;
    const [secretRows, activeRows] = await Promise.all([
      withTimeout(api.write("/ppp/secret/print", []), 25000, `Listar PPP Secret en ${router.nombre}`),
      withTimeout(api.write("/ppp/active/print", []), 15000, `Listar PPP Active en ${router.nombre}`).catch(() => []),
    ]);
    const activeByName = new Map();
    (Array.isArray(activeRows) ? activeRows : []).forEach((row) => {
      const name = pickFirst(row?.name);
      if (name) activeByName.set(name, row);
    });
    // Deduplicar por usuario -- algunos routers tienen secrets duplicados
    // (mismo nombre repetido) y un solo INSERT...ON CONFLICT no puede tocar
    // la misma fila dos veces. Nos quedamos con la ultima ocurrencia.
    const porUsuario = new Map();
    (Array.isArray(secretRows) ? secretRows : []).forEach((secret) => {
      const usuario = pickFirst(secret?.name);
      if (!usuario) return;
      const active = activeByName.get(usuario) || null;
      const ip = active ? pickFirst(active.address) : resolveSecretRemoteAddress(secret, null);
      if (!ip) return;
      porUsuario.set(usuario, {
        usuario_pppoe: usuario,
        ip,
        origen: active ? "ppp-active" : "ppp-secret",
        profile: pickFirst(secret?.profile),
      });
    });
    const cacheRows = Array.from(porUsuario.values());
    await upsertIpCacheRows(router.id, cacheRows);
    return { ok: true, router: buildRouterInfo(router), total: cacheRows.length };
  } catch (error) {
    const detail = formatErrorDetail(connection?.getSocketError?.() || error);
    throw new Error(`Sync IP cache falló para "${routerKey}": ${detail}`);
  } finally {
    if (connection?.api) await closeRouterApiSafe(connection.api);
  }
};

const syncAllRoutersIpCache = async () => {
  const routers = (await loadRoutersConfigFromSupabase()) || buildEnvRouters();
  const resultados = [];
  for (const router of Object.values(routers)) {
    if (buildRouterConfigError(router)) continue;
    try {
      const r = await syncRouterIpCache(router.id);
      resultados.push(r);
    } catch (error) {
      resultados.push({ ok: false, router: buildRouterInfo(router), error: formatErrorDetail(error) });
    }
  }
  return resultados;
};

// ── Creacion masiva y correlativa de PPP secrets ────────────────────────
// El pool de IP en si (rango/subred en el Mikrotik) lo crea el usuario a
// mano -- esto solo genera los secrets PPPoE correlativos (usuario+IP+clave)
// dentro de un rango de IP ya existente que el usuario indica explicitamente
// (ipInicio..ipFin), evitando cualquier adivinanza sobre que pool esta
// "activo" cuando un router tiene varias subredes.
const ipToInt = (ip) => {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(String(ip || "").trim());
  if (!m) return null;
  // "<<" en JS es de 32 bits CON signo: para el primer octeto >=128 el
  // resultado se vuelve negativo, rompiendo el orden numerico justo en esa
  // frontera (ej. 128.0.0.1 quedaba "menor" que 127.255.255.255). Se usa
  // multiplicacion (sin signo, cabe entero en un Number normal) en vez de
  // bit-shift para evitarlo.
  return Number(m[1]) * 16777216 + Number(m[2]) * 65536 + Number(m[3]) * 256 + Number(m[4]);
};
const intToIp = (n) => [24, 16, 8, 0].map((shift) => (n >>> shift) & 0xff).join(".");

const buildRangoIp = (ipInicio, ipFin) => {
  const a = ipToInt(ipInicio);
  const b = ipToInt(ipFin);
  if (a === null || b === null) throw new Error("ipInicio/ipFin invalidos.");
  if (b < a) throw new Error("ipFin debe ser mayor o igual a ipInicio.");
  if (b - a > 500) throw new Error("Rango demasiado grande (maximo 500 IPs por lote, por seguridad).");
  const out = [];
  for (let n = a; n <= b; n++) out.push(intToIp(n));
  return out;
};

const buildUsuario = (nodo, numero) => {
  const key = normalizeNodo(nodo);
  const rule = NODO_USUARIO_RULES[key];
  if (!rule) throw new Error(`No hay patron de usuario configurado para el nodo ${nodo}.`);
  const numText = rule.pad > 0 ? String(numero).padStart(rule.pad, "0") : String(numero);
  return `${rule.prefix || ""}${numText}${rule.suffix || ""}`;
};

const buildLotePreview = ({ nodo, ipInicio, ipFin, numeroInicio, password, profile, localAddress }) => {
  const ips = buildRangoIp(ipInicio, ipFin);
  const pass = password || NODO_PASSWORD_RULES[normalizeNodo(nodo)] || "";
  if (!pass) throw new Error(`No hay clave por defecto configurada para el nodo ${nodo}; indica "password".`);
  if (!profile) throw new Error('Falta "profile" (perfil PPP de Mikrotik a asignar).');
  // Sin esto, un numeroInicio no numerico (string vacio, texto) generaba
  // Number(numeroInicio) = NaN para TODO el lote, y buildUsuario producia el
  // mismo nombre "userNaN@..." para cada IP del rango sin que el dry-run lo
  // bloqueara.
  const inicioNum = Number(numeroInicio);
  if (!Number.isFinite(inicioNum) || !Number.isInteger(inicioNum)) {
    throw new Error(`"numeroInicio" debe ser un numero entero valido (recibido: ${JSON.stringify(numeroInicio)}).`);
  }
  return ips.map((ip, i) => ({
    usuario: buildUsuario(nodo, inicioNum + i),
    ip,
    password: pass,
    profile,
    localAddress: localAddress || "", // vacio = se hereda del perfil PPP, como ya funciona hoy
  }));
};

// Mutex simple en memoria por router: dos llamadas a crearSecretsLote para
// el MISMO router (dos operadores, o un doble clic) antes se dejaban correr
// en paralelo -- ambas leian el mismo snapshot de secrets existentes y
// podian crear el mismo usuario/IP duplicado en el Mikrotik real. Con esto,
// la segunda llamada espera a que la primera termine (y vea sus secrets ya
// creados) antes de leer su propio snapshot.
const routerLocks = new Map();
const withRouterLock = async (routerKey, fn) => {
  const prev = routerLocks.get(routerKey) || Promise.resolve();
  let release;
  const gate = new Promise((r) => { release = r; });
  routerLocks.set(routerKey, prev.then(() => gate));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
};

const crearSecretsLote = ({ routerKey, lote }) => withRouterLock(routerKey, async () => {
  let connection = null;
  const resultados = [];
  try {
    connection = await connectRouterByKey(routerKey);
    const { api, router } = connection;
    const secretRows = await withTimeout(api.write("/ppp/secret/print", []), 15000, `Listar PPP Secret en ${router.nombre}`);
    const existentesPorNombre = new Set((Array.isArray(secretRows) ? secretRows : []).map((s) => pickFirst(s?.name).toLowerCase()));
    const existentesPorIp = new Set(
      (Array.isArray(secretRows) ? secretRows : [])
        .map((s) => resolveSecretRemoteAddress(s, null))
        .filter(Boolean)
    );
    for (const item of lote) {
      if (existentesPorNombre.has(item.usuario.toLowerCase())) {
        resultados.push({ ...item, ok: false, motivo: "El usuario ya existe -- se omitio." });
        continue;
      }
      if (existentesPorIp.has(item.ip)) {
        resultados.push({ ...item, ok: false, motivo: "La IP ya esta asignada a otro secret -- se omitio." });
        continue;
      }
      try {
        const params = [
          `=name=${item.usuario}`,
          `=password=${item.password}`,
          "=service=pppoe",
          `=profile=${item.profile}`,
          `=remote-address=${item.ip}`,
        ];
        if (item.localAddress) params.push(`=local-address=${item.localAddress}`);
        await withTimeout(
          api.write("/ppp/secret/add", params),
          10000,
          `Crear secret ${item.usuario} en ${router.nombre}`
        );
        resultados.push({ ...item, ok: true });
      } catch (error) {
        resultados.push({ ...item, ok: false, motivo: formatErrorDetail(error) });
      }
    }
    return { router: buildRouterInfo(router), resultados };
  } catch (error) {
    // Si el socket se cae a mitad de lote, antes se perdia el detalle de
    // cuales items ya se habian creado (resultados) al lanzar un error
    // generico -- ahora se adjunta lo que ya se proceso, para no tener que
    // volver a listar el router a mano para saber que quedo a medias.
    const detail = formatErrorDetail(connection?.getSocketError?.() || error);
    const err = new Error(`Creacion en lote fallo: ${detail}`);
    err.resultadosParciales = resultados;
    throw err;
  } finally {
    if (connection?.api) await closeRouterApiSafe(connection.api);
  }
});

// Se pide la lista COMPLETA (sin filtro "?name=") y se busca el usuario en
// el servidor, en vez de dejar que el Mikrotik filtre. Se comprobo que en
// algunos routers (ej. Apipa) la consulta filtrada por nombre se cuelga ~10s
// y truena cuando el usuario no existe todavia (caso normal al asignar un
// PPPoE nuevo a una orden), mientras que pedir la lista completa responde
// rapido siempre -- es la misma consulta que ya usa el sync masivo.
const findByName = (rows, userPppoe) => {
  const list = Array.isArray(rows) ? rows : [];
  const target = String(userPppoe || "").trim();
  return (
    list.find((row) => pickFirst(row?.name) === target) ||
    list.find((row) => pickFirst(row?.name).toLowerCase() === target.toLowerCase()) ||
    null
  );
};

const loadSecretAndActive = async ({ api, router, userPppoe }) => {
  const secretRows = await withTimeout(
    api.write("/ppp/secret/print", []),
    15000,
    `Listar PPP Secret en ${router.nombre}`
  );
  const secret = findByName(secretRows, userPppoe);
  let active = null;
  let activeTimedOut = false;
  try {
    const activeRows = await withTimeout(
      api.write("/ppp/active/print", []),
      10000,
      `Listar PPP Active en ${router.nombre}`
    );
    active = findByName(activeRows, userPppoe);
  } catch (error) {
    const detail = formatErrorDetail(error);
    activeTimedOut = detail.toLowerCase().includes("ppp active") && detail.toLowerCase().includes("excedió");
    if (!secret || !activeTimedOut) {
      throw error;
    }
  }
  return { secret, active, activeTimedOut };
};

const loadSecretOnly = async ({ api, router, userPppoe }) => {
  const secretRows = await withTimeout(
    api.write("/ppp/secret/print", []),
    15000,
    `Listar PPP Secret en ${router.nombre}`
  );
  return findByName(secretRows, userPppoe);
};

const findMorosoEntries = async ({ api, userPppoe, ip = "" }) => {
  let rows = [];
  try {
    rows = await withTimeout(
      api.write("/ip/firewall/address-list/print", [`?list=${MOROSOS_ADDRESS_LIST}`]),
      10000,
      `Consulta address-list ${MOROSOS_ADDRESS_LIST}`
    );
  } catch (error) {
    const code = String(error?.errno || error?.code || "").toUpperCase();
    const reply = String(error?.reply || error?.error?.reply || "").toLowerCase();
    const detail = formatErrorDetail(error).toLowerCase();
    const isEmptyReply =
      code === "UNKNOWNREPLY" &&
      (reply.includes("!empty") || detail.includes("unknown reply: !empty"));
    if (!isEmptyReply) throw error;
    rows = [];
  }
  const normalizedUser = String(userPppoe || "").trim().toLowerCase();
  const normalizedIp = String(ip || "").trim();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const rowIp = pickFirst(row?.address);
    const comment = String(pickFirst(row?.comment) || "").toLowerCase();
    return (normalizedIp && rowIp === normalizedIp) || (normalizedUser && comment.includes(normalizedUser));
  });
};

const resolveSecretRemoteAddress = (secret = null, active = null) =>
  pickFirst(secret?.["remote-address"], secret?.remoteaddress, secret?.["remote_address"], active?.address);

const queryRouterOnRouter = async (router, userPppoe) => {
  let connection = null;
  try {
    connection = await connectToRouter(router);
    const { api } = connection;
    const { secret, active, activeTimedOut } = await loadSecretAndActive({ api, router, userPppoe });

    if (active) {
      return {
        router: buildRouterInfo(router),
        estado: "conectado",
        origen: "ppp-active",
        userPppoe,
        ip: pickFirst(active.address),
        uptime: pickFirst(active.uptime),
        lastLoggedOut: "",
        disabled: false,
        profile: pickFirst(active.profile),
        callerId: pickFirst(active["caller-id"], active.callerid),
      };
    }

    if (!secret) {
      return {
        router: buildRouterInfo(router),
        estado: "no-encontrado",
        origen: "sin-registro",
        userPppoe,
        ip: "",
        uptime: "",
        lastLoggedOut: "",
        disabled: "",
        profile: "",
        callerId: "",
      };
    }

    return {
      router: buildRouterInfo(router),
      estado: "no-conectado",
      origen: activeTimedOut ? "ppp-secret-fallback" : "ppp-secret",
      userPppoe,
      ip: resolveSecretRemoteAddress(secret, active),
      uptime: "",
      lastLoggedOut: pickFirst(secret["last-logged-out"], secret.lastloggedout, secret["last_logged_out"]),
      disabled: pickFirst(secret.disabled),
      profile: pickFirst(secret.profile),
      callerId: pickFirst(secret["caller-id"], secret.callerid),
    };
  } catch (error) {
    const detail = formatErrorDetail(connection?.getSocketError?.() || error);
    throw new Error(`No se pudo consultar ${router.nombre} (${router.host}:${router.port}): ${detail}`);
  } finally {
    if (connection?.api) await closeRouterApiSafe(connection.api);
  }
};

const queryRouter = async ({ nodo, userPppoe }) => {
  const routers = (await loadRoutersConfigFromSupabase()) || buildEnvRouters();
  const routerPrincipal = findRouterByNodo(routers, nodo);
  if (!routerPrincipal) throw new Error(`No hay router configurado para el nodo ${nodo || "-"}.`);
  const configErrorPrincipal = buildRouterConfigError(routerPrincipal);
  if (configErrorPrincipal) throw new Error(configErrorPrincipal);

  const resultadoPrincipal = await queryRouterOnRouter(routerPrincipal, userPppoe);
  if (resultadoPrincipal.estado === "conectado") return resultadoPrincipal;

  // Fallback VLAN 102: no se confia unicamente en que alguien haya marcado
  // "vlan=102" a mano en la tabla "clientes" (campo que en la practica queda
  // sin llenar -- confirmado en vivo con un cliente real migrado sin ese
  // dato) -- si el router de su nodo de toda la vida no encuentra ni
  // secret ni sesion activa, se prueba tambien el Mikrotik nuevo (VLAN 102,
  // compartido entre nodos) antes de darlo por desconectado. Sin esto,
  // cualquier cliente migrado sin el campo vlan actualizado se mostraba
  // "Desconectado" aunque estuviera conectado de verdad.
  const routerVlan102 = routers[ROUTER_KEY_VLAN102];
  if (!routerVlan102 || normalizeRouterKey(routerPrincipal.id) === ROUTER_KEY_VLAN102) return resultadoPrincipal;
  if (buildRouterConfigError(routerVlan102)) return resultadoPrincipal;

  try {
    const resultadoVlan102 = await queryRouterOnRouter(routerVlan102, userPppoe);
    if (resultadoVlan102.estado === "conectado") {
      // Autocorreccion: ya que se confirmo en vivo que esta en el router
      // VLAN 102, guardar ese dato en "clientes" para que la proxima
      // consulta (aca y en resolveRouterByNodo, que SI depende de este
      // campo para suspender/activar) vaya directo sin pasar por el
      // fallback. Fire-and-forget: si falla el guardado no debe tumbar la
      // respuesta, que ya es valida igual.
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        fetch(`${SUPABASE_URL}/rest/v1/clientes?usuario_nodo=eq.${encodeURIComponent(userPppoe)}`, {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ vlan: 102 }),
        }).catch((e) => console.warn("[queryRouter] no se pudo autocorregir vlan=102 en clientes:", e.message));
      }
      return resultadoVlan102;
    }
    // Ninguno de los 2 tiene sesion activa -- preferir el que al menos tenga
    // el secret registrado (mas informativo que "sin-registro" generico).
    return resultadoPrincipal.estado === "no-conectado" ? resultadoPrincipal : resultadoVlan102;
  } catch {
    // Si el router VLAN 102 no responde (ej. caido), no tapar el resultado
    // valido (aunque sea "desconectado") del router principal con un error.
    return resultadoPrincipal;
  }
};

const suspenderRouter = async ({ nodo, userPppoe }) => {
  let connection = null;
  try {
    connection = await connectRouterByNodo(nodo, userPppoe);
    const { api, router } = connection;
    const secret = await loadSecretOnly({ api, router, userPppoe });
    if (!secret) {
      throw new Error(`No existe PPP Secret para ${userPppoe} en ${router.nombre}.`);
    }

    const ip = resolveSecretRemoteAddress(secret, null);
    if (!ip) {
      throw new Error(`El PPP Secret de ${userPppoe} no tiene remote-address configurado.`);
    }

    try {
      await withTimeout(
        api.write("/ip/firewall/address-list/add", [
          `=list=${MOROSOS_ADDRESS_LIST}`,
          `=address=${ip}`,
          `=comment=suspendido:${userPppoe}`,
        ]),
        10000,
        `Alta address-list ${MOROSOS_ADDRESS_LIST} en ${router.nombre}`
      );
    } catch (error) {
      const detail = formatErrorDetail(error).toLowerCase();
      const duplicate =
        detail.includes("already have such entry") ||
        detail.includes("failure: already have") ||
        detail.includes("already exists");
      if (!duplicate) throw error;
    }

    return {
      router: buildRouterInfo(router),
      userPppoe,
      ip,
      listName: MOROSOS_ADDRESS_LIST,
      secretDisabled: pickFirst(secret.disabled),
      estado: "suspendido",
      origen: "address-list",
      message: `Servicio suspendido. IP fija ${ip} agregada a ${MOROSOS_ADDRESS_LIST}.`,
    };
  } catch (error) {
    const detail = formatErrorDetail(connection?.getSocketError?.() || error);
    const router = connection?.router;
    if (router) {
      throw new Error(`No se pudo suspender en ${router.nombre} (${router.host}:${router.port}): ${detail}`);
    }
    throw error;
  } finally {
    if (connection?.api) await closeRouterApiSafe(connection.api);
  }
};

const activarRouter = async ({ nodo, userPppoe, ip = "" }) => {
  let connection = null;
  try {
    connection = await connectRouterByNodo(nodo, userPppoe);
    const { api, router } = connection;
    const secret = await loadSecretOnly({ api, router, userPppoe });
    if (!secret) {
      throw new Error(`No existe PPP Secret para ${userPppoe} en ${router.nombre}.`);
    }

    const targetIp = pickFirst(ip, resolveSecretRemoteAddress(secret, null));
    if (!targetIp) {
      throw new Error(`El PPP Secret de ${userPppoe} no tiene remote-address configurado.`);
    }

    const entries = await findMorosoEntries({ api, userPppoe, ip: targetIp });
    for (const row of entries) {
      const rowId = pickFirst(row?.[".id"], row?.id);
      if (!rowId) continue;
      await withTimeout(
        api.write("/ip/firewall/address-list/remove", [`=.id=${rowId}`]),
        10000,
        `Baja address-list ${MOROSOS_ADDRESS_LIST} en ${router.nombre}`
      );
    }

    return {
      router: buildRouterInfo(router),
      userPppoe,
      ip: targetIp,
      removedEntries: entries.length,
      listName: MOROSOS_ADDRESS_LIST,
      secretDisabled: pickFirst(secret.disabled),
      estado: "activo",
      origen: "address-list",
      message:
        entries.length > 0
          ? `Servicio activado. Se retiró ${entries.length} registro(s) de ${MOROSOS_ADDRESS_LIST} para la IP ${targetIp}.`
          : `Servicio activo. No había bloqueo vigente en ${MOROSOS_ADDRESS_LIST} para la IP ${targetIp}.`,
    };
  } catch (error) {
    const detail = formatErrorDetail(connection?.getSocketError?.() || error);
    const router = connection?.router;
    if (router) {
      throw new Error(`No se pudo activar en ${router.nombre} (${router.host}:${router.port}): ${detail}`);
    }
    throw error;
  } finally {
    if (connection?.api) await closeRouterApiSafe(connection.api);
  }
};

const buildAbsoluteApiUrl = (base, path = "") => {
  const normalizedBase = String(base || "").trim().replace(/\/+$/, "");
  const normalizedPath = String(path || "").trim();
  if (!normalizedBase) return normalizedPath;
  if (!normalizedPath) return normalizedBase;
  return `${normalizedBase}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
};

const readProxyJsonResponse = async (response, context = "API proxy") => {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(`${context} devolvio respuesta no JSON (HTTP ${response.status}). ${preview || "<vacia>"}`);
  }
};

// El token real de Mikrowisp NUNCA debe venir del navegador (antes el
// frontend lo traia hardcodeado y lo mandaba en el body) -- se sobreescribe
// aca siempre con el token server-side, sea cual sea el que mande el panel.
const inyectarTokenMikrowisp = async (req, token) => {
  const rawBody = await readRawBody(req);
  let payload = {};
  if (rawBody.length) {
    try { payload = JSON.parse(rawBody.toString("utf8")); } catch { payload = {}; }
  }
  if (!payload || typeof payload !== "object") payload = {};
  payload.token = token;
  return JSON.stringify(payload);
};

const proxyMikrowispGetClientDetails = async (req) => {
  const body = await inyectarTokenMikrowisp(req, MIKROWISP_TOKEN);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/GetClientsDetails");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp GetClientsDetails");
  return { status: response.status, json };
};

const proxyMikrowispNod04GetClientDetails = async (req) => {
  const body = await inyectarTokenMikrowisp(req, MIKROWISP_NOD04_TOKEN);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_NOD04_API_BASE, "/GetClientsDetails");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp Nod04 GetClientsDetails");
  return { status: response.status, json };
};

// ─── Sincronizacion diaria de estado_servicio contra Mikrowisp (Nod_01/02/03) ──
// Pedido real: saber a diario cuantos clientes estan ACTIVO/SUSPENDIDO sin
// depender de que alguien entre a revisar Mikrowisp a mano. Existia una
// version MANUAL de esto en el panel web (App.jsx, "Sync MikroTik") que
// servia de base, pero tenia 2 problemas reales encontrados al auditarla
// antes de automatizarla (ver conversacion/memoria):
//   1. La ruta que usaba (/api/mikrowisp/GetClientsDetails) siempre inyecta
//      MIKROWISP_TOKEN del proceso -- si esa variable queda mal configurada
//      en EasyPanel (paso real, confirmado), la sync entera fallaba en
//      silencio sin que nadie lo notara.
//   2. Buscaba por DNI y tomaba el primer resultado -- un DNI con 2+
//      servicios (confirmado con datos reales: OBRAS HERGON S.A., Country
//      Club Tiabaya, etc.) podia terminar copiando el estado de un servicio
//      al otro sin ninguna base real, porque Mikrowisp solo devuelve el/los
//      servicio(s) que calcen con esa cedula en esa consulta puntual.
// Esta version corrige ambos: el token se usa server-side siempre (nunca
// via una ruta que dependa de un env var roto sin fallback), y cada fila se
// empareja con su servicio real de Mikrowisp comparando pppuser === usuario_nodo
// (dato que ya guardamos nosotros) -- si no hay forma de emparejar con
// certeza, esa fila NO se toca y queda marcada para revision manual.
const ESTADO_SYNC_NODOS = ["Nod_01", "Nod_02", "Nod_03"];

function normalizarEstadoMikrowispSync(raw) {
  const txt = String(raw || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!txt) return "DESCONOCIDO";
  if (txt.includes("activo") || txt.includes("online") || txt.includes("enabled") || txt === "up") return "ACTIVO";
  if (txt.includes("suspend") || txt.includes("cortado") || txt.includes("bloque") || txt.includes("disabled") || txt.includes("moroso") || txt.includes("deuda")) return "SUSPENDIDO";
  if (txt.includes("inactivo") || txt.includes("offline") || txt === "down") return "INACTIVO";
  return "DESCONOCIDO";
}

// select("*") de PostgREST tiene un tope de 1000 filas por defecto -- Nod_01/
// 02/03 con DNI ya son ~1746 filas, asi que hace falta paginar.
async function fetchSupabaseRowsPaginado(table, query, pageSize = 1000) {
  let offset = 0;
  let todas = [];
  for (;;) {
    const pagina = await fetchSupabaseRows(table, `${query}&limit=${pageSize}&offset=${offset}`);
    todas = todas.concat(pagina);
    if (!Array.isArray(pagina) || pagina.length < pageSize) break;
    offset += pageSize;
  }
  return todas;
}

async function consultarMikrowispPorCedula(cedula) {
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/GetClientsDetails");
  const response = await fetchConTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token: MIKROWISP_TOKEN, cedula }),
  }, 20000);
  return readProxyJsonResponse(response, "Mikrowisp GetClientsDetails (sync estados)");
}

// Mikrowisp entrega fecha_suspendido en hora local de Lima, sin offset
// ("2026-09-13 23:50:08") -- se le agrega "-05:00" explicito para que
// Postgres no la interprete como UTC por error (5 horas de diferencia).
function normalizarFechaSuspendidoMikrowisp(raw) {
  const txt = String(raw || "").trim();
  if (!txt || txt.startsWith("0000-00-00")) return null;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(txt) ? `${txt}-05:00` : txt;
}

async function aplicarEstadoSiCambio(fila, estadoNuevo, fechaSuspendidoNueva, resumen) {
  if (!estadoNuevo || estadoNuevo === "DESCONOCIDO") {
    resumen.sin_match += 1;
    resumen.detalle_sin_match.push({ id: fila.id, dni: fila.dni, motivo: "Mikrowisp no devolvio un estado reconocible" });
    return;
  }
  const estadoCambio = estadoNuevo !== String(fila.estado_servicio || "").toUpperCase();
  // fecha_suspendido puede llegar vacia hoy (columna nueva, filas viejas sin
  // dato) aunque el estado no haya cambiado -- se completa igual la
  // primera vez que se ve, sin esperar a que el estado cambie de nuevo.
  const fechaCambio = (fechaSuspendidoNueva || null) !== (fila.fecha_suspendido || null);
  if (!estadoCambio && !fechaCambio) {
    resumen.sin_cambios += 1;
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${fila.id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      // Solo estado_servicio/fecha_suspendido -- NUNCA reescribir la fila
      // completa aca. Bug real ya ocurrido antes con la version manual:
      // reescribir todo el registro desde una copia en memoria pisaba
      // caja_nap/puerto_nap a null para cualquier cliente cuyo estado
      // hubiera cambiado.
      body: JSON.stringify({
        estado_servicio: estadoNuevo,
        fecha_suspendido: fechaSuspendidoNueva,
        ultima_actualizacion: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    resumen.actualizados += 1;
  } catch (e) {
    resumen.errores += 1;
  }
}

async function sincronizarEstadosMikrowisp() {
  const resumen = {
    total_dnis: 0, total_filas: 0, actualizados: 0, sin_cambios: 0,
    sin_match: 0, errores: 0, detalle_sin_match: [], iniciado: new Date().toISOString(),
  };

  const filasCrudas = await fetchSupabaseRowsPaginado(
    "clientes",
    `select=id,dni,usuario_nodo,estado_servicio,fecha_suspendido&nodo=in.(${ESTADO_SYNC_NODOS.join(",")})&dni=not.is.null`
  );
  const filas = filasCrudas.filter((f) => String(f.dni || "").replace(/\D/g, "").length >= 6);
  resumen.total_filas = filas.length;

  const porDni = new Map();
  for (const f of filas) {
    const dni = String(f.dni || "").replace(/\D/g, "");
    if (!porDni.has(dni)) porDni.set(dni, []);
    porDni.get(dni).push(f);
  }
  resumen.total_dnis = porDni.size;

  const dnis = Array.from(porDni.keys());
  const CONCURRENCIA = 5;
  for (let i = 0; i < dnis.length; i += CONCURRENCIA) {
    const lote = dnis.slice(i, i + CONCURRENCIA);
    await Promise.all(lote.map(async (dni) => {
      const filasDelDni = porDni.get(dni);
      let resp;
      try {
        resp = await consultarMikrowispPorCedula(dni);
      } catch (e) {
        resumen.errores += filasDelDni.length;
        return;
      }
      const datosArr = Array.isArray(resp?.datos) ? resp.datos : (resp?.datos ? [resp.datos] : []);
      if (!datosArr.length) {
        resumen.sin_match += filasDelDni.length;
        filasDelDni.forEach((f) => resumen.detalle_sin_match.push({ id: f.id, dni, motivo: "Mikrowisp no devolvio datos para esta cedula" }));
        return;
      }
      // Un solo servicio registrado para este DNI en nuestra base -- no
      // hace falta emparejar por pppuser, se usa el estado del (unico)
      // resultado directo.
      if (filasDelDni.length === 1) {
        await aplicarEstadoSiCambio(
          filasDelDni[0],
          normalizarEstadoMikrowispSync(datosArr[0]?.estado),
          normalizarFechaSuspendidoMikrowisp(datosArr[0]?.fecha_suspendido),
          resumen
        );
        return;
      }
      // 2+ servicios para el mismo DNI: emparejar cada fila nuestra con el
      // registro de Mikrowisp cuyo servicios[].pppuser coincida con
      // usuario_nodo -- evita aplicar a ciegas el estado de un servicio al
      // otro solo por compartir DNI (bug real detectado con datos de
      // produccion antes de automatizar esto).
      for (const fila of filasDelDni) {
        const usuarioNodo = String(fila.usuario_nodo || "").trim().toLowerCase();
        if (!usuarioNodo) {
          resumen.sin_match += 1;
          resumen.detalle_sin_match.push({ id: fila.id, dni, motivo: "DNI con 2+ servicios y esta fila no tiene usuario_nodo guardado para emparejar" });
          continue;
        }
        const match = datosArr.find((d) =>
          Array.isArray(d?.servicios) && d.servicios.some((s) => String(s?.pppuser || "").trim().toLowerCase() === usuarioNodo)
        );
        if (!match) {
          resumen.sin_match += 1;
          resumen.detalle_sin_match.push({ id: fila.id, dni, motivo: `DNI con 2+ servicios, pppuser "${fila.usuario_nodo}" no aparece en la respuesta de Mikrowisp` });
          continue;
        }
        await aplicarEstadoSiCambio(
          fila,
          normalizarEstadoMikrowispSync(match?.estado),
          normalizarFechaSuspendidoMikrowisp(match?.fecha_suspendido),
          resumen
        );
      }
    }));
    await new Promise((r) => setTimeout(r, 250));
  }

  resumen.terminado = new Date().toISOString();
  return resumen;
}

// ─── Corte automatico de facturas "Libre" de prorrateo vencidas ─────────
// Mikrowisp NO corta ni avisa solo para facturas tipo "Libre" (solo para
// las "Servicios" normales) -- confirmado revisando su documentacion
// oficial. Sin esto, un cliente podia dejar de pagar el prorrateo de la
// instalacion sin ninguna consecuencia automatica, ya que con el fix de
// fecha_fija (ver mas arriba) tampoco se genera una factura "Servicios"
// hasta el siguiente ciclo completo.
// Pedido explicito del usuario: 10 dias de tolerancia desde el vencimiento,
// aviso por WhatsApp 1 dia antes de cortar (dia 9), corte al dia 10. Al
// pagar la factura (PaidInvoice, flujo normal de oficina), Mikrowisp
// reactiva solo -- documentado textualmente como "Pagar una factura y
// Activa al cliente si se encuentra suspendido" -- por eso este job NUNCA
// llama ActiveService, solo vigila para avisar/cortar.
const PRORRATEO_DIAS_GRACIA = Number(process.env.PRORRATEO_DIAS_GRACIA || 10);
const PRORRATEO_NODOS = (process.env.PRORRATEO_NODOS || "Nod_01,Nod_02,Nod_03")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

async function obtenerWhatsappConfigEmpresa(empresa) {
  try {
    const rows = await fetchSupabaseRows("whatsapp_config", `select=*&empresa=eq.${encodeURIComponent(empresa)}&limit=1`);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

async function enviarWhatsAppProrrateo(waCfg, fila, diasVencido) {
  if (!waCfg?.habilitado || !waCfg.base_url || !waCfg.api_key || !waCfg.instance_name) return false;
  const numeroRaw = String(fila.celular || "").split(/[,;/|]+/)[0].trim();
  if (!numeroRaw) return false;
  let phone = numeroRaw.replace(/[\s\-()]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (/^9\d{8}$/.test(phone)) phone = "51" + phone;
  const tpl = waCfg.template_prorrateo_recordatorio ||
    "RECORDATORIO\n📣 {empresa}:\nHola {nombre}, le recordamos que tiene un pago pendiente de S/{monto} por la instalación de su servicio, con vencimiento el {fecha}.\n\nEvita el corte realizando tu pago a tiempo.\n\n📧 Envíanos tu comprobante o consulta los métodos de pago aquí 👇\n\nCódigo: {dni}🔑";
  const mensaje = tpl
    .replace(/{nombre}/g, fila.nombre || "")
    .replace(/{dni}/g, fila.dni || "")
    .replace(/{empresa}/g, fila.empresa || "AMERICANET")
    .replace(/{fecha}/g, fila.prorrateo_vencimiento || "")
    .replace(/{monto}/g, fila.prorrateo_monto != null ? String(fila.prorrateo_monto) : "");
  try {
    const url = `${String(waCfg.base_url).replace(/\/$/, "")}/message/sendText/${waCfg.instance_name}`;
    const res = await fetchConTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: waCfg.api_key },
      body: JSON.stringify({ number: phone, text: mensaje }),
    }, 10000);
    return res.ok;
  } catch {
    return false;
  }
}

async function revisarProrrateosVencidos() {
  const resumen = { revisados: 0, avisados: 0, suspendidos: 0, pagados: 0, errores: 0, iniciado: new Date().toISOString() };
  try {
    const filas = await fetchSupabaseRowsPaginado(
      "clientes",
      `select=id,dni,nombre,nodo,celular,empresa,prorrateo_factura_id,prorrateo_vencimiento,prorrateo_aviso_enviado&prorrateo_factura_id=not.is.null&nodo=in.(${PRORRATEO_NODOS.join(",")})`
    );
    resumen.revisados = filas.length;
    const hoyLima = new Date(Date.now() - 5 * 3600000); // UTC-5, sin horario de verano

    for (const fila of filas) {
      try {
        if (!fila.prorrateo_vencimiento) continue;
        const vence = new Date(fila.prorrateo_vencimiento + "T00:00:00");
        const diasVencido = Math.floor((hoyLima - vence) / 86400000);
        if (diasVencido < PRORRATEO_DIAS_GRACIA - 1) continue; // ni aviso ni corte todavia

        // Confirmar contra Mikrowisp si de verdad sigue sin pagar --
        // nunca confiar solo en nuestra copia local, puede estar desactualizada.
        const endpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/GetInvoice");
        const response = await fetchConTimeout(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ token: MIKROWISP_TOKEN, idfactura: fila.prorrateo_factura_id }),
        }, 15000);
        const json = await readProxyJsonResponse(response, "Mikrowisp GetInvoice (prorrateo)");
        const factura = json?.factura || (Array.isArray(json?.datos) ? json.datos[0] : json?.datos) || json;
        const estado = String(factura?.estado || "").toLowerCase();

        if (estado === "pagado") {
          // Ya se pago -- dejar de vigilar esta factura. Mikrowisp ya
          // reactivo solo si estaba suspendido (PaidInvoice lo hace).
          await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${fila.id}`, {
            method: "PATCH",
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ prorrateo_factura_id: null, prorrateo_vencimiento: null, prorrateo_aviso_enviado: false }),
          });
          resumen.pagados += 1;
          continue;
        }

        if (diasVencido === PRORRATEO_DIAS_GRACIA - 1) {
          // Dia 9: aviso, todavia sin cortar.
          if (fila.prorrateo_aviso_enviado) continue;
          const waCfg = await obtenerWhatsappConfigEmpresa(fila.empresa || "Americanet");
          const enviado = await enviarWhatsAppProrrateo(waCfg, { ...fila, prorrateo_monto: factura?.total }, diasVencido);
          if (enviado) {
            await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${fila.id}`, {
              method: "PATCH",
              headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({ prorrateo_aviso_enviado: true }),
            });
            resumen.avisados += 1;
          }
          continue;
        }

        if (diasVencido >= PRORRATEO_DIAS_GRACIA) {
          // Dia 10+: cortar via Mikrowisp (SuspendService) -- no por
          // Mikrotik directo, asi Mikrowisp tambien queda al tanto.
          // "clientes" no guarda el id interno de Mikrowisp (vive en el
          // espejo "mikrowisp_clientes", enlazado por cedula, no por id) --
          // se consulta en vivo por cedula, mismo patron ya usado en
          // sincronizarEstadosMikrowisp.
          const dniLimpio = String(fila.dni || "").replace(/\D/g, "");
          if (!dniLimpio) { resumen.errores += 1; continue; }
          const mkwResp = await consultarMikrowispPorCedula(dniLimpio).catch(() => null);
          const mkwId = mkwResp?.datos?.[0]?.id || mkwResp?.datos?.id;
          if (!mkwId) { resumen.errores += 1; continue; }
          const susEndpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/SuspendService");
          const susRes = await fetchConTimeout(susEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ token: MIKROWISP_TOKEN, idcliente: mkwId }),
          }, 15000);
          await readProxyJsonResponse(susRes, "Mikrowisp SuspendService (prorrateo)");
          await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${fila.id}`, {
            method: "PATCH",
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ prorrateo_factura_id: null, prorrateo_vencimiento: null, prorrateo_aviso_enviado: false }),
          });
          resumen.suspendidos += 1;
        }
      } catch (e) {
        resumen.errores += 1;
        console.error(`[prorrateo] error con cliente id=${fila.id}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error("[prorrateo] error general:", e.message || e);
  }
  resumen.terminado = new Date().toISOString();
  return resumen;
}

// ─── Promo "1000 Mbps por S/25 el primer mes" (piloto DIM) ───────────────────
// Separado de revisarProrrateosVencidos() a proposito -- el prorrateo normal
// se queda EXACTAMENTE igual, sin riesgo de tocar su comportamiento ya en
// produccion. Este job solo corre sobre clientes.promo1000_estado.
//
// Diferencia clave con el prorrateo normal: el servicio es prepago, asi que
// la PRIMERA factura de cada cliente (el prorrateo previo si cae en el
// bucket "medio", o la promo misma si cae en "temprano"/"tardio") ya se
// cobro en campo y se marco pagada al momento de liquidar la orden (ver
// crearServicioMikrowispNod04AlLiquidar en la app movil). Este job entonces
// NO persigue el pago de esa primera factura -- solo hace las transiciones
// que dependen de la FECHA:
//   1. "prorrateo" -> "promo": cuando se cumple la fecha en que debe
//      arrancar la promo, sube el servicio a 1000 Mbps y genera la factura
//      de S/25 (esta SI hay que perseguirla, el cliente la paga por fuera,
//      no en campo).
//   2. "promo" -> completado: cuando se cumple el mes de promo, baja el
//      servicio al plan real elegido -- de ahi en adelante Mikrowisp cobra
//      solo, con su ciclo normal (fecha_fija ya quedo seteada al liquidar).
const PROMO1000_DIAS_GRACIA = Number(process.env.PROMO1000_DIAS_GRACIA || 10);

async function procesarPromos1000() {
  const resumen = { revisados: 0, subidas_a_promo: 0, bajadas_a_plan_real: 0, avisados: 0, suspendidos: 0, pagados: 0, errores: 0, iniciado: new Date().toISOString() };
  try {
    const filas = await fetchSupabaseRowsPaginado(
      "clientes",
      `select=id,dni,nombre,nodo,celular,empresa,promo1000_estado,promo1000_factura_id,promo1000_vencimiento,promo1000_aviso_enviado,promo1000_id_perfil_real,promo1000_id_perfil_promo,promo1000_fecha_cambio_plan&promo1000_estado=not.is.null`
    );
    resumen.revisados = filas.length;
    const hoyLima = new Date(Date.now() - 5 * 3600000); // UTC-5, sin horario de verano
    const hoyStr = hoyLima.toISOString().split("T")[0];

    for (const fila of filas) {
      try {
        const dniLimpio = String(fila.dni || "").replace(/\D/g, "");
        if (!dniLimpio) { resumen.errores += 1; continue; }

        // Paso 1: todavia en el prorrateo previo (bucket "medio") -- cuando
        // se cumple el dia siguiente al vencimiento de esa factura, arranca
        // la promo.
        if (fila.promo1000_estado === "prorrateo") {
          if (!fila.promo1000_vencimiento) { resumen.errores += 1; continue; }
          const promoInicio = new Date(fila.promo1000_vencimiento + "T00:00:00");
          promoInicio.setDate(promoInicio.getDate() + 1);
          if (hoyLima < promoInicio) continue; // todavia no le toca

          const mkwResp = await consultarMikrowispPorCedula(dniLimpio).catch(() => null);
          const cli = mkwResp?.datos?.[0] || mkwResp?.datos;
          const mkwId = cli?.id;
          const svc = cli?.servicios?.[0];
          if (!mkwId || !svc?.id) { resumen.errores += 1; continue; }

          await handleMkwProxyAccion("EditService", 5, {
            id_servicio: svc.id,
            id_router: Number(svc.id_router) || 5,
            id_perfil: Number(fila.promo1000_id_perfil_promo),
          }).catch(() => {});

          const facRes = await handleMkwProxyAccion("CreateInvoiceLibre", 5, {
            id_cliente: mkwId,
            fecha_vencimiento: hoyStr,
            items: [{ descripcion: "Promo 1000 Mbps - primer mes", cantidad: 1, precio: 25, impuesto: 18 }],
          }).catch(() => null);
          const idFactura = facRes?.factura_id;
          if (!idFactura) { resumen.errores += 1; continue; }

          await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${fila.id}`, {
            method: "PATCH",
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ promo1000_estado: "promo", promo1000_factura_id: String(idFactura), promo1000_vencimiento: hoyStr, promo1000_aviso_enviado: false }),
          });
          resumen.subidas_a_promo += 1;
          continue; // el seguimiento de pago/corte de ESTA factura recien se revisa al dia siguiente
        }

        // Paso 2: en su mes de promo -- revisar si hay que avisar/cortar
        // por falta de pago (solo aplica de verdad al bucket "medio": en
        // "temprano"/"tardio" esta factura ya vino pagada desde la
        // liquidacion, GetInvoice simplemente lo confirma y no hace nada
        // mas) y, llegado el dia, bajar al plan real elegido.
        if (fila.promo1000_estado === "promo") {
          if (fila.promo1000_factura_id) {
            const facturaJson = await handleMkwProxyAccion("GetInvoice", 5, { idfactura: fila.promo1000_factura_id }).catch(() => null);
            const factura = facturaJson?.factura || (Array.isArray(facturaJson?.datos) ? facturaJson.datos[0] : facturaJson?.datos) || facturaJson;
            const estado = String(factura?.estado || "").toLowerCase();
            if (estado === "pagado") {
              resumen.pagados += 1;
            } else if (fila.promo1000_vencimiento) {
              const vence = new Date(fila.promo1000_vencimiento + "T00:00:00");
              const diasVencido = Math.floor((hoyLima - vence) / 86400000);
              if (diasVencido === PROMO1000_DIAS_GRACIA - 1 && !fila.promo1000_aviso_enviado) {
                const waCfg = await obtenerWhatsappConfigEmpresa(fila.empresa || "DIM");
                const enviado = await enviarWhatsAppProrrateo(waCfg, { ...fila, prorrateo_vencimiento: fila.promo1000_vencimiento, prorrateo_monto: 25 }, diasVencido);
                if (enviado) {
                  await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${fila.id}`, {
                    method: "PATCH",
                    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
                    body: JSON.stringify({ promo1000_aviso_enviado: true }),
                  });
                  resumen.avisados += 1;
                }
              } else if (diasVencido >= PROMO1000_DIAS_GRACIA) {
                const mkwResp = await consultarMikrowispPorCedula(dniLimpio).catch(() => null);
                const mkwId = mkwResp?.datos?.[0]?.id || mkwResp?.datos?.id;
                if (mkwId) {
                  await handleMkwProxyAccion("SuspendService", 5, { idcliente: mkwId }).catch(() => {});
                  resumen.suspendidos += 1;
                }
              }
            }
          }

          // Independiente del pago: si ya se cumplio el mes de promo, baja
          // al plan real igual (si quedo suspendido por falta de pago,
          // sigue suspendido -- Mikrowisp lo reactiva solo al pagar,
          // PaidInvoice ya confirmado que reactiva automaticamente).
          if (fila.promo1000_fecha_cambio_plan && hoyStr >= fila.promo1000_fecha_cambio_plan) {
            const mkwResp2 = await consultarMikrowispPorCedula(dniLimpio).catch(() => null);
            const cli2 = mkwResp2?.datos?.[0] || mkwResp2?.datos;
            const svc2 = cli2?.servicios?.[0];
            if (svc2?.id) {
              await handleMkwProxyAccion("EditService", 5, {
                id_servicio: svc2.id,
                id_router: Number(svc2.id_router) || 5,
                id_perfil: Number(fila.promo1000_id_perfil_real),
              }).catch(() => {});
              await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${fila.id}`, {
                method: "PATCH",
                headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
                body: JSON.stringify({ promo1000_estado: null, promo1000_factura_id: null, promo1000_vencimiento: null, promo1000_aviso_enviado: false }),
              });
              resumen.bajadas_a_plan_real += 1;
            } else {
              resumen.errores += 1;
            }
          }
        }
      } catch (e) {
        resumen.errores += 1;
        console.error(`[promo1000] error con cliente id=${fila.id}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error("[promo1000] error general:", e.message || e);
  }
  resumen.terminado = new Date().toISOString();
  return resumen;
}

const proxyMikrowispNewUser = async (req) => {
  const body = await inyectarTokenMikrowisp(req, MIKROWISP_TOKEN);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/NewUser");
  const response = await fetchConTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp NewUser");
  return { status: response.status, json };
};

const proxyMikrowispNod04NewUser = async (req) => {
  const body = await inyectarTokenMikrowisp(req, MIKROWISP_NOD04_TOKEN);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_NOD04_API_BASE, "/NewUser");
  const response = await fetchConTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp Nod04 NewUser");
  return { status: response.status, json };
};

// ── Proxy generico "sidebar-proxy" (reemplaza el webhook de n8n) ───────────
// Mismo contrato que el nodo "Code_Proxy" de n8n: recibe {nodo, accion,
// payload, token} y decide a que Mikrowisp/Chatwoot/SmartOLT pegarle. Vive
// aca (nuestro backend) en vez de n8n para evitar el salto extra de red y la
// contencion con otros workflows (bot de pagos) que corren en esa misma
// instancia de n8n compartida.
const MKW_PROXY_TIMEOUT_MS = 20000;
const fetchConTimeout = async (url, opts = {}, ms = MKW_PROXY_TIMEOUT_MS) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`Tiempo de espera agotado (${ms}ms) llamando a ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

// Nod_04=5, Nod_05=11, Nod_06=12 son el mismo Mikrowisp de DimFiber
// (app.dimfiber.com); el "4" se mantiene por compatibilidad con el codigo
// viejo de n8n que ya usaba ese valor ademas del 5.
// OJO: "12" se saco de este set -- colisiona con el router NUEVO de Nod_03
// (Americanet, VLAN 102), que por coincidencia tiene el mismo id numerico
// en la instancia de Mikrowisp de Americanet. Con "12" en este set, un
// pedido de GetRedesIpv4/GetPerfiles para el Nod_03 nuevo se clasificaba
// como DIM y se mandaba a la instancia de Mikrowisp equivocada
// (app.dimfiber.com en vez de americanet.club) -- por eso el "Rango IPv4"
// salia vacio al crear un servicio en Nod_03. Confirmado que nada de este
// codigo manda nodo=11/12 para DIM en este proxy generico (siempre manda
// nodo=5, literal, via el patron "esDim ? 5 : nodoNum"); "11" se deja
// porque no colisiona con ningun router de Americanet.
const MKW_PROXY_NODOS_DIM = new Set([4, 5, 11]);
const MKW_PROXY_ACCIONES = new Set([
  "GetInvoices", "GetInvoice", "GetClientsDetails", "PaidInvoice", "PromesaPago",
  "CreateInvoice", "CreateInvoiceLibre", "DeleteInvoice", "DeleteTransaccion",
  "ActiveService", "SuspendService", "UpdateUser", "GetPerfiles", "EditService",
  "GetRedesIpv4", "NewService", "GetPlantillasFacturacion", "NewSMS",
  "ChangeFacturacionConfig",
]);

// Tokens por defecto identicos a los que ya usaba el Code_Proxy de n8n
// (hardcodeados ahi tambien, no via env var). OJO: son distintos de
// MIKROWISP_TOKEN/MIKROWISP_NOD04_TOKEN de mas arriba -- esas dos si vienen
// de variables de entorno del servicio "diagno" en Easypanel, y la de
// Americanet (MIKROWISP_TOKEN) esta mal configurada ahi (se resuelve a
// "......" en vez del token real, confirmado con /api/mikrowisp/test). En la
// practica casi todas las llamadas ya mandan su propio token de agente, asi
// que esto solo importa como fallback cuando no se manda ninguno.
const MKW_PROXY_DEFAULT_TOKEN_DIM = "SE8xNXBlNzBvR2NFTFlQVWl0Y0psZz09";
const MKW_PROXY_DEFAULT_TOKEN_AMN = "LzNXSERnUHBMMS91b0NzUGFTVkFkZz09";

const handleMkwProxyAccion = async (accion, nodo, payload, tokenOverride, baseOverride, esDimOverride) => {
  if (!MKW_PROXY_ACCIONES.has(accion)) throw new Error("Accion no permitida: " + accion);
  // esDimOverride: nodo=12 es ambiguo (Nod_06 de DimFiber Y Nod_03 migrado de
  // Americanet usan ese mismo numero en sus respectivas instancias de
  // Mikrowisp -- ver comentario de MKW_PROXY_NODOS_DIM). Cuando el que llama
  // YA SABE a que cliente/instancia pertenece el dato (ej: SidebarApp leyendo
  // una fila de mikrowisp_clientes cuyo "empresa" ya resolvio como "nod06"),
  // manda este flag explicito en vez de confiar en la adivinanza por numero.
  const isDim = typeof esDimOverride === "boolean" ? esDimOverride : MKW_PROXY_NODOS_DIM.has(Number(nodo || 0));
  // baseOverride: permite que un cliente (via CRM/tenant_config) mande su
  // propia URL de Mikrowisp sin que el servidor tenga que conocerla de
  // antemano -- asi un tenant nuevo funciona sin tocar este archivo.
  const base = baseOverride || (isDim ? MIKROWISP_NOD04_API_BASE : MIKROWISP_API_BASE);
  const defaultTok = isDim ? MKW_PROXY_DEFAULT_TOKEN_DIM : MKW_PROXY_DEFAULT_TOKEN_AMN;
  const tok = tokenOverride || defaultTok;
  const endpoint = buildAbsoluteApiUrl(base, "/" + accion);
  const response = await fetchConTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token: tok, ...(payload || {}) }),
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp " + accion);
  return json;
};

// ─── Resolucion de credenciales de Chatwoot por tenant (multi-tenant aditivo) ──
// Permite que un ISP nuevo, dado de alta SOLO en el CRM (tabla tenant_config),
// use esta misma instancia compartida sin desplegar una copia propia ni tocar
// variables de entorno aca. Si el request no manda tenant_id, todo se
// comporta EXACTAMENTE igual que antes (constantes CHATWOOT_BASE/TOKEN de
// arriba) -- Americanet, DIM y cualquier otro tenant con instancia dedicada
// propia no se ven afectados por este cambio en absoluto.
//
// Seguridad: cada tenant tiene su PROPIO backend_token (nunca compartido
// entre tenants) guardado en tenant_config. El frontend de ese tenant lo
// manda en cada request junto a su tenant_id; aca se compara contra lo
// guardado antes de usar las credenciales de Chatwoot de ESE tenant. Si
// alguien extrae el token del bundle publico de un tenant (es un VITE_*,
// siempre extraible), solo puede suplantar a ESE tenant -- mismo radio de
// exposicion que ya existe hoy con las instancias dedicadas por tenant.
const AMNET_CRM_SUPABASE_URL = "https://cdwdmuwfahihqbnkxlxl.supabase.co";
const AMNET_CRM_SERVICE_ROLE_KEY = String(process.env.AMNET_CRM_SERVICE_ROLE_KEY || "").trim();
const TENANT_CREDS_CACHE_MS = 5 * 60 * 1000;
const tenantCredsCache = new Map(); // tenant_id -> { data, expiresAt }

async function resolveTenantChatwootCreds(tenantId, tenantToken) {
  if (!tenantId) return null; // sin tenant_id -> comportamiento de siempre
  if (!tenantToken) throw new Error("tenant_token requerido junto con tenant_id.");
  if (!AMNET_CRM_SERVICE_ROLE_KEY) {
    throw new Error("AMNET_CRM_SERVICE_ROLE_KEY no configurado en este servidor -- no se puede resolver tenants.");
  }
  const cacheado = tenantCredsCache.get(tenantId);
  if (cacheado && cacheado.expiresAt > Date.now()) return cacheado.data;
  const url = `${AMNET_CRM_SUPABASE_URL}/rest/v1/tenant_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=backend_token,chatwoot_url,chatwoot_token`;
  const res = await fetch(url, {
    headers: {
      apikey: AMNET_CRM_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${AMNET_CRM_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`No se pudo consultar tenant_config del CRM (HTTP ${res.status}).`);
  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !row.backend_token) throw new Error("Tenant desconocido o sin backend_token configurado en el CRM.");
  if (String(row.backend_token) !== String(tenantToken)) throw new Error("Token de tenant invalido.");
  if (!row.chatwoot_url || !row.chatwoot_token) throw new Error("Este tenant no tiene Chatwoot configurado en el CRM.");
  const data = { base: String(row.chatwoot_url).trim().replace(/\/+$/, ""), token: String(row.chatwoot_token).trim() };
  tenantCredsCache.set(tenantId, { data, expiresAt: Date.now() + TENANT_CREDS_CACHE_MS });
  return data;
}

const cwBuscarContacto = async (phone, creds = null) => {
  const base = creds?.base || CHATWOOT_BASE;
  const token = creds?.token || CHATWOOT_TOKEN;
  const local = String(phone || "").slice(-9);
  for (const q of [phone, "51" + local, local]) {
    const sr = await fetchConTimeout(
      `${base}/api/v1/accounts/1/contacts/search?q=${encodeURIComponent(q)}`,
      { headers: { api_access_token: token } },
    ).then((r) => r.json()).catch(() => ({}));
    const contacts = sr?.payload?.contacts || sr?.payload || [];
    const found = Array.isArray(contacts) ? contacts[0] : null;
    if (found?.id) return found.id;
  }
  return null;
};

const cwFetchAllMessages = async (convId, acctId, creds = null) => {
  const base = creds?.base || CHATWOOT_BASE;
  const token = creds?.token || CHATWOOT_TOKEN;
  let all = [];
  let beforeId = null;
  for (let i = 0; i < 6; i++) {
    let url = `${base}/api/v1/accounts/${acctId}/conversations/${convId}/messages`;
    if (beforeId) url += "?before=" + beforeId;
    const mr = await fetchConTimeout(url, { headers: { api_access_token: token } }).then((r) => r.json()).catch(() => ({}));
    const page = mr?.payload?.messages || mr?.payload || [];
    if (!page.length) break;
    all = all.concat(page);
    const idsPagina = page.map((m) => Number(m.id)).filter((n) => Number.isFinite(n));
    if (!idsPagina.length) break;
    const masViejo = Math.min(...idsPagina);
    if (beforeId !== null && masViejo >= beforeId) break;
    beforeId = masViejo;
    if (page.length < 20) break;
  }
  return all;
};

const handleChatwootMessage = async (payload, creds = null) => {
  const base = creds?.base || CHATWOOT_BASE;
  const token = creds?.token || CHATWOOT_TOKEN;
  const phone = String(payload?.phone || "").replace(/\D/g, "");
  const msg = String(payload?.message || "");
  const acctId = String(payload?.account_id || "1");
  const attachmentUrl = payload?.attachment_url || null;
  if (!phone || !msg) throw new Error("phone y message requeridos");
  const contactId = await cwBuscarContacto(phone, creds);
  if (!contactId) throw new Error("Contacto no encontrado: " + phone);
  const cr = await fetchConTimeout(`${base}/api/v1/accounts/${acctId}/contacts/${contactId}/conversations`, {
    headers: { api_access_token: token },
  }).then((r) => r.json()).catch(() => ({}));
  const convs = cr?.payload || [];
  const conv = convs.find((c) => c.status === "open") || convs[0];
  if (!conv?.id) throw new Error("Sin conversación activa");
  if (attachmentUrl) {
    const imgRes = await fetchConTimeout(attachmentUrl, {});
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const fd = new FormData();
    fd.append("attachments[]", new Blob([buf], { type: contentType }), "imagen");
    fd.append("message_type", "outgoing");
    fd.append("private", "false");
    const upRes = await fetchConTimeout(`${base}/api/v1/accounts/${acctId}/conversations/${conv.id}/messages`, {
      method: "POST",
      headers: { api_access_token: token },
      body: fd,
    });
    await readProxyJsonResponse(upRes, "Chatwoot upload imagen").catch(() => ({}));
    const txtRes = await fetchConTimeout(`${base}/api/v1/accounts/${acctId}/conversations/${conv.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", api_access_token: token },
      body: JSON.stringify({ content: msg, message_type: "outgoing", private: false }),
    });
    return await readProxyJsonResponse(txtRes, "Chatwoot mensaje texto");
  }
  const mr = await fetchConTimeout(`${base}/api/v1/accounts/${acctId}/conversations/${conv.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", api_access_token: token },
    body: JSON.stringify({ content: msg, message_type: "outgoing", private: false }),
  });
  return await readProxyJsonResponse(mr, "Chatwoot mensaje");
};

const handleGetChatwootMessages = async (payload, creds = null) => {
  const base = creds?.base || CHATWOOT_BASE;
  const token = creds?.token || CHATWOOT_TOKEN;
  const phone = String(payload?.phone || "").replace(/\D/g, "");
  const acctId = String(payload?.account_id || "1");
  const directConvId = payload?.conv_id || null;
  if (directConvId) return { messages: await cwFetchAllMessages(directConvId, acctId, creds) };
  if (!phone) throw new Error("phone o conv_id requerido");
  const contactId = await cwBuscarContacto(phone, creds);
  if (!contactId) throw new Error("Contacto no encontrado");
  const cr = await fetchConTimeout(`${base}/api/v1/accounts/${acctId}/contacts/${contactId}/conversations`, {
    headers: { api_access_token: token },
  }).then((r) => r.json()).catch(() => ({}));
  const convs = cr?.payload || [];
  let allMessages = [];
  for (const conv of convs.slice(0, 3)) {
    if (!conv?.id) continue;
    allMessages = allMessages.concat(await cwFetchAllMessages(conv.id, acctId, creds));
  }
  return { messages: allMessages };
};

const handleSmartOltSignal = async (sn) => {
  if (!sn) throw new Error("SN requerido");
  const res = await fetchConTimeout(
    `${SMARTOLT_API_BASE}/onu/get_onu_full_status_info/${encodeURIComponent(sn)}`,
    { headers: { "X-Token": SMARTOLT_TOKEN, Accept: "application/json" } },
  );
  return await readProxyJsonResponse(res, "SmartOLT signal");
};

const proxyMikrowispGenerico = async (req) => {
  const rawBody = await readRawBody(req);
  let body = {};
  try { body = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {}; } catch { body = {}; }
  const accion = body.accion || "";
  try {
    if (accion === "ChatwootMessage") {
      // tenant_id/tenant_token: opcionales, solo los manda un tenant nuevo
      // dado de alta en el CRM (no tiene instancia dedicada propia). Sin
      // ellos, se usa CHATWOOT_BASE/TOKEN de siempre (comportamiento actual
      // de Americanet/DIM/waw, sin cambios).
      const creds = await resolveTenantChatwootCreds(body.tenant_id, body.tenant_token);
      const data = await handleChatwootMessage(body.payload || {}, creds);
      return { status: 200, json: { ok: true, data } };
    }
    if (accion === "GetChatwootMessages") {
      const creds = await resolveTenantChatwootCreds(body.tenant_id, body.tenant_token);
      const data = await handleGetChatwootMessages(body.payload || {}, creds);
      return { status: 200, json: { ok: true, ...data } };
    }
    if (accion === "SmartOltSignal") {
      const data = await handleSmartOltSignal(body.sn || "");
      return { status: 200, json: { ok: true, data } };
    }
    const data = await handleMkwProxyAccion(accion, body.nodo, body.payload, body.token, body.apiBase, body.esDim);
    return { status: 200, json: { ok: true, data } };
  } catch (e) {
    return { status: 200, json: { ok: false, error: e.message } };
  }
};

// ── Actualizar contacto de Chatwoot (para DIM -- reemplazo del flujo n8n que
// usa Americanet, que queda intacto y aparte). DIM no quiere depender de n8n
// para esto, y pidió explicitamente que Mikrowisp/Chatwoot queden
// configurables desde el navegador en vez de fijos por variable de entorno
// del servicio -- por eso ambos se leen de la tabla "tenant_config" (misma
// tabla que ya usan xtream_proxy_url/maxplayer_token para DIM) en vez de
// las constantes MIKROWISP_*/CHATWOOT_* de mas arriba (esas son especificas
// de Americanet y quedan sin tocar). El router Mikrotik SI reusa
// queryRouter()/resolveRouterByNodo() tal cual, porque esas tablas
// (mikrotik_routers/mikrotik_nodo_router) ya son editables desde Supabase
// por nodo -- no hace falta otro mecanismo de configuracion para eso.
const normalizarTelefono = (s) => String(s || "").replace(/\D/g, "");
const DEFAULT_TENANT_ID = String(process.env.TENANT_ID || "dim").trim();

let _tenantConfigCache = null; // { data, en: ms }
const TENANT_CONFIG_TTL_MS = 60_000;

const cargarTenantConfig = async (tenantId) => {
  if (_tenantConfigCache && Date.now() - _tenantConfigCache.en < TENANT_CONFIG_TTL_MS) {
    return _tenantConfigCache.data;
  }
  const rows = await fetchSupabaseRows(
    "tenant_config",
    `select=tenant_id,mikrowisp_url,mikrowisp_token,chatwoot_base_url,chatwoot_token,evolution_base_url,evolution_api_key&tenant_id=eq.${encodeURIComponent(tenantId)}&limit=1`
  );
  const cfg = Array.isArray(rows) && rows[0] ? rows[0] : null;
  _tenantConfigCache = { data: cfg, en: Date.now() };
  return cfg;
};

// order=id.asc explicito: un mismo DNI/telefono puede tener mas de un
// servicio (instalaciones en distintas direcciones/nodos) -- el criterio
// acordado es que el PRIMER servicio (el mas viejo) es el que manda en el
// contacto de Chatwoot, y nunca se pisa por uno nuevo que se pida despues.
// Sin este order explicito, Postgrest no garantiza cual fila devuelve primero.
const buscarPorTelefonoMikrowisp = async (telefono) => {
  const tel = normalizarTelefono(telefono);
  if (!tel) return null;
  // Probar el numero completo y los ultimos 9 digitos (sin codigo de pais) -- el
  // campo "telefonos" en la base no tiene un formato 100% consistente.
  const candidatos = [...new Set([tel, tel.slice(-9)])].filter(Boolean);
  for (const cand of candidatos) {
    const rows = await fetchSupabaseRows(
      "mikrowisp_clientes",
      `select=mikrowisp_id,cedula,nombre,nodo,telefonos&telefonos=ilike.*${encodeURIComponent(cand)}*&order=id.asc&limit=1`
    ).catch(() => []);
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  return null;
};

// Plan C: el telefono no esta ni en mikrowisp_clientes ni en clientes --
// antes de marcarlo generico "SIN REGISTRO", buscar si ya tiene una orden
// creada (instalacion agendada/en curso, o liquidada pero que por algun
// motivo todavia no termino de sincronizar a "clientes"). Mismo criterio de
// "el mas viejo gana": si tiene 2 ordenes, se usa la primera.
const buscarOrdenPorTelefono = async (telefono) => {
  const tel = normalizarTelefono(telefono);
  if (!tel) return null;
  const candidatos = [...new Set([tel, tel.slice(-9)])].filter(Boolean);
  for (const cand of candidatos) {
    const rows = await fetchSupabaseRows(
      "ordenes",
      `select=codigo,nombre,dni,nodo,estado,tipo_actuacion,fecha_actuacion,atendida_sin_liquidar_en&celular=ilike.*${encodeURIComponent(cand)}*&order=fecha_creacion.asc&limit=1`
    ).catch(() => []);
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  return null;
};

// ── Proxy Evolution API (WhatsApp) -- la API key global de Evolution NUNCA
// debe viajar al navegador (mismo criterio que OpenAI/Huawei/VSOL de mas
// arriba), asi que el panel de DIM le pega a este proxy en vez de hablarle
// directo al servidor de Evolution. URL/key salen de tenant_config (igual
// patron que Mikrowisp/Chatwoot) -- configurable desde el navegador, no fijo
// por variable de entorno del servicio.
const handleEvolutionProxyAccion = async (accion, payload, tenantId) => {
  const cfg = await cargarTenantConfig(tenantId || DEFAULT_TENANT_ID);
  if (!cfg?.evolution_base_url || !cfg?.evolution_api_key) {
    throw new Error("Falta evolution_base_url/evolution_api_key en tenant_config.");
  }
  const base = cfg.evolution_base_url.replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json", apikey: cfg.evolution_api_key };
  const nombre = encodeURIComponent(payload?.instanceName || "");

  let url, method, body;
  if (accion === "FetchInstances") { url = `${base}/instance/fetchInstances`; method = "GET"; }
  else if (accion === "CreateInstance") {
    url = `${base}/instance/create`; method = "POST";
    body = JSON.stringify({ instanceName: payload.instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true, number: payload.number || undefined });
  }
  else if (accion === "Connect") { url = `${base}/instance/connect/${nombre}`; method = "GET"; }
  else if (accion === "ConnectionState") { url = `${base}/instance/connectionState/${nombre}`; method = "GET"; }
  else if (accion === "Logout") { url = `${base}/instance/logout/${nombre}`; method = "DELETE"; }
  else if (accion === "Delete") { url = `${base}/instance/delete/${nombre}`; method = "DELETE"; }
  else if (accion === "SetChatwoot") {
    // Conecta la instancia al Chatwoot del MISMO tenant (tenant_config) -- se
    // saca el accountId real pidiendole el perfil a Chatwoot con el token ya
    // guardado, asi no hace falta otro campo de configuracion a mano.
    if (!cfg.chatwoot_base_url || !cfg.chatwoot_token) throw new Error("Falta chatwoot_base_url/chatwoot_token en tenant_config.");
    const perfilRes = await fetchConTimeout(`${cfg.chatwoot_base_url.replace(/\/+$/, "")}/api/v1/profile`, { headers: { api_access_token: cfg.chatwoot_token } }, 10000);
    const perfil = await perfilRes.json().catch(() => ({}));
    const accountId = perfil?.account_id || perfil?.accounts?.[0]?.id;
    if (!accountId) throw new Error("No se pudo resolver el account_id de Chatwoot con el token guardado.");
    url = `${base}/chatwoot/set/${nombre}`; method = "POST";
    body = JSON.stringify({
      enabled: true,
      accountId: String(accountId),
      token: cfg.chatwoot_token,
      url: cfg.chatwoot_base_url.replace(/\/+$/, ""),
      nameInbox: payload.instanceName,
      autoCreate: true,
      signMsg: false,
      reopenConversation: true,
      conversationPending: false,
      importContacts: false,
      importMessages: false,
    });
  }
  else throw new Error(`Accion no permitida: ${accion}`);

  const res = await fetchConTimeout(url, { method, headers, body }, 20000);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Evolution API HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
};

// Cooldown por contacto: si una conversacion tiene varios mensajes seguidos
// en poco tiempo (de cualquiera de los dos lados), no tiene sentido repetir
// Mikrowisp/Mikrotik/señal en cada uno -- se actualiza una vez y se ignoran
// los que lleguen dentro de la ventana. En memoria nomas (si el servicio se
// reinicia, se resetea solo, no hace falta limpiar nada a mano).
const _cooldownPorContacto = new Map(); // "accountId:contactId" -> ms
const COOLDOWN_MS = 45_000;

const handleActualizarContactoChatwoot = async (body) => {
  // "message_created" se dispara para los dos lados (cliente Y agente) --
  // a pedido explicito se actualiza en ambos casos, sin filtrar por
  // message_type.
  const accountId = body?.account?.id ?? body?.account ?? null;
  const contactId = body?.conversation?.contact_inbox?.contact_id ?? null;
  const phone = body?.conversation?.meta?.sender?.phone_number || body?.sender?.phone_number || body?.phone || "";
  if (!body?.dry_run && (!accountId || !contactId)) {
    return { ok: false, motivo: "Webhook sin account_id/contact_id (no es un evento de conversacion)." };
  }

  const cooldownKey = `${accountId}:${contactId}`;
  if (!body?.dry_run) {
    const ultima = _cooldownPorContacto.get(cooldownKey);
    if (ultima && Date.now() - ultima < COOLDOWN_MS) {
      return { ok: false, motivo: `Cooldown activo (actualizado hace ${Math.round((Date.now() - ultima) / 1000)}s, se ignora hasta los ${COOLDOWN_MS / 1000}s).` };
    }
  }

  const tenantCfg = await cargarTenantConfig(body?.tenant_id || DEFAULT_TENANT_ID);
  if (!tenantCfg?.mikrowisp_url || !tenantCfg?.mikrowisp_token) {
    return { ok: false, motivo: "Falta mikrowisp_url/mikrowisp_token en tenant_config." };
  }
  if (!body?.dry_run && (!tenantCfg?.chatwoot_base_url || !tenantCfg?.chatwoot_token)) {
    return { ok: false, motivo: "Falta chatwoot_base_url/chatwoot_token en tenant_config." };
  }

  const mkw = await buscarPorTelefonoMikrowisp(phone);

  // Plan B: si no esta en mikrowisp_clientes (cliente recien instalado, o un
  // desfase de sincronizacion), buscar directo en "clientes" por celular en
  // vez de no hacer nada. No hay mikrowisp_id en este caso, asi que no se
  // puede traer facturacion en vivo -- pero al menos sale nombre, direccion,
  // nodo y conexion Mikrotik real, en vez de dejar el contacto sin tocar.
  let clientePorTelefono = null;
  if (!mkw) {
    const tel = normalizarTelefono(phone);
    const candidatos = [...new Set([tel, tel.slice(-9)])].filter(Boolean);
    for (const cand of candidatos) {
      const rows = await fetchSupabaseRows(
        "clientes",
        `select=nombre,direccion,nodo,usuario_nodo,velocidad,sn_onu,dni&celular=ilike.*${encodeURIComponent(cand)}*&order=id.asc&limit=1`
      ).catch(() => []);
      if (Array.isArray(rows) && rows[0]) { clientePorTelefono = rows[0]; break; }
    }
    if (!clientePorTelefono) {
      // Plan C: tampoco esta en "clientes" -- ver si ya tiene una orden
      // (instalacion agendada/atendida/liquidada-sin-sincronizar) antes de
      // marcarlo generico "sin registro".
      const orden = await buscarOrdenPorTelefono(phone);
      if (orden) {
        const codigoOrden = orden.codigo || "";
        const nombreOrden = orden.nombre || "";
        const estaLiquidada = String(orden.estado || "").trim().toLowerCase() === "liquidada";
        const estaAtendida = !!orden.atendida_sin_liquidar_en;
        const { icono, estadoCliente } = estaLiquidada
          ? { icono: "⚠️", estadoCliente: "Liquidada sin sincronizar" }
          : estaAtendida
            ? { icono: "🛠️", estadoCliente: "Atendida, falta liquidar" }
            : { icono: "📋", estadoCliente: "Orden pendiente" };
        const nombreContacto = [icono, nombreOrden, codigoOrden].filter(Boolean).join(" · ");
        const attrsOrden = {
          estado_cliente: estadoCliente,
          orden_codigo: codigoOrden,
          orden_tipo_actuacion: orden.tipo_actuacion || "",
          orden_estado: orden.estado || "",
          orden_fecha: orden.fecha_actuacion || "",
        };
        if (body?.dry_run) {
          return { ok: true, dry_run: true, orden: true, phone, nombre: nombreContacto, custom_attributes: attrsOrden };
        }
        const putResOrden = await fetchConTimeout(`${tenantCfg.chatwoot_base_url.replace(/\/+$/, "")}/api/v1/accounts/${accountId}/contacts/${contactId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", api_access_token: tenantCfg.chatwoot_token },
          body: JSON.stringify({ name: nombreContacto, custom_attributes: attrsOrden }),
        }).catch((e) => { console.warn("[actualizar-contacto] PUT orden error:", e.message); return null; });
        if (putResOrden && !putResOrden.ok) console.warn(`[actualizar-contacto] PUT orden HTTP ${putResOrden.status}`);
        _cooldownPorContacto.set(cooldownKey, Date.now());
        return { ok: true, orden: true, phone, nombre: nombreContacto };
      }
      // No es cliente en ningun lado -- en vez de dejar el contacto sin
      // tocar (confunde: no se sabe si fallo algo o si de verdad no es
      // cliente), se marca explicito para que se note de un vistazo. Puede
      // ser un lead nuevo de Ventas, o un cliente real escribiendo desde un
      // numero distinto al del titular -- en ambos casos el agente necesita
      // saber que la busqueda automatica no encontro nada.
      const nombreSinRegistro = "❓SIN REGISTRO";
      if (body?.dry_run) {
        return { ok: true, dry_run: true, sin_registro: true, phone, nombre: nombreSinRegistro };
      }
      const putRes = await fetchConTimeout(`${tenantCfg.chatwoot_base_url.replace(/\/+$/, "")}/api/v1/accounts/${accountId}/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", api_access_token: tenantCfg.chatwoot_token },
        body: JSON.stringify({ name: nombreSinRegistro, custom_attributes: { estado_cliente: "No encontrado" } }),
      }).catch((e) => { console.warn("[actualizar-contacto] PUT sin-registro error:", e.message); return null; });
      if (putRes && !putRes.ok) console.warn(`[actualizar-contacto] PUT sin-registro HTTP ${putRes.status}`);
      _cooldownPorContacto.set(cooldownKey, Date.now());
      return { ok: true, sin_registro: true, phone, nombre: nombreSinRegistro };
    }
  }

  const getClientsDetails = async (idcliente) => {
    const url = buildAbsoluteApiUrl(tenantCfg.mikrowisp_url, "/GetClientsDetails");
    const res = await fetchConTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token: tenantCfg.mikrowisp_token, idcliente }),
    });
    return readProxyJsonResponse(res, "Mikrowisp GetClientsDetails");
  };

  const detalle = mkw ? await getClientsDetails(mkw.mikrowisp_id).catch((e) => {
    console.warn("[actualizar-contacto] GetClientsDetails error:", e.message);
    return null;
  }) : null;
  let datosPrevio = detalle?.datos?.[0] || detalle?.data?.datos?.[0] || null;

  // Verificacion de seguridad: mikrowisp_clientes es un espejo que puede
  // quedar desactualizado -- visto en vivo un caso real donde el
  // mikrowisp_id guardado localmente para un telefono ya pertenece a OTRO
  // cliente en el Mikrowisp real (el id se reasigno). Sin este chequeo,
  // se terminaria mostrando la deuda/direccion de un cliente distinto bajo
  // la conversacion de otro -- no es solo un dato mal mostrado, es un
  // problema de privacidad. Si el telefono que devuelve Mikrowisp para
  // este idcliente no contiene el telefono que buscamos, se descarta la
  // respuesta por completo.
  if (datosPrevio) {
    const telDevuelto = normalizarTelefono(datosPrevio.movil || datosPrevio.telefono || "");
    const telBuscado = normalizarTelefono(phone);
    const coincide = telDevuelto && telBuscado && (telDevuelto.endsWith(telBuscado.slice(-9)) || telBuscado.endsWith(telDevuelto.slice(-9)));
    if (!coincide) {
      console.warn(`[actualizar-contacto] mikrowisp_id ${mkw.mikrowisp_id} desactualizado: telefono buscado ${telBuscado} no coincide con el que devuelve Mikrowisp (${telDevuelto}, cliente "${datosPrevio.nombre}"). Se descarta.`);
      datosPrevio = null;
    }
  }

  let cliente;
  let cedulaParaCruce;
  if (mkw) {
    // mikrowisp_clientes es un espejo que puede quedar desactualizado (visto
    // en vivo: una cedula guardada ahi no coincidia con la que Mikrowisp
    // devuelve HOY para el mismo mikrowisp_id) -- preferir siempre la cedula
    // fresca de la respuesta real de Mikrowisp para cruzar contra "clientes".
    cedulaParaCruce = datosPrevio?.cedula || mkw.cedula;
    const clienteRows = await fetchSupabaseRows("clientes", `select=nombre,direccion,nodo,usuario_nodo,velocidad,sn_onu&dni=eq.${encodeURIComponent(cedulaParaCruce)}&order=id.asc&limit=1`).catch(() => []);
    cliente = Array.isArray(clienteRows) && clienteRows[0] ? clienteRows[0] : null;
  } else {
    // Plan B: ya tenemos la fila de "clientes" encontrada por telefono, no
    // hace falta volver a buscarla.
    cliente = clientePorTelefono;
    cedulaParaCruce = clientePorTelefono.dni || null;
  }
  const datos = datosPrevio;
  const servicio = datos?.servicios?.[0] || null;
  const factBlock = datos?.facturacion || {};
  const facturasNoPagadas = Number(factBlock.facturas_nopagadas ?? factBlock.facturas_no_pagadas ?? 0);
  const totalFacturas = Number(factBlock.total_facturas ?? 0);
  const deudaResumen = totalFacturas > 0
    ? `Deuda: S/ ${totalFacturas.toFixed(2)} (${facturasNoPagadas} sin pagar)`
    : "Sin deudas";

  const nodoCliente = cliente?.nodo || null; // "Nod_XX"
  const userPppoe = servicio?.pppuser || cliente?.usuario_nodo || null;

  // Mikrotik (conectado/uptime) y señal óptica (olt-signal-dim, 1 sola
  // consulta SNMP por dentro) se piden en paralelo -- son independientes
  // entre si, no hace falta esperar uno para pedir el otro.
  const [mikrotikInfo, senalInfo] = await Promise.all([
    (nodoCliente && userPppoe)
      ? queryRouter({ nodo: nodoCliente, userPppoe }).catch((e) => {
          console.warn("[actualizar-contacto] queryRouter error:", e.message);
          return null;
        })
      : Promise.resolve(null),
    cliente?.sn_onu
      ? fetchConTimeout(
          OLT_SIGNAL_PROVIDER === "huawei"
            ? `${HUAWEI_OLT_SNMP_API}/onu-info?sn=${encodeURIComponent(cliente.sn_onu)}`
            : `${OLT_SSH_API}/signal?sn=${encodeURIComponent(cliente.sn_onu)}&nodo=${encodeURIComponent(nodoCliente || "")}`,
          {},
          8000
        )
          .then((r) => r.json())
          .then((j) => (j?.ok ? j : null))
          .catch((e) => {
            console.warn("[actualizar-contacto] signal error:", e.message);
            return null;
          })
      : Promise.resolve(null),
  ]);

  // Si esta desconectado, buscar el ULTIMO evento real de su ONU (olt-signal-
  // dim ya los guarda via traps SNMP) para distinguir corte de luz (power_down,
  // "ONU Dying Gasp") de perdida de señal/fibra cortada (los_down, "ONU Port
  // Los") -- mucho mas util para el agente que un generico "desconectado".
  let ultimoEventoOnu = null;
  if (cliente?.sn_onu && mikrotikInfo && mikrotikInfo.estado !== "conectado") {
    const eventoRows = await fetchSupabaseRows(
      "onu_eventos",
      `select=tipo,causa_texto,ocurrido_en&sn=eq.${encodeURIComponent(cliente.sn_onu)}&order=ocurrido_en.desc&limit=1`
    ).catch(() => []);
    ultimoEventoOnu = Array.isArray(eventoRows) && eventoRows[0] ? eventoRows[0] : null;
  }

  const nombreReal = cliente?.nombre || mkw?.nombre || "";

  // El "name" del contacto es lo UNICO siempre visible sin abrir nada (lista
  // de conversaciones, notificaciones, apps moviles que no muestran bien los
  // custom_attributes) -- el detalle completo ya lo resuelve el sidebar, asi
  // que aca solo van las 3 señales que sirven para decidir algo de un
  // vistazo: nodo (para detectar averia de zona si escriben varios juntos),
  // suspendido (explica "no tengo internet" sin entrar a nada), y
  // conexion/deuda cuando NO esta suspendido.
  const estaSuspendido = String(datos?.estado || "").trim().toUpperCase() === "SUSPENDIDO";
  const NOMBRE_MAX = 20;
  const nombreCorto = nombreReal.length > NOMBRE_MAX ? `${nombreReal.slice(0, NOMBRE_MAX)}…` : nombreReal;
  const etiquetaDeuda = totalFacturas > 0 ? `💸DEU S/${totalFacturas.toFixed(0)}` : null;
  // Solo se marca lo que importa: conectado (ON) es el estado esperado, no
  // aporta mostrarlo -- unicamente se señala cuando esta desconectado, y si
  // hay un evento real de la ONU se distingue sin luz de sin señal (fibra/
  // equipo) en vez de un generico "desconectado".
  const etiquetaOffline = ultimoEventoOnu?.tipo === "power_down" ? "🔌SIN ENERGÍA"
    : ultimoEventoOnu?.tipo === "los_down" ? "📡SIN SEÑAL"
    : "🔴OFFLINE";
  const etiquetaEstado = estaSuspendido
    ? "⛔SUSPENDIDO"
    : (mikrotikInfo && mikrotikInfo.estado !== "conectado" ? etiquetaOffline : "✅");
  // DNI, usuario PPPoE y deuda van SIEMPRE en su lugar de siempre (al final)
  // -- la deuda no es urgente, el cliente no necesariamente escribe por eso.
  // Lo que SI va pegado al nodo, al principio, es solo el ESTADO (sin
  // energia/sin señal/suspendido/offline): son los casos en los que el
  // cliente llama o escribe igual, asi que tienen que verse aunque la lista
  // angosta trunque el resto del texto. Si esta todo bien, el "✅" queda al
  // final, discreto.
  // Señal debil (peor que -26dBm, mas negativo) tambien es una alerta real --
  // explica cortes intermitentes aunque el PPPoE este conectado -- asi que va
  // pegada al nodo igual que el estado, no atras con DNI/PPPoE.
  const SENAL_MINIMA_DBM = -26;
  const senalEsDebil = senalInfo?.rxPower != null && senalInfo.rxPower < SENAL_MINIMA_DBM;
  // Icono distinto segun si la señal esta bien o no -- el rojo llama la
  // atencion de verdad cuando el parametro esta alto (señal debil), en vez
  // de usar el mismo icono neutro de siempre.
  const etiquetaSenal = senalInfo?.rxPower != null
    ? (senalEsDebil ? `🔴📶${senalInfo.rxPower}dBm` : `📶${senalInfo.rxPower}dBm`)
    : null;
  const estadoEsNegativo = etiquetaEstado !== "✅";
  const alertasFrente = [estadoEsNegativo ? etiquetaEstado : null, senalEsDebil ? etiquetaSenal : null].filter(Boolean);
  const nombreCompacto = alertasFrente.length
    ? [nodoCliente, ...alertasFrente, nombreCorto, cedulaParaCruce, userPppoe, (senalEsDebil ? null : etiquetaSenal), etiquetaDeuda].filter(Boolean).join(" · ")
    : [nodoCliente, nombreCorto, cedulaParaCruce, userPppoe, etiquetaSenal, etiquetaDeuda, "✅"].filter(Boolean).join(" · ");

  const customAttrs = {
    dni: cedulaParaCruce || "",
    usuario_pppoe: userPppoe || "",
    direccion: cliente?.direccion || "",
    estado_mikrowisp: datos?.estado || "",
    deuda: deudaResumen,
    plan: servicio?.perfil || servicio?.plan || cliente?.velocidad || "",
    conexion: mikrotikInfo ? (mikrotikInfo.estado === "conectado" ? "En línea" : "Fuera de línea") : "Desconocido",
    uptime: mikrotikInfo?.uptime || "",
    ultima_desconexion: mikrotikInfo?.lastLoggedOut || "",
    ultimo_evento_olt: ultimoEventoOnu
      ? `${ultimoEventoOnu.causa_texto || ultimoEventoOnu.tipo} (${new Date(ultimoEventoOnu.ocurrido_en).toLocaleString("es-PE")})`
      : "",
    senal_rx: etiquetaSenal || "",
  };

  // dry_run: arma todo pero NO escribe en Chatwoot -- para probar el cruce de
  // datos contra clientes reales sin tocar un contacto en produccion.
  if (body?.dry_run) {
    return { ok: true, dry_run: true, mikrowisp: mkw, cliente, mikrotikInfo, nombreReal, nombreCompacto, custom_attributes: customAttrs };
  }

  const putRes = await fetchConTimeout(`${tenantCfg.chatwoot_base_url.replace(/\/+$/, "")}/api/v1/accounts/${accountId}/contacts/${contactId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", api_access_token: tenantCfg.chatwoot_token },
    body: JSON.stringify({ ...(nombreCompacto ? { name: nombreCompacto } : {}), custom_attributes: customAttrs }),
  });
  const putJson = await putRes.json().catch(() => ({}));
  if (!putRes.ok) {
    throw new Error(`Chatwoot PUT HTTP ${putRes.status}: ${JSON.stringify(putJson).slice(0, 300)}`);
  }

  _cooldownPorContacto.set(cooldownKey, Date.now());
  return { ok: true, dni: cedulaParaCruce, nombre: nombreCompacto, custom_attributes: customAttrs };
};

const proxySmartOltRequest = async (req) => {
  const url = new URL(req.url || "", "http://localhost");
  const targetPath = url.pathname.replace(/^\/api\/smartolt/, "");
  // x-smartolt-base: permite que un cliente (via CRM/tenant_config) mande su
  // propia URL base de SmartOLT -- igual que el token, sin que el servidor
  // tenga que conocer de antemano el dominio de cada tenant nuevo.
  const incomingBase = String(req.headers["x-smartolt-base"] || "").trim();
  const targetUrl = buildAbsoluteApiUrl(incomingBase || SMARTOLT_API_BASE, targetPath);
  const rawBody = await readRawBody(req);
  const incomingType = String(req.headers["content-type"] || "").trim();
  const incomingToken = String(req.headers["x-token"] || req.headers.token || "").trim();

  const headers = {
    Accept: "application/json",
    "X-Token": incomingToken || SMARTOLT_TOKEN,
  };
  if (incomingType) headers["Content-Type"] = incomingType;

  console.log(`[SmartOLT proxy] ${req.method} ${targetUrl}`);
  const response = await fetch(targetUrl, {
    method: req.method || "GET",
    headers,
    body: rawBody.length ? rawBody : undefined,
  });
  console.log(`[SmartOLT proxy] response ${response.status}`);
  const json = await readProxyJsonResponse(response, `Smart OLT ${targetPath || "/"}`);
  if (!response.ok) json._proxyTargetUrl = targetUrl;
  return { status: response.status, json };
};

// Proxy hacia OpenAI para los paneles de "Analisis con IA" (Tecnicos,
// Gestoras, Instalaciones, Ordenes) -- solo reenvia model/messages/max_tokens,
// la Authorization real con la key de OpenAI se agrega aca, nunca en el
// navegador.
const proxyOpenAiChat = async (req) => {
  if (!OPENAI_API_KEY) {
    return { status: 500, json: { error: { message: "OPENAI_API_KEY no configurado en el servidor." } } };
  }
  const body = await readJsonBody(req);
  const response = await fetchConTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: body?.model || "gpt-4o-mini",
      messages: Array.isArray(body?.messages) ? body.messages : [],
      max_tokens: Number(body?.max_tokens) || 900,
      ...(Number.isFinite(Number(body?.temperature)) ? { temperature: Number(body.temperature) } : {}),
    }),
  }, 60000);
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
};

// Cruce de nombres: MAC WAN de cada ONU Huawei (SNMP + fallback Telnet por
// puerto) contra los PPP secrets de MikroTik Tiabaya (last-caller-id).
// Usado tanto por la vista previa (/api/cruce-mac-preview, solo lectura)
// como por la aplicacion real (/api/cruce-mac-aplicar, escribe en la OLT).
// Cache en memoria del resultado completo (incluye las ~49 llamadas Telnet
// por puerto PON, cada una puede tardar hasta 30s si el OLT esta en
// bloqueo temporal) -- sin esto, cada llamada a preview/aplicar (incluso
// para aplicar 1 sola ONU) recalculaba TODO de nuevo, llegando a tardar
// 10+ minutos y arriesgando otro bloqueo por exceso de conexiones Telnet
// seguidas. TTL 15 min: suficiente para poder correr preview y luego
// aplicar sobre el mismo calculo sin recalcular, sin quedar demasiado
// desactualizado si alguien cambia algo en el medio.
let cruceMacCache = { datos: null, generadoEn: 0 };
const CRUCE_MAC_CACHE_MS = 15 * 60 * 1000;

async function calcularCruceMac({ forzar = false } = {}) {
  if (!forzar && cruceMacCache.datos && (Date.now() - cruceMacCache.generadoEn) < CRUCE_MAC_CACHE_MS) {
    return cruceMacCache.datos;
  }
  const datos = await calcularCruceMacInterno();
  cruceMacCache = { datos, generadoEn: Date.now() };
  return datos;
}

async function calcularCruceMacInterno() {
  let connection = null;
  try {
    // 1. Traer TODAS las ONUs del Huawei (paginado, hasta 20 paginas de
    // 200 = 4000, mas que de sobra para las 1684 actuales).
    let todasOnus = [];
    for (let page = 1; page <= 20; page++) {
      const r = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-list?pageSize=200&page=${page}`).then((r) => r.json());
      if (!r.ok || !Array.isArray(r.onus) || r.onus.length === 0) break;
      todasOnus = todasOnus.concat(r.onus);
      if (todasOnus.length >= (r.total || 0)) break;
    }

    // 2. Traer los secrets de MikroTik Tiabaya (name, caller-id, comment).
    connection = await connectRouterByKey("tiabaya");
    const secrets = await withTimeout(connection.api.write("/ppp/secret/print", []), 25000, "Listar PPP Secret en Tiabaya");
    await closeRouterApiSafe(connection.api);
    connection = null;

    const normMac = (m) => String(m || "").toLowerCase().replace(/[^0-9a-f]/g, "");
    const secretPorMac = new Map();
    for (const s of secrets) {
      // last-caller-id (auto-registrado por RouterOS en cada conexion)
      // esta poblado en 1689 de 2106 secrets -- caller-id (candado
      // manual) casi nunca se usa (confirmado: solo 1 de 2106).
      const mac = normMac(s["last-caller-id"] || s["caller-id"] || s.callerid);
      if (mac && mac.length === 12) secretPorMac.set(mac, s);
    }

    // 3. Para las ONUs SIN wanMac por SNMP (PPPoE configurado manual en
    // el equipo, no via OMCI), rellenar el MAC con la tabla L2 completa
    // del puerto PON (1 llamada Telnet por puerto, no por ONU -- ver
    // obtenerMacsPorPuerto en huawei-olt-signal). Solo 49 puertos unicos
    // en todo el inventario vs. ~1170 ONUs sin wanMac, ~24x menos
    // llamadas. Se hace secuencial (no en paralelo) para no saturar el
    // limite de conexiones Telnet/SSH del OLT.
    const macDesdeTelnet = new Map(); // "board-port-ontId" -> mac
    const puertosPendientes = new Set();
    for (const o of todasOnus) {
      if (normMac(o.wanMac)) continue;
      if (o.board == null || o.port == null) continue;
      puertosPendientes.add(`${o.board}-${o.port}`);
    }
    for (const clave of puertosPendientes) {
      const [board, port] = clave.split("-");
      try {
        const r = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-macs-puerto?board=${board}&port=${port}`).then((r) => r.json());
        if (r.ok && Array.isArray(r.entradas)) {
          for (const e of r.entradas) {
            macDesdeTelnet.set(`${e.board}-${e.port}-${e.ontId}`, e.mac);
          }
        }
      } catch (_) {
        // si un puerto falla (ej. bloqueo temporal del OLT), seguir con los demas
      }
    }

    // Guardar TODO lo recien descubierto por Telnet, atado al SN, para
    // que la proxima corrida de este mismo cruce (o la ficha individual
    // de esa ONU) no tenga que volver a leer el puerto entero por Telnet.
    if (macDesdeTelnet.size && HUAWEI_ACCION_TOKEN) {
      const pares = [];
      for (const o of todasOnus) {
        if (normMac(o.wanMac)) continue;
        const mac = macDesdeTelnet.get(`${o.board}-${o.port}-${o.onuId}`);
        if (mac) pares.push({ sn: o.sn, mac });
      }
      if (pares.length) {
        fetch(`${HUAWEI_OLT_SNMP_API}/onu-mac-guardar-lote`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-debug-token": HUAWEI_ACCION_TOKEN },
          body: JSON.stringify({ pares }),
        }).catch(() => {}); // fire-and-forget
      }
    }

    // "Generico" = no es un nombre de persona real, es un id de sistema
    // (nod_, pon N, usuario_N, o el propio username PPPoE tipo
    // "0459@americanet" / "user132@fiber" / un DNI/numero puro) -- en
    // estos casos NO tiene sentido pegar el usuario de Mikrotik al
    // final (quedaria "0459@americanet — 0459@americanet", duplicado
    // inutil, encontrado en 132/891 casos de la primera vista previa).
    const esGenerico = (nombre) => {
      const n = String(nombre || "").trim();
      if (!n) return true;
      if (/^(nod_|pon\s*0*\d|usuario_?\d*$)/i.test(n)) return true;
      if (/^user\d+(@|$)/i.test(n)) return true;
      if (/@(americanet|fiber)$/i.test(n)) return true;
      if (/^\d+$/.test(n)) return true;
      return false;
    };

    // Comentarios placeholder tipo "-----", "----", "n/a" no traen info
    // real -- encontrados en 209/891 casos, producian nombres basura como
    // "usuario_554 — -----". Y comentarios que son NOTAS OPERATIVAS del
    // staff (no un nombre de cliente) -- encontrados 3 casos reales
    // ("... verificar ya q se encontro con el user667...", "antes user
    // 667- ..._ACTIVO") -- se excluyen por completo, no hay forma segura
    // de "limpiarlos", solo de detectarlos y saltarlos.
    const comentarioUtil = (c) => {
      const s = String(c || "").trim();
      if (!s) return false;
      if (/^[-_.\s]+$/.test(s)) return false;
      if (/^n\/?a$/i.test(s)) return false;
      if (/verificar|_activo$|antes user|duplicado|revisar|pendiente|encontro con/i.test(s)) return false;
      return true;
    };

    const soloAlfanum = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const resultados = [];
    for (const o of todasOnus) {
      // Algunas ONUs (encontradas 69/459 en la primera corrida real,
      // 2026-09-27) ya tienen el campo "desc" de la OLT TRUNCADO por el
      // limite de longitud del propio equipo -- el parseo de zona/
      // comentario/fecha falla y "nombre" termina siendo el string crudo
      // completo (con "_zone_", "_descr_", "_authd_" todavia adentro).
      // Pegarle algo mas a ese string ya roto solo lo empeora -- se
      // excluyen del cruce por completo, quedan para revision manual
      // aparte (acortar la descripcion original antes de tocarlas).
      if (/_zone_|_descr_|_authd_/.test(o.nombre || "")) continue;
      const mac = normMac(o.wanMac) || normMac(macDesdeTelnet.get(`${o.board}-${o.port}-${o.onuId}`));
      if (!mac) continue;
      const secret = secretPorMac.get(mac);
      if (!secret) continue;
      const usuarioMk = String(secret.name || "").trim();
      const comentarioMk = String(secret.comment || "").trim();
      if (!usuarioMk) continue;

      // Cubre tanto "nombreActual === usuarioMk" exacto como el caso de
      // "0443@americanet - SALDANA CHUQUIRUNA, PASCUAL" (ya trae el
      // usuario pegado a mano con otro separador) -- comparando solo
      // alfanumerico para no fallar por espacios/guiones/mayusculas.
      const nombreYaTraeUsuario =
        String(o.nombre || "").trim().toLowerCase() === usuarioMk.toLowerCase() ||
        soloAlfanum(o.nombre).includes(soloAlfanum(usuarioMk));

      // Separador " - " (guion ASCII), NO em-dash "—" -- confirmado en
      // vivo 2026-09-27 que el em-dash se pierde al pasar por el "ont
      // modify ... desc" via Telnet (queda como doble espacio, sin
      // separador visible: "dd  usuario_643" en vez de "dd — usuario_643").
      let nombreNuevo;
      if (!esGenerico(o.nombre) && !nombreYaTraeUsuario) {
        nombreNuevo = `${o.nombre} - ${usuarioMk}`;
      } else {
        if (!comentarioUtil(comentarioMk)) continue; // MikroTik tampoco trae info util, no reemplazar
        nombreNuevo = `${usuarioMk} - ${comentarioMk}`;
      }
      if (nombreNuevo === o.nombre) continue;

      resultados.push({
        sn: o.sn, board: o.board, port: o.port, mac,
        nombreActual: o.nombre || null,
        usuarioMikrotik: usuarioMk,
        comentarioMikrotik: comentarioMk || null,
        nombreNuevo,
      });
    }

    return { todasOnus, secrets, resultados };
  } finally {
    if (connection?.api) await closeRouterApiSafe(connection.api);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      writeJson(res, 204, {});
      return;
    }

    if (requiereAuthInterna(req)) {
      if (!INTERNAL_API_TOKEN) {
        writeJson(res, 500, { ok: false, error: "DIAGNOSTICO_INTERNAL_TOKEN no configurado en el servidor." });
        return;
      }
      if (!tieneTokenInternoValido(req)) {
        writeJson(res, 401, { ok: false, error: "No autorizado." });
        return;
      }
    }

    // GET /api/cruce-mac-debug -- DEBUG TEMPORAL: muestra una muestra cruda
    // de secrets (name/caller-id/comment) para confirmar si el campo
    // caller-id realmente esta poblado. Quitar cuando se confirme.
    if (req.method === "GET" && req.url === "/api/cruce-mac-debug") {
      let connection = null;
      try {
        connection = await connectRouterByKey("tiabaya");
        const secrets = await withTimeout(connection.api.write("/ppp/secret/print", []), 25000, "Listar PPP Secret en Tiabaya (debug)");
        await closeRouterApiSafe(connection.api);
        connection = null;
        const conCallerId = secrets.filter((s) => (s["caller-id"] || s.callerid || "").trim()).length;
        const conLastCallerId = secrets.filter((s) => (s["last-caller-id"] || "").trim()).length;
        writeJson(res, 200, {
          ok: true,
          total: secrets.length,
          conCallerId,
          conLastCallerId,
          muestra: secrets.slice(0, 10).map((s) => ({ name: s.name, callerId: s["caller-id"], lastCallerId: s["last-caller-id"], comment: s.comment })),
        });
      } catch (e) {
        writeJson(res, 200, { ok: false, error: e.message || String(e) });
      } finally {
        if (connection?.api) await closeRouterApiSafe(connection.api);
      }
      return;
    }

    // GET /api/onu-diagnostico-completo?sn=XXXX -- cadena completa pedida
    // por el usuario: SN de ONU -> MAC (SNMP, con fallback a Telnet-por-
    // puerto si esa ONU no tiene wanMac por SNMP) -> secret de MikroTik
    // Tiabaya que tenga esa MAC en last-caller-id (da usuario+comentario)
    // -> estado real ppp/active (conectado ahora + uptime, o last-logged-
    // out si no) -> cliente en Supabase (tabla "clientes", columna
    // usuario_nodo) con todos sus datos -- todo junto con la ficha de la
    // ONU (señal/estado/etc, ya disponible via huawei-olt-snmp).
    if (req.method === "GET" && String(req.url || "").split("?")[0] === "/api/onu-diagnostico-completo") {
      const sn = new URL(req.url, "http://localhost").searchParams.get("sn");
      if (!sn) { writeJson(res, 400, { ok: false, error: "Falta sn" }); return; }

      // VSOL (DIM) -- mismo principio que Huawei (SN -> MAC real -> secret
      // de MikroTik por esa MAC -> usuario PPPoE -> cliente), pero el cruce
      // SN->MAC ya esta resuelto del lado de olt-signal-dim, no aca: ese
      // servicio expone /identificar-por-sn, que localiza la ONU por SNMP,
      // lee la tabla de direcciones MAC real de la OLT por SSH, y cruza
      // contra los PPP secrets del MikroTik de esa OLT especifica (ya
      // confirmado en produccion con 2 clientes reales). No se confia en
      // clientes.sn_onu -- si esa columna estuviera mal cargada daria el
      // cliente equivocado sin ningun aviso; este camino nunca depende de
      // lo que haya quedado guardado, solo de la red en vivo, igual de
      // estricto que el camino Huawei.
      if (OLT_SIGNAL_PROVIDER === "vsol") {
        try {
          const ident = await fetch(`${OLT_SSH_API}/identificar-por-sn?sn=${encodeURIComponent(sn)}`).then((r) => r.json());
          if (!ident?.ok) {
            writeJson(res, 200, { ok: false, error: ident?.error || "No se pudo identificar la ONU en la OLT VSOL." });
            return;
          }
          if (!ident.usuario) {
            writeJson(res, 200, { ok: false, error: ident.aviso || "Se encontró la MAC de la ONU pero no coincide con ningún PPP secret del MikroTik." });
            return;
          }
          const filas = await fetchSupabaseRows("clientes", `usuario_nodo=eq.${encodeURIComponent(ident.usuario)}&select=id,nombre,dni,direccion,celular,email,nodo,codigo_cliente,codigo_abonado,estado_servicio,sn_onu,caja_nap,puerto_nap,puerto_sub,precinto_codigo,ubicacion,foto_fachada,fotos_liquidacion`);
          const cliente = filas?.[0] || null;
          if (!cliente) {
            writeJson(res, 200, { ok: false, error: `Se identificó el usuario PPPoE "${ident.usuario}" pero no hay ningún cliente con ese usuario_nodo registrado.` });
            return;
          }
          const ficha = { board: null, port: ident.port ?? null, onuId: ident.onuId ?? null, oltName: ident.oltName || null };
          const mikrotik = { usuario: ident.usuario, comentario: ident.comentario || null };
          writeJson(res, 200, { ok: true, sn, mac: ident.mac || null, ficha, mikrotik, cliente });
        } catch (e) {
          writeJson(res, 200, { ok: false, error: e.message || String(e) });
        }
        return;
      }

      let connection = null;
      try {
        const ficha = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-info?sn=${encodeURIComponent(sn)}`).then((r) => r.json());
        if (!ficha?.ok) { writeJson(res, 200, { ok: false, error: ficha?.error || "No se encontró la ONU en la OLT." }); return; }

        const normMac = (m) => String(m || "").toLowerCase().replace(/[^0-9a-f]/g, "");
        // ficha.wanMac ya viene con respaldo del propio huawei-olt-signal
        // (SNMP, o lo ya guardado antes en onu_mac_wan) -- si sigue sin
        // nada, es una ONU que nunca se resolvio, hay que ir a Telnet-por-
        // puerto (lento) como ultimo recurso, y GUARDARLA para que esto no
        // se repita.
        let mac = normMac(ficha.wanMac);
        if (!mac && ficha.board != null && ficha.port != null) {
          const puerto = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-macs-puerto?board=${ficha.board}&port=${ficha.port}`).then((r) => r.json()).catch(() => null);
          const entrada = puerto?.ok ? (puerto.entradas || []).find((e) => String(e.ontId) === String(ficha.onuId)) : null;
          if (entrada) {
            mac = normMac(entrada.mac);
            if (HUAWEI_ACCION_TOKEN) {
              fetch(`${HUAWEI_OLT_SNMP_API}/onu-mac-guardar-lote`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-debug-token": HUAWEI_ACCION_TOKEN },
                body: JSON.stringify({ pares: [{ sn, mac }] }),
              }).catch(() => {}); // fire-and-forget
            }
          }
        }

        let mikrotik = null;
        let cliente = null;
        if (mac) {
          // Antes esto solo miraba "tiabaya" -- un cliente Huawei (Nod_01/02/
          // 03) migrado a VLAN 102 vive en el Mikrotik nuevo, no en Tiabaya,
          // asi que su secret nunca aparecia aca y el tecnico siempre veia
          // "no se encontro ningun cliente" aunque la ONU estuviera conectada
          // de verdad. Mismo fix que queryRouter (a091cee): probar Tiabaya
          // primero y, si no aparece el secret con esa MAC, probar tambien el
          // router VLAN 102 antes de rendirse.
          const routersCandidatos = (await loadRoutersConfigFromSupabase()) || buildEnvRouters();
          const ordenRouters = [routersCandidatos.tiabaya, routersCandidatos[ROUTER_KEY_VLAN102]].filter(Boolean);
          let secret = null, activos = [], routerUsado = null;
          for (const router of ordenRouters) {
            if (buildRouterConfigError(router)) continue;
            let conn = null;
            try {
              conn = await connectToRouter(router);
              const [secretsRouter, activosRouter] = await Promise.all([
                withTimeout(conn.api.write("/ppp/secret/print", []), 20000, `Listar PPP Secret en ${router.nombre}`),
                withTimeout(conn.api.write("/ppp/active/print", []), 15000, `Listar PPP Active en ${router.nombre}`).catch(() => []),
              ]);
              const encontrado = secretsRouter.find((s) => normMac(s["last-caller-id"] || s["caller-id"] || s.callerid) === mac);
              if (encontrado) { secret = encontrado; activos = activosRouter; routerUsado = router; break; }
            } catch (e) {
              console.warn(`[onu-diagnostico-completo] ${router.nombre} no respondio:`, e.message);
            } finally {
              if (conn?.api) await closeRouterApiSafe(conn.api);
            }
          }

          if (secret) {
            const usuario = String(secret.name || "").trim();
            const activo = activos.find((a) => String(a.name || "").trim() === usuario);
            mikrotik = {
              usuario,
              comentario: secret.comment || null,
              conectadoAhora: !!activo,
              ip: activo ? activo.address : (secret["remote-address"] || null),
              uptime: activo ? activo.uptime : null,
              ultimaDesconexion: secret["last-logged-out"] || null,
              perfil: (activo ? activo.profile : secret.profile) || null,
              router: routerUsado?.nombre || null,
            };

            if (usuario) {
              // precinto_codigo/puerto_sub se agregan al select: sin esto, el
              // tecnico siempre veia el campo de precinto en blanco al escanear
              // un cliente YA etiquetado antes (el endpoint nunca devolvia ese
              // dato), lo que lo hacia re-escribir un numero nuevo/vacio sobre
              // un precinto que ya estaba bien confirmado -- bug real: precintos
              // que "se borraban solos" al volver a escanear la misma caja.
              const filas = await fetchSupabaseRows("clientes", `usuario_nodo=eq.${encodeURIComponent(usuario)}&select=id,nombre,dni,direccion,celular,email,nodo,codigo_cliente,codigo_abonado,estado_servicio,sn_onu,caja_nap,puerto_nap,puerto_sub,precinto_codigo,ubicacion,foto_fachada,fotos_liquidacion`);
              cliente = filas?.[0] || null;
            }
          }
        }

        writeJson(res, 200, { ok: true, sn, mac: mac || null, ficha, mikrotik, cliente });
      } catch (e) {
        writeJson(res, 200, { ok: false, error: e.message || String(e) });
      } finally {
        if (connection?.api) await closeRouterApiSafe(connection.api);
      }
      return;
    }

    // GET /api/cruce-mac-preview -- vista previa (NO escribe nada) del cruce
    // entre el MAC WAN de cada ONU (Huawei, via SNMP) y el caller-id de los
    // PPP secrets de MikroTik Tiabaya. Sirve para revisar los nombres
    // propuestos antes de aplicar nada al OLT.
    if (req.method === "GET" && String(req.url || "").split("?")[0] === "/api/cruce-mac-preview") {
      try {
        const forzar = new URL(req.url, "http://localhost").searchParams.get("refresh") === "1";
        const { todasOnus, secrets, resultados } = await calcularCruceMac({ forzar });
        writeJson(res, 200, { ok: true, totalOnus: todasOnus.length, totalSecrets: secrets.length, coincidencias: resultados.length, resultados });
      } catch (e) {
        writeJson(res, 200, { ok: false, error: e.message || String(e) });
      }
      return;
    }

    // POST /api/cruce-mac-aplicar { confirmar: true, limite?, sns? } --
    // aplica de verdad los nombres propuestos por el cruce a la OLT (ont
    // modify ... desc), preservando zona/comentario/fecha ya existentes de
    // cada ONU (editarDatosOnu reescribe el campo desc completo, por eso
    // hay que leerlos primero via /onu-info antes de editar). Secuencial,
    // no en paralelo -- 1 sesion SSH por ONU, mismo limite de conexiones
    // del OLT que el resto de acciones reales.
    if (req.method === "POST" && req.url === "/api/cruce-mac-aplicar") {
      const body = await readJsonBody(req).catch(() => ({}));
      if (body?.confirmar !== true) {
        writeJson(res, 400, { ok: false, error: "Falta confirmar:true en el body -- esto escribe de verdad en la OLT." });
        return;
      }
      if (!HUAWEI_ACCION_TOKEN) {
        writeJson(res, 500, { ok: false, error: "HUAWEI_ACCION_TOKEN no configurado en el servidor." });
        return;
      }
      try {
        const { resultados } = await calcularCruceMac({ forzar: body?.forzarRecalculo === true });
        let pendientes = resultados;
        if (Array.isArray(body.sns) && body.sns.length) {
          const set = new Set(body.sns.map((s) => String(s).toUpperCase()));
          pendientes = pendientes.filter((r) => set.has(String(r.sn).toUpperCase()));
        }
        if (Number.isFinite(body.limite) && body.limite > 0) {
          pendientes = pendientes.slice(0, body.limite);
        }

        // 1. Leer la ficha actual de cada ONU (SNMP, rapido -- en paralelo
        // de a 20 para no saturar el equipo) para preservar zona/
        // comentario/fecha ya existentes (editarDatosOnuLote reescribe el
        // campo desc completo).
        const fichas = new Map(); // sn -> ficha
        const erroresFicha = [];
        for (let i = 0; i < pendientes.length; i += 20) {
          const grupo = pendientes.slice(i, i + 20);
          const respuestas = await Promise.all(grupo.map((r) =>
            fetch(`${HUAWEI_OLT_SNMP_API}/onu-info?sn=${encodeURIComponent(r.sn)}`).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }))
          ));
          grupo.forEach((r, j) => {
            if (respuestas[j]?.ok) fichas.set(r.sn, respuestas[j]);
            else erroresFicha.push({ sn: r.sn, ok: false, error: respuestas[j]?.error || "No se pudo leer la ficha actual." });
          });
        }

        // 2. Editar en LOTES de 25 (1 sola sesion SSH por lote, no 1 por
        // ONU) -- el login/config de cada sesion es lo mas lento, agrupar
        // baja el tiempo total varias veces (ver editarDatosOnuLote en
        // huawei-olt-signal).
        const conFicha = pendientes.filter((r) => fichas.has(r.sn));
        const TAMANO_LOTE = 25;
        const aplicados = [...erroresFicha];
        for (let i = 0; i < conFicha.length; i += TAMANO_LOTE) {
          const lote = conFicha.slice(i, i + TAMANO_LOTE);
          const cambios = lote.map((r) => {
            const ficha = fichas.get(r.sn);
            return { board: r.board, port: r.port, ontId: ficha.onuId, nombre: r.nombreNuevo, zona: ficha.zona, comentario: ficha.comentario, fechaAutorizacionISO: ficha.fechaAutorizacionISO };
          });
          try {
            const resp = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-editar-lote`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-debug-token": HUAWEI_ACCION_TOKEN },
              body: JSON.stringify({ cambios }),
            }).then((x) => x.json());
            if (resp?.ok && Array.isArray(resp.resultados)) {
              lote.forEach((r, j) => aplicados.push({ sn: r.sn, ok: !!resp.resultados[j]?.ok, error: resp.resultados[j]?.ok ? undefined : (resp.resultados[j]?.error || "Fallo desconocido") }));
            } else {
              lote.forEach((r) => aplicados.push({ sn: r.sn, ok: false, error: resp?.error || "Fallo desconocido en el lote" }));
            }
          } catch (e) {
            lote.forEach((r) => aplicados.push({ sn: r.sn, ok: false, error: e.message || String(e) }));
          }
        }

        const exitos = aplicados.filter((a) => a.ok).length;
        writeJson(res, 200, { ok: true, total: aplicados.length, exitos, fallos: aplicados.length - exitos, detalle: aplicados });
      } catch (e) {
        writeJson(res, 200, { ok: false, error: e.message || String(e) });
      }
      return;
    }

    if (req.method === "GET" && req.url === "/api/diagnostico-servicio/health") {
      const supabaseRouters = await loadRoutersConfigFromSupabase();
      const currentRouters = supabaseRouters || buildEnvRouters();
      writeJson(res, 200, {
        ok: true,
        service: "diagnostico-servicio",
        source: supabaseRouters ? "supabase" : "env",
        addressList: MOROSOS_ADDRESS_LIST,
        mikrowisp: {
          apiBase: MIKROWISP_API_BASE,
          configured: Boolean(MIKROWISP_API_BASE && MIKROWISP_TOKEN),
        },
        smartolt: {
          apiBase: SMARTOLT_API_BASE,
          configured: Boolean(SMARTOLT_API_BASE && SMARTOLT_TOKEN),
        },
        routers: Object.values(currentRouters).map((router) => ({
          id: router.id,
          nombre: router.nombre,
          host: router.host,
          port: router.port,
          nodos: router.nodos,
          configured: !buildRouterConfigError(router),
        })),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/mikrowisp/GetClientsDetails") {
      const result = await proxyMikrowispGetClientDetails(req);
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/mikrowisp-nod04/GetClientsDetails") {
      const result = await proxyMikrowispNod04GetClientDetails(req);
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/mikrowisp/NewUser") {
      const result = await proxyMikrowispNewUser(req);
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/mikrowisp-nod04/NewUser") {
      const result = await proxyMikrowispNod04NewUser(req);
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/openai/chat") {
      const result = await proxyOpenAiChat(req);
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/mikrowisp-proxy") {
      const result = await proxyMikrowispGenerico(req);
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/evolution-proxy") {
      try {
        const body = await readJsonBody(req);
        const data = await handleEvolutionProxyAccion(body?.accion, body?.payload || {}, body?.tenant_id);
        writeJson(res, 200, { ok: true, data });
      } catch (e) {
        writeJson(res, 200, { ok: false, error: e.message || String(e) });
      }
      return;
    }

    // Reemplazo del webhook "actuaaaaa" de n8n -- apuntar la automatizacion de
    // Chatwoot (o el webhook de n8n, como paso intermedio) a este endpoint.
    if (req.method === "POST" && req.url === "/api/chatwoot/actualizar-contacto") {
      try {
        const body = await readJsonBody(req);
        console.log(`[actualizar-contacto] llamada recibida: event=${body?.event} message_type=${body?.message_type} phone=${body?.conversation?.meta?.sender?.phone_number || body?.phone || "-"}`);
        const data = await handleActualizarContactoChatwoot(body);
        console.log(`[actualizar-contacto] resultado:`, JSON.stringify(data).slice(0, 500));
        writeJson(res, 200, data);
      } catch (e) {
        console.log(`[actualizar-contacto] ERROR: ${e.message}`);
        writeJson(res, 200, { ok: false, error: e.message || String(e) });
      }
      return;
    }

    // ── Proxy WisPro (evita CORS desde el browser) ──────────────
    if (String(req.url || "").startsWith("/api/wispro/")) {
      const wisproPath = req.url.replace("/api/wispro", "");
      const wisproUrl  = `${WISPRO_BASE}${wisproPath}`;
      // Extraer token limpio — el cliente puede mandar "Token xxx" o "Bearer xxx" o solo el token
      const rawAuth  = req.headers["authorization"] || "";
      const tokenVal = rawAuth.replace(/^(Token|Bearer)\s+/i, "").trim();
      const body = req.method !== "GET" ? await readRawBody(req).then(b => b.length ? b : undefined) : undefined;

      // Intentar primero con "Token xxx" (formato WisPro estándar)
      let wisproRes = await fetch(wisproUrl, {
        method: req.method || "GET",
        headers: { "Authorization": `Token ${tokenVal}`, "Content-Type": "application/json", "Accept": "application/json" },
        body,
      });
      let wisproJson = await wisproRes.json().catch(() => ({}));

      // Si falla con 401, intentar con solo el token (sin prefijo)
      if ((wisproRes.status === 401 || wisproJson?.status === 401 || wisproJson?.message === "Unauthorized") && tokenVal) {
        wisproRes  = await fetch(wisproUrl, {
          method: req.method || "GET",
          headers: { "Authorization": tokenVal, "Content-Type": "application/json", "Accept": "application/json" },
          body,
        });
        wisproJson = await wisproRes.json().catch(() => ({}));
      }

      writeJson(res, wisproRes.status, wisproJson);
      return;
    }

    if (String(req.url || "").startsWith("/api/smartolt/")) {
      const result = await proxySmartOltRequest(req);
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/diagnostico-servicio") {
      const body = await readJsonBody(req);
      const dni = String(body?.dni || "").replace(/\D/g, "");
      const nodo = String(body?.nodo || "").trim();
      const userPppoe = String(body?.userPppoe || "").trim();
      const cliente = String(body?.cliente || "").trim();

      if (!nodo) {
        writeJson(res, 400, { ok: false, error: "No se encontro nodo para este abonado." });
        return;
      }
      if (!userPppoe) {
        writeJson(res, 400, { ok: false, error: "No se encontro user PPPoE para este abonado." });
        return;
      }

      // Camino rapido (solo cuando el caller pide soloIp:true, ej. al crear
      // una orden y solo se necesita una IP fija estable): si ya hay un sync
      // reciente de este router en cache, responder al instante sin conectar
      // al Mikrotik. El widget de diagnostico en vivo (conectado/desconectado
      // + uptime, del panel de cliente) NO debe usar este camino -- la cache
      // solo tiene la foto del ultimo sync (hasta 30 min de antiguedad) y no
      // sirve para saber el estado real de conexion ahora mismo.
      let mikrotik = null;
      if (body?.soloIp === true) try {
        const router = await resolveRouterByNodo(nodo, userPppoe);
        const cached = await lookupIpCache(router.id, userPppoe);
        if (cached?.ip) {
          mikrotik = {
            router: buildRouterInfo(router),
            estado: "cache",
            origen: `cache:${cached.origen || "?"}`,
            userPppoe,
            ip: cached.ip,
            uptime: "",
            lastLoggedOut: "",
            disabled: "",
            profile: cached.profile || "",
            callerId: "",
            actualizadoEn: cached.actualizado_en || "",
          };
        }
      } catch (_) {
        // si falla la resolucion/lectura de cache, seguir al camino en vivo
      }
      if (!mikrotik) {
        mikrotik = await queryRouter({ nodo, userPppoe });
        // Alimentar la cache con lo que se encontro en vivo, para que la
        // proxima busqueda de este mismo usuario ya sea instantanea.
        if (mikrotik?.ip && mikrotik?.router?.id) {
          upsertIpCacheRows(mikrotik.router.id, [
            { usuario_pppoe: userPppoe, ip: mikrotik.ip, origen: mikrotik.origen || "", profile: mikrotik.profile || "" },
          ]).catch(() => {});
        }
      }
      writeJson(res, 200, {
        ok: true,
        dni,
        cliente,
        nodo,
        userPppoe,
        mikrotik,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/diagnostico-servicio/sync-router") {
      const body = await readJsonBody(req);
      const routerKey = String(body?.routerKey || "").trim();
      if (!routerKey) {
        writeJson(res, 400, { ok: false, error: "Falta routerKey." });
        return;
      }
      const result = await syncRouterIpCache(routerKey);
      writeJson(res, 200, { ok: true, result });
      return;
    }

    // Prueba de conexion pura -- a diferencia de sync-router, no trae ni
    // guarda nada, solo confirma que se puede conectar y autenticar contra
    // el Mikrotik (usado por el boton "Probar conexion" del panel, para no
    // depender del conteo de /ppp/secret como unica senal de "funciona").
    if (req.method === "POST" && req.url === "/api/diagnostico-servicio/test-router") {
      const body = await readJsonBody(req);
      const routerKey = String(body?.routerKey || "").trim();
      if (!routerKey) {
        writeJson(res, 400, { ok: false, error: "Falta routerKey." });
        return;
      }
      let connection = null;
      try {
        connection = await connectRouterByKey(routerKey);
        const identity = await withTimeout(
          connection.api.write("/system/identity/print", []),
          10000,
          "Probar conexion"
        );
        writeJson(res, 200, {
          ok: true,
          identity: Array.isArray(identity) && identity[0] ? identity[0].name : null,
          router: buildRouterInfo(connection.router),
        });
      } catch (error) {
        writeJson(res, 200, { ok: false, error: formatErrorDetail(connection?.getSocketError?.() || error) });
      } finally {
        if (connection?.api) await closeRouterApiSafe(connection.api);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/api/diagnostico-servicio/sync-all") {
      const resultados = await syncAllRoutersIpCache();
      writeJson(res, 200, { ok: true, resultados });
      return;
    }

    // Disparo manual del mismo job que corre solo todas las noches (ver
    // scheduler al final del archivo) -- para forzar un refresh puntual sin
    // esperar a las 3 AM. Protegido con DIAGNOSTICO_INTERNAL_TOKEN porque
    // escribe en Supabase (estado_servicio de potencialmente ~1700 filas).
    if (req.method === "POST" && req.url === "/api/clientes/sincronizar-estados-mikrowisp") {
      try {
        const resumen = await sincronizarEstadosMikrowisp();
        writeJson(res, 200, { ok: true, resumen });
      } catch (e) {
        writeJson(res, 200, { ok: false, error: e.message || String(e) });
      }
      return;
    }

    // Disparo manual del job de prorrateos vencidos (ver scheduler al final
    // del archivo) -- para probarlo sin esperar a las 4 AM.
    if (req.method === "POST" && req.url === "/api/clientes/revisar-prorrateos-vencidos") {
      try {
        const resumen = await revisarProrrateosVencidos();
        writeJson(res, 200, { ok: true, resumen });
      } catch (e) {
        writeJson(res, 200, { ok: false, error: e.message || String(e) });
      }
      return;
    }

    // Creacion masiva y correlativa de PPP secrets dentro de un rango de IP
    // ya existente (el pool en si se crea a mano en Mikrotik). Por defecto
    // es solo vista previa (dryRun) -- hay que mandar dryRun:false explicito
    // para que efectivamente escriba en el Mikrotik.
    if (req.method === "POST" && req.url === "/api/diagnostico-servicio/crear-secrets-lote") {
      const body = await readJsonBody(req);
      const { routerKey, nodo, ipInicio, ipFin, numeroInicio, password, profile, localAddress } = body || {};
      const dryRun = body?.dryRun !== false;
      if (!routerKey || !nodo || !ipInicio || !ipFin || numeroInicio == null) {
        writeJson(res, 400, { ok: false, error: "Faltan datos: routerKey, nodo, ipInicio, ipFin, numeroInicio son obligatorios." });
        return;
      }
      try {
        const lote = buildLotePreview({ nodo, ipInicio, ipFin, numeroInicio, password, profile, localAddress });
        if (dryRun) {
          writeJson(res, 200, { ok: true, dryRun: true, total: lote.length, lote });
          return;
        }
        const { router, resultados } = await crearSecretsLote({ routerKey, lote });
        const creados = resultados.filter((r) => r.ok).length;
        const omitidos = resultados.filter((r) => !r.ok).length;
        writeJson(res, 200, { ok: true, dryRun: false, router, creados, omitidos, resultados });
      } catch (error) {
        writeJson(res, 400, { ok: false, error: formatErrorDetail(error), resultadosParciales: error?.resultadosParciales || [] });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/api/diagnostico-servicio/suspender") {
      const body = await readJsonBody(req);
      const nodo = String(body?.nodo || "").trim();
      const userPppoe = String(body?.userPppoe || "").trim();

      if (!nodo) {
        writeJson(res, 400, { ok: false, error: "No se encontro nodo para este abonado." });
        return;
      }
      if (!userPppoe) {
        writeJson(res, 400, { ok: false, error: "No se encontro user PPPoE para este abonado." });
        return;
      }

      const result = await suspenderRouter({ nodo, userPppoe });
      writeJson(res, 200, { ok: true, action: "suspender", nodo, userPppoe, result });
      return;
    }

    if (req.method === "POST" && req.url === "/api/diagnostico-servicio/activar") {
      const body = await readJsonBody(req);
      const nodo = String(body?.nodo || "").trim();
      const userPppoe = String(body?.userPppoe || "").trim();
      const ip = String(body?.ip || "").trim();

      if (!nodo) {
        writeJson(res, 400, { ok: false, error: "No se encontro nodo para este abonado." });
        return;
      }
      if (!userPppoe) {
        writeJson(res, 400, { ok: false, error: "No se encontro user PPPoE para este abonado." });
        return;
      }

      const result = await activarRouter({ nodo, userPppoe, ip });
      writeJson(res, 200, { ok: true, action: "activar", nodo, userPppoe, result });
      return;
    }

    // Proxy de acciones reales sobre ONUs Huawei (reiniciar/eliminar/cambiar
    // velocidad/autorizar/wan-pppoe/acceso-remoto/autofind) -- el frontend
    // le pega ACA, no directo a huawei-olt-signal, para que el token de
    // accion nunca viaje al navegador.
    const HUAWEI_ONU_RUTAS = {
      reiniciar: "/onu-reiniciar",
      eliminar: "/onu-eliminar",
      velocidad: "/onu-velocidad",
      autorizar: "/onu-autorizar",
      mover: "/onu-mover",
      wan: "/onu-wan",
      "acceso-remoto": "/onu-acceso-remoto",
      editar: "/onu-editar",
      "vlan-nativa": "/onu-vlan-nativa",
      "averia-config": "/averia-config",
    };
    if (req.method === "POST" && String(req.url || "").startsWith("/api/huawei-onu/") && HUAWEI_ONU_RUTAS[req.url.split("/").pop()]) {
      if (!HUAWEI_ACCION_TOKEN) return writeJson(res, 500, { ok: false, error: "HUAWEI_ACCION_TOKEN no configurado en el servidor." });
      const rutaDestino = HUAWEI_ONU_RUTAS[req.url.split("/").pop()];
      try {
        const body = await readJsonBody(req);
        const upstream = await fetch(`${HUAWEI_OLT_SNMP_API}${rutaDestino}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-debug-token": HUAWEI_ACCION_TOKEN },
          body: JSON.stringify(body || {}),
        });
        const data = await upstream.json().catch(() => ({ ok: false, error: "Respuesta invalida del servicio Huawei." }));
        return writeJson(res, upstream.status, data);
      } catch (e) {
        return writeJson(res, 200, { ok: false, error: e.message || String(e) });
      }
    }

    // Mismo proxy que arriba, pero para VSOL (olt-signal) -- por ahora solo
    // "averia-config", el resto de acciones (reiniciar/eliminar/etc) todavia
    // no existen del lado de VSOL.
    const VSOL_ONU_RUTAS = {
      "averia-config": "/averia-config",
    };
    if (req.method === "POST" && String(req.url || "").startsWith("/api/vsol-onu/") && VSOL_ONU_RUTAS[req.url.split("/").pop()]) {
      if (!VSOL_ACCION_TOKEN) return writeJson(res, 500, { ok: false, error: "VSOL_ACCION_TOKEN no configurado en el servidor." });
      const rutaDestino = VSOL_ONU_RUTAS[req.url.split("/").pop()];
      try {
        const body = await readJsonBody(req);
        const upstream = await fetch(`${OLT_SSH_API}${rutaDestino}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-debug-token": VSOL_ACCION_TOKEN },
          body: JSON.stringify(body || {}),
        });
        const data = await upstream.json().catch(() => ({ ok: false, error: "Respuesta invalida del servicio VSOL." }));
        return writeJson(res, upstream.status, data);
      } catch (e) {
        return writeJson(res, 200, { ok: false, error: e.message || String(e) });
      }
    }

    // GET /api/huawei-onu/autofind[?refresh=1] -- lista ONUs detectadas sin
    // autorizar. OJO: comparar req.url exacto rompe con el query string del
    // refresh -- hay que matchear solo el pathname.
    if (req.method === "GET" && String(req.url || "").split("?")[0] === "/api/huawei-onu/autofind") {
      if (!HUAWEI_ACCION_TOKEN) return writeJson(res, 500, { ok: false, error: "HUAWEI_ACCION_TOKEN no configurado en el servidor." });
      const qs = String(req.url || "").split("?")[1] || "";
      try {
        const upstream = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-autofind${qs ? "?" + qs : ""}`, { headers: { "x-debug-token": HUAWEI_ACCION_TOKEN } });
        const data = await upstream.json().catch(() => ({ ok: false, error: "Respuesta invalida del servicio Huawei." }));
        return writeJson(res, upstream.status, data);
      } catch (e) {
        return writeJson(res, 200, { ok: false, error: e.message || String(e) });
      }
    }

    writeJson(res, 404, { ok: false, error: "Ruta no encontrada." });
  } catch (error) {
    console.error("Diagnostico servicio error:", error);
    writeJson(res, 500, {
      ok: false,
      error: formatErrorDetail(error) || "Error interno consultando diagnostico de servicio.",
    });
  }
});

process.on("uncaughtException", (error) => {
  console.error("Diagnostico servicio uncaughtException:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Diagnostico servicio unhandledRejection:", reason);
});

server.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(`Diagnostico servicio API escuchando en http://${SERVER_HOST}:${SERVER_PORT}`);
});

// Sync automatico de la cache de IPs: una vez poco despues de arrancar (para
// no competir con el arranque del proceso) y luego cada 30 minutos.
const IP_CACHE_SYNC_INTERVAL_MS = Number(process.env.MIKROTIK_IP_CACHE_SYNC_MINUTES || 30) * 60 * 1000;
setTimeout(() => {
  syncAllRoutersIpCache()
    .then((r) => console.log("Sync inicial de cache de IPs:", JSON.stringify(r.map((x) => ({ router: x.router?.id, ok: x.ok, total: x.total })))))
    .catch((e) => console.error("Sync inicial de cache de IPs fallo:", e));
  setInterval(() => {
    syncAllRoutersIpCache()
      .then((r) => console.log("Sync periodico de cache de IPs:", JSON.stringify(r.map((x) => ({ router: x.router?.id, ok: x.ok, total: x.total })))))
      .catch((e) => console.error("Sync periodico de cache de IPs fallo:", e));
  }, IP_CACHE_SYNC_INTERVAL_MS);
}, 15000);

// Sync diaria de estado_servicio (ACTIVO/SUSPENDIDO) contra Mikrowisp, a las
// 3:00 AM hora de Lima (UTC-5, Peru no usa horario de verano, asi que el
// offset es fijo todo el año) -- horario de bajo trafico, pedido explicito
// del usuario. No depende de la zona horaria del contenedor: se calcula
// comparando contra la hora UTC directamente.
const ESTADO_SYNC_HORA_LIMA = Number(process.env.ESTADO_SYNC_HORA_LIMA || 3); // 0-23
function msHastaProximaHoraLima(horaObjetivo) {
  const ahoraUtc = new Date();
  const horaLimaActual = (ahoraUtc.getUTCHours() + 24 - 5) % 24; // UTC-5
  let proxima = new Date(ahoraUtc);
  proxima.setUTCMinutes(0, 0, 0);
  let horasAAgregar = (horaObjetivo - horaLimaActual + 24) % 24;
  if (horasAAgregar === 0 && ahoraUtc.getUTCMinutes() > 0) horasAAgregar = 24; // ya paso la hora en punto de hoy
  proxima.setUTCHours(ahoraUtc.getUTCHours() + horasAAgregar);
  return proxima.getTime() - ahoraUtc.getTime();
}
const DIA_EN_MS = 24 * 60 * 60 * 1000;
setTimeout(function ejecutarYProgramarSyncEstados() {
  sincronizarEstadosMikrowisp()
    .then((r) => console.log("Sync diaria de estados Mikrowisp:", JSON.stringify(r)))
    .catch((e) => console.error("Sync diaria de estados Mikrowisp fallo:", e.message || e));
  setTimeout(ejecutarYProgramarSyncEstados, DIA_EN_MS);
}, msHastaProximaHoraLima(ESTADO_SYNC_HORA_LIMA));

// Revision diaria de prorrateos vencidos (aviso dia 9, corte dia 10) -- a
// una hora distinta de la sync de estados de arriba, para no competir por
// la misma ventana de bajo trafico.
const PRORRATEO_SYNC_HORA_LIMA = Number(process.env.PRORRATEO_SYNC_HORA_LIMA || 4); // 0-23
setTimeout(function ejecutarYProgramarRevisionProrrateos() {
  revisarProrrateosVencidos()
    .then((r) => console.log("Revision diaria de prorrateos vencidos:", JSON.stringify(r)))
    .catch((e) => console.error("Revision diaria de prorrateos vencidos fallo:", e.message || e));
  setTimeout(ejecutarYProgramarRevisionProrrateos, DIA_EN_MS);
}, msHastaProximaHoraLima(PRORRATEO_SYNC_HORA_LIMA));

// Revision diaria de la promo 1000 Mbps (piloto DIM) -- hora propia, media
// hora despues de la de prorrateo, para no competir por la misma ventana.
const PROMO1000_SYNC_HORA_LIMA = Number(process.env.PROMO1000_SYNC_HORA_LIMA || 4);
setTimeout(function ejecutarYProgramarRevisionPromo1000() {
  procesarPromos1000()
    .then((r) => console.log("Revision diaria de promo 1000 Mbps:", JSON.stringify(r)))
    .catch((e) => console.error("Revision diaria de promo 1000 Mbps fallo:", e.message || e));
  setTimeout(ejecutarYProgramarRevisionPromo1000, DIA_EN_MS);
}, msHastaProximaHoraLima(PROMO1000_SYNC_HORA_LIMA));
