// Mismo patron que chatOrdenesUnread.js, pero para el chat directo
// tecnico <-> oficina (clave por nombre de tecnico, no por orden_id).
const PREFIX = "chat_tecnico_leido_";

export function getUltimoVistoTecnico(tecnicoNombre) {
  try {
    return localStorage.getItem(PREFIX + String(tecnicoNombre)) || null;
  } catch {
    return null;
  }
}

export function marcarChatTecnicoVisto(tecnicoNombre) {
  if (!tecnicoNombre) return;
  try {
    localStorage.setItem(PREFIX + String(tecnicoNombre), new Date().toISOString());
  } catch {
    // best-effort
  }
}
