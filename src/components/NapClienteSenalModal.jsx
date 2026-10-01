import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

// Ver señal / buscar SN de un cliente seleccionado en "Vincular Clientes
// NAP" -- sin necesidad de que ya este en una caja. Si tiene SN registrado,
// consulta la señal en vivo directo. Si no tiene, revisa su conexion al
// MikroTik (vía el mismo endpoint de diagnostico que usa el sidebar) para
// sacar el caller-id (MAC) y desde ahi ofrecer "Buscar SN por MAC".

const DIAGNO_BASE = import.meta.env.DEV ? "" : "https://amnet-diagno.0lthka.easypanel.host";
const OLT_SSH_API = String(import.meta.env.VITE_OLT_SSH_API || "").trim().replace(/\/$/, "");
const HUAWEI_OLT_SNMP_API = String(import.meta.env.VITE_HUAWEI_OLT_SNMP_API || "").trim().replace(/\/$/, "");
const NODOS_HUAWEI = new Set(["Nod_01", "Nod_02", "Nod_03"]);
const esNodoOltSsh = (nodo) => !!OLT_SSH_API && !NODOS_HUAWEI.has(String(nodo || ""));

function calidadDe(rx) {
  if (rx >= -24) return { label: "BUENA", color: "#22c55e" };
  if (rx >= -27) return { label: "REGULAR", color: "#f59e0b" };
  return { label: "MALA", color: "#ef4444" };
}

export default function NapClienteSenalModal({ cliente, onClose, onSnGuardado }) {
  const [fase, setFase] = useState("cargando"); // cargando | senal | mikrotik | buscando | error
  const [senal, setSenal] = useState(null);
  const [mikrotik, setMikrotik] = useState(null);
  const [snCandidato, setSnCandidato] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => { requestAnimationFrame(() => cardRef.current?.classList.add("ncs-in")); }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setFase("cargando");
      setError("");
      if (cliente.sn_onu) {
        // Tiene SN: directo a consultar señal en vivo.
        try {
          const base = esNodoOltSsh(cliente.nodo) ? OLT_SSH_API : HUAWEI_OLT_SNMP_API;
          if (!base) throw new Error("Servicio de señal no configurado para este nodo.");
          const endpoint = esNodoOltSsh(cliente.nodo)
            ? `${base}/signal?sn=${encodeURIComponent(cliente.sn_onu)}&nodo=${encodeURIComponent(cliente.nodo || "")}`
            : `${base}/onu-info?sn=${encodeURIComponent(cliente.sn_onu)}`;
          const res = await fetch(endpoint);
          const json = await res.json().catch(() => ({}));
          if (cancelado) return;
          if (!json?.ok) throw new Error(json?.error || "No se pudo consultar la señal.");
          setSenal({ rx: json.rxPower != null ? Number(json.rxPower) : null, estado: json.estado || null });
          setFase("senal");
        } catch (e) {
          if (!cancelado) { setError(e.message || "Error al consultar señal."); setFase("error"); }
        }
        return;
      }
      // Sin SN: revisar conexion al MikroTik para sacar el caller-id (MAC).
      try {
        const res = await fetch(`${DIAGNO_BASE}/api/diagnostico-servicio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dni: cliente.dni || "", cliente: cliente.nombre || "", nodo: cliente.nodo || "", userPppoe: cliente.usuario_nodo || "" }),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (json?.ok !== true) throw new Error(json?.error || "Sin respuesta del servidor de diagnóstico.");
        setMikrotik(json.mikrotik || null);
        setFase("mikrotik");
      } catch (e) {
        if (!cancelado) { setError(e.message || "Error al consultar MikroTik."); setFase("error"); }
      }
    })();
    return () => { cancelado = true; };
  }, [cliente]);

  const buscarSnPorMac = async () => {
    const mac = String(mikrotik?.callerId || "").trim();
    if (!mac || !cliente.nodo) return;
    setFase("buscando");
    setError("");
    try {
      const base = esNodoOltSsh(cliente.nodo) ? OLT_SSH_API : HUAWEI_OLT_SNMP_API;
      if (!base) throw new Error("Servicio de resolución de SN no configurado para este nodo.");
      const params = new URLSearchParams({ mac });
      if (esNodoOltSsh(cliente.nodo)) params.set("nodo", cliente.nodo);
      const res = await fetch(`${base}/resolve-sn?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) throw new Error(json?.error || "No se encontró ninguna ONU con esa MAC.");
      setSnCandidato({ sn: json.sn, port: json.port, onuId: json.onuId, olt: json.olt, mac });
      setFase("mikrotik");
    } catch (e) {
      setError(e.message || "No se pudo resolver el SN por MAC.");
      setFase("mikrotik");
    }
  };

  const confirmarSn = async () => {
    if (!snCandidato?.sn) return;
    setGuardando(true);
    try {
      await supabase.from("sn_onu_historial").insert({
        cliente_id: cliente.id, sn_anterior: cliente.sn_onu || null,
        sn_nuevo: snCandidato.sn, mac: snCandidato.mac || null, origen: "nap_vincular_mapa",
      }).then(({ error }) => { if (error) console.warn("No se pudo guardar historial de SN:", error.message); });
      const { error } = await supabase.from("clientes").update({ sn_onu: snCandidato.sn }).eq("id", cliente.id);
      if (error) throw error;
      onSnGuardado?.(cliente.id, snCandidato.sn);
      onClose();
    } catch (e) {
      setError(e.message || "No se pudo guardar el SN.");
    } finally {
      setGuardando(false);
    }
  };

  const conectado = mikrotik && ["connected", "conectado"].includes(String(mikrotik.estado || "").toLowerCase());

  return (
    <div className="ncs-overlay" onClick={onClose}>
      <div ref={cardRef} className="ncs-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{cliente.nombre || "-"}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{cliente.dni || ""}{cliente.nodo ? ` · ${cliente.nodo}` : ""}{cliente.caja_nap ? ` · ${cliente.caja_nap}` : " · Sin caja"}</div>
          </div>
          <button onClick={onClose} style={{ width: 26, height: 26, border: "1px solid #e2e8f0", borderRadius: 7, background: "#f8fafc", cursor: "pointer", fontSize: 12, color: "#64748b" }}>✕</button>
        </div>

        {fase === "cargando" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0", justifyContent: "center" }}>
            <div className="ncs-spinner" /><span style={{ fontSize: 12, color: "#64748b" }}>Consultando…</span>
          </div>
        )}

        {fase === "error" && (
          <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px" }}>{error}</div>
        )}

        {fase === "senal" && senal && (
          <div className="ncs-pop" style={{ background: "#0f172a", borderRadius: 14, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>SN {cliente.sn_onu}</div>
            {senal.rx != null ? (
              <>
                <div style={{ fontSize: 30, fontWeight: 800, color: calidadDe(senal.rx).color, marginTop: 6 }}>{senal.rx.toFixed(1)} dBm</div>
                <div style={{ display: "inline-block", marginTop: 6, border: `1px solid ${calidadDe(senal.rx).color}`, background: calidadDe(senal.rx).color + "22", borderRadius: 999, padding: "3px 12px", fontSize: 10.5, fontWeight: 800, color: calidadDe(senal.rx).color }}>
                  {calidadDe(senal.rx).label}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#f87171", marginTop: 8 }}>ONU sin señal (apagada o desconectada)</div>
            )}
          </div>
        )}

        {(fase === "mikrotik" || fase === "buscando") && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: conectado ? "#f0fdf4" : "#fef2f2", border: `1px solid ${conectado ? "#bbf7d0" : "#fecaca"}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: conectado ? "#22c55e" : "#ef4444" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: conectado ? "#166534" : "#991b1b" }}>
                {mikrotik ? (conectado ? "Conectado al MikroTik" : "Desconectado del MikroTik") : "Sin datos de MikroTik"}
              </span>
            </div>
            {!!mikrotik?.callerId && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>Caller-ID (MAC): <b>{mikrotik.callerId}</b></div>
            )}
            {!cliente.sn_onu && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Este cliente no tiene SN de ONU registrado.</div>
            )}

            {!!error && <div style={{ fontSize: 11.5, color: "#dc2626", marginTop: 8 }}>{error}</div>}

            {snCandidato ? (
              <div className="ncs-pop" style={{ marginTop: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>
                  SN detectado: <b>{snCandidato.sn}</b>{snCandidato.olt ? ` — ${snCandidato.olt}` : ""}{snCandidato.port != null ? `, puerto ${snCandidato.port}` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={confirmarSn} disabled={guardando} style={{ padding: "6px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                    {guardando ? "Guardando…" : "Confirmar y guardar"}
                  </button>
                  <button onClick={() => setSnCandidato(null)} style={{ padding: "6px 12px", background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                    Descartar
                  </button>
                </div>
              </div>
            ) : mikrotik?.callerId ? (
              <button onClick={buscarSnPorMac} disabled={fase === "buscando"} className="ncs-buscar-btn">
                {fase === "buscando" ? "Buscando…" : "🔍 Buscar SN por MAC"}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <style>{`
        .ncs-overlay { position: fixed; inset: 0; z-index: 4000; background: rgba(15,23,42,0.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; }
        .ncs-card { background: #fff; border-radius: 16px; padding: 18px; width: 360px; max-width: 92vw; box-shadow: 0 24px 60px rgba(15,23,42,0.35); opacity: 0; transform: scale(0.92) translateY(10px); transition: opacity .22s ease, transform .22s cubic-bezier(.34,1.56,.64,1); }
        .ncs-in { opacity: 1; transform: scale(1) translateY(0); }
        .ncs-pop { animation: ncs-pop-in 220ms cubic-bezier(.34,1.56,.64,1); }
        @keyframes ncs-pop-in { from { opacity: 0; transform: scale(0.9) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .ncs-spinner { width: 16px; height: 16px; border: 2px solid rgba(100,116,139,0.25); border-top-color: #3b82f6; border-radius: 50%; animation: ncs-spin .7s linear infinite; }
        @keyframes ncs-spin { to { transform: rotate(360deg); } }
        .ncs-buscar-btn { margin-top: 10px; width: 100%; padding: 10px; background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 10px; color: #1d4ed8; font-weight: 700; font-size: 12.5px; cursor: pointer; }
        .ncs-buscar-btn:disabled { opacity: .6; cursor: default; }
      `}</style>
    </div>
  );
}
