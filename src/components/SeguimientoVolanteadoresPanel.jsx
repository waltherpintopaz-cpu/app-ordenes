import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
// Paleta amplia para que nadie del mismo grupo repita color (se asigna por
// posicion en la lista visible, no por hash — ver colorMap mas abajo).
const TRAIL_COLORS = [
  "#EA580C", "#0891B2", "#7C3AED", "#16A34A", "#DB2777", "#CA8A04",
  "#1E4F9C", "#DC2626", "#059669", "#4F46E5", "#0D9488", "#EC4899"
];
const TRAIL_MAX_POINTS = 400;
const MAX_SEGMENT_SECONDS = 300;
const STOP_SPEED_THRESHOLD_MPS = 0.6;
const STOP_DISTANCE_THRESHOLD_M = 12;

const toText = (value) => String(value ?? "").trim();
const parseId = (value) => toText(value);
const formatDateInput = (value) => {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  if (!Number.isFinite(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const startOfDay = (value) => {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
  d.setHours(0, 0, 0, 0);
  return d;
};
const addDays = (value, days) => {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
  d.setDate(d.getDate() + Number(days || 0));
  return d;
};
const formatDateTime = (value) => {
  const d = new Date(value || Date.now());
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("es-PE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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
const formatDuration = (totalSeconds) => {
  const sec = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
const isValidCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
const haversineMeters = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const calcularEstadisticaDia = (rows) => {
  const points = Array.isArray(rows) ? rows : [];
  if (points.length === 0) return { totalPings: 0, distanciaKm: 0, tiempoCaminandoSec: 0, tiempoDetenidoSec: 0, inicio: null, fin: null };
  let distancia = 0;
  let caminando = 0;
  let detenido = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prevTime = new Date(points[i - 1].created_at).getTime();
    const currTime = new Date(points[i].created_at).getTime();
    if (!Number.isFinite(prevTime) || !Number.isFinite(currTime)) continue;
    const dt = Math.min(Math.floor((currTime - prevTime) / 1000), MAX_SEGMENT_SECONDS);
    if (dt <= 0) continue;
    const lat1 = Number(points[i - 1].lat);
    const lng1 = Number(points[i - 1].lng);
    const lat2 = Number(points[i].lat);
    const lng2 = Number(points[i].lng);
    if (!isValidCoord(lat1, lng1) || !isValidCoord(lat2, lng2)) continue;
    const dMeters = haversineMeters(lat1, lng1, lat2, lng2);
    const speed = dMeters / Math.max(1, dt);
    const isStop = speed <= STOP_SPEED_THRESHOLD_MPS || dMeters <= STOP_DISTANCE_THRESHOLD_M;
    if (isStop) detenido += dt;
    else {
      caminando += dt;
      distancia += dMeters;
    }
  }
  return {
    totalPings: points.length,
    distanciaKm: distancia / 1000,
    tiempoCaminandoSec: caminando,
    tiempoDetenidoSec: detenido,
    inicio: points[0]?.created_at || null,
    fin: points[points.length - 1]?.created_at || null,
  };
};
const colorForId = (value) => {
  const id = parseId(value);
  if (!id) return TRAIL_COLORS[0];
  let acc = 0;
  for (let i = 0; i < id.length; i += 1) acc = (acc + id.charCodeAt(i) * (i + 11)) % 997;
  return TRAIL_COLORS[acc % TRAIL_COLORS.length];
};
// El campo "avatar" ahora solo guarda un color (elegido en la app movil) --
// en el mapa siempre se dibuja una flecha de direccion, nunca un icono.
function esColorValido(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(toText(value));
}

// Nota: el recorrido ya llega filtrado/suavizado desde el origen (ver
// VolanteadorTrackingService.kt y VolanteadorTrackingAgent.js) -- se
// descartan lecturas de mala precision y "saltos" imposibles a pie, sin
// forzar la posicion a la calle mas cercana (eso es para vehiculos, no para
// alguien caminando que puede cortar por una vereda/plaza no mapeada).

const tableMissing = (err, tableName) => {
  const code = String(err?.code || "").trim();
  const msg = String(err?.message || "").toLowerCase();
  return code === "42P01" || msg.includes(String(tableName || "").toLowerCase());
};
const soloDigitos = (v) => String(v || "").replace(/\D/g, "");
const telefonoWhatsapp = (celular) => {
  const digits = soloDigitos(celular);
  if (!digits) return "";
  return digits.length === 9 ? `51${digits}` : digits;
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

export default function SeguimientoVolanteadoresPanel() {
  const mapCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const zonaPolygonsRef = useRef([]);
  const autoFitDoneRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  const [volanteadores, setVolanteadores] = useState([]);
  const [currentRows, setCurrentRows] = useState([]);
  const [statsDate, setStatsDate] = useState(() => startOfDay(new Date()));
  const [statsByVolanteador, setStatsByVolanteador] = useState({});
  const [trailById, setTrailById] = useState({});
  const [grupoFiltro, setGrupoFiltro] = useState("TODOS");
  const [selectedId, setSelectedId] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(() => new Date());

  const [zonasDisponibles, setZonasDisponibles] = useState([]); // todas las de zonas_cobertura
  const [zonasAsignadas, setZonasAsignadas] = useState([]); // asignadas al grupo+fecha actual (con datos de zonas_cobertura)
  const [zonaParaAsignar, setZonaParaAsignar] = useState("");
  const [asignandoZona, setAsignandoZona] = useState(false);

  const cargarVolanteadores = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("usuarios")
      .select("id,nombre,celular,activo,grupo_volanteo,alias_volanteo,avatar_volanteo")
      .eq("rol", "Volanteador")
      .eq("activo", true)
      .limit(2000);
    if (err) throw err;
    setVolanteadores(
      (Array.isArray(data) ? data : []).map((u) => ({
        id: parseId(u.id),
        nombre: toText(u.alias_volanteo) || toText(u.nombre) || parseId(u.id),
        celular: toText(u.celular),
        grupo: toText(u.grupo_volanteo) || "(sin grupo)",
        avatar: toText(u.avatar_volanteo),
      }))
    );
  }, []);

  // Zonas de cobertura ya importadas (ver "+ Agregar mapa de cobertura") --
  // se reutilizan como zonas asignables de volanteo, sin duplicar nada.
  const cargarZonasDisponibles = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("zonas_cobertura")
      .select("id,grupo,nombre,stroke_color,fill_color,fill_opacity,coordinates")
      .order("grupo").order("nombre");
    if (err) {
      if (tableMissing(err, "zonas_cobertura")) return;
      throw err;
    }
    setZonasDisponibles(Array.isArray(data) ? data : []);
  }, []);

  const cargarZonasAsignadas = useCallback(async (grupo, fecha) => {
    if (!grupo || grupo === "TODOS") { setZonasAsignadas([]); return; }
    const dia = formatDateInput(fecha);
    const { data, error: err } = await supabase
      .from("volanteo_zonas_asignadas")
      .select("id,zona_id,zonas_cobertura(id,grupo,nombre,stroke_color,fill_color,fill_opacity,coordinates)")
      .eq("grupo_volanteo", grupo)
      .eq("fecha", dia);
    if (err) {
      if (tableMissing(err, "volanteo_zonas_asignadas")) return;
      throw err;
    }
    setZonasAsignadas(
      (Array.isArray(data) ? data : [])
        .filter((row) => row.zonas_cobertura)
        .map((row) => ({ asignacionId: row.id, ...row.zonas_cobertura }))
    );
  }, []);

  const asignarZona = useCallback(async () => {
    if (!zonaParaAsignar || grupoFiltro === "TODOS") return;
    setAsignandoZona(true);
    try {
      const { error: err } = await supabase.from("volanteo_zonas_asignadas").insert({
        grupo_volanteo: grupoFiltro,
        fecha: formatDateInput(statsDate),
        zona_id: Number(zonaParaAsignar),
      });
      if (err) throw err;
      setZonaParaAsignar("");
      await cargarZonasAsignadas(grupoFiltro, statsDate);
    } catch (e) {
      setError(String(e?.message || "No se pudo asignar la zona."));
    } finally {
      setAsignandoZona(false);
    }
  }, [zonaParaAsignar, grupoFiltro, statsDate, cargarZonasAsignadas]);

  const quitarZonaAsignada = useCallback(async (asignacionId) => {
    const { error: err } = await supabase.from("volanteo_zonas_asignadas").delete().eq("id", asignacionId);
    if (!err) await cargarZonasAsignadas(grupoFiltro, statsDate);
  }, [grupoFiltro, statsDate, cargarZonasAsignadas]);

  const cargarPosicionesActuales = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("tecnico_ubicacion_actual")
      .select("*")
      .eq("tecnico_rol", "Volanteador")
      .limit(2000);
    if (err) {
      if (tableMissing(err, "tecnico_ubicacion_actual")) return;
      throw err;
    }
    setCurrentRows(Array.isArray(data) ? data : []);
  }, []);

  const cargarEstadisticasYRutas = useCallback(
    async (targetDate = statsDate) => {
      const ids = volanteadores.map((v) => v.id);
      if (ids.length === 0) {
        setStatsByVolanteador({});
        setTrailById({});
        return;
      }
      const start = startOfDay(targetDate);
      const end = addDays(start, 1);
      const { data, error: err } = await supabase
        .from("tecnico_ubicaciones")
        .select("tecnico_id,lat,lng,accuracy_m,created_at")
        .eq("tecnico_rol", "Volanteador")
        .in("tecnico_id", ids)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at", { ascending: true })
        .limit(50000);
      if (err) {
        if (tableMissing(err, "tecnico_ubicaciones")) return;
        throw err;
      }
      const grouped = {};
      (Array.isArray(data) ? data : []).forEach((row) => {
        const id = parseId(row.tecnico_id);
        if (!id) return;
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(row);
      });
      const stats = {};
      const trailsCrudos = {};
      Object.entries(grouped).forEach(([id, rows]) => {
        stats[id] = calcularEstadisticaDia(rows);
        const pts = rows
          .map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), accuracy_m: r.accuracy_m }))
          .filter((p) => isValidCoord(p.lat, p.lng));
        trailsCrudos[id] = pts.length > TRAIL_MAX_POINTS ? pts.slice(pts.length - TRAIL_MAX_POINTS) : pts;
      });
      setStatsByVolanteador(stats);
      setTrailById(trailsCrudos);
    },
    [volanteadores, statsDate]
  );

  const cargarTodo = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase no esta configurado.");
      setLoading(false);
      return;
    }
    setError("");
    try {
      await cargarVolanteadores();
      await cargarPosicionesActuales();
      await cargarZonasDisponibles();
      setLastSyncAt(new Date());
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar el seguimiento de volanteadores."));
    } finally {
      setLoading(false);
    }
  }, [cargarVolanteadores, cargarPosicionesActuales, cargarZonasDisponibles]);

  useEffect(() => {
    void cargarTodo();
  }, [cargarTodo]);

  useEffect(() => {
    void cargarZonasAsignadas(grupoFiltro, statsDate);
  }, [grupoFiltro, statsDate, cargarZonasAsignadas]);

  useEffect(() => {
    if (volanteadores.length > 0) void cargarEstadisticasYRutas(statsDate);
  }, [volanteadores, statsDate, cargarEstadisticasYRutas]);

  // Realtime: apenas alguien manda un ping, se refresca su posicion actual.
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    const channel = supabase
      .channel("volanteadores_admin_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tecnico_ubicacion_actual", filter: "tecnico_rol=eq.Volanteador" },
        () => void cargarPosicionesActuales()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [cargarPosicionesActuales]);

  // Respaldo por si el canal en tiempo real se corta -- sin esto el marcador
  // se quedaba congelado mientras la ruta trazada si seguia avanzando (esa
  // se recarga por consulta directa, no por realtime).
  useEffect(() => {
    const id = setInterval(() => void cargarPosicionesActuales(), 20000);
    return () => clearInterval(id);
  }, [cargarPosicionesActuales]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await cargarPosicionesActuales();
      await cargarEstadisticasYRutas(statsDate);
      setLastSyncAt(new Date());
    } catch (e) {
      setError(String(e?.message || "No se pudo actualizar."));
    } finally {
      setRefreshing(false);
    }
  }, [cargarPosicionesActuales, cargarEstadisticasYRutas, statsDate]);

  const grupos = useMemo(() => {
    const set = new Set(volanteadores.map((v) => v.grupo));
    return ["TODOS", ...Array.from(set).sort()];
  }, [volanteadores]);

  const volanteadoresVisibles = useMemo(() => {
    if (grupoFiltro === "TODOS") return volanteadores;
    return volanteadores.filter((v) => v.grupo === grupoFiltro);
  }, [volanteadores, grupoFiltro]);

  const currentById = useMemo(() => {
    const map = {};
    currentRows.forEach((row) => {
      map[parseId(row.tecnico_id)] = row;
    });
    return map;
  }, [currentRows]);

  const filas = useMemo(() => {
    return volanteadoresVisibles
      .map((v) => {
        const pos = currentById[v.id];
        const stats = statsByVolanteador[v.id] || null;
        const staleMin = pos ? Math.floor((Date.now() - new Date(pos.updated_at).getTime()) / 60000) : Infinity;
        return { ...v, pos, stats, staleMin };
      })
      .sort((a, b) => {
        const ta = a.pos ? new Date(a.pos.updated_at).getTime() : 0;
        const tb = b.pos ? new Date(b.pos.updated_at).getTime() : 0;
        return tb - ta;
      });
  }, [volanteadoresVisibles, currentById, statsByVolanteador]);

  // Color unico por persona dentro del grupo filtrado: se asigna por
  // posicion en una lista ordenada por id (estable entre refrescos), no por
  // hash, para que nunca dos compañeros del mismo grupo compartan color.
  const colorMap = useMemo(() => {
    const idsOrdenados = [...filas.map((f) => f.id)].sort();
    const map = {};
    idsOrdenados.forEach((id, i) => {
      map[id] = TRAIL_COLORS[i % TRAIL_COLORS.length];
    });
    return map;
  }, [filas]);
  const colorDe = useCallback((id) => colorMap[parseId(id)] || TRAIL_COLORS[0], [colorMap]);

  const kpi = useMemo(() => {
    const enLinea = filas.filter((f) => f.pos && f.staleMin <= 20).length;
    const kmTotal = filas.reduce((acc, f) => acc + Number(f.stats?.distanciaKm || 0), 0);
    const gruposActivos = new Set(filas.filter((f) => f.pos && f.staleMin <= 20).map((f) => f.grupo)).size;
    return { total: filas.length, enLinea, kmTotal, gruposActivos };
  }, [filas]);

  const selectedRow = useMemo(
    () => filas.find((f) => f.id === selectedId) || filas.find((f) => f.pos) || filas[0] || null,
    [filas, selectedId]
  );

  const marcadores = filas.filter((f) => f.pos && isValidCoord(Number(f.pos.lat), Number(f.pos.lng)));

  const fitMap = useCallback(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const coords = marcadores.map((f) => ({ lat: Number(f.pos.lat), lng: Number(f.pos.lng) }));
    if (coords.length === 0) return;
    if (coords.length === 1) {
      mapRef.current.panTo(coords[0]);
      mapRef.current.setZoom(16);
      return;
    }
    const bounds = new mapsRef.current.LatLngBounds();
    coords.forEach((p) => bounds.extend(p));
    mapRef.current.fitBounds(bounds);
  }, [marcadores]);

  const centrar = useCallback((row) => {
    if (!mapRef.current || !row?.pos) return;
    setSelectedId(row.id);
    mapRef.current.panTo({ lat: Number(row.pos.lat), lng: Number(row.pos.lng) });
    mapRef.current.setZoom(17);
  }, []);

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
            center: DEFAULT_CENTER,
            zoom: 13,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
            gestureHandling: "greedy",
          });
        }
        setMapReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setMapError(String(e?.message || "No se pudo cargar Google Maps."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    markersRef.current.forEach((m) => m.setMap(null));
    polylinesRef.current.forEach((l) => l.setMap(null));
    markersRef.current = [];
    polylinesRef.current = [];

    const visibleIds = new Set(filas.map((f) => f.id));
    Object.entries(trailById).forEach(([id, pts]) => {
      if (!visibleIds.has(id) || pts.length < 2) return;
      const line = new maps.Polyline({ map, path: pts, strokeColor: colorDe(id), strokeOpacity: 0.9, strokeWeight: 4 });
      polylinesRef.current.push(line);
    });

    marcadores.forEach((f) => {
      const lat = Number(f.pos.lat);
      const lng = Number(f.pos.lng);
      const heading = Number(f.pos.heading);
      const rumbo = Number.isFinite(heading) && heading >= 0 ? heading : 0;
      const color = esColorValido(f.avatar) ? f.avatar : colorDe(f.id);
      // Flecha de direccion (como el puntero de navegacion de Google Maps)
      // rotada segun el rumbo GPS — siempre se ve completa porque es un
      // simbolo vectorial, no una imagen recortada.
      const icon = {
        path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: f.id === selectedId ? 7.5 : 6,
        rotation: rumbo,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 1.6,
      };
      const marker = new maps.Marker({
        map,
        position: { lat, lng },
        title: `${f.nombre} — ${f.grupo}`,
        opacity: f.staleMin > 20 ? 0.55 : 1,
        icon,
        zIndex: f.id === selectedId ? 999 : 1,
      });
      marker.addListener("click", () => setSelectedId(f.id));
      markersRef.current.push(marker);
    });

    if (!selectedId && filas.length > 0) setSelectedId(filas[0].id);
    if (marcadores.length > 0 && !autoFitDoneRef.current) {
      fitMap();
      autoFitDoneRef.current = true;
    }
  }, [filas, trailById, marcadores, selectedId, fitMap]);

  // Zona(s) de volanteo asignadas al grupo/fecha filtrado -- se dibujan como
  // el contorno/relleno que ya traen desde zonas_cobertura.
  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;
    zonaPolygonsRef.current.forEach((p) => p.setMap(null));
    zonaPolygonsRef.current = [];
    zonasAsignadas.forEach((z) => {
      const path = (Array.isArray(z.coordinates) ? z.coordinates : [])
        .map((c) => ({ lat: Number(c.lat), lng: Number(c.lng) }))
        .filter((c) => isValidCoord(c.lat, c.lng));
      if (path.length < 3) return;
      const polygon = new maps.Polygon({
        map: mapRef.current,
        paths: path,
        strokeColor: z.stroke_color || "#2563eb",
        strokeOpacity: 0.9,
        strokeWeight: 2.5,
        fillColor: z.fill_color || "#2563eb",
        fillOpacity: Number(z.fill_opacity ?? 0.2),
        zIndex: 0,
      });
      zonaPolygonsRef.current.push(polygon);
    });
  }, [zonasAsignadas]);

  const exportarKml = useCallback(() => {
    const conRuta = Object.entries(trailById).filter(([id, pts]) => filas.some((f) => f.id === id) && pts.length > 1);
    if (conRuta.length === 0) return;
    const placemarks = conRuta
      .map(([id, pts]) => {
        const nombre = filas.find((f) => f.id === id)?.nombre || id;
        const coords = pts.map((p) => `${p.lng},${p.lat},0`).join(" ");
        return `<Placemark><name>${nombre}</name><LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>`;
      })
      .join("\n");
    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Volanteo ${formatDateInput(statsDate)}</name>${placemarks}</Document></kml>`;
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `volanteo_${grupoFiltro}_${formatDateInput(statsDate)}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [trailById, filas, statsDate, grupoFiltro]);

  const compartirResumenWhatsapp = useCallback(() => {
    const texto = [
      `📍 Volanteo — ${grupoFiltro === "TODOS" ? "todos los grupos" : grupoFiltro} — ${formatDateInput(statsDate)}`,
      `Volanteadores: ${kpi.total} | En linea: ${kpi.enLinea}`,
      `Km recorridos (equipo): ${kpi.kmTotal.toFixed(2)} km`,
      ``,
      ...filas.map((f) => `• ${f.nombre}: ${Number(f.stats?.distanciaKm || 0).toFixed(2)} km`),
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  }, [grupoFiltro, statsDate, kpi, filas]);

  const fallbackQuery = selectedRow?.pos
    ? `${Number(selectedRow.pos.lat).toFixed(6)}, ${Number(selectedRow.pos.lng).toFixed(6)}`
    : `${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng}`;

  if (!isSupabaseConfigured) {
    return (
      <section className="panel">
        <h2>Seguimiento de volanteadores</h2>
        <p className="warn-text">Supabase no esta configurado.</p>
      </section>
    );
  }

  return (
    <section className="panel maptech-panel">
      <div className="panel-toolbar">
        <h2>Seguimiento de volanteadores</h2>
        <button type="button" className="secondary-btn small" onClick={() => void onRefresh()} disabled={refreshing || loading}>
          {refreshing || loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
      <p className="panel-meta">Ultima sincronizacion: {formatDateTime(lastSyncAt)}</p>

      {error ? <p className="warn-text">{error}</p> : null}
      {mapError ? <p className="warn-text">{mapError}</p> : null}

      <div className="orders-kpi-grid">
        <article className="orders-kpi-card">
          <span>Volanteadores</span>
          <strong>{kpi.total}</strong>
        </article>
        <article className="orders-kpi-card">
          <span>En linea ahora</span>
          <strong>{kpi.enLinea}</strong>
        </article>
        <article className="orders-kpi-card">
          <span>Km recorridos hoy (equipo)</span>
          <strong>{kpi.kmTotal.toFixed(2)} km</strong>
        </article>
        <article className="orders-kpi-card">
          <span>Grupos activos</span>
          <strong>{kpi.gruposActivos}</strong>
        </article>
      </div>

      <div className="maptech-controls">
        <div className="maptech-actions">
          <select value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)}>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {g === "TODOS" ? "Todos los grupos" : g}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={formatDateInput(statsDate)}
            onChange={(e) => {
              const raw = toText(e.target.value);
              if (!raw) return;
              const next = new Date(`${raw}T00:00:00`);
              if (!Number.isNaN(next.getTime())) setStatsDate(startOfDay(next));
            }}
          />
          <button type="button" className="secondary-btn small" onClick={() => setStatsDate(startOfDay(new Date()))}>
            Hoy
          </button>
          <button type="button" className="secondary-btn small" onClick={() => setStatsDate((prev) => startOfDay(addDays(prev, -1)))}>
            Ayer
          </button>
          <button type="button" className="secondary-btn small" onClick={() => setStatsDate((prev) => startOfDay(addDays(prev, 1)))}>
            Mañana
          </button>
          <button type="button" className="secondary-btn small" onClick={fitMap}>
            Ajustar mapa
          </button>
        </div>
      </div>

      {grupoFiltro !== "TODOS" && (
        <div
          style={{
            display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
            background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 14px",
          }}
        >
          <strong style={{ fontSize: 13, color: "#1E40AF" }}>
            Zona a cubrir por "{grupoFiltro}" el {formatDateInput(statsDate)}:
          </strong>
          {zonasAsignadas.length === 0 ? (
            <span style={{ fontSize: 12, color: "#64748B" }}>Sin zona asignada.</span>
          ) : (
            zonasAsignadas.map((z) => (
              <span
                key={z.asignacionId}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                  color: "#fff", background: z.stroke_color || "#2563eb", borderRadius: 999, padding: "4px 10px",
                }}
              >
                {z.grupo} · {z.nombre}
                <button
                  type="button"
                  onClick={() => quitarZonaAsignada(z.asignacionId)}
                  style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontWeight: 700, padding: 0 }}
                  title="Quitar zona"
                >
                  ✕
                </button>
              </span>
            ))
          )}
          <select value={zonaParaAsignar} onChange={(e) => setZonaParaAsignar(e.target.value)} style={{ marginLeft: "auto" }}>
            <option value="">Elegir zona importada...</option>
            {zonasDisponibles.map((z) => (
              <option key={z.id} value={z.id}>{z.grupo} · {z.nombre}</option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-btn small"
            onClick={asignarZona}
            disabled={!zonaParaAsignar || asignandoZona}
          >
            {asignandoZona ? "Asignando..." : "+ Asignar"}
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          background: "#FFF7ED",
          border: "1px solid #FED7AA",
          borderRadius: 10,
          padding: "10px 14px",
        }}
      >
        <strong style={{ fontSize: 13, color: "#9A3412" }}>
          Recorrido de {grupoFiltro === "TODOS" ? "todos los grupos" : `"${grupoFiltro}"`} — {formatDateInput(statsDate)}:
        </strong>
        <button
          type="button"
          onClick={exportarKml}
          style={{ background: "#1E4F9C", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          ⬇ Descargar rutas del equipo (KML)
        </button>
        <button
          type="button"
          onClick={compartirResumenWhatsapp}
          style={{ background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          📤 Compartir resumen del equipo por WhatsApp
        </button>
      </div>

      <div className="maptech-map-card">
        <div ref={mapCanvasRef} className="google-map-canvas maptech-map-canvas" />
        {!mapReady || mapError ? (
          <div className="map-fallback">
            <p>{mapError || "Cargando mapa..."}</p>
            <iframe title="Mapa volanteo fallback" src={`https://www.google.com/maps?q=${encodeURIComponent(fallbackQuery)}&z=15&output=embed`} loading="lazy" />
          </div>
        ) : null}
        {selectedRow ? (
          <article className="maptech-detail">
            <div className="maptech-detail-head">
              <span
                style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  background: esColorValido(selectedRow.avatar) ? selectedRow.avatar : colorDe(selectedRow.id),
                  border: "2px solid #fff", boxShadow: "0 0 0 1px #E5E7EB",
                }}
              />
              <strong>{selectedRow.nombre}</strong>
              <span className={`orders-status ${selectedRow.pos && selectedRow.staleMin <= 20 ? "ok" : "warn"}`}>
                {selectedRow.pos ? (selectedRow.staleMin <= 20 ? "En linea" : "Desactualizado") : "Sin ubicacion hoy"}
              </span>
            </div>
            <p>Grupo: {selectedRow.grupo}</p>
            {selectedRow.pos ? (
              <>
                <p>Actualizado: {formatDateTime(selectedRow.pos.updated_at)} (hace {formatAgo(selectedRow.pos.updated_at)})</p>
              </>
            ) : null}
            <p>Recorrido hoy: {Number(selectedRow.stats?.distanciaKm || 0).toFixed(2)} km</p>
            <p>Tiempo caminando: {formatDuration(selectedRow.stats?.tiempoCaminandoSec)}</p>
            <p>Tiempo detenido: {formatDuration(selectedRow.stats?.tiempoDetenidoSec)}</p>
            <div className="maptech-detail-actions">
              {selectedRow.pos ? (
                <button type="button" className="primary-btn small" onClick={() => centrar(selectedRow)}>
                  Centrar
                </button>
              ) : null}
              {selectedRow.celular ? (
                <>
                  <button type="button" className="secondary-btn small" onClick={() => window.open(`tel:${selectedRow.celular}`, "_self")}>
                    📞 Llamar
                  </button>
                  <button
                    type="button"
                    className="secondary-btn small"
                    onClick={() => window.open(`https://wa.me/${telefonoWhatsapp(selectedRow.celular)}`, "_blank", "noopener,noreferrer")}
                  >
                    💬 WhatsApp
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ) : null}
      </div>

      <section className="maptech-list-card">
        <h3>Volanteadores ({filas.length})</h3>
        <div className="maptech-list">
          {filas.length === 0 ? (
            <p className="empty">No hay volanteadores para este filtro.</p>
          ) : (
            filas.map((f) => (
              <div
                key={f.id}
                className={f.id === selectedId ? "maptech-row active" : "maptech-row"}
                style={{ cursor: "pointer" }}
                onClick={() => (f.pos ? centrar(f) : setSelectedId(f.id))}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                      background: esColorValido(f.avatar) ? f.avatar : colorDe(f.id),
                      border: "2px solid #fff", boxShadow: "0 0 0 1px #E5E7EB",
                    }}
                  />
                  <p className="maptech-row-title" style={{ margin: 0 }}>
                    {f.nombre} <span style={{ fontWeight: 400, color: "#9CA3AF", fontSize: 12 }}>· {f.grupo}</span>
                  </p>
                </div>
                <p className="maptech-row-meta">
                  {f.pos ? `Ultimo ping: ${formatDateTime(f.pos.updated_at)} (${formatAgo(f.pos.updated_at)})` : "Sin ubicacion hoy."}
                </p>
                <p className="maptech-row-meta">
                  Recorrido: {Number(f.stats?.distanciaKm || 0).toFixed(2)} km | Caminando: {formatDuration(f.stats?.tiempoCaminandoSec)} | Detenido:{" "}
                  {formatDuration(f.stats?.tiempoDetenidoSec)}
                </p>
                {f.celular ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button
                      type="button"
                      className="secondary-btn small"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`tel:${f.celular}`, "_self");
                      }}
                    >
                      📞 Llamar
                    </button>
                    <button
                      type="button"
                      className="secondary-btn small"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`https://wa.me/${telefonoWhatsapp(f.celular)}`, "_blank", "noopener,noreferrer");
                      }}
                    >
                      💬 WhatsApp
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
