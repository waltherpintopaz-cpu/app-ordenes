import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

const ESTADO_COLORS = {
  almacen:   { bg: "#dbeafe", text: "#1d4ed8", label: "Almacén" },
  asignado:  { bg: "#dcfce7", text: "#16a34a", label: "Asignado" },
  liquidado: { bg: "#fef9c3", text: "#b45309", label: "Liquidado" },
};
const normalizeEstado = (e) => (e || "").toLowerCase();
const estadoLabel = (e) => ESTADO_COLORS[normalizeEstado(e)]?.label || e || "—";
const estadoStyle = (e) => {
  const conf = ESTADO_COLORS[normalizeEstado(e)];
  return conf
    ? { background: conf.bg, color: conf.text, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 }
    : { background: "#f3f4f6", color: "#374151", borderRadius: 6, padding: "2px 8px", fontSize: 12 };
};

export default function EquiposTecnicoReportesPanel({ cardStyle, sectionTitleStyle }) {
  const [equipos, setEquipos] = useState([]);
  const [liqEquipos, setLiqEquipos] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroTecnico, setFiltroTecnico] = useState("todos");
  const [expandido, setExpandido] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data: eqData, error: eqErr } = await supabase
          .from("equipos_catalogo")
          .select("id,empresa,tipo,marca,modelo,codigo_qr,serial_mac,estado,tecnico_asignado")
          .in("estado", ["asignado", "liquidado"]);
        if (eqErr) throw eqErr;

        const idsLiquidados = (eqData || []).filter((e) => normalizeEstado(e.estado) === "liquidado").map((e) => e.id);
        let liqEqData = [];
        if (idsLiquidados.length) {
          const { data, error: liqEqErr } = await supabase
            .from("liquidacion_equipos")
            .select("id_inventario,liquidacion_id")
            .in("id_inventario", idsLiquidados);
          if (liqEqErr) throw liqEqErr;
          liqEqData = data || [];
        }

        const liquidacionIds = [...new Set(liqEqData.map((l) => l.liquidacion_id).filter(Boolean))];
        let liqData = [];
        if (liquidacionIds.length) {
          const { data, error: liqErr } = await supabase
            .from("liquidaciones")
            .select("id,codigo,dni,nombre,nodo,tecnico_liquida,fecha_liquidacion")
            .in("id", liquidacionIds);
          if (liqErr) throw liqErr;
          liqData = data || [];
        }

        setEquipos(eqData || []);
        setLiqEquipos(liqEqData);
        setLiquidaciones(liqData);
      } catch (e) {
        setError(e?.message || "Error al cargar el reporte.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // id_inventario (equipos_catalogo.id) -> liquidación enriquecida
  const liquidacionPorEquipo = useMemo(() => {
    const liqPorId = new Map(liquidaciones.map((l) => [l.id, l]));
    const map = new Map();
    for (const le of liqEquipos) {
      const liq = liqPorId.get(le.liquidacion_id);
      if (liq) map.set(le.id_inventario, liq);
    }
    return map;
  }, [liqEquipos, liquidaciones]);

  const tecnicos = useMemo(
    () => ["todos", ...new Set(equipos.map((e) => e.tecnico_asignado).filter(Boolean))].sort(),
    [equipos]
  );

  const porTecnico = useMemo(() => {
    const base = filtroTecnico === "todos" ? equipos : equipos.filter((e) => e.tecnico_asignado === filtroTecnico);
    const grupos = new Map();
    for (const e of base) {
      const key = e.tecnico_asignado || "Sin asignar";
      if (!grupos.has(key)) grupos.set(key, { custodia: [], liquidados: [] });
      const g = grupos.get(key);
      if (normalizeEstado(e.estado) === "liquidado") {
        g.liquidados.push({ ...e, liq: liquidacionPorEquipo.get(e.id) || null });
      } else {
        g.custodia.push(e);
      }
    }
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [equipos, filtroTecnico, liquidacionPorEquipo]);

  const totalCustodia = equipos.filter((e) => normalizeEstado(e.estado) === "asignado").length;
  const totalLiquidados = equipos.filter((e) => normalizeEstado(e.estado) === "liquidado").length;

  if (loading) return <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Cargando reporte...</div>;
  if (error) return <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#dc2626" }}>{error}</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Equipos por Técnico — Custodia y Liquidados</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
          Qué equipo tiene cada técnico en custodia (asignado, aún sin liquidar) y cuáles ya liquidó — con cliente y orden.
        </p>

        <div style={{ display: "flex", gap: 12, margin: "16px 0", flexWrap: "wrap" }}>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b" }}>{equipos.length}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Total</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{totalCustodia}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>En custodia</div>
          </div>
          <div style={{ ...cardStyle, flex: 1, minWidth: 120, textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#b45309" }}>{totalLiquidados}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Liquidados</div>
          </div>
        </div>

        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
          Técnico{" "}
          <select value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)} style={{ marginLeft: 8, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
            {tecnicos.map((t) => <option key={t} value={t}>{t === "todos" ? "Todos" : t}</option>)}
          </select>
        </label>
      </div>

      {porTecnico.length === 0 ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#64748b" }}>Sin equipos asignados o liquidados.</div>
      ) : (
        porTecnico.map(([tecnico, { custodia, liquidados }]) => {
          const abierto = expandido[tecnico] !== false;
          return (
            <div key={tecnico} style={cardStyle}>
              <button
                type="button"
                onClick={() => setExpandido((p) => ({ ...p, [tecnico]: !abierto }))}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{tecnico}</span>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {custodia.length} en custodia · {liquidados.length} liquidados {abierto ? "▲" : "▼"}
                </span>
              </button>

              {abierto && (
                <div style={{ marginTop: 14, display: "grid", gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", marginBottom: 6 }}>
                      En custodia ({custodia.length})
                    </div>
                    {custodia.length === 0 ? (
                      <p style={{ fontSize: 12, color: "#94a3b8" }}>Sin equipos en custodia.</p>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ textAlign: "left", color: "#64748b" }}>
                            <th style={{ padding: "6px 8px" }}>Tipo / Marca</th>
                            <th style={{ padding: "6px 8px" }}>Serial</th>
                            <th style={{ padding: "6px 8px" }}>Código QR</th>
                            <th style={{ padding: "6px 8px" }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {custodia.map((e) => (
                            <tr key={e.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "6px 8px" }}><strong>{e.tipo || "-"}</strong>{e.marca ? ` · ${e.marca}` : ""}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.serial_mac || "-"}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.codigo_qr || "-"}</td>
                              <td style={{ padding: "6px 8px" }}><span style={estadoStyle(e.estado)}>{estadoLabel(e.estado)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", textTransform: "uppercase", marginBottom: 6 }}>
                      Liquidados ({liquidados.length})
                    </div>
                    {liquidados.length === 0 ? (
                      <p style={{ fontSize: 12, color: "#94a3b8" }}>Sin equipos liquidados.</p>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ textAlign: "left", color: "#64748b" }}>
                            <th style={{ padding: "6px 8px" }}>Tipo / Marca</th>
                            <th style={{ padding: "6px 8px" }}>Serial</th>
                            <th style={{ padding: "6px 8px" }}>Cliente</th>
                            <th style={{ padding: "6px 8px" }}>Orden</th>
                            <th style={{ padding: "6px 8px" }}>Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liquidados.map((e) => (
                            <tr key={e.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "6px 8px" }}><strong>{e.tipo || "-"}</strong>{e.marca ? ` · ${e.marca}` : ""}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.serial_mac || "-"}</td>
                              <td style={{ padding: "6px 8px" }}>{e.liq?.nombre || "—"}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{e.liq?.codigo || "—"}</td>
                              <td style={{ padding: "6px 8px" }}>{e.liq?.fecha_liquidacion ? String(e.liq.fecha_liquidacion).slice(0, 10) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
