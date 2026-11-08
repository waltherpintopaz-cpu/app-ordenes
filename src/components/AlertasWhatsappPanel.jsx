import { useCallback, useEffect, useState } from "react";
import { BellRing, Plus, Trash2, RefreshCw, Send, Users, Phone, CircleCheck, CircleAlert, Save, Lock } from "lucide-react";
import { supabase } from "../supabaseClient";

// Configuracion de las alertas 🚨 URGENTE del chat de la orden: a que grupo
// y a que numeros les llega el WhatsApp. Se guarda en
// alertas_whatsapp_config (id=1). El envio lo hace dim-notificaciones-server
// con la linea "Notificaciones DIM" de Evolution API -- aqui solo se edita a
// quien, y se piden al servidor la lista de grupos y el mensaje de prueba.
const NOTIF_URL = String(import.meta.env.VITE_NOTIF_URL || "https://n8n-notificacionesdim.0lthka.easypanel.host").replace(/\/+$/, "");

const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
function formatoNumero(n) {
  const d = soloDigitos(n);
  const local = d.length === 11 && d.startsWith("51") ? d.slice(2) : d;
  return local.length === 9 ? `+51 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : d;
}
function normalizarNumero(n) {
  const d = soloDigitos(n);
  if (d.length === 9) return `51${d}`;
  return d;
}

export default function AlertasWhatsappPanel({ usuario, empresa = "dim" }) {
  const q = `?empresa=${encodeURIComponent(empresa)}`;
  const [cargando, setCargando] = useState(true);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [activo, setActivo] = useState(true);
  const [grupoId, setGrupoId] = useState("");
  const [grupoNombre, setGrupoNombre] = useState("");
  const [numeros, setNumeros] = useState([]);
  const [nuevoNumero, setNuevoNumero] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [grupos, setGrupos] = useState([]);
  const [cargandoGrupos, setCargandoGrupos] = useState(false);
  const [estadoLinea, setEstadoLinea] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cambios, setCambios] = useState(false);
  const [probando, setProbando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [reglas, setReglas] = useState([]); // nodos privados: [{ nodo, numeros: [{numero,nombre}], con_grupo }]
  const [tieneReglas, setTieneReglas] = useState(true);
  const [nuevoNodo, setNuevoNodo] = useState("");

  const mostrarAviso = (texto, ok = true) => {
    setAviso({ texto, ok });
    setTimeout(() => setAviso(null), 5000);
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("alertas_whatsapp_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      setFaltaTabla(true);
    } else {
      setFaltaTabla(false);
      setTieneReglas(!data || Object.prototype.hasOwnProperty.call(data, "reglas_nodo"));
      setReglas(Array.isArray(data?.reglas_nodo) ? data.reglas_nodo : []);
      setActivo(data?.activo ?? true);
      setGrupoId(data?.grupo_id || "");
      setGrupoNombre(data?.grupo_nombre || "");
      setNumeros(Array.isArray(data?.numeros) ? data.numeros : []);
      setCambios(false);
    }
    setCargando(false);
  }, []);

  const cargarGrupos = useCallback(async () => {
    setCargandoGrupos(true);
    try {
      const [e, g] = await Promise.all([
        fetch(`${NOTIF_URL}/alertas/estado${q}`).then((r) => r.json()),
        fetch(`${NOTIF_URL}/alertas/grupos${q}`).then((r) => r.json()),
      ]);
      setEstadoLinea(e);
      if (g?.ok) setGrupos(g.grupos || []);
      else mostrarAviso(g?.error || "No se pudo leer la lista de grupos.", false);
    } catch {
      setEstadoLinea({ ok: false, error: "No se pudo conectar con el servidor de notificaciones." });
    } finally {
      setCargandoGrupos(false);
    }
  }, []);

  useEffect(() => { void cargar(); void cargarGrupos(); }, [cargar, cargarGrupos]);

  const agregarNumero = () => {
    const n = normalizarNumero(nuevoNumero);
    if (n.length < 11) return mostrarAviso("Escribe un celular válido (9 dígitos, ej. 980196764).", false);
    if (numeros.some((x) => normalizarNumero(x.numero) === n)) return mostrarAviso("Ese número ya está en la lista.", false);
    setNumeros((p) => [...p, { numero: n, nombre: nuevoNombre.trim() }]);
    setNuevoNumero("");
    setNuevoNombre("");
    setCambios(true);
  };
  const quitarNumero = (i) => { setNumeros((p) => p.filter((_, k) => k !== i)); setCambios(true); };
  const renombrar = (i, nombre) => { setNumeros((p) => p.map((x, k) => (k === i ? { ...x, nombre } : x))); setCambios(true); };

  const guardar = async () => {
    setGuardando(true);
    const { error } = await supabase.from("alertas_whatsapp_config").upsert({
      id: 1,
      activo,
      grupo_id: grupoId || null,
      grupo_nombre: grupoId ? grupoNombre : null,
      numeros: numeros.map((x) => ({ numero: normalizarNumero(x.numero), nombre: String(x.nombre || "").trim() })),
      ...(tieneReglas ? {
        reglas_nodo: reglas
          .filter((r) => String(r.nodo || "").trim())
          .map((r) => ({
            nodo: String(r.nodo).trim(),
            con_grupo: !!r.con_grupo,
            numeros: (r.numeros || []).map((x) => ({ numero: normalizarNumero(x.numero), nombre: String(x.nombre || "").trim() })),
          })),
      } : {}),
      updated_at: new Date().toISOString(),
      updated_by: usuario || null,
    });
    setGuardando(false);
    if (error) return mostrarAviso(`No se pudo guardar: ${error.message}`, false);
    setCambios(false);
    mostrarAviso("Guardado. Las próximas alertas usarán esta configuración.");
  };

  // Nodos privados
  const claveNodo = (v) => { const m = String(v ?? "").match(/\d+/); return m ? String(Number(m[0])) : String(v ?? "").trim().toLowerCase(); };
  const agregarRegla = () => {
    const n = nuevoNodo.trim();
    if (!n) return mostrarAviso("Escribe el nodo, por ejemplo Nod_01.", false);
    if (reglas.some((r) => claveNodo(r.nodo) === claveNodo(n))) return mostrarAviso("Ese nodo ya tiene una regla.", false);
    setReglas((p) => [...p, { nodo: n, con_grupo: false, numeros: [] }]);
    setNuevoNodo("");
    setCambios(true);
  };
  const cambiarRegla = (i, cambiosRegla) => { setReglas((p) => p.map((r, k) => (k === i ? { ...r, ...cambiosRegla } : r))); setCambios(true); };
  const quitarRegla = (i) => {
    if (!window.confirm(`¿Quitar la regla del nodo ${reglas[i]?.nodo}? Sus alertas volverán a ir al grupo y a los números generales.`)) return;
    setReglas((p) => p.filter((_, k) => k !== i));
    setCambios(true);
  };

  const probar = async (nodo = "") => {
    if (cambios) return mostrarAviso("Primero guarda los cambios; la prueba usa lo que está guardado.", false);
    setProbando(true);
    try {
      const r = await fetch(`${NOTIF_URL}/alertas/prueba${q}${nodo ? `&nodo=${encodeURIComponent(nodo)}` : ""}`, { method: "POST" }).then((x) => x.json());
      if (r?.ok) mostrarAviso(`Prueba enviada a ${r.enviados} de ${r.total} destino(s).${r.errores?.length ? ` Fallaron: ${r.errores.join(", ")}` : ""}`, !r.errores?.length);
      else mostrarAviso(r?.error || "No se pudo enviar la prueba.", false);
    } catch {
      mostrarAviso("No se pudo conectar con el servidor de notificaciones.", false);
    } finally {
      setProbando(false);
    }
  };

  const lineaOk = estadoLinea?.ok && estadoLinea?.estado === "open";

  if (cargando) return <div style={{ padding: 24, color: "#64748b" }}>Cargando…</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 4px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BellRing size={22} color="#dc2626" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>Alertas WhatsApp</h2>
          <div style={{ fontSize: 13, color: "#64748b" }}>A quién le llega el WhatsApp cuando un técnico aprieta 🚨 <b>Urgente</b> en el chat de una orden.</div>
        </div>
      </div>

      {faltaTabla && (
        <div style={{ ...caja, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
          Falta crear la tabla <code>alertas_whatsapp_config</code> en Supabase (ver los SQL de alertas en <code>supabase/sql</code>).
        </div>
      )}

      {/* Estado de la linea */}
      <div style={{ ...caja, display: "flex", alignItems: "center", gap: 10 }}>
        {lineaOk ? <CircleCheck size={20} color="#16a34a" /> : <CircleAlert size={20} color="#d97706" />}
        <div style={{ flex: 1, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>Línea que envía: {estadoLinea?.instancia || "Notificaciones DIM"}</div>
          <div style={{ color: lineaOk ? "#15803d" : "#b45309" }}>
            {estadoLinea == null ? "Consultando…" : lineaOk ? "Conectada" : estadoLinea?.error || `Estado: ${estadoLinea?.estado || "desconocido"} (revisa la instancia en Evolution)`}
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#0f172a", cursor: "pointer" }}>
          <input type="checkbox" checked={activo} onChange={(e) => { setActivo(e.target.checked); setCambios(true); }} />
          Alertas activas
        </label>
      </div>

      {/* Grupo */}
      <div style={caja}>
        <div style={tituloSeccion}><Users size={16} /> Grupo de WhatsApp</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 10 }}>
          Elige el grupo de la lista. Solo aparecen los grupos donde está la línea que envía; si falta uno, agrega ese número al grupo y toca "Actualizar".
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={grupoId}
            onChange={(e) => { const g = grupos.find((x) => x.id === e.target.value); setGrupoId(e.target.value); setGrupoNombre(g?.nombre || ""); setCambios(true); }}
            style={{ ...input, flex: 1 }}
          >
            <option value="">— Sin grupo (solo números) —</option>
            {grupoId && !grupos.some((g) => g.id === grupoId) && <option value={grupoId}>{grupoNombre || grupoId}</option>}
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.nombre}{g.miembros ? ` · ${g.miembros} miembros` : ""}</option>
            ))}
          </select>
          <button type="button" onClick={() => void cargarGrupos()} disabled={cargandoGrupos} style={btnSecundario} title="Volver a leer los grupos">
            <RefreshCw size={15} style={cargandoGrupos ? { animation: "spin 1s linear infinite" } : undefined} /> Actualizar
          </button>
        </div>
      </div>

      {/* Numeros */}
      <div style={caja}>
        <div style={tituloSeccion}><Phone size={16} /> Números que reciben la alerta</div>
        {numeros.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8", padding: "6px 0 10px" }}>No hay números todavía.</div>}
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {numeros.map((x, i) => (
            <div key={`${x.numero}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 8px 6px 12px" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", minWidth: 140 }}>{formatoNumero(x.numero)}</span>
              <input value={x.nombre || ""} onChange={(e) => renombrar(i, e.target.value)} placeholder="Nombre (opcional)" style={{ ...input, flex: 1, padding: "6px 10px" }} />
              <button type="button" onClick={() => quitarNumero(i)} title="Quitar" style={{ ...btnIcono, color: "#dc2626" }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={nuevoNumero} onChange={(e) => setNuevoNumero(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregarNumero()} placeholder="Celular, ej. 980196764" style={{ ...input, width: 190 }} />
          <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregarNumero()} placeholder="Nombre (opcional)" style={{ ...input, flex: 1, minWidth: 150 }} />
          <button type="button" onClick={agregarNumero} style={btnSecundario}><Plus size={15} /> Agregar</button>
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
          Consejo: desde cada celular nuevo, manda un "hola" a la línea que envía para que WhatsApp no tome las alertas como spam.
        </div>
      </div>

      {/* Nodos privados */}
      <div style={caja}>
        <div style={tituloSeccion}><Lock size={16} /> Nodos privados</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 10 }}>
          Si una orden es de uno de estos nodos, el 🚨 urgente le llega <b>solo</b> a los números de ese nodo (no al grupo ni a los números de arriba).
        </div>
        {!tieneReglas && (
          <div style={{ fontSize: 12.5, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
            Falta agregar la columna <code>reglas_nodo</code> en Supabase para poder guardar nodos privados.
          </div>
        )}
        {reglas.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8", padding: "2px 0 10px" }}>Ningún nodo privado.</div>}
        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          {reglas.map((r, i) => (
            <ReglaNodo
              key={i}
              regla={r}
              onCambiar={(c) => cambiarRegla(i, c)}
              onQuitar={() => quitarRegla(i)}
              onProbar={() => void probar(r.nodo)}
              probando={probando}
              hayGrupo={!!grupoId}
              avisar={mostrarAviso}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={nuevoNodo} onChange={(e) => setNuevoNodo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregarRegla()} placeholder="Nodo, ej. Nod_01" style={{ ...input, width: 190 }} disabled={!tieneReglas} />
          <button type="button" onClick={agregarRegla} style={btnSecundario} disabled={!tieneReglas}><Plus size={15} /> Agregar nodo privado</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void guardar()} disabled={guardando || faltaTabla || !cambios} style={{ ...btnPrimario, opacity: guardando || faltaTabla || !cambios ? 0.55 : 1 }}>
          <Save size={16} /> {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
        <button type="button" onClick={() => void probar()} disabled={probando || faltaTabla} style={btnSecundario}>
          <Send size={15} /> {probando ? "Enviando…" : "Enviar prueba"}
        </button>
        {cambios && <span style={{ fontSize: 12.5, color: "#b45309", fontWeight: 600 }}>Tienes cambios sin guardar</span>}
      </div>

      {aviso && (
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: aviso.ok ? "#f0fdf4" : "#fef2f2", color: aviso.ok ? "#166534" : "#991b1b", border: `1px solid ${aviso.ok ? "#bbf7d0" : "#fecaca"}` }}>
          {aviso.texto}
        </div>
      )}

      <div style={{ ...caja, marginTop: 18, background: "#f8fafc", fontSize: 12.5, color: "#475569", lineHeight: 1.5 }}>
        <b>Cómo funciona:</b> los mensajes y fotos normales del chat solo llegan a la app. Únicamente cuando el técnico escribe algo y aprieta 🚨 <b>Urgente</b> se manda el WhatsApp
        (máximo uno por orden cada 10 minutos). Se contesta desde el chat de la orden, en la app o en la web.
      </div>
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

// Una regla de nodo privado: el nodo, sus numeros y si tambien avisa al grupo.
function ReglaNodo({ regla, onCambiar, onQuitar, onProbar, probando, hayGrupo, avisar }) {
  const [num, setNum] = useState("");
  const [nom, setNom] = useState("");
  const numeros = regla.numeros || [];
  const agregar = () => {
    const n = normalizarNumero(num);
    if (n.length < 11) return avisar("Escribe un celular válido (9 dígitos, ej. 989521677).", false);
    if (numeros.some((x) => normalizarNumero(x.numero) === n)) return avisar("Ese número ya está en este nodo.", false);
    onCambiar({ numeros: [...numeros, { numero: n, nombre: nom.trim() }] });
    setNum("");
    setNom("");
  };
  return (
    <div style={{ border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Lock size={15} color="#b45309" />
        <input value={regla.nodo} onChange={(e) => onCambiar({ nodo: e.target.value })} style={{ ...input, width: 130, padding: "6px 10px", fontWeight: 800 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: hayGrupo ? "#0f172a" : "#94a3b8" }}>
          <input type="checkbox" checked={!!regla.con_grupo} disabled={!hayGrupo} onChange={(e) => onCambiar({ con_grupo: e.target.checked })} />
          También avisar al grupo
        </label>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onProbar} disabled={probando} style={{ ...btnSecundario, padding: "6px 10px" }}><Send size={14} /> Probar</button>
        <button type="button" onClick={onQuitar} title="Quitar regla" style={{ ...btnIcono, color: "#dc2626" }}><Trash2 size={16} /></button>
      </div>
      {numeros.length === 0 && <div style={{ fontSize: 12.5, color: "#b45309", marginBottom: 8 }}>Sin números: las alertas de este nodo no llegarán a nadie.</div>}
      <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
        {numeros.map((x, k) => (
          <div key={`${x.numero}-${k}`} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "4px 6px 4px 12px" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a", minWidth: 140 }}>{formatoNumero(x.numero)}</span>
            <input value={x.nombre || ""} onChange={(e) => onCambiar({ numeros: numeros.map((y, j) => (j === k ? { ...y, nombre: e.target.value } : y)) })} placeholder="Nombre (opcional)" style={{ ...input, flex: 1, padding: "5px 10px" }} />
            <button type="button" onClick={() => onCambiar({ numeros: numeros.filter((_, j) => j !== k) })} title="Quitar" style={{ ...btnIcono, color: "#dc2626" }}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregar()} placeholder="Celular" style={{ ...input, width: 150, padding: "6px 10px" }} />
        <input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregar()} placeholder="Nombre (opcional)" style={{ ...input, flex: 1, minWidth: 120, padding: "6px 10px" }} />
        <button type="button" onClick={agregar} style={{ ...btnSecundario, padding: "6px 10px" }}><Plus size={14} /> Agregar número</button>
      </div>
    </div>
  );
}

const caja = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 14 };
const tituloSeccion = { display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 6 };
const input = { border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, outline: "none", background: "#fff", fontFamily: "inherit" };
const btnPrimario = { display: "inline-flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: 13.5, cursor: "pointer" };
const btnSecundario = { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#1e40af", border: "1px solid #bfdbfe", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnIcono = { background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex" };
