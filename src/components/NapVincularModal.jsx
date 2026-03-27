import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { supabase } from "../supabaseClient";

const NODOS = ["Todos", "Nod_01", "Nod_02", "Nod_03", "Nod_04", "Nod_05", "Nod_06"];
const ZOOM_CLIENTES = 14;

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseCoordsStr(ubicacion) {
  if (!ubicacion) return null;
  const m = String(ubicacion).match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pct(ocu, cap) { return cap ? Math.round(((ocu || 0) / cap) * 100) : 0; }
function pctColor(p) { return p >= 90 ? "#ef4444" : p >= 70 ? "#f97316" : "#22c55e"; }
function eqCaja(a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); }
// Busca caja por codigo priorizando coincidencia de nodo (evita tomar la caja duplicada equivocada)
function findCaja(cajas, codigo, nodoCliente) {
  if (!codigo) return null;
  const matches = cajas.filter(c => eqCaja(c.codigo, codigo));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // Hay duplicados: preferir la del mismo nodo que el cliente
  return matches.find(c => c.nodo === nodoCliente) || matches[0];
}

// ── Iconos SVG ────────────────────────────────────────────────────────────────
function napCajaIcon(caja, selected) {
  const p = pct(caja.puertos_ocupados, caja.capacidad);
  const col = pctColor(p);
  const uid = String(caja.codigo || caja.id).replace(/[^a-z0-9]/gi, "");
  const sw = selected ? 30 : 22, sh = selected ? 42 : 32;
  return L.divIcon({
    className: "",
    iconSize: [sw, sh],
    iconAnchor: [sw / 2, sh],
    html: `<svg width="${sw}" height="${sh}" viewBox="0 0 22 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="s${uid}${selected?'a':'b'}" x="-30%" y="-20%" width="160%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="${selected ? 3 : 1.5}" flood-color="rgba(0,0,0,${selected ? 0.45 : 0.3})"/>
    </filter>
  </defs>
  <path d="M9 27 L11 31.5 L13 27Z" fill="${selected ? col : '#94a3b8'}"/>
  <rect x="1" y="1" width="20" height="26" rx="3" fill="${selected ? '#fff7ed' : '#f8fafc'}" filter="url(#s${uid}${selected?'a':'b'})"/>
  <rect x="0" y="6" width="2" height="4" rx="1" fill="${selected ? col : '#94a3b8'}"/>
  <rect x="0" y="15" width="2" height="4" rx="1" fill="${selected ? col : '#94a3b8'}"/>
  <rect x="20" y="6" width="2" height="4" rx="1" fill="${selected ? col : '#94a3b8'}"/>
  <rect x="20" y="15" width="2" height="4" rx="1" fill="${selected ? col : '#94a3b8'}"/>
  <rect x="3.5" y="4.5" width="15" height="1.5" rx="0.75" fill="${selected ? col+'66' : '#cbd5e1'}"/>
  <rect x="3.5" y="7.5" width="15" height="1.5" rx="0.75" fill="${selected ? col+'66' : '#cbd5e1'}"/>
  <rect x="3.5" y="10.5" width="15" height="1.5" rx="0.75" fill="${selected ? col+'66' : '#cbd5e1'}"/>
  <rect x="3.5" y="13.5" width="15" height="1.5" rx="0.75" fill="${selected ? col+'66' : '#cbd5e1'}"/>
  <rect x="3.5" y="16.5" width="15" height="1.5" rx="0.75" fill="${selected ? col+'66' : '#cbd5e1'}"/>
  <circle cx="4"   cy="22.5" r="1.3" fill="${col}"/>
  <circle cx="7.2" cy="22.5" r="1.3" fill="${col}"/>
  <circle cx="10.4" cy="22.5" r="1.3" fill="${col}"/>
  <circle cx="13.6" cy="22.5" r="1.3" fill="${p >= 50 ? col : '#cbd5e1'}"/>
  <circle cx="16.8" cy="22.5" r="1.3" fill="${p >= 75 ? col : '#cbd5e1'}"/>
  <circle cx="20"  cy="22.5" r="1.3" fill="${p >= 90 ? col : '#cbd5e1'}"/>
  <rect x="1" y="1" width="20" height="26" rx="3" fill="none"
    stroke="${selected ? col : '#94a3b8'}" stroke-width="${selected ? 2 : 0.8}"/>
</svg>`,
  });
}

function clienteIcon(sinCaja, selected) {
  const bg = selected ? "#f97316" : sinCaja ? "#ef4444" : "#3b82f6";
  const border = selected ? "#fff7ed" : "#ffffff";
  const size = selected ? 16 : 10;
  const shadow = selected ? "0 0 0 3px rgba(249,115,22,0.35), 0 2px 6px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.25)";
  return L.divIcon({
    className: "",
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${border};box-shadow:${shadow};transition:all .15s;"></div>`,
  });
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function NapVincularModal({ cajas, onClose, onUpdate }) {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroNodo, setFiltroNodo] = useState("Todos");
  const [filtroNodoClientes, setFiltroNodoClientes] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [soloSinCaja, setSoloSinCaja] = useState(true);
  const [cajaSeleccionada, setCajaSeleccionada] = useState(null);
  const [clientesSeleccionados, setClientesSeleccionados] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [zoomActual, setZoomActual] = useState(13);
  const [verClientesCaja, setVerClientesCaja] = useState(false);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const cajaMarkersRef = useRef({});
  const clienteMarkersRef = useRef({});
  const polylineMarkersRef = useRef({});   // clienteId → polyline
  const clienteLayerRef = useRef(null);
  // Refs para acceso en efectos sin stale closure
  const clientesSeleccionadosRef = useRef(clientesSeleccionados);
  const cajaSeleccionadaRef = useRef(cajaSeleccionada);
  useEffect(() => { clientesSeleccionadosRef.current = clientesSeleccionados; }, [clientesSeleccionados]);
  useEffect(() => { cajaSeleccionadaRef.current = cajaSeleccionada; }, [cajaSeleccionada]);
  const seleccionDesdeMapaRef = useRef(false);
  const prevFiltroNodoRef = useRef(filtroNodo);
  const prevCajaIdRef = useRef(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Cargar clientes ─────────────────────────────────────────────────────────
  const loadClientes = useCallback(async () => {
    setLoading(true);
    try {
      // Paginación automática: Supabase limita 1000 por request
      const PAGE = 1000;
      let all = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("clientes")
          .select("id,dni,nombre,direccion,celular,nodo,caja_nap,puerto_nap,ubicacion")
          .order("nombre")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      setClientes(all);
    } catch (e) {
      showToast(e?.message || "Error cargando clientes", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClientes(); }, [loadClientes]);

  // ── CSS tooltip ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "nap-tooltip-style";
    style.textContent = `.nap-tooltip { background:#fff !important; border:1px solid #e2e8f0 !important; border-radius:8px !important; box-shadow:0 4px 16px rgba(0,0,0,0.15) !important; padding:6px 10px !important; } .nap-tooltip::before { display:none !important; }`;
    if (!document.getElementById("nap-tooltip-style")) document.head.appendChild(style);
    return () => document.getElementById("nap-tooltip-style")?.remove();
  }, []);

  // ── Inicializar mapa (una sola vez) ────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([-6.77, -79.84], 13);

    // Centrar en ubicación actual si el navegador lo permite
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 14)); },
        () => {} // Si deniega el permiso, queda en las coords por defecto
      );
    }

    // Tile profesional: CartoDB Positron (limpio, moderno, sin ruido visual)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    L.control.attribution({ prefix: false })
      .addAttribution('© <a href="https://carto.com">CARTO</a> · © OpenStreetMap')
      .addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    const clienteLayer = L.layerGroup().addTo(map);
    clienteLayerRef.current = clienteLayer;

    map.on("zoomend", () => {
      const z = map.getZoom();
      setZoomActual(z);
      if (z >= ZOOM_CLIENTES) {
        map.addLayer(clienteLayer);
      } else {
        map.removeLayer(clienteLayer);
      }
    });

    mapInstanceRef.current = map;
    return () => {
      map.remove();
      mapInstanceRef.current = null;
      clienteLayerRef.current = null;
    };
  }, []);

  // ── Marcadores de cajas (solo recrea al cambiar cajas o nodo) ──────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    Object.values(cajaMarkersRef.current).forEach(m => m.remove());
    cajaMarkersRef.current = {};

    const lista = filtroNodo === "Todos" ? cajas : cajas.filter(c => c.nodo === filtroNodo);

    lista.forEach(caja => {
      if (!caja.lat || !caja.lng) return;
      const sel = cajaSeleccionadaRef.current?.id === caja.id;
      const p = pct(caja.puertos_ocupados, caja.capacidad);
      const libres = (caja.capacidad || 8) - (caja.puertos_ocupados || 0);

      const marker = L.marker([Number(caja.lat), Number(caja.lng)], {
        icon: napCajaIcon(caja, sel),
        zIndexOffset: sel ? 1000 : 500,
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family:Inter,system-ui,sans-serif;min-width:180px;line-height:1.4">
          <div style="font-size:15px;font-weight:800;color:#163f86;margin-bottom:2px">${caja.codigo}</div>
          ${caja.sector ? `<div style="font-size:11px;color:#64748b;margin-bottom:6px">${caja.sector} · ${caja.nodo}</div>` : `<div style="font-size:11px;color:#64748b;margin-bottom:6px">${caja.nodo}</div>`}
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden">
              <div style="width:${p}%;height:100%;background:${pctColor(p)};border-radius:3px;transition:width .3s"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${pctColor(p)}">${p}%</span>
          </div>
          <div style="font-size:11px;color:#374151">${caja.puertos_ocupados || 0}/${caja.capacidad || 8} puertos · <b>${libres} libre${libres !== 1 ? 's' : ''}</b></div>
          <button onclick="window._napSelCaja('${caja.id}')"
            style="margin-top:10px;width:100%;padding:6px;font-size:12px;font-weight:700;
            background:#163f86;color:#fff;border:none;border-radius:7px;cursor:pointer;">
            Seleccionar esta caja
          </button>
        </div>
      `, { maxWidth: 220 });

      marker.on("click", () => {
        seleccionDesdeMapaRef.current = true;
        const prev = cajaSeleccionadaRef.current;
        const next = prev?.id === caja.id ? null : caja;
        setCajaSeleccionada(next);
        setClientesSeleccionados(new Set());
      });

      cajaMarkersRef.current[caja.id] = marker;
    });

    // Auto-zoom al nodo SOLO cuando el filtro de nodo cambia (no cuando cajas se actualiza)
    const nodoChanged = prevFiltroNodoRef.current !== filtroNodo;
    prevFiltroNodoRef.current = filtroNodo;
    if (nodoChanged && filtroNodo !== "Todos") {
      const pts = lista.filter(c => c.lat && c.lng).map(c => [Number(c.lat), Number(c.lng)]);
      if (pts.length) {
        const bounds = L.latLngBounds(pts);
        // panTo al centro sin cambiar zoom (nunca alejarse)
        if (bounds.isValid()) map.panTo(bounds.getCenter(), { animate: true, duration: 0.5 });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajas, filtroNodo]);

  // ── Actualizar icono de caja seleccionada (sin recrear todo) ──────────────
  useEffect(() => {
    Object.entries(cajaMarkersRef.current).forEach(([id, marker]) => {
      const caja = cajas.find(c => String(c.id) === String(id));
      if (!caja) return;
      const sel = cajaSeleccionada?.id === caja.id;
      marker.setIcon(napCajaIcon(caja, sel));
      marker.setZIndexOffset(sel ? 1000 : 500);
    });
  }, [cajaSeleccionada, cajas]);

  // ── Marcadores de clientes (solo recrea al cambiar data o nodo) ───────────
  useEffect(() => {
    const layer = clienteLayerRef.current;
    if (!layer || loading) return;

    // Guardar selección actual en ref para no depender del estado
    const selActual = clientesSeleccionadosRef.current;

    // Usar layer.removeLayer (funciona aunque el layer no esté en el mapa por zoom)
    Object.values(clienteMarkersRef.current).forEach(m => layer.removeLayer(m));
    clienteMarkersRef.current = {};

    const lista = filtroNodoClientes === "Todos" ? clientes : clientes.filter(c => c.nodo === filtroNodoClientes);

    lista.forEach(cli => {
      const coords = parseCoordsStr(cli.ubicacion);
      if (!coords) return;
      const sinCaja = !cli.caja_nap;
      const sel = selActual.has(cli.id);

      const marker = L.marker([coords.lat, coords.lng], {
        icon: clienteIcon(sinCaja, sel),
        zIndexOffset: sel ? 900 : sinCaja ? 200 : 100,
      }).addTo(layer);

      marker.bindTooltip(`
        <div style="font-family:Inter,system-ui,sans-serif;padding:2px 2px;line-height:1.4">
          <div style="font-size:12px;font-weight:800;color:#0f172a">${cli.nombre || "-"}</div>
          <div style="font-size:10px;color:#64748b;margin-top:1px">${cli.nodo || ""}${cli.caja_nap ? ` · <span style="color:#1d4ed8;font-weight:700">${cli.caja_nap}</span>` : ' · <span style="color:#dc2626;font-weight:700">Sin caja</span>'}</div>
        </div>
      `, { direction: "top", offset: [0, -8], opacity: 0.97, className: "nap-tooltip" });

      marker.on("click", () => {
        setClientesSeleccionados(prev => {
          const next = new Set(prev);
          next.has(cli.id) ? next.delete(cli.id) : next.add(cli.id);
          return next;
        });
      });

      clienteMarkersRef.current[cli.id] = marker;
    });

    window._napSelCaja = (id) => {
      seleccionDesdeMapaRef.current = true;
      const found = cajas.find(c => String(c.id) === String(id));
      setCajaSeleccionada(prev => prev?.id === found?.id ? null : (found || null));
      setClientesSeleccionados(new Set());
    };

    return () => { delete window._napSelCaja; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, filtroNodoClientes, loading]);

  // ── Polylines cliente → caja (recrea al cambiar clientes o filtro) ──────────
  useEffect(() => {
    const layer = clienteLayerRef.current;
    if (!layer || loading) return;

    // Usar layer.removeLayer (funciona aunque el layer no esté en el mapa por zoom)
    Object.values(polylineMarkersRef.current).forEach(p => layer.removeLayer(p));
    polylineMarkersRef.current = {};

    const lista = filtroNodoClientes === "Todos" ? clientes : clientes.filter(c => c.nodo === filtroNodoClientes);

    lista.forEach(cli => {
      if (!cli.caja_nap) return;
      const cliCoords = parseCoordsStr(cli.ubicacion);
      if (!cliCoords) return;
      const caja = findCaja(cajas, cli.caja_nap, cli.nodo);
      if (!caja?.lat || !caja?.lng) return;

      const line = L.polyline(
        [[cliCoords.lat, cliCoords.lng], [Number(caja.lat), Number(caja.lng)]],
        { color: "#3b82f6", weight: 1.4, opacity: 0.35, dashArray: "5,7" }
      ).addTo(layer);

      polylineMarkersRef.current[cli.id] = line;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, filtroNodoClientes, loading]);

  // ── Actualizar iconos de clientes seleccionados (sin recrear markers) ─────
  useEffect(() => {
    Object.entries(clienteMarkersRef.current).forEach(([id, marker]) => {
      const cli = clientes.find(c => String(c.id) === String(id));
      if (!cli) return;
      const sel = clientesSeleccionados.has(cli.id);
      const sinCaja = !cli.caja_nap;
      marker.setIcon(clienteIcon(sinCaja, sel));
      marker.setZIndexOffset(sel ? 900 : sinCaja ? 200 : 100);
    });
  }, [clientesSeleccionados, clientes]);

  // ── Zoom a caja seleccionada (solo desde panel lateral, no desde mapa) ───────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!cajaSeleccionada?.lat || !map) return;
    // Si solo cambiaron datos (puertos_ocupados) pero no la caja en sí, no volar
    const idCambio = prevCajaIdRef.current !== cajaSeleccionada.id;
    prevCajaIdRef.current = cajaSeleccionada.id;
    if (!idCambio) return;
    if (seleccionDesdeMapaRef.current) {
      // Vino del mapa: solo abrir popup, sin mover la vista
      seleccionDesdeMapaRef.current = false;
      setTimeout(() => cajaMarkersRef.current[cajaSeleccionada.id]?.openPopup(), 100);
      return;
    }
    // Vino del panel: volar a la caja — nunca bajar del zoom actual
    const targetZoom = Math.max(map.getZoom(), 16);
    map.flyTo([Number(cajaSeleccionada.lat), Number(cajaSeleccionada.lng)], targetZoom, { duration: 0.6 });
    setTimeout(() => cajaMarkersRef.current[cajaSeleccionada.id]?.openPopup(), 700);
  }, [cajaSeleccionada]);

  // ── Auto-sync puertos_ocupados al seleccionar caja ──────────────────────────
  useEffect(() => {
    if (!cajaSeleccionada || loading || clientes.length === 0) return;
    const realCount = clientes.filter(c => eqCaja(c.caja_nap, cajaSeleccionada.codigo)).length;
    if (realCount === (cajaSeleccionada.puertos_ocupados ?? -1)) return;
    // Actualizar local inmediatamente
    setCajaSeleccionada(prev => prev ? { ...prev, puertos_ocupados: realCount } : prev);
    // Actualizar BD y refrescar cajas del padre (actualiza popup + dropdown + icono)
    supabase.from("nap_cajas")
      .update({ puertos_ocupados: realCount })
      .eq("id", cajaSeleccionada.id)
      .then(() => { if (onUpdate) onUpdate(); });
  }, [cajaSeleccionada?.id, clientes, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtrado lista ──────────────────────────────────────────────────────────
  const clientesFiltrados = clientes.filter(c => {
    if (soloSinCaja && c.caja_nap) return false;
    if (filtroNodoClientes !== "Todos" && c.nodo !== filtroNodoClientes) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      if (
        !String(c.nombre || "").toLowerCase().includes(q) &&
        !String(c.dni || "").toLowerCase().includes(q) &&
        !String(c.direccion || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const clientesOrdenados = cajaSeleccionada?.lat
    ? [...clientesFiltrados].sort((a, b) => {
        const ca = parseCoordsStr(a.ubicacion), cb = parseCoordsStr(b.ubicacion);
        const da = ca ? haversineKm(cajaSeleccionada.lat, cajaSeleccionada.lng, ca.lat, ca.lng) : 999;
        const db = cb ? haversineKm(cajaSeleccionada.lat, cajaSeleccionada.lng, cb.lat, cb.lng) : 999;
        return da - db;
      })
    : clientesFiltrados;

  const sinCajaTotal = clientes.filter(c => !c.caja_nap).length;

  // ── Asignar ─────────────────────────────────────────────────────────────────
  const asignar = async () => {
    if (!cajaSeleccionada) return showToast("Selecciona una caja primero", false);
    if (clientesSeleccionados.size === 0) return showToast("Selecciona al menos un cliente", false);
    setSaving(true);
    try {
      const ids = Array.from(clientesSeleccionados);
      const { error } = await supabase.from("clientes").update({ caja_nap: cajaSeleccionada.codigo }).in("id", ids);
      if (error) throw error;
      const clientesActualizados = clientes.map(c => ids.includes(c.id) ? { ...c, caja_nap: cajaSeleccionada.codigo } : c);
      setClientes(clientesActualizados);
      setClientesSeleccionados(new Set());
      // Actualizar iconos y polylines en el mapa de forma inmediata
      const layer = clienteLayerRef.current;
      ids.forEach(id => {
        const m = clienteMarkersRef.current[id];
        if (m) m.setIcon(clienteIcon(false, false));
        // Crear polyline hacia la caja si hay coords
        if (layer) {
          const cli = clientes.find(c => c.id === id);
          const cliCoords = parseCoordsStr(cli?.ubicacion);
          if (cliCoords && cajaSeleccionada.lat && cajaSeleccionada.lng) {
            polylineMarkersRef.current[id]?.remove();
            const line = L.polyline(
              [[cliCoords.lat, cliCoords.lng], [Number(cajaSeleccionada.lat), Number(cajaSeleccionada.lng)]],
              { color: "#3b82f6", weight: 1.4, opacity: 0.35, dashArray: "5,7" }
            ).addTo(layer);
            polylineMarkersRef.current[id] = line;
          }
        }
      });
      // Sincronizar puertos_ocupados con conteo real
      const realCount = clientesActualizados.filter(c => eqCaja(c.caja_nap, cajaSeleccionada.codigo)).length;
      await supabase.from("nap_cajas").update({ puertos_ocupados: realCount }).eq("id", cajaSeleccionada.id);
      showToast(`${ids.length} cliente${ids.length > 1 ? "s" : ""} asignado${ids.length > 1 ? "s" : ""} a ${cajaSeleccionada.codigo}`);
      if (onUpdate) onUpdate();
    } catch (e) {
      showToast(e?.message || "Error al asignar", false);
    } finally { setSaving(false); }
  };

  const quitarCaja = async () => {
    if (clientesSeleccionados.size === 0) return showToast("Selecciona clientes para desvincular", false);
    if (!window.confirm(`¿Quitar caja NAP a ${clientesSeleccionados.size} cliente(s)?`)) return;
    setSaving(true);
    try {
      const ids = Array.from(clientesSeleccionados);
      // Recolectar cajas afectadas antes de limpiar
      const cajasAfectadas = [...new Set(
        clientes.filter(c => ids.includes(c.id) && c.caja_nap).map(c => c.caja_nap)
      )];
      const { error } = await supabase.from("clientes").update({ caja_nap: null }).in("id", ids);
      if (error) throw error;
      const clientesActualizados = clientes.map(c => ids.includes(c.id) ? { ...c, caja_nap: null } : c);
      setClientes(clientesActualizados);
      setClientesSeleccionados(new Set());
      // Actualizar iconos y eliminar polylines de forma inmediata
      const layer = clienteLayerRef.current;
      ids.forEach(id => {
        const m = clienteMarkersRef.current[id];
        if (m) m.setIcon(clienteIcon(true, false));
        const line = polylineMarkersRef.current[id];
        if (line) {
          if (layer) layer.removeLayer(line); else line.remove();
          delete polylineMarkersRef.current[id];
        }
      });
      // Sincronizar puertos_ocupados para cada caja afectada (actualizar TODAS con ese código, por si hay duplicados)
      for (const codigo of cajasAfectadas) {
        const cajasMatch = cajas.filter(c => eqCaja(c.codigo, codigo));
        for (const cajaObj of cajasMatch) {
          const realCount = clientesActualizados.filter(c => eqCaja(c.caja_nap, codigo) && c.nodo === cajaObj.nodo).length;
          await supabase.from("nap_cajas").update({ puertos_ocupados: realCount }).eq("id", cajaObj.id);
        }
      }
      showToast(`${ids.length} cliente(s) desvinculados`);
      if (onUpdate) onUpdate();
    } catch (e) {
      showToast(e?.message || "Error al desvincular", false);
    } finally { setSaving(false); }
  };

  const toggleCliente = (id) =>
    setClientesSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const quitarClienteIndividual = async (cli) => {
    if (!window.confirm(`¿Desvincular a ${cli.nombre} de ${cli.caja_nap}?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("clientes").update({ caja_nap: null }).eq("id", cli.id);
      if (error) throw error;
      const cajaCodigo = cli.caja_nap;
      const clientesActualizados = clientes.map(c => c.id === cli.id ? { ...c, caja_nap: null } : c);
      setClientes(clientesActualizados);
      // Actualizar marcador e icono en mapa
      const m = clienteMarkersRef.current[cli.id];
      if (m) m.setIcon(clienteIcon(true, false));
      const layer = clienteLayerRef.current;
      const line = polylineMarkersRef.current[cli.id];
      if (line) { if (layer) layer.removeLayer(line); else line.remove(); delete polylineMarkersRef.current[cli.id]; }
      // Sincronizar puertos_ocupados
      const realCount = clientesActualizados.filter(c => eqCaja(c.caja_nap, cajaCodigo)).length;
      const cajaObj = findCaja(cajas, cajaCodigo, cli.nodo);
      if (cajaObj) {
        await supabase.from("nap_cajas").update({ puertos_ocupados: realCount }).eq("id", cajaObj.id);
      }
      // Actualizar cajaSeleccionada local para que el contador baje al instante
      setCajaSeleccionada(prev => prev ? { ...prev, puertos_ocupados: realCount } : prev);
      showToast(`${cli.nombre} desvinculado`);
      if (onUpdate) onUpdate();
    } catch (e) {
      showToast(e?.message || "Error al desvincular", false);
    } finally { setSaving(false); }
  };

  const flyToCliente = (cli) => {
    const coords = parseCoordsStr(cli.ubicacion);
    if (!coords || !mapInstanceRef.current) return;
    const zm = Math.max(mapInstanceRef.current.getZoom(), 17);
    mapInstanceRef.current.flyTo([coords.lat, coords.lng], zm, { duration: 0.5 });
    setTimeout(() => clienteMarkersRef.current[cli.id]?.openPopup(), 600);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.overlay}>
      {toast && <div style={{ ...s.toast, background: toast.ok ? "#16a34a" : "#dc2626" }}>{toast.msg}</div>}

      <div style={s.modal}>
        {/* ── Header ── */}
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", flex: 1 }}>
            <div>
              <div style={s.headerTitle}>Vincular Clientes · Cajas NAP</div>
              <div style={s.headerSub}>
                <span style={{ color: "#ef4444", fontWeight: 700 }}>{sinCajaTotal} sin caja</span>
                <span style={{ color: "#94a3b8" }}> de {clientes.length} clientes · {cajas.length} cajas</span>
              </div>
            </div>

            {/* Tabs nodo */}
            <div style={s.nodosWrap}>
              {NODOS.map(n => {
                const sinCajaNodo = n === "Todos" ? sinCajaTotal : clientes.filter(c => !c.caja_nap && c.nodo === n).length;
                const active = filtroNodo === n;
                return (
                  <button
                    key={n}
                    onClick={() => { setFiltroNodo(n); setCajaSeleccionada(null); setClientesSeleccionados(new Set()); }}
                    style={{ ...s.nodoTab, ...(active ? s.nodoTabActive : {}) }}
                  >
                    {n === "Todos" ? "Todos" : n.replace("Nod_", "N")}
                    {sinCajaNodo > 0 && (
                      <span style={{ ...s.nodoBadge, background: active ? "rgba(255,255,255,0.25)" : "#fee2e2", color: active ? "#fff" : "#dc2626" }}>
                        {sinCajaNodo}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <div style={s.leyenda}>
              <span style={{ ...s.dot, background: "#ef4444" }} /> Sin caja
              <span style={{ ...s.dot, background: "#3b82f6", marginLeft: 8 }} /> Con caja
              <span style={{ ...s.dot, background: "#f97316", marginLeft: 8 }} /> Selec.
            </div>
            <button onClick={onClose} style={s.btnClose}>✕</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={s.body}>
          {/* Panel izquierdo */}
          <div style={s.sidebar}>

            {/* Caja activa */}
            {cajaSeleccionada ? (() => {
              const clientesDeCaja = clientes.filter(c => eqCaja(c.caja_nap, cajaSeleccionada.codigo));
              return (
              <div style={s.cajaBadge}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#f97316" }}>📦 {cajaSeleccionada.codigo}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{cajaSeleccionada.sector || ""} {cajaSeleccionada.nodo}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: pctColor(pct(cajaSeleccionada.puertos_ocupados, cajaSeleccionada.capacidad)) }}>
                        {cajaSeleccionada.puertos_ocupados || 0}/{cajaSeleccionada.capacidad || 8}
                      </div>
                      <div style={{ fontSize: 9, color: "#9ca3af" }}>puertos</div>
                    </div>
                    {/* Botón ver clientes conectados */}
                    <button
                      onClick={() => setVerClientesCaja(v => !v)}
                      title="Ver clientes conectados"
                      style={{
                        padding: "3px 7px", border: "1px solid #fed7aa", borderRadius: 6,
                        background: verClientesCaja ? "#f97316" : "#fff7ed",
                        color: verClientesCaja ? "#fff" : "#f97316",
                        fontSize: 10, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      👥 {clientesDeCaja.length}
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 6, height: 4, background: "#fed7aa", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pct(cajaSeleccionada.puertos_ocupados, cajaSeleccionada.capacidad)}%`, height: "100%", background: pctColor(pct(cajaSeleccionada.puertos_ocupados, cajaSeleccionada.capacidad)), borderRadius: 2 }} />
                </div>

                {/* Lista clientes conectados */}
                {verClientesCaja && (
                  <div style={{ marginTop: 8, maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                    {clientesDeCaja.length === 0 ? (
                      <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", padding: "6px 0" }}>Sin clientes conectados</div>
                    ) : clientesDeCaja.map(cli => (
                      <div key={cli.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", background: "#fff", borderRadius: 6, border: "1px solid #fed7aa" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cli.nombre || "-"}</div>
                          <div style={{ fontSize: 9, color: "#94a3b8" }}>{cli.dni || ""}{cli.nodo ? ` · ${cli.nodo}` : ""}</div>
                        </div>
                        <button
                          onClick={() => quitarClienteIndividual(cli)}
                          disabled={saving}
                          title="Desvincular"
                          style={{ padding: "2px 6px", border: "1px solid #fecaca", borderRadius: 5, background: "#fef2f2", color: "#dc2626", fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => { setCajaSeleccionada(null); setClientesSeleccionados(new Set()); setVerClientesCaja(false); }} style={s.btnCambiar}>
                  Cambiar caja
                </button>
              </div>
              );
            })() : (
              <div style={s.cajaTip}>
                Haz clic en una caja del mapa<br />o selecciónala en el desplegable
              </div>
            )}

            <select
              value={cajaSeleccionada?.id || ""}
              onChange={e => {
                const found = cajas.find(c => String(c.id) === e.target.value);
                setCajaSeleccionada(found || null);
                setClientesSeleccionados(new Set());
              }}
              style={s.select}
            >
              <option value="">— Seleccionar caja —</option>
              {(filtroNodo === "Todos" ? cajas : cajas.filter(c => c.nodo === filtroNodo)).map(c => (
                <option key={c.id} value={c.id}>
                  {c.codigo}{c.sector ? ` · ${c.sector}` : ""} ({c.puertos_ocupados || 0}/{c.capacidad || 8})
                </option>
              ))}
            </select>

            <div style={s.divider} />

            {/* Filtro clientes por nodo */}
            <div style={{ marginBottom: 7 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                Clientes · Nodo
              </div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {NODOS.map(n => {
                  const active = filtroNodoClientes === n;
                  const count = n === "Todos"
                    ? clientes.length
                    : clientes.filter(c => c.nodo === n).length;
                  if (count === 0 && n !== "Todos") return null;
                  return (
                    <button
                      key={n}
                      onClick={() => { setFiltroNodoClientes(n); setClientesSeleccionados(new Set()); }}
                      style={{
                        padding: "3px 7px", border: "none", borderRadius: 6,
                        fontSize: 10, cursor: "pointer", fontWeight: 600,
                        background: active ? "#0f172a" : "#f1f5f9",
                        color: active ? "#fff" : "#475569",
                      }}
                    >
                      {n === "Todos" ? "Todos" : n.replace("Nod_", "N")}
                      <span style={{ marginLeft: 3, opacity: 0.7 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtros */}
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  placeholder="Buscar nombre, DNI..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  style={s.searchInput}
                />
                {busqueda && (
                  <button onClick={() => setBusqueda("")} style={s.clearSearch}>✕</button>
                )}
              </div>
              <button
                onClick={() => setSoloSinCaja(p => !p)}
                style={{
                  ...s.btnToggle,
                  background: soloSinCaja ? "#fef2f2" : "#f8fafc",
                  borderColor: soloSinCaja ? "#fca5a5" : "#e2e8f0",
                  color: soloSinCaja ? "#dc2626" : "#64748b",
                }}
              >
                {soloSinCaja ? "Sin caja" : "Todos"}
              </button>
            </div>

            {/* Chips stats */}
            <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={s.chip}>{clientesOrdenados.length} en lista</span>
              {clientesSeleccionados.size > 0 && (
                <span style={{ ...s.chip, background: "#fff7ed", color: "#f97316", borderColor: "#fed7aa" }}>
                  ✓ {clientesSeleccionados.size} sel.
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <button onClick={() => setClientesSeleccionados(new Set(clientesOrdenados.map(c => c.id)))} style={s.btnSm}>
                Todos ({clientesOrdenados.length})
              </button>
              {clientesSeleccionados.size > 0 && (
                <button onClick={() => setClientesSeleccionados(new Set())} style={{ ...s.btnSm, color: "#94a3b8" }}>
                  Limpiar
                </button>
              )}
            </div>

            {/* Lista clientes */}
            <div style={s.listaWrap}>
              {loading ? (
                <div style={s.emptyMsg}>Cargando clientes…</div>
              ) : clientesOrdenados.length === 0 ? (
                <div style={{ ...s.emptyMsg, color: "#22c55e" }}>✓ Todos los clientes tienen caja</div>
              ) : clientesOrdenados.map(cli => {
                const sel = clientesSeleccionados.has(cli.id);
                const sinCaja = !cli.caja_nap;
                const coords = parseCoordsStr(cli.ubicacion);
                const dist = cajaSeleccionada?.lat && coords
                  ? haversineKm(cajaSeleccionada.lat, cajaSeleccionada.lng, coords.lat, coords.lng)
                  : null;
                return (
                  <div
                    key={cli.id}
                    onClick={() => toggleCliente(cli.id)}
                    style={{ ...s.clienteRow, background: sel ? "#fff7ed" : "#fff", borderColor: sel ? "#f97316" : "#f1f5f9" }}
                  >
                    <div style={{ ...s.clienteDot, background: sel ? "#f97316" : sinCaja ? "#ef4444" : "#3b82f6" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.clienteNombre}>{cli.nombre || "-"}</div>
                      <div style={s.clienteMeta}>
                        {cli.dni || ""}
                        {cli.nodo ? ` · ${cli.nodo}` : ""}
                        {cli.caja_nap ? ` · ${cli.caja_nap}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      {dist !== null && (
                        <span style={{ fontSize: 10, color: "#94a3b8" }}>
                          {dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
                        </span>
                      )}
                      {coords && (
                        <button
                          onClick={e => { e.stopPropagation(); flyToCliente(cli); }}
                          style={s.btnFly}
                          title="Ver en mapa"
                        >🗺</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Acciones */}
            <div style={s.footer}>
              <button
                onClick={asignar}
                disabled={saving || !cajaSeleccionada || clientesSeleccionados.size === 0}
                style={{ ...s.btnAsignar, opacity: (!cajaSeleccionada || clientesSeleccionados.size === 0) ? 0.4 : 1 }}
              >
                {saving ? "Guardando…" : `Asignar a ${cajaSeleccionada?.codigo || "caja"}`}
              </button>
              {clientesSeleccionados.size > 0 && (
                <button onClick={quitarCaja} disabled={saving} style={s.btnQuitar}>
                  Quitar caja NAP
                </button>
              )}
            </div>
          </div>

          {/* Mapa */}
          <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

            {/* Filtro de clientes flotante sobre el mapa */}
            <div style={s.mapNodoFilter}>
              <div style={s.mapNodoFilterLabel}>Clientes en mapa</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {NODOS.map(n => {
                  const active = filtroNodoClientes === n;
                  const count = n === "Todos"
                    ? clientes.filter(c => parseCoordsStr(c.ubicacion)).length
                    : clientes.filter(c => c.nodo === n && parseCoordsStr(c.ubicacion)).length;
                  if (count === 0 && n !== "Todos") return null;
                  return (
                    <button
                      key={n}
                      onClick={() => { setFiltroNodoClientes(n); setClientesSeleccionados(new Set()); }}
                      style={{
                        padding: "4px 10px", border: "none", borderRadius: 7,
                        fontSize: 11, cursor: "pointer", fontWeight: 700,
                        background: active ? "#f97316" : "rgba(255,255,255,0.9)",
                        color: active ? "#fff" : "#374151",
                        boxShadow: active ? "0 2px 8px rgba(249,115,22,0.4)" : "0 1px 3px rgba(0,0,0,0.12)",
                        transition: "all .15s",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      {n === "Todos" ? "Todos" : n.replace("Nod_", "N")}
                      <span style={{ marginLeft: 4, opacity: active ? 0.85 : 0.55, fontSize: 10 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {zoomActual < ZOOM_CLIENTES && (
              <div style={s.zoomHint}>
                🔍 Acerca el mapa para ver los clientes
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 2000,
    background: "rgba(15,23,42,0.65)", backdropFilter: "blur(4px)",
    display: "flex", padding: 10,
  },
  modal: {
    flex: 1, display: "flex", flexDirection: "column",
    background: "#f8fafc", borderRadius: 18, overflow: "hidden",
    boxShadow: "0 24px 80px rgba(15,23,42,0.4)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  toast: {
    position: "fixed", top: 20, right: 20, padding: "12px 22px",
    borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 13,
    zIndex: 3000, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
  },

  // Header
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 16px", background: "#fff",
    borderBottom: "1px solid #e2e8f0", gap: 10, flexWrap: "wrap",
  },
  headerTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" },
  headerSub: { fontSize: 11, marginTop: 1 },
  nodosWrap: { display: "flex", gap: 3, flexWrap: "wrap" },
  nodoTab: {
    padding: "5px 10px", border: "none", borderRadius: 8,
    fontSize: 11, cursor: "pointer", fontWeight: 600,
    background: "#f1f5f9", color: "#475569",
    display: "flex", alignItems: "center", gap: 4,
    transition: "all .15s",
  },
  nodoTabActive: { background: "#1e3a8a", color: "#fff" },
  nodoBadge: {
    fontSize: 9, fontWeight: 800, padding: "1px 5px",
    borderRadius: 999, minWidth: 14, textAlign: "center",
  },
  leyenda: {
    display: "flex", alignItems: "center", gap: 4,
    fontSize: 11, color: "#475569", fontWeight: 600,
  },
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%" },
  btnClose: {
    width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
    background: "#f1f5f9", border: "1px solid #e2e8f0",
    borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#475569",
  },

  // Body
  body: { display: "flex", flex: 1, overflow: "hidden" },

  // Sidebar
  sidebar: {
    width: 298, flexShrink: 0, background: "#fff",
    borderRight: "1px solid #e2e8f0",
    display: "flex", flexDirection: "column", overflow: "hidden", padding: 10, gap: 0,
  },
  cajaBadge: {
    background: "linear-gradient(135deg,#fff7ed,#ffedd5)",
    border: "1.5px solid #fed7aa", borderRadius: 12, padding: "10px 12px", marginBottom: 8,
  },
  cajaTip: {
    background: "#f0f9ff", border: "1.5px solid #bae6fd",
    borderRadius: 12, padding: "10px 12px", marginBottom: 8,
    fontSize: 11, color: "#0369a1", lineHeight: 1.6, textAlign: "center",
  },
  btnCambiar: {
    marginTop: 8, fontSize: 10, padding: "3px 10px",
    background: "transparent", border: "1px solid #f97316",
    borderRadius: 6, cursor: "pointer", color: "#f97316", fontWeight: 700,
  },
  select: {
    width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0",
    borderRadius: 9, fontSize: 12, background: "#f8fafc", color: "#111827",
    outline: "none", cursor: "pointer", boxSizing: "border-box", marginBottom: 6,
  },
  divider: { height: 1, background: "#f1f5f9", margin: "4px 0 8px" },
  searchInput: {
    width: "100%", padding: "7px 28px 7px 10px", border: "1px solid #e2e8f0",
    borderRadius: 9, fontSize: 12, background: "#f8fafc", color: "#111827",
    outline: "none", boxSizing: "border-box",
  },
  clearSearch: {
    position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer",
    fontSize: 11, color: "#94a3b8", padding: 2,
  },
  btnToggle: {
    padding: "7px 9px", border: "1.5px solid", borderRadius: 9,
    fontSize: 10, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap",
  },
  chip: {
    fontSize: 10, fontWeight: 600, padding: "2px 8px",
    borderRadius: 999, background: "#f1f5f9", color: "#475569",
    border: "1px solid #e2e8f0",
  },
  btnSm: {
    padding: "4px 8px", background: "#eff6ff", border: "1px solid #bfdbfe",
    borderRadius: 7, cursor: "pointer", fontSize: 10, color: "#1d4ed8", fontWeight: 700,
  },
  listaWrap: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 },
  emptyMsg: { textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 12 },
  clienteRow: {
    display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
    borderRadius: 9, border: "1.5px solid", cursor: "pointer",
  },
  clienteDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  clienteNombre: {
    fontSize: 12, fontWeight: 700, color: "#0f172a",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  clienteMeta: { fontSize: 10, color: "#94a3b8", marginTop: 1 },
  btnFly: { fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 },

  // Footer sidebar
  footer: {
    paddingTop: 8, borderTop: "1px solid #f1f5f9", marginTop: 6,
    display: "flex", flexDirection: "column", gap: 5,
  },
  btnAsignar: {
    padding: "11px 0", background: "linear-gradient(135deg,#f97316,#ea580c)",
    border: "none", borderRadius: 10, color: "#fff", fontWeight: 800,
    fontSize: 13, cursor: "pointer", width: "100%",
    boxShadow: "0 4px 14px rgba(249,115,22,0.35)",
  },
  btnQuitar: {
    padding: "8px 0", background: "#fff", border: "1.5px solid #fecaca",
    borderRadius: 10, color: "#dc2626", fontWeight: 700,
    fontSize: 11, cursor: "pointer", width: "100%",
  },

  // Map overlay
  mapNodoFilter: {
    position: "absolute", top: 10, right: 10, zIndex: 1000,
    background: "rgba(15,23,42,0.75)", backdropFilter: "blur(10px)",
    borderRadius: 12, padding: "8px 12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.1)",
    display: "flex", flexDirection: "column", gap: 6,
    maxWidth: 260,
  },
  mapNodoFilterLabel: {
    fontSize: 9, fontWeight: 800, color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  zoomHint: {
    position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
    background: "rgba(15,23,42,0.8)", backdropFilter: "blur(8px)",
    color: "#fff", fontWeight: 600, fontSize: 12,
    padding: "8px 18px", borderRadius: 20, pointerEvents: "none",
    whiteSpace: "nowrap", zIndex: 1000, letterSpacing: "0.01em",
  },
};
