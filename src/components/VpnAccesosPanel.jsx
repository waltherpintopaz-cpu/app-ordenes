import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

const DIAGNO_BASE = import.meta.env.PROD ? "https://amnet-diagno.0lthka.easypanel.host" : "";
const PROXY_URL = `${DIAGNO_BASE}/api/mikrowisp-proxy`;

function formatearFecha(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function VpnAccesosPanel({ usuarioSesion, puedeRevocar }) {
  const [tipo, setTipo] = useState("pc");
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null); // { ip, conf, script, qr }
  const [lista, setLista] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [errorLista, setErrorLista] = useState("");

  const cargarLista = useCallback(async () => {
    setCargandoLista(true);
    setErrorLista("");
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "VpnListarPeers", payload: {} }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "No se pudo cargar la lista");
      setLista(json?.data?.peers || []);
    } catch (err) {
      setErrorLista(String(err?.message || err));
    } finally {
      setCargandoLista(false);
    }
  }, []);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  const generar = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setCargando(true);
    setError("");
    setResultado(null);
    try {
      const creadoPor = usuarioSesion?.username || usuarioSesion?.nombre || "";
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "VpnCrearPeer", payload: { tipo, nombre: nombre.trim(), creadoPor } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || json?.data?.error || "No se pudo generar el acceso");
      const { ip, conf, script } = json.data || {};
      if (!conf && !script) throw new Error("Respuesta incompleta del servidor");
      let qr = null;
      if (tipo === "celular" && conf) {
        qr = await QRCode.toDataURL(conf, { width: 320, margin: 1 });
      }
      setResultado({ ip, conf, script, qr });
      setNombre("");
      cargarLista();
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setCargando(false);
    }
  };

  const [revocando, setRevocando] = useState(null); // ip en proceso

  const revocar = async (ip, nombrePeer) => {
    if (!window.confirm(`¿Revocar el acceso "${nombrePeer}" (${ip})? Dejará de poder conectarse de inmediato.`)) return;
    setRevocando(ip);
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "VpnEliminarPeer", payload: { ip } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "No se pudo revocar el acceso");
      cargarLista();
    } catch (err) {
      setErrorLista(String(err?.message || err));
    } finally {
      setRevocando(null);
    }
  };

  const descargarConf = () => {
    if (!resultado?.conf) return;
    const blob = new Blob([resultado.conf], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vpn-${resultado.ip}.conf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const [copiado, setCopiado] = useState(false);
  const copiarScript = async () => {
    if (!resultado?.script) return;
    try {
      await navigator.clipboard.writeText(resultado.script);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {}
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h2 style={{ marginBottom: 4 }}>Accesos VPN</h2>
      <p style={{ color: "#666", marginBottom: 20, fontSize: 14 }}>
        Genera un acceso WireGuard nuevo para una PC, un celular o un Mikrotik. La llave
        privada se muestra una sola vez aquí — no queda guardada en ningún lado del sistema.
      </p>

      <form onSubmit={generar} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}>
            <option value="pc">PC</option>
            <option value="celular">Celular</option>
            {puedeRevocar && <option value="mikrotik">Mikrotik</option>}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Nombre / etiqueta</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej. PC-Miguel"
            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" }}
          />
        </div>
        <button type="submit" disabled={cargando || !nombre.trim()} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", cursor: cargando ? "wait" : "pointer" }}>
          {cargando ? "Generando…" : "Generar acceso"}
        </button>
      </form>

      {error && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {resultado && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 28 }}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            IP asignada: <strong>{resultado.ip}</strong>
          </div>
          {resultado.qr && (
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <img src={resultado.qr} alt="QR WireGuard" style={{ maxWidth: "100%", width: 260 }} />
              <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
                Escanea este QR con la app de WireGuard en el celular.
              </div>
            </div>
          )}
          {resultado.conf && (
            <button onClick={descargarConf} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #2563eb", background: "#fff", color: "#2563eb", cursor: "pointer" }}>
              Descargar .conf
            </button>
          )}
          {resultado.script && (
            <>
              <pre style={{
                background: "#0f172a", color: "#e2e8f0", padding: 14, borderRadius: 8,
                fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap", marginBottom: 12,
              }}>{resultado.script}</pre>
              <button onClick={copiarScript} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #2563eb", background: "#fff", color: "#2563eb", cursor: "pointer" }}>
                {copiado ? "Copiado ✓" : "Copiar script"}
              </button>
              <div style={{ fontSize: 12, color: "#999", marginTop: 12 }}>
                Pega este script completo en la terminal del Mikrotik (New Terminal en Winbox). Si el
                router tiene una regla "drop" general en chain=input, hay que mover la regla de
                WireGuard antes de esa regla (ver comentario dentro del script).
              </div>
            </>
          )}
          {resultado.conf && (
            <div style={{ fontSize: 12, color: "#999", marginTop: 12 }}>
              Este acceso es de un solo uso: guarda el archivo o la captura del QR ahora,
              porque la llave privada no se puede volver a mostrar.
            </div>
          )}
        </div>
      )}

      <h3 style={{ fontSize: 16, marginBottom: 10 }}>Accesos creados</h3>
      {cargandoLista && <div style={{ fontSize: 14, color: "#666" }}>Cargando…</div>}
      {errorLista && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 6, fontSize: 14 }}>
          {errorLista}
        </div>
      )}
      {!cargandoLista && !errorLista && lista.length === 0 && (
        <div style={{ fontSize: 14, color: "#999" }}>Todavía no se ha generado ningún acceso desde este panel.</div>
      )}
      {!cargandoLista && lista.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "6px 8px" }}>Nombre</th>
                <th style={{ padding: "6px 8px" }}>Tipo</th>
                <th style={{ padding: "6px 8px" }}>IP</th>
                <th style={{ padding: "6px 8px" }}>Creado</th>
                <th style={{ padding: "6px 8px" }}>Por</th>
                <th style={{ padding: "6px 8px" }}>Estado</th>
                {puedeRevocar && <th style={{ padding: "6px 8px" }}></th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.ip} style={{ borderBottom: "1px solid #f1f1f1" }}>
                  <td style={{ padding: "6px 8px" }}>{p.nombre}</td>
                  <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{p.tipo}</td>
                  <td style={{ padding: "6px 8px" }}>{p.ip}</td>
                  <td style={{ padding: "6px 8px" }}>{formatearFecha(p.fecha)}</td>
                  <td style={{ padding: "6px 8px" }}>{p.creadoPor || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12,
                      background: p.conectado ? "#dcfce7" : "#f3f4f6",
                      color: p.conectado ? "#15803d" : "#6b7280",
                    }}>
                      {p.conectado ? "Conectado" : (p.ultimoHandshake ? "Desconectado" : "Nunca conectado")}
                    </span>
                  </td>
                  {puedeRevocar && (
                    <td style={{ padding: "6px 8px" }}>
                      <button
                        onClick={() => revocar(p.ip, p.nombre)}
                        disabled={revocando === p.ip}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #dc2626", background: "#fff", color: "#dc2626", fontSize: 12, cursor: revocando === p.ip ? "wait" : "pointer" }}
                      >
                        {revocando === p.ip ? "…" : "Revocar"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
