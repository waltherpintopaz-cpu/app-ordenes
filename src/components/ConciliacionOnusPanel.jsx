import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

function text(v) {
  return String(v ?? "").trim();
}

function toSearch(v) {
  return text(v).toLowerCase();
}

const card = {
  background: "#fff",
  border: "1px solid #d9e3f0",
  borderRadius: "14px",
  padding: "16px",
};

const badge = {
  display: "inline-block",
  fontSize: "12px",
  fontWeight: 700,
  borderRadius: "999px",
  padding: "6px 10px",
};

export default function ConciliacionOnusPanel({ isMobile = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [manualCode, setManualCode] = useState("");

  const loadBase = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase no esta configurado.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const relRes = await supabase
        .from("onu_liquidacion_relacion")
        .select("id,id_onu,liquidacion_codigo,regla_match,confianza,pendiente_revision,observacion,created_at")
        .order("pendiente_revision", { ascending: false })
        .order("id_onu", { ascending: true })
        .limit(2500);
      if (relRes.error) throw relRes.error;
      const rel = Array.isArray(relRes.data) ? relRes.data : [];
      const ids = rel.map((r) => text(r.id_onu)).filter(Boolean);
      let byOnu = {};
      if (ids.length > 0) {
        const onuRes = await supabase
          .from("historial_appsheet_onus")
          .select("id_onu,producto,nodo,dni,nombre_cliente,usuario_pppoe,liquidado_por_codigo,tecnico_asignado_codigo")
          .in("id_onu", ids);
        if (onuRes.error) throw onuRes.error;
        byOnu = Object.fromEntries((onuRes.data || []).map((r) => [text(r.id_onu), r]));
      }
      const merged = rel.map((r) => {
        const on = byOnu[text(r.id_onu)] || {};
        return {
          ...r,
          producto: text(on.producto),
          nodo: text(on.nodo),
          dni: text(on.dni),
          nombre_cliente: text(on.nombre_cliente),
          usuario_pppoe: text(on.usuario_pppoe),
          liquidado_por_codigo: text(on.liquidado_por_codigo),
          tecnico_asignado_codigo: text(on.tecnico_asignado_codigo),
        };
      });
      setRows(merged);
      setInfo(`Cargadas ${merged.length} relaciones ONU-liquidacion.`);
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar conciliacion manual."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSuggestions = useCallback(async (row) => {
    if (!row) return;
    setSuggestions([]);
    const dni = text(row.dni);
    const nodo = text(row.nodo);
    const idOnu = text(row.id_onu);
    try {
      const out = [];
      if (idOnu) {
        const detRes = await supabase
          .from("historial_appsheet_detalle_liquidacion")
          .select("liquidacion_codigo,codigo_onu,dni,nodo,updated_at")
          .eq("codigo_onu", idOnu)
          .order("updated_at", { ascending: false })
          .limit(20);
        if (!detRes.error) {
          (detRes.data || []).forEach((d) => {
            const codigo = text(d.liquidacion_codigo);
            if (!codigo) return;
            out.push({
              codigo,
              fuente: "Detalle liquidacion por codigo_onu",
              confianza: "alta",
              dni: text(d.dni),
              nodo: text(d.nodo),
            });
          });
        }
      }
      if (dni) {
        let q = supabase
          .from("historial_appsheet_liquidaciones")
          .select("codigo,dni,nodo,tecnico,updated_at")
          .eq("dni", dni)
          .order("updated_at", { ascending: false })
          .limit(20);
        if (nodo) q = q.eq("nodo", nodo);
        const liqRes = await q;
        if (!liqRes.error) {
          (liqRes.data || []).forEach((d) => {
            const codigo = text(d.codigo);
            if (!codigo) return;
            out.push({
              codigo,
              fuente: nodo ? "Liquidaciones por dni+nodo" : "Liquidaciones por dni",
              confianza: nodo ? "media" : "baja",
              dni: text(d.dni),
              nodo: text(d.nodo),
            });
          });
        }
      }
      const uniq = [];
      const seen = new Set();
      out.forEach((x) => {
        const k = text(x.codigo).toUpperCase();
        if (!k || seen.has(k)) return;
        seen.add(k);
        uniq.push(x);
      });
      setSuggestions(uniq);
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const filtered = useMemo(() => {
    const q = toSearch(search);
    return (rows || []).filter((r) => {
      if (onlyPending && !r.pendiente_revision) return false;
      if (!q) return true;
      return [
        r.id_onu,
        r.liquidacion_codigo,
        r.regla_match,
        r.confianza,
        r.nodo,
        r.dni,
        r.nombre_cliente,
        r.producto,
      ]
        .map(toSearch)
        .some((v) => v.includes(q));
    });
  }, [rows, search, onlyPending]);

  const selectRow = async (row) => {
    setSelected(row);
    setManualCode(text(row?.liquidacion_codigo));
    await loadSuggestions(row);
  };

  const applyResolve = async (codeRaw) => {
    const row = selected;
    const code = text(codeRaw);
    if (!row || !code) return;
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const upd = await supabase
        .from("onu_liquidacion_relacion")
        .update({
          liquidacion_codigo: code,
          regla_match: "manual",
          confianza: "alta",
          pendiente_revision: false,
          observacion: `Resuelto manualmente en web (${new Date().toISOString()})`,
        })
        .eq("id_onu", row.id_onu);
      if (upd.error) throw upd.error;
      setInfo(`ONU ${row.id_onu} relacionada con liquidacion ${code}.`);
      await loadBase();
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              liquidacion_codigo: code,
              regla_match: "manual",
              confianza: "alta",
              pendiente_revision: false,
            }
          : prev
      );
    } catch (e) {
      setError(String(e?.message || "No se pudo guardar relacion manual."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div style={card}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: "24px", color: "#0b2f5b" }}>Conciliacion manual ONUs</h3>
        <p style={{ margin: 0, color: "#4b5f78" }}>
          Resuelve relaciones ONU-liquidacion en tablas puente. No modifica inventario final.
        </p>
      </div>

      <div style={{ ...card, display: "grid", gap: "10px" }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="primary-btn" onClick={() => void loadBase()} disabled={loading || saving}>
            {loading ? "Cargando..." : "Recargar"}
          </button>
          <button type="button" className="secondary-btn" onClick={() => setOnlyPending((v) => !v)}>
            {onlyPending ? "Mostrando: pendientes" : "Mostrando: todos"}
          </button>
          <span style={{ ...badge, background: "#e8f1fb", color: "#1d4d8b" }}>Filas: {filtered.length}</span>
        </div>
        <input
          type="text"
          className="form-input"
          placeholder="Buscar por IDONU, cliente, DNI, nodo, producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: isMobile ? "100%" : "460px", maxWidth: "100%" }}
        />
        {error ? <p className="warn-text">{error}</p> : null}
        {info ? <p style={{ margin: 0, color: "#166534", fontWeight: 600 }}>{info}</p> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.15fr 0.85fr", gap: "16px" }}>
        <div style={{ ...card, padding: "0" }}>
          <div style={{ maxHeight: "560px", overflow: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>IDONU</th>
                  <th>Cliente</th>
                  <th>DNI</th>
                  <th>Nodo</th>
                  <th>Producto</th>
                  <th>Relación</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#6b7280", padding: "20px" }}>
                      No hay filas para mostrar.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={`conc-row-${r.id_onu}`}>
                      <td>{text(r.id_onu) || "-"}</td>
                      <td>{text(r.nombre_cliente) || "-"}</td>
                      <td>{text(r.dni) || "-"}</td>
                      <td>{text(r.nodo) || "-"}</td>
                      <td>{text(r.producto) || "-"}</td>
                      <td>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <span>{text(r.liquidacion_codigo) || "-"}</span>
                          <span
                            style={{
                              ...badge,
                              background: r.pendiente_revision ? "#fff7ed" : "#dcfce7",
                              color: r.pendiente_revision ? "#9a3412" : "#166534",
                              width: "fit-content",
                              padding: "4px 8px",
                              fontSize: "11px",
                            }}
                          >
                            {r.pendiente_revision ? "Pendiente" : "Resuelto"} · {text(r.confianza) || "-"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button type="button" className="secondary-btn small" onClick={() => void selectRow(r)}>
                          Resolver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <h4 style={{ margin: "0 0 10px 0", color: "#102a43" }}>Resolucion manual</h4>
          {!selected ? (
            <p style={{ margin: 0, color: "#6b7280" }}>Selecciona una ONU de la lista para ver sugerencias.</p>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ padding: "10px", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#f8fbff" }}>
                <div><strong>IDONU:</strong> {text(selected.id_onu) || "-"}</div>
                <div><strong>Cliente:</strong> {text(selected.nombre_cliente) || "-"}</div>
                <div><strong>DNI:</strong> {text(selected.dni) || "-"}</div>
                <div><strong>Nodo:</strong> {text(selected.nodo) || "-"}</div>
                <div><strong>Actual:</strong> {text(selected.liquidacion_codigo) || "-"}</div>
              </div>

              <label style={{ fontWeight: 700, color: "#274060" }}>Liquidacion codigo (manual)</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: ORD-1234-2026"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                />
                <button type="button" className="primary-btn" disabled={saving || !text(manualCode)} onClick={() => void applyResolve(manualCode)}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>

              <div style={{ marginTop: "8px" }}>
                <div style={{ fontWeight: 700, color: "#274060", marginBottom: "6px" }}>Sugerencias</div>
                {suggestions.length === 0 ? (
                  <p style={{ margin: 0, color: "#6b7280" }}>Sin sugerencias automáticas para esta ONU.</p>
                ) : (
                  <div style={{ display: "grid", gap: "8px" }}>
                    {suggestions.map((s, idx) => (
                      <div key={`sg-${idx}-${s.codigo}`} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                          <strong>{text(s.codigo)}</strong>
                          <span style={{ ...badge, background: "#eff6ff", color: "#1e3a8a", padding: "4px 8px", fontSize: "11px" }}>
                            {text(s.confianza)}
                          </span>
                        </div>
                        <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>
                          {text(s.fuente)} | DNI: {text(s.dni) || "-"} | NODO: {text(s.nodo) || "-"}
                        </div>
                        <div style={{ marginTop: "8px" }}>
                          <button type="button" className="secondary-btn small" onClick={() => void applyResolve(s.codigo)} disabled={saving}>
                            Usar sugerencia
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

