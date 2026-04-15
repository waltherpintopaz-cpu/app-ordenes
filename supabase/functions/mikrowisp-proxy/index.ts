import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MKW_URL   = "https://americanet.club/api/v1/GetInvoices";
const MKW_TOKEN = "Smx2SVdkbUZIdjlCUlkxdFo1cUNMQT09";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { cedula } = await req.json();
    if (!cedula) return new Response(JSON.stringify({ error: "cedula requerida" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const res = await fetch(MKW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: MKW_TOKEN, cedula: String(cedula).trim() }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
