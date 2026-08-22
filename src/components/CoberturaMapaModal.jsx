import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cargarZonasCobertura } from "../utils/zonasCobertura";
import { buscarZonaCobertura } from "../utils/cobertura";
import PromoPicker from "./PromoPicker";

function parseCoordStr(str) {
  const [lat, lng] = String(str || "").split(",").map((x) => Number(String(x).trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(m) {
  if (!Number.isFinite(m)) return "-";
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

// Distancia real por calles (no linea recta) usando el servidor publico de
// OSRM — gratis, sin API key. Perfil "foot" porque se acerca mas al recorrido
// real del cable/tendido que el perfil de carro (que respeta sentidos unicos).
async function calcularRutaOsrm(origen, destino) {
  const url = `https://router.project-osrm.org/route/v1/foot/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM respondio ${res.status}`);
  const data = await res.json();
  const ruta = data?.routes?.[0];
  if (data.code !== "Ok" || !ruta) throw new Error("Sin ruta disponible");
  const puntos = (ruta.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);
  return { distanciaM: ruta.distance, duracionS: ruta.duration, puntos };
}

// Pin del cliente: siempre azul (para no confundirse con los leads en rojo ni
// con las zonas verdes/rojas), con un icono de persona y un badge de estado
// (✓ verde / ✕ rojo / … gris mientras se verifica) en la esquina.
function pinClienteIcon(estado, size = 36) {
  // estado: undefined="verificando", true="en cobertura", false="fuera"
  const w = size, h = Math.round(size * 1.35);
  const badgeColor = estado === undefined ? "#94a3b8" : estado ? "#16a34a" : "#dc2626";
  const badgeGlyph = estado === undefined
    ? `<circle cx="0" cy="0" r="2.2" fill="#fff"/>`
    : estado
      ? `<path d="M-3 0.5 L-1 2.5 L3.2 -2.2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M-2.4 -2.4 L2.4 2.4 M2.4 -2.4 L-2.4 2.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 36 49">
    <defs>
      <filter id="s" x="-60%" y="-20%" width="220%" height="170%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#0f172a" flood-opacity="0.45"/>
      </filter>
    </defs>
    <path filter="url(#s)" d="M18 0C8.6 0 1 7.6 1 17c0 12.7 17 29 17 29s17-16.3 17-29C35 7.6 27.4 0 18 0z" fill="#2563eb"/>
    <circle cx="18" cy="17" r="12.5" fill="rgba(255,255,255,0.18)"/>
    <circle cx="18" cy="12.3" r="3.6" fill="#fff"/>
    <path d="M9.5 24.5c1.6-4.6 5-6.9 8.5-6.9s6.9 2.3 8.5 6.9c-2.3 2-5.3 3.2-8.5 3.2s-6.2-1.2-8.5-3.2z" fill="#fff"/>
    <g transform="translate(28,9)">
      <circle r="6.2" fill="${badgeColor}" stroke="#fff" stroke-width="1.8"/>
      ${badgeGlyph}
    </g>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h],
  });
}

// Pin más compacto con un "!" — para leads sin cobertura pendientes de notificar.
function pinLeadIcon(color = "#dc2626", size = 26) {
  const w = size, h = Math.round(size * 1.35);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 26 35">
    <defs>
      <filter id="s" x="-60%" y="-20%" width="220%" height="170%">
        <feDropShadow dx="0" dy="1.1" stdDeviation="1.2" flood-color="#0f172a" flood-opacity="0.45"/>
      </filter>
    </defs>
    <path filter="url(#s)" d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 22 13 22s13-12.3 13-22C26 5.8 20.2 0 13 0z" fill="${color}"/>
    <rect x="12" y="6.5" width="2" height="8" rx="1" fill="#fff"/>
    <circle cx="13" cy="17.5" r="1.4" fill="#fff"/>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h],
  });
}

// Pin de caja NAP — misma caja de fibra (con clips laterales y puertos) que
// se usa en el navegador (Mapa NAP / Cobertura) y en la app mobile, para que
// se vea igual en todos lados. Color segun ocupacion (verde=espacio libre,
// naranja=casi llena, rojo=llena).
function pinCajaIcon(ocupacion, size = 30) {
  const llena = ocupacion != null && ocupacion >= 1;
  const casiLlena = ocupacion != null && ocupacion >= 0.75 && ocupacion < 1;
  const portColor = llena ? "#dc2626" : casiLlena ? "#d97706" : "#16a34a";
  const borderColor = llena ? "#dc2626" : "#64748b";
  const W = 22, H = 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 28 40">
    <rect x="3" y="0.5" width="22" height="33" rx="3" fill="#cfd8dc" stroke="${borderColor}" stroke-width="1.4"/>
    <rect x="0" y="7" width="3" height="6" rx="1" fill="#a8bcc5"/>
    <rect x="0" y="19" width="3" height="6" rx="1" fill="#a8bcc5"/>
    <rect x="25" y="7" width="3" height="6" rx="1" fill="#a8bcc5"/>
    <rect x="25" y="19" width="3" height="6" rx="1" fill="#a8bcc5"/>
    <line x1="6" y1="7" x2="22" y2="7" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="6" y1="11" x2="22" y2="11" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="6" y1="15" x2="22" y2="15" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="6" y1="19" x2="22" y2="19" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="6" y1="23" x2="22" y2="23" stroke="#a8bcc5" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="7" cy="30" r="1.5" fill="${portColor}"/>
    <circle cx="10" cy="30" r="1.5" fill="${portColor}"/>
    <circle cx="13" cy="30" r="1.5" fill="${portColor}"/>
    <circle cx="16" cy="30" r="1.5" fill="${portColor}"/>
    <circle cx="19" cy="30" r="1.5" fill="#64748b"/>
    <circle cx="22" cy="30" r="1.5" fill="#64748b"/>
    <polygon points="14,34 9,40 19,40" fill="${borderColor}"/>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [W, H],
    iconAnchor: [W / 2, H],
    popupAnchor: [0, -H],
  });
}

// Modal de pantalla completa: dibuja las zonas de cobertura (polígonos reales,
// no un mini-mapa embebido) y marca si la ubicación del cliente cae dentro.
export default function CoberturaMapaModal({
  coordenadas, coordsLista = [], buscando, onClose, onSeleccionarCoord, onReintentar, onEnviarSinCobertura,
  leadsPendientes = [], onNotificarLead, promociones = [], onEnviarPromocion, onEnviarPromocionBloque,
  cajasNap = [],
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const clienteMarkerRef = useRef(null);
  const zonasFitRef = useRef(null);
  const capaCallesRef = useRef(null);
  const capaSatRef = useRef(null);
  const leadMarkersRef = useRef([]);
  const cajaMarkersRef = useRef([]);
  const rutaCajaLineRef = useRef(null);
  const radioCajasCircleRef = useRef(null);
  const [zona, setZona] = useState(undefined); // undefined=verificando, null=fuera, obj=dentro
  const [zonasCargando, setZonasCargando] = useState(true);
  const [capa, setCapa] = useState("calles"); // "calles" | "satelite"
  const [copiado, setCopiado] = useState(false);
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [avisoEnviado, setAvisoEnviado] = useState(false);
  const [errorAviso, setErrorAviso] = useState("");
  const [leadSeleccionado, setLeadSeleccionado] = useState(null);
  const [notificandoLead, setNotificandoLead] = useState(false);
  const [errorLead, setErrorLead] = useState("");
  const [showPromos, setShowPromos] = useState(false);
  const [mostrarLeads, setMostrarLeads] = useState(false);
  const [mostrarCajas, setMostrarCajas] = useState(false);
  const [cajaSeleccionada, setCajaSeleccionada] = useState(null);
  const [radioCajasAmpliado, setRadioCajasAmpliado] = useState(false);
  const RADIO_CAJAS_M = 500;
  const [cajaElegida, setCajaElegida] = useState(null); // { ...caja, distanciaLineaRecta, distanciaM?, duracionS?, puntos?, sinRuta? }
  const [eligiendoCaja, setEligiendoCaja] = useState(false);

  const punto = parseCoordStr(coordenadas);

  // Top 5 cajas mas cercanas por linea recta — candidatas a medir por ruta.
  // No basta con la mas cercana en linea recta: a veces esa exige un rodeo
  // largo (sin camino directo mapeado) y otra un poco "mas lejos" en linea
  // recta en realidad tiene una ruta caminable mucho mas corta.
  const candidatasCercanas = (() => {
    if (!punto || !cajasNap.length) return [];
    return cajasNap
      .map((caja) => {
        const lat = Number(caja.lat), lng = Number(caja.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { ...caja, distanciaLineaRecta: haversineM(punto.lat, punto.lng, lat, lng) };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanciaLineaRecta - b.distanciaLineaRecta)
      .slice(0, 5);
  })();
  const candidatasFingerprint = candidatasCercanas.map((c) => c.codigo).join("|");

  // Cajas dentro del radio por defecto (500m) del cliente — para no saturar el
  // mapa. Si no hay ubicacion aun, o el tecnico pidio "ver todas", no filtra.
  const cajasEnRadio = (!punto || radioCajasAmpliado)
    ? cajasNap
    : cajasNap.filter((caja) => {
        const lat = Number(caja.lat), lng = Number(caja.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        return haversineM(punto.lat, punto.lng, lat, lng) <= RADIO_CAJAS_M;
      });
  const filtroRadioActivo = !!punto && !radioCajasAmpliado;

  // Apenas hay ubicacion del cliente y ya cargaron las cajas, las muestra solo
  // (dentro del radio de 500m) sin que el tecnico tenga que activarlas a mano.
  useEffect(() => {
    if (punto && cajasNap.length > 0) setMostrarCajas(true);
  }, [coordenadas, cajasNap.length]);

  // Pide la ruta a cada una de las candidatas cercanas (en paralelo) y se
  // queda con la de distancia REAL mas corta, no con la mas cercana en linea
  // recta — asi no elige una caja "cerca en el mapa" pero con un rodeo largo
  // si otra un poco mas lejos en linea recta tiene camino directo.
  useEffect(() => {
    let cancelled = false;
    setCajaElegida(null);
    if (!punto || !candidatasCercanas.length) return;
    setEligiendoCaja(true);
    Promise.allSettled(
      candidatasCercanas.map((caja) =>
        calcularRutaOsrm(punto, { lat: Number(caja.lat), lng: Number(caja.lng) }).then((r) => ({ caja, ruta: r }))
      )
    ).then((resultados) => {
      if (cancelled) return;
      const exitosas = resultados.filter((r) => r.status === "fulfilled").map((r) => r.value);
      let elegida;
      if (exitosas.length) {
        const mejor = exitosas.reduce((a, b) => (a.ruta.distanciaM <= b.ruta.distanciaM ? a : b));
        elegida = { ...mejor.caja, distanciaM: mejor.ruta.distanciaM, duracionS: mejor.ruta.duracionS, puntos: mejor.ruta.puntos };
      } else {
        elegida = { ...candidatasCercanas[0], sinRuta: true };
      }
      setCajaElegida(elegida);
      setEligiendoCaja(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto?.lat, punto?.lng, candidatasFingerprint]);

  // Dibuja la ruta a la caja elegida como linea punteada sobre el mapa.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (rutaCajaLineRef.current) { rutaCajaLineRef.current.remove(); rutaCajaLineRef.current = null; }
    if (!map || !punto || !cajaElegida) return;
    const puntos = cajaElegida.puntos?.length
      ? cajaElegida.puntos
      : [[punto.lat, punto.lng], [Number(cajaElegida.lat), Number(cajaElegida.lng)]];
    rutaCajaLineRef.current = L.polyline(puntos, {
      color: "#0284c7",
      weight: 3,
      opacity: 0.85,
      dashArray: "6, 8",
      className: "ruta-caja-animada",
    }).addTo(map);
    const distanciaTexto = cajaElegida.distanciaM != null
      ? formatDist(cajaElegida.distanciaM)
      : `~${formatDist(cajaElegida.distanciaLineaRecta)}`;
    rutaCajaLineRef.current.bindTooltip(distanciaTexto, {
      permanent: true,
      direction: "center",
      className: "ruta-caja-tooltip",
    });
  }, [cajaElegida, punto?.lat, punto?.lng]);

  useEffect(() => {
    let cancelled = false;
    setAvisoEnviado(false);
    setErrorAviso("");
    setShowPromos(false);
    if (!punto) { setZona(undefined); return; }
    setZona(undefined);
    buscarZonaCobertura(punto.lat, punto.lng).then((z) => { if (!cancelled) setZona(z); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordenadas]);

  // Inicializar mapa + dibujar polígonos (una sola vez)
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([-16.398, -71.55], 12);

    capaCallesRef.current = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    capaSatRef.current = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
    });

    L.control.attribution({ prefix: false }).addAttribution('© <a href="https://carto.com">CARTO</a> · © OpenStreetMap · © Esri').addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapInstanceRef.current = map;

    cargarZonasCobertura().then((zonas) => {
      if (!mapInstanceRef.current) return;
      const zonasLayer = L.layerGroup().addTo(map);
      const bounds = [];
      zonas.forEach((z) => {
        const latlngs = z.coordinates.map((c) => [c.lat, c.lng]);
        L.polygon(latlngs, {
          color: z.strokeColor,
          weight: 2,
          fillColor: z.fillColor,
          fillOpacity: z.fillOpacity,
        })
          .bindTooltip(`${z.grupo} · ${z.nombre}`, { sticky: true })
          .addTo(zonasLayer);
        latlngs.forEach((ll) => bounds.push(ll));
      });
      zonasFitRef.current = bounds.length ? L.latLngBounds(bounds) : null;
      if (zonasFitRef.current && !punto) map.fitBounds(zonasFitRef.current, { padding: [20, 20] });
      setZonasCargando(false);
    });

    return () => { map.remove(); mapInstanceRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcador del cliente: se actualiza cada vez que cambian las coordenadas
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (clienteMarkerRef.current) { clienteMarkerRef.current.remove(); clienteMarkerRef.current = null; }
    if (!punto) return;

    clienteMarkerRef.current = L.marker([punto.lat, punto.lng], { icon: pinClienteIcon(undefined), zIndexOffset: 1000 }).addTo(map);
    map.flyTo([punto.lat, punto.lng], 16, { duration: 0.6 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordenadas]);

  // Actualiza el badge del pin del cliente cuando se resuelve la verificación
  // de zona, sin recrear el marcador ni volver a hacer flyTo.
  useEffect(() => {
    if (clienteMarkerRef.current) {
      clienteMarkerRef.current.setIcon(pinClienteIcon(zona === undefined ? undefined : !!zona));
    }
  }, [zona]);

  // Cambiar entre capa de calles y capa satelital
  useEffect(() => {
    const map = mapInstanceRef.current;
    const calles = capaCallesRef.current;
    const sat = capaSatRef.current;
    if (!map || !calles || !sat) return;
    if (capa === "satelite") {
      if (!map.hasLayer(sat)) sat.addTo(map);
      if (map.hasLayer(calles)) map.removeLayer(calles);
    } else {
      if (!map.hasLayer(calles)) calles.addTo(map);
      if (map.hasLayer(sat)) map.removeLayer(sat);
    }
  }, [capa]);

  // Marcadores de leads sin cobertura pendientes de notificar — ocultos por
  // defecto, solo se dibujan si el agente activa el toggle "Ver leads".
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    leadMarkersRef.current.forEach((m) => m.remove());
    leadMarkersRef.current = [];
    if (!mostrarLeads) return;

    leadsPendientes.forEach((lead) => {
      const p = parseCoordStr(lead.coordenadas);
      if (!p) return;
      const m = L.marker([p.lat, p.lng], { icon: pinLeadIcon(), zIndexOffset: 500 }).addTo(map);
      m.on("click", () => { setLeadSeleccionado(lead); setErrorLead(""); });
      leadMarkersRef.current.push(m);
    });
  }, [leadsPendientes, mostrarLeads]);

  // Cajas NAP — ocultas por defecto, se dibujan al activar "Ver cajas". Por
  // defecto solo las que estan a <=500m del cliente, para no saturar el mapa.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    cajaMarkersRef.current.forEach((m) => m.remove());
    cajaMarkersRef.current = [];
    if (!mostrarCajas) return;

    cajasEnRadio.forEach((caja) => {
      const lat = Number(caja.lat), lng = Number(caja.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const cap = Number(caja.capacidad || 0);
      const ocp = Number(caja.puertos_ocupados || 0);
      const ocupacion = cap > 0 ? ocp / cap : null;
      const m = L.marker([lat, lng], { icon: pinCajaIcon(ocupacion), zIndexOffset: 400 }).addTo(map);
      m.on("click", () => setCajaSeleccionada(caja));
      cajaMarkersRef.current.push(m);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajasEnRadio, mostrarCajas]);

  // Circulo de referencia del radio de 500m alrededor del cliente, para que
  // se entienda por que solo se ven algunas cajas y no "faltan" las demas.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (radioCajasCircleRef.current) { radioCajasCircleRef.current.remove(); radioCajasCircleRef.current = null; }
    if (!map || !mostrarCajas || !punto || !filtroRadioActivo) return;
    radioCajasCircleRef.current = L.circle([punto.lat, punto.lng], {
      radius: RADIO_CAJAS_M,
      color: "#0284c7",
      weight: 1,
      fillColor: "#0284c7",
      fillOpacity: 0.05,
      dashArray: "4, 6",
    }).addTo(map);
  }, [mostrarCajas, punto?.lat, punto?.lng, filtroRadioActivo]);

  async function notificarLeadSeleccionado() {
    if (!leadSeleccionado || !onNotificarLead) return;
    setNotificandoLead(true);
    setErrorLead("");
    try {
      await onNotificarLead(leadSeleccionado);
      setLeadSeleccionado(null);
    } catch (e) {
      setErrorLead(e.message || "No se pudo notificar");
    }
    setNotificandoLead(false);
  }

  function linkMaps() {
    return punto ? `https://maps.google.com/?q=${punto.lat},${punto.lng}` : "";
  }

  function textoCompartir() {
    const link = linkMaps();
    return zona
      ? `📍 Ubicación del cliente (en cobertura · ${zona.grupo} · ${zona.nombre}): ${link}`
      : `📍 Ubicación del cliente: ${link}`;
  }

  function compartirPorWhatsApp() {
    if (!punto) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(textoCompartir())}`, "_blank");
  }

  async function enviarAvisoSinCobertura() {
    if (!onEnviarSinCobertura || !punto) return;
    setEnviandoAviso(true);
    setErrorAviso("");
    try {
      await onEnviarSinCobertura(coordenadas);
      setAvisoEnviado(true);
    } catch (e) {
      setErrorAviso(e.message || "No se pudo enviar el aviso");
    }
    setEnviandoAviso(false);
  }

  async function copiarLink() {
    if (!punto) return;
    try {
      await navigator.clipboard.writeText(linkMaps());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      window.prompt("Copia el link:", linkMaps());
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.title}>🗺 Zona de cobertura</div>
            <div style={s.subtitle}>Ubicación del cliente sobre las zonas registradas</div>
          </div>
          <button onClick={onClose} style={s.btnClose}>✕</button>
        </div>

        {/* Body */}
        <div style={s.body}>
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          <style>{`
            .ruta-caja-animada { animation: rutaCajaMarchandoHormigas 0.8s linear infinite; }
            @keyframes rutaCajaMarchandoHormigas { to { stroke-dashoffset: -14; } }
            .ruta-caja-tooltip { background: #0f172a; color: #fff; border: none; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
            .ruta-caja-tooltip::before { display: none; }
          `}</style>

          {/* Toggle capa calles/satelital */}
          <button
            onClick={() => setCapa((c) => (c === "satelite" ? "calles" : "satelite"))}
            style={s.btnCapaIcon}
            title={capa === "satelite" ? "Cambiar a calles" : "Cambiar a satelital"}
          >
            {capa === "satelite" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="14" y="2" width="8" height="8" rx="1.5" transform="rotate(45 18 6)" />
                <line x1="13.5" y1="10.5" x2="7" y2="17" />
                <line x1="5" y1="19" x2="7" y2="17" />
                <line x1="2" y1="22" x2="5" y2="19" />
                <line x1="16" y1="2" x2="20" y2="6" />
              </svg>
            )}
          </button>

          {/* Toggle ver leads sin cobertura (oculto por defecto) */}
          {leadsPendientes.length > 0 && (
            <button
              onClick={() => setMostrarLeads((v) => !v)}
              style={{ ...s.btnLeadsToggle, background: mostrarLeads ? "#dc2626" : "rgba(15,23,42,0.85)" }}
              title={mostrarLeads ? "Ocultar leads sin cobertura" : "Ver leads sin cobertura pendientes"}
            >
              <span style={{ ...s.checkbox, background: mostrarLeads ? "#fff" : "transparent" }}>
                {mostrarLeads && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </span>
              Leads ({leadsPendientes.length})
            </button>
          )}

          {/* Toggle ver cajas NAP (oculto por defecto) */}
          {cajasNap.length > 0 && (
            <button
              onClick={() => setMostrarCajas((v) => !v)}
              style={{ ...s.btnCajasToggle, background: mostrarCajas ? "#0284c7" : "rgba(15,23,42,0.85)" }}
              title={mostrarCajas ? "Ocultar cajas NAP" : "Ver cajas NAP cercanas"}
            >
              <span style={{ ...s.checkbox, background: mostrarCajas ? "#fff" : "transparent" }}>
                {mostrarCajas && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </span>
              Cajas ({cajasEnRadio.length}{filtroRadioActivo ? ` · ${RADIO_CAJAS_M}m` : ""})
            </button>
          )}

          {/* Estado / badge flotante */}
          <div style={s.floatTop}>
            {buscando ? (
              <div style={s.statePill}>⏳ Buscando ubicación en el chat...</div>
            ) : zonasCargando ? (
              <div style={s.statePill}>⏳ Cargando zonas de cobertura...</div>
            ) : punto ? (
              zona === undefined ? (
                <div style={s.statePill}>⏳ Verificando cobertura...</div>
              ) : (
                <div style={{ ...s.statePill, background: zona ? "#f0fdf4" : "#fef2f2", color: zona ? "#16a34a" : "#dc2626", borderColor: zona ? "#86efac" : "#fecaca" }}>
                  {zona ? `✅ En cobertura · ${zona.grupo} · ${zona.nombre}` : "⚠ Fuera de las zonas de cobertura registradas"}
                </div>
              )
            ) : (
              <div style={{ ...s.statePill, background: "#fffbeb", color: "#92400e", borderColor: "#fde68a" }}>
                Sin ubicación aún — usa "Buscar en chat" o ingrésala manualmente
              </div>
            )}
          </div>

          {/* Pila de avisos: fluyen uno debajo del otro, sin superponerse */}
          <div style={s.floatStack}>
            {/* Aviso de zona fuera de cobertura: enviar mensaje + guardar lead */}
            {punto && zona === null && (
              <div style={s.avisoFuera}>
                <div style={s.avisoFueraTexto}>📍 Fuera de cobertura</div>
                <button onClick={enviarAvisoSinCobertura} disabled={enviandoAviso || avisoEnviado}
                  style={{ ...s.btnAviso, background: avisoEnviado ? "#16a34a" : "#dc2626", opacity: enviandoAviso ? 0.7 : 1 }}>
                  {avisoEnviado ? "✅ Mensaje enviado y guardado" : enviandoAviso ? "Enviando..." : "📨 Avisar al cliente y guardar"}
                </button>
                {errorAviso && <div style={s.avisoError}>{errorAviso}</div>}
              </div>
            )}

            {/* Cliente en cobertura: enviar una promoción */}
            {punto && zona && (
              <div style={s.avisoPromo}>
                {!showPromos ? (
                  <button onClick={() => setShowPromos(true)} style={s.btnPromo}>🎁 Enviar promoción</button>
                ) : (
                  <PromoPicker
                    promociones={promociones}
                    onEnviarPromocion={onEnviarPromocion}
                    onEnviarPromocionBloque={onEnviarPromocionBloque}
                    onClose={() => setShowPromos(false)}
                  />
                )}
              </div>
            )}

            {/* Caja NAP con la ruta real mas corta (compara varias candidatas, no solo la mas cercana en linea recta) */}
            {punto && (eligiendoCaja || cajaElegida) && (
              <div style={s.avisoCajaCercana}>
                📦 Caja más cercana: <strong>{cajaElegida?.codigo || "-"}</strong>
                {" · "}
                {eligiendoCaja
                  ? "comparando rutas cercanas..."
                  : cajaElegida?.sinRuta
                    ? `~${formatDist(cajaElegida.distanciaLineaRecta)} línea recta (sin ruta disponible)`
                    : `${formatDist(cajaElegida.distanciaM)} por ruta (~${Math.round(cajaElegida.duracionS / 60)} min a pie)`}
              </div>
            )}

            {/* Aviso cuando el radio de 500m no encuentra ninguna caja cerca */}
            {mostrarCajas && filtroRadioActivo && cajasEnRadio.length === 0 && (
              <button onClick={() => setRadioCajasAmpliado(true)} style={s.btnAmpliarRadio}>
                Sin cajas a {RADIO_CAJAS_M}m — ver todas ({cajasNap.length})
              </button>
            )}
            {mostrarCajas && radioCajasAmpliado && (
              <button onClick={() => setRadioCajasAmpliado(false)} style={s.btnAmpliarRadio}>
                Volver a {RADIO_CAJAS_M}m
              </button>
            )}
          </div>

          {/* Lead sin cobertura seleccionado en el mapa: notificar que ya hay cobertura */}
          {leadSeleccionado && (
            <div style={s.avisoLead}>
              <div style={s.avisoLeadHeader}>
                <div>
                  <div style={s.avisoLeadNombre}>{leadSeleccionado.nombre || "Sin nombre"}</div>
                  <div style={s.avisoLeadTelefono}>{leadSeleccionado.telefono}</div>
                </div>
                <button onClick={() => setLeadSeleccionado(null)} style={s.btnCerrarChico}>✕</button>
              </div>
              <div style={s.avisoFueraTexto}>Este contacto consultó antes y no tenía cobertura aquí. ¿Ya llegaste a esta zona?</div>
              <button onClick={notificarLeadSeleccionado} disabled={notificandoLead} style={{ ...s.btnAviso, background: "#16a34a", opacity: notificandoLead ? 0.7 : 1 }}>
                {notificandoLead ? "Enviando..." : "📨 Notificar que ya hay cobertura"}
              </button>
              {errorLead && <div style={s.avisoError}>{errorLead}</div>}
            </div>
          )}

          {/* Caja NAP seleccionada en el mapa: info de ocupacion */}
          {cajaSeleccionada && (
            <div style={s.avisoCaja}>
              <div style={s.avisoLeadHeader}>
                <div>
                  <div style={s.avisoLeadNombre}>📦 {cajaSeleccionada.codigo || "Caja NAP"}</div>
                  <div style={s.avisoLeadTelefono}>{cajaSeleccionada.sector || "-"} · {cajaSeleccionada.nodo || "-"}</div>
                </div>
                <button onClick={() => setCajaSeleccionada(null)} style={s.btnCerrarChico}>✕</button>
              </div>
              {Number(cajaSeleccionada.capacidad || 0) > 0 ? (
                <div style={s.avisoFueraTexto}>
                  Ocupación: <strong>{cajaSeleccionada.puertos_ocupados || 0}/{cajaSeleccionada.capacidad}</strong> puertos
                </div>
              ) : (
                <div style={s.avisoFueraTexto}>Sin datos de capacidad registrados.</div>
              )}
            </div>
          )}

          {/* Selector de múltiples ubicaciones encontradas */}
          {coordsLista.length > 1 && (
            <div style={s.floatList}>
              <div style={s.floatListLabel}>{coordsLista.length} ubicaciones encontradas en el chat</div>
              {coordsLista.map((c, i) => (
                <button key={i} onClick={() => onSeleccionarCoord?.(c)}
                  style={{ ...s.floatListItem, background: coordenadas === c ? "#eff6ff" : "#fff", borderColor: coordenadas === c ? "#3b82f6" : "#e2e8f0" }}>
                  {coordenadas === c ? "✓ " : ""}{c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <input
            style={s.input}
            type="text"
            placeholder="Pegar coordenadas manualmente: -16.438490, -71.598208"
            defaultValue={coordenadas}
            onKeyDown={(e) => { if (e.key === "Enter") onSeleccionarCoord?.(e.currentTarget.value); }}
          />
          <button onClick={onReintentar} disabled={buscando} style={{ ...s.btnAction, opacity: buscando ? 0.6 : 1 }}>
            {buscando ? "Buscando..." : "📍 Buscar en chat"}
          </button>
          <button onClick={copiarLink} disabled={!punto} style={{ ...s.btnCopiar, opacity: punto ? 1 : 0.5 }}>
            {copiado ? "✓ Copiado" : "🔗 Copiar link"}
          </button>
          <button onClick={compartirPorWhatsApp} disabled={!punto} style={{ ...s.btnWhatsapp, opacity: punto ? 1 : 0.5 }}>
            💬 Compartir por WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, zIndex: 4000, background: "rgba(15,23,42,0.65)", backdropFilter: "blur(4px)", display: "flex", padding: 10 },
  modal: { flex: 1, display: "flex", flexDirection: "column", background: "#f8fafc", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 80px rgba(15,23,42,0.4)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e2e8f0" },
  title: { fontSize: 15, fontWeight: 800, color: "#0f172a" },
  subtitle: { fontSize: 11, color: "#64748b", marginTop: 1 },
  btnClose: { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#475569" },
  body: { flex: 1, position: "relative", minHeight: 0 },
  floatTop: { position: "absolute", top: 10, left: 10, right: 10, zIndex: 900, display: "flex", justifyContent: "center", pointerEvents: "none" },
  statePill: { background: "rgba(15,23,42,0.85)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" },
  floatList: { position: "absolute", top: 54, right: 10, zIndex: 1000, background: "rgba(255,255,255,0.97)", borderRadius: 12, padding: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", maxWidth: 240 },
  floatListLabel: { fontSize: 10, fontWeight: 700, color: "#16a34a", marginBottom: 6 },
  floatListItem: { display: "block", width: "100%", textAlign: "left", fontSize: 10, fontFamily: "monospace", padding: "5px 8px", borderRadius: 6, border: "1px solid", marginBottom: 4, cursor: "pointer" },
  footer: { display: "flex", gap: 8, padding: 10, background: "#fff", borderTop: "1px solid #e2e8f0" },
  input: { flex: 1, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, fontFamily: "monospace", outline: "none" },
  btnAction: { padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  btnWhatsapp: { padding: "8px 16px", background: "#25d366", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  btnCopiar: { padding: "8px 16px", background: "#334155", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  btnCapa: { position: "absolute", top: 10, left: 10, zIndex: 1000, background: "rgba(15,23,42,0.85)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" },
  btnCapaIcon: { position: "absolute", top: 10, left: 10, zIndex: 1000, background: "rgba(15,23,42,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" },
  btnLeadsToggle: { position: "absolute", top: 10, left: 52, zIndex: 1000, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 999, height: 34, padding: "0 12px 0 8px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", color: "#fff", fontSize: 11, fontWeight: 700 },
  btnCajasToggle: { position: "absolute", top: 50, left: 10, zIndex: 1000, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 999, height: 34, padding: "0 12px 0 8px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", color: "#fff", fontSize: 11, fontWeight: 700 },
  checkbox: { width: 15, height: 15, borderRadius: 4, border: "1.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  floatStack: { position: "absolute", top: 54, left: 10, right: 10, zIndex: 950, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" },
  avisoFuera: { pointerEvents: "auto", width: "100%", background: "#fff", border: "1.5px solid #fecaca", borderRadius: 12, padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", maxWidth: 420 },
  avisoFueraTexto: { fontSize: 11.5, color: "#7f1d1d", fontWeight: 600, marginBottom: 8, lineHeight: 1.4 },
  btnAviso: { width: "100%", padding: "8px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" },
  avisoError: { fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 6 },
  avisoPromo: { pointerEvents: "auto", width: "100%", maxWidth: 420 },
  btnPromo: { display: "block", width: "100%", padding: "9px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 999, fontWeight: 700, fontSize: 12, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" },
  avisoLead: { position: "absolute", bottom: 10, left: 10, right: 10, zIndex: 960, background: "#fff", border: "1.5px solid #86efac", borderRadius: 12, padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", maxWidth: 420, marginLeft: "auto", marginRight: "auto" },
  avisoCaja: { position: "absolute", bottom: 10, left: 10, right: 10, zIndex: 960, background: "#fff", border: "1.5px solid #93c5fd", borderRadius: 12, padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", maxWidth: 420, marginLeft: "auto", marginRight: "auto" },
  avisoCajaCercana: { pointerEvents: "auto", width: "100%", background: "rgba(15,23,42,0.9)", color: "#e2e8f0", fontSize: 11.5, fontWeight: 600, borderRadius: 10, padding: "7px 10px", maxWidth: 420, boxShadow: "0 4px 14px rgba(0,0,0,0.25)" },
  btnAmpliarRadio: { pointerEvents: "auto", width: "100%", background: "#fff", color: "#0f172a", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "6px 12px", maxWidth: 320, border: "1px solid #cbd5e1", boxShadow: "0 4px 14px rgba(0,0,0,0.2)", cursor: "pointer" },
  btnCerrarChico: { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#64748b", fontWeight: 700 },
  avisoLeadHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  avisoLeadNombre: { fontSize: 13, fontWeight: 800, color: "#14532d" },
  avisoLeadTelefono: { fontSize: 11, color: "#64748b" },
};
