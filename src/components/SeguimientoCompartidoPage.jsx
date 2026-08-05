import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import logoAmericanet from "../assets/americanet-logo-new-trimmed.png";
import { crearIconoVehiculoTipo, vehicleIconGeometry, paintForVehiculoId } from "../utils/vehicleIcon";

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const REFRESH_MS = 6_000;
const ARRIVAL_KM = 0.08;
const ARRIVAL_CONFIRMATIONS = 2;
const EARTH_RADIUS_KM = 6371;
const MOBILE_BREAKPOINT_PX = 640;

const isValidCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
const haversineKm = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
const bearingDeg = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const toDeg = (v) => (v * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

// Icono de "casa" (Lucide) para la direccion del cliente — vector, no emoji.
const HOUSE_PATHS = [
  "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
  "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
];
let casaIconCache = null;
function crearIconoCasa(color) {
  if (casaIconCache) return casaIconCache;
  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(15,23,42,0.35)";
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.save();
  const iconSize = size * 0.52;
  const scale = iconSize / 24;
  ctx.translate(size / 2 - iconSize / 2, size / 2 - iconSize / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  HOUSE_PATHS.forEach((d) => ctx.stroke(new Path2D(d)));
  ctx.restore();

  casaIconCache = canvas.toDataURL("image/png");
  return casaIconCache;
}

const loadGoogleMapsSdk = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("Sin navegador."));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (window.__gmapsPromise) return window.__gmapsPromise;
  window.__gmapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "google-maps-js-sdk";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("No se pudo cargar el mapa."));
    document.head.appendChild(script);
  });
  return window.__gmapsPromise;
};

export default function SeguimientoCompartidoPage() {
  const mapCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const markerRef = useRef(null);
  const clienteMarkerRef = useRef(null);
  const viewerMarkerRef = useRef(null);
  const arrivalStreakRef = useRef(0);
  const autoFitDoneRef = useRef(false);
  const headingRef = useRef(null);
  const prevPosRef = useRef(null);
  const viewerPosRef = useRef(null);

  const [estado, setEstado] = useState("cargando"); // cargando | activo | expirado | completado | invalido
  const [enlace, setEnlace] = useState(null);
  const vehiculoRef = useRef(null);
  const [ultimaPosicion, setUltimaPosicion] = useState(null);
  const [distanciaKm, setDistanciaKm] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [geoStatus, setGeoStatus] = useState("pendiente"); // pendiente | ok | denegado | no-disponible
  const [fullscreen, setFullscreen] = useState(() => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX);

  const token = new URLSearchParams(window.location.search).get("t") || "";

  const cargarEnlace = useCallback(async () => {
    if (!token) { setEstado("invalido"); return null; }
    const { data, error } = await supabase.from("enlaces_seguimiento").select("*").eq("id", token).maybeSingle();
    if (error || !data) { setEstado("invalido"); return null; }
    setEnlace(data);
    if (data.completado) { setEstado("completado"); return data; }
    if (new Date(data.expira_en).getTime() < Date.now()) { setEstado("expirado"); return data; }
    setEstado("activo");
    return data;
  }, [token]);

  const cargarVehiculo = useCallback(async (vehiculoId) => {
    if (!vehiculoId) return;
    const { data } = await supabase
      .from("vehiculos")
      .select("placa,foto_url,color,tipo_vehiculo,tiene_escalera")
      .eq("id", vehiculoId)
      .maybeSingle();
    if (data) vehiculoRef.current = data;
  }, []);

  const marcarCompletado = useCallback(async (id) => {
    await supabase.from("enlaces_seguimiento").update({ completado: true, completado_en: new Date().toISOString() }).eq("id", id);
    setEstado("completado");
  }, []);

  // Pide la ubicacion de quien esta viendo el enlace (el cliente o quien sea
  // que lo abra) para calcular a que distancia esta el vehiculo DE VERDAD —
  // antes se usaba la direccion guardada en el enlace, que muchas veces no
  // existe (enlaces generados desde el panel, sin orden asociada) o puede
  // estar mal geocodificada, dando distancias absurdas (miles de km).
  useEffect(() => {
    if (!("geolocation" in navigator)) { setGeoStatus("no-disponible"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        viewerPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoStatus("ok");
      },
      () => setGeoStatus("denegado"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const refrescarPosicion = useCallback(async (enlaceActual) => {
    if (!enlaceActual?.vehiculo_id) return;
    const { data: actual } = await supabase
      .from("vehiculo_ubicacion_actual")
      .select("lat,lng,updated_at,battery_pct,speed_mps")
      .eq("vehiculo_id", enlaceActual.vehiculo_id)
      .maybeSingle();

    // La ubicacion de quien mira el enlace manda sobre la direccion guardada
    // (si la hay) — es la referencia real de "a que distancia estoy yo".
    let referencia = null;
    if (viewerPosRef.current) {
      referencia = viewerPosRef.current;
    } else if (isValidCoord(Number(enlaceActual.cliente_lat), Number(enlaceActual.cliente_lng))) {
      referencia = { lat: Number(enlaceActual.cliente_lat), lng: Number(enlaceActual.cliente_lng) };
    }

    if (actual && isValidCoord(Number(actual.lat), Number(actual.lng))) {
      setUltimaPosicion(actual);
      if (referencia) {
        const dist = haversineKm({ lat: Number(actual.lat), lng: Number(actual.lng) }, referencia);
        setDistanciaKm(dist);
        if (dist <= ARRIVAL_KM) {
          arrivalStreakRef.current += 1;
          if (arrivalStreakRef.current >= ARRIVAL_CONFIRMATIONS) {
            void marcarCompletado(enlaceActual.id);
            return;
          }
        } else {
          arrivalStreakRef.current = 0;
        }
      } else {
        setDistanciaKm(null);
      }
    }

    if (!mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;
    const map = mapRef.current;

    if (actual && isValidCoord(Number(actual.lat), Number(actual.lng))) {
      const pos = { lat: Number(actual.lat), lng: Number(actual.lng) };
      if (prevPosRef.current) {
        const movedM = haversineKm(prevPosRef.current, pos) * 1000;
        if (movedM > 2) headingRef.current = bearingDeg(prevPosRef.current, pos);
      }
      prevPosRef.current = pos;

      const veh = vehiculoRef.current;
      const speedMps = Number(actual.speed_mps);
      const speedKmh = Number.isFinite(speedMps) && speedMps >= 0 ? speedMps * 3.6 : null;
      const bodyColor = paintForVehiculoId(enlaceActual.vehiculo_id);
      const iconDataUrl = crearIconoVehiculoTipo(veh?.tipo_vehiculo, veh?.tiene_escalera, bodyColor, headingRef.current, speedKmh);
      const geo = vehicleIconGeometry(64);
      const icon = iconDataUrl
        ? { url: iconDataUrl, scaledSize: new maps.Size(geo.width, geo.height), anchor: new maps.Point(geo.anchorX, geo.anchorY) }
        : { path: maps.SymbolPath.CIRCLE, fillColor: "#1E4F9C", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2.5, scale: 9 };
      if (!markerRef.current) {
        markerRef.current = new maps.Marker({ map, position: pos, icon, title: veh?.placa || "", zIndex: 999 });
      } else {
        markerRef.current.setPosition(pos);
        markerRef.current.setIcon(icon);
      }
      if (!autoFitDoneRef.current) {
        map.panTo(pos);
        map.setZoom(15);
        autoFitDoneRef.current = true;
      }
    }

    const tieneCliente = isValidCoord(Number(enlaceActual.cliente_lat), Number(enlaceActual.cliente_lng));
    if (tieneCliente && !clienteMarkerRef.current) {
      const size = 40;
      clienteMarkerRef.current = new maps.Marker({
        map,
        position: { lat: Number(enlaceActual.cliente_lat), lng: Number(enlaceActual.cliente_lng) },
        icon: { url: crearIconoCasa("#16A34A"), scaledSize: new maps.Size(size, size), anchor: new maps.Point(size / 2, size / 2) },
        title: "Tu direccion",
        zIndex: 500
      });
      if (!autoFitDoneRef.current && actual) {
        const bounds = new maps.LatLngBounds();
        bounds.extend({ lat: Number(actual.lat), lng: Number(actual.lng) });
        bounds.extend({ lat: Number(enlaceActual.cliente_lat), lng: Number(enlaceActual.cliente_lng) });
        map.fitBounds(bounds);
        autoFitDoneRef.current = true;
      }
    }
  }, [marcarCompletado]);

  // Marcador de "tu ubicacion" (punto azul, como el de Google Maps) — se
  // dibuja/actualiza apenas el navegador entrega la posicion, sin esperar
  // al proximo refresco de 6s.
  useEffect(() => {
    if (geoStatus !== "ok" || !mapReady || !mapRef.current || !mapsRef.current || !viewerPosRef.current) return;
    const maps = mapsRef.current;
    const map = mapRef.current;
    const pos = viewerPosRef.current;
    if (!viewerMarkerRef.current) {
      viewerMarkerRef.current = new maps.Marker({
        map,
        position: pos,
        icon: { path: maps.SymbolPath.CIRCLE, fillColor: "#2563eb", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2.5, scale: 7 },
        title: "Tu ubicacion",
        zIndex: 800
      });
    } else {
      viewerMarkerRef.current.setPosition(pos);
    }
    if (ultimaPosicion && isValidCoord(Number(ultimaPosicion.lat), Number(ultimaPosicion.lng))) {
      setDistanciaKm(haversineKm({ lat: Number(ultimaPosicion.lat), lng: Number(ultimaPosicion.lng) }, pos));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoStatus, mapReady]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await cargarEnlace();
      if (cancelled || !data || data.completado || new Date(data.expira_en).getTime() < Date.now()) return;
      await cargarVehiculo(data.vehiculo_id);
      try {
        const maps = await loadGoogleMapsSdk();
        if (cancelled || !mapCanvasRef.current) return;
        mapsRef.current = maps;
        mapRef.current = new maps.Map(mapCanvasRef.current, {
          center: { lat: -16.43849, lng: -71.598208 },
          zoom: 13,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy"
        });
        setMapReady(true);
        await refrescarPosicion(data);
      } catch {
        // si el mapa no carga, igual mostramos el estado/distancia en texto
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (estado !== "activo") return undefined;
    const interval = setInterval(async () => {
      const data = await cargarEnlace();
      if (data && !data.completado && new Date(data.expira_en).getTime() >= Date.now()) {
        void refrescarPosicion(data);
      }
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [estado, cargarEnlace, refrescarPosicion]);

  // Google Maps no se re-acomoda solo cuando su contenedor cambia de tamaño
  // (ej. al pasar a pantalla completa) — hay que avisarle con "resize".
  useEffect(() => {
    if (!mapRef.current || !mapsRef.current) return undefined;
    const id = setTimeout(() => {
      mapsRef.current.event.trigger(mapRef.current, "resize");
      if (ultimaPosicion && isValidCoord(Number(ultimaPosicion.lat), Number(ultimaPosicion.lng))) {
        mapRef.current.panTo({ lat: Number(ultimaPosicion.lat), lng: Number(ultimaPosicion.lng) });
      }
    }, 80);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  const s = {
    page: { minHeight: "100vh", background: "#f1f5f9", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", fontFamily: "Inter, system-ui, sans-serif" },
    card: { width: "100%", maxWidth: 520, background: "#fff", borderRadius: 16, boxShadow: "0 8px 24px rgba(15,23,42,0.08)", overflow: "hidden" },
    header: { padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10 },
    body: { padding: 20 },
    msg: { textAlign: "center", padding: "40px 20px", color: "#475569" },
    mapBox: { position: "relative", width: "100%", height: "min(72vh, 640px)", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: 12 },
    mapFull: { position: "fixed", inset: 0, zIndex: 1000, background: "#000" },
    expandBtn: {
      position: "absolute", top: 10, right: 10, width: 38, height: 38, borderRadius: 19, border: "none",
      background: "rgba(15,23,42,0.65)", color: "#fff", fontSize: 16, cursor: "pointer", zIndex: 10,
      display: "flex", alignItems: "center", justifyContent: "center"
    },
    fullInfoBar: {
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1001, background: "#fff",
      padding: "12px 16px", boxShadow: "0 -4px 16px rgba(15,23,42,0.12)"
    }
  };

  const distanciaTexto = distanciaKm != null
    ? `El tecnico esta a ~${distanciaKm < 1 ? Math.round(distanciaKm * 1000) + " m" : distanciaKm.toFixed(1) + " km"} de tu ubicacion.`
    : "Siguiendo la ubicacion del tecnico en vivo.";

  const mapaNode = (
    <div ref={mapCanvasRef} style={{ width: "100%", height: "100%" }} />
  );

  if (estado === "activo" && fullscreen) {
    return (
      <div style={s.mapFull}>
        {mapaNode}
        <button type="button" onClick={() => setFullscreen(false)} style={s.expandBtn} aria-label="Salir de pantalla completa">
          ✕
        </button>
        {!mapReady && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#94a3b8", fontSize: 13 }}>
            Cargando mapa...
          </div>
        )}
        <div style={s.fullInfoBar}>
          <p style={{ fontSize: 13, color: "#475569", textAlign: "center", margin: 0 }}>{distanciaTexto}</p>
          {geoStatus === "denegado" ? (
            <p style={{ fontSize: 11, color: "#b45309", textAlign: "center", marginTop: 4 }}>
              Activa tu ubicacion en el navegador para ver la distancia real.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <img src={logoAmericanet} alt="Americanet" style={{ height: 28 }} />
          <strong style={{ fontSize: 15, color: "#1e293b" }}>Seguimiento en vivo</strong>
        </div>

        {estado === "cargando" && <p style={s.msg}>Cargando...</p>}

        {estado === "invalido" && <p style={s.msg}>Este enlace no es valido.</p>}

        {estado === "expirado" && <p style={s.msg}>⏱️ Este enlace ya vencio. Pide uno nuevo si el tecnico sigue en camino.</p>}

        {estado === "completado" && (
          <p style={s.msg}>✅ El tecnico ya llego a tu direccion. ¡Gracias por tu paciencia!</p>
        )}

        {estado === "activo" && (
          <div style={s.body}>
            {enlace?.orden_codigo ? (
              <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>Orden {enlace.orden_codigo}</p>
            ) : null}
            <div style={s.mapBox}>
              {mapaNode}
              <button type="button" onClick={() => setFullscreen(true)} style={s.expandBtn} aria-label="Ver en pantalla completa">
                ⤢
              </button>
              {!mapReady && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#94a3b8", fontSize: 13 }}>
                  Cargando mapa...
                </div>
              )}
            </div>
            <p style={{ fontSize: 13, color: "#475569", textAlign: "center", margin: 0 }}>{distanciaTexto}</p>
            {geoStatus === "denegado" ? (
              <p style={{ fontSize: 11, color: "#b45309", textAlign: "center", marginTop: 4 }}>
                Activa tu ubicacion en el navegador para ver la distancia real.
              </p>
            ) : null}
            {ultimaPosicion?.updated_at ? (
              <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
                Ultima actualizacion: {new Date(ultimaPosicion.updated_at).toLocaleTimeString("es-PE")}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
