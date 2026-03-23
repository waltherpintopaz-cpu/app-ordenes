import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const CATEGORIAS = [
  { label: "Cable de fibra", prefix: "CF" },
  { label: "cajas de distribucion", prefix: "CD" },
  { label: "spliter opticos", prefix: "SO" },
  { label: "conectividad de fibra", prefix: "COF" },
  { label: "herrajes y sujecion", prefix: "HS" },
  { label: "proteccion y organizacion", prefix: "PO" },
  { label: "canalizacion", prefix: "CAN" },
];
const UNIDADES = ["unidad", "m", "rollo", "caja", "kg", "lt"];
const EVIDENCIAS_BUCKET = "planta-externa-evidencias";
const DEV_SOL_TABLE = "almacen_pe_devolucion_solicitudes";
const TABLE_NOT_FOUND_PATTERNS = ["does not exist", "relation", "could not find the", "no existe"];

const num = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const fmtFecha = (v) => {
  const d = new Date(String(v || ""));
  return Number.isNaN(d.getTime()) ? String(v || "") : d.toLocaleString();
};
const esHoy = (v) => {
  const d = new Date(String(v || ""));
  if (Number.isNaN(d.getTime())) return false;
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
const missingColumn = (m = "") => {
  const a = String(m).match(/column\s+["']?([a-zA-Z0-9_.]+)["']?\s+does not exist/i);
  const b = String(m).match(/could not find the ['"]([a-zA-Z0-9_.]+)['"] column/i);
  const raw = String(a?.[1] || b?.[1] || "");
  return raw.includes(".") ? raw.split(".").pop() : raw;
};
const tableMissingError = (error = null) => {
  const msg = String(error?.message || "").toLowerCase();
  return TABLE_NOT_FOUND_PATTERNS.some((x) => msg.includes(String(x).toLowerCase()));
};
const parseJsonArraySafe = (raw) => {
  if (Array.isArray(raw)) return raw.map((x) => String(x || "").trim()).filter(Boolean);
  const txt = String(raw || "").trim();
  if (!txt) return [];
  try {
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed.map((x) => String(x || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
};
const ymdTag = (v = new Date()) => {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
};
const codePrefix = (cat) => CATEGORIAS.find((c) => c.label === cat)?.prefix || "IT";
const nextCode = (items, cat) => {
  const p = codePrefix(cat);
  const rx = new RegExp(`^PE-${p}-(\\d+)$`, "i");
  let max = 0;
  (items || []).forEach((it) => {
    const hit = String(it?.codigo || "").match(rx);
    if (!hit) return;
    const n = Number(hit[1]);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return `PE-${p}-${String(max + 1).padStart(4, "0")}`;
};
const stockVisual = (stockRaw, minRaw) => {
  const stock = num(stockRaw, 0);
  const min = num(minRaw, 0);
  if (stock <= 0) return { label: "SIN STOCK", pct: 0, fill: "#CC4A00" };
  if (min <= 0) return { label: "OK", pct: 100, fill: "#17803d" };
  const ratio = stock / Math.max(min, 1);
  if (ratio < 1) return { label: "CRITICO", pct: Math.max(8, Math.min(100, Math.round(ratio * 100))), fill: "#CC4A00" };
  if (ratio < 1.4) return { label: "BAJO", pct: Math.max(30, Math.min(100, Math.round(ratio * 70))), fill: "#B7791F" };
  return { label: "OK", pct: 100, fill: "#17803d" };
};
const escHtml = (v = "") => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const extFromName = (name = "") => {
  const hit = String(name || "").match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return String(hit?.[1] || "jpg").toLowerCase();
};
const fileToDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = () => reject(new Error("No se pudo leer archivo.")); r.readAsDataURL(file); });
const uniqueFiles = (files = []) => {
  const map = new Map();
  files.forEach((f) => {
    if (!(f instanceof File)) return;
    const k = `${f.name}::${f.size}::${f.lastModified}`;
    if (!map.has(k)) map.set(k, f);
  });
  return Array.from(map.values());
};
const openPrintableHtml = (html, fallbackName = "documento") => {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (popup) {
    popup.document.write(html);
    popup.document.close();
    setTimeout(() => {
      try {
        popup.focus();
        popup.print();
      } catch {
        // noop
      }
    }, 350);
    return true;
  }
  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${fallbackName}.html`;
    a.click();
    URL.revokeObjectURL(href);
    return true;
  } catch {
    return false;
  }
};

export default function PlantaExternaPanel({ sessionUser }) {
  const actorSesion = String(sessionUser?.nombre || sessionUser?.username || "ALMACEN").trim() || "ALMACEN";
  const rolSesion = String(sessionUser?.rol || "").trim().toLowerCase();
  const esTecnicoSesion = rolSesion === "tecnico";
  const puedeAprobarDevolucion = !esTecnicoSesion;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submenu, setSubmenu] = useState("resumen");
  const [items, setItems] = useState([]);
  const [movs, setMovs] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [almacenesDisponibles, setAlmacenesDisponibles] = useState(true);
  const [almacenSeleccionadoId, setAlmacenSeleccionadoId] = useState("");
  const [solicitudesDev, setSolicitudesDev] = useState([]);
  const [solicitudesDisponibles, setSolicitudesDisponibles] = useState(true);
  const [tecnicosDisponibles, setTecnicosDisponibles] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("TODAS");
  const [editandoId, setEditandoId] = useState("");
  const [autoCodigo, setAutoCodigo] = useState(true);
  const [guardandoItem, setGuardandoItem] = useState(false);
  const [guardandoEntrada, setGuardandoEntrada] = useState(false);
  const [guardandoSalida, setGuardandoSalida] = useState(false);
  const [guardandoDevolucion, setGuardandoDevolucion] = useState(false);
  const [procesandoSolicitudId, setProcesandoSolicitudId] = useState("");
  const [generandoPdfId, setGenerandoPdfId] = useState("");
  const [generandoPdfItems, setGenerandoPdfItems] = useState(false);
  const [anulandoMovId, setAnulandoMovId] = useState("");
  const [kardexLimit, setKardexLimit] = useState(120);
  const [pendientesLimit, setPendientesLimit] = useState(80);
  const bucketWarnedRef = useRef(false);
  const [formItem, setFormItem] = useState({ codigo: "", nombre: "", categoria: CATEGORIAS[0].label, unidadBase: "unidad", stockMinimo: "", costoUnitarioRef: "", ubicacion: "", fotoReferencia: "", ingresoInicial: "" });
  const [formItemFotoFile, setFormItemFotoFile] = useState(null);
  const [formItemFotoPreview, setFormItemFotoPreview] = useState("");
  const [entradaFiles, setEntradaFiles] = useState([]);
  const [formEntrada, setFormEntrada] = useState({ itemId: "", busquedaItem: "", cantidad: "", costoUnitario: "", estadoMaterial: "BUENO", motivo: "Compra proveedor", referenciaTipo: "COMPRA", referenciaId: "", responsableRecepcion: "" });
  const [salidaFiles, setSalidaFiles] = useState([]);
  const [formSalida, setFormSalida] = useState({ itemId: "", busquedaItem: "", cantidad: "", motivo: "Salida a tecnico", referenciaTipo: "OT", referenciaId: "", responsableRecepcion: "", receptorModo: "lista" });
  const [devolucionFiles, setDevolucionFiles] = useState([]);
  const [autoReferenciaDevolucion, setAutoReferenciaDevolucion] = useState(true);
  const [formDevolucion, setFormDevolucion] = useState({ salidaId: "", cantidad: "", estadoMaterial: "BUENO", motivo: "Devolucion de sobrante", referenciaTipo: "DEV", referenciaId: "", responsableEntrega: "" });

  const almacenesActivos = useMemo(() => {
    const list = Array.isArray(almacenes) ? almacenes : [];
    const activos = list.filter((a) => {
      const estado = String(a?.estado || "").trim().toLowerCase();
      if (!estado) return true;
      return estado !== "inactivo";
    });
    if (activos.length) return activos;
    return [{ id: "ALM-PRINCIPAL", nombre: "Almacen principal", estado: "activo" }];
  }, [almacenes]);
  const almacenSeleccionado = useMemo(
    () => almacenesActivos.find((a) => String(a.id) === String(almacenSeleccionadoId || "")) || almacenesActivos[0] || null,
    [almacenesActivos, almacenSeleccionadoId]
  );
  const matchAlmacenSeleccionado = useCallback(
    (row) => {
      const selectedId = String(almacenSeleccionado?.id || "").trim();
      if (!selectedId) return true;
      const rowId = String(row?.almacenId || "").trim();
      if (!rowId) return true;
      return rowId === selectedId;
    },
    [almacenSeleccionado]
  );

  const selectConFallback = useCallback(async ({ table, candidates, orderBy, ascending = true, limit = 0 }) => {
    let lastError = null;
    for (let i = 0; i < candidates.length; i += 1) {
      const selectText = String(candidates[i] || "").trim();
      if (!selectText) continue;
      let q = supabase.from(table).select(selectText);
      if (orderBy) q = q.order(orderBy, { ascending });
      if (limit > 0) q = q.limit(limit);
      const res = await q;
      if (!res.error) return res;
      lastError = res.error;
    }
    throw lastError || new Error(`No se pudo consultar ${table}.`);
  }, []);

  const insertConFallback = useCallback(async (table, payload, withSingle = true) => {
    let data = { ...(payload || {}) };
    for (;;) {
      let q = supabase.from(table).insert([data]);
      if (withSingle) q = q.select("id").single();
      const res = await q;
      if (!res.error) return res;
      const miss = missingColumn(res.error?.message || "");
      if (!miss || !Object.prototype.hasOwnProperty.call(data, miss)) return res;
      const { [miss]: _omitted, ...rest } = data;
      data = rest;
    }
  }, []);

  const updateConFallback = useCallback(async (table, payload, id) => {
    let data = { ...(payload || {}) };
    for (;;) {
      const res = await supabase.from(table).update(data).eq("id", id);
      if (!res.error) return res;
      const miss = missingColumn(res.error?.message || "");
      if (!miss || !Object.prototype.hasOwnProperty.call(data, miss)) return res;
      const { [miss]: _omitted, ...rest } = data;
      data = rest;
    }
  }, []);

  const cargar = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Configura Supabase para usar Planta Externa.");
      return;
    }
    setLoading(true);
    try {
      const al = await selectConFallback({
        table: "almacenes",
        candidates: ["id,nombre,estado,activo", "id,nombre,estado", "id,nombre,activo", "id,nombre"],
        orderBy: "nombre",
        ascending: true,
      }).catch((err) => ({ error: err, data: [] }));
      if (al?.error) {
        if (tableMissingError(al.error)) {
          setAlmacenesDisponibles(false);
          setAlmacenes([{ id: "ALM-PRINCIPAL", nombre: "Almacen principal", estado: "activo" }]);
        } else {
          throw al.error;
        }
      } else {
        setAlmacenesDisponibles(true);
        setAlmacenes((al.data || []).map((r) => ({ id: String(r.id || ""), nombre: String(r.nombre || ""), estado: String(r.estado || "activo") })));
      }
      const [mv, sd, usu] = await Promise.all([
        selectConFallback({
          table: "almacen_pe_movimientos",
          candidates: [
            "id,item_id,tipo,cantidad,unidad,costo_unitario,motivo,referencia_tipo,referencia_id,salida_origen_id,estado_material,actor,responsable_entrega,responsable_recepcion,observacion,fecha_mov,almacen_id,almacen_nombre",
            "id,item_id,tipo,cantidad,unidad,motivo,referencia_tipo,referencia_id,salida_origen_id,estado_material,actor,responsable_entrega,responsable_recepcion,observacion,fecha_mov,almacen_id,almacen_nombre",
            "id,item_id,tipo,cantidad,unidad,costo_unitario,motivo,referencia_tipo,referencia_id,salida_origen_id,estado_material,actor,responsable_entrega,responsable_recepcion,observacion,fecha_mov",
            "id,item_id,tipo,cantidad,unidad,motivo,referencia_tipo,referencia_id,salida_origen_id,estado_material,actor,responsable_entrega,responsable_recepcion,observacion,fecha_mov",
          ],
          orderBy: "fecha_mov",
          ascending: false,
          limit: 500,
        }),
        supabase.from("vw_almacen_pe_salidas_saldo").select("salida_id,codigo,nombre,cantidad_salida,cantidad_devuelta,saldo_pendiente,unidad,referencia_tipo,referencia_id,responsable_entrega,responsable_recepcion,fecha_salida").order("fecha_salida", { ascending: false }).limit(250),
        selectConFallback({
          table: "usuarios",
          candidates: ["id,nombre,username,rol,activo", "id,nombre,rol,activo", "id,nombre,username,rol"],
          orderBy: "nombre",
          ascending: true,
        }).catch((err) => ({ error: err, data: [] })),
      ]);
      const it = await selectConFallback({
        table: "almacen_pe_items",
        candidates: [
          "id,codigo,nombre,categoria,unidad_base,stock_actual,stock_minimo,costo_unitario_ref,ubicacion,foto_referencia,almacen_id,almacen_nombre",
          "id,codigo,nombre,categoria,unidad_base,stock_actual,stock_minimo,costo_unitario_ref,ubicacion,almacen_id,almacen_nombre",
          "id,codigo,nombre,categoria,unidad_base,stock_actual,stock_minimo,costo_unitario_ref,ubicacion,foto_referencia",
          "id,codigo,nombre,categoria,unidad_base,stock_actual,stock_minimo,costo_unitario_ref,ubicacion",
        ],
        orderBy: "codigo",
        ascending: true,
      });
      if (mv.error) throw mv.error;
      if (sd.error) throw sd.error;
      if (!usu?.error) {
        setTecnicosDisponibles(
          (usu.data || [])
            .filter((r) => String(r?.activo ?? true) !== "false" && String(r?.rol || "").trim().toLowerCase() === "tecnico")
            .map((r) => String(r?.nombre || r?.username || "").trim())
            .filter(Boolean)
        );
      }
      const sol = await supabase
        .from(DEV_SOL_TABLE)
        .select("id,salida_origen_id,item_id,cantidad,unidad,estado_material,motivo,referencia_tipo,referencia_id,responsable_entrega,responsable_recepcion,actor_solicita,observacion,evidencias,estado,aprobado_por,aprobado_at,rechazo_motivo,procesado_movimiento_id,procesado_merma_id,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      const mappedItems = (it.data || []).map((r) => ({ id: String(r.id || ""), codigo: String(r.codigo || ""), nombre: String(r.nombre || ""), categoria: String(r.categoria || CATEGORIAS[0].label), unidadBase: String(r.unidad_base || "unidad"), stockActual: num(r.stock_actual), stockMinimo: num(r.stock_minimo), costoUnitarioRef: num(r.costo_unitario_ref), ubicacion: String(r.ubicacion || ""), fotoReferencia: String(r.foto_referencia || ""), almacenId: String(r.almacen_id || ""), almacenNombre: String(r.almacen_nombre || "") }));
      setItems(mappedItems);
      setMovs((mv.data || []).map((r) => ({ id: String(r.id || ""), itemId: String(r.item_id || ""), tipo: String(r.tipo || ""), cantidad: num(r.cantidad), unidad: String(r.unidad || "unidad"), costoUnitario: num(r.costo_unitario), motivo: String(r.motivo || ""), referenciaTipo: String(r.referencia_tipo || ""), referenciaId: String(r.referencia_id || ""), salidaOrigenId: String(r.salida_origen_id || ""), estadoMaterial: String(r.estado_material || ""), actor: String(r.actor || ""), responsableEntrega: String(r.responsable_entrega || ""), responsableRecepcion: String(r.responsable_recepcion || ""), observacion: String(r.observacion || ""), fechaISO: String(r.fecha_mov || ""), fecha: fmtFecha(r.fecha_mov), almacenId: String(r.almacen_id || ""), almacenNombre: String(r.almacen_nombre || "") })));
      setSaldos((sd.data || []).map((r) => ({ salidaId: String(r.salida_id || ""), codigo: String(r.codigo || ""), nombre: String(r.nombre || ""), cantidadSalida: num(r.cantidad_salida), cantidadDevuelta: num(r.cantidad_devuelta), saldoPendiente: num(r.saldo_pendiente), unidad: String(r.unidad || "unidad"), referenciaTipo: String(r.referencia_tipo || ""), referenciaId: String(r.referencia_id || ""), responsableEntrega: String(r.responsable_entrega || ""), responsableRecepcion: String(r.responsable_recepcion || ""), fechaSalida: String(r.fecha_salida || "") })));
      if (sol.error) {
        if (tableMissingError(sol.error)) {
          setSolicitudesDisponibles(false);
          setSolicitudesDev([]);
        } else {
          throw sol.error;
        }
      } else {
        setSolicitudesDisponibles(true);
        setSolicitudesDev(
          (sol.data || []).map((r) => ({
            id: String(r.id || ""),
            salidaId: String(r.salida_origen_id || ""),
            itemId: String(r.item_id || ""),
            cantidad: num(r.cantidad),
            unidad: String(r.unidad || "unidad"),
            estadoMaterial: String(r.estado_material || "BUENO").toUpperCase(),
            motivo: String(r.motivo || ""),
            referenciaTipo: String(r.referencia_tipo || ""),
            referenciaId: String(r.referencia_id || ""),
            responsableEntrega: String(r.responsable_entrega || ""),
            responsableRecepcion: String(r.responsable_recepcion || ""),
            actorSolicita: String(r.actor_solicita || ""),
            observacion: String(r.observacion || ""),
            evidencias: parseJsonArraySafe(r.evidencias),
            estado: String(r.estado || "PENDIENTE").toUpperCase(),
            aprobadoPor: String(r.aprobado_por || ""),
            aprobadoAt: String(r.aprobado_at || ""),
            rechazoMotivo: String(r.rechazo_motivo || ""),
            movId: String(r.procesado_movimiento_id || ""),
            mermaId: String(r.procesado_merma_id || ""),
            createdAt: String(r.created_at || ""),
          }))
        );
      }
      setError("");
      setFormItem((p) => ({ ...p, codigo: p.codigo || nextCode(mappedItems, p.categoria) }));
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar Planta Externa."));
    } finally {
      setLoading(false);
    }
  }, [selectConFallback]);

  useEffect(() => { void cargar(); }, [cargar]);
  const pendientes = useMemo(() => (saldos || []).filter((s) => num(s.saldoPendiente, 0) > 0), [saldos]);
  const movById = useMemo(() => {
    const map = {};
    (movs || []).forEach((m) => {
      map[String(m?.id || "")] = m;
    });
    return map;
  }, [movs]);
  const movsOperativos = useMemo(() => (movs || []).filter((m) => matchAlmacenSeleccionado(m)), [movs, matchAlmacenSeleccionado]);
  const itemsOperativos = useMemo(() => (items || []).filter((i) => matchAlmacenSeleccionado(i)), [items, matchAlmacenSeleccionado]);
  const pendientesOperativos = useMemo(
    () =>
      (pendientes || []).filter((p) => {
        const mov = movById[String(p?.salidaId || "")];
        if (!mov) return true;
        return matchAlmacenSeleccionado(mov);
      }),
    [pendientes, movById, matchAlmacenSeleccionado]
  );
  const cats = useMemo(() => Array.from(new Set((itemsOperativos || []).map((i) => String(i.categoria || "")).filter(Boolean))), [itemsOperativos]);
  const itemById = useMemo(() => (items || []).reduce((acc, it) => { acc[String(it.id || "")] = it; return acc; }, {}), [items]);
  const itemEntradaSel = useMemo(() => itemsOperativos.find((i) => i.id === formEntrada.itemId) || null, [itemsOperativos, formEntrada.itemId]);
  const itemSalidaSel = useMemo(() => itemsOperativos.find((i) => i.id === formSalida.itemId) || null, [itemsOperativos, formSalida.itemId]);
  const salidaSel = useMemo(() => pendientesOperativos.find((p) => p.salidaId === formDevolucion.salidaId) || null, [pendientesOperativos, formDevolucion.salidaId]);
  const solicitudesVisibles = useMemo(() => {
    if (!esTecnicoSesion) return solicitudesDev || [];
    return (solicitudesDev || []).filter((s) => String(s.actorSolicita || "").trim() === actorSesion);
  }, [solicitudesDev, esTecnicoSesion, actorSesion]);
  const solicitudesVisiblesOperativas = useMemo(
    () =>
      (solicitudesVisibles || []).filter((s) => {
        const salidaMov = movById[String(s?.salidaId || "")];
        if (salidaMov) return matchAlmacenSeleccionado(salidaMov);
        const item = itemById[String(s?.itemId || "")];
        if (item) return matchAlmacenSeleccionado(item);
        return true;
      }),
    [solicitudesVisibles, movById, itemById, matchAlmacenSeleccionado]
  );
  const solicitudesPendientesOperativas = useMemo(
    () => (solicitudesVisiblesOperativas || []).filter((s) => s.estado === "PENDIENTE"),
    [solicitudesVisiblesOperativas]
  );

  const itemsFiltrados = useMemo(() => {
    const q = String(busqueda || "").trim().toLowerCase();
    return (itemsOperativos || []).filter((it) => (filtroCat === "TODAS" || it.categoria === filtroCat) && (!q || `${it.codigo} ${it.nombre} ${it.categoria} ${it.ubicacion} ${it.almacenNombre || ""}`.toLowerCase().includes(q)));
  }, [itemsOperativos, busqueda, filtroCat]);
  const itemsEntradaFiltrados = useMemo(() => {
    const q = String(formEntrada.busquedaItem || "").trim().toLowerCase();
    return (itemsOperativos || []).filter((it) => !q || `${it.codigo} ${it.nombre} ${it.categoria} ${it.almacenNombre || ""}`.toLowerCase().includes(q));
  }, [itemsOperativos, formEntrada.busquedaItem]);
  const itemsSalidaFiltrados = useMemo(() => {
    const q = String(formSalida.busquedaItem || "").trim().toLowerCase();
    return (itemsOperativos || []).filter((it) => !q || `${it.codigo} ${it.nombre} ${it.categoria} ${it.almacenNombre || ""}`.toLowerCase().includes(q));
  }, [itemsOperativos, formSalida.busquedaItem]);

  const sugEntrada = useMemo(() => {
    const tag = ymdTag(new Date());
    const rx = new RegExp(`^PE-ING-${tag}-(\\d{4})$`, "i");
    let max = 0;
    (movs || []).forEach((m) => {
      if (String(m?.tipo || "").toUpperCase() !== "INGRESO") return;
      const hit = String(m?.referenciaId || "").match(rx);
      if (!hit) return;
      const n = Number(hit[1]);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return `PE-ING-${tag}-${String(max + 1).padStart(4, "0")}`;
  }, [movs]);
  const sugSalida = useMemo(() => {
    const tag = ymdTag(new Date());
    const rx = new RegExp(`^PE-SAL-${tag}-(\\d{4})$`, "i");
    let max = 0;
    (movs || []).forEach((m) => {
      if (String(m?.tipo || "").toUpperCase() !== "SALIDA") return;
      const hit = String(m?.referenciaId || "").match(rx);
      if (!hit) return;
      const n = Number(hit[1]);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return `PE-SAL-${tag}-${String(max + 1).padStart(4, "0")}`;
  }, [movs]);
  const sugDev = useMemo(() => {
    const tag = ymdTag(new Date());
    const rx = new RegExp(`^PE-DEV-${tag}-(\\d{4})$`, "i");
    let max = 0;
    (movs || []).forEach((m) => {
      if (String(m?.tipo || "").toUpperCase() !== "DEVOLUCION") return;
      const hit = String(m?.referenciaId || "").match(rx);
      if (!hit) return;
      const n = Number(hit[1]);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return `PE-DEV-${tag}-${String(max + 1).padStart(4, "0")}`;
  }, [movs]);

  useEffect(() => {
    if (!itemsOperativos.length) {
      if (formEntrada.itemId) setFormEntrada((p) => ({ ...p, itemId: "" }));
      if (formSalida.itemId) setFormSalida((p) => ({ ...p, itemId: "" }));
      return;
    }
    if (!itemsOperativos.some((i) => String(i?.id || "") === String(formEntrada.itemId || ""))) {
      setFormEntrada((p) => ({ ...p, itemId: String(itemsOperativos[0]?.id || "") }));
    }
    if (!itemsOperativos.some((i) => String(i?.id || "") === String(formSalida.itemId || ""))) {
      setFormSalida((p) => ({ ...p, itemId: String(itemsOperativos[0]?.id || "") }));
    }
  }, [itemsOperativos, formEntrada.itemId, formSalida.itemId]);
  useEffect(() => {
    if (String(formEntrada.responsableRecepcion || "").trim()) return;
    setFormEntrada((prev) => ({ ...prev, responsableRecepcion: actorSesion }));
  }, [actorSesion, formEntrada.responsableRecepcion]);
  useEffect(() => {
    const p = (pendientesOperativos || []).find((x) => num(x?.saldoPendiente, 0) > 0);
    if (!p?.salidaId) {
      if (formDevolucion.salidaId) setFormDevolucion((prev) => ({ ...prev, salidaId: "" }));
      return;
    }
    if (!formDevolucion.salidaId || !pendientesOperativos.some((x) => String(x?.salidaId || "") === String(formDevolucion.salidaId || ""))) {
      setFormDevolucion((prev) => ({ ...prev, salidaId: String(p.salidaId || ""), responsableEntrega: String(p.responsableRecepcion || "") }));
    }
  }, [pendientesOperativos, formDevolucion.salidaId]);
  useEffect(() => {
    if (!autoReferenciaDevolucion) return;
    setFormDevolucion((prev) => ({ ...prev, referenciaId: sugDev }));
  }, [autoReferenciaDevolucion, sugDev]);
  useEffect(() => {
    if (!autoCodigo || editandoId) return;
    setFormItem((p) => ({ ...p, codigo: nextCode(items, p.categoria) }));
  }, [autoCodigo, editandoId, items, formItem.categoria]);
  useEffect(() => {
    if (!almacenesActivos.length) return;
    if (!almacenSeleccionadoId || !almacenesActivos.some((a) => String(a.id) === String(almacenSeleccionadoId))) {
      setAlmacenSeleccionadoId(String(almacenesActivos[0].id || ""));
    }
  }, [almacenesActivos, almacenSeleccionadoId]);

  const dashboard = useMemo(() => {
    const totalItems = itemsOperativos.length;
    const stockTotal = itemsOperativos.reduce((a, i) => a + num(i.stockActual), 0);
    const valorRef = itemsOperativos.reduce((a, i) => a + num(i.stockActual) * num(i.costoUnitarioRef), 0);
    const bajoMin = itemsOperativos.filter((i) => num(i.stockMinimo) > 0 && num(i.stockActual) <= num(i.stockMinimo)).length;
    const tipo = (m) => String(m?.tipo || "").trim().toUpperCase();
    const esIngresoStock = (m) => {
      const t = tipo(m);
      return t === "INGRESO" || t === "DEVOLUCION";
    };
    const esSalidaStock = (m) => tipo(m) === "SALIDA";
    const movHoy = movsOperativos.filter((m) => esHoy(m.fechaISO));
    const ingHoy = movHoy.filter(esIngresoStock).reduce((a, m) => a + num(m.cantidad), 0);
    const salHoy = movHoy.filter(esSalidaStock).reduce((a, m) => a + num(m.cantidad), 0);
    const ingRegistrado = movsOperativos.filter(esIngresoStock).reduce((a, m) => a + num(m.cantidad), 0);
    const salRegistrada = movsOperativos.filter(esSalidaStock).reduce((a, m) => a + num(m.cantidad), 0);
    const saldoPend = pendientesOperativos.reduce((a, p) => a + num(p.saldoPendiente), 0);
    const solicitudesPend = solicitudesPendientesOperativas.length;
    const topCats = Object.values(
      itemsOperativos.reduce((acc, it) => {
        const c = String(it.categoria || "general");
        if (!acc[c]) acc[c] = { categoria: c, items: 0, stock: 0 };
        acc[c].items += 1;
        acc[c].stock += num(it.stockActual);
        return acc;
      }, {})
    )
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 5);
    const balanceHoy = ingHoy - salHoy;
    const eficienciaSalida = ingRegistrado > 0 ? Math.max(0, Math.min(100, Math.round((salRegistrada / ingRegistrado) * 100))) : 0;
    return {
      totalItems,
      stockTotal,
      valorRef,
      bajoMin,
      movHoy: movHoy.length,
      ingHoy,
      salHoy,
      ingRegistrado,
      salRegistrada,
      saldoPend,
      solicitudesPend,
      topCats,
      balanceHoy,
      eficienciaSalida,
    };
  }, [itemsOperativos, movsOperativos, pendientesOperativos, solicitudesPendientesOperativas.length]);

  const addPickedFiles = (event, setFiles) => {
    const list = Array.from(event.target?.files || []);
    event.target.value = "";
    if (!list.length) return;
    setFiles((prev) => uniqueFiles([...(Array.isArray(prev) ? prev : []), ...list]));
  };
  const pickItemPhoto = (event) => {
    const file = event.target?.files?.[0];
    event.target.value = "";
    if (!(file instanceof File)) return;
    if (formItemFotoPreview && formItemFotoPreview.startsWith("blob:")) URL.revokeObjectURL(formItemFotoPreview);
    setFormItemFotoFile(file);
    setFormItemFotoPreview(URL.createObjectURL(file));
  };

  const subirEvidencias = useCallback(async (values = [], modulo = "mov", referencia = "") => {
    const out = [];
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (!v) continue;
      if (typeof v === "string") { out.push(String(v || "").trim()); continue; }
      if (!(v instanceof File)) continue;
      const ext = extFromName(v.name || "jpg");
      const path = `${modulo}/${ymdTag(new Date())}/${String(referencia || "sin-ref").replace(/[^A-Za-z0-9_-]/g, "_")}_${Date.now()}_${i}.${ext}`;
      try {
        const up = await supabase.storage.from(EVIDENCIAS_BUCKET).upload(path, v, { contentType: v.type || "image/jpeg", upsert: false });
        if (up.error) throw up.error;
        const pub = supabase.storage.from(EVIDENCIAS_BUCKET).getPublicUrl(path);
        out.push(String(pub?.data?.publicUrl || "").trim() || path);
      } catch (e) {
        try {
          const dataUri = await fileToDataUrl(v);
          if (dataUri) {
            if (!bucketWarnedRef.current) { bucketWarnedRef.current = true; window.alert("Evidencias: Storage no disponible, se guardara embebida."); }
            out.push(dataUri);
            continue;
          }
        } catch {
          // noop
        }
        if (!bucketWarnedRef.current) { bucketWarnedRef.current = true; window.alert(`Evidencias: no se pudo subir (${String(e?.message || "error")}).`); }
      }
    }
    return out.filter(Boolean);
  }, []);

  const limpiarItem = () => {
    setEditandoId("");
    setAutoCodigo(true);
    setFormItem({ codigo: nextCode(items, CATEGORIAS[0].label), nombre: "", categoria: CATEGORIAS[0].label, unidadBase: "unidad", stockMinimo: "", costoUnitarioRef: "", ubicacion: "", fotoReferencia: "", ingresoInicial: "" });
    setFormItemFotoFile(null);
    if (formItemFotoPreview && formItemFotoPreview.startsWith("blob:")) URL.revokeObjectURL(formItemFotoPreview);
    setFormItemFotoPreview("");
  };
  const limpiarEntrada = () => setFormEntrada((p) => ({ ...p, busquedaItem: "", cantidad: "", costoUnitario: "", estadoMaterial: "BUENO", motivo: "Compra proveedor", referenciaTipo: "COMPRA", referenciaId: "", responsableRecepcion: actorSesion }));
  const limpiarSalida = () => setFormSalida((p) => ({ ...p, busquedaItem: "", cantidad: "", motivo: "Salida a tecnico", referenciaTipo: "OT", referenciaId: "", responsableRecepcion: "", receptorModo: "lista" }));
  const limpiarDev = useCallback(() => {
    const p = (pendientesOperativos || [])[0];
    setAutoReferenciaDevolucion(true);
    setFormDevolucion((prev) => ({ ...prev, salidaId: String(p?.salidaId || ""), cantidad: "", estadoMaterial: "BUENO", motivo: "Devolucion de sobrante", referenciaTipo: "DEV", referenciaId: "", responsableEntrega: String(p?.responsableRecepcion || "") }));
  }, [pendientesOperativos]);
  const guardarItem = async () => {
    const codigoAuto = autoCodigo && !editandoId ? nextCode(items, formItem.categoria) : formItem.codigo;
    const codigo = String(codigoAuto || "").trim().toUpperCase() || nextCode(items, formItem.categoria);
    const nombre = String(formItem.nombre || "").trim();
    const unidadBase = String(formItem.unidadBase || "unidad").trim().toLowerCase();
    if (!nombre) return window.alert("Items: ingresa nombre.");
    if (!UNIDADES.includes(unidadBase)) return window.alert("Items: unidad no valida.");
    setGuardandoItem(true);
    try {
      let fotoReferencia = String(formItem.fotoReferencia || "").trim();
      if (formItemFotoFile) {
        const f = await subirEvidencias([formItemFotoFile], "items", codigo);
        fotoReferencia = String(f?.[0] || fotoReferencia).trim();
      }
      if (editandoId) {
        const up = await updateConFallback("almacen_pe_items", { codigo, nombre, categoria: formItem.categoria, unidad_base: unidadBase, stock_minimo: num(formItem.stockMinimo), costo_unitario_ref: num(formItem.costoUnitarioRef), ubicacion: String(formItem.ubicacion || ""), foto_referencia: fotoReferencia, almacen_id: String(almacenSeleccionado?.id || "") || null, almacen_nombre: String(almacenSeleccionado?.nombre || "") || null }, editandoId);
        if (up.error) throw up.error;
      } else {
        const ins = await insertConFallback("almacen_pe_items", { codigo, nombre, categoria: formItem.categoria, unidad_base: unidadBase, stock_minimo: num(formItem.stockMinimo), costo_unitario_ref: num(formItem.costoUnitarioRef), ubicacion: String(formItem.ubicacion || ""), foto_referencia: fotoReferencia, activo: true, almacen_id: String(almacenSeleccionado?.id || "") || null, almacen_nombre: String(almacenSeleccionado?.nombre || "") || null }, true);
        if (ins.error) throw ins.error;
        if (num(formItem.ingresoInicial) > 0) {
          const mv = await insertConFallback("almacen_pe_movimientos", { item_id: ins.data.id, tipo: "INGRESO", cantidad: num(formItem.ingresoInicial), unidad: unidadBase, costo_unitario: num(formItem.costoUnitarioRef) || null, motivo: "Ingreso inicial por alta de item", referencia_tipo: "ALTA_ITEM", referencia_id: codigo, responsable_recepcion: actorSesion, actor: actorSesion, almacen_id: String(almacenSeleccionado?.id || "") || null, almacen_nombre: String(almacenSeleccionado?.nombre || "") || null }, false);
          if (mv.error) throw mv.error;
        }
      }
      await cargar();
      limpiarItem();
      window.alert("Items: guardado correctamente.");
    } catch (e) {
      window.alert(String(e?.message || "No se pudo guardar."));
    } finally {
      setGuardandoItem(false);
    }
  };

  const registrarEntrada = async () => {
    if (!itemEntradaSel?.id) return window.alert("Entradas: selecciona item.");
    const selectedAlmacenId = String(almacenSeleccionado?.id || "").trim();
    const itemAlmacenId = String(itemEntradaSel?.almacenId || "").trim();
    if (selectedAlmacenId && itemAlmacenId && selectedAlmacenId !== itemAlmacenId) {
      return window.alert("Entradas: el item pertenece a otro almacen. Cambia el almacen operativo o el item.");
    }
    const cantidad = num(formEntrada.cantidad);
    if (cantidad <= 0) return window.alert("Entradas: cantidad invalida.");
    setGuardandoEntrada(true);
    try {
      const referenciaId = String(formEntrada.referenciaId || "").trim() || sugEntrada;
      const evidencias = await subirEvidencias(entradaFiles, "entradas", referenciaId);
      const payload = { item_id: itemEntradaSel.id, tipo: "INGRESO", cantidad, unidad: itemEntradaSel.unidadBase || "unidad", costo_unitario: num(formEntrada.costoUnitario) > 0 ? num(formEntrada.costoUnitario) : null, estado_material: String(formEntrada.estadoMaterial || "BUENO").trim().toUpperCase(), motivo: String(formEntrada.motivo || "Ingreso").trim(), referencia_tipo: String(formEntrada.referenciaTipo || "COMPRA").trim(), referencia_id: referenciaId, responsable_recepcion: String(formEntrada.responsableRecepcion || actorSesion).trim(), actor: actorSesion, observacion: evidencias.length ? `EVIDENCIAS_APP:${JSON.stringify(evidencias)}` : "" };
      payload.almacen_id = String(almacenSeleccionado?.id || "") || null;
      payload.almacen_nombre = String(almacenSeleccionado?.nombre || "") || null;
      const ins = await insertConFallback("almacen_pe_movimientos", payload, true);
      if (ins.error) throw ins.error;
      await cargar();
      limpiarEntrada();
      setEntradaFiles([]);
      window.alert(`Entradas: ingreso registrado. ID: ${referenciaId}`);
    } catch (e) {
      window.alert(String(e?.message || "No se pudo registrar entrada."));
    } finally {
      setGuardandoEntrada(false);
    }
  };

  const registrarSalida = async () => {
    if (!itemSalidaSel?.id) return window.alert("Salidas: selecciona item.");
    const selectedAlmacenId = String(almacenSeleccionado?.id || "").trim();
    const itemAlmacenId = String(itemSalidaSel?.almacenId || "").trim();
    if (selectedAlmacenId && itemAlmacenId && selectedAlmacenId !== itemAlmacenId) {
      return window.alert("Salidas: el item pertenece a otro almacen. Cambia el almacen operativo o el item.");
    }
    const cantidad = num(formSalida.cantidad);
    if (cantidad <= 0) return window.alert("Salidas: cantidad invalida.");
    if (cantidad > num(itemSalidaSel?.stockActual, 0)) return window.alert(`Salidas: stock insuficiente (${num(itemSalidaSel?.stockActual, 0).toFixed(2)} ${itemSalidaSel?.unidadBase || "unidad"}).`);
    const receptor = String(formSalida.responsableRecepcion || "").trim();
    if (!receptor) return window.alert("Salidas: ingresa receptor.");
    setGuardandoSalida(true);
    try {
      const referenciaId = String(formSalida.referenciaId || "").trim() || sugSalida;
      const evidencias = await subirEvidencias(salidaFiles, "salidas", referenciaId);
      const ins = await insertConFallback("almacen_pe_movimientos", { item_id: itemSalidaSel.id, tipo: "SALIDA", cantidad, unidad: itemSalidaSel.unidadBase || "unidad", motivo: String(formSalida.motivo || "Salida").trim(), referencia_tipo: String(formSalida.referenciaTipo || "OT").trim(), referencia_id: referenciaId, responsable_entrega: actorSesion, responsable_recepcion: receptor, actor: actorSesion, observacion: evidencias.length ? `EVIDENCIAS_APP:${JSON.stringify(evidencias)}` : "", almacen_id: String(almacenSeleccionado?.id || "") || null, almacen_nombre: String(almacenSeleccionado?.nombre || "") || null }, true);
      if (ins.error) throw ins.error;
      await cargar();
      limpiarSalida();
      setSalidaFiles([]);
      window.alert(`Salidas: salida registrada. ID: ${referenciaId}`);
    } catch (e) {
      window.alert(String(e?.message || "No se pudo registrar salida."));
    } finally {
      setGuardandoSalida(false);
    }
  };

  const aplicarDevolucionAStock = useCallback(
    async ({
      salidaId,
      itemId,
      unidad,
      cantidad,
      estadoMaterial = "BUENO",
      motivo = "Devolucion",
      referenciaTipo = "DEV",
      referenciaId = "",
      responsableEntrega = "",
      responsableRecepcion = actorSesion,
      evidencias = [],
      observacionExtra = "",
    }) => {
      const obsPartes = [];
      const evid = Array.isArray(evidencias) ? evidencias.filter(Boolean) : [];
      if (evid.length) obsPartes.push(`EVIDENCIAS_APP:${JSON.stringify(evid)}`);
      if (String(observacionExtra || "").trim()) obsPartes.push(String(observacionExtra).trim());
      const observacion = obsPartes.join(" | ");
      const ins = await supabase
        .from("almacen_pe_movimientos")
        .insert([{
          item_id: itemId,
          tipo: "DEVOLUCION",
          cantidad,
          unidad: String(unidad || "unidad"),
          motivo: String(motivo || "Devolucion").trim(),
          referencia_tipo: String(referenciaTipo || "DEV").trim(),
          referencia_id: String(referenciaId || "").trim(),
          salida_origen_id: salidaId,
          estado_material: String(estadoMaterial || "BUENO").trim().toUpperCase(),
          responsable_entrega: String(responsableEntrega || "").trim(),
          responsable_recepcion: String(responsableRecepcion || actorSesion).trim(),
          actor: actorSesion,
          observacion,
          almacen_id: String(almacenSeleccionado?.id || "") || null,
          almacen_nombre: String(almacenSeleccionado?.nombre || "") || null,
        }])
        .select("id")
        .single();
      if (ins.error) throw ins.error;

      let mermaWarn = "";
      let mermaId = "";
      if (String(estadoMaterial || "").trim().toUpperCase() === "DANIADO") {
        const mermaRef = `${String(referenciaId || "").trim() || "DEV"}-DM`;
        const merma = await supabase
          .from("almacen_pe_movimientos")
          .insert([{
            item_id: itemId,
            tipo: "MERMA",
            cantidad,
            unidad: String(unidad || "unidad"),
            motivo: `Merma por devolucion daniada (${String(referenciaId || "").trim() || "-"})`,
            referencia_tipo: "MERMA_DEV",
            referencia_id: mermaRef,
            responsable_entrega: String(responsableEntrega || "").trim(),
            responsable_recepcion: String(responsableRecepcion || actorSesion).trim(),
            actor: actorSesion,
            observacion: `ORIGEN_DEV:${String(ins.data?.id || "")}`,
            almacen_id: String(almacenSeleccionado?.id || "") || null,
            almacen_nombre: String(almacenSeleccionado?.nombre || "") || null,
          }])
          .select("id")
          .single();
        if (merma.error) {
          mermaWarn = `Devolucion guardada, pero no se pudo registrar merma automatica (${String(merma.error?.message || "error")}).`;
        } else {
          mermaId = String(merma.data?.id || "");
        }
      }
      return {
        movId: String(ins.data?.id || ""),
        mermaId,
        mermaWarn,
      };
    },
    [actorSesion, almacenSeleccionado]
  );

  const registrarSolicitudDevolucion = useCallback(async () => {
    const salidaId = String(formDevolucion.salidaId || "").trim();
    if (!salidaId) return window.alert("Devoluciones: selecciona salida pendiente.");
    const cantidad = num(formDevolucion.cantidad);
    if (cantidad <= 0) return window.alert("Devoluciones: cantidad invalida.");
    const estadoMaterial = String(formDevolucion.estadoMaterial || "BUENO").trim().toUpperCase();
    const motivo = String(formDevolucion.motivo || "").trim();
    if (!motivo) return window.alert("Devoluciones: ingresa motivo.");
    if (estadoMaterial === "DANIADO" && devolucionFiles.length === 0) {
      return window.alert("Devoluciones: para material dañado adjunta al menos 1 evidencia.");
    }
    const salida = pendientesOperativos.find((p) => p.salidaId === salidaId);
    if (!salida) return window.alert("Devoluciones: salida sin saldo.");
    if (cantidad > num(salida.saldoPendiente, 0)) return window.alert("Devoluciones: excede saldo pendiente.");
    setGuardandoDevolucion(true);
    try {
      const origen = await supabase.from("almacen_pe_movimientos").select("id,item_id,unidad,responsable_recepcion").eq("id", salidaId).single();
      if (origen.error) throw origen.error;
      const referenciaId = String(formDevolucion.referenciaId || "").trim() || sugDev;
      const evidencias = await subirEvidencias(devolucionFiles, "devoluciones", referenciaId);
      const ins = await supabase.from(DEV_SOL_TABLE).insert([{
        salida_origen_id: salidaId,
        item_id: String(origen.data.item_id || ""),
        cantidad,
        unidad: String(origen.data.unidad || salida.unidad || "unidad"),
        estado_material: estadoMaterial,
        motivo,
        referencia_tipo: String(formDevolucion.referenciaTipo || "DEV").trim(),
        referencia_id: referenciaId,
        responsable_entrega: String(formDevolucion.responsableEntrega || origen.data.responsable_recepcion || "").trim(),
        responsable_recepcion: actorSesion,
        actor_solicita: actorSesion,
        observacion: "",
        evidencias,
        estado: "PENDIENTE",
      }]).select("id").single();
      if (ins.error) {
        if (tableMissingError(ins.error)) {
          window.alert("Falta la tabla de solicitudes de devolucion. Ejecuta la migracion SQL nueva y vuelve a intentar.");
          return;
        }
        throw ins.error;
      }
      await cargar();
      limpiarDev();
      setDevolucionFiles([]);
      window.alert(`Solicitud enviada. ID: ${referenciaId}`);
    } catch (e) {
      window.alert(String(e?.message || "No se pudo enviar la solicitud de devolucion."));
    } finally {
      setGuardandoDevolucion(false);
    }
  }, [actorSesion, cargar, devolucionFiles, formDevolucion, limpiarDev, pendientesOperativos, subirEvidencias, sugDev]);

  const registrarDevolucion = async () => {
    if (!puedeAprobarDevolucion) {
      await registrarSolicitudDevolucion();
      return;
    }
    const salidaId = String(formDevolucion.salidaId || "").trim();
    if (!salidaId) return window.alert("Devoluciones: selecciona salida pendiente.");
    const cantidad = num(formDevolucion.cantidad);
    if (cantidad <= 0) return window.alert("Devoluciones: cantidad invalida.");
    const estadoMaterial = String(formDevolucion.estadoMaterial || "BUENO").trim().toUpperCase();
    const motivo = String(formDevolucion.motivo || "").trim();
    if (!motivo) return window.alert("Devoluciones: ingresa motivo.");
    if (estadoMaterial === "DANIADO" && devolucionFiles.length === 0) {
      return window.alert("Devoluciones: para material dañado adjunta al menos 1 evidencia.");
    }
    const salida = pendientesOperativos.find((p) => p.salidaId === salidaId);
    if (!salida) return window.alert("Devoluciones: salida sin saldo.");
    if (cantidad > num(salida.saldoPendiente, 0)) return window.alert("Devoluciones: excede saldo pendiente.");
    setGuardandoDevolucion(true);
    try {
      const origen = await supabase.from("almacen_pe_movimientos").select("id,item_id,unidad,responsable_recepcion").eq("id", salidaId).single();
      if (origen.error) throw origen.error;
      const referenciaId = String(formDevolucion.referenciaId || "").trim() || sugDev;
      const evidencias = await subirEvidencias(devolucionFiles, "devoluciones", referenciaId);
      const result = await aplicarDevolucionAStock({
        salidaId,
        itemId: String(origen.data.item_id || ""),
        unidad: String(origen.data.unidad || salida.unidad || "unidad"),
        cantidad,
        estadoMaterial,
        motivo,
        referenciaTipo: String(formDevolucion.referenciaTipo || "DEV").trim(),
        referenciaId,
        responsableEntrega: String(formDevolucion.responsableEntrega || origen.data.responsable_recepcion || "").trim(),
        responsableRecepcion: actorSesion,
        evidencias,
      });
      await cargar();
      limpiarDev();
      setDevolucionFiles([]);
      window.alert(result.mermaWarn || `Devoluciones: registrada. ID: ${referenciaId}`);
    } catch (e) {
      window.alert(String(e?.message || "No se pudo registrar devolucion."));
    } finally {
      setGuardandoDevolucion(false);
    }
  };

  const aprobarSolicitudDevolucion = useCallback(async (solicitud) => {
    const id = String(solicitud?.id || "").trim();
    if (!id) return;
    if (!puedeAprobarDevolucion) return;
    setProcesandoSolicitudId(id);
    try {
      const salidaId = String(solicitud?.salidaId || "").trim();
      const salida = pendientesOperativos.find((p) => String(p.salidaId || "") === salidaId);
      if (!salida) throw new Error("La salida origen ya no tiene saldo disponible.");
      const cantidad = num(solicitud?.cantidad);
      if (cantidad <= 0) throw new Error("Cantidad invalida en solicitud.");
      if (cantidad > num(salida.saldoPendiente, 0)) {
        throw new Error(`La solicitud excede saldo pendiente actual (${num(salida.saldoPendiente, 0).toFixed(2)}).`);
      }
      const referenciaId = String(solicitud?.referenciaId || "").trim() || sugDev;
      const result = await aplicarDevolucionAStock({
        salidaId,
        itemId: String(solicitud?.itemId || ""),
        unidad: String(solicitud?.unidad || salida.unidad || "unidad"),
        cantidad,
        estadoMaterial: String(solicitud?.estadoMaterial || "BUENO"),
        motivo: String(solicitud?.motivo || "Devolucion aprobada"),
        referenciaTipo: String(solicitud?.referenciaTipo || "DEV"),
        referenciaId,
        responsableEntrega: String(solicitud?.responsableEntrega || salida.responsableRecepcion || ""),
        responsableRecepcion: actorSesion,
        evidencias: Array.isArray(solicitud?.evidencias) ? solicitud.evidencias : [],
        observacionExtra: `SOLICITUD:${id}`,
      });
      const upd = await supabase
        .from(DEV_SOL_TABLE)
        .update({
          estado: "APROBADA",
          aprobado_por: actorSesion,
          aprobado_at: new Date().toISOString(),
          responsable_recepcion: actorSesion,
          procesado_movimiento_id: result.movId || null,
          procesado_merma_id: result.mermaId || null,
        })
        .eq("id", id);
      if (upd.error) throw upd.error;
      await cargar();
      window.alert(result.mermaWarn || `Solicitud aprobada (${referenciaId}).`);
    } catch (e) {
      window.alert(String(e?.message || "No se pudo aprobar la solicitud."));
    } finally {
      setProcesandoSolicitudId("");
    }
  }, [actorSesion, aplicarDevolucionAStock, cargar, pendientesOperativos, puedeAprobarDevolucion, sugDev]);

  const rechazarSolicitudDevolucion = useCallback(async (solicitud) => {
    const id = String(solicitud?.id || "").trim();
    if (!id) return;
    if (!puedeAprobarDevolucion) return;
    const motivo = String(window.prompt("Motivo de rechazo") || "").trim();
    if (!motivo) return;
    setProcesandoSolicitudId(id);
    try {
      const upd = await supabase
        .from(DEV_SOL_TABLE)
        .update({
          estado: "RECHAZADA",
          aprobado_por: actorSesion,
          aprobado_at: new Date().toISOString(),
          rechazo_motivo: motivo,
          responsable_recepcion: actorSesion,
        })
        .eq("id", id);
      if (upd.error) throw upd.error;
      await cargar();
      window.alert("Solicitud rechazada.");
    } catch (e) {
      window.alert(String(e?.message || "No se pudo rechazar la solicitud."));
    } finally {
      setProcesandoSolicitudId("");
    }
  }, [actorSesion, cargar, puedeAprobarDevolucion]);

  const anularMovimiento = async (mov) => {
    const id = String(mov?.id || "").trim();
    if (!id) return;
    const ok = window.confirm(`Se generara contramovimiento para anular ${id}.`);
    if (!ok) return;
    setAnulandoMovId(id);
    try {
      const tipo = String(mov?.tipo || "").toUpperCase();
      const cantidad = num(mov?.cantidad, 0);
      if (cantidad <= 0) throw new Error("Cantidad invalida.");
      let tipoContrario = "AJUSTE";
      if (tipo === "INGRESO") tipoContrario = "SALIDA";
      if (tipo === "SALIDA") tipoContrario = "INGRESO";
      if (tipo === "DEVOLUCION") tipoContrario = "SALIDA";
      const refAnul = `ANUL-${id.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase()}`;
      const ins = await insertConFallback("almacen_pe_movimientos", { item_id: String(mov?.itemId || ""), tipo: tipoContrario, cantidad, unidad: String(mov?.unidad || "unidad"), motivo: `Anulacion de movimiento ${id}`, referencia_tipo: "ANUL", referencia_id: refAnul, responsable_entrega: actorSesion, responsable_recepcion: actorSesion, actor: actorSesion, observacion: `ANULA:${id}`, almacen_id: String(almacenSeleccionado?.id || "") || null, almacen_nombre: String(almacenSeleccionado?.nombre || "") || null }, true);
      if (ins.error) throw ins.error;
      await cargar();
      window.alert(`Kardex: movimiento anulado (${refAnul}).`);
    } catch (e) {
      window.alert(String(e?.message || "No se pudo anular."));
    } finally {
      setAnulandoMovId("");
    }
  };

  const eliminarItem = async (it) => {
    const id = String(it?.id || "").trim();
    if (!id) return;
    const ok = window.confirm(`Eliminar ${String(it?.codigo || "")} - ${String(it?.nombre || "")}?`);
    if (!ok) return;
    try {
      const del = await supabase.from("almacen_pe_items").delete().eq("id", id);
      if (del.error) throw del.error;
      if (editandoId === id) limpiarItem();
      await cargar();
      window.alert("Items: eliminado.");
    } catch (e) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("foreign key") || msg.includes("reference") || msg.includes("violates")) window.alert("Items: no se puede eliminar, tiene kardex.");
      else window.alert(String(e?.message || "No se pudo eliminar."));
    }
  };
  const generarPdfMovimiento = async (row) => {
    const id = String(row?.salidaId || row?.id || "").trim();
    if (!id) return window.alert("PDF: no se encontro movimiento.");
    setGenerandoPdfId(id);
    try {
      const mv = await supabase.from("almacen_pe_movimientos").select("id,item_id,tipo,cantidad,unidad,motivo,referencia_tipo,referencia_id,responsable_entrega,responsable_recepcion,estado_material,fecha_mov").eq("id", id).single();
      if (mv.error) throw mv.error;
      const item = itemById[String(mv.data?.item_id || "")];
      const codigo = String(row?.codigo || item?.codigo || "-");
      const nombre = String(row?.nombre || item?.nombre || "-");
      const tipoMov = String(mv.data?.tipo || "").toUpperCase();
      const html = `<html><head><meta charset="utf-8"/><style>body{font-family:Arial;padding:20px}h1{font-size:20px;color:#1e4f9c}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d6dce5;padding:8px;font-size:12px;text-align:left}th{background:#f3f7ff}</style></head><body><h1>Comprobante PE</h1><p>Generado: ${escHtml(new Date().toLocaleString())}</p><table><tr><th>Campo</th><th>Valor</th></tr><tr><td>ID</td><td>${escHtml(id)}</td></tr><tr><td>Tipo</td><td>${escHtml(tipoMov)}</td></tr><tr><td>Fecha</td><td>${escHtml(fmtFecha(mv.data?.fecha_mov || ""))}</td></tr><tr><td>Item</td><td>${escHtml(codigo)} - ${escHtml(nombre)}</td></tr><tr><td>Cantidad</td><td>${num(mv.data?.cantidad, 0).toFixed(2)} ${escHtml(String(mv.data?.unidad || "unidad"))}</td></tr><tr><td>Motivo</td><td>${escHtml(String(mv.data?.motivo || "-"))}</td></tr><tr><td>Referencia</td><td>${escHtml(String(mv.data?.referencia_tipo || "-"))} ${escHtml(String(mv.data?.referencia_id || "-"))}</td></tr><tr><td>Entrega</td><td>${escHtml(String(mv.data?.responsable_entrega || "-"))}</td></tr><tr><td>Recepcion</td><td>${escHtml(String(mv.data?.responsable_recepcion || "-"))}</td></tr><tr><td>Estado material</td><td>${escHtml(String(mv.data?.estado_material || "-"))}</td></tr></table><p style="font-size:11px;color:#64748b">Documento informativo. Validar con kardex para auditoria.</p></body></html>`;
      const opened = openPrintableHtml(html, `movimiento_pe_${id}`);
      if (!opened) window.alert("PDF: popup bloqueado.");
    } catch (e) {
      window.alert(String(e?.message || "No se pudo generar PDF."));
    } finally {
      setGenerandoPdfId("");
    }
  };

  const generarPdfItems = async () => {
    if (!itemsFiltrados.length) return window.alert("PDF: no hay items para el almacén/filtro actual.");
    setGenerandoPdfItems(true);
    try {
      const ordenados = [...itemsFiltrados].sort((a, b) => String(a?.codigo || "").localeCompare(String(b?.codigo || ""), "es", { sensitivity: "base" }));
      const rows = ordenados.map((it, i) => { const sv = stockVisual(it.stockActual, it.stockMinimo); return `<tr><td>${i + 1}</td><td>${escHtml(it.codigo || "-")}</td><td>${escHtml(it.nombre || "-")}</td><td>${escHtml(it.categoria || "-")}</td><td>${escHtml(it.unidadBase || "-")}</td><td>${num(it.stockActual, 0).toFixed(2)}</td><td>${num(it.stockMinimo, 0).toFixed(2)}</td><td>${escHtml(it.ubicacion || "-")}</td><td>${escHtml(sv.label)}</td></tr>`; }).join("");
      const html = `<html><head><meta charset="utf-8"/><style>body{font-family:Arial;padding:20px}h1{font-size:20px;color:#1e4f9c}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d6dce5;padding:7px;font-size:11px;text-align:left}th{background:#f3f7ff}</style></head><body><h1>Catalogo de items - Planta externa</h1><p>Generado: ${escHtml(new Date().toLocaleString())} | Total: ${ordenados.length}</p><table><tr><th>#</th><th>Codigo</th><th>Nombre</th><th>Categoria</th><th>Unidad</th><th>Stock</th><th>Min</th><th>Ubicacion</th><th>Estado</th></tr>${rows}</table></body></html>`;
      const opened = openPrintableHtml(html, `items_pe_${ymdTag(new Date())}`);
      if (!opened) window.alert("PDF: popup bloqueado.");
    } catch (e) {
      window.alert(String(e?.message || "No se pudo generar PDF de items."));
    } finally {
      setGenerandoPdfItems(false);
    }
  };

  const peSubmenuItems = [
    { key: "resumen", label: "Resumen" },
    { key: "items", label: "Items" },
    { key: "nuevo", label: editandoId ? "Editar item" : "Nuevo item" },
    { key: "entradas", label: "Entradas" },
    { key: "salidas", label: "Salidas" },
    { key: "devoluciones", label: "Devoluciones" },
    { key: "solicitudes", label: "Solicitudes" },
    { key: "kardex", label: "Kardex" },
  ];
  const mostrarSelectorAlmacenOperativo = ["entradas", "salidas", "devoluciones", "nuevo", "items", "kardex"].includes(submenu);

  return (
    <section className="panel pe-panel">
      <div className="pe-head-row">
        <h2 className="pe-page-title">Planta externa</h2>
        <button type="button" className="secondary-btn small" onClick={() => void cargar()} disabled={loading}>{loading ? "Actualizando..." : "Actualizar"}</button>
      </div>
      <div className="pe-submenu-card">
        <div className="pe-tabs">
          {peSubmenuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={submenu === item.key ? "pe-tab active" : "pe-tab"}
              onClick={() => setSubmenu(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {mostrarSelectorAlmacenOperativo ? (
        <div className="pe-almacen-operativo-card">
          <div className="pe-almacen-operativo-head">
            <span className="pe-almacen-operativo-title">Almacen operativo</span>
            <span className="pe-almacen-operativo-tip">Afecta las operaciones de la vista actual</span>
          </div>
          <select
            className="pe-almacen-operativo-select"
            value={almacenSeleccionadoId}
            onChange={(e) => setAlmacenSeleccionadoId(e.target.value)}
          >
            {almacenesActivos.map((al) => <option key={al.id} value={al.id}>{al.nombre}</option>)}
          </select>
        </div>
      ) : null}

      {error ? <p className="warn-text">{error}</p> : null}
      {!almacenesDisponibles ? <p className="warn-text">No existe tabla `almacenes`; se usa Almacen principal por compatibilidad.</p> : null}

      {submenu === "resumen" ? (
        <div className="pe-card pe-dashboard-card">
          <div className="pe-dashboard-head">
            <div>
              <h3>Dashboard operativo</h3>
              <p className="panel-meta pe-dashboard-subtitle">Indicadores en tiempo real para controlar inventario, salidas y devoluciones.</p>
            </div>
            <div className={dashboard.balanceHoy >= 0 ? "pe-balance up" : "pe-balance down"}>
              <span>Balance hoy</span>
              <strong>{dashboard.balanceHoy >= 0 ? "+" : ""}{dashboard.balanceHoy.toFixed(2)}</strong>
            </div>
          </div>

          <div className="pe-dashboard-grid">
            <article className="pe-kpi-card pe-kpi-hero">
              <span>Valor referencial almacen</span>
              <strong>S/ {dashboard.valorRef.toFixed(2)}</strong>
              <p>Stock total: {dashboard.stockTotal.toFixed(2)} unidades equivalentes</p>
              <div className="pe-kpi-inline">
                <small>Ingresado: {dashboard.ingRegistrado.toFixed(2)}</small>
                <small>Despachado: {dashboard.salRegistrada.toFixed(2)}</small>
              </div>
            </article>
            <article className="pe-kpi-card">
              <strong>{dashboard.totalItems}</strong>
              <span>Items activos</span>
            </article>
            <article className="pe-kpi-card">
              <strong>{dashboard.bajoMin}</strong>
              <span>Items bajo minimo</span>
            </article>
            <article className="pe-kpi-card">
              <strong>{dashboard.movHoy}</strong>
              <span>Movimientos hoy</span>
            </article>
            <article className="pe-kpi-card">
              <strong>{dashboard.ingHoy.toFixed(2)} / {dashboard.salHoy.toFixed(2)}</strong>
              <span>Ingreso/Salida de hoy</span>
            </article>
            <article className="pe-kpi-card">
              <strong>{dashboard.saldoPend.toFixed(2)}</strong>
              <span>Saldo pendiente por devolver</span>
            </article>
            <article className="pe-kpi-card">
              <strong>{dashboard.solicitudesPend}</strong>
              <span>Solicitudes pendientes</span>
            </article>
            <article className="pe-kpi-card">
              <strong>{dashboard.eficienciaSalida}%</strong>
              <span>Indice de rotacion</span>
            </article>
          </div>

          <div className="pe-top-cats">
            <h4>Top categorias por volumen en stock</h4>
            {dashboard.topCats.length ? (
              <div className="pe-top-cats-list">
                {dashboard.topCats.map((c) => {
                  const maxStock = num(dashboard.topCats[0]?.stock, 0);
                  const pct = maxStock > 0 ? Math.max(8, Math.min(100, Math.round((num(c.stock) / maxStock) * 100))) : 0;
                  return (
                    <div key={c.categoria} className="pe-top-cat-row">
                      <span className="pe-top-cat-name">{c.categoria}</span>
                      <div className="pe-top-cat-track">
                        <div className="pe-top-cat-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <strong className="pe-top-cat-value">{num(c.stock).toFixed(2)}</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty">Sin datos por categoria aun.</p>
            )}
          </div>

          <div className="pe-quick-grid">
            <button type="button" className="pe-quick-btn" onClick={() => setSubmenu("salidas")}><strong>Registrar salida</strong><span>Entrega de material a tecnico</span></button>
            <button type="button" className="pe-quick-btn" onClick={() => setSubmenu("devoluciones")}><strong>Registrar devolucion</strong><span>Retorno y conciliacion de saldo</span></button>
            <button type="button" className="pe-quick-btn" onClick={() => setSubmenu("solicitudes")}><strong>Solicitudes</strong><span>Pendientes por aprobar o rechazar</span></button>
            <button type="button" className="pe-quick-btn" onClick={() => setSubmenu("entradas")}><strong>Registrar entrada</strong><span>Ingreso por compra o reposicion</span></button>
            <button type="button" className="pe-quick-btn" onClick={() => setSubmenu("kardex")}><strong>Ver kardex</strong><span>Trazabilidad y anulaciones</span></button>
          </div>
        </div>
      ) : null}

      {(submenu === "resumen" || submenu === "solicitudes") ? (
        <div className="pe-card">
          <h3>
            {esTecnicoSesion
              ? `Mis solicitudes (${solicitudesVisiblesOperativas.length})`
              : `Solicitudes de devolucion (${solicitudesPendientesOperativas.length} pendientes)`}
          </h3>
          {!solicitudesDisponibles ? (
            <p className="warn-text">No existe la tabla de solicitudes. Ejecuta la migracion SQL de devoluciones pendientes.</p>
          ) : null}
          {solicitudesVisiblesOperativas.length === 0 ? (
            <p className="empty">Sin solicitudes registradas.</p>
          ) : (
            <>
              {solicitudesVisiblesOperativas.slice(0, 80).map((s) => {
                const item = itemById[String(s.itemId || "")];
                const etiquetaItem = `${String(item?.codigo || "-")} - ${String(item?.nombre || "-")}`;
                const solicitudPendiente = s.estado === "PENDIENTE";
                const enProceso = procesandoSolicitudId === s.id;
                return (
                  <article key={s.id} className="pe-item">
                    <p className="pe-item-title">
                      {s.referenciaId || s.id} | {s.estado}
                    </p>
                    <p className="pe-item-meta">
                      Item: {etiquetaItem} | Cantidad: {num(s.cantidad, 0).toFixed(2)} {s.unidad}
                    </p>
                    <p className="pe-item-meta">
                      Salida origen: {s.salidaId} | Estado material: {s.estadoMaterial}
                    </p>
                    <p className="pe-item-meta">
                      Solicita: {s.actorSolicita || "-"} | Fecha: {fmtFecha(s.createdAt || "")}
                    </p>
                    <p className="pe-item-meta">Motivo: {s.motivo || "-"}</p>
                    {s.rechazoMotivo ? <p className="warn-text">Rechazo: {s.rechazoMotivo}</p> : null}
                    {s.evidencias?.length ? <p className="panel-meta">Evidencias: {s.evidencias.length}</p> : null}
                    {!esTecnicoSesion && solicitudPendiente ? (
                      <div className="pe-inline-actions">
                        <button
                          type="button"
                          className="primary-btn small"
                          onClick={() => void aprobarSolicitudDevolucion(s)}
                          disabled={Boolean(procesandoSolicitudId)}
                        >
                          {enProceso ? "Procesando..." : "Aprobar"}
                        </button>
                        <button
                          type="button"
                          className="secondary-btn small"
                          onClick={() => void rechazarSolicitudDevolucion(s)}
                          disabled={Boolean(procesandoSolicitudId)}
                        >
                          {enProceso ? "Procesando..." : "Rechazar"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </>
          )}
        </div>
      ) : null}

      {(submenu === "resumen" || submenu === "salidas") ? <div className="pe-card"><h3>Salidas con saldo pendiente ({pendientesOperativos.length})</h3>{pendientesOperativos.length ? <>{pendientesOperativos.slice(0, pendientesLimit).map((r) => <article key={r.salidaId} className="pe-item"><p className="pe-item-title">{r.codigo} - {r.nombre}</p><p className="pe-item-meta">Salida: {r.cantidadSalida.toFixed(2)} {r.unidad} | Saldo: {r.saldoPendiente.toFixed(2)}</p><div className="pe-inline-actions"><button type="button" className="secondary-btn small" onClick={() => void generarPdfMovimiento(r)} disabled={generandoPdfId === r.salidaId}>{generandoPdfId === r.salidaId ? "Generando..." : "PDF"}</button></div></article>)}{pendientesOperativos.length > pendientesLimit ? <button type="button" className="secondary-btn small" onClick={() => setPendientesLimit((v) => v + 80)}>Ver mas</button> : null}</> : <p className="empty">No hay salidas pendientes.</p>}</div> : null}

      {submenu === "salidas" ? (
        <div className="pe-card">
          <h3>Registrar salida</h3>
          <label className="pe-field">
            Buscar item
            <input value={formSalida.busquedaItem} onChange={(e) => setFormSalida((p) => ({ ...p, busquedaItem: e.target.value }))} />
          </label>
          <div className="pe-selector-box">
            {itemsSalidaFiltrados.slice(0, 20).map((it) => (
              <button key={it.id} type="button" className={formSalida.itemId === it.id ? "pe-sel active" : "pe-sel"} onClick={() => setFormSalida((p) => ({ ...p, itemId: it.id }))}>
                {it.codigo} - {it.nombre}
              </button>
            ))}
          </div>
          <label className="pe-field">
            Cantidad
            <input value={formSalida.cantidad} onChange={(e) => setFormSalida((p) => ({ ...p, cantidad: e.target.value }))} />
          </label>
          <label className="pe-field">
            Motivo
            <input value={formSalida.motivo} onChange={(e) => setFormSalida((p) => ({ ...p, motivo: e.target.value }))} />
          </label>
          <div className="pe-grid-2">
            <label className="pe-field">
              Tipo ref
              <input value={formSalida.referenciaTipo} onChange={(e) => setFormSalida((p) => ({ ...p, referenciaTipo: e.target.value }))} />
            </label>
            <label className="pe-field">
              ID ref
              <input value={formSalida.referenciaId} onChange={(e) => setFormSalida((p) => ({ ...p, referenciaId: e.target.value }))} placeholder={sugSalida} />
            </label>
          </div>
          <div className="pe-tabs pe-inline-tabs">
            <button type="button" className={formSalida.receptorModo === "lista" ? "pe-tab active" : "pe-tab"} onClick={() => setFormSalida((p) => ({ ...p, receptorModo: "lista", responsableRecepcion: "" }))}>
              Lista de tecnicos
            </button>
            <button type="button" className={formSalida.receptorModo === "manual" ? "pe-tab active" : "pe-tab"} onClick={() => setFormSalida((p) => ({ ...p, receptorModo: "manual", responsableRecepcion: "" }))}>
              Manual
            </button>
          </div>
          {formSalida.receptorModo === "manual" ? (
            <label className="pe-field">
              Receptor manual
              <input value={formSalida.responsableRecepcion} onChange={(e) => setFormSalida((p) => ({ ...p, responsableRecepcion: e.target.value }))} placeholder="Nombre del receptor" />
            </label>
          ) : (
            <label className="pe-field">
              Receptor
              <select value={formSalida.responsableRecepcion} onChange={(e) => setFormSalida((p) => ({ ...p, responsableRecepcion: e.target.value }))}>
                <option value="">Seleccionar tecnico</option>
                {tecnicosDisponibles.map((tecnico) => (
                  <option key={tecnico} value={tecnico}>
                    {tecnico}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="pe-action-row">
            <label className="secondary-btn small pe-file-btn">
              Tomar foto
              <input type="file" accept="image/*" capture="environment" onChange={(e) => addPickedFiles(e, setSalidaFiles)} />
            </label>
            <label className="secondary-btn small pe-file-btn">
              Subir foto
              <input type="file" accept="image/*" multiple onChange={(e) => addPickedFiles(e, setSalidaFiles)} />
            </label>
          </div>
          <div className="pe-file-list">
            {salidaFiles.map((f, i) => (
              <button key={`${f.name}-${i}`} type="button" className="pe-file-chip" onClick={() => setSalidaFiles((p) => p.filter((_, x) => x !== i))}>
                {f.name}
              </button>
            ))}
          </div>
          <div className="pe-action-row">
            <button type="button" className="secondary-btn" onClick={limpiarSalida} disabled={guardandoSalida}>
              Limpiar
            </button>
            <button type="button" className="primary-btn" onClick={() => void registrarSalida()} disabled={guardandoSalida}>
              {guardandoSalida ? "Guardando..." : "Registrar salida"}
            </button>
          </div>
        </div>
      ) : null}

      {submenu === "devoluciones" ? <div className="pe-card"><h3>{puedeAprobarDevolucion ? "Registrar devolucion" : "Solicitar devolucion"}</h3><div className="pe-selector-box">{pendientesOperativos.slice(0, 60).map((p) => <button key={p.salidaId} type="button" className={formDevolucion.salidaId === p.salidaId ? "pe-sel active" : "pe-sel"} onClick={() => setFormDevolucion((prev) => ({ ...prev, salidaId: p.salidaId, responsableEntrega: String(p.responsableRecepcion || "") }))}>{p.codigo} - {p.nombre} | Saldo {num(p.saldoPendiente, 0).toFixed(2)} {p.unidad}</button>)}</div>{salidaSel ? <p className="pe-strong">Seleccionado: {salidaSel.codigo} | Saldo: {num(salidaSel.saldoPendiente, 0).toFixed(2)} {salidaSel.unidad}</p> : null}<label className="pe-field">Cantidad<input value={formDevolucion.cantidad} onChange={(e) => setFormDevolucion((p) => ({ ...p, cantidad: e.target.value }))} /></label><div className="pe-tabs pe-inline-tabs"><button type="button" className={String(formDevolucion.estadoMaterial || "").toUpperCase() === "BUENO" ? "pe-tab active" : "pe-tab"} onClick={() => setFormDevolucion((p) => ({ ...p, estadoMaterial: "BUENO" }))}>BUENO</button><button type="button" className={["DANIADO", "DANADO", "DAÑADO"].includes(String(formDevolucion.estadoMaterial || "").toUpperCase()) ? "pe-tab active" : "pe-tab"} onClick={() => setFormDevolucion((p) => ({ ...p, estadoMaterial: "DANIADO" }))}>DAÑADO</button></div><label className="pe-field">Motivo<input value={formDevolucion.motivo} onChange={(e) => setFormDevolucion((p) => ({ ...p, motivo: e.target.value }))} /></label><div className="pe-grid-2"><label className="pe-field">Tipo ref<input value={formDevolucion.referenciaTipo} onChange={(e) => setFormDevolucion((p) => ({ ...p, referenciaTipo: e.target.value }))} /></label><label className="pe-field">ID ref<input value={formDevolucion.referenciaId} onChange={(e) => { setAutoReferenciaDevolucion(false); setFormDevolucion((p) => ({ ...p, referenciaId: e.target.value })); }} placeholder={sugDev} /></label></div><label className="pe-field">Tecnico que devuelve<input value={formDevolucion.responsableEntrega} onChange={(e) => setFormDevolucion((p) => ({ ...p, responsableEntrega: e.target.value }))} /></label><div className="pe-action-row"><label className="secondary-btn small pe-file-btn">Tomar foto<input type="file" accept="image/*" capture="environment" onChange={(e) => addPickedFiles(e, setDevolucionFiles)} /></label><label className="secondary-btn small pe-file-btn">Subir foto<input type="file" accept="image/*" multiple onChange={(e) => addPickedFiles(e, setDevolucionFiles)} /></label></div><div className="pe-file-list">{devolucionFiles.map((f, i) => <button key={`${f.name}-${i}`} type="button" className="pe-file-chip" onClick={() => setDevolucionFiles((p) => p.filter((_, x) => x !== i))}>{f.name}</button>)}</div><div className="pe-action-row"><button type="button" className="secondary-btn" onClick={limpiarDev} disabled={guardandoDevolucion}>Limpiar</button><button type="button" className="primary-btn" onClick={() => void registrarDevolucion()} disabled={guardandoDevolucion}>{guardandoDevolucion ? "Guardando..." : (puedeAprobarDevolucion ? "Registrar devolucion" : "Enviar solicitud") }</button></div></div> : null}

      {(submenu === "resumen" || submenu === "kardex") ? (
        <div className="pe-card">
          <h3>Kardex ({movsOperativos.length})</h3>
          {movsOperativos.length ? (
            <>
              {movsOperativos.slice(0, kardexLimit).map((m) => {
                const kardexItem = itemById[String(m.itemId || "")] || {};
                const kardexFoto = String(kardexItem?.fotoReferencia || "").trim();
                return (
                  <article key={m.id} className="pe-item">
                    <div className="pe-item-top">
                      <div className="pe-item-body">
                        <p className="pe-item-title">{m.fecha} | {m.tipo}</p>
                        <p className="pe-item-meta">{String(kardexItem?.codigo || "-")} - {String(kardexItem?.nombre || "-")}</p>
                        <p className="pe-item-meta">Cantidad: {m.cantidad.toFixed(2)} {m.unidad}</p>
                        <p className="pe-item-meta">Ref: {m.referenciaTipo || "-"} {m.referenciaId || "-"}</p>
                      </div>
                      {kardexFoto ? <img src={kardexFoto} alt={String(kardexItem?.codigo || "item")} className="pe-item-thumb" /> : null}
                    </div>
                    <div className="pe-inline-actions">
                      <button type="button" className="secondary-btn small" onClick={() => void generarPdfMovimiento(m)} disabled={generandoPdfId === m.id}>
                        {generandoPdfId === m.id ? "Generando..." : "PDF"}
                      </button>
                      <button type="button" className="secondary-btn small" onClick={() => void anularMovimiento(m)} disabled={anulandoMovId === m.id || generandoPdfId === m.id}>
                        {anulandoMovId === m.id ? "Anulando..." : "Anular"}
                      </button>
                    </div>
                  </article>
                );
              })}
              {movsOperativos.length > kardexLimit ? (
                <button type="button" className="secondary-btn small" onClick={() => setKardexLimit((v) => v + 120)}>
                  Ver mas
                </button>
              ) : null}
            </>
          ) : (
            <p className="empty">Sin movimientos.</p>
          )}
        </div>
      ) : null}

      {submenu === "entradas" ? (
        <div className="pe-card">
          <h3>Registrar ingreso</h3>
          <label className="pe-field">
            Buscar item
            <input value={formEntrada.busquedaItem} onChange={(e) => setFormEntrada((p) => ({ ...p, busquedaItem: e.target.value }))} />
          </label>
          <div className="pe-selector-box">
            {itemsEntradaFiltrados.slice(0, 20).map((it) => (
              <button key={it.id} type="button" className={formEntrada.itemId === it.id ? "pe-sel active" : "pe-sel"} onClick={() => setFormEntrada((p) => ({ ...p, itemId: it.id }))}>
                {it.codigo} - {it.nombre}
              </button>
            ))}
          </div>
          <div className="pe-grid-2">
            <label className="pe-field">
              Cantidad
              <input value={formEntrada.cantidad} onChange={(e) => setFormEntrada((p) => ({ ...p, cantidad: e.target.value }))} />
            </label>
            <label className="pe-field">
              Costo unitario
              <input value={formEntrada.costoUnitario} onChange={(e) => setFormEntrada((p) => ({ ...p, costoUnitario: e.target.value }))} />
            </label>
          </div>
          <div className="pe-tabs pe-inline-tabs">
            <button type="button" className={String(formEntrada.estadoMaterial || "").toUpperCase() === "BUENO" ? "pe-tab active" : "pe-tab"} onClick={() => setFormEntrada((p) => ({ ...p, estadoMaterial: "BUENO" }))}>
              BUENO
            </button>
            <button type="button" className={["DANIADO", "DANADO", "DAÑADO"].includes(String(formEntrada.estadoMaterial || "").toUpperCase()) ? "pe-tab active" : "pe-tab"} onClick={() => setFormEntrada((p) => ({ ...p, estadoMaterial: "DANIADO" }))}>
              DAÑADO
            </button>
          </div>
          <label className="pe-field">
            Motivo
            <input value={formEntrada.motivo} onChange={(e) => setFormEntrada((p) => ({ ...p, motivo: e.target.value }))} />
          </label>
          <div className="pe-grid-2">
            <label className="pe-field">
              Tipo ref
              <input value={formEntrada.referenciaTipo} onChange={(e) => setFormEntrada((p) => ({ ...p, referenciaTipo: e.target.value }))} />
            </label>
            <label className="pe-field">
              ID ref
              <input value={formEntrada.referenciaId} onChange={(e) => setFormEntrada((p) => ({ ...p, referenciaId: e.target.value }))} placeholder={sugEntrada} />
            </label>
          </div>
          <label className="pe-field">
            Responsable recepcion
            <input value={formEntrada.responsableRecepcion} onChange={(e) => setFormEntrada((p) => ({ ...p, responsableRecepcion: e.target.value }))} placeholder="Quien recibe el ingreso" />
          </label>
          <div className="pe-action-row">
            <label className="secondary-btn small pe-file-btn">
              Tomar foto
              <input type="file" accept="image/*" capture="environment" onChange={(e) => addPickedFiles(e, setEntradaFiles)} />
            </label>
            <label className="secondary-btn small pe-file-btn">
              Subir foto
              <input type="file" accept="image/*" multiple onChange={(e) => addPickedFiles(e, setEntradaFiles)} />
            </label>
          </div>
          <div className="pe-file-list">
            {entradaFiles.map((f, i) => (
              <button key={`${f.name}-${i}`} type="button" className="pe-file-chip" onClick={() => setEntradaFiles((p) => p.filter((_, x) => x !== i))}>
                {f.name}
              </button>
            ))}
          </div>
          <div className="pe-action-row">
            <button type="button" className="secondary-btn" onClick={limpiarEntrada} disabled={guardandoEntrada}>
              Limpiar
            </button>
            <button type="button" className="primary-btn" onClick={() => void registrarEntrada()} disabled={guardandoEntrada}>
              {guardandoEntrada ? "Guardando..." : "Registrar ingreso"}
            </button>
          </div>
        </div>
      ) : null}

      {submenu === "nuevo" ? <div className="pe-card"><h3>{editandoId ? "Editar item" : "Nuevo item"}</h3><button type="button" className={autoCodigo ? "pe-badge active" : "pe-badge"} onClick={() => setAutoCodigo((v) => !v)}>Codigo automatico: {autoCodigo ? "ON" : "OFF"}</button><label className="pe-field">Codigo<input value={autoCodigo && !editandoId ? nextCode(items, formItem.categoria) : formItem.codigo} onChange={(e) => setFormItem((p) => ({ ...p, codigo: e.target.value }))} disabled={autoCodigo && !editandoId} /></label><label className="pe-field">Nombre<input value={formItem.nombre} onChange={(e) => setFormItem((p) => ({ ...p, nombre: e.target.value }))} /></label><div className="pe-tabs pe-inline-tabs">{CATEGORIAS.map((c) => <button key={c.label} type="button" className={formItem.categoria === c.label ? "pe-tab active" : "pe-tab"} onClick={() => setFormItem((p) => ({ ...p, categoria: c.label, codigo: autoCodigo && !editandoId ? nextCode(items, c.label) : p.codigo }))}>{c.label}</button>)}</div><div className="pe-tabs pe-inline-tabs">{UNIDADES.map((u) => <button key={u} type="button" className={formItem.unidadBase === u ? "pe-tab active" : "pe-tab"} onClick={() => setFormItem((p) => ({ ...p, unidadBase: u }))}>{u}</button>)}</div><div className="pe-grid-2"><label className="pe-field">Stock minimo<input value={String(formItem.stockMinimo || "")} onChange={(e) => setFormItem((p) => ({ ...p, stockMinimo: e.target.value }))} /></label><label className="pe-field">Costo ref<input value={String(formItem.costoUnitarioRef || "")} onChange={(e) => setFormItem((p) => ({ ...p, costoUnitarioRef: e.target.value }))} /></label></div><label className="pe-field">Ubicacion<input value={formItem.ubicacion} onChange={(e) => setFormItem((p) => ({ ...p, ubicacion: e.target.value }))} /></label><div className="pe-action-row"><label className="secondary-btn small pe-file-btn">Tomar foto<input type="file" accept="image/*" capture="environment" onChange={pickItemPhoto} /></label><label className="secondary-btn small pe-file-btn">Subir foto<input type="file" accept="image/*" onChange={pickItemPhoto} /></label></div>{formItemFotoFile ? <p className="panel-meta">Foto seleccionada: {formItemFotoFile.name}</p> : null}{formItemFotoPreview || formItem.fotoReferencia ? <div className="pe-image-preview"><img src={formItemFotoPreview || formItem.fotoReferencia} alt="item-referencia" /><button type="button" className="secondary-btn small" onClick={() => { setFormItemFotoFile(null); if (formItemFotoPreview && formItemFotoPreview.startsWith("blob:")) URL.revokeObjectURL(formItemFotoPreview); setFormItemFotoPreview(""); setFormItem((p) => ({ ...p, fotoReferencia: "" })); }}>Quitar</button></div> : null}{!editandoId ? <label className="pe-field">Ingreso inicial<input value={String(formItem.ingresoInicial || "")} onChange={(e) => setFormItem((p) => ({ ...p, ingresoInicial: e.target.value }))} /></label> : null}<div className="pe-action-row"><button type="button" className="secondary-btn" onClick={limpiarItem} disabled={guardandoItem}>{editandoId ? "Cancelar" : "Limpiar"}</button><button type="button" className="primary-btn" onClick={() => void guardarItem()} disabled={guardandoItem}>{guardandoItem ? "Guardando..." : editandoId ? "Guardar cambios" : "Guardar item"}</button></div></div> : null}

      {submenu === "items" ? <div className="pe-card"><h3>Items ({itemsFiltrados.length})</h3><label className="pe-field">Buscar<input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label><div className="pe-tabs pe-inline-tabs"><button type="button" className={filtroCat === "TODAS" ? "pe-tab active" : "pe-tab"} onClick={() => setFiltroCat("TODAS")}>Todas</button>{cats.map((c) => <button key={c} type="button" className={filtroCat === c ? "pe-tab active" : "pe-tab"} onClick={() => setFiltroCat(c)}>{c}</button>)}</div><div className="pe-action-row"><button type="button" className="secondary-btn" onClick={() => void generarPdfItems()} disabled={generandoPdfItems}>{generandoPdfItems ? "Generando PDF..." : `PDF de items filtrados (${itemsFiltrados.length})`}</button></div>{itemsFiltrados.map((it) => { const sv = stockVisual(it.stockActual, it.stockMinimo); return <article key={it.id} className="pe-item"><div className="pe-item-top"><div className="pe-item-body"><p className="pe-item-title">{it.codigo} - {it.nombre}</p><p className="pe-item-meta">Categoria: {it.categoria} | Unidad: {it.unidadBase}</p><p className="pe-item-meta">Almacen: {it.almacenNombre || "-"}</p><p className="pe-item-meta">Stock: {it.stockActual.toFixed(2)} | Min: {it.stockMinimo.toFixed(2)}</p><div className="pe-stock-track"><div className="pe-stock-fill" style={{ width: `${sv.pct}%`, backgroundColor: sv.fill }} /></div><p className="pe-stock-label" style={{ color: sv.fill }}>{sv.label}</p></div>{String(it.fotoReferencia || "").trim() ? <img src={it.fotoReferencia} alt={it.codigo} className="pe-item-thumb" /> : null}</div><div className="pe-inline-actions"><button type="button" className="secondary-btn small" onClick={() => { setEditandoId(it.id); setAutoCodigo(false); setFormItem({ codigo: it.codigo, nombre: it.nombre, categoria: it.categoria, unidadBase: it.unidadBase, stockMinimo: String(it.stockMinimo), costoUnitarioRef: String(it.costoUnitarioRef), ubicacion: it.ubicacion, fotoReferencia: String(it.fotoReferencia || ""), ingresoInicial: "" }); if (it.almacenId) setAlmacenSeleccionadoId(String(it.almacenId)); setFormItemFotoFile(null); if (formItemFotoPreview && formItemFotoPreview.startsWith("blob:")) URL.revokeObjectURL(formItemFotoPreview); setFormItemFotoPreview(String(it.fotoReferencia || "")); setSubmenu("nuevo"); }}>Editar</button><button type="button" className="secondary-btn small pe-btn-danger" onClick={() => void eliminarItem(it)}>Eliminar</button></div></article>; })}{!itemsFiltrados.length ? <p className="empty">Sin items para el filtro actual.</p> : null}</div> : null}
    </section>
  );
}


