import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const NODO_LABELS = { 5:"Nod_04",6:"Nod_04",10:"Nod_03",3:"Nod_03",9:"Nod_01",1:"Nod_01",8:"Nod_01",7:"Nod_01",2:"Nod_02",11:"Nod_06" };
const formatNodo = (n) => n != null ? (NODO_LABELS[n] || `Nod_${String(n).padStart(2,"0")}`) : "Sin nodo";
const COLORS = ["#2563eb","#16a34a","#d97706","#dc2626","#7c3aed","#0891b2","#0f172a"];

export default function MikrowispReportesPanel({ cardStyle, sectionTitleStyle }) {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const hoy    = new Date().toISOString().split("T")[0];
  const hace30 = new Date(Date.now() - 30*24*60*60*1000).toISOString().split("T")[0];

  const [fechaDesde, setFechaDesde]   = useState(hace30);
  const [fechaHasta, setFechaHasta]   = useState(hoy);
  const [filtroNodos, setFiltroNodos] = useState([]);
  const [filtroUsers, setFiltroUsers] = useState([]);
  const [showNodoDD, setShowNodoDD]   = useState(false);
  const [showUserDD, setShowUserDD]   = useState(false);

  useEffect(() => { fetchRegistros(); }, [fechaDesde, fechaHasta]);

  async function fetchRegistros() {
    setLoading(true); setError(null);
    const PAGE = 1000;
    let all = [], from = 0, hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from("mikrowisp_clientes")
        .select("mikrowisp_id,cedula,nombre,nodo,estado,updated_at,agregado_por")
        .gte("updated_at", fechaDesde + "T00:00:00")
        .lte("updated_at", fechaHasta + "T23:59:59")
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) { setError(error.message); setLoading(false); return; }
      all = all.concat(data || []);
      hasMore = (data || []).length === PAGE;
      from += PAGE;
    }
    setRegistros(all);
    setLoading(false);
  }

  const nodos   = useMemo(() => [...new Set(registros.map(r => formatNodo(r.nodo)))].filter(Boolean).sort(), [registros]);
  const usuarios = useMemo(() => [...new Set(registros.map(r => r.agregado_por))].filter(Boolean).sort(), [registros]);

  const toggle = (set) => (v) => set(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const filtrados = useMemo(() => registros.filter(r => {
    if (filtroNodos.length > 0 && !filtroNodos.includes(formatNodo(r.nodo))) return false;
    if (filtroUsers.length > 0 && !filtroUsers.includes(r.agregado_por)) return false;
    return true;
  }), [registros, filtroNodos, filtroUsers]);

  const total       = filtrados.length;
  const conUsuario  = filtrados.filter(r => r.agregado_por).length;
  const sinUsuario  = total - conUsuario;

  // Por usuario
  const porUsuario = useMemo(() => {
    const map = {};
    for (const r of filtrados) {
      const k = r.agregado_por || "Sin registrar";
      if (!map[k]) map[k] = { usuario: k, total: 0, nodos: new Set() };
      map[k].total++;
      if (r.nodo != null) map[k].nodos.add(formatNodo(r.nodo));
    }
    return Object.values(map)
      .map(r => ({ ...r, nodos: [...r.nodos].join(", ") }))
      .sort((a, b) => b.total - a.total);
  }, [filtrados]);

  // Por nodo
  const porNodo = useMemo(() => {
    const map = {};
    for (const r of filtrados) {
      const k = formatNodo(r.nodo);
      if (!map[k]) map[k] = { nodo: k, total: 0 };
      map[k].total++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  // Tendencia diaria
  const tendencia = useMemo(() => {
    const map = {};
    for (const r of filtrados) {
      const fecha = String(r.updated_at || "").slice(0, 10);
      if (!fecha) continue;
      if (!map[fecha]) map[fecha] = { fecha, total: 0 };
      map[fecha].total++;
    }
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [filtrados]);

  // Dona por nodo
  const donaNodo = porNodo.map(r => ({ name: r.nodo, value: r.total }));

  const pct = (n, t) => t > 0 ? ((n/t)*100).toFixed(1) + "%" : "—";

  function generarPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.text("Reporte Registro MikroWisp", 14, 18);
    doc.setFontSize(10);
    let y = 26;
    doc.text(`Periodo: ${fechaDesde} al ${fechaHasta}`, 14, y); y += 6;
    if (filtroNodos.length > 0) { doc.text(`Nodos: ${filtroNodos.join(", ")}`, 14, y); y += 6; }
    if (filtroUsers.length > 0) { doc.text(`Usuarios: ${filtroUsers.join(", ")}`, 14, y); y += 6; }
    doc.text(`Total registros: ${total}`, 14, y); y += 10;

    doc.setFontSize(12); doc.text("Por Usuario", 14, y); y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Usuario", "Registros", "% Total", "Nodos"]],
      body: porUsuario.map(r => [r.usuario, r.total, pct(r.total, total), r.nodos]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [37, 99, 235] },
    });

    const y2 = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.text("Por Nodo", 14, y2);
    autoTable(doc, {
      startY: y2 + 4,
      head: [["Nodo", "Registros", "% Total"]],
      body: porNodo.map(r => [r.nodo, r.total, pct(r.total, total)]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [5, 150, 105] },
    });

    doc.save(`reporte_mikrowisp_${fechaDesde}_${fechaHasta}.pdf`);
  }

  const inputSt = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: 13, background: "#fff", color: "#1e293b", outline: "none" };
  const thSt    = { padding: "10px 14px", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", fontSize: 11, textTransform: "uppercase" };
  const tdSt    = { padding: "9px 14px", fontSize: 13 };

  const MultiSelect = ({ label, options, selected, onToggle, show, setShow }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
      <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</label>
      <div onClick={() => setShow(!show)} style={{ ...inputSt, minWidth: 150, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}>
        <span style={{ color: selected.length === 0 ? "#94a3b8" : "#1e293b" }}>
          {selected.length === 0 ? "Todos" : selected.length === 1 ? selected[0] : `${selected.length} sel.`}
        </span>
        <span style={{ fontSize: 10, color: "#64748b" }}>▼</span>
      </div>
      {show && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, minWidth: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
          {selected.length > 0 && (
            <div onClick={() => { [...selected].forEach(v => onToggle(v)); setShow(false); }}
              style={{ padding: "8px 14px", fontSize: 12, color: "#2563eb", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
              Limpiar selección
            </div>
          )}
          {options.map(opt => (
            <div key={opt} onClick={() => onToggle(opt)}
              style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: selected.includes(opt) ? "#eff6ff" : "#fff" }}>
              <input type="checkbox" readOnly checked={selected.includes(opt)} style={{ accentColor: "#2563eb" }} />
              <span style={{ color: "#1e293b" }}>{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }} onClick={() => { setShowNodoDD(false); setShowUserDD(false); }}>

      {/* Filtros */}
      <div style={{ ...cardStyle, marginBottom: 16 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ ...sectionTitleStyle }}>Reportes Registro MikroWisp</div>
          <button onClick={generarPDF} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⬇ Generar PDF
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={inputSt} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={inputSt} />
          </div>
          <MultiSelect label="Nodo"    options={nodos}    selected={filtroNodos} onToggle={toggle(setFiltroNodos)} show={showNodoDD} setShow={setShowNodoDD} />
          <MultiSelect label="Usuario" options={usuarios} selected={filtroUsers} onToggle={toggle(setFiltroUsers)} show={showUserDD} setShow={setShowUserDD} />
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={fetchRegistros} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "TOTAL REGISTROS", value: total,       color: "#2563eb" },
          { label: "CON USUARIO",     value: conUsuario,  color: "#16a34a" },
          { label: "SIN USUARIO",     value: sinUsuario,  color: "#d97706" },
          { label: "% TRAZABILIDAD",  value: pct(conUsuario, total), color: "#16a34a" },
          { label: "USUARIOS",        value: usuarios.length, color: "#0f172a" },
          { label: "NODOS",           value: nodos.length,    color: "#0f172a" },
        ].map(k => (
          <div key={k.label} style={{ ...cardStyle, flex: 1, minWidth: 100, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Cargando...</div>
      ) : error ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#dc2626" }}>{error}</div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Sin datos para el periodo seleccionado</div>
      ) : (
        <>
          {/* Gráficos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

            <div style={{ ...cardStyle }}>
              <div style={{ ...sectionTitleStyle, marginBottom: 16 }}>Registros por Usuario</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={porUsuario} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="usuario" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v) => [v, "Registros"]} />
                  <Bar dataKey="total" name="Registros" radius={[0,4,4,0]}>
                    {porUsuario.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ ...cardStyle }}>
              <div style={{ ...sectionTitleStyle, marginBottom: 16 }}>Distribución por Nodo</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={donaNodo} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                    dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {donaNodo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [v, "Registros"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tendencia */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ ...sectionTitleStyle, marginBottom: 16 }}>Tendencia Diaria de Registros</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={tendencia} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={v => `Fecha: ${v}`} />
                <Line type="monotone" dataKey="total" name="Registros" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla por usuario */}
          <div style={{ ...cardStyle, padding: 0, overflow: "auto", marginBottom: 16 }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ ...sectionTitleStyle, color: "#2563eb" }}>Por Usuario</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ ...thSt, textAlign: "left" }}>Usuario</th>
                  <th style={{ ...thSt, textAlign: "right" }}>Registros</th>
                  <th style={{ ...thSt, textAlign: "right" }}>% Total</th>
                  <th style={{ ...thSt, textAlign: "left" }}>Nodos</th>
                </tr>
              </thead>
              <tbody>
                {porUsuario.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ ...tdSt, fontWeight: 600, color: "#334155" }}>{row.usuario}</td>
                    <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, color: "#2563eb" }}>{row.total}</td>
                    <td style={{ ...tdSt, textAlign: "right" }}>
                      <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                        {pct(row.total, total)}
                      </span>
                    </td>
                    <td style={{ ...tdSt, color: "#64748b", fontSize: 12 }}>{row.nodos || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tabla por nodo */}
          <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ ...sectionTitleStyle, color: "#059669" }}>Por Nodo</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ ...thSt, textAlign: "left" }}>Nodo</th>
                  <th style={{ ...thSt, textAlign: "right" }}>Registros</th>
                  <th style={{ ...thSt, textAlign: "right" }}>% Total</th>
                </tr>
              </thead>
              <tbody>
                {porNodo.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ ...tdSt }}>
                      <span style={{ background: "#f0fdf4", color: "#16a34a", borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>{row.nodo}</span>
                    </td>
                    <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, color: "#1e293b" }}>{row.total}</td>
                    <td style={{ ...tdSt, textAlign: "right" }}>
                      <span style={{ background: "#f0fdf4", color: "#16a34a", borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                        {pct(row.total, total)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
