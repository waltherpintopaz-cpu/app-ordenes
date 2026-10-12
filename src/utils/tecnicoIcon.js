// Icono del tecnico en el mapa: avatar (flaticon, ver public/tecnico-icono.png)
// dentro de un circulo de color -- el color sigue siendo el que identifica a
// cada tecnico (mismo que su linea de recorrido y su pill en el toolbar), el
// avatar da la lectura visual de "persona" en vez de un punto generico.
// Mismo patron de cache por data-URL que usa vehicleIcon.js.

const tecnicoAvatarImg = new Image();
tecnicoAvatarImg.src = "/tecnico-icono.png";

const TECNICO_ICON_SIZE = 64;
const tecnicoIconCache = new Map();

export const tecnicoIconGeometry = (displaySize) => ({
  width: Math.round(displaySize),
  height: Math.round(displaySize),
  anchorX: Math.round(displaySize / 2),
  anchorY: Math.round(displaySize / 2),
});

export function crearIconoTecnico(color, selected, stale) {
  const avatarReady = tecnicoAvatarImg.complete && tecnicoAvatarImg.naturalWidth > 0;
  const cacheKey = `${color}|${selected ? 1 : 0}|${stale ? 1 : 0}|${avatarReady ? 1 : 0}`;
  if (tecnicoIconCache.has(cacheKey)) return tecnicoIconCache.get(cacheKey);

  try {
    const size = TECNICO_ICON_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;
    const ringR = size / 2 - 2;

    // Halo/anillo de color (identidad del tecnico, igual que su recorrido).
    ctx.save();
    ctx.shadowColor = "rgba(15,23,42,0.35)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.lineWidth = selected ? 4 : 3;
    ctx.strokeStyle = color;
    ctx.stroke();

    // Avatar recortado en circulo, con un leve gris si esta desactualizado.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ringR - 2, 0, Math.PI * 2);
    ctx.clip();
    if (avatarReady) {
      if (stale) ctx.filter = "grayscale(0.85) opacity(0.8)";
      ctx.drawImage(tecnicoAvatarImg, 0, 0, size, size);
      ctx.filter = "none";
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/png");
    tecnicoIconCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (e) {
    console.warn("No se pudo generar el icono de tecnico:", e);
    return null;
  }
}
