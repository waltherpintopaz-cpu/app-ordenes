import { useEffect, useMemo, useRef, useState } from "react";

// Selector visual de puerto dentro de una caja NAP, para el panel web.
// Calcado de SelectorPuertoCaja.js (app móvil): misma bandeja con ícono de
// adaptador SC/APC por puerto (vacío/con cable), entrada escalonada,
// selección con resorte, y al tocar un puerto ocupado se consulta la señal
// en vivo de ese cliente con panel expandible (tarjeta/PON, modelo,
// distancia, última conexión, fotos). Animaciones en CSS puro (sin libreria
// nueva), igual criterio que el resto de animaciones de la app.

const OLT_SSH_API = String(import.meta.env.VITE_OLT_SSH_API || "").trim().replace(/\/$/, "");
const HUAWEI_OLT_SNMP_API = String(import.meta.env.VITE_HUAWEI_OLT_SNMP_API || "").trim().replace(/\/$/, "");
const DIM_NODOS = new Set(["nod_04", "nod_05", "nod_06", "nod_07"]);
const normNodo = (v) => String(v || "").trim().toLowerCase().replace(/[-\s]/g, "_");
const MAX_COLS = 8;

function calidadDe(rx) {
  if (rx >= -24) return { label: "BUENA", color: "#22c55e" };
  if (rx >= -27) return { label: "REGULAR", color: "#f59e0b" };
  return { label: "MALA", color: "#ef4444" };
}
function inicialesDe(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}
const AVATAR_COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#06B6D4", "#3B82F6"];
function colorAvatarDe(nombre) {
  const str = String(nombre || "");
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function coordsDe(ubicacion) {
  const m = String(ubicacion || "").match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng };
}
function fechaCorta(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return null; }
}
function fotosDe(cli) {
  const lista = [];
  if (cli?.foto_fachada) lista.push(cli.foto_fachada);
  let extra = cli?.fotos_liquidacion;
  if (typeof extra === "string") { try { extra = JSON.parse(extra); } catch { extra = null; } }
  if (Array.isArray(extra)) lista.push(...extra.filter(Boolean));
  return [...new Set(lista)];
}

// Icono SVG del puerto -- adaptador verde en la bandeja, con o sin cable
// conectado (calcado del mockup de la app movil).
function PortIcon({ ocupado }) {
  return (
    <svg viewBox="0 0 44 52" width="100%" height="100%">
      <rect x={3} y={15} width={38} height={22} rx={6} fill="#E7EAEF" stroke="#B7BEC9" strokeWidth={1.2} />
      {ocupado ? (
        <>
          <path d="M22 38 C22 43, 22 44, 22 50" fill="none" stroke="#1B1F26" strokeWidth={5.5} strokeLinecap="round" />
          <path d="M22 38 C22 43, 22 44, 22 50" fill="none" stroke="#454C58" strokeWidth={1.4} strokeLinecap="round" opacity={0.45} />
          <rect x={19} y={34} width={6} height={7} rx={1.8} fill="#454C58" />
          <rect x={8} y={21} width={6} height={10} rx={1.6} fill="#2F9E46" />
          <rect x={30} y={21} width={6} height={10} rx={1.6} fill="#2F9E46" />
          <rect x={13} y={18} width={18} height={16} rx={3.5} fill="#2F9E46" />
          <rect x={16.5} y={1} width={11} height={19} rx={3} fill="#3FBF5A" />
          <rect x={18.5} y={3.2} width={7} height={2.4} rx={1.1} fill="rgba(255,255,255,0.6)" />
          <rect x={18.5} y={7} width={7} height={1.4} rx={0.7} fill="rgba(0,0,0,0.12)" />
          <rect x={18.5} y={10} width={7} height={1.4} rx={0.7} fill="rgba(0,0,0,0.12)" />
          <rect x={14.5} y={21} width={15} height={9} rx={1.8} fill="#EEF3FF" opacity={0.95} />
          <rect x={14.5} y={21} width={15} height={3} rx={1.4} fill="#FFFFFF" opacity={0.45} />
        </>
      ) : (
        <>
          <rect x={8} y={21} width={6} height={10} rx={1.6} fill="#2F9E46" opacity={0.5} />
          <rect x={30} y={21} width={6} height={10} rx={1.6} fill="#2F9E46" opacity={0.5} />
          <rect x={13} y={18} width={18} height={16} rx={3.5} fill="#2F9E46" opacity={0.5} />
          <rect x={16.5} y={22} width={11} height={8} rx={2} fill="#D7DCE2" />
        </>
      )}
    </svg>
  );
}

function PortTile({ n, index, ocupado, seleccionado, destino, onSelect, onTapOcupado, senal }) {
  return (
    <button
      onClick={() => (ocupado ? onTapOcupado(n) : onSelect(n))}
      title={ocupado ? `Puerto ${n} ocupado: ${ocupado.nombre}` : destino ? `Mover aquí (puerto ${n})` : `Puerto ${n} libre`}
      className={`nps-port${destino ? " nps-port-destino" : ""}`}
      style={{ animationDelay: `${Math.min(index, 24) * 26}ms` }}
    >
      <div className={`nps-port-icon${seleccionado ? " nps-port-sel" : ""}`}>
        <PortIcon ocupado={!!ocupado} />
        {!!ocupado && <SenalBadge senal={senal} />}
      </div>
      <span className={`nps-port-num${ocupado ? " nps-port-num-ocu" : ""}${seleccionado ? " nps-port-num-sel" : ""}`}>{n}</span>
    </button>
  );
}

function SenalBadge({ senal }) {
  if (!senal) return null;
  if (senal.cargando) return <div className="nps-senal-badge nps-senal-cargando">…</div>;
  if (senal.error || !Number.isFinite(senal.rx)) return <div className="nps-senal-badge" style={{ background: "#64748b" }}>—</div>;
  const q = calidadDe(senal.rx);
  return <div className="nps-senal-badge nps-pop" style={{ background: q.color }}>{senal.rx.toFixed(1)}</div>;
}

function InfoFila({ etiqueta, valor, link }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, gap: 8 }}>
      <span style={{ fontSize: 11.5, color: "#94a3b8" }}>{etiqueta}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: link ? "#93c5fd" : "#f1f5f9", textAlign: "right" }}>{valor}</span>
    </div>
  );
}

function InfoPanelSenal({ info, cliente, onRepetir, onZoomFoto, onIniciarMover, moviendo, onQuitar }) {
  const [expandido, setExpandido] = useState(false);
  useEffect(() => { setExpandido(false); }, [info.n]);
  const calidad = info.rx != null ? calidadDe(info.rx) : null;
  const coords = coordsDe(cliente?.ubicacion);
  const fotos = cliente?.fotos || [];

  return (
    <div className="nps-info-panel nps-pop">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="nps-avatar" style={{ background: colorAvatarDe(info.nombre) }}>{inicialesDe(info.nombre)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.nombre || "—"}</div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>{cliente?.sn ? `${cliente.sn} · ` : ""}Puerto {info.n}</div>
        </div>
        {info.cargando && <div className="nps-spinner" />}
      </div>

      {!!info.error && <div style={{ fontSize: 11.5, color: "#f87171", marginTop: 8 }}>{info.error}</div>}

      {info.rx != null && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: calidad.color }}>{info.rx.toFixed(1)} dBm</span>
          <span style={{ border: `1px solid ${calidad.color}`, background: calidad.color + "22", borderRadius: 999, padding: "3px 10px", fontSize: 10.5, fontWeight: 800, color: calidad.color, letterSpacing: 0.3 }}>
            {calidad.label}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        <button className="nps-link-btn" onClick={onRepetir} disabled={info.cargando}>↻ Recargar</button>
        {!info.cargando && !info.error && (
          <button className="nps-link-btn" onClick={() => setExpandido(v => !v)}>
            {expandido ? "▲ Ocultar información" : "▼ Ver más información"}
          </button>
        )}
        {!!onIniciarMover && (
          <button
            className="nps-link-btn"
            style={{ color: moviendo ? "#fbbf24" : "#93c5fd" }}
            onClick={onIniciarMover}
          >
            {moviendo ? "⇄ Toca el puerto libre destino…" : "⇄ Mover a otro puerto"}
          </button>
        )}
        {!!onQuitar && (
          <button className="nps-link-btn" style={{ color: "#f87171" }} onClick={onQuitar}>
            🗑 Quitar de esta caja
          </button>
        )}
      </div>

      {expandido && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          {(info.board != null || info.pon != null) && <InfoFila etiqueta="Tarjeta / PON" valor={`${info.board ?? "—"} / ${info.pon ?? "—"}`} />}
          {!!info.modelo && <InfoFila etiqueta="Modelo ONU" valor={info.modelo} />}
          {info.distanciaMetros != null && <InfoFila etiqueta="Distancia fibra" valor={`${info.distanciaMetros} m`} />}
          {!!fechaCorta(info.ultimaConexion) && <InfoFila etiqueta="Última conexión" valor={fechaCorta(info.ultimaConexion)} />}
          {!!fechaCorta(info.ultimaDesconexion) && <InfoFila etiqueta="Última desconexión" valor={fechaCorta(info.ultimaDesconexion)} />}
          {!!cliente?.direccion && <InfoFila etiqueta="Dirección" valor={cliente.direccion} />}
          {!!coords && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <InfoFila etiqueta="Coordenadas" valor={`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} · ver en mapa ↗`} link />
            </a>
          )}
          {fotos.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto" }}>
              {fotos.map((url, i) => (
                <img key={i} src={url} alt="" onClick={() => onZoomFoto(url)} style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", cursor: "zoom-in", flexShrink: 0, background: "#1e293b" }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NapPuertoSelector({ cajaCodigo, capacidad, clientes, excluirClienteId, puertoSeleccionado, soloVer, onSelect, onMoverPuerto, onQuitarCliente, onClose }) {
  const [seleccionado, setSeleccionado] = useState(puertoSeleccionado ?? null);
  const [verInfo, setVerInfo] = useState(null);
  const [senalesGlobales, setSenalesGlobales] = useState(null);
  const [cargandoTodas, setCargandoTodas] = useState(false);
  const [fotoZoom, setFotoZoom] = useState(null);
  // Mover un cliente ya conectado a otro puerto libre dentro de la misma
  // caja -- se activa desde el panel de señal de un puerto ocupado, y el
  // siguiente clic en un puerto LIBRE confirma el destino.
  const [moviendo, setMoviendo] = useState(null); // { clienteId, nombre, desdePuerto }
  const cardRef = useRef(null);

  useEffect(() => {
    // Entrada con pop, igual criterio que el resto de modales de la app.
    requestAnimationFrame(() => cardRef.current?.classList.add("nps-card-in"));
  }, []);

  const ocupados = useMemo(() => {
    const map = {};
    for (const c of clientes) {
      if (String(c.caja_nap || "").trim().toLowerCase() !== String(cajaCodigo || "").trim().toLowerCase()) continue;
      if (excluirClienteId && c.id === excluirClienteId) continue;
      if (c.puerto_nap == null) continue;
      map[c.puerto_nap] = {
        id: c.id, nombre: c.nombre || "", sn: c.sn_onu || "", nodo: c.nodo || "",
        direccion: c.direccion || "", ubicacion: c.ubicacion || "",
        fotos: fotosDe(c),
      };
    }
    return map;
  }, [clientes, cajaCodigo, excluirClienteId]);

  const cap = Number(capacidad) || 8;
  const cols = Math.min(Math.ceil(cap / 2) || 1, MAX_COLS);
  const puertos = Array.from({ length: cap }, (_, i) => i + 1);

  const menorSenal = useMemo(() => {
    let peor = null;
    Object.entries(ocupados).forEach(([n, info]) => {
      const cli = clientes.find(c => c.nombre === info.nombre && String(c.puerto_nap) === String(n));
      const v = parseFloat(cli?.rx_signal);
      if (!Number.isFinite(v)) return;
      if (!peor || v < peor.rx) peor = { puerto: n, rx: v, nombre: info.nombre };
    });
    return peor;
  }, [ocupados, clientes]);

  const consultarSenalVivo = async (n) => {
    const info = ocupados[n];
    if (!info) return;
    setVerInfo({ n, nombre: info.nombre, cargando: true });
    const sn = String(info.sn || "").trim();
    if (!sn) { setVerInfo({ n, nombre: info.nombre, error: "Este cliente no tiene SN ONU registrado." }); return; }
    const esDim = DIM_NODOS.has(normNodo(info.nodo));
    const base = esDim ? OLT_SSH_API : HUAWEI_OLT_SNMP_API;
    if (!base) { setVerInfo({ n, nombre: info.nombre, error: "Servicio de señal no configurado." }); return; }
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 16000);
      let json = {};
      try {
        const endpoint = esDim ? "signal" : "onu-info";
        const params = esDim ? `?sn=${encodeURIComponent(sn)}&nodo=${encodeURIComponent(info.nodo || "")}` : `?sn=${encodeURIComponent(sn)}`;
        const res = await fetch(`${base}/${endpoint}${params}`, { signal: ctrl.signal });
        json = await res.json().catch(() => ({}));
      } finally { clearTimeout(tid); }
      if (!json?.ok) throw new Error(json?.error || "No se pudo consultar la señal.");
      setVerInfo({
        n, nombre: info.nombre,
        rx: json.rxPower != null ? Number(json.rxPower) : null,
        board: json.board ?? json.slot ?? null,
        pon: json.port ?? null,
        modelo: json.modelo || json.onuType || null,
        distanciaMetros: json.distanciaMetros ?? null,
        ultimaConexion: json.ultimaConexion || null,
        ultimaDesconexion: json.ultimaDesconexion || null,
      });
    } catch (e) {
      setVerInfo({ n, nombre: info.nombre, error: e.message || "Error de red." });
    }
  };

  const verTodasLasSenales = () => {
    const entradas = Object.entries(ocupados).filter(([, info]) => info.sn);
    if (!entradas.length) return;
    setCargandoTodas(true);
    const inicial = {};
    entradas.forEach(([n]) => { inicial[n] = { cargando: true }; });
    setSenalesGlobales(inicial);
    entradas.forEach(([n, info]) => {
      (async () => {
        const esDim = DIM_NODOS.has(normNodo(info.nodo));
        const base = esDim ? OLT_SSH_API : HUAWEI_OLT_SNMP_API;
        if (!base) { setSenalesGlobales(prev => ({ ...prev, [n]: { error: true } })); return; }
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 16000);
          let json = {};
          try {
            const res = await fetch(`${base}/signal?sn=${encodeURIComponent(info.sn)}`, { signal: ctrl.signal });
            json = await res.json().catch(() => ({}));
          } finally { clearTimeout(tid); }
          const rx = json?.rxPower;
          if (!json?.ok || rx == null || !Number.isFinite(Number(rx))) throw new Error();
          setSenalesGlobales(prev => ({ ...prev, [n]: { rx: Number(rx) } }));
        } catch {
          setSenalesGlobales(prev => ({ ...prev, [n]: { error: true } }));
        }
      })();
    });
  };

  return (
    <div className="nps-overlay" onClick={onClose}>
      <div ref={cardRef} className="nps-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Elegir puerto</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{cajaCodigo} · {cap} puertos</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {Object.keys(ocupados).length > 0 && (
              <button className="nps-ver-todas" onClick={verTodasLasSenales} disabled={cargandoTodas}>
                📶 Ver señales
              </button>
            )}
            <button onClick={onClose} style={{ width: 26, height: 26, border: "1px solid #e2e8f0", borderRadius: 7, background: "#f8fafc", cursor: "pointer", fontSize: 12, color: "#64748b" }}>✕</button>
          </div>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <div className="nps-tray">
            <div className="nps-tray-label">SPLITTER 1:{cap}</div>
            <div className="nps-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {puertos.map((n, index) => (
                <PortTile
                  key={n}
                  n={n}
                  index={index}
                  ocupado={ocupados[n]}
                  seleccionado={seleccionado === n}
                  destino={!!moviendo && !ocupados[n]}
                  onSelect={(puerto) => {
                    if (moviendo) {
                      onMoverPuerto?.(moviendo.clienteId, puerto);
                      setMoviendo(null);
                      setVerInfo(null);
                    } else {
                      setSeleccionado(puerto);
                    }
                  }}
                  onTapOcupado={consultarSenalVivo}
                  senal={senalesGlobales?.[n]}
                />
              ))}
            </div>
          </div>

          {!!menorSenal && (
            <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 10 }}>
              Señal más baja de esta caja: <b>{menorSenal.rx.toFixed(1)} dBm</b> (Puerto {menorSenal.puerto} · {menorSenal.nombre})
            </div>
          )}

          {!!verInfo && (
            <InfoPanelSenal
              info={verInfo}
              cliente={ocupados[verInfo.n]}
              onRepetir={() => consultarSenalVivo(verInfo.n)}
              onZoomFoto={setFotoZoom}
              moviendo={moviendo?.desdePuerto === verInfo.n}
              onIniciarMover={onMoverPuerto ? () => {
                setMoviendo(m => (m?.desdePuerto === verInfo.n
                  ? null
                  : { clienteId: ocupados[verInfo.n]?.id, nombre: verInfo.nombre, desdePuerto: verInfo.n }));
              } : null}
              onQuitar={onQuitarCliente ? () => {
                const id = ocupados[verInfo.n]?.id;
                if (id) { onQuitarCliente(id); setVerInfo(null); }
              } : null}
            />
          )}

          <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#64748b", fontWeight: 600, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
            <span><span className="nps-dot" style={{ background: "#16a34a" }} /> Ocupado (clic ve señal en vivo)</span>
            <span><span className="nps-dot" style={{ background: "#94a3b8" }} /> Libre</span>
          </div>
        </div>

        {soloVer ? (
          <button className="nps-confirm nps-confirm-ready" onClick={onClose}>Cerrar</button>
        ) : (
          <button
            className={`nps-confirm${seleccionado ? " nps-confirm-ready" : ""}`}
            disabled={!seleccionado}
            onClick={() => onSelect(seleccionado)}
          >
            {seleccionado ? `Usar puerto ${seleccionado}` : "Toca un puerto libre"}
          </button>
        )}
      </div>

      {fotoZoom && (
        <div className="nps-foto-zoom" onClick={() => setFotoZoom(null)}>
          <img src={fotoZoom} alt="" />
          <button onClick={() => setFotoZoom(null)}>✕</button>
        </div>
      )}

      <style>{`
        .nps-overlay { position: fixed; inset: 0; z-index: 4000; background: rgba(15,23,42,0.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; }
        .nps-card { background: #fff; border-radius: 16px; padding: 18px; width: 420px; max-width: 92vw; box-shadow: 0 24px 60px rgba(15,23,42,0.35); opacity: 0; transform: scale(0.92) translateY(10px); transition: opacity .22s ease, transform .22s cubic-bezier(.34,1.56,.64,1); }
        .nps-card-in { opacity: 1; transform: scale(1) translateY(0); }
        .nps-tray { background: #C7CDD6; border: 1px solid #8B93A1; border-radius: 16px; padding: 16px 10px 10px; position: relative; }
        .nps-tray-label { position: absolute; top: 4px; left: 0; right: 0; text-align: center; font-size: 8px; font-weight: 700; color: rgba(0,0,0,0.32); letter-spacing: 1px; }
        .nps-grid { display: grid; gap: 8px; }
        .nps-port { background: none; border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; padding: 3px; opacity: 0; animation: nps-pop-in 280ms cubic-bezier(.34,1.56,.64,1) forwards; }
        @keyframes nps-pop-in { from { opacity: 0; transform: scale(0.5) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .nps-port-icon { width: 100%; aspect-ratio: 44/52; position: relative; transition: transform .18s cubic-bezier(.34,1.56,.64,1); }
        .nps-port-sel { transform: scale(1.14); filter: drop-shadow(0 0 0 2px #3b82f6); }
        .nps-port-sel::after { content: ""; position: absolute; inset: -4px; border: 2px solid #3b82f6; border-radius: 10px; }
        .nps-port-destino .nps-port-icon { animation: nps-destino-pulse 1s ease-in-out infinite; }
        @keyframes nps-destino-pulse { 0%, 100% { filter: drop-shadow(0 0 0 rgba(251,191,36,0.6)); } 50% { filter: drop-shadow(0 0 6px rgba(251,191,36,0.9)); } }
        .nps-port-num { font-size: 10px; font-weight: 700; color: #64748b; margin-top: 3px; }
        .nps-port-num-ocu { color: #166534; }
        .nps-port-num-sel { color: #3b82f6; }
        .nps-senal-badge { position: absolute; top: -8px; right: -10px; min-width: 28px; height: 16px; padding: 0 4px; border-radius: 9px; color: #fff; font-size: 9px; font-weight: 800; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
        .nps-senal-cargando { background: #475569; }
        .nps-pop { animation: nps-pop-in 220ms cubic-bezier(.34,1.56,.64,1); }
        .nps-ver-todas { display: flex; align-items: center; gap: 4px; border: 1px solid #3b82f6; border-radius: 8px; padding: 4px 9px; background: #fff; color: #3b82f6; font-size: 10.5px; font-weight: 700; cursor: pointer; }
        .nps-ver-todas:disabled { opacity: .5; cursor: default; }
        .nps-info-panel { margin-top: 12px; padding: 14px; border-radius: 14px; background: #0f172a; }
        .nps-avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 13px; flex-shrink: 0; }
        .nps-spinner { width: 14px; height: 14px; border: 2px solid rgba(147,197,253,0.3); border-top-color: #93c5fd; border-radius: 50%; animation: nps-spin .7s linear infinite; }
        @keyframes nps-spin { to { transform: rotate(360deg); } }
        .nps-link-btn { background: none; border: none; color: #93c5fd; font-size: 11.5px; font-weight: 700; cursor: pointer; padding: 0; }
        .nps-link-btn:disabled { opacity: .5; cursor: default; }
        .nps-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
        .nps-confirm { margin-top: 16px; width: 100%; background: #cbd5e1; border: none; border-radius: 12px; padding: 13px; color: #fff; font-weight: 800; font-size: 14px; cursor: not-allowed; transition: background .2s, transform .15s; }
        .nps-confirm-ready { background: #3b82f6; cursor: pointer; animation: nps-wake 260ms cubic-bezier(.34,1.56,.64,1); }
        @keyframes nps-wake { 0% { transform: scale(1); } 50% { transform: scale(1.04); } 100% { transform: scale(1); } }
        .nps-foto-zoom { position: fixed; inset: 0; z-index: 5000; background: rgba(0,0,0,0.92); display: flex; align-items: center; justify-content: center; }
        .nps-foto-zoom img { max-width: 90%; max-height: 85%; border-radius: 8px; }
        .nps-foto-zoom button { position: absolute; top: 20px; right: 24px; background: rgba(255,255,255,0.15); border: none; border-radius: 20px; padding: 8px 12px; color: #fff; font-size: 16px; cursor: pointer; }
      `}</style>
    </div>
  );
}
