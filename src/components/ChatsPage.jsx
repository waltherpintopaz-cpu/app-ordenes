import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare, Search, X, ArrowLeft, Plus, ExternalLink, LayoutDashboard, Bell, BellOff, PanelRightOpen, PanelRightClose } from "lucide-react";
import OrdenChat from "./OrdenChat";
import ReprogramarOrdenModal, { diasPorCoordinar } from "./ReprogramarOrdenModal";
import useChatsRecientes from "../hooks/useChatsRecientes";
import { MIN_ESPERA_CLIENTE, minutosEsperando } from "../services/chatCliente";
import { supabase } from "../supabaseClient";
import { esInstalacion } from "../services/mensajesCliente";
import SenalLiquidacionOrden from "./SenalLiquidacionOrden";

// Pagina "Chats" (ruta /chats), estilo WhatsApp Web: lista de chats a la
// izquierda, conversacion al centro y datos de la orden a la derecha. Pensada
// para tenerla abierta en una ventana aparte. Usa la misma sesion y permisos
// del panel. Pedido 2026-11-12; pestañas, estado, "Lo atiendo yo" y panel de
// la orden 2026-11-13.

const norm = (v) => String(v || "").trim().toLowerCase();
const plano = (v) => norm(v).normalize("NFD").replace(/[̀-ͯ]/g, "");
const AVATAR_COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#ea580c", "#db2777", "#0891b2", "#4f46e5", "#ca8a04"];
function colorPara(nombre) {
  const s = String(nombre || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
// "RODRIGUEZ HUAYCHO, BERTHA LUZ" o "Bertha Luz Rodriguez" -> 2 letras.
const iniciales = (t) => {
  let s = String(t || "").trim();
  if (s.includes(",")) s = s.split(",").reverse().join(" ");
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
};
function horaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
}
function resumen(m) {
  if (!m) return "";
  const t = String(m.texto || "");
  if (/google\.com\/maps\?q=/.test(t)) return "📍 Ubicación";
  if (t) return t.split("\n")[0];
  return m.foto_url ? "📷 Foto" : "";
}
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.18].forEach((t0) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 740;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.13, ctx.currentTime + t0);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + 0.14);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t0 + 0.15);
    });
  } catch { /* sin audio */ }
}
function leerChatUrl() {
  try { return new URLSearchParams(window.location.search).get("chat") || null; } catch { return null; }
}
function escribirChatUrl(key) {
  try {
    const u = new URL(window.location.href);
    if (key) u.searchParams.set("chat", key); else u.searchParams.delete("chat");
    window.history.replaceState(null, "", u.toString());
  } catch { /* sin history */ }
}
const leerLS = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* nada */ } };

const hoyYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const esCerrada = (o) => /liquidad|cancel|finaliz|cerrad/i.test(String(o?.estado || ""));
// Estado de la orden para la lista/cabecera: color + texto corto.
function estadoOrden(o, ahora) {
  if (!o) return null;
  const e = String(o.estado || "");
  if (/cancel/i.test(e)) return { t: "✖ Cancelada", c: "#64748b", bg: "#f1f5f9" };
  if (/liquidad|finaliz|cerrad/i.test(e)) return { t: "✅ Liquidada", c: "#15803d", bg: "#dcfce7" };
  if (o.porCoordinarDesde) {
    const d = diasPorCoordinar(o.porCoordinarDesde);
    return d >= 3 ? { t: `⏸ Por coordinar · ${d}d`, c: "#fff", bg: "#dc2626" } : { t: "⏸ Por coordinar", c: "#6b21a8", bg: "#f3e8ff" };
  }
  const f = String(o.fechaActuacion || "").slice(0, 10);
  const h = String(o.hora || "").slice(0, 5);
  if (f) {
    const t = new Date(`${f}T${h || "23:59"}:00`).getTime();
    if (Number.isFinite(t) && t < ahora && !(/proceso/i.test(e) && o.atendidaSinLiquidarEn)) return { t: "🔴 Vencida", c: "#fff", bg: "#dc2626" };
  }
  if (/proceso/i.test(e)) return { t: o.atendidaSinLiquidarEn ? "✅ Atendida" : "🔵 En proceso", c: "#1d4ed8", bg: "#dbeafe" };
  return { t: "🟠 Pendiente", c: "#c2410c", bg: "#ffedd5" };
}
function cuandoVisita(o) {
  const f = String(o?.fechaActuacion || "").slice(0, 10);
  const h = String(o?.hora || "").slice(0, 5);
  if (!f) return h ? `🕐 ${h}` : "";
  const hoy = hoyYmd();
  const man = new Date(); man.setDate(man.getDate() + 1);
  const manYmd = `${man.getFullYear()}-${String(man.getMonth() + 1).padStart(2, "0")}-${String(man.getDate()).padStart(2, "0")}`;
  const dia = f === hoy ? "hoy" : f === manYmd ? "mañana" : `${f.slice(8, 10)}/${f.slice(5, 7)}`;
  return `🕐 ${dia}${h ? ` ${h}` : ""}`;
}

export function abrirVentanaChats(chatKey) {
  const url = `/chats${chatKey ? `?chat=${encodeURIComponent(chatKey)}` : ""}`;
  const w = window.open(url, "ventana_chats", "width=1350,height=800");
  if (w) w.focus();
  else window.location.href = url; // ventanas emergentes bloqueadas
}

const HORAS_ATENCION = 4;
const FILTROS = [
  { k: "todos", l: "Todos" },
  { k: "noleidos", l: "No leídos" },
  { k: "esperando", l: "⏰ Esperando" },
  { k: "hoy", l: "Hoy" },
  { k: "tecnicos", l: "👷 Técnicos" },
  { k: "archivados", l: "Archivados" },
];

export default function ChatsPage({ ordenes, tecnicos, tecnicosDirectorio, autor, autorRol, empresa, onOrdenCambiada }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(t); }, []);
  const avisadosEsperaRef = useRef(new Set());
  const [nuevoChat, setNuevoChat] = useState(false);
  const [seleccion, setSeleccion] = useState(leerChatUrl);
  const [ancho, setAncho] = useState(() => window.innerWidth);
  const [permisoNotif, setPermisoNotif] = useState(() => ("Notification" in window ? Notification.permission : "denied"));
  const [verPanel, setVerPanel] = useState(() => leerLS("chats_ver_panel_orden", true));
  const [reprog, setReprog] = useState(null);
  const buscadorRef = useRef(null);
  const seleccionRef = useRef(seleccion);
  seleccionRef.current = seleccion;
  const angosto = ancho < 820;
  const cabePanel = ancho >= 1180;

  useEffect(() => {
    const r = () => setAncho(window.innerWidth);
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  useEffect(() => { guardarLS("chats_ver_panel_orden", verPanel); }, [verPanel]);

  // ── "Lo atiendo yo": quien esta atendiendo cada chat (tabla chat_atencion) ──
  const [atencion, setAtencion] = useState({});
  const cargarAtencion = useCallback(() => {
    supabase.from("chat_atencion").select("clave,usuario,desde").then(({ data, error }) => {
      if (error) return;
      const m = {};
      for (const r of data || []) m[r.clave] = r;
      setAtencion(m);
    }, () => {});
  }, []);
  useEffect(() => {
    cargarAtencion();
    const ch = supabase.channel("chats-atencion")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_atencion" }, () => cargarAtencion())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargarAtencion]);
  const atiende = (key) => {
    const a = atencion[key];
    if (!a) return null;
    return ahora - new Date(a.desde).getTime() < HORAS_ATENCION * 3600000 ? a : null;
  };
  const tomarChat = async (key) => {
    const fila = { clave: key, usuario: autor, desde: new Date().toISOString() };
    setAtencion((p) => ({ ...p, [key]: fila }));
    await supabase.from("chat_atencion").upsert([fila], { onConflict: "clave" });
  };
  const soltarChat = async (key) => {
    setAtencion((p) => { const n = { ...p }; delete n[key]; return n; });
    await supabase.from("chat_atencion").delete().eq("clave", key);
  };

  // Aviso de escritorio + sonido cuando llega un mensaje y no lo estas mirando.
  const onNuevo = useCallback((msg, info) => {
    const mirando = !document.hidden && document.hasFocus() && seleccionRef.current === info.key;
    if (mirando) return;
    beep();
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        const titulo = info.tipo === "orden"
          ? `💬 ${info.ordenInfo?.codigo || "Orden"} · ${info.ordenInfo?.nombre || "Cliente"}`
          : `👷 ${info.tecnicoNombre}`;
        const n = new Notification(`${msg.urgente ? "🚨 URGENTE · " : ""}${titulo}`, {
          body: `${msg.autor || "Alguien"}: ${resumen(msg)}`,
          tag: info.key,
          renotify: true,
        });
        n.onclick = () => { window.focus(); setSeleccion(info.key); n.close(); };
      }
    } catch { /* sin notificaciones */ }
  }, []);

  const { chats, cargando, recalcular } = useChatsRecientes({ ordenes, tecnicos, autor, onNuevo });

  useEffect(() => { escribirChatUrl(seleccion); }, [seleccion]);
  useEffect(() => { recalcular(); }, [seleccion, recalcular]);

  const esperaMin = (c) => (c.esperandoDesde ? minutosEsperando(c.esperandoDesde, ahora) : -1);
  const archivado = (c) => c.tipo === "orden" && esCerrada(c.ordenInfo) && ahora - new Date(c.ultimo?.created_at || 0).getTime() > 24 * 3600000;
  const activos = chats.filter((c) => !archivado(c));
  const total = activos.reduce((s, c) => s + c.count, 0);
  const esperandoLista = activos.filter((c) => esperaMin(c) >= MIN_ESPERA_CLIENTE);
  useEffect(() => {
    for (const c of esperandoLista) {
      const clave = `${c.key}|${c.esperandoDesde}`;
      if (avisadosEsperaRef.current.has(clave)) continue;
      avisadosEsperaRef.current.add(clave);
      beep();
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const n = new Notification(`⏰ Cliente sin respuesta · ${c.ordenInfo?.codigo || ""}`, {
            body: `${c.ordenInfo?.nombre || "El cliente"} escribió hace ${esperaMin(c)} min y nadie le contestó.`,
            tag: `espera:${c.key}`,
          });
          n.onclick = () => { window.focus(); setSeleccion(c.key); n.close(); };
        }
      } catch { /* sin notificaciones */ }
    }
  }, [esperandoLista.map((c) => c.key).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.title = `${total > 0 ? `(${total}) ` : ""}Chats${empresa ? ` · ${empresa}` : ""}`;
  }, [total, empresa]);

  const hoy = hoyYmd();
  const pasaFiltro = (c, f) => {
    if (f === "archivados") return archivado(c);
    if (archivado(c)) return false;
    if (f === "noleidos") return c.count > 0;
    if (f === "esperando") return esperaMin(c) >= MIN_ESPERA_CLIENTE;
    if (f === "hoy") return c.tipo === "orden" && String(c.ordenInfo?.fechaActuacion || "").slice(0, 10) === hoy;
    if (f === "tecnicos") return c.tipo === "tecnico";
    return true;
  };
  // Ordenes abiertas SIN mensajes (para poder escribir de cualquiera):
  // en "Hoy" salen todas las del dia + en proceso; buscando, cualquier abierta.
  const conChat = useMemo(() => new Set(chats.filter((c) => c.tipo === "orden").map((c) => String(c.ordenId))), [chats]);
  const abierta = (o) => /pendient|proceso|asign|curso/i.test(String(o?.estado || "")) && !/liquidad|cancel/i.test(String(o?.estado || ""));
  const sinChat = (o) => ({
    tipo: "orden", key: `orden:${o.id}`, ordenId: o.id, ordenInfo: o, sinMensajes: true,
    titulo: `${o.codigo || "Orden"} · ${o.nombre || "Cliente"}`, sub: o.tecnico ? `Técnico: ${o.tecnico}` : "", count: 0, ultimo: null,
  });
  const extrasHoy = useMemo(() => (ordenes || [])
    .filter((o) => !conChat.has(String(o.id)) && abierta(o) && !o.porCoordinarDesde
      && String(o.fechaActuacion || "").slice(0, 10) === hoy)
    .sort((a, b) => String(a.hora || "99").localeCompare(String(b.hora || "99")))
    .map(sinChat), [ordenes, conChat, hoy]); // eslint-disable-line react-hooks/exhaustive-deps
  const conteo = Object.fromEntries(FILTROS.map((f) => [f.k, chats.filter((c) => pasaFiltro(c, f.k)).length + (f.k === "hoy" ? extrasHoy.length : 0)]));
  const nombresTecnicos = useMemo(() => {
    const set = new Set();
    chats.forEach((c) => { const t = c.tipo === "tecnico" ? c.tecnicoNombre : c.ordenInfo?.tecnico; if (t) set.add(String(t)); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [chats]);

  const terminos = plano(busqueda).split(/\s+/).filter(Boolean);
  const coincide = (...c) => !terminos.length || terminos.every((w) => plano(c.filter(Boolean).join(" ")).includes(w));
  const lista = useMemo(() => [
    ...chats.filter((c) => pasaFiltro(c, filtro)),
    ...(filtro === "hoy" ? extrasHoy : []),
    // Buscando: tambien ordenes abiertas que aun no tienen chat.
    ...(terminos.length && (filtro === "todos" || filtro === "hoy")
      ? (ordenes || []).filter((o) => !conChat.has(String(o.id)) && abierta(o)
          && !(filtro === "hoy" && extrasHoy.some((x) => String(x.ordenId) === String(o.id)))).slice(0, 400).map(sinChat)
      : []),
  ]
    .filter((c) => !filtroTecnico || String(c.tipo === "tecnico" ? c.tecnicoNombre : c.ordenInfo?.tecnico) === filtroTecnico)
    .filter((c) => coincide(c.titulo, c.sub, c.tecnicoNombre, c.ordenInfo?.codigo, c.ordenInfo?.nombre, c.ordenInfo?.tecnico,
      c.ordenInfo?.direccion, c.ordenInfo?.celular, c.ultimo?.texto, c.ultimo?.autor))
    .sort((a, b) => (esperaMin(b) >= MIN_ESPERA_CLIENTE) - (esperaMin(a) >= MIN_ESPERA_CLIENTE)),
  [chats, filtro, filtroTecnico, busqueda, ahora, extrasHoy, ordenes]); // eslint-disable-line react-hooks/exhaustive-deps
  const directorio = (Array.isArray(tecnicosDirectorio) ? tecnicosDirectorio : []).filter((t) => coincide(t.nombre));

  // Chat seleccionado: puede no estar en la lista (sin mensajes aun o
  // abierto desde la URL), se arma igual. La orden se toma siempre de
  // "ordenes" (la version mas nueva, ej. recien reprogramada).
  const sel = useMemo(() => {
    if (!seleccion) return null;
    const [tipo, ...resto] = seleccion.split(":");
    const valor = resto.join(":");
    const enLista = chats.find((c) => c.key === seleccion);
    if (tipo === "orden" && valor) {
      const o = (ordenes || []).find((x) => String(x.id) === String(valor)) || enLista?.ordenInfo;
      if (o) return { ...(enLista || {}), tipo, key: seleccion, ordenId: o.id, ordenInfo: o, titulo: `${o.codigo || "Orden"} · ${o.nombre || "Cliente"}`, sub: o.tecnico ? `Técnico: ${o.tecnico}` : "" };
    }
    if (enLista) return enLista;
    if (tipo === "tecnico" && valor) return { tipo, key: seleccion, tecnicoNombre: valor, titulo: valor, sub: "Chat con oficina" };
    return null;
  }, [seleccion, chats, ordenes]);

  // Atajos: Ctrl+K o "/" = buscar; Esc = cerrar chat; Alt+↑/↓ = chat anterior/siguiente.
  useEffect(() => {
    const onKey = (e) => {
      const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
      if ((e.ctrlKey && e.key.toLowerCase() === "k") || (e.key === "/" && !enCampo)) {
        e.preventDefault();
        buscadorRef.current?.focus();
        buscadorRef.current?.select();
      } else if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        if (!lista.length) return;
        const i = lista.findIndex((c) => c.key === seleccionRef.current);
        const j = e.key === "ArrowDown" ? Math.min(lista.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
        setSeleccion(lista[j].key);
      } else if (e.key === "Escape" && !enCampo && seleccionRef.current) {
        setSeleccion(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lista]);

  // Si el navegador ya las tiene BLOQUEADAS, Chrome no vuelve a preguntar:
  // en vez de no hacer nada, se muestran los pasos para desbloquearlas. (13-nov)
  const [ayudaNotif, setAyudaNotif] = useState(false);
  const pedirPermiso = async () => {
    try {
      if (!("Notification" in window)) { setAyudaNotif(true); return; }
      if (Notification.permission === "denied") { setAyudaNotif(true); return; }
      const r = await Notification.requestPermission();
      setPermisoNotif(r);
      if (r === "granted") {
        try { new Notification("✅ Avisos activados", { body: "Te avisaremos de los mensajes nuevos de los chats." }); } catch { /* nada */ }
      } else setAyudaNotif(true);
    } catch { setAyudaNotif(true); }
  };
  // Al volver a la ventana (despues de cambiarlo en la configuracion) se relee el permiso.
  useEffect(() => {
    const releer = () => { if ("Notification" in window) setPermisoNotif(Notification.permission); };
    window.addEventListener("focus", releer);
    document.addEventListener("visibilitychange", releer);
    return () => { window.removeEventListener("focus", releer); document.removeEventListener("visibilitychange", releer); };
  }, []);
  const abrir = (key) => { setSeleccion(key); setNuevoChat(false); };

  // Cambiar tecnico desde el panel de la orden: queda aviso en el chat.
  const cambiarTecnico = async (o, nuevo) => {
    if (!o?.id || !nuevo || nuevo === o.tecnico) return false;
    const { error } = await supabase.from("ordenes").update({ tecnico: nuevo }).eq("id", Number(o.id));
    if (error) { alert(`No se pudo cambiar el técnico: ${error.message}`); return false; }
    await supabase.from("chat_ordenes_mensajes").insert([{
      orden_id: Number(o.id), autor, autor_rol: autorRol || null,
      texto: `👷 Orden reasignada: ${o.tecnico || "sin técnico"} → ${nuevo}\nPor: ${autor}`,
    }]);
    onOrdenCambiada?.(o.id, { tecnico: nuevo });
    return true;
  };

  const verLista = !angosto || !sel;
  const verChat = !angosto || !!sel;
  const mostrarPanel = sel?.tipo === "orden" && verPanel && cabePanel && !!sel.ordenInfo;
  const atSel = sel ? atiende(sel.key) : null;
  const estSel = sel?.tipo === "orden" ? estadoOrden(sel.ordenInfo, ahora) : null;
  const tecnicoSel = sel?.tipo === "tecnico" ? sel.tecnicoNombre : sel?.ordenInfo?.tecnico || "";
  const [ubicTec, setUbicTec] = useState(null);
  useEffect(() => {
    setUbicTec(null);
    if (!tecnicoSel) return undefined;
    let vivo = true;
    const leer = () => supabase.from("tecnico_ubicacion_actual").select("updated_at,battery_pct").eq("tecnico_nombre", tecnicoSel).order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (vivo) setUbicTec(data || null); }, () => {});
    leer();
    const t = setInterval(leer, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, [tecnicoSel]);
  const enLineaTxt = (() => {
    if (!ubicTec?.updated_at) return null;
    const min = Math.round((ahora - new Date(ubicTec.updated_at).getTime()) / 60000);
    if (!Number.isFinite(min)) return null;
    if (min <= 5) return { t: "En línea", c: "#16a34a" };
    if (min < 60) return { t: `Visto hace ${min} min`, c: "#64748b" };
    if (min < 1440) return { t: `Visto hace ${Math.round(min / 60)} h`, c: "#94a3b8" };
    return { t: `Visto hace ${Math.round(min / 1440)} d`, c: "#94a3b8" };
  })();
  const franjaEstado = (() => {
    const o = sel?.tipo === "orden" ? sel.ordenInfo : null;
    if (!o || !estSel) return null;
    const e = String(o.estado || "");
    if (/cancel/i.test(e)) return { ic: "✖", t: "Orden cancelada. El chat queda solo como historial.", bg: "#f1f5f9", c: "#475569", b: "#e2e8f0" };
    if (/liquidad|finaliz|cerrad/i.test(e)) return { ic: "✅", t: "Orden liquidada. Lo que escribas queda como seguimiento.", bg: "#f0fdf4", c: "#166534", b: "#bbf7d0" };
    if (o.porCoordinarDesde) return { ic: "⏸", t: `Por coordinar: el cliente avisará la fecha (hace ${diasPorCoordinar(o.porCoordinarDesde)} día${diasPorCoordinar(o.porCoordinarDesde) === 1 ? "" : "s"}).`, bg: "#faf5ff", c: "#6b21a8", b: "#e9d5ff", accion: "Poner fecha" };
    if (/Vencida/.test(estSel.t)) return { ic: "⏰", t: `Visita vencida (${(cuandoVisita(o) || "").replace("🕐 ", "")}). Confirma con el técnico o reprográmala.`, bg: "#fef2f2", c: "#991b1b", b: "#fecaca", accion: "Reprogramar" };
    if (/proceso/i.test(e)) return { ic: "🔧", t: o.atendidaSinLiquidarEn ? "Atendida: falta que el técnico liquide." : "En proceso: el técnico ya está trabajando en esta orden.", bg: "#eff6ff", c: "#1e40af", b: "#bfdbfe" };
    return null;
  })();

  return (
    <div style={{ height: "100vh", display: "flex", background: "#f1f5f9", fontFamily: '"Inter", "Segoe UI", sans-serif', overflow: "hidden" }}>
      <style>{`
        .cp-item:hover { background: #f8fafc !important; }
        .cp-item.sel, .cp-item.sel:hover { background: #ede9fe !important; }
        .cp-btn:hover { background: #e2e8f0 !important; }
        .cp-scroll { scrollbar-width: thin; }
        .cp-tabs { scrollbar-width: none; }
        .cp-tabs::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Lista de chats ── */}
      {verLista && (
        <div style={{ width: angosto ? "100%" : 360, flexShrink: 0, display: "flex", flexDirection: "column", background: "#fff", borderRight: "1px solid #e2e8f0" }}>
          <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #a855f7, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessagesSquare size={18} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Chats</div>
                <div style={{ fontSize: 11.5, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{autor}{empresa ? ` · ${empresa}` : ""}</div>
              </div>
              <button type="button" className="cp-btn" title={permisoNotif === "granted" ? "Avisos de escritorio activados" : "Activar avisos de escritorio"}
                onClick={pedirPermiso} style={iconBtn}>
                {permisoNotif === "granted" ? <Bell size={17} color="#16a34a" /> : <BellOff size={17} color="#dc2626" />}
              </button>
              <a href="/" target="_blank" rel="noreferrer" className="cp-btn" title="Abrir el panel" style={iconBtn}><LayoutDashboard size={17} color="#475569" /></a>
            </div>
            {permisoNotif !== "granted" && (
              <button type="button" onClick={pedirPermiso} style={{ width: "100%", marginBottom: 10, padding: "7px 10px", borderRadius: 8, border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                {permisoNotif === "denied"
                  ? "🔕 Los avisos están BLOQUEADOS en este navegador. Toca aquí para ver cómo activarlos."
                  : "🔔 Activa los avisos para enterarte de mensajes nuevos aunque estés en otra ventana"}
              </button>
            )}
            {ayudaNotif && (
              <div onClick={() => setAyudaNotif(false)} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 420, width: "100%", padding: 20, boxShadow: "0 20px 50px rgba(15,23,42,0.3)", fontSize: 13.5, color: "#334155", lineHeight: 1.5 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>🔕 Avisos bloqueados</div>
                  <div style={{ marginBottom: 10 }}>El navegador tiene bloqueados los avisos de esta página y ya no vuelve a preguntar. Actívalos así:</div>
                  <ol style={{ margin: "0 0 10px 18px", padding: 0 }}>
                    <li>Toca el <b>ícono a la izquierda de la dirección</b> (🔒 o ⚙). Si es la ventana de la app, usa los <b>3 puntitos ⋮</b> → <b>Información de la app</b> / <b>Configuración del sitio</b>.</li>
                    <li>En <b>Notificaciones</b> elige <b>Permitir</b>.</li>
                    <li>Recarga la página (<b>Ctrl + F5</b>).</li>
                  </ol>
                  <div style={{ fontSize: 12.5, color: "#64748b", background: "#f8fafc", borderRadius: 10, padding: "8px 10px", marginBottom: 12 }}>
                    Si igual no salen: en Windows ve a <b>Configuración → Sistema → Notificaciones</b>, activa <b>Google Chrome</b> y apaga <b>No molestar</b>.
                  </div>
                  <button type="button" onClick={() => setAyudaNotif(false)} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Entendido</button>
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", borderRadius: 9, padding: "0 10px", height: 36 }}>
                <Search size={15} color="#94a3b8" />
                <input ref={buscadorRef} value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setBusqueda(""); e.currentTarget.blur(); } if (e.key === "Enter" && lista[0]) abrir(lista[0].key); }}
                  placeholder="Buscar orden, cliente, técnico… (Ctrl+K)"
                  style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#0f172a", fontFamily: "inherit" }} />
                {!!busqueda && <button type="button" onClick={() => setBusqueda("")} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex" }}><X size={15} color="#94a3b8" /></button>}
              </div>
              {nombresTecnicos.length > 1 && (
                <select value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)} title="Filtrar por técnico"
                  style={{ maxWidth: 120, height: 36, borderRadius: 9, border: `1px solid ${filtroTecnico ? "#7c3aed" : "#e2e8f0"}`, background: filtroTecnico ? "#f5f3ff" : "#fff", fontSize: 12, fontWeight: 700, color: "#334155", padding: "0 6px", fontFamily: "inherit" }}>
                  <option value="">👷 Todos</option>
                  {nombresTecnicos.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>
            <div className="cp-tabs" style={{ display: "flex", gap: 5, overflowX: "auto", marginTop: 8, paddingBottom: 2 }}>
              {FILTROS.map((f) => {
                const activo = filtro === f.k;
                const rojo = f.k === "esperando" && conteo.esperando > 0;
                const n = f.k === "todos" ? null : conteo[f.k];
                return (
                  <button key={f.k} type="button" onClick={() => setFiltro(f.k)}
                    style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", fontFamily: "inherit",
                      border: `1px solid ${activo ? (rojo ? "#dc2626" : "#7c3aed") : rojo ? "#fca5a5" : "#e2e8f0"}`,
                      background: activo ? (rojo ? "#dc2626" : "#7c3aed") : rojo ? "#fef2f2" : "#fff",
                      color: activo ? "#fff" : rojo ? "#b91c1c" : "#475569" }}>
                    {f.l}{n ? ` · ${n}` : ""}
                  </button>
                );
              })}
            </div>
            {directorio.length > 0 && (
              <button type="button" onClick={() => setNuevoChat((v) => !v)} className="cp-btn"
                style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 8px", border: "none", borderRadius: 8, background: nuevoChat ? "#eff6ff" : "transparent", color: "#2563eb", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                <Plus size={15} /> Nuevo chat con técnico
              </button>
            )}
          </div>

          <div className="cp-scroll" style={{ flex: 1, overflowY: "auto" }}>
            {nuevoChat && (
              <div style={{ padding: "6px 8px 10px", borderBottom: "1px solid #f1f5f9" }}>
                {directorio.map((t) => (
                  <button key={t.id || t.nombre} type="button" className="cp-item" onClick={() => abrir(`tecnico:${t.nombre}`)}
                    style={{ ...itemBtn, padding: "7px 8px" }}>
                    <span style={{ ...avatar, width: 32, height: 32, background: "linear-gradient(135deg, #60a5fa, #2563eb)" }}>{iniciales(t.nombre)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{t.nombre}</span>
                  </button>
                ))}
              </div>
            )}
            {cargando && !chats.length ? (
              <div style={vacio}>Cargando chats…</div>
            ) : !lista.length ? (
              <div style={vacio}>
                {terminos.length ? `Sin resultados para "${busqueda.trim()}"`
                  : filtro === "noleidos" ? "No tienes chats sin leer 👍"
                  : filtro === "esperando" ? "Ningún cliente esperando respuesta 👍"
                  : filtro === "archivados" ? "No hay chats archivados. Aquí pasan las órdenes liquidadas después de 24 h."
                  : "No hay chats aquí."}
              </div>
            ) : lista.map((c) => {
              const esMio = norm(c.ultimo?.autor) === norm(autor);
              const esTec = c.tipo === "tecnico";
              const o = c.ordenInfo;
              const est = esTec ? null : estadoOrden(o, ahora);
              const at = atiende(c.key);
              const espera = esperaMin(c);
              return (
                <button key={c.key} type="button" className={`cp-item${seleccion === c.key ? " sel" : ""}`} onClick={() => abrir(c.key)} style={itemBtn} title={c.titulo}>
                  <span style={{ ...avatar, background: esTec ? "linear-gradient(135deg, #60a5fa, #2563eb)" : colorPara(o?.nombre || c.titulo) }}>
                    {esTec ? iniciales(c.tecnicoNombre) : iniciales(o?.nombre)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: c.count ? 800 : 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {esTec ? `👷 ${c.titulo}` : (o?.nombre || c.titulo)}
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 11, color: c.count ? "#7c3aed" : "#94a3b8", fontWeight: c.count ? 800 : 500 }}>{horaCorta(c.ultimo?.created_at)}</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: c.count ? "#334155" : "#64748b", fontWeight: c.count ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {!c.ultimo ? <i style={{ color: "#94a3b8" }}>Sin mensajes · clic para escribir</i>
                          : <>{esMio ? "Tú" : String(c.ultimo?.autor_rol || "").toLowerCase() === "cliente" ? "👤 Cliente" : String(c.ultimo?.autor || "").split(" ")[0]}: {resumen(c.ultimo)}</>}
                      </span>
                      {c.count > 0 && <span style={{ flexShrink: 0, minWidth: 20, height: 20, borderRadius: 10, padding: "0 6px", background: "#7c3aed", color: "#fff", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c.count}</span>}
                    </span>
                    {!esTec && (
                      <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                        {est && <span style={{ ...chip, background: est.bg, color: est.c }}>{est.t}</span>}
                        {!esCerrada(o) && !o?.porCoordinarDesde && cuandoVisita(o) && <span style={{ ...chip, background: "#f1f5f9", color: "#475569" }}>{cuandoVisita(o)}</span>}
                        <span style={{ fontSize: 10.5, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{o?.codigo}{o?.tecnico ? ` · ${String(o.tecnico).split(" ")[0]}` : ""}</span>
                      </span>
                    )}
                    {(espera >= 0 || at) && (
                      <span style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                        {espera >= 0 && (
                          <span style={{ ...chip, background: espera >= MIN_ESPERA_CLIENTE ? "#dc2626" : "#dcfce7", color: espera >= MIN_ESPERA_CLIENTE ? "#fff" : "#15803d" }}>
                            {espera >= MIN_ESPERA_CLIENTE ? `⏰ Cliente espera ${espera} min` : "👤 Cliente escribió · responder"}
                          </span>
                        )}
                        {at && <span style={{ ...chip, background: norm(at.usuario) === norm(autor) ? "#ede9fe" : "#fef3c7", color: norm(at.usuario) === norm(autor) ? "#6d28d9" : "#92400e" }}>
                          🙋 {norm(at.usuario) === norm(autor) ? "Lo atiendes tú" : `Atiende ${String(at.usuario).split(" ")[0]}`}
                        </span>}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: "6px 12px", borderTop: "1px solid #f1f5f9", fontSize: 10.5, color: "#94a3b8" }}>
            Ctrl+K buscar · Alt+↑/↓ cambiar de chat · Esc cerrar
          </div>
        </div>
      )}

      {/* ── Conversacion ── */}
      {verChat && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {sel ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fff", borderBottom: "1px solid #e2e8f0", flexShrink: 0 }}>
                {angosto && (
                  <button type="button" className="cp-btn" onClick={() => setSeleccion(null)} style={iconBtn} title="Volver"><ArrowLeft size={18} color="#475569" /></button>
                )}
                <span style={{ ...avatar, width: 38, height: 38, background: sel.tipo === "tecnico" ? "linear-gradient(135deg, #60a5fa, #2563eb)" : colorPara(sel.ordenInfo?.nombre || sel.titulo) }}>
                  {sel.tipo === "tecnico" ? iniciales(sel.tecnicoNombre) : iniciales(sel.ordenInfo?.nombre)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{sel.tipo === "tecnico" ? `👷 ${sel.titulo}` : sel.titulo}</span>
                    {estSel && <span style={{ ...chip, background: estSel.bg, color: estSel.c, flexShrink: 0 }}>{estSel.t}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {enLineaTxt && (
                      <span title={tecnicoSel ? `Según el GPS de la app de ${tecnicoSel}` : undefined} style={{ color: enLineaTxt.c, fontWeight: 700, marginRight: 6 }}>
                        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: enLineaTxt.c, marginRight: 4, verticalAlign: "middle" }} />
                        {enLineaTxt.t}{sel.tipo !== "tecnico" ? " ·" : ""}
                      </span>
                    )}
                    {sel.tipo === "tecnico" ? (enLineaTxt ? "" : "Chat con oficina") : [sel.ordenInfo?.tecnico && `Técnico: ${sel.ordenInfo.tecnico}`, cuandoVisita(sel.ordenInfo), sel.ordenInfo?.direccion].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {/* "Lo atiendo yo" */}
                {atSel && norm(atSel.usuario) !== norm(autor) ? (
                  <button type="button" onClick={() => { if (window.confirm(`${atSel.usuario} está atendiendo este chat. ¿Lo tomas tú?`)) void tomarChat(sel.key); }}
                    title={`Lo está atendiendo ${atSel.usuario} desde las ${new Date(atSel.desde).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`}
                    style={{ ...btnTxt, background: "#fef3c7", borderColor: "#fcd34d", color: "#92400e" }}>
                    🙋 Atiende {String(atSel.usuario).split(" ")[0]}
                  </button>
                ) : atSel ? (
                  <button type="button" onClick={() => void soltarChat(sel.key)} title="Dejar de atender este chat" style={{ ...btnTxt, background: "#ede9fe", borderColor: "#c4b5fd", color: "#6d28d9" }}>
                    ✋ Soltar
                  </button>
                ) : (
                  <button type="button" onClick={() => void tomarChat(sel.key)} title="Avisar a las demás que tú lo atiendes" style={{ ...btnTxt, background: "#fff", borderColor: "#c4b5fd", color: "#6d28d9" }}>
                    🙋 Lo atiendo yo
                  </button>
                )}
                {sel.tipo === "orden" && cabePanel && (
                  <button type="button" className="cp-btn" onClick={() => setVerPanel((v) => !v)} style={iconBtn} title={verPanel ? "Ocultar datos de la orden" : "Ver datos de la orden"}>
                    {verPanel ? <PanelRightClose size={18} color="#475569" /> : <PanelRightOpen size={18} color="#475569" />}
                  </button>
                )}
                {!angosto && window.name !== "ventana_chats" && (
                  <button type="button" className="cp-btn" onClick={() => abrirVentanaChats(sel.key)} style={iconBtn} title="Abrir en ventana aparte"><ExternalLink size={17} color="#475569" /></button>
                )}
                <button type="button" className="cp-btn" onClick={() => setSeleccion(null)} style={iconBtn} title="Cerrar chat (Esc)"><X size={18} color="#475569" /></button>
              </div>
              {franjaEstado && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", background: franjaEstado.bg, borderBottom: `1px solid ${franjaEstado.b}`, color: franjaEstado.c, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>
                  <span style={{ fontSize: 14 }}>{franjaEstado.ic}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{franjaEstado.t}</span>
                  {franjaEstado.accion && norm(autorRol) !== "tecnico" && (
                    <button type="button" onClick={() => setReprog(sel.ordenInfo)}
                      style={{ border: `1px solid ${franjaEstado.c}`, background: "#fff", color: franjaEstado.c, borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                      📅 {franjaEstado.accion}
                    </button>
                  )}
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {sel.tipo === "tecnico" ? (
                    <OrdenChat key={sel.key} hiloTecnico={sel.tecnicoNombre} autor={autor} autorRol={autorRol} llenar />
                  ) : (
                    <OrdenChat key={sel.key} ordenId={sel.ordenId} orden={sel.ordenInfo} ordenCodigo={sel.ordenInfo?.codigo} tecnicoAsignado={sel.ordenInfo?.tecnico} autor={autor} autorRol={autorRol} llenar />
                  )}
                </div>
                {mostrarPanel && (
                  <PanelOrden
                    key={sel.ordenInfo.id}
                    o={sel.ordenInfo}
                    est={estSel}
                    tecnicosDirectorio={tecnicosDirectorio}
                    puedeGestionar={norm(autorRol) !== "tecnico"}
                    onReprogramar={() => setReprog(sel.ordenInfo)}
                    onCambiarTecnico={cambiarTecnico}
                  />
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748b", textAlign: "center", padding: 24 }}>
              <div style={{ width: 72, height: 72, borderRadius: 22, background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <MessagesSquare size={34} color="#7c3aed" />
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Elige un chat</div>
              <div style={{ fontSize: 13, marginTop: 4, maxWidth: 360 }}>
                {total > 0 ? `Tienes ${total} mensaje${total === 1 ? "" : "s"} sin leer.` : "Estás al día 👍"} Los mensajes nuevos te avisan aunque esta ventana esté minimizada.
              </div>
            </div>
          )}
        </div>
      )}

      {reprog && (
        <ReprogramarOrdenModal
          orden={reprog}
          autor={autor}
          autorRol={autorRol}
          onClose={() => setReprog(null)}
          onListo={(orden, cambios) => { onOrdenCambiada?.(orden.id, cambios); }}
        />
      )}
    </div>
  );
}

// ── Panel derecho: datos de la orden + acciones ──────────────────────────
const tarjeta = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "8px 10px 10px", marginTop: 10, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" };
const tarjetaTit = { fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 };

function PanelOrden({ o, est, tecnicosDirectorio, puedeGestionar, onReprogramar, onCambiarTecnico }) {
  const [verTodo, setVerTodo] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [nuevoTec, setNuevoTec] = useState(o.tecnico || "");
  const [copiado, setCopiado] = useState("");
  const tecnicos = (Array.isArray(tecnicosDirectorio) ? tecnicosDirectorio : []).map((t) => t.nombre).filter(Boolean);
  const abierta = !esCerrada(o);
  const copiar = (txt, k) => {
    try { navigator.clipboard.writeText(String(txt || "")); setCopiado(k); setTimeout(() => setCopiado(""), 1200); } catch { /* nada */ }
  };
  const ub = String(o.ubicacion || "").trim();
  const mapa = ub ? `https://www.google.com/maps?q=${encodeURIComponent(ub)}` : o.direccion ? `https://www.google.com/maps/search/${encodeURIComponent(o.direccion)}` : "";
  const fila = (l, v, k, copiable) => (!v ? null : (
    <div key={k || l} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid #f1f5f9", alignItems: "flex-start" }}>
      <span style={{ width: 82, flexShrink: 0, fontSize: 11.5, color: "#94a3b8", fontWeight: 600 }}>{l}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "#0f172a", fontWeight: 600, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{v}</span>
      {copiable && (
        <button type="button" onClick={() => copiar(v, k || l)} style={{ border: "none", background: "#f1f5f9", borderRadius: 6, padding: "2px 6px", fontSize: 10.5, cursor: "pointer", color: "#475569", flexShrink: 0 }}>
          {copiado === (k || l) ? "✓" : "Copiar"}
        </button>
      )}
    </div>
  ));
  const wifi = String(o.wifiNombre || "").trim();
  return (
    <div className="cp-scroll" style={{ width: 310, flexShrink: 0, boxSizing: "border-box", background: "#f8fafc", borderLeft: "1px solid #e2e8f0", overflowY: "auto", overflowX: "hidden", padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: 0.4, marginBottom: 6 }}>DATOS DE LA ORDEN</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{o.nombre || "Cliente"}</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "6px 0 10px" }}>
        <span style={{ ...chip, background: "#f1f5f9", color: "#334155" }}>{o.codigo}</span>
        {est && <span style={{ ...chip, background: est.bg, color: est.c }}>{est.t}</span>}
        {Number(o.reprogramaciones) > 0 && <span style={{ ...chip, background: "#faf5ff", color: "#7c3aed" }}>🔁 Reprog. ×{o.reprogramaciones}</span>}
      </div>

      {puedeGestionar && abierta && (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <button type="button" onClick={onReprogramar} style={{ ...accion, background: "#faf5ff", borderColor: "#d8b4fe", color: "#6b21a8" }}>
            📅 {o.porCoordinarDesde ? "Poner fecha" : "Reprogramar"}
          </button>
          {!cambiando ? (
            <button type="button" onClick={() => { setNuevoTec(o.tecnico || ""); setCambiando(true); }} style={{ ...accion, background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
              👷 Cambiar técnico
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <select value={nuevoTec} onChange={(e) => setNuevoTec(e.target.value)} style={{ flex: 1, minWidth: 0, padding: "7px 6px", borderRadius: 8, border: "1px solid #bfdbfe", fontSize: 12.5, fontFamily: "inherit" }}>
                <option value="">— Elegir técnico —</option>
                {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="button" disabled={!nuevoTec || nuevoTec === o.tecnico}
                onClick={async () => { if (await onCambiarTecnico(o, nuevoTec)) setCambiando(false); }}
                style={{ border: "none", background: "#2563eb", color: "#fff", borderRadius: 8, padding: "0 10px", fontWeight: 800, cursor: "pointer", opacity: !nuevoTec || nuevoTec === o.tecnico ? 0.5 : 1 }}>OK</button>
              <button type="button" onClick={() => setCambiando(false)} style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 8, padding: "0 8px", cursor: "pointer" }}>✕</button>
            </div>
          )}
        </div>
      )}

      <div style={tarjeta}>
        <div style={tarjetaTit}>📅 Visita</div>
        {fila("Técnico", o.tecnico || "Sin técnico")}
        {fila("Cuándo", o.porCoordinarDesde ? "⏸ Por coordinar (el cliente avisará)" : [String(o.fechaActuacion || "").slice(0, 10), String(o.hora || "").slice(0, 5)].filter(Boolean).join(" · "))}
        {fila("Tipo", o.tipoActuacion || o.orden)}
        {fila("Nodo", o.nodo)}
        {fila("Plan", o.velocidad)}
      </div>
      <div style={tarjeta}>
        <div style={tarjetaTit}>👤 Cliente</div>
        {fila("Celular", o.celular, "cel", true)}
        {fila("Contacto", o.contacto, "contacto", true)}
        {fila("Dirección", o.direccion, "dir", true)}
        {mapa && (
          <a href={mapa} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 12, fontWeight: 700, color: "#2563eb", textDecoration: "none", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999, padding: "4px 10px" }}>📍 Ver en el mapa</a>
        )}
      </div>

      {esInstalacion(o.tipoActuacion || o.orden) && (
        <div style={{ marginTop: 12, borderRadius: 10, border: `1px solid ${wifi ? "#bbf7d0" : "#fde68a"}`, background: wifi ? "#f0fdf4" : "#fffbeb", padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: wifi ? "#166534" : "#92400e", marginBottom: 4 }}>{wifi ? "📡 WiFi del cliente" : "⚠️ El cliente aún no eligió su WiFi"}</div>
          {wifi && (
            <>
              {fila("2.4 GHz", `${wifi} 2.4G`, "w24", true)}
              {!o.wifiSolo24 && fila("5 GHz", `${wifi} 5G`, "w5", true)}
              {fila("Clave", o.wifiClave, "wclave", true)}
            </>
          )}
        </div>
      )}

      <SenalLiquidacionOrden o={o} />

      <button type="button" onClick={() => setVerTodo((v) => !v)} style={{ marginTop: 12, border: "none", background: "none", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
        {verTodo ? "▲ Ver menos" : "▼ Ver orden completa"}
      </button>
      {verTodo && (
        <div style={{ marginTop: 6 }}>
          {fila("DNI", o.dni, "dni", true)}
          {fila("Usuario", o.usuarioNodo, "usr", true)}
          {fila("SN ONU", o.snOnu, "sn", true)}
          {fila("Caja NAP", o.cajaNap)}
          {fila("Cobrar", o.montoCobrar ? `S/ ${o.montoCobrar}` : "")}
          {fila("Autor", o.autorOrden)}
          {fila("Creada", o.fechaCreacion)}
          {fila("Descripción", o.descripcion)}
        </div>
      )}
    </div>
  );
}

const iconBtn = { width: 34, height: 34, borderRadius: 9, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, textDecoration: "none" };
const itemBtn = { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid #f8fafc", background: "#fff", cursor: "pointer", textAlign: "left", font: "inherit" };
const avatar = { width: 42, height: 42, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800 };
const vacio = { padding: "24px 16px", textAlign: "center", fontSize: 12.5, color: "#94a3b8" };
const chip = { display: "inline-block", fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" };
const btnTxt = { flexShrink: 0, height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
const accion = { width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "left" };
