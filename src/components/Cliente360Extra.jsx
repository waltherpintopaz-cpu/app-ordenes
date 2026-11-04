import { useEffect, useRef, useState } from "react";

const DIAGNO_BASE = import.meta.env.DEV ? "" : "https://amnet-diagno.0lthka.easypanel.host";
const PROXY_URL = `${DIAGNO_BASE}/api/mikrowisp-proxy`;

const CHATWOOT_URL_DEFAULT = "https://chat.americanet.club";
const CHATWOOT_ACCOUNT_ID = "1";

// Cada cuanto se refresca sola la conversacion mientras el chat flotante
// esta abierto (no hay push/websocket aca, es polling simple).
const POLL_MS = 10000;

function formatearFecha(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatearHora(ts) {
  if (!ts) return "";
  try {
    return new Date(ts * 1000).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

const cardDet = { background: "#fff", borderRadius: 16, border: "1px solid #e8edf5", boxShadow: "0 2px 12px rgba(15,23,42,0.04)", padding: "20px 24px" };
const secLabel = { fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, display: "block" };

function ImagenAdjunta({ att }) {
  const [abierta, setAbierta] = useState(false);
  const url = att.data_url || att.thumb_url;
  if (!url) return null;
  return (
    <>
      <img
        src={att.thumb_url || att.data_url}
        alt="Adjunto"
        onClick={() => setAbierta(true)}
        style={{ maxWidth: 160, maxHeight: 160, borderRadius: 8, marginTop: 4, cursor: "zoom-in", display: "block" }}
      />
      {abierta && (
        <div onClick={() => setAbierta(false)}
          style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(10,10,26,0.8)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={url} alt="Adjunto" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}

function BurbujaMensaje({ m }) {
  const deCliente = m.message_type === 0;
  const imagenes = Array.isArray(m.attachments) ? m.attachments.filter((a) => a.file_type === "image") : [];
  return (
    <div style={{ display: "flex", justifyContent: deCliente ? "flex-start" : "flex-end" }}>
      <div style={{ maxWidth: "80%", background: deCliente ? "#f1f5f9" : "#dbeafe", color: "#0f172a", borderRadius: 10, padding: "7px 11px", fontSize: 12.5 }}>
        {m.content && <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>}
        {imagenes.map((a) => <ImagenAdjunta key={a.id} att={a} />)}
        {!m.content && imagenes.length === 0 && <div style={{ fontStyle: "italic", color: "#94a3b8" }}>(adjunto)</div>}
        <div style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 3 }}>{formatearHora(m.created_at)}</div>
      </div>
    </div>
  );
}

// Dos secciones dentro de la ficha de cliente (detalleCliente en App.jsx) --
// facturacion reciente y chat de WhatsApp reciente -- para que un gestor no
// tenga que saltar a "Diagnostico servicio" o a Chatwoot por separado.
// Portado desde app-ordenes-saas (DIM) 2026-11-03.
export default function Cliente360Extra({ cli, esDim, routerId }) {
  const [facturas, setFacturas] = useState(null);
  const [cargandoFacturas, setCargandoFacturas] = useState(false);
  const [errorFacturas, setErrorFacturas] = useState("");

  const [mensajes, setMensajes] = useState(null);
  const [cargandoChat, setCargandoChat] = useState(false);
  const [errorChat, setErrorChat] = useState("");
  const [chatLink, setChatLink] = useState("");
  // Guardados del ultimo cargarChat() -- hacen falta para poder responder
  // (mandar el mensaje a la cuenta/conversacion correcta) sin tener que
  // volver a resolverlos.
  const [chatCtx, setChatCtx] = useState(null); // { phone, accountId, convId }

  const [flotanteAbierto, setFlotanteAbierto] = useState(false);
  const [respuestaTexto, setRespuestaTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");

  const cargarFacturas = async () => {
    setCargandoFacturas(true);
    setErrorFacturas("");
    try {
      const dni = String(cli?.dni || "").replace(/\D/g, "");
      if (!dni) throw new Error("Cliente sin DNI registrado");
      const endpoint = esDim ? "mikrowisp-nod04" : "mikrowisp";
      const url = `${DIAGNO_BASE}/api/${endpoint}/GetClientsDetails`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: dni }),
      });
      const json = await res.json().catch(() => ({}));
      const datos = json?.datos?.[0] || json?.data?.[0];
      if (!datos?.id) throw new Error("No se encontró el cliente en Mikrowisp");
      const fr = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodo: routerId, accion: "GetInvoices", payload: { idcliente: datos.id } }),
      });
      const fj = await fr.json().catch(() => ({}));
      if (!fr.ok || fj?.ok === false) throw new Error(fj?.error || "No se pudo consultar la facturación");
      const facts = fj?.data?.facturas || fj?.facturas || fj?.data?.datos || fj?.data || [];
      setFacturas(Array.isArray(facts) ? facts.slice(0, 10) : []);
    } catch (err) {
      setErrorFacturas(String(err?.message || err));
      setFacturas([]);
    } finally {
      setCargandoFacturas(false);
    }
  };

  // silencioso=true: para el polling automatico, no prende el spinner ni
  // pisa el mensaje de error visible si falla una vez (reintenta solo).
  const cargarChat = async (silencioso = false) => {
    if (!silencioso) { setCargandoChat(true); setErrorChat(""); }
    try {
      const phone = String(cli?.celular || "").replace(/\D/g, "");
      const dni = String(cli?.dni || "").replace(/\D/g, "");
      if (!phone && !dni) throw new Error("Cliente sin celular ni DNI registrado");
      const accountId = CHATWOOT_ACCOUNT_ID;
      const chatwootUrl = CHATWOOT_URL_DEFAULT;
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // dni: respaldo si el celular registrado en la ficha no es el que
        // el cliente realmente usa para escribir por WhatsApp.
        body: JSON.stringify({ accion: "GetChatwootMessages", payload: { phone, dni, account_id: accountId } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "No se pudo consultar WhatsApp");
      // GetChatwootMessages devuelve messages/convIds en la raiz de la
      // respuesta (no bajo "data"), igual que lo consume SidebarApp.jsx.
      const msgs = Array.isArray(json?.messages) ? json.messages : [];
      const convIds = Array.isArray(json?.convIds) ? json.convIds : [];
      // Mas recientes primero, los ultimos 15
      const ordenados = [...msgs].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 15);
      // El telefono real del contacto en Chatwoot puede diferir del que
      // tenemos en Supabase (ej. cli.celular con varios numeros pegados) --
      // para responder usamos el que Chatwoot ya reconoce.
      const msgContacto = msgs.find((m) => m?.sender?.type === "contact" && m.sender.phone_number);
      setChatCtx({ phone: msgContacto?.sender?.phone_number || phone, accountId, convId: convIds[0] || null });
      setMensajes(ordenados);
      setChatLink(convIds[0] ? `${chatwootUrl}/app/accounts/${accountId}/conversations/${convIds[0]}` : "");
      if (!silencioso) setErrorChat("");
    } catch (err) {
      if (!silencioso) { setErrorChat(String(err?.message || err)); setMensajes([]); }
    } finally {
      if (!silencioso) setCargandoChat(false);
    }
  };

  const enviarRespuesta = async () => {
    if (!respuestaTexto.trim() || !chatCtx?.phone) return;
    setEnviando(true);
    setErrorEnvio("");
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "ChatwootMessage",
          payload: { phone: chatCtx.phone, message: respuestaTexto.trim(), account_id: chatCtx.accountId, conv_id: chatCtx.convId },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "No se pudo enviar");
      setRespuestaTexto("");
      await cargarChat(true);
    } catch (err) {
      setErrorEnvio(String(err?.message || err));
    } finally {
      setEnviando(false);
    }
  };

  // Polling simple mientras el chat flotante esta abierto -- no hay
  // websocket/push de Chatwoot disponible en este panel.
  const pollRef = useRef(null);
  useEffect(() => {
    if (!flotanteAbierto) { clearInterval(pollRef.current); return undefined; }
    pollRef.current = setInterval(() => { void cargarChat(true); }, POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flotanteAbierto]);

  const listaMensajes = Array.isArray(mensajes) ? mensajes : [];

  const cajaRespuesta = (
    <div style={{ marginTop: 10 }}>
      {errorEnvio && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "6px 9px", borderRadius: 6, fontSize: 11, marginBottom: 6 }}>{errorEnvio}</div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <textarea
          value={respuestaTexto}
          onChange={(e) => setRespuestaTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviarRespuesta(); } }}
          placeholder="Escribir respuesta por WhatsApp..."
          rows={2}
          disabled={enviando || !chatCtx?.phone}
          style={{ flex: 1, padding: "7px 9px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", resize: "vertical", outline: "none" }}
        />
        <button
          onClick={enviarRespuesta}
          disabled={enviando || !respuestaTexto.trim() || !chatCtx?.phone}
          style={{ padding: "0 14px", background: respuestaTexto.trim() ? "#15803d" : "#e2e8f0", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: respuestaTexto.trim() ? "pointer" : "default" }}
        >
          {enviando ? "..." : "Enviar"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1fr 1fr" }}>
      {/* ── Facturación reciente ── */}
      <div style={cardDet}>
        <span style={secLabel}>Facturación reciente</span>
        {facturas === null && (
          <button
            onClick={cargarFacturas}
            disabled={cargandoFacturas}
            style={{ padding: "8px 15px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, color: "#1e40af", fontSize: 12, fontWeight: 700, cursor: cargandoFacturas ? "wait" : "pointer" }}
          >
            {cargandoFacturas ? "Consultando…" : "💳 Cargar facturas"}
          </button>
        )}
        {errorFacturas && (
          <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "9px 12px", borderRadius: 8, fontSize: 12, marginTop: 8 }}>{errorFacturas}</div>
        )}
        {Array.isArray(facturas) && facturas.length === 0 && !errorFacturas && (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Sin facturas registradas.</div>
        )}
        {Array.isArray(facturas) && facturas.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {facturas.map((f, i) => {
              // El campo real que devuelve Mikrowisp es "estado": "pagado" o
              // "No pagado" -- ambos contienen la subcadena "pagad", asi que
              // un .test(/pagad/i) marcaba las DOS como pagadas. Match exacto.
              const estadoFactura = String(f.estado || "").trim().toLowerCase();
              const pagada = estadoFactura === "pagado" || estadoFactura === "cancelado";
              return (
                <div key={f.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid #f8fafc" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                      {formatearFecha(f.emitido)} <span style={{ fontWeight: 400, color: "#94a3b8" }}>· #{f.id || i}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                      {f.tipo_factura || "Factura"}
                      {f.vencimiento && ` · Vence ${formatearFecha(f.vencimiento)}`}
                      {pagada && f.fechapago && f.fechapago !== "0000-00-00" && ` · Pagado ${formatearFecha(f.fechapago)}`}
                      {pagada && f.formapago && ` (${f.formapago})`}
                    </div>
                    {f.urlpdf && (
                      <a href={f.urlpdf} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "#2563eb" }}>Ver PDF ↗</a>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>S/ {f.total ?? "—"}</div>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: pagada ? "#dcfce7" : "#fef3c7", color: pagada ? "#15803d" : "#92400e" }}>
                      {f.estado || "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Conversación WhatsApp reciente -- launcher compacto, el chat
          completo (mensajes, responder, imagenes) vive solo en el panel
          flotante para no duplicar la misma info dos veces en la ficha. ── */}
      <div style={cardDet}>
        <span style={secLabel}>Conversación WhatsApp reciente</span>
        {mensajes === null && (
          <button
            onClick={() => cargarChat(false)}
            disabled={cargandoChat}
            style={{ padding: "8px 15px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, color: "#15803d", fontSize: 12, fontWeight: 700, cursor: cargandoChat ? "wait" : "pointer" }}
          >
            {cargandoChat ? "Consultando…" : "💬 Cargar conversación"}
          </button>
        )}
        {errorChat && (
          <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "9px 12px", borderRadius: 8, fontSize: 12, marginTop: 8 }}>{errorChat}</div>
        )}
        {Array.isArray(mensajes) && mensajes.length === 0 && !errorChat && (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Sin conversaciones registradas.</div>
        )}
        {Array.isArray(mensajes) && mensajes.length > 0 && (() => {
          const ultimo = mensajes[0]; // ya vienen ordenados mas reciente primero
          const deCliente = ultimo.message_type === 0;
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: deCliente ? "#0f172a" : "#2563eb" }}>
                  {deCliente ? (cli?.nombre || "Cliente") : "Nosotros"}
                </span>
                <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>{formatearHora(ultimo.created_at)}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#475569", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ultimo.content || (Array.isArray(ultimo.attachments) && ultimo.attachments.length ? "📎 Adjunto" : "—")}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => setFlotanteAbierto(true)}
                  style={{ padding: "7px 13px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, color: "#15803d", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  💬 Abrir chat
                </button>
                <button onClick={() => cargarChat(false)} disabled={cargandoChat} title="Actualizar"
                  style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 10, padding: "7px 10px", fontSize: 12, cursor: "pointer", color: "#64748b" }}>
                  {cargandoChat ? "…" : "🔄"}
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Panel flotante del chat -- mismo estado/datos que la tarjeta,
          para poder seguir viendo/respondiendo mientras se scrollea el
          resto de la ficha. ── */}
      {flotanteAbierto && (
        <div style={{
          position: "fixed", right: 20, bottom: 20, zIndex: 9999,
          width: 360, maxWidth: "calc(100vw - 32px)", maxHeight: "72vh", display: "flex", flexDirection: "column",
          background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 16px 44px rgba(15,23,42,0.28)", overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #e2e8f0", background: "#f8faff", flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>{cli?.nombre || "Cliente"}</div>
              <div style={{ fontSize: 10.5, color: "#94a3b8" }}>WhatsApp · se actualiza solo cada {POLL_MS / 1000}s</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {chatLink && (
                <a href={chatLink} target="_blank" rel="noreferrer" title="Ver conversación completa en Chatwoot"
                  style={{ fontSize: 11, fontWeight: 700, color: "#2563eb" }}>↗</a>
              )}
              <button onClick={() => cargarChat(false)} disabled={cargandoChat} title="Actualizar"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#64748b" }}>🔄</button>
              <button onClick={() => setFlotanteAbierto(false)} title="Cerrar"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#94a3b8" }}>✕</button>
            </div>
          </div>
          <div style={{ padding: "10px 14px", overflowY: "auto", flex: 1 }}>
            {errorChat && (
              <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "9px 12px", borderRadius: 8, fontSize: 12, marginBottom: 8 }}>{errorChat}</div>
            )}
            {listaMensajes.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>Sin conversaciones registradas.</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {[...listaMensajes].reverse().map((m, i) => <BurbujaMensaje key={m.id || i} m={m} />)}
              </div>
            )}
          </div>
          <div style={{ padding: "8px 14px 12px", borderTop: "1px solid #f1f5f9", flexShrink: 0 }}>
            {cajaRespuesta}
          </div>
        </div>
      )}
    </div>
  );
}
