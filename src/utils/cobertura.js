import { cargarZonasCobertura } from "./zonasCobertura";

// Ray casting: true si (lat,lng) cae dentro del poligono cerrado `coordinates`.
function puntoEnPoligono(lat, lng, coordinates) {
  let dentro = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const yi = coordinates[i].lat, xi = coordinates[i].lng;
    const yj = coordinates[j].lat, xj = coordinates[j].lng;
    const interseca = (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (interseca) dentro = !dentro;
  }
  return dentro;
}

// Devuelve la zona de cobertura (con nombre y grupo) que contiene el punto, o null si no esta en ninguna.
export async function buscarZonaCobertura(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const zonas = await cargarZonasCobertura();
  return zonas.find((z) => puntoEnPoligono(lat, lng, z.coordinates)) || null;
}
