import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png", iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png", shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png" });

const TIPOS  = ["OLT","MIKROTIK","SWITCH","DAC","UPS","SERVIDOR","OTRO"];
const ESTADOS = ["almacen","instalado","dañado","observacion"];
const ESTADO_COLOR = { almacen:"#3B82F6", instalado:"#16A34A", "dañado":"#DC2626", observacion:"#D97706" };
const ESTADO_LABEL = { almacen:"Almacén", instalado:"Instalado", "dañado":"Dañado", observacion:"Observación" };

const FORM_VACIO = { codigo:"", tipo:"OLT", marca:"", modelo:"", serie:"", ubicacion:"", estado:"almacen", notas:"", lat:"", lng:"" };

function BadgeEstado({ estado }) {
  const color = ESTADO_COLOR[estado] || "#6B7280";
  const label = ESTADO_LABEL[estado] || estado;
  return (
    <span style={{ background: color + "22", color, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, border: `1px solid ${color}44` }}>
      {label.toUpperCase()}
    </span>
  );
}

export default function NocEquiposPanel({ esAdmin, cardStyle }) {
  const [equipos, setEquipos]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [vista, setVista]         = useState("lista");
  const [busqueda, setBusqueda]   = useState("");
  const [filtroTipo, setFiltroTipo]     = useState("TODOS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");

  // Modal detalle/edición
  const [seleccionado, setSeleccionado] = useState(null);
  const [editando, setEditando]         = useState(false);
  const [formEdit, setFormEdit]         = useState({});
  const [guardando, setGuardando]       = useState(false);
  const [fotoSubiendo, setFotoSubiendo] = useState(false);

  // Formulario nuevo
  const [form, setForm]           = useState(FORM_VACIO);
  const [formGuardando, setFormGuardando] = useState(false);

  // Lightbox fotos
  const [lightbox, setLightbox] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data, error: e } = await supabase.from("equipos").select("*").order("created_at", { ascending: false });
      if (e) throw e;
      setEquipos(data || []);
    } catch (e) { setError(e?.message || "Error cargando equipos."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = equipos.filter(eq => {
    if (filtroTipo !== "TODOS" && eq.tipo !== filtroTipo) return false;
    if (filtroEstado !== "TODOS" && eq.estado !== filtroEstado) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return [eq.codigo, eq.marca, eq.modelo, eq.serie, eq.ubicacion].some(v => (v||"").toLowerCase().includes(q));
    }
    return true;
  });

  const subirFoto = async (file, codigo) => {
    if (!file) return null;
    setFotoSubiendo(true);
    try {
      const ext  = file.name.split(".").pop().toLowerCase();
      const nombre = `${codigo}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("equipos-fotos").upload(nombre, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("equipos-fotos").getPublicUrl(nombre);
      return data?.publicUrl || null;
    } catch (e) { alert("Error subiendo foto: " + (e?.message || "")); return null; }
    finally { setFotoSubiendo(false); }
  };

  const guardarNuevo = async () => {
    if (!form.codigo.trim()) { alert("El código es requerido."); return; }
    setFormGuardando(true);
    try {
      const payload = {
        codigo:    form.codigo.trim().toUpperCase(),
        tipo:      form.tipo,
        marca:     form.marca.trim(),
        modelo:    form.modelo.trim(),
        serie:     form.serie.trim(),
        ubicacion: form.ubicacion.trim(),
        estado:    form.estado,
        notas:     form.notas.trim(),
        lat:       form.lat ? Number(form.lat) : null,
        lng:       form.lng ? Number(form.lng) : null,
        fotos:     [],
        updated_at: new Date().toISOString(),
      };
      const { error: e } = await supabase.from("equipos").insert(payload);
      if (e) throw e;
      alert(`Equipo ${payload.codigo} registrado correctamente.`);
      setForm(FORM_VACIO);
      setVista("lista");
      cargar();
    } catch (e) { alert("Error: " + (e?.message || "")); }
    finally { setFormGuardando(false); }
  };

  const guardarEdicion = async () => {
    setGuardando(true);
    try {
      const payload = {
        tipo: formEdit.tipo, marca: (formEdit.marca||"").trim(), modelo: (formEdit.modelo||"").trim(),
        serie: (formEdit.serie||"").trim(), ubicacion: (formEdit.ubicacion||"").trim(),
        estado: formEdit.estado, notas: (formEdit.notas||"").trim(),
        lat: formEdit.lat ? Number(formEdit.lat) : null, lng: formEdit.lng ? Number(formEdit.lng) : null,
        fotos: formEdit.fotos || [], updated_at: new Date().toISOString(),
      };
      const { error: e } = await supabase.from("equipos").update(payload).eq("id", seleccionado.id);
      if (e) throw e;
      setEquipos(prev => prev.map(eq => eq.id === seleccionado.id ? { ...eq, ...payload } : eq));
      setSeleccionado(prev => ({ ...prev, ...payload }));
      setEditando(false);
      alert("Equipo actualizado.");
    } catch (e) { alert("Error: " + (e?.message || "")); }
    finally { setGuardando(false); }
  };

  const eliminar = async (eq) => {
    if (!window.confirm(`¿Eliminar equipo ${eq.codigo}?`)) return;
    const { error: e } = await supabase.from("equipos").delete().eq("id", eq.id);
    if (e) { alert("Error: " + e.message); return; }
    setEquipos(prev => prev.filter(x => x.id !== eq.id));
    setSeleccionado(null);
  };

  const abrirDetalle = (eq) => { setSeleccionado(eq); setFormEdit({ ...eq }); setEditando(false); };

  const card = cardStyle || { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };

  // KPIs
  const kpis = [
    { label: "Total", value: equipos.length, color: "#2563eb" },
    ...ESTADOS.map(e => ({ label: ESTADO_LABEL[e], value: equipos.filter(eq => eq.estado === e).length, color: ESTADO_COLOR[e] })),
  ];

  const inputSt = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, width: "100%", boxSizing: "border-box" };
  const labelSt = { fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header */}
      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1e293b" }}>🖥️ NOC · Equipos DIM</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{equipos.length} equipos registrados</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ k:"lista", l:"☰ Lista" }, { k:"mapa", l:"🗺 Mapa" }, { k:"registrar", l:"+ Registrar" }].map(t => (
            <button key={t.k} onClick={() => setVista(t.k)}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
                background: vista === t.k ? "#2563eb" : "#f1f5f9", color: vista === t.k ? "#fff" : "#475569" }}>
              {t.l}
            </button>
          ))}
          <button onClick={cargar} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, cursor: "pointer", color: "#475569" }}>↺</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, flex: 1, minWidth: 100, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: k.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ ...card, color: "#dc2626" }}>{error}</div>}

      {/* LISTA */}
      {vista === "lista" && (
        <div style={{ ...card }}>
          {/* Filtros */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar código, marca, ubicación..."
              style={{ ...inputSt, maxWidth: 320, flex: 1 }} />
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inputSt, width: "auto" }}>
              <option value="TODOS">Todos los tipos</option>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...inputSt, width: "auto" }}>
              <option value="TODOS">Todos los estados</option>
              {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
            </select>
          </div>

          {loading ? <div style={{ textAlign:"center", color:"#94a3b8", padding: 40 }}>Cargando...</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background:"#f8fafc" }}>
                    {["Código","Tipo","Marca / Modelo","Serie / MAC","Ubicación","Estado","Fotos","Acciones"].map(h => (
                      <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontWeight:700, color:"#374151", borderBottom:"2px solid #e5e7eb", whiteSpace:"nowrap", fontSize:12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 && (
                    <tr><td colSpan={8} style={{ padding:32, textAlign:"center", color:"#94a3b8" }}>Sin equipos{busqueda ? " con ese criterio" : ""}</td></tr>
                  )}
                  {filtrados.map((eq, i) => (
                    <tr key={eq.id} style={{ background: i%2===0?"#fff":"#f9fafb", cursor:"pointer" }} onClick={() => abrirDetalle(eq)}>
                      <td style={{ padding:"9px 12px", fontWeight:800, color:"#1e293b", letterSpacing:"0.03em" }}>{eq.codigo}</td>
                      <td style={{ padding:"9px 12px", color:"#2563eb", fontWeight:700 }}>{eq.tipo}</td>
                      <td style={{ padding:"9px 12px", color:"#374151" }}>{[eq.marca,eq.modelo].filter(Boolean).join(" · ") || "—"}</td>
                      <td style={{ padding:"9px 12px", color:"#64748b", fontFamily:"monospace", fontSize:12 }}>{eq.serie || "—"}</td>
                      <td style={{ padding:"9px 12px", color:"#374151" }}>{eq.ubicacion || "—"}</td>
                      <td style={{ padding:"9px 12px" }}><BadgeEstado estado={eq.estado} /></td>
                      <td style={{ padding:"9px 12px", color:"#6b7280" }}>{(eq.fotos||[]).length > 0 ? `📷 ${eq.fotos.length}` : "—"}</td>
                      <td style={{ padding:"9px 12px" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display:"flex", gap:4 }}>
                          <button onClick={() => abrirDetalle(eq)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #bfdbfe", background:"#eff6ff", color:"#1d4ed8", fontSize:11, fontWeight:700, cursor:"pointer" }}>Ver</button>
                          {esAdmin && <button onClick={() => eliminar(eq)} style={{ padding:"4px 10px", borderRadius:6, border:"none", background:"#dc2626", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>Eliminar</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MAPA */}
      {vista === "mapa" && (
        <div style={{ ...card, padding: 0, overflow:"hidden", borderRadius:14 }}>
          <div style={{ padding:"14px 20px", borderBottom:"1px solid #e5e7eb", fontWeight:700, color:"#1e293b" }}>
            🗺 Mapa de Equipos — {equipos.filter(e => e.lat && e.lng).length} con coordenadas
          </div>
          <MapContainer center={[-16.4385, -71.5982]} zoom={12} style={{ height:500, width:"100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            {equipos.filter(eq => eq.lat && eq.lng).map(eq => (
              <Marker key={eq.id} position={[eq.lat, eq.lng]}>
                <Popup>
                  <strong>{eq.codigo}</strong><br/>
                  {eq.tipo}{eq.marca ? ` · ${eq.marca}` : ""}{eq.modelo ? ` ${eq.modelo}` : ""}<br/>
                  {eq.ubicacion && <span>📍 {eq.ubicacion}<br/></span>}
                  <BadgeEstado estado={eq.estado} />
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* REGISTRAR */}
      {vista === "registrar" && (
        <div style={{ ...card, maxWidth:640 }}>
          <div style={{ fontWeight:800, fontSize:16, color:"#1e293b", marginBottom:20 }}>+ Registrar Equipo</div>
          <div style={{ display:"grid", gap:14 }}>
            <div>
              <label style={labelSt}>Código *</label>
              <input value={form.codigo} onChange={e => setForm(p=>({...p,codigo:e.target.value.toUpperCase()}))}
                placeholder="Código QR o identificador" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Tipo *</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:6 }}>
                {TIPOS.map(t => (
                  <button key={t} onClick={() => setForm(p=>({...p,tipo:t}))}
                    style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${form.tipo===t?"#2563eb":"#d1d5db"}`, background:form.tipo===t?"#eff6ff":"#fff", color:form.tipo===t?"#1d4ed8":"#475569", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={labelSt}>Marca</label>
                <input value={form.marca} onChange={e=>setForm(p=>({...p,marca:e.target.value}))} placeholder="Ej: Huawei" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Modelo</label>
                <input value={form.modelo} onChange={e=>setForm(p=>({...p,modelo:e.target.value}))} placeholder="Ej: MA5800" style={inputSt} />
              </div>
            </div>
            <div>
              <label style={labelSt}>Serie / MAC</label>
              <input value={form.serie} onChange={e=>setForm(p=>({...p,serie:e.target.value.toUpperCase()}))} placeholder="Número de serie o MAC" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Ubicación</label>
              <input value={form.ubicacion} onChange={e=>setForm(p=>({...p,ubicacion:e.target.value}))} placeholder="Ej: Nodo 01, Rack A" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Estado *</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {ESTADOS.map(e => (
                  <button key={e} onClick={() => setForm(p=>({...p,estado:e}))}
                    style={{ padding:"5px 14px", borderRadius:20, border:`1.5px solid ${form.estado===e?ESTADO_COLOR[e]:"#d1d5db"}`, background:form.estado===e?ESTADO_COLOR[e]+"22":"#fff", color:form.estado===e?ESTADO_COLOR[e]:"#475569", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                    {ESTADO_LABEL[e]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={labelSt}>Latitud</label>
                <input value={form.lat} onChange={e=>setForm(p=>({...p,lat:e.target.value}))} placeholder="-16.43849" style={inputSt} type="number" step="any" />
              </div>
              <div>
                <label style={labelSt}>Longitud</label>
                <input value={form.lng} onChange={e=>setForm(p=>({...p,lng:e.target.value}))} placeholder="-71.598208" style={inputSt} type="number" step="any" />
              </div>
            </div>
            <div>
              <label style={labelSt}>Notas</label>
              <textarea value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} placeholder="Observaciones..." rows={3}
                style={{ ...inputSt, resize:"vertical", fontFamily:"inherit" }} />
            </div>
            <button onClick={guardarNuevo} disabled={formGuardando}
              style={{ padding:"12px", borderRadius:10, border:"none", background:formGuardando?"#94a3b8":"#2563eb", color:"#fff", fontWeight:800, fontSize:14, cursor:formGuardando?"not-allowed":"pointer" }}>
              {formGuardando ? "Registrando..." : "Registrar Equipo"}
            </button>
          </div>
        </div>
      )}

      {/* DETALLE / EDICIÓN MODAL */}
      {seleccionado && (
        <div onClick={() => { setSeleccionado(null); setEditando(false); }}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:620, maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
            {/* Header */}
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff", zIndex:1 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:17, color:"#1e293b", letterSpacing:"0.03em" }}>{seleccionado.codigo}</div>
                <BadgeEstado estado={editando ? formEdit.estado : seleccionado.estado} />
              </div>
              <div style={{ display:"flex", gap:8 }}>
                {esAdmin && !editando && (
                  <button onClick={() => setEditando(true)}
                    style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #bfdbfe", background:"#eff6ff", color:"#1d4ed8", fontWeight:700, fontSize:12, cursor:"pointer" }}>✏️ Editar</button>
                )}
                {editando && (
                  <>
                    <button onClick={guardarEdicion} disabled={guardando}
                      style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>{guardando?"Guardando...":"✓ Guardar"}</button>
                    <button onClick={() => { setEditando(false); setFormEdit({...seleccionado}); }}
                      style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", color:"#475569", fontWeight:700, fontSize:12, cursor:"pointer" }}>Cancelar</button>
                  </>
                )}
                {esAdmin && (
                  <button onClick={() => eliminar(seleccionado)}
                    style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#dc2626", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>Eliminar</button>
                )}
                <button onClick={() => { setSeleccionado(null); setEditando(false); }}
                  style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", color:"#475569", fontWeight:700, fontSize:16, cursor:"pointer" }}>×</button>
              </div>
            </div>

            <div style={{ padding:20 }}>
              {editando ? (
                <div style={{ display:"grid", gap:14 }}>
                  <div>
                    <label style={labelSt}>Tipo</label>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {TIPOS.map(t => (
                        <button key={t} onClick={() => setFormEdit(p=>({...p,tipo:t}))}
                          style={{ padding:"4px 12px", borderRadius:20, border:`1.5px solid ${formEdit.tipo===t?"#2563eb":"#d1d5db"}`, background:formEdit.tipo===t?"#eff6ff":"#fff", color:formEdit.tipo===t?"#1d4ed8":"#475569", fontWeight:700, fontSize:12, cursor:"pointer" }}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div><label style={labelSt}>Marca</label><input value={formEdit.marca||""} onChange={e=>setFormEdit(p=>({...p,marca:e.target.value}))} style={inputSt} /></div>
                    <div><label style={labelSt}>Modelo</label><input value={formEdit.modelo||""} onChange={e=>setFormEdit(p=>({...p,modelo:e.target.value}))} style={inputSt} /></div>
                  </div>
                  <div><label style={labelSt}>Serie / MAC</label><input value={formEdit.serie||""} onChange={e=>setFormEdit(p=>({...p,serie:e.target.value.toUpperCase()}))} style={inputSt} /></div>
                  <div><label style={labelSt}>Ubicación</label><input value={formEdit.ubicacion||""} onChange={e=>setFormEdit(p=>({...p,ubicacion:e.target.value}))} style={inputSt} /></div>
                  <div>
                    <label style={labelSt}>Estado</label>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {ESTADOS.map(e => (
                        <button key={e} onClick={() => setFormEdit(p=>({...p,estado:e}))}
                          style={{ padding:"4px 14px", borderRadius:20, border:`1.5px solid ${formEdit.estado===e?ESTADO_COLOR[e]:"#d1d5db"}`, background:formEdit.estado===e?ESTADO_COLOR[e]+"22":"#fff", color:formEdit.estado===e?ESTADO_COLOR[e]:"#475569", fontWeight:700, fontSize:12, cursor:"pointer" }}>{ESTADO_LABEL[e]}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div><label style={labelSt}>Latitud</label><input value={formEdit.lat||""} onChange={e=>setFormEdit(p=>({...p,lat:e.target.value}))} style={inputSt} type="number" step="any" /></div>
                    <div><label style={labelSt}>Longitud</label><input value={formEdit.lng||""} onChange={e=>setFormEdit(p=>({...p,lng:e.target.value}))} style={inputSt} type="number" step="any" /></div>
                  </div>
                  <div><label style={labelSt}>Notas</label><textarea value={formEdit.notas||""} onChange={e=>setFormEdit(p=>({...p,notas:e.target.value}))} rows={3} style={{ ...inputSt, resize:"vertical", fontFamily:"inherit" }} /></div>
                  {/* Agregar fotos en edición */}
                  <div>
                    <label style={labelSt}>Fotos ({(formEdit.fotos||[]).length})</label>
                    <input type="file" accept="image/*" onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await subirFoto(file, seleccionado.codigo);
                      if (url) setFormEdit(p => ({ ...p, fotos: [...(p.fotos||[]), url] }));
                      e.target.value = "";
                    }} style={{ fontSize:12 }} disabled={fotoSubiendo} />
                    {fotoSubiendo && <span style={{ fontSize:11, color:"#6b7280" }}> Subiendo...</span>}
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:8 }}>
                      {(formEdit.fotos||[]).map((url,i) => (
                        <div key={i} style={{ position:"relative" }}>
                          <img src={url} style={{ width:80, height:80, objectFit:"cover", borderRadius:8, cursor:"pointer" }} onClick={() => setLightbox(url)} />
                          <button onClick={() => setFormEdit(p=>({...p,fotos:p.fotos.filter((_,j)=>j!==i)}))}
                            style={{ position:"absolute", top:-6, right:-6, width:18, height:18, borderRadius:"50%", background:"#dc2626", border:"none", color:"#fff", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Vista detalle */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                    {[["Tipo",seleccionado.tipo],["Marca",seleccionado.marca],["Modelo",seleccionado.modelo],["Serie / MAC",seleccionado.serie],["Ubicación",seleccionado.ubicacion],["Notas",seleccionado.notas]].map(([label,val]) => val ? (
                      <div key={label} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{label}</div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{val}</div>
                      </div>
                    ) : null)}
                    {seleccionado.lat && (
                      <div style={{ background:"#f0fdf4", borderRadius:10, padding:"10px 14px", border:"1px solid #bbf7d0", gridColumn:"1/-1" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>Coordenadas GPS</div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#15803d" }}>{Number(seleccionado.lat).toFixed(6)}, {Number(seleccionado.lng).toFixed(6)}</div>
                      </div>
                    )}
                  </div>

                  {/* Mini mapa */}
                  {seleccionado.lat && seleccionado.lng && (
                    <div style={{ borderRadius:10, overflow:"hidden", marginBottom:16, height:200 }}>
                      <MapContainer center={[seleccionado.lat, seleccionado.lng]} zoom={16} style={{ height:"100%", width:"100%" }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={[seleccionado.lat, seleccionado.lng]}>
                          <Popup>{seleccionado.codigo}</Popup>
                        </Marker>
                      </MapContainer>
                    </div>
                  )}

                  {/* Fotos */}
                  {(seleccionado.fotos||[]).length > 0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", marginBottom:8 }}>Fotos ({seleccionado.fotos.length})</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {seleccionado.fotos.map((url,i) => (
                          <img key={i} src={url} style={{ width:100, height:100, objectFit:"cover", borderRadius:10, cursor:"pointer", border:"2px solid #e5e7eb" }} onClick={() => setLightbox(url)} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:16 }}>
                    Registrado: {new Date(seleccionado.created_at).toLocaleDateString("es-PE")}
                    {seleccionado.updated_at !== seleccionado.created_at && ` · Actualizado: ${new Date(seleccionado.updated_at).toLocaleDateString("es-PE")}`}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <button onClick={() => setLightbox(null)} style={{ position:"absolute", top:16, right:20, background:"none", border:"none", color:"#fff", fontSize:32, cursor:"pointer" }}>×</button>
          <img src={lightbox} onClick={e=>e.stopPropagation()} style={{ maxWidth:"95vw", maxHeight:"90vh", borderRadius:10, boxShadow:"0 4px 40px rgba(0,0,0,0.5)" }} />
        </div>
      )}
    </div>
  );
}
