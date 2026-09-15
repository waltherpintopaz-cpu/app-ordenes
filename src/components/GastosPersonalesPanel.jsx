import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Wallet, Plus, Edit2, Trash2, X, Download, FileText, Camera, RefreshCw } from "lucide-react";

const CATEGORIAS = ["Compras", "Alimentación", "Transporte", "Publicidad", "Actuaciones", "Materiales", "Otros"];
const ENTIDADES = ["DIM", "Americanet", "Personal"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const NODOS_SUGERIDOS = ["Nodo_01", "Nodo_02", "Nodo_03", "Nodo_04"];

const emptyForm = { fecha: new Date().toISOString().slice(0, 10), descripcion: "", monto: "", categoria: CATEGORIAS[0], entidad: ENTIDADES[0], nodo: "", fotos: [] };

export default function GastosPersonalesPanel({ theme, sessionUser }) {
  const isDark = theme === "dark";
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const hoy = new Date();
  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear());
  const [filtroMes, setFiltroMes] = useState(hoy.getMonth() + 1); // 1-12, 0 = todos
  const [filtroEntidad, setFiltroEntidad] = useState("Todas");
  const [filtroCategorias, setFiltroCategorias] = useState([]); // [] = todas
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroNodo, setFiltroNodo] = useState("Todos");

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fileInputRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("gastos_personales")
        .select("*")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });
      if (err) throw err;
      setGastos(data || []);
    } catch (e) {
      setError("Error cargando gastos: " + (e?.message || String(e)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    return gastos.filter((g) => {
      const [y, m] = String(g.fecha || "").split("-").map(Number);
      if (filtroAnio && y !== filtroAnio) return false;
      if (filtroMes && m !== filtroMes) return false;
      if (filtroEntidad !== "Todas" && (g.entidad || "Personal") !== filtroEntidad) return false;
      if (filtroCategorias.length > 0 && !filtroCategorias.includes(g.categoria || "Otros")) return false;
      if (filtroNodo !== "Todos" && (g.nodo || "") !== filtroNodo) return false;
      const q = filtroTexto.trim().toLowerCase();
      if (q && !String(g.descripcion || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gastos, filtroAnio, filtroMes, filtroEntidad, filtroCategorias, filtroNodo, filtroTexto]);

  const total = useMemo(() => filtrados.reduce((s, g) => s + (Number(g.monto) || 0), 0), [filtrados]);
  const totalPagado = useMemo(() => filtrados.reduce((s, g) => s + (g.pagado ? (Number(g.monto) || 0) : 0), 0), [filtrados]);

  const aniosDisponibles = useMemo(() => {
    const set = new Set(gastos.map((g) => Number(String(g.fecha || "").slice(0, 4))).filter(Boolean));
    set.add(hoy.getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [gastos]);

  // Se arma solo con lo que ya se uso (mas los sugeridos) -- asi crece con
  // los nodos nuevos sin tener que tocar codigo cada vez.
  const nodosDisponibles = useMemo(() => {
    const set = new Set(NODOS_SUGERIDOS);
    gastos.forEach((g) => { if (g.nodo) set.add(g.nodo); });
    return Array.from(set).sort();
  }, [gastos]);

  // Igual que nodos: la lista base mas cualquier categoria nueva que ya se
  // haya escrito, para que crezca sin tener que tocar codigo cada vez.
  const categoriasDisponibles = useMemo(() => {
    const set = new Set(CATEGORIAS);
    gastos.forEach((g) => { if (g.categoria) set.add(g.categoria); });
    return Array.from(set).sort();
  }, [gastos]);

  const abrirModal = (g = null) => {
    if (g) {
      const fotos = Array.isArray(g.fotos) && g.fotos.length ? g.fotos : (g.foto_url ? [g.foto_url] : []);
      setForm({ fecha: g.fecha, descripcion: g.descripcion || "", monto: String(g.monto ?? ""), categoria: g.categoria || CATEGORIAS[0], entidad: g.entidad || ENTIDADES[0], nodo: g.nodo || "", fotos });
      setEditId(g.id);
    } else {
      setForm(emptyForm);
      setEditId(null);
    }
    setModal(true);
  };

  const subirFotos = async (files) => {
    const imagenes = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!imagenes.length) return showToast("❌ Solo se aceptan imágenes.");
    setSubiendoFoto(true);
    try {
      const urls = [];
      for (const file of imagenes) {
        const fileName = `gastos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${file.name.replace(/\s+/g, "_")}`;
        const { error: err } = await supabase.storage.from("fotos").upload(fileName, file, { contentType: file.type, upsert: true });
        if (err) throw err;
        const { data } = supabase.storage.from("fotos").getPublicUrl(fileName);
        urls.push(data.publicUrl);
      }
      setForm((p) => ({ ...p, fotos: [...p.fotos, ...urls] }));
    } catch (e) {
      showToast("❌ Error al subir foto: " + (e?.message || String(e)));
    }
    setSubiendoFoto(false);
  };

  const quitarFoto = (url) => setForm((p) => ({ ...p, fotos: p.fotos.filter((f) => f !== url) }));

  const guardar = async () => {
    if (!form.descripcion.trim()) return showToast("❌ Ingresa una descripción.");
    const monto = Number(form.monto);
    if (!Number.isFinite(monto) || monto <= 0) return showToast("❌ Ingresa un monto válido.");
    setGuardando(true);
    try {
      const payload = {
        fecha: form.fecha,
        descripcion: form.descripcion.trim(),
        monto,
        categoria: form.categoria.trim() || "Otros",
        entidad: form.entidad,
        nodo: form.nodo.trim() || null,
        fotos: form.fotos,
        foto_url: form.fotos[0] || null,
        creado_por: sessionUser?.nombre || sessionUser?.email || null,
        updated_at: new Date().toISOString(),
      };
      if (editId) {
        const { error: err } = await supabase.from("gastos_personales").update(payload).eq("id", editId);
        if (err) throw err;
        showToast("✅ Gasto actualizado");
      } else {
        const { error: err } = await supabase.from("gastos_personales").insert(payload);
        if (err) throw err;
        showToast("✅ Gasto registrado");
      }
      setModal(false);
      await cargar();
    } catch (e) {
      showToast("❌ " + (e?.message || String(e)));
    }
    setGuardando(false);
  };

  const togglePagado = async (g) => {
    const nuevo = !g.pagado;
    setGastos((prev) => prev.map((x) => (x.id === g.id ? { ...x, pagado: nuevo } : x)));
    try {
      const { error: err } = await supabase.from("gastos_personales").update({ pagado: nuevo }).eq("id", g.id);
      if (err) throw err;
    } catch (e) {
      setGastos((prev) => prev.map((x) => (x.id === g.id ? { ...x, pagado: !nuevo } : x)));
      showToast("❌ No se pudo actualizar: " + (e?.message || String(e)));
    }
  };

  const eliminar = async (g) => {
    if (!window.confirm(`¿Eliminar el gasto "${g.descripcion}" (S/ ${Number(g.monto).toFixed(2)})?`)) return;
    try {
      const { error: err } = await supabase.from("gastos_personales").delete().eq("id", g.id);
      if (err) throw err;
      setGastos((prev) => prev.filter((x) => x.id !== g.id));
      showToast("✅ Gasto eliminado");
    } catch (e) {
      showToast("❌ " + (e?.message || String(e)));
    }
  };

  const exportarCsv = () => {
    if (filtrados.length === 0) return showToast("❌ No hay gastos para exportar.");
    const filas = [["Fecha", "Descripción", "Categoría", "Nodo", "Entidad", "Monto"]];
    filtrados.forEach((g) => filas.push([g.fecha, g.descripcion, g.categoria || "", g.nodo || "", g.entidad || "Personal", Number(g.monto).toFixed(2)]));
    filas.push(["", "", "", "", "TOTAL", total.toFixed(2)]);
    const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gastos_${filtroAnio}${filtroMes ? "-" + String(filtroMes).padStart(2, "0") : ""}${filtroCategorias.length ? "-" + filtroCategorias.join("_") : ""}${filtroNodo !== "Todos" ? "-" + filtroNodo : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPdf = () => {
    if (filtrados.length === 0) return showToast("❌ No hay gastos para exportar.");
    const doc = new jsPDF();
    const periodoTxt = filtroMes ? `${MESES[filtroMes - 1]} ${filtroAnio}` : `Año ${filtroAnio}`;
    doc.setFontSize(16); doc.text("Mis Gastos", 14, 18);
    doc.setFontSize(10); doc.text(`Período: ${periodoTxt}${filtroCategorias.length ? ` · Categorías: ${filtroCategorias.join(", ")}` : ""}${filtroNodo !== "Todos" ? ` · Nodo: ${filtroNodo}` : ""}${filtroTexto.trim() ? ` · Búsqueda: "${filtroTexto.trim()}"` : ""}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [["Fecha", "Descripción", "Categoría", "Nodo", "Entidad", "Monto (S/)"]],
      body: filtrados.map((g) => [g.fecha, g.descripcion, g.categoria || "-", g.nodo || "-", g.entidad || "Personal", Number(g.monto).toFixed(2)]),
      foot: [["", "", "", "", "TOTAL", total.toFixed(2)]],
      styles: { fontSize: 9 },
      footStyles: { fontStyle: "bold" },
    });
    doc.save(`gastos_${filtroAnio}${filtroMes ? "-" + String(filtroMes).padStart(2, "0") : ""}${filtroCategorias.length ? "-" + filtroCategorias.join("_") : ""}${filtroNodo !== "Todos" ? "-" + filtroNodo : ""}.pdf`);
  };

  const inputSt = { padding: "8px 12px", borderRadius: 8, border: isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb", fontSize: 13, background: isDark ? "#1a2740" : "#fff", color: isDark ? "#e6ecf7" : "#111827" };
  const thSt = { padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: isDark ? "#93a2bd" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" };
  const tdSt = { padding: "10px 14px", verticalAlign: "middle", fontSize: 13 };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1000, margin: "0 auto" }}>
      {toast && (
        <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", borderRadius: 30, padding: "10px 24px", fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#16a34a", borderRadius: 10, padding: 8 }}><Wallet size={22} color="#fff" /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: isDark ? "#e6ecf7" : undefined }}>Mis Gastos</h2>
            <p style={{ margin: 0, fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>Registro personal de gastos con evidencia</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => abrirModal()} style={{ display: "flex", alignItems: "center", gap: 6, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            <Plus size={14} /> Nuevo gasto
          </button>
          <button onClick={cargar} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filtroMes} onChange={(e) => setFiltroMes(Number(e.target.value))} style={inputSt}>
          <option value={0}>Todo el año</option>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={filtroAnio} onChange={(e) => setFiltroAnio(Number(e.target.value))} style={inputSt}>
          {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtroEntidad} onChange={(e) => setFiltroEntidad(e.target.value)} style={inputSt}>
          <option value="Todas">Todas las entidades</option>
          {ENTIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setCatDropdownOpen((v) => !v)}
            style={{ ...inputSt, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
          >
            {filtroCategorias.length === 0
              ? "Todas las categorías"
              : `${filtroCategorias.length} categoría${filtroCategorias.length > 1 ? "s" : ""}`}
            <span style={{ fontSize: 9 }}>▼</span>
          </button>
          {catDropdownOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setCatDropdownOpen(false)} />
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 999, minWidth: 210, maxHeight: 280, overflowY: "auto",
                background: isDark ? "#1a2740" : "#fff", border: isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb",
                borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: 6,
              }}>
                <label style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  borderBottom: isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6", marginBottom: 4, color: isDark ? "#e6ecf7" : "#111827",
                }}>
                  <input type="checkbox" checked={filtroCategorias.length === 0} onChange={() => setFiltroCategorias([])} />
                  Todas
                </label>
                {categoriasDisponibles.map((c) => (
                  <label key={c} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer", color: isDark ? "#c3d3ee" : "#374151" }}>
                    <input
                      type="checkbox"
                      checked={filtroCategorias.includes(c)}
                      onChange={() => setFiltroCategorias((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <select value={filtroNodo} onChange={(e) => setFiltroNodo(e.target.value)} style={inputSt}>
          <option value="Todos">Todos los nodos</option>
          {nodosDisponibles.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <input
          type="text"
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          placeholder="Buscar por descripción..."
          style={{ ...inputSt, minWidth: 180 }}
        />
        <button onClick={exportarCsv} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
          <Download size={13} /> CSV / Sheets
        </button>
        <button onClick={exportarPdf} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
          <FileText size={13} /> PDF
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 13, fontWeight: 700, color: isDark ? "#e6ecf7" : "#111827" }}>
          <span>Total: <span style={{ color: "#16a34a" }}>S/ {total.toFixed(2)}</span> ({filtrados.length})</span>
          <span>Pagado: <span style={{ color: "#2563eb" }}>S/ {totalPagado.toFixed(2)}</span></span>
          <span>Pendiente: <span style={{ color: "#dc2626" }}>S/ {(total - totalPagado).toFixed(2)}</span></span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: isDark ? "#93a2bd" : "#6b7280" }}>Cargando...</div>
      ) : (
        <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflowX: "auto", overflowY: "hidden" }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: isDark ? "#16213a" : "#f8fafc" }}>
                <th style={thSt}>Fecha</th>
                <th style={thSt}>Descripción</th>
                <th style={thSt}>Categoría</th>
                <th style={thSt}>Nodo</th>
                <th style={thSt}>Entidad</th>
                <th style={thSt}>Monto</th>
                <th style={{ ...thSt, textAlign: "center" }}>Pagado</th>
                <th style={thSt}>Foto</th>
                <th style={{ ...thSt, textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: isDark ? "#93a2bd" : "#9ca3af" }}>Sin gastos en este período.</td></tr>
              )}
              {filtrados.map((g) => (
                <tr key={g.id} style={{ borderTop: isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6" }}>
                  <td style={{ ...tdSt, whiteSpace: "nowrap" }}>{g.fecha}</td>
                  <td style={{ ...tdSt, color: isDark ? "#c3d3ee" : "#374151" }}>{g.descripcion}</td>
                  <td style={tdSt}>{g.categoria || "—"}</td>
                  <td style={tdSt}>{g.nodo || "—"}</td>
                  <td style={tdSt}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
                      background: g.entidad === "DIM" ? "#eef2ff" : g.entidad === "Americanet" ? "#ecfdf5" : "#fef3c7",
                      color: g.entidad === "DIM" ? "#4338ca" : g.entidad === "Americanet" ? "#047857" : "#92400e",
                    }}>
                      {g.entidad || "Personal"}
                    </span>
                  </td>
                  <td style={{ ...tdSt, fontWeight: 700, color: "#16a34a" }}>S/ {Number(g.monto).toFixed(2)}</td>
                  <td style={{ ...tdSt, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!g.pagado}
                      onChange={() => togglePagado(g)}
                      style={{ width: 17, height: 17, cursor: "pointer", accentColor: "#16a34a" }}
                    />
                  </td>
                  <td style={tdSt}>
                    {(() => {
                      const fotos = Array.isArray(g.fotos) && g.fotos.length ? g.fotos : (g.foto_url ? [g.foto_url] : []);
                      if (!fotos.length) return <span style={{ color: isDark ? "#93a2bd" : "#9ca3af", fontSize: 12 }}>—</span>;
                      return (
                        <a href={fotos[0]} target="_blank" rel="noopener noreferrer" style={{ position: "relative", display: "inline-block" }}>
                          <img src={fotos[0]} alt="evidencia" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6 }} />
                          {fotos.length > 1 && (
                            <span style={{ position: "absolute", bottom: -4, right: -4, background: "#16a34a", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, padding: "1px 4px", lineHeight: 1.2 }}>
                              +{fotos.length - 1}
                            </span>
                          )}
                        </a>
                      );
                    })()}
                  </td>
                  <td style={{ ...tdSt, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => abrirModal(g)} style={{ background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 8, padding: "7px 10px", fontWeight: 600, cursor: "pointer", fontSize: 12, marginRight: 6 }}>
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => eliminar(g)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "7px 10px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}
          onClick={() => !guardando && setModal(false)}>
          <div style={{ background: isDark ? "#1a2740" : "#fff", borderRadius: 14, padding: 22, width: 380, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isDark ? "#e6ecf7" : "#111827" }}>{editId ? "Editar gasto" : "Nuevo gasto"}</h3>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#93a2bd" : "#6b7280" }}><X size={18} /></button>
            </div>

            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Fecha</label>
            <input type="date" style={{ ...inputSt, width: "100%", boxSizing: "border-box", marginBottom: 10 }} value={form.fecha}
              onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))} />

            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Descripción</label>
            <input style={{ ...inputSt, width: "100%", boxSizing: "border-box", marginBottom: 10 }} value={form.descripcion}
              onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Ej. Compra de cable, almuerzo reunión..." />

            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Monto (S/)</label>
                <input type="number" step="0.01" style={{ ...inputSt, width: "100%", boxSizing: "border-box" }} value={form.monto}
                  onChange={(e) => setForm((p) => ({ ...p, monto: e.target.value }))} placeholder="0.00" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Categoría</label>
                <input
                  list="categorias-sugeridas"
                  style={{ ...inputSt, width: "100%", boxSizing: "border-box" }}
                  value={form.categoria}
                  onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}
                  onFocus={(e) => { e.target.dataset.prev = form.categoria; setForm((p) => ({ ...p, categoria: "" })); }}
                  onBlur={(e) => {
                    const prev = e.target.dataset.prev || "Otros";
                    setForm((p) => (p.categoria.trim() ? p : { ...p, categoria: prev }));
                  }}
                  placeholder="Elige o escribe una nueva"
                />
                <datalist id="categorias-sugeridas">
                  {categoriasDisponibles.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>

            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Nodo (opcional)</label>
            <input
              list="nodos-sugeridos"
              style={{ ...inputSt, width: "100%", boxSizing: "border-box", marginBottom: 10 }}
              value={form.nodo}
              onChange={(e) => setForm((p) => ({ ...p, nodo: e.target.value }))}
              placeholder="Ej. Nodo_04"
            />
            <datalist id="nodos-sugeridos">
              {nodosDisponibles.map((n) => <option key={n} value={n} />)}
            </datalist>

            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Entidad</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {ENTIDADES.map((e) => (
                <button key={e} type="button" onClick={() => setForm((p) => ({ ...p, entidad: e }))}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: form.entidad === e ? "none" : (isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb"),
                    background: form.entidad === e ? "#16a34a" : (isDark ? "#1a2740" : "#fff"),
                    color: form.entidad === e ? "#fff" : (isDark ? "#c3d3ee" : "#374151"),
                  }}>
                  {e}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#93a2bd" : "#6b7280", display: "block", marginBottom: 4 }}>Evidencia (fotos)</label>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }}
              onChange={(e) => { const files = e.target.files; if (files?.length) subirFotos(files); e.target.value = ""; }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={subiendoFoto}
                style={{ display: "flex", alignItems: "center", gap: 6, ...inputSt, cursor: "pointer", opacity: subiendoFoto ? 0.6 : 1 }}>
                <Camera size={14} /> {subiendoFoto ? "Subiendo..." : "Tomar / subir foto(s)"}
              </button>
              {form.fotos.length > 0 && (
                <span style={{ fontSize: 12, color: isDark ? "#93a2bd" : "#6b7280" }}>{form.fotos.length} foto{form.fotos.length !== 1 ? "s" : ""}</span>
              )}
            </div>
            {form.fotos.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {form.fotos.map((url) => (
                  <div key={url} style={{ position: "relative" }}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="evidencia" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: isDark ? "1px solid #2c3c58" : "1px solid #e5e7eb" }} />
                    </a>
                    <button type="button" onClick={() => quitarFoto(url)}
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#dc2626", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={guardar} disabled={guardando}
              style={{ width: "100%", background: guardando ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: guardando ? "default" : "pointer", fontSize: 13 }}>
              {guardando ? "Guardando..." : editId ? "Guardar cambios" : "Registrar gasto"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
