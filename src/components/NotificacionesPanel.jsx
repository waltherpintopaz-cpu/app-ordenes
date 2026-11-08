import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, MessageCircle, Mail, Save, Send, CircleAlert, CircleCheck } from "lucide-react";
import { supabase } from "../supabaseClient";

// Configuracion > Notificaciones: como se ven los avisos de CHAT en el
// celular (color, icono, sonido, titulo) y el color de los demas avisos.
// Se guarda en notificaciones_config (fila id=1) del Supabase de cada empresa.
// Quien lee esta config al enviar:
//  - DIM: dim-notificaciones-server (Database Webhooks).
//  - Americanet: el trigger chat_*_push -> Edge Function send-push-notification.
// Iconos y sonidos son una lista cerrada porque tienen que venir dentro de la
// APK (res/drawable/notif_chat_*.xml y canales chat_* en notificationService).
const NOTIF_URL = String(import.meta.env.VITE_NOTIF_URL || "https://n8n-notificacionesdim.0lthka.easypanel.host").replace(/\/+$/, "");

const EMPRESAS = {
  americanet: { app: "Amnet Gestión", chat: "#F47A20", normal: "#1E4F9C" },
  dim: { app: "DIM Gestión", chat: "#7C3AED", normal: "#0A2FD6" },
};
const ICONOS = [
  { id: "globo", label: "Globo", Icono: MessageCircle },
  { id: "campana", label: "Campana", Icono: Bell },
  { id: "sobre", label: "Sobre", Icono: Mail },
];
const SONIDOS = [
  { id: "burbuja", label: "Burbuja", desc: "Un blip corto" },
  { id: "doble", label: "Doble pitido", desc: "Dos pitidos rápidos" },
  { id: "campana", label: "Campana", desc: "Tono que se apaga lento" },
  { id: "predeterminado", label: "Del celular", desc: "El sonido de notificación del teléfono" },
];
const COLORES_SUGERIDOS = ["#F47A20", "#7C3AED", "#16A34A", "#DB2777", "#0891B2", "#DC2626", "#1E4F9C", "#0A2FD6"];
const colorValido = (c) => /^#[0-9a-fA-F]{6}$/.test(String(c || ""));

// Tono de muestra en el navegador (los sonidos reales van dentro de la APK
// y se generaron con estas mismas formas de onda).
function reproducirMuestra(id) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const nota = (t0, f0, f1, dur, vol = 0.25) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f0, ctx.currentTime + t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + t0 + dur);
      g.gain.setValueAtTime(vol, ctx.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.02);
    };
    if (id === "burbuja") nota(0, 500, 1300, 0.25);
    else if (id === "doble") { nota(0, 880, null, 0.14); nota(0.22, 1175, null, 0.16); }
    else if (id === "campana") { nota(0, 1046, null, 1.0, 0.2); nota(0, 2093, null, 0.8, 0.1); }
    else nota(0, 660, null, 0.3);
  } catch { /* sin audio */ }
}

export default function NotificacionesPanel({ usuario, empresa = "dim" }) {
  const def = EMPRESAS[empresa] || EMPRESAS.dim;
  const [cargando, setCargando] = useState(true);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [cfg, setCfg] = useState({ chat_activo: true, chat_color: def.chat, normal_color: def.normal, chat_icono: "globo", chat_sonido: "burbuja", chat_prefijo: "💬" });
  const [cambios, setCambios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const mostrarAviso = (texto, ok = true) => { setAviso({ texto, ok }); setTimeout(() => setAviso(null), 6000); };
  const cambiar = (k, v) => { setCfg((p) => ({ ...p, [k]: v })); setCambios(true); };

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.from("notificaciones_config").select("*").eq("id", 1).maybeSingle();
    if (error) setFaltaTabla(true);
    else { setFaltaTabla(false); if (data) setCfg((p) => ({ ...p, ...data })); }
    setCargando(false);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async () => {
    if (!colorValido(cfg.chat_color) || !colorValido(cfg.normal_color)) { mostrarAviso("Los colores deben tener el formato #RRGGBB.", false); return false; }
    setGuardando(true);
    const fila = {
      id: 1, chat_activo: !!cfg.chat_activo, chat_color: cfg.chat_color.toUpperCase(), normal_color: cfg.normal_color.toUpperCase(),
      chat_icono: cfg.chat_icono, chat_sonido: cfg.chat_sonido, chat_prefijo: String(cfg.chat_prefijo || "").trim(),
      updated_at: new Date().toISOString(), updated_by: usuario || null,
    };
    const { error } = await supabase.from("notificaciones_config").upsert(fila, { onConflict: "id" });
    setGuardando(false);
    if (error) { mostrarAviso(`No se pudo guardar: ${error.message}`, false); return false; }
    setCambios(false);
    mostrarAviso("Guardado. Se aplica desde la próxima notificación.");
    return true;
  };

  const probar = async () => {
    if (!usuario) { mostrarAviso("No se reconoce tu usuario.", false); return; }
    if (cambios && !(await guardar())) return;
    setProbando(true);
    try {
      let r;
      if (empresa === "americanet") {
        const prefijo = String(cfg.chat_prefijo || "").trim();
        const { data, error } = await supabase.functions.invoke("send-push-notification", {
          body: {
            tecnico_nombre: usuario,
            title: `${prefijo ? `${prefijo} ` : ""}Prueba de chat`,
            body: "Así se verán los mensajes del chat.",
            data: { tipo: "prueba" },
            android: { channelId: `chat_${cfg.chat_sonido}`, icon: `notif_chat_${cfg.chat_icono}`, color: cfg.chat_color },
          },
        });
        r = error ? { ok: false, error: error.message } : data?.ok === false ? { ok: false, error: data?.message || "No se pudo enviar." } : { ok: true };
      } else {
        const resp = await fetch(`${NOTIF_URL}/notificaciones/prueba?empresa=${encodeURIComponent(empresa)}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usuario }),
        });
        r = await resp.json().catch(() => ({ ok: false, error: "El servidor no respondió." }));
      }
      if (r.ok) mostrarAviso("Listo. Revisa tu celular: debe llegar \"Prueba de chat\".");
      else mostrarAviso(r.error || "No se pudo enviar la prueba.", false);
    } catch (e) {
      mostrarAviso(e?.message || "No se pudo enviar la prueba.", false);
    } finally {
      setProbando(false);
    }
  };

  if (cargando) return <div style={{ padding: 24, color: "#64748b" }}>Cargando…</div>;

  const IconoChat = (ICONOS.find((i) => i.id === cfg.chat_icono) || ICONOS[0]).Icono;
  const prefijo = String(cfg.chat_prefijo || "").trim();

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bell size={22} color="#7c3aed" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>Notificaciones</h2>
          <div style={{ fontSize: 13, color: "#64748b" }}>Cómo se ven en el celular los avisos de chat de <b>{def.app}</b>, para distinguirlos de los demás.</div>
        </div>
      </div>

      {faltaTabla && (
        <div style={{ ...caja, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
          Falta crear la tabla <code>notificaciones_config</code> en Supabase (SQL <code>20261108_notificaciones_config.sql</code>).
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          {/* Activar */}
          <div style={{ ...caja, display: "flex", alignItems: "center", gap: 10 }}>
            {cfg.chat_activo ? <Bell size={20} color="#16a34a" /> : <BellOff size={20} color="#94a3b8" />}
            <div style={{ flex: 1, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>Avisos de chat</div>
              <div style={{ color: "#64748b" }}>{cfg.chat_activo ? "Llegan al celular de técnicos, gestoras y admins." : "Apagados: los mensajes se guardan, pero no avisan al celular."}</div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#0f172a", cursor: "pointer" }}>
              <input id="notif-chat-activo" type="checkbox" checked={!!cfg.chat_activo} onChange={(e) => cambiar("chat_activo", e.target.checked)} />
              Activos
            </label>
          </div>

          {/* Color chat */}
          <div style={caja}>
            <div style={tituloSeccion}>Color de los avisos de chat</div>
            <SelectorColor id="notif-chat-color" valor={cfg.chat_color} onChange={(v) => cambiar("chat_color", v)} />
          </div>

          {/* Icono */}
          <div style={caja}>
            <div style={tituloSeccion}>Ícono del chat</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ICONOS.map(({ id, label, Icono }) => {
                const sel = cfg.chat_icono === id;
                return (
                  <button key={id} type="button" onClick={() => cambiar("chat_icono", id)}
                    style={{ ...opcion, borderColor: sel ? cfg.chat_color : "#e2e8f0", background: sel ? "#f8fafc" : "#fff" }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: sel ? cfg.chat_color : "#cbd5e1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icono size={16} color="#fff" fill="#fff" />
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sonido */}
          <div style={caja}>
            <div style={tituloSeccion}>Sonido del chat</div>
            <div style={{ display: "grid", gap: 6 }}>
              {SONIDOS.map(({ id, label, desc }) => (
                <label key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${cfg.chat_sonido === id ? cfg.chat_color : "#e2e8f0"}`, cursor: "pointer" }}>
                  <input type="radio" name="notif-sonido" checked={cfg.chat_sonido === id} onChange={() => cambiar("chat_sonido", id)} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{label}</span>
                    <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>{desc}</span>
                  </span>
                  {id !== "predeterminado" && (
                    <button type="button" onClick={(e) => { e.preventDefault(); reproducirMuestra(id); }} style={btnSecundario}>Escuchar</button>
                  )}
                </label>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
              El sonido de prueba aquí es aproximado. Cada usuario puede cambiarlo o silenciarlo en los ajustes de notificaciones de la app en su celular.
            </div>
          </div>

          {/* Titulo */}
          <div style={caja}>
            <div style={tituloSeccion}>Inicio del título</div>
            <input id="notif-prefijo" value={cfg.chat_prefijo || ""} onChange={(e) => cambiar("chat_prefijo", e.target.value.slice(0, 12))} placeholder="Vacío = sin prefijo" style={{ ...input, width: 160 }} />
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>Va antes del nombre de quien escribe o del código de la orden.</div>
          </div>

          {/* Color normal */}
          <div style={caja}>
            <div style={tituloSeccion}>Color de los demás avisos</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 8 }}>Órdenes nuevas, liquidaciones, materiales y tareas.</div>
            <SelectorColor id="notif-normal-color" valor={cfg.normal_color} onChange={(v) => cambiar("normal_color", v)} />
          </div>
        </div>

        {/* Vista previa */}
        <div style={{ position: "sticky", top: 12, minWidth: 0 }}>
          <div style={{ ...caja, background: "#e2e8f0" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 8, fontWeight: 700 }}>Vista previa en el celular</div>
            <div style={{ display: "grid", gap: 6 }}>
              <Tarjeta app={def.app} color={cfg.chat_color} Icono={IconoChat} titulo={`${prefijo ? `${prefijo} ` : ""}Cristian`} texto="Ya terminé la instalación, ¿paso por almacén?" apagado={!cfg.chat_activo} />
              <Tarjeta app={def.app} color={cfg.chat_color} Icono={IconoChat} titulo={`${prefijo ? `${prefijo} ` : ""}Orden 1182`} texto="Milagros: el cliente pide que llegues después de las 3" apagado={!cfg.chat_activo} />
              <Tarjeta app={def.app} color={cfg.normal_color} titulo="Nueva orden asignada" texto="Instalación · Cerro Colorado" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void guardar()} disabled={guardando || !cambios} style={{ ...btnPrimario, opacity: guardando || !cambios ? 0.55 : 1 }}>
              <Save size={16} /> {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={() => void probar()} disabled={probando || !cfg.chat_activo} style={{ ...btnSecundario, opacity: probando || !cfg.chat_activo ? 0.55 : 1 }}>
              <Send size={15} /> {probando ? "Enviando…" : "Enviarme una prueba"}
            </button>
          </div>
          {aviso && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: aviso.ok ? "#15803d" : "#b91c1c" }}>
              {aviso.ok ? <CircleCheck size={16} /> : <CircleAlert size={16} />} <span>{aviso.texto}</span>
            </div>
          )}
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 10, lineHeight: 1.45 }}>
            El ícono y el sonido nuevos se ven en celulares con la app actualizada (Amnet v373 / DIM v58 o más). En versiones anteriores llega igual, con el ícono de siempre.
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectorColor({ id, valor, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {COLORES_SUGERIDOS.map((c) => (
        <button key={c} type="button" title={c} onClick={() => onChange(c)}
          style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: String(valor).toUpperCase() === c ? "3px solid #0f172a" : "2px solid #fff", boxShadow: "0 0 0 1px #cbd5e1" }} />
      ))}
      <input id={`${id}-picker`} type="color" value={colorValido(valor) ? valor : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} style={{ width: 34, height: 30, padding: 0, border: "none", background: "none", cursor: "pointer" }} title="Otro color" />
      <input id={id} value={valor || ""} onChange={(e) => onChange(e.target.value.trim())} style={{ ...input, width: 100, padding: "6px 10px", borderColor: colorValido(valor) ? "#cbd5e1" : "#f87171" }} />
    </div>
  );
}

function Tarjeta({ app, color, Icono, titulo, texto, apagado }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "10px 12px", opacity: apagado ? 0.45 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#64748b", marginBottom: 3 }}>
        <span style={{ width: 17, height: 17, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icono ? <Icono size={10} color="#fff" fill="#fff" /> : <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "7px solid #fff" }} />}
        </span>
        <b style={{ color, fontWeight: 600 }}>{app}</b> · ahora{apagado ? " · apagado" : ""}
      </div>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>{titulo}</div>
      <div style={{ fontSize: 13, color: "#475569" }}>{texto}</div>
    </div>
  );
}

const caja = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 14 };
const tituloSeccion = { display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 8 };
const input = { border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, outline: "none", background: "#fff", fontFamily: "inherit" };
const btnPrimario = { display: "inline-flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: 13.5, cursor: "pointer" };
const btnSecundario = { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#1e40af", border: "1px solid #bfdbfe", borderRadius: 10, padding: "7px 12px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" };
const opcion = { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 12, border: "2px solid #e2e8f0", cursor: "pointer", fontFamily: "inherit" };
