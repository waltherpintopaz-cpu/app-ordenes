import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

const META_BASE = "https://graph.facebook.com/v19.0";
const EMPRESAS = [
  { key: "americanet", label: "Americanet", color: "#0369a1", prefix: "amn_" },
  { key: "dim",        label: "DIM",        color: "#7c3aed", prefix: "dim_" },
];
const NODOS_MKW  = ["Nod_01", "Nod_03", "Nod_04"];
const CAMPOS_MAP = [
  { value: "nombre",       label: "Nombre del cliente" },
  { value: "dni",          label: "DNI / Cédula" },
  { value: "celular",      label: "Celular" },
  { value: "usuario_nodo", label: "Usuario nodo (PPPoE)" },
  { value: "nodo",         label: "Nodo" },
  { value: "fijo",         label: "Texto fijo..." },
];
const ESTADOS_FILTRO = [
  { value: "todos", label: "Todos los estados" },
  { value: "ACTIVO",      label: "Activo" },
  { value: "SUSPENDIDO",  label: "Suspendido" },
  { value: "INACTIVO",    label: "Inactivo" },
  { value: "DESCONOCIDO", label: "Sin estado" },
];

const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 4 };
const inp = { width: "100%", padding: "8px 11px", border: "1.5px solid #e2e8f0", borderRadius: 8,
  fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" };
const btnS = (bg, disabled) => ({
  padding: "8px 18px", background: disabled ? "#94a3b8" : bg, color: "#fff",
  border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700,
  cursor: disabled ? "default" : "pointer",
});

const extraerVars = (texto = "") => {
  const m = [...texto.matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(m.map(x => parseInt(x[1])))].sort((a, b) => a - b);
};

const getBodyText = (components = []) =>
  components?.find(c => c.type === "BODY")?.text || "";

const resolverVar = (map, n, cliente) => {
  const v = map[n] || {};
  if (v.tipo === "fijo") return v.texto || "";
  const campo = v.tipo || "nombre";
  if (!cliente) return `{{${n}}}`;
  if (campo === "celular") return cliente.celular || cliente.contacto || "";
  return String(cliente[campo] || "");
};

const normTelefono = (t) => {
  const n = String(t || "").replace(/\D/g, "");
  if (!n) return "";
  return n.startsWith("51") ? n : `51${n}`;
};

/* ══════════════════════════════════════════════════════════ */
export default function MetaEnvioMasivoPanel({ cfg }) {
  /* ── sender ── */
  const [empresa, setEmpresa]   = useState("americanet");
  const [wabaIdx, setWabaIdx]   = useState(0);
  const [phoneId, setPhoneId]   = useState("");

  /* ── plantilla ── */
  const [plantillas, setPlantillas]     = useState([]);
  const [loadingPl, setLoadingPl]       = useState(false);
  const [plantillaSelec, setPlantillaSelec] = useState("");
  const [plMsg, setPlMsg]               = useState("");

  /* ── variables mapping ── */
  const [mapVars, setMapVars] = useState({}); // { 1: {tipo:"nombre"}, 2: {tipo:"fijo",texto:""} }

  /* ── destinatarios ── */
  const [fuenteTab, setFuenteTab]   = useState("clientes"); // "clientes" | "manual"
  const [filtroNodo, setFiltroNodo] = useState("Nod_01");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda]     = useState("");
  const [clientes, setClientes]     = useState([]);
  const [loadingCli, setLoadingCli] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [numerosManual, setNumerosManual] = useState("");

  /* ── envío ── */
  const [enviando, setEnviando]   = useState(false);
  const [progreso, setProgreso]   = useState({ actual: 0, total: 0 });
  const [resultados, setResultados] = useState([]); // [{num,nombre,ok,msg}]
  const [enviMsg, setEnviMsg]     = useState("");

  const waba = cfg?.[empresa]?.wabas?.[wabaIdx];
  const prefix = EMPRESAS.find(e => e.key === empresa)?.prefix || "amn_";
  const plantillaObj = plantillas.find(p => p.name === plantillaSelec);
  const bodyText = getBodyText(plantillaObj?.components);
  const varsNums = extraerVars(bodyText);

  /* ── al cambiar empresa/waba, resetear ── */
  useEffect(() => {
    setPlantillas([]); setPlantillaSelec(""); setPlMsg("");
    setPhoneId(waba?.numeros?.[0]?.id || "");
  }, [empresa, wabaIdx, waba]);

  /* ── cargar plantillas ── */
  const cargarPlantillas = useCallback(async () => {
    if (!waba?.waba_id || !waba?.token)
      return setPlMsg("Configura WABA ID y Token en Configuración.");
    setLoadingPl(true); setPlMsg("");
    try {
      const res = await fetch(
        `${META_BASE}/${waba.waba_id}/message_templates?fields=id,name,language,category,status,components&limit=200&access_token=${waba.token}`
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setPlantillas((json.data || []).filter(p => p.status === "APPROVED" && p.name.startsWith(prefix)));
    } catch (e) { setPlMsg("Error: " + e.message); }
    finally { setLoadingPl(false); }
  }, [waba, prefix]);

  /* ── cargar clientes ── */
  const cargarClientes = useCallback(async () => {
    setLoadingCli(true);
    let q = supabase.from("clientes")
      .select("id,nombre,dni,celular,contacto,nodo,usuario_nodo,estado_servicio")
      .eq("nodo", filtroNodo)
      .order("nombre", { ascending: true });
    if (filtroEstado !== "todos") q = q.eq("estado_servicio", filtroEstado);
    const { data } = await q;
    setClientes(data || []);
    setSeleccionados(new Set((data || []).filter(c => c.celular || c.contacto).map(c => c.id)));
    setLoadingCli(false);
  }, [filtroNodo, filtroEstado]);

  useEffect(() => { if (fuenteTab === "clientes") cargarClientes(); }, [fuenteTab, cargarClientes]);

  /* ── filtro búsqueda en memoria ── */
  const clientesFilt = clientes.filter(c => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (c.nombre || "").toLowerCase().includes(q) ||
           (c.dni || "").includes(q) ||
           (c.celular || "").includes(q);
  });

  const toggleTodos = () => {
    if (seleccionados.size === clientesFilt.filter(c => c.celular || c.contacto).length)
      setSeleccionados(new Set());
    else
      setSeleccionados(new Set(clientesFilt.filter(c => c.celular || c.contacto).map(c => c.id)));
  };

  /* ── construir lista de destinatarios final ── */
  const buildDestinatarios = () => {
    if (fuenteTab === "clientes") {
      return clientesFilt
        .filter(c => seleccionados.has(c.id))
        .map(c => ({
          id: c.id,
          nombre: c.nombre || "",
          telefono: normTelefono(c.celular || c.contacto),
          cliente: c,
        }))
        .filter(d => d.telefono);
    }
    // manual: "51999888777" o "51999888777|Nombre"
    return numerosManual.split("\n")
      .map(l => l.trim()).filter(Boolean)
      .map((l, i) => {
        const [num, nombre = ""] = l.split("|");
        return { id: `m${i}`, nombre: nombre.trim() || num.trim(), telefono: normTelefono(num.trim()), cliente: { nombre: nombre.trim() || num.trim() } };
      })
      .filter(d => d.telefono);
  };

  /* ── vista previa ── */
  const primerDest = buildDestinatarios()[0];
  const previewTexto = bodyText
    ? bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => resolverVar(mapVars, parseInt(n), primerDest?.cliente))
    : "";

  /* ── enviar ── */
  const enviarMasivo = async () => {
    const destinatarios = buildDestinatarios();
    if (!plantillaSelec)   return setEnviMsg("Selecciona una plantilla.");
    if (!phoneId)          return setEnviMsg("Selecciona el número emisor.");
    if (!destinatarios.length) return setEnviMsg("No hay destinatarios con número válido.");
    if (!waba?.token)      return setEnviMsg("Configura las credenciales del WABA.");

    const numeroEmisor = waba.numeros?.find(n => n.id === phoneId);
    if (!numeroEmisor?.phone_number_id) return setEnviMsg("Número emisor sin Phone Number ID.");

    const confirmar = window.confirm(
      `Se enviarán ${destinatarios.length} mensajes usando la plantilla "${plantillaSelec}".\n¿Continuar?`
    );
    if (!confirmar) return;

    setEnviando(true); setEnviMsg(""); setResultados([]);
    setProgreso({ actual: 0, total: destinatarios.length });

    let ok = 0, err = 0;
    const res = [];

    for (let i = 0; i < destinatarios.length; i++) {
      const d = destinatarios[i];
      setProgreso({ actual: i + 1, total: destinatarios.length });

      const components = varsNums.length > 0 ? [{
        type: "body",
        parameters: varsNums.map(n => ({
          type: "text",
          text: resolverVar(mapVars, n, d.cliente) || `{{${n}}}`,
        })),
      }] : [];

      try {
        const response = await fetch(`${META_BASE}/${numeroEmisor.phone_number_id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${waba.token}` },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: d.telefono,
            type: "template",
            template: {
              name: plantillaSelec,
              language: { code: plantillaObj?.language || "es" },
              ...(components.length > 0 ? { components } : {}),
            },
          }),
        });
        const json = await response.json();
        if (json.error) throw new Error(json.error.message);
        ok++;
        res.push({ num: d.telefono, nombre: d.nombre, ok: true, msg: "" });
      } catch (e) {
        err++;
        res.push({ num: d.telefono, nombre: d.nombre, ok: false, msg: e.message });
      }
      setResultados([...res]);
      await new Promise(r => setTimeout(r, 200));
    }

    setEnviando(false);
    setEnviMsg(`✓ Listo — ${ok} enviados, ${err} errores de ${destinatarios.length} mensajes.`);
  };

  const totalDest = buildDestinatarios().length;

  /* ════ RENDER ════ */
  return (
    <div style={{ display: "grid", gap: 18 }}>

      {/* ── 1. CONFIGURACIÓN EMISOR + PLANTILLA ── */}
      <div style={card}>
        <p style={secTitle}>① Emisor y plantilla</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>

          {/* Empresa */}
          <div>
            <label style={lbl}>Empresa</label>
            <div style={{ display: "flex", gap: 6 }}>
              {EMPRESAS.map(e => (
                <button key={e.key} onClick={() => { setEmpresa(e.key); setWabaIdx(0); }}
                  style={{ flex: 1, padding: "7px 10px", fontSize: 12, fontWeight: 700, borderRadius: 8,
                    border: "none", cursor: "pointer",
                    background: empresa === e.key ? e.color : "#f1f5f9",
                    color: empresa === e.key ? "#fff" : "#64748b" }}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* WABA */}
          {(cfg?.[empresa]?.wabas?.length || 0) > 1 && (
            <div>
              <label style={lbl}>WABA</label>
              <select value={wabaIdx} onChange={e => setWabaIdx(Number(e.target.value))}
                style={{ ...inp, cursor: "pointer" }}>
                {cfg[empresa].wabas.map((w, i) => {
                  const nums = (w.numeros || []).map(n => n.nombre).filter(Boolean).join(", ");
                  return <option key={w.id} value={i}>WABA {i + 1}{nums ? ` — ${nums}` : w.waba_id ? ` — ${w.waba_id}` : ""}</option>;
                })}
              </select>
            </div>
          )}

          {/* Número emisor */}
          <div>
            <label style={lbl}>Número emisor</label>
            {(waba?.numeros?.length || 0) === 0 ? (
              <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>Sin números configurados.</p>
            ) : (
              <select value={phoneId} onChange={e => setPhoneId(e.target.value)}
                style={{ ...inp, cursor: "pointer" }}>
                <option value="">— Seleccionar —</option>
                {waba.numeros.map(n => (
                  <option key={n.id} value={n.id}>{n.nombre || n.numero || n.phone_number_id}</option>
                ))}
              </select>
            )}
          </div>

          {/* Plantilla */}
          <div>
            <label style={lbl}>Plantilla (solo APROBADAS)</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={plantillaSelec} onChange={e => { setPlantillaSelec(e.target.value); setMapVars({}); }}
                style={{ ...inp, cursor: "pointer", flex: 1 }}>
                <option value="">— Cargar plantillas primero —</option>
                {plantillas.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <button onClick={cargarPlantillas} disabled={loadingPl}
                style={{ ...btnS("#0369a1", loadingPl), padding: "8px 12px", whiteSpace: "nowrap" }}>
                {loadingPl ? "..." : "🔄"}
              </button>
            </div>
            {plMsg && <p style={{ fontSize: 11, margin: "4px 0 0", color: "#dc2626" }}>{plMsg}</p>}
          </div>
        </div>

        {/* Vista previa plantilla */}
        {bodyText && (
          <div style={{ marginTop: 12, background: "#f0f9ff", borderRadius: 10, padding: "10px 14px", border: "1px solid #bae6fd" }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#0369a1" }}>Mensaje plantilla:</p>
            <p style={{ margin: 0, fontSize: 12, color: "#0f172a", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{bodyText}</p>
          </div>
        )}
      </div>

      {/* ── 2. MAPEO DE VARIABLES ── */}
      {varsNums.length > 0 && (
        <div style={card}>
          <p style={secTitle}>② Variables del mensaje</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
            Configura qué dato del cliente se usa para cada variable. "Texto fijo" aplica igual para todos.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {varsNums.map(n => {
              const v = mapVars[n] || { tipo: "nombre" };
              return (
                <div key={n} style={{ background: "#fffbeb", borderRadius: 10, padding: "12px 14px", border: "1px solid #fcd34d" }}>
                  <label style={{ ...lbl, color: "#92400e" }}>{`{{${n}}}`} — usar:</label>
                  <select value={v.tipo} onChange={e => setMapVars(mv => ({ ...mv, [n]: { ...v, tipo: e.target.value } }))}
                    style={{ ...inp, cursor: "pointer", marginBottom: v.tipo === "fijo" ? 8 : 0 }}>
                    {CAMPOS_MAP.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {v.tipo === "fijo" && (
                    <input value={v.texto || ""} onChange={e => setMapVars(mv => ({ ...mv, [n]: { ...v, texto: e.target.value } }))}
                      placeholder="Texto que irá en todos los mensajes" style={inp} />
                  )}
                </div>
              );
            })}
          </div>
          {previewTexto && primerDest && (
            <div style={{ marginTop: 12, background: "#f0fdf4", borderRadius: 10, padding: "10px 14px", border: "1px solid #86efac" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#16a34a" }}>
                Vista previa con: {primerDest.nombre || primerDest.telefono}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#0f172a", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{previewTexto}</p>
            </div>
          )}
        </div>
      )}

      {/* ── 3. DESTINATARIOS ── */}
      <div style={card}>
        <p style={secTitle}>③ Destinatarios</p>

        {/* Tab fuente */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #f1f5f9" }}>
          {[{ key: "clientes", label: "👥 Desde clientes" }, { key: "manual", label: "✏ Números manuales" }].map(t => (
            <button key={t.key} onClick={() => setFuenteTab(t.key)}
              style={{ padding: "7px 16px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                borderBottom: fuenteTab === t.key ? "2px solid #2563eb" : "2px solid transparent",
                background: "none", color: fuenteTab === t.key ? "#2563eb" : "#64748b", marginBottom: -2 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Clientes */}
        {fuenteTab === "clientes" && (
          <div>
            {/* Filtros */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "flex-end" }}>
              <div>
                <label style={lbl}>Nodo</label>
                <select value={filtroNodo} onChange={e => setFiltroNodo(e.target.value)}
                  style={{ ...inp, width: "auto", cursor: "pointer" }}>
                  {NODOS_MKW.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Estado</label>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                  style={{ ...inp, width: "auto", cursor: "pointer" }}>
                  {ESTADOS_FILTRO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={lbl}>Buscar</label>
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Nombre, DNI, celular..." style={inp} />
              </div>
              <button onClick={cargarClientes} disabled={loadingCli}
                style={{ ...btnS("#0369a1", loadingCli), padding: "8px 14px" }}>
                {loadingCli ? "Cargando..." : "🔄 Recargar"}
              </button>
            </div>

            {/* Resumen selección */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: "#475569", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox"
                  checked={seleccionados.size > 0 && seleccionados.size === clientesFilt.filter(c => c.celular || c.contacto).length}
                  onChange={toggleTodos} />
                Seleccionar todos ({clientesFilt.filter(c => c.celular || c.contacto).length} con número)
              </label>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#2563eb" }}>
                {seleccionados.size} seleccionados
              </span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {clientes.filter(c => !c.celular && !c.contacto).length > 0 &&
                  `(${clientes.filter(c => !c.celular && !c.contacto).length} sin número)`}
              </span>
            </div>

            {/* Tabla */}
            {loadingCli ? (
              <p style={{ color: "#64748b", fontSize: 13, padding: "20px 0" }}>Cargando clientes...</p>
            ) : clientesFilt.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: 13, padding: "20px 0" }}>
                No hay clientes en {filtroNodo} {filtroEstado !== "todos" ? `con estado ${filtroEstado}` : ""}.
              </p>
            ) : (
              <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
                    <tr>
                      {["", "Nombre", "DNI", "Celular", "Usuario nodo", "Estado"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700,
                          fontSize: 11, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientesFilt.map(c => {
                      const tieneTel = !!(c.celular || c.contacto);
                      const sel = seleccionados.has(c.id);
                      return (
                        <tr key={c.id}
                          style={{ borderBottom: "1px solid #f1f5f9", background: sel ? "#eff6ff" : "#fff",
                            opacity: tieneTel ? 1 : 0.45 }}
                          onClick={() => {
                            if (!tieneTel) return;
                            setSeleccionados(s => { const ns = new Set(s); ns.has(c.id) ? ns.delete(c.id) : ns.add(c.id); return ns; });
                          }}>
                          <td style={{ padding: "7px 12px" }}>
                            <input type="checkbox" checked={sel} readOnly disabled={!tieneTel}
                              style={{ cursor: tieneTel ? "pointer" : "default" }} />
                          </td>
                          <td style={{ padding: "7px 12px", fontWeight: 600, color: "#0f172a" }}>{c.nombre || "—"}</td>
                          <td style={{ padding: "7px 12px", fontFamily: "monospace", color: "#475569" }}>{c.dni || "—"}</td>
                          <td style={{ padding: "7px 12px", color: tieneTel ? "#0f172a" : "#e11d48" }}>
                            {c.celular || c.contacto || "Sin número"}
                          </td>
                          <td style={{ padding: "7px 12px", fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{c.usuario_nodo || "—"}</td>
                          <td style={{ padding: "7px 12px" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                              background: c.estado_servicio === "ACTIVO" ? "#f0fdf4" : c.estado_servicio === "SUSPENDIDO" ? "#fff7ed" : "#f8fafc",
                              color: c.estado_servicio === "ACTIVO" ? "#16a34a" : c.estado_servicio === "SUSPENDIDO" ? "#ea580c" : "#94a3b8",
                              border: `1px solid ${c.estado_servicio === "ACTIVO" ? "#86efac" : c.estado_servicio === "SUSPENDIDO" ? "#fdba74" : "#e2e8f0"}` }}>
                              {c.estado_servicio || "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Manual */}
        {fuenteTab === "manual" && (
          <div>
            <label style={lbl}>
              Números de destino — uno por línea.
              Formato: <code style={{ background: "#f1f5f9", borderRadius: 4, padding: "1px 5px" }}>51999888777</code> o{" "}
              <code style={{ background: "#f1f5f9", borderRadius: 4, padding: "1px 5px" }}>51999888777|Juan Pérez</code>
            </label>
            <textarea value={numerosManual} onChange={e => setNumerosManual(e.target.value)}
              rows={10} placeholder={"51951234567|Juan Pérez\n51961234567|María García\n51971234567"}
              style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.7 }} />
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
              {buildDestinatarios().length} números válidos detectados
            </p>
          </div>
        )}
      </div>

      {/* ── 4. ENVIAR ── */}
      <div style={card}>
        <p style={secTitle}>④ Enviar</p>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ background: "#f0f9ff", borderRadius: 10, padding: "10px 18px", border: "1px solid #bae6fd" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0369a1" }}>{totalDest}</span>
            <span style={{ fontSize: 12, color: "#0369a1", marginLeft: 6 }}>destinatarios listos</span>
          </div>
          <button onClick={enviarMasivo}
            disabled={enviando || !plantillaSelec || !phoneId || totalDest === 0}
            style={{ ...btnS("#16a34a", enviando || !plantillaSelec || !phoneId || totalDest === 0),
              padding: "10px 28px", fontSize: 13 }}>
            {enviando ? `Enviando ${progreso.actual}/${progreso.total}...` : `📨 Enviar ${totalDest} mensajes`}
          </button>
        </div>

        {/* Barra de progreso */}
        {enviando && progreso.total > 0 && (
          <div style={{ background: "#e2e8f0", borderRadius: 99, height: 8, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "#2563eb", borderRadius: 99, width: `${(progreso.actual / progreso.total) * 100}%`, transition: "width 0.3s" }} />
          </div>
        )}

        {enviMsg && (
          <p style={{ fontSize: 13, fontWeight: 700, color: enviMsg.startsWith("✓") ? "#16a34a" : "#dc2626",
            background: enviMsg.startsWith("✓") ? "#f0fdf4" : "#fff1f2",
            borderRadius: 8, padding: "10px 14px", border: `1px solid ${enviMsg.startsWith("✓") ? "#86efac" : "#fca5a5"}`,
            margin: "0 0 12px" }}>
            {enviMsg}
          </p>
        )}

        {/* Resultados */}
        {resultados.length > 0 && (
          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8fafc" }}>
                <tr>
                  {["Estado", "Número", "Nombre", "Detalle"].map(h => (
                    <th key={h} style={{ padding: "7px 12px", textAlign: "left", fontWeight: 700,
                      fontSize: 11, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultados.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: r.ok ? "#fff" : "#fff1f2" }}>
                    <td style={{ padding: "6px 12px" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: r.ok ? "#16a34a" : "#e11d48" }}>
                        {r.ok ? "✓" : "✗"}
                      </span>
                    </td>
                    <td style={{ padding: "6px 12px", fontFamily: "monospace", color: "#475569" }}>{r.num}</td>
                    <td style={{ padding: "6px 12px", color: "#0f172a" }}>{r.nombre || "—"}</td>
                    <td style={{ padding: "6px 12px", color: r.ok ? "#64748b" : "#dc2626", fontSize: 11 }}>
                      {r.ok ? "Enviado" : r.msg}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const card = {
  background: "#fff", borderRadius: 16, border: "1px solid #e8edf5",
  boxShadow: "0 1px 8px rgba(15,23,42,0.05)", padding: "18px 22px",
};
const secTitle = {
  margin: "0 0 14px", fontWeight: 800, fontSize: 15, color: "#0f172a",
};
