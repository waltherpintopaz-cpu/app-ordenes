import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Vista de solo lectura: junta en una sola linea de tiempo los mensajes de
// TODOS los chats por-orden de un cliente (instalacion, incidencias, etc),
// con un separador claro cada vez que cambia de orden -- pedido explicito
// del usuario 2026-11-03: "si quiero ver el chat de este cliente con su
// historial... cuando lo abra debe tener el historial del chat claro
// diferenciado". El chat real sigue siendo uno por orden (no se fusionan
// los datos, solo la vista); tocar una seccion abre el chat real de esa
// orden para poder contestar.
//
// Las ordenes del cliente se traen directo de la tabla `ordenes` por DNI
// (no de `clientes.historial_instalaciones`, que en la practica no se
// esta llenando al liquidar -- confirmado 2026-11-03 con un cliente recien
// liquidado que tenia esa columna en null).
const cardDet = { background: "#fff", borderRadius: 16, border: "1px solid #e8edf5", boxShadow: "0 2px 12px rgba(15,23,42,0.04)", padding: "20px 24px" };
const secLabel = { fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, display: "block" };

function iconoPorTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t.includes("incidenc")) return "⚠️";
  if (t.includes("recup")) return "↩️";
  if (t.includes("instal")) return "🔧";
  return "📋";
}

function formatearFecha(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatearHora(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ClienteChatHistorial({ cli, onAbrirChatOrden }) {
  const [ordenesCliente, setOrdenesCliente] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const dni = String(cli?.dni || cli?.codigoCliente || "").trim();

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!dni) { setOrdenesCliente([]); setMensajes([]); return; }
      setCargando(true);
      setError("");
      try {
        const { data: ords, error: errOrd } = await supabase
          .from("ordenes")
          .select("id,codigo,tipo_actuacion,tecnico,fecha_actuacion,estado")
          .eq("dni", dni)
          .order("fecha_actuacion", { ascending: false });
        if (errOrd) throw errOrd;
        const lista = (ords || []).map((o) => ({
          ordenId: o.id, codigoOrden: o.codigo || "", tipoActuacion: o.tipo_actuacion || "",
          tecnico: o.tecnico || "", fecha: o.fecha_actuacion || "", estado: o.estado || "",
        }));
        if (cancelado) return;
        setOrdenesCliente(lista);
        if (!lista.length) { setMensajes([]); return; }
        const ids = lista.map((h) => h.ordenId);
        const { data: msgs, error: errMsgs } = await supabase
          .from("chat_ordenes_mensajes")
          .select("id,orden_id,texto,foto_url,autor,autor_rol,created_at")
          .in("orden_id", ids)
          .order("created_at", { ascending: true });
        if (errMsgs) throw errMsgs;
        if (!cancelado) setMensajes(msgs || []);
      } catch (e) {
        if (!cancelado) setError(e?.message || "No se pudo cargar el historial de chat.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [dni]);

  if (!dni) return null;
  if (!cargando && !error && ordenesCliente.length === 0) return null;

  const grupos = [];
  for (const m of mensajes) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && String(ultimo.ordenId) === String(m.orden_id)) {
      ultimo.msgs.push(m);
    } else {
      const info = ordenesCliente.find((h) => String(h.ordenId) === String(m.orden_id)) || {};
      grupos.push({ ordenId: m.orden_id, info, msgs: [m] });
    }
  }

  return (
    <div style={cardDet}>
      <span style={secLabel}>Historial de conversación</span>
      {cargando && <div style={{ fontSize: 12.5, color: "#94a3b8" }}>Cargando…</div>}
      {error && <div style={{ fontSize: 12.5, color: "#dc2626" }}>{error}</div>}
      {!cargando && !error && grupos.length === 0 && (
        <div style={{ fontSize: 12.5, color: "#94a3b8" }}>Sin mensajes todavía en ninguna de sus órdenes.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxHeight: 420, overflowY: "auto" }}>
        {grupos.map((g, gi) => (
          <div key={`${g.ordenId}-${gi}`}>
            <button
              onClick={() => onAbrirChatOrden && onAbrirChatOrden({ id: g.ordenId, codigo: g.info.codigoOrden, nombre: cli?.nombre, tecnico: g.info.tecnico })}
              title="Abrir chat de esta orden"
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                background: "#f5f3ff", border: "1px solid #e9e4fb", borderRadius: 8, padding: "6px 10px",
                cursor: "pointer", marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 14 }}>{iconoPorTipo(g.info.tipoActuacion)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "#5b21b6" }}>
                {g.info.tipoActuacion || "Orden"} · {g.info.codigoOrden || `#${g.ordenId}`}
              </span>
              <span style={{ fontSize: 10.5, color: "#94a3b8", marginLeft: "auto" }}>{formatearFecha(g.msgs[0]?.created_at)}</span>
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 6 }}>
              {g.msgs.map((m) => (
                <div key={m.id} style={{ fontSize: 12, color: "#334155" }}>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{m.autor || "—"}</span>
                  <span style={{ color: "#94a3b8" }}> · {formatearHora(m.created_at)}</span>
                  {m.texto && <div style={{ whiteSpace: "pre-wrap" }}>{m.texto}</div>}
                  {m.foto_url && !m.texto && <div style={{ color: "#64748b", fontStyle: "italic" }}>📷 Foto</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
