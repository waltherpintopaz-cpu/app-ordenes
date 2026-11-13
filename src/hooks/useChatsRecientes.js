import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { esperandoClienteDesde } from "../services/chatCliente";
import { getUltimoVisto, sincronizarVistosOrdenes, guardarLecturaOrdenRemota } from "../services/chatOrdenesUnread";
import { getUltimoVistoTecnico, sincronizarVistosTecnicos, guardarLecturaTecnicoRemota } from "../services/chatTecnicosUnread";

const norm = (v) => String(v || "").trim().toLowerCase();

// Lista de chats recientes (de ordenes y con tecnicos) con su contador de no
// leidos, actualizada en vivo. Misma logica que ChatOrdenesFlotante: solo
// cuenta ordenes/tecnicos que este usuario puede ver (los que recibe en
// "ordenes" / "tecnicos"). onNuevo(msg, info) se llama con cada mensaje
// ajeno que llega (para el aviso de escritorio).
export default function useChatsRecientes({ ordenes, tecnicos, autor, onNuevo }) {
  const [chats, setChats] = useState([]);
  const [cargando, setCargando] = useState(false);
  const ordenesRef = useRef(ordenes);
  ordenesRef.current = ordenes;
  const tecnicosRef = useRef(tecnicos);
  tecnicosRef.current = tecnicos;
  const onNuevoRef = useRef(onNuevo);
  onNuevoRef.current = onNuevo;
  const timerRef = useRef(null);

  const recalcular = useCallback(async () => {
    const listaOrdenes = ordenesRef.current || [];
    const listaTecnicos = tecnicosRef.current || [];
    setCargando(true);
    try {
      await Promise.all([sincronizarVistosOrdenes(autor), sincronizarVistosTecnicos(autor)]);
      const resultado = [];
      const contar = (msgs, visto) => {
        const t = visto ? new Date(visto).getTime() : 0;
        return msgs.filter((m) => norm(m.autor) !== norm(autor) && new Date(m.created_at).getTime() > t).length;
      };

      if (listaOrdenes.length) {
        const porId = new Map(listaOrdenes.map((o) => [String(o.id), o]));
        const { data, error } = await supabase
          .from("chat_ordenes_mensajes")
          .select("id,orden_id,texto,foto_url,autor,autor_rol,created_at")
          .order("created_at", { ascending: false })
          .limit(500);
        if (!error) {
          const grupos = new Map();
          for (const m of data || []) {
            if (!porId.has(String(m.orden_id))) continue;
            if (!grupos.has(m.orden_id)) grupos.set(m.orden_id, []);
            grupos.get(m.orden_id).push(m);
          }
          for (const [ordenId, msgs] of grupos.entries()) {
            const ordenInfo = porId.get(String(ordenId));
            resultado.push({
              tipo: "orden", key: `orden:${ordenId}`, ordenId, ordenInfo,
              titulo: `${ordenInfo?.codigo || "Orden"} · ${ordenInfo?.nombre || "Cliente"}`,
              sub: ordenInfo?.tecnico ? `Técnico: ${ordenInfo.tecnico}` : "",
              count: contar(msgs, getUltimoVisto(ordenId)), ultimo: msgs[0],
              esperandoDesde: esperandoClienteDesde(msgs),
            });
          }
        }
      }

      if (listaTecnicos.length) {
        const nombres = new Set(listaTecnicos.map((n) => String(n)));
        const { data, error } = await supabase
          .from("chat_tecnicos_mensajes")
          .select("id,tecnico_nombre,texto,foto_url,autor,created_at")
          .order("created_at", { ascending: false })
          .limit(500);
        if (!error) {
          const grupos = new Map();
          for (const m of data || []) {
            if (!nombres.has(String(m.tecnico_nombre))) continue;
            if (!grupos.has(m.tecnico_nombre)) grupos.set(m.tecnico_nombre, []);
            grupos.get(m.tecnico_nombre).push(m);
          }
          for (const [tecnicoNombre, msgs] of grupos.entries()) {
            resultado.push({
              tipo: "tecnico", key: `tecnico:${tecnicoNombre}`, tecnicoNombre,
              titulo: tecnicoNombre, sub: "Chat con oficina",
              count: contar(msgs, getUltimoVistoTecnico(tecnicoNombre)), ultimo: msgs[0],
            });
          }
        }
      }

      resultado.sort((a, b) => new Date(b.ultimo.created_at) - new Date(a.ultimo.created_at));
      setChats(resultado);
    } finally {
      setCargando(false);
    }
  }, [autor]);

  // Varias senales juntas (mensaje + lectura) -> un solo recalculo.
  const programar = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void recalcular(); }, 350);
  }, [recalcular]);

  useEffect(() => { void recalcular(); }, [ordenes, tecnicos, recalcular]);

  useEffect(() => {
    const chOrd = supabase
      .channel("chats-pagina-ordenes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_ordenes_mensajes" }, (payload) => {
        const msg = payload.new;
        const ordenInfo = (ordenesRef.current || []).find((o) => String(o.id) === String(msg?.orden_id));
        if (!ordenInfo) return;
        if (norm(msg.autor) !== norm(autor)) onNuevoRef.current?.(msg, { tipo: "orden", key: `orden:${msg.orden_id}`, ordenId: msg.orden_id, ordenInfo });
        programar();
      })
      .subscribe();
    const chTec = supabase
      .channel("chats-pagina-tecnicos")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_tecnicos_mensajes" }, (payload) => {
        const msg = payload.new;
        if (!(tecnicosRef.current || []).some((n) => String(n) === String(msg?.tecnico_nombre))) return;
        if (norm(msg.autor) !== norm(autor)) onNuevoRef.current?.(msg, { tipo: "tecnico", key: `tecnico:${msg.tecnico_nombre}`, tecnicoNombre: msg.tecnico_nombre });
        programar();
      })
      .subscribe();
    const chLect = autor ? supabase
      .channel(`chats-pagina-lecturas-${autor}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_ordenes_lecturas", filter: `usuario=eq.${autor}` }, (p) => { guardarLecturaOrdenRemota(p.new); programar(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_tecnicos_lecturas", filter: `usuario=eq.${autor}` }, (p) => { guardarLecturaTecnicoRemota(p.new); programar(); })
      .subscribe() : null;
    return () => {
      clearTimeout(timerRef.current);
      supabase.removeChannel(chOrd);
      supabase.removeChannel(chTec);
      if (chLect) supabase.removeChannel(chLect);
    };
  }, [autor, programar]);

  return { chats, cargando, recalcular: programar };
}
