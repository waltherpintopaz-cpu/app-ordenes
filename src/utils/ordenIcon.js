// Icono circular por orden + helpers de fecha/ubicacion -- copia de lo que
// ya usa SeguimientoVehiculosPanel.jsx, movido aqui para que Seguimiento
// tecnicos tambien pueda mostrar "ordenes del dia" con el mismo dibujo
// (color del anillo = estado, icono central = tipo de actuacion) sin
// duplicar el canvas a mano. SeguimientoVehiculosPanel.jsx mantiene su
// propia copia inline (no se toco, para no arriesgar ese panel).

const isValidCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

export const parseUbicacion = (value) => {
  const m = String(value ?? "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return isValidCoord(lat, lng) ? { lat, lng } : null;
};

export const todayLocalDateStr = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const ESTADO_ORDEN_COLOR = { Pendiente: "#F59E0B", Liquidada: "#16A34A", Cancelada: "#94A3B8" };

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
export const iconoParaTipoActuacion = (tipoActuacion) => {
  const tipoLow = String(tipoActuacion || "").toLowerCase();
  return TIPO_ORDEN_ICON.find((t) => tipoLow.includes(t.match)) || TIPO_ORDEN_ICON_DEFAULT;
};

const ordenIconCache = new Map();
export function crearIconoOrden(tipoActuacion, estado) {
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

  const iconSize = size * 0.52;
  const scale = iconSize / 24;
  ctx.save();
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
