// Textos de WhatsApp al cliente para la visita: link para elegir su WiFi,
// "va en camino" y bienvenida al terminar la instalacion. Las plantillas se
// pueden editar en Notificaciones WhatsApp; si estan vacias se usan estas.
export const LINK_WIFI_BASE_DEFAULT = "https://amnet-prod.wolgest.com";

export const TPL_EN_CAMINO = "Hola {nombre} 👋 Tu técnico {tecnico} de {empresa} ya va en camino{llegada} 🛵";
export const TPL_BIENVENIDA = "¡Listo {nombre}! 🎉 Tu internet de {empresa} ya está instalado.\n{plan}{wifi}\nSi tienes algún problema, escríbenos a este número. ¡Gracias por elegirnos! 💙";
export const LINEA_LINK_WIFI = "📶 Elige el nombre y la clave de tu WiFi aquí: {link_wifi}";
export const LINEA_RECORDATORIO_WIFI = "⚠️ Aún no elegiste el nombre y la clave de tu WiFi: {link_wifi}";

export const esInstalacion = (tipo) => /instal/i.test(String(tipo || "")) && !/recojo|recup/i.test(String(tipo || ""));

export function linkWifi(cfg, token) {
  if (!token) return "";
  const base = String(cfg?.wifi_link_base || "").trim().replace(/\/$/, "") || LINK_WIFI_BASE_DEFAULT;
  return `${base}/wifi/${token}`;
}

// Bloque de la red para el mensaje de bienvenida ("" si el cliente no la eligio).
export function bloqueWifi({ wifiNombre, wifiClave, wifiSolo24 }) {
  const n = String(wifiNombre || "").trim();
  if (!n) return "";
  const lineas = [`📶 ${n} 2.4G — llega más lejos, pasa paredes`];
  if (!wifiSolo24) lineas.push(`📶 ${n} 5G — más rápida, mejor cerca del equipo`);
  if (wifiClave) lineas.push(`🔑 Clave: ${String(wifiClave).trim()}`);
  return `${lineas.join("\n")}\n`;
}

export function telWhatsApp(numero) {
  let phone = String(numero || "").replace(/[\s\-()]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (/^9\d{8}$/.test(phone)) phone = `51${phone}`;
  return phone;
}

export async function enviarTextoEvolution(cfg, numero, texto) {
  if (!cfg?.habilitado || !cfg.base_url || !cfg.api_key || !cfg.instance_name) return false;
  const phone = telWhatsApp(numero);
  if (!phone || !texto) return false;
  const res = await fetch(`${cfg.base_url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(cfg.instance_name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.api_key },
    body: JSON.stringify({ number: phone, text: texto }),
  });
  return res.ok;
}

// Link publico para ver en el mapa donde va el tecnico (mismo token del WiFi).
export const LINEA_SIGUE_TECNICO = "📍 Mira en el mapa dónde va tu técnico: {link_sigue}";
export function linkSigue(cfg, token) {
  if (!token) return "";
  const base = String(cfg?.wifi_link_base || "").trim().replace(/\/$/, "") || LINK_WIFI_BASE_DEFAULT;
  return `${base}/sigue/${token}`;
}
