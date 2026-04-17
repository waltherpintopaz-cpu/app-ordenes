import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

const DIAGNO_BASE = import.meta.env.PROD
  ? "https://amnet-diagno.0lthka.easypanel.host"
  : "";

const MKW_TOKEN     = "LzNXSERnUHBMMS91b0NzUGFTVkFkZz09";
const MKW_NOD04_TOKEN = "THlaZzQ2UEQ2dHEyUjFBTkdIQ2UzUT09";

const NODOS = [
  { key: "Nod_01", label: "Nod_01", color: "#0369a1", api: "americanet" },
  { key: "Nod_03", label: "Nod_03", color: "#0891b2", api: "americanet" },
  { key: "Nod_04", label: "Nod_04 (DimFiber)", color: "#7c3aed", api: "dimfiber" },
];

const ESTADO_LABELS = {
  activo:      { label: "Activo",      bg: "#f0fdf4", color: "#16a34a", border: "#86efac" },
  suspendido:  { label: "Suspendido",  bg: "#fff7ed", color: "#ea580c", border: "#fdba74" },
  moroso:      { label: "Moroso",      bg: "#fff1f2", color: "#e11d48", border: "#fda4af" },
  cortado:     { label: "Cortado",     bg: "#fff1f2", color: "#be123c", border: "#fecdd3" },
  retirado:    { label: "Retirado",    bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" },
  desconocido: { label: "Desconocido", bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0" },
};

const normalizarEstado = (raw = "") => {
  const r = String(raw).toLowerCase().trim();
  if (r.includes("activo") || r === "active" || r === "1" || r === "true") return "activo";
  if (r.includes("suspend") || r.includes("suspendid")) return "suspendido";
  if (r.includes("moroso") || r.includes("moros")) return "moroso";
  if (r.includes("cortado") || r.includes("cortad") || r.includes("cut")) return "cortado";
  if (r.includes("retir") || r.includes("baja")) return "retirado";
  if (r === "") return "desconocido";
  return r;
};

const badgeEstado = (estadoRaw) => {
  const estado = normalizarEstado(estadoRaw || "");
  const s = ESTADO_LABELS[estado] || { label: estado, bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
};

const mkFetchAmericanet = async (cedula) => {
  const url = `${DIAGNO_BASE}/api/mikrowisp/GetClientsDetails`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: MKW_TOKEN, cedula }),
  });
  return res.json().catch(() => ({}));
};

const mkFetchDimfiber = async (cedula) => {
  const url = `${DIAGNO_BASE}/api/mikrowisp-nod04/GetClientsDetails`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: MKW_NOD04_TOKEN, cedula }),
  });
  return res.json().catch(() => ({}));
};

const consultarMkw = async (cedula, apiTipo) => {
  const json = apiTipo === "dimfiber"
    ? await mkFetchDimfiber(cedula)
    : await mkFetchAmericanet(cedula);

  const exito = json?.estado === "exito" || json?.success === true || json?.estado === true;
  if (!exito && json?.estado !== undefined)
    throw new Error(json?.mensaje || json?.message || "No encontrado");

  const raw = json?.datos?.[0] ?? json?.data ?? json ?? {};
  const estadoRaw = raw?.estado ?? raw?.status ?? raw?.service_status ?? "";
  const servicios  = Array.isArray(raw?.servicios) ? raw.servicios : [];
  const estadoServicio = servicios?.[0]?.estado ?? estadoRaw;

  return {
    estado_mikrowisp: String(estadoRaw || "").trim(),
    estado_servicio:  normalizarEstado(estadoServicio || estadoRaw),
    nombre_mkw:       String(raw?.nombre ?? raw?.name ?? "").trim(),
  };
};

/* ══════════════════════════════════════════════ */
export default function MkwEstadoPanel() {
  const [nodoActivo, setNodoActivo] = useState("Nod_01");
  const [clientes, setClientes]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda]     = useState("");
  const [syncRow, setSyncRow]       = useState({});   // { clienteId: "loading"|"ok"|"err" }
  const [syncMsg, setSyncMsg]       = useState({});   // { clienteId: string }
  const [sincronizando, setSincronizando] = useState(false);
  const [progreso, setProgreso]     = useState("");

  const nodoInfo = NODOS.find(n => n.key === nodoActivo);

  /* ── cargar clientes del nodo desde Supabase ── */
  const cargarClientes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id,nombre,dni,nodo,estado_servicio,estado_mikrowisp,estado_actualizado_at,celular,contacto,usuario_nodo")
      .eq("nodo", nodoActivo)
      .order("nombre", { ascending: true });
    setLoading(false);
    if (!error) setClientes(data || []);
  }, [nodoActivo]);

  useEffect(() => {
    setClientes([]);
    setFiltroEstado("todos");
    setBusqueda("");
    setSyncRow({});
    setSyncMsg({});
    setProgreso("");
    cargarClientes();
  }, [cargarClientes]);

  /* ── sincronizar un cliente ── */
  const syncUno = async (cliente) => {
    const dni = String(cliente.dni || "").replace(/\D/g, "").trim();
    if (!dni) return;
    const id = cliente.id;
    setSyncRow(p => ({ ...p, [id]: "loading" }));
    setSyncMsg(p => ({ ...p, [id]: "" }));
    try {
      const { estado_mikrowisp, estado_servicio } = await consultarMkw(dni, nodoInfo.api);
      const now = new Date().toISOString();

      // Intentar update completo
      let { error } = await supabase.from("clientes").update({
        estado_servicio,
        estado_mikrowisp,
        estado_actualizado_at: now,
        estado_sync_fuente: "web_manual",
        estado_sync_pendiente: false,
        estado_sync_error: "",
      }).eq("id", id);

      // Si falla por columnas inexistentes, intentar solo estado_servicio
      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("column") || msg.includes("does not exist")) {
          const { error: error2 } = await supabase.from("clientes")
            .update({ estado_servicio })
            .eq("id", id);
          if (error2) throw new Error(error2.message);
        } else {
          throw new Error(error.message);
        }
      }

      setClientes(prev => prev.map(c =>
        c.id === id
          ? { ...c, estado_servicio, estado_mikrowisp, estado_actualizado_at: now }
          : c
      ));
      setSyncRow(p => ({ ...p, [id]: "ok" }));
      return true;
    } catch (e) {
      setSyncRow(p => ({ ...p, [id]: "err" }));
      setSyncMsg(p => ({ ...p, [id]: e.message || "Error" }));
      return false;
    }
  };

  /* ── sincronizar todo el nodo ── */
  const syncNodo = async () => {
    const conDni = clientes.filter(c => String(c.dni || "").replace(/\D/g, "").length >= 5);
    if (!conDni.length) { setProgreso("No hay clientes con DNI en este nodo."); return; }
    if (!window.confirm(`Se consultará MikroWisp para ${conDni.length} clientes del ${nodoActivo}. ¿Continuar?`)) return;
    setSincronizando(true);
    let ok = 0, err = 0;
    for (let i = 0; i < conDni.length; i++) {
      const c = conDni[i];
      setProgreso(`Consultando ${i + 1}/${conDni.length} — ${c.nombre || c.dni}...`);
      const resultado = await syncUno(c);
      if (resultado) ok++; else err++;
      await new Promise(r => setTimeout(r, 280));
    }
    setSincronizando(false);
    setProgreso(`✓ Listo — ${ok} guardados, ${err} errores de ${conDni.length} consultados.`);
  };

  /* ── filtros ── */
  const clientesFiltrados = clientes.filter(c => {
    const estado = normalizarEstado(c.estado_servicio || "");
    if (filtroEstado !== "todos" && estado !== filtroEstado) return false;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      return (c.nombre || "").toLowerCase().includes(q) || (c.dni || "").includes(q) || (c.usuario_nodo || "").toLowerCase().includes(q);
    }
    return true;
  });

  /* ── estadísticas ── */
  const stats = clientes.reduce((acc, c) => {
    const e = normalizarEstado(c.estado_servicio || "");
    acc.total++;
    acc[e] = (acc[e] || 0) + 1;
    return acc;
  }, { total: 0 });

  const fechaFormato = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
      " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  };

  /* ════ RENDER ════ */
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e8edf5",
        boxShadow: "0 2px 16px rgba(15,23,42,0.06)", padding: "22px 26px" }}>

        <div style={{ marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            Estado clientes MikroWisp
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>
            Consulta y actualización de estado por nodo (Americanet / DimFiber)
          </p>
        </div>

        {/* Selector de nodo */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          {NODOS.map(n => (
            <button key={n.key} onClick={() => setNodoActivo(n.key)}
              style={{ padding: "7px 20px", fontSize: 13, fontWeight: 700, borderRadius: 9, border: "none",
                cursor: "pointer", background: nodoActivo === n.key ? n.color : "#f1f5f9",
                color: nodoActivo === n.key ? "#fff" : "#64748b" }}>
              {n.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        {clientes.length > 0 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "Total", val: stats.total, bg: "#f1f5f9", color: "#0f172a" },
              { label: "Activos", val: stats.activo || 0, bg: "#f0fdf4", color: "#16a34a" },
              { label: "Suspendidos", val: stats.suspendido || 0, bg: "#fff7ed", color: "#ea580c" },
              { label: "Morosos", val: stats.moroso || 0, bg: "#fff1f2", color: "#e11d48" },
              { label: "Sin estado", val: stats.desconocido || 0, bg: "#f8fafc", color: "#94a3b8" },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "8px 16px",
                textAlign: "center", minWidth: 80, border: `1px solid ${s.bg}` }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Controles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          {/* Busqueda */}
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar nombre, DNI, usuario..."
            style={{ padding: "7px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8,
              fontSize: 13, outline: "none", width: 220 }} />

          {/* Filtro estado */}
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            style={{ padding: "7px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8,
              fontSize: 12, cursor: "pointer", outline: "none", background: "#fff" }}>
            <option value="todos">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido</option>
            <option value="moroso">Moroso</option>
            <option value="cortado">Cortado</option>
            <option value="retirado">Retirado</option>
            <option value="desconocido">Sin estado</option>
          </select>

          {/* Recargar */}
          <button onClick={cargarClientes} disabled={loading}
            style={{ padding: "7px 14px", background: "#0369a1", color: "#fff", border: "none",
              borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Cargando..." : "🔄 Recargar lista"}
          </button>

          {/* Sincronizar nodo completo */}
          <button onClick={syncNodo} disabled={sincronizando || loading || clientes.length === 0}
            style={{ padding: "7px 16px", background: sincronizando ? "#64748b" : nodoInfo?.color || "#6366f1",
              color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {sincronizando ? "Sincronizando..." : `⚡ Sincronizar ${nodoActivo}`}
          </button>
        </div>

        {/* Progreso */}
        {progreso && (
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 12,
            color: progreso.startsWith("✓") ? "#16a34a" : "#0369a1",
            background: progreso.startsWith("✓") ? "#f0fdf4" : "#f0f9ff",
            borderRadius: 8, padding: "8px 12px", border: `1px solid ${progreso.startsWith("✓") ? "#86efac" : "#bae6fd"}` }}>
            {progreso}
          </p>
        )}

        {/* Tabla */}
        {loading ? (
          <p style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: "30px 0" }}>Cargando clientes...</p>
        ) : clientes.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "30px 0" }}>
            No hay clientes registrados en {nodoActivo}.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}>
              Mostrando {clientesFiltrados.length} de {clientes.length} clientes
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    {["Nombre", "DNI", "Celular", "Usuario nodo", "Estado DB", "Estado MkW", "Actualizado", "Acción"].map(h => (
                      <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700,
                        fontSize: 11, color: "#475569", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map(c => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9",
                      background: syncRow[c.id] === "ok" ? "#f0fdf4" : syncRow[c.id] === "err" ? "#fff1f2" : "#fff" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.nombre || "—"}
                      </td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "#475569" }}>
                        {c.dni || "—"}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 12, color: "#0f172a" }}>
                        {c.celular || c.contacto || "—"}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                        {c.usuario_nodo || "—"}
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        {badgeEstado(c.estado_servicio)}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 11, color: "#94a3b8" }}>
                        {c.estado_mikrowisp ? (
                          <span style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6,
                            padding: "2px 7px", fontFamily: "monospace", fontSize: 10 }}>
                            {c.estado_mikrowisp}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {fechaFormato(c.estado_actualizado_at)}
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        {syncRow[c.id] === "loading" ? (
                          <span style={{ fontSize: 11, color: "#64748b" }}>...</span>
                        ) : syncRow[c.id] === "ok" ? (
                          <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>✓</span>
                        ) : (
                          <div>
                            <button onClick={() => syncUno(c)}
                              disabled={!c.dni || sincronizando}
                              style={{ padding: "4px 10px", background: c.dni ? "#eff6ff" : "#f8fafc",
                                color: c.dni ? "#2563eb" : "#94a3b8", border: "1px solid " + (c.dni ? "#bfdbfe" : "#e2e8f0"),
                                borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: c.dni ? "pointer" : "default",
                                whiteSpace: "nowrap" }}>
                              {c.dni ? "Actualizar" : "Sin DNI"}
                            </button>
                            {syncRow[c.id] === "err" && syncMsg[c.id] && (
                              <div style={{ fontSize: 10, color: "#e11d48", marginTop: 2, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {syncMsg[c.id]}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
