import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
const TRAIL_COLORS = ["#1E4F9C", "#F47A20", "#00C853", "#EC4899", "#0EA5E9", "#7C3AED"];
// Ventana de todo el dia (no solo unas horas), y un tope de puntos generoso:
// con el ping cada 6s, 4h ya son 2400 puntos — el limite viejo (300) cortaba
// el recorrido a los ultimos ~30 minutos sin que se notara en el checkbox
// "Mostrar recorrido", dando la impresion de que el trazo aparecia/desaparecia.
const TRAIL_WINDOW_HOURS = 24;
const TRAIL_MAX_POINTS = 20000;
const AUTO_REFRESH_MS = 6_000;
const STALE_MIN_THRESHOLD = 3;
// Velocidad urbana asumida para el ETA (no hay API de rutas de por medio,
// solo distancia en linea recta / esta velocidad) — ajustable si hace falta.
const ASSUMED_AVG_SPEED_KMH = 28;
// Distancia y velocidad bajo las cuales se considera que el tecnico
// "llego" a la orden (para el halo pulsante en el mapa).
const ARRIVAL_KM = 0.08;
const ARRIVAL_STOPPED_KMH = 5;

const toText = (value) => String(value ?? "").trim();
const isValidCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
const parseUbicacion = (value) => {
  const m = String(value ?? "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return isValidCoord(lat, lng) ? { lat, lng } : null;
};
const ESTADO_ORDEN_COLOR = { Pendiente: "#F59E0B", Liquidada: "#16A34A", Cancelada: "#94A3B8" };

// Paths SVG reales de Lucide (misma libreria de iconos que ya usa el resto de
// la app) en vez de emojis — se ven nitidos y profesionales en vez de
// depender de como cada sistema operativo dibuje el emoji.
const TIPO_ORDEN_ICON = [
  {
    match: "instal",
    label: "Instalacion",
    paths: [
      "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"
    ]
  },
  {
    match: "incid",
    label: "Incidencia",
    paths: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"]
  },
  {
    match: "recup",
    label: "Recuperacion",
    paths: ["M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8", "M21 3v5h-5"]
  }
];
const TIPO_ORDEN_ICON_DEFAULT = {
  label: "Orden",
  rects: [{ x: 8, y: 2, w: 8, h: 4 }],
  paths: ["M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "M12 11h4", "M12 16h4", "M8 11h.01", "M8 16h.01"]
};
const iconoParaTipoActuacion = (tipoActuacion) => {
  const tipoLow = String(tipoActuacion || "").toLowerCase();
  return TIPO_ORDEN_ICON.find((t) => tipoLow.includes(t.match)) || TIPO_ORDEN_ICON_DEFAULT;
};

// Icono circular por orden: color del anillo = estado, icono central = tipo
// de actuacion (instalacion/incidencia/recuperacion/otro) — asi se distingue
// de un vistazo el tipo de trabajo sin abrir cada marcador. Dibuja los paths
// SVG directo con Path2D, sin cargar ninguna imagen externa.
const ordenIconCache = new Map();
function crearIconoOrden(tipoActuacion, estado) {
  const icono = iconoParaTipoActuacion(tipoActuacion);
  const color = ESTADO_ORDEN_COLOR[estado] || "#7C3AED";
  const cacheKey = `${icono.label}|${color}`;
  if (ordenIconCache.has(cacheKey)) return ordenIconCache.get(cacheKey);

  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(15,23,42,0.35)";
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();

  // Los paths de Lucide usan un viewBox de 24x24 — se escalan y centran para
  // que quepan dentro del circulo, dejando un margen limpio.
  ctx.save();
  const iconSize = size * 0.52;
  const scale = iconSize / 24;
  ctx.translate(size / 2 - iconSize / 2, size / 2 - iconSize / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  (icono.paths || []).forEach((d) => ctx.stroke(new Path2D(d)));
  (icono.rects || []).forEach((r) => ctx.strokeRect(r.x, r.y, r.w, r.h));
  ctx.restore();

  const dataUrl = canvas.toDataURL("image/png");
  ordenIconCache.set(cacheKey, dataUrl);
  return dataUrl;
}
const formatDateTime = (value) => {
  const d = new Date(value || Date.now());
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("es-PE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
const formatAgo = (value) => {
  const d = new Date(value || Date.now());
  if (!Number.isFinite(d.getTime())) return "-";
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
};
const colorForVehiculoId = (value) => {
  const id = toText(value);
  if (!id) return TRAIL_COLORS[0];
  let acc = 0;
  for (let i = 0; i < id.length; i += 1) acc = (acc + id.charCodeAt(i) * (i + 11)) % 997;
  return TRAIL_COLORS[acc % TRAIL_COLORS.length];
};
const HARSH_BRAKE_KMH_DROP = 15;
const HARSH_BRAKE_MAX_SECONDS = 5;
const EARTH_RADIUS_KM = 6371;
const haversineKm = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

// Rumbo (0-360, 0=norte) entre dos puntos — para orientar la flecha de
// direccion del reproductor de recorrido, igual que un GPS tracker real.
const bearingDeg = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const toDeg = (v) => (v * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

// Colorea cada tramo recorrido segun la velocidad en ese punto — el mismo
// codigo de colores que usan los dashboards de flotas profesionales.
const SPEED_COLOR_STOPS = [
  { max: 5, color: "#94a3b8" },
  { max: 20, color: "#16a34a" },
  { max: 50, color: "#eab308" },
  { max: 80, color: "#f97316" },
  { max: Infinity, color: "#dc2626" }
];
const colorForSpeedKmh = (kmh) => (SPEED_COLOR_STOPS.find((s) => kmh <= s.max) || SPEED_COLOR_STOPS[SPEED_COLOR_STOPS.length - 1]).color;

// Suavizado puramente visual (sin llamar a ninguna API): asi es como apps
// como Uber/InDrive hacen que el trazo en vivo se vea fluido sin pagar por
// ajustarlo a la calle en tiempo real — solo interpola una curva suave entre
// los puntos GPS ya capturados, gratis y al instante.
function suavizarPuntos(points) {
  if (!Array.isArray(points) || points.length < 3) return points || [];
  const pts = points;
  const out = [pts[0]];
  const segmentsPerGap = 6;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    for (let s = 1; s <= segmentsPerGap; s++) {
      const t = s / segmentsPerGap;
      const t2 = t * t;
      const t3 = t2 * t;
      const lat =
        0.5 *
        (2 * p1.lat +
          (-p0.lat + p2.lat) * t +
          (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
          (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3);
      const lng =
        0.5 *
        (2 * p1.lng +
          (-p0.lng + p2.lng) * t +
          (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 +
          (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3);
      out.push({ lat, lng });
    }
  }
  return out;
}

// Ajuste real a calles (Google Roads API) — solo se usa bajo demanda para
// revisar el recorrido de un dia especifico ("Detalle de recorrido"), nunca
// para el mapa en vivo, para mantenerse dentro del rango gratuito mensual.
const ROADS_API_BATCH = 100;
async function snapToRoadsBatched(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const out = [];
  for (let i = 0; i < points.length; i += ROADS_API_BATCH) {
    const batch = points.slice(i, i + ROADS_API_BATCH);
    if (batch.length < 2) continue;
    const path = batch.map((p) => `${p.lat},${p.lng}`).join("|");
    const url = `https://roads.googleapis.com/v1/snapToRoads?interpolate=true&path=${encodeURIComponent(path)}&key=${GOOGLE_MAPS_API_KEY}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const snapped = Array.isArray(data?.snappedPoints) ? data.snappedPoints : [];
      snapped.forEach((sp) => {
        const lat = Number(sp?.location?.latitude);
        const lng = Number(sp?.location?.longitude);
        if (isValidCoord(lat, lng)) out.push({ lat, lng });
      });
    } catch {
      // si un lote falla, seguir con el resto en vez de perder todo el recorrido
    }
  }
  return out;
}
const todayLocalDateStr = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const ACTIVITY_LABELS = {
  en_vehiculo: "🚗 En vehiculo",
  en_bicicleta: "🚲 En bicicleta",
  a_pie: "🚶 A pie",
  corriendo: "🏃 Corriendo",
  quieto: "⏸️ Quieto",
  inclinando: "↕️ Inclinando",
  caminando: "🚶 Caminando",
  desconocido: "❓ Desconocido"
};

// Cache compartido de iconos circulares con foto del vehiculo (por
// url+color+rumbo) para no re-dibujar en cada refresco.
const circleIconCache = new Map();

// Igual que crearIconoCircular, pero con un pequeño triangulo de rumbo
// "horneado" en el propio icono (en vez de un marcador de flecha aparte) —
// asi se ve integrado, como un GPS tracker profesional, sin necesidad de
// rotar la foto real del vehiculo (que no tiene un "frente" definido como un
// icono vectorial). El rumbo se redondea a intervalos de 15° para que el
// cache no tenga que regenerar la imagen en cada micro-cambio de direccion.
const HEADING_BUCKET_DEG = 15;
const roundHeadingBucket = (bearing) => {
  if (bearing == null || !Number.isFinite(bearing)) return null;
  return Math.round(bearing / HEADING_BUCKET_DEG) * HEADING_BUCKET_DEG % 360;
};
// Velocidad redondeada a intervalos de 5 km/h — igual que con el rumbo, para
// que el badge no obligue a regenerar el icono con cada micro-fluctuacion.
const SPEED_BADGE_BUCKET = 5;
const roundSpeedBucket = (kmh) => {
  if (kmh == null || !Number.isFinite(kmh) || kmh < 0) return null;
  return Math.round(kmh / SPEED_BADGE_BUCKET) * SPEED_BADGE_BUCKET;
};

function crearIconoVehiculoConRumbo(fotoUrl, color, bearing, speedKmh, onReady) {
  const bucket = roundHeadingBucket(bearing);
  const speedBucket = roundSpeedBucket(speedKmh);
  const cacheKey = `${fotoUrl}|${color}|${bucket}|${speedBucket}`;
  if (circleIconCache.has(cacheKey)) return circleIconCache.get(cacheKey);
  if (!fotoUrl) return null;

  const size = 60;
  const badgeH = 18; // reservado siempre, asi el marcador tiene un tamaño/anchor fijo aunque no haya velocidad aun
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + badgeH;
  const ctx = canvas.getContext("2d");
  const radius = size / 2 - 5;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, size / 2 - radius, size / 2 - radius, radius * 2, radius * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();

      if (bucket != null) {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate((bucket * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(0, -radius - 7);
        ctx.lineTo(-6, -radius + 3);
        ctx.lineTo(6, -radius + 3);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.restore();
      }

      if (speedBucket != null) {
        const label = `${speedBucket} km/h`;
        ctx.font = "bold 11px sans-serif";
        const textW = ctx.measureText(label).width;
        const pillW = textW + 14;
        const pillX = size / 2 - pillW / 2;
        const pillY = size - 2;
        const pillH = badgeH;
        const speedColor = colorForSpeedKmh(speedBucket);
        ctx.beginPath();
        ctx.moveTo(pillX + pillH / 2, pillY);
        ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, pillH / 2);
        ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, pillH / 2);
        ctx.arcTo(pillX, pillY + pillH, pillX, pillY, pillH / 2);
        ctx.arcTo(pillX, pillY, pillX + pillW, pillY, pillH / 2);
        ctx.closePath();
        ctx.fillStyle = speedColor;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
      }

      const dataUrl = canvas.toDataURL("image/png");
      circleIconCache.set(cacheKey, dataUrl);
      onReady?.(dataUrl);
    } catch (e) {
      console.warn("No se pudo generar el icono de vehiculo con rumbo:", e);
    }
  };
  img.onerror = () => {
    console.warn("No se pudo cargar la foto del vehiculo para el icono:", fotoUrl);
  };
  img.src = fotoUrl;
  return null;
}

const s = {
  statBlock: { display: "flex", flexDirection: "column", gap: 2, minWidth: 90 },
  statLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },
  statValue: { fontSize: 14, color: "#1e293b" }
};

const playerIconBtnStyle = {
  width: 36, height: 36, borderRadius: 18, border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 15, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center"
};

const tableMissing = (err, tableName) => {
  const code = String(err?.code || "").trim();
  const msg = String(err?.message || "").toLowerCase();
  return code === "42P01" || msg.includes(String(tableName || "").toLowerCase());
};
const loadGoogleMapsSdk = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("Sin navegador."));
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error("Sin token Google Maps."));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (window.__gmapsPromise) return window.__gmapsPromise;
  window.__gmapsPromise = new Promise((resolve, reject) => {
    const previous = document.getElementById("google-maps-js-sdk");
    if (previous) {
      previous.addEventListener("load", () => resolve(window.google.maps), { once: true });
      previous.addEventListener("error", () => reject(new Error("No se pudo cargar Google Maps.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-js-sdk";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
    document.head.appendChild(script);
  });
  return window.__gmapsPromise;
};

export default function SeguimientoVehiculosPanel() {
  const mapCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const polylinesRef = useRef([]);
  const vehicleMarkersRef = useRef(new Map());
  const pulseRafRef = useRef(null);
  const autoFitDoneRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  const [vehiculos, setVehiculos] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [currentRows, setCurrentRows] = useState([]);
  const [trailByVehiculo, setTrailByVehiculo] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [followVehicle, setFollowVehicle] = useState(false);
  const [showTrail, setShowTrail] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState(() => new Date());

  const [editVehiculo, setEditVehiculo] = useState(null);
  const [editForm, setEditForm] = useState({ placa: "", alias: "", marca: "", modelo: "", color: "", tecnicoAsignado: "", activo: true, fotoUrl: "" });
  const [editFotoFile, setEditFotoFile] = useState(null);
  const [editFotoPreview, setEditFotoPreview] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const [ordenesHoy, setOrdenesHoy] = useState([]);
  const [showOrdenes, setShowOrdenes] = useState(true);
  const orderMarkersRef = useRef([]);
  const arrivedPulsesRef = useRef([]);

  const [iconVersion, setIconVersion] = useState(0);
  const [analyticsDate, setAnalyticsDate] = useState(() => todayLocalDateStr());
  const [analyticsByVehiculo, setAnalyticsByVehiculo] = useState({});
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [snappedPathByVehiculo, setSnappedPathByVehiculo] = useState({});
  const [loadingSnap, setLoadingSnap] = useState(false);
  const snapPolylinesRef = useRef([]);

  const [analyticsHoraDesde, setAnalyticsHoraDesde] = useState("00:00");
  const [analyticsHoraHasta, setAnalyticsHoraHasta] = useState("23:59");

  const [playbackVehiculoId, setPlaybackVehiculoId] = useState(null);
  const [playbackPoints, setPlaybackPoints] = useState([]);
  const [loadingPlayback, setLoadingPlayback] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [playbackElapsedMs, setPlaybackElapsedMs] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(20);
  const playbackMarkerRef = useRef(null);
  const playbackHeadingBucketRef = useRef(null);
  const playbackSpeedBucketRef = useRef(null);
  const playbackLastBearingRef = useRef(null);
  const playbackLineDoneRef = useRef([]);
  const playbackLineRestRef = useRef(null);
  const playbackLineActiveRef = useRef(null);
  const playbackSegmentIdxRef = useRef(0);
  const playbackTickRef = useRef(null);

  const vehiculoById = useMemo(() => {
    const map = {};
    (Array.isArray(vehiculos) ? vehiculos : []).forEach((v) => { map[v.id] = v; });
    return map;
  }, [vehiculos]);

  const cargarVehiculos = useCallback(async () => {
    const { data, error: fetchError } = await supabase.from("vehiculos").select("*").order("placa", { ascending: true });
    if (fetchError) {
      if (tableMissing(fetchError, "vehiculos")) {
        setWarning("Tabla vehiculos no existe todavia — ejecuta el SQL de configuracion.");
        setVehiculos([]);
        return;
      }
      throw fetchError;
    }
    const rows = Array.isArray(data) ? data : [];
    setVehiculos(rows);
    setSelectedIds((prev) => {
      if (Array.isArray(prev) && prev.length > 0) {
        const valid = prev.filter((id) => rows.some((v) => v.id === id));
        if (valid.length > 0) return valid;
      }
      return rows.map((v) => v.id);
    });
  }, []);

  const cargarTecnicos = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("usuarios")
      .select("nombre,rol,activo")
      .eq("rol", "Tecnico")
      .order("nombre", { ascending: true });
    if (fetchError) { setTecnicos([]); return; }
    const nombres = (Array.isArray(data) ? data : [])
      .filter((u) => u.activo !== false)
      .map((u) => toText(u.nombre))
      .filter(Boolean);
    setTecnicos(nombres);
  }, []);

  const cargarUbicacionActual = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("vehiculo_ubicacion_actual")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (fetchError) {
      if (tableMissing(fetchError, "vehiculo_ubicacion_actual")) {
        setWarning("Tabla vehiculo_ubicacion_actual no existe todavia — ejecuta el SQL de configuracion.");
        setCurrentRows([]);
        return;
      }
      throw fetchError;
    }
    setCurrentRows(Array.isArray(data) ? data : []);
  }, []);

  const cargarOrdenesHoy = useCallback(async () => {
    const hoy = todayLocalDateStr();
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const mananaStr = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, "0")}-${String(manana.getDate()).padStart(2, "0")}`;
    const { data, error: fetchError } = await supabase
      .from("ordenes")
      .select("id,codigo,nombre,direccion,tecnico,estado,tipo_actuacion,ubicacion,fecha_actuacion")
      .gte("fecha_actuacion", hoy)
      .lt("fecha_actuacion", mananaStr)
      .limit(2000);
    if (fetchError) {
      if (tableMissing(fetchError, "ordenes")) { setOrdenesHoy([]); return; }
      // No bloquear el resto del panel si esto falla — es informativo, no critico.
      setOrdenesHoy([]);
      return;
    }
    const rows = (Array.isArray(data) ? data : [])
      .map((row) => ({ ...row, coords: parseUbicacion(row.ubicacion) }))
      .filter((row) => row.coords);
    setOrdenesHoy(rows);
  }, []);

  const abrirEdicion = useCallback((v) => {
    setEditError("");
    setEditVehiculo(v);
    setEditFotoFile(null);
    setEditFotoPreview("");
    setEditForm({
      placa: toText(v?.placa),
      alias: toText(v?.alias),
      marca: toText(v?.marca),
      modelo: toText(v?.modelo),
      color: toText(v?.color),
      tecnicoAsignado: toText(v?.tecnico_asignado),
      activo: v?.activo !== false,
      fotoUrl: toText(v?.foto_url)
    });
  }, []);

  const cerrarEdicion = useCallback(() => {
    setEditVehiculo(null);
    setEditError("");
    setEditFotoFile(null);
    setEditFotoPreview("");
  }, []);

  const onElegirFotoEdicion = useCallback((file) => {
    if (!file) return;
    setEditFotoFile(file);
    setEditFotoPreview(URL.createObjectURL(file));
  }, []);

  const guardarEdicion = useCallback(async () => {
    if (!editVehiculo?.id) return;
    const placaLimpia = toText(editForm.placa).toUpperCase();
    if (!placaLimpia) { setEditError("La placa es obligatoria."); return; }
    setSavingEdit(true);
    setEditError("");
    try {
      let fotoUrl = editForm.fotoUrl || null;
      if (editFotoFile) {
        const path = `vehiculos/${placaLimpia}/${Date.now()}.jpg`;
        const { error: upError } = await supabase.storage
          .from("liquidaciones")
          .upload(path, editFotoFile, { contentType: editFotoFile.type || "image/jpeg", upsert: true });
        if (upError) throw upError;
        const { data: urlData } = supabase.storage.from("liquidaciones").getPublicUrl(path);
        fotoUrl = String(urlData?.publicUrl || fotoUrl || "");
      }

      const { error: updError } = await supabase
        .from("vehiculos")
        .update({
          placa: placaLimpia,
          alias: toText(editForm.alias) || null,
          marca: toText(editForm.marca) || null,
          modelo: toText(editForm.modelo) || null,
          color: toText(editForm.color) || null,
          tecnico_asignado: toText(editForm.tecnicoAsignado) || null,
          activo: !!editForm.activo,
          foto_url: fotoUrl || null
        })
        .eq("id", editVehiculo.id);
      if (updError) throw updError;
      setEditVehiculo(null);
      setEditFotoFile(null);
      setEditFotoPreview("");
      await cargarVehiculos();
    } catch (e) {
      setEditError(String(e?.message || "No se pudo guardar el vehiculo."));
    } finally {
      setSavingEdit(false);
    }
  }, [editVehiculo, editForm, editFotoFile, cargarVehiculos]);

  const eliminarVehiculo = useCallback(async (v) => {
    if (!v?.id) return;
    const ok = window.confirm(
      `¿Eliminar el vehiculo ${v.placa || ""}${v.alias ? " (" + v.alias + ")" : ""}? Esto borra tambien su historial de ubicaciones.`
    );
    if (!ok) return;
    setDeletingId(v.id);
    try {
      await supabase.from("vehiculo_ubicaciones").delete().eq("vehiculo_id", v.id);
      await supabase.from("vehiculo_ubicacion_actual").delete().eq("vehiculo_id", v.id);
      const { error: delError } = await supabase.from("vehiculos").delete().eq("id", v.id);
      if (delError) throw delError;
      if (selectedId === v.id) setSelectedId(null);
      await cargarVehiculos();
      await cargarUbicacionActual();
    } catch (e) {
      setError(String(e?.message || "No se pudo eliminar el vehiculo."));
    } finally {
      setDeletingId(null);
    }
  }, [selectedId, cargarVehiculos, cargarUbicacionActual]);

  const cargarTrayectorias = useCallback(async () => {
    if (!showTrail || selectedIds.length === 0) {
      setTrailByVehiculo({});
      return;
    }
    const desde = new Date(Date.now() - TRAIL_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const res = await supabase
      .from("vehiculo_ubicaciones")
      .select("vehiculo_id,lat,lng,created_at")
      .in("vehiculo_id", selectedIds)
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(30000);
    if (res.error) {
      if (tableMissing(res.error, "vehiculo_ubicaciones")) {
        setTrailByVehiculo({});
        return;
      }
      throw res.error;
    }
    const grouped = {};
    (Array.isArray(res.data) ? res.data : []).forEach((row) => {
      const id = row?.vehiculo_id;
      const lat = Number(row?.lat);
      const lng = Number(row?.lng);
      if (!id || !isValidCoord(lat, lng)) return;
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push({ lat, lng, created_at: row?.created_at || null });
    });
    Object.keys(grouped).forEach((id) => {
      if (grouped[id].length > TRAIL_MAX_POINTS) grouped[id] = grouped[id].slice(grouped[id].length - TRAIL_MAX_POINTS);
    });
    setTrailByVehiculo(grouped);
  }, [showTrail, selectedIds]);

  const calcularAnalitica = useCallback(async () => {
    if (!analyticsDate || selectedIds.length === 0) {
      setAnalyticsByVehiculo({});
      return;
    }
    setLoadingAnalytics(true);
    setAnalyticsError("");
    try {
      const desde = new Date(`${analyticsDate}T${analyticsHoraDesde || "00:00"}:00`).toISOString();
      const hasta = new Date(`${analyticsDate}T${analyticsHoraHasta || "23:59"}:59.999`).toISOString();
      const res = await supabase
        .from("vehiculo_ubicaciones")
        .select("vehiculo_id,lat,lng,speed_mps,activity_type,created_at")
        .in("vehiculo_id", selectedIds)
        .gte("created_at", desde)
        .lte("created_at", hasta)
        .order("created_at", { ascending: true })
        .limit(30000);
      if (res.error) {
        if (tableMissing(res.error, "vehiculo_ubicaciones")) { setAnalyticsByVehiculo({}); return; }
        throw res.error;
      }

      const porVehiculo = {};
      (Array.isArray(res.data) ? res.data : []).forEach((row) => {
        const id = row?.vehiculo_id;
        if (!id) return;
        if (!porVehiculo[id]) porVehiculo[id] = [];
        porVehiculo[id].push(row);
      });

      const resultado = {};
      Object.entries(porVehiculo).forEach(([id, rows]) => {
        let distanciaKm = 0;
        let maxSpeedKmh = 0;
        let sumaSpeed = 0;
        let countSpeed = 0;
        let frenadasBruscas = 0;
        let prev = null;
        const activityMinutes = {};

        rows.forEach((row) => {
          const lat = Number(row.lat);
          const lng = Number(row.lng);
          const speedMps = Number(row.speed_mps);
          const speedKmh = Number.isFinite(speedMps) && speedMps >= 0 ? speedMps * 3.6 : null;
          const t = new Date(row.created_at).getTime();

          if (isValidCoord(lat, lng) && prev && isValidCoord(prev.lat, prev.lng)) {
            distanciaKm += haversineKm(prev, { lat, lng });
          }
          if (speedKmh != null) {
            maxSpeedKmh = Math.max(maxSpeedKmh, speedKmh);
            sumaSpeed += speedKmh;
            countSpeed += 1;
          }
          if (prev && prev.speedKmh != null && speedKmh != null && Number.isFinite(prev.t)) {
            const dtSec = (t - prev.t) / 1000;
            const dropKmh = prev.speedKmh - speedKmh;
            if (dtSec > 0 && dtSec <= HARSH_BRAKE_MAX_SECONDS && dropKmh >= HARSH_BRAKE_KMH_DROP) {
              frenadasBruscas += 1;
            }
          }
          if (prev && Number.isFinite(prev.t)) {
            const minutos = Math.max(0, (t - prev.t) / 60000);
            const key = row.activity_type || "desconocido";
            activityMinutes[key] = (activityMinutes[key] || 0) + minutos;
          }

          prev = { lat, lng, speedKmh, t };
        });

        resultado[id] = {
          distanciaKm,
          maxSpeedKmh,
          avgSpeedKmh: countSpeed > 0 ? sumaSpeed / countSpeed : 0,
          frenadasBruscas,
          puntos: rows.length,
          activityMinutes
        };
      });
      setAnalyticsByVehiculo(resultado);
      setSnappedPathByVehiculo({});

      // Ajuste real a calles — solo para este recorrido puntual ya calculado,
      // nunca para el mapa en vivo. Se hace despues de mostrar las
      // estadisticas para no demorar el resto del panel.
      setLoadingSnap(true);
      const snappedEntries = await Promise.all(
        Object.entries(porVehiculo).map(async ([id, rows]) => {
          const puntos = rows
            .map((r) => ({ lat: Number(r.lat), lng: Number(r.lng) }))
            .filter((p) => isValidCoord(p.lat, p.lng));
          const snapped = await snapToRoadsBatched(puntos);
          return [id, snapped];
        })
      );
      setSnappedPathByVehiculo(Object.fromEntries(snappedEntries));
      setLoadingSnap(false);
    } catch (e) {
      setAnalyticsError(String(e?.message || "No se pudo calcular el recorrido."));
    } finally {
      setLoadingAnalytics(false);
    }
  }, [analyticsDate, analyticsHoraDesde, analyticsHoraHasta, selectedIds]);

  // Reproductor de recorrido: carga los puntos crudos (con hora exacta) de UN
  // vehiculo en el rango elegido, para animar un marcador siguiendo la ruta
  // real como un GPS tracker profesional (Traccar/Wialon), en vez de solo ver
  // la linea estatica.
  const cargarPlayback = useCallback(async (vehiculoIdParam) => {
    // Recibe el id explicito en vez de leer playbackVehiculoId del estado —
    // si se llama justo despues de un setPlaybackVehiculoId() en el mismo
    // evento de clic, el estado todavia no se habria actualizado (closure
    // viejo) y se cargaria el vehiculo anterior en vez del recien elegido.
    const vehiculoId = vehiculoIdParam ?? playbackVehiculoId;
    if (!vehiculoId) { setPlaybackError("Elige un vehiculo para reproducir."); return; }
    setLoadingPlayback(true);
    setPlaybackError("");
    setPlaybackPlaying(false);
    setPlaybackElapsedMs(0);
    try {
      const desde = new Date(`${analyticsDate}T${analyticsHoraDesde || "00:00"}:00`).toISOString();
      const hasta = new Date(`${analyticsDate}T${analyticsHoraHasta || "23:59"}:59.999`).toISOString();
      const res = await supabase
        .from("vehiculo_ubicaciones")
        .select("lat,lng,speed_mps,created_at")
        .eq("vehiculo_id", vehiculoId)
        .gte("created_at", desde)
        .lte("created_at", hasta)
        .order("created_at", { ascending: true })
        .limit(20000);
      if (res.error) throw res.error;
      const pts = (Array.isArray(res.data) ? res.data : [])
        .map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), speedMps: Number(r.speed_mps), t: new Date(r.created_at).getTime() }))
        .filter((p) => isValidCoord(p.lat, p.lng) && Number.isFinite(p.t));
      if (pts.length === 0) {
        setPlaybackError("No hay puntos guardados para ese vehiculo en ese rango.");
      }
      setPlaybackPoints(pts);
    } catch (e) {
      setPlaybackError(String(e?.message || "No se pudo cargar el recorrido para reproducir."));
      setPlaybackPoints([]);
    } finally {
      setLoadingPlayback(false);
    }
  }, [playbackVehiculoId, analyticsDate, analyticsHoraDesde, analyticsHoraHasta]);

  const playbackDurationMs = useMemo(() => {
    if (playbackPoints.length < 2) return 0;
    return playbackPoints[playbackPoints.length - 1].t - playbackPoints[0].t;
  }, [playbackPoints]);

  // Posicion interpolada entre los dos puntos que rodean el instante actual
  // de reproduccion, para que el marcador se mueva suave en vez de saltar.
  const playbackCurrent = useMemo(() => {
    if (playbackPoints.length === 0) return null;
    const targetT = playbackPoints[0].t + playbackElapsedMs;
    if (playbackPoints.length === 1) return { ...playbackPoints[0], idx: 0 };
    let i = 0;
    while (i < playbackPoints.length - 1 && playbackPoints[i + 1].t <= targetT) i++;
    const a = playbackPoints[i];
    const b = playbackPoints[Math.min(i + 1, playbackPoints.length - 1)];
    const span = b.t - a.t;
    const frac = span > 0 ? Math.min(1, Math.max(0, (targetT - a.t) / span)) : 0;
    return {
      lat: a.lat + (b.lat - a.lat) * frac,
      lng: a.lng + (b.lng - a.lng) * frac,
      speedMps: a.speedMps,
      t: targetT,
      idx: i
    };
  }, [playbackPoints, playbackElapsedMs]);

  // requestAnimationFrame en vez de setInterval — el marcador se mueve a la
  // frecuencia real de refresco de pantalla (60fps) en vez de saltar cada
  // 200ms, igual de fluido que un reproductor de video real.
  useEffect(() => {
    if (!playbackPlaying) return undefined;
    let lastTs = null;
    const step = (ts) => {
      if (lastTs == null) lastTs = ts;
      const deltaMs = ts - lastTs;
      lastTs = ts;
      setPlaybackElapsedMs((prev) => {
        const next = prev + deltaMs * playbackSpeed;
        if (next >= playbackDurationMs) {
          setPlaybackPlaying(false);
          return playbackDurationMs;
        }
        return next;
      });
      playbackTickRef.current = requestAnimationFrame(step);
    };
    playbackTickRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(playbackTickRef.current);
  }, [playbackPlaying, playbackSpeed, playbackDurationMs]);

  const cargarTodo = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured) { setError("Supabase no esta configurado."); setLoading(false); return; }
    if (!silent) setError("");
    try {
      await Promise.all([cargarVehiculos(), cargarUbicacionActual(), cargarOrdenesHoy(), cargarTecnicos()]);
      setLastSyncAt(new Date());
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar seguimiento de vehiculos."));
    } finally {
      setLoading(false);
    }
  }, [cargarVehiculos, cargarUbicacionActual, cargarOrdenesHoy, cargarTecnicos]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([cargarUbicacionActual(), cargarTrayectorias(), cargarOrdenesHoy()]);
      setLastSyncAt(new Date());
    } catch (e) {
      setError(String(e?.message || "No se pudo actualizar."));
    } finally {
      setRefreshing(false);
    }
  }, [cargarUbicacionActual, cargarTrayectorias, cargarOrdenesHoy]);

  useEffect(() => { void cargarTodo(); }, [cargarTodo]);

  // Auto-refresh — un vehiculo envia ping cada 10-15s, asi que el mapa se mantiene fluido.
  useEffect(() => {
    const interval = setInterval(() => { void onRefresh(); }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [onRefresh]);

  useEffect(() => { void cargarTrayectorias(); }, [cargarTrayectorias]);
  useEffect(() => { void calcularAnalitica(); }, [calcularAnalitica]);

  const ubicacionesVisibles = useMemo(() => {
    const base = (Array.isArray(currentRows) ? currentRows : []).filter((row) => isValidCoord(Number(row?.lat), Number(row?.lng)));
    const selected = new Set(selectedIds);
    if (selected.size === 0) return base;
    return base.filter((row) => selected.has(row?.vehiculo_id));
  }, [currentRows, selectedIds]);

  const rowsList = useMemo(() => {
    return [...ubicacionesVisibles]
      .map((row) => {
        const veh = vehiculoById[row?.vehiculo_id];
        const staleMin = Math.floor((Date.now() - new Date(row?.updated_at || Date.now()).getTime()) / 60000);
        const speedMps = Number(row?.speed_mps);
        const speedKmh = Number.isFinite(speedMps) && speedMps >= 0 ? speedMps * 3.6 : null;

        // ETA estimado a la orden pendiente mas cercana del tecnico asignado a
        // este vehiculo — no usa ninguna API paga, solo distancia en linea
        // recta y una velocidad promedio urbana asumida.
        let etaInfo = null;
        const tecnicoAsignado = toText(veh?.tecnico_asignado);
        if (tecnicoAsignado && isValidCoord(Number(row?.lat), Number(row?.lng))) {
          const candidatas = ordenesHoy.filter(
            (o) => toText(o.tecnico) === tecnicoAsignado && o.estado === "Pendiente" && o.coords
          );
          if (candidatas.length > 0) {
            const posicionActual = { lat: Number(row.lat), lng: Number(row.lng) };
            let mejor = null;
            candidatas.forEach((o) => {
              const distKm = haversineKm(posicionActual, o.coords);
              if (!mejor || distKm < mejor.distKm) mejor = { orden: o, distKm };
            });
            if (mejor) {
              const etaMin = Math.max(1, Math.round((mejor.distKm / ASSUMED_AVG_SPEED_KMH) * 60));
              etaInfo = { codigo: mejor.orden.codigo, distKm: mejor.distKm, etaMin };
            }
          }
        }

        return {
          ...row,
          placaLabel: toText(row?.placa) || veh?.placa || "-",
          alias: veh?.alias || "",
          fotoUrl: veh?.foto_url || "",
          speedKmh,
          staleMin,
          etaInfo
        };
      })
      .sort((a, b) => new Date(b?.updated_at || 0).getTime() - new Date(a?.updated_at || 0).getTime());
  }, [ubicacionesVisibles, vehiculoById, ordenesHoy]);

  // Ordenes donde el vehiculo del tecnico asignado esta detenido justo al
  // lado — se marcan como "en sitio" para encender el halo pulsante.
  const arrivedOrderIds = useMemo(() => {
    const ids = new Set();
    ordenesHoy.forEach((orden) => {
      if (orden.estado !== "Pendiente" || !orden.coords) return;
      const tecnico = toText(orden.tecnico);
      if (!tecnico) return;
      const veh = rowsList.find((row) => toText(vehiculoById[row.vehiculo_id]?.tecnico_asignado) === tecnico);
      if (!veh || !isValidCoord(Number(veh.lat), Number(veh.lng))) return;
      if (veh.speedKmh != null && veh.speedKmh > ARRIVAL_STOPPED_KMH) return;
      const distKm = haversineKm({ lat: Number(veh.lat), lng: Number(veh.lng) }, orden.coords);
      if (distKm <= ARRIVAL_KM) ids.add(orden.id);
    });
    return ids;
  }, [ordenesHoy, rowsList, vehiculoById]);

  const trailPolylines = useMemo(() => {
    if (!showTrail) return [];
    const visibles = new Set(ubicacionesVisibles.map((row) => row?.vehiculo_id).filter(Boolean));
    return Object.entries(trailByVehiculo || {})
      .filter(([id, pts]) => visibles.has(Number(id)) && Array.isArray(pts) && pts.length > 1)
      .map(([id, pts]) => ({
        id,
        color: colorForVehiculoId(id),
        points: suavizarPuntos(pts.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })))
      }));
  }, [showTrail, trailByVehiculo, ubicacionesVisibles]);

  const kpi = useMemo(() => {
    const total = rowsList.length;
    const activos = rowsList.filter((row) => Number(row?.staleMin || 0) <= STALE_MIN_THRESHOLD).length;
    return { total, activos, retrasados: total - activos };
  }, [rowsList]);

  const clearOrderOverlays = useCallback(() => {
    orderMarkersRef.current.forEach((m) => { try { m.setMap(null); } catch { /* noop */ } });
    orderMarkersRef.current = [];
    arrivedPulsesRef.current = [];
  }, []);

  const clearSnapOverlays = useCallback(() => {
    snapPolylinesRef.current.forEach((l) => { try { l.setMap(null); } catch { /* noop */ } });
    snapPolylinesRef.current = [];
  }, []);

  // Google Maps no tiene zoom animado nativo (setZoom es instantaneo) — se
  // simula suave escalonando el zoom en pasos cortos, como el "salto" de
  // camara al seleccionar un viaje en Uber/InDrive.
  const zoomSuaveRef = useRef(null);
  const zoomSuaveHacia = useCallback((map, targetZoom, targetPos) => {
    if (!map) return;
    if (zoomSuaveRef.current) clearInterval(zoomSuaveRef.current);
    map.panTo(targetPos);
    const startZoom = map.getZoom() ?? targetZoom;
    const steps = 10;
    const stepMs = 40;
    let i = 0;
    zoomSuaveRef.current = setInterval(() => {
      i += 1;
      const z = startZoom + (targetZoom - startZoom) * (i / steps);
      map.setZoom(Math.round(z));
      if (i >= steps) {
        clearInterval(zoomSuaveRef.current);
        zoomSuaveRef.current = null;
      }
    }, stepMs);
  }, []);

  const fitMap = useCallback(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const coords = rowsList.map((row) => ({ lat: Number(row?.lat), lng: Number(row?.lng) })).filter((p) => isValidCoord(p.lat, p.lng));
    if (coords.length === 0) return;
    if (coords.length === 1) { mapRef.current.panTo(coords[0]); mapRef.current.setZoom(15); return; }
    const bounds = new mapsRef.current.LatLngBounds();
    coords.forEach((p) => bounds.extend(p));
    mapRef.current.fitBounds(bounds);
  }, [rowsList]);

  useEffect(() => {
    let cancelled = false;
    if (!mapCanvasRef.current) return undefined;
    setMapReady(false);
    setMapError("");
    loadGoogleMapsSdk()
      .then((maps) => {
        if (cancelled || !mapCanvasRef.current) return;
        mapsRef.current = maps;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapCanvasRef.current, {
            center: DEFAULT_CENTER, zoom: 13, streetViewControl: false, mapTypeControl: false, fullscreenControl: true, gestureHandling: "greedy",
          });
        }
        setMapReady(true);
      })
      .catch((e) => { if (!cancelled) { setMapReady(false); setMapError(String(e?.message || "No se pudo cargar Google Maps.")); } });
    return () => { cancelled = true; };
  }, []);

  // Si el usuario arrastra el mapa manualmente, se cancela el seguimiento
  // automatico — evita que la camara "pelee" con el gesto del usuario.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapsRef.current) return undefined;
    const listener = mapRef.current.addListener("dragstart", () => setFollowVehicle(false));
    return () => { mapsRef.current.event.removeListener(listener); };
  }, [mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    polylinesRef.current.forEach((l) => { try { l.setMap(null); } catch { /* noop */ } });
    polylinesRef.current = [];

    trailPolylines.forEach((trail) => {
      const line = new maps.Polyline({ map, path: trail.points, strokeColor: trail.color, strokeOpacity: 0.9, strokeWeight: 4 });
      polylinesRef.current.push(line);
    });

    if (!selectedId && rowsList.length > 0) setSelectedId(rowsList[0]?.vehiculo_id);
    if (rowsList.length > 0 && !autoFitDoneRef.current) { fitMap(); autoFitDoneRef.current = true; }

    return () => {
      polylinesRef.current.forEach((l) => { try { l.setMap(null); } catch { /* noop */ } });
      polylinesRef.current = [];
    };
  }, [rowsList, selectedId, trailPolylines, fitMap]);

  // Marcadores de vehiculo persistentes: en vez de destruir y recrear todo en
  // cada refresco (lo que hacia que el auto "saltara" de golpe cada 6s), se
  // actualiza la posicion del marcador ya existente con una transicion suave,
  // como hacen Uber/InDrive — sin pagar por ninguna API de rutas.
  const ANIM_MS = 1400;
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    const seen = new Set();

    rowsList.forEach((row) => {
      const lat = Number(row?.lat);
      const lng = Number(row?.lng);
      if (!isValidCoord(lat, lng)) return;
      const id = row?.vehiculo_id;
      seen.add(id);

      const selected = id === selectedId;
      const staleMin = Number(row?.staleMin || 0);
      const isLive = staleMin <= STALE_MIN_THRESHOLD;
      const color = isLive ? colorForVehiculoId(id) : "#7A8699";
      const size = selected ? 54 : 44;
      const activityLabel = row.activity_type ? ACTIVITY_LABELS[row.activity_type] || row.activity_type : "";
      const title = [
        `${row.placaLabel}${row.alias ? " — " + row.alias : ""}`,
        row.speedKmh != null ? `${Math.round(row.speedKmh)} km/h` : null,
        row.battery_pct != null ? `Bateria ${row.battery_pct}%` : null,
        activityLabel || null,
        row.etaInfo ? `Orden ${row.etaInfo.codigo || "-"} en ~${row.etaInfo.etaMin} min` : null
      ]
        .filter(Boolean)
        .join(" · ");

      let entry = vehicleMarkersRef.current.get(id);

      // El rumbo solo se puede calcular con una posicion anterior — se
      // conserva el ultimo conocido si el vehiculo esta detenido (sin
      // movimiento suficiente para recalcularlo).
      let heading = entry?.heading ?? null;
      if (entry) {
        const movedM = haversineKm(entry.pos, { lat, lng }) * 1000;
        if (movedM > 2) heading = bearingDeg(entry.pos, { lat, lng });
      }

      const iconDataUrl = row.fotoUrl
        ? crearIconoVehiculoConRumbo(row.fotoUrl, color, heading, row.speedKmh, () => setIconVersion((v) => v + 1))
        : null;
      const icon = iconDataUrl
        ? { url: iconDataUrl, scaledSize: new maps.Size(size, size + 18), anchor: new maps.Point(size / 2, size / 2) }
        : {
            path: maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 0.95,
            strokeColor: "#ffffff",
            strokeWeight: selected ? 2.2 : 1.4,
            scale: selected ? 9 : 7.4
          };

      if (!entry) {
        const marker = new maps.Marker({ map, position: { lat, lng }, title, icon, zIndex: selected ? 999 : undefined });
        marker.addListener("click", () => setSelectedId(id));
        const pulse = new maps.Circle({
          map,
          center: { lat, lng },
          radius: 30,
          fillColor: color,
          fillOpacity: 0.25,
          strokeOpacity: 0,
          clickable: false,
          zIndex: 1
        });
        entry = { marker, pulse, pos: { lat, lng }, heading, animId: null };
        vehicleMarkersRef.current.set(id, entry);
      } else {
        entry.marker.setTitle(title);
        entry.marker.setIcon(icon);
        entry.marker.setZIndex(selected ? 999 : undefined);
        entry.pulse.setOptions({ fillColor: color });
        entry.heading = heading;

        const from = entry.pos;
        const to = { lat, lng };
        if (entry.animId) cancelAnimationFrame(entry.animId);
        if (followVehicle && selected) {
          try { map.panTo(to); } catch { /* noop */ }
        }
        const start = performance.now();
        const animate = (now) => {
          const t = Math.min(1, (now - start) / ANIM_MS);
          const k = easeInOutQuad(t);
          const curLat = from.lat + (to.lat - from.lat) * k;
          const curLng = from.lng + (to.lng - from.lng) * k;
          entry.marker.setPosition({ lat: curLat, lng: curLng });
          entry.pulse.setCenter({ lat: curLat, lng: curLng });
          if (t < 1) {
            entry.animId = requestAnimationFrame(animate);
          } else {
            entry.animId = null;
            entry.pos = to;
          }
        };
        entry.animId = requestAnimationFrame(animate);
      }
    });

    // Vehiculos que salieron de la lista (deseleccionados o sin ubicacion) —
    // remover sus marcadores.
    vehicleMarkersRef.current.forEach((entry, id) => {
      if (seen.has(id)) return;
      if (entry.animId) cancelAnimationFrame(entry.animId);
      try { entry.marker.setMap(null); } catch { /* noop */ }
      try { entry.pulse.setMap(null); } catch { /* noop */ }
      vehicleMarkersRef.current.delete(id);
    });
  }, [rowsList, selectedId, mapReady, iconVersion, followVehicle]);

  // Pulso "en vivo" continuo (radar) detras de los vehiculos con reporte
  // reciente — un solo loop de animacion compartido, no uno por vehiculo.
  useEffect(() => {
    if (!mapReady) return undefined;
    let cancelled = false;
    const PULSE_PERIOD_MS = 1800;
    const tick = (now) => {
      if (cancelled) return;
      const phase = (now % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
      vehicleMarkersRef.current.forEach((entry) => {
        const radius = 14 + phase * 26;
        const opacity = 0.28 * (1 - phase);
        try {
          entry.pulse.setRadius(radius);
          entry.pulse.setOptions({ fillOpacity: opacity });
        } catch { /* noop */ }
      });

      // Halo verde en las ordenes donde el tecnico ya llego — pulso mas lento
      // y suave, distinto al de los vehiculos en movimiento.
      const ARRIVAL_PULSE_PERIOD_MS = 2600;
      const arrivalPhase = (now % ARRIVAL_PULSE_PERIOD_MS) / ARRIVAL_PULSE_PERIOD_MS;
      arrivedPulsesRef.current.forEach((pulse) => {
        const radius = 16 + arrivalPhase * 34;
        const opacity = 0.32 * (1 - arrivalPhase);
        try {
          pulse.setRadius(radius);
          pulse.setOptions({ fillOpacity: opacity });
        } catch { /* noop */ }
      });

      pulseRafRef.current = requestAnimationFrame(tick);
    };
    pulseRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (pulseRafRef.current) cancelAnimationFrame(pulseRafRef.current);
    };
  }, [mapReady]);

  // Limpieza total solo al desmontar el componente (no en cada refresco).
  useEffect(() => {
    const registry = vehicleMarkersRef.current;
    return () => {
      registry.forEach((entry) => {
        if (entry.animId) cancelAnimationFrame(entry.animId);
        try { entry.marker.setMap(null); } catch { /* noop */ }
        try { entry.pulse.setMap(null); } catch { /* noop */ }
      });
      registry.clear();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return undefined;
    const map = mapRef.current;
    const maps = mapsRef.current;
    clearOrderOverlays();

    if (showOrdenes) {
      ordenesHoy.forEach((orden) => {
        const color = ESTADO_ORDEN_COLOR[orden.estado] || "#7C3AED";
        const size = 40;
        const marker = new maps.Marker({
          map,
          position: orden.coords,
          title: `${orden.codigo || "Orden"} · ${orden.tipo_actuacion || ""} · ${orden.nombre || ""} · ${orden.estado || ""}`,
          icon: {
            url: crearIconoOrden(orden.tipo_actuacion, orden.estado),
            scaledSize: new maps.Size(size, size),
            anchor: new maps.Point(size / 2, size / 2)
          },
          zIndex: 500
        });
        const info = new maps.InfoWindow({
          content: `<div style="font-size:12px;max-width:220px">
            <strong>${orden.codigo || "Orden"}</strong><br/>
            ${orden.tipo_actuacion || ""}<br/>
            ${orden.nombre || ""}<br/>
            ${orden.direccion || ""}<br/>
            Tecnico: ${orden.tecnico || "-"}<br/>
            <span style="color:${color};font-weight:700">${orden.estado || ""}</span>
          </div>`
        });
        marker.addListener("click", () => info.open({ map, anchor: marker }));
        orderMarkersRef.current.push(marker);

        if (arrivedOrderIds.has(orden.id)) {
          const pulse = new maps.Circle({
            map,
            center: orden.coords,
            radius: 16,
            fillColor: "#16A34A",
            fillOpacity: 0.3,
            strokeOpacity: 0,
            clickable: false,
            zIndex: 400
          });
          orderMarkersRef.current.push(pulse);
          arrivedPulsesRef.current.push(pulse);
        }
      });
    }

    return () => clearOrderOverlays();
  }, [ordenesHoy, showOrdenes, clearOrderOverlays, mapReady, arrivedOrderIds]);

  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return undefined;
    const map = mapRef.current;
    const maps = mapsRef.current;
    clearSnapOverlays();

    if (showTrail) {
      Object.entries(snappedPathByVehiculo).forEach(([id, points]) => {
        if (!Array.isArray(points) || points.length < 2) return;
        const line = new maps.Polyline({
          map,
          path: points,
          strokeColor: colorForVehiculoId(id),
          strokeOpacity: 0.95,
          strokeWeight: 5,
          zIndex: 200
        });
        snapPolylinesRef.current.push(line);
      });
    }

    return () => clearSnapOverlays();
  }, [snappedPathByVehiculo, showTrail, clearSnapOverlays]);

  // Inicializa el reproductor SOLO cuando cambia el vehiculo/recorrido — no en
  // cada tick de la animacion. Antes, todo (marcador, flecha, cada tramo de
  // linea) se destruia y recreaba 60 veces por segundo, lo cual era tan
  // pesado que el navegador no alcanzaba a dibujar a tiempo y el auto
  // parpadeaba o desaparecia.
  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return undefined;
    const map = mapRef.current;
    const maps = mapsRef.current;

    const clearPlayback = () => {
      try { playbackMarkerRef.current?.setMap(null); } catch { /* noop */ }
      (playbackLineDoneRef.current || []).forEach((l) => { try { l.setMap(null); } catch { /* noop */ } });
      try { playbackLineRestRef.current?.setMap(null); } catch { /* noop */ }
      try { playbackLineActiveRef.current?.setMap(null); } catch { /* noop */ }
      playbackMarkerRef.current = null;
      playbackLineDoneRef.current = [];
      playbackLineRestRef.current = null;
      playbackLineActiveRef.current = null;
      playbackSegmentIdxRef.current = 0;
      playbackHeadingBucketRef.current = null;
      playbackSpeedBucketRef.current = null;
      playbackLastBearingRef.current = null;
    };
    clearPlayback();

    if (playbackPoints.length > 1) {
      const full = playbackPoints.map((p) => ({ lat: p.lat, lng: p.lng }));
      playbackLineRestRef.current = new maps.Polyline({ map, path: full, strokeColor: "#94a3b8", strokeOpacity: 0.6, strokeWeight: 4 });
      playbackLineActiveRef.current = new maps.Polyline({ map, path: [full[0], full[0]], strokeColor: colorForSpeedKmh(0), strokeOpacity: 0.95, strokeWeight: 5 });

      const veh = vehiculoById[playbackVehiculoId];
      const primerSpeedKmh = Number.isFinite(playbackPoints[0]?.speedMps) ? playbackPoints[0].speedMps * 3.6 : null;
      const iconDataUrl = veh?.foto_url
        ? crearIconoVehiculoConRumbo(veh.foto_url, "#7C3AED", null, primerSpeedKmh, () => setIconVersion((v) => v + 1))
        : null;
      playbackMarkerRef.current = new maps.Marker({
        map,
        position: full[0],
        icon: iconDataUrl
          ? { url: iconDataUrl, scaledSize: new maps.Size(52, 70), anchor: new maps.Point(26, 26) }
          : { path: maps.SymbolPath.CIRCLE, fillColor: "#7C3AED", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2.5, scale: 9 },
        zIndex: 1000
      });
    }

    return () => clearPlayback();
  }, [playbackPoints, playbackVehiculoId, vehiculoById, iconVersion]);

  // Tick de la animacion: solo mueve/actualiza lo que ya existe (nunca crea
  // ni destruye Polylines/Markers), asi que puede correr a 60fps sin
  // problema. Un nuevo tramo "recorrido" solo se agrega cuando de verdad se
  // paso a un punto nuevo, no en cada micro-interpolacion.
  useEffect(() => {
    if (!playbackMarkerRef.current || !playbackCurrent || playbackPoints.length < 2) return;
    const maps = mapsRef.current;
    const pos = { lat: playbackCurrent.lat, lng: playbackCurrent.lng };
    const idx = playbackCurrent.idx ?? 0;

    playbackMarkerRef.current.setPosition(pos);

    const anterior = playbackPoints[idx];
    const siguiente = playbackPoints[Math.min(idx + 1, playbackPoints.length - 1)];
    if (haversineKm(anterior, siguiente) * 1000 > 1) {
      playbackLastBearingRef.current = bearingDeg(anterior, siguiente);
    }
    const rumboActual = playbackLastBearingRef.current;
    const headingBucket = roundHeadingBucket(rumboActual);
    const speedKmhActual = Number.isFinite(playbackCurrent.speedMps) && playbackCurrent.speedMps >= 0 ? playbackCurrent.speedMps * 3.6 : null;
    const speedBucket = roundSpeedBucket(speedKmhActual);
    if (headingBucket !== playbackHeadingBucketRef.current || speedBucket !== playbackSpeedBucketRef.current) {
      playbackHeadingBucketRef.current = headingBucket;
      playbackSpeedBucketRef.current = speedBucket;
      const veh = vehiculoById[playbackVehiculoId];
      if (veh?.foto_url) {
        const iconDataUrl = crearIconoVehiculoConRumbo(veh.foto_url, "#7C3AED", rumboActual, speedKmhActual, () => setIconVersion((v) => v + 1));
        if (iconDataUrl) {
          playbackMarkerRef.current.setIcon({ url: iconDataUrl, scaledSize: new maps.Size(52, 70), anchor: new maps.Point(26, 26) });
        }
      }
    }

    // Si se rebobino con la barra de tiempo, quitar los tramos "recorridos"
    // que quedaron por delante de la nueva posicion.
    while (playbackSegmentIdxRef.current > idx) {
      const line = playbackLineDoneRef.current.pop();
      try { line?.setMap(null); } catch { /* noop */ }
      playbackSegmentIdxRef.current -= 1;
    }

    // Agregar tramos "recorridos" nuevos que se hayan pasado desde el ultimo tick.
    while (playbackSegmentIdxRef.current < idx) {
      const i = playbackSegmentIdxRef.current;
      const a = playbackPoints[i];
      const b = playbackPoints[i + 1];
      const kmh = Number.isFinite(a.speedMps) && a.speedMps >= 0 ? a.speedMps * 3.6 : 0;
      const line = new maps.Polyline({
        map: mapRef.current,
        path: [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }],
        strokeColor: colorForSpeedKmh(kmh),
        strokeOpacity: 0.95,
        strokeWeight: 5
      });
      playbackLineDoneRef.current.push(line);
      playbackSegmentIdxRef.current += 1;
    }

    // Tramo activo: del ultimo punto ya confirmado a la posicion interpolada actual.
    const base = playbackPoints[idx];
    const kmhActivo = Number.isFinite(base.speedMps) && base.speedMps >= 0 ? base.speedMps * 3.6 : 0;
    playbackLineActiveRef.current?.setPath([{ lat: base.lat, lng: base.lng }, pos]);
    playbackLineActiveRef.current?.setOptions({ strokeColor: colorForSpeedKmh(kmhActivo) });

    // Lo restante (aun no recorrido), desde la posicion actual en adelante.
    const restante = [pos, ...playbackPoints.slice(idx + 1).map((p) => ({ lat: p.lat, lng: p.lng }))];
    playbackLineRestRef.current?.setPath(restante);

    if (playbackPlaying) mapRef.current?.panTo(pos);
  }, [playbackCurrent, playbackPlaying, playbackPoints, playbackVehiculoId, vehiculoById]);

  const toggleVehiculo = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (!isSupabaseConfigured) {
    return (
      <section className="panel">
        <h2>Seguimiento vehiculos</h2>
        <p className="warn-text">Supabase no esta configurado.</p>
      </section>
    );
  }

  return (
    <section className="panel maptech-panel">
      <div className="panel-toolbar">
        <h2>Seguimiento vehiculos</h2>
        <button type="button" className="secondary-btn small" onClick={() => void onRefresh()} disabled={refreshing || loading}>
          {refreshing || loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <p className="panel-meta">Ultima sincronizacion: {formatDateTime(lastSyncAt)} · Auto-actualiza cada {AUTO_REFRESH_MS / 1000}s</p>

      {error ? <p className="warn-text">{error}</p> : null}
      {warning ? <p className="warn-text">{warning}</p> : null}
      {mapError ? <p className="warn-text">{mapError}</p> : null}

      <div className="orders-kpi-grid">
        <article className="orders-kpi-card">
          <span>Vehiculos visibles</span>
          <strong>{kpi.total}</strong>
        </article>
        <article className="orders-kpi-card">
          <span>Actualizados (&lt;={STALE_MIN_THRESHOLD}m)</span>
          <strong>{kpi.activos}</strong>
        </article>
        <article className="orders-kpi-card">
          <span>Desactualizados</span>
          <strong>{kpi.retrasados}</strong>
        </article>
        <article className="orders-kpi-card">
          <span>Total vehiculos</span>
          <strong>{vehiculos.length}</strong>
        </article>
        <article className="orders-kpi-card">
          <span>Ordenes hoy</span>
          <strong>{ordenesHoy.length}</strong>
        </article>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {vehiculos.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => toggleVehiculo(v.id)}
            style={{
              padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${selectedIds.includes(v.id) ? colorForVehiculoId(v.id) : "#e2e8f0"}`,
              background: selectedIds.includes(v.id) ? colorForVehiculoId(v.id) + "1a" : "#fff",
              color: selectedIds.includes(v.id) ? colorForVehiculoId(v.id) : "#64748b",
            }}
          >
            {v.placa}{v.alias ? ` · ${v.alias}` : ""}
          </button>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", marginLeft: 8 }}>
          <input type="checkbox" checked={showTrail} onChange={(e) => setShowTrail(e.target.checked)} />
          Mostrar recorrido ({TRAIL_WINDOW_HOURS}h)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
          <input type="checkbox" checked={showOrdenes} onChange={(e) => setShowOrdenes(e.target.checked)} />
          Mostrar ordenes del dia ({ordenesHoy.length})
        </label>
        <label
          style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: selectedId ? "pointer" : "not-allowed",
            color: followVehicle ? "#7C3AED" : "#64748b", opacity: selectedId ? 1 : 0.5
          }}
        >
          <input
            type="checkbox"
            checked={followVehicle}
            disabled={!selectedId}
            onChange={(e) => {
              setFollowVehicle(e.target.checked);
              const row = rowsList.find((r) => r.vehiculo_id === selectedId);
              if (e.target.checked && row && isValidCoord(Number(row.lat), Number(row.lng))) {
                zoomSuaveHacia(mapRef.current, 17, { lat: Number(row.lat), lng: Number(row.lng) });
              }
            }}
          />
          🎯 Seguir vehiculo (camara automatica)
        </label>
      </div>

      <div
        style={{
          position: "relative", width: "100%", height: 480, borderRadius: 16, overflow: "hidden",
          border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,0.08)"
        }}
      >
        <div ref={mapCanvasRef} style={{ width: "100%", height: "100%" }} />
        {!mapReady && !mapError && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#64748b", fontSize: 13 }}>
            Cargando mapa...
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 20, padding: 16, borderRadius: 14, border: "1px solid #e2e8f0",
          background: "linear-gradient(135deg,#f8fafc,#f1f5f9)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: "#1e293b" }}>📊 Detalle de recorrido</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="date"
              value={analyticsDate}
              onChange={(e) => setAnalyticsDate(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
            />
            <input
              type="time"
              value={analyticsHoraDesde}
              onChange={(e) => setAnalyticsHoraDesde(e.target.value)}
              title="Desde"
              style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, width: 90 }}
            />
            <span style={{ color: "#94a3b8", fontSize: 12 }}>a</span>
            <input
              type="time"
              value={analyticsHoraHasta}
              onChange={(e) => setAnalyticsHoraHasta(e.target.value)}
              title="Hasta"
              style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, width: 90 }}
            />
            <button type="button" className="secondary-btn small" onClick={() => void calcularAnalitica()} disabled={loadingAnalytics}>
              {loadingAnalytics ? "Calculando..." : "Calcular"}
            </button>
          </div>
        </div>

        {analyticsError ? <p className="warn-text">{analyticsError}</p> : null}

        {loadingSnap ? (
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>🛣️ Ajustando el recorrido a las calles reales...</p>
        ) : Object.keys(snappedPathByVehiculo).length > 0 ? (
          <p style={{ fontSize: 12, color: "#16a34a", marginTop: 8 }}>✓ Recorrido ajustado a calles dibujado en el mapa (linea gruesa).</p>
        ) : null}

        {selectedIds.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 10 }}>Selecciona al menos un vehiculo arriba para ver su recorrido.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {selectedIds.map((id) => {
              const veh = vehiculoById[id];
              const a = analyticsByVehiculo[id];
              const actividadTop = a?.activityMinutes
                ? Object.entries(a.activityMinutes).sort((x, y) => y[1] - x[1])[0]
                : null;
              return (
                <div
                  key={id}
                  style={{
                    display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                    padding: "10px 14px", borderRadius: 10, background: "#fff", border: "1px solid #e2e8f0"
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", minWidth: 120 }}>
                    {veh?.placa || "-"} {veh?.alias ? <span style={{ fontWeight: 500, color: "#64748b" }}>· {veh.alias}</span> : null}
                  </div>
                  {!a ? (
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>Sin datos para esta fecha.</span>
                  ) : (
                    <>
                      <div style={s.statBlock}>
                        <span style={s.statLabel}>Recorrido</span>
                        <strong style={s.statValue}>{a.distanciaKm.toFixed(1)} km</strong>
                      </div>
                      <div style={s.statBlock}>
                        <span style={s.statLabel}>Vel. maxima</span>
                        <strong style={s.statValue}>{Math.round(a.maxSpeedKmh)} km/h</strong>
                      </div>
                      <div style={s.statBlock}>
                        <span style={s.statLabel}>Vel. promedio</span>
                        <strong style={s.statValue}>{Math.round(a.avgSpeedKmh)} km/h</strong>
                      </div>
                      <div style={s.statBlock}>
                        <span style={s.statLabel}>Frenadas bruscas</span>
                        <strong style={{ ...s.statValue, color: a.frenadasBruscas > 0 ? "#dc2626" : "#1e293b" }}>
                          {a.frenadasBruscas}
                        </strong>
                      </div>
                      {actividadTop ? (
                        <div style={s.statBlock}>
                          <span style={s.statLabel}>Actividad principal</span>
                          <strong style={s.statValue}>{ACTIVITY_LABELS[actividadTop[0]] || actividadTop[0]}</strong>
                        </div>
                      ) : null}
                    </>
                  )}
                  <button
                    type="button"
                    className="secondary-btn small"
                    style={{ marginLeft: "auto" }}
                    onClick={() => { setPlaybackVehiculoId(id); void cargarPlayback(id); }}
                  >
                    ▶️ Reproducir
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {playbackVehiculoId ? (
          <div
            style={{
              marginTop: 14, borderRadius: 14, overflow: "hidden", border: "1px solid #1e293b",
              background: "linear-gradient(160deg,#0f172a,#1e293b)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", flexWrap: "wrap", gap: 8 }}>
              <strong style={{ fontSize: 13, color: "#fff" }}>
                🎬 {vehiculoById[playbackVehiculoId]?.placa || "-"}
                {vehiculoById[playbackVehiculoId]?.alias ? ` · ${vehiculoById[playbackVehiculoId].alias}` : ""}
              </strong>
              <button
                type="button"
                onClick={() => { setPlaybackVehiculoId(null); setPlaybackPoints([]); setPlaybackPlaying(false); }}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#fff", padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
              >
                ✕ Cerrar
              </button>
            </div>

            {loadingPlayback ? <p style={{ fontSize: 12, color: "#cbd5e1", padding: "0 14px 12px" }}>Cargando recorrido...</p> : null}
            {playbackError ? <p style={{ fontSize: 12, color: "#fca5a5", padding: "0 14px 12px" }}>{playbackError}</p> : null}

            {playbackPoints.length > 1 && (
              <div style={{ padding: "0 14px 16px" }}>
                <div style={{ textAlign: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                    {playbackCurrent?.t ? new Date(playbackCurrent.t).toLocaleTimeString("es-PE") : "-"}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                    {playbackCurrent?.speedMps != null ? (
                      <span style={{ color: colorForSpeedKmh(playbackCurrent.speedMps * 3.6), fontWeight: 700 }}>
                        ● {Math.round(playbackCurrent.speedMps * 3.6)} km/h
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 56, textAlign: "right" }}>
                    {playbackPoints[0] ? new Date(playbackPoints[0].t).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={playbackDurationMs}
                    value={playbackElapsedMs}
                    onChange={(e) => { setPlaybackPlaying(false); setPlaybackElapsedMs(Number(e.target.value)); }}
                    style={{ flex: 1, accentColor: "#7C3AED" }}
                  />
                  <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 56 }}>
                    {playbackPoints[playbackPoints.length - 1]
                      ? new Date(playbackPoints[playbackPoints.length - 1].t).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
                      : ""}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => { setPlaybackPlaying(false); setPlaybackElapsedMs(0); }}
                    style={playerIconBtnStyle}
                    title="Ir al inicio"
                  >
                    ⏮
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaybackPlaying((p) => !p)}
                    style={{ ...playerIconBtnStyle, width: 46, height: 46, borderRadius: 23, background: "#7C3AED", fontSize: 18 }}
                    title={playbackPlaying ? "Pausar" : "Reproducir"}
                  >
                    {playbackPlaying ? "⏸" : "▶"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPlaybackPlaying(false); setPlaybackElapsedMs(playbackDurationMs); }}
                    style={playerIconBtnStyle}
                    title="Ir al final"
                  >
                    ⏭
                  </button>

                  <div style={{ display: "flex", gap: 4, marginLeft: 10 }}>
                    {[1, 5, 20, 60].map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => setPlaybackSpeed(sp)}
                        style={{
                          padding: "5px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          border: `1px solid ${playbackSpeed === sp ? "#7C3AED" : "rgba(255,255,255,0.15)"}`,
                          background: playbackSpeed === sp ? "#7C3AED" : "rgba(255,255,255,0.06)",
                          color: "#fff"
                        }}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "Detenido", color: "#94a3b8" },
                    { label: "Lento", color: "#16a34a" },
                    { label: "Moderado", color: "#eab308" },
                    { label: "Rapido", color: "#f97316" },
                    { label: "Muy rapido", color: "#dc2626" }
                  ].map((leg) => (
                    <span key={leg.label} style={{ fontSize: 10, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: leg.color, display: "inline-block" }} />
                      {leg.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        {rowsList.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13 }}>No hay vehiculos con ubicacion registrada todavia.</p>
        ) : (
          rowsList.map((row) => (
            <div
              key={row.vehiculo_id}
              onClick={() => {
                setSelectedId(row.vehiculo_id);
                if (isValidCoord(Number(row.lat), Number(row.lng))) {
                  zoomSuaveHacia(mapRef.current, 16, { lat: Number(row.lat), lng: Number(row.lng) });
                }
              }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${row.vehiculo_id === selectedId ? colorForVehiculoId(row.vehiculo_id) : "#e2e8f0"}`,
                background: row.vehiculo_id === selectedId ? colorForVehiculoId(row.vehiculo_id) + "0d" : "#fff",
              }}
            >
              {row.fotoUrl ? (
                <img src={row.fotoUrl} alt={row.placaLabel} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 8, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🚗</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{row.placaLabel} {row.alias ? <span style={{ fontWeight: 500, color: "#64748b" }}>· {row.alias}</span> : null}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Ultima actualizacion: hace {formatAgo(row.updated_at)}
                  {row.speedKmh != null ? ` · ${Math.round(row.speedKmh)} km/h` : ""}
                  {row.battery_pct != null ? ` · Bateria ${row.battery_pct}%` : ""}
                  {row.activity_type ? ` · ${ACTIVITY_LABELS[row.activity_type] || row.activity_type}` : ""}
                </div>
                {row.etaInfo ? (
                  <div style={{ fontSize: 12, color: "#7C3AED", fontWeight: 600, marginTop: 2 }}>
                    🎯 Orden {row.etaInfo.codigo || "-"} · llegando en ~{row.etaInfo.etaMin} min ({row.etaInfo.distKm.toFixed(1)} km)
                  </div>
                ) : null}
              </div>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: row.staleMin > STALE_MIN_THRESHOLD ? "#94a3b8" : "#16a34a", flexShrink: 0 }} />
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, color: "#1e293b", marginBottom: 8 }}>Vehiculos registrados</h3>
        {vehiculos.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13 }}>No hay vehiculos registrados todavia.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {vehiculos.map((v) => (
              <div
                key={v.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 10,
                  border: "1px solid #e2e8f0", background: v.activo === false ? "#f8fafc" : "#fff"
                }}
              >
                {v.foto_url ? (
                  <img src={v.foto_url} alt={v.placa} style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🚗</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>
                    {v.placa} {v.alias ? <span style={{ fontWeight: 500, color: "#64748b" }}>· {v.alias}</span> : null}
                    {v.activo === false ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#dc2626" }}>INACTIVO</span> : null}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    {[v.marca, v.modelo, v.color].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                    {v.tecnico_asignado ? ` · 👷 ${v.tecnico_asignado}` : ""}
                  </div>
                </div>
                <button type="button" className="secondary-btn small" onClick={() => abrirEdicion(v)}>
                  ✏️ Editar
                </button>
                <button
                  type="button"
                  className="secondary-btn small"
                  onClick={() => void eliminarVehiculo(v)}
                  disabled={deletingId === v.id}
                  style={{ color: "#dc2626", borderColor: "#fecaca" }}
                >
                  {deletingId === v.id ? "Eliminando..." : "🗑️ Eliminar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editVehiculo ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16
          }}
          onClick={cerrarEdicion}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 420 }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 14, color: "#1e293b" }}>Editar vehiculo</h3>

            {editError ? <p className="warn-text" style={{ marginTop: 0 }}>{editError}</p> : null}

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {editFotoPreview || editForm.fotoUrl ? (
                <img
                  src={editFotoPreview || editForm.fotoUrl}
                  alt="Foto vehiculo"
                  style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", border: "1px solid #e2e8f0" }}
                />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 12, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
                  🚗
                </div>
              )}
              <label className="secondary-btn small" style={{ cursor: "pointer" }}>
                📷 {editForm.fotoUrl || editFotoPreview ? "Cambiar foto" : "Subir foto"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => onElegirFotoEdicion(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Placa</label>
            <input
              type="text"
              value={editForm.placa}
              onChange={(e) => setEditForm((f) => ({ ...f, placa: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", marginTop: 4, marginBottom: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />

            <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Alias</label>
            <input
              type="text"
              value={editForm.alias}
              onChange={(e) => setEditForm((f) => ({ ...f, alias: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", marginTop: 4, marginBottom: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Marca</label>
                <input
                  type="text"
                  value={editForm.marca}
                  onChange={(e) => setEditForm((f) => ({ ...f, marca: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", marginTop: 4, marginBottom: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Modelo</label>
                <input
                  type="text"
                  value={editForm.modelo}
                  onChange={(e) => setEditForm((f) => ({ ...f, modelo: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", marginTop: 4, marginBottom: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
              </div>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Color</label>
            <input
              type="text"
              value={editForm.color}
              onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", marginTop: 4, marginBottom: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />

            <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Tecnico asignado</label>
            <select
              value={editForm.tecnicoAsignado}
              onChange={(e) => setEditForm((f) => ({ ...f, tecnicoAsignado: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", marginTop: 4, marginBottom: 10, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff" }}
            >
              <option value="">— Sin asignar —</option>
              {tecnicos.map((nombre) => (
                <option key={nombre} value={nombre}>{nombre}</option>
              ))}
              {editForm.tecnicoAsignado && !tecnicos.includes(editForm.tecnicoAsignado) ? (
                <option value={editForm.tecnicoAsignado}>{editForm.tecnicoAsignado} (no esta en la lista de tecnicos activos)</option>
              ) : null}
            </select>
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: -6, marginBottom: 10 }}>
              Se usa para relacionar este vehiculo con las ordenes de ese tecnico (ej. compartir ubicacion con el cliente).
            </p>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155", marginTop: 6, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={editForm.activo}
                onChange={(e) => setEditForm((f) => ({ ...f, activo: e.target.checked }))}
              />
              Vehiculo activo (desmarcar detiene el rastreo remotamente)
            </label>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="secondary-btn small" onClick={cerrarEdicion} disabled={savingEdit}>
                Cancelar
              </button>
              <button type="button" className="secondary-btn small" onClick={() => void guardarEdicion()} disabled={savingEdit}>
                {savingEdit ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
