import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const DEFAULT_CENTER = { lat: -16.43849, lng: -71.598208 };
const RADIO_M = 500;
const LISTA_INICIAL = 5;
const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o").trim();

const NODO_COLORS = {
  Nod_01: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  Nod_02: { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  Nod_03: { bg: "#fef9c3", text: "#a16207", border: "#fde047" },
  Nod_04: { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
  Nod_05: { bg: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" },
  Nod_06: { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" },
};

// ── Utilidades ──────────────────────────────────────────────────────────────

const haversineM = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDist = (m) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

const parsearUbicacion = (texto) => {
  const t = String(texto || "").trim();
  if (!t) return null;
  const atM = t.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atM) { const la = +atM[1], lo = +atM[2]; if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lng: lo }; }
  const qM = t.match(/[?&]q=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (qM) { const la = +qM[1], lo = +qM[2]; if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lng: lo }; }
  const llM = t.match(/[?&]ll=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (llM) { const la = +llM[1], lo = +llM[2]; if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lng: lo }; }
  const cM = t.match(/^(-?\d{1,3}\.?\d*)\s*,\s*(-?\d{1,3}\.?\d*)$/);
  if (cM) { const la = +cM[1], lo = +cM[2]; if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lng: lo }; }
  return null;
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

// SVG de caja NAP — igual que en MapaPanel/NapCajaPin mobile
const napBoxSvg = (portColor = "#0284c7", selected = false, llena = false) => {
  const W = selected ? 28 : 22;
  const H = selected ? 40 : 32;
  const borderColor = llena ? "#dc2626" : selected ? "#F97316" : "#64748b";
  const triColor = llena ? "#dc2626" : selected ? "#F97316" : "#64748b";
  const sw = selected ? 2 : 0.8;
  const pc = llena ? "#dc2626" : portColor;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 28 40">` +
    `<rect x="3" y="0.5" width="22" height="33" rx="3" fill="#cfd8dc" stroke="${borderColor}" stroke-width="${sw}"/>` +
    `<rect x="0" y="7" width="3" height="6" rx="1" fill="#a8bcc5"/>` +
    `<rect x="0" y="19" width="3" height="6" rx="1" fill="#a8bcc5"/>` +
    `<rect x="25" y="7" width="3" height="6" rx="1" fill="#a8bcc5"/>` +
    `<rect x="25" y="19" width="3" height="6" rx="1" fill="#a8bcc5"/>` +
    `<line x1="6" y1="7" x2="22" y2="7" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="6" y1="11" x2="22" y2="11" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="6" y1="15" x2="22" y2="15" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="6" y1="19" x2="22" y2="19" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="6" y1="23" x2="22" y2="23" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>` +
    `<circle cx="7" cy="30" r="1.5" fill="${pc}"/>` +
    `<circle cx="10" cy="30" r="1.5" fill="${pc}"/>` +
    `<circle cx="13" cy="30" r="1.5" fill="${pc}"/>` +
    `<circle cx="16" cy="30" r="1.5" fill="${pc}"/>` +
    `<circle cx="19" cy="30" r="1.5" fill="#64748b"/>` +
    `<circle cx="22" cy="30" r="1.5" fill="#64748b"/>` +
    `<polygon points="14,34 9,40 19,40" fill="${triColor}"/>` +
    `</svg>`
  )}`;
};

const userPinSvg = () => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
  `<circle cx="12" cy="12" r="10" fill="rgba(29,78,216,0.15)" stroke="rgba(29,78,216,0.4)" stroke-width="1.5"/>` +
  `<circle cx="12" cy="12" r="6" fill="#1d4ed8" stroke="white" stroke-width="2.5"/>` +
  `</svg>`
)}`;

// ── CSS animación de pulso ───────────────────────────────────────────────────
const PULSE_CSS = `
@keyframes cobPulse {
  0%   { transform: scale(1);   opacity: 0.7; }
  70%  { transform: scale(2.8); opacity: 0; }
  100% { transform: scale(2.8); opacity: 0; }
}
@keyframes cobPulse2 {
  0%   { transform: scale(1);   opacity: 0.5; }
  70%  { transform: scale(2.0); opacity: 0; }
  100% { transform: scale(2.0); opacity: 0; }
}
.cob-pulse-ring1 {
  animation: cobPulse 1.8s ease-out infinite;
}
.cob-pulse-ring2 {
  animation: cobPulse2 1.8s ease-out 0.9s infinite;
}
`;

// ── Componente principal ─────────────────────────────────────────────────────

export default function CoberturaPanel({ onCrearOrden }) {
  const [cajas, setCajas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [ubicacion, setUbicacion] = useState(null); // { lat, lng }
  const [gpsLoading, setGpsLoading] = useState(false);
  const [cajaSeleccionada, setCajaSeleccionada] = useState(null);
  const [listaExpandida, setListaExpandida] = useState(false);
  const [mapType, setMapType] = useState("roadmap");
  const [fullscreen, setFullscreen] = useState(false);

  // Búsqueda por dirección (Nominatim)
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchRes, setShowSearchRes] = useState(false);
  const searchTimer = useRef(null);

  // Modal link/coords
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState("");

  // Mapa
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const mapCanvasRef = useRef(null);
  const mapCanvasFullRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  // Markers/overlays refs
  const userMarkerRef = useRef(null);
  const pulseOverlayRef = useRef(null);
  const radiusCircleRef = useRef(null);
  const napMarkersRef = useRef([]);

  // ── Inyectar CSS de pulso una sola vez ────────────────────────────────────
  useEffect(() => {
    if (document.getElementById("cob-pulse-css")) return;
    const s = document.createElement("style");
    s.id = "cob-pulse-css";
    s.textContent = PULSE_CSS;
    document.head.appendChild(s);
  }, []);

  // ── Cargar cajas NAP ──────────────────────────────────────────────────────
  const cargarCajas = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setCargando(true);
    try {
      const view = await supabase
        .from("nap_cajas_mapa")
        .select("id,ctoid,codigo,sector,nodo,ubicacion,lat,lng,capacidad,puertos_ocupados");
      const table = view.error
        ? await supabase.from("nap_cajas").select("id,ctoid,codigo,sector,nodo,ubicacion,lat,lng,capacidad,puertos_ocupados")
        : null;
      if (view.error && table?.error) throw table.error;
      const rows = Array.isArray(view.error ? table?.data : view.data) ? (view.error ? table.data : view.data) : [];
      const parsed = rows.map((r) => {
        const coords = (Number.isFinite(Number(r?.lat)) && Number.isFinite(Number(r?.lng)))
          ? { lat: Number(r.lat), lng: Number(r.lng) }
          : (() => {
            const raw = String(r?.ubicacion || "").trim();
            const p = raw.split(",").map(x => Number(x.trim()));
            return (p.length === 2 && p.every(Number.isFinite)) ? { lat: p[0], lng: p[1] } : null;
          })();
        if (!coords) return null;
        const cap = Number(r?.capacidad) || 0;
        const ocu = Number(r?.puertos_ocupados) || 0;
        const libres = Math.max(0, cap - ocu);
        return { id: String(r.id || r.ctoid || r.codigo), codigo: String(r.codigo || ""), nodo: String(r.nodo || ""), sector: String(r.sector || ""), lat: coords.lat, lng: coords.lng, capacidad: cap, ocupados: ocu, libres, llena: cap > 0 && libres === 0 };
      }).filter(Boolean);
      setCajas(parsed);
    } catch (e) {
      setError(String(e?.message || "Error cargando cajas NAP"));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargarCajas(); }, []); // eslint-disable-line

  // ── Cajas en radio 500m ───────────────────────────────────────────────────
  const cajasEnRadio = useMemo(() => {
    if (!ubicacion) return [];
    return cajas
      .map(c => ({ ...c, distancia: haversineM(ubicacion.lat, ubicacion.lng, c.lat, c.lng) }))
      .filter(c => c.distancia <= RADIO_M)
      .sort((a, b) => a.distancia - b.distancia);
  }, [cajas, ubicacion]);

  const cajaMejor = useMemo(() => {
    if (cajaSeleccionada) return cajaSeleccionada;
    return cajasEnRadio.find(c => !c.llena) || cajasEnRadio[0] || null;
  }, [cajasEnRadio, cajaSeleccionada]);

  const nodoDetectado = useMemo(() => cajaMejor?.nodo || "", [cajaMejor]);

  const cobertura = useMemo(() => {
    if (!ubicacion) return null;
    if (cajasEnRadio.length === 0) return "sin_cobertura";
    if (cajasEnRadio.some(c => !c.llena)) return "con_cobertura";
    return "llena";
  }, [ubicacion, cajasEnRadio]);

  const cajasVista = useMemo(() =>
    listaExpandida ? cajasEnRadio : cajasEnRadio.slice(0, LISTA_INICIAL),
    [cajasEnRadio, listaExpandida]
  );

  // ── GPS ───────────────────────────────────────────────────────────────────
  const obtenerGPS = useCallback(() => {
    if (!navigator.geolocation) { setError("GPS no disponible en este navegador."); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUbicacion({ lat, lng });
        setGpsLoading(false);
        if (mapRef.current) { mapRef.current.panTo({ lat, lng }); mapRef.current.setZoom(16); }
      },
      () => { setGpsLoading(false); setError("No se pudo obtener ubicación GPS."); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // ── Búsqueda Nominatim ────────────────────────────────────────────────────
  const onSearchChange = useCallback((val) => {
    setSearchQ(val);
    clearTimeout(searchTimer.current);
    if (val.trim().length < 3) { setSearchRes([]); setShowSearchRes(false); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val.trim())}&limit=5&countrycodes=pe`;
        const res = await fetch(url, { headers: { "Accept-Language": "es" } });
        const data = await res.json();
        setSearchRes(Array.isArray(data) ? data : []);
        setShowSearchRes(true);
      } catch { setSearchRes([]); }
      setSearchLoading(false);
    }, 500);
  }, []);

  const elegirResultado = useCallback((item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setUbicacion({ lat, lng });
    setSearchQ(item.display_name || "");
    setSearchRes([]);
    setShowSearchRes(false);
    if (mapRef.current) { mapRef.current.panTo({ lat, lng }); mapRef.current.setZoom(16); }
  }, []);

  // ── Modal link/coords ─────────────────────────────────────────────────────
  const aplicarLink = useCallback(() => {
    const coords = parsearUbicacion(linkInput);
    if (!coords) { setLinkError("No se reconoció ninguna coordenada válida."); return; }
    setUbicacion(coords);
    setShowLinkModal(false);
    setLinkInput("");
    setLinkError("");
    if (mapRef.current) { mapRef.current.panTo(coords); mapRef.current.setZoom(16); }
  }, [linkInput]);

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  const initMap = useCallback((container) => {
    if (!container) return;
    setMapReady(false);
    setMapError("");
    loadGoogleMapsSdk().then((maps) => {
      if (!container) return;
      mapsRef.current = maps;
      mapRef.current = new maps.Map(container, {
        center: DEFAULT_CENTER,
        zoom: 14,
        mapTypeId: mapType,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: "greedy",
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
      });
      mapRef.current.addListener("click", (e) => {
        setUbicacion({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
      setMapReady(true);
    }).catch((e) => {
      setMapError(String(e?.message || "No se pudo cargar Google Maps."));
    });
  }, []); // eslint-disable-line

  useEffect(() => {
    if (mapCanvasRef.current && !mapRef.current) {
      initMap(mapCanvasRef.current);
    }
  }, []); // eslint-disable-line

  // Al cambiar mapType, actualizar en el mapa existente
  useEffect(() => {
    if (mapRef.current && mapsRef.current) {
      mapRef.current.setMapTypeId(mapType);
    }
  }, [mapType]);

  // Trigger resize al entrar/salir fullscreen
  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return;
    const container = fullscreen ? mapCanvasFullRef.current : mapCanvasRef.current;
    if (!container) return;
    // Mover el mapa al nuevo contenedor
    setTimeout(() => {
      try {
        container.appendChild(mapRef.current.getDiv());
        mapsRef.current.event.trigger(mapRef.current, "resize");
        if (ubicacion) mapRef.current.panTo(ubicacion);
      } catch { }
    }, 80);
  }, [fullscreen]); // eslint-disable-line

  // ── Actualizar overlays cuando cambia ubicacion o cajasEnRadio ───────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;

    // Limpiar anteriores
    if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null; }
    if (pulseOverlayRef.current) { pulseOverlayRef.current.setMap(null); pulseOverlayRef.current = null; }
    if (radiusCircleRef.current) { radiusCircleRef.current.setMap(null); radiusCircleRef.current = null; }
    napMarkersRef.current.forEach(m => { try { m.setMap(null); } catch { } });
    napMarkersRef.current = [];

    if (!ubicacion) return;

    // Círculo 500m
    radiusCircleRef.current = new maps.Circle({
      map: mapRef.current,
      center: { lat: ubicacion.lat, lng: ubicacion.lng },
      radius: RADIO_M,
      strokeColor: "rgba(30,79,156,0.35)",
      strokeOpacity: 1,
      strokeWeight: 1.5,
      fillColor: "rgba(30,79,156,0.06)",
      fillOpacity: 1,
      zIndex: 1,
    });

    // Pulso CSS overlay — clase definida aquí adentro donde maps ya está disponible
    if (maps.OverlayView) {
      class PulseOverlay extends maps.OverlayView {
        constructor(position) {
          super();
          this.position = position;
          this.div = null;
        }
        onAdd() {
          const div = document.createElement("div");
          div.style.cssText = "position:absolute;width:0;height:0;overflow:visible;pointer-events:none;";
          const ring1 = document.createElement("div");
          ring1.style.cssText = "position:absolute;width:40px;height:40px;border-radius:50%;border:2px solid rgba(29,78,216,0.6);background:rgba(29,78,216,0.15);transform-origin:center;left:-20px;top:-20px;";
          ring1.className = "cob-pulse-ring1";
          const ring2 = document.createElement("div");
          ring2.style.cssText = "position:absolute;width:40px;height:40px;border-radius:50%;border:2px solid rgba(29,78,216,0.45);background:rgba(29,78,216,0.1);transform-origin:center;left:-20px;top:-20px;";
          ring2.className = "cob-pulse-ring2";
          div.appendChild(ring1);
          div.appendChild(ring2);
          this.div = div;
          this.getPanes().overlayMouseTarget.appendChild(div);
        }
        draw() {
          if (!this.div) return;
          const proj = this.getProjection();
          if (!proj) return;
          const pt = proj.fromLatLngToDivPixel(this.position);
          if (!pt) return;
          this.div.style.left = `${pt.x}px`;
          this.div.style.top = `${pt.y}px`;
        }
        onRemove() {
          if (this.div?.parentNode) this.div.parentNode.removeChild(this.div);
          this.div = null;
        }
      }
      const overlay = new PulseOverlay(new maps.LatLng(ubicacion.lat, ubicacion.lng));
      overlay.setMap(mapRef.current);
      pulseOverlayRef.current = overlay;
    }

    // Marker usuario
    userMarkerRef.current = new maps.Marker({
      map: mapRef.current,
      position: { lat: ubicacion.lat, lng: ubicacion.lng },
      icon: { url: userPinSvg(), scaledSize: new maps.Size(24, 24), anchor: new maps.Point(12, 12) },
      zIndex: 99,
    });

    // Markers cajas NAP en radio
    cajasEnRadio.forEach(c => {
      const isSel = cajaSeleccionada?.id === c.id;
      const pc = c.llena ? "#dc2626" : "#0284c7";
      const icon = { url: napBoxSvg(pc, isSel, c.llena), scaledSize: new maps.Size(isSel ? 28 : 22, isSel ? 40 : 32), anchor: new maps.Point(14, isSel ? 40 : 32) };
      const marker = new maps.Marker({
        map: mapRef.current,
        position: { lat: c.lat, lng: c.lng },
        icon,
        title: `${c.codigo} · ${c.nodo}`,
        zIndex: isSel ? 10 : 2,
      });
      const info = new maps.InfoWindow({
        content: `<div style="font-family:sans-serif;font-size:13px;line-height:1.5;padding:2px 4px">
          <b style="font-size:14px">${c.codigo}</b><br/>
          <span style="color:#64748b">${c.nodo}${c.sector ? ` · ${c.sector}` : ""}</span><br/>
          <span style="color:${c.llena ? "#dc2626" : "#16a34a"}">${c.libres}/${c.capacidad} libres · ${formatDist(c.distancia)}</span>
        </div>`,
      });
      marker.addListener("click", () => {
        setCajaSeleccionada(prev => prev?.id === c.id ? null : { ...c });
        info.open({ map: mapRef.current, anchor: marker });
      });
      napMarkersRef.current.push(marker);
    });

  }, [mapReady, ubicacion, cajasEnRadio, cajaSeleccionada]); // eslint-disable-line

  // ── Crear orden ───────────────────────────────────────────────────────────
  const handleCrearOrden = useCallback(() => {
    if (!cajaMejor) return;
    const ubStr = ubicacion ? `${ubicacion.lat.toFixed(6)}, ${ubicacion.lng.toFixed(6)}` : "";
    onCrearOrden?.({ ubicacion: ubStr, cajaNap: cajaMejor.codigo, nodo: cajaMejor.nodo });
  }, [cajaMejor, ubicacion, onCrearOrden]);

  // ── Render ────────────────────────────────────────────────────────────────
  const nodoColores = NODO_COLORS[nodoDetectado] || { bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" };

  const coverageBanner = () => {
    if (!cobertura) return null;
    const cfg = {
      con_cobertura: { bg: "#dcfce7", border: "#86efac", color: "#15803d", icon: "✓", texto: `Cobertura disponible · ${cajasEnRadio.filter(c => !c.llena).length} caja(s) libre(s)` },
      llena: { bg: "#fef3c7", border: "#fde047", color: "#a16207", icon: "!", texto: "Cobertura parcial · todas las cajas están llenas" },
      sin_cobertura: { bg: "#fee2e2", border: "#fca5a5", color: "#dc2626", icon: "✕", texto: "Sin cobertura en radio de 500 m" },
    }[cobertura];
    return (
      <div style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18, color: cfg.color, fontWeight: 700 }}>{cfg.icon}</span>
        <span style={{ fontSize: 14, color: cfg.color, fontWeight: 600 }}>{cfg.texto}</span>
      </div>
    );
  };

  const mapContainer = (height, ref) => (
    <div style={{ position: "relative", width: "100%", height }}>
      {/* Canvas de Google Maps */}
      <div ref={ref} style={{ width: "100%", height: "100%", borderRadius: fullscreen ? 0 : 12, overflow: "hidden" }} />
      {mapError && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", borderRadius: 12, color: "#dc2626", fontSize: 14, padding: 16, textAlign: "center" }}>
          {mapError}
        </div>
      )}
      {/* FABs superpuestos */}
      <div style={{ position: "absolute", top: 10, right: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {/* GPS */}
        <button onClick={obtenerGPS} title="Mi ubicación GPS" style={fabStyle}>
          {gpsLoading ? <Spinner size={16} /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>}
        </button>
        {/* Link/coords */}
        <button onClick={() => setShowLinkModal(true)} title="Pegar link o coordenadas" style={fabStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </button>
        {/* Satélite */}
        <button onClick={() => setMapType(t => t === "roadmap" ? "satellite" : "roadmap")} title="Cambiar vista" style={{ ...fabStyle, background: mapType === "satellite" ? "#1d4ed8" : "#fff", color: mapType === "satellite" ? "#fff" : "#374151" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </button>
        {/* Fullscreen */}
        <button onClick={() => setFullscreen(f => !f)} title="Pantalla completa" style={fabStyle}>
          {fullscreen
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          }
        </button>
      </div>
      {/* Instrucción tap */}
      {!ubicacion && (
        <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 12, borderRadius: 20, padding: "5px 14px", pointerEvents: "none", whiteSpace: "nowrap" }}>
          Toca el mapa para colocar la ubicación
        </div>
      )}
    </div>
  );

  // ── Buscador ─────────────────────────────────────────────────────────────
  const searchBar = (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          value={searchQ}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar dirección, distrito, zona..."
          style={{ flex: 1, border: "none", outline: "none", fontSize: 14, color: "#1e293b", background: "transparent" }}
          onKeyDown={e => { if (e.key === "Enter" && searchQ.trim().length >= 3) onSearchChange(searchQ); }}
        />
        {searchLoading && <Spinner size={15} />}
        {searchQ.length > 0 && !searchLoading && (
          <button onClick={() => { setSearchQ(""); setSearchRes([]); setShowSearchRes(false); }} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "#94a3b8", fontSize: 18, lineHeight: 1 }}>×</button>
        )}
      </div>
      {showSearchRes && searchRes.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 999, overflow: "hidden" }}>
          {searchRes.map((item, i) => (
            <button key={i} onClick={() => elegirResultado(item)}
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", padding: "10px 14px", cursor: "pointer", fontSize: 13, color: "#374151", borderBottom: i < searchRes.length - 1 ? "1px solid #f1f5f9" : "none" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{item.display_name?.split(",")[0]}</div>
              <div style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.display_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── Panel derecho (info) ───────────────────────────────────────────────────
  const infoPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", color: "#dc2626", fontSize: 13 }}>
          {error}
        </div>
      )}
      {cargando && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13, padding: "4px 0" }}>
          <Spinner size={14} /> Cargando cajas NAP...
        </div>
      )}

      {/* Banner cobertura */}
      {coverageBanner()}

      {/* Nodo detectado */}
      {nodoDetectado && (
        <div style={{ background: nodoColores.bg, border: `1.5px solid ${nodoColores.border}`, borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 10, color: nodoColores.text, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Nodo asignado</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: nodoColores.text, lineHeight: 1 }}>{nodoDetectado}</div>
          {cajaMejor && (
            <div style={{ fontSize: 12, color: nodoColores.text, marginTop: 6, opacity: 0.85 }}>
              Caja sugerida: <b>{cajaMejor.codigo}</b> · {formatDist(cajaMejor.distancia)}
              {cajaMejor.capacidad > 0 && ` · ${cajaMejor.libres}/${cajaMejor.capacidad} libres`}
            </div>
          )}
        </div>
      )}

      {/* Botón crear orden */}
      {cajaMejor && (
        <button onClick={handleCrearOrden}
          style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: 12, padding: "13px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(29,78,216,0.3)", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Crear orden · {cajaMejor.codigo} · {nodoDetectado}
        </button>
      )}

      {/* Lista de cajas */}
      {ubicacion && cajasEnRadio.length > 0 && (
        <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
          <div style={{ padding: "11px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }}>Cajas NAP cercanas</span>
            <span style={{ fontSize: 12, color: "#64748b" }}>{cajasEnRadio.length} en 500 m</span>
          </div>
          {cajasVista.map((c, idx) => {
            const isSel = cajaSeleccionada?.id === c.id || cajaMejor?.id === c.id;
            const nc = NODO_COLORS[c.nodo] || { bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" };
            const portPct = c.capacidad > 0 ? Math.round((c.ocupados / c.capacidad) * 100) : 0;
            const portColor = c.llena ? "#dc2626" : portPct >= 75 ? "#ea580c" : "#16a34a";
            return (
              <div key={c.id} onClick={() => setCajaSeleccionada(prev => prev?.id === c.id ? null : { ...c })}
                style={{ padding: "10px 14px", borderBottom: idx < cajasVista.length - 1 ? "1px solid #f1f5f9" : "none", cursor: "pointer", background: isSel ? "#fff7ed" : "#fff", display: "flex", gap: 10, alignItems: "center", transition: "background 0.15s" }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "#fff"; }}
              >
                <div style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img src={napBoxSvg(portColor, isSel, c.llena)} width={isSel ? 20 : 16} height={isSel ? 29 : 23} alt="" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: isSel ? "#f97316" : "#1e293b" }}>{c.codigo}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: nc.text, background: nc.bg, border: `1px solid ${nc.border}`, borderRadius: 5, padding: "1px 6px" }}>{c.nodo}</span>
                    {idx === 0 && !cajaSeleccionada && <span style={{ fontSize: 10, fontWeight: 700, color: "#15803d", background: "#dcfce7", borderRadius: 5, padding: "1px 6px" }}>Mejor</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#64748b" }}>
                    <span>{formatDist(c.distancia)}</span>
                    {c.sector && <span>· {c.sector}</span>}
                    {c.capacidad > 0 && <span style={{ color: portColor, fontWeight: 600 }}>· {c.libres}/{c.capacidad} libres</span>}
                  </div>
                </div>
                {c.capacidad > 0 && (
                  <div style={{ width: 36, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <div style={{ width: 32, height: 4, borderRadius: 2, background: "#e2e8f0", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${portPct}%`, background: portColor, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, color: portColor, fontWeight: 700 }}>{portPct}%</span>
                  </div>
                )}
              </div>
            );
          })}
          {cajasEnRadio.length > LISTA_INICIAL && (
            <button onClick={() => setListaExpandida(v => !v)}
              style={{ width: "100%", padding: "9px 14px", border: "none", background: "#f8fafc", cursor: "pointer", fontSize: 12, color: "#1d4ed8", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              {listaExpandida ? "▲ Ver menos" : `▼ Ver ${cajasEnRadio.length - LISTA_INICIAL} más`}
            </button>
          )}
        </div>
      )}

      {ubicacion && cajasEnRadio.length === 0 && !cargando && (
        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "24px 0" }}>
          Sin cajas NAP en 500 m de radio
        </div>
      )}

      {!ubicacion && !cargando && (
        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "32px 16px", lineHeight: 1.6 }}>
          Usa el buscador, el GPS o haz clic en el mapa para establecer la ubicación del cliente
        </div>
      )}
    </div>
  );

  return (
    /* Layout desktop: mapa izquierda (flex), panel derecha (380px fijo) */
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 110px)", minHeight: 500, overflow: "hidden", borderRadius: 14, border: "1.5px solid #e2e8f0", background: "#f8fafc", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>

      {/* ── Columna izquierda: MAPA ── */}
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        {!fullscreen && mapContainer("100%", mapCanvasRef)}
      </div>

      {/* ── Columna derecha: PANEL DE INFO ── */}
      <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", gap: 0, borderLeft: "1.5px solid #e2e8f0", background: "#fff", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#1e293b", marginBottom: 10 }}>Consultar cobertura</div>
          {searchBar}
        </div>
        {/* Contenido scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {infoPanel}
        </div>
      </div>

      {/* ── Fullscreen modal ── */}
      {fullscreen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000" }}>
          {mapContainer("100%", mapCanvasFullRef)}
        </div>
      )}

      {/* ── Modal link/coords ── */}
      {showLinkModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Pegar link o coordenadas</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
              Acepta: Google Maps, Apple Maps, links con @lat,lng, o coordenadas directas (ej. -16.438, -71.598)
            </p>
            <textarea
              value={linkInput}
              onChange={e => { setLinkInput(e.target.value); setLinkError(""); }}
              placeholder="Pega aquí el link o coordenadas..."
              rows={3}
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box" }}
            />
            {linkError && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 6 }}>{linkError}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowLinkModal(false); setLinkInput(""); setLinkError(""); }}
                style={{ flex: 1, padding: "10px 0", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", fontSize: 14, color: "#374151", fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={aplicarLink}
                style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, background: "#1d4ed8", cursor: "pointer", fontSize: 14, color: "#fff", fontWeight: 700 }}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers UI ───────────────────────────────────────────────────────────────
function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

const fabStyle = {
  width: 38, height: 38, border: "none", borderRadius: 10,
  background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  color: "#374151",
};
