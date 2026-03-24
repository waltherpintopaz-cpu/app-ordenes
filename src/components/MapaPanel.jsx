import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const APPSHEET_APP_NAME = String(import.meta.env.VITE_APPSHEET_APP_NAME || "Actuaciones02-637142196").trim();
const APPSHEET_TABLE_NAME = String(import.meta.env.VITE_APPSHEET_TABLE_NAME || "Tabla_1").trim();
const NODOS_BASE = ["Nod_01", "Nod_02", "Nod_03", "Nod_04", "Nod_05", "Nod_06"];
const ORDENES_MAX = 90;
const CAJAS_MAX = 140;

const parseCoords = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const p = raw.split(",").map((x) => Number(String(x).trim()));
  if (p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  if (p[0] < -90 || p[0] > 90 || p[1] < -180 || p[1] > 180) return null;
  return { lat: p[0], lng: p[1] };
};
const safeIncludes = (value, query) => String(value || "").toLowerCase().includes(query);
const normalizarFotoCaja = (filePath = "", explicitUrl = "", appName = "", tableName = "") => {
  const direct = String(explicitUrl || "").trim();
  if (/^(https?:\/\/|data:image\/|file:\/\/)/i.test(direct)) return direct;
  const raw = String(filePath || "").trim();
  if (!raw) return "";
  if (/^(https?:\/\/|data:image\/|file:\/\/)/i.test(raw)) return raw;
  const cleaned = raw.replace(/\\/g, "/").replace(/^[^/:\n]+::/, "");
  if (!cleaned) return "";
  return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(String(appName || APPSHEET_APP_NAME).trim())}&tableName=${encodeURIComponent(String(tableName || APPSHEET_TABLE_NAME).trim())}&fileName=${encodeURIComponent(cleaned)}`;
};
const tipoColor = (tipoActuacion = "") => {
  const t = String(tipoActuacion || "").toLowerCase();
  if (t.includes("instal")) return "#214a99";
  if (t.includes("inciden") || t.includes("atencion")) return "#f58700";
  if (t.includes("manten")) return "#6b7280";
  return "#2f95e6";
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

export default function MapaPanel({ sessionUser, rolSesion, aplicaFiltroNodosGestora, nodosSesionPermitidos = [], ordenesFallback = [] }) {
  const [ordenes, setOrdenes] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroNodo, setFiltroNodo] = useState("TODOS");
  const [nodos, setNodos] = useState([]);
  const [showCajas, setShowCajas] = useState(true);
  const [mapType, setMapType] = useState("roadmap");
  const [selectedTipo, setSelectedTipo] = useState("orden");
  const [selectedId, setSelectedId] = useState("");
  const mapCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const markersRef = useRef([]);
  const shouldAutoFrameRef = useRef(true);

  const limpiarMarkers = useCallback(() => {
    markersRef.current.forEach((m) => {
      try {
        m.setMap(null);
      } catch {
        // noop
      }
    });
    markersRef.current = [];
  }, []);

  const cargar = useCallback(async () => {
    const nombreSesion = String(sessionUser?.nombre || "").trim();
    setLoading(true);
    try {
      let ordenRows = [];
      let cajasRows = [];
      let err = "";
      let warn = "";
      if (isSupabaseConfigured) {
        try {
          const { data, error: e } = await supabase.from("ordenes").select("id,codigo,nombre,dni,estado,tecnico,autor_orden,nodo,direccion,ubicacion,tipo_actuacion").order("id", { ascending: false }).limit(450);
          if (e) throw e;
          let rows = Array.isArray(data) ? data : [];
          if (rolSesion === "Tecnico" && nombreSesion) rows = rows.filter((r) => String(r?.tecnico || "").trim() === nombreSesion);
          if (rolSesion === "Gestora") {
            if (aplicaFiltroNodosGestora) rows = rows.filter((r) => nodosSesionPermitidos.includes(String(r?.nodo || "").trim()));
            else if (nombreSesion) rows = rows.filter((r) => String(r?.autor_orden || "").trim() === nombreSesion);
          }
          ordenRows = rows.filter((r) => String(r?.estado || "").toLowerCase().includes("pendient")).map((r) => ({ ...r, coords: parseCoords(r?.ubicacion) })).filter((r) => r.coords);
        } catch (e) {
          err = String(e?.message || "No se pudieron cargar ordenes.");
        }
        try {
          const view = await supabase.from("nap_cajas_mapa").select("id,ctoid,codigo,sector,nodo,ubicacion,lat,lng,photo_nap,photo_parametro,photo_nap_url,photo_parametro_url,appsheet_app_name,appsheet_table_name").limit(800);
          const table = view.error ? await supabase.from("nap_cajas").select("ctoid,codigo,sector,nodo,ubicacion,lat,lng,photo_nap,photo_parametro,appsheet_app_name,appsheet_table_name").limit(800) : null;
          if (view.error && table?.error) throw table.error;
          const rows = Array.isArray(view.error ? table?.data : view.data) ? (view.error ? table.data : view.data) : [];
          cajasRows = rows.map((r) => ({ ...r, uid: String(r?.id || r?.ctoid || `${r?.codigo || ""}-${r?.nodo || ""}`), coords: Number.isFinite(Number(r?.lat)) && Number.isFinite(Number(r?.lng)) ? { lat: Number(r.lat), lng: Number(r.lng) } : parseCoords(r?.ubicacion), photo_nap_url: normalizarFotoCaja(r?.photo_nap, r?.photo_nap_url, r?.appsheet_app_name, r?.appsheet_table_name), photo_parametro_url: normalizarFotoCaja(r?.photo_parametro, r?.photo_parametro_url, r?.appsheet_app_name, r?.appsheet_table_name) })).filter((r) => r.coords);
          if (rolSesion === "Gestora" && aplicaFiltroNodosGestora) cajasRows = cajasRows.filter((r) => nodosSesionPermitidos.includes(String(r?.nodo || "").trim()));
        } catch (e) {
          warn = `Cajas NAP no disponibles: ${String(e?.message || "error")}`;
        }
      } else {
        ordenRows = (Array.isArray(ordenesFallback) ? ordenesFallback : []).filter((r) => String(r?.estado || "").toLowerCase().includes("pendient")).map((r) => ({ ...r, tipo_actuacion: r?.tipoActuacion, coords: parseCoords(r?.ubicacion) })).filter((r) => r.coords);
        err = "Supabase no configurado. Mostrando solo ordenes locales.";
      }
      setOrdenes(ordenRows);
      setCajas(cajasRows);
      setError(err);
      setWarning(warn);
      const nodosSet = new Set(aplicaFiltroNodosGestora ? nodosSesionPermitidos : NODOS_BASE);
      ordenRows.forEach((r) => String(r?.nodo || "").trim() && nodosSet.add(String(r.nodo).trim()));
      cajasRows.forEach((r) => String(r?.nodo || "").trim() && nodosSet.add(String(r.nodo).trim()));
      setNodos(Array.from(nodosSet).filter(Boolean));
    } finally {
      setLoading(false);
    }
  }, [sessionUser?.nombre, rolSesion, aplicaFiltroNodosGestora, nodosSesionPermitidos, ordenesFallback]);

  useEffect(() => {
    void cargar();
    // La vista mapa debe cargar una sola vez al abrirse; los refrescos posteriores
    // quedan solo bajo el boton manual "Actualizar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    shouldAutoFrameRef.current = true;
  }, [filtroNodo, busqueda, showCajas]);

  const ordenesFiltradas = useMemo(() => {
    const q = String(busqueda || "").trim().toLowerCase();
    const base = filtroNodo === "TODOS" ? ordenes : ordenes.filter((r) => String(r?.nodo || "").trim() === filtroNodo);
    return q ? base.filter((r) => safeIncludes(r?.codigo, q) || safeIncludes(r?.nombre, q) || safeIncludes(r?.dni, q) || safeIncludes(r?.nodo, q) || safeIncludes(r?.direccion, q)) : base;
  }, [ordenes, filtroNodo, busqueda]);
  const cajasFiltradas = useMemo(() => {
    const q = String(busqueda || "").trim().toLowerCase();
    const base = filtroNodo === "TODOS" ? cajas : cajas.filter((r) => String(r?.nodo || "").trim() === filtroNodo);
    return q ? base.filter((r) => safeIncludes(r?.codigo, q) || safeIncludes(r?.sector, q) || safeIncludes(r?.nodo, q) || safeIncludes(r?.ctoid, q)) : base;
  }, [cajas, filtroNodo, busqueda]);
  const detalle = useMemo(() => selectedTipo === "caja" ? cajasFiltradas.find((r) => String(r.uid) === String(selectedId)) : ordenesFiltradas.find((r) => String(r.id) === String(selectedId)), [selectedTipo, selectedId, ordenesFiltradas, cajasFiltradas]);

  useEffect(() => {
    let cancelled = false;
    if (!mapCanvasRef.current) return undefined;
    setMapReady(false);
    setMapError("");
    loadGoogleMapsSdk().then((maps) => {
      if (cancelled || !mapCanvasRef.current) return;
      mapsRef.current = maps;
      if (!mapRef.current) {
        mapRef.current = new maps.Map(mapCanvasRef.current, { center: DEFAULT_CENTER, zoom: 13, mapTypeId: mapType, streetViewControl: false, mapTypeControl: false, fullscreenControl: true, gestureHandling: "greedy" });
        mapRef.current.addListener("dragstart", () => {
          shouldAutoFrameRef.current = false;
        });
        mapRef.current.addListener("zoom_changed", () => {
          shouldAutoFrameRef.current = false;
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
    }).catch((e) => {
      if (cancelled) return;
      setMapReady(false);
      setMapError(String(e?.message || "No se pudo cargar Google Maps."));
    });
    return () => { cancelled = true; };
  }, [mapType]);

  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    limpiarMarkers();
    const points = [];
    ordenesFiltradas.slice(0, ORDENES_MAX).forEach((item) => {
      const m = new maps.Marker({ map, position: { lat: Number(item.coords.lat), lng: Number(item.coords.lng) }, icon: { path: maps.SymbolPath.CIRCLE, fillColor: tipoColor(item?.tipo_actuacion), fillOpacity: 0.95, strokeColor: "#ffffff", strokeWeight: 1.4, scale: 7.5 } });
      m.addListener("click", () => { setSelectedTipo("orden"); setSelectedId(String(item.id || "")); });
      markersRef.current.push(m);
      points.push({ lat: Number(item.coords.lat), lng: Number(item.coords.lng) });
    });
    if (showCajas) {
      cajasFiltradas.slice(0, CAJAS_MAX).forEach((caja) => {
        const m = new maps.Marker({ map, position: { lat: Number(caja.coords.lat), lng: Number(caja.coords.lng) }, icon: { path: maps.SymbolPath.CIRCLE, fillColor: "#6b7280", fillOpacity: 0.92, strokeColor: "#ffffff", strokeWeight: 1.4, scale: 6 } });
        m.addListener("click", () => { setSelectedTipo("caja"); setSelectedId(String(caja.uid || "")); });
        markersRef.current.push(m);
        points.push({ lat: Number(caja.coords.lat), lng: Number(caja.coords.lng) });
      });
    }
    if (shouldAutoFrameRef.current) {
      if (points.length === 1) {
        map.panTo(points[0]);
        map.setZoom(16);
      } else if (points.length > 1) {
        const b = new maps.LatLngBounds();
        points.slice(0, 220).forEach((p) => b.extend(p));
        map.fitBounds(b);
      }
      shouldAutoFrameRef.current = false;
    }
    return () => limpiarMarkers();
  }, [limpiarMarkers, ordenesFiltradas, cajasFiltradas, showCajas]);

  const centrar = (item, tipo) => {
    if (!item?.coords || !mapRef.current) return;
    shouldAutoFrameRef.current = false;
    setSelectedTipo(tipo);
    setSelectedId(String(tipo === "orden" ? item.id : item.uid));
    mapRef.current.panTo({ lat: Number(item.coords.lat), lng: Number(item.coords.lng) });
    mapRef.current.setZoom(16);
  };
  const llegar = (item) => {
    const query = item?.coords ? `${item.coords.lat}, ${item.coords.lng}` : String(item?.ubicacion || item?.direccion || "").trim();
    if (!query) return window.alert("No hay ubicacion registrada.");
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="panel maptech-panel">
      <div className="panel-toolbar">
        <h2>Mapa tecnico</h2>
        <button type="button" className="secondary-btn small" onClick={() => void cargar()} disabled={loading}>{loading ? "Actualizando..." : "Actualizar"}</button>
      </div>
      <p className="panel-meta">Ordenes: {ordenesFiltradas.length} | Cajas NAP: {cajasFiltradas.length}</p>
      {error ? <p className="warn-text">{error}</p> : null}
      {warning ? <p className="warn-text">{warning}</p> : null}
      {mapError ? <p className="warn-text">{mapError}</p> : null}
      <input className="panel-search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por codigo, cliente, DNI, nodo, caja..." />
      <div className="maptech-controls">
        <div className="maptech-pills">
          <button type="button" className={filtroNodo === "TODOS" ? "maptech-pill active" : "maptech-pill"} onClick={() => setFiltroNodo("TODOS")}>Todos</button>
          {nodos.map((nodo) => <button key={nodo} type="button" className={filtroNodo === nodo ? "maptech-pill active" : "maptech-pill"} onClick={() => setFiltroNodo(nodo)}>{nodo}</button>)}
        </div>
        <div className="maptech-actions">
          <button type="button" className={showCajas ? "secondary-btn small maptech-btn-on" : "secondary-btn small"} onClick={() => setShowCajas((v) => !v)}>{showCajas ? "Desactivar cajas" : "Activar cajas"}</button>
          <button type="button" className="secondary-btn small" onClick={() => setMapType((v) => (v === "roadmap" ? "satellite" : "roadmap"))}>{mapType === "roadmap" ? "Vista satelital" : "Vista normal"}</button>
        </div>
      </div>
      <div className="maptech-map-card">
        <div ref={mapCanvasRef} className="google-map-canvas maptech-map-canvas" />
        {!mapReady || mapError ? (
          <div className="map-fallback">
            <p>{mapError || "Cargando mapa..."}</p>
            <iframe
              title="Mapa fallback"
              src={`https://www.google.com/maps?q=${encodeURIComponent(
                String(detalle?.ubicacion || detalle?.direccion || "-16.438490, -71.598208")
              )}&z=15&output=embed`}
              loading="lazy"
            />
          </div>
        ) : null}
        {detalle ? (
          <article className="maptech-detail">
            <div className="maptech-detail-head">
              <strong>{selectedTipo === "orden" ? detalle?.codigo || "SIN-CODIGO" : `Caja ${detalle?.codigo || "-"}`}</strong>
            </div>
            <p>{selectedTipo === "orden" ? detalle?.nombre || "-" : `Sector: ${detalle?.sector || "-"}`}</p>
            <p>Nodo: {detalle?.nodo || "-"}</p>
            <p>{selectedTipo === "orden" ? `Dir: ${detalle?.direccion || "-"}` : `Ubic: ${detalle?.ubicacion || "-"}`}</p>
            <div className="maptech-detail-actions">
              <button type="button" className="primary-btn small" onClick={() => llegar(detalle)}>Llegar</button>
              {selectedTipo === "caja" ? <button type="button" className="secondary-btn small" onClick={() => window.open(detalle?.photo_nap_url || detalle?.photo_parametro_url || "", "_blank", "noopener,noreferrer")}>Foto</button> : null}
            </div>
          </article>
        ) : null}
      </div>
      <div className="maptech-lists">
        <section className="maptech-list-card">
          <h3>Ordenes pendientes ({ordenesFiltradas.length})</h3>
          <div className="maptech-list">
            {ordenesFiltradas.map((item) => (
              <button key={String(item.id)} type="button" className={selectedTipo === "orden" && String(selectedId) === String(item.id) ? "maptech-row active" : "maptech-row"} onClick={() => centrar(item, "orden")}>
                <p className="maptech-row-title">{item.codigo || "SIN-CODIGO"}</p>
                <p className="maptech-row-meta">{item.nombre || "-"} | {item.dni || "-"}</p>
                <p className="maptech-row-meta">{item.nodo || "-"} | {item.tipo_actuacion || "-"}</p>
              </button>
            ))}
          </div>
        </section>
        {showCajas ? (
          <section className="maptech-list-card">
            <h3>Cajas NAP ({cajasFiltradas.length})</h3>
            <div className="maptech-list">
              {cajasFiltradas.map((caja) => (
                <button key={String(caja.uid)} type="button" className={selectedTipo === "caja" && String(selectedId) === String(caja.uid) ? "maptech-row active" : "maptech-row"} onClick={() => centrar(caja, "caja")}>
                  <p className="maptech-row-title">Caja {caja.codigo || "-"}</p>
                  <p className="maptech-row-meta">Sector: {caja.sector || "-"}</p>
                  <p className="maptech-row-meta">Nodo: {caja.nodo || "-"}</p>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
