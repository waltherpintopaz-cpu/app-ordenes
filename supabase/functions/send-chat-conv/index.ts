// Edge Function "send-chat-conv" (Supabase de AMERICANET).
//
// Push de CHAT en estilo conversacion (como WhatsApp): una notificacion por
// chat que se actualiza con cada mensaje, con Responder y Marcar como leido.
// La dibuja la propia app (android/.../chatnotif/ChatNotif.kt), por eso se
// manda como mensaje FCM SOLO de datos (sin bloque "notification").
//
// Solo la llama public.chat_push_enviar (SQL 20261112_chat_push_conversacion.sql)
// cuando el destinatario tiene token_type = 'fcm_conv' (APK nueva). Las APK
// viejas siguen por "send-push-notification", que no se toca.
//
// Usa los mismos secretos que send-push-notification: FIREBASE_SERVICE_ACCOUNT
// (y SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, que Supabase pone solos).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIREBASE_SA = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

function b64url(data: string | object): string {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

let tokenCache: { token: string; exp: number } | null = null;
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;
  const header = b64url({ alg: "RS256", typ: "JWT" });
  const payload = b64url({
    iss: FIREBASE_SA.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${payload}`;
  const key = await importPrivateKey(FIREBASE_SA.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sigB64}` }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  tokenCache = { token: data.access_token, exp: now + 3600 };
  return data.access_token;
}

const cors = { "Access-Control-Allow-Origin": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...cors, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }
  try {
    const { tecnico_nombre, title, body, data, android } = await req.json() as {
      tecnico_nombre: string;
      title?: string;
      body?: string;
      data?: Record<string, unknown>;
      android?: { channelId?: string; icon?: string; color?: string } | null;
    };
    if (!tecnico_nombre || !data?.chat_key) {
      return Response.json({ error: "Faltan parámetros: tecnico_nombre, data.chat_key" }, { status: 400, headers: cors });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("token")
      .ilike("username", tecnico_nombre.trim())
      .eq("token_type", "fcm_conv");
    if (error) throw error;
    if (!tokens?.length) return Response.json({ ok: false, message: "Sin tokens fcm_conv para ese usuario" }, { headers: cors });

    // FCM exige que todos los valores de "data" sean strings.
    const datos: Record<string, string> = {};
    for (const [k, v] of Object.entries({
      ...data,
      estilo: "conv",
      title: title ?? "",
      body: body ?? "",
      canal: android?.channelId || "chat_burbuja",
      icono: android?.icon || "",
      color: android?.color || "",
    })) datos[k] = v == null ? "" : String(v);

    const accessToken = await getAccessToken();
    const results = await Promise.all(tokens.map(async (t) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FIREBASE_SA.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: t.token, data: datos, android: { priority: "high" } } }),
      });
      return { ok: res.ok, result: await res.json() };
    }));
    return Response.json({ ok: true, sent: results.filter((r) => r.ok).length, total: tokens.length, results }, { headers: cors });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500, headers: cors });
  }
});
