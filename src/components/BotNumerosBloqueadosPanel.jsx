import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Ban, Lock, Unlock, Trash2, Plus } from "lucide-react";

// Pantalla separada a propósito de BotPagosV3ConfigPanel (pedido del
// usuario, 2026-10-26): un número agregado acá queda en silencio TOTAL
// para el bot (ver numeroBloqueado() en server.mjs, repo
// bot-pagos-comprobante) sin importar bandeja, fase, ni que la
// conversación se resuelva o pasen 24 horas -- a diferencia de otros
// estados del bot (escalado, en espera, etc) que sí se destraban solos
// con el tiempo o al resolver la conversación, esto se queda bloqueado
// HASTA que alguien lo quite acá a mano. Usa la misma tabla
// bot_pagos_v3_config (columna numeros_bloqueados) que ya lee server.mjs,
// solo que esta pantalla vive aparte en el sidebar para que sea rápido
// de encontrar, y pide una clave antes de agregar o quitar un número --
// una acción así de sensible (silenciar al bot para un cliente real) no
// debe poder hacerse con un click por error.
const CLAVE_BLOQUEO = "americanet2026";

const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 22px", marginBottom: 14, maxWidth: 560 };
const cardTitle = { fontSize: 14, fontWeight: 700, color: "#111827", display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" };
const hint = { fontSize: 12, color: "#9ca3af", marginTop: 4, marginBottom: 16, lineHeight: 1.5 };
const inp = { padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, color: "#111827", fontFamily: "inherit", boxSizing: "border-box", background: "#fff" };

export default function BotNumerosBloqueadosPanel() {
  const [numeros, setNumeros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [clave, setClave] = useState("");
  const [nuevoNumero, setNuevoNumero] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null);

  const desbloqueado = clave === CLAVE_BLOQUEO;

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("bot_pagos_v3_config").select("numeros_bloqueados").eq("id", 1).maybeSingle();
    setNumeros((data?.numeros_bloqueados || "").split(",").map((s) => s.trim()).filter(Boolean));
    setCargando(false);
  }

  async function guardarLista(lista) {
    setGuardando(true);
    setMsg(null);
    const { error } = await supabase.from("bot_pagos_v3_config").upsert({ id: 1, numeros_bloqueados: lista.join(", "), actualizado_en: new Date().toISOString() }, { onConflict: "id" });
    setGuardando(false);
    if (error) { setMsg({ tipo: "error", texto: "No se pudo guardar: " + error.message }); return false; }
    setNumeros(lista);
    setMsg({ tipo: "ok", texto: "Guardado." });
    return true;
  }

  async function agregar() {
    const limpio = nuevoNumero.trim();
    if (!limpio || !desbloqueado) return;
    if (numeros.includes(limpio)) { setMsg({ tipo: "error", texto: "Ese número ya está en la lista." }); return; }
    const ok = await guardarLista([...numeros, limpio]);
    if (ok) setNuevoNumero("");
  }

  async function quitar(numero) {
    if (!desbloqueado) return;
    await guardarLista(numeros.filter((n) => n !== numero));
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={card}>
        <div style={cardTitle}><Ban size={16} color="#dc2626" /> Números bloqueados (el bot nunca se activa)</div>
        <div style={hint}>
          Un número agregado acá queda en silencio TOTAL para el bot -- ninguna bandeja, ningún tipo de mensaje
          lo despierta. A diferencia de un escalamiento normal, esto NO se destraba solo aunque la conversación
          se marque como resuelta o pasen 24 horas: se queda bloqueado hasta que lo quites acá a mano.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 12px", borderRadius: 8, background: desbloqueado ? "#f0fdf4" : "#fffbeb", border: `1px solid ${desbloqueado ? "#bbf7d0" : "#fde68a"}` }}>
          {desbloqueado ? <Unlock size={15} color="#16a34a" /> : <Lock size={15} color="#92400e" />}
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Clave para habilitar agregar/quitar..."
            style={{ ...inp, flex: 1, border: "1px solid transparent", background: "transparent" }}
          />
          {desbloqueado && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Desbloqueado</span>}
        </div>

        {cargando ? (
          <div style={{ fontSize: 13, color: "#6b7280" }}>Cargando...</div>
        ) : (
          <>
            {numeros.length === 0 ? (
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>No hay números bloqueados.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {numeros.map((n) => (
                  <div key={n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 7, background: "#fef2f2", border: "1px solid #fecaca" }}>
                    <span style={{ fontSize: 13, color: "#991b1b", fontWeight: 600 }}>{n}</span>
                    <button
                      onClick={() => quitar(n)}
                      disabled={!desbloqueado || guardando}
                      title={desbloqueado ? "Quitar bloqueo" : "Ingresa la clave para poder quitarlo"}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, border: "1px solid #dc2626", background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: desbloqueado ? "pointer" : "not-allowed", opacity: desbloqueado ? 1 : 0.5 }}
                    >
                      <Trash2 size={12} /> Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={nuevoNumero}
                onChange={(e) => setNuevoNumero(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && agregar()}
                placeholder="Ej. 987654321 o +51987654321..."
                disabled={!desbloqueado}
                style={{ ...inp, flex: 1 }}
              />
              <button
                onClick={agregar}
                disabled={!desbloqueado || !nuevoNumero.trim() || guardando}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, border: "none", background: desbloqueado ? "#dc2626" : "#d1d5db", color: "#fff", fontSize: 13, fontWeight: 600, cursor: desbloqueado ? "pointer" : "not-allowed" }}
              >
                <Plus size={14} /> Bloquear
              </button>
            </div>
            {!desbloqueado && <div style={hint}>Ingresa la clave arriba para poder agregar o quitar números.</div>}
            {msg && <div style={{ marginTop: 12, fontSize: 12, color: msg.tipo === "error" ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{msg.texto}</div>}
          </>
        )}
      </div>
    </div>
  );
}
