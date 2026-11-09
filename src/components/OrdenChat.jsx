import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MessagesSquare, Phone, Navigation, Camera, MapPin, Send, Check, CheckCheck, Clock, CircleAlert,
  ArrowDown, Copy, Trash2, X, ChevronLeft, ChevronRight, LocateFixed, Map as MapIcon, EllipsisVertical, ExternalLink,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { marcarChatOrdenVisto } from "../services/chatOrdenesUnread";
import { notificarMensajeChat } from "../services/chatPush";

const AVATAR_COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#ea580c", "#db2777", "#0891b2"];
const norm = (s) => String(s || "").trim().toLowerCase();
function colorParaAutor(nombre) {
  const s = String(nombre || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
const ROLES = {
  administrador: { t: "Admin", c: "#7c3aed", bg: "#f3e8ff" },
  gestora: { t: "Gestora", c: "#be185d", bg: "#fce7f3" },
  tecnico: { t: "Técnico", c: "#0f766e", bg: "#ccfbf1" },
};
const sinTildes = (s) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
function rolInfo(r) {
  return ROLES[sinTildes(r)] || (r ? { t: String(r), c: "#475569", bg: "#f1f5f9" } : null);
}
function formatearFechaDivisor(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}
const horaDe = (iso) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
const UBICACION_DEFAULT = { lat: -16.409, lng: -71.537 };
function extraerUbicacionDeTexto(texto) {
  const m = String(texto || "").match(/https:\/\/www\.google\.com\/maps\?q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  const titulo = String(texto).split("\n")[0].replace("📍", "").trim();
  return { lat: Number(m[1]), lng: Number(m[2]), url: m[0], titulo: titulo && !titulo.startsWith("http") ? titulo : "Ubicación" };
}

const RAPIDAS_TECNICO = ["Ya llegué 👍", "El cliente no está", "Falta material", "¿Me pasan la ubicación exacta?", "Terminé, voy a liquidar"];
const RAPIDAS_OFICINA = ["¿Cómo vas?", "El cliente confirmó", "Llama al cliente, por favor", "Te paso la ubicación", "Ok, gracias 👍"];

// Vista previa de mapa con teselas de OpenStreetMap (3x3 a zoom 17 de 128px)
// en vez de montar un Leaflet por cada mensaje.
function MiniMapa({ lat, lng, ancho, alto }) {
  const z = 17, n = 2 ** z, T = 128;
  const r = (lat * Math.PI) / 180;
  const fx = ((lng + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const x0 = Math.floor(fx) - 1, y0 = Math.floor(fy) - 1;
  const left = ancho / 2 - (fx - x0) * T, top = alto / 2 - (fy - y0) * T;
  const tiles = [];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) tiles.push([dx, dy]);
  return (
    <div style={{ position: "relative", width: ancho, height: alto, overflow: "hidden", background: "#e2e8f0" }}>
      {tiles.map(([dx, dy]) => (
        <img key={`${dx}-${dy}`} alt="" draggable={false} src={`https://tile.openstreetmap.org/${z}/${x0 + dx}/${y0 + dy}.png`}
          style={{ position: "absolute", width: T, height: T, left: left + dx * T, top: top + dy * T, maxWidth: "none" }} />
      ))}
      <MapPin size={28} color="#fff" fill="#dc2626" strokeWidth={1.5} style={{ position: "absolute", left: ancho / 2 - 14, top: alto / 2 - 27 }} />
    </div>
  );
}

// Chat compartido por orden de trabajo -- un solo hilo por orden, visible
// para el tecnico asignado y las gestoras/admin que ya pueden ver esa
// orden. Version web, equivalente a src/components/OrdenChat.js de la app
// movil. Mensajes propios al instante (pendiente -> enviado -> visto), con
// "Reintentar" si fallan. El "visto" usa chat_ordenes_lecturas; si la tabla
// no existe solo se ve un check.
export default function OrdenChat({ ordenId, ordenCodigo, tecnicoAsignado, autor, autorRol, orden }) {
  const [mensajes, setMensajes] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [lecturas, setLecturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [menuUbicacionAbierto, setMenuUbicacionAbierto] = useState(false);
  const [menuMsgId, setMenuMsgId] = useState(null);
  const [visor, setVisor] = useState(-1);
  const [nuevos, setNuevos] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [copiado, setCopiado] = useState("");
  const [obteniendoUbicacion, setObteniendoUbicacion] = useState(false);
  const [selectorMapaAbierto, setSelectorMapaAbierto] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const cercaRef = useRef(true);
  const autorRef = useRef(autor);
  autorRef.current = autor;
  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const pinRef = useRef(UBICACION_DEFAULT);

  const esTecnico = sinTildes(autorRol) === "tecnico";
  const rapidas = esTecnico ? RAPIDAS_TECNICO : RAPIDAS_OFICINA;

  // Boton 🚨 Urgente (igual que la app): solo si las alertas estan activas
  // (alertas_whatsapp_config). Oficina -> WhatsApp + alarma al tecnico;
  // tecnico -> WhatsApp a la oficina. El envio lo hace el servidor.
  const [alertasActivas, setAlertasActivas] = useState(false);
  useEffect(() => {
    supabase.from("alertas_whatsapp_config").select("activo").eq("id", 1).maybeSingle()
      .then(({ data, error }) => setAlertasActivas(!error && !!data?.activo), () => setAlertasActivas(false));
  }, []);

  const registrarLectura = () => {
    marcarChatOrdenVisto(ordenId);
    if (!autorRef.current || !ordenId) return;
    supabase
      .from("chat_ordenes_lecturas")
      .upsert({ orden_id: ordenId, usuario: autorRef.current, visto_at: new Date().toISOString() }, { onConflict: "orden_id,usuario" })
      .then(() => {}, () => {});
  };

  useEffect(() => {
    if (!ordenId) { setCargando(false); return undefined; }
    let cancelado = false;
    cercaRef.current = true;
    setNuevos(0);
    setPendientes([]);
    (async () => {
      const { data } = await supabase
        .from("chat_ordenes_mensajes")
        .select("*")
        .eq("orden_id", ordenId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelado) { setMensajes(data || []); setCargando(false); registrarLectura(); }
      const lect = await supabase.from("chat_ordenes_lecturas").select("usuario,visto_at").eq("orden_id", ordenId);
      if (!cancelado && !lect.error) setLecturas(lect.data || []);
    })();
    const channel = supabase
      .channel(`chat-orden-${ordenId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_ordenes_mensajes", filter: `orden_id=eq.${ordenId}` }, (payload) => {
        setMensajes((prev) => prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        if (norm(payload.new.autor) !== norm(autorRef.current) && !cercaRef.current) setNuevos((n) => n + 1);
        registrarLectura();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_ordenes_mensajes", filter: `orden_id=eq.${ordenId}` }, (payload) => {
        setMensajes((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();
    // Canal aparte: si la tabla de lecturas no existe no debe tumbar el chat.
    const canalLect = supabase
      .channel(`chat-orden-lect-${ordenId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_ordenes_lecturas", filter: `orden_id=eq.${ordenId}` }, (payload) => {
        const l = payload.new;
        if (!l?.usuario) return;
        setLecturas((prev) => [...prev.filter((x) => norm(x.usuario) !== norm(l.usuario)), { usuario: l.usuario, visto_at: l.visto_at }]);
      })
      .subscribe();
    return () => { cancelado = true; supabase.removeChannel(channel); supabase.removeChannel(canalLect); };
  }, [ordenId]);

  const items = useMemo(() => [
    ...mensajes,
    ...pendientes.map((p) => ({ id: p.tempId, texto: p.texto, foto_url: p.fotoUrl || p.fotoPreview, autor, autor_rol: autorRol, urgente: p.urgente, created_at: p.created_at, pend: p })),
  ], [mensajes, pendientes, autor, autorRol]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && cercaRef.current) el.scrollTop = el.scrollHeight;
  }, [items, cargando]);

  // Textarea que crece hasta 4 lineas.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
  }, [texto]);

  // Visor: flechas del teclado y Escape.
  useEffect(() => {
    if (visor < 0) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setVisor(-1);
      if (e.key === "ArrowRight") setVisor((v) => Math.min(v + 1, fotos.length - 1));
      if (e.key === "ArrowLeft") setVisor((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Inicializa el mini-mapa (Leaflet) solo cuando se abre el selector manual.
  useEffect(() => {
    if (!selectorMapaAbierto || !mapDivRef.current || mapRef.current) return undefined;
    const centro = pinRef.current;
    const map = L.map(mapDivRef.current).setView([centro.lat, centro.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
    const marker = L.marker([centro.lat, centro.lng], { draggable: true }).addTo(map);
    marker.on("dragend", () => { const p = marker.getLatLng(); pinRef.current = { lat: p.lat, lng: p.lng }; });
    map.on("click", (e) => { marker.setLatLng(e.latlng); pinRef.current = { lat: e.latlng.lat, lng: e.latlng.lng }; });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    return () => { map.remove(); mapRef.current = null; };
  }, [selectorMapaAbierto]);

  // El push de "Mensaje en orden" lo dispara un Database Webhook de
  // Supabase sobre esta misma tabla -- aca solo se inserta.
  const subirArchivo = async (file) => {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const ext = (String(file.name || "").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `chat_ordenes/${ordenId}/${ymd}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("liquidaciones").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("liquidaciones").getPublicUrl(path);
    const url = String(data?.publicUrl || "");
    if (!url) throw new Error("Sin URL publica");
    return url;
  };
  const actualizarPend = (id, cambios) => setPendientes((prev) => prev.map((x) => (x.tempId === id ? { ...x, ...cambios } : x)));
  const procesarPendiente = async (p) => {
    actualizarPend(p.tempId, { estado: "enviando" });
    let fotoUrl = p.fotoUrl || "";
    try {
      if (p.archivo && !fotoUrl) fotoUrl = await subirArchivo(p.archivo);
      const { data, error } = await supabase
        .from("chat_ordenes_mensajes")
        .insert([{ orden_id: ordenId, texto: p.texto || null, foto_url: fotoUrl || null, autor: autor || "—", autor_rol: autorRol || null, ...(p.urgente ? { urgente: true } : {}) }])
        .select("*")
        .single();
      if (error || !data) throw error || new Error("Sin respuesta");
      setPendientes((prev) => prev.filter((x) => x.tempId !== p.tempId));
      setMensajes((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      void notificarMensajeChat(supabase, {
        ordenId, ordenCodigo: ordenCodigo || orden?.codigo, tecnicoOrden: tecnicoAsignado || orden?.tecnico,
        autor, autorRol, texto: data.texto, fotoUrl: data.foto_url, urgente: !!data.urgente,
      });
    } catch {
      actualizarPend(p.tempId, { estado: "error", fotoUrl });
    }
  };
  const encolar = ({ texto: t = "", archivo = null, urgente = false }) => {
    const p = {
      tempId: `t${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      texto: t, archivo, fotoPreview: archivo ? URL.createObjectURL(archivo) : "", fotoUrl: "", urgente,
      estado: "enviando", created_at: new Date().toISOString(),
    };
    cercaRef.current = true;
    setNuevos(0);
    setPendientes((prev) => [...prev, p]);
    void procesarPendiente(p);
  };
  const enviarTexto = () => {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    encolar({ texto: t });
  };
  // Maximo un urgente por chat cada 10 minutos (por persona).
  const ultimoUrgenteMio = [...items].reverse().find((m) => m.urgente && norm(m.autor) === norm(autor) && m.pend?.estado !== "error");
  const minDesdeUrgente = ultimoUrgenteMio ? (Date.now() - new Date(ultimoUrgenteMio.created_at).getTime()) / 60000 : Infinity;
  const urgenteBloqueado = minDesdeUrgente < 10;
  const enviarUrgente = () => {
    const t = texto.trim();
    if (!t) return alert("🚨 Urgente: primero escribe qué pasa y luego aprieta 🚨.");
    if (urgenteBloqueado) return alert(`Ya mandaste un urgente en este chat hace ${Math.max(1, Math.floor(minDesdeUrgente))} min. Podrás mandar otro en ${Math.ceil(10 - minDesdeUrgente)} min; mientras tanto envíalo como mensaje normal.`);
    const a = esTecnico ? "a la oficina por WhatsApp" : "al técnico por WhatsApp y con alarma en su app";
    if (!window.confirm(`¿Mandar como URGENTE? 🚨\n\n"${t}"\n\nLlega al instante ${a}. Úsalo solo si necesitas respuesta ya.`)) return;
    setTexto("");
    encolar({ texto: t, urgente: true });
  };
  const encolarArchivos = (files) => {
    Array.from(files || []).filter((f) => String(f.type || "").startsWith("image/")).forEach((f) => encolar({ archivo: f }));
  };

  const borrarMensaje = async (id) => {
    setMenuMsgId(null);
    if (!window.confirm("¿Eliminar este mensaje para todos?")) return;
    const { error } = await supabase.from("chat_ordenes_mensajes").delete().eq("id", id);
    if (!error) setMensajes((prev) => prev.filter((m) => m.id !== id));
  };
  const copiar = async (valor, etiqueta) => {
    setMenuMsgId(null);
    try { await navigator.clipboard.writeText(valor); setCopiado(etiqueta); setTimeout(() => setCopiado(""), 1500); } catch { /* sin permiso */ }
  };

  const enviarUbicacionActual = () => {
    setMenuUbicacionAbierto(false);
    if (!navigator.geolocation) return alert("Este navegador no soporta geolocalización.");
    setObteniendoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObteniendoUbicacion(false);
        encolar({ texto: `📍 Ubicación actual\nhttps://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}` });
      },
      (err) => { setObteniendoUbicacion(false); alert("No se pudo obtener la ubicación: " + err.message); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  const abrirSelectorMapa = () => {
    setMenuUbicacionAbierto(false);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { pinRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setSelectorMapaAbierto(true); },
        () => setSelectorMapaAbierto(true),
        { timeout: 5000 }
      );
    } else {
      setSelectorMapaAbierto(true);
    }
  };
  const confirmarUbicacionManual = () => {
    const { lat, lng } = pinRef.current;
    setSelectorMapaAbierto(false);
    encolar({ texto: `📍 Ubicación compartida\nhttps://www.google.com/maps?q=${lat},${lng}` });
  };

  const fotos = useMemo(() => mensajes.filter((m) => m.foto_url), [mensajes]);
  const vistoPor = (m) =>
    lecturas
      .filter((l) => norm(l.usuario) !== norm(autor) && new Date(l.visto_at) >= new Date(m.created_at))
      .map((l) => l.usuario);
  // Celulares guardados como 51XXXXXXXXX (sin +) no marcan bien desde Peru: se pasa a +51.
  const telCliente = (() => {
    const t = String(orden?.celular || "").replace(/[^\d+]/g, "");
    return /^51\d{9}$/.test(t) ? `+${t}` : t;
  })();
  const destinoCliente = String(orden?.ubicacion || "").trim() || String(orden?.direccion || "").trim();

  if (!ordenId) return null;

  const renderMensaje = (m, i) => {
    const esMio = norm(m.autor) === norm(autor);
    const prev = items[i - 1];
    const mismoAutorQuePrev = prev && norm(prev.autor) === norm(m.autor);
    const mismoDiaQuePrev = prev && new Date(prev.created_at).toDateString() === new Date(m.created_at).toDateString();
    const pocoTiempoDesdePrev = prev && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60 * 1000;
    const inicioDeGrupo = !prev || !mismoAutorQuePrev || !mismoDiaQuePrev || !pocoTiempoDesdePrev;
    const mostrarDivisorFecha = !prev || !mismoDiaQuePrev;
    const colorAutor = colorParaAutor(m.autor);
    const rol = rolInfo(m.autor_rol);
    const ubicacion = m.texto ? extraerUbicacionDeTexto(m.texto) : null;
    const pend = m.pend;
    const vistos = esMio && !pend ? vistoPor(m) : [];
    const soloMedia = !!(ubicacion || (m.foto_url && !m.texto));
    const colorHora = esMio ? "rgba(255,255,255,0.8)" : "#94a3b8";
    const menuAbierto = menuMsgId === m.id;
    const IconoEstado = pend ? (pend.estado === "error" ? CircleAlert : Clock) : vistos.length ? CheckCheck : Check;
    const pie = (
      <span title={esMio && !pend ? (vistos.length ? `Visto por ${vistos.join(", ")}` : "Enviado") : undefined}
        style={{
          display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, lineHeight: 1,
          ...(soloMedia
            ? { position: "absolute", right: 10, bottom: ubicacion ? 40 : 10, background: "rgba(15,23,42,0.55)", color: "#fff", borderRadius: 999, padding: "3px 6px" }
            : { float: "right", margin: "6px 0 -2px 10px", color: colorHora }),
        }}>
        {pend ? "" : horaDe(m.created_at)}
        {esMio && <IconoEstado size={13} color={pend?.estado === "error" ? "#fca5a5" : vistos.length ? "#67e8f9" : soloMedia ? "#fff" : colorHora} />}
      </span>
    );
    return (
      <div key={m.id}>
        {mostrarDivisorFecha && (
          <div style={{ textAlign: "center", margin: "8px 0 6px" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", background: "#e2e8f0", borderRadius: 999, padding: "2px 10px" }}>
              {formatearFechaDivisor(m.created_at)}
            </span>
          </div>
        )}
        <div className="oc-row oc-in" style={{ display: "flex", alignItems: "flex-end", gap: 6, justifyContent: esMio ? "flex-end" : "flex-start", marginTop: inicioDeGrupo ? 8 : 2, position: "relative" }}>
          {!esMio && (
            <div style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: colorAutor, color: "#fff", fontSize: 11, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center", visibility: inicioDeGrupo ? "visible" : "hidden",
            }}>
              {String(m.autor || "?").trim().charAt(0).toUpperCase()}
            </div>
          )}
          {esMio && !pend && (
            <button type="button" className="oc-mas" onClick={() => setMenuMsgId(menuAbierto ? null : m.id)} title="Opciones"
              style={{ ...btnIcono, opacity: menuAbierto ? 1 : undefined }}>
              <EllipsisVertical size={15} color="#94a3b8" />
            </button>
          )}
          <div style={{
            position: "relative", maxWidth: "78%", color: esMio ? "#fff" : "#0f172a",
            background: m.urgente ? (esMio ? "#dc2626" : "#fef2f2") : esMio ? "#2563eb" : "#fff",
            border: m.urgente && !esMio ? "1.5px solid #fca5a5" : esMio ? "none" : "1px solid #e2e8f0", borderRadius: 16, padding: soloMedia ? 4 : "7px 10px 6px",
            borderBottomRightRadius: esMio && inicioDeGrupo ? 4 : 16, borderBottomLeftRadius: !esMio && inicioDeGrupo ? 4 : 16,
            boxShadow: "0 1px 2px rgba(15,23,42,0.06)", opacity: pend?.estado === "error" ? 0.6 : 1,
          }}>
            {!esMio && inicioDeGrupo && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, padding: soloMedia ? "4px 6px 2px" : 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: colorAutor }}>{m.autor}</span>
                {rol && <span style={{ fontSize: 9.5, fontWeight: 800, color: rol.c, background: rol.bg, borderRadius: 999, padding: "1px 6px" }}>{rol.t}</span>}
              </div>
            )}
            {m.urgente && (
              <div style={{ display: "table", fontSize: 10, fontWeight: 900, letterSpacing: "0.03em", color: "#fff", background: esMio ? "rgba(255,255,255,0.22)" : "#dc2626", borderRadius: 999, padding: "2px 8px", marginBottom: 4 }}>
                🚨 URGENTE · aviso por WhatsApp
              </div>
            )}
            {ubicacion ? (
              <a href={ubicacion.url} target="_blank" rel="noreferrer" style={{ display: "block", borderRadius: 12, overflow: "hidden", textDecoration: "none" }}>
                <MiniMapa lat={ubicacion.lat} lng={ubicacion.lng} ancho={230} alto={110} />
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 8px", background: esMio ? "#1d4ed8" : "#f8fafc" }}>
                  <MapPin size={14} color={esMio ? "#fff" : "#2563eb"} />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: esMio ? "#fff" : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ubicacion.titulo}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: esMio ? "#bfdbfe" : "#2563eb" }}>Abrir</span>
                </div>
              </a>
            ) : (
              m.texto && <span style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.4, wordBreak: "break-word" }}>{m.texto}</span>
            )}
            {m.foto_url && (
              <div style={{ position: "relative", marginTop: m.texto ? 6 : 0 }}>
                <img src={m.foto_url} alt="Foto" onClick={() => { if (pend) return; const k = fotos.findIndex((f) => f.id === m.id); if (k >= 0) setVisor(k); }}
                  style={{ width: 230, height: 184, objectFit: "cover", borderRadius: 12, display: "block", cursor: pend ? "default" : "zoom-in", background: "#cbd5e1" }} />
                {pend?.estado === "enviando" && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 12, background: "rgba(15,23,42,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, gap: 6 }}>
                    <span className="oc-spin" />Subiendo…
                  </div>
                )}
              </div>
            )}
            {pie}
          </div>
          {!esMio && (
            <button type="button" className="oc-mas" onClick={() => setMenuMsgId(menuAbierto ? null : m.id)} title="Opciones"
              style={{ ...btnIcono, opacity: menuAbierto ? 1 : undefined }}>
              <EllipsisVertical size={15} color="#94a3b8" />
            </button>
          )}
          {menuAbierto && (
            <>
              <div onClick={() => setMenuMsgId(null)} style={{ position: "fixed", inset: 0, zIndex: 9997 }} />
              <div style={{ ...menuCaja, bottom: "100%", [esMio ? "right" : "left"]: esMio ? 0 : 30 }}>
                {esMio && (
                  <div style={{ padding: "7px 12px", fontSize: 11, color: "#64748b", borderBottom: "1px solid #f1f5f9" }}>
                    {vistos.length ? <>Visto por <b>{vistos.join(", ")}</b></> : "Aún no lo ve nadie"}
                  </div>
                )}
                {m.texto && !ubicacion && <button type="button" style={menuItem} onClick={() => copiar(m.texto, "Texto copiado")}><Copy size={14} /> Copiar texto</button>}
                {ubicacion && <button type="button" style={menuItem} onClick={() => { setMenuMsgId(null); window.open(ubicacion.url, "_blank"); }}><ExternalLink size={14} /> Abrir en Maps</button>}
                {ubicacion && <button type="button" style={menuItem} onClick={() => copiar(ubicacion.url, "Enlace copiado")}><Copy size={14} /> Copiar enlace</button>}
                {m.foto_url && <button type="button" style={menuItem} onClick={() => { setMenuMsgId(null); const k = fotos.findIndex((f) => f.id === m.id); if (k >= 0) setVisor(k); }}><Camera size={14} /> Ver foto</button>}
                {esMio && <button type="button" style={{ ...menuItem, color: "#dc2626" }} onClick={() => void borrarMensaje(m.id)}><Trash2 size={14} /> Borrar para todos</button>}
              </div>
            </>
          )}
        </div>
        {pend?.estado === "error" && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 3, fontSize: 11.5 }}>
            <span style={{ color: "#dc2626", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}><CircleAlert size={13} /> No se envió</span>
            <button type="button" onClick={() => void procesarPendiente(pend)} style={linkBtn}>Reintentar</button>
            <button type="button" onClick={() => setPendientes((p) => p.filter((x) => x.tempId !== pend.tempId))} style={{ ...linkBtn, color: "#64748b" }}>Descartar</button>
          </div>
        )}
      </div>
    );
  };

  const fotoVisor = visor >= 0 ? fotos[visor] : null;
  const chipsRapidas = (wrap) => (
    <div style={{ display: "flex", gap: 6, flexWrap: wrap ? "wrap" : "nowrap", justifyContent: wrap ? "center" : "flex-start", overflowX: wrap ? "visible" : "auto" }} className="oc-noscroll">
      {rapidas.map((r) => (
        <button key={r} type="button" className="oc-chip" onClick={() => encolar({ texto: r })}
          style={{ flexShrink: 0, background: "#fff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          {r}
        </button>
      ))}
    </div>
  );

  return (
    <div
      style={{ border: `1px solid ${arrastrando ? "#3b82f6" : "#e2e8f0"}`, borderRadius: 14, background: "#f1f5f9", marginTop: 16, overflow: "hidden", position: "relative" }}
      onDragOver={(e) => { if (Array.from(e.dataTransfer?.types || []).includes("Files")) { e.preventDefault(); setArrastrando(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false); }}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); encolarArchivos(e.dataTransfer?.files); }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <MessagesSquare size={14} color="#64748b" />
        <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Chat de la orden</span>
        <span style={{ flex: 1 }} />
        {telCliente && (
          <a href={`tel:${telCliente}`} title={`Llamar al cliente (${telCliente})`} style={{ ...accionCab, color: "#16a34a" }}>
            <Phone size={13} /> Llamar
          </a>
        )}
        {destinoCliente && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinoCliente)}`} target="_blank" rel="noreferrer" title="Ver la ubicación del cliente" style={{ ...accionCab, color: "#2563eb" }}>
            <Navigation size={13} /> Maps
          </a>
        )}
      </div>

      {cargando ? (
        <div style={{ textAlign: "center", padding: "18px 0", fontSize: 12, color: "#94a3b8" }}>Cargando…</div>
      ) : items.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 14px", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
            <MessagesSquare size={24} color="#2563eb" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Aún no hay mensajes</div>
          <div style={{ fontSize: 12, color: "#64748b", margin: "2px 0 10px" }}>Escribe, manda una foto (o arrástrala aquí) o usa una respuesta rápida:</div>
          {chipsRapidas(true)}
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const cerca = el.scrollHeight - (el.scrollTop + el.clientHeight) < 80;
              cercaRef.current = cerca;
              if (cerca && nuevos) setNuevos(0);
            }}
            style={{ maxHeight: 340, overflowY: "auto", padding: "8px 10px" }}
          >
            {items.map(renderMensaje)}
          </div>
          {nuevos > 0 && (
            <button type="button" onClick={() => { cercaRef.current = true; setNuevos(0); const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }}
              style={{ position: "absolute", right: 10, bottom: 10, display: "inline-flex", alignItems: "center", gap: 4, background: "#2563eb", color: "#fff", border: "none", borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 12px rgba(37,99,235,0.35)" }}>
              <ArrowDown size={14} /> {nuevos} nuevo{nuevos === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}

      {!cargando && items.length > 0 && !texto && (
        <div style={{ padding: "6px 10px", borderTop: "1px solid #e2e8f0" }}>{chipsRapidas(false)}</div>
      )}

      <style>{`
        .oc-row .oc-mas { opacity: 0; transition: opacity .12s; }
        .oc-row:hover .oc-mas { opacity: 1; }
        @media (hover: none) { .oc-row .oc-mas { opacity: 1; } }
        @keyframes ocIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .oc-in { animation: ocIn .18s ease-out; }
        .oc-chip:hover { background: #eff6ff !important; }
        .oc-ic:hover { background: #e2e8f0 !important; }
        .oc-noscroll { scrollbar-width: none; }
        .oc-noscroll::-webkit-scrollbar { display: none; }
        @keyframes ocSpin { to { transform: rotate(360deg); } }
        .oc-spin { width: 20px; height: 20px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,.35); border-top-color: #fff; animation: ocSpin .8s linear infinite; }
      `}</style>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, padding: 8, background: "#fff", borderTop: "1px solid #e2e8f0", position: "relative" }}>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={(e) => { const fs = e.target.files; encolarArchivos(fs); e.target.value = ""; }} />
        <button type="button" className="oc-ic" onClick={() => fileInputRef.current?.click()} title="Mandar foto (también puedes pegarla o arrastrarla)" style={icBtn}>
          <Camera size={19} color="#475569" />
        </button>
        <div style={{ position: "relative" }}>
          <button type="button" className="oc-ic" onClick={() => setMenuUbicacionAbierto((v) => !v)} disabled={obteniendoUbicacion} title="Compartir ubicación" style={icBtn}>
            {obteniendoUbicacion ? <span className="oc-spin" style={{ width: 16, height: 16, borderColor: "#cbd5e1", borderTopColor: "#475569" }} /> : <MapPin size={19} color="#475569" />}
          </button>
          {menuUbicacionAbierto && (
            <>
              <div onClick={() => setMenuUbicacionAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 9997 }} />
              <div style={{ ...menuCaja, bottom: "100%", left: 0, marginBottom: 6, minWidth: 210 }}>
                <button type="button" style={menuItem} onClick={enviarUbicacionActual}><LocateFixed size={15} /> Mi ubicación actual</button>
                <button type="button" style={menuItem} onClick={abrirSelectorMapa}><MapIcon size={15} /> Elegir en el mapa</button>
              </div>
            </>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarTexto(); } }}
          onPaste={(e) => {
            const fs = Array.from(e.clipboardData?.files || []).filter((f) => String(f.type || "").startsWith("image/"));
            if (fs.length) { e.preventDefault(); encolarArchivos(fs); }
          }}
          placeholder="Escribe un mensaje…"
          rows={1}
          style={{ flex: 1, padding: "9px 14px", border: "none", background: "#f1f5f9", borderRadius: 20, fontSize: 13.5, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: "18px", minHeight: 36, maxHeight: 96, boxSizing: "border-box" }}
        />
        {alertasActivas && (
          <button type="button" onClick={enviarUrgente}
            title={esTecnico ? "Mandar URGENTE (WhatsApp a la oficina)" : "Mandar URGENTE (WhatsApp + alarma al técnico)"}
            style={{ ...icBtn, background: texto.trim() && !urgenteBloqueado ? "#fee2e2" : "#f1f5f9", border: `1px solid ${texto.trim() && !urgenteBloqueado ? "#fca5a5" : "#e2e8f0"}`, fontSize: 16, opacity: texto.trim() && !urgenteBloqueado ? 1 : 0.5, cursor: "pointer" }}>
            🚨
          </button>
        )}
        <button type="button" onClick={enviarTexto} disabled={!texto.trim()} title="Enviar (Enter)"
          style={{ ...icBtn, background: texto.trim() ? "#2563eb" : "#cbd5e1", cursor: texto.trim() ? "pointer" : "default" }}>
          <Send size={16} color="#fff" style={{ marginLeft: -1 }} />
        </button>
      </div>

      {arrastrando && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(37,99,235,0.08)", border: "2px dashed #3b82f6", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", fontSize: 13, fontWeight: 800, color: "#1d4ed8" }}>
          Suelta la foto para enviarla
        </div>
      )}
      {copiado && (
        <div style={{ position: "absolute", left: "50%", bottom: 60, transform: "translateX(-50%)", background: "#0f172a", color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999 }}>
          {copiado}
        </div>
      )}

      {/* ── Visor de fotos del chat ── */}
      {fotoVisor && (
        <div onClick={() => setVisor(-1)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", zIndex: 99999, display: "flex", flexDirection: "column" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", padding: "14px 18px", color: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: colorParaAutor(fotoVisor.autor), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
                {String(fotoVisor.autor || "?").trim().charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{fotoVisor.autor}</div>
                <div style={{ fontSize: 11.5, color: "#94a3b8" }}>{formatearFechaDivisor(fotoVisor.created_at)} · {horaDe(fotoVisor.created_at)}</div>
              </div>
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Foto {visor + 1} de {fotos.length}</span>
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <a href={fotoVisor.foto_url} target="_blank" rel="noreferrer" title="Abrir original" style={visorBtn}><ExternalLink size={18} /></a>
              <button type="button" onClick={() => setVisor(-1)} title="Cerrar (Esc)" style={visorBtn}><X size={20} /></button>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0 }}>
            <img src={fotoVisor.foto_url} alt="Foto" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "88vw", maxHeight: "100%", borderRadius: 8, objectFit: "contain" }} />
            {visor > 0 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setVisor(visor - 1); }} title="Anterior (←)" style={{ ...visorBtn, position: "absolute", left: 18, width: 46, height: 46 }}><ChevronLeft size={26} /></button>
            )}
            {visor < fotos.length - 1 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setVisor(visor + 1); }} title="Siguiente (→)" style={{ ...visorBtn, position: "absolute", right: 18, width: 46, height: 46 }}><ChevronRight size={26} /></button>
            )}
          </div>
          <div style={{ height: 24 }} />
        </div>
      )}

      {/* ── Selector manual de ubicacion (mapa con pin movible) ── */}
      {selectorMapaAbierto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,26,0.5)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "min(600px, 100%)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Elegir ubicación</span>
              <button type="button" onClick={() => setSelectorMapaAbierto(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex" }}><X size={18} /></button>
            </div>
            <div ref={mapDivRef} style={{ height: 360, width: "100%" }} />
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, textAlign: "center" }}>Haz clic en el mapa o arrastra el pin para ajustar</div>
              <button type="button" onClick={confirmarUbicacionManual} style={{ width: "100%", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>
                Enviar esta ubicación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const icBtn = { width: 36, height: 36, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const btnIcono = { background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignSelf: "center" };
const accionCab = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 999, background: "#f8fafc", border: "1px solid #e2e8f0", textDecoration: "none" };
const menuCaja = { position: "absolute", marginBottom: 4, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 10px 24px rgba(15,23,42,0.16)", zIndex: 9998, overflow: "hidden", minWidth: 190 };
const menuItem = { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "#0f172a" };
const linkBtn = { background: "none", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 800, color: "#2563eb", padding: 0 };
const visorBtn = { width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
