import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";
import QRScanner from "./QRScanner";
import { LEGACY_TECH_CODE_MAP, normalizeTechCode } from "../app/techCodeMap";

const INVENTARIO_DEV_SOL_TABLE = "inventario_devolucion_solicitudes";
const INVENTARIO_ARTICULOS_TABLE = "inventario_articulos";
const norm = (v) => String(v || "").trim().toLowerCase();
const normRef = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const chunkList = (list = [], size = 200) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};
const personaKey = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const _tokenMatch = (a = "", b = "") => {
  const aKey = personaKey(a);
  const bKey = personaKey(b);
  if (!aKey || !bKey) return false;
  if (aKey === bKey || aKey.includes(bKey) || bKey.includes(aKey)) return true;
  const tokens = aKey.split(" ").filter((t) => t.length >= 4);
  return tokens.some((t) => bKey.includes(t));
};
const isLikelyTechCode = (value = "") => /^(AFS|AS|TEC|TECNICO|COD)-?[A-Z0-9-]*$/i.test(String(value || "").trim());
const estadoGrupo = (raw) => {
  const e = norm(raw);
  if (e.includes("liquid") || e.includes("instalad") || e.includes("usad")) return "liquidado";
  if (e.includes("asign")) return "asignado";
  if (!e || e.includes("almacen") || e.includes("dispon") || e.includes("libre")) return "almacen";
  return "otro";
};
const equipoNombre = (e) => `${e?.tipo || "-"} - ${e?.marca || "-"} ${e?.modelo || ""}`.trim();
const tableMissing = (table, error) => String(error?.message || "").toLowerCase().includes(`relation "${String(table || "").toLowerCase()}" does not exist`);
const columnMissing = (col, error) => String(error?.message || "").toLowerCase().includes(String(col || "").toLowerCase()) && String(error?.message || "").toLowerCase().includes("does not exist");
const getMissingColumnName = (message = "") => {
  const raw = String(message || "");
  const m1 = raw.match(/column\s+["']?([a-zA-Z0-9_.]+)["']?\s+does not exist/i);
  const m2 = raw.match(/could not find the ['"]([a-zA-Z0-9_.]+)['"] column/i);
  const col = String(m1?.[1] || m2?.[1] || "");
  if (!col) return "";
  return col.includes(".") ? col.split(".").pop() : col;
};
const escHtml = (v = "") => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const toText = (value = "") => String(value || "").trim();
const formatDateTimeLabel = (value = "") => {
  const raw = toText(value);
  if (!raw) return "-";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const DETALLE_CAMPOS_RESUMEN = 8;
const CATALOGO_PAGE_SIZE = 15;
const ARTICULOS_STORAGE_KEY = "@app_ordenes_web/inventario_articulos_v1";
const APPSHEET_APP_ID = String(import.meta.env.VITE_APPSHEET_APP_ID || "").trim();
const APPSHEET_ACCESS_KEY = String(import.meta.env.VITE_APPSHEET_ACCESS_KEY || "").trim();
const APPSHEET_APP_NAME = String(import.meta.env.VITE_APPSHEET_APP_NAME || "Actuaciones02-637142196").trim();
const APPSHEET_TABLE_NAME = String(import.meta.env.VITE_APPSHEET_TABLE_NAME || "Liquidaciones").trim();
const APPSHEET_TABLE_ONUS_REGISTRADAS = String(
  import.meta.env.VITE_APPSHEET_TABLE_ONUS_REGISTRADAS || "ONUsRegistradas"
).trim();
const SUPABASE_PROJECT_URL = String(
  import.meta.env.VITE_SUPABASE_URL || "https://vgwbqbzpjlbkmxtfghdm.supabase.co"
)
  .trim()
  .replace(/\/+$/, "");
const SUPABASE_PHOTO_BUCKETS = String(
  import.meta.env.VITE_SUPABASE_PHOTO_BUCKETS ||
    "liquidaciones,liquidacion-fotos,ordenes,orden-fotos,fotos,evidencias,public"
)
  .split(",")
  .map((x) => String(x || "").trim().toLowerCase())
  .filter(Boolean);
const isPlaceholderValue = (value) => {
  const v = norm(value);
  return !v || v === "-" || v === "--" || v === "n/a" || v === "na" || v === "sin" || v === "null" || v === "s/n";
};
const firstValue = (...values) => {
  for (const value of values) {
    const text = toText(value);
    if (text && !isPlaceholderValue(text)) return text;
  }
  return "";
};
const repararMojibakeLigero = (value = "") =>
  String(value || "")
    .replace(/ÃƒÆ’Ã‚Â¡/gi, "a")
    .replace(/ÃƒÆ’Ã‚Â©/gi, "e")
    .replace(/ÃƒÆ’Ã‚Â­/gi, "i")
    .replace(/ÃƒÆ’Ã‚Â³/gi, "o")
    .replace(/ÃƒÆ’Ã‚Âº/gi, "u")
    .replace(/ÃƒÆ’Ã‚Â±/gi, "n")
    .replace(/ÃƒÆ’Ã‚Â¼/gi, "u")
    .replace(/Ãƒâ€š/g, "");
const normalizarClaveAppSheet = (value) =>
  repararMojibakeLigero(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
const buildAppSheetRowIndex = (row = {}) => {
  const index = new Map();
  Object.entries(row || {}).forEach(([key, value]) => {
    const k = normalizarClaveAppSheet(key);
    if (!k || index.has(k)) return;
    index.set(k, value);
  });
  return index;
};
const getAppSheetValue = (index, aliases = [], fallback = "") => {
  if (!(index instanceof Map)) return fallback;
  for (const alias of aliases) {
    const keyNorm = normalizarClaveAppSheet(alias);
    if (!keyNorm || !index.has(keyNorm)) continue;
    const value = index.get(keyNorm);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
};
const dniKey = (value = "") => String(value || "").replace(/[^\d]/g, "");
const parseFechaAppSheetFlex = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (iso) {
    const yyyy = Number(iso[1] || 0);
    const mm = Number(iso[2] || 0);
    const dd = Number(iso[3] || 0);
    const hh = Number(iso[4] || 0);
    const mi = Number(iso[5] || 0);
    const ss = Number(iso[6] || 0);
    const parsedIso = new Date(yyyy, Math.max(0, mm - 1), dd, hh, mi, ss);
    return Number.isNaN(parsedIso.getTime()) ? 0 : parsedIso.getTime();
  }
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const a = Number(m[1] || 0);
    const b = Number(m[2] || 0);
    const yyyyRaw = Number(m[3] || 0);
    const yyyy = yyyyRaw < 100 ? 2000 + yyyyRaw : yyyyRaw;
    const hh = Number(m[4] || 0);
    const mi = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    let dd = b;
    let mm = a;
    if (a > 12 && b <= 12) {
      dd = a;
      mm = b;
    } else if (b > 12 && a <= 12) {
      dd = b;
      mm = a;
    }
    const parsed = new Date(yyyy, Math.max(0, mm - 1), dd, hh, mi, ss);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }
  const direct = new Date(raw);
  return Number.isNaN(direct.getTime()) ? 0 : direct.getTime();
};
const onuTimestampFromIndex = (idx) =>
  Math.max(
    parseFechaAppSheetFlex(getAppSheetValue(idx, ["FechaLiquidacion", "Fecha Liquidacion"])),
    parseFechaAppSheetFlex(getAppSheetValue(idx, ["Fecha de Asignacion", "FechaAsignacion", "Fecha Asignacion"])),
    parseFechaAppSheetFlex(getAppSheetValue(idx, ["FechaRegistro", "Fecha Registro", "Timestamp"]))
  );
const parseNumberFlex = (value, fallback = 0) => {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  let cleaned = raw.replace(/[^\d,.-]/g, "");
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
const obtenerFilasAppSheet = async (tableName, selectorExpr = "") => {
  const table = String(tableName || "").trim();
  if (!table) throw new Error("Tabla AppSheet no definida.");
  if (!APPSHEET_APP_ID || !APPSHEET_ACCESS_KEY) {
    throw new Error("Faltan credenciales AppSheet (VITE_APPSHEET_APP_ID / VITE_APPSHEET_ACCESS_KEY).");
  }
  const url = `https://www.appsheet.com/api/v2/apps/${encodeURIComponent(APPSHEET_APP_ID)}/tables/${encodeURIComponent(table)}/Action`;
  const selector = String(selectorExpr || "").trim() || `Filter(${table}, TRUE)`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45000);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ApplicationAccessKey: APPSHEET_ACCESS_KEY,
      },
      signal: controller.signal,
      body: JSON.stringify({
        Action: "Find",
        Properties: {
          Locale: "es-PE",
          Timezone: "America/Lima",
          Selector: selector,
        },
        Rows: [],
      }),
    });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("aborted")) {
      throw new Error(`AppSheet (${table}) tardo demasiado en responder (>45s).`);
    }
    throw new Error(`No se pudo conectar con AppSheet (${table}).`);
  } finally {
    window.clearTimeout(timeoutId);
  }
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok) {
    throw new Error(body?.message || body?.error || `AppSheet ${table} fallo (HTTP ${res.status}).`);
  }
  if (Array.isArray(body?.Rows)) return body.Rows;
  if (Array.isArray(body?.rows)) return body.rows;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
};
const parseCoordsText = (value = "") => {
  const raw = toText(value);
  if (!raw) return null;
  const parts = raw.split(",").map((item) => Number(String(item).trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return { lat: Number(parts[0]), lng: Number(parts[1]) };
};
const buildMapQuery = (ubicacion = "", direccion = "") => {
  const coords = parseCoordsText(ubicacion);
  if (coords) return `${coords.lat},${coords.lng}`;
  return firstValue(ubicacion, direccion);
};
const buildGoogleMapsUrl = (query = "") =>
  query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
const buildGoogleMapsEmbedUrl = (query = "") =>
  query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=17&output=embed` : "";
const buildAppSheetFileUrl = (path = "", tableName = APPSHEET_TABLE_NAME) => {
  const filePath = String(path || "").trim().replace(/\\/g, "/");
  if (!filePath) return "";
  if (/^https?:\/\//i.test(filePath)) return filePath;
  if (/^(data:image\/|blob:)/i.test(filePath)) return filePath;
  const table = String(tableName || APPSHEET_TABLE_NAME || "").trim() || APPSHEET_TABLE_NAME;
  return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(
    APPSHEET_APP_NAME
  )}&tableName=${encodeURIComponent(table)}&fileName=${encodeURIComponent(filePath)}`;
};
const normalizePhotoUrl = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(data:image\/|blob:)/i.test(raw)) return raw;
  const sanitized = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
  const withoutTablePrefix = sanitized.replace(/^[^/:\n]+::/, "");
  const looksLikeFilePath =
    withoutTablePrefix.includes("/") ||
    /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|svg|avif)$/i.test(withoutTablePrefix);
  return looksLikeFilePath ? buildAppSheetFileUrl(withoutTablePrefix) : raw;
};
const isPhotoUrl = (value) => /^(https?:\/\/|data:image\/)/i.test(String(value || "").trim());
const uniquePhotoInputs = (list) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
const extractPhotosFromAnyRecord = (record) => {
  if (!record || typeof record !== "object") return [];
  const photos = [];
  Object.entries(record).forEach(([key, value]) => {
    const k = norm(key);
    if (!k) return;
    const looksLikePhotoField =
      k.includes("foto") || k.includes("photo") || k.includes("captura") || k.includes("evidencia") || k.includes("imagen");
    if (!looksLikePhotoField) return;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        const n = normalizePhotoUrl(v);
        if (n) photos.push(n);
      });
      return;
    }
    const n = normalizePhotoUrl(value);
    if (n) photos.push(n);
  });
  return uniquePhotoInputs(photos);
};
const buildSupabasePhotoCandidates = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw || !SUPABASE_PROJECT_URL) return [];
  const sanitized = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
  const lower = sanitized.toLowerCase();
  const candidates = [];
  if (lower.startsWith("storage/v1/object/public/")) {
    candidates.push(`${SUPABASE_PROJECT_URL}/${sanitized}`);
  } else if (lower.startsWith("/storage/v1/object/public/")) {
    candidates.push(`${SUPABASE_PROJECT_URL}${sanitized}`);
  } else if (lower.startsWith("object/public/")) {
    candidates.push(`${SUPABASE_PROJECT_URL}/storage/v1/${sanitized}`);
  } else {
    const parts = sanitized.split("/").filter(Boolean);
    const bucket = String(parts[0] || "").toLowerCase();
    if (SUPABASE_PHOTO_BUCKETS.includes(bucket)) {
      candidates.push(`${SUPABASE_PROJECT_URL}/storage/v1/object/public/${sanitized}`);
    } else if (parts.length >= 1 && /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|svg|avif)$/i.test(sanitized)) {
      SUPABASE_PHOTO_BUCKETS.forEach((bucketName) => {
        candidates.push(`${SUPABASE_PROJECT_URL}/storage/v1/object/public/${bucketName}/${sanitized}`);
      });
    }
  }
  return Array.from(new Set(candidates.filter((x) => isPhotoUrl(x))));
};
const parseSupabaseStorageRefs = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const refs = [];
  const addRef = (bucket, path) => {
    const b = String(bucket || "").trim();
    const p = String(path || "").trim().replace(/^\/+/, "");
    if (!b || !p) return;
    refs.push({ bucket: b, path: p });
  };
  const parseByMarker = (text, marker) => {
    const idx = text.indexOf(marker);
    if (idx < 0) return false;
    const rest = text.slice(idx + marker.length).replace(/^\/+/, "");
    const q = rest.split("?")[0];
    const parts = q.split("/").filter(Boolean);
    if (parts.length < 2) return false;
    const bucket = decodeURIComponent(parts[0]);
    const path = decodeURIComponent(parts.slice(1).join("/"));
    addRef(bucket, path);
    return true;
  };
  const normalized = raw.replace(/\\/g, "/");
  parseByMarker(normalized, "/storage/v1/object/sign/");
  parseByMarker(normalized, "/storage/v1/object/public/");
  parseByMarker(normalized, "storage/v1/object/sign/");
  parseByMarker(normalized, "storage/v1/object/public/");
  parseByMarker(normalized, "/object/sign/");
  parseByMarker(normalized, "/object/public/");
  parseByMarker(normalized, "object/sign/");
  parseByMarker(normalized, "object/public/");

  const sanitized = normalized.replace(/^\.?\//, "");
  if (refs.length === 0) {
    const parts = sanitized.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const bucket = String(parts[0] || "").toLowerCase();
      const path = parts.slice(1).join("/");
      if (SUPABASE_PHOTO_BUCKETS.includes(bucket)) {
        addRef(bucket, path);
      }
    } else if (parts.length >= 1 && /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|svg|avif)$/i.test(sanitized)) {
      SUPABASE_PHOTO_BUCKETS.forEach((bucket) => addRef(bucket, sanitized));
    }
  }
  return Array.from(new Map(refs.map((ref) => [`${ref.bucket}/${ref.path}`, ref])).values());
};
const resolvePhotoCandidates = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const normalized = normalizePhotoUrl(raw);
  return Array.from(new Set([raw, normalized, ...buildSupabasePhotoCandidates(raw)].filter((x) => isPhotoUrl(x))));
};
const readImageAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
const emptyEq = { empresa: "Americanet", tipo: "", marca: "", modelo: "", precio: "", codigo: "", serial: "", foto: "" };
const emptyMat = { nombre: "", unidad: "unidad", costo: "", foto: "" };
const emptyAlmacenForm = { nombre: "", codigo: "", direccion: "", ubicacion: "", activo: true };
const emptyArt = { tipo: "", marca: "", modelo: "", descripcion: "", foto: "" };
const emptyAsigEq = { tecnico: "", equipoId: "" };
const emptyAsigMat = { tecnico: "", materialId: "", cantidad: "", unidad: "unidad" };
const materialKey = (materialId, unidad) => `${String(materialId || "").trim()}|${norm(unidad || "unidad")}`;
const materialRef = (materialId) => `MAT-${String(materialId || "").trim()}`;
const materialIdFromRef = (ref = "") => {
  const raw = String(ref || "").trim();
  if (!raw) return "";
  if (/^mat-/i.test(raw)) return raw.slice(4).trim();
  return "";
};
const uniqSorted = (values = []) =>
  Array.from(
    new Set(
      values
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
const lookupVariants = (value = "") =>
  uniqSorted([
    String(value || "").trim(),
    String(value || "").trim().toUpperCase(),
    String(value || "").trim().toLowerCase(),
  ]).filter((v) => !isPlaceholderValue(v));
const articuloKey = (item) =>
  `${norm(item?.tipo)}|${norm(item?.marca)}|${norm(item?.modelo)}`;
const normalizarArticulo = (row) => ({
  id: String(row?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  tipo: String(row?.tipo || "").trim(),
  marca: String(row?.marca || "").trim(),
  modelo: String(row?.modelo || "").trim(),
  descripcion: String(row?.descripcion || row?.detalle || "").trim(),
  foto: String(row?.foto || row?.foto_referencia || "").trim(),
});
const buildEquipoLiquidacionResumen = ({ equipo, relacion, liquidacion, orden }) => {
  const ubicacion = firstValue(orden?.ubicacion, liquidacion?.ubicacion);
  const direccion = firstValue(orden?.direccion, liquidacion?.direccion);
  const mapQuery = buildMapQuery(ubicacion, direccion);
  return {
    codigoOrden: firstValue(orden?.codigo, liquidacion?.codigo_orden, liquidacion?.codigo),
    cliente: firstValue(orden?.nombre, liquidacion?.nombre),
    nodo: firstValue(orden?.nodo, liquidacion?.nodo),
    tecnico: firstValue(liquidacion?.tecnico_liquida, liquidacion?.tecnico, orden?.tecnico),
    estado: firstValue(liquidacion?.estado),
    fecha: formatDateTimeLabel(firstValue(liquidacion?.fecha_liquidacion, liquidacion?.created_at)),
    ubicacion,
    direccion,
    mapaUrl: buildGoogleMapsUrl(mapQuery),
    qrRelacionado: firstValue(relacion?.codigo, equipo?.codigo),
    serialRelacionado: firstValue(relacion?.serial, equipo?.serial),
  };
};
const readArticulosLocal = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = String(window.localStorage.getItem(ARTICULOS_STORAGE_KEY) || "").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizarArticulo).filter((x) => x.tipo && x.marca && x.modelo);
  } catch {
    return [];
  }
};
const saveArticulosLocal = (list = []) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ARTICULOS_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  } catch {
    // Ignorar error de storage.
  }
};
function InventoryPhotoThumbInner({ photo, index, onPreview }) {
  const [signedCandidates, setSignedCandidates] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const refs = parseSupabaseStorageRefs(photo);
    if (!refs.length) {
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const signed = [];
      for (const ref of refs) {
        try {
          const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 3600);
          if (error) continue;
          const signedUrl = String(data?.signedUrl || "").trim();
          if (!signedUrl) continue;
          if (/^https?:\/\//i.test(signedUrl)) {
            signed.push(signedUrl);
          } else if (SUPABASE_PROJECT_URL) {
            signed.push(`${SUPABASE_PROJECT_URL}${signedUrl.startsWith("/") ? "" : "/"}${signedUrl}`);
          }
        } catch {
          // Ignorar error por bucket privado/no existente.
        }
      }
      if (!cancelled) setSignedCandidates(Array.from(new Set(signed.filter((x) => isPhotoUrl(x)))));
    })();
    return () => {
      cancelled = true;
    };
  }, [photo]);
  const candidates = useMemo(() => Array.from(new Set([...resolvePhotoCandidates(photo), ...signedCandidates])), [photo, signedCandidates]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = candidates[candidateIndex] || "";
  if (!src || failed) return null;
  return (
    <button
      type="button"
      className="inv-thumb inv-thumb-btn"
      onClick={() => {
        if (typeof onPreview === "function") {
          onPreview(String(src));
          return;
        }
        window.open(String(src), "_blank", "noopener,noreferrer");
      }}
    >
      <img
        src={String(src)}
        alt={`cat-det-foto-${index + 1}`}
        onError={() => {
          setCandidateIndex((prev) => {
            const next = prev + 1;
            if (next >= candidates.length) {
              setFailed(true);
              return prev;
            }
            return next;
          });
        }}
      />
    </button>
  );
}

function InventoryPhotoThumb(props) {
  const photoKey = String(props?.photo || "");
  return <InventoryPhotoThumbInner key={photoKey} {...props} />;
}

export default function InventarioPanel({ initialTab = "catalogo", sessionUser = null }) {
  const esTecnico = initialTab === "stockTecnico" || norm(sessionUser?.rol) === "tecnico";
  const tabs = useMemo(() => {
    return esTecnico ? ["stockTecnico", "movimientos", "recogidos"] : ["registro", "asignaciones", "articulos", "catalogo", "movimientos", "almacenes"];
  }, [esTecnico]);
  const [tab, setTab] = useState(() => {
    const base = String(initialTab || "").trim();
    if (esTecnico) return base === "movimientos" ? "movimientos" : "stockTecnico";
    if (base === "materiales") return "articulos";
    if (base === "almacenes") return "almacenes";
    return ["registro", "asignaciones", "articulos", "catalogo", "movimientos", "almacenes"].includes(base) ? base : "registro";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstadoCatalogo, setFiltroEstadoCatalogo] = useState("TODOS");
  const [catalogoOrden, _setCatalogoOrden] = useState("NUEVOS");
  const [catalogoPagina, setCatalogoPagina] = useState(1);
  const [filtroEstadoStockTecnico, setFiltroEstadoStockTecnico] = useState("ASIGNADO");
  const [tecnicoFiltro, setTecnicoFiltro] = useState("");
  const [fotoMaterialDisponible, setFotoMaterialDisponible] = useState(true);
  const [equipos, setEquipos] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [materialesAsig, setMaterialesAsig] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [almacenesDisponibles, setAlmacenesDisponibles] = useState(true);
  const [almacenBusqueda, setAlmacenBusqueda] = useState("");
  const [almacenForm, setAlmacenForm] = useState({ ...emptyAlmacenForm });
  const [almacenEditId, setAlmacenEditId] = useState("");
  const [almacenEqId, setAlmacenEqId] = useState("");
  const [almacenMatId, setAlmacenMatId] = useState("");
  const [almacenMovId, setAlmacenMovId] = useState("");
  const [eqForm, setEqForm] = useState(emptyEq);
  const [matForm, setMatForm] = useState(emptyMat);
  const [asigEq, setAsigEq] = useState(emptyAsigEq);
  const [asigMat, setAsigMat] = useState(emptyAsigMat);
  const [asigEqCodigo, setAsigEqCodigo] = useState("");
  const [qrRegistroMsg, setQrRegistroMsg] = useState("");
  const [qrAsignacionMsg, setQrAsignacionMsg] = useState("");
  const [ingresoMat, setIngresoMat] = useState({ materialId: "", cantidad: "", unidad: "unidad", costo: "" });
  const [articulos, setArticulos] = useState(() => readArticulosLocal());
  const [articulosEnSupabase, setArticulosEnSupabase] = useState(false);
  const [artForm, setArtForm] = useState(() => ({ ...emptyArt }));
  const [artEditId, setArtEditId] = useState("");
  const [registroSubTab, setRegistroSubTab] = useState("equipos");
  const [articulosSubTab, setArticulosSubTab] = useState(() =>
    String(initialTab || "").trim() === "materiales" ? "materialesCatalogo" : "equipos"
  );
  const [articuloRegistroId, setArticuloRegistroId] = useState("");
  const [articulosMsg, setArticulosMsg] = useState("");
  const [eqPendReg, setEqPendReg] = useState([]);
  const [eqPendAsig, setEqPendAsig] = useState([]);
  const [matPendAsig, setMatPendAsig] = useState([]);
  const [scanEqReg, setScanEqReg] = useState(false);
  const [scanEqAsig, setScanEqAsig] = useState(false);
  const [solicitudesDevolucion, setSolicitudesDevolucion] = useState([]);
  const [solicitudesDisponibles, setSolicitudesDisponibles] = useState(true);
  const [solicitudProcesandoId, setSolicitudProcesandoId] = useState("");
  const [catalogoDetVisible, setCatalogoDetVisible] = useState(false);
  const [catalogoDetLoading, setCatalogoDetLoading] = useState(false);
  const [catalogoDetError, setCatalogoDetError] = useState("");
  const [catalogoDetData, setCatalogoDetData] = useState(null);
  const [catalogoResumenMap, setCatalogoResumenMap] = useState({});
  const catalogoResumenMapRef = useRef({});
  const [catalogoOnuCacheMap, setCatalogoOnuCacheMap] = useState({});
  const [catalogoFotoPreview, setCatalogoFotoPreview] = useState("");
  const [catalogoVerMas, setCatalogoVerMas] = useState({
    orden: false,
    liquidacion: false,
    relacion: false,
  });
  const [kardexFechaDesde, setKardexFechaDesde] = useState("");
  const [kardexFechaHasta, setKardexFechaHasta] = useState("");
  const [kardexMovFiltro, setKardexMovFiltro] = useState("TODOS");
  const [kardexTecnicoFiltro, setKardexTecnicoFiltro] = useState("");
  useEffect(() => {
    catalogoResumenMapRef.current = catalogoResumenMap || {};
  }, [catalogoResumenMap]);
  const eqInputRef = useRef(null);
  const matInputRef = useRef(null);
  const artInputRef = useRef(null);
  const tecnicoSesion = String(sessionUser?.nombre || sessionUser?.username || "").trim();
  const tecnicoSel = esTecnico ? tecnicoSesion : tecnicoFiltro;
  const puedeAprobarDevoluciones = norm(sessionUser?.rol) !== "tecnico";
  const [equiposRecogidos, setEquiposRecogidos] = useState([]);
  const [cargandoRecogidos, setCargandoRecogidos] = useState(false);
  const esAdmin = norm(sessionUser?.rol) === "administrador";
  const almacenesActivos = useMemo(
    () => (almacenes || []).filter((a) => a?.activo),
    [almacenes]
  );
  const getAlmacenById = useCallback(
    (id) => (almacenes || []).find((a) => String(a?.id || "") === String(id || "")) || null,
    [almacenes]
  );

  const buscarTecnico = useCallback(
    (valor) => {
      const key = personaKey(valor);
      const code = normalizeTechCode(valor);
      if (!key) return null;
      return (
        tecnicos.find((t) => {
          const aliases = [
            t.id,
            t.nombre,
            t.username,
            ...(Array.isArray(t.legacyCodes) ? t.legacyCodes : []),
            ...(Array.isArray(t.legacyNames) ? t.legacyNames : []),
          ].map((x) => personaKey(x));
          if (code && Array.isArray(t.legacyCodes) && t.legacyCodes.some((c) => normalizeTechCode(c) === code)) return true;
          return aliases.some((k) => k === key || (k.length >= 4 && key.length >= 4 && (k.includes(key) || key.includes(k))));
        }) || null
      );
    },
    [tecnicos]
  );
  const resolverNombreTecnico = useCallback((valor) => {
    const raw = String(valor || "").trim();
    if (!raw) return "";
    const code = normalizeTechCode(raw);
    const legacyName = LEGACY_TECH_CODE_MAP[code] || "";
    return String(buscarTecnico(raw)?.nombre || buscarTecnico(legacyName)?.nombre || legacyName || raw).trim();
  }, [buscarTecnico]);
  const esTecnicoRegistrado = useCallback((valor) => Boolean(buscarTecnico(valor)), [buscarTecnico]);
  const insertOneWithColumnFallback = useCallback(async (table, row) => {
    let payload = { ...(row || {}) };
    for (let i = 0; i < 12; i += 1) {
      const res = await supabase.from(table).insert([payload]).select("id").single();
      if (!res.error) return { ok: true, data: res.data };
      const miss = getMissingColumnName(res.error?.message || "");
      if (miss && Object.prototype.hasOwnProperty.call(payload, miss)) {
        const next = { ...payload };
        delete next[miss];
        payload = next;
        continue;
      }
      return { ok: false, error: res.error };
    }
    return { ok: false, error: new Error(`No se pudo insertar en ${table}.`) };
  }, []);
  const updateByIdWithColumnFallback = useCallback(async (table, id, row) => {
    const key = String(id || "").trim();
    if (!key) return { ok: false, error: new Error("ID invalido para actualizar.") };
    let payload = { ...(row || {}) };
    for (let i = 0; i < 12; i += 1) {
      const res = await supabase.from(table).update(payload).eq("id", key);
      if (!res.error) return { ok: true };
      const miss = getMissingColumnName(res.error?.message || "");
      if (miss && Object.prototype.hasOwnProperty.call(payload, miss)) {
        const next = { ...payload };
        delete next[miss];
        payload = next;
        continue;
      }
      return { ok: false, error: res.error };
    }
    return { ok: false, error: new Error(`No se pudo actualizar ${table}.`) };
  }, []);

  const registrarMov = useCallback(async (p) => {
    const payloadBase = {
      tipo_item: p.tipoItem || "",
      movimiento: p.movimiento || "",
      motivo: p.motivo || "",
      item_nombre: p.itemNombre || "",
      referencia: p.referencia || "",
      cantidad: num(p.cantidad),
      unidad: p.unidad || "unidad",
      costo_unitario: num(p.costoUnitario),
      tecnico: p.tecnico || "",
      actor: String(sessionUser?.nombre || sessionUser?.username || ""),
      nodo: String(p.nodo || ""),
      almacen_id: p.almacenId || null,
      almacen_nombre: p.almacenNombre || "",
    };
    try {
      let payload = { ...payloadBase };
      for (let i = 0; i < 12; i += 1) {
        const ins = await supabase.from("inventario_movimientos").insert([payload]);
        if (!ins.error) break;
        const miss = getMissingColumnName(ins.error?.message || "");
        if (miss && Object.prototype.hasOwnProperty.call(payload, miss)) {
          const next = { ...payload };
          delete next[miss];
          payload = next;
          continue;
        }
        throw ins.error;
      }
    } catch (err) {
      void err;
    }
    setMovimientos((prev) => [{
      id: `tmp-${Date.now()}`,
      fecha: new Date().toISOString(),
      tipo: p.tipoItem || "",
      mov: p.movimiento || "",
      motivo: p.motivo || "",
      item: p.itemNombre || "",
      ref: p.referencia || "",
      cant: num(p.cantidad),
      unidad: p.unidad || "unidad",
      costo: num(p.costoUnitario),
      tecnico: p.tecnico || "",
      actor: String(sessionUser?.nombre || sessionUser?.username || ""),
      nodo: String(p.nodo || ""),
      almacenId: p.almacenId || "",
      almacenNombre: p.almacenNombre || "",
    }, ...prev]);
  }, [sessionUser?.nombre, sessionUser?.username]);

  const cargar = useCallback(async () => {
    if (!isSupabaseConfigured) return setError("Configura Supabase para inventario.");
    setLoading(true);
    try {
      const safeQuery = async (promise) => {
        try {
          return await promise;
        } catch (err) {
          return { data: [], error: err };
        }
      };
      const isFetchFailed = (err) => {
        const txt = String(err?.message || err || "").toLowerCase();
        return txt.includes("failed to fetch") || txt.includes("networkerror") || txt.includes("load failed");
      };
      let [eq, asig, mov, usu, liq, sol, art, alm, rel] = await Promise.all([
        safeQuery(supabase.from("equipos_catalogo").select("id,empresa,tipo,marca,modelo,precio_unitario,codigo_qr,serial_mac,foto_referencia,estado,tecnico_asignado,almacen_id,almacen_nombre").order("id", { ascending: false })),
        safeQuery(supabase.from("materiales_asignados_tecnicos").select("id,tecnico,material_id,material_nombre,cantidad_asignada,cantidad_disponible,unidad").order("id", { ascending: false })),
        safeQuery(supabase.from("inventario_movimientos").select("id,created_at,tipo_item,movimiento,motivo,item_nombre,referencia,cantidad,unidad,costo_unitario,tecnico,actor,nodo,almacen_id,almacen_nombre").order("created_at", { ascending: false }).limit(1500)),
        safeQuery(supabase.from("usuarios").select("id,nombre,username,rol,activo").eq("activo", true).order("nombre", { ascending: true })),
        safeQuery(supabase.from("liquidaciones").select("id,tecnico,tecnico_liquida").order("id", { ascending: false }).limit(5000)),
        safeQuery(
          supabase
            .from(INVENTARIO_DEV_SOL_TABLE)
            .select("id,tipo_solicitud,tipo_item,equipo_id,material_asig_id,material_id,codigo_qr,material_nombre,cantidad,unidad,es_legacy_sin_qr,identificador_alterno,nodo_origen,estado_retorno,motivo,tecnico,actor_solicita,estado,aprobado_por,aprobado_at,rechazo_motivo,movimiento_ref,created_at,updated_at")
            .order("created_at", { ascending: false })
            .limit(500)
        ),
        safeQuery(
          supabase
            .from(INVENTARIO_ARTICULOS_TABLE)
            .select("id,tipo,marca,modelo,descripcion,foto_referencia")
            .order("id", { ascending: false })
        ),
        safeQuery(supabase.from("almacenes").select("id,nombre,codigo,direccion,ubicacion,activo").order("nombre", { ascending: true })),
        safeQuery(
          supabase
            .from("onu_liquidacion_relacion")
            .select("id_onu,liquidacion_codigo,regla_match,pendiente_revision")
            .limit(5000)
        ),
      ]);
      let almacenesColsOff = false;
      if (
        eq.error &&
        (columnMissing("almacen_id", eq.error) || columnMissing("almacen_nombre", eq.error))
      ) {
        almacenesColsOff = true;
        eq = await safeQuery(supabase.from("equipos_catalogo").select("id,empresa,tipo,marca,modelo,precio_unitario,codigo_qr,serial_mac,foto_referencia,estado,tecnico_asignado").order("id", { ascending: false }));
      }
      if (mov.error && columnMissing("nodo", mov.error)) {
        mov = await safeQuery(supabase.from("inventario_movimientos").select("id,created_at,tipo_item,movimiento,motivo,item_nombre,referencia,cantidad,unidad,costo_unitario,tecnico,actor,almacen_id,almacen_nombre").order("created_at", { ascending: false }).limit(1500));
      }
      if (mov.error && (columnMissing("almacen_id", mov.error) || columnMissing("almacen_nombre", mov.error))) {
        almacenesColsOff = true;
        mov = await safeQuery(supabase.from("inventario_movimientos").select("id,created_at,tipo_item,movimiento,motivo,item_nombre,referencia,cantidad,unidad,costo_unitario,tecnico,actor,nodo").order("created_at", { ascending: false }).limit(1500));
      }
      if (mov.error && columnMissing("nodo", mov.error)) {
        mov = await safeQuery(supabase.from("inventario_movimientos").select("id,created_at,tipo_item,movimiento,motivo,item_nombre,referencia,cantidad,unidad,costo_unitario,tecnico,actor").order("created_at", { ascending: false }).limit(1500));
      }
      if (sol.error && (columnMissing("tipo_solicitud", sol.error) || columnMissing("es_legacy_sin_qr", sol.error) || columnMissing("identificador_alterno", sol.error) || columnMissing("nodo_origen", sol.error) || columnMissing("updated_at", sol.error))) {
        sol = await safeQuery(
          supabase
            .from(INVENTARIO_DEV_SOL_TABLE)
            .select("id,tipo_item,equipo_id,material_asig_id,material_id,codigo_qr,material_nombre,cantidad,unidad,estado_retorno,motivo,tecnico,actor_solicita,estado,aprobado_por,aprobado_at,rechazo_motivo,movimiento_ref,created_at")
            .order("created_at", { ascending: false })
            .limit(500)
        );
      }
      let mat = await safeQuery(supabase.from("materiales_catalogo").select("id,nombre,unidad_default,costo_unitario,foto_referencia").order("id", { ascending: true }));
      let fotoOff = false;
      if (mat.error && columnMissing("foto_referencia", mat.error)) { fotoOff = true; mat = await safeQuery(supabase.from("materiales_catalogo").select("id,nombre,unidad_default,costo_unitario").order("id", { ascending: true })); }
      if (eq.error && !tableMissing("equipos_catalogo", eq.error) && !isFetchFailed(eq.error)) throw eq.error;
      if (mat.error && !tableMissing("materiales_catalogo", mat.error) && !isFetchFailed(mat.error)) throw mat.error;
      if (usu.error && !tableMissing("usuarios", usu.error) && !isFetchFailed(usu.error)) throw usu.error;
      if (asig.error && !tableMissing("materiales_asignados_tecnicos", asig.error) && !isFetchFailed(asig.error)) throw asig.error;
      if (mov.error && !tableMissing("inventario_movimientos", mov.error) && !isFetchFailed(mov.error)) throw mov.error;
      if (liq.error && !tableMissing("liquidaciones", liq.error) && !isFetchFailed(liq.error)) throw liq.error;
      if (sol.error && !tableMissing(INVENTARIO_DEV_SOL_TABLE, sol.error) && !isFetchFailed(sol.error)) throw sol.error;
      if (art.error && !tableMissing(INVENTARIO_ARTICULOS_TABLE, art.error) && !isFetchFailed(art.error)) throw art.error;
      if (alm.error && !tableMissing("almacenes", alm.error) && !isFetchFailed(alm.error)) throw alm.error;
      if (rel.error && !tableMissing("onu_liquidacion_relacion", rel.error) && !isFetchFailed(rel.error)) throw rel.error;
      const tecnicosActivos = (usu.data || [])
        .filter((u) => norm(u.rol) === "tecnico")
        .map((u) => ({
          id: String(u.id || ""),
          nombre: String(u.nombre || u.username || "").trim(),
          username: String(u.username || "").trim(),
          activo: u?.activo !== false,
          legacyCodes: [],
          legacyNames: [],
        }))
        .filter((u) => u.nombre && u.activo);

      const limpiarPrefijoTecnico = (valor = "") => String(valor || "").replace(/^\s*\d+\s*-\s*/, "").trim();
      const normalizarTecnicoComparable = (valor = "") => personaKey(valor).replace(/[^a-z0-9]/g, "");
      const coincideTecnicoActivo = (valor = "", tecnico = null) => {
        if (!tecnico) return false;
        const key = normalizarTecnicoComparable(limpiarPrefijoTecnico(valor));
        if (!key) return false;
        const aliases = [
          tecnico?.nombre,
          tecnico?.username,
          ...(Array.isArray(tecnico?.legacyCodes) ? tecnico.legacyCodes : []),
          ...(Array.isArray(tecnico?.legacyNames) ? tecnico.legacyNames : []),
        ]
          .map((x) => normalizarTecnicoComparable(limpiarPrefijoTecnico(x)))
          .filter(Boolean);
        return aliases.some((alias) => {
          if (alias === key) return true;
          if (alias.length >= 4 && key.length >= 4) {
            if (alias.includes(key) || key.includes(alias)) return true;
            return alias.slice(0, 4) === key.slice(0, 4);
          }
          return false;
        });
      };
      const buscarTecnicoActivo = (valor = "") => {
        const raw = String(valor || "").trim();
        if (!raw) return null;
        const code = normalizeTechCode(raw);
        const fromLegacy = LEGACY_TECH_CODE_MAP[code] || "";
        return (
          tecnicosActivos.find((t) => coincideTecnicoActivo(raw, t) || (fromLegacy && coincideTecnicoActivo(fromLegacy, t))) ||
          null
        );
      };

      Object.entries(LEGACY_TECH_CODE_MAP).forEach(([code, aliasName]) => {
        const found = buscarTecnicoActivo(aliasName) || buscarTecnicoActivo(code);
        if (!found) return;
        const normCode = normalizeTechCode(code);
        if (normCode && !found.legacyCodes.some((x) => normalizeTechCode(x) === normCode)) found.legacyCodes.push(normCode);
        if (aliasName && !found.legacyNames.some((x) => personaKey(x) === personaKey(aliasName))) found.legacyNames.push(aliasName);
      });

      const resolverTecnicoActivoNombre = (valor = "") => {
        const raw = String(valor || "").trim();
        if (!raw) return "";
        const code = normalizeTechCode(raw);
        const legacyName = LEGACY_TECH_CODE_MAP[code] || "";
        const rawNoPrefix = limpiarPrefijoTecnico(raw);
        const byCode = code ? tecnicosActivos.find((t) => t.legacyCodes.some((x) => normalizeTechCode(x) === code)) : null;
        const found = byCode || buscarTecnicoActivo(raw) || buscarTecnicoActivo(rawNoPrefix) || buscarTecnicoActivo(legacyName);
        if (found?.nombre) return String(found.nombre).trim();
        const fromLegacyByName = Object.values(LEGACY_TECH_CODE_MAP).find(
          (alias) => normalizarTecnicoComparable(alias) === normalizarTecnicoComparable(rawNoPrefix)
        );
        return String(fromLegacyByName || legacyName || rawNoPrefix || raw).trim();
      };

      const relByOnu = new Map();
      (rel.data || []).forEach((r) => {
        const key = normRef(r?.id_onu || "");
        if (!key) return;
        if (!relByOnu.has(key)) relByOnu.set(key, r);
      });

      const estadoConciliacion = (r) => {
        if (!r) return "sin_relacion";
        const regla = norm(r?.regla_match || "");
        if (regla === "no_aplica") return "no_aplica";
        if (r?.pendiente_revision === false && toText(r?.liquidacion_codigo)) return "resuelto";
        return "pendiente";
      };

      const eqRows = (eq.data || []).map((r) => ({
        ...(function () {
          const relMatch =
            relByOnu.get(normRef(r?.codigo_qr || "")) ||
            relByOnu.get(normRef(r?.serial_mac || "")) ||
            null;
          return {
            conciliacionEstado: estadoConciliacion(relMatch),
            conciliacionCodigo: toText(relMatch?.liquidacion_codigo),
          };
        })(),
        id: String(r.id || ""),
        empresa: r.empresa || "Americanet",
        tipo: r.tipo || "",
        marca: r.marca || "",
        modelo: r.modelo || "",
        precio: num(r.precio_unitario),
        codigo: r.codigo_qr || "",
        serial: r.serial_mac || "",
        foto: String(r.foto_referencia || ""),
        estado: r.estado || "almacen",
        tecnico: resolverTecnicoActivoNombre(r.tecnico_asignado),
        almacenId: r.almacen_id != null ? String(r.almacen_id) : "",
        almacenNombre: String(r.almacen_nombre || ""),
      }));
      const asigRows = (asig.data || []).map((r) => ({
        id: String(r.id || ""),
        tecnico: resolverTecnicoActivoNombre(r.tecnico),
        materialId: String(r.material_id || ""),
        material: r.material_nombre || "",
        disponible: num(r.cantidad_disponible),
        asignado: num(r.cantidad_asignada, num(r.cantidad_disponible)),
        unidad: r.unidad || "unidad",
      }));
      const movRows = (mov.data || []).map((r) => ({
        id: String(r.id || ""),
        fecha: r.created_at || "",
        tipo: r.tipo_item || "",
        mov: r.movimiento || "",
        motivo: r.motivo || "",
        item: r.item_nombre || "",
        ref: r.referencia || "",
        cant: num(r.cantidad),
        unidad: r.unidad || "unidad",
        costo: num(r.costo_unitario),
        tecnico: resolverTecnicoActivoNombre(r.tecnico),
        actor: r.actor || "",
        nodo: String(r.nodo || ""),
        almacenId: r.almacen_id != null ? String(r.almacen_id) : "",
        almacenNombre: String(r.almacen_nombre || ""),
      }));
      const almacenesRows = (alm.data || [])
        .map((r) => ({
          id: r.id != null ? String(r.id) : "",
          nombre: String(r.nombre || "").trim(),
          codigo: String(r.codigo || "").trim(),
          direccion: String(r.direccion || "").trim(),
          ubicacion: String(r.ubicacion || "").trim(),
          activo: r?.activo !== false,
        }))
        .filter((r) => r.id && r.nombre);
      const solRows = (sol.data || []).map((r) => ({
        id: String(r.id || ""),
        tipoSolicitud: String(r.tipo_solicitud || "DEVOLUCION").toUpperCase(),
        tipoItem: String(r.tipo_item || ""),
        equipoId: String(r.equipo_id || ""),
        materialAsigId: String(r.material_asig_id || ""),
        materialId: String(r.material_id || ""),
        codigoQr: String(r.codigo_qr || ""),
        materialNombre: String(r.material_nombre || ""),
        cantidad: num(r.cantidad),
        unidad: String(r.unidad || "unidad"),
        esLegacySinQr: r.es_legacy_sin_qr === true,
        identificadorAlterno: String(r.identificador_alterno || ""),
        nodoOrigen: String(r.nodo_origen || ""),
        estadoRetorno: String(r.estado_retorno || "BUENO").toUpperCase(),
        motivo: String(r.motivo || ""),
        tecnico: resolverTecnicoActivoNombre(r.tecnico),
        actorSolicita: String(r.actor_solicita || ""),
        estado: String(r.estado || "PENDIENTE").toUpperCase(),
        aprobadoPor: String(r.aprobado_por || ""),
        aprobadoAt: String(r.aprobado_at || ""),
        rechazoMotivo: String(r.rechazo_motivo || ""),
        movimientoRef: String(r.movimiento_ref || ""),
        createdAt: String(r.created_at || ""),
        updatedAt: String(r.updated_at || ""),
      }));

      const warningPartes = [
        mov.error
          ? isFetchFailed(mov.error)
            ? "No se pudo consultar Kardex por conexion. Intenta Actualizar."
            : "Tabla inventario_movimientos no existe aun."
          : "",
        sol.error
          ? isFetchFailed(sol.error)
            ? "No se pudo consultar solicitudes por conexion."
            : "Tabla de solicitudes de devolucion no existe aun."
          : "",
        asig.error && isFetchFailed(asig.error) ? "No se pudo consultar asignaciones de materiales por conexion." : "",
        liq.error && isFetchFailed(liq.error) ? "No se pudo consultar liquidaciones por conexion." : "",
        eq.error && isFetchFailed(eq.error) ? "No se pudo consultar catalogo de equipos por conexion." : "",
        mat.error && isFetchFailed(mat.error) ? "No se pudo consultar catalogo de materiales por conexion." : "",
        usu.error && isFetchFailed(usu.error) ? "No se pudo consultar usuarios/tecnicos por conexion." : "",
        art.error
          ? tableMissing(INVENTARIO_ARTICULOS_TABLE, art.error)
            ? "Falta tabla inventario_articulos para guardar Articulos registrados en Supabase."
            : isFetchFailed(art.error)
              ? "No se pudo consultar articulos por conexion."
              : ""
          : "",
        fotoOff ? "Falta columna foto_referencia en materiales_catalogo." : "",
        alm.error
          ? tableMissing("almacenes", alm.error)
            ? "Falta tabla almacenes para habilitar multi-almacen."
            : isFetchFailed(alm.error)
              ? "No se pudo consultar almacenes por conexion."
              : ""
          : "",
        almacenesColsOff ? "Faltan columnas almacen_id/almacen_nombre en equipos o movimientos." : "",
      ].filter(Boolean);

      const articulosLocal = readArticulosLocal();
      let articulosSupabase = [];
      let supabaseArticulosActivo = !art.error;
      if (!art.error) {
        articulosSupabase = (art.data || [])
          .map((r) =>
            normalizarArticulo({
              id: r.id,
              tipo: r.tipo,
              marca: r.marca,
              modelo: r.modelo,
              descripcion: r.descripcion,
              foto: r.foto_referencia,
            })
          )
          .filter((x) => x.tipo && x.marca && x.modelo);
        if (articulosSupabase.length === 0 && articulosLocal.length > 0) {
          const payload = Array.from(new Map(articulosLocal.map((x) => [articuloKey(x), x])).values()).map((x) => ({
            tipo: String(x.tipo || "").trim(),
            marca: String(x.marca || "").trim(),
            modelo: String(x.modelo || "").trim(),
            descripcion: String(x.descripcion || "").trim(),
            foto_referencia: String(x.foto || "").trim(),
          }));
          if (payload.length > 0) {
            const mig = await supabase
              .from(INVENTARIO_ARTICULOS_TABLE)
              .insert(payload)
              .select("id,tipo,marca,modelo,descripcion,foto_referencia");
            if (!mig.error) {
              articulosSupabase = (mig.data || [])
                .map((r) =>
                  normalizarArticulo({
                    id: r.id,
                    tipo: r.tipo,
                    marca: r.marca,
                    modelo: r.modelo,
                    descripcion: r.descripcion,
                    foto: r.foto_referencia,
                  })
                )
                .filter((x) => x.tipo && x.marca && x.modelo);
            }
          }
        }
      }

      setWarning(warningPartes.join(" "));
      setFotoMaterialDisponible(!fotoOff);
      setCatalogoResumenMap({});
      setArticulosEnSupabase(supabaseArticulosActivo);
      setArticulos(supabaseArticulosActivo ? articulosSupabase : articulosLocal);
      setEquipos(eqRows);
      setMateriales((mat.data || []).map((r) => ({ id: String(r.id || ""), nombre: r.nombre || "", unidad: r.unidad_default || "unidad", costo: num(r.costo_unitario), foto: String(r.foto_referencia || "") })));
      setMaterialesAsig(asigRows);
      setMovimientos(movRows);
      setAlmacenes(almacenesRows);
      setAlmacenesDisponibles(!alm.error || !tableMissing("almacenes", alm.error));
      const primerAlmacen = almacenesRows.find((a) => a.activo) || almacenesRows[0] || null;
      if (primerAlmacen) {
        setAlmacenEqId((prev) => prev || primerAlmacen.id);
        setAlmacenMatId((prev) => prev || primerAlmacen.id);
        setAlmacenMovId((prev) => prev || primerAlmacen.id);
      }
      setSolicitudesDisponibles(!sol.error);
      setSolicitudesDevolucion(solRows);
      setTecnicos(
        tecnicosActivos
          .map((t) => ({
            id: t.id,
            nombre: t.nombre,
            username: t.username,
            activo: true,
            legacyCodes: Array.from(new Set(t.legacyCodes)),
            legacyNames: Array.from(new Set(t.legacyNames)),
          }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
      );
      setError("");
    } catch (e) {
      const msg = String(e?.message || "Error cargando inventario.");
      setError(/failed to fetch/i.test(msg) ? "Error de conexion al cargar inventario. Verifica internet/Supabase y pulsa Actualizar." : msg);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const cargarEquiposRecogidos = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const nombre = String(sessionUser?.nombre || sessionUser?.username || "").trim();
    if (!nombre) return;
    setCargandoRecogidos(true);
    try {
      const { data } = await supabase
        .from("stock_tecnico")
        .select("*")
        .eq("ingresado_almacen", false)
        .order("created_at", { ascending: false });
      // filtrar por nombre del técnico (case-insensitive en cliente)
      const normNombre = nombre.toLowerCase();
      const filtrados = (data || []).filter(
        (r) => String(r.tecnico_recupera || "").toLowerCase() === normNombre
      );
      setEquiposRecogidos(filtrados);
    } catch (_) {
      // silencioso
    } finally {
      setCargandoRecogidos(false);
    }
  }, [sessionUser?.nombre, sessionUser?.username]);

  useEffect(() => {
    if (!esTecnico) return;
    void cargarEquiposRecogidos();
  }, [esTecnico, cargarEquiposRecogidos]);

  useEffect(() => {
    const raw = String(initialTab || "").trim();
    const objetivo = raw === "materiales" ? "articulos" : raw;
    if (!tabs.includes(objetivo)) return;
    setTab((prev) => (prev === objetivo ? prev : objetivo));
    if (raw === "materiales") {
      setArticulosSubTab("materialesCatalogo");
    }
  }, [initialTab, tabs]);
  useEffect(() => {
    if (!esTecnico) return;
    setTecnicoFiltro(tecnicoSesion);
  }, [esTecnico, tecnicoSesion]);
  useEffect(() => { if (!tabs.includes(tab)) setTab(tabs[0] || "catalogo"); }, [tab, tabs]);
  useEffect(() => {
    if (tab !== "articulos") {
      setArticulosSubTab("equipos");
    }
  }, [tab]);
  useEffect(() => {
    if (tab !== "registro") {
      setRegistroSubTab("equipos");
    }
  }, [tab]);
  useEffect(() => {
    if (!materiales.length) return;
    setIngresoMat((prev) => {
      const materialId = prev.materialId || String(materiales[0]?.id || "");
      const unidadSugerida = String(materiales.find((m) => String(m.id) === String(materialId))?.unidad || prev.unidad || "unidad");
      return { ...prev, materialId, unidad: unidadSugerida };
    });
  }, [materiales]);
  useEffect(() => {
    saveArticulosLocal(articulos);
  }, [articulos]);
  useEffect(() => {
    if (articulosEnSupabase) return;
    if (articulos.length > 0) return;
    if (!equipos.length) return;
    const seed = uniqSorted(
      equipos
        .filter((e) => String(e.tipo || "").trim() && String(e.marca || "").trim() && String(e.modelo || "").trim())
        .map((e) => articuloKey(e))
    ).map((key) => {
      const found = equipos.find((e) => articuloKey(e) === key);
      return normalizarArticulo({
        empresa: found?.empresa || "Americanet",
        tipo: found?.tipo || "",
        marca: found?.marca || "",
        modelo: found?.modelo || "",
        precio: found?.precio || 0,
        foto: found?.foto || "",
      });
    });
    if (seed.length > 0) setArticulos(seed);
  }, [articulos.length, articulosEnSupabase, equipos]);
  useEffect(() => {
    if (!articuloRegistroId) return;
    const item = articulos.find((x) => String(x.id) === String(articuloRegistroId));
    if (item) return;
    setArticuloRegistroId("");
  }, [articuloRegistroId, articulos]);
  useEffect(() => {
    if (!artEditId) return;
    const item = articulos.find((x) => String(x.id) === String(artEditId));
    if (item) return;
    setArtEditId("");
    setArtForm({ ...emptyArt });
  }, [artEditId, articulos]);

  const equiposDispAsig = useMemo(() => equipos.filter((e) => estadoGrupo(e.estado) === "almacen" && !eqPendAsig.some((p) => String(p.id) === String(e.id))), [equipos, eqPendAsig]);
  const eqSelAsig = useMemo(() => equiposDispAsig.find((e) => String(e.id) === String(asigEq.equipoId)), [equiposDispAsig, asigEq.equipoId]);
  const catalogo = useMemo(
    () =>
      equipos.filter((e) => {
        const okEstado =
          filtroEstadoCatalogo === "TODOS" ||
          (filtroEstadoCatalogo === "conciliado" ? e.conciliacionEstado === "resuelto" : estadoGrupo(e.estado) === filtroEstadoCatalogo);
        const okBusqueda =
          !busqueda ||
          `${e.empresa} ${e.tipo} ${e.marca} ${e.modelo} ${e.codigo} ${e.serial} ${e.tecnico} ${e.almacenNombre}`
            .toLowerCase()
            .includes(norm(busqueda));
        const okTecnico = !tecnicoFiltro || _tokenMatch(e?.tecnico || "", tecnicoFiltro);
        return okEstado && okBusqueda && okTecnico;
      }),
    [equipos, filtroEstadoCatalogo, busqueda, tecnicoFiltro]
  );
  const catalogoOrdenado = useMemo(() => {
    const rows = [...catalogo];
    if (catalogoOrden === "ANTIGUOS") return rows.sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0));
    if (catalogoOrden === "NOMBRE") return rows.sort((a, b) => equipoNombre(a).localeCompare(equipoNombre(b), "es", { sensitivity: "base" }));
    if (catalogoOrden === "ESTADO") return rows.sort((a, b) => estadoGrupo(a.estado).localeCompare(estadoGrupo(b.estado), "es", { sensitivity: "base" }));
    return rows.sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0));
  }, [catalogo, catalogoOrden]);
  const catalogoTotalPaginas = useMemo(() => Math.max(1, Math.ceil(catalogoOrdenado.length / CATALOGO_PAGE_SIZE)), [catalogoOrdenado.length]);
  const catalogoPaginaActiva = Math.min(Math.max(1, Number(catalogoPagina || 1)), catalogoTotalPaginas);
  const catalogoPaginaRows = useMemo(() => {
    const from = (catalogoPaginaActiva - 1) * CATALOGO_PAGE_SIZE;
    return catalogoOrdenado.slice(from, from + CATALOGO_PAGE_SIZE);
  }, [catalogoOrdenado, catalogoPaginaActiva]);
  const catalogoDesde = catalogoOrdenado.length === 0 ? 0 : (catalogoPaginaActiva - 1) * CATALOGO_PAGE_SIZE + 1;
  const catalogoHasta = catalogoOrdenado.length === 0 ? 0 : Math.min(catalogoDesde + catalogoPaginaRows.length - 1, catalogoOrdenado.length);
  useEffect(() => {
    setCatalogoPagina(1);
  }, [busqueda, filtroEstadoCatalogo, catalogoOrden, tecnicoFiltro]);
  useEffect(() => {
    setCatalogoPagina((prev) => {
      const safe = Number(prev) || 1;
      if (safe > catalogoTotalPaginas) return catalogoTotalPaginas;
      if (safe < 1) return 1;
      return safe;
    });
  }, [catalogoTotalPaginas]);
  const conteoCatalogo = useMemo(() => {
    let base = !busqueda
      ? equipos
      : equipos.filter((e) =>
          `${e.empresa} ${e.tipo} ${e.marca} ${e.modelo} ${e.codigo} ${e.serial} ${e.tecnico}`.toLowerCase().includes(norm(busqueda))
        );
    if (tecnicoFiltro) {
      base = base.filter((e) => _tokenMatch(e?.tecnico || "", tecnicoFiltro));
    }
    return {
      TODOS: base.length,
      almacen: base.filter((e) => estadoGrupo(e.estado) === "almacen").length,
      asignado: base.filter((e) => estadoGrupo(e.estado) === "asignado").length,
      liquidado: base.filter((e) => estadoGrupo(e.estado) === "liquidado").length,
      conciliado: base.filter((e) => e.conciliacionEstado === "resuelto").length,
    };
  }, [equipos, busqueda, tecnicoFiltro]);
  const equiposEnAlmacen = conteoCatalogo.almacen;
  const equiposAsignados = conteoCatalogo.asignado;
  const equiposLiquidados = conteoCatalogo.liquidado;
  const materialStockMap = useMemo(() => {
    const map = new Map();
    materiales.forEach((m) => {
      map.set(materialKey(m.id, m.unidad), 0);
    });
    movimientos.forEach((m) => {
      if (norm(m.tipo) !== "material") return;
      let matId = materialIdFromRef(m.ref);
      if (!matId) {
        const byName = materiales.find((x) => norm(x.nombre) === norm(m.item));
        matId = String(byName?.id || "").trim();
      }
      if (!matId) return;
      const unidad = String(m.unidad || materiales.find((x) => String(x.id) === matId)?.unidad || "unidad").trim() || "unidad";
      const key = materialKey(matId, unidad);
      const actual = num(map.get(key), 0);
      const movNorm = norm(m.mov);
      const signo = movNorm.includes("salida") ? -1 : movNorm.includes("ingreso") || movNorm.includes("entrada") ? 1 : 0;
      map.set(key, actual + signo * num(m.cant));
    });
    return map;
  }, [materiales, movimientos]);
  const stockMaterialActual = useCallback((materialId, unidad) => num(materialStockMap.get(materialKey(materialId, unidad)), 0), [materialStockMap]);
  const stockMaterialDisponible = useCallback(
    (materialId, unidad, pendientes = matPendAsig) => {
      const base = stockMaterialActual(materialId, unidad);
      const reservado = (Array.isArray(pendientes) ? pendientes : []).reduce((acc, item) => {
        if (String(item?.materialId || "") !== String(materialId || "")) return acc;
        if (norm(item?.unidad) !== norm(unidad || "unidad")) return acc;
        return acc + num(item?.cantidad);
      }, 0);
      return base - reservado;
    },
    [matPendAsig, stockMaterialActual]
  );
  const stockMaterialTotal = useMemo(
    () => materiales.reduce((acc, item) => acc + Math.max(0, stockMaterialActual(item.id, item.unidad)), 0),
    [materiales, stockMaterialActual]
  );
  const materialSinStock = useMemo(
    () => materiales.filter((item) => stockMaterialActual(item.id, item.unidad) <= 0).length,
    [materiales, stockMaterialActual]
  );
  const tiposLote = useMemo(
    () => uniqSorted(["ONU", "Router", "Repetidor", "Switch", ...articulos.map((a) => a.tipo), ...equipos.map((e) => e.tipo)]),
    [articulos, equipos]
  );
  const marcasLote = useMemo(() => {
    const base = [...articulos, ...equipos];
    const filtradas = artForm.tipo ? base.filter((e) => norm(e.tipo) === norm(artForm.tipo)) : base;
    return uniqSorted(filtradas.map((e) => e.marca));
  }, [artForm.tipo, articulos, equipos]);
  const modelosLote = useMemo(() => {
    const base = [...articulos, ...equipos];
    const filtradas = base.filter((e) => {
      const okTipo = artForm.tipo ? norm(e.tipo) === norm(artForm.tipo) : true;
      const okMarca = artForm.marca ? norm(e.marca) === norm(artForm.marca) : true;
      return okTipo && okMarca;
    });
    return uniqSorted(filtradas.map((e) => e.modelo));
  }, [artForm.marca, artForm.tipo, articulos, equipos]);
  const articulosDisponibles = articulos;
  const articuloRegistroSeleccionado = useMemo(
    () => articulos.find((x) => String(x.id) === String(articuloRegistroId)) || null,
    [articuloRegistroId, articulos]
  );
  const loteBloqueado = eqPendReg.length > 0;
  const eqBaseTec = useMemo(() => (esTecnico ? equipos.filter((e) => personaKey(e.tecnico) === personaKey(tecnicoSesion)) : !tecnicoSel ? equipos : equipos.filter((e) => personaKey(e.tecnico) === personaKey(tecnicoSel))), [equipos, esTecnico, tecnicoSesion, tecnicoSel]);
  const eqTecAsignadosCount = useMemo(() => eqBaseTec.filter((e) => norm(e.estado).includes("asign")).length, [eqBaseTec]);
  const eqTecLiquidadosCount = useMemo(() => eqBaseTec.filter((e) => estadoGrupo(e.estado) === "liquidado").length, [eqBaseTec]);
  const eqTecFiltrados = useMemo(() => (filtroEstadoStockTecnico === "LIQUIDADO" ? eqBaseTec.filter((e) => estadoGrupo(e.estado) === "liquidado") : eqBaseTec.filter((e) => norm(e.estado).includes("asign"))), [eqBaseTec, filtroEstadoStockTecnico]);
  const matTec = useMemo(() => (esTecnico ? materialesAsig.filter((m) => personaKey(m.tecnico) === personaKey(tecnicoSesion)) : !tecnicoSel ? materialesAsig : materialesAsig.filter((m) => personaKey(m.tecnico) === personaKey(tecnicoSel))), [materialesAsig, esTecnico, tecnicoSesion, tecnicoSel]);
  const solicitudesPendientes = useMemo(
    () => (solicitudesDevolucion || []).filter((s) => String(s.estado || "").toUpperCase() === "PENDIENTE"),
    [solicitudesDevolucion]
  );
  const solicitudesPendientesPorEquipo = useMemo(() => {
    const set = new Set();
    (solicitudesPendientes || []).forEach((s) => {
      if (String(s?.tipoItem || "").toLowerCase() !== "equipo") return;
      const equipoId = String(s?.equipoId || "").trim();
      if (equipoId) set.add(equipoId);
    });
    return set;
  }, [solicitudesPendientes]);
  const solicitudesPendientesPorCodigo = useMemo(() => {
    const set = new Set();
    (solicitudesPendientes || []).forEach((s) => {
      if (String(s?.tipoItem || "").toLowerCase() !== "equipo") return;
      const codigo = String(s?.codigoQr || "").trim().toLowerCase();
      if (codigo) set.add(codigo);
    });
    return set;
  }, [solicitudesPendientes]);
  const pendienteMaterialPorAsignacion = useMemo(() => {
    const map = new Map();
    (solicitudesPendientes || []).forEach((s) => {
      if (String(s?.tipoItem || "").toLowerCase() !== "material") return;
      const asigId = String(s?.materialAsigId || "").trim();
      if (!asigId) return;
      const cantidad = num(s?.cantidad, 0);
      if (cantidad <= 0) return;
      map.set(asigId, num(map.get(asigId), 0) + cantidad);
    });
    return map;
  }, [solicitudesPendientes]);
  const solicitudesVisibles = useMemo(() => {
    if (!esTecnico) return solicitudesDevolucion || [];
    return (solicitudesDevolucion || []).filter(
      (s) =>
        personaKey(s.tecnico || "") === personaKey(tecnicoSesion || "") ||
        personaKey(s.actorSolicita || "") === personaKey(tecnicoSesion || "")
    );
  }, [esTecnico, solicitudesDevolucion, tecnicoSesion]);
  const kardex = useMemo(() => {
    const base = esTecnico
      ? movimientos.filter((m) => personaKey(m.tecnico || m.actor) === personaKey(tecnicoSesion))
      : !tecnicoSel
        ? movimientos
        : movimientos.filter(
            (m) =>
              personaKey(m.tecnico) === personaKey(tecnicoSel) ||
              personaKey(m.actor) === personaKey(tecnicoSel)
          );
    return !busqueda ? base : base.filter((m) => `${m.tipo} ${m.mov} ${m.item} ${m.motivo} ${m.ref} ${m.tecnico} ${m.actor} ${m.almacenNombre}`.toLowerCase().includes(norm(busqueda)));
  }, [movimientos, esTecnico, tecnicoSesion, tecnicoSel, busqueda]);
  const kardexTecnicosOpciones = useMemo(
    () =>
      uniqSorted(
        (kardex || [])
          .map((m) => String(m?.tecnico || "").trim())
          .filter(Boolean)
      ),
    [kardex]
  );
  const kardexFiltrado = useMemo(() => {
    const movMatch = (movTxtRaw = "") => {
      const movTxt = norm(movTxtRaw);
      if (kardexMovFiltro === "INGRESO") return movTxt.includes("ingreso") || movTxt.includes("entrada");
      if (kardexMovFiltro === "SALIDA") return movTxt.includes("salida") || movTxt.includes("egreso");
      return true;
    };
    const fromTs = kardexFechaDesde ? new Date(`${kardexFechaDesde}T00:00:00`).getTime() : 0;
    const toTs = kardexFechaHasta ? new Date(`${kardexFechaHasta}T23:59:59`).getTime() : 0;
    return (kardex || []).filter((m) => {
      const ts = new Date(m?.fecha || "").getTime();
      if (fromTs && Number.isFinite(ts) && ts < fromTs) return false;
      if (toTs && Number.isFinite(ts) && ts > toTs) return false;
      if (!movMatch(m?.mov || "")) return false;
      if (kardexTecnicoFiltro && personaKey(m?.tecnico || "") !== personaKey(kardexTecnicoFiltro)) return false;
      return true;
    });
  }, [kardex, kardexFechaDesde, kardexFechaHasta, kardexMovFiltro, kardexTecnicoFiltro]);
  const exportKardexPdf = useCallback(() => {
    if (!kardexFiltrado.length) return window.alert("No hay movimientos en el filtro actual para generar PDF.");
    const rows = kardexFiltrado
      .map(
        (m, i) =>
          `<tr><td>${i + 1}</td><td>${escHtml(formatDateTimeLabel(m?.fecha || ""))}</td><td>${escHtml(m?.tipo || "-")}</td><td>${escHtml(
            m?.mov || "-"
          )}</td><td>${escHtml(m?.motivo || "-")}</td><td>${escHtml(m?.item || "-")}</td><td>${escHtml(
            `${num(m?.cant || 0).toFixed(2)} ${m?.unidad || "unidad"}`
          )}</td><td>${escHtml(m?.ref || "-")}</td><td>${escHtml(m?.tecnico || "-")}</td><td>${escHtml(m?.actor || "-")}</td><td>${escHtml(m?.almacenNombre || "-")}</td></tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset='utf-8'/><title>Kardex</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:18px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #d7e2f3;padding:6px;text-align:left}th{background:#eef4ff}</style></head><body><h1>Reporte Kardex</h1><p>Generado: ${escHtml(
      new Date().toLocaleString()
    )}</p><p>Registros: ${kardexFiltrado.length}</p><table><thead><tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Mov</th><th>Motivo</th><th>Item</th><th>Cantidad</th><th>Referencia</th><th>Tecnico</th><th>Actor</th><th>Almacén</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const popup = window.open("", "_blank");
    if (popup && popup.document) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      setTimeout(() => {
        try {
          popup.print();
        } catch {
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, "_blank");
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        }
      }, 280);
      return;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const opened = window.open(blobUrl, "_blank");
    if (!opened) window.location.href = blobUrl;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }, [kardexFiltrado]);
  const fotoEquipoByRef = useMemo(() => {
    const map = new Map();
    (equipos || []).forEach((eq) => {
      const foto = normalizePhotoUrl(eq?.foto || "");
      if (!foto) return;
      const keyQr = norm(eq?.codigo || "");
      const keySn = norm(eq?.serial || "");
      if (keyQr && !map.has(keyQr)) map.set(keyQr, foto);
      if (keySn && !map.has(keySn)) map.set(keySn, foto);
    });
    return map;
  }, [equipos]);
  const fotoMaterialByNombre = useMemo(() => {
    const map = new Map();
    (materiales || []).forEach((mat) => {
      const foto = normalizePhotoUrl(mat?.foto || "");
      if (!foto) return;
      const key = personaKey(mat?.nombre || "");
      if (key && !map.has(key)) map.set(key, foto);
    });
    return map;
  }, [materiales]);
  const resolverFotoKardex = useCallback(
    (mov) => {
      const ref = norm(mov?.ref || "");
      if (ref && fotoEquipoByRef.has(ref)) return fotoEquipoByRef.get(ref) || "";
      const tipo = norm(mov?.tipo || "");
      const itemTxt = String(mov?.item || "").trim();
      const itemKey = personaKey(itemTxt);
      if (tipo.includes("equipo")) {
        const eq = (equipos || []).find((e) => {
          const nombre = personaKey(equipoNombre(e));
          return nombre && itemKey && (nombre.includes(itemKey) || itemKey.includes(nombre));
        });
        const fotoEq = normalizePhotoUrl(eq?.foto || "");
        if (fotoEq) return fotoEq;
      }
      if (tipo.includes("material")) {
        if (itemKey && fotoMaterialByNombre.has(itemKey)) return fotoMaterialByNombre.get(itemKey) || "";
        const mat = (materiales || []).find((m) => {
          const key = personaKey(m?.nombre || "");
          return key && itemKey && (key.includes(itemKey) || itemKey.includes(key));
        });
        const fotoMat = normalizePhotoUrl(mat?.foto || "");
        if (fotoMat) return fotoMat;
      }
      return "";
    },
    [equipos, fotoEquipoByRef, fotoMaterialByNombre, materiales]
  );
  const detalleOrden = catalogoDetData?.orden || {};
  const detalleLiquidacion = catalogoDetData?.liquidacion || {};
  const detalleEqLiquidado = catalogoDetData?.equipoLiquidado || {};
  const detalleOrdenCampos = useMemo(
    () => [
      { label: "Codigo", value: firstValue(detalleOrden?.codigo, detalleLiquidacion?.codigo_orden, detalleLiquidacion?.codigo) },
      { label: "Empresa", value: firstValue(detalleOrden?.empresa) },
      { label: "Generar usuario", value: firstValue(detalleOrden?.generar_usuario, detalleOrden?.generarUsuario) },
      { label: "Orden tipo", value: firstValue(detalleOrden?.orden_tipo, detalleOrden?.ordenTipo) },
      { label: "Tipo actuacion", value: firstValue(detalleOrden?.tipo_actuacion, detalleOrden?.tipoActuacion) },
      { label: "Estado", value: firstValue(detalleOrden?.estado) },
      { label: "Prioridad", value: firstValue(detalleOrden?.prioridad) },
      { label: "Fecha actuacion", value: firstValue(detalleOrden?.fecha_actuacion, detalleOrden?.fechaActuacion) },
      { label: "Hora", value: firstValue(detalleOrden?.hora) },
      { label: "Cliente", value: firstValue(detalleOrden?.nombre, detalleLiquidacion?.nombre) },
      { label: "DNI", value: firstValue(detalleOrden?.dni, detalleLiquidacion?.dni) },
      { label: "Celular", value: firstValue(detalleOrden?.celular, detalleLiquidacion?.celular, detalleLiquidacion?.movil, detalleLiquidacion?.telefono) },
      { label: "Email", value: firstValue(detalleOrden?.email) },
      { label: "Contacto", value: firstValue(detalleOrden?.contacto) },
      { label: "Direccion", value: firstValue(detalleOrden?.direccion, detalleLiquidacion?.direccion) },
      { label: "Nodo", value: firstValue(detalleOrden?.nodo, detalleLiquidacion?.nodo) },
      { label: "Tecnico", value: resolverNombreTecnico(firstValue(detalleOrden?.tecnico, detalleLiquidacion?.tecnico_liquida, detalleLiquidacion?.tecnico)) },
      {
        label: "Usuario PPPoE",
        value: firstValue(
          detalleOrden?.usuario_nodo,
          detalleOrden?.usuarioNodo,
          detalleOrden?.user_pppoe,
          detalleOrden?.pppuser,
          detalleLiquidacion?.usuario_nodo,
          detalleLiquidacion?.usuarioNodo,
          detalleLiquidacion?.user_pppoe,
          detalleLiquidacion?.pppuser,
          detalleLiquidacion?.user
        ),
      },
      {
        label: "Clave PPPoE",
        value: firstValue(
          detalleOrden?.password_usuario,
          detalleOrden?.passwordUsuario,
          detalleOrden?.pass_pppoe,
          detalleOrden?.ppppass,
          detalleLiquidacion?.password_usuario,
          detalleLiquidacion?.passwordUsuario,
          detalleLiquidacion?.pass_pppoe,
          detalleLiquidacion?.ppppass
        ),
      },
      { label: "Plan / velocidad", value: firstValue(detalleOrden?.velocidad) },
      { label: "Precio plan", value: firstValue(detalleOrden?.precio_plan, detalleOrden?.precioPlan) },
      { label: "Solicitar pago", value: firstValue(detalleOrden?.solicitar_pago, detalleOrden?.solicitarPago) },
      { label: "Monto cobrar", value: firstValue(detalleOrden?.monto_cobrar, detalleOrden?.montoCobrar) },
      { label: "SN ONU", value: firstValue(detalleOrden?.sn_onu, detalleLiquidacion?.sn_onu_liquidacion, detalleLiquidacion?.sn_onu) },
      { label: "Codigo etiqueta", value: firstValue(detalleOrden?.codigo_etiqueta, detalleOrden?.codigoEtiqueta, detalleLiquidacion?.codigo_etiqueta) },
      { label: "Autor orden", value: firstValue(detalleOrden?.autor_orden, detalleOrden?.autorOrden, detalleLiquidacion?.autor_orden) },
      { label: "Creada", value: formatDateTimeLabel(firstValue(detalleOrden?.fecha_creacion, detalleOrden?.created_at, detalleLiquidacion?.created_at)) },
      { label: "Descripcion", value: firstValue(detalleOrden?.descripcion, detalleLiquidacion?.descripcion, detalleLiquidacion?.observacion_final) },
    ],
    [detalleOrden, detalleLiquidacion, resolverNombreTecnico]
  );
  const detalleLiquidacionCampos = useMemo(
    () => [
      { label: "Codigo", value: firstValue(detalleLiquidacion?.codigo, detalleLiquidacion?.codigo_orden) },
      { label: "ID liquidacion", value: firstValue(detalleLiquidacion?.id) },
      { label: "Fuente", value: firstValue(detalleLiquidacion?.fuente, detalleLiquidacion?.origen) },
      { label: "ID orden origen", value: firstValue(detalleLiquidacion?.orden_original_id) },
      { label: "Estado", value: firstValue(detalleLiquidacion?.estado) },
      { label: "Resultado", value: firstValue(detalleLiquidacion?.resultado_final) },
      { label: "Tecnico liquida", value: resolverNombreTecnico(firstValue(detalleLiquidacion?.tecnico_liquida, detalleLiquidacion?.tecnico)) },
      { label: "Fecha liquidacion", value: formatDateTimeLabel(firstValue(detalleLiquidacion?.fecha_liquidacion, detalleLiquidacion?.created_at)) },
      { label: "SN ONU", value: firstValue(detalleLiquidacion?.sn_onu_liquidacion, detalleLiquidacion?.sn_onu) },
      { label: "Codigo etiqueta", value: firstValue(detalleLiquidacion?.codigo_etiqueta) },
      { label: "DNI", value: firstValue(detalleLiquidacion?.dni, detalleOrden?.dni) },
      { label: "Celular", value: firstValue(detalleLiquidacion?.celular, detalleLiquidacion?.movil, detalleLiquidacion?.telefono, detalleOrden?.celular) },
      { label: "Direccion", value: firstValue(detalleLiquidacion?.direccion, detalleOrden?.direccion) },
      { label: "Usuario PPPoE", value: firstValue(detalleLiquidacion?.usuario_nodo, detalleLiquidacion?.user_pppoe, detalleLiquidacion?.pppuser, detalleLiquidacion?.user, detalleOrden?.usuario_nodo) },
      { label: "Clave PPPoE", value: firstValue(detalleLiquidacion?.password_usuario, detalleLiquidacion?.pass_pppoe, detalleLiquidacion?.ppppass, detalleOrden?.password_usuario) },
      { label: "Cobro", value: firstValue(detalleLiquidacion?.cobro_realizado) },
      { label: "Monto cobrado", value: firstValue(detalleLiquidacion?.monto_cobrado, detalleLiquidacion?.monto_cobrar) },
      { label: "Medio pago", value: firstValue(detalleLiquidacion?.medio_pago) },
      { label: "Parametro", value: firstValue(detalleLiquidacion?.parametro) },
      { label: "Observacion", value: firstValue(detalleLiquidacion?.observacion_final) },
    ],
    [detalleLiquidacion, resolverNombreTecnico]
  );
  const detalleRelacionCampos = useMemo(
    () => [
      { label: "ID detalle equipo", value: firstValue(detalleEqLiquidado?.id) },
      { label: "ID liquidacion", value: firstValue(detalleEqLiquidado?.liquidacion_id) },
      { label: "Accion equipo", value: firstValue(detalleEqLiquidado?.accion) },
      { label: "QR relacionado", value: firstValue(detalleEqLiquidado?.codigo) },
      { label: "Serial relacionado", value: firstValue(detalleEqLiquidado?.serial) },
      { label: "Tipo relacionado", value: firstValue(detalleEqLiquidado?.tipo) },
      { label: "Marca/Modelo", value: `${firstValue(detalleEqLiquidado?.marca, "-")} ${firstValue(detalleEqLiquidado?.modelo)}`.trim() },
    ],
    [detalleEqLiquidado]
  );
  const detalleUbicacion = firstValue(detalleOrden?.ubicacion, detalleLiquidacion?.ubicacion);
  const detalleDireccion = firstValue(detalleOrden?.direccion, detalleLiquidacion?.direccion);
  const detalleCoords = parseCoordsText(detalleUbicacion);
  const detalleMapQuery = buildMapQuery(detalleUbicacion, detalleDireccion);
  const detalleMapUrl = buildGoogleMapsUrl(detalleMapQuery);
  const detalleMapEmbedUrl = buildGoogleMapsEmbedUrl(detalleMapQuery);
  const mostrarResumenGeneral = tab === "catalogo" || tab === "stockTecnico";
  const mostrarBuscadoresGenerales = tab === "catalogo" || tab === "stockTecnico";
  const detalleOrdenCamposConValor = useMemo(
    () => detalleOrdenCampos.filter((item) => !isPlaceholderValue(item?.value)),
    [detalleOrdenCampos]
  );
  const detalleLiquidacionCamposConValor = useMemo(
    () => detalleLiquidacionCampos.filter((item) => !isPlaceholderValue(item?.value)),
    [detalleLiquidacionCampos]
  );
  const detalleOrdenCamposVisibles = useMemo(
    () =>
      catalogoVerMas.orden
        ? detalleOrdenCamposConValor
        : detalleOrdenCamposConValor.slice(0, DETALLE_CAMPOS_RESUMEN),
    [catalogoVerMas.orden, detalleOrdenCamposConValor]
  );
  const detalleLiquidacionCamposVisibles = useMemo(
    () =>
      catalogoVerMas.liquidacion
        ? detalleLiquidacionCamposConValor
        : detalleLiquidacionCamposConValor.slice(0, DETALLE_CAMPOS_RESUMEN),
    [catalogoVerMas.liquidacion, detalleLiquidacionCamposConValor]
  );
  const detalleRelacionCamposVisibles = useMemo(
    () => (catalogoVerMas.relacion ? detalleRelacionCampos : detalleRelacionCampos.slice(0, DETALLE_CAMPOS_RESUMEN)),
    [catalogoVerMas.relacion, detalleRelacionCampos]
  );
  const toggleCatalogoVerMas = useCallback((section) => {
    setCatalogoVerMas((prev) => ({ ...prev, [section]: !prev?.[section] }));
  }, []);
  const cambiarCabeceraLote = useCallback((key, value) => {
    const next = String(value || "");
    setEqForm((prev) => {
      if (key === "empresa") return { ...prev, empresa: next };
      return { ...prev, [key]: next };
    });
  }, []);
  const liberarCabeceraLote = useCallback(() => {
    const ok = window.confirm("Cambiar cabecera limpiara la lista temporal actual. Continuar?");
    if (!ok) return;
    setEqPendReg([]);
    setQrRegistroMsg("");
  }, []);
  const seleccionarArticuloRegistro = useCallback((articuloId) => {
    const id = String(articuloId || "").trim();
    setArticuloRegistroId(id);
    if (!id) {
      setEqForm((prev) => ({ ...prev, tipo: "", marca: "", modelo: "" }));
      return;
    }
    const item = articulos.find((a) => String(a.id) === id);
    if (!item) return;
    setEqForm((prev) => ({
      ...prev,
      tipo: item.tipo || "",
      marca: item.marca || "",
      modelo: item.modelo || "",
    }));
    setQrRegistroMsg("");
  }, [articulos]);
  const limpiarFormularioArticulo = useCallback(() => {
    setArtForm({ ...emptyArt });
    setArtEditId("");
    setArticulosMsg("");
  }, []);
  const editarArticulo = useCallback((id) => {
    const item = articulos.find((a) => String(a.id) === String(id));
    if (!item) return;
    setArtForm({
      tipo: String(item.tipo || ""),
      marca: String(item.marca || ""),
      modelo: String(item.modelo || ""),
      descripcion: String(item.descripcion || ""),
      foto: String(item.foto || ""),
    });
    setArtEditId(String(item.id));
    setArticulosMsg(`Editando: ${item.tipo} | ${item.marca} | ${item.modelo}`);
  }, [articulos]);
  const guardarArticulo = useCallback(() => {
    const run = async () => {
      const editId = String(artEditId || "").trim();
      const payload = normalizarArticulo({
        tipo: artForm.tipo,
        marca: artForm.marca,
        modelo: artForm.modelo,
        descripcion: artForm.descripcion,
        foto: artForm.foto,
      });
      if (![payload.tipo, payload.marca, payload.modelo].every(Boolean)) {
        setArticulosMsg("Completa tipo, marca y modelo.");
        return;
      }
      if (articulos.some((a) => String(a.id) !== editId && articuloKey(a) === articuloKey(payload))) {
        setArticulosMsg("Ese articulo ya existe.");
        return;
      }

      if (articulosEnSupabase && isSupabaseConfigured) {
        if (editId) {
          const upd = await supabase
            .from(INVENTARIO_ARTICULOS_TABLE)
            .update({
              tipo: payload.tipo,
              marca: payload.marca,
              modelo: payload.modelo,
              descripcion: payload.descripcion,
              foto_referencia: payload.foto,
            })
            .eq("id", editId);
          if (upd.error) {
            setArticulosMsg(upd.error.message || "No se pudo actualizar articulo.");
            return;
          }
          setArticulos((prev) => prev.map((a) => (String(a.id) === editId ? { ...a, ...payload, id: editId } : a)));
        } else {
          const ins = await supabase
            .from(INVENTARIO_ARTICULOS_TABLE)
            .insert([
              {
                tipo: payload.tipo,
                marca: payload.marca,
                modelo: payload.modelo,
                descripcion: payload.descripcion,
                foto_referencia: payload.foto,
              },
            ])
            .select("id,tipo,marca,modelo,descripcion,foto_referencia")
            .maybeSingle();
          if (ins.error) {
            setArticulosMsg(ins.error.message || "No se pudo guardar articulo.");
            return;
          }
          const inserted = normalizarArticulo({
            id: ins.data?.id,
            tipo: ins.data?.tipo,
            marca: ins.data?.marca,
            modelo: ins.data?.modelo,
            descripcion: ins.data?.descripcion,
            foto: ins.data?.foto_referencia,
          });
          setArticulos((prev) => [inserted, ...prev]);
        }
        if (String(articuloRegistroId) === editId) {
          setEqForm((prev) => ({ ...prev, tipo: payload.tipo, marca: payload.marca, modelo: payload.modelo }));
        }
        setArticulosMsg(editId ? "Articulo actualizado." : "Articulo guardado.");
        setArtEditId("");
        setArtForm({ ...emptyArt });
        return;
      }

      if (editId) {
        setArticulos((prev) => prev.map((a) => (String(a.id) === editId ? { ...a, ...payload, id: editId } : a)));
        if (String(articuloRegistroId) === editId) {
          setEqForm((prev) => ({ ...prev, tipo: payload.tipo, marca: payload.marca, modelo: payload.modelo }));
        }
        setArticulosMsg("Articulo actualizado (local).");
        setArtEditId("");
        setArtForm({ ...emptyArt });
        return;
      }
      setArticulos((prev) => [{ ...payload, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, ...prev]);
      setArtForm({ ...emptyArt });
      setArticulosMsg("Articulo guardado (local).");
    };
    void run();
  }, [artEditId, artForm, articulos, articuloRegistroId, articulosEnSupabase]);
  const actualizarFotoArticulo = useCallback(async (id, file) => {
    if (!file) return;
    try {
      const data = await readImageAsDataUrl(file);
      if (articulosEnSupabase && isSupabaseConfigured) {
        const upd = await supabase
          .from(INVENTARIO_ARTICULOS_TABLE)
          .update({ foto_referencia: String(data || "") })
          .eq("id", id);
        if (upd.error) {
          setArticulosMsg(upd.error.message || "No se pudo actualizar la foto del articulo.");
          return;
        }
      }
      setArticulos((prev) => prev.map((a) => (String(a.id) === String(id) ? { ...a, foto: String(data || "") } : a)));
      if (String(artEditId) === String(id)) {
        setArtForm((prev) => ({ ...prev, foto: String(data || "") }));
      }
      setArticulosMsg("Foto del articulo actualizada.");
    } catch {
      setArticulosMsg("No se pudo leer la imagen del articulo.");
    }
  }, [artEditId, articulosEnSupabase]);
  const quitarFotoArticulo = useCallback((id) => {
    const run = async () => {
      if (articulosEnSupabase && isSupabaseConfigured) {
        const upd = await supabase.from(INVENTARIO_ARTICULOS_TABLE).update({ foto_referencia: "" }).eq("id", id);
        if (upd.error) {
          setArticulosMsg(upd.error.message || "No se pudo quitar foto.");
          return;
        }
      }
      setArticulos((prev) => prev.map((a) => (String(a.id) === String(id) ? { ...a, foto: "" } : a)));
    };
    void run();
    if (String(artEditId) === String(id)) {
      setArtForm((prev) => ({ ...prev, foto: "" }));
    }
    setArticulosMsg("Foto del articulo quitada.");
  }, [artEditId, articulosEnSupabase]);
  const eliminarArticulo = useCallback((id) => {
    const item = articulos.find((a) => String(a.id) === String(id));
    if (!item) return;
    const ok = window.confirm(`Eliminar articulo ${item.tipo} ${item.marca} ${item.modelo}?`);
    if (!ok) return;
    const run = async () => {
      if (articulosEnSupabase && isSupabaseConfigured) {
        const del = await supabase.from(INVENTARIO_ARTICULOS_TABLE).delete().eq("id", id);
        if (del.error) {
          setArticulosMsg(del.error.message || "No se pudo eliminar articulo.");
          return;
        }
      }
      setArticulos((prev) => prev.filter((a) => String(a.id) !== String(id)));
    };
    void run();
    if (String(artEditId) === String(id)) {
      setArtEditId("");
      setArtForm({ ...emptyArt });
    }
    if (String(articuloRegistroId) === String(id)) {
      setArticuloRegistroId("");
      setEqForm((prev) => ({ ...prev, tipo: "", marca: "", modelo: "", precio: "" }));
    }
  }, [artEditId, articuloRegistroId, articulos, articulosEnSupabase]);

  const validarQrRegistro = useCallback((codigo) => {
    const qr = String(codigo || "").trim();
    if (!qr) return { ok: false, text: "Escanea o ingresa un codigo QR." };
    if (equipos.some((e) => norm(e.codigo) === norm(qr))) return { ok: false, text: "QR duplicado: ya existe en inventario." };
    if (eqPendReg.some((e) => norm(e.codigo_qr) === norm(qr))) return { ok: false, text: "QR duplicado: ya esta en lista temporal." };
    return { ok: true, text: "QR valido para registrar." };
  }, [equipos, eqPendReg]);
  const limpiarEquipoScan = useCallback(() => {
    setEqForm((p) => ({ ...p, codigo: "", serial: "", foto: "" }));
    setQrRegistroMsg("");
  }, []);
  const agregarEquipoTemporal = useCallback((codigoEntrada = "") => {
    const codigo = String(codigoEntrada || eqForm.codigo || "").trim();
    const serial = String(eqForm.serial || "").trim();
    if (!articuloRegistroId) {
      const msg = "Selecciona un articulo del catalogo antes de registrar equipos.";
      setQrRegistroMsg(msg);
      window.alert(msg);
      return false;
    }
    const valid = validarQrRegistro(codigo);
    if (!valid.ok) {
      setQrRegistroMsg(valid.text);
      window.alert(valid.text);
      return false;
    }
    if (![eqForm.empresa, eqForm.tipo, eqForm.marca, eqForm.modelo].every((x) => String(x || "").trim())) {
      const msg = "Completa la cabecera del lote (empresa/tipo/marca/modelo) antes de registrar.";
      setQrRegistroMsg(msg);
      window.alert(msg);
      return false;
    }
    if (almacenesDisponibles && !String(almacenEqId || "").trim()) {
      const msg = "Selecciona un almacén para registrar equipos.";
      setQrRegistroMsg(msg);
      window.alert(msg);
      return false;
    }
    if (!String(eqForm.foto || "").trim()) {
      const msg = "Adjunta foto del serial/equipo antes de agregar.";
      setQrRegistroMsg(msg);
      window.alert(msg);
      return false;
    }
    const selectedAlmacenEq = getAlmacenById(almacenEqId);
    setEqPendReg((prev) => [
      ...prev,
      {
        empresa: eqForm.empresa,
        tipo: eqForm.tipo,
        marca: eqForm.marca,
        modelo: eqForm.modelo,
        precio_unitario: num(eqForm.precio),
        codigo_qr: codigo,
        serial_mac: serial,
        foto_referencia: eqForm.foto,
        estado: "disponible",
        tecnico_asignado: "",
        almacen_id: almacenesDisponibles ? String(almacenEqId || "") : null,
        almacen_nombre: almacenesDisponibles ? String(selectedAlmacenEq?.nombre || "") : "",
        tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    ]);
    setQrRegistroMsg(`Equipo agregado: ${codigo}.`);
    limpiarEquipoScan();
    return true;
  }, [almacenEqId, almacenesDisponibles, articuloRegistroId, eqForm, getAlmacenById, limpiarEquipoScan, validarQrRegistro]);
  const agregarEquipoAsignacionPorCodigo = useCallback((codigoEntrada = "") => {
    const qr = String(codigoEntrada || asigEqCodigo || "").trim();
    const tecIn = String(asigEq.tecnico || "").trim();
    const tec = resolverNombreTecnico(tecIn);
    if (!tec || !esTecnicoRegistrado(tecIn)) {
      const msg = "Selecciona un tecnico valido antes de escanear salida.";
      setQrAsignacionMsg(msg);
      window.alert(msg);
      return false;
    }
    if (!qr) {
      const msg = "Ingresa o escanea un QR para asignar.";
      setQrAsignacionMsg(msg);
      return false;
    }
    const target = equiposDispAsig.find((e) => norm(e.codigo) === norm(qr));
    if (!target) {
      const msg = "No se encontro ese equipo en almacen o ya fue asignado.";
      setQrAsignacionMsg(msg);
      window.alert(msg);
      return false;
    }
    if (eqPendAsig.some((x) => String(x.id) === String(target.id))) {
      const msg = "Ese equipo ya esta en la lista de salida.";
      setQrAsignacionMsg(msg);
      return false;
    }
    setEqPendAsig((prev) => [
      ...prev,
      {
        tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        id: target.id,
        tecnico: tec,
        codigo: target.codigo,
        tipo: target.tipo,
        marca: target.marca,
        modelo: target.modelo,
        precio: target.precio,
        almacenId: target.almacenId || "",
        almacenNombre: target.almacenNombre || "",
      },
    ]);
    setAsigEq((p) => ({ ...p, tecnico: tec, equipoId: "" }));
    setAsigEqCodigo("");
    setQrAsignacionMsg(`Equipo agregado a salida: ${target.codigo || target.id}.`);
    return true;
  }, [asigEq.tecnico, asigEqCodigo, eqPendAsig, equiposDispAsig, esTecnicoRegistrado, resolverNombreTecnico]);
  const editarEquipoTemporal = useCallback((item) => {
    const target = item || {};
    const articuloMatch = (articulos || []).find(
      (a) => articuloKey(a) === articuloKey({ tipo: target.tipo, marca: target.marca, modelo: target.modelo })
    );
    if (articuloMatch?.id) {
      setArticuloRegistroId(String(articuloMatch.id));
    }
    if (almacenesDisponibles && String(target?.almacen_id || "").trim()) {
      setAlmacenEqId(String(target.almacen_id || "").trim());
    }
    setEqForm({
      empresa: String(target.empresa || "Americanet"),
      tipo: String(target.tipo || ""),
      marca: String(target.marca || ""),
      modelo: String(target.modelo || ""),
      precio: String(target.precio_unitario ?? ""),
      codigo: String(target.codigo_qr || ""),
      serial: String(target.serial_mac || ""),
      foto: String(target.foto_referencia || ""),
    });
    setEqPendReg((prev) => prev.filter((x) => x.tempId !== target.tempId));
    setQrRegistroMsg(`Editando equipo: ${String(target.codigo_qr || "").trim() || "SIN-QR"}.`);
  }, [almacenesDisponibles, articulos]);

  const onFileEq = useCallback(async (e) => { const file = e?.target?.files?.[0]; if (!file) return; const data = await readImageAsDataUrl(file); setEqForm((p) => ({ ...p, foto: data })); e.target.value = ""; }, []);
  const onFileMat = useCallback(async (e) => { const file = e?.target?.files?.[0]; if (!file) return; const data = await readImageAsDataUrl(file); setMatForm((p) => ({ ...p, foto: data })); e.target.value = ""; }, []);
  const onFileArt = useCallback(async (e) => { const file = e?.target?.files?.[0]; if (!file) return; const data = await readImageAsDataUrl(file); setArtForm((p) => ({ ...p, foto: data })); e.target.value = ""; }, []);
  const registrarIngresoMaterial = useCallback(async () => {
    const materialId = String(ingresoMat.materialId || "").trim();
    const cantidad = num(ingresoMat.cantidad, -1);
    const unidad = String(ingresoMat.unidad || "").trim() || "unidad";
    const costo = num(ingresoMat.costo, 0);
    if (!materialId || cantidad <= 0) {
      window.alert("Selecciona material y cantidad valida para ingreso.");
      return;
    }
    if (almacenesDisponibles && !String(almacenMovId || "").trim()) {
      window.alert("Selecciona un almacén para registrar ingreso.");
      return;
    }
    const mat = materiales.find((m) => String(m.id) === materialId);
    if (!mat) {
      window.alert("Material no encontrado.");
      return;
    }
    const selectedAlmacenMov = getAlmacenById(almacenMovId);
    await registrarMov({
      tipoItem: "material",
      movimiento: "ingreso",
      motivo: "Ingreso almacen material",
      itemNombre: mat.nombre,
      referencia: materialRef(materialId),
      cantidad,
      unidad,
      costoUnitario: costo > 0 ? costo : mat.costo,
      tecnico: "",
      almacenId: almacenesDisponibles ? String(almacenMovId || "") : "",
      almacenNombre: almacenesDisponibles ? String(selectedAlmacenMov?.nombre || "") : "",
    });
    setIngresoMat((prev) => ({ ...prev, cantidad: "", costo: "", unidad: mat.unidad || unidad }));
    await cargar();
  }, [almacenMovId, almacenesDisponibles, cargar, getAlmacenById, ingresoMat, materiales, registrarMov]);

  const registrarSolicitudDevolucionInventario = useCallback(
    async (payload) => {
      if (!solicitudesDisponibles) {
        window.alert("Falta tabla de solicitudes de devolucion en inventario. Ejecuta la migracion SQL.");
        return false;
      }
      const base = {
        tipo_solicitud: String(payload?.tipo_solicitud || "DEVOLUCION").toUpperCase(),
        tipo_item: String(payload?.tipo_item || ""),
        equipo_id: payload?.equipo_id ? String(payload.equipo_id) : null,
        material_asig_id: payload?.material_asig_id ? String(payload.material_asig_id) : null,
        material_id: payload?.material_id ? String(payload.material_id) : null,
        codigo_qr: String(payload?.codigo_qr || ""),
        material_nombre: String(payload?.material_nombre || ""),
        cantidad: num(payload?.cantidad, 0),
        unidad: String(payload?.unidad || "unidad"),
        es_legacy_sin_qr: payload?.es_legacy_sin_qr === true,
        identificador_alterno: String(payload?.identificador_alterno || ""),
        nodo_origen: String(payload?.nodo_origen || ""),
        estado_retorno: String(payload?.estado_retorno || "BUENO").toUpperCase(),
        motivo: String(payload?.motivo || ""),
        tecnico: String(payload?.tecnico || ""),
        actor_solicita: String(payload?.actor_solicita || ""),
        estado: "PENDIENTE",
        movimiento_ref: String(payload?.movimiento_ref || ""),
      };
      const ins = await insertOneWithColumnFallback(INVENTARIO_DEV_SOL_TABLE, base);
      if (!ins.ok) {
        if (tableMissing(INVENTARIO_DEV_SOL_TABLE, ins.error)) {
          setSolicitudesDisponibles(false);
          window.alert("Falta tabla de solicitudes de devolucion en inventario. Ejecuta la migracion SQL.");
          return false;
        }
        window.alert(ins.error?.message || "No se pudo crear la solicitud.");
        return false;
      }
      await cargar();
      return true;
    },
    [cargar, insertOneWithColumnFallback, solicitudesDisponibles]
  );
  const generarCodigoTemporalRecuperacion = useCallback(() => {
    const stamp = Date.now().toString().slice(-6);
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `REC-LEG-${stamp}-${rand}`;
  }, []);
  const registrarEquipoLegacyEnCatalogo = useCallback(async (codigoTemporal = "", identificador = "") => {
    const codigo = String(codigoTemporal || "").trim();
    if (!codigo) throw new Error("Codigo temporal invalido para registrar equipo legacy.");
    const existente = await supabase.from("equipos_catalogo").select("id").eq("codigo_qr", codigo).limit(1).maybeSingle();
    if (existente.error) throw existente.error;
    if (existente.data?.id) {
      const candidatos = ["almacen", "disponible", "libre"];
      let ok = false;
      let lastErr = null;
      for (const estadoIntento of candidatos) {
        const upd = await supabase.from("equipos_catalogo").update({ estado: estadoIntento, tecnico_asignado: "" }).eq("id", existente.data.id);
        if (!upd.error) {
          ok = true;
          break;
        }
        lastErr = upd.error;
      }
      if (!ok && lastErr) throw lastErr;
      return;
    }
    const ins = await insertOneWithColumnFallback("equipos_catalogo", {
      empresa: "Americanet",
      tipo: "LEGACY",
      marca: "Recuperado",
      modelo: String(identificador || "Sin modelo").slice(0, 80),
      precio_unitario: 0,
      codigo_qr: codigo,
      serial_mac: "",
      foto_referencia: "",
      estado: "almacen",
      tecnico_asignado: "",
      almacen_id: "",
      almacen_nombre: "",
    });
    if (!ins.ok) throw ins.error;
  }, [insertOneWithColumnFallback]);
  const solicitarRecuperacionEquipo = useCallback(async () => {
    if (!esTecnico) {
      window.alert("Solo el tecnico puede solicitar recuperaciones.");
      return;
    }
    const esLegacySinQr = window.confirm("Recuperacion sin QR (legacy)? Aceptar = SI, Cancelar = con QR.");
    const codigoQrIngresado = esLegacySinQr ? "" : String(window.prompt("QR del equipo a recuperar") || "").trim();
    if (!esLegacySinQr && !codigoQrIngresado) return;
    const identificadorAlterno = esLegacySinQr
      ? String(window.prompt("Identificador alterno (obligatorio, ej: MAC parcial / serie / etiqueta)") || "").trim()
      : "";
    if (esLegacySinQr && !identificadorAlterno) {
      window.alert("En modo legacy debes ingresar identificador alterno.");
      return;
    }
    const nodoOrigen = String(window.prompt("Nodo origen (obligatorio)", String(sessionUser?.nodo || "")) || "").trim();
    if (!nodoOrigen) {
      window.alert("Debes indicar nodo origen.");
      return;
    }
    const motivo = String(window.prompt("Motivo de recuperacion (obligatorio)") || "").trim();
    if (!motivo) return;
    const ordenRef = String(window.prompt("Referencia de orden (opcional)") || "").trim();
    const target = esLegacySinQr
      ? null
      : (eqBaseTec || []).find((e) => norm(e.codigo) === norm(codigoQrIngresado));
    if (!esLegacySinQr && !target) {
      window.alert("No se encontro ese QR en tus equipos.");
      return;
    }
    if (!esLegacySinQr && !String(target?.tecnico || "").trim()) {
      window.alert("El equipo no tiene tecnico asignado actualmente.");
      return;
    }
    const codigoTemporal = esLegacySinQr ? generarCodigoTemporalRecuperacion() : "";
    const refSolicitud = esLegacySinQr ? codigoTemporal : String(target?.codigo || codigoQrIngresado || "");
    const clavePendiente = String(refSolicitud || "").trim().toLowerCase();
    const yaPendiente =
      (target && solicitudesPendientesPorEquipo.has(String(target?.id || ""))) ||
      (clavePendiente && solicitudesPendientesPorCodigo.has(clavePendiente));
    if (yaPendiente) {
      window.alert("Este equipo ya tiene una solicitud pendiente.");
      return;
    }
    const ok = await registrarSolicitudDevolucionInventario({
      tipo_solicitud: "RECUPERACION",
      tipo_item: "equipo",
      equipo_id: target ? String(target.id || "") : null,
      material_asig_id: null,
      material_id: null,
      codigo_qr: refSolicitud,
      material_nombre: "",
      cantidad: 1,
      unidad: "unidad",
      es_legacy_sin_qr: esLegacySinQr,
      identificador_alterno: identificadorAlterno,
      nodo_origen: nodoOrigen,
      estado_retorno: "BUENO",
      motivo: `${motivo}${ordenRef ? ` | Orden: ${ordenRef}` : ""}`,
      tecnico: String(target?.tecnico || tecnicoSesion || ""),
      actor_solicita: String(sessionUser?.nombre || sessionUser?.username || tecnicoSesion || "").trim(),
      movimiento_ref: refSolicitud,
    });
    if (ok) {
      window.alert("Solicitud de recuperacion enviada para aprobacion de almacen.");
    }
  }, [
    eqBaseTec,
    esTecnico,
    generarCodigoTemporalRecuperacion,
    registrarSolicitudDevolucionInventario,
    sessionUser?.nombre,
    sessionUser?.nodo,
    sessionUser?.username,
    solicitudesPendientesPorCodigo,
    solicitudesPendientesPorEquipo,
    tecnicoSesion,
  ]);

  const devolverEquipoTecnico = useCallback(
    async (item, estadoRetorno = "BUENO") => {
      if (!esTecnico) {
        window.alert("Solo el tecnico asignado puede crear solicitudes de devolucion.");
        return;
      }
      const itemId = String(item?.id || "").trim();
      if (!itemId) return;
      const existePendiente = solicitudesPendientesPorEquipo.has(itemId);
      if (existePendiente) {
        window.alert("Ya existe una solicitud pendiente para este equipo.");
        return;
      }
      const estado = String(estadoRetorno || "BUENO").trim().toUpperCase();
      const esDaniado = estado === "DANIADO";
      const motivoRaw = window.prompt(esDaniado ? "Motivo de solicitud (equipo daniado)" : "Motivo de solicitud");
      const motivo = String(motivoRaw || "").trim();
      if (!motivo) return;
      const ordenRef = String(window.prompt("Referencia de orden (opcional)") || "").trim();
      const tecnicoRef = resolverNombreTecnico(item?.tecnico || tecnicoSesion);
      const ok = await registrarSolicitudDevolucionInventario({
        tipo_solicitud: "DEVOLUCION",
        tipo_item: "equipo",
        equipo_id: itemId,
        material_asig_id: null,
        material_id: null,
        codigo_qr: String(item?.codigo || ""),
        material_nombre: "",
        cantidad: 1,
        unidad: "unidad",
        es_legacy_sin_qr: false,
        identificador_alterno: "",
        nodo_origen: "",
        estado_retorno: estado,
        motivo: `${motivo}${ordenRef ? ` | Orden: ${ordenRef}` : ""}`,
        tecnico: tecnicoRef,
        actor_solicita: String(sessionUser?.nombre || sessionUser?.username || tecnicoRef || "").trim(),
        estado: "PENDIENTE",
      });
      if (ok) {
        window.alert("Solicitud de devolucion enviada. Almacen debe aprobarla.");
      }
    },
    [esTecnico, registrarSolicitudDevolucionInventario, resolverNombreTecnico, sessionUser?.nombre, sessionUser?.username, solicitudesPendientesPorEquipo, tecnicoSesion]
  );

  const devolverMaterialTecnico = useCallback(
    async (item, tipoSolicitud = "DEVOLUCION") => {
      if (!esTecnico) {
        window.alert("Solo el tecnico asignado puede crear solicitudes de devolucion.");
        return;
      }
      const rowId = String(item?.id || "").trim();
      if (!rowId) return;
      const disponible = num(item?.disponible, 0);
      if (disponible <= 0) {
        window.alert("No hay saldo disponible para devolver.");
        return;
      }
      const pendienteAcumulado = num(pendienteMaterialPorAsignacion.get(rowId), 0);
      const maxDisponible = Math.max(0, disponible - pendienteAcumulado);
      if (maxDisponible <= 0) {
        window.alert("Ya existe solicitud pendiente por todo el saldo disponible de este material.");
        return;
      }
      const cantidadRaw = window.prompt(
        `Cantidad a solicitar (max ${maxDisponible.toFixed(2)} ${item?.unidad || "unidad"})`,
        String(maxDisponible)
      );
      if (cantidadRaw === null) return;
      const cantidad = num(cantidadRaw, -1);
      if (cantidad <= 0) {
        window.alert("Cantidad invalida.");
        return;
      }
      if (cantidad > maxDisponible) {
        window.alert(`No puedes solicitar mas de ${maxDisponible.toFixed(2)} ${item?.unidad || "unidad"}.`);
        return;
      }
      const tipo = String(tipoSolicitud || "DEVOLUCION").trim().toUpperCase();
      const esMerma = tipo === "MERMA";
      const estado = esMerma ? "DANIADO" : "BUENO";
      const motivoRaw = window.prompt(esMerma ? "Motivo de merma (obligatorio)" : "Motivo de solicitud");
      const motivo = String(motivoRaw || "").trim();
      if (esMerma && !motivo) {
        window.alert("Para merma debes ingresar motivo.");
        return;
      }
      const tecnicoRef = resolverNombreTecnico(item?.tecnico || tecnicoSesion);
      const ok = await registrarSolicitudDevolucionInventario({
        tipo_solicitud: tipo,
        tipo_item: "material",
        equipo_id: null,
        material_asig_id: rowId,
        material_id: String(item?.materialId || ""),
        codigo_qr: "",
        material_nombre: String(item?.materialNombre || item?.material || ""),
        cantidad,
        unidad: String(item?.unidad || "unidad"),
        estado_retorno: estado,
        motivo: motivo || (esMerma ? "Solicitud de merma de stock tecnico" : "Solicitud de devolucion de stock tecnico"),
        tecnico: tecnicoRef,
        actor_solicita: String(sessionUser?.nombre || sessionUser?.username || tecnicoRef || "").trim(),
        estado: "PENDIENTE",
      });
      if (ok) {
        window.alert(esMerma ? "Solicitud de merma enviada para revision de almacen." : "Solicitud de devolucion enviada. Almacen debe aprobarla.");
      }
    },
    [esTecnico, pendienteMaterialPorAsignacion, registrarSolicitudDevolucionInventario, resolverNombreTecnico, sessionUser?.nombre, sessionUser?.username, tecnicoSesion]
  );

  const aprobarSolicitudDevolucionInventario = useCallback(
    async (sol) => {
      if (!puedeAprobarDevoluciones) return;
      const id = String(sol?.id || "").trim();
      if (!id) return;
      setSolicitudProcesandoId(id);
      try {
        const tipo = String(sol?.tipoItem || "").toLowerCase();
        const tipoSolicitud = String(sol?.tipoSolicitud || "DEVOLUCION").toUpperCase();
        const estadoRetorno = String(sol?.estadoRetorno || "BUENO").toUpperCase();
        if (tipo === "equipo") {
          const equipoId = String(sol?.equipoId || "").trim();
          const qrRef = String(sol?.codigoQr || "").trim().toLowerCase();
          const esLegacySinQr = sol?.esLegacySinQr === true;
          const identificadorAlterno = String(sol?.identificadorAlterno || "").trim();
          const codigoTemporal = String(sol?.codigoQr || "").trim();
          const item = equipos.find((e) => String(e.id) === equipoId)
            || (qrRef ? equipos.find((e) => String(e?.codigo || "").trim().toLowerCase() === qrRef) : null);
          if (!item && esLegacySinQr) {
            const registrarEnCatalogo = window.confirm(
              `Equipo legacy sin QR.\n\nCodigo temporal: ${codigoTemporal || "-"}\nIdentificador: ${identificadorAlterno || "-"}\n\nAceptar: registrar en catalogo.\nCancelar: solo trazar en kardex.`
            );
            if (registrarEnCatalogo) {
              await registrarEquipoLegacyEnCatalogo(codigoTemporal, identificadorAlterno);
            }
            await registrarMov({
              tipoItem: "equipo",
              movimiento: "recuperacion_legacy",
              motivo: `Aprobada recuperacion legacy${registrarEnCatalogo ? " (registrado en catalogo)" : ""}: ${String(sol?.motivo || "")}`,
              itemNombre: identificadorAlterno || "Equipo legacy sin QR",
              referencia: codigoTemporal,
              cantidad: 1,
              unidad: "unidad",
              costoUnitario: 0,
              tecnico: String(sol?.tecnico || ""),
              nodo: String(sol?.nodoOrigen || ""),
            });
          } else {
            if (!item) throw new Error("Equipo no encontrado para aprobar la devolucion.");
            const candidatosEstado =
              estadoRetorno === "DANIADO"
                ? ["baja", "almacen", "disponible", "libre"]
                : ["almacen", "disponible", "libre"];
            let lastErr = null;
            for (const estadoIntento of candidatosEstado) {
              const updEq = await supabase.from("equipos_catalogo").update({ estado: estadoIntento, tecnico_asignado: "" }).eq("id", item.id);
              if (!updEq.error) {
                lastErr = null;
                break;
              }
              lastErr = updEq.error;
              const msg = String(updEq.error?.message || "").toLowerCase();
              const esCheck = String(updEq.error?.code || "") === "23514" || msg.includes("check constraint") || msg.includes("estado_check");
              if (!esCheck) break;
            }
            if (lastErr) throw lastErr;
            await registrarMov({
              tipoItem: "equipo",
              movimiento: tipoSolicitud === "RECUPERACION"
                ? "recuperacion_equipo"
                : (estadoRetorno === "DANIADO" ? "devolucion_daniado" : "entrada"),
              motivo: tipoSolicitud === "RECUPERACION"
                ? `Aprobada recuperacion: ${String(sol?.motivo || "")}`
                : `Aprobada devolucion${estadoRetorno === "DANIADO" ? " - DANIADO" : ""}: ${String(sol?.motivo || "")}`,
              itemNombre: equipoNombre(item),
              referencia: String(sol?.codigoQr || item?.codigo || ""),
              cantidad: 1,
              unidad: "unidad",
              costoUnitario: item?.precio || 0,
              tecnico: String(sol?.tecnico || ""),
              nodo: String(sol?.nodoOrigen || ""),
              almacenId: String(item?.almacenId || ""),
              almacenNombre: String(item?.almacenNombre || ""),
            });
          }
        } else if (tipo === "material") {
          const asigId = String(sol?.materialAsigId || "").trim();
          const asig = materialesAsig.find((m) => String(m.id) === asigId);
          if (!asig) throw new Error("Asignacion de material no encontrada.");
          const cantidad = num(sol?.cantidad, -1);
          if (cantidad <= 0) throw new Error("Cantidad invalida en solicitud.");
          const disponible = num(asig?.disponible, 0);
          if (cantidad > disponible) throw new Error(`Cantidad solicitada excede disponible actual (${disponible.toFixed(2)}).`);
          const nuevoDisponible = Math.max(0, disponible - cantidad);
          const asignadoActual = num(asig?.asignado, disponible);
          const nuevoAsignado = Math.max(0, asignadoActual - cantidad);
          let errAsig = null;
          if (nuevoDisponible <= 0 && nuevoAsignado <= 0) {
            const del = await supabase.from("materiales_asignados_tecnicos").delete().eq("id", asigId);
            errAsig = del.error;
          } else {
            const upd = await supabase
              .from("materiales_asignados_tecnicos")
              .update({ cantidad_disponible: nuevoDisponible, cantidad_asignada: nuevoAsignado })
              .eq("id", asigId);
            errAsig = upd.error;
          }
          if (errAsig) throw errAsig;
          const esMerma = tipoSolicitud === "MERMA";
          await registrarMov({
            tipoItem: "material",
            movimiento: esMerma ? "merma" : (estadoRetorno === "DANIADO" ? "devolucion_daniado" : "devolucion"),
            motivo: esMerma
              ? `Aprobada merma: ${sol?.motivo || ""}`
              : `Aprobada devolucion${estadoRetorno === "DANIADO" ? " - DANIADO" : ""}: ${sol?.motivo || ""}`,
            itemNombre: String(sol?.materialNombre || asig?.material || "-"),
            referencia: String(sol?.movimientoRef || materialRef(sol?.materialId || asig?.materialId)),
            cantidad,
            unidad: String(sol?.unidad || asig?.unidad || "unidad"),
            costoUnitario: 0,
            tecnico: String(sol?.tecnico || ""),
            nodo: String(sol?.nodoOrigen || ""),
          });
        } else {
          throw new Error("Tipo de solicitud no soportado.");
        }

        const updSol = await updateByIdWithColumnFallback(INVENTARIO_DEV_SOL_TABLE, id, {
          estado: "APROBADA",
          aprobado_por: String(sessionUser?.nombre || sessionUser?.username || "").trim(),
          aprobado_at: new Date().toISOString(),
        });
        if (!updSol.ok) throw updSol.error;
        await cargar();
        window.alert("Solicitud aprobada y aplicada al inventario.");
      } catch (e) {
        window.alert(String(e?.message || "No se pudo aprobar la solicitud."));
      } finally {
        setSolicitudProcesandoId("");
      }
    },
    [cargar, equipos, materialesAsig, puedeAprobarDevoluciones, registrarEquipoLegacyEnCatalogo, registrarMov, sessionUser?.nombre, sessionUser?.username, updateByIdWithColumnFallback]
  );

  const rechazarSolicitudDevolucionInventario = useCallback(
    async (sol) => {
      if (!puedeAprobarDevoluciones) return;
      const id = String(sol?.id || "").trim();
      if (!id) return;
      const motivoRechazo = String(window.prompt("Motivo de rechazo") || "").trim();
      if (!motivoRechazo) return;
      setSolicitudProcesandoId(id);
      try {
        const updSol = await updateByIdWithColumnFallback(INVENTARIO_DEV_SOL_TABLE, id, {
          estado: "RECHAZADA",
          aprobado_por: String(sessionUser?.nombre || sessionUser?.username || "").trim(),
          aprobado_at: new Date().toISOString(),
          rechazo_motivo: motivoRechazo,
        });
        if (!updSol.ok) throw updSol.error;
        await cargar();
        window.alert("Solicitud rechazada.");
      } catch (e) {
        window.alert(String(e?.message || "No se pudo rechazar la solicitud."));
      } finally {
        setSolicitudProcesandoId("");
      }
    },
    [cargar, puedeAprobarDevoluciones, sessionUser?.nombre, sessionUser?.username, updateByIdWithColumnFallback]
  );

  const exportPdf = useCallback(async () => {
    if (!catalogoOrdenado.length) return window.alert("No hay equipos en el filtro actual para generar PDF.");
    const refsQr = uniqSorted(catalogoOrdenado.map((e) => String(e?.codigo || "").trim()).filter(Boolean));
    const refsSn = uniqSorted(catalogoOrdenado.map((e) => String(e?.serial || "").trim()).filter(Boolean));
    const refNormToFechaAsig = new Map();
    const setFechaAsig = (refValue, fechaValue) => {
      const key = normRef(refValue);
      const fecha = formatDateTimeLabel(fechaValue || "");
      if (!key || !fecha || fecha === "-") return;
      if (!refNormToFechaAsig.has(key)) refNormToFechaAsig.set(key, fecha);
    };

    // Base local (kardex)
    (movimientos || []).forEach((m) => {
      const ref = String(m?.ref || "").trim();
      const movTxt = norm(m?.mov || "");
      const motivo = norm(m?.motivo || "");
      const esAsig = movTxt.includes("salida") && (motivo.includes("asign") || motivo.includes("tecnico"));
      if (esAsig) setFechaAsig(ref, m?.fecha);
    });

    // Enriquecimiento remoto directo para reducir vacios de fecha de asignacion.
    if (isSupabaseConfigured) {
      const addAsignacionDesdeMovs = (rows = []) => {
        (Array.isArray(rows) ? rows : []).forEach((m) => {
          const ref = String(m?.referencia || "").trim();
          const movTxt = norm(m?.movimiento || "");
          const motivo = norm(m?.motivo || "");
          const esAsig = movTxt.includes("salida") && (motivo.includes("asign") || motivo.includes("tecnico"));
          if (esAsig) setFechaAsig(ref, m?.created_at);
        });
      };
      const queryIn = async (table, select, column, values) => {
        const vals = (values || []).filter(Boolean);
        if (!vals.length) return [];
        const out = [];
        for (const chunk of chunkList(vals, 200)) {
          const res = await supabase.from(table).select(select).in(column, chunk).order("id", { ascending: false });
          if (res.error) {
            if (tableMissing(table, res.error) || columnMissing(column, res.error)) return out;
            throw res.error;
          }
          out.push(...(Array.isArray(res.data) ? res.data : []));
        }
        return out;
      };
      try {
        if (refsQr.length || refsSn.length) {
          const [movQr, movSn] = await Promise.all([
            queryIn("inventario_movimientos", "created_at,movimiento,motivo,referencia", "referencia", refsQr),
            queryIn("inventario_movimientos", "created_at,movimiento,motivo,referencia", "referencia", refsSn),
          ]);
          addAsignacionDesdeMovs(movQr);
          addAsignacionDesdeMovs(movSn);
        }
      } catch {
        // Si falla enriquecimiento remoto, seguimos con datos locales disponibles.
      }
    }
    const getFechaAsignacion = (equipo) =>
      firstValue(
        refNormToFechaAsig.get(normRef(equipo?.codigo || "")),
        refNormToFechaAsig.get(normRef(equipo?.serial || "")),
        ""
      );
    const rows = catalogoOrdenado
      .map((e, i) => {
        const fechaAsig = getFechaAsignacion(e) || "-";
        return `<tr><td>${i + 1}</td><td>${escHtml(e.codigo || "-")}</td><td>${escHtml(e.serial || "-")}</td><td>${escHtml(e.tipo || "-")}</td><td>${escHtml(e.marca || "-")}</td><td>${escHtml(e.modelo || "-")}</td><td>${escHtml(estadoGrupo(e.estado))}</td><td>${escHtml(e.tecnico || "-")}</td><td>${escHtml(fechaAsig)}</td><td>${escHtml(e.empresa || "-")}</td></tr>`;
      })
      .join("");
    const tecnicoAplicado = String(tecnicoFiltro || "").trim();
    const html = `<!doctype html><html><head><meta charset='utf-8'/><title>Reporte</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:18px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #d7e2f3;padding:6px;text-align:left}th{background:#eef4ff}</style></head><body><h1>Reporte de equipos</h1><p>Generado: ${escHtml(new Date().toLocaleString())}</p><p>Filtro tecnico: ${escHtml(tecnicoAplicado || "Todos")}</p><table><thead><tr><th>#</th><th>QR</th><th>Serial</th><th>Tipo</th><th>Marca</th><th>Modelo</th><th>Estado</th><th>Tecnico</th><th>Fecha asignacion</th><th>Empresa</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    try {
      const popup = window.open("", "_blank");
      if (popup && popup.document) {
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        popup.focus();
        setTimeout(() => {
          try {
            popup.print();
          } catch {
            // Si el print falla en esta ventana, usamos fallback por Blob.
            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, "_blank");
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
          }
        }, 280);
        return;
      }
    } catch {
      // Continuamos con fallback por Blob.
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const opened = window.open(blobUrl, "_blank");
    if (!opened) window.location.href = blobUrl;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }, [catalogoOrdenado, movimientos, tecnicoFiltro]);

  const construirDetalleDesdeOnu = useCallback((equipo, filaOnu, cliente = null) => {
    if (!filaOnu || !equipo) return null;
    const idxOnu = buildAppSheetRowIndex(filaOnu);
    const readOnu = (aliases = []) => String(getAppSheetValue(idxOnu, aliases)).trim();

    const estadoOnu = firstValue(readOnu(["Estado"]), equipo?.estado);
    const fechaAsignacionOnu = readOnu(["Fecha de Asignacion", "FechaAsignacion", "Fecha Asignacion"]);
    const fechaLiquidacionOnu = readOnu(["FechaLiquidacion", "Fecha Liquidacion"]);
    const fechaRegistroOnu = firstValue(readOnu(["FechaRegistro", "Fecha Registro", "Timestamp"]), fechaAsignacionOnu, fechaLiquidacionOnu);
    const tecnicoAsignadoOnu = resolverNombreTecnico(
      firstValue(readOnu(["TecnicoAsignado", "Tecnico Asignado", "Tecnico"]), equipo?.tecnico, cliente?.tecnico)
    );
    const tecnicoLiquidaOnu = resolverNombreTecnico(readOnu(["LiquidadoPor", "Liquidado Por"]));
    const codigoOrdenOnu = firstValue(
      readOnu(["OrdenID", "Orden ID", "Codigo orden", "CodigoOrden", "Codigo", "Orden", "Codigo Liquidacion", "Codigo liquidacion"]),
      readOnu(["IDLiqui", "ID Liq"])
    );
    const qrOnu = firstValue(
      readOnu(["IDONU", "ID ONU", "Codigo QR", "CodigoQR", "Codigo Interno", "CodigoInterno", "Codigo"]),
      equipo?.codigo
    );
    const serialOnu = firstValue(readOnu(["MAC", "Serial", "Serie", "SN ONU", "SN", "Serial ONU"]), equipo?.serial, qrOnu);

    const nombreCliente = firstValue(readOnu(["Nombre", "Cliente", "Titular", "Nombre Cliente"]), cliente?.nombre);
    const dniCliente = firstValue(readOnu(["DNI", "Cedula", "Documento"]), cliente?.dni);
    const direccionCliente = firstValue(readOnu(["Direccion", "Direccion principal"]), cliente?.direccion);
    const celularCliente = firstValue(readOnu(["Celular", "Telefono", "Movil"]), cliente?.celular);
    const emailCliente = firstValue(readOnu(["Email", "Correo"]), cliente?.email);
    const contactoCliente = firstValue(readOnu(["Contacto"]), cliente?.contacto);
    const nodoCliente = firstValue(readOnu(["Nodo"]), cliente?.nodo);
    const usuarioPppoe = firstValue(readOnu(["UserPPoe", "Usuario", "Usuario nodo", "Usuario PPPoE", "PPPoE"]), cliente?.usuario_nodo);
    const clavePppoe = firstValue(readOnu(["ClavePPoe", "Clave", "Password", "Contrasena"]), cliente?.password_usuario);
    const velocidadPlan = firstValue(readOnu(["Velocidad", "Plan", "Perfil"]), cliente?.velocidad);
    const precioPlanRaw = firstValue(readOnu(["Precio plan", "Precio", "Costo plan"]), cliente?.precio_plan);
    const montoCobroRaw = firstValue(readOnu(["Monto cobrar", "Monto cobrado", "Monto"]));
    const medioPago = firstValue(readOnu(["Medio de pago", "Medio Pago", "Metodo de pago", "Forma de pago"]));
    const parametro = firstValue(readOnu(["Parametro", "Parametro de red", "Plan parametrizado"]));
    const ubicacionOnu = firstValue(readOnu(["Ubicacion GPS", "Ubicacion", "Coordenadas"]), cliente?.ubicacion);
    const descripcionOnu = firstValue(readOnu(["Descripcion", "Observacion", "Observaciones", "Obs"]), cliente?.descripcion);
    const autorOnu = firstValue(readOnu(["Autor orden", "Autor"]), cliente?.autor_orden);
    const codigoEtiquetaOnu = firstValue(readOnu(["Codigo etiqueta", "CodigoEtiqueta"]), cliente?.codigo_etiqueta, qrOnu);
    const empresaOnu = firstValue(readOnu(["Empresa"]), cliente?.empresa, equipo?.empresa, "Americanet");
    const precioPlanNum = parseNumberFlex(precioPlanRaw, NaN);
    const montoCobroNum = parseNumberFlex(montoCobroRaw, NaN);

    const orden = {
      codigo: codigoOrdenOnu || null,
      empresa: empresaOnu || null,
      estado: estadoOnu || null,
      nombre: nombreCliente || null,
      dni: dniCliente || null,
      direccion: direccionCliente || null,
      celular: celularCliente || null,
      email: emailCliente || null,
      contacto: contactoCliente || null,
      nodo: nodoCliente || null,
      tecnico: tecnicoAsignadoOnu || tecnicoLiquidaOnu || null,
      usuario_nodo: usuarioPppoe || null,
      password_usuario: clavePppoe || null,
      velocidad: velocidadPlan || null,
      precio_plan: Number.isFinite(precioPlanNum) ? precioPlanNum : null,
      sn_onu: serialOnu || cliente?.sn_onu || null,
      codigo_etiqueta: codigoEtiquetaOnu || null,
      ubicacion: ubicacionOnu || null,
      descripcion: descripcionOnu || null,
      autor_orden: autorOnu || null,
      fecha_creacion: fechaRegistroOnu || null,
    };

    const liquidacion = {
      codigo: codigoOrdenOnu || null,
      codigo_orden: codigoOrdenOnu || null,
      estado: estadoOnu || null,
      resultado_final: firstValue(readOnu(["Resultado", "Resultado final"]), estadoOnu),
      tecnico: tecnicoAsignadoOnu || null,
      tecnico_liquida: tecnicoLiquidaOnu || tecnicoAsignadoOnu || null,
      fecha_liquidacion: firstValue(fechaLiquidacionOnu, fechaRegistroOnu),
      sn_onu: serialOnu || cliente?.sn_onu || null,
      sn_onu_liquidacion: serialOnu || null,
      codigo_etiqueta: codigoEtiquetaOnu || null,
      dni: dniCliente || null,
      celular: celularCliente || null,
      direccion: direccionCliente || null,
      usuario_nodo: usuarioPppoe || null,
      password_usuario: clavePppoe || null,
      cobro_realizado: firstValue(readOnu(["Cobro", "Cobro SI/NO", "Cobro SI NO", "Cobro realizado", "Se cobro"])),
      monto_cobrado: Number.isFinite(montoCobroNum) ? montoCobroNum : null,
      medio_pago: medioPago || null,
      parametro: parametro || null,
      observacion_final: descripcionOnu || null,
      fuente: "ONUsRegistradas",
    };

    const equipoLiquidado = {
      id: firstValue(readOnu(["ID", "Id", "_RowNumber"])),
      liquidacion_id: null,
      accion: firstValue(estadoOnu, "ONUsRegistradas"),
      codigo: qrOnu || null,
      serial: serialOnu || null,
      tipo: firstValue(readOnu(["Tipo", "Producto"]), equipo?.tipo, "ONU"),
      marca: firstValue(equipo?.marca),
      modelo: firstValue(equipo?.modelo),
      tecnico_asignado: tecnicoAsignadoOnu || null,
      liquidado_por: tecnicoLiquidaOnu || null,
      fecha_asignacion: fechaAsignacionOnu || null,
      fecha_liquidacion: fechaLiquidacionOnu || null,
    };

    const fotoEtiquetaRaw = firstValue(readOnu(["FotoEtiqueta", "Foto Etiqueta"]));
    const foto02Raw = firstValue(readOnu(["Foto02", "Foto 02", "Foto2"]));
    const fotoClienteRaw = firstValue(readOnu(["FotoFachada", "Foto Fachada", "Foto Cliente", "FotoCliente"]));
    const fotos = uniquePhotoInputs([
      equipo?.foto,
      normalizePhotoUrl(buildAppSheetFileUrl(fotoEtiquetaRaw, APPSHEET_TABLE_ONUS_REGISTRADAS)),
      normalizePhotoUrl(buildAppSheetFileUrl(foto02Raw, APPSHEET_TABLE_ONUS_REGISTRADAS)),
      normalizePhotoUrl(buildAppSheetFileUrl(fotoClienteRaw, APPSHEET_TABLE_ONUS_REGISTRADAS)),
      normalizePhotoUrl(fotoEtiquetaRaw),
      normalizePhotoUrl(foto02Raw),
      normalizePhotoUrl(fotoClienteRaw),
    ]);

    const resumen = buildEquipoLiquidacionResumen({
      equipo,
      relacion: equipoLiquidado,
      liquidacion,
      orden,
    });

    return {
      orden,
      liquidacion,
      equipoLiquidado,
      fotos,
      resumen,
      fuente: "ONUsRegistradas",
      codigoQr: String(qrOnu || "").trim(),
      serialMac: String(serialOnu || "").trim(),
      dni: String(dniCliente || "").trim(),
      ts: onuTimestampFromIndex(idxOnu),
    };
  }, [resolverNombreTecnico]);

  const abrirDetalleCatalogo = useCallback(async (equipo, resumenHint = null) => {
    if (!equipo) return;
    const grupoEstado = estadoGrupo(equipo?.estado);
    setCatalogoFotoPreview("");
    setCatalogoVerMas({ orden: false, liquidacion: false, relacion: false });
    setCatalogoDetVisible(true);
    setCatalogoDetLoading(true);
    setCatalogoDetError("");
    setCatalogoDetData({
      equipo,
      liquidacion: null,
      orden: null,
      equipoLiquidado: null,
      fotos: uniquePhotoInputs([equipo?.foto]),
      fuente: "ONUsRegistradas",
    });
    try {
      const codigoKey = norm(equipo?.codigo || "");
      const serialKey = norm(equipo?.serial || "");
      const cached = catalogoOnuCacheMap[codigoKey] || catalogoOnuCacheMap[serialKey] || null;
      const equipoIdKey = String(equipo?.id || "");
      const obtenerResumenTarjeta = () => {
        const latest =
          resumenHint ||
          catalogoResumenMapRef.current[equipoIdKey] ||
          catalogoResumenMap[equipoIdKey] ||
          null;
        return latest && typeof latest === "object" ? latest : null;
      };
      const hayResumenTarjeta = Boolean(obtenerResumenTarjeta());
      const aplicarDetalleResumenTarjeta = () => {
        const resumenTarjeta = obtenerResumenTarjeta();
        if (!resumenTarjeta) return false;
        setCatalogoDetData({
          equipo,
          liquidacion: {
            codigo: firstValue(resumenTarjeta?.codigoOrden),
            codigo_orden: firstValue(resumenTarjeta?.codigoOrden),
            estado: firstValue(resumenTarjeta?.estado, "Liquidada"),
            tecnico_liquida: firstValue(resumenTarjeta?.tecnico),
            fecha_liquidacion: firstValue(resumenTarjeta?.fecha),
            ubicacion: firstValue(resumenTarjeta?.ubicacion),
            direccion: firstValue(resumenTarjeta?.direccion),
            fuente: "Resumen catalogo",
          },
          orden: {
            codigo: firstValue(resumenTarjeta?.codigoOrden),
            nombre: firstValue(resumenTarjeta?.cliente),
            nodo: firstValue(resumenTarjeta?.nodo),
            tecnico: firstValue(resumenTarjeta?.tecnico),
            ubicacion: firstValue(resumenTarjeta?.ubicacion),
            direccion: firstValue(resumenTarjeta?.direccion),
          },
          equipoLiquidado: {
            codigo: firstValue(resumenTarjeta?.qrRelacionado, equipo?.codigo),
            serial: firstValue(resumenTarjeta?.serialRelacionado, equipo?.serial),
            tipo: firstValue(equipo?.tipo),
            marca: firstValue(equipo?.marca),
            modelo: firstValue(equipo?.modelo),
            tecnico_asignado: firstValue(resumenTarjeta?.tecnico, equipo?.tecnico),
            fecha_liquidacion: firstValue(resumenTarjeta?.fecha),
          },
          fotos: uniquePhotoInputs([equipo?.foto]),
          fuente: "Resumen catalogo",
        });
        setCatalogoDetError("");
        return true;
      };

      // Para asignado/almacen no hacemos consulta externa: solo mostramos detalle local (foto serial incluida).
      if (grupoEstado !== "liquidado") {
        const fotosLocal = uniquePhotoInputs([
          equipo?.foto,
          ...(Array.isArray(cached?.fotos) ? cached.fotos : []),
        ]);
        setCatalogoDetData({
          equipo,
          liquidacion: null,
          orden: null,
          equipoLiquidado: null,
          fotos: fotosLocal,
          fuente: "Inventario local",
        });
        return;
      }
      // Si la tarjeta ya tiene resumen enlazado (orden/cliente/nodo), abrimos inmediato con ese detalle
      // para evitar bloqueos por consultas externas y mantener la UX estable.
      if (hayResumenTarjeta) {
        aplicarDetalleResumenTarjeta();
        return;
      }

      // Prioridad 1: detalle desde Supabase (liquidaciones web/mobile).
      if (isSupabaseConfigured) {
        const queryRowsEq = async (table, column, value) => {
          if (value === undefined || value === null) return [];
          const val = typeof value === "string" ? String(value || "").trim() : value;
          if (typeof val === "string" && !val) return [];
          const res = await supabase.from(table).select("*").eq(column, val).order("id", { ascending: false }).range(0, 200);
          if (res.error) {
            if (tableMissing(table, res.error) || columnMissing(column, res.error)) return [];
            throw res.error;
          }
          return Array.isArray(res.data) ? res.data : [];
        };
        try {
          const idInventario = Number(equipo?.id || 0);
          const codigoRef = String(equipo?.codigo || "").trim();
          const serialRef = String(equipo?.serial || "").trim();
          const resumenEquipo = catalogoResumenMap[String(equipo?.id || "")] || null;
          const codigoOrdenHint = String(
            firstValue(
              resumenEquipo?.codigoOrden,
              resumenEquipo?.codigo,
              resumenEquipo?.codigo_orden,
              resumenEquipo?.orden,
              resumenEquipo?.ordenCodigo
            )
          ).trim();
          const refCoincide = (a = "", b = "") => {
            const ax = normRef(a);
            const bx = normRef(b);
            if (!ax || !bx) return false;
            return ax === bx || ax.includes(bx) || bx.includes(ax);
          };
          const pickRelMatch = (rows = []) => {
            const list = Array.isArray(rows) ? rows : [];
            if (!list.length) return null;
            const found = list.find((row) => {
              const rowId = Number(
                firstValue(
                  row?.id_inventario,
                  row?.equipo_id,
                  row?.id_equipo,
                  row?.inventario_id,
                  row?.equipo_catalogo_id
                ) || 0
              );
              if (idInventario > 0 && rowId > 0 && rowId === idInventario) return true;
              const qrRow = firstValue(
                row?.codigo,
                row?.codigo_qr,
                row?.qr,
                row?.idonu,
                row?.id_onu,
                row?.codigo_equipo,
                row?.codigo_etiqueta
              );
              const snRow = firstValue(
                row?.serial,
                row?.serial_mac,
                row?.sn,
                row?.sn_onu,
                row?.snonu,
                row?.mac
              );
              const matchQr = codigoRef && qrRow && refCoincide(qrRow, codigoRef);
              const matchSn = serialRef && snRow && refCoincide(snRow, serialRef);
              return Boolean(matchQr || matchSn);
            });
            return found || list[0] || null;
          };

          let relRows = [];
          if (idInventario > 0) {
            relRows = await queryRowsEq("liquidacion_equipos", "id_inventario", idInventario);
            if (relRows.length === 0) relRows = await queryRowsEq("liquidacion_equipos", "equipo_id", idInventario);
            if (relRows.length === 0) relRows = await queryRowsEq("liquidacion_equipos", "id_equipo", idInventario);
          }
          if (relRows.length === 0 && codigoRef) {
            const qrCols = ["codigo", "codigo_qr", "qr", "idonu", "id_onu", "codigo_equipo", "codigo_etiqueta"];
            for (const col of qrCols) {
              relRows = await queryRowsEq("liquidacion_equipos", col, codigoRef);
              if (relRows.length > 0) break;
            }
          }
          if (relRows.length === 0 && serialRef) {
            const snCols = ["serial", "serial_mac", "sn", "sn_onu", "snonu", "mac"];
            for (const col of snCols) {
              relRows = await queryRowsEq("liquidacion_equipos", col, serialRef);
              if (relRows.length > 0) break;
            }
          }
          if (relRows.length === 0 && (codigoRef || serialRef) && !codigoOrdenHint) {
            const pageSize = 1000;
            const maxRows = 8000;
            for (let offset = 0; offset < maxRows; offset += pageSize) {
              const relAll = await supabase
                .from("liquidacion_equipos")
                .select("*")
                .order("id", { ascending: false })
                .range(offset, offset + pageSize - 1);
              if (relAll.error) break;
              const eqRows = Array.isArray(relAll.data) ? relAll.data : [];
              if (eqRows.length === 0) break;
              const relMatch = eqRows.find((row) => {
                const rowId = Number(firstValue(row?.id_inventario, row?.equipo_id, row?.id_equipo, row?.inventario_id, row?.equipo_catalogo_id) || 0);
                if (idInventario > 0 && rowId > 0 && rowId === idInventario) return true;
                const qrRow = firstValue(row?.codigo, row?.codigo_qr, row?.qr, row?.idonu, row?.id_onu, row?.codigo_equipo, row?.codigo_etiqueta);
                const snRow = firstValue(row?.serial, row?.serial_mac, row?.sn, row?.sn_onu, row?.snonu, row?.mac);
                return Boolean((codigoRef && qrRow && refCoincide(qrRow, codigoRef)) || (serialRef && snRow && refCoincide(snRow, serialRef)));
              }) || null;
              if (relMatch) {
                relRows = [relMatch];
                break;
              }
              if (eqRows.length < pageSize) break;
            }
          }
          let rel = pickRelMatch(relRows) || null;

          let liquidacion = null;
          const liqIdFromRel = Number(rel?.liquidacion_id || 0);
          if (liqIdFromRel > 0) {
            const liqById = await supabase.from("liquidaciones").select("*").eq("id", liqIdFromRel).limit(1).maybeSingle();
            if (!liqById.error) liquidacion = liqById.data || null;
          }
          if (!liquidacion && serialRef) {
            let liqBySn = await supabase
              .from("liquidaciones")
              .select("*")
              .eq("sn_onu_liquidacion", serialRef)
              .order("id", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (liqBySn.error && columnMissing("sn_onu_liquidacion", liqBySn.error)) {
              liqBySn = await supabase
                .from("liquidaciones")
                .select("*")
                .eq("sn_onu", serialRef)
                .order("id", { ascending: false })
                .limit(1)
                .maybeSingle();
            }
            if (!liqBySn.error) liquidacion = liqBySn.data || liquidacion;
          }
          if (!liquidacion && codigoRef) {
            const liqByQr = await supabase
              .from("liquidaciones")
              .select("*")
              .eq("codigo_etiqueta", codigoRef)
              .order("id", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!liqByQr.error) liquidacion = liqByQr.data || liquidacion;
          }
          if (!liquidacion && codigoOrdenHint) {
            let liqByCodigo = await supabase
              .from("liquidaciones")
              .select("*")
              .eq("codigo", codigoOrdenHint)
              .order("id", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (liqByCodigo.error && columnMissing("codigo", liqByCodigo.error)) {
              liqByCodigo = await supabase
                .from("liquidaciones")
                .select("*")
                .eq("codigo_orden", codigoOrdenHint)
                .order("id", { ascending: false })
                .limit(1)
                .maybeSingle();
            }
            if (!liqByCodigo.error) liquidacion = liqByCodigo.data || liquidacion;
          }
          if (!rel && Number(liquidacion?.id || 0) > 0) {
            const relByLiq = await queryRowsEq("liquidacion_equipos", "liquidacion_id", Number(liquidacion.id));
            if (relByLiq.length > 0) {
              rel = pickRelMatch(relByLiq) || relByLiq[0] || null;
            }
          }

          if (rel || liquidacion) {
            let orden = null;
            const ordenOriginalId = Number(liquidacion?.orden_original_id || 0);
            if (ordenOriginalId > 0) {
              const byOrdId = await supabase.from("ordenes").select("*").eq("id", ordenOriginalId).limit(1).maybeSingle();
              if (!byOrdId.error) orden = byOrdId.data || null;
            }
            const codigoOrdenRef = firstValue(liquidacion?.codigo_orden, liquidacion?.codigo, rel?.codigo_orden, rel?.codigo);
            if (!orden && !isPlaceholderValue(codigoOrdenRef)) {
              const byCod = await supabase
                .from("ordenes")
                .select("*")
                .eq("codigo", codigoOrdenRef)
                .order("id", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (!byCod.error) orden = byCod.data || null;
            }

            const liquidacionIdFinal = Number(liquidacion?.id || rel?.liquidacion_id || 0);
            let fotosSupabase = [];
            if (liquidacionIdFinal > 0) {
              const fotoRes = await supabase
                .from("liquidacion_fotos")
                .select("foto_url")
                .eq("liquidacion_id", liquidacionIdFinal)
                .order("id", { ascending: true })
                .range(0, 120);
              if (!fotoRes.error) {
                fotosSupabase = (Array.isArray(fotoRes.data) ? fotoRes.data : []).map((row) => normalizePhotoUrl(row?.foto_url || ""));
              }
            }

            const liquidacionFinal = liquidacion
              ? { ...liquidacion, fuente: "Supabase" }
              : {
                  id: liquidacionIdFinal || null,
                  codigo: firstValue(rel?.codigo_orden, rel?.codigo),
                  codigo_orden: firstValue(rel?.codigo_orden, rel?.codigo),
                  estado: "Liquidada",
                  fuente: "Supabase",
                };
            const relacionFinal = {
              id: firstValue(rel?.id),
              liquidacion_id: firstValue(rel?.liquidacion_id, liquidacionFinal?.id),
              accion: firstValue(rel?.accion, rel?.aun, liquidacionFinal?.estado, "Liquidada"),
              codigo: firstValue(rel?.codigo, rel?.codigo_qr, equipo?.codigo),
              serial: firstValue(rel?.serial, rel?.serial_mac, equipo?.serial),
              tipo: firstValue(rel?.tipo, equipo?.tipo),
              marca: firstValue(rel?.marca, equipo?.marca),
              modelo: firstValue(rel?.modelo, equipo?.modelo),
              tecnico_asignado: firstValue(rel?.tecnico, equipo?.tecnico),
              liquidado_por: firstValue(liquidacionFinal?.tecnico_liquida, liquidacionFinal?.tecnico),
              fecha_liquidacion: firstValue(liquidacionFinal?.fecha_liquidacion, liquidacionFinal?.created_at),
            };
            const resumenSup = buildEquipoLiquidacionResumen({
              equipo,
              relacion: relacionFinal,
              liquidacion: liquidacionFinal,
              orden,
            });
            setCatalogoResumenMap((prev) => ({ ...prev, [String(equipo?.id || "")]: resumenSup || null }));
            setCatalogoDetData({
              equipo,
              liquidacion: liquidacionFinal || null,
              orden: orden || null,
              equipoLiquidado: relacionFinal || null,
              fotos: uniquePhotoInputs([
                equipo?.foto,
                ...fotosSupabase,
                ...extractPhotosFromAnyRecord(liquidacionFinal || {}),
                ...extractPhotosFromAnyRecord(rel || {}),
              ]),
              fuente: "Supabase",
            });
            return;
          }
        } catch {
          // Si falla Supabase en detalle, intentamos fallback AppSheet.
        }
        // Fallback: historial AppSheet (datos migrados desde Google Sheets)
        try {
          const codigoQr = String(equipo?.codigo || "").trim();
          const serialMac = String(equipo?.serial || "").trim();
          let onuRel = null;
          if (codigoQr) {
            const relRes = await supabase
              .from("onu_liquidacion_relacion")
              .select("*")
              .ilike("id_onu", codigoQr)
              .limit(1)
              .maybeSingle();
            if (!relRes.error) onuRel = relRes.data;
          }
          if (!onuRel && serialMac) {
            const relRes = await supabase
              .from("onu_liquidacion_relacion")
              .select("*")
              .ilike("id_onu", serialMac)
              .limit(1)
              .maybeSingle();
            if (!relRes.error) onuRel = relRes.data;
          }
          if (onuRel?.liquidacion_codigo) {
            const liqRes = await supabase
              .from("historial_appsheet_liquidaciones")
              .select("*")
              .ilike("codigo", onuRel.liquidacion_codigo)
              .limit(1)
              .maybeSingle();
            if (!liqRes.error && liqRes.data) {
              const liqHist = liqRes.data;
              const liquidacionFinal = {
                codigo: firstValue(liqHist.codigo),
                codigo_orden: firstValue(onuRel.orden_codigo, liqHist.orden_id, liqHist.codigo),
                estado: firstValue(liqHist.estado, "Liquidada"),
                tecnico_liquida: firstValue(liqHist.tecnico, liqHist.personal_tecnico),
                tecnico: firstValue(liqHist.tecnico, liqHist.personal_tecnico),
                fecha_liquidacion: firstValue(liqHist.fecha),
                nombre: firstValue(liqHist.nombre, liqHist.cliente),
                dni: firstValue(liqHist.dni),
                direccion: firstValue(liqHist.direccion),
                nodo: firstValue(liqHist.nodo),
                sn_onu: firstValue(liqHist.sn_onu),
                fuente: "Historial AppSheet",
              };
              const ordenFinal = {
                codigo: firstValue(onuRel.orden_codigo, liqHist.orden_id, liqHist.codigo),
                nombre: firstValue(liqHist.nombre, liqHist.cliente),
                nodo: firstValue(liqHist.nodo),
                tecnico: firstValue(liqHist.tecnico, liqHist.personal_tecnico),
                tipo_actuacion: firstValue(liqHist.tipo_actuacion, liqHist.actuacion),
                direccion: firstValue(liqHist.direccion),
              };
              const resumenHist = buildEquipoLiquidacionResumen({
                equipo,
                relacion: null,
                liquidacion: liquidacionFinal,
                orden: ordenFinal,
              });
              setCatalogoResumenMap((prev) => ({ ...prev, [String(equipo?.id || "")]: resumenHist || null }));
              setCatalogoDetData({
                equipo,
                liquidacion: liquidacionFinal,
                orden: ordenFinal,
                equipoLiquidado: null,
                fotos: uniquePhotoInputs([equipo?.foto]),
                fuente: "Historial AppSheet",
              });
              return;
            }
          }
        } catch {
          // Si falla historial, continuamos al fallback AppSheet.
        }
      }

      if (cached) {
        if (cached?.resumen) {
          setCatalogoResumenMap((prev) => ({ ...prev, [String(equipo?.id || "")]: cached.resumen }));
        }
        setCatalogoDetData({
          equipo,
          liquidacion: cached.liquidacion || null,
          orden: cached.orden || null,
          equipoLiquidado: cached.equipoLiquidado || null,
          fotos: Array.isArray(cached.fotos) ? cached.fotos : uniquePhotoInputs([equipo?.foto]),
          fuente: "ONUsRegistradas (cache)",
        });
        return;
      }

      const escapeSelectorLiteral = (value = "") =>
        String(value || "")
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');
      const selectores = [];
      const pushSelectores = (valor = "", campos = []) => {
        lookupVariants(valor).forEach((variant) => {
          const safe = escapeSelectorLiteral(variant);
          campos.forEach((campo) => {
            selectores.push(`Filter(${APPSHEET_TABLE_ONUS_REGISTRADAS}, [${campo}] = "${safe}")`);
          });
        });
      };
      pushSelectores(equipo?.codigo, ["IDONU", "ID ONU", "Codigo QR", "CodigoQR", "Codigo Interno", "CodigoInterno", "Codigo"]);
      pushSelectores(equipo?.serial, ["MAC", "Serial", "Serie", "SN ONU", "SN", "Serial ONU"]);

      let onusRows = [];
      for (const selector of uniqSorted(selectores)) {
        try {
          const rows = await obtenerFilasAppSheet(APPSHEET_TABLE_ONUS_REGISTRADAS, selector);
          if (Array.isArray(rows) && rows.length > 0) {
            onusRows = rows;
            break;
          }
        } catch {
          // Probamos el siguiente selector.
        }
      }
      if (!onusRows.length) {
        if (aplicarDetalleResumenTarjeta()) return;
        setCatalogoDetData({
          equipo,
          liquidacion: null,
          orden: null,
          equipoLiquidado: null,
          fotos: uniquePhotoInputs([equipo?.foto]),
          fuente: "Inventario local",
        });
        setCatalogoDetError("");
        return;
      }

      const filaOnu = [...onusRows].sort((a, b) => onuTimestampFromIndex(buildAppSheetRowIndex(b)) - onuTimestampFromIndex(buildAppSheetRowIndex(a)))[0];
      const idxOnu = buildAppSheetRowIndex(filaOnu);
      const dniOnu = firstValue(getAppSheetValue(idxOnu, ["DNI", "Cedula", "Documento"]));
      let cliente = null;
      if (isSupabaseConfigured) {
        const dniNorm = dniKey(dniOnu);
        if (dniNorm) {
          const cliRes = await supabase
            .from("clientes")
            .select("*")
            .eq("dni", dniNorm)
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!cliRes.error) cliente = cliRes.data || null;
        }
      }

      const detalle = construirDetalleDesdeOnu(equipo, filaOnu, cliente);
      if (!detalle) {
        setCatalogoDetError("No se pudo construir el detalle desde ONUsRegistradas.");
        return;
      }
      const nextCache = { ...catalogoOnuCacheMap };
      const keyQr = norm(detalle.codigoQr || equipo?.codigo || "");
      const keySn = norm(detalle.serialMac || equipo?.serial || "");
      if (keyQr) nextCache[keyQr] = detalle;
      if (keySn) nextCache[keySn] = detalle;
      setCatalogoOnuCacheMap(nextCache);
      setCatalogoResumenMap((prev) => ({ ...prev, [String(equipo?.id || "")]: detalle.resumen || null }));
      setCatalogoDetData({
        equipo,
        liquidacion: detalle.liquidacion || null,
        orden: detalle.orden || null,
        equipoLiquidado: detalle.equipoLiquidado || null,
        fotos: Array.isArray(detalle.fotos) ? detalle.fotos : uniquePhotoInputs([equipo?.foto]),
        fuente: detalle.fuente || "ONUsRegistradas",
      });
    } catch (e) {
      setCatalogoDetError(String(e?.message || "No se pudo cargar detalle del equipo."));
    } finally {
      setCatalogoDetLoading(false);
    }
  }, [catalogoOnuCacheMap, catalogoResumenMap, construirDetalleDesdeOnu]);
  const actualizarInventarioConDetalle = useCallback(async () => {
    await cargar();
  }, [cargar]);
  const almacenesFiltrados = useMemo(() => {
    const q = norm(almacenBusqueda);
    if (!q) return almacenes;
    return (almacenes || []).filter((a) =>
      [a?.nombre, a?.codigo, a?.direccion, a?.ubicacion].some((v) => norm(v).includes(q))
    );
  }, [almacenes, almacenBusqueda]);
  const limpiarAlmacenForm = useCallback(() => {
    setAlmacenEditId("");
    setAlmacenForm({ ...emptyAlmacenForm });
  }, []);
  const editarAlmacen = useCallback((item) => {
    if (!item) return;
    setAlmacenEditId(String(item.id || ""));
    setAlmacenForm({
      nombre: String(item.nombre || ""),
      codigo: String(item.codigo || ""),
      direccion: String(item.direccion || ""),
      ubicacion: String(item.ubicacion || ""),
      activo: item?.activo !== false,
    });
  }, []);
  const guardarAlmacen = useCallback(async () => {
    if (!esAdmin) return window.alert("Solo administrador.");
    const nombre = String(almacenForm.nombre || "").trim();
    const codigo = String(almacenForm.codigo || "").trim();
    if (!nombre) return window.alert("Ingresa nombre del almacén.");
    if (!codigo) return window.alert("Ingresa código del almacén.");
    if (!isSupabaseConfigured) return window.alert("Configura Supabase.");
    if (!almacenesDisponibles) return window.alert("Falta tabla almacenes.");
    try {
      const dup = (almacenes || []).find(
        (a) => norm(a.codigo) === norm(codigo) && String(a.id || "") !== String(almacenEditId || "")
      );
      if (dup) return window.alert(`El código ${codigo} ya existe.`);
      const payload = {
        nombre,
        codigo,
        direccion: String(almacenForm.direccion || "").trim(),
        ubicacion: String(almacenForm.ubicacion || "").trim(),
        activo: almacenForm.activo !== false,
      };
      let res;
      if (almacenEditId) {
        res = await supabase.from("almacenes").update(payload).eq("id", almacenEditId);
      } else {
        res = await supabase.from("almacenes").insert([payload]);
      }
      if (res.error) throw res.error;
      limpiarAlmacenForm();
      await cargar();
      window.alert(almacenEditId ? "Almacén actualizado." : "Almacén creado.");
    } catch (e) {
      window.alert(String(e?.message || "No se pudo guardar almacén."));
    }
  }, [esAdmin, almacenForm, almacenesDisponibles, almacenes, almacenEditId, limpiarAlmacenForm, cargar]);
  const cambiarEstadoAlmacen = useCallback(async (item) => {
    if (!esAdmin) return;
    if (!item?.id) return;
    const nuevoEstado = !(item?.activo !== false);
    const ok = window.confirm(`${nuevoEstado ? "Activar" : "Desactivar"} almacén "${item?.nombre || item?.codigo || ""}"?`);
    if (!ok) return;
    try {
      const upd = await supabase.from("almacenes").update({ activo: nuevoEstado }).eq("id", item.id);
      if (upd.error) throw upd.error;
      await cargar();
    } catch (e) {
      window.alert(String(e?.message || "No se pudo actualizar almacén."));
    }
  }, [esAdmin, cargar]);
  const qrValidacionRegistro = validarQrRegistro(eqForm.codigo);
  const materialIngresoSeleccionado = materiales.find((m) => String(m.id) === String(ingresoMat.materialId || ""));
  const tituloInventario = useMemo(() => {
    if (esTecnico) return tab === "movimientos" ? "Kardex" : "Stock tecnico";
    if (tab === "registro") return registroSubTab === "ingresoStock" ? "Registro - Ingreso materiales" : "Registro";
    if (tab === "asignaciones") return "Asignaciones";
    if (tab === "articulos") return articulosSubTab === "materialesCatalogo" ? "Articulos - Catalogo materiales" : "Articulos";
    if (tab === "catalogo") return "Catalogo equipos";
    if (tab === "movimientos") return "Kardex";
    if (tab === "almacenes") return "Almacenes";
    return "Inventario";
  }, [articulosSubTab, esTecnico, registroSubTab, tab]);
  return (
    <section className="panel inv-panel">
      <div className="panel-toolbar">
        <h2>{tituloInventario}</h2>
        <div className="inv-inline">
          <button
            type="button"
            className="secondary-btn small"
            onClick={() => void actualizarInventarioConDetalle()}
            disabled={loading}
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>
      {mostrarResumenGeneral ? <p className="panel-meta">Equipos: {equipos.length} | Materiales: {materiales.length} | Asignaciones: {materialesAsig.length}</p> : null}
      {!esTecnico && tab === "registro" ? (
        <div className="inv-kpi-grid">
          <article className="inv-kpi-card"><span>Equipos en almacen</span><strong>{equiposEnAlmacen}</strong></article>
          <article className="inv-kpi-card"><span>Equipos asignados</span><strong>{equiposAsignados}</strong></article>
          <article className="inv-kpi-card"><span>Equipos liquidados</span><strong>{equiposLiquidados}</strong></article>
          <article className="inv-kpi-card"><span>Stock materiales</span><strong>{stockMaterialTotal.toFixed(2)}</strong></article>
          <article className="inv-kpi-card"><span>Materiales sin stock</span><strong>{materialSinStock}</strong></article>
        </div>
      ) : null}
      {error ? <p className="warn-text">{error}</p> : null}
      {warning ? <p className="warn-text">{warning}</p> : null}
      {!esTecnico ? (
        <div className="inv-pills">
          <button
            type="button"
            className={tab === "registro" ? "inv-pill active" : "inv-pill"}
            onClick={() => setTab("registro")}
          >
            Registro
          </button>
          <button
            type="button"
            className={tab === "asignaciones" ? "inv-pill active" : "inv-pill"}
            onClick={() => setTab("asignaciones")}
          >
            Asignaciones
          </button>
          <button
            type="button"
            className={tab === "articulos" ? "inv-pill active" : "inv-pill"}
            onClick={() => setTab("articulos")}
          >
            Articulos
          </button>
          <button
            type="button"
            className={tab === "catalogo" ? "inv-pill active" : "inv-pill"}
            onClick={() => setTab("catalogo")}
          >
            Catalogo
          </button>
          <button
            type="button"
            className={tab === "movimientos" ? "inv-pill active" : "inv-pill"}
            onClick={() => setTab("movimientos")}
          >
            Kardex
          </button>
        </div>
      ) : null}
	      {mostrarBuscadoresGenerales ? (
	        <div className="inv-toolbar">
	          <input className="panel-search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar..." />
	          {!esTecnico ? <input className="panel-search inv-search-mini" list="inv-tecnicos-list" value={tecnicoFiltro} onChange={(e) => setTecnicoFiltro(e.target.value)} placeholder="Filtrar tecnico" /> : null}
	          <datalist id="inv-tecnicos-list">{tecnicos.map((t) => <option key={t.id} value={t.nombre} />)}</datalist>
	        </div>
	      ) : null}
	      {esTecnico ? (
	        <div className="inv-pills">
	          <button
	            type="button"
	            className={tab === "stockTecnico" ? "inv-pill active" : "inv-pill"}
	            onClick={() => setTab("stockTecnico")}
	          >
	            Mi stock
	          </button>
	          <button
	            type="button"
	            className={tab === "movimientos" ? "inv-pill active" : "inv-pill"}
	            onClick={() => setTab("movimientos")}
	          >
	            Mi kardex
	          </button>
	          <button
	            type="button"
	            className={tab === "recogidos" ? "inv-pill active" : "inv-pill"}
	            onClick={() => { setTab("recogidos"); void cargarEquiposRecogidos(); }}
	          >
	            Equipos recogidos {equiposRecogidos.length > 0 ? `(${equiposRecogidos.length})` : ""}
	          </button>
	        </div>
	      ) : null}
      {tab === "almacenes" ? (
        esAdmin ? (
          <div className="inv-grid-2">
            <article className="inv-card">
              <h3>{almacenEditId ? "Editar almacén" : "Nuevo almacén"}</h3>
              {!almacenesDisponibles ? <p className="warn-text">Tabla `almacenes` no disponible. Ejecuta el SQL de esquema.</p> : null}
              <label className="inv-field">Nombre<input value={almacenForm.nombre} onChange={(e) => setAlmacenForm((p) => ({ ...p, nombre: e.target.value }))} /></label>
              <label className="inv-field">Código<input value={almacenForm.codigo} onChange={(e) => setAlmacenForm((p) => ({ ...p, codigo: e.target.value }))} /></label>
              <label className="inv-field">Dirección<input value={almacenForm.direccion} onChange={(e) => setAlmacenForm((p) => ({ ...p, direccion: e.target.value }))} /></label>
              <label className="inv-field">Ubicación<input value={almacenForm.ubicacion} onChange={(e) => setAlmacenForm((p) => ({ ...p, ubicacion: e.target.value }))} placeholder="-16.438490, -71.598208" /></label>
              <label className="inv-field">Estado<select value={almacenForm.activo ? "1" : "0"} onChange={(e) => setAlmacenForm((p) => ({ ...p, activo: e.target.value === "1" }))}><option value="1">Activo</option><option value="0">Inactivo</option></select></label>
              <div className="inv-actions">
                <button type="button" className="primary-btn" onClick={() => void guardarAlmacen()}>{almacenEditId ? "Guardar cambios" : "Crear almacén"}</button>
                <button type="button" className="secondary-btn" onClick={limpiarAlmacenForm}>Limpiar</button>
              </div>
            </article>
            <article className="inv-card">
              <h3>Almacenes ({almacenesFiltrados.length})</h3>
              <input className="panel-search" value={almacenBusqueda} onChange={(e) => setAlmacenBusqueda(e.target.value)} placeholder="Buscar por nombre, código o dirección..." />
              <div className="inv-list">
                {almacenesFiltrados.length === 0 ? <p className="empty">Sin almacenes registrados.</p> : null}
                {almacenesFiltrados.map((a) => (
                  <div key={a.id} className="inv-row">
                    <div className="inv-row-head">
                      <p className="inv-row-title">{a.nombre}</p>
                      <span className={`inv-state ${a.activo ? "almacen" : "asignado"}`}>{a.activo ? "Activo" : "Inactivo"}</span>
                    </div>
                    <p className="inv-row-meta">Código: {a.codigo || "-"}</p>
                    <p className="inv-row-meta">Dirección: {a.direccion || "-"}</p>
                    <p className="inv-row-meta">Ubicación: {a.ubicacion || "-"}</p>
                    <div className="inv-actions">
                      <button type="button" className="secondary-btn small" onClick={() => editarAlmacen(a)}>Editar</button>
                      <button type="button" className="secondary-btn small" onClick={() => void cambiarEstadoAlmacen(a)}>{a.activo ? "Desactivar" : "Activar"}</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        ) : (
          <p className="warn-text">Solo un administrador puede gestionar almacenes.</p>
        )
      ) : null}
	      {tab === "registro" && !esTecnico ? (
	        <div className="inv-pills">
	          <button type="button" className={registroSubTab === "equipos" ? "inv-pill active" : "inv-pill"} onClick={() => setRegistroSubTab("equipos")}>
	            Ingreso de equipos
	          </button>
	          <button type="button" className={registroSubTab === "ingresoStock" ? "inv-pill active" : "inv-pill"} onClick={() => setRegistroSubTab("ingresoStock")}>
	            Ingreso materiales
	          </button>
	        </div>
	      ) : null}

	      {tab === "registro" && !esTecnico && registroSubTab === "equipos" ? (
	        <div className="inv-grid-2">
          <article className="inv-card">
            <h3>Ingreso de equipos por lote</h3>
            <p className="panel-meta">1) Define cabecera del lote. 2) Escanea QR + foto por equipo (serial opcional).</p>
            <div className="inv-det-block">
              <strong>Cabecera del lote</strong>
              <p className="panel-meta">Se aplica a todos los equipos del lote. {loteBloqueado ? "Lote en curso (cabecera bloqueada)." : "Aun sin equipos en lista."}</p>
              <div className="inv-form-grid two">
                <label>Empresa<select value={eqForm.empresa} onChange={(e) => cambiarCabeceraLote("empresa", e.target.value)} disabled={loteBloqueado}><option>Americanet</option><option>DIM</option></select></label>
                <label>Articulo
                  <select value={articuloRegistroId} onChange={(e) => seleccionarArticuloRegistro(e.target.value)} disabled={loteBloqueado || articulosDisponibles.length === 0}>
                    <option value="">{articulosDisponibles.length ? "Seleccionar articulo" : "Sin articulos registrados"}</option>
                    {articulosDisponibles.map((a) => <option key={a.id} value={a.id}>{`${a.tipo} | ${a.marca} | ${a.modelo}`}</option>)}
                  </select>
                </label>
                <label>Almacén
                  <select value={almacenEqId} onChange={(e) => setAlmacenEqId(String(e.target.value || ""))} disabled={loteBloqueado || !almacenesDisponibles}>
                    <option value="">{almacenesActivos.length ? "Seleccionar almacén" : almacenesDisponibles ? "Sin almacenes activos" : "Tabla almacenes no disponible"}</option>
                    {almacenesActivos.map((a) => <option key={`al-eq-${a.id}`} value={a.id}>{a.nombre} ({a.codigo})</option>)}
                  </select>
                </label>
                <label>Tipo<input value={eqForm.tipo} readOnly /></label>
                <label>Marca<input value={eqForm.marca} readOnly /></label>
                <label>Modelo<input value={eqForm.modelo} readOnly /></label>
                <label>Precio unitario<input value={eqForm.precio} onChange={(e) => cambiarCabeceraLote("precio", e.target.value)} placeholder="Se define en el registro" /></label>
              </div>
              {articuloRegistroSeleccionado?.foto ? (
                <div className="inv-art-ref">
                  <span>Foto referencial del modelo</span>
                  <button type="button" className="inv-art-photo-btn" onClick={() => window.open(String(articuloRegistroSeleccionado.foto), "_blank", "noopener,noreferrer")}>
                    <img src={articuloRegistroSeleccionado.foto} alt={`${articuloRegistroSeleccionado.tipo || "articulo"}-${articuloRegistroSeleccionado.modelo || "modelo"}`} className="inv-thumb inv-thumb-art" />
                  </button>
                </div>
              ) : null}
              {articuloRegistroSeleccionado?.descripcion ? <p className="inv-note info">Descripcion: {articuloRegistroSeleccionado.descripcion}</p> : null}
              {articulosDisponibles.length === 0 ? <p className="inv-note warn">No hay articulos. Crea articulos en el sub menu Articulos.</p> : null}
              {loteBloqueado ? (
                <div className="inv-actions">
                  <button type="button" className="secondary-btn small" onClick={liberarCabeceraLote}>
                    Cambiar cabecera (limpiar lista)
                  </button>
                </div>
              ) : null}
            </div>
            <div className="inv-det-block">
              <strong>Registro individual</strong>
              <p className="panel-meta">Escanea y agrega uno por uno.</p>
              <div className="inv-form-grid two">
                <label>Serial del equipo (opcional)<input value={eqForm.serial} onChange={(e) => setEqForm((p) => ({ ...p, serial: e.target.value }))} /></label>
              </div>
            </div>
            <div className="inv-inline">
              <label className="inv-field inv-grow">Codigo QR<input value={eqForm.codigo} onChange={(e) => { setEqForm((p) => ({ ...p, codigo: e.target.value })); setQrRegistroMsg(""); }} /></label>
              <button type="button" className="secondary-btn small" onClick={() => setScanEqReg(true)}>Escanear QR</button>
              <button type="button" className="secondary-btn small" onClick={limpiarEquipoScan}>Limpiar scan</button>
            </div>
            <p className={`inv-note ${qrValidacionRegistro.ok ? "ok" : "warn"}`}>{qrValidacionRegistro.text}</p>
            <label className="inv-field">Foto serial/equipo<input value={eqForm.foto} onChange={(e) => setEqForm((p) => ({ ...p, foto: e.target.value }))} /></label>
            <div className="inv-actions">
              <button type="button" className="secondary-btn small" onClick={() => eqInputRef.current?.click()}>Subir foto serial</button>
              <button type="button" className="secondary-btn small" onClick={() => setEqForm((p) => ({ ...p, foto: "" }))}>Quitar foto</button>
            </div>
            <input ref={eqInputRef} type="file" accept="image/*" className="inv-hidden-file" onChange={(e) => void onFileEq(e)} />
            {eqForm.foto ? <img src={eqForm.foto} alt="foto equipo" className="inv-thumb" /> : null}
            {qrRegistroMsg ? <p className="inv-note info">{qrRegistroMsg}</p> : null}
            <div className="inv-actions">
              <button type="button" className="primary-btn" onClick={() => agregarEquipoTemporal()}>Agregar equipo</button>
              <button type="button" className="secondary-btn" onClick={() => setEqForm(emptyEq)}>Limpiar todo</button>
              <button
                type="button"
                className="secondary-btn"
                onClick={async () => {
                  if (!eqPendReg.length) return window.alert("No hay equipos en lista temporal.");
                  const payloadLote = eqPendReg.map((x) => ({
                    empresa: x.empresa,
                    tipo: x.tipo,
                    marca: x.marca,
                    modelo: x.modelo,
                    precio_unitario: num(x.precio_unitario),
                    codigo_qr: x.codigo_qr,
                    serial_mac: x.serial_mac,
                    foto_referencia: x.foto_referencia,
                    estado: norm(x.estado).includes("almacen") ? "disponible" : x.estado,
                    tecnico_asignado: x.tecnico_asignado || "",
                    almacen_id: x.almacen_id || null,
                    almacen_nombre: x.almacen_nombre || "",
                  }));
                  let saveLote = await supabase.from("equipos_catalogo").upsert(payloadLote, { onConflict: "codigo_qr" });
                  if (saveLote.error && (columnMissing("almacen_id", saveLote.error) || columnMissing("almacen_nombre", saveLote.error))) {
                    const payloadLegacy = payloadLote.map(({ almacen_id, almacen_nombre, ...rest }) => ({ ...rest }));
                    saveLote = await supabase.from("equipos_catalogo").upsert(payloadLegacy, { onConflict: "codigo_qr" });
                  }
                  if (saveLote.error) return window.alert(saveLote.error.message || "No se pudo guardar.");
                  for (const item of eqPendReg) {
                    await registrarMov({
                      tipoItem: "equipo",
                      movimiento: "ingreso",
                      motivo: "Registro por lote",
                      itemNombre: `${item.tipo} - ${item.marca} ${item.modelo}`,
                      referencia: item.codigo_qr,
                      cantidad: 1,
                      unidad: "unidad",
                      costoUnitario: item.precio_unitario,
                      tecnico: "",
                      almacenId: item.almacen_id || "",
                      almacenNombre: item.almacen_nombre || "",
                    });
                  }
                  setEqPendReg([]);
                  setQrRegistroMsg("Lote guardado correctamente.");
                  await cargar();
                }}
              >
                Guardar lote ({eqPendReg.length})
              </button>
            </div>
          </article>
          <article className="inv-card">
            <h3>Lista temporal ({eqPendReg.length})</h3>
            <div className="inv-list">
              {eqPendReg.length === 0 ? <p className="empty">Sin equipos pendientes.</p> : null}
              {eqPendReg.map((item) => (
                <div key={item.tempId} className="inv-row">
                  <div className="inv-row-head">
                    <p className="inv-row-title">{item.tipo} - {item.marca} {item.modelo}</p>
                    <div className="inv-inline">
                      <button
                        type="button"
                        className="secondary-btn small inv-icon-btn"
                        aria-label="Editar equipo temporal"
                        title="Editar equipo temporal"
                        onClick={() => editarEquipoTemporal(item)}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                          <path d="M3 14.5V17h2.5l9-9-2.5-2.5-9 9zM12.6 4.1l2.5 2.5" />
                        </svg>
                      </button>
                      <button type="button" className="secondary-btn small" onClick={() => setEqPendReg((prev) => prev.filter((x) => x.tempId !== item.tempId))}>Quitar</button>
                    </div>
                  </div>
                  <p className="inv-row-meta">QR: {item.codigo_qr || "-"} | Serial: {item.serial_mac || "-"} | S/ {num(item.precio_unitario).toFixed(2)} | Almacén: {item.almacen_nombre || "-"}</p>
                  {item.foto_referencia ? <img src={item.foto_referencia} alt={item.codigo_qr || "eq"} className="inv-thumb" /> : null}
                </div>
              ))}
            </div>
          </article>
	        </div>
	      ) : null}
	      {tab === "registro" && !esTecnico && registroSubTab === "ingresoStock" ? (
	        <div className="inv-grid-2">
	          <article className="inv-card">
	            <h3>Ingreso de materiales (por cantidad)</h3>
	            <p className="panel-meta">Registra entradas de materiales desde el submenu Registro.</p>
	            <div className="inv-form-grid two">
	              <label>Material<select value={ingresoMat.materialId} onChange={(e) => { const id = String(e.target.value || ""); const unidad = String(materiales.find((m) => String(m.id) === id)?.unidad || "unidad"); setIngresoMat((p) => ({ ...p, materialId: id, unidad })); }}><option value="">Seleccionar</option>{materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
                <label>Almacén<select value={almacenMovId} onChange={(e) => setAlmacenMovId(String(e.target.value || ""))} disabled={!almacenesDisponibles}><option value="">{almacenesActivos.length ? "Seleccionar almacén" : almacenesDisponibles ? "Sin almacenes activos" : "Tabla almacenes no disponible"}</option>{almacenesActivos.map((a) => <option key={`al-mov-${a.id}`} value={a.id}>{a.nombre} ({a.codigo})</option>)}</select></label>
	              <label>Cantidad<input value={ingresoMat.cantidad} onChange={(e) => setIngresoMat((p) => ({ ...p, cantidad: e.target.value }))} /></label>
	              <label>Unidad<select value={ingresoMat.unidad} onChange={(e) => setIngresoMat((p) => ({ ...p, unidad: e.target.value }))}><option>unidad</option><option>metros</option><option>rollo</option><option>caja</option></select></label>
	              <label>Costo unitario (opcional)<input value={ingresoMat.costo} onChange={(e) => setIngresoMat((p) => ({ ...p, costo: e.target.value }))} /></label>
	            </div>
	            <p className="panel-meta">Stock actual: {materialIngresoSeleccionado ? `${stockMaterialActual(materialIngresoSeleccionado.id, ingresoMat.unidad).toFixed(2)} ${ingresoMat.unidad}` : "-"}</p>
	            <button type="button" className="secondary-btn" onClick={() => void registrarIngresoMaterial()}>Registrar ingreso</button>
	          </article>
	          <article className="inv-card">
	            <h3>Materiales ({materiales.length})</h3>
	            <div className="inv-list">
	              {materiales.map((m) => (
	                <div key={m.id} className="inv-row inv-row-eq">
	                  <div className="inv-row-eq-info">
	                    <p className="inv-row-title">{m.nombre || "-"}</p>
	                    <p className="inv-row-meta">Unidad: {m.unidad || "unidad"} | Costo: S/ {num(m.costo).toFixed(2)} | Stock: {stockMaterialActual(m.id, m.unidad).toFixed(2)} {m.unidad || "unidad"}</p>
	                  </div>
	                  {m.foto ? <img src={m.foto} alt={m.nombre || "material"} className="inv-thumb inv-thumb-mat" /> : null}
	                </div>
	              ))}
	            </div>
	          </article>
	        </div>
	      ) : null}

	      {tab === "asignaciones" && !esTecnico ? (
	        <div className="inv-grid-2">
	          <article className="inv-card">
	            <h3>Salida de equipos a tecnico</h3>
	            <p className="panel-meta">Selecciona tecnico una vez y agrega equipos por QR para armar la salida.</p>
	            <label className="inv-field">
	              Tecnico activo
	              <select value={asigEq.tecnico} onChange={(e) => setAsigEq((p) => ({ ...p, tecnico: e.target.value }))}>
	                <option value="">{tecnicos.length ? "Seleccionar tecnico activo" : "Sin tecnicos activos"}</option>
	                {tecnicos.map((t) => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
	              </select>
	            </label>
	            <p className="panel-meta">Tecnicos activos: {tecnicos.length}</p>
	            <div className="inv-inline">
	              <label className="inv-field inv-grow">QR salida rapido<input value={asigEqCodigo} onChange={(e) => { setAsigEqCodigo(e.target.value); setQrAsignacionMsg(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarEquipoAsignacionPorCodigo(); } }} placeholder="Escanea o pega codigo" /></label>
	              <button type="button" className="secondary-btn small" onClick={() => setScanEqAsig(true)}>Escanear QR</button>
	              <button type="button" className="primary-btn small" onClick={() => agregarEquipoAsignacionPorCodigo()}>Agregar por QR</button>
	            </div>
            {qrAsignacionMsg ? <p className="inv-note info">{qrAsignacionMsg}</p> : null}
            <label className="inv-field">Equipo<select value={asigEq.equipoId} onChange={(e) => setAsigEq((p) => ({ ...p, equipoId: e.target.value }))}><option value="">Seleccionar</option>{equiposDispAsig.map((e) => <option key={e.id} value={e.id}>{e.codigo || "SIN-QR"} | {equipoNombre(e)}</option>)}</select></label>
            <p className="panel-meta">Seleccionado: {eqSelAsig ? `${eqSelAsig.codigo} | ${equipoNombre(eqSelAsig)}` : "-"}</p>
            <div className="inv-actions">
              <button type="button" className="primary-btn" onClick={() => { const tecIn = String(asigEq.tecnico || "").trim(); const tec = resolverNombreTecnico(tecIn); if (!tec || !esTecnicoRegistrado(tecIn) || !asigEq.equipoId) return window.alert("Selecciona tecnico valido y equipo."); const target = equiposDispAsig.find((e) => String(e.id) === String(asigEq.equipoId)); if (!target) return window.alert("Equipo no disponible."); if (eqPendAsig.some((x) => String(x.id) === String(target.id))) return; setEqPendAsig((prev) => [...prev, { tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, id: target.id, tecnico: tec, codigo: target.codigo, tipo: target.tipo, marca: target.marca, modelo: target.modelo, precio: target.precio, almacenId: target.almacenId || "", almacenNombre: target.almacenNombre || "" }]); setAsigEq((p) => ({ ...p, equipoId: "", tecnico: tec })); setQrAsignacionMsg(`Equipo agregado: ${target.codigo || target.id}.`); }}>Agregar seleccionado</button>
              <button type="button" className="secondary-btn" onClick={async () => { if (!eqPendAsig.length) return window.alert("No hay equipos en lista."); try { for (const item of eqPendAsig) { const tecIn = String(item.tecnico || "").trim(); const tec = resolverNombreTecnico(tecIn); if (!tec || !esTecnicoRegistrado(tecIn)) throw new Error(`Tecnico invalido en ${item.codigo || item.id}`); const { error: err } = await supabase.from("equipos_catalogo").update({ estado: "asignado", tecnico_asignado: tec }).eq("id", item.id); if (err) throw err; await registrarMov({ tipoItem: "equipo", movimiento: "salida", motivo: "Asignacion a tecnico", itemNombre: `${item.tipo} - ${item.marca} ${item.modelo}`, referencia: item.codigo, cantidad: 1, unidad: "unidad", costoUnitario: item.precio, tecnico: tec, almacenId: item.almacenId || "", almacenNombre: item.almacenNombre || "" }); } const total = eqPendAsig.length; setEqPendAsig([]); await cargar(); window.alert(`${total} equipo(s) asignado(s).`); } catch (e) { window.alert(String(e?.message || "No se pudo asignar.")); } }}>Asignar todo ({eqPendAsig.length})</button>
            </div>
            <div className="inv-list">{eqPendAsig.length === 0 ? <p className="empty">Sin equipos en lista.</p> : eqPendAsig.map((item) => <div key={item.tempId} className="inv-row"><div className="inv-row-head"><p className="inv-row-title">{item.codigo || "SIN-QR"} | {item.tipo} {item.marca} {item.modelo}</p><button type="button" className="secondary-btn small" onClick={() => setEqPendAsig((prev) => prev.filter((x) => x.tempId !== item.tempId))}>Quitar</button></div><p className="inv-row-meta">Tecnico: {item.tecnico || "-"}</p></div>)}</div>
	          </article>
	          <article className="inv-card">
	            <h3>Asignacion de materiales</h3>
	            <label className="inv-field">
	              Tecnico activo
	              <select value={asigMat.tecnico} onChange={(e) => setAsigMat((p) => ({ ...p, tecnico: e.target.value }))}>
	                <option value="">{tecnicos.length ? "Seleccionar tecnico activo" : "Sin tecnicos activos"}</option>
	                {tecnicos.map((t) => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
	              </select>
	            </label>
	            <label className="inv-field">Material<select value={asigMat.materialId} onChange={(e) => { const id = String(e.target.value || ""); const unidad = String(materiales.find((m) => String(m.id) === id)?.unidad || asigMat.unidad || "unidad"); setAsigMat((p) => ({ ...p, materialId: id, unidad })); }}><option value="">Seleccionar</option>{materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}</select></label>
            <div className="inv-form-grid two"><label>Cantidad<input value={asigMat.cantidad} onChange={(e) => setAsigMat((p) => ({ ...p, cantidad: e.target.value }))} /></label><label>Unidad<select value={asigMat.unidad} onChange={(e) => setAsigMat((p) => ({ ...p, unidad: e.target.value }))}><option>unidad</option><option>metros</option><option>rollo</option><option>caja</option></select></label></div>
            <p className="panel-meta">Stock disponible: {asigMat.materialId ? `${stockMaterialDisponible(asigMat.materialId, asigMat.unidad).toFixed(2)} ${asigMat.unidad}` : "-"}</p>
            <div className="inv-actions"><button type="button" className="primary-btn" onClick={() => { const tecIn = String(asigMat.tecnico || "").trim(); const tec = resolverNombreTecnico(tecIn); const matId = String(asigMat.materialId || "").trim(); const cant = num(asigMat.cantidad, -1); if (!tec || !esTecnicoRegistrado(tecIn) || !matId || cant <= 0) return window.alert("Completa tecnico/material/cantidad valida."); const mat = materiales.find((m) => String(m.id) === matId); if (!mat) return; const disponible = stockMaterialDisponible(matId, asigMat.unidad); if (cant > disponible) return window.alert(`Stock insuficiente. Disponible: ${disponible.toFixed(2)} ${asigMat.unidad}.`); const key = `${personaKey(tec)}|${matId}|${norm(asigMat.unidad)}`; setMatPendAsig((prev) => { const idx = prev.findIndex((x) => x.key === key); if (idx >= 0) { const siguiente = num(prev[idx].cantidad) + cant; const dispValidado = stockMaterialDisponible(matId, asigMat.unidad, prev.filter((x) => x.key !== key)); if (siguiente > dispValidado) { window.alert(`Stock insuficiente para acumular. Disponible: ${dispValidado.toFixed(2)} ${asigMat.unidad}.`); return prev; } const next = [...prev]; next[idx] = { ...next[idx], cantidad: siguiente }; return next; } return [...prev, { tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, key, tecnico: tec, materialId: matId, materialNombre: mat.nombre, unidad: asigMat.unidad, cantidad: cant, costoUnitario: mat.costo }]; }); setAsigMat((p) => ({ ...p, materialId: "", cantidad: "", tecnico: tec })); }}>Agregar</button><button type="button" className="secondary-btn" onClick={async () => { if (!matPendAsig.length) return window.alert("No hay materiales en lista."); try { for (const item of matPendAsig) { const tecIn = String(item.tecnico || "").trim(); const tec = resolverNombreTecnico(tecIn); if (!tec || !esTecnicoRegistrado(tecIn)) throw new Error(`Tecnico invalido en ${item.materialNombre}`); const ex = materialesAsig.find((m) => personaKey(m.tecnico) === personaKey(tec) && String(m.materialId) === String(item.materialId) && norm(m.unidad) === norm(item.unidad)); if (ex) { const nuevo = num(ex.disponible) + num(item.cantidad); const { error: err } = await supabase.from("materiales_asignados_tecnicos").update({ cantidad_disponible: nuevo, cantidad_asignada: nuevo }).eq("id", ex.id); if (err) throw err; } else { const { error: err } = await supabase.from("materiales_asignados_tecnicos").insert([{ tecnico: tec, material_id: Number.isFinite(Number(item.materialId)) ? Number(item.materialId) : null, material_nombre: item.materialNombre, cantidad_asignada: num(item.cantidad), cantidad_disponible: num(item.cantidad), unidad: item.unidad, fecha_asignacion: new Date().toISOString() }]); if (err) throw err; } await registrarMov({ tipoItem: "material", movimiento: "salida", motivo: "Asignacion a tecnico", itemNombre: item.materialNombre, referencia: materialRef(item.materialId), cantidad: item.cantidad, unidad: item.unidad, costoUnitario: item.costoUnitario, tecnico: tec }); } const total = matPendAsig.length; setMatPendAsig([]); await cargar(); window.alert(`${total} material(es) asignado(s).`); } catch (e) { window.alert(String(e?.message || "No se pudo asignar.")); } }}>Asignar todo ({matPendAsig.length})</button></div>
            <div className="inv-list">{matPendAsig.length === 0 ? <p className="empty">Sin materiales en lista.</p> : matPendAsig.map((item) => <div key={item.tempId} className="inv-row"><div className="inv-row-head"><p className="inv-row-title">{item.materialNombre} | {item.unidad}</p><button type="button" className="secondary-btn small" onClick={() => setMatPendAsig((prev) => prev.filter((x) => x.tempId !== item.tempId))}>Quitar</button></div><p className="inv-row-meta">Tecnico: {item.tecnico}</p><p className="inv-row-meta">Cantidad: {num(item.cantidad).toFixed(2)} {item.unidad}</p></div>)}</div>
          </article>
        </div>
      ) : null}

	      {tab === "articulos" && !esTecnico ? (
	        <div className="inv-pills">
	          <button type="button" className={articulosSubTab === "equipos" ? "inv-pill active" : "inv-pill"} onClick={() => setArticulosSubTab("equipos")}>
	            Equipos ({articulos.length})
	          </button>
	          <button type="button" className={articulosSubTab === "materialesCatalogo" ? "inv-pill active" : "inv-pill"} onClick={() => setArticulosSubTab("materialesCatalogo")}>
	            Catalogo materiales ({materiales.length})
	          </button>
	        </div>
	      ) : null}

	      {tab === "articulos" && !esTecnico && articulosSubTab === "materialesCatalogo" ? (
	        <div className="inv-grid-2">
	          <article className="inv-card">
	            <h3>Catalogo de materiales</h3>
	            {!fotoMaterialDisponible ? <p className="panel-meta">Se guardara sin foto hasta agregar columna foto_referencia.</p> : null}
	            <label className="inv-field">Nombre<input value={matForm.nombre} onChange={(e) => setMatForm((p) => ({ ...p, nombre: e.target.value }))} /></label>
	            <div className="inv-form-grid two"><label>Unidad<select value={matForm.unidad} onChange={(e) => setMatForm((p) => ({ ...p, unidad: e.target.value }))}><option>unidad</option><option>metros</option><option>rollo</option><option>caja</option></select></label><label>Costo<input value={matForm.costo} onChange={(e) => setMatForm((p) => ({ ...p, costo: e.target.value }))} /></label></div>
	            <label className="inv-field">Foto<input value={matForm.foto} onChange={(e) => setMatForm((p) => ({ ...p, foto: e.target.value }))} /></label>
	            <div className="inv-actions"><button type="button" className="secondary-btn small" onClick={() => matInputRef.current?.click()}>Subir</button><button type="button" className="secondary-btn small" onClick={() => setMatForm((p) => ({ ...p, foto: "" }))}>Quitar foto</button></div>
	            <input ref={matInputRef} type="file" accept="image/*" className="inv-hidden-file" onChange={(e) => void onFileMat(e)} />
	            <button type="button" className="primary-btn" onClick={async () => { const nombre = String(matForm.nombre || "").trim(); if (!nombre) return window.alert("Ingresa nombre."); const payload = { nombre, unidad_default: matForm.unidad || "unidad", costo_unitario: num(matForm.costo), ...(fotoMaterialDisponible ? { foto_referencia: String(matForm.foto || "") } : {}) }; const { error: err } = await supabase.from("materiales_catalogo").upsert([payload], { onConflict: "nombre" }); if (err) return window.alert(err.message || "No se pudo guardar."); await registrarMov({ tipoItem: "material", movimiento: "ingreso", motivo: "Alta en catalogo", itemNombre: payload.nombre, referencia: "", cantidad: 0, unidad: payload.unidad_default, costoUnitario: payload.costo_unitario, tecnico: "" }); setMatForm(emptyMat); await cargar(); }}>Guardar material</button>
	          </article>
	          <article className="inv-card">
	            <h3>Materiales ({materiales.length})</h3>
            <div className="inv-list">
              {materiales.map((m) => (
                <div key={m.id} className="inv-row inv-row-eq">
                  <div className="inv-row-eq-info">
                    <div className="inv-row-head">
                      <p className="inv-row-title">{m.nombre || "-"}</p>
                      <div className="inv-inline">
                      <button
                        type="button"
                        className="secondary-btn small inv-icon-btn"
                        aria-label="Editar costo"
                        title="Editar costo"
                        onClick={async () => {
                          const valor = window.prompt(`Nuevo costo para ${m.nombre}`, String(num(m.costo).toFixed(2)));
                          if (valor == null) return;
                          const nuevo = num(valor, -1);
                          if (nuevo < 0) return window.alert("Costo invalido.");
                          const { error: err } = await supabase.from("materiales_catalogo").update({ costo_unitario: nuevo }).eq("id", m.id);
                          if (err) return window.alert(err.message || "No se pudo actualizar.");
                          await cargar();
                        }}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                          <path d="M3 14.5V17h2.5l9-9-2.5-2.5-9 9zM12.6 4.1l2.5 2.5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="secondary-btn small inv-icon-btn"
                        onClick={() => document.getElementById(`mat-edit-foto-${m.id}`)?.click()}
                        disabled={!fotoMaterialDisponible}
                        aria-label={fotoMaterialDisponible ? "Subir foto" : "Falta columna foto_referencia"}
                        title={fotoMaterialDisponible ? "Subir foto" : "Falta columna foto_referencia"}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                          <rect x="2.5" y="4.5" width="15" height="11" rx="2.2" />
                          <circle cx="7" cy="8" r="1.2" />
                          <path d="M4.5 13l3.6-3.5 2.7 2.4 2-2 2.7 3.1M10 3v5M8.3 4.7L10 3l1.7 1.7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="secondary-btn small inv-icon-btn inv-icon-btn-danger"
                        aria-label="Eliminar material"
                        title="Eliminar material"
                        onClick={async () => {
                          const ok = window.confirm(`Eliminar material "${m.nombre || "sin nombre"}"? Esta accion no se puede deshacer.`);
                          if (!ok) return;
                          const { error: err } = await supabase.from("materiales_catalogo").delete().eq("id", m.id);
                          if (err) return window.alert(err.message || "No se pudo eliminar.");
                          await registrarMov({
                            tipoItem: "material",
                            movimiento: "salida",
                            motivo: "Eliminacion de catalogo",
                            itemNombre: m.nombre || "",
                            referencia: "",
                            cantidad: 0,
                            unidad: m.unidad || "unidad",
                            costoUnitario: m.costo,
                            tecnico: "",
                          });
                          await cargar();
                        }}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                          <path d="M5.5 6.5h9l-.8 10h-7.4l-.8-10zM7.5 6.5V4.8h5v1.7M4.5 6.5h11" />
                        </svg>
                      </button>
                      </div>
                    </div>
                    <p className="inv-row-meta">Unidad: {m.unidad || "unidad"} | Costo: S/ {num(m.costo).toFixed(2)} | Stock: {stockMaterialActual(m.id, m.unidad).toFixed(2)} {m.unidad || "unidad"}</p>
                  </div>
                  <input
                    id={`mat-edit-foto-${m.id}`}
                    type="file"
                    accept="image/*"
                    className="inv-hidden-file"
                    onChange={async (e) => {
                      const file = e?.target?.files?.[0];
                      if (!file) return;
                      try {
                        if (!fotoMaterialDisponible) {
                          window.alert("No se puede guardar foto: falta columna foto_referencia.");
                          return;
                        }
                        const data = await readImageAsDataUrl(file);
                        const { error: err } = await supabase
                          .from("materiales_catalogo")
                          .update({ foto_referencia: String(data || "") })
                          .eq("id", m.id);
                        if (err) {
                          window.alert(err.message || "No se pudo actualizar la foto.");
                          return;
                        }
                        await cargar();
                      } finally {
                        if (e?.target) e.target.value = "";
                      }
                    }}
                  />
                  {m.foto ? <img src={m.foto} alt={m.nombre || "material"} className="inv-thumb inv-thumb-mat" /> : null}
                </div>
              ))}
            </div>
	          </article>
	        </div>
	      ) : null}

	      {tab === "articulos" && !esTecnico && articulosSubTab === "equipos" ? (
        <div className="inv-grid-2">
          <article className="inv-card">
            <h3>Catalogo de articulos</h3>
            <p className="panel-meta">Define equipos base (tipo, marca, modelo y descripcion breve) para usar en Registro.</p>
            <div className="inv-form-grid two">
              <label>Tipo<input list="inv-art-tipos" value={artForm.tipo} onChange={(e) => setArtForm((p) => ({ ...p, tipo: e.target.value, marca: "", modelo: "" }))} placeholder="Ej. ONU" /></label>
              <label>Marca<input list="inv-art-marcas" value={artForm.marca} onChange={(e) => setArtForm((p) => ({ ...p, marca: e.target.value, modelo: "" }))} placeholder="Ej. Huawei" /></label>
              <label>Modelo<input list="inv-art-modelos" value={artForm.modelo} onChange={(e) => setArtForm((p) => ({ ...p, modelo: e.target.value }))} placeholder="Ej. HG8145X6-13" /></label>
              <label>Descripcion breve<input value={artForm.descripcion} onChange={(e) => setArtForm((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Ej. ONU WiFi 6 doble banda" /></label>
            </div>
            <label className="inv-field">Foto referencial<input value={artForm.foto} onChange={(e) => setArtForm((p) => ({ ...p, foto: e.target.value }))} placeholder="URL de foto o subir desde archivo" /></label>
            <datalist id="inv-art-tipos">{tiposLote.map((item) => <option key={item} value={item} />)}</datalist>
            <datalist id="inv-art-marcas">{marcasLote.map((item) => <option key={item} value={item} />)}</datalist>
            <datalist id="inv-art-modelos">{modelosLote.map((item) => <option key={item} value={item} />)}</datalist>
            <div className="inv-actions">
              <button type="button" className="primary-btn" onClick={guardarArticulo}>{artEditId ? "Guardar cambios" : "Guardar articulo"}</button>
              <button type="button" className="secondary-btn" onClick={() => artInputRef.current?.click()}>Subir foto</button>
              <button type="button" className="secondary-btn" onClick={() => setArtForm((p) => ({ ...p, foto: "" }))}>Quitar foto</button>
              <button type="button" className="secondary-btn" onClick={limpiarFormularioArticulo}>{artEditId ? "Cancelar edicion" : "Limpiar"}</button>
            </div>
            <input ref={artInputRef} type="file" accept="image/*" className="inv-hidden-file" onChange={(e) => void onFileArt(e)} />
            {artForm.foto ? (
              <button type="button" className="inv-art-photo-btn" onClick={() => window.open(String(artForm.foto), "_blank", "noopener,noreferrer")}>
                <img src={artForm.foto} alt="foto referencial articulo" className="inv-thumb inv-thumb-art-form" />
              </button>
            ) : null}
            {articulosMsg ? <p className="inv-note info">{articulosMsg}</p> : null}
          </article>
          <article className="inv-card">
            <h3>Articulos registrados ({articulos.length})</h3>
            <div className="inv-list">
              {articulos.length === 0 ? <p className="empty">Sin articulos. Crea el primero para usarlo en Registro.</p> : null}
              {articulos.map((item) => (
                <div key={item.id} className="inv-row inv-row-eq">
                  <div className="inv-row-eq-info">
                    <div className="inv-row-head">
                      <p className="inv-row-title">{item.tipo} | {item.marca} | {item.modelo}</p>
                      <div className="inv-actions">
                        <button type="button" className="secondary-btn small" onClick={() => editarArticulo(item.id)}>
                          Editar
                        </button>
                        <label className="secondary-btn small inv-upload-label">
                          Subir foto
                          <input
                            type="file"
                            accept="image/*"
                            className="inv-hidden-file"
                            onChange={(e) => {
                              const file = e?.target?.files?.[0];
                              if (file) void actualizarFotoArticulo(item.id, file);
                              if (e?.target) e.target.value = "";
                            }}
                          />
                        </label>
                        <button type="button" className="secondary-btn small" onClick={() => quitarFotoArticulo(item.id)}>Quitar foto</button>
                        <button type="button" className="secondary-btn small inv-icon-btn-danger" onClick={() => eliminarArticulo(item.id)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                    <p className="inv-row-meta">{item.descripcion ? `Descripcion: ${item.descripcion}` : "Descripcion: -"}</p>
                  </div>
                  {item.foto ? (
                    <button type="button" className="inv-art-photo-btn" onClick={() => window.open(String(item.foto), "_blank", "noopener,noreferrer")}>
                      <img src={item.foto} alt={`${item.tipo || "articulo"}-${item.modelo || "modelo"}`} className="inv-thumb inv-thumb-art" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}

      {tab === "catalogo" && !esTecnico ? (
        <div className="inv-section">
          <div className="inv-toolbar">
            <div className="inv-pills">
              <button
                type="button"
                className={filtroEstadoCatalogo === "TODOS" ? "inv-pill active" : "inv-pill"}
                onClick={() => setFiltroEstadoCatalogo("TODOS")}
              >
                Todos ({conteoCatalogo.TODOS})
              </button>
              <button
                type="button"
                className={filtroEstadoCatalogo === "almacen" ? "inv-pill active" : "inv-pill"}
                onClick={() => setFiltroEstadoCatalogo("almacen")}
              >
                Almacen ({conteoCatalogo.almacen})
              </button>
              <button
                type="button"
                className={filtroEstadoCatalogo === "asignado" ? "inv-pill active" : "inv-pill"}
                onClick={() => setFiltroEstadoCatalogo("asignado")}
              >
                Asignado ({conteoCatalogo.asignado})
              </button>
              <button
                type="button"
                className={filtroEstadoCatalogo === "liquidado" ? "inv-pill active" : "inv-pill"}
                onClick={() => setFiltroEstadoCatalogo("liquidado")}
              >
                Liquidado ({conteoCatalogo.liquidado})
              </button>
              <button
                type="button"
                className={filtroEstadoCatalogo === "conciliado" ? "inv-pill active" : "inv-pill"}
                onClick={() => setFiltroEstadoCatalogo("conciliado")}
              >
                Conciliados ({conteoCatalogo.conciliado})
              </button>
            </div>
            <button type="button" className="secondary-btn small" onClick={() => exportPdf()}>
              PDF filtrado ({catalogoOrdenado.length})
            </button>
          </div>
          <p className="panel-meta">
            Mostrando {catalogoDesde} a {catalogoHasta} de {catalogoOrdenado.length} equipos.
          </p>
          {String(tecnicoFiltro || "").trim() ? (
            <p className="panel-meta">Filtro tecnico aplicado: {tecnicoFiltro}</p>
          ) : null}
          <div className="inv-list">
            {catalogoPaginaRows.length === 0 ? <p className="empty">Sin equipos para mostrar.</p> : null}
            {catalogoPaginaRows.map((e) => (
              <div
                key={e.id}
                className="inv-row inv-row-eq inv-row-clickable"
                onClick={() => void abrirDetalleCatalogo(e, catalogoResumenMap[String(e.id || "")] || null)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    void abrirDetalleCatalogo(e, catalogoResumenMap[String(e.id || "")] || null);
                  }
                }}
              >
	                <div className="inv-row-eq-info">
	                  {(() => {
	                    const key = String(e.id || "");
	                    const resumen = catalogoResumenMap[key] || null;
	                    const esLiquidado = estadoGrupo(e.estado) === "liquidado";
	                    return (
	                      <>
                  <div className="inv-row-head">
                    <p className="inv-row-title">{equipoNombre(e)}</p>
                    <div className="inv-inline">
                      <span className={`inv-state ${estadoGrupo(e.estado)}`}>{estadoGrupo(e.estado)}</span>
                      {e.conciliacionEstado === "resuelto" ? (
                        <span className="inv-state almacen">Conciliado</span>
                      ) : null}
	                      <button
	                        type="button"
	                        className="secondary-btn small"
	                        onClick={async (event) => {
                          event.stopPropagation();
                          const nuevoEstado = window.prompt("Estado", String(e.estado || "almacen")) || String(e.estado || "almacen");
                          const nuevoTec = window.prompt("Tecnico (vacio si no asignado)", String(e.tecnico || ""));
                          const codigo = window.prompt("Codigo QR", String(e.codigo || ""));
                          if (!codigo) return window.alert("El codigo QR no puede quedar vacio.");
                          const grupo = estadoGrupo(nuevoEstado);
                          const estadoDb = grupo === "almacen" ? "disponible" : grupo === "asignado" ? "asignado" : "liquidado";
                          const tecnicoAsignado = grupo === "asignado" ? String(nuevoTec || "").trim() : "";
                          if (grupo === "asignado" && !tecnicoAsignado) return window.alert("Para asignado debes indicar tecnico.");
                          const { error: err } = await supabase
                            .from("equipos_catalogo")
                            .update({ estado: estadoDb, tecnico_asignado: tecnicoAsignado, codigo_qr: codigo })
                            .eq("id", e.id);
                          if (err) return window.alert(err.message || "No se pudo editar.");
                          if (estadoDb !== "liquidado") {
                            const keyId = String(e?.id || "");
                            const keyQrPrev = norm(e?.codigo);
                            const keySnPrev = norm(e?.serial);
                            setCatalogoResumenMap((prev) => ({ ...prev, [keyId]: null }));
                            setCatalogoOnuCacheMap((prev) => {
                              const next = { ...prev };
                              if (keyQrPrev) delete next[keyQrPrev];
                              if (keySnPrev) delete next[keySnPrev];
                              return next;
                            });
                          }
                          await cargar();
                          window.alert(`Equipo actualizado a ${estadoDb}.`);
                        }}
	                      >
	                        Editar
	                      </button>
                        {esAdmin ? (
	                      <button
	                        type="button"
	                        className="secondary-btn small inv-icon-btn-danger"
                        onClick={async (event) => {
                            event.stopPropagation();
                            const nombreEq = `${e.tipo || "Equipo"} ${e.marca || ""} ${e.modelo || ""}`.trim();
                            const ok = window.confirm(`Eliminar equipo "${nombreEq}" (${e.codigo || "SIN-QR"})? Esta accion no se puede deshacer.`);
                            if (!ok) return;
                            const del = await supabase.from("equipos_catalogo").delete().eq("id", e.id);
                            if (del.error) return window.alert(del.error.message || "No se pudo eliminar el equipo.");
                            await registrarMov({
                              tipoItem: "equipo",
                              movimiento: "salida",
                              motivo: "Eliminacion de catalogo",
                              itemNombre: equipoNombre(e),
                              referencia: e.codigo || "",
                              cantidad: 0,
                              unidad: "unidad",
                              costoUnitario: e.precio || 0,
                              tecnico: e.tecnico || "",
                            });
                            const keyId = String(e?.id || "");
                            const keyQr = norm(e?.codigo);
                            const keySn = norm(e?.serial);
                            setCatalogoResumenMap((prev) => ({ ...prev, [keyId]: null }));
                            setCatalogoOnuCacheMap((prev) => {
                              const next = { ...prev };
                              if (keyQr) delete next[keyQr];
                              if (keySn) delete next[keySn];
                              return next;
                            });
                            await cargar();
                            window.alert("Equipo eliminado.");
	                        }}
	                      >
	                        Eliminar
	                      </button>
                        ) : null}
	                    </div>
		                  </div>
	                  <p className="inv-row-meta inv-row-meta-qr">
	                    <span className="inv-qr-badge">QR</span>
	                    <span className="inv-qr-value">{e.codigo || "SIN-QR"}</span>
	                  </p>
	                  <p className="inv-row-meta">Serial: {e.serial || "-"} | Tecnico: {e.tecnico || "-"}</p>
	                  {esLiquidado && resumen ? (
	                    <>
                      <p className="inv-row-meta">
                        Orden: {firstValue(resumen.codigoOrden, "-") || "-"} | Cliente: {firstValue(resumen.cliente, "-") || "-"}
                      </p>
                      <p className="inv-row-meta">
                        Nodo: {firstValue(resumen.nodo, "-") || "-"} | Fecha: {firstValue(resumen.fecha, "-") || "-"}
                      </p>
                      <p className="inv-row-meta">
                        Ubicacion: {firstValue(resumen.ubicacion, resumen.direccion, "-") || "-"}
                      </p>
                      {resumen.mapaUrl ? (
                        <button
                          type="button"
                          className="secondary-btn small"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(String(resumen.mapaUrl), "_blank", "noopener,noreferrer");
                          }}
                        >
                          Ver mapa
                        </button>
	                      ) : null}
	                    </>
	                  ) : null}
	                      </>
	                    );
	                  })()}
	                </div>
                {e.foto ? <img src={e.foto} alt={e.codigo || "eq"} className="inv-thumb inv-thumb-eq" /> : null}
              </div>
            ))}
          </div>
          {catalogoOrdenado.length > CATALOGO_PAGE_SIZE ? (
            <div className="inv-toolbar">
              <button
                type="button"
                className="secondary-btn small"
                disabled={catalogoPaginaActiva <= 1}
                onClick={() => setCatalogoPagina((prev) => Math.max(1, Number(prev || 1) - 1))}
              >
                Anterior
              </button>
              <p className="panel-meta">
                Pagina {catalogoPaginaActiva} de {catalogoTotalPaginas}
              </p>
              <button
                type="button"
                className="secondary-btn small"
                disabled={catalogoPaginaActiva >= catalogoTotalPaginas}
                onClick={() => setCatalogoPagina((prev) => Math.min(catalogoTotalPaginas, Number(prev || 1) + 1))}
              >
                Siguiente
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "stockTecnico" ? (
        <div className="inv-grid-2">
          <article className="inv-card">
            <h3>Equipos del tecnico</h3>
            {!esTecnico ? <p className="panel-meta">Solo el tecnico asignado puede solicitar devoluciones desde su sesion.</p> : null}
            <div className="inv-pills">
              <button
                type="button"
                className={filtroEstadoStockTecnico === "ASIGNADO" ? "inv-pill active" : "inv-pill"}
                onClick={() => setFiltroEstadoStockTecnico("ASIGNADO")}
              >
                Asignado ({eqTecAsignadosCount})
              </button>
              <button
                type="button"
                className={filtroEstadoStockTecnico === "LIQUIDADO" ? "inv-pill active" : "inv-pill"}
                onClick={() => setFiltroEstadoStockTecnico("LIQUIDADO")}
              >
                Liquidado ({eqTecLiquidadosCount})
              </button>
            </div>
            {esTecnico ? (
              <div className="inv-actions">
                <button type="button" className="primary-btn small" onClick={() => void solicitarRecuperacionEquipo()}>
                  Solicitar recuperacion por QR
                </button>
              </div>
            ) : null}
            <div className="inv-list">
              {eqTecFiltrados.length === 0 ? <p className="empty">Sin equipos para mostrar.</p> : null}
              {eqTecFiltrados.map((item) => (
                <div key={item.id} className="inv-row inv-row-eq">
                  <div className="inv-row-eq-info">
                    <p className="inv-row-title">{equipoNombre(item)}</p>
                    <p className="inv-row-meta">QR: {item.codigo || "-"} | Estado: {item.estado || "-"} | Almacén: {item.almacenNombre || "-"}</p>
                    {solicitudesPendientesPorEquipo.has(String(item?.id || "")) ? (
                      <p className="inv-row-meta">Solicitud pendiente en revision de almacen.</p>
                    ) : null}
                    {esTecnico && filtroEstadoStockTecnico === "ASIGNADO" ? (
                      <div className="inv-actions">
                        <button
                          type="button"
                          className="secondary-btn small"
                          disabled={solicitudesPendientesPorEquipo.has(String(item?.id || ""))}
                          onClick={() => void devolverEquipoTecnico(item, "BUENO")}
                        >
                          {solicitudesPendientesPorEquipo.has(String(item?.id || "")) ? "Solicitud pendiente" : "Solicitar devolucion"}
                        </button>
                        <button
                          type="button"
                          className="secondary-btn small"
                          disabled={solicitudesPendientesPorEquipo.has(String(item?.id || ""))}
                          onClick={() => void devolverEquipoTecnico(item, "DANIADO")}
                        >
                          Solicitar devolucion daniada
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {item.foto ? <img src={item.foto} alt={item.codigo || "eq"} className="inv-thumb inv-thumb-eq" /> : null}
                </div>
              ))}
            </div>
          </article>
          <article className="inv-card">
            <h3>Materiales asignados ({matTec.length})</h3>
            <div className="inv-list">
              {matTec.length === 0 ? <p className="empty">Sin materiales asignados.</p> : null}
              {matTec.map((m) => (
                <div key={m.id} className="inv-row">
                  <p className="inv-row-title">{m.material || "-"}</p>
                  <p className="inv-row-meta">
                    Disp: {num(m.disponible).toFixed(2)} {m.unidad || "unidad"} | Asig: {num(m.asignado).toFixed(2)}
                  </p>
                  {num(pendienteMaterialPorAsignacion.get(String(m?.id || "")), 0) > 0 ? (
                    <p className="inv-row-meta">
                      Pendiente por confirmar en almacen: {num(pendienteMaterialPorAsignacion.get(String(m?.id || "")), 0).toFixed(2)} {m.unidad || "unidad"}
                    </p>
                  ) : null}
                  {esTecnico ? (
                    <div className="inv-actions">
                      <button
                        type="button"
                        className="secondary-btn small"
                        disabled={num(m.disponible) - num(pendienteMaterialPorAsignacion.get(String(m?.id || "")), 0) <= 0}
                        onClick={() => void devolverMaterialTecnico(m, "DEVOLUCION")}
                      >
                        Solicitar devolucion
                      </button>
                      <button
                        type="button"
                        className="secondary-btn small"
                        disabled={num(m.disponible) - num(pendienteMaterialPorAsignacion.get(String(m?.id || "")), 0) <= 0}
                        onClick={() => void devolverMaterialTecnico(m, "MERMA")}
                      >
                        Solicitar merma
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}

      {tab === "recogidos" ? (
        <div className="inv-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <h3 style={{ margin: 0 }}>Equipos recogidos — pendientes de entrega a almacén</h3>
            <button type="button" className="secondary-btn small" onClick={() => void cargarEquiposRecogidos()} disabled={cargandoRecogidos}>
              {cargandoRecogidos ? "Cargando..." : "Actualizar"}
            </button>
          </div>
          {cargandoRecogidos ? (
            <p className="panel-meta">Cargando...</p>
          ) : equiposRecogidos.length === 0 ? (
            <p className="empty">Sin equipos recogidos pendientes.</p>
          ) : (
            <div className="inv-list">
              {equiposRecogidos.map((item) => {
                const yaSolicitado = Boolean(item.codigo_entrega);
                const borderColor = yaSolicitado ? "#22c55e" : "#f59e0b";
                return (
                  <div key={item.id} className="inv-row inv-row-eq" style={{ borderLeft: `3px solid ${borderColor}` }}>
                    <div className="inv-row-eq-info">
                      <p className="inv-row-title" style={{ color: yaSolicitado ? "#166534" : "#92400e" }}>
                        {item.tipo || "-"}
                        {yaSolicitado && <span style={{ marginLeft: "8px", fontSize: "11px", background: "#dcfce7", color: "#166534", borderRadius: "999px", padding: "2px 8px", fontWeight: 700 }}>Entrega solicitada</span>}
                      </p>
                      <p className="inv-row-meta">Estado: <strong>{item.estado || "-"}</strong> | Cliente: {item.nombre_cliente || "-"} | Nodo: {item.nodo || "-"}</p>
                      <p className="inv-row-meta">Orden: {item.orden_codigo || "-"} · Recogido: {item.created_at ? new Date(item.created_at).toLocaleDateString("es-PE") : "-"}</p>
                      {yaSolicitado && (
                        <p className="inv-row-meta" style={{ color: "#166534", fontWeight: 600 }}>
                          Código: {item.codigo_entrega} · Solicitado: {item.fecha_solicitud_entrega ? new Date(item.fecha_solicitud_entrega).toLocaleString("es-PE") : "-"}
                        </p>
                      )}
                      <div className="inv-actions">
                        {esTecnico && !yaSolicitado && (
                          <button
                            type="button"
                            className="primary-btn small"
                            onClick={async () => {
                              const año = new Date().getFullYear();
                              const seq = String(item.id).padStart(4, "0");
                              const codigo = `ENT-${seq}-${año}`;
                              const ahora = new Date().toISOString();
                              await supabase.from("stock_tecnico").update({
                                codigo_entrega: codigo,
                                fecha_solicitud_entrega: ahora,
                                solicitado_por: String(sessionUser?.nombre || sessionUser?.username || ""),
                                updated_at: ahora,
                              }).eq("id", item.id);
                              setEquiposRecogidos((prev) => prev.map((r) => r.id === item.id ? { ...r, codigo_entrega: codigo, fecha_solicitud_entrega: ahora, solicitado_por: String(sessionUser?.nombre || "") } : r));
                            }}
                          >
                            Solicitar entrega a almacén
                          </button>
                        )}
                        {!esTecnico && (
                          <button
                            type="button"
                            className="danger-btn small"
                            onClick={async () => {
                              if (!window.confirm("¿Eliminar este equipo recogido del stock?")) return;
                              await supabase.from("stock_tecnico").delete().eq("id", item.id);
                              setEquiposRecogidos((prev) => prev.filter((r) => r.id !== item.id));
                            }}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                    {Array.isArray(item.fotos) && item.fotos[0] ? (
                      <img src={item.fotos[0]} alt="equipo" className="inv-thumb inv-thumb-eq" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === "movimientos" ? (
        <>
          <article className="inv-card">
            <div className="inv-row-head">
              <h3>Kardex ({kardexFiltrado.length})</h3>
              <button type="button" className="secondary-btn small" onClick={() => exportKardexPdf()}>
                PDF kardex ({kardexFiltrado.length})
              </button>
            </div>
            <div className="inv-kardex-filters">
              <label>
                Desde
                <input type="date" value={kardexFechaDesde} onChange={(e) => setKardexFechaDesde(e.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={kardexFechaHasta} onChange={(e) => setKardexFechaHasta(e.target.value)} />
              </label>
              <label>
                Movimiento
                <select value={kardexMovFiltro} onChange={(e) => setKardexMovFiltro(e.target.value)}>
                  <option value="TODOS">Todos</option>
                  <option value="INGRESO">Ingreso/Entrada</option>
                  <option value="SALIDA">Salida</option>
                </select>
              </label>
              {!esTecnico ? (
                <label>
                  Tecnico
                  <select value={kardexTecnicoFiltro} onChange={(e) => setKardexTecnicoFiltro(e.target.value)}>
                    <option value="">Todos</option>
                    {kardexTecnicosOpciones.map((t) => (
                      <option key={`kardex-tec-${t}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="secondary-btn small"
                onClick={() => {
                  setKardexFechaDesde("");
                  setKardexFechaHasta("");
                  setKardexMovFiltro("TODOS");
                  setKardexTecnicoFiltro("");
                }}
              >
                Limpiar
              </button>
            </div>
            <div className="inv-list">
              {kardexFiltrado.length === 0 ? <p className="empty">No hay movimientos.</p> : null}
              {kardexFiltrado.map((m) => {
                const fotoMov = resolverFotoKardex(m);
                return (
                  <div key={m.id} className="inv-row inv-row-eq">
                    <div className="inv-row-eq-info">
                      <div className="inv-row-head">
                        <p className="inv-row-title">{new Date(m.fecha).toLocaleString()} | {m.tipo || "-"} | {m.mov || "-"}</p>
                        <span className={`inv-state ${norm(m.mov).includes("ingreso") || norm(m.mov).includes("entrada") ? "almacen" : "asignado"}`}>{m.mov || "-"}</span>
                      </div>
                      <p className="inv-row-meta">Motivo: {m.motivo || "-"} | Item: {m.item || "-"} | Cant: {num(m.cant).toFixed(2)} {m.unidad || "unidad"}</p>
                      <p className="inv-row-meta">QR: {m.ref || "SIN-QR"} | Tecnico: {m.tecnico || "-"} | Actor: {m.actor || "-"} | Nodo: {m.nodo || "-"} | Almacén: {m.almacenNombre || "-"}</p>
                    </div>
                    {fotoMov ? <img src={fotoMov} alt={`mov-${m.ref || m.id || "item"}`} className="inv-thumb inv-thumb-kardex" /> : null}
                  </div>
                );
              })}
            </div>
          </article>
          <article className="inv-card">
            <h3>
              {esTecnico
                ? `Mis solicitudes de devolucion (${solicitudesVisibles.length})`
                : `Solicitudes de devolucion (${solicitudesPendientes.length} pendientes)`}
            </h3>
            {!solicitudesDisponibles ? <p className="warn-text">Falta tabla de solicitudes. Ejecuta la migracion SQL de inventario.</p> : null}
            <div className="inv-list">
              {solicitudesVisibles.length === 0 ? <p className="empty">No hay solicitudes.</p> : null}
              {solicitudesVisibles.map((s) => {
                const enProceso = String(solicitudProcesandoId || "") === String(s.id || "");
                const tipoSolicitud = String(s?.tipoSolicitud || "DEVOLUCION").toUpperCase();
                return (
                  <div key={s.id} className="inv-row">
                    <div className="inv-row-head">
                      <p className="inv-row-title">
                        {String(s.tipoItem || "-").toUpperCase()} | {s.estado || "-"} | {formatDateTimeLabel(s.createdAt || "")}
                      </p>
                      <span className={`inv-state ${String(s.estado || "").toUpperCase() === "APROBADA" ? "almacen" : String(s.estado || "").toUpperCase() === "RECHAZADA" ? "asignado" : ""}`}>{s.estado || "-"}</span>
                    </div>
                    <p className="inv-row-meta">
                      Tecnico: {s.tecnico || "-"} | Solicita: {s.actorSolicita || "-"} | Estado retorno: {s.estadoRetorno || "-"}
                    </p>
                    <p className="inv-row-meta">
                      Tipo solicitud: {tipoSolicitud === "MERMA" ? "Merma" : tipoSolicitud === "RECUPERACION" ? "Recuperacion" : "Devolucion"}
                      {s.nodoOrigen ? ` | Nodo origen: ${s.nodoOrigen}` : ""}
                    </p>
                    <p className="inv-row-meta">
                      {s.tipoItem === "equipo"
                        ? `Equipo QR: ${s.codigoQr || "-"}`
                        : `Material: ${s.materialNombre || "-"} | Cant: ${num(s.cantidad).toFixed(2)} ${s.unidad || "unidad"}`}
                    </p>
                    {s.esLegacySinQr ? <p className="inv-row-meta">Modo legacy sin QR: SI</p> : null}
                    {s.identificadorAlterno ? <p className="inv-row-meta">Identificador alterno: {s.identificadorAlterno}</p> : null}
                    <p className="inv-row-meta">Motivo: {s.motivo || "-"}</p>
                    {s.rechazoMotivo ? <p className="warn-text">Rechazo: {s.rechazoMotivo}</p> : null}
                    {!esTecnico && String(s.estado || "").toUpperCase() === "PENDIENTE" ? (
                      <div className="inv-actions">
                        <button
                          type="button"
                          className="primary-btn small"
                          onClick={() => void aprobarSolicitudDevolucionInventario(s)}
                          disabled={Boolean(solicitudProcesandoId)}
                        >
                          {enProceso ? "Procesando..." : "Aprobar"}
                        </button>
                        <button
                          type="button"
                          className="secondary-btn small"
                          onClick={() => void rechazarSolicitudDevolucionInventario(s)}
                          disabled={Boolean(solicitudProcesandoId)}
                        >
                          {enProceso ? "Procesando..." : "Rechazar"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </article>
        </>
      ) : null}

      {catalogoDetVisible ? (
        <div
          className="inv-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setCatalogoDetVisible(false);
              setCatalogoFotoPreview("");
              setCatalogoVerMas({ orden: false, liquidacion: false, relacion: false });
            }
          }}
        >
          <article className="inv-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Detalle de equipo / orden</h3>
            <div className="inv-modal-scroll">
              {catalogoDetLoading ? <p className="panel-meta">Cargando detalle...</p> : null}
	              {!catalogoDetLoading && catalogoDetError ? <p className="warn-text">{catalogoDetError}</p> : null}
	              {!catalogoDetLoading && !catalogoDetError && catalogoDetData ? (
	                <>
	                  <p className="panel-meta">Fuente: {catalogoDetData?.fuente || "ONUsRegistradas"}</p>
	                  <div className="inv-det-block">
	                    <strong>Equipo inventario</strong>
                    <p>Nombre: {equipoNombre(catalogoDetData.equipo)}</p>
                    <p>
                      QR: {catalogoDetData.equipo?.codigo || "-"} | Serial: {catalogoDetData.equipo?.serial || "-"}
                    </p>
                    <p>
                      Estado: {estadoGrupo(catalogoDetData.equipo?.estado)} | Tecnico: {catalogoDetData.equipo?.tecnico || "-"}
                    </p>
                  </div>

	                  <div className="inv-det-block">
	                    <strong>Informacion de orden</strong>
	                    {detalleOrdenCamposConValor.length > 0 ? (
	                      <div className="inv-det-grid">
	                        {detalleOrdenCamposVisibles.map((item) => (
	                          <div key={`ord-det-${item.label}`} className="inv-det-item">
	                            <span>{item.label}</span>
	                            <p>{firstValue(item.value, "-") || "-"}</p>
	                          </div>
	                        ))}
		                      </div>
		                    ) : (
		                      <p className="panel-meta">No hay datos de cliente en ONUsRegistradas para este equipo.</p>
		                    )}
	                      {detalleOrdenCamposConValor.length > DETALLE_CAMPOS_RESUMEN ? (
	                        <div className="inv-actions">
	                          <button
	                            type="button"
	                            className="secondary-btn small"
	                            onClick={() => toggleCatalogoVerMas("orden")}
                          >
                            {catalogoVerMas.orden ? "Ver menos" : "Ver mas"}
                          </button>
                        </div>
                      ) : null}
	                  </div>

	                  <div className="inv-det-block">
	                    <strong>Informacion de liquidacion</strong>
	                    {detalleLiquidacionCamposConValor.length > 0 ? (
	                      <div className="inv-det-grid">
	                        {detalleLiquidacionCamposVisibles.map((item) => (
	                          <div key={`liq-det-${item.label}`} className="inv-det-item">
	                            <span>{item.label}</span>
	                            <p>{firstValue(item.value, "-") || "-"}</p>
	                          </div>
	                        ))}
		                      </div>
		                    ) : (
		                      <p className="panel-meta">No hay datos de estado/liquidacion en ONUsRegistradas para este equipo.</p>
		                    )}
	                      {detalleLiquidacionCamposConValor.length > DETALLE_CAMPOS_RESUMEN ? (
	                        <div className="inv-actions">
	                          <button
	                            type="button"
	                            className="secondary-btn small"
	                            onClick={() => toggleCatalogoVerMas("liquidacion")}
                          >
                            {catalogoVerMas.liquidacion ? "Ver menos" : "Ver mas"}
                          </button>
	                        </div>
	                      ) : null}
	                  </div>
		                  <div className="inv-det-block">
	                    <strong>Ubicacion y mapa</strong>
	                    <div className="inv-det-grid">
	                      <div className="inv-det-item">
	                        <span>Ubicacion</span>
	                        <p>{firstValue(detalleUbicacion, "-") || "-"}</p>
	                      </div>
	                      <div className="inv-det-item">
	                        <span>Coordenadas</span>
	                        <p>
	                          {detalleCoords
	                            ? `${Number(detalleCoords.lat).toFixed(6)}, ${Number(detalleCoords.lng).toFixed(6)}`
	                            : "-"}
	                        </p>
	                      </div>
	                      <div className="inv-det-item">
	                        <span>Direccion</span>
	                        <p>{firstValue(detalleDireccion, "-") || "-"}</p>
	                      </div>
	                      <div className="inv-det-item">
	                        <span>Mapa</span>
	                        <p>
	                          {detalleMapUrl ? (
	                            <button
	                              type="button"
	                              className="secondary-btn small"
	                              onClick={() => window.open(detalleMapUrl, "_blank", "noopener,noreferrer")}
	                            >
	                              Abrir en Google Maps
	                            </button>
	                          ) : (
	                            "Sin ubicacion para mostrar mapa."
	                          )}
	                        </p>
	                      </div>
	                    </div>
	                    {detalleMapEmbedUrl ? (
	                      <div className="inv-map-wrap">
	                        <iframe
	                          title="Mapa detalle equipo"
	                          src={detalleMapEmbedUrl}
	                          loading="lazy"
	                          className="inv-map-frame"
	                        />
	                      </div>
	                    ) : null}
	                  </div>

	                  {catalogoDetData.equipoLiquidado ? (
	                    <div className="inv-det-block">
	                      <strong>Relacion equipo-liquidacion</strong>
	                      <div className="inv-det-grid">
	                        {detalleRelacionCamposVisibles.map((item) => (
	                          <div key={`rel-det-${item.label}`} className="inv-det-item">
	                            <span>{item.label}</span>
	                            <p>{firstValue(item.value, "-") || "-"}</p>
	                          </div>
	                        ))}
	                      </div>
                        {detalleRelacionCampos.length > DETALLE_CAMPOS_RESUMEN ? (
                          <div className="inv-actions">
                            <button
                              type="button"
                              className="secondary-btn small"
                              onClick={() => toggleCatalogoVerMas("relacion")}
                            >
                              {catalogoVerMas.relacion ? "Ver menos" : "Ver mas"}
                            </button>
                          </div>
                        ) : null}
	                    </div>
	                  ) : null}

		                  <div className="inv-det-block">
		                    <strong>Fotos ({Array.isArray(catalogoDetData.fotos) ? catalogoDetData.fotos.filter((foto) => resolvePhotoCandidates(foto).length > 0).length : 0})</strong>
		                    {Array.isArray(catalogoDetData.fotos) &&
	                    catalogoDetData.fotos.some((foto) => resolvePhotoCandidates(foto).length > 0) ? (
	                      <div className="inv-modal-photos">
	                        {catalogoDetData.fotos
	                          .filter((foto) => resolvePhotoCandidates(foto).length > 0)
	                          .map((foto, idx) => (
	                            <InventoryPhotoThumb
	                              key={`cat-det-f-${idx}-${String(foto).slice(0, 24)}`}
	                              photo={foto}
	                              index={idx}
	                              onPreview={(url) => setCatalogoFotoPreview(String(url || ""))}
	                            />
	                          ))}
	                      </div>
	                    ) : (
	                      <p className="panel-meta">Sin fotos registradas.</p>
	                    )}
	                  </div>
                    {catalogoFotoPreview ? (
                      <div
                        className="inv-lightbox-overlay"
                        onClick={() => setCatalogoFotoPreview("")}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
                            setCatalogoFotoPreview("");
                          }
                        }}
                      >
                        <article className="inv-lightbox-card" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="secondary-btn small inv-lightbox-close"
                            onClick={() => setCatalogoFotoPreview("")}
                          >
                            Cerrar
                          </button>
                          <img src={catalogoFotoPreview} alt="Foto ampliada" className="inv-lightbox-image" />
                        </article>
                      </div>
                    ) : null}
                </>
              ) : null}
            </div>
            <div className="inv-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setCatalogoDetVisible(false);
                  setCatalogoFotoPreview("");
                  setCatalogoVerMas({ orden: false, liquidacion: false, relacion: false });
                }}
              >
                Cerrar
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {scanEqReg ? <QRScanner onDetected={(value) => { const qr = String(value || "").trim(); setEqForm((p) => ({ ...p, codigo: qr })); const valid = validarQrRegistro(qr); setQrRegistroMsg(valid.text); setScanEqReg(false); }} onClose={() => setScanEqReg(false)} /> : null}
      {scanEqAsig ? <QRScanner onDetected={(value) => { agregarEquipoAsignacionPorCodigo(String(value || "").trim()); setScanEqAsig(false); }} onClose={() => setScanEqAsig(false)} /> : null}
    </section>
  );
}



