import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const OLT_SSH_API = String(import.meta.env.VITE_OLT_SSH_API || "https://amnet-olt-signal.0lthka.easypanel.host").trim().replace(/\/$/, "");

function nivelSenal(rx) {
  if (rx == null || isNaN(rx)) return "sin_datos";
  if (rx >= -22) return "normal";
  if (rx >= -25) return "alerta";
  return "critico";
}

const NIVEL_CONFIG = {
  normal:    { label: "Normal",    color: "#16a34a", light: "#dcfce7", border: "#86efac" },
  alerta:    { label: "Alerta",    color: "#d97706", light: "#fef3c7", border: "#fcd34d" },
  critico:   { label: "Crítico",   color: "#dc2626", light: "#fee2e2", border: "#fca5a5" },
  sin_datos: { label: "Sin datos", color: "#94a3b8", light: "#f1f5f9", border: "#cbd5e1" },
};

// ── SVG Donut chart ───────────────────────────────────────────────────────────
function DonutChart({ critico, alerta, normal, sin_datos, size = 80 }) {
  const total = critico + alerta + normal + sin_datos || 1;
  const r = 30; const cx = 40; const cy = 40;
  const circ = 2 * Math.PI * r;

  const segments = [
    { val: critico,   color: "#dc2626" },
    { val: alerta,    color: "#d97706" },
    { val: normal,    color: "#16a34a" },
    { val: sin_datos, color: "#cbd5e1" },
  ];

  let offset = 0;
  const paths = segments.map((seg, i) => {
    const pct = seg.val / total;
    const dash = pct * circ;
    const gap  = circ - dash;
    const el = (
      <circle key={i} cx={cx} cy={cy} r={r}
        fill="none" stroke={seg.color} strokeWidth={10}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset}
        style={{ transition: "stroke-dasharray 0.5s" }}
      />
    );
    offset += dash;
    return el;
  });

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={10} />
      {paths}
    </svg>
  );
}

// ── Barra señal SVG ───────────────────────────────────────────────────────────
function BarraSenal({ rx }) {
  const nivel = nivelSenal(rx);
  const cfg   = NIVEL_CONFIG[nivel];
  const val   = rx != null && !isNaN(rx) ? rx : null;
  const pct   = val != null ? Math.max(0, Math.min(100, ((val + 30) / 15) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="80" height="10" style={{ flexShrink: 0 }}>
        <rect x="0" y="0" width="80" height="10" rx="5" fill="#e2e8f0" />
        <rect x="0" y="0" width={pct * 0.8} height="10" rx="5" fill={cfg.color} />
      </svg>
      <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, minWidth: 58 }}>
        {val != null ? `${val} dBm` : "—"}
      </span>
    </div>
  );
}

// ── Tarjeta nodo con donut ────────────────────────────────────────────────────
function TarjetaNodo({ nodo, stats, total, activo, onClick }) {
  const pctCritico = total ? Math.round((stats.critico / total) * 100) : 0;
  return (
    <div onClick={onClick} style={{
      padding: "14px 16px", borderRadius: 14, cursor: "pointer", transition: "all 0.2s",
      background: activo ? "#1e40af" : "#fff",
      border: `2px solid ${activo ? "#1e40af" : "#e2e8f0"}`,
      boxShadow: activo ? "0 6px 20px #1e40af33" : "0 1px 4px #0001",
      display: "flex", alignItems: "center", gap: 12, minWidth: 180,
    }}>
      <DonutChart {...stats} size={56} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: activo ? "#fff" : "#0f172a" }}>{nodo}</div>
        <div style={{ fontSize: 11, color: activo ? "#bfdbfe" : "#64748b", marginTop: 2 }}>{total} clientes</div>
        {stats.critico > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, color: activo ? "#fca5a5" : "#dc2626", marginTop: 2 }}>
            ⚠ {stats.critico} críticos ({pctCritico}%)
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chip nivel ────────────────────────────────────────────────────────────────
function ChipNivel({ nivel, count, activo, onClick }) {
  const cfg = nivel === "todos"
    ? { label: "Todos", color: "#1e40af", light: "#eff6ff", border: "#bfdbfe" }
    : NIVEL_CONFIG[nivel];
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 99, border: `1.5px solid ${activo ? cfg.color : cfg.border}`,
      background: activo ? cfg.color : cfg.light, color: activo ? "#fff" : cfg.color,
      fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all 0.15s",
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <span>{cfg.label}</span>
      <span style={{ background: activo ? "rgba(255,255,255,0.25)" : cfg.border, borderRadius: 99, padding: "1px 7px", fontSize: 11 }}>{count}</span>
    </button>
  );
}

// ── Top 10 SVG chart ──────────────────────────────────────────────────────────
function Top10Chart({ data }) {
  if (!data.length) return null;
  const W = 560; const barH = 22; const gap = 8; const labelW = 150; const valW = 60;
  const chartW = W - labelW - valW - 16;
  const minRx = -35; const maxRx = -15;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${data.length * (barH + gap) + 10}`} style={{ overflow: "visible" }}>
      {data.map((c, i) => {
        const rx   = parseFloat(c.rx_signal);
        const nivel = nivelSenal(rx);
        const cfg  = NIVEL_CONFIG[nivel];
        const pct  = Math.max(0, Math.min(1, (rx - minRx) / (maxRx - minRx)));
        const bw   = Math.max(4, pct * chartW);
        const y    = i * (barH + gap);
        const name = (c.nombre || c.sn_onu || "").slice(0, 22);
        return (
          <g key={c.id}>
            <text x={labelW - 6} y={y + barH / 2 + 4} textAnchor="end"
              fontSize="10" fill="#64748b" fontFamily="system-ui">
              {name}
            </text>
            <rect x={labelW} y={y} width={chartW} height={barH} rx="4" fill="#f1f5f9" />
            <rect x={labelW} y={y} width={bw} height={barH} rx="4" fill={cfg.color}
              style={{ transition: "width 0.5s" }} />
            <text x={labelW + bw + 6} y={y + barH / 2 + 4}
              fontSize="10" fontWeight="700" fill={cfg.color} fontFamily="system-ui">
              {rx} dBm
            </text>
            <text x={labelW + chartW + valW} y={y + barH / 2 + 4}
              textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="system-ui">
              {c.nodo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Panel principal ───────────────────────────────────────────────────────────
export default function MonitorSeñalesPanel({ onCrearOrden }) {
  const [clientes, setClientes]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [nodoFiltro, setNodoFiltro] = useState("todos");
  const [nivelFiltro, setNivelFiltro] = useState("todos");
  const [refreshing, setRefreshing] = useState({});
  const [ultimaAct, setUltimaAct]   = useState(null);
  const [busqueda, setBusqueda]     = useState("");
  const [sortDir, setSortDir]       = useState("asc");

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, nodo, sn_onu, rx_signal, tx_signal, signal_updated_at, vlan, celular, dni")
      .not("sn_onu", "is", null).neq("sn_onu", "")
      .order("rx_signal", { ascending: true, nullsFirst: false })
      .limit(2000);
    setClientes(data || []);
    setUltimaAct(new Date().toLocaleTimeString());
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
    const ch = supabase.channel("monitor_senales")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clientes" }, ({ new: n }) => {
        setClientes(prev => prev.map(c => c.id === n.id
          ? { ...c, rx_signal: n.rx_signal, tx_signal: n.tx_signal, signal_updated_at: n.signal_updated_at }
          : c));
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar]);

  // Nodos únicos disponibles
  const nodos = useMemo(() => {
    const set = new Set(clientes.map(c => c.nodo).filter(Boolean));
    return ["todos", ...Array.from(set).sort()];
  }, [clientes]);

  // Stats por nodo
  const statsPorNodo = useMemo(() => {
    const map = {};
    for (const c of clientes) {
      const n = c.nodo || "Sin nodo";
      if (!map[n]) map[n] = { critico: 0, alerta: 0, normal: 0, sin_datos: 0 };
      map[n][nivelSenal(parseFloat(c.rx_signal))]++;
    }
    return map;
  }, [clientes]);

  // Stats del nodo seleccionado
  const statsActual = useMemo(() => {
    const base = nodoFiltro === "todos" ? clientes : clientes.filter(c => c.nodo === nodoFiltro);
    const s = { critico: 0, alerta: 0, normal: 0, sin_datos: 0 };
    for (const c of base) s[nivelSenal(parseFloat(c.rx_signal))]++;
    return s;
  }, [clientes, nodoFiltro]);

  // Lista filtrada final
  const lista = useMemo(() => {
    let arr = clientes.filter(c => {
      if (nodoFiltro !== "todos" && c.nodo !== nodoFiltro) return false;
      if (nivelFiltro !== "todos" && nivelSenal(parseFloat(c.rx_signal)) !== nivelFiltro) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return String(c.nombre || "").toLowerCase().includes(b)
          || String(c.sn_onu || "").toLowerCase().includes(b)
          || String(c.nodo || "").toLowerCase().includes(b);
      }
      return true;
    });
    return arr.sort((a, b) => {
      const na = parseFloat(a.rx_signal ?? "NaN");
      const nb = parseFloat(b.rx_signal ?? "NaN");
      const av = isNaN(na) ? Infinity : na;
      const bv = isNaN(nb) ? Infinity : nb;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [clientes, nodoFiltro, nivelFiltro, busqueda, sortDir]);

  // Top 10 peores del nodo/filtro actual
  const top10 = useMemo(() => {
    return lista.filter(c => !isNaN(parseFloat(c.rx_signal))).slice(0, 10);
  }, [lista]);

  const formatTime = (iso) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("es-PE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }); }
    catch { return "—"; }
  };

  const refrescarSenal = async (cli) => {
    const sn = String(cli.sn_onu || "").trim();
    if (!sn) return;
    setRefreshing(p => ({ ...p, [cli.id]: true }));
    try {
      const params = new URLSearchParams({ sn });
      if (cli.vlan) params.set("vlan", String(cli.vlan));
      const json = await fetch(`${OLT_SSH_API}/signal?${params}`).then(r => r.json()).catch(() => ({}));
      if (json.ok) {
        const now = new Date().toISOString();
        await supabase.from("clientes").update({ rx_signal: json.rxPower, tx_signal: json.txPower, signal_updated_at: now }).eq("id", cli.id);
        setClientes(prev => prev.map(c => c.id === cli.id ? { ...c, rx_signal: json.rxPower, tx_signal: json.txPower, signal_updated_at: now } : c));
      }
    } catch (_) {}
    setRefreshing(p => ({ ...p, [cli.id]: false }));
  };

  const nodoLabel = nodoFiltro === "todos" ? "Todos los nodos" : nodoFiltro;
  const nivelLabel = nivelFiltro === "todos" ? "Todos" : NIVEL_CONFIG[nivelFiltro]?.label;

  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(18); doc.setTextColor(15, 23, 42);
    doc.text("Monitor de Señales OLT — Americanet", 14, 16);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Generado: ${new Date().toLocaleString("es-PE")}   |   Nodo: ${nodoLabel}   |   Estado: ${nivelLabel}   |   Total: ${lista.length}`, 14, 24);
    doc.setFontSize(10);
    doc.setTextColor(220, 38, 38);  doc.text(`Críticos: ${statsActual.critico}`, 14, 32);
    doc.setTextColor(217, 119, 6);  doc.text(`Alertas: ${statsActual.alerta}`, 55, 32);
    doc.setTextColor(22, 163, 74);  doc.text(`Normales: ${statsActual.normal}`, 96, 32);
    doc.setTextColor(148, 163, 184); doc.text(`Sin datos: ${statsActual.sin_datos}`, 137, 32);
    autoTable(doc, {
      startY: 38,
      head: [["Estado", "Cliente", "Nodo", "SN ONU", "RX (dBm)", "TX (dBm)", "Última consulta"]],
      body: lista.map(c => {
        const rx = parseFloat(c.rx_signal);
        return [NIVEL_CONFIG[nivelSenal(isNaN(rx) ? null : rx)].label, c.nombre || "—", c.nodo || "—", c.sn_onu || "—", isNaN(rx) ? "—" : rx.toFixed(2), c.tx_signal != null ? String(c.tx_signal) : "—", formatTime(c.signal_updated_at)];
      }),
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell(data) {
        if (data.section !== "body") return;
        if (data.column.index === 0) {
          const v = data.cell.raw;
          if (v === "Crítico") { data.cell.styles.textColor = [220,38,38]; data.cell.styles.fontStyle = "bold"; }
          else if (v === "Alerta") { data.cell.styles.textColor = [217,119,6]; data.cell.styles.fontStyle = "bold"; }
          else if (v === "Normal") { data.cell.styles.textColor = [22,163,74]; data.cell.styles.fontStyle = "bold"; }
        }
        if (data.column.index === 4) {
          const rx = parseFloat(data.cell.raw);
          if (!isNaN(rx)) data.cell.styles.textColor = rx < -25 ? [220,38,38] : rx < -22 ? [217,119,6] : [22,163,74];
        }
      },
      margin: { left: 14, right: 14 },
    });
    doc.save(`senales-${nodoFiltro}-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const exportarExcel = () => {
    const filas = lista.map(c => {
      const rx = parseFloat(c.rx_signal);
      return { "Estado": NIVEL_CONFIG[nivelSenal(isNaN(rx)?null:rx)].label, "Cliente": c.nombre||"", "Nodo": c.nodo||"", "SN ONU": c.sn_onu||"", "RX (dBm)": isNaN(rx)?"":rx, "TX (dBm)": c.tx_signal??""  , "Última consulta": formatTime(c.signal_updated_at) };
    });
    const wb = XLSX.utils.book_new();
    const wsRes = XLSX.utils.aoa_to_sheet([
      ["Monitor de Señales OLT — Americanet"],
      [`Generado: ${new Date().toLocaleString("es-PE")}`],
      [`Nodo: ${nodoLabel}   |   Estado: ${nivelLabel}   |   Total: ${lista.length}`],
      [],
      ["Nivel", "Cantidad"],
      ["Críticos", statsActual.critico],
      ["Alertas", statsActual.alerta],
      ["Normales", statsActual.normal],
      ["Sin datos", statsActual.sin_datos],
    ]);
    const ws = XLSX.utils.json_to_sheet(filas);
    ws["!cols"] = [{wch:12},{wch:28},{wch:12},{wch:18},{wch:10},{wch:10},{wch:18}];
    XLSX.utils.book_append_sheet(wb, wsRes, "Resumen");
    XLSX.utils.book_append_sheet(wb, ws, "Señales");
    XLSX.writeFile(wb, `senales-${nodoFiltro}-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const totalActual = statsActual.critico + statsActual.alerta + statsActual.normal + statsActual.sin_datos;

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1280, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" }}>
            Monitor de Señales OLT
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
            {ultimaAct ? `Actualizado: ${ultimaAct}` : "Cargando…"} · {clientes.length} clientes con señal registrada
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={cargar} disabled={loading} style={{ padding: "9px 16px", background: "#1e40af", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>{loading ? "⏳" : "↺"}</span> Actualizar
          </button>
          <button onClick={exportarPDF} disabled={loading || lista.length === 0} style={{ padding: "9px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: lista.length === 0 ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            PDF
          </button>
          <button onClick={exportarExcel} disabled={loading || lista.length === 0} style={{ padding: "9px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: lista.length === 0 ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
        </div>
      </div>

      {/* ── Selector de nodo ── */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Filtrar por nodo</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {/* Tarjeta "Todos" */}
          <div onClick={() => setNodoFiltro("todos")} style={{
            padding: "14px 20px", borderRadius: 14, cursor: "pointer", transition: "all 0.2s",
            background: nodoFiltro === "todos" ? "#0f172a" : "#fff",
            border: `2px solid ${nodoFiltro === "todos" ? "#0f172a" : "#e2e8f0"}`,
            boxShadow: nodoFiltro === "todos" ? "0 6px 20px #0f172a33" : "0 1px 4px #0001",
            display: "flex", alignItems: "center", gap: 14, minWidth: 160,
          }}>
            <DonutChart
              critico={clientes.filter(c=>nivelSenal(parseFloat(c.rx_signal))==="critico").length}
              alerta={clientes.filter(c=>nivelSenal(parseFloat(c.rx_signal))==="alerta").length}
              normal={clientes.filter(c=>nivelSenal(parseFloat(c.rx_signal))==="normal").length}
              sin_datos={clientes.filter(c=>nivelSenal(parseFloat(c.rx_signal))==="sin_datos").length}
              size={56}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: nodoFiltro === "todos" ? "#fff" : "#0f172a" }}>Todos</div>
              <div style={{ fontSize: 11, color: nodoFiltro === "todos" ? "#94a3b8" : "#64748b", marginTop: 2 }}>{clientes.length} clientes</div>
            </div>
          </div>

          {/* Tarjetas por nodo */}
          {nodos.filter(n => n !== "todos").map(nodo => {
            const s = statsPorNodo[nodo] || { critico:0, alerta:0, normal:0, sin_datos:0 };
            const tot = s.critico + s.alerta + s.normal + s.sin_datos;
            return (
              <TarjetaNodo key={nodo} nodo={nodo} stats={s} total={tot}
                activo={nodoFiltro === nodo} onClick={() => setNodoFiltro(nodoFiltro === nodo ? "todos" : nodo)} />
            );
          })}
        </div>
      </div>

      {/* ── Chips de nivel + búsqueda ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "16px 20px", marginBottom: 20, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", boxShadow: "0 1px 4px #0001" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { key: "todos",    label: "Todos",    count: totalActual },
            { key: "critico",  label: "Crítico",  count: statsActual.critico  },
            { key: "alerta",   label: "Alerta",   count: statsActual.alerta   },
            { key: "normal",   label: "Normal",   count: statsActual.normal   },
            { key: "sin_datos",label: "Sin datos",count: statsActual.sin_datos },
          ].map(t => (
            <ChipNivel key={t.key} nivel={t.key} count={t.count}
              activo={nivelFiltro === t.key}
              onClick={() => setNivelFiltro(nivelFiltro === t.key ? "todos" : t.key)} />
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", gap: 8, minWidth: 200 }}>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cliente o SN…"
            style={{ flex: 1, padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 13, outline: "none", background: "#f8fafc" }} />
          <button onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
            style={{ padding: "7px 13px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#475569", whiteSpace: "nowrap" }}>
            {sortDir === "asc" ? "▲ Peor primero" : "▼ Mejor primero"}
          </button>
        </div>
      </div>

      {/* ── Top 10 SVG ── */}
      {top10.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: 20, boxShadow: "0 1px 4px #0001" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Top 10 peores señales {nodoFiltro !== "todos" ? `— ${nodoFiltro}` : ""}
            </h3>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Escala: -35 a -15 dBm</span>
          </div>
          <Top10Chart data={top10} />
        </div>
      )}

      {/* ── Tabla ── */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px #0001" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ display: "block", margin: "0 auto 12px" }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            Cargando señales…
          </div>
        ) : lista.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>No hay registros con los filtros aplicados.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                {["Estado", "Cliente", "Nodo", "SN ONU", "Señal RX", "TX", "Última consulta", "Acciones"].map(h => (
                  <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((c, i) => {
                const rx  = parseFloat(c.rx_signal);
                const nivel = nivelSenal(isNaN(rx) ? null : rx);
                const cfg = NIVEL_CONFIG[nivel];
                return (
                  <tr key={c.id}
                    style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}
                    onMouseEnter={e => e.currentTarget.style.background = cfg.light}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa"}>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.light, border: `1px solid ${cfg.border}` }}>
                        <svg width="7" height="7" viewBox="0 0 7 7"><circle cx="3.5" cy="3.5" r="3.5" fill={cfg.color}/></svg>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#1e293b", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.nombre}>{c.nombre || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>{c.nodo || "—"}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{c.sn_onu}</td>
                    <td style={{ padding: "10px 14px" }}><BarraSenal rx={isNaN(rx) ? null : rx} /></td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{c.tx_signal != null ? `${c.tx_signal} dBm` : "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>{formatTime(c.signal_updated_at)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => refrescarSenal(c)} disabled={!!refreshing[c.id]} title="Refrescar señal"
                          style={{ padding: "5px 9px", background: refreshing[c.id] ? "#f1f5f9" : "#eff6ff", border: `1px solid ${refreshing[c.id] ? "#e2e8f0" : "#bfdbfe"}`, borderRadius: 8, fontSize: 13, cursor: refreshing[c.id] ? "wait" : "pointer", color: "#1e40af", fontWeight: 700 }}>
                          {refreshing[c.id] ? "⏳" : "↺"}
                        </button>
                        {onCrearOrden && (
                          <button onClick={() => onCrearOrden(c)} title="Crear orden de visita"
                            style={{ padding: "5px 9px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#c2410c", fontWeight: 700, whiteSpace: "nowrap" }}>
                            + Orden
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ marginTop: 8, fontSize: 11, color: "#cbd5e1", textAlign: "right" }}>{lista.length} registros mostrados</p>
    </div>
  );
}
