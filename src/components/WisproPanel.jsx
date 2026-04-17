import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

const WISPRO_BASE = "https://www.cloud.wispro.co/api/v1";
const META_BASE   = "https://graph.facebook.com/v19.0";
const DIAGNO_BASE = import.meta.env.PROD
  ? "https://amnet-diagno.0lthka.easypanel.host" : "";

/* ── estilos base ── */
const lbl  = { display:"block", fontSize:11, fontWeight:700, color:"#475569", marginBottom:4 };
const inp  = { width:"100%", padding:"8px 11px", border:"1.5px solid #e2e8f0", borderRadius:8,
               fontSize:13, outline:"none", boxSizing:"border-box", background:"#fff" };
const card = { background:"#fff", borderRadius:16, border:"1px solid #e8edf5",
               boxShadow:"0 1px 8px rgba(15,23,42,0.05)", padding:"18px 22px", marginBottom:16 };
const btnS = (bg, dis) => ({ padding:"8px 18px", background: dis?"#94a3b8":bg, color:"#fff",
               border:"none", borderRadius:9, fontSize:12, fontWeight:700,
               cursor: dis?"default":"pointer" });

const TIPOS_MSG = [
  { key:"bienvenida",   label:"Bienvenida",   icon:"👋", desc:"Al registrar un cliente nuevo o envío manual" },
  { key:"recordatorio", label:"Recordatorio", icon:"🔔", desc:"Días después del vencimiento (configurable)" },
  { key:"suspension",   label:"Suspensión",   icon:"⛔", desc:"Cuando WisPro marca el contrato como suspendido" },
];

const normTel = (t="") => { const n=String(t).replace(/\D/g,""); if(!n) return ""; return n.startsWith("51")?n:`51${n}`; };
const fmtFecha = (iso) => { if(!iso) return "—"; const d=new Date(iso); return d.toLocaleDateString("es-PE",{day:"2-digit",month:"2-digit",year:"2-digit"})+" "+d.toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}); };
const resultColor = (r) => ({ enviado:"#16a34a", saltado_pago:"#d97706", saltado_optout:"#64748b", duplicado:"#94a3b8", error:"#dc2626" }[r] || "#64748b");

/* ════════════════════════════════════════════════ */
export default function WisproPanel() {
  const [tab, setTab] = useState("config");

  /* ── config ── */
  const [cfg, setCfg]           = useState(null);
  const [metaCfg, setMetaCfg]   = useState(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgMsg, setCfgMsg]     = useState("");
  const [testando, setTestando] = useState(false);
  const [testMsg, setTestMsg]   = useState("");

  /* ── clientes wispro ── */
  const [contratos, setContratos]       = useState([]);
  const [loadingCon, setLoadingCon]     = useState(false);
  const [conMsg, setConMsg]             = useState("");
  const [clientesCfg, setClientesCfg]  = useState({}); // { contrato_id: row }
  const [busqCon, setBusqCon]           = useState("");
  const [filtroCon, setFiltroCon]       = useState("todos");
  const [savingCli, setSavingCli]       = useState({});

  /* ── bienvenida manual ── */
  const [bienContrato, setBienContrato] = useState(null);
  const [bienBuscando, setBienBuscando] = useState(false);
  const [bienMsg, setBienMsg]           = useState("");
  const [enviandoBien, setEnviandoBien] = useState(false);

  /* ── historial ── */
  const [logs, setLogs]         = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFiltroTipo, setLogFiltroTipo] = useState("todos");
  const [logFiltroRes,  setLogFiltroRes]  = useState("todos");
  const [logPage, setLogPage]   = useState(0);
  const LOG_PAGE_SIZE = 50;

  /* ── cargar config ── */
  useEffect(() => {
    supabase.from("wispro_config").select("*").eq("id",1).maybeSingle()
      .then(({data}) => setCfg(data || {
        id:1, api_token:"09ba7595-964f-4fa1-a924-10353372e9a5", activo:true,
        waba_empresa:"dim", waba_idx:0, phone_numero_id_key:"",
        plantilla_bienvenida:"dim_bienvenida",
        plantilla_recordatorio:"dim_recordatorio_deuda",
        plantilla_suspension:"dim_aviso_suspension",
        bienvenida_activa:true, recordatorio_activo:true, suspension_activa:true,
        recordatorio_dias:[2,5,7], num_recordatorios:3,
      }));
    supabase.from("meta_wa_config").select("config_json").eq("id",1).maybeSingle()
      .then(({data}) => setMetaCfg(data?.config_json || {}));
  }, []);

  const getWaba = () => {
    if (!metaCfg || !cfg) return null;
    return metaCfg[cfg.waba_empresa]?.wabas?.[cfg.waba_idx] || null;
  };
  const getPhone = () => {
    const waba = getWaba();
    if (!waba) return null;
    return waba.numeros?.find(n => n.id === cfg.phone_numero_id_key) || waba.numeros?.[0] || null;
  };

  /* ── guardar config ── */
  const guardarConfig = async () => {
    setSavingCfg(true); setCfgMsg("");
    const { error } = await supabase.from("wispro_config")
      .upsert({ ...cfg, updated_at: new Date().toISOString() });
    setSavingCfg(false);
    setCfgMsg(error ? "Error: "+error.message : "✓ Configuración guardada");
  };

  /* ── probar API WisPro ── */
  const probarApi = async () => {
    if (!cfg?.api_token) return setTestMsg("Ingresa el API Token.");
    setTestando(true); setTestMsg("");
    try {
      const res = await fetch(`${DIAGNO_BASE}/api/wispro/contracts?per_page=1`, {
        headers: { Authorization: `Token ${cfg.api_token}`, Accept: "application/json" },
      });
      if (res.status === 401) throw new Error("Token inválido o sin permisos");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const total = json?.meta?.total_count ?? json?.total ?? (Array.isArray(json) ? json.length : "?");
      setTestMsg(`✓ Conexión exitosa — ${total} contratos encontrados`);
    } catch(e) { setTestMsg("Error: "+e.message); }
    finally { setTestando(false); }
  };

  /* ── cargar contratos WisPro ── */
  const cargarContratos = useCallback(async () => {
    if (!cfg?.api_token) return setConMsg("Configura el API Token primero.");
    setLoadingCon(true); setConMsg("");
    try {
      const res = await fetch(`${DIAGNO_BASE}/api/wispro/contracts?per_page=200`, {
        headers: { Authorization: `Token ${cfg.api_token}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const lista = Array.isArray(json) ? json : (json?.contracts ?? json?.data ?? []);
      setContratos(lista);
      // cargar config local de cada uno
      const ids = lista.map(c => String(c.id));
      const { data: cfgRows } = await supabase.from("wispro_clientes_config")
        .select("*").in("contrato_id", ids);
      const map = {};
      (cfgRows||[]).forEach(r => { map[r.contrato_id] = r; });
      setClientesCfg(map);
    } catch(e) { setConMsg("Error: "+e.message); }
    finally { setLoadingCon(false); }
  }, [cfg]);

  /* ── guardar config de un cliente ── */
  const guardarClienteCfg = async (contratoId, patch) => {
    setSavingCli(p => ({...p, [contratoId]: true}));
    const existing = clientesCfg[contratoId];
    const row = { ...(existing||{}), contrato_id: contratoId, ...patch, updated_at: new Date().toISOString() };
    const { error } = existing
      ? await supabase.from("wispro_clientes_config").update(patch).eq("contrato_id", contratoId)
      : await supabase.from("wispro_clientes_config").insert(row);
    if (!error) setClientesCfg(p => ({...p, [contratoId]: {...(p[contratoId]||{contrato_id:contratoId}), ...patch}}));
    setSavingCli(p => ({...p, [contratoId]: false}));
  };

  /* ── enviar bienvenida ── */
  const enviarBienvenida = async (contrato) => {
    const waba  = getWaba();
    const phone = getPhone();
    if (!waba?.token || !phone?.phone_number_id)
      return setBienMsg("Configura el número emisor en la pestaña Configuración.");
    const tel = normTel(contrato.subscriber?.phone || contrato.phone || "");
    if (!tel) return setBienMsg("Este cliente no tiene teléfono registrado en WisPro.");
    setEnviandoBien(true); setBienMsg("");
    try {
      const res = await fetch(`${META_BASE}/${phone.phone_number_id}/messages`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${waba.token}`},
        body: JSON.stringify({
          messaging_product:"whatsapp", to: tel, type:"template",
          template:{ name: cfg.plantilla_bienvenida, language:{ code:"es" },
            components:[{ type:"body", parameters:[{ type:"text", text: contrato.subscriber?.name || contrato.name || "Cliente" }]}]
          },
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      // registrar en log
      await supabase.from("wispro_notificaciones_log").insert({
        contrato_id: String(contrato.id), cliente_nombre: contrato.subscriber?.name||contrato.name||"",
        telefono: tel, tipo:"bienvenida", resultado:"enviado",
      });
      // marcar bienvenida enviada
      await guardarClienteCfg(String(contrato.id), { bienvenida_enviada:true, cliente_nombre: contrato.subscriber?.name||contrato.name||"" });
      setBienMsg("✓ Bienvenida enviada a +"+tel);
      setBienContrato(null);
    } catch(e) { setBienMsg("Error: "+e.message); }
    finally { setEnviandoBien(false); }
  };

  /* ── historial ── */
  const cargarLogs = useCallback(async () => {
    setLoadingLogs(true);
    let q = supabase.from("wispro_notificaciones_log")
      .select("*", { count:"exact" })
      .order("creado_at", { ascending:false })
      .range(logPage*LOG_PAGE_SIZE, (logPage+1)*LOG_PAGE_SIZE - 1);
    if (logFiltroTipo !== "todos") q = q.eq("tipo", logFiltroTipo);
    if (logFiltroRes  !== "todos") q = q.eq("resultado", logFiltroRes);
    const { data } = await q;
    setLogs(data||[]);
    setLoadingLogs(false);
  }, [logFiltroTipo, logFiltroRes, logPage]);

  useEffect(() => { if (tab==="historial") cargarLogs(); }, [tab, cargarLogs]);

  /* ── filtros contratos ── */
  const contratosFilt = contratos.filter(c => {
    const nombre = (c.subscriber?.name||c.name||"").toLowerCase();
    const estado = c.state||c.status||"";
    if (filtroCon !== "todos" && estado !== filtroCon) return false;
    if (busqCon.trim()) return nombre.includes(busqCon.toLowerCase()) || String(c.id).includes(busqCon);
    return true;
  });

  if (!cfg) return <div style={{padding:40,color:"#64748b"}}>Cargando...</div>;

  /* ════ RENDER ════ */
  return (
    <div style={{display:"grid", gap:16}}>
      <div style={{background:"#fff", borderRadius:20, border:"1px solid #e8edf5",
        boxShadow:"0 2px 16px rgba(15,23,42,0.06)", padding:"22px 26px"}}>

        <div style={{marginBottom:18}}>
          <h2 style={{margin:0, fontSize:22, fontWeight:800, color:"#0f172a"}}>WisPro — Notificaciones</h2>
          <p style={{margin:"3px 0 0", fontSize:12, color:"#94a3b8"}}>
            Recordatorios y mensajes automáticos para clientes de Nod_06 (DimFiber)
          </p>
        </div>

        {/* Tabs */}
        <div style={{display:"flex", gap:4, marginBottom:24, borderBottom:"2px solid #f1f5f9"}}>
          {[{key:"config",label:"⚙ Configuración"},{key:"clientes",label:"👥 Clientes"},{key:"bienvenida",label:"👋 Bienvenida"},{key:"historial",label:"📋 Historial"}].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={{padding:"8px 18px", fontSize:13, fontWeight:700, border:"none", cursor:"pointer",
                borderBottom: tab===t.key?"2px solid #7c3aed":"2px solid transparent",
                background:"none", color: tab===t.key?"#7c3aed":"#64748b", marginBottom:-2}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ TAB CONFIGURACIÓN ══ */}
        {tab==="config" && (
          <div style={{maxWidth:700}}>

            {/* API */}
            <div style={card}>
              <p style={{margin:"0 0 14px", fontWeight:800, fontSize:14, color:"#0f172a"}}>🔑 API WisPro</p>
              <div style={{display:"grid", gap:12}}>
                <div>
                  <label style={lbl}>API Token</label>
                  <input value={cfg.api_token||""} onChange={e=>setCfg(c=>({...c,api_token:e.target.value}))}
                    placeholder="09ba7595-..." style={{...inp, fontFamily:"monospace", fontSize:12}} />
                </div>
                <div style={{display:"flex", gap:8, alignItems:"center"}}>
                  <button onClick={probarApi} disabled={testando} style={btnS("#0369a1", testando)}>
                    {testando?"Probando...":"🔌 Probar conexión"}
                  </button>
                  {testMsg && <span style={{fontSize:12, fontWeight:600, color: testMsg.startsWith("✓")?"#16a34a":"#dc2626"}}>{testMsg}</span>}
                </div>
              </div>
            </div>

            {/* WhatsApp emisor */}
            <div style={card}>
              <p style={{margin:"0 0 14px", fontWeight:800, fontSize:14, color:"#0f172a"}}>📱 WhatsApp emisor (DIM)</p>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
                <div>
                  <label style={lbl}>WABA (índice)</label>
                  <select value={cfg.waba_idx||0} onChange={e=>setCfg(c=>({...c,waba_idx:Number(e.target.value)}))}
                    style={{...inp, cursor:"pointer"}}>
                    {(metaCfg?.dim?.wabas||[]).map((w,i)=>{
                      const nums=(w.numeros||[]).map(n=>n.nombre).filter(Boolean).join(", ");
                      return <option key={w.id} value={i}>WABA {i+1}{nums?` — ${nums}`:""}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Número emisor</label>
                  <select value={cfg.phone_numero_id_key||""} onChange={e=>setCfg(c=>({...c,phone_numero_id_key:e.target.value}))}
                    style={{...inp, cursor:"pointer"}}>
                    <option value="">— Seleccionar —</option>
                    {(getWaba()?.numeros||[]).map(n=>(
                      <option key={n.id} value={n.id}>{n.nombre||n.numero||n.phone_number_id}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Tipos de mensajes */}
            <div style={card}>
              <p style={{margin:"0 0 14px", fontWeight:800, fontSize:14, color:"#0f172a"}}>💬 Tipos de mensajes</p>
              <div style={{display:"grid", gap:12}}>
                {TIPOS_MSG.map(t=>(
                  <div key={t.key} style={{background:"#f8fafc", borderRadius:12, padding:"12px 16px",
                    border:`1.5px solid ${cfg[t.key+"_activa"]?"#7c3aed":"#e2e8f0"}`}}>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                      <div>
                        <p style={{margin:"0 0 2px", fontWeight:700, fontSize:13, color:"#0f172a"}}>{t.icon} {t.label}</p>
                        <p style={{margin:0, fontSize:11, color:"#64748b"}}>{t.desc}</p>
                      </div>
                      <label style={{display:"flex", alignItems:"center", gap:6, cursor:"pointer", userSelect:"none"}}>
                        <input type="checkbox" checked={!!cfg[t.key+"_activa"]}
                          onChange={e=>setCfg(c=>({...c,[t.key+"_activa"]:e.target.checked}))} />
                        <span style={{fontSize:11, fontWeight:700, color: cfg[t.key+"_activa"]?"#7c3aed":"#94a3b8"}}>
                          {cfg[t.key+"_activa"]?"Activo":"Inactivo"}
                        </span>
                      </label>
                    </div>
                    <div style={{marginTop:10}}>
                      <label style={lbl}>Plantilla Meta</label>
                      <input value={cfg["plantilla_"+t.key]||""} onChange={e=>setCfg(c=>({...c,["plantilla_"+t.key]:e.target.value}))}
                        placeholder={`dim_${t.key}`} style={{...inp, fontFamily:"monospace", fontSize:12}} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recordatorios config */}
            <div style={card}>
              <p style={{margin:"0 0 14px", fontWeight:800, fontSize:14, color:"#0f172a"}}>🔔 Configuración de recordatorios</p>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
                <div>
                  <label style={lbl}>Número de recordatorios</label>
                  <div style={{display:"flex", gap:6}}>
                    {[2,3].map(n=>(
                      <button key={n} onClick={()=>setCfg(c=>({...c,num_recordatorios:n}))}
                        style={{flex:1, padding:"8px", fontSize:13, fontWeight:700, borderRadius:8, border:"none",
                          cursor:"pointer", background: cfg.num_recordatorios===n?"#7c3aed":"#f1f5f9",
                          color: cfg.num_recordatorios===n?"#fff":"#64748b"}}>
                        {n} mensajes
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={lbl}>Días después del vencimiento</label>
                  <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6}}>
                    {[0,1,2].map(i=>(
                      <div key={i} style={{opacity: i+1>cfg.num_recordatorios?0.35:1}}>
                        <label style={{...lbl, color:"#7c3aed"}}>Msg {i+1}</label>
                        <input type="number" min={1} max={30}
                          value={(cfg.recordatorio_dias||[2,5,7])[i]||""}
                          onChange={e=>{
                            const dias=[...(cfg.recordatorio_dias||[2,5,7])];
                            dias[i]=Number(e.target.value);
                            setCfg(c=>({...c,recordatorio_dias:dias}));
                          }}
                          disabled={i+1>cfg.num_recordatorios}
                          style={{...inp, textAlign:"center"}} />
                      </div>
                    ))}
                  </div>
                  <p style={{margin:"6px 0 0", fontSize:11, color:"#94a3b8"}}>
                    Días después de la fecha de vencimiento
                  </p>
                </div>
              </div>
            </div>

            <div style={{display:"flex", gap:10, alignItems:"center"}}>
              <button onClick={guardarConfig} disabled={savingCfg} style={btnS("#7c3aed", savingCfg)}>
                {savingCfg?"Guardando...":"💾 Guardar configuración"}
              </button>
              {cfgMsg && <span style={{fontSize:12, fontWeight:600, color: cfgMsg.startsWith("✓")?"#16a34a":"#dc2626"}}>{cfgMsg}</span>}
            </div>
          </div>
        )}

        {/* ══ TAB CLIENTES ══ */}
        {tab==="clientes" && (
          <div>
            <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"flex-end"}}>
              <div style={{flex:1, minWidth:200}}>
                <label style={lbl}>Buscar cliente</label>
                <input value={busqCon} onChange={e=>setBusqCon(e.target.value)}
                  placeholder="Nombre o ID contrato..." style={inp} />
              </div>
              <div>
                <label style={lbl}>Estado contrato</label>
                <select value={filtroCon} onChange={e=>setFiltroCon(e.target.value)}
                  style={{...inp, width:"auto", cursor:"pointer"}}>
                  <option value="todos">Todos</option>
                  <option value="enabled">Activo</option>
                  <option value="disabled">Suspendido</option>
                </select>
              </div>
              <button onClick={cargarContratos} disabled={loadingCon} style={btnS("#7c3aed", loadingCon)}>
                {loadingCon?"Cargando...":"🔄 Cargar desde WisPro"}
              </button>
            </div>
            {conMsg && <p style={{fontSize:12, color:"#dc2626", marginBottom:10}}>{conMsg}</p>}
            {contratos.length===0 && !loadingCon ? (
              <p style={{color:"#94a3b8", fontSize:13, padding:"30px 0", textAlign:"center"}}>
                Haz clic en "Cargar desde WisPro" para ver los contratos.
              </p>
            ) : (
              <>
                <p style={{fontSize:12, color:"#64748b", margin:"0 0 10px"}}>
                  Mostrando {contratosFilt.length} de {contratos.length} contratos
                </p>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
                    <thead>
                      <tr style={{background:"#f8fafc", borderBottom:"2px solid #e2e8f0"}}>
                        {["ID","Cliente","Teléfono","Estado","Mensajes","Recordatorios","Bienvenida","Notas"].map(h=>(
                          <th key={h} style={{padding:"8px 12px", textAlign:"left", fontWeight:700, fontSize:11, color:"#475569", whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contratosFilt.map(c=>{
                        const cid = String(c.id);
                        const ccfg = clientesCfg[cid] || {};
                        const nombre = c.subscriber?.name||c.name||"—";
                        const tel = c.subscriber?.phone||c.phone||"";
                        const estado = c.state||c.status||"";
                        return (
                          <tr key={cid} style={{borderBottom:"1px solid #f1f5f9", background:"#fff"}}>
                            <td style={{padding:"8px 12px", fontFamily:"monospace", fontSize:11, color:"#64748b"}}>{cid}</td>
                            <td style={{padding:"8px 12px", fontWeight:600, color:"#0f172a"}}>{nombre}</td>
                            <td style={{padding:"8px 12px", color:"#475569"}}>{tel||"—"}</td>
                            <td style={{padding:"8px 12px"}}>
                              <span style={{fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99,
                                background: estado==="enabled"?"#f0fdf4":"#fff1f2",
                                color: estado==="enabled"?"#16a34a":"#e11d48",
                                border:`1px solid ${estado==="enabled"?"#86efac":"#fca5a5"}`}}>
                                {estado==="enabled"?"Activo":estado==="disabled"?"Suspendido":estado||"—"}
                              </span>
                            </td>
                            <td style={{padding:"8px 12px"}}>
                              <input type="checkbox"
                                checked={ccfg.mensajes_activos!==false}
                                onChange={e=>guardarClienteCfg(cid,{mensajes_activos:e.target.checked, cliente_nombre:nombre})}
                                title="Activar/desactivar todos los mensajes" />
                            </td>
                            <td style={{padding:"8px 12px"}}>
                              <input type="checkbox"
                                checked={ccfg.recordatorios_activos!==false}
                                onChange={e=>guardarClienteCfg(cid,{recordatorios_activos:e.target.checked, cliente_nombre:nombre})}
                                title="Activar/desactivar recordatorios" />
                            </td>
                            <td style={{padding:"8px 12px"}}>
                              {ccfg.bienvenida_enviada
                                ? <span style={{fontSize:10, color:"#16a34a", fontWeight:700}}>✓ Enviada</span>
                                : <button onClick={()=>{ setBienContrato(c); setTab("bienvenida"); }}
                                    style={{padding:"3px 8px", background:"#eff6ff", color:"#2563eb", border:"1px solid #bfdbfe",
                                      borderRadius:6, fontSize:10, fontWeight:700, cursor:"pointer"}}>Enviar</button>
                              }
                            </td>
                            <td style={{padding:"8px 12px", minWidth:140}}>
                              <input value={ccfg.notas||""} placeholder="Notas..."
                                onChange={e=>setClientesCfg(p=>({...p,[cid]:{...p[cid],notas:e.target.value}}))}
                                onBlur={e=>guardarClienteCfg(cid,{notas:e.target.value, cliente_nombre:nombre})}
                                style={{...inp, padding:"4px 8px", fontSize:11}} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ TAB BIENVENIDA ══ */}
        {tab==="bienvenida" && (
          <div style={{maxWidth:560}}>
            <p style={{margin:"0 0 18px", fontSize:13, color:"#64748b"}}>
              Envía el mensaje de bienvenida manualmente a un cliente de WisPro.
            </p>
            {/* Cargar contratos si no están */}
            {contratos.length===0 && (
              <button onClick={cargarContratos} disabled={loadingCon} style={{...btnS("#7c3aed", loadingCon), marginBottom:16}}>
                {loadingCon?"Cargando...":"🔄 Cargar clientes WisPro"}
              </button>
            )}
            {/* Selector */}
            <div style={{marginBottom:14}}>
              <label style={lbl}>Buscar y seleccionar cliente</label>
              <select value={bienContrato?.id||""} onChange={e=>{
                setBienContrato(contratos.find(c=>String(c.id)===e.target.value)||null);
                setBienMsg("");
              }} style={{...inp, cursor:"pointer"}}>
                <option value="">— Seleccionar cliente —</option>
                {contratos.map(c=>(
                  <option key={c.id} value={c.id}>
                    {c.subscriber?.name||c.name||"—"} | {c.subscriber?.phone||c.phone||"sin tel"} | ID:{c.id}
                  </option>
                ))}
              </select>
            </div>

            {bienContrato && (
              <div style={{background:"#f8fafc", borderRadius:12, padding:"14px 16px", border:"1.5px solid #e2e8f0", marginBottom:14}}>
                <p style={{margin:"0 0 4px", fontWeight:700, fontSize:13}}>{bienContrato.subscriber?.name||bienContrato.name}</p>
                <p style={{margin:"0 0 2px", fontSize:12, color:"#64748b"}}>Tel: {bienContrato.subscriber?.phone||bienContrato.phone||"—"}</p>
                <p style={{margin:0, fontSize:12, color:"#64748b"}}>Contrato ID: {bienContrato.id}</p>
                {clientesCfg[String(bienContrato.id)]?.bienvenida_enviada && (
                  <p style={{margin:"8px 0 0", fontSize:11, color:"#d97706", background:"#fffbeb", borderRadius:6, padding:"4px 8px", border:"1px solid #fcd34d"}}>
                    ⚠ Ya se envió la bienvenida a este cliente anteriormente.
                  </p>
                )}
              </div>
            )}

            <div style={{display:"flex", gap:10, alignItems:"center"}}>
              <button onClick={()=>bienContrato&&enviarBienvenida(bienContrato)}
                disabled={!bienContrato||enviandoBien}
                style={btnS("#7c3aed", !bienContrato||enviandoBien)}>
                {enviandoBien?"Enviando...":"👋 Enviar bienvenida"}
              </button>
            </div>
            {bienMsg && <p style={{margin:"12px 0 0", fontSize:12, fontWeight:600,
              color: bienMsg.startsWith("✓")?"#16a34a":"#dc2626"}}>{bienMsg}</p>}

            {/* Instrucción para el flujo automático */}
            <div style={{marginTop:24, background:"#f0f9ff", borderRadius:12, padding:"14px 16px", border:"1px solid #bae6fd"}}>
              <p style={{margin:"0 0 6px", fontWeight:700, fontSize:12, color:"#0369a1"}}>ℹ Flujo automático (próximamente)</p>
              <p style={{margin:0, fontSize:11, color:"#0369a1", lineHeight:1.6}}>
                El cron de n8n detectará contratos nuevos en WisPro y enviará la bienvenida automáticamente si está activada en la configuración.
              </p>
            </div>
          </div>
        )}

        {/* ══ TAB HISTORIAL ══ */}
        {tab==="historial" && (
          <div>
            <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"flex-end"}}>
              <div>
                <label style={lbl}>Tipo</label>
                <select value={logFiltroTipo} onChange={e=>{setLogFiltroTipo(e.target.value);setLogPage(0);}}
                  style={{...inp, width:"auto", cursor:"pointer"}}>
                  <option value="todos">Todos</option>
                  <option value="bienvenida">Bienvenida</option>
                  <option value="recordatorio_1">Recordatorio 1</option>
                  <option value="recordatorio_2">Recordatorio 2</option>
                  <option value="recordatorio_3">Recordatorio 3</option>
                  <option value="suspension">Suspensión</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Resultado</label>
                <select value={logFiltroRes} onChange={e=>{setLogFiltroRes(e.target.value);setLogPage(0);}}
                  style={{...inp, width:"auto", cursor:"pointer"}}>
                  <option value="todos">Todos</option>
                  <option value="enviado">Enviado ✓</option>
                  <option value="saltado_pago">Saltado (ya pagó)</option>
                  <option value="saltado_optout">Saltado (opt-out)</option>
                  <option value="duplicado">Duplicado evitado</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <button onClick={cargarLogs} disabled={loadingLogs} style={btnS("#7c3aed", loadingLogs)}>
                {loadingLogs?"Cargando...":"🔄 Actualizar"}
              </button>
            </div>

            {logs.length===0 && !loadingLogs ? (
              <p style={{color:"#94a3b8", fontSize:13, padding:"30px 0", textAlign:"center"}}>Sin registros todavía.</p>
            ) : (
              <>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
                    <thead>
                      <tr style={{background:"#f8fafc", borderBottom:"2px solid #e2e8f0"}}>
                        {["Fecha","Cliente","Teléfono","Tipo","Días vencido","Deuda","Resultado","Detalle"].map(h=>(
                          <th key={h} style={{padding:"8px 12px", textAlign:"left", fontWeight:700, fontSize:11, color:"#475569", whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(l=>(
                        <tr key={l.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                          <td style={{padding:"7px 12px", fontSize:11, color:"#64748b", whiteSpace:"nowrap"}}>{fmtFecha(l.creado_at)}</td>
                          <td style={{padding:"7px 12px", fontWeight:600}}>{l.cliente_nombre||"—"}</td>
                          <td style={{padding:"7px 12px", fontFamily:"monospace", fontSize:11}}>{l.telefono||"—"}</td>
                          <td style={{padding:"7px 12px"}}>
                            <span style={{fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:99,
                              background:"#f1f5f9", color:"#475569", border:"1px solid #e2e8f0"}}>
                              {l.tipo}
                            </span>
                          </td>
                          <td style={{padding:"7px 12px", textAlign:"center", color:"#64748b"}}>{l.dias_vencido??"-"}</td>
                          <td style={{padding:"7px 12px", color:"#0f172a"}}>{l.deuda_monto!=null?`S/. ${Number(l.deuda_monto).toFixed(2)}`:"—"}</td>
                          <td style={{padding:"7px 12px"}}>
                            <span style={{fontSize:10, fontWeight:700, color: resultColor(l.resultado)}}>{l.resultado}</span>
                          </td>
                          <td style={{padding:"7px 12px", fontSize:11, color:"#94a3b8", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis"}}>
                            {l.detalle||"—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{display:"flex", gap:8, marginTop:12, justifyContent:"center"}}>
                  <button onClick={()=>setLogPage(p=>Math.max(0,p-1))} disabled={logPage===0}
                    style={btnS("#64748b", logPage===0)}>← Anterior</button>
                  <span style={{padding:"8px 16px", fontSize:12, color:"#64748b"}}>Página {logPage+1}</span>
                  <button onClick={()=>setLogPage(p=>p+1)} disabled={logs.length<LOG_PAGE_SIZE}
                    style={btnS("#64748b", logs.length<LOG_PAGE_SIZE)}>Siguiente →</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
