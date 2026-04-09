import http from "node:http";
import { RouterOSAPI } from "node-routeros";

const DEFAULT_SUPABASE_URL = "https://vgwbqbzpjlbkmxtfghdm.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_";
const DEFAULT_MIKROWISP_API_BASE = "https://americanet.club/api/v1";
const DEFAULT_MIKROWISP_TOKEN = "LzNXSERnUHBMMS91b0NzUGFTVkFkZz09";
const DEFAULT_SMARTOLT_API_BASE = "https://americanet.smartolt.com/api";
const DEFAULT_SMARTOLT_TOKEN = "0cb1ad391ea4458cab6efe97769c761d";
const SERVER_HOST = String(process.env.DIAGNOSTICO_SERVER_HOST || "127.0.0.1").trim() || "127.0.0.1";
const SERVER_PORT = Number(process.env.DIAGNOSTICO_SERVER_PORT || 8787) || 8787;
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();
const MIKROWISP_API_BASE =
  String(process.env.MIKROWISP_API_BASE || DEFAULT_MIKROWISP_API_BASE).trim().replace(/\/+$/, "") || DEFAULT_MIKROWISP_API_BASE;
const MIKROWISP_TOKEN = String(process.env.MIKROWISP_TOKEN || DEFAULT_MIKROWISP_TOKEN).trim();
const SMARTOLT_API_BASE =
  String(process.env.SMARTOLT_API_BASE || process.env.VITE_API_BASE_URL || DEFAULT_SMARTOLT_API_BASE)
    .trim()
    .replace(/\/+$/, "") || DEFAULT_SMARTOLT_API_BASE;
const SMARTOLT_TOKEN = String(process.env.SMARTOLT_TOKEN || process.env.VITE_SMART_OLT_TOKEN || DEFAULT_SMARTOLT_TOKEN).trim();
const MIKROTIK_ROUTERS_TABLE = "mikrotik_routers";
const MIKROTIK_NODO_ROUTER_TABLE = "mikrotik_nodo_router";
const MOROSOS_ADDRESS_LIST = String(process.env.MIKROTIK_MOROSOS_LIST || "moroso_").trim() || "moroso_";

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
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-Token, token",
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

const connectRouterByNodo = async (nodo = "") => {
  const routers = (await loadRoutersConfigFromSupabase()) || buildEnvRouters();
  const router = findRouterByNodo(routers, nodo);
  if (!router) throw new Error(`No hay router configurado para el nodo ${nodo || "-"}.`);
  const configError = buildRouterConfigError(router);
  if (configError) throw new Error(configError);

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

const closeRouterApiSafe = async (api) => {
  try {
    await api.close();
  } catch {
    // noop
  }
};

const loadSecretAndActive = async ({ api, router, userPppoe }) => {
  const secretRows = await withTimeout(
    api.write("/ppp/secret/print", [`?name=${userPppoe}`]),
    10000,
    `Consulta PPP Secret en ${router.nombre}`
  );
  const secret = Array.isArray(secretRows) && secretRows.length ? secretRows[0] : null;
  let active = null;
  let activeTimedOut = false;
  try {
    const activeRows = await withTimeout(
      api.write("/ppp/active/print", [`?name=${userPppoe}`]),
      6000,
      `Consulta PPP Active en ${router.nombre}`
    );
    active = Array.isArray(activeRows) && activeRows.length ? activeRows[0] : null;
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
    api.write("/ppp/secret/print", [`?name=${userPppoe}`]),
    10000,
    `Consulta PPP Secret en ${router.nombre}`
  );
  return Array.isArray(secretRows) && secretRows.length ? secretRows[0] : null;
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
    connection = await connectRouterByNodo(nodo);
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
    connection = await connectRouterByNodo(nodo);
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
    connection = await connectRouterByNodo(nodo);
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

const jsonBodyToFormEncoded = (rawBody) => {
  try {
    const parsed = JSON.parse(rawBody.toString());
    return new URLSearchParams(parsed).toString();
  } catch {
    return rawBody.toString();
  }
};

const proxyMikrowispGetClientDetails = async (req) => {
  const rawBody = await readRawBody(req);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/GetClientsDetails");
  const formBody = jsonBodyToFormEncoded(rawBody);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      token: MIKROWISP_TOKEN,
    },
    body: formBody,
  });
  const json = await readProxyJsonResponse(response, "Mikrowisp GetClientsDetails");
  return { status: response.status, json };
};

const proxyMikrowispNewUser = async (req) => {
  const rawBody = await readRawBody(req);
  const endpoint = buildAbsoluteApiUrl(MIKROWISP_API_BASE, "/NewUser");
  const formBody = jsonBodyToFormEncoded(rawBody);
  console.log(`[MK NewUser] form body: ${formBody}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      token: MIKROWISP_TOKEN,
    },
    body: formBody,
  });
  const rawResp = await response.text();
  let json = {};
  try { json = rawResp.trim() ? JSON.parse(rawResp) : { _raw: "(empty)" }; } catch { json = { _raw: rawResp }; }
  return { status: response.status, json, _debug: { formBody, rawResp } };
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

    if (req.method === "POST" && req.url === "/api/mikrowisp/NewUser") {
      const result = await proxyMikrowispNewUser(req);
      writeJson(res, result.status, { ...result.json, _debug: result._debug });
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

      const mikrotik = await queryRouter({ nodo, userPppoe });
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
