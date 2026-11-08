import { normalizarRolUsuario } from "../app/helpers";

// Push de los mensajes del chat -- AMERICANET.
// Americanet no tiene el servidor de webhooks de DIM (dim-notificaciones-
// server); sus notificaciones salen por la Edge Function
// "send-push-notification" (busca los tokens por nombre de usuario), igual
// que el resto de avisos de esta app. Mismos destinatarios que DIM:
// - Chat de la orden: si escribe el tecnico -> admins; si escribe oficina ->
//   tecnico de la orden + admins (menos el autor).
// - Chat con oficina: si escribe el tecnico -> gestoras + admins; si escribe
//   oficina -> solo el tecnico del hilo.
// Solo existe en app-ordenes (Americanet); app-ordenes-saas (DIM) usa el webhook.
const norm = (v) => String(v || "").trim().toLowerCase();

export async function notificarMensajeChat(supabase, { hiloTecnico, ordenId, ordenCodigo, tecnicoOrden, autor, autorRol, texto, fotoUrl, urgente }) {
  try {
    const { data: usuarios } = await supabase.from("usuarios").select("nombre,rol").eq("activo", true);
    const lista = (usuarios || []).filter((u) => String(u.nombre || "").trim());
    const porRol = (r) => lista.filter((u) => normalizarRolUsuario(u.rol) === r).map((u) => String(u.nombre).trim());
    const esTecnico = normalizarRolUsuario(autorRol) === "Tecnico";
    const contenido = texto || (fotoUrl ? "📷 Foto" : "");

    const destinos = new Set();
    let title, body, data;
    if (hiloTecnico) {
      title = `Mensaje de ${autor}`;
      body = contenido;
      data = { tipo: "chat_tecnico", tecnico_nombre: String(hiloTecnico) };
      if (esTecnico) [...porRol("Gestora"), ...porRol("Administrador")].forEach((n) => destinos.add(n));
      else destinos.add(String(hiloTecnico).trim());
    } else {
      title = `${urgente ? "🚨 URGENTE · " : ""}Mensaje en orden${ordenCodigo ? ` ${ordenCodigo}` : ""}`;
      body = `${autor}: ${contenido}`;
      data = { tipo: "chat_orden", orden_id: String(ordenId) };
      porRol("Administrador").forEach((n) => destinos.add(n));
      if (!esTecnico && tecnicoOrden) destinos.add(String(tecnicoOrden).trim());
    }

    const yaVistos = new Set();
    for (const nombre of destinos) {
      const k = norm(nombre);
      if (!k || k === norm(autor) || yaVistos.has(k)) continue;
      yaVistos.add(k);
      void supabase.functions.invoke("send-push-notification", {
        body: { tecnico_nombre: nombre, title, body, data },
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("chatPush: no se pudo notificar", e?.message);
  }
}
