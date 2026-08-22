import { useState } from "react";
import JSZip from "jszip";
import { supabase } from "../supabaseClient";

const NODOS_BASE = ["Nod_01", "Nod_02", "Nod_03", "Nod_04", "Nod_05", "Nod_06"];

function extraerMid(input) {
  const raw = String(input || "").trim();
  const m = raw.match(/[?&]mid=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  return null;
}

function tagText(scope, tag) {
  const el = scope.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : "";
}

// Parsea el KML de un mapa de Google My Maps a una lista de puntos { codigo, lat, lng }.
// A diferencia del importador de zonas (poligonos), aca cada Placemark es un
// pin suelto — la caja NAP que dibujaron en Google My Maps.
function parseKmlPuntos(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("El KML no se pudo leer (formato invalido).");

  const docNameEl = doc.getElementsByTagName("Document")[0];
  const docName = docNameEl ? tagText(docNameEl, "name") : "";

  const placemarks = Array.from(doc.getElementsByTagName("Placemark"));
  const puntos = [];

  placemarks.forEach((pm) => {
    const pointEl = pm.getElementsByTagName("Point")[0];
    if (!pointEl) return; // ignorar lineas/poligonos, solo interesan los pines
    const coordsEl = pointEl.getElementsByTagName("coordinates")[0];
    if (!coordsEl) return;
    const [lng, lat] = coordsEl.textContent.trim().split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const codigo = tagText(pm, "name").trim();
    if (!codigo) return;
    const descripcion = tagText(pm, "description").trim();
    puntos.push({ codigo, lat, lng, descripcion });
  });

  return { docName, puntos };
}

async function leerKmlDesdeArchivo(file) {
  const nombre = String(file?.name || "").toLowerCase();
  if (nombre.endsWith(".kmz")) {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const entradaKml = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith(".kml")
    );
    if (!entradaKml) throw new Error("Ese .kmz no contiene ningun archivo .kml adentro.");
    return entradaKml.async("string");
  }
  if (nombre.endsWith(".kml")) {
    return file.text();
  }
  throw new Error("El archivo debe ser .kmz o .kml.");
}

export default function ImportarCajasNapModal({ onClose, onImportado }) {
  const [url, setUrl] = useState("");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [nodo, setNodo] = useState(NODOS_BASE[0]);
  const [sectorDefecto, setSectorDefecto] = useState("");
  const [preview, setPreview] = useState(null); // { mid, docName, puntos }
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

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
      const { docName, puntos } = parseKmlPuntos(xmlText);
      if (puntos.length === 0) throw new Error("No se encontraron pines (cajas) en ese mapa.");
      setSectorDefecto(docName || "");
      setPreview({ mid, docName, puntos });
    } catch (e) {
      setError(e?.message || "No se pudo importar el mapa.");
    } finally {
      setLoading(false);
    }
  };

  const onArchivoSeleccionado = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setOk(""); setPreview(null);
    setNombreArchivo(file.name);
    setLoading(true);
    try {
      const xmlText = await leerKmlDesdeArchivo(file);
      const { docName, puntos } = parseKmlPuntos(xmlText);
      if (puntos.length === 0) throw new Error("No se encontraron pines (cajas) en ese archivo.");
      setSectorDefecto(docName || "");
      setPreview({ mid: null, docName, puntos });
    } catch (e) {
      setError(e?.message || "No se pudo leer ese archivo.");
    } finally {
      setLoading(false);
    }
  };

  const confirmarImportacion = async () => {
    if (!preview) return;
    setGuardando(true);
    setError("");
    try {
      const codigos = preview.puntos.map((p) => p.codigo);
      const { data: existentes, error: buscarErr } = await supabase
        .from("nap_cajas")
        .select("id,codigo")
        .in("codigo", codigos);
      if (buscarErr) throw buscarErr;
      const idPorCodigo = new Map((existentes || []).map((r) => [String(r.codigo || "").trim().toLowerCase(), r.id]));

      const { data: maxRow, error: maxErr } = await supabase
        .from("nap_cajas")
        .select("ctoid")
        .order("ctoid", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw maxErr;
      let siguienteCtoid = Number(maxRow?.ctoid || 0) + 1;

      let creadas = 0, actualizadas = 0;
      for (const punto of preview.puntos) {
        const idExistente = idPorCodigo.get(punto.codigo.trim().toLowerCase());
        const ubicacion = `${punto.lat}, ${punto.lng}`;
        if (idExistente) {
          const { error: updErr } = await supabase
            .from("nap_cajas")
            .update({ lat: punto.lat, lng: punto.lng, ubicacion })
            .eq("id", idExistente);
          if (updErr) throw updErr;
          actualizadas += 1;
        } else {
          const { error: insErr } = await supabase.from("nap_cajas").insert([{
            ctoid: siguienteCtoid++,
            codigo: punto.codigo,
            sector: sectorDefecto.trim() || null,
            nodo,
            ubicacion,
            lat: punto.lat,
            lng: punto.lng,
          }]);
          if (insErr) throw insErr;
          creadas += 1;
        }
      }

      setOk(`Listo: ${creadas} caja${creadas !== 1 ? "s" : ""} nueva${creadas !== 1 ? "s" : ""}, ${actualizadas} actualizada${actualizadas !== 1 ? "s" : ""}.`);
      setPreview(null);
      setUrl("");
      setNombreArchivo("");
      onImportado?.();
    } catch (e) {
      setError(e?.message || "No se pudo guardar en Supabase.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>+ Importar cajas NAP</div>
          <button onClick={onClose} style={s.btnClose}>✕</button>
        </div>

        <div style={s.body}>
          <div style={s.hint}>
            Pega el link de un mapa de Google My Maps donde cada <strong>pin</strong> es una caja (nombra cada pin con su código, ej. "NAP-026"). El mapa debe estar como "Cualquier persona con el enlace puede ver".
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
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

          <div style={s.divider}>
            <span style={s.dividerLine} /> <span>o</span> <span style={s.dividerLine} />
          </div>

          <div style={s.hint}>
            ¿Tienes el archivo <strong>.kmz</strong> o <strong>.kml</strong> (por ejemplo, uno que te enviaron por WhatsApp)? Súbelo directo, sin necesidad de link.
          </div>
          <label style={s.btnArchivo}>
            {loading ? "Leyendo..." : nombreArchivo || "📎 Elegir archivo .kmz / .kml"}
            <input type="file" accept=".kmz,.kml" onChange={onArchivoSeleccionado} disabled={loading} style={{ display: "none" }} />
          </label>

          {error && <div style={s.error}>{error}</div>}
          {ok && <div style={s.ok}>✅ {ok}</div>}

          {preview && (
            <div style={s.previewBox}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Nodo de estas cajas</label>
                  <select value={nodo} onChange={(e) => setNodo(e.target.value)} style={s.input}>
                    {NODOS_BASE.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Sector (opcional, para cajas nuevas)</label>
                  <input value={sectorDefecto} onChange={(e) => setSectorDefecto(e.target.value)} style={s.input} placeholder="Ej: Juan Pablo II" />
                </div>
              </div>
              <div style={s.previewCount}>{preview.puntos.length} caja{preview.puntos.length !== 1 ? "s" : ""} encontrada{preview.puntos.length !== 1 ? "s" : ""}:</div>
              <div style={s.previewList}>
                {preview.puntos.map((p, i) => (
                  <span key={i} style={s.previewChip}>{p.codigo}</span>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
                Las que ya existan (mismo código) solo actualizan su ubicación — no tocan capacidad, puertos ocupados ni fotos.
              </div>
              <button onClick={confirmarImportacion} disabled={guardando} style={{ ...s.btn("#16a34a"), width: "100%", marginTop: 10, opacity: guardando ? 0.6 : 1 }}>
                {guardando ? "Guardando..." : `Importar ${preview.puntos.length} cajas`}
              </button>
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
  divider: { display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", margin: "12px 0" },
  dividerLine: { flex: 1, height: 1, background: "#e2e8f0" },
  btnArchivo: { display: "block", width: "100%", boxSizing: "border-box", padding: "10px 12px", textAlign: "center", background: "#f8fafc", border: "1px dashed #94a3b8", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#334155", cursor: "pointer" },
};
