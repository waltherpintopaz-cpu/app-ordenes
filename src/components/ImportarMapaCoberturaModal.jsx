import { useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

function extraerMid(input) {
  const raw = String(input || "").trim();
  const m = raw.match(/[?&]mid=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // Si pegaron directamente el ID (sin URL alrededor)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  return null;
}

function tagText(scope, tag) {
  const el = scope.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : "";
}

function kmlColorToHexAlpha(kmlColor) {
  if (!kmlColor || kmlColor.length < 8) return null;
  const aa = kmlColor.slice(0, 2), bb = kmlColor.slice(2, 4), gg = kmlColor.slice(4, 6), rr = kmlColor.slice(6, 8);
  const alpha = parseInt(aa, 16) / 255;
  return { hex: `#${rr}${gg}${bb}`.toUpperCase(), alpha: Math.round(alpha * 100) / 100 };
}

// Parsea el KML de un mapa de Google My Maps a una lista de zonas { nombre, coordinates, strokeColor, fillColor, fillOpacity }.
function parseKml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("El KML no se pudo leer (formato invalido).");

  const docNameEl = doc.getElementsByTagName("Document")[0];
  const docName = docNameEl ? tagText(docNameEl, "name") : "";

  // Styles directos: id -> { lineColor, polyColor }
  const styles = {};
  Array.from(doc.getElementsByTagName("Style")).forEach((styleEl) => {
    const id = styleEl.getAttribute("id");
    if (!id) return;
    const lineStyleEl = styleEl.getElementsByTagName("LineStyle")[0];
    const polyStyleEl = styleEl.getElementsByTagName("PolyStyle")[0];
    styles[id] = {
      lineColor: lineStyleEl ? tagText(lineStyleEl, "color") : "",
      polyColor: polyStyleEl ? tagText(polyStyleEl, "color") : "",
    };
  });

  // StyleMap: id -> id del Style "normal"
  const styleMaps = {};
  Array.from(doc.getElementsByTagName("StyleMap")).forEach((smEl) => {
    const id = smEl.getAttribute("id");
    if (!id) return;
    let normalUrl = null;
    Array.from(smEl.getElementsByTagName("Pair")).forEach((p) => {
      if (tagText(p, "key") === "normal") normalUrl = tagText(p, "styleUrl").replace(/^#/, "");
    });
    styleMaps[id] = normalUrl;
  });

  const placemarks = Array.from(doc.getElementsByTagName("Placemark"));
  const nameCount = {};
  const zonas = [];

  placemarks.forEach((pm) => {
    const coordsEl = pm.getElementsByTagName("coordinates")[0];
    if (!coordsEl) return; // marcadores puntuales sin poligono: se ignoran

    let nombre = tagText(pm, "name") || "Zona";
    nameCount[nombre] = (nameCount[nombre] || 0) + 1;
    if (nameCount[nombre] > 1) nombre = `${nombre} ${nameCount[nombre]}`;

    const coordinates = coordsEl.textContent
      .trim()
      .split(/\s+/)
      .map((triplet) => {
        const [lng, lat] = triplet.split(",").map(Number);
        return { lat, lng };
      })
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
    if (coordinates.length < 3) return; // no es un poligono valido

    let styleId = tagText(pm, "styleUrl").replace(/^#/, "");
    if (styleMaps[styleId]) styleId = styleMaps[styleId];
    const styleDef = styles[styleId] || {};
    const line = kmlColorToHexAlpha(styleDef.lineColor);
    const poly = kmlColorToHexAlpha(styleDef.polyColor);

    zonas.push({
      nombre,
      coordinates,
      strokeColor: line?.hex || "#2563eb",
      fillColor: poly?.hex || "#2563eb",
      fillOpacity: poly?.alpha ?? 0.25,
    });
  });

  return { docName, zonas };
}

export default function ImportarMapaCoberturaModal({ zonasActuales = [], onClose, onImportado }) {
  const [url, setUrl] = useState("");
  const [grupo, setGrupo] = useState("");
  const [preview, setPreview] = useState(null); // { mid, zonas }
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const gruposExistentes = useMemo(() => {
    const map = new Map();
    zonasActuales.forEach((z) => {
      const key = z.mid || z.grupo;
      if (!map.has(key)) map.set(key, { mid: z.mid, grupo: z.grupo, count: 0 });
      map.get(key).count += 1;
    });
    return Array.from(map.values());
  }, [zonasActuales]);

  const previsualizar = async () => {
    setError(""); setOk(""); setPreview(null);
    const mid = extraerMid(url);
    if (!mid) { setError("No se encontro un ID de mapa (mid) valido en ese link."); return; }
    setLoading(true);
    try {
      const kmlUrl = `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`;
      const res = await fetch(kmlUrl);
      if (!res.ok) throw new Error(`Google respondio ${res.status}. Verifica que el mapa sea publico ("Cualquier persona con el enlace").`);
      const xmlText = await res.text();
      const { docName, zonas } = parseKml(xmlText);
      if (zonas.length === 0) throw new Error("No se encontraron poligonos en ese mapa.");
      setGrupo(docName || "Zona importada");
      setPreview({ mid, zonas });
    } catch (e) {
      setError(e?.message || "No se pudo importar el mapa.");
    } finally {
      setLoading(false);
    }
  };

  const confirmarImportacion = async () => {
    if (!preview) return;
    setGuardando(true);
    setError("");
    try {
      // Reimportar reemplaza limpio: borra lo previo de este mismo mapa (mid) antes de insertar
      const { error: delErr } = await supabase.from("zonas_cobertura").delete().eq("mid", preview.mid);
      if (delErr) throw delErr;

      const rows = preview.zonas.map((z) => ({
        grupo: grupo.trim() || "Zona importada",
        nombre: z.nombre,
        stroke_color: z.strokeColor,
        fill_color: z.fillColor,
        fill_opacity: z.fillOpacity,
        coordinates: z.coordinates,
        mid: preview.mid,
      }));
      const { error: insErr } = await supabase.from("zonas_cobertura").insert(rows);
      if (insErr) throw insErr;

      setOk(`Importadas ${rows.length} zonas de "${grupo}".`);
      setPreview(null);
      setUrl("");
      onImportado?.();
    } catch (e) {
      setError(e?.message || "No se pudo guardar en Supabase.");
    } finally {
      setGuardando(false);
    }
  };

  const borrarGrupo = async (g) => {
    if (!window.confirm(`Borrar todas las zonas de "${g.grupo}" (${g.count})?`)) return;
    try {
      const q = supabase.from("zonas_cobertura").delete();
      const { error: delErr } = g.mid ? await q.eq("mid", g.mid) : await q.eq("grupo", g.grupo);
      if (delErr) throw delErr;
      onImportado?.();
    } catch (e) {
      setError(e?.message || "No se pudo borrar.");
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>+ Agregar mapa de cobertura</div>
          <button onClick={onClose} style={s.btnClose}>✕</button>
        </div>

        <div style={s.body}>
          <div style={s.hint}>
            Pega el link para compartir de un mapa de Google My Maps (debe estar como "Cualquier persona con el enlace puede ver").
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.google.com/maps/d/edit?mid=..."
              style={s.input}
            />
            <button onClick={previsualizar} disabled={loading || !url.trim()} style={{ ...s.btn("#2563eb"), opacity: loading || !url.trim() ? 0.6 : 1 }}>
              {loading ? "Leyendo..." : "Leer mapa"}
            </button>
          </div>

          {error && <div style={s.error}>{error}</div>}
          {ok && <div style={s.ok}>✅ {ok}</div>}

          {preview && (
            <div style={s.previewBox}>
              <div style={{ marginBottom: 8 }}>
                <label style={s.label}>Nombre del grupo</label>
                <input value={grupo} onChange={(e) => setGrupo(e.target.value)} style={s.input} />
              </div>
              <div style={s.previewCount}>{preview.zonas.length} poligono{preview.zonas.length !== 1 ? "s" : ""} encontrado{preview.zonas.length !== 1 ? "s" : ""}:</div>
              <div style={s.previewList}>
                {preview.zonas.map((z, i) => (
                  <span key={i} style={s.previewChip}>{z.nombre}</span>
                ))}
              </div>
              <button onClick={confirmarImportacion} disabled={guardando} style={{ ...s.btn("#16a34a"), width: "100%", marginTop: 10, opacity: guardando ? 0.6 : 1 }}>
                {guardando ? "Guardando..." : `Importar ${preview.zonas.length} zonas`}
              </button>
            </div>
          )}

          {gruposExistentes.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={s.label}>Mapas ya importados</div>
              {gruposExistentes.map((g) => (
                <div key={g.mid || g.grupo} style={s.grupoRow}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#0f172a" }}>{g.grupo}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{g.count} zona{g.count !== 1 ? "s" : ""}</div>
                  </div>
                  <button onClick={() => borrarGrupo(g)} style={s.btnDanger}>Borrar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, zIndex: 5000, background: "rgba(15,23,42,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14 },
  modal: { background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e2e8f0" },
  title: { fontWeight: 800, fontSize: 14, color: "#0f172a" },
  btnClose: { width: 28, height: 28, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontWeight: 700, color: "#475569" },
  body: { padding: 16 },
  hint: { fontSize: 11, color: "#64748b", marginBottom: 10, lineHeight: 1.5 },
  input: { flex: 1, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 12, outline: "none", boxSizing: "border-box", width: "100%" },
  btn: (color) => ({ padding: "8px 14px", background: color, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }),
  error: { marginTop: 10, padding: "8px 10px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, fontSize: 11 },
  ok: { marginTop: 10, padding: "8px 10px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: 8, fontSize: 11, fontWeight: 700 },
  previewBox: { marginTop: 12, padding: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 },
  label: { fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, display: "block" },
  previewCount: { fontSize: 11, color: "#475569", marginTop: 8, marginBottom: 4 },
  previewList: { display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 120, overflowY: "auto" },
  previewChip: { fontSize: 10, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 999, padding: "2px 8px" },
  grupoRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 6 },
  btnDanger: { padding: "4px 10px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer" },
};
