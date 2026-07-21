import { supabase, isSupabaseConfigured } from "../supabaseClient.js";

/** Sube el PDF del contrato al bucket "liquidaciones" (el mismo que usan las fotos) y devuelve la URL pública. */
export async function subirContratoPdf(blob, filename) {
  if (!isSupabaseConfigured) throw new Error("Supabase no configurado.");
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const path = `contratos/${ymd}/${Date.now()}_${filename}`;
  const { error } = await supabase.storage.from("liquidaciones").upload(path, blob, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("liquidaciones").getPublicUrl(path);
  const url = String(data?.publicUrl || "").trim();
  if (!url) throw new Error("No se pudo obtener la URL del contrato.");
  return url;
}

function normalizarTelefonoPe(telefono) {
  let phone = String(telefono || "").replace(/[\s\-()]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (/^9\d{8}$/.test(phone)) phone = "51" + phone;
  return phone;
}

/**
 * Envia el contrato (documento PDF) por WhatsApp usando la misma configuracion
 * (whatsapp_config / Evolution API) que ya usan las notificaciones de texto,
 * pero contra el endpoint de medios en vez del de texto.
 */
export async function enviarContratoWhatsapp({ empresa, celular, urlPdf, filename, caption }) {
  if (!isSupabaseConfigured) return { ok: false, msg: "Supabase no configurado." };
  const phone = normalizarTelefonoPe(celular);
  if (!phone) return { ok: false, msg: "El cliente no tiene celular registrado." };

  const { data: cfg } = await supabase
    .from("whatsapp_config")
    .select("base_url,api_key,instance_name,habilitado")
    .eq("empresa", empresa)
    .maybeSingle();
  if (!cfg?.habilitado || !cfg?.base_url || !cfg?.api_key || !cfg?.instance_name) {
    return { ok: false, msg: "WhatsApp no está configurado/habilitado para esta empresa." };
  }

  const url = `${cfg.base_url.replace(/\/$/, "")}/message/sendMedia/${cfg.instance_name}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.api_key },
      body: JSON.stringify({
        number: phone,
        mediatype: "document",
        mimetype: "application/pdf",
        media: urlPdf,
        fileName: filename,
        caption: caption || "",
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, msg: `Error ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e?.message || "Error de red enviando el contrato." };
  }
}
