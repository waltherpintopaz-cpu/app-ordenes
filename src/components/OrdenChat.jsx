import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MessagesSquare, Phone, Navigation, Camera, MapPin, Send, Check, CheckCheck, Clock, CircleAlert,
  ArrowDown, Copy, Trash2, X, ChevronLeft, ChevronRight, LocateFixed, Map as MapIcon, EllipsisVertical, ExternalLink,
  Reply, Pencil, Search, Images, Smile, Download, ChevronUp, ChevronDown, ZoomIn,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { marcarChatOrdenVisto, getUltimoVisto } from "../services/chatOrdenesUnread";
import { marcarChatTecnicoVisto, getUltimoVistoTecnico } from "../services/chatTecnicosUnread";
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

// Texto corto de un mensaje para la cita / barra "Respondiendo a".
function resumenMensaje(m) {
  if (!m) return "";
  if (m.texto && extraerUbicacionDeTexto(m.texto)) return "📍 Ubicación";
  if (m.texto) return String(m.texto).split("\n")[0];
  if (m.foto_url) return "📷 Foto";
  return "";
}
// Enlaces y celulares clicables dentro del texto (igual que la app).
const RE_TOKENS = /(https?:\/\/[^\s]+)|((?:\+?51[\s-]?)?9\d{2}[\s-]?\d{3}[\s-]?\d{3})(?!\d)/g;
function TextoConEnlaces({ texto, colorEnlace }) {
  const s = String(texto || "");
  const partes = [];
  let ultimo = 0;
  let m;
  RE_TOKENS.lastIndex = 0;
  while ((m = RE_TOKENS.exec(s))) {
    if (m.index > ultimo) partes.push({ t: s.slice(ultimo, m.index) });
    if (m[1]) partes.push({ t: m[1], href: m[1].replace(/[),.;]+$/, "") });
    else { const tel = m[2].replace(/[\s-]/g, ""); partes.push({ t: m[2], href: `tel:${/^9\d{8}$/.test(tel) ? `+51${tel}` : tel}`, tel: true }); }
    ultimo = m.index + m[0].length;
  }
  if (ultimo < s.length) partes.push({ t: s.slice(ultimo) });
  return partes.map((p, i) => (p.href
    ? <a key={i} href={p.href} target={p.tel ? undefined : "_blank"} rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: colorEnlace, textDecoration: "underline", fontWeight: 600 }}>{p.tel ? "📞 " : ""}{p.t}</a>
    : <span key={i}>{p.t}</span>));
}
const REACCIONES = ["👍", "✅", "❤️", "😂", "😮", "🙏"];
const EMOJIS = ["👍", "👌", "✅", "🙏", "👏", "💪", "🙌", "😊", "😂", "😅", "😉", "😎", "🤔", "😮", "😢", "😡", "❤️", "🔥", "⚠️", "❌",
  "⏰", "🕐", "📍", "📷", "📞", "🛵", "🚗", "🏠", "🔧", "🛠️", "📶", "📡", "🔌", "💡", "📦", "🧾", "💵", "✍️", "👀", "🎉"];
// Fotos seguidas (4 o mas, sin texto ni cita, mismo autor, < 5 min) van en
// un mosaico 2x2 como WhatsApp (igual que la app).
function agruparFotos(items) {
  const grupos = new Map();
  const ocultos = new Set();
  const esFotoSola = (m) => m && m.foto_url && !m.texto && m.responde_a == null && !m.pend && !m.urgente;
  let i = 0;
  while (i < items.length) {
    if (!esFotoSola(items[i])) { i += 1; continue; }
    let j = i + 1;
    while (j < items.length && esFotoSola(items[j]) && norm(items[j].autor) === norm(items[i].autor)
      && new Date(items[j].created_at) - new Date(items[j - 1].created_at) < 5 * 60 * 1000) j += 1;
    if (j - i >= 4) {
      const lista = items.slice(i, j);
      grupos.set(String(items[i].id), lista);
      lista.slice(1).forEach((x) => ocultos.add(String(x.id)));
    }
    i = j;
  }
  return { grupos, ocultos };
}

const RAPIDAS_TECNICO = ["Ya llegué 👍", "El cliente no está", "Falta material", "¿Me pasan la ubicación exacta?", "Terminé, voy a liquidar"];
const RAPIDAS_OFICINA = ["¿Cómo vas?", "El cliente confirmó", "Llama al cliente, por favor", "Te paso la ubicación", "Ok, gracias 👍"];
// Chat directo tecnico <-> oficina (no atado a una orden).
const RAPIDAS_HILO_TECNICO = ["Voy en camino 🛵", "Falta material", "Necesito ayuda", "Ok, entendido 👍", "Terminé por hoy"];
const RAPIDAS_HILO_OFICINA = ["¿Dónde estás?", "Llama a la oficina, por favor", "Pasa por almacén", "Te asigné una orden nueva", "Ok, gracias 👍"];

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
// Con "hiloTecnico" (nombre del tecnico) el mismo componente sirve para el
// chat directo tecnico <-> oficina (tabla chat_tecnicos_mensajes), igual que
// en la app. Con "llenar" ocupa todo el alto de su contenedor (pagina Chats).
export default function OrdenChat({ ordenId, ordenCodigo, tecnicoAsignado, autor, autorRol, orden, hiloTecnico, llenar = false }) {
  const esHilo = !!hiloTecnico;
  const TABLA = esHilo ? "chat_tecnicos_mensajes" : "chat_ordenes_mensajes";
  const COL = esHilo ? "tecnico_nombre" : "orden_id";
  const claveId = esHilo ? hiloTecnico : ordenId;
  const nombreChat = esHilo ? "Chat con oficina" : "Chat de la orden";
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
  const [respondiendo, setRespondiendo] = useState(null);
  const [editando, setEditando] = useState(null);
  const [resaltado, setResaltado] = useState(null);
  const sinRespondeARef = useRef(false);
  const [escribiendo, setEscribiendo] = useState(null); // { autor, hasta }
  const canalTypingRef = useRef(null);
  const ultimoTypingRef = useRef(0);
  const [prevArchivos, setPrevArchivos] = useState([]); // fotos antes de mandar
  const [prevIdx, setPrevIdx] = useState(0);
  const [leyenda, setLeyenda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [busqIdx, setBusqIdx] = useState(0);
  const [galeria, setGaleria] = useState(false);
  const [emojiAbierto, setEmojiAbierto] = useState(false);
  const [zoomVisor, setZoomVisor] = useState(null); // { x, y } en % o null
  // "N mensajes no leidos": lo que ya habia visto al abrir el chat.
  const [vistoAlAbrir, setVistoAlAbrir] = useState(null);
  const divisorRef = useRef(null);
  const primeraCargaRef = useRef(true);
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
  const rapidas = esHilo ? (esTecnico ? RAPIDAS_HILO_TECNICO : RAPIDAS_HILO_OFICINA) : (esTecnico ? RAPIDAS_TECNICO : RAPIDAS_OFICINA);

  // Boton 🚨 Urgente (igual que la app): solo si las alertas estan activas
  // (alertas_whatsapp_config). Oficina -> WhatsApp + alarma al tecnico;
  // tecnico -> WhatsApp a la oficina. El envio lo hace el servidor.
  const [alertasActivas, setAlertasActivas] = useState(false);
  useEffect(() => {
    supabase.from("alertas_whatsapp_config").select("activo").eq("id", 1).maybeSingle()
      .then(({ data, error }) => setAlertasActivas(!error && !!data?.activo), () => setAlertasActivas(false));
  }, []);

  const registrarLectura = () => {
    if (esHilo) { marcarChatTecnicoVisto(hiloTecnico, autorRef.current); return; }
    marcarChatOrdenVisto(ordenId);
    if (!autorRef.current || !ordenId) return;
    supabase
      .from("chat_ordenes_lecturas")
      .upsert({ orden_id: ordenId, usuario: autorRef.current, visto_at: new Date().toISOString() }, { onConflict: "orden_id,usuario" })
      .then(() => {}, () => {});
  };

  useEffect(() => {
    if (!claveId) { setCargando(false); return undefined; }
    let cancelado = false;
    cercaRef.current = true;
    setNuevos(0);
    setPendientes([]);
    primeraCargaRef.current = true;
    setVistoAlAbrir((esHilo ? getUltimoVistoTecnico(hiloTecnico) : getUltimoVisto(ordenId)) || null);
    (async () => {
      const { data } = await supabase
        .from(TABLA)
        .select("*")
        .eq(COL, claveId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelado) { setMensajes(data || []); setCargando(false); registrarLectura(); }
      if (esHilo) return;
      const lect = await supabase.from("chat_ordenes_lecturas").select("usuario,visto_at").eq("orden_id", ordenId);
      if (!cancelado && !lect.error) setLecturas(lect.data || []);
    })();
    const channel = supabase
      .channel(`chat-${COL}-${claveId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLA, filter: `${COL}=eq.${claveId}` }, (payload) => {
        setMensajes((prev) => prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        setEscribiendo((e) => (e && norm(e.autor) === norm(payload.new.autor) ? null : e));
        if (norm(payload.new.autor) !== norm(autorRef.current) && !cercaRef.current) setNuevos((n) => n + 1);
        registrarLectura();
      })
      // Editados y reacciones.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: TABLA, filter: `${COL}=eq.${claveId}` }, (payload) => {
        const nuevo = payload.new;
        if (nuevo?.id) setMensajes((prev) => prev.map((m) => (m.id === nuevo.id ? { ...m, ...nuevo } : m)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: TABLA, filter: `${COL}=eq.${claveId}` }, (payload) => {
        setMensajes((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();
    // Canal aparte: si la tabla de lecturas no existe no debe tumbar el chat.
    const canalLect = esHilo ? null : supabase
      .channel(`chat-orden-lect-${ordenId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_ordenes_lecturas", filter: `orden_id=eq.${ordenId}` }, (payload) => {
        const l = payload.new;
        if (!l?.usuario) return;
        setLecturas((prev) => [...prev.filter((x) => norm(x.usuario) !== norm(l.usuario)), { usuario: l.usuario, visto_at: l.visto_at }]);
      })
      .subscribe();
    return () => { cancelado = true; supabase.removeChannel(channel); if (canalLect) supabase.removeChannel(canalLect); };
  }, [claveId, TABLA, COL]);

  const items = useMemo(() => [
    ...mensajes,
    ...pendientes.map((p) => ({ id: p.tempId, texto: p.texto, foto_url: p.fotoUrl || p.fotoPreview, autor, autor_rol: autorRol, urgente: p.urgente, responde_a: p.respondeA, created_at: p.created_at, pend: p })),
  ], [mensajes, pendientes, autor, autorRol]);
  const porId = useMemo(() => { const m = new Map(); mensajes.forEach((x) => m.set(String(x.id), x)); return m; }, [mensajes]);

  // Al abrir: si hay no leidos, se queda en el divisor "N mensajes no
  // leidos" (como WhatsApp); si no, al final.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (primeraCargaRef.current && !cargando && items.length) {
      primeraCargaRef.current = false;
      const d = divisorRef.current;
      if (d) { el.scrollTop = Math.max(0, d.offsetTop - 60); cercaRef.current = false; return; }
    }
    if (cercaRef.current) el.scrollTop = el.scrollHeight;
  }, [items, cargando]);

  // Primer mensaje ajeno que no habia visto al abrir el chat.
  const idPrimerNoLeido = useMemo(() => {
    const t = vistoAlAbrir ? new Date(vistoAlAbrir).getTime() : 0;
    const m = mensajes.find((x) => norm(x.autor) !== norm(autor) && new Date(x.created_at).getTime() > t);
    return m ? String(m.id) : null;
  }, [vistoAlAbrir, mensajes.length > 0, autor]); // eslint-disable-line react-hooks/exhaustive-deps
  const cantNoLeidosAlAbrir = useMemo(() => {
    const t = vistoAlAbrir ? new Date(vistoAlAbrir).getTime() : 0;
    return mensajes.filter((x) => norm(x.autor) !== norm(autor) && new Date(x.created_at).getTime() > t).length;
  }, [idPrimerNoLeido]); // eslint-disable-line react-hooks/exhaustive-deps
  const { grupos: gruposFotos, ocultos: fotosOcultas } = useMemo(() => agruparFotos(items), [items]);

  // "Fulano está escribiendo…": aviso efimero por Realtime broadcast, mismo
  // canal que la app movil (se entienden entre si).
  useEffect(() => {
    if (!claveId) return undefined;
    const ch = supabase
      .channel(`typing-${COL}-${claveId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const quien = String(payload?.autor || "").trim();
        if (!quien || norm(quien) === norm(autorRef.current)) return;
        setEscribiendo({ autor: quien, hasta: Date.now() + 4000 });
      })
      .subscribe();
    canalTypingRef.current = ch;
    return () => { canalTypingRef.current = null; supabase.removeChannel(ch); };
  }, [claveId, COL]);
  useEffect(() => {
    if (!escribiendo) return undefined;
    const t = setTimeout(() => setEscribiendo((e) => (e && e.hasta <= Date.now() ? null : e)), Math.max(200, escribiendo.hasta - Date.now()));
    return () => clearTimeout(t);
  }, [escribiendo]);
  const avisarEscribiendo = () => {
    const ahora = Date.now();
    if (ahora - ultimoTypingRef.current < 2500 || !canalTypingRef.current) return;
    ultimoTypingRef.current = ahora;
    void canalTypingRef.current.send({ type: "broadcast", event: "typing", payload: { autor: autorRef.current } });
  };

  // Buscar dentro del chat (de lo mas nuevo a lo mas viejo).
  const coincidencias = useMemo(() => {
    const q = sinTildes(busqueda);
    if (q.length < 2) return [];
    return mensajes.filter((m) => sinTildes(m.texto).includes(q) || sinTildes(m.autor).includes(q)).map((m) => String(m.id)).reverse();
  }, [busqueda, mensajes]);
  useEffect(() => { setBusqIdx(0); }, [busqueda]);

  // Textarea que crece hasta 4 lineas.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
  }, [texto]);

  useEffect(() => { setZoomVisor(null); }, [visor]);
  // Buscar: salta a la coincidencia elegida.
  useEffect(() => {
    if (!buscando || !coincidencias.length) return;
    irAMensaje(coincidencias[Math.min(busqIdx, coincidencias.length - 1)]);
  }, [buscando, coincidencias, busqIdx]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const carpeta = esHilo ? `chat_tecnicos/${encodeURIComponent(hiloTecnico)}` : `chat_ordenes/${ordenId}`;
    const path = `${carpeta}/${ymd}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
      const fila = { [COL]: claveId, texto: p.texto || null, foto_url: fotoUrl || null, autor: autor || "—", autor_rol: autorRol || null, ...(p.urgente ? { urgente: true } : {}) };
      const conCita = p.respondeA && !sinRespondeARef.current;
      let { data, error } = await supabase.from(TABLA).insert([conCita ? { ...fila, responde_a: p.respondeA } : fila]).select("*").single();
      // Base sin la columna responde_a (SQL aun no corrido): se manda sin cita.
      if (error && conCita && /responde_a/i.test(String(error.message || ""))) {
        sinRespondeARef.current = true;
        ({ data, error } = await supabase.from(TABLA).insert([fila]).select("*").single());
      }
      if (error || !data) throw error || new Error("Sin respuesta");
      setPendientes((prev) => prev.filter((x) => x.tempId !== p.tempId));
      setMensajes((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      void notificarMensajeChat(supabase, {
        hiloTecnico, ordenId, ordenCodigo: ordenCodigo || orden?.codigo, tecnicoOrden: tecnicoAsignado || orden?.tecnico,
        autor, autorRol, texto: data.texto, fotoUrl: data.foto_url, urgente: !!data.urgente,
      });
    } catch {
      actualizarPend(p.tempId, { estado: "error", fotoUrl });
    }
  };
  const encolar = ({ texto: t = "", archivo = null, urgente = false, sinCita = false }) => {
    const respondeA = !sinCita && respondiendo?.id && !String(respondiendo.id).startsWith("t") ? respondiendo.id : null;
    if (!sinCita) setRespondiendo(null);
    const p = {
      tempId: `t${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      texto: t, archivo, fotoPreview: archivo ? URL.createObjectURL(archivo) : "", fotoUrl: "", urgente, respondeA,
      estado: "enviando", created_at: new Date().toISOString(),
    };
    cercaRef.current = true;
    setNuevos(0);
    setPendientes((prev) => [...prev, p]);
    void procesarPendiente(p);
  };
  const enviarTexto = () => {
    if (editando) { void guardarEdicion(); return; }
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
    const nuevas = Array.from(files || []).filter((f) => String(f.type || "").startsWith("image/"))
      .map((f) => ({ file: f, url: URL.createObjectURL(f), key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }));
    if (!nuevas.length) return;
    // Vista previa con comentario antes de mandar (como WhatsApp Web).
    setPrevArchivos((prev) => { const t = [...prev, ...nuevas].slice(0, 10); setPrevIdx(Math.min(prev.length, t.length - 1)); return t; });
  };

  const mandarPrevia = () => {
    const lista = prevArchivos;
    const t = leyenda.trim();
    setPrevArchivos([]);
    setLeyenda("");
    setPrevIdx(0);
    lista.forEach((p, i) => encolar({ archivo: p.file, texto: i === 0 ? t : "", sinCita: i > 0 }));
  };
  const cancelarPrevia = () => { prevArchivos.forEach((p) => { try { URL.revokeObjectURL(p.url); } catch { /* nada */ } }); setPrevArchivos([]); setLeyenda(""); setPrevIdx(0); };
  const insertarEmoji = (emo) => {
    const ta = textareaRef.current;
    const ini = ta ? ta.selectionStart : texto.length;
    const fin = ta ? ta.selectionEnd : texto.length;
    const nuevo = texto.slice(0, ini) + emo + texto.slice(fin);
    setTexto(nuevo);
    setTimeout(() => { if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ini + emo.length; } }, 0);
  };

  const borrarMensaje = async (id) => {
    setMenuMsgId(null);
    if (!window.confirm("¿Eliminar este mensaje para todos?")) return;
    const { error } = await supabase.from(TABLA).delete().eq("id", id);
    if (!error) setMensajes((prev) => prev.filter((m) => m.id !== id));
  };
  const copiar = async (valor, etiqueta) => {
    setMenuMsgId(null);
    try { await navigator.clipboard.writeText(valor); setCopiado(etiqueta); setTimeout(() => setCopiado(""), 1500); } catch { /* sin permiso */ }
  };

  const responderA = (m) => {
    setMenuMsgId(null);
    if (!m || m.pend) return;
    setEditando(null);
    setRespondiendo(m);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };
  // Tocar una cita lleva al mensaje original y lo resalta un momento.
  const irAMensaje = (id) => {
    const el = scrollRef.current?.querySelector(`[data-msg="${id}"]`);
    if (!el) return;
    cercaRef.current = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setResaltado(String(id));
    setTimeout(() => setResaltado((r) => (r === String(id) ? null : r)), 1600);
  };
  // Una reaccion por persona; la misma otra vez la quita (como WhatsApp).
  const reaccionar = async (m, emoji) => {
    setMenuMsgId(null);
    if (!m || m.pend) return;
    const yo = autorRef.current;
    const antes = m.reacciones || {};
    const tenia = Object.keys(antes).find((k) => (antes[k] || []).includes(yo));
    const optimista = {};
    Object.entries(antes).forEach(([k, v]) => { const r = (v || []).filter((u) => u !== yo); if (r.length) optimista[k] = r; });
    if (tenia !== emoji) optimista[emoji] = [...(optimista[emoji] || []), yo];
    setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, reacciones: optimista } : x)));
    const { data, error } = await supabase.rpc("chat_reaccionar", { p_tabla: TABLA, p_id: m.id, p_emoji: emoji, p_usuario: yo });
    if (error) {
      setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, reacciones: antes } : x)));
      setCopiado("No se pudo reaccionar"); setTimeout(() => setCopiado(""), 1800);
    } else if (data) {
      setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, reacciones: data } : x)));
    }
  };
  const puedeEditar = (m) => !!m && !m.pend && norm(m.autor) === norm(autor) && !!m.texto && !extraerUbicacionDeTexto(m.texto)
    && Date.now() - new Date(m.created_at).getTime() < 5 * 60 * 1000;
  const empezarEdicion = (m) => {
    setMenuMsgId(null);
    setRespondiendo(null);
    setEditando(m);
    setTexto(m.texto || "");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };
  const cancelarEdicion = () => { setEditando(null); setTexto(""); };
  const guardarEdicion = async () => {
    const m = editando;
    const t = texto.trim();
    if (!m || !t) return;
    setEditando(null);
    setTexto("");
    if (t === String(m.texto || "").trim()) return;
    const anterior = { texto: m.texto, editado_at: m.editado_at };
    setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, texto: t, editado_at: new Date().toISOString() } : x)));
    const { data, error } = await supabase.rpc("chat_editar", { p_tabla: TABLA, p_id: m.id, p_texto: t, p_autor: autorRef.current });
    if (error || data === false) {
      setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...anterior } : x)));
      setCopiado(error ? "No se pudo editar" : "Ya pasaron 5 minutos: no se puede editar"); setTimeout(() => setCopiado(""), 2200);
    }
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

  if (!claveId) return null;

  const renderMensaje = (m, i) => {
    if (fotosOcultas.has(String(m.id))) return null; // va dentro del mosaico del primero
    const grupo = gruposFotos.get(String(m.id));
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
        {pend ? "" : `${m.editado_at ? "editado · " : ""}${horaDe(m.created_at)}`}
        {esMio && <IconoEstado size={13} color={pend?.estado === "error" ? "#fca5a5" : vistos.length ? "#67e8f9" : soloMedia ? "#fff" : colorHora} />}
      </span>
    );
    const citado = m.responde_a != null ? porId.get(String(m.responde_a)) : null;
    const reacs = Object.entries(m.reacciones || {});
    return (
      <div key={m.id} data-msg={m.id} style={{ borderRadius: 12, transition: "background .3s", background: resaltado === String(m.id) ? "rgba(37,99,235,0.14)" : "transparent" }}
        onDoubleClick={() => responderA(m)}>
        {mostrarDivisorFecha && (
          <div style={{ textAlign: "center", margin: "8px 0 6px" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", background: "#e2e8f0", borderRadius: 999, padding: "2px 10px" }}>
              {formatearFechaDivisor(m.created_at)}
            </span>
          </div>
        )}
        {idPrimerNoLeido === String(m.id) && cantNoLeidosAlAbrir > 0 && (
          <div ref={divisorRef} style={{ textAlign: "center", margin: "10px -10px 6px", background: "rgba(124,58,237,0.08)", padding: "4px 0" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#6d28d9", background: "#fff", borderRadius: 999, padding: "2px 12px", boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }}>
              {cantNoLeidosAlAbrir} mensaje{cantNoLeidosAlAbrir === 1 ? "" : "s"} no leído{cantNoLeidosAlAbrir === 1 ? "" : "s"}
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
            <>
              <button type="button" className="oc-mas" onClick={() => setMenuMsgId(menuAbierto ? null : m.id)} title="Opciones (reaccionar, editar, borrar…)"
                style={{ ...btnIcono, opacity: menuAbierto ? 1 : undefined }}>
                <EllipsisVertical size={15} color="#94a3b8" />
              </button>
              <button type="button" className="oc-mas" onClick={() => responderA(m)} title="Responder (o doble clic en el mensaje)" style={btnIcono}>
                <Reply size={15} color="#94a3b8" />
              </button>
            </>
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
            {m.responde_a != null && (
              <div onClick={() => citado && irAMensaje(citado.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: `3.5px solid ${citado ? colorParaAutor(citado.autor) : "#94a3b8"}`, borderRadius: 8, padding: "5px 8px", margin: soloMedia ? "2px 2px 4px" : "0 0 5px", minWidth: 150, cursor: citado ? "pointer" : "default", background: esMio ? "rgba(255,255,255,0.16)" : "#f1f5f9" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: esMio ? "#fff" : citado ? colorParaAutor(citado.autor) : "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {citado ? (norm(citado.autor) === norm(autor) ? "Tú" : citado.autor) : "Mensaje"}
                  </div>
                  <div style={{ fontSize: 12, color: esMio ? "rgba(255,255,255,0.85)" : "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {citado ? resumenMensaje(citado) : "Mensaje eliminado"}
                  </div>
                </div>
                {citado?.foto_url && <img src={citado.foto_url} alt="" style={{ width: 38, height: 38, borderRadius: 6, objectFit: "cover" }} />}
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
            ) : null}
            {grupo ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: 230 }}>
                {grupo.slice(0, 4).map((g, gi) => (
                  <div key={g.id} style={{ position: "relative", height: 113 }}>
                    <img src={g.foto_url} alt="Foto" onClick={() => { const k = fotos.findIndex((f) => f.id === g.id); if (k >= 0) setVisor(k); }}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, display: "block", cursor: "zoom-in", background: "#cbd5e1" }} />
                    {gi === 3 && grupo.length > 4 && (
                      <div onClick={() => { const k = fotos.findIndex((f) => f.id === g.id); if (k >= 0) setVisor(k); }}
                        style={{ position: "absolute", inset: 0, borderRadius: 8, background: "rgba(15,23,42,0.55)", color: "#fff", fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in" }}>
                        +{grupo.length - 4}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : m.foto_url && (
              <div style={{ position: "relative", marginBottom: m.texto ? 5 : 0 }}>
                <img src={m.foto_url} alt="Foto" onClick={() => { if (pend) return; const k = fotos.findIndex((f) => f.id === m.id); if (k >= 0) setVisor(k); }}
                  style={{ width: 230, height: 184, objectFit: "cover", borderRadius: 12, display: "block", cursor: pend ? "default" : "zoom-in", background: "#cbd5e1" }} />
                {pend?.estado === "enviando" && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 12, background: "rgba(15,23,42,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, gap: 6 }}>
                    <span className="oc-spin" />Subiendo…
                  </div>
                )}
              </div>
            )}
            {/* Texto (o comentario de la foto, debajo de ella como en WhatsApp) */}
            {!ubicacion && m.texto && (
              <span style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.4, wordBreak: "break-word" }}>
                <TextoConEnlaces texto={m.texto} colorEnlace={esMio ? "#fff" : "#1d4ed8"} />
              </span>
            )}
            {pie}
          </div>
          {!esMio && !pend && (
            <>
              <button type="button" className="oc-mas" onClick={() => responderA(m)} title="Responder (o doble clic en el mensaje)" style={btnIcono}>
                <Reply size={15} color="#94a3b8" />
              </button>
              <button type="button" className="oc-mas" onClick={() => setMenuMsgId(menuAbierto ? null : m.id)} title="Opciones (reaccionar, copiar…)"
                style={{ ...btnIcono, opacity: menuAbierto ? 1 : undefined }}>
                <EllipsisVertical size={15} color="#94a3b8" />
              </button>
            </>
          )}
          {menuAbierto && (
            <>
              <div onClick={() => setMenuMsgId(null)} style={{ position: "fixed", inset: 0, zIndex: 9997 }} />
              <div style={{ ...menuCaja, bottom: "100%", [esMio ? "right" : "left"]: esMio ? 0 : 30 }}>
                <div style={{ display: "flex", gap: 2, padding: "6px 8px", borderBottom: "1px solid #f1f5f9" }}>
                  {REACCIONES.map((emo) => (
                    <button key={emo} type="button" onClick={() => void reaccionar(m, emo)} className="oc-reac"
                      style={{ fontSize: 19, background: (m.reacciones?.[emo] || []).includes(autor) ? "#dbeafe" : "none", border: "none", borderRadius: 8, cursor: "pointer", padding: "2px 4px" }}>
                      {emo}
                    </button>
                  ))}
                </div>
                <button type="button" style={menuItem} onClick={() => responderA(m)}><Reply size={14} /> Responder</button>
                {puedeEditar(m) && <button type="button" style={menuItem} onClick={() => empezarEdicion(m)}><Pencil size={14} /> Editar</button>}
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
        {reacs.length > 0 && (
          <div title={reacs.map(([emo, q]) => `${emo} ${(q || []).join(", ")}`).join("\n")}
            style={{ display: "flex", justifyContent: esMio ? "flex-end" : "flex-start", margin: esMio ? "-3px 30px 0 0" : "-3px 0 0 38px" }}>
            <div style={{ display: "inline-flex", gap: 4, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 999, padding: "1px 7px", fontSize: 12.5, boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }}>
              {reacs.map(([emo, q]) => (
                <span key={emo} onClick={() => void reaccionar(m, emo)} style={{ cursor: "pointer", fontWeight: 700, color: (q || []).includes(autor) ? "#2563eb" : "#475569" }}>
                  {emo}{(q || []).length > 1 ? ` ${(q || []).length}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}
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
      style={{ border: `1px solid ${arrastrando ? "#3b82f6" : "#e2e8f0"}`, borderRadius: llenar ? 0 : 14, background: "#f1f5f9", marginTop: llenar ? 0 : 16, overflow: "hidden", position: "relative", ...(llenar ? { height: "100%", display: "flex", flexDirection: "column", border: "none" } : {}) }}
      onDragOver={(e) => { if (Array.from(e.dataTransfer?.types || []).includes("Files")) { e.preventDefault(); setArrastrando(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false); }}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); encolarArchivos(e.dataTransfer?.files); }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <MessagesSquare size={14} color="#64748b" />
        <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>{esHilo ? hiloTecnico : nombreChat}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="oc-ic" onClick={() => { setBuscando((b) => !b); setBusqueda(""); }} title="Buscar en el chat" style={{ ...icBtn, width: 28, height: 28 }}><Search size={15} color="#475569" /></button>
        <button type="button" className="oc-ic" onClick={() => setGaleria(true)} title={`Fotos del chat (${fotos.length})`} style={{ ...icBtn, width: 28, height: 28 }}><Images size={15} color="#475569" /></button>
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

      {buscando && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
          <Search size={14} color="#94a3b8" />
          <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en el chat…"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); setBusqIdx((x) => (coincidencias.length ? (x + 1) % coincidencias.length : 0)); }
              if (e.key === "Escape") { setBuscando(false); setBusqueda(""); }
            }}
            style={{ flex: 1, border: "none", outline: "none", fontSize: 13, padding: "5px 2px", fontFamily: "inherit" }} />
          <span style={{ fontSize: 11.5, color: "#64748b", fontWeight: 700, minWidth: 34, textAlign: "right" }}>
            {busqueda.trim().length < 2 ? "" : coincidencias.length ? `${Math.min(busqIdx, coincidencias.length - 1) + 1}/${coincidencias.length}` : "0"}
          </span>
          <button type="button" className="oc-ic" disabled={busqIdx >= coincidencias.length - 1} onClick={() => setBusqIdx((x) => x + 1)} title="Más antiguo" style={{ ...icBtn, width: 26, height: 26 }}><ChevronUp size={16} color="#475569" /></button>
          <button type="button" className="oc-ic" disabled={busqIdx <= 0} onClick={() => setBusqIdx((x) => Math.max(0, x - 1))} title="Más reciente" style={{ ...icBtn, width: 26, height: 26 }}><ChevronDown size={16} color="#475569" /></button>
          <button type="button" className="oc-ic" onClick={() => { setBuscando(false); setBusqueda(""); }} title="Cerrar" style={{ ...icBtn, width: 26, height: 26 }}><X size={15} color="#475569" /></button>
        </div>
      )}

      {cargando ? (
        <div style={{ textAlign: "center", padding: "18px 0", fontSize: 12, color: "#94a3b8", ...(llenar ? { flex: 1 } : {}) }}>Cargando…</div>
      ) : items.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 14px", textAlign: "center", ...(llenar ? { flex: 1, justifyContent: "center" } : {}) }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
            <MessagesSquare size={24} color="#2563eb" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Aún no hay mensajes</div>
          <div style={{ fontSize: 12, color: "#64748b", margin: "2px 0 10px" }}>Escribe, manda una foto (o arrástrala aquí) o usa una respuesta rápida:</div>
          {chipsRapidas(true)}
        </div>
      ) : (
        <div style={{ position: "relative", ...(llenar ? { flex: 1, minHeight: 0 } : {}) }}>
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const cerca = el.scrollHeight - (el.scrollTop + el.clientHeight) < 80;
              cercaRef.current = cerca;
              if (cerca && nuevos) setNuevos(0);
            }}
            style={{ ...(llenar ? { height: "100%" } : { maxHeight: 340 }), overflowY: "auto", padding: "8px 10px" }}
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

      {!cargando && items.length > 0 && !texto && !respondiendo && !editando && (
        <div style={{ padding: "6px 10px", borderTop: "1px solid #e2e8f0" }}>{chipsRapidas(false)}</div>
      )}

      {!!escribiendo && (
        <div style={{ padding: "3px 14px", fontSize: 11.5, color: "#16a34a", fontWeight: 700, fontStyle: "italic", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
          ✍️ {escribiendo.autor} está escribiendo…
        </div>
      )}
      {(editando || respondiendo) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 2px", background: "#fff", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ flex: 1, minWidth: 0, borderLeft: `3.5px solid ${editando ? "#f59e0b" : colorParaAutor(respondiendo.autor)}`, borderRadius: 8, background: "#f1f5f9", padding: "5px 8px" }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: editando ? "#b45309" : colorParaAutor(respondiendo.autor) }}>
              {editando ? "✏️ Editando mensaje" : `Respondiendo a ${norm(respondiendo.autor) === norm(autor) ? "ti" : respondiendo.autor}`}
            </div>
            <div style={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {editando ? editando.texto : resumenMensaje(respondiendo)}
            </div>
          </div>
          {!editando && respondiendo?.foto_url && <img src={respondiendo.foto_url} alt="" style={{ width: 38, height: 38, borderRadius: 6, objectFit: "cover" }} />}
          <button type="button" onClick={() => (editando ? cancelarEdicion() : setRespondiendo(null))} title="Cancelar (Esc)" style={{ ...icBtn, width: 30, height: 30, background: "#f1f5f9" }}>
            <X size={16} color="#64748b" />
          </button>
        </div>
      )}

      <style>{`
        .oc-row .oc-mas { opacity: 0; transition: opacity .12s; }
        .oc-row:hover .oc-mas { opacity: 1; }
        @media (hover: none) { .oc-row .oc-mas { opacity: 1; } }
        @keyframes ocIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .oc-in { animation: ocIn .18s ease-out; }
        .oc-chip:hover { background: #eff6ff !important; }
        .oc-reac:hover { transform: scale(1.2); }
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
        <div style={{ position: "relative" }}>
          <button type="button" className="oc-ic" onClick={() => setEmojiAbierto((v) => !v)} title="Emojis" style={icBtn}>
            <Smile size={19} color="#475569" />
          </button>
          {emojiAbierto && (
            <>
              <div onClick={() => setEmojiAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 9997 }} />
              <div style={{ ...menuCaja, bottom: "100%", left: 0, marginBottom: 6, minWidth: 0, width: 268, padding: 6, display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2 }}>
                {EMOJIS.map((emo) => (
                  <button key={emo} type="button" className="oc-reac" onClick={() => insertarEmoji(emo)}
                    style={{ fontSize: 19, background: "none", border: "none", borderRadius: 6, cursor: "pointer", padding: "3px 0" }}>{emo}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); if (e.target.value.trim()) avisarEscribiendo(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarTexto(); }
            if (e.key === "Escape") { if (editando) cancelarEdicion(); else setRespondiendo(null); }
          }}
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
              <button type="button" onClick={() => { const f = fotoVisor; setVisor(-1); responderA(f); }} title="Responder a esta foto" style={{ ...visorBtn, width: "auto", padding: "0 12px", borderRadius: 999, gap: 6, fontSize: 13, fontWeight: 700 }}><Reply size={16} /> Responder</button>
              <button type="button" onClick={() => setZoomVisor((z) => (z ? null : { x: 50, y: 50 }))} title="Acercar / alejar (o clic en la foto)" style={visorBtn}><ZoomIn size={18} /></button>
              <a href={fotoVisor.foto_url} download target="_blank" rel="noreferrer" title="Descargar" style={visorBtn}><Download size={18} /></a>
              <a href={fotoVisor.foto_url} target="_blank" rel="noreferrer" title="Abrir original" style={visorBtn}><ExternalLink size={18} /></a>
              <button type="button" onClick={() => setVisor(-1)} title="Cerrar (Esc)" style={visorBtn}><X size={20} /></button>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "88vw", maxHeight: "100%", overflow: "hidden", borderRadius: 8, display: "flex" }}>
              <img src={fotoVisor.foto_url} alt="Foto"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setZoomVisor((z) => (z ? null : { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }));
                }}
                onMouseMove={(e) => {
                  if (!zoomVisor) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setZoomVisor({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                }}
                style={{ maxWidth: "88vw", maxHeight: "calc(100vh - 160px)", objectFit: "contain", cursor: zoomVisor ? "zoom-out" : "zoom-in",
                  transform: zoomVisor ? "scale(2.5)" : "none", transformOrigin: zoomVisor ? `${zoomVisor.x}% ${zoomVisor.y}%` : "center", transition: "transform .15s" }} />
            </div>
            {visor > 0 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setVisor(visor - 1); }} title="Anterior (←)" style={{ ...visorBtn, position: "absolute", left: 18, width: 46, height: 46 }}><ChevronLeft size={26} /></button>
            )}
            {visor < fotos.length - 1 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setVisor(visor + 1); }} title="Siguiente (→)" style={{ ...visorBtn, position: "absolute", right: 18, width: 46, height: 46 }}><ChevronRight size={26} /></button>
            )}
          </div>
          {fotoVisor.texto ? (
            <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", color: "#fff", fontSize: 14, padding: "10px 20px 18px", whiteSpace: "pre-wrap" }}>{fotoVisor.texto}</div>
          ) : <div style={{ height: 24 }} />}
        </div>
      )}

      {/* ── Vista previa de fotos antes de mandar (con comentario) ── */}
      {prevArchivos.length > 0 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.92)", zIndex: 99999, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", color: "#fff", gap: 10 }}>
            <button type="button" onClick={cancelarPrevia} title="Cancelar (Esc)" style={visorBtn}><X size={20} /></button>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{prevArchivos.length === 1 ? "Mandar foto" : `Mandar ${prevArchivos.length} fotos`}</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
            <img src={prevArchivos[Math.min(prevIdx, prevArchivos.length - 1)]?.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "12px 0", flexWrap: "wrap" }}>
            {prevArchivos.map((p, i) => (
              <div key={p.key} style={{ position: "relative" }}>
                <img src={p.url} alt="" onClick={() => setPrevIdx(i)} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, cursor: "pointer", border: i === prevIdx ? "2.5px solid #60a5fa" : "2.5px solid transparent" }} />
                {prevArchivos.length > 1 && (
                  <button type="button" onClick={() => { setPrevArchivos((l) => l.filter((x) => x.key !== p.key)); setPrevIdx(0); }} title="Quitar"
                    style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}><X size={12} /></button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => fileInputRef.current?.click()} title="Agregar más" style={{ width: 56, height: 56, borderRadius: 8, border: "2px dashed #64748b", background: "transparent", color: "#cbd5e1", fontSize: 24, cursor: "pointer" }}>+</button>
          </div>
          {respondiendo && <div style={{ textAlign: "center", color: "#bfdbfe", fontSize: 12, paddingBottom: 6 }}>↩ Respondiendo a {respondiendo.autor}: {resumenMensaje(respondiendo)}</div>}
          <div style={{ display: "flex", gap: 8, padding: "0 18px 18px", maxWidth: 720, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <input autoFocus value={leyenda} onChange={(e) => setLeyenda(e.target.value)} placeholder="Añade un comentario…"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); mandarPrevia(); } if (e.key === "Escape") cancelarPrevia(); }}
              style={{ flex: 1, padding: "11px 16px", borderRadius: 999, border: "none", outline: "none", fontSize: 14, background: "#1e293b", color: "#fff", fontFamily: "inherit" }} />
            <button type="button" onClick={mandarPrevia} title="Enviar (Enter)" style={{ width: 46, height: 46, borderRadius: "50%", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Send size={18} /></button>
          </div>
        </div>
      )}

      {/* ── Galeria: todas las fotos del chat ── */}
      {galeria && (
        <div onClick={() => setGaleria(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,10,26,0.55)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "min(760px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Fotos del chat ({fotos.length})</span>
              <button type="button" onClick={() => setGaleria(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex" }}><X size={18} /></button>
            </div>
            {fotos.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Aún no hay fotos en este chat</div>
            ) : (
              <div style={{ overflowY: "auto", padding: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}>
                {[...fotos].reverse().map((f) => (
                  <img key={f.id} src={f.foto_url} alt="" title={`${f.autor} · ${formatearFechaDivisor(f.created_at)} ${horaDe(f.created_at)}`}
                    onClick={() => { setGaleria(false); setVisor(fotos.findIndex((x) => x.id === f.id)); }}
                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, cursor: "zoom-in", background: "#e2e8f0" }} />
                ))}
              </div>
            )}
          </div>
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
