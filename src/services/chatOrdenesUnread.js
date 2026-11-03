// "Visto" se guarda local en el navegador (localStorage), no en Supabase --
// solo hace falta saber hasta que mensaje ya vio ESTE usuario en ESTE
// navegador, no hace falta sincronizar entre dispositivos. Mismo patron que
// chatOrdenesUnread.js de la app movil (AsyncStorage alla, localStorage aca).
const PREFIX = "chat_orden_leido_";

export function getUltimoVisto(ordenId) {
  try {
    return localStorage.getItem(PREFIX + String(ordenId)) || null;
  } catch {
    return null;
  }
}

export function marcarChatOrdenVisto(ordenId) {
  if (!ordenId) return;
  try {
    localStorage.setItem(PREFIX + String(ordenId), new Date().toISOString());
  } catch {
    // best-effort
  }
}
