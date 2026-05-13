import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  TrendingUp, TrendingDown, Wallet, Plus, Edit2, Trash2, FileText,
  X, Download, Tag, Layers, BarChart2, RefreshCw, Paperclip, Image, Eye,
} from "lucide-react";

// ── Configuración de nodos ────────────────────────────────────────────────────
const NODOS = [
  { key: "Nod_01",       label: "Nod 01 — Propio",              pct: 100, tipo: "propio",    socio: null },
  { key: "Nod_02",       label: "Nod 02 — Servicios a Juan",    pct: 100, tipo: "servicios", socio: "Juan Ramírez" },
  { key: "Nod_03",       label: "Nod 03 — Sociedad 50/50",      pct: 50,  tipo: "sociedad",  socio: "Juan Ramírez" },
  { key: "Nod_04",       label: "Nod 04 — Sociedad 50/50",      pct: 50,  tipo: "sociedad",  socio: "Juan Ramírez" },
  { key: "Gastos_Juan",  label: "Gastos Compartidos (Juan)",     pct: null, tipo: "compartido", socio: "Juan Ramírez" },
];
const NODO_MAP = Object.fromEntries(NODOS.map((n) => [n.key, n]));

const TABS = [
  { key: "consolidado", label: "Consolidado",  Icon: Layers },
  { key: "por_nodo",    label: "Por Nodo",     Icon: BarChart2 },
  { key: "rendicion",   label: "Rendición",    Icon: FileText },
  { key: "categorias",  label: "Categorías",   Icon: Tag },
];

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n = 0) =>
  Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFecha = (iso = "") => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const monto_propio = (m) => (m.monto * m.porcentaje_propio) / 100;

const calcTotales = (movs) => {
  const ingresos   = movs.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0);
  const egresos    = movs.filter((m) => m.tipo === "egreso").reduce((a, m) => a + m.monto, 0);
  const ing_propio = movs.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + monto_propio(m), 0);
  const egr_propio = movs.filter((m) => m.tipo === "egreso").reduce((a, m) => a + monto_propio(m), 0);
  return { ingresos, egresos, ing_propio, egr_propio, balance: ing_propio - egr_propio };
};

const anioActual = new Date().getFullYear();
const mesActual  = new Date().getMonth() + 1;

const emptyForm = {
  fecha: new Date().toISOString().slice(0, 10),
  nodo: "Nod_01",
  tipo: "ingreso",
  categoria: "",
  descripcion: "",
  monto: "",
  porcentaje_propio: 100,
  archivos: [],
};

// ── Estilos base ─────────────────────────────────────────────────────────────
const card  = { background: "#fff", borderRadius: 12, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,.08)" };
const btn   = (color = "#2563EB") => ({
  background: color, color: "#fff", border: "none", borderRadius: 8,
  padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 14,
  display: "inline-flex", alignItems: "center", gap: 6,
});
const btnGhost = {
  background: "transparent", border: "1px solid #D1D5DB", borderRadius: 8,
  padding: "7px 14px", cursor: "pointer", fontSize: 13, color: "#374151",
  display: "inline-flex", alignItems: "center", gap: 5,
};
const input = {
  width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #D1D5DB",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
const select = { ...input };
const label  = { fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" };

// ── Componente principal ──────────────────────────────────────────────────────
export default function FinanzasPanel({ sessionUser }) {
  const [tab,       setTab]       = useState("consolidado");
  const [movs,      setMovs]      = useState([]);
  const [cats,      setCats]      = useState([]);
  const [periodos,  setPeriodos]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [lightbox,     setLightbox]     = useState(null); // url imagen preview

  // Filtros
  const [filtroAnio, setFiltroAnio] = useState(anioActual);
  const [filtroMes,  setFiltroMes]  = useState(0); // 0 = todos
  const [filtroNodo, setFiltroNodo] = useState("todos");
  const [nodoVista,  setNodoVista]  = useState("Nod_01");

  // Modal movimiento
  const [modal,   setModal]   = useState(false);
  const [form,    setForm]    = useState(emptyForm);
  const [editId,  setEditId]  = useState(null);

  // Modal rendición
  const [modalRend,  setModalRend]  = useState(false);
  const [formRend,   setFormRend]   = useState({ nodo: "Nod_03", fecha_inicio: "", fecha_fin: "", notas: "" });
  const [periodoVer, setPeriodoVer] = useState(null);

  // Modal categoría
  const [modalCat, setModalCat] = useState(false);
  const [formCat,  setFormCat]  = useState({ nombre: "", tipo: "ingreso" });

  // ── Carga de datos ───────────────────────────────────────────────────────
  const cargarMovimientos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("finanzas_movimientos")
      .select("*")
      .order("fecha", { ascending: false });
    setMovs(data || []);
    setLoading(false);
  }, []);

  const cargarCategorias = useCallback(async () => {
    const { data } = await supabase
      .from("finanzas_categorias")
      .select("*")
      .order("tipo")
      .order("nombre");
    setCats(data || []);
  }, []);

  const cargarPeriodos = useCallback(async () => {
    const { data } = await supabase
      .from("finanzas_periodos_rendicion")
      .select("*")
      .order("created_at", { ascending: false });
    setPeriodos(data || []);
  }, []);

  useEffect(() => {
    cargarMovimientos();
    cargarCategorias();
    cargarPeriodos();
  }, [cargarMovimientos, cargarCategorias, cargarPeriodos]);

  // ── Filtrado ─────────────────────────────────────────────────────────────
  const movsFiltrados = movs.filter((m) => {
    const [y, mo] = (m.fecha || "").split("-").map(Number);
    if (y !== filtroAnio) return false;
    if (filtroMes !== 0 && mo !== filtroMes) return false;
    if (filtroNodo !== "todos" && m.nodo !== filtroNodo) return false;
    return true;
  });

  const movsNodo = movs.filter((m) => {
    const [y, mo] = (m.fecha || "").split("-").map(Number);
    if (y !== filtroAnio) return false;
    if (filtroMes !== 0 && mo !== filtroMes) return false;
    return m.nodo === nodoVista;
  });

  // ── Datos para gráfico mensual ────────────────────────────────────────────
  const chartData = MESES.map((mes, i) => {
    const mm = movs.filter((m) => {
      const [y, mo] = (m.fecha || "").split("-").map(Number);
      return y === filtroAnio && mo === i + 1;
    });
    const ing = mm.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + monto_propio(m), 0);
    const egr = mm.filter((m) => m.tipo === "egreso").reduce((a, m)  => a + monto_propio(m), 0);
    return { mes: mes.slice(0, 3), ingresos: +ing.toFixed(2), egresos: +egr.toFixed(2) };
  });

  // ── Upload archivos ──────────────────────────────────────────────────────
  const subirArchivo = useCallback(async (file) => {
    const esImagen = file.type.startsWith("image/");
    const esPdf    = file.type === "application/pdf";
    if (!esImagen && !esPdf) { alert("Solo se aceptan imágenes o PDFs."); return; }
    setUploading(true);
    try {
      const ext      = file.name.split(".").pop().toLowerCase() || "bin";
      const nombre   = file.name;
      const fileName = `finanzas/${Date.now()}_${nombre.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("fotos").upload(fileName, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("fotos").getPublicUrl(fileName);
      const archivo = { url: urlData.publicUrl, nombre, tipo: esImagen ? "imagen" : "pdf" };
      setForm((f) => ({ ...f, archivos: [...(f.archivos || []), archivo] }));
    } catch (e) { alert("Error al subir: " + (e?.message || "intenta de nuevo")); }
    finally { setUploading(false); }
  }, []);

  const eliminarArchivo = (idx) => {
    setForm((f) => ({ ...f, archivos: f.archivos.filter((_, i) => i !== idx) }));
  };

  // ── CRUD movimientos ─────────────────────────────────────────────────────
  const abrirModal = (mov = null) => {
    if (mov) {
      setForm({ ...mov, archivos: mov.archivos || [] });
      setEditId(mov.id);
    } else {
      const nodo = NODOS[0];
      setForm({ ...emptyForm, porcentaje_propio: nodo.pct ?? 50 });
      setEditId(null);
    }
    setModal(true);
  };

  const onNodoChange = (key) => {
    const n = NODO_MAP[key];
    setForm((f) => ({ ...f, nodo: key, porcentaje_propio: n?.pct ?? 50, categoria: "" }));
  };

  const guardarMov = async () => {
    if (!form.categoria || !form.monto || !form.fecha) return;
    setSaving(true);
    const payload = {
      fecha: form.fecha,
      nodo: form.nodo,
      tipo: form.tipo,
      categoria: form.categoria,
      descripcion: form.descripcion || "",
      monto: parseFloat(form.monto),
      porcentaje_propio: parseInt(form.porcentaje_propio),
      archivos: form.archivos || [],
      creado_por: sessionUser?.nombre || sessionUser?.username || "admin",
    };
    if (editId) {
      await supabase.from("finanzas_movimientos").update(payload).eq("id", editId);
    } else {
      await supabase.from("finanzas_movimientos").insert([payload]);
    }
    setSaving(false);
    setModal(false);
    cargarMovimientos();
  };

  const eliminarMov = async (id) => {
    if (!window.confirm("¿Eliminar este movimiento?")) return;
    await supabase.from("finanzas_movimientos").delete().eq("id", id);
    cargarMovimientos();
  };

  // ── CRUD categorías ──────────────────────────────────────────────────────
  const guardarCat = async () => {
    if (!formCat.nombre.trim()) return;
    const { error } = await supabase
      .from("finanzas_categorias")
      .insert([{ nombre: formCat.nombre.trim(), tipo: formCat.tipo, activa: true }]);
    if (error) { alert("Error al guardar categoría:\n" + error.message); return; }
    setModalCat(false);
    setFormCat({ nombre: "", tipo: "ingreso" });
    cargarCategorias();
  };

  const toggleCat = async (cat) => {
    const { error } = await supabase
      .from("finanzas_categorias")
      .update({ activa: !cat.activa })
      .eq("id", cat.id);
    if (error) { alert("Error: " + error.message); return; }
    cargarCategorias();
  };

  // ── Períodos de rendición ────────────────────────────────────────────────
  const guardarPeriodo = async () => {
    if (!formRend.fecha_inicio || !formRend.fecha_fin) return;
    await supabase.from("finanzas_periodos_rendicion").insert([{ ...formRend, estado: "borrador" }]);
    setModalRend(false);
    setFormRend({ nodo: "Nod_03", fecha_inicio: "", fecha_fin: "", notas: "" });
    cargarPeriodos();
  };

  const cerrarPeriodo = async (id) => {
    if (!window.confirm("¿Marcar este período como cerrado?")) return;
    await supabase.from("finanzas_periodos_rendicion").update({ estado: "cerrado" }).eq("id", id);
    cargarPeriodos();
  };

  const eliminarPeriodo = async (id) => {
    if (!window.confirm("¿Eliminar este período?")) return;
    await supabase.from("finanzas_periodos_rendicion").delete().eq("id", id);
    cargarPeriodos();
  };

  // ── Generación PDF rendición ─────────────────────────────────────────────
  const generarPDF = (periodo) => {
    const nodoInfo = NODO_MAP[periodo.nodo] || {};
    const movsP = movs.filter((m) => {
      return m.nodo === periodo.nodo && m.fecha >= periodo.fecha_inicio && m.fecha <= periodo.fecha_fin;
    });
    const ing = movsP.filter((m) => m.tipo === "ingreso");
    const egr = movsP.filter((m) => m.tipo === "egreso");
    const totIng = ing.reduce((a, m) => a + m.monto, 0);
    const totEgr = egr.reduce((a, m) => a + m.monto, 0);
    const pct    = (nodoInfo.pct || 50) / 100;
    const tuIng  = totIng * pct;
    const tuEgr  = totEgr * pct;
    const saldo  = tuIng - tuEgr;

    const doc = new jsPDF();
    const colores = { azul: [37, 99, 235], gris: [107, 114, 128], verde: [22, 163, 74], rojo: [220, 38, 38] };

    // Encabezado
    doc.setFillColor(...colores.azul);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("RENDICIÓN DE CUENTAS", 14, 12);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`${nodoInfo.label || periodo.nodo}  —  Socio: ${nodoInfo.socio || "-"}`, 14, 20);
    doc.text(`Período: ${fmtFecha(periodo.fecha_inicio)} al ${fmtFecha(periodo.fecha_fin)}`, 14, 26);

    doc.setTextColor(0, 0, 0);
    let y = 38;

    // Resumen
    doc.setFillColor(240, 246, 255);
    doc.roundedRect(12, y, 186, 30, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...colores.azul);
    doc.text("RESUMEN DEL PERÍODO", 18, y + 8);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(`Total ingresos del nodo: S/ ${fmt(totIng)}`, 18, y + 16);
    doc.text(`Total egresos del nodo:  S/ ${fmt(totEgr)}`, 18, y + 22);
    const pctLabel = `${nodoInfo.pct || 50}%`;
    doc.setFont("helvetica", "bold");
    doc.text(`Tu parte (${pctLabel}) — Ingresos: S/ ${fmt(tuIng)}   Egresos: S/ ${fmt(tuEgr)}`, 18, y + 28);
    y += 38;

    // Saldo
    const saldoColor = saldo >= 0 ? colores.verde : colores.rojo;
    doc.setFillColor(...saldoColor);
    doc.roundedRect(12, y, 186, 14, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    const saldoLabel = saldo >= 0 ? `A COBRAR a ${nodoInfo.socio}: S/ ${fmt(saldo)}` : `A PAGAR a ${nodoInfo.socio}: S/ ${fmt(Math.abs(saldo))}`;
    doc.text(saldoLabel, 18, y + 9);
    doc.setTextColor(0, 0, 0);
    y += 22;

    // Tabla ingresos
    if (ing.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...colores.verde);
      doc.text("INGRESOS", 14, y + 6);
      doc.setTextColor(0, 0, 0);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [["Fecha", "Categoría", "Descripción", "Monto", `Tu parte (${pctLabel})`]],
        body: ing.map((m) => [
          fmtFecha(m.fecha), m.categoria, m.descripcion || "-",
          `S/ ${fmt(m.monto)}`, `S/ ${fmt(monto_propio(m))}`,
        ]),
        foot: [["", "", "TOTAL", `S/ ${fmt(totIng)}`, `S/ ${fmt(tuIng)}`]],
        theme: "striped",
        headStyles: { fillColor: colores.verde, fontSize: 8 },
        footStyles: { fillColor: [220, 252, 231], textColor: [0, 0, 0], fontStyle: "bold" },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // Tabla egresos
    if (egr.length > 0) {
      if (y > 220) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...colores.rojo);
      doc.text("EGRESOS", 14, y + 6);
      doc.setTextColor(0, 0, 0);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [["Fecha", "Categoría", "Descripción", "Monto", `Tu parte (${pctLabel})`]],
        body: egr.map((m) => [
          fmtFecha(m.fecha), m.categoria, m.descripcion || "-",
          `S/ ${fmt(m.monto)}`, `S/ ${fmt(monto_propio(m))}`,
        ]),
        foot: [["", "", "TOTAL", `S/ ${fmt(totEgr)}`, `S/ ${fmt(tuEgr)}`]],
        theme: "striped",
        headStyles: { fillColor: colores.rojo, fontSize: 8 },
        footStyles: { fillColor: [254, 226, 226], textColor: [0, 0, 0], fontStyle: "bold" },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    // Notas
    if (periodo.notas) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Notas:", 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(periodo.notas, 180), 14, y + 6);
      y += 16;
    }

    // Pie
    const lastY = Math.max(y + 10, 260);
    doc.setDrawColor(200, 200, 200);
    doc.line(14, lastY, 196, lastY);
    doc.setFontSize(8);
    doc.setTextColor(...colores.gris);
    doc.text(`Generado: ${new Date().toLocaleString("es-PE")}`, 14, lastY + 6);
    doc.text("Firma: ___________________________", 130, lastY + 6);

    doc.save(`rendicion_${periodo.nodo}_${periodo.fecha_inicio}_${periodo.fecha_fin}.pdf`);
  };

  // ── Categorías disponibles por tipo ─────────────────────────────────────
  const catsDisp = (tipo) =>
    cats.filter((c) => c.activa && (c.tipo === tipo || c.tipo === "ambos"));

  // ── Totales ──────────────────────────────────────────────────────────────
  const totConsolidado = calcTotales(movsFiltrados);
  const totNodo        = calcTotales(movsNodo);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>

      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Finanzas</h2>
          <p style={{ margin: "2px 0 0", color: "#6B7280", fontSize: 13 }}>Ingresos y egresos por nodo</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnGhost} onClick={() => { cargarMovimientos(); cargarCategorias(); cargarPeriodos(); }}>
            <RefreshCw size={14} /> Actualizar
          </button>
          <button style={btn()} onClick={() => abrirModal()}>
            <Plus size={15} /> Nuevo movimiento
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #E5E7EB", marginBottom: 24 }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: "none", border: "none", padding: "10px 18px", cursor: "pointer",
            fontWeight: tab === key ? 700 : 500, fontSize: 14,
            color: tab === key ? "#2563EB" : "#6B7280",
            borderBottom: tab === key ? "2px solid #2563EB" : "2px solid transparent",
            marginBottom: -2, display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── TAB CONSOLIDADO ───────────────────────────────────────────────── */}
      {tab === "consolidado" && (
        <div>
          <FiltrosFecha
            filtroAnio={filtroAnio} setFiltroAnio={setFiltroAnio}
            filtroMes={filtroMes}   setFiltroMes={setFiltroMes}
            filtroNodo={filtroNodo} setFiltroNodo={setFiltroNodo}
            mostrarNodo
          />

          {/* Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            <CardStat label="Ingresos (tu parte)" valor={totConsolidado.ing_propio} color="#16A34A" Icon={TrendingUp} />
            <CardStat label="Egresos (tu parte)"  valor={totConsolidado.egr_propio} color="#DC2626" Icon={TrendingDown} />
            <CardStat label="Balance neto"         valor={totConsolidado.balance}    color={totConsolidado.balance >= 0 ? "#2563EB" : "#DC2626"} Icon={Wallet} />
          </div>

          {/* Gráfico */}
          <div style={{ ...card, marginBottom: 24 }}>
            <p style={{ margin: "0 0 14px", fontWeight: 600, color: "#374151" }}>Ingresos vs Egresos — {filtroAnio}</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `S/ ${fmt(v)}`} />
                <Legend />
                <Bar dataKey="ingresos" name="Ingresos" fill="#16A34A" radius={[4,4,0,0]} />
                <Bar dataKey="egresos"  name="Egresos"  fill="#DC2626" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla */}
          <TablaMovimientos movs={movsFiltrados} onEditar={abrirModal} onEliminar={eliminarMov} loading={loading} onLightbox={setLightbox} />
        </div>
      )}

      {/* ── TAB POR NODO ─────────────────────────────────────────────────── */}
      {tab === "por_nodo" && (
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginRight: 8 }}>Nodo:</span>
              <select value={nodoVista} onChange={(e) => setNodoVista(e.target.value)} style={{ ...select, width: "auto", minWidth: 220 }}>
                {NODOS.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
              </select>
            </div>
            <FiltrosFecha
              filtroAnio={filtroAnio} setFiltroAnio={setFiltroAnio}
              filtroMes={filtroMes}   setFiltroMes={setFiltroMes}
            />
          </div>

          {/* Info del nodo */}
          {NODO_MAP[nodoVista] && (
            <div style={{ ...card, marginBottom: 16, background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
              <p style={{ margin: 0, fontSize: 13, color: "#1D4ED8" }}>
                <strong>{NODO_MAP[nodoVista].label}</strong>
                {NODO_MAP[nodoVista].socio && <> — Socio: <strong>{NODO_MAP[nodoVista].socio}</strong></>}
                {NODO_MAP[nodoVista].pct != null && <> — Tu parte: <strong>{NODO_MAP[nodoVista].pct}%</strong></>}
                {NODO_MAP[nodoVista].pct == null && <> — % variable por movimiento</>}
              </p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            <CardStat label="Ingresos totales"   valor={totNodo.ingresos}   color="#16A34A" Icon={TrendingUp} sub={`Tu parte: S/ ${fmt(totNodo.ing_propio)}`} />
            <CardStat label="Egresos totales"     valor={totNodo.egresos}    color="#DC2626" Icon={TrendingDown} sub={`Tu parte: S/ ${fmt(totNodo.egr_propio)}`} />
            <CardStat label="Balance (tu parte)"  valor={totNodo.balance}    color={totNodo.balance >= 0 ? "#2563EB" : "#DC2626"} Icon={Wallet} />
          </div>

          <TablaMovimientos movs={movsNodo} onEditar={abrirModal} onEliminar={eliminarMov} loading={loading} onLightbox={setLightbox} />
        </div>
      )}

      {/* ── TAB RENDICIÓN ────────────────────────────────────────────────── */}
      {tab === "rendicion" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <p style={{ margin: 0, color: "#6B7280", fontSize: 13 }}>
              Períodos de rendición para Nod_03, Nod_04 y Gastos Compartidos
            </p>
            <button style={btn()} onClick={() => setModalRend(true)}>
              <Plus size={15} /> Nuevo período
            </button>
          </div>

          {periodoVer ? (
            <DetallePeriodo
              periodo={periodoVer}
              movs={movs}
              onCerrar={() => setPeriodoVer(null)}
              onPDF={generarPDF}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {periodos.length === 0 && (
                <div style={{ ...card, textAlign: "center", color: "#9CA3AF", padding: 40 }}>
                  No hay períodos creados aún
                </div>
              )}
              {periodos.map((p) => {
                const movsP = movs.filter((m) => m.nodo === p.nodo && m.fecha >= p.fecha_inicio && m.fecha <= p.fecha_fin);
                const t = calcTotales(movsP);
                return (
                  <div key={p.id} style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{NODO_MAP[p.nodo]?.label || p.nodo}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7280" }}>
                        {fmtFecha(p.fecha_inicio)} — {fmtFecha(p.fecha_fin)} · {movsP.length} movimientos
                      </p>
                      {p.notas && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6B7280" }}>{p.notas}</p>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontWeight: 700, color: t.balance >= 0 ? "#16A34A" : "#DC2626", fontSize: 15 }}>
                        S/ {fmt(t.balance)}
                      </p>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 99,
                        background: p.estado === "cerrado" ? "#D1FAE5" : "#FEF9C3",
                        color: p.estado === "cerrado" ? "#065F46" : "#92400E",
                      }}>{p.estado}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={btnGhost} onClick={() => setPeriodoVer(p)}>Ver</button>
                      <button style={btn("#16A34A")} onClick={() => generarPDF(p)}><Download size={13} /> PDF</button>
                      {p.estado === "borrador" && (
                        <button style={btnGhost} onClick={() => cerrarPeriodo(p.id)}>Cerrar</button>
                      )}
                      <button style={{ ...btnGhost, color: "#DC2626" }} onClick={() => eliminarPeriodo(p.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB CATEGORÍAS ───────────────────────────────────────────────── */}
      {tab === "categorias" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button style={btn()} onClick={() => setModalCat(true)}><Plus size={15} /> Nueva categoría</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {["ingreso", "egreso"].map((tipo) => (
              <div key={tipo} style={card}>
                <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 14, color: tipo === "ingreso" ? "#16A34A" : "#DC2626", textTransform: "uppercase", letterSpacing: 1 }}>
                  {tipo === "ingreso" ? "Ingresos" : "Egresos"}
                </p>
                {cats.filter((c) => c.tipo === tipo || c.tipo === "ambos").map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}>
                    <span style={{ fontSize: 14, color: c.activa ? "#111827" : "#9CA3AF", textDecoration: c.activa ? "none" : "line-through" }}>
                      {c.nombre}
                    </span>
                    <button onClick={() => toggleCat(c)} style={{ ...btnGhost, fontSize: 12, padding: "3px 10px", color: c.activa ? "#DC2626" : "#16A34A" }}>
                      {c.activa ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                ))}
                {cats.filter((c) => c.tipo === tipo || c.tipo === "ambos").length === 0 && (
                  <p style={{ color: "#9CA3AF", fontSize: 13 }}>Sin categorías</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL MOVIMIENTO ─────────────────────────────────────────────── */}
      {modal && (
        <Modal titulo={editId ? "Editar movimiento" : "Nuevo movimiento"} onClose={() => setModal(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <span style={label}>Fecha</span>
              <input type="date" style={input} value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div>
              <span style={label}>Tipo</span>
              <select style={select} value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value, categoria: "" }))}>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={label}>Nodo</span>
              <select style={select} value={form.nodo} onChange={(e) => onNodoChange(e.target.value)}>
                {NODOS.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Categoría</span>
              <select style={select} value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {catsDisp(form.tipo).map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Monto (S/)</span>
              <input type="number" min="0" step="0.01" style={input} value={form.monto} placeholder="0.00"
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={label}>Descripción (opcional)</span>
              <input type="text" style={input} value={form.descripcion} placeholder="Detalle del movimiento..."
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div>
              <span style={label}>% Tuyo</span>
              <input type="number" min="0" max="100" style={input} value={form.porcentaje_propio}
                disabled={NODO_MAP[form.nodo]?.pct != null}
                onChange={(e) => setForm((f) => ({ ...f, porcentaje_propio: e.target.value }))} />
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9CA3AF" }}>
                Tu parte: S/ {fmt((parseFloat(form.monto) || 0) * (form.porcentaje_propio / 100))}
              </p>
            </div>

            {/* ── Adjuntos ── */}
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={label}><Paperclip size={13} style={{ marginRight: 4 }} />Adjuntos (fotos / PDF)</span>
              <label style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                border: "2px dashed #D1D5DB", borderRadius: 10, cursor: "pointer",
                background: "#FAFAFA", color: "#6B7280", fontSize: 13,
              }}>
                <input type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }}
                  onChange={(e) => { Array.from(e.target.files || []).forEach(subirArchivo); e.target.value = ""; }} />
                {uploading ? "Subiendo..." : "Haz clic o arrastra fotos / PDFs aquí"}
              </label>
              {(form.archivos || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {(form.archivos || []).map((a, i) => (
                    <div key={i} style={{ position: "relative", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                      {a.tipo === "imagen" ? (
                        <img src={a.url} alt={a.nombre} style={{ width: 80, height: 80, objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ width: 80, height: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, background: "#FEF2F2" }}>
                          <FileText size={28} color="#DC2626" />
                          <span style={{ fontSize: 9, color: "#DC2626", textAlign: "center", padding: "0 4px", wordBreak: "break-all" }}>
                            {a.nombre.slice(0, 15)}
                          </span>
                        </div>
                      )}
                      <button onClick={() => eliminarArchivo(i)} style={{
                        position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,.55)",
                        border: "none", borderRadius: "50%", width: 18, height: 18, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                      }}>
                        <X size={11} color="#fff" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button style={btnGhost} onClick={() => setModal(false)}>Cancelar</button>
            <button style={btn()} onClick={guardarMov} disabled={saving || uploading}>
              {saving ? "Guardando..." : editId ? "Guardar cambios" : "Agregar"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── MODAL PERÍODO RENDICIÓN ──────────────────────────────────────── */}
      {modalRend && (
        <Modal titulo="Nuevo período de rendición" onClose={() => setModalRend(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <span style={label}>Nodo</span>
              <select style={select} value={formRend.nodo}
                onChange={(e) => setFormRend((f) => ({ ...f, nodo: e.target.value }))}>
                {NODOS.filter((n) => n.tipo === "sociedad" || n.tipo === "compartido").map((n) => (
                  <option key={n.key} value={n.key}>{n.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <span style={label}>Fecha inicio</span>
                <input type="date" style={input} value={formRend.fecha_inicio}
                  onChange={(e) => setFormRend((f) => ({ ...f, fecha_inicio: e.target.value }))} />
              </div>
              <div>
                <span style={label}>Fecha fin</span>
                <input type="date" style={input} value={formRend.fecha_fin}
                  onChange={(e) => setFormRend((f) => ({ ...f, fecha_fin: e.target.value }))} />
              </div>
            </div>
            <div>
              <span style={label}>Notas (opcional)</span>
              <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={formRend.notas}
                onChange={(e) => setFormRend((f) => ({ ...f, notas: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button style={btnGhost} onClick={() => setModalRend(false)}>Cancelar</button>
            <button style={btn()} onClick={guardarPeriodo}>Crear período</button>
          </div>
        </Modal>
      )}

      {/* ── MODAL CATEGORÍA ──────────────────────────────────────────────── */}
      {modalCat && (
        <Modal titulo="Nueva categoría" onClose={() => setModalCat(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <span style={label}>Nombre</span>
              <input type="text" style={input} value={formCat.nombre} placeholder="Ej: Combustible"
                onChange={(e) => setFormCat((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <span style={label}>Tipo</span>
              <select style={select} value={formCat.tipo}
                onChange={(e) => setFormCat((f) => ({ ...f, tipo: e.target.value }))}>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button style={btnGhost} onClick={() => setModalCat(false)}>Cancelar</button>
            <button style={btn()} onClick={guardarCat}>Guardar</button>
          </div>
        </Modal>
      )}

      {/* ── LIGHTBOX ─────────────────────────────────────────────────────── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 28, lineHeight: 1 }}>×</button>
          <img src={lightbox} alt="preview" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "95vw", maxHeight: "90vh", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,.6)" }} />
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function CardStat({ label, valor, color, Icon, sub }) {
  const card = { background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.08)" };
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: .5 }}>{label}</span>
        <div style={{ background: color + "18", borderRadius: 8, padding: 6 }}>
          <Icon size={16} color={color} />
        </div>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 800, color }}>S/ {fmt(valor)}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9CA3AF" }}>{sub}</p>}
    </div>
  );
}

function FiltrosFecha({ filtroAnio, setFiltroAnio, filtroMes, setFiltroMes, filtroNodo, setFiltroNodo, mostrarNodo }) {
  const select = {
    padding: "7px 12px", borderRadius: 8, border: "1px solid #D1D5DB",
    fontSize: 13, outline: "none", background: "#fff", cursor: "pointer",
  };
  const anios = Array.from({ length: 5 }, (_, i) => anioActual - i);
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
      <select value={filtroAnio} onChange={(e) => setFiltroAnio(Number(e.target.value))} style={select}>
        {anios.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <select value={filtroMes} onChange={(e) => setFiltroMes(Number(e.target.value))} style={select}>
        <option value={0}>Todos los meses</option>
        {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      {mostrarNodo && (
        <select value={filtroNodo} onChange={(e) => setFiltroNodo(e.target.value)} style={select}>
          <option value="todos">Todos los nodos</option>
          {NODOS.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
        </select>
      )}
    </div>
  );
}

function TablaMovimientos({ movs, onEditar, onEliminar, loading, onLightbox }) {
  const card = { background: "#fff", borderRadius: 12, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,.08)" };
  if (loading) return <div style={{ ...card, textAlign: "center", color: "#9CA3AF", padding: 40 }}>Cargando...</div>;
  if (!movs.length) return <div style={{ ...card, textAlign: "center", color: "#9CA3AF", padding: 40 }}>Sin movimientos para este filtro</div>;
  return (
    <div style={card}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #F3F4F6" }}>
              {["Fecha","Nodo","Tipo","Categoría","Descripción","Monto","% Tuyo","Tu parte","Adj.",""].map((h) => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#6B7280", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => {
              const archivos = m.archivos || [];
              const imagenes = archivos.filter((a) => a.tipo === "imagen");
              const pdfs     = archivos.filter((a) => a.tipo === "pdf");
              return (
                <tr key={m.id} style={{ borderBottom: "1px solid #F9FAFB" }}>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{fmtFecha(m.fecha)}</td>
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{ fontSize: 12, background: "#EFF6FF", color: "#1D4ED8", borderRadius: 6, padding: "2px 8px" }}>
                      {m.nodo}
                    </span>
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{
                      fontSize: 12, borderRadius: 6, padding: "2px 8px",
                      background: m.tipo === "ingreso" ? "#DCFCE7" : "#FEE2E2",
                      color: m.tipo === "ingreso" ? "#15803D" : "#B91C1C",
                    }}>{m.tipo}</span>
                  </td>
                  <td style={{ padding: "9px 10px" }}>{m.categoria}</td>
                  <td style={{ padding: "9px 10px", color: "#6B7280" }}>{m.descripcion || "-"}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 600 }}>S/ {fmt(m.monto)}</td>
                  <td style={{ padding: "9px 10px", color: "#6B7280" }}>{m.porcentaje_propio}%</td>
                  <td style={{ padding: "9px 10px", fontWeight: 700, color: m.tipo === "ingreso" ? "#16A34A" : "#DC2626" }}>
                    S/ {fmt(monto_propio(m))}
                  </td>
                  {/* Adjuntos */}
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                    {archivos.length === 0 ? (
                      <span style={{ color: "#D1D5DB" }}>—</span>
                    ) : (
                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        {imagenes.map((a, i) => (
                          <img
                            key={i}
                            src={a.url}
                            alt={a.nombre}
                            title={a.nombre}
                            onClick={() => onLightbox(a.url)}
                            style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4, cursor: "pointer", border: "1px solid #E5E7EB" }}
                          />
                        ))}
                        {pdfs.map((a, i) => (
                          <a key={i} href={a.url} target="_blank" rel="noreferrer" title={a.nombre}
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, background: "#FEF2F2", borderRadius: 4, border: "1px solid #FECACA" }}>
                            <FileText size={14} color="#DC2626" />
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                    <button onClick={() => onEditar(m)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", marginRight: 4 }}>
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => onEliminar(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626" }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetallePeriodo({ periodo, movs, onCerrar, onPDF }) {
  const card = { background: "#fff", borderRadius: 12, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,.08)" };
  const movsP = movs.filter((m) => m.nodo === periodo.nodo && m.fecha >= periodo.fecha_inicio && m.fecha <= periodo.fecha_fin);
  const nodoInfo = NODO_MAP[periodo.nodo] || {};
  const t = calcTotales(movsP);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onCerrar} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#6B7280" }}>←</button>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{nodoInfo.label || periodo.nodo}</p>
          <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>{fmtFecha(periodo.fecha_inicio)} — {fmtFecha(periodo.fecha_fin)}</p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => onPDF(periodo)} style={{ background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> Descargar PDF
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ ...card, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>Ingresos del nodo</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: 18, color: "#16A34A" }}>S/ {fmt(t.ingresos)}</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9CA3AF" }}>Tu parte ({nodoInfo.pct || 50}%): S/ {fmt(t.ing_propio)}</p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>Egresos del nodo</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: 18, color: "#DC2626" }}>S/ {fmt(t.egresos)}</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9CA3AF" }}>Tu parte ({nodoInfo.pct || 50}%): S/ {fmt(t.egr_propio)}</p>
        </div>
        <div style={{ background: t.balance >= 0 ? "#F0FDF4" : "#FEF2F2", borderRadius: 10, padding: "12px 16px" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>
            {t.balance >= 0 ? `A cobrar a ${nodoInfo.socio}` : `A pagar a ${nodoInfo.socio}`}
          </p>
          <p style={{ margin: "4px 0 0", fontWeight: 800, fontSize: 20, color: t.balance >= 0 ? "#16A34A" : "#DC2626" }}>
            S/ {fmt(Math.abs(t.balance))}
          </p>
        </div>
      </div>

      <TablaMovimientos movs={movsP} onEditar={() => {}} onEliminar={() => {}} loading={false} onLightbox={() => {}} />
    </div>
  );
}

function Modal({ titulo, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{titulo}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
