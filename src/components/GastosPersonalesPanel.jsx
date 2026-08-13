import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Wallet, Plus, Edit2, Trash2, X, Download, FileText, Camera, RefreshCw } from "lucide-react";

const CATEGORIAS = ["Compras", "Alimentación", "Transporte", "Otros"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const emptyForm = { fecha: new Date().toISOString().slice(0, 10), descripcion: "", monto: "", categoria: CATEGORIAS[0], fotos: [] };

export default function GastosPersonalesPanel({ theme, sessionUser }) {
  const isDark = theme === "dark";
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const hoy = new Date();
  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear());
  const [filtroMes, setFiltroMes] = useState(hoy.getMonth() + 1); // 1-12, 0 = todos

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
      return true;
    });
  }, [gastos, filtroAnio, filtroMes]);

  const total = useMemo(() => filtrados.reduce((s, g) => s + (Number(g.monto) || 0), 0), [filtrados]);

  const aniosDisponibles = useMemo(() => {
    const set = new Set(gastos.map((g) => Number(String(g.fecha || "").slice(0, 4))).filter(Boolean));
    set.add(hoy.getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [gastos]);

  const abrirModal = (g = null) => {
    if (g) {
      const fotos = Array.isArray(g.fotos) && g.fotos.length ? g.fotos : (g.foto_url ? [g.foto_url] : []);
      setForm({ fecha: g.fecha, descripcion: g.descripcion || "", monto: String(g.monto ?? ""), categoria: g.categoria || CATEGORIAS[0], fotos });
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
        categoria: form.categoria,
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
    const filas = [["Fecha", "Descripción", "Categoría", "Monto"]];
    filtrados.forEach((g) => filas.push([g.fecha, g.descripcion, g.categoria || "", Number(g.monto).toFixed(2)]));
    filas.push(["", "", "TOTAL", total.toFixed(2)]);
    const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gastos_${filtroAnio}${filtroMes ? "-" + String(filtroMes).padStart(2, "0") : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPdf = () => {
    if (filtrados.length === 0) return showToast("❌ No hay gastos para exportar.");
    const doc = new jsPDF();
    const periodoTxt = filtroMes ? `${MESES[filtroMes - 1]} ${filtroAnio}` : `Año ${filtroAnio}`;
    doc.setFontSize(16); doc.text("Mis Gastos", 14, 18);
    doc.setFontSize(10); doc.text(`Período: ${periodoTxt}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [["Fecha", "Descripción", "Categoría", "Monto (S/)"]],
      body: filtrados.map((g) => [g.fecha, g.descripcion, g.categoria || "-", Number(g.monto).toFixed(2)]),
      foot: [["", "", "TOTAL", total.toFixed(2)]],
      styles: { fontSize: 9 },
      footStyles: { fontStyle: "bold" },
    });
    doc.save(`gastos_${filtroAnio}${filtroMes ? "-" + String(filtroMes).padStart(2, "0") : ""}.pdf`);
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
        <button onClick={exportarCsv} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
          <Download size={13} /> CSV / Sheets
        </button>
        <button onClick={exportarPdf} style={{ display: "flex", alignItems: "center", gap: 6, background: isDark ? "#16213a" : "#f3f4f6", color: isDark ? "#c3d3ee" : "#374151", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
          <FileText size={13} /> PDF
        </button>
        <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: isDark ? "#e6ecf7" : "#111827" }}>
          Total: <span style={{ color: "#16a34a" }}>S/ {total.toFixed(2)}</span> ({filtrados.length})
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
                <th style={thSt}>Monto</th>
                <th style={thSt}>Foto</th>
                <th style={{ ...thSt, textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: isDark ? "#93a2bd" : "#9ca3af" }}>Sin gastos en este período.</td></tr>
              )}
              {filtrados.map((g) => (
                <tr key={g.id} style={{ borderTop: isDark ? "1px solid #2c3c58" : "1px solid #f3f4f6" }}>
                  <td style={{ ...tdSt, whiteSpace: "nowrap" }}>{g.fecha}</td>
                  <td style={{ ...tdSt, color: isDark ? "#c3d3ee" : "#374151" }}>{g.descripcion}</td>
                  <td style={tdSt}>{g.categoria || "—"}</td>
                  <td style={{ ...tdSt, fontWeight: 700, color: "#16a34a" }}>S/ {Number(g.monto).toFixed(2)}</td>
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
                <select style={{ ...inputSt, width: "100%", boxSizing: "border-box" }} value={form.categoria}
                  onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
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
