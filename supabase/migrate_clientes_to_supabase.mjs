import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT_FILE =
  process.env.INPUT_FILE || path.join(process.cwd(), "supabase", "clientes_export.json");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan variables SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toTimestamptz = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const norm = (v) => (v == null ? "" : String(v));

const mapCliente = (c) => ({
  codigo_cliente: norm(c.codigoCliente),
  dni: norm(c.dni).trim(),
  nombre: norm(c.nombre).trim(),
  direccion: norm(c.direccion),
  celular: norm(c.celular),
  email: norm(c.email),
  contacto: norm(c.contacto),
  empresa: norm(c.empresa),
  velocidad: norm(c.velocidad),
  precio_plan: toNumber(c.precioPlan, 0),
  nodo: norm(c.nodo),
  usuario_nodo: norm(c.usuarioNodo),
  password_usuario: norm(c.passwordUsuario),
  ubicacion: norm(c.ubicacion),
  descripcion: norm(c.descripcion),
  foto_fachada: norm(c.fotoFachada),
  codigo_etiqueta: norm(c.codigoEtiqueta),
  sn_onu: norm(c.snOnu),
  tecnico: norm(c.tecnico),
  autor_orden: norm(c.autorOrden),
  fecha_registro: toTimestamptz(c.fechaRegistro),
  ultima_actualizacion: toTimestamptz(c.ultimaActualizacion),
});

const mapHistorial = (clienteId, h) => ({
  cliente_id: clienteId,
  orden_original_id: Number.isFinite(Number(h.ordenOriginalId))
    ? Number(h.ordenOriginalId)
    : null,
  codigo_orden: norm(h.codigoOrden),
  fecha_liquidacion: toTimestamptz(h.fechaLiquidacion),
  tipo_actuacion: norm(h.tipoActuacion),
  resultado_final: norm(h.resultadoFinal),
  tecnico: norm(h.tecnico),
  observacion_final: norm(h.observacionFinal),
  codigo_etiqueta: norm(h.codigoEtiqueta),
  sn_onu: norm(h.snOnu),
});

const mapEquipo = (clienteId, e) => ({
  cliente_id: clienteId,
  orden_id: Number.isFinite(Number(e.ordenId)) ? Number(e.ordenId) : null,
  codigo_orden: norm(e.codigoOrden),
  fecha: toTimestamptz(e.fecha),
  tipo: norm(e.tipo),
  codigo: norm(e.codigo),
  serial: norm(e.serial),
  accion: norm(e.accion),
  marca: norm(e.marca),
  modelo: norm(e.modelo),
  foto_referencia: norm(e.fotoReferencia),
  precio_unitario: toNumber(e.precioUnitario, 0),
  costo_total: toNumber(e.costoTotal, 0),
  empresa: norm(e.empresa),
});

const mapFoto = (clienteId, url) => ({
  cliente_id: clienteId,
  foto_url: norm(url),
});

const readInput = async () => {
  const raw = await fs.readFile(INPUT_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.clientes)) return parsed.clientes;
  throw new Error("Archivo de entrada inválido: se esperaba array o { clientes: [] }");
};

const replaceChildren = async (clienteId, cliente) => {
  const fotos = Array.isArray(cliente.fotosLiquidacion) ? cliente.fotosLiquidacion : [];
  const historial = Array.isArray(cliente.historialInstalaciones)
    ? cliente.historialInstalaciones
    : [];
  const equipos = Array.isArray(cliente.equiposHistorial) ? cliente.equiposHistorial : [];

  await supabase.from("cliente_fotos_liquidacion").delete().eq("cliente_id", clienteId);
  await supabase
    .from("cliente_historial_instalaciones")
    .delete()
    .eq("cliente_id", clienteId);
  await supabase.from("cliente_equipos_historial").delete().eq("cliente_id", clienteId);

  if (fotos.length > 0) {
    const rows = fotos.filter(Boolean).map((f) => mapFoto(clienteId, f));
    const { error } = await supabase.from("cliente_fotos_liquidacion").insert(rows);
    if (error) throw error;
  }

  if (historial.length > 0) {
    const rows = historial.map((h) => mapHistorial(clienteId, h));
    const { error } = await supabase.from("cliente_historial_instalaciones").insert(rows);
    if (error) throw error;
  }

  if (equipos.length > 0) {
    const rows = equipos.map((e) => mapEquipo(clienteId, e));
    const { error } = await supabase.from("cliente_equipos_historial").insert(rows);
    if (error) throw error;
  }
};

const run = async () => {
  const clientes = await readInput();
  console.log(`Migrando ${clientes.length} clientes desde: ${INPUT_FILE}`);

  let ok = 0;
  let fail = 0;

  for (const cliente of clientes) {
    const dni = norm(cliente.dni).trim();
    const nombre = norm(cliente.nombre).trim();
    if (!dni || !nombre) {
      fail += 1;
      console.warn(`Saltado por datos incompletos: dni="${dni}" nombre="${nombre}"`);
      continue;
    }

    try {
      const row = mapCliente(cliente);
      const { data, error } = await supabase
        .from("clientes")
        .upsert(row, { onConflict: "dni" })
        .select("id")
        .single();
      if (error) throw error;

      await replaceChildren(data.id, cliente);
      ok += 1;
      console.log(`OK cliente DNI ${dni} (id ${data.id})`);
    } catch (err) {
      fail += 1;
      console.error(`ERROR cliente DNI ${dni}:`, err.message || err);
    }
  }

  console.log(`Finalizado. OK=${ok}, ERROR=${fail}`);
};

run().catch((err) => {
  console.error("Fallo general de migración:", err);
  process.exit(1);
});

