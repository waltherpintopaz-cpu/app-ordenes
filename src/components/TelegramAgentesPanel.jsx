import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const CW_AGENTES = [
  { id: 1,  name: "Walter Pinto"   },
  { id: 11, name: "Walter Pinto P." },
  { id: 7,  name: "Milagros L."    },
  { id: 12, name: "Rosa Q."        },
  { id: 13, name: "Cynthia L."     },
];

const card = {
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
  padding: "24px 28px",
  marginBottom: 24,
};

const btn = (color = "#2563eb", hover = "#1d4ed8") => ({
  background: color,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 18px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
});

const input = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

export default function TelegramAgentesPanel() {
  const [agentes,  setAgentes]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState(null);
  const [form,     setForm]     = useState({ telegram_id: "", telegram_name: "", chatwoot_id: "" });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data: rows } = await supabase.from("telegram_agents").select("*").order("id");
    setAgentes(rows || []);
    setLoading(false);
  }

  function notify(text, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.telegram_id || !form.telegram_name || !form.chatwoot_id) {
      return notify("Completa todos los campos", false);
    }
    const cw = CW_AGENTES.find(a => String(a.id) === String(form.chatwoot_id));
    setSaving(true);
    const { error } = await supabase.from("telegram_agents").insert({
      telegram_id:   Number(form.telegram_id),
      telegram_name: form.telegram_name.trim(),
      chatwoot_id:   Number(form.chatwoot_id),
      chatwoot_name: cw?.name || "",
      activo:        true,
    });
    setSaving(false);
    if (error) return notify("Error: " + error.message, false);
    notify("Agente agregado");
    setForm({ telegram_id: "", telegram_name: "", chatwoot_id: "" });
    fetchAll();
  }

  async function toggleActivo(ag) {
    await supabase.from("telegram_agents").update({ activo: !ag.activo }).eq("id", ag.id);
    fetchAll();
  }

  async function handleDelete(ag) {
    if (!confirm(`¿Eliminar a ${ag.chatwoot_name}?`)) return;
    await supabase.from("telegram_agents").delete().eq("id", ag.id);
    fetchAll();
  }

  return (
    <div style={{ padding: "28px 24px", maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
        🤖 Agentes Telegram
      </h2>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
        Relaciona cada cuenta de Telegram con su agente en Chatwoot. Se usa para asignar conversaciones al presionar "Atender" desde el grupo.
      </p>

      {msg && (
        <div style={{
          background: msg.ok ? "#f0fdf4" : "#fef2f2",
          color: msg.ok ? "#166534" : "#991b1b",
          border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`,
          borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13,
        }}>
          {msg.text}
        </div>
      )}

      {/* Formulario agregar */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>
          Agregar agente
        </h3>
        <form onSubmit={handleAdd}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
                Telegram ID
              </label>
              <input
                style={input}
                type="number"
                placeholder="ej. 1096228341"
                value={form.telegram_id}
                onChange={e => setForm(f => ({ ...f, telegram_id: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
                Nombre en Telegram
              </label>
              <input
                style={input}
                type="text"
                placeholder="ej. walther"
                value={form.telegram_name}
                onChange={e => setForm(f => ({ ...f, telegram_name: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
                Agente Chatwoot
              </label>
              <select
                style={{ ...input, background: "#fff" }}
                value={form.chatwoot_id}
                onChange={e => setForm(f => ({ ...f, chatwoot_id: e.target.value }))}
              >
                <option value="">— Seleccionar —</option>
                {CW_AGENTES.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button style={btn()} type="submit" disabled={saving}>
            {saving ? "Guardando…" : "+ Agregar"}
          </button>
        </form>
        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 12 }}>
          Para obtener el Telegram ID: pídele al agente que escriba cualquier mensaje al bot directamente. Luego consulta{" "}
          <code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 4 }}>
            /getUpdates
          </code>{" "}
          en la API de Telegram.
        </p>
      </div>

      {/* Lista */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>
          Agentes registrados
        </h3>
        {loading ? (
          <p style={{ color: "#94a3b8", fontSize: 13 }}>Cargando…</p>
        ) : agentes.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13 }}>No hay agentes registrados aún.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                {["Telegram", "Nombre TG", "Chatwoot", "Estado", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agentes.map(ag => (
                <tr key={ag.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                  <td style={{ padding: "10px 10px", fontFamily: "monospace", color: "#475569" }}>{ag.telegram_id}</td>
                  <td style={{ padding: "10px 10px", color: "#1e293b", fontWeight: 500 }}>@{ag.telegram_name}</td>
                  <td style={{ padding: "10px 10px", color: "#1e293b" }}>{ag.chatwoot_name}</td>
                  <td style={{ padding: "10px 10px" }}>
                    <button
                      onClick={() => toggleActivo(ag)}
                      style={{
                        background: ag.activo ? "#f0fdf4" : "#f8fafc",
                        color: ag.activo ? "#166534" : "#94a3b8",
                        border: `1px solid ${ag.activo ? "#bbf7d0" : "#e2e8f0"}`,
                        borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {ag.activo ? "✓ Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td style={{ padding: "10px 10px" }}>
                    <button
                      onClick={() => handleDelete(ag)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
