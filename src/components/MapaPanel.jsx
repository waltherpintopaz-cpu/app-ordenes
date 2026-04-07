import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o").trim();
const APPSHEET_APP_NAME = String(import.meta.env.VITE_APPSHEET_APP_NAME || "Actuaciones02-637142196").trim();
const APPSHEET_TABLE_NAME = String(import.meta.env.VITE_APPSHEET_TABLE_NAME || "Tabla_1").trim();
const NODOS_BASE = ["Nod_01", "Nod_02", "Nod_03", "Nod_04", "Nod_05", "Nod_06"];
const ORDENES_MAX = 450;
const CAJAS_MAX = 1600;
const RENDER_ORDENES = 90;
const RENDER_CAJAS = 140;
const NEAR_TOP = 20;
const NEAR_LINES = 5;
const RADIO_CAJA_ORDEN = 400; // metros — radio para mostrar cajas cercanas a cada orden

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

const tipoColor = (tipo = "") => {
  const t = String(tipo || "").toLowerCase();
  if (t.includes("instal")) return "#1E4F9C";
  if (t.includes("inciden") || t.includes("atencion")) return "#E65C00";
  if (t.includes("manten")) return "#6b7280";
  return "#2f95e6";
};

const haversineM = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDist = (m) => m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;

const generarCodigoCaja = () => {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const parte1 = String(Math.floor(Math.random() * 99) + 1).padStart(2, "0");
  const parte2 = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  const sufijo = letras[Math.floor(Math.random() * letras.length)];
  return `NAP-${parte1}-${parte2}${sufijo}`;
};

const loadGoogleMapsSdk = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("Sin navegador."));
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error("Sin token Google Maps."));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (window.__gmapsPromise) return window.__gmapsPromise;
  window.__gmapsPromise = new Promise((resolve, reject) => {
    const prev = document.getElementById("google-maps-js-sdk");
    if (prev) {
      prev.addEventListener("load", () => resolve(window.google.maps), { once: true });
      prev.addEventListener("error", () => reject(new Error("No se pudo cargar Google Maps.")), { once: true });
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

// SVG icono caja NAP — replica exacta del componente NapCajaPin de la app mobile
const napBoxSvg = (portColor = "#0284c7", selected = false) => {
  const W = selected ? 28 : 22;
  const H = selected ? 40 : 32;
  const borderColor = selected ? "#F97316" : "#64748b";
  const triColor = selected ? "#F97316" : "#64748b";
  const sw = selected ? 2 : 0.8;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 28 40"><rect x="3" y="0.5" width="22" height="33" rx="3" fill="#cfd8dc" stroke="${borderColor}" stroke-width="${sw}"/><rect x="0" y="7" width="3" height="6" rx="1" fill="#a8bcc5"/><rect x="0" y="19" width="3" height="6" rx="1" fill="#a8bcc5"/><rect x="25" y="7" width="3" height="6" rx="1" fill="#a8bcc5"/><rect x="25" y="19" width="3" height="6" rx="1" fill="#a8bcc5"/><line x1="6" y1="7" x2="22" y2="7" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="11" x2="22" y2="11" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="15" x2="22" y2="15" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="19" x2="22" y2="19" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="23" x2="22" y2="23" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="30" r="1.5" fill="${portColor}"/><circle cx="10" cy="30" r="1.5" fill="${portColor}"/><circle cx="13" cy="30" r="1.5" fill="${portColor}"/><circle cx="16" cy="30" r="1.5" fill="${portColor}"/><circle cx="19" cy="30" r="1.5" fill="#64748b"/><circle cx="22" cy="30" r="1.5" fill="#64748b"/><polygon points="14,34 9,40 19,40" fill="${triColor}"/></svg>`)}`;
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
  const [selectedTipo, setSelectedTipo] = useState("caja");
  const [selectedId, setSelectedId] = useState("");
  const [fullScreen, setFullScreen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [miUbicacion, setMiUbicacion] = useState(null); // { lat, lng }
  const [busquedaUbicacion, setBusquedaUbicacion] = useState("");
  const [geocodingLoading, setGeocodingLoading] = useState(false);
  const [simCajaSelUid, setSimCajaSelUid] = useState("");
  const [clientesCaja, setClientesCaja] = useState([]);
  const [clientesCajaLoading, setClientesCajaLoading] = useState(false);
  const [tab, setTab] = useState("cajas"); // "cajas" | "ordenes" | "cercanas"
  const [showCajaEditor, setShowCajaEditor] = useState(false);
  const [cajaEditorMode, setCajaEditorMode] = useState("create");
  const [cajaForm, setCajaForm] = useState({ codigo: "", sector: "", nodo: "", ubicacion: "", ctoid: "" });
  const [savingCaja, setSavingCaja] = useState(false);
  const [editingCajaRef, setEditingCajaRef] = useState(null);

  const mapCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const gpsMarkerRef = useRef(null);
  const gpsCircleRef = useRef(null);
  const shouldAutoFrameRef = useRef(true);

  const limpiarMarkers = useCallback(() => {
    markersRef.current.forEach((m) => { try { m.setMap(null); } catch { } });
    markersRef.current = [];
    polylinesRef.current.forEach((l) => { try { l.setMap(null); } catch { } });
    polylinesRef.current = [];
  }, []);

  const cargar = useCallback(async () => {
    const nombreSesion = String(sessionUser?.nombre || "").trim();
    setLoading(true);
    try {
      let ordenRows = [], cajasRows = [], err = "", warn = "";
      if (isSupabaseConfigured) {
        try {
          const { data, error: e } = await supabase
            .from("ordenes")
            .select("id,codigo,nombre,dni,estado,tecnico,autor_orden,nodo,direccion,ubicacion,tipo_actuacion,celular,fecha_actuacion")
            .order("id", { ascending: false })
            .limit(ORDENES_MAX);
          if (e) throw e;
          let rows = Array.isArray(data) ? data : [];
          if (rolSesion === "Tecnico" && nombreSesion) rows = rows.filter((r) => String(r?.tecnico || "").trim() === nombreSesion);
          if (rolSesion === "Gestora") {
            if (aplicaFiltroNodosGestora) rows = rows.filter((r) => nodosSesionPermitidos.includes(String(r?.nodo || "").trim()));
            else if (nombreSesion) rows = rows.filter((r) => String(r?.autor_orden || "").trim() === nombreSesion);
          }
          ordenRows = rows
            .filter((r) => String(r?.estado || "").toLowerCase().includes("pendient"))
            .map((r) => ({ ...r, coords: parseCoords(r?.ubicacion) }))
            .filter((r) => r.coords);
        } catch (e) { err = String(e?.message || "No se pudieron cargar ordenes."); }

        try {
          const view = await supabase
            .from("nap_cajas_mapa")
            .select("id,ctoid,codigo,sector,nodo,ubicacion,lat,lng,photo_nap,photo_parametro,photo_nap_url,photo_parametro_url,appsheet_app_name,appsheet_table_name,capacidad,puertos_ocupados")
            .limit(CAJAS_MAX);
          const table = view.error
            ? await supabase.from("nap_cajas").select("id,ctoid,codigo,sector,nodo,ubicacion,lat,lng,photo_nap,photo_parametro,appsheet_app_name,appsheet_table_name,capacidad,puertos_ocupados").limit(CAJAS_MAX)
            : null;
          if (view.error && table?.error) throw table.error;
          const rows = Array.isArray(view.error ? table?.data : view.data) ? (view.error ? table.data : view.data) : [];
          cajasRows = rows.map((r) => {
            const coords = (Number.isFinite(Number(r?.lat)) && Number.isFinite(Number(r?.lng)))
              ? { lat: Number(r.lat), lng: Number(r.lng) }
              : parseCoords(r?.ubicacion);
            if (!coords) return null;
            return {
              ...r,
              uid: String(r?.id || r?.ctoid || `${r?.codigo || ""}-${r?.nodo || ""}`),
              coords,
              photo_nap_url: normalizarFotoCaja(r?.photo_nap, r?.photo_nap_url, r?.appsheet_app_name, r?.appsheet_table_name),
              photo_parametro_url: normalizarFotoCaja(r?.photo_parametro, r?.photo_parametro_url, r?.appsheet_app_name, r?.appsheet_table_name),
            };
          }).filter(Boolean);
          if (rolSesion === "Gestora" && aplicaFiltroNodosGestora)
            cajasRows = cajasRows.filter((r) => nodosSesionPermitidos.includes(String(r?.nodo || "").trim()));
        } catch (e) { warn = `Cajas NAP no disponibles: ${String(e?.message || "error")}`; }
      } else {
        ordenRows = (Array.isArray(ordenesFallback) ? ordenesFallback : [])
          .filter((r) => String(r?.estado || "").toLowerCase().includes("pendient"))
          .map((r) => ({ ...r, tipo_actuacion: r?.tipoActuacion, coords: parseCoords(r?.ubicacion) }))
          .filter((r) => r.coords);
        err = "Supabase no configurado. Solo ordenes locales.";
      }

      setOrdenes(ordenRows);
      setCajas(cajasRows);
      setError(err);
      setWarning(warn);
      const nodosSet = new Set(aplicaFiltroNodosGestora ? nodosSesionPermitidos : NODOS_BASE);
      ordenRows.forEach((r) => String(r?.nodo || "").trim() && nodosSet.add(String(r.nodo).trim()));
      cajasRows.forEach((r) => String(r?.nodo || "").trim() && nodosSet.add(String(r.nodo).trim()));
      setNodos(Array.from(nodosSet).filter(Boolean));
    } finally { setLoading(false); }
  }, [sessionUser?.nombre, rolSesion, aplicaFiltroNodosGestora, nodosSesionPermitidos, ordenesFallback]);

  useEffect(() => { void cargar(); }, []); // eslint-disable-line

  const obtenerGPS = useCallback(() => {
    if (!navigator.geolocation) { setError("GPS no disponible en este navegador."); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMiUbicacion({ lat, lng });
        setGpsLoading(false);
        if (mapRef.current) {
          mapRef.current.panTo({ lat, lng });
          mapRef.current.setZoom(16);
        }
      },
      () => { setGpsLoading(false); setError("No se pudo obtener ubicación GPS."); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => { obtenerGPS(); }, []); // eslint-disable-line

  // Cuando el mapa termina de cargar, centrar en la ubicación GPS si ya está disponible
  useEffect(() => {
    if (mapReady && miUbicacion && mapRef.current) {
      mapRef.current.panTo({ lat: miUbicacion.lat, lng: miUbicacion.lng });
      mapRef.current.setZoom(16);
    }
  }, [mapReady]); // eslint-disable-line

  // Limpiar selección al cambiar ubicación
  useEffect(() => { setSimCajaSelUid(""); setClientesCaja([]); }, [miUbicacion]);

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

  const cajasNearAll = useMemo(() => {
    if (!miUbicacion) return [];
    return cajasFiltradas
      .filter((c) => c.coords?.lat && c.coords?.lng)
      .map((c) => ({ ...c, dist: haversineM(miUbicacion.lat, miUbicacion.lng, Number(c.coords.lat), Number(c.coords.lng)) }))
      .sort((a, b) => a.dist - b.dist);
  }, [miUbicacion, cajasFiltradas]);
  const cajasNear20 = useMemo(() => cajasNearAll.slice(0, NEAR_TOP), [cajasNearAll]);
  const cajasNear5 = useMemo(() => cajasNearAll.slice(0, NEAR_LINES), [cajasNearAll]);

  // Cajas visibles: solo las que están dentro del radio del marcador de ubicación
  const cajasVisibles = useMemo(() => {
    if (!showCajas) return [];
    if (!miUbicacion) return cajasFiltradas;
    return cajasFiltradas.filter((c) =>
      haversineM(miUbicacion.lat, miUbicacion.lng, Number(c.coords.lat), Number(c.coords.lng)) <= RADIO_CAJA_ORDEN * 2
    );
  }, [cajasFiltradas, showCajas, miUbicacion]);

  const detalle = useMemo(() => {
    if (!selectedId) return null;
    if (selectedTipo === "caja") return cajasFiltradas.find((r) => String(r.uid) === String(selectedId)) || null;
    return ordenesFiltradas.find((r) => String(r.id) === String(selectedId)) || null;
  }, [selectedTipo, selectedId, ordenesFiltradas, cajasFiltradas]);

  // Inicializar mapa
  useEffect(() => {
    let cancelled = false;
    if (!mapCanvasRef.current) return undefined;
    setMapReady(false);
    setMapError("");
    loadGoogleMapsSdk().then((maps) => {
      if (cancelled || !mapCanvasRef.current) return;
      mapsRef.current = maps;
      if (!mapRef.current) {
        mapRef.current = new maps.Map(mapCanvasRef.current, {
          center: DEFAULT_CENTER, zoom: 13, mapTypeId: mapType,
          streetViewControl: false, mapTypeControl: false,
          fullscreenControl: false, gestureHandling: "greedy",
          styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }]
        });
        mapRef.current.addListener("dragstart", () => { shouldAutoFrameRef.current = false; });
        mapRef.current.addListener("zoom_changed", () => { shouldAutoFrameRef.current = false; });
        // Clic en el mapa = mover marcador de ubicación
        mapRef.current.addListener("click", (e) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          setMiUbicacion({ lat, lng });
          shouldAutoFrameRef.current = false;
        });
        setTimeout(() => {
          try { maps.event.trigger(mapRef.current, "resize"); mapRef.current.panTo(DEFAULT_CENTER); } catch { }
        }, 300);
      } else {
        mapRef.current.setMapTypeId(mapType);
        try { maps.event.trigger(mapRef.current, "resize"); } catch { }
      }
      setMapReady(true);
    }).catch((e) => {
      if (cancelled) return;
      setMapError(String(e?.message || "No se pudo cargar Google Maps."));
    });
    return () => { cancelled = true; };
  }, [mapType]);

  // Trigger resize al cambiar fullscreen
  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    setTimeout(() => {
      try { mapsRef.current.event.trigger(mapRef.current, "resize"); } catch { }
    }, 120);
  }, [fullScreen]);

  // Marcadores de ordenes y cajas
  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    limpiarMarkers();
    const points = [];

    ordenesFiltradas.slice(0, RENDER_ORDENES).forEach((item) => {
      const color = tipoColor(item?.tipo_actuacion);
      const m = new maps.Marker({
        map,
        position: { lat: Number(item.coords.lat), lng: Number(item.coords.lng) },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: color, fillOpacity: 0.95,
          strokeColor: "#ffffff", strokeWeight: 1.8, scale: 8
        },
        title: String(item?.codigo || item?.nombre || ""),
        zIndex: selectedTipo === "orden" && String(selectedId) === String(item.id) ? 10 : 1,
      });
      m.addListener("click", () => { setSelectedTipo("orden"); setSelectedId(String(item.id || "")); setTab("ordenes"); shouldAutoFrameRef.current = false; });
      markersRef.current.push(m);
      points.push({ lat: Number(item.coords.lat), lng: Number(item.coords.lng) });
    });

    if (showCajas) {
      cajasVisibles.slice(0, RENDER_CAJAS).forEach((caja) => {
        const isSelected = selectedTipo === "caja" && String(selectedId) === String(caja.uid);
        const cap = Number(caja?.capacidad || 0);
        const ocp = Number(caja?.puertos_ocupados || 0);
        const llena = cap > 0 && ocp >= cap;
        const color = llena ? "#dc2626" : isSelected ? "#F97316" : "#0284c7";
        const m = new maps.Marker({
          map,
          position: { lat: Number(caja.coords.lat), lng: Number(caja.coords.lng) },
          icon: { url: napBoxSvg(color, isSelected), scaledSize: new maps.Size(isSelected ? 28 : 22, isSelected ? 40 : 32), anchor: new maps.Point(isSelected ? 14 : 11, isSelected ? 40 : 32) },
          title: `Caja ${caja.codigo || "-"} · ${caja.nodo || "-"}`,
          zIndex: isSelected ? 20 : 2,
        });
        m.addListener("click", () => { setSelectedTipo("caja"); setSelectedId(String(caja.uid || "")); setTab("cajas"); shouldAutoFrameRef.current = false; });
        markersRef.current.push(m);
        points.push({ lat: Number(caja.coords.lat), lng: Number(caja.coords.lng) });
      });
    }

    // GPS marker
    if (gpsMarkerRef.current) { try { gpsMarkerRef.current.setMap(null); } catch { } }
    if (gpsCircleRef.current) { try { gpsCircleRef.current.setMap(null); } catch { } }
    if (miUbicacion) {
      gpsMarkerRef.current = new maps.Marker({
        map,
        position: { lat: miUbicacion.lat, lng: miUbicacion.lng },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: "#2563eb", fillOpacity: 1,
          strokeColor: "#ffffff", strokeWeight: 2.5, scale: 9
        },
        title: "Mi ubicación",
        zIndex: 30,
      });
      gpsCircleRef.current = new maps.Circle({
        map,
        center: { lat: miUbicacion.lat, lng: miUbicacion.lng },
        radius: 80,
        fillColor: "#2563eb", fillOpacity: 0.12,
        strokeColor: "#2563eb", strokeOpacity: 0.3, strokeWeight: 1,
      });
      // Líneas desde marcador de ubicación a las 5 cajas más cercanas
      cajasNear5.forEach((caja, i) => {
        const opacity = 0.7 - i * 0.1;
        const line = new maps.Polyline({
          map,
          path: [{ lat: miUbicacion.lat, lng: miUbicacion.lng }, { lat: Number(caja.coords.lat), lng: Number(caja.coords.lng) }],
          geodesic: true,
          strokeColor: "#F97316", strokeOpacity: Math.max(0.2, opacity), strokeWeight: 1.5,
        });
        polylinesRef.current.push(line);
      });
    }

    if (shouldAutoFrameRef.current && points.length > 0) {
      if (points.length === 1) { map.panTo(points[0]); map.setZoom(16); }
      else {
        const b = new maps.LatLngBounds();
        points.slice(0, 220).forEach((p) => b.extend(p));
        map.fitBounds(b);
      }
      shouldAutoFrameRef.current = false;
    }
    return () => limpiarMarkers();
  }, [limpiarMarkers, ordenesFiltradas, cajasVisibles, showCajas, miUbicacion, cajasNear5, selectedId, selectedTipo]);

  // Auto-frame al cambiar filtro
  useEffect(() => { shouldAutoFrameRef.current = true; }, [filtroNodo, busqueda, showCajas]);

  // Cargar clientes de una caja seleccionada
  useEffect(() => {
    if (!simCajaSelUid || !isSupabaseConfigured) return;
    const caja = cajasFiltradas.find((c) => String(c.uid) === simCajaSelUid);
    if (!caja?.codigo) return;
    setClientesCajaLoading(true);
    setClientesCaja([]);
    supabase.from("clientes").select("id,nombre,dni,estado_servicio,celular,usuario_nodo").eq("caja_nap", caja.codigo).limit(50)
      .then(({ data }) => { setClientesCaja(Array.isArray(data) ? data : []); setClientesCajaLoading(false); })
      .catch(() => setClientesCajaLoading(false));
  }, [simCajaSelUid, cajasFiltradas]);

  const buscarUbicacion = useCallback(() => {
    const q = String(busquedaUbicacion || "").trim();
    if (!q || !mapsRef.current) return;
    setGeocodingLoading(true);
    const geocoder = new mapsRef.current.Geocoder();
    geocoder.geocode({ address: q }, (results, status) => {
      setGeocodingLoading(false);
      if (status === "OK" && results[0]) {
        const loc = results[0].geometry.location;
        const lat = loc.lat();
        const lng = loc.lng();
        setMiUbicacion({ lat, lng });
        shouldAutoFrameRef.current = false;
        if (mapRef.current) { mapRef.current.panTo({ lat, lng }); mapRef.current.setZoom(16); }
      } else {
        setError("No se encontró la ubicación ingresada.");
      }
    });
  }, [busquedaUbicacion]);

  const centrar = (item, tipo) => {
    if (!item?.coords || !mapRef.current) return;
    shouldAutoFrameRef.current = false;
    setSelectedTipo(tipo);
    setSelectedId(String(tipo === "orden" ? item.id : item.uid));
    if (tipo === "caja") setSimCajaSelUid(String(item.uid));
    mapRef.current.panTo({ lat: Number(item.coords.lat), lng: Number(item.coords.lng) });
    mapRef.current.setZoom(17);
  };

  const llegar = (item) => {
    const q = item?.coords ? `${item.coords.lat},${item.coords.lng}` : String(item?.ubicacion || item?.direccion || "").trim();
    if (!q) return alert("No hay ubicación registrada.");
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=driving`, "_blank", "noopener,noreferrer");
  };

  const guardarCaja = async () => {
    if (savingCaja || !isSupabaseConfigured) return;
    const codigo = String(cajaForm.codigo || "").trim();
    const nodo = String(cajaForm.nodo || "").trim();
    const sector = String(cajaForm.sector || "").trim();
    const ubicacion = String(cajaForm.ubicacion || "").trim();
    if (!nodo) { alert("Selecciona el nodo."); return; }
    const coords = parseCoords(ubicacion);
    const payload = { sector, nodo, ubicacion: ubicacion || "SIN_UBICACION", lat: coords?.lat || null, lng: coords?.lng || null };
    if (codigo) payload.codigo = codigo;
    setSavingCaja(true);
    try {
      if (cajaEditorMode === "edit" && editingCajaRef) {
        const q = editingCajaRef.ctoid
          ? supabase.from("nap_cajas").update(payload).eq("ctoid", editingCajaRef.ctoid)
          : editingCajaRef.id
            ? supabase.from("nap_cajas").update(payload).eq("id", editingCajaRef.id)
            : supabase.from("nap_cajas").update(payload).eq("codigo", editingCajaRef.codigo).eq("nodo", editingCajaRef.nodo);
        const { error } = await q;
        if (error) throw error;
      } else {
        const { error } = await supabase.from("nap_cajas").insert([payload]);
        if (error) throw error;
      }
      setShowCajaEditor(false);
      setCajaForm({ codigo: "", sector: "", nodo: "", ubicacion: "", ctoid: "" });
      await cargar();
    } catch (e) {
      alert(String(e?.message || "No se pudo guardar la caja."));
    } finally { setSavingCaja(false); }
  };

  // ── Estilos inline ──────────────────────────────────────────────────────────
  const panelStyle = {
    display: "flex", flexDirection: "column", gap: 0, height: fullScreen ? "100vh" : "auto",
    position: fullScreen ? "fixed" : "relative", inset: fullScreen ? 0 : "auto",
    zIndex: fullScreen ? 9999 : "auto", background: "#f8fafc",
  };
  const toolbarStyle = {
    display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
    background: "#1a3a6b", color: "#fff", flexWrap: "wrap",
  };
  const btnStyle = (active = false, color = "#2563eb") => ({
    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
    background: active ? color : "#e2e8f0", color: active ? "#fff" : "#374151",
  });
  const MAP_H = fullScreen ? "calc(100vh - 110px)" : 580;
  const mapContainerStyle = {
    display: "flex", flex: 1, overflow: "hidden", height: MAP_H,
  };
  const mapCanvasStyle = { flex: 1, minWidth: 0, height: MAP_H, position: "relative" };
  const sidebarStyle = {
    width: 300, minWidth: 280, height: "100%", overflowY: "auto", background: "#fff",
    borderLeft: "1px solid #e2e8f0", display: "flex", flexDirection: "column",
  };
  const detailCardStyle = {
    background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 10,
    padding: "12px 14px", margin: "8px 10px", fontSize: 13,
  };
  const tagStyle = (color = "#2563eb") => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 999,
    background: color + "18", color, fontWeight: 700, fontSize: 11,
  });

  return (
    <div style={panelStyle}>
      {/* ── Toolbar ── */}
      <div style={toolbarStyle}>
        <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>🗺 Mapa NAP</span>
        <button style={{ ...btnStyle(false, "#fff"), padding: "5px 10px", fontSize: 11 }} onClick={obtenerGPS} disabled={gpsLoading}>
          {gpsLoading ? "⌛ GPS..." : "📍 Mi ubicación"}
        </button>
        <button style={{ ...btnStyle(showCajas, "#0284c7") }} onClick={() => setShowCajas((v) => !v)}>
          {showCajas ? "Ocultar cajas" : "Mostrar cajas"}
        </button>
        <button style={{ ...btnStyle(mapType === "satellite", "#374151") }} onClick={() => setMapType((v) => v === "roadmap" ? "satellite" : "roadmap")}>
          {mapType === "roadmap" ? "🛰 Satélite" : "🗺 Normal"}
        </button>
        <button style={{ ...btnStyle(false, "#6b7280") }} onClick={() => void cargar()} disabled={loading}>
          {loading ? "⌛" : "🔄"}
        </button>
        <button style={{ ...btnStyle(fullScreen, "#1a3a6b") }} onClick={() => setFullScreen((v) => !v)}>
          {fullScreen ? "⊡ Salir" : "⊞ Pantalla completa"}
        </button>
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: "#f1f5f9", flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid #e2e8f0" }}>
        <input
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar código, cliente, caja, nodo..."
          style={{ flex: 1, minWidth: 180, padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12 }}
        />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["TODOS", ...nodos].map((n) => (
            <button key={n} style={{ ...btnStyle(filtroNodo === n, "#1a3a6b"), padding: "4px 10px", fontSize: 11 }} onClick={() => setFiltroNodo(n)}>{n}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "#6b7280" }}>{ordenesFiltradas.length} órd · {cajasFiltradas.length} cajas</span>
      </div>

      {/* ── Buscador de ubicación ── */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: "#eef2ff", borderBottom: "1px solid #c7d2fe", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#3730a3", whiteSpace: "nowrap" }}>📍 Ubicación:</span>
        <input
          value={busquedaUbicacion}
          onChange={(e) => setBusquedaUbicacion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscarUbicacion()}
          placeholder="Escribe una dirección o lugar..."
          style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid #a5b4fc", fontSize: 12 }}
        />
        <button
          style={{ ...btnStyle(false, "#4f46e5"), background: "#4f46e5", color: "#fff", padding: "6px 14px" }}
          onClick={buscarUbicacion}
          disabled={geocodingLoading || !busquedaUbicacion.trim()}
        >
          {geocodingLoading ? "⌛" : "Ir"}
        </button>
        {miUbicacion && (
          <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
            {miUbicacion.lat.toFixed(4)}, {miUbicacion.lng.toFixed(4)}
            {cajasNear5[0] && <> · {cajasNear5[0].codigo} a {formatDist(cajasNear5[0].dist)}</>}
          </span>
        )}
      </div>

      {/* ── Alertas ── */}
      {(error || warning || mapError) && (
        <div style={{ padding: "6px 12px", background: "#fef3c7", color: "#92400e", fontSize: 11, borderBottom: "1px solid #fde68a" }}>
          {error || warning || mapError}
        </div>
      )}

      {/* ── Contenido principal ── */}
      <div style={mapContainerStyle}>
        {/* Mapa */}
        <div style={mapCanvasStyle}>
          <div ref={mapCanvasRef} style={{ width: "100%", height: MAP_H }} />
          {!mapReady && !mapError && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontSize: 14, color: "#6b7280" }}>
              Cargando mapa...
            </div>
          )}
          <div style={{ position: "absolute", bottom: 12, right: 12, fontSize: 10, color: "#94a3b8", background: "#ffffffcc", borderRadius: 6, padding: "3px 8px" }}>
            Clic en el mapa para mover el marcador
          </div>
        </div>

        {/* Sidebar */}
        <div style={sidebarStyle}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0" }}>
            {[
              { key: "cajas", label: `Cajas (${cajasFiltradas.length})` },
              { key: "ordenes", label: `Órdenes (${ordenesFiltradas.length})` },
              ...(miUbicacion ? [{ key: "cercanas", label: `Cercanas (${cajasNear20.length})` }] : []),
            ].map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: "9px 4px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                background: tab === t.key ? "#fff" : "#f8fafc",
                color: tab === t.key ? "#1a3a6b" : "#6b7280",
                borderBottom: tab === t.key ? "2px solid #1a3a6b" : "none",
              }}>{t.label}</button>
            ))}
          </div>

          {/* Detalle del elemento seleccionado */}
          {detalle && (
            <div style={detailCardStyle}>
              {selectedTipo === "caja" ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#1a3a6b" }}>Caja {detalle.codigo || "-"}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>Sector: {detalle.sector || "-"} · {detalle.nodo || "-"}</div>
                    </div>
                    {detalle.capacidad > 0 && (
                      <span style={tagStyle(Number(detalle.puertos_ocupados || 0) >= Number(detalle.capacidad) ? "#dc2626" : "#0284c7")}>
                        {detalle.puertos_ocupados || 0}/{detalle.capacidad} puertos
                      </span>
                    )}
                  </div>
                  {detalle.ubicacion && <div style={{ fontSize: 11, color: "#374151", marginBottom: 6 }}>📍 {detalle.ubicacion}</div>}
                  {/* Fotos */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {detalle.photo_nap_url && (
                      <img src={detalle.photo_nap_url} alt="NAP" onClick={() => window.open(detalle.photo_nap_url, "_blank")}
                        style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: "1.5px solid #fed7aa", cursor: "zoom-in" }} />
                    )}
                    {detalle.photo_parametro_url && (
                      <img src={detalle.photo_parametro_url} alt="Parámetro" onClick={() => window.open(detalle.photo_parametro_url, "_blank")}
                        style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: "1.5px solid #fed7aa", cursor: "zoom-in" }} />
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button style={btnStyle(false, "#1a3a6b")} onClick={() => llegar(detalle)}>🧭 Llegar</button>
                    <button style={btnStyle(false, "#F97316")} onClick={() => { setSimCajaSelUid(String(detalle.uid)); }}>
                      👥 Clientes
                    </button>
                    <button style={btnStyle(false, "#6b7280")} onClick={() => { setCajaEditorMode("edit"); setEditingCajaRef(detalle); setCajaForm({ codigo: detalle.codigo || "", sector: detalle.sector || "", nodo: detalle.nodo || "", ubicacion: detalle.ubicacion || "", ctoid: String(detalle.ctoid || "") }); setShowCajaEditor(true); }}>
                      ✏️ Editar
                    </button>
                  </div>
                  {/* Clientes de la caja */}
                  {simCajaSelUid === String(detalle.uid) && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "#1a3a6b", marginBottom: 4 }}>Clientes conectados</div>
                      {clientesCajaLoading && <div style={{ fontSize: 11, color: "#6b7280" }}>Cargando...</div>}
                      {!clientesCajaLoading && clientesCaja.length === 0 && <div style={{ fontSize: 11, color: "#94a3b8" }}>Sin clientes registrados en esta caja</div>}
                      {clientesCaja.map((c) => (
                        <div key={c.id} style={{ padding: "4px 6px", borderRadius: 6, background: "#f1f5f9", marginBottom: 3, fontSize: 11 }}>
                          <div style={{ fontWeight: 700 }}>{c.nombre || "-"}</div>
                          <div style={{ color: "#6b7280" }}>{c.usuario_nodo || c.dni || "-"} · <span style={tagStyle(c.estado_servicio === "ACTIVO" ? "#16a34a" : "#dc2626")}>{c.estado_servicio || "?"}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1a3a6b", marginBottom: 4 }}>{detalle.codigo || "SIN-CÓDIGO"}</div>
                  <div style={{ fontSize: 12, color: "#374151", marginBottom: 2 }}>{detalle.nombre || "-"}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{detalle.nodo || "-"} · {detalle.tipo_actuacion || "-"}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>📍 {detalle.direccion || "-"}</div>
                  <button style={btnStyle(false, "#1a3a6b")} onClick={() => llegar(detalle)}>🧭 Llegar</button>
                </>
              )}
            </div>
          )}

          {/* Lista tab cajas */}
          {tab === "cajas" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>{cajasFiltradas.length} cajas</span>
                <button style={{ ...btnStyle(false, "#1a3a6b"), padding: "4px 10px", fontSize: 11 }} onClick={() => { setCajaEditorMode("create"); setEditingCajaRef(null); setCajaForm({ codigo: generarCodigoCaja(), sector: "", nodo: "", ubicacion: miUbicacion ? `${miUbicacion.lat.toFixed(7)}, ${miUbicacion.lng.toFixed(7)}` : "", ctoid: "" }); setShowCajaEditor(true); }}>
                  + Nueva caja
                </button>
              </div>
              {cajasFiltradas.map((caja) => {
                const isSelected = selectedTipo === "caja" && String(selectedId) === String(caja.uid);
                const cap = Number(caja?.capacidad || 0);
                const ocp = Number(caja?.puertos_ocupados || 0);
                const pct = cap > 0 ? Math.round((ocp / cap) * 100) : null;
                return (
                  <button key={String(caja.uid)} onClick={() => centrar(caja, "caja")} style={{
                    width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${isSelected ? "#F97316" : "#e2e8f0"}`,
                    background: isSelected ? "#fff7ed" : "#fff", marginBottom: 4, cursor: "pointer",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "#1a3a6b" }}>Caja {caja.codigo || "-"}</span>
                      {pct !== null && <span style={tagStyle(pct >= 90 ? "#dc2626" : pct >= 70 ? "#ea580c" : "#0284c7")}>{ocp}/{cap}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Sector: {caja.sector || "-"} · {caja.nodo || "-"}</div>
                    {miUbicacion && caja.coords && <div style={{ fontSize: 10, color: "#94a3b8" }}>{formatDist(haversineM(miUbicacion.lat, miUbicacion.lng, Number(caja.coords.lat), Number(caja.coords.lng)))}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Lista tab ordenes */}
          {tab === "ordenes" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
              {ordenesFiltradas.map((item) => {
                const isSelected = selectedTipo === "orden" && String(selectedId) === String(item.id);
                return (
                  <button key={String(item.id)} onClick={() => centrar(item, "orden")} style={{
                    width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8,
                    border: `1.5px solid ${isSelected ? tipoColor(item.tipo_actuacion) : "#e2e8f0"}`,
                    background: isSelected ? "#eff6ff" : "#fff", marginBottom: 4, cursor: "pointer",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: tipoColor(item.tipo_actuacion) }}>{item.codigo || "-"}</span>
                      <span style={tagStyle(tipoColor(item.tipo_actuacion))}>{(item.tipo_actuacion || "?").split(" ")[0]}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#374151" }}>{item.nombre || "-"}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{item.nodo || "-"} · {item.tecnico || "-"}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tab cercanas */}
          {tab === "cercanas" && miUbicacion && (
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Top {cajasNear20.length} cajas más cercanas a tu ubicación</div>
              {cajasNear20.map((caja, i) => {
                const isSelected = selectedTipo === "caja" && String(selectedId) === String(caja.uid);
                const cap = Number(caja?.capacidad || 0);
                const ocp = Number(caja?.puertos_ocupados || 0);
                return (
                  <button key={String(caja.uid)} onClick={() => centrar(caja, "caja")} style={{
                    width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8,
                    border: `1.5px solid ${isSelected ? "#F97316" : "#e2e8f0"}`,
                    background: isSelected ? "#fff7ed" : "#fff", marginBottom: 4, cursor: "pointer",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 13, color: i < 5 ? "#F97316" : "#6b7280" }}>#{i + 1}</span>
                        <span style={{ fontWeight: 700, fontSize: 12, color: "#1a3a6b" }}>Caja {caja.codigo || "-"}</span>
                      </div>
                      <span style={tagStyle("#F97316")}>{formatDist(caja.dist)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{caja.sector || "-"} · {caja.nodo || "-"}</div>
                    {cap > 0 && <div style={{ fontSize: 10, color: "#6b7280" }}>{ocp}/{cap} puertos ocupados</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal editor de caja ── */}
      {showCajaEditor && (
        <div style={{ position: "fixed", inset: 0, background: "#0006", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: 360, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1a3a6b", marginBottom: 16 }}>
              {cajaEditorMode === "edit" ? "✏️ Editar caja NAP" : "➕ Nueva caja NAP"}
            </div>
            {[
              { label: "Código", key: "codigo", placeholder: "Ej: NAP-01-001" },
              { label: "Sector", key: "sector", placeholder: "Ej: Sector A" },
              { label: "Ubicación (lat, lng)", key: "ubicacion", placeholder: "-16.438, -71.598" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>{label}</label>
                <input value={cajaForm[key]} onChange={(e) => setCajaForm((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Nodo *</label>
              <select value={cajaForm.nodo} onChange={(e) => setCajaForm((p) => ({ ...p, nodo: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13 }}>
                <option value="">Selecciona nodo...</option>
                {NODOS_BASE.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {miUbicacion && !cajaForm.ubicacion && (
              <button style={{ ...btnStyle(false, "#2563eb"), marginBottom: 12, width: "100%" }}
                onClick={() => setCajaForm((p) => ({ ...p, ubicacion: `${miUbicacion.lat.toFixed(6)}, ${miUbicacion.lng.toFixed(6)}` }))}>
                📍 Usar mi ubicación GPS
              </button>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={{ ...btnStyle(false, "#6b7280"), flex: 1 }} onClick={() => setShowCajaEditor(false)}>Cancelar</button>
              <button style={{ ...btnStyle(true, "#1a3a6b"), flex: 1 }} onClick={guardarCaja} disabled={savingCaja}>
                {savingCaja ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
