// Miniatura de Google Street View a partir de coordenadas — no requiere que
// nadie haya "subido" una foto, Google ya tiene el panorama mas cercano al
// punto. Usa la misma API key que Maps/Geocoding (ya habilitada en el
// proyecto). Gratis hasta 10,000 vistas/mes; ver Street View Static API.
const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o").trim();

/** Extrae {lat,lng} de un string "lat, lng" o similar. Devuelve null si no matchea. */
export function parseCoordsStr(coordStr) {
  const m = String(coordStr || "").match(/(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

/** URL de imagen estatica de Street View para lat/lng dados. */
export function streetViewUrl(lat, lng, { width = 400, height = 220, fov = 80 } = {}) {
  if (lat == null || lng == null || !GOOGLE_MAPS_API_KEY) return null;
  const params = new URLSearchParams({
    size: `${width}x${height}`,
    location: `${lat},${lng}`,
    fov: String(fov),
    key: GOOGLE_MAPS_API_KEY,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

/** Idem, pero a partir de un string de coordenadas "lat, lng". */
export function streetViewUrlFromStr(coordStr, opts) {
  const c = parseCoordsStr(coordStr);
  if (!c) return null;
  return streetViewUrl(c.lat, c.lng, opts);
}
