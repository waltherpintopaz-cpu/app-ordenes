import { useState } from "react";

// Lista de mensajes rápidos (personales + compartidos) con su descripción
// visible antes de enviar, para saber qué se va a mandar sin adivinar.
export default function MensajeRapidoPicker({ mensajes = [], onEnviar, onClose }) {
  const [enviandoId, setEnviandoId] = useState(null);
  const [enviadoId, setEnviadoId] = useState(null);
  const [error, setError] = useState("");

  async function enviar(msg) {
    if (!onEnviar) return;
    setEnviandoId(msg.id);
    setError("");
    try {
      await onEnviar(msg);
      setEnviadoId(msg.id);
    } catch (e) {
      setError(e.message || "No se pudo enviar el mensaje");
    }
    setEnviandoId(null);
  }

  return (
    <div style={s.card}>
      <div style={s.header}>
        <span style={s.titulo}>Elige un mensaje rápido</span>
        {onClose && <button onClick={onClose} style={s.btnCerrar}>✕</button>}
      </div>
      {mensajes.length === 0 && (
        <div style={s.vacia}>No tienes mensajes rápidos disponibles — agrégalos en el panel "Mensajes Rápidos" del navegador.</div>
      )}
      {mensajes.map((msg) => (
        <button key={msg.id} onClick={() => enviar(msg)}
          disabled={enviandoId === msg.id || enviadoId === msg.id}
          style={{ ...s.item, opacity: enviandoId === msg.id ? 0.7 : 1 }}>
          <div style={s.itemHead}>
            <span style={s.itemTitulo}>{msg.titulo}</span>
            <span style={{ ...s.badge, background: msg.compartido ? "#dbeafe" : "#f1f5f9", color: msg.compartido ? "#1d4ed8" : "#94a3b8" }}>
              {msg.compartido ? "Compartido" : "Personal"}
            </span>
          </div>
          <div style={s.itemDesc}>{msg.descripcion}</div>
          <div style={s.itemEstado}>
            {enviadoId === msg.id ? "✅ Enviado" : enviandoId === msg.id ? "Enviando..." : "Enviar →"}
          </div>
        </button>
      ))}
      {error && <div style={s.error}>{error}</div>}
    </div>
  );
}

const s = {
  card: { background: "#fff", border: "1.5px solid #93c5fd", borderRadius: 12, padding: "10px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  titulo: { fontSize: 12, fontWeight: 700, color: "#1e3a8a" },
  btnCerrar: { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#64748b", fontWeight: 700 },
  vacia: { fontSize: 11, color: "#64748b" },
  item: { display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "#eff6ff", border: "1px solid #dbeafe", borderRadius: 8, marginBottom: 6, cursor: "pointer" },
  itemHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 },
  itemTitulo: { fontSize: 12, fontWeight: 700, color: "#1e3a8a" },
  badge: { fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, flexShrink: 0 },
  itemDesc: { fontSize: 11, color: "#475569", fontStyle: "italic", marginTop: 2 },
  itemEstado: { fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginTop: 4, textAlign: "right" },
  error: { fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 6 },
};
