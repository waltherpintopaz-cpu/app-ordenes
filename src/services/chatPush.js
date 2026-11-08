// Push de los mensajes del chat -- AMERICANET.
// Ya NO se manda desde la app/web: lo hace la base de datos con un trigger
// (supabase/sql/20261108_chat_push_trigger.sql en app-ordenes), igual que
// DIM con su webhook. Asi no depende de la version ni de la señal de quien
// escribe. Se deja la funcion vacia para no duplicar avisos.
export async function notificarMensajeChat() {}
