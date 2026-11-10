import { supabase } from "../supabaseClient";

// Mismo patron que chatOrdenesUnread.js, pero para el chat directo
// tecnico <-> oficina (clave por nombre de tecnico, no por orden_id).
// En la base: chat_tecnicos_lecturas (una fila por tecnico+usuario).
const PREFIX = "chat_tecnico_leido_";

export function getUltimoVistoTecnico(tecnicoNombre) {
  try {
    return localStorage.getItem(PREFIX + String(tecnicoNombre)) || null;
  } catch {
    return null;
  }
}

function guardarLocal(tecnicoNombre, iso) {
  try {
    const actual = localStorage.getItem(PREFIX + String(tecnicoNombre));
    if (!actual || new Date(iso).getTime() > new Date(actual).getTime()) localStorage.setItem(PREFIX + String(tecnicoNombre), iso);
  } catch {
    // best-effort
  }
}

export function marcarChatTecnicoVisto(tecnicoNombre, usuario) {
  if (!tecnicoNombre) return;
  guardarLocal(tecnicoNombre, new Date().toISOString());
  if (!usuario) return;
  supabase
    .from("chat_tecnicos_lecturas")
    .upsert({ tecnico_nombre: tecnicoNombre, usuario, visto_at: new Date().toISOString() }, { onConflict: "tecnico_nombre,usuario" })
    .then(() => {}, () => {});
}

export async function sincronizarVistosTecnicos(usuario) {
  if (!usuario) return;
  try {
    const { data, error } = await supabase
      .from("chat_tecnicos_lecturas")
      .select("tecnico_nombre,visto_at")
      .eq("usuario", usuario)
      .limit(1000);
    if (error) return;
    for (const l of data || []) guardarLocal(l.tecnico_nombre, l.visto_at);
  } catch {
    // sin red: se queda con lo local
  }
}

export function guardarLecturaTecnicoRemota(lectura) {
  if (lectura?.tecnico_nombre && lectura?.visto_at) guardarLocal(lectura.tecnico_nombre, lectura.visto_at);
}
