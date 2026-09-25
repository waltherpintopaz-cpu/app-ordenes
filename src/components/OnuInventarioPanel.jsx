import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const HUAWEI_OLT_SNMP_API = String(import.meta.env.VITE_HUAWEI_OLT_SNMP_API || "https://huawei-olt-snmp.wolgest.com").trim().replace(/\/$/, "");

const ESTADO = {
  online:         { label: "Online",          dot: "#22c55e", text: "#15803d", bg: "#dcfce7" },
  power_fail:     { label: "Power Fail",      dot: "#f59e0b", text: "#92400e", bg: "#fef3c7" },
  los:            { label: "Sin señal (LOS)", dot: "#ef4444", text: "#991b1b", bg: "#fee2e2" },
  admin_disabled: { label: "Deshabilitado",   dot: "#6b7280", text: "#374151", bg: "#e5e7eb" },
};
const ESTADO_DESCONOCIDO = { label: "Desconocido", dot: "#d1d5db", text: "#6b7280", bg: "#f3f4f6" };

const RANGOS_SENAL_HISTORIAL = [
  { key: "dia", label: "Diario", horas: 24 },
  { key: "semana", label: "Semanal", horas: 24 * 7 },
  { key: "mes", label: "Mensual", horas: 24 * 30 },
  { key: "anio", label: "Anual", horas: 24 * 365 },
];

const PAGE_SIZE = 100;

// ── Iconos SVG (linea, estilo feather) ──────────────────────────────────────
const Ico = {
  search: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  filter: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>,
  signal: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="20" x2="4" y2="14" /><line x1="10" y1="20" x2="10" y2="10" /><line x1="16" y1="20" x2="16" y2="6" /><line x1="22" y1="20" x2="22" y2="3" /></svg>,
  server: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="7" rx="1.5" /><rect x="2" y="14" width="20" height="7" rx="1.5" /><line x1="6" y1="6.5" x2="6.01" y2="6.5" /><line x1="6" y1="17.5" x2="6.01" y2="17.5" /></svg>,
  plug: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" /></svg>,
  pin: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>,
  calendar: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  x: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  chip: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="1.5" /><line x1="9" y1="2" x2="9" y2="6" /><line x1="15" y1="2" x2="15" y2="6" /><line x1="9" y1="18" x2="9" y2="22" /><line x1="15" y1="18" x2="15" y2="22" /><line x1="2" y1="9" x2="6" y2="9" /><line x1="2" y1="15" x2="6" y2="15" /><line x1="18" y1="9" x2="22" y2="9" /><line x1="18" y1="15" x2="22" y2="15" /></svg>,
  refresh: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" /></svg>,
  chevronRight: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
  card: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>,
  checkCircle: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  alertTriangle: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  wifiOff: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>,
  slash: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>,
};

const ESTADO_ICONO = { online: Ico.checkCircle, power_fail: Ico.alertTriangle, los: Ico.wifiOff, admin_disabled: Ico.slash };

// ── Ficha detallada (drawer lateral) ────────────────────────────────────────
function FichaOnuDrawer({ sn, onClose, isDark }) {
  const [ficha, setFicha] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rango, setRango] = useState("dia");
  const [filas, setFilas] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [filasTrafico, setFilasTrafico] = useState([]);
  const [loadingTrafico, setLoadingTrafico] = useState(false);

  useEffect(() => {
    if (!sn) return undefined;
    let cancelado = false;
    setLoading(true);
    setError("");
    fetch(`${HUAWEI_OLT_SNMP_API}/onu-info?sn=${encodeURIComponent(sn)}`)
      .then(r => r.json())
      .then(json => {
        if (cancelado) return;
        if (!json.ok) { setError(json.error || "No se pudo obtener la ficha."); setFicha(null); }
        else setFicha(json);
      })
      .catch(e => { if (!cancelado) setError(e.message || "Error de red."); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [sn]);

  useEffect(() => {
    if (!sn) return undefined;
    let cancelado = false;
    setLoadingHist(true);
    const cfg = RANGOS_SENAL_HISTORIAL.find(r => r.key === rango) || RANGOS_SENAL_HISTORIAL[0];
    const desde = new Date(Date.now() - cfg.horas * 3600 * 1000).toISOString();
    supabase.from("senal_onu_historial").select("rx_dbm,tx_dbm,medido_en")
      .eq("sn_onu", sn).gte("medido_en", desde).order("medido_en", { ascending: true })
      .then(({ data }) => { if (!cancelado) { setFilas(data || []); setLoadingHist(false); } });
    return () => { cancelado = true; };
  }, [sn, rango]);

  useEffect(() => {
    if (!sn) return undefined;
    let cancelado = false;
    setLoadingTrafico(true);
    const cfg = RANGOS_SENAL_HISTORIAL.find(r => r.key === rango) || RANGOS_SENAL_HISTORIAL[0];
    const desde = new Date(Date.now() - cfg.horas * 3600 * 1000).toISOString();
    supabase.from("trafico_onu_historial").select("up_bps,down_bps,medido_en")
      .eq("sn_onu", sn).gte("medido_en", desde).order("medido_en", { ascending: true })
      .then(({ data }) => { if (!cancelado) { setFilasTrafico(data || []); setLoadingTrafico(false); } });
    return () => { cancelado = true; };
  }, [sn, rango]);

  const puntos = useMemo(() => filas.filter(f => f.rx_dbm != null).map(f => ({ t: new Date(f.medido_en).getTime(), rx: Number(f.rx_dbm) })), [filas]);
  const puntosTrafico = useMemo(() => filasTrafico
    .filter(f => f.up_bps != null || f.down_bps != null)
    .map(f => ({ t: new Date(f.medido_en).getTime(), up: f.up_bps != null ? f.up_bps / 1e6 : null, down: f.down_bps != null ? f.down_bps / 1e6 : null })), [filasTrafico]);
  const W = 480, H = 150, PAD_L = 40, PAD_R = 10, PAD_T = 10, PAD_B = 24;
  const chart = useMemo(() => {
    if (puntos.length < 2) return null;
    const rxVals = puntos.map(p => p.rx);
    let min = Math.min(...rxVals), max = Math.max(...rxVals);
    if (min === max) { min -= 1; max += 1; }
    const margen = (max - min) * 0.15 || 1;
    min -= margen; max += margen;
    const tMin = puntos[0].t, tMax = puntos[puntos.length - 1].t;
    const x = (t) => PAD_L + ((t - tMin) / (tMax - tMin || 1)) * (W - PAD_L - PAD_R);
    const y = (rx) => PAD_T + (1 - (rx - min) / (max - min)) * (H - PAD_T - PAD_B);
    const d = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.rx).toFixed(1)}`).join(" ");
    const ticksY = [min, min + (max - min) / 2, max].map(v => ({ v, y: y(v) }));
    const ticksX = Array.from({ length: 5 }, (_, i) => {
      const t = tMin + ((tMax - tMin) * i) / 4;
      return { t, x: x(t) };
    });
    return { d, ticksY, ticksX, ultimo: puntos[puntos.length - 1], max: Math.max(...rxVals) };
  }, [puntos]);

  const chartTrafico = useMemo(() => {
    if (puntosTrafico.length < 2) return null;
    const todos = puntosTrafico.flatMap(p => [p.up, p.down]).filter(v => v != null);
    if (!todos.length) return null;
    let max = Math.max(...todos, 0.1);
    max *= 1.15;
    const tMin = puntosTrafico[0].t, tMax = puntosTrafico[puntosTrafico.length - 1].t;
    const x = (t) => PAD_L + ((t - tMin) / (tMax - tMin || 1)) * (W - PAD_L - PAD_R);
    const y = (v) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
    const lineaDe = (campo) => {
      const pts = puntosTrafico.filter(p => p[campo] != null);
      if (pts.length < 2) return "";
      return pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(" ");
    };
    const ticksY = [0, max / 2, max].map(v => ({ v, y: y(v) }));
    const ticksX = Array.from({ length: 5 }, (_, i) => {
      const t = tMin + ((tMax - tMin) * i) / 4;
      return { t, x: x(t) };
    });
    const ultimoUp = [...puntosTrafico].reverse().find(p => p.up != null)?.up;
    const ultimoDown = [...puntosTrafico].reverse().find(p => p.down != null)?.down;
    return { dUp: lineaDe("up"), dDown: lineaDe("down"), ticksY, ticksX, ultimoUp, ultimoDown, maxDown: Math.max(...puntosTrafico.map(p => p.down || 0)) };
  }, [puntosTrafico]);

  const fmtFecha = (t) => {
    const d = new Date(t);
    if (rango === "dia") return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    if (rango === "semana" || rango === "mes") return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
    return d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
  };

  const cfg = ficha?.estado ? (ESTADO[ficha.estado] || ESTADO_DESCONOCIDO) : null;
  const col = isDark ? { bg: "#111c33", card: "#1a2740", border: "#2c3c58", text: "#e6ecf7", sub: "#93a2bd" }
                      : { bg: "#fff", card: "#f8fafc", border: "#e2e8f0", text: "#111827", sub: "#6b7280" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" }} />
      <div style={{ position: "relative", width: "min(520px, 100vw)", height: "100%", background: col.bg, boxShadow: "-8px 0 24px rgba(0,0,0,.15)", overflowY: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: col.sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ficha de ONU</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: col.text, fontFamily: "monospace" }}>{sn}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: col.sub, padding: 4 }}><Ico.x width={20} height={20} /></button>
        </div>

        {loading && <div style={{ fontSize: 13, color: col.sub }}>Consultando la OLT…</div>}
        {!loading && error && <div style={{ fontSize: 13, color: "#dc2626" }}>{error}</div>}
        {!loading && !error && ficha && (
          <>
            {cfg && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: cfg.bg, color: cfg.text }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot }} />
                {cfg.label}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 16 }}>
              {[
                [Ico.signal, "Rx ONU (dBm)", ficha.rxPower ?? "—"],
                [Ico.signal, "Tx ONU (dBm)", ficha.txPower ?? "—"],
                [Ico.signal, "Rx OLT (dBm)", ficha.rxPowerOlt ?? "—"],
                [Ico.card, "Nombre (en la OLT)", ficha.nombre || "—"],
                [Ico.pin, "Zona", ficha.zona || "—"],
                [Ico.card, "Comentario/Dirección", ficha.comentario || "—"],
                [Ico.calendar, "Fecha de autorización", ficha.fechaAutorizacion || "—"],
                [Ico.chip, "Tipo de ONU", ficha.onuType || "—"],
                [Ico.chip, "Perfil de línea", ficha.perfilLinea || "—"],
                [Ico.chip, "Modelo", ficha.modelo || "—"],
                [Ico.chip, "Firmware", ficha.firmware || "—"],
              ].map(([Icon, label, value], i) => (
                <div key={i} style={{ background: col.card, borderRadius: 10, padding: "9px 11px", border: `1px solid ${col.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: col.sub, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>
                    <Icon width={11} height={11} />{label}
                  </div>
                  <div style={{ fontSize: 12.5, color: col.text, fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ background: col.card, border: `1px solid ${col.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: col.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <Ico.signal width={13} height={13} />Historial de señal (Rx)
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {RANGOS_SENAL_HISTORIAL.map(r => (
                <button key={r.key} onClick={() => setRango(r.key)} style={{
                  padding: "4px 9px", fontSize: 10.5, fontWeight: 700, borderRadius: 7, cursor: "pointer",
                  border: rango === r.key ? "1.5px solid #16a34a" : `1.5px solid ${col.border}`,
                  background: rango === r.key ? "#dcfce7" : "transparent",
                  color: rango === r.key ? "#166534" : col.sub,
                }}>{r.label}</button>
              ))}
            </div>
          </div>
          {loadingHist && <div style={{ fontSize: 12, color: col.sub, padding: "16px 0" }}>Cargando historial…</div>}
          {!loadingHist && !chart && <div style={{ fontSize: 12, color: col.sub, padding: "16px 0" }}>Todavía no hay suficiente historial guardado para este período.</div>}
          {!loadingHist && chart && (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
                <defs>
                  <linearGradient id="gradSenalDrawer" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {chart.ticksY.map((t, i) => (
                  <g key={i}>
                    <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke={isDark ? "#2c3c58" : "#e5e7eb"} strokeWidth="1" />
                    <text x={PAD_L - 6} y={t.y + 3} textAnchor="end" fontSize="9" fill={col.sub}>{t.v.toFixed(1)}</text>
                  </g>
                ))}
                {chart.ticksX.map((t, i) => (
                  <text key={i} x={t.x} y={H - 8} textAnchor="middle" fontSize="9" fill={col.sub}>{fmtFecha(t.t)}</text>
                ))}
                <path d={`${chart.d} L${(W - PAD_R).toFixed(1)},${(H - PAD_B).toFixed(1)} L${PAD_L},${(H - PAD_B).toFixed(1)} Z`} fill="url(#gradSenalDrawer)" stroke="none" />
                <path d={chart.d} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: col.sub, marginTop: 4 }}>
                <span>Actual: <strong style={{ color: col.text }}>{chart.ultimo.rx.toFixed(2)}</strong></span>
                <span>Máximo: <strong style={{ color: col.text }}>{chart.max.toFixed(2)}</strong></span>
              </div>
            </>
          )}
        </div>

        <div style={{ background: col.card, border: `1px solid ${col.border}`, borderRadius: 12, padding: "14px 16px", marginTop: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: col.text, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            <Ico.signal width={13} height={13} />Tráfico (Upload/Download)
          </span>
          {loadingTrafico && <div style={{ fontSize: 12, color: col.sub, padding: "16px 0" }}>Cargando tráfico…</div>}
          {!loadingTrafico && !chartTrafico && (
            <div style={{ fontSize: 12, color: col.sub, padding: "16px 0" }}>
              Todavía no hay suficiente historial de tráfico guardado (se mide cada 15 min, necesita al menos 2 lecturas).
            </div>
          )}
          {!loadingTrafico && chartTrafico && (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
                {chartTrafico.ticksY.map((t, i) => (
                  <g key={i}>
                    <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke={isDark ? "#2c3c58" : "#e5e7eb"} strokeWidth="1" />
                    <text x={PAD_L - 6} y={t.y + 3} textAnchor="end" fontSize="9" fill={col.sub}>{t.v.toFixed(1)}</text>
                  </g>
                ))}
                {chartTrafico.ticksX.map((t, i) => (
                  <text key={i} x={t.x} y={H - 8} textAnchor="middle" fontSize="9" fill={col.sub}>{fmtFecha(t.t)}</text>
                ))}
                <path d={chartTrafico.dDown} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d={chartTrafico.dUp} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: col.sub, marginTop: 4, flexWrap: "wrap" }}>
                <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#f97316", borderRadius: 2, marginRight: 4 }} />Upload: <strong style={{ color: col.text }}>{chartTrafico.ultimoUp != null ? `${chartTrafico.ultimoUp.toFixed(2)} Mbps` : "—"}</strong></span>
                <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#3b82f6", borderRadius: 2, marginRight: 4 }} />Download: <strong style={{ color: col.text }}>{chartTrafico.ultimoDown != null ? `${chartTrafico.ultimoDown.toFixed(2)} Mbps` : "—"}</strong></span>
                <span>Máximo Download: <strong style={{ color: col.text }}>{chartTrafico.maxDown.toFixed(2)} Mbps</strong></span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Panel principal ──────────────────────────────────────────────────────────
export default function OnuInventarioPanel({ theme }) {
  const isDark = theme === "dark";
  const [onus, setOnus] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [boardFiltro, setBoardFiltro] = useState("");
  const [portFiltro, setPortFiltro] = useState("");
  const [zonaFiltro, setZonaFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaInput, setBusquedaInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [generadoEn, setGeneradoEn] = useState(null);
  const [conteoEstados, setConteoEstados] = useState({ online: 0, power_fail: 0, los: 0, admin_disabled: 0 });
  const [facetas, setFacetas] = useState({ boards: [], ports: [], zonas: [] });
  const [snSeleccionado, setSnSeleccionado] = useState(null);

  const cargar = useCallback(async ({ refresh = false } = {}) => {
    setCargando(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (estadoFiltro) params.set("estado", estadoFiltro);
      if (boardFiltro) params.set("board", boardFiltro);
      if (portFiltro) params.set("port", portFiltro);
      if (zonaFiltro) params.set("zona", zonaFiltro);
      if (busqueda) params.set("q", busqueda);
      if (refresh) params.set("refresh", "1");
      const json = await fetch(`${HUAWEI_OLT_SNMP_API}/onu-list?${params}`).then(r => r.json());
      if (json.cargando) {
        setError("");
        setOnus([]);
        setTotal(0);
        setGeneradoEn(null);
        return;
      }
      if (!json.ok) throw new Error(json.error || "Error consultando el listado de ONUs.");
      setOnus(Array.isArray(json.onus) ? json.onus : []);
      setTotal(Number(json.total) || 0);
      setGeneradoEn(json.generadoEn || null);
      if (json.conteoEstados) setConteoEstados(json.conteoEstados);
      if (json.facetas) setFacetas(json.facetas);
    } catch (e) {
      setError(String(e?.message || "Error consultando el servicio SNMP."));
      setOnus([]);
    } finally {
      setCargando(false);
    }
  }, [page, estadoFiltro, boardFiltro, portFiltro, zonaFiltro, busqueda]);

  // Si el board cambia, el puerto elegido puede ya no existir en esa
  // tarjeta -- se resetea para no quedar en un filtro imposible.
  useEffect(() => { setPortFiltro(""); }, [boardFiltro]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (total > 0 || cargando) return undefined;
    const id = setInterval(() => cargar(), 10000);
    return () => clearInterval(id);
  }, [total, cargando, cargar]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fmtGenerado = generadoEn ? new Date(generadoEn).toLocaleString("es-PE") : "—";

  const s = {
    card: { border: isDark ? "1px solid #2c3c58" : "1px solid #dbe4ef", borderRadius: 14, background: isDark ? "#1a2740" : "#fff", padding: 16 },
    input: { border: isDark ? "1px solid #2c3c58" : "1px solid #cbd5e1", borderRadius: 10, padding: "9px 12px", background: isDark ? "#0d172a" : "#fff", color: isDark ? "#e6ecf7" : "#0f172a", fontSize: 13 },
    select: { border: isDark ? "1px solid #2c3c58" : "1px solid #cbd5e1", borderRadius: 10, padding: "9px 10px", background: isDark ? "#0d172a" : "#fff", color: isDark ? "#e6ecf7" : "#0f172a", fontSize: 12.5, cursor: "pointer" },
    th: { padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: isDark ? "#93a2bd" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", background: isDark ? "#16213a" : "#fafafa", whiteSpace: "nowrap" },
    td: { padding: "9px 12px", fontSize: 13, color: isDark ? "#e6ecf7" : "#111827" },
    label: { display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" },
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={s.card}>
        <h2 style={{ margin: 0, fontSize: 22, color: isDark ? "#7fa1d4" : "#183b62" }}>Central OLT — Inventario de ONUs</h2>
        <p style={{ margin: "6px 0 0", color: isDark ? "#93a2bd" : "#64748b", fontSize: 13 }}>
          Listado completo directo de la OLT Huawei (SNMP propio, sin SmartOLT) · {total} ONUs registradas · Generado {fmtGenerado}
        </p>
      </div>

      {/* Filtros */}
      <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { key: "", label: "Todos", Icon: Ico.filter },
            { key: "online", label: "Online", Icon: Ico.checkCircle },
            { key: "power_fail", label: "Power Fail", Icon: Ico.alertTriangle },
            { key: "los", label: "LOS", Icon: Ico.wifiOff },
            { key: "admin_disabled", label: "Deshabilitado", Icon: Ico.slash },
          ].map(t => (
            <button key={t.key} type="button" onClick={() => { setPage(1); setEstadoFiltro(t.key); }}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "7px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: estadoFiltro === t.key ? "none" : (isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb"),
                background: estadoFiltro === t.key ? "#1d4ed8" : (isDark ? "#16213a" : "#f9fafb"),
                color: estadoFiltro === t.key ? "#fff" : (isDark ? "#c3d3ee" : "#374151"),
              }}>
              <t.Icon width={11} height={11} />{t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 220px" }}>
            <span style={s.label}><Ico.search width={12} height={12} />Buscar</span>
            <form onSubmit={e => { e.preventDefault(); setPage(1); setBusqueda(busquedaInput.trim()); }} style={{ display: "flex", gap: 6 }}>
              <input value={busquedaInput} onChange={e => setBusquedaInput(e.target.value)} placeholder="SN, nombre o zona…" style={{ ...s.input, flex: 1 }} />
              <button type="submit" style={{ ...s.input, cursor: "pointer", fontWeight: 700, background: "#1d4ed8", color: "#fff", border: "none" }}>Buscar</button>
            </form>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={s.label}><Ico.server width={12} height={12} />Board</span>
            <select value={boardFiltro} onChange={e => { setPage(1); setBoardFiltro(e.target.value); }} style={s.select}>
              <option value="">Todos</option>
              {facetas.boards.map(b => <option key={b} value={b}>Board {b}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={s.label}><Ico.plug width={12} height={12} />Puerto</span>
            <select value={portFiltro} onChange={e => { setPage(1); setPortFiltro(e.target.value); }} style={s.select}>
              <option value="">Todos</option>
              {facetas.ports.map(p => <option key={p} value={p}>Puerto {p}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={s.label}><Ico.pin width={12} height={12} />Zona</span>
            <select value={zonaFiltro} onChange={e => { setPage(1); setZonaFiltro(e.target.value); }} style={s.select}>
              <option value="">Todas</option>
              {facetas.zonas.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>

          <button type="button" onClick={() => cargar({ refresh: true })} disabled={cargando}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "#ea580c", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: cargando ? "wait" : "pointer" }}>
            <Ico.refresh width={12} height={12} />{cargando ? "Actualizando…" : "Forzar recorrido nuevo"}
          </button>
        </div>
      </div>

      {error ? <div style={{ ...s.card, color: "#b91c1c", fontWeight: 600 }}>{error}</div> : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(conteoEstados).map(([k, v]) => {
          const IconoEstado = ESTADO_ICONO[k] || Ico.signal;
          return (
            <div key={k} style={{ ...s.card, padding: "10px 16px", display: "flex", alignItems: "center", gap: 9, flex: "1 1 140px" }}>
              <IconoEstado width={16} height={16} style={{ color: ESTADO[k]?.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>{ESTADO[k]?.label}</span>
              <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 14, color: isDark ? "#e6ecf7" : "#111827" }}>{v}</span>
            </div>
          );
        })}
      </div>

      <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["", "Nombre", "Zona", "SN", "Board/Port", "RX (dBm)", "TX (dBm)", "Fecha alta", ""].map((h, i) => (
                  <th key={i} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando && onus.length === 0 ? (
                <tr><td colSpan={9} style={{ ...s.td, textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#9ca3af" }}>Cargando…</td></tr>
              ) : total === 0 && !error ? (
                <tr><td colSpan={9} style={{ ...s.td, textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#9ca3af" }}>
                  Generando el primer inventario completo desde la OLT — puede tardar unos minutos. Se actualiza solo, no hace falta recargar la página.
                </td></tr>
              ) : onus.length === 0 ? (
                <tr><td colSpan={9} style={{ ...s.td, textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#9ca3af" }}>Sin resultados.</td></tr>
              ) : onus.map((o, i) => {
                const cfg = ESTADO[o.estado] || ESTADO_DESCONOCIDO;
                return (
                  <tr key={`${o.sn}-${i}`} onClick={() => setSnSeleccionado(o.sn)}
                    style={{ borderTop: isDark ? "1px solid #24324c" : "1px solid #f3f4f6", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? "#16213a" : "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...s.td, width: 28 }}>
                      <span title={cfg.label} style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: cfg.dot }} />
                    </td>
                    <td style={s.td}>{o.nombre || <span style={{ color: isDark ? "#5b6b8a" : "#d1d5db" }}>—</span>}</td>
                    <td style={s.td}>{o.zona || "—"}</td>
                    <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12 }}>{o.sn}</td>
                    <td style={{ ...s.td, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>
                      {o.board != null ? `0/${o.board}/${o.port}` : <span style={{ color: isDark ? "#5b6b8a" : "#d1d5db" }}>—</span>}
                    </td>
                    <td style={s.td}>{o.rxPower != null ? `${o.rxPower.toFixed(2)}` : "—"}</td>
                    <td style={s.td}>{o.txPower != null ? `${o.txPower.toFixed(2)}` : "—"}</td>
                    <td style={{ ...s.td, fontSize: 12, whiteSpace: "nowrap" }}>{o.fechaAutorizacion || "—"}</td>
                    <td style={{ ...s.td, width: 24, color: isDark ? "#5b6b8a" : "#d1d5db" }}><Ico.chevronRight width={14} height={14} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>
        <span>Página {page} de {totalPages} · {total} ONUs</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{ ...s.input, cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}>← Anterior</button>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{ ...s.input, cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}>Siguiente →</button>
        </div>
      </div>

      {snSeleccionado && <FichaOnuDrawer sn={snSeleccionado} onClose={() => setSnSeleccionado(null)} isDark={isDark} />}
    </div>
  );
}
