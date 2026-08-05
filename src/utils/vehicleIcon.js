// Icono del vehiculo en el mapa: silueta vista desde arriba que gira segun
// el rumbo — el mismo estilo que usan InDrive/Uber/Google Maps para mostrar
// autos en movimiento, en vez de una foto de perfil o un icono con flecha
// aparte. La foto real del vehiculo pasa a ser solo informativa. El color
// del cuerpo distingue vehiculo/estado; el tipo de carroceria cambia la
// silueta; la escalera se dibuja como una parrilla en el techo.
//
// Compartido entre el panel interno (SeguimientoVehiculosPanel) y la pagina
// publica de seguimiento (SeguimientoCompartidoPage) para que ambos vean
// exactamente el mismo icono sin duplicar el dibujo.

// Fotos reales (vista superior, Freepik — cuenta premium, sin atribucion
// necesaria, ver public/vehiculo-iconos/CREDITS.txt). Vienen en color fijo
// de fabrica: no se re-tiñen por vehiculo/estado, para eso se usa el halo
// pulsante que ya existe debajo del marcador. La moto no viene en el pack,
// asi que sigue con el dibujo vectorial propio.
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

// Colorea cada tramo/badge segun la velocidad — el mismo codigo de colores
// que usan los dashboards de flotas profesionales.
const SPEED_COLOR_STOPS = [
  { max: 5, color: "#94a3b8" },
  { max: 20, color: "#16a34a" },
  { max: 50, color: "#eab308" },
  { max: 80, color: "#f97316" },
  { max: Infinity, color: "#dc2626" }
];
export const colorForSpeedKmh = (kmh) =>
  (SPEED_COLOR_STOPS.find((s) => kmh <= s.max) || SPEED_COLOR_STOPS[SPEED_COLOR_STOPS.length - 1]).color;

// Colores de "pintura" realistas (neutros, como autos de verdad) para la
// carroceria del icono — un auto azul/rosa fuerte se ve como sticker en vez
// de un vehiculo real (asi lo hace InDrive: autos blancos/plateados).
export const NEUTRAL_CAR_PAINT = ["#F8FAFC", "#E2E8F0", "#D6DEE8", "#EDE9E3", "#DCE7F5"];
export const STALE_CAR_PAINT = "#94A3B8";
export const paintForVehiculoId = (value) => {
  const id = String(value ?? "").trim();
  if (!id) return NEUTRAL_CAR_PAINT[0];
  let acc = 0;
  for (let i = 0; i < id.length; i += 1) acc = (acc + id.charCodeAt(i) * (i + 11)) % 997;
  return NEUTRAL_CAR_PAINT[acc % NEUTRAL_CAR_PAINT.length];
};

// El rumbo se redondea a intervalos de 15° para que el cache no tenga que
// regenerar la imagen en cada micro-cambio de direccion.
const HEADING_BUCKET_DEG = 15;
export const roundHeadingBucket = (bearing) => {
  if (bearing == null || !Number.isFinite(bearing)) return null;
  return (Math.round(bearing / HEADING_BUCKET_DEG) * HEADING_BUCKET_DEG) % 360;
};
// Velocidad redondeada a intervalos de 5 km/h, para que el badge de
// kilometraje no obligue a regenerar el icono con cada micro-fluctuacion.
const SPEED_BADGE_BUCKET = 5;
export const roundSpeedBucket = (kmh) => {
  if (kmh == null || !Number.isFinite(kmh) || kmh < 0) return null;
  return Math.round(kmh / SPEED_BADGE_BUCKET) * SPEED_BADGE_BUCKET;
};

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

export const VEHICLE_TYPE_ICON = {
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
export const VEHICLE_TYPE_DEFAULT = "sedan";
export const VEHICLE_TYPE_OPTIONS = [
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
export const vehicleIconGeometry = (displayW) => {
  const scale = displayW / VEHICLE_ICON_CAR_SIZE;
  return {
    width: Math.round(displayW),
    height: Math.round((VEHICLE_ICON_CAR_SIZE + VEHICLE_ICON_BADGE_BAND) * scale),
    anchorX: Math.round((VEHICLE_ICON_CAR_SIZE / 2) * scale),
    anchorY: Math.round((VEHICLE_ICON_CAR_SIZE / 2) * scale)
  };
};

const vehicleTypeIconCache = new Map();
export function crearIconoVehiculoTipo(tipoVehiculo, tieneEscalera, color, bearing, speedKmh) {
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
