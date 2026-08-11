import http from "node:http";

// Proxy server-side hacia el Xtream UI propio (179.43.96.253). Oculta la API
// key de Xtream del bundle del navegador (antes vivia hardcodeada en App.jsx/
// SidebarApp.jsx/MaxPlayerCuentasPanel.jsx) y resuelve el bloqueo de "mixed
// content" (panel en HTTPS no puede llamar directo a http://179.43.96.253).

const SERVER_HOST = String(process.env.XTREAM_PROXY_HOST || "0.0.0.0").trim() || "0.0.0.0";
const SERVER_PORT = Number(process.env.PORT || process.env.XTREAM_PROXY_PORT || 8788) || 8788;
const XTREAM_API_BASE = String(process.env.XTREAM_API_BASE || "http://179.43.96.253:25500").trim().replace(/\/+$/, "");
const XTREAM_API_KEY = String(process.env.XTREAM_API_KEY || "").trim();

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

    writeJson(res, 404, { success: false, error: "not_found" });
  } catch (e) {
    writeJson(res, 500, { success: false, error: "internal_error", detail: String(e?.message || e) });
  }
});

server.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(`Xtream proxy escuchando en http://${SERVER_HOST}:${SERVER_PORT}`);
});
