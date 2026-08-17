import { supabase, isSupabaseConfigured } from "../supabaseClient";

let cache = null;
let inflight = null;

function mapRow(r) {
  return {
    id: r.id,
    grupo: r.grupo,
    nombre: r.nombre,
    mid: r.mid,
    strokeColor: r.stroke_color,
    fillColor: r.fill_color,
    fillOpacity: Number(r.fill_opacity),
    coordinates: Array.isArray(r.coordinates) ? r.coordinates : [],
  };
}

// Carga las zonas de cobertura desde Supabase (cache en memoria durante la sesion).
export async function cargarZonasCobertura() {
  if (cache) return cache;
  if (inflight) return inflight;
  if (!isSupabaseConfigured) { cache = []; return cache; }

  inflight = supabase
    .from("zonas_cobertura")
    .select("id,grupo,nombre,mid,stroke_color,fill_color,fill_opacity,coordinates")
    .then(({ data, error }) => {
      inflight = null;
      cache = error ? [] : (data || []).map(mapRow);
      return cache;
    });
  return inflight;
}

// Fuerza a releer de Supabase en la proxima llamada a cargarZonasCobertura (usar tras importar/borrar un mapa).
export function invalidarZonasCobertura() {
  cache = null;
}
