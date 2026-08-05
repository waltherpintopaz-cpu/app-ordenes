import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
// Sprites reales (vista superior) en vez de dibujo vectorial — "Top Down Car
// Sprites" de UnLucky Studio, CC0 (ver public/vehiculo-iconos/CREDITS.txt).
// Vienen en color fijo de fabrica: no se re-tiñen por vehiculo/estado, para
// eso se usa el halo pulsante que ya existe debajo del marcador. La moto no
// viene en el pack, asi que sigue con el dibujo vectorial propio.
const VEHICLE_SPRITE_SRC = {
  sedan: "/vehiculo-iconos/sedan.png",
  pickup: "/vehiculo-iconos/pickup.png",
  furgon: "/vehiculo-iconos/furgon.png"
};
const vehicleSpriteImages = Object.fromEntries(
  Object.entries(VEHICLE_SPRITE_SRC).map(([key, src]) => {
    const img = new Image();
    img.src = src;
    return [key, img];
  })
);
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
// Colores de "pintura" realistas (neutros, como autos de verdad) para la
// carroceria del icono — el color de identidad (TRAIL_COLORS, mas
// saturado) se sigue usando para el halo/pulso debajo del auto y el
// recorrido, pero ya no para pintar la carroceria: un auto azul/rosa
// fuerte se ve como sticker en vez de un vehiculo real (asi lo hace
// InDrive: autos blancos/plateados, no de colores de marca).
const NEUTRAL_CAR_PAINT = ["#F8FAFC", "#E2E8F0", "#D6DEE8", "#EDE9E3", "#DCE7F5"];
const STALE_CAR_PAINT = "#94A3B8";
const paintForVehiculoId = (value) => {
  const id = toText(value);
  if (!id) return NEUTRAL_CAR_PAINT[0];
  let acc = 0;
  for (let i = 0; i < id.length; i += 1) acc = (acc + id.charCodeAt(i) * (i + 11)) % 997;
  return NEUTRAL_CAR_PAINT[acc % NEUTRAL_CAR_PAINT.length];
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

// El GPS varia unos metros en cualquier direccion aun con el vehiculo
// completamente quieto (ruido normal de senal) — sin filtrar esto, el
// recorrido se dibuja como una "telarana" en vez de un punto fijo. Se
// descartan puntos que no se alejaron lo suficiente del ultimo punto que
// si se conservo, igual que hacen los trackers GPS profesionales.
const JITTER_THRESHOLD_KM = 0.015; // ~15 metros
const filtrarJitterEstacionario = (points) => {
  if (!Array.isArray(points) || points.length === 0) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    if (haversineKm(last, points[i]) >= JITTER_THRESHOLD_KM) {
      out.push(points[i]);
    }
  }
  return out;
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

// El rumbo se redondea a intervalos de 15° para que el cache no tenga que
// regenerar la imagen en cada micro-cambio de direccion.
const HEADING_BUCKET_DEG = 15;
const roundHeadingBucket = (bearing) => {
  if (bearing == null || !Number.isFinite(bearing)) return null;
  return Math.round(bearing / HEADING_BUCKET_DEG) * HEADING_BUCKET_DEG % 360;
};
// Velocidad redondeada a intervalos de 5 km/h, para que el badge de
// kilometraje no obligue a regenerar el icono con cada micro-fluctuacion.
const SPEED_BADGE_BUCKET = 5;
const roundSpeedBucket = (kmh) => {
  if (kmh == null || !Number.isFinite(kmh) || kmh < 0) return null;
  return Math.round(kmh / SPEED_BADGE_BUCKET) * SPEED_BADGE_BUCKET;
};
// Icono del vehiculo en el mapa: silueta vista desde arriba que gira segun
// el rumbo — el mismo estilo que usan InDrive/Uber/Google Maps para mostrar
// autos en movimiento, en vez de una foto de perfil o un icono con flecha
// aparte. La foto real del vehiculo pasa a ser solo informativa (se ve al
// tocar el marcador). El color del cuerpo es el mismo que ya se usaba para
// distinguir el vehiculo/estado; el tipo de carroceria cambia la silueta;
// la escalera se dibuja como una parrilla en el techo (no como insignia
// aparte), asi se ve integrada al propio vehiculo.
const roundedRectPath = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
};
const roundedRectCentered = (ctx, cx, cy, w, h, r) => roundedRectPath(ctx, cx - w / 2, cy - h / 2, w, h, r);
const CAR_LIGHT_FRONT = "#fef08a";
const CAR_LIGHT_REAR = "#ef4444";
const MIRROR_FILL = "rgba(15,23,42,0.55)";

// Aclara (percent > 0) u oscurece (percent < 0) un color hex — se usa para
// simular pintura/brillo real con un degradado en vez de un relleno plano.
const shadeHexColor = (hex, percent) => {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (!Number.isFinite(num) || full.length !== 6) return hex;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent);
  const nr = Math.round((t - r) * p + r);
  const ng = Math.round((t - g) * p + g);
  const nb = Math.round((t - b) * p + b);
  return `rgb(${nr},${ng},${nb})`;
};
// Poligono con esquinas redondeadas a partir de una lista de vertices — se
// usa para la silueta del vehiculo (trompa angosta -> se ensancha en la
// cabina/guardafangos -> se angosta en la cola), en vez de un simple
// rectangulo, para que de verdad se reconozca como un auto visto desde
// arriba (estilo InDrive/Uber) y no como una pastilla generica.
const roundedPolygonPath = (ctx, points, r) => {
  const n = points.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
    const toNext = { x: next.x - curr.x, y: next.y - curr.y };
    const lenPrev = Math.hypot(toPrev.x, toPrev.y) || 1;
    const lenNext = Math.hypot(toNext.x, toNext.y) || 1;
    const rr = Math.min(r, lenPrev / 2, lenNext / 2);
    const start = { x: curr.x + (toPrev.x / lenPrev) * rr, y: curr.y + (toPrev.y / lenPrev) * rr };
    const end = { x: curr.x + (toNext.x / lenNext) * rr, y: curr.y + (toNext.y / lenNext) * rr };
    if (i === 0) ctx.moveTo(start.x, start.y);
    else ctx.lineTo(start.x, start.y);
    ctx.arcTo(curr.x, curr.y, end.x, end.y, rr);
  }
  ctx.closePath();
};

// Cuerpo del auto: trompa (hn) -> hombros (donde se ensancha a la cabina,
// hc) -> cola (ht). "halfL" es medio largo, "shoulderF/R" son las alturas
// donde termina la trompa/empieza la cola.
const bodyFillStroke = (ctx, points, r, color, halfL) => {
  roundedPolygonPath(ctx, points, r);
  ctx.shadowColor = "rgba(15,23,42,0.45)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 0.8;
  // Degradado tipo pintura de auto: mas claro adelante (donde pega la luz),
  // tono base en la cabina, un poco mas oscuro atras — en vez de un relleno
  // plano, que se veia demasiado "sticker".
  const grad = ctx.createLinearGradient(0, -halfL, 0, halfL);
  grad.addColorStop(0, shadeHexColor(color, 0.15));
  grad.addColorStop(0.45, color);
  grad.addColorStop(1, shadeHexColor(color, -0.28));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = "rgba(51,65,85,0.35)";
  ctx.stroke();

  // Sombreado lateral (los costados del auto "se alejan" de la luz, como
  // una carroceria redondeada real) + un brillo especular arriba-izquierda
  // — pseudo-3D barato pero efectivo, sin pasar a un render 3D de verdad.
  ctx.save();
  roundedPolygonPath(ctx, points, r);
  ctx.clip();
  const halfW = Math.max(...points.map((p) => Math.abs(p.x)));
  const side = ctx.createLinearGradient(-halfW, 0, halfW, 0);
  side.addColorStop(0, "rgba(15,23,42,0.22)");
  side.addColorStop(0.5, "rgba(15,23,42,0)");
  side.addColorStop(1, "rgba(15,23,42,0.22)");
  ctx.fillStyle = side;
  ctx.fillRect(-halfW, -halfL, halfW * 2, halfL * 2);
  const shine = ctx.createRadialGradient(-halfW * 0.3, -halfL * 0.55, 0, -halfW * 0.3, -halfL * 0.55, halfL * 0.6);
  shine.addColorStop(0, "rgba(255,255,255,0.45)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.fillRect(-halfW, -halfL, halfW * 2, halfL * 2);
  ctx.restore();
};
const carOutlinePoints = (hn, hc, ht, halfL, shoulderF, shoulderR) => [
  { x: hn, y: -halfL },
  { x: hc, y: shoulderF },
  { x: hc, y: shoulderR },
  { x: ht, y: halfL },
  { x: -ht, y: halfL },
  { x: -hc, y: shoulderR },
  { x: -hc, y: shoulderF },
  { x: -hn, y: -halfL }
];
// Faros (delante, blanco/amarillo) y luces de freno (atras, rojo) en las
// esquinas — el detalle que mas ayuda a que un icono chico se lea como auto.
const drawLights = (ctx, hn, ht, halfL) => {
  ctx.fillStyle = CAR_LIGHT_FRONT;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.arc(side * hn * 0.68, -halfL + 1.6, 1.05, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = CAR_LIGHT_REAR;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.arc(side * ht * 0.68, halfL - 1.6, 1.05, 0, Math.PI * 2);
    ctx.fill();
  });
};
// Espejos laterales, a la altura del parabrisas.
const drawMirrors = (ctx, hc, shoulderY) => {
  ctx.fillStyle = MIRROR_FILL;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.ellipse(side * (hc + 1.5), shoulderY, 1.3, 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  });
};
// Ruedas asomando en las 4 esquinas (eje delantero/trasero) — el detalle
// que mas ayuda a que se lea como un auto real visto desde arriba.
const drawWheels4 = (ctx, hc, shoulderF, shoulderR) => {
  ctx.fillStyle = "#1f2937";
  [shoulderF, shoulderR].forEach((sy) => {
    [-1, 1].forEach((side) => {
      roundedRectCentered(ctx, side * (hc + 0.9), sy, 1.8, 3.8, 1);
      ctx.fill();
    });
  });
};
// En la moto las ruedas van una adelante y otra atras, no a los costados.
const drawWheelsMoto = (ctx, halfL) => {
  ctx.fillStyle = "#1f2937";
  roundedRectCentered(ctx, 0, -halfL + 2.4, 2.8, 3.6, 1.3);
  ctx.fill();
  roundedRectCentered(ctx, 0, halfL - 2.4, 2.8, 3.6, 1.3);
  ctx.fill();
};
// Antena tipo "aleta de tiburon" en el techo trasero.
const drawAntenna = (ctx, x, y) => {
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.ellipse(x, y, 1.1, 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
};
// Placa clara en la punta de la trompa y de la cola.
const drawPlates = (ctx, halfL) => {
  ctx.fillStyle = "rgba(241,245,249,0.92)";
  ctx.strokeStyle = "rgba(51,65,85,0.4)";
  ctx.lineWidth = 0.4;
  [-halfL + 1.2, halfL - 1.2].forEach((y) => {
    roundedRectCentered(ctx, 0, y, 3.6, 1.3, 0.4);
    ctx.fill();
    ctx.stroke();
  });
};
// Parabrisas/luneta como trapecio (angosto hacia la trompa/cola, ancho
// hacia el techo) en vez de un rectangulo — asi se ve el vidrio inclinado
// real de un auto visto desde arriba, como en las fotos de referencia.
const fillWindshield = (ctx, yNarrow, wNarrow, yWide, wWide) => {
  ctx.beginPath();
  ctx.moveTo(-wNarrow / 2, yNarrow);
  ctx.lineTo(wNarrow / 2, yNarrow);
  ctx.lineTo(wWide / 2, yWide);
  ctx.lineTo(-wWide / 2, yWide);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, yNarrow, 0, yWide);
  grad.addColorStop(0, "rgba(226,232,240,0.55)");
  grad.addColorStop(0.5, "rgba(15,23,42,0.38)");
  grad.addColorStop(1, "rgba(15,23,42,0.5)");
  ctx.fillStyle = grad;
  ctx.fill();
};
// Techo/caja opaca (metal pintado, no vidrio) entre el parabrisas y la
// luneta, con una costura central sutil.
const fillRoofPanel = (ctx, cy, w, h, r, color) => {
  roundedRectCentered(ctx, 0, cy, w, h, r);
  ctx.fillStyle = shadeHexColor(color, -0.08);
  ctx.fill();
  ctx.strokeStyle = "rgba(15,23,42,0.15)";
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(0, cy - h / 2 + 1);
  ctx.lineTo(0, cy + h / 2 - 1);
  ctx.stroke();
};
// Lineas acanaladas (caja de furgon/tolva de pickup, como en las fotos).
const drawRidges = (ctx, cx, cy, w, h, count, strokeColor) => {
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 0.5;
  for (let i = 1; i < count; i++) {
    const ry = cy - h / 2 + (h * i) / count;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + 0.5, ry);
    ctx.lineTo(cx + w / 2 - 0.5, ry);
    ctx.stroke();
  }
};
// Argollas de amarre en las 4 esquinas de la tolva de la pickup.
const drawTieDownLoops = (ctx, cx, cy, w, h) => {
  ctx.fillStyle = "#111827";
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.arc(cx + sx * (w / 2 - 1), cy + sy * (h / 2 - 1), 0.55, 0, Math.PI * 2);
    ctx.fill();
  });
};

const VEHICLE_TYPE_ICON = {
  sedan: {
    label: "Sedan",
    w: 15,
    spriteKey: "sedan",
    spriteLength: 29,
    draw(ctx, color) {
      const halfL = 14;
      const shoulderF = -8;
      const shoulderR = 9;
      bodyFillStroke(ctx, carOutlinePoints(4, 7.5, 5, halfL, shoulderF, shoulderR), 2.4, color, halfL);
      drawWheels4(ctx, 7.5, shoulderF, shoulderR);
      const windshieldEnd = shoulderF + 4;
      const rearEnd = shoulderR - 4;
      fillWindshield(ctx, shoulderF, 5, windshieldEnd, 8.4);
      fillRoofPanel(ctx, (windshieldEnd + rearEnd) / 2, 8.6, rearEnd - windshieldEnd, 2, color);
      fillWindshield(ctx, rearEnd, 8.4, shoulderR, 5.5);
      ctx.strokeStyle = "rgba(15,23,42,0.18)";
      ctx.lineWidth = 0.5;
      [windshieldEnd + 0.5, rearEnd - 0.5].forEach((dy) => {
        ctx.beginPath();
        ctx.moveTo(-7.3, dy);
        ctx.lineTo(7.3, dy);
        ctx.stroke();
      });
      drawMirrors(ctx, 7.5, shoulderF);
      drawAntenna(ctx, -2, rearEnd);
      drawLights(ctx, 4, 5, halfL);
      drawPlates(ctx, halfL);
    }
  },
  pickup: {
    label: "Pickup / Camioneta",
    w: 15,
    spriteKey: "pickup",
    spriteLength: 31,
    draw(ctx, color) {
      const halfL = 15;
      const shoulderF = -8;
      const shoulderR = 12;
      bodyFillStroke(ctx, carOutlinePoints(4, 7.5, 6.5, halfL, shoulderF, shoulderR), 1.8, color, halfL);
      drawWheels4(ctx, 7.5, shoulderF, shoulderR);
      const windshieldEnd = shoulderF + 4;
      fillWindshield(ctx, shoulderF, 5, windshieldEnd, 8.4);
      fillRoofPanel(ctx, windshieldEnd + 2, 8.6, 4, 2, color);
      const bedCy = 9;
      const bedH = 12;
      roundedRectCentered(ctx, 0, bedCy, 12, bedH, 1.4);
      ctx.fillStyle = "rgba(15,23,42,0.6)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      drawRidges(ctx, 0, bedCy, 11.2, bedH - 1.6, 5, "rgba(255,255,255,0.28)");
      drawTieDownLoops(ctx, 0, bedCy, 11.2, bedH - 1.6);
      drawMirrors(ctx, 7.5, shoulderF);
      drawAntenna(ctx, -2, shoulderF + 4.6);
      drawLights(ctx, 4, 6.5, halfL);
      drawPlates(ctx, halfL);
    }
  },
  furgon: {
    label: "Furgon / Van",
    w: 17,
    spriteKey: "furgon",
    spriteLength: 30,
    draw(ctx, color) {
      const halfL = 14.5;
      const shoulderF = -10.5;
      const shoulderR = 11.5;
      bodyFillStroke(ctx, carOutlinePoints(6, 8.5, 6.5, halfL, shoulderF, shoulderR), 1.6, color, halfL);
      drawWheels4(ctx, 8.5, shoulderF, shoulderR);
      const windshieldEnd = shoulderF + 4.5;
      fillWindshield(ctx, shoulderF, 6.5, windshieldEnd, 10);
      const boxCy = (windshieldEnd + halfL) / 2;
      const boxH = halfL - windshieldEnd;
      fillRoofPanel(ctx, boxCy, 13.5, boxH, 2, color);
      drawRidges(ctx, 0, boxCy, 13, boxH, 6, "rgba(15,23,42,0.22)");
      drawMirrors(ctx, 8.5, shoulderF);
      drawAntenna(ctx, -2.5, windshieldEnd + 1);
      drawLights(ctx, 6, 6.5, halfL);
      drawPlates(ctx, halfL);
    }
  },
  moto: {
    label: "Moto",
    w: 6.5,
    draw(ctx, color) {
      const halfL = 12;
      bodyFillStroke(ctx, carOutlinePoints(3.25, 3.25, 3.25, halfL, -7, 7), 3, color, halfL);
      drawWheelsMoto(ctx, halfL);
      const seatGrad = ctx.createLinearGradient(0, 1.5, 0, 6.5);
      seatGrad.addColorStop(0, "rgba(226,232,240,0.5)");
      seatGrad.addColorStop(1, "rgba(15,23,42,0.5)");
      ctx.beginPath();
      ctx.arc(0, 4, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = seatGrad;
      ctx.fill();
      drawMirrors(ctx, 2.2, -9);
      drawLights(ctx, 0, 0, halfL);
    }
  }
};
const VEHICLE_TYPE_DEFAULT = "sedan";
const VEHICLE_TYPE_OPTIONS = [
  { value: "sedan", label: "Sedan" },
  { value: "pickup", label: "Pickup / Camioneta" },
  { value: "furgon", label: "Furgon / Van" },
  { value: "moto", label: "Moto" }
];

// Escalera telescopica amarilla con detalles negros sobre el techo — la
// escalera de fibra de vidrio que usan los tecnicos en la realidad, no una
// insignia generica. Gira junto con el vehiculo.
const drawLadderRack = (ctx, bodyW) => {
  const barW = Math.min(bodyW * 0.24, 3.4);
  const halfLen = 7.6;
  const crossW = Math.min(bodyW * 0.85, 12.5);

  // Barras del portaequipaje (crossbars) del techo, debajo de la escalera —
  // asi se ve que va montada/amarrada sobre un rack real, no flotando.
  ctx.fillStyle = "#111827";
  [-halfLen * 0.5, halfLen * 0.5].forEach((cy2) => {
    roundedRectCentered(ctx, 0, cy2, crossW, 1.3, 0.6);
    ctx.fill();
  });

  ctx.save();
  roundedRectCentered(ctx, 0, 0, barW, halfLen * 2, barW * 0.4);
  ctx.clip();

  // Cuerpo de fibra de vidrio amarilla, con un leve brillo al centro.
  const grad = ctx.createLinearGradient(-barW / 2, 0, barW / 2, 0);
  grad.addColorStop(0, "#CA8A04");
  grad.addColorStop(0.5, "#FDE047");
  grad.addColorStop(1, "#CA8A04");
  ctx.fillStyle = grad;
  ctx.shadowColor = "rgba(15,23,42,0.4)";
  ctx.shadowBlur = 1.5;
  ctx.shadowOffsetY = 0.4;
  ctx.fillRect(-barW / 2, -halfLen, barW, halfLen * 2);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // Brillo central (perfil redondeado/extruido de fibra de vidrio real).
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(-barW * 0.1, -halfLen, barW * 0.2, halfLen * 2);

  // Juntas negras de los tramos telescopicos.
  ctx.fillStyle = "#1f2937";
  for (let i = 1; i <= 3; i++) {
    const jy = -halfLen + (halfLen * 2 * i) / 4;
    ctx.fillRect(-barW / 2, jy - 0.45, barW, 0.9);
  }
  ctx.restore();

  // Correas de amarre cruzando la escalera sobre cada crossbar.
  ctx.strokeStyle = "rgba(17,24,39,0.85)";
  ctx.lineWidth = 0.9;
  [-halfLen * 0.5, halfLen * 0.5].forEach((cy2) => {
    ctx.beginPath();
    ctx.moveTo(-crossW / 2, cy2);
    ctx.lineTo(crossW / 2, cy2);
    ctx.stroke();
  });

  // Topes/ganchos negros de goma en ambos extremos.
  ctx.fillStyle = "#1f2937";
  roundedRectCentered(ctx, 0, -halfLen, barW + 0.9, 1.9, 0.9);
  ctx.fill();
  roundedRectCentered(ctx, 0, halfLen, barW + 0.9, 1.9, 0.9);
  ctx.fill();

  ctx.lineWidth = 0.5;
  ctx.strokeStyle = "rgba(120,53,15,0.6)";
  roundedRectCentered(ctx, 0, 0, barW, halfLen * 2, barW * 0.4);
  ctx.stroke();
};

// Badge de kilometraje (km/h), en color segun velocidad — se dibuja SIN la
// rotacion del rumbo (se llama fuera del ctx.rotate del cuerpo) para que el
// texto siempre se lea derecho en el mapa, sin importar hacia donde mire el
// vehiculo.
const drawSpeedBadge = (ctx, speedKmh, y) => {
  const label = `${Math.round(speedKmh)} km/h`;
  ctx.font = "bold 11px sans-serif";
  const textW = ctx.measureText(label).width;
  const pillW = textW + 14;
  const pillH = 15;
  const x = -pillW / 2;
  const topY = y - pillH / 2;
  roundedRectPath(ctx, x, topY, pillW, pillH, pillH / 2);
  ctx.shadowColor = "rgba(15,23,42,0.4)";
  ctx.shadowBlur = 2;
  ctx.fillStyle = colorForSpeedKmh(speedKmh);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, y + 0.5);
};

// El canvas base es cuadrado (92x92) para que el auto rote libremente sin
// recortarse; se le agrega una franja extra abajo (sin rotar) para el badge
// de velocidad, siempre reservada aunque no haya velocidad aun, asi el
// ancla/tamaño del marcador no cambia entre iconos con y sin badge.
const VEHICLE_ICON_CAR_SIZE = 92;
const VEHICLE_ICON_BADGE_BAND = 26;
const vehicleIconGeometry = (displayW) => {
  const scale = displayW / VEHICLE_ICON_CAR_SIZE;
  return {
    width: Math.round(displayW),
    height: Math.round((VEHICLE_ICON_CAR_SIZE + VEHICLE_ICON_BADGE_BAND) * scale),
    anchorX: Math.round((VEHICLE_ICON_CAR_SIZE / 2) * scale),
    anchorY: Math.round((VEHICLE_ICON_CAR_SIZE / 2) * scale)
  };
};

const vehicleTypeIconCache = new Map();
function crearIconoVehiculoTipo(tipoVehiculo, tieneEscalera, color, bearing, speedKmh) {
  const tipo = VEHICLE_TYPE_ICON[tipoVehiculo] ? tipoVehiculo : VEHICLE_TYPE_DEFAULT;
  const cuerpo = VEHICLE_TYPE_ICON[tipo];
  const bucket = roundHeadingBucket(bearing) ?? 0;
  const speedBucket = roundSpeedBucket(speedKmh);
  // El sprite real (si ya cargo) no depende del color por vehiculo/estado —
  // solo el dibujo vectorial de respaldo (mientras carga, o la moto que no
  // tiene sprite) lo usa, asi que ese caso no se cachea junto con los demas.
  const sprite = cuerpo.spriteKey ? vehicleSpriteImages[cuerpo.spriteKey] : null;
  const spriteReady = !!(sprite && sprite.complete && sprite.naturalWidth > 0);
  const usingSprite = !!cuerpo.spriteKey && spriteReady;
  const cacheKey = usingSprite
    ? `sprite|${tipo}|${tieneEscalera ? 1 : 0}|${bucket}|${speedBucket}`
    : `vector|${tipo}|${tieneEscalera ? 1 : 0}|${color}|${bucket}|${speedBucket}`;
  if (vehicleTypeIconCache.has(cacheKey)) return vehicleTypeIconCache.get(cacheKey);

  try {
    // Canvas a 2x resolucion real para que al mostrarlo mas grande en el
    // mapa (scaledSize) se vea nitido en vez de pixelado/borroso.
    const w = VEHICLE_ICON_CAR_SIZE;
    const h = VEHICLE_ICON_CAR_SIZE + VEHICLE_ICON_BADGE_BAND;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const cx = w / 2;
    const cy = w / 2;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.save();
    ctx.rotate((bucket * Math.PI) / 180);
    ctx.scale(2, 2);
    if (usingSprite) {
      // Los recortes reales no son cuadrados — se dibujan respetando su
      // proporcion real (ancho/alto de la foto) para no deformar el auto.
      const drawH = cuerpo.spriteLength;
      const ratio = sprite.naturalWidth / sprite.naturalHeight;
      const drawW = drawH * ratio;
      ctx.shadowColor = "rgba(15,23,42,0.4)";
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 0.6;
      ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    } else {
      cuerpo.draw(ctx, color);
    }
    if (tieneEscalera) drawLadderRack(ctx, cuerpo.w);
    ctx.restore();

    if (speedBucket != null) drawSpeedBadge(ctx, speedBucket, (w - cy) + VEHICLE_ICON_BADGE_BAND / 2);

    ctx.restore();

    const dataUrl = canvas.toDataURL("image/png");
    vehicleTypeIconCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (e) {
    console.warn("No se pudo generar el icono de vehiculo por tipo:", e);
    return null;
  }
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
  const [mapZoom, setMapZoom] = useState(15);

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
  const [editForm, setEditForm] = useState({
    placa: "",
    alias: "",
    marca: "",
    modelo: "",
    color: "",
    tecnicoAsignado: "",
    activo: true,
    fotoUrl: "",
    tipoVehiculo: VEHICLE_TYPE_DEFAULT,
    tieneEscalera: false
  });
  const [editFotoFile, setEditFotoFile] = useState(null);
  const [editFotoPreview, setEditFotoPreview] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // Compartir ubicacion en vivo de un vehiculo por enlace publico, con
  // duracion configurable — para mandarselo a un cliente o a quien lo pida.
  const [compartirVehiculo, setCompartirVehiculo] = useState(null);
  const [compartirHoras, setCompartirHoras] = useState(4);
  const [compartirLink, setCompartirLink] = useState("");
  const [compartirGenerando, setCompartirGenerando] = useState(false);
  const [compartirError, setCompartirError] = useState("");
  const [compartirCopiado, setCompartirCopiado] = useState(false);

  const [ordenesHoy, setOrdenesHoy] = useState([]);
  const [showOrdenes, setShowOrdenes] = useState(true);
  const orderMarkersRef = useRef([]);
  const arrivedPulsesRef = useRef([]);

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
      fotoUrl: toText(v?.foto_url),
      tipoVehiculo: VEHICLE_TYPE_ICON[v?.tipo_vehiculo] ? v.tipo_vehiculo : VEHICLE_TYPE_DEFAULT,
      tieneEscalera: !!v?.tiene_escalera
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

  const abrirCompartir = useCallback((row) => {
    setCompartirVehiculo(row);
    setCompartirHoras(4);
    setCompartirLink("");
    setCompartirError("");
    setCompartirCopiado(false);
  }, []);

  const cerrarCompartir = useCallback(() => {
    setCompartirVehiculo(null);
    setCompartirLink("");
    setCompartirError("");
    setCompartirGenerando(false);
    setCompartirCopiado(false);
  }, []);

  const generarEnlaceCompartir = useCallback(async () => {
    if (!compartirVehiculo?.vehiculo_id) return;
    const horas = Number(compartirHoras) > 0 ? Number(compartirHoras) : 4;
    setCompartirGenerando(true);
    setCompartirError("");
    setCompartirCopiado(false);
    try {
      const veh = vehiculoById[compartirVehiculo.vehiculo_id];
      const tecnicoNombre = toText(veh?.tecnico_asignado);
      if (!tecnicoNombre) {
        setCompartirError('Este vehiculo no tiene "Tecnico asignado" — configuralo en "Editar vehiculo" antes de compartir.');
        return;
      }
      const { data: tecnicoRow, error: tecError } = await supabase
        .from("usuarios")
        .select("id")
        .ilike("nombre", tecnicoNombre)
        .maybeSingle();
      if (tecError || !tecnicoRow?.id) {
        setCompartirError(`No se encontro un usuario tecnico llamado "${tecnicoNombre}" — revisa el nombre en "Editar vehiculo".`);
        return;
      }

      const expiraEn = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("enlaces_seguimiento")
        .insert({
          vehiculo_id: compartirVehiculo.vehiculo_id,
          tecnico_id: tecnicoRow.id,
          tecnico_nombre: tecnicoNombre,
          expira_en: expiraEn
        })
        .select("id")
        .single();
      if (error) throw error;
      const url = `${window.location.origin}/seguimiento?t=${data.id}`;
      setCompartirLink(url);
    } catch (e) {
      setCompartirError(String(e?.message || "No se pudo generar el enlace."));
    } finally {
      setCompartirGenerando(false);
    }
  }, [compartirVehiculo, compartirHoras, vehiculoById]);

  const copiarEnlaceCompartir = useCallback(async () => {
    if (!compartirLink) return;
    try {
      await navigator.clipboard.writeText(compartirLink);
      setCompartirCopiado(true);
    } catch {
      // clipboard puede fallar (permiso, http no seguro) — el link ya esta visible para copiar a mano
    }
  }, [compartirLink]);

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
          foto_url: fotoUrl || null,
          tipo_vehiculo: editForm.tipoVehiculo || VEHICLE_TYPE_DEFAULT,
          tiene_escalera: !!editForm.tieneEscalera
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
    // Se pide del mas reciente al mas viejo — si entre todos los vehiculos
    // seleccionados hay mas de 30000 puntos en la ventana, Supabase corta en
    // el limite; pidiendolo ascendente eso descartaria lo mas RECIENTE (el
    // recorrido de ahora), dejando solo tramos viejos. Pidiendolo descendente
    // se garantiza quedarse con lo actual, y se reordena despues.
    const res = await supabase
      .from("vehiculo_ubicaciones")
      .select("vehiculo_id,lat,lng,created_at")
      .in("vehiculo_id", selectedIds)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(30000);
    if (res.error) {
      if (tableMissing(res.error, "vehiculo_ubicaciones")) {
        setTrailByVehiculo({});
        return;
      }
      throw res.error;
    }
    const grouped = {};
    (Array.isArray(res.data) ? res.data : []).slice().reverse().forEach((row) => {
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
      const ptsRaw = (Array.isArray(res.data) ? res.data : [])
        .map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), speedMps: Number(r.speed_mps), t: new Date(r.created_at).getTime() }))
        .filter((p) => isValidCoord(p.lat, p.lng) && Number.isFinite(p.t));
      const pts = filtrarJitterEstacionario(ptsRaw);
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
          tipoVehiculo: veh?.tipo_vehiculo || "",
          tieneEscalera: !!veh?.tiene_escalera,
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
        points: suavizarPuntos(filtrarJitterEstacionario(pts.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))))
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

  // El icono del vehiculo se veia cada vez mas chico al acercar el zoom
  // (tamaño fijo en pixeles mientras calles/edificios crecen a su alrededor)
  // — se reescala segun el zoom actual para que no se pierda de vista.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapsRef.current) return undefined;
    const map = mapRef.current;
    const maps = mapsRef.current;
    setMapZoom(map.getZoom() ?? 15);
    const listener = map.addListener("zoom_changed", () => setMapZoom(map.getZoom() ?? 15));
    return () => { maps.event.removeListener(listener); };
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

    // Zoom de referencia = 16 (donde 68/56px se ven bien); mas alejado del
    // mapa lo reduce, mas cerca lo agranda, con un piso para que nunca se
    // achique demasiado ni se pierda de vista.
    const zoomScale = Math.min(1.7, Math.max(0.6, Math.pow(1.22, mapZoom - 16)));

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
      const bodyColor = isLive ? paintForVehiculoId(id) : STALE_CAR_PAINT;
      const size = Math.round((selected ? 68 : 56) * zoomScale);
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

      const iconDataUrl = crearIconoVehiculoTipo(row.tipoVehiculo, row.tieneEscalera, bodyColor, heading, row.speedKmh);
      const iconGeo = vehicleIconGeometry(size);
      const icon = iconDataUrl
        ? {
            url: iconDataUrl,
            scaledSize: new maps.Size(iconGeo.width, iconGeo.height),
            anchor: new maps.Point(iconGeo.anchorX, iconGeo.anchorY)
          }
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
  }, [rowsList, selectedId, mapReady, followVehicle, mapZoom]);

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
      const iconDataUrl = crearIconoVehiculoTipo(veh?.tipo_vehiculo, veh?.tiene_escalera, NEUTRAL_CAR_PAINT[0], null, primerSpeedKmh);
      const iconGeo = vehicleIconGeometry(60);
      playbackMarkerRef.current = new maps.Marker({
        map,
        position: full[0],
        icon: iconDataUrl
          ? {
              url: iconDataUrl,
              scaledSize: new maps.Size(iconGeo.width, iconGeo.height),
              anchor: new maps.Point(iconGeo.anchorX, iconGeo.anchorY)
            }
          : { path: maps.SymbolPath.CIRCLE, fillColor: "#7C3AED", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2.5, scale: 9 },
        zIndex: 1000
      });
    }

    return () => clearPlayback();
  }, [playbackPoints, playbackVehiculoId, vehiculoById]);

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
      const iconDataUrl = crearIconoVehiculoTipo(veh?.tipo_vehiculo, veh?.tiene_escalera, NEUTRAL_CAR_PAINT[0], rumboActual, speedKmhActual);
      if (iconDataUrl) {
        const iconGeo = vehicleIconGeometry(60);
        playbackMarkerRef.current.setIcon({
          url: iconDataUrl,
          scaledSize: new maps.Size(iconGeo.width, iconGeo.height),
          anchor: new maps.Point(iconGeo.anchorX, iconGeo.anchorY)
        });
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
              <button
                type="button"
                title="Compartir ubicacion por enlace"
                onClick={(e) => { e.stopPropagation(); abrirCompartir(row); }}
                style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0, border: "1px solid #c7d2fe",
                  background: "#eef2ff", color: "#4338ca", fontSize: 14, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                🔗
              </button>
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
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                    {(VEHICLE_TYPE_ICON[v.tipo_vehiculo] || VEHICLE_TYPE_ICON[VEHICLE_TYPE_DEFAULT]).label}
                    {v.tiene_escalera ? " · 🪜 Con escalera" : ""}
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
              <div>
                <label className="secondary-btn small" style={{ cursor: "pointer" }}>
                  📷 {editForm.fotoUrl || editFotoPreview ? "Cambiar foto" : "Subir foto"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => onElegirFotoEdicion(e.target.files?.[0] || null)}
                  />
                </label>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>
                  Solo informativa: se ve al tocar el vehiculo en el mapa. El icono del mapa usa el tipo de vehiculo.
                </p>
              </div>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Tipo de vehiculo (icono en el mapa)</label>
            <select
              value={editForm.tipoVehiculo}
              onChange={(e) => setEditForm((f) => ({ ...f, tipoVehiculo: e.target.value }))}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", marginTop: 4, marginBottom: 10, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff" }}
            >
              {VEHICLE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155", marginTop: 2, marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={editForm.tieneEscalera}
                onChange={(e) => setEditForm((f) => ({ ...f, tieneEscalera: e.target.checked }))}
              />
              🪜 Tiene escalera (se muestra como insignia sobre el icono, sin importar el tipo)
            </label>

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

      {compartirVehiculo ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16
          }}
          onClick={cerrarCompartir}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 420 }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 4, color: "#1e293b" }}>🔗 Compartir ubicacion</h3>
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 0, marginBottom: 14 }}>
              {compartirVehiculo.placaLabel}{compartirVehiculo.alias ? ` · ${compartirVehiculo.alias}` : ""} — genera un enlace publico
              (sin necesidad de iniciar sesion) para que un cliente o cualquier persona vea su ubicacion en vivo.
            </p>

            {compartirError ? <p className="warn-text" style={{ marginTop: 0 }}>{compartirError}</p> : null}

            {!compartirLink ? (
              <>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>¿Por cuantas horas estara activo?</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, marginBottom: 14 }}>
                  {[1, 2, 4, 8, 24].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setCompartirHoras(h)}
                      style={{
                        padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: `1.5px solid ${compartirHoras === h ? "#4338ca" : "#e2e8f0"}`,
                        background: compartirHoras === h ? "#eef2ff" : "#fff",
                        color: compartirHoras === h ? "#4338ca" : "#64748b"
                      }}
                    >
                      {h}h
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    value={compartirHoras}
                    onChange={(e) => setCompartirHoras(e.target.value)}
                    style={{ width: 64, padding: "6px 8px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 12 }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="secondary-btn small" onClick={cerrarCompartir} disabled={compartirGenerando}>
                    Cancelar
                  </button>
                  <button type="button" className="secondary-btn small" onClick={() => void generarEnlaceCompartir()} disabled={compartirGenerando}>
                    {compartirGenerando ? "Generando..." : "Generar enlace"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#166534", fontWeight: 700 }}>✓ Enlace generado — activo por {compartirHoras}h</p>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#334155", wordBreak: "break-all" }}>{compartirLink}</p>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="secondary-btn small" onClick={cerrarCompartir}>
                    Cerrar
                  </button>
                  <button type="button" className="secondary-btn small" onClick={() => void copiarEnlaceCompartir()}>
                    {compartirCopiado ? "✓ Copiado" : "📋 Copiar enlace"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
