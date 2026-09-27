import { useCallback, useEffect, useState } from "react";

const HUAWEI_OLT_SNMP_API = String(import.meta.env.VITE_HUAWEI_OLT_SNMP_API || "https://huawei-olt-snmp.wolgest.com").trim().replace(/\/$/, "");
const DIAGNO_BASE = String(import.meta.env.VITE_DIAGNO_URL || "").trim().replace(/\/$/, "");

// Se arma con lo que ya guarda huawei-olt-signal via traps SNMP reales
// (LOS/dying-gasp ocurre-recupera) -- ver onu_eventos / onu_averias_zona
// en Supabase. Polling simple cada 20s, sin websocket/realtime todavia.
const REFRESH_MS = 20000;

const TIPO_INFO = {
  los_down:   { label: "Sin señal (LOS)",  dot: "#ef4444", text: "#991b1b", bg: "#fee2e2" },
  los_up:     { label: "Recuperó señal",   dot: "#22c55e", text: "#15803d", bg: "#dcfce7" },
  power_down: { label: "Corte de luz",     dot: "#f59e0b", text: "#92400e", bg: "#fef3c7" },
  power_up:   { label: "Volvió la luz",    dot: "#22c55e", text: "#15803d", bg: "#dcfce7" },
};
const TIPO_DESCONOCIDO = { label: "Desconocido", dot: "#9ca3af", text: "#374151", bg: "#f3f4f6" };

const Ico = {
  alertTriangle: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  refresh: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" /></svg>,
  wifiOff: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>,
};

function formatoFecha(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "medium" }); } catch { return iso; }
}

export default function OnuAveriasPanel({ theme }) {
  const isDark = theme === "dark";
  const col = isDark
    ? { bg: "#111c33", card: "#1a2740", border: "#2c3c58", text: "#e6ecf7", sub: "#93a2bd" }
    : { bg: "#f4f6fb", card: "#ffffff", border: "#e2e8f4", text: "#1a2740", sub: "#5b6b8c" };

  const [averias, setAverias] = useState([]);
  const [eventosTodos, setEventosTodos] = useState([]);
  // Categoria, no tipo exacto -- "los" agrupa los_down+los_up, "luz" agrupa
  // power_down+power_up. Por defecto solo LOS (pedido explicito: la avería
  // de luz es menos urgente de mirar a cada rato que la de señal).
  const [categoriaFiltro, setCategoriaFiltro] = useState("los");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [config, setConfig] = useState(null);
  const [configEdit, setConfigEdit] = useState(null);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState(null);

  const cargarConfig = useCallback(async () => {
    try {
      const r = await fetch(`${HUAWEI_OLT_SNMP_API}/averia-config`).then((r) => r.json());
      if (r.ok && r.config) {
        setConfig(r.config);
        setConfigEdit(r.config);
      }
    } catch { /* silencioso -- se ve el error si intenta guardar */ }
  }, []);

  const guardarConfig = async () => {
    setGuardandoConfig(true);
    setMensajeConfig(null);
    try {
      const r = await fetch(`${DIAGNO_BASE}/api/huawei-onu/averia-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configEdit),
      }).then((r) => r.json());
      if (!r.ok) throw new Error(r.error || "No se pudo guardar.");
      setConfig(r.config);
      setMensajeConfig({ ok: true, texto: "Guardado." });
    } catch (e) {
      setMensajeConfig({ ok: false, texto: e.message || "Error de red." });
    } finally {
      setGuardandoConfig(false);
    }
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [rAverias, rEventos] = await Promise.all([
        fetch(`${HUAWEI_OLT_SNMP_API}/onu-averias-zona?activa=1`).then((r) => r.json()),
        fetch(`${HUAWEI_OLT_SNMP_API}/onu-eventos?limit=150`).then((r) => r.json()),
      ]);
      if (!rAverias.ok) throw new Error(rAverias.error || "Error consultando averías de zona.");
      if (!rEventos.ok) throw new Error(rEventos.error || "Error consultando eventos.");
      setAverias(Array.isArray(rAverias.averias) ? rAverias.averias : []);
      setEventosTodos(Array.isArray(rEventos.eventos) ? rEventos.eventos : []);
      setUltimaActualizacion(new Date());
    } catch (e) {
      setError(e.message || "Error de red.");
    } finally {
      setCargando(false);
    }
  }, []);

  const eventos = eventosTodos.filter((ev) => {
    if (categoriaFiltro === "los") return ev.tipo === "los_down" || ev.tipo === "los_up";
    if (categoriaFiltro === "luz") return ev.tipo === "power_down" || ev.tipo === "power_up";
    return true;
  });

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, REFRESH_MS);
    return () => clearInterval(id);
  }, [cargar]);

  useEffect(() => { cargarConfig(); }, [cargarConfig]);

  return (
    <div style={{ padding: 20, background: col.bg, minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: col.text }}>Averías OLT — LOS / Corte de luz</div>
          <div style={{ fontSize: 12.5, color: col.sub, marginTop: 2 }}>
            Armado en tiempo real desde traps SNMP del OLT (Huawei) · Se refresca cada 20s
            {ultimaActualizacion ? ` · Última actualización ${ultimaActualizacion.toLocaleTimeString("es-PE")}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setMostrarConfig((v) => !v)}
            style={{ padding: "8px 14px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: "pointer", border: `1.5px solid ${col.border}`, background: mostrarConfig ? col.border : col.card, color: col.text }}
          >⚙ Configurar</button>
          <button
            onClick={cargar}
            disabled={cargando}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: cargando ? "not-allowed" : "pointer", opacity: cargando ? 0.6 : 1, border: `1.5px solid ${col.border}`, background: col.card, color: col.text }}
          ><Ico.refresh width={14} height={14} />{cargando ? "Actualizando…" : "Actualizar"}</button>
        </div>
      </div>

      {mostrarConfig && configEdit && (
        <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, background: col.card, border: `1.5px solid ${col.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: col.text, marginBottom: 12 }}>Configuración de detección y aviso</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: col.sub }}>
              Umbral LOS (ONUs)
              <input type="number" min={1} value={configEdit.umbral_los}
                onChange={(e) => setConfigEdit((c) => ({ ...c, umbral_los: Number(e.target.value) }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub }}>
              Umbral corte de luz (ONUs)
              <input type="number" min={1} value={configEdit.umbral_power}
                onChange={(e) => setConfigEdit((c) => ({ ...c, umbral_power: Number(e.target.value) }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub }}>
              Ventana de tiempo (minutos)
              <input type="number" min={1} value={configEdit.ventana_minutos}
                onChange={(e) => setConfigEdit((c) => ({ ...c, ventana_minutos: Number(e.target.value) }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub, gridColumn: "1 / -1" }}>
              Grupo de WhatsApp destino (JID)
              <input type="text" value={configEdit.whatsapp_grupo_jid}
                onChange={(e) => setConfigEdit((c) => ({ ...c, whatsapp_grupo_jid: e.target.value }))}
                placeholder="120363xxxxxxxxx@g.us"
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub }}>
              Telegram — bot token
              <input type="text" value={configEdit.telegram_bot_token || ""}
                onChange={(e) => setConfigEdit((c) => ({ ...c, telegram_bot_token: e.target.value }))}
                placeholder="123456789:ABC..."
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub }}>
              Telegram — chat_id del grupo
              <input type="text" value={configEdit.telegram_chat_id || ""}
                onChange={(e) => setConfigEdit((c) => ({ ...c, telegram_chat_id: e.target.value }))}
                placeholder="-5535234862"
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }} />
            </label>
            <label style={{ fontSize: 12, color: col.sub, gridColumn: "1 / -1" }}>
              Telegram — qué avisar (WhatsApp siempre se queda solo en avería de zona, para no arriesgar baneo)
              <select value={configEdit.telegram_modo || "averia_zona"}
                onChange={(e) => setConfigEdit((c) => ({ ...c, telegram_modo: e.target.value }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", fontSize: 13, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.bg, color: col.text }}>
                <option value="averia_zona">Solo avería de zona (igual que WhatsApp)</option>
                <option value="todos">Cada evento individual (LOS y corte de luz)</option>
                <option value="los">Cada evento de LOS individual</option>
                <option value="power">Cada corte de luz individual</option>
              </select>
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: col.text, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={configEdit.whatsapp_habilitado}
              onChange={(e) => setConfigEdit((c) => ({ ...c, whatsapp_habilitado: e.target.checked }))} />
            Avisar por WhatsApp cuando se detecte una avería de zona nueva
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: col.text, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={!!configEdit.telegram_habilitado}
              onChange={(e) => setConfigEdit((c) => ({ ...c, telegram_habilitado: e.target.checked }))} />
            Avisar por Telegram cuando se detecte una avería de zona nueva
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={guardarConfig}
              disabled={guardandoConfig}
              style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: guardandoConfig ? "not-allowed" : "pointer", opacity: guardandoConfig ? 0.6 : 1, border: "none", background: "#2563eb", color: "#fff" }}
            >{guardandoConfig ? "Guardando…" : "Guardar cambios"}</button>
            {mensajeConfig && (
              <span style={{ fontSize: 12, fontWeight: 600, color: mensajeConfig.ok ? "#15803d" : "#991b1b" }}>
                {mensajeConfig.ok ? "✓ " : "✗ "}{mensajeConfig.texto}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Averías de zona -- lo mas urgente, arriba y destacado */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: col.sub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Averías de zona activas ({averias.length})
        </div>
        {averias.length === 0 ? (
          <div style={{ padding: 16, borderRadius: 10, background: col.card, border: `1.5px solid ${col.border}`, color: col.sub, fontSize: 13 }}>
            Sin averías de zona detectadas ahora mismo. Se marca acá cuando 3 o más ONUs del mismo board/puerto caen juntas en pocos minutos (indicador de corte de fibra, no de clientes individuales).
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
            {averias.map((a) => (
              <div key={a.id} style={{ padding: 14, borderRadius: 10, background: "#fef2f2", border: "1.5px solid #fca5a5" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Ico.alertTriangle width={18} height={18} color="#dc2626" />
                  <div style={{ fontWeight: 800, color: "#991b1b", fontSize: 14.5 }}>
                    Board {a.board} · Puerto {a.port}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: "#7f1d1d", marginBottom: 4 }}>
                  {a.tipo === "power_down" ? "Corte de luz" : "Sin señal (LOS)"} — {a.cantidad_onus} ONUs caídas juntas
                </div>
                <div style={{ fontSize: 11, color: "#991b1b", opacity: 0.8 }}>
                  Desde {formatoFecha(a.primera_deteccion)} · Actualizado {formatoFecha(a.ultima_actualizacion)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Eventos individuales -- historial, filtrable */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: col.sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Eventos recientes
          </div>
          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            style={{ padding: "5px 8px", fontSize: 12, borderRadius: 6, border: `1.5px solid ${col.border}`, background: col.card, color: col.text }}
          >
            <option value="los">LOS (sin señal / recupera)</option>
            <option value="luz">Luz (corte / vuelve)</option>
            <option value="todos">Todos</option>
          </select>
        </div>

        <div style={{ borderRadius: 10, background: col.card, border: `1.5px solid ${col.border}`, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px 90px 90px 90px", gap: 0, padding: "8px 14px", background: isDark ? "#0d172a" : "#f8fafc", fontSize: 10.5, fontWeight: 800, color: col.sub, textTransform: "uppercase" }}>
            <div>Cuándo</div>
            <div>Cliente</div>
            <div>Board/Puerto</div>
            <div>Tipo</div>
            <div>Rx ONU</div>
            <div>Rx OLT</div>
          </div>
          {eventos.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: col.sub, fontSize: 13 }}>
              {cargando ? "Cargando…" : "Sin eventos registrados todavía."}
            </div>
          ) : (
            eventos.map((ev) => {
              const info = TIPO_INFO[ev.tipo] || TIPO_DESCONOCIDO;
              return (
                <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px 90px 90px 90px", gap: 0, padding: "9px 14px", borderTop: `1px solid ${col.border}`, fontSize: 12.5, color: col.text, alignItems: "center" }}>
                  <div style={{ color: col.sub, fontSize: 11.5 }}>{formatoFecha(ev.ocurrido_en)}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{ev.nombre || "—"}</div>
                    <div style={{ fontSize: 11, color: col.sub, display: "flex", gap: 6 }}>
                      {ev.sn && <span style={{ fontFamily: "monospace" }}>{ev.sn}</span>}
                      {ev.zona && <span>{ev.zona}</span>}
                    </div>
                  </div>
                  <div style={{ color: col.sub, fontSize: 11.5 }}>{ev.board != null ? `${ev.board}/${ev.port}` : "—"}</div>
                  <div>
                    <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: info.bg, color: info.text }}>
                      {info.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5 }}>{ev.rx_power != null ? `${ev.rx_power} dBm` : "—"}</div>
                  <div style={{ fontSize: 11.5 }}>{ev.rx_power_olt != null ? `${ev.rx_power_olt} dBm` : "—"}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
