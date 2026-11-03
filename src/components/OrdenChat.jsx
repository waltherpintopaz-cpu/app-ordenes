import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabaseClient";
import { marcarChatOrdenVisto } from "../services/chatOrdenesUnread";

const AVATAR_COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#ea580c", "#db2777", "#0891b2"];
function colorParaAutor(nombre) {
  const s = String(nombre || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function formatearFechaDivisor(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}
const UBICACION_DEFAULT = { lat: -16.409, lng: -71.537 };
function extraerUbicacionDeTexto(texto) {
  const m = String(texto || "").match(/https:\/\/www\.google\.com\/maps\?q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  return { url: m[0] };
}

// Chat compartido por orden de trabajo -- un solo hilo por orden, visible
// para el tecnico asignado y las gestoras/admin que ya pueden ver esa
// orden (el filtro de quien puede VER la orden lo resuelve la pantalla que
// usa este componente; aca solo se pide el orden_id). Version web,
// equivalente a src/components/OrdenChat.js de la app movil. Se actualiza
// solo via Supabase Realtime.
export default function OrdenChat({ ordenId, ordenCodigo, tecnicoAsignado, autor, autorRol }) {
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [imagenAmpliada, setImagenAmpliada] = useState(null);
  const [menuUbicacionAbierto, setMenuUbicacionAbierto] = useState(false);
  const [obteniendoUbicacion, setObteniendoUbicacion] = useState(false);
  const [selectorMapaAbierto, setSelectorMapaAbierto] = useState(false);
  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const markerRef = useRef(null);
  const pinRef = useRef(UBICACION_DEFAULT);

  useEffect(() => {
    if (!ordenId) { setCargando(false); return undefined; }
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("chat_ordenes_mensajes")
        .select("id,texto,foto_url,autor,autor_rol,created_at")
        .eq("orden_id", ordenId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelado) { setMensajes(data || []); setCargando(false); marcarChatOrdenVisto(ordenId); }
    })();
    const channel = supabase
      .channel(`chat-orden-${ordenId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_ordenes_mensajes", filter: `orden_id=eq.${ordenId}` }, (payload) => {
        setMensajes((prev) => prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        marcarChatOrdenVisto(ordenId);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_ordenes_mensajes", filter: `orden_id=eq.${ordenId}` }, (payload) => {
        setMensajes((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();
    return () => { cancelado = true; supabase.removeChannel(channel); };
  }, [ordenId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensajes]);

  // Inicializa el mini-mapa (Leaflet) solo cuando se abre el selector manual.
  useEffect(() => {
    if (!selectorMapaAbierto || !mapDivRef.current || mapRef.current) return;
    const centro = pinRef.current;
    const map = L.map(mapDivRef.current).setView([centro.lat, centro.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
    const marker = L.marker([centro.lat, centro.lng], { draggable: true }).addTo(map);
    marker.on("dragend", () => { const p = marker.getLatLng(); pinRef.current = { lat: p.lat, lng: p.lng }; });
    map.on("click", (e) => { marker.setLatLng(e.latlng); pinRef.current = { lat: e.latlng.lat, lng: e.latlng.lng }; });
    mapRef.current = map;
    markerRef.current = marker;
    setTimeout(() => map.invalidateSize(), 150);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [selectorMapaAbierto]);

  // El push de "Mensaje en orden" lo dispara un Database Webhook de
  // Supabase sobre esta misma tabla (ver dim-notificaciones-server,
  // /webhook/chat-ordenes) -- no hace falta llamar nada aca, solo insertar.
  const mandarMensaje = async (fotoUrl = "", textoForzado = null) => {
    const textoEnviado = textoForzado != null ? textoForzado : texto.trim();
    if (!textoEnviado && !fotoUrl) return;
    setEnviando(true);
    const { data, error } = await supabase
      .from("chat_ordenes_mensajes")
      .insert([{ orden_id: ordenId, texto: textoEnviado || null, foto_url: fotoUrl || null, autor: autor || "—", autor_rol: autorRol || null }])
      .select("id,texto,foto_url,autor,autor_rol,created_at")
      .single();
    if (!error && data) {
      setMensajes((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data]);
      if (textoForzado == null) setTexto("");
    }
    setEnviando(false);
  };

  const subirFoto = async (file) => {
    if (!file) return;
    setSubiendoFoto(true);
    try {
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `chat_ordenes/${ordenId}/${ymd}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("liquidaciones").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("liquidaciones").getPublicUrl(path);
      const url = String(data?.publicUrl || "");
      if (url) await mandarMensaje(url);
    } catch (e) {
      alert("No se pudo subir la foto: " + (e?.message || e));
    } finally {
      setSubiendoFoto(false);
    }
  };

  const borrarMensaje = async (id) => {
    if (!window.confirm("¿Eliminar este mensaje para todos?")) return;
    const { error } = await supabase.from("chat_ordenes_mensajes").delete().eq("id", id);
    if (!error) setMensajes((prev) => prev.filter((m) => m.id !== id));
  };

  const enviarUbicacionActual = () => {
    setMenuUbicacionAbierto(false);
    if (!navigator.geolocation) return alert("Este navegador no soporta geolocalización.");
    setObteniendoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObteniendoUbicacion(false);
        const url = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        void mandarMensaje("", `📍 Ubicación actual\n${url}`);
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

  const confirmarUbicacionManual = async () => {
    const { lat, lng } = pinRef.current;
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    setSelectorMapaAbierto(false);
    await mandarMensaje("", `📍 Ubicación compartida\n${url}`);
  };

  if (!ordenId) return null;

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8faff", marginTop: 16 }}>
      <div style={{ padding: "10px 12px 4px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Chat de la orden</span>
      </div>
      {cargando ? (
        <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: "#94a3b8" }}>Cargando…</div>
      ) : (
        <div ref={scrollRef} style={{ maxHeight: 260, overflowY: "auto", padding: 10, display: "grid", gap: 6 }}>
          {mensajes.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "6px 0" }}>Sin mensajes todavía. Escribe algo o manda una foto.</div>
          ) : (
            mensajes.map((m, i) => {
              const esMio = String(m.autor || "").trim().toLowerCase() === String(autor || "").trim().toLowerCase();
              const prev = mensajes[i - 1];
              const mismoAutorQuePrev = prev && String(prev.autor || "").trim().toLowerCase() === String(m.autor || "").trim().toLowerCase();
              const mismoDiaQuePrev = prev && new Date(prev.created_at).toDateString() === new Date(m.created_at).toDateString();
              const pocoTiempoDesdePrev = prev && (new Date(m.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000;
              const inicioDeGrupo = !prev || !mismoAutorQuePrev || !mismoDiaQuePrev || !pocoTiempoDesdePrev;
              const mostrarDivisorFecha = !prev || !mismoDiaQuePrev;
              const hora = new Date(m.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
              const ubicacion = m.texto ? extraerUbicacionDeTexto(m.texto) : null;
              return (
                <div key={m.id}>
                  {mostrarDivisorFecha && (
                    <div style={{ textAlign: "center", margin: "10px 0 8px" }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", background: "#eef2f7", borderRadius: 999, padding: "2px 10px" }}>
                        {formatearFechaDivisor(m.created_at)}
                      </span>
                    </div>
                  )}
                  <div className="chat-msg-row chat-msg-in" style={{ display: "flex", alignItems: "flex-end", gap: 6, justifyContent: esMio ? "flex-end" : "flex-start", marginTop: inicioDeGrupo ? 8 : 2 }}>
                    {!esMio && (
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        background: inicioDeGrupo ? colorParaAutor(m.autor) : "transparent",
                        color: "#fff", fontSize: 10, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        visibility: inicioDeGrupo ? "visible" : "hidden",
                      }}>
                        {String(m.autor || "?").trim().charAt(0).toUpperCase()}
                      </div>
                    )}
                    {esMio && (
                      <button type="button" onClick={() => borrarMensaje(m.id)} title="Borrar mensaje"
                        className="chat-msg-del"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 13, padding: 2, opacity: 0 }}>
                        🗑
                      </button>
                    )}
                    <div style={{
                      maxWidth: "76%", background: esMio ? "#2563eb" : "#fff", color: esMio ? "#fff" : "#0f172a",
                      border: esMio ? "none" : "1px solid #e2e8f0", borderRadius: 12, padding: "7px 10px",
                      borderBottomRightRadius: esMio && inicioDeGrupo ? 3 : 12,
                      borderBottomLeftRadius: !esMio && inicioDeGrupo ? 3 : 12,
                      boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
                    }}>
                      {!esMio && inicioDeGrupo && (
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: colorParaAutor(m.autor), marginBottom: 2 }}>
                          {m.autor}{m.autor_rol ? ` · ${m.autor_rol}` : ""}
                        </div>
                      )}
                      {ubicacion ? (
                        <a href={ubicacion.url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: esMio ? "#fff" : "#2563eb", textDecoration: "underline" }}>
                          📍 Ver ubicación en el mapa
                        </a>
                      ) : (
                        m.texto && <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{m.texto}</div>
                      )}
                      {m.foto_url && (
                        <img src={m.foto_url} alt="Adjunto" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 8, marginTop: m.texto ? 6 : 0, cursor: "pointer", display: "block" }}
                          onClick={() => setImagenAmpliada(m.foto_url)} />
                      )}
                      <div style={{ fontSize: 9.5, color: esMio ? "rgba(255,255,255,0.75)" : "#94a3b8", marginTop: 3, textAlign: "right" }}>
                        {hora}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {subiendoFoto && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", fontSize: 11, color: "#94a3b8" }}>
              Subiendo foto...
            </div>
          )}
        </div>
      )}
      <style>{`
        .chat-msg-row:hover .chat-msg-del { opacity: 1 !important; }
        @keyframes chatMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .chat-msg-in { animation: chatMsgIn .18s ease-out; }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, borderTop: "1px solid #e2e8f0", position: "relative" }}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subirFoto(f); }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={subiendoFoto}
          title="Adjuntar foto" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 17, padding: "4px 6px" }}>
          {subiendoFoto ? "…" : "📷"}
        </button>
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setMenuUbicacionAbierto((v) => !v)} disabled={obteniendoUbicacion}
            title="Compartir ubicación" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 17, padding: "4px 6px" }}>
            {obteniendoUbicacion ? "…" : "📍"}
          </button>
          {menuUbicacionAbierto && (
            <>
              <div onClick={() => setMenuUbicacionAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 9997 }} />
              <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,0.15)", zIndex: 9998, overflow: "hidden", minWidth: 170 }}>
                <button type="button" onClick={enviarUbicacionActual} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5 }}>📍 Ubicación actual</button>
                <button type="button" onClick={abrirSelectorMapa} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderTop: "1px solid #f1f5f9", cursor: "pointer", fontSize: 12.5 }}>🗺️ Elegir en el mapa</button>
              </div>
            </>
          )}
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void mandarMensaje(); } }}
          placeholder="Escribir mensaje..."
          rows={1}
          style={{ flex: 1, padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", maxHeight: 80 }}
        />
        <button type="button" onClick={() => void mandarMensaje()} disabled={enviando || !texto.trim()}
          style={{ background: texto.trim() ? "#1e40af" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: texto.trim() ? "pointer" : "default" }}>
          {enviando ? "…" : "Enviar"}
        </button>
      </div>

      {/* ── Imagen a pantalla completa ── */}
      {imagenAmpliada && (
        <div onClick={() => setImagenAmpliada(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={imagenAmpliada} alt="Adjunto" style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: 8 }} />
          <button type="button" onClick={() => setImagenAmpliada(null)} style={{ position: "absolute", top: 20, right: 24, background: "none", border: "none", color: "#fff", fontSize: 28, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* ── Selector manual de ubicacion (mapa con pin movible) ── */}
      {selectorMapaAbierto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,26,0.5)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "min(600px, 100%)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Elegir ubicación</span>
              <button type="button" onClick={() => setSelectorMapaAbierto(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#94a3b8" }}>✕</button>
            </div>
            <div ref={mapDivRef} style={{ height: 360, width: "100%" }} />
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, textAlign: "center" }}>Haz clic en el mapa o arrastra el pin para ajustar</div>
              <button type="button" onClick={() => void confirmarUbicacionManual()} style={{ width: "100%", background: "#1e40af", color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>
                Enviar esta ubicación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
