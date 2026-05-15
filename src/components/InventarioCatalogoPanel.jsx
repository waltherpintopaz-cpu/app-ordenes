import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Package, Settings, FileText, RefreshCw, Save, X, Pencil } from "lucide-react";

const LS_PRECIOS_KEY = "inventario_catalogo_precios";

function loadPreciosLS() {
  try { return JSON.parse(localStorage.getItem(LS_PRECIOS_KEY) || "{}"); } catch { return {}; }
}
function savePreciosLS(obj) {
  try { localStorage.setItem(LS_PRECIOS_KEY, JSON.stringify(obj)); } catch {}
}

const ESTADO_COLORS = {
  almacen:   { bg: "#dbeafe", text: "#1d4ed8", label: "Almacén" },
  asignado:  { bg: "#dcfce7", text: "#16a34a", label: "Asignado" },
  liquidado: { bg: "#fef9c3", text: "#b45309", label: "Liquidado" },
};

const normalizeEstado = (e) => (e || "").toLowerCase();
const estadoLabel  = (e) => ESTADO_COLORS[normalizeEstado(e)]?.label || e || "—";
const estadoStyle  = (e) => ESTADO_COLORS[normalizeEstado(e)]
  ? { background: ESTADO_COLORS[e].bg, color: ESTADO_COLORS[e].text, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 }
  : { background: "#f3f4f6", color: "#374151", borderRadius: 6, padding: "2px 8px", fontSize: 12 };

const fmt$ = (v) => `S/ ${Number(v || 0).toFixed(2)}`;

export default function InventarioCatalogoPanel({ cardStyle, sectionTitleStyle }) {
  const [equipos, setEquipos]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  // Filtros
  const [filtEmpresa,  setFiltEmpresa]  = useState("todos");
  const [filtTipo,     setFiltTipo]     = useState("todos");
  const [filtModelo,   setFiltModelo]   = useState("todos");
  const [filtEstado,   setFiltEstado]   = useState("todos");
  const [filtTecnico,  setFiltTecnico]  = useState("todos");
  const [busqueda,     setBusqueda]     = useState("");

  // Ordenamiento
  const [sortCol, setSortCol]   = useState(null);
  const [sortDir, setSortDir]   = useState("asc");

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  // Edición de equipo
  const [editEquipo,   setEditEquipo]   = useState(null);
  const [editForm,     setEditForm]     = useState({});
  const [editSaving,   setEditSaving]   = useState(false);
  const [editMsg,      setEditMsg]      = useState("");

  function openEdit(e) {
    setEditEquipo(e);
    setEditForm({
      empresa:          e.empresa          || "",
      tipo:             e.tipo             || "",
      marca:            e.marca            || "",
      modelo:           e.modelo           || "",
      precio_unitario:  e.precio_unitario  ?? "",
      codigo_qr:        e.codigo_qr        || "",
      serial_mac:       e.serial_mac       || "",
      estado:           normalizeEstado(e.estado),
      tecnico_asignado: e.tecnico_asignado || "",
    });
    setEditMsg("");
  }

  async function guardarEdicion() {
    setEditSaving(true); setEditMsg("");
    const { error } = await supabase
      .from("equipos_catalogo")
      .update({
        empresa:          editForm.empresa,
        tipo:             editForm.tipo,
        marca:            editForm.marca,
        modelo:           editForm.modelo,
        precio_unitario:  editForm.precio_unitario !== "" ? Number(editForm.precio_unitario) : null,
        codigo_qr:        editForm.codigo_qr,
        serial_mac:       editForm.serial_mac,
        estado:           editForm.estado,
        tecnico_asignado: editForm.tecnico_asignado,
      })
      .eq("id", editEquipo.id);
    setEditSaving(false);
    if (error) { setEditMsg("Error: " + error.message); return; }
    setEditMsg("Guardado correctamente");
    await fetchEquipos();
    setTimeout(() => { setEditEquipo(null); setEditMsg(""); }, 1000);
  }

  // Configuración de precios (solo localStorage, no toca Supabase)
  const [preciosLocal, setPreciosLocal] = useState(loadPreciosLS);
  const [showConfig,   setShowConfig]   = useState(false);
  const [preciosEdit,  setPreciosEdit]  = useState({});
  const [saveMsg,      setSaveMsg]      = useState("");

  useEffect(() => { fetchEquipos(); }, []);

  async function fetchEquipos() {
    setLoading(true); setError(null);
    const { data, error } = await supabase
      .from("equipos_catalogo")
      .select("id,empresa,tipo,marca,modelo,precio_unitario,codigo_qr,serial_mac,estado,tecnico_asignado")
      .order("empresa").order("tipo").order("modelo");
    if (error) { setError(error.message); setLoading(false); return; }
    setEquipos(data || []);
    setLoading(false);
  }

  // Precio efectivo: localStorage tiene prioridad sobre el valor de la DB
  function getPrecio(e) {
    const k = `${e.empresa}||${e.tipo}||${e.modelo}`;
    return preciosLocal[k] !== undefined ? Number(preciosLocal[k]) : Number(e.precio_unitario || 0);
  }

  // Opciones dinámicas para selects
  const empresas  = useMemo(() => ["todos", ...new Set(equipos.map(e => e.empresa).filter(Boolean))], [equipos]);
  const tipos     = useMemo(() => {
    const base = filtEmpresa === "todos" ? equipos : equipos.filter(e => e.empresa === filtEmpresa);
    return ["todos", ...new Set(base.map(e => e.tipo).filter(Boolean))];
  }, [equipos, filtEmpresa]);
  const modelos   = useMemo(() => {
    let base = equipos;
    if (filtEmpresa !== "todos") base = base.filter(e => e.empresa === filtEmpresa);
    if (filtTipo    !== "todos") base = base.filter(e => e.tipo    === filtTipo);
    return ["todos", ...new Set(base.map(e => e.modelo).filter(Boolean))];
  }, [equipos, filtEmpresa, filtTipo]);
  const tecnicos  = useMemo(() => ["todos", ...new Set(equipos.map(e => e.tecnico_asignado).filter(Boolean))].sort(), [equipos]);

  const filtrados = useMemo(() => {
    let r = equipos;
    if (filtEmpresa !== "todos") r = r.filter(e => e.empresa          === filtEmpresa);
    if (filtTipo    !== "todos") r = r.filter(e => e.tipo             === filtTipo);
    if (filtModelo  !== "todos") r = r.filter(e => e.modelo           === filtModelo);
    if (filtEstado  !== "todos") r = r.filter(e => normalizeEstado(e.estado) === filtEstado);
    if (filtTecnico !== "todos") r = r.filter(e => e.tecnico_asignado === filtTecnico);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      r = r.filter(e =>
        (e.codigo_qr       || "").toLowerCase().includes(q) ||
        (e.serial_mac      || "").toLowerCase().includes(q) ||
        (e.modelo          || "").toLowerCase().includes(q) ||
        (e.marca           || "").toLowerCase().includes(q) ||
        (e.tecnico_asignado|| "").toLowerCase().includes(q)
      );
    }
    if (sortCol) {
      r = [...r].sort((a, b) => {
        let va = sortCol === "precio" ? getPrecio(a) : (a[sortCol] || "");
        let vb = sortCol === "precio" ? getPrecio(b) : (b[sortCol] || "");
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ?  1 : -1;
        return 0;
      });
    }
    return r;
  }, [equipos, filtEmpresa, filtTipo, filtModelo, filtEstado, filtTecnico, busqueda, sortCol, sortDir]);

  // KPIs — usa precio local
  const kpis = useMemo(() => {
    const total     = filtrados.length;
    const almacen   = filtrados.filter(e => normalizeEstado(e.estado) === "almacen").length;
    const asignado  = filtrados.filter(e => normalizeEstado(e.estado) === "asignado").length;
    const liquidado = filtrados.filter(e => normalizeEstado(e.estado) === "liquidado").length;
    const totalVal  = filtrados.reduce((s, e) => s + getPrecio(e), 0);
    return { total, almacen, asignado, liquidado, totalVal };
  }, [filtrados, preciosLocal]);

  // Modelos únicos para config — precio efectivo (local > DB)
  const modelosUnicos = useMemo(() => {
    const map = {};
    for (const e of equipos) {
      const k = `${e.empresa}||${e.tipo}||${e.modelo}`;
      if (!map[k]) map[k] = { empresa: e.empresa, tipo: e.tipo, modelo: e.modelo, precio_unitario: e.precio_unitario };
    }
    return Object.values(map).sort((a, b) => `${a.empresa}${a.modelo}`.localeCompare(`${b.empresa}${b.modelo}`));
  }, [equipos]);

  function openConfig() {
    const saved = loadPreciosLS();
    const init = {};
    for (const m of modelosUnicos) {
      const k = `${m.empresa}||${m.tipo}||${m.modelo}`;
      init[k] = saved[k] !== undefined ? saved[k] : m.precio_unitario;
    }
    setPreciosEdit(init);
    setShowConfig(true);
    setSaveMsg("");
  }

  function guardarPrecios() {
    savePreciosLS(preciosEdit);
    setPreciosLocal({ ...preciosEdit });
    setSaveMsg("Precios guardados correctamente");
    setTimeout(() => { setSaveMsg(""); setShowConfig(false); }, 1500);
  }

  function generarPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const now  = new Date().toLocaleDateString("es-EC", { day:"2-digit", month:"2-digit", year:"numeric" });

    // Encabezado
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, 297, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("INVENTARIO CATÁLOGO DE EQUIPOS", 148, 10, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const filtrosDesc = [
      filtEmpresa !== "todos" ? `Empresa: ${filtEmpresa}`           : "",
      filtTipo    !== "todos" ? `Tipo: ${filtTipo}`                 : "",
      filtModelo  !== "todos" ? `Modelo: ${filtModelo}`             : "",
      filtEstado  !== "todos" ? `Estado: ${estadoLabel(filtEstado)}`: "",
      filtTecnico !== "todos" ? `Técnico: ${filtTecnico}`           : "",
    ].filter(Boolean).join("  |  ") || "Sin filtros";
    doc.text(`Filtros: ${filtrosDesc}   Fecha: ${now}`, 148, 18, { align: "center" });

    // Tabla
    const cols = ["#", "Empresa", "Tipo", "Marca", "Modelo", "Serial / MAC", "Código QR", "Estado", "Técnico Asignado", "Precio"];
    const rows = filtrados.map((e, i) => [
      i + 1,
      e.empresa           || "—",
      e.tipo              || "—",
      e.marca             || "—",
      e.modelo            || "—",
      e.serial_mac        || "—",
      e.codigo_qr         || "—",
      estadoLabel(e.estado),
      e.tecnico_asignado  || "—",
      fmt$(getPrecio(e)),
    ]);

    autoTable(doc, {
      startY: 26,
      head:   [cols],
      body:   rows,
      styles:      { fontSize: 7, cellPadding: 2 },
      headStyles:  { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [239, 246, 255] },
      columnStyles: { 0: { cellWidth: 7 }, 9: { halign: "right", fontStyle: "bold" } },
    });

    // Total
    const finalY = doc.lastAutoTable.finalY + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text(`Total equipos: ${filtrados.length}`, 14, finalY);
    doc.text(`Valor total: ${fmt$(kpis.totalVal)}`, 283, finalY, { align: "right" });

    doc.save(`inventario-catalogo-${now.replace(/\//g, "-")}.pdf`);
  }

  const selStyle = {
    border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px",
    fontSize: 13, background: "#fff", minWidth: 130,
  };

  return (
    <div style={{ padding: "20px 16px", maxWidth: 1400, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Package size={22} color="#1d4ed8" />
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Inventario Catálogo</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={openConfig}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>
            <Settings size={15} /> Configurar Precios
          </button>
          <button onClick={generarPDF}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <FileText size={15} /> Generar PDF
          </button>
          <button onClick={fetchEquipos}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Modal Editar Equipo */}
      {editEquipo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20, gap: 8 }}>
              <Pencil size={18} color="#1d4ed8" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Editar Equipo — {editEquipo.codigo_qr}</h3>
              <button onClick={() => setEditEquipo(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            {[
              { label: "Empresa",          key: "empresa",          type: "select", opts: ["DIM","Americanet"] },
              { label: "Tipo",             key: "tipo",             type: "text" },
              { label: "Marca",            key: "marca",            type: "text" },
              { label: "Modelo",           key: "modelo",           type: "text" },
              { label: "Precio Unitario",  key: "precio_unitario",  type: "number" },
              { label: "Código QR",        key: "codigo_qr",        type: "text" },
              { label: "Serial / MAC",     key: "serial_mac",       type: "text" },
              { label: "Estado",           key: "estado",           type: "select", opts: ["almacen","asignado","liquidado"] },
              { label: "Técnico Asignado", key: "tecnico_asignado", type: "text" },
            ].map(({ label, key, type, opts }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 600 }}>{label}</label>
                {type === "select" ? (
                  <select value={editForm[key]} onChange={ev => setEditForm(f => ({ ...f, [key]: ev.target.value }))}
                    style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: "7px 10px", fontSize: 14 }}>
                    {opts.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                  </select>
                ) : (
                  <input type={type} value={editForm[key]}
                    onChange={ev => setEditForm(f => ({ ...f, [key]: ev.target.value }))}
                    style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: "7px 10px", fontSize: 14, boxSizing: "border-box" }}
                  />
                )}
              </div>
            ))}
            {editMsg && (
              <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 12, background: editMsg.startsWith("Error") ? "#fee2e2" : "#dcfce7", color: editMsg.startsWith("Error") ? "#dc2626" : "#16a34a", fontSize: 13 }}>
                {editMsg}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setEditEquipo(null)}
                style={{ padding: "7px 16px", borderRadius: 7, border: "1px solid #d1d5db", background: "#f3f4f6", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={guardarEdicion} disabled={editSaving}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", borderRadius: 7, border: "none", background: "#1d4ed8", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                <Save size={14} /> {editSaving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Configurar Precios */}
      {showConfig && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 680, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 8 }}>
              <Settings size={18} color="#1d4ed8" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Configuración de Precios por Modelo</h3>
              <button onClick={() => setShowConfig(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#eff6ff" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #dbeafe" }}>Empresa</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #dbeafe" }}>Tipo</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #dbeafe" }}>Modelo</th>
                    <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #dbeafe", width: 110 }}>Precio $</th>
                  </tr>
                </thead>
                <tbody>
                  {modelosUnicos.map((m) => {
                    const k = `${m.empresa}||${m.tipo}||${m.modelo}`;
                    return (
                      <tr key={k} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "7px 10px" }}>{m.empresa}</td>
                        <td style={{ padding: "7px 10px" }}>{m.tipo}</td>
                        <td style={{ padding: "7px 10px", fontWeight: 500 }}>{m.modelo}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>
                          <input
                            type="number" min="0" step="0.01"
                            value={preciosEdit[k] ?? ""}
                            onChange={e => setPreciosEdit(prev => ({ ...prev, [k]: e.target.value }))}
                            style={{ width: 90, border: "1px solid #d1d5db", borderRadius: 5, padding: "4px 7px", textAlign: "right", fontSize: 13 }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {saveMsg && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: saveMsg.includes("Error") ? "#fee2e2" : "#dcfce7", color: saveMsg.includes("Error") ? "#dc2626" : "#16a34a", fontSize: 13 }}>
                {saveMsg}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setShowConfig(false)}
                style={{ padding: "7px 16px", borderRadius: 7, border: "1px solid #d1d5db", background: "#f3f4f6", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={guardarPrecios}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", borderRadius: 7, border: "none", background: "#1d4ed8", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                <Save size={14} /> Guardar Precios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total",     value: kpis.total,     bg: "#eff6ff", text: "#1d4ed8" },
          { label: "Almacén",   value: kpis.almacen,   bg: "#dbeafe", text: "#1d4ed8" },
          { label: "Asignados", value: kpis.asignado,  bg: "#dcfce7", text: "#16a34a" },
          { label: "Liquidados",value: kpis.liquidado, bg: "#fef9c3", text: "#b45309" },
          { label: "Valor Total",value: fmt$(kpis.totalVal), bg: "#f0fdf4", text: "#15803d" },
        ].map(k => (
          <div key={k.label} style={{ ...cardStyle, background: k.bg, border: `1px solid ${k.text}22`, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.text }}>{k.value}</div>
            <div style={{ fontSize: 12, color: k.text, opacity: 0.8 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ ...cardStyle, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          placeholder="Buscar QR, serial, modelo…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          style={{ ...selStyle, minWidth: 200 }}
        />
        <select value={filtEmpresa} onChange={e => { setFiltEmpresa(e.target.value); setFiltTipo("todos"); setFiltModelo("todos"); }} style={selStyle}>
          {empresas.map(v => <option key={v} value={v}>{v === "todos" ? "Todas las empresas" : v}</option>)}
        </select>
        <select value={filtTipo} onChange={e => { setFiltTipo(e.target.value); setFiltModelo("todos"); }} style={selStyle}>
          {tipos.map(v => <option key={v} value={v}>{v === "todos" ? "Todos los tipos" : v}</option>)}
        </select>
        <select value={filtModelo} onChange={e => setFiltModelo(e.target.value)} style={selStyle}>
          {modelos.map(v => <option key={v} value={v}>{v === "todos" ? "Todos los modelos" : v}</option>)}
        </select>
        <select value={filtEstado} onChange={e => setFiltEstado(e.target.value)} style={selStyle}>
          <option value="todos">Todos los estados</option>
          <option value="almacen">Almacén</option>
          <option value="asignado">Asignado</option>
          <option value="liquidado">Liquidado</option>
        </select>
        <select value={filtTecnico} onChange={e => setFiltTecnico(e.target.value)} style={selStyle}>
          {tecnicos.map(v => <option key={v} value={v}>{v === "todos" ? "Todos los técnicos" : v}</option>)}
        </select>
        {(filtEmpresa !== "todos" || filtTipo !== "todos" || filtModelo !== "todos" || filtEstado !== "todos" || filtTecnico !== "todos" || busqueda) && (
          <button onClick={() => { setFiltEmpresa("todos"); setFiltTipo("todos"); setFiltModelo("todos"); setFiltEstado("todos"); setFiltTecnico("todos"); setBusqueda(""); }}
            style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>
            Limpiar filtros
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>{filtrados.length} equipo(s)</span>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Cargando inventario…</div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: 24, color: "#dc2626" }}>{error}</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Sin equipos con los filtros actuales.</div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#1d4ed8", color: "#fff" }}>
                  {[
                    { label: "",                col: null },
                    { label: "#",               col: null },
                    { label: "Empresa",         col: "empresa" },
                    { label: "Tipo",            col: "tipo" },
                    { label: "Marca",           col: "marca" },
                    { label: "Modelo",          col: "modelo" },
                    { label: "Serial / MAC",    col: "serial_mac" },
                    { label: "Código QR",       col: "codigo_qr" },
                    { label: "Estado",          col: "estado" },
                    { label: "Técnico Asignado",col: "tecnico_asignado" },
                    { label: "Precio",          col: "precio" },
                  ].map(({ label, col }) => (
                    <th key={label}
                      onClick={() => col && toggleSort(col)}
                      style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap", cursor: col ? "pointer" : "default", userSelect: "none" }}>
                      {label}
                      {col && sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : col ? " ⇅" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8faff", borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "6px 8px", width: 36 }}>
                      <button onClick={() => openEdit(e)} title="Editar"
                        style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 5, padding: "3px 6px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                        <Pencil size={13} color="#1d4ed8" />
                      </button>
                    </td>
                    <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{i + 1}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{e.empresa || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>{e.tipo || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>{e.marca || "—"}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>{e.modelo || "—"}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{e.serial_mac || "—"}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{e.codigo_qr || "—"}</td>
                    <td style={{ padding: "8px 12px" }}><span style={estadoStyle(e.estado)}>{estadoLabel(e.estado)}</span></td>
                    <td style={{ padding: "8px 12px", fontSize: 12 }}>{e.tecnico_asignado || "—"}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1d4ed8", textAlign: "right" }}>{fmt$(getPrecio(e))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#eff6ff", fontWeight: 700 }}>
                  <td colSpan={10} style={{ padding: "10px 12px", color: "#1d4ed8", fontSize: 13 }}>
                    Total ({filtrados.length} equipos)
                  </td>
                  <td style={{ padding: "10px 12px", color: "#1d4ed8", fontSize: 14, textAlign: "right" }}>
                    {fmt$(kpis.totalVal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
