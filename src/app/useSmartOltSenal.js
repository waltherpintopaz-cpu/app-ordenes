import { useCallback, useState } from "react";

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").trim();
export const SMART_OLT_TOKEN = String(
  import.meta.env.VITE_SMART_OLT_TOKEN || "0cb1ad391ea4458cab6efe97769c761d"
).trim();

const buildApiUrl = (path = "") => {
  const p = String(path || "");
  if (/^https?:\/\//i.test(p)) return p;
  if (API_BASE_URL) {
    const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const suffix = p.startsWith("/") ? p : `/${p}`;
    return `${base}${suffix}`;
  }
  if (p.startsWith("/api/smartolt")) {
    return `https://americanet.smartolt.com${p.replace(/^\/api\/smartolt/, "/api")}`;
  }
  return p;
};

const readJsonSafe = async (res, context = "API") => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(
      `${context} devolvio respuesta no JSON (HTTP ${res.status}). ${preview || "<vacia>"}`
    );
  }
};

export const requestSmartOlt = async ({
  path,
  token,
  method = "GET",
  context = "Smart OLT",
  formData = null,
}) => {
  const url = buildApiUrl(path);
  const options = {
    method,
    headers: { "X-Token": token, Accept: "application/json" },
  };
  if (formData instanceof FormData) options.body = formData;
  const res = await fetch(url, options);
  const json = await readJsonSafe(res, context);
  return { status: Number(res.status || 0), json };
};

export const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Clasificación de señal ────────────────────────────────────────────────────
export function nivelSenal(rxDbm) {
  if (rxDbm == null || isNaN(rxDbm)) return "sin_datos";
  if (rxDbm >= -22) return "normal";
  if (rxDbm >= -25) return "alerta";
  return "critico";
}

export const NIVEL_CONFIG = {
  normal:    { label: "Normal",    dot: "#22c55e", text: "#15803d", bg: "#f0fdf4" },
  alerta:    { label: "Alerta",    dot: "#f59e0b", text: "#92400e", bg: "#fffbeb" },
  critico:   { label: "Crítico",   dot: "#ef4444", text: "#991b1b", bg: "#fef2f2" },
  sin_datos: { label: "Sin datos", dot: "#d1d5db", text: "#6b7280", bg: "#f9fafb" },
};

function parseDbm(val) {
  const n = parseFloat(String(val ?? ""));
  return isNaN(n) ? null : n;
}

function extraerBase(json) {
  if (json?.full_status_json && typeof json.full_status_json === "object")
    return json.full_status_json;
  if (json?.response?.full_status_json && typeof json.response.full_status_json === "object")
    return json.response.full_status_json;
  if (Array.isArray(json?.response)) return json.response[0] ?? null;
  if (json?.response && typeof json.response === "object") return json.response;
  return json;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useSmartOltSenal() {
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const verSenal = useCallback(async (sn, { silent = false } = {}) => {
    const snLimpio = String(sn || "").trim();
    if (!snLimpio) return null;
    if (!silent) {
      setCargando(true);
      setError("");
      setInfo("");
    }
    try {
      const { status, json } = await requestSmartOlt({
        path: `/api/smartolt/onu/get_onu_full_status_info/${encodeURIComponent(snLimpio)}`,
        token: SMART_OLT_TOKEN,
        context: "Smart OLT get_onu_full_status_info",
      });
      if (!(status >= 200 && status < 300) || json?.status !== true) {
        throw new Error(json?.message || "No se pudo consultar la señal.");
      }
      const base = extraerBase(json);
      if (!base || typeof base !== "object") throw new Error("Respuesta sin datos para la ONU.");

      const rxRaw =
        base?.["Optical status"]?.["Rx optical power(dBm)"] ?? base?.["Rx optical power(dBm)"];
      const oltRxRaw =
        base?.["Optical status"]?.["OLT Rx ONT optical power(dBm)"] ??
        base?.["OLT Rx ONT optical power(dBm)"];

      const rxDbm = parseDbm(rxRaw);
      const oltRxDbm = parseDbm(oltRxRaw);

      const result = {
        sn: String(base?.sn || snLimpio),
        estado: String(json?.response_code || base?.status || base?.onu_status || "-"),
        rxDbm,
        oltRxDbm,
        nivel: nivelSenal(rxDbm),
        fechaConsulta: new Date().toLocaleString(),
        raw: base,
      };
      setDetalle(result);
      return result;
    } catch (e) {
      if (!silent) {
        setError(String(e?.message || "Error consultando señal."));
        setDetalle(null);
      }
      return null;
    } finally {
      if (!silent) setCargando(false);
    }
  }, []);

  // Reintenta hasta obtener rxDbm real (no solo respuesta HTTP exitosa)
  const esperarSenal = useCallback(
    async (sn, intentos = 6, esperaMs = 5000) => {
      for (let i = 0; i < intentos; i++) {
        await waitMs(esperaMs);
        const resultado = await verSenal(sn, { silent: true });
        if (resultado?.rxDbm != null) return resultado;
      }
      return null;
    },
    [verSenal]
  );

  const limpiar = useCallback(() => {
    setDetalle(null);
    setError("");
    setInfo("");
  }, []);

  return { verSenal, esperarSenal, detalle, cargando, error, info, setInfo, setError, limpiar };
}
