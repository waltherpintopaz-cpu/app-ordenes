import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabaseClient";
import { MapPin, CheckCircle2, Loader2, User } from "lucide-react";

// Formulario web OPCIONAL para los datos de instalacion -- alternativa al
// ida-y-vuelta por WhatsApp (pedido explicito del usuario, 2026-10-26). El
// link lo genera el bot (ver generarLinkFormularioInstalacion en
// bot-pagos-comprobante/server.mjs) como "/agendar-instalacion/<token>" --
// SOLO el token en la URL, sin conv_id ni telefono (pedido explicito del
// usuario, 2026-10-26: el link con "?conv=...&tel=...&tok=..." se veia
// largo y sospechoso, tipo phishing). El token es la UNICA credencial --
// esta pagina lo resuelve al cargar (accion FormularioInstalacionResolver)
// para saber si es valido y precargar el celular, sin exponer esos datos
// en la URL. SIN login, quien lo abre es un prospecto, no alguien con
// cuenta en el panel. El envio NUNCA agenda directo: pasa server-a-server
// por diagno hacia bot-pagos-comprobante (accion
// FormularioInstalacionEnviar), que reusa el MISMO flujo de confirmacion
// por WhatsApp que ya tiene el chat normal -- el cliente sigue confirmando
// por su cuenta antes de que se cree la orden.
const DIAGNO_BASE = import.meta.env.PROD ? "https://amnet-diagno.0lthka.easypanel.host" : "";
const PROXY_URL = `${DIAGNO_BASE}/api/mikrowisp-proxy`;

// Mismo proveedor y llave que ya usa SidebarApp.jsx (buscarDniORuc) para
// autocompletar el nombre del titular al crear una orden -- esa llave ya
// vive hardcodeada en el bundle publico de la app principal, asi que
// reusarla aca (otra pagina publica) no expone nada nuevo.
const DNI_API_KEY = "cGVydWRldnMucHJvZHVjdGlvbi5maXRjb2RlcnMuNjllMTNmNDYxYzlhY2M1YmI0MjI2YTcx";

// Mapa con OpenStreetMap (Leaflet) -- sin API key, sin facturacion, sin
// restriccion de dominio. Se cambio de Google Maps a esto (pedido
// explicito del usuario, 2026-10-26) porque el mapa se quedaba en blanco
// en produccion por un problema de configuracion de la API key de Google
// (dominio no autorizado o API no habilitada en Google Cloud) que nadie
// tenia a mano para arreglar en el momento -- para solo marcar un pin esto
// alcanza de sobra, y ya es la misma libreria que usa CoberturaMapaModal.jsx
// en el panel principal (mismo patron de L.map/L.tileLayer/L.marker).
const CENTRO_DEFAULT = { lat: -16.409, lng: -71.537 };

// Mismo pin (persona + globo de estado) que ya usa CoberturaMapaModal.jsx
// en el panel -- estado: undefined="verificando", true="cobertura",
// false="fuera de cobertura". Copiado tal cual para no acoplar esta pagina
// publica a un componente del panel autenticado.
function pinClienteIcon(estado, size = 36) {
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

const DIAS_SEMANA_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const HORARIOS = ["Mañana (8:00am - 11:30am)", "Mediodía (11:30am - 2:30pm)", "Tarde (2:30pm - 5:30pm)"];

function mananaISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function parsearPlanesConPromo(planesTv, promoActiva) {
  const re = /([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s*·\s*(\d+)\s*Mbps\s*·\s*S\/\s*(\d+)/gi;
  const planes = [];
  let m;
  while ((m = re.exec(planesTv || ""))) {
    const [, nombre, vel, precio] = m;
    const precioNum = Number(precio);
    const label = promoActiva
      ? `${nombre} · ${vel} Mbps · S/${precioNum} → S/${Math.round(precioNum / 2)} primer mes (promo 50%)`
      : `${nombre} · ${vel} Mbps · S/${precioNum}`;
    planes.push({ valor: nombre, label });
  }
  return planes;
}

const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "28px 24px", maxWidth: 440, width: "100%", boxShadow: "0 4px 24px rgba(15,23,42,0.06)" };
const label = { fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6, display: "block" };
const inp = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#0f172a", fontFamily: "inherit", boxSizing: "border-box", background: "#fff" };
const field = { marginBottom: 14 };

export default function AgendarInstalacionPage() {
  // Token como ultimo segmento de la ruta ("/agendar-instalacion/<token>"),
  // no como query string -- ver nota arriba.
  const tok = window.location.pathname.split("/agendar-instalacion/")[1]?.split(/[/?]/)[0] || "";

  const [resolviendo, setResolviendo] = useState(true);
  const [linkInvalido, setLinkInvalido] = useState(false);

  const [planes, setPlanes] = useState([]);
  const [form, setForm] = useState({ dni: "", celular_titular: "", direccion: "", plan: "", fecha: "", horario: "", correo: "" });
  const [nombreDni, setNombreDni] = useState("");
  const [buscandoDni, setBuscandoDni] = useState(false);
  const [dniNoEncontrado, setDniNoEncontrado] = useState(false);

  const [ubicacion, setUbicacion] = useState(null); // {lat,lng}
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState("");
  const [coberturaEstado, setCoberturaEstado] = useState(null); // null | "revisando" | true | false
  const [mapaError, setMapaError] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState({}); // { campo: mensaje } -- uno por campo, no solo el primero
  const [errorEnvio, setErrorEnvio] = useState("");
  const [enviado, setEnviado] = useState(false);

  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const markerRef = useRef(null);
  const coberturaTimerRef = useRef(null);

  useEffect(() => {
    supabase.from("bot_pagos_v3_config").select("planes_tv,promocion_activa,promocion_texto").eq("id", 1).maybeSingle()
      .then(({ data }) => setPlanes(parsearPlanesConPromo(data?.planes_tv, !!(data?.promocion_activa && data?.promocion_texto))))
      .catch(() => {});
  }, []);

  // Resuelve el token al cargar -- confirma que el link es valido ANTES de
  // mostrar el formulario (si no, no tiene sentido dejar que alguien llene
  // todo para recien enterarse al final que el link estaba vencido), y de
  // paso precarga el celular guardado del lado del servidor.
  useEffect(() => {
    if (!tok) { setResolviendo(false); setLinkInvalido(true); return; }
    fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "FormularioInstalacionResolver", payload: { token: tok } }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res?.ok || !res.data?.ok) { setLinkInvalido(true); return; }
        setForm((f) => ({ ...f, celular_titular: res.data.telefono || "" }));
      })
      .catch(() => setLinkInvalido(true))
      .finally(() => setResolviendo(false));
  }, [tok]);

  // DNI -> nombre completo (RENIEC) apenas llega a 8 digitos -- pedido
  // explicito del usuario (2026-10-26), igual que ya hace SidebarApp.jsx
  // al crear una orden. Solo informativo (se muestra, no se envia aparte --
  // el bot ya obtiene el nombre el solo por DNI del lado del servidor).
  // Si no se encuentra, se avisa (antes se quedaba en blanco sin explicar
  // nada -- el cliente no tenia forma de notar un DNI mal tecleado).
  useEffect(() => {
    if (form.dni.length !== 8) { setNombreDni(""); setDniNoEncontrado(false); return; }
    let cancelado = false;
    setBuscandoDni(true);
    setDniNoEncontrado(false);
    fetch(`https://api.perudevs.com/api/v1/dni/simple?document=${form.dni}&key=${DNI_API_KEY}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelado) return;
        const nombre = data?.estado && data?.resultado?.nombre_completo ? data.resultado.nombre_completo : "";
        setNombreDni(nombre);
        setDniNoEncontrado(!nombre);
      })
      .catch(() => { if (!cancelado) { setNombreDni(""); setDniNoEncontrado(false); } })
      .finally(() => { if (!cancelado) setBuscandoDni(false); });
    return () => { cancelado = true; };
  }, [form.dni]);

  // Mapa interactivo -- click o arrastrar el pin marca la ubicacion, mas
  // intuitivo que solo el boton de geolocalizacion (pedido explicito del
  // usuario, 2026-10-26: util tambien cuando el cliente no esta fisicamente
  // en su casa en ese momento, puede marcarla a ojo en el mapa igual).
  useEffect(() => {
    // "resolviendo" en las dependencias: mientras es true, esta pantalla
    // muestra SOLO el loader (ver el early-return mas abajo), asi que el
    // <div> del mapa ni existe en el DOM todavia -- si este efecto corriera
    // una sola vez al montar (deps []), se ejecutaria ANTES de que el div
    // exista, mapRef.current seria null, y el mapa nunca se inicializaria
    // (bug real reportado en vivo, 2026-10-26: mapa en blanco sin ningun
    // error). Al depender de "resolviendo", el efecto se vuelve a evaluar
    // apenas termina de resolverse el token y el formulario real (con el
    // div del mapa) recien se monta.
    if (resolviendo || !mapRef.current || mapObjRef.current) return;
    try {
      const centro = ubicacion || CENTRO_DEFAULT;
      // Leaflet mueve el mapa con 1 solo dedo/clic por defecto (a
      // diferencia de Google Maps embebido en una pagina con scroll, que
      // exigia 2 dedos -- queja real del usuario, 2026-10-26: "cuando jalo
      // el mapa a la derecha o izquierda no se puede interactuar"), asi
      // que no hace falta ninguna config especial para esto.
      const mapa = L.map(mapRef.current, { attributionControl: false, zoomControl: true }).setView([centro.lat, centro.lng], ubicacion ? 16 : 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);
      const marker = L.marker([centro.lat, centro.lng], { icon: pinClienteIcon(undefined), draggable: true }).addTo(mapa);
      mapObjRef.current = mapa;
      markerRef.current = marker;
      // Leaflet calcula el tamaño del mapa en el instante en que se crea --
      // si el contenedor todavia no tenia su tamaño final en ese instante
      // exacto (comun dentro de React, sobre todo en una pagina cargada por
      // lazy()), el mapa queda pensando que mide 0x0 y no dibuja ningun
      // tile, aunque el div se vea con su alto normal (bug real reportado
      // en vivo, 2026-10-26: mapa en blanco). invalidateSize() le fuerza a
      // remedir el contenedor real.
      setTimeout(() => mapa.invalidateSize(), 0);
      setTimeout(() => mapa.invalidateSize(), 300);
      const actualizar = (latlng) => setUbicacion({ lat: latlng.lat, lng: latlng.lng });
      marker.on("dragend", () => actualizar(marker.getLatLng()));
      mapa.on("click", (e) => { marker.setLatLng(e.latlng); actualizar(e.latlng); });
    } catch {
      setMapaError(true);
    }
    return () => { mapObjRef.current?.remove(); mapObjRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolviendo]);

  // Chequeo de cobertura EN VIVO mientras se mueve el pin -- SOLO pide
  // true/false al backend (accion FormularioCoberturaCheck), nunca la
  // geometria real de las zonas -- exponer el mapa de cobertura completo a
  // cualquiera que abra este link publico no es buena idea (discutido con
  // el usuario, 2026-10-26), pero confirmar si ese punto puntual esta
  // cubierto es informacion segura de compartir.
  useEffect(() => {
    if (!ubicacion) { setCoberturaEstado(null); return; }
    if (mapObjRef.current) mapObjRef.current.panTo([ubicacion.lat, ubicacion.lng]);
    if (markerRef.current) markerRef.current.setLatLng([ubicacion.lat, ubicacion.lng]);
    setCoberturaEstado("revisando");
    clearTimeout(coberturaTimerRef.current);
    coberturaTimerRef.current = setTimeout(() => {
      fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "FormularioCoberturaCheck", payload: { lat: ubicacion.lat, lng: ubicacion.lng } }),
      })
        .then((r) => r.json())
        .then((data) => setCoberturaEstado(data?.ok ? !!data.data?.cubierto : null))
        .catch(() => setCoberturaEstado(null));
    }, 600);
    return () => clearTimeout(coberturaTimerRef.current);
  }, [ubicacion]);

  // Pin verde/rojo/gris segun el resultado de cobertura -- mas intuitivo
  // directo en el mapa que solo el texto debajo del boton (pedido del
  // usuario, 2026-10-26). Mismo icono con globo de estado que usa
  // CoberturaMapaModal.jsx en el panel (ver pinClienteIcon arriba).
  useEffect(() => {
    if (!markerRef.current) return;
    markerRef.current.setIcon(pinClienteIcon(coberturaEstado === "revisando" ? undefined : coberturaEstado));
  }, [coberturaEstado]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pedirUbicacion = () => {
    setErrorUbicacion("");
    if (!navigator.geolocation) { setErrorUbicacion("Tu navegador no permite compartir ubicación -- márcala en el mapa o escríbenos por WhatsApp."); return; }
    setBuscandoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setBuscandoUbicacion(false); },
      () => { setErrorUbicacion("No se pudo obtener tu ubicación -- márcala directo en el mapa de abajo."); setBuscandoUbicacion(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const fechaEsDomingo = (iso) => iso && new Date(iso + "T00:00:00").getDay() === 0;

  // Devuelve TODOS los errores a la vez (uno por campo), no solo el
  // primero -- antes el cliente corregia un campo, reenviaba, y recien ahi
  // se enteraba del siguiente error, uno por uno (queja real del usuario,
  // 2026-10-26).
  const validar = () => {
    const errs = {};
    if (!/^\d{8}$/.test(form.dni.trim())) errs.dni = "El DNI debe tener 8 dígitos.";
    if (!/^\d{9}$/.test(form.celular_titular.replace(/\D/g, ""))) errs.celular_titular = "El celular debe tener 9 dígitos.";
    if (!form.direccion.trim()) errs.direccion = "Falta la dirección.";
    if (!form.plan) errs.plan = "Elige un plan.";
    if (!form.fecha) errs.fecha = "Elige un día.";
    else if (fechaEsDomingo(form.fecha)) errs.fecha = "Los domingos no hacemos instalaciones -- elige otro día.";
    if (!form.horario) errs.horario = "Elige un horario.";
    return errs;
  };

  const enviar = async (e) => {
    e.preventDefault();
    const errs = validar();
    if (Object.keys(errs).length) { setErrores(errs); return; }
    setErrores({});
    setErrorEnvio("");
    setEnviando(true);
    try {
      const fechaObj = new Date(form.fecha + "T00:00:00");
      const diaHorario = `${DIAS_SEMANA_ES[fechaObj.getDay()]} ${form.fecha.slice(8, 10)}/${form.fecha.slice(5, 7)}, ${form.horario}`;
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "FormularioInstalacionEnviar",
          payload: {
            token: tok,
            dni: form.dni.trim(), celular_titular: form.celular_titular.trim(), direccion: form.direccion.trim(),
            plan: form.plan, dia_horario: diaHorario, correo: form.correo.trim() || null,
            lat: ubicacion?.lat ?? null, lng: ubicacion?.lng ?? null,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.ok) throw new Error(data?.error || "No se pudo enviar");
      setEnviado(true);
    } catch (err) {
      setErrorEnvio("No se pudo enviar tus datos -- intenta de nuevo o escríbenos directo por WhatsApp.");
    } finally {
      setEnviando(false);
    }
  };

  if (resolviendo) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc" }}>
        <Loader2 size={24} color="#64748b" />
      </div>
    );
  }

  if (linkInvalido) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc" }}>
        <div style={card}>
          <p style={{ fontSize: 14, color: "#475569" }}>Este link no es válido o ya venció. Pide uno nuevo por WhatsApp.</p>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc" }}>
        <div style={{ ...card, textAlign: "center" }}>
          <CheckCircle2 size={40} color="#16a34a" style={{ marginBottom: 12 }} />
          <h2 style={{ fontSize: 17, color: "#0f172a", margin: "0 0 8px" }}>¡Listo!</h2>
          <p style={{ fontSize: 14, color: "#475569", margin: "0 0 20px" }}>Recibimos tus datos. Vuelve a WhatsApp -- te vamos a mostrar un resumen para que confirmes antes de agendar.</p>
          {/* window.close() solo funciona si el navegador lo permite (ej. la
              pestaña/webview en la que WhatsApp abrio este link) -- si no
              hace nada, el cliente igual puede volver a WhatsApp a mano,
              asi que es un boton de "mejor esfuerzo", nunca indispensable. */}
          <button type="button" onClick={() => window.close()} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Volver a WhatsApp
          </button>
        </div>
      </div>
    );
  }

  const errorField = { fontSize: 12, color: "#dc2626", margin: "6px 0 0" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc" }}>
      <form style={card} onSubmit={enviar}>
        <h2 style={{ fontSize: 17, color: "#0f172a", margin: "0 0 4px" }}>Agenda tu instalación</h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>Llena tus datos aquí, es más rápido que escribirlos por WhatsApp.</p>

        <div style={field}>
          <label style={label}>DNI</label>
          <input style={inp} value={form.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="12345678" required />
          {buscandoDni && <p style={{ fontSize: 12, color: "#94a3b8", margin: "6px 0 0" }}>Buscando...</p>}
          {!buscandoDni && nombreDni && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
              <User size={13} /> {nombreDni}
            </div>
          )}
          {!buscandoDni && dniNoEncontrado && <p style={errorField}>No encontramos ese DNI -- revisa que esté bien escrito.</p>}
          {errores.dni && <p style={errorField}>{errores.dni}</p>}
        </div>
        <div style={field}>
          <label style={label}>Celular del titular</label>
          <input style={inp} value={form.celular_titular} onChange={(e) => set("celular_titular", e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" placeholder="987654321" required />
          {errores.celular_titular && <p style={errorField}>{errores.celular_titular}</p>}
        </div>
        <div style={field}>
          <label style={label}>Dirección exacta</label>
          <input style={inp} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Jr./Av., número, urbanización/zona" required />
          {errores.direccion && <p style={errorField}>{errores.direccion}</p>}
        </div>

        <div style={field}>
          <label style={label}>Ubicación GPS</label>
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 8px" }}>Toca el mapa o arrastra el pin para marcar el lugar exacto -- aunque no estés ahí en este momento.</p>
          {mapaError ? (
            <p style={{ fontSize: 12, color: "#dc2626", margin: "0 0 8px" }}>No se pudo cargar el mapa -- usa el botón de abajo o describe bien la dirección arriba, igual podemos confirmar por WhatsApp.</p>
          ) : (
            <div ref={mapRef} style={{ width: "100%", height: 220, borderRadius: 8, border: "1px solid #d1d5db", background: "#f1f5f9" }} />
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={pedirUbicacion} disabled={buscandoUbicacion} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#eff6ff", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {buscandoUbicacion ? <Loader2 size={13} /> : <MapPin size={13} />} {buscandoUbicacion ? "Obteniendo..." : "Usar mi ubicación actual"}
            </button>
            {coberturaEstado === "revisando" && <span style={{ fontSize: 12, color: "#94a3b8" }}>Revisando cobertura...</span>}
            {coberturaEstado === true && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✅ Zona con cobertura</span>}
            {coberturaEstado === false && <span style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>⚠️ Fuera del mapa de cobertura, lo confirmamos igual</span>}
          </div>
          {errorUbicacion && <p style={errorField}>{errorUbicacion}</p>}
        </div>

        <div style={field}>
          <label style={label}>Plan</label>
          <select style={inp} value={form.plan} onChange={(e) => set("plan", e.target.value)} required>
            <option value="">Elige un plan...</option>
            {planes.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
          </select>
          {errores.plan && <p style={errorField}>{errores.plan}</p>}
        </div>

        <div style={field}>
          <label style={label}>Día de instalación</label>
          <input style={inp} type="date" min={mananaISO()} value={form.fecha} onChange={(e) => set("fecha", e.target.value)} required />
          {errores.fecha && <p style={errorField}>{errores.fecha}</p>}
        </div>
        <div style={field}>
          <label style={label}>Horario de preferencia</label>
          <select style={inp} value={form.horario} onChange={(e) => set("horario", e.target.value)} required>
            <option value="">Elige un horario...</option>
            {HORARIOS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "6px 0 0" }}>Instalamos de lunes a sábado, 8:00am a 5:30pm.</p>
          {errores.horario && <p style={errorField}>{errores.horario}</p>}
        </div>

        <div style={field}>
          <label style={label}>Correo (opcional)</label>
          <input style={inp} type="email" value={form.correo} onChange={(e) => set("correo", e.target.value)} placeholder="tucorreo@ejemplo.com" />
        </div>

        {errorEnvio && <p style={{ fontSize: 13, color: "#dc2626", margin: "0 0 12px" }}>{errorEnvio}</p>}

        <button type="submit" disabled={enviando} style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 700, cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.7 : 1 }}>
          {enviando ? "Enviando..." : "Enviar datos"}
        </button>
      </form>
    </div>
  );
}
