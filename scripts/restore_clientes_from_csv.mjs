import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://vgwbqbzpjlbkmxtfghdm.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_sC_66p4UKHUudDVyWyNcyA_bkrl_J2_";

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const SUPABASE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_ANON_KEY
).trim();

const CSV_FILE =
  process.env.CSV_CLIENTES_FILE || path.resolve(process.cwd(), "..", "clientes_import_limpio.csv");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => String(v || "").trim());
}

function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cols[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function norm(v) {
  return String(v || "").trim();
}

function mapRowToCliente(r) {
  const dni = norm(r.cedula);
  const nombre = norm(r.nombre);
  if (!dni || !nombre) return null;
  const fechaInstRaw = norm(r.fecha_instalacion);
  const fechaInst = fechaInstRaw ? new Date(fechaInstRaw) : null;
  return {
    codigo_cliente: dni,
    dni,
    nombre,
    direccion: norm(r.direccion_principal),
    celular: norm(r.movil),
    email: norm(r.correo),
    contacto: "",
    empresa: norm(r.empresa) || "Americanet",
    velocidad: "",
    precio_plan: null,
    nodo: norm(r.nodo),
    usuario_nodo: norm(r.user_pppoe),
    password_usuario: "",
    ubicacion: norm(r.coordenadas_ubicacion),
    descripcion: "",
    foto_fachada: norm(r.foto_fachada),
    codigo_etiqueta: norm(r.cod_etiqueta),
    sn_onu: norm(r.sn),
    tecnico: "",
    autor_orden: "",
    fecha_instalo: fechaInst && !Number.isNaN(fechaInst.getTime()) ? fechaInst.toISOString() : null,
    ultima_actualizacion: new Date().toISOString(),
  };
}

async function run() {
  const raw = await fs.readFile(CSV_FILE, "utf8");
  const rows = parseCsv(raw);
  const payload = rows.map(mapRowToCliente).filter(Boolean);
  if (payload.length === 0) {
    throw new Error("No se encontraron clientes validos en el CSV.");
  }

  console.log(`Restaurando clientes desde: ${CSV_FILE}`);
  console.log(`Filas validas: ${payload.length}`);

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    let res = await supabase.from("clientes").upsert(chunk, { onConflict: "dni" });
    if (res.error && String(res.error.message || "").includes("no unique or exclusion constraint")) {
      res = await supabase.from("clientes").insert(chunk);
    }
    if (res.error) {
      fail += chunk.length;
      console.log(`ERROR chunk ${i}-${i + chunk.length - 1}: ${res.error.message}`);
    } else {
      ok += chunk.length;
      console.log(`OK chunk ${i}-${i + chunk.length - 1}`);
    }
  }

  const countRes = await supabase.from("clientes").select("*", { count: "exact", head: true });
  console.log(`Final => procesados_ok=${ok}, error_estimado=${fail}, clientes_en_tabla=${countRes.count || 0}`);
}

run().catch((e) => {
  console.error("Fallo restaurando clientes:", e?.message || e);
  process.exit(1);
});
