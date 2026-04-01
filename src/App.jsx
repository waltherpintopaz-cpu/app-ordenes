import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ConsultaApiPanel from "./components/ConsultaApiPanel";
import SeguimientoTecnicosPanel from "./components/SeguimientoTecnicosPanel";
import PlantaExternaPanel from "./components/PlantaExternaPanel";
import InventarioPanel from "./components/InventarioPanel";
import MapaPanel from "./components/MapaPanel";
import SmartOltPanel from "./components/SmartOltPanel";
import ConciliacionOnusPanel from "./components/ConciliacionOnusPanel";
import WhatsAppConfigPanel from "./components/WhatsAppConfigPanel";
import NapPanel from "./components/NapPanel";
import RecordatoriosPanel from "./components/RecordatoriosPanel";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import LogsPanel from "./components/LogsPanel";
import logoAmericanet from "./assets/americanet-logo-new-trimmed.png";
import logoDim from "./assets/dim-logo-trimmed.png";

const REPORTES_PAGE_SIZE = 25;
const CLIENTES_PAGE_SIZE = 25;
const SMART_OLT_TOKEN = String(import.meta.env.VITE_SMART_OLT_TOKEN || "0cb1ad391ea4458cab6efe97769c761d").trim();
const SMART_OLT_API = (path) => {
  const p = String(path || "");
  const base = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (base) return `${base}${p.startsWith("/") ? p : `/${p}`}`;
  if (p.startsWith("/api/")) return p;
  return p;
};
const CLIENTES_SHEET_ID = "1PQWuZFUsGPneoHVGj4tq9iSiX0suqp5iRJDwBONleR8";
const CLIENTES_SHEET_TAB = "Sheet1";
const CLIENTES_SHEET_GID = "1134373291";
const CLIENTES_TABLE = "clientes";
const ORDENES_TABLE = "ordenes";
const USUARIOS_TABLE = "usuarios";
const MIKROTIK_ROUTERS_TABLE = "mikrotik_routers";
const MIKROTIK_NODO_ROUTER_TABLE = "mikrotik_nodo_router";
const HIST_APPSHEET_SHEET_ID = "1soSl4tyfSC7VDNAXhRWUhtkotk09G1IpjqqxkzQnqKE";
const HIST_APPSHEET_SHEET_TAB = "ONUsRegistradas";
const HIST_APPSHEET_ARTICULOS_TAB = "ARTICULOS";
const HIST_APPSHEET_ART_GID = "798538932";
const HIST_APPSHEET_LIQ_TAB = "Liquidaciones";
const HIST_APPSHEET_TABLE = "historial_appsheet_onus";
const HIST_APPSHEET_ART_TABLE = "historial_appsheet_articulos";
const HIST_APPSHEET_LIQ_GID = "0";
const HIST_APPSHEET_LIQ_TABLE = "historial_appsheet_liquidaciones";
const HIST_APPSHEET_DET_LIQ_GID = "1335386217";
const HIST_APPSHEET_DET_LIQ_TABLE = "historial_appsheet_detalle_liquidacion";
const HIST_APPSHEET_EXTRACTO_GID = "312863462";
const HIST_APPSHEET_MOVIMIENTOS_GID = "1488260342";
const HIST_APPSHEET_EXTRACTO_TABLE = "historial_appsheet_extracto";
const HIST_APPSHEET_MOVIMIENTOS_TABLE = "historial_appsheet_movimientos";
const HIST_APPSHEET_BASEDATA_TABLE = "historial_appsheet_ordenes_basedata";
const HIST_APPSHEET_SYNC_TABLE = "historial_appsheet_sync_state";
const BASEDATA_SHEET_ID = "126nhHtB8zvVteHGrQVy9K5giv1yo4yJTL8cNDsCDZTc";
const BASEDATA_GID = "605259735";
const HIST_SYNC_KEY_EQUIPOS = "historial-appsheet-onus";
const HIST_SYNC_KEY_LIQUIDACIONES = "historial-appsheet-liquidaciones";
const HIST_SYNC_KEY_DETALLE = "historial-appsheet-detalle-liquidacion";
const HIST_SYNC_KEY_ARTICULOS = "historial-appsheet-articulos";
const HIST_SYNC_KEY_EXTRACTO = "historial-appsheet-extracto";
const HIST_SYNC_KEY_MOVIMIENTOS = "historial-appsheet-movimientos";
const HIST_SYNC_KEY_BASEDATA = "historial-appsheet-basedata";
const APPSHEET_APP_NAME_PORTAL = String(import.meta.env.VITE_APPSHEET_APP_NAME || "Actuaciones02-637142196").trim();
const DIAGNOSTICO_API_BASE = String(import.meta.env.VITE_DIAGNOSTICO_API_BASE || "").trim().replace(/\/+$/, "");
const HIST_TECNICO_CODE_TO_NAME = {
  "AFS-LUI-01": "Luis Pacsi",
  "AFS-WIL-01": "Willans H.",
  "AFS-WILL-01": "Willans H.",
  "AFS-HER-03": "Hernan Tticona",
  "AFS-JRC-04": "Juan Ramirez",
  "AFS-CRIS-05": "Cristian Huayapa",
  "AFS-WAL-06": "Walter Pinto",
  "AFS-ERI-07": "Erick Milton",
  "AFS-SCO-08": "Scott Gonzales",
  "AFS-PROVE": "Proveedor",
  "AFS-FRAN": "Francisco M.",
  "AFS-GRE": "Giovanny robles",
  "AFS-NOD01": "Nodo_01",
  "AFS-NOD02": "Nodo_02",
  "AFS-NOD03": "Nodo_03",
  "AFS-NOD04": "Nodo_04",
  "AFS-ALE-02": "Alejandro Juño",
};

const NODO_USUARIO_RULES = {
  NOD_01: { prefix: "user", start: 801, suffix: "@americanet" },
  NOD_02: { prefix: "usuario_", start: 600, suffix: "" },
  NOD_03: { prefix: "", start: 501, suffix: "@americanet", pad: 4 },
  NOD_04: { prefix: "user", start: 467, suffix: "@fiber" },
  NOD_06: { prefix: "", start: 130, suffix: "@amnet" },
};

const NODO_PASSWORD_RULES = {
  NOD_01: "madrid0021",
  NOD_02: "speedy2000",
  NOD_03: "aqp0021",
  NOD_04: "uchumayo0021",
  NOD_06: "apipa0021",
};

const ROLES_USUARIO_WEB = ["Administrador", "Gestora", "Tecnico", "Almacen"];
const EMPRESAS_USUARIO_WEB = ["Americanet", "DIM"];
const NODOS_BASE_WEB = ["Nod_01", "Nod_02", "Nod_03", "Nod_04", "Nod_05", "Nod_06"];
const DEFAULT_MIKROTIK_ROUTERS_WEB = [
  {
    routerKey: "tiabaya",
    nombre: "Router Tiabaya",
    host: "172.25.100.140",
    port: "8730",
    apiUser: "admin",
    apiPassword: "",
    activo: true,
    notas: "Configuracion base por API.",
  },
  {
    routerKey: "congata",
    nombre: "Router Congata",
    host: "172.25.197.25",
    port: "8000",
    apiUser: "admin",
    apiPassword: "",
    activo: true,
    notas: "Configuracion base por API.",
  },
  {
    routerKey: "apipa",
    nombre: "Router Apipa",
    host: "172.25.148.194",
    port: "8730",
    apiUser: "admin",
    apiPassword: "",
    activo: true,
    notas: "Configuracion base por API.",
  },
];
const DEFAULT_MIKROTIK_NODO_ROUTER_WEB = [
  { nodo: "Nod_01", routerKey: "tiabaya", activo: true, observacion: "" },
  { nodo: "Nod_02", routerKey: "tiabaya", activo: true, observacion: "" },
  { nodo: "Nod_03", routerKey: "tiabaya", activo: true, observacion: "" },
  { nodo: "Nod_04", routerKey: "congata", activo: true, observacion: "" },
  { nodo: "Nod_05", routerKey: "", activo: false, observacion: "Sin router asignado." },
  { nodo: "Nod_06", routerKey: "apipa", activo: true, observacion: "" },
];
const MENU_VISTAS_WEB = [
  { key: "dashboard", label: "Dashboard" },
  { key: "crear", label: "Crear orden" },
  { key: "pendientes", label: "Pendientes" },
  { key: "historial", label: "Historial" },
  { key: "recuperaciones", label: "Recuperaciones" },
  { key: "historialAppsheet", label: "Historial AppSheet" },
  { key: "diagnosticoServicio", label: "Diagnóstico servicio" },
  { key: "reportes", label: "Reportes" },
  { key: "mapa", label: "Mapa" },
  { key: "consultaCliente", label: "Consulta API" },
  { key: "smartOlt", label: "Smart OLT" },
  { key: "seguimientoTecnicos", label: "Seguimiento tecnicos" },
  { key: "plantaExterna", label: "Planta externa" },
  { key: "inventario", label: "Inventario" },
  { key: "almacenes", label: "Almacenes" },
  { key: "usuarios", label: "Usuarios" },
  { key: "clientes", label: "Clientes" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "nap", label: "Cajas NAP" },
  { key: "recordatorios", label: "Recordatorios" },
  { key: "logs", label: "Logs" },
];

// Permisos por defecto al CREAR un usuario nuevo (se pueden modificar libremente)
const PERMISOS_MENU_POR_ROL_WEB = {
  Administrador: MENU_VISTAS_WEB.map((item) => item.key),
  Gestora: ["dashboard", "crear", "pendientes", "historial", "recuperaciones", "historialAppsheet", "diagnosticoServicio", "reportes", "clientes", "nap", "whatsapp", "recordatorios"],
  Tecnico: ["crear", "pendientes", "historial", "recuperaciones", "mapa", "stockTecnico", "consultaCliente", "smartOlt", "clientes", "recordatorios"],
  Almacen: ["historial", "recuperaciones", "reportes", "inventario", "smartOlt", "plantaExterna", "nap", "recordatorios"],
};

// Solo recordatorios se garantiza siempre — todo lo demás es flexible
const MENU_ITEMS_GARANTIZADOS_POR_ROL = {
  Administrador: MENU_VISTAS_WEB.map((item) => item.key),
  Gestora: ["recordatorios"],
  Tecnico: ["recordatorios"],
  Almacen: ["recordatorios"],
};

const HISTORIAL_APPSHEET_SUBMENU_ITEMS = [
  { key: "equipos", label: "Equipos", sideLabel: "Equipos", gestoraVisible: true },
  { key: "liquidaciones", label: "Liquidaciones", sideLabel: "Liquidaciones", gestoraVisible: true },
  {
    key: "materialesLiquidacion",
    label: "Materiales de liquidación",
    sideLabel: "Materiales liquidación",
    gestoraVisible: true,
  },
  { key: "articulos", label: "Artículos", sideLabel: "Artículos", gestoraVisible: true },
  { key: "pdf", label: "PDF", sideLabel: "Reportes PDF", gestoraVisible: false },
  { key: "extracto", label: "Extracto", sideLabel: "Extracto", gestoraVisible: false },
  { key: "movimientos", label: "Movimientos", sideLabel: "Movimientos", gestoraVisible: false },
  { key: "ordenesBaseData", label: "Ordenes", sideLabel: "Ordenes BaseData", gestoraVisible: true },
  { key: "conciliacionOnus", label: "Conciliación ONUs", sideLabel: "Conciliación ONUs", gestoraVisible: false },
];
const HISTORIAL_APPSHEET_SUBMENU_ACCESS_PREFIX = "historialAppsheet:";
const HISTORIAL_APPSHEET_SUBMENU_NONE_KEY = `${HISTORIAL_APPSHEET_SUBMENU_ACCESS_PREFIX}none`;
const HISTORIAL_APPSHEET_SUBMENU_ACCESS_KEYS = HISTORIAL_APPSHEET_SUBMENU_ITEMS.map(
  (item) => `${HISTORIAL_APPSHEET_SUBMENU_ACCESS_PREFIX}${item.key}`
);
const DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS = [
  { key: "buscarDni", label: "Buscar por DNI" },
  { key: "consultaDirecta", label: "Consulta directa por usuario" },
  { key: "suspensionManual", label: "Suspensión manual" },
];
const DIAGNOSTICO_SERVICIO_PERMISOS_PREFIX = "diagnosticoServicio:";
const DIAGNOSTICO_SERVICIO_PERMISOS_NONE_KEY = `${DIAGNOSTICO_SERVICIO_PERMISOS_PREFIX}none`;
const DIAGNOSTICO_SERVICIO_PERMISOS_ACCESS_KEYS = DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS.map(
  (item) => `${DIAGNOSTICO_SERVICIO_PERMISOS_PREFIX}${item.key}`
);

const MENU_ICON_PATHS = {
  dashboard: "M3 3H10V10H3V3ZM14 3H21V10H14V3ZM3 14H10V21H3V14ZM14 14H21V21H14V14Z",
  crear: "M12 5V19M5 12H19",
  pendientes: "M8 7H16M8 12H16M8 17H13M6 7H6.01M6 12H6.01M6 17H6.01",
  historial: "M12 8V12L15 14M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z",
  recuperaciones: "M4 12L8 8M4 12L8 16M4 12H14M20 6V18M14 6H20M14 18H20",
  historialAppsheet: "M5 4H19V20H5V4ZM9 9H15M9 13H15M9 17H13",
  diagnosticoServicio: "M3 12H6L8 17L12 7L15 14L17 12H21",
  reportes: "M5 19V12M12 19V8M19 19V5",
  mapa: "M9 4L3 6V20L9 18M9 4L15 6M9 4V18M15 6L21 4V18L15 20M15 6V20",
  consultaApi: "M8 9L5 12L8 15M16 9L19 12L16 15M13 7L11 17",
  smartOlt: "M3 9C5.5 6 8.5 4.5 12 4.5C15.5 4.5 18.5 6 21 9M6 12C7.7 10.2 9.7 9.2 12 9.2C14.3 9.2 16.3 10.2 18 12M9.5 15.2C10.2 14.5 11 14.1 12 14.1C13 14.1 13.8 14.5 14.5 15.2M12 19H12.01",
  seguimientoTecnicos: "M4 20H20M6 16L10 12L13 14L18 8",
  plantaExterna: "M4 20H20M6 20V10L12 6L18 10V20",
  inventario: "M3 7H21V19H3V7ZM8 7V19M3 12H21",
  almacenes: "M12 3L3 8L12 13L21 8L12 3ZM3 16L12 21L21 16",
  usuarios: "M16 10A4 4 0 1 1 8 10A4 4 0 0 1 16 10ZM4 20C5.6 16.9 8.4 15.3 12 15.3C15.6 15.3 18.4 16.9 20 20",
  clientes: "M4 6H20V18H4V6ZM8 10H16M8 14H13",
  whatsapp: "M21 11.5C21 16.747 16.747 21 11.5 21C9.83 21 8.255 20.578 6.888 19.835L3 21L4.165 17.112C3.422 15.745 3 14.17 3 12.5C3 7.253 7.253 3 12.5 3C16.747 3 20.322 5.526 21 11.5ZM9 10H8V14H9V10ZM13 10H12C11.448 10 11 10.448 11 11V13C11 13.552 11.448 14 12 14H13C13.552 14 14 13.552 14 13V11C14 10.448 13.552 10 13 10ZM17 10H15V14H16V12.5H17V10Z",
  nap: "M12 2L4 6V12C4 15.31 7.58 19.2 12 21C16.42 19.2 20 15.31 20 12V6L12 2ZM10 17L6 13L7.41 11.59L10 14.17L16.59 7.58L18 9L10 17Z",
};

const HIST_APPSHEET_SUBMENU_ICON_PATHS = {
  equipos: "M4 7H20V17H4V7ZM7 7V5H17V7",
  liquidaciones: "M5 4H19V20H5V4ZM9 9H15M9 13H15M9 17H13",
  materialesLiquidacion: "M3 7H21V17H3V7ZM7 7V5H17V7M8 12H16",
  articulos: "M5 5H19V19H5V5ZM9 9H15M9 13H15M9 17H13",
  pdf: "M6 3H14L19 8V21H6V3ZM14 3V8H19",
  extracto: "M5 4H19V20H5V4ZM9 9H15M9 13H15M9 17H12",
  movimientos: "M4 18L9 12L13 15L20 8",
  ordenesBaseData: "M5 4H19V20H5V4ZM8 8H16M8 12H16M8 16H14",
  conciliacionOnus: "M4 7H20V17H4V7ZM8 11H16M8 15H13M14.5 4.5L16.5 6.5L12 11",
};

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNodoKey(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");
}

function esEstadoOperativoOrden(value = "") {
  const estado = String(value || "").trim().toLowerCase();
  if (!estado) return false;
  return estado.includes("pendient") || estado.includes("proceso");
}

function getEstadoOperativoBadgeStyle(value = "") {
  const estado = String(value || "").trim().toLowerCase();
  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
  };
  if (estado.includes("proceso")) {
    return {
      ...base,
      padding: "8px 14px",
      fontSize: "13px",
      fontWeight: "800",
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #f59e0b",
      boxShadow: "0 0 0 2px rgba(245, 158, 11, 0.18)",
    };
  }
  return {
    ...base,
    background: "#ffedd5",
    color: "#9a3412",
  };
}

function sugerirUsuarioPorNodo(nodo = "", usados = [], habilitadosManual = []) {
  const key = normalizeNodoKey(nodo);
  const rule = NODO_USUARIO_RULES[key];
  if (!rule) return "";
  const prefix = String(rule.prefix || "");
  const suffix = String(rule.suffix || "");
  const base = Number.isFinite(Number(rule.start)) ? Number(rule.start) : 1;
  const pad = Number.isFinite(Number(rule.pad)) ? Number(rule.pad) : 0;
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)${escapeRegExp(suffix)}$`, "i");
  const usadosNorm = new Set((Array.isArray(usados) ? usados : []).map((v) => String(v || "").trim().toLowerCase()).filter(Boolean));

  const manualNums = (Array.isArray(habilitadosManual) ? habilitadosManual : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .filter((v) => !usadosNorm.has(v.toLowerCase()))
    .map((v) => {
      const m = v.match(pattern);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (manualNums.length > 0) {
    const numText = pad > 0 ? String(manualNums[0]).padStart(pad, "0") : String(manualNums[0]);
    return `${prefix}${numText}${suffix}`;
  }

  const nums = (Array.isArray(usados) ? usados : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .map((v) => {
      const m = v.match(pattern);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => Number.isFinite(n));
  const next = Math.max(base - 1, ...nums) + 1;
  const numText = pad > 0 ? String(next).padStart(pad, "0") : String(next);
  return `${prefix}${numText}${suffix}`;
}

function listarUsuariosDisponiblesParaNodo(nodo = "", usados = [], habilitadosManual = [], cantidad = 10) {
  const key = normalizeNodoKey(nodo);
  const rule = NODO_USUARIO_RULES[key];
  if (!rule) return [];
  const prefix = String(rule.prefix || "");
  const suffix = String(rule.suffix || "");
  const base = Number.isFinite(Number(rule.start)) ? Number(rule.start) : 1;
  const pad = Number.isFinite(Number(rule.pad)) ? Number(rule.pad) : 0;
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)${escapeRegExp(suffix)}$`, "i");
  const usadosNorm = new Set((Array.isArray(usados) ? usados : []).map((v) => String(v || "").trim().toLowerCase()).filter(Boolean));

  // Primero los habilitados manualmente que estén libres
  const manualLibres = (Array.isArray(habilitadosManual) ? habilitadosManual : [])
    .map((v) => String(v || "").trim())
    .filter((v) => v && !usadosNorm.has(v.toLowerCase()))
    .filter((v) => pattern.test(v));

  const nums = (Array.isArray(usados) ? usados : [])
    .map((v) => { const m = String(v || "").trim().match(pattern); return m ? Number(m[1]) : NaN; })
    .filter((n) => Number.isFinite(n));
  const maxUsado = nums.length > 0 ? Math.max(...nums) : base - 1;

  const resultado = [...manualLibres];
  let n = Math.max(base, maxUsado + 1);
  while (resultado.length < cantidad) {
    const numText = pad > 0 ? String(n).padStart(pad, "0") : String(n);
    const candidate = `${prefix}${numText}${suffix}`;
    if (!usadosNorm.has(candidate.toLowerCase())) resultado.push(candidate);
    n++;
    if (n > base + 9999) break;
  }
  return resultado;
}

function usuarioNodoCoincideRegla(usuario = "", nodo = "") {
  const key = normalizeNodoKey(nodo);
  const rule = NODO_USUARIO_RULES[key];
  if (!rule) return false;
  const prefix = String(rule.prefix || "");
  const suffix = String(rule.suffix || "");
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)${escapeRegExp(suffix)}$`, "i");
  return pattern.test(String(usuario || "").trim());
}

function sugerirPasswordPorNodo(nodo = "") {
  const key = normalizeNodoKey(nodo);
  return String(NODO_PASSWORD_RULES[key] || "").trim();
}

function todayIsoLocal() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function formatMikrotikUptime(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const parts = Array.from(raw.matchAll(/(\d+)([wdhms])/gi));
  if (!parts.length) return raw;
  const labels = {
    w: "sem",
    d: "d",
    h: "h",
    m: "min",
    s: "seg",
  };
  return parts
    .slice(0, 4)
    .map(([, amount, unit]) => `${amount} ${labels[String(unit || "").toLowerCase()] || unit}`)
    .join(" ");
}

function formatDiagnosticoBoolean(value) {
  if (typeof value === "boolean") return value ? "Si" : "No";
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "-";
  if (text === "true" || text === "yes") return "Si";
  if (text === "false" || text === "no") return "No";
  return String(value);
}

function getDiagnosticoEstadoVisual(value = "") {
  const estado = String(value || "").trim().toLowerCase();
  const base = {
    label: "Pendiente de consulta",
    chip: "Sin consulta",
    tone: {
      text: "#334155",
      bg: "#f8fafc",
      soft: "#eef2f7",
      border: "#d7e2ef",
      accent: "#94a3b8",
    },
  };
  if (estado === "conectado") {
    return {
      label: "Cliente conectado",
      chip: "En linea",
      tone: {
        text: "#166534",
        bg: "#f0fdf4",
        soft: "#dcfce7",
        border: "#86efac",
        accent: "#16a34a",
      },
    };
  }
  if (estado === "no-conectado") {
    return {
      label: "Cliente no conectado",
      chip: "Sin sesion activa",
      tone: {
        text: "#9a3412",
        bg: "#fff7ed",
        soft: "#ffedd5",
        border: "#fdba74",
        accent: "#f97316",
      },
    };
  }
  if (estado === "no-encontrado") {
    return {
      label: "Usuario PPPoE no encontrado",
      chip: "Sin registro",
      tone: {
        text: "#991b1b",
        bg: "#fef2f2",
        soft: "#fee2e2",
        border: "#fca5a5",
        accent: "#ef4444",
      },
    };
  }
  return base;
}

const buildInitialOrder = () => ({
  empresa: "",
  codigo: "",
  generarUsuario: "SI",
  orden: "ORDEN DE SERVICIO",
  tipoActuacion: "Instalacion Internet",
  fechaActuacion: todayIsoLocal(),
  hora: "",
  estado: "Pendiente",
  prioridad: "Normal",

  dni: "",
  nombre: "",
  direccion: "",
  celular: "",
  email: "",
  contacto: "",

  velocidad: "",
  precioPlan: "",
  nodo: "",
  usuarioNodo: "",
  passwordUsuario: "",
  snOnu: "",

  ubicacion: "-16.438490, -71.598208",
  cajaNap: "",
  descripcion: "",
  fotoFachada: "",

  solicitarPago: "SI",
  montoCobrar: "",
  autorOrden: "",
  tecnico: "",
});

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function serializeOrderToSupabase(orderItem = {}, opts = {}) {
  const payload = {
    empresa: String(orderItem.empresa || "").trim(),
    codigo: String(orderItem.codigo || "").trim(),
    generar_usuario: String(orderItem.generarUsuario || "").trim(),
    orden_tipo: String(orderItem.orden || "").trim(),
    tipo_actuacion: String(orderItem.tipoActuacion || "").trim(),
    fecha_actuacion: String(orderItem.fechaActuacion || "").trim() || null,
    hora: String(orderItem.hora || "").trim() || null,
    estado: String(orderItem.estado || "Pendiente").trim(),
    prioridad: String(orderItem.prioridad || "Normal").trim(),
    dni: String(orderItem.dni || "").trim(),
    nombre: String(orderItem.nombre || "").trim(),
    direccion: String(orderItem.direccion || "").trim(),
    celular: String(orderItem.celular || "").trim(),
    email: String(orderItem.email || "").trim(),
    contacto: String(orderItem.contacto || "").trim(),
    velocidad: String(orderItem.velocidad || "").trim(),
    precio_plan: numberOrNull(orderItem.precioPlan),
    nodo: String(orderItem.nodo || "").trim(),
    usuario_nodo: String(orderItem.usuarioNodo || "").trim(),
    password_usuario: String(orderItem.passwordUsuario || "").trim(),
    sn_onu: String(orderItem.snOnu || "").trim(),
    ubicacion: String(orderItem.ubicacion || "").trim(),
    caja_nap: String(orderItem.cajaNap || "").trim(),
    descripcion: String(orderItem.descripcion || "").trim(),
    foto_fachada: String(orderItem.fotoFachada || "").trim(),
    solicitar_pago: String(orderItem.solicitarPago || "SI").trim(),
    monto_cobrar: numberOrNull(orderItem.montoCobrar) ?? 0,
    autor_orden: String(orderItem.autorOrden || opts.autorOrden || "").trim(),
    tecnico: String(orderItem.tecnico || "").trim(),
    fecha_creacion: String(orderItem.fecha_creacion || orderItem.fechaCreacion || "").trim() || new Date().toISOString(),
  };
  return payload;
}

function sanitizeOrderPayloadForSupabase(rawPayload = {}) {
  const allowedKeys = [
    "empresa",
    "codigo",
    "generar_usuario",
    "orden_tipo",
    "tipo_actuacion",
    "fecha_actuacion",
    "hora",
    "estado",
    "prioridad",
    "dni",
    "nombre",
    "direccion",
    "celular",
    "email",
    "contacto",
    "velocidad",
    "precio_plan",
    "nodo",
    "usuario_nodo",
    "password_usuario",
    "sn_onu",
    "ubicacion",
    "caja_nap",
    "descripcion",
    "foto_fachada",
    "solicitar_pago",
    "monto_cobrar",
    "autor_orden",
    "tecnico",
    "fecha_creacion",
  ];
  const clean = {};
  allowedKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(rawPayload || {}, key)) {
      clean[key] = rawPayload[key];
    }
  });
  return clean;
}

function deserializeOrderFromSupabase(row = {}) {
  return {
    id: Number(row.id) || Date.now(),
    empresa: String(row.empresa || "").trim(),
    codigo: String(row.codigo || "").trim(),
    generarUsuario: String(row.generar_usuario || "").trim(),
    orden: String(row.orden_tipo || "").trim(),
    tipoActuacion: String(row.tipo_actuacion || "").trim(),
    fechaActuacion: String(row.fecha_actuacion || "").slice(0, 10),
    hora: String(row.hora || "").slice(0, 5),
    estado: String(row.estado || "Pendiente").trim(),
    prioridad: String(row.prioridad || "Normal").trim(),
    dni: String(row.dni || "").trim(),
    nombre: String(row.nombre || "").trim(),
    direccion: String(row.direccion || "").trim(),
    celular: String(row.celular || "").trim(),
    email: String(row.email || "").trim(),
    contacto: String(row.contacto || "").trim(),
    velocidad: String(row.velocidad || "").trim(),
    precioPlan: row.precio_plan == null ? "" : String(row.precio_plan),
    nodo: String(row.nodo || "").trim(),
    usuarioNodo: String(row.usuario_nodo || "").trim(),
    passwordUsuario: String(row.password_usuario || "").trim(),
    snOnu: String(row.sn_onu || "").trim(),
    ubicacion: String(row.ubicacion || "").trim(),
    cajaNap: String(row.caja_nap || "").trim(),
    descripcion: String(row.descripcion || "").trim(),
    fotoFachada: String(row.foto_fachada || "").trim(),
    solicitarPago: String(row.solicitar_pago || "SI").trim(),
    montoCobrar: row.monto_cobrar == null ? "" : String(row.monto_cobrar),
    autorOrden: String(row.autor_orden || "").trim(),
    tecnico: String(row.tecnico || "").trim(),
    usuarioNodoLiberado:
      row.usuario_nodo_liberado === true ||
      row.usuario_nodo_liberado === 1 ||
      String(row.usuario_nodo_liberado || "").trim().toLowerCase() === "true",
    motivoCancelacion: String(row.motivo_cancelacion || "").trim(),
    canceladoPor: String(row.cancelado_por || "").trim(),
    fechaCancelacion: String(row.fecha_cancelacion || "").trim(),
    fechaCreacion: formatFechaFlexible(row.fecha_creacion || row.created_at || ""),
    fecha_creacion: String(row.fecha_creacion || row.created_at || "").trim(),
  };
}

function deserializeLiquidacionFromSupabase(row = {}) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const equipos = Array.isArray(row?.equipos) ? row.equipos : Array.isArray(payload?.equipos) ? payload.equipos : [];
  const materiales = Array.isArray(row?.materiales)
    ? row.materiales
    : Array.isArray(payload?.materiales)
      ? payload.materiales
      : [];
  const fotos = Array.isArray(row?.fotos) ? row.fotos : Array.isArray(payload?.fotos) ? payload.fotos : [];

  return {
    id: Number(row.id) || Date.now(),
    codigo: String(row.codigo || row.codigo_orden || "").trim(),
    ordenOriginalId: row.orden_original_id ?? null,
    fechaLiquidacion: formatFechaFlexible(row.fecha_liquidacion || row.updated_at || row.created_at || ""),
    fechaLiquidacionISO: (() => {
      const raw = row.fecha_liquidacion || row.updated_at || row.created_at || "";
      if (!raw) return "";
      const d = new Date(raw);
      if (isNaN(d.getTime())) return "";
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    })(),
    tipoActuacion: String(row.tipo_actuacion || "").trim(),
    dni: String(row.dni || "").trim(),
    nombre: String(row.nombre || row.cliente || "").trim(),
    direccion: String(row.direccion || "").trim(),
    celular: String(row.celular || "").trim(),
    nodo: String(row.nodo || "").trim(),
    usuarioNodo: String(row.usuario_nodo || row.user_hotspot || "").trim(),
    passwordUsuario: String(row.password_usuario || "").trim(),
    velocidad: String(row.velocidad || "").trim(),
    precioPlan: row.precio_plan != null ? String(row.precio_plan) : "",
    ubicacion: String(row.ubicacion || "").trim(),
    autorOrden: String(row.autor_orden || row.autor || "").trim(),
    tecnico: String(row.tecnico || "").trim(),
    estado: String(row.estado || "Liquidada").trim(),
    liquidacion: {
      tecnicoLiquida: String(row.tecnico_liquida || row.tecnico || "").trim(),
      resultadoFinal: String(row.resultado_final || row.resultado || "Liquidada").trim(),
      observacionFinal: String(row.observacion_final || row.observacion || "").trim(),
      cobroRealizado: String(row.cobro_realizado || "NO").trim(),
      montoCobrado: row.monto_cobrado ?? row.monto ?? "",
      medioPago: String(row.medio_pago || row.metodo_pago || "").trim(),
      codigoEtiqueta: String(row.codigo_etiqueta || row.cable_rg6_codigo_etiqueta || "").trim(),
      equipos,
      materiales,
      fotos,
    },
  };
}

const initialLiquidacion = {
  tecnicoLiquida: "",
  resultadoFinal: "Completada",
  observacionFinal: "",
  cobroRealizado: "NO",
  montoCobrado: "",
  medioPago: "",
  codigoEtiqueta: "",
  snOnu: "",
  parametro: "",
  actualizarUbicacion: "NO",
  nuevaUbicacion: "",
  cajaNap: "",
  equipos: [],
  equiposRecuperados: [],
  materiales: [],
  fotos: [],
  codigoQRManual: "",
};

const initialLiquidacionRecojo = {
  tecnicoEjecuta: "",
  resultado: "Completada",
  observacion: "",
  equiposRecuperados: [],
  fotos: [],
};

const initialUsuario = {
  nombre: "",
  username: "",
  password: "",
  rol: "Tecnico",
  celular: "",
  email: "",
  empresa: "Americanet",
  activo: true,
  grupo: "",
  accesosMenu: [...(PERMISOS_MENU_POR_ROL_WEB.Tecnico || [])],
  accesosHistorialAppsheet: HISTORIAL_APPSHEET_SUBMENU_ITEMS.map((item) => item.key),
  accesosDiagnosticoServicio: [],
  nodosAcceso: [],
};

const initialEquipoCatalogo = {
  empresa: "Americanet",
  tipo: "ONU",
  marca: "",
  modelo: "",
  codigoQR: "",
  serialMac: "",
  fotoReferencia: "",
  estado: "almacen",
  tecnicoAsignado: "",
};

const initialAsignacionInventario = {
  tecnico: "",
  equipoId: "",
};

function safeIncludes(value, search) {
  return String(value || "").toLowerCase().includes(search);
}

function clienteMergeKey(item = {}) {
  const id = String(item?.id || "")
    .trim()
    .toLowerCase();
  if (id) return `id:${id}`;
  const cod = String(item?.codigoCliente || "")
    .trim()
    .toLowerCase();
  if (cod && cod !== "-") return `cod:${cod}`;
  return "";
}

function normalizarEstadoServicioCliente(raw) {
  const txt = String(raw || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!txt) return "DESCONOCIDO";
  if (txt.includes("activo") || txt.includes("online") || txt.includes("enabled") || txt === "up") return "ACTIVO";
  if (txt.includes("suspend") || txt.includes("cortado") || txt.includes("bloque") || txt.includes("disabled") || txt.includes("moroso") || txt.includes("deuda")) return "SUSPENDIDO";
  if (txt.includes("inactivo") || txt.includes("offline") || txt === "down") return "INACTIVO";
  return "DESCONOCIDO";
}

function estadoAppsheetNormalizado(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "-";
  if (raw.includes("usad") || raw.includes("liquid")) return "liquidado";
  if (raw.includes("dispon") || raw.includes("almacen") || raw.includes("almac")) return "almacen";
  if (raw.includes("asign")) return "asignado";
  return String(value || "").trim();
}

function formatFechaFlexible(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const gviz = raw.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/i);
  if (gviz) {
    const yyyy = Number(gviz[1] || 0);
    const mm = Number(gviz[2] || 0);
    const dd = Number(gviz[3] || 0);
    const hh = Number(gviz[4] || 0);
    const mi = Number(gviz[5] || 0);
    const ss = Number(gviz[6] || 0);
    const d = new Date(yyyy, mm, dd, hh, mi, ss);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("es-PE");
  }
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso.toLocaleString("es-PE");
  return raw;
}

function toTimestampFlexible(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const gviz = raw.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/i);
  if (gviz) {
    const yyyy = Number(gviz[1] || 0);
    const mm = Number(gviz[2] || 0);
    const dd = Number(gviz[3] || 0);
    const hh = Number(gviz[4] || 0);
    const mi = Number(gviz[5] || 0);
    const ss = Number(gviz[6] || 0);
    const d = new Date(yyyy, mm, dd, hh, mi, ss);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmy) {
    const dd = Number(dmy[1] || 0);
    const mm = Number(dmy[2] || 0);
    const yyRaw = Number(dmy[3] || 0);
    const yyyy = yyRaw < 100 ? 2000 + yyRaw : yyRaw;
    const hh = Number(dmy[4] || 0);
    const mi = Number(dmy[5] || 0);
    const ss = Number(dmy[6] || 0);
    const d = new Date(yyyy, Math.max(0, mm - 1), dd, hh, mi, ss);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? 0 : iso.getTime();
}

function normalizarClaveSheet(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function resolverNombreDesdeCodigoTecnico(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const key = raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return HIST_TECNICO_CODE_TO_NAME[key] || raw;
}

function firstText(...values) {
  for (const value of values) {
    const t = String(value || "").trim();
    if (t) return t;
  }
  return "";
}

function normalizarCodigoCatalogo(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function buildAppSheetFileUrlPortal(path = "", tableName = HIST_APPSHEET_SHEET_TAB) {
  const raw = String(path || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(data:image\/|blob:)/i.test(raw)) return raw;
  return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(
    APPSHEET_APP_NAME_PORTAL
  )}&tableName=${encodeURIComponent(tableName)}&fileName=${encodeURIComponent(raw.replace(/^\.?\//, ""))}`;
}

function resolveAppSheetTableName(value = "", fallbackTableName = HIST_APPSHEET_SHEET_TAB) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  const fallback = String(fallbackTableName || HIST_APPSHEET_SHEET_TAB).trim() || HIST_APPSHEET_SHEET_TAB;
  const candidates = [
    HIST_APPSHEET_LIQ_TAB,
    HIST_APPSHEET_SHEET_TAB,
    HIST_APPSHEET_ARTICULOS_TAB,
    CLIENTES_SHEET_TAB,
    "BaseData",
    "DetalleLiquidacion",
    "EXTRACTO",
    "DetalleMovimiento",
  ];
  const prefixMatch = raw.match(/^([^/:\n]+)::/);
  if (prefixMatch) {
    const normalizedPrefix = normalizarClaveSheet(prefixMatch[1]);
    const direct = candidates.find((candidate) => normalizarClaveSheet(candidate) === normalizedPrefix);
    if (direct) return direct;
  }
  const normalizedRaw = normalizarClaveSheet(raw);
  if (normalizedRaw.includes("liquidaciones")) return HIST_APPSHEET_LIQ_TAB;
  if (normalizedRaw.includes("onusregistradas")) return HIST_APPSHEET_SHEET_TAB;
  if (normalizedRaw.includes("articulos")) return HIST_APPSHEET_ARTICULOS_TAB;
  return fallback;
}

function normalizePhotoUrlPortal(value = "", tableName = HIST_APPSHEET_SHEET_TAB) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(data:image\/|blob:)/i.test(raw)) return raw;
  const sanitized = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
  const inferredTableName = resolveAppSheetTableName(sanitized, tableName);
  const withoutPrefix = sanitized.replace(/^[^/:\n]+::/, "");
  const looksLikeFile =
    withoutPrefix.includes("/") || /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|svg|avif)$/i.test(withoutPrefix);
  return looksLikeFile ? buildAppSheetFileUrlPortal(withoutPrefix, inferredTableName) : raw;
}

function toSupabaseDateTime(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // dd/mm/yyyy [hh:mm[:ss]]
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmy) {
    const dd = String(Number(dmy[1] || 0)).padStart(2, "0");
    const mm = String(Number(dmy[2] || 0)).padStart(2, "0");
    const yyRaw = Number(dmy[3] || 0);
    const yyyy = yyRaw < 100 ? 2000 + yyRaw : yyRaw;
    const hh = String(Number(dmy[4] || 0)).padStart(2, "0");
    const mi = String(Number(dmy[5] || 0)).padStart(2, "0");
    const ss = String(Number(dmy[6] || 0)).padStart(2, "0");
    if (dmy[4] !== undefined) return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  // Formato Date(yyyy,m,d,hh,mm,ss)
  const gviz = raw.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/i);
  if (gviz) {
    const yyyy = Number(gviz[1] || 0);
    const mm = Number(gviz[2] || 0) + 1;
    const dd = Number(gviz[3] || 0);
    const hh = Number(gviz[4] || 0);
    const mi = Number(gviz[5] || 0);
    const ss = Number(gviz[6] || 0);
    const pad = (n) => String(n).padStart(2, "0");
    if (gviz[4] !== undefined) return `${yyyy}-${pad(mm)}-${pad(dd)} ${pad(hh)}:${pad(mi)}:${pad(ss)}`;
    return `${yyyy}-${pad(mm)}-${pad(dd)}`;
  }

  const ts = toTimestampFlexible(raw);
  if (ts > 0) return new Date(ts).toISOString();
  return null;
}

function nullIfEmpty(value = "") {
  const raw = String(value ?? "").trim();
  return raw === "" ? null : raw;
}

function normalizeClienteSheetPhotoUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(data:image\/|blob:)/i.test(raw)) return raw;

  const cleaned = raw.replace(/\\/g, "/").replace(/^\.?\//, "");

  // Formato AppSheet: Tabla::ruta/archivo.jpg
  const withTable = cleaned.match(/^([^:\/]+)::(.+)$/);
  if (withTable) {
    const table = String(withTable[1] || "").trim() || "Liquidaciones";
    const filePath = String(withTable[2] || "").trim();
    return buildAppSheetFileUrlPortal(filePath, table);
  }

  // Formato sin prefijo de tabla: Liquidaciones_Images/archivo.jpg
  if (/^Liquidaciones_Images\//i.test(cleaned)) {
    return buildAppSheetFileUrlPortal(cleaned, "Liquidaciones");
  }

  // Fallback general
  return normalizePhotoUrlPortal(cleaned, CLIENTES_SHEET_TAB);
}

function parseGoogleVizRows(rawText = "") {
  const raw = String(rawText || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Respuesta de Google Sheets invalida.");
  const payload = JSON.parse(raw.slice(start, end + 1));
  const cols = Array.isArray(payload?.table?.cols) ? payload.table.cols : [];
  const rows = Array.isArray(payload?.table?.rows) ? payload.table.rows : [];
  const labels = cols.map((c) => String(c?.label || c?.id || "").trim());
  const formatGoogleDate = (value = "") => {
    const raw = String(value || "").trim();
    const m = raw.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/i);
    if (!m) return raw;
    const yyyy = Number(m[1] || 0);
    const mm = Number(m[2] || 0) + 1;
    const dd = Number(m[3] || 0);
    const hh = Number(m[4] || 0);
    const mi = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(dd)}/${pad(mm)}/${yyyy} ${pad(hh)}:${pad(mi)}:${pad(ss)}`.trim();
  };

  return rows.map((r) => {
    const cells = Array.isArray(r?.c) ? r.c : [];
    const item = {};
    labels.forEach((label, i) => {
      const cell = cells[i];
      const formatted = cell?.f;
      const raw = cell?.v ?? "";
      item[label] = String(formatted ?? formatGoogleDate(raw) ?? "").trim();
    });
    return item;
  });
}

function parseGoogleSheetCsvRows(rawText = "") {
  const text = String(rawText || "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  const hasData = row.some((x) => String(x || "").trim() !== "");
  if (hasData) rows.push(row);
  if (!rows.length) return [];

  const headers = (rows[0] || []).map((h) => String(h || "").trim());
  return rows
    .slice(1)
    .filter((r) => r.some((x) => String(x || "").trim() !== ""))
    .map((r) => {
      const item = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        item[h] = String(r[idx] ?? "").trim();
      });
      return item;
    });
}

function getSheetKeyValue(row = {}, ...keys) {
  const idx = new Map(Object.entries(row || {}).map(([k, v]) => [normalizarClaveSheet(k), String(v ?? "").trim()]));
  for (const key of keys) {
    const value = idx.get(normalizarClaveSheet(key));
    if (value) return value;
  }
  return "";
}

function scoreSheetRowsQuality(rows = [], requiredKeys = []) {
  const list = Array.isArray(rows) ? rows : [];
  const required = (requiredKeys || []).map((k) => String(k || "").trim()).filter(Boolean);
  if (!required.length) return list.length;
  return list.reduce((acc, row) => {
    const hasValue = required.some((key) => Boolean(getSheetKeyValue(row, key)));
    return acc + (hasValue ? 1 : 0);
  }, 0);
}

async function fetchGoogleSheetRowsRobust({
  sheetId = "",
  gid = "",
  sheetName = "",
  context = "Google Sheet",
  requiredKeys = [],
}) {
  const id = String(sheetId || "").trim();
  if (!id) throw new Error(`ID inválido para ${context}.`);

  const gidText = String(gid ?? "").trim();
  const sheetText = String(sheetName ?? "").trim();
  const attempts = [];

  const pushAttempt = async (label, url, parser) => {
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const rows = parser(text);
      attempts.push({ label, rows: Array.isArray(rows) ? rows : [], error: null });
    } catch (error) {
      attempts.push({ label, rows: [], error });
    }
  };

  if (gidText) {
    await pushAttempt(
      `csv:gid:${gidText}`,
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${encodeURIComponent(gidText)}`,
      parseGoogleSheetCsvRows
    );
  }

  if (sheetText) {
    await pushAttempt(
      `gviz:sheet:${sheetText}`,
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetText)}`,
      parseGoogleVizRows
    );
  }

  if (gidText) {
    await pushAttempt(
      `gviz:gid:${gidText}`,
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(gidText)}`,
      parseGoogleVizRows
    );
  }

  const successful = attempts.filter((a) => !a.error);
  if (!successful.length) {
    const details = attempts
      .map((a) => `${a.label} -> ${String(a.error?.message || "error desconocido")}`)
      .join(" | ");
    throw new Error(`No se pudo leer ${context}. ${details}`);
  }

  const best = successful.reduce((winner, current) => {
    const winnerQuality = scoreSheetRowsQuality(winner.rows, requiredKeys);
    const currentQuality = scoreSheetRowsQuality(current.rows, requiredKeys);
    if (currentQuality > winnerQuality) return current;
    if (currentQuality < winnerQuality) return winner;
    return current.rows.length > winner.rows.length ? current : winner;
  });

  return best.rows;
}

function esErrorRelacionSupabaseFaltante(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("could not find the table") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("relation") && msg.includes("does not exist")
  );
}

async function fetchSupabaseExactCount(tableName = "") {
  const table = String(tableName || "").trim();
  if (!table) return 0;
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return Number(count || 0);
}

async function fetchHistorialSyncState(sourceKey = "") {
  const source = String(sourceKey || "").trim();
  if (!source) return null;
  const { data, error } = await supabase
    .from(HIST_APPSHEET_SYNC_TABLE)
    .select("source_key,row_count,target_table,synced_at,note")
    .eq("source_key", source)
    .maybeSingle();
  if (error) {
    if (esErrorRelacionSupabaseFaltante(error)) return null;
    throw error;
  }
  return data || null;
}

async function upsertHistorialSyncState(sourceKey = "", payload = {}) {
  const source = String(sourceKey || "").trim();
  if (!source) return;
  const { error } = await supabase.from(HIST_APPSHEET_SYNC_TABLE).upsert(
    [
      {
        source_key: source,
        row_count: Number(payload?.row_count || 0),
        target_table: String(payload?.target_table || "").trim() || null,
        note: String(payload?.note || "").trim() || null,
        synced_at: new Date().toISOString(),
      },
    ],
    { onConflict: "source_key" }
  );
  if (error && !esErrorRelacionSupabaseFaltante(error)) throw error;
}

async function fetchSupabaseRowsPaged({
  tableName = "",
  selectClause = "*",
  orderColumn = "id",
  ascending = false,
  pageSize = 1000,
}) {
  const table = String(tableName || "").trim();
  if (!table) return [];
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectClause)
      .order(orderColumn, { ascending })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseCoords(value) {
  const text = String(value || "").trim();
  if (!text.includes(",")) return null;

  const [latStr, lngStr] = text.split(",").map((x) => x.trim());
  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return [lat, lng];
}

function fechaDentroDeRango(fecha, desde, hasta) {
  if (!fecha) return true;

  const fechaBase = String(fecha).slice(0, 10);

  if (desde && fechaBase < desde) return false;
  if (hasta && fechaBase > hasta) return false;

  return true;
}

function normalizarRolSimple(value) {
  const rol = String(value || "").trim().toLowerCase();
  if (rol.includes("admin")) return "Administrador";
  if (rol.includes("gest")) return "Gestora";
  if (rol.includes("alma")) return "Almacen";
  return "Tecnico";
}

function normalizarRolParaSupabase(value) {
  const rol = String(value || "").trim().toLowerCase();
  if (rol.includes("admin")) return "Administrador";
  if (rol.includes("gest")) return "Gestora";
  if (rol.includes("alma")) return "Almacen";
  return "Tecnico";
}

function usernameDesdeNombre(nombre = "") {
  return String(nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function asegurarCredencialesUsuarios(lista = []) {
  return (Array.isArray(lista) ? lista : []).map((u, idx) => {
    const base = String(u?.username || "").trim();
    const nombreBase = usernameDesdeNombre(u?.nombre || "");
    const username = base || nombreBase || `usuario.${idx + 1}`;
    const password = String(u?.password || "").trim() || "123456";
    return { ...u, username, password };
  });
}

function escHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function imprimirHtmlMismaPestana(html = "") {
  try {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!doc || !win) throw new Error("No se pudo abrir vista de impresion.");
    doc.open();
    doc.write(html);
    doc.close();
    const doPrint = () => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error(err);
      } finally {
        setTimeout(() => {
          try {
            iframe.remove();
          } catch (err) {
            console.error(err);
          }
        }, 1200);
      }
    };
    iframe.onload = doPrint;
    if (doc.readyState === "complete") doPrint();
    return true;
  } catch (err) {
    console.error(err);
    alert("No se pudo abrir la vista de impresion.");
    return false;
  }
}

const markerIcon = L.divIcon({
  html: `<svg width="36" height="48" viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="mg" cx="40%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </radialGradient>
      <filter id="ms">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(29,78,216,0.45)"/>
      </filter>
    </defs>
    <path d="M18 2C9.716 2 3 8.716 3 17c0 11.25 15 29 15 29S33 28.25 33 17C33 8.716 26.284 2 18 2Z" fill="url(#mg)" filter="url(#ms)"/>
    <circle cx="18" cy="17" r="8" fill="rgba(255,255,255,0.2)"/>
    <circle cx="18" cy="15" r="4" fill="white" opacity="0.9"/>
    <rect x="13" y="19" width="10" height="7" rx="1.5" fill="white" opacity="0.85"/>
    <rect x="16" y="23" width="4" height="3" rx="1" fill="url(#mg)"/>
  </svg>`,
  className: "",
  iconSize: [36, 48],
  iconAnchor: [18, 48],
  popupAnchor: [0, -48],
});

function QRScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);

  const [camaras, setCamaras] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [escaneando, setEscaneando] = useState(false);
  const [errorScanner, setErrorScanner] = useState("");

  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader();

    async function cargarCamaras() {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        setCamaras(devices);

        if (devices.length > 0) {
          const trasera =
            devices.find((d) => {
              const label = String(d.label || "").toLowerCase();
              return label.includes("back") || label.includes("rear");
            }) || devices[0];

          setDeviceId(trasera.deviceId);
        }
      } catch (err) {
        console.error(err);
        setErrorScanner("No se pudo acceder a la cámara.");
      }
    }

    cargarCamaras();

    return () => {
      try {
        if (controlsRef.current) controlsRef.current.stop();
        if (readerRef.current) readerRef.current.reset();
      } catch (err) {
        console.error(err);
      }
    };
  }, []);

  const iniciar = async () => {
    if (!deviceId || !videoRef.current || !readerRef.current) {
      setErrorScanner("No hay cámara disponible.");
      return;
    }

    try {
      setErrorScanner("");
      setEscaneando(true);

      controlsRef.current = await readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            const text = result.getText();
            onDetected(text);
            detener();
          }

          if (err && !(err instanceof NotFoundException)) {
            console.error(err);
          }
        }
      );
    } catch (err) {
      console.error(err);
      setErrorScanner("No se pudo iniciar el escáner.");
      setEscaneando(false);
    }
  };

  const detener = () => {
    try {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      if (readerRef.current) {
        readerRef.current.reset();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEscaneando(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "16px",
        background: "#f8fafc",
        marginTop: "14px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <select
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            minWidth: "220px",
          }}
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          {camaras.map((cam) => (
            <option key={cam.deviceId} value={cam.deviceId}>
              {cam.label || `Cámara ${cam.deviceId}`}
            </option>
          ))}
        </select>

        {!escaneando ? (
          <button
            onClick={iniciar}
            style={{
              background: "#1f3a8a",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              padding: "10px 14px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Iniciar cámara
          </button>
        ) : (
          <button
            onClick={detener}
            style={{
              background: "#b91c1c",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              padding: "10px 14px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Detener
          </button>
        )}

        <button
          onClick={() => {
            detener();
            onClose?.();
          }}
          style={{
            background: "#fff",
            color: "#111827",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Cerrar
        </button>
      </div>

      <div
        style={{
          borderRadius: "14px",
          overflow: "hidden",
          background: "#000",
          minHeight: "280px",
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: "100%",
            maxHeight: "420px",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>

      {errorScanner && (
        <div style={{ marginTop: "10px", color: "#b91c1c", fontSize: "14px" }}>
          {errorScanner}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [orden, setOrden] = useState(buildInitialOrder());
  const [ordenEditandoId, setOrdenEditandoId] = useState(null);
  const [buscandoDni, setBuscandoDni] = useState(false);
  const [fotosClienteDni, setFotosClienteDni] = useState([]);
  const [enviarWhatsappOrden, setEnviarWhatsappOrden] = useState(true);
  const [vistaActiva, setVistaActiva] = useState("crear");
  const [historialAppsheetSubmenu, setHistorialAppsheetSubmenu] = useState("equipos");
  const [historialAppsheetEquipos, setHistorialAppsheetEquipos] = useState([]);
  const [historialAppsheetLiquidaciones, setHistorialAppsheetLiquidaciones] = useState([]);
  const [historialAppsheetLoading, setHistorialAppsheetLoading] = useState(false);
  const [historialAppsheetError, setHistorialAppsheetError] = useState("");
  const [historialAppsheetInfo, setHistorialAppsheetInfo] = useState("");
  const [historialAppsheetBusqueda, setHistorialAppsheetBusqueda] = useState("");
  const [historialAppsheetDetalle, setHistorialAppsheetDetalle] = useState(null);
  const [historialColsModalOpen, setHistorialColsModalOpen] = useState(false);
  const [historialAppsheetFiltroDraft, setHistorialAppsheetFiltroDraft] = useState({
    desde: "",
    hasta: "",
    tecnico: "TODOS",
    estado: "TODOS",
  });
  const [historialAppsheetFiltro, setHistorialAppsheetFiltro] = useState({
    desde: "",
    hasta: "",
    tecnico: "TODOS",
    estado: "TODOS",
  });
  const [historialAppsheetPagina, setHistorialAppsheetPagina] = useState(1);
  const [historialAppsheetLiqBusqueda, setHistorialAppsheetLiqBusqueda] = useState("");
  const [historialAppsheetLiqPagina, setHistorialAppsheetLiqPagina] = useState(1);
  const [historialAppsheetLiqDetalle, setHistorialAppsheetLiqDetalle] = useState(null);
  const [historialAppsheetLiqMaterialesTarget, setHistorialAppsheetLiqMaterialesTarget] = useState(null);
  const [historialAppsheetDetLiq, setHistorialAppsheetDetLiq] = useState([]);
  const [historialAppsheetDetLiqBusqueda, setHistorialAppsheetDetLiqBusqueda] = useState("");
  const [historialAppsheetDetLiqPagina, setHistorialAppsheetDetLiqPagina] = useState(1);
  const [historialAppsheetArticulos, setHistorialAppsheetArticulos] = useState([]);
  const [historialAppsheetArtBusqueda, setHistorialAppsheetArtBusqueda] = useState("");
  const [historialAppsheetArtPagina, setHistorialAppsheetArtPagina] = useState(1);
  const [historialAppsheetExtracto, setHistorialAppsheetExtracto] = useState([]);
  const [historialAppsheetExtractoBusqueda, setHistorialAppsheetExtractoBusqueda] = useState("");
  const [historialAppsheetMovimientos, setHistorialAppsheetMovimientos] = useState([]);
  const [historialAppsheetMovimientosBusqueda, setHistorialAppsheetMovimientosBusqueda] = useState("");
  const [baseDataOrdenesRows, setBaseDataOrdenesRows] = useState([]);
  const [baseDataOrdenDetalle, setBaseDataOrdenDetalle] = useState(null);
  const [baseDataOrdenesBusqueda, setBaseDataOrdenesBusqueda] = useState("");
  const [baseDataColsModalOpen, setBaseDataColsModalOpen] = useState(false);
  const [baseDataColumnasVisibles, setBaseDataColumnasVisibles] = useState({});
  const [baseDataOrdenesPagina, setBaseDataOrdenesPagina] = useState(1);
  const [baseDataOrdenesFiltro, setBaseDataOrdenesFiltro] = useState({
    desde: "",
    hasta: "",
    nodo: "TODOS",
    empresa: "TODOS",
  });
  const [historialAppsheetPdfFiltro, setHistorialAppsheetPdfFiltro] = useState({
    desde: "",
    hasta: "",
    tecnico: "TODOS",
  });
  const [historialPdfMovFiltro, setHistorialPdfMovFiltro] = useState({
    desde: "",
    hasta: "",
    tipo: "TODOS",
    tecnico: "TODOS",
    responsable: "TODOS",
    query: "",
  });
  const [diagnosticoServicioDni, setDiagnosticoServicioDni] = useState("");
  const [diagnosticoServicioModo, setDiagnosticoServicioModo] = useState("dni");
  const [diagnosticoServicioManualUser, setDiagnosticoServicioManualUser] = useState("");
  const [diagnosticoServicioManualNodo, setDiagnosticoServicioManualNodo] = useState("Nod_01");
  const [diagnosticoServicioConsulta, setDiagnosticoServicioConsulta] = useState("");
  const [diagnosticoServicioLoading, setDiagnosticoServicioLoading] = useState(false);
  const [diagnosticoServicioError, setDiagnosticoServicioError] = useState("");
  const [diagnosticoServicioResultado, setDiagnosticoServicioResultado] = useState(null);
  const [diagnosticoSuspensionManualNodo, setDiagnosticoSuspensionManualNodo] = useState("Nod_01");
  const [diagnosticoSuspensionManualUser, setDiagnosticoSuspensionManualUser] = useState("");
  const [diagnosticoSuspensionManualLoading, setDiagnosticoSuspensionManualLoading] = useState("");
  const [diagnosticoSuspensionManualInfo, setDiagnosticoSuspensionManualInfo] = useState("");
  const [diagnosticoSuspensionManualError, setDiagnosticoSuspensionManualError] = useState("");
  const [historialAppsheetLiqFiltro, setHistorialAppsheetLiqFiltro] = useState({
    desde: "",
    hasta: "",
    nodo: "TODOS",
    tecnico: "TODOS",
    actuacion: "TODOS",
  });
  const [historialColumnasVisibles, setHistorialColumnasVisibles] = useState({
    id_onu: true,
    producto: true,
    estado: true,
    tecnico_asignado: true,
    fecha_registro: true,
    nodo: true,
    nombre_cliente: true,
    dni: true,
    empresa: true,
    marca: false,
    modelo: false,
    precio_unitario: false,
    usuario_pppoe: false,
    liquidado_por: false,
    fecha_liquidacion: false,
    fecha_asignacion: false,
    foto_etiqueta: false,
    foto_producto: false,
    foto02: false,
  });

  const readLocalJson = useCallback((key, fallback = []) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (err) {
      console.warn(`No se pudo leer localStorage[${key}]`, err);
      return fallback;
    }
  }, []);

  const [ordenes, setOrdenes] = useState(() => readLocalJson("ordenes", []));
  const [usuariosNodoBloqueados, setUsuariosNodoBloqueados] = useState(() =>
    readLocalJson("usuariosNodoBloqueados", [])
  );
  const [usuariosNodoHabilitadosManual, setUsuariosNodoHabilitadosManual] = useState(() =>
    readLocalJson("usuariosNodoHabilitadosManual", [])
  );

  const [liquidaciones, setLiquidaciones] = useState(() => readLocalJson("liquidaciones", []));

  const [usuarios, setUsuarios] = useState([]);

  const [clientes, setClientes] = useState(() => {
    const guardados = readLocalJson("clientes", []);
    return guardados ? asegurarCredencialesUsuarios(guardados) : [];
  });

  const [equiposCatalogo, setEquiposCatalogo] = useState(() => {
    const guardados = readLocalJson("equiposCatalogo", []);
    return guardados ? asegurarCredencialesUsuarios(guardados) : [];
  });

  const [usuarioForm, setUsuarioForm] = useState(initialUsuario);
  const [usuarioEditandoId, setUsuarioEditandoId] = useState(null);
  const [usuariosPanelTab, setUsuariosPanelTab] = useState("personal");
  const [busquedaUsuarios, setBusquedaUsuarios] = useState("");
  const [busquedaClientes, setBusquedaClientes] = useState("");
  const [busquedaClientesDraft, setBusquedaClientesDraft] = useState("");
  const [filtroEstadoCliente, setFiltroEstadoCliente] = useState("TODOS");
  const [actualizarEstadoMasivoLoading, setActualizarEstadoMasivoLoading] = useState(false);
  const [actualizarEstadoMasivoProgreso, setActualizarEstadoMasivoProgreso] = useState(null);
  const [clientesPagina, setClientesPagina] = useState(1);
  const [usuariosSupabaseReady, setUsuariosSupabaseReady] = useState(false);
  const [usuariosSupabaseSaving, setUsuariosSupabaseSaving] = useState(false);
  const [mikrotikRoutersConfig, setMikrotikRoutersConfig] = useState(() => mergeMikrotikRoutersWithDefaults());
  const [mikrotikNodoRouterConfig, setMikrotikNodoRouterConfig] = useState(() => mergeMikrotikNodoRouterWithDefaults());
  const [mikrotikConfigLoading, setMikrotikConfigLoading] = useState(false);
  const [mikrotikConfigSaving, setMikrotikConfigSaving] = useState(false);
  const [mikrotikConfigInfo, setMikrotikConfigInfo] = useState("");
  const [mikrotikConfigError, setMikrotikConfigError] = useState("");
  const [clientesSyncLoading, setClientesSyncLoading] = useState(false);
  const [clientesSyncInfo, setClientesSyncInfo] = useState("");
  const [clientesSyncError, setClientesSyncError] = useState("");
  const [importCsvLoading, setImportCsvLoading] = useState(false);
  const [importCsvInfo, setImportCsvInfo] = useState("");
  const [clientesSupabaseReady, setClientesSupabaseReady] = useState(false);
  const [clientesSupabaseSaving, setClientesSupabaseSaving] = useState(false);
  const [ordenesSupabaseReady, setOrdenesSupabaseReady] = useState(false);
  const [ordenesSyncError, setOrdenesSyncError] = useState("");
  const [usuarioNodoAccionMsg, setUsuarioNodoAccionMsg] = useState("");
  const [showUsuarioDropdown, setShowUsuarioDropdown] = useState(false);
  const clientesHydratingRef = useRef(false);
  const clientesSyncTimerRef = useRef(null);
  const clientesSavePromiseRef = useRef(null);
  const usuariosHydratingRef = useRef(false);
  const usuariosSyncTimerRef = useRef(null);

  // ── Helper de logs ──────────────────────────────────────────
  const escribirLog = ({ accion, categoria, criticidad = "normal", tabla = null, registro_id = null, detalle = {}, actor = null }) => {
    if (!isSupabaseConfigured) return;
    supabase.from("logs").insert([{
      accion,
      categoria,
      criticidad,
      tabla,
      registro_id: registro_id ? String(registro_id) : null,
      detalle,
      usuario: actor?.nombre || "desconocido",
      rol: actor?.rol || null,
      empresa: actor?.empresa || null,
      dispositivo: "web",
    }]).then(({ error }) => {
      if (error) console.error("[escribirLog] Error al insertar log:", error.message, { accion, actor });
    });
  };
  // ────────────────────────────────────────────────────────────

  const [ordenEnLiquidacion, setOrdenEnLiquidacion] = useState(null);
  const [ordenDetalle, setOrdenDetalle] = useState(null);
  const [fotosOrdenDetalle, setFotosOrdenDetalle] = useState([]);
  const [liquidacion, setLiquidacion] = useState(initialLiquidacion);
  const [etiquetaFiltro, setEtiquetaFiltro] = useState("");
  const [showEtiquetaDropdown, setShowEtiquetaDropdown] = useState(false);
  const [etiquetaFiltroEdit, setEtiquetaFiltroEdit] = useState("");
  const [showEtiquetaDropdownEdit, setShowEtiquetaDropdownEdit] = useState(false);
  const [liquidacionGuardando, setLiquidacionGuardando] = useState(false);
  const [busquedaEqInv, setBusquedaEqInv] = useState("");
  const [liquidacionRecojo, setLiquidacionRecojo] = useState(initialLiquidacionRecojo);
  const [historialRecuperaciones, setHistorialRecuperaciones] = useState([]);
  const [cargandoRecuperaciones, setCargandoRecuperaciones] = useState(false);
  const [stockTecnico, setStockTecnico] = useState([]);
  const [cargandoStockTecnico, setCargandoStockTecnico] = useState(false);
  const [recuperacionesSubmenu, setRecuperacionesSubmenu] = useState("ejecuciones");
  const [ingresandoStockId, setIngresandoStockId] = useState(null);
  const [observacionIngreso, setObservacionIngreso] = useState("");
  const [fotoRecepcion, setFotoRecepcion] = useState("");
  const [scannerRecojoIdx, setScannerRecojoIdx] = useState(null);
  const [scannerLiqRecIdx, setScannerLiqRecIdx] = useState(null);
  const [liberandoCatalogoId, setLiberandoCatalogoId] = useState(null);
  const [liberandoCatalogoEstado, setLiberandoCatalogoEstado] = useState("disponible");
  const [vinculandoSerialId, setVinculandoSerialId] = useState(null);
  const [vinculandoSerialValor, setVinculandoSerialValor] = useState("");
  const [filtroHistorialBusqueda, setFiltroHistorialBusqueda] = useState("");
  const [filtroHistorialNodo, setFiltroHistorialNodo] = useState("TODOS");
  const [filtroHistorialCatalogado, setFiltroHistorialCatalogado] = useState("TODOS");

  const [liquidacionSeleccionada, setLiquidacionSeleccionada] = useState(null);
  const [liquidacionEditandoId, setLiquidacionEditandoId] = useState(null);
  const [detalleLiquidacionTab, setDetalleLiquidacionTab] = useState("orden");

  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [clienteDiagnosticoRapido, setClienteDiagnosticoRapido] = useState(null);
  const [clienteDiagnosticoRapidoLoading, setClienteDiagnosticoRapidoLoading] = useState(false);
  const [clienteDiagnosticoRapidoError, setClienteDiagnosticoRapidoError] = useState("");
  const [clienteDiagnosticoRapidoResultado, setClienteDiagnosticoRapidoResultado] = useState(null);
  const [clienteMikrotikAccionLoading, setClienteMikrotikAccionLoading] = useState("");
  const [clienteMikrotikAccionInfo, setClienteMikrotikAccionInfo] = useState("");
  const [clienteSenal, setClienteSenal] = useState(null);      // { rxOnuDbm, oltRxOntDbm, estado, fecha }
  const [clienteSenalLoading, setClienteSenalLoading] = useState(false);
  const [clienteSenalError, setClienteSenalError] = useState("");
  const [modalEditarCliente, setModalEditarCliente] = useState(false);
  const [formEditarCliente, setFormEditarCliente] = useState({});
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [fotoZoomSrc, setFotoZoomSrc] = useState("");
  const [fotoZoomTitulo, setFotoZoomTitulo] = useState("");
  const [fotoZoomEscala, setFotoZoomEscala] = useState(1);

  const [busquedaPendientes, setBusquedaPendientes] = useState("");
  const [filtroTecnico, setFiltroTecnico] = useState("TODOS");
  const [filtroTipoOrden, setFiltroTipoOrden] = useState("TODOS");
  const [calendarioFecha, setCalendarioFecha] = useState(() => todayIsoLocal());
  const [calendarioMes, setCalendarioMes] = useState(() => todayIsoLocal().slice(0, 7));
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const [busquedaHistorial, setBusquedaHistorial] = useState("");
  const [histFiltroNodo, setHistFiltroNodo] = useState("TODOS");
  const [histFiltroTipo, setHistFiltroTipo] = useState("TODOS");
  const [histFiltroDesde, setHistFiltroDesde] = useState(() => new Date().toISOString().slice(0, 10));
  const [histFiltroHasta, setHistFiltroHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [usuarioSesionId, setUsuarioSesionId] = useState(() => {
    const guardado = localStorage.getItem("usuarioSesionId");
    return guardado ? Number(guardado) : null;
  });
  const [sessionIdleMinutes, setSessionIdleMinutes] = useState(() => {
    const guardado = Number(localStorage.getItem("sessionIdleMinutes") || 30);
    return Number.isFinite(guardado) ? guardado : 30;
  });
  const [mostrarMenuSesion, setMostrarMenuSesion] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [cambioClaveForm, setCambioClaveForm] = useState({ actual: "", nueva: "", confirmar: "" });

  const [reporteDesde, setReporteDesde] = useState("");
  const [reporteHasta, setReporteHasta] = useState("");
  const [reporteNodo, setReporteNodo] = useState("TODOS");
  const [reporteTecnico, setReporteTecnico] = useState("TODOS");
  const [reporteTipo, setReporteTipo] = useState("TODOS");
  const [reporteBusqueda, setReporteBusqueda] = useState("");
  const [reportePaginaAct, setReportePaginaAct] = useState(1);
  const [reportePaginaMat, setReportePaginaMat] = useState(1);
  const [credencialesLogin, setCredencialesLogin] = useState({ username: "", password: "" });
  const [errorLogin, setErrorLogin] = useState("");

  const [fechaMapaDesde, setFechaMapaDesde] = useState("");
  const [fechaMapaHasta, setFechaMapaHasta] = useState("");

  const [equipoForm, setEquipoForm] = useState(initialEquipoCatalogo);
  const [equipoEditandoId, setEquipoEditandoId] = useState(null);
  const [busquedaEquipos, setBusquedaEquipos] = useState("");
  const [asignacionInventario, setAsignacionInventario] = useState(initialAsignacionInventario);
  const [mostrarScannerLiquidacion, setMostrarScannerLiquidacion] = useState(false);
  const [mostrarScannerInventario, setMostrarScannerInventario] = useState(false);

  const [napCajasMapData, setNapCajasMapData] = useState([]);
  const [napCajasNearby, setNapCajasNearby] = useState([]);
  const [napCajasTop20, setNapCajasTop20] = useState([]);
  const [napRoutes, setNapRoutes] = useState({});

  const mapaRef = useRef(null);
  const mapaInstanciaRef = useRef(null);
  const mapaMarkersRef = useRef([]);
  const mapaCrearRef = useRef(null);
  const mapaCrearInstanceRef = useRef(null);
  const mapaCrearMarkerRef = useRef(null);
  const napMarkersCrearRef = useRef([]);
  const napRouteLayersRef = useRef([]);
  const cajaNapDesdClienteRef = useRef(false); // true cuando cajaNap fue cargada del cliente — evita auto-asignar la más cercana
  const usuarioFormRef = useRef(null);
  const contentWrapRef = useRef(null);
  const sessionMenuRef = useRef(null);
  const sessionIdleTimeoutRef = useRef(null);

  const mostrarMontoCobrar = orden.solicitarPago === "SI";
  const mostrarCamposPlan =
    orden.tipoActuacion === "Instalacion Internet" ||
    orden.tipoActuacion === "Instalacion Internet y Cable";
  const mostrarCamposUsuario = orden.generarUsuario === "SI";
  const hasText = (v) => Boolean(String(v || "").trim());
  const checklistCrearOrden = [
    // Paso 1: Datos de la orden
    { key: "empresa", ok: hasText(orden.empresa), label: "Empresa" },
    { key: "codigo", ok: hasText(orden.codigo), label: "Código" },
    { key: "generarUsuario", ok: hasText(orden.generarUsuario), label: "Generar usuario" },
    { key: "orden", ok: hasText(orden.orden), label: "Orden" },
    { key: "tipoActuacion", ok: hasText(orden.tipoActuacion), label: "Tipo actuación" },
    { key: "fechaActuacion", ok: hasText(orden.fechaActuacion), label: "Fecha" },
    { key: "hora", ok: hasText(orden.hora), label: "Hora" },
    { key: "prioridad", ok: hasText(orden.prioridad), label: "Prioridad" },

    // Paso 2: Datos del cliente (email y contacto NO cuentan)
    { key: "dni", ok: hasText(orden.dni), label: "DNI" },
    { key: "nombre", ok: hasText(orden.nombre), label: "Cliente" },
    { key: "direccion", ok: hasText(orden.direccion), label: "Dirección" },
    { key: "celular", ok: hasText(orden.celular), label: "Celular" },

    // Paso 3: Servicio
    ...(mostrarCamposPlan
      ? [
          { key: "velocidad", ok: hasText(orden.velocidad), label: "Velocidad" },
          { key: "precioPlan", ok: hasText(orden.precioPlan), label: "Precio plan" },
        ]
      : []),
    ...(mostrarCamposUsuario
      ? [
          { key: "nodo", ok: hasText(orden.nodo), label: "Nodo" },
          { key: "usuarioNodo", ok: hasText(orden.usuarioNodo), label: "Usuario" },
          { key: "passwordUsuario", ok: hasText(orden.passwordUsuario), label: "Contraseña" },
        ]
      : []),

    // Paso 4: Ubicación y observaciones
    { key: "ubicacion", ok: hasText(orden.ubicacion), label: "Ubicación" },
    { key: "descripcion", ok: hasText(orden.descripcion), label: "Descripción" },

    // Paso 5: Cobranza y asignación
    { key: "solicitarPago", ok: hasText(orden.solicitarPago), label: "Solicitar pago" },
    ...(mostrarMontoCobrar ? [{ key: "montoCobrar", ok: hasText(orden.montoCobrar), label: "Monto cobrar" }] : []),
    { key: "autorOrden", ok: hasText(orden.autorOrden), label: "Autor orden" },
    { key: "tecnico", ok: hasText(orden.tecnico), label: "Técnico" },
  ];
  const totalChecklistCrear = checklistCrearOrden.length;
  const completadosChecklistCrear = checklistCrearOrden.filter((x) => x.ok).length;
  const porcentajeChecklistCrear = Math.round((completadosChecklistCrear / totalChecklistCrear) * 100);

  useEffect(() => {
    try { localStorage.setItem("ordenes", JSON.stringify(ordenes)); } catch (e) { console.warn("localStorage quota: ordenes", e); }
  }, [ordenes]);

  useEffect(() => {
    try { localStorage.setItem("usuariosNodoBloqueados", JSON.stringify(usuariosNodoBloqueados)); } catch (e) { console.warn("localStorage quota: usuariosNodoBloqueados", e); }
  }, [usuariosNodoBloqueados]);

  useEffect(() => {
    try { localStorage.setItem("usuariosNodoHabilitadosManual", JSON.stringify(usuariosNodoHabilitadosManual)); } catch (e) { console.warn("localStorage quota: usuariosNodoHabilitadosManual", e); }
  }, [usuariosNodoHabilitadosManual]);

  useEffect(() => {
    try { localStorage.setItem("liquidaciones", JSON.stringify(liquidaciones)); } catch (e) { console.warn("localStorage quota: liquidaciones", e); }
  }, [liquidaciones]);

  // Usuarios siempre desde Supabase — no persistir en localStorage

  useEffect(() => {
    localStorage.removeItem("usuarios");
    void cargarUsuariosDesdeSupabase({ silent: true });
  }, []);

  useEffect(() => {
    void cargarMikrotikConfigDesdeSupabase({ silent: true });
  }, []);

  useEffect(() => {
    void cargarOrdenesDesdeSupabase({ silent: true });
  }, []);

  useEffect(() => {
    void cargarEquiposCatalogoDesdeSupabase();
  }, []);

  useEffect(() => {
    void cargarLiquidacionesDesdeSupabase({ silent: true });
  }, []);

  // Sync automático deshabilitado — guardado explícito en guardarUsuario/eliminarUsuario/cambiarEstadoUsuario

  useEffect(() => {
    try { localStorage.setItem("usuarioSesionId", String(usuarioSesionId || "")); } catch (e) { console.warn("localStorage quota: usuarioSesionId", e); }
  }, [usuarioSesionId]);

  useEffect(() => {
    try { localStorage.setItem("sessionIdleMinutes", String(sessionIdleMinutes)); } catch (e) { console.warn("localStorage quota: sessionIdleMinutes", e); }
  }, [sessionIdleMinutes]);

  useEffect(() => {
    try { localStorage.setItem("clientes", JSON.stringify(clientes)); } catch (e) { console.warn("localStorage quota: clientes", e); }
  }, [clientes]);

  useEffect(() => {
    void cargarClientesDesdeSupabase({ silent: true });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!clientesSupabaseReady) return;
    if (clientesHydratingRef.current) return;
    if (clientesSupabaseSaving) return;
    if (clientesSyncTimerRef.current) clearTimeout(clientesSyncTimerRef.current);
    clientesSyncTimerRef.current = setTimeout(() => {
      void guardarClientesEnSupabase(clientes).catch((e) => {
        console.error("Error sincronizando clientes en Supabase:", e);
      });
    }, 5000);
    return () => {
      if (clientesSyncTimerRef.current) clearTimeout(clientesSyncTimerRef.current);
    };
  }, [clientes, clientesSupabaseReady, clientesSupabaseSaving]);

  useEffect(() => {
    try {
      localStorage.setItem("equiposCatalogo", JSON.stringify(equiposCatalogo));
    } catch (e) {
      // QuotaExceededError: el catalogo es demasiado grande para localStorage, ignorar
      console.warn("localStorage quota exceeded para equiposCatalogo, se omite cache local.", e);
    }
  }, [equiposCatalogo]);

  useEffect(() => {
    if (!mostrarMontoCobrar && orden.montoCobrar !== "") {
      setOrden((prev) => ({ ...prev, montoCobrar: "" }));
    }
  }, [mostrarMontoCobrar, orden.montoCobrar]);

  useEffect(() => {
    if (!mostrarCamposPlan && (orden.velocidad || orden.precioPlan)) {
      setOrden((prev) => ({
        ...prev,
        velocidad: "",
        precioPlan: "",
      }));
    }
  }, [mostrarCamposPlan, orden.velocidad, orden.precioPlan]);

  useEffect(() => {
    if (!mostrarCamposUsuario && (orden.nodo || orden.usuarioNodo || orden.passwordUsuario)) {
      setOrden((prev) => ({
        ...prev,
        nodo: "",
        usuarioNodo: "",
        passwordUsuario: "",
      }));
    }
  }, [mostrarCamposUsuario, orden.nodo, orden.usuarioNodo, orden.passwordUsuario]);

  useEffect(() => {
    if (reporteDesde || reporteHasta) return;
    const hoy = new Date();
    const hace30 = new Date();
    hace30.setDate(hoy.getDate() - 30);
    const toYmd = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };
    setReporteDesde(toYmd(hace30));
    setReporteHasta(toYmd(hoy));
  }, [reporteDesde, reporteHasta]);

  useEffect(() => {
    setUsuarios((prev) => {
      const asegurados = asegurarCredencialesUsuarios(prev).map(normalizarUsuarioConPermisos);
      return JSON.stringify(prev) === JSON.stringify(asegurados) ? prev : asegurados;
    });
  }, []);

  const tecnicosActivos = useMemo(() => {
    return usuarios
      .filter((u) => u.rol === "Tecnico" && u.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [usuarios]);

  const usuariosActivos = useMemo(() => usuarios.filter((u) => u.activo), [usuarios]);

  const usuarioSesion = useMemo(() => {
    if (!usuarioSesionId) return null;
    return usuariosActivos.find((u) => Number(u.id) === Number(usuarioSesionId)) || null;
  }, [usuariosActivos, usuarioSesionId]);

  const rolSesion = useMemo(() => normalizarRolSimple(usuarioSesion?.rol), [usuarioSesion]);
  const esAdminSesion = rolSesion === "Administrador";
  const esGestorSesion = rolSesion === "Gestora";
  const esAlmacenSesion = rolSesion === "Almacen";
  const accesosSesion = useMemo(() => {
    const base = normalizarAccesosMenuWeb(usuarioSesion?.accesosMenu ?? usuarioSesion?.accesos_menu, usuarioSesion?.rol);
    if (rolSesion !== "Administrador") return base;
    if (base.includes("almacenes")) return base;
    return [...base, "almacenes"];
  }, [rolSesion, usuarioSesion]);
  const accesosHistorialAppsheetSesion = useMemo(
    () =>
      normalizarAccesosHistorialAppsheetWeb(
        usuarioSesion?.accesosHistorialAppsheet ?? usuarioSesion?.accesos_historial_appsheet ?? usuarioSesion?.accesosMenu ?? usuarioSesion?.accesos_menu,
        usuarioSesion?.rol
      ),
    [usuarioSesion]
  );
  const accesosDiagnosticoServicioSesion = useMemo(
    () =>
      normalizarAccesosDiagnosticoServicioWeb(
        usuarioSesion?.accesosDiagnosticoServicio ??
          usuarioSesion?.accesos_diagnostico_servicio ??
          usuarioSesion?.accesosMenu ??
          usuarioSesion?.accesos_menu,
        usuarioSesion?.rol,
        usuarioSesion?.accesosMenu ?? usuarioSesion?.accesos_menu
      ),
    [usuarioSesion]
  );
  const puedeVerUsuarios = accesosSesion.includes("usuarios");
  const puedeVerReportes = accesosSesion.includes("reportes");
  const puedeVerPlantaExterna = accesosSesion.includes("plantaExterna");
  const puedeDiagnosticoPorDni = accesosDiagnosticoServicioSesion.includes("dni");
  const puedeDiagnosticoConsultaDirecta = accesosDiagnosticoServicioSesion.includes("consultaDirecta");
  const puedeDiagnosticoSuspensionManual = accesosDiagnosticoServicioSesion.includes("suspensionManual");
  const diagnosticoServicioModosDisponibles = useMemo(() => {
    const modos = [];
    if (puedeDiagnosticoPorDni) modos.push("dni");
    if (puedeDiagnosticoConsultaDirecta) modos.push("manual");
    return modos;
  }, [puedeDiagnosticoPorDni, puedeDiagnosticoConsultaDirecta]);
  const puedeLiquidarOrden = esAdminSesion || esGestorSesion || rolSesion === "Tecnico";
  const puedeEditarLiquidacion = esAdminSesion || esGestorSesion;
  const puedeEliminarLiquidacion = esAdminSesion || esGestorSesion;
  const puedeEliminarOrden = esAdminSesion;
  const puedeCancelarOrden = esAdminSesion || esGestorSesion;
  const nodosAccesoGestoraSesion = useMemo(() => {
    if (!esGestorSesion) return [];
    return normalizarNodosAccesoWeb(usuarioSesion?.nodosAcceso ?? usuarioSesion?.nodos_acceso);
  }, [esGestorSesion, usuarioSesion]);
  const nodosAccesoGestoraSet = useMemo(
    () => new Set(nodosAccesoGestoraSesion.map((nodo) => normalizeNodoKey(nodo))),
    [nodosAccesoGestoraSesion]
  );
  const historialAppsheetSubmenuItemsPermitidos = useMemo(
    () => {
      const permitidos = new Set(accesosHistorialAppsheetSesion);
      return HISTORIAL_APPSHEET_SUBMENU_ITEMS.filter(
        (item) => permitidos.has(item.key) && (esGestorSesion ? item.gestoraVisible : true)
      );
    },
    [accesosHistorialAppsheetSesion, esGestorSesion]
  );
  const historialAppsheetSubmenuKeysPermitidos = useMemo(
    () => historialAppsheetSubmenuItemsPermitidos.map((item) => item.key),
    [historialAppsheetSubmenuItemsPermitidos]
  );
  const historialAppsheetSubmenuActual = useMemo(
    () =>
      historialAppsheetSubmenuItemsPermitidos.find((item) => item.key === historialAppsheetSubmenu) ||
      historialAppsheetSubmenuItemsPermitidos[0] ||
      null,
    [historialAppsheetSubmenu, historialAppsheetSubmenuItemsPermitidos]
  );
  const tieneAccesoNodoSesion = useCallback(
    (rawNodo = "") => {
      if (!esGestorSesion) return true;
      // Sin nodos asignados → sin restricción (ver todo)
      if (!nodosAccesoGestoraSet.size) return true;
      const nodoNormalizado = normalizeNodoKey(rawNodo);
      // Item sin nodo → visible para todas las gestoras
      if (!nodoNormalizado) return true;
      return nodosAccesoGestoraSet.has(nodoNormalizado);
    },
    [esGestorSesion, nodosAccesoGestoraSet]
  );
  const tieneAccesoNodoHistorialAppsheet = tieneAccesoNodoSesion;

  const gestoresActivos = useMemo(() => {
    return usuarios.filter((u) => normalizarRolSimple(u.rol) === "Gestora" && u.activo);
  }, [usuarios]);

  const autoresOrdenActivos = useMemo(() => {
    return usuarios.filter((u) => normalizarRolSimple(u.rol) === "Gestora" && u.activo);
  }, [usuarios]);

  const etiquetasUsadas = useMemo(() =>
    new Set((clientes || []).map(c => String(c.codigoEtiqueta || c.codigo_etiqueta || "").trim()).filter(Boolean)),
    [clientes]
  );
  const todasEtiquetas = useMemo(() =>
    Array.from({ length: 2000 }, (_, i) => "05" + String(i + 1).padStart(4, "0")),
    []
  );
  const etiquetasDisponibles = useMemo(() =>
    todasEtiquetas.filter(e => !etiquetasUsadas.has(e)),
    [todasEtiquetas, etiquetasUsadas]
  );

  const usuariosNodoUsados = useMemo(() => {
    const fromOrdenes = (Array.isArray(ordenes) ? ordenes : [])
      .filter((o) => {
        const estado = String(o?.estado || "").trim().toLowerCase();
        const liberado =
          o?.usuarioNodoLiberado === true ||
          String(o?.usuarioNodoLiberado || "").trim().toLowerCase() === "true";
        return !(estado.includes("cancel") && liberado);
      })
      .map((o) => String(o?.usuarioNodo || "").trim());
    const fromClientes = (Array.isArray(clientes) ? clientes : []).map((c) => String(c?.usuarioNodo || "").trim());
    const fromBloqueados = (Array.isArray(usuariosNodoBloqueados) ? usuariosNodoBloqueados : []).map((x) => String(x || "").trim());
    return Array.from(new Set([...fromOrdenes, ...fromClientes, ...fromBloqueados].filter(Boolean)));
  }, [ordenes, clientes, usuariosNodoBloqueados]);

  const usuariosDisponiblesNodo = useMemo(
    () => listarUsuariosDisponiblesParaNodo(orden.nodo, usuariosNodoUsados, usuariosNodoHabilitadosManual, 10),
    [orden.nodo, usuariosNodoUsados, usuariosNodoHabilitadosManual]
  );

  const usuarioNodoOcupado = useMemo(() => {
    const u = String(orden.usuarioNodo || "").trim().toLowerCase();
    if (!u) return null;
    // Buscar en clientes
    const cliente = (Array.isArray(clientes) ? clientes : []).find(
      (c) => String(c?.usuarioNodo || c?.usuario_nodo || "").trim().toLowerCase() === u
    );
    if (cliente) return { tipo: "cliente", nombre: String(cliente.nombre || cliente.razonSocial || "-"), dni: String(cliente.dni || "-") };
    // Buscar en órdenes activas (no canceladas)
    const orden_ = (Array.isArray(ordenes) ? ordenes : []).find((o) => {
      const est = String(o?.estado || "").toLowerCase();
      const lib = o?.usuarioNodoLiberado === true || String(o?.usuarioNodoLiberado || "").toLowerCase() === "true";
      if (est.includes("cancel") && lib) return false;
      return String(o?.usuarioNodo || "").trim().toLowerCase() === u && o?.id !== ordenEditandoId;
    });
    if (orden_) return { tipo: "orden", nombre: String(orden_.nombre || "-"), codigo: String(orden_.codigo || "-") };
    return null;
  }, [orden.usuarioNodo, clientes, ordenes, ordenEditandoId]);

  // La sesión solo se cierra por verificarSesion (que consulta Supabase directamente)

  useEffect(() => {
    if (!mostrarMenuSesion) return undefined;
    const handleOutsideClick = (event) => {
      if (!sessionMenuRef.current?.contains(event.target)) {
        setMostrarMenuSesion(false);
        setCambiandoClave(false);
        setCambioClaveForm({ actual: "", nueva: "", confirmar: "" });
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [mostrarMenuSesion]);

  useEffect(() => {
    if (!puedeVerUsuarios && vistaActiva === "usuarios") setVistaActiva("crear");
    if (!puedeVerReportes && vistaActiva === "reportes") setVistaActiva("historial");
    if (!puedeVerPlantaExterna && vistaActiva === "plantaExterna") setVistaActiva("crear");
    if (!esAdminSesion && vistaActiva === "almacenes") setVistaActiva("inventario");
  }, [puedeVerUsuarios, puedeVerReportes, puedeVerPlantaExterna, esAdminSesion, vistaActiva]);

  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (!historialAppsheetSubmenuKeysPermitidos.length) return;
    if (historialAppsheetSubmenuKeysPermitidos.includes(historialAppsheetSubmenu)) return;
    setHistorialAppsheetSubmenu(historialAppsheetSubmenuKeysPermitidos[0]);
  }, [vistaActiva, historialAppsheetSubmenu, historialAppsheetSubmenuKeysPermitidos]);

  useEffect(() => {
    if (vistaActiva !== "diagnosticoServicio") return;
    if (!diagnosticoServicioModosDisponibles.length) {
      setDiagnosticoServicioError("Tu usuario no tiene permisos habilitados para consultas en Diagnóstico de servicio.");
      return;
    }
    if (diagnosticoServicioModosDisponibles.includes(diagnosticoServicioModo)) return;
    setDiagnosticoServicioModo(diagnosticoServicioModosDisponibles[0]);
    setDiagnosticoServicioError("");
  }, [vistaActiva, diagnosticoServicioModo, diagnosticoServicioModosDisponibles]);

  useEffect(() => {
    if (vistaActiva !== "historial") return;
    void cargarLiquidacionesDesdeSupabase({ silent: true });
  }, [vistaActiva]);

  useEffect(() => {
    if (vistaActiva !== "recuperaciones") return;
    void cargarHistorialRecuperaciones();
    void cargarStockTecnico();
  }, [vistaActiva]);

  // Pre-llenar autor de orden con el usuario actual al crear nueva orden
  useEffect(() => {
    if (vistaActiva !== "crear" || ordenEditandoId) return;
    if (!usuarioSesion?.nombre) return;
    setOrden((prev) => prev.autorOrden ? prev : { ...prev, autorOrden: usuarioSesion.nombre });
  }, [vistaActiva, ordenEditandoId, usuarioSesion]);


  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (historialAppsheetEquipos.length > 0) return;
    void cargarHistorialAppsheetEquipos();
  }, [vistaActiva]);

  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (historialAppsheetSubmenu !== "liquidaciones") return;
    if (historialAppsheetLiquidaciones.length > 0) return;
    void cargarHistorialAppsheetLiquidaciones();
  }, [vistaActiva, historialAppsheetSubmenu]);

  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (historialAppsheetSubmenu !== "materialesLiquidacion") return;
    if (historialAppsheetDetLiq.length > 0) return;
    void cargarHistorialAppsheetDetalleLiquidacion();
  }, [vistaActiva, historialAppsheetSubmenu]);

  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (historialAppsheetSubmenu !== "materialesLiquidacion") return;
    if (historialAppsheetArticulos.length > 0) return;
    void cargarHistorialAppsheetArticulos();
  }, [vistaActiva, historialAppsheetSubmenu, historialAppsheetArticulos.length]);

  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (historialAppsheetSubmenu !== "articulos") return;
    if (historialAppsheetArticulos.length > 0) return;
    void cargarHistorialAppsheetArticulos();
  }, [vistaActiva, historialAppsheetSubmenu]);

  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (historialAppsheetSubmenu !== "extracto") return;
    if (historialAppsheetExtracto.length > 0) return;
    void cargarHistorialAppsheetExtracto();
  }, [vistaActiva, historialAppsheetSubmenu, historialAppsheetExtracto.length]);

  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (historialAppsheetSubmenu !== "movimientos") return;
    if (historialAppsheetMovimientos.length > 0) return;
    void cargarHistorialAppsheetMovimientos();
  }, [vistaActiva, historialAppsheetSubmenu, historialAppsheetMovimientos.length]);

  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (historialAppsheetSubmenu !== "ordenesBaseData") return;
    if (baseDataOrdenesRows.length > 0) return;
    void cargarBaseDataOrdenes();
  }, [vistaActiva, historialAppsheetSubmenu, baseDataOrdenesRows.length]);

  useEffect(() => {
    if (vistaActiva !== "historialAppsheet") return;
    if (historialAppsheetSubmenu !== "pdf") return;
    if (!historialAppsheetLiquidaciones.length) void cargarHistorialAppsheetLiquidaciones();
    if (!historialAppsheetDetLiq.length) void cargarHistorialAppsheetDetalleLiquidacion();
    if (!historialAppsheetExtracto.length) void cargarHistorialAppsheetExtracto();
    if (!historialAppsheetMovimientos.length) void cargarHistorialAppsheetMovimientos();
  }, [
    vistaActiva,
    historialAppsheetSubmenu,
    historialAppsheetLiquidaciones.length,
    historialAppsheetDetLiq.length,
    historialAppsheetExtracto.length,
    historialAppsheetMovimientos.length,
  ]);

  useEffect(() => {
    setHistorialAppsheetPagina(1);
  }, [historialAppsheetBusqueda, historialAppsheetFiltro]);

  useEffect(() => {
    setHistorialAppsheetLiqPagina(1);
  }, [historialAppsheetLiqBusqueda, historialAppsheetLiqFiltro]);
  useEffect(() => {
    setHistorialAppsheetDetLiqPagina(1);
  }, [historialAppsheetDetLiqBusqueda]);
  useEffect(() => {
    setHistorialAppsheetArtPagina(1);
  }, [historialAppsheetArtBusqueda]);

  useEffect(() => {
    setReportePaginaAct(1);
  }, [reporteDesde, reporteHasta, reporteNodo, reporteTecnico, reporteTipo, reporteBusqueda]);

  useEffect(() => {
    setReportePaginaMat(1);
  }, [reporteDesde, reporteHasta, reporteNodo, reporteTecnico, reporteTipo, reporteBusqueda]);

  const menuLabelByKeyWeb = useMemo(
    () => Object.fromEntries(MENU_VISTAS_WEB.map((item) => [item.key, item.label])),
    []
  );
  const historialAppsheetSubmenuLabelByKey = useMemo(
    () => Object.fromEntries(HISTORIAL_APPSHEET_SUBMENU_ITEMS.map((item) => [item.key, item.sideLabel || item.label])),
    []
  );
  const diagnosticoServicioPermisoLabelByKey = useMemo(
    () => Object.fromEntries(DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS.map((item) => [item.key, item.label])),
    []
  );

  const usuariosFiltrados = useMemo(() => {
    const q = busquedaUsuarios.trim().toLowerCase();
    if (!q) return usuarios;

    return usuarios.filter((u) => {
      const accesosTexto = normalizarAccesosMenuWeb(u?.accesosMenu ?? u?.accesos_menu, u?.rol)
        .map((key) => menuLabelByKeyWeb[key] || key)
        .join(" ");
      const historialSubmenusTexto = normalizarAccesosHistorialAppsheetWeb(
        u?.accesosHistorialAppsheet ?? u?.accesos_historial_appsheet ?? u?.accesosMenu ?? u?.accesos_menu,
        u?.rol
      )
        .map((key) => historialAppsheetSubmenuLabelByKey[key] || key)
        .join(" ");
      const nodosTexto = normalizarNodosAccesoWeb(u?.nodosAcceso ?? u?.nodos_acceso).join(" ");
      const diagnosticoServicioPermisosTexto = normalizarAccesosDiagnosticoServicioWeb(
        u?.accesosDiagnosticoServicio ??
          u?.accesos_diagnostico_servicio ??
          u?.accesosMenu ??
          u?.accesos_menu,
        u?.rol,
        u?.accesosMenu ?? u?.accesos_menu
      )
        .map((key) => diagnosticoServicioPermisoLabelByKey[key] || key)
        .join(" ");
      return (
        safeIncludes(u.nombre, q) ||
        safeIncludes(u.rol, q) ||
        safeIncludes(u.celular, q) ||
        safeIncludes(u.email, q) ||
        safeIncludes(u.empresa, q) ||
        safeIncludes(u.activo ? "activo" : "inactivo", q) ||
        safeIncludes(accesosTexto, q) ||
        safeIncludes(historialSubmenusTexto, q) ||
        safeIncludes(nodosTexto, q) ||
        safeIncludes(diagnosticoServicioPermisosTexto, q)
      );
    });
  }, [usuarios, busquedaUsuarios, menuLabelByKeyWeb, historialAppsheetSubmenuLabelByKey, diagnosticoServicioPermisoLabelByKey]);

  const clientesPorNodo = useMemo(() => {
    const base = Array.isArray(clientes) ? clientes : [];
    return base.filter((c) => tieneAccesoNodoSesion(firstText(c?.nodo, c?.payload?.nodo, c?.payload?.Nodo)));
  }, [clientes, tieneAccesoNodoSesion]);

  const clientesFiltrados = useMemo(() => {
    const q = busquedaClientes.trim().toLowerCase();
    return clientesPorNodo.filter((c) => {
      if (filtroEstadoCliente !== "TODOS") {
        const estadoNorm = c.estadoServicio || normalizarEstadoServicioCliente(c.estado || c.payload?.estado || c.payload?.Estado || "");
        if (estadoNorm !== filtroEstadoCliente) return false;
      }
      if (!q) return true;
      const equiposTexto = Array.isArray(c.equiposHistorial)
        ? c.equiposHistorial
            .map((e) => `${e.tipo} ${e.codigo} ${e.serial} ${e.marca} ${e.modelo}`)
            .join(" ")
            .toLowerCase()
        : "";
      return (
        safeIncludes(c.codigoCliente, q) ||
        safeIncludes(c.dni, q) ||
        safeIncludes(c.nombre, q) ||
        safeIncludes(c.celular, q) ||
        safeIncludes(c.direccion, q) ||
        safeIncludes(c.usuarioNodo, q) ||
        safeIncludes(c.nodo, q) ||
        safeIncludes(c.empresa, q) ||
        safeIncludes(c.estado, q) ||
        safeIncludes(c.velocidad, q) ||
        safeIncludes(c.codigoEtiqueta, q) ||
        equiposTexto.includes(q)
      );
    });
  }, [clientesPorNodo, busquedaClientes, filtroEstadoCliente]);

  const conteosEstadoCliente = useMemo(() => {
    const counts = { TODOS: clientesPorNodo.length, ACTIVO: 0, SUSPENDIDO: 0, INACTIVO: 0, DESCONOCIDO: 0 };
    clientesPorNodo.forEach((c) => {
      const e = c.estadoServicio || normalizarEstadoServicioCliente(c.estado || c.payload?.estado || c.payload?.Estado || "");
      if (counts[e] !== undefined) counts[e]++;
      else counts.DESCONOCIDO++;
    });
    return counts;
  }, [clientesPorNodo]);

  const diagnosticoServicioCliente = useMemo(() => {
    if (diagnosticoServicioModo !== "dni") return null;
    const dni = String(diagnosticoServicioConsulta || "").replace(/\D/g, "");
    if (!dni) return null;
    return (
      clientesPorNodo.find((cliente) => String(cliente?.dni || "").replace(/\D/g, "") === dni) ||
      null
    );
  }, [clientesPorNodo, diagnosticoServicioConsulta, diagnosticoServicioModo]);
  const diagnosticoServicioNodo = useMemo(
    () =>
      diagnosticoServicioModo === "manual"
        ? String(diagnosticoServicioManualNodo || "").trim()
        : firstText(
            diagnosticoServicioCliente?.nodo,
            diagnosticoServicioCliente?.payload?.nodo,
            diagnosticoServicioCliente?.payload?.Nodo
          ),
    [diagnosticoServicioCliente, diagnosticoServicioManualNodo, diagnosticoServicioModo]
  );
  const diagnosticoServicioPppoe = useMemo(
    () =>
      diagnosticoServicioModo === "manual"
        ? String(diagnosticoServicioManualUser || "").trim()
        : firstText(
            diagnosticoServicioCliente?.usuarioNodo,
            diagnosticoServicioCliente?.payload?.usuarioNodo,
            diagnosticoServicioCliente?.payload?.["Usuario Nodo"],
            diagnosticoServicioCliente?.payload?.user_pppoe,
            diagnosticoServicioCliente?.payload?.["User PPPoE"],
            diagnosticoServicioCliente?.payload?.["UserPPPoE"]
          ),
    [diagnosticoServicioCliente, diagnosticoServicioManualUser, diagnosticoServicioModo]
  );

  const clientesResumen = useMemo(() => {
    const lista = Array.isArray(clientesFiltrados) ? clientesFiltrados : [];
    const conCel = lista.filter((c) => String(c.celular || "").trim()).length;
    const conNodo = lista.filter((c) => String(c.nodo || "").trim()).length;
    const conEtiqueta = lista.filter((c) => String(c.codigoEtiqueta || "").trim() && String(c.codigoEtiqueta || "").trim() !== "-").length;
    return {
      total: lista.length,
      conCelular: conCel,
      conNodo,
      conEtiqueta,
    };
  }, [clientesFiltrados]);

  const totalPaginasClientes = useMemo(
    () => Math.max(1, Math.ceil(clientesFiltrados.length / CLIENTES_PAGE_SIZE)),
    [clientesFiltrados.length]
  );

  const clientesPaginados = useMemo(() => {
    const start = (clientesPagina - 1) * CLIENTES_PAGE_SIZE;
    return clientesFiltrados.slice(start, start + CLIENTES_PAGE_SIZE);
  }, [clientesFiltrados, clientesPagina]);

  // Mapa DNI -> cantidad de servicios (para badge "múltiples servicios")
  const dniServiciosCount = useMemo(() => {
    const map = {};
    (Array.isArray(clientes) ? clientes : []).forEach((c) => {
      const d = String(c.dni || "").trim();
      if (d) map[d] = (map[d] || 0) + 1;
    });
    return map;
  }, [clientes]);

  useEffect(() => {
    setClientesPagina(1);
  }, [busquedaClientes, filtroEstadoCliente]);

  useEffect(() => {
    const t = setTimeout(() => {
      setBusquedaClientes(busquedaClientesDraft);
    }, 280);
    return () => clearTimeout(t);
  }, [busquedaClientesDraft]);

  useEffect(() => {
    setClientesPagina((p) => Math.max(1, Math.min(totalPaginasClientes, p)));
  }, [totalPaginasClientes]);

  const limpiarClientesLocales = () => {
    const ok = window.confirm("Vaciar todos los clientes locales de esta app en este navegador?");
    if (!ok) return;
    if (isSupabaseConfigured) {
      clientesHydratingRef.current = true;
    }
    setClientes([]);
    try {
      localStorage.removeItem("clientes");
    } catch {
      // noop
    }
    if (vistaActiva === "detalleCliente") {
      setClienteSeleccionado(null);
      setVistaActiva("clientes");
    }
    if (isSupabaseConfigured) {
      window.alert("Clientes locales eliminados. Se recargará desde Supabase.");
      void cargarClientesDesdeSupabase({ silent: false }).finally(() => {
        clientesHydratingRef.current = false;
      });
      return;
    }
    window.alert("Clientes locales eliminados.");
  };

  const actualizarEstadoMasivoMikrowisp = async () => {
    const clientesConDni = clientesPorNodo.filter((c) => {
      const dni = String(c?.dni || "").replace(/\D/g, "").trim();
      return dni.length >= 6;
    });
    if (!clientesConDni.length) {
      window.alert("No hay clientes con DNI para consultar.");
      return;
    }
    const ok = window.confirm(`Se consultará Mikrowisp para ${clientesConDni.length} clientes. Puede tardar varios minutos. ¿Continuar?`);
    if (!ok) return;

    const MIKROWISP_TOKEN_LOCAL = "LzNXSERnUHBMMS91b0NzUGFTVkFkZz09";
    const endpoints = import.meta.env.DEV
      ? ["/api/mikrowisp/GetClientsDetails", "https://americanet.club/api/v1/GetClientsDetails"]
      : ["https://americanet.club/api/v1/GetClientsDetails", "/api/mikrowisp/GetClientsDetails"];

    const consultarDni = async (dniLimpio) => {
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: MIKROWISP_TOKEN_LOCAL },
            body: JSON.stringify({ token: MIKROWISP_TOKEN_LOCAL, cedula: dniLimpio }),
          });
          const body = await res.json();
          if (res.ok && body && body.success !== false) {
            const dataBase = body?.data || body?.datos || body?.client || body?.cliente || body || {};
            const data = Array.isArray(dataBase) && dataBase.length > 0 ? dataBase[0] : dataBase;
            const estadoRaw = data?.estado || data?.status || data?.service_status || data?.state || "";
            return normalizarEstadoServicioCliente(estadoRaw);
          }
        } catch {
          // try next endpoint
        }
      }
      return null;
    };

    setActualizarEstadoMasivoLoading(true);
    setActualizarEstadoMasivoProgreso({ actual: 0, total: clientesConDni.length, actualizados: 0 });

    const actualizados = [];
    const CONCURRENCIA = 3;
    for (let i = 0; i < clientesConDni.length; i += CONCURRENCIA) {
      const lote = clientesConDni.slice(i, i + CONCURRENCIA);
      const resultados = await Promise.all(
        lote.map(async (c) => {
          const dni = String(c?.dni || "").replace(/\D/g, "").trim();
          const estadoNuevo = await consultarDni(dni);
          return { c, estadoNuevo };
        })
      );
      for (const { c, estadoNuevo } of resultados) {
        if (estadoNuevo && estadoNuevo !== (c.estadoServicio || "DESCONOCIDO")) {
          actualizados.push({ ...c, estadoServicio: estadoNuevo });
        }
      }
      setActualizarEstadoMasivoProgreso({ actual: Math.min(i + CONCURRENCIA, clientesConDni.length), total: clientesConDni.length, actualizados: actualizados.length });
      await new Promise((r) => setTimeout(r, 200));
    }

    if (actualizados.length > 0) {
      const clientesActualizadosMap = new Map(actualizados.map((c) => [String(c.id || c.dni || ""), c]));
      const nuevosClientes = clientes.map((c) => {
        const key = String(c.id || c.dni || "");
        return clientesActualizadosMap.get(key) || c;
      });
      setClientes(nuevosClientes);
      if (isSupabaseConfigured) {
        try {
          const rows = actualizados.map((c) => serializarClienteParaSupabase(c));
          await supabase.from(CLIENTES_TABLE).upsert(rows, { onConflict: "dni" });
        } catch {
          // noop — estado queda en memoria
        }
      }
    }

    setActualizarEstadoMasivoLoading(false);
    setActualizarEstadoMasivoProgreso(null);
    window.alert(`Actualización completada. ${actualizados.length} clientes con estado actualizado.`);
  };

  const obtenerFotosLiquidacionClienteSupabase = async (cliente = {}) => {
    if (!isSupabaseConfigured || !cliente) return [];
    const fotosSet = new Set(
      (Array.isArray(cliente?.fotosLiquidacion) ? cliente.fotosLiquidacion : [])
        .map((x) => normalizeClienteSheetPhotoUrl(x))
        .filter(Boolean)
    );

    let clienteId = Number(cliente?.id);
    const dni = String(cliente?.dni || "").replace(/\D/g, "");

    if (!Number.isFinite(clienteId) && dni) {
      const cliRes = await supabase
        .from(CLIENTES_TABLE)
        .select("id")
        .eq("dni", dni)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cliRes.error && cliRes.data?.id != null) {
        clienteId = Number(cliRes.data.id);
      }
    }

    if (Number.isFinite(clienteId)) {
      const relRes = await supabase
        .from("cliente_fotos_liquidacion")
        .select("foto_url")
        .eq("cliente_id", clienteId)
        .order("id", { ascending: false })
        .limit(500);
      if (!relRes.error) {
        (relRes.data || []).forEach((row) => {
          const url = normalizeClienteSheetPhotoUrl(row?.foto_url || "");
          if (url) fotosSet.add(url);
        });
      }
    }

    if (dni) {
      const liqRes = await supabase
        .from("liquidaciones")
        .select("id,fotos,payload")
        .eq("dni", dni)
        .order("id", { ascending: false })
        .limit(200);

      const liqRows = !liqRes.error && Array.isArray(liqRes.data) ? liqRes.data : [];
      const liqIds = [];
      liqRows.forEach((row) => {
        const idNum = Number(row?.id);
        if (Number.isFinite(idNum)) liqIds.push(idNum);
        const fotosFila = Array.isArray(row?.fotos) ? row.fotos : [];
        const fotosPayload = Array.isArray(row?.payload?.fotos) ? row.payload.fotos : [];
        [...fotosFila, ...fotosPayload].forEach((foto) => {
          const url = normalizeClienteSheetPhotoUrl(foto || "");
          if (url) fotosSet.add(url);
        });
      });

      if (liqIds.length) {
        for (let i = 0; i < liqIds.length; i += 100) {
          const idsChunk = liqIds.slice(i, i + 100);
          const fotosLiqRes = await supabase
            .from("liquidacion_fotos")
            .select("foto_url")
            .in("liquidacion_id", idsChunk)
            .order("id", { ascending: false });
          if (fotosLiqRes.error) continue;
          (fotosLiqRes.data || []).forEach((row) => {
            const url = normalizeClienteSheetPhotoUrl(row?.foto_url || "");
            if (url) fotosSet.add(url);
          });
        }
      }
    }

    return Array.from(fotosSet);
  };

  const abrirDetalleCliente = async (cliente = null) => {
    if (!cliente) return;
    const key = clienteMergeKey(cliente);
    setClienteSeleccionado(cliente);
    setVistaActiva("detalleCliente");
    setClienteSenal(null);
    setClienteSenalError("");
    if (!isSupabaseConfigured) return;

    try {
      // Fetch fresco: caja_nap y puerto_nap pueden haber cambiado desde el mapa
      const dniCliente = String(cliente.dni || "").trim();
      if (dniCliente) {
        const { data: fresh } = await supabase
          .from("clientes")
          .select("caja_nap,puerto_nap")
          .eq("dni", dniCliente)
          .maybeSingle();
        if (fresh) {
          const patch = {
            cajaNap: String(fresh.caja_nap || "").trim(),
            puertoNap: String(fresh.puerto_nap || "").trim(),
          };
          setClienteSeleccionado(prev => prev ? { ...prev, ...patch } : prev);
          setClientes(prev => (Array.isArray(prev) ? prev : []).map(item =>
            clienteMergeKey(item) === key ? { ...item, ...patch } : item
          ));
        }
      }

      const fotosHydrated = await obtenerFotosLiquidacionClienteSupabase(cliente);
      if (!Array.isArray(fotosHydrated) || !fotosHydrated.length) return;

      setClientes((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          clienteMergeKey(item) === key
            ? { ...item, fotosLiquidacion: fotosHydrated }
            : item
        )
      );

      setClienteSeleccionado((prev) => {
        if (!prev || clienteMergeKey(prev) !== key) return prev;
        return { ...prev, fotosLiquidacion: fotosHydrated };
      });
    } catch {
      // noop
    }
  };

  const consultarDiagnosticoServicio = async () => {
    setDiagnosticoServicioResultado(null);
    setDiagnosticoServicioError("");
    let dni = "";
    let cliente = null;
    let nodo = "";
    let userPppoe = "";
    let clienteNombre = "";

    if (diagnosticoServicioModo === "manual") {
      if (!puedeDiagnosticoConsultaDirecta) {
        setDiagnosticoServicioError("Tu usuario no tiene permiso para consulta directa por usuario.");
        return;
      }
      userPppoe = String(diagnosticoServicioManualUser || "").trim();
      nodo = String(diagnosticoServicioManualNodo || "").trim();
      setDiagnosticoServicioConsulta(userPppoe);
      if (!nodo) {
        setDiagnosticoServicioError("Selecciona el nodo para la consulta manual.");
        return;
      }
      if (!userPppoe) {
        setDiagnosticoServicioError("Ingresa el usuario PPPoE para la consulta directa.");
        return;
      }
      clienteNombre = "Consulta manual";
    } else {
      if (!puedeDiagnosticoPorDni) {
        setDiagnosticoServicioError("Tu usuario no tiene permiso para buscar por DNI.");
        return;
      }
      dni = String(diagnosticoServicioDni || "").replace(/\D/g, "").slice(0, 8);
      setDiagnosticoServicioConsulta(dni);
      if (dni.length !== 8) {
        setDiagnosticoServicioError("Ingresa un DNI válido de 8 dígitos.");
        return;
      }
      cliente = clientesPorNodo.find((item) => String(item?.dni || "").replace(/\D/g, "") === dni) || null;
      if (!cliente) {
        setDiagnosticoServicioError("No se encontró un abonado visible para ese DNI dentro de la base y nodos permitidos.");
        return;
      }
      nodo = firstText(cliente?.nodo, cliente?.payload?.nodo, cliente?.payload?.Nodo);
      userPppoe = firstText(
        cliente?.usuarioNodo,
        cliente?.payload?.usuarioNodo,
        cliente?.payload?.["Usuario Nodo"],
        cliente?.payload?.user_pppoe,
        cliente?.payload?.["User PPPoE"],
        cliente?.payload?.["UserPPPoE"]
      );
      if (!nodo) {
        setDiagnosticoServicioError("El abonado no tiene nodo asociado.");
        return;
      }
      if (!userPppoe) {
        setDiagnosticoServicioError("El abonado no tiene user PPPoE registrado en la base. Usa la consulta manual por usuario.");
        return;
      }
      clienteNombre = firstText(cliente?.nombre, cliente?.payload?.nombre, cliente?.payload?.Nombre);
    }

    setDiagnosticoServicioLoading(true);
    try {
      const json = await ejecutarDiagnosticoServicioRequest({
        dni,
        cliente: clienteNombre,
        nodo,
        userPppoe,
      });
      setDiagnosticoServicioResultado(json);
    } catch (error) {
      setDiagnosticoServicioError(String(error?.message || "No se pudo consultar el diagnóstico de servicio."));
    } finally {
      setDiagnosticoServicioLoading(false);
    }
  };

  const ejecutarDiagnosticoServicioRequest = async ({ dni = "", cliente = "", nodo = "", userPppoe = "" } = {}) => {
    const payload = JSON.stringify({
      dni,
      cliente,
      nodo,
      userPppoe,
    });
    const requestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
    };
    const urls = DIAGNOSTICO_API_BASE
      ? [DIAGNOSTICO_API_BASE]
      : ["/api/diagnostico-servicio", "http://127.0.0.1:8787/api/diagnostico-servicio"];
    let lastError = null;
    let json = {};
    let success = false;
    for (const url of urls) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 16000);
      try {
        const res = await fetch(url, { ...requestInit, signal: controller.signal });
        json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok !== true) {
          lastError = new Error(String(json?.error || `No se pudo consultar el diagnóstico (HTTP ${res.status}).`));
          continue;
        }
        success = true;
        lastError = null;
        break;
      } catch (error) {
        lastError =
          error?.name === "AbortError"
            ? new Error("La consulta al diagnóstico excedió el tiempo de espera.")
            : error;
      } finally {
        window.clearTimeout(timeoutId);
      }
    }
    if (!success) {
      throw lastError || new Error("No se pudo consultar el diagnóstico de servicio.");
    }
    return json;
  };

  const ejecutarDiagnosticoServicioActionRequest = async (path, payload = {}) => {
    const requestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    };
    const urls = DIAGNOSTICO_API_BASE
      ? [`${DIAGNOSTICO_API_BASE}/${path}`]
      : [`/api/diagnostico-servicio/${path}`, `http://127.0.0.1:8787/api/diagnostico-servicio/${path}`];
    let lastError = null;
    let json = {};
    let success = false;
    for (const url of urls) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 18000);
      try {
        const res = await fetch(url, { ...requestInit, signal: controller.signal });
        json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok !== true) {
          lastError = new Error(String(json?.error || `No se pudo ejecutar la acción MikroTik (HTTP ${res.status}).`));
          continue;
        }
        success = true;
        lastError = null;
        break;
      } catch (error) {
        lastError =
          error?.name === "AbortError"
            ? new Error("La acción MikroTik excedió el tiempo de espera.")
            : error;
      } finally {
        window.clearTimeout(timeoutId);
      }
    }
    if (!success) {
      throw lastError || new Error("No se pudo ejecutar la acción MikroTik.");
    }
    return json;
  };

  const ejecutarSuspensionManualDiagnostico = async (accion = "") => {
    if (!puedeDiagnosticoSuspensionManual) {
      setDiagnosticoSuspensionManualError("Tu usuario no tiene permiso para suspensión manual.");
      return;
    }
    const accionLabel = accion === "suspender" ? "suspender" : "activar";
    const nodo = String(diagnosticoSuspensionManualNodo || "").trim();
    const userPppoe = String(diagnosticoSuspensionManualUser || "").trim();
    if (!nodo) {
      setDiagnosticoSuspensionManualError("Selecciona un nodo.");
      return;
    }
    if (!userPppoe) {
      setDiagnosticoSuspensionManualError("Ingresa el usuario PPPoE.");
      return;
    }
    const confirmMsg =
      accionLabel === "suspender"
        ? `¿Suspender manualmente el usuario ${userPppoe} en ${nodo}?`
        : `¿Activar manualmente el usuario ${userPppoe} en ${nodo}?`;
    if (!window.confirm(confirmMsg)) return;

    setDiagnosticoSuspensionManualLoading(accionLabel);
    setDiagnosticoSuspensionManualInfo("");
    setDiagnosticoSuspensionManualError("");
    try {
      const json = await ejecutarDiagnosticoServicioActionRequest(accionLabel, {
        nodo,
        userPppoe,
      });
      const result = json?.result || {};
      setDiagnosticoSuspensionManualInfo(
        String(result?.message || `Acción manual ${accionLabel} ejecutada correctamente.`)
      );
    } catch (error) {
      setDiagnosticoSuspensionManualError(
        String(error?.message || `No se pudo ejecutar ${accionLabel} manual.`)
      );
    } finally {
      setDiagnosticoSuspensionManualLoading("");
    }
  };

  const resolverDiagnosticoServicioDesdeCliente = (cliente = null) => {
    const dni = String(firstText(cliente?.dni, cliente?.payload?.dni, cliente?.payload?.DNI) || "")
      .replace(/\D/g, "")
      .slice(0, 8);
    const nodo = firstText(cliente?.nodo, cliente?.payload?.nodo, cliente?.payload?.Nodo);
    const userPppoe = firstText(
      cliente?.usuarioNodo,
      cliente?.payload?.usuarioNodo,
      cliente?.payload?.["Usuario Nodo"],
      cliente?.payload?.user_pppoe,
      cliente?.payload?.["User PPPoE"],
      cliente?.payload?.["UserPPPoE"]
    );
    const clienteNombre = firstText(cliente?.nombre, cliente?.payload?.nombre, cliente?.payload?.Nombre) || "Consulta manual";
    return {
      dni,
      nodo,
      userPppoe,
      clienteNombre,
    };
  };

  const OLT_SIGNAL_API = "http://185.173.110.145:3001/api/signal";

  const consultarSenalCliente = async (cli) => {
    if (!cli?.snOnu) return;
    setClienteSenalLoading(true);
    setClienteSenalError("");
    setClienteSenal(null);
    try {
      const body = cli.oltIp && cli.pon && cli.onuId != null
        ? { olt_ip: cli.oltIp, pon: cli.pon, onu_id: cli.onuId }
        : { sn_onu: cli.snOnu };
      const res = await fetch(OLT_SIGNAL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) throw new Error(json?.error || "Error al consultar señal.");
      setClienteSenal({ rx: json.rx, tx: json.tx, queried_at: json.queried_at });
      // Update local state + Supabase
      setClienteSeleccionado(prev => prev ? {
        ...prev,
        rxSignal: json.rx, txSignal: json.tx,
        oltIp: json.olt_ip, pon: json.pon, onuId: json.onu_id,
        signalUpdatedAt: json.queried_at,
      } : prev);
      await supabase.from("clientes").update({
        rx_signal: json.rx, tx_signal: json.tx,
        olt_ip: json.olt_ip, pon: json.pon, onu_id: json.onu_id,
        signal_updated_at: json.queried_at,
      }).eq("id", cli.id);
    } catch (e) {
      setClienteSenalError(String(e?.message || "Error al consultar señal."));
    } finally {
      setClienteSenalLoading(false);
    }
  };

  const clienteEstaSuspendidoMikrotik = (cliente = null) => {
    const suspensionIp = String(
      firstText(cliente?.mikrotikSuspensionIp, cliente?.payload?.mikrotikSuspensionIp) || ""
    ).trim();
    const ultimaAccion = String(
      firstText(cliente?.mikrotikUltimaAccion, cliente?.payload?.mikrotikUltimaAccion) || ""
    )
      .trim()
      .toLowerCase();
    const estadoTexto = String(
      firstText(
        cliente?.estado,
        cliente?.payload?.estado,
        cliente?.payload?.Estado,
        cliente?.payload?.estadoServicio,
        cliente?.payload?.EstadoServicio
      ) || ""
    )
      .trim()
      .toLowerCase();

    if (suspensionIp) return true;
    if (ultimaAccion === "suspender") return true;
    return /suspend|suspensi|cort|bloque|moros/.test(estadoTexto);
  };

  const aplicarEstadoMikrotikEnCliente = (cliente = null, updates = {}) => {
    if (!cliente) return null;
    const clienteId = cliente?.id;
    const nextEstado = {
      ...cliente,
      ...updates,
      payload: {
        ...(cliente?.payload && typeof cliente.payload === "object" ? cliente.payload : {}),
        ...updates,
      },
      ultimaActualizacion: new Date().toLocaleString(),
    };
    setClientes((prev) =>
      (Array.isArray(prev) ? prev : []).map((item) =>
        String(item?.id || "") === String(clienteId || "") ? nextEstado : item
      )
    );
    setClienteSeleccionado((prev) =>
      prev && String(prev?.id || "") === String(clienteId || "") ? nextEstado : prev
    );
    setClienteDiagnosticoRapido((prev) =>
      prev && String(prev?.id || "") === String(clienteId || "") ? nextEstado : prev
    );
    return nextEstado;
  };

  const ejecutarAccionMikrotikCliente = async (cliente = null, accion = "") => {
    if (!cliente) return;
    const { nodo, userPppoe } = resolverDiagnosticoServicioDesdeCliente(cliente);
    if (!nodo || !userPppoe) {
      const msg = "Este cliente no tiene nodo y usuario PPPoE suficientes para ejecutar la acción.";
      setClienteMikrotikAccionInfo(msg);
      setClienteDiagnosticoRapidoError(msg);
      return;
    }

    const accionLabel = accion === "suspender" ? "suspender" : "activar";
    const pregunta =
      accion === "suspender"
        ? `¿Seguro que deseas suspender el servicio de ${cliente.nombre || userPppoe}?`
        : `¿Seguro que deseas activar el servicio de ${cliente.nombre || userPppoe}?`;
    if (!window.confirm(pregunta)) return;

    setClienteMikrotikAccionLoading(accion);
    setClienteMikrotikAccionInfo("");
    setClienteDiagnosticoRapidoError("");
    try {
      const payload = {
        nodo,
        userPppoe,
        ip: String(cliente?.mikrotikSuspensionIp || cliente?.payload?.mikrotikSuspensionIp || "").trim(),
      };
      const json = await ejecutarDiagnosticoServicioActionRequest(accionLabel, payload);
      const result = json?.result || {};
      const estadoCliente = accion === "suspender" ? "Suspendido" : "Activo";
      aplicarEstadoMikrotikEnCliente(cliente, {
        estado: estadoCliente,
        mikrotikSuspensionIp: accion === "suspender" ? result?.ip || "" : "",
        mikrotikSuspensionFecha: new Date().toISOString(),
        mikrotikSuspensionRouter: result?.router?.nombre || "",
        mikrotikUltimaAccion: accionLabel,
      });
      const accionInfo = String(result?.message || `Acción ${accionLabel} ejecutada correctamente.`);
      if (clienteDiagnosticoRapido) {
        await abrirDiagnosticoRapidoCliente({
          ...cliente,
          estado: estadoCliente,
          mikrotikSuspensionIp: accion === "suspender" ? result?.ip || "" : "",
        });
      }
      setClienteMikrotikAccionInfo(accionInfo);
    } catch (error) {
      const msg = String(error?.message || `No se pudo ${accionLabel} el servicio.`);
      setClienteMikrotikAccionInfo(msg);
      setClienteDiagnosticoRapidoError(msg);
    } finally {
      setClienteMikrotikAccionLoading("");
    }
  };

  const abrirDiagnosticoServicioDesdeCliente = async (cliente = null) => {
    if (!cliente) return;
    if (!accesosSesion.includes("diagnosticoServicio")) {
      setClienteDiagnosticoRapidoError("Tu usuario no tiene acceso al módulo Diagnóstico de servicio.");
      return;
    }
    const { dni, nodo, userPppoe, clienteNombre } = resolverDiagnosticoServicioDesdeCliente(cliente);

    setDiagnosticoServicioResultado(null);
    setDiagnosticoServicioError("");
    setDiagnosticoServicioDni(dni);
    setDiagnosticoServicioConsulta(userPppoe || dni);
    setVistaActiva("diagnosticoServicio");

    if (nodo && userPppoe && puedeDiagnosticoConsultaDirecta) {
      setDiagnosticoServicioModo("manual");
      setDiagnosticoServicioManualNodo(nodo);
      setDiagnosticoServicioManualUser(userPppoe);
      setDiagnosticoServicioLoading(true);
      try {
        const json = await ejecutarDiagnosticoServicioRequest({
          dni,
          cliente: clienteNombre,
          nodo,
          userPppoe,
        });
        setDiagnosticoServicioResultado(json);
      } catch (error) {
        setDiagnosticoServicioError(String(error?.message || "No se pudo consultar el diagnóstico de servicio."));
      } finally {
        setDiagnosticoServicioLoading(false);
      }
      return;
    }

    if (puedeDiagnosticoPorDni) {
      setDiagnosticoServicioModo("dni");
    } else if (puedeDiagnosticoConsultaDirecta) {
      setDiagnosticoServicioModo("manual");
    }
    setDiagnosticoServicioManualNodo(nodo || "Nod_01");
    setDiagnosticoServicioManualUser(userPppoe || "");
    if (nodo && userPppoe && !puedeDiagnosticoConsultaDirecta) {
      if (dni.length === 8 && puedeDiagnosticoPorDni) {
        setDiagnosticoServicioError("Tu usuario no tiene permiso para consulta directa. Se preparó la búsqueda por DNI.");
      } else {
        setDiagnosticoServicioError("Tu usuario no tiene permiso para consulta directa por usuario.");
      }
      return;
    }
    if (dni.length === 8 && puedeDiagnosticoPorDni) {
      setDiagnosticoServicioError("Cliente sin user PPPoE cargado. Puedes completar la consulta manual por usuario.");
      return;
    }
    if (dni.length === 8 && !puedeDiagnosticoPorDni) {
      setDiagnosticoServicioError("Tu usuario no tiene permiso para buscar por DNI.");
      return;
    }
    setDiagnosticoServicioError("Este cliente no tiene DNI ni user PPPoE suficientes para consultar MikroTik.");
  };

  const abrirDiagnosticoRapidoCliente = async (cliente = null) => {
    if (!cliente) return;
    const { dni, nodo, userPppoe, clienteNombre } = resolverDiagnosticoServicioDesdeCliente(cliente);
    setClienteDiagnosticoRapido(cliente);
    setClienteDiagnosticoRapidoResultado(null);
    setClienteDiagnosticoRapidoError("");
    setClienteMikrotikAccionInfo("");

    if (!nodo || !userPppoe) {
      setClienteDiagnosticoRapidoError(
        dni.length === 8
          ? "Este cliente no tiene user PPPoE cargado en la base. Puedes abrir el diagnóstico completo para continuar por DNI o consulta manual."
          : "Este cliente no tiene datos suficientes para una consulta rápida. Abre el diagnóstico completo para revisar el caso."
      );
      return;
    }

    setClienteDiagnosticoRapidoLoading(true);
    try {
      const json = await ejecutarDiagnosticoServicioRequest({
        dni,
        cliente: clienteNombre,
        nodo,
        userPppoe,
      });
      setClienteDiagnosticoRapidoResultado(json);
    } catch (error) {
      setClienteDiagnosticoRapidoError(String(error?.message || "No se pudo consultar el diagnóstico rápido."));
    } finally {
      setClienteDiagnosticoRapidoLoading(false);
    }
  };

  const cerrarDiagnosticoRapidoCliente = () => {
    setClienteDiagnosticoRapido(null);
    setClienteDiagnosticoRapidoResultado(null);
    setClienteDiagnosticoRapidoError("");
    setClienteDiagnosticoRapidoLoading(false);
    setClienteMikrotikAccionInfo("");
  };

  const serializarUsuarioParaSupabase = (u = {}) => {
    const accesosMenu = normalizarAccesosMenuWeb(u?.accesosMenu ?? u?.accesos_menu, u?.rol);
    const submenusHistorialAppsheet = normalizarAccesosHistorialAppsheetWeb(
      u?.accesosHistorialAppsheet ?? u?.accesos_historial_appsheet ?? u?.accesosMenu ?? u?.accesos_menu,
      u?.rol
    );
    const accesosDiagnosticoServicio = normalizarAccesosDiagnosticoServicioWeb(
      u?.accesosDiagnosticoServicio ?? u?.accesos_diagnostico_servicio ?? u?.accesosMenu ?? u?.accesos_menu,
      u?.rol,
      accesosMenu
    );
    const accesosMenuSerializados = Array.from(
      new Set([
        ...accesosMenu,
        ...(submenusHistorialAppsheet.length
          ? submenusHistorialAppsheet.map((key) => `${HISTORIAL_APPSHEET_SUBMENU_ACCESS_PREFIX}${key}`)
          : [HISTORIAL_APPSHEET_SUBMENU_NONE_KEY]),
        ...(accesosMenu.includes("diagnosticoServicio")
          ? accesosDiagnosticoServicio.length
            ? accesosDiagnosticoServicio.map((key) => `${DIAGNOSTICO_SERVICIO_PERMISOS_PREFIX}${key}`)
            : [DIAGNOSTICO_SERVICIO_PERMISOS_NONE_KEY]
          : []),
      ])
    );
    return {
      nombre: String(u?.nombre || "").trim() || "Sin nombre",
      username: String(u?.username || usernameDesdeNombre(u?.nombre || "")).trim().toLowerCase(),
      password: String(u?.password || "").trim() || "123456",
      rol: normalizarRolParaSupabase(u?.rol),
      celular: nullIfEmpty(u?.celular),
      email: nullIfEmpty(u?.email),
      empresa: nullIfEmpty(u?.empresa) || "Americanet",
      activo: Boolean(u?.activo),
      grupo: nullIfEmpty(u?.grupo),
      accesos_menu: accesosMenuSerializados,
      nodos_acceso: normalizarNodosAccesoWeb(u?.nodosAcceso ?? u?.nodos_acceso),
    };
  };

  const deserializarUsuarioSupabase = (row = {}) =>
    normalizarUsuarioConPermisos({
      id: Number(row.id) || Date.now() + Math.floor(Math.random() * 100000),
      supabaseId: row.id ?? null,
      nombre: String(row.nombre || "").trim(),
      username: String(row.username || "").trim(),
      password: String(row.password || "").trim(),
      rol: String(row.rol || "").trim() || "Tecnico",
      celular: String(row.celular || "").trim(),
      email: String(row.email || "").trim(),
      empresa: String(row.empresa || "").trim() || "Americanet",
      activo: row.activo !== false,
      grupo: String(row.grupo || "").trim(),
      fechaCreacion: row.fecha_creacion ? formatFechaFlexible(row.fecha_creacion) : new Date().toLocaleString(),
      accesosMenu: row.accesos_menu,
      accesosHistorialAppsheet: row.accesos_menu,
      accesosDiagnosticoServicio: row.accesos_menu,
      nodosAcceso: row.nodos_acceso,
      sesion_token: row.sesion_token || null,
      ultimo_acceso: row.ultimo_acceso || null,
    });

  const esErrorColumnaAccesosWeb = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("accesos_menu") && (msg.includes("does not exist") || msg.includes("schema cache"));
  };

  const esErrorColumnaNodosWeb = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("nodos_acceso") && (msg.includes("does not exist") || msg.includes("schema cache"));
  };

  const guardarUsuariosEnSupabase = async (lista = usuarios) => {
    if (!isSupabaseConfigured) return;
    const payload = Array.from(
      new Map(
        asegurarCredencialesUsuarios(Array.isArray(lista) ? lista : [])
          .map(serializarUsuarioParaSupabase)
          .filter((u) => String(u.username || "").trim())
          .map((u) => [u.username, u])
      ).values()
    );
    if (!payload.length) return;
    setUsuariosSupabaseSaving(true);
    try {
      const chunks = [];
      for (let i = 0; i < payload.length; i += 200) chunks.push(payload.slice(i, i + 200));
      for (const chunk of chunks) {
        let chunkFinal = chunk.map((item) => ({ ...item }));
        for (let intento = 0; intento < 4; intento += 1) {
          if (intento > 0) await new Promise((r) => setTimeout(r, intento * 1500));
          const { error } = await supabase.from(USUARIOS_TABLE).upsert(chunkFinal, { onConflict: "username" });
          if (!error) break;
          if (esErrorColumnaAccesosWeb(error)) {
            chunkFinal = chunkFinal.map(({ accesos_menu, ...rest }) => ({ ...rest }));
            continue;
          }
          if (esErrorColumnaNodosWeb(error)) {
            chunkFinal = chunkFinal.map(({ nodos_acceso, ...rest }) => ({ ...rest }));
            continue;
          }
          throw error;
        }
      }
    } finally {
      setUsuariosSupabaseSaving(false);
    }
  };

  const cerrarSesionRemota = async (userId) => {
    if (!window.confirm("¿Cerrar la sesión activa de este usuario? Será desconectado automáticamente.")) return;
    try {
      await supabase.from(USUARIOS_TABLE).update({ sesion_token: null, forzar_logout: true }).eq("id", userId);
      await cargarUsuariosDesdeSupabase({ silent: true });
      window.alert("Sesión cerrada. El usuario será redirigido al login en breve.");
    } catch {
      window.alert("Error al cerrar sesión remota.");
    }
  };

  const cargarUsuariosDesdeSupabase = async (opts = { silent: true }) => {
    if (!isSupabaseConfigured) return;
    try {
      let { data, error } = await supabase
        .from(USUARIOS_TABLE)
        .select("id,nombre,username,password,rol,celular,email,empresa,activo,fecha_creacion,accesos_menu,nodos_acceso,grupo,sesion_token,ultimo_acceso")
        .order("id", { ascending: true })
        .limit(5000);
      if (error && (esErrorColumnaAccesosWeb(error) || esErrorColumnaNodosWeb(error))) {
        const fallback = await supabase
          .from(USUARIOS_TABLE)
          .select("id,nombre,username,password,rol,celular,email,empresa,activo,fecha_creacion")
          .order("id", { ascending: true })
          .limit(5000);
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;
      const mapped = Array.isArray(data) ? data.map(deserializarUsuarioSupabase) : [];

      usuariosHydratingRef.current = true;
      setUsuarios(asegurarCredencialesUsuarios(mapped));
      setTimeout(() => {
        usuariosHydratingRef.current = false;
      }, 0);
      if (mapped.length === 0 && !opts?.silent) {
        console.info("Tabla usuarios vacia en Supabase.");
      }
      setUsuariosSupabaseReady(true);
    } catch (error) {
      console.error("Error cargando usuarios desde Supabase:", error);
    }
  };

  const serializarClienteParaSupabase = (cliente = {}) => {
    const idBase = String(cliente.id || cliente.dni || cliente.codigoCliente || Date.now()).trim();
    return {
      id: idBase || String(Date.now()),
      codigo_cliente: nullIfEmpty(cliente.codigoCliente),
      codigo_abonado: nullIfEmpty(cliente.codigoAbonado),
      dni: nullIfEmpty(cliente.dni),
      nombre: nullIfEmpty(cliente.nombre),
      direccion: nullIfEmpty(cliente.direccion),
      celular: nullIfEmpty(cliente.celular),
      email: nullIfEmpty(cliente.email),
      contacto: nullIfEmpty(cliente.contacto),
      empresa: nullIfEmpty(cliente.empresa),
      velocidad: nullIfEmpty(cliente.velocidad),
      precio_plan: nullIfEmpty(cliente.precioPlan),
      nodo: nullIfEmpty(cliente.nodo),
      usuario_nodo: nullIfEmpty(cliente.usuarioNodo),
      password_usuario: nullIfEmpty(cliente.passwordUsuario),
      codigo_etiqueta: nullIfEmpty(cliente.codigoEtiqueta),
      sn_onu: nullIfEmpty(cliente.snOnu),
      ubicacion: nullIfEmpty(cliente.ubicacion),
      descripcion: nullIfEmpty(cliente.descripcion),
      tecnico: nullIfEmpty(cliente.tecnico),
      autor_orden: nullIfEmpty(cliente.autorOrden),
      fecha_registro: toSupabaseDateTime(cliente.fechaRegistro),
      ultima_actualizacion: toSupabaseDateTime(cliente.ultimaActualizacion),
      foto_fachada: nullIfEmpty(cliente.fotoFachada),
      fotos_liquidacion: Array.isArray(cliente.fotosLiquidacion) ? cliente.fotosLiquidacion : [],
      historial_instalaciones: Array.isArray(cliente.historialInstalaciones) ? cliente.historialInstalaciones : [],
      equipos_historial: Array.isArray(cliente.equiposHistorial) ? cliente.equiposHistorial : [],
      estado_servicio: cliente.estadoServicio || "DESCONOCIDO",
      caja_nap: nullIfEmpty(cliente.cajaNap),
      puerto_nap: nullIfEmpty(cliente.puertoNap),
      payload: cliente,
      updated_at: new Date().toISOString(),
    };
  };

  const deserializarClienteSupabase = (row = {}) => {
    const p = row && typeof row.payload === "object" && row.payload ? row.payload : null;
    const signalFields = {
      snOnu: row.sn_onu || (p && p.snOnu) || "",
      rxSignal: row.rx_signal != null ? Number(row.rx_signal) : null,
      txSignal: row.tx_signal != null ? Number(row.tx_signal) : null,
      oltIp: row.olt_ip || "",
      pon: row.pon || "",
      onuId: row.onu_id != null ? Number(row.onu_id) : null,
      signalUpdatedAt: row.signal_updated_at || "",
    };
    if (p) {
      return {
        ...p,
        id: p.id || row.id,
        codigoAbonado: row.codigo_abonado || p.codigoAbonado || "",
        estadoServicio: row.estado_servicio || p.estadoServicio || "DESCONOCIDO",
        ...signalFields,
      };
    }
    return {
      id: row.id || row.dni || row.codigo_cliente || String(Date.now()),
      codigoAbonado: row.codigo_abonado || "",
      estadoServicio: row.estado_servicio || "DESCONOCIDO",
      codigoCliente: row.codigo_cliente || "-",
      dni: row.dni || "-",
      nombre: row.nombre || "-",
      direccion: row.direccion || "",
      celular: row.celular || "",
      email: row.email || "",
      contacto: row.contacto || "",
      empresa: row.empresa || "",
      estado: row.estado || "",
      velocidad: row.velocidad || "",
      precioPlan: row.precio_plan || "",
      nodo: row.nodo || "",
      usuarioNodo: row.usuario_nodo || "",
      passwordUsuario: row.password_usuario || "",
      codigoEtiqueta: row.codigo_etiqueta || "",
      ubicacion: row.ubicacion || "",
      descripcion: row.descripcion || "",
      tecnico: row.tecnico || "",
      autorOrden: row.autor_orden || "",
      fechaRegistro: row.fecha_registro || "",
      ultimaActualizacion: row.ultima_actualizacion || "",
      fotoFachada: row.foto_fachada || "",
      fotosLiquidacion: Array.isArray(row.fotos_liquidacion) ? row.fotos_liquidacion : [],
      historialInstalaciones: Array.isArray(row.historial_instalaciones) ? row.historial_instalaciones : [],
      equiposHistorial: Array.isArray(row.equipos_historial) ? row.equipos_historial : [],
      ...signalFields,
    };
  };

  const guardarClientesEnSupabase = async (lista = clientes, opts = {}) => {
    if (!isSupabaseConfigured) return;
    const data = Array.isArray(lista) ? lista : [];
    const payload = data.map(serializarClienteParaSupabase);
    if (!payload.length) return;
    const replaceAllOnIdentity = Boolean(opts?.replaceAllOnIdentity);
    const rowNoIdOf = (row) => ({
      codigo_cliente: row.codigo_cliente,
      dni: row.dni,
      nombre: row.nombre,
      direccion: row.direccion,
      celular: row.celular,
      email: row.email,
      contacto: row.contacto,
      empresa: row.empresa,
      velocidad: row.velocidad,
      precio_plan: row.precio_plan,
      nodo: row.nodo,
      usuario_nodo: row.usuario_nodo,
      password_usuario: row.password_usuario,
      codigo_etiqueta: row.codigo_etiqueta,
      ubicacion: row.ubicacion,
      descripcion: row.descripcion,
      tecnico: row.tecnico,
      autor_orden: row.autor_orden,
      fecha_registro: row.fecha_registro,
      ultima_actualizacion: row.ultima_actualizacion,
      foto_fachada: row.foto_fachada,
      fotos_liquidacion: row.fotos_liquidacion,
      historial_instalaciones: row.historial_instalaciones,
      equipos_historial: row.equipos_historial,
      payload: row.payload,
      updated_at: row.updated_at,
    });

    const chunks = [];
    for (let i = 0; i < payload.length; i += 200) chunks.push(payload.slice(i, i + 200));
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      if (ci > 0) await new Promise((r) => setTimeout(r, 300)); // pausa entre chunks para no saturar
      let { error } = await supabase.from(CLIENTES_TABLE).upsert(chunk, { onConflict: "id", ignoreDuplicates: false });
      if (error) {
        console.error("[guardarClientesEnSupabase] error upsert:", error?.message, error?.details, error?.code);
      }
      // Conflicto en unique constraint de codigo_abonado — reintentar ignorando duplicados
      if (error && (error?.code === "23505" || /duplicate key/i.test(String(error?.message || "")))) {
        const retry = await supabase.from(CLIENTES_TABLE).upsert(chunk, { onConflict: "id", ignoreDuplicates: true });
        error = retry.error;
        if (retry.error) console.error("[guardarClientesEnSupabase] retry ignoreDuplicates error:", retry.error?.message);
      }
      // identity column GENERATED ALWAYS — tratar igual que non-DEFAULT
      if (error && (error?.code === "428C9" || /non-DEFAULT value into column "id"/i.test(String(error?.message || "")))) {
        if (replaceAllOnIdentity) {
          // Modo importación completa desde Sheet: reemplaza todo para mantener conteo 1:1.
          const del = await supabase.from(CLIENTES_TABLE).delete().not("id", "is", null);
          if (del.error) throw del.error;
          const rowsNoId = payload.map(rowNoIdOf);
          const insChunks = [];
          for (let i = 0; i < rowsNoId.length; i += 500) insChunks.push(rowsNoId.slice(i, i + 500));
          for (const insChunk of insChunks) {
            const ins = await supabase.from(CLIENTES_TABLE).insert(insChunk);
            if (ins.error) throw ins.error;
          }
          return;
        }
        // Tablas legacy con `id` identity generated always: guardar sin enviar `id`.
        const codigos = Array.from(
          new Set(
            chunk
              .map((r) => String(r.codigo_cliente || "").trim())
              .filter(Boolean)
          )
        );

        const byCodigo = new Map();
        if (codigos.length) {
          const existingByCod = await supabase.from(CLIENTES_TABLE).select("id,codigo_cliente").in("codigo_cliente", codigos);
          if (existingByCod.error) throw existingByCod.error;
          (existingByCod.data || []).forEach((x) => {
            const k = String(x?.codigo_cliente || "").trim();
            if (k && !byCodigo.has(k)) byCodigo.set(k, x.id);
          });
        }

        const inserts = [];
        const updates = [];
        chunk.forEach((row) => {
          const codigo = String(row.codigo_cliente || "").trim();
          const existingId = byCodigo.get(codigo) || null;
          const payloadNoId = rowNoIdOf(row);
          if (existingId) {
            updates.push({ id: existingId, payload: payloadNoId });
          } else {
            inserts.push(payloadNoId);
          }
        });

        if (inserts.length) {
          const ins = await supabase.from(CLIENTES_TABLE).insert(inserts);
          if (ins.error) throw ins.error;
        }
        for (let i = 0; i < updates.length; i += 40) {
          const updBatch = updates.slice(i, i + 40);
          const results = await Promise.all(
            updBatch.map((updItem) =>
              supabase.from(CLIENTES_TABLE).update(updItem.payload).eq("id", updItem.id)
            )
          );
          const firstError = results.find((r) => r?.error)?.error;
          if (firstError) throw firstError;
        }
        error = null;
      }
      if (error) throw error;
    }
  };

  const importarClientesDesdeCSV = async (file) => {
    setImportCsvLoading(true);
    setImportCsvInfo("");
    try {
      const rawText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
        reader.readAsText(file);
      });

      const rows = parseGoogleSheetCsvRows(rawText);

      const getCol = (row, ...names) => {
        const keys = Object.keys(row);
        for (const name of names) {
          const normalizedName = name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const found = keys.find((k) => {
            const normalizedKey = k.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return normalizedKey === normalizedName;
          });
          if (found !== undefined && row[found] !== undefined && String(row[found]).trim() !== "") {
            return String(row[found]).trim();
          }
        }
        return "";
      };

      const newClients = [];
      rows.forEach((row, idx) => {
        const dni = getCol(row, "dni", "documento", "doc");
        if (!dni) return;
        const cliente = {
          dni,
          nombre: getCol(row, "nombre", "name", "cliente"),
          direccion: getCol(row, "direccion", "dirección", "address"),
          celular: getCol(row, "celular", "telefono", "teléfono", "phone", "cel"),
          email: getCol(row, "email"),
          nodo: getCol(row, "nodo", "node"),
          velocidad: getCol(row, "velocidad", "plan", "velocidad plan"),
          precioPlan: getCol(row, "precio", "precio_plan", "monto"),
          codigoAbonado: getCol(row, "codigo_abonado", "codigo abonado", "abonado", "cod_abonado"),
          codigoCliente: getCol(row, "codigo_cliente", "codigoCliente"),
        };
        newClients.push({ ...cliente, _idx: idx });
      });

      let agregados = 0;
      let actualizados = 0;

      setClientes((prev) => {
        const merged = [...prev];
        newClients.forEach((nc) => {
          const existingIndex = merged.findIndex((c) => String(c.dni || "").trim() === String(nc.dni).trim());
          if (existingIndex >= 0) {
            const existing = merged[existingIndex];
            merged[existingIndex] = {
              ...existing,
              ...Object.fromEntries(Object.entries(nc).filter(([k, v]) => k !== "_idx" && v !== "")),
              historialInstalaciones: existing.historialInstalaciones,
              equiposHistorial: existing.equiposHistorial,
            };
            actualizados++;
          } else {
            const { _idx, ...clienteData } = nc;
            merged.push({ ...clienteData, id: Date.now() + _idx });
            agregados++;
          }
        });
        const toSave = merged.filter((c) => newClients.some((nc) => String(nc.dni).trim() === String(c.dni || "").trim()));
        guardarClientesEnSupabase(toSave).catch(() => {});
        return merged;
      });

      setImportCsvInfo(`CSV importado: ${agregados} nuevos, ${actualizados} actualizados.`);
    } catch (err) {
      setImportCsvInfo("Error al importar CSV: " + (err?.message || String(err)));
    } finally {
      setImportCsvLoading(false);
    }
  };

  const cargarClientesDesdeSupabase = async (opts = { silent: true }) => {
    if (!isSupabaseConfigured) {
      setClientesSupabaseReady(true);
      return;
    }
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setClientesSyncLoading(true);
      setClientesSyncInfo("");
      setClientesSyncError("");
    }
    try {
      if (clientesSavePromiseRef.current) {
        if (!silent) setClientesSyncInfo("Esperando guardado pendiente en Supabase...");
        try {
          await clientesSavePromiseRef.current;
        } catch {
          // noop: si falla el guardado previo, igual intentamos recargar lo disponible
        }
      }
      const pageSize = 1000;
      const fetchAll = async (selectClause) => {
        let offset = 0;
        const all = [];
        while (true) {
          const { data, error } = await supabase
            .from(CLIENTES_TABLE)
            .select(selectClause)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (error) return { data: null, error };
          const chunk = Array.isArray(data) ? data : [];
          all.push(...chunk);
          if (chunk.length < pageSize) break;
          offset += pageSize;
        }
        return { data: all, error: null };
      };

      let { data, error } = await fetchAll(
        "id,codigo_abonado,codigo_cliente,dni,nombre,direccion,celular,email,contacto,empresa,velocidad,precio_plan,nodo,usuario_nodo,password_usuario,codigo_etiqueta,sn_onu,rx_signal,tx_signal,olt_ip,pon,onu_id,signal_updated_at,ubicacion,descripcion,tecnico,autor_orden,fecha_registro,ultima_actualizacion,foto_fachada,fotos_liquidacion,historial_instalaciones,equipos_historial,payload,updated_at"
      );
      if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
        const fallback = await fetchAll("id,dni,nombre,payload,updated_at");
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;
      const mapped = Array.isArray(data) ? data.map(deserializarClienteSupabase) : [];
      const dedupMap = new Map();
      mapped.forEach((c) => {
        const k = clienteMergeKey(c) || `tmp:${Math.random().toString(36).slice(2)}`;
        if (!dedupMap.has(k)) dedupMap.set(k, c);
      });
      const mappedDedup = Array.from(dedupMap.values());
      clientesHydratingRef.current = true;
      setClientes(mappedDedup);
      setTimeout(() => {
        clientesHydratingRef.current = false;
      }, 0);
      if (!silent) {
        setClientesSyncInfo(`Recargado desde Supabase: ${mappedDedup.length} cliente(s).`);
      }
    } catch (e) {
      if (!silent) setClientesSyncError(String(e?.message || "No se pudo cargar clientes desde Supabase."));
    } finally {
      setClientesSupabaseReady(true);
      if (!silent) setClientesSyncLoading(false);
    }
  };

  const cargarEquiposCatalogoDesdeSupabase = async () => {
    if (!isSupabaseConfigured) return;
    try {
      const pageSize = 1000;
      let offset = 0;
      const all = [];
      while (true) {
        const { data, error } = await supabase
          .from("equipos_catalogo")
          .select("id,empresa,tipo,marca,modelo,precio_unitario,codigo_qr,serial_mac,foto_referencia,estado,tecnico_asignado,almacen_id,almacen_nombre")
          .order("id", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) break;
        const chunk = Array.isArray(data) ? data : [];
        all.push(...chunk);
        if (chunk.length < pageSize) break;
        offset += pageSize;
      }
      if (all.length > 0) {
        const mapped = all.map((r) => ({
          id: r.id,
          empresa: r.empresa || "Americanet",
          tipo: r.tipo || "ONU",
          marca: r.marca || "",
          modelo: r.modelo || "",
          codigoQR: r.codigo_qr || "",
          serialMac: r.serial_mac || "",
          fotoReferencia: r.foto_referencia || "",
          estado: r.estado || "almacen",
          tecnicoAsignado: r.tecnico_asignado || "",
          almacenId: r.almacen_id || "",
          almacenNombre: r.almacen_nombre || "",
          precioUnitario: r.precio_unitario || 0,
        }));
        setEquiposCatalogo(mapped);
      }
    } catch (_) {
      // silencioso — datos de localStorage como fallback
    }
  };

  const cargarOrdenesDesdeSupabase = async (opts = { silent: true }) => {
    if (!isSupabaseConfigured) {
      setOrdenesSupabaseReady(true);
      return;
    }
    const silent = Boolean(opts?.silent);
    try {
      const pageSize = 1000;
      let offset = 0;
      const all = [];
      while (true) {
        const { data, error } = await supabase
          .from(ORDENES_TABLE)
          .select("*")
          .order("id", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const chunk = Array.isArray(data) ? data : [];
        all.push(...chunk);
        if (chunk.length < pageSize) break;
        offset += pageSize;
      }
      const mapped = all.map(deserializeOrderFromSupabase);
      setOrdenes(mapped);
      setOrdenesSyncError("");
    } catch (e) {
      const msg = String(e?.message || "No se pudo cargar ordenes desde Supabase.");
      setOrdenesSyncError(msg);
      if (!silent) alert(msg);
    } finally {
      setOrdenesSupabaseReady(true);
    }
  };

  const cargarLiquidacionesDesdeSupabase = async (opts = { silent: true }) => {
    if (!isSupabaseConfigured) return;
    const silent = Boolean(opts?.silent);
    try {
      const pageSize = 1000;
      let offset = 0;
      const all = [];
      while (true) {
        const { data, error } = await supabase
          .from("liquidaciones")
          .select("*")
          .order("id", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const chunk = Array.isArray(data) ? data : [];
        all.push(...chunk);
        if (chunk.length < pageSize) break;
        offset += pageSize;
      }
      let mapped = all.map(deserializeLiquidacionFromSupabase);
      // Enriquecer nodo desde ordenes para registros que no lo tienen
      const sinNodo = mapped.filter((r) => !r.nodo);
      if (sinNodo.length > 0) {
        try {
          const ordenIds = [...new Set(sinNodo.map((r) => Number(r.ordenOriginalId)).filter((x) => Number.isFinite(x) && x > 0))];
          const codigos  = [...new Set(sinNodo.map((r) => String(r.codigo || "").trim()).filter(Boolean))];
          const [byIdRes, byCodigoRes] = await Promise.all([
            ordenIds.length ? supabase.from(ORDENES_TABLE).select("id,nodo,codigo").in("id", ordenIds) : Promise.resolve({ data: [] }),
            codigos.length  ? supabase.from(ORDENES_TABLE).select("id,nodo,codigo").in("codigo", codigos) : Promise.resolve({ data: [] }),
          ]);
          const nodoMap = new Map();
          for (const row of [...(byIdRes.data || []), ...(byCodigoRes.data || [])]) {
            if (!String(row?.nodo || "").trim()) continue;
            if (row.id)     nodoMap.set(`id:${row.id}`, String(row.nodo).trim());
            if (row.codigo) nodoMap.set(`cod:${row.codigo}`, String(row.nodo).trim());
          }
          mapped = mapped.map((r) => {
            if (r.nodo) return r;
            const nodo = nodoMap.get(`id:${r.ordenOriginalId}`) || nodoMap.get(`cod:${r.codigo}`) || "";
            return nodo ? { ...r, nodo } : r;
          });
        } catch { /* silent */ }
      }
      setLiquidaciones(mapped);
    } catch (e) {
      if (!silent) alert(String(e?.message || "No se pudo cargar liquidaciones desde Supabase."));
    }
  };

  const abrirFotoZoom = (src = "", titulo = "Foto") => {
    if (!src) return;
    setFotoZoomSrc(src);
    setFotoZoomTitulo(titulo);
    setFotoZoomEscala(1);
  };

  const cerrarFotoZoom = () => {
    setFotoZoomSrc("");
    setFotoZoomTitulo("");
    setFotoZoomEscala(1);
  };

  const syncClientesDesdeSheet = async () => {
    setClientesSyncLoading(true);
    setClientesSyncInfo("");
    setClientesSyncError("");
    try {
      const sourceLabel = `gid:${CLIENTES_SHEET_GID}`;
      const url = `https://docs.google.com/spreadsheets/d/${CLIENTES_SHEET_ID}/export?format=csv&gid=${encodeURIComponent(
        CLIENTES_SHEET_GID
      )}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`No se pudo leer Google Sheet de clientes (${sourceLabel}).`);
      const text = await res.text();
      const sourceRows = parseGoogleSheetCsvRows(text);
      const rows = sourceRows.map((row, idx) => ({
        ...row,
        __sheetTab: sourceLabel,
        __sheetRow: idx + 1,
      }));
      if (!rows.length) {
        setClientesSyncInfo("No se encontraron filas en la hoja de clientes.");
        return;
      }

      const keyOf = (item = {}) => clienteMergeKey(item);

      const prevByKey = new Map();
      clientes.forEach((c) => {
        const k = keyOf(c);
        if (k) prevByKey.set(k, c);
        const cod = String(c?.codigoCliente || "").trim().toLowerCase();
        if (cod && cod !== "-") prevByKey.set(`cod:${cod}`, c);
        const dniNorm = String(c?.dni || "").replace(/\D/g, "").trim();
        if (dniNorm && dniNorm.length >= 6) prevByKey.set(`dni:${dniNorm}`, c);
      });

      const parseRows = rows
        .map((r, i) => {
          const idx = new Map(Object.entries(r).map(([k, v]) => [normalizarClaveSheet(k), String(v || "").trim()]));
          const take = (...keys) => {
            for (const key of keys) {
              const value = idx.get(normalizarClaveSheet(key));
              if (value) return value;
            }
            return "";
          };
          const allEntries = Array.from(idx.entries());
          const extractPhotos = (matcher) =>
            allEntries
              .filter(([k, v]) => matcher(k) && String(v || "").trim())
              .map(([, v]) => normalizeClienteSheetPhotoUrl(v))
              .filter(Boolean);
          const unique = (arr = []) => Array.from(new Set(arr.filter(Boolean)));

          const codigoCliente = take("CodigoCliente", "Codigo cliente", "Codigo", "ID", "IdCliente");
          const dni = take("DNI", "Dni");
          const nombre = take("NombreCliente", "Nombre cliente", "Cliente", "Nombre");
          const idSheet = String(take("Id", "ID", "id", "IdCliente") || "").trim();
          const dniNormalizado = String(firstText(dni, take("Cedula", "Cédula")) || "")
            .replace(/\D/g, "")
            .trim();
          const idTemporal = idSheet || dniNormalizado || `sheet-${r.__sheetTab || "tab"}-${r.__sheetRow || i + 1}`;
          if (!dni && !codigoCliente && !nombre) return null;

          const fotoFachadaRaw = firstText(
            take("FotoFachada", "Foto fachada", "Fachada", "FotoCliente", "Foto"),
            extractPhotos((k) => k.includes("fachada"))[0]
          );
          const fotoFachada = normalizeClienteSheetPhotoUrl(fotoFachadaRaw);

          const fotosExtra = unique(
            [
              ...extractPhotos((k) => k.includes("foto") || k.includes("imagen") || k.includes("image")),
              ...extractPhotos((k) => k.includes("liquidacion") || k.includes("evidencia")),
            ].filter((u) => u && u !== fotoFachada)
          );

          return {
            id: idTemporal,
            origen: "sheet",
            codigoCliente: codigoCliente || "-",
            dni: firstText(take("Cedula", "Cédula"), dni, take("DNI", "Dni")) || "-",
            nombre: nombre || "-",
            direccion: take("Direccion", "Dirección", "Direccion Principal", "Dirección Principal", "Domicilio", "UbicacionDireccion"),
            celular: take("Celular", "Telefono", "Teléfono", "Movil"),
            email: take("Email", "Correo"),
            contacto: take("Contacto", "Referencia"),
            empresa: take("Empresa", "Operador", "Proveedor"),
            estado: take("Estado", "Estado cliente", "Estado servicio"),
            velocidad: take("Plan", "Velocidad", "PlanVelocidad"),
            precioPlan: take("PrecioPlan", "Precio", "Monto"),
            nodo: take("Nodo"),
            usuarioNodo: take("UsuarioNodo", "Usuario PPPoE", "UsuarioPPPoE", "User PPP/Hotspot", "Usuario"),
            passwordUsuario: take("PasswordUsuario", "Clave", "Contrasena", "Contraseña"),
            codigoEtiqueta: take("CodigoEtiqueta", "CódigoEtiqueta", "Cod Etiqueta", "Etiqueta"),
            ubicacion: take("Ubicacion", "Coordenadas"),
            descripcion: take("Descripcion", "Descripción", "Observacion", "Observación"),
            tecnico: take("Tecnico", "Técnico", "TecnicoAsignado"),
            autorOrden: take("AutorOrden", "Autor"),
            fechaRegistro: firstText(formatFechaFlexible(take("Instalado")), take("FechaRegistro"), formatFechaFlexible(take("Fecha"))),
            ultimaActualizacion: firstText(
              formatFechaFlexible(take("UltimaActualizacion")),
              formatFechaFlexible(take("FechaActualizacion")),
              new Date().toLocaleString("es-PE")
            ),
            fotoFachada,
            fotosLiquidacion: fotosExtra,
          };
        })
        .filter(Boolean);

      const imported = parseRows.map((row) => {
        const key = keyOf(row);
        const dniNormRow = String(row?.dni || "").replace(/\D/g, "").trim();
        const prev = prevByKey.get(key)
          || (dniNormRow.length >= 6 ? prevByKey.get(`dni:${dniNormRow}`) : undefined);
        return {
          ...prev,
          ...row,
          id: prev?.id || row.id,
          historialInstalaciones: Array.isArray(prev?.historialInstalaciones) ? prev.historialInstalaciones : [],
          equiposHistorial: Array.isArray(prev?.equiposHistorial) ? prev.equiposHistorial : [],
          fotos: Array.isArray(prev?.fotos) ? prev.fotos : [],
          fotoFachada: row.fotoFachada || prev?.fotoFachada || "",
          fotosLiquidacion:
            Array.isArray(row.fotosLiquidacion) && row.fotosLiquidacion.length > 0
              ? row.fotosLiquidacion
              : Array.isArray(prev?.fotosLiquidacion)
              ? prev.fotosLiquidacion
              : [],
        };
      });

      const isSheetLikeLegacy = (c = {}) => {
        const id = String(c?.id || "").trim().toLowerCase();
        if (String(c?.origen || "").trim().toLowerCase() === "sheet") return true;
        if (id.startsWith("sheet-")) return true;
        const sinHistorial =
          (!Array.isArray(c?.historialInstalaciones) || c.historialInstalaciones.length === 0) &&
          (!Array.isArray(c?.equiposHistorial) || c.equiposHistorial.length === 0);
        const tieneHuellaImportada =
          String(c?.codigoCliente || "").trim() === "-" &&
          String(c?.dni || "").trim() !== "" &&
          String(c?.nombre || "").trim() !== "";
        return sinHistorial && tieneHuellaImportada;
      };

      const restantesLocales = clientes.filter((c) => !isSheetLikeLegacy(c));

      const finalListaRaw = [...imported, ...restantesLocales];
      const finalMap = new Map();
      finalListaRaw.forEach((c) => {
        const k = keyOf(c) || `tmp:${Math.random().toString(36).slice(2)}`;
        if (!finalMap.has(k)) {
          finalMap.set(k, c);
          return;
        }
        const prev = finalMap.get(k) || {};
        finalMap.set(k, {
          ...prev,
          ...c,
          historialInstalaciones: Array.isArray(c.historialInstalaciones) && c.historialInstalaciones.length
            ? c.historialInstalaciones
            : Array.isArray(prev.historialInstalaciones)
            ? prev.historialInstalaciones
            : [],
          equiposHistorial: Array.isArray(c.equiposHistorial) && c.equiposHistorial.length
            ? c.equiposHistorial
            : Array.isArray(prev.equiposHistorial)
            ? prev.equiposHistorial
            : [],
          fotosLiquidacion: Array.isArray(c.fotosLiquidacion) && c.fotosLiquidacion.length
            ? c.fotosLiquidacion
            : Array.isArray(prev.fotosLiquidacion)
            ? prev.fotosLiquidacion
            : [],
        });
      });
      const finalLista = Array.from(finalMap.values());
      setClientes(finalLista);
      setClientesSyncInfo(
        `Clientes importados desde ${sourceLabel}: ${imported.length}. Total final: ${finalLista.length}.`
      );
      if (isSupabaseConfigured) {
        setClientesSupabaseSaving(true);
        const withTimeout = (promise, ms = 180000) =>
          Promise.race([
            promise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout guardando clientes en Supabase.")), ms)
            ),
          ]);

        const savePromise = withTimeout(guardarClientesEnSupabase(finalLista, { replaceAllOnIdentity: true }))
          .then(() => {
            setClientesSyncInfo(
              `Clientes importados desde ${sourceLabel}: ${imported.length}. Total final: ${finalLista.length}. Guardado en Supabase completado.`
            );
          })
          .catch((saveErr) => {
            setClientesSyncError(`Importado OK, pero falló guardado en Supabase: ${String(saveErr?.message || saveErr)}`);
          })
          .finally(() => {
            setClientesSupabaseSaving(false);
            if (clientesSavePromiseRef.current === savePromise) {
              clientesSavePromiseRef.current = null;
            }
          });
        clientesSavePromiseRef.current = savePromise;
      }
    } catch (e) {
      setClientesSyncError(String(e?.message || "No se pudo actualizar clientes desde Google Sheet."));
    } finally {
      setClientesSyncLoading(false);
    }
  };

  const equiposFiltrados = useMemo(() => {
    const q = busquedaEquipos.trim().toLowerCase();
    if (!q) return equiposCatalogo;

    return equiposCatalogo.filter((eq) => {
      return (
        safeIncludes(eq.empresa, q) ||
        safeIncludes(eq.tipo, q) ||
        safeIncludes(eq.marca, q) ||
        safeIncludes(eq.modelo, q) ||
        safeIncludes(eq.codigoQR, q) ||
        safeIncludes(eq.serialMac, q) ||
        safeIncludes(eq.estado, q) ||
        safeIncludes(eq.tecnicoAsignado, q) ||
        safeIncludes(eq.clienteNombre, q) ||
        safeIncludes(eq.clienteDni, q)
      );
    });
  }, [equiposCatalogo, busquedaEquipos]);

  const equiposDisponiblesParaAsignar = useMemo(() => {
    return equiposCatalogo.filter((eq) => eq.estado === "almacen");
  }, [equiposCatalogo]);

  const equiposDisponiblesParaSeleccionManual = useMemo(() => {
    if (!ordenEnLiquidacion) return [];

    const tecnicoEsperado = liquidacion.tecnicoLiquida || ordenEnLiquidacion.tecnico || "";

    return equiposCatalogo.filter((eq) => {
      if (eq.estado !== "asignado") return false;
      if (!tecnicoEsperado) return true;
      return String(eq.tecnicoAsignado || "") === String(tecnicoEsperado);
    });
  }, [equiposCatalogo, liquidacion.tecnicoLiquida, ordenEnLiquidacion]);

  const handleChange = (field, value) => {
    setOrden((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNodoChange = (nodoValue) => {
    setOrden((prev) => {
      const nextNodo = String(nodoValue || "").trim();
      const passwordSugerido = sugerirPasswordPorNodo(nextNodo);
      if (String(prev.generarUsuario || "").toUpperCase() !== "SI") {
        return { ...prev, nodo: nextNodo, passwordUsuario: passwordSugerido || prev.passwordUsuario };
      }
      const sugerido = sugerirUsuarioPorNodo(nextNodo, usuariosNodoUsados, usuariosNodoHabilitadosManual);
      if (!sugerido) return { ...prev, nodo: nextNodo, passwordUsuario: passwordSugerido || prev.passwordUsuario };
      return {
        ...prev,
        nodo: nextNodo,
        usuarioNodo: sugerido,
        passwordUsuario: passwordSugerido || prev.passwordUsuario,
      };
    });
  };

  const normalizarUsuarioNodo = (value = "") => String(value || "").trim().toLowerCase();
  const usuarioNodoActualNormalizado = useMemo(
    () => normalizarUsuarioNodo(orden.usuarioNodo),
    [orden.usuarioNodo]
  );
  const usuarioNodoEstaBloqueado = useMemo(
    () =>
      Boolean(
        usuarioNodoActualNormalizado &&
          (Array.isArray(usuariosNodoBloqueados) ? usuariosNodoBloqueados : []).some(
            (u) => normalizarUsuarioNodo(u) === usuarioNodoActualNormalizado
          )
      ),
    [usuarioNodoActualNormalizado, usuariosNodoBloqueados]
  );

  const bloquearUsuarioNodoManual = () => {
    if (!esAdminSesion && !esGestorSesion) return;
    const raw = String(orden.usuarioNodo || "").trim();
    if (!raw) {
      alert("Ingresa un usuario para bloquear.");
      return;
    }
    const nodoActual = String(orden.nodo || "").trim();
    if (!usuarioNodoCoincideRegla(raw, nodoActual)) {
      alert("El usuario no coincide con el formato del nodo seleccionado.");
      return;
    }
    if (usuarioNodoEstaBloqueado) {
      setUsuarioNodoAccionMsg(`El usuario ${raw} ya está deshabilitado.`);
      return;
    }
    setUsuariosNodoBloqueados((prev) => {
      const exists = (Array.isArray(prev) ? prev : []).some((u) => normalizarUsuarioNodo(u) === normalizarUsuarioNodo(raw));
      if (exists) return prev;
      return [...(Array.isArray(prev) ? prev : []), raw];
    });
    setUsuariosNodoHabilitadosManual((prev) =>
      (Array.isArray(prev) ? prev : []).filter((u) => normalizarUsuarioNodo(u) !== normalizarUsuarioNodo(raw))
    );
    setUsuarioNodoAccionMsg(`Usuario ${raw} deshabilitado manualmente.`);
  };

  const habilitarUsuarioNodoManual = () => {
    if (!esAdminSesion && !esGestorSesion) return;
    const raw = String(orden.usuarioNodo || "").trim();
    if (!raw) {
      alert("Ingresa un usuario para habilitar.");
      return;
    }
    const nodoActual = String(orden.nodo || "").trim();
    if (!usuarioNodoCoincideRegla(raw, nodoActual)) {
      alert("El usuario no coincide con el formato del nodo seleccionado.");
      return;
    }
    if (!usuarioNodoEstaBloqueado) {
      setUsuarioNodoAccionMsg(`El usuario ${raw} ya está habilitado.`);
      return;
    }
    setUsuariosNodoBloqueados((prev) =>
      (Array.isArray(prev) ? prev : []).filter((u) => normalizarUsuarioNodo(u) !== normalizarUsuarioNodo(raw))
    );
    setUsuariosNodoHabilitadosManual((prev) => {
      const exists = (Array.isArray(prev) ? prev : []).some((u) => normalizarUsuarioNodo(u) === normalizarUsuarioNodo(raw));
      if (exists) return prev;
      return [...(Array.isArray(prev) ? prev : []), raw];
    });
    setUsuarioNodoAccionMsg(`Usuario ${raw} habilitado manualmente.`);
  };

  const handleLiquidacionChange = (field, value) => {
    setLiquidacion((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const iniciarSesion = async () => {
    const username = String(credencialesLogin.username || "").trim().toLowerCase();
    const password = String(credencialesLogin.password || "");
    if (!username || !password) {
      setErrorLogin("Ingresa usuario y contraseña.");
      return;
    }
    // Consultar Supabase directamente para tener siempre la contraseña más reciente
    let encontrado = null;
    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase
          .from(USUARIOS_TABLE)
          .select("*")
          .eq("activo", true)
          .ilike("username", username)
          .limit(1)
          .maybeSingle();
        if (data && String(data.password || "123456") === password) {
          encontrado = deserializarUsuarioSupabase(data);
        }
      } catch { /* fallback al estado local */ }
    }
    // Fallback al estado local si Supabase no está disponible
    if (!encontrado) {
      const local = usuariosActivos.find((u) => {
        const uName = String(u.username || usernameDesdeNombre(u.nombre || "")).trim().toLowerCase();
        return uName === username && String(u.password || "123456") === password;
      });
      if (local) encontrado = local;
    }
    if (!encontrado) {
      setErrorLogin("Credenciales inválidas.");
      return;
    }
    // Generar token de sesión y registrar acceso
    const token = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    try {
      await supabase.from(USUARIOS_TABLE).update({ sesion_token: token, ultimo_acceso: new Date().toISOString() }).eq("id", encontrado.supabaseId ?? encontrado.id);
    } catch { /* no bloquear login */ }
    localStorage.setItem("sesionToken", token);
    // Sincronizar usuario actualizado al estado local
    setUsuarios((prev) => {
      const existe = prev.find((u) => String(u.username || "").toLowerCase() === username);
      if (existe) return prev.map((u) => String(u.username || "").toLowerCase() === username ? { ...u, ...encontrado } : u);
      return [encontrado, ...prev];
    });
    setUsuarioSesionId(Number(encontrado.id));
    void supabase.from("logs").insert([{ accion: "login", categoria: "sesion", criticidad: "normal", usuario: encontrado.nombre || encontrado.username, rol: encontrado.rol, empresa: encontrado.empresa, dispositivo: "web", detalle: { username: encontrado.username } }]);
    setErrorLogin("");
    setCredencialesLogin({ username: "", password: "" });
  };

  const cerrarSesion = ({ motivo = "" } = {}) => {
    if (sessionIdleTimeoutRef.current) {
      window.clearTimeout(sessionIdleTimeoutRef.current);
      sessionIdleTimeoutRef.current = null;
    }
    localStorage.removeItem("sesionToken");
    if (isSupabaseConfigured && usuarioSesion) void supabase.from("logs").insert([{ accion: "logout", categoria: "sesion", criticidad: "normal", usuario: usuarioSesion.nombre, rol: usuarioSesion.rol, empresa: usuarioSesion.empresa, dispositivo: "web", detalle: motivo ? { motivo } : {} }]);
    setUsuarioSesionId(null);
    setCredencialesLogin({ username: "", password: "" });
    setErrorLogin("");
    setVistaActiva("crear");
    setMostrarMenuSesion(false);
    if (motivo) {
      window.alert(motivo);
    }
  };

  // Verificación periódica de sesión: activo + token (igual que mobile)
  useEffect(() => {
    if (!usuarioSesionId || !isSupabaseConfigured) return undefined;
    let cancelled = false;
    const verificarSesion = async () => {
      try {
        let res = await supabase.from(USUARIOS_TABLE).select("activo, sesion_token, forzar_logout").eq("id", usuarioSesionId).maybeSingle();
        if (res.error && String(res.error?.message || "").toLowerCase().includes("forzar_logout")) {
          res = await supabase.from(USUARIOS_TABLE).select("activo, sesion_token").eq("id", usuarioSesionId).maybeSingle();
        }
        const { data } = res;
        if (cancelled || !data) return;
        if (data.activo === false) {
          if (sessionIdleTimeoutRef.current) { window.clearTimeout(sessionIdleTimeoutRef.current); sessionIdleTimeoutRef.current = null; }
          localStorage.removeItem("sesionToken");
          setUsuarioSesionId(null);
          setVistaActiva("crear");
          window.alert("Tu cuenta fue desactivada por el administrador.");
          return;
        }
        if (data.forzar_logout === true) {
          await supabase.from(USUARIOS_TABLE).update({ forzar_logout: false }).eq("id", usuarioSesionId);
          if (sessionIdleTimeoutRef.current) { window.clearTimeout(sessionIdleTimeoutRef.current); sessionIdleTimeoutRef.current = null; }
          localStorage.removeItem("sesionToken");
          setUsuarioSesionId(null);
          setVistaActiva("crear");
          window.alert("Tu sesión fue cerrada por el administrador.");
          return;
        }
        const tokenLocal = localStorage.getItem("sesionToken");
        if (tokenLocal && data.sesion_token && data.sesion_token !== tokenLocal) {
          if (sessionIdleTimeoutRef.current) { window.clearTimeout(sessionIdleTimeoutRef.current); sessionIdleTimeoutRef.current = null; }
          localStorage.removeItem("sesionToken");
          setUsuarioSesionId(null);
          setVistaActiva("crear");
          window.alert("Tu sesión fue cerrada remotamente por el administrador.");
          return;
        }
        // Registrar último acceso silenciosamente
        supabase.from(USUARIOS_TABLE).update({ ultimo_acceso: new Date().toISOString() }).eq("id", usuarioSesionId).then(() => {});
      } catch { /* error de red: mantener sesión */ }
    };
    verificarSesion();
    const interval = setInterval(verificarSesion, 15000); // cada 15s
    return () => { cancelled = true; clearInterval(interval); };
  }, [usuarioSesionId]);

  useEffect(() => {
    if (!usuarioSesionId) {
      if (sessionIdleTimeoutRef.current) {
        window.clearTimeout(sessionIdleTimeoutRef.current);
        sessionIdleTimeoutRef.current = null;
      }
      return undefined;
    }
    const minutos = Number(sessionIdleMinutes);
    if (!Number.isFinite(minutos) || minutos <= 0) {
      if (sessionIdleTimeoutRef.current) {
        window.clearTimeout(sessionIdleTimeoutRef.current);
        sessionIdleTimeoutRef.current = null;
      }
      return undefined;
    }

    const reiniciarTemporizador = () => {
      if (sessionIdleTimeoutRef.current) {
        window.clearTimeout(sessionIdleTimeoutRef.current);
      }
      sessionIdleTimeoutRef.current = window.setTimeout(() => {
        cerrarSesion({ motivo: `Sesión cerrada por ${minutos} minuto(s) de inactividad.` });
      }, minutos * 60 * 1000);
    };

    const eventos = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "focus"];
    eventos.forEach((eventName) => window.addEventListener(eventName, reiniciarTemporizador, { passive: true }));
    reiniciarTemporizador();

    return () => {
      eventos.forEach((eventName) => window.removeEventListener(eventName, reiniciarTemporizador));
      if (sessionIdleTimeoutRef.current) {
        window.clearTimeout(sessionIdleTimeoutRef.current);
        sessionIdleTimeoutRef.current = null;
      }
    };
  }, [usuarioSesionId, sessionIdleMinutes]);

  const cargarHistorialAppsheetEquipos = async () => {
    if (!isSupabaseConfigured) {
      setHistorialAppsheetError("Configura Supabase para ver historial AppSheet.");
      return;
    }
    setHistorialAppsheetLoading(true);
    try {
      const selectFull =
        "id,id_onu,id_register,producto,producto_codigo,info_producto,marca,modelo,estado,tecnico_asignado_codigo,fecha_registro,foto_etiqueta_url,foto_producto_url,usuario_pppoe,nodo,nombre_cliente,dni,liquidado_por_codigo,fecha_liquidacion,fecha_asignacion,empresa,foto02_url,precio_unitario,updated_at";
      let { data, error } = await supabase
        .from(HIST_APPSHEET_TABLE)
        .select(selectFull)
        .order("updated_at", { ascending: false })
        .limit(3000);
      if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
        const fallback = await supabase
          .from(HIST_APPSHEET_TABLE)
          .select(
            "id,id_onu,id_register,producto,estado,tecnico_asignado_codigo,fecha_registro,foto_etiqueta_url,usuario_pppoe,nodo,nombre_cliente,dni,liquidado_por_codigo,fecha_liquidacion,fecha_asignacion,empresa,foto02_url,updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(3000);
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;
      setHistorialAppsheetEquipos(Array.isArray(data) ? data : []);
      setHistorialAppsheetError("");
    } catch (e) {
      setHistorialAppsheetError(String(e?.message || "No se pudo cargar historial AppSheet."));
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const sincronizarHistorialAppsheetEquipos = async () => {
    if (!isSupabaseConfigured) {
      window.alert("Configura Supabase para sincronizar historial AppSheet.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    setHistorialAppsheetInfo("");
    try {
      const [rows, articulosRows] = await Promise.all([
        fetchGoogleSheetRowsRobust({
          sheetId: HIST_APPSHEET_SHEET_ID,
          sheetName: HIST_APPSHEET_SHEET_TAB,
          context: "ONUsRegistradas",
          requiredKeys: ["IDONU", "Producto", "DNI"],
        }),
        fetchGoogleSheetRowsRobust({
          sheetId: HIST_APPSHEET_SHEET_ID,
          gid: HIST_APPSHEET_ART_GID,
          sheetName: HIST_APPSHEET_ARTICULOS_TAB,
          context: "ARTICULOS",
          requiredKeys: ["ID_ARTICULO", "NOMBRE", "PrecioUnitario"],
        }),
      ]);
      const [syncState, tableCount] = await Promise.all([
        fetchHistorialSyncState(HIST_SYNC_KEY_EQUIPOS),
        fetchSupabaseExactCount(HIST_APPSHEET_TABLE).catch(() => 0),
      ]);
      const prevCount = Number(syncState?.row_count || 0);
      if (rows.length <= prevCount && tableCount > 0) {
        await cargarHistorialAppsheetEquipos();
        setHistorialAppsheetInfo(`Sin cambios en ONUsRegistradas. Sheet: ${rows.length} fila(s), último sync: ${prevCount}.`);
        return;
      }
      const articulosMap = new Map();
      articulosRows.forEach((row) => {
        const idx = new Map(Object.entries(row).map(([k, v]) => [normalizarClaveSheet(k), v]));
        const take = (...keys) => {
          for (const key of keys) {
            const value = idx.get(normalizarClaveSheet(key));
            if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
          }
          return "";
        };
        const idArticulo = take("ID_ARTICULO", "ID ARTICULO", "IDArticulo");
        if (!idArticulo) return;
        const fotoArtRaw = take("FOTO_ART", "FOTO ART");
        articulosMap.set(normalizarCodigoCatalogo(idArticulo), {
          id_articulo: idArticulo,
          nombre: take("NOMBRE"),
          info: take("INFO"),
          marca: take("Marca"),
          modelo: take("Modelo"),
          precio_unitario: Number(String(take("PrecioUnitario")).replace(",", ".")) || 0,
          foto_art_raw: fotoArtRaw,
          foto_art_url: normalizePhotoUrlPortal(fotoArtRaw, HIST_APPSHEET_ARTICULOS_TAB),
        });
      });
      const payload = rows
        .map((r) => {
          const index = new Map(Object.entries(r).map(([k, v]) => [normalizarClaveSheet(k), v]));
          const get = (...keys) => {
            for (const k of keys) {
              const v = index.get(normalizarClaveSheet(k));
              if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
            }
            return "";
          };
          const idOnu = get("IDONU");
          if (!idOnu) return null;
          const productoCodigo = get("Producto");
          const art = articulosMap.get(normalizarCodigoCatalogo(productoCodigo)) || null;
          const fotoEtiquetaRaw = get("FotoEtiqueta");
          const foto02Raw = get("Foto02");
          return {
            id_onu: idOnu,
            id_register: get("IDregister"),
            producto: firstText(art?.nombre, productoCodigo),
            producto_codigo: productoCodigo,
            info_producto: firstText(art?.info),
            marca: firstText(art?.marca),
            modelo: firstText(art?.modelo),
            precio_unitario: Number(art?.precio_unitario || 0),
            estado: estadoAppsheetNormalizado(get("Estado")),
            tecnico_asignado_codigo: resolverNombreDesdeCodigoTecnico(get("TecnicoAsignado", "TécnicoAsignado")),
            fecha_registro: get("FechaRegistro"),
            foto_etiqueta_raw: fotoEtiquetaRaw,
            foto_etiqueta_url: normalizePhotoUrlPortal(fotoEtiquetaRaw, HIST_APPSHEET_SHEET_TAB),
            foto_producto_raw: firstText(art?.foto_art_raw),
            foto_producto_url: firstText(art?.foto_art_url),
            usuario_pppoe: get("UsuarioPPPoE"),
            nodo: get("Nodo"),
            nombre_cliente: get("NombreCliente"),
            dni: get("DNI"),
            liquidado_por_codigo: resolverNombreDesdeCodigoTecnico(get("LiquidadoPor")),
            fecha_liquidacion: get("FechaLiquidacion"),
            fecha_asignacion: get("Fecha de Asignacion"),
            empresa: get("Empresa"),
            foto02_raw: foto02Raw,
            foto02_url: normalizePhotoUrlPortal(foto02Raw),
            source_sheet: HIST_APPSHEET_SHEET_TAB,
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      if (!payload.length) {
        window.alert("No se encontraron filas con IDONU en ONUsRegistradas.");
        return;
      }

      const chunks = [];
      for (let i = 0; i < payload.length; i += 200) chunks.push(payload.slice(i, i + 200));
      for (const chunk of chunks) {
        let { error } = await supabase.from(HIST_APPSHEET_TABLE).upsert(chunk, { onConflict: "id_onu" });
        if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
          const fallbackChunk = chunk.map((r) => ({
            id_onu: r.id_onu,
            id_register: r.id_register,
            producto: r.producto,
            estado: r.estado,
            tecnico_asignado_codigo: r.tecnico_asignado_codigo,
            fecha_registro: r.fecha_registro,
            foto_etiqueta_raw: r.foto_etiqueta_raw,
            foto_etiqueta_url: r.foto_etiqueta_url,
            usuario_pppoe: r.usuario_pppoe,
            nodo: r.nodo,
            nombre_cliente: r.nombre_cliente,
            dni: r.dni,
            liquidado_por_codigo: r.liquidado_por_codigo,
            fecha_liquidacion: r.fecha_liquidacion,
            fecha_asignacion: r.fecha_asignacion,
            empresa: r.empresa,
            foto02_raw: r.foto02_raw,
            foto02_url: r.foto02_url,
            source_sheet: r.source_sheet,
            updated_at: r.updated_at,
          }));
          const retry = await supabase.from(HIST_APPSHEET_TABLE).upsert(fallbackChunk, { onConflict: "id_onu" });
          error = retry.error;
        }
        if (error) throw error;
      }

      await cargarHistorialAppsheetEquipos();
      await upsertHistorialSyncState(HIST_SYNC_KEY_EQUIPOS, {
        row_count: rows.length,
        target_table: HIST_APPSHEET_TABLE,
        note: `Sync ONUsRegistradas: ${payload.length} fila(s) procesadas.`,
      });
      setHistorialAppsheetInfo(`Sync completado: ${payload.length} fila(s) procesadas.`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo sincronizar.")} Si la tabla no existe, ejecuta el SQL de historial AppSheet.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const cargarHistorialAppsheetLiquidaciones = async () => {
    if (!isSupabaseConfigured) {
      setHistorialAppsheetError("Configura Supabase para ver historial AppSheet.");
      return;
    }
    setHistorialAppsheetLoading(true);
    try {
      const selectFull =
        "id,codigo,orden,orden_id,actuacion,tipo_actuacion,fecha,cliente,nombre,dni,direccion,celular,ubicacion_gps,user_hotspot,parametro,metodo_pago,captura_pago_url,foto_fachada_url,observacion,foto_opcional_url,drop_monto_plan,conector_fibra_velocidad,cable_rg6_codigo_etiqueta,personal_tecnico,foto_onu_url,user_pppoe,photo_caj_url,photo_onu_url,autor,empresa,nodo,tecnico,resultado,monto,sn_onu,estado,source_sheet,payload,updated_at";
      const fetchAll = async (selectClause) => {
        const pageSize = 1000;
        let offset = 0;
        const all = [];
        while (true) {
          const { data, error } = await supabase
            .from(HIST_APPSHEET_LIQ_TABLE)
            .select(selectClause)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (error) return { data: null, error };
          const chunk = Array.isArray(data) ? data : [];
          all.push(...chunk);
          if (chunk.length < pageSize) break;
          offset += pageSize;
        }
        return { data: all, error: null };
      };

      let { data, error } = await fetchAll(selectFull);
      if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
        const fallback = await fetchAll("id,codigo,fecha,cliente,dni,nodo,tecnico,resultado,monto,payload,updated_at");
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;
      setHistorialAppsheetLiquidaciones(Array.isArray(data) ? data : []);
      setHistorialAppsheetError("");
    } catch (e) {
      setHistorialAppsheetError(String(e?.message || "No se pudo cargar liquidaciones AppSheet."));
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const sincronizarHistorialAppsheetLiquidaciones = async () => {
    if (!isSupabaseConfigured) {
      window.alert("Configura Supabase para sincronizar historial AppSheet.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    setHistorialAppsheetInfo("");
    try {
      const rows = await fetchGoogleSheetRowsRobust({
        sheetId: HIST_APPSHEET_SHEET_ID,
        gid: HIST_APPSHEET_LIQ_GID,
        sheetName: HIST_APPSHEET_LIQ_TAB,
        context: "Liquidaciones",
        requiredKeys: ["Codigo", "DNI", "Nodo", "Monto"],
      });
      const [syncState, tableCount] = await Promise.all([
        fetchHistorialSyncState(HIST_SYNC_KEY_LIQUIDACIONES),
        fetchSupabaseExactCount(HIST_APPSHEET_LIQ_TABLE).catch(() => 0),
      ]);
      const prevCount = Number(syncState?.row_count || 0);
      if (rows.length <= prevCount && tableCount > 0) {
        await cargarHistorialAppsheetLiquidaciones();
        setHistorialAppsheetInfo(`Sin cambios en Liquidaciones. Sheet: ${rows.length} fila(s), último sync: ${prevCount}.`);
        return;
      }

      const payloadRaw = rows
        .map((r, idx) => {
          const index = new Map(Object.entries(r).map(([k, v]) => [normalizarClaveSheet(k), v]));
          const get = (...keys) => {
            for (const k of keys) {
              const v = index.get(normalizarClaveSheet(k));
              if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
            }
            return "";
          };
          const codigo = firstText(get("Codigo"), get("Código"), get("Codigo orden"), get("Codigo de orden"), get("Orden ID"), `LIQ-${idx + 1}`);
          const montoRaw = firstText(get("Monto cobrado"), get("Monto"), get("Costo"), "0").replace(",", ".");
          const monto = Number(montoRaw);
          const capturaPagoRaw = firstText(get("Captura de pago"), get("IMG Pago"), get("CapturaPago"));
          const fotoFachadaRaw = firstText(get("Foto fachada"), get("IMG Fachada"), get("FotoFachada"));
          const fotoOpcionalRaw = firstText(get("Foto Opcional"), get("IMG otros"), get("FotoOpcional"));
          const fotoOnuRaw = firstText(get("Foto Onu"), get("IMG ONU"), get("FotoOnu"));
          const photoCajRaw = firstText(get("Photo Caj"), get("PhotoCaj"));
          const photoOnuRaw = firstText(get("Photo Onu"), get("PhotoOnu"));
          return {
            codigo,
            orden_id: get("Orden ID"),
            actuacion: get("Actuacion"),
            orden: firstText(get("Orden"), get("Tipo de orden")),
            tipo_actuacion: firstText(get("Tipo de actuacion"), get("Tipo actuacion"), get("Actuacion"), get("Actuación")),
            fecha: firstText(get("Fecha"), get("Fecha2"), get("Fecha de liquidacion"), get("Fecha liquidacion")),
            cliente: firstText(get("Nombre"), get("Nombre cliente"), get("Cliente")),
            nombre: firstText(get("Nombre"), get("Nombre cliente"), get("Cliente")),
            dni: firstText(get("DNI"), get("Cedula"), get("Cédula")),
            direccion: get("Direccion"),
            celular: get("Celular"),
            ubicacion_gps: get("Ubicacion GPS"),
            user_hotspot: get("User"),
            parametro: get("Parametro"),
            metodo_pago: get("Metodo de pago"),
            captura_pago_url: normalizePhotoUrlPortal(capturaPagoRaw, HIST_APPSHEET_LIQ_TAB),
            foto_fachada_url: normalizePhotoUrlPortal(fotoFachadaRaw, HIST_APPSHEET_LIQ_TAB),
            observacion: get("Observacion"),
            foto_opcional_url: normalizePhotoUrlPortal(fotoOpcionalRaw, HIST_APPSHEET_LIQ_TAB),
            drop_monto_plan: get("Drop"),
            conector_fibra_velocidad: get("Conector Fibra Velocidad"),
            cable_rg6_codigo_etiqueta: get("Cable RG6"),
            personal_tecnico: get("Personal Tecnico"),
            foto_onu_url: normalizePhotoUrlPortal(fotoOnuRaw, HIST_APPSHEET_LIQ_TAB),
            user_pppoe: get("UserPPoe"),
            photo_caj_url: normalizePhotoUrlPortal(photoCajRaw, HIST_APPSHEET_LIQ_TAB),
            photo_onu_url: normalizePhotoUrlPortal(photoOnuRaw, HIST_APPSHEET_LIQ_TAB),
            autor: get("Autor"),
            empresa: get("empresa"),
            nodo: get("Nodo"),
            tecnico: firstText(get("Personal Tecnico"), get("Tecnico"), get("Técnico"), get("Cuadrilla")),
            resultado: firstText(get("Resultado final"), get("Resultado"), get("Estado")),
            monto: Number.isFinite(monto) ? monto : 0,
            sn_onu: firstText(get("SN ONU"), get("SN autorizado"), get("Serial ONU final")),
            estado: get("Estado"),
            source_sheet: "Liquidaciones",
            payload: r,
            updated_at: new Date().toISOString(),
          };
        })
        .filter((x) => String(x.codigo || "").trim());

      // Evita choque de ON CONFLICT cuando el Sheet trae el mismo codigo varias veces.
      // Regla: conservar la ultima ocurrencia de cada codigo.
      const dedupByCodigo = new Map();
      payloadRaw.forEach((row) => {
        const key = String(row.codigo || "").trim();
        if (!key) return;
        dedupByCodigo.set(key, row);
      });
      const payload = Array.from(dedupByCodigo.values());

      if (!payload.length) {
        window.alert("No se encontraron filas útiles en Liquidaciones.");
        return;
      }

      const chunks = [];
      for (let i = 0; i < payload.length; i += 300) chunks.push(payload.slice(i, i + 300));
      for (const chunk of chunks) {
        let { error } = await supabase.from(HIST_APPSHEET_LIQ_TABLE).upsert(chunk, { onConflict: "codigo" });
        if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
          const fallbackChunk = chunk.map((r) => ({
            codigo: r.codigo,
            fecha: r.fecha,
            cliente: r.cliente,
            dni: r.dni,
            nodo: r.nodo,
            tecnico: r.tecnico,
            resultado: r.resultado,
            monto: r.monto,
            payload: r.payload,
            updated_at: r.updated_at,
          }));
          const retry = await supabase.from(HIST_APPSHEET_LIQ_TABLE).upsert(fallbackChunk, { onConflict: "codigo" });
          error = retry.error;
        }
        if (error) throw error;
      }

      await cargarHistorialAppsheetLiquidaciones();
      await upsertHistorialSyncState(HIST_SYNC_KEY_LIQUIDACIONES, {
        row_count: rows.length,
        target_table: HIST_APPSHEET_LIQ_TABLE,
        note: `Sync Liquidaciones: ${payload.length} fila(s) procesadas.`,
      });
      setHistorialAppsheetInfo(`Sync liquidaciones completado: ${payload.length} fila(s) procesadas.`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo sincronizar liquidaciones.")} Si la tabla no existe, ejecuta el SQL de liquidaciones AppSheet.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const cargarHistorialAppsheetDetalleLiquidacion = async () => {
    if (!isSupabaseConfigured) {
      setHistorialAppsheetError("Configura Supabase para ver historial AppSheet.");
      return;
    }
    setHistorialAppsheetLoading(true);
    try {
      const selectFull =
        "id,detalle_key,id_liqui,orden_id,liquidacion_codigo,codigo_material,codigo_onu,material,unidad,cantidad,precio_unitario,subtotal,tecnico,cliente,dni,nodo,fecha,observacion,source_sheet,payload,updated_at";
      const fetchAll = async (selectClause) => {
        const pageSize = 1000;
        let offset = 0;
        const all = [];
        while (true) {
          const { data, error } = await supabase
            .from(HIST_APPSHEET_DET_LIQ_TABLE)
            .select(selectClause)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (error) return { data: null, error };
          const chunk = Array.isArray(data) ? data : [];
          all.push(...chunk);
          if (chunk.length < pageSize) break;
          offset += pageSize;
        }
        return { data: all, error: null };
      };

      let { data, error } = await fetchAll(selectFull);
      if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
        const fallback = await fetchAll("id,detalle_key,id_liqui,orden_id,liquidacion_codigo,material,cantidad,payload,updated_at");
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;
      setHistorialAppsheetDetLiq(Array.isArray(data) ? data : []);
      setHistorialAppsheetError("");
    } catch (e) {
      setHistorialAppsheetError(String(e?.message || "No se pudo cargar DetalleLiquidacion AppSheet."));
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const sincronizarHistorialAppsheetDetalleLiquidacion = async () => {
    if (!isSupabaseConfigured) {
      window.alert("Configura Supabase para sincronizar historial AppSheet.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    setHistorialAppsheetInfo("");
    try {
      const fetchRowsAll = async () => {
        const url = `https://docs.google.com/spreadsheets/d/${HIST_APPSHEET_SHEET_ID}/export?format=csv&gid=${encodeURIComponent(
          HIST_APPSHEET_DET_LIQ_GID
        )}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("No se pudo leer Google Sheet CSV (DetalleLiquidacion).");
        const text = await res.text();
        return parseGoogleSheetCsvRows(text);
      };

      const rows = await fetchRowsAll();
      const [syncState, tableCount] = await Promise.all([
        fetchHistorialSyncState(HIST_SYNC_KEY_DETALLE),
        fetchSupabaseExactCount(HIST_APPSHEET_DET_LIQ_TABLE).catch(() => 0),
      ]);
      const prevCount = Number(syncState?.row_count || 0);
      if (rows.length <= prevCount && tableCount > 0) {
        await cargarHistorialAppsheetDetalleLiquidacion();
        setHistorialAppsheetInfo(`Sin cambios en DetalleLiquidacion. Sheet: ${rows.length} fila(s), último sync: ${prevCount}.`);
        return;
      }
      const payloadRaw = rows
        .map((r, idx) => {
          const index = new Map(Object.entries(r).map(([k, v]) => [normalizarClaveSheet(k), v]));
          const get = (...keys) => {
            for (const k of keys) {
              const v = index.get(normalizarClaveSheet(k));
              if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
            }
            return "";
          };
          const liquidacionCodigo = firstText(
            get("Codigo"),
            get("Código"),
            get("OrdenId"),
            get("Orden ID"),
            get("OrdenID"),
            get("Codigo liquidacion"),
            get("Liquidacion")
          );
          const idLiqui = firstText(get("IDLiqui"), get("ID Liqui"), get("IdLiqui"), get("ID"), get("Id"));
          const ordenId = firstText(get("OrdenID"), get("Orden ID"), get("OrdenId"), get("Codigo"), get("Código"));
          const codigoMaterial = firstText(get("Codigo material"), get("IDMaterial"), get("ID material"), get("Material ID"));
          const material = firstText(get("Material"), get("Articulo"), get("Artículo"), get("Producto"), get("Nombre material"));
          const cantidadNum = Number(String(firstText(get("Cantidad"), get("Cant"), "0")).replace(",", "."));
          const precioNum = Number(
            String(
              firstText(
                get("PrecioUnitarioUsado"),
                get("Precio unitario"),
                get("PrecioUnitario"),
                get("Costo unitario"),
                get("Precio"),
                "0"
              )
            ).replace(",", ".")
          );
          const subtotalNumRaw = Number(
            String(firstText(get("Costo Material"), get("Subtotal"), get("Total"), get("Costo total"), "0")).replace(",", ".")
          );
          const subtotalNum = Number.isFinite(subtotalNumRaw) && subtotalNumRaw > 0 ? subtotalNumRaw : cantidadNum * precioNum;
          const detalleKey = firstText(
            idLiqui,
            `${liquidacionCodigo || "LIQ"}-${codigoMaterial || material || "MAT"}-${idx + 1}`
          );
          if (!detalleKey) return null;
          return {
            detalle_key: detalleKey,
            id_liqui: idLiqui,
            orden_id: ordenId,
            liquidacion_codigo: liquidacionCodigo,
            codigo_material: codigoMaterial,
            codigo_onu: firstText(get("Codigo ONU"), get("CodigoONU"), get("Código ONU")),
            material,
            unidad: firstText(get("Unidad"), get("UM"), get("Und")),
            cantidad: Number.isFinite(cantidadNum) ? cantidadNum : 0,
            precio_unitario: Number.isFinite(precioNum) ? precioNum : 0,
            subtotal: Number.isFinite(subtotalNum) ? subtotalNum : 0,
            tecnico: firstText(get("Personal Tecnico"), get("Tecnico"), get("Técnico")),
            cliente: firstText(get("Nombre"), get("Cliente"), get("Nombre cliente")),
            dni: firstText(get("DNI"), get("Cedula"), get("Cédula")),
            nodo: get("Nodo"),
            fecha: firstText(get("Fecha"), get("Fecha2")),
            observacion: firstText(get("Observacion"), get("Observación")),
            source_sheet: "DetalleLiquidacion",
            payload: r,
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      if (!payloadRaw.length) {
        window.alert("No se encontraron filas útiles en DetalleLiquidacion.");
        return;
      }

      const dedup = new Map();
      payloadRaw.forEach((x) => {
        const key = String(x.detalle_key || "").trim();
        if (!key) return;
        dedup.set(key, x);
      });
      const payload = Array.from(dedup.values());

      const chunks = [];
      for (let i = 0; i < payload.length; i += 300) chunks.push(payload.slice(i, i + 300));
      for (const chunk of chunks) {
        let { error } = await supabase.from(HIST_APPSHEET_DET_LIQ_TABLE).upsert(chunk, { onConflict: "detalle_key" });
        if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
          const fallbackChunk = chunk.map((r) => ({
            detalle_key: r.detalle_key,
            id_liqui: r.id_liqui,
            orden_id: r.orden_id,
            liquidacion_codigo: r.liquidacion_codigo,
            material: r.material,
            cantidad: r.cantidad,
            payload: r.payload,
            updated_at: r.updated_at,
          }));
          const retry = await supabase.from(HIST_APPSHEET_DET_LIQ_TABLE).upsert(fallbackChunk, { onConflict: "detalle_key" });
          error = retry.error;
        }
        if (error) throw error;
      }

      await cargarHistorialAppsheetDetalleLiquidacion();
      await upsertHistorialSyncState(HIST_SYNC_KEY_DETALLE, {
        row_count: rows.length,
        target_table: HIST_APPSHEET_DET_LIQ_TABLE,
        note: `Sync DetalleLiquidacion: ${payload.length} fila(s) procesadas.`,
      });
      setHistorialAppsheetInfo(`Sync DetalleLiquidacion completado: ${payload.length} fila(s) procesadas.`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo sincronizar DetalleLiquidacion.")} Si la tabla no existe, ejecuta el SQL del submenú Materiales de liquidación.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const cargarHistorialAppsheetArticulos = async () => {
    if (!isSupabaseConfigured) {
      setHistorialAppsheetError("Configura Supabase para ver historial AppSheet.");
      return;
    }
    setHistorialAppsheetLoading(true);
    try {
      const selectFull =
        "id,id_articulo,codigo,nombre,info,marca,modelo,precio_unitario,foto_art_raw,foto_art_url,source_sheet,payload,updated_at";
      const fetchAll = async (selectClause) => {
        const pageSize = 1000;
        let offset = 0;
        const all = [];
        while (true) {
          const { data, error } = await supabase
            .from(HIST_APPSHEET_ART_TABLE)
            .select(selectClause)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (error) return { data: null, error };
          const chunk = Array.isArray(data) ? data : [];
          all.push(...chunk);
          if (chunk.length < pageSize) break;
          offset += pageSize;
        }
        return { data: all, error: null };
      };
      let { data, error } = await fetchAll(selectFull);
      if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
        const fallback = await fetchAll("id,id_articulo,nombre,payload,updated_at");
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;
      setHistorialAppsheetArticulos(Array.isArray(data) ? data : []);
      setHistorialAppsheetError("");
    } catch (e) {
      setHistorialAppsheetError(String(e?.message || "No se pudo cargar ARTICULOS."));
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const cargarHistorialAppsheetExtracto = async () => {
    if (!isSupabaseConfigured) {
      setHistorialAppsheetError("Configura Supabase para ver EXTRACTO.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    try {
      const rows = await fetchSupabaseRowsPaged({
        tableName: HIST_APPSHEET_EXTRACTO_TABLE,
        selectClause: "sheet_row_num,extracto_id,fecha,tipo,responsable,payload,updated_at",
        orderColumn: "sheet_row_num",
        ascending: true,
      });
      const all = rows.map((row) => ({
        id: firstText(row?.extracto_id, row?.payload?.ID, row?.payload?.Id, row?.payload?.["Columna 1"]),
        fecha: firstText(row?.fecha, row?.payload?.FECHA, row?.payload?.Fecha),
        tipo: firstText(row?.tipo, row?.payload?.TIPO, row?.payload?.Tipo),
        responsable: firstText(row?.responsable, row?.payload?.RESPONSABLE, row?.payload?.Responsable),
        payload: row?.payload || null,
      }));
      setHistorialAppsheetExtracto(all);
      setHistorialAppsheetInfo(`Extracto cargado desde Supabase: ${all.length} fila(s).`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo cargar EXTRACTO.")} Si la tabla no existe, ejecuta el SQL de historial AppSheet.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const esErrorTablaMikrotikConfig = (error) => {
    const msg = String(error?.message || "").toLowerCase();
    return (
      (msg.includes(MIKROTIK_ROUTERS_TABLE) || msg.includes(MIKROTIK_NODO_ROUTER_TABLE)) &&
      (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("relation"))
    );
  };

  const cargarMikrotikConfigDesdeSupabase = async (opts = { silent: true }) => {
    if (!isSupabaseConfigured) {
      setMikrotikRoutersConfig(mergeMikrotikRoutersWithDefaults());
      setMikrotikNodoRouterConfig(mergeMikrotikNodoRouterWithDefaults());
      return;
    }
    setMikrotikConfigLoading(true);
    setMikrotikConfigError("");
    try {
      const [routersRes, nodosRes] = await Promise.all([
        supabase
          .from(MIKROTIK_ROUTERS_TABLE)
          .select("router_key,nombre,host,port,api_user,api_password,activo,notas,updated_at")
          .order("router_key", { ascending: true })
          .limit(200),
        supabase
          .from(MIKROTIK_NODO_ROUTER_TABLE)
          .select("nodo,router_key,activo,observacion,updated_at")
          .order("nodo", { ascending: true })
          .limit(200),
      ]);
      if (routersRes.error) throw routersRes.error;
      if (nodosRes.error) throw nodosRes.error;

      const routers = mergeMikrotikRoutersWithDefaults(Array.isArray(routersRes.data) ? routersRes.data : []);
      const nodos = mergeMikrotikNodoRouterWithDefaults(Array.isArray(nodosRes.data) ? nodosRes.data : []);
      setMikrotikRoutersConfig(routers);
      setMikrotikNodoRouterConfig(nodos);
      if (!opts?.silent) {
        setMikrotikConfigInfo(`Configuración MikroTik cargada desde Supabase. Routers: ${routers.length}.`);
      }
    } catch (error) {
      console.error("Error cargando configuración MikroTik desde Supabase:", error);
      setMikrotikRoutersConfig(mergeMikrotikRoutersWithDefaults());
      setMikrotikNodoRouterConfig(mergeMikrotikNodoRouterWithDefaults());
      if (esErrorTablaMikrotikConfig(error)) {
        setMikrotikConfigError("Falta crear las tablas de configuración MikroTik en Supabase. Usa el SQL nuevo antes de guardar.");
      } else if (!opts?.silent) {
        setMikrotikConfigError(String(error?.message || "No se pudo cargar la configuración MikroTik."));
      }
    } finally {
      setMikrotikConfigLoading(false);
    }
  };

  const guardarMikrotikConfigEnSupabase = async () => {
    if (!isSupabaseConfigured) {
      setMikrotikConfigError("Supabase no está configurado en esta app.");
      return;
    }
    setMikrotikConfigSaving(true);
    setMikrotikConfigError("");
    setMikrotikConfigInfo("");
    try {
      const routers = mergeMikrotikRoutersWithDefaults(mikrotikRoutersConfig)
        .map(normalizarMikrotikRouterConfig)
        .filter((item) => item.routerKey || item.nombre || item.host || item.apiUser || item.apiPassword);
      const seen = new Set();
      const payloadRouters = routers.map((item) => {
        const routerKey = normalizarRouterKey(item.routerKey);
        if (!routerKey) throw new Error("Cada router necesita una clave técnica única.");
        if (seen.has(routerKey)) throw new Error(`La clave de router "${routerKey}" está repetida.`);
        seen.add(routerKey);
        if (!item.nombre.trim()) throw new Error(`Falta el nombre para el router "${routerKey}".`);
        if (!item.host.trim()) throw new Error(`Falta el host/IP para el router "${routerKey}".`);
        const port = Number(item.port);
        if (!Number.isFinite(port) || port <= 0) throw new Error(`El puerto del router "${routerKey}" no es válido.`);
        if (!item.apiUser.trim()) throw new Error(`Falta el usuario API para el router "${routerKey}".`);
        if (!item.apiPassword.trim()) throw new Error(`Falta la contraseña API para el router "${routerKey}".`);
        return {
          router_key: routerKey,
          nombre: item.nombre.trim(),
          host: item.host.trim(),
          port,
          api_user: item.apiUser.trim(),
          api_password: item.apiPassword.trim(),
          activo: item.activo !== false,
          notas: nullIfEmpty(item.notas),
          updated_at: new Date().toISOString(),
        };
      });
      if (!payloadRouters.length) throw new Error("Agrega al menos un router para guardar la configuración.");

      const payloadNodos = mergeMikrotikNodoRouterWithDefaults(mikrotikNodoRouterConfig).map((item) => {
        const routerKey = normalizarRouterKey(item.routerKey);
        if (routerKey && !seen.has(routerKey)) {
          throw new Error(`El nodo ${item.nodo} apunta a un router inexistente: ${routerKey}.`);
        }
        return {
          nodo: item.nodo,
          router_key: routerKey || null,
          activo: Boolean(routerKey) && item.activo !== false,
          observacion: nullIfEmpty(item.observacion),
          updated_at: new Date().toISOString(),
        };
      });

      const { error: routersError } = await supabase
        .from(MIKROTIK_ROUTERS_TABLE)
        .upsert(payloadRouters, { onConflict: "router_key" });
      if (routersError) throw routersError;

      const { error: nodosError } = await supabase
        .from(MIKROTIK_NODO_ROUTER_TABLE)
        .upsert(payloadNodos, { onConflict: "nodo" });
      if (nodosError) throw nodosError;

      setMikrotikRoutersConfig(mergeMikrotikRoutersWithDefaults(payloadRouters));
      setMikrotikNodoRouterConfig(mergeMikrotikNodoRouterWithDefaults(payloadNodos));
      setMikrotikConfigInfo("Configuración MikroTik guardada en Supabase. El backend la usará como fuente principal.");
    } catch (error) {
      console.error("Error guardando configuración MikroTik:", error);
      setMikrotikConfigError(
        esErrorTablaMikrotikConfig(error)
          ? "Falta crear las tablas de configuración MikroTik en Supabase. Ejecuta el SQL nuevo y vuelve a intentar."
          : String(error?.message || "No se pudo guardar la configuración MikroTik.")
      );
    } finally {
      setMikrotikConfigSaving(false);
    }
  };

  const sincronizarHistorialAppsheetExtracto = async () => {
    if (!isSupabaseConfigured) {
      window.alert("Configura Supabase para sincronizar EXTRACTO.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    setHistorialAppsheetInfo("");
    try {
      const rows = await fetchGoogleSheetRowsRobust({
        sheetId: HIST_APPSHEET_SHEET_ID,
        gid: HIST_APPSHEET_EXTRACTO_GID,
        context: "EXTRACTO",
        requiredKeys: ["Columna 1", "FECHA", "TIPO", "RESPONSABLE"],
      });
      const [syncState, tableCount] = await Promise.all([
        fetchHistorialSyncState(HIST_SYNC_KEY_EXTRACTO),
        fetchSupabaseExactCount(HIST_APPSHEET_EXTRACTO_TABLE).catch(() => 0),
      ]);
      const prevCount = Number(syncState?.row_count || 0);
      if (rows.length <= prevCount && tableCount > 0) {
        await cargarHistorialAppsheetExtracto();
        setHistorialAppsheetInfo(`Sin cambios en EXTRACTO. Sheet: ${rows.length} fila(s), último sync: ${prevCount}.`);
        return;
      }

      const payloadAll = rows
        .map((r, idx) => {
          const index = new Map(Object.entries(r).map(([k, v]) => [normalizarClaveSheet(k), String(v || "").trim()]));
          const get = (...keys) => {
            for (const key of keys) {
              const val = index.get(normalizarClaveSheet(key));
              if (val) return val;
            }
            return "";
          };
          return {
            sheet_row_num: idx + 1,
            extracto_id: firstText(get("Columna 1"), get("Columna1"), get("ID"), get("Id")),
            fecha: firstText(get("FECHA"), get("Fecha")),
            tipo: firstText(get("TIPO"), get("Tipo")),
            responsable: firstText(get("RESPONSABLE"), get("Responsable")),
            source_sheet: "EXTRACTO",
            payload: r,
            updated_at: new Date().toISOString(),
          };
        })
        .filter((row) => row.extracto_id || row.fecha || row.tipo || row.responsable);

      if (!payloadAll.length) {
        window.alert("No se encontraron filas útiles en EXTRACTO.");
        return;
      }

      const nuevos = prevCount > 0 ? payloadAll.filter((row) => row.sheet_row_num > prevCount) : payloadAll;
      if (!nuevos.length) {
        await upsertHistorialSyncState(HIST_SYNC_KEY_EXTRACTO, {
          row_count: rows.length,
          target_table: HIST_APPSHEET_EXTRACTO_TABLE,
          note: "EXTRACTO sin filas útiles nuevas.",
        });
        await cargarHistorialAppsheetExtracto();
        setHistorialAppsheetInfo(`EXTRACTO sin filas útiles nuevas. Sheet: ${rows.length} fila(s).`);
        return;
      }

      const chunks = [];
      for (let i = 0; i < nuevos.length; i += 300) chunks.push(nuevos.slice(i, i + 300));
      for (const chunk of chunks) {
        const { error } = await supabase.from(HIST_APPSHEET_EXTRACTO_TABLE).upsert(chunk, { onConflict: "sheet_row_num" });
        if (error) throw error;
      }

      await upsertHistorialSyncState(HIST_SYNC_KEY_EXTRACTO, {
        row_count: rows.length,
        target_table: HIST_APPSHEET_EXTRACTO_TABLE,
        note: `Sync EXTRACTO: ${nuevos.length} fila(s) nuevas.`,
      });
      await cargarHistorialAppsheetExtracto();
      setHistorialAppsheetInfo(`Sync EXTRACTO completado: ${nuevos.length} fila(s) nuevas.`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo sincronizar EXTRACTO.")} Si la tabla no existe, ejecuta el SQL de historial AppSheet.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const cargarHistorialAppsheetMovimientos = async () => {
    if (!isSupabaseConfigured) {
      setHistorialAppsheetError("Configura Supabase para ver DetalleMovimiento.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    try {
      const rows = await fetchSupabaseRowsPaged({
        tableName: HIST_APPSHEET_MOVIMIENTOS_TABLE,
        selectClause: "sheet_row_num,payload,updated_at",
        orderColumn: "sheet_row_num",
        ascending: true,
      });
      const all = rows
        .map((row) => (row?.payload && typeof row.payload === "object" ? row.payload : null))
        .filter(Boolean);
      setHistorialAppsheetMovimientos(all);
      setHistorialAppsheetInfo(`DetalleMovimiento cargado desde Supabase: ${all.length} fila(s).`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo cargar DetalleMovimiento.")} Si la tabla no existe, ejecuta el SQL de historial AppSheet.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const sincronizarHistorialAppsheetMovimientos = async () => {
    if (!isSupabaseConfigured) {
      window.alert("Configura Supabase para sincronizar DetalleMovimiento.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    setHistorialAppsheetInfo("");
    try {
      const rows = await fetchGoogleSheetRowsRobust({
        sheetId: HIST_APPSHEET_SHEET_ID,
        gid: HIST_APPSHEET_MOVIMIENTOS_GID,
        context: "DetalleMovimiento",
        requiredKeys: ["Columna 1", "Codigo ONU", "Cantidad", "Precio"],
      });
      const [syncState, tableCount] = await Promise.all([
        fetchHistorialSyncState(HIST_SYNC_KEY_MOVIMIENTOS),
        fetchSupabaseExactCount(HIST_APPSHEET_MOVIMIENTOS_TABLE).catch(() => 0),
      ]);
      const prevCount = Number(syncState?.row_count || 0);
      if (rows.length <= prevCount && tableCount > 0) {
        await cargarHistorialAppsheetMovimientos();
        setHistorialAppsheetInfo(`Sin cambios en DetalleMovimiento. Sheet: ${rows.length} fila(s), último sync: ${prevCount}.`);
        return;
      }

      const payloadAll = rows
        .map((r, idx) => {
          const index = new Map(Object.entries(r).map(([k, v]) => [normalizarClaveSheet(k), String(v || "").trim()]));
          const get = (...keys) => {
            for (const key of keys) {
              const value = index.get(normalizarClaveSheet(key));
              if (value) return value;
            }
            return "";
          };
          const cantidadNum = Number(String(firstText(get("Cantidad"), get("CANTIDAD"), "0")).replace(",", "."));
          const precioNum = Number(
            String(firstText(get("PrecioUnitarioUsado"), get("Precio Unitario Usado"), get("Precio"), "0")).replace(",", ".")
          );
          const costoNumRaw = Number(String(firstText(get("Costo Material"), get("CostoMaterial"), get("Total"), "0")).replace(",", "."));
          const costoNum = Number.isFinite(costoNumRaw) && costoNumRaw > 0 ? costoNumRaw : cantidadNum * precioNum;
          return {
            sheet_row_num: idx + 1,
            id_movimiento: firstText(get("IDMovimiento"), get("ID Movimiento"), get("Columna 1"), get("ID"), get("Id")),
            id_detalle: firstText(get("IDDetalle"), get("ID Detalle")),
            codigo_onu: firstText(get("CódigoONU"), get("Codigo ONU"), get("CodigoONU"), get("Código ONU")),
            producto: firstText(get("Producto"), get("PRODUCTO"), get("producto")),
            tecnico: firstText(get("Tecnico"), get("TECNICO"), get("técnico")),
            cantidad: Number.isFinite(cantidadNum) ? cantidadNum : 0,
            precio_unitario: Number.isFinite(precioNum) ? precioNum : 0,
            costo_material: Number.isFinite(costoNum) ? costoNum : 0,
            source_sheet: "DetalleMovimiento",
            payload: r,
            updated_at: new Date().toISOString(),
          };
        })
        .filter((row) => Object.keys(row.payload || {}).length > 0);

      if (!payloadAll.length) {
        window.alert("No se encontraron filas útiles en DetalleMovimiento.");
        return;
      }

      const nuevos = prevCount > 0 ? payloadAll.filter((row) => row.sheet_row_num > prevCount) : payloadAll;
      if (!nuevos.length) {
        await upsertHistorialSyncState(HIST_SYNC_KEY_MOVIMIENTOS, {
          row_count: rows.length,
          target_table: HIST_APPSHEET_MOVIMIENTOS_TABLE,
          note: "DetalleMovimiento sin filas útiles nuevas.",
        });
        await cargarHistorialAppsheetMovimientos();
        setHistorialAppsheetInfo(`DetalleMovimiento sin filas útiles nuevas. Sheet: ${rows.length} fila(s).`);
        return;
      }

      const chunks = [];
      for (let i = 0; i < nuevos.length; i += 300) chunks.push(nuevos.slice(i, i + 300));
      for (const chunk of chunks) {
        const { error } = await supabase.from(HIST_APPSHEET_MOVIMIENTOS_TABLE).upsert(chunk, { onConflict: "sheet_row_num" });
        if (error) throw error;
      }

      await upsertHistorialSyncState(HIST_SYNC_KEY_MOVIMIENTOS, {
        row_count: rows.length,
        target_table: HIST_APPSHEET_MOVIMIENTOS_TABLE,
        note: `Sync DetalleMovimiento: ${nuevos.length} fila(s) nuevas.`,
      });
      await cargarHistorialAppsheetMovimientos();
      setHistorialAppsheetInfo(`Sync DetalleMovimiento completado: ${nuevos.length} fila(s) nuevas.`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo sincronizar DetalleMovimiento.")} Si la tabla no existe, ejecuta el SQL de historial AppSheet.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const cargarBaseDataOrdenes = async () => {
    if (!isSupabaseConfigured) {
      setHistorialAppsheetError("Configura Supabase para ver BaseData.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    try {
      const rows = await fetchSupabaseRowsPaged({
        tableName: HIST_APPSHEET_BASEDATA_TABLE,
        selectClause: "sheet_row_num,payload,updated_at",
        orderColumn: "sheet_row_num",
        ascending: true,
      });
      const all = rows
        .map((row) => (row?.payload && typeof row.payload === "object" ? row.payload : null))
        .filter(Boolean);
      setBaseDataOrdenesRows(all);
      setHistorialAppsheetInfo(`Ordenes BaseData cargado desde Supabase: ${all.length} fila(s).`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo cargar BaseData.")} Si la tabla no existe, ejecuta el SQL de historial AppSheet.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const sincronizarBaseDataOrdenes = async () => {
    if (!isSupabaseConfigured) {
      window.alert("Configura Supabase para sincronizar BaseData.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    setHistorialAppsheetInfo("");
    try {
      const rows = await fetchGoogleSheetRowsRobust({
        sheetId: BASEDATA_SHEET_ID,
        gid: BASEDATA_GID,
        context: "BaseData",
        requiredKeys: ["Fecha", "Nodo", "Empresa", "Codigo"],
      });
      const [syncState, tableCount] = await Promise.all([
        fetchHistorialSyncState(HIST_SYNC_KEY_BASEDATA),
        fetchSupabaseExactCount(HIST_APPSHEET_BASEDATA_TABLE).catch(() => 0),
      ]);
      const prevCount = Number(syncState?.row_count || 0);
      if (rows.length <= prevCount && tableCount > 0) {
        await cargarBaseDataOrdenes();
        setHistorialAppsheetInfo(`Sin cambios en BaseData. Sheet: ${rows.length} fila(s), último sync: ${prevCount}.`);
        return;
      }

      const payloadAll = rows
        .map((r, idx) => {
          const index = new Map(Object.entries(r).map(([k, v]) => [normalizarClaveSheet(k), String(v || "").trim()]));
          const get = (...keys) => {
            for (const key of keys) {
              const value = index.get(normalizarClaveSheet(key));
              if (value) return value;
            }
            return "";
          };
          return {
            sheet_row_num: idx + 1,
            codigo: firstText(get("Codigo"), get("Código"), get("Codigo orden"), get("Orden ID")),
            fecha: firstText(get("Fecha"), get("Fecha2")),
            nodo: get("Nodo"),
            empresa: get("Empresa"),
            source_sheet: "BaseData",
            payload: r,
            updated_at: new Date().toISOString(),
          };
        })
        .filter((row) => Object.keys(row.payload || {}).length > 0);

      if (!payloadAll.length) {
        window.alert("No se encontraron filas útiles en BaseData.");
        return;
      }

      const nuevos = prevCount > 0 ? payloadAll.filter((row) => row.sheet_row_num > prevCount) : payloadAll;
      if (!nuevos.length) {
        await upsertHistorialSyncState(HIST_SYNC_KEY_BASEDATA, {
          row_count: rows.length,
          target_table: HIST_APPSHEET_BASEDATA_TABLE,
          note: "BaseData sin filas útiles nuevas.",
        });
        await cargarBaseDataOrdenes();
        setHistorialAppsheetInfo(`BaseData sin filas útiles nuevas. Sheet: ${rows.length} fila(s).`);
        return;
      }

      const chunks = [];
      for (let i = 0; i < nuevos.length; i += 300) chunks.push(nuevos.slice(i, i + 300));
      for (const chunk of chunks) {
        const { error } = await supabase.from(HIST_APPSHEET_BASEDATA_TABLE).upsert(chunk, { onConflict: "sheet_row_num" });
        if (error) throw error;
      }

      await upsertHistorialSyncState(HIST_SYNC_KEY_BASEDATA, {
        row_count: rows.length,
        target_table: HIST_APPSHEET_BASEDATA_TABLE,
        note: `Sync BaseData: ${nuevos.length} fila(s) nuevas.`,
      });
      await cargarBaseDataOrdenes();
      setHistorialAppsheetInfo(`Sync BaseData completado: ${nuevos.length} fila(s) nuevas.`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo sincronizar BaseData.")} Si la tabla no existe, ejecuta el SQL de historial AppSheet.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const sincronizarHistorialAppsheetArticulos = async () => {
    if (!isSupabaseConfigured) {
      window.alert("Configura Supabase para sincronizar historial AppSheet.");
      return;
    }
    setHistorialAppsheetLoading(true);
    setHistorialAppsheetError("");
    setHistorialAppsheetInfo("");
    try {
      const rows = await fetchGoogleSheetRowsRobust({
        sheetId: HIST_APPSHEET_SHEET_ID,
        gid: HIST_APPSHEET_ART_GID,
        sheetName: HIST_APPSHEET_ARTICULOS_TAB,
        context: "ARTICULOS",
        requiredKeys: ["ID_ARTICULO", "NOMBRE", "PrecioUnitario"],
      });
      const [syncState, tableCount] = await Promise.all([
        fetchHistorialSyncState(HIST_SYNC_KEY_ARTICULOS),
        fetchSupabaseExactCount(HIST_APPSHEET_ART_TABLE).catch(() => 0),
      ]);
      const prevCount = Number(syncState?.row_count || 0);
      if (rows.length <= prevCount && tableCount > 0) {
        await cargarHistorialAppsheetArticulos();
        setHistorialAppsheetInfo(`Sin cambios en ARTICULOS. Sheet: ${rows.length} fila(s), último sync: ${prevCount}.`);
        return;
      }
      const payloadRaw = rows
        .map((row, idx) => {
          const index = new Map(Object.entries(row).map(([k, v]) => [normalizarClaveSheet(k), v]));
          const get = (...keys) => {
            for (const key of keys) {
              const value = index.get(normalizarClaveSheet(key));
              if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
            }
            return "";
          };
          const idArticulo = firstText(get("ID_ARTICULO"), get("ID ARTICULO"), get("IDArticulo"), get("Codigo"), `ART-${idx + 1}`);
          const fotoArtRaw = firstText(get("FOTO_ART"), get("FOTO ART"), get("Foto"), get("Imagen"));
          const precio = Number(String(firstText(get("PrecioUnitario"), get("Precio unitario"), get("Precio"), "0")).replace(",", "."));
          return {
            id_articulo: idArticulo,
            codigo: idArticulo,
            nombre: firstText(get("NOMBRE"), get("Nombre"), get("Producto"), get("Material")),
            info: firstText(get("INFO"), get("Info"), get("Descripcion"), get("Descripción")),
            marca: get("Marca"),
            modelo: get("Modelo"),
            precio_unitario: Number.isFinite(precio) ? precio : 0,
            foto_art_raw: fotoArtRaw,
            foto_art_url: normalizePhotoUrlPortal(fotoArtRaw, HIST_APPSHEET_ARTICULOS_TAB),
            source_sheet: HIST_APPSHEET_ARTICULOS_TAB,
            payload: row,
            updated_at: new Date().toISOString(),
          };
        })
        .filter((x) => String(x.id_articulo || "").trim());

      if (!payloadRaw.length) {
        window.alert("No se encontraron filas útiles en ARTICULOS.");
        return;
      }
      const dedup = new Map();
      payloadRaw.forEach((x) => {
        const key = String(x.id_articulo || "").trim();
        if (!key) return;
        dedup.set(key, x);
      });
      const payload = Array.from(dedup.values());

      const chunks = [];
      for (let i = 0; i < payload.length; i += 300) chunks.push(payload.slice(i, i + 300));
      for (const chunk of chunks) {
        let { error } = await supabase.from(HIST_APPSHEET_ART_TABLE).upsert(chunk, { onConflict: "id_articulo" });
        if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
          const fallbackChunk = chunk.map((r) => ({
            id_articulo: r.id_articulo,
            nombre: r.nombre,
            payload: r.payload,
            updated_at: r.updated_at,
          }));
          const retry = await supabase.from(HIST_APPSHEET_ART_TABLE).upsert(fallbackChunk, { onConflict: "id_articulo" });
          error = retry.error;
        }
        if (error) throw error;
      }

      await cargarHistorialAppsheetArticulos();
      await upsertHistorialSyncState(HIST_SYNC_KEY_ARTICULOS, {
        row_count: rows.length,
        target_table: HIST_APPSHEET_ART_TABLE,
        note: `Sync ARTICULOS: ${payload.length} fila(s) procesadas.`,
      });
      setHistorialAppsheetInfo(`Sync ARTICULOS completado: ${payload.length} fila(s) procesadas.`);
    } catch (e) {
      setHistorialAppsheetError(
        `${String(e?.message || "No se pudo sincronizar ARTICULOS.")} Si la tabla no existe, ejecuta el SQL del submenú Artículos.`
      );
    } finally {
      setHistorialAppsheetLoading(false);
    }
  };

  const historialAppsheetTecnicosOpciones = useMemo(() => {
    const setTec = new Set(
      historialAppsheetEquipos
        .map((r) => resolverNombreDesdeCodigoTecnico(r.tecnico_asignado_codigo))
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    );
    return Array.from(setTec).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [historialAppsheetEquipos]);

  const historialAppsheetEstadosOpciones = useMemo(() => {
    const setEst = new Set(
      historialAppsheetEquipos
        .map((r) => estadoAppsheetNormalizado(r.estado))
        .map((x) => String(x || "").trim().toLowerCase())
        .filter(Boolean)
    );
    return Array.from(setEst).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [historialAppsheetEquipos]);

  const historialAppsheetEquiposBaseFiltrados = useMemo(() => {
    const desdeTs = historialAppsheetFiltro.desde ? new Date(`${historialAppsheetFiltro.desde}T00:00:00`).getTime() : 0;
    const hastaTs = historialAppsheetFiltro.hasta ? new Date(`${historialAppsheetFiltro.hasta}T23:59:59`).getTime() : 0;
    const tecFiltro = String(historialAppsheetFiltro.tecnico || "TODOS").trim().toLowerCase();
    const estFiltro = String(historialAppsheetFiltro.estado || "TODOS").trim().toLowerCase();
    return historialAppsheetEquipos.filter((r) => {
      if (!tieneAccesoNodoHistorialAppsheet(firstText(r?.nodo, r?.payload?.nodo, r?.payload?.Nodo))) return false;
      const tecnico = resolverNombreDesdeCodigoTecnico(r.tecnico_asignado_codigo);
      const estado = estadoAppsheetNormalizado(r.estado);
      const ts = toTimestampFlexible(r.fecha_registro);
      if (desdeTs && (!ts || ts < desdeTs)) return false;
      if (hastaTs && (!ts || ts > hastaTs)) return false;
      if (tecFiltro !== "todos" && String(tecnico || "").trim().toLowerCase() !== tecFiltro) return false;
      if (estFiltro !== "todos" && String(estado || "").trim().toLowerCase() !== estFiltro) return false;
      return true;
    });
  }, [historialAppsheetEquipos, historialAppsheetFiltro, tieneAccesoNodoHistorialAppsheet]);

  const historialAppsheetEquiposFiltrados = useMemo(() => {
    const q = String(historialAppsheetBusqueda || "").trim().toLowerCase();
    if (!q) return historialAppsheetEquiposBaseFiltrados;
    return historialAppsheetEquiposBaseFiltrados.filter((r) => {
      const tecnicoAsignadoNombre = resolverNombreDesdeCodigoTecnico(r.tecnico_asignado_codigo);
      const liquidadoPorNombre = resolverNombreDesdeCodigoTecnico(r.liquidado_por_codigo);
      return (
        safeIncludes(r.id_onu, q) ||
        safeIncludes(r.producto, q) ||
        safeIncludes(r.producto_codigo, q) ||
        safeIncludes(r.marca, q) ||
        safeIncludes(r.modelo, q) ||
        safeIncludes(r.info_producto, q) ||
        safeIncludes(r.estado, q) ||
        safeIncludes(r.tecnico_asignado_codigo, q) ||
        safeIncludes(tecnicoAsignadoNombre, q) ||
        safeIncludes(r.usuario_pppoe, q) ||
        safeIncludes(r.nodo, q) ||
        safeIncludes(r.nombre_cliente, q) ||
        safeIncludes(r.dni, q) ||
        safeIncludes(r.liquidado_por_codigo, q) ||
        safeIncludes(liquidadoPorNombre, q) ||
        safeIncludes(r.empresa, q)
      );
    });
  }, [historialAppsheetBusqueda, historialAppsheetEquiposBaseFiltrados]);

  const valorLiq = (row = {}, ...keys) => {
    const direct = row || {};
    for (const key of keys) {
      const v = direct?.[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    const payload = direct?.payload && typeof direct.payload === "object" ? direct.payload : null;
    if (!payload) return "";
    const normalizedEntries = Object.entries(payload).map(([k, v]) => [normalizarClaveSheet(k), v]);
    for (const key of keys) {
      const nk = normalizarClaveSheet(key);
      const found = normalizedEntries.find(([k]) => k === nk);
      if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== "") return String(found[1]).trim();
    }
    return "";
  };
  const normalizarClaveCruce = (value = "") =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  const tecnicoLiqNombre = (row = {}) => {
    const raw = firstText(valorLiq(row, "tecnico", "personal_tecnico", "Personal Tecnico"), "-");
    if (!raw || raw === "-") return "-";
    return resolverNombreDesdeCodigoTecnico(raw) || raw;
  };
  const historialArticulosInfoPorCodigo = useMemo(() => {
    const map = new Map();
    const rows = Array.isArray(historialAppsheetArticulos) ? historialAppsheetArticulos : [];
    rows.forEach((art) => {
      const nombre = firstText(art?.nombre, valorLiq(art, "NOMBRE", "Nombre", "Producto", "Material"));
      const fotoRaw = firstText(art?.foto_art_raw, valorLiq(art, "FOTO_ART", "FOTO ART", "Foto", "Imagen"));
      const fotoUrl = firstText(art?.foto_art_url, fotoRaw ? normalizePhotoUrlPortal(fotoRaw, HIST_APPSHEET_ARTICULOS_TAB) : "");
      if (!nombre && !fotoUrl) return;
      const keys = [
        art?.id_articulo,
        art?.codigo,
        valorLiq(art, "ID_ARTICULO", "ID ARTICULO", "IDArticulo", "Codigo"),
      ]
        .map((x) => normalizarClaveSheet(x))
        .filter(Boolean);
      keys.forEach((k) => map.set(k, { nombre, fotoUrl }));
    });
    return map;
  }, [historialAppsheetArticulos]);
  const infoMaterialDetalle = (row = {}) => {
    const codigo = firstText(row?.codigo_material, row?.material, valorLiq(row, "Producto", "Material"));
    if (!codigo) return { nombre: "-", fotoUrl: "" };
    const info = historialArticulosInfoPorCodigo.get(normalizarClaveSheet(codigo));
    return { nombre: firstText(info?.nombre, codigo), fotoUrl: firstText(info?.fotoUrl) };
  };

  const historialAppsheetLiquidacionesPorNodo = useMemo(() => {
    const base = Array.isArray(historialAppsheetLiquidaciones) ? historialAppsheetLiquidaciones : [];
    return base.filter((r) => tieneAccesoNodoHistorialAppsheet(firstText(valorLiq(r, "nodo", "Nodo"), r?.nodo)));
  }, [historialAppsheetLiquidaciones, tieneAccesoNodoHistorialAppsheet]);

  const historialAppsheetLiqNodosOpciones = useMemo(() => {
    const setNodos = new Set(
      historialAppsheetLiquidacionesPorNodo
        .map((r) => valorLiq(r, "nodo", "Nodo"))
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    );
    return Array.from(setNodos).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [historialAppsheetLiquidacionesPorNodo]);

  const historialAppsheetLiqTecnicosOpciones = useMemo(() => {
    const setTec = new Set(
      historialAppsheetLiquidacionesPorNodo
        .map((r) => tecnicoLiqNombre(r))
        .map((x) => String(x || "").trim())
        .filter((x) => Boolean(x) && x !== "-")
    );
    return Array.from(setTec).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [historialAppsheetLiquidacionesPorNodo]);

  const historialAppsheetLiqActuacionesOpciones = useMemo(() => {
    const setAct = new Set(
      historialAppsheetLiquidacionesPorNodo
        .map((r) => firstText(valorLiq(r, "actuacion", "Actuacion"), valorLiq(r, "tipo_actuacion", "Tipo de actuacion")))
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    );
    return Array.from(setAct).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [historialAppsheetLiquidacionesPorNodo]);

  const historialAppsheetLiquidacionesFiltradas = useMemo(() => {
    const q = String(historialAppsheetLiqBusqueda || "").trim().toLowerCase();
    let base = historialAppsheetLiquidacionesPorNodo;
    const desdeTs = historialAppsheetLiqFiltro.desde ? new Date(`${historialAppsheetLiqFiltro.desde}T00:00:00`).getTime() : 0;
    const hastaTs = historialAppsheetLiqFiltro.hasta ? new Date(`${historialAppsheetLiqFiltro.hasta}T23:59:59`).getTime() : 0;
    const nodoFiltro = String(historialAppsheetLiqFiltro.nodo || "TODOS").trim().toLowerCase();
    const tecFiltro = String(historialAppsheetLiqFiltro.tecnico || "TODOS").trim().toLowerCase();
    const actFiltro = String(historialAppsheetLiqFiltro.actuacion || "TODOS").trim().toLowerCase();

    base = base.filter((r) => {
      const fecha = valorLiq(r, "fecha", "Fecha");
      const ts = toTimestampFlexible(fecha);
      if (desdeTs && (!ts || ts < desdeTs)) return false;
      if (hastaTs && (!ts || ts > hastaTs)) return false;
      const nodo = String(valorLiq(r, "nodo", "Nodo") || "").trim().toLowerCase();
      const tecnico = String(tecnicoLiqNombre(r) || "").trim().toLowerCase();
      const actuacion = String(firstText(valorLiq(r, "actuacion", "Actuacion"), valorLiq(r, "tipo_actuacion", "Tipo de actuacion")) || "")
        .trim()
        .toLowerCase();
      if (nodoFiltro !== "todos" && nodo !== nodoFiltro) return false;
      if (tecFiltro !== "todos" && tecnico !== tecFiltro) return false;
      if (actFiltro !== "todos" && actuacion !== actFiltro) return false;
      return true;
    });

    if (!q) return base;
    return base.filter((r) => {
      return (
        safeIncludes(valorLiq(r, "codigo", "Código"), q) ||
        safeIncludes(valorLiq(r, "orden", "Orden"), q) ||
        safeIncludes(valorLiq(r, "orden_id", "Orden ID"), q) ||
        safeIncludes(valorLiq(r, "actuacion", "Actuacion"), q) ||
        safeIncludes(valorLiq(r, "tipo_actuacion", "Tipo de actuacion"), q) ||
        safeIncludes(valorLiq(r, "fecha", "Fecha"), q) ||
        safeIncludes(valorLiq(r, "cliente", "nombre", "Nombre", "Cliente"), q) ||
        safeIncludes(valorLiq(r, "dni", "DNI", "Cedula"), q) ||
        safeIncludes(valorLiq(r, "nodo", "Nodo"), q) ||
        safeIncludes(tecnicoLiqNombre(r), q) ||
        safeIncludes(valorLiq(r, "resultado", "Estado"), q) ||
        safeIncludes(valorLiq(r, "sn_onu", "SN ONU"), q) ||
        safeIncludes(valorLiq(r, "user_pppoe", "UserPPoe"), q) ||
        safeIncludes(valorLiq(r, "metodo_pago", "Metodo de pago"), q)
      );
    });
  }, [historialAppsheetLiquidacionesPorNodo, historialAppsheetLiqBusqueda, historialAppsheetLiqFiltro]);

  const HIST_APPSHEET_PAGE_SIZE = 25;
  const historialColumnDefs = useMemo(
    () => [
      { key: "id_onu", label: "IDONU" },
      { key: "producto", label: "Producto" },
      { key: "estado", label: "Estado" },
      { key: "tecnico_asignado", label: "Tecnico asignado" },
      { key: "fecha_registro", label: "Fecha registro" },
      { key: "nodo", label: "Nodo" },
      { key: "nombre_cliente", label: "Nombre cliente" },
      { key: "dni", label: "DNI" },
      { key: "empresa", label: "Empresa" },
      { key: "marca", label: "Marca" },
      { key: "modelo", label: "Modelo" },
      { key: "precio_unitario", label: "Precio unitario" },
      { key: "usuario_pppoe", label: "Usuario PPPoE" },
      { key: "liquidado_por", label: "Liquidado por" },
      { key: "fecha_liquidacion", label: "Fecha liquidacion" },
      { key: "fecha_asignacion", label: "Fecha asignacion" },
      { key: "foto_etiqueta", label: "Foto etiqueta" },
      { key: "foto_producto", label: "Foto producto" },
      { key: "foto02", label: "Foto02" },
    ],
    []
  );
  const historialColumnasActivas = useMemo(
    () => historialColumnDefs.filter((col) => historialColumnasVisibles[col.key]),
    [historialColumnDefs, historialColumnasVisibles]
  );
  const valorCeldaHistorial = (row, key) => {
    if (!row) return "-";
    switch (key) {
      case "id_onu":
        return row.id_onu || "-";
      case "producto":
        return row.producto || row.producto_codigo || "-";
      case "estado":
        return estadoAppsheetNormalizado(row.estado);
      case "tecnico_asignado":
        return resolverNombreDesdeCodigoTecnico(row.tecnico_asignado_codigo) || "-";
      case "fecha_registro":
        return formatFechaFlexible(row.fecha_registro);
      case "nodo":
        return row.nodo || "-";
      case "nombre_cliente":
        return row.nombre_cliente || "-";
      case "dni":
        return row.dni || "-";
      case "empresa":
        return row.empresa || "-";
      case "marca":
        return row.marca || "-";
      case "modelo":
        return row.modelo || "-";
      case "precio_unitario":
        return Number.isFinite(Number(row.precio_unitario)) && Number(row.precio_unitario) > 0
          ? `S/ ${Number(row.precio_unitario).toFixed(2)}`
          : "-";
      case "usuario_pppoe":
        return row.usuario_pppoe || "-";
      case "liquidado_por":
        return resolverNombreDesdeCodigoTecnico(row.liquidado_por_codigo) || "-";
      case "fecha_liquidacion":
        return formatFechaFlexible(row.fecha_liquidacion);
      case "fecha_asignacion":
        return formatFechaFlexible(row.fecha_asignacion);
      case "foto_etiqueta":
        return row.foto_etiqueta_url || "";
      case "foto_producto":
        return row.foto_producto_url || "";
      case "foto02":
        return row.foto02_url || "";
      default:
        return "-";
    }
  };
  const estilosColumnaHistorial = (key = "") => {
    const base = {
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    };
    switch (String(key)) {
      case "id_onu":
        return { ...base, width: "170px", minWidth: "170px", maxWidth: "170px" };
      case "producto":
        return { ...base, width: "220px", minWidth: "220px", maxWidth: "220px" };
      case "nombre_cliente":
        return { ...base, width: "230px", minWidth: "230px", maxWidth: "230px" };
      case "tecnico_asignado":
        return { ...base, width: "130px", minWidth: "130px", maxWidth: "130px" };
      case "fecha_registro":
      case "fecha_asignacion":
      case "fecha_liquidacion":
        return { ...base, width: "165px", minWidth: "165px", maxWidth: "165px" };
      case "dni":
        return { ...base, width: "110px", minWidth: "110px", maxWidth: "110px" };
      case "nodo":
        return { ...base, width: "90px", minWidth: "90px", maxWidth: "90px" };
      default:
        return { ...base, width: "130px", minWidth: "130px", maxWidth: "130px" };
    }
  };
  const historialAppsheetTotalPaginas = useMemo(
    () => Math.max(1, Math.ceil(historialAppsheetEquiposFiltrados.length / HIST_APPSHEET_PAGE_SIZE)),
    [historialAppsheetEquiposFiltrados.length]
  );
  const historialAppsheetPaginaActiva = Math.min(Math.max(1, Number(historialAppsheetPagina || 1)), historialAppsheetTotalPaginas);
  const historialAppsheetEquiposPagina = useMemo(() => {
    const from = (historialAppsheetPaginaActiva - 1) * HIST_APPSHEET_PAGE_SIZE;
    return historialAppsheetEquiposFiltrados.slice(from, from + HIST_APPSHEET_PAGE_SIZE);
  }, [historialAppsheetEquiposFiltrados, historialAppsheetPaginaActiva]);
  const historialAppsheetLiqTotalPaginas = useMemo(
    () => Math.max(1, Math.ceil(historialAppsheetLiquidacionesFiltradas.length / HIST_APPSHEET_PAGE_SIZE)),
    [historialAppsheetLiquidacionesFiltradas.length]
  );
  const historialAppsheetLiqPaginaActiva = Math.min(Math.max(1, Number(historialAppsheetLiqPagina || 1)), historialAppsheetLiqTotalPaginas);
  const historialAppsheetLiquidacionesPagina = useMemo(() => {
    const from = (historialAppsheetLiqPaginaActiva - 1) * HIST_APPSHEET_PAGE_SIZE;
    return historialAppsheetLiquidacionesFiltradas.slice(from, from + HIST_APPSHEET_PAGE_SIZE);
  }, [historialAppsheetLiquidacionesFiltradas, historialAppsheetLiqPaginaActiva]);
  const historialAppsheetDetLiqPorNodo = useMemo(() => {
    const base = Array.isArray(historialAppsheetDetLiq) ? historialAppsheetDetLiq : [];
    return base.filter((r) => tieneAccesoNodoHistorialAppsheet(firstText(r?.nodo, valorLiq(r, "nodo", "Nodo"))));
  }, [historialAppsheetDetLiq, tieneAccesoNodoHistorialAppsheet]);
  const historialAppsheetDetLiqFiltrados = useMemo(() => {
    const q = String(historialAppsheetDetLiqBusqueda || "").trim().toLowerCase();
    const base = historialAppsheetDetLiqPorNodo;
    if (!q) return base;
    return base.filter((r) => {
      const p = r?.payload || {};
      return (
        safeIncludes(r.detalle_key, q) ||
        safeIncludes(r.id_liqui, q) ||
        safeIncludes(r.orden_id, q) ||
        safeIncludes(r.liquidacion_codigo, q) ||
        safeIncludes(r.codigo_material, q) ||
        safeIncludes(r.codigo_onu, q) ||
        safeIncludes(r.material, q) ||
        safeIncludes(r.unidad, q) ||
        safeIncludes(r.cantidad, q) ||
        safeIncludes(r.precio_unitario, q) ||
        safeIncludes(r.subtotal, q) ||
        safeIncludes(r.tecnico, q) ||
        safeIncludes(r.cliente, q) ||
        safeIncludes(r.dni, q) ||
        safeIncludes(r.nodo, q) ||
        safeIncludes(r.fecha, q) ||
        safeIncludes(r.observacion, q) ||
        safeIncludes(p?.IDLiqui, q) ||
        safeIncludes(p?.["ID Liqui"], q) ||
        safeIncludes(p?.OrdenID, q) ||
        safeIncludes(p?.["Orden ID"], q) ||
        safeIncludes(p?.Material, q) ||
        safeIncludes(p?.["Codigo ONU"], q) ||
        safeIncludes(p?.CodigoONU, q) ||
        safeIncludes(p?.Cantidad, q)
      );
    });
  }, [historialAppsheetDetLiqPorNodo, historialAppsheetDetLiqBusqueda]);
  const historialAppsheetDetLiqTotalPaginas = useMemo(
    () => Math.max(1, Math.ceil(historialAppsheetDetLiqFiltrados.length / HIST_APPSHEET_PAGE_SIZE)),
    [historialAppsheetDetLiqFiltrados.length]
  );
  const historialAppsheetDetLiqPaginaActiva = Math.min(
    Math.max(1, Number(historialAppsheetDetLiqPagina || 1)),
    historialAppsheetDetLiqTotalPaginas
  );
  const historialAppsheetDetLiqPaginaRows = useMemo(() => {
    const from = (historialAppsheetDetLiqPaginaActiva - 1) * HIST_APPSHEET_PAGE_SIZE;
    return historialAppsheetDetLiqFiltrados.slice(from, from + HIST_APPSHEET_PAGE_SIZE);
  }, [historialAppsheetDetLiqFiltrados, historialAppsheetDetLiqPaginaActiva]);
  const materialesDeLiquidacionSeleccionada = useMemo(() => {
    if (!historialAppsheetLiqMaterialesTarget) return [];
    const keyOrdenId = normalizarClaveCruce(valorLiq(historialAppsheetLiqMaterialesTarget, "orden_id", "Orden ID"));
    const keyCodigo = normalizarClaveCruce(valorLiq(historialAppsheetLiqMaterialesTarget, "codigo", "Código"));
    return historialAppsheetDetLiqPorNodo.filter((m) => {
      const keyDet = normalizarClaveCruce(m.liquidacion_codigo);
      const keyDetOrden = normalizarClaveCruce(m.orden_id);
      if (keyOrdenId && (keyDetOrden === keyOrdenId || keyDet === keyOrdenId)) return true;
      if (keyCodigo && (keyDet === keyCodigo || keyDetOrden === keyCodigo)) return true;
      return false;
    });
  }, [historialAppsheetLiqMaterialesTarget, historialAppsheetDetLiqPorNodo]);
  const totalMaterialesLiquidacionSeleccionada = useMemo(
    () =>
      (Array.isArray(materialesDeLiquidacionSeleccionada) ? materialesDeLiquidacionSeleccionada : []).reduce((acc, m) => {
        const raw = firstText(m?.subtotal, valorLiq(m, "Costo Material", "Subtotal", "Total"), "0");
        const n = Number(String(raw).replace(",", "."));
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0),
    [materialesDeLiquidacionSeleccionada]
  );
  const abrirEquipoDesdeCodigoOnu = async (codigoOnu = "") => {
    const codigo = String(codigoOnu || "").trim();
    if (!codigo || codigo === "-") {
      window.alert("Este material no tiene Codigo ONU.");
      return;
    }
    const norm = (v = "") => String(v || "").trim().toUpperCase();
    let match =
      (Array.isArray(historialAppsheetEquipos) ? historialAppsheetEquipos : []).find(
        (r) => norm(r?.id_onu) === norm(codigo) || norm(r?.id_register) === norm(codigo)
      ) || null;

    if (!match && isSupabaseConfigured) {
      let q = await supabase.from(HIST_APPSHEET_TABLE).select("*").eq("id_onu", codigo).limit(1).maybeSingle();
      if (q.error) q = { data: null, error: null };
      match = q.data || null;
      if (!match) {
        let q2 = await supabase.from(HIST_APPSHEET_TABLE).select("*").eq("id_register", codigo).limit(1).maybeSingle();
        if (q2.error) q2 = { data: null, error: null };
        match = q2.data || null;
      }
    }

    setHistorialAppsheetLiqMaterialesTarget(null);
    setHistorialAppsheetSubmenu("equipos");
    setHistorialAppsheetBusqueda(codigo);
    setHistorialAppsheetPagina(1);

    if (match) {
      setHistorialAppsheetDetalle(match);
      return;
    }

    window.alert(`No se encontro equipo en ONUsRegistradas para: ${codigo}`);
  };
  const historialAppsheetArtFiltrados = useMemo(() => {
    const q = String(historialAppsheetArtBusqueda || "").trim().toLowerCase();
    const base = Array.isArray(historialAppsheetArticulos) ? historialAppsheetArticulos : [];
    if (!q) return base;
    return base.filter((r) => {
      const p = r?.payload || {};
      return (
        safeIncludes(r.id_articulo, q) ||
        safeIncludes(r.codigo, q) ||
        safeIncludes(r.nombre, q) ||
        safeIncludes(r.info, q) ||
        safeIncludes(r.marca, q) ||
        safeIncludes(r.modelo, q) ||
        safeIncludes(r.precio_unitario, q) ||
        safeIncludes(p?.NOMBRE, q) ||
        safeIncludes(p?.INFO, q)
      );
    });
  }, [historialAppsheetArticulos, historialAppsheetArtBusqueda]);
  const historialAppsheetArtTotalPaginas = useMemo(
    () => Math.max(1, Math.ceil(historialAppsheetArtFiltrados.length / HIST_APPSHEET_PAGE_SIZE)),
    [historialAppsheetArtFiltrados.length]
  );
  const historialAppsheetArtPaginaActiva = Math.min(Math.max(1, Number(historialAppsheetArtPagina || 1)), historialAppsheetArtTotalPaginas);
  const historialAppsheetArtPaginaRows = useMemo(() => {
    const from = (historialAppsheetArtPaginaActiva - 1) * HIST_APPSHEET_PAGE_SIZE;
    return historialAppsheetArtFiltrados.slice(from, from + HIST_APPSHEET_PAGE_SIZE);
  }, [historialAppsheetArtFiltrados, historialAppsheetArtPaginaActiva]);
  const historialAppsheetExtractoFiltrado = useMemo(() => {
    const q = String(historialAppsheetExtractoBusqueda || "").trim().toLowerCase();
    const base = Array.isArray(historialAppsheetExtracto) ? historialAppsheetExtracto : [];
    if (!q) return base;
    return base.filter(
      (r) => safeIncludes(r.id, q) || safeIncludes(r.fecha, q) || safeIncludes(r.tipo, q) || safeIncludes(r.responsable, q)
    );
  }, [historialAppsheetExtracto, historialAppsheetExtractoBusqueda]);
  const historialAppsheetMovimientosColumnas = useMemo(() => {
    const cols = [];
    const seen = new Set();
    (Array.isArray(historialAppsheetMovimientos) ? historialAppsheetMovimientos : []).forEach((row) => {
      Object.keys(row || {}).forEach((k) => {
        if (!seen.has(k)) {
          seen.add(k);
          cols.push(k);
        }
      });
    });
    return cols;
  }, [historialAppsheetMovimientos]);
  const historialAppsheetMovimientosFiltrado = useMemo(() => {
    const q = String(historialAppsheetMovimientosBusqueda || "").trim().toLowerCase();
    const base = Array.isArray(historialAppsheetMovimientos) ? historialAppsheetMovimientos : [];
    if (!q) return base;
    return base.filter((row) =>
      Object.values(row || {}).some((v) => safeIncludes(String(v || ""), q))
    );
  }, [historialAppsheetMovimientos, historialAppsheetMovimientosBusqueda]);
  const baseDataOrdenesColumnas = useMemo(() => {
    const excluded = new Set(
      [
        "IP PPoe",
        "Generar Credenciales",
        "TriggerBotONU",
        "CTO",
        "Contrato",
        "MarcaONU",
        "mes",
        "Áño",
        "GPStecn",
        "InicioInstalacion",
        "NumeroT",
        "TecnAsig",
        "Cuadrilla Asignada",
        "Ubicacion de Tecnico",
        "Tecnico Asignado",
        "Enumeracion",
        "Estado",
        "Instalación Gratis",
        "Liquidación",
      ].map((x) => normalizarClaveSheet(x))
    );
    const cols = [];
    const seen = new Set();
    (Array.isArray(baseDataOrdenesRows) ? baseDataOrdenesRows : []).forEach((row) => {
      Object.keys(row || {}).forEach((k) => {
        const nk = normalizarClaveSheet(k);
        if (!nk || excluded.has(nk)) return;
        if (!seen.has(k)) {
          seen.add(k);
          cols.push(k);
        }
      });
    });
    return cols;
  }, [baseDataOrdenesRows]);
  const baseDataPreferredColumns = useMemo(
    () =>
      [
        "Código",
        "Codigo",
        "Orden ID",
        "OrdenID",
        "Orden",
        "DNI",
        "FechaR",
        "Fecha",
        "Fecha para la actuación",
        "Nombre",
        "Celular",
        "CelNot",
        "Empresa",
        "Elegir Nodo",
        "Nodo",
        "TecnicoR",
        "Tecnico",
        "Tipo de actuación",
        "Tipo de actuacion",
        "Estado de Liquidacion",
        "Estado",
        "FotoONU",
        "Foto Onu",
        "FotoFachada",
      ].map((x) => normalizarClaveSheet(x)),
    []
  );
  useEffect(() => {
    if (!baseDataOrdenesColumnas.length) return;
    setBaseDataColumnasVisibles((prev) => {
      const next = { ...prev };
      const hasCustomHiddenColumns = Object.values(prev).some((value) => value === false);
      const shouldApplyRecommendedView = !Object.keys(prev).length || !hasCustomHiddenColumns;
      baseDataOrdenesColumnas.forEach((c) => {
        const preferred = baseDataPreferredColumns.includes(normalizarClaveSheet(c));
        if (shouldApplyRecommendedView) {
          next[c] = preferred;
        } else if (typeof next[c] !== "boolean") {
          next[c] = preferred;
        }
      });
      Object.keys(next).forEach((k) => {
        if (!baseDataOrdenesColumnas.includes(k)) delete next[k];
      });
      return next;
    });
  }, [baseDataOrdenesColumnas, baseDataPreferredColumns]);
  const baseDataOrdenesColumnasActivas = useMemo(() => {
    const active = baseDataOrdenesColumnas.filter((c) => Boolean(baseDataColumnasVisibles[c]));
    const base = active.length ? active : baseDataOrdenesColumnas;
    const order = new Map(baseDataPreferredColumns.map((key, idx) => [key, idx]));
    return [...base].sort((a, b) => {
      const ai = order.get(normalizarClaveSheet(a));
      const bi = order.get(normalizarClaveSheet(b));
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return 0;
    });
  }, [baseDataOrdenesColumnas, baseDataColumnasVisibles, baseDataPreferredColumns]);
  const baseDataOrdenesFechaCol = useMemo(
    () =>
      baseDataOrdenesColumnas.find((c) => {
        const n = normalizarClaveSheet(c);
        return n === "fecha" || n.startsWith("fecha");
      }) || "",
    [baseDataOrdenesColumnas]
  );
  const baseDataOrdenesNodoCol = useMemo(
    () =>
      baseDataOrdenesColumnas.find((c) => {
        const n = normalizarClaveSheet(c);
        return n === "nodo" || n.includes("nodo");
      }) || "",
    [baseDataOrdenesColumnas]
  );
  const baseDataOrdenesEmpresaCol = useMemo(
    () =>
      baseDataOrdenesColumnas.find((c) => {
        const n = normalizarClaveSheet(c);
        return n === "empresa" || n.includes("empresa");
      }) || "",
    [baseDataOrdenesColumnas]
  );
  const baseDataOrdenesRowsPorNodo = useMemo(() => {
    const base = Array.isArray(baseDataOrdenesRows) ? baseDataOrdenesRows : [];
    return base.filter((row) =>
      tieneAccesoNodoSesion(
        firstText(
          baseDataOrdenesNodoCol ? row?.[baseDataOrdenesNodoCol] : "",
          row?.Nodo,
          row?.["Elegir Nodo"],
          row?.nodo
        )
      )
    );
  }, [baseDataOrdenesRows, baseDataOrdenesNodoCol, tieneAccesoNodoSesion]);
  const baseDataOrdenesNodoOpciones = useMemo(() => {
    if (!baseDataOrdenesNodoCol) return [];
    const set = new Set(
      baseDataOrdenesRowsPorNodo
        .map((r) => String(r?.[baseDataOrdenesNodoCol] || "").trim())
        .filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [baseDataOrdenesRowsPorNodo, baseDataOrdenesNodoCol]);
  const baseDataOrdenesEmpresaOpciones = useMemo(() => {
    if (!baseDataOrdenesEmpresaCol) return [];
    const set = new Set(
      baseDataOrdenesRowsPorNodo
        .map((r) => String(r?.[baseDataOrdenesEmpresaCol] || "").trim())
        .filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [baseDataOrdenesRowsPorNodo, baseDataOrdenesEmpresaCol]);
  const baseDataOrdenesFiltrado = useMemo(() => {
    const q = String(baseDataOrdenesBusqueda || "").trim().toLowerCase();
    const base = baseDataOrdenesRowsPorNodo;
    const desde = String(baseDataOrdenesFiltro.desde || "").trim();
    const hasta = String(baseDataOrdenesFiltro.hasta || "").trim();
    const nodo = String(baseDataOrdenesFiltro.nodo || "TODOS").trim();
    const empresa = String(baseDataOrdenesFiltro.empresa || "TODOS").trim();
    const dayStart = desde ? new Date(`${desde}T00:00:00`).getTime() : 0;
    const dayEnd = hasta ? new Date(`${hasta}T23:59:59`).getTime() : 0;
    const filtrado = base.filter((row) => {
      if ((desde || hasta) && baseDataOrdenesFechaCol) {
        const ts = toTimestampFlexible(String(row?.[baseDataOrdenesFechaCol] || ""));
        if (!ts) return false;
        if (dayStart && ts < dayStart) return false;
        if (dayEnd && ts > dayEnd) return false;
      }
      if (nodo !== "TODOS" && baseDataOrdenesNodoCol) {
        if (String(row?.[baseDataOrdenesNodoCol] || "").trim() !== nodo) return false;
      }
      if (empresa !== "TODOS" && baseDataOrdenesEmpresaCol) {
        if (String(row?.[baseDataOrdenesEmpresaCol] || "").trim() !== empresa) return false;
      }
      if (!q) return true;
      return baseDataOrdenesColumnas.some((col) => safeIncludes(String(row?.[col] || ""), q));
    });
    if (!baseDataOrdenesFechaCol) return filtrado;
    return [...filtrado].sort((a, b) => {
      const ta = toTimestampFlexible(String(a?.[baseDataOrdenesFechaCol] || ""));
      const tb = toTimestampFlexible(String(b?.[baseDataOrdenesFechaCol] || ""));
      return tb - ta;
    });
  }, [
    baseDataOrdenesRows,
    baseDataOrdenesBusqueda,
    baseDataOrdenesColumnas,
    baseDataOrdenesFiltro,
    baseDataOrdenesFechaCol,
    baseDataOrdenesNodoCol,
    baseDataOrdenesEmpresaCol,
    baseDataOrdenesRowsPorNodo,
  ]);
  const valorCeldaBaseData = (row = {}, col = "") => {
    const raw = String(row?.[col] ?? "").trim();
    if (!raw) return "-";
    const nk = normalizarClaveSheet(col);
    if (nk.includes("tecnico")) return resolverNombreDesdeCodigoTecnico(raw) || raw;
    return raw;
  };
  const resolverFotoBaseData = (row = {}, col = "") => {
    const raw = String(row?.[col] ?? "").trim();
    if (!raw) return "";
    return normalizePhotoUrlPortal(raw, HIST_APPSHEET_LIQ_TAB);
  };
  const esCampoFotoBaseData = (row = {}, col = "") => {
    const raw = String(row?.[col] ?? "").trim();
    if (!raw) return false;
    const nk = normalizarClaveSheet(col);
    if (nk.includes("foto") || nk.includes("image") || nk.includes("imagen") || nk.includes("captura")) return true;
    return Boolean(resolverFotoBaseData(row, col)) && (/::/.test(raw) || /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|svg|avif)$/i.test(raw));
  };
  const estiloColumnaBaseData = (col = "") => {
    const nk = normalizarClaveSheet(col);
    if (nk.includes("foto")) return { minWidth: "110px" };
    if (nk.includes("dni")) return { minWidth: "92px", whiteSpace: "nowrap" };
    if (nk.includes("fecha")) return { minWidth: "96px", whiteSpace: "nowrap" };
    if (nk.includes("cel") || nk.includes("telefono")) return { minWidth: "118px" };
    if (nk.includes("empresa")) return { minWidth: "110px" };
    if (nk.includes("nodo")) return { minWidth: "100px", whiteSpace: "nowrap" };
    if (nk.includes("tecnico")) return { minWidth: "108px" };
    if (nk.includes("usuario")) return { minWidth: "140px" };
    if (nk.includes("ordenid") || nk === "codigo") return { minWidth: "112px" };
    if (nk === "orden" || nk.includes("tipo")) return { minWidth: "170px" };
    if (nk.includes("nombre")) return { minWidth: "180px" };
    if (nk.includes("direccion")) return { minWidth: "190px" };
    if (nk.includes("estado")) return { minWidth: "124px" };
    return { minWidth: "96px" };
  };
  const buscarCampoBaseData = (row = {}, ...keys) => {
    const entries = Object.entries(row || {});
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return { key, value: valorCeldaBaseData(row, key) };
      }
    }
    for (const key of keys) {
      const nk = normalizarClaveSheet(key);
      const found = entries.find(([col, value]) => normalizarClaveSheet(col) === nk && value !== undefined && value !== null && String(value).trim() !== "");
      if (found) return { key: found[0], value: valorCeldaBaseData(row, found[0]) };
    }
    return { key: "", value: "" };
  };
  const BASEDATA_PAGE_SIZE = 25;
  const baseDataOrdenesTotalPaginas = useMemo(
    () => Math.max(1, Math.ceil(baseDataOrdenesFiltrado.length / BASEDATA_PAGE_SIZE)),
    [baseDataOrdenesFiltrado.length]
  );
  const baseDataOrdenesPaginaActiva = Math.min(Math.max(1, Number(baseDataOrdenesPagina || 1)), baseDataOrdenesTotalPaginas);
  const baseDataOrdenesPaginaRows = useMemo(() => {
    const from = (baseDataOrdenesPaginaActiva - 1) * BASEDATA_PAGE_SIZE;
    return baseDataOrdenesFiltrado.slice(from, from + BASEDATA_PAGE_SIZE);
  }, [baseDataOrdenesFiltrado, baseDataOrdenesPaginaActiva]);
  const baseDataOrdenDetalleDestacados = useMemo(() => {
    if (!baseDataOrdenDetalle) return [];
    return [
      { label: "Orden ID", keys: ["Orden ID", "OrdenID", "Orden Id"] },
      { label: "Código", keys: ["Codigo", "Código"] },
      { label: "Fecha", keys: ["Fecha", "Fecha para la actuación", "Fecha para la actuacion"] },
      { label: "Cliente", keys: ["Cliente", "Nombre", "Nombres", "Apellidos y Nombres"] },
      { label: "DNI", keys: ["DNI", "Cedula", "Cédula"] },
      { label: "Dirección", keys: ["Direccion", "Dirección"] },
      { label: "Nodo", keys: ["Nodo", "Elegir Nodo"] },
      { label: "Empresa", keys: ["Empresa"] },
      { label: "Actuación", keys: ["Actuacion", "Actuación", "Tipo de actuacion", "Tipo de actuación"] },
      { label: "Técnico", keys: ["Tecnico", "Técnico", "TecnicoAsignado", "TécnicoAsignado", "Tecnico Asignado"] },
      { label: "Celular", keys: ["Celular", "Telefono", "Teléfono"] },
      { label: "Estado", keys: ["Estado", "Resultado"] },
    ]
      .map((item) => {
        const found = buscarCampoBaseData(baseDataOrdenDetalle, ...item.keys);
        return found.value ? { label: item.label, value: found.value, matchedKey: found.key } : null;
      })
      .filter(Boolean);
  }, [baseDataOrdenDetalle]);
  const baseDataOrdenDetalleAdicionales = useMemo(() => {
    if (!baseDataOrdenDetalle) return [];
    const usados = new Set(baseDataOrdenDetalleDestacados.map((item) => normalizarClaveSheet(item.matchedKey || "")));
    return Object.keys(baseDataOrdenDetalle)
      .filter((col) => {
        const normalized = normalizarClaveSheet(col);
        return normalized && !usados.has(normalized) && String(baseDataOrdenDetalle?.[col] ?? "").trim() !== "";
      })
      .map((col) => ({
        label: col,
        value: valorCeldaBaseData(baseDataOrdenDetalle, col),
        photoUrl: esCampoFotoBaseData(baseDataOrdenDetalle, col) ? resolverFotoBaseData(baseDataOrdenDetalle, col) : "",
      }));
  }, [baseDataOrdenDetalle, baseDataOrdenDetalleDestacados]);
  const baseDataOrdenDetalleTitulo = useMemo(() => {
    if (!baseDataOrdenDetalle) return "-";
    return firstText(
      buscarCampoBaseData(baseDataOrdenDetalle, "Orden ID", "OrdenID", "Orden Id").value,
      buscarCampoBaseData(baseDataOrdenDetalle, "Codigo", "Código").value,
      buscarCampoBaseData(baseDataOrdenDetalle, "Cliente", "Nombre", "Nombres").value,
      "-"
    );
  }, [baseDataOrdenDetalle]);
  useEffect(() => {
    setBaseDataOrdenesPagina(1);
  }, [baseDataOrdenesBusqueda, baseDataOrdenesFiltro, baseDataOrdenesRows.length]);
  const generarPdfOrdenesBaseData = () => {
    if (!baseDataOrdenesFiltrado.length) {
      window.alert("No hay registros para ese filtro.");
      return;
    }
    const headers = baseDataOrdenesColumnasActivas.map((col) => `<th>${escHtml(col)}</th>`).join("");
    const rows = baseDataOrdenesFiltrado
      .map((row) => {
        const tds = baseDataOrdenesColumnasActivas
          .map((col) => `<td>${escHtml(valorCeldaBaseData(row, col))}</td>`)
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" />
    <title>PDF Ordenes BaseData</title>
    <style>
      body{font-family:Segoe UI,Arial,sans-serif;margin:12px;color:#0f172a}
      h1{margin:0 0 6px 0;font-size:18px}
      p{margin:2px 0 6px 0;color:#334155;font-size:11px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th,td{border:1px solid #d7e2f3;padding:4px;text-align:left;vertical-align:top}
      th{background:#eef4ff}
    </style></head><body>
      <h1>Ordenes BaseData</h1>
      <p>Generado: ${escHtml(new Date().toLocaleString("es-PE"))}</p>
      <p>Rango fecha: ${escHtml(baseDataOrdenesFiltro.desde || "-")} a ${escHtml(baseDataOrdenesFiltro.hasta || "-")} | Nodo: ${escHtml(
      baseDataOrdenesFiltro.nodo
    )} | Empresa: ${escHtml(baseDataOrdenesFiltro.empresa)}</p>
      <p>Registros: <b>${baseDataOrdenesFiltrado.length}</b></p>
      <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    imprimirHtmlMismaPestana(html);
  };
  const generarExcelOrdenesBaseData = () => {
    if (!baseDataOrdenesFiltrado.length) {
      window.alert("No hay registros para exportar.");
      return;
    }
    const headers = baseDataOrdenesColumnasActivas;
    const esc = (v = "") =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const rows = baseDataOrdenesFiltrado
      .map((row) => `<tr>${headers.map((h) => `<td>${esc(valorCeldaBaseData(row, h))}</td>`).join("")}</tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${headers
      .map((h) => `<th>${esc(h)}</th>`)
      .join("")}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `ordenes-basedata-${ts}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const conteoMovimientosPorId = useMemo(() => {
    const map = new Map();
    (Array.isArray(historialAppsheetMovimientos) ? historialAppsheetMovimientos : []).forEach((row) => {
      const key = String(firstText(row?.IDMovimiento, row?.["IDMovimiento"]) || "").trim();
      if (!key) return;
      map.set(key, Number(map.get(key) || 0) + 1);
    });
    return map;
  }, [historialAppsheetMovimientos]);
  const abrirMovimientosPorExtractoId = async (extractoId = "") => {
    const id = String(extractoId || "").trim();
    if (!id) return;
    if (!historialAppsheetMovimientos.length) await cargarHistorialAppsheetMovimientos();
    setHistorialAppsheetSubmenu("movimientos");
    setHistorialAppsheetMovimientosBusqueda(id);
  };
  const historialPdfRows = useMemo(() => {
    const base = historialAppsheetLiquidacionesPorNodo;
    const desde = String(historialAppsheetPdfFiltro.desde || "").trim();
    const hasta = String(historialAppsheetPdfFiltro.hasta || "").trim();
    const tecnico = String(historialAppsheetPdfFiltro.tecnico || "TODOS").trim();
    const desdeTs = desde ? new Date(`${desde}T00:00:00`).getTime() : 0;
    const hastaTs = hasta ? new Date(`${hasta}T23:59:59`).getTime() : 0;
    return base.filter((row) => {
      const ts = toTimestampFlexible(valorLiq(row, "fecha", "Fecha"));
      if (desdeTs && (!ts || ts < desdeTs)) return false;
      if (hastaTs && (!ts || ts > hastaTs)) return false;
      if (tecnico !== "TODOS") {
        const t = tecnicoLiqNombre(row);
        if (String(t || "").trim() !== tecnico) return false;
      }
      return true;
    });
  }, [historialAppsheetLiquidacionesPorNodo, historialAppsheetPdfFiltro, tecnicoLiqNombre]);
  const generarPdfReporteTecnicoHistorial = async () => {
    if (!historialPdfRows.length) {
      window.alert("No hay registros para ese filtro.");
      return;
    }
    if (!historialAppsheetArticulos.length) await cargarHistorialAppsheetArticulos();
    if (!historialAppsheetDetLiq.length) await cargarHistorialAppsheetDetalleLiquidacion();
    const detRows = Array.isArray(historialAppsheetDetLiq) ? historialAppsheetDetLiq : [];
    let articulosRows = Array.isArray(historialAppsheetArticulos) ? historialAppsheetArticulos : [];
    if (!articulosRows.length && isSupabaseConfigured) {
      const { data } = await supabase
        .from(HIST_APPSHEET_ART_TABLE)
        .select("id_articulo,codigo,nombre,payload")
        .order("updated_at", { ascending: false })
        .limit(5000);
      articulosRows = Array.isArray(data) ? data : [];
    }
    const nombreArticuloPorCodigo = new Map();
    articulosRows.forEach((art) => {
      const nombre = firstText(art?.nombre, valorLiq(art, "NOMBRE", "Nombre", "Producto", "Material"));
      if (!nombre) return;
      const keys = [art?.id_articulo, art?.codigo, valorLiq(art, "ID_ARTICULO", "ID ARTICULO", "IDArticulo", "Codigo")]
        .map((x) => normalizarClaveSheet(x))
        .filter(Boolean);
      keys.forEach((k) => nombreArticuloPorCodigo.set(k, nombre));
    });
    const key = (v = "") => String(v || "").trim().toUpperCase().replace(/\s+/g, "");
    const isInstalacion = (txt = "") => String(txt || "").toLowerCase().includes("instal");
    let instalaciones = 0;
    let incidencias = 0;
    let totalMateriales = 0;
    const rowsHtml = historialPdfRows
      .map((row, idx) => {
        const codigo = valorLiq(row, "codigo", "Código");
        const ordenId = valorLiq(row, "orden_id", "Orden ID");
        const actuacion = firstText(valorLiq(row, "actuacion", "Actuacion"), valorLiq(row, "tipo_actuacion", "Tipo de actuacion"), "-");
        if (isInstalacion(actuacion)) instalaciones += 1;
        else incidencias += 1;
        const kCodigo = key(codigo);
        const kOrden = key(ordenId);
        const mats = detRows.filter((m) => {
          const mkOrden = key(firstText(m?.orden_id, valorLiq(m, "OrdenID", "Orden ID", "OrdenId")));
          const mkLiq = key(firstText(m?.liquidacion_codigo, m?.orden_id, valorLiq(m, "OrdenID", "Orden ID", "OrdenId")));
          if (kOrden && (mkOrden === kOrden || mkLiq === kOrden)) return true;
          if (kCodigo && (mkOrden === kCodigo || mkLiq === kCodigo)) return true;
          return false;
        });
        const costoMat = mats.reduce((acc, m) => {
          const n = Number(String(firstText(m?.subtotal, valorLiq(m, "Costo Material", "Subtotal", "Total"), "0")).replace(",", "."));
          return acc + (Number.isFinite(n) ? n : 0);
        }, 0);
        totalMateriales += costoMat;
        const materialesDet = mats.length
          ? mats
              .map((m) => {
                const codigoRef = firstText(m?.codigo_material, m?.material, valorLiq(m, "Producto", "Material"));
                const nombreRaw = firstText(
                  nombreArticuloPorCodigo.get(normalizarClaveSheet(codigoRef)),
                  infoMaterialDetalle(m).nombre,
                  codigoRef,
                  "-"
                );
                const nombre = escHtml(nombreRaw);
                const cant = Number(String(firstText(m?.cantidad, "0")).replace(",", "."));
                const sub = Number(String(firstText(m?.subtotal, valorLiq(m, "Costo Material", "Subtotal", "Total"), "0")).replace(",", "."));
                return `${nombre} x${Number.isFinite(cant) ? cant.toFixed(2) : "0.00"} (S/ ${Number.isFinite(sub) ? sub.toFixed(2) : "0.00"})`;
              })
              .join("; ")
          : "-";
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escHtml(formatFechaFlexible(valorLiq(row, "fecha", "Fecha")))}</td>
          <td>${escHtml(codigo || "-")}</td>
          <td>${escHtml(actuacion)}</td>
          <td>${escHtml(tecnicoLiqNombre(row) || "-")}</td>
          <td>S/ ${costoMat.toFixed(2)}</td>
          <td>${materialesDet}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8" />
    <title>Reporte técnico AppSheet</title>
    <style>
      body{font-family:Segoe UI,Arial,sans-serif;margin:12px;color:#0f172a}
      h1{margin:0 0 6px 0;font-size:18px}
      p{margin:2px 0 6px 0;color:#334155;font-size:11px}
      table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}
      th,td{border:1px solid #d7e2f3;padding:4px;text-align:left;vertical-align:top;word-wrap:break-word}
      th{background:#eef4ff}
      .kpi{margin:6px 0 8px 0;font-size:11px}
    </style></head><body>
      <h1>Reporte técnico - Historial AppSheet</h1>
      <p>Generado: ${escHtml(new Date().toLocaleString("es-PE"))}</p>
      <p>Rango: ${escHtml(historialAppsheetPdfFiltro.desde || "-")} a ${escHtml(historialAppsheetPdfFiltro.hasta || "-")} | Técnico: ${escHtml(
      historialAppsheetPdfFiltro.tecnico === "TODOS" ? "Todos" : historialAppsheetPdfFiltro.tecnico
    )}</p>
      <div class="kpi">
        Actuaciones: <b>${historialPdfRows.length}</b> |
        Instalación: <b>${instalaciones}</b> |
        Incidencia: <b>${incidencias}</b> |
        Gasto materiales: <b>S/ ${Number(totalMateriales || 0).toFixed(2)}</b>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:28px">#</th><th style="width:84px">Fecha</th><th style="width:92px">Código</th><th style="width:92px">Actuación</th><th style="width:92px">Técnico</th><th style="width:68px">Costo mat.</th><th>Detalle materiales</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body></html>`;
    imprimirHtmlMismaPestana(html);
  };
  const historialMovimientosPdfRows = useMemo(() => {
    const mapExtracto = new Map();
    (Array.isArray(historialAppsheetExtracto) ? historialAppsheetExtracto : []).forEach((e) => {
      const id = String(e?.id || "").trim();
      if (!id) return;
      mapExtracto.set(id, e);
    });
    return (Array.isArray(historialAppsheetMovimientos) ? historialAppsheetMovimientos : []).map((m) => {
      const idMovimiento = String(firstText(m?.IDMovimiento, m?.["IDMovimiento"]) || "").trim();
      const ext = mapExtracto.get(idMovimiento) || {};
      const fecha = firstText(ext?.fecha, m?.FECHA, m?.Fecha);
      const tipo = firstText(ext?.tipo, m?.TIPO, m?.Tipo);
      const responsable = firstText(ext?.responsable, m?.RESPONSABLE, m?.Responsable);
      const productoRaw = firstText(m?.Producto, m?.PRODUCTO, m?.producto);
      const producto = firstText(
        historialArticulosInfoPorCodigo.get(normalizarClaveSheet(productoRaw))?.nombre,
        productoRaw
      );
      const codigoOnu = firstText(m?.["CódigoONU"], m?.CodigoONU, m?.["Código ONU"], m?.codigo_onu);
      const tecnicoRaw = firstText(m?.Tecnico, m?.TECNICO, m?.tecnico);
      const tecnico = firstText(resolverNombreDesdeCodigoTecnico(tecnicoRaw), tecnicoRaw);
      const cantidadNum = Number(String(firstText(m?.Cantidad, m?.CANTIDAD, "0")).replace(",", "."));
      const precioNum = Number(String(firstText(m?.PrecioUnitarioUsado, m?.["Precio Unitario Usado"], "0")).replace(",", "."));
      const costoNumRaw = Number(String(firstText(m?.["Costo Material"], m?.CostoMaterial, "0")).replace(",", "."));
      const costoNum = Number.isFinite(costoNumRaw) && costoNumRaw > 0 ? costoNumRaw : cantidadNum * precioNum;
      return {
        idMovimiento,
        idDetalle: firstText(m?.IDDetalle, m?.["IDDetalle"]),
        fecha,
        tipo,
        responsable,
        tecnico,
        producto,
        codigoOnu,
        cantidad: Number.isFinite(cantidadNum) ? cantidadNum : 0,
        precioUnitario: Number.isFinite(precioNum) ? precioNum : 0,
        costoMaterial: Number.isFinite(costoNum) ? costoNum : 0,
      };
    });
  }, [historialAppsheetExtracto, historialAppsheetMovimientos, historialArticulosInfoPorCodigo]);
  const historialMovimientosPdfFiltrados = useMemo(() => {
    const desde = String(historialPdfMovFiltro.desde || "").trim();
    const hasta = String(historialPdfMovFiltro.hasta || "").trim();
    const tipo = String(historialPdfMovFiltro.tipo || "TODOS").trim();
    const tecnico = String(historialPdfMovFiltro.tecnico || "TODOS").trim();
    const responsable = String(historialPdfMovFiltro.responsable || "TODOS").trim();
    const q = String(historialPdfMovFiltro.query || "").trim().toLowerCase();
    const desdeTs = desde ? new Date(`${desde}T00:00:00`).getTime() : 0;
    const hastaTs = hasta ? new Date(`${hasta}T23:59:59`).getTime() : 0;
    return historialMovimientosPdfRows.filter((r) => {
      const ts = toTimestampFlexible(r.fecha);
      if (desdeTs && (!ts || ts < desdeTs)) return false;
      if (hastaTs && (!ts || ts > hastaTs)) return false;
      if (tipo !== "TODOS" && String(r.tipo || "").trim().toUpperCase() !== tipo.toUpperCase()) return false;
      if (tecnico !== "TODOS" && String(r.tecnico || "").trim() !== tecnico) return false;
      if (responsable !== "TODOS" && String(r.responsable || "").trim() !== responsable) return false;
      if (
        q &&
        !(
          safeIncludes(r.idMovimiento, q) ||
          safeIncludes(r.idDetalle, q) ||
          safeIncludes(r.fecha, q) ||
          safeIncludes(r.tipo, q) ||
          safeIncludes(r.responsable, q) ||
          safeIncludes(r.tecnico, q) ||
          safeIncludes(r.producto, q) ||
          safeIncludes(r.codigoOnu, q)
        )
      )
        return false;
      return true;
    });
  }, [historialMovimientosPdfRows, historialPdfMovFiltro]);
  const historialPdfMovTecnicosOpciones = useMemo(() => {
    const set = new Set(historialMovimientosPdfRows.map((r) => String(r.tecnico || "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [historialMovimientosPdfRows]);
  const historialPdfMovResponsablesOpciones = useMemo(() => {
    const set = new Set(historialMovimientosPdfRows.map((r) => String(r.responsable || "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [historialMovimientosPdfRows]);
  const generarPdfMovimientosExtracto = () => {
    if (!historialMovimientosPdfFiltrados.length) {
      window.alert("No hay movimientos para ese filtro.");
      return;
    }
    const totalItems = historialMovimientosPdfFiltrados.reduce((acc, r) => acc + Number(r.cantidad || 0), 0);
    const totalCosto = historialMovimientosPdfFiltrados.reduce((acc, r) => acc + Number(r.costoMaterial || 0), 0);
    const rowsHtml = historialMovimientosPdfFiltrados
      .map(
        (r, idx) => `<tr>
      <td>${idx + 1}</td>
      <td>${escHtml(r.fecha || "-")}</td>
      <td>${escHtml(r.tipo || "-")}</td>
      <td>${escHtml(r.responsable || "-")}</td>
      <td>${escHtml(r.tecnico || "-")}</td>
      <td>${escHtml(r.idMovimiento || "-")}</td>
      <td>${escHtml(r.producto || "-")}</td>
      <td>${escHtml(r.codigoOnu || "-")}</td>
      <td>${Number(r.cantidad || 0).toFixed(2)}</td>
      <td>S/ ${Number(r.precioUnitario || 0).toFixed(2)}</td>
      <td>S/ ${Number(r.costoMaterial || 0).toFixed(2)}</td>
    </tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" />
    <title>PDF Movimientos</title>
    <style>
      body{font-family:Segoe UI,Arial,sans-serif;margin:12px;color:#0f172a}
      h1{margin:0 0 6px 0;font-size:18px}
      p{margin:2px 0 6px 0;color:#334155;font-size:11px}
      table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}
      th,td{border:1px solid #d7e2f3;padding:4px;text-align:left;vertical-align:top;word-wrap:break-word}
      th{background:#eef4ff}
      .kpi{margin:6px 0 8px 0;font-size:11px}
    </style></head><body>
      <h1>Movimientos (Extracto + DetalleMovimiento)</h1>
      <p>Generado: ${escHtml(new Date().toLocaleString("es-PE"))}</p>
      <p>Rango: ${escHtml(historialPdfMovFiltro.desde || "-")} a ${escHtml(historialPdfMovFiltro.hasta || "-")} | Tipo: ${escHtml(
      historialPdfMovFiltro.tipo
    )} | Tecnico: ${escHtml(historialPdfMovFiltro.tecnico === "TODOS" ? "Todos" : historialPdfMovFiltro.tecnico)} | Responsable: ${escHtml(
      historialPdfMovFiltro.responsable === "TODOS" ? "Todos" : historialPdfMovFiltro.responsable
    )}</p>
      <div class="kpi">Registros: <b>${historialMovimientosPdfFiltrados.length}</b> | Cantidad total: <b>${totalItems.toFixed(
      2
    )}</b> | Costo total: <b>S/ ${totalCosto.toFixed(2)}</b></div>
      <table>
        <thead>
          <tr>
            <th style="width:26px">#</th><th style="width:86px">Fecha</th><th style="width:58px">Tipo</th><th style="width:92px">Responsable</th><th style="width:88px">Tecnico</th><th style="width:78px">ID Mov</th><th style="width:120px">Producto</th><th style="width:90px">Codigo ONU</th><th style="width:56px">Cant.</th><th style="width:68px">P.Unit</th><th style="width:72px">Costo</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body></html>`;
    imprimirHtmlMismaPestana(html);
  };
  const imprimirHistorialAppsheetColumnas = () => {
    if (!historialAppsheetEquiposFiltrados.length) {
      alert("No hay registros filtrados para imprimir.");
      return;
    }
    if (!historialColumnasActivas.length) {
      alert("Selecciona al menos una columna para imprimir.");
      return;
    }
    const headers = historialColumnasActivas.map((col) => `<th>${escHtml(col.label)}</th>`).join("");
    const rows = historialAppsheetEquiposFiltrados
      .map((row) => {
        const cols = historialColumnasActivas
          .map((col) => {
            const value = valorCeldaHistorial(row, col.key);
            if (String(col.key).startsWith("foto_")) {
              return `<td>${value ? "Con foto" : "-"}</td>`;
            }
            return `<td>${escHtml(value)}</td>`;
          })
          .join("");
        return `<tr>${cols}</tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <title>Historial AppSheet - Equipos</title>
      <style>
        body{font-family:Arial,sans-serif;padding:18px;color:#0f172a}
        h1{font-size:18px;margin:0 0 8px}
        p{margin:3px 0;font-size:12px;color:#334155}
        table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}
        th,td{border:1px solid #cbd5e1;padding:6px;vertical-align:top}
        th{background:#f1f5f9;text-align:left}
      </style></head><body>
      <h1>Historial AppSheet - Equipos</h1>
      <p>Registros: ${historialAppsheetEquiposFiltrados.length}</p>
      <p>Fecha: ${escHtml(new Date().toLocaleString("es-PE"))}</p>
      <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;
    imprimirHtmlMismaPestana(html);
  };

  const generarPdfHistorial = () => {
    if (!liquidacionesFiltradas.length) { alert("No hay registros para exportar con los filtros actuales."); return; }
    const tipoLabel = histFiltroTipo === "TODOS" ? "Todos los tipos" : histFiltroTipo;
    const nodoLabel = histFiltroNodo === "TODOS" ? "Todos los nodos" : histFiltroNodo;
    const filas = liquidacionesFiltradas.map((item) => {
      const tipo = String(item.tipoActuacion || "-");
      const color = tipo.toLowerCase().includes("incidencia") ? "#fff7ed" :
        tipo.toLowerCase().includes("servicio") ? "#eff6ff" :
        tipo.toLowerCase().includes("instalacion") ? "#f0fdf4" :
        tipo.toLowerCase().includes("recuperacion") ? "#fdf2f8" : "#f8fafc";
      const badge = tipo.toLowerCase().includes("incidencia") ? "#ea580c" :
        tipo.toLowerCase().includes("servicio") ? "#1d4ed8" :
        tipo.toLowerCase().includes("instalacion") ? "#16a34a" :
        tipo.toLowerCase().includes("recuperacion") ? "#9333ea" : "#475569";
      return `<tr style="background:${color}">
        <td>${escHtml(item.codigo)}</td>
        <td>${escHtml(item.fechaLiquidacion)}</td>
        <td>${escHtml(item.nombre)}</td>
        <td>${escHtml(item.dni)}</td>
        <td><span style="background:${badge};color:#fff;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap">${escHtml(tipo)}</span></td>
        <td>${escHtml(item.nodo || "-")}</td>
        <td>${escHtml(item.tecnico || "-")}</td>
        <td>${escHtml(item.liquidacion?.resultadoFinal || "-")}</td>
        <td>${escHtml(item.velocidad || "-")}</td>
        <td>${escHtml(item.usuarioNodo || "-")}</td>
      </tr>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>Historial de Liquidaciones</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;padding:24px;color:#0f172a;background:#f8fafc}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e2e8f0}
      .logo{display:flex;align-items:center}
      .meta{font-size:11px;color:#64748b;text-align:right;line-height:1.7}
      .chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
      .chip{background:#e2e8f0;color:#334155;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:600}
      .chip.blue{background:#dbeafe;color:#1d4ed8}
      .chip.orange{background:#ffedd5;color:#c2410c}
      .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
      .stat{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center}
      .stat-n{font-size:24px;font-weight:900;color:#0A2E5F}
      .stat-l{font-size:11px;color:#64748b;margin-top:2px}
      table{width:100%;border-collapse:collapse;font-size:10.5px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
      thead tr{background:#0A2E5F;color:#fff}
      th{padding:9px 8px;text-align:left;font-weight:700;font-size:10px;letter-spacing:0.04em;text-transform:uppercase}
      td{padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
      tr:last-child td{border-bottom:none}
      .footer{margin-top:16px;font-size:10px;color:#94a3b8;text-align:center}
      @media print{body{padding:12px}.stats{grid-template-columns:repeat(4,1fr)}}
    </style></head><body>
    <div class="header">
      <div class="logo"><img src="${logoAmericanet}" alt="Americanet" style="height:48px;object-fit:contain" /></div>
      <div class="meta">
        <div><b>Historial de Liquidaciones</b></div>
        <div>Generado: ${escHtml(new Date().toLocaleString("es-PE"))}</div>
        <div>Nodo: ${escHtml(nodoLabel)} &nbsp;|&nbsp; Tipo: ${escHtml(tipoLabel)}</div>
        ${histFiltroDesde || histFiltroHasta ? `<div>Periodo: ${escHtml(histFiltroDesde || "inicio")} → ${escHtml(histFiltroHasta || "hoy")}</div>` : ""}
      </div>
    </div>
    <div class="chips">
      <span class="chip blue">Total: ${liquidacionesFiltradas.length} registros</span>
      ${histFiltroNodo !== "TODOS" ? `<span class="chip orange">Nodo: ${escHtml(histFiltroNodo)}</span>` : ""}
      ${histFiltroTipo !== "TODOS" ? `<span class="chip orange">Tipo: ${escHtml(histFiltroTipo)}</span>` : ""}
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-n">${liquidacionesFiltradas.length}</div><div class="stat-l">Total</div></div>
      <div class="stat"><div class="stat-n" style="color:#ea580c">${liquidacionesFiltradas.filter(x=>String(x.tipoActuacion||"").toLowerCase().includes("incidencia")).length}</div><div class="stat-l">Incidencias</div></div>
      <div class="stat"><div class="stat-n" style="color:#16a34a">${liquidacionesFiltradas.filter(x=>String(x.tipoActuacion||"").toLowerCase().includes("instalacion")).length}</div><div class="stat-l">Instalaciones</div></div>
      <div class="stat"><div class="stat-n" style="color:#9333ea">${liquidacionesFiltradas.filter(x=>String(x.tipoActuacion||"").toLowerCase().includes("recuperacion")).length}</div><div class="stat-l">Recuperaciones</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Código</th><th>Fecha</th><th>Cliente</th><th>DNI</th><th>Tipo</th>
        <th>Nodo</th><th>Técnico</th><th>Resultado</th><th>Plan</th><th>Usuario</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="footer">Americanet — Sistema de Gestión de Órdenes — ${escHtml(new Date().toLocaleString("es-PE"))}</div>
    </body></html>`;
    imprimirHtmlMismaPestana(html);
  };

  const handleUsuarioChange = (field, value) => {
    if (field === "rol") {
      const rolNorm = normalizarRolSimple(value);
      const accesosMenuPorRol = [...(PERMISOS_MENU_POR_ROL_WEB[rolNorm] || PERMISOS_MENU_POR_ROL_WEB.Tecnico || [])];
      setUsuarioForm((prev) =>
        normalizarUsuarioConPermisos({
          ...prev,
          rol: rolNorm,
          accesosMenu: accesosMenuPorRol,
          accesosHistorialAppsheet: getAccesosHistorialAppsheetPorRolWeb(rolNorm),
          accesosDiagnosticoServicio: getAccesosDiagnosticoServicioPorRolWeb(rolNorm, accesosMenuPorRol),
          nodosAcceso:
            rolNorm === "Gestora"
              ? normalizarNodosAccesoWeb(prev?.nodosAcceso).length
                ? normalizarNodosAccesoWeb(prev?.nodosAcceso)
                : [...NODOS_BASE_WEB]
              : [],
        })
      );
      return;
    }
    setUsuarioForm((prev) => normalizarUsuarioConPermisos({ ...prev, [field]: value }));
  };

  const aplicarAccesosPorRolUsuario = () => {
    setUsuarioForm((prev) =>
      normalizarUsuarioConPermisos({
        ...prev,
        accesosMenu: [...(PERMISOS_MENU_POR_ROL_WEB[normalizarRolSimple(prev?.rol)] || [])],
        accesosHistorialAppsheet: getAccesosHistorialAppsheetPorRolWeb(prev?.rol),
        accesosDiagnosticoServicio: getAccesosDiagnosticoServicioPorRolWeb(
          prev?.rol,
          PERMISOS_MENU_POR_ROL_WEB[normalizarRolSimple(prev?.rol)] || []
        ),
      })
    );
  };

  const toggleAccesoMenuUsuario = (menuKey) => {
    setUsuarioForm((prev) => {
      const setAccesos = new Set(normalizarAccesosMenuWeb(prev?.accesosMenu, prev?.rol));
      if (setAccesos.has(menuKey)) setAccesos.delete(menuKey);
      else setAccesos.add(menuKey);
      return normalizarUsuarioConPermisos({ ...prev, accesosMenu: Array.from(setAccesos) });
    });
  };

  const seleccionarTodosAccesosUsuario = () => {
    setUsuarioForm((prev) => normalizarUsuarioConPermisos({ ...prev, accesosMenu: MENU_VISTAS_WEB.map((x) => x.key) }));
  };

  const limpiarAccesosUsuario = () => {
    setUsuarioForm((prev) => normalizarUsuarioConPermisos({ ...prev, accesosMenu: [] }));
  };

  const toggleAccesoHistorialAppsheetUsuario = (submenuKey) => {
    setUsuarioForm((prev) => {
      const setAccesos = new Set(normalizarAccesosHistorialAppsheetWeb(prev?.accesosHistorialAppsheet, prev?.rol));
      if (setAccesos.has(submenuKey)) setAccesos.delete(submenuKey);
      else setAccesos.add(submenuKey);
      return normalizarUsuarioConPermisos({ ...prev, accesosHistorialAppsheet: Array.from(setAccesos) });
    });
  };

  const aplicarAccesosHistorialAppsheetPorRolUsuario = () => {
    setUsuarioForm((prev) =>
      normalizarUsuarioConPermisos({
        ...prev,
        accesosHistorialAppsheet: getAccesosHistorialAppsheetPorRolWeb(prev?.rol),
      })
    );
  };

  const seleccionarTodosAccesosHistorialAppsheetUsuario = () => {
    setUsuarioForm((prev) =>
      normalizarUsuarioConPermisos({
        ...prev,
        accesosHistorialAppsheet: HISTORIAL_APPSHEET_SUBMENU_ITEMS.map((item) => item.key),
      })
    );
  };

  const limpiarAccesosHistorialAppsheetUsuario = () => {
    setUsuarioForm((prev) => normalizarUsuarioConPermisos({ ...prev, accesosHistorialAppsheet: [] }));
  };

  const toggleAccesoDiagnosticoServicioUsuario = (permisoKey) => {
    setUsuarioForm((prev) => {
      const setAccesos = new Set(
        normalizarAccesosDiagnosticoServicioWeb(prev?.accesosDiagnosticoServicio, prev?.rol, prev?.accesosMenu)
      );
      if (setAccesos.has(permisoKey)) setAccesos.delete(permisoKey);
      else setAccesos.add(permisoKey);
      return normalizarUsuarioConPermisos({ ...prev, accesosDiagnosticoServicio: Array.from(setAccesos) });
    });
  };

  const aplicarAccesosDiagnosticoServicioPorRolUsuario = () => {
    setUsuarioForm((prev) =>
      normalizarUsuarioConPermisos({
        ...prev,
        accesosDiagnosticoServicio: getAccesosDiagnosticoServicioPorRolWeb(prev?.rol, prev?.accesosMenu),
      })
    );
  };

  const seleccionarTodosAccesosDiagnosticoServicioUsuario = () => {
    setUsuarioForm((prev) =>
      normalizarUsuarioConPermisos({
        ...prev,
        accesosDiagnosticoServicio: DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS.map((item) => item.key),
      })
    );
  };

  const limpiarAccesosDiagnosticoServicioUsuario = () => {
    setUsuarioForm((prev) => normalizarUsuarioConPermisos({ ...prev, accesosDiagnosticoServicio: [] }));
  };

  const toggleNodoAccesoUsuario = (nodo) => {
    setUsuarioForm((prev) => {
      const setNodos = new Set(normalizarNodosAccesoWeb(prev?.nodosAcceso));
      if (setNodos.has(nodo)) setNodos.delete(nodo);
      else setNodos.add(nodo);
      return normalizarUsuarioConPermisos({ ...prev, nodosAcceso: Array.from(setNodos) });
    });
  };

  const seleccionarTodosNodosUsuario = () => {
    setUsuarioForm((prev) => normalizarUsuarioConPermisos({ ...prev, nodosAcceso: [...NODOS_BASE_WEB] }));
  };

  const limpiarNodosUsuario = () => {
    setUsuarioForm((prev) => normalizarUsuarioConPermisos({ ...prev, nodosAcceso: [] }));
  };

  const handleEquipoCatalogoChange = (field, value) => {
    setEquipoForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const generarCodigoUnico = useCallback(() => {
    const year = new Date().getFullYear();
    const prefix = "ORD-";
    const suffix = `-${year}`;
    let max = 0;
    ordenes.forEach((o) => {
      const code = String(o.codigo || "");
      if (code.startsWith(prefix) && code.endsWith(suffix)) {
        const mid = code.slice(prefix.length, code.length - suffix.length);
        const num = parseInt(mid, 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
    return `ORD-${String(max + 1).padStart(4, "0")}-${year}`;
  }, [ordenes]);

  const generarCodigo = () => {
    handleChange("codigo", generarCodigoUnico());
  };

  // Auto-generar código único al abrir formulario de nueva orden
  // (debe estar aquí, después de generarCodigoUnico para evitar ReferenceError)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (vistaActiva !== "crear" || ordenEditandoId) return;
    setOrden((prev) => prev.codigo ? prev : { ...prev, codigo: generarCodigoUnico() });
    // Resetear ref solo cuando se abre un formulario totalmente nuevo (sin cliente precargado)
    if (!orden.cajaNap) cajaNapDesdClienteRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaActiva, ordenEditandoId]);

  const llamarCliente = (telefono) => {
    if (!telefono) {
      alert("No hay número de teléfono registrado.");
      return;
    }
    window.open(`tel:${telefono}`);
  };

  const abrirWhatsApp = (telefono) => {
    if (!telefono) {
      alert("No hay número registrado");
      return;
    }

    let numero = String(telefono).replace(/\D/g, "");

    if (!numero.startsWith("51")) {
      numero = "51" + numero;
    }

    window.open(`https://wa.me/${numero}`, "_blank");
  };

  const abrirMapa = (ubicacion, direccion) => {
    const destino = String(ubicacion || "").trim() || String(direccion || "").trim();

    if (!destino) {
      alert("No hay ubicación registrada.");
      return;
    }

    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}`;
    window.open(url, "_blank");
  };

  const navegarRuta = (ubicacion, direccion) => {
    const destino = String(ubicacion || "").trim() || String(direccion || "").trim();

    if (!destino) {
      alert("No hay ubicación registrada.");
      return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      destino
    )}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const buscarDni = async () => {
    const dni = orden.dni.trim();

    if (!dni) {
      alert("Ingresa un DNI");
      return;
    }

    if (dni.length !== 8) {
      alert("El DNI debe tener 8 dígitos");
      return;
    }

    try {
      setBuscandoDni(true);

      const dniController = new AbortController();
      const dniTimeout = setTimeout(() => dniController.abort(), 10000);
      let response;
      try {
        response = await fetch("https://api.consultasperu.com/api/v1/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: dniController.signal,
          body: JSON.stringify({
            token: "dcda84257b21983f0416885996aafc25e1e48793389fc8f26800b28421cee626",
            type_document: "dni",
            document_number: dni,
          }),
        });
      } finally {
        clearTimeout(dniTimeout);
      }

      const result = await response.json();

      // Buscar en clientes internos primero
      let clienteInterno = null;
      if (isSupabaseConfigured) {
        const { data: cli } = await supabase
          .from("clientes")
          .select("nombre,direccion,celular,email,contacto,nodo,usuario_nodo,velocidad,precio_plan,ubicacion,tecnico,foto_fachada,fotos_liquidacion,caja_nap,puerto_nap,sn_onu")
          .eq("dni", dni)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        clienteInterno = cli;
      }

      if (clienteInterno) {
        // Verificar si hay múltiples servicios para este DNI
        const { data: todosServicios } = await supabase
          .from("clientes")
          .select("codigo_cliente, nodo, velocidad, usuario_nodo")
          .eq("dni", dni)
          .order("id", { ascending: false });
        if (todosServicios && todosServicios.length > 1) {
          const resumen = todosServicios.map((s) => `• ${s.codigo_cliente || "Sin código"} — ${s.nodo || "Sin nodo"} ${s.velocidad ? `(${s.velocidad})` : ""}`).join("\n");
          alert(`⚠️ Este DNI ya tiene ${todosServicios.length} servicio(s) activos:\n${resumen}\n\nSi es un nuevo servicio, se creará un código de abonado nuevo al liquidar.`);
        }
        setOrden((prev) => ({
          ...prev,
          nombre: clienteInterno.nombre || prev.nombre,
          direccion: clienteInterno.direccion || prev.direccion,
          celular: clienteInterno.celular || prev.celular,
          email: clienteInterno.email || prev.email,
          contacto: clienteInterno.contacto || prev.contacto,
          nodo: clienteInterno.nodo || prev.nodo,
          usuarioNodo: clienteInterno.usuario_nodo || prev.usuarioNodo,
          velocidad: clienteInterno.velocidad || prev.velocidad,
          precioPlan: clienteInterno.precio_plan || prev.precioPlan,
          ubicacion: clienteInterno.ubicacion || prev.ubicacion,
          tecnico: clienteInterno.tecnico || prev.tecnico,
          fotoFachada: clienteInterno.foto_fachada || prev.fotoFachada,
          cajaNap: clienteInterno.caja_nap || prev.cajaNap,
          puertoNap: clienteInterno.puerto_nap || prev.puertoNap,
          snOnu: clienteInterno.sn_onu || prev.snOnu,
        }));
        if (clienteInterno.caja_nap) cajaNapDesdClienteRef.current = true;
        // Cargar todas las fotos del cliente
        const fotos = await obtenerFotosLiquidacionClienteSupabase({ dni, fotosLiquidacion: clienteInterno.fotos_liquidacion || [] });
        const todasFotos = [...new Set([clienteInterno.foto_fachada, ...fotos].filter(Boolean))];
        setFotosClienteDni(todasFotos);
      } else if (result.success && result.data) {
        setOrden((prev) => ({
          ...prev,
          nombre: result.data.full_name || "",
          direccion: result.data.address || "",
        }));
      } else {
        alert("No se encontraron datos para ese DNI");
      }
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error al consultar el DNI");
    } finally {
      setBuscandoDni(false);
    }
  };

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        handleChange("ubicacion", `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      },
      () => {
        alert("No se pudo obtener la ubicación");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const sendWhatsAppNotification = useCallback(
    async (ordenData = {}, tipo = "nueva_orden") => {
      try {
        const numero = String(ordenData.celular || ordenData.telefono || "").trim();
        if (!numero) return;
        const empresa = String(ordenData.empresa || "Americanet").trim();
        // Leer config desde Supabase (fuente de verdad), fallback a localStorage
        let waCfg = {};
        try {
          const { data: waCfgRow } = await supabase
            .from("whatsapp_config")
            .select("*")
            .eq("empresa", empresa)
            .maybeSingle();
          if (waCfgRow) {
            waCfg = waCfgRow;
          } else {
            const raw = localStorage.getItem("whatsapp_config_local");
            if (raw) waCfg = JSON.parse(raw)?.[empresa] || {};
          }
        } catch {
          const raw = localStorage.getItem("whatsapp_config_local");
          try { if (raw) waCfg = JSON.parse(raw)?.[empresa] || {}; } catch { return; }
        }
        if (!waCfg.habilitado) return;
        if (!waCfg.base_url || !waCfg.api_key || !waCfg.instance_name) return;

        const tipoOrdenRaw = String(
          ordenData.tipoActuacion ||
          ordenData.tipo_actuacion ||
          ordenData.actuacion ||
          ordenData.orden_tipo ||
          ordenData.orden ||
          ordenData.tipoOrden ||
          ordenData.tipo_orden ||
          ""
        ).toUpperCase();
        const tipoOrden = tipoOrdenRaw || "INSTALACIÓN";
        let tpl = waCfg.template_instalacion || "";
        if (tipo === "liquidacion") tpl = waCfg.template_liquidacion || "";
        else if (tipoOrden.includes("INCIDEN")) tpl = waCfg.template_incidencia || "";
        else if (tipoOrden.includes("RECUP") || tipoOrden.includes("RECOJ")) tpl = waCfg.template_recuperacion || "";
        if (!tpl.trim()) return;

        const message = tpl
          .replace(/{nombre}/g, ordenData.nombre || "")
          .replace(/{codigo}/g, ordenData.codigo || "")
          .replace(/{empresa}/g, empresa)
          .replace(/{tecnico}/g, ordenData.tecnico || "")
          .replace(/{fecha}/g, ordenData.fechaActuacion || ordenData.fecha_actuacion || "")
          .replace(/{direccion}/g, ordenData.direccion || "");

        let phone = numero.replace(/[\s\-\(\)]/g, "");
        if (phone.startsWith("+")) phone = phone.slice(1);
        if (/^9\d{8}$/.test(phone)) phone = "51" + phone;

        const url = `${waCfg.base_url.replace(/\/$/, "")}/message/sendText/${waCfg.instance_name}`;
        const waController = new AbortController();
        const waTimeout = setTimeout(() => waController.abort(), 8000);
        try {
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: waCfg.api_key },
            body: JSON.stringify({ number: phone, text: message }),
            signal: waController.signal,
          });
        } finally {
          clearTimeout(waTimeout);
        }
      } catch { /* silencioso — no interrumpir el flujo de la orden */ }
    },
    []
  );

  const guardarOrden = async () => {
    if (
      !orden.empresa.trim() ||
      !orden.codigo.trim() ||
      !orden.fechaActuacion.trim() ||
      !orden.dni.trim() ||
      !orden.nombre.trim() ||
      !orden.direccion.trim()
    ) {
      alert("Completa los campos obligatorios: empresa, codigo, fecha, DNI, nombre y direccion.");
      return;
    }
    if (!orden.tecnico.trim()) {
      alert("Debes asignar un tecnico a la orden.");
      return;
    }
    if (mostrarCamposUsuario && usuarioNodoEstaBloqueado) {
      alert("El usuario de nodo está deshabilitado por administración. Habilítalo o usa otro.");
      return;
    }

    const current = ordenEditandoId ? ordenes.find((item) => item.id === ordenEditandoId) || {} : {};
    const estadoFinal = String(current.estado || orden.estado || "Pendiente");
    const fechaCreacionFinal = current.fecha_creacion || current.fechaCreacion || new Date().toISOString();
    const ordenLocal = {
      ...current,
      ...orden,
      id: ordenEditandoId || Date.now(),
      estado: estadoFinal,
      fechaCreacion: formatFechaFlexible(fechaCreacionFinal),
      fecha_creacion: fechaCreacionFinal,
      fechaActualizacion: new Date().toLocaleString(),
    };

    if (isSupabaseConfigured) {
      try {
        const payload = sanitizeOrderPayloadForSupabase(
          serializeOrderToSupabase(ordenLocal, { autorOrden: usuarioSesion?.nombre || "" })
        );
        let saved = null;
        if (ordenEditandoId && Number.isFinite(Number(ordenEditandoId))) {
          const upd = await supabase
            .from(ORDENES_TABLE)
            .update(payload)
            .eq("id", Number(ordenEditandoId))
            .select("*")
            .single();
          if (upd.error) throw upd.error;
          saved = upd.data;
        } else {
          const up = await supabase
            .from(ORDENES_TABLE)
            .upsert([payload], { onConflict: "codigo,empresa" })
            .select("*")
            .single();
          if (up.error) throw up.error;
          saved = up.data;
        }
        const merged = deserializeOrderFromSupabase(saved || payload);
        if (ordenEditandoId) {
          setOrdenes((prev) => prev.map((item) => (item.id === ordenEditandoId ? { ...item, ...merged } : item)));
          escribirLog({ accion: "editar_orden", categoria: "orden", tabla: "ordenes", registro_id: merged.id, detalle: { codigo: merged.codigo, empresa: merged.empresa, cliente: merged.nombre }, actor: usuarioSesion });
        } else {
          setOrdenes((prev) => [merged, ...prev.filter((x) => String(x.codigo) !== String(merged.codigo))]);
          escribirLog({ accion: "crear_orden", categoria: "orden", tabla: "ordenes", registro_id: merged.id, detalle: { codigo: merged.codigo, empresa: merged.empresa, cliente: merged.nombre, tecnico: merged.tecnico }, actor: usuarioSesion });
        }
      } catch (e) {
        const msg = String(e?.message || "No se pudo guardar orden en Supabase.");
        alert(msg);
        return;
      }
    } else if (ordenEditandoId) {
      setOrdenes((prev) =>
        prev.map((item) =>
          item.id === ordenEditandoId
            ? {
                ...item,
                ...ordenLocal,
              }
            : item
        )
      );
    } else {
      setOrdenes((prev) => [ordenLocal, ...prev]);
    }

    // Notificación push al técnico asignado (solo en órdenes nuevas con técnico)
    if (!ordenEditandoId && isSupabaseConfigured && ordenLocal.tecnico) {
      void supabase.functions.invoke("send-push-notification", {
        body: {
          tecnico_nombre: ordenLocal.tecnico,
          title: "Nueva orden asignada",
          body: `${ordenLocal.codigo} — ${ordenLocal.nombre || "Cliente"}`,
          data: {
            tipo: "nueva_orden",
            orden_codigo: String(ordenLocal.codigo || ""),
            orden_id: String(ordenLocal.id || ""),
          },
        },
      });
    }

    // WhatsApp al cliente (solo órdenes nuevas y si está activado)
    if (!ordenEditandoId && enviarWhatsappOrden) {
      void sendWhatsAppNotification(ordenLocal, "nueva_orden");
    }

    setOrdenEditandoId(null);
    setOrden(buildInitialOrder());
    setFotosClienteDni([]);
    setEnviarWhatsappOrden(true);
    setVistaActiva("pendientes");
  };

  const editarOrden = (ordenItem = {}) => {
    if (!ordenItem?.id) return;
    const {
      id,
      estado,
      fechaCreacion,
      fechaActualizacion,
      fechaLiquidacion,
      liquidacion,
      ...baseOrden
    } = ordenItem;
    setOrden({
      ...buildInitialOrder(),
      ...baseOrden,
    });
    setOrdenEditandoId(id);
    setVistaActiva("crear");
    setTimeout(() => {
      contentWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  };

  const eliminarOrden = async (id) => {
    const target = (Array.isArray(ordenes) ? ordenes : []).find((x) => String(x?.id) === String(id));
    const codigo = target?.codigo || String(id);
    const confirmar = window.confirm(`¿Eliminar permanentemente la orden ${codigo}?\n\nEsta acción no se puede deshacer.`);
    if (!confirmar) return;
    if (isSupabaseConfigured && Number.isFinite(Number(id))) {
      const del = await supabase.from(ORDENES_TABLE).delete().eq("id", Number(id));
      if (del.error) {
        alert(del.error.message || "No se pudo eliminar la orden en Supabase.");
        return;
      }
      escribirLog({ accion: "eliminar_orden", categoria: "orden", criticidad: "critica", tabla: "ordenes", registro_id: id, detalle: { codigo, empresa: target?.empresa, cliente: target?.nombre, tecnico: target?.tecnico, estado: target?.estado }, actor: usuarioSesion });
    }
    setOrdenes((prev) => prev.filter((item) => item.id !== id));
  };

  const cancelarOrden = async (id) => {
    const target = (Array.isArray(ordenes) ? ordenes : []).find((x) => String(x?.id) === String(id));
    if (!target) return;
    const motivo = String(window.prompt("Motivo de cancelación (obligatorio):", target?.motivoCancelacion || "") || "").trim();
    if (!motivo) {
      alert("Debes indicar el motivo de cancelación.");
      return;
    }
    const payloadCancel = {
      estado: "Cancelada",
      motivo_cancelacion: motivo,
      cancelado_por: String(usuarioSesion?.nombre || "").trim() || null,
      fecha_cancelacion: new Date().toISOString(),
      usuario_nodo_liberado: true,
    };
    if (isSupabaseConfigured && Number.isFinite(Number(id))) {
      try {
        const upd = await supabase.from(ORDENES_TABLE).update(payloadCancel).eq("id", Number(id)).select("*").single();
        if (upd.error) throw upd.error;
        const merged = deserializeOrderFromSupabase(upd.data || {});
        setOrdenes((prev) => prev.map((item) => (String(item?.id) === String(id) ? { ...item, ...merged } : item)));
        // Si la orden estaba Liquidada y tenía caja NAP asignada, decrementar puertos_ocupados
        if (String(target?.estado || "") === "Liquidada") {
          const cajaCodigo = String(target?.cajaNap || target?.caja_nap || "").trim();
          if (cajaCodigo) {
            const cajaData = napCajasMapData.find(c => c.codigo === cajaCodigo);
            if (cajaData && (cajaData.puertos_ocupados || 0) > 0) {
              const nuevosOcupados = (cajaData.puertos_ocupados || 0) - 1;
              const { error: napErr } = await supabase.from("nap_cajas").update({ puertos_ocupados: nuevosOcupados }).eq("id", cajaData.id);
              if (!napErr) {
                setNapCajasMapData(prev => prev.map(c => c.id === cajaData.id ? { ...c, puertos_ocupados: nuevosOcupados } : c));
              }
            }
          }
        }
        return;
      } catch (e) {
        alert(String(e?.message || "No se pudo cancelar la orden."));
        return;
      }
    }
    setOrdenes((prev) =>
      prev.map((item) =>
        String(item?.id) === String(id)
          ? {
              ...item,
              estado: "Cancelada",
              motivoCancelacion: motivo,
              canceladoPor: String(usuarioSesion?.nombre || "").trim(),
              fechaCancelacion: new Date().toISOString(),
              usuarioNodoLiberado: true,
            }
          : item
      )
    );
  };

  const abrirLiquidacion = (ordenItem) => {
    setOrdenEnLiquidacion(ordenItem);
    setLiquidacionEditandoId(null);
    setLiquidacion({
      ...initialLiquidacion,
      tecnicoLiquida: ordenItem.tecnico || "",
      cobroRealizado: ordenItem.solicitarPago === "SI" ? "SI" : "NO",
      montoCobrado: ordenItem.solicitarPago === "SI" ? ordenItem.montoCobrar || "" : "",
      cajaNap: ordenItem.cajaNap || "",
    });
    setLiquidacionRecojo({
      ...initialLiquidacionRecojo,
      tecnicoEjecuta: usuarioSesion?.nombre || "",
    });
    setMostrarScannerLiquidacion(false);
    setVistaActiva("liquidar");
  };

  const abrirEditarLiquidacion = (liquidacionItem) => {
    setLiquidacionEditandoId(liquidacionItem.id);
    setOrdenEnLiquidacion({
      ...liquidacionItem,
      id: liquidacionItem.ordenOriginalId || liquidacionItem.id,
    });
    setLiquidacion({
      tecnicoLiquida: liquidacionItem.liquidacion?.tecnicoLiquida || "",
      resultadoFinal: liquidacionItem.liquidacion?.resultadoFinal || "Completada",
      observacionFinal: liquidacionItem.liquidacion?.observacionFinal || "",
      cobroRealizado: liquidacionItem.liquidacion?.cobroRealizado || "NO",
      montoCobrado: liquidacionItem.liquidacion?.montoCobrado || "",
      medioPago: liquidacionItem.liquidacion?.medioPago || "",
      codigoEtiqueta: liquidacionItem.liquidacion?.codigoEtiqueta || "",
      snOnu: liquidacionItem.sn_onu || liquidacionItem.snOnu || liquidacionItem.liquidacion?.snOnu || "",
      parametro: liquidacionItem.parametro || liquidacionItem.liquidacion?.parametro || "",
      actualizarUbicacion: "NO",
      nuevaUbicacion: "",
      cajaNap: liquidacionItem.cajaNap || liquidacionItem.caja_nap || "",
      equipos: liquidacionItem.liquidacion?.equipos || [],
      equiposRecuperados: liquidacionItem.liquidacion?.equiposRecuperados || [],
      materiales: liquidacionItem.liquidacion?.materiales || [],
      fotos: liquidacionItem.liquidacion?.fotos || [],
      codigoQRManual: "",
    });
    setMostrarScannerLiquidacion(false);
    setVistaActiva("liquidar");
  };

  const enriquecerLiquidacionDesdeSupabase = async (liquidacionItem) => {
    if (!isSupabaseConfigured || !liquidacionItem) return liquidacionItem;
    try {
      let liquidacionId = Number(liquidacionItem?.id);
      if (!Number.isFinite(liquidacionId)) {
        const codigo = String(liquidacionItem?.codigo || "").trim();
        if (!codigo) return liquidacionItem;
        const lookup = await supabase.from("liquidaciones").select("id").eq("codigo", codigo).limit(1).maybeSingle();
        if (lookup.error || !lookup.data?.id) return liquidacionItem;
        liquidacionId = Number(lookup.data.id);
      }
      if (!Number.isFinite(liquidacionId)) return liquidacionItem;

      const [fotosRes, equiposRes, materialesRes] = await Promise.all([
        supabase.from("liquidacion_fotos").select("foto_url").eq("liquidacion_id", liquidacionId).order("id", { ascending: true }),
        supabase.from("liquidacion_equipos").select("*").eq("liquidacion_id", liquidacionId).order("id", { ascending: true }),
        supabase.from("liquidacion_materiales").select("*").eq("liquidacion_id", liquidacionId).order("id", { ascending: true }),
      ]);
      if (fotosRes.error) throw new Error("Error cargando fotos: " + fotosRes.error.message);
      if (equiposRes.error) throw new Error("Error cargando equipos: " + equiposRes.error.message);
      if (materialesRes.error) throw new Error("Error cargando materiales: " + materialesRes.error.message);

      let ordenRow = null;
      const ordenOriginalId = Number(liquidacionItem?.ordenOriginalId);
      const codigoOrden = String(liquidacionItem?.codigo || "").trim();
      if (Number.isFinite(ordenOriginalId)) {
        const byId = await supabase
          .from(ORDENES_TABLE)
          .select("id,velocidad,precio_plan,nodo,usuario_nodo,password_usuario,ubicacion,tipo_actuacion")
          .eq("id", ordenOriginalId)
          .limit(1)
          .maybeSingle();
        if (!byId.error && byId.data) ordenRow = byId.data;
      }
      if (!ordenRow && codigoOrden) {
        const byCodigo = await supabase
          .from(ORDENES_TABLE)
          .select("id,velocidad,precio_plan,nodo,usuario_nodo,password_usuario,ubicacion,tipo_actuacion")
          .eq("codigo", codigoOrden)
          .limit(1)
          .maybeSingle();
        if (!byCodigo.error && byCodigo.data) ordenRow = byCodigo.data;
      }

      const fotos = (fotosRes?.error ? [] : fotosRes?.data || [])
        .map((row) => String(row?.foto_url || "").trim())
        .filter(Boolean);

      const equipos = (equiposRes?.error ? [] : equiposRes?.data || []).map((eq) => ({
        idInventario: eq?.id_inventario ?? null,
        tipo: String(eq?.tipo || ""),
        codigo: String(eq?.codigo || ""),
        serial: String(eq?.serial || ""),
        accion: String(eq?.accion || "Instalado"),
        marca: String(eq?.marca || ""),
        modelo: String(eq?.modelo || ""),
        fotoReferencia: String(eq?.foto_referencia || ""),
        empresa: String(eq?.empresa || ""),
        precioUnitario: Number.isFinite(Number(eq?.precio_unitario)) ? Number(eq.precio_unitario) : 0,
      }));

      const materiales = (materialesRes?.error ? [] : materialesRes?.data || []).map((m) => ({
        material: String(m?.material || ""),
        cantidad: Number.isFinite(Number(m?.cantidad)) ? Number(m.cantidad) : 0,
        unidad: String(m?.unidad || "unidad"),
      }));

      const actual = liquidacionItem?.liquidacion || {};
      return {
        ...liquidacionItem,
        tipoActuacion: String(liquidacionItem?.tipoActuacion || ordenRow?.tipo_actuacion || "").trim(),
        velocidad: String(liquidacionItem?.velocidad || ordenRow?.velocidad || "").trim(),
        precioPlan:
          liquidacionItem?.precioPlan != null && String(liquidacionItem?.precioPlan).trim() !== ""
            ? liquidacionItem?.precioPlan
            : ordenRow?.precio_plan ?? "",
        nodo: String(liquidacionItem?.nodo || ordenRow?.nodo || "").trim(),
        usuarioNodo: String(liquidacionItem?.usuarioNodo || ordenRow?.usuario_nodo || "").trim(),
        passwordUsuario: String(liquidacionItem?.passwordUsuario || ordenRow?.password_usuario || "").trim(),
        ubicacion: String(liquidacionItem?.ubicacion || ordenRow?.ubicacion || "").trim(),
        liquidacion: {
          ...actual,
          equipos: equipos.length ? equipos : Array.isArray(actual?.equipos) ? actual.equipos : [],
          materiales: materiales.length ? materiales : Array.isArray(actual?.materiales) ? actual.materiales : [],
          fotos: fotos.length ? fotos : Array.isArray(actual?.fotos) ? actual.fotos : [],
        },
      };
    } catch {
      return liquidacionItem;
    }
  };

  const abrirDetalleLiquidacionHistorial = async (liquidacionItem) => {
    const enriched = await enriquecerLiquidacionDesdeSupabase(liquidacionItem);
    setLiquidacionSeleccionada(enriched);
    setDetalleLiquidacionTab("orden");
    setVistaActiva("detalleLiquidacion");
  };

  const abrirEditarLiquidacionHistorial = async (liquidacionItem) => {
    const enriched = await enriquecerLiquidacionDesdeSupabase(liquidacionItem);
    abrirEditarLiquidacion(enriched);
  };

  const eliminarLiquidacion = async (liquidacionItem) => {
    if (!liquidacionItem) return;
    const ok = window.confirm("¿Eliminar esta liquidación del historial?");
    if (!ok) return;

    const liqId = Number(liquidacionItem.id);
    const codigo = String(liquidacionItem.codigo || "").trim();
    if (isSupabaseConfigured) {
      try {
        if (Number.isFinite(liqId)) {
          const del = await supabase.from("liquidaciones").delete().eq("id", liqId);
          if (del.error) throw del.error;
        } else if (codigo) {
          const del = await supabase.from("liquidaciones").delete().eq("codigo", codigo);
          if (del.error) throw del.error;
        }
      } catch (e) {
        alert(String(e?.message || "No se pudo eliminar la liquidación en Supabase."));
        return;
      }
    }

    setLiquidaciones((prev) => prev.filter((x) => String(x?.id) !== String(liquidacionItem.id)));
  };

  const esActuacionInstalacion = (tipoActuacion = "") => {
    const texto = String(tipoActuacion).toLowerCase();
    return texto.includes("instalacion");
  };

  const aplicarEstadoEquiposDesdeLiquidacion = (registroLiquidado) => {
    const equiposUsados = registroLiquidado?.liquidacion?.equipos || [];
    if (!Array.isArray(equiposUsados) || equiposUsados.length === 0) return;

    setEquiposCatalogo((prev) =>
      prev.map((eq) => {
        const usado = equiposUsados.find(
          (item) => item.idInventario && String(item.idInventario) === String(eq.id)
        );

        if (!usado) return eq;

        const accion = String(usado.accion || "Instalado").toLowerCase();

        if (accion === "retirado" || accion === "devuelto") {
          return {
            ...eq,
            estado: "almacen",
            tecnicoAsignado: "",
            clienteDni: "",
            clienteNombre: "",
            ordenCodigo: "",
            fechaUltimaInstalacion: "",
          };
        }

        return {
          ...eq,
          estado: "instalado",
          tecnicoAsignado: "",
          clienteDni: registroLiquidado.dni || "",
          clienteNombre: registroLiquidado.nombre || "",
          ordenCodigo: registroLiquidado.codigo || "",
          fechaUltimaInstalacion:
            registroLiquidado.fechaLiquidacion || new Date().toLocaleString(),
        };
      })
    );
  };

  const registrarFotosClienteRelacionSupabase = async (dni = "", fotos = []) => {
    const dniClean = String(dni || "").trim();
    const fotosClean = Array.from(new Set((Array.isArray(fotos) ? fotos : []).map((x) => String(x || "").trim()).filter(Boolean)));
    if (!isSupabaseConfigured || !dniClean || !fotosClean.length) return;
    try {
      const cliRes = await supabase
        .from(CLIENTES_TABLE)
        .select("id")
        .eq("dni", dniClean)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cliRes.error || !cliRes.data?.id) return;
      const clienteId = Number(cliRes.data.id);
      if (!Number.isFinite(clienteId)) return;

      const relSel = await supabase
        .from("cliente_fotos_liquidacion")
        .select("foto_url")
        .eq("cliente_id", clienteId)
        .limit(200);
      if (relSel.error) return;
      const existentes = new Set((relSel.data || []).map((r) => String(r?.foto_url || "").trim()).filter(Boolean));
      const inserts = fotosClean
        .filter((url) => !existentes.has(url))
        .map((url) => ({ cliente_id: clienteId, foto_url: url }));
      if (!inserts.length) return;
      const relIns = await supabase.from("cliente_fotos_liquidacion").insert(inserts);
      if (relIns.error) return;
    } catch {
      // noop
    }
  };

  const guardarClienteDesdeLiquidacion = async (registroLiquidado) => {
    if (!registroLiquidado) return;

    const dni = String(registroLiquidado.dni || "").trim();
    if (!dni) return;

    const esInstalacion = esActuacionInstalacion(registroLiquidado.tipoActuacion);

    // Si NO es instalación: actualizar cliente existente por DNI, o crear uno básico si no existe
    if (!esInstalacion) {
      let clienteResultado = null;
      setClientes((prev) => {
        const existente = prev.find(
          (c) => String(c.dni || "").trim() === dni || String(c.codigoCliente || "").trim() === dni
        );
        if (existente) {
          const actualizado = {
            ...existente,
            nombre: registroLiquidado.nombre || existente.nombre || "",
            direccion: registroLiquidado.direccion || existente.direccion || "",
            celular: registroLiquidado.celular || existente.celular || "",
            nodo: registroLiquidado.nodo || existente.nodo || "",
            ultimaActualizacion: new Date().toLocaleString(),
          };
          clienteResultado = actualizado;
          return prev.map((c) =>
            String(c.dni || "").trim() === dni || String(c.codigoCliente || "").trim() === dni
              ? actualizado : c
          );
        }
        // Cliente no existe → crear registro básico sin codigoAbonado ni historial instalación
        const nuevo = {
          id: Date.now(),
          codigoAbonado: "",
          codigoCliente: dni,
          dni,
          nombre: registroLiquidado.nombre || "",
          direccion: registroLiquidado.direccion || "",
          celular: registroLiquidado.celular || "",
          email: registroLiquidado.email || "",
          contacto: registroLiquidado.contacto || "",
          empresa: registroLiquidado.empresa || "",
          velocidad: registroLiquidado.velocidad || "",
          precioPlan: registroLiquidado.precioPlan || "",
          nodo: registroLiquidado.nodo || "",
          usuarioNodo: "",
          passwordUsuario: "",
          ubicacion: registroLiquidado.ubicacion || "",
          descripcion: registroLiquidado.descripcion || "",
          fotoFachada: registroLiquidado.fotoFachada || "",
          fotosLiquidacion: [],
          tecnico: registroLiquidado.tecnico || "",
          autorOrden: registroLiquidado.autorOrden || "",
          fechaRegistro: new Date().toLocaleString(),
          ultimaActualizacion: new Date().toLocaleString(),
          historialInstalaciones: [],
          equiposHistorial: [],
          origenRegistro: "incidencia",
        };
        clienteResultado = nuevo;
        return [nuevo, ...prev];
      });
      if (isSupabaseConfigured && clienteResultado) {
        void guardarClientesEnSupabase([clienteResultado]);
      }
      return clienteResultado;
    }

    const nodo = String(registroLiquidado.nodo || "").trim();

    // Generar código abonado N0X-XXXX desde función SQL
    let codigoAbonado = "";
    if (isSupabaseConfigured && nodo) {
      const { data: codData } = await supabase.rpc("generar_codigo_abonado", { p_nodo: nodo });
      codigoAbonado = codData || "";
    }

    const historialItem = {
      id: registroLiquidado.id,
      ordenOriginalId: registroLiquidado.ordenOriginalId || registroLiquidado.id,
      codigoOrden: registroLiquidado.codigo || "",
      fechaLiquidacion: registroLiquidado.fechaLiquidacion || new Date().toLocaleString(),
      tipoActuacion: registroLiquidado.tipoActuacion || "",
      resultadoFinal: registroLiquidado.liquidacion?.resultadoFinal || "",
      tecnico: registroLiquidado.liquidacion?.tecnicoLiquida || registroLiquidado.tecnico || "",
      observacionFinal: registroLiquidado.liquidacion?.observacionFinal || "",
      codigoEtiqueta: registroLiquidado.liquidacion?.codigoEtiqueta || "",
    };

    const equiposHistorialActuales = (registroLiquidado.liquidacion?.equipos || []).map((eq) => ({
      id: `${registroLiquidado.id}-${eq.idInventario || eq.codigo || Math.random()}`,
      ordenId: registroLiquidado.id,
      codigoOrden: registroLiquidado.codigo || "",
      fecha: registroLiquidado.fechaLiquidacion || new Date().toLocaleString(),
      tipo: eq.tipo || "",
      codigo: eq.codigo || "",
      serial: eq.serial || "",
      accion: eq.accion || "",
      marca: eq.marca || "",
      modelo: eq.modelo || "",
      empresa: eq.empresa || registroLiquidado.empresa || "",
    }));

    const nuevoCliente = {
      id: Date.now(),
      codigoAbonado: codigoAbonado,
      codigoCliente: dni,
      dni,
      nombre: registroLiquidado.nombre || "",
      direccion: registroLiquidado.direccion || "",
      celular: registroLiquidado.celular || "",
      email: registroLiquidado.email || "",
      contacto: registroLiquidado.contacto || "",
      empresa: registroLiquidado.empresa || "",
      velocidad: registroLiquidado.velocidad || "",
      precioPlan: registroLiquidado.precioPlan || "",
      nodo: registroLiquidado.nodo || "",
      usuarioNodo: registroLiquidado.usuarioNodo || "",
      passwordUsuario: registroLiquidado.passwordUsuario || "",
      ubicacion: registroLiquidado.ubicacion || "",
      descripcion: registroLiquidado.descripcion || "",
      fotoFachada: registroLiquidado.fotoFachada || "",
      fotosLiquidacion: registroLiquidado.liquidacion?.fotos || [],
      codigoEtiqueta: registroLiquidado.liquidacion?.codigoEtiqueta || "",
      tecnico: registroLiquidado.tecnico || "",
      autorOrden: registroLiquidado.autorOrden || "",
      cajaNap: registroLiquidado.liquidacion?.cajaNap || registroLiquidado.cajaNap || "",
      fechaRegistro: new Date().toLocaleString(),
      ultimaActualizacion: new Date().toLocaleString(),
      historialInstalaciones: [historialItem],
      equiposHistorial: equiposHistorialActuales,
    };

    // Cada instalación = nuevo servicio independiente (no fusionar por DNI)
    // Solo actualizar si ya existe un registro con el mismo codigo de orden (re-liquidación)
    let clienteResultado = null;
    setClientes((prev) => {
      const existenteMismaOrden = prev.find((c) =>
        Array.isArray(c.historialInstalaciones) &&
        c.historialInstalaciones.some((h) => h.id === historialItem.id)
      );

      if (existenteMismaOrden) {
        // Re-liquidación de la misma orden → actualizar registro existente
        const actualizado = {
          ...existenteMismaOrden,
          nombre: registroLiquidado.nombre || existenteMismaOrden.nombre || "",
          direccion: registroLiquidado.direccion || existenteMismaOrden.direccion || "",
          celular: registroLiquidado.celular || existenteMismaOrden.celular || "",
          velocidad: registroLiquidado.velocidad || existenteMismaOrden.velocidad || "",
          precioPlan: registroLiquidado.precioPlan || existenteMismaOrden.precioPlan || "",
          nodo: registroLiquidado.nodo || existenteMismaOrden.nodo || "",
          usuarioNodo: registroLiquidado.usuarioNodo || existenteMismaOrden.usuarioNodo || "",
          passwordUsuario: registroLiquidado.passwordUsuario || existenteMismaOrden.passwordUsuario || "",
          fotoFachada: registroLiquidado.fotoFachada || existenteMismaOrden.fotoFachada || "",
          codigoEtiqueta: registroLiquidado.liquidacion?.codigoEtiqueta || existenteMismaOrden.codigoEtiqueta || "",
          cajaNap: registroLiquidado.liquidacion?.cajaNap || registroLiquidado.cajaNap || existenteMismaOrden.cajaNap || "",
          ultimaActualizacion: new Date().toLocaleString(),
        };
        clienteResultado = actualizado;
        return prev.map((c) => c.id === existenteMismaOrden.id ? actualizado : c);
      }

      // Nueva instalación → nuevo registro con código N0X-XXXX
      clienteResultado = nuevoCliente;
      return [nuevoCliente, ...prev];
    });

    const fotosCliente = Array.from(
      new Set(
        [
          String(registroLiquidado.fotoFachada || "").trim(),
          ...((Array.isArray(registroLiquidado.liquidacion?.fotos) ? registroLiquidado.liquidacion.fotos : []).map((f) => String(f || "").trim())),
        ].filter(Boolean)
      )
    );
    if (isSupabaseConfigured && clienteResultado) {
      void guardarClientesEnSupabase([clienteResultado]).then(() => registrarFotosClienteRelacionSupabase(dni, fotosCliente));
    }
    return clienteResultado;
  };

  // Helpers para guardar liquidación con fallback de columnas (igual que mobile)
  const _getMissingCol = (error) => {
    const msg = String(error?.message || "");
    const m = msg.match(/column "([^"]+)"/);
    return m?.[1] || null;
  };
  const _upsertLiquidacion = async (payload, codigoOrden) => {
    let existenteId = null;
    for (const key of ["codigo", "codigo_orden"]) {
      const { data, error } = await supabase.from("liquidaciones").select("id").eq(key, codigoOrden).order("id", { ascending: false }).limit(1).maybeSingle();
      if (!error) { if (data?.id) { existenteId = data.id; break; } continue; }
      if (!String(error.message || "").toLowerCase().includes(key)) throw error;
    }
    let dp = { ...payload };
    for (let i = 0; i < 8; i++) {
      if (existenteId) {
        const { error } = await supabase.from("liquidaciones").update(dp).eq("id", existenteId);
        if (!error) return existenteId;
        const col = _getMissingCol(error); if (!col || !(col in dp)) throw error; delete dp[col];
      } else {
        const { data, error } = await supabase.from("liquidaciones").insert([dp]).select("id").single();
        if (!error) return data.id;
        const col = _getMissingCol(error); if (!col || !(col in dp)) throw error; delete dp[col];
      }
    }
    throw new Error("No se pudo guardar la liquidación (columnas).");
  };
  const _insertRows = async (table, rowsOrig) => {
    let rows = (rowsOrig || []).map(r => ({ ...r }));
    for (let i = 0; i < 10; i++) {
      if (!rows.length) return;
      const { error } = await supabase.from(table).insert(rows);
      if (!error) return;
      const col = _getMissingCol(error); if (!col) throw error;
      let existia = false;
      rows = rows.map(r => { if (col in r) existia = true; const n = { ...r }; delete n[col]; return n; });
      if (!existia) throw error;
    }
  };

  const guardarLiquidacion = async () => {
    if (!ordenEnLiquidacion) return;

    // Validaciones
    const equiposSinFoto = (liquidacion?.equipos || []).filter(eq => !String(eq?.fotoReferencia || "").trim());
    if (equiposSinFoto.length > 0) { alert("Cada equipo debe tener foto serial/equipo antes de guardar."); return; }
    const eqsRecuperados = liquidacion?.equiposRecuperados || [];
    const eqsRecSinFoto = eqsRecuperados.filter(eq => !eq.fotos || eq.fotos.length === 0);
    if (eqsRecSinFoto.length > 0) { alert("Cada equipo recuperado del cliente debe tener al menos una foto."); return; }
    if ((liquidacion.fotos || []).length < 3) {
      alert(`Se requieren mínimo 3 fotos de evidencia.\nActualmente tienes ${(liquidacion.fotos || []).length}.`);
      return;
    }

    setLiquidacionGuardando(true);
    const avisos = [];
    try {
      const codigoOrden = String(ordenEnLiquidacion.codigo || "").trim();
      const payload = {
        orden_original_id: ordenEnLiquidacion.id,
        codigo: codigoOrden,
        codigo_orden: codigoOrden,
        dni: String(ordenEnLiquidacion.dni || ""),
        nombre: String(ordenEnLiquidacion.nombre || ""),
        direccion: String(ordenEnLiquidacion.direccion || ""),
        celular: String(ordenEnLiquidacion.celular || ""),
        tipo_actuacion: String(ordenEnLiquidacion.tipoActuacion || ""),
        nodo: String(ordenEnLiquidacion.nodo || ""),
        usuario_nodo: String(ordenEnLiquidacion.usuarioNodo || ""),
        password_usuario: String(ordenEnLiquidacion.passwordUsuario || ""),
        velocidad: String(ordenEnLiquidacion.velocidad || ""),
        precio_plan: ordenEnLiquidacion.precioPlan !== "" && ordenEnLiquidacion.precioPlan != null ? Number(ordenEnLiquidacion.precioPlan) || null : null,
        ubicacion: String(ordenEnLiquidacion.ubicacion || ""),
        autor_orden: String(ordenEnLiquidacion.autorOrden || ""),
        tecnico: String(ordenEnLiquidacion.tecnico || ""),
        tecnico_liquida: String(liquidacion.tecnicoLiquida || ""),
        resultado_final: String(liquidacion.resultadoFinal || "Completada"),
        observacion_final: String(liquidacion.observacionFinal || ""),
        cobro_realizado: String(liquidacion.cobroRealizado || "NO"),
        monto_cobrado: Number.isFinite(Number(liquidacion.montoCobrado)) ? Number(liquidacion.montoCobrado) : 0,
        medio_pago: String(liquidacion.medioPago || ""),
        codigo_etiqueta: String(liquidacion.codigoEtiqueta || ""),
        sn_onu: String(liquidacion.snOnu || ""),
        sn_onu_liquidacion: String(liquidacion.snOnu || ""),
        parametro: String(liquidacion.parametro || ""),
        estado: "Liquidada",
        fecha_liquidacion: new Date().toISOString(),
      };

      const liquidacionId = await _upsertLiquidacion(payload, codigoOrden);

      // Leer materiales previos para devolver stock
      const { data: prevMats } = await supabase.from("liquidacion_materiales").select("material,cantidad,unidad").eq("liquidacion_id", liquidacionId);

      // Borrar detalles anteriores
      const [delEq, delMat, delFot] = await Promise.all([
        supabase.from("liquidacion_equipos").delete().eq("liquidacion_id", liquidacionId),
        supabase.from("liquidacion_materiales").delete().eq("liquidacion_id", liquidacionId),
        supabase.from("liquidacion_fotos").delete().eq("liquidacion_id", liquidacionId),
      ]);
      if (delEq.error) throw new Error("Error limpiando equipos anteriores: " + delEq.error.message);
      if (delMat.error) throw new Error("Error limpiando materiales anteriores: " + delMat.error.message);
      if (delFot.error) throw new Error("Error limpiando fotos anteriores: " + delFot.error.message);

      // Equipos
      const equiposPayload = (liquidacion.equipos || []).map(eq => ({
        liquidacion_id: liquidacionId,
        tipo: String(eq?.tipo || ""),
        codigo: String(eq?.codigo || ""),
        serial: String(eq?.serial || ""),
        accion: String(eq?.accion || "Instalado"),
        marca: String(eq?.marca || ""),
        modelo: String(eq?.modelo || ""),
        foto_referencia: String(eq?.fotoReferencia || ""),
      }));
      if (equiposPayload.length > 0) await _insertRows("liquidacion_equipos", equiposPayload);

      // Materiales
      const materialesPayload = (liquidacion.materiales || []).map(m => ({
        liquidacion_id: liquidacionId,
        material: String(m?.material || ""),
        cantidad: Number.isFinite(Number(m?.cantidad)) ? Number(m.cantidad) : 0,
        unidad: String(m?.unidad || "unidad"),
      }));
      if (materialesPayload.length > 0) await _insertRows("liquidacion_materiales", materialesPayload);

      // Stock de materiales del técnico
      const tecnicoLiq = String(liquidacion.tecnicoLiquida || "").trim();
      if (tecnicoLiq) {
        const { data: asigRows, error: asigErr } = await supabase.from("materiales_asignados_tecnicos").select("id,material_nombre,cantidad_disponible,unidad").eq("tecnico", tecnicoLiq);
        if (!asigErr && (asigRows || []).length > 0) {
          const stockMap = new Map();
          asigRows.forEach(row => {
            const key = `${String(row.material_nombre || "").trim().toLowerCase()}|${String(row.unidad || "unidad").trim()}`;
            stockMap.set(key, { id: row.id, disponible: Number(row.cantidad_disponible || 0) });
          });
          (prevMats || []).forEach(row => {
            const key = `${String(row.material || "").trim().toLowerCase()}|${String(row.unidad || "unidad").trim()}`;
            const slot = stockMap.get(key); if (slot) slot.disponible += Number(row.cantidad || 0);
          });
          (liquidacion.materiales || []).forEach(row => {
            const key = `${String(row.material || "").trim().toLowerCase()}|${String(row.unidad || "unidad").trim()}`;
            const slot = stockMap.get(key);
            if (slot) slot.disponible = Math.max(0, slot.disponible - Number(row.cantidad || 0));
            else avisos.push(`Material "${row.material}" no asignado al técnico`);
          });
          for (const slot of stockMap.values()) {
            await supabase.from("materiales_asignados_tecnicos").update({ cantidad_disponible: slot.disponible }).eq("id", slot.id);
          }
        }
      }

      // Fotos de evidencia
      const fotosPayload = (liquidacion.fotos || []).map(url => ({ liquidacion_id: liquidacionId, foto_url: String(url) }));
      if (fotosPayload.length > 0) {
        const { error: fErr } = await supabase.from("liquidacion_fotos").insert(fotosPayload);
        if (fErr) avisos.push(`fotos: ${fErr.message}`);
      }

      // Equipos recuperados del cliente → custodia técnica
      if (eqsRecuperados.length > 0) {
        const stockRows = eqsRecuperados.map(eq => ({
          orden_codigo: String(ordenEnLiquidacion.codigo || ""),
          tecnico_recupera: String(liquidacion.tecnicoLiquida || ordenEnLiquidacion.tecnico || ""),
          tipo: String(eq.tipo || ""), marca: eq.marca || null,
          estado: String(eq.estado || ""), serial: eq.serial || null,
          fotos: eq.fotos || [],
          dni_cliente: String(ordenEnLiquidacion.dni || ""),
          nombre_cliente: String(ordenEnLiquidacion.nombre || ""),
          nodo: String(ordenEnLiquidacion.nodo || ""),
          ingresado_almacen: false,
        }));
        const { error: sErr } = await supabase.from("stock_tecnico").insert(stockRows);
        if (sErr) avisos.push(`custodia: ${sErr.message}`);
      }

      // Actualizar orden
      const esCompletada = String(liquidacion.resultadoFinal || "Completada") === "Completada";
      const ordenUpdate = { estado: "Liquidada", sn_onu: String(liquidacion.snOnu || ""), usuario_nodo_liberado: !esCompletada };
      if (liquidacion.actualizarUbicacion === "SI" && String(liquidacion.nuevaUbicacion || "").trim()) {
        ordenUpdate.ubicacion = String(liquidacion.nuevaUbicacion).trim();
      }
      if (String(liquidacion.cajaNap || "").trim()) {
        ordenUpdate.caja_nap = String(liquidacion.cajaNap).trim();
      }
      await supabase.from(ORDENES_TABLE).update(ordenUpdate).eq("id", Number(ordenEnLiquidacion.id));

      // Actualizar puertos_ocupados en la caja NAP si la orden se completó
      const cajaNapCodigo = String(liquidacion.cajaNap || "").trim();
      if (cajaNapCodigo && liquidacion.resultadoFinal === "Completada" && !liquidacionEditandoId) {
        const cajaData = napCajasMapData.find(c => c.codigo === cajaNapCodigo);
        if (cajaData) {
          const nuevosOcupados = Math.min((cajaData.puertos_ocupados || 0) + 1, cajaData.capacidad || 8);
          const { error: napErr } = await supabase
            .from("nap_cajas")
            .update({ puertos_ocupados: nuevosOcupados })
            .eq("id", cajaData.id);
          if (!napErr) {
            setNapCajasMapData(prev => prev.map(c => c.id === cajaData.id ? { ...c, puertos_ocupados: nuevosOcupados } : c));
          } else {
            avisos.push(`No se pudo actualizar puertos de ${cajaNapCodigo}`);
          }
        }
      }

      // Estado inventario equipos y cliente — solo si se completó
      const registro = { ...ordenEnLiquidacion, liquidacion, estado: "Liquidada" };
      aplicarEstadoEquiposDesdeLiquidacion(registro);
      if (liquidacion.resultadoFinal === "Completada") {
        void guardarClienteDesdeLiquidacion(registro);
      }

      // WhatsApp
      if (!liquidacionEditandoId) void sendWhatsAppNotification(ordenEnLiquidacion, "liquidacion");

      // Push al técnico: orden liquidada
      if (!liquidacionEditandoId && isSupabaseConfigured && ordenEnLiquidacion?.tecnico) {
        void supabase.functions.invoke("send-push-notification", {
          body: {
            tecnico_nombre: ordenEnLiquidacion.tecnico,
            title: "Orden liquidada",
            body: `${ordenEnLiquidacion.codigo} — ${ordenEnLiquidacion.nombre || "Cliente"} fue liquidada.`,
            data: { tipo: "orden_liquidada", orden_codigo: String(ordenEnLiquidacion.codigo || ""), orden_id: String(ordenEnLiquidacion.id || "") },
          },
        });
      }

      // Reset UI
      setOrdenEnLiquidacion(null);
      setLiquidacion(initialLiquidacion);
      setLiquidacionEditandoId(null);
      setMostrarScannerLiquidacion(false);
      setVistaActiva("historial");

      const custodiaMsg = eqsRecuperados.length > 0 ? `\n\n${eqsRecuperados.length} equipo(s) en custodia técnica.` : "";
      escribirLog({ accion: liquidacionEditandoId ? "editar_liquidacion" : "crear_liquidacion", categoria: "liquidacion", tabla: "liquidaciones", registro_id: liquidacionId, detalle: { codigo: ordenEnLiquidacion?.codigo, empresa: ordenEnLiquidacion?.empresa, cliente: ordenEnLiquidacion?.nombre, tecnico: liquidacion.tecnicoLiquida, resultado: liquidacion.resultadoFinal }, actor: usuarioSesion });
      if (avisos.length > 0) alert(`Liquidación guardada con avisos:\n• ${avisos.join("\n• ")}${custodiaMsg}`);
      else alert(`Liquidación guardada correctamente.${custodiaMsg}`);

    } catch (e) {
      alert("Error al guardar: " + (e?.message || String(e)));
    } finally {
      setLiquidacionGuardando(false);
    }
  };

  const guardarLiquidacionRecojo = async () => {
    if (!ordenEnLiquidacion) return;
    if (!liquidacionRecojo.tecnicoEjecuta) {
      alert("Indica el técnico que ejecutó el recojo.");
      return;
    }
    const equiposSinFoto = liquidacionRecojo.equiposRecuperados.filter(
      (eq) => !eq.fotos || eq.fotos.length === 0
    );
    if (equiposSinFoto.length > 0) {
      alert("Cada equipo recuperado debe tener al menos una foto antes de guardar.");
      return;
    }

    // Confirmación antes de guardar
    const resumen = [
      `Técnico: ${liquidacionRecojo.tecnicoEjecuta}`,
      `Resultado: ${liquidacionRecojo.resultado}`,
      liquidacionRecojo.equiposRecuperados.length > 0
        ? `Equipos: ${liquidacionRecojo.equiposRecuperados.map((e) => `${e.tipo}${e.serial ? ` (${e.serial})` : ""}`).join(", ")}`
        : "Sin equipos registrados",
    ].join("\n");
    if (!window.confirm(`¿Confirmar recojo?\n\n${resumen}`)) return;

    const payload = {
      orden_id: Number.isFinite(Number(ordenEnLiquidacion.id)) ? Number(ordenEnLiquidacion.id) : null,
      orden_codigo: ordenEnLiquidacion.codigo || "",
      tecnico_ejecuta: liquidacionRecojo.tecnicoEjecuta,
      resultado: liquidacionRecojo.resultado,
      observacion: liquidacionRecojo.observacion,
      equipos_recuperados: liquidacionRecojo.equiposRecuperados,
      fotos: liquidacionRecojo.fotos,
      dni: ordenEnLiquidacion.dni || "",
      nombre_cliente: ordenEnLiquidacion.nombre || "",
      direccion: ordenEnLiquidacion.direccion || "",
      nodo: ordenEnLiquidacion.nodo || "",
      creado_por: usuarioSesion?.nombre || "",
      fecha_ejecucion: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      const { data: recData, error } = await supabase
        .from("ordenes_recuperacion_ejecucion")
        .insert([payload])
        .select("id")
        .single();
      if (error) {
        alert("Error al guardar: " + (error.message || "Error desconocido"));
        return;
      }
      // Insertar equipos en stock_tecnico ANTES de marcar orden como Liquidada
      if (liquidacionRecojo.equiposRecuperados.length > 0) {
        const stockRows = liquidacionRecojo.equiposRecuperados.map((eq) => ({
          recuperacion_id: recData?.id || null,
          orden_codigo: payload.orden_codigo,
          tecnico_recupera: payload.tecnico_ejecuta,
          tipo: eq.tipo,
          marca: eq.marca || null,
          estado: eq.estado,
          serial: eq.serial || null,
          fotos: [...(eq.fotos || []), ...(liquidacionRecojo.fotos || [])],
          dni_cliente: payload.dni,
          nombre_cliente: payload.nombre_cliente,
          nodo: payload.nodo,
          ingresado_almacen: false,
        }));
        const { error: stockError } = await supabase.from("stock_tecnico").insert(stockRows);
        if (stockError) {
          alert("Error al guardar equipos en custodia: " + stockError.message);
          return;
        }
      }
      // Solo marcar Liquidada si el stock se guardó correctamente
      if (Number.isFinite(payload.orden_id)) {
        const esCompletada = String(liquidacion.resultadoFinal || "Completada") === "Completada";
        await supabase
          .from(ORDENES_TABLE)
          .update({ estado: "Liquidada", usuario_nodo_liberado: !esCompletada })
          .eq("id", payload.orden_id);
      }
    }

    // Actualizar estado local de órdenes
    setOrdenes((prev) =>
      prev.map((item) =>
        item.id === ordenEnLiquidacion.id ? { ...item, estado: "Liquidada" } : item
      )
    );

    // Agregar al historial local
    setHistorialRecuperaciones((prev) => [{ ...payload, id: Date.now() }, ...prev]);

    // WhatsApp al cliente al liquidar recuperación
    void sendWhatsAppNotification(ordenEnLiquidacion, "liquidacion");

    setOrdenEnLiquidacion(null);
    setLiquidacionRecojo(initialLiquidacionRecojo);
    setVistaActiva("recuperaciones");
  };

  const cargarHistorialRecuperaciones = async () => {
    if (!isSupabaseConfigured) return;
    setCargandoRecuperaciones(true);
    try {
      const { data, error } = await supabase
        .from("ordenes_recuperacion_ejecucion")
        .select("*")
        .order("fecha_ejecucion", { ascending: false })
        .limit(200);
      if (!error && data) setHistorialRecuperaciones(data);
    } catch (_) {
      // silencioso
    } finally {
      setCargandoRecuperaciones(false);
    }
  };

  const cargarStockTecnico = async () => {
    if (!isSupabaseConfigured) return;
    setCargandoStockTecnico(true);
    try {
      const { data, error } = await supabase
        .from("stock_tecnico")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!error && data) {
        // Auto-detectar cuáles seriales ya existen en equipos_catalogo con estado != liquidado
        const seriales = data.filter((s) => s.serial && !s.catalogado).map((s) => s.serial.trim());
        // mapa serial -> estado del catálogo
        const serialEstadoMap = new Map();
        if (seriales.length > 0) {
          const { data: enCatalogo } = await supabase
            .from("equipos_catalogo")
            .select("codigo_qr, serial_mac, estado")
            .or(seriales.map((s) => `codigo_qr.eq.${s},serial_mac.eq.${s}`).join(","))
            .neq("estado", "liquidado");
          if (enCatalogo) {
            enCatalogo.forEach((eq) => {
              if (eq.codigo_qr) serialEstadoMap.set(eq.codigo_qr.trim(), eq.estado);
              if (eq.serial_mac) serialEstadoMap.set(eq.serial_mac.trim(), eq.estado);
            });
          }
        }
        // Marcar catalogado en BD con estado y fecha, así queda histórico aunque después se reasigne
        const ahora = new Date().toISOString();
        const actualizados = data.map((s) => {
          if (!s.catalogado && s.serial && serialEstadoMap.has(s.serial.trim())) {
            const estadoCatalogo = serialEstadoMap.get(s.serial.trim());
            void supabase.from("stock_tecnico").update({ catalogado: true, estado_catalogado: estadoCatalogo, fecha_catalogado: ahora }).eq("id", s.id);
            return { ...s, catalogado: true, estado_catalogado: estadoCatalogo, fecha_catalogado: ahora };
          }
          return s;
        });
        setStockTecnico(actualizados);
      }
    } catch (_) {
      // silencioso
    } finally {
      setCargandoStockTecnico(false);
    }
  };

  const ingresarEquipoAlmacen = async (item) => {
    if (!isSupabaseConfigured) return;
    const obs = observacionIngreso.trim();
    const foto = fotoRecepcion.trim();
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from("stock_tecnico")
      .update({
        ingresado_almacen: true,
        ingresado_por: usuarioSesion?.nombre || "",
        fecha_ingreso: ahora,
        observacion_ingreso: obs,
        foto_recepcion: foto || null,
        updated_at: ahora,
      })
      .eq("id", item.id);
    if (error) {
      alert("Error al ingresar: " + (error.message || "Error desconocido"));
      return;
    }

    setStockTecnico((prev) =>
      prev.map((s) =>
        s.id === item.id
          ? { ...s, ingresado_almacen: true, ingresado_por: usuarioSesion?.nombre || "", fecha_ingreso: ahora, observacion_ingreso: obs, foto_recepcion: foto || null }
          : s
      )
    );
    setIngresandoStockId(null);
    setObservacionIngreso("");
    setFotoRecepcion("");
  };

  const agregarEquipo = () => {
    setLiquidacion((prev) => ({
      ...prev,
      equipos: [
        ...prev.equipos,
        {
          tipo: "ONU",
          codigo: "",
          serial: "",
          accion: "Instalado",
          marca: "",
          modelo: "",
          empresa: "",
          idInventario: null,
          fotoReferencia: "",
        },
      ],
    }));
  };

  const actualizarEquipo = (index, field, value) => {
    setLiquidacion((prev) => ({
      ...prev,
      equipos: prev.equipos.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const eliminarEquipo = (index) => {
    setLiquidacion((prev) => ({
      ...prev,
      equipos: prev.equipos.filter((_, i) => i !== index),
    }));
  };

  const agregarMaterial = () => {
    setLiquidacion((prev) => ({
      ...prev,
      materiales: [...prev.materiales, { material: "", cantidad: "", unidad: "unidad" }],
    }));
  };

  const actualizarMaterial = (index, field, value) => {
    setLiquidacion((prev) => ({
      ...prev,
      materiales: prev.materiales.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const eliminarMaterial = (index) => {
    setLiquidacion((prev) => ({
      ...prev,
      materiales: prev.materiales.filter((_, i) => i !== index),
    }));
  };

  const cargarImagenOrden = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const valor = await uploadFotoOrBase64(file, "fachada");
    handleChange("fotoFachada", valor);
  };

  const cargarFotoEquipoCatalogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const valor = await uploadFotoOrBase64(file, "catalogo");
    handleEquipoCatalogoChange("fotoReferencia", valor);
  };

  const uploadFotoOrBase64 = async (file, subfolder = "general") => {
    if (!isSupabaseConfigured || !(file instanceof File)) {
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }
    try {
      const ext = (file.name || "foto.jpg").split(".").pop().toLowerCase() || "jpg";
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const path = `liquidaciones/${subfolder}/${ymd}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("liquidaciones").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("liquidaciones").getPublicUrl(path);
      const url = String(data?.publicUrl || "").trim();
      if (url) return url;
      throw new Error("URL vacía");
    } catch {
      // Fallback a base64
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }
  };

  const cargarFotosLiquidacion = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const fotosActuales = liquidacion.fotos.length;
    const espaciosDisponibles = 10 - fotosActuales;

    if (espaciosDisponibles <= 0) {
      alert("Solo puedes subir hasta 10 fotos.");
      return;
    }

    const archivosPermitidos = files.slice(0, espaciosDisponibles);

    if (files.length > espaciosDisponibles) {
      alert(`Solo puedes subir hasta 10 fotos. Se agregarán ${espaciosDisponibles} foto(s).`);
    }

    for (const file of archivosPermitidos) {
      const valor = await uploadFotoOrBase64(file, "fotos");
      if (valor) {
        setLiquidacion((prev) => {
          if (prev.fotos.length >= 5) return prev;
          return { ...prev, fotos: [...prev.fotos, valor].slice(0, 5) };
        });
      }
    }
  };

  const quitarFotoLiquidacion = (index) => {
    setLiquidacion((prev) => ({
      ...prev,
      fotos: prev.fotos.filter((_, i) => i !== index),
    }));
  };

  const guardarUsuario = () => {
    if (!usuarioForm.nombre.trim()) {
      alert("Ingresa el nombre del usuario");
      return;
    }
    const usernameLimpio = String(usuarioForm.username || "").trim().toLowerCase();
    if (!usernameLimpio) {
      alert("Ingresa el usuario de acceso.");
      return;
    }
    const passLimpio = String(usuarioForm.password || "").trim();
    if (!passLimpio) {
      alert("Ingresa la contraseña de acceso.");
      return;
    }
    const rolNorm = normalizarRolSimple(usuarioForm.rol);
    const accesosMenu = normalizarAccesosMenuWeb(usuarioForm.accesosMenu, rolNorm);
    const nodosAcceso = normalizarNodosAccesoWeb(usuarioForm.nodosAcceso);
    if (!accesosMenu.length) {
      alert("Selecciona al menos un acceso de menú.");
      return;
    }
    if (rolNorm === "Gestora" && !nodosAcceso.length) {
      alert("Selecciona al menos un nodo para la gestora.");
      return;
    }
    const usernameDuplicado = usuarios.find(
      (u) =>
        String(u.username || "").trim().toLowerCase() === usernameLimpio &&
        Number(u.id) !== Number(usuarioEditandoId)
    );
    if (usernameDuplicado) {
      alert("Ese usuario ya existe. Elige otro.");
      return;
    }

    const usuarioActualizado = {
      ...normalizarUsuarioConPermisos(usuarioForm),
      username: usernameLimpio,
      password: passLimpio,
      rol: rolNorm,
      accesosMenu,
      nodosAcceso: rolNorm === "Gestora" ? nodosAcceso : [],
    };

    const esEdicion = Boolean(usuarioEditandoId);
    if (usuarioEditandoId) {
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuarioEditandoId
            ? { ...u, ...usuarioActualizado }
            : u
        )
      );
    } else {
      const nuevoUsuario = { ...usuarioActualizado, id: Date.now(), fechaCreacion: new Date().toLocaleString() };
      setUsuarios((prev) => [nuevoUsuario, ...prev]);
    }

    // Guardar en Supabase
    if (isSupabaseConfigured) {
      const usuarioExistente = usuarioEditandoId ? usuarios.find((u) => u.id === usuarioEditandoId) : null;
      const supabaseId = usuarioExistente?.supabaseId ?? null;
      const usernameOriginal = String(usuarioExistente?.username || "").trim().toLowerCase();
      const serializado = serializarUsuarioParaSupabase(usuarioActualizado);

      const doSave = async () => {
        const username = serializado.username;
        if (!username) return;

        // Bloquear el timer de sync para que no sobreescriba con datos viejos
        if (usuariosSyncTimerRef.current) clearTimeout(usuariosSyncTimerRef.current);
        usuariosHydratingRef.current = true;

        try {
          if (esEdicion) {
            const buildUpdate = (payload) => {
              if (supabaseId) {
                return supabase.from(USUARIOS_TABLE).update(payload).eq("id", supabaseId).select("id");
              }
              if (usernameOriginal) {
                return supabase.from(USUARIOS_TABLE).update(payload).ilike("username", usernameOriginal).select("id");
              }
              return null;
            };

            const updater = buildUpdate(serializado);
            if (!updater) {
              alert("No se pudo identificar el usuario en Supabase para actualizar. Refresca y vuelve a intentar.");
              return;
            }

            let { data: updatedRows, error } = await updater;
            if (error) {
              const { accesos_menu, nodos_acceso, ...serializadoBase } = serializado;
              const updaterBase = buildUpdate(serializadoBase);
              if (!updaterBase) {
                alert("No se pudo identificar el usuario en Supabase para actualizar. Refresca y vuelve a intentar.");
                return;
              }
              const res2 = await updaterBase;
              if (res2.error) {
                alert(`Error al guardar usuario:\n${res2.error.message}`);
                return;
              }
              updatedRows = res2.data;
            }

            if (!updatedRows || updatedRows.length === 0) {
              alert("No se encontró el usuario en Supabase para actualizar. No se insertó un nuevo registro.");
              return;
            }
          } else {
            // Insertar solo cuando es creación
            const { error: err3 } = await supabase.from(USUARIOS_TABLE).insert(serializado);
            if (err3) {
              const { accesos_menu, nodos_acceso, ...serializadoBase } = serializado;
              const resBase = await supabase.from(USUARIOS_TABLE).insert(serializadoBase);
              if (resBase.error) {
                alert(`Error al guardar usuario:\n${resBase.error.message}`);
                return;
              }
            }
          }

          await cargarUsuariosDesdeSupabase({ silent: true });
        } finally {
          usuariosHydratingRef.current = false;
        }
      };
      void doSave();
    }

    setUsuarioForm(normalizarUsuarioConPermisos(initialUsuario));
    setUsuarioEditandoId(null);
  };

  const editarUsuario = (usuario) => {
    setUsuarioForm(normalizarUsuarioConPermisos({
      nombre: usuario.nombre || "",
      username: usuario.username || "",
      password: usuario.password || "",
      rol: normalizarRolSimple(usuario.rol || "Tecnico"),
      celular: usuario.celular || "",
      email: usuario.email || "",
      empresa: usuario.empresa || "Americanet",
      activo: !!usuario.activo,
      accesosMenu: usuario.accesosMenu ?? usuario.accesos_menu,
      accesosHistorialAppsheet:
        usuario.accesosHistorialAppsheet ?? usuario.accesos_historial_appsheet ?? usuario.accesosMenu ?? usuario.accesos_menu,
      accesosDiagnosticoServicio:
        usuario.accesosDiagnosticoServicio ?? usuario.accesos_diagnostico_servicio ?? usuario.accesosMenu ?? usuario.accesos_menu,
      nodosAcceso: usuario.nodosAcceso ?? usuario.nodos_acceso,
    }));
    setUsuarioEditandoId(usuario.id);
    setVistaActiva("usuarios");
    setTimeout(() => {
      contentWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      usuarioFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const eliminarUsuario = async (id) => {
    const confirmar = window.confirm("¿Deseas eliminar este usuario?");
    if (!confirmar) return;
    const usuario = usuarios.find((u) => u.id === id);
    setUsuarios((prev) => prev.filter((u) => u.id !== id));
    if (isSupabaseConfigured && usuario) {
      const dbId = usuario.supabaseId ?? null;
      const username = String(usuario.username || "").trim();
      if (dbId) {
        const { data, error } = await supabase.from(USUARIOS_TABLE).delete().eq("id", dbId).select("id");
        if (error) {
          alert(`Error al eliminar:\n${error.message}`);
        } else if (!data || data.length === 0) {
          alert("No se encontró el usuario en Supabase para eliminar.");
        }
      } else if (username) {
        const { data: filas, error: selErr } = await supabase.from(USUARIOS_TABLE).select("id").ilike("username", username);
        if (selErr) {
          alert(`Error al buscar usuario:\n${selErr.message}`);
        } else if (!filas || filas.length === 0) {
          alert("No se encontró el usuario en Supabase para eliminar.");
        } else {
          for (const fila of filas || []) {
            const { error: delErr } = await supabase.from(USUARIOS_TABLE).delete().eq("id", fila.id);
            if (delErr) {
              alert(`Error al eliminar:\n${delErr.message}`);
              break;
            }
          }
        }
      }
      await cargarUsuariosDesdeSupabase({ silent: true });
    }
  };

  const cambiarEstadoUsuario = async (id) => {
    const usuario = usuarios.find((u) => u.id === id);
    if (!usuario) return;
    const nuevoActivo = !usuario.activo;
    setUsuarios((prev) =>
      prev.map((u) => (u.id === id ? { ...u, activo: nuevoActivo } : u))
    );
    if (isSupabaseConfigured && usuario) {
      const dbId = usuario.supabaseId ?? null;
      const username = String(usuario.username || "").trim();
      if (dbId) {
        const { data, error } = await supabase.from(USUARIOS_TABLE).update({ activo: nuevoActivo }).eq("id", dbId).select("id");
        if (error) {
          alert(`Error al actualizar estado:\n${error.message}`);
        } else if (!data || data.length === 0) {
          alert("No se encontró el usuario en Supabase para actualizar estado.");
        }
      } else if (username) {
        const { data: filas, error: selErr } = await supabase.from(USUARIOS_TABLE).select("id").ilike("username", username);
        if (selErr) {
          alert(`Error al buscar usuario:\n${selErr.message}`);
        } else if (!filas || filas.length === 0) {
          alert("No se encontró el usuario en Supabase para actualizar estado.");
        } else {
          for (const fila of filas || []) {
            const { error: updErr } = await supabase.from(USUARIOS_TABLE).update({ activo: nuevoActivo }).eq("id", fila.id);
            if (updErr) {
              alert(`Error al actualizar estado:\n${updErr.message}`);
              break;
            }
          }
        }
      }
      await cargarUsuariosDesdeSupabase({ silent: true });
    }
  };

  const cancelarEdicionUsuario = () => {
    setUsuarioForm(normalizarUsuarioConPermisos(initialUsuario));
    setUsuarioEditandoId(null);
  };

  const cargarFotoEquipoLiquidacion = async (index, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const valor = await uploadFotoOrBase64(file, "equipos");
    if (valor) actualizarEquipo(index, "fotoReferencia", valor);
  };

  const handleMikrotikRouterChange = (routerKey, field, value) => {
    setMikrotikRoutersConfig((prev) =>
      mergeMikrotikRoutersWithDefaults(prev).map((item) =>
        item.routerKey === routerKey
          ? normalizarMikrotikRouterConfig({
              ...item,
              [field]:
                field === "activo"
                  ? Boolean(value)
                  : field === "routerKey"
                    ? normalizarRouterKey(value)
                    : value,
            })
          : item
      )
    );
    setMikrotikConfigInfo("");
    setMikrotikConfigError("");
  };

  const agregarMikrotikRouter = () => {
    setMikrotikRoutersConfig((prev) => {
      const existente = new Set(prev.map((item) => item.routerKey));
      let idx = prev.length + 1;
      let routerKey = `router_${idx}`;
      while (existente.has(routerKey)) {
        idx += 1;
        routerKey = `router_${idx}`;
      }
      return [
        ...prev,
        normalizarMikrotikRouterConfig({
          routerKey,
          nombre: `Router ${idx}`,
          host: "",
          port: "8730",
          apiUser: "admin",
          apiPassword: "",
          activo: true,
          notas: "",
          persisted: false,
        }),
      ];
    });
    setMikrotikConfigInfo("");
    setMikrotikConfigError("");
  };

  const handleMikrotikNodoRouterChange = (nodo, field, value) => {
    setMikrotikNodoRouterConfig((prev) =>
      mergeMikrotikNodoRouterWithDefaults(prev).map((item) =>
        item.nodo === nodo
          ? normalizarMikrotikNodoRouterConfig({
              ...item,
              [field]: field === "routerKey" ? normalizarRouterKey(value) : value,
              activo:
                field === "routerKey"
                  ? Boolean(String(value || "").trim())
                  : field === "activo"
                    ? Boolean(value)
                    : item.activo,
            })
          : item
      )
    );
    setMikrotikConfigInfo("");
    setMikrotikConfigError("");
  };

  const crearOrdenDesdeCliente = (cliente = {}) => {
    const base = buildInitialOrder();
    const random = Math.floor(1000 + Math.random() * 9000);
    const year = new Date().getFullYear();
    setOrdenEditandoId(null);
    setOrden({
      ...base,
      codigo: `ORD-${random}-${year}`,
      empresa: firstText(cliente.empresa, base.empresa),
      orden: "INCIDENCIA",
      tipoActuacion: "Incidencia Internet",
      generarUsuario: "SI",
      dni: firstText(cliente.dni),
      nombre: firstText(cliente.nombre),
      direccion: firstText(cliente.direccion),
      celular: firstText(cliente.celular),
      email: firstText(cliente.email),
      contacto: firstText(cliente.contacto),
      velocidad: firstText(cliente.velocidad),
      precioPlan: firstText(cliente.precioPlan),
      nodo: firstText(cliente.nodo),
      usuarioNodo: firstText(cliente.usuarioNodo),
      passwordUsuario: firstText(cliente.passwordUsuario) || sugerirPasswordPorNodo(firstText(cliente.nodo)),
      codigoEtiqueta: firstText(cliente.codigoEtiqueta),
      snOnu: firstText(cliente.snOnu),
      ubicacion: firstText(cliente.ubicacion, base.ubicacion),
      descripcion: firstText(cliente.descripcion),
      tecnico: firstText(cliente.tecnico),
      autorOrden: firstText(cliente.autorOrden),
      cajaNap: firstText(cliente.cajaNap),
      puertoNap: firstText(cliente.puertoNap),
      solicitarPago: "NO",
      montoCobrar: "",
    });
    if (firstText(cliente.cajaNap)) cajaNapDesdClienteRef.current = true;
    setVistaActiva("crear");
    setTimeout(() => {
      contentWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  };

  const abrirEditarCliente = (cli) => {
    setFormEditarCliente({
      nombre: cli.nombre || "",
      dni: cli.dni || "",
      direccion: cli.direccion || "",
      celular: cli.celular || "",
      email: cli.email || "",
      empresa: cli.empresa || "",
      contacto: cli.contacto || "",
      velocidad: cli.velocidad || "",
      precioPlan: cli.precioPlan || "",
      nodo: cli.nodo || "",
      usuarioNodo: cli.usuarioNodo || "",
      passwordUsuario: cli.passwordUsuario || "",
      snOnu: cli.snOnu || "",
      codigoEtiqueta: cli.codigoEtiqueta || "",
      codigoCliente: cli.codigoCliente || cli.codigoAbonado || "",
      estadoServicio: cli.estadoServicio || "ACTIVO",
      cajaNap: cli.cajaNap || "",
      puertoNap: cli.puertoNap || "",
      descripcion: cli.descripcion || "",
    });
    setModalEditarCliente(true);
  };

  const guardarEdicionCliente = async () => {
    if (!clienteSeleccionado) return;
    setGuardandoCliente(true);
    try {
      const f = formEditarCliente;
      const updated = {
        ...clienteSeleccionado,
        nombre: f.nombre.trim(),
        dni: f.dni.trim(),
        direccion: f.direccion.trim(),
        celular: f.celular.trim(),
        email: f.email.trim(),
        empresa: f.empresa.trim(),
        contacto: f.contacto.trim(),
        velocidad: f.velocidad.trim(),
        precioPlan: f.precioPlan.trim(),
        nodo: f.nodo.trim(),
        usuarioNodo: f.usuarioNodo.trim(),
        passwordUsuario: f.passwordUsuario.trim(),
        snOnu: f.snOnu.trim(),
        codigoEtiqueta: f.codigoEtiqueta.trim(),
        codigoCliente: f.codigoCliente.trim(),
        estadoServicio: f.estadoServicio,
        cajaNap: f.cajaNap.trim(),
        puertoNap: f.puertoNap.trim(),
        descripcion: f.descripcion.trim(),
        ultimaActualizacion: new Date().toISOString(),
      };
      const row = serializarClienteParaSupabase(updated);
      const { id: _drop, ...rowSinId } = row;
      const { error } = await supabase.from(CLIENTES_TABLE).update(rowSinId).eq("dni", updated.dni);
      if (error) throw error;
      setClienteSeleccionado(updated);
      setClientes(prev => prev.map(c => (c.id === updated.id || c.dni === updated.dni) ? { ...c, ...updated } : c));
      setModalEditarCliente(false);
    } catch (e) {
      alert("Error al guardar: " + (e?.message || "desconocido"));
    } finally {
      setGuardandoCliente(false);
    }
  };

  const eliminarCliente = async (cliente = {}) => {
    if (!esAdminSesion) {
      alert("Solo un administrador puede eliminar clientes.");
      return;
    }
    const nombre = String(cliente?.nombre || cliente?.dni || "cliente").trim();
    const confirmar = window.confirm(`¿Eliminar cliente "${nombre}"?\nEsta acción no se puede deshacer.`);
    if (!confirmar) return;

    const clienteId = Number(cliente?.id);
    const dni = String(cliente?.dni || "").trim();

    try {
      if (isSupabaseConfigured) {
        if (Number.isFinite(clienteId)) {
          const relDel = await supabase.from("cliente_fotos_liquidacion").delete().eq("cliente_id", clienteId);
          if (relDel.error) throw relDel.error;
          const cliDel = await supabase.from(CLIENTES_TABLE).delete().eq("id", clienteId);
          if (cliDel.error) throw cliDel.error;
        } else if (dni) {
          const cliDel = await supabase.from(CLIENTES_TABLE).delete().eq("dni", dni);
          if (cliDel.error) throw cliDel.error;
        }
        escribirLog({ accion: "eliminar_cliente", categoria: "cliente", criticidad: "critica", tabla: "clientes", registro_id: clienteId || dni, detalle: { nombre: cliente?.nombre, dni: cliente?.dni, nodo: cliente?.nodo, empresa: cliente?.empresa }, actor: usuarioSesion });
      }

      setClientes((prev) =>
        prev.filter((c) => {
          if (Number.isFinite(clienteId) && Number(c?.id) === clienteId) return false;
          if (dni && String(c?.dni || "").trim() === dni) return false;
          return true;
        })
      );

      if (
        clienteSeleccionado &&
        ((Number.isFinite(clienteId) && Number(clienteSeleccionado?.id) === clienteId) ||
          (dni && String(clienteSeleccionado?.dni || "").trim() === dni))
      ) {
        setClienteSeleccionado(null);
        setVistaActiva("clientes");
      }

      alert("Cliente eliminado.");
    } catch (e) {
      alert(`No se pudo eliminar el cliente: ${String(e?.message || "error desconocido")}`);
    }
  };

  const guardarEquipoCatalogo = () => {
    if (
      !equipoForm.tipo.trim() ||
      !equipoForm.marca.trim() ||
      !equipoForm.modelo.trim() ||
      !equipoForm.codigoQR.trim()
    ) {
      alert("Completa los campos obligatorios del equipo.");
      return;
    }

    const qrDuplicado = equiposCatalogo.find(
      (eq) =>
        String(eq.codigoQR || "").trim().toLowerCase() ===
          String(equipoForm.codigoQR || "").trim().toLowerCase() &&
        eq.id !== equipoEditandoId
    );

    if (qrDuplicado) {
      alert("Ya existe un equipo con ese código QR.");
      return;
    }

    const serialIngresado = String(equipoForm.serialMac || "").trim().toLowerCase();
    if (serialIngresado) {
      const serialDuplicado = equiposCatalogo.find(
        (eq) => String(eq.serialMac || "").trim().toLowerCase() === serialIngresado && eq.id !== equipoEditandoId
      );

      if (serialDuplicado) {
        alert("Ya existe un equipo con ese serial o MAC.");
        return;
      }
    }

    if (equipoEditandoId) {
      setEquiposCatalogo((prev) =>
        prev.map((eq) =>
          eq.id === equipoEditandoId
            ? {
                ...eq,
                ...equipoForm,
              }
            : eq
        )
      );
    } else {
      const nuevoEquipo = {
        ...equipoForm,
        id: Date.now(),
        fechaCreacion: new Date().toLocaleString(),
      };
      setEquiposCatalogo((prev) => [nuevoEquipo, ...prev]);
    }

    setEquipoForm(initialEquipoCatalogo);
    setEquipoEditandoId(null);
  };

  const editarEquipoCatalogo = (equipo) => {
    setEquipoForm({
      empresa: equipo.empresa || "Americanet",
      tipo: equipo.tipo || "ONU",
      marca: equipo.marca || "",
      modelo: equipo.modelo || "",
      codigoQR: equipo.codigoQR || "",
      serialMac: equipo.serialMac || "",
      fotoReferencia: equipo.fotoReferencia || "",
      estado: equipo.estado || "almacen",
      tecnicoAsignado: equipo.tecnicoAsignado || "",
    });
    setEquipoEditandoId(equipo.id);
    setVistaActiva("inventario");
  };

  const cancelarEdicionEquipo = () => {
    setEquipoForm(initialEquipoCatalogo);
    setEquipoEditandoId(null);
  };

  const eliminarEquipoCatalogo = (id) => {
    const equipo = equiposCatalogo.find((e) => e.id === id);
    if (!equipo) return;

    if (equipo.estado === "instalado") {
      alert("No puedes eliminar un equipo que ya está instalado.");
      return;
    }

    const confirmar = window.confirm("¿Deseas eliminar este equipo del catálogo?");
    if (!confirmar) return;

    setEquiposCatalogo((prev) => prev.filter((eq) => eq.id !== id));
  };

  const asignarEquipoATecnico = () => {
    if (!asignacionInventario.tecnico || !asignacionInventario.equipoId) {
      alert("Selecciona un técnico y un equipo.");
      return;
    }

    setEquiposCatalogo((prev) =>
      prev.map((eq) =>
        eq.id === Number(asignacionInventario.equipoId)
          ? {
              ...eq,
              estado: "asignado",
              tecnicoAsignado: asignacionInventario.tecnico,
              fechaAsignacion: new Date().toLocaleString(),
            }
          : eq
      )
    );

    setAsignacionInventario(initialAsignacionInventario);
  };

  const devolverEquipoAlmacen = (id) => {
    setEquiposCatalogo((prev) =>
      prev.map((eq) =>
        eq.id === id
          ? {
              ...eq,
              estado: "almacen",
              tecnicoAsignado: "",
              clienteDni: "",
              clienteNombre: "",
              ordenCodigo: "",
            }
          : eq
      )
    );
  };

  const agregarEquipoDesdeCatalogoALiquidacion = (codigoLeido) => {
    const codigoQR = String(codigoLeido || liquidacion.codigoQRManual || "")
      .trim()
      .toLowerCase();

    if (!codigoQR) {
      alert("Ingresa o escanea un código QR.");
      return;
    }

    const equipo = equiposCatalogo.find(
      (eq) => String(eq.codigoQR || "").trim().toLowerCase() === codigoQR
    );

    if (!equipo) {
      alert("No se encontró el equipo en el catálogo.");
      return;
    }

    if (equipo.estado !== "asignado" && equipo.estado !== "instalado") {
      alert("Ese equipo no está asignado a un técnico.");
      return;
    }

    const tecnicoLiquida = liquidacion.tecnicoLiquida || ordenEnLiquidacion?.tecnico || "";

    if (
      tecnicoLiquida &&
      equipo.estado === "asignado" &&
      String(equipo.tecnicoAsignado || "") !== String(tecnicoLiquida)
    ) {
      alert("Ese equipo está asignado a otro técnico.");
      return;
    }

    const yaExiste = liquidacion.equipos.some(
      (item) =>
        String(item.codigo || "").trim().toLowerCase() ===
        String(equipo.codigoQR || "").trim().toLowerCase()
    );

    if (yaExiste) {
      alert("Ese equipo ya fue agregado a esta liquidación.");
      return;
    }

    setLiquidacion((prev) => ({
      ...prev,
      codigoQRManual: "",
      equipos: [
        ...prev.equipos,
        {
          idInventario: equipo.id,
          tipo: equipo.tipo || "ONU",
          codigo: equipo.codigoQR || "",
          serial: equipo.serialMac || "",
          accion: "Instalado",
          marca: equipo.marca || "",
          modelo: equipo.modelo || "",
          empresa: equipo.empresa || "",
          fotoReferencia: equipo.fotoReferencia || "",
        },
      ],
    }));

    setMostrarScannerLiquidacion(false);
  };

  const googleMapUrl = useMemo(() => {
    const coords = orden.ubicacion?.trim();
    if (!coords) {
      return "https://maps.google.com/maps?q=-16.438490,-71.598208&z=16&output=embed";
    }
    return `https://maps.google.com/maps?q=${encodeURIComponent(coords)}&z=16&output=embed`;
  }, [orden.ubicacion]);

  const ordenesPendientesFiltradas = useMemo(() => {
    const q = busquedaPendientes.trim().toLowerCase();

    let lista = ordenes.filter((item) => esEstadoOperativoOrden(item?.estado));

    if (filtroTecnico === "SIN") {
      lista = lista.filter((o) => !o.tecnico);
    }

    if (filtroTecnico !== "TODOS" && filtroTecnico !== "SIN") {
      lista = lista.filter((o) => o.tecnico === filtroTecnico);
    }

    if (filtroTipoOrden === "PENDIENTE") {
      lista = lista.filter((o) => String(o.estado || "").toLowerCase() === "pendiente");
    } else if (filtroTipoOrden === "PROCESO") {
      lista = lista.filter((o) => String(o.estado || "").toLowerCase().includes("proceso"));
    } else if (filtroTipoOrden === "INCIDENCIA") {
      lista = lista.filter((o) => String(o.orden || "").toUpperCase().includes("INCIDENCIA"));
    } else if (filtroTipoOrden === "ORDEN_SERVICIO") {
      lista = lista.filter((o) => String(o.orden || "").toUpperCase().includes("ORDEN DE SERVICIO"));
    } else if (filtroTipoOrden === "RECUPERACION") {
      lista = lista.filter((o) => String(o.orden || "").toUpperCase().includes("RECUPERACION"));
    }

    lista = lista.sort((a, b) =>
      String(a.tecnico || "").localeCompare(String(b.tecnico || ""))
    );

    if (!q) return lista;

    return lista.filter((item) => {
      return (
        safeIncludes(item.codigo, q) ||
        safeIncludes(item.dni, q) ||
        safeIncludes(item.nombre, q) ||
        safeIncludes(item.celular, q) ||
        safeIncludes(item.direccion, q) ||
        safeIncludes(item.usuarioNodo, q) ||
        safeIncludes(item.nodo, q) ||
        safeIncludes(item.tecnico, q) ||
        safeIncludes(item.autorOrden, q) ||
        safeIncludes(item.tipoActuacion, q)
      );
    });
  }, [ordenes, busquedaPendientes, filtroTecnico, filtroTipoOrden]);

  const liquidacionesFiltradas = useMemo(() => {
    const q = busquedaHistorial.trim().toLowerCase();
    let base = (Array.isArray(liquidaciones) ? liquidaciones : []).filter((item) =>
      tieneAccesoNodoSesion(firstText(item?.nodo, item?.payload?.nodo, item?.payload?.Nodo))
    );
    // Filtro nodo (normalizado para cubrir variaciones de capitalización)
    if (histFiltroNodo !== "TODOS") {
      const nodoNorm = normalizeNodoKey(histFiltroNodo);
      base = base.filter((item) => normalizeNodoKey(String(item.nodo || "").trim()) === nodoNorm);
    }
    // Filtro tipo de orden
    if (histFiltroTipo !== "TODOS") {
      const tipoLower = histFiltroTipo.toLowerCase();
      base = base.filter((item) => String(item.tipoActuacion || "").toLowerCase().includes(tipoLower));
    }
    // Filtro fecha desde
    if (histFiltroDesde) {
      base = base.filter((item) => {
        const f = item.fechaLiquidacionISO || "";
        return f && f >= histFiltroDesde;
      });
    }
    // Filtro fecha hasta
    if (histFiltroHasta) {
      base = base.filter((item) => {
        const f = item.fechaLiquidacionISO || "";
        return f && f <= histFiltroHasta;
      });
    }
    if (!q) return base;
    return base.filter((item) => {
      return (
        safeIncludes(item.codigo, q) ||
        safeIncludes(item.dni, q) ||
        safeIncludes(item.nombre, q) ||
        safeIncludes(item.celular, q) ||
        safeIncludes(item.direccion, q) ||
        safeIncludes(item.usuarioNodo, q) ||
        safeIncludes(item.nodo, q) ||
        safeIncludes(item.tecnico, q) ||
        safeIncludes(item.autorOrden, q) ||
        safeIncludes(item.tipoActuacion, q) ||
        safeIncludes(item.liquidacion?.tecnicoLiquida, q) ||
        safeIncludes(item.liquidacion?.resultadoFinal, q) ||
        safeIncludes(item.liquidacion?.medioPago, q) ||
        safeIncludes(item.liquidacion?.codigoEtiqueta, q)
      );
    });
  }, [liquidaciones, busquedaHistorial, tieneAccesoNodoSesion, histFiltroNodo, histFiltroTipo, histFiltroDesde, histFiltroHasta]);

  const liquidacionesReporte = useMemo(() => {
    const q = reporteBusqueda.trim().toLowerCase();
    return liquidaciones
      .filter((item) => fechaDentroDeRango(item.fechaLiquidacion, reporteDesde, reporteHasta))
      .filter((item) => (reporteNodo === "TODOS" ? true : String(item.nodo || "") === reporteNodo))
      .filter((item) =>
        reporteTecnico === "TODOS"
          ? true
          : String(item.liquidacion?.tecnicoLiquida || item.tecnico || "") === reporteTecnico
      )
      .filter((item) => {
        if (reporteTipo === "TODOS") return true;
        const tipo = String(item.tipoActuacion || "").toLowerCase();
        return reporteTipo === "INSTALACION" ? tipo.includes("instal") : tipo.includes("inciden");
      })
      .filter((item) => {
        if (!q) return true;
        return (
          safeIncludes(item.codigo, q) ||
          safeIncludes(item.nombre, q) ||
          safeIncludes(item.dni, q) ||
          safeIncludes(item.nodo, q) ||
          safeIncludes(item.tipoActuacion, q) ||
          safeIncludes(item.tecnico, q) ||
          safeIncludes(item.liquidacion?.tecnicoLiquida, q)
        );
      });
  }, [
    liquidaciones,
    reporteDesde,
    reporteHasta,
    reporteNodo,
    reporteTecnico,
    reporteTipo,
    reporteBusqueda,
  ]);

  const reporteResumen = useMemo(() => {
    const instalaciones = liquidacionesReporte.filter((item) =>
      String(item.tipoActuacion || "").toLowerCase().includes("instal")
    ).length;
    const incidencias = liquidacionesReporte.filter((item) =>
      String(item.tipoActuacion || "").toLowerCase().includes("inciden")
    ).length;
    const costoActuacion = instalaciones * 60 + incidencias * 25;
    const montoCobrado = liquidacionesReporte.reduce((acc, item) => {
      const n = Number(item.liquidacion?.montoCobrado || item.montoCobrado || 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
    return { instalaciones, incidencias, costoActuacion, montoCobrado };
  }, [liquidacionesReporte]);

  const nodosReporte = useMemo(() => {
    return Array.from(new Set(liquidaciones.map((x) => String(x.nodo || "").trim()).filter(Boolean))).sort();
  }, [liquidaciones]);

  const tecnicosReporte = useMemo(() => {
    return Array.from(
      new Set(
        liquidaciones
          .map((x) => String(x.liquidacion?.tecnicoLiquida || x.tecnico || "").trim())
          .filter(Boolean)
      )
    ).sort();
  }, [liquidaciones]);

  const reporteMateriales = useMemo(() => {
    const map = new Map();
    liquidacionesReporte.forEach((item) => {
      const mats = Array.isArray(item?.liquidacion?.materiales) ? item.liquidacion.materiales : [];
      const cod = String(item?.codigo || "-");
      mats.forEach((mat) => {
        const nombre = String(mat?.material || mat?.nombre || "Sin material").trim() || "Sin material";
        const unidad = String(mat?.unidad || "unidad").trim() || "unidad";
        const key = `${nombre}||${unidad}`;
        const cantidadNum = Number(mat?.cantidad || 0);
        const cantidad = Number.isFinite(cantidadNum) ? cantidadNum : 0;
        const costoUnitNum = Number(
          mat?.costoUnitario ?? mat?.costo_unitario ?? mat?.precioUnitario ?? mat?.precio_unitario ?? 0
        );
        const costoUnit = Number.isFinite(costoUnitNum) ? costoUnitNum : 0;
        const costoTotalNum = Number(mat?.costoTotal ?? mat?.costo_total ?? costoUnit * cantidad);
        const costoTotal = Number.isFinite(costoTotalNum) ? costoTotalNum : 0;
        const prev = map.get(key) || {
          material: nombre,
          unidad,
          cantidad: 0,
          costo: 0,
          actuacionesSet: new Set(),
        };
        prev.cantidad += cantidad;
        prev.costo += costoTotal;
        prev.actuacionesSet.add(cod);
        map.set(key, prev);
      });
    });
    return Array.from(map.values())
      .map((x) => ({ ...x, actuaciones: x.actuacionesSet.size }))
      .sort((a, b) => b.cantidad - a.cantidad || b.costo - a.costo);
  }, [liquidacionesReporte]);

  const totalPaginasAct = Math.max(1, Math.ceil(liquidacionesReporte.length / REPORTES_PAGE_SIZE));
  const totalPaginasMat = Math.max(1, Math.ceil(reporteMateriales.length / REPORTES_PAGE_SIZE));
  const reporteActuacionesPagina = useMemo(() => {
    const start = (reportePaginaAct - 1) * REPORTES_PAGE_SIZE;
    return liquidacionesReporte.slice(start, start + REPORTES_PAGE_SIZE);
  }, [liquidacionesReporte, reportePaginaAct]);
  const reporteMaterialesPagina = useMemo(() => {
    const start = (reportePaginaMat - 1) * REPORTES_PAGE_SIZE;
    return reporteMateriales.slice(start, start + REPORTES_PAGE_SIZE);
  }, [reporteMateriales, reportePaginaMat]);

  useEffect(() => {
    if (reportePaginaAct > totalPaginasAct) setReportePaginaAct(totalPaginasAct);
  }, [reportePaginaAct, totalPaginasAct]);

  useEffect(() => {
    if (reportePaginaMat > totalPaginasMat) setReportePaginaMat(totalPaginasMat);
  }, [reportePaginaMat, totalPaginasMat]);

  const descargarCsv = (filename, headers, rows) => {
    const escapeCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(escapeCsv).join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const imprimirReporteActuaciones = () => {
    const rows = liquidacionesReporte
      .map((item, idx) => {
        const tecnico = item.liquidacion?.tecnicoLiquida || item.tecnico || "-";
        const monto = Number(item.liquidacion?.montoCobrado || item.montoCobrado || 0);
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escHtml(item.fechaLiquidacion || "-")}</td>
          <td>${escHtml(item.codigo || "-")}</td>
          <td>${escHtml(item.tipoActuacion || "-")}</td>
          <td>${escHtml(item.nombre || "-")}</td>
          <td>${escHtml(item.dni || "-")}</td>
          <td>${escHtml(item.nodo || "-")}</td>
          <td>${escHtml(tecnico)}</td>
          <td>S/ ${monto.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reporte de actuaciones</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:18px;color:#111827}
    h1{margin:0 0 8px 0;font-size:22px}
    p{margin:4px 0 10px 0;color:#374151}
    .kpi{margin:10px 0 14px 0;font-size:13px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #d7e2f3;padding:6px;text-align:left;vertical-align:top}
    th{background:#eef4ff}
  </style>
</head>
<body>
  <h1>Reporte de actuaciones</h1>
  <p>Generado: ${escHtml(new Date().toLocaleString("es-PE"))}</p>
  <p>Filtro nodo: ${escHtml(reporteNodo === "TODOS" ? "Todos" : reporteNodo)} | Filtro tecnico: ${escHtml(
      reporteTecnico === "TODOS" ? "Todos" : reporteTecnico
    )} | Tipo: ${escHtml(reporteTipo)}</p>
  <div class="kpi">
    Actuaciones: <b>${liquidacionesReporte.length}</b> |
    Instalaciones: <b>${reporteResumen.instalaciones}</b> |
    Incidencias: <b>${reporteResumen.incidencias}</b> |
    Costo actuaciones: <b>S/ ${Number(reporteResumen.costoActuacion || 0).toFixed(2)}</b> |
    Monto cobrado: <b>S/ ${Number(reporteResumen.montoCobrado || 0).toFixed(2)}</b>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Fecha</th>
        <th>Codigo</th>
        <th>Tipo actuacion</th>
        <th>Cliente</th>
        <th>DNI</th>
        <th>Nodo</th>
        <th>Tecnico</th>
        <th>Monto</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

    imprimirHtmlMismaPestana(html);
  };

  const imprimirReporteMateriales = () => {
    const rows = reporteMateriales
      .map(
        (item, idx) => `<tr>
      <td>${idx + 1}</td>
      <td>${escHtml(item.material)}</td>
      <td>${escHtml(item.unidad)}</td>
      <td>${Number(item.cantidad || 0).toFixed(2)}</td>
      <td>S/ ${Number(item.costo || 0).toFixed(2)}</td>
      <td>${Number(item.actuaciones || 0)}</td>
    </tr>`
      )
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reporte de materiales usados</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:18px;color:#111827}
    h1{margin:0 0 8px 0;font-size:22px}
    p{margin:4px 0 10px 0;color:#374151}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #d7e2f3;padding:6px;text-align:left;vertical-align:top}
    th{background:#eef4ff}
  </style>
</head>
<body>
  <h1>Reporte de materiales usados</h1>
  <p>Generado: ${escHtml(new Date().toLocaleString("es-PE"))}</p>
  <p>Rango: ${escHtml(reporteDesde || "-")} a ${escHtml(reporteHasta || "-")} | Nodo: ${escHtml(
      reporteNodo === "TODOS" ? "Todos" : reporteNodo
    )} | Tecnico: ${escHtml(reporteTecnico === "TODOS" ? "Todos" : reporteTecnico)}</p>
  <p>Total materiales distintos: <b>${reporteMateriales.length}</b> | Costo total: <b>S/ ${reporteMateriales
      .reduce((acc, x) => acc + Number(x.costo || 0), 0)
      .toFixed(2)}</b></p>
  <table>
    <thead>
      <tr><th>#</th><th>Material</th><th>Unidad</th><th>Cantidad</th><th>Costo</th><th>Actuaciones</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

    imprimirHtmlMismaPestana(html);
  };

  const exportarCsvActuaciones = () => {
    const rows = liquidacionesReporte.map((item) => [
      item.fechaLiquidacion || "-",
      item.codigo || "-",
      item.tipoActuacion || "-",
      item.nombre || "-",
      item.dni || "-",
      item.nodo || "-",
      item.liquidacion?.tecnicoLiquida || item.tecnico || "-",
      Number(item.liquidacion?.montoCobrado || item.montoCobrado || 0).toFixed(2),
    ]);
    descargarCsv("reporte_actuaciones.csv", ["Fecha", "Codigo", "Tipo actuacion", "Cliente", "DNI", "Nodo", "Tecnico", "Monto"], rows);
  };

  const exportarCsvMateriales = () => {
    const rows = reporteMateriales.map((item) => [
      item.material || "-",
      item.unidad || "-",
      Number(item.cantidad || 0).toFixed(2),
      Number(item.costo || 0).toFixed(2),
      Number(item.actuaciones || 0),
    ]);
    descargarCsv("reporte_materiales.csv", ["Material", "Unidad", "Cantidad", "Costo", "Actuaciones"], rows);
  };

  const ordenesMapaFiltradas = useMemo(() => {
    return ordenes
      .filter((item) => esEstadoOperativoOrden(item?.estado))
      .filter((item) => parseCoords(item.ubicacion))
      .filter((item) =>
        fechaDentroDeRango(item.fechaActuacion, fechaMapaDesde, fechaMapaHasta)
      )
      .map((item) => ({
        ...item,
        coords: parseCoords(item.ubicacion),
      }));
  }, [ordenes, fechaMapaDesde, fechaMapaHasta]);

  // Mapa interactivo en formulario Crear orden
  useEffect(() => {
    if (vistaActiva !== "crear") {
      if (mapaCrearInstanceRef.current) {
        mapaCrearInstanceRef.current.remove();
        mapaCrearInstanceRef.current = null;
        mapaCrearMarkerRef.current = null;
      }
      return;
    }

    const DEFAULT_COORDS = [-16.43849, -71.598208];
    const coords = parseCoords(orden.ubicacion) ?? DEFAULT_COORDS;

    const crearMapa = (node) => {
      if (mapaCrearInstanceRef.current) {
        mapaCrearInstanceRef.current.invalidateSize();
        return;
      }
      const map = L.map(node, { zoomControl: true }).setView(coords, 16);
      const tileNormal = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20,
      });
      const tileSatelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri",
        maxZoom: 19,
      });
      tileNormal.addTo(map);

      let sateliteActivo = false;
      const toggleBtn = L.control({ position: "topright" });
      toggleBtn.onAdd = () => {
        const btn = L.DomUtil.create("button", "");
        btn.title = "Cambiar vista";
        btn.style.cssText = "background:#fff;border:2px solid rgba(0,0,0,0.2);border-radius:8px;padding:5px 8px;cursor:pointer;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,0.2);line-height:1;";
        btn.innerHTML = "🛰️";
        L.DomEvent.on(btn, "click", (e) => {
          L.DomEvent.stopPropagation(e);
          sateliteActivo = !sateliteActivo;
          if (sateliteActivo) { map.removeLayer(tileNormal); tileSatelite.addTo(map); btn.innerHTML = "🗺️"; btn.title = "Vista normal"; }
          else { map.removeLayer(tileSatelite); tileNormal.addTo(map); btn.innerHTML = "🛰️"; btn.title = "Vista satelital"; }
        });
        return btn;
      };
      toggleBtn.addTo(map);

      const marker = L.marker(coords, { icon: markerIcon, draggable: true }).addTo(map);
      marker.on("dragend", (e) => {
        const { lat, lng } = e.target.getLatLng();
        handleChange("ubicacion", `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      });
      map.on("click", (e) => {
        const { lat, lng } = e.latlng;
        handleChange("ubicacion", `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        marker.setLatLng([lat, lng]);
      });

      mapaCrearInstanceRef.current = map;
      mapaCrearMarkerRef.current = marker;
      map.invalidateSize();
    };

    // Si el div ya está en el DOM con tamaño, inicializar de inmediato
    if (mapaCrearRef.current && mapaCrearRef.current.offsetHeight > 0) {
      crearMapa(mapaCrearRef.current);
    } else {
      // Sino, hacer polling hasta que aparezca
      const timer = setInterval(() => {
        if (mapaCrearRef.current && mapaCrearRef.current.offsetHeight > 0) {
          clearInterval(timer);
          crearMapa(mapaCrearRef.current);
        }
      }, 50);
      setTimeout(() => clearInterval(timer), 5000);
      return () => clearInterval(timer);
    }
  }, [vistaActiva]);

  // Sincronizar marcador cuando cambia ubicacion desde input o GPS
  useEffect(() => {
    if (!mapaCrearInstanceRef.current || !mapaCrearMarkerRef.current) return;
    const coords = parseCoords(orden.ubicacion);
    if (!coords) return;
    mapaCrearMarkerRef.current.setLatLng(coords);
    mapaCrearInstanceRef.current.setView(coords, 16);
  }, [orden.ubicacion]);

  // Cargar cajas NAP para el mapa de crear orden
  useEffect(() => {
    if (napCajasMapData.length) return;
    supabase.from("nap_cajas")
      .select("id,codigo,sector,nodo,lat,lng,capacidad,puertos_ocupados,estado,empresa")
      .not("lat", "is", null).not("lng", "is", null)
      .then(({ data }) => { if (data?.length) setNapCajasMapData(data); });
  }, [napCajasMapData.length]);

  // Pintar marcadores NAP en el mapa de crear orden (solo las 20 más cercanas)
  useEffect(() => {
    if (!mapaCrearInstanceRef.current || !napCajasTop20.length) return;
    napMarkersCrearRef.current.forEach(m => m.remove());
    napMarkersCrearRef.current = [];
    napCajasTop20.forEach(caja => {
      const p = caja.capacidad ? Math.round((caja.puertos_ocupados || 0) / caja.capacidad * 100) : 0;
      const color = p >= 90 ? "#dc2626" : p >= 70 ? "#ea580c" : "#0284c7";
      const sel = orden.cajaNap === caja.codigo;
      const uid = caja.codigo.replace(/[^a-z0-9]/gi, "");
      // Compact dark NAP box icon (portrait, like real enclosure)
      const sw = sel ? 28 : 22, sh = sel ? 40 : 32;
      const icon = L.divIcon({
        html: `<svg width="${sw}" height="${sh}" viewBox="0 0 22 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ns${uid}" x="-25%" y="-15%" width="150%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/>
    </filter>
  </defs>
  <!-- Anchor triangle -->
  <path d="M9 27 L11 31 L13 27Z" fill="#64748b"/>
  <!-- Box body -->
  <rect x="1" y="1" width="20" height="26" rx="2.5" fill="#cfd8dc" filter="url(#ns${uid})"/>
  <!-- Side bracket clips left -->
  <rect x="0" y="6"  width="2" height="5" rx="1" fill="#a8bcc5"/>
  <rect x="0" y="16" width="2" height="5" rx="1" fill="#a8bcc5"/>
  <!-- Side bracket clips right -->
  <rect x="20" y="6"  width="2" height="5" rx="1" fill="#a8bcc5"/>
  <rect x="20" y="16" width="2" height="5" rx="1" fill="#a8bcc5"/>
  <!-- Center panel ribs -->
  <rect x="4" y="5"  width="14" height="2" rx="0.8" fill="#a8bcc5"/>
  <rect x="4" y="8"  width="14" height="2" rx="0.8" fill="#a8bcc5"/>
  <rect x="4" y="11" width="14" height="2" rx="0.8" fill="#a8bcc5"/>
  <rect x="4" y="14" width="14" height="2" rx="0.8" fill="#a8bcc5"/>
  <rect x="4" y="17" width="14" height="2" rx="0.8" fill="#a8bcc5"/>
  <!-- Port row at bottom -->
  <circle cx="3.5"  cy="23" r="1.2" fill="${color}"/>
  <circle cx="6.5"  cy="23" r="1.2" fill="${color}"/>
  <circle cx="9.5"  cy="23" r="1.2" fill="${color}"/>
  <circle cx="12.5" cy="23" r="1.2" fill="${color}"/>
  <circle cx="15.5" cy="23" r="1.2" fill="#64748b"/>
  <circle cx="18.5" cy="23" r="1.2" fill="#64748b"/>
  <!-- Selected ring -->
  ${sel ? `<rect x="1" y="1" width="20" height="26" rx="2.5" fill="none" stroke="${color}" stroke-width="2"/>` : `<rect x="1" y="1" width="20" height="26" rx="2.5" fill="none" stroke="#64748b" stroke-width="0.8"/>`}
</svg>`,
        className: "", iconSize: [sw, sh], iconAnchor: [sw / 2, sh],
      });
      const popupBase = `<div style="min-width:180px"><b style="font-size:13px">${caja.codigo}</b><br><span style="font-size:11px;color:#6b7280">${[caja.sector,caja.nodo].filter(Boolean).join(' · ')}</span><br><span style="font-size:11px;color:${p>=90?'#dc2626':p>=70?'#ea580c':'#16a34a'};font-weight:700">${caja.puertos_ocupados||0}/${caja.capacidad||8} puertos${p>=90?' — LLENA':` (${(caja.capacidad||8)-(caja.puertos_ocupados||0)} libres)`}</span>`;
      const m = L.marker([caja.lat, caja.lng], { icon })
        .addTo(mapaCrearInstanceRef.current)
        .bindPopup(popupBase + `<br><small style="color:#6b7280">Clic para seleccionar</small></div>`, { maxWidth: 240 });
      m.on("click", () => {
        handleChange("cajaNap", caja.codigo);
        m.setPopupContent(popupBase + `<br><span style="font-size:11px;color:#6b7280">Cargando clientes...</span></div>`);
        m.openPopup();
        supabase.from("clientes").select("nombre,dni").eq("caja_nap", caja.codigo).order("nombre")
          .then(({ data }) => {
            const lista = data || [];
            const clientesHtml = lista.length > 0
              ? `<div style="margin-top:6px;border-top:1px solid #e5e7eb;padding-top:4px"><b style="font-size:11px;color:#92400e">Clientes (${lista.length}):</b><br>${lista.map(c => `<span style="font-size:10px;display:block">${c.nombre||'-'}<span style="color:#9ca3af;margin-left:6px">${c.dni||''}</span></span>`).join('')}</div>`
              : `<div style="margin-top:4px;font-size:10px;color:#9ca3af">Sin clientes registrados en esta caja.</div>`;
            m.setPopupContent(popupBase + clientesHtml + `</div>`);
          });
      });
      napMarkersCrearRef.current.push(m);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [napCajasTop20, orden.cajaNap, mapaCrearInstanceRef.current]);

  // Calcular cajas NAP más cercanas al cliente
  useEffect(() => {
    if (!napCajasMapData.length) return;
    const coords = parseCoords(orden.ubicacion);
    if (!coords) { setNapCajasNearby([]); setNapCajasTop20([]); return; }
    const [lat, lng] = coords;
    const sorted = napCajasMapData
      .map(c => ({ ...c, dist: haversineM(lat, lng, c.lat, c.lng) }))
      .sort((a, b) => a.dist - b.dist);
    setNapCajasTop20(sorted.slice(0, 20));
    setNapCajasNearby(sorted.slice(0, 5));
    if (!ordenEditandoId && !orden.cajaNap && !cajaNapDesdClienteRef.current && sorted.length) {
      handleChange("cajaNap", sorted[0].codigo);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden.ubicacion, napCajasMapData]);

  // Dibujar líneas rectas cliente → cajas NAP cercanas
  useEffect(() => {
    napRouteLayersRef.current.forEach(l => l.remove());
    napRouteLayersRef.current = [];
    if (!napCajasNearby.length || !mapaCrearInstanceRef.current) return;
    const clientCoords = parseCoords(orden.ubicacion);
    if (!clientCoords) return;
    const [clat, clng] = clientCoords;

    const results = {};
    napCajasNearby.forEach(caja => {
      const dist = haversineM(clat, clng, caja.lat, caja.lng);
      results[caja.codigo] = { dist };
      const p = caja.capacidad ? Math.round((caja.puertos_ocupados || 0) / caja.capacidad * 100) : 0;
      const color = p >= 90 ? "#dc2626" : p >= 70 ? "#ea580c" : "#0284c7";
      const isSel = orden.cajaNap === caja.codigo;
      const line = L.polyline([[clat, clng], [caja.lat, caja.lng]], {
        color,
        weight: isSel ? 3 : 1.5,
        opacity: isSel ? 0.9 : 0.35,
        dashArray: isSel ? "8,4" : "4,6",
      }).addTo(mapaCrearInstanceRef.current);
      napRouteLayersRef.current.push(line);
    });
    setNapRoutes(results);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [napCajasNearby]);

  // Redibujar opacidad/grosor de rutas al cambiar selección
  useEffect(() => {
    if (!napRouteLayersRef.current.length || !napCajasNearby.length) return;
    napRouteLayersRef.current.forEach((line, i) => {
      const caja = napCajasNearby[i];
      if (!caja) return;
      const isSel = orden.cajaNap === caja.codigo;
      line.setStyle({ weight: isSel ? 4 : 2, opacity: isSel ? 0.85 : 0.3, dashArray: isSel ? null : "7,5" });
      if (isSel) line.bringToFront();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden.cajaNap]);

  useEffect(() => {
    if (vistaActiva !== "mapa") return;
    if (!mapaRef.current) return;
    if (ordenesMapaFiltradas.length === 0) return;

    const mapNode = mapaRef.current;

    if (!mapaInstanciaRef.current) {
      mapaInstanciaRef.current = L.map(mapNode).setView(
        ordenesMapaFiltradas[0].coords,
        13
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapaInstanciaRef.current);
    } else {
      mapaInstanciaRef.current.setView(ordenesMapaFiltradas[0].coords, 13);
    }

    mapaMarkersRef.current.forEach((marker) => {
      if (mapaInstanciaRef.current) {
        mapaInstanciaRef.current.removeLayer(marker);
      }
    });
    mapaMarkersRef.current = [];

    ordenesMapaFiltradas.forEach((item) => {
      const marker = L.marker(item.coords, { icon: markerIcon }).addTo(
        mapaInstanciaRef.current
      );

      const popupHtml = `
        <div style="min-width:220px;">
          <div style="font-weight:700;font-size:15px;">${item.nombre || "Sin cliente"}</div>
          <div style="font-size:13px;margin-top:6px;color:#374151;">Código: ${item.codigo || "-"}</div>
          <div style="font-size:13px;margin-top:4px;color:#374151;">Dirección: ${item.direccion || "-"}</div>
          <div style="font-size:13px;margin-top:4px;color:#374151;">Celular: ${item.celular || "-"}</div>
          <div style="font-size:13px;margin-top:4px;color:#374151;">Técnico: ${item.tecnico || "-"}</div>
          <div style="font-size:13px;margin-top:4px;color:#374151;">Fecha: ${item.fechaActuacion || "-"}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            <button id="llamar-${item.id}" style="background:#2563eb;color:#fff;border:none;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:12px;font-weight:600;">Llamar</button>
            <button id="whatsapp-${item.id}" style="background:#25D366;color:#fff;border:none;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:12px;font-weight:600;">WhatsApp</button>
            <button id="navegar-${item.id}" style="background:#1f3a8a;color:#fff;border:none;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:12px;font-weight:600;">Navegar</button>
            <button id="liquidar-${item.id}" style="background:#059669;color:#fff;border:none;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:12px;font-weight:600;">Liquidar</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on("popupopen", () => {
        const llamarBtn = document.getElementById(`llamar-${item.id}`);
        const whatsappBtn = document.getElementById(`whatsapp-${item.id}`);
        const navegarBtn = document.getElementById(`navegar-${item.id}`);
        const liquidarBtn = document.getElementById(`liquidar-${item.id}`);

        if (llamarBtn) llamarBtn.onclick = () => llamarCliente(item.celular);
        if (whatsappBtn) whatsappBtn.onclick = () => abrirWhatsApp(item.celular);
        if (navegarBtn) navegarBtn.onclick = () => navegarRuta(item.ubicacion, item.direccion);
        if (liquidarBtn) liquidarBtn.onclick = () => abrirLiquidacion(item);
      });

      mapaMarkersRef.current.push(marker);
    });

    setTimeout(() => {
      if (mapaInstanciaRef.current) {
        mapaInstanciaRef.current.invalidateSize();
      }
    }, 100);
  }, [vistaActiva, ordenesMapaFiltradas]);

  const isMobile = typeof window !== "undefined" ? window.innerWidth < 900 : false;

  const pageStyle = {
    minHeight: "100vh",
    background: "#f4f6fb",
    padding: "32px 16px",
    fontFamily: "Inter, Arial, sans-serif",
    color: "#111827",
  };

  const containerStyle = {
    maxWidth: "1280px",
    margin: "0 auto",
  };

  const headerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    marginBottom: "24px",
    flexWrap: "wrap",
  };

  const titleStyle = {
    margin: 0,
    fontSize: "32px",
    fontWeight: "700",
    color: "#17428a",
  };

  const subtitleStyle = {
    margin: "6px 0 0 0",
    color: "#5e718f",
    fontSize: "14px",
  };

  const menuButton = (active) => ({
    background: active ? "#2b5fb8" : "#ffffff",
    color: active ? "#ffffff" : "#1f2937",
    border: "1px solid #d2def2",
    borderRadius: "12px",
    padding: "12px 18px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  });

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
    gap: "24px",
  };

  const cardStyle = {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 8px 22px -20px rgba(17, 47, 94, 0.35)",
    border: "1px solid #e4eaf4",
  };

  const sectionTitleStyle = {
    margin: "0 0 18px 0",
    fontSize: "18px",
    fontWeight: "700",
    color: "#163f86",
  };

  const formGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
  };

  const fullWidth = {
    gridColumn: "1 / -1",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "8px",
    fontSize: "13px",
    fontWeight: "600",
    color: "#36577f",
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #dbe3ee",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#1f3656",
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: "100px",
    resize: "vertical",
  };

  const primaryButton = {
    background: "#2b5fb8",
    color: "#fff",
    border: "1px solid #2b5fb8",
    borderRadius: "12px",
    padding: "12px 18px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  };

  const secondaryButton = {
    background: "#ffffff",
    color: "#17428a",
    border: "1px solid #dbe3ee",
    borderRadius: "12px",
    padding: "12px 18px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
  };

  const successButton = {
    background: "#20945d",
    color: "#fff",
    border: "1px solid #1a8f53",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
  };

  const warningButton = {
    background: "#d48b1d",
    color: "#fff",
    border: "1px solid #ea7a00",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
  };

  const infoButton = {
    background: "#2b5fb8",
    color: "#fff",
    border: "1px solid #2b5fb8",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
  };

  const whatsappButton = {
    background: "#25D366",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
  };

  const dangerButton = {
    background: "#fff",
    color: "#b91c1c",
    border: "1px solid #f7d0c8",
    borderRadius: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
  };

  const badgeStyle = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#eef4ff",
    color: "#184ca8",
    fontSize: "12px",
    fontWeight: "600",
  };

  const badgeSuccess = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#166534",
    fontSize: "12px",
    fontWeight: "600",
  };

  const getOrdenTipoBadge = (ordenTipo = "") => {
    const t = String(ordenTipo).toUpperCase();
    if (t.includes("INCIDENCIA"))    return { bg: "#fef2f2", color: "#dc2626", border: "#fecaca", label: "INCIDENCIA" };
    if (t.includes("RECUPERACION"))  return { bg: "#f0fdf4", color: "#16a34a", border: "#86efac", label: "RECUPERACIÓN" };
    if (t.includes("MANTENIMIENTO")) return { bg: "#fffbeb", color: "#d97706", border: "#fcd34d", label: "MANTENIMIENTO" };
    return { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "ORDEN SERVICIO" };
  };

  const getOrdenTipoBorderColor = (ordenTipo = "") => {
    const t = String(ordenTipo).toUpperCase();
    if (t.includes("INCIDENCIA"))    return "#dc2626";
    if (t.includes("RECUPERACION"))  return "#16a34a";
    if (t.includes("MANTENIMIENTO")) return "#d97706";
    return "#1d4ed8";
  };

  const badgeDanger = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: "12px",
    fontWeight: "600",
  };

  const badgeWarning = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#ffedd5",
    color: "#9a3412",
    fontSize: "12px",
    fontWeight: "600",
  };

  const prioridadColor = (p) => {
    if (p === "Urgente") return { background: "#fee2e2", color: "#991b1b" };
    if (p === "Alta") return { background: "#ffedd5", color: "#9a3412" };
    return { background: "#dcfce7", color: "#166534" };
  };

  const estadoEquipoColor = (estado) => {
    if (estado === "instalado") return badgeSuccess;
    if (estado === "asignado") return badgeStyle;
    return badgeWarning;
  };

  const lupaButtonStyle = {
    minWidth: "52px",
    borderRadius: "12px",
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    fontSize: "18px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const appShellStyle = {
    minHeight: "100vh",
    background: "#f5f6fb",
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "250px 1fr",
    gridTemplateRows: "64px 1fr",
    gridTemplateAreas: isMobile ? `"topbar" "content"` : `"sidebar topbar" "sidebar content"`,
  };

  const topbarStyle = {
    gridArea: "topbar",
    background: "#ffffff",
    borderBottom: "1px solid #eceef5",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 14px",
    position: "sticky",
    top: 0,
    zIndex: 20,
    boxShadow: "0 8px 20px -22px rgba(43, 45, 80, 0.35)",
  };

  const sessionMenuButtonStyle = {
    ...secondaryButton,
    padding: "10px 14px",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 600,
  };

  const sessionDropdownStyle = {
    position: "absolute",
    top: "calc(100% + 10px)",
    right: 0,
    width: "260px",
    background: "#ffffff",
    border: "1px solid #eceef5",
    borderRadius: "16px",
    boxShadow: "0 18px 40px -28px rgba(31, 41, 55, 0.45)",
    padding: "14px",
    display: "grid",
    gap: "12px",
  };

  const sidebarStyle = {
    gridArea: "sidebar",
    background: "#ffffff",
    color: "#69728a",
    borderRight: "1px solid #eceef5",
    display: isMobile ? "none" : "flex",
    flexDirection: "column",
    minHeight: "100vh",
  };

  const sidebarHeaderStyle = {
    padding: "14px 16px",
    borderBottom: "1px solid #eceef5",
    background: "#ffffff",
  };

  const userCardStyle = {
    padding: "12px 14px",
    borderBottom: "1px solid #eceef5",
    background: "#ffffff",
  };

  const sidebarBodyStyle = {
    padding: "12px 8px 16px 8px",
    overflowY: "auto",
    display: "grid",
    gap: "4px",
  };

  const sideMenuButton = (active, nested = false) => ({
    width: "100%",
    textAlign: "left",
    border: active ? "1px solid #ffd9a0" : "1px solid transparent",
    background: active ? "#fff6e9" : "transparent",
    color: active ? "#d98908" : "#5c657d",
    borderRadius: "10px",
    padding: nested ? "8px 10px 8px 26px" : "10px 12px",
    fontSize: nested ? "13px" : "15px",
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
  });

  const sideHistorialAppsheetButtonStyle = (active) => ({
    width: "100%",
    textAlign: "left",
    border: active ? "1px solid #ffd9a0" : "1px solid transparent",
    background: active ? "#fff6e9" : "transparent",
    color: active ? "#d98908" : "#5c657d",
    borderRadius: "10px",
    padding: "10px 12px",
    cursor: "pointer",
    boxShadow: "none",
  });

  const sideHistorialAppsheetSubmenuWrapStyle = {
    margin: "2px 0 4px 14px",
    padding: "2px 0 0 14px",
    borderLeft: "1px solid #eceef5",
    display: "grid",
    gap: "4px",
  };

  const sideHistorialAppsheetSubmenuButtonStyle = (active) => ({
    width: "100%",
    textAlign: "left",
    border: active ? "1px solid #ffd9a0" : "1px solid transparent",
    background: active ? "#fff6e9" : "transparent",
    color: active ? "#d98908" : "#7a859e",
    borderRadius: "10px",
    padding: "8px 10px",
    fontSize: "13px",
    fontWeight: active ? 700 : 600,
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "10px 1fr",
    alignItems: "center",
    gap: "8px",
  });

  const contentWrapStyle = {
    gridArea: "content",
    padding: isMobile ? "10px" : "14px 16px 18px 16px",
    overflow: "auto",
  };

  const contentSurfaceStyle = {
    background: "#ffffff",
    border: "1px solid #eceef5",
    borderRadius: "18px",
    padding: isMobile ? "10px" : "16px",
    minHeight: "calc(100vh - 96px)",
  };

  const renderSidebarIcon = (key, active = false, size = 14) => {
    const path = MENU_ICON_PATHS[key];
    const color = active ? "#d98908" : "#8b94ac";
    return (
      <span
        aria-hidden="true"
        style={{
          width: "22px",
          height: "22px",
          borderRadius: "7px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: active ? "1px solid #ffd9a0" : "1px solid #edf0f7",
          background: active ? "#fff2dc" : "#ffffff",
          flexShrink: 0,
        }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d={path || "M12 5V19M5 12H19"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  };

  const renderHistSubmenuIcon = (key, active = false, size = 12) => {
    const path = HIST_APPSHEET_SUBMENU_ICON_PATHS[key];
    const color = active ? "#d98908" : "#9ca7bf";
    return (
      <span
        aria-hidden="true"
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "6px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: active ? "1px solid #ffd9a0" : "1px solid #edf0f7",
          background: active ? "#fff2dc" : "#ffffff",
          flexShrink: 0,
        }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d={path || "M5 4H19V20H5V4"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  };

  const mainMenuItems = MENU_VISTAS_WEB.filter((item) => {
    if (!accesosSesion.includes(item.key)) return false;
    if (item.key === "almacenes" && !esAdminSesion) return false;
    return true;
  });
  const puedeGestionarSuspensionClientes = esAdminSesion || rolSesion === "Gestora";
  const diagnosticoMikrotik = diagnosticoServicioResultado?.mikrotik || null;
  const diagnosticoEstadoVisual = getDiagnosticoEstadoVisual(diagnosticoMikrotik?.estado);
  const clienteDiagnosticoRapidoInfo = clienteDiagnosticoRapido
    ? resolverDiagnosticoServicioDesdeCliente(clienteDiagnosticoRapido)
    : { dni: "", nodo: "", userPppoe: "", clienteNombre: "" };
  const diagnosticoRapidoMikrotik = clienteDiagnosticoRapidoResultado?.mikrotik || null;
  const diagnosticoRapidoEstadoVisual = getDiagnosticoEstadoVisual(diagnosticoRapidoMikrotik?.estado);

  if (!usuarioSesion && !usuariosSupabaseReady && isSupabaseConfigured) {
    return (
      <div style={{ ...pageStyle, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ color: "#6b7280", fontSize: "16px" }}>Cargando...</div>
      </div>
    );
  }

  if (!usuarioSesion) {
    return (
      <div style={pageStyle}>
        <div style={{ ...containerStyle, maxWidth: "460px", margin: "40px auto" }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
              <img
                src="/americanet-logo-clean.png"
                alt="Americanet"
                style={{ width: "220px", maxWidth: "100%", height: "auto", objectFit: "contain" }}
              />
            </div>
            <h1 style={{ ...titleStyle, marginBottom: "8px", fontSize: "30px" }}>Portal de ingreso</h1>
            <p style={{ ...subtitleStyle, marginBottom: "18px" }}>
              Ingresa con tu usuario y contrasena para continuar.
            </p>

            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Usuario</label>
                <input
                  style={inputStyle}
                  value={credencialesLogin.username}
                  onChange={(e) => setCredencialesLogin((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="usuario"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") iniciarSesion();
                  }}
                />
              </div>

              <div>
                <label style={labelStyle}>Contrasena</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={credencialesLogin.password}
                  onChange={(e) => setCredencialesLogin((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="******"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") iniciarSesion();
                  }}
                />
              </div>
            </div>

            {errorLogin ? (
              <div style={{ marginTop: "12px", color: "#b91c1c", fontSize: "13px", fontWeight: 600 }}>
                {errorLogin}
              </div>
            ) : null}

            {usuariosActivos.length === 0 ? (
              <div style={{ marginTop: "12px", color: "#b91c1c", fontSize: "13px", fontWeight: 600 }}>
                No hay usuarios activos para ingresar.
              </div>
            ) : null}

            <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={iniciarSesion}
                style={primaryButton}
                disabled={!credencialesLogin.username || !credencialesLogin.password || usuariosActivos.length === 0}
              >
                Ingresar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={appShellStyle}>
      <aside style={sidebarStyle}>
        <div style={sidebarHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
            <img
              src="/americanet-logo-clean.png"
              alt="Americanet"
              style={{ width: "180px", maxWidth: "100%", height: "auto", objectFit: "contain" }}
            />
          </div>
        </div>
        <div style={userCardStyle}>
          <div style={{ display: "grid", gap: "6px" }}>
            <div style={{ color: "#1d2e4f", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              {usuarioSesion?.nombre || "Sin sesion"}
            </div>
            <div style={{ color: "#7c88a4", fontSize: "13px", fontWeight: 600 }}>{rolSesion}</div>
          </div>
        </div>
        <div style={{ padding: "8px 12px", color: "#9ba4bb", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Menú
        </div>
        <div style={sidebarBodyStyle}>
          {mainMenuItems.map((item) => {
            if (item.key === "historialAppsheet") {
              const isHistorialAppsheetActive = vistaActiva === item.key;
              return (
                <div key={`side-wrap-${item.key}`} style={{ display: "grid", gap: "4px" }}>
                  <button
                    key={`side-${item.key}`}
                    type="button"
                    style={sideHistorialAppsheetButtonStyle(isHistorialAppsheetActive)}
                    onClick={() => setVistaActiva(item.key)}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        {renderSidebarIcon(item.key, isHistorialAppsheetActive)}
                        <span style={{ display: "grid", gap: "2px", minWidth: 0 }}>
                          <span style={{ fontSize: "15px", fontWeight: isHistorialAppsheetActive ? 700 : 500 }}>{item.label}</span>
                          {isHistorialAppsheetActive && historialAppsheetSubmenuActual ? (
                            <span style={{ fontSize: "11px", color: "#98a3b9", letterSpacing: "0.02em" }}>
                              {historialAppsheetSubmenuActual.sideLabel || historialAppsheetSubmenuActual.label}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          lineHeight: 1,
                          color: isHistorialAppsheetActive ? "#d98908" : "#a4afc5",
                          transform: isHistorialAppsheetActive ? "rotate(90deg)" : "rotate(0deg)",
                          transition: "transform 140ms ease",
                        }}
                      >
                        {">"}
                      </span>
                    </span>
                  </button>
                  {isHistorialAppsheetActive ? (
                    <div style={sideHistorialAppsheetSubmenuWrapStyle}>
                      {historialAppsheetSubmenuItemsPermitidos.map((submenu) => (
                        <button
                          key={`sub-hist-${submenu.key}`}
                          type="button"
                          style={sideHistorialAppsheetSubmenuButtonStyle(historialAppsheetSubmenu === submenu.key)}
                          onClick={() => setHistorialAppsheetSubmenu(submenu.key)}
                        >
                          {renderHistSubmenuIcon(submenu.key, historialAppsheetSubmenu === submenu.key)}
                          <span>{submenu.sideLabel || submenu.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <div key={`side-wrap-${item.key}`} style={{ display: "grid", gap: "2px" }}>
                <button key={`side-${item.key}`} type="button" style={sideMenuButton(vistaActiva === item.key)} onClick={() => setVistaActiva(item.key)}>
                  <span style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "flex-start" }}>
                    {renderSidebarIcon(item.key, vistaActiva === item.key)}
                    <span>{item.label}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <header style={topbarStyle}>
        <div style={{ fontSize: "22px", fontWeight: 700, color: "#2a3140", letterSpacing: "-0.01em" }}>
          {vistaActiva === "historialAppsheet" ? "Historial AppSheet" : "Gestión de Órdenes"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ position: "relative" }} ref={sessionMenuRef}>
            <button type="button" onClick={() => setMostrarMenuSesion((prev) => !prev)} style={sessionMenuButtonStyle}>
              <span style={{ color: "#1d2e4f", fontWeight: 700 }}>{usuarioSesion?.nombre || "Sesión"}</span>
              <span style={{ color: "#7c88a4", fontSize: "12px" }}>{mostrarMenuSesion ? "▲" : "▼"}</span>
            </button>
            {mostrarMenuSesion ? (
              <div style={sessionDropdownStyle}>
                <div style={{ display: "grid", gap: "2px" }}>
                  <div style={{ color: "#1d2e4f", fontWeight: 700, fontSize: "14px" }}>Sesión</div>
                  <div style={{ color: "#7c88a4", fontSize: "12px" }}>Configura el cierre automático por inactividad.</div>
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Minutos sin actividad</label>
                  <select
                    value={String(sessionIdleMinutes)}
                    onChange={(e) => setSessionIdleMinutes(Number(e.target.value))}
                    style={{ ...inputStyle, margin: 0 }}
                  >
                    {[5, 10, 15, 30, 45, 60, 90].map((minutes) => (
                      <option key={`idle-${minutes}`} value={minutes}>
                        {minutes} minutos
                      </option>
                    ))}
                    <option value="0">Nunca cerrar</option>
                  </select>
                </div>
                <div style={{ color: "#98a3b9", fontSize: "12px", lineHeight: 1.4 }}>
                  Actual: {sessionIdleMinutes > 0 ? `${sessionIdleMinutes} min` : "Sin cierre automático"}.
                </div>
                {cambiandoClave ? (
                  <div style={{ display: "grid", gap: "6px" }}>
                    <div style={{ color: "#1d2e4f", fontWeight: 600, fontSize: "13px" }}>Cambiar contraseña</div>
                    <input
                      type="password"
                      placeholder="Contraseña actual"
                      style={{ ...inputStyle, margin: 0, fontSize: "12px" }}
                      value={cambioClaveForm.actual}
                      onChange={(e) => setCambioClaveForm((p) => ({ ...p, actual: e.target.value }))}
                    />
                    <input
                      type="password"
                      placeholder="Nueva contraseña"
                      style={{ ...inputStyle, margin: 0, fontSize: "12px" }}
                      value={cambioClaveForm.nueva}
                      onChange={(e) => setCambioClaveForm((p) => ({ ...p, nueva: e.target.value }))}
                    />
                    <input
                      type="password"
                      placeholder="Confirmar nueva"
                      style={{ ...inputStyle, margin: 0, fontSize: "12px" }}
                      value={cambioClaveForm.confirmar}
                      onChange={(e) => setCambioClaveForm((p) => ({ ...p, confirmar: e.target.value }))}
                    />
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        style={{ ...primaryButton, flex: 1, fontSize: "12px", padding: "5px" }}
                        onClick={async () => {
                          if (!cambioClaveForm.actual || !cambioClaveForm.nueva || !cambioClaveForm.confirmar) {
                            alert("Completa todos los campos."); return;
                          }
                          if (cambioClaveForm.nueva !== cambioClaveForm.confirmar) {
                            alert("La nueva contraseña no coincide."); return;
                          }
                          if (cambioClaveForm.nueva.length < 4) {
                            alert("La contraseña debe tener al menos 4 caracteres."); return;
                          }
                          // Verificar contraseña actual contra Supabase (fuente de verdad)
                          const usernameVerif = String(usuarioSesion?.username || "").trim().toLowerCase();
                          if (isSupabaseConfigured && usernameVerif) {
                            const { data: dbUser } = await supabase.from(USUARIOS_TABLE).select("password").eq("username", usernameVerif).maybeSingle();
                            const passDb = dbUser?.password ?? usuarioSesion?.password ?? "";
                            if (passDb !== cambioClaveForm.actual) {
                              alert("La contraseña actual es incorrecta."); return;
                            }
                          } else if (usuarioSesion?.password !== cambioClaveForm.actual) {
                            alert("La contraseña actual es incorrecta."); return;
                          }
                          const nuevaPass = cambioClaveForm.nueva.trim();
                          const usernameActual = String(usuarioSesion.username || "").trim().toLowerCase();
                          if (isSupabaseConfigured) {
                            // Usar el mismo patrón que cambiarEstadoUsuario — UPDATE directo con supabaseId
                            const usuarioLocal = usuarios.find((u) => String(u.username || "").trim().toLowerCase() === usernameActual);
                            const supabaseId = usuarioLocal?.supabaseId ?? usuarioLocal?.id;
                            let guardado = false;
                            if (supabaseId) {
                              const { error } = await supabase.from(USUARIOS_TABLE).update({ password: nuevaPass }).eq("id", supabaseId);
                              if (error) { alert("Error al guardar: " + error.message); return; }
                              guardado = true;
                            }
                            if (!guardado) {
                              const { error } = await supabase.from(USUARIOS_TABLE).update({ password: nuevaPass }).eq("username", usernameActual);
                              if (error) { alert("Error al guardar: " + error.message); return; }
                            }
                          }
                          // Actualizar estado local bloqueando el timer de sync para no sobreescribir
                          usuariosHydratingRef.current = true;
                          setUsuarios((prev) => prev.map((u) => String(u.username || "").trim().toLowerCase() === usernameActual ? { ...u, password: nuevaPass } : u));
                          setTimeout(() => { usuariosHydratingRef.current = false; }, 200);
                          setCambioClaveForm({ actual: "", nueva: "", confirmar: "" });
                          setCambiandoClave(false);
                          alert("Contraseña actualizada correctamente.");
                        }}
                      >
                        Guardar
                      </button>
                      <button type="button" style={{ ...secondaryButton, fontSize: "12px", padding: "5px" }} onClick={() => { setCambiandoClave(false); setCambioClaveForm({ actual: "", nueva: "", confirmar: "" }); }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" style={{ ...secondaryButton, width: "100%", fontSize: "12px" }} onClick={() => setCambiandoClave(true)}>
                    Cambiar contraseña
                  </button>
                )}
                <button type="button" onClick={() => cerrarSesion()} style={{ ...secondaryButton, width: "100%" }}>
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main style={contentWrapStyle} ref={contentWrapRef}>
        {isMobile ? (
          <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "10px", paddingBottom: "4px" }}>
            {mainMenuItems.map((item) => (
              <button key={`mob-${item.key}`} type="button" style={menuButton(vistaActiva === item.key)} onClick={() => setVistaActiva(item.key)}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  {renderSidebarIcon(item.key, vistaActiva === item.key, 12)}
                  <span>{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div style={contentSurfaceStyle}>

        {vistaActiva === "dashboard" && (() => {
          const today = todayIsoLocal();
          // Filtrar por nodo según permisos (igual que el resto de vistas)
          const ordenesPorNodo = ordenes.filter((o) => tieneAccesoNodoSesion(o.nodo));
          const liqPorNodo = liquidaciones.filter((l) => tieneAccesoNodoSesion(firstText(l.nodo, l.payload?.nodo, l.payload?.Nodo)));

          const pendientesTotal = ordenesPorNodo.filter((o) => String(o.estado || "").toLowerCase().includes("pendient"));
          const enProcesoTotal = ordenesPorNodo.filter((o) => String(o.estado || "").toLowerCase().includes("proceso"));
          const urgentes = ordenesPorNodo.filter((o) => esEstadoOperativoOrden(o.estado) && String(o.prioridad || "").toLowerCase().includes("urgent"));
          const liquidadasHoy = liqPorNodo.filter((l) => {
            const f = String(l.fecha || l.fechaLiquidacion || l.created_at || "").slice(0, 10);
            return f === today;
          });

          // Por tipo (pendientes+en proceso)
          const operativas = [...pendientesTotal, ...enProcesoTotal];
          const tiposCount = {};
          operativas.forEach((o) => {
            const t = o.tipoActuacion || "Sin tipo";
            tiposCount[t] = (tiposCount[t] || 0) + 1;
          });
          const tiposOrdenados = Object.entries(tiposCount).sort((a, b) => b[1] - a[1]);
          const maxTipo = tiposOrdenados[0]?.[1] || 1;

          // Por nodo
          const nodosCount = {};
          operativas.forEach((o) => {
            const n = o.nodo || "Sin nodo";
            nodosCount[n] = (nodosCount[n] || 0) + 1;
          });

          // Por técnico
          const tecnicosCount = {};
          operativas.forEach((o) => {
            const t = o.tecnico || "Sin asignar";
            tecnicosCount[t] = (tecnicosCount[t] || 0) + 1;
          });
          const tecnicosOrdenados = Object.entries(tecnicosCount).sort((a, b) => b[1] - a[1]);

          // Últimas órdenes (operativas más recientes primeras)
          const ultimasOrdenes = [...operativas]
            .sort((a, b) => new Date(b.fechaActuacion || 0) - new Date(a.fechaActuacion || 0))
            .slice(0, 10);

          const TIPO_COLORS = {
            "Instalacion Internet": "#2b5fb8",
            "Instalacion Internet y Cable": "#1e40af",
            "Instalacion TV": "#7c3aed",
            "Incidencia Internet": "#dc2626",
            "Mantenimiento": "#d97706",
            "Recojo de equipo": "#059669",
          };
          const NODO_COLORS = {
            Nod_01: "#2b5fb8", Nod_02: "#7c3aed", Nod_03: "#059669",
            Nod_04: "#d97706", Nod_05: "#dc2626", Nod_06: "#0891b2",
          };

          const kpiCard = (label, value, color, sub) => (
            <div key={label} style={{
              background: "#fff", borderRadius: "14px", padding: "18px 20px",
              border: "1px solid #e4eaf4", boxShadow: "0 1px 4px rgba(43,95,184,0.07)",
            }}>
              <div style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500, marginBottom: "6px" }}>{label}</div>
              <div style={{ fontSize: "32px", fontWeight: "800", color, lineHeight: 1 }}>{value}</div>
              {sub && <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "6px" }}>{sub}</div>}
            </div>
          );

          return (
            <div style={{ display: "grid", gap: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Dashboard</h2>
                <span style={{ fontSize: "13px", color: "#6b7280", background: "#f3f6fb", padding: "4px 12px", borderRadius: "20px" }}>
                  {new Date().toLocaleDateString("es-PE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </span>
              </div>

              {/* KPI Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "14px" }}>
                {kpiCard("Pendientes", pendientesTotal.length, "#2b5fb8", "sin ejecutar")}
                {kpiCard("En proceso", enProcesoTotal.length, "#d97706", "en ejecución")}
                {kpiCard("Urgentes", urgentes.length, "#dc2626", "prioridad alta")}
                {kpiCard("Liquidadas hoy", liquidadasHoy.length, "#059669", "completadas hoy")}
                {kpiCard("Total clientes", clientesPorNodo.length, "#7c3aed", "registrados")}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {/* Por tipo */}
                <div style={cardStyle}>
                  <h3 style={{ ...sectionTitleStyle, fontSize: "15px", marginBottom: "14px" }}>Por tipo de actuación</h3>
                  {tiposOrdenados.length === 0 ? (
                    <p style={{ color: "#9ca3af", margin: 0, fontSize: "13px" }}>Sin órdenes activas</p>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {tiposOrdenados.map(([tipo, cnt]) => (
                        <div key={tipo}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                            <span style={{ fontSize: "13px", color: "#374151" }}>{tipo}</span>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: TIPO_COLORS[tipo] || "#6b7280" }}>{cnt}</span>
                          </div>
                          <div style={{ height: "6px", background: "#f0f4fb", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{
                              height: "100%", borderRadius: "3px",
                              width: `${Math.round((cnt / maxTipo) * 100)}%`,
                              background: TIPO_COLORS[tipo] || "#6b7280",
                              transition: "width 0.4s ease",
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Por nodo */}
                <div style={cardStyle}>
                  <h3 style={{ ...sectionTitleStyle, fontSize: "15px", marginBottom: "14px" }}>Pendientes por nodo</h3>
                  {Object.keys(nodosCount).length === 0 ? (
                    <p style={{ color: "#9ca3af", margin: 0, fontSize: "13px" }}>Sin órdenes activas</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "10px" }}>
                      {Object.entries(nodosCount).sort((a, b) => b[1] - a[1]).map(([nodo, cnt]) => (
                        <div key={nodo} style={{
                          background: "#f3f6fb", borderRadius: "10px", padding: "12px 14px",
                          borderLeft: `4px solid ${NODO_COLORS[nodo] || "#6b7280"}`,
                        }}>
                          <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>{nodo}</div>
                          <div style={{ fontSize: "24px", fontWeight: "800", color: NODO_COLORS[nodo] || "#374151" }}>{cnt}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Por técnico */}
              <div style={cardStyle}>
                <h3 style={{ ...sectionTitleStyle, fontSize: "15px", marginBottom: "14px" }}>Carga por técnico</h3>
                {tecnicosOrdenados.length === 0 ? (
                  <p style={{ color: "#9ca3af", margin: 0, fontSize: "13px" }}>Sin órdenes activas</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
                    {tecnicosOrdenados.map(([tec, cnt]) => {
                      const maxTec = tecnicosOrdenados[0][1];
                      return (
                        <div key={tec} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{
                            width: "32px", height: "32px", borderRadius: "50%",
                            background: "#e8eef8", display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: "13px", fontWeight: "700",
                            color: "#2b5fb8", flexShrink: 0,
                          }}>
                            {String(tec).slice(0, 1).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: "13px", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tec}</span>
                              <span style={{ fontSize: "13px", fontWeight: "700", color: "#2b5fb8", flexShrink: 0 }}>{cnt}</span>
                            </div>
                            <div style={{ height: "4px", background: "#f0f4fb", borderRadius: "2px", marginTop: "4px", overflow: "hidden" }}>
                              <div style={{
                                height: "100%", borderRadius: "2px",
                                width: `${Math.round((cnt / maxTec) * 100)}%`,
                                background: "#2b5fb8",
                              }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Últimas órdenes */}
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <h3 style={{ ...sectionTitleStyle, fontSize: "15px", margin: 0 }}>Órdenes activas recientes</h3>
                  <button
                    style={{ ...secondaryButton, fontSize: "12px", padding: "4px 12px" }}
                    onClick={() => setVistaActiva("pendientes")}
                  >
                    Ver todas
                  </button>
                </div>
                {ultimasOrdenes.length === 0 ? (
                  <p style={{ color: "#9ca3af", margin: 0, fontSize: "13px" }}>Sin órdenes activas</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e4eaf4" }}>
                          {["Código", "Tipo", "Cliente", "Técnico", "Nodo", "Fecha", "Estado"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ultimasOrdenes.map((o, i) => (
                          <tr key={o.id || i} style={{ borderBottom: "1px solid #f0f4fb" }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#f8faff"}
                            onMouseLeave={(e) => e.currentTarget.style.background = ""}
                          >
                            <td style={{ padding: "7px 10px", fontWeight: 600, color: "#2b5fb8", whiteSpace: "nowrap" }}>{o.codigo || "-"}</td>
                            <td style={{ padding: "7px 10px", color: "#374151" }}>{o.tipoActuacion || "-"}</td>
                            <td style={{ padding: "7px 10px", color: "#374151", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nombre || "-"}</td>
                            <td style={{ padding: "7px 10px", color: "#374151" }}>{o.tecnico || <span style={{ color: "#f59e0b" }}>Sin asignar</span>}</td>
                            <td style={{ padding: "7px 10px" }}>
                              {o.nodo ? (
                                <span style={{ background: NODO_COLORS[o.nodo] ? `${NODO_COLORS[o.nodo]}18` : "#f3f6fb", color: NODO_COLORS[o.nodo] || "#6b7280", borderRadius: "6px", padding: "2px 8px", fontWeight: 600, fontSize: "12px" }}>
                                  {o.nodo}
                                </span>
                              ) : "-"}
                            </td>
                            <td style={{ padding: "7px 10px", color: "#6b7280", whiteSpace: "nowrap" }}>{o.fechaActuacion || "-"}</td>
                            <td style={{ padding: "7px 10px" }}>
                              <span style={{
                                background: String(o.estado || "").toLowerCase().includes("proceso") ? "#fef3c7" : "#e0e7ff",
                                color: String(o.estado || "").toLowerCase().includes("proceso") ? "#92400e" : "#3730a3",
                                borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: 600,
                              }}>
                                {o.estado || "-"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {vistaActiva === "crear" && (
          <div style={{ display: "grid", gap: "16px" }}>
            <div
              style={{
                ...cardStyle,
                padding: "16px",
                borderRadius: "14px",
                background: "linear-gradient(90deg, #f8fbff 0%, #eef5ff 100%)",
                border: "1px solid #cfe0f5",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "#163a63" }}>
                    {ordenEditandoId ? "Editar orden" : "Crear orden"}
                  </div>
                  <div style={{ fontSize: "13px", color: "#4b5563", marginTop: "2px" }}>
                    Completa los pasos y guarda. Avance: <strong>{completadosChecklistCrear}/{totalChecklistCrear}</strong>
                  </div>
                </div>
                <div style={{ minWidth: "220px", flex: "0 0 260px" }}>
                  <div style={{ height: "8px", borderRadius: "999px", background: "#dbeafe", overflow: "hidden" }}>
                    <div style={{ width: `${porcentajeChecklistCrear}%`, height: "100%", background: "#2563eb" }} />
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#1d4d8b", textAlign: "right", fontWeight: 700 }}>
                    {porcentajeChecklistCrear}%
                  </div>
                </div>
              </div>
              <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={generarCodigo} style={{ ...secondaryButton, padding: "9px 12px" }}>Generar código</button>
                <button onClick={guardarOrden} style={{ ...primaryButton, padding: "9px 12px" }}>
                  {ordenEditandoId ? "Actualizar orden" : "Guardar orden"}
                </button>
              </div>
            </div>

            <div style={gridStyle}>
            <div style={{ display: "grid", gap: "18px" }}>
              <div style={{ ...cardStyle, borderRadius: "14px" }}>
                <h2 style={{ ...sectionTitleStyle, marginBottom: "12px" }}>Paso 1. Datos de la orden</h2>
                <div style={formGridStyle}>
                  <div>
                    <label style={labelStyle}>Empresa <span style={{ color: "#dc2626" }}>*</span></label>
                    <select style={{ ...inputStyle, borderColor: !orden.empresa ? "#fca5a5" : undefined, background: !orden.empresa ? "#fff5f5" : undefined }} value={orden.empresa} onChange={(e) => handleChange("empresa", e.target.value)}>
                      <option value="">Selecciona empresa</option>
                      <option>Americanet</option>
                      <option>DIM</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Código</label>
                    <input style={inputStyle} value={orden.codigo} onChange={(e) => handleChange("codigo", e.target.value)} placeholder="ORD-0001-2026" />
                  </div>

                  <div>
                    <label style={labelStyle}>Generar usuario</label>
                    <select style={inputStyle} value={orden.generarUsuario} onChange={(e) => handleChange("generarUsuario", e.target.value)}>
                      <option>SI</option>
                      <option>NO</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Orden</label>
                    <select style={inputStyle} value={orden.orden} onChange={(e) => {
                      handleChange("orden", e.target.value);
                      if (e.target.value === "RECUPERACION DE EQUIPO") {
                        setOrden((prev) => ({
                          ...prev,
                          orden: e.target.value,
                          tipoActuacion: "Recojo de equipo",
                          solicitarPago: "NO",
                          autorOrden: usuarioSesion?.nombre || prev.autorOrden,
                        }));
                      } else if (e.target.value === "INCIDENCIA") {
                        setOrden((prev) => ({
                          ...prev,
                          orden: e.target.value,
                          tipoActuacion: "Incidencia Internet",
                          autorOrden: usuarioSesion?.nombre || prev.autorOrden,
                        }));
                      }
                    }}>
                      <option>ORDEN DE SERVICIO</option>
                      <option>INCIDENCIA</option>
                      <option>MANTENIMIENTO</option>
                      <option>RECUPERACION DE EQUIPO</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Tipo de actuación</label>
                    <select style={inputStyle} value={orden.tipoActuacion} onChange={(e) => handleChange("tipoActuacion", e.target.value)}>
                      <option>Instalacion Internet</option>
                      <option>Instalacion Internet y Cable</option>
                      <option>Incidencia Internet</option>
                      <option>Instalacion TV</option>
                      <option>Mantenimiento</option>
                      <option>Recojo de equipo</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Fecha para la actuación</label>
                    <input type="date" style={inputStyle} value={orden.fechaActuacion} onChange={(e) => handleChange("fechaActuacion", e.target.value)} />
                  </div>

                  <div>
                    <label style={labelStyle}>Hora</label>
                    <input type="time" style={inputStyle} value={orden.hora} onChange={(e) => handleChange("hora", e.target.value)} />
                  </div>

                  <div>
                    <label style={labelStyle}>Prioridad</label>
                    <select
                      style={inputStyle}
                      value={orden.prioridad}
                      onChange={(e) => handleChange("prioridad", e.target.value)}
                    >
                      <option value="Normal">Normal</option>
                      <option value="Alta">Alta</option>
                      <option value="Urgente">Urgente</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, borderRadius: "14px" }}>
                <h2 style={{ ...sectionTitleStyle, marginBottom: "12px" }}>Paso 2. Datos del cliente</h2>
                <div style={formGridStyle}>
                  <div>
                    <label style={labelStyle}>DNI</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input style={inputStyle} value={orden.dni} onChange={(e) => handleChange("dni", e.target.value)} placeholder="Ingrese DNI" maxLength={8} />
                      <button
                        onClick={buscarDni}
                        style={lupaButtonStyle}
                        disabled={buscandoDni}
                        title="Buscar por DNI"
                        aria-label="Buscar por DNI"
                      >
                        {buscandoDni ? (
                          "..."
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                            <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Nombre</label>
                    <input style={inputStyle} value={orden.nombre} onChange={(e) => handleChange("nombre", e.target.value)} placeholder="Nombre completo" />
                  </div>

                  <div style={fullWidth}>
                    <label style={labelStyle}>Dirección</label>
                    <input style={inputStyle} value={orden.direccion} onChange={(e) => handleChange("direccion", e.target.value)} placeholder="Dirección del cliente" />
                  </div>

                  <div>
                    <label style={labelStyle}>Celular</label>
                    <input style={inputStyle} value={orden.celular} onChange={(e) => handleChange("celular", e.target.value)} placeholder="999999999" />
                  </div>

                  <div>
                    <label style={labelStyle}>Email</label>
                    <input style={inputStyle} value={orden.email} onChange={(e) => handleChange("email", e.target.value)} placeholder="correo@ejemplo.com" />
                  </div>

                  <div style={fullWidth}>
                    <label style={labelStyle}>Contacto</label>
                    <input style={inputStyle} value={orden.contacto} onChange={(e) => handleChange("contacto", e.target.value)} placeholder="51999999999@c.us" />
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, borderRadius: "14px" }}>
                <h2 style={{ ...sectionTitleStyle, marginBottom: "12px" }}>Paso 3. Servicio</h2>
                <div style={formGridStyle}>
                  {mostrarCamposPlan && (
                    <>
                      <div>
                        <label style={labelStyle}>Velocidad a contratar</label>
                        <select style={inputStyle} value={orden.velocidad} onChange={(e) => handleChange("velocidad", e.target.value)}>
                          <option value="">Seleccionar</option>
                          <option>100 Mbps</option>
                          <option>200 Mbps</option>
                          <option>300 Mbps</option>
                          <option>400 Mbps</option>
                          <option>500 Mbps</option>
                          <option>600 Mbps</option>
                          <option>800 Mbps</option>
                          <option>1000 Mbps</option>
                        </select>
                      </div>

                      <div>
                        <label style={labelStyle}>Precio plan</label>
                        <input style={inputStyle} value={orden.precioPlan} onChange={(e) => handleChange("precioPlan", e.target.value)} placeholder="S/ 0.00" />
                      </div>
                    </>
                  )}

                  {mostrarCamposUsuario && (
                    <>
                      <div>
                        <label style={labelStyle}>Nodo</label>
                        <select style={inputStyle} value={orden.nodo} onChange={(e) => handleNodoChange(e.target.value)}>
                          <option value="">Seleccionar nodo</option>
                          <option>Nod_01</option>
                          <option>Nod_02</option>
                          <option>Nod_03</option>
                          <option>Nod_04</option>
                          <option>Nod_05</option>
                          <option>Nod_06</option>
                        </select>
                      </div>

                      <div style={{ position: "relative" }}>
                        <label style={labelStyle}>Usuario</label>
                        <input
                          style={inputStyle}
                          value={orden.usuarioNodo}
                          onChange={(e) => handleChange("usuarioNodo", e.target.value)}
                          placeholder="user730@americanet"
                          onFocus={() => setShowUsuarioDropdown(true)}
                          onBlur={() => setTimeout(() => setShowUsuarioDropdown(false), 150)}
                        />
                        {showUsuarioDropdown && usuariosDisponiblesNodo.length > 0 && (
                          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.12)", zIndex: 999, maxHeight: "220px", overflowY: "auto" }}>
                            {usuariosDisponiblesNodo.map((u, i) => {
                              const uLow = u.toLowerCase();
                              const ocup = (Array.isArray(clientes) ? clientes : []).some((c) => String(c?.usuarioNodo || "").toLowerCase() === uLow) ||
                                (Array.isArray(ordenes) ? ordenes : []).some((o) => {
                                  const lib = o?.usuarioNodoLiberado === true || String(o?.usuarioNodoLiberado || "").toLowerCase() === "true";
                                  return !(String(o?.estado || "").toLowerCase().includes("cancel") && lib) && String(o?.usuarioNodo || "").toLowerCase() === uLow;
                                });
                              return (
                                <div
                                  key={u}
                                  onMouseDown={() => { handleChange("usuarioNodo", u); setShowUsuarioDropdown(false); }}
                                  style={{ padding: "9px 14px", cursor: "pointer", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", color: ocup ? "#dc2626" : i === 0 ? "#1e40af" : "#374151", fontWeight: i === 0 ? 700 : 400, background: i === 0 ? "#eff6ff" : "transparent", borderBottom: i < usuariosDisponiblesNodo.length - 1 ? "1px solid #f3f4f6" : "none" }}
                                >
                                  <span>{u}{i === 0 ? " ✓" : ""}</span>
                                  {ocup && <span style={{ fontSize: "11px", background: "#fef2f2", color: "#dc2626", borderRadius: "4px", padding: "1px 6px", fontWeight: 700 }}>Ocupado</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={usuarioNodoEstaBloqueado ? badgeDanger : badgeSuccess}>
                            {usuarioNodoEstaBloqueado ? "Deshabilitado" : "Habilitado"}
                          </span>
                          {(esAdminSesion || esGestorSesion) ? (
                            <>
                              <button type="button" style={dangerButton} onClick={bloquearUsuarioNodoManual}>
                                Deshabilitar
                              </button>
                              <button
                                type="button"
                                style={{ ...successButton, opacity: usuarioNodoEstaBloqueado ? 1 : 0.7 }}
                                onClick={habilitarUsuarioNodoManual}
                              >
                                Habilitar
                              </button>
                            </>
                          ) : null}
                        </div>
                        {usuarioNodoAccionMsg ? (
                          <div style={{ marginTop: "6px", color: "#1e40af", fontSize: "12px", fontWeight: 600 }}>{usuarioNodoAccionMsg}</div>
                        ) : null}
                        {usuarioNodoOcupado ? (
                          <div style={{ marginTop: "6px", padding: "7px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", fontSize: "12px", color: "#dc2626", fontWeight: 600 }}>
                            ⚠ Usuario ocupado —{" "}
                            {usuarioNodoOcupado.tipo === "cliente"
                              ? `Cliente: ${usuarioNodoOcupado.nombre} (DNI: ${usuarioNodoOcupado.dni})`
                              : `Orden ${usuarioNodoOcupado.codigo}: ${usuarioNodoOcupado.nombre}`}
                          </div>
                        ) : orden.usuarioNodo ? (
                          <div style={{ marginTop: "6px", fontSize: "12px", color: "#16a34a", fontWeight: 600 }}>✓ Usuario disponible</div>
                        ) : null}
                      </div>

                      <div>
                        <label style={labelStyle}>Contraseña</label>
                        <input style={inputStyle} value={orden.passwordUsuario} onChange={(e) => handleChange("passwordUsuario", e.target.value)} placeholder="Contraseña" />
                      </div>
                    </>
                  )}
                  <div>
                    <label style={labelStyle}>SN ONU</label>
                    <input style={inputStyle} value={orden.snOnu} onChange={(e) => handleChange("snOnu", e.target.value)} placeholder="Serial ONU" />
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, borderRadius: "14px" }}>
                <h2 style={{ ...sectionTitleStyle, marginBottom: "12px" }}>Paso 4. Ubicación y observaciones</h2>
                <div style={formGridStyle}>
                  <div style={fullWidth}>
                    <label style={labelStyle}>Ubicación domicilio</label>
                    <input style={inputStyle} value={orden.ubicacion} onChange={(e) => handleChange("ubicacion", e.target.value)} placeholder="-16.438490, -71.598208" />
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px", marginBottom: "12px" }}>
                      <button onClick={usarMiUbicacion} style={secondaryButton}>Usar mi ubicación</button>
                    </div>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                      Haz clic en el mapa para fijar la ubicación, o arrastra el marcador.
                    </div>
                    <div
                      ref={mapaCrearRef}
                      style={{ border: "1px solid #dbe2ea", borderRadius: "16px", overflow: "hidden", height: "360px", background: "#f8fafc" }}
                    />
                  </div>

                  {/* Cajas NAP cercanas */}
                  <div style={fullWidth}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap", marginBottom:6 }}>
                      <label style={labelStyle}>Caja NAP asignada</label>
                      {orden.cajaNap && (
                        <span style={{ background:"#0ea5e9", color:"#fff", borderRadius:8, padding:"2px 10px", fontSize:12, fontWeight:700 }}>
                          {orden.cajaNap}
                        </span>
                      )}
                    </div>
                    {napCajasNearby.length > 0 ? (
                      <>
                        <div style={{ display: "grid", gap: 6 }}>
                          {napCajasNearby.map(c => {
                            const p = c.capacidad ? Math.round((c.puertos_ocupados||0)/c.capacidad*100) : 0;
                            const color = p>=90?"#dc2626":p>=70?"#ea580c":"#0284c7";
                            const sel = orden.cajaNap === c.codigo;
                            const ruta = napRoutes[c.codigo];
                            const d = ruta ? ruta.dist : c.dist;
                            const distLabel = d < 1000 ? Math.round(d)+"m" : (d/1000).toFixed(1)+"km";
                            return (
                              <div
                                key={c.codigo}
                                onClick={() => handleChange("cajaNap", c.codigo)}
                                style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:8, cursor:"pointer", border: sel?`2px solid ${color}`:"1.5px solid #e4eaf4", background: sel?"#f0f9ff":"#f8fafc", transition:"all .15s" }}
                              >
                                <div style={{ width:10, height:10, borderRadius:"50%", background:color, flexShrink:0 }} />
                                <div style={{ flex:1, minWidth:0 }}>
                                  <span style={{ fontWeight:700, fontSize:13, color:"#111827" }}>{c.codigo}</span>
                                  <span style={{ fontSize:12, color:"#6b7280", marginLeft:8 }}>{c.sector} · {c.nodo}</span>
                                </div>
                                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                  <div style={{ width:50, height:5, background:"#e2e8f0", borderRadius:3, overflow:"hidden" }}>
                                    <div style={{ width:p+"%", height:"100%", background:color, borderRadius:3 }} />
                                  </div>
                                  <span style={{ fontSize:11, fontWeight:700, color, minWidth:32 }}>{c.puertos_ocupados||0}/{c.capacidad||8}</span>
                                </div>
                                <div style={{ textAlign:"right", minWidth:52 }}>
                                  <div style={{ fontSize:11, fontWeight:700, color:"#111827" }}>{distLabel}</div>
                                </div>
                                {sel && <span style={{ fontSize:13, color, fontWeight:800 }}>✓</span>}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>Distancia en línea recta · Las líneas en el mapa conectan al cliente con cada caja</div>
                      </>
                    ) : (
                      <div style={{ fontSize:12, color:"#6b7280", marginBottom:6 }}>
                        {napCajasMapData.length === 0 ? "Cargando cajas…" : "Ingresa la ubicación del cliente para ver cajas cercanas."}
                      </div>
                    )}
                    {/* Selector manual — siempre disponible como alternativa */}
                    <div style={{ marginTop:8 }}>
                      <select
                        style={{ ...inputStyle, fontSize:12 }}
                        value={orden.cajaNap}
                        onChange={e => handleChange("cajaNap", e.target.value)}
                      >
                        <option value="">— Buscar caja manualmente —</option>
                        {napCajasMapData
                          .filter(c => !orden.nodo || c.nodo === orden.nodo)
                          .sort((a,b) => String(a.codigo).localeCompare(String(b.codigo)))
                          .map(c => (
                            <option key={c.id} value={c.codigo}>
                              {c.codigo} — {c.sector || ""} · {c.nodo} ({c.puertos_ocupados||0}/{c.capacidad||8} puertos)
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div style={fullWidth}>
                    <label style={labelStyle}>Descripción / observaciones</label>
                    <textarea style={textareaStyle} value={orden.descripcion} onChange={(e) => handleChange("descripcion", e.target.value)} placeholder="Observaciones, plan, notas para el técnico, etc." />
                  </div>

                  <div style={fullWidth}>
                    <label style={labelStyle}>Foto fachada</label>
                    <input type="file" accept="image/*" onChange={cargarImagenOrden} />
                    {orden.fotoFachada && (
                      <div style={{ marginTop: "16px" }}>
                        <img src={orden.fotoFachada} alt="Foto fachada" style={{ width: "240px", maxWidth: "100%", borderRadius: "16px", border: "1px solid #e5e7eb" }} />
                      </div>
                    )}
                  </div>
                  {fotosClienteDni.length > 0 && (
                    <div style={fullWidth}>
                      <label style={labelStyle}>Fotos del cliente ({fotosClienteDni.length})</label>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
                        {fotosClienteDni.map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt={`foto cliente ${i + 1}`}
                            style={{ width: "120px", height: "120px", objectFit: "cover", borderRadius: "10px", border: "1px solid #e2e8f0", cursor: "pointer" }}
                            onClick={() => abrirFotoZoom(url, `Foto cliente ${i + 1}`)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ ...cardStyle, borderRadius: "14px" }}>
                <h2 style={{ ...sectionTitleStyle, marginBottom: "12px" }}>Paso 5. Cobranza y asignación</h2>
                <div style={formGridStyle}>
                  <div>
                    <label style={labelStyle}>Solicitar pago</label>
                    <select style={inputStyle} value={orden.solicitarPago} onChange={(e) => handleChange("solicitarPago", e.target.value)}>
                      <option>SI</option>
                      <option>NO</option>
                    </select>
                  </div>

                  {mostrarMontoCobrar && (
                    <div>
                      <label style={labelStyle}>Monto a cobrar</label>
                      <input style={inputStyle} value={orden.montoCobrar} onChange={(e) => handleChange("montoCobrar", e.target.value)} placeholder="S/" />
                    </div>
                  )}

                  <div>
                    <label style={labelStyle}>Autor de la orden</label>
                    <input style={{ ...inputStyle, background: "#f1f5f9", color: "#64748b", cursor: "not-allowed" }} value={orden.autorOrden || usuarioSesion?.nombre || ""} readOnly />
                  </div>

                  <div>
                    <label style={labelStyle}>Técnico asignado</label>
                    <select style={inputStyle} value={orden.tecnico} onChange={(e) => handleChange("tecnico", e.target.value)}>
                      <option value="">Seleccionar técnico</option>
                      {tecnicosActivos.map((tec) => (
                        <option key={tec.id} value={tec.nombre}>
                          {tec.nombre} - {tec.empresa}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, borderRadius: "14px", padding: "16px", background: "#f8fbff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button onClick={generarCodigo} style={secondaryButton}>Generar código</button>
                    <button onClick={guardarOrden} style={primaryButton}>{ordenEditandoId ? "Actualizar orden" : "Guardar orden"}</button>
                  </div>
                  <div
                    onClick={() => setEnviarWhatsappOrden((v) => !v)}
                    title={enviarWhatsappOrden ? "WhatsApp activado — haz clic para desactivar" : "WhatsApp desactivado — haz clic para activar"}
                    style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "6px 12px", borderRadius: "8px", border: "1.5px solid", borderColor: enviarWhatsappOrden ? "#86efac" : "#e2e8f0", background: enviarWhatsappOrden ? "#f0fdf4" : "#f8fafc", userSelect: "none" }}
                  >
                    <div style={{ width: "36px", height: "20px", borderRadius: "10px", background: enviarWhatsappOrden ? "#22c55e" : "#cbd5e1", position: "relative", transition: "background .2s", flexShrink: 0 }}>
                      <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: enviarWhatsappOrden ? 19 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: enviarWhatsappOrden ? "#166534" : "#6b7280" }}>
                      {enviarWhatsappOrden ? "📱 Notif. WhatsApp" : "🔕 Sin WhatsApp"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: "18px",
                alignContent: "start",
                position: isMobile ? "relative" : "fixed",
                top: isMobile ? "auto" : "96px",
                right: isMobile ? "auto" : "20px",
                width: isMobile ? "auto" : "420px",
                maxHeight: isMobile ? "none" : "calc(100vh - 116px)",
                overflowY: isMobile ? "visible" : "auto",
                zIndex: isMobile ? "auto" : 9,
              }}
            >
              <div
                style={{
                  ...cardStyle,
                  borderRadius: "14px",
                }}
              >
                <h2 style={sectionTitleStyle}>Resumen</h2>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: "600",
                        ...prioridadColor(orden.prioridad),
                      }}
                    >
                      {orden.prioridad}
                    </span>
                  </div>
                  <div style={{ border: "1px solid #dbeafe", borderRadius: "10px", padding: "10px", background: "#f8fbff" }}>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>Avance del formulario</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#1d4d8b" }}>{porcentajeChecklistCrear}%</div>
                  </div>
                  <div><strong>Código:</strong><div>{orden.codigo || "Pendiente"}</div></div>
                  <div><strong>Cliente:</strong><div>{orden.nombre || "Pendiente"}</div></div>
                  <div><strong>DNI:</strong><div>{orden.dni || "Pendiente"}</div></div>
                  <div><strong>Plan:</strong><div>{orden.velocidad || "Pendiente"}</div></div>
                  <div><strong>Nodo:</strong><div>{orden.nodo || "Pendiente"}</div></div>
                  <div><strong>Técnico:</strong><div>{orden.tecnico || "Pendiente"}</div></div>
                  <div><strong>Autor:</strong><div>{orden.autorOrden || "Pendiente"}</div></div>
                </div>

                <div style={{ marginTop: "20px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button onClick={generarCodigo} style={secondaryButton}>Generar código</button>
                  <button onClick={guardarOrden} style={primaryButton}>{ordenEditandoId ? "Actualizar orden" : "Guardar orden"}</button>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}

        {vistaActiva === "pendientes" && (() => {
          const today = todayIsoLocal();
          const ordenesPorDia = {};
          ordenesPendientesFiltradas.forEach((o) => {
            const d = String(o.fechaActuacion || "").slice(0, 10);
            if (d) ordenesPorDia[d] = (ordenesPorDia[d] || 0) + 1;
          });
          const vencidasCount = Object.entries(ordenesPorDia).filter(([d]) => d < today).reduce((s, [, n]) => s + n, 0);

          const ordenesDiaSeleccionado = calendarioFecha
            ? ordenesPendientesFiltradas.filter((o) => String(o.fechaActuacion || "").slice(0, 10) === calendarioFecha)
            : ordenesPendientesFiltradas;

          const [mesYear, mesMes] = calendarioMes.split("-").map(Number);
          const primerDia = new Date(mesYear, mesMes - 1, 1);
          const diasEnMes = new Date(mesYear, mesMes, 0).getDate();
          const inicioSemana = primerDia.getDay();
          const totalCeldas = Math.ceil((inicioSemana + diasEnMes) / 7) * 7;
          const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
          const irMesAnterior = () => { const d = new Date(mesYear, mesMes - 2, 1); setCalendarioMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
          const irMesSiguiente = () => { const d = new Date(mesYear, mesMes, 1); setCalendarioMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
          const nombreMes = new Date(mesYear, mesMes - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" });

          const labelFecha = calendarioFecha
            ? new Date(calendarioFecha + "T00:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })
            : "Calendario";

          return (
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "18px" }}>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>
                {calendarioFecha
                  ? `Órdenes — ${new Date(calendarioFecha + "T00:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}`
                  : "Órdenes pendientes"}
                {" "}<span style={{ fontWeight: "400", color: "#6b7280", fontSize: "14px" }}>({ordenesDiaSeleccionado.length})</span>
              </h2>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {/* Botón calendario con badge vencidas */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setCalendarioAbierto((v) => !v)}
                    style={{ ...secondaryButton, display: "flex", alignItems: "center", gap: "6px", background: calendarioAbierto ? "#e8eef8" : "#fff" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {labelFecha}
                    {vencidasCount > 0 && (
                      <span style={{ background: "#dc2626", color: "#fff", borderRadius: "999px", fontSize: "11px", fontWeight: "700", minWidth: "18px", height: "18px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                        {vencidasCount}
                      </span>
                    )}
                  </button>

                  {/* Popover calendario */}
                  {calendarioAbierto && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 100,
                      background: "#fff", borderRadius: "16px", border: "1px solid #e4eaf4",
                      boxShadow: "0 8px 32px rgba(43,95,184,0.15)", padding: "16px", width: "300px",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <button onClick={irMesAnterior} style={{ ...secondaryButton, padding: "3px 10px", fontSize: "16px" }}>‹</button>
                        <span style={{ fontWeight: "700", fontSize: "14px", textTransform: "capitalize" }}>{nombreMes}</span>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button onClick={() => { setCalendarioFecha(today); setCalendarioMes(today.slice(0, 7)); setCalendarioAbierto(false); }} style={{ ...secondaryButton, padding: "3px 8px", fontSize: "11px" }}>Hoy</button>
                          <button onClick={irMesSiguiente} style={{ ...secondaryButton, padding: "3px 10px", fontSize: "16px" }}>›</button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
                        {diasSemana.map((d) => <div key={d} style={{ textAlign: "center", fontSize: "10px", fontWeight: "600", color: "#9ca3af", padding: "3px 0" }}>{d}</div>)}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
                        {Array.from({ length: totalCeldas }).map((_, i) => {
                          const dia = i - inicioSemana + 1;
                          if (dia < 1 || dia > diasEnMes) return <div key={i} />;
                          const fechaDia = `${mesYear}-${String(mesMes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
                          const cnt = ordenesPorDia[fechaDia] || 0;
                          const esHoy = fechaDia === today;
                          const esPasado = fechaDia < today;
                          const esSeleccionado = fechaDia === calendarioFecha;
                          return (
                            <div key={i} onClick={() => { setCalendarioFecha(esSeleccionado ? null : fechaDia); setCalendarioAbierto(false); }}
                              style={{ position: "relative", textAlign: "center", padding: "5px 2px", borderRadius: "8px", cursor: "pointer",
                                background: esSeleccionado ? "#2b5fb8" : esHoy ? "#e8eef8" : "transparent",
                                border: esHoy && !esSeleccionado ? "1px solid #2b5fb8" : "1px solid transparent" }}>
                              <span style={{ fontSize: "12px", fontWeight: esHoy || esSeleccionado ? "700" : "400", color: esSeleccionado ? "#fff" : esHoy ? "#2b5fb8" : "#374151" }}>{dia}</span>
                              {cnt > 0 && (
                                <div style={{ position: "absolute", top: "1px", right: "2px", background: esSeleccionado ? "#fff" : esPasado ? "#dc2626" : "#2b5fb8",
                                  color: esSeleccionado ? "#2b5fb8" : "#fff", borderRadius: "999px", fontSize: "8px", fontWeight: "700",
                                  minWidth: "13px", height: "13px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px", lineHeight: 1 }}>
                                  {cnt}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: "12px", marginTop: "10px", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#6b7280" }}><div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626" }} />Vencidas</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#6b7280" }}><div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2b5fb8" }} />Pendientes</div>
                        {calendarioFecha && <button onClick={() => { setCalendarioFecha(null); setCalendarioAbierto(false); }} style={{ ...secondaryButton, fontSize: "10px", padding: "2px 8px", marginLeft: "auto" }}>Ver todas</button>}
                      </div>
                    </div>
                  )}
                </div>

                <select style={{ ...inputStyle, maxWidth: "200px" }} value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)}>
                  <option value="TODOS">Todos los técnicos</option>
                  <option value="SIN">Sin técnico</option>
                  {tecnicosActivos.map((tec) => <option key={tec.id} value={tec.nombre}>{tec.nombre}</option>)}
                </select>
                <input style={{ ...inputStyle, maxWidth: "400px" }} value={busquedaPendientes} onChange={(e) => setBusquedaPendientes(e.target.value)} placeholder="Buscar por código, DNI, cliente..." />
              </div>
            </div>

            {/* Filtros por tipo */}
            {(() => {
              const base = ordenesPendientesFiltradas;
              const counts = {
                TODOS:         base.length,
                PENDIENTE:     base.filter(o => String(o.estado||"").toLowerCase() === "pendiente").length,
                PROCESO:       base.filter(o => String(o.estado||"").toLowerCase().includes("proceso")).length,
                INCIDENCIA:    base.filter(o => String(o.orden||"").toUpperCase().includes("INCIDENCIA")).length,
                ORDEN_SERVICIO:base.filter(o => String(o.orden||"").toUpperCase().includes("ORDEN DE SERVICIO")).length,
                RECUPERACION:  base.filter(o => String(o.orden||"").toUpperCase().includes("RECUPERACION")).length,
              };
              const tabs = [
                { key: "TODOS",          label: "Total",          color: "#374151", bg: "#f3f4f6", activeBg: "#1e40af", activeColor: "#fff" },
                { key: "PENDIENTE",      label: "Pendientes",     color: "#374151", bg: "#f3f4f6", activeBg: "#f59e0b", activeColor: "#fff" },
                { key: "PROCESO",        label: "En proceso",     color: "#374151", bg: "#f3f4f6", activeBg: "#7c3aed", activeColor: "#fff" },
                { key: "INCIDENCIA",     label: "Incidencias",    color: "#374151", bg: "#f3f4f6", activeBg: "#dc2626", activeColor: "#fff" },
                { key: "ORDEN_SERVICIO", label: "Orden Servicio", color: "#374151", bg: "#f3f4f6", activeBg: "#1d4ed8", activeColor: "#fff" },
                { key: "RECUPERACION",   label: "Recuperación",   color: "#374151", bg: "#f3f4f6", activeBg: "#16a34a", activeColor: "#fff" },
              ];
              return (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                  {tabs.map(({ key, label, activeBg, activeColor, bg, color }) => (
                    <button
                      key={key}
                      onClick={() => setFiltroTipoOrden(key)}
                      style={{ padding: "7px 14px", borderRadius: "999px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: "600", background: filtroTipoOrden === key ? activeBg : bg, color: filtroTipoOrden === key ? activeColor : color, transition: "all 0.15s" }}
                    >
                      {label} <span style={{ opacity: 0.8, fontWeight: "400" }}>({counts[key]})</span>
                    </button>
                  ))}
                </div>
              );
            })()}

            {ordenesDiaSeleccionado.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                <div style={{ fontWeight: 600 }}>No hay órdenes {calendarioFecha ? "para este día" : "pendientes"}</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ordenesDiaSeleccionado.map((item) => {
                  const tipoBadge = getOrdenTipoBadge(item.orden);
                  const accentColor = getOrdenTipoBorderColor(item.orden);
                  const horaTexto = String(item.hora || "").trim();
                  const fechaTexto = String(item.fechaActuacion || "").slice(0, 10);
                  const esPasada = fechaTexto && fechaTexto < today;
                  const bloqueadoPorNodo = esGestorSesion && nodosAccesoGestoraSet.size > 0 && !!item.nodo && !tieneAccesoNodoSesion(item.nodo);
                  return (
                    <div key={item.id} style={{ background: "#fff", border: "1px solid #e8edf5", borderLeft: `4px solid ${accentColor}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 6px rgba(15,23,42,0.04)" }}>

                      {/* ── Fila superior: código + hora + badges + acciones ── */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.2px" }}>{item.codigo}</span>
                          {item.empresa === "Americanet" && (
                            <img src={logoAmericanet} alt="Americanet" style={{ height: 22, maxWidth: 80, objectFit: "contain", mixBlendMode: "multiply" }} />
                          )}
                          {item.empresa === "DIM" && (
                            <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 6, overflow: "hidden", height: 22 }}>
                              <img src={logoDim} alt="DIM" style={{ height: 22, objectFit: "contain" }} />
                            </span>
                          )}
                          {/* HORA — destacada */}
                          {horaTexto ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: esPasada ? "#fef2f2" : "#fff7ed", color: esPasada ? "#dc2626" : "#c2410c", border: `1px solid ${esPasada ? "#fca5a5" : "#fed7aa"}` }}>
                              🕐 {horaTexto}
                            </span>
                          ) : (
                            <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#f1f5f9", color: "#94a3b8", border: "1px solid #e2e8f0" }}>Sin hora</span>
                          )}
                          <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: tipoBadge.bg, color: tipoBadge.color, border: `1px solid ${tipoBadge.border}` }}>{tipoBadge.label}</span>
                          <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, ...prioridadColor(item.prioridad) }}>{item.prioridad || "Normal"}</span>
                          <span style={getEstadoOperativoBadgeStyle(item.estado)}>{item.estado || "Pendiente"}</span>
                          {esPasada && <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}>Vencida</span>}
                          {bloqueadoPorNodo && <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#f1f5f9", color: "#6b7280", border: "1px solid #d1d5db" }}>🔒 Sin acceso</span>}
                        </div>
                        {/* Acciones principales */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <button onClick={async () => { if (bloqueadoPorNodo) { alert(`No tienes permiso para ver el detalle de órdenes del nodo ${item.nodo}.`); return; } setOrdenDetalle(item); setFotosOrdenDetalle([]); if (item.dni) { try { const { data: cli } = await supabase.from("clientes").select("foto_fachada,fotos_liquidacion").eq("dni", item.dni).maybeSingle(); const fotos = await obtenerFotosLiquidacionClienteSupabase({ dni: item.dni, fotosLiquidacion: cli?.fotos_liquidacion || [] }); const todas = [...new Set([cli?.foto_fachada, item.fotoFachada, ...fotos].filter(Boolean))]; setFotosOrdenDetalle(todas); } catch (_) {} } }} style={{ padding: "5px 11px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>Ver</button>
                          {!bloqueadoPorNodo && <button onClick={() => editarOrden(item)} style={{ padding: "5px 11px", background: "#fefce8", border: "1px solid #fde047", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#854d0e", cursor: "pointer" }}>Editar</button>}
                          {puedeLiquidarOrden && !bloqueadoPorNodo && <button onClick={() => abrirLiquidacion(item)} style={{ padding: "5px 12px", background: "#16a34a", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>Liquidar</button>}
                          {puedeCancelarOrden && !bloqueadoPorNodo && <button onClick={() => cancelarOrden(item.id)} style={{ padding: "5px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>Cancelar</button>}
                          {puedeEliminarOrden && !bloqueadoPorNodo && <button onClick={() => eliminarOrden(item.id)} style={{ padding: "5px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#dc2626", cursor: "pointer" }}>Eliminar</button>}
                        </div>
                      </div>

                      {/* ── Fila inferior: info + contacto ── */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "10px 14px", alignItems: "center" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{item.nombre || "-"}</div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{item.tipoActuacion || item.orden || "-"}</div>
                          </div>
                          <div style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 1 }}>
                            <span>📍 {item.direccion || "-"}</span>
                            <span>DNI {item.dni || "-"} · {item.celular || "sin cel."}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 1 }}>
                            <span>👷 {item.tecnico || "Sin técnico"}</span>
                            <span>🌐 {item.nodo || "-"} · {item.usuarioNodo || "-"}</span>
                          </div>
                          {(esAdminSesion || esGestorSesion) && item.autorOrden && (
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>Autor: {item.autorOrden}</div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                          <button onClick={() => llamarCliente(item.celular)} title="Llamar" style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>📞</button>
                          <button onClick={() => abrirWhatsApp(item.celular)} title="WhatsApp" style={{ width: 32, height: 32, borderRadius: 8, background: "#f0fdf4", border: "1px solid #86efac", color: "#16a34a", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>💬</button>
                          <button onClick={() => navegarRuta(item.ubicacion, item.direccion)} title="Navegar" style={{ width: 32, height: 32, borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>🗺️</button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })()}

        {vistaActiva === "historial" && (() => {
          const TIPOS_ORDEN = [
            { key: "TODOS",        label: "Todos",        color: "#64748B", bg: "#F1F5F9" },
            { key: "incidencia",   label: "Incidencia",   color: "#EA580C", bg: "#FFF7ED" },
            { key: "instalacion",  label: "Instalación",  color: "#16A34A", bg: "#F0FDF4" },
            { key: "recuperacion", label: "Recuperación", color: "#9333EA", bg: "#FDF4FF" },
          ];
          const nodosDisp = ["TODOS", ...NODOS_BASE_WEB.filter((n) => n !== "Nod_05")];
          const tipoInfo = (tipo = "") => {
            const t = String(tipo).toLowerCase();
            if (t.includes("incidencia"))   return { color: "#EA580C", bg: "#FFF7ED", border: "#FED7AA" };
            if (t.includes("instalacion"))  return { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" };
            if (t.includes("recuperacion")) return { color: "#9333EA", bg: "#FDF4FF", border: "#E9D5FF" };
            return { color: "#475569", bg: "#F8FAFC", border: "#E2E8F0" };
          };
          const countTipo = (k) => k === "TODOS" ? liquidacionesFiltradas.length :
            (Array.isArray(liquidaciones) ? liquidaciones : []).filter(x =>
              tieneAccesoNodoSesion(firstText(x?.nodo)) &&
              String(x.tipoActuacion||"").toLowerCase().includes(k)
            ).length;

          return (
          <div style={{ display: "grid", gap: "16px" }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg,#0A2E5F 0%,#1E4F9C 100%)", borderRadius: "18px", padding: "22px 24px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.7, marginBottom: 6 }}>Gestión de órdenes</div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Historial de Liquidaciones</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.75 }}>
                  {liquidacionesFiltradas.length} registro{liquidacionesFiltradas.length !== 1 ? "s" : ""} encontrado{liquidacionesFiltradas.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={generarPdfHistorial}
                style={{ background: "#F47A20", color: "#fff", border: "none", borderRadius: 12, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                ⬇ Exportar PDF
              </button>
            </div>

            {/* Filtros */}
            <div style={{ background: "#fff", borderRadius: "16px", padding: "18px 20px", border: "1px solid #E2E8F0", display: "grid", gap: 14 }}>
              {/* Fila 1: búsqueda + nodo + fechas */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  style={{ ...inputStyle, flex: "1 1 220px", minWidth: 0 }}
                  value={busquedaHistorial}
                  onChange={(e) => setBusquedaHistorial(e.target.value)}
                  placeholder="🔍  Buscar código, cliente, DNI, técnico..."
                />
                {/* Nodos */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {nodosDisp.map((nodo) => {
                    const active = histFiltroNodo === nodo;
                    return (
                      <button key={nodo} onClick={() => setHistFiltroNodo(nodo)}
                        style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${active ? "#1E4F9C" : "#E2E8F0"}`, background: active ? "#1E4F9C" : "#F8FAFC", color: active ? "#fff" : "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {nodo === "TODOS" ? "Todos los nodos" : nodo}
                      </button>
                    );
                  })}
                </div>
                {/* Fechas */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="date" style={{ ...inputStyle, width: 145 }} value={histFiltroDesde} onChange={(e) => setHistFiltroDesde(e.target.value)} title="Desde" />
                  <span style={{ color: "#94A3B8", fontSize: 12 }}>→</span>
                  <input type="date" style={{ ...inputStyle, width: 145 }} value={histFiltroHasta} onChange={(e) => setHistFiltroHasta(e.target.value)} title="Hasta" />
                  {(histFiltroDesde || histFiltroHasta) && (
                    <button onClick={() => { setHistFiltroDesde(""); setHistFiltroHasta(""); }}
                      style={{ padding: "7px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#94A3B8", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                      ✕ Limpiar fecha
                    </button>
                  )}
                </div>
              </div>
              {/* Fila 2: tipo de orden */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {TIPOS_ORDEN.map((t) => {
                  const active = histFiltroTipo === t.key;
                  const cnt = countTipo(t.key);
                  return (
                    <button key={t.key} onClick={() => setHistFiltroTipo(t.key)}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${active ? t.color : "#E2E8F0"}`, background: active ? t.bg : "#F8FAFC", color: active ? t.color : "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      {t.label}
                      <span style={{ background: active ? t.color : "#E2E8F0", color: active ? "#fff" : "#64748B", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 800 }}>{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lista */}
            {liquidacionesFiltradas.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", padding: "52px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🗂️</div>
                <p style={{ color: "#94A3B8", fontWeight: 700, fontSize: 15, margin: 0 }}>Sin liquidaciones para los filtros seleccionados</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {liquidacionesFiltradas.map((item) => {
                  const ti = tipoInfo(item.tipoActuacion);
                  const resultado = String(item.liquidacion?.resultadoFinal || "Liquidada");
                  const resColor = resultado.toLowerCase().includes("no") || resultado.toLowerCase().includes("cancel") ? "#DC2626" :
                    resultado.toLowerCase().includes("complet") || resultado.toLowerCase().includes("instal") ? "#16A34A" : "#D97706";
                  return (
                    <div key={item.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", borderLeft: `4px solid ${ti.color}`, padding: "14px 18px", display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                      {/* Left content */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: "#0A2E5F" }}>{item.codigo}</span>
                          <span style={{ background: ti.bg, color: ti.color, border: `1px solid ${ti.border}`, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{item.tipoActuacion || "—"}</span>
                          {item.nodo && (
                            <span style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{item.nodo}</span>
                          )}
                          <span style={{ background: resColor + "18", color: resColor, border: `1px solid ${resColor}40`, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{resultado}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 3 }}>{item.nombre || "—"}</div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "#64748B" }}>DNI: <b>{item.dni || "-"}</b></span>
                          {item.celular && <span style={{ fontSize: 12, color: "#64748B" }}>Cel: <b>{item.celular}</b></span>}
                          <span style={{ fontSize: 12, color: "#64748B" }}>Técnico: <b>{item.liquidacion?.tecnicoLiquida || item.tecnico || "-"}</b></span>
                          <span style={{ fontSize: 12, color: "#64748B" }}>📅 <b>{item.fechaLiquidacion}</b></span>
                        </div>
                        {(item.velocidad || item.usuarioNodo) && (
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                            {item.velocidad && <span style={{ fontSize: 11, color: "#64748B" }}>Plan: <b>{item.velocidad}</b></span>}
                            {item.usuarioNodo && <span style={{ fontSize: 11, color: "#64748B" }}>Usuario: <b>{item.usuarioNodo}</b></span>}
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <button onClick={() => void abrirDetalleLiquidacionHistorial(item)} style={{ ...infoButton, padding: "7px 14px", fontSize: 12 }}>
                          Ver detalle
                        </button>
                        {puedeEditarLiquidacion && (
                          <button onClick={() => void abrirEditarLiquidacionHistorial(item)} style={{ ...warningButton, padding: "7px 12px", fontSize: 12 }}>
                            Editar
                          </button>
                        )}
                        {puedeEliminarLiquidacion && (
                          <button onClick={() => eliminarLiquidacion(item)} style={{ ...dangerButton, padding: "7px 12px", fontSize: 12 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })()}

        {vistaActiva === "historialAppsheet" && (
          <div style={{ display: "grid", gap: "24px" }}>
            <div
              style={{
                ...cardStyle,
                padding: isMobile ? "18px" : "22px 24px",
                background: "linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)",
                border: "1px solid #dce7f3",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#64748b",
                      marginBottom: "8px",
                    }}
                  >
                    Navegador / Historial AppSheet
                  </div>
                  <h2 style={{ ...sectionTitleStyle, marginBottom: "6px" }}>
                    {historialAppsheetSubmenuActual?.label || "Historial AppSheet"}
                  </h2>
                  <p style={{ ...subtitleStyle, margin: 0 }}>
                    Consulta historica importada desde AppSheet{isMobile ? "." : " y navega las vistas desde el menú lateral."}
                  </p>
                </div>
                <span style={{ ...badgeStyle, background: "#e8f1fb", color: "#1d4d8b" }}>
                  Sección actual: {historialAppsheetSubmenuActual?.sideLabel || historialAppsheetSubmenuActual?.label || "-"}
                </span>
              </div>

              {isMobile ? (
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px", alignItems: "center" }}>
                  {historialAppsheetSubmenuItemsPermitidos.map((submenu) => (
                    <button
                      key={`hist-top-${submenu.key}`}
                      type="button"
                      style={menuButton(historialAppsheetSubmenu === submenu.key)}
                      onClick={() => setHistorialAppsheetSubmenu(submenu.key)}
                    >
                      {submenu.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {historialAppsheetSubmenu === "equipos" && (
              <div style={cardStyle}>
                <h3 style={{ ...sectionTitleStyle, fontSize: "24px" }}>Equipos (AppSheet)</h3>
                {(() => {
                  const compactBtn = {
                    padding: "7px 10px",
                    fontSize: "12px",
                    borderRadius: "10px",
                  };
                  return (
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                  <button
                    type="button"
                    style={{ ...primaryButton, ...compactBtn }}
                    onClick={sincronizarHistorialAppsheetEquipos}
                    disabled={historialAppsheetLoading}
                  >
                    {historialAppsheetLoading ? "Actualizando..." : "Actualizar"}
                  </button>
                  <button
                    type="button"
                    style={{ ...secondaryButton, ...compactBtn }}
                    onClick={cargarHistorialAppsheetEquipos}
                    disabled={historialAppsheetLoading}
                  >
                    Recargar
                  </button>
                  <span style={{ ...badgeStyle, background: "#eef2ff", color: "#1e3a8a" }}>
                    Registros: {historialAppsheetEquipos.length}
                  </span>
                  <input
                    type="date"
                    style={{ ...inputStyle, maxWidth: "170px" }}
                    value={historialAppsheetFiltroDraft.desde}
                    onChange={(e) => setHistorialAppsheetFiltroDraft((prev) => ({ ...prev, desde: e.target.value }))}
                  />
                  <input
                    type="date"
                    style={{ ...inputStyle, maxWidth: "170px" }}
                    value={historialAppsheetFiltroDraft.hasta}
                    onChange={(e) => setHistorialAppsheetFiltroDraft((prev) => ({ ...prev, hasta: e.target.value }))}
                  />
                  <select
                    style={{ ...inputStyle, maxWidth: "220px" }}
                    value={historialAppsheetFiltroDraft.tecnico}
                    onChange={(e) => setHistorialAppsheetFiltroDraft((prev) => ({ ...prev, tecnico: e.target.value }))}
                  >
                    <option value="TODOS">Tecnico: Todos</option>
                    {historialAppsheetTecnicosOpciones.map((t) => (
                      <option key={`tec-hist-${t}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    style={{ ...inputStyle, maxWidth: "180px" }}
                    value={historialAppsheetFiltroDraft.estado}
                    onChange={(e) => setHistorialAppsheetFiltroDraft((prev) => ({ ...prev, estado: e.target.value }))}
                  >
                    <option value="TODOS">Estado: Todos</option>
                    {historialAppsheetEstadosOpciones.map((est) => (
                      <option key={`est-hist-${est}`} value={est}>
                        {est}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={{ ...secondaryButton, ...compactBtn }}
                    onClick={() => {
                      setHistorialAppsheetFiltro({ ...historialAppsheetFiltroDraft });
                      setHistorialAppsheetPagina(1);
                      setHistorialAppsheetDetalle(null);
                    }}
                  >
                    Aplicar
                  </button>
                  <button
                    type="button"
                    style={{ ...secondaryButton, ...compactBtn }}
                    onClick={() => {
                      const limpio = { desde: "", hasta: "", tecnico: "TODOS", estado: "TODOS" };
                      setHistorialAppsheetFiltroDraft(limpio);
                      setHistorialAppsheetFiltro(limpio);
                      setHistorialAppsheetPagina(1);
                    }}
                  >
                    Limpiar
                  </button>
                  <button type="button" style={{ ...secondaryButton, ...compactBtn }} onClick={() => setHistorialColsModalOpen(true)}>
                    Columnas
                  </button>
                  <button type="button" style={{ ...infoButton, ...compactBtn }} onClick={imprimirHistorialAppsheetColumnas}>
                    Imprimir
                  </button>
                  {historialAppsheetInfo ? <span style={badgeSuccess}>{historialAppsheetInfo}</span> : null}
                </div>
                  );
                })()}
                <input
                  style={{ ...inputStyle, maxWidth: "460px", marginBottom: "12px" }}
                  value={historialAppsheetBusqueda}
                  onChange={(e) => setHistorialAppsheetBusqueda(e.target.value)}
                  placeholder="Buscar por IDONU, producto, estado, tecnico, nodo, cliente o DNI..."
                />
                {historialAppsheetError ? <p style={{ color: "#b91c1c", margin: "0 0 12px 0" }}>{historialAppsheetError}</p> : null}

                {historialAppsheetEquiposFiltrados.length === 0 ? (
                  <p style={{ color: "#6b7280", margin: 0 }}>No hay datos. Pulsa Actualizar para traer ONUsRegistradas.</p>
                ) : (
                  <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px", tableLayout: "fixed" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {historialColumnasActivas.map((col) => (
                            <th
                              key={col.key}
                              style={{
                                textAlign: "left",
                                padding: "10px",
                                borderBottom: "1px solid #e5e7eb",
                                color: "#334155",
                                fontSize: "12px",
                                fontWeight: 700,
                                ...estilosColumnaHistorial(col.key),
                              }}
                            >
                              {col.label}
                            </th>
                          ))}
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px",
                              borderBottom: "1px solid #e5e7eb",
                              color: "#334155",
                              fontSize: "12px",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            Detalle
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {historialAppsheetEquiposPagina.map((row) => (
                          <tr
                            key={row.id_onu}
                            style={{
                              borderBottom: "1px solid #f1f5f9",
                              cursor: "pointer",
                              background:
                                String(historialAppsheetDetalle?.id_onu || "") === String(row.id_onu || "") ? "#eff6ff" : "transparent",
                            }}
                            onClick={() => setHistorialAppsheetDetalle(row)}
                          >
                            {historialColumnasActivas.map((col) => {
                              const value = valorCeldaHistorial(row, col.key);
                              if (String(col.key).startsWith("foto_")) {
                                return (
                                  <td key={`${row.id_onu}-${col.key}`} style={{ padding: "10px" }}>
                                    {value ? (
                                      <a href={value} target="_blank" rel="noreferrer">
                                        <img
                                          src={value}
                                          alt={col.key}
                                          style={{ width: "54px", height: "54px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                                        />
                                      </a>
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={`${row.id_onu}-${col.key}`}
                                  title={String(value || "")}
                                  style={{ padding: "10px", ...estilosColumnaHistorial(col.key) }}
                                >
                                  {value}
                                </td>
                              );
                            })}
                            <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                              <button
                                type="button"
                                style={infoButton}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistorialAppsheetDetalle(row);
                                }}
                              >
                                Ver
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {historialAppsheetEquiposFiltrados.length > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      Pagina {historialAppsheetPaginaActiva} de {historialAppsheetTotalPaginas} · {historialAppsheetEquiposFiltrados.length} registros filtrados
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        style={secondaryButton}
                        onClick={() => setHistorialAppsheetPagina((p) => Math.max(1, Number(p || 1) - 1))}
                        disabled={historialAppsheetPaginaActiva <= 1}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        style={secondaryButton}
                        onClick={() => setHistorialAppsheetPagina((p) => Math.min(historialAppsheetTotalPaginas, Number(p || 1) + 1))}
                        disabled={historialAppsheetPaginaActiva >= historialAppsheetTotalPaginas}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                ) : null}
                <p style={{ marginTop: "10px", fontSize: "12px", color: "#64748b" }}>
                  Vista resumida: haz clic en una fila para ver detalle completo.
                </p>
              </div>
            )}

            {historialAppsheetSubmenu === "liquidaciones" && (
              <div style={cardStyle}>
                <h3 style={{ ...sectionTitleStyle, fontSize: "24px" }}>Liquidaciones (AppSheet)</h3>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                  <button
                    type="button"
                    style={primaryButton}
                    onClick={sincronizarHistorialAppsheetLiquidaciones}
                    disabled={historialAppsheetLoading}
                  >
                    {historialAppsheetLoading ? "Actualizando..." : "Actualizar"}
                  </button>
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={cargarHistorialAppsheetLiquidaciones}
                    disabled={historialAppsheetLoading}
                  >
                    Recargar
                  </button>
                  <span style={{ ...badgeStyle, background: "#eef2ff", color: "#1e3a8a" }}>
                    Registros: {historialAppsheetLiquidaciones.length}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                  <input
                    type="date"
                    style={{ ...inputStyle, maxWidth: "170px" }}
                    value={historialAppsheetLiqFiltro.desde}
                    onChange={(e) => setHistorialAppsheetLiqFiltro((prev) => ({ ...prev, desde: e.target.value }))}
                  />
                  <input
                    type="date"
                    style={{ ...inputStyle, maxWidth: "170px" }}
                    value={historialAppsheetLiqFiltro.hasta}
                    onChange={(e) => setHistorialAppsheetLiqFiltro((prev) => ({ ...prev, hasta: e.target.value }))}
                  />
                  <select
                    style={{ ...inputStyle, maxWidth: "180px" }}
                    value={historialAppsheetLiqFiltro.nodo}
                    onChange={(e) => setHistorialAppsheetLiqFiltro((prev) => ({ ...prev, nodo: e.target.value }))}
                  >
                    <option value="TODOS">Nodo: Todos</option>
                    {historialAppsheetLiqNodosOpciones.map((n) => (
                      <option key={`liq-nodo-${n}`} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <select
                    style={{ ...inputStyle, maxWidth: "220px" }}
                    value={historialAppsheetLiqFiltro.tecnico}
                    onChange={(e) => setHistorialAppsheetLiqFiltro((prev) => ({ ...prev, tecnico: e.target.value }))}
                  >
                    <option value="TODOS">Técnico: Todos</option>
                    {historialAppsheetLiqTecnicosOpciones.map((t) => (
                      <option key={`liq-tec-${t}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    style={{ ...inputStyle, maxWidth: "220px" }}
                    value={historialAppsheetLiqFiltro.actuacion}
                    onChange={(e) => setHistorialAppsheetLiqFiltro((prev) => ({ ...prev, actuacion: e.target.value }))}
                  >
                    <option value="TODOS">Actuación: Todas</option>
                    {historialAppsheetLiqActuacionesOpciones.map((a) => (
                      <option key={`liq-act-${a}`} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={() =>
                      setHistorialAppsheetLiqFiltro({
                        desde: "",
                        hasta: "",
                        nodo: "TODOS",
                        tecnico: "TODOS",
                        actuacion: "TODOS",
                      })
                    }
                  >
                    Limpiar filtros
                  </button>
                </div>

                <input
                  style={{ ...inputStyle, maxWidth: "460px", marginBottom: "12px" }}
                  value={historialAppsheetLiqBusqueda}
                  onChange={(e) => setHistorialAppsheetLiqBusqueda(e.target.value)}
                  placeholder="Buscar por código, cliente, DNI, nodo, técnico, resultado..."
                />
                {historialAppsheetInfo ? <p style={{ color: "#065f46", margin: "0 0 8px 0" }}>{historialAppsheetInfo}</p> : null}
                {historialAppsheetError ? <p style={{ color: "#b91c1c", margin: "0 0 12px 0" }}>{historialAppsheetError}</p> : null}

                {historialAppsheetLiquidacionesFiltradas.length === 0 ? (
                  <p style={{ color: "#6b7280", margin: 0 }}>No hay datos de liquidaciones. Pulsa Actualizar para traer la hoja Liquidaciones.</p>
                ) : (
                  <>
                    <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Fecha</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Código</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Actuación</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Cliente</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>DNI</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Nodo</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Técnico</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Resultado</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Monto</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Detalle</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Materiales</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialAppsheetLiquidacionesPagina.map((row, idx) => (
                            <tr
                              key={`${row.codigo || "liq"}-${idx}`}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                                cursor: "pointer",
                                background: String(historialAppsheetLiqDetalle?.codigo || "") === String(valorLiq(row, "codigo", "Código")) ? "#eff6ff" : "transparent",
                              }}
                              onClick={() => setHistorialAppsheetLiqDetalle(row)}
                            >
                              <td style={{ padding: "10px" }}>{formatFechaFlexible(valorLiq(row, "fecha", "Fecha"))}</td>
                              <td style={{ padding: "10px", fontWeight: 700 }}>{valorLiq(row, "codigo", "Código") || "-"}</td>
                              <td style={{ padding: "10px" }}>{firstText(valorLiq(row, "actuacion", "Actuacion"), valorLiq(row, "tipo_actuacion", "Tipo de actuacion")) || "-"}</td>
                              <td style={{ padding: "10px" }}>{valorLiq(row, "cliente", "nombre", "Nombre", "Cliente") || "-"}</td>
                              <td style={{ padding: "10px" }}>{valorLiq(row, "dni", "DNI", "Cedula") || "-"}</td>
                              <td style={{ padding: "10px" }}>{valorLiq(row, "nodo", "Nodo") || "-"}</td>
                              <td style={{ padding: "10px" }}>{tecnicoLiqNombre(row)}</td>
                              <td style={{ padding: "10px" }}>{valorLiq(row, "resultado", "Estado") || "-"}</td>
                              <td style={{ padding: "10px", fontWeight: 700 }}>
                                {Number.isFinite(Number(valorLiq(row, "monto", "Monto cobrado", "Monto", "Drop")))
                                  ? `S/ ${Number(valorLiq(row, "monto", "Monto cobrado", "Monto", "Drop")).toFixed(2)}`
                                  : "-"}
                              </td>
                              <td style={{ padding: "10px" }}>
                                <button
                                  type="button"
                                  style={infoButton}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setHistorialAppsheetLiqDetalle(row);
                                  }}
                                >
                                  Ver
                                </button>
                              </td>
                              <td style={{ padding: "10px" }}>
                                <button
                                  type="button"
                                  style={secondaryButton}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!historialAppsheetDetLiq.length) await cargarHistorialAppsheetDetalleLiquidacion();
                                    if (!historialAppsheetArticulos.length) await cargarHistorialAppsheetArticulos();
                                    setHistorialAppsheetLiqMaterialesTarget(row);
                                  }}
                                >
                                  Ver materiales
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", flexWrap: "wrap", gap: "10px" }}>
                      <span style={{ color: "#6b7280", fontSize: "13px" }}>
                        Página {historialAppsheetLiqPaginaActiva} de {historialAppsheetLiqTotalPaginas} ·{" "}
                        {historialAppsheetLiquidacionesFiltradas.length} registros filtrados
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          style={secondaryButton}
                          disabled={historialAppsheetLiqPaginaActiva <= 1}
                          onClick={() => setHistorialAppsheetLiqPagina((p) => Math.max(1, p - 1))}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          style={secondaryButton}
                          disabled={historialAppsheetLiqPaginaActiva >= historialAppsheetLiqTotalPaginas}
                          onClick={() => setHistorialAppsheetLiqPagina((p) => Math.min(historialAppsheetLiqTotalPaginas, p + 1))}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>

                  </>
                )}
              </div>
            )}

            {historialAppsheetSubmenu === "materialesLiquidacion" && (
              <div style={cardStyle}>
                <h3 style={{ ...sectionTitleStyle, fontSize: "24px" }}>Materiales de liquidación</h3>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                  <button
                    type="button"
                    style={primaryButton}
                    onClick={sincronizarHistorialAppsheetDetalleLiquidacion}
                    disabled={historialAppsheetLoading}
                  >
                    {historialAppsheetLoading ? "Actualizando..." : "Actualizar"}
                  </button>
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={cargarHistorialAppsheetDetalleLiquidacion}
                    disabled={historialAppsheetLoading}
                  >
                    Recargar
                  </button>
                  <span style={{ ...badgeStyle, background: "#eef2ff", color: "#1e3a8a" }}>
                    Registros: {historialAppsheetDetLiq.length}
                  </span>
                </div>

                <input
                  style={{ ...inputStyle, maxWidth: "520px", marginBottom: "12px" }}
                  value={historialAppsheetDetLiqBusqueda}
                  onChange={(e) => setHistorialAppsheetDetLiqBusqueda(e.target.value)}
                  placeholder="Buscar por liquidación, material, cantidad, técnico, cliente, DNI..."
                />
                {historialAppsheetInfo ? <p style={{ color: "#065f46", margin: "0 0 8px 0" }}>{historialAppsheetInfo}</p> : null}
                {historialAppsheetError ? <p style={{ color: "#b91c1c", margin: "0 0 12px 0" }}>{historialAppsheetError}</p> : null}

                {historialAppsheetDetLiqFiltrados.length === 0 ? (
                  <p style={{ color: "#6b7280", margin: 0 }}>No hay datos. Pulsa Actualizar para traer la hoja DetalleLiquidacion.</p>
                ) : (
                  <>
                    <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1260px" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>IDLiqui</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Orden ID</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Liquidación</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Fecha</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Material</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Foto</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Código ONU</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>ONU</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Unidad</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Cantidad</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Precio unit.</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Subtotal</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Técnico</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Cliente</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>DNI</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Nodo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialAppsheetDetLiqPaginaRows.map((row, idx) => {
                            const materialInfo = infoMaterialDetalle(row);
                            return (
                            <tr key={`${row.detalle_key || "det"}-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "10px", fontWeight: 700 }}>
                                {firstText(row.id_liqui, valorLiq(row, "IDLiqui", "ID Liqui", "IdLiqui", "ID"), row.detalle_key, "-")}
                              </td>
                              <td style={{ padding: "10px", fontWeight: 700 }}>{firstText(row.orden_id, valorLiq(row, "OrdenID", "Orden ID", "OrdenId"), "-")}</td>
                              <td style={{ padding: "10px", fontWeight: 700 }}>{firstText(row.liquidacion_codigo, row.orden_id, valorLiq(row, "OrdenID", "Orden ID", "OrdenId"), "-")}</td>
                              <td style={{ padding: "10px" }}>{formatFechaFlexible(row.fecha)}</td>
                              <td style={{ padding: "10px" }}>{materialInfo.nombre}</td>
                              <td style={{ padding: "10px" }}>
                                {materialInfo.fotoUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => abrirFotoZoom(materialInfo.fotoUrl, materialInfo.nombre || "Foto artículo")}
                                    style={{ border: "none", padding: 0, background: "transparent", cursor: "zoom-in" }}
                                    title="Ver foto"
                                  >
                                    <img
                                      src={materialInfo.fotoUrl}
                                      alt={materialInfo.nombre || "Foto"}
                                      style={{
                                        width: "34px",
                                        height: "34px",
                                        objectFit: "cover",
                                        borderRadius: "8px",
                                        border: "1px solid #dbeafe",
                                      }}
                                    />
                                  </button>
                                ) : (
                                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>-</span>
                                )}
                              </td>
                              <td style={{ padding: "10px", fontWeight: 600 }}>
                                {firstText(row.codigo_onu, valorLiq(row, "Codigo ONU", "CodigoONU", "Código ONU"), "-")}
                              </td>
                              <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                                {firstText(row.codigo_onu, valorLiq(row, "Codigo ONU", "CodigoONU", "Código ONU")) ? (
                                  <button
                                    type="button"
                                    style={{ ...infoButton, padding: "6px 10px", minWidth: "72px" }}
                                    onClick={() => void abrirEquipoDesdeCodigoOnu(firstText(row.codigo_onu, valorLiq(row, "Codigo ONU", "CodigoONU", "Código ONU")))}
                                  >
                                    Ver ONU
                                  </button>
                                ) : (
                                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>-</span>
                                )}
                              </td>
                              <td style={{ padding: "10px" }}>{row.unidad || "-"}</td>
                              <td style={{ padding: "10px" }}>{Number.isFinite(Number(row.cantidad)) ? Number(row.cantidad).toFixed(2) : "-"}</td>
                              <td style={{ padding: "10px" }}>
                                {Number.isFinite(Number(firstText(row.precio_unitario, valorLiq(row, "PrecioUnitarioUsado", "PrecioUnitario", "Precio unitario"))))
                                  ? `S/ ${Number(firstText(row.precio_unitario, valorLiq(row, "PrecioUnitarioUsado", "PrecioUnitario", "Precio unitario"))).toFixed(2)}`
                                  : "-"}
                              </td>
                              <td style={{ padding: "10px", fontWeight: 700 }}>
                                {Number.isFinite(Number(firstText(row.subtotal, valorLiq(row, "Costo Material", "Subtotal", "Total"))))
                                  ? `S/ ${Number(firstText(row.subtotal, valorLiq(row, "Costo Material", "Subtotal", "Total"))).toFixed(2)}`
                                  : "-"}
                              </td>
                              <td style={{ padding: "10px" }}>{resolverNombreDesdeCodigoTecnico(row.tecnico || "-") || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.cliente || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.dni || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.nodo || "-"}</td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Página {historialAppsheetDetLiqPaginaActiva} de {historialAppsheetDetLiqTotalPaginas} · {historialAppsheetDetLiqFiltrados.length} registros filtrados
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          style={secondaryButton}
                          onClick={() => setHistorialAppsheetDetLiqPagina((p) => Math.max(1, Number(p || 1) - 1))}
                          disabled={historialAppsheetDetLiqPaginaActiva <= 1}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          style={secondaryButton}
                          onClick={() => setHistorialAppsheetDetLiqPagina((p) => Math.min(historialAppsheetDetLiqTotalPaginas, Number(p || 1) + 1))}
                          disabled={historialAppsheetDetLiqPaginaActiva >= historialAppsheetDetLiqTotalPaginas}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {historialAppsheetSubmenu === "articulos" && (
              <div style={cardStyle}>
                <h3 style={{ ...sectionTitleStyle, fontSize: "24px" }}>Artículos (AppSheet)</h3>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                  <button
                    type="button"
                    style={primaryButton}
                    onClick={sincronizarHistorialAppsheetArticulos}
                    disabled={historialAppsheetLoading}
                  >
                    {historialAppsheetLoading ? "Actualizando..." : "Actualizar"}
                  </button>
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={cargarHistorialAppsheetArticulos}
                    disabled={historialAppsheetLoading}
                  >
                    Recargar
                  </button>
                  <span style={{ ...badgeStyle, background: "#eef2ff", color: "#1e3a8a" }}>
                    Registros: {historialAppsheetArticulos.length}
                  </span>
                </div>
                <input
                  style={{ ...inputStyle, maxWidth: "520px", marginBottom: "12px" }}
                  value={historialAppsheetArtBusqueda}
                  onChange={(e) => setHistorialAppsheetArtBusqueda(e.target.value)}
                  placeholder="Buscar por código, nombre, marca, modelo o info..."
                />
                {historialAppsheetInfo ? <p style={{ color: "#065f46", margin: "0 0 8px 0" }}>{historialAppsheetInfo}</p> : null}
                {historialAppsheetError ? <p style={{ color: "#b91c1c", margin: "0 0 12px 0" }}>{historialAppsheetError}</p> : null}
                {historialAppsheetArtFiltrados.length === 0 ? (
                  <p style={{ color: "#6b7280", margin: 0 }}>No hay datos. Pulsa Actualizar para traer la hoja ARTICULOS.</p>
                ) : (
                  <>
                    <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Código</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Nombre</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Info</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Marca</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Modelo</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Precio unitario</th>
                            <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Foto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialAppsheetArtPaginaRows.map((row, idx) => (
                            <tr key={`${row.id_articulo || row.codigo || "art"}-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "10px", fontWeight: 700 }}>{firstText(row.id_articulo, row.codigo, "-")}</td>
                              <td style={{ padding: "10px" }}>{row.nombre || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.info || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.marca || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.modelo || "-"}</td>
                              <td style={{ padding: "10px", fontWeight: 700 }}>
                                {Number.isFinite(Number(row.precio_unitario)) ? `S/ ${Number(row.precio_unitario).toFixed(2)}` : "-"}
                              </td>
                              <td style={{ padding: "10px" }}>
                                {row.foto_art_url ? (
                                  <button
                                    type="button"
                                    onClick={() => abrirFotoZoom(row.foto_art_url, row.nombre || "Foto artículo")}
                                    style={{ border: "none", padding: 0, background: "transparent", cursor: "pointer" }}
                                  >
                                    <img
                                      src={row.foto_art_url}
                                      alt={row.nombre || "Foto artículo"}
                                      style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                                    />
                                  </button>
                                ) : (
                                  "-"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Página {historialAppsheetArtPaginaActiva} de {historialAppsheetArtTotalPaginas} · {historialAppsheetArtFiltrados.length} registros filtrados
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          style={secondaryButton}
                          onClick={() => setHistorialAppsheetArtPagina((p) => Math.max(1, Number(p || 1) - 1))}
                          disabled={historialAppsheetArtPaginaActiva <= 1}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          style={secondaryButton}
                          onClick={() => setHistorialAppsheetArtPagina((p) => Math.min(historialAppsheetArtTotalPaginas, Number(p || 1) + 1))}
                          disabled={historialAppsheetArtPaginaActiva >= historialAppsheetArtTotalPaginas}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {historialAppsheetSubmenu === "pdf" && (
              <div style={cardStyle}>
                <h3 style={{ ...sectionTitleStyle, fontSize: "24px" }}>Reportes PDF</h3>
                <p style={{ color: "#6b7280", marginTop: 0 }}>Reporte por fecha y técnico con resumen y detalle de materiales por orden.</p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                  <input
                    type="date"
                    style={{ ...inputStyle, maxWidth: "170px" }}
                    value={historialAppsheetPdfFiltro.desde}
                    onChange={(e) => setHistorialAppsheetPdfFiltro((prev) => ({ ...prev, desde: e.target.value }))}
                  />
                  <input
                    type="date"
                    style={{ ...inputStyle, maxWidth: "170px" }}
                    value={historialAppsheetPdfFiltro.hasta}
                    onChange={(e) => setHistorialAppsheetPdfFiltro((prev) => ({ ...prev, hasta: e.target.value }))}
                  />
                  <select
                    style={{ ...inputStyle, maxWidth: "220px" }}
                    value={historialAppsheetPdfFiltro.tecnico}
                    onChange={(e) => setHistorialAppsheetPdfFiltro((prev) => ({ ...prev, tecnico: e.target.value }))}
                  >
                    <option value="TODOS">Técnico: Todos</option>
                    {historialAppsheetLiqTecnicosOpciones.map((t) => (
                      <option key={`pdf-tec-${t}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={() => setHistorialAppsheetPdfFiltro({ desde: "", hasta: "", tecnico: "TODOS" })}
                  >
                    Limpiar
                  </button>
                  <button type="button" style={infoButton} onClick={() => void generarPdfReporteTecnicoHistorial()}>
                    Generar PDF técnico
                  </button>
                  <span style={{ ...badgeStyle, background: "#eef2ff", color: "#1e3a8a" }}>
                    Registros: {historialPdfRows.length}
                  </span>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "12px", paddingTop: "14px" }}>
                  <h4 style={{ margin: "0 0 8px 0", color: "#0f172a" }}>PDF Movimientos (Extracto + DetalleMovimiento)</h4>
                  <p style={{ color: "#6b7280", marginTop: 0 }}>
                    Filtra cuándo retiró/ingresó, qué retiró, técnico, responsable y rango de fechas.
                  </p>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
                    <input
                      type="date"
                      style={{ ...inputStyle, maxWidth: "170px" }}
                      value={historialPdfMovFiltro.desde}
                      onChange={(e) => setHistorialPdfMovFiltro((prev) => ({ ...prev, desde: e.target.value }))}
                    />
                    <input
                      type="date"
                      style={{ ...inputStyle, maxWidth: "170px" }}
                      value={historialPdfMovFiltro.hasta}
                      onChange={(e) => setHistorialPdfMovFiltro((prev) => ({ ...prev, hasta: e.target.value }))}
                    />
                    <select
                      style={{ ...inputStyle, maxWidth: "160px" }}
                      value={historialPdfMovFiltro.tipo}
                      onChange={(e) => setHistorialPdfMovFiltro((prev) => ({ ...prev, tipo: e.target.value }))}
                    >
                      <option value="TODOS">Tipo: Todos</option>
                      <option value="SALIDA">SALIDA</option>
                      <option value="ENTRADA">ENTRADA</option>
                    </select>
                    <select
                      style={{ ...inputStyle, maxWidth: "220px" }}
                      value={historialPdfMovFiltro.tecnico}
                      onChange={(e) => setHistorialPdfMovFiltro((prev) => ({ ...prev, tecnico: e.target.value }))}
                    >
                      <option value="TODOS">Técnico: Todos</option>
                      {historialPdfMovTecnicosOpciones.map((t) => (
                        <option key={`pdf-mov-tec-${t}`} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <select
                      style={{ ...inputStyle, maxWidth: "220px" }}
                      value={historialPdfMovFiltro.responsable}
                      onChange={(e) => setHistorialPdfMovFiltro((prev) => ({ ...prev, responsable: e.target.value }))}
                    >
                      <option value="TODOS">Responsable: Todos</option>
                      {historialPdfMovResponsablesOpciones.map((r) => (
                        <option key={`pdf-mov-resp-${r}`} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <input
                      style={{ ...inputStyle, maxWidth: "300px" }}
                      value={historialPdfMovFiltro.query}
                      onChange={(e) => setHistorialPdfMovFiltro((prev) => ({ ...prev, query: e.target.value }))}
                      placeholder="Qué retiró: producto, código ONU, ID..."
                    />
                    <button
                      type="button"
                      style={secondaryButton}
                      onClick={() =>
                        setHistorialPdfMovFiltro({
                          desde: "",
                          hasta: "",
                          tipo: "TODOS",
                          tecnico: "TODOS",
                          responsable: "TODOS",
                          query: "",
                        })
                      }
                    >
                      Limpiar
                    </button>
                    <button type="button" style={infoButton} onClick={generarPdfMovimientosExtracto}>
                      Generar PDF movimientos
                    </button>
                    <span style={{ ...badgeStyle, background: "#eef2ff", color: "#1e3a8a" }}>
                      Registros: {historialMovimientosPdfFiltrados.length}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {historialAppsheetSubmenu === "extracto" && (
              <div style={cardStyle}>
                <h3 style={{ ...sectionTitleStyle, fontSize: "24px" }}>Extracto (Supabase)</h3>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                  <button type="button" style={primaryButton} onClick={sincronizarHistorialAppsheetExtracto} disabled={historialAppsheetLoading}>
                    {historialAppsheetLoading ? "Actualizando..." : "Actualizar"}
                  </button>
                  <button type="button" style={secondaryButton} onClick={cargarHistorialAppsheetExtracto} disabled={historialAppsheetLoading}>
                    Recargar
                  </button>
                  <span style={{ ...badgeStyle, background: "#eef2ff", color: "#1e3a8a" }}>
                    Registros: {historialAppsheetExtractoFiltrado.length}
                  </span>
                </div>
                <input
                  style={{ ...inputStyle, maxWidth: "420px", marginBottom: "12px" }}
                  value={historialAppsheetExtractoBusqueda}
                  onChange={(e) => setHistorialAppsheetExtractoBusqueda(e.target.value)}
                  placeholder="Buscar por ID, fecha, tipo o responsable..."
                />
                {historialAppsheetInfo ? <p style={{ color: "#065f46", margin: "0 0 8px 0" }}>{historialAppsheetInfo}</p> : null}
                {historialAppsheetError ? <p style={{ color: "#b91c1c", margin: "0 0 12px 0" }}>{historialAppsheetError}</p> : null}
                {historialAppsheetExtractoFiltrado.length === 0 ? (
                  <p style={{ color: "#6b7280", margin: 0 }}>No hay datos en EXTRACTO. Pulsa Actualizar para sincronizar desde la hoja.</p>
                ) : (
                  <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>ID</th>
                          <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>FECHA</th>
                          <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>TIPO</th>
                          <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>RESPONSABLE</th>
                          <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Movimientos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historialAppsheetExtractoFiltrado.map((row, idx) => (
                          <tr key={`ext-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "10px", fontWeight: 700 }}>{row.id || "-"}</td>
                            <td style={{ padding: "10px" }}>{row.fecha || "-"}</td>
                            <td style={{ padding: "10px" }}>{row.tipo || "-"}</td>
                            <td style={{ padding: "10px" }}>{row.responsable || "-"}</td>
                            <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                              {row.id ? (
                                <button
                                  type="button"
                                  style={{ ...infoButton, padding: "6px 10px", minWidth: "92px" }}
                                  onClick={() => void abrirMovimientosPorExtractoId(row.id)}
                                >
                                  Ver ({Number(conteoMovimientosPorId.get(String(row.id || "").trim()) || 0)})
                                </button>
                              ) : (
                                <span style={{ color: "#94a3b8", fontSize: "12px" }}>-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {historialAppsheetSubmenu === "movimientos" && (
              <div style={cardStyle}>
                <h3 style={{ ...sectionTitleStyle, fontSize: "24px" }}>DetalleMovimiento (Supabase)</h3>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                  <button type="button" style={primaryButton} onClick={sincronizarHistorialAppsheetMovimientos} disabled={historialAppsheetLoading}>
                    {historialAppsheetLoading ? "Actualizando..." : "Actualizar"}
                  </button>
                  <button type="button" style={secondaryButton} onClick={cargarHistorialAppsheetMovimientos} disabled={historialAppsheetLoading}>
                    Recargar
                  </button>
                  <span style={{ ...badgeStyle, background: "#eef2ff", color: "#1e3a8a" }}>
                    Registros: {historialAppsheetMovimientosFiltrado.length}
                  </span>
                </div>
                <input
                  style={{ ...inputStyle, maxWidth: "460px", marginBottom: "12px" }}
                  value={historialAppsheetMovimientosBusqueda}
                  onChange={(e) => setHistorialAppsheetMovimientosBusqueda(e.target.value)}
                  placeholder="Buscar en cualquier columna..."
                />
                {historialAppsheetInfo ? <p style={{ color: "#065f46", margin: "0 0 8px 0" }}>{historialAppsheetInfo}</p> : null}
                {historialAppsheetError ? <p style={{ color: "#b91c1c", margin: "0 0 12px 0" }}>{historialAppsheetError}</p> : null}
                {historialAppsheetMovimientosFiltrado.length === 0 ? (
                  <p style={{ color: "#6b7280", margin: 0 }}>No hay datos en DetalleMovimiento. Pulsa Actualizar para sincronizar desde la hoja.</p>
                ) : (
                  <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1200px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {historialAppsheetMovimientosColumnas.map((col) => (
                            <th key={`mov-col-${col}`} style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {historialAppsheetMovimientosFiltrado.map((row, idx) => (
                          <tr key={`mov-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            {historialAppsheetMovimientosColumnas.map((col) => (
                              <td key={`mov-${idx}-${col}`} style={{ padding: "10px", verticalAlign: "top" }}>
                                {(() => {
                                  const raw = String(row?.[col] ?? "").trim();
                                  if (!raw) return "-";
                                  const nk = normalizarClaveSheet(col);
                                  if (nk === "tecnico") return resolverNombreDesdeCodigoTecnico(raw) || raw;
                                  if (nk === "producto" || nk === "articulos") {
                                    return firstText(
                                      historialArticulosInfoPorCodigo.get(normalizarClaveSheet(raw))?.nombre,
                                      raw
                                    );
                                  }
                                  return raw;
                                })()}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {historialAppsheetSubmenu === "conciliacionOnus" && <ConciliacionOnusPanel isMobile={isMobile} />}

            {historialAppsheetSubmenu === "ordenesBaseData" && (
              <div style={{ ...cardStyle, padding: 0, overflow: "hidden", borderColor: "#d7e2ef" }}>
                <div
                  style={{
                    background: "linear-gradient(90deg, #2b79c2 0%, #2f8eda 100%)",
                    color: "#fff",
                    padding: "12px 16px",
                    fontWeight: 700,
                    fontSize: "24px",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Ordenes (BaseData)
                </div>
                <div style={{ padding: "12px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      flexWrap: "wrap",
                      alignItems: "center",
                      padding: "0 2px 8px 2px",
                    }}
                  >
                    <div style={{ color: "#475569", fontSize: "13px" }}>
                      Vista compacta con columnas clave. Usa <strong>Columnas</strong> para mostrar más campos.
                    </div>
                    <div style={{ color: "#64748b", fontSize: "12px" }}>
                      {baseDataOrdenesColumnasActivas.length} columna(s) visibles
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <button
                      type="button"
                      style={{ ...primaryButton, padding: "8px 12px", borderRadius: "10px", fontSize: "13px" }}
                      onClick={sincronizarBaseDataOrdenes}
                      disabled={historialAppsheetLoading}
                    >
                      {historialAppsheetLoading ? "Actualizando..." : "Actualizar"}
                    </button>
                    <button
                      type="button"
                      style={{ ...secondaryButton, padding: "8px 12px", borderRadius: "10px", fontSize: "13px" }}
                      onClick={cargarBaseDataOrdenes}
                      disabled={historialAppsheetLoading}
                    >
                      Recargar
                    </button>
                    <button
                      type="button"
                      style={{ ...secondaryButton, padding: "8px 12px", borderRadius: "10px", fontSize: "13px" }}
                      onClick={() => setBaseDataColsModalOpen(true)}
                    >
                      Columnas
                    </button>
                    <button
                      type="button"
                      style={{ ...secondaryButton, padding: "8px 12px", borderRadius: "10px", fontSize: "13px" }}
                      onClick={generarExcelOrdenesBaseData}
                    >
                      Excel
                    </button>
                    <button
                      type="button"
                      style={{ ...infoButton, padding: "8px 12px", borderRadius: "10px", fontSize: "13px" }}
                      onClick={generarPdfOrdenesBaseData}
                    >
                      PDF
                    </button>
                    <span
                      style={{
                        ...badgeStyle,
                        background: "#e8f1fb",
                        color: "#1d4d8b",
                        marginLeft: "auto",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                      }}
                    >
                      Registros: {baseDataOrdenesFiltrado.length}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "6px",
                      marginBottom: "8px",
                      gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
                    }}
                  >
                    <input
                      type="date"
                      style={{ ...inputStyle, padding: "10px 12px", fontSize: "13px" }}
                      value={baseDataOrdenesFiltro.desde}
                      onChange={(e) => setBaseDataOrdenesFiltro((prev) => ({ ...prev, desde: e.target.value }))}
                    />
                    <input
                      type="date"
                      style={{ ...inputStyle, padding: "10px 12px", fontSize: "13px" }}
                      value={baseDataOrdenesFiltro.hasta}
                      onChange={(e) => setBaseDataOrdenesFiltro((prev) => ({ ...prev, hasta: e.target.value }))}
                    />
                    <select
                      style={{ ...inputStyle, padding: "10px 12px", fontSize: "13px" }}
                      value={baseDataOrdenesFiltro.nodo}
                      onChange={(e) => setBaseDataOrdenesFiltro((prev) => ({ ...prev, nodo: e.target.value }))}
                      disabled={!baseDataOrdenesNodoCol}
                    >
                      <option value="TODOS">Nodo: Todos</option>
                      {baseDataOrdenesNodoOpciones.map((n) => (
                        <option key={`ord-nodo-${n}`} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <select
                      style={{ ...inputStyle, padding: "10px 12px", fontSize: "13px" }}
                      value={baseDataOrdenesFiltro.empresa}
                      onChange={(e) => setBaseDataOrdenesFiltro((prev) => ({ ...prev, empresa: e.target.value }))}
                      disabled={!baseDataOrdenesEmpresaCol}
                    >
                      <option value="TODOS">Empresa: Todos</option>
                      {baseDataOrdenesEmpresaOpciones.map((x) => (
                        <option key={`ord-emp-${x}`} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      style={{ ...secondaryButton, padding: "10px 12px", borderRadius: "10px", fontSize: "13px" }}
                      onClick={() => setBaseDataOrdenesFiltro({ desde: "", hasta: "", nodo: "TODOS", empresa: "TODOS" })}
                    >
                      Limpiar filtros
                    </button>
                  </div>

                  <input
                    style={{ ...inputStyle, marginBottom: "8px", padding: "10px 12px", fontSize: "13px", background: "#fbfdff" }}
                    value={baseDataOrdenesBusqueda}
                    onChange={(e) => setBaseDataOrdenesBusqueda(e.target.value)}
                    placeholder="Buscar en columnas visibles..."
                  />
                  {historialAppsheetInfo ? <p style={{ color: "#065f46", margin: "0 0 8px 0", fontSize: "13px" }}>{historialAppsheetInfo}</p> : null}
                  {historialAppsheetError ? <p style={{ color: "#b91c1c", margin: "0 0 12px 0", fontSize: "13px" }}>{historialAppsheetError}</p> : null}

                  {baseDataOrdenesFiltrado.length === 0 ? (
                    <p style={{ color: "#6b7280", margin: 0 }}>No hay datos en BaseData. Pulsa Actualizar para sincronizar desde la hoja.</p>
                  ) : (
                    <>
                      <div style={{ overflowX: "auto", border: "1px solid #dce6f3", borderRadius: "14px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
                        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: "1320px", background: "#fff" }}>
                          <thead>
                            <tr style={{ background: "#f5f9ff" }}>
                              <th
                                style={{
                                  textAlign: "left",
                                  padding: "8px 10px",
                                  borderBottom: "1px solid #dce6f3",
                                  whiteSpace: "nowrap",
                                  color: "#18457b",
                                  fontWeight: 700,
                                  fontSize: "12px",
                                  width: "72px",
                                  position: "sticky",
                                  left: 0,
                                  background: "#f5f9ff",
                                  zIndex: 1,
                                }}
                              >
                                Ver
                              </th>
                              {baseDataOrdenesColumnasActivas.map((col) => (
                                <th
                                  key={`ord-col-${col}`}
                                  style={{
                                    textAlign: "left",
                                    padding: "8px 10px",
                                    borderBottom: "1px solid #dce6f3",
                                    whiteSpace: "nowrap",
                                    color: "#18457b",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                    ...estiloColumnaBaseData(col),
                                  }}
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {baseDataOrdenesPaginaRows.map((row, idx) => (
                              <tr
                                key={`ord-row-${idx}`}
                                style={{
                                  borderBottom: "1px solid #edf2f7",
                                  background: baseDataOrdenDetalle === row ? "#eff6ff" : "#fff",
                                }}
                              >
                                <td
                                  style={{
                                    padding: "8px 10px",
                                    verticalAlign: "middle",
                                    position: "sticky",
                                    left: 0,
                                    background: baseDataOrdenDetalle === row ? "#eff6ff" : "#fff",
                                    borderRight: "1px solid #e2e8f0",
                                    borderBottom: "1px solid #edf2f7",
                                  }}
                                >
                                  <button
                                    type="button"
                                    style={{ ...infoButton, padding: "6px 10px", borderRadius: "999px", fontSize: "12px", minWidth: "46px" }}
                                    onClick={() => setBaseDataOrdenDetalle(row)}
                                  >
                                    Ver
                                  </button>
                                </td>
                                {baseDataOrdenesColumnasActivas.map((col) => (
                                  <td
                                    key={`ord-${idx}-${col}`}
                                    style={{
                                      padding: "8px 10px",
                                      verticalAlign: "top",
                                      fontSize: "13px",
                                      lineHeight: 1.35,
                                      color: "#1e293b",
                                      borderBottom: "1px solid #edf2f7",
                                      ...estiloColumnaBaseData(col),
                                    }}
                                  >
                                    {esCampoFotoBaseData(row, col) ? (
                                      (() => {
                                        const photoUrl = resolverFotoBaseData(row, col);
                                        const rawValue = valorCeldaBaseData(row, col);
                                        if (!photoUrl) return rawValue;
                                        return (
                                          <button
                                            type="button"
                                            onClick={() => abrirFotoZoom(photoUrl, col)}
                                            style={{
                                              border: "1px solid #dbe6f5",
                                              borderRadius: "12px",
                                              background: "#f8fbff",
                                              padding: "4px",
                                              cursor: "pointer",
                                              display: "grid",
                                              gap: "4px",
                                              width: "78px",
                                              justifyItems: "center",
                                            }}
                                            title={rawValue}
                                          >
                                            <img
                                              src={photoUrl}
                                              alt={col}
                                              style={{ width: "68px", height: "68px", objectFit: "cover", borderRadius: "10px" }}
                                            />
                                            <span style={{ fontSize: "10px", color: "#2563eb", fontWeight: 700 }}>Abrir</span>
                                          </button>
                                        );
                                      })()
                                    ) : (
                                      <div
                                        title={valorCeldaBaseData(row, col)}
                                        style={{
                                          maxWidth: "220px",
                                          overflow: "hidden",
                                          wordBreak: "break-word",
                                          display: "-webkit-box",
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: "vertical",
                                        }}
                                      >
                                        {valorCeldaBaseData(row, col)}
                                      </div>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginTop: "8px",
                        }}
                      >
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          Mostrando página {baseDataOrdenesPaginaActiva} de {baseDataOrdenesTotalPaginas} · {baseDataOrdenesFiltrado.length} registros
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            style={{ ...secondaryButton, padding: "7px 10px", borderRadius: "10px", fontSize: "12px" }}
                            onClick={() => setBaseDataOrdenesPagina((p) => Math.max(1, Number(p || 1) - 1))}
                            disabled={baseDataOrdenesPaginaActiva <= 1}
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            style={{ ...secondaryButton, padding: "7px 10px", borderRadius: "10px", fontSize: "12px" }}
                            onClick={() => setBaseDataOrdenesPagina((p) => Math.min(baseDataOrdenesTotalPaginas, Number(p || 1) + 1))}
                            disabled={baseDataOrdenesPaginaActiva >= baseDataOrdenesTotalPaginas}
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {vistaActiva === "historialAppsheet" && historialAppsheetSubmenu === "liquidaciones" && historialAppsheetLiqDetalle ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 70,
              background: "rgba(2, 6, 23, 0.65)",
              display: "grid",
              placeItems: "center",
              padding: "18px",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setHistorialAppsheetLiqDetalle(null);
            }}
          >
            <div
              style={{
                width: "min(1100px, 100%)",
                maxHeight: "90vh",
                overflow: "auto",
                borderRadius: "14px",
                border: "1px solid #dbe6f5",
                background: "#f8fbff",
                padding: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, color: "#123f6b" }}>
                  Detalle: {valorLiq(historialAppsheetLiqDetalle, "codigo", "Código") || "-"}
                </h4>
                <button type="button" style={secondaryButton} onClick={() => setHistorialAppsheetLiqDetalle(null)}>
                  Cerrar
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "8px" }}>
                <div><strong>Orden ID:</strong> {valorLiq(historialAppsheetLiqDetalle, "orden_id", "Orden ID") || "-"}</div>
                <div><strong>Actuación:</strong> {valorLiq(historialAppsheetLiqDetalle, "actuacion", "Actuacion") || "-"}</div>
                <div><strong>Orden:</strong> {valorLiq(historialAppsheetLiqDetalle, "orden", "Orden") || "-"}</div>
                <div><strong>Tipo actuación:</strong> {valorLiq(historialAppsheetLiqDetalle, "tipo_actuacion", "Tipo de actuacion") || "-"}</div>
                <div><strong>Cliente:</strong> {valorLiq(historialAppsheetLiqDetalle, "cliente", "nombre", "Nombre", "Cliente") || "-"}</div>
                <div><strong>DNI:</strong> {valorLiq(historialAppsheetLiqDetalle, "dni", "DNI", "Cedula") || "-"}</div>
                <div><strong>Dirección:</strong> {valorLiq(historialAppsheetLiqDetalle, "direccion", "Direccion") || "-"}</div>
                <div><strong>Celular:</strong> {valorLiq(historialAppsheetLiqDetalle, "celular", "Celular") || "-"}</div>
                <div><strong>Ubicación GPS:</strong> {valorLiq(historialAppsheetLiqDetalle, "ubicacion_gps", "Ubicacion GPS") || "-"}</div>
                <div><strong>User:</strong> {valorLiq(historialAppsheetLiqDetalle, "user_hotspot", "User") || "-"}</div>
                <div><strong>User PPPoE:</strong> {valorLiq(historialAppsheetLiqDetalle, "user_pppoe", "UserPPoe") || "-"}</div>
                <div><strong>Parámetro:</strong> {valorLiq(historialAppsheetLiqDetalle, "parametro", "Parametro") || "-"}</div>
                <div><strong>Método pago:</strong> {valorLiq(historialAppsheetLiqDetalle, "metodo_pago", "Metodo de pago") || "-"}</div>
                <div><strong>Drop (monto plan):</strong> {valorLiq(historialAppsheetLiqDetalle, "drop_monto_plan", "Drop") || "-"}</div>
                <div><strong>Conector/Fibra/Velocidad:</strong> {valorLiq(historialAppsheetLiqDetalle, "conector_fibra_velocidad", "Conector Fibra Velocidad") || "-"}</div>
                <div><strong>Cable RG6 (etiqueta):</strong> {valorLiq(historialAppsheetLiqDetalle, "cable_rg6_codigo_etiqueta", "Cable RG6") || "-"}</div>
                <div><strong>Personal técnico:</strong> {tecnicoLiqNombre(historialAppsheetLiqDetalle)}</div>
                <div><strong>Autor:</strong> {valorLiq(historialAppsheetLiqDetalle, "autor", "Autor") || "-"}</div>
                <div><strong>Empresa:</strong> {valorLiq(historialAppsheetLiqDetalle, "empresa", "Empresa", "empresa") || "-"}</div>
                <div><strong>Resultado:</strong> {valorLiq(historialAppsheetLiqDetalle, "resultado", "Estado") || "-"}</div>
              </div>

              <div
                style={{
                  marginTop: "12px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                }}
              >
                <strong>Observación:</strong>{" "}
                {valorLiq(historialAppsheetLiqDetalle, "observacion", "Observacion", "Observación") || "-"}
              </div>

              <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: "10px" }}>
                {[
                  { k: "captura_pago_url", t: "Captura pago" },
                  { k: "foto_fachada_url", t: "Foto fachada" },
                  { k: "foto_opcional_url", t: "Foto opcional" },
                  { k: "foto_onu_url", t: "Foto ONU" },
                  { k: "photo_caj_url", t: "Photo Caj" },
                  { k: "photo_onu_url", t: "Photo Onu" },
                ]
                  .map((x) => ({ ...x, url: valorLiq(historialAppsheetLiqDetalle, x.k) }))
                  .filter((x) => Boolean(x.url))
                  .map((x) => (
                    <button
                      key={x.k}
                      type="button"
                      onClick={() => abrirFotoZoom(x.url, x.t)}
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: "10px",
                        padding: "4px",
                        background: "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      title={x.t}
                    >
                      <img src={x.url} alt={x.t} style={{ width: "100%", height: "86px", objectFit: "cover", borderRadius: "8px" }} />
                      <div style={{ fontSize: "11px", color: "#334155", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {x.t}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        ) : null}

        {vistaActiva === "historialAppsheet" && historialAppsheetSubmenu === "liquidaciones" && historialAppsheetLiqMaterialesTarget ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 71,
              background: "rgba(2, 6, 23, 0.65)",
              display: "grid",
              placeItems: "center",
              padding: "18px",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setHistorialAppsheetLiqMaterialesTarget(null);
            }}
          >
            <div
              style={{
                width: "min(980px, 100%)",
                maxHeight: "90vh",
                overflow: "auto",
                borderRadius: "14px",
                border: "1px solid #dbe6f5",
                background: "#f8fbff",
                padding: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, color: "#123f6b" }}>
                  Materiales de liquidación: {valorLiq(historialAppsheetLiqMaterialesTarget, "codigo", "Código") || "-"}
                </h4>
                <button type="button" style={secondaryButton} onClick={() => setHistorialAppsheetLiqMaterialesTarget(null)}>
                  Cerrar
                </button>
              </div>
              <p style={{ margin: "0 0 10px 0", color: "#475569", fontSize: "13px" }}>
                Cruce por Orden ID: <strong>{valorLiq(historialAppsheetLiqMaterialesTarget, "orden_id", "Orden ID") || "-"}</strong>
                {" · "}
                Código: <strong>{valorLiq(historialAppsheetLiqMaterialesTarget, "codigo", "Código") || "-"}</strong>
                {" · "}
                Total materiales: <strong>{`S/ ${Number(totalMaterialesLiquidacionSeleccionada || 0).toFixed(2)}`}</strong>
              </p>
              {materialesDeLiquidacionSeleccionada.length === 0 ? (
                <p style={{ color: "#6b7280", margin: 0 }}>No se encontraron materiales vinculados para esta liquidación.</p>
              ) : (
                <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Material</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Foto</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Código ONU</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>ONU</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Unidad</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Cantidad</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Precio unit.</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialesDeLiquidacionSeleccionada.map((m, idx) => {
                        const materialInfo = infoMaterialDetalle(m);
                        return (
                        <tr key={`${m.detalle_key || "det"}-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px" }}>{materialInfo.nombre}</td>
                          <td style={{ padding: "10px" }}>
                            {materialInfo.fotoUrl ? (
                              <button
                                type="button"
                                onClick={() => abrirFotoZoom(materialInfo.fotoUrl, materialInfo.nombre || "Foto artículo")}
                                style={{ border: "none", padding: 0, background: "transparent", cursor: "zoom-in" }}
                                title="Ver foto"
                              >
                                <img
                                  src={materialInfo.fotoUrl}
                                  alt={materialInfo.nombre || "Foto"}
                                  style={{
                                    width: "34px",
                                    height: "34px",
                                    objectFit: "cover",
                                    borderRadius: "8px",
                                    border: "1px solid #dbeafe",
                                  }}
                                />
                              </button>
                            ) : (
                              <span style={{ color: "#94a3b8", fontSize: "12px" }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: "10px", fontWeight: 600 }}>
                            {firstText(m.codigo_onu, valorLiq(m, "Codigo ONU", "CodigoONU", "Código ONU"), "-")}
                          </td>
                          <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                            {firstText(m.codigo_onu, valorLiq(m, "Codigo ONU", "CodigoONU", "Código ONU")) ? (
                              <button
                                type="button"
                                style={{ ...infoButton, padding: "6px 10px", minWidth: "72px" }}
                                onClick={() => void abrirEquipoDesdeCodigoOnu(firstText(m.codigo_onu, valorLiq(m, "Codigo ONU", "CodigoONU", "Código ONU")))}
                              >
                                Ver ONU
                              </button>
                            ) : (
                              <span style={{ color: "#94a3b8", fontSize: "12px" }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: "10px" }}>{m.unidad || "-"}</td>
                          <td style={{ padding: "10px" }}>{Number.isFinite(Number(m.cantidad)) ? Number(m.cantidad).toFixed(2) : "-"}</td>
                          <td style={{ padding: "10px" }}>{Number.isFinite(Number(m.precio_unitario)) ? `S/ ${Number(m.precio_unitario).toFixed(2)}` : "-"}</td>
                          <td style={{ padding: "10px", fontWeight: 700 }}>
                            {Number.isFinite(Number(m.subtotal)) ? `S/ ${Number(m.subtotal).toFixed(2)}` : "-"}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {puedeVerReportes && vistaActiva === "reportes" && (
          <div style={{ display: "grid", gap: "24px" }}>
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Reportes de actuaciones</h2>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" style={infoButton} onClick={imprimirReporteActuaciones}>
                    PDF actuaciones
                  </button>
                  <button type="button" style={secondaryButton} onClick={exportarCsvActuaciones}>
                    CSV actuaciones
                  </button>
                  <button type="button" style={secondaryButton} onClick={imprimirReporteMateriales}>
                    PDF materiales
                  </button>
                  <button type="button" style={secondaryButton} onClick={exportarCsvMateriales}>
                    CSV materiales
                  </button>
                </div>
              </div>
              <div style={formGridStyle}>
                <div>
                  <label style={labelStyle}>Desde</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={reporteDesde}
                    onChange={(e) => setReporteDesde(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Hasta</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={reporteHasta}
                    onChange={(e) => setReporteHasta(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Nodo</label>
                  <select style={inputStyle} value={reporteNodo} onChange={(e) => setReporteNodo(e.target.value)}>
                    <option value="TODOS">Todos</option>
                    {nodosReporte.map((nodo) => (
                      <option key={nodo} value={nodo}>
                        {nodo}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Tecnico</label>
                  <select
                    style={inputStyle}
                    value={reporteTecnico}
                    onChange={(e) => setReporteTecnico(e.target.value)}
                  >
                    <option value="TODOS">Todos</option>
                    {tecnicosReporte.map((tec) => (
                      <option key={tec} value={tec}>
                        {tec}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select style={inputStyle} value={reporteTipo} onChange={(e) => setReporteTipo(e.target.value)}>
                    <option value="TODOS">Todos</option>
                    <option value="INSTALACION">Instalacion</option>
                    <option value="INCIDENCIA">Incidencia</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Buscar</label>
                  <input
                    style={inputStyle}
                    value={reporteBusqueda}
                    onChange={(e) => setReporteBusqueda(e.target.value)}
                    placeholder="Codigo, cliente, DNI, tecnico..."
                  />
                </div>
              </div>
            </div>

            <div style={gridStyle}>
              <div style={cardStyle}>
                <div style={{ fontSize: "13px", color: "#6b7280" }}>Actuaciones</div>
                <div style={{ fontSize: "28px", fontWeight: 800 }}>{liquidacionesReporte.length}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: "13px", color: "#6b7280" }}>Instalaciones</div>
                <div style={{ fontSize: "28px", fontWeight: 800 }}>{reporteResumen.instalaciones}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: "13px", color: "#6b7280" }}>Incidencias</div>
                <div style={{ fontSize: "28px", fontWeight: 800 }}>{reporteResumen.incidencias}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: "13px", color: "#6b7280" }}>Costo actuaciones</div>
                <div style={{ fontSize: "28px", fontWeight: 800 }}>
                  S/ {Number(reporteResumen.costoActuacion || 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>
                Monto cobrado total: <strong>S/ {Number(reporteResumen.montoCobrado || 0).toFixed(2)}</strong>
              </div>
              {liquidacionesReporte.length === 0 ? (
                <p style={{ color: "#6b7280", margin: 0 }}>No hay registros para este filtro.</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {reporteActuacionesPagina.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "14px",
                        padding: "12px",
                        background: "#fafafa",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {item.codigo} - {item.nombre}
                      </div>
                      <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                        {item.tipoActuacion || "-"} | Nodo: {item.nodo || "-"} | Tecnico:{" "}
                        {item.liquidacion?.tecnicoLiquida || item.tecnico || "-"}
                      </div>
                      <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                        Fecha: {item.fechaLiquidacion || "-"} | Monto cobrado: S/{" "}
                        {Number(item.liquidacion?.montoCobrado || item.montoCobrado || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                      Página {reportePaginaAct} de {totalPaginasAct} · {liquidacionesReporte.length} registros
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        style={secondaryButton}
                        onClick={() => setReportePaginaAct((p) => Math.max(1, p - 1))}
                        disabled={reportePaginaAct <= 1}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        style={secondaryButton}
                        onClick={() => setReportePaginaAct((p) => Math.min(totalPaginasAct, p + 1))}
                        disabled={reportePaginaAct >= totalPaginasAct}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>Materiales usados (resumen)</h3>
              {reporteMateriales.length === 0 ? (
                <p style={{ color: "#6b7280", margin: 0 }}>Sin materiales para este filtro.</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {reporteMaterialesPagina.map((item, idx) => (
                    <div
                      key={`${item.material}-${item.unidad}-${idx}`}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        padding: "10px 12px",
                        background: "#fafafa",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {item.material} ({item.unidad})
                      </div>
                      <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                        Cantidad: {Number(item.cantidad || 0).toFixed(2)} | Costo: S/{" "}
                        {Number(item.costo || 0).toFixed(2)} | Actuaciones: {Number(item.actuaciones || 0)}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                      Página {reportePaginaMat} de {totalPaginasMat} · {reporteMateriales.length} materiales
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        style={secondaryButton}
                        onClick={() => setReportePaginaMat((p) => Math.max(1, p - 1))}
                        disabled={reportePaginaMat <= 1}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        style={secondaryButton}
                        onClick={() => setReportePaginaMat((p) => Math.min(totalPaginasMat, p + 1))}
                        disabled={reportePaginaMat >= totalPaginasMat}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {vistaActiva === "mapa" && (
          <MapaPanel
            sessionUser={usuarioSesion}
            rolSesion={rolSesion}
            aplicaFiltroNodosGestora={false}
            nodosSesionPermitidos={[]}
            ordenesFallback={ordenes}
          />
        )}

        {vistaActiva === "consultaApi" && <ConsultaApiPanel />}

        {vistaActiva === "diagnosticoServicio" && (
          <div style={{ display: "grid", gap: "24px" }}>
            <div style={cardStyle}>
              <div style={{ display: "grid", gap: "6px", marginBottom: "18px" }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Diagnóstico de servicio</h2>
                <p style={{ ...subtitleStyle, margin: 0 }}>
                  Consulta operativa por DNI para identificar el usuario PPPoE, el nodo asociado y validar su estado actual en MikroTik por API.
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                {puedeDiagnosticoPorDni ? (
                  <button
                    type="button"
                    style={diagnosticoServicioModo === "dni" ? primaryButton : secondaryButton}
                    onClick={() => {
                      setDiagnosticoServicioModo("dni");
                      setDiagnosticoServicioError("");
                    }}
                  >
                    Buscar por DNI
                  </button>
                ) : null}
                {puedeDiagnosticoConsultaDirecta ? (
                  <button
                    type="button"
                    style={diagnosticoServicioModo === "manual" ? primaryButton : secondaryButton}
                    onClick={() => {
                      setDiagnosticoServicioModo("manual");
                      setDiagnosticoServicioError("");
                    }}
                  >
                    Consulta directa por usuario
                  </button>
                ) : null}
              </div>

              {diagnosticoServicioModosDisponibles.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, max-content))",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
                  {diagnosticoServicioModo === "dni" ? (
                    <input
                      style={inputStyle}
                      value={diagnosticoServicioDni}
                      onChange={(e) => setDiagnosticoServicioDni(String(e.target.value || "").replace(/\D/g, "").slice(0, 8))}
                      placeholder="Ingresa DNI"
                      maxLength={8}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void consultarDiagnosticoServicio();
                      }}
                    />
                  ) : (
                    <>
                      <select
                        style={inputStyle}
                        value={diagnosticoServicioManualNodo}
                        onChange={(e) => setDiagnosticoServicioManualNodo(e.target.value)}
                      >
                        {NODOS_BASE_WEB.filter((nodo) => nodo !== "Nod_05").map((nodo) => (
                          <option key={nodo} value={nodo}>
                            {nodo}
                          </option>
                        ))}
                      </select>
                      <input
                        style={{ ...inputStyle, minWidth: "240px" }}
                        value={diagnosticoServicioManualUser}
                        onChange={(e) => setDiagnosticoServicioManualUser(String(e.target.value || "").trimStart())}
                        placeholder="Ingresa usuario PPPoE"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void consultarDiagnosticoServicio();
                        }}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    style={primaryButton}
                    onClick={() => void consultarDiagnosticoServicio()}
                    disabled={
                      diagnosticoServicioLoading ||
                      (diagnosticoServicioModo === "dni"
                        ? String(diagnosticoServicioDni || "").trim().length !== 8
                        : !String(diagnosticoServicioManualUser || "").trim() || !String(diagnosticoServicioManualNodo || "").trim())
                    }
                  >
                    {diagnosticoServicioLoading ? "Consultando..." : "Consultar"}
                  </button>
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={() => {
                      setDiagnosticoServicioDni("");
                      setDiagnosticoServicioManualUser("");
                      setDiagnosticoServicioManualNodo("Nod_01");
                      setDiagnosticoServicioConsulta("");
                      setDiagnosticoServicioResultado(null);
                      setDiagnosticoServicioError("");
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid #fed7aa",
                    borderRadius: "12px",
                    padding: "10px 12px",
                    background: "#fff7ed",
                    color: "#9a3412",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Tu usuario no tiene permisos habilitados para consultas en este módulo.
                </div>
              )}

              {puedeDiagnosticoSuspensionManual ? (
                <div
                  style={{
                    marginTop: "14px",
                    border: "1px solid #dbe6f5",
                    borderRadius: "14px",
                    padding: "14px",
                    background: "#f8fbff",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Operación directa</div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                    Suspensión manual
                  </div>
                  <div style={{ fontSize: "13px", color: "#334155" }}>
                    Usa solo nodo y usuario PPPoE para suspender o activar por address-list.
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, max-content))",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
                  <select
                    style={inputStyle}
                    value={diagnosticoSuspensionManualNodo}
                    onChange={(e) => setDiagnosticoSuspensionManualNodo(e.target.value)}
                  >
                    {NODOS_BASE_WEB.filter((nodo) => nodo !== "Nod_05").map((nodo) => (
                      <option key={`susp-manual-${nodo}`} value={nodo}>
                        {nodo}
                      </option>
                    ))}
                  </select>
                  <input
                    style={{ ...inputStyle, minWidth: "240px" }}
                    value={diagnosticoSuspensionManualUser}
                    onChange={(e) => setDiagnosticoSuspensionManualUser(String(e.target.value || "").trimStart())}
                    placeholder="Usuario PPPoE"
                  />
                  <button
                    type="button"
                    style={warningButton}
                    onClick={() => void ejecutarSuspensionManualDiagnostico("suspender")}
                    disabled={
                      diagnosticoSuspensionManualLoading === "suspender" ||
                      !String(diagnosticoSuspensionManualNodo || "").trim() ||
                      !String(diagnosticoSuspensionManualUser || "").trim()
                    }
                  >
                    {diagnosticoSuspensionManualLoading === "suspender" ? "Suspendiendo..." : "Suspender"}
                  </button>
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={() => void ejecutarSuspensionManualDiagnostico("activar")}
                    disabled={
                      diagnosticoSuspensionManualLoading === "activar" ||
                      !String(diagnosticoSuspensionManualNodo || "").trim() ||
                      !String(diagnosticoSuspensionManualUser || "").trim()
                    }
                  >
                    {diagnosticoSuspensionManualLoading === "activar" ? "Activando..." : "Activar"}
                  </button>
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={() => {
                      setDiagnosticoSuspensionManualNodo("Nod_01");
                      setDiagnosticoSuspensionManualUser("");
                      setDiagnosticoSuspensionManualInfo("");
                      setDiagnosticoSuspensionManualError("");
                    }}
                  >
                    Limpiar
                  </button>
                </div>

                {diagnosticoSuspensionManualError ? (
                  <div
                    style={{
                      border: "1px solid #fed7aa",
                      borderRadius: "12px",
                      padding: "10px 12px",
                      background: "#fff7ed",
                      color: "#9a3412",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    {diagnosticoSuspensionManualError}
                  </div>
                ) : null}

                {diagnosticoSuspensionManualInfo ? (
                  <div
                    style={{
                      border: "1px solid #bfdbfe",
                      borderRadius: "12px",
                      padding: "10px 12px",
                      background: "#eff6ff",
                      color: "#1e3a8a",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    {diagnosticoSuspensionManualInfo}
                  </div>
                ) : null}
                </div>
              ) : null}

              {diagnosticoServicioConsulta ? (
                <div style={{ marginTop: "18px", display: "grid", gap: "16px" }}>
                  <div
                    style={{
                      border: "1px solid #dbe6f5",
                      borderRadius: "16px",
                      padding: "16px",
                      background: diagnosticoServicioModo === "manual" || diagnosticoServicioCliente ? "#f8fbff" : "#fff7ed",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Resultado base de abonados</div>
                        <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
                          {diagnosticoServicioModo === "manual"
                            ? diagnosticoServicioPppoe || "Consulta manual"
                            : diagnosticoServicioCliente
                              ? diagnosticoServicioCliente.nombre || "Cliente encontrado"
                              : "Cliente no encontrado"}
                        </div>
                        <div style={{ fontSize: "13px", color: "#475569", marginTop: "4px" }}>
                          {diagnosticoServicioModo === "manual" ? (
                            <>
                              Usuario consultado: <strong>{diagnosticoServicioConsulta}</strong> · Nodo: <strong>{diagnosticoServicioNodo || "-"}</strong>
                            </>
                          ) : (
                            <>
                              DNI consultado: <strong>{diagnosticoServicioConsulta}</strong>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        style={
                          diagnosticoServicioCliente
                            ? badgeSuccess
                            : { ...badgeStyle, background: "#ffedd5", color: "#9a3412" }
                        }
                      >
                        {diagnosticoServicioModo === "manual"
                          ? "Consulta manual"
                          : diagnosticoServicioCliente
                            ? "Encontrado en base"
                            : "Sin coincidencias"}
                      </span>
                    </div>

                    {diagnosticoServicioModo === "manual" ? (
                      <div
                        style={{
                          marginTop: "14px",
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: "10px",
                        }}
                      >
                        <div><strong>Nodo:</strong> {diagnosticoServicioNodo || "-"}</div>
                        <div><strong>User PPPoE:</strong> {diagnosticoServicioPppoe || "-"}</div>
                        <div><strong>Origen:</strong> Consulta directa</div>
                      </div>
                    ) : diagnosticoServicioCliente ? (
                      <div
                        style={{
                          marginTop: "14px",
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: "10px",
                        }}
                      >
                        <div><strong>Cliente:</strong> {diagnosticoServicioCliente.nombre || "-"}</div>
                        <div><strong>DNI:</strong> {diagnosticoServicioCliente.dni || "-"}</div>
                        <div><strong>Celular:</strong> {diagnosticoServicioCliente.celular || "-"}</div>
                        <div><strong>Nodo:</strong> {diagnosticoServicioNodo || "-"}</div>
                        <div><strong>User PPPoE:</strong> {diagnosticoServicioPppoe || "-"}</div>
                        <div><strong>Empresa:</strong> {diagnosticoServicioCliente.empresa || "-"}</div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <strong>Dirección:</strong> {diagnosticoServicioCliente.direccion || "-"}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: "12px", color: "#9a3412", fontSize: "13px" }}>
                        No se encontró un abonado visible para este DNI dentro de la base y nodos permitidos de la sesión actual.
                      </div>
                    )}
                  </div>

                  {diagnosticoServicioError ? (
                    <div
                      style={{
                        border: "1px solid #fed7aa",
                        borderRadius: "14px",
                        padding: "12px 14px",
                        background: "#fff7ed",
                        color: "#9a3412",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      {diagnosticoServicioError}
                    </div>
                  ) : null}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                    <div
                      style={{
                        border: `1px solid ${diagnosticoEstadoVisual.tone.border}`,
                        borderRadius: "16px",
                        padding: "16px",
                        background: diagnosticoMikrotik ? diagnosticoEstadoVisual.tone.bg : "#ffffff",
                        boxShadow: diagnosticoMikrotik ? `inset 0 1px 0 rgba(255,255,255,0.8), 0 10px 30px -24px ${diagnosticoEstadoVisual.tone.accent}` : "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>Estado MikroTik</div>
                          <div style={{ fontSize: "22px", fontWeight: 900, color: diagnosticoMikrotik ? diagnosticoEstadoVisual.tone.text : "#0f172a", letterSpacing: "-0.02em" }}>
                            {diagnosticoEstadoVisual.label}
                          </div>
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "10px 14px",
                            borderRadius: "999px",
                            background: diagnosticoEstadoVisual.tone.soft,
                            color: diagnosticoEstadoVisual.tone.text,
                            border: `1px solid ${diagnosticoEstadoVisual.tone.border}`,
                            fontSize: "12px",
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "999px",
                              background: diagnosticoEstadoVisual.tone.accent,
                              boxShadow: `0 0 0 4px ${diagnosticoEstadoVisual.tone.soft}`,
                              flexShrink: 0,
                            }}
                          />
                          {diagnosticoEstadoVisual.chip}
                        </span>
                      </div>
                      <p style={{ margin: "10px 0 0 0", color: "#475569", fontSize: "13px", lineHeight: 1.5 }}>
                        {diagnosticoServicioResultado
                          ? `La consulta se resolvió usando ${diagnosticoMikrotik?.origen || "MikroTik"}.`
                          : "Cuando el backend esté configurado, aquí verás el estado actual en PPP Active y el respaldo en PPP Secret."}
                      </p>

                      <div
                        style={{
                          marginTop: "16px",
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        <div
                          style={{
                            borderRadius: "14px",
                            padding: "14px",
                            background: "#ffffff",
                            border: `1px solid ${diagnosticoEstadoVisual.tone.border}`,
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>Uptime</div>
                          <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 900, color: diagnosticoMikrotik ? diagnosticoEstadoVisual.tone.text : "#0f172a", lineHeight: 1.1 }}>
                            {formatMikrotikUptime(diagnosticoMikrotik?.uptime)}
                          </div>
                          <div style={{ marginTop: "6px", fontSize: "12px", color: "#64748b" }}>
                            Valor crudo: {diagnosticoMikrotik?.uptime || "-"}
                          </div>
                        </div>

                        <div
                          style={{
                            borderRadius: "14px",
                            padding: "14px",
                            background: "#ffffff",
                            border: `1px solid ${diagnosticoEstadoVisual.tone.border}`,
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>IP activa</div>
                          <div style={{ marginTop: "8px", fontSize: "22px", fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
                            {diagnosticoMikrotik?.ip || "-"}
                          </div>
                          <div style={{ marginTop: "6px", fontSize: "12px", color: "#64748b" }}>
                            Router: {diagnosticoMikrotik?.router?.nombre || "-"}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: "14px",
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                          gap: "10px",
                        }}
                      >
                        {[
                          { label: "Router destino", value: diagnosticoMikrotik?.router?.nombre || "-" },
                          { label: "Caller-ID", value: diagnosticoMikrotik?.callerId || "-" },
                          { label: "Profile", value: diagnosticoMikrotik?.profile || "-" },
                          { label: "Disabled", value: formatDiagnosticoBoolean(diagnosticoMikrotik?.disabled) },
                          { label: "Ultima conexion", value: diagnosticoMikrotik?.lastLoggedOut || "-" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            style={{
                              borderRadius: "12px",
                              padding: "12px 13px",
                              background: diagnosticoMikrotik ? "rgba(255,255,255,0.72)" : "#f8fafc",
                              border: "1px solid rgba(148, 163, 184, 0.22)",
                            }}
                          >
                            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>
                              {item.label}
                            </div>
                            <div style={{ marginTop: "6px", fontSize: "15px", fontWeight: 700, color: "#0f172a", lineHeight: 1.35, wordBreak: "break-word" }}>
                              {item.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid #dbe6f5",
                        borderRadius: "16px",
                        padding: "16px",
                        background: "#f8fbff",
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>Datos requeridos</div>
                      <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", marginBottom: "10px" }}>
                        Checklist de activación
                      </div>
                      <div style={{ display: "grid", gap: "8px", fontSize: "13px", color: "#334155" }}>
                        <div>1. Relación exacta de nodo a router MikroTik.</div>
                        <div>2. IP o host de cada router por VPN.</div>
                        <div>3. Puerto API de cada router, normalmente <strong>8730</strong>.</div>
                        <div>4. Usuario API y forma de autenticación.</div>
                        <div>5. Rango VPN permitido en <strong>Available From</strong>.</div>
                        <div>6. Confirmación del campo que contiene el user PPPoE en tu base.</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: "16px", color: "#64748b", fontSize: "13px" }}>
                  {diagnosticoServicioModo === "manual"
                    ? "Ingresa el nodo y el usuario PPPoE para consultar directo contra MikroTik."
                    : "Ingresa un DNI de 8 dígitos para consultar primero contra la base de abonados."}
                </div>
              )}
            </div>
          </div>
        )}

        {vistaActiva === "smartOlt" && <SmartOltPanel />}

        {vistaActiva === "seguimientoTecnicos" && (
          <SeguimientoTecnicosPanel sessionUser={usuarioSesion} rolSesion={rolSesion} />
        )}

        {puedeVerPlantaExterna && vistaActiva === "plantaExterna" ? (
          <PlantaExternaPanel sessionUser={usuarioSesion} />
        ) : null}

        {vistaActiva === "inventario" && (
          <InventarioPanel initialTab={rolSesion === "Tecnico" ? "stockTecnico" : "registro"} sessionUser={usuarioSesion} />
        )}

        {esAdminSesion && vistaActiva === "almacenes" && (
          <InventarioPanel initialTab="almacenes" sessionUser={usuarioSesion} />
        )}
        {puedeVerUsuarios && vistaActiva === "usuarios" && (
          <div style={{ display: "grid", gap: "24px" }}>
            <div style={{ ...cardStyle, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Administración</h2>
                  <p style={{ ...subtitleStyle, margin: 0 }}>
                    Separa la gestión del personal y la configuración técnica para trabajar más rápido.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setUsuariosPanelTab("personal")}
                    style={usuariosPanelTab === "personal" ? primaryButton : secondaryButton}
                  >
                    Personal
                  </button>
                  {esAdminSesion ? (
                    <button
                      type="button"
                      onClick={() => setUsuariosPanelTab("mikrotik")}
                      style={usuariosPanelTab === "mikrotik" ? primaryButton : secondaryButton}
                    >
                      MikroTik
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {usuariosPanelTab === "personal" ? (
              (() => {
                const rolBadgeStyle = (rol) => {
                  const r = normalizarRolSimple(rol);
                  if (r === "Administrador") return { color: "#6D28D9", bg: "#EDE9FE" };
                  if (r === "Gestora") return { color: "#0369A1", bg: "#E0F2FE" };
                  if (r === "Almacen") return { color: "#C2410C", bg: "#FFF0E6" };
                  return { color: "#15803D", bg: "#DCFCE7" };
                };
                return (
                  <>
                    {/* Form */}
                    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px 22px" }} ref={usuarioFormRef}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 16, borderBottom: "1px solid #F3F4F6", paddingBottom: 10 }}>
                        {usuarioEditandoId ? "Editar usuario" : "Nuevo usuario"}
                      </div>
                      <div style={formGridStyle}>
                        <div>
                          <label style={labelStyle}>Nombre</label>
                          <input style={inputStyle} value={usuarioForm.nombre} onChange={(e) => handleUsuarioChange("nombre", e.target.value)} placeholder="Nombre completo" />
                        </div>
                        <div>
                          <label style={labelStyle}>Usuario</label>
                          <input style={inputStyle} value={usuarioForm.username || ""} onChange={(e) => handleUsuarioChange("username", e.target.value)} placeholder="login" />
                        </div>
                        <div>
                          <label style={labelStyle}>Contraseña</label>
                          <input type="password" style={inputStyle} value={usuarioForm.password || ""} onChange={(e) => handleUsuarioChange("password", e.target.value)} placeholder="••••••••" />
                        </div>
                        <div>
                          <label style={labelStyle}>Celular</label>
                          <input style={inputStyle} value={usuarioForm.celular} onChange={(e) => handleUsuarioChange("celular", e.target.value)} placeholder="999999999" />
                        </div>
                        <div>
                          <label style={labelStyle}>Email</label>
                          <input style={inputStyle} value={usuarioForm.email} onChange={(e) => handleUsuarioChange("email", e.target.value)} placeholder="correo@empresa.com" />
                        </div>
                        <div>
                          <label style={labelStyle}>Empresa</label>
                          <select style={inputStyle} value={usuarioForm.empresa} onChange={(e) => handleUsuarioChange("empresa", e.target.value)}>
                            {EMPRESAS_USUARIO_WEB.map((emp) => <option key={emp} value={emp}>{emp}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Grupo</label>
                          <input style={inputStyle} value={usuarioForm.grupo || ""} onChange={(e) => handleUsuarioChange("grupo", e.target.value)} placeholder="equipo-norte" />
                        </div>
                        <div>
                          <label style={labelStyle}>Estado</label>
                          <select style={inputStyle} value={usuarioForm.activo ? "SI" : "NO"} onChange={(e) => handleUsuarioChange("activo", e.target.value === "SI")}>
                            <option value="SI">Activo</option>
                            <option value="NO">Inactivo</option>
                          </select>
                        </div>
                      </div>

                      {/* Rol */}
                      <div style={{ marginTop: 14 }}>
                        <label style={{ ...labelStyle, marginBottom: 8, display: "block" }}>Rol</label>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {ROLES_USUARIO_WEB.map((rol) => {
                            const sel = normalizarRolSimple(usuarioForm.rol) === rol;
                            const rb = rolBadgeStyle(rol);
                            return (
                              <button key={rol} type="button" onClick={() => handleUsuarioChange("rol", rol)}
                                style={{ padding: "6px 16px", borderRadius: 6, border: `1.5px solid ${sel ? rb.color : "#D1D5DB"}`, background: sel ? rb.bg : "#fff", color: sel ? rb.color : "#6B7280", fontWeight: sel ? 700 : 500, fontSize: 13, cursor: "pointer" }}>
                                {rol}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Accesos */}
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <label style={{ ...labelStyle, margin: 0 }}>Accesos de menú</label>
                          <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={aplicarAccesosPorRolUsuario}>Por rol</button>
                          <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={seleccionarTodosAccesosUsuario}>Todos</button>
                          <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={limpiarAccesosUsuario}>Limpiar</button>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {MENU_VISTAS_WEB.map((menu) => {
                            const sel = normalizarAccesosMenuWeb(usuarioForm.accesosMenu, usuarioForm.rol).includes(menu.key);
                            return (
                              <button key={menu.key} type="button" onClick={() => toggleAccesoMenuUsuario(menu.key)}
                                style={{ padding: "4px 10px", borderRadius: 5, border: `1.5px solid ${sel ? "#374151" : "#E5E7EB"}`, background: sel ? "#1F2937" : "#fff", color: sel ? "#fff" : "#6B7280", fontWeight: 600, fontSize: 11, cursor: "pointer" }}>
                                {menu.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {normalizarAccesosMenuWeb(usuarioForm.accesosMenu, usuarioForm.rol).includes("historialAppsheet") && (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <label style={{ ...labelStyle, margin: 0 }}>Historial AppSheet</label>
                            <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={aplicarAccesosHistorialAppsheetPorRolUsuario}>Por rol</button>
                            <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={seleccionarTodosAccesosHistorialAppsheetUsuario}>Todos</button>
                            <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={limpiarAccesosHistorialAppsheetUsuario}>Limpiar</button>
                          </div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {HISTORIAL_APPSHEET_SUBMENU_ITEMS.map((sub) => {
                              const sel = normalizarAccesosHistorialAppsheetWeb(usuarioForm.accesosHistorialAppsheet, usuarioForm.rol).includes(sub.key);
                              return (
                                <button key={`hs-${sub.key}`} type="button" onClick={() => toggleAccesoHistorialAppsheetUsuario(sub.key)}
                                  style={{ padding: "4px 10px", borderRadius: 5, border: `1.5px solid ${sel ? "#374151" : "#E5E7EB"}`, background: sel ? "#1F2937" : "#fff", color: sel ? "#fff" : "#6B7280", fontWeight: 600, fontSize: 11, cursor: "pointer" }}>
                                  {sub.sideLabel || sub.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {normalizarAccesosMenuWeb(usuarioForm.accesosMenu, usuarioForm.rol).includes("diagnosticoServicio") && (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <label style={{ ...labelStyle, margin: 0 }}>Diagnóstico de servicio</label>
                            <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={aplicarAccesosDiagnosticoServicioPorRolUsuario}>Por rol</button>
                            <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={seleccionarTodosAccesosDiagnosticoServicioUsuario}>Todos</button>
                            <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={limpiarAccesosDiagnosticoServicioUsuario}>Limpiar</button>
                          </div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS.map((p) => {
                              const sel = normalizarAccesosDiagnosticoServicioWeb(usuarioForm.accesosDiagnosticoServicio, usuarioForm.rol, usuarioForm.accesosMenu).includes(p.key);
                              return (
                                <button key={`ds-${p.key}`} type="button" onClick={() => toggleAccesoDiagnosticoServicioUsuario(p.key)}
                                  style={{ padding: "4px 10px", borderRadius: 5, border: `1.5px solid ${sel ? "#374151" : "#E5E7EB"}`, background: sel ? "#1F2937" : "#fff", color: sel ? "#fff" : "#6B7280", fontWeight: 600, fontSize: 11, cursor: "pointer" }}>
                                  {p.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {normalizarRolSimple(usuarioForm.rol) === "Gestora" && (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <label style={{ ...labelStyle, margin: 0 }}>Nodos de acceso</label>
                            <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={seleccionarTodosNodosUsuario}>Todos</button>
                            <button type="button" style={{ ...secondaryButton, padding: "3px 10px", fontSize: 11 }} onClick={limpiarNodosUsuario}>Limpiar</button>
                          </div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {NODOS_BASE_WEB.map((nodo) => {
                              const sel = normalizarNodosAccesoWeb(usuarioForm.nodosAcceso).includes(nodo);
                              return (
                                <button key={nodo} type="button" onClick={() => toggleNodoAccesoUsuario(nodo)}
                                  style={{ padding: "4px 12px", borderRadius: 5, border: `1.5px solid ${sel ? "#0369A1" : "#E5E7EB"}`, background: sel ? "#0369A1" : "#fff", color: sel ? "#fff" : "#6B7280", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                                  {nodo}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                        <button onClick={guardarUsuario} style={primaryButton}>
                          {usuarioEditandoId ? "Guardar cambios" : "Crear usuario"}
                        </button>
                        {usuarioEditandoId && (
                          <button onClick={cancelarEdicionUsuario} style={secondaryButton}>Cancelar</button>
                        )}
                      </div>
                    </div>

                    {/* User list */}
                    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px 22px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                          Personal <span style={{ fontWeight: 400, color: "#9CA3AF", fontSize: 13 }}>({usuariosFiltrados.length})</span>
                        </span>
                        <input style={{ ...inputStyle, maxWidth: 280 }} value={busquedaUsuarios} onChange={(e) => setBusquedaUsuarios(e.target.value)} placeholder="Buscar..." />
                      </div>

                      {usuariosFiltrados.length === 0 ? (
                        <div style={{ padding: "32px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Sin usuarios registrados</div>
                      ) : (
                        <div style={{ display: "grid", gap: 1 }}>
                          {usuariosFiltrados.map((usuario) => {
                            const rb = rolBadgeStyle(usuario.rol);
                            const accesos = normalizarAccesosMenuWeb(usuario.accesosMenu ?? usuario.accesos_menu, usuario.rol);
                            return (
                              <div key={usuario.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 8, background: "#FAFAFA", borderLeft: `3px solid ${rb.color}`, marginBottom: 4 }}>
                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{usuario.nombre}</span>
                                    <span style={{ background: rb.bg, color: rb.color, borderRadius: 4, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{normalizarRolSimple(usuario.rol)}</span>
                                    {usuario.activo
                                      ? <span style={{ color: "#16A34A", fontSize: 11, fontWeight: 600 }}>Activo</span>
                                      : <span style={{ color: "#DC2626", fontSize: 11, fontWeight: 600 }}>Inactivo</span>}
                                    {usuario.sesion_token && <span style={{ color: "#16A34A", fontSize: 11, fontWeight: 600 }}>• En línea</span>}
                                  </div>
                                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    <span>{usuario.username || "-"}</span>
                                    {usuario.celular && <span>{usuario.celular}</span>}
                                    {usuario.ultimo_acceso && <span>{new Date(usuario.ultimo_acceso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</span>}
                                  </div>
                                  {accesos.length > 0 && (
                                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
                                      {accesos.slice(0, 6).map((k) => (
                                        <span key={k} style={{ background: "#F3F4F6", color: "#6B7280", borderRadius: 3, padding: "1px 6px", fontSize: 10 }}>{menuLabelByKeyWeb[k] || k}</span>
                                      ))}
                                      {accesos.length > 6 && <span style={{ background: "#F3F4F6", color: "#9CA3AF", borderRadius: 3, padding: "1px 6px", fontSize: 10 }}>+{accesos.length - 6}</span>}
                                    </div>
                                  )}
                                  {normalizarRolSimple(usuario.rol) === "Gestora" && normalizarNodosAccesoWeb(usuario.nodosAcceso ?? usuario.nodos_acceso).length > 0 && (
                                    <div style={{ marginTop: 4, display: "flex", gap: 3, flexWrap: "wrap" }}>
                                      {normalizarNodosAccesoWeb(usuario.nodosAcceso ?? usuario.nodos_acceso).map((n) => (
                                        <span key={n} style={{ background: "#EFF6FF", color: "#0369A1", borderRadius: 3, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{n}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {/* Actions */}
                                <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>
                                  <button onClick={() => editarUsuario(usuario)}
                                    style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                    Editar
                                  </button>
                                  <button onClick={() => cambiarEstadoUsuario(usuario.id)}
                                    style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", color: usuario.activo ? "#6B7280" : "#16A34A", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                    {usuario.activo ? "Desactivar" : "Activar"}
                                  </button>
                                  {esAdminSesion && usuario.sesion_token && (
                                    <button onClick={() => cerrarSesionRemota(usuario.id)}
                                      style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #DDD6FE", background: "#F5F3FF", color: "#7C3AED", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                      Cerrar sesión
                                    </button>
                                  )}
                                  <button onClick={() => eliminarUsuario(usuario.id)}
                                    style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #FECACA", background: "#FFF5F5", color: "#DC2626", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                    Eliminar
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()
            ) : null}

            {esAdminSesion && usuariosPanelTab === "mikrotik" ? (
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Configuración MikroTik</h2>
                    <p style={{ ...subtitleStyle, margin: 0 }}>
                      Administra routers, puertos API, credenciales y el mapeo por nodo desde Supabase. El backend del diagnóstico usará esta tabla como fuente principal.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={secondaryButton}
                      onClick={() => void cargarMikrotikConfigDesdeSupabase({ silent: false })}
                      disabled={mikrotikConfigLoading || mikrotikConfigSaving}
                    >
                      {mikrotikConfigLoading ? "Recargando..." : "Recargar"}
                    </button>
                    <button
                      type="button"
                      style={primaryButton}
                      onClick={() => void guardarMikrotikConfigEnSupabase()}
                      disabled={mikrotikConfigLoading || mikrotikConfigSaving}
                    >
                      {mikrotikConfigSaving ? "Guardando..." : "Guardar configuración"}
                    </button>
                  </div>
                </div>

                {mikrotikConfigInfo ? (
                  <div style={{ ...badgeSuccess, padding: "10px 12px", borderRadius: "12px", marginBottom: "12px" }}>{mikrotikConfigInfo}</div>
                ) : null}
                {mikrotikConfigError ? (
                  <div style={{ ...badgeDanger, padding: "10px 12px", borderRadius: "12px", marginBottom: "12px", display: "block" }}>{mikrotikConfigError}</div>
                ) : null}

                <div style={{ display: "grid", gap: "18px" }}>
                  <div
                    style={{
                      border: "1px solid #dbe6f5",
                      borderRadius: "16px",
                      padding: "16px",
                      background: "#f8fbff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
                      <div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Routers MikroTik</div>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Conectividad base</div>
                      </div>
                      <button type="button" style={secondaryButton} onClick={agregarMikrotikRouter}>
                        Agregar router
                      </button>
                    </div>

                    <div style={{ display: "grid", gap: "12px" }}>
                      {mikrotikRoutersConfig.map((router) => (
                        <div
                          key={router.routerKey || router.nombre}
                          style={{
                            border: "1px solid #d8e2f0",
                            borderRadius: "14px",
                            padding: "14px",
                            background: "#ffffff",
                          }}
                        >
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                            <div>
                              <label style={labelStyle}>Clave router</label>
                              <input
                                style={inputStyle}
                                value={router.routerKey}
                                disabled={router.persisted && Boolean(router.routerKey)}
                                onChange={(e) => handleMikrotikRouterChange(router.routerKey, "routerKey", e.target.value)}
                                placeholder="tiabaya"
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Nombre</label>
                              <input
                                style={inputStyle}
                                value={router.nombre}
                                onChange={(e) => handleMikrotikRouterChange(router.routerKey, "nombre", e.target.value)}
                                placeholder="Router Tiabaya"
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Host / IP</label>
                              <input
                                style={inputStyle}
                                value={router.host}
                                onChange={(e) => handleMikrotikRouterChange(router.routerKey, "host", e.target.value)}
                                placeholder="172.25.100.140"
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Puerto API</label>
                              <input
                                style={inputStyle}
                                value={router.port}
                                onChange={(e) => handleMikrotikRouterChange(router.routerKey, "port", String(e.target.value || "").replace(/\D/g, ""))}
                                placeholder="8730"
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Usuario API</label>
                              <input
                                style={inputStyle}
                                value={router.apiUser}
                                onChange={(e) => handleMikrotikRouterChange(router.routerKey, "apiUser", e.target.value)}
                                placeholder="admin"
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Contraseña API</label>
                              <input
                                type="password"
                                style={inputStyle}
                                value={router.apiPassword}
                                onChange={(e) => handleMikrotikRouterChange(router.routerKey, "apiPassword", e.target.value)}
                                placeholder="********"
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Estado</label>
                              <select
                                style={inputStyle}
                                value={router.activo ? "SI" : "NO"}
                                onChange={(e) => handleMikrotikRouterChange(router.routerKey, "activo", e.target.value === "SI")}
                              >
                                <option value="SI">Activo</option>
                                <option value="NO">Inactivo</option>
                              </select>
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={labelStyle}>Notas</label>
                              <input
                                style={inputStyle}
                                value={router.notas}
                                onChange={(e) => handleMikrotikRouterChange(router.routerKey, "notas", e.target.value)}
                                placeholder="VPN, observaciones o cambios operativos"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #dbe6f5",
                      borderRadius: "16px",
                      padding: "16px",
                      background: "#ffffff",
                    }}
                  >
                    <div style={{ marginBottom: "14px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>Mapa nodo a router</div>
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Asignación operativa</div>
                    </div>

                    <div style={{ display: "grid", gap: "10px" }}>
                      {mergeMikrotikNodoRouterWithDefaults(mikrotikNodoRouterConfig).map((item) => (
                        <div
                          key={item.nodo}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(110px, 140px) minmax(180px, 1fr) minmax(180px, 1fr)",
                            gap: "10px",
                            alignItems: "center",
                            border: "1px solid #e5e7eb",
                            borderRadius: "12px",
                            padding: "12px",
                            background: "#f8fafc",
                          }}
                        >
                          <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.nodo}</div>
                          <select
                            style={inputStyle}
                            value={item.routerKey || ""}
                            onChange={(e) => handleMikrotikNodoRouterChange(item.nodo, "routerKey", e.target.value)}
                          >
                            <option value="">Sin asignar</option>
                            {mikrotikRoutersConfig
                              .filter((router) => router.routerKey)
                              .map((router) => (
                                <option key={router.routerKey} value={router.routerKey}>
                                  {router.nombre || router.routerKey}
                                </option>
                              ))}
                          </select>
                          <input
                            style={inputStyle}
                            value={item.observacion || ""}
                            onChange={(e) => handleMikrotikNodoRouterChange(item.nodo, "observacion", e.target.value)}
                            placeholder="Observación opcional"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {vistaActiva === "clientes" && (
          <div style={{ display: "grid", gap: 20 }}>
            <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e8edf5", boxShadow: "0 2px 16px rgba(15,23,42,0.06)", padding: "22px 26px" }}>

              {/* ── Header ── */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>Abonados</h2>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{clientes.length} registros totales</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={syncClientesDesdeSheet} disabled={clientesSyncLoading} style={{ padding: "8px 16px", background: "#163f86", color: "#fff", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {clientesSyncLoading ? "Actualizando..." : "↻ Sync"}
                  </button>
                  <button onClick={() => cargarClientesDesdeSupabase({ silent: false })} disabled={clientesSyncLoading || !isSupabaseConfigured} style={{ padding: "8px 14px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Recargar
                  </button>
                  <button onClick={actualizarEstadoMasivoMikrowisp} disabled={actualizarEstadoMasivoLoading} title="Consulta Mikrowisp por DNI para actualizar estado" style={{ padding: "8px 14px", background: "#f0fdf4", color: "#166534", border: "1px solid #86efac", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {actualizarEstadoMasivoLoading ? `MK ${actualizarEstadoMasivoProgreso?.actual ?? 0}/${actualizarEstadoMasivoProgreso?.total ?? 0}` : "Sync MikroTik"}
                  </button>
                  <label style={{ padding: "8px 14px", background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {importCsvLoading ? "Importando..." : "↑ Importar CSV"}
                    <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      await importarClientesDesdeCSV(file);
                    }} />
                  </label>
                  {!!importCsvInfo && <span style={{ fontSize: 11, color: "#0369a1" }}>{importCsvInfo}</span>}
                  {esAdminSesion && (
                    <button onClick={limpiarClientesLocales} style={{ padding: "8px 14px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Vaciar
                    </button>
                  )}
                </div>
              </div>

              {/* ── Búsqueda + filtros estado ── */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 440 }}>
                  <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    style={{ width: "100%", padding: "9px 12px 9px 33px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, outline: "none", background: "#f8fafc", boxSizing: "border-box", color: "#0f172a" }}
                    value={busquedaClientesDraft}
                    onChange={e => setBusquedaClientesDraft(e.target.value)}
                    placeholder="Buscar nombre, DNI, celular, nodo..."
                  />
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {[
                    { key: "TODOS", label: "Todos" },
                    { key: "ACTIVO", label: "Activo", dot: "#16a34a" },
                    { key: "SUSPENDIDO", label: "Suspendido", dot: "#dc2626" },
                    { key: "INACTIVO", label: "Inactivo", dot: "#6b7280" },
                    { key: "DESCONOCIDO", label: "Desc.", dot: "#d97706" },
                  ].map(({ key, label, dot }) => {
                    const active = filtroEstadoCliente === key;
                    return (
                      <button key={key} type="button" onClick={() => setFiltroEstadoCliente(key)} style={{ padding: "7px 12px", border: "1.5px solid", borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, background: active ? "#0f172a" : "#f8fafc", borderColor: active ? "#0f172a" : "#e2e8f0", color: active ? "#fff" : "#475569" }}>
                        {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#fff" : dot, flexShrink: 0 }} />}
                        {label}
                        <span style={{ opacity: 0.65, fontSize: 10 }}>{conteosEstadoCliente[key] ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Stats strip ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 18 }}>
                {[
                  { label: "Visibles", value: clientesResumen.total, color: "#163f86" },
                  { label: "Con celular", value: clientesResumen.conCelular, color: "#0369a1" },
                  { label: "Con nodo", value: clientesResumen.conNodo, color: "#0f766e" },
                  { label: "Con etiqueta", value: clientesResumen.conEtiqueta, color: "#b45309" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 12, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 2, lineHeight: 1 }}>{value}</div>
                  </div>
                ))}
              </div>

              {clientesSyncInfo && <div style={{ marginBottom: 12, fontSize: 12, color: "#065f46", background: "#f0fdf4", padding: "8px 14px", borderRadius: 9, border: "1px solid #86efac" }}>{clientesSyncInfo}</div>}
              {clientesSyncError && <div style={{ marginBottom: 12, fontSize: 12, color: "#b91c1c", background: "#fef2f2", padding: "8px 14px", borderRadius: 9, border: "1px solid #fecaca" }}>{clientesSyncError}</div>}

              {/* ── Tabla ── */}
              {clientesFiltrados.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "#cbd5e1" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>👤</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Sin clientes registrados</div>
                </div>
              ) : (
                <>
                  <div style={{ border: "1px solid #f1f5f9", borderRadius: 14, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #f1f5f9" }}>
                          {["Cliente", "DNI", "Empresa", "Contacto", "Nodo · Plan", "Estado", "Acciones"].map((h, i) => (
                            <th key={h} style={{ textAlign: i === 6 ? "center" : "left", padding: "10px 14px", fontWeight: 700, fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clientesPaginados.map((cliente, idx) => {
                          const est = String(cliente.estadoServicio || "DESCONOCIDO").toUpperCase();
                          const estCfg = { ACTIVO: { c: "#16a34a", bg: "#dcfce7", l: "Activo" }, SUSPENDIDO: { c: "#dc2626", bg: "#fee2e2", l: "Suspendido" }, INACTIVO: { c: "#6b7280", bg: "#f3f4f6", l: "Inactivo" }, DESCONOCIDO: { c: "#d97706", bg: "#fef3c7", l: "Desc." } }[est] || { c: "#6b7280", bg: "#f3f4f6", l: est };
                          return (
                            <tr key={cliente.id || idx} style={{ borderTop: "1px solid #f8fafc", cursor: "default" }}
                              onMouseEnter={e => e.currentTarget.style.background = "#fafbff"}
                              onMouseLeave={e => e.currentTarget.style.background = ""}>
                              <td style={{ padding: "11px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#eff6ff", color: "#163f86", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                                    {String(cliente.nombre || "?").charAt(0).toUpperCase()}
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{cliente.nombre || "-"}</div>
                                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1, display: "flex", gap: 5, alignItems: "center" }}>
                                      <span>{cliente.codigoAbonado || cliente.codigoCliente || ""}</span>
                                      {dniServiciosCount[String(cliente.dni || "").trim()] > 1 && (
                                        <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 999, padding: "1px 6px", fontSize: 9, fontWeight: 800 }}>
                                          {dniServiciosCount[String(cliente.dni || "").trim()]} serv.
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{cliente.direccion || ""}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: "11px 14px", color: "#475569", fontFamily: "monospace", fontSize: 12 }}>{cliente.dni || "-"}</td>
                              <td style={{ padding: "11px 14px" }}>
                                {cliente.empresa === "Americanet" ? (
                                  <img src={logoAmericanet} alt="Americanet" style={{ height: 22, maxWidth: 80, objectFit: "contain", mixBlendMode: "multiply" }} />
                                ) : cliente.empresa === "DIM" ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 6, overflow: "hidden", height: 22 }}>
                                    <img src={logoDim} alt="DIM" style={{ height: 22, objectFit: "contain" }} />
                                  </span>
                                ) : <span style={{ color: "#94a3b8", fontSize: 11 }}>-</span>}
                              </td>
                              <td style={{ padding: "11px 14px", color: "#475569", fontSize: 12 }}>{cliente.celular || "-"}</td>
                              <td style={{ padding: "11px 14px" }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{cliente.nodo || "-"}</div>
                                <div style={{ fontSize: 11, color: "#94a3b8" }}>{cliente.velocidad || "-"}</div>
                              </td>
                              <td style={{ padding: "11px 14px" }}>
                                <span style={{ padding: "3px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: estCfg.bg, color: estCfg.c, whiteSpace: "nowrap" }}>{estCfg.l}</span>
                              </td>
                              <td style={{ padding: "11px 14px" }}>
                                <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap" }}>
                                  <button onClick={() => void abrirDetalleCliente(cliente)} style={{ padding: "6px 12px", background: "#eff6ff", color: "#163f86", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Ver</button>
                                  <button onClick={() => void abrirDiagnosticoRapidoCliente(cliente)} title="Diagnóstico MikroTik" style={{ padding: "6px 10px", background: "#f0fdf4", color: "#166534", border: "1px solid #86efac", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>MK</button>
                                  {puedeGestionarSuspensionClientes && !clienteEstaSuspendidoMikrotik(cliente) && (
                                    <button onClick={() => void ejecutarAccionMikrotikCliente(cliente, "suspender")} disabled={clienteMikrotikAccionLoading === "suspender"} title="Suspender" style={{ padding: "6px 9px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>⏸</button>
                                  )}
                                  {puedeGestionarSuspensionClientes && clienteEstaSuspendidoMikrotik(cliente) && (
                                    <button onClick={() => void ejecutarAccionMikrotikCliente(cliente, "activar")} disabled={clienteMikrotikAccionLoading === "activar"} title="Activar" style={{ padding: "6px 9px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>▶</button>
                                  )}
                                  <button onClick={() => crearOrdenDesdeCliente(cliente)} style={{ padding: "6px 11px", background: "#163f86", color: "#fff", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Orden</button>
                                  {esAdminSesion && (
                                    <button onClick={() => void eliminarCliente(cliente)} title="Eliminar" style={{ padding: "6px 8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, fontSize: 11, cursor: "pointer" }}>✕</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginación */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {clientesFiltrados.length === 0 ? 0 : (clientesPagina - 1) * CLIENTES_PAGE_SIZE + 1}–{Math.min(clientesPagina * CLIENTES_PAGE_SIZE, clientesFiltrados.length)} de <strong style={{ color: "#475569" }}>{clientesFiltrados.length}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button type="button" onClick={() => setClientesPagina(p => Math.max(1, p - 1))} disabled={clientesPagina <= 1} style={{ padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#475569" }}>← Ant.</button>
                      <span style={{ fontSize: 12, color: "#64748b", padding: "0 8px" }}>Pág. {clientesPagina} / {totalPaginasClientes}</span>
                      <button type="button" onClick={() => setClientesPagina(p => Math.min(totalPaginasClientes, p + 1))} disabled={clientesPagina >= totalPaginasClientes} style={{ padding: "7px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#475569" }}>Sig. →</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {vistaActiva === "whatsapp" && (
          <WhatsAppConfigPanel />
        )}

        {vistaActiva === "nap" && (
          <NapPanel sessionUser={usuarioSesion} rolSesion={rolSesion} />
        )}

        {vistaActiva === "recordatorios" && (
          <RecordatoriosPanel sessionUser={usuarioSesion} />
        )}

        {vistaActiva === "logs" && esAdminSesion && (
          <LogsPanel cardStyle={cardStyle} inputStyle={inputStyle} sectionTitleStyle={sectionTitleStyle} />
        )}

        {vistaActiva === "detalleCliente" && clienteSeleccionado && (() => {
          const cli = clienteSeleccionado;
          const est = String(cli.estadoServicio || "DESCONOCIDO").toUpperCase();
          const estCfg = { ACTIVO: { c: "#16a34a", bg: "#dcfce7", l: "Activo" }, SUSPENDIDO: { c: "#dc2626", bg: "#fee2e2", l: "Suspendido" }, INACTIVO: { c: "#6b7280", bg: "#f3f4f6", l: "Inactivo" }, DESCONOCIDO: { c: "#d97706", bg: "#fef3c7", l: "Desc." } }[est] || { c: "#6b7280", bg: "#f3f4f6", l: est };
          const initials = String(cli.nombre || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
          const infoRow = (label, value, mono) => value ? (
            <div style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #f8fafc", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 136, fontWeight: 600, flexShrink: 0, paddingTop: 1 }}>{label}</span>
              <span style={{ fontSize: 13, color: "#0f172a", fontWeight: 500, fontFamily: mono ? "monospace" : undefined, wordBreak: "break-all" }}>{value}</span>
            </div>
          ) : null;
          const cardDet = { background: "#fff", borderRadius: 16, border: "1px solid #e8edf5", boxShadow: "0 2px 12px rgba(15,23,42,0.04)", padding: "20px 24px" };
          const secLabel = { fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, display: "block" };
          return (
            <div style={{ display: "grid", gap: 18 }}>

              {/* ── Hero ── */}
              <div style={{ background: "linear-gradient(135deg,#eff6ff 0%,#dbeafe 60%,#e0f2fe 100%)", borderRadius: 20, border: "1px solid #bfdbfe", boxShadow: "0 2px 20px rgba(59,130,246,0.08)", padding: "24px 28px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#0ea5e9)", border: "3px solid #fff", boxShadow: "0 4px 14px rgba(37,99,235,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{initials}</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a8a", letterSpacing: "-0.3px", lineHeight: 1.2 }}>{cli.nombre || "-"}</div>
                    <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 3, fontWeight: 500 }}>DNI: {cli.dni || "-"} · {cli.codigoCliente || cli.codigoAbonado || "-"}</div>
                    <div style={{ marginTop: 9, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ padding: "3px 11px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: estCfg.bg, color: estCfg.c }}>{estCfg.l}</span>
                      {cli.nodo && <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.7)", color: "#1d4ed8", border: "1px solid #93c5fd" }}>{cli.nodo}</span>}
                      {cli.cajaNap && <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" }}>📦 {cli.cajaNap}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={() => void abrirDiagnosticoRapidoCliente(cli)} style={{ padding: "8px 15px", background: "rgba(255,255,255,0.8)", border: "1px solid #bfdbfe", borderRadius: 10, color: "#1e40af", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>MikroTik</button>
                  {puedeGestionarSuspensionClientes && !clienteEstaSuspendidoMikrotik(cli) && (
                    <button onClick={() => void ejecutarAccionMikrotikCliente(cli, "suspender")} disabled={clienteMikrotikAccionLoading === "suspender"} style={{ padding: "8px 15px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {clienteMikrotikAccionLoading === "suspender" ? "Suspendiendo..." : "⏸ Suspender"}
                    </button>
                  )}
                  {puedeGestionarSuspensionClientes && clienteEstaSuspendidoMikrotik(cli) && (
                    <button onClick={() => void ejecutarAccionMikrotikCliente(cli, "activar")} disabled={clienteMikrotikAccionLoading === "activar"} style={{ padding: "8px 15px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, color: "#16a34a", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {clienteMikrotikAccionLoading === "activar" ? "Activando..." : "▶ Activar"}
                    </button>
                  )}
                  {!cli.snOnu && (
                    <span style={{ padding: "8px 14px", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 10, color: "#854d0e", fontSize: 12, fontWeight: 700 }}>⚠ Pendiente SN</span>
                  )}
                  <button onClick={() => crearOrdenDesdeCliente(cli)} style={{ padding: "8px 15px", background: "#f97316", border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Crear orden</button>
                  {esAdminSesion && <button onClick={() => abrirEditarCliente(cli)} style={{ padding: "8px 15px", background: "rgba(255,255,255,0.8)", border: "1px solid #bfdbfe", borderRadius: 10, color: "#1e40af", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✏️ Editar</button>}
                  {esAdminSesion && <button onClick={() => void eliminarCliente(cli)} style={{ padding: "8px 13px", background: "#dc2626", border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Eliminar</button>}
                  <button onClick={() => setVistaActiva("clientes")} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.7)", border: "1px solid #bfdbfe", borderRadius: 10, color: "#1e40af", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>← Volver</button>
                </div>
              </div>

              {clienteMikrotikAccionInfo && (
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "11px 16px", color: "#1e3a8a", fontSize: 13, fontWeight: 600 }}>{clienteMikrotikAccionInfo}</div>
              )}

              {/* ── Señal ONU ── */}
              {cli.snOnu && (
                <div style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "1.5px solid #86efac", borderRadius: 16, padding: "18px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#166534", textTransform: "uppercase", letterSpacing: "0.08em" }}>📶 Señal ONU — {cli.snOnu}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {cli.signalUpdatedAt && !clienteSenalLoading && (
                        <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 600 }}>
                          Actualizado {new Date(cli.signalUpdatedAt).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      <button
                        onClick={() => consultarSenalCliente(cli)}
                        disabled={clienteSenalLoading}
                        style={{ padding: "6px 14px", background: clienteSenalLoading ? "#d1fae5" : "#16a34a", color: "#fff", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: clienteSenalLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
                      >
                        {clienteSenalLoading ? "⏳ Consultando..." : "📡 Consultar Señal"}
                      </button>
                    </div>
                  </div>
                  {clienteSenalError && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", color: "#dc2626", fontSize: 12, marginBottom: 12 }}>
                      {clienteSenalError}
                    </div>
                  )}
                  {cli.rxSignal != null && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                      {[
                        { label: "Rx ONU (dBm)", value: cli.rxSignal },
                        { label: "Tx ONU (dBm)", value: cli.txSignal },
                      ].map(({ label, value }) => {
                        const n = parseFloat(value);
                        const isNum = !isNaN(n);
                        const ok = isNum && n >= -27 && n <= -8;
                        const color = isNum ? (ok ? "#16a34a" : "#dc2626") : "#374151";
                        return (
                          <div key={label} style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", border: `1.5px solid ${isNum ? (ok ? "#86efac" : "#fca5a5") : "#e2e8f0"}` }}>
                            <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.5px" }}>{value != null ? value : "-"}</div>
                            {isNum && <div style={{ fontSize: 10, marginTop: 2, fontWeight: 700, color: ok ? "#16a34a" : "#dc2626" }}>{ok ? "✓ Óptima" : "✗ Baja"}</div>}
                          </div>
                        );
                      })}
                      {cli.oltIp && (
                        <div style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1.5px solid #e2e8f0" }}>
                          <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>OLT / PON</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>{cli.oltIp}</div>
                          {cli.pon && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Puerto {cli.pon} · ONU {cli.onuId}</div>}
                        </div>
                      )}
                    </div>
                  )}
                  {cli.rxSignal == null && !clienteSenalLoading && (
                    <div style={{ color: "#6b7280", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                      <span>Sin señal registrada — presiona "Consultar Señal" para obtener datos en tiempo real.</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Info grid ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>

                {/* Datos personales */}
                <div style={cardDet}>
                  <span style={secLabel}>Datos personales</span>
                  {infoRow("Nombre", cli.nombre)}
                  {infoRow("DNI", cli.dni, true)}
                  {infoRow("Dirección", cli.direccion)}
                  {infoRow("Celular", cli.celular)}
                  {infoRow("Email", cli.email)}
                  {infoRow("Contacto", cli.contacto)}
                  {infoRow("Empresa", cli.empresa)}
                </div>

                {/* Servicio */}
                <div style={cardDet}>
                  <span style={secLabel}>Servicio</span>
                  {infoRow("Código abonado", cli.codigoCliente || cli.codigoAbonado, true)}
                  {infoRow("Plan", cli.velocidad)}
                  {infoRow("Precio", cli.precioPlan)}
                  {infoRow("Nodo", cli.nodo)}
                  {infoRow("Usuario PPPoE", cli.usuarioNodo, true)}
                  {infoRow("Contraseña", cli.passwordUsuario, true)}
                  {infoRow("Cód. etiqueta", cli.codigoEtiqueta)}
                  {infoRow("SN ONU", cli.snOnu, true)}
                </div>

                {/* NAP */}
                {(cli.cajaNap || cli.puertoNap) && (
                  <div style={{ ...cardDet, background: "linear-gradient(135deg,#fff7ed,#ffedd5)", border: "1.5px solid #fed7aa" }}>
                    <span style={{ ...secLabel, color: "#c2410c" }}>Infraestructura NAP</span>
                    {cli.cajaNap && (
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                        <span style={{ fontSize: 32 }}>📦</span>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#9a3412" }}>{cli.cajaNap}</div>
                          <div style={{ fontSize: 11, color: "#c2410c", marginTop: 2 }}>Caja NAP asignada</div>
                        </div>
                      </div>
                    )}
                    {infoRow("Puerto NAP", cli.puertoNap, true)}
                  </div>
                )}

                {/* Registro */}
                <div style={cardDet}>
                  <span style={secLabel}>Registro</span>
                  {infoRow("Técnico", cli.tecnico)}
                  {infoRow("Autor", cli.autorOrden)}
                  {infoRow("Descripción", cli.descripcion)}
                  {infoRow("Registrado", cli.fechaRegistro)}
                  {infoRow("Últ. actualización", cli.ultimaActualizacion)}
                </div>

                {/* Ubicación — mapa */}
                {(() => {
                  const coords = String(cli.ubicacion || "").trim();
                  const parts = coords.split(",").map(s => parseFloat(s.trim()));
                  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
                  const lat = parts[0], lng = parts[1];
                  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.002},${lat - 0.002},${lng + 0.002},${lat + 0.002}&layer=mapnik&marker=${lat},${lng}`;
                  const gmUrl = `https://www.google.com/maps?q=${lat},${lng}`;
                  return (
                    <div style={{ ...cardDet, gridColumn: "1 / -1", padding: 0, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #e8edf5" }}>
                        <span style={secLabel}>Ubicación</span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{lat.toFixed(6)}, {lng.toFixed(6)}</span>
                          <a href={gmUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, padding: "3px 10px", textDecoration: "none" }}>Ver en Google Maps</a>
                        </div>
                      </div>
                      <iframe
                        title="ubicacion-cliente"
                        src={mapUrl}
                        style={{ width: "100%", height: 220, border: "none", display: "block" }}
                        loading="lazy"
                      />
                    </div>
                  );
                })()}
              </div>

              {/* ── Fotos ── */}
              <div style={cardDet}>
                <span style={secLabel}>Fotos</span>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {cli.fotoFachada ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                      <button onClick={() => abrirFotoZoom(cli.fotoFachada, "Foto de fachada")} style={{ background: "none", border: "none", padding: 0, cursor: "zoom-in" }}>
                        <img src={cli.fotoFachada} alt="Fachada" style={{ width: 110, height: 85, objectFit: "cover", borderRadius: 12, border: "1px solid #e5e7eb", display: "block" }} />
                      </button>
                      <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>Fachada</span>
                    </div>
                  ) : (
                    <div style={{ width: 110, height: 85, borderRadius: 12, border: "2px dashed #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 11 }}>Sin foto</div>
                  )}
                  {(cli.fotosLiquidacion || []).map((foto, idx) => (
                    <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                      <button onClick={() => abrirFotoZoom(foto, `Foto ${idx + 1}`)} style={{ background: "none", border: "none", padding: 0, cursor: "zoom-in" }}>
                        <img src={foto} alt={`foto-${idx}`} style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 12, border: "1px solid #e5e7eb", display: "block" }} />
                      </button>
                      <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>Liq. {idx + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Historial ── */}
              {(cli.historialInstalaciones || []).length > 0 && (
                <div style={cardDet}>
                  <span style={secLabel}>Historial de instalaciones</span>
                  <div style={{ display: "grid", gap: 10 }}>
                    {cli.historialInstalaciones.map((hist) => (
                      <div key={hist.id} style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 16px", border: "1px solid #f1f5f9", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                        <div><div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Orden</div><div style={{ fontSize: 13, fontWeight: 800, color: "#163f86" }}>{hist.codigoOrden || "-"}</div></div>
                        <div><div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Fecha</div><div style={{ fontSize: 12, color: "#0f172a" }}>{hist.fechaLiquidacion || "-"}</div></div>
                        <div><div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Tipo</div><div style={{ fontSize: 12, color: "#0f172a" }}>{hist.tipoActuacion || "-"}</div></div>
                        <div><div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Resultado</div><div style={{ fontSize: 12, fontWeight: 700, color: hist.resultadoFinal === "Completada" ? "#16a34a" : "#0f172a" }}>{hist.resultadoFinal || "-"}</div></div>
                        <div><div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Técnico</div><div style={{ fontSize: 12, color: "#0f172a" }}>{hist.tecnico || "-"}</div></div>
                        {hist.observacionFinal && <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Obs.</div><div style={{ fontSize: 12, color: "#475569" }}>{hist.observacionFinal}</div></div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Equipos ── */}
              {(cli.equiposHistorial || []).length > 0 && (
                <div style={cardDet}>
                  <span style={secLabel}>Equipos instalados</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
                    {cli.equiposHistorial.map((eq, idx) => (
                      <div key={eq.id || idx} style={{ background: "#f8fafc", borderRadius: 12, padding: "13px 15px", border: "1px solid #f1f5f9" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, background: "#eff6ff", color: "#163f86", padding: "2px 8px", borderRadius: 6 }}>{eq.tipo || "Equipo"}</span>
                          {eq.accion && <span style={{ fontSize: 10, color: "#94a3b8" }}>{eq.accion}</span>}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{[eq.marca, eq.modelo].filter(Boolean).join(" ") || "-"}</div>
                        {eq.serial && <div style={{ fontSize: 11, fontFamily: "monospace", color: "#475569", marginTop: 3 }}>{eq.serial}</div>}
                        {eq.codigo && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>QR: {eq.codigo}</div>}
                        {eq.fecha && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 5 }}>{eq.fecha}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Modal editar cliente (admin) ── */}
        {modalEditarCliente && esAdminSesion && (() => {
          const f = formEditarCliente;
          const set = (k, v) => setFormEditarCliente(prev => ({ ...prev, [k]: v }));
          const inp = { width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", background: "#f8fafc", boxSizing: "border-box" };
          const lbl = { fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 };
          const grp = (label, key, opts = {}) => (
            <div>
              <label style={lbl}>{label}</label>
              {opts.select
                ? <select value={f[key] || ""} onChange={e => set(key, e.target.value)} style={inp}>
                    {opts.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                : <input value={f[key] || ""} onChange={e => set(key, e.target.value)} style={inp} placeholder={label} />
              }
            </div>
          );
          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 700, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }}>
                {/* Header */}
                <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Editar cliente</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{f.nombre || f.dni}</div>
                  </div>
                  <button onClick={() => setModalEditarCliente(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer" }}>✕</button>
                </div>
                {/* Body */}
                <div style={{ padding: "20px 24px", display: "grid", gap: 20 }}>
                  {/* Bloque datos personales */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Datos personales</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                      {grp("Nombre", "nombre")}
                      {grp("DNI", "dni")}
                      {grp("Dirección", "direccion")}
                      {grp("Celular", "celular")}
                      {grp("Email", "email")}
                      {grp("Empresa", "empresa")}
                      {grp("Contacto", "contacto")}
                    </div>
                  </div>
                  {/* Bloque servicio */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Servicio</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                      {grp("Código abonado", "codigoCliente")}
                      {grp("Plan / velocidad", "velocidad")}
                      {grp("Precio plan", "precioPlan")}
                      {grp("Nodo", "nodo")}
                      {grp("Usuario PPPoE", "usuarioNodo")}
                      {grp("Contraseña PPPoE", "passwordUsuario")}
                      <div>
                        <label style={lbl}>Código etiqueta</label>
                        <div style={{ position: "relative" }}>
                          <input
                            value={f.codigoEtiqueta || ""}
                            onChange={e => { set("codigoEtiqueta", e.target.value); setEtiquetaFiltroEdit(e.target.value); setShowEtiquetaDropdownEdit(true); }}
                            onFocus={() => { setEtiquetaFiltroEdit(f.codigoEtiqueta || ""); setShowEtiquetaDropdownEdit(true); }}
                            onBlur={() => setTimeout(() => setShowEtiquetaDropdownEdit(false), 150)}
                            style={inp} placeholder="Buscar etiqueta..." autoComplete="off"
                          />
                          {showEtiquetaDropdownEdit && (
                            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 180, overflowY: "auto", zIndex: 10000, boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
                              {[...(f.codigoEtiqueta ? [f.codigoEtiqueta] : []), ...etiquetasDisponibles.filter(e => e !== f.codigoEtiqueta)]
                                .filter(e => !etiquetaFiltroEdit || e.includes(etiquetaFiltroEdit))
                                .slice(0, 60)
                                .map(e => (
                                  <div key={e} onMouseDown={() => { set("codigoEtiqueta", e); setShowEtiquetaDropdownEdit(false); }}
                                    style={{ padding: "7px 12px", cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f8fafc" }}
                                    onMouseEnter={ev => ev.currentTarget.style.background = "#eff6ff"}
                                    onMouseLeave={ev => ev.currentTarget.style.background = ""}>
                                    <span style={{ color: "#0f172a" }}>{e}</span>
                                    {e === f.codigoEtiqueta && <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 700 }}>Actual</span>}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {grp("SN ONU", "snOnu")}
                      {grp("Estado servicio", "estadoServicio", { select: true, options: ["ACTIVO", "SUSPENDIDO", "INACTIVO", "DESCONOCIDO"] })}
                    </div>
                  </div>
                  {/* Bloque NAP */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#c2410c", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>NAP</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                      {grp("Caja NAP", "cajaNap")}
                      {grp("Puerto NAP", "puertoNap")}
                    </div>
                  </div>
                  {/* Descripción */}
                  <div>
                    <label style={lbl}>Descripción / Observación</label>
                    <textarea value={f.descripcion || ""} onChange={e => set("descripcion", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} />
                  </div>
                </div>
                {/* Footer */}
                <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => setModalEditarCliente(false)} style={{ padding: "9px 20px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>Cancelar</button>
                  <button onClick={() => void guardarEdicionCliente()} disabled={guardandoCliente} style={{ padding: "9px 22px", background: guardandoCliente ? "#93c5fd" : "#2563eb", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#fff", cursor: guardandoCliente ? "wait" : "pointer" }}>
                    {guardandoCliente ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {clienteDiagnosticoRapido ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1300,
              background: "rgba(15, 23, 42, 0.48)",
              display: "grid",
              placeItems: "center",
              padding: "18px",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) cerrarDiagnosticoRapidoCliente();
            }}
          >
            <div
              style={{
                width: "min(940px, 100%)",
                maxHeight: "88vh",
                overflow: "auto",
                borderRadius: "18px",
                border: "1px solid #dbe6f5",
                background: "#f8fbff",
                boxShadow: "0 30px 80px -40px rgba(15, 23, 42, 0.55)",
                padding: "18px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>Vista rápida MikroTik</div>
                  <div style={{ fontSize: "26px", fontWeight: 900, color: "#0f172a", letterSpacing: "-0.03em" }}>
                    {clienteDiagnosticoRapido.nombre || clienteDiagnosticoRapidoInfo.clienteNombre || "Cliente"}
                  </div>
                  <div style={{ fontSize: "13px", color: "#475569" }}>
                    DNI: <strong>{clienteDiagnosticoRapidoInfo.dni || "-"}</strong>
                    {" · "}
                    Nodo: <strong>{clienteDiagnosticoRapidoInfo.nodo || "-"}</strong>
                    {" · "}
                    Usuario: <strong>{clienteDiagnosticoRapidoInfo.userPppoe || "-"}</strong>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {puedeGestionarSuspensionClientes ? (
                    <>
                      {!clienteEstaSuspendidoMikrotik(clienteDiagnosticoRapido) ? (
                        <button
                          type="button"
                          onClick={() => void ejecutarAccionMikrotikCliente(clienteDiagnosticoRapido, "suspender")}
                          style={warningButton}
                          disabled={clienteMikrotikAccionLoading === "suspender"}
                        >
                          {clienteMikrotikAccionLoading === "suspender" ? "Suspendiendo..." : "Suspender"}
                        </button>
                      ) : null}
                      {clienteEstaSuspendidoMikrotik(clienteDiagnosticoRapido) ? (
                        <button
                          type="button"
                          onClick={() => void ejecutarAccionMikrotikCliente(clienteDiagnosticoRapido, "activar")}
                          style={secondaryButton}
                          disabled={clienteMikrotikAccionLoading === "activar"}
                        >
                          {clienteMikrotikAccionLoading === "activar" ? "Activando..." : "Activar"}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      const cliente = clienteDiagnosticoRapido;
                      cerrarDiagnosticoRapidoCliente();
                      void abrirDiagnosticoServicioDesdeCliente(cliente);
                    }}
                    style={secondaryButton}
                  >
                    Abrir completo
                  </button>
                  <button type="button" onClick={cerrarDiagnosticoRapidoCliente} style={secondaryButton}>
                    Cerrar
                  </button>
                </div>
              </div>

              {clienteMikrotikAccionInfo ? (
                <div
                  style={{
                    marginTop: "14px",
                    border: "1px solid #dbe6f5",
                    borderRadius: "12px",
                    padding: "10px 12px",
                    background: "#f8fbff",
                    color: "#1e3a8a",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  {clienteMikrotikAccionInfo}
                </div>
              ) : null}

              <div
                style={{
                  marginTop: "16px",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    border: `1px solid ${diagnosticoRapidoEstadoVisual.tone.border}`,
                    borderRadius: "18px",
                    padding: "18px",
                    background: clienteDiagnosticoRapidoLoading
                      ? "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)"
                      : diagnosticoRapidoMikrotik
                        ? diagnosticoRapidoEstadoVisual.tone.bg
                        : "#ffffff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px", fontWeight: 700 }}>Estado del servicio</div>
                      <div style={{ fontSize: "30px", fontWeight: 900, color: clienteDiagnosticoRapidoLoading ? "#1d4ed8" : diagnosticoRapidoEstadoVisual.tone.text, letterSpacing: "-0.03em" }}>
                        {clienteDiagnosticoRapidoLoading ? "Consultando..." : diagnosticoRapidoEstadoVisual.label}
                      </div>
                      <div style={{ marginTop: "8px", fontSize: "13px", color: "#475569" }}>
                        {clienteDiagnosticoRapidoLoading
                          ? "Revisando PPP Active y PPP Secret en el router asignado."
                          : diagnosticoRapidoMikrotik
                            ? `Consulta resuelta usando ${diagnosticoRapidoMikrotik.origen || "MikroTik"}.`
                            : "Consulta rápida preparada para este cliente."}
                      </div>
                    </div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 14px",
                        borderRadius: "999px",
                        background: clienteDiagnosticoRapidoLoading ? "#dbeafe" : diagnosticoRapidoEstadoVisual.tone.soft,
                        color: clienteDiagnosticoRapidoLoading ? "#1d4ed8" : diagnosticoRapidoEstadoVisual.tone.text,
                        border: `1px solid ${clienteDiagnosticoRapidoLoading ? "#93c5fd" : diagnosticoRapidoEstadoVisual.tone.border}`,
                        fontSize: "12px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "999px",
                          background: clienteDiagnosticoRapidoLoading ? "#2563eb" : diagnosticoRapidoEstadoVisual.tone.accent,
                          boxShadow: `0 0 0 4px ${clienteDiagnosticoRapidoLoading ? "#dbeafe" : diagnosticoRapidoEstadoVisual.tone.soft}`,
                          flexShrink: 0,
                        }}
                      />
                      {clienteDiagnosticoRapidoLoading ? "Consultando" : diagnosticoRapidoEstadoVisual.chip}
                    </span>
                  </div>

                  {clienteDiagnosticoRapidoError ? (
                    <div
                      style={{
                        marginTop: "14px",
                        border: "1px solid #fdba74",
                        borderRadius: "14px",
                        background: "#fff7ed",
                        color: "#9a3412",
                        padding: "12px 14px",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      {clienteDiagnosticoRapidoError}
                    </div>
                  ) : null}

                  <div
                    style={{
                      marginTop: "16px",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        borderRadius: "14px",
                        padding: "14px",
                        background: "#ffffff",
                        border: `1px solid ${diagnosticoRapidoEstadoVisual.tone.border}`,
                      }}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>Uptime</div>
                      <div style={{ marginTop: "8px", fontSize: "26px", fontWeight: 900, color: "#0f172a", lineHeight: 1.1 }}>
                        {formatMikrotikUptime(diagnosticoRapidoMikrotik?.uptime)}
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#64748b" }}>
                        Valor crudo: {diagnosticoRapidoMikrotik?.uptime || "-"}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: "14px",
                        padding: "14px",
                        background: "#ffffff",
                        border: `1px solid ${diagnosticoRapidoEstadoVisual.tone.border}`,
                      }}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>IP activa</div>
                      <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 900, color: "#0f172a", lineHeight: 1.1 }}>
                        {diagnosticoRapidoMikrotik?.ip || "-"}
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#64748b" }}>
                        Router: {diagnosticoRapidoMikrotik?.router?.nombre || "-"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "14px",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    {[
                      { label: "Caller-ID", value: diagnosticoRapidoMikrotik?.callerId || "-" },
                      { label: "Profile", value: diagnosticoRapidoMikrotik?.profile || "-" },
                      { label: "Disabled", value: formatDiagnosticoBoolean(diagnosticoRapidoMikrotik?.disabled) },
                      { label: "Ultima conexion", value: diagnosticoRapidoMikrotik?.lastLoggedOut || "-" },
                    ].map((item) => (
                      <div
                        key={`quick-${item.label}`}
                        style={{
                          borderRadius: "12px",
                          padding: "12px 13px",
                          background: "rgba(255,255,255,0.84)",
                          border: "1px solid rgba(148, 163, 184, 0.22)",
                        }}
                      >
                        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>
                          {item.label}
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "15px", fontWeight: 700, color: "#0f172a", lineHeight: 1.35, wordBreak: "break-word" }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #dbe6f5",
                    borderRadius: "18px",
                    padding: "18px",
                    background: "#ffffff",
                    display: "grid",
                    gap: "12px",
                    alignContent: "start",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px", fontWeight: 700 }}>Resumen del abonado</div>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Datos para atención rápida</div>
                  </div>
                  {[
                    { label: "Cliente", value: clienteDiagnosticoRapido.nombre || "-" },
                    { label: "DNI", value: clienteDiagnosticoRapidoInfo.dni || "-" },
                    { label: "Celular", value: clienteDiagnosticoRapido.celular || "-" },
                    { label: "Nodo", value: clienteDiagnosticoRapidoInfo.nodo || "-" },
                    { label: "Usuario PPPoE", value: clienteDiagnosticoRapidoInfo.userPppoe || "-" },
                    { label: "Plan", value: clienteDiagnosticoRapido.velocidad || "-" },
                    { label: "Dirección", value: clienteDiagnosticoRapido.direccion || "-" },
                  ].map((item) => (
                    <div
                      key={`cliente-quick-${item.label}`}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        padding: "11px 12px",
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>
                        {item.label}
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "14px", fontWeight: 700, color: "#0f172a", lineHeight: 1.4, wordBreak: "break-word" }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {vistaActiva === "liquidar" && ordenEnLiquidacion && (() => {
          const _t = String(ordenEnLiquidacion.tipoActuacion || "").toUpperCase();
          const _o = String(ordenEnLiquidacion.orden || "").toUpperCase();
          return _t.includes("RECUPERACION") || _t.includes("RECOJO") || _o === "RECUPERACION DE EQUIPO";
        })() && (
          <div style={{ display: "grid", gap: "24px" }}>
            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Recojo de equipo</h2>
              <div style={{ display: "grid", gap: "8px", marginBottom: "20px", padding: "12px", background: "#f0f9ff", borderRadius: "10px", border: "1px solid #bae6fd" }}>
                <div><strong>Orden:</strong> {ordenEnLiquidacion.codigo}</div>
                <div><strong>Cliente:</strong> {ordenEnLiquidacion.nombre}</div>
                <div><strong>Dirección:</strong> {ordenEnLiquidacion.direccion}</div>
                <div><strong>Nodo:</strong> {ordenEnLiquidacion.nodo}</div>
                {ordenEnLiquidacion.descripcion && <div><strong>Descripción:</strong> {ordenEnLiquidacion.descripcion}</div>}
              </div>
              <div style={formGridStyle}>
                <div>
                  <label style={labelStyle}>Técnico que ejecuta</label>
                  <select style={inputStyle} value={liquidacionRecojo.tecnicoEjecuta} onChange={(e) => setLiquidacionRecojo((p) => ({ ...p, tecnicoEjecuta: e.target.value }))}>
                    <option value="">Seleccionar técnico</option>
                    {tecnicosActivos.map((tec) => (
                      <option key={tec.id} value={tec.nombre}>{tec.nombre} - {tec.empresa}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Resultado</label>
                  <select style={inputStyle} value={liquidacionRecojo.resultado} onChange={(e) => setLiquidacionRecojo((p) => ({ ...p, resultado: e.target.value }))}>
                    <option>Completada</option>
                    <option>Reprogramada</option>
                    <option>No se encontró al cliente</option>
                    <option>No viable</option>
                  </select>
                </div>
                <div style={fullWidth}>
                  <label style={labelStyle}>Observaciones</label>
                  <textarea style={textareaStyle} value={liquidacionRecojo.observacion} onChange={(e) => setLiquidacionRecojo((p) => ({ ...p, observacion: e.target.value }))} placeholder="Detalle del recojo, condición del equipo, etc." />
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Equipos recuperados</h2>
                <button style={secondaryButton} onClick={() => setLiquidacionRecojo((p) => ({ ...p, equiposRecuperados: [...p.equiposRecuperados, { tipo: "ONU", estado: "Bueno", serial: "", fotos: [] }] }))}>
                  + Agregar equipo
                </button>
              </div>
              {liquidacionRecojo.equiposRecuperados.length === 0 ? (
                <div style={{ border: "1px dashed #cbd5e1", borderRadius: "14px", padding: "18px", color: "#6b7280", background: "#f8fafc" }}>
                  Agrega los equipos que se recuperaron del cliente.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {liquidacionRecojo.equiposRecuperados.map((eq, idx) => (
                    <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "14px" }}>
                      <div style={formGridStyle}>
                        <div>
                          <label style={labelStyle}>Tipo</label>
                          <select style={inputStyle} value={eq.tipo} onChange={(e) => setLiquidacionRecojo((p) => { const arr = [...p.equiposRecuperados]; arr[idx] = { ...arr[idx], tipo: e.target.value }; return { ...p, equiposRecuperados: arr }; })}>
                            <option>ONU</option>
                            <option>Router</option>
                            <option>Repetidor</option>
                            <option>Switch</option>
                            <option>Decodificador</option>
                            <option>Otro</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Estado del equipo</label>
                          <select style={inputStyle} value={eq.estado} onChange={(e) => setLiquidacionRecojo((p) => { const arr = [...p.equiposRecuperados]; arr[idx] = { ...arr[idx], estado: e.target.value }; return { ...p, equiposRecuperados: arr }; })}>
                            <option>Bueno</option>
                            <option>Dañado</option>
                            <option>Incompleto</option>
                            <option>Obsoleto</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ marginTop: "12px" }}>
                        <label style={labelStyle}>Marca</label>
                        <select style={inputStyle} value={eq.marca || ""} onChange={(e) => setLiquidacionRecojo((p) => { const arr = [...p.equiposRecuperados]; arr[idx] = { ...arr[idx], marca: e.target.value }; return { ...p, equiposRecuperados: arr }; })}>
                          <option value="">— Seleccionar —</option>
                          <option>ZTE</option>
                          <option>Huawei</option>
                          <option>VSOL</option>
                          <option>Optictimes</option>
                          <option>Otras</option>
                        </select>
                      </div>
                      <div style={{ marginTop: "12px" }}>
                        <label style={labelStyle}>Serial / Código QR</label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            style={{ ...inputStyle, flex: 1 }}
                            placeholder="Escanear o ingresar manual"
                            value={eq.serial || ""}
                            onChange={(e) => setLiquidacionRecojo((p) => { const arr = [...p.equiposRecuperados]; arr[idx] = { ...arr[idx], serial: e.target.value }; return { ...p, equiposRecuperados: arr }; })}
                          />
                          <button
                            type="button"
                            style={{ ...secondaryButton, whiteSpace: "nowrap" }}
                            onClick={() => setScannerRecojoIdx(idx)}
                            title="Escanear código QR"
                          >
                            📷 Escanear QR
                          </button>
                        </div>
                        {scannerRecojoIdx === idx && (
                          <QRScanner
                            onDetected={(codigo) => {
                              setLiquidacionRecojo((p) => { const arr = [...p.equiposRecuperados]; arr[idx] = { ...arr[idx], serial: codigo }; return { ...p, equiposRecuperados: arr }; });
                              setScannerRecojoIdx(null);
                            }}
                            onClose={() => setScannerRecojoIdx(null)}
                          />
                        )}
                      </div>
                      <div style={{ marginTop: "12px" }}>
                        <label style={labelStyle}>Fotos etiqueta/seriales (obligatoria al menos 1)</label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
                          <label style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                            + Agregar fotos
                            <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              e.target.value = "";
                              for (const file of files) {
                                const valor = await uploadFotoOrBase64(file, "recuperados");
                                if (valor) setLiquidacionRecojo((p) => {
                                  const arr = [...p.equiposRecuperados];
                                  arr[idx] = { ...arr[idx], fotos: [...(arr[idx].fotos || []), valor] };
                                  return { ...p, equiposRecuperados: arr };
                                });
                              }
                            }} />
                          </label>
                          {(!eq.fotos || eq.fotos.length === 0) && (
                            <span style={{ fontSize: "12px", color: "#b45309", fontWeight: 700 }}>Falta foto</span>
                          )}
                        </div>
                        {eq.fotos && eq.fotos.length > 0 && (
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {eq.fotos.map((f, fi) => (
                              <div key={fi} style={{ position: "relative" }}>
                                <img src={f} alt={`eq-${idx}-${fi}`} style={{ width: "100px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb", cursor: "pointer" }} onClick={() => abrirFotoZoom(f, `Equipo ${eq.tipo} foto ${fi + 1}`)} />
                                <button type="button" onClick={() => setLiquidacionRecojo((p) => { const arr = [...p.equiposRecuperados]; arr[idx] = { ...arr[idx], fotos: arr[idx].fotos.filter((_, fi2) => fi2 !== fi) }; return { ...p, equiposRecuperados: arr }; })} style={{ position: "absolute", top: "4px", right: "4px", background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: "999px", width: "22px", height: "22px", cursor: "pointer", fontSize: "12px", lineHeight: 1 }}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: "10px" }}>
                        <button style={dangerButton} onClick={() => setLiquidacionRecojo((p) => ({ ...p, equiposRecuperados: p.equiposRecuperados.filter((_, i) => i !== idx) }))}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Fotos adicionales</h2>
              <input type="file" accept="image/*" multiple disabled={liquidacionRecojo.fotos.length >= 5} onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                for (const file of files) {
                  const valor = await uploadFotoOrBase64(file, "recuperados");
                  if (valor) setLiquidacionRecojo((p) => p.fotos.length < 5 ? { ...p, fotos: [...p.fotos, valor] } : p);
                }
              }} />
              <div style={{ marginTop: "10px", fontSize: "13px", color: "#6b7280" }}>Fotos: {liquidacionRecojo.fotos.length}/5</div>
              {liquidacionRecojo.fotos.length > 0 && (
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "16px" }}>
                  {liquidacionRecojo.fotos.map((foto, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={foto} alt={`foto-${i}`} style={{ width: "150px", maxWidth: "100%", borderRadius: "12px", border: "1px solid #e5e7eb" }} />
                      <button onClick={() => setLiquidacionRecojo((p) => ({ ...p, fotos: p.fotos.filter((_, fi) => fi !== i) }))} style={{ position: "absolute", top: "6px", right: "6px", background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: "999px", width: "26px", height: "26px", cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button onClick={guardarLiquidacionRecojo} style={primaryButton}>Guardar recojo</button>
              <button onClick={() => setVistaActiva("pendientes")} style={secondaryButton}>Cancelar</button>
            </div>
          </div>
        )}

        {vistaActiva === "liquidar" && ordenEnLiquidacion && (() => {
          const _t = String(ordenEnLiquidacion.tipoActuacion || "").toUpperCase();
          const _o = String(ordenEnLiquidacion.orden || "").toUpperCase();
          return !_t.includes("RECUPERACION") && !_t.includes("RECOJO") && _o !== "RECUPERACION DE EQUIPO";
        })() && (
          <div style={{ display: "grid", gap: "20px" }}>
            {/* Encabezado orden */}
            <div style={{ ...cardStyle, background: "#f0f9ff", border: "1px solid #bae6fd" }}>
              <h2 style={{ ...sectionTitleStyle, marginBottom: "12px" }}>
                {liquidacionEditandoId ? "Editar liquidación" : "Liquidar orden"}
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", fontSize: "14px" }}>
                <div><span style={{ fontWeight: 700, color: "#64748b" }}>Código</span><div style={{ color: "#0f172a", fontWeight: 700, fontSize: "15px" }}>{ordenEnLiquidacion.codigo}</div></div>
                <div><span style={{ fontWeight: 700, color: "#64748b" }}>Cliente</span><div style={{ color: "#0f172a" }}>{ordenEnLiquidacion.nombre}</div></div>
                <div><span style={{ fontWeight: 700, color: "#64748b" }}>Dirección</span><div style={{ color: "#0f172a" }}>{ordenEnLiquidacion.direccion}</div></div>
                <div><span style={{ fontWeight: 700, color: "#64748b" }}>Técnico</span><div style={{ color: "#0f172a" }}>{ordenEnLiquidacion.tecnico || "—"}</div></div>
              </div>

              {/* Caja NAP */}
              <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #bae6fd" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "#0369a1", fontSize: "13px" }}>Caja NAP:</span>
                  {liquidacion.cajaNap ? (
                    <span style={{ background: "#0ea5e9", color: "#fff", borderRadius: "8px", padding: "3px 12px", fontWeight: 700, fontSize: "13px" }}>
                      {liquidacion.cajaNap}
                    </span>
                  ) : (
                    <span style={{ color: "#dc2626", fontSize: "13px", fontWeight: 600 }}>Sin caja asignada</span>
                  )}
                  <button
                    type="button"
                    style={{ ...secondaryButton, fontSize: "12px", padding: "4px 12px" }}
                    onClick={() => handleLiquidacionChange("_showCajaPicker", !liquidacion._showCajaPicker)}
                  >
                    {liquidacion.cajaNap ? "Cambiar" : "Asignar"}
                  </button>
                </div>

                {liquidacion._showCajaPicker && (
                  <div style={{ marginTop: "10px" }}>
                    <label style={labelStyle}>Seleccionar caja NAP</label>
                    <select
                      style={inputStyle}
                      value={liquidacion.cajaNap}
                      onChange={e => {
                        handleLiquidacionChange("cajaNap", e.target.value);
                        handleLiquidacionChange("_showCajaPicker", false);
                      }}
                    >
                      <option value="">— Sin caja —</option>
                      {napCajasMapData
                        .filter(c => !ordenEnLiquidacion.nodo || c.nodo === ordenEnLiquidacion.nodo)
                        .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))
                        .map(c => (
                          <option key={c.id} value={c.codigo}>
                            {c.codigo} — {c.sector || c.nodo} ({c.puertos_ocupados || 0}/{c.capacidad || 8} puertos)
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Resultado final — pills */}
            <div style={cardStyle}>
              <label style={{ ...labelStyle, marginBottom: "10px", display: "block" }}>Resultado final</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {["Completada","Reprogramada","No se encontró al cliente","No viable","Pendiente por material"].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleLiquidacionChange("resultadoFinal", v)}
                    style={{
                      padding: "8px 16px", borderRadius: "20px", border: "1.5px solid",
                      borderColor: liquidacion.resultadoFinal === v ? "#2563eb" : "#cbd5e1",
                      background: liquidacion.resultadoFinal === v ? "#2563eb" : "#f8fafc",
                      color: liquidacion.resultadoFinal === v ? "#fff" : "#374151",
                      fontWeight: 600, fontSize: "13px", cursor: "pointer", transition: "all 0.15s",
                    }}
                  >{v}</button>
                ))}
              </div>
            </div>

            {/* Datos técnicos: etiqueta, SN ONU, parámetro, técnico */}
            <div style={cardStyle}>
              <h3 style={{ ...sectionTitleStyle, fontSize: "14px", marginBottom: "14px" }}>Datos técnicos</h3>
              <div style={formGridStyle}>
                <div>
                  <label style={labelStyle}>Técnico que liquida</label>
                  <select
                    style={inputStyle}
                    value={liquidacion.tecnicoLiquida}
                    onChange={(e) => handleLiquidacionChange("tecnicoLiquida", e.target.value)}
                  >
                    <option value="">Seleccionar técnico</option>
                    {tecnicosActivos.map((tec) => (
                      <option key={tec.id} value={tec.nombre}>
                        {tec.nombre} - {tec.empresa}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Código etiqueta <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>({etiquetasDisponibles.length} disponibles)</span></label>
                  <input
                    style={inputStyle}
                    value={liquidacion.codigoEtiqueta}
                    onChange={(e) => { handleLiquidacionChange("codigoEtiqueta", e.target.value); setEtiquetaFiltro(e.target.value); setShowEtiquetaDropdown(true); }}
                    onFocus={() => { setEtiquetaFiltro(liquidacion.codigoEtiqueta || ""); setShowEtiquetaDropdown(true); }}
                    onBlur={() => setTimeout(() => setShowEtiquetaDropdown(false), 200)}
                    placeholder="Escribe para buscar etiqueta..."
                    autoComplete="off"
                    list="etiquetas-disponibles-list"
                  />
                  <datalist id="etiquetas-disponibles-list">
                    {etiquetasDisponibles.filter(e => !etiquetaFiltro || e.includes(etiquetaFiltro)).slice(0, 100).map(e => (
                      <option key={e} value={e} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={labelStyle}>SN ONU</label>
                  <input
                    style={inputStyle}
                    value={liquidacion.snOnu}
                    onChange={(e) => handleLiquidacionChange("snOnu", e.target.value)}
                    placeholder="Serial number ONU"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Parámetro</label>
                  <input
                    style={inputStyle}
                    value={liquidacion.parametro}
                    onChange={(e) => handleLiquidacionChange("parametro", e.target.value)}
                    placeholder="Parámetro de liquidación"
                  />
                </div>
                <div style={fullWidth}>
                  <label style={labelStyle}>Observación final</label>
                  <textarea
                    style={textareaStyle}
                    value={liquidacion.observacionFinal}
                    onChange={(e) => handleLiquidacionChange("observacionFinal", e.target.value)}
                    placeholder="Detalle técnico del cierre"
                  />
                </div>
              </div>
            </div>

            {/* Cobro — toggle SI/NO + monto + método pago pills */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <label style={{ ...labelStyle, margin: 0 }}>Cobro realizado</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {["SI","NO"].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleLiquidacionChange("cobroRealizado", v)}
                      style={{
                        padding: "7px 22px", borderRadius: "20px", border: "1.5px solid",
                        borderColor: liquidacion.cobroRealizado === v ? "#2563eb" : "#cbd5e1",
                        background: liquidacion.cobroRealizado === v ? "#2563eb" : "#f8fafc",
                        color: liquidacion.cobroRealizado === v ? "#fff" : "#374151",
                        fontWeight: 700, fontSize: "14px", cursor: "pointer",
                      }}
                    >{v}</button>
                  ))}
                </div>
              </div>
              {liquidacion.cobroRealizado === "SI" && (
                <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Monto cobrado (S/)</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min="0"
                      step="0.01"
                      value={liquidacion.montoCobrado}
                      onChange={(e) => handleLiquidacionChange("montoCobrado", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: "8px", display: "block" }}>Método de pago</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {["Efectivo","Yape","Plin","Transferencia"].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => handleLiquidacionChange("medioPago", v)}
                          style={{
                            padding: "8px 18px", borderRadius: "20px", border: "1.5px solid",
                            borderColor: liquidacion.medioPago === v ? "#16a34a" : "#cbd5e1",
                            background: liquidacion.medioPago === v ? "#16a34a" : "#f8fafc",
                            color: liquidacion.medioPago === v ? "#fff" : "#374151",
                            fontWeight: 600, fontSize: "13px", cursor: "pointer",
                          }}
                        >{v}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actualizar ubicación */}
            <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <label style={{ ...labelStyle, margin: 0 }}>Actualizar ubicación</label>
              <div style={{ display: "flex", gap: "6px" }}>
                {["SI","NO"].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleLiquidacionChange("actualizarUbicacion", v)}
                    style={{
                      padding: "7px 22px", borderRadius: "20px", border: "1.5px solid",
                      borderColor: liquidacion.actualizarUbicacion === v ? "#2563eb" : "#cbd5e1",
                      background: liquidacion.actualizarUbicacion === v ? "#2563eb" : "#f8fafc",
                      color: liquidacion.actualizarUbicacion === v ? "#fff" : "#374151",
                      fontWeight: 700, fontSize: "14px", cursor: "pointer",
                    }}
                  >{v}</button>
                ))}
              </div>
              {liquidacion.actualizarUbicacion === "SI" && (
                <div style={{ width: "100%", marginTop: "10px" }}>
                  <label style={labelStyle}>Nueva ubicación (lat,lng)</label>
                  <input
                    style={inputStyle}
                    value={liquidacion.nuevaUbicacion}
                    onChange={(e) => handleLiquidacionChange("nuevaUbicacion", e.target.value)}
                    placeholder="-16.438490, -71.598208"
                  />
                  <div style={{ marginTop: "6px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={secondaryButton}
                      onClick={() => {
                        if (!navigator.geolocation) { alert("GPS no disponible en este navegador"); return; }
                        navigator.geolocation.getCurrentPosition(
                          pos => handleLiquidacionChange("nuevaUbicacion", `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
                          () => alert("No se pudo obtener la ubicación GPS")
                        );
                      }}
                    >Usar mi GPS</button>
                    <button
                      type="button"
                      style={secondaryButton}
                      onClick={() => handleLiquidacionChange("nuevaUbicacion", String(ordenEnLiquidacion?.ubicacion || ""))}
                    >Ubicación actual de la orden</button>
                  </div>
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Equipos y materiales</h2>
                  {(liquidacion.equipos.length > 0 || liquidacion.materiales.length > 0) && (
                    <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: "12px", padding: "3px 10px", fontSize: "12px", fontWeight: 700, border: "1px solid #bfdbfe" }}>
                      {liquidacion.equipos.length} eq · {liquidacion.materiales.length} mat
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={agregarEquipo} style={secondaryButton}>+ Agregar equipo</button>
                  <button onClick={() => setMostrarScannerLiquidacion((prev) => !prev)} style={infoButton}>Escanear QR</button>
                </div>
              </div>

              <div style={{ ...formGridStyle, marginBottom: "14px" }}>
                <div>
                  <label style={labelStyle}>Código QR manual (opcional)</label>
                  <input
                    style={inputStyle}
                    value={liquidacion.codigoQRManual}
                    onChange={(e) => handleLiquidacionChange("codigoQRManual", e.target.value)}
                    placeholder="Escanea o pega QR (si no tiene QR, usa Agregar equipo)"
                  />
                </div>

                <div style={{ display: "flex", alignItems: "end" }}>
                  <button
                    onClick={() => agregarEquipoDesdeCatalogoALiquidacion()}
                    style={primaryButton}
                  >
                    Agregar desde inventario
                  </button>
                </div>
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "10px" }}>
                Si el equipo no tiene QR, usa <strong>Agregar manual</strong> y registra serial/identificador.
              </div>

              {equiposDisponiblesParaSeleccionManual.length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={labelStyle}>
                    Buscar en inventario del técnico ({equiposDisponiblesParaSeleccionManual.length} disponibles)
                  </label>
                  <input
                    style={inputStyle}
                    value={busquedaEqInv}
                    onChange={e => setBusquedaEqInv(e.target.value)}
                    placeholder="Escribe tipo, código QR o serial para filtrar…"
                  />
                  {busquedaEqInv.trim().length >= 2 && (() => {
                    const q = busquedaEqInv.trim().toLowerCase();
                    const matches = equiposDisponiblesParaSeleccionManual.filter(eq =>
                      (eq.tipo || "").toLowerCase().includes(q) ||
                      (eq.codigoQR || "").toLowerCase().includes(q) ||
                      (eq.serial || "").toLowerCase().includes(q) ||
                      (eq.marca || "").toLowerCase().includes(q) ||
                      (eq.modelo || "").toLowerCase().includes(q)
                    ).slice(0, 12);
                    return matches.length > 0 ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:4, marginTop:8, border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden", background:"#fff" }}>
                        {matches.map(eq => (
                          <button
                            key={eq.id}
                            onClick={() => { agregarEquipoDesdeCatalogoALiquidacion(eq.codigoQR); setBusquedaEqInv(""); }}
                            style={{ background:"#f8fafc", border:"none", borderBottom:"1px solid #f1f5f9", padding:"10px 14px", cursor:"pointer", textAlign:"left", fontSize:13, color:"#1e293b" }}
                            onMouseEnter={e => e.currentTarget.style.background="#eff6ff"}
                            onMouseLeave={e => e.currentTarget.style.background="#f8fafc"}
                          >
                            <strong>{eq.tipo}</strong>
                            <span style={{ color:"#6b7280", marginLeft:8 }}>{eq.codigoQR}</span>
                            {eq.serial && <span style={{ color:"#94a3b8", marginLeft:8, fontSize:12 }}>· {eq.serial}</span>}
                            {eq.marca && <span style={{ color:"#94a3b8", marginLeft:8, fontSize:12 }}>· {eq.marca}</span>}
                          </button>
                        ))}
                        {equiposDisponiblesParaSeleccionManual.filter(eq =>
                          (eq.tipo||"").toLowerCase().includes(q)||(eq.codigoQR||"").toLowerCase().includes(q)||(eq.serial||"").toLowerCase().includes(q)
                        ).length > 12 && (
                          <div style={{ padding:"8px 14px", fontSize:12, color:"#94a3b8", background:"#f8fafc" }}>
                            Más de 12 resultados — escribe más para filtrar
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop:8, fontSize:13, color:"#94a3b8" }}>Sin coincidencias para "{busquedaEqInv}"</div>
                    );
                  })()}
                </div>
              )}

              {mostrarScannerLiquidacion && (
                <QRScanner
                  onDetected={(codigo) => agregarEquipoDesdeCatalogoALiquidacion(codigo)}
                  onClose={() => setMostrarScannerLiquidacion(false)}
                />
              )}

              {liquidacion.equipos.length === 0 ? (
                <div
                  style={{
                    border: "1px dashed #cbd5e1",
                    borderRadius: "14px",
                    padding: "18px",
                    color: "#6b7280",
                    background: "#f8fafc",
                  }}
                >
                  No se ha agregado ningún equipo. Esto está bien si la liquidación no usa equipos.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {liquidacion.equipos.map((equipo, index) => (
                    <div
                      key={index}
                      style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "14px" }}
                    >
                      <div style={formGridStyle}>
                        <div>
                          <label style={labelStyle}>Tipo</label>
                          <select
                            style={inputStyle}
                            value={equipo.tipo}
                            onChange={(e) => actualizarEquipo(index, "tipo", e.target.value)}
                          >
                            <option>ONU</option>
                            <option>Router</option>
                            <option>Repetidor</option>
                            <option>Switch</option>
                            <option>Otro</option>
                          </select>
                        </div>

                        <div>
                          <label style={labelStyle}>Código QR / interno</label>
                          <input
                            style={inputStyle}
                            value={equipo.codigo}
                            onChange={(e) => actualizarEquipo(index, "codigo", e.target.value)}
                            placeholder="Código del equipo"
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>Serial / MAC / Identificador</label>
                          <input
                            style={inputStyle}
                            value={equipo.serial}
                            onChange={(e) => actualizarEquipo(index, "serial", e.target.value)}
                            placeholder="Serial, MAC o identificador alterno"
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>Acción</label>
                          <select
                            style={inputStyle}
                            value={equipo.accion}
                            onChange={(e) => actualizarEquipo(index, "accion", e.target.value)}
                          >
                            <option>Instalado</option>
                            <option>Retirado</option>
                            <option>Reemplazado</option>
                            <option>Devuelto</option>
                          </select>
                        </div>

                        <div>
                          <label style={labelStyle}>Marca</label>
                          <input
                            style={inputStyle}
                            value={equipo.marca || ""}
                            onChange={(e) => actualizarEquipo(index, "marca", e.target.value)}
                            placeholder="Marca"
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>Modelo</label>
                          <input
                            style={inputStyle}
                            value={equipo.modelo || ""}
                            onChange={(e) => actualizarEquipo(index, "modelo", e.target.value)}
                            placeholder="Modelo"
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                        <div>
                          <label style={labelStyle}>Foto serial/equipo (obligatoria)</label>
                          <input
                            style={inputStyle}
                            value={equipo.fotoReferencia || ""}
                            onChange={(e) => actualizarEquipo(index, "fotoReferencia", e.target.value)}
                            placeholder="URL de la foto o sube un archivo"
                          />
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                          <label style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                            Subir foto
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              onChange={(e) => cargarFotoEquipoLiquidacion(index, e)}
                            />
                          </label>
                          {String(equipo.fotoReferencia || "").trim() ? (
                            <button
                              type="button"
                              style={secondaryButton}
                              onClick={() => abrirFotoZoom(equipo.fotoReferencia, `Equipo ${equipo.codigo || index + 1}`)}
                            >
                              Ver foto
                            </button>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#b45309", fontWeight: 700 }}>Falta foto</span>
                          )}
                        </div>
                        {String(equipo.fotoReferencia || "").trim() ? (
                          <img
                            src={equipo.fotoReferencia}
                            alt={`equipo-${index}`}
                            style={{
                              width: "120px",
                              height: "90px",
                              objectFit: "cover",
                              borderRadius: "10px",
                              border: "1px solid #e5e7eb",
                            }}
                          />
                        ) : null}
                      </div>

                      <div style={{ marginTop: "12px" }}>
                        <button onClick={() => eliminarEquipo(index)} style={dangerButton}>
                          Eliminar equipo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Equipos recuperados del cliente — solo para incidencia/mantenimiento, NO instalación */}
            {(() => { const _t = String(ordenEnLiquidacion?.tipoActuacion || "").toUpperCase(); return !_t.includes("INSTALACION") && !_t.includes("RECOJO") && !_t.includes("RECUPERACION"); })() && <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "10px" }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Equipos recuperados del cliente</h2>
                <button
                  style={secondaryButton}
                  onClick={() => handleLiquidacionChange("equiposRecuperados", [
                    ...(Array.isArray(liquidacion.equiposRecuperados) ? liquidacion.equiposRecuperados : []),
                    { tipo: "ONU", estado: "Bueno", marca: "", serial: "", fotos: [] }
                  ])}
                >
                  + Agregar equipo
                </button>
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px" }}>
                Si retiraste algún equipo del cliente en esta visita, regístralo aquí. Quedará en Custodia Técnica pendiente de entrega a almacén.
              </div>
              {(Array.isArray(liquidacion.equiposRecuperados) ? liquidacion.equiposRecuperados : []).length === 0 ? (
                <div style={{ border: "1px dashed #cbd5e1", borderRadius: "14px", padding: "18px", color: "#6b7280", background: "#f8fafc" }}>
                  Sin equipos recuperados. Si no retiraste ningún equipo, puedes continuar.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {(Array.isArray(liquidacion.equiposRecuperados) ? liquidacion.equiposRecuperados : []).map((eq, idx) => (
                    <div key={idx} style={{ border: "1px solid #fde68a", borderRadius: "14px", padding: "14px", background: "#fffbeb" }}>
                      <div style={formGridStyle}>
                        <div>
                          <label style={labelStyle}>Tipo</label>
                          <select style={inputStyle} value={eq.tipo} onChange={(e) => {
                            const arr = [...(liquidacion.equiposRecuperados || [])];
                            arr[idx] = { ...arr[idx], tipo: e.target.value };
                            handleLiquidacionChange("equiposRecuperados", arr);
                          }}>
                            <option>ONU</option>
                            <option>Router</option>
                            <option>Repetidor</option>
                            <option>Switch</option>
                            <option>Decodificador</option>
                            <option>Otro</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Estado del equipo</label>
                          <select style={inputStyle} value={eq.estado} onChange={(e) => {
                            const arr = [...(liquidacion.equiposRecuperados || [])];
                            arr[idx] = { ...arr[idx], estado: e.target.value };
                            handleLiquidacionChange("equiposRecuperados", arr);
                          }}>
                            <option>Bueno</option>
                            <option>Dañado</option>
                            <option>Incompleto</option>
                            <option>Obsoleto</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ marginTop: "12px" }}>
                        <label style={labelStyle}>Marca</label>
                        <select style={inputStyle} value={eq.marca || ""} onChange={(e) => {
                          const arr = [...(liquidacion.equiposRecuperados || [])];
                          arr[idx] = { ...arr[idx], marca: e.target.value };
                          handleLiquidacionChange("equiposRecuperados", arr);
                        }}>
                          <option value="">— Seleccionar —</option>
                          <option>ZTE</option>
                          <option>Huawei</option>
                          <option>VSOL</option>
                          <option>Optictimes</option>
                          <option>Otras</option>
                        </select>
                      </div>
                      <div style={{ marginTop: "12px" }}>
                        <label style={labelStyle}>Serial / Código QR</label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            style={{ ...inputStyle, flex: 1 }}
                            placeholder="Escanear o ingresar manual"
                            value={eq.serial || ""}
                            onChange={(e) => {
                              const arr = [...(liquidacion.equiposRecuperados || [])];
                              arr[idx] = { ...arr[idx], serial: e.target.value };
                              handleLiquidacionChange("equiposRecuperados", arr);
                            }}
                          />
                          <button
                            type="button"
                            style={{ ...secondaryButton, whiteSpace: "nowrap" }}
                            onClick={() => setScannerLiqRecIdx(idx)}
                          >
                            📷 Escanear QR
                          </button>
                        </div>
                        {scannerLiqRecIdx === idx && (
                          <QRScanner
                            onDetected={(codigo) => {
                              const arr = [...(liquidacion.equiposRecuperados || [])];
                              arr[idx] = { ...arr[idx], serial: codigo };
                              handleLiquidacionChange("equiposRecuperados", arr);
                              setScannerLiqRecIdx(null);
                            }}
                            onClose={() => setScannerLiqRecIdx(null)}
                          />
                        )}
                      </div>
                      <div style={{ marginTop: "12px" }}>
                        <label style={labelStyle}>Foto del equipo (obligatoria)</label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
                          <label style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                            + Agregar foto
                            <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              e.target.value = "";
                              for (const file of files) {
                                const valor = await uploadFotoOrBase64(file, "recuperados");
                                if (valor) {
                                  const arr = [...(liquidacion.equiposRecuperados || [])];
                                  arr[idx] = { ...arr[idx], fotos: [...(arr[idx].fotos || []), valor] };
                                  handleLiquidacionChange("equiposRecuperados", arr);
                                }
                              }
                            }} />
                          </label>
                          {(!eq.fotos || eq.fotos.length === 0) && (
                            <span style={{ fontSize: "12px", color: "#b45309", fontWeight: 700 }}>Falta foto</span>
                          )}
                        </div>
                        {eq.fotos && eq.fotos.length > 0 && (
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {eq.fotos.map((f, fi) => (
                              <div key={fi} style={{ position: "relative" }}>
                                <img
                                  src={f}
                                  alt={`rec-liq-${idx}-${fi}`}
                                  style={{ width: "100px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb", cursor: "pointer" }}
                                  onClick={() => abrirFotoZoom(f, `Equipo recuperado ${eq.tipo} foto ${fi + 1}`)}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const arr = [...(liquidacion.equiposRecuperados || [])];
                                    arr[idx] = { ...arr[idx], fotos: arr[idx].fotos.filter((_, fi2) => fi2 !== fi) };
                                    handleLiquidacionChange("equiposRecuperados", arr);
                                  }}
                                  style={{ position: "absolute", top: "4px", right: "4px", background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: "999px", width: "22px", height: "22px", cursor: "pointer", fontSize: "12px", lineHeight: 1 }}
                                >×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: "10px" }}>
                        <button
                          style={dangerButton}
                          onClick={() => handleLiquidacionChange("equiposRecuperados", (liquidacion.equiposRecuperados || []).filter((_, i) => i !== idx))}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>}

            <div style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Materiales consumidos</h2>
                <button onClick={agregarMaterial} style={secondaryButton}>
                  Agregar material
                </button>
              </div>

              {liquidacion.materiales.length === 0 ? (
                <div
                  style={{
                    border: "1px dashed #cbd5e1",
                    borderRadius: "14px",
                    padding: "18px",
                    color: "#6b7280",
                    background: "#f8fafc",
                  }}
                >
                  No se ha agregado ningún material. Esto está bien si la liquidación no usa materiales.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {liquidacion.materiales.map((material, index) => (
                    <div
                      key={index}
                      style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "14px" }}
                    >
                      <div style={formGridStyle}>
                        <div>
                          <label style={labelStyle}>Material</label>
                          <input
                            style={inputStyle}
                            value={material.material}
                            onChange={(e) => actualizarMaterial(index, "material", e.target.value)}
                            placeholder="Drop cable, grapas, conectores..."
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>Cantidad</label>
                          <input
                            style={inputStyle}
                            value={material.cantidad}
                            onChange={(e) => actualizarMaterial(index, "cantidad", e.target.value)}
                            placeholder="Cantidad"
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>Unidad</label>
                          <select
                            style={inputStyle}
                            value={material.unidad}
                            onChange={(e) => actualizarMaterial(index, "unidad", e.target.value)}
                          >
                            <option>unidad</option>
                            <option>metros</option>
                            <option>rollo</option>
                            <option>caja</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ marginTop: "12px" }}>
                        <button onClick={() => eliminarMaterial(index)} style={dangerButton}>
                          Eliminar material
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Fotos de liquidación</h2>
                  <span style={{ fontSize: 13, fontWeight: 700, color: liquidacion.fotos.length >= 3 ? "#16a34a" : "#dc2626", background: liquidacion.fotos.length >= 3 ? "#dcfce7" : "#fee2e2", borderRadius: 999, padding: "3px 10px" }}>
                    {liquidacion.fotos.length}/3 mín
                  </span>
                </div>
                <label style={{ ...primaryButton, display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", opacity: liquidacion.fotos.length >= 10 ? 0.5 : 1 }}>
                  Subir foto
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={cargarFotosLiquidacion} disabled={liquidacion.fotos.length >= 10} />
                </label>
              </div>
              {liquidacion.fotos.length < 3 && (
                <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>Se requieren al menos 3 fotos de evidencia</div>
              )}

              {liquidacion.fotos.length > 0 && (
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "16px" }}>
                  {liquidacion.fotos.map((foto, index) => (
                    <div key={index} style={{ position: "relative" }}>
                      <img
                        src={foto}
                        alt={`foto-${index}`}
                        style={{
                          width: "180px",
                          maxWidth: "100%",
                          borderRadius: "14px",
                          border: "1px solid #e5e7eb",
                        }}
                      />
                      <button
                        onClick={() => quitarFotoLiquidacion(index)}
                        style={{
                          position: "absolute",
                          top: "8px",
                          right: "8px",
                          background: "#fff",
                          border: "1px solid #fecaca",
                          color: "#b91c1c",
                          borderRadius: "999px",
                          width: "28px",
                          height: "28px",
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                onClick={guardarLiquidacion}
                disabled={liquidacionGuardando}
                style={{ ...primaryButton, opacity: liquidacionGuardando ? 0.65 : 1, cursor: liquidacionGuardando ? "not-allowed" : "pointer" }}
              >
                {liquidacionGuardando ? "Guardando…" : liquidacionEditandoId ? "Guardar cambios" : "Guardar liquidación"}
              </button>
              <button onClick={() => setVistaActiva("pendientes")} disabled={liquidacionGuardando} style={secondaryButton}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {vistaActiva === "recuperaciones" && (
          <div style={{ display: "grid", gap: "20px" }}>
            {/* Submenú */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { key: "ejecuciones", label: "Ejecuciones" },
                { key: "stock", label: `Custodia Técnica (${stockTecnico.filter((s) => !s.ingresado_almacen).length} pendientes)` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setRecuperacionesSubmenu(tab.key)}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "999px",
                    border: "1px solid",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: recuperacionesSubmenu === tab.key ? "#1e40af" : "#f8fafc",
                    color: recuperacionesSubmenu === tab.key ? "#fff" : "#374151",
                    borderColor: recuperacionesSubmenu === tab.key ? "#1e40af" : "#e5e7eb",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* EJECUCIONES */}
            {recuperacionesSubmenu === "ejecuciones" && (
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                  <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Historial de recuperaciones</h2>
                  <button style={secondaryButton} onClick={cargarHistorialRecuperaciones} disabled={cargandoRecuperaciones}>
                    {cargandoRecuperaciones ? "Cargando..." : "Actualizar"}
                  </button>
                </div>
                {cargandoRecuperaciones ? (
                  <div style={{ color: "#6b7280", padding: "16px" }}>Cargando...</div>
                ) : historialRecuperaciones.length === 0 ? (
                  <div style={{ border: "1px dashed #cbd5e1", borderRadius: "14px", padding: "24px", color: "#6b7280", background: "#f8fafc", textAlign: "center" }}>
                    No hay recuperaciones registradas aún.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {historialRecuperaciones.map((rec, idx) => {
                      const equipos = Array.isArray(rec.equipos_recuperados) ? rec.equipos_recuperados : [];
                      const fotos = Array.isArray(rec.fotos) ? rec.fotos : [];
                      const fecha = rec.fecha_ejecucion ? new Date(rec.fecha_ejecucion).toLocaleString("es-PE") : "";
                      const resultadoColor = rec.resultado === "Completada" ? "#166534" : rec.resultado === "Reprogramada" ? "#92400e" : "#991b1b";
                      const resultadoBg = rec.resultado === "Completada" ? "#dcfce7" : rec.resultado === "Reprogramada" ? "#fef3c7" : "#fee2e2";
                      return (
                        <div key={rec.id || idx} style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "16px", background: "#fff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: "15px" }}>{rec.nombre_cliente || "-"}</div>
                              <div style={{ fontSize: "13px", color: "#6b7280" }}>{rec.direccion} {rec.nodo ? `· ${rec.nodo}` : ""}</div>
                              <div style={{ fontSize: "12px", color: "#94a3b8" }}>{rec.orden_codigo} · {fecha}</div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                              <span style={{ background: resultadoBg, color: resultadoColor, borderRadius: "999px", padding: "3px 10px", fontSize: "12px", fontWeight: 700 }}>{rec.resultado}</span>
                              <span style={{ fontSize: "12px", color: "#64748b" }}>{rec.tecnico_ejecuta}</span>
                            </div>
                          </div>
                          {equipos.length > 0 && (
                            <div style={{ marginBottom: "10px" }}>
                              <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "6px" }}>Equipos recuperados ({equipos.length})</div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {equipos.map((eq, ei) => (
                                  <div key={ei} style={{ background: "#f1f5f9", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span style={{ fontWeight: 700 }}>{eq.tipo}</span>
                                    <span style={{ color: eq.estado === "Bueno" ? "#166534" : eq.estado === "Dañado" ? "#991b1b" : "#92400e", fontWeight: 600 }}>{eq.estado}</span>
                                    {eq.serial && <span style={{ fontSize: "11px", color: "#0369a1", fontFamily: "monospace" }}>S/N: {eq.serial}</span>}
                                    {eq.fotos && eq.fotos.length > 0 && (
                                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                                        {eq.fotos.map((f, fi) => (
                                          <img key={fi} src={f} alt="equipo" style={{ width: "70px", height: "55px", objectFit: "cover", borderRadius: "6px", cursor: "pointer" }} onClick={() => abrirFotoZoom(f, `${eq.tipo} foto ${fi + 1}`)} />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {rec.observacion && <div style={{ fontSize: "13px", color: "#374151", marginBottom: "8px" }}><strong>Obs:</strong> {rec.observacion}</div>}
                          {fotos.length > 0 && (
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                              {fotos.map((f, fi) => (
                                <img key={fi} src={f} alt={`foto-${fi}`} style={{ width: "90px", height: "70px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb", cursor: "pointer" }} onClick={() => abrirFotoZoom(f, `Foto ${fi + 1}`)} />
                              ))}
                            </div>
                          )}
                          <button
                            style={dangerButton}
                            onClick={async () => {
                              if (!window.confirm("¿Eliminar esta ejecución de recuperación?")) return;
                              if (isSupabaseConfigured && rec.id) {
                                await supabase.from("ordenes_recuperacion_ejecucion").delete().eq("id", rec.id);
                              }
                              setHistorialRecuperaciones((prev) => prev.filter((r) => r.id !== rec.id));
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* STOCK TÉCNICO */}
            {recuperacionesSubmenu === "stock" && (
              <div style={{ display: "grid", gap: "20px" }}>
                {/* Stats header */}
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "10px", flex: 1, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: "12px", padding: "10px 16px", minWidth: "110px" }}>
                      <span style={{ fontSize: "22px", fontWeight: 800, color: "#d97706" }}>{stockTecnico.filter((s) => !s.ingresado_almacen).length}</span>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#92400e", lineHeight: 1.2 }}>Pendientes<br/>de ingreso</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "12px", padding: "10px 16px", minWidth: "110px" }}>
                      <span style={{ fontSize: "22px", fontWeight: 800, color: "#16a34a" }}>{stockTecnico.filter((s) => s.ingresado_almacen).length}</span>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#166534", lineHeight: 1.2 }}>Ingresados<br/>a almacén</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: "12px", padding: "10px 16px", minWidth: "110px" }}>
                      <span style={{ fontSize: "22px", fontWeight: 800, color: "#1e40af" }}>{stockTecnico.filter((s) => !s.ingresado_almacen && s.codigo_entrega).length}</span>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#1e3a5f", lineHeight: 1.2 }}>Con solicitud<br/>de entrega</span>
                    </div>
                  </div>
                  <button style={secondaryButton} onClick={cargarStockTecnico} disabled={cargandoStockTecnico}>
                    {cargandoStockTecnico ? "Cargando..." : "↻ Actualizar"}
                  </button>
                </div>

                {/* Pendientes */}
                {stockTecnico.filter((s) => !s.ingresado_almacen).length === 0 ? (
                  <div style={{ border: "1px dashed #bbf7d0", borderRadius: "14px", padding: "32px", color: "#166534", background: "#f0fdf4", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "28px" }}>✓</span>
                    <span style={{ fontWeight: 700, fontSize: "14px" }}>Todo al día</span>
                    <span style={{ fontSize: "12px", color: "#6b7280" }}>No hay equipos pendientes de ingreso a almacén.</span>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "14px" }}>
                    {(() => {
                      const conSolicitud = stockTecnico.filter((s) => !s.ingresado_almacen && s.codigo_entrega);
                      const sinSolicitud = stockTecnico.filter((s) => !s.ingresado_almacen && !s.codigo_entrega);
                      const pendientesVisibles = stockTecnico.filter((s) => !s.ingresado_almacen && (rolSesion === "Tecnico" ? s.tecnico_recupera === usuarioSesion?.nombre : true));
                      return (
                        <>
                          {/* Grupo: con solicitud */}
                          {conSolicitud.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <div style={{ flex: 1, height: "1.5px", background: "#bbf7d0" }} />
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#dcfce7", border: "1px solid #86efac", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", fontWeight: 700, color: "#15803d", whiteSpace: "nowrap" }}>
                                ✓ Listos para confirmar ({conSolicitud.length})
                              </span>
                              <div style={{ flex: 1, height: "1.5px", background: "#bbf7d0" }} />
                            </div>
                          )}
                          {sinSolicitud.length > 0 && conSolicitud.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
                              <div style={{ flex: 1, height: "1.5px", background: "#fde68a" }} />
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", fontWeight: 700, color: "#b45309", whiteSpace: "nowrap" }}>
                                ⏱ Sin solicitud aún ({sinSolicitud.length})
                              </span>
                              <div style={{ flex: 1, height: "1.5px", background: "#fde68a" }} />
                            </div>
                          )}
                          {pendientesVisibles.map((item) => {
                            const solicitado = Boolean(item.codigo_entrega);
                            const accentColor = solicitado ? "#22c55e" : "#f59e0b";
                            return (
                              <div key={item.id} style={{ borderRadius: "14px", border: `1px solid ${solicitado ? "#d1fae5" : "#fde68a"}`, background: "#fff", overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
                                {/* Accent top */}
                                <div style={{ height: "3px", background: accentColor }} />
                                <div style={{ padding: "16px" }}>
                                  {/* Header */}
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                      <span style={{ fontWeight: 800, fontSize: "15px", color: "#111827" }}>{item.tipo}</span>
                                      <span style={{ fontSize: "11px", fontWeight: 700, background: item.estado === "Bueno" ? "#dcfce7" : item.estado === "Dañado" ? "#fee2e2" : "#fef3c7", color: item.estado === "Bueno" ? "#166534" : item.estado === "Dañado" ? "#991b1b" : "#92400e", borderRadius: "999px", padding: "2px 9px" }}>{item.estado}</span>
                                      {solicitado && <span style={{ fontSize: "11px", fontWeight: 700, background: "#dbeafe", color: "#1e40af", borderRadius: "999px", padding: "2px 9px", fontFamily: "monospace" }}>{item.codigo_entrega}</span>}
                                    </div>
                                    {solicitado
                                      ? <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "#dcfce7", border: "1px solid #86efac", borderRadius: "999px", padding: "4px 12px", fontSize: "11px", fontWeight: 700, color: "#15803d", whiteSpace: "nowrap" }}>✓ Entrega solicitada</span>
                                      : <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "999px", padding: "4px 12px", fontSize: "11px", fontWeight: 700, color: "#b45309", whiteSpace: "nowrap" }}>⏳ Pendiente</span>
                                    }
                                  </div>
                                  {/* Info grid */}
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px 16px", background: "#f8fafc", borderRadius: "10px", padding: "10px 14px", marginBottom: "12px", fontSize: "12px" }}>
                                    {item.serial && <div><span style={{ color: "#9ca3af" }}>Serial: </span><span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0369a1" }}>{item.serial}</span></div>}
                                    <div><span style={{ color: "#9ca3af" }}>Cliente: </span><span style={{ fontWeight: 600, color: "#374151" }}>{item.nombre_cliente || "-"}</span></div>
                                    <div><span style={{ color: "#9ca3af" }}>Nodo: </span><span style={{ fontWeight: 600, color: "#374151" }}>{item.nodo || "-"}</span></div>
                                    <div><span style={{ color: "#9ca3af" }}>Orden: </span><span style={{ fontWeight: 600, color: "#374151" }}>{item.orden_codigo || "-"}</span></div>
                                    <div><span style={{ color: "#9ca3af" }}>Técnico: </span><span style={{ fontWeight: 600, color: "#374151" }}>{item.tecnico_recupera || "-"}</span></div>
                                    <div><span style={{ color: "#9ca3af" }}>Recogido: </span><span style={{ color: "#6b7280" }}>{item.created_at ? new Date(item.created_at).toLocaleDateString("es-PE") : "-"}</span></div>
                                    {solicitado && <div style={{ color: "#166534" }}><span style={{ color: "#9ca3af" }}>Solicitó: </span><span style={{ fontWeight: 700 }}>{item.solicitado_por || "-"}</span>{item.fecha_solicitud_entrega ? ` · ${new Date(item.fecha_solicitud_entrega).toLocaleDateString("es-PE")}` : ""}</div>}
                                  </div>
                                  {/* Fotos del equipo */}
                                  {Array.isArray(item.fotos) && item.fotos.length > 0 && (
                                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                                      {item.fotos.map((f, fi) => (
                                        <img key={fi} src={f} alt="foto" style={{ width: "72px", height: "58px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb", cursor: "pointer" }} onClick={() => abrirFotoZoom(f, `${item.tipo} foto ${fi + 1}`)} />
                                      ))}
                                    </div>
                                  )}
                                  {/* Acción */}
                                  {rolSesion === "Tecnico" ? (
                                    solicitado ? null : (
                                      <button
                                        style={{ ...primaryButton, background: "#f59e0b", borderColor: "#f59e0b" }}
                                        onClick={async () => {
                                          if (item.codigo_entrega) return; // guard anti-doble click
                                          const año = new Date().getFullYear();
                                          const seq = String(item.id).padStart(4, "0");
                                          const codigo = `ENT-${seq}-${año}`;
                                          const ahora = new Date().toISOString();
                                          const { error } = await supabase.from("stock_tecnico").update({ codigo_entrega: codigo, fecha_solicitud_entrega: ahora, solicitado_por: usuarioSesion?.nombre || "" }).eq("id", item.id).is("codigo_entrega", null);
                                          if (!error) setStockTecnico((prev) => prev.map((s) => s.id === item.id ? { ...s, codigo_entrega: codigo, fecha_solicitud_entrega: ahora, solicitado_por: usuarioSesion?.nombre || "" } : s));
                                        }}
                                      >
                                        Solicitar entrega
                                      </button>
                                    )
                                  ) : ingresandoStockId === item.id ? (
                                    <div style={{ display: "grid", gap: "10px", borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
                                      <textarea style={{ ...textareaStyle, minHeight: "60px", fontSize: "12px" }} placeholder="Observación de ingreso (opcional)" value={observacionIngreso} onChange={(e) => setObservacionIngreso(e.target.value)} />
                                      <div>
                                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "6px" }}>📷 Foto de recepción <span style={{ color: "#ef4444" }}>*requerida</span></div>
                                        <label style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                                          {fotoRecepcion ? "🔄 Cambiar foto" : "📷 Subir foto"}
                                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const valor = await uploadFotoOrBase64(file, "recepcion");
                                            setFotoRecepcion(valor);
                                          }} />
                                        </label>
                                        {fotoRecepcion && (
                                          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginLeft: "10px" }}>
                                            <img src={fotoRecepcion} style={{ width: "90px", height: "72px", objectFit: "cover", borderRadius: "8px", border: "2px solid #86efac", cursor: "pointer" }} onClick={() => abrirFotoZoom(fotoRecepcion, "Foto de recepción")} />
                                            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "18px", lineHeight: 1 }} onClick={() => setFotoRecepcion("")}>✕</button>
                                          </div>
                                        )}
                                      </div>
                                      <div style={{ display: "flex", gap: "8px" }}>
                                        <button style={{ ...primaryButton, background: "#059669", borderColor: "#059669" }} onClick={() => ingresarEquipoAlmacen(item)}>✓ Confirmar ingreso</button>
                                        <button style={secondaryButton} onClick={() => { setIngresandoStockId(null); setObservacionIngreso(""); setFotoRecepcion(""); }}>Cancelar</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button style={{ ...primaryButton, background: "#059669", borderColor: "#059669" }} onClick={() => setIngresandoStockId(item.id)}>
                                      {solicitado ? "✓ Confirmar recepción" : "Ingresar a almacén"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Ya ingresados */}
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ flex: 1, height: "1.5px", background: "#d1fae5" }} />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "20px", padding: "5px 14px", fontSize: "12px", fontWeight: 700, color: "#15803d", whiteSpace: "nowrap" }}>
                      📦 Historial de ingresados
                      <span style={{ background: "#16a34a", color: "#fff", borderRadius: "999px", padding: "1px 7px", fontSize: "11px" }}>{stockTecnico.filter((s) => s.ingresado_almacen).length}</span>
                    </span>
                    <div style={{ flex: 1, height: "1.5px", background: "#d1fae5" }} />
                  </div>
                  {stockTecnico.filter((s) => s.ingresado_almacen).length === 0 ? (
                    <div style={{ border: "1px dashed #bbf7d0", borderRadius: "12px", padding: "16px", color: "#6b7280", textAlign: "center", fontSize: "13px" }}>
                      Aún no hay equipos confirmados como ingresados.
                    </div>
                  ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {/* Filtros + PDF */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", padding: "10px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
                      <input
                        style={{ ...inputStyle, flex: "1 1 160px", fontSize: "12px", padding: "5px 10px" }}
                        placeholder="Buscar cliente, tipo, serial, orden..."
                        value={filtroHistorialBusqueda}
                        onChange={(e) => setFiltroHistorialBusqueda(e.target.value)}
                      />
                      <select style={{ ...inputStyle, fontSize: "12px", padding: "5px 8px", flex: "0 1 130px" }} value={filtroHistorialNodo} onChange={(e) => setFiltroHistorialNodo(e.target.value)}>
                        <option value="TODOS">Todos los nodos</option>
                        {[...new Set(stockTecnico.filter((s) => s.ingresado_almacen && s.nodo).map((s) => s.nodo))].sort().map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <select style={{ ...inputStyle, fontSize: "12px", padding: "5px 8px", flex: "0 1 150px" }} value={filtroHistorialCatalogado} onChange={(e) => setFiltroHistorialCatalogado(e.target.value)}>
                        <option value="TODOS">Todos</option>
                        <option value="SI">Registrado en catálogo</option>
                        <option value="NO">Pendiente catálogo</option>
                      </select>
                      <button
                        style={{ ...secondaryButton, fontSize: "12px", padding: "5px 12px", whiteSpace: "nowrap" }}
                        onClick={() => { setFiltroHistorialBusqueda(""); setFiltroHistorialNodo("TODOS"); setFiltroHistorialCatalogado("TODOS"); }}
                      >
                        Limpiar
                      </button>
                      <button
                        style={{ ...primaryButton, fontSize: "12px", padding: "5px 12px", whiteSpace: "nowrap", background: "#dc2626", borderColor: "#dc2626" }}
                        onClick={() => {
                          const ingresados = stockTecnico.filter((s) => {
                            if (!s.ingresado_almacen) return false;
                            if (filtroHistorialNodo !== "TODOS" && s.nodo !== filtroHistorialNodo) return false;
                            if (filtroHistorialCatalogado === "SI" && !s.catalogado) return false;
                            if (filtroHistorialCatalogado === "NO" && s.catalogado) return false;
                            if (filtroHistorialBusqueda) {
                              const q = filtroHistorialBusqueda.toLowerCase();
                              if (![s.tipo, s.nombre_cliente, s.serial, s.orden_codigo, s.tecnico_recupera, s.nodo].some((v) => String(v || "").toLowerCase().includes(q))) return false;
                            }
                            return true;
                          });
                          const filas = ingresados.map((s) => `
                            <tr>
                              <td>${s.tipo || "-"}</td>
                              <td>${s.estado || "-"}</td>
                              <td>${s.serial || "-"}</td>
                              <td>${s.nombre_cliente || "-"}</td>
                              <td>${s.nodo || "-"}</td>
                              <td>${s.orden_codigo || "-"}</td>
                              <td>${s.tecnico_recupera || "-"}</td>
                              <td>${s.codigo_entrega || "-"}</td>
                              <td>${s.ingresado_por || "-"}</td>
                              <td>${s.fecha_ingreso ? new Date(s.fecha_ingreso).toLocaleDateString("es-PE") : "-"}</td>
                              <td>${s.catalogado ? "Sí" : "No"}</td>
                            </tr>`).join("");
                          const html = `<html><head><meta charset="utf-8"><title>Custodia Técnica - Ingresados</title>
                          <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}h2{color:#166534;margin-bottom:4px}p{color:#6b7280;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#f0fdf4;color:#166534;padding:6px 8px;text-align:left;border:1px solid #bbf7d0;font-size:11px}td{padding:5px 8px;border:1px solid #e5e7eb;font-size:10px}tr:nth-child(even){background:#f9fafb}</style>
                          </head><body>
                          <h2>Custodia Técnica — Historial de ingresados</h2>
                          <p>Generado: ${new Date().toLocaleString("es-PE")} · Total: ${ingresados.length} registros</p>
                          <table><thead><tr><th>Tipo</th><th>Estado</th><th>Serial</th><th>Cliente</th><th>Nodo</th><th>Orden</th><th>Técnico</th><th>Cód. Entrega</th><th>Ingresado por</th><th>Fecha ingreso</th><th>En catálogo</th></tr></thead><tbody>${filas}</tbody></table>
                          </body></html>`;
                          imprimirHtmlMismaPestana(html);
                        }}
                      >
                        📄 PDF
                      </button>
                    </div>
                    {stockTecnico.filter((s) => {
                      if (!s.ingresado_almacen) return false;
                      if (filtroHistorialNodo !== "TODOS" && s.nodo !== filtroHistorialNodo) return false;
                      if (filtroHistorialCatalogado === "SI" && !s.catalogado) return false;
                      if (filtroHistorialCatalogado === "NO" && s.catalogado) return false;
                      if (filtroHistorialBusqueda) {
                        const q = filtroHistorialBusqueda.toLowerCase();
                        if (![s.tipo, s.nombre_cliente, s.serial, s.orden_codigo, s.tecnico_recupera, s.nodo].some((v) => String(v || "").toLowerCase().includes(q))) return false;
                      }
                      return true;
                    }).length === 0 && (
                      <div style={{ color: "#6b7280", textAlign: "center", fontSize: "13px", padding: "16px" }}>No hay resultados para los filtros aplicados.</div>
                    )}
                    {stockTecnico.filter((s) => {
                      if (!s.ingresado_almacen) return false;
                      if (filtroHistorialNodo !== "TODOS" && s.nodo !== filtroHistorialNodo) return false;
                      if (filtroHistorialCatalogado === "SI" && !s.catalogado) return false;
                      if (filtroHistorialCatalogado === "NO" && s.catalogado) return false;
                      if (filtroHistorialBusqueda) {
                        const q = filtroHistorialBusqueda.toLowerCase();
                        if (![s.tipo, s.nombre_cliente, s.serial, s.orden_codigo, s.tecnico_recupera, s.nodo].some((v) => String(v || "").toLowerCase().includes(q))) return false;
                      }
                      return true;
                    }).map((item) => {
                      // Fix foto bug: solo mostrar fotos con URI válido (data: o http)
                      const fotoValida = item.foto_recepcion && (item.foto_recepcion.startsWith("data:") || item.foto_recepcion.startsWith("http"));
                      return (
                      <div key={item.id} style={{ border: "1px solid #d1fae5", borderRadius: "14px", background: "#fff", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
                        <div style={{ height: "3px", background: "#22c55e" }} />
                        <div style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", alignItems: "flex-start" }}>
                            {/* Info lado izquierdo */}
                            <div style={{ display: "grid", gap: "4px", flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 800, fontSize: "14px", color: "#111827" }}>{item.tipo}</span>
                                <span style={{ fontSize: "11px", fontWeight: 700, background: item.estado === "Bueno" ? "#dcfce7" : item.estado === "Dañado" ? "#fee2e2" : "#fef3c7", color: item.estado === "Bueno" ? "#166534" : item.estado === "Dañado" ? "#991b1b" : "#92400e", borderRadius: "999px", padding: "1px 8px" }}>{item.estado}</span>
                                {item.codigo_entrega && <span style={{ fontSize: "10px", fontWeight: 700, background: "#dbeafe", color: "#1e40af", borderRadius: "999px", padding: "1px 8px", fontFamily: "monospace" }}>{item.codigo_entrega}</span>}
                                <span style={{ background: "#dcfce7", color: "#166534", borderRadius: "999px", padding: "2px 9px", fontSize: "11px", fontWeight: 700 }}>✓ Ingresado</span>
                                {item.catalogado && <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: "999px", padding: "2px 9px", fontSize: "11px", fontWeight: 700 }}>📋 En catálogo</span>}
                              </div>
                              {item.serial && <div style={{ fontSize: "12px", color: "#0369a1", fontFamily: "monospace", fontWeight: 600 }}>S/N: {item.serial}</div>}
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "3px 16px", background: "#f8fafc", borderRadius: "8px", padding: "8px 10px", fontSize: "11px", marginTop: "4px" }}>
                                <div><span style={{ color: "#9ca3af" }}>Cliente: </span><span style={{ fontWeight: 600, color: "#374151" }}>{item.nombre_cliente || "-"}</span></div>
                                <div><span style={{ color: "#9ca3af" }}>Nodo: </span><span style={{ fontWeight: 600, color: "#374151" }}>{item.nodo || "-"}</span></div>
                                <div><span style={{ color: "#9ca3af" }}>Orden: </span><span style={{ fontWeight: 600, color: "#374151" }}>{item.orden_codigo || "-"}</span></div>
                                <div><span style={{ color: "#9ca3af" }}>Técnico: </span><span style={{ fontWeight: 600, color: "#374151" }}>{item.tecnico_recupera || "-"}</span></div>
                                {item.solicitado_por && <div><span style={{ color: "#9ca3af" }}>Solicitó: </span><span style={{ color: "#0369a1" }}>{item.solicitado_por}</span></div>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f0fdf4", borderRadius: "8px", padding: "6px 10px", fontSize: "11px", marginTop: "2px" }}>
                                <span><span style={{ color: "#9ca3af" }}>Ingresado por: </span><span style={{ fontWeight: 700, color: "#166534" }}>{item.ingresado_por || "-"}</span></span>
                                <span style={{ color: "#d1d5db" }}>·</span>
                                <span style={{ color: "#6b7280" }}>{item.fecha_ingreso ? new Date(item.fecha_ingreso).toLocaleString("es-PE") : "-"}</span>
                              </div>
                              {item.observacion_ingreso && (
                                <div style={{ display: "flex", gap: "6px", background: "#fffbeb", borderRadius: "8px", padding: "6px 10px", border: "1px solid #fde68a", fontSize: "11px" }}>
                                  <span style={{ color: "#9ca3af" }}>Obs:</span>
                                  <span style={{ color: "#78350f" }}>{item.observacion_ingreso}</span>
                                </div>
                              )}
                              {item.catalogado && (
                                <div style={{ fontSize: "10px", color: "#6b7280" }}>
                                  Catálogo: <span style={{ fontWeight: 600, color: "#1d4ed8" }}>{item.estado_catalogado || "-"}</span>{item.fecha_catalogado ? ` · ${new Date(item.fecha_catalogado).toLocaleDateString("es-PE")}` : ""}
                                </div>
                              )}
                            </div>
                            {/* Foto lado derecho */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                              {fotoValida ? (
                                <div style={{ position: "relative", cursor: "pointer" }} onClick={() => abrirFotoZoom(item.foto_recepcion, "Foto de recepción")}>
                                  <img
                                    src={item.foto_recepcion}
                                    alt="Foto recepción"
                                    style={{ width: "90px", height: "72px", objectFit: "cover", borderRadius: "10px", border: "2px solid #86efac", display: "block" }}
                                    onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                                  />
                                  <div style={{ display: "none", width: "90px", height: "72px", borderRadius: "10px", border: "2px solid #fca5a5", background: "#fef2f2", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                                    <span style={{ fontSize: "18px" }}>🖼️</span>
                                    <span style={{ fontSize: "9px", color: "#ef4444", textAlign: "center" }}>No disponible</span>
                                  </div>
                                  <div style={{ position: "absolute", bottom: "4px", right: "4px", background: "rgba(0,0,0,0.45)", borderRadius: "4px", padding: "2px 4px", fontSize: "9px", color: "#fff" }}>🔍</div>
                                </div>
                              ) : item.foto_recepcion ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                                  <div style={{ width: "90px", height: "72px", borderRadius: "10px", border: "2px solid #fca5a5", background: "#fef2f2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }} title="Foto guardada desde móvil — URI local no disponible en web">
                                    <span style={{ fontSize: "20px" }}>📷</span>
                                    <span style={{ fontSize: "9px", color: "#ef4444", textAlign: "center", padding: "0 4px" }}>Foto desde móvil</span>
                                  </div>
                                  <label style={{ cursor: "pointer", fontSize: "10px", color: "#1d4ed8", fontWeight: 600, display: "flex", alignItems: "center", gap: "3px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "3px 7px" }}
                                    title="Reemplazar con una foto desde este equipo">
                                    🔄 Reemplazar
                                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const nuevaFoto = await uploadFotoOrBase64(file, "recepcion");
                                      if (!isSupabaseConfigured) return;
                                      await supabase.from("stock_tecnico").update({ foto_recepcion: nuevaFoto }).eq("id", item.id);
                                      setStockTecnico((prev) => prev.map((s) => s.id === item.id ? { ...s, foto_recepcion: nuevaFoto } : s));
                                    }} />
                                  </label>
                                </div>
                              ) : rolSesion !== "Tecnico" ? (
                                <label style={{ cursor: "pointer", fontSize: "10px", color: "#6b7280", fontWeight: 600, display: "flex", alignItems: "center", gap: "3px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "3px 7px" }}
                                  title="Agregar foto de recepción">
                                  📷 Agregar foto
                                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const nuevaFoto = await uploadFotoOrBase64(file, "recepcion");
                                    if (!isSupabaseConfigured) return;
                                    await supabase.from("stock_tecnico").update({ foto_recepcion: nuevaFoto }).eq("id", item.id);
                                    setStockTecnico((prev) => prev.map((s) => s.id === item.id ? { ...s, foto_recepcion: nuevaFoto } : s));
                                  }} />
                                </label>
                              ) : null}
                            {item.serial && rolSesion !== "Tecnico" && (
                              liberandoCatalogoId === item.id ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "170px" }}>
                                  <select
                                    style={{ ...inputStyle, fontSize: "12px", padding: "4px 8px" }}
                                    value={liberandoCatalogoEstado}
                                    onChange={(e) => setLiberandoCatalogoEstado(e.target.value)}
                                  >
                                    <option value="disponible">Disponible</option>
                                    <option value="averiado">Averiado</option>
                                    <option value="obsoleto">Obsoleto</option>
                                    <option value="baja">Baja</option>
                                  </select>
                                  <div style={{ display: "flex", gap: "4px" }}>
                                    <button
                                      style={{ ...primaryButton, fontSize: "11px", padding: "3px 10px", background: "#6366f1", borderColor: "#6366f1", flex: 1 }}
                                      onClick={async () => {
                                        const serial = item.serial.trim();
                                        const { data: encontrados } = await supabase
                                          .from("equipos_catalogo")
                                          .select("id, estado")
                                          .or(`codigo_qr.eq.${serial},serial_mac.eq.${serial}`)
                                          .limit(1);
                                        if (!encontrados || encontrados.length === 0) {
                                          alert(`No se encontró el equipo S/N "${serial}" en el catálogo.`);
                                          setLiberandoCatalogoId(null);
                                          return;
                                        }
                                        const { error } = await supabase
                                          .from("equipos_catalogo")
                                          .update({
                                            estado: liberandoCatalogoEstado,
                                            tecnico_asignado: null,
                                            cliente_dni: null,
                                            cliente_nombre: null,
                                          })
                                          .eq("id", encontrados[0].id);
                                        if (error) { alert("Error: " + error.message); return; }
                                        const ahora = new Date().toISOString();
                                        await supabase.from("stock_tecnico").update({ catalogado: true, estado_catalogado: liberandoCatalogoEstado, fecha_catalogado: ahora }).eq("id", item.id);
                                        setStockTecnico((prev) => prev.map((s) => s.id === item.id ? { ...s, catalogado: true, estado_catalogado: liberandoCatalogoEstado, fecha_catalogado: ahora } : s));
                                        alert(`✓ Equipo "${serial}" actualizado a "${liberandoCatalogoEstado}" en el catálogo.`);
                                        setLiberandoCatalogoId(null);
                                        setLiberandoCatalogoEstado("disponible");
                                      }}
                                    >
                                      Confirmar
                                    </button>
                                    <button style={{ ...secondaryButton, fontSize: "11px", padding: "3px 8px" }} onClick={() => { setLiberandoCatalogoId(null); setLiberandoCatalogoEstado("disponible"); }}>✕</button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  style={{ ...secondaryButton, fontSize: "11px", padding: "4px 10px", borderColor: "#6366f1", color: "#6366f1" }}
                                  onClick={() => { setLiberandoCatalogoId(item.id); setLiberandoCatalogoEstado("disponible"); }}
                                >
                                  Actualizar catálogo
                                </button>
                              )
                            )}
                            {!item.serial && rolSesion !== "Tecnico" && (
                              vinculandoSerialId === item.id ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "180px" }}>
                                  <div style={{ fontSize: "11px", color: "#374151" }}>
                                    Ingresa o escanea el serial/QR asignado en Inventario:
                                  </div>
                                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                                    <input
                                      style={{ ...inputStyle, fontSize: "12px", padding: "4px 8px", flex: 1 }}
                                      placeholder="Serial o Código QR"
                                      value={vinculandoSerialValor}
                                      onChange={(e) => setVinculandoSerialValor(e.target.value)}
                                      autoFocus
                                    />
                                    <button
                                      style={{ ...secondaryButton, fontSize: "11px", padding: "4px 8px", borderColor: "#6366f1", color: "#6366f1" }}
                                      title="Escanear QR"
                                      onClick={() => setScannerRecojoIdx("vincular_" + item.id)}
                                    >📷</button>
                                  </div>
                                  {scannerRecojoIdx === "vincular_" + item.id && (
                                    <div style={{ marginTop: "4px" }}>
                                      <QRScanner
                                        onResult={(code) => { setVinculandoSerialValor(code); setScannerRecojoIdx(null); }}
                                        onClose={() => setScannerRecojoIdx(null)}
                                      />
                                    </div>
                                  )}
                                  <div style={{ display: "flex", gap: "4px" }}>
                                    <button
                                      style={{ ...primaryButton, fontSize: "11px", padding: "3px 10px", background: "#0891b2", borderColor: "#0891b2", flex: 1 }}
                                      onClick={async () => {
                                        const val = vinculandoSerialValor.trim();
                                        if (!val) return;
                                        // Buscar en catálogo para marcar catalogado en el mismo paso
                                        const { data: enCatalogo } = await supabase
                                          .from("equipos_catalogo")
                                          .select("estado")
                                          .or(`codigo_qr.eq.${val},serial_mac.eq.${val}`)
                                          .neq("estado", "liquidado")
                                          .maybeSingle();
                                        const ahora = new Date().toISOString();
                                        const updateData = enCatalogo
                                          ? { serial: val, catalogado: true, estado_catalogado: enCatalogo.estado, fecha_catalogado: ahora }
                                          : { serial: val };
                                        const { error } = await supabase.from("stock_tecnico").update(updateData).eq("id", item.id);
                                        if (error) { alert("Error: " + error.message); return; }
                                        setStockTecnico((prev) => prev.map((s) => s.id === item.id ? { ...s, ...updateData } : s));
                                        setVinculandoSerialId(null);
                                        setVinculandoSerialValor("");
                                        if (enCatalogo) alert(`✓ Serial vinculado y marcado en catálogo como "${enCatalogo.estado}".`);
                                      }}
                                    >
                                      Vincular
                                    </button>
                                    <button style={{ ...secondaryButton, fontSize: "11px", padding: "3px 8px" }} onClick={() => { setVinculandoSerialId(null); setVinculandoSerialValor(""); setScannerRecojoIdx(null); }}>✕</button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  <button
                                    style={{ ...secondaryButton, fontSize: "11px", padding: "4px 10px", borderColor: "#0891b2", color: "#0891b2" }}
                                    onClick={() => setVistaActiva("inventario")}
                                  >
                                    Ir a Inventario →
                                  </button>
                                  <button
                                    style={{ ...secondaryButton, fontSize: "11px", padding: "4px 10px", borderColor: "#6b7280", color: "#6b7280" }}
                                    onClick={() => { setVinculandoSerialId(item.id); setVinculandoSerialValor(""); }}
                                  >
                                    Vincular serial registrado
                                  </button>
                                </div>
                              )
                            )}
                            {rolSesion === "Administrador" && (
                              <button
                                style={{ ...dangerButton, fontSize: "11px", padding: "3px 8px" }}
                                onClick={async () => {
                                  if (!window.confirm("¿Eliminar este registro del historial?")) return;
                                  await supabase.from("stock_tecnico").delete().eq("id", item.id);
                                  setStockTecnico((prev) => prev.filter((s) => s.id !== item.id));
                                }}
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                    })}
                  </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {vistaActiva === "detalleLiquidacion" && liquidacionSeleccionada && (
          <div style={{ display: "grid", gap: "24px" }}>
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Detalle de liquidación</h2>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {puedeEditarLiquidacion ? (
                    <button onClick={() => void abrirEditarLiquidacionHistorial(liquidacionSeleccionada)} style={warningButton}>
                      Editar
                    </button>
                  ) : null}
                  <button onClick={() => setVistaActiva("historial")} style={secondaryButton}>
                    Volver
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "14px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {(() => {
                  const faltantesOrden = [
                    { k: "plan", v: liquidacionSeleccionada.velocidad },
                    { k: "precio", v: liquidacionSeleccionada.precioPlan },
                    { k: "nodo", v: liquidacionSeleccionada.nodo },
                    { k: "usuario", v: liquidacionSeleccionada.usuarioNodo },
                    { k: "password", v: liquidacionSeleccionada.passwordUsuario },
                    { k: "ubicacion", v: liquidacionSeleccionada.ubicacion },
                  ].filter((x) => !String(x.v ?? "").trim());
                  const relacionOk = Boolean(liquidacionSeleccionada?.ordenOriginalId) || Boolean(String(liquidacionSeleccionada?.codigo || "").trim());
                  const tone = !relacionOk ? "error" : faltantesOrden.length > 0 ? "warn" : "ok";
                  const styleByTone = {
                    ok: { bg: "#dcfce7", color: "#166534", border: "#86efac", text: "Integridad: OK" },
                    warn: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d", text: `Integridad parcial (${faltantesOrden.length} campos orden)` },
                    error: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", text: "Sin relación de orden" },
                  };
                  const theme = styleByTone[tone];
                  return (
                    <>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: "999px",
                          padding: "7px 11px",
                          border: `1px solid ${theme.border}`,
                          background: theme.bg,
                          color: theme.color,
                          fontWeight: 700,
                          fontSize: "12px",
                        }}
                      >
                        {theme.text}
                      </span>
                      {faltantesOrden.length > 0 ? (
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          Faltan: {faltantesOrden.map((x) => x.k).join(", ")}
                        </span>
                      ) : null}
                    </>
                  );
                })()}
              </div>

              <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { key: "orden", label: "Orden" },
                  { key: "liquidacion", label: "Liquidación" },
                  { key: "materiales", label: "Materiales" },
                  { key: "equipos", label: "Equipos" },
                  { key: "fotos", label: "Fotos" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setDetalleLiquidacionTab(tab.key)}
                    style={detalleLiquidacionTab === tab.key ? primaryButton : secondaryButton}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {detalleLiquidacionTab === "orden" ? (
                <div style={{ display: "grid", gap: "8px", marginTop: "16px" }}>
                  <div><strong>Código:</strong> {liquidacionSeleccionada.codigo}</div>
                  <div><strong>Cliente:</strong> {liquidacionSeleccionada.nombre}</div>
                  <div><strong>DNI:</strong> {liquidacionSeleccionada.dni}</div>
                  <div><strong>Dirección:</strong> {liquidacionSeleccionada.direccion}</div>
                  <div><strong>Celular:</strong> {liquidacionSeleccionada.celular || "-"}</div>
                  <div><strong>Tipo de actuación:</strong> {liquidacionSeleccionada.tipoActuacion || "-"}</div>
                  <div><strong>Plan:</strong> {liquidacionSeleccionada.velocidad || "-"}</div>
                  <div><strong>Precio:</strong> {liquidacionSeleccionada.precioPlan || "-"}</div>
                  <div><strong>Nodo:</strong> {liquidacionSeleccionada.nodo || "-"}</div>
                  <div><strong>Usuario:</strong> {liquidacionSeleccionada.usuarioNodo || "-"}</div>
                  <div><strong>Contraseña:</strong> {liquidacionSeleccionada.passwordUsuario || "-"}</div>
                  <div><strong>Ubicación:</strong> {liquidacionSeleccionada.ubicacion || "-"}</div>
                  <div><strong>Técnico asignado:</strong> {liquidacionSeleccionada.tecnico || "-"}</div>
                  <div><strong>Autor de la orden:</strong> {liquidacionSeleccionada.autorOrden || "-"}</div>
                </div>
              ) : null}

              {detalleLiquidacionTab === "liquidacion" ? (
                <div style={{ display: "grid", gap: "8px", marginTop: "16px" }}>
                  <div><strong>Técnico que liquida:</strong> {liquidacionSeleccionada.liquidacion?.tecnicoLiquida || "-"}</div>
                  <div><strong>Código etiqueta:</strong> {liquidacionSeleccionada.liquidacion?.codigoEtiqueta || "-"}</div>
                  <div><strong>Resultado final:</strong> {liquidacionSeleccionada.liquidacion?.resultadoFinal || "-"}</div>
                  <div><strong>Observación final:</strong> {liquidacionSeleccionada.liquidacion?.observacionFinal || "-"}</div>
                  <div><strong>Cobro realizado:</strong> {liquidacionSeleccionada.liquidacion?.cobroRealizado || "-"}</div>
                  <div><strong>Monto cobrado:</strong> {liquidacionSeleccionada.liquidacion?.montoCobrado || "-"}</div>
                  <div><strong>Medio de pago:</strong> {liquidacionSeleccionada.liquidacion?.medioPago || "-"}</div>
                  <div><strong>Fecha liquidación:</strong> {liquidacionSeleccionada.fechaLiquidacion}</div>
                </div>
              ) : null}

              {detalleLiquidacionTab === "equipos" ? (
                <>
                  <h2 style={{ ...sectionTitleStyle, marginTop: "16px" }}>Equipos con código</h2>
                  {(liquidacionSeleccionada.liquidacion?.equipos || []).length === 0 ? (
                    <p>No hay equipos registrados.</p>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {liquidacionSeleccionada.liquidacion.equipos.map((eq, idx) => (
                        <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
                          <div><strong>Tipo:</strong> {eq.tipo}</div>
                          <div><strong>Código:</strong> {eq.codigo || "-"}</div>
                          <div><strong>Serial / Identificador:</strong> {eq.serial || "-"}</div>
                          <div><strong>Marca / Modelo:</strong> {eq.marca || "-"} {eq.modelo || ""}</div>
                          <div><strong>Acción:</strong> {eq.accion}</div>
                          <div style={{ marginTop: "8px" }}>
                            <strong>Foto serial/equipo:</strong>{" "}
                            {String(eq?.fotoReferencia || "").trim() ? "Cargada" : "FALTA FOTO"}
                          </div>
                          {String(eq?.fotoReferencia || "").trim() ? (
                            <button
                              type="button"
                              onClick={() =>
                                abrirFotoZoom(
                                  normalizeClienteSheetPhotoUrl(eq.fotoReferencia),
                                  `Equipo ${eq.codigo || idx + 1}`
                                )
                              }
                              style={{
                                marginTop: "8px",
                                background: "transparent",
                                border: "none",
                                padding: 0,
                                cursor: "zoom-in",
                              }}
                            >
                              <img
                                src={normalizeClienteSheetPhotoUrl(eq.fotoReferencia)}
                                alt={`equipo-foto-${idx}`}
                                style={{
                                  width: "120px",
                                  height: "90px",
                                  objectFit: "cover",
                                  borderRadius: "10px",
                                  border: "1px solid #e5e7eb",
                                }}
                              />
                            </button>
                          ) : (
                            <div style={{ marginTop: "6px", color: "#b45309", fontSize: "12px", fontWeight: 700 }}>
                              Este equipo no tiene foto cargada.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}

              {detalleLiquidacionTab === "materiales" ? (
                <>
                  <h2 style={{ ...sectionTitleStyle, marginTop: "16px" }}>Materiales consumidos</h2>
                  {(liquidacionSeleccionada.liquidacion?.materiales || []).length === 0 ? (
                    <p>No hay materiales registrados.</p>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {liquidacionSeleccionada.liquidacion.materiales.map((mat, idx) => (
                        <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px" }}>
                          <div><strong>Material:</strong> {mat.material || "-"}</div>
                          <div><strong>Cantidad:</strong> {mat.cantidad || "0"}</div>
                          <div><strong>Unidad:</strong> {mat.unidad}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}

              {detalleLiquidacionTab === "fotos" ? (
                <>
                  <h2 style={{ ...sectionTitleStyle, marginTop: "16px" }}>Fotos</h2>
                  {(liquidacionSeleccionada.liquidacion?.fotos || []).length === 0 ? (
                    <p>No hay fotos registradas.</p>
                  ) : (
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      {liquidacionSeleccionada.liquidacion.fotos.map((foto, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => abrirFotoZoom(foto, `Liquidación ${liquidacionSeleccionada.codigo || ""} · Foto ${idx + 1}`)}
                          style={{ border: "none", padding: 0, background: "transparent", cursor: "zoom-in" }}
                        >
                          <img
                            src={foto}
                            alt={`liq-${idx}`}
                            style={{
                              width: "200px",
                              maxWidth: "100%",
                              borderRadius: "14px",
                              border: "1px solid #e5e7eb",
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}

        {vistaActiva === "historialAppsheet" && historialColsModalOpen ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.45)",
              zIndex: 1250,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "20px",
            }}
            onClick={() => setHistorialColsModalOpen(false)}
          >
            <div
              style={{
                width: "min(640px, 96vw)",
                maxHeight: "86vh",
                overflow: "auto",
                background: "#fff",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                padding: "16px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "22px", color: "#0f172a" }}>Columnas disponibles</h4>
                <button type="button" style={secondaryButton} onClick={() => setHistorialColsModalOpen(false)}>
                  Cerrar
                </button>
              </div>
              <p style={{ marginTop: "8px", color: "#475569", fontSize: "13px" }}>
                Activa o desactiva columnas para la vista y para imprimir.
              </p>
              <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                {historialColumnDefs.map((col) => (
                  <label
                    key={`col-opt-${col.key}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      padding: "8px 10px",
                    }}
                  >
                    <span style={{ color: "#0f172a", fontWeight: 600 }}>{col.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(historialColumnasVisibles[col.key])}
                      onChange={(e) =>
                        setHistorialColumnasVisibles((prev) => ({
                          ...prev,
                          [col.key]: e.target.checked,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={() =>
                    setHistorialColumnasVisibles((prev) => {
                      const next = { ...prev };
                      Object.keys(next).forEach((k) => {
                        next[k] = true;
                      });
                      return next;
                    })
                  }
                >
                  Mostrar todas
                </button>
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={() => setHistorialColsModalOpen(false)}
                >
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {vistaActiva === "historialAppsheet" && historialAppsheetDetalle ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.45)",
              zIndex: 1200,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "20px",
            }}
            onClick={() => setHistorialAppsheetDetalle(null)}
          >
            <div
              style={{
                width: "min(980px, 96vw)",
                maxHeight: "88vh",
                overflow: "auto",
                background: "#fff",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                padding: "16px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <h4 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>
                  Detalle equipo: {historialAppsheetDetalle.id_onu || "-"}
                </h4>
                <button type="button" style={secondaryButton} onClick={() => setHistorialAppsheetDetalle(null)}>
                  Cerrar detalle
                </button>
              </div>
              <div style={{ marginTop: "12px", display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                <div><strong>Producto:</strong> {historialAppsheetDetalle.producto || historialAppsheetDetalle.producto_codigo || "-"}</div>
                <div><strong>Codigo producto:</strong> {historialAppsheetDetalle.producto_codigo || "-"}</div>
                <div><strong>Info:</strong> {historialAppsheetDetalle.info_producto || "-"}</div>
                <div><strong>Marca:</strong> {historialAppsheetDetalle.marca || "-"}</div>
                <div><strong>Modelo:</strong> {historialAppsheetDetalle.modelo || "-"}</div>
                <div>
                  <strong>Precio unitario:</strong>{" "}
                  {Number.isFinite(Number(historialAppsheetDetalle.precio_unitario)) && Number(historialAppsheetDetalle.precio_unitario) > 0
                    ? `S/ ${Number(historialAppsheetDetalle.precio_unitario).toFixed(2)}`
                    : "-"}
                </div>
                <div><strong>Estado:</strong> {estadoAppsheetNormalizado(historialAppsheetDetalle.estado)}</div>
                <div><strong>Tecnico asignado:</strong> {resolverNombreDesdeCodigoTecnico(historialAppsheetDetalle.tecnico_asignado_codigo) || "-"}</div>
                <div><strong>Usuario PPPoE:</strong> {historialAppsheetDetalle.usuario_pppoe || "-"}</div>
                <div><strong>Nodo:</strong> {historialAppsheetDetalle.nodo || "-"}</div>
                <div><strong>Cliente:</strong> {historialAppsheetDetalle.nombre_cliente || "-"}</div>
                <div><strong>DNI:</strong> {historialAppsheetDetalle.dni || "-"}</div>
                <div><strong>Liquidado por:</strong> {resolverNombreDesdeCodigoTecnico(historialAppsheetDetalle.liquidado_por_codigo) || "-"}</div>
                <div><strong>Fecha registro:</strong> {formatFechaFlexible(historialAppsheetDetalle.fecha_registro)}</div>
                <div><strong>Fecha liquidacion:</strong> {formatFechaFlexible(historialAppsheetDetalle.fecha_liquidacion)}</div>
                <div><strong>Fecha asignacion:</strong> {formatFechaFlexible(historialAppsheetDetalle.fecha_asignacion)}</div>
                <div><strong>Empresa:</strong> {historialAppsheetDetalle.empresa || "-"}</div>
              </div>
              <div style={{ marginTop: "12px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "#475569", marginBottom: "6px" }}>Foto etiqueta</div>
                  {historialAppsheetDetalle.foto_etiqueta_url ? (
                    <button
                      type="button"
                      onClick={() => abrirFotoZoom(historialAppsheetDetalle.foto_etiqueta_url, "Foto etiqueta")}
                      style={{ border: "none", padding: 0, background: "transparent", cursor: "zoom-in" }}
                    >
                      <img
                        src={historialAppsheetDetalle.foto_etiqueta_url}
                        alt="foto-etiqueta-det"
                        style={{ width: "110px", height: "110px", objectFit: "cover", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                      />
                    </button>
                  ) : (
                    <span>-</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "#475569", marginBottom: "6px" }}>Foto producto</div>
                  {historialAppsheetDetalle.foto_producto_url ? (
                    <button
                      type="button"
                      onClick={() => abrirFotoZoom(historialAppsheetDetalle.foto_producto_url, "Foto producto")}
                      style={{ border: "none", padding: 0, background: "transparent", cursor: "zoom-in" }}
                    >
                      <img
                        src={historialAppsheetDetalle.foto_producto_url}
                        alt="foto-producto-det"
                        style={{ width: "110px", height: "110px", objectFit: "cover", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                      />
                    </button>
                  ) : (
                    <span>-</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "#475569", marginBottom: "6px" }}>Foto02</div>
                  {historialAppsheetDetalle.foto02_url ? (
                    <button
                      type="button"
                      onClick={() => abrirFotoZoom(historialAppsheetDetalle.foto02_url, "Foto02")}
                      style={{ border: "none", padding: 0, background: "transparent", cursor: "zoom-in" }}
                    >
                      <img
                        src={historialAppsheetDetalle.foto02_url}
                        alt="foto02-det"
                        style={{ width: "110px", height: "110px", objectFit: "cover", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                      />
                    </button>
                  ) : (
                    <span>-</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {vistaActiva === "historialAppsheet" && historialAppsheetSubmenu === "ordenesBaseData" && baseDataOrdenDetalle ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 72,
              background: "rgba(2, 6, 23, 0.65)",
              display: "grid",
              placeItems: "center",
              padding: "18px",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setBaseDataOrdenDetalle(null);
            }}
          >
            <div
              style={{
                width: "min(1120px, 100%)",
                maxHeight: "90vh",
                overflow: "auto",
                borderRadius: "14px",
                border: "1px solid #dbe6f5",
                background: "#f8fbff",
                padding: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, color: "#123f6b" }}>Detalle: {baseDataOrdenDetalleTitulo}</h4>
                <button type="button" style={secondaryButton} onClick={() => setBaseDataOrdenDetalle(null)}>
                  Cerrar
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "8px" }}>
                {baseDataOrdenDetalleDestacados.map((item) => (
                  <div key={`ord-det-${item.label}`}>
                    <strong>{item.label}:</strong> {item.value || "-"}
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: "14px",
                  borderRadius: "12px",
                  border: "1px solid #dce6f3",
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    background: "#f5f9ff",
                    borderBottom: "1px solid #dce6f3",
                    fontWeight: 700,
                    color: "#18457b",
                  }}
                >
                  Datos completos de la orden
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                    gap: "10px",
                    padding: "14px",
                  }}
                >
                  {baseDataOrdenDetalleAdicionales.length ? (
                    baseDataOrdenDetalleAdicionales.map((item) => (
                      <div
                        key={`ord-extra-${item.label}`}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "10px 12px",
                          background: "#f8fafc",
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#475569", marginBottom: "4px", fontWeight: 700 }}>{item.label}</div>
                        {item.photoUrl ? (
                          <button
                            type="button"
                            onClick={() => abrirFotoZoom(item.photoUrl, item.label)}
                            style={{
                              border: "1px solid #dbe6f5",
                              borderRadius: "12px",
                              background: "#fff",
                              padding: "6px",
                              cursor: "pointer",
                              width: "100%",
                              textAlign: "left",
                            }}
                            title={item.value}
                          >
                            <img
                              src={item.photoUrl}
                              alt={item.label}
                              style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "10px" }}
                            />
                            <div style={{ marginTop: "6px", fontSize: "12px", color: "#2563eb", fontWeight: 700 }}>Ver foto</div>
                          </button>
                        ) : (
                          <div style={{ color: "#0f172a", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.value}</div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#64748b" }}>No hay más columnas con contenido para esta orden.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {vistaActiva === "historialAppsheet" && historialAppsheetSubmenu === "ordenesBaseData" && baseDataColsModalOpen ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.45)",
              zIndex: 1250,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "20px",
            }}
            onClick={() => setBaseDataColsModalOpen(false)}
          >
            <div
              style={{
                width: "min(640px, 96vw)",
                maxHeight: "86vh",
                overflow: "auto",
                background: "#fff",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                padding: "16px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "22px", color: "#0f172a" }}>Columnas órdenes</h4>
                <button type="button" style={secondaryButton} onClick={() => setBaseDataColsModalOpen(false)}>
                  Cerrar
                </button>
              </div>
              <p style={{ marginTop: "8px", color: "#475569", fontSize: "13px" }}>
                Selecciona qué columnas mostrar y qué columnas imprimir en PDF.
              </p>
              <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                {baseDataOrdenesColumnas.map((col) => (
                  <label
                    key={`ord-col-opt-${col}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      padding: "8px 10px",
                    }}
                  >
                    <span style={{ color: "#0f172a", fontWeight: 600 }}>{col}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(baseDataColumnasVisibles[col])}
                      onChange={(e) =>
                        setBaseDataColumnasVisibles((prev) => ({
                          ...prev,
                          [col]: e.target.checked,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={() =>
                    setBaseDataColumnasVisibles((prev) => {
                      const next = { ...prev };
                      baseDataOrdenesColumnas.forEach((k) => {
                        next[k] = true;
                      });
                      return next;
                    })
                  }
                >
                  Mostrar todas
                </button>
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={() =>
                    setBaseDataColumnasVisibles((prev) => {
                      const next = { ...prev };
                      baseDataOrdenesColumnas.forEach((k) => {
                        next[k] = false;
                      });
                      return next;
                    })
                  }
                >
                  Ocultar todas
                </button>
                <button type="button" style={secondaryButton} onClick={() => setBaseDataColsModalOpen(false)}>
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {ordenDetalle && (
          <div
            onClick={() => { setOrdenDetalle(null); setFotosOrdenDetalle([]); }}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 9990, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: "18px", padding: "28px", maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#1e3a5f", margin: 0 }}>Detalle de orden</h2>
                <button onClick={() => { setOrdenDetalle(null); setFotosOrdenDetalle([]); }} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
              </div>
              <div style={{ display: "grid", gap: "10px", fontSize: "14px" }}>
                {[
                  ["Código", ordenDetalle.codigo],
                  ["Tipo de orden", ordenDetalle.orden],
                  ["Tipo de actuación", ordenDetalle.tipoActuacion],
                  ["Estado", ordenDetalle.estado],
                  ["Prioridad", ordenDetalle.prioridad],
                  ["DNI", ordenDetalle.dni],
                  ["Nombre", ordenDetalle.nombre],
                  ["Dirección", ordenDetalle.direccion],
                  ["Celular", ordenDetalle.celular],
                  ["Email", ordenDetalle.email],
                  ["Nodo", ordenDetalle.nodo],
                  ["Técnico", ordenDetalle.tecnico],
                  ["Velocidad / Plan", `${ordenDetalle.velocidad || "-"} / S/ ${ordenDetalle.precioPlan || "-"}`],
                  ["Usuario nodo", ordenDetalle.usuarioNodo],
                  ["SN ONU", ordenDetalle.snOnu],
                  ["Autor de la orden", ordenDetalle.autorOrden],
                  ["Solicitar pago", ordenDetalle.solicitarPago],
                  ["Monto a cobrar", ordenDetalle.montoCobrar],
                  ["Descripción", ordenDetalle.descripcion],
                  ["Fecha creación", ordenDetalle.fechaCreacion],
                ].map(([label, val]) =>
                  val ? (
                    <div key={label} style={{ display: "flex", gap: "8px", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                      <span style={{ fontWeight: 600, color: "#374151", minWidth: "150px" }}>{label}:</span>
                      <span style={{ color: "#1e293b" }}>{val}</span>
                    </div>
                  ) : null
                )}
              </div>
              {fotosOrdenDetalle.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <p style={{ fontWeight: 600, color: "#374151", marginBottom: "8px", fontSize: "14px" }}>Fotos del cliente ({fotosOrdenDetalle.length})</p>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {fotosOrdenDetalle.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`foto-${i}`}
                        style={{ width: "120px", height: "100px", objectFit: "cover", borderRadius: "10px", border: "1px solid #e2e8f0", cursor: "pointer" }}
                        onClick={() => abrirFotoZoom(url, `Foto cliente ${i + 1}`)}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: "20px" }}>
                <button onClick={() => { setOrdenDetalle(null); setFotosOrdenDetalle([]); }} style={secondaryButton}>Cerrar</button>
              </div>
            </div>
          </div>
        )}

        {fotoZoomSrc ? (
          <div
            onClick={cerrarFotoZoom}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.82)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(96vw, 1200px)",
                maxHeight: "92vh",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "12px",
                padding: "10px",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ color: "#e2e8f0", fontWeight: 700 }}>{fotoZoomTitulo || "Foto"}</div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={() => setFotoZoomEscala((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))))} style={secondaryButton}>-</button>
                  <button onClick={() => setFotoZoomEscala(1)} style={secondaryButton}>100%</button>
                  <button onClick={() => setFotoZoomEscala((s) => Math.min(4, Number((s + 0.25).toFixed(2))))} style={primaryButton}>+</button>
                  <button onClick={cerrarFotoZoom} style={dangerButton}>Cerrar</button>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  overflow: "auto",
                  background: "#020617",
                  padding: "10px",
                  maxHeight: "74vh",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <img
                  src={fotoZoomSrc}
                  alt="zoom-cliente"
                  style={{
                    transform: `scale(${fotoZoomEscala})`,
                    transformOrigin: "center top",
                    maxWidth: "100%",
                    height: "auto",
                    borderRadius: "10px",
                    border: "1px solid #1e293b",
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
      </main>
    </div>
  );
}

function parseJsonArrayFlexible(rawValue) {
  if (Array.isArray(rawValue)) return rawValue;
  const raw = String(rawValue || "").trim();
  if (!raw) return [];
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return raw
    .split(",")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function normalizarAccesosMenuWeb(rawAccesos, rol) {
  const rolNorm = normalizarRolSimple(rol);
  const defaults = PERMISOS_MENU_POR_ROL_WEB[rolNorm] || PERMISOS_MENU_POR_ROL_WEB.Tecnico;
  const validKeys = new Set(MENU_VISTAS_WEB.map((x) => x.key));
  const garantizados = new Set((MENU_ITEMS_GARANTIZADOS_POR_ROL[rolNorm] || []).filter((k) => validKeys.has(k)));
  const parsed = parseJsonArrayFlexible(rawAccesos)
    .map((x) => String(x || "").trim())
    .filter((x) => validKeys.has(x));
  if (!parsed.length) return [...defaults];
  // parsed contiene lo que el admin configuró; garantizados son items que nunca pueden faltar
  const merged = new Set([...parsed, ...garantizados]);
  return MENU_VISTAS_WEB.map((item) => item.key).filter((k) => merged.has(k));
}

function getAccesosHistorialAppsheetPorRolWeb(rol) {
  const rolNorm = normalizarRolSimple(rol);
  return HISTORIAL_APPSHEET_SUBMENU_ITEMS.filter((item) => (rolNorm === "Gestora" ? item.gestoraVisible : true)).map((item) => item.key);
}

function normalizarAccesosHistorialAppsheetWeb(rawAccesos, rol) {
  const defaults = getAccesosHistorialAppsheetPorRolWeb(rol);
  const validKeys = new Set(HISTORIAL_APPSHEET_SUBMENU_ACCESS_KEYS);
  const validPlainKeys = new Set(HISTORIAL_APPSHEET_SUBMENU_ITEMS.map((item) => item.key));
  if (Array.isArray(rawAccesos) && rawAccesos.length === 0) return [];
  if (parseJsonArrayFlexible(rawAccesos).some((x) => String(x || "").trim() === HISTORIAL_APPSHEET_SUBMENU_NONE_KEY)) return [];
  const parsed = parseJsonArrayFlexible(rawAccesos)
    .map((x) => String(x || "").trim())
    .map((x) => {
      if (validKeys.has(x)) return x.slice(HISTORIAL_APPSHEET_SUBMENU_ACCESS_PREFIX.length);
      if (validPlainKeys.has(x)) return x;
      return "";
    })
    .filter(Boolean);
  if (!parsed.length) return [...defaults];
  const setParsed = new Set(parsed);
  return HISTORIAL_APPSHEET_SUBMENU_ITEMS.map((item) => item.key).filter((k) => setParsed.has(k));
}

function getAccesosDiagnosticoServicioPorRolWeb(rol, rawAccesosMenu = null) {
  const accesosMenu = normalizarAccesosMenuWeb(
    rawAccesosMenu === null ? undefined : rawAccesosMenu,
    rol
  );
  if (!accesosMenu.includes("diagnosticoServicio")) return [];
  return DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS.map((item) => item.key);
}

function normalizarAccesosDiagnosticoServicioWeb(rawAccesos, rol, rawAccesosMenu = null) {
  const defaults = getAccesosDiagnosticoServicioPorRolWeb(rol, rawAccesosMenu);
  if (!defaults.length) return [];
  const validKeys = new Set(DIAGNOSTICO_SERVICIO_PERMISOS_ACCESS_KEYS);
  const validPlainKeys = new Set(DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS.map((item) => item.key));
  if (Array.isArray(rawAccesos) && rawAccesos.length === 0) return [];
  if (parseJsonArrayFlexible(rawAccesos).some((x) => String(x || "").trim() === DIAGNOSTICO_SERVICIO_PERMISOS_NONE_KEY)) {
    return [];
  }
  const parsed = parseJsonArrayFlexible(rawAccesos)
    .map((x) => String(x || "").trim())
    .map((x) => {
      if (validKeys.has(x)) return x.slice(DIAGNOSTICO_SERVICIO_PERMISOS_PREFIX.length);
      if (validPlainKeys.has(x)) return x;
      return "";
    })
    .filter(Boolean);
  if (!parsed.length) return [...defaults];
  const setParsed = new Set(parsed);
  return DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS.map((item) => item.key).filter((k) => setParsed.has(k));
}

function normalizarNodosAccesoWeb(rawNodos) {
  const parsed = parseJsonArrayFlexible(rawNodos)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (!parsed.length) return [];
  if (parsed.some((x) => String(x).toUpperCase() === "TODOS")) return [...NODOS_BASE_WEB];
  const valid = new Set(NODOS_BASE_WEB.map((x) => x.toLowerCase()));
  const mapped = parsed
    .map((x) => NODOS_BASE_WEB.find((n) => n.toLowerCase() === x.toLowerCase()) || x)
    .filter((x) => valid.has(String(x).toLowerCase()));
  return Array.from(new Set(mapped));
}

function normalizarRouterKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizarMikrotikRouterConfig(item = {}) {
  const routerKey = normalizarRouterKey(item?.routerKey ?? item?.router_key ?? item?.id ?? item?.nombre);
  const portRaw = String(item?.port ?? "").trim();
  const portNum = Number(portRaw || item?.port);
  return {
    routerKey,
    nombre: String(item?.nombre || "").trim(),
    host: String(item?.host || "").trim(),
    port: String(Number.isFinite(portNum) && portNum > 0 ? portNum : 8730),
    apiUser: String(item?.apiUser ?? item?.api_user ?? "").trim(),
    apiPassword: String(item?.apiPassword ?? item?.api_password ?? "").trim(),
    activo: item?.activo !== false,
    notas: String(item?.notas ?? item?.observacion ?? "").trim(),
    persisted: Boolean(item?.persisted ?? item?._persisted ?? item?.routerKey ?? item?.router_key),
  };
}

function mergeMikrotikRoutersWithDefaults(rows = []) {
  const map = new Map(
    DEFAULT_MIKROTIK_ROUTERS_WEB.map((item) => {
      const normalized = normalizarMikrotikRouterConfig(item);
      return [normalized.routerKey, normalized];
    })
  );
  (Array.isArray(rows) ? rows : []).forEach((item) => {
    const normalized = normalizarMikrotikRouterConfig(item);
    if (!normalized.routerKey) return;
    map.set(normalized.routerKey, {
      ...(map.get(normalized.routerKey) || {}),
      ...normalized,
      persisted: true,
    });
  });
  return Array.from(map.values()).sort((a, b) => String(a.nombre || a.routerKey).localeCompare(String(b.nombre || b.routerKey), "es"));
}

function normalizarMikrotikNodoRouterConfig(item = {}) {
  const nodoRaw = String(item?.nodo || "").trim();
  const nodo = NODOS_BASE_WEB.find((value) => normalizeNodoKey(value) === normalizeNodoKey(nodoRaw)) || nodoRaw;
  return {
    nodo,
    routerKey: normalizarRouterKey(item?.routerKey ?? item?.router_key),
    activo: item?.activo !== false && Boolean(String((item?.routerKey ?? item?.router_key) || "").trim()),
    observacion: String(item?.observacion || "").trim(),
  };
}

function mergeMikrotikNodoRouterWithDefaults(rows = []) {
  const map = new Map(
    DEFAULT_MIKROTIK_NODO_ROUTER_WEB.map((item) => [item.nodo, normalizarMikrotikNodoRouterConfig(item)])
  );
  (Array.isArray(rows) ? rows : []).forEach((item) => {
    const normalized = normalizarMikrotikNodoRouterConfig(item);
    if (!normalized.nodo) return;
    map.set(normalized.nodo, normalized);
  });
  return NODOS_BASE_WEB.map((nodo) => map.get(nodo) || normalizarMikrotikNodoRouterConfig({ nodo }));
}

function normalizarUsuarioConPermisos(u = {}) {
  const rolNorm = normalizarRolSimple(u?.rol);
  const accesosMenu = normalizarAccesosMenuWeb(u?.accesosMenu ?? u?.accesos_menu, rolNorm);
  const nodos = normalizarNodosAccesoWeb(u?.nodosAcceso ?? u?.nodos_acceso);
  return {
    ...u,
    rol: rolNorm,
    accesosMenu,
    accesosHistorialAppsheet: normalizarAccesosHistorialAppsheetWeb(
      u?.accesosHistorialAppsheet ?? u?.accesos_historial_appsheet ?? u?.accesosMenu ?? u?.accesos_menu,
      rolNorm
    ),
    accesosDiagnosticoServicio: normalizarAccesosDiagnosticoServicioWeb(
      u?.accesosDiagnosticoServicio ??
        u?.accesos_diagnostico_servicio ??
        u?.accesosMenu ??
        u?.accesos_menu,
      rolNorm,
      accesosMenu
    ),
    nodosAcceso: rolNorm === "Gestora" ? (nodos.length ? nodos : [...NODOS_BASE_WEB]) : [],
  };
}







