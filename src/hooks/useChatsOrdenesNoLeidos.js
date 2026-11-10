import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { getUltimoVisto, sincronizarVistosOrdenes, guardarLecturaOrdenRemota } from "../services/chatOrdenesUnread";

// Mapa { ordenId (string) -> cantidad de mensajes sin ver } para poder
// mostrar un badge directo en el icono de chat de cada tarjeta de orden,
// sin tener que abrir la bandeja general "Chats recientes" para notar que
// hay algo nuevo. Pedido explicito del usuario 2026-11-02.
export default function useChatsOrdenesNoLeidos(ordenes, autor) {
  const [mapa, setMapa] = useState(new Map());
  const ordenesRef = useRef(ordenes);
  ordenesRef.current = ordenes;

  const recalcular = useCallback(async () => {
    const lista = ordenesRef.current || [];
    if (!lista.length) { setMapa(new Map()); return; }
    await sincronizarVistosOrdenes(autor);
    const idsSet = new Set(lista.map((o) => String(o.id)));
    // Sin .in(orden_id, ids) con todos los ids -- con muchas ordenes esa
    // consulta puede fallar en silencio (url muy larga). Se trae lo
    // reciente sin filtro y se cruza aca mismo (mismo patron que
    // ChatOrdenesFlotante.jsx).
    const { data, error } = await supabase
      .from("chat_ordenes_mensajes")
      .select("orden_id,autor,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return;
    const porOrden = new Map();
    for (const m of data || []) {
      if (!idsSet.has(String(m.orden_id))) continue;
      if (!porOrden.has(m.orden_id)) porOrden.set(m.orden_id, []);
      porOrden.get(m.orden_id).push(m);
    }
    const resultado = new Map();
    for (const [ordenId, msgs] of porOrden.entries()) {
      const visto = getUltimoVisto(ordenId);
      const vistoTime = visto ? new Date(visto).getTime() : 0;
      const noLeidos = msgs.filter((m) =>
        String(m.autor || "").trim().toLowerCase() !== String(autor || "").trim().toLowerCase() &&
        new Date(m.created_at).getTime() > vistoTime
      ).length;
      if (noLeidos > 0) resultado.set(String(ordenId), noLeidos);
    }
    setMapa(resultado);
  }, [autor]);

  useEffect(() => { void recalcular(); }, [ordenes, recalcular]);

  useEffect(() => {
    const channel = supabase
      .channel("chat-ordenes-unread-cards")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_ordenes_mensajes" }, (payload) => {
        const msg = payload.new;
        if (!msg) return;
        const esMia = (ordenesRef.current || []).some((o) => String(o.id) === String(msg.orden_id));
        if (esMia) void recalcular();
      })
      .subscribe();
    // Leido en otro dispositivo (app movil) -> se apaga el globo de la tarjeta.
    const canalLect = autor ? supabase
      .channel(`chat-ordenes-lecturas-cards-${autor}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_ordenes_lecturas", filter: `usuario=eq.${autor}` }, (payload) => {
        guardarLecturaOrdenRemota(payload.new);
        void recalcular();
      })
      .subscribe() : null;
    return () => { supabase.removeChannel(channel); if (canalLect) supabase.removeChannel(canalLect); };
  }, [recalcular, autor]);

  return mapa;
}
