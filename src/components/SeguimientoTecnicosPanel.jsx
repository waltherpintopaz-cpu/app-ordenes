import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
const TRAIL_COLORS = ["#1E4F9C", "#F47A20", "#00C853", "#EC4899", "#0EA5E9", "#7C3AED"];
const TRAIL_WINDOW_HOURS = 2;
const TRAIL_MAX_POINTS = 240;
const AUTO_REFRESH_MS = 60_000;
const MAX_SEGMENT_SECONDS = 300;
const STOP_SPEED_THRESHOLD_MPS = 0.8;
const STOP_DISTANCE_THRESHOLD_M = 15;

const toText = (value) => String(value ?? "").trim();
const parseTecnicoId = (value) => toText(value);
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
  return d.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const formatAgo = (value) => {
  const d = new Date(value || Date.now());
  if (!Number.isFinite(d.getTime())) return "-";
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
};
const formatDuration = (totalSeconds) => {
  const sec = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};
const isValidCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
const haversineMeters = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
const calcularEstadisticaDia = (rows) => {
  const points = Array.isArray(rows) ? rows : [];
  if (points.length === 0) {
    return {
      totalPings: 0,
      distanciaKm: 0,
      detenidoSec: 0,
      moviendoSec: 0,
      velocidadPromKmh: 0,
      velocidadMaxKmh: 0,
      trayectos: 0,
      inicio: null,
      fin: null,
    };
  }

  let distancia = 0;
  let detenido = 0;
  let moviendo = 0;
  let velocidadMaxMps = 0;
  let trayectos = 0;
  let tramoEnMovimiento = false;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const prevTime = new Date(prev.created_at).getTime();
    const currTime = new Date(curr.created_at).getTime();
    if (!Number.isFinite(prevTime) || !Number.isFinite(currTime)) continue;
    const rawDt = Math.floor((currTime - prevTime) / 1000);
    if (!Number.isFinite(rawDt) || rawDt <= 0) continue;
    const dt = Math.min(rawDt, MAX_SEGMENT_SECONDS);

    const lat1 = Number(prev.lat);
    const lng1 = Number(prev.lng);
    const lat2 = Number(curr.lat);
    const lng2 = Number(curr.lng);
    if (!isValidCoord(lat1, lng1) || !isValidCoord(lat2, lng2)) continue;

    const dMeters = haversineMeters(lat1, lng1, lat2, lng2);
    const speedFromRow = Number(curr.speed_mps);
    const speed = Number.isFinite(speedFromRow) && speedFromRow >= 0 ? speedFromRow : dMeters / Math.max(1, dt);
    if (Number.isFinite(speed) && speed > velocidadMaxMps) velocidadMaxMps = speed;
    const isStop = speed <= STOP_SPEED_THRESHOLD_MPS || dMeters <= STOP_DISTANCE_THRESHOLD_M;

    if (isStop) {
      detenido += dt;
      tramoEnMovimiento = false;
    } else {
      moviendo += dt;
      distancia += dMeters;
      if (!tramoEnMovimiento) {
        trayectos += 1;
        tramoEnMovimiento = true;
      }
    }
  }

  const distanciaKm = distancia / 1000;
  const velocidadPromKmh = moviendo > 0 ? distanciaKm / (moviendo / 3600) : 0;
  return {
    totalPings: points.length,
    distanciaKm,
    detenidoSec: detenido,
    moviendoSec: moviendo,
    velocidadPromKmh,
    velocidadMaxKmh: velocidadMaxMps * 3.6,
    trayectos,
    inicio: points[0]?.created_at || null,
    fin: points[points.length - 1]?.created_at || null,
  };
};
const colorForTechId = (value) => {
  const id = parseTecnicoId(value);
  if (!id) return TRAIL_COLORS[0];
  let acc = 0;
  for (let i = 0; i < id.length; i += 1) acc = (acc + id.charCodeAt(i) * (i + 11)) % 997;
  return TRAIL_COLORS[acc % TRAIL_COLORS.length];
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

export default function SeguimientoTecnicosPanel({ sessionUser, rolSesion }) {
  const mapCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const autoFitDoneRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [mapType, setMapType] = useState("roadmap");
  const [showMovement, setShowMovement] = useState(true);

  const [techUsers, setTechUsers] = useState([]);
  const [configByTech, setConfigByTech] = useState({});
  const [currentRows, setCurrentRows] = useState([]);
  const [trailByTech, setTrailByTech] = useState({});
  const [trailLoading, setTrailLoading] = useState(false);
  const [selectedMapTechIds, setSelectedMapTechIds] = useState([]);
  const [selectedTechId, setSelectedTechId] = useState("");
  const [statsDate, setStatsDate] = useState(() => startOfDay(new Date()));
  const [statsTechId, setStatsTechId] = useState("");
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");

  const _esAdmin = rolSesion === "Administrador";
  const esTecnico = rolSesion === "Tecnico";
  const tecnicoIdSesion = parseTecnicoId(sessionUser?.id);
  const tecnicoNombreSesion = toText(sessionUser?.nombre || sessionUser?.username || tecnicoIdSesion);

  const clearOverlays = useCallback(() => {
    markersRef.current.forEach((marker) => {
      try {
        marker.setMap(null);
      } catch {
        // noop
      }
    });
    polylinesRef.current.forEach((line) => {
      try {
        line.setMap(null);
      } catch {
        // noop
      }
    });
    markersRef.current = [];
    polylinesRef.current = [];
  }, []);

  const upsertCurrentLocal = useCallback((row) => {
    const id = parseTecnicoId(row?.tecnico_id);
    if (!id) return;
    setCurrentRows((prev) => {
      const idx = prev.findIndex((item) => parseTecnicoId(item?.tecnico_id) === id);
      if (idx === -1) return [row, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], ...row };
      return next;
    });
  }, []);

  const removeCurrentLocal = useCallback((techIdRaw) => {
    const id = parseTecnicoId(techIdRaw);
    if (!id) return;
    setCurrentRows((prev) => prev.filter((item) => parseTecnicoId(item?.tecnico_id) !== id));
  }, []);

  const cargarUbicacionActual = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("tecnico_ubicacion_actual")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(400);
    if (fetchError) throw fetchError;
    setCurrentRows(Array.isArray(data) ? data : []);
  }, []);

  const cargarConfigYTecnicos = useCallback(async () => {
    const { data: usuariosData, error: usuariosError } = await supabase
      .from("usuarios")
      .select("id,nombre,rol,activo")
      .eq("activo", true)
      .limit(2000);
    if (usuariosError) throw usuariosError;

    const tecnicos = (Array.isArray(usuariosData) ? usuariosData : [])
      .filter((row) => toText(row?.rol).toLowerCase().includes("tecnico"))
      .map((row) => ({
        id: parseTecnicoId(row?.id),
        nombre: toText(row?.nombre || row?.id),
      }))
      .filter((row) => row.id);
    setTechUsers(tecnicos);

    let mapCfg = {};
    const cfgRes = await supabase.from("tecnico_seguimiento_config").select("*").limit(2000);
    if (cfgRes.error) {
      if (!tableMissing(cfgRes.error, "tecnico_seguimiento_config")) throw cfgRes.error;
      setWarning("Tabla tecnico_seguimiento_config no existe. Mostrando seguimiento sin configuracion.");
    } else {
      (Array.isArray(cfgRes.data) ? cfgRes.data : []).forEach((row) => {
        const id = parseTecnicoId(row?.tecnico_id);
        if (!id) return;
        mapCfg[id] = {
          tecnico_id: id,
          tecnico_nombre: toText(row?.tecnico_nombre),
          habilitado: Boolean(row?.habilitado),
          modo_turno: row?.modo_turno === "auto" ? "auto" : "manual",
        };
      });
    }

    tecnicos.forEach((tecnico) => {
      if (!mapCfg[tecnico.id]) {
        mapCfg[tecnico.id] = {
          tecnico_id: tecnico.id,
          tecnico_nombre: tecnico.nombre,
          habilitado: true,
          modo_turno: "manual",
        };
      }
    });
    setConfigByTech(mapCfg);

    setSelectedMapTechIds((prev) => {
      if (esTecnico && tecnicoIdSesion) return [tecnicoIdSesion];
      if (Array.isArray(prev) && prev.length > 0) {
        const valid = prev.filter((id) => tecnicos.some((t) => t.id === id));
        if (valid.length > 0) return valid;
      }
      const habilitados = tecnicos.filter((t) => mapCfg[t.id]?.habilitado).map((t) => t.id);
      if (habilitados.length > 0) return habilitados;
      return tecnicos.map((t) => t.id);
    });
  }, [esTecnico, tecnicoIdSesion]);

  const idsObjetivoTraza = useMemo(() => {
    if (esTecnico && tecnicoIdSesion) return [tecnicoIdSesion];
    return (Array.isArray(selectedMapTechIds) ? selectedMapTechIds : []).map((id) => parseTecnicoId(id)).filter(Boolean);
  }, [esTecnico, tecnicoIdSesion, selectedMapTechIds]);
  const filterKey = useMemo(() => {
    if (esTecnico && tecnicoIdSesion) return `tec:${tecnicoIdSesion}`;
    const ids = (Array.isArray(selectedMapTechIds) ? selectedMapTechIds : []).map((id) => parseTecnicoId(id)).filter(Boolean).sort();
    return `sel:${ids.join(",")}`;
  }, [esTecnico, tecnicoIdSesion, selectedMapTechIds]);

  const cargarTrayectorias = useCallback(async () => {
    if (!showMovement) return;
    if (idsObjetivoTraza.length === 0) {
      setTrailByTech({});
      return;
    }
    setTrailLoading(true);
    try {
      const desde = new Date(Date.now() - TRAIL_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const res = await supabase
        .from("tecnico_ubicaciones")
        .select("tecnico_id,lat,lng,created_at")
        .in("tecnico_id", idsObjetivoTraza)
        .gte("created_at", desde)
        .order("created_at", { ascending: true })
        .limit(12000);
      if (res.error) {
        if (tableMissing(res.error, "tecnico_ubicaciones")) {
          setWarning("Tabla tecnico_ubicaciones no existe. La traza de movimiento no esta disponible.");
          setTrailByTech({});
          return;
        }
        throw res.error;
      }

      const grouped = {};
      (Array.isArray(res.data) ? res.data : []).forEach((row) => {
        const id = parseTecnicoId(row?.tecnico_id);
        const lat = Number(row?.lat);
        const lng = Number(row?.lng);
        if (!id || !isValidCoord(lat, lng)) return;
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push({ lat, lng, created_at: row?.created_at || null });
      });
      Object.keys(grouped).forEach((id) => {
        if (grouped[id].length > TRAIL_MAX_POINTS) {
          grouped[id] = grouped[id].slice(grouped[id].length - TRAIL_MAX_POINTS);
        }
      });
      setTrailByTech(grouped);
    } finally {
      setTrailLoading(false);
    }
  }, [showMovement, idsObjetivoTraza]);

  const cargarEstadistica = useCallback(
    async (targetTechId = statsTechId, targetDate = statsDate) => {
      const techId = parseTecnicoId(targetTechId);
      if (!techId) {
        setStatsData(null);
        setStatsError("");
        return;
      }
      setStatsLoading(true);
      setStatsError("");
      try {
        const start = startOfDay(targetDate);
        const end = addDays(start, 1);
        const res = await supabase
          .from("tecnico_ubicaciones")
          .select("lat,lng,speed_mps,created_at")
          .eq("tecnico_id", techId)
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: true })
          .limit(20000);
        if (res.error) {
          if (tableMissing(res.error, "tecnico_ubicaciones")) {
            setWarning("Tabla tecnico_ubicaciones no existe. No se puede calcular estadisticas diarias.");
            setStatsData(null);
            return;
          }
          throw res.error;
        }
        const rows = Array.isArray(res.data) ? res.data : [];
        setStatsData(calcularEstadisticaDia(rows));
      } catch (e) {
        setStatsData(null);
        setStatsError(String(e?.message || "No se pudo cargar estadistica diaria."));
      } finally {
        setStatsLoading(false);
      }
    },
    [statsTechId, statsDate]
  );

  const cargarTodo = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase no esta configurado.");
      setLoading(false);
      return;
    }
    setError("");
    setWarning("");
    try {
      await Promise.all([cargarConfigYTecnicos(), cargarUbicacionActual()]);
      if (showMovement) await cargarTrayectorias();
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar seguimiento tecnico."));
    } finally {
      setLoading(false);
    }
  }, [cargarConfigYTecnicos, cargarUbicacionActual, cargarTrayectorias, showMovement]);

  const onRefresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setRefreshing(true);
    setError("");
    try {
      await Promise.all([
        cargarUbicacionActual(),
        showMovement ? cargarTrayectorias() : Promise.resolve(),
        cargarEstadistica(statsTechId, statsDate),
      ]);
    } catch (e) {
      setError(String(e?.message || "No se pudo actualizar seguimiento."));
    } finally {
      setRefreshing(false);
    }
  }, [cargarUbicacionActual, cargarTrayectorias, showMovement, cargarEstadistica, statsTechId, statsDate]);

  useEffect(() => {
    void cargarTodo();
  }, [cargarTodo]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    const channel = supabase
      .channel("tracking-web-current-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tecnico_ubicacion_actual" }, (payload) => {
        const eventType = payload?.eventType;
        if (eventType === "DELETE") {
          removeCurrentLocal(payload?.old?.tecnico_id);
          return;
        }
        const row = payload?.new;
        if (!row) return;
        upsertCurrentLocal(row);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [removeCurrentLocal, upsertCurrentLocal]);

  useEffect(() => {
    if (!showMovement) return;
    void cargarTrayectorias();
  }, [showMovement, idsObjetivoTraza, cargarTrayectorias]);

  useEffect(() => {
    if (!statsTechId) return;
    void cargarEstadistica(statsTechId, statsDate);
  }, [statsTechId, statsDate, cargarEstadistica]);

  useEffect(() => {
    if (!selectedTechId) return;
    if (esTecnico) return;
    if (parseTecnicoId(selectedTechId) !== parseTecnicoId(statsTechId)) {
      setStatsTechId(parseTecnicoId(selectedTechId));
    }
  }, [selectedTechId, statsTechId, esTecnico]);

  useEffect(() => {
    autoFitDoneRef.current = false;
  }, [filterKey]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    const timer = setInterval(() => {
      void cargarUbicacionActual();
      if (showMovement) void cargarTrayectorias();
      if (statsTechId) void cargarEstadistica(statsTechId, statsDate);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [cargarUbicacionActual, cargarTrayectorias, showMovement, cargarEstadistica, statsTechId, statsDate]);

  const techById = useMemo(() => {
    const map = {};
    (Array.isArray(techUsers) ? techUsers : []).forEach((row) => {
      map[row.id] = row;
    });
    return map;
  }, [techUsers]);

  const techOptions = useMemo(() => {
    const setIds = new Set();
    const rows = [];
    (Array.isArray(techUsers) ? techUsers : []).forEach((u) => {
      const id = parseTecnicoId(u?.id);
      if (!id || setIds.has(id)) return;
      setIds.add(id);
      rows.push({
        id,
        nombre: toText(u?.nombre || id),
        habilitado: Boolean(configByTech[id]?.habilitado),
      });
    });
    (Array.isArray(currentRows) ? currentRows : []).forEach((row) => {
      const id = parseTecnicoId(row?.tecnico_id);
      if (!id || setIds.has(id)) return;
      setIds.add(id);
      rows.push({
        id,
        nombre: toText(row?.tecnico_nombre || configByTech[id]?.tecnico_nombre || id),
        habilitado: Boolean(configByTech[id]?.habilitado ?? true),
      });
    });
    return rows.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [techUsers, currentRows, configByTech]);

  useEffect(() => {
    if (esTecnico && tecnicoIdSesion) {
      if (statsTechId !== tecnicoIdSesion) setStatsTechId(tecnicoIdSesion);
      return;
    }
    const ids = techOptions.map((t) => t.id);
    if (ids.length === 0) {
      if (statsTechId) setStatsTechId("");
      return;
    }
    if (!ids.includes(statsTechId)) {
      setStatsTechId(ids[0]);
    }
  }, [esTecnico, tecnicoIdSesion, statsTechId, techOptions]);

  const ubicacionesVisibles = useMemo(() => {
    const base = (Array.isArray(currentRows) ? currentRows : []).filter((row) =>
      isValidCoord(Number(row?.lat), Number(row?.lng))
    );
    if (esTecnico && tecnicoIdSesion) {
      return base.filter((row) => parseTecnicoId(row?.tecnico_id) === tecnicoIdSesion);
    }
    const selected = new Set((Array.isArray(selectedMapTechIds) ? selectedMapTechIds : []).map((id) => parseTecnicoId(id)));
    if (selected.size === 0) return base;
    return base.filter((row) => selected.has(parseTecnicoId(row?.tecnico_id)));
  }, [currentRows, esTecnico, tecnicoIdSesion, selectedMapTechIds]);

  const trailPolylines = useMemo(() => {
    if (!showMovement) return [];
    const visibles = new Set(ubicacionesVisibles.map((row) => parseTecnicoId(row?.tecnico_id)).filter(Boolean));
    return Object.entries(trailByTech || {})
      .filter(([id, pts]) => visibles.has(parseTecnicoId(id)) && Array.isArray(pts) && pts.length > 1)
      .map(([id, pts]) => ({
        tecnico_id: parseTecnicoId(id),
        color: colorForTechId(id),
        points: pts.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })),
      }));
  }, [showMovement, trailByTech, ubicacionesVisibles]);

  const rowsList = useMemo(() => {
    return [...ubicacionesVisibles]
      .map((row) => {
        const id = parseTecnicoId(row?.tecnico_id);
        const label =
          toText(row?.tecnico_nombre) ||
          toText(configByTech[id]?.tecnico_nombre) ||
          toText(techById[id]?.nombre) ||
          id;
        const speedMps = Number(row?.speed_mps);
        const speedKmh = Number.isFinite(speedMps) && speedMps >= 0 ? speedMps * 3.6 : null;
        const staleMin = Math.floor((Date.now() - new Date(row?.updated_at || Date.now()).getTime()) / 60000);
        return {
          ...row,
          tecnico_id: id,
          tecnico_label: label,
          speedKmh,
          staleMin,
        };
      })
      .sort((a, b) => {
        const ta = Number.isNaN(new Date(a?.updated_at).getTime()) ? 0 : new Date(a.updated_at).getTime();
        const tb = Number.isNaN(new Date(b?.updated_at).getTime()) ? 0 : new Date(b.updated_at).getTime();
        return tb - ta;
      });
  }, [ubicacionesVisibles, configByTech, techById]);

  const selectedRow = useMemo(
    () => rowsList.find((row) => parseTecnicoId(row?.tecnico_id) === parseTecnicoId(selectedTechId)) || rowsList[0] || null,
    [rowsList, selectedTechId]
  );
  const selectedStatsTechName = useMemo(() => {
    const id = parseTecnicoId(statsTechId);
    if (!id) return "-";
    if (esTecnico) return tecnicoNombreSesion;
    return toText(techById[id]?.nombre || configByTech[id]?.tecnico_nombre || id);
  }, [statsTechId, esTecnico, tecnicoNombreSesion, techById, configByTech]);

  const kpi = useMemo(() => {
    const total = rowsList.length;
    const activos = rowsList.filter((row) => Number(row?.staleMin || 0) <= 20).length;
    const retrasados = rowsList.filter((row) => Number(row?.staleMin || 0) > 20).length;
    return { total, activos, retrasados };
  }, [rowsList]);

  const fitMap = useCallback(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const coords = rowsList
      .map((row) => ({ lat: Number(row?.lat), lng: Number(row?.lng) }))
      .filter((p) => isValidCoord(p.lat, p.lng));
    if (coords.length === 0) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (coords.length === 1) {
      map.panTo(coords[0]);
      map.setZoom(16);
      return;
    }
    const bounds = new maps.LatLngBounds();
    coords.slice(0, 220).forEach((p) => bounds.extend(p));
    map.fitBounds(bounds);
  }, [rowsList]);

  const centerTech = useCallback((row) => {
    if (!mapRef.current) return;
    const lat = Number(row?.lat);
    const lng = Number(row?.lng);
    if (!isValidCoord(lat, lng)) return;
    setSelectedTechId(parseTecnicoId(row?.tecnico_id));
    mapRef.current.panTo({ lat, lng });
    mapRef.current.setZoom(16);
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
            mapTypeId: mapType,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
            gestureHandling: "greedy",
          });
          setTimeout(() => {
            try {
              maps.event.trigger(mapRef.current, "resize");
              mapRef.current.panTo(DEFAULT_CENTER);
            } catch {
              // noop
            }
          }, 120);
        } else {
          mapRef.current.setMapTypeId(mapType);
          try {
            maps.event.trigger(mapRef.current, "resize");
          } catch {
            // noop
          }
        }
        setMapReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setMapReady(false);
        setMapError(String(e?.message || "No se pudo cargar Google Maps."));
      });
    return () => {
      cancelled = true;
    };
  }, [mapType]);

  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    clearOverlays();

    trailPolylines.forEach((trail) => {
      const line = new maps.Polyline({
        map,
        path: trail.points,
        strokeColor: trail.color,
        strokeOpacity: 0.9,
        strokeWeight: 4,
      });
      polylinesRef.current.push(line);
    });

    rowsList.forEach((row) => {
      const lat = Number(row?.lat);
      const lng = Number(row?.lng);
      if (!isValidCoord(lat, lng)) return;
      const selected = parseTecnicoId(row?.tecnico_id) === parseTecnicoId(selectedTechId);
      const staleMin = Number(row?.staleMin || 0);
      const fillColor = staleMin > 20 ? "#7A8699" : colorForTechId(row?.tecnico_id);
      const marker = new maps.Marker({
        map,
        position: { lat, lng },
        title: row?.tecnico_label || row?.tecnico_id || "-",
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor,
          fillOpacity: 0.95,
          strokeColor: "#ffffff",
          strokeWeight: selected ? 2.2 : 1.4,
          scale: selected ? 9 : 7.4,
        },
      });
      marker.addListener("click", () => setSelectedTechId(parseTecnicoId(row?.tecnico_id)));
      markersRef.current.push(marker);
    });

    if (!selectedTechId && rowsList.length > 0) {
      setSelectedTechId(parseTecnicoId(rowsList[0]?.tecnico_id));
    }
    if (rowsList.length > 0 && !autoFitDoneRef.current) {
      fitMap();
      autoFitDoneRef.current = true;
    }

    return () => clearOverlays();
  }, [rowsList, selectedTechId, trailPolylines, clearOverlays, fitMap]);

  const toggleTech = (techIdRaw) => {
    const id = parseTecnicoId(techIdRaw);
    if (!id) return;
    setSelectedMapTechIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const fallbackQuery = selectedRow
    ? `${Number(selectedRow.lat).toFixed(6)}, ${Number(selectedRow.lng).toFixed(6)}`
    : `${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng}`;

  if (!isSupabaseConfigured) {
    return (
      <section className="panel">
        <h2>Seguimiento tecnicos</h2>
        <p className="warn-text">Supabase no esta configurado.</p>
      </section>
    );
  }

  return (
    <section className="panel maptech-panel">
      <div className="panel-toolbar">
        <h2>Seguimiento tecnicos</h2>
        <button type="button" className="secondary-btn small" onClick={() => void onRefresh()} disabled={refreshing || loading}>
          {refreshing || loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <p className="panel-meta">
        Mapa GPS en tiempo real | Sesion: {esTecnico ? tecnicoNombreSesion : rolSesion || "-"} | Ultima sincronizacion:{" "}
        {formatDateTime(new Date())}
      </p>

      {error ? <p className="warn-text">{error}</p> : null}
      {warning ? <p className="warn-text">{warning}</p> : null}
      {statsError ? <p className="warn-text">{statsError}</p> : null}
      {mapError ? <p className="warn-text">{mapError}</p> : null}

      <div className="orders-kpi-grid">
        <article className="orders-kpi-card">
          <span>Tecnicos visibles</span>
          <strong>{kpi.total}</strong>
        </article>
        <article className="orders-kpi-card">
          <span>Actualizados (&lt;=20m)</span>
          <strong>{kpi.activos}</strong>
        </article>
        <article className="orders-kpi-card">
          <span>Desactualizados</span>
          <strong>{kpi.retrasados}</strong>
        </article>
        <article className="orders-kpi-card">
          <span>Trazas</span>
          <strong>{showMovement ? Object.keys(trailByTech || {}).length : 0}</strong>
        </article>
      </div>

      <div className="maptech-controls">
        <div className="maptech-actions">
          <button
            type="button"
            className={showMovement ? "secondary-btn small maptech-btn-on" : "secondary-btn small"}
            onClick={() => setShowMovement((prev) => !prev)}
          >
            {showMovement ? "Movimiento ON" : "Movimiento OFF"}
          </button>
          <button
            type="button"
            className="secondary-btn small"
            onClick={() => setMapType((prev) => (prev === "roadmap" ? "satellite" : "roadmap"))}
          >
            {mapType === "roadmap" ? "Vista satelital" : "Vista normal"}
          </button>
          <button type="button" className="secondary-btn small" onClick={fitMap}>
            Ajustar mapa
          </button>
        </div>
        {!esTecnico ? (
          <div className="maptech-pills">
            {techOptions.map((tecnico) => {
              const selected = selectedMapTechIds.includes(tecnico.id);
              return (
                <button
                  key={`seg-tech-${tecnico.id}`}
                  type="button"
                  className={selected ? "maptech-pill active" : "maptech-pill"}
                  onClick={() => toggleTech(tecnico.id)}
                >
                  {tecnico.nombre} {tecnico.habilitado ? "(ON)" : "(OFF)"}
                </button>
              );
            })}
          </div>
        ) : null}
        {showMovement ? (
          <p className="panel-meta">
            Trayectoria ultimas {TRAIL_WINDOW_HOURS} horas {trailLoading ? "(actualizando...)" : ""}.
          </p>
        ) : null}
      </div>

      <div className="maptech-map-card">
        <div ref={mapCanvasRef} className="google-map-canvas maptech-map-canvas" />
        {!mapReady || mapError ? (
          <div className="map-fallback">
            <p>{mapError || "Cargando mapa..."}</p>
            <iframe
              title="Mapa seguimiento fallback"
              src={`https://www.google.com/maps?q=${encodeURIComponent(fallbackQuery)}&z=15&output=embed`}
              loading="lazy"
            />
          </div>
        ) : null}
        {selectedRow ? (
          <article className="maptech-detail">
            <div className="maptech-detail-head">
              <strong>{selectedRow.tecnico_label}</strong>
              <span className={`orders-status ${selectedRow.staleMin > 20 ? "warn" : "ok"}`}>
                {selectedRow.staleMin > 20 ? "Desactualizado" : "En linea"}
              </span>
            </div>
            <p>Actualizado: {formatDateTime(selectedRow.updated_at)}</p>
            <p>Hace: {formatAgo(selectedRow.updated_at)}</p>
            <p>
              Lat/Lng: {Number(selectedRow.lat).toFixed(6)}, {Number(selectedRow.lng).toFixed(6)}
            </p>
            <p>Fuente: {toText(selectedRow.source || "-")}</p>
            <p>Velocidad actual: {Number.isFinite(Number(selectedRow.speedKmh)) ? `${Number(selectedRow.speedKmh).toFixed(1)} km/h` : "-"}</p>
            <div className="maptech-detail-actions">
              <button type="button" className="primary-btn small" onClick={() => centerTech(selectedRow)}>
                Centrar
              </button>
              <button
                type="button"
                className="secondary-btn small"
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      `${selectedRow.lat},${selectedRow.lng}`
                    )}&travelmode=driving`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                Llegar
              </button>
            </div>
          </article>
        ) : null}
      </div>

      <div className="maptech-lists">
        <section className="maptech-list-card">
          <h3>Posiciones actuales ({rowsList.length})</h3>
          <div className="maptech-list">
            {rowsList.length === 0 ? (
              <p className="empty">No hay posiciones activas para los tecnicos seleccionados.</p>
            ) : (
              rowsList.map((row) => (
                <button
                  key={`seg-row-${row.tecnico_id}`}
                  type="button"
                  className={parseTecnicoId(selectedTechId) === row.tecnico_id ? "maptech-row active" : "maptech-row"}
                  onClick={() => centerTech(row)}
                >
                  <p className="maptech-row-title">{row.tecnico_label}</p>
                  <p className="maptech-row-meta">
                    Actualizado: {formatDateTime(row.updated_at)} ({formatAgo(row.updated_at)})
                  </p>
                  <p className="maptech-row-meta">
                    {Number(row.lat).toFixed(6)}, {Number(row.lng).toFixed(6)} | Fuente: {toText(row.source || "-")}
                  </p>
                  <p className="maptech-row-meta">
                    Velocidad: {Number.isFinite(Number(row.speedKmh)) ? `${Number(row.speedKmh).toFixed(1)} km/h` : "-"}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="maptech-list-card">
          <h3>Tecnicos ({techOptions.length})</h3>
          <div className="maptech-list">
            {techOptions.length === 0 ? (
              <p className="empty">No hay tecnicos activos.</p>
            ) : (
              techOptions.map((tecnico) => {
                const row = rowsList.find((item) => item.tecnico_id === tecnico.id);
                return (
                  <button
                    key={`seg-tech-row-${tecnico.id}`}
                    type="button"
                    className={parseTecnicoId(selectedTechId) === tecnico.id ? "maptech-row active" : "maptech-row"}
                    onClick={() => {
                      setSelectedTechId(tecnico.id);
                      if (row) centerTech(row);
                    }}
                  >
                    <p className="maptech-row-title">{tecnico.nombre}</p>
                    <p className="maptech-row-meta">Seguimiento: {tecnico.habilitado ? "ON" : "OFF"}</p>
                    <p className="maptech-row-meta">
                      {row ? `Ultimo ping: ${formatDateTime(row.updated_at)}` : "Sin ubicacion actual."}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="maptech-list-card">
        <div className="panel-toolbar">
          <h3>Estadistica diaria</h3>
          <p className="panel-meta">Distancia, trayectos, tiempos detenidos y velocidad por tecnico.</p>
        </div>
        <div className="pendientes-filters">
          {!esTecnico ? (
            <label>
              Tecnico
              <select value={statsTechId} onChange={(e) => setStatsTechId(parseTecnicoId(e.target.value))}>
                {techOptions.map((t) => (
                  <option key={`stats-tech-${t.id}`} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Fecha
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
          </label>
          <div className="maptech-actions">
            <button type="button" className="secondary-btn small" onClick={() => setStatsDate(startOfDay(new Date()))}>
              Hoy
            </button>
            <button type="button" className="secondary-btn small" onClick={() => setStatsDate((prev) => startOfDay(addDays(prev, -1)))}>
              Ayer
            </button>
          </div>
        </div>
        {statsLoading ? (
          <p className="panel-meta">Cargando estadistica...</p>
        ) : (
          <>
            <div className="pe-kpi-grid">
              <article className="pe-kpi-card">
                <span>Tecnico</span>
                <strong>{selectedStatsTechName}</strong>
              </article>
              <article className="pe-kpi-card">
                <span>Recorrido</span>
                <strong>{Number(statsData?.distanciaKm || 0).toFixed(2)} km</strong>
              </article>
              <article className="pe-kpi-card">
                <span>Trayectos</span>
                <strong>{Number(statsData?.trayectos || 0)}</strong>
              </article>
              <article className="pe-kpi-card">
                <span>Tiempo detenido</span>
                <strong>{formatDuration(statsData?.detenidoSec || 0)}</strong>
              </article>
              <article className="pe-kpi-card">
                <span>Tiempo en movimiento</span>
                <strong>{formatDuration(statsData?.moviendoSec || 0)}</strong>
              </article>
              <article className="pe-kpi-card">
                <span>Velocidad promedio</span>
                <strong>{Number(statsData?.velocidadPromKmh || 0).toFixed(1)} km/h</strong>
              </article>
              <article className="pe-kpi-card">
                <span>Velocidad maxima</span>
                <strong>{Number(statsData?.velocidadMaxKmh || 0).toFixed(1)} km/h</strong>
              </article>
              <article className="pe-kpi-card">
                <span>Pings del dia</span>
                <strong>{Number(statsData?.totalPings || 0)}</strong>
              </article>
            </div>
            <p className="panel-meta">
              Primer ping: {formatDateTime(statsData?.inicio)} | Ultimo ping: {formatDateTime(statsData?.fin)}
            </p>
          </>
        )}
      </section>
    </section>
  );
}
