import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare, Search, X, ArrowLeft, Plus, ExternalLink, LayoutDashboard, Bell, BellOff } from "lucide-react";
import OrdenChat from "./OrdenChat";
import useChatsRecientes from "../hooks/useChatsRecientes";
import { MIN_ESPERA_CLIENTE, minutosEsperando } from "../services/chatCliente";

// Pagina "Chats" (ruta /chats), estilo WhatsApp Web: lista de chats a la
// izquierda, conversacion a la derecha. Pensada para tenerla abierta en una
// ventana aparte (boton "Abrir en ventana" del globo de chats). Usa la misma
// sesion y los mismos permisos del panel (ordenes/tecnicos que ve el usuario).
// Pedido 2026-11-12.

const norm = (v) => String(v || "").trim().toLowerCase();
const plano = (v) => norm(v).normalize("NFD").replace(/[̀-ͯ]/g, "");
const AVATAR_COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#ea580c", "#db2777", "#0891b2"];
function colorPara(nombre) {
  const s = String(nombre || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
const iniciales = (t) => String(t || "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
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
// Chat abierto en la URL (?chat=orden:123 / ?chat=tecnico:Nombre): al
// recargar la ventana vuelve al mismo chat.
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

export function abrirVentanaChats(chatKey) {
  const url = `/chats${chatKey ? `?chat=${encodeURIComponent(chatKey)}` : ""}`;
  const w = window.open(url, "ventana_chats", "width=1150,height=780");
  if (w) w.focus();
  else window.location.href = url; // ventanas emergentes bloqueadas
}

export default function ChatsPage({ ordenes, tecnicos, tecnicosDirectorio, autor, autorRol, empresa }) {
  const [busqueda, setBusqueda] = useState("");
  const [soloNoLeidos, setSoloNoLeidos] = useState(false);
  // Cliente esperando respuesta >10 min: se resalta en rojo y avisa 1 vez.
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(t); }, []);
  const [soloEsperando, setSoloEsperando] = useState(false);
  const avisadosEsperaRef = useRef(new Set());
  const [nuevoChat, setNuevoChat] = useState(false);
  const [seleccion, setSeleccion] = useState(leerChatUrl);
  const [ancho, setAncho] = useState(() => window.innerWidth);
  const [permisoNotif, setPermisoNotif] = useState(() => ("Notification" in window ? Notification.permission : "denied"));
  const buscadorRef = useRef(null);
  const seleccionRef = useRef(seleccion);
  seleccionRef.current = seleccion;
  const angosto = ancho < 820;

  useEffect(() => {
    const r = () => setAncho(window.innerWidth);
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);

  // Aviso de escritorio + sonido cuando llega un mensaje y no lo estas
  // mirando (otra ventana/pestana, o con otro chat abierto). Clic = abre ese chat.
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

  const total = chats.reduce((s, c) => s + c.count, 0);
  const esperaMin = (c) => (c.esperandoDesde ? minutosEsperando(c.esperandoDesde, ahora) : -1);
  const esperandoLista = chats.filter((c) => esperaMin(c) >= MIN_ESPERA_CLIENTE);
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

  const terminos = plano(busqueda).split(/\s+/).filter(Boolean);
  const coincide = (...c) => !terminos.length || terminos.every((w) => plano(c.filter(Boolean).join(" ")).includes(w));
  const lista = useMemo(() => chats.filter((c) => (!soloNoLeidos || c.count > 0) && (!soloEsperando || esperaMin(c) >= MIN_ESPERA_CLIENTE)
    && coincide(c.titulo, c.sub, c.tecnicoNombre, c.ordenInfo?.codigo, c.ordenInfo?.nombre, c.ordenInfo?.tecnico,
      c.ordenInfo?.direccion, c.ordenInfo?.celular, c.ultimo?.texto, c.ultimo?.autor))
    .sort((a, b) => (esperaMin(b) >= MIN_ESPERA_CLIENTE) - (esperaMin(a) >= MIN_ESPERA_CLIENTE)), [chats, soloNoLeidos, soloEsperando, busqueda, ahora]); // eslint-disable-line react-hooks/exhaustive-deps
  const directorio = (Array.isArray(tecnicosDirectorio) ? tecnicosDirectorio : []).filter((t) => coincide(t.nombre));

  // Chat seleccionado: puede no estar en la lista (sin mensajes aun o
  // abierto desde la URL), se arma igual.
  const sel = useMemo(() => {
    if (!seleccion) return null;
    const enLista = chats.find((c) => c.key === seleccion);
    if (enLista) return enLista;
    const [tipo, ...resto] = seleccion.split(":");
    const valor = resto.join(":");
    if (tipo === "tecnico" && valor) return { tipo, key: seleccion, tecnicoNombre: valor, titulo: valor, sub: "Chat con oficina" };
    if (tipo === "orden" && valor) {
      const o = (ordenes || []).find((x) => String(x.id) === String(valor));
      if (o) return { tipo, key: seleccion, ordenId: o.id, ordenInfo: o, titulo: `${o.codigo || "Orden"} · ${o.nombre || "Cliente"}`, sub: o.tecnico ? `Técnico: ${o.tecnico}` : "" };
    }
    return null;
  }, [seleccion, chats, ordenes]);

  // Atajos: Ctrl+K o "/" = buscar; Esc = cerrar chat; Alt+↑/↓ = chat anterior/siguiente.
  useEffect(() => {
    const onKey = (e) => {
      const enCampo = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
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

  const pedirPermiso = async () => {
    try { if ("Notification" in window) setPermisoNotif(await Notification.requestPermission()); } catch { /* nada */ }
  };
  const abrir = (key) => { setSeleccion(key); setNuevoChat(false); };

  const verLista = !angosto || !sel;
  const verChat = !angosto || !!sel;

  return (
    <div style={{ height: "100vh", display: "flex", background: "#f1f5f9", fontFamily: '"Inter", "Segoe UI", sans-serif', overflow: "hidden" }}>
      <style>{`
        .cp-item:hover { background: #f8fafc !important; }
        .cp-item.sel, .cp-item.sel:hover { background: #ede9fe !important; }
        .cp-btn:hover { background: #e2e8f0 !important; }
        .cp-scroll { scrollbar-width: thin; }
      `}</style>

      {/* ── Lista de chats ── */}
      {verLista && (
        <div style={{ width: angosto ? "100%" : 360, flexShrink: 0, display: "flex", flexDirection: "column", background: "#fff", borderRight: "1px solid #e2e8f0" }}>
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #f1f5f9" }}>
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
                🔔 Activa los avisos para enterarte de mensajes nuevos aunque estés en otra ventana
              </button>
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
              <button type="button" onClick={() => setSoloNoLeidos((v) => !v)}
                style={{ height: 36, padding: "0 10px", borderRadius: 9, cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
                  background: soloNoLeidos ? "#7c3aed" : "#f5f3ff", color: soloNoLeidos ? "#fff" : "#7c3aed", border: `1px solid ${soloNoLeidos ? "#7c3aed" : "#ddd6fe"}` }}>
                No leídos{total > 0 ? ` · ${chats.filter((c) => c.count > 0).length}` : ""}
              </button>
            </div>
            {esperandoLista.length > 0 && (
              <button type="button" onClick={() => setSoloEsperando((v) => !v)}
                style={{ marginTop: 8, width: "100%", padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 800, textAlign: "left",
                  background: soloEsperando ? "#dc2626" : "#fef2f2", color: soloEsperando ? "#fff" : "#b91c1c", border: "1px solid #fca5a5" }}>
                ⏰ {esperandoLista.length} cliente{esperandoLista.length === 1 ? "" : "s"} sin respuesta hace +{MIN_ESPERA_CLIENTE} min{soloEsperando ? " · ver todos" : " · ver"}
              </button>
            )}
            {directorio.length > 0 && (
              <button type="button" onClick={() => setNuevoChat((v) => !v)} className="cp-btn"
                style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 8px", border: "none", borderRadius: 8, background: nuevoChat ? "#eff6ff" : "transparent", color: "#2563eb", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
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
              <div style={vacio}>{terminos.length ? `Sin resultados para "${busqueda.trim()}"` : soloNoLeidos ? "No tienes chats sin leer 👍" : "Todavía no hay chats."}</div>
            ) : lista.map((c) => {
              const esMio = norm(c.ultimo?.autor) === norm(autor);
              const esTec = c.tipo === "tecnico";
              return (
                <button key={c.key} type="button" className={`cp-item${seleccion === c.key ? " sel" : ""}`} onClick={() => abrir(c.key)} style={itemBtn} title={c.titulo}>
                  <span style={{ ...avatar, background: esTec ? "linear-gradient(135deg, #60a5fa, #2563eb)" : colorPara(c.ordenInfo?.nombre || c.titulo) }}>
                    {esTec ? iniciales(c.tecnicoNombre) : "📋"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: c.count ? 800 : 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {esTec ? `👷 ${c.titulo}` : c.titulo}
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 11, color: c.count ? "#7c3aed" : "#94a3b8", fontWeight: c.count ? 800 : 500 }}>{horaCorta(c.ultimo?.created_at)}</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: c.count ? "#334155" : "#64748b", fontWeight: c.count ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {esMio ? "Tú" : String(c.ultimo?.autor || "").split(" ")[0]}: {resumen(c.ultimo)}
                      </span>
                      {c.count > 0 && <span style={{ flexShrink: 0, minWidth: 20, height: 20, borderRadius: 10, padding: "0 6px", background: "#7c3aed", color: "#fff", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c.count}</span>}
                    </span>
                    {!!c.sub && !esTec && <span style={{ display: "block", fontSize: 11, color: "#94a3b8", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</span>}
                    {esperaMin(c) >= 0 && (
                      <span style={{ display: "inline-block", marginTop: 3, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "1px 8px",
                        background: esperaMin(c) >= MIN_ESPERA_CLIENTE ? "#dc2626" : "#dcfce7", color: esperaMin(c) >= MIN_ESPERA_CLIENTE ? "#fff" : "#15803d" }}>
                        {esperaMin(c) >= MIN_ESPERA_CLIENTE ? `⏰ Cliente espera hace ${esperaMin(c)} min` : "👤 Cliente escribió · responder"}
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
                  {sel.tipo === "tecnico" ? iniciales(sel.tecnicoNombre) : "📋"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {sel.tipo === "tecnico" ? `👷 ${sel.titulo}` : sel.titulo}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {sel.tipo === "tecnico" ? "Chat con oficina" : [sel.ordenInfo?.tecnico && `Técnico: ${sel.ordenInfo.tecnico}`, sel.ordenInfo?.direccion, sel.ordenInfo?.estado].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {!angosto && window.name !== "ventana_chats" && (
                  <button type="button" className="cp-btn" onClick={() => abrirVentanaChats(sel.key)} style={iconBtn} title="Abrir en ventana aparte"><ExternalLink size={17} color="#475569" /></button>
                )}
                <button type="button" className="cp-btn" onClick={() => setSeleccion(null)} style={iconBtn} title="Cerrar chat (Esc)"><X size={18} color="#475569" /></button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {sel.tipo === "tecnico" ? (
                  <OrdenChat key={sel.key} hiloTecnico={sel.tecnicoNombre} autor={autor} autorRol={autorRol} llenar />
                ) : (
                  <OrdenChat key={sel.key} ordenId={sel.ordenId} orden={sel.ordenInfo} ordenCodigo={sel.ordenInfo?.codigo} tecnicoAsignado={sel.ordenInfo?.tecnico} autor={autor} autorRol={autorRol} llenar />
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
    </div>
  );
}

const iconBtn = { width: 34, height: 34, borderRadius: 9, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, textDecoration: "none" };
const itemBtn = { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid #f8fafc", background: "#fff", cursor: "pointer", textAlign: "left", font: "inherit" };
const avatar = { width: 42, height: 42, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800 };
const vacio = { padding: "24px 16px", textAlign: "center", fontSize: 12.5, color: "#94a3b8" };
