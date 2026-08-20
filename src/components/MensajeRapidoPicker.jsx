import { useMemo, useState } from "react";

// Lista de mensajes rápidos (personales + compartidos) con su descripción
// visible antes de enviar, para saber qué se va a mandar sin adivinar.
export default function MensajeRapidoPicker({ mensajes = [], onEnviar, onClose }) {
  const [busqueda, setBusqueda] = useState("");
  const [enviandoId, setEnviandoId] = useState(null);
  const [enviadoId, setEnviadoId] = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);
  const [error, setError] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return mensajes;
    return mensajes.filter((m) =>
      m.titulo?.toLowerCase().includes(q) ||
      m.descripcion?.toLowerCase().includes(q) ||
      m.mensaje?.toLowerCase().includes(q)
    );
  }, [mensajes, busqueda]);

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

  async function copiar(msg) {
    try {
      await navigator.clipboard.writeText(msg.mensaje);
      setCopiadoId(msg.id);
      setTimeout(() => setCopiadoId((prev) => (prev === msg.id ? null : prev)), 1600);
    } catch {
      window.prompt("Copia el mensaje:", msg.mensaje);
    }
  }

  return (
    <div style={s.card}>
      <div style={s.header}>
        <span style={s.titulo}>Elige un mensaje rápido</span>
        {onClose && <button onClick={onClose} style={s.btnCerrar}>✕</button>}
      </div>
      {mensajes.length > 5 && (
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por título o contenido..."
          style={s.buscador}
        />
      )}
      {mensajes.length === 0 && (
        <div style={s.vacia}>No tienes mensajes rápidos disponibles — agrégalos en el panel "Mensajes Rápidos" del navegador.</div>
      )}
      {mensajes.length > 0 && filtrados.length === 0 && (
        <div style={s.vacia}>Ningún mensaje coincide con "{busqueda}".</div>
      )}
      {filtrados.map((msg) => (
        <div key={msg.id} style={s.item}>
          <div style={s.itemHead}>
            <span style={s.itemTitulo}>{msg.titulo}</span>
            <span style={{ ...s.badge, background: msg.compartido ? "#dbeafe" : "#f1f5f9", color: msg.compartido ? "#1d4ed8" : "#94a3b8" }}>
              {msg.compartido ? "Compartido" : "Personal"}
            </span>
          </div>
          <div style={s.itemDesc}>{msg.descripcion}</div>
          <div style={s.itemAcciones}>
            <button onClick={() => copiar(msg)} style={s.btnCopiar}>
              {copiadoId === msg.id ? "✓ Copiado" : "🔗 Copiar"}
            </button>
            <button onClick={() => enviar(msg)} disabled={enviandoId === msg.id || enviadoId === msg.id} style={{ ...s.btnEnviar, opacity: enviandoId === msg.id ? 0.7 : 1 }}>
              {enviadoId === msg.id ? "✅ Enviado" : enviandoId === msg.id ? "Enviando..." : "Enviar →"}
            </button>
          </div>
        </div>
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
  buscador: { width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid #dbeafe", fontSize: 12, marginBottom: 8, outline: "none" },
  vacia: { fontSize: 11, color: "#64748b" },
  item: { padding: "9px 12px", background: "#eff6ff", border: "1px solid #dbeafe", borderRadius: 8, marginBottom: 6 },
  itemHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 },
  itemTitulo: { fontSize: 12, fontWeight: 700, color: "#1e3a8a" },
  badge: { fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, flexShrink: 0 },
  itemDesc: { fontSize: 11, color: "#475569", fontStyle: "italic", marginTop: 2 },
  itemAcciones: { display: "flex", gap: 6, marginTop: 6 },
  btnCopiar: { flex: 1, padding: "6px 8px", background: "#fff", border: "1px solid #bfdbfe", borderRadius: 6, color: "#2563eb", fontWeight: 700, fontSize: 11, cursor: "pointer" },
  btnEnviar: { flex: 1, padding: "6px 8px", background: "#1d4ed8", border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" },
  error: { fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 6 },
};
