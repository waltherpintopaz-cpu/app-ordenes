import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "../supabaseClient";
import { getUltimoVisto, sincronizarVistosOrdenes, guardarLecturaOrdenRemota } from "../services/chatOrdenesUnread";
import { getUltimoVistoTecnico, sincronizarVistosTecnicos, guardarLecturaTecnicoRemota } from "../services/chatTecnicosUnread";

// Boton flotante global (no depende de estar viendo una orden puntual):
// avisa en cuales ordenes hay mensajes de chat que este usuario todavia no
// vio, con acceso directo a abrir ese chat. Equivalente web de
// ChatOrdenesFlotante.js (app movil). "Visto" se guarda en localStorage --
// OrdenChat.jsx marca visto automaticamente al abrir/recibir mensajes.
// Beep + notificacion de escritorio al llegar un mensaje nuevo -- mismo
// mecanismo que avisarSolicitudWebNueva (linea ~528 de App.jsx), para que
// no haga falta tener la mirada fija en la pantalla para enterarse.
function avisarChatOrdenNuevo(ordenInfo, msg) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      [0, 0.2].forEach((t0) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 660;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + t0);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + 0.15);
        osc.start(ctx.currentTime + t0);
        osc.stop(ctx.currentTime + t0 + 0.16);
      });
    }
  } catch { /* sin audio */ }
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`💬 ${ordenInfo?.codigo || "Orden"} · ${ordenInfo?.nombre || "Cliente"}`, {
        body: `${msg.autor || "Alguien"}: ${msg.texto || (msg.foto_url ? "📎 Foto" : "")}`,
        tag: `chat-orden-${msg.orden_id}`,
      });
    }
  } catch { /* sin notificaciones */ }
}

export default function ChatOrdenesFlotante({ ordenes, tecnicos, tecnicosDirectorio, autor, onAbrirOrden, onAbrirTecnico }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [soloNoLeidos, setSoloNoLeidos] = useState(false);
  const [chats, setChats] = useState([]);
  const [cargando, setCargando] = useState(false);
  const ordenesRef = useRef(ordenes);
  ordenesRef.current = ordenes;
  const tecnicosRef = useRef(tecnicos);
  tecnicosRef.current = tecnicos;

  // Pide permiso de notificacion del navegador una sola vez (si todavia no
  // se decidio) -- el resto de la app ya hace esto mismo para Solicitudes
  // web, asi que si ya esta "granted" de antes esto no vuelve a preguntar.
  useEffect(() => {
    try {
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    } catch { /* sin notificaciones */ }
  }, []);

  const recalcular = useCallback(async () => {
    const listaOrdenes = ordenesRef.current || [];
    const listaTecnicos = tecnicosRef.current || [];
    if (!listaOrdenes.length && !listaTecnicos.length) { setChats([]); return; }
    setCargando(true);
    try {
      // Lo leido en otro dispositivo (app movil) tambien cuenta como leido aca.
      await Promise.all([sincronizarVistosOrdenes(autor), sincronizarVistosTecnicos(autor)]);
      const resultado = [];

      if (listaOrdenes.length) {
        // No se manda el .in(orden_id, ids) con TODOS los ids cargados -- si
        // hay cientos de ordenes esa consulta puede fallar en silencio (url
        // muy larga). Se trae lo reciente sin filtro y se cruza aca mismo.
        const idsSet = new Set(listaOrdenes.map((o) => String(o.id)));
        const { data, error } = await supabase
          .from("chat_ordenes_mensajes")
          .select("id,orden_id,texto,foto_url,autor,created_at")
          .order("created_at", { ascending: false })
          .limit(300);
        if (error) {
          console.warn("ChatOrdenesFlotante: error cargando mensajes de orden", error.message);
        } else {
          const porOrden = new Map();
          for (const m of data || []) {
            if (!idsSet.has(String(m.orden_id))) continue;
            if (!porOrden.has(m.orden_id)) porOrden.set(m.orden_id, []);
            porOrden.get(m.orden_id).push(m);
          }
          for (const [ordenId, msgs] of porOrden.entries()) {
            const visto = getUltimoVisto(ordenId);
            const vistoTime = visto ? new Date(visto).getTime() : 0;
            const noLeidos = msgs.filter((m) =>
              String(m.autor || "").trim().toLowerCase() !== String(autor || "").trim().toLowerCase() &&
              new Date(m.created_at).getTime() > vistoTime
            ).length;
            const ordenInfo = listaOrdenes.find((o) => String(o.id) === String(ordenId));
            resultado.push({
              tipo: "orden", key: `orden-${ordenId}`, ordenId,
              titulo: `${ordenInfo?.codigo || ""} · ${ordenInfo?.nombre || "Cliente"}`,
              count: noLeidos, ultimo: msgs[0], ordenInfo,
            });
          }
        }
      }

      if (listaTecnicos.length) {
        const nombresSet = new Set(listaTecnicos.map((n) => String(n)));
        const { data, error } = await supabase
          .from("chat_tecnicos_mensajes")
          .select("id,tecnico_nombre,texto,foto_url,autor,created_at")
          .order("created_at", { ascending: false })
          .limit(300);
        if (error) {
          console.warn("ChatOrdenesFlotante: error cargando mensajes de tecnico", error.message);
        } else {
          const porTecnico = new Map();
          for (const m of data || []) {
            if (!nombresSet.has(String(m.tecnico_nombre))) continue;
            if (!porTecnico.has(m.tecnico_nombre)) porTecnico.set(m.tecnico_nombre, []);
            porTecnico.get(m.tecnico_nombre).push(m);
          }
          for (const [tecnicoNombre, msgs] of porTecnico.entries()) {
            const visto = getUltimoVistoTecnico(tecnicoNombre);
            const vistoTime = visto ? new Date(visto).getTime() : 0;
            const noLeidos = msgs.filter((m) =>
              String(m.autor || "").trim().toLowerCase() !== String(autor || "").trim().toLowerCase() &&
              new Date(m.created_at).getTime() > vistoTime
            ).length;
            resultado.push({
              tipo: "tecnico", key: `tecnico-${tecnicoNombre}`, tecnicoNombre,
              titulo: `🏢 ${tecnicoNombre}`,
              count: noLeidos, ultimo: msgs[0],
            });
          }
        }
      }

      resultado.sort((a, b) => new Date(b.ultimo.created_at) - new Date(a.ultimo.created_at));
      setChats(resultado);
    } finally {
      setCargando(false);
    }
  }, [autor]);

  // "recalcular" por si solo no cambia cuando cambia "ordenes" (se lee via
  // ref para no resuscribir el canal de abajo en cada render) -- sin
  // "ordenes" en las deps, si la lista llegaba vacia al montar y se
  // llenaba despues (carga async), nunca se volvia a calcular y el boton
  // se quedaba escondido para siempre.
  useEffect(() => { void recalcular(); }, [ordenes, tecnicos, recalcular]);

  // Sin filtro especifico de orden_id/tecnico_nombre (Realtime no soporta
  // filtro "in") -- se filtra aca mismo contra lo que este usuario puede ver.
  useEffect(() => {
    const channelOrdenes = supabase
      .channel("chat-ordenes-unread-global")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_ordenes_mensajes" }, (payload) => {
        const msg = payload.new;
        if (!msg) return;
        const ordenInfo = (ordenesRef.current || []).find((o) => String(o.id) === String(msg.orden_id));
        if (!ordenInfo) return;
        if (String(msg.autor || "").trim().toLowerCase() !== String(autor || "").trim().toLowerCase()) {
          avisarChatOrdenNuevo(ordenInfo, msg);
        }
        void recalcular();
      })
      .subscribe();
    const channelTecnicos = supabase
      .channel("chat-tecnicos-unread-global")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_tecnicos_mensajes" }, (payload) => {
        const msg = payload.new;
        if (!msg) return;
        const esMio = (tecnicosRef.current || []).some((n) => String(n) === String(msg.tecnico_nombre));
        if (!esMio) return;
        void recalcular();
      })
      .subscribe();
    // Este mismo usuario leyo un chat en otro dispositivo -> se apaga el globo aca.
    const channelLecturas = autor ? supabase
      .channel(`chat-lecturas-global-${autor}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_ordenes_lecturas", filter: `usuario=eq.${autor}` }, (payload) => {
        guardarLecturaOrdenRemota(payload.new);
        void recalcular();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_tecnicos_lecturas", filter: `usuario=eq.${autor}` }, (payload) => {
        guardarLecturaTecnicoRemota(payload.new);
        void recalcular();
      })
      .subscribe() : null;
    return () => { supabase.removeChannel(channelOrdenes); supabase.removeChannel(channelTecnicos); if (channelLecturas) supabase.removeChannel(channelLecturas); };
  }, [autor, recalcular]);

  const totalNoLeidos = chats.reduce((s, it) => s + it.count, 0);

  // Buscador: filtra al instante por codigo de orden, cliente, tecnico,
  // direccion o texto del ultimo mensaje (sin tildes ni mayusculas; varias
  // palabras = todas deben aparecer).
  const plano = (v) => String(v || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const terminos = plano(busqueda).split(/\s+/).filter(Boolean);
  const coincide = (...campos) => {
    if (!terminos.length) return true;
    const t = plano(campos.filter(Boolean).join(" "));
    return terminos.every((w) => t.includes(w));
  };
  const noLeidosDe = (nombre) => chats.find((c) => c.tipo === "tecnico" && String(c.tecnicoNombre) === String(nombre))?.count || 0;
  const chatsFiltrados = chats.filter((c) =>
    (!soloNoLeidos || c.count > 0) &&
    coincide(c.titulo, c.tecnicoNombre, c.ordenInfo?.codigo, c.ordenInfo?.nombre, c.ordenInfo?.tecnico,
      c.ordenInfo?.direccion, c.ordenInfo?.celular, c.ultimo?.texto, c.ultimo?.autor));
  const directorioFiltrado = (Array.isArray(tecnicosDirectorio) ? tecnicosDirectorio : [])
    .filter((t) => (!soloNoLeidos || noLeidosDe(t.nombre) > 0) && coincide(t.nombre));
  const chatsConNoLeidos = chats.filter((c) => c.count > 0).length;
  const cerrarBandeja = () => { setAbierto(false); setBusqueda(""); setSoloNoLeidos(false); };
  // Siempre visible -- antes se escondia del todo si no habia chats, y el
  // usuario no queria que el boton desapareciera (pedido explicito).

  return (
    <>
      <style>{`
        @keyframes chatFabPulseRing {
          0%   { box-shadow: 0 6px 20px rgba(124,58,237,0.4), 0 0 0 0 rgba(124,58,237,0.55); }
          70%  { box-shadow: 0 6px 20px rgba(124,58,237,0.4), 0 0 0 14px rgba(124,58,237,0); }
          100% { box-shadow: 0 6px 20px rgba(124,58,237,0.4), 0 0 0 0 rgba(124,58,237,0); }
        }
        @keyframes chatFabBadgePop {
          0%   { transform: scale(0.5); }
          60%  { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .chat-fab-btn:hover { transform: scale(1.08); }
        .chat-fab-btn:active { transform: scale(0.96); }
        @keyframes chatPopupIn { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .chat-popup-in { animation: chatPopupIn .15s ease-out; transform-origin: bottom right; }
      `}</style>
      <button
        className="chat-fab-btn"
        onClick={() => { setAbierto(true); void recalcular(); }}
        title="Chats recientes de órdenes"
        style={{
          position: "fixed", right: 20, bottom: 90, zIndex: 9998,
          width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
          background: totalNoLeidos > 0
            ? "linear-gradient(135deg, #a855f7, #6d28d9)"
            : "linear-gradient(135deg, #cbd5e1, #94a3b8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: totalNoLeidos > 0 ? "0 6px 20px rgba(124,58,237,0.4)" : "0 4px 14px rgba(15,23,42,0.2)",
          transition: "transform .15s cubic-bezier(.34,1.56,.64,1)",
          animation: totalNoLeidos > 0 ? "chatFabPulseRing 2.2s ease-out infinite" : "none",
        }}
      >
        <MessageCircle size={24} color="#fff" strokeWidth={2.3} />
        {totalNoLeidos > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11,
            background: "#ef4444", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 5px", fontSize: 11, fontWeight: 800, border: "2.5px solid #fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)", animation: "chatFabBadgePop .3s cubic-bezier(.34,1.56,.64,1)",
          }}>
            {totalNoLeidos > 99 ? "99+" : totalNoLeidos}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div onClick={cerrarBandeja} style={{ position: "fixed", inset: 0, zIndex: 9997 }} />
          <div className="chat-popup-in" style={{
            position: "fixed", right: 20, bottom: 150, zIndex: 9998,
            width: 340, maxWidth: "calc(100vw - 32px)", maxHeight: "60vh", display: "flex", flexDirection: "column",
            background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
            boxShadow: "0 12px 32px rgba(0,0,0,0.25)", overflow: "hidden",
          }}>
            <div style={{ padding: "10px 12px 0", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
                Chats recientes
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", borderRadius: 8, padding: "0 8px", height: 32 }}>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>🔍</span>
                  <input
                    autoFocus
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { if (busqueda) setBusqueda(""); else cerrarBandeja(); } }}
                    placeholder="Buscar orden, cliente, técnico..."
                    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: "#0f172a", font: "inherit" }}
                  />
                  {!!busqueda && (
                    <button type="button" onClick={() => setBusqueda("")} title="Limpiar"
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSoloNoLeidos((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 9px", borderRadius: 8, cursor: "pointer", font: "inherit",
                    fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
                    background: soloNoLeidos ? "#7c3aed" : "#f5f3ff", color: soloNoLeidos ? "#fff" : "#7c3aed",
                    border: `1px solid ${soloNoLeidos ? "#7c3aed" : "#ddd6fe"}`,
                  }}
                >
                  No leídos
                  {chatsConNoLeidos > 0 && (
                    <span style={{ minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px", fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: soloNoLeidos ? "#fff" : "#7c3aed", color: soloNoLeidos ? "#7c3aed" : "#fff" }}>{chatsConNoLeidos}</span>
                  )}
                </button>
              </div>
              {directorioFiltrado.length > 0 && (
                <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                    Iniciar chat con técnico
                  </div>
                  <div style={{ display: "flex", flexWrap: "nowrap", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
                    {directorioFiltrado.map((tec) => {
                      const iniciales = String(tec.nombre || "")
                        .trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
                      return (
                        <button
                          key={tec.id || tec.nombre}
                          type="button"
                          onClick={() => { cerrarBandeja(); onAbrirTecnico && onAbrirTecnico(tec.nombre); }}
                          title={`Chat con ${tec.nombre}`}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            width: 56, flexShrink: 0, background: "transparent", border: "none", cursor: "pointer", font: "inherit", padding: 0,
                          }}
                        >
                          <span style={{
                            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                            background: "linear-gradient(135deg, #60a5fa, #2563eb)", color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 13.5, fontWeight: 800, boxShadow: "0 2px 6px rgba(37,99,235,0.3)",
                          }}>
                            {iniciales || "👷"}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: "#475569", textAlign: "center",
                            lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%",
                          }}>
                            {tec.nombre}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: "0 12px 10px", overflowY: "auto", flex: 1, minHeight: 0 }}>
            {cargando && chats.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "10px 0" }}>Cargando…</div>
            ) : chatsFiltrados.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "10px 0" }}>
                {terminos.length ? `Sin resultados para "${busqueda.trim()}".` : soloNoLeidos ? "No tienes chats sin leer 👍" : "Todavía no hay chats."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {chatsFiltrados.map((item) => {
                  const esMio = String(item.ultimo.autor || "").trim().toLowerCase() === String(autor || "").trim().toLowerCase();
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        cerrarBandeja();
                        if (item.tipo === "tecnico") {
                          onAbrirTecnico && onAbrirTecnico(item.tecnicoNombre);
                        } else {
                          onAbrirOrden(item.ordenInfo || { id: item.ordenId, codigo: item.titulo });
                        }
                      }}
                      style={{
                        textAlign: "left", background: item.count > 0 ? "#f5f3ff" : "#f8fafc", border: `1px solid ${item.count > 0 ? "#ddd6fe" : "#e2e8f0"}`, borderRadius: 8,
                        padding: "8px 10px", cursor: "pointer", font: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12.5, fontWeight: item.count > 0 ? 800 : 700, color: "#0f172a" }}>{item.titulo}</span>
                        {item.count > 0 && (
                          <span style={{ background: "#7c3aed", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{item.count}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#475569", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {esMio ? "Tú" : item.ultimo.autor}: {item.ultimo.texto || (item.ultimo.foto_url ? "📎 Foto" : "")}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
