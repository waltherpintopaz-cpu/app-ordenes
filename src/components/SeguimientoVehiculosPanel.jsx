import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
const TRAIL_COLORS = ["#1E4F9C", "#F47A20", "#00C853", "#EC4899", "#0EA5E9", "#7C3AED"];
const TRAIL_WINDOW_HOURS = 4;
const TRAIL_MAX_POINTS = 300;
const AUTO_REFRESH_MS = 6_000;
const STALE_MIN_THRESHOLD = 3;

const toText = (value) => String(value ?? "").trim();
const isValidCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
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

// Icono circular con la foto del vehiculo (con un anillo del color asignado)
// para que el marcador en el mapa se vea como el vehiculo real, no un punto
// generico. Se cachea por url+color para no re-dibujar en cada refresco.
const circleIconCache = new Map();
function crearIconoCircular(fotoUrl, color, onReady) {
  const cacheKey = `${fotoUrl}|${color}`;
  if (circleIconCache.has(cacheKey)) return circleIconCache.get(cacheKey);
  if (!fotoUrl) return null;

  const size = 56;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      const dataUrl = canvas.toDataURL("image/png");
      circleIconCache.set(cacheKey, dataUrl);
      onReady?.(dataUrl);
    } catch (e) {
      // Canvas "tainted" por CORS u otro fallo al exportar — no cachear el
      // fallo para permitir reintentar en el siguiente refresco, y caer al
      // circulo de color mientras tanto en vez de romper el mapa.
      console.warn("No se pudo generar el icono circular del vehiculo:", e);
    }
  };
  img.onerror = () => {
    console.warn("No se pudo cargar la foto del vehiculo para el icono:", fotoUrl);
  };
  img.src = fotoUrl;
  return null;
}

const s = {
  statBlock: { display: "flex", flexDirection: "column", gap: 2, minWidth: 90 },
  statLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },
  statValue: { fontSize: 14, color: "#1e293b" }
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
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const autoFitDoneRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  const [vehiculos, setVehiculos] = useState([]);
  const [currentRows, setCurrentRows] = useState([]);
  const [trailByVehiculo, setTrailByVehiculo] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showTrail, setShowTrail] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState(() => new Date());

  const [editVehiculo, setEditVehiculo] = useState(null);
  const [editForm, setEditForm] = useState({ placa: "", alias: "", marca: "", modelo: "", color: "", activo: true, fotoUrl: "" });
  const [editFotoFile, setEditFotoFile] = useState(null);
  const [editFotoPreview, setEditFotoPreview] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const [iconVersion, setIconVersion] = useState(0);
  const [analyticsDate, setAnalyticsDate] = useState(() => todayLocalDateStr());
  const [analyticsByVehiculo, setAnalyticsByVehiculo] = useState({});
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

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
      activo: v?.activo !== false,
      fotoUrl: toText(v?.foto_url)
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
          activo: !!editForm.activo,
          foto_url: fotoUrl || null
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
    const res = await supabase
      .from("vehiculo_ubicaciones")
      .select("vehiculo_id,lat,lng,created_at")
      .in("vehiculo_id", selectedIds)
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(12000);
    if (res.error) {
      if (tableMissing(res.error, "vehiculo_ubicaciones")) {
        setTrailByVehiculo({});
        return;
      }
      throw res.error;
    }
    const grouped = {};
    (Array.isArray(res.data) ? res.data : []).forEach((row) => {
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
      const desde = new Date(`${analyticsDate}T00:00:00`).toISOString();
      const hasta = new Date(`${analyticsDate}T23:59:59.999`).toISOString();
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
    } catch (e) {
      setAnalyticsError(String(e?.message || "No se pudo calcular el recorrido."));
    } finally {
      setLoadingAnalytics(false);
    }
  }, [analyticsDate, selectedIds]);

  const cargarTodo = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured) { setError("Supabase no esta configurado."); setLoading(false); return; }
    if (!silent) setError("");
    try {
      await Promise.all([cargarVehiculos(), cargarUbicacionActual()]);
      setLastSyncAt(new Date());
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar seguimiento de vehiculos."));
    } finally {
      setLoading(false);
    }
  }, [cargarVehiculos, cargarUbicacionActual]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([cargarUbicacionActual(), cargarTrayectorias()]);
      setLastSyncAt(new Date());
    } catch (e) {
      setError(String(e?.message || "No se pudo actualizar."));
    } finally {
      setRefreshing(false);
    }
  }, [cargarUbicacionActual, cargarTrayectorias]);

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
        return { ...row, placaLabel: toText(row?.placa) || veh?.placa || "-", alias: veh?.alias || "", fotoUrl: veh?.foto_url || "", speedKmh, staleMin };
      })
      .sort((a, b) => new Date(b?.updated_at || 0).getTime() - new Date(a?.updated_at || 0).getTime());
  }, [ubicacionesVisibles, vehiculoById]);

  const trailPolylines = useMemo(() => {
    if (!showTrail) return [];
    const visibles = new Set(ubicacionesVisibles.map((row) => row?.vehiculo_id).filter(Boolean));
    return Object.entries(trailByVehiculo || {})
      .filter(([id, pts]) => visibles.has(Number(id)) && Array.isArray(pts) && pts.length > 1)
      .map(([id, pts]) => ({ id, color: colorForVehiculoId(id), points: pts.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })) }));
  }, [showTrail, trailByVehiculo, ubicacionesVisibles]);

  const kpi = useMemo(() => {
    const total = rowsList.length;
    const activos = rowsList.filter((row) => Number(row?.staleMin || 0) <= STALE_MIN_THRESHOLD).length;
    return { total, activos, retrasados: total - activos };
  }, [rowsList]);

  const clearOverlays = useCallback(() => {
    markersRef.current.forEach((m) => { try { m.setMap(null); } catch { /* noop */ } });
    polylinesRef.current.forEach((l) => { try { l.setMap(null); } catch { /* noop */ } });
    markersRef.current = [];
    polylinesRef.current = [];
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

  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    clearOverlays();

    trailPolylines.forEach((trail) => {
      const line = new maps.Polyline({ map, path: trail.points, strokeColor: trail.color, strokeOpacity: 0.9, strokeWeight: 4 });
      polylinesRef.current.push(line);
    });

    rowsList.forEach((row) => {
      const lat = Number(row?.lat);
      const lng = Number(row?.lng);
      if (!isValidCoord(lat, lng)) return;
      const selected = row?.vehiculo_id === selectedId;
      const staleMin = Number(row?.staleMin || 0);
      const color = staleMin > STALE_MIN_THRESHOLD ? "#7A8699" : colorForVehiculoId(row?.vehiculo_id);
      const size = selected ? 54 : 44;
      const iconDataUrl = row.fotoUrl
        ? crearIconoCircular(row.fotoUrl, color, () => setIconVersion((v) => v + 1))
        : null;
      const icon = iconDataUrl
        ? { url: iconDataUrl, scaledSize: new maps.Size(size, size), anchor: new maps.Point(size / 2, size / 2) }
        : {
            path: maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 0.95,
            strokeColor: "#ffffff",
            strokeWeight: selected ? 2.2 : 1.4,
            scale: selected ? 9 : 7.4
          };
      const activityLabel = row.activity_type ? ACTIVITY_LABELS[row.activity_type] || row.activity_type : "";
      const title = [
        `${row.placaLabel}${row.alias ? " — " + row.alias : ""}`,
        row.speedKmh != null ? `${Math.round(row.speedKmh)} km/h` : null,
        row.battery_pct != null ? `Bateria ${row.battery_pct}%` : null,
        activityLabel || null
      ]
        .filter(Boolean)
        .join(" · ");
      const marker = new maps.Marker({ map, position: { lat, lng }, title, icon, zIndex: selected ? 999 : undefined });
      marker.addListener("click", () => setSelectedId(row?.vehiculo_id));
      markersRef.current.push(marker);
    });

    if (!selectedId && rowsList.length > 0) setSelectedId(rowsList[0]?.vehiculo_id);
    if (rowsList.length > 0 && !autoFitDoneRef.current) { fitMap(); autoFitDoneRef.current = true; }

    return () => clearOverlays();
  }, [rowsList, selectedId, trailPolylines, clearOverlays, fitMap, iconVersion]);

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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="date"
              value={analyticsDate}
              onChange={(e) => setAnalyticsDate(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
            />
            <button type="button" className="secondary-btn small" onClick={() => void calcularAnalitica()} disabled={loadingAnalytics}>
              {loadingAnalytics ? "Calculando..." : "Calcular"}
            </button>
          </div>
        </div>

        {analyticsError ? <p className="warn-text">{analyticsError}</p> : null}

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
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        {rowsList.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13 }}>No hay vehiculos con ubicacion registrada todavia.</p>
        ) : (
          rowsList.map((row) => (
            <div
              key={row.vehiculo_id}
              onClick={() => { setSelectedId(row.vehiculo_id); if (mapRef.current && isValidCoord(Number(row.lat), Number(row.lng))) { mapRef.current.panTo({ lat: Number(row.lat), lng: Number(row.lng) }); mapRef.current.setZoom(16); } }}
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
              </div>
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
              <label className="secondary-btn small" style={{ cursor: "pointer" }}>
                📷 {editForm.fotoUrl || editFotoPreview ? "Cambiar foto" : "Subir foto"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => onElegirFotoEdicion(e.target.files?.[0] || null)}
                />
              </label>
            </div>

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
    </section>
  );
}
