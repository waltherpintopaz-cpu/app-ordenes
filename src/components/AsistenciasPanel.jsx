import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const toText = (value) => String(value ?? "").trim();

function pad2(n) {
  return String(n).padStart(2, "0");
}
function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function hoyKey() {
  return dateKey(new Date());
}
function mesKeyDe(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function diasDelMes(mesKey) {
  const [y, m] = mesKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function formatDateTime(value) {
  const d = new Date(value || Date.now());
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("es-PE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function formatAgo(value) {
  const d = new Date(value || Date.now());
  if (!Number.isFinite(d.getTime())) return "-";
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

// Estado de un dia puntual para un tecnico, a partir de sus turnos ese dia
// (normalmente uno solo, pero por si hay mas de uno se queda con el mas
// relevante): en_curso (jornada abierta ahora), completo (cerro normal o por
// tope de seguridad), cerro_antes (el admin aprobo un cierre anticipado),
// ausente (no hay ningun turno ese dia).
function estadoDia(turnosDelDia) {
  if (!turnosDelDia || turnosDelDia.length === 0) return "ausente";
  if (turnosDelDia.some((t) => t.estado === "activo" && !t.fin && t.pausado)) return "pausado";
  if (turnosDelDia.some((t) => t.estado === "activo" && !t.fin)) return "en_curso";
  if (turnosDelDia.some((t) => t.cierre_anticipado_estado === "aprobado")) return "cerro_antes";
  return "completo";
}

const ESTADO_INFO = {
  en_curso: { emoji: "🟢", label: "En curso", color: "#16A34A" },
  pausado: { emoji: "🟠", label: "Pausado", color: "#D97706" },
  completo: { emoji: "✅", label: "Completó", color: "#2563EB" },
  cerro_antes: { emoji: "🟡", label: "Cerró antes (aprobado)", color: "#D97706" },
  ausente: { emoji: "🔴", label: "Ausente", color: "#DC2626" },
};

const GRID_SIMBOLO = { en_curso: "·", pausado: "⏸", completo: "✓", cerro_antes: "½", ausente: "✗" };

function descargarCsv(nombreArchivo, filas) {
  const csv = filas.map((fila) => fila.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AsistenciasPanel({ sessionUser }) {
  const [tecnicos, setTecnicos] = useState([]);
  const [fechaSel, setFechaSel] = useState(hoyKey());
  const [mesSel, setMesSel] = useState(mesKeyDe(new Date()));
  const [turnosDia, setTurnosDia] = useState([]);
  const [turnosMes, setTurnosMes] = useState([]);
  const [cierresPendientes, setCierresPendientes] = useState([]);
  const [resolviendoId, setResolviendoId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [permisoTecnicoId, setPermisoTecnicoId] = useState("");
  const [permisoFecha, setPermisoFecha] = useState(hoyKey());
  const [permisoHoras, setPermisoHoras] = useState("4.5");
  const [permisoMotivo, setPermisoMotivo] = useState("");
  const [permisoGuardando, setPermisoGuardando] = useState(false);

  const cargarTecnicos = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("usuarios")
      .select("id,nombre,rol,activo")
      .eq("rol", "Tecnico")
      .eq("activo", true)
      .order("nombre", { ascending: true });
    if (err) throw err;
    setTecnicos(Array.isArray(data) ? data : []);
  }, []);

  const cargarTurnosDia = useCallback(async (fecha) => {
    const desde = new Date(`${fecha}T00:00:00`).toISOString();
    const hasta = new Date(`${fecha}T23:59:59.999`).toISOString();
    const { data, error: err } = await supabase
      .from("tecnico_turnos")
      .select("id,tecnico_id,tecnico_nombre,inicio,fin,estado,cierre_anticipado_estado,pausado")
      .gte("inicio", desde)
      .lte("inicio", hasta);
    if (err) throw err;
    setTurnosDia(Array.isArray(data) ? data : []);
  }, []);

  const cargarTurnosMes = useCallback(async (mes) => {
    const [y, m] = mes.split("-").map(Number);
    const desde = new Date(y, m - 1, 1).toISOString();
    const hasta = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
    const { data, error: err } = await supabase
      .from("tecnico_turnos")
      .select("id,tecnico_id,tecnico_nombre,inicio,fin,estado,cierre_anticipado_estado,pausado")
      .gte("inicio", desde)
      .lte("inicio", hasta);
    if (err) throw err;
    setTurnosMes(Array.isArray(data) ? data : []);
  }, []);

  const cargarCierresPendientes = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("tecnico_turnos")
      .select("id,tecnico_id,tecnico_nombre,inicio,fin_programado,cierre_anticipado_motivo,cierre_anticipado_solicitado_en")
      .eq("cierre_anticipado_estado", "pendiente")
      .eq("estado", "activo")
      .is("fin", null)
      .order("cierre_anticipado_solicitado_en", { ascending: true });
    if (err) throw err;
    setCierresPendientes(Array.isArray(data) ? data : []);
  }, []);

  const cargarTodo = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase no esta configurado.");
      setLoading(false);
      return;
    }
    setError("");
    try {
      await Promise.all([cargarTecnicos(), cargarTurnosDia(fechaSel), cargarTurnosMes(mesSel), cargarCierresPendientes()]);
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar asistencias."));
    } finally {
      setLoading(false);
    }
  }, [cargarTecnicos, cargarTurnosDia, cargarTurnosMes, cargarCierresPendientes, fechaSel, mesSel]);

  useEffect(() => {
    void cargarTodo();
  }, [cargarTodo]);

  const resolverCierre = useCallback(
    async (turno, aprobar) => {
      setResolviendoId(turno.id);
      try {
        const resueltoPor = toText(sessionUser?.nombre || sessionUser?.username || "Admin");
        const patch = aprobar
          ? {
              fin: new Date().toISOString(),
              estado: "cerrado",
              cierre_anticipado_estado: "aprobado",
              cierre_anticipado_resuelto_por: resueltoPor,
              cierre_anticipado_resuelto_en: new Date().toISOString(),
            }
          : {
              cierre_anticipado_estado: "rechazado",
              cierre_anticipado_solicitado: false,
              cierre_anticipado_resuelto_por: resueltoPor,
              cierre_anticipado_resuelto_en: new Date().toISOString(),
            };
        const { error: err } = await supabase.from("tecnico_turnos").update(patch).eq("id", turno.id);
        if (err) throw err;
        await Promise.all([cargarCierresPendientes(), cargarTurnosDia(fechaSel), cargarTurnosMes(mesSel)]);
      } catch (e) {
        window.alert(e?.message || "No se pudo resolver la solicitud.");
      } finally {
        setResolviendoId("");
      }
    },
    [sessionUser, cargarCierresPendientes, cargarTurnosDia, cargarTurnosMes, fechaSel, mesSel]
  );

  const guardarPermisoDia = useCallback(async () => {
    if (!permisoTecnicoId || !permisoFecha || !permisoHoras) {
      window.alert("Completa tecnico, fecha y horas.");
      return;
    }
    setPermisoGuardando(true);
    try {
      const tecnico = tecnicos.find((t) => String(t.id) === String(permisoTecnicoId));
      const { error: err } = await supabase.from("tecnico_permisos_dia").upsert(
        {
          tecnico_id: permisoTecnicoId,
          tecnico_nombre: tecnico?.nombre || "",
          fecha: permisoFecha,
          duracion_horas: Number(permisoHoras),
          motivo: permisoMotivo.trim() || null,
          creado_por: toText(sessionUser?.nombre || sessionUser?.username || "Admin"),
        },
        { onConflict: "tecnico_id,fecha" }
      );
      if (err) throw err;
      window.alert("Permiso guardado. Si el tecnico inicia jornada ese dia, usara esa duracion.");
      setPermisoMotivo("");
    } catch (e) {
      window.alert(e?.message || "No se pudo guardar el permiso.");
    } finally {
      setPermisoGuardando(false);
    }
  }, [permisoTecnicoId, permisoFecha, permisoHoras, permisoMotivo, tecnicos, sessionUser]);

  // ── Vista diaria: un estado por tecnico para fechaSel ──
  const filasDia = useMemo(() => {
    return tecnicos.map((tec) => {
      const turnosDelTec = turnosDia.filter((t) => String(t.tecnico_id) === String(tec.id));
      const estado = estadoDia(turnosDelTec);
      const turno = turnosDelTec[0] || null;
      return { tecnico: tec, estado, turno };
    });
  }, [tecnicos, turnosDia]);

  const kpis = useMemo(() => {
    const esHoy = fechaSel === hoyKey();
    const ausentesHoy = filasDia.filter((f) => f.estado === "ausente").length;
    const sinIniciarAun = esHoy ? filasDia.filter((f) => f.estado === "ausente" && new Date().getHours() < 20).length : 0;
    return { ausentesHoy, sinIniciarAun, pendientes: cierresPendientes.length };
  }, [filasDia, fechaSel, cierresPendientes]);

  // ── Grilla mensual: tecnico x dia -> simbolo ──
  const diasMes = diasDelMes(mesSel);
  const grillaMes = useMemo(() => {
    const [y, m] = mesSel.split("-").map(Number);
    return tecnicos.map((tec) => {
      const dias = [];
      for (let dia = 1; dia <= diasMes; dia += 1) {
        const key = `${y}-${pad2(m)}-${pad2(dia)}`;
        const esFuturo = new Date(y, m - 1, dia) > new Date();
        const turnosDelDiaTec = turnosMes.filter(
          (t) => String(t.tecnico_id) === String(tec.id) && dateKey(new Date(t.inicio)) === key
        );
        dias.push(esFuturo && turnosDelDiaTec.length === 0 ? null : estadoDia(turnosDelDiaTec));
      }
      return { tecnico: tec, dias };
    });
  }, [tecnicos, turnosMes, mesSel, diasMes]);

  const exportarCsv = useCallback(() => {
    const encabezado = ["Tecnico", ...Array.from({ length: diasMes }, (_, i) => String(i + 1))];
    const filas = [encabezado, ...grillaMes.map((fila) => [fila.tecnico.nombre, ...fila.dias.map((d) => (d ? GRID_SIMBOLO[d] : ""))])];
    descargarCsv(`asistencias_${mesSel}.csv`, filas);
  }, [grillaMes, diasMes, mesSel]);

  if (loading) return <div className="panel-loading">Cargando asistencias...</div>;

  return (
    <div className="asistencias-panel">
      <div className="asistencias-header">
        <h2>Asistencias</h2>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="asistencias-kpis">
        <div className="asistencias-kpi" style={{ borderColor: "#FECACA", background: "#FEF2F2" }}>
          <span className="asistencias-kpi-value" style={{ color: "#DC2626" }}>{kpis.ausentesHoy}</span>
          <span className="asistencias-kpi-label">Ausentes ({fechaSel})</span>
        </div>
        <div className="asistencias-kpi" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
          <span className="asistencias-kpi-value" style={{ color: "#D97706" }}>{kpis.sinIniciarAun}</span>
          <span className="asistencias-kpi-label">Aun no inician hoy</span>
        </div>
        <div className="asistencias-kpi" style={{ borderColor: "#BFDBFE", background: "#EFF6FF" }}>
          <span className="asistencias-kpi-value" style={{ color: "#2563EB" }}>{kpis.pendientes}</span>
          <span className="asistencias-kpi-label">Solicitudes pendientes</span>
        </div>
      </div>

      {cierresPendientes.length > 0 && (
        <section className="asistencias-card asistencias-card-pendientes">
          <h3>⏳ Solicitudes de cierre anticipado ({cierresPendientes.length})</h3>
          {cierresPendientes.map((turno) => (
            <div key={`asis-cierre-${turno.id}`} className="asistencias-pendiente-row">
              <div>
                <strong>{turno.tecnico_nombre || turno.tecnico_id}</strong>
                <p className="asistencias-meta">
                  Desde {formatDateTime(turno.inicio)}
                  {turno.fin_programado ? ` · programada hasta ${formatDateTime(turno.fin_programado)}` : ""}
                </p>
                <p className="asistencias-meta">
                  Solicitado {formatAgo(turno.cierre_anticipado_solicitado_en)}
                  {turno.cierre_anticipado_motivo ? ` · Motivo: ${turno.cierre_anticipado_motivo}` : " · Sin motivo"}
                </p>
              </div>
              <div className="asistencias-pendiente-btns">
                <button type="button" className="secondary-btn small" disabled={resolviendoId === turno.id} onClick={() => void resolverCierre(turno, true)}>
                  {resolviendoId === turno.id ? "..." : "✓ Aprobar"}
                </button>
                <button type="button" className="secondary-btn small" disabled={resolviendoId === turno.id} onClick={() => void resolverCierre(turno, false)}>
                  {resolviendoId === turno.id ? "..." : "✗ Rechazar"}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="asistencias-card">
        <div className="asistencias-card-head">
          <h3>Vista diaria</h3>
          <input type="date" value={fechaSel} onChange={(e) => setFechaSel(e.target.value)} />
        </div>
        <div className="asistencias-dia-grid">
          {filasDia.map(({ tecnico, estado, turno }) => (
            <div key={`dia-${tecnico.id}`} className="asistencias-dia-item" style={{ borderColor: ESTADO_INFO[estado].color }}>
              <span className="asistencias-dia-emoji">{ESTADO_INFO[estado].emoji}</span>
              <div>
                <p className="asistencias-dia-nombre">{tecnico.nombre}</p>
                <p className="asistencias-meta">
                  {ESTADO_INFO[estado].label}
                  {turno?.inicio ? ` · ${formatDateTime(turno.inicio)}${turno.fin ? ` - ${formatDateTime(turno.fin)}` : ""}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="asistencias-card">
        <div className="asistencias-card-head">
          <h3>Resumen mensual</h3>
          <input type="month" value={mesSel} onChange={(e) => setMesSel(e.target.value)} />
          <button type="button" className="secondary-btn small" onClick={exportarCsv}>⬇ Exportar CSV</button>
        </div>
        <div className="asistencias-grid-scroll">
          <table className="asistencias-tabla">
            <thead>
              <tr>
                <th>Tecnico</th>
                {Array.from({ length: diasMes }, (_, i) => <th key={`d-${i}`}>{i + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {grillaMes.map((fila) => (
                <tr key={`fila-${fila.tecnico.id}`}>
                  <td className="asistencias-tabla-nombre">{fila.tecnico.nombre}</td>
                  {fila.dias.map((d, i) => (
                    <td key={`c-${fila.tecnico.id}-${i}`} style={{ color: d ? ESTADO_INFO[d].color : "#CBD5E1" }}>
                      {d ? GRID_SIMBOLO[d] : "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="asistencias-leyenda">✓ Completó · ½ Cerró antes (aprobado) · ✗ Ausente · · En curso</p>
      </section>

      <section className="asistencias-card">
        <h3>Autorizar medio dia (u otra duracion) para un dia puntual</h3>
        <p className="asistencias-meta">Si el tecnico inicia jornada ese dia, se usara esta duracion en vez de las 9h por defecto.</p>
        <div className="asistencias-permiso-form">
          <select value={permisoTecnicoId} onChange={(e) => setPermisoTecnicoId(e.target.value)}>
            <option value="">Selecciona tecnico...</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <input type="date" value={permisoFecha} onChange={(e) => setPermisoFecha(e.target.value)} />
          <input type="number" min="0.5" max="12" step="0.5" value={permisoHoras} onChange={(e) => setPermisoHoras(e.target.value)} style={{ width: 80 }} />
          <input type="text" placeholder="Motivo (opcional)" value={permisoMotivo} onChange={(e) => setPermisoMotivo(e.target.value)} />
          <button type="button" className="secondary-btn small" disabled={permisoGuardando} onClick={() => void guardarPermisoDia()}>
            {permisoGuardando ? "Guardando..." : "Guardar permiso"}
          </button>
        </div>
      </section>
    </div>
  );
}
