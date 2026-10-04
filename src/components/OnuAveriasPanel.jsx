import { useCallback, useEffect, useRef, useState } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { FichaOnuDrawer } from "./OnuInventarioPanel";

const HUAWEI_OLT_SNMP_API = String(import.meta.env.VITE_HUAWEI_OLT_SNMP_API || "https://huawei-olt-snmp.wolgest.com").trim().replace(/\/$/, "");
const DIAGNO_BASE = String(import.meta.env.VITE_DIAGNO_URL || "").trim().replace(/\/$/, "");
const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();

// Mismo patron ya usado en MapaPanel.jsx -- window.__gmapsPromise cachea la
// carga del SDK a nivel global, asi que no importa cual componente lo pida
// primero, nunca se inserta el script 2 veces.
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

// Se arma con lo que ya guarda huawei-olt-signal via traps SNMP reales
// (LOS/dying-gasp ocurre-recupera) -- ver onu_eventos / onu_averias_zona
// en Supabase. Polling simple cada 20s, sin websocket/realtime todavia.
const REFRESH_MS = 20000;

const TIPO_INFO = {
  los_down:   { label: "Sin señal (LOS)",  dot: "#ef4444", text: "#991b1b", bg: "#fee2e2" },
  los_up:     { label: "Recuperó señal",   dot: "#22c55e", text: "#15803d", bg: "#dcfce7" },
  power_down: { label: "Corte de luz",     dot: "#f59e0b", text: "#92400e", bg: "#fef3c7" },
  power_up:   { label: "Volvió la luz",    dot: "#22c55e", text: "#15803d", bg: "#dcfce7" },
};
const TIPO_DESCONOCIDO = { label: "Desconocido", dot: "#9ca3af", text: "#374151", bg: "#f3f4f6" };

const Ico = {
  alertTriangle: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  refresh: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" /></svg>,
  wifiOff: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>,
};

function formatoFecha(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "medium" }); } catch { return iso; }
}

export default function OnuAveriasPanel({ theme }) {
  const isDark = theme === "dark";
  const col = isDark
    ? { bg: "#111c33", card: "#1a2740", border: "#2c3c58", text: "#e6ecf7", sub: "#93a2bd" }
    : { bg: "#f4f6fb", card: "#ffffff", border: "#e2e8f4", text: "#1a2740", sub: "#5b6b8c" };

  const [averias, setAverias] = useState([]);
  const [vistaAverias, setVistaAverias] = useState("activas"); // "activas" | "historial"
  const [averiasHistorial, setAveriasHistorial] = useState([]);
  const [historialCargado, setHistorialCargado] = useState(false);
  // Reporte de una averia puntual (clientes afectados + link de WhatsApp) --
  // null = modal cerrado; "cargando" mientras pide al backend; objeto con
  // los datos una vez armado.
  const [reporteAveria, setReporteAveria] = useState(null);
  const [reporteError, setReporteError] = useState("");
  const [eventosTodos, setEventosTodos] = useState([]);
  // El "nombre" guardado en cada evento es una foto del momento en que
  // ocurrio el trap -- si despues se corrigio el nombre de esa ONU (ej.
  // via el cruce MAC-MikroTik), el evento viejo se queda con el nombre
  // de antes. Este mapa trae el nombre ACTUAL de la OLT por SN, para
  // mostrar siempre el mas reciente en la tabla.
  const [nombresActualesPorSn, setNombresActualesPorSn] = useState({});
  // Categoria, no tipo exacto -- "los" agrupa los_down+los_up, "luz" agrupa
  // power_down+power_up. Por defecto "los_sin_recuperar" (solo las que
  // siguen caidas ahora mismo, pedido explicito -- es lo mas urgente de
  // mirar al abrir el panel, mas que el historial completo de LOS).
  const [categoriaFiltro, setCategoriaFiltro] = useState("los_sin_recuperar");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  const [snFicha, setSnFicha] = useState(null);

  // Señal en vivo pedida a mano por evento (id de evento -> {rxPower,
  // rxPowerOlt} | "cargando") -- util cuando el evento se guardo sin
  // señal (ej. "Volvió la luz" justo antes de que el equipo termine de
  // re-sincronizar opticamente con la OLT) y se quiere ver el valor
  // actual sin abrir toda la ficha.
  const [senalEnVivoPorEvento, setSenalEnVivoPorEvento] = useState({});

  const refrescarSenal = useCallback(async (ev) => {
    if (!ev.sn) return;
    setSenalEnVivoPorEvento((m) => ({ ...m, [ev.id]: "cargando" }));
    try {
      const r = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-info?sn=${encodeURIComponent(ev.sn)}`).then((r) => r.json());
      if (!r.ok) throw new Error(r.error || "No se pudo consultar.");
      setSenalEnVivoPorEvento((m) => ({ ...m, [ev.id]: { rxPower: r.rxPower, rxPowerOlt: r.rxPowerOlt } }));
    } catch {
      setSenalEnVivoPorEvento((m) => ({ ...m, [ev.id]: "error" }));
    }
  }, []);

  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [config, setConfig] = useState(null);
  const [configEdit, setConfigEdit] = useState(null);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState(null);

  const cargarConfig = useCallback(async () => {
    try {
      const r = await fetch(`${HUAWEI_OLT_SNMP_API}/averia-config`).then((r) => r.json());
      if (r.ok && r.config) {
        setConfig(r.config);
        setConfigEdit(r.config);
      }
    } catch { /* silencioso -- se ve el error si intenta guardar */ }
  }, []);

  const guardarConfig = async () => {
    setGuardandoConfig(true);
    setMensajeConfig(null);
    try {
      const r = await fetch(`${DIAGNO_BASE}/api/huawei-onu/averia-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configEdit),
      }).then((r) => r.json());
      if (!r.ok) throw new Error(r.error || "No se pudo guardar.");
      setConfig(r.config);
      setMensajeConfig({ ok: true, texto: "Guardado." });
    } catch (e) {
      setMensajeConfig({ ok: false, texto: e.message || "Error de red." });
    } finally {
      setGuardandoConfig(false);
    }
  };

  const cargarHistorial = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-averias-zona?activa=0`).then((r) => r.json());
      if (!r.ok) throw new Error(r.error || "Error consultando historial de averías.");
      setAveriasHistorial(Array.isArray(r.averias) ? r.averias : []);
      setHistorialCargado(true);
    } catch (e) {
      setError(e.message || "Error de red.");
    } finally {
      setCargando(false);
    }
  }, []);

  const generarReporte = useCallback(async (averiaId) => {
    setReporteAveria("cargando");
    setReporteError("");
    try {
      const r = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-averias-zona/reporte?id=${averiaId}`).then((r) => r.json());
      if (!r.ok) throw new Error(r.error || "No se pudo armar el reporte.");
      setReporteAveria(r);
    } catch (e) {
      setReporteAveria(null);
      setReporteError(e.message || "Error de red.");
    }
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [rAverias, rEventos] = await Promise.all([
        fetch(`${HUAWEI_OLT_SNMP_API}/onu-averias-zona?activa=1`).then((r) => r.json()),
        fetch(`${HUAWEI_OLT_SNMP_API}/onu-eventos?limit=150`).then((r) => r.json()),
      ]);
      if (!rAverias.ok) throw new Error(rAverias.error || "Error consultando averías de zona.");
      if (!rEventos.ok) throw new Error(rEventos.error || "Error consultando eventos.");
      setAverias(Array.isArray(rAverias.averias) ? rAverias.averias : []);
      setEventosTodos(Array.isArray(rEventos.eventos) ? rEventos.eventos : []);
      setUltimaActualizacion(new Date());

      // Nombres actuales por SN (sirve por 3 min gracias al cache propio
      // de huawei-olt-snmp -- no pega directo al OLT en cada refresh de 20s).
      try {
        const snsDeEventos = new Set((rEventos.eventos || []).map((e) => e.sn).filter(Boolean));
        if (snsDeEventos.size) {
          let todas = [];
          for (let page = 1; page <= 9; page++) {
            const r = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-list?pageSize=200&page=${page}`).then((r) => r.json());
            if (!r.ok || !Array.isArray(r.onus) || r.onus.length === 0) break;
            todas = todas.concat(r.onus);
            if (todas.length >= (r.total || 0)) break;
          }
          const mapa = {};
          for (const o of todas) if (snsDeEventos.has(o.sn)) mapa[o.sn] = o.nombre;
          setNombresActualesPorSn(mapa);
        }
      } catch { /* si falla, se sigue mostrando el nombre historico del evento */ }
    } catch (e) {
      setError(e.message || "Error de red.");
    } finally {
      setCargando(false);
    }
  }, []);

  // "LOS sin recuperar": de los ultimos 150 eventos, agrupar por ONU (sn) y
  // quedarse con el mas reciente de cada una -- si ese mas reciente es
  // "los_down" (sin señal), significa que todavia no le llego su "los_up"
  // (recupero) despues, o sea sigue caida ahora mismo.
  const losSinRecuperar = (() => {
    const masRecientePorOnu = new Map();
    for (const ev of eventosTodos) {
      if (ev.tipo !== "los_down" && ev.tipo !== "los_up") continue;
      const key = ev.sn || `${ev.board}-${ev.port}`;
      const actual = masRecientePorOnu.get(key);
      if (!actual || new Date(ev.ocurrido_en) > new Date(actual.ocurrido_en)) masRecientePorOnu.set(key, ev);
    }
    return [...masRecientePorOnu.values()]
      .filter((ev) => ev.tipo === "los_down")
      .sort((a, b) => new Date(b.ocurrido_en) - new Date(a.ocurrido_en));
  })();

  const eventos = categoriaFiltro === "los_sin_recuperar" ? losSinRecuperar : eventosTodos.filter((ev) => {
    if (categoriaFiltro === "los") return ev.tipo === "los_down" || ev.tipo === "los_up";
    if (categoriaFiltro === "luz") return ev.tipo === "power_down" || ev.tipo === "power_up";
    return true;
  });

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, REFRESH_MS);
    return () => clearInterval(id);
  }, [cargar]);

  useEffect(() => { cargarConfig(); }, [cargarConfig]);

  return (
    <div style={{ padding: 20, background: col.bg, minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: col.text }}>Averías OLT — LOS / Corte de luz</div>
          <div style={{ fontSize: 12.5, color: col.sub, marginTop: 2 }}>
            Armado en tiempo real desde traps SNMP del OLT (Huawei) · Se refresca cada 20s
            {ultimaActualizacion ? ` · Última actualización ${ultimaActualizacion.toLocaleTimeString("es-PE")}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setMostrarConfig((v) => !v)}
            style={{ padding: "8px 14px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: "pointer", border: `1.5px solid ${col.border}`, background: mostrarConfig ? col.border : col.card, color: col.text }}
          >⚙ Configurar</button>
          <button
            onClick={cargar}
            disabled={cargando}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: cargando ? "not-allowed" : "pointer", opacity: cargando ? 0.6 : 1, border: `1.5px solid ${col.border}`, background: col.card, color: col.text }}
          ><Ico.refresh width={14} height={14} />{cargando ? "Actualizando…" : "Actualizar"}</button>
        </div>
      </div>

      {mostrarConfig && configEdit && (
        <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, background: col.card, border: `1.5px solid ${col.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: col.text, marginBottom: 12 }}>Configuración de detección y aviso</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: col.sub }}>
              Umbral LOS (ONUs)
              <input type="number" min={1} value={configEdit.umbral_los}
                onChange={(e) => setConfigEdit((c) => ({ ...c, umbral_los: Number(e.target.value) }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub }}>
              Umbral corte de luz (ONUs)
              <input type="number" min={1} value={configEdit.umbral_power}
                onChange={(e) => setConfigEdit((c) => ({ ...c, umbral_power: Number(e.target.value) }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub }}>
              Ventana de tiempo (minutos)
              <input type="number" min={1} value={configEdit.ventana_minutos}
                onChange={(e) => setConfigEdit((c) => ({ ...c, ventana_minutos: Number(e.target.value) }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub, gridColumn: "1 / -1" }}>
              Grupo de WhatsApp destino (JID)
              <input type="text" value={configEdit.whatsapp_grupo_jid}
                onChange={(e) => setConfigEdit((c) => ({ ...c, whatsapp_grupo_jid: e.target.value }))}
                placeholder="120363xxxxxxxxx@g.us"
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub }}>
              Telegram — bot token
              <input type="text" value={configEdit.telegram_bot_token || ""}
                onChange={(e) => setConfigEdit((c) => ({ ...c, telegram_bot_token: e.target.value }))}
                placeholder="123456789:ABC..."
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub }}>
              Telegram — chat_id del grupo
              <input type="text" value={configEdit.telegram_chat_id || ""}
                onChange={(e) => setConfigEdit((c) => ({ ...c, telegram_chat_id: e.target.value }))}
                placeholder="-5535234862"
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub, gridColumn: "1 / -1" }}>
              Telegram — qué avisar (WhatsApp siempre se queda solo en avería de zona, para no arriesgar baneo)
              <select value={configEdit.telegram_modo || "averia_zona"}
                onChange={(e) => setConfigEdit((c) => ({ ...c, telegram_modo: e.target.value }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }}>
                <option value="averia_zona">Solo avería de zona (igual que WhatsApp)</option>
                <option value="todos">Cada evento individual (LOS y corte de luz)</option>
                <option value="los">Cada evento de LOS individual</option>
                <option value="power">Cada corte de luz individual</option>
              </select>
            </label>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: col.sub, textTransform: "uppercase", marginBottom: 6 }}>
            Texto de los mensajes de Telegram (placeholders: {"{nombre} {sn} {board} {puerto} {senal} {rx_onu} {rx_olt}"})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, marginBottom: 14 }}>
            {[
              ["telegram_tpl_los_down", "Sin señal (LOS)"],
              ["telegram_tpl_los_up", "Recupera señal"],
              ["telegram_tpl_power_down", "Apagado (sin luz)"],
              ["telegram_tpl_power_up", "Encendido (vuelve la luz)"],
            ].map(([campo, etiqueta]) => (
              <label key={campo} style={{ fontSize: 12, color: col.sub }}>
                {etiqueta}
                <textarea rows={4} value={configEdit[campo] || ""}
                  onChange={(e) => setConfigEdit((c) => ({ ...c, [campo]: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 12, fontFamily: "monospace", borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text, resize: "vertical" }} />
              </label>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: col.text, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={configEdit.whatsapp_habilitado}
              onChange={(e) => setConfigEdit((c) => ({ ...c, whatsapp_habilitado: e.target.checked }))} />
            Avisar por WhatsApp cuando se detecte una avería de zona nueva
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: col.text, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={!!configEdit.telegram_habilitado}
              onChange={(e) => setConfigEdit((c) => ({ ...c, telegram_habilitado: e.target.checked }))} />
            Avisar por Telegram cuando se detecte una avería de zona nueva
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={guardarConfig}
              disabled={guardandoConfig}
              style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: guardandoConfig ? "not-allowed" : "pointer", opacity: guardandoConfig ? 0.6 : 1, border: "none", background: "#2563eb", color: "#fff" }}
            >{guardandoConfig ? "Guardando…" : "Guardar cambios"}</button>
            {mensajeConfig && (
              <span style={{ fontSize: 12, fontWeight: 600, color: mensajeConfig.ok ? "#15803d" : "#991b1b" }}>
                {mensajeConfig.ok ? "✓ " : "✗ "}{mensajeConfig.texto}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Averías de zona -- lo mas urgente, arriba y destacado */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: col.sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Averías de zona {vistaAverias === "activas" ? `activas (${averias.length})` : `— historial (${averiasHistorial.length})`}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setVistaAverias("activas")}
              style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: vistaAverias === "activas" ? "1.5px solid #dc2626" : `1.5px solid ${col.border}`, background: vistaAverias === "activas" ? "#fef2f2" : col.card, color: vistaAverias === "activas" ? "#991b1b" : col.sub }}>
              Activas
            </button>
            <button
              onClick={() => { setVistaAverias("historial"); if (!historialCargado) cargarHistorial(); }}
              style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: vistaAverias === "historial" ? "1.5px solid #6366f1" : `1.5px solid ${col.border}`, background: vistaAverias === "historial" ? "#eef2ff" : col.card, color: vistaAverias === "historial" ? "#4338ca" : col.sub }}>
              Historial
            </button>
          </div>
        </div>
        {(() => {
          const lista = vistaAverias === "activas" ? averias : averiasHistorial;
          const activa = vistaAverias === "activas";
          if (lista.length === 0) {
            return (
              <div style={{ padding: 16, borderRadius: 10, background: col.card, border: `1.5px solid ${col.border}`, color: col.sub, fontSize: 13 }}>
                {activa
                  ? "Sin averías de zona detectadas ahora mismo. Se marca acá cuando 3 o más ONUs del mismo board/puerto caen juntas en pocos minutos (indicador de corte de fibra, no de clientes individuales)."
                  : "Sin averías de zona resueltas en el historial reciente."}
              </div>
            );
          }
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
              {lista.map((a) => (
                <div key={a.id} style={{ padding: 14, borderRadius: 10, background: activa ? "#fef2f2" : (isDark ? col.card : "#f8fafc"), border: activa ? "1.5px solid #fca5a5" : `1.5px solid ${col.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Ico.alertTriangle width={18} height={18} color={activa ? "#dc2626" : col.sub} />
                    <div style={{ fontWeight: 800, color: activa ? "#991b1b" : col.text, fontSize: 14.5 }}>
                      Board {a.board} · Puerto {a.port}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: activa ? "#7f1d1d" : col.sub, marginBottom: 4 }}>
                    {a.tipo === "power_down" ? "Corte de luz" : "Sin señal (LOS)"} — {a.cantidad_onus} ONUs caídas juntas
                  </div>
                  <div style={{ fontSize: 11, color: activa ? "#991b1b" : col.sub, opacity: 0.8, marginBottom: 10 }}>
                    Desde {formatoFecha(a.primera_deteccion)}
                    {activa ? ` · Actualizado ${formatoFecha(a.ultima_actualizacion)}` : ` · Resuelta ${formatoFecha(a.ultima_actualizacion)}`}
                  </div>
                  <button
                    onClick={() => generarReporte(a.id)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: "none", background: activa ? "#dc2626" : "#4f46e5", color: "#fff" }}>
                    📋 Generar reporte
                  </button>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {reporteError && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 13, fontWeight: 600 }}>
          {reporteError}
          <button onClick={() => setReporteError("")} style={{ marginLeft: 10, background: "none", border: "none", color: "#991b1b", fontWeight: 800, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {reporteAveria && (
        <ReporteAveriaModal
          reporte={reporteAveria}
          isDark={isDark}
          onClose={() => setReporteAveria(null)}
        />
      )}

      {/* Eventos individuales -- historial, filtrable */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: col.sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Eventos recientes
          </div>
          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            style={{ padding: "5px 8px", fontSize: 12, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.card, color: col.text }}
          >
            <option value="los">LOS (sin señal / recupera)</option>
            <option value="los_sin_recuperar">LOS sin recuperar (activas)</option>
            <option value="luz">Luz (corte / vuelve)</option>
            <option value="todos">Todos</option>
          </select>
        </div>

        <div style={{ borderRadius: 10, background: col.card, border: `1.5px solid ${col.border}`, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px 90px 90px 90px 90px", gap: 0, padding: "8px 14px", background: isDark ? "#0d172a" : "#f8fafc", fontSize: 10.5, fontWeight: 800, color: col.sub, textTransform: "uppercase" }}>
            <div>Cuándo</div>
            <div>Cliente</div>
            <div>Board/Puerto</div>
            <div>Tipo</div>
            <div>Rx ONU</div>
            <div>Rx OLT</div>
            <div></div>
          </div>
          {eventos.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: col.sub, fontSize: 13 }}>
              {cargando ? "Cargando…" : "Sin eventos registrados todavía."}
            </div>
          ) : (
            eventos.map((ev) => {
              const info = TIPO_INFO[ev.tipo] || TIPO_DESCONOCIDO;
              return (
                <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px 90px 90px 90px 90px", gap: 0, padding: "9px 14px", borderTop: `1px solid ${col.border}`, fontSize: 12.5, color: col.text, alignItems: "center" }}>
                  <div style={{ color: col.sub, fontSize: 11.5 }}>{formatoFecha(ev.ocurrido_en)}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{(ev.sn && nombresActualesPorSn[ev.sn]) || ev.nombre || "—"}</div>
                    <div style={{ fontSize: 11, color: col.sub, display: "flex", gap: 6 }}>
                      {ev.sn && <span style={{ fontFamily: "monospace" }}>{ev.sn}</span>}
                      {ev.zona && <span>{ev.zona}</span>}
                    </div>
                  </div>
                  <div style={{ color: col.sub, fontSize: 11.5 }}>{ev.board != null ? `${ev.board}/${ev.port}` : "—"}</div>
                  <div>
                    <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: info.bg, color: info.text }}>
                      {info.label}
                    </span>
                  </div>
                  {(() => {
                    const senalViva = senalEnVivoPorEvento[ev.id];
                    if (senalViva && senalViva !== "cargando" && senalViva !== "error") {
                      return (
                        <>
                          <div style={{ fontSize: 11.5 }} title="Señal en vivo, no la del momento del evento">{senalViva.rxPower != null ? `${senalViva.rxPower} dBm ⚡` : "—"}</div>
                          <div style={{ fontSize: 11.5 }} title="Señal en vivo, no la del momento del evento">{senalViva.rxPowerOlt != null ? `${senalViva.rxPowerOlt} dBm ⚡` : "—"}</div>
                        </>
                      );
                    }
                    return (
                      <>
                        <div style={{ fontSize: 11.5 }}>{ev.rx_power != null ? `${ev.rx_power} dBm` : "—"}</div>
                        <div style={{ fontSize: 11.5 }}>{ev.rx_power_olt != null ? `${ev.rx_power_olt} dBm` : "—"}</div>
                      </>
                    );
                  })()}
                  <div style={{ display: "flex", gap: 6 }}>
                    {ev.sn && ev.rx_power == null && (
                      <button
                        onClick={() => refrescarSenal(ev)}
                        disabled={senalEnVivoPorEvento[ev.id] === "cargando"}
                        title="Consultar la señal actual (en vivo) de esta ONU"
                        style={{ padding: "5px 8px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", border: "1.5px solid #2563eb", background: "transparent", color: "#2563eb" }}
                      >{senalEnVivoPorEvento[ev.id] === "cargando" ? "…" : "🔄"}</button>
                    )}
                    {ev.sn && (
                      <button
                        onClick={() => setSnFicha(ev.sn)}
                        style={{ padding: "5px 10px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", border: `1.5px solid ${col.border}`, background: col.card, color: "#2563eb" }}
                      >Ver ficha</button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {snFicha && <FichaOnuDrawer sn={snFicha} onClose={() => setSnFicha(null)} isDark={isDark} />}
    </div>
  );
}

function urlMapa(ubicacion) {
  const coords = String(ubicacion || "").trim();
  if (!coords) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(coords)}`;
}

// "ubicacion" se guarda como "lat, lng" (texto) -- null si no es un par
// de numeros valido, para que el mapa simplemente salte ese cliente.
function parseCoords(ubicacion) {
  const partes = String(ubicacion || "").split(",").map((s) => Number(s.trim()));
  if (partes.length !== 2 || partes.some((n) => Number.isNaN(n))) return null;
  return { lat: partes[0], lng: partes[1] };
}

function MapaAveriaClientes({ clientes, isDark }) {
  const mapRef = useRef(null);
  const [estado, setEstado] = useState("cargando"); // cargando | listo | error | sin_coords

  const conCoords = clientes.map((c) => ({ ...c, coords: parseCoords(c.ubicacion) })).filter((c) => c.coords);

  useEffect(() => {
    let cancelado = false;
    if (!conCoords.length) { setEstado("sin_coords"); return; }
    loadGoogleMapsSdk()
      .then((maps) => {
        if (cancelado || !mapRef.current) return;
        const bounds = new maps.LatLngBounds();
        conCoords.forEach((c) => bounds.extend(c.coords));
        const map = new maps.Map(mapRef.current, {
          center: bounds.getCenter(),
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: isDark ? [{ elementType: "geometry", stylers: [{ color: "#1a2740" }] }, { elementType: "labels.text.stroke", stylers: [{ color: "#1a2740" }] }, { elementType: "labels.text.fill", stylers: [{ color: "#93a2bd" }] }] : undefined,
        });
        const markers = conCoords.map((c) => {
          const marker = new maps.Marker({ position: c.coords, title: c.nombre || c.sn_onu });
          const info = new maps.InfoWindow({ content: `<div style="font-size:12px;max-width:200px"><b>${c.nombre || "Sin nombre"}</b><br/>${c.direccion || ""}</div>` });
          marker.addListener("click", () => info.open(map, marker));
          return marker;
        });
        // Agrupa en una burbuja numerada cuando hay muchos clientes juntos
        // en pocas cuadras -- sin esto, averías grandes dejaban el mapa
        // ilegible con decenas de pines pisandose entre si.
        new MarkerClusterer({
          map,
          markers,
          renderer: { render: ({ count, position }) => new maps.Marker({
            position,
            label: { text: String(count), color: "#fff", fontSize: "11px", fontWeight: "800" },
            icon: { path: maps.SymbolPath.CIRCLE, scale: 16 + Math.min(count, 30) * 0.35, fillColor: "#dc2626", fillOpacity: 0.85, strokeColor: "#ffffff", strokeWeight: 2 },
            zIndex: 1000 + count,
          }) },
        });
        if (conCoords.length > 1) map.fitBounds(bounds); else map.setZoom(16);
        setEstado("listo");
      })
      .catch(() => setEstado("error"));
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes]);

  if (estado === "sin_coords") {
    return (
      <div style={{ padding: 16, borderRadius: 8, background: isDark ? "#1a2740" : "#f8fafc", border: `1px dashed ${isDark ? "#2c3c58" : "#e2e8f4"}`, fontSize: 12, color: isDark ? "#93a2bd" : "#5b6b8c", textAlign: "center" }}>
        Ningún cliente afectado tiene coordenadas GPS registradas.
      </div>
    );
  }
  if (estado === "error") {
    return (
      <div style={{ padding: 16, borderRadius: 8, background: "#fef2f2", border: "1px solid #fca5a5", fontSize: 12, color: "#991b1b", textAlign: "center" }}>
        No se pudo cargar el mapa.
      </div>
    );
  }
  return (
    <div style={{ position: "relative", height: 220, borderRadius: 10, overflow: "hidden", border: `1px solid ${isDark ? "#2c3c58" : "#e2e8f4"}` }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      {estado === "cargando" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isDark ? "#1a2740" : "#f8fafc", fontSize: 12, color: isDark ? "#93a2bd" : "#5b6b8c" }}>
          Cargando mapa…
        </div>
      )}
    </div>
  );
}

function urlMapaCompartido(averiaId) {
  return `${window.location.origin}/averia-mapa?id=${averiaId}`;
}

function textoReporte(reporte) {
  const { averia, clientes_afectados: clientes, onus_sin_identificar: sinId, total_afectados: total } = reporte;
  const tipoTexto = averia.tipo === "power_down" ? "Corte de luz" : "Sin señal (LOS)";
  const estadoTexto = averia.activa ? "🔴 SIGUE ACTIVA" : "✅ Resuelta";
  const lineas = [
    `⚠️ *AVERÍA DE ZONA* — Board ${averia.board} / Puerto ${averia.port}`,
    `${tipoTexto} · ${estadoTexto}`,
    `Inicio: ${formatoFecha(averia.primera_deteccion)}`,
    averia.resuelta_en ? `Resuelta: ${formatoFecha(averia.resuelta_en)}` : null,
    `Total de clientes afectados: ${total}`,
    `🗺️ Mapa: ${urlMapaCompartido(averia.id)}`,
    "",
  ].filter(Boolean);
  clientes.forEach((c, i) => {
    const mapa = urlMapa(c.ubicacion);
    lineas.push(`${i + 1}. ${c.nombre || "Sin nombre"} — DNI ${c.dni || "—"}`);
    lineas.push(`   ${c.direccion || "Sin dirección registrada"}${c.nodo ? ` (${c.nodo})` : ""}`);
    if (c.celular) lineas.push(`   Cel: ${c.celular}`);
    if (mapa) lineas.push(`   📍 ${mapa}`);
    if (c.senal_previa?.rx_power != null) lineas.push(`   Señal previa: ${c.senal_previa.rx_power} dBm`);
    lineas.push("");
  });
  if (sinId.length) {
    lineas.push(`ONUs caídas sin cliente identificado (${sinId.length}):`);
    sinId.forEach((s) => lineas.push(`   SN ${s.sn_onu}${s.nombre ? ` — ${s.nombre}` : ""}`));
  }
  return lineas.join("\n").trim();
}

function ReporteAveriaModal({ reporte, isDark, onClose }) {
  const col = isDark
    ? { bg: "#111c33", card: "#1a2740", border: "#2c3c58", text: "#e6ecf7", sub: "#93a2bd" }
    : { bg: "#f4f6fb", card: "#ffffff", border: "#e2e8f4", text: "#1a2740", sub: "#5b6b8c" };
  const cargando = reporte === "cargando";
  const [copiado, setCopiado] = useState(false);
  const [copiadoLink, setCopiadoLink] = useState(false);

  const copiarTexto = async () => {
    try {
      await navigator.clipboard.writeText(textoReporte(reporte));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(urlMapaCompartido(reporte.averia?.id));
      setCopiadoLink(true);
      setTimeout(() => setCopiadoLink(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,15,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div
        style={{ width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto", background: col.bg, border: `1.5px solid ${col.border}`, borderRadius: 14, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: col.text }}>📋 Reporte de avería</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, fontWeight: 800, color: col.sub, cursor: "pointer" }}>✕</button>
        </div>

        {cargando ? (
          <div style={{ padding: 30, textAlign: "center", color: col.sub, fontSize: 13 }}>Armando reporte…</div>
        ) : (
          <>
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: reporte.averia.activa ? "#fef2f2" : "#f0fdf4", border: `1.5px solid ${reporte.averia.activa ? "#fca5a5" : "#86efac"}` }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: reporte.averia.activa ? "#991b1b" : "#15803d" }}>
                Board {reporte.averia.board} · Puerto {reporte.averia.port} — {reporte.averia.tipo === "power_down" ? "Corte de luz" : "Sin señal (LOS)"}
              </div>
              <div style={{ fontSize: 11.5, color: col.sub, marginTop: 4 }}>
                {reporte.averia.activa ? "🔴 Sigue activa" : "✅ Resuelta"} · Inicio {formatoFecha(reporte.averia.primera_deteccion)}
                {reporte.averia.resuelta_en ? ` · Resuelta ${formatoFecha(reporte.averia.resuelta_en)}` : ""}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: col.text, marginTop: 6 }}>
                👥 {reporte.total_afectados} cliente{reporte.total_afectados === 1 ? "" : "s"} afectado{reporte.total_afectados === 1 ? "" : "s"}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <MapaAveriaClientes clientes={reporte.clientes_afectados} isDark={isDark} />
            </div>

            <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
              {reporte.clientes_afectados.map((c) => (
                <div key={c.sn_onu} style={{ padding: 10, borderRadius: 8, background: col.card, border: `1px solid ${col.border}` }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: col.text }}>{c.nombre || "Sin nombre"}</div>
                  <div style={{ fontSize: 11.5, color: col.sub }}>DNI {c.dni || "—"} · {c.nodo || "—"}</div>
                  <div style={{ fontSize: 11.5, color: col.sub }}>{c.direccion || "Sin dirección registrada"}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                    {c.celular && <span style={{ fontSize: 11, color: col.sub }}>📞 {c.celular}</span>}
                    {urlMapa(c.ubicacion) && (
                      <a href={urlMapa(c.ubicacion)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#2563eb", fontWeight: 700 }}>📍 Ver en mapa</a>
                    )}
                    {c.senal_previa?.rx_power != null && <span style={{ fontSize: 11, color: col.sub }}>Señal previa: {c.senal_previa.rx_power} dBm</span>}
                  </div>
                </div>
              ))}
              {reporte.onus_sin_identificar.length > 0 && (
                <div style={{ padding: 10, borderRadius: 8, background: col.card, border: `1px dashed ${col.border}`, fontSize: 11.5, color: col.sub }}>
                  {reporte.onus_sin_identificar.length} ONU(s) caída(s) sin cliente identificado: {reporte.onus_sin_identificar.map((s) => s.sn_onu).join(", ")}
                </div>
              )}
            </div>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(textoReporte(reporte))}`}
              target="_blank" rel="noreferrer"
              style={{ display: "block", textAlign: "center", padding: "11px 14px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, textDecoration: "none", background: "#25D366", color: "#fff", marginBottom: 8 }}
            >
              💬 Compartir por WhatsApp (incluye el link del mapa)
            </a>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={copiarTexto}
                style={{ flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${col.border}`, background: col.card, color: col.text }}
              >
                {copiado ? "✓ Copiado" : "📋 Texto"}
              </button>
              <a
                href={urlMapaCompartido(reporte.averia.id)}
                target="_blank" rel="noreferrer"
                style={{ flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, textDecoration: "none", border: `1.5px solid ${col.border}`, background: col.card, color: "#4f46e5" }}
              >
                🗺️ Mapa
              </a>
              <button
                onClick={copiarLink}
                style={{ flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${col.border}`, background: col.card, color: col.text }}
              >
                {copiadoLink ? "✓ Copiado" : "🔗 Link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
