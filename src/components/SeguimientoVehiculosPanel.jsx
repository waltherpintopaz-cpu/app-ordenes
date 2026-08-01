import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
const TRAIL_COLORS = ["#1E4F9C", "#F47A20", "#00C853", "#EC4899", "#0EA5E9", "#7C3AED"];
const TRAIL_WINDOW_HOURS = 4;
const TRAIL_MAX_POINTS = 300;
const AUTO_REFRESH_MS = 15_000;
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
      const fillColor = staleMin > STALE_MIN_THRESHOLD ? "#7A8699" : colorForVehiculoId(row?.vehiculo_id);
      const marker = new maps.Marker({
        map,
        position: { lat, lng },
        title: `${row.placaLabel}${row.alias ? " — " + row.alias : ""}`,
        icon: { path: maps.SymbolPath.CIRCLE, fillColor, fillOpacity: 0.95, strokeColor: "#ffffff", strokeWeight: selected ? 2.2 : 1.4, scale: selected ? 9 : 7.4 },
      });
      marker.addListener("click", () => setSelectedId(row?.vehiculo_id));
      markersRef.current.push(marker);
    });

    if (!selectedId && rowsList.length > 0) setSelectedId(rowsList[0]?.vehiculo_id);
    if (rowsList.length > 0 && !autoFitDoneRef.current) { fitMap(); autoFitDoneRef.current = true; }

    return () => clearOverlays();
  }, [rowsList, selectedId, trailPolylines, clearOverlays, fitMap]);

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

      <div style={{ position: "relative", width: "100%", height: 460, borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
        <div ref={mapCanvasRef} style={{ width: "100%", height: "100%" }} />
        {!mapReady && !mapError && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#64748b", fontSize: 13 }}>
            Cargando mapa...
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
                </div>
              </div>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: row.staleMin > STALE_MIN_THRESHOLD ? "#94a3b8" : "#16a34a", flexShrink: 0 }} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
