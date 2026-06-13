import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const PROXY_URL = "https://n8n.americanet.space/webhook/sidebar-proxy";
const BASE_URL  = window.location.origin;

const ESTADOS = [
  { key: "pendiente",   label: "Pendiente",   color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  { key: "en_proceso",  label: "En proceso",  color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  { key: "resuelto",    label: "Resuelto",    color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
  { key: "cerrado",     label: "Cerrado",     color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" },
];

const TIPOS = [
  { key: "todos",   label: "Todos" },
  { key: "reclamo", label: "Reclamos" },
  { key: "queja",   label: "Quejas" },
];

function estadoInfo(key) {
  return ESTADOS.find(e => e.key === key) || ESTADOS[0];
}

function fmtFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ReclamacionesPanel() {
  const [lista, setLista]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("pendiente");
  const [filtroTipo, setFiltroTipo]    = useState("todos");
  const [busq, setBusq]           = useState("");
  const [detalle, setDetalle]     = useState(null); // registro abierto
  const [respuesta, setRespuesta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg]             = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("libro_reclamaciones")
      .select("*")
      .order("fecha_registro", { ascending: false });
    if (filtroEstado !== "todos") q = q.eq("estado", filtroEstado);
    if (filtroTipo !== "todos")   q = q.eq("tipo", filtroTipo);
    const { data } = await q;
    setLista(data || []);
    setLoading(false);
  }, [filtroEstado, filtroTipo]);

  useEffect(() => { cargar(); }, [cargar]);

  function notify(text, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function actualizarEstado(id, nuevoEstado) {
    setGuardando(true);
    const extra = ["resuelto", "cerrado"].includes(nuevoEstado) ? { fecha_respuesta: new Date().toISOString() } : {};
    const { error } = await supabase
      .from("libro_reclamaciones")
      .update({ estado: nuevoEstado, ...extra })
      .eq("id", id);
    if (error) { notify("Error al actualizar: " + error.message, false); }
    else {
      notify("Estado actualizado");
      setDetalle(d => d ? { ...d, estado: nuevoEstado, ...extra } : null);
      setLista(l => l.map(r => r.id === id ? { ...r, estado: nuevoEstado, ...extra } : r));
    }
    setGuardando(false);
  }

  async function guardarRespuesta(id) {
    if (!respuesta.trim()) return notify("Escribe una respuesta primero", false);
    setGuardando(true);
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from("libro_reclamaciones")
      .update({ respuesta: respuesta.trim(), estado: "resuelto", fecha_respuesta: ahora })
      .eq("id", id);
    if (error) { notify("Error: " + error.message, false); setGuardando(false); return; }

    notify("Respuesta guardada — enviando WhatsApp...");
    setDetalle(d => d ? { ...d, respuesta: respuesta.trim(), estado: "resuelto", fecha_respuesta: ahora } : null);
    setLista(l => l.map(r => r.id === id ? { ...r, respuesta: respuesta.trim(), estado: "resuelto", fecha_respuesta: ahora } : r));

    // Enviar WhatsApp al cliente
    if (detalle?.telefono) {
      const trackingLink = `${BASE_URL}/libro-reclamaciones?codigo=${detalle.codigo}`;
      const nombreFmt = detalle.nombres
        ? detalle.nombres.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        : "cliente";
      const texto =
        `Estimado/a *${nombreFmt}*, le informamos que su *${detalle.tipo === "reclamo" ? "Reclamo" : "Queja"}* ha sido atendido.\n\n` +
        `📋 *Código:* ${detalle.codigo}\n` +
        `✅ *Estado:* Resuelto\n\n` +
        `*Respuesta de Americanet:*\n${respuesta.trim()}\n\n` +
        `Puede ver su constancia completa y descargarla en PDF aquí:\n🔗 ${trackingLink}\n\n` +
        `Si no está conforme puede acudir a INDECOPI: 224-7777\n\n` +
        `Atentamente,\n*Americanet Fiber Solution S.A.C.*`;

      try {
        await fetch(PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: "ChatwootMessage",
            payload: { phone: detalle.telefono, message: texto, account_id: "1" },
          }),
        });
        notify("✅ Respuesta guardada y WhatsApp enviado al cliente");
      } catch {
        notify("Respuesta guardada (WhatsApp no pudo enviarse)", false);
      }
    }
    setGuardando(false);
  }

  const listaFiltrada = lista.filter(r => {
    if (!busq.trim()) return true;
    const q = busq.toLowerCase();
    return (
      r.codigo?.toLowerCase().includes(q) ||
      r.nombres?.toLowerCase().includes(q) ||
      r.dni?.includes(q) ||
      r.telefono?.includes(q)
    );
  });

  // Contadores por estado
  const contadores = ESTADOS.reduce((acc, e) => {
    acc[e.key] = lista.filter(r => r.estado === e.key).length;
    return acc;
  }, {});

  return (
    <div style={{ padding: "20px 24px", fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 1000, margin: "0 auto" }}>

      {/* Notificación */}
      {msg && (
        <div style={{ position: "fixed", top: 16, right: 24, zIndex: 9999, background: msg.ok ? "#F0FDF4" : "#FEF2F2",
          border: `1px solid ${msg.ok ? "#86EFAC" : "#FECACA"}`, borderRadius: 8, padding: "10px 16px",
          fontSize: 13, fontWeight: 600, color: msg.ok ? "#15803D" : "#DC2626",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
          {msg.text}
        </div>
      )}

      {/* Título */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#003DA5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="#fff" strokeWidth="1.8"/>
              <path d="M7 8h10M7 12h10M7 16h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#111827" }}>Libro de Reclamaciones</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>Gestión de reclamos y quejas · Americanet Fiber Solution S.A.C.</div>
          </div>
        </div>
      </div>

      {/* Tarjetas de resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {ESTADOS.map(e => (
          <div key={e.key}
            onClick={() => setFiltroEstado(e.key)}
            style={{ background: filtroEstado === e.key ? e.bg : "#fff", border: `1px solid ${filtroEstado === e.key ? e.border : "#E5E7EB"}`,
              borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "all .15s",
              borderLeft: `4px solid ${e.color}` }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: e.color }}>{contadores[e.key] ?? 0}</div>
            <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>{e.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Buscar por código, nombre, DNI..."
          value={busq}
          onChange={e => setBusq(e.target.value)}
          style={{ flex: 1, minWidth: 200, border: "1px solid #D1D5DB", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {[{ key: "todos", label: "Todos" }, ...ESTADOS].map(e => (
            <button key={e.key} onClick={() => setFiltroEstado(e.key)}
              style={{ border: `1px solid ${filtroEstado === e.key ? "#003DA5" : "#E5E7EB"}`,
                background: filtroEstado === e.key ? "#003DA5" : "#fff",
                color: filtroEstado === e.key ? "#fff" : "#374151",
                borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {e.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {TIPOS.map(t => (
            <button key={t.key} onClick={() => setFiltroTipo(t.key)}
              style={{ border: `1px solid ${filtroTipo === t.key ? "#F47A20" : "#E5E7EB"}`,
                background: filtroTipo === t.key ? "#FFF7ED" : "#fff",
                color: filtroTipo === t.key ? "#C2410C" : "#6B7280",
                borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={cargar} style={{ border: "1px solid #E5E7EB", background: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "#374151", fontWeight: 600 }}>
          ↻ Actualizar
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Cargando...</div>
        ) : listaFiltrada.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No hay registros para los filtros seleccionados</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#003DA5" }}>
                {["Código", "Tipo", "Cliente", "DNI", "Teléfono", "Fecha", "Estado", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((r, i) => {
                const est = estadoInfo(r.estado);
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                    <td style={{ padding: "10px 14px", fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#003DA5", whiteSpace: "nowrap" }}>{r.codigo}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
                        background: r.tipo === "reclamo" ? "#FFF7ED" : "#F0FDF4",
                        color: r.tipo === "reclamo" ? "#C2410C" : "#15803D" }}>
                        {r.tipo === "reclamo" ? "Reclamo" : "Queja"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#111827", fontWeight: 600, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombres}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#374151" }}>{r.dni}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#374151" }}>{r.telefono}</td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{fmtFecha(r.fecha_registro)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
                        background: est.bg, color: est.color, border: `1px solid ${est.border}` }}>
                        {est.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => { setDetalle(r); setRespuesta(r.respuesta || ""); }}
                        style={{ background: "#003DA5", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL DETALLE ── */}
      {detalle && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => e.target === e.currentTarget && setDetalle(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>

            {/* Cabecera modal */}
            <div style={{ background: "#003DA5", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "16px 16px 0 0" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{detalle.codigo}</div>
                <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2 }}>{fmtFecha(detalle.fecha_registro)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 5,
                  background: detalle.tipo === "reclamo" ? "#FFF7ED" : "#F0FDF4",
                  color: detalle.tipo === "reclamo" ? "#C2410C" : "#15803D" }}>
                  {detalle.tipo === "reclamo" ? "Reclamo" : "Queja"}
                </span>
                <button onClick={() => setDetalle(null)}
                  style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                  ✕
                </button>
              </div>
            </div>

            <div style={{ padding: "20px 22px" }}>

              {/* Datos del cliente */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Datos del reclamante</div>
              <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden", marginBottom: 18 }}>
                {[
                  ["Nombres",   detalle.nombres],
                  ["DNI",       detalle.dni],
                  ["Teléfono",  detalle.telefono],
                  ["Correo",    detalle.email || "—"],
                  ["Dirección", detalle.direccion || "—"],
                ].map(([l, v], i, arr) => (
                  <div key={l} style={{ display: "grid", gridTemplateColumns: "110px 1fr", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                    <div style={{ padding: "7px 12px", background: "#F9FAFB", fontSize: 11, fontWeight: 600, color: "#6B7280", display: "flex", alignItems: "center" }}>{l}</div>
                    <div style={{ padding: "7px 12px", fontSize: 12, color: "#111827", fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Servicio */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Bien contratado</div>
              <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden", marginBottom: 18 }}>
                {[
                  ["Servicio", detalle.bien_contratado || "—"],
                  ["Monto",    detalle.monto_contratado ? `S/ ${Number(detalle.monto_contratado).toFixed(2)}` : "—"],
                ].map(([l, v], i, arr) => (
                  <div key={l} style={{ display: "grid", gridTemplateColumns: "110px 1fr", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                    <div style={{ padding: "7px 12px", background: "#F9FAFB", fontSize: 11, fontWeight: 600, color: "#6B7280", display: "flex", alignItems: "center" }}>{l}</div>
                    <div style={{ padding: "7px 12px", fontSize: 12, color: "#111827", fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Descripción */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Descripción</div>
              <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#111827", lineHeight: 1.7, marginBottom: 18 }}>
                {detalle.descripcion}
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Pedido del cliente</div>
              <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#111827", lineHeight: 1.7, marginBottom: 18 }}>
                {detalle.pedido}
              </div>

              {/* Cambiar estado */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Estado</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                {ESTADOS.map(e => (
                  <button key={e.key} disabled={guardando} onClick={() => actualizarEstado(detalle.id, e.key)}
                    style={{ border: `2px solid ${detalle.estado === e.key ? e.color : "#E5E7EB"}`,
                      background: detalle.estado === e.key ? e.bg : "#fff",
                      color: detalle.estado === e.key ? e.color : "#6B7280",
                      borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700,
                      cursor: guardando ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                    {e.label}
                  </button>
                ))}
              </div>

              {/* Respuesta */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Respuesta al cliente</div>
              {detalle.respuesta && (
                <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#111827", lineHeight: 1.7, marginBottom: 10 }}>
                  {detalle.respuesta}
                </div>
              )}
              <textarea
                placeholder="Escribe la respuesta al cliente (se guardará en el registro)..."
                value={respuesta}
                onChange={e => setRespuesta(e.target.value)}
                style={{ width: "100%", border: "1px solid #D1D5DB", borderRadius: 8, padding: "10px 12px", fontSize: 13, minHeight: 80, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: "#111827" }}
              />
              <button
                onClick={() => guardarRespuesta(detalle.id)}
                disabled={guardando || !respuesta.trim()}
                style={{ marginTop: 10, width: "100%", background: guardando || !respuesta.trim() ? "#9CA3AF" : "#003DA5",
                  color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700,
                  fontSize: 13, cursor: guardando || !respuesta.trim() ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {guardando ? "Guardando..." : "Guardar respuesta y marcar como resuelto"}
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
