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

const normalizeNodo = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");

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
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-Token, token, Authorization",
  });
  res.end(JSON.stringify(data));
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

// Nod_03 en migracion: clientes ya pasados a VLAN 102 viven en un Mikrotik fisico
// distinto (router_key "nod03_nuevo"). El resto de Nod_03 (VLAN 100 o sin VLAN)
// sigue en el router de siempre (tiabaya). Se resuelve por VLAN, no por nodo,
// para no depender de mover clientes "en bloque".
const ROUTER_KEY_NOD03_VLAN102 = "nod03_nuevo";

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
  if (normalizeNodo(nodo) === "NOD_03") {
    const vlan = await fetchClienteVlanPorPppoe(userPppoe);
    if (vlan === 102 && routers[ROUTER_KEY_NOD03_VLAN102]) {
      router = routers[ROUTER_KEY_NOD03_VLAN102];
    }
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
  return (Number(m[1]) << 24) + (Number(m[2]) << 16) + (Number(m[3]) << 8) + Number(m[4]);
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
  return ips.map((ip, i) => ({
    usuario: buildUsuario(nodo, Number(numeroInicio) + i),
    ip,
    password: pass,
    profile,
    localAddress: localAddress || "", // vacio = se hereda del perfil PPP, como ya funciona hoy
  }));
};

const crearSecretsLote = async ({ routerKey, lote }) => {
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
    const detail = formatErrorDetail(connection?.getSocketError?.() || error);
    throw new Error(`Creacion en lote fallo: ${detail}`);
  } finally {
    if (connection?.api) await closeRouterApiSafe(connection.api);
  }
};

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

const queryRouter = async ({ nodo, userPppoe }) => {
  let connection = null;
  try {
    connection = await connectRouterByNodo(nodo, userPppoe);
    const { api, router } = connection;
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
    const router = connection?.router;
    if (router) {
      throw new Error(`No se pudo consultar ${router.nombre} (${router.host}:${router.port}): ${detail}`);
    }
    throw error;
  } finally {
    if (connection?.api) await closeRouterApiSafe(connection.api);
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

const proxyMikrowispGetClientDetails = async (req) => {
  const rawBody = await readRawBody(req);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/GetClientsDetails");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: rawBody.length ? rawBody : undefined,
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp GetClientsDetails");
  return { status: response.status, json };
};

const proxyMikrowispNod04GetClientDetails = async (req) => {
  const rawBody = await readRawBody(req);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_NOD04_API_BASE, "/GetClientsDetails");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: rawBody.length ? rawBody : JSON.stringify({ token: MIKROWISP_NOD04_TOKEN }),
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp Nod04 GetClientsDetails");
  return { status: response.status, json };
};

const proxyMikrowispNewUser = async (req) => {
  const rawBody = await readRawBody(req);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/NewUser");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: rawBody.length ? rawBody : undefined,
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp NewUser");
  return { status: response.status, json };
};

const proxyMikrowispNod04NewUser = async (req) => {
  const rawBody = await readRawBody(req);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_NOD04_API_BASE, "/NewUser");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: rawBody.length ? rawBody : JSON.stringify({ token: MIKROWISP_NOD04_TOKEN }),
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp Nod04 NewUser");
  return { status: response.status, json };
};

const proxySmartOltRequest = async (req) => {
  const url = new URL(req.url || "", "http://localhost");
  const targetPath = url.pathname.replace(/^\/api\/smartolt/, "");
  const targetUrl = buildAbsoluteApiUrl(SMARTOLT_API_BASE, targetPath);
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

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      writeJson(res, 204, {});
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

      // Camino rapido: si ya hay un sync reciente de este router en cache,
      // responder al instante sin conectar al Mikrotik. Si no hay nada en
      // cache (router nunca sincronizado, o usuario recien creado), cae al
      // camino en vivo de siempre.
      let mikrotik = null;
      try {
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

    if (req.method === "POST" && req.url === "/api/diagnostico-servicio/sync-all") {
      const resultados = await syncAllRoutersIpCache();
      writeJson(res, 200, { ok: true, resultados });
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
        writeJson(res, 400, { ok: false, error: formatErrorDetail(error) });
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

    if (req.method === "POST" && req.url === "/api/mikrowisp/test") {
      try {
        const endpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/NewUser");
        const testBody = { token: MIKROWISP_TOKEN, nombre: "Test Usuario", cedula: "00000001", correo: "test@test.com", telefono: "", movil: "000000000", direccion_principal: "Test" };
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(testBody),
        });
        const rawResp = await response.text();
        writeJson(res, 200, { endpoint, httpStatus: response.status, rawResp, tokenUsed: MIKROWISP_TOKEN.slice(0, 8) + "..." });
      } catch (e) {
        writeJson(res, 200, { error: e.message });
      }
      return;
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
