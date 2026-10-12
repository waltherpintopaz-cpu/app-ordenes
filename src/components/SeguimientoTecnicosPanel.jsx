import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";
import { PERFILES_REGISTRO } from "../utils/volanteoPerfiles";
import {
  colorForSpeedKmh,
  crearIconoVehiculoTipo,
  vehicleIconGeometry,
  paintForVehiculoId,
  VEHICLE_TYPE_DEFAULT,
} from "../utils/vehicleIcon";
import { crearIconoTecnico, tecnicoIconGeometry } from "../utils/tecnicoIcon";

// Distancia maxima entre dos tecnicos para considerarlos "en el mismo
// vehiculo" -- a pie dos personas facilmente estan a 10-20m una de otra
// (en la puerta de distintas casas), asi que el umbral tiene que ser mayor
// a eso pero menor a "estan en la misma cuadra pero separados".
const GRUPO_VEHICULO_DISTANCIA_M = 45;
// Debajo de esta velocidad se considera que el grupo esta detenido/bajado
// del vehiculo (ej. dos tecnicos parados juntos en la puerta de un
// cliente) -- en ese caso se ve mas honesto mostrar a cada uno con su
// propio avatar que un auto parqueado, que sugiere que siguen adentro.
const UMBRAL_MOVIMIENTO_KMH = 3;

// Perfil por defecto para tecnicos (vehiculo entre ordenes, no a pie como
// volanteadores) -- mismos valores que PERFIL_DEFECTO_TECNICO en
// TecnicoTrackingAgent.js (app movil), para que "Personalizado" en este
// panel arranque igual que lo que ya trae el tecnico por defecto.
const PERFIL_DEFECTO_TECNICO = {
  perfil: "personalizado",
  frecuencia_seg: 30,
  precision_m: 60,
  distancia_minima_m: 20,
  distancia_maxima_m: 2000,
  filtrado_adicional: false,
};

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""
).trim();
const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
const TRAIL_COLORS = ["#1E4F9C", "#F47A20", "#00C853", "#EC4899", "#0EA5E9", "#7C3AED"];
const TRAIL_WINDOW_HOURS = 2;
const TRAIL_MAX_POINTS = 240;
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

export default function SeguimientoTecnicosPanel({
  sessionUser,
  rolSesion,
  rolFiltro = "tecnico",
  rolPropio = "Tecnico",
  titulo = "Seguimiento tecnicos",
  etiquetaPlural = "Tecnicos",
}) {
  const mapCanvasRef = useRef(null);
  const mapWrapperRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  // Mapa persistente de marcadores (key -> {marker, type, miembros}) en vez
  // de un array que se destruye y recrea entero en cada render -- asi un
  // simple click para seleccionar un tecnico no hace parpadear TODOS los
  // iconos del mapa, solo actualiza el que realmente cambio (borde/tamaño).
  const markersMapRef = useRef(new Map());
  const polylinesRef = useRef([]);
  const autoFitDoneRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [followTecnico, setFollowTecnico] = useState(false);
  const [mapZoom, setMapZoom] = useState(15);
  const [mapReady, setMapReady] = useState(false);
  const [mapType, setMapType] = useState("roadmap");
  const [showMovement, setShowMovement] = useState(true);

  const [techUsers, setTechUsers] = useState([]);
  const [rolPorIdUsuario, setRolPorIdUsuario] = useState({});
  // Vehiculo asignado a cada tecnico (tabla "vehiculos", campo
  // tecnico_asignado) -- se usa para que el icono del grupo (cuando 2+
  // tecnicos van juntos) use el mismo tipo de carroceria/escalera que ya
  // configuraron en Seguimiento vehiculos, en vez de un auto generico.
  const [vehiculoPorTecnico, setVehiculoPorTecnico] = useState({});
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const { data } = await supabase.from("vehiculos").select("tipo_vehiculo,tiene_escalera,tecnico_asignado");
      const map = {};
      (Array.isArray(data) ? data : []).forEach((v) => {
        const nombre = toText(v?.tecnico_asignado);
        if (nombre) map[nombre] = { tipo_vehiculo: v?.tipo_vehiculo, tiene_escalera: !!v?.tiene_escalera };
      });
      setVehiculoPorTecnico(map);
    })();
  }, []);
  const [configByTech, setConfigByTech] = useState({});
  const [currentRows, setCurrentRows] = useState([]);
  const [trailByTech, setTrailByTech] = useState({});
  const [trailLoading, setTrailLoading] = useState(false);
  const [selectedMapTechIds, setSelectedMapTechIds] = useState([]);
  const [selectedTechId, setSelectedTechId] = useState("");
  const [statsDate, setStatsDate] = useState(() => startOfDay(new Date()));
  const [statsTechId, setStatsTechId] = useState("");
  const [statsData, setStatsData] = useState(null);
  const [statsPoints, setStatsPoints] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(() => new Date());
  const [pingStates, setPingStates] = useState({}); // { [tecnicoId]: "idle"|"waiting"|"ok"|"timeout" }

  const esAdmin = rolSesion === "Administrador";
  const esTecnico = rolSesion === rolPropio;
  const tecnicoIdSesion = parseTecnicoId(sessionUser?.id);
  const tecnicoNombreSesion = toText(sessionUser?.nombre || sessionUser?.username || tecnicoIdSesion);

  const clearOverlays = useCallback(() => {
    markersMapRef.current.forEach((entry) => {
      try {
        entry.marker.setMap(null);
      } catch {
        // noop
      }
    });
    markersMapRef.current.clear();
    polylinesRef.current.forEach((line) => {
      try {
        line.setMap(null);
      } catch {
        // noop
      }
    });
    polylinesRef.current = [];
  }, []);

  // Los intervals de "pedir ubicacion" (hasta 20s cada uno) no se limpiaban
  // al desmontar el panel -- si el admin pedia ubicacion y salia del panel
  // antes de esos 20s, el interval seguia vivo, pegandole a Supabase cada
  // 1.5s y llamando setPingStates sobre un componente ya desmontado.
  const pingIntervalsRef = useRef({});
  useEffect(() => () => {
    Object.values(pingIntervalsRef.current).forEach((id) => clearInterval(id));
    pingIntervalsRef.current = {};
  }, []);

  const pedirUbicacion = useCallback(async (tecnicoId) => {
    if (!tecnicoId || !isSupabaseConfigured) return;
    setPingStates((p) => ({ ...p, [tecnicoId]: "waiting" }));
    const requestId = `${tecnicoId}_${Date.now()}`;
    try {
      await supabase.from("location_ping_requests").insert({
        request_id: requestId,
        tecnico_id: String(tecnicoId),
        requested_at: new Date().toISOString(),
        status: "pending",
      });
    } catch {
      setPingStates((p) => ({ ...p, [tecnicoId]: "idle" }));
      return;
    }
    // Esperar respuesta hasta 20s leyendo tecnico_ubicacion_actual
    const antes = new Date();
    if (pingIntervalsRef.current[tecnicoId]) clearInterval(pingIntervalsRef.current[tecnicoId]);
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("tecnico_ubicacion_actual")
        .select("updated_at")
        .eq("tecnico_id", String(tecnicoId))
        .maybeSingle();
      const updatedAt = data?.updated_at ? new Date(data.updated_at) : null;
      if (updatedAt && updatedAt > antes) {
        clearInterval(interval);
        delete pingIntervalsRef.current[tecnicoId];
        setPingStates((p) => ({ ...p, [tecnicoId]: "ok" }));
        await cargarUbicacionActual();
        setTimeout(() => setPingStates((p) => ({ ...p, [tecnicoId]: "idle" })), 3000);
      } else if (Date.now() - antes.getTime() > 20000) {
        clearInterval(interval);
        delete pingIntervalsRef.current[tecnicoId];
        setPingStates((p) => ({ ...p, [tecnicoId]: "timeout" }));
        setTimeout(() => setPingStates((p) => ({ ...p, [tecnicoId]: "idle" })), 4000);
      }
    }, 1500);
    pingIntervalsRef.current[tecnicoId] = interval;
  }, []);  // eslint-disable-line

  // Valvula de escape para el admin: si un tecnico tiene un problema real
  // (permiso que no le funciona, celular viejo, etc.) y no puede "Iniciar
  // jornada" el mismo, esto le crea el turno activo igual -- asi no queda
  // bloqueado de ver/trabajar sus ordenes por un tema tecnico que no es su
  // culpa. Solo aplica a Tecnico (Volanteador tiene su propio mecanismo via
  // usuarios.volanteo_forzar_fin).
  // Ajustes de seguimiento por tecnico (habilitado, modo de turno y perfil
  // de registro GPS) -- mismo patron que "Ajustes de registro GPS" de
  // SeguimientoVolanteadoresPanel.jsx, pero por tecnico en vez de una sola
  // fila compartida (tecnico_seguimiento_config tiene una fila por tecnico).
  const [ajustesTecnico, setAjustesTecnico] = useState(null);
  const [ajustesCargando, setAjustesCargando] = useState(false);
  const [ajustesGuardando, setAjustesGuardando] = useState(false);
  const [ajustesError, setAjustesError] = useState("");
  const [cfgHabilitado, setCfgHabilitado] = useState(true);
  const [cfgModoTurno, setCfgModoTurno] = useState("manual");
  const [cfgPerfil, setCfgPerfil] = useState(PERFIL_DEFECTO_TECNICO.perfil);
  const [cfgFrecuencia, setCfgFrecuencia] = useState(String(PERFIL_DEFECTO_TECNICO.frecuencia_seg));
  const [cfgPrecision, setCfgPrecision] = useState(String(PERFIL_DEFECTO_TECNICO.precision_m));
  const [cfgDistMin, setCfgDistMin] = useState(String(PERFIL_DEFECTO_TECNICO.distancia_minima_m));
  const [cfgDistMax, setCfgDistMax] = useState(String(PERFIL_DEFECTO_TECNICO.distancia_maxima_m));
  const [cfgFiltrado, setCfgFiltrado] = useState(PERFIL_DEFECTO_TECNICO.filtrado_adicional);

  const abrirAjustesTecnico = useCallback(async (tecnico) => {
    if (!tecnico?.id) return;
    setAjustesTecnico(tecnico);
    setAjustesCargando(true);
    setAjustesError("");
    try {
      const { data } = await supabase
        .from("tecnico_seguimiento_config")
        .select("*")
        .eq("tecnico_id", tecnico.id)
        .maybeSingle();
      setCfgHabilitado(data?.habilitado !== false);
      setCfgModoTurno(data?.modo_turno === "auto" ? "auto" : "manual");
      const perfilGuardado = toText(data?.perfil);
      // "general_tecnico" es el valor que escribe la app movil cuando el
      // tecnico aun no tiene fila -- equivale a "Personalizado" aqui.
      setCfgPerfil(perfilGuardado && perfilGuardado !== "general_tecnico" ? perfilGuardado : "personalizado");
      setCfgFrecuencia(String(data?.frecuencia_seg ?? PERFIL_DEFECTO_TECNICO.frecuencia_seg));
      setCfgPrecision(String(data?.precision_m ?? PERFIL_DEFECTO_TECNICO.precision_m));
      setCfgDistMin(String(data?.distancia_minima_m ?? PERFIL_DEFECTO_TECNICO.distancia_minima_m));
      setCfgDistMax(String(data?.distancia_maxima_m ?? PERFIL_DEFECTO_TECNICO.distancia_maxima_m));
      setCfgFiltrado(data?.filtrado_adicional === true);
    } catch (e) {
      setAjustesError(String(e?.message || "No se pudo cargar la configuracion."));
    } finally {
      setAjustesCargando(false);
    }
  }, []);

  const elegirPerfilTecnico = useCallback((key) => {
    setCfgPerfil(key);
    if (key === "personalizado") return;
    const p = PERFILES_REGISTRO[key];
    if (!p) return;
    setCfgFrecuencia(String(p.frecuencia_seg));
    setCfgPrecision(String(p.precision_m));
    setCfgDistMin(String(p.distancia_minima_m));
    setCfgDistMax(String(p.distancia_maxima_m));
    setCfgFiltrado(p.filtrado_adicional);
  }, []);

  const guardarAjustesTecnico = useCallback(async () => {
    if (!ajustesTecnico?.id) return;
    setAjustesGuardando(true);
    setAjustesError("");
    try {
      const { error: err } = await supabase.from("tecnico_seguimiento_config").upsert({
        tecnico_id: ajustesTecnico.id,
        tecnico_nombre: ajustesTecnico.nombre,
        habilitado: cfgHabilitado,
        modo_turno: cfgModoTurno,
        perfil: cfgPerfil,
        frecuencia_seg: Number(cfgFrecuencia) || PERFIL_DEFECTO_TECNICO.frecuencia_seg,
        precision_m: Number(cfgPrecision) || PERFIL_DEFECTO_TECNICO.precision_m,
        distancia_minima_m: Number(cfgDistMin) || PERFIL_DEFECTO_TECNICO.distancia_minima_m,
        distancia_maxima_m: Number(cfgDistMax) || PERFIL_DEFECTO_TECNICO.distancia_maxima_m,
        filtrado_adicional: cfgFiltrado,
      });
      if (err) throw err;
      setConfigByTech((prev) => ({
        ...prev,
        [ajustesTecnico.id]: { ...prev[ajustesTecnico.id], habilitado: cfgHabilitado, modo_turno: cfgModoTurno },
      }));
      setAjustesTecnico(null);
    } catch (e) {
      setAjustesError(String(e?.message || "No se pudo guardar."));
    } finally {
      setAjustesGuardando(false);
    }
  }, [ajustesTecnico, cfgHabilitado, cfgModoTurno, cfgPerfil, cfgFrecuencia, cfgPrecision, cfgDistMin, cfgDistMax, cfgFiltrado]);

  const [forzandoId, setForzandoId] = useState("");
  const forzarJornadaActiva = useCallback(
    async (tecnico) => {
      if (!tecnico?.id || !isSupabaseConfigured) return;
      setForzandoId(tecnico.id);
      try {
        const { data: existente } = await supabase
          .from("tecnico_turnos")
          .select("id")
          .eq("tecnico_id", tecnico.id)
          .eq("estado", "activo")
          .is("fin", null)
          .order("inicio", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existente?.id) {
          window.alert(`${tecnico.nombre} ya tiene una jornada activa.`);
          return;
        }
        const { error: insertError } = await supabase.from("tecnico_turnos").insert({
          tecnico_id: tecnico.id,
          tecnico_nombre: tecnico.nombre,
          tecnico_rol: "Tecnico",
          estado: "activo",
          inicio: new Date().toISOString(),
          activado_por: toText(sessionUser?.nombre || sessionUser?.username || "Admin"),
        });
        if (insertError) throw insertError;
        window.alert(`Jornada de ${tecnico.nombre} activada manualmente.`);
      } catch (e) {
        window.alert(e?.message || "No se pudo forzar la jornada.");
      } finally {
        setForzandoId("");
      }
    },
    [sessionUser]
  );

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
      .select("id,nombre,rol,activo,celular")
      .eq("activo", true)
      .limit(2000);
    if (usuariosError) throw usuariosError;

    // Mapa id -> rol de TODOS los usuarios activos (no solo tecnicos) --
    // se usa mas abajo para que techOptions no mezcle Volanteadores /
    // Supervisores que tambien reportan ubicacion en tecnico_ubicacion_actual.
    const rolPorId = {};
    (Array.isArray(usuariosData) ? usuariosData : []).forEach((row) => {
      const id = parseTecnicoId(row?.id);
      if (id) rolPorId[id] = toText(row?.rol);
    });
    setRolPorIdUsuario(rolPorId);

    const tecnicos = (Array.isArray(usuariosData) ? usuariosData : [])
      .filter((row) => toText(row?.rol) === rolPropio)
      .map((row) => ({
        id: parseTecnicoId(row?.id),
        nombre: toText(row?.nombre || row?.id),
        celular: toText(row?.celular),
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
  }, [esTecnico, tecnicoIdSesion, rolPropio]);

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
        setStatsPoints([]);
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
        setStatsPoints(rows.filter((r) => isValidCoord(Number(r.lat), Number(r.lng))));
      } catch (e) {
        setStatsData(null);
        setStatsPoints([]);
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
      setLastSyncAt(new Date());
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
      setLastSyncAt(new Date());
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
        celular: toText(u?.celular),
        habilitado: Boolean(configByTech[id]?.habilitado),
      });
    });
    (Array.isArray(currentRows) ? currentRows : []).forEach((row) => {
      const id = parseTecnicoId(row?.tecnico_id);
      if (!id || setIds.has(id)) return;
      // tecnico_ubicacion_actual guarda la ubicacion de CUALQUIER rol que
      // reporte GPS (Volanteadores, Supervisor, etc. ademas de tecnicos) --
      // antes esto agregaba a cualquiera con una fila ahi como si fuera
      // tecnico. Si conocemos su rol real y no es el de este panel, se
      // descarta; si no esta en el mapa (usuario inactivo/borrado), se deja
      // pasar para no perder ubicaciones historicas de tecnicos dados de baja.
      const rolConocido = rolPorIdUsuario[id];
      if (rolConocido && rolConocido !== rolPropio) return;
      setIds.add(id);
      rows.push({
        id,
        nombre: toText(row?.tecnico_nombre || configByTech[id]?.tecnico_nombre || id),
        habilitado: Boolean(configByTech[id]?.habilitado ?? true),
      });
    });
    return rows.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [techUsers, currentRows, configByTech, rolPorIdUsuario, rolPropio]);

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

  // Agrupa tecnicos que estan muy cerca entre si (viajando juntos en el
  // mismo vehiculo) para mostrar un solo icono de auto en vez de 2 puntos
  // pegados que parecerian 2 vehiculos distintos. Union simple por
  // cercania mutua (greedy): barato de sobra para ~10-20 tecnicos.
  const rowGroups = useMemo(() => {
    const validRows = rowsList.filter((r) => isValidCoord(Number(r.lat), Number(r.lng)));
    const used = new Set();
    const groups = [];
    validRows.forEach((row) => {
      const id = parseTecnicoId(row.tecnico_id);
      if (used.has(id)) return;
      const miembros = [row];
      used.add(id);
      validRows.forEach((otro) => {
        const otroId = parseTecnicoId(otro.tecnico_id);
        if (used.has(otroId)) return;
        const cerca = miembros.some(
          (m) => haversineMeters(Number(m.lat), Number(m.lng), Number(otro.lat), Number(otro.lng)) <= GRUPO_VEHICULO_DISTANCIA_M
        );
        if (cerca) {
          miembros.push(otro);
          used.add(otroId);
        }
      });
      groups.push({
        groupId: miembros.map((m) => parseTecnicoId(m.tecnico_id)).sort().join("+"),
        rows: miembros,
        lat: Number(miembros[0].lat),
        lng: Number(miembros[0].lng),
      });
    });
    return groups;
  }, [rowsList]);

  const selectedGroup = useMemo(
    () => rowGroups.find((g) => g.rows.some((r) => parseTecnicoId(r.tecnico_id) === parseTecnicoId(selectedTechId))) || null,
    [rowGroups, selectedTechId]
  );

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

  const exportarKml = useCallback(() => {
    if (statsPoints.length === 0) return;
    const nombre = selectedStatsTechName || "recorrido";
    const coords = statsPoints.map((p) => `${Number(p.lng)},${Number(p.lat)},0`).join(" ");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<name>${nombre} — ${formatDateInput(statsDate)}</name>
<Placemark><name>${nombre}</name>
<LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>
</Placemark></Document></kml>`;
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recorrido_${nombre.replace(/\s+/g, "_")}_${formatDateInput(statsDate)}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [statsPoints, selectedStatsTechName, statsDate]);

  const compartirWhatsapp = useCallback(() => {
    if (!statsData) return;
    const ultimo = statsPoints[statsPoints.length - 1];
    const linkMapa = ultimo ? `https://maps.google.com/?q=${ultimo.lat},${ultimo.lng}` : "";
    const texto = [
      `📍 Recorrido de ${selectedStatsTechName} — ${formatDateInput(statsDate)}`,
      `Distancia: ${Number(statsData.distanciaKm || 0).toFixed(2)} km`,
      `Trayectos: ${Number(statsData.trayectos || 0)}`,
      linkMapa ? `Ultima ubicacion: ${linkMapa}` : "",
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  }, [statsData, statsPoints, selectedStatsTechName, statsDate]);

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

  // Google Maps no tiene zoom animado nativo (setZoom es instantaneo) -- se
  // simula suave escalonando el zoom en pasos cortos, igual que en
  // Seguimiento vehiculos.
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

  const centerTech = useCallback(
    (row) => {
      if (!mapRef.current) return;
      const lat = Number(row?.lat);
      const lng = Number(row?.lng);
      if (!isValidCoord(lat, lng)) return;
      setSelectedTechId(parseTecnicoId(row?.tecnico_id));
      zoomSuaveHacia(mapRef.current, 16, { lat, lng });
    },
    [zoomSuaveHacia]
  );

  // Boton propio de pantalla completa (agranda el mapa + la tarjeta de
  // detalle, no solo el canvas) -- mismo patron que Seguimiento vehiculos.
  const toggleMapFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else if (mapWrapperRef.current?.requestFullscreen) {
      mapWrapperRef.current.requestFullscreen();
    }
  }, []);
  useEffect(() => {
    const onChange = () => {
      const isFull = document.fullscreenElement === mapWrapperRef.current;
      setMapFullscreen(isFull);
      setTimeout(() => {
        if (mapRef.current && mapsRef.current) mapsRef.current.event.trigger(mapRef.current, "resize");
      }, 60);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Si "Seguir tecnico" esta activo, cada vez que llega un ping nuevo del
  // tecnico seleccionado la camara lo sigue sola (igual que en vehiculos).
  useEffect(() => {
    if (!followTecnico || !selectedRow || !mapRef.current) return;
    const lat = Number(selectedRow.lat);
    const lng = Number(selectedRow.lng);
    if (!isValidCoord(lat, lng)) return;
    zoomSuaveHacia(mapRef.current, mapRef.current.getZoom() || 17, { lat, lng });
  }, [followTecnico, selectedRow, zoomSuaveHacia]);

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
            // El control nativo de Google solo agranda el canvas (no la
            // tarjeta de detalle, que es un hermano fuera de ese div) -- se
            // usa un boton propio que agranda todo el contenedor.
            fullscreenControl: false,
            gestureHandling: "greedy",
          });
          setMapZoom(mapRef.current.getZoom() ?? 15);
          mapRef.current.addListener("zoom_changed", () => setMapZoom(mapRef.current.getZoom() ?? 15));
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

  // Trazas (polylines): solo dependen de trailPolylines, no de la seleccion
  // -- asi un click para seleccionar un tecnico no vuelve a dibujar el
  // recorrido entero.
  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    polylinesRef.current.forEach((line) => {
      try {
        line.setMap(null);
      } catch {
        // noop
      }
    });
    polylinesRef.current = trailPolylines.map(
      (trail) =>
        new maps.Polyline({
          map,
          path: trail.points,
          strokeColor: trail.color,
          strokeOpacity: 0.9,
          strokeWeight: 4,
        })
    );
    return () => {
      polylinesRef.current.forEach((line) => {
        try {
          line.setMap(null);
        } catch {
          // noop
        }
      });
      polylinesRef.current = [];
    };
  }, [trailPolylines]);

  // Marcadores: mapa persistente por clave (tecnico_id o groupId) -- cuando
  // la clave ya existia se actualiza su icono/posicion en el mismo marcador
  // (sin destruirlo), en vez del patron anterior de borrar todo y recrear,
  // que hacia parpadear los iconos con cada click de seleccion o cada
  // actualizacion de datos. El tamaño escala con el zoom, igual que en
  // Seguimiento vehiculos.
  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    const seen = new Set();
    const zoomScale = Math.min(1.7, Math.max(0.85, Math.pow(1.22, mapZoom - 16)));

    const pintarAvatar = (row, key, grupoSeleccionado) => {
      const staleMin = Number(row?.staleMin || 0);
      const stale = staleMin > 20;
      const fillColor = stale ? "#7A8699" : colorForTechId(row?.tecnico_id);
      const size = Math.round((grupoSeleccionado ? 48 : 40) * zoomScale);
      const avatarUrl = crearIconoTecnico(fillColor, grupoSeleccionado, stale);
      const avatarGeo = tecnicoIconGeometry(size);
      const title = row?.tecnico_label || row?.tecnico_id || "-";
      const icon = avatarUrl
        ? { url: avatarUrl, scaledSize: new maps.Size(avatarGeo.width, avatarGeo.height), anchor: new maps.Point(avatarGeo.anchorX, avatarGeo.anchorY) }
        : {
            path: maps.SymbolPath.CIRCLE,
            fillColor,
            fillOpacity: 0.95,
            strokeColor: "#ffffff",
            strokeWeight: grupoSeleccionado ? 2.6 : 1.6,
            scale: grupoSeleccionado ? 11 : 9,
          };
      seen.add(key);
      const entry = markersMapRef.current.get(key);
      const primerId = parseTecnicoId(row.tecnico_id);
      if (!entry) {
        const marker = new maps.Marker({ map, position: { lat: Number(row.lat), lng: Number(row.lng) }, title, icon, zIndex: grupoSeleccionado ? 999 : undefined });
        marker.addListener("click", () => setSelectedTechId(primerId));
        markersMapRef.current.set(key, { marker, primerId });
      } else {
        entry.marker.setPosition({ lat: Number(row.lat), lng: Number(row.lng) });
        entry.marker.setIcon(icon);
        entry.marker.setTitle(title);
        entry.marker.setLabel(null);
        entry.marker.setZIndex(grupoSeleccionado ? 999 : undefined);
        entry.primerId = primerId;
      }
    };

    rowGroups.forEach((group) => {
      const { lat, lng, rows: miembros } = group;
      if (!isValidCoord(lat, lng)) return;
      const grupoSeleccionado = miembros.some((m) => parseTecnicoId(m.tecnico_id) === parseTecnicoId(selectedTechId));
      const speedGrupo = Math.max(...miembros.map((m) => Number(m.speedKmh) || 0));
      const enMovimiento = speedGrupo >= UMBRAL_MOVIMIENTO_KMH;

      if (miembros.length === 1 || !enMovimiento) {
        // Solo, o juntos pero detenidos -- cada uno con su propio avatar.
        miembros.forEach((row) => {
          const seleccionado = parseTecnicoId(row.tecnico_id) === parseTecnicoId(selectedTechId) || (miembros.length > 1 && grupoSeleccionado);
          pintarAvatar(row, parseTecnicoId(row.tecnico_id), seleccionado);
        });
        return;
      }

      // 2+ tecnicos muy cerca entre si Y en movimiento -- lo mas probable
      // es que vayan juntos en un solo vehiculo, asi que se dibuja UN icono
      // de auto (el mismo dibujo que usa Seguimiento vehiculos) en vez de
      // puntos pegados que pareceria que hay 2 vehiculos. Se toma el
      // vehiculo asignado al primero del grupo que tenga uno configurado.
      const primerId = parseTecnicoId(miembros[0].tecnico_id);
      const vehInfo = miembros.map((m) => vehiculoPorTecnico[m.tecnico_label]).find(Boolean);
      const staleMinGrupo = Math.min(...miembros.map((m) => Number(m.staleMin || 0)));
      const bodyColor = staleMinGrupo > 20 ? "#94A3B8" : paintForVehiculoId(group.groupId);
      const iconDataUrl = crearIconoVehiculoTipo(
        vehInfo?.tipo_vehiculo || VEHICLE_TYPE_DEFAULT,
        !!vehInfo?.tiene_escalera,
        bodyColor,
        null,
        speedGrupo
      );
      const size = Math.round((grupoSeleccionado ? 68 : 56) * zoomScale);
      const iconGeo = vehicleIconGeometry(size);
      const title = `${miembros.map((m) => m.tecnico_label).join(" + ")} (en el mismo vehículo)`;
      const label = { text: String(miembros.length), color: "#ffffff", fontSize: "11px", fontWeight: "800" };
      const icon = iconDataUrl
        ? { url: iconDataUrl, scaledSize: new maps.Size(iconGeo.width, iconGeo.height), anchor: new maps.Point(iconGeo.anchorX, iconGeo.anchorY) }
        : {
            path: maps.SymbolPath.CIRCLE,
            fillColor: bodyColor,
            fillOpacity: 0.95,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 11,
          };

      seen.add(group.groupId);
      const entry = markersMapRef.current.get(group.groupId);
      if (!entry) {
        const marker = new maps.Marker({ map, position: { lat, lng }, title, icon, label, zIndex: grupoSeleccionado ? 999 : undefined });
        marker.addListener("click", () => setSelectedTechId(primerId));
        markersMapRef.current.set(group.groupId, { marker, primerId });
      } else {
        entry.marker.setPosition({ lat, lng });
        entry.marker.setIcon(icon);
        entry.marker.setTitle(title);
        entry.marker.setLabel(label);
        entry.marker.setZIndex(grupoSeleccionado ? 999 : undefined);
        entry.primerId = primerId;
      }
    });

    // Claves que ya no existen (tecnico se separo/junto, se desconecto, o
    // cambio entre avatar y vehiculo) -- remover su marcador.
    markersMapRef.current.forEach((entry, key) => {
      if (seen.has(key)) return;
      try {
        entry.marker.setMap(null);
      } catch {
        // noop
      }
      markersMapRef.current.delete(key);
    });

    if (!selectedTechId && rowsList.length > 0) {
      setSelectedTechId(parseTecnicoId(rowsList[0]?.tecnico_id));
    }
    if (rowsList.length > 0 && !autoFitDoneRef.current) {
      fitMap();
      autoFitDoneRef.current = true;
    }
  }, [rowsList, rowGroups, vehiculoPorTecnico, selectedTechId, mapZoom, fitMap]);

  // Limpieza total solo al desmontar el panel (no en cada refresco de
  // datos, que es lo que causaba el parpadeo).
  useEffect(() => {
    return () => clearOverlays();
  }, [clearOverlays]);

  const toggleTech = (techIdRaw) => {
    const id = parseTecnicoId(techIdRaw);
    if (!id) return;
    setSelectedMapTechIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };
  const seleccionarTodos = () => setSelectedMapTechIds(techOptions.map((t) => t.id));
  const seleccionarNinguno = () => setSelectedMapTechIds([]);

  const fallbackQuery = selectedRow
    ? `${Number(selectedRow.lat).toFixed(6)}, ${Number(selectedRow.lng).toFixed(6)}`
    : `${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng}`;

  if (!isSupabaseConfigured) {
    return (
      <section className="panel">
        <h2>{titulo}</h2>
        <p className="warn-text">Supabase no esta configurado.</p>
      </section>
    );
  }

  return (
    <section className="panel maptech-panel">
      <div className="panel-toolbar">
        <h2>{titulo}</h2>
        <button type="button" className="secondary-btn small" onClick={() => void onRefresh()} disabled={refreshing || loading}>
          {refreshing || loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <p className="panel-meta">
        Mapa GPS por carga manual | Sesion: {esTecnico ? tecnicoNombreSesion : rolSesion || "-"} | Ultima sincronizacion:{" "}
        {formatDateTime(lastSyncAt)}
      </p>

      {error ? <p className="warn-text">{error}</p> : null}
      {warning ? <p className="warn-text">{warning}</p> : null}
      {statsError ? <p className="warn-text">{statsError}</p> : null}
      {mapError ? <p className="warn-text">{mapError}</p> : null}

      <div className="orders-kpi-grid">
        <article className="orders-kpi-card">
          <span>{etiquetaPlural} visibles</span>
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
        <div className="maptech-controls-group">
          <span className="maptech-controls-label">Vista del mapa</span>
          <div className="maptech-actions">
            <button
              type="button"
              className={showMovement ? "secondary-btn small maptech-btn-on" : "secondary-btn small"}
              onClick={() => setShowMovement((prev) => !prev)}
            >
              {showMovement ? "🛰️ Recorrido ON" : "🛰️ Recorrido OFF"}
            </button>
            <button
              type="button"
              className="secondary-btn small"
              onClick={() => setMapType((prev) => (prev === "roadmap" ? "satellite" : "roadmap"))}
            >
              {mapType === "roadmap" ? "🌍 Vista satelital" : "🗺️ Vista normal"}
            </button>
            <button type="button" className="secondary-btn small" onClick={fitMap}>
              🔍 Ajustar mapa
            </button>
            <button type="button" className="secondary-btn small" onClick={toggleMapFullscreen}>
              {mapFullscreen ? "🗗 Salir de pantalla completa" : "⛶ Pantalla completa"}
            </button>
            <label
              className="maptech-follow-toggle"
              style={{
                color: followTecnico ? "#7C3AED" : "#64748b",
                opacity: selectedRow ? 1 : 0.5,
                cursor: selectedRow ? "pointer" : "not-allowed",
              }}
            >
              <input
                type="checkbox"
                checked={followTecnico}
                disabled={!selectedRow}
                onChange={(e) => {
                  setFollowTecnico(e.target.checked);
                  if (e.target.checked && selectedRow && isValidCoord(Number(selectedRow.lat), Number(selectedRow.lng))) {
                    zoomSuaveHacia(mapRef.current, 17, { lat: Number(selectedRow.lat), lng: Number(selectedRow.lng) });
                  }
                }}
              />
              🎯 Seguir técnico
            </label>
          </div>
          {showMovement ? (
            <p className="panel-meta" style={{ margin: 0 }}>
              Muestra el recorrido de las últimas {TRAIL_WINDOW_HOURS} horas.
              {trailLoading ? <span className="maptech-live-dot"> ● Actualizando…</span> : null}
            </p>
          ) : null}
        </div>

        {!esTecnico ? (
          <div className="maptech-controls-group">
            <div className="maptech-controls-label-row">
              <span className="maptech-controls-label">
                {etiquetaPlural} en el mapa ({selectedMapTechIds.length}/{techOptions.length})
              </span>
              <div className="maptech-quickpick">
                <button type="button" onClick={seleccionarTodos}>Todos</button>
                <span>·</span>
                <button type="button" onClick={seleccionarNinguno}>Ninguno</button>
              </div>
            </div>
            <div className="maptech-pills">
              {techOptions.map((tecnico) => {
                const selected = selectedMapTechIds.includes(tecnico.id);
                const color = colorForTechId(tecnico.id);
                return (
                  <button
                    key={`seg-tech-${tecnico.id}`}
                    type="button"
                    className="maptech-pill"
                    onClick={() => toggleTech(tecnico.id)}
                    style={{
                      border: `1.5px solid ${selected ? color : "#e2e8f0"}`,
                      background: selected ? `${color}1a` : "#fff",
                      color: selected ? color : "#64748b",
                    }}
                  >
                    <span className="maptech-pill-dot" style={{ background: color }} />
                    {tecnico.nombre} {tecnico.habilitado ? "" : "(OFF)"}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div ref={mapWrapperRef} className="maptech-map-card">
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
        <button
          type="button"
          onClick={toggleMapFullscreen}
          title={mapFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          className="maptech-fullscreen-btn"
        >
          {mapFullscreen ? "🗗" : "⛶"}
        </button>
        {selectedRow ? (
          <article className="maptech-detail">
            {selectedGroup && selectedGroup.rows.length > 1 ? (
              <div className="maptech-group-banner">
                <span>
                  {Math.max(...selectedGroup.rows.map((m) => Number(m.speedKmh) || 0)) >= UMBRAL_MOVIMIENTO_KMH
                    ? `🚐 Viajan juntos (${selectedGroup.rows.length})`
                    : `👥 Cerca uno del otro (${selectedGroup.rows.length})`}
                </span>
                <div className="maptech-group-chips">
                  {selectedGroup.rows.map((m) => (
                    <button
                      key={`grp-${m.tecnico_id}`}
                      type="button"
                      className={parseTecnicoId(m.tecnico_id) === parseTecnicoId(selectedRow.tecnico_id) ? "maptech-group-chip active" : "maptech-group-chip"}
                      onClick={() => setSelectedTechId(parseTecnicoId(m.tecnico_id))}
                    >
                      <span className="maptech-pill-dot" style={{ background: colorForTechId(m.tecnico_id) }} />
                      {m.tecnico_label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="maptech-detail-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className="maptech-pill-dot" style={{ background: colorForTechId(selectedRow.tecnico_id), width: 10, height: 10 }} />
                <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedRow.tecnico_label}</strong>
              </div>
              <span className={`orders-status ${selectedRow.staleMin > 20 ? "warn" : "ok"}`}>
                {selectedRow.staleMin > 20 ? "Desactualizado" : "En línea"}
              </span>
            </div>

            <div className="maptech-detail-metrics">
              <div className="maptech-detail-metric">
                <span className="maptech-detail-metric-label">Velocidad</span>
                {Number.isFinite(Number(selectedRow.speedKmh)) ? (
                  <strong style={{ color: colorForSpeedKmh(Number(selectedRow.speedKmh)) }}>
                    {Number(selectedRow.speedKmh).toFixed(0)} <span style={{ fontSize: 11, fontWeight: 700 }}>km/h</span>
                  </strong>
                ) : (
                  <strong style={{ color: "#cbd5e1" }}>—</strong>
                )}
              </div>
              {selectedRow.battery_pct != null ? (
                <div className="maptech-detail-metric">
                  <span className="maptech-detail-metric-label">Batería</span>
                  <strong style={{ color: Number(selectedRow.battery_pct) <= 20 ? "#dc2626" : Number(selectedRow.battery_pct) <= 50 ? "#ca8a04" : "#16a34a" }}>
                    🔋 {selectedRow.battery_pct}%
                  </strong>
                </div>
              ) : null}
            </div>

            <p>Actualizado hace: {formatAgo(selectedRow.updated_at)}</p>
            <p className="maptech-detail-sub">{formatDateTime(selectedRow.updated_at)} · Fuente: {toText(selectedRow.source || "-")}</p>

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
              {!esTecnico && (() => {
                const ps = pingStates[selectedRow.tecnico_id] || "idle";
                return (
                  <button
                    type="button"
                    className="secondary-btn small"
                    disabled={ps === "waiting"}
                    onClick={() => pedirUbicacion(selectedRow.tecnico_id)}
                    style={{ minWidth: 110 }}
                  >
                    {ps === "waiting" ? "Solicitando..." : ps === "ok" ? "✓ Actualizado" : ps === "timeout" ? "Sin respuesta" : "📍 Pedir ubicación"}
                  </button>
                );
              })()}
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
              rowsList.map((row, idx) => (
                <button
                  key={`seg-row-${row.tecnico_id}`}
                  type="button"
                  className={parseTecnicoId(selectedTechId) === row.tecnico_id ? "maptech-row active maptech-row-in" : "maptech-row maptech-row-in"}
                  style={{ "--i": idx }}
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
          <h3>{etiquetaPlural} ({techOptions.length})</h3>
          <div className="maptech-list">
            {techOptions.length === 0 ? (
              <p className="empty">No hay {etiquetaPlural.toLowerCase()} activos.</p>
            ) : (
              techOptions.map((tecnico, idx) => {
                const row = rowsList.find((item) => item.tecnico_id === tecnico.id);
                return (
                  <div
                    key={`seg-tech-row-${tecnico.id}`}
                    className={parseTecnicoId(selectedTechId) === tecnico.id ? "maptech-row active maptech-row-in" : "maptech-row maptech-row-in"}
                    style={{ cursor: "pointer", "--i": idx }}
                    onClick={() => { setSelectedTechId(tecnico.id); if (row) centerTech(row); }}
                  >
                    <p className="maptech-row-title">{tecnico.nombre}</p>
                    <p className="maptech-row-meta">Seguimiento: {tecnico.habilitado ? "ON" : "OFF"}</p>
                    <p className="maptech-row-meta">
                      {row ? `Ultimo ping: ${formatDateTime(row.updated_at)} (${formatAgo(row.updated_at)})` : "Sin ubicacion actual."}
                    </p>
                    {!esTecnico && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {(() => {
                          const ps = pingStates[tecnico.id] || "idle";
                          return (
                            <button
                              type="button"
                              className="secondary-btn small"
                              style={{ minWidth: 130 }}
                              disabled={ps === "waiting"}
                              onClick={(e) => { e.stopPropagation(); pedirUbicacion(tecnico.id); }}
                            >
                              {ps === "waiting" ? "Solicitando..." : ps === "ok" ? "✓ Actualizado" : ps === "timeout" ? "Sin respuesta" : "📍 Pedir ubicación"}
                            </button>
                          );
                        })()}
                        {esAdmin && rolPropio === "Tecnico" && (
                          <button
                            type="button"
                            className="secondary-btn small"
                            style={{ minWidth: 130 }}
                            disabled={forzandoId === tecnico.id}
                            onClick={(e) => { e.stopPropagation(); void forzarJornadaActiva(tecnico); }}
                            title="Activa la jornada de este tecnico aunque el no haya tocado 'Iniciar jornada' -- usar solo si tiene un problema tecnico real"
                          >
                            {forzandoId === tecnico.id ? "Activando..." : "▶ Forzar jornada"}
                          </button>
                        )}
                        {esAdmin && (
                          <button
                            type="button"
                            className="secondary-btn small"
                            style={{ minWidth: 100 }}
                            onClick={(e) => { e.stopPropagation(); void abrirAjustesTecnico(tecnico); }}
                          >
                            ⚙️ Ajustes
                          </button>
                        )}
                        {tecnico.celular ? (
                          <>
                            <button
                              type="button"
                              className="secondary-btn small"
                              onClick={(e) => { e.stopPropagation(); window.open(`tel:${tecnico.celular}`, "_self"); }}
                            >
                              📞 Llamar
                            </button>
                            <button
                              type="button"
                              className="secondary-btn small"
                              onClick={(e) => {
                                e.stopPropagation();
                                const digits = String(tecnico.celular).replace(/\D/g, "");
                                const phone = digits.length === 9 ? `51${digits}` : digits;
                                window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
                              }}
                            >
                              💬 WhatsApp
                            </button>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="maptech-list-card">
        <div className="panel-toolbar">
          <h3>Estadistica diaria</h3>
          <p className="panel-meta">Distancia, trayectos, tiempos detenidos y velocidad.</p>
          <div className="maptech-actions">
            <button type="button" className="secondary-btn small" onClick={exportarKml} disabled={statsPoints.length === 0}>
              ⬇ Exportar KML
            </button>
            <button type="button" className="secondary-btn small" onClick={compartirWhatsapp} disabled={!statsData}>
              📤 Compartir por WhatsApp
            </button>
          </div>
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

      {ajustesTecnico ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
          }}
          onClick={() => setAjustesTecnico(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" }}>
            <h3 style={{ marginTop: 0, marginBottom: 4, color: "#1e293b" }}>⚙️ Ajustes de seguimiento</h3>
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 0, marginBottom: 14 }}>
              {ajustesTecnico.nombre} -- el celular revisa esta configuracion y la aplica sin que el tecnico tenga que reabrir la app.
            </p>

            {ajustesCargando ? (
              <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Cargando...</p>
            ) : (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#475569", cursor: "pointer" }}>
                  <input type="checkbox" checked={cfgHabilitado} onChange={(e) => setCfgHabilitado(e.target.checked)} />
                  Seguimiento habilitado
                </label>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: "3px 0 14px" }}>
                  Si se apaga, el tecnico ya no reporta ubicacion aunque inicie jornada.
                </p>

                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Inicio de jornada</label>
                <div style={{ display: "flex", gap: 6, marginTop: 6, marginBottom: 14 }}>
                  {[
                    { key: "manual", label: "Manual (el tecnico toca Iniciar)" },
                    { key: "auto", label: "Automatico" },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setCfgModoTurno(m.key)}
                      style={{
                        padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: `1.5px solid ${cfgModoTurno === m.key ? "#111827" : "#e2e8f0"}`,
                        background: cfgModoTurno === m.key ? "#F3F4F6" : "#fff",
                        color: cfgModoTurno === m.key ? "#111827" : "#64748b",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Perfil</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, marginBottom: 14 }}>
                  {[
                    { key: "preciso", label: "Preciso" },
                    { key: "general", label: "General" },
                    { key: "ahorro", label: "Ahorro de bateria" },
                    { key: "ahorro_max", label: "Ahorro maximo" },
                    { key: "personalizado", label: "Personalizado" },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => elegirPerfilTecnico(p.key)}
                      style={{
                        padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: `1.5px solid ${cfgPerfil === p.key ? "#111827" : "#e2e8f0"}`,
                        background: cfgPerfil === p.key ? "#F3F4F6" : "#fff",
                        color: cfgPerfil === p.key ? "#111827" : "#64748b",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {[
                  { label: "Frecuencia de registro (segundos)", value: cfgFrecuencia, set: setCfgFrecuencia, hint: "Cada cuanto se le pide posicion al GPS." },
                  { label: "Distancia minima (metros)", value: cfgDistMin, set: setCfgDistMin, hint: "Distancia minima entre puntos guardados en la ruta." },
                  { label: "Distancia maxima (metros)", value: cfgDistMax, set: setCfgDistMax, hint: "Si dos puntos quedan mas lejos que esto, se corta el tramo." },
                  { label: "Precision GPS (metros)", value: cfgPrecision, set: setCfgPrecision, hint: "Si la precision es peor que esto, se ignora esa lectura." },
                ].map((f) => (
                  <div key={f.label} style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{f.label}</label>
                    <input
                      type="number"
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      disabled={cfgPerfil !== "personalizado"}
                      style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 8px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13 }}
                    />
                    <p style={{ fontSize: 11, color: "#94a3b8", margin: "3px 0 0" }}>{f.hint}</p>
                  </div>
                ))}

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#475569", marginTop: 6, cursor: cfgPerfil === "personalizado" ? "pointer" : "default" }}>
                  <input type="checkbox" checked={cfgFiltrado} disabled={cfgPerfil !== "personalizado"} onChange={(e) => setCfgFiltrado(e.target.checked)} />
                  Filtrado adicional (suavizado)
                </label>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: "3px 0 14px" }}>
                  Suaviza el ruido normal del GPS. Recomendado solo en el perfil "Preciso".
                </p>

                {ajustesError ? <p className="warn-text" style={{ marginTop: 0 }}>{ajustesError}</p> : null}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="secondary-btn small" onClick={() => setAjustesTecnico(null)} disabled={ajustesGuardando}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void guardarAjustesTecnico()}
                    disabled={ajustesGuardando}
                    style={{ background: "#111827", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    {ajustesGuardando ? "Guardando..." : "Guardar"}
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
