import { useEffect, useRef, useState } from "react";

const HUAWEI_OLT_SNMP_API = String(import.meta.env.VITE_HUAWEI_OLT_SNMP_API || "https://huawei-olt-snmp.wolgest.com").trim().replace(/\/$/, "");
const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();

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

// Icono SVG de "sin señal" (Lucide wifi-off) dibujado en canvas, con un
// anillo pulsante alrededor -- mismo truco ya usado en SeguimientoCompartidoPage
// (crearIconoCasa) pero tematizado para avería: rojo, parpadeante.
const WIFI_OFF_PATHS = [
  "M16.72 11.06A10.94 10.94 0 0 1 19 12.55",
  "M5 12.55a10.94 10.94 0 0 1 5.17-2.39",
  "M10.71 5.05A16 16 0 0 1 22.58 9",
  "M1.42 9a15.91 15.91 0 0 1 4.7-2.88",
  "M8.53 16.11a6 6 0 0 1 6.95 0",
  "M12 20h.01",
];
let iconCache = {};
function crearIconoAveria(frame) {
  const key = `f${frame}`;
  if (iconCache[key]) return iconCache[key];
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2, cy = size / 2;

  // Anillo pulsante (crece y se desvanece segun el frame de animacion).
  const pulseR = 14 + frame * 5;
  const pulseAlpha = Math.max(0, 0.35 - frame * 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(220,38,38,${pulseAlpha})`;
  ctx.fill();

  // Circulo solido central.
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(127,29,29,0.4)";
  ctx.shadowBlur = 5;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#dc2626";
  ctx.stroke();

  ctx.save();
  const iconSize = 15;
  const scale = iconSize / 24;
  ctx.translate(cx - iconSize / 2, cy - iconSize / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  WIFI_OFF_PATHS.forEach((d) => ctx.stroke(new Path2D(d)));
  // La "X" diagonal de wifi-off.
  ctx.beginPath();
  ctx.moveTo(1, 1);
  ctx.lineTo(23, 23);
  ctx.stroke();
  ctx.restore();

  const url = canvas.toDataURL("image/png");
  iconCache[key] = { url, size };
  return iconCache[key];
}

function parseCoords(ubicacion) {
  const partes = String(ubicacion || "").split(",").map((s) => Number(s.trim()));
  if (partes.length !== 2 || partes.some((n) => Number.isNaN(n))) return null;
  return { lat: partes[0], lng: partes[1] };
}

function formatoFecha(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
}

export default function MapaAveriaCompartidoPage() {
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState("");
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const frameRef = useRef(0);
  const mapsApiRef = useRef(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setError("Falta el ID de la avería en el link."); return; }
    fetch(`${HUAWEI_OLT_SNMP_API}/onu-averias-zona/reporte?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((r) => {
        if (!r.ok) throw new Error(r.error || "No se pudo cargar el reporte.");
        setReporte(r);
      })
      .catch((e) => setError(e.message || "Error de red."));
  }, []);

  useEffect(() => {
    if (!reporte) return;
    const conCoords = reporte.clientes_afectados.map((c) => ({ ...c, coords: parseCoords(c.ubicacion) })).filter((c) => c.coords);
    if (!conCoords.length) return;
    let cancelado = false;
    let animId = null;
    loadGoogleMapsSdk().then((maps) => {
      if (cancelado || !mapRef.current) return;
      mapsApiRef.current = maps;
      const bounds = new maps.LatLngBounds();
      conCoords.forEach((c) => bounds.extend(c.coords));
      const map = new maps.Map(mapRef.current, {
        center: bounds.getCenter(),
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      if (conCoords.length > 1) map.fitBounds(bounds); else map.setZoom(16);

      const icon0 = crearIconoAveria(0);
      markersRef.current = conCoords.map((c) => {
        const marker = new maps.Marker({
          position: c.coords,
          map,
          icon: { url: icon0.url, scaledSize: new maps.Size(icon0.size, icon0.size), anchor: new maps.Point(icon0.size / 2, icon0.size / 2) },
          title: c.nombre || c.sn_onu,
        });
        const info = new maps.InfoWindow({
          content: `<div style="font-size:13px;max-width:220px;padding:2px"><b>${c.nombre || "Sin nombre"}</b><br/>${c.direccion || ""}${c.celular ? `<br/>📞 ${c.celular}` : ""}</div>`,
        });
        marker.addListener("click", () => info.open(map, marker));
        return marker;
      });

      // Animacion del anillo pulsante -- 4 frames en bucle, redibujando el
      // icono de cada marcador (no hay forma de animar un icono estatico
      // de Marker salvo reemplazarlo seguido).
      const anim = () => {
        if (cancelado) return;
        frameRef.current = (frameRef.current + 1) % 4;
        const ic = crearIconoAveria(frameRef.current);
        markersRef.current.forEach((m) => m.setIcon({ url: ic.url, scaledSize: new maps.Size(ic.size, ic.size), anchor: new maps.Point(ic.size / 2, ic.size / 2) }));
        animId = setTimeout(anim, 400);
      };
      anim();
    }).catch(() => {});
    return () => { cancelado = true; if (animId) clearTimeout(animId); };
  }, [reporte]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif", background: "#f4f6fb", padding: 20 }}>
        <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#991b1b", padding: 20, borderRadius: 12, fontSize: 14, fontWeight: 600, maxWidth: 420, textAlign: "center" }}>{error}</div>
      </div>
    );
  }
  if (!reporte) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif", color: "#64748b", fontSize: 14 }}>
        Cargando reporte de avería…
      </div>
    );
  }

  const { averia, clientes_afectados: clientes, onus_sin_identificar: sinId, total_afectados: total } = reporte;
  const conCoords = clientes.filter((c) => parseCoords(c.ubicacion));

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6fb", fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .avc-card { animation: fadeSlideIn 0.4s ease both; }
      `}</style>

      <div style={{ padding: "18px 16px", background: averia.activa ? "linear-gradient(135deg,#dc2626,#991b1b)" : "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff" }} className="avc-card">
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9, display: "flex", alignItems: "center", gap: 6 }}>
          {averia.activa ? "🔴 AVERÍA ACTIVA" : "✅ AVERÍA RESUELTA"}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
          Board {averia.board} · Puerto {averia.port}
        </div>
        <div style={{ fontSize: 13, marginTop: 2, opacity: 0.95 }}>
          {averia.tipo === "power_down" ? "Corte de luz" : "Sin señal (LOS)"} · {total} cliente{total === 1 ? "" : "s"} afectado{total === 1 ? "" : "s"}
        </div>
        <div style={{ fontSize: 11.5, marginTop: 6, opacity: 0.85 }}>
          Inicio {formatoFecha(averia.primera_deteccion)}{averia.resuelta_en ? ` · Resuelta ${formatoFecha(averia.resuelta_en)}` : ""}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
        {conCoords.length > 0 ? (
          <div className="avc-card" style={{ height: 320, borderRadius: 14, overflow: "hidden", border: "1.5px solid #e2e8f4", marginBottom: 16, boxShadow: "0 4px 16px rgba(15,23,42,0.08)" }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          </div>
        ) : (
          <div className="avc-card" style={{ padding: 20, borderRadius: 12, background: "#fff", border: "1.5px dashed #e2e8f4", textAlign: "center", color: "#5b6b8c", fontSize: 13, marginBottom: 16 }}>
            Ningún cliente afectado tiene coordenadas GPS registradas.
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {clientes.map((c, i) => (
            <div key={c.sn_onu} className="avc-card" style={{ animationDelay: `${i * 40}ms`, padding: 14, borderRadius: 12, background: "#fff", border: "1.5px solid #e2e8f4", boxShadow: "0 2px 8px rgba(15,23,42,0.04)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1a2740" }}>{c.nombre || "Sin nombre"}</div>
              <div style={{ fontSize: 12, color: "#5b6b8c", marginTop: 2 }}>DNI {c.dni || "—"} · {c.nodo || "—"}</div>
              <div style={{ fontSize: 12, color: "#5b6b8c", marginTop: 2 }}>{c.direccion || "Sin dirección registrada"}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                {c.celular && <a href={`tel:${c.celular}`} style={{ fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>📞 {c.celular}</a>}
                {parseCoords(c.ubicacion) && (
                  <a href={`https://www.google.com/maps?q=${encodeURIComponent(c.ubicacion)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>📍 Ver en mapa</a>
                )}
              </div>
            </div>
          ))}
          {sinId.length > 0 && (
            <div className="avc-card" style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px dashed #e2e8f4", fontSize: 12, color: "#5b6b8c" }}>
              {sinId.length} ONU(s) caída(s) sin cliente identificado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
