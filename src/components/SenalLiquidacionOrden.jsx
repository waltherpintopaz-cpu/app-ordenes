import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { calidadSenal, haceTexto, cargarLiquidacionYSenal, consultarSenalEnVivo } from "../services/senalOnu";

// Señal de la ONU (en vivo + la medida al liquidar) y datos de la liquidacion,
// dentro del panel "Datos de la orden" del chat (13-nov).
const APIS = {
  vsol: String(import.meta.env.VITE_OLT_SSH_API || "https://olt-signal-dim.wolgest.com").trim(),
  huawei: String(import.meta.env.VITE_HUAWEI_OLT_SNMP_API || "https://huawei-olt-snmp.wolgest.com").trim(),
};

export default function SenalLiquidacionOrden({ o }) {
  const [datos, setDatos] = useState(null);
  const [vivo, setVivo] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorVivo, setErrorVivo] = useState("");
  const [fotoGrande, setFotoGrande] = useState("");
  // "hace X min" se refresca solo; si la lectura tiene mas de 10 min, se vuelve a leer.
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const leerVivo = async (sn, nodo) => {
    if (!sn) return;
    setLeyendo(true); setErrorVivo("");
    try { setVivo(await consultarSenalEnVivo(supabase, { sn, nodo, apis: APIS })); }
    catch (e) { setErrorVivo(String(e?.message || e)); }
    finally { setLeyendo(false); }
  };

  useEffect(() => {
    let activo = true;
    setDatos(null); setVivo(null); setErrorVivo("");
    cargarLiquidacionYSenal(supabase, o).then((d) => {
      if (!activo) return;
      setDatos(d);
      // Al abrir el chat se consulta la señal al momento (actualizada).
      if (d.sn) void leerVivo(d.sn, o.nodo || d.cli?.nodo);
    });
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id, o.codigo, o.estado]);

  const viejo = vivo?.at && Date.now() - new Date(vivo.at).getTime() > 10 * 60000;
  useEffect(() => {
    if (viejo && datos?.sn && !leyendo) void leerVivo(datos.sn, o.nodo || datos.cli?.nodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viejo]);

  if (!datos) return null;
  const { liq, cli, sn, fotos } = datos;
  const qVivo = calidadSenal(vivo?.rx);
  const qGuardada = !vivo ? calidadSenal(cli?.rx_signal) : null;
  const qLiq = calidadSenal(liq?.parametro);
  if (!sn && !qLiq && !liq && !qGuardada) return null;

  const caja = { marginTop: 10, borderRadius: 12, border: "1px solid #e2e8f0", padding: "8px 10px 10px", background: "#fff", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" };
  const sub = { fontSize: 11, color: "#64748b", fontWeight: 700, margin: "6px 0 4px" };
  const pildora = (q, extra) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: q.bg, border: `1px solid ${q.b}`, color: q.c, fontWeight: 800, fontSize: 13 }}>
      {q.txt} dBm <span style={{ fontWeight: 700, fontSize: 11 }}>· {q.t}</span>{extra}
    </span>
  );
  const linea = (l, v) => (!v && v !== 0 ? null : (
    <div key={l} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ width: 82, flexShrink: 0, fontSize: 11.5, color: "#94a3b8", fontWeight: 600 }}>{l}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "#0f172a", fontWeight: 600, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{v}</span>
    </div>
  ));
  const okLiq = /complet/i.test(String(liq?.resultado_final || ""));
  const cobro = /si/i.test(String(liq?.cobro_realizado || "")) || Number(liq?.monto_cobrado) > 0;

  return (
    <>
      {(sn || qLiq || qGuardada) && (
        <div style={caja}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", flex: 1 }}>📶 Señal de la ONU</span>
            {sn && (
              <button type="button" disabled={leyendo} onClick={() => void leerVivo(sn, o.nodo || cli?.nodo)}
                style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 8, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: leyendo ? "default" : "pointer", opacity: leyendo ? 0.6 : 1 }}>
                {leyendo ? "Leyendo…" : "↻ Actualizar"}
              </button>
            )}
          </div>
          {qVivo && (<><div style={sub}>Ahora ({haceTexto(vivo.at)})</div>{pildora(qVivo)}{vivo.tx != null && <span style={{ marginLeft: 8, fontSize: 11.5, color: "#64748b", fontWeight: 600 }}>TX {Number(vivo.tx).toFixed(2)}</span>}</>)}
          {!qVivo && leyendo && <div style={{ ...sub, fontWeight: 600 }}>Buscando el SN en la OLT… (puede tardar hasta 1 min)</div>}
          {!qVivo && !leyendo && errorVivo && <div style={{ fontSize: 11.5, color: "#b45309", fontWeight: 600, marginTop: 6 }}>⚠️ {errorVivo}</div>}
          {qGuardada && !leyendo && (<><div style={sub}>Última guardada {cli?.signal_updated_at ? `(${haceTexto(cli.signal_updated_at)})` : ""}</div>{pildora(qGuardada)}</>)}
          {qLiq && (<><div style={sub}>Medida por el técnico al liquidar</div>{pildora(qLiq)}</>)}
          {sn && <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 6 }}>SN {sn}</div>}
        </div>
      )}
      {liq && (
        <div style={{ ...caja, borderColor: okLiq ? "#bbf7d0" : "#fde68a", background: okLiq ? "#f0fdf4" : "#fffbeb" }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, color: okLiq ? "#166534" : "#92400e" }}>{okLiq ? "✅" : "⚠️"} Liquidación · {liq.resultado_final || "—"}</div>
          {linea("Técnico", liq.tecnico_liquida)}
          {linea("Fecha", liq.fecha_liquidacion ? new Date(liq.fecha_liquidacion).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "")}
          {linea("Observación", liq.observacion_final)}
          {linea("Caja NAP", liq.caja_nap)}
          {linea("SN ONU", liq.sn_onu_liquidacion)}
          {linea("Etiqueta", liq.codigo_etiqueta)}
          {linea("Cobro", cobro ? `S/ ${liq.monto_cobrado ?? ""}${liq.medio_pago ? ` · ${liq.medio_pago}` : ""}` : "")}
          {fotos.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {fotos.slice(0, 8).map((u) => (
                <img key={u} src={u} alt="" loading="lazy" onClick={() => setFotoGrande(u)} style={{ width: 58, height: 58, objectFit: "cover", borderRadius: 8, cursor: "zoom-in", border: "1px solid #e2e8f0" }} />
              ))}
              {fotos.length > 8 && <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center" }}>+{fotos.length - 8}</span>}
            </div>
          )}
        </div>
      )}
      {fotoGrande && (
        <div onClick={() => setFotoGrande("")} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.85)", display: "grid", placeItems: "center", cursor: "zoom-out", padding: 20 }}>
          <img src={fotoGrande} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10 }} />
        </div>
      )}
    </>
  );
}
