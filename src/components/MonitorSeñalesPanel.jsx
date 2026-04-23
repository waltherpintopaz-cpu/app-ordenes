import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const OLT_SSH_API     = String(import.meta.env.VITE_OLT_SSH_API     || "https://amnet-olt-signal.0lthka.easypanel.host").trim().replace(/\/$/, "");
const HUAWEI_API      = String(import.meta.env.VITE_HUAWEI_SIGNAL_API || "https://amnet-huawei-signal.0lthka.easypanel.host").trim().replace(/\/$/, "");
const HUAWEI_NODOS    = new Set(["Nod_01", "Nod_02", "Nod_03"]);

function nivelSenal(rx) {
  if (rx == null || isNaN(rx)) return "sin_datos";
  if (rx >= -22) return "normal";
  if (rx >= -25) return "alerta";
  return "critico";
}

const NIVEL = {
  normal:    { label: "Normal",    dot: "#22c55e", text: "#15803d", bg: "#f0fdf4", tag: "#dcfce7" },
  alerta:    { label: "Alerta",    dot: "#f59e0b", text: "#92400e", bg: "#fffbeb", tag: "#fef3c7" },
  critico:   { label: "Crítico",   dot: "#ef4444", text: "#991b1b", bg: "#fef2f2", tag: "#fee2e2" },
  sin_datos: { label: "Sin datos", dot: "#d1d5db", text: "#6b7280", bg: "#f9fafb", tag: "#f3f4f6" },
};

function mapearCliente(row) {
  return {
    id: row.id, nombre: row.nombre||"", dni: row.dni||"", celular: row.celular||"",
    email: row.email||"", direccion: row.direccion||"", empresa: row.empresa||"",
    velocidad: row.velocidad||"", precioPlan: row.precio_plan!=null ? String(row.precio_plan):"",
    nodo: row.nodo||"", usuarioNodo: row.usuario_nodo||"", passwordUsuario: row.password_usuario||"",
    snOnu: row.sn_onu||"", codigoEtiqueta: row.codigo_etiqueta||"", ubicacion: row.ubicacion||"",
    cajaNap: row.caja_nap||"", puertoNap: row.puerto_nap||"", descripcion: row.descripcion||"",
    vlan: row.vlan??null,
  };
}

// ── Mini donut SVG ────────────────────────────────────────────────────────────
function MiniDonut({ critico=0, alerta=0, normal=0, sin_datos=0, size=90 }) {
  const total = critico + alerta + normal + sin_datos || 1;
  const r = 16; const cx = 20; const cy = 20; const circ = 2 * Math.PI * r;
  const segs = [
    { val: critico,   color: "#ef4444" },
    { val: alerta,    color: "#f59e0b" },
    { val: normal,    color: "#22c55e" },
    { val: sin_datos, color: "#e5e7eb" },
  ];
  let off = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={6}/>
      {segs.map((s, i) => {
        const d = (s.val / total) * circ;
        const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={6}
          strokeDasharray={`${d} ${circ - d}`} strokeDashoffset={-off}/>;
        off += d; return el;
      })}
    </svg>
  );
}

// ── Barra señal ───────────────────────────────────────────────────────────────
function BarraSenal({ rx }) {
  const n = nivelSenal(rx);
  const c = NIVEL[n];
  const pct = rx != null && !isNaN(rx) ? Math.max(0, Math.min(100, ((rx + 30) / 15) * 100)) : 0;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ width:72, height:4, background:"#f3f4f6", borderRadius:99, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:c.dot, borderRadius:99 }}/>
      </div>
      <span style={{ fontSize:12, fontWeight:600, color: rx!=null&&!isNaN(rx) ? c.text : "#9ca3af", minWidth:52 }}>
        {rx!=null&&!isNaN(rx) ? `${rx} dBm` : "—"}
      </span>
    </div>
  );
}

// ── Panel principal ───────────────────────────────────────────────────────────
export default function MonitorSeñalesPanel({ onCrearOrden, nodosPermitidos = [] }) {
  const [clientes, setClientes]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [nodoFiltro, setNodoFiltro]   = useState("todos");
  const [nivelFiltro, setNivelFiltro] = useState("todos");
  const [refreshing, setRefreshing]   = useState({});
  const [ultimaAct, setUltimaAct]     = useState(null);
  const [busqueda, setBusqueda]       = useState("");
  const [sortDir, setSortDir]         = useState("asc");

  // Si gestor tiene un solo nodo, pre-seleccionarlo
  useEffect(() => {
    if (nodosPermitidos.length === 1) setNodoFiltro(nodosPermitidos[0]);
  }, [nodosPermitidos]);

  const cargar = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("clientes")
      .select("id, nombre, nodo, dni, celular, email, direccion, empresa, velocidad, precio_plan, usuario_nodo, password_usuario, sn_onu, codigo_etiqueta, ubicacion, caja_nap, puerto_nap, descripcion, vlan, rx_signal, tx_signal, signal_updated_at")
      .not("sn_onu","is",null).neq("sn_onu","")
      .order("rx_signal",{ascending:true,nullsFirst:false}).limit(2000);
    if (nodosPermitidos.length > 0) q = q.in("nodo", nodosPermitidos);
    const { data } = await q;
    setClientes(data||[]);
    setUltimaAct(new Date().toLocaleTimeString());
    setLoading(false);
  }, [nodosPermitidos]);

  useEffect(() => {
    cargar();
    const ch = supabase.channel("monitor_senales")
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"clientes"},({new:n})=>{
        setClientes(prev=>prev.map(c=>c.id===n.id?{...c,rx_signal:n.rx_signal,tx_signal:n.tx_signal,signal_updated_at:n.signal_updated_at}:c));
      }).subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  }, [cargar]);

  const nodos = useMemo(()=>{
    const s = new Set(clientes.map(c=>c.nodo).filter(Boolean));
    return [...Array.from(s).sort()];
  },[clientes]);

  const statsPorNodo = useMemo(()=>{
    const m={};
    for(const c of clientes){
      const n=c.nodo||"?";
      if(!m[n]) m[n]={critico:0,alerta:0,normal:0,sin_datos:0};
      m[n][nivelSenal(parseFloat(c.rx_signal))]++;
    }
    return m;
  },[clientes]);

  const statsGlobal = useMemo(()=>{
    const s={critico:0,alerta:0,normal:0,sin_datos:0};
    for(const c of clientes) s[nivelSenal(parseFloat(c.rx_signal))]++;
    return s;
  },[clientes]);

  const statsActual = useMemo(()=>{
    const base = nodoFiltro==="todos" ? clientes : clientes.filter(c=>c.nodo===nodoFiltro);
    const s={critico:0,alerta:0,normal:0,sin_datos:0};
    for(const c of base) s[nivelSenal(parseFloat(c.rx_signal))]++;
    return s;
  },[clientes,nodoFiltro]);

  const lista = useMemo(()=>{
    let arr = clientes.filter(c=>{
      if(nodoFiltro!=="todos" && c.nodo!==nodoFiltro) return false;
      if(nivelFiltro!=="todos" && nivelSenal(parseFloat(c.rx_signal))!==nivelFiltro) return false;
      if(busqueda){
        const b=busqueda.toLowerCase();
        return String(c.nombre||"").toLowerCase().includes(b)||String(c.sn_onu||"").toLowerCase().includes(b)||String(c.nodo||"").toLowerCase().includes(b);
      }
      return true;
    });
    return arr.sort((a,b)=>{
      const na=parseFloat(a.rx_signal??"NaN"), nb=parseFloat(b.rx_signal??"NaN");
      const av=isNaN(na)?Infinity:na, bv=isNaN(nb)?Infinity:nb;
      return sortDir==="asc"?av-bv:bv-av;
    });
  },[clientes,nodoFiltro,nivelFiltro,busqueda,sortDir]);

  const top10 = useMemo(()=>lista.filter(c=>!isNaN(parseFloat(c.rx_signal))).slice(0,10),[lista]);

  const fmt = iso=>{
    if(!iso) return "—";
    try{ return new Date(iso).toLocaleString("es-PE",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"}); }
    catch{ return "—"; }
  };

  const refrescarSenal = async (cli)=>{
    const sn=String(cli.sn_onu||"").trim(); if(!sn) return;
    setRefreshing(p=>({...p,[cli.id]:true}));
    try{
      let json={};
      if(HUAWEI_NODOS.has(cli.nodo)){
        // Huawei MA5800 — señal via huawei-signal.js
        json=await fetch(`${HUAWEI_API}/signal-huawei?sn=${encodeURIComponent(sn)}`).then(r=>r.json()).catch(()=>({}));
      } else {
        // VSOL / resto de nodos
        const params=new URLSearchParams({sn});
        if(cli.vlan) params.set("vlan",String(cli.vlan));
        if(cli.nodo) params.set("nodo",String(cli.nodo));
        json=await fetch(`${OLT_SSH_API}/signal?${params}`).then(r=>r.json()).catch(()=>({}));
      }
      if(json.ok){
        const now=new Date().toISOString();
        await supabase.from("clientes").update({rx_signal:json.rxPower,tx_signal:json.txPower,signal_updated_at:now}).eq("id",cli.id);
        setClientes(prev=>prev.map(c=>c.id===cli.id?{...c,rx_signal:json.rxPower,tx_signal:json.txPower,signal_updated_at:now}:c));
      }
    }catch(_){}
    setRefreshing(p=>({...p,[cli.id]:false}));
  };

  const exportarPDF = ()=>{
    const doc=new jsPDF({orientation:"landscape"});
    const nodoLbl=nodoFiltro==="todos"?"Todos los nodos":nodoFiltro;
    const nivelLbl=nivelFiltro==="todos"?"Todos":NIVEL[nivelFiltro]?.label;
    doc.setFontSize(16); doc.setTextColor(15,23,42);
    doc.text("Monitor de Señales OLT — Americanet",14,16);
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Generado: ${new Date().toLocaleString("es-PE")}   Nodo: ${nodoLbl}   Estado: ${nivelLbl}   Total: ${lista.length}`,14,23);
    doc.setFontSize(9);
    doc.setTextColor(153,27,27);  doc.text(`Críticos: ${statsActual.critico}`,14,30);
    doc.setTextColor(146,64,14);  doc.text(`Alertas: ${statsActual.alerta}`,50,30);
    doc.setTextColor(21,128,61);  doc.text(`Normales: ${statsActual.normal}`,86,30);
    doc.setTextColor(107,114,128);doc.text(`Sin datos: ${statsActual.sin_datos}`,122,30);
    autoTable(doc,{
      startY:35,
      head:[["Estado","Cliente","Nodo","SN ONU","RX (dBm)","TX (dBm)","Última consulta"]],
      body:lista.map(c=>{
        const rx=parseFloat(c.rx_signal);
        return[NIVEL[nivelSenal(isNaN(rx)?null:rx)].label,c.nombre||"—",c.nodo||"—",c.sn_onu||"—",isNaN(rx)?"—":rx.toFixed(2),c.tx_signal!=null?String(c.tx_signal):"—",fmt(c.signal_updated_at)];
      }),
      headStyles:{fillColor:[30,41,59],textColor:255,fontStyle:"bold",fontSize:8},
      bodyStyles:{fontSize:8},
      alternateRowStyles:{fillColor:[249,250,251]},
      didParseCell(data){
        if(data.section!=="body") return;
        if(data.column.index===0){
          const v=data.cell.raw;
          if(v==="Crítico"){data.cell.styles.textColor=[153,27,27];data.cell.styles.fontStyle="bold";}
          else if(v==="Alerta"){data.cell.styles.textColor=[146,64,14];data.cell.styles.fontStyle="bold";}
          else if(v==="Normal"){data.cell.styles.textColor=[21,128,61];data.cell.styles.fontStyle="bold";}
        }
        if(data.column.index===4){
          const rx=parseFloat(data.cell.raw);
          if(!isNaN(rx)) data.cell.styles.textColor=rx<-25?[153,27,27]:rx<-22?[146,64,14]:[21,128,61];
        }
      },
      margin:{left:14,right:14},
    });
    doc.save(`senales-${nodoFiltro}-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const exportarExcel = ()=>{
    const nodoLbl=nodoFiltro==="todos"?"Todos":nodoFiltro;
    const nivelLbl=nivelFiltro==="todos"?"Todos":NIVEL[nivelFiltro]?.label;
    const filas=lista.map(c=>{
      const rx=parseFloat(c.rx_signal);
      return{"Estado":NIVEL[nivelSenal(isNaN(rx)?null:rx)].label,"Cliente":c.nombre||"","Nodo":c.nodo||"","SN ONU":c.sn_onu||"","RX (dBm)":isNaN(rx)?"":rx,"TX (dBm)":c.tx_signal??""  ,"Última consulta":fmt(c.signal_updated_at)};
    });
    const wb=XLSX.utils.book_new();
    const wsRes=XLSX.utils.aoa_to_sheet([
      ["Monitor de Señales OLT — Americanet"],
      [`Generado: ${new Date().toLocaleString("es-PE")}`],
      [`Nodo: ${nodoLbl} | Estado: ${nivelLbl} | Total: ${lista.length}`],[],
      ["Nivel","Cantidad"],["Críticos",statsActual.critico],["Alertas",statsActual.alerta],
      ["Normales",statsActual.normal],["Sin datos",statsActual.sin_datos],
    ]);
    const ws=XLSX.utils.json_to_sheet(filas);
    ws["!cols"]=[{wch:12},{wch:28},{wch:10},{wch:18},{wch:10},{wch:10},{wch:18}];
    XLSX.utils.book_append_sheet(wb,wsRes,"Resumen");
    XLSX.utils.book_append_sheet(wb,ws,"Señales");
    XLSX.writeFile(wb,`senales-${nodoFiltro}-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const totalActual = statsActual.critico+statsActual.alerta+statsActual.normal+statsActual.sin_datos;

  // ── UI ────────────────────────────────────────────────────────────────────
  const s = {
    card: { background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"16px 20px", boxShadow:"0 1px 3px rgba(0,0,0,.04)" },
  };

  return (
    <div style={{ padding:"28px 24px", maxWidth:1280, margin:"0 auto", fontFamily:"system-ui,-apple-system,sans-serif", color:"#111827" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:28, gap:12, flexWrap:"wrap" }}>
        <div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:"#111827", letterSpacing:"-0.3px" }}>Monitor de Señales</h2>
          <p style={{ margin:"4px 0 0", fontSize:12, color:"#9ca3af" }}>
            {ultimaAct ? `Actualizado ${ultimaAct}` : "Cargando…"} · {clientes.length} ONUs registradas
          </p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={cargar} disabled={loading} style={{ padding:"8px 14px", background:"#1e293b", color:"#fff", border:"none", borderRadius:8, fontWeight:600, fontSize:12, cursor:loading?"wait":"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/></svg>
            {loading ? "Cargando" : "Actualizar"}
          </button>
          <button onClick={exportarPDF} disabled={loading||lista.length===0} style={{ padding:"8px 14px", background:"#fff", color:"#374151", border:"1px solid #e5e7eb", borderRadius:8, fontWeight:600, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            PDF
          </button>
          <button onClick={exportarExcel} disabled={loading||lista.length===0} style={{ padding:"8px 14px", background:"#fff", color:"#374151", border:"1px solid #e5e7eb", borderRadius:8, fontWeight:600, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
        </div>
      </div>

      {/* Selector nodo */}
      <div style={{ marginBottom:20 }}>
        <p style={{ margin:"0 0 10px", fontSize:11, fontWeight:600, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.07em" }}>Nodo</p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {/* Todos */}
          {/* Todos */}
          <button onClick={()=>setNodoFiltro("todos")} style={{
            display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"20px 24px", borderRadius:14, cursor:"pointer", minWidth:150,
            background: nodoFiltro==="todos" ? "#1e293b" : "#fff",
            border: `1px solid ${nodoFiltro==="todos" ? "#1e293b" : "#e5e7eb"}`,
            boxShadow: nodoFiltro==="todos" ? "0 4px 14px rgba(0,0,0,.18)" : "0 1px 3px rgba(0,0,0,.06)",
          }}>
            <MiniDonut {...statsGlobal} size={90}/>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:15, fontWeight:700, color: nodoFiltro==="todos" ? "#fff" : "#111827" }}>Todos</div>
              <div style={{ fontSize:12, color: nodoFiltro==="todos" ? "#94a3b8" : "#9ca3af", marginTop:2 }}>{clientes.length} clientes</div>
            </div>
          </button>

          {nodos.map(nodo=>{
            const st=statsPorNodo[nodo]||{critico:0,alerta:0,normal:0,sin_datos:0};
            const tot=st.critico+st.alerta+st.normal+st.sin_datos;
            const activo=nodoFiltro===nodo;
            return (
              <button key={nodo} onClick={()=>setNodoFiltro(activo?"todos":nodo)} style={{
                display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"20px 24px", borderRadius:14, cursor:"pointer", minWidth:150,
                background: activo ? "#1e293b" : "#fff",
                border:`1px solid ${activo?"#1e293b":"#e5e7eb"}`,
                boxShadow: activo ? "0 4px 14px rgba(0,0,0,.18)" : "0 1px 3px rgba(0,0,0,.06)",
              }}>
                <MiniDonut {...st} size={90}/>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:15, fontWeight:700, color: activo?"#fff":"#111827" }}>{nodo}</div>
                  <div style={{ fontSize:12, color: activo?"#94a3b8":"#9ca3af", marginTop:2 }}>{tot} clientes</div>
                  {st.critico>0 && <div style={{ fontSize:11, color: activo?"#fca5a5":"#ef4444", fontWeight:600, marginTop:3 }}>{st.critico} críticos</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtros nivel + búsqueda */}
      <div style={{ ...s.card, marginBottom:16, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {[
            { key:"todos",    label:"Todos",     count:totalActual,        color:"#374151", activeBg:"#111827" },
            { key:"critico",  label:"Crítico",   count:statsActual.critico,  color:"#ef4444", activeBg:"#ef4444" },
            { key:"alerta",   label:"Alerta",    count:statsActual.alerta,   color:"#f59e0b", activeBg:"#f59e0b" },
            { key:"normal",   label:"Normal",    count:statsActual.normal,   color:"#22c55e", activeBg:"#22c55e" },
            { key:"sin_datos",label:"Sin datos", count:statsActual.sin_datos,color:"#9ca3af", activeBg:"#9ca3af" },
          ].map(t=>{
            const activo=nivelFiltro===t.key;
            return (
              <button key={t.key} onClick={()=>setNivelFiltro(nivelFiltro===t.key?"todos":t.key)} style={{
                padding:"6px 12px", borderRadius:99, border:`1px solid ${activo?t.activeBg:"#e5e7eb"}`,
                background: activo ? t.activeBg : "#f9fafb",
                color: activo ? "#fff" : "#374151",
                fontWeight:600, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6,
              }}>
                <span>{t.label}</span>
                <span style={{ background:activo?"rgba(255,255,255,.2)":"#e5e7eb", borderRadius:99, padding:"1px 6px", fontSize:11, fontWeight:700 }}>{t.count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flex:1, display:"flex", gap:8, minWidth:180 }}>
          <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar cliente o SN…"
            style={{ flex:1, padding:"7px 11px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:12, outline:"none", background:"#f9fafb", color:"#111827" }}/>
          <button onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")}
            style={{ padding:"7px 12px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer", color:"#374151", whiteSpace:"nowrap" }}>
            {sortDir==="asc"?"↑ Peor primero":"↓ Mejor primero"}
          </button>
        </div>
      </div>

      {/* Top 10 */}
      {top10.length>0 && (
        <div style={{ ...s.card, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.06em" }}>
              Top 10 peores · {nodoFiltro!=="todos"?nodoFiltro:"todos los nodos"}
            </span>
            <span style={{ fontSize:11, color:"#9ca3af" }}>escala −35 → −15 dBm</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {top10.map((c,i)=>{
              const rx=parseFloat(c.rx_signal);
              const n=nivelSenal(rx); const cfg=NIVEL[n];
              const pct=Math.max(0,Math.min(100,((rx+30)/15)*100));
              return (
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:10, color:"#9ca3af", width:16, textAlign:"right", flexShrink:0 }}>{i+1}</span>
                  <span style={{ fontSize:11, color:"#374151", width:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flexShrink:0 }} title={c.nombre}>{c.nombre||c.sn_onu}</span>
                  <div style={{ flex:1, height:6, background:"#f3f4f6", borderRadius:99, overflow:"hidden" }}>
                    <div style={{ width:`${pct}%`, height:"100%", background:cfg.dot, borderRadius:99 }}/>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:cfg.text, width:64, textAlign:"right", flexShrink:0 }}>{rx} dBm</span>
                  <span style={{ fontSize:10, color:"#d1d5db", width:48, flexShrink:0 }}>{c.nodo}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div style={{ ...s.card, padding:0, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:60, textAlign:"center", color:"#9ca3af", fontSize:13 }}>Cargando…</div>
        ) : lista.length===0 ? (
          <div style={{ padding:60, textAlign:"center", color:"#9ca3af", fontSize:13 }}>Sin resultados para los filtros aplicados.</div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid #f3f4f6" }}>
                {["","Cliente","Nodo","SN ONU","Señal RX","TX","Consulta",""].map((h,i)=>(
                  <th key={i} style={{ padding:"10px 14px", textAlign:"left", fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.07em", background:"#fafafa" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((c,i)=>{
                const rx=parseFloat(c.rx_signal);
                const n=nivelSenal(isNaN(rx)?null:rx); const cfg=NIVEL[n];
                return (
                  <tr key={c.id} style={{ borderBottom:"1px solid #f9fafb", background: i%2===0?"#fff":"#fafafa" }}
                    onMouseEnter={e=>e.currentTarget.style.background="#f3f4f6"}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafafa"}>
                    <td style={{ padding:"9px 14px", width:28 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:cfg.dot }}/>
                    </td>
                    <td style={{ padding:"9px 14px", fontSize:13, fontWeight:500, color:"#111827", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={c.nombre}>{c.nombre||"—"}</td>
                    <td style={{ padding:"9px 14px" }}>
                      <span style={{ fontSize:11, fontWeight:600, color:"#6b7280", background:"#f3f4f6", padding:"2px 7px", borderRadius:5 }}>{c.nodo||"—"}</span>
                    </td>
                    <td style={{ padding:"9px 14px", fontSize:11, color:"#9ca3af", fontFamily:"monospace" }}>{c.sn_onu}</td>
                    <td style={{ padding:"9px 14px" }}><BarraSenal rx={isNaN(rx)?null:rx}/></td>
                    <td style={{ padding:"9px 14px", fontSize:12, color:"#6b7280" }}>{c.tx_signal!=null?`${c.tx_signal} dBm`:"—"}</td>
                    <td style={{ padding:"9px 14px", fontSize:11, color:"#9ca3af", whiteSpace:"nowrap" }}>{fmt(c.signal_updated_at)}</td>
                    <td style={{ padding:"9px 14px" }}>
                      <div style={{ display:"flex", gap:5 }}>
                        <button onClick={()=>refrescarSenal(c)} disabled={!!refreshing[c.id]} title="Refrescar"
                          style={{ padding:"4px 8px", background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:6, fontSize:12, cursor:refreshing[c.id]?"wait":"pointer", color:"#374151" }}>
                          {refreshing[c.id]?"…":"↺"}
                        </button>
                        {onCrearOrden&&(
                          <button onClick={()=>onCrearOrden(mapearCliente(c))} title="Crear orden"
                            style={{ padding:"4px 8px", background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:6, fontSize:11, cursor:"pointer", color:"#374151", fontWeight:600, whiteSpace:"nowrap" }}>
                            + Orden
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ marginTop:8, fontSize:11, color:"#d1d5db", textAlign:"right" }}>{lista.length} registros</p>
    </div>
  );
}
