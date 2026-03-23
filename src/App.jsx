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
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const REPORTES_PAGE_SIZE = 25;
const CLIENTES_PAGE_SIZE = 25;
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
  { key: "crear", label: "Crear orden" },
  { key: "pendientes", label: "Pendientes" },
  { key: "historial", label: "Historial" },
  { key: "historialAppsheet", label: "Historial AppSheet" },
  { key: "diagnosticoServicio", label: "Diagnóstico servicio" },
  { key: "reportes", label: "Reportes" },
  { key: "mapa", label: "Mapa" },
  { key: "consultaApi", label: "Consulta API" },
  { key: "smartOlt", label: "Smart OLT" },
  { key: "seguimientoTecnicos", label: "Seguimiento tecnicos" },
  { key: "plantaExterna", label: "Planta externa" },
  { key: "inventario", label: "Inventario" },
  { key: "almacenes", label: "Almacenes" },
  { key: "usuarios", label: "Usuarios" },
  { key: "clientes", label: "Clientes" },
];

const PERMISOS_MENU_POR_ROL_WEB = {
  Administrador: MENU_VISTAS_WEB.map((item) => item.key),
  Gestora: ["crear", "pendientes", "historial", "historialAppsheet", "diagnosticoServicio", "reportes", "clientes"],
  Tecnico: ["crear", "pendientes", "historial", "mapa", "consultaApi", "smartOlt", "inventario", "clientes"],
  Almacen: ["historial", "reportes", "inventario", "smartOlt", "plantaExterna"],
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
];
const HISTORIAL_APPSHEET_SUBMENU_ACCESS_PREFIX = "historialAppsheet:";
const HISTORIAL_APPSHEET_SUBMENU_NONE_KEY = `${HISTORIAL_APPSHEET_SUBMENU_ACCESS_PREFIX}none`;
const HISTORIAL_APPSHEET_SUBMENU_ACCESS_KEYS = HISTORIAL_APPSHEET_SUBMENU_ITEMS.map(
  (item) => `${HISTORIAL_APPSHEET_SUBMENU_ACCESS_PREFIX}${item.key}`
);
const DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS = [
  { key: "dni", label: "Buscar por DNI" },
  { key: "consultaDirecta", label: "Consulta directa por usuario" },
  { key: "suspensionManual", label: "Suspensión manual" },
];
const DIAGNOSTICO_SERVICIO_PERMISOS_PREFIX = "diagnosticoServicio:";
const DIAGNOSTICO_SERVICIO_PERMISOS_NONE_KEY = `${DIAGNOSTICO_SERVICIO_PERMISOS_PREFIX}none`;
const DIAGNOSTICO_SERVICIO_PERMISOS_ACCESS_KEYS = DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS.map(
  (item) => `${DIAGNOSTICO_SERVICIO_PERMISOS_PREFIX}${item.key}`
);

const MENU_ICON_PATHS = {
  crear: "M12 5V19M5 12H19",
  pendientes: "M8 7H16M8 12H16M8 17H13M6 7H6.01M6 12H6.01M6 17H6.01",
  historial: "M12 8V12L15 14M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12Z",
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
  empresa: "Americanet",
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

  ubicacion: "-16.438490, -71.598208",
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
    ubicacion: String(orderItem.ubicacion || "").trim(),
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
    "ubicacion",
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
    ubicacion: String(row.ubicacion || "").trim(),
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
    tipoActuacion: String(row.tipo_actuacion || "").trim(),
    dni: String(row.dni || "").trim(),
    nombre: String(row.nombre || row.cliente || "").trim(),
    direccion: String(row.direccion || "").trim(),
    celular: String(row.celular || "").trim(),
    usuarioNodo: String(row.usuario_nodo || row.user_hotspot || "").trim(),
    nodo: String(row.nodo || "").trim(),
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
  equipos: [],
  materiales: [],
  fotos: [],
  codigoQRManual: "",
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

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
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

  const [usuarios, setUsuarios] = useState(() => {
    const guardados = readLocalJson("usuarios", null);
    return guardados
      ? asegurarCredencialesUsuarios(guardados).map(normalizarUsuarioConPermisos)
      : [
          {
            id: 1,
            nombre: "Luis Pacsi",
            rol: "Tecnico",
            celular: "999999999",
            email: "",
            empresa: "Americanet",
            activo: true,
            fechaCreacion: new Date().toLocaleString(),
            accesosMenu: [...(PERMISOS_MENU_POR_ROL_WEB.Tecnico || [])],
            nodosAcceso: [],
          },
          {
            id: 2,
            nombre: "María Quispe",
            rol: "Gestora",
            celular: "988888888",
            email: "",
            empresa: "Americanet",
            activo: true,
            fechaCreacion: new Date().toLocaleString(),
            accesosMenu: [...(PERMISOS_MENU_POR_ROL_WEB.Gestora || [])],
            nodosAcceso: [...NODOS_BASE_WEB],
          },
        ].map(normalizarUsuarioConPermisos);
  });

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
  const [clientesSupabaseReady, setClientesSupabaseReady] = useState(false);
  const [clientesSupabaseSaving, setClientesSupabaseSaving] = useState(false);
  const [ordenesSupabaseReady, setOrdenesSupabaseReady] = useState(false);
  const [ordenesSyncError, setOrdenesSyncError] = useState("");
  const [usuarioNodoAccionMsg, setUsuarioNodoAccionMsg] = useState("");
  const clientesHydratingRef = useRef(false);
  const clientesSyncTimerRef = useRef(null);
  const clientesSavePromiseRef = useRef(null);
  const usuariosHydratingRef = useRef(false);
  const usuariosSyncTimerRef = useRef(null);

  const [ordenEnLiquidacion, setOrdenEnLiquidacion] = useState(null);
  const [liquidacion, setLiquidacion] = useState(initialLiquidacion);

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
  const [fotoZoomSrc, setFotoZoomSrc] = useState("");
  const [fotoZoomTitulo, setFotoZoomTitulo] = useState("");
  const [fotoZoomEscala, setFotoZoomEscala] = useState(1);

  const [busquedaPendientes, setBusquedaPendientes] = useState("");
  const [filtroTecnico, setFiltroTecnico] = useState("TODOS");
  const [busquedaHistorial, setBusquedaHistorial] = useState("");
  const [usuarioSesionId, setUsuarioSesionId] = useState(() => {
    const guardado = localStorage.getItem("usuarioSesionId");
    return guardado ? Number(guardado) : null;
  });

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

  const mapaRef = useRef(null);
  const mapaInstanciaRef = useRef(null);
  const mapaMarkersRef = useRef([]);
  const usuarioFormRef = useRef(null);
  const contentWrapRef = useRef(null);

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
    localStorage.setItem("ordenes", JSON.stringify(ordenes));
  }, [ordenes]);

  useEffect(() => {
    localStorage.setItem("usuariosNodoBloqueados", JSON.stringify(usuariosNodoBloqueados));
  }, [usuariosNodoBloqueados]);

  useEffect(() => {
    localStorage.setItem("usuariosNodoHabilitadosManual", JSON.stringify(usuariosNodoHabilitadosManual));
  }, [usuariosNodoHabilitadosManual]);

  useEffect(() => {
    localStorage.setItem("liquidaciones", JSON.stringify(liquidaciones));
  }, [liquidaciones]);

  useEffect(() => {
    localStorage.setItem("usuarios", JSON.stringify(usuarios));
  }, [usuarios]);

  useEffect(() => {
    void cargarUsuariosDesdeSupabase({ silent: true });
  }, []);

  useEffect(() => {
    void cargarMikrotikConfigDesdeSupabase({ silent: true });
  }, []);

  useEffect(() => {
    void cargarOrdenesDesdeSupabase({ silent: true });
  }, []);

  useEffect(() => {
    void cargarLiquidacionesDesdeSupabase({ silent: true });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!usuariosSupabaseReady) return;
    if (usuariosHydratingRef.current) return;
    if (usuariosSupabaseSaving) return;
    if (usuariosSyncTimerRef.current) clearTimeout(usuariosSyncTimerRef.current);
    usuariosSyncTimerRef.current = setTimeout(() => {
      void guardarUsuariosEnSupabase(usuarios).catch((e) => {
        console.error("Error sincronizando usuarios en Supabase:", e);
      });
    }, 800);
    return () => {
      if (usuariosSyncTimerRef.current) clearTimeout(usuariosSyncTimerRef.current);
    };
  }, [usuarios, usuariosSupabaseReady, usuariosSupabaseSaving]);

  useEffect(() => {
    localStorage.setItem("usuarioSesionId", String(usuarioSesionId || ""));
  }, [usuarioSesionId]);

  useEffect(() => {
    localStorage.setItem("clientes", JSON.stringify(clientes));
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
    }, 1200);
    return () => {
      if (clientesSyncTimerRef.current) clearTimeout(clientesSyncTimerRef.current);
    };
  }, [clientes, clientesSupabaseReady, clientesSupabaseSaving]);

  useEffect(() => {
    localStorage.setItem("equiposCatalogo", JSON.stringify(equiposCatalogo));
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
      if (!nodosAccesoGestoraSet.size) return false;
      const nodoNormalizado = normalizeNodoKey(rawNodo);
      if (!nodoNormalizado) return false;
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

  useEffect(() => {
    if (usuarioSesionId) {
      const existe = usuariosActivos.some((u) => Number(u.id) === Number(usuarioSesionId));
      if (!existe) setUsuarioSesionId(null);
    }
  }, [usuarioSesionId, usuariosActivos]);

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
    if (!q) return clientesPorNodo;

    return clientesPorNodo.filter((c) => {
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
  }, [clientesPorNodo, busquedaClientes]);
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

  useEffect(() => {
    setClientesPagina(1);
  }, [busquedaClientes]);

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
    if (!isSupabaseConfigured) return;

    try {
      const fotosHydrated = await obtenerFotosLiquidacionClienteSupabase(cliente);
      if (!Array.isArray(fotosHydrated) || !fotosHydrated.length) return;

      setClientes((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          clienteMergeKey(item) === key
            ? {
                ...item,
                fotosLiquidacion: fotosHydrated,
              }
            : item
        )
      );

      setClienteSeleccionado((prev) => {
        if (!prev || clienteMergeKey(prev) !== key) return prev;
        return {
          ...prev,
          fotosLiquidacion: fotosHydrated,
        };
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
      accesos_menu: accesosMenuSerializados,
      nodos_acceso: normalizarNodosAccesoWeb(u?.nodosAcceso ?? u?.nodos_acceso),
    };
  };

  const deserializarUsuarioSupabase = (row = {}) =>
    normalizarUsuarioConPermisos({
      id: Number(row.id) || Date.now() + Math.floor(Math.random() * 100000),
      nombre: String(row.nombre || "").trim(),
      username: String(row.username || "").trim(),
      password: String(row.password || "").trim(),
      rol: String(row.rol || "").trim() || "Tecnico",
      celular: String(row.celular || "").trim(),
      email: String(row.email || "").trim(),
      empresa: String(row.empresa || "").trim() || "Americanet",
      activo: row.activo !== false,
      fechaCreacion: row.fecha_creacion ? formatFechaFlexible(row.fecha_creacion) : new Date().toLocaleString(),
      accesosMenu: row.accesos_menu,
      accesosHistorialAppsheet: row.accesos_menu,
      accesosDiagnosticoServicio: row.accesos_menu,
      nodosAcceso: row.nodos_acceso,
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

  const cargarUsuariosDesdeSupabase = async (opts = { silent: true }) => {
    if (!isSupabaseConfigured) return;
    try {
      let { data, error } = await supabase
        .from(USUARIOS_TABLE)
        .select("id,nombre,username,password,rol,celular,email,empresa,activo,fecha_creacion,accesos_menu,nodos_acceso")
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
      payload: cliente,
      updated_at: new Date().toISOString(),
    };
  };

  const deserializarClienteSupabase = (row = {}) => {
    const p = row && typeof row.payload === "object" && row.payload ? row.payload : null;
    if (p) {
      return {
        ...p,
        id: p.id || row.id,
      };
    }
    return {
      id: row.id || row.dni || row.codigo_cliente || String(Date.now()),
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
    for (const chunk of chunks) {
      let { error } = await supabase.from(CLIENTES_TABLE).upsert(chunk, { onConflict: "id" });
      if (error && /column .* does not exist/i.test(String(error?.message || ""))) {
        const fallback = chunk.map((r) => ({
          id: r.id,
          dni: r.dni,
          nombre: r.nombre,
          payload: r.payload,
          updated_at: r.updated_at,
        }));
        const retry = await supabase.from(CLIENTES_TABLE).upsert(fallback, { onConflict: "id" });
        error = retry.error;
      }
      if (error && /non-DEFAULT value into column "id"/i.test(String(error?.message || ""))) {
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
        "id,codigo_cliente,dni,nombre,direccion,celular,email,contacto,empresa,velocidad,precio_plan,nodo,usuario_nodo,password_usuario,codigo_etiqueta,ubicacion,descripcion,tecnico,autor_orden,fecha_registro,ultima_actualizacion,foto_fachada,fotos_liquidacion,historial_instalaciones,equipos_historial,payload,updated_at"
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
      const mapped = all.map(deserializeLiquidacionFromSupabase);
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

      const prevByKey = new Map(
        clientes
          .map((c) => [keyOf(c), c])
          .filter(([k]) => Boolean(k))
      );

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
        const prev = prevByKey.get(key);
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
    if (!esAdminSesion) return;
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
    if (!esAdminSesion) return;
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

  const iniciarSesion = () => {
    const username = String(credencialesLogin.username || "").trim().toLowerCase();
    const password = String(credencialesLogin.password || "");
    if (!username || !password) {
      setErrorLogin("Ingresa usuario y contraseña.");
      return;
    }
    const encontrado = usuariosActivos.find((u) => {
      const uName = String(u.username || usernameDesdeNombre(u.nombre || "")).trim().toLowerCase();
      return uName === username && String(u.password || "123456") === password;
    });
    if (!encontrado) {
      setErrorLogin("Credenciales inválidas.");
      return;
    }
    setUsuarioSesionId(Number(encontrado.id));
    setErrorLogin("");
    setCredencialesLogin({ username: "", password: "" });
  };

  const cerrarSesion = () => {
    setUsuarioSesionId(null);
    setCredencialesLogin({ username: "", password: "" });
    setErrorLogin("");
    setVistaActiva("crear");
  };

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

  const generarCodigo = () => {
    const random = Math.floor(1000 + Math.random() * 9000);
    handleChange("codigo", `ORD-${random}-${new Date().getFullYear()}`);
  };

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

      const response = await fetch("https://api.consultasperu.com/api/v1/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: "dcda84257b21983f0416885996aafc25e1e48793389fc8f26800b28421cee626",
          type_document: "dni",
          document_number: dni,
        }),
      });

      const result = await response.json();

      if (result.success && result.data) {
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

  const guardarOrden = async () => {
    if (
      !orden.codigo.trim() ||
      !orden.fechaActuacion.trim() ||
      !orden.dni.trim() ||
      !orden.nombre.trim() ||
      !orden.direccion.trim()
    ) {
      alert("Completa los campos obligatorios");
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
            .upsert([payload], { onConflict: "codigo" })
            .select("*")
            .single();
          if (up.error) throw up.error;
          saved = up.data;
        }
        const merged = deserializeOrderFromSupabase(saved || payload);
        if (ordenEditandoId) {
          setOrdenes((prev) => prev.map((item) => (item.id === ordenEditandoId ? { ...item, ...merged } : item)));
        } else {
          setOrdenes((prev) => [merged, ...prev.filter((x) => String(x.codigo) !== String(merged.codigo))]);
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

    setOrdenEditandoId(null);
    setOrden(buildInitialOrder());
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
    if (isSupabaseConfigured && Number.isFinite(Number(id))) {
      const del = await supabase.from(ORDENES_TABLE).delete().eq("id", Number(id));
      if (del.error) {
        alert(del.error.message || "No se pudo eliminar la orden en Supabase.");
        return;
      }
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
      equipos: liquidacionItem.liquidacion?.equipos || [],
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

  const guardarClienteDesdeLiquidacion = (registroLiquidado) => {
    if (!registroLiquidado) return;
    if (!esActuacionInstalacion(registroLiquidado.tipoActuacion)) return;

    const dni = String(registroLiquidado.dni || "").trim();
    if (!dni) return;

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
      fechaRegistro: new Date().toLocaleString(),
      ultimaActualizacion: new Date().toLocaleString(),
      historialInstalaciones: [historialItem],
      equiposHistorial: equiposHistorialActuales,
    };

    let clienteResultado = null;
    setClientes((prev) => {
      const existente = prev.find((c) => String(c.dni) === dni);

      if (!existente) {
        clienteResultado = nuevoCliente;
        return [nuevoCliente, ...prev];
      }

      const historialActual = Array.isArray(existente.historialInstalaciones)
        ? existente.historialInstalaciones
        : [];

      const historialSinDuplicado = historialActual.filter((h) => h.id !== historialItem.id);

      const equiposHistorialPrevios = Array.isArray(existente.equiposHistorial)
        ? existente.equiposHistorial
        : [];

      const nuevosEquiposFiltrados = equiposHistorialActuales.filter(
        (nuevo) =>
          !equiposHistorialPrevios.some(
            (existenteEq) =>
              String(existenteEq.codigo || "") === String(nuevo.codigo || "") &&
              String(existenteEq.fecha || "") === String(nuevo.fecha || "")
          )
      );

      const actualizado = {
        ...existente,
        codigoCliente: dni,
        dni,
        nombre: registroLiquidado.nombre || existente.nombre || "",
        direccion: registroLiquidado.direccion || existente.direccion || "",
        celular: registroLiquidado.celular || existente.celular || "",
        email: registroLiquidado.email || existente.email || "",
        contacto: registroLiquidado.contacto || existente.contacto || "",
        empresa: registroLiquidado.empresa || existente.empresa || "",
        velocidad: registroLiquidado.velocidad || existente.velocidad || "",
        precioPlan: registroLiquidado.precioPlan || existente.precioPlan || "",
        nodo: registroLiquidado.nodo || existente.nodo || "",
        usuarioNodo: registroLiquidado.usuarioNodo || existente.usuarioNodo || "",
        passwordUsuario: registroLiquidado.passwordUsuario || existente.passwordUsuario || "",
        ubicacion: registroLiquidado.ubicacion || existente.ubicacion || "",
        descripcion: registroLiquidado.descripcion || existente.descripcion || "",
        fotoFachada: registroLiquidado.fotoFachada || existente.fotoFachada || "",
        fotosLiquidacion:
          registroLiquidado.liquidacion?.fotos?.length > 0
            ? registroLiquidado.liquidacion.fotos
            : existente.fotosLiquidacion || [],
        codigoEtiqueta:
          registroLiquidado.liquidacion?.codigoEtiqueta || existente.codigoEtiqueta || "",
        tecnico: registroLiquidado.tecnico || existente.tecnico || "",
        autorOrden: registroLiquidado.autorOrden || existente.autorOrden || "",
        ultimaActualizacion: new Date().toLocaleString(),
        historialInstalaciones: [historialItem, ...historialSinDuplicado],
        equiposHistorial: [...nuevosEquiposFiltrados, ...equiposHistorialPrevios],
      };
      clienteResultado = actualizado;

      return prev.map((c) => (String(c.dni) === dni ? actualizado : c));
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

  const guardarLiquidacion = () => {
    if (!ordenEnLiquidacion) return;
    const equiposSinFoto = (Array.isArray(liquidacion?.equipos) ? liquidacion.equipos : []).filter(
      (eq) => !String(eq?.fotoReferencia || "").trim()
    );
    if (equiposSinFoto.length > 0) {
      alert("Cada equipo debe tener la foto serial/equipo antes de guardar la liquidación.");
      return;
    }

    const registro = {
      id: liquidacionEditandoId || Date.now(),
      fechaLiquidacion: liquidacionEditandoId
        ? liquidaciones.find((x) => x.id === liquidacionEditandoId)?.fechaLiquidacion ||
          new Date().toLocaleString()
        : new Date().toLocaleString(),
      ordenOriginalId: ordenEnLiquidacion.id,
      ...ordenEnLiquidacion,
      liquidacion: {
        ...liquidacion,
      },
      estado: "Liquidada",
    };
    const equiposRecuperadosCount = (Array.isArray(registro?.liquidacion?.equipos) ? registro.liquidacion.equipos : []).filter((eq) => {
      const accion = String(eq?.accion || "").toLowerCase();
      return accion === "retirado" || accion === "devuelto";
    }).length;

    if (liquidacionEditandoId) {
      setLiquidaciones((prev) =>
        prev.map((item) => (item.id === liquidacionEditandoId ? registro : item))
      );
    } else {
      setLiquidaciones((prev) => [registro, ...prev]);
      setOrdenes((prev) =>
        prev.map((item) =>
          item.id === ordenEnLiquidacion.id ? { ...item, estado: "Liquidada" } : item
        )
      );
      if (isSupabaseConfigured && Number.isFinite(Number(ordenEnLiquidacion.id))) {
        void supabase
          .from(ORDENES_TABLE)
          .update({ estado: "Liquidada" })
          .eq("id", Number(ordenEnLiquidacion.id));
      }
    }

    aplicarEstadoEquiposDesdeLiquidacion(registro);
    guardarClienteDesdeLiquidacion(registro);

    setOrdenEnLiquidacion(null);
    setLiquidacion(initialLiquidacion);
    setLiquidacionEditandoId(null);
    setMostrarScannerLiquidacion(false);
    setVistaActiva("historial");
    if (equiposRecuperadosCount > 0) {
      alert(
        `${equiposRecuperadosCount} equipo(s) quedaron en stock técnico pendiente de entrega a almacén. No se sumaron automáticamente a almacén.`
      );
    }
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

  const cargarImagenOrden = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      handleChange("fotoFachada", reader.result);
    };
    reader.readAsDataURL(file);
  };

  const cargarFotoEquipoCatalogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      handleEquipoCatalogoChange("fotoReferencia", reader.result);
    };
    reader.readAsDataURL(file);
  };

  const cargarFotosLiquidacion = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const fotosActuales = liquidacion.fotos.length;
    const espaciosDisponibles = 5 - fotosActuales;

    if (espaciosDisponibles <= 0) {
      alert("Solo puedes subir hasta 5 fotos.");
      e.target.value = "";
      return;
    }

    const archivosPermitidos = files.slice(0, espaciosDisponibles);

    if (files.length > espaciosDisponibles) {
      alert(`Solo puedes subir hasta 5 fotos. Se agregarán ${espaciosDisponibles} foto(s).`);
    }

    archivosPermitidos.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLiquidacion((prev) => {
          if (prev.fotos.length >= 5) return prev;
          return {
            ...prev,
            fotos: [...prev.fotos, reader.result].slice(0, 5),
          };
        });
      };
      reader.readAsDataURL(file);
    });

    e.target.value = "";
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

    if (usuarioEditandoId) {
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === usuarioEditandoId
            ? {
                ...u,
                ...normalizarUsuarioConPermisos(usuarioForm),
                username: usernameLimpio,
                password: passLimpio,
                rol: rolNorm,
                accesosMenu,
                nodosAcceso: rolNorm === "Gestora" ? nodosAcceso : [],
              }
            : u
        )
      );
    } else {
      const nuevoUsuario = {
        ...normalizarUsuarioConPermisos(usuarioForm),
        username: usernameLimpio,
        password: passLimpio,
        rol: rolNorm,
        accesosMenu,
        nodosAcceso: rolNorm === "Gestora" ? nodosAcceso : [],
        id: Date.now(),
        fechaCreacion: new Date().toLocaleString(),
      };
      setUsuarios((prev) => [nuevoUsuario, ...prev]);
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

  const eliminarUsuario = (id) => {
    const confirmar = window.confirm("¿Deseas eliminar este usuario?");
    if (!confirmar) return;
    setUsuarios((prev) => prev.filter((u) => u.id !== id));
  };

  const cambiarEstadoUsuario = (id) => {
    setUsuarios((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              activo: !u.activo,
            }
          : u
      )
    );
  };

  const cancelarEdicionUsuario = () => {
    setUsuarioForm(normalizarUsuarioConPermisos(initialUsuario));
    setUsuarioEditandoId(null);
  };

  const cargarFotoEquipoLiquidacion = (index, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      actualizarEquipo(index, "fotoReferencia", reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
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
      passwordUsuario: firstText(cliente.passwordUsuario),
      codigoEtiqueta: firstText(cliente.codigoEtiqueta),
      ubicacion: firstText(cliente.ubicacion, base.ubicacion),
      descripcion: firstText(cliente.descripcion),
      tecnico: firstText(cliente.tecnico),
      autorOrden: firstText(cliente.autorOrden),
      solicitarPago: "NO",
      montoCobrar: "",
    });
    setVistaActiva("crear");
    setTimeout(() => {
      contentWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
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
  }, [ordenes, busquedaPendientes, filtroTecnico]);

  const liquidacionesFiltradas = useMemo(() => {
    const q = busquedaHistorial.trim().toLowerCase();
    const base = (Array.isArray(liquidaciones) ? liquidaciones : []).filter((item) =>
      tieneAccesoNodoSesion(firstText(item?.nodo, item?.payload?.nodo, item?.payload?.Nodo))
    );
    if (!q) return base;

    return base.filter((item) => {
      const equiposTexto = (item.liquidacion?.equipos || [])
        .map(
          (eq) =>
            `${eq.tipo} ${eq.codigo} ${eq.serial} ${eq.accion} ${eq.marca || ""} ${eq.modelo || ""}`
        )
        .join(" ")
        .toLowerCase();

      const materialesTexto = (item.liquidacion?.materiales || [])
        .map((m) => `${m.material} ${m.cantidad} ${m.unidad}`)
        .join(" ")
        .toLowerCase();

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
        safeIncludes(item.liquidacion?.codigoEtiqueta, q) ||
        equiposTexto.includes(q) ||
        materialesTexto.includes(q)
      );
    });
  }, [liquidaciones, busquedaHistorial, tieneAccesoNodoSesion]);

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
          <button onClick={cerrarSesion} style={{ ...secondaryButton, padding: "10px 14px" }}>
            Cerrar sesión
          </button>
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
                    <label style={labelStyle}>Empresa</label>
                    <select style={inputStyle} value={orden.empresa} onChange={(e) => handleChange("empresa", e.target.value)}>
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
                    <select style={inputStyle} value={orden.orden} onChange={(e) => handleChange("orden", e.target.value)}>
                      <option>ORDEN DE SERVICIO</option>
                      <option>INCIDENCIA</option>
                      <option>MANTENIMIENTO</option>
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
                          <option>500 Mbps</option>
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

                      <div>
                        <label style={labelStyle}>Usuario</label>
                        <input style={inputStyle} value={orden.usuarioNodo} onChange={(e) => handleChange("usuarioNodo", e.target.value)} placeholder="user730@americanet" />
                        <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={usuarioNodoEstaBloqueado ? badgeDanger : badgeSuccess}>
                            {usuarioNodoEstaBloqueado ? "Deshabilitado" : "Habilitado"}
                          </span>
                          {esAdminSesion ? (
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
                      </div>

                      <div>
                        <label style={labelStyle}>Contraseña</label>
                        <input style={inputStyle} value={orden.passwordUsuario} onChange={(e) => handleChange("passwordUsuario", e.target.value)} placeholder="Contraseña" />
                      </div>
                    </>
                  )}
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
                    <div style={{ border: "1px solid #dbe2ea", borderRadius: "16px", overflow: "hidden", background: "#f8fafc" }}>
                      <iframe
                        title="Mapa de ubicación"
                        src={googleMapUrl}
                        width="100%"
                        height="360"
                        style={{ border: "0", display: "block" }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
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
                      <input style={inputStyle} value={orden.montoCobrar} onChange={(e) => handleChange("montoCobrar", e.target.value)} placeholder="50" />
                    </div>
                  )}

                  <div>
                    <label style={labelStyle}>Autor de la orden</label>
                    <select style={inputStyle} value={orden.autorOrden} onChange={(e) => handleChange("autorOrden", e.target.value)}>
                      <option value="">Seleccionar autor</option>
                      {autoresOrdenActivos.map((autor) => (
                        <option key={autor.id} value={autor.nombre}>
                          {autor.nombre} - {autor.empresa}
                        </option>
                      ))}
                    </select>
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
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button onClick={generarCodigo} style={secondaryButton}>Generar código</button>
                  <button onClick={guardarOrden} style={primaryButton}>{ordenEditandoId ? "Actualizar orden" : "Guardar orden"}</button>
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

        {vistaActiva === "pendientes" && (
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "18px" }}>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Órdenes pendientes</h2>

              <select
                style={{ ...inputStyle, maxWidth: "220px" }}
                value={filtroTecnico}
                onChange={(e) => setFiltroTecnico(e.target.value)}
              >
                <option value="TODOS">Todos</option>
                <option value="SIN">Sin técnico</option>
                {tecnicosActivos.map((tec) => (
                  <option key={tec.id} value={tec.nombre}>
                    {tec.nombre}
                  </option>
                ))}
              </select>

              <input
                style={{ ...inputStyle, maxWidth: "520px" }}
                value={busquedaPendientes}
                onChange={(e) => setBusquedaPendientes(e.target.value)}
                placeholder="Buscar por código, DNI, cliente, celular, usuario, nodo, técnico."
              />
            </div>

            {ordenesPendientesFiltradas.length === 0 ? (
              <p style={{ color: "#6b7280", margin: 0 }}>No hay órdenes pendientes.</p>
            ) : (
              <div style={{ display: "grid", gap: "14px" }}>
                {ordenesPendientesFiltradas.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: "16px",
                      padding: "18px",
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                      <div>
                        <div style={{ fontWeight: "700", fontSize: "18px" }}>
                          {item.codigo}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                          <div
                            style={{
                              display: "inline-block",
                              padding: "6px 10px",
                              borderRadius: "999px",
                              fontSize: "12px",
                              fontWeight: "600",
                              ...prioridadColor(item.prioridad),
                            }}
                          >
                            {item.prioridad || "Normal"}
                          </div>
                          <div style={getEstadoOperativoBadgeStyle(item.estado)}>{item.estado || "Pendiente"}</div>
                        </div>

                        <div style={{ fontWeight: "600", marginTop: "8px" }}>
                          {item.nombre}
                        </div>

                        <div style={{ color: "#4b5563", fontSize: "14px" }}>
                          {item.tipoActuacion}
                        </div>

                        <div style={{ marginTop: "6px", fontSize: "14px" }}>
                          DNI: {item.dni} · Cel: {item.celular || "-"}
                        </div>

                        <div style={{ fontSize: "14px" }}>
                          Usuario: {item.usuarioNodo || "-"} · Nodo: {item.nodo || "-"}
                        </div>

                        <div style={{ fontSize: "14px" }}>
                          Técnico: {item.tecnico || "-"}
                        </div>

                        <div style={{ fontSize: "14px" }}>
                          Autor: {item.autorOrden || "-"}
                        </div>

                        <div style={{ fontSize: "14px", marginTop: "6px", color: "#374151" }}>
                          Dirección: {item.direccion || "-"}
                        </div>

                        <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                          <button
                            onClick={() => llamarCliente(item.celular)}
                            style={infoButton}
                          >
                            Llamar
                          </button>

                          <button
                            onClick={() => abrirWhatsApp(item.celular)}
                            style={whatsappButton}
                          >
                            WhatsApp
                          </button>

                          <button
                            onClick={() => abrirMapa(item.ubicacion, item.direccion)}
                            style={secondaryButton}
                          >
                            Abrir mapa
                          </button>

                          <button
                            onClick={() => navegarRuta(item.ubicacion, item.direccion)}
                            style={primaryButton}
                          >
                            Navegar
                          </button>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
                        <button
                          onClick={() => editarOrden(item)}
                          style={warningButton}
                        >
                          Editar
                        </button>
                        {puedeCancelarOrden ? (
                          <button
                            onClick={() => cancelarOrden(item.id)}
                            style={secondaryButton}
                          >
                            Cancelar
                          </button>
                        ) : null}
                        {puedeLiquidarOrden ? (
                          <button
                            onClick={() => abrirLiquidacion(item)}
                            style={successButton}
                          >
                            Liquidar
                          </button>
                        ) : null}

                        {puedeEliminarOrden ? (
                          <button
                            onClick={() => eliminarOrden(item.id)}
                            style={dangerButton}
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {vistaActiva === "historial" && (
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "18px" }}>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Historial de liquidaciones</h2>
              <input
                style={{ ...inputStyle, maxWidth: "420px" }}
                value={busquedaHistorial}
                onChange={(e) => setBusquedaHistorial(e.target.value)}
                placeholder="Buscar por código, DNI, cliente, celular, usuario, nodo, técnico..."
              />
            </div>

            {liquidacionesFiltradas.length === 0 ? (
              <p style={{ color: "#6b7280", margin: 0 }}>No hay liquidaciones registradas.</p>
            ) : (
              <div style={{ display: "grid", gap: "18px" }}>
                {liquidacionesFiltradas.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: "16px",
                      padding: "18px",
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: "700", fontSize: "16px" }}>
                          {item.codigo} · {item.nombre}
                        </div>
                        <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                          {item.tipoActuacion} · {item.direccion}
                        </div>
                        <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                          DNI: {item.dni} · Cel: {item.celular || "-"}
                        </div>
                        <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                          Técnico: {item.liquidacion?.tecnicoLiquida || item.tecnico || "-"} · Fecha: {item.fechaLiquidacion}
                        </div>
                        <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                          Autor: {item.autorOrden || "-"} · Etiqueta: {item.liquidacion?.codigoEtiqueta || "-"}
                        </div>
                        <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                          Equipos: {(item.liquidacion?.equipos || []).length} · Materiales: {(item.liquidacion?.materiales || []).length}
                        </div>
                        <div style={{ marginTop: "8px" }}>
                          <span style={badgeStyle}>{item.liquidacion?.resultadoFinal || "Liquidada"}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "start" }}>
                        <button
                          onClick={() => void abrirDetalleLiquidacionHistorial(item)}
                          style={infoButton}
                        >
                          Ver detalles
                        </button>

                        {puedeEditarLiquidacion ? (
                          <button onClick={() => void abrirEditarLiquidacionHistorial(item)} style={warningButton}>
                            Editar
                          </button>
                        ) : null}

                        {puedeEliminarLiquidacion ? (
                          <button onClick={() => eliminarLiquidacion(item)} style={dangerButton}>
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
              <>
            <div style={gridStyle}>
              <div style={cardStyle} ref={usuarioFormRef}>
                <h2 style={sectionTitleStyle}>
                  {usuarioEditandoId ? "Editar usuario" : "Agregar técnico o gestor"}
                </h2>

                <div style={formGridStyle}>
                  <div>
                    <label style={labelStyle}>Nombre completo</label>
                    <input
                      style={inputStyle}
                      value={usuarioForm.nombre}
                      onChange={(e) => handleUsuarioChange("nombre", e.target.value)}
                      placeholder="Ej. Luis Pacsi"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Usuario</label>
                    <input
                      style={inputStyle}
                      value={usuarioForm.username || ""}
                      onChange={(e) => handleUsuarioChange("username", e.target.value)}
                      placeholder="usuario.login"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Contraseña</label>
                    <input
                      type="password"
                      style={inputStyle}
                      value={usuarioForm.password || ""}
                      onChange={(e) => handleUsuarioChange("password", e.target.value)}
                      placeholder="********"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Celular</label>
                    <input
                      style={inputStyle}
                      value={usuarioForm.celular}
                      onChange={(e) => handleUsuarioChange("celular", e.target.value)}
                      placeholder="999999999"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Email</label>
                    <input
                      style={inputStyle}
                      value={usuarioForm.email}
                      onChange={(e) => handleUsuarioChange("email", e.target.value)}
                      placeholder="correo@empresa.com"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Empresa</label>
                    <select
                      style={inputStyle}
                      value={usuarioForm.empresa}
                      onChange={(e) => handleUsuarioChange("empresa", e.target.value)}
                    >
                      {EMPRESAS_USUARIO_WEB.map((empresa) => (
                        <option key={empresa} value={empresa}>
                          {empresa}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Estado</label>
                    <select
                      style={inputStyle}
                      value={usuarioForm.activo ? "SI" : "NO"}
                      onChange={(e) => handleUsuarioChange("activo", e.target.value === "SI")}
                    >
                      <option value="SI">Activo</option>
                      <option value="NO">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: "12px" }}>
                  <div style={{ ...labelStyle, marginBottom: "8px" }}>Rol</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {ROLES_USUARIO_WEB.map((rol) => {
                      const activo = normalizarRolSimple(usuarioForm.rol) === rol;
                      return (
                        <button
                          key={rol}
                          type="button"
                          onClick={() => handleUsuarioChange("rol", rol)}
                          style={activo ? primaryButton : secondaryButton}
                        >
                          {rol}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                  <div style={{ ...labelStyle, marginBottom: 0 }}>Accesos de menú</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button type="button" style={secondaryButton} onClick={aplicarAccesosPorRolUsuario}>
                      Por rol
                    </button>
                    <button type="button" style={secondaryButton} onClick={seleccionarTodosAccesosUsuario}>
                      Todos
                    </button>
                    <button type="button" style={secondaryButton} onClick={limpiarAccesosUsuario}>
                      Limpiar
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {MENU_VISTAS_WEB.map((menu) => {
                      const activo = normalizarAccesosMenuWeb(usuarioForm.accesosMenu, usuarioForm.rol).includes(menu.key);
                      return (
                        <button
                          key={menu.key}
                          type="button"
                          onClick={() => toggleAccesoMenuUsuario(menu.key)}
                          style={activo ? primaryButton : secondaryButton}
                        >
                          {menu.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {normalizarAccesosMenuWeb(usuarioForm.accesosMenu, usuarioForm.rol).includes("historialAppsheet") ? (
                  <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                    <div style={{ ...labelStyle, marginBottom: 0 }}>Submenús de Historial AppSheet</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" style={secondaryButton} onClick={aplicarAccesosHistorialAppsheetPorRolUsuario}>
                        Por rol
                      </button>
                      <button type="button" style={secondaryButton} onClick={seleccionarTodosAccesosHistorialAppsheetUsuario}>
                        Todos
                      </button>
                      <button type="button" style={secondaryButton} onClick={limpiarAccesosHistorialAppsheetUsuario}>
                        Limpiar
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {HISTORIAL_APPSHEET_SUBMENU_ITEMS.map((submenu) => {
                        const activo = normalizarAccesosHistorialAppsheetWeb(usuarioForm.accesosHistorialAppsheet, usuarioForm.rol).includes(submenu.key);
                        return (
                          <button
                            key={`historial-submenu-${submenu.key}`}
                            type="button"
                            onClick={() => toggleAccesoHistorialAppsheetUsuario(submenu.key)}
                            style={activo ? primaryButton : secondaryButton}
                          >
                            {submenu.sideLabel || submenu.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {normalizarAccesosMenuWeb(usuarioForm.accesosMenu, usuarioForm.rol).includes("diagnosticoServicio") ? (
                  <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                    <div style={{ ...labelStyle, marginBottom: 0 }}>Permisos de Diagnóstico de servicio</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" style={secondaryButton} onClick={aplicarAccesosDiagnosticoServicioPorRolUsuario}>
                        Por rol
                      </button>
                      <button type="button" style={secondaryButton} onClick={seleccionarTodosAccesosDiagnosticoServicioUsuario}>
                        Todos
                      </button>
                      <button type="button" style={secondaryButton} onClick={limpiarAccesosDiagnosticoServicioUsuario}>
                        Limpiar
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {DIAGNOSTICO_SERVICIO_PERMISOS_ITEMS.map((permiso) => {
                        const activo = normalizarAccesosDiagnosticoServicioWeb(
                          usuarioForm.accesosDiagnosticoServicio,
                          usuarioForm.rol,
                          usuarioForm.accesosMenu
                        ).includes(permiso.key);
                        return (
                          <button
                            key={`diag-servicio-perm-${permiso.key}`}
                            type="button"
                            onClick={() => toggleAccesoDiagnosticoServicioUsuario(permiso.key)}
                            style={activo ? primaryButton : secondaryButton}
                          >
                            {permiso.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {normalizarRolSimple(usuarioForm.rol) === "Gestora" ? (
                  <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                    <div style={{ ...labelStyle, marginBottom: 0 }}>Nodos de acceso (Gestora)</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" style={secondaryButton} onClick={seleccionarTodosNodosUsuario}>
                        Todos
                      </button>
                      <button type="button" style={secondaryButton} onClick={limpiarNodosUsuario}>
                        Limpiar
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {NODOS_BASE_WEB.map((nodo) => {
                        const activo = normalizarNodosAccesoWeb(usuarioForm.nodosAcceso).includes(nodo);
                        return (
                          <button
                            key={nodo}
                            type="button"
                            onClick={() => toggleNodoAccesoUsuario(nodo)}
                            style={activo ? primaryButton : secondaryButton}
                          >
                            {nodo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div style={{ marginTop: "18px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button onClick={guardarUsuario} style={primaryButton}>
                    {usuarioEditandoId ? "Guardar cambios" : "Guardar usuario"}
                  </button>

                  {usuarioEditandoId && (
                    <button onClick={cancelarEdicionUsuario} style={secondaryButton}>
                      Cancelar edición
                    </button>
                  )}
                </div>
              </div>

              <div style={cardStyle}>
                <h2 style={sectionTitleStyle}>Resumen de personal</h2>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div><strong>Total usuarios:</strong> {usuarios.length}</div>
                  <div><strong>Técnicos activos:</strong> {tecnicosActivos.length}</div>
                  <div><strong>Gestoras activas:</strong> {gestoresActivos.length}</div>
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "18px" }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Listado de usuarios</h2>
                <input
                  style={{ ...inputStyle, maxWidth: "420px" }}
                  value={busquedaUsuarios}
                  onChange={(e) => setBusquedaUsuarios(e.target.value)}
                  placeholder="Buscar por nombre, rol, celular, empresa, estado..."
                />
              </div>

              {usuariosFiltrados.length === 0 ? (
                <p style={{ color: "#6b7280", margin: 0 }}>No hay usuarios registrados.</p>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {usuariosFiltrados.map((usuario) => (
                    <div
                      key={usuario.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "16px",
                        padding: "16px",
                        background: "#fafafa",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontWeight: "700", fontSize: "16px" }}>{usuario.nombre}</div>
                          <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                            {normalizarRolSimple(usuario.rol)} · {usuario.empresa}
                          </div>
                          <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                            Cel: {usuario.celular || "-"} · Email: {usuario.email || "-"}
                          </div>
                          <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                            Usuario: {usuario.username || "-"}
                          </div>
                          <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                            Accesos: {normalizarAccesosMenuWeb(usuario.accesosMenu ?? usuario.accesos_menu, usuario.rol).map((k) => menuLabelByKeyWeb[k] || k).join(", ") || "-"}
                          </div>
                          {normalizarAccesosMenuWeb(usuario.accesosMenu ?? usuario.accesos_menu, usuario.rol).includes("historialAppsheet") ? (
                            <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                              Historial AppSheet:{" "}
                              {normalizarAccesosHistorialAppsheetWeb(
                                usuario.accesosHistorialAppsheet ?? usuario.accesos_historial_appsheet ?? usuario.accesosMenu ?? usuario.accesos_menu,
                                usuario.rol
                              )
                                .map((k) => historialAppsheetSubmenuLabelByKey[k] || k)
                                .join(", ") || "-"}
                            </div>
                          ) : null}
                          {normalizarAccesosMenuWeb(usuario.accesosMenu ?? usuario.accesos_menu, usuario.rol).includes("diagnosticoServicio") ? (
                            <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                              Diagnóstico servicio:{" "}
                              {normalizarAccesosDiagnosticoServicioWeb(
                                usuario.accesosDiagnosticoServicio ??
                                  usuario.accesos_diagnostico_servicio ??
                                  usuario.accesosMenu ??
                                  usuario.accesos_menu,
                                usuario.rol,
                                usuario.accesosMenu ?? usuario.accesos_menu
                              )
                                .map((k) => diagnosticoServicioPermisoLabelByKey[k] || k)
                                .join(", ") || "-"}
                            </div>
                          ) : null}
                          {normalizarRolSimple(usuario.rol) === "Gestora" ? (
                            <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                              Nodos: {normalizarNodosAccesoWeb(usuario.nodosAcceso ?? usuario.nodos_acceso).join(", ") || "-"}
                            </div>
                          ) : null}
                          <div style={{ marginTop: "8px" }}>
                            <span style={usuario.activo ? badgeSuccess : badgeDanger}>
                              {usuario.activo ? "Activo" : "Inactivo"}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "start" }}>
                          <button onClick={() => editarUsuario(usuario)} style={warningButton}>
                            Editar
                          </button>
                          <button onClick={() => cambiarEstadoUsuario(usuario.id)} style={infoButton}>
                            {usuario.activo ? "Desactivar" : "Activar"}
                          </button>
                          <button onClick={() => eliminarUsuario(usuario.id)} style={dangerButton}>
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

              </>
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
          <div style={{ display: "grid", gap: "24px" }}>
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "18px" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Base de abonados</h2>
                  <p style={{ ...subtitleStyle, margin: 0 }}>Consulta histórica importada desde Sheet1/Supabase.</p>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    style={{ ...inputStyle, width: "420px", maxWidth: "100%" }}
                    value={busquedaClientesDraft}
                    onChange={(e) => setBusquedaClientesDraft(e.target.value)}
                    placeholder="Buscar por DNI, nombre, celular, dirección, usuario, nodo, equipo..."
                  />
                  <button onClick={syncClientesDesdeSheet} style={primaryButton} disabled={clientesSyncLoading}>
                    {clientesSyncLoading ? "Actualizando..." : clientesSupabaseSaving ? "Guardando..." : "Actualizar"}
                  </button>
                  <button
                    onClick={() => cargarClientesDesdeSupabase({ silent: false })}
                    style={secondaryButton}
                    disabled={clientesSyncLoading || !isSupabaseConfigured}
                    title={isSupabaseConfigured ? "Recargar desde Supabase" : "Configura Supabase"}
                  >
                    {clientesSupabaseSaving ? "Guardando..." : "Recargar"}
                  </button>
                  <span style={{ ...badgeStyle, background: "#eef2ff", color: "#1e3a8a" }}>Registros: {clientes.length}</span>
                  {esAdminSesion ? (
                    <button onClick={limpiarClientesLocales} style={dangerButton}>
                      Vaciar locales
                    </button>
                  ) : null}
                </div>
              </div>

              {clientesSyncInfo ? (
                <div style={{ marginBottom: "10px", fontSize: "13px", color: "#065f46" }}>{clientesSyncInfo}</div>
              ) : null}
              {clientesSyncError ? (
                <div style={{ marginBottom: "10px", fontSize: "13px", color: "#b91c1c" }}>{clientesSyncError}</div>
              ) : null}

              <div style={{ marginBottom: "16px", color: "#4b5563", fontSize: "14px" }}>
                Total abonados: <strong>{clientes.length}</strong>
                {" · "}
                Mostrando:{" "}
                <strong>
                  {clientesFiltrados.length === 0 ? 0 : (clientesPagina - 1) * CLIENTES_PAGE_SIZE + 1}
                  -
                  {Math.min(clientesPagina * CLIENTES_PAGE_SIZE, clientesFiltrados.length)}
                </strong>
                {" de "}
                <strong>{clientesFiltrados.length}</strong>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                  marginBottom: "14px",
                }}
              >
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px 12px", background: "#f8fafc" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Abonados visibles</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{clientesResumen.total}</div>
                </div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px 12px", background: "#f8fafc" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Con celular</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#0369a1" }}>{clientesResumen.conCelular}</div>
                </div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px 12px", background: "#f8fafc" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Con nodo</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f766e" }}>{clientesResumen.conNodo}</div>
                </div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px 12px", background: "#f8fafc" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Con etiqueta</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#b45309" }}>{clientesResumen.conEtiqueta}</div>
                </div>
              </div>

              {clientesFiltrados.length === 0 ? (
                <p style={{ color: "#6b7280", margin: 0 }}>
                  No hay clientes registrados aún. Se crearán automáticamente al liquidar instalaciones.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "940px", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9", color: "#0f172a" }}>
                          <th style={{ textAlign: "left", padding: "10px" }}>Abonado</th>
                          <th style={{ textAlign: "left", padding: "10px" }}>DNI</th>
                          <th style={{ textAlign: "left", padding: "10px" }}>Celular</th>
                          <th style={{ textAlign: "left", padding: "10px" }}>Nodo</th>
                          <th style={{ textAlign: "left", padding: "10px" }}>Usuario PPPoE</th>
                          <th style={{ textAlign: "left", padding: "10px" }}>Plan</th>
                          <th style={{ textAlign: "left", padding: "10px" }}>Etiqueta</th>
                          <th style={{ textAlign: "center", padding: "10px" }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientesPaginados.map((cliente, idx) => (
                          <tr key={cliente.id || idx} style={{ borderTop: "1px solid #e5e7eb", background: idx % 2 === 0 ? "#ffffff" : "#fbfdff" }}>
                            <td style={{ padding: "10px" }}>
                              <div style={{ fontWeight: 700 }}>{cliente.nombre || "-"}</div>
                              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px" }}>{cliente.direccion || "-"}</div>
                              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px" }}>
                                {cliente.empresa || "-"} · {cliente.estado || "-"}
                              </div>
                            </td>
                            <td style={{ padding: "10px" }}>{cliente.dni || "-"}</td>
                            <td style={{ padding: "10px" }}>{cliente.celular || "-"}</td>
                            <td style={{ padding: "10px" }}>{cliente.nodo || "-"}</td>
                            <td style={{ padding: "10px" }}>{cliente.usuarioNodo || "-"}</td>
                            <td style={{ padding: "10px" }}>{cliente.velocidad || "-"}</td>
                            <td style={{ padding: "10px" }}>{cliente.codigoEtiqueta || "-"}</td>
                            <td style={{ padding: "10px", textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                                <button
                                  onClick={() => void abrirDetalleCliente(cliente)}
                                  style={{ ...infoButton, padding: "8px 12px", borderRadius: "10px" }}
                                >
                                  Ver detalle
                                </button>
                                <button
                                  onClick={() => void abrirDiagnosticoRapidoCliente(cliente)}
                                  style={{
                                    ...secondaryButton,
                                    padding: "8px 12px",
                                    borderRadius: "10px",
                                    borderColor: "#86efac",
                                    color: "#166534",
                                    background: "#f0fdf4",
                                  }}
                                >
                                  MikroTik
                                </button>
                                {puedeGestionarSuspensionClientes ? (
                                  <>
                                    {!clienteEstaSuspendidoMikrotik(cliente) ? (
                                      <button
                                        onClick={() => void ejecutarAccionMikrotikCliente(cliente, "suspender")}
                                        style={{
                                          ...warningButton,
                                          padding: "8px 11px",
                                          borderRadius: "10px",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "6px",
                                        }}
                                        disabled={clienteMikrotikAccionLoading === "suspender"}
                                        title="Suspender servicio (address-list moroso_)"
                                      >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                          <rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
                                          <rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
                                        </svg>
                                        {clienteMikrotikAccionLoading === "suspender" ? "Suspendiendo..." : "Suspender"}
                                      </button>
                                    ) : null}
                                    {clienteEstaSuspendidoMikrotik(cliente) ? (
                                      <button
                                        onClick={() => void ejecutarAccionMikrotikCliente(cliente, "activar")}
                                        style={{
                                          ...secondaryButton,
                                          padding: "8px 11px",
                                          borderRadius: "10px",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "6px",
                                        }}
                                        disabled={clienteMikrotikAccionLoading === "activar"}
                                        title="Activar servicio (quitar de address-list moroso_)"
                                      >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                          <path d="M6 4.8C6 3.62 7.29 2.9 8.29 3.53L19.04 10.73C19.95 11.32 19.95 12.68 19.04 13.27L8.29 20.47C7.29 21.1 6 20.38 6 19.2V4.8Z" fill="currentColor" />
                                        </svg>
                                        {clienteMikrotikAccionLoading === "activar" ? "Activando..." : "Activar"}
                                      </button>
                                    ) : null}
                                  </>
                                ) : null}
                                <button
                                  onClick={() => crearOrdenDesdeCliente(cliente)}
                                  style={{ ...primaryButton, padding: "8px 12px", borderRadius: "10px" }}
                                >
                                  Crear orden
                                </button>
                                {esAdminSesion ? (
                                  <button
                                    onClick={() => void eliminarCliente(cliente)}
                                    style={{ ...dangerButton, padding: "8px 12px", borderRadius: "10px" }}
                                  >
                                    Eliminar
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      Página {clientesPagina} de {totalPaginasClientes}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        style={secondaryButton}
                        onClick={() => setClientesPagina((p) => Math.max(1, p - 1))}
                        disabled={clientesPagina <= 1}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        style={secondaryButton}
                        onClick={() => setClientesPagina((p) => Math.min(totalPaginasClientes, p + 1))}
                        disabled={clientesPagina >= totalPaginasClientes}
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

        {vistaActiva === "detalleCliente" && clienteSeleccionado && (
          <div style={{ display: "grid", gap: "24px" }}>
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Detalle del cliente</h2>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => void abrirDiagnosticoRapidoCliente(clienteSeleccionado)}
                    style={{
                      ...secondaryButton,
                      borderColor: "#86efac",
                      color: "#166534",
                      background: "#f0fdf4",
                    }}
                  >
                    Diagnóstico MikroTik
                  </button>
                  {puedeGestionarSuspensionClientes ? (
                    <>
                      {!clienteEstaSuspendidoMikrotik(clienteSeleccionado) ? (
                        <button
                          onClick={() => void ejecutarAccionMikrotikCliente(clienteSeleccionado, "suspender")}
                          style={warningButton}
                          disabled={clienteMikrotikAccionLoading === "suspender"}
                        >
                          {clienteMikrotikAccionLoading === "suspender" ? "Suspendiendo..." : "Suspender"}
                        </button>
                      ) : null}
                      {clienteEstaSuspendidoMikrotik(clienteSeleccionado) ? (
                        <button
                          onClick={() => void ejecutarAccionMikrotikCliente(clienteSeleccionado, "activar")}
                          style={secondaryButton}
                          disabled={clienteMikrotikAccionLoading === "activar"}
                        >
                          {clienteMikrotikAccionLoading === "activar" ? "Activando..." : "Activar"}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  <button onClick={() => crearOrdenDesdeCliente(clienteSeleccionado)} style={primaryButton}>
                    Crear orden (Incidencia)
                  </button>
                  {esAdminSesion ? (
                    <button onClick={() => void eliminarCliente(clienteSeleccionado)} style={dangerButton}>
                      Eliminar cliente
                    </button>
                  ) : null}
                  <button onClick={() => setVistaActiva("clientes")} style={secondaryButton}>
                    Volver
                  </button>
                </div>
              </div>

              {clienteMikrotikAccionInfo ? (
                <div
                  style={{
                    marginTop: "12px",
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

              <div style={{ display: "grid", gap: "8px", marginTop: "18px" }}>
                <div><strong>Código cliente:</strong> {clienteSeleccionado.codigoCliente || "-"}</div>
                <div><strong>DNI:</strong> {clienteSeleccionado.dni || "-"}</div>
                <div><strong>Nombre:</strong> {clienteSeleccionado.nombre || "-"}</div>
                <div><strong>Dirección:</strong> {clienteSeleccionado.direccion || "-"}</div>
                <div><strong>Celular:</strong> {clienteSeleccionado.celular || "-"}</div>
                <div><strong>Email:</strong> {clienteSeleccionado.email || "-"}</div>
                <div><strong>Contacto:</strong> {clienteSeleccionado.contacto || "-"}</div>
                <div><strong>Empresa:</strong> {clienteSeleccionado.empresa || "-"}</div>
                <div><strong>Plan:</strong> {clienteSeleccionado.velocidad || "-"}</div>
                <div><strong>Precio:</strong> {clienteSeleccionado.precioPlan || "-"}</div>
                <div><strong>Nodo:</strong> {clienteSeleccionado.nodo || "-"}</div>
                <div><strong>Usuario:</strong> {clienteSeleccionado.usuarioNodo || "-"}</div>
                <div><strong>Contraseña:</strong> {clienteSeleccionado.passwordUsuario || "-"}</div>
                <div><strong>Código etiqueta:</strong> {clienteSeleccionado.codigoEtiqueta || "-"}</div>
                <div><strong>Ubicación:</strong> {clienteSeleccionado.ubicacion || "-"}</div>
                <div><strong>Técnico:</strong> {clienteSeleccionado.tecnico || "-"}</div>
                <div><strong>Autor:</strong> {clienteSeleccionado.autorOrden || "-"}</div>
                <div><strong>Descripción:</strong> {clienteSeleccionado.descripcion || "-"}</div>
                <div><strong>Registrado:</strong> {clienteSeleccionado.fechaRegistro || "-"}</div>
                <div><strong>Última actualización:</strong> {clienteSeleccionado.ultimaActualizacion || "-"}</div>
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Fotos del cliente</h2>

              <div style={{ marginBottom: "18px" }}>
                <div style={{ fontWeight: "700", marginBottom: "10px" }}>Foto de fachada</div>
                {clienteSeleccionado.fotoFachada ? (
                  <button
                    onClick={() => abrirFotoZoom(clienteSeleccionado.fotoFachada, "Foto de fachada")}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "zoom-in",
                    }}
                    title="Ver grande"
                  >
                    <img
                      src={clienteSeleccionado.fotoFachada}
                      alt="Fachada cliente"
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
                  <p style={{ margin: 0, color: "#6b7280" }}>No hay foto de fachada registrada.</p>
                )}
              </div>

              <div>
                <div style={{ fontWeight: "700", marginBottom: "10px" }}>Fotos de liquidación</div>
                {(clienteSeleccionado.fotosLiquidacion || []).length === 0 ? (
                  <p style={{ margin: 0, color: "#6b7280" }}>No hay fotos de liquidación registradas.</p>
                ) : (
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {clienteSeleccionado.fotosLiquidacion.map((foto, idx) => (
                      <button
                        key={idx}
                        onClick={() => abrirFotoZoom(foto, `Foto liquidación ${idx + 1}`)}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          cursor: "zoom-in",
                        }}
                        title="Ver grande"
                      >
                        <img
                          src={foto}
                          alt={`cliente-foto-${idx}`}
                          style={{
                            width: "100px",
                            height: "100px",
                            objectFit: "cover",
                            borderRadius: "10px",
                            border: "1px solid #e5e7eb",
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Historial de instalaciones</h2>

              {(clienteSeleccionado.historialInstalaciones || []).length === 0 ? (
                <p style={{ margin: 0, color: "#6b7280" }}>Sin historial registrado.</p>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {clienteSeleccionado.historialInstalaciones.map((hist) => (
                    <div
                      key={hist.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        padding: "12px",
                        background: "#fafafa",
                      }}
                    >
                      <div><strong>Orden:</strong> {hist.codigoOrden || "-"}</div>
                      <div><strong>Fecha:</strong> {hist.fechaLiquidacion || "-"}</div>
                      <div><strong>Tipo:</strong> {hist.tipoActuacion || "-"}</div>
                      <div><strong>Resultado:</strong> {hist.resultadoFinal || "-"}</div>
                      <div><strong>Técnico:</strong> {hist.tecnico || "-"}</div>
                      <div><strong>Código etiqueta:</strong> {hist.codigoEtiqueta || "-"}</div>
                      <div><strong>Observación:</strong> {hist.observacionFinal || "-"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Equipos instalados / historial de equipos</h2>

              {(clienteSeleccionado.equiposHistorial || []).length === 0 ? (
                <p style={{ margin: 0, color: "#6b7280" }}>No hay equipos asociados a este cliente.</p>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {clienteSeleccionado.equiposHistorial.map((eq, idx) => (
                    <div
                      key={eq.id || idx}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        padding: "12px",
                        background: "#fafafa",
                      }}
                    >
                      <div><strong>Tipo:</strong> {eq.tipo || "-"}</div>
                      <div><strong>Marca / Modelo:</strong> {eq.marca || "-"} {eq.modelo || ""}</div>
                      <div><strong>Código QR:</strong> {eq.codigo || "-"}</div>
                      <div><strong>Serial / MAC:</strong> {eq.serial || "-"}</div>
                      <div><strong>Acción:</strong> {eq.accion || "-"}</div>
                      <div><strong>Fecha:</strong> {eq.fecha || "-"}</div>
                      <div><strong>Orden:</strong> {eq.codigoOrden || "-"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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

        {vistaActiva === "liquidar" && ordenEnLiquidacion && (
          <div style={{ display: "grid", gap: "24px" }}>
            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>
                {liquidacionEditandoId ? "Editar liquidación" : "Liquidar orden"}
              </h2>

              <div style={{ display: "grid", gap: "8px", marginBottom: "20px" }}>
                <div><strong>Código:</strong> {ordenEnLiquidacion.codigo}</div>
                <div><strong>Cliente:</strong> {ordenEnLiquidacion.nombre}</div>
                <div><strong>Dirección:</strong> {ordenEnLiquidacion.direccion}</div>
                <div><strong>Tipo:</strong> {ordenEnLiquidacion.tipoActuacion}</div>
              </div>

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
                  <label style={labelStyle}>Código etiqueta</label>
                  <input
                    style={inputStyle}
                    value={liquidacion.codigoEtiqueta}
                    onChange={(e) => handleLiquidacionChange("codigoEtiqueta", e.target.value)}
                    placeholder="Ej. ETQ-0001"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Resultado final</label>
                  <select
                    style={inputStyle}
                    value={liquidacion.resultadoFinal}
                    onChange={(e) => handleLiquidacionChange("resultadoFinal", e.target.value)}
                  >
                    <option>Completada</option>
                    <option>Reprogramada</option>
                    <option>No se encontró al cliente</option>
                    <option>No viable</option>
                    <option>Pendiente por material</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Cobro realizado</label>
                  <select
                    style={inputStyle}
                    value={liquidacion.cobroRealizado}
                    onChange={(e) => handleLiquidacionChange("cobroRealizado", e.target.value)}
                  >
                    <option>SI</option>
                    <option>NO</option>
                  </select>
                </div>

                {liquidacion.cobroRealizado === "SI" && (
                  <>
                    <div>
                      <label style={labelStyle}>Monto cobrado</label>
                      <input
                        style={inputStyle}
                        value={liquidacion.montoCobrado}
                        onChange={(e) => handleLiquidacionChange("montoCobrado", e.target.value)}
                        placeholder="Monto cobrado"
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Medio de pago</label>
                      <select
                        style={inputStyle}
                        value={liquidacion.medioPago}
                        onChange={(e) => handleLiquidacionChange("medioPago", e.target.value)}
                      >
                        <option value="">Seleccionar</option>
                        <option>Efectivo</option>
                        <option>Yape</option>
                        <option>Plin</option>
                        <option>Transferencia</option>
                      </select>
                    </div>
                  </>
                )}

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
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Equipos con código</h2>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button onClick={agregarEquipo} style={secondaryButton}>
                    Agregar manual
                  </button>
                  <button
                    onClick={() => setMostrarScannerLiquidacion((prev) => !prev)}
                    style={infoButton}
                  >
                    Escanear QR
                  </button>
                </div>
              </div>

              <div style={{ ...formGridStyle, marginBottom: "14px" }}>
                <div>
                  <label style={labelStyle}>Código QR manual (opcional)</label>
                  <input
                    style={inputStyle}
                    value={liquidacion.codigoQRManual}
                    onChange={(e) => handleLiquidacionChange("codigoQRManual", e.target.value)}
                    placeholder="Escanea o pega QR (si no tiene QR, usa Agregar manual)"
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
                  <label style={labelStyle}>Equipos asignados al técnico</label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {equiposDisponiblesParaSeleccionManual.map((eq) => (
                      <button
                        key={eq.id}
                        onClick={() => agregarEquipoDesdeCatalogoALiquidacion(eq.codigoQR)}
                        style={secondaryButton}
                      >
                        {eq.tipo} · {eq.codigoQR}
                      </button>
                    ))}
                  </div>
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
              <h2 style={sectionTitleStyle}>Fotos de liquidación</h2>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={cargarFotosLiquidacion}
                disabled={liquidacion.fotos.length >= 5}
              />

              <div style={{ marginTop: "10px", fontSize: "13px", color: "#6b7280" }}>
                Fotos cargadas: {liquidacion.fotos.length}/5
              </div>

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
              <button onClick={guardarLiquidacion} style={primaryButton}>
                {liquidacionEditandoId ? "Guardar cambios" : "Guardar liquidación"}
              </button>
              <button onClick={() => setVistaActiva("pendientes")} style={secondaryButton}>
                Cancelar
              </button>
            </div>
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
  const parsed = parseJsonArrayFlexible(rawAccesos)
    .map((x) => String(x || "").trim())
    .filter((x) => validKeys.has(x));
  if (!parsed.length) return [...defaults];
  const setParsed = new Set(parsed);
  return MENU_VISTAS_WEB.map((item) => item.key).filter((k) => setParsed.has(k));
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







