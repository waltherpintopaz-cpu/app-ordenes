import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabaseClient";
import { crearIconoVehiculoTipo, vehicleIconGeometry } from "../utils/vehicleIcon";

// Pagina publica /sigue/<token>: el cliente ve en el mapa donde esta su
// tecnico mientras la orden esta "En proceso" (el tecnico apreto Iniciar).
// Se actualiza sola cada 15 s. Usa el mismo token del link del WiFi.
// 13-nov: auto con escalera (icono real del vehiculo, gira segun el rumbo),
// movimiento suave, linea al destino, branding y tarjeta mas clara.
const REFRESCO_MS = 15000;

const MARCAS = {
  am: { nombre: "Americanet", logo: "/americanet-logo-clean.png", logoAlto: 26, az: "#1E4F9C", acento: "#F47A20", acentoRgb: "244,122,32" },
  dim: { nombre: "DIM internet", logo: "/dim-logo-marca.png", logoAlto: 40, az: "#0A2FD6", acento: "#16a34a", acentoRgb: "22,163,74" },
};

const kmEntre = (a, b) => {
  const r = (v) => (v * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
const rumbo = (a, b) => {
  const r = (v) => (v * Math.PI) / 180;
  const y = Math.sin(r(b.lng - a.lng)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const iconoCasa = (color) => L.divIcon({
  className: "",
  html: `<div style="position:relative;width:44px;height:52px">
    <div style="position:absolute;left:0;top:0;width:44px;height:44px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};box-shadow:0 3px 10px rgba(0,0,0,.35);border:3px solid #fff"></div>
    <div style="position:absolute;left:0;top:0;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:20px">🏠</div>
  </div>`,
  iconSize: [44, 52],
  iconAnchor: [22, 50],
});

const iconoVehiculo = (veh, bearing) => {
  const geo = vehicleIconGeometry(76);
  const url = crearIconoVehiculoTipo(veh?.tipo_vehiculo || "sedan", veh ? !!veh.tiene_escalera : true, "#F8FAFC", bearing, null);
  return url
    ? L.icon({ iconUrl: url, iconSize: [geo.width, geo.height], iconAnchor: [geo.anchorX, geo.anchorY] })
    : L.divIcon({ className: "", html: `<div style="width:36px;height:36px;border-radius:50%;background:#1d4ed8;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
};

const ESTILOS = (m) => `
@keyframes st-pulso { 0% { transform: scale(.6); opacity: .7 } 100% { transform: scale(1.55); opacity: 0 } }
@keyframes st-subir { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
@keyframes st-latir { 0%,100% { transform: scale(1) } 50% { transform: scale(1.12) } }
.st-onda { position: absolute; inset: 0; border-radius: 50%; background: rgba(${m.acentoRgb},.45); animation: st-pulso 2.2s ease-out infinite; }
.st-card { animation: st-subir .45s cubic-bezier(.2,.8,.2,1) both; }
.st-btn:active { transform: scale(.96); }
.leaflet-container { font-family: Inter, system-ui, sans-serif; background: #e8eef5; }
`;

export default function SigueTecnicoPage() {
  const token = decodeURIComponent(window.location.pathname.replace(/^\/sigue\/?/, "").split("/")[0] || "");
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [veh, setVeh] = useState(null);
  const [siguiendo, setSiguiendo] = useState(true);
  const [, setTick] = useState(0);
  const mapDiv = useRef(null);
  const mapa = useRef(null);
  const marcTec = useRef(null);
  const marcCasa = useRef(null);
  const linea = useRef(null);
  const encuadrado = useRef(false);
  const posAnt = useRef(null);
  const rumboRef = useRef(0);
  const anim = useRef(null);

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
    const t2 = setInterval(() => setTick((x) => x + 1), 30000); // "hace X min" vivo
    return () => { vivo = false; clearInterval(t); clearInterval(t2); };
  }, [token]);

  // Vehiculo del tecnico (tipo de auto y si lleva escalera).
  useEffect(() => {
    const nombre = String(info?.tecnico || "").trim();
    if (!nombre) return;
    supabase.from("vehiculos").select("placa,tipo_vehiculo,tiene_escalera").eq("tecnico_asignado", nombre).limit(1).maybeSingle()
      .then(({ data }) => { if (data) setVeh(data); }, () => {});
  }, [info?.tecnico]);

  const m = /dim/i.test(info?.empresa || "") ? MARCAS.dim : MARCAS.am;
  const tec = info?.lat != null ? { lat: Number(info.lat), lng: Number(info.lng) } : null;
  const casa = info?.destino_lat != null ? { lat: Number(info.destino_lat), lng: Number(info.destino_lng) } : null;

  useEffect(() => {
    if (!mapDiv.current || !tec) return;
    if (!mapa.current) {
      mapa.current = L.map(mapDiv.current, { zoomControl: false, attributionControl: false }).setView([tec.lat, tec.lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa.current);
      L.control.zoom({ position: "topright" }).addTo(mapa.current);
      mapa.current.on("dragstart", () => setSiguiendo(false));
    }
    // Rumbo: hacia donde se movio (si se movio algo); si recien empieza, mirando a la casa.
    const ant = posAnt.current;
    if (ant && kmEntre(ant, tec) > 0.005) rumboRef.current = rumbo(ant, tec);
    else if (!ant && casa) rumboRef.current = rumbo(tec, casa);
    const icono = iconoVehiculo(veh, rumboRef.current);

    if (!marcTec.current) {
      marcTec.current = L.marker([tec.lat, tec.lng], { icon: icono, zIndexOffset: 1000 }).addTo(mapa.current);
    } else {
      marcTec.current.setIcon(icono);
      // Movimiento suave entre una lectura y otra (1.5 s).
      const desde = marcTec.current.getLatLng();
      const hasta = L.latLng(tec.lat, tec.lng);
      if (anim.current) cancelAnimationFrame(anim.current);
      const t0 = performance.now();
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / 1500);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        marcTec.current.setLatLng([desde.lat + (hasta.lat - desde.lat) * e, desde.lng + (hasta.lng - desde.lng) * e]);
        if (k < 1) anim.current = requestAnimationFrame(paso);
      };
      anim.current = requestAnimationFrame(paso);
    }
    posAnt.current = tec;

    if (casa && !marcCasa.current) marcCasa.current = L.marker([casa.lat, casa.lng], { icon: iconoCasa(m.acento) }).addTo(mapa.current);
    if (casa) {
      const pts = [[tec.lat, tec.lng], [casa.lat, casa.lng]];
      if (!linea.current) linea.current = L.polyline(pts, { color: m.az, weight: 4, opacity: 0.75, dashArray: "2 10", lineCap: "round" }).addTo(mapa.current);
      else linea.current.setLatLngs(pts);
    }
    if (!encuadrado.current) {
      encuadrado.current = true;
      if (casa) mapa.current.fitBounds(L.latLngBounds([[tec.lat, tec.lng], [casa.lat, casa.lng]]), { padding: [60, 60], paddingBottomRight: [60, 220], maxZoom: 16 });
    } else if (siguiendo) {
      mapa.current.panTo([tec.lat, tec.lng], { animate: true, duration: 1.2 });
    }
  }, [tec?.lat, tec?.lng, casa?.lat, veh, m.acento]); // eslint-disable-line react-hooks/exhaustive-deps

  const centrar = () => {
    setSiguiendo(true);
    if (!mapa.current || !tec) return;
    if (casa) mapa.current.fitBounds(L.latLngBounds([[tec.lat, tec.lng], [casa.lat, casa.lng]]), { padding: [60, 60], paddingBottomRight: [60, 220], maxZoom: 16 });
    else mapa.current.setView([tec.lat, tec.lng], 16);
  };

  const km = tec && casa ? kmEntre(tec, casa) : null;
  // ~25 km/h promedio en ciudad + 3 min de margen.
  const minutos = km != null ? Math.max(1, Math.round((km / 25) * 60) + 3) : null;
  const hace = info?.actualizado ? Math.max(0, Math.round((Date.now() - new Date(info.actualizado).getTime()) / 60000)) : null;
  const llegando = km != null && km < 0.15;
  const nombreTec = String(info?.tecnico || "Tu técnico").trim();
  const primerNombre = nombreTec.split(/\s+/)[0] || "Tu técnico";
  const llegadaHora = minutos != null ? new Date(Date.now() + minutos * 60000).toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" }) : null;

  const pantalla = (emoji, titulo, texto) => (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: `linear-gradient(160deg, ${m.az}, #0f2c5c)`, fontFamily: "Inter, system-ui, sans-serif", textAlign: "center", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 380, width: "100%", background: "#fff", borderRadius: 22, padding: "26px 22px", boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
        <img src={m.logo} alt={m.nombre} style={{ height: m.logoAlto, marginBottom: 14 }} />
        <div style={{ fontSize: 46 }}>{emoji}</div>
        <h2 style={{ margin: "8px 0", color: "#0f172a", fontSize: 21 }}>{titulo}</h2>
        <p style={{ color: "#475569", fontSize: 15, margin: 0, lineHeight: 1.5 }}>{texto}</p>
      </div>
    </div>
  );

  if (error) return pantalla("⚠️", "Link no válido", error);
  if (!info) return pantalla("⏳", "Cargando…", "Buscando a tu técnico en el mapa.");
  if (info.fase === "terminada") return pantalla("✅", "Visita terminada", "Tu técnico ya terminó. ¡Gracias por elegirnos!");
  if (info.fase === "pendiente") return pantalla("🗓️", "Tu técnico aún no sale", `Cuando ${primerNombre} inicie el viaje hacia tu casa, aquí vas a ver dónde está. Esta página se actualiza sola.`);
  if (info.fase === "sin_gps") return pantalla("🚗", `${primerNombre} ya va en camino`, "Por ahora no tenemos su ubicación exacta. Esta página se actualiza sola.");

  const progreso = km != null ? Math.max(6, Math.min(100, 100 - (km / Math.max(km, 5)) * 100)) : null;

  return (
    <div style={{ position: "fixed", inset: 0, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{ESTILOS(m)}</style>
      <div ref={mapDiv} style={{ position: "absolute", inset: 0 }} />

      {/* Marca arriba */}
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1000, background: "#fff", borderRadius: 14, padding: "7px 12px", boxShadow: "0 4px 14px rgba(15,23,42,.18)", display: "flex", alignItems: "center", gap: 8 }}>
        <img src={m.logo} alt={m.nombre} style={{ height: m.logoAlto - 4, display: "block" }} />
      </div>

      {/* Volver a centrar */}
      {!siguiendo && (
        <button type="button" className="st-btn" onClick={centrar}
          style={{ position: "absolute", right: 12, bottom: 210, zIndex: 1000, border: "none", background: "#fff", color: m.az, borderRadius: 999, padding: "10px 14px", fontWeight: 800, fontSize: 13, boxShadow: "0 4px 14px rgba(15,23,42,.25)", cursor: "pointer", fontFamily: "inherit" }}>
          ◎ Centrar
        </button>
      )}

      {/* Tarjeta */}
      <div className="st-card" style={{ position: "absolute", left: 12, right: 12, bottom: 14, zIndex: 1000, background: "#fff", borderRadius: 20, padding: "16px 16px 14px", boxShadow: "0 10px 30px rgba(15,23,42,.28)", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", width: 50, height: 50, flexShrink: 0 }}>
            <div className="st-onda" />
            <div style={{ position: "relative", width: 50, height: 50, borderRadius: "50%", background: `linear-gradient(135deg, ${m.az}, ${m.acento})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, border: "3px solid #fff", boxShadow: "0 3px 10px rgba(15,23,42,.25)" }}>
              {primerNombre.charAt(0).toUpperCase()}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              {llegando ? `🎉 ${primerNombre} está llegando` : `${primerNombre} va en camino`}
            </div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Técnico de {m.nombre}{veh?.placa ? ` · 🚗 ${veh.placa}` : ""}
            </div>
          </div>
          {!llegando && minutos != null && (
            <div style={{ textAlign: "center", background: `rgba(${m.acentoRgb},.1)`, borderRadius: 14, padding: "6px 10px", flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: m.acento, lineHeight: 1 }}>{minutos}</div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: m.acento }}>min</div>
            </div>
          )}
        </div>

        {km != null && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
              <span>{llegando ? "Ya casi está en tu puerta" : `A ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} de tu casa`}</span>
              {!llegando && llegadaHora && <span style={{ color: m.az }}>Llega aprox. {llegadaHora}</span>}
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
              <div style={{ width: `${llegando ? 100 : progreso}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${m.az}, ${m.acento})`, transition: "width 1s ease" }} />
            </div>
          </div>
        )}
        {km == null && <div style={{ fontSize: 13, color: "#475569", marginTop: 10 }}>Su ubicación se actualiza sola.</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 11.5, color: "#94a3b8" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: hace != null && hace <= 2 ? "#16a34a" : "#f59e0b", display: "inline-block" }} />
          <span style={{ whiteSpace: "nowrap" }}>{hace != null ? (hace === 0 ? "En vivo · actualizado ahora" : `Actualizado hace ${hace} min`) : "En vivo"}</span>
          <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{String(info.codigo || "").replace(/-20dd$/, "")}</span>
        </div>
      </div>
    </div>
  );
}
