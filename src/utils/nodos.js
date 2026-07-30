// Reverso: numero crudo de router Mikrowisp -> etiqueta visual "Nod_XX".
// Un mismo Nod_XX puede tener varios IDs historicos de Mikrowisp (routers
// reemplazados/migrados con el tiempo). Se usa para traducir datos que
// llegan con el numero crudo en vez de la etiqueta (ej: clientes sincronizados
// desde Mikrowisp, import CSV/Sheet).
export const NODO_POR_ROUTER_MIKROWISP = {
  "1": "Nod_01", "7": "Nod_01", "8": "Nod_01", "9": "Nod_01",
  "2": "Nod_02",
  "3": "Nod_03", "10": "Nod_03", "12": "Nod_03",
  "5": "Nod_04", "6": "Nod_04",
  "11": "Nod_06",
};

export function normalizarEtiquetaNodo(valor) {
  const raw = String(valor || "").trim();
  if (!raw) return "";
  if (/^Nod_0[1-6]$/i.test(raw)) return raw.replace(/^nod_/i, "Nod_");
  return NODO_POR_ROUTER_MIKROWISP[raw] || raw;
}
