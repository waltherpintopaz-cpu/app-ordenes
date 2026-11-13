// Mensajes del chat de la orden que tambien se le mandan al cliente por
// WhatsApp. La app solo inserta la fila (para_cliente=true) y le avisa al
// bot, que la manda por Chatwoot (asi queda en la conversacion del cliente).
export const BOT_CHAT_CLIENTE_URL = "https://amnet-bot-pagos.0lthka.easypanel.host";

export async function enviarAlClienteViaBot(id) {
  try {
    const res = await fetch(`${BOT_CHAT_CLIENTE_URL}/chat-orden/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return await res.json().catch(() => ({ ok: res.ok }));
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export const RAPIDAS_CLIENTE_TECNICO = ["Estoy en camino 🛵", "Llego en 10 minutos", "Ya estoy afuera", "¿Me puede abrir, por favor?", "¿Me envía su ubicación, por favor?"];
export const RAPIDAS_CLIENTE_OFICINA = ["Su técnico ya va en camino", "En breve le confirmamos", "Gracias por avisarnos 👍", "¿Nos confirma su dirección, por favor?"];

// Si los ultimos mensajes del chat son del cliente (nadie le contesto),
// devuelve desde cuando espera. msgs: del mas nuevo al mas viejo.
export const MIN_ESPERA_CLIENTE = 10;
export function esperandoClienteDesde(msgs) {
  const lista = Array.isArray(msgs) ? msgs : [];
  if (!lista.length || String(lista[0]?.autor_rol || "").toLowerCase() !== "cliente") return null;
  let desde = lista[0].created_at;
  for (const m of lista) {
    if (String(m?.autor_rol || "").toLowerCase() !== "cliente") break;
    desde = m.created_at;
  }
  return desde;
}
export function minutosEsperando(desde, ahora = Date.now()) {
  const t = new Date(desde || "").getTime();
  return Number.isFinite(t) ? Math.floor((ahora - t) / 60000) : 0;
}
