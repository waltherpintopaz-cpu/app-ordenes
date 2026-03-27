import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import NapVincularModal from "./NapVincularModal";

// Recopila fotos subidas al panel (Supabase Storage)
function collectFotos(caja) {
  const fotos = [];
  if (Array.isArray(caja.fotos)) {
    caja.fotos.forEach((f, i) => {
      const url = f?.url || (typeof f === "string" ? f : null);
      if (url) fotos.push({ url, label: f?.label || `Foto ${i + 1}` });
    });
  }
  return fotos;
}

const NODOS = ["Todos", "Nod_01", "Nod_02", "Nod_03", "Nod_04", "Nod_05", "Nod_06"];
const ESTADOS = ["Activa", "Dañada", "Mantenimiento", "Retirada"];
const CAPACIDADES = [8, 16, 32];
const EMPRESAS = ["Americanet", "DIM"];

const ESTADO_COLORS = {
  Activa:        { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  Dañada:        { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
  Mantenimiento: { bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  Retirada:      { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" },
};

function pct(ocupados, cap) {
  if (!cap) return 0;
  return Math.round((ocupados / cap) * 100);
}
function pctColor(p) {
  if (p >= 90) return "#dc2626";
  if (p >= 70) return "#ea580c";
  return "#0284c7";
}

function FotoThumb({ url, label }) {
  const [broken, setBroken] = useState(false);
  return (
    <div style={{ textAlign: "center" }}>
      {broken ? (
        <div
          onClick={() => window.open(url, "_blank")}
          style={{ width: "100%", aspectRatio: "1", borderRadius: 8, border: "1.5px dashed #cbd5e1", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}
        >
          <span style={{ fontSize: 22 }}>🖼</span>
          <span style={{ fontSize: 10, color: "#6b7280" }}>Abrir foto</span>
        </div>
      ) : (
        <img
          src={url}
          alt={label || "foto"}
          style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, border: "1px solid #e4eaf4", cursor: "pointer", display: "block" }}
          onClick={() => window.open(url, "_blank")}
          onError={() => setBroken(true)}
        />
      )}
      {label && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>{label}</div>}
    </div>
  );
}

function OcupacionBar({ ocupados, capacidad }) {
  const p = pct(ocupados, capacidad);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: p + "%", height: "100%", background: pctColor(p), borderRadius: 4, transition: "width .3s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(p), minWidth: 36, textAlign: "right" }}>
        {ocupados}/{capacidad}
      </span>
    </div>
  );
}

const EMPTY_FORM = {
  codigo: "", sector: "", nodo: "Nod_01", empresa: "Americanet",
  capacidad: 8, puertos_ocupados: 0, estado: "Activa",
  tecnico_responsable: "", observacion: "", ubicacion: "",
  lat: "", lng: "",
  fotos: [], fecha_instalacion: "",
};

export default function NapPanel({ sessionUser, rolSesion }) {
  const [cajas, setCajas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroNodo, setFiltroNodo] = useState("Todos");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [filtroEmpresa, setFiltroEmpresa] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [tecnicos, setTecnicos] = useState([]);
  const [toast, setToast] = useState(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingFotoRapida, setUploadingFotoRapida] = useState(false);
  const [vincularOpen, setVincularOpen] = useState(false);
  const fileInputRef = useRef();
  const fileInputRapidoRef = useRef();

  const esAdmin = rolSesion === "Administrador";
  const esGestora = rolSesion === "Gestora";
  const esAlmacen = rolSesion === "Almacen";
  const puedeEditar = esAdmin || esGestora || esAlmacen;

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadCajas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("nap_cajas")
        .select("id,ctoid,codigo,sector,nodo,empresa,capacidad,puertos_ocupados,estado,tecnico_responsable,observacion,ubicacion,lat,lng,fotos,fecha_instalacion,updated_at")
        .order("nodo", { ascending: true })
        .order("codigo", { ascending: true });
      if (error) throw error;
      setCajas(data || []);
    } catch (e) {
      showToast(e?.message || "Error cargando cajas", false);
    } finally { setLoading(false); }
  }, []);

  const loadTecnicos = useCallback(async () => {
    const { data } = await supabase.from("usuarios").select("nombre").eq("rol", "Tecnico").order("nombre");
    if (data) setTecnicos(data.map(u => u.nombre));
  }, []);

  useEffect(() => { loadCajas(); loadTecnicos(); }, [loadCajas, loadTecnicos]);

  // Filtrado
  const cajasFiltradas = cajas.filter(c => {
    if (filtroNodo !== "Todos" && c.nodo !== filtroNodo) return false;
    if (filtroEstado !== "Todos" && c.estado !== filtroEstado) return false;
    if (filtroEmpresa !== "Todos" && c.empresa !== filtroEmpresa) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return (
        String(c.codigo || "").toLowerCase().includes(q) ||
        String(c.sector || "").toLowerCase().includes(q) ||
        String(c.tecnico_responsable || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Stats
  const totalCajas = cajas.length;
  const totalActivas = cajas.filter(c => c.estado === "Activa").length;
  const totalOcupados = cajas.reduce((a, c) => a + (Number(c.puertos_ocupados) || 0), 0);
  const totalCapacidad = cajas.reduce((a, c) => a + (Number(c.capacidad) || 8), 0);
  const pctGlobal = totalCapacidad > 0 ? Math.round((totalOcupados / totalCapacidad) * 100) : 0;
  const cajasCriticas = cajas.filter(c => pct(c.puertos_ocupados, c.capacidad || 8) >= 80).length;

  const openCrear = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEditar = (caja) => {
    setEditingId(caja.id);
    setForm({
      codigo: caja.codigo || "",
      sector: caja.sector || "",
      nodo: caja.nodo || "Nod_01",
      empresa: caja.empresa || "Americanet",
      capacidad: caja.capacidad || 8,
      puertos_ocupados: caja.puertos_ocupados || 0,
      estado: caja.estado || "Activa",
      tecnico_responsable: caja.tecnico_responsable || "",
      observacion: caja.observacion || "",
      ubicacion: caja.ubicacion || "",
      lat: caja.lat != null ? String(caja.lat) : "",
      lng: caja.lng != null ? String(caja.lng) : "",
      fotos: Array.isArray(caja.fotos) ? caja.fotos : [],
      fecha_instalacion: caja.fecha_instalacion || "",
    });
    setModalOpen(true);
  };

  const openDetalle = async (caja) => {
    setDetalle(caja);
    setLoadingClientes(true);
    setClientes([]);
    try {
      const { data } = await supabase
        .from("clientes")
        .select("id,nombre,dni,celular,direccion,nodo,usuario_nodo,estado_servicio,sn_onu,caja_nap,puerto_nap")
        .eq("caja_nap", caja.codigo)
        .order("nombre");
      const lista = data || [];
      setClientes(lista);
      // Sincronizar puertos_ocupados con el conteo real si difiere
      const realCount = lista.length;
      if (realCount !== (caja.puertos_ocupados || 0)) {
        await supabase.from("nap_cajas").update({ puertos_ocupados: realCount }).eq("id", caja.id);
        setCajas(prev => prev.map(c => c.id === caja.id ? { ...c, puertos_ocupados: realCount } : c));
        setDetalle(prev => prev ? { ...prev, puertos_ocupados: realCount } : prev);
      }
    } finally { setLoadingClientes(false); }
  };

  const handleFotoUpload = async (files) => {
    if (!files?.length) return;
    setUploadingFoto(true);
    const newFotos = [...(form.fotos || [])];
    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split(".").pop().toLowerCase() || "jpg";
        const path = `nap/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage.from("liquidaciones").upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from("liquidaciones").getPublicUrl(path);
        if (data?.publicUrl) newFotos.push({ url: data.publicUrl, label: "Foto NAP" });
      } catch (e) {
        showToast("Error subiendo foto: " + (e?.message || ""), false);
      }
    }
    setForm(f => ({ ...f, fotos: newFotos }));
    setUploadingFoto(false);
  };

  // Subida rápida de fotos desde el panel de detalle (sin abrir el modal)
  const handleFotoRapida = async (files) => {
    if (!files?.length || !detalle) return;
    setUploadingFotoRapida(true);
    const fotosActuales = Array.isArray(detalle.fotos) ? [...detalle.fotos] : [];
    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split(".").pop().toLowerCase() || "jpg";
        const path = `nap/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage.from("liquidaciones").upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from("liquidaciones").getPublicUrl(path);
        if (data?.publicUrl) fotosActuales.push({ url: data.publicUrl, label: "Foto NAP" });
      } catch (e) {
        showToast("Error subiendo foto: " + (e?.message || ""), false);
      }
    }
    const { error } = await supabase.from("nap_cajas").update({ fotos: fotosActuales, updated_at: new Date().toISOString() }).eq("id", detalle.id);
    if (error) { showToast(error.message, false); }
    else {
      showToast(`✓ ${Array.from(files).length} foto(s) guardada(s)`);
      setDetalle(d => ({ ...d, fotos: fotosActuales }));
      setCajas(cs => cs.map(c => c.id === detalle.id ? { ...c, fotos: fotosActuales } : c));
    }
    setUploadingFotoRapida(false);
  };

  const handleSave = async () => {
    if (!form.codigo.trim()) { showToast("El código es obligatorio", false); return; }
    if (!form.nodo.trim()) { showToast("Selecciona un nodo", false); return; }
    // Validar código único (case-insensitive, excluir la caja en edición)
    const codigoNorm = form.codigo.trim().toUpperCase();
    const duplicado = cajas.find(c =>
      String(c.codigo || "").toUpperCase() === codigoNorm &&
      c.id !== editingId
    );
    if (duplicado) {
      showToast(`Ya existe una caja con código "${codigoNorm}" (${duplicado.sector || duplicado.nodo}). Usa un código único.`, false);
      return;
    }
    setSaving(true);
    try {
      // Resolver lat/lng: usar campos directos o parsear desde ubicacion "lat, lng"
      let latVal = parseFloat(String(form.lat || "").trim().replace(",", "."));
      let lngVal = parseFloat(String(form.lng || "").trim().replace(",", "."));
      if (isNaN(latVal) || isNaN(lngVal)) {
        const parts = String(form.ubicacion || "").split(",").map(s => parseFloat(s.trim()));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          latVal = parts[0];
          lngVal = parts[1];
        }
      }

      const payload = {
        codigo: form.codigo.trim().toUpperCase(),
        sector: form.sector.trim(),
        nodo: form.nodo,
        empresa: form.empresa,
        capacidad: Number(form.capacidad) || 8,
        puertos_ocupados: Number(form.puertos_ocupados) || 0,
        estado: form.estado,
        tecnico_responsable: form.tecnico_responsable,
        observacion: form.observacion,
        ubicacion: form.ubicacion,
        fotos: form.fotos || [],
        fecha_instalacion: form.fecha_instalacion || null,
        updated_at: new Date().toISOString(),
      };
      if (!isNaN(latVal)) payload.lat = latVal;
      if (!isNaN(lngVal)) payload.lng = lngVal;

      if (editingId) {
        const { error } = await supabase.from("nap_cajas").update(payload).eq("id", editingId);
        if (error) throw error;
        showToast("✓ Caja actualizada");
      } else {
        // Insertar con ctoid=0 luego parchear con el id real
        const { data: inserted, error } = await supabase.from("nap_cajas").insert([{ ...payload, ctoid: 0 }]).select("id").single();
        if (error) throw error;
        if (inserted?.id) {
          await supabase.from("nap_cajas").update({ ctoid: inserted.id }).eq("id", inserted.id);
        }
        showToast("✓ Caja registrada");
      }
      setModalOpen(false);
      loadCajas();
    } catch (e) {
      showToast(e?.message || "Error al guardar", false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar esta caja NAP?")) return;
    const { error } = await supabase.from("nap_cajas").delete().eq("id", id);
    if (error) { showToast(error.message, false); return; }
    showToast("Caja eliminada");
    if (detalle?.id === id) setDetalle(null);
    loadCajas();
  };

  const sf = (field, val) => setForm(f => ({ ...f, [field]: val }));

  // Render
  const s = styles;

  return (
    <div style={s.root}>
      {toast && <div style={{ ...s.toast, background: toast.ok ? "#166534" : "#991b1b" }}>{toast.msg}</div>}

      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <h2 style={s.pageTitle}>Cajas NAP</h2>
          <p style={s.pageSub}>Gestión de infraestructura de red — {totalCajas} cajas registradas</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setVincularOpen(true)}
            style={{ ...s.btnPrimary, background: "#f97316" }}
          >
            🗺 Vincular clientes
          </button>
          {puedeEditar && (
            <button onClick={openCrear} style={s.btnPrimary}>+ Nueva caja</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        {[
          { label: "Total cajas", value: totalCajas, color: "#2563eb", bg: "#eff6ff" },
          { label: "Activas", value: totalActivas, color: "#16a34a", bg: "#f0fdf4" },
          { label: "Ocupación global", value: pctGlobal + "%", color: pctColor(pctGlobal), bg: "#f8fafc" },
          { label: "Puertos ocupados", value: `${totalOcupados}/${totalCapacidad}`, color: "#374151", bg: "#f8fafc" },
          { label: "Cajas críticas (>80%)", value: cajasCriticas, color: cajasCriticas > 0 ? "#dc2626" : "#16a34a", bg: cajasCriticas > 0 ? "#fef2f2" : "#f0fdf4" },
        ].map((st, i) => (
          <div key={i} style={{ ...s.statCard, background: st.bg }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: st.color }}>{st.value}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={s.filtersRow}>
        <input style={s.searchInput} placeholder="Buscar por código, sector, técnico..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select style={s.select} value={filtroNodo} onChange={e => setFiltroNodo(e.target.value)}>
          {NODOS.map(n => <option key={n}>{n}</option>)}
        </select>
        <select style={s.select} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option>Todos</option>
          {ESTADOS.map(e => <option key={e}>{e}</option>)}
        </select>
        <select style={s.select} value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
          <option>Todos</option>
          {EMPRESAS.map(e => <option key={e}>{e}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{cajasFiltradas.length} resultados</span>
      </div>

      {/* Contenido */}
      <div style={detalle ? s.splitLayout : {}}>
        {/* Lista */}
        <div>
          {loading ? (
            <div style={s.center}>Cargando cajas NAP…</div>
          ) : cajasFiltradas.length === 0 ? (
            <div style={s.center}>No se encontraron cajas con los filtros aplicados.</div>
          ) : (
            <div style={s.grid}>
              {cajasFiltradas.map(caja => {
                const p = pct(caja.puertos_ocupados || 0, caja.capacidad || 8);
                const ec = ESTADO_COLORS[caja.estado] || ESTADO_COLORS.Activa;
                const isSelected = detalle?.id === caja.id;
                return (
                  <div
                    key={caja.id}
                    onClick={() => openDetalle(caja)}
                    style={{ ...s.cajaCard, ...(isSelected ? s.cajaCardSelected : {}) }}
                  >
                    <div style={s.cajaCardTop}>
                      <div>
                        <div style={s.cajaCodigo}>{caja.codigo}</div>
                        <div style={s.cajaSector}>{caja.sector} · {caja.nodo}</div>
                      </div>
                      <span style={{ ...s.estadoBadge, background: ec.bg, color: ec.color, borderColor: ec.border }}>
                        {caja.estado}
                      </span>
                    </div>
                    <OcupacionBar ocupados={caja.puertos_ocupados || 0} capacidad={caja.capacidad || 8} />
                    <div style={s.cajaCardFooter}>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>
                        {caja.tecnico_responsable || "Sin técnico"}
                      </span>
                      {puedeEditar && (
                        <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEditar(caja)} style={s.btnIconEdit}>✏</button>
                          {esAdmin && <button onClick={() => handleDelete(caja.id)} style={s.btnIconDel}>✕</button>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel detalle */}
        {detalle && (
          <div style={s.detallePanel}>
            <div style={s.detallePanelHeader}>
              <div>
                <div style={s.detalleCodigo}>{detalle.codigo}</div>
                <div style={s.detalleSector}>{detalle.sector} · {detalle.nodo} · {detalle.empresa}</div>
              </div>
              <button onClick={() => setDetalle(null)} style={s.btnClose}>✕</button>
            </div>

            {/* Info de la caja */}
            <div style={s.detalleInfoGrid}>
              {[
                ["Estado", detalle.estado],
                ["Capacidad", `${detalle.capacidad || 8} puertos`],
                ["Ocupados", `${detalle.puertos_ocupados || 0} puertos`],
                ["Técnico", detalle.tecnico_responsable || "—"],
                ["Instalación", detalle.fecha_instalacion || "—"],
                ["Ubicación", detalle.ubicacion || "—"],
              ].map(([l, v]) => (
                <div key={l} style={s.detalleInfoRow}>
                  <span style={s.detalleInfoLabel}>{l}</span>
                  <span style={s.detalleInfoVal}>{v}</span>
                </div>
              ))}
            </div>

            {/* Barra ocupación */}
            <div style={{ padding: "0 0 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Ocupación — {pct(detalle.puertos_ocupados || 0, detalle.capacidad || 8)}%
              </div>
              <OcupacionBar ocupados={detalle.puertos_ocupados || 0} capacidad={detalle.capacidad || 8} />
            </div>

            {/* Observación */}
            {detalle.observacion && (
              <div style={s.obsBox}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>OBSERVACIÓN</div>
                <div style={{ fontSize: 12, color: "#374151" }}>{detalle.observacion}</div>
              </div>
            )}

            {/* Fotos */}
            {(() => {
              const fotos = collectFotos(detalle);
              if (!fotos.length) return (
                <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", marginBottom: 12 }}>Sin fotos registradas</div>
              );
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>FOTOS ({fotos.length})</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                    {fotos.map((f, i) => (
                      <FotoThumb key={i} url={f.url} label={f.label} />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Clientes conectados */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                CLIENTES CONECTADOS {loadingClientes ? "…" : `(${clientes.length})`}
              </div>
              {loadingClientes ? (
                <div style={{ fontSize: 12, color: "#6b7280" }}>Cargando…</div>
              ) : clientes.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Sin clientes vinculados a esta caja</div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {clientes.map(cl => (
                    <div key={cl.id} style={s.clienteRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{cl.nombre}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>DNI {cl.dni} · {cl.celular}</div>
                        {cl.puerto_nap && (
                          <div style={{ fontSize: 11, color: "#0369a1", fontWeight: 600 }}>Puerto {cl.puerto_nap}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                        background: cl.estado_servicio === "ACTIVO" ? "#f0fdf4" : "#fef2f2",
                        color: cl.estado_servicio === "ACTIVO" ? "#166534" : "#991b1b",
                      }}>
                        {cl.estado_servicio || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {puedeEditar && (
              <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => fileInputRapidoRef.current?.click()}
                  disabled={uploadingFotoRapida}
                  style={{ ...s.btnSecondary, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  {uploadingFotoRapida ? "Subiendo fotos…" : "📷 Agregar fotos"}
                </button>
                <input
                  ref={fileInputRapidoRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={e => { handleFotoRapida(e.target.files); e.target.value = ""; }}
                />
                <button onClick={() => openEditar(detalle)} style={{ ...s.btnPrimary, width: "100%" }}>
                  ✏ Editar caja
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal vincular clientes */}
      {vincularOpen && (
        <NapVincularModal
          cajas={cajas}
          onClose={() => setVincularOpen(false)}
          onUpdate={loadCajas}
        />
      )}

      {/* Modal crear/editar */}
      {modalOpen && (
        <div style={s.modalOverlay} onClick={() => setModalOpen(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>{editingId ? "Editar caja NAP" : "Nueva caja NAP"}</h3>
              <button onClick={() => setModalOpen(false)} style={s.btnClose}>✕</button>
            </div>

            <div style={s.modalBody}>
              <div style={s.formGrid}>
                <div style={s.fg}>
                  <label style={s.label}>Código *</label>
                  <input style={s.input} value={form.codigo} onChange={e => sf("codigo", e.target.value.toUpperCase())} placeholder="NAP-NOD01-001" />
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Sector / Zona</label>
                  <input style={s.input} value={form.sector} onChange={e => sf("sector", e.target.value)} placeholder="San José, Zona Norte..." />
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Nodo *</label>
                  <select style={s.input} value={form.nodo} onChange={e => sf("nodo", e.target.value)}>
                    {["Nod_01","Nod_02","Nod_03","Nod_04","Nod_05","Nod_06"].map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Empresa</label>
                  <select style={s.input} value={form.empresa} onChange={e => sf("empresa", e.target.value)}>
                    {EMPRESAS.map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Capacidad (puertos)</label>
                  <select style={s.input} value={form.capacidad} onChange={e => sf("capacidad", Number(e.target.value))}>
                    {CAPACIDADES.map(c => <option key={c} value={c}>{c} puertos</option>)}
                  </select>
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Puertos ocupados</label>
                  <input style={s.input} type="number" min={0} max={form.capacidad} value={form.puertos_ocupados} onChange={e => sf("puertos_ocupados", Number(e.target.value))} />
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Estado</label>
                  <select style={s.input} value={form.estado} onChange={e => sf("estado", e.target.value)}>
                    {ESTADOS.map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Técnico responsable</label>
                  <select style={s.input} value={form.tecnico_responsable} onChange={e => sf("tecnico_responsable", e.target.value)}>
                    <option value="">Sin asignar</option>
                    {tecnicos.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Fecha instalación</label>
                  <input style={s.input} type="date" value={form.fecha_instalacion} onChange={e => sf("fecha_instalacion", e.target.value)} />
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Ubicación (texto referencial)</label>
                  <input style={s.input} value={form.ubicacion} onChange={e => {
                    sf("ubicacion", e.target.value);
                    // Auto-parsear si es "lat, lng"
                    const parts = e.target.value.split(",").map(s => parseFloat(s.trim()));
                    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                      setForm(f => ({ ...f, ubicacion: e.target.value, lat: String(parts[0]), lng: String(parts[1]) }));
                    }
                  }} placeholder="-16.4384, -71.5980 (o ingresa lat/lng abajo)" />
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Latitud</label>
                  <input style={s.input} type="number" step="any" value={form.lat} onChange={e => sf("lat", e.target.value)} placeholder="-16.438490" />
                </div>
                <div style={s.fg}>
                  <label style={s.label}>Longitud</label>
                  <input style={s.input} type="number" step="any" value={form.lng} onChange={e => sf("lng", e.target.value)} placeholder="-71.598208" />
                </div>
              </div>

              <div style={s.fg}>
                <label style={s.label}>Observación</label>
                <textarea style={{ ...s.input, resize: "vertical" }} rows={2} value={form.observacion} onChange={e => sf("observacion", e.target.value)} placeholder="Notas sobre la caja, estado del poste, acceso..." />
              </div>

              {/* Fotos */}
              <div style={{ marginTop: 12 }}>
                <label style={s.label}>Fotos ({form.fotos?.length || 0})</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {(form.fotos || []).map((f, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={f?.url || f || ""} alt="foto" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e4eaf4" }} onError={e => { e.target.style.opacity = "0.3"; }} />
                      <button
                        onClick={() => sf("fotos", form.fotos.filter((_, j) => j !== i))}
                        style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#dc2626", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFoto}
                    style={{ width: 72, height: 72, border: "2px dashed #cbd5e1", borderRadius: 8, background: "#f8fafc", cursor: "pointer", fontSize: 22, color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {uploadingFoto ? "…" : "+"}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFotoUpload(e.target.files)} />
                </div>
              </div>
            </div>

            <div style={s.modalFooter}>
              <button onClick={() => setModalOpen(false)} style={s.btnSecondary}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={s.btnPrimary}>
                {saving ? "Guardando…" : editingId ? "Actualizar" : "Registrar caja"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: { fontFamily: "Inter, Arial, sans-serif", color: "#111827" },
  toast: { position: "fixed", top: 20, right: 20, padding: "12px 20px", borderRadius: 10, color: "#fff", fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" },
  pageHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  pageTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: "#163f86" },
  pageSub: { margin: "3px 0 0", fontSize: 13, color: "#5e718f" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 18 },
  statCard: { borderRadius: 12, padding: "12px 14px", border: "1px solid #e4eaf4" },
  filtersRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  searchInput: { flex: 1, minWidth: 200, padding: "8px 12px", border: "1.5px solid #e4eaf4", borderRadius: 8, fontSize: 13, background: "#f8fafc", outline: "none", color: "#111827", fontFamily: "inherit" },
  select: { padding: "8px 10px", border: "1.5px solid #e4eaf4", borderRadius: 8, fontSize: 13, background: "#f8fafc", color: "#111827", outline: "none", cursor: "pointer" },
  splitLayout: { display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 },
  cajaCard: { background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #e4eaf4", cursor: "pointer", transition: "box-shadow .15s", boxShadow: "0 2px 8px -4px rgba(17,47,94,0.1)", display: "grid", gap: 8 },
  cajaCardSelected: { borderColor: "#93c5fd", boxShadow: "0 0 0 2px #bfdbfe" },
  cajaCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  cajaCodigo: { fontSize: 14, fontWeight: 700, color: "#163f86" },
  cajaSector: { fontSize: 11, color: "#6b7280", marginTop: 1 },
  estadoBadge: { fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, border: "1px solid", whiteSpace: "nowrap" },
  cajaCardFooter: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  btnIconEdit: { padding: "3px 8px", fontSize: 12, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, cursor: "pointer", color: "#1d4ed8" },
  btnIconDel: { padding: "3px 8px", fontSize: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", color: "#dc2626" },
  detallePanel: { background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #e4eaf4", boxShadow: "0 4px 16px -8px rgba(17,47,94,0.12)", position: "sticky", top: 90, maxHeight: "80vh", overflowY: "auto" },
  detallePanelHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  detalleCodigo: { fontSize: 18, fontWeight: 800, color: "#163f86" },
  detalleSector: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  detalleInfoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 },
  detalleInfoRow: { display: "flex", flexDirection: "column", gap: 1 },
  detalleInfoLabel: { fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" },
  detalleInfoVal: { fontSize: 12, color: "#111827", fontWeight: 500 },
  obsBox: { background: "#f8fafc", border: "1px solid #e4eaf4", borderRadius: 8, padding: "10px 12px", marginBottom: 14 },
  clienteRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" },
  center: { textAlign: "center", padding: "48px 0", color: "#6b7280", fontSize: 14 },
  btnPrimary: { padding: "9px 18px", background: "#2563eb", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  btnSecondary: { padding: "9px 18px", background: "#f8fafc", border: "1.5px solid #e4eaf4", borderRadius: 8, color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  btnClose: { padding: "4px 10px", background: "#f1f5f9", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "#374151" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e4eaf4" },
  modalTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: "#163f86" },
  modalBody: { padding: "18px 20px", overflowY: "auto", flex: 1, display: "grid", gap: 12 },
  modalFooter: { padding: "14px 20px", borderTop: "1px solid #e4eaf4", display: "flex", justifyContent: "flex-end", gap: 10 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  fg: { display: "grid", gap: 4 },
  label: { fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" },
  input: { padding: "8px 12px", border: "1.5px solid #e4eaf4", borderRadius: 8, fontSize: 13, color: "#111827", background: "#f8fafc", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
};
