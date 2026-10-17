import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../supabaseClient";

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
  const esAdmin = !!puedeRevocar;
  const usuarioId = String(usuarioSesion?.id || "");
  const [gestoras, setGestoras] = useState([]);
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
        body: JSON.stringify({ accion: "VpnListarPeers", payload: { esAdmin, usuarioId } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "No se pudo cargar la lista");
      setLista(json?.data?.peers || []);
    } catch (err) {
      setErrorLista(String(err?.message || err));
    } finally {
      setCargandoLista(false);
    }
  }, [esAdmin, usuarioId]);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  // Admin: lista de Gestoras para elegir a quien hacerle visible cada
  // acceso. Se carga una sola vez (no cambia mientras el panel esta abierto).
  useEffect(() => {
    if (!esAdmin) return;
    supabase
      .from("usuarios")
      .select("id,nombre,username")
      .eq("rol", "Gestora")
      .then(({ data, error }) => {
        if (!error) setGestoras(data || []);
      });
  }, [esAdmin]);

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

  const [editando, setEditando] = useState(null); // { ip, nombre, visiblePara, cambiarComentario, comentario }
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const abrirEdicion = (p) => setEditando({
    ip: p.ip, nombre: p.nombre, visiblePara: Array.isArray(p.visiblePara) ? p.visiblePara : [],
    cambiarComentario: false, comentario: "",
  });

  const guardarEdicion = async () => {
    if (!editando) return;
    setGuardandoEdicion(true);
    try {
      const { cambiarComentario, comentario, ...resto } = editando;
      const payload = cambiarComentario ? { ...resto, comentario } : resto;
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "VpnEditarPeer", payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "No se pudo guardar");
      setEditando(null);
      cargarLista();
    } catch (err) {
      setErrorLista(String(err?.message || err));
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // Ver comentario: pide re-escribir la contraseña del usuario actual
  // (verificada contra Supabase, mismo patron que "Cambiar contraseña" del
  // panel de Usuarios) antes de pedirle el texto real al servidor.
  const [verComentario, setVerComentario] = useState(null); // { ip, nombre }
  const [passwordInput, setPasswordInput] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [errorPassword, setErrorPassword] = useState("");
  const [comentarioRevelado, setComentarioRevelado] = useState(null); // { ip, texto }

  const confirmarVerComentario = async () => {
    setVerificando(true);
    setErrorPassword("");
    try {
      const username = String(usuarioSesion?.username || "").trim().toLowerCase();
      const { data: dbUser } = await supabase.from("usuarios").select("password").eq("username", username).maybeSingle();
      const passReal = dbUser?.password ?? usuarioSesion?.password ?? "";
      if (passReal !== passwordInput) {
        setErrorPassword("Contraseña incorrecta.");
        return;
      }
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "VpnVerComentario", payload: { ip: verComentario.ip } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "No se pudo obtener el comentario");
      setComentarioRevelado({ ip: verComentario.ip, texto: json?.data?.comentario || "(sin texto)" });
      setVerComentario(null);
      setPasswordInput("");
    } catch (err) {
      setErrorPassword(String(err?.message || err));
    } finally {
      setVerificando(false);
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
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
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

          {resultado.conf && tipo === "pc" && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Cómo instalarlo en la PC</div>
              <ol style={{ fontSize: 12.5, color: "#444", paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
                <li>Descarga WireGuard para Windows: <a href="https://download.wireguard.com/windows-client/wireguard-installer.exe" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>download.wireguard.com/windows-client/wireguard-installer.exe</a> (o desde <a href="https://www.wireguard.com/install/" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>wireguard.com/install</a> para Mac/Linux).</li>
                <li>Instala y abre la app WireGuard.</li>
                <li>Click en <strong>"Importar túnel desde archivo"</strong> y selecciona el <strong>.conf</strong> que descargaste arriba.</li>
                <li>Click en <strong>"Activar"</strong> para conectar.</li>
              </ol>
            </div>
          )}

          {resultado.qr && tipo === "celular" && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Cómo instalarlo en el celular</div>
              <ol style={{ fontSize: 12.5, color: "#444", paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
                <li>Instala la app WireGuard: <a href="https://play.google.com/store/apps/details?id=com.wireguard.android" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>Android (Play Store)</a> / <a href="https://apps.apple.com/app/wireguard/id1441195209" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>iPhone (App Store)</a>.</li>
                <li>Abre la app y toca el botón <strong>"+"</strong>.</li>
                <li>Elige <strong>"Escanear desde código QR"</strong> y apunta la cámara al QR de arriba.</li>
                <li>Ponle un nombre al túnel y actívalo con el interruptor.</li>
              </ol>
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
                <th style={{ padding: "6px 8px" }}>Comentario</th>
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
                  <td style={{ padding: "6px 8px" }}>
                    {p.tieneComentario ? (
                      comentarioRevelado?.ip === p.ip ? (
                        <span style={{ fontSize: 12, color: "#374151" }}>{comentarioRevelado.texto}</span>
                      ) : (
                        <button
                          onClick={() => { setVerComentario({ ip: p.ip, nombre: p.nombre }); setPasswordInput(""); setErrorPassword(""); }}
                          style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151", fontSize: 12, cursor: "pointer" }}
                        >
                          🔒 Ver
                        </button>
                      )
                    ) : (
                      <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span>
                    )}
                  </td>
                  {puedeRevocar && (
                    <td style={{ padding: "6px 8px", display: "flex", gap: 6 }}>
                      <button
                        onClick={() => abrirEdicion(p)}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #6366f1", background: "#fff", color: "#6366f1", fontSize: 12, cursor: "pointer" }}
                      >
                        Editar
                      </button>
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

      {editando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setEditando(null)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 360, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>Editar acceso</h3>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Nombre / etiqueta</label>
            <input
              value={editando.nombre}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box", marginBottom: 16 }}
            />
            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Visible para (Gestoras)</label>
            <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 16 }}>
              {gestoras.length === 0 && <div style={{ fontSize: 12, color: "#999" }}>No hay usuarios con rol Gestora.</div>}
              {gestoras.map((g) => {
                const gid = String(g.id);
                const marcado = editando.visiblePara.includes(gid);
                return (
                  <label key={gid} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) => {
                        const siguiente = e.target.checked
                          ? [...editando.visiblePara, gid]
                          : editando.visiblePara.filter((x) => x !== gid);
                        setEditando({ ...editando, visiblePara: siguiente });
                      }}
                    />
                    {g.nombre || g.username}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 16 }}>
              Si no marcas ninguna, solo Administrador podrá ver este acceso en la lista.
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editando.cambiarComentario}
                onChange={(e) => setEditando({ ...editando, cambiarComentario: e.target.checked })}
              />
              Cambiar comentario (protegido por contraseña)
            </label>
            {editando.cambiarComentario && (
              <textarea
                value={editando.comentario}
                onChange={(e) => setEditando({ ...editando, comentario: e.target.value })}
                placeholder="Este texto solo se vera volviendo a escribir la contraseña del usuario..."
                rows={3}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box", marginBottom: 16, fontFamily: "inherit", fontSize: 13 }}
              />
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditando(null)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>Cancelar</button>
              <button onClick={guardarEdicion} disabled={guardandoEdicion} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: guardandoEdicion ? "wait" : "pointer" }}>
                {guardandoEdicion ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {verComentario && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001 }} onClick={() => setVerComentario(null)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 320, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>🔒 Confirma tu contraseña</h3>
            <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Para ver el comentario de "{verComentario.nombre}", vuelve a escribir tu propia contraseña de usuario.</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarVerComentario(); }}
              placeholder="Tu contraseña"
              autoFocus
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box", marginBottom: 12 }}
            />
            {errorPassword && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 12 }}>{errorPassword}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setVerComentario(null)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>Cancelar</button>
              <button onClick={confirmarVerComentario} disabled={verificando || !passwordInput} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: verificando ? "wait" : "pointer" }}>
                {verificando ? "Verificando…" : "Ver comentario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
