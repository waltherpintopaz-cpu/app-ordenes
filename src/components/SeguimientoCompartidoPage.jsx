import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import logoAmericanet from "../assets/americanet-logo-new-trimmed.png";

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const REFRESH_MS = 6_000;
const TRAIL_WINDOW_MIN = 90;
const ARRIVAL_KM = 0.08;
const ARRIVAL_CONFIRMATIONS = 2;
const EARTH_RADIUS_KM = 6371;

const isValidCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
const haversineKm = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

function suavizarPuntos(points) {
  if (!Array.isArray(points) || points.length < 3) return points || [];
  const pts = points;
  const out = [pts[0]];
  const segmentsPerGap = 6;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    for (let s = 1; s <= segmentsPerGap; s++) {
      const t = s / segmentsPerGap;
      const t2 = t * t;
      const t3 = t2 * t;
      const lat = 0.5 * (2 * p1.lat + (-p0.lat + p2.lat) * t + (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 + (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3);
      const lng = 0.5 * (2 * p1.lng + (-p0.lng + p2.lng) * t + (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 + (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3);
      out.push({ lat, lng });
    }
  }
  return out;
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
  const polylineRef = useRef(null);
  const arrivalStreakRef = useRef(0);
  const autoFitDoneRef = useRef(false);

  const [estado, setEstado] = useState("cargando"); // cargando | activo | expirado | completado | invalido
  const [enlace, setEnlace] = useState(null);
  const [ultimaPosicion, setUltimaPosicion] = useState(null);
  const [distanciaKm, setDistanciaKm] = useState(null);
  const [mapReady, setMapReady] = useState(false);

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

  const marcarCompletado = useCallback(async (id) => {
    await supabase.from("enlaces_seguimiento").update({ completado: true, completado_en: new Date().toISOString() }).eq("id", id);
    setEstado("completado");
  }, []);

  const refrescarPosicion = useCallback(async (enlaceActual) => {
    if (!enlaceActual?.vehiculo_id) return;
    const { data: actual } = await supabase
      .from("vehiculo_ubicacion_actual")
      .select("lat,lng,updated_at,battery_pct")
      .eq("vehiculo_id", enlaceActual.vehiculo_id)
      .maybeSingle();
    if (actual && isValidCoord(Number(actual.lat), Number(actual.lng))) {
      setUltimaPosicion(actual);

      const tieneCliente = isValidCoord(Number(enlaceActual.cliente_lat), Number(enlaceActual.cliente_lng));
      if (tieneCliente) {
        const dist = haversineKm(
          { lat: Number(actual.lat), lng: Number(actual.lng) },
          { lat: Number(enlaceActual.cliente_lat), lng: Number(enlaceActual.cliente_lng) }
        );
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
      }
    }

    const desde = new Date(Date.now() - TRAIL_WINDOW_MIN * 60 * 1000).toISOString();
    const { data: trail } = await supabase
      .from("vehiculo_ubicaciones")
      .select("lat,lng,created_at")
      .eq("vehiculo_id", enlaceActual.vehiculo_id)
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(600);

    if (!mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;
    const map = mapRef.current;

    if (actual && isValidCoord(Number(actual.lat), Number(actual.lng))) {
      const pos = { lat: Number(actual.lat), lng: Number(actual.lng) };
      if (!markerRef.current) {
        markerRef.current = new maps.Marker({
          map,
          position: pos,
          icon: { path: maps.SymbolPath.CIRCLE, fillColor: "#1E4F9C", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2.5, scale: 9 },
          zIndex: 999
        });
      } else {
        markerRef.current.setPosition(pos);
      }
      if (!autoFitDoneRef.current) {
        map.panTo(pos);
        map.setZoom(15);
        autoFitDoneRef.current = true;
      }
    }

    if (polylineRef.current) { try { polylineRef.current.setMap(null); } catch { /* noop */ } }
    const pts = (Array.isArray(trail) ? trail : [])
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => isValidCoord(p.lat, p.lng));
    if (pts.length > 1) {
      polylineRef.current = new maps.Polyline({ map, path: suavizarPuntos(pts), strokeColor: "#1E4F9C", strokeOpacity: 0.85, strokeWeight: 4 });
    }

    const tieneCliente = isValidCoord(Number(enlaceActual.cliente_lat), Number(enlaceActual.cliente_lng));
    if (tieneCliente && !clienteMarkerRef.current) {
      clienteMarkerRef.current = new maps.Marker({
        map,
        position: { lat: Number(enlaceActual.cliente_lat), lng: Number(enlaceActual.cliente_lng) },
        icon: { path: maps.SymbolPath.CIRCLE, fillColor: "#16A34A", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2.5, scale: 8 },
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await cargarEnlace();
      if (cancelled || !data || data.completado || new Date(data.expira_en).getTime() < Date.now()) return;
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

  const s = {
    page: { minHeight: "100vh", background: "#f1f5f9", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", fontFamily: "Inter, system-ui, sans-serif" },
    card: { width: "100%", maxWidth: 520, background: "#fff", borderRadius: 16, boxShadow: "0 8px 24px rgba(15,23,42,0.08)", overflow: "hidden" },
    header: { padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10 },
    body: { padding: 20 },
    msg: { textAlign: "center", padding: "40px 20px", color: "#475569" }
  };

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
            <div style={{ position: "relative", width: "100%", height: 360, borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: 12 }}>
              <div ref={mapCanvasRef} style={{ width: "100%", height: "100%" }} />
              {!mapReady && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#94a3b8", fontSize: 13 }}>
                  Cargando mapa...
                </div>
              )}
            </div>
            <p style={{ fontSize: 13, color: "#475569", textAlign: "center", margin: 0 }}>
              {distanciaKm != null
                ? `El tecnico esta a ~${distanciaKm < 1 ? Math.round(distanciaKm * 1000) + " m" : distanciaKm.toFixed(1) + " km"} de tu direccion.`
                : "Siguiendo la ubicacion del tecnico en vivo."}
            </p>
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
