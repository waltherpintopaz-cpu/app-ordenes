import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa varchar NOT NULL UNIQUE,
  habilitado boolean DEFAULT false,
  base_url text DEFAULT '',
  api_key text DEFAULT '',
  instance_name text DEFAULT '',
  template_instalacion text DEFAULT '',
  template_incidencia text DEFAULT '',
  template_recuperacion text DEFAULT '',
  template_liquidacion text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='whatsapp_config' AND policyname='allow_auth') THEN
    ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
    CREATE POLICY allow_auth ON whatsapp_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY allow_anon ON whatsapp_config FOR SELECT TO anon USING (true);
  END IF;
END $$;
INSERT INTO whatsapp_config (empresa, habilitado, template_instalacion, template_incidencia, template_recuperacion, template_liquidacion)
VALUES
  ('Americanet', false,
   'Estimado/a {nombre}, su orden de INSTALACIÓN #{codigo} ha sido generada. El técnico {tecnico} coordinará la visita. — {empresa}',
   'Estimado/a {nombre}, su reporte #{codigo} fue registrado. Pronto un técnico lo atenderá. — {empresa}',
   'Estimado/a {nombre}, se generó la orden de recuperación #{codigo}. Coordinaremos con usted. — {empresa}',
   'Estimado/a {nombre}, su orden #{codigo} fue completada. ¡Gracias por preferir {empresa}!'),
  ('DIM', false,
   'Estimado/a {nombre}, su orden de INSTALACIÓN #{codigo} ha sido generada. El técnico {tecnico} coordinará la visita. — {empresa}',
   'Estimado/a {nombre}, su reporte #{codigo} fue registrado. Pronto un técnico lo atenderá. — {empresa}',
   'Estimado/a {nombre}, se generó la orden de recuperación #{codigo}. Coordinaremos con usted. — {empresa}',
   'Estimado/a {nombre}, su orden #{codigo} fue completada. ¡Gracias por preferir {empresa}!')
ON CONFLICT (empresa) DO NOTHING;
`;

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function applyTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] || "");
}

function normalizePhone(p: string) {
  p = p.replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (/^9\d{8}$/.test(p)) p = "51" + p;
  return p;
}

async function setupTable(): Promise<{ ok: boolean; message: string }> {
  // Use Supabase pg endpoint via service role
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (dbUrl) {
    try {
      // @ts-ignore - dynamic import
      const { Pool } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
      const pool = new Pool(dbUrl, 1, true);
      const conn = await pool.connect();
      try {
        await conn.queryObject(CREATE_SQL);
        return { ok: true, message: "Tabla creada exitosamente" };
      } finally {
        conn.release();
        await pool.end();
      }
    } catch (e) {
      return { ok: false, message: "Error pg: " + String(e) };
    }
  }

  // Fallback: use Management API via fetch
  const pat = Deno.env.get("SUPABASE_MGMT_TOKEN");
  if (pat) {
    const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1];
    const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { Authorization: "Bearer " + pat, "Content-Type": "application/json" },
      body: JSON.stringify({ query: CREATE_SQL }),
    });
    if (r.ok) return { ok: true, message: "Tabla creada exitosamente" };
    return { ok: false, message: "Management API error: " + r.status };
  }

  return { ok: false, message: "No hay acceso al motor de base de datos. Ejecuta el SQL manualmente en el SQL Editor de Supabase." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, empresa, numero, tipo, tipo_orden, variables = {}, inline_base_url, inline_api_key, inline_instance } = body;

    // ── SETUP ACTION ──────────────────────────────────────────────
    if (action === "setup") {
      const result = await setupTable();
      return ok(result);
    }

    // ── SEND ACTION ───────────────────────────────────────────────
    if (!empresa || !numero) return ok({ ok: false, error: "empresa y numero son requeridos" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let config: Record<string, unknown> | null = null;

    try {
      const { data, error } = await supabase.from("whatsapp_config").select("*").eq("empresa", empresa).single();
      if (!error && data) config = data;
    } catch { /* tabla no existe */ }

    // Inline fallback para prueba antes de crear tabla
    if (!config && inline_base_url && inline_api_key && inline_instance) {
      config = {
        habilitado: true,
        base_url: inline_base_url,
        api_key: inline_api_key,
        instance_name: inline_instance,
        template_instalacion: "Estimado/a {nombre}, su orden de INSTALACIÓN #{codigo} fue generada. Técnico: {tecnico}. — {empresa}",
        template_incidencia: "Estimado/a {nombre}, su reporte #{codigo} fue registrado. — {empresa}",
        template_recuperacion: "Estimado/a {nombre}, su orden de recuperación #{codigo} fue generada. — {empresa}",
        template_liquidacion: "Estimado/a {nombre}, su orden #{codigo} fue completada. ¡Gracias por preferir {empresa}!",
      };
    }

    if (!config) return ok({ ok: false, error: "Tabla whatsapp_config no existe. Usa action=setup primero." });
    if (!config.habilitado) return ok({ ok: false, skipped: true, reason: "WhatsApp deshabilitado para " + empresa });

    const baseUrl = String(config.base_url || "").trim();
    const apiKey  = String(config.api_key || "").trim();
    const instance = String(config.instance_name || "").trim();
    if (!baseUrl || !apiKey || !instance) return ok({ ok: false, error: "Credenciales incompletas" });

    let tpl = "";
    const t = String(tipo_orden || "").toUpperCase();
    if (tipo === "liquidacion")       tpl = String(config.template_liquidacion || "");
    else if (t.includes("INSTALAC"))  tpl = String(config.template_instalacion || "");
    else if (t.includes("INCIDEN"))   tpl = String(config.template_incidencia || "");
    else if (t.includes("RECUP"))     tpl = String(config.template_recuperacion || "");
    else                              tpl = String(config.template_instalacion || "");

    if (!tpl.trim()) return ok({ ok: false, skipped: true, reason: "Template vacío" });

    const msg = applyTemplate(tpl, {
      nombre: String(variables.nombre || ""),
      codigo: String(variables.codigo || ""),
      empresa: String(variables.empresa_nombre || empresa),
      tecnico: String(variables.tecnico || ""),
      fecha: String(variables.fecha || ""),
      direccion: String(variables.direccion || ""),
    });
    const phone = normalizePhone(String(numero));

    const evoRes = await fetch(`${baseUrl.replace(/\/$/, "")}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: phone, text: msg }),
    });

    const evoText = await evoRes.text();
    let evoData: unknown = {};
    try { evoData = JSON.parse(evoText); } catch { evoData = { raw: evoText }; }

    if (!evoRes.ok) return ok({ ok: false, error: `Evolution API ${evoRes.status}: ${evoText}` });
    return ok({ ok: true, success: true, phone, message: msg, evo: evoData });

  } catch (err) {
    return ok({ ok: false, error: String(err) });
  }
});
