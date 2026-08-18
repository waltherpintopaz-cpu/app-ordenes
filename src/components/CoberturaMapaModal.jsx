import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cargarZonasCobertura } from "../utils/zonasCobertura";
import { buscarZonaCobertura } from "../utils/cobertura";

function parseCoordStr(str) {
  const [lat, lng] = String(str || "").split(",").map((x) => Number(String(x).trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// Modal de pantalla completa: dibuja las zonas de cobertura (polígonos reales,
// no un mini-mapa embebido) y marca si la ubicación del cliente cae dentro.
export default function CoberturaMapaModal({ coordenadas, coordsLista = [], buscando, onClose, onSeleccionarCoord, onReintentar }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const clienteMarkerRef = useRef(null);
  const zonasFitRef = useRef(null);
  const capaCallesRef = useRef(null);
  const capaSatRef = useRef(null);
  const [zona, setZona] = useState(undefined); // undefined=verificando, null=fuera, obj=dentro
  const [zonasCargando, setZonasCargando] = useState(true);
  const [capa, setCapa] = useState("calles"); // "calles" | "satelite"
  const [copiado, setCopiado] = useState(false);

  const punto = parseCoordStr(coordenadas);

  useEffect(() => {
    let cancelled = false;
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

    const color = zona === undefined ? "#94a3b8" : zona ? "#16a34a" : "#dc2626";
    const icon = L.divIcon({
      className: "",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.4);"></div>`,
    });
    clienteMarkerRef.current = L.marker([punto.lat, punto.lng], { icon, zIndexOffset: 1000 }).addTo(map);
    map.flyTo([punto.lat, punto.lng], 16, { duration: 0.6 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordenadas]);

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

          {/* Toggle capa calles/satelital */}
          <button
            onClick={() => setCapa((c) => (c === "satelite" ? "calles" : "satelite"))}
            style={s.btnCapa}
            title={capa === "satelite" ? "Cambiar a calles" : "Cambiar a satelital"}
          >
            {capa === "satelite" ? "🗺 Calles" : "🛰 Satelital"}
          </button>

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
};
