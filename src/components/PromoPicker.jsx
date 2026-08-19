import { useState } from "react";

// Selector de promociones reusable: lista las promociones activas, permite
// enviarlas completas ("Enviar todo") o mensaje por mensaje ("Manual").
// No depende de ubicación/GPS — solo necesita un contacto de WhatsApp activo
// (lo resuelve quien pase onEnviarPromocion/onEnviarPromocionBloque).
export default function PromoPicker({ promociones = [], onEnviarPromocion, onEnviarPromocionBloque, onClose }) {
  const [enviandoPromoId, setEnviandoPromoId] = useState(null);
  const [promoEnviadaId, setPromoEnviadaId] = useState(null);
  const [errorPromo, setErrorPromo] = useState("");
  const [promoExpandidaId, setPromoExpandidaId] = useState(null);
  const [bloquesEnviados, setBloquesEnviados] = useState({}); // { [promoId]: number[] }
  const [enviandoBloqueKey, setEnviandoBloqueKey] = useState(null); // `${promoId}-${idx}`

  async function enviarPromo(promo) {
    if (!onEnviarPromocion) return;
    setEnviandoPromoId(promo.id);
    setErrorPromo("");
    try {
      await onEnviarPromocion(promo);
      setPromoEnviadaId(promo.id);
      setBloquesEnviados((prev) => ({ ...prev, [promo.id]: (promo.mensajes || [promo.mensaje]).map((_, i) => i) }));
    } catch (e) {
      setErrorPromo(e.message || "No se pudo enviar la promoción");
    }
    setEnviandoPromoId(null);
  }

  async function enviarBloque(promo, idx) {
    if (!onEnviarPromocionBloque) return;
    const key = `${promo.id}-${idx}`;
    setEnviandoBloqueKey(key);
    setErrorPromo("");
    try {
      await onEnviarPromocionBloque(promo, idx);
      setBloquesEnviados((prev) => ({ ...prev, [promo.id]: [...new Set([...(prev[promo.id] || []), idx])] }));
    } catch (e) {
      setErrorPromo(e.message || "No se pudo enviar el mensaje");
    }
    setEnviandoBloqueKey(null);
  }

  return (
    <div style={s.promoCard}>
      <div style={s.header}>
        <span style={s.titulo}>Elige una promoción para enviar</span>
        {onClose && <button onClick={onClose} style={s.btnCerrar}>✕</button>}
      </div>
      {promociones.length === 0 && (
        <div style={s.vacia}>No hay promociones activas — agrégalas en el panel "Promociones" del navegador.</div>
      )}
      {promociones.map((promo) => {
        const bloques = Array.isArray(promo.mensajes) && promo.mensajes.length ? promo.mensajes : [promo.mensaje].filter(Boolean);
        const enviados = bloquesEnviados[promo.id] || [];
        const expandida = promoExpandidaId === promo.id;
        return (
          <div key={promo.id} style={s.grupo}>
            <div style={s.itemRow}>
              <button onClick={() => enviarPromo(promo)}
                disabled={enviandoPromoId === promo.id || promoEnviadaId === promo.id}
                style={{ ...s.item, opacity: enviandoPromoId === promo.id ? 0.7 : 1, flex: 1 }}>
                <span>{promo.titulo}{bloques.length > 1 ? ` (${bloques.length} mensajes)` : ""}</span>
                <span style={{ fontWeight: 700 }}>
                  {promoEnviadaId === promo.id ? "✅ Todo enviado" : enviandoPromoId === promo.id ? "Enviando..." : "Enviar todo →"}
                </span>
              </button>
              {bloques.length > 1 && (
                <button onClick={() => setPromoExpandidaId(expandida ? null : promo.id)} style={s.btnManual} title="Enviar mensaje por mensaje">
                  {expandida ? "▲" : "✋ Manual"}
                </button>
              )}
            </div>
            {expandida && (
              <div style={s.bloques}>
                {bloques.map((texto, idx) => {
                  const key = `${promo.id}-${idx}`;
                  const yaEnviado = enviados.includes(idx);
                  return (
                    <div key={idx} style={s.bloqueRow}>
                      <div style={s.bloqueTexto}>{texto}</div>
                      <button onClick={() => enviarBloque(promo, idx)} disabled={enviandoBloqueKey === key || yaEnviado}
                        style={{ ...s.btnBloque, background: yaEnviado ? "#16a34a" : "#2563eb", opacity: enviandoBloqueKey === key ? 0.7 : 1 }}>
                        {yaEnviado ? "✅" : enviandoBloqueKey === key ? "..." : `Enviar ${idx + 1}/${bloques.length}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {errorPromo && <div style={s.error}>{errorPromo}</div>}
    </div>
  );
}

const s = {
  promoCard: { background: "#fff", border: "1.5px solid #86efac", borderRadius: 12, padding: "10px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  titulo: { fontSize: 12, fontWeight: 700, color: "#14532d" },
  btnCerrar: { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#64748b", fontWeight: 700 },
  vacia: { fontSize: 11, color: "#64748b" },
  item: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", padding: "9px 12px", background: "#f0fdf4", border: "1px solid #dcfce7", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#14532d", cursor: "pointer" },
  grupo: { marginBottom: 6 },
  itemRow: { display: "flex", gap: 6, alignItems: "stretch" },
  btnManual: { flexShrink: 0, padding: "0 10px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, color: "#2563eb", fontWeight: 700, fontSize: 11, cursor: "pointer" },
  bloques: { display: "grid", gap: 6, marginTop: 6, paddingLeft: 10, borderLeft: "2px solid #dcfce7" },
  bloqueRow: { display: "flex", gap: 6, alignItems: "center" },
  bloqueTexto: { flex: 1, fontSize: 11, color: "#374151", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", whiteSpace: "pre-wrap", maxHeight: 70, overflowY: "auto" },
  btnBloque: { flexShrink: 0, padding: "6px 10px", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" },
  error: { fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 6 },
};
