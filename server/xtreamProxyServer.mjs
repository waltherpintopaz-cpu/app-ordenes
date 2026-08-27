import http from "node:http";

// Proxy server-side hacia el Xtream UI propio (179.43.96.253). Oculta la API
// key de Xtream del bundle del navegador (antes vivia hardcodeada en App.jsx/
// SidebarApp.jsx/MaxPlayerCuentasPanel.jsx) y resuelve el bloqueo de "mixed
// content" (panel en HTTPS no puede llamar directo a http://179.43.96.253).

const SERVER_HOST = String(process.env.XTREAM_PROXY_HOST || "0.0.0.0").trim() || "0.0.0.0";
const SERVER_PORT = Number(process.env.PORT || process.env.XTREAM_PROXY_PORT || 8788) || 8788;
const XTREAM_API_BASE = String(process.env.XTREAM_API_BASE || "http://179.43.96.253:25500").trim().replace(/\/+$/, "");
const XTREAM_API_KEY = String(process.env.XTREAM_API_KEY || "").trim();

// ---------- Limpieza automatica de demos IPTV vencidas ----------
// Corre dentro de este mismo proceso (ya vive 24/7 en EasyPanel) cada
// CLEANUP_INTERVAL_MIN minutos: borra de Xtream, MaxPlayer.tv y Supabase
// cualquier fila de iptv_clientes con es_demo=true y demo_exp_at ya pasado.
const SUPABASE_URL = String(process.env.SUPABASE_URL || "https://vgwbqbzpjlbkmxtfghdm.supabase.co").trim().replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_").trim();
const MP_TOKEN = String(process.env.MP_TOKEN || "mNTO0Z5ynAIsPx7LWBzFX90N").trim();
const CLEANUP_INTERVAL_MIN = Number(process.env.CLEANUP_INTERVAL_MIN || 15) || 15;

// ---------- Sincronizacion periodica de "ultima conexion" ----------
// Cada CONNECTIONS_SYNC_INTERVAL_MIN minutos consulta a Xtream (user_connections_api.php,
// action=last_seen) la ultima conexion de cada cuenta con linea propia y la
// persiste en iptv_clientes (columnas ultima_conexion / en_linea), asi el panel
// la muestra sin tener que golpear a Xtream en cada carga.
const CONNECTIONS_SYNC_INTERVAL_MIN = Number(process.env.CONNECTIONS_SYNC_INTERVAL_MIN || 5) || 5;

const writeJson = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  });
  res.end(JSON.stringify(data));
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
};

const forwardToXtream = async (path, body) => {
  const res = await fetch(`${XTREAM_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XTREAM_API_KEY}`,
    },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
};

// ---------- Resolver links cortos de Google Maps (maps.app.goo.gl) ----------
// El sidebar de ordenes ya extrae coordenadas de links largos por regex (texto
// plano), pero los links cortos no traen coordenadas visibles: hay que seguir
// la redireccion y leerlas de la URL final.
const ALLOWED_MAPS_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "google.com", "www.google.com", "maps.google.com"]);

async function resolveMapsLink(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ""));
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (!ALLOWED_MAPS_HOSTS.has(parsed.hostname)) {
    return { ok: false, error: "host_not_allowed" };
  }
  let res;
  try {
    res = await fetch(parsed.toString(), { redirect: "follow" });
  } catch (e) {
    return { ok: false, error: "fetch_failed", detail: String(e?.message || e) };
  }
  const finalUrl = res.url || parsed.toString();
  // Prioridad: el pin exacto del lugar (!3d lat !4d lng) sobre el centro del
  // mapa (@lat,lng), que puede estar desplazado si el usuario movio la vista.
  const mPin = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const mCenter = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const match = mPin || mCenter;
  if (!match) {
    return { ok: false, error: "coords_not_found", final_url: finalUrl };
  }
  return { ok: true, lat: match[1], lng: match[2], final_url: finalUrl };
}

const supabaseHeaders = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

async function limpiarDemosVencidas() {
  if (!XTREAM_API_KEY) return { ok: false, error: "server_misconfigured" };
  const nowIso = new Date().toISOString();
  const url = `${SUPABASE_URL}/rest/v1/iptv_clientes?es_demo=eq.true&demo_exp_at=lt.${encodeURIComponent(nowIso)}&select=dni,iptv_usuario,iptv_user_id,xtream_user_id`;
  let vencidas = [];
  try {
    const res = await fetch(url, { headers: supabaseHeaders });
    vencidas = await res.json();
    if (!Array.isArray(vencidas)) vencidas = [];
  } catch (e) {
    console.error("[cleanup-demos] error consultando Supabase:", e?.message || e);
    return { ok: false, error: "supabase_query_failed" };
  }

  if (vencidas.length === 0) return { ok: true, eliminadas: 0 };

  let eliminadas = 0;
  for (const row of vencidas) {
    try {
      if (row.iptv_user_id) {
        await fetch(`https://api.maxplayer.tv/v3/api/public/users/${row.iptv_user_id}`, {
          method: "DELETE",
          headers: { "Api-Token": MP_TOKEN },
        }).catch(() => {});
      }
      if (row.xtream_user_id) {
        await forwardToXtream("/manage_user_api.php", { action: "delete", user_id: row.xtream_user_id });
      }
      await fetch(`${SUPABASE_URL}/rest/v1/iptv_clientes?dni=eq.${encodeURIComponent(row.dni)}`, {
        method: "DELETE",
        headers: supabaseHeaders,
      });
      eliminadas += 1;
      console.log(`[cleanup-demos] eliminada demo vencida: ${row.iptv_usuario} (dni ${row.dni})`);
    } catch (e) {
      console.error(`[cleanup-demos] error eliminando ${row.iptv_usuario}:`, e?.message || e);
    }
  }
  return { ok: true, eliminadas, total_vencidas: vencidas.length };
}

async function sincronizarUltimaConexion() {
  if (!XTREAM_API_KEY) return { ok: false, error: "server_misconfigured" };

  const url = `${SUPABASE_URL}/rest/v1/iptv_clientes?xtream_user_id=not.is.null&select=dni,xtream_user_id`;
  let cuentas = [];
  try {
    const res = await fetch(url, { headers: supabaseHeaders });
    cuentas = await res.json();
    if (!Array.isArray(cuentas)) cuentas = [];
  } catch (e) {
    console.error("[sync-conexiones] error consultando Supabase:", e?.message || e);
    return { ok: false, error: "supabase_query_failed" };
  }
  if (cuentas.length === 0) return { ok: true, actualizadas: 0 };

  const porUserId = new Map();
  for (const c of cuentas) {
    if (c.xtream_user_id) porUserId.set(Number(c.xtream_user_id), c.dni);
  }
  const userIds = Array.from(porUserId.keys());

  // La API acepta como maximo 500 ids por llamada.
  let actualizadas = 0;
  for (let i = 0; i < userIds.length; i += 500) {
    const lote = userIds.slice(i, i + 500);
    const result = await forwardToXtream("/user_connections_api.php", { action: "last_seen", user_ids: lote });
    const datos = result?.json?.result || {};
    for (const uid of lote) {
      const info = datos[String(uid)];
      if (!info) continue;
      const dni = porUserId.get(uid);
      if (!dni) continue;
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/iptv_clientes?dni=eq.${encodeURIComponent(dni)}`, {
          method: "PATCH",
          headers: { ...supabaseHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({
            ultima_conexion: info.last_seen || null,
            en_linea: Boolean(info.online),
            ips_24h: Number(info.ips_24h) || 0,
          }),
        });
        actualizadas += 1;
      } catch (e) {
        console.error(`[sync-conexiones] error actualizando dni ${dni}:`, e?.message || e);
      }
    }
  }
  return { ok: true, actualizadas, total: userIds.length };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      writeJson(res, 204, {});
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      writeJson(res, 200, {
        ok: true,
        service: "xtream-proxy",
        configured: Boolean(XTREAM_API_KEY),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/resolve-maps-link") {
      const body = await readJsonBody(req);
      const result = await resolveMapsLink(body?.url);
      writeJson(res, result.ok ? 200 : 400, result);
      return;
    }

    if (!XTREAM_API_KEY) {
      writeJson(res, 500, { success: false, error: "server_misconfigured" });
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/create-user") {
      const body = await readJsonBody(req);
      const result = await forwardToXtream("/create_user_api.php", body);
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/manage-user") {
      const body = await readJsonBody(req);
      const result = await forwardToXtream("/manage_user_api.php", body);
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/connections") {
      const body = await readJsonBody(req);
      const result = await forwardToXtream("/user_connections_api.php", { action: "connections", ...body });
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/online-all") {
      const result = await forwardToXtream("/user_connections_api.php", { action: "online_all" });
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/top-channels") {
      const body = await readJsonBody(req);
      const result = await forwardToXtream("/user_connections_api.php", { action: "top_channels", ...body });
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/xtream-status") {
      const body = await readJsonBody(req);
      const result = await forwardToXtream("/user_connections_api.php", { action: "xtream_status", ...body });
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/top-channels-global") {
      const body = await readJsonBody(req);
      const result = await forwardToXtream("/user_connections_api.php", { action: "top_channels_global", ...body });
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/channel-viewers") {
      const body = await readJsonBody(req);
      const result = await forwardToXtream("/user_connections_api.php", { action: "channel_viewers", ...body });
      writeJson(res, result.status, result.json);
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/cleanup-demos") {
      const result = await limpiarDemosVencidas();
      writeJson(res, result.ok ? 200 : 500, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/xtream/sync-connections") {
      const result = await sincronizarUltimaConexion();
      writeJson(res, result.ok ? 200 : 500, result);
      return;
    }

    writeJson(res, 404, { success: false, error: "not_found" });
  } catch (e) {
    writeJson(res, 500, { success: false, error: "internal_error", detail: String(e?.message || e) });
  }
});

server.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(`Xtream proxy escuchando en http://${SERVER_HOST}:${SERVER_PORT}`);
});

// Limpieza automatica de demos vencidas: primera pasada a los 30s de arrancar
// (para no competir con el arranque), luego cada CLEANUP_INTERVAL_MIN minutos.
setTimeout(() => { limpiarDemosVencidas().catch(() => {}); }, 30000);
setInterval(() => { limpiarDemosVencidas().catch(() => {}); }, CLEANUP_INTERVAL_MIN * 60000);

// Sincronizacion de "ultima conexion": primera pasada a los 45s de arrancar,
// luego cada CONNECTIONS_SYNC_INTERVAL_MIN minutos.
setTimeout(() => { sincronizarUltimaConexion().catch(() => {}); }, 45000);
setInterval(() => { sincronizarUltimaConexion().catch(() => {}); }, CONNECTIONS_SYNC_INTERVAL_MIN * 60000);
