import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { MATERIAL_CODE_NAME_MAP } from "../src/app/materialCodeMap.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CSV_BASEDATA =
  process.env.CSV_BASEDATA || "C:\\Users\\ASUS\\Downloads\\Generar Orden (respuestas) - BaseData.csv";
const CSV_LIQUIDACIONES =
  process.env.CSV_LIQUIDACIONES || "C:\\Users\\ASUS\\Downloads\\Liquidar APP - Liquidaciones.csv";
const CSV_DETALLE =
  process.env.CSV_DETALLE || "C:\\Users\\ASUS\\Downloads\\Liquidar APP - DetalleLiquidacion.csv";
const CSV_ONUS =
  process.env.CSV_ONUS || "C:\\Users\\ASUS\\Downloads\\Liquidar APP - ONUsRegistradas (1).csv";
const CSV_ARTICULOS =
  process.env.CSV_ARTICULOS || "C:\\Users\\ASUS\\Downloads\\Liquidar APP - ARTICULOS.csv";
const APPSHEET_APP_NAME = String(process.env.APPSHEET_APP_NAME || "Actuaciones02-637142196").trim();
const APPSHEET_LIQ_TABLE = String(process.env.APPSHEET_LIQ_TABLE || "Liquidaciones").trim();

const PAGE_SIZE = 1000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan variables SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalizeKey = (value) =>
  String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const parseCsvText = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows.shift().map((h) => String(h || "").replace(/^\uFEFF/, "").trim());
  return rows
    .filter((r) => r.some((v) => String(v || "").trim() !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = idx < r.length ? String(r[idx] || "").trim() : "";
      });
      return obj;
    });
};

const readCsv = async (filePath) => {
  const abs = path.resolve(filePath);
  const raw = await fs.readFile(abs, "utf8");
  const rows = parseCsvText(raw);
  return rows;
};

const rowIndex = (row = {}) => {
  const map = new Map();
  Object.entries(row || {}).forEach(([k, v]) => {
    const nk = normalizeKey(k);
    if (!nk || map.has(nk)) return;
    map.set(nk, String(v ?? "").trim());
  });
  return map;
};

const pick = (idx, aliases = [], fallback = "") => {
  for (const alias of aliases) {
    const nk = normalizeKey(alias);
    if (!nk || !idx.has(nk)) continue;
    const value = String(idx.get(nk) || "").trim();
    if (value !== "") return value;
  }
  return fallback;
};

const parseNumberFlex = (value, fallback = 0) => {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  let cleaned = raw.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return fallback;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    cleaned = cleaned.replace(",", ".");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
};

const parseDateTimeIso = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
  const m = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const hh = Number(m[4] || 0);
  const mm = Number(m[5] || 0);
  const ss = Number(m[6] || 0);
  const dt = new Date(Date.UTC(year, month - 1, day, hh, mm, ss));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
};

const parseDateOnly = (value) => {
  const iso = parseDateTimeIso(value);
  return iso ? iso.slice(0, 10) : null;
};

const parseTimeOnly = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/(\d{1,2}):(\d{2})(?:\s*([ap]m))?/i);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ampm = String(m[3] || "").toLowerCase();
  if (ampm === "pm" && hh < 12) hh += 12;
  if (ampm === "am" && hh === 12) hh = 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
};

const toSiNo = (value, fallback = "NO") => {
  const t = normalizeText(value);
  if (!t) return fallback;
  if (["si", "s", "yes", "y", "true", "1"].includes(t)) return "SI";
  if (["no", "n", "false", "0"].includes(t)) return "NO";
  return fallback;
};

const estadoOrdenDb = (value) => {
  const t = normalizeText(value);
  if (!t) return "Pendiente";
  if (t.includes("liquid") || t.includes("finaliz") || t.includes("complet") || t.includes("cerrad")) {
    return "Liquidada";
  }
  return "Pendiente";
};
const estadoEquipoDb = (value = "", fallback = "almacen") => {
  const t = normalizeText(value);
  if (!t) return fallback;
  if (t.includes("liquid") || t.includes("instalad") || t.includes("usad")) return "instalado";
  if (t.includes("asign")) return "asignado";
  if (t.includes("almacen") || t.includes("dispon") || t.includes("libre")) return "almacen";
  return fallback;
};

const getMissingColumnFromError = (error) => {
  const msg = String(error?.message || "");
  const m = msg.match(/column\s+["']?([a-zA-Z0-9_]+)["']?\s+does not exist/i);
  return m ? String(m[1] || "").trim() : "";
};

const normalizePathPhoto = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const filePath = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
  return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(
    APPSHEET_APP_NAME
  )}&tableName=${encodeURIComponent(APPSHEET_LIQ_TABLE)}&fileName=${encodeURIComponent(filePath)}`;
};

const getPhotoUrlsFromRow = (row = {}) => {
  const urls = [];
  Object.entries(row || {}).forEach(([k, v]) => {
    const nk = normalizeKey(k);
    if (!nk.includes("foto") && !nk.includes("img") && !nk.includes("firma")) return;
    const value = String(v || "").trim();
    if (!value) return;
    const items = value
      .split(",")
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    items.forEach((it) => urls.push(normalizePathPhoto(it)));
  });
  return Array.from(new Set(urls.filter(Boolean)));
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const fetchAll = async (table, select, orderBy = "id", ascending = false) => {
  const rows = [];
  for (let page = 0; page < 300; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const res = await supabase.from(table).select(select).order(orderBy, { ascending }).range(from, to);
    if (res.error) return { data: null, error: res.error };
    const pageRows = Array.isArray(res.data) ? res.data : [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
};

const missingByTable = new Map();

const filterPayload = (table, payload) => {
  const missing = missingByTable.get(table) || new Set();
  const out = {};
  Object.entries(payload || {}).forEach(([k, v]) => {
    if (missing.has(k)) return;
    out[k] = v;
  });
  return out;
};

const registerMissingColumn = (table, column) => {
  if (!column) return;
  if (!missingByTable.has(table)) missingByTable.set(table, new Set());
  missingByTable.get(table).add(column);
  console.warn(`WARN ${table}: columna ausente "${column}", se omitira en reintentos.`);
};

const upsertOne = async (table, payload, onConflict, selectCols = "id") => {
  for (let i = 0; i < 20; i += 1) {
    const row = filterPayload(table, payload);
    const res = await supabase.from(table).upsert([row], { onConflict }).select(selectCols).single();
    if (!res.error) return { data: res.data, error: null };
    const col = getMissingColumnFromError(res.error);
    if (col && Object.prototype.hasOwnProperty.call(row, col)) {
      registerMissingColumn(table, col);
      continue;
    }
    return { data: null, error: res.error };
  }
  return { data: null, error: new Error(`No se pudo upsert en ${table} por columnas faltantes.`) };
};

const insertOne = async (table, payload, selectCols = "id") => {
  for (let i = 0; i < 20; i += 1) {
    const row = filterPayload(table, payload);
    const res = await supabase.from(table).insert([row]).select(selectCols).single();
    if (!res.error) return { data: res.data, error: null };
    const col = getMissingColumnFromError(res.error);
    if (col && Object.prototype.hasOwnProperty.call(row, col)) {
      registerMissingColumn(table, col);
      continue;
    }
    return { data: null, error: res.error };
  }
  return { data: null, error: new Error(`No se pudo insertar en ${table} por columnas faltantes.`) };
};

const insertMany = async (table, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return { error: null };
  const parts = chunk(rows, 300);
  for (const part of parts) {
    let current = part.map((r) => filterPayload(table, r));
    for (let i = 0; i < 20; i += 1) {
      const res = await supabase.from(table).insert(current);
      if (!res.error) break;
      const col = getMissingColumnFromError(res.error);
      if (!col) return { error: res.error };
      registerMissingColumn(table, col);
      current = current.map((r) => {
        const cp = { ...r };
        delete cp[col];
        return cp;
      });
      if (i === 19) return { error: res.error };
    }
  }
  return { error: null };
};

const buildArticuloLookup = async () => {
  const nameByCode = new Map(
    Object.entries(MATERIAL_CODE_NAME_MAP || {}).map(([k, v]) => [String(k || "").trim().toUpperCase(), String(v || "").trim()])
  );
  const priceByCode = new Map();
  try {
    const exists = await fs
      .access(CSV_ARTICULOS)
      .then(() => true)
      .catch(() => false);
    if (!exists) return { nameByCode, priceByCode };
    const rows = await readCsv(CSV_ARTICULOS);
    rows.forEach((row) => {
      const idx = rowIndex(row);
      const code = String(pick(idx, ["ID_ARTICULO", "Codigo", "Code"])).trim().toUpperCase();
      if (!code) return;
      const name = String(pick(idx, ["NOMBRE", "Nombre", "Descripcion"])).trim();
      if (name) nameByCode.set(code, name);
      const price = parseNumberFlex(pick(idx, ["PrecioUnitario", "Precio", "Costo"]), NaN);
      if (Number.isFinite(price)) priceByCode.set(code, Number(price));
    });
  } catch (e) {
    console.warn("WARN No se pudo leer CSV_ARTICULOS:", e?.message || e);
  }
  return { nameByCode, priceByCode };
};

const run = async () => {
  console.log("== Migracion AppSheet CSV -> Supabase ==");
  console.log(`CSV_BASEDATA: ${CSV_BASEDATA}`);
  console.log(`CSV_LIQUIDACIONES: ${CSV_LIQUIDACIONES}`);
  console.log(`CSV_DETALLE: ${CSV_DETALLE}`);
  console.log(`CSV_ONUS: ${CSV_ONUS}`);

  const [rowsBase, rowsLiq, rowsDet, rowsOnu] = await Promise.all([
    readCsv(CSV_BASEDATA),
    readCsv(CSV_LIQUIDACIONES),
    readCsv(CSV_DETALLE),
    readCsv(CSV_ONUS),
  ]);
  const { nameByCode, priceByCode } = await buildArticuloLookup();
  console.log(
    `Leido CSVs: base=${rowsBase.length}, liquidaciones=${rowsLiq.length}, detalle=${rowsDet.length}, onus=${rowsOnu.length}, articulos=${nameByCode.size}`
  );

  const resumen = {
    onus: { ok: 0, fail: 0, skip: 0 },
    ordenes: { ok: 0, fail: 0, skip: 0 },
    liquidaciones: { ok: 0, fail: 0, skipSinCodigo: 0, omitidasExistentes: 0 },
    materiales: { ok: 0, fail: 0 },
    equiposLiq: { ok: 0, fail: 0 },
    fotos: { ok: 0, fail: 0 },
  };

  // 1) ONUs registradas -> equipos_catalogo (por codigo_qr)
  for (const row of rowsOnu) {
    const idx = rowIndex(row);
    const codigoQr = String(pick(idx, ["IDONU", "Codigo QR", "CodigoONU", "Codigo"])).trim();
    if (!codigoQr) {
      resumen.onus.skip += 1;
      continue;
    }
    const productoCode = String(pick(idx, ["Producto"])).trim().toUpperCase();
    const productoNombre = String(nameByCode.get(productoCode) || productoCode || "ONU").trim();
    const tecnico = String(pick(idx, ["TecnicoAsignado", "TecnAsig", "TécnicoAsignado"])).trim();
    const fechaLiq = parseDateTimeIso(pick(idx, ["FechaLiquidacion"]));
    const estadoRaw = pick(idx, ["Estado", "Estado ONU", "EstadoEquipo", "Estado Equipo", "Estatus", "Situacion"]);
    const estadoFallback = fechaLiq ? "instalado" : tecnico ? "asignado" : "almacen";
    const estado = estadoEquipoDb(estadoRaw, estadoFallback);
    const payload = {
      empresa: String(pick(idx, ["Empresa"], "Americanet")).trim() || "Americanet",
      tipo: "ONU",
      marca: "",
      modelo: productoNombre,
      precio_unitario: Number.isFinite(priceByCode.get(productoCode)) ? Number(priceByCode.get(productoCode)) : 0,
      codigo_qr: codigoQr,
      serial_mac: String(pick(idx, ["MAC"])).trim() || null,
      foto_referencia: normalizePathPhoto(pick(idx, ["FotoEtiqueta", "Foto02"])) || null,
      estado,
      tecnico_asignado: tecnico || null,
      cliente_dni: String(pick(idx, ["DNI"])).trim() || null,
      cliente_nombre: String(pick(idx, ["NombreCliente"])).trim() || null,
      orden_codigo: null,
      fecha_ultima_instalacion: fechaLiq,
    };
    const res = await upsertOne("equipos_catalogo", payload, "codigo_qr", "id,codigo_qr");
    if (res.error) {
      resumen.onus.fail += 1;
      console.error(`ERROR ONU ${codigoQr}:`, res.error?.message || res.error);
    } else {
      resumen.onus.ok += 1;
    }
  }

  const eqRes = await fetchAll(
    "equipos_catalogo",
    "id,codigo_qr,serial_mac,marca,modelo,foto_referencia,empresa,precio_unitario",
    "id",
    false
  );
  if (eqRes.error) throw eqRes.error;
  const equipoByQr = new Map(
    (eqRes.data || [])
      .map((r) => [String(r?.codigo_qr || "").trim().toUpperCase(), r])
      .filter(([qr]) => Boolean(qr))
  );

  // 2) Ordenes base -> ordenes (upsert por codigo)
  for (const row of rowsBase) {
    const idx = rowIndex(row);
    const codigo = String(pick(idx, ["Orden ID", "OrdenID", "Codigo"])).trim();
    const dni = String(pick(idx, ["DNI"])).trim();
    const nombre = String(pick(idx, ["Nombre"])).trim();
    const direccion = String(pick(idx, ["Direccion", "Dirección"])).trim();
    const tipoActuacion = String(pick(idx, ["Tipo de actuacion", "Tipo de actuación", "Actuacion"])).trim();
    if (!codigo || !dni || !nombre || !direccion) {
      resumen.ordenes.skip += 1;
      continue;
    }
    const payload = {
      empresa: String(pick(idx, ["Empresa"], "Americanet")).trim() || "Americanet",
      codigo,
      generar_usuario: "SI",
      orden_tipo: "ORDEN DE SERVICIO",
      tipo_actuacion: tipoActuacion || "Instalacion Internet",
      fecha_actuacion: parseDateOnly(pick(idx, ["Fecha para la actuacion", "Fecha para la actuación"])) || null,
      hora: parseTimeOnly(pick(idx, ["HoraR", "Hora"])),
      estado: estadoOrdenDb(pick(idx, ["Estado", "Estado de Liquidacion"])),
      prioridad: "Normal",
      dni,
      nombre,
      direccion,
      celular: String(pick(idx, ["Celular", "CelNot", "NumeroT"])).trim() || null,
      email: String(pick(idx, ["Email", "Direccion de correo electronico", "Dirección de correo electrónico"])).trim() || null,
      contacto: null,
      velocidad: String(pick(idx, ["Velocidad"])).trim() || null,
      precio_plan: parseNumberFlex(pick(idx, ["PrecioPlan", "PrecioActuacion"]), 0),
      nodo: String(pick(idx, ["Elegir Nodo", "Nodo"])).trim() || null,
      usuario_nodo: String(pick(idx, ["Usuario PPoe New", "Usuario PPoe", "UserPPoe"])).trim() || null,
      password_usuario: null,
      sn_onu: String(pick(idx, ["Serial ONU"])).trim() || null,
      ubicacion: String(pick(idx, ["Ubicacion Domicilio", "Ubicacion de Tecnico"])).trim() || null,
      descripcion: String(
        pick(idx, ["Descripcion Observaciones Plan etc", "Descripcion, Observaciones, Plan, etc", "Descripcion"])
      ).trim() || null,
      solicitar_pago: toSiNo(pick(idx, ["Solicitar Pago, Indicar Monto", "Solicitar Pago"], "NO"), "NO"),
      monto_cobrar: parseNumberFlex(pick(idx, ["Indicar Monto A Cobrar"]), 0),
      autor_orden: String(pick(idx, ["Nombre del Autor de la orden", "Autor"])).trim() || "Migracion AppSheet",
      tecnico: String(pick(idx, ["Tecnico Asignado", "TecnAsig", "Cuadrilla Asignada"])).trim() || null,
      fecha_creacion: parseDateTimeIso(pick(idx, ["Marca temporal"])) || new Date().toISOString(),
    };
    const res = await upsertOne("ordenes", payload, "codigo", "id,codigo");
    if (res.error) {
      resumen.ordenes.fail += 1;
      console.error(`ERROR ORDEN ${codigo}:`, res.error?.message || res.error);
    } else {
      resumen.ordenes.ok += 1;
    }
  }

  const ordRes = await fetchAll("ordenes", "id,codigo,dni,nombre", "id", false);
  if (ordRes.error) throw ordRes.error;
  const ordenByCodigo = new Map(
    (ordRes.data || [])
      .map((r) => [String(r?.codigo || "").trim(), r])
      .filter(([code]) => Boolean(code))
  );

  // Prepare detalle by orden
  const detalleByOrden = new Map();
  for (const row of rowsDet) {
    const idx = rowIndex(row);
    const ordenId = String(pick(idx, ["OrdenID", "Orden ID", "Codigo", "Orden"])).trim();
    if (!ordenId) continue;
    const list = detalleByOrden.get(ordenId) || [];
    list.push(row);
    detalleByOrden.set(ordenId, list);
  }

  // Existing liquidaciones to omit
  const existingLiqRes = await fetchAll("liquidaciones", "id,codigo", "id", false);
  if (existingLiqRes.error) throw existingLiqRes.error;
  const liqByCodigo = new Map(
    (existingLiqRes.data || [])
      .map((r) => [String(r?.codigo || "").trim(), Number(r?.id || 0)])
      .filter(([code, id]) => Boolean(code) && id > 0)
  );
  const existingCodes = new Set(liqByCodigo.keys());

  // 3) Liquidaciones + detalle/materiales + equipos por QR + fotos
  for (const row of rowsLiq) {
    const idx = rowIndex(row);
    const codigo = String(pick(idx, ["Orden ID", "OrdenID", "Codigo"])).trim();
    if (!codigo) {
      resumen.liquidaciones.skipSinCodigo += 1;
      continue;
    }
    if (existingCodes.has(codigo)) {
      resumen.liquidaciones.omitidasExistentes += 1;
      continue;
    }

    const tecnicoLiquida =
      String(pick(idx, ["Personal Tecnico", "Luis", "Cuadrilla"])).trim() || "NO ASIGNADO";
    const monto = parseNumberFlex(pick(idx, ["Monto", "Cost Orden", "Costo"]), 0);
    const medioPago = String(pick(idx, ["Metodo de pago", "Metodo pago"])).trim();
    const payloadLiq = {
      orden_original_id: Number(ordenByCodigo.get(codigo)?.id || 0) || null,
      codigo,
      empresa: String(pick(idx, ["Empresa"], "Americanet")).trim() || "Americanet",
      tipo_actuacion: String(pick(idx, ["Tipo de actuacion", "Actuacion"])).trim() || null,
      dni: String(pick(idx, ["DNI"])).trim() || null,
      nombre: String(pick(idx, ["Nombre"])).trim() || null,
      direccion: String(pick(idx, ["Direccion"])).trim() || null,
      celular: String(pick(idx, ["Celular"])).trim() || null,
      email: null,
      contacto: null,
      velocidad: null,
      precio_plan: parseNumberFlex(pick(idx, ["PrecioActuacion"]), 0),
      nodo: String(pick(idx, ["Nodo"])).trim() || null,
      usuario_nodo: String(pick(idx, ["User", "UserPPoe"])).trim() || null,
      password_usuario: null,
      ubicacion: String(pick(idx, ["Ubicacion GPS"])).trim() || null,
      descripcion: String(pick(idx, ["Observacion"])).trim() || null,
      autor_orden: String(pick(idx, ["Autor"])).trim() || "Migracion AppSheet",
      tecnico: String(pick(idx, ["Personal Tecnico", "Luis", "Cuadrilla"])).trim() || null,
      sn_onu: String(pick(idx, ["Serial ONU"])).trim() || null,
      tecnico_liquida: tecnicoLiquida,
      resultado_final: String(pick(idx, ["Estado"], "Completada")).trim() || "Completada",
      observacion_final: String(pick(idx, ["Observacion"])).trim() || null,
      cobro_realizado: monto > 0 || medioPago ? "SI" : "NO",
      monto_cobrado: monto,
      medio_pago: medioPago || null,
      codigo_etiqueta: String(pick(idx, ["Cable RG6"])).trim() || null,
      sn_onu_liquidacion: String(pick(idx, ["Serial ONU"])).trim() || null,
      estado: "Liquidada",
      fecha_liquidacion: parseDateTimeIso(pick(idx, ["Fecha2", "Fecha"])) || new Date().toISOString(),
    };

    const insLiq = await insertOne("liquidaciones", payloadLiq, "id,codigo,dni,nombre,tecnico_liquida,fecha_liquidacion");
    if (insLiq.error) {
      resumen.liquidaciones.fail += 1;
      console.error(`ERROR LIQ ${codigo}:`, insLiq.error?.message || insLiq.error);
      continue;
    }

    const liquidacionId = Number(insLiq.data?.id || 0);
    if (!liquidacionId) {
      resumen.liquidaciones.fail += 1;
      console.error(`ERROR LIQ ${codigo}: sin id devuelto.`);
      continue;
    }

    resumen.liquidaciones.ok += 1;
    existingCodes.add(codigo);
    liqByCodigo.set(codigo, liquidacionId);

    // Materiales
    const detalleRows = detalleByOrden.get(codigo) || [];
    const matRows = [];
    const eqRows = [];
    const eqUpdates = [];

    for (const det of detalleRows) {
      const didx = rowIndex(det);
      const prodCodeRaw = String(pick(didx, ["Producto", "Material", "Nombre"])).trim();
      const prodCode = prodCodeRaw.toUpperCase();
      const prodName = String(nameByCode.get(prodCode) || prodCodeRaw || "-").trim();
      const cantidad = parseNumberFlex(pick(didx, ["Cantidad"]), 0);
      const precioUnit = parseNumberFlex(pick(didx, ["PrecioUnitarioUsado", "Precio Unitario Usado"]), 0);
      const costoMaterial = parseNumberFlex(pick(didx, ["Costo Material", "CostoMaterial"]), 0);
      const nodo = String(pick(didx, ["Nodo"])).trim() || payloadLiq.nodo || null;
      matRows.push({
        liquidacion_id: liquidacionId,
        orden_codigo: codigo,
        source_id_liqui: String(pick(didx, ["IDLiqui", "ID Liq", "ID"])).trim() || null,
        material: prodName || "-",
        cantidad: Number.isFinite(cantidad) ? cantidad : 0,
        unidad: "unidad",
        codigo_onu: String(pick(didx, ["Codigo ONU", "CodigoONU"])).trim() || null,
        tipo: String(pick(didx, ["Tipo"])).trim() || null,
        precio_unitario_usado: Number.isFinite(precioUnit) ? precioUnit : 0,
        costo_material: Number.isFinite(costoMaterial) ? costoMaterial : 0,
        nodo,
      });

      const codigoQr = String(pick(didx, ["Codigo ONU", "CodigoONU"])).trim().toUpperCase();
      if (!codigoQr) continue;
      const eq = equipoByQr.get(codigoQr);
      if (!eq) continue;
      eqRows.push({
        liquidacion_id: liquidacionId,
        id_inventario: Number(eq?.id || 0) || null,
        tipo: "ONU",
        codigo: codigoQr,
        serial: String(eq?.serial_mac || "").trim() || null,
        accion: "INSTALADO",
        marca: String(eq?.marca || "").trim() || null,
        modelo: String(eq?.modelo || prodName || "").trim() || null,
        foto_referencia: String(eq?.foto_referencia || "").trim() || null,
        empresa: String(eq?.empresa || payloadLiq.empresa || "Americanet").trim(),
        precio_unitario: Number.isFinite(precioUnit) ? precioUnit : Number(eq?.precio_unitario || 0),
        costo_total:
          Number.isFinite(costoMaterial) && costoMaterial > 0
            ? costoMaterial
            : (Number.isFinite(precioUnit) ? precioUnit : 0) * (Number.isFinite(cantidad) ? cantidad : 0),
      });
      if (Number(eq?.id || 0) > 0) {
        eqUpdates.push({
          id: Number(eq.id),
          orden_codigo: codigo,
          tecnico_asignado: payloadLiq.tecnico_liquida || payloadLiq.tecnico || null,
          cliente_dni: payloadLiq.dni || null,
          cliente_nombre: payloadLiq.nombre || null,
          fecha_ultima_instalacion: payloadLiq.fecha_liquidacion,
        });
      }
    }

    if (matRows.length > 0) {
      const matRes = await insertMany("liquidacion_materiales", matRows);
      if (matRes.error) {
        resumen.materiales.fail += matRows.length;
        console.error(`ERROR MAT ${codigo}:`, matRes.error?.message || matRes.error);
      } else {
        resumen.materiales.ok += matRows.length;
      }
    }

    if (eqRows.length > 0) {
      const eqResIns = await insertMany("liquidacion_equipos", eqRows);
      if (eqResIns.error) {
        resumen.equiposLiq.fail += eqRows.length;
        console.error(`ERROR EQ-LIQ ${codigo}:`, eqResIns.error?.message || eqResIns.error);
      } else {
        resumen.equiposLiq.ok += eqRows.length;
      }
    }

    for (const upd of eqUpdates) {
      const resUpd = await supabase
        .from("equipos_catalogo")
        .update(filterPayload("equipos_catalogo", {
          orden_codigo: upd.orden_codigo,
          tecnico_asignado: upd.tecnico_asignado,
          cliente_dni: upd.cliente_dni,
          cliente_nombre: upd.cliente_nombre,
          fecha_ultima_instalacion: upd.fecha_ultima_instalacion,
        }))
        .eq("id", upd.id);
      if (resUpd.error) {
        const col = getMissingColumnFromError(resUpd.error);
        if (col) registerMissingColumn("equipos_catalogo", col);
      }
    }

    const fotos = getPhotoUrlsFromRow(row);
    if (fotos.length > 0) {
      const rowsFotos = fotos.map((foto) => ({ liquidacion_id: liquidacionId, foto_url: foto }));
      const fotoRes = await insertMany("liquidacion_fotos", rowsFotos);
      if (fotoRes.error) {
        resumen.fotos.fail += rowsFotos.length;
        console.error(`ERROR FOTOS ${codigo}:`, fotoRes.error?.message || fotoRes.error);
      } else {
        resumen.fotos.ok += rowsFotos.length;
      }
    }
  }

  console.log("\n== RESUMEN ==");
  console.log(`ONUs: ok=${resumen.onus.ok} fail=${resumen.onus.fail} skip=${resumen.onus.skip}`);
  console.log(`Ordenes: ok=${resumen.ordenes.ok} fail=${resumen.ordenes.fail} skip=${resumen.ordenes.skip}`);
  console.log(
    `Liquidaciones: ok=${resumen.liquidaciones.ok} fail=${resumen.liquidaciones.fail} omitidas_existentes=${resumen.liquidaciones.omitidasExistentes} skip_sin_codigo=${resumen.liquidaciones.skipSinCodigo}`
  );
  console.log(`Materiales: ok=${resumen.materiales.ok} fail=${resumen.materiales.fail}`);
  console.log(`Liquidacion equipos: ok=${resumen.equiposLiq.ok} fail=${resumen.equiposLiq.fail}`);
  console.log(`Fotos liquidacion: ok=${resumen.fotos.ok} fail=${resumen.fotos.fail}`);
  console.log("\nMigracion finalizada.");
};

run().catch((err) => {
  console.error("Fallo general de migracion:", err?.message || err);
  process.exit(1);
});
