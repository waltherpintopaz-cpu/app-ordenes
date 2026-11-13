import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabaseClient";

// Pagina publica /sigue/<token>: el cliente ve en el mapa donde esta su
// tecnico mientras la orden esta "En proceso" (el tecnico apreto Iniciar).
// Se actualiza sola cada 15 s. Usa el mismo token del link del WiFi.
const REFRESCO_MS = 15000;

const kmEntre = (a, b) => {
  const r = (v) => (v * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const iconoHtml = (emoji, color) => L.divIcon({
  className: "",
  html: `<div style="width:40px;height:40px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:21px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">${emoji}</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

export default function SigueTecnicoPage() {
  const token = decodeURIComponent(window.location.pathname.replace(/^\/sigue\/?/, "").split("/")[0] || "");
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const mapDiv = useRef(null);
  const mapa = useRef(null);
  const marcTec = useRef(null);
  const marcCasa = useRef(null);
  const encuadrado = useRef(false);

  useEffect(() => {
    document.title = "Sigue a tu técnico";
    let vivo = true;
    const cargar = async () => {
      const { data, error: e } = await supabase.rpc("seguimiento_orden", { p_token: token });
      if (!vivo) return;
      if (e || !data?.ok) { setError(data?.error || "No se pudo abrir el link."); return; }
      setError("");
      setInfo(data);
    };
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [token]);

  const esDim = /dim/i.test(info?.empresa || "");
  const color = esDim ? "#e11d48" : "#1d4ed8";
  const tec = info?.lat != null ? { lat: info.lat, lng: info.lng } : null;
  const casa = info?.destino_lat != null ? { lat: info.destino_lat, lng: info.destino_lng } : null;

  useEffect(() => {
    if (!mapDiv.current || !tec) return;
    if (!mapa.current) {
      mapa.current = L.map(mapDiv.current, { zoomControl: true, attributionControl: false }).setView([tec.lat, tec.lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa.current);
    }
    if (!marcTec.current) marcTec.current = L.marker([tec.lat, tec.lng], { icon: iconoHtml("🛵", color) }).addTo(mapa.current);
    else marcTec.current.setLatLng([tec.lat, tec.lng]);
    if (casa && !marcCasa.current) marcCasa.current = L.marker([casa.lat, casa.lng], { icon: iconoHtml("🏠", "#16a34a") }).addTo(mapa.current);
    if (!encuadrado.current) {
      encuadrado.current = true;
      if (casa) mapa.current.fitBounds(L.latLngBounds([[tec.lat, tec.lng], [casa.lat, casa.lng]]), { padding: [50, 50], maxZoom: 16 });
    }
  }, [tec?.lat, tec?.lng, casa?.lat, color]); // eslint-disable-line react-hooks/exhaustive-deps

  const km = tec && casa ? kmEntre(tec, casa) : null;
  // ~25 km/h promedio en ciudad + 3 min de margen.
  const minutos = km != null ? Math.max(1, Math.round((km / 25) * 60) + 3) : null;
  const hace = info?.actualizado ? Math.max(0, Math.round((Date.now() - new Date(info.actualizado).getTime()) / 60000)) : null;
  const llegando = km != null && km < 0.15;

  const caja = { position: "absolute", left: 12, right: 12, bottom: 16, zIndex: 1000, background: "#fff", borderRadius: 16, padding: "14px 16px", boxShadow: "0 8px 24px rgba(15,23,42,.25)", fontFamily: "Inter, system-ui, sans-serif", maxWidth: 480, margin: "0 auto" };
  const pantalla = (emoji, titulo, texto) => (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif", textAlign: "center", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 380 }}>
        <div style={{ fontSize: 48 }}>{emoji}</div>
        <h2 style={{ margin: "8px 0", color: "#0f172a" }}>{titulo}</h2>
        <p style={{ color: "#475569", fontSize: 15 }}>{texto}</p>
      </div>
    </div>
  );

  if (error) return pantalla("⚠️", "Link no válido", error);
  if (!info) return pantalla("⏳", "Cargando…", "");
  if (info.fase === "terminada") return pantalla("✅", "Visita terminada", "Tu técnico ya terminó. ¡Gracias por elegirnos!");
  if (info.fase === "pendiente") return pantalla("🗓️", "Tu técnico aún no sale", `Cuando ${info.tecnico || "tu técnico"} inicie el viaje hacia tu casa, aquí vas a ver dónde está. Esta página se actualiza sola.`);
  if (info.fase === "sin_gps") return pantalla("🛵", `${info.tecnico || "Tu técnico"} ya va en camino`, "Por ahora no tenemos su ubicación exacta. Esta página se actualiza sola.");

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div ref={mapDiv} style={{ position: "absolute", inset: 0 }} />
      <div style={caja}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
          {llegando ? `🎉 ${info.tecnico || "Tu técnico"} está llegando` : `🛵 ${info.tecnico || "Tu técnico"} va en camino`}
        </div>
        <div style={{ fontSize: 14, color: "#475569", marginTop: 4 }}>
          {km != null && !llegando ? `A ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} · llega en aprox. ${minutos} min` : !casa ? "Su ubicación se actualiza sola." : "Ya casi está en tu puerta."}
        </div>
        {hace != null && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>Ubicación de hace {hace === 0 ? "menos de 1 min" : `${hace} min`} · orden {info.codigo}</div>}
      </div>
    </div>
  );
}
