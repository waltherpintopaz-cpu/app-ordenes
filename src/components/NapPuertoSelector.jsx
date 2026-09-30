import { useMemo } from "react";

// Selector visual de puerto dentro de una caja NAP, para el panel web.
// Version simplificada del selector de la app movil (SelectorPuertoCaja.js):
// mismo criterio de columnas (mitad de la capacidad, hasta 8 columnas) y
// mismos colores ocupado/libre, pero sin consulta de señal en vivo -- aca
// solo sirve para elegir puerto al vincular un cliente desde el navegador.
export default function NapPuertoSelector({ cajaCodigo, capacidad, clientes, excluirClienteId, puertoSeleccionado, onSelect, onClose }) {
  const ocupados = useMemo(() => {
    const map = {};
    for (const c of clientes) {
      if (String(c.caja_nap || "").trim().toLowerCase() !== String(cajaCodigo || "").trim().toLowerCase()) continue;
      if (excluirClienteId && c.id === excluirClienteId) continue;
      if (c.puerto_nap == null) continue;
      map[c.puerto_nap] = c;
    }
    return map;
  }, [clientes, cajaCodigo, excluirClienteId]);

  const cap = Number(capacidad) || 8;
  const cols = Math.min(Math.ceil(cap / 2) || 1, 8);
  const puertos = Array.from({ length: cap }, (_, i) => i + 1);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.card} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <div>
            <div style={s.title}>Elegir puerto</div>
            <div style={s.subtitle}>{cajaCodigo} · {cap} puertos</div>
          </div>
          <button onClick={onClose} style={s.btnClose}>✕</button>
        </div>

        <div style={{ ...s.grid, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {puertos.map(n => {
            const ocupante = ocupados[n];
            const sel = puertoSeleccionado === n;
            return (
              <button
                key={n}
                disabled={!!ocupante}
                onClick={() => onSelect(n)}
                title={ocupante ? `Ocupado: ${ocupante.nombre || "-"}` : `Puerto ${n} libre`}
                style={{
                  ...s.puerto,
                  ...(ocupante ? s.puertoOcupado : s.puertoLibre),
                  ...(sel ? s.puertoSel : {}),
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div style={s.leyenda}>
          <span><span style={{ ...s.dot, background: "#22c55e" }} /> Libre</span>
          <span><span style={{ ...s.dot, background: "#ef4444" }} /> Ocupado</span>
          <span><span style={{ ...s.dot, background: "#f97316" }} /> Seleccionado</span>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 4000,
    background: "rgba(15,23,42,0.55)", backdropFilter: "blur(3px)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  card: {
    background: "#fff", borderRadius: 16, padding: 18, width: 360, maxWidth: "92vw",
    boxShadow: "0 24px 60px rgba(15,23,42,0.35)",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  title: { fontSize: 15, fontWeight: 800, color: "#0f172a" },
  subtitle: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  btnClose: {
    width: 26, height: 26, border: "1px solid #e2e8f0", borderRadius: 7,
    background: "#f8fafc", cursor: "pointer", fontSize: 12, color: "#64748b",
  },
  grid: { display: "grid", gap: 8, marginBottom: 14 },
  puerto: {
    aspectRatio: "1", borderRadius: 9, border: "1.5px solid", fontWeight: 800, fontSize: 13,
    cursor: "pointer", transition: "all .12s",
  },
  puertoLibre: { background: "#f0fdf4", borderColor: "#86efac", color: "#16a34a" },
  puertoOcupado: { background: "#fef2f2", borderColor: "#fecaca", color: "#ef4444", cursor: "not-allowed" },
  puertoSel: { background: "#fff7ed", borderColor: "#f97316", color: "#ea580c", boxShadow: "0 0 0 3px rgba(249,115,22,0.25)" },
  leyenda: { display: "flex", gap: 14, fontSize: 10, color: "#64748b", fontWeight: 600, justifyContent: "center" },
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 4, verticalAlign: "middle" },
};
