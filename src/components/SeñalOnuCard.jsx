import { nivelSenal, NIVEL_CONFIG } from "../app/useSmartOltSenal";

function BarraSenal({ rxDbm }) {
  const nivel = nivelSenal(rxDbm);
  const cfg = NIVEL_CONFIG[nivel];
  const pct = rxDbm != null ? Math.max(0, Math.min(100, ((rxDbm + 30) / 15) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 80,
          height: 5,
          background: "#e5e7eb",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{ width: `${pct}%`, height: "100%", background: cfg.dot, borderRadius: 99 }}
        />
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: rxDbm != null ? cfg.text : "#9ca3af",
          minWidth: 64,
        }}
      >
        {rxDbm != null ? `${rxDbm} dBm` : "—"}
      </span>
    </div>
  );
}

// Props:
//   detalle  — objeto retornado por useSmartOltSenal.verSenal()
//   cargando — boolean
//   error    — string
export default function SeñalOnuCard({ detalle, cargando = false, error = "" }) {
  if (cargando) {
    return (
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          background: "#f8fafc",
          padding: "14px 16px",
          color: "#64748b",
          fontSize: 13,
        }}
      >
        Consultando señal...
      </div>
    );
  }

  if (error && !detalle) {
    return (
      <div
        style={{
          border: "1px solid #fca5a5",
          borderRadius: 12,
          background: "#fef2f2",
          padding: "14px 16px",
          color: "#991b1b",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {error}
      </div>
    );
  }

  if (!detalle) return null;

  const nivel = detalle.nivel || nivelSenal(detalle.rxDbm);
  const cfg = NIVEL_CONFIG[nivel];

  return (
    <div
      style={{
        border: `1px solid ${cfg.dot}60`,
        borderRadius: 12,
        background: cfg.bg,
        padding: "14px 16px",
        display: "grid",
        gap: 10,
      }}
    >
      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: cfg.dot,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 14 }}>{detalle.sn}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: cfg.text,
            background: "#fff",
            padding: "2px 9px",
            borderRadius: 99,
            border: `1px solid ${cfg.dot}80`,
          }}
        >
          {cfg.label}
        </span>
        <span style={{ fontSize: 12, color: "#64748b", marginLeft: "auto" }}>
          {detalle.estado}
        </span>
      </div>

      {/* Barras de señal */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>Señal ONU (RX)</div>
          <BarraSenal rxDbm={detalle.rxDbm} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>OLT Rx ONT</div>
          <BarraSenal rxDbm={detalle.oltRxDbm} />
        </div>
      </div>

      {/* Error suave (ej: falló refrescar pero hay dato previo) */}
      {error ? (
        <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{error}</div>
      ) : null}

      <div style={{ fontSize: 11, color: "#94a3b8" }}>Consultado: {detalle.fechaConsulta}</div>
    </div>
  );
}
