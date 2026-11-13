import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Reprogramar orden (web). Misma RPC que la app movil: cambia hora, dia+hora o
// la deja "Por coordinar" (sin fecha). Deja historial + mensaje en el chat.
export const MOTIVOS_REPROGRAMAR = ["Cliente pidió", "No contesta", "No estaba", "Lluvia", "Falta material", "Otro"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const hoyYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fechaHumana = (s) => {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${DIAS[d.getDay()]} ${m[3]}/${m[2]}`;
};
export const diasPorCoordinar = (desde) => {
  const t = new Date(desde || "").getTime();
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : 0;
};

const TPL_REPROGRAMADA = "Hola {nombre}, tu visita de {empresa} (orden #{codigo}) quedó reprogramada para el {fecha} a las {hora}. Si necesitas cambiarla, escríbenos a este número. — {empresa}";
const TPL_POR_COORDINAR = "Hola {nombre}, tu visita de {empresa} (orden #{codigo}) quedó en pausa como nos indicaste. Cuando tengas una fecha, escríbenos a este número y te la agendamos. — {empresa}";
// "Sin fecha" cuando el cliente NO pidio la pausa: el mensaje cambia segun el motivo.
const TPL_NO_CONTESTA = "Hola {nombre}, intentamos comunicarnos contigo para coordinar tu visita de {empresa} (orden #{codigo}) y no tuvimos respuesta. Escríbenos a este número cuando puedas y la agendamos. — {empresa}";
const TPL_NO_ESTABA = "Hola {nombre}, nuestro técnico fue a tu domicilio para tu visita de {empresa} (orden #{codigo}) y no encontramos a nadie. Escríbenos a este número para coordinar una nueva fecha. — {empresa}";

async function avisarClienteWhatsApp(orden, tipo, fecha, hora, motivo) {
  const cel = String(orden?.celular || "").trim();
  if (!cel) return "sin celular";
  const empresa = orden?.empresa || "Americanet";
  const { data: cfg } = await supabase.from("whatsapp_config").select("*").eq("empresa", empresa).maybeSingle();
  if (!cfg?.habilitado || !cfg.base_url || !cfg.api_key || !cfg.instance_name) return "WhatsApp no configurado";
  const tpl = tipo === "sin_fecha"
    ? (motivo === "No contesta" ? (String(cfg.template_no_contesta || "").trim() || TPL_NO_CONTESTA)
      : motivo === "No estaba" ? (String(cfg.template_no_estaba || "").trim() || TPL_NO_ESTABA)
      : (String(cfg.template_por_coordinar || "").trim() || TPL_POR_COORDINAR))
    : (String(cfg.template_reprogramada || "").trim() || TPL_REPROGRAMADA);
  const nombre = String(orden?.nombre || "").trim().split(/\s+/)[0] || "";
  const msg = tpl
    .replace(/{nombre}/g, nombre).replace(/{codigo}/g, orden?.codigo || "")
    .replace(/{empresa}/g, empresa).replace(/{tecnico}/g, orden?.tecnico || "")
    .replace(/{fecha}/g, fecha ? fechaHumana(fecha) : "").replace(/{hora}/g, hora || "")
    .replace(/{direccion}/g, orden?.direccion || "").replace(/{motivo}/g, motivo || "");
  let phone = cel.replace(/[\s\-()]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (/^9\d{8}$/.test(phone)) phone = "51" + phone;
  const res = await fetch(`${cfg.base_url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(cfg.instance_name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.api_key },
    body: JSON.stringify({ number: phone, text: msg }),
  });
  return res.ok ? "" : `HTTP ${res.status}`;
}

export default function ReprogramarOrdenModal({ orden, onClose, onListo, autor, autorRol }) {
  const hoy = hoyYmd();
  const porCoordinar = !!orden?.porCoordinarDesde;
  const [tipo, setTipo] = useState("fecha");
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("Cliente pidió");
  const [nota, setNota] = useState("");
  const [avisar, setAvisar] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    if (!orden) return;
    setTipo("fecha");
    const f = String(orden.fechaActuacion || "").slice(0, 10);
    setFecha(f && f >= hoy ? f : hoy);
    setHora(String(orden.hora || "").slice(0, 5));
    setMotivo("Cliente pidió");
    setNota("");
    setAvisar(!!String(orden.celular || "").trim());
    setError("");
    setGuardando(false);
    setHistorial([]);
    supabase.from("ordenes_reprogramaciones").select("*").eq("orden_id", Number(orden.id)).order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => setHistorial(data || []), () => {});
  }, [orden?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!orden) return null;

  const guardar = async () => {
    if (guardando) return;
    setError("");
    const fechaFinal = tipo === "hora" ? hoy : fecha;
    if (tipo !== "sin_fecha") {
      if (!/^\d{1,2}:\d{2}$/.test(hora)) return setError("Elige la nueva hora.");
      if (!fechaFinal || fechaFinal < hoy) return setError("Elige una fecha de hoy en adelante.");
    }
    if (motivo === "Otro" && !nota.trim()) return setError("Escribe el motivo en la nota.");
    setGuardando(true);
    try {
      const { data, error: err } = await supabase.rpc("reprogramar_orden", {
        p_orden_id: Number(orden.id),
        p_tipo: tipo,
        p_fecha: tipo === "sin_fecha" ? null : fechaFinal,
        p_hora: tipo === "sin_fecha" ? null : hora,
        p_motivo: motivo,
        p_nota: nota.trim(),
        p_autor: autor || "",
        p_autor_rol: autorRol || "",
      });
      if (err) throw err;
      let avisoWa = "";
      if (avisar) {
        try { avisoWa = await avisarClienteWhatsApp(orden, tipo, fechaFinal, hora, motivo); } catch (e) { avisoWa = String(e?.message || e); }
      }
      onListo?.(orden, {
        estado: /pendient/i.test(String(orden.estado || "")) ? orden.estado : "Pendiente",
        atendidaSinLiquidarEn: null,
        reprogramaciones: Number(data?.reprogramaciones) || (Number(orden.reprogramaciones) || 0) + 1,
        porCoordinarDesde: tipo === "sin_fecha" ? new Date().toISOString() : null,
        ...(tipo === "sin_fecha" ? {} : { fechaActuacion: fechaFinal, hora }),
      }, avisar ? (avisoWa ? `No se pudo avisar por WhatsApp (${avisoWa}).` : "Se avisó al cliente por WhatsApp.") : "");
      onClose?.();
    } catch (e) {
      setError(e?.message || "No se pudo reprogramar.");
    } finally {
      setGuardando(false);
    }
  };

  const opcion = (valor, titulo, cuerpo) => {
    const sel = tipo === valor;
    return (
      <div onClick={() => setTipo(valor)} style={{ border: `1.5px solid ${sel ? "#7c3aed" : "#e2e8f0"}`, background: sel ? "#faf5ff" : "#fff", borderRadius: 12, padding: "10px 12px", marginBottom: 8, cursor: "pointer" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: sel ? "#5b21b6" : "#334155", cursor: "pointer" }}>
          <input type="radio" checked={sel} onChange={() => setTipo(valor)} />
          {titulo}
        </label>
        {sel && cuerpo && <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>{cuerpo}</div>}
      </div>
    );
  };
  const inp = { padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, fontFamily: "inherit" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 18, boxShadow: "0 20px 50px rgba(15,23,42,0.3)", color: "#0f172a" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 22 }}>📅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{porCoordinar ? "Poner fecha a la orden" : "Reprogramar orden"}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{orden.codigo} · {orden.nombre} · 👷 {orden.tecnico || "Sin técnico"}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}>✕</button>
        </div>

        {porCoordinar && (
          <div style={{ fontSize: 12, background: "#faf5ff", color: "#6b21a8", borderRadius: 8, padding: 8, marginBottom: 10, fontWeight: 600 }}>
            ⏸ Por coordinar desde hace {diasPorCoordinar(orden.porCoordinarDesde)} día(s). Al ponerle fecha vuelve a aparecer en la app del técnico.
          </div>
        )}

        {opcion("fecha", "Elegir día y hora", (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ ...inp, flex: 1 }} />
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ ...inp, width: 120 }} />
          </div>
        ))}
        {opcion("hora", "Cambiar solo la hora (hoy)", (
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ ...inp, width: 140 }} />
        ))}
        {!porCoordinar && opcion("sin_fecha", "Sin fecha — el cliente se comunicará", (
          <div style={{ fontSize: 12, color: "#6b21a8" }}>Sale de la lista del técnico y queda en "⏸ Por coordinar" hasta que se le ponga fecha.</div>
        ))}

        <div style={{ fontSize: 13, fontWeight: 800, color: "#334155", margin: "6px 0" }}>Motivo</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {MOTIVOS_REPROGRAMAR.map((mo) => (
            <button key={mo} onClick={() => setMotivo(mo)} style={{ padding: "5px 12px", borderRadius: 999, border: `1px solid ${motivo === mo ? "#7c3aed" : "#cbd5e1"}`, background: motivo === mo ? "#7c3aed" : "#fff", color: motivo === mo ? "#fff" : "#334155", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{mo}</button>
          ))}
        </div>
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder={motivo === "Otro" ? "Escribe el motivo" : "Nota (opcional)"} style={{ ...inp, width: "100%", boxSizing: "border-box", resize: "vertical" }} />

        {!!String(orden.celular || "").trim() && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 14, color: "#14532d", fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />
            Avisar al cliente por WhatsApp ({orden.celular})
          </label>
        )}

        {error && <div style={{ marginTop: 10, color: "#dc2626", fontSize: 13, fontWeight: 600 }}>{error}</div>}

        <button onClick={() => void guardar()} disabled={guardando} style={{ marginTop: 12, width: "100%", padding: "11px 0", border: "none", borderRadius: 10, background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: guardando ? 0.6 : 1 }}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>

        {historial.length > 0 && (
          <div style={{ marginTop: 14, borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 6 }}>Historial ({historial.length})</div>
            {historial.map((h) => (
              <div key={h.id} style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
                <b>{new Date(h.created_at).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" })}</b>{" · "}
                {h.tipo === "sin_fecha" ? "⏸ Por coordinar" : `${h.tipo === "hora" ? "🕒" : "📅"} ${fechaHumana(h.fecha_nueva)} ${String(h.hora_nueva || "").slice(0, 5)}`}
                {" · "}{h.motivo || "-"}{h.nota ? ` (${h.nota})` : ""} · {h.autor || "-"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
