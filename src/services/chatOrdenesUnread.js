import { supabase } from "../supabaseClient";

// "Visto" del chat por orden. Se guarda en localStorage (rapido, sincrono)
// y ademas en la base (chat_ordenes_lecturas, una fila por orden+usuario),
// para que lo leido en el celular tambien se de por leido en el navegador y
// al reves. Antes era solo local y el globo de "no leidos" seguia en la web
// aunque el mensaje ya se hubiera visto en la app (pedido 2026-11-10).
const PREFIX = "chat_orden_leido_";

export function getUltimoVisto(ordenId) {
  try {
    return localStorage.getItem(PREFIX + String(ordenId)) || null;
  } catch {
    return null;
  }
}

function guardarLocal(ordenId, iso) {
  try {
    const actual = localStorage.getItem(PREFIX + String(ordenId));
    if (!actual || new Date(iso).getTime() > new Date(actual).getTime()) localStorage.setItem(PREFIX + String(ordenId), iso);
  } catch {
    // best-effort
  }
}

export function marcarChatOrdenVisto(ordenId, usuario) {
  if (!ordenId) return;
  guardarLocal(ordenId, new Date().toISOString());
  if (!usuario) return;
  supabase
    .from("chat_ordenes_lecturas")
    .upsert({ orden_id: ordenId, usuario, visto_at: new Date().toISOString() }, { onConflict: "orden_id,usuario" })
    .then(() => {}, () => {});
}

// Trae de la base lo que este usuario ya vio (en cualquier dispositivo) y lo
// junta con lo local, quedandose con lo mas reciente.
export async function sincronizarVistosOrdenes(usuario) {
  if (!usuario) return;
  try {
    const { data, error } = await supabase
      .from("chat_ordenes_lecturas")
      .select("orden_id,visto_at")
      .eq("usuario", usuario)
      .order("visto_at", { ascending: false })
      .limit(1000);
    if (error) return;
    for (const l of data || []) guardarLocal(l.orden_id, l.visto_at);
  } catch {
    // sin red: se queda con lo local
  }
}

// Una lectura nueva de este usuario (p. ej. desde el celular) -> se guarda
// local y se avisa para recalcular los globos.
export function guardarLecturaOrdenRemota(lectura) {
  if (lectura?.orden_id && lectura?.visto_at) guardarLocal(lectura.orden_id, lectura.visto_at);
}
