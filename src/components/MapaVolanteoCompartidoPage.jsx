import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import logoAmericanet from "../assets/americanet-logo-new-trimmed.png";

const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyA2rGETtusuzou_YaHpgATZf5UF1bQDn2o"
).trim();
const REFRESH_MS = 20_000;
const TRAIL_COLORS = [
  "#EA580C", "#0891B2", "#7C3AED", "#16A34A", "#DB2777", "#CA8A04",
  "#1E4F9C", "#DC2626", "#059669", "#4F46E5", "#0D9488", "#EC4899"
];
const TRAIL_MAX_POINTS = 400;
const MAX_GAP_FOR_SEGMENT_SEC = 180;

const toText = (value) => String(value ?? "").trim();
const isValidCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
function esColorValido(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(toText(value));
}
function formatDateInput(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function formatAgo(value) {
  const d = new Date(value || Date.now());
  if (!Number.isFinite(d.getTime())) return "-";
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// Mismo criterio que el panel de admin (SeguimientoVolanteadoresPanel.jsx):
// no se ajusta la ruta a la red vial (eso es para autos, no caminatas) --
// se corta en tramos donde hubo un hueco de tiempo grande (pausa), y se
// suaviza/simplifica geometricamente cada tramo antes de dibujarlo.
function splitTrailByGaps(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const segments = [[points[0]]];
  for (let i = 1; i < points.length; i += 1) {
    const prevTime = new Date(points[i - 1].created_at).getTime();
    const currTime = new Date(points[i].created_at).getTime();
    const gapSec = Number.isFinite(prevTime) && Number.isFinite(currTime) ? (currTime - prevTime) / 1000 : 0;
    if (gapSec > MAX_GAP_FOR_SEGMENT_SEC) segments.push([]);
    segments[segments.length - 1].push(points[i]);
  }
  return segments.filter((s) => s.length > 1);
}
function suavizarPromedioMovil(points) {
  if (!Array.isArray(points) || points.length < 3) return points;
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    return { ...p, lat: (prev.lat + p.lat + next.lat) / 3, lng: (prev.lng + p.lng + next.lng) / 3 };
  });
}
function distanciaPerpendicularM(pt, a, b) {
  const lat0 = a.lat;
  const toXY = (p) => ({
    x: (p.lng * Math.PI) / 180 * 6371000 * Math.cos((lat0 * Math.PI) / 180),
    y: (p.lat * Math.PI) / 180 * 6371000,
  });
  const P = toXY(pt), A = toXY(a), B = toXY(b);
  const dx = B.x - A.x, dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(P.x - A.x, P.y - A.y);
  const t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2;
  return Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
}
function douglasPeucker(points, epsilonM) {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = distanciaPerpendicularM(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilonM) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilonM);
    const right = douglasPeucker(points.slice(index), epsilonM);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}
function limpiarTrazoParaDibujar(points) {
  if (!Array.isArray(points) || points.length < 3) return points;
  return douglasPeucker(suavizarPromedioMovil(points), 6);
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

// Vista publica de solo lectura del mapa de volanteadores -- generada desde
// "Seguimiento de volanteadores" con un link temporal (ver
// SeguimientoVolanteadoresPanel.jsx). No requiere iniciar sesion, no
// muestra telefonos ni tiene ninguna accion de administracion.
export default function MapaVolanteoCompartidoPage() {
  const mapCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const zonaPolygonsRef = useRef([]);
  const autoFitDoneRef = useRef(false);

  const [estado, setEstado] = useState("cargando"); // cargando | activo | expirado | invalido
  const [enlace, setEnlace] = useState(null);
  const [volanteadores, setVolanteadores] = useState([]);
  const [currentRows, setCurrentRows] = useState([]);
  const [trailById, setTrailById] = useState({});
  const [zonasHoy, setZonasHoy] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  const token = new URLSearchParams(window.location.search).get("t") || "";

  const cargarEnlace = useCallback(async () => {
    if (!token) { setEstado("invalido"); return null; }
    const { data, error } = await supabase.from("mapa_supervisor_enlaces").select("*").eq("id", token).maybeSingle();
    if (error || !data) { setEstado("invalido"); return null; }
    setEnlace(data);
    if (new Date(data.expira_en).getTime() < Date.now()) { setEstado("expirado"); return data; }
    setEstado("activo");
    return data;
  }, [token]);

  const cargarVolanteadores = useCallback(async (grupo) => {
    let query = supabase
      .from("usuarios")
      .select("id,nombre,grupo_volanteo,alias_volanteo,avatar_volanteo")
      .eq("rol", "Volanteador")
      .eq("activo", true)
      .limit(2000);
    if (grupo) query = query.eq("grupo_volanteo", grupo);
    const { data } = await query;
    setVolanteadores(
      (Array.isArray(data) ? data : []).map((u) => ({
        id: toText(u.id),
        nombre: toText(u.alias_volanteo) || toText(u.nombre) || toText(u.id),
        grupo: toText(u.grupo_volanteo) || "(sin grupo)",
        avatar: toText(u.avatar_volanteo),
      }))
    );
  }, []);

  const cargarPosiciones = useCallback(async (ids) => {
    if (!ids.length) { setCurrentRows([]); return; }
    const { data } = await supabase.from("tecnico_ubicacion_actual").select("*").in("tecnico_id", ids);
    setCurrentRows(Array.isArray(data) ? data : []);
  }, []);

  const cargarRutas = useCallback(async (ids) => {
    if (!ids.length) { setTrailById({}); return; }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const PAGE = 1000;
    let data = [];
    for (let from = 0; from < 50000; from += PAGE) {
      const { data: pagina, error: err } = await supabase
        .from("tecnico_ubicaciones")
        .select("tecnico_id,lat,lng,created_at")
        .in("tecnico_id", ids)
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (err) break;
      const rows = Array.isArray(pagina) ? pagina : [];
      data = data.concat(rows);
      if (rows.length < PAGE) break;
    }
    const grouped = {};
    data.forEach((row) => {
      const id = toText(row.tecnico_id);
      const lat = Number(row.lat), lng = Number(row.lng);
      if (!id || !isValidCoord(lat, lng)) return;
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push({ lat, lng, created_at: row.created_at });
    });
    Object.keys(grouped).forEach((id) => {
      if (grouped[id].length > TRAIL_MAX_POINTS) grouped[id] = grouped[id].slice(grouped[id].length - TRAIL_MAX_POINTS);
    });
    setTrailById(grouped);
  }, []);

  const cargarZonas = useCallback(async (grupo) => {
    let query = supabase
      .from("volanteo_zonas_asignadas")
      .select("id,grupo_volanteo,zonas_cobertura(id,nombre,stroke_color,fill_color,fill_opacity,coordinates)")
      .eq("fecha", formatDateInput(new Date()));
    if (grupo) query = query.eq("grupo_volanteo", grupo);
    const { data } = await query;
    setZonasHoy(
      (Array.isArray(data) ? data : [])
        .filter((r) => r.zonas_cobertura)
        .map((r) => ({ asignacionId: r.id, ...r.zonas_cobertura }))
    );
  }, []);

  const refrescarTodo = useCallback(
    async (enlaceActual) => {
      const grupo = toText(enlaceActual?.grupo_volanteo);
      await cargarVolanteadores(grupo || null);
    },
    [cargarVolanteadores]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await cargarEnlace();
      if (cancelled || !data || new Date(data.expira_en).getTime() < Date.now()) return;
      await refrescarTodo(data);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (volanteadores.length === 0) return;
    const ids = volanteadores.map((v) => v.id);
    void cargarPosiciones(ids);
    void cargarRutas(ids);
    void cargarZonas(toText(enlace?.grupo_volanteo) || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volanteadores]);

  useEffect(() => {
    if (estado !== "activo") return undefined;
    const interval = setInterval(async () => {
      const data = await cargarEnlace();
      if (!data || new Date(data.expira_en).getTime() < Date.now()) return;
      const ids = volanteadores.map((v) => v.id);
      void cargarPosiciones(ids);
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [estado, cargarEnlace, cargarPosiciones, volanteadores]);

  useEffect(() => {
    let cancelled = false;
    if (estado !== "activo" || !mapCanvasRef.current) return undefined;
    loadGoogleMapsSdk()
      .then((maps) => {
        if (cancelled || !mapCanvasRef.current) return;
        mapsRef.current = maps;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapCanvasRef.current, {
            center: { lat: -16.43849, lng: -71.598208 },
            zoom: 13,
            streetViewControl: false,
            mapTypeControl: true,
            fullscreenControl: true,
            gestureHandling: "greedy",
          });
        }
        setMapReady(true);
      })
      .catch((e) => {
        if (!cancelled) setMapError(String(e?.message || "No se pudo cargar el mapa."));
      });
    return () => { cancelled = true; };
  }, [estado]);

  const colorMap = useMemo(() => {
    const ids = [...volanteadores.map((v) => v.id)].sort();
    const map = {};
    ids.forEach((id, i) => { map[id] = TRAIL_COLORS[i % TRAIL_COLORS.length]; });
    return map;
  }, [volanteadores]);
  const colorDe = useCallback(
    (id) => {
      const v = volanteadores.find((x) => x.id === id);
      return esColorValido(v?.avatar) ? v.avatar : colorMap[id] || TRAIL_COLORS[0];
    },
    [colorMap, volanteadores]
  );

  const currentById = useMemo(() => {
    const map = {};
    currentRows.forEach((row) => { map[toText(row.tecnico_id)] = row; });
    return map;
  }, [currentRows]);

  const marcadores = volanteadores
    .map((v) => ({ ...v, pos: currentById[v.id] }))
    .filter((f) => f.pos && isValidCoord(Number(f.pos.lat), Number(f.pos.lng)));

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;
    const map = mapRef.current;
    markersRef.current.forEach((m) => m.setMap(null));
    polylinesRef.current.forEach((l) => l.setMap(null));
    markersRef.current = [];
    polylinesRef.current = [];

    Object.entries(trailById).forEach(([id, pts]) => {
      const segmentos = splitTrailByGaps(pts);
      segmentos.forEach((seg) => {
        const path = limpiarTrazoParaDibujar(seg);
        try {
          const line = new maps.Polyline({ map, path, strokeColor: colorDe(id), strokeOpacity: 0.9, strokeWeight: 4 });
          polylinesRef.current.push(line);
        } catch {
          // se omite ese tramo si trae datos raros
        }
      });
    });

    marcadores.forEach((f) => {
      const lat = Number(f.pos.lat);
      const lng = Number(f.pos.lng);
      const heading = Number(f.pos.heading);
      const rumbo = Number.isFinite(heading) && heading >= 0 ? heading : 0;
      const color = colorDe(f.id);
      try {
        const marker = new maps.Marker({
          map,
          position: { lat, lng },
          title: `${f.nombre} — ${f.grupo}`,
          icon: {
            path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            rotation: rumbo,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 1.6,
          },
        });
        markersRef.current.push(marker);
      } catch {
        // se omite ese marcador si trae datos raros
      }
    });

    if (marcadores.length > 0 && !autoFitDoneRef.current) {
      const bounds = new maps.LatLngBounds();
      marcadores.forEach((f) => bounds.extend({ lat: Number(f.pos.lat), lng: Number(f.pos.lng) }));
      map.fitBounds(bounds);
      autoFitDoneRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, trailById, marcadores.length, colorDe]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;
    zonaPolygonsRef.current.forEach((p) => p.setMap(null));
    zonaPolygonsRef.current = [];
    zonasHoy.forEach((z) => {
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
      });
      zonaPolygonsRef.current.push(polygon);
    });
  }, [mapReady, zonasHoy]);

  const s = {
    page: { minHeight: "100vh", background: "#f1f5f9", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 12px", fontFamily: "Inter, system-ui, sans-serif" },
    card: { width: "100%", maxWidth: 900, background: "#fff", borderRadius: 16, boxShadow: "0 8px 24px rgba(15,23,42,0.08)", overflow: "hidden" },
    header: { padding: "16px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    body: { padding: 16 },
    msg: { textAlign: "center", padding: "40px 20px", color: "#475569" },
    mapBox: { position: "relative", width: "100%", height: "min(75vh, 680px)", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" },
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <img src={logoAmericanet} alt="Americanet" style={{ height: 26 }} />
          <strong style={{ fontSize: 14, color: "#1e293b" }}>
            Mapa de volanteo en vivo{enlace?.grupo_volanteo ? ` — ${enlace.grupo_volanteo}` : " — todos los grupos"}
          </strong>
        </div>

        {estado === "cargando" && <p style={s.msg}>Cargando...</p>}
        {estado === "invalido" && <p style={s.msg}>Este enlace no es valido.</p>}
        {estado === "expirado" && <p style={s.msg}>⏱️ Este enlace ya vencio. Pide uno nuevo al administrador.</p>}

        {estado === "activo" && (
          <div style={s.body}>
            <div style={s.mapBox}>
              <div ref={mapCanvasRef} style={{ width: "100%", height: "100%" }} />
              {!mapReady || mapError ? (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#94a3b8", fontSize: 13 }}>
                  {mapError || "Cargando mapa..."}
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10 }}>
              {volanteadores.map((v) => {
                const pos = currentById[v.id];
                return (
                  <span
                    key={v.id}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                      background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 999, padding: "4px 10px", color: "#334155",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: colorDe(v.id) }} />
                    {v.nombre} {pos ? `· hace ${formatAgo(pos.updated_at)}` : "· sin ubicacion hoy"}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
