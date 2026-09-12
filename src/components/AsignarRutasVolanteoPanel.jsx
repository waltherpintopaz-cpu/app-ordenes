import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";
import { obtenerCallesDeZona, particionarGrafo, calcularRutaCobertura } from "../utils/rutaVolanteo";
import { loadGoogleMapsSdk } from "./SeguimientoVolanteadoresPanel";

const TRAIL_COLORS = [
  "#EA580C", "#0891B2", "#7C3AED", "#16A34A", "#DB2777", "#CA8A04",
  "#1E4F9C", "#DC2626", "#059669", "#4F46E5", "#0D9488", "#EC4899",
];
const formatDateInput = (value) => {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Pantalla del supervisor para generar y confirmar la ruta a pie de cada
// volanteador del dia: trae las calles reales de la(s) zona(s) ya
// asignadas al grupo+fecha (src/utils/rutaVolanteo.js), las reparte entre
// las personas marcadas como activas hoy, y muestra el resultado en un
// mapa para revisar/ajustar antes de confirmar. Ver conversacion de diseño:
// la geometria/particion es 100% algoritmica (sin IA) por confiabilidad;
// la app_ordenes por ahora no decide "quien" recibe cual porcion mas alla
// del orden de la lista -- eso es una mejora futura, no parte de este V1.
export default function AsignarRutasVolanteoPanel({ grupo, fecha, onClose }) {
  const mapCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const overlaysRef = useRef([]);

  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zonas, setZonas] = useState([]);
  const [volanteadores, setVolanteadores] = useState([]);
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [rutas, setRutas] = useState([]); // [{tecnicoId, nombre, coords, distanciaM, callesUnicas, color}]
  const [guardadoOk, setGuardadoOk] = useState(false);

  const dia = formatDateInput(fecha);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: asignData, error: asignErr } = await supabase
        .from("volanteo_zonas_asignadas")
        .select("id,zona_id,zonas_cobertura(id,grupo,nombre,coordinates)")
        .eq("grupo_volanteo", grupo)
        .eq("fecha", dia);
      if (asignErr) throw asignErr;
      const zonasValidas = (asignData || [])
        .map((r) => r.zonas_cobertura)
        .filter((z) => z && Array.isArray(z.coordinates) && z.coordinates.length >= 3);
      setZonas(zonasValidas);

      const { data: usuariosData, error: usuariosErr } = await supabase
        .from("usuarios")
        .select("id,nombre,alias_volanteo,grupo_volanteo")
        .eq("grupo_volanteo", grupo)
        .eq("rol", "Volanteador")
        .eq("activo", true);
      if (usuariosErr) throw usuariosErr;
      const lista = (usuariosData || []).map((u) => ({
        id: String(u.id),
        nombre: u.alias_volanteo || u.nombre || String(u.id),
      }));
      setVolanteadores(lista);
      setSeleccionados(new Set(lista.map((v) => v.id)));
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar zonas/equipo."));
    } finally {
      setLoading(false);
    }
  }, [grupo, dia]);

  useEffect(() => { if (isSupabaseConfigured) void cargarDatos(); }, [cargarDatos]);

  useEffect(() => {
    let cancelado = false;
    loadGoogleMapsSdk()
      .then((maps) => {
        if (cancelado || !mapCanvasRef.current) return;
        mapsRef.current = maps;
        mapRef.current = new maps.Map(mapCanvasRef.current, {
          center: { lat: -16.43849, lng: -71.598208 },
          zoom: 15,
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: maps.ControlPosition.TOP_RIGHT,
            mapTypeIds: ["roadmap", "satellite", "hybrid"],
          },
          streetViewControl: false,
        });
        setMapReady(true);
      })
      .catch((e) => setError(String(e?.message || "No se pudo cargar el mapa.")));
    return () => { cancelado = true; };
  }, []);

  // Dibuja el contorno de las zonas asignadas apenas el mapa y los datos
  // estan listos, para que el supervisor vea de entrada donde va a generar.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapsRef.current || zonas.length === 0) return;
    const maps = mapsRef.current;
    const map = mapRef.current;
    const bounds = new maps.LatLngBounds();
    zonas.forEach((z) => {
      const path = z.coordinates.map((c) => ({ lat: Number(c.lat), lng: Number(c.lng) }));
      const poly = new maps.Polygon({
        map, paths: path, strokeColor: "#2563EB", strokeOpacity: 0.6, strokeWeight: 2,
        fillColor: "#2563EB", fillOpacity: 0.06,
      });
      overlaysRef.current.push(poly);
      path.forEach((p) => bounds.extend(p));
    });
    map.fitBounds(bounds);
  }, [mapReady, zonas]);

  const toggleSeleccionado = (id) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const dibujarRutas = useCallback((listaRutas) => {
    if (!mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;
    const map = mapRef.current;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    zonas.forEach((z) => {
      const path = z.coordinates.map((c) => ({ lat: Number(c.lat), lng: Number(c.lng) }));
      overlaysRef.current.push(new maps.Polygon({
        map, paths: path, strokeColor: "#2563EB", strokeOpacity: 0.5, strokeWeight: 2,
        fillColor: "#2563EB", fillOpacity: 0.04,
      }));
    });
    const bounds = new maps.LatLngBounds();
    listaRutas.forEach((r) => {
      // Puede venir partida en varias islas de calles sin conexion real
      // entre si (ver rutaVolanteo.js) -- cada una se dibuja como su
      // propia linea, NUNCA conectadas entre si con una sola Polyline
      // (eso producia lineas rectas fantasma cruzando manzanas).
      const segmentos = Array.isArray(r.segmentos) && r.segmentos.length > 0 ? r.segmentos : [r.coords];
      segmentos.forEach((seg, si) => {
        if (!seg || seg.length === 0) return;
        const path = seg.map((c) => ({ lat: c.lat, lng: c.lng }));
        const linea = new maps.Polyline({
          map, path, strokeColor: r.color, strokeOpacity: si === 0 ? 0.9 : 0.5, strokeWeight: si === 0 ? 4 : 3,
        });
        overlaysRef.current.push(linea);
        const inicio = new maps.Marker({
          map, position: path[0],
          title: si === 0
            ? `Punto de partida sugerido #${r.orden} (referencial): ${r.nombre}`
            : `${r.nombre} (isla ${si + 1} -- sin conexion directa con el resto)`,
          icon: { path: maps.SymbolPath.CIRCLE, scale: si === 0 ? 7 : 5, fillColor: r.color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
          label: si === 0 ? { text: String(r.orden), color: "#fff", fontSize: "10px", fontWeight: "bold" } : undefined,
        });
        overlaysRef.current.push(inicio);
        path.forEach((p) => bounds.extend(p));
      });
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds);
  }, [zonas]);

  const generarRutas = useCallback(async () => {
    const idsSeleccionados = volanteadores.filter((v) => seleccionados.has(v.id));
    if (zonas.length === 0) { setError("Este grupo no tiene ninguna zona asignada para esta fecha."); return; }
    if (idsSeleccionados.length === 0) { setError("Selecciona al menos un volanteador."); return; }

    setGenerando(true);
    setError("");
    setGuardadoOk(false);
    try {
      // Une las calles de todas las zonas asignadas en un solo grafo -- los
      // ids de nodo de OpenStreetMap son globales, asi que no hay riesgo de
      // colision al combinar resultados de zonas distintas.
      const nodosCombinados = new Map();
      let aristasCombinadas = [];
      for (const z of zonas) {
        const grafo = await obtenerCallesDeZona(z.coordinates);
        grafo.nodos.forEach((v, k) => nodosCombinados.set(k, v));
        aristasCombinadas = aristasCombinadas.concat(grafo.aristas);
      }
      if (aristasCombinadas.length === 0) {
        setError("No se encontraron calles de OpenStreetMap dentro de la zona. Puede que falte mapear esta zona -- se puede asignar manualmente por ahora.");
        return;
      }
      const grafoTotal = { nodos: nodosCombinados, aristas: aristasCombinadas };
      const { grupos, puntosPartida } = particionarGrafo(grafoTotal, idsSeleccionados.length);

      const resultado = grupos.map((g, idx) => {
        const persona = idsSeleccionados[idx];
        // El punto de partida sugerido (ver particionarGrafo) hace arrancar
        // el circuito ahi mismo -- asi el marcador de "Inicio" que ya se
        // dibuja en coords[0] queda en el lugar estrategico, sin tocar nada
        // del dibujo. Es solo referencial: no bloquea al supervisor de
        // dejar a la persona en otro lado.
        const ruta = calcularRutaCobertura(g, puntosPartida[idx]?.nodoId);
        return {
          tecnicoId: persona.id,
          nombre: persona.nombre,
          orden: puntosPartida[idx]?.orden || idx + 1,
          coords: ruta.coords,
          segmentos: ruta.segmentos,
          distanciaM: ruta.distanciaM,
          callesUnicas: ruta.callesUnicas || 0,
          color: TRAIL_COLORS[idx % TRAIL_COLORS.length],
          // Se guarda el grafo (no solo la linea final) para que el celular
          // pueda recalcular "la mejor ruta desde aqui" si el volanteador
          // se desvia -- ver VolanteoMapaScreen.js en la app movil.
          grafoNodos: Object.fromEntries(g.nodos),
          grafoAristas: g.aristas,
        };
      });
      setRutas(resultado);
      dibujarRutas(resultado);
    } catch (e) {
      setError(String(e?.message || "No se pudo generar la ruta (revisa tu conexion a internet)."));
    } finally {
      setGenerando(false);
    }
  }, [zonas, volanteadores, seleccionados, dibujarRutas]);

  const guardarRutas = useCallback(async () => {
    if (rutas.length === 0) return;
    setGuardando(true);
    setError("");
    try {
      const idsTecnicos = rutas.map((r) => r.tecnicoId);
      const filas = rutas.map((r) => ({
        fecha: dia,
        grupo,
        tecnico_id: r.tecnicoId,
        tecnico_nombre: r.nombre,
        coords: r.coords,
        segmentos: r.segmentos,
        distancia_m: Math.round(r.distanciaM),
        calles_cubiertas: r.callesUnicas,
        orden_entrega: r.orden,
        grafo_nodos: r.grafoNodos,
        grafo_aristas: r.grafoAristas,
        confirmada: true,
      }));
      // Inserta primero, borra despues (y solo lo previo, nunca lo recien
      // insertado): si el insert fallara -- ej. una columna nueva que
      // todavia no se migro en Supabase -- las rutas previas de estas
      // personas quedan intactas en vez de perderse. Antes se borraba ANTES
      // de insertar, y un insert fallido dejaba a todo el equipo sin ruta.
      const { data: insertadas, error: err } = await supabase.from("volanteo_rutas_asignadas").insert(filas).select("id");
      if (err) throw err;
      const nuevosIds = (insertadas || []).map((f) => f.id);
      if (nuevosIds.length > 0) {
        await supabase
          .from("volanteo_rutas_asignadas")
          .delete()
          .eq("fecha", dia)
          .eq("grupo", grupo)
          .in("tecnico_id", idsTecnicos)
          .not("id", "in", `(${nuevosIds.join(",")})`);
      }
      setGuardadoOk(true);
    } catch (e) {
      setError(String(e?.message || "No se pudo guardar. Verifica que la tabla volanteo_rutas_asignadas ya exista en Supabase."));
    } finally {
      setGuardando(false);
    }
  }, [rutas, dia, grupo]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "min(1100px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #E5E7EB" }}>
          <strong style={{ fontSize: 16 }}>🗺️ Asignar rutas de volanteo — {grupo} · {dia}</strong>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ width: 300, borderRight: "1px solid #E5E7EB", padding: 14, overflowY: "auto" }}>
            {loading ? (
              <p style={{ fontSize: 13, color: "#64748B" }}>Cargando zonas y equipo...</p>
            ) : (
              <>
                <p style={{ fontSize: 12, color: "#64748B", margin: "0 0 6px" }}>
                  Zona(s) asignada(s): {zonas.length === 0 ? "ninguna" : zonas.map((z) => z.nombre).join(", ")}
                </p>
                <strong style={{ fontSize: 13 }}>Volanteadores de hoy</strong>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {volanteadores.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#9CA3AF" }}>No hay volanteadores en este grupo.</p>
                  ) : (
                    volanteadores.map((v) => (
                      <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={seleccionados.has(v.id)} onChange={() => toggleSeleccionado(v.id)} />
                        {v.nombre}
                      </label>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  className="primary-btn"
                  onClick={generarRutas}
                  disabled={generando || zonas.length === 0}
                  style={{ marginTop: 16, width: "100%" }}
                >
                  {generando ? "Generando..." : "Generar rutas sugeridas"}
                </button>

                {error ? <p style={{ fontSize: 12, color: "#DC2626", marginTop: 10 }}>{error}</p> : null}

                {rutas.length > 0 ? (
                  <div style={{ marginTop: 16, borderTop: "1px solid #E5E7EB", paddingTop: 10 }}>
                    {rutas.map((r) => (
                      <div key={r.tecnicoId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: r.color, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>#{r.orden} · {r.nombre}</span>
                        <span style={{ color: "#64748B" }}>{(r.distanciaM / 1000).toFixed(1)}km · {r.callesUnicas} calles</span>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={guardarRutas}
                      disabled={guardando}
                      style={{ marginTop: 10, width: "100%", background: "#16A34A" }}
                    >
                      {guardando ? "Guardando..." : guardadoOk ? "✓ Guardado" : "Confirmar y guardar"}
                    </button>
                    <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                      Revisa que las rutas cubran bien cada calle antes de confirmar. Si algo falta (pasajes no mapeados), se puede agregar a mano despues desde el mapa.
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div ref={mapCanvasRef} style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}
