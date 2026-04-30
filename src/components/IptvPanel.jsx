import { useEffect, useState, useCallback, useRef } from "react";
import { Tv, Server, Users, Package, Plus, Edit2, Trash2, RefreshCw, Eye, EyeOff, CheckCircle, XCircle, Clock, Copy, MessageCircle, Search, CalendarPlus, UserCircle } from "lucide-react";
import { supabase } from "../supabaseClient";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: Tv },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "perfiles", label: "Perfiles", icon: UserCircle },
  { key: "servidores", label: "Servidores", icon: Server },
  { key: "paquetes", label: "Paquetes", icon: Package },
];

const AVATAR_COLORS = [
  "#00D679","#E53935","#1E88E5","#FB8C00","#8E24AA",
  "#00ACC1","#43A047","#F4511E","#6D4C41","#546E7A",
];

const EMPTY_PROFILE = { client_id: "", nombre: "", avatar_color: "#00D679", pin: "" };

const EMPTY_CLIENT = { nombre: "", username: "", password: "", server_id: "", package_id: "", fecha_expiracion: "", activo: true, notas: "", cliente_ref: "" };
const EMPTY_SERVER = { nombre: "", url: "", xtream_user: "", xtream_pass: "", notas: "" };
const EMPTY_PACKAGE = { nombre: "", duracion_dias: 30, precio: "", descripcion: "" };

function Badge({ activo, expirado }) {
  if (expirado) return <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Expirado</span>;
  if (activo) return <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Activo</span>;
  return <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Suspendido</span>;
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", flex: 1, minWidth: 160 }}>
      <div style={{ background: color + "18", borderRadius: 10, padding: 10 }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#111", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#6b7280" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CopyBtn({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(String(text || "")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title={`Copiar ${label}`}
      style={{ background: copied ? "#dcfce7" : "#f3f4f6", color: copied ? "#166534" : "#6b7280", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, transition: "all .15s" }}>
      <Copy size={12} /> {copied ? "¡Copiado!" : label}
    </button>
  );
}

const inputSt = { width: "100%", padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const labelSt = { fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 5 };
const fieldSt = { marginBottom: 16 };
const btnPrimary = { background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontWeight: 700, cursor: "pointer", fontSize: 14 };
const btnSecondary = { background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, padding: "10px 22px", fontWeight: 600, cursor: "pointer", fontSize: 14 };
const btnDanger = { background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "7px 10px", fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnEdit = { background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 8, padding: "7px 10px", fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnGreen = { background: "#dcfce7", color: "#166534", border: "none", borderRadius: 8, padding: "7px 10px", fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnWa = { background: "#dcfce7", color: "#166534", border: "none", borderRadius: 8, padding: "7px 10px", fontWeight: 600, cursor: "pointer", fontSize: 13 };
const thSt = { padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" };
const tdSt = { padding: "10px 14px", verticalAlign: "middle" };
const PERFILES_POR_PAGINA = 15;

export default function IptvPanel({ esAdmin, sessionUser }) {
  const [tab, setTab] = useState("dashboard");
  const [clientes, setClientes] = useState([]);
  const [servidores, setServidores] = useState([]);
  const [paquetes, setPaquetes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  // Modales
  const [modalCliente, setModalCliente] = useState(null);
  const [modalServidor, setModalServidor] = useState(null);
  const [modalPaquete, setModalPaquete] = useState(null);
  const [modalRenovar, setModalRenovar] = useState(null);

  // Forms
  const [formCliente, setFormCliente] = useState(EMPTY_CLIENT);
  const [formServidor, setFormServidor] = useState(EMPTY_SERVER);
  const [formPaquete, setFormPaquete] = useState(EMPTY_PACKAGE);
  const [diasRenovar, setDiasRenovar] = useState(30);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  // Perfiles
  const [perfiles, setPerfiles] = useState([]);
  const [filtroClientePerfil, setFiltroClientePerfil] = useState("");
  const [busquedaPerfil, setBusquedaPerfil] = useState("");
  const [paginaPerfil, setPaginaPerfil] = useState(0);
  const [modalPerfil, setModalPerfil] = useState(null);
  const [formPerfil, setFormPerfil] = useState(EMPTY_PROFILE);
  const [showPin, setShowPin] = useState(false);

  // Vista detalle cliente (al estilo Max Player)
  const [clienteDetalle, setClienteDetalle] = useState(null);
  const [tabDetalle, setTabDetalle] = useState("credenciales");

  // Toast
  const [toast, setToast] = useState("");
  const toastRef = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 2500);
  };

  const cargar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [{ data: cli }, { data: srv }, { data: pkg }, { data: prfs }] = await Promise.all([
        supabase.from("iptv_clients").select("*").order("created_at", { ascending: false }),
        supabase.from("iptv_servers").select("*").order("nombre"),
        supabase.from("iptv_packages").select("*").order("nombre"),
        supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      ]);
      setClientes(cli || []);
      setServidores(srv || []);
      setPaquetes(pkg || []);
      setPerfiles(prfs || []);
    } catch (e) { setError("Error cargando datos: " + e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const estaExpirado = (fecha) => fecha && new Date(fecha) < new Date();
  const serverNombre = (id) => servidores.find(s => s.id === id)?.nombre || "—";
  const serverUrl = (id) => servidores.find(s => s.id === id)?.url || "";
  const paqueteNombre = (id) => paquetes.find(p => p.id === id)?.nombre || "—";
  const paqueteDias = (id) => paquetes.find(p => p.id === id)?.duracion_dias || 30;

  const clientesFiltrados = clientes.filter(c =>
    !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.username.toLowerCase().includes(busqueda.toLowerCase())
  );

  const stats = {
    total: clientes.length,
    activos: clientes.filter(c => c.activo && !estaExpirado(c.fecha_expiracion)).length,
    expirados: clientes.filter(c => estaExpirado(c.fecha_expiracion)).length,
    suspendidos: clientes.filter(c => !c.activo).length,
  };

  // ── RENOVAR ──
  const abrirRenovar = (c) => {
    setDiasRenovar(paqueteDias(c.package_id));
    setModalRenovar(c);
  };

  const renovar = async () => {
    if (!modalRenovar) return;
    setSaving(true);
    const base = modalRenovar.fecha_expiracion && new Date(modalRenovar.fecha_expiracion) > new Date()
      ? new Date(modalRenovar.fecha_expiracion)
      : new Date();
    base.setDate(base.getDate() + Number(diasRenovar));
    const nuevaFecha = base.toISOString().slice(0, 10);
    await supabase.from("iptv_clients").update({ fecha_expiracion: nuevaFecha, activo: true, updated_at: new Date().toISOString() }).eq("id", modalRenovar.id);
    setSaving(false);
    setModalRenovar(null);
    showToast(`✅ Renovado hasta ${new Date(nuevaFecha).toLocaleDateString("es-PE")}`);
    cargar();
  };

  // ── WHATSAPP ──
  const enviarWhatsApp = (c) => {
    const url = serverUrl(c.server_id);
    const msg = `🎬 *StreamPeru - Credenciales IPTV*\n\nHola ${c.nombre}, aquí están tus datos de acceso:\n\n📡 *Servidor:* ${url}\n👤 *Usuario:* ${c.username}\n🔑 *Contraseña:* ${c.password}\n📅 *Vence:* ${c.fecha_expiracion ? new Date(c.fecha_expiracion).toLocaleDateString("es-PE") : "Sin límite"}\n\nDescarga la app y disfruta tus canales. ¡Cualquier consulta estamos aquí! 📺`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // ── CLIENTES ──
  const abrirNuevoCliente = () => { setFormCliente(EMPTY_CLIENT); setShowPass(false); setModalCliente("nuevo"); };
  const abrirEditarCliente = (c) => { setFormCliente({ ...c, fecha_expiracion: c.fecha_expiracion?.slice(0, 10) || "" }); setShowPass(false); setModalCliente(c); };

  const guardarCliente = async () => {
    if (!formCliente.nombre || !formCliente.username || !formCliente.password || !formCliente.server_id) {
      alert("Completa nombre, usuario, contraseña y servidor."); return;
    }
    setSaving(true);
    const payload = { ...formCliente, fecha_expiracion: formCliente.fecha_expiracion || null, updated_at: new Date().toISOString() };
    if (modalCliente === "nuevo") {
      await supabase.from("iptv_clients").insert([payload]);
    } else {
      await supabase.from("iptv_clients").update(payload).eq("id", modalCliente.id);
    }
    setSaving(false); setModalCliente(null);
    showToast(modalCliente === "nuevo" ? "✅ Cliente creado" : "✅ Cliente actualizado");
    if (clienteDetalle && modalCliente !== "nuevo" && modalCliente.id === clienteDetalle.id) {
      setClienteDetalle({ ...clienteDetalle, ...payload });
    }
    cargar();
  };

  const eliminarCliente = async (id) => {
    if (!confirm("¿Eliminar este cliente IPTV?")) return;
    await supabase.from("iptv_clients").delete().eq("id", id);
    showToast("Cliente eliminado");
    cargar();
  };

  const toggleActivo = async (c) => {
    await supabase.from("iptv_clients").update({ activo: !c.activo, updated_at: new Date().toISOString() }).eq("id", c.id);
    showToast(c.activo ? "Cliente suspendido" : "✅ Cliente activado");
    cargar();
  };

  // ── PERFILES ──
  const abrirNuevoPerfil = (clientId = "") => {
    setFormPerfil({ ...EMPTY_PROFILE, client_id: clientId });
    setShowPin(false);
    setModalPerfil("nuevo");
  };

  const abrirEditarPerfil = (p) => {
    setFormPerfil({ client_id: p.client_id, nombre: p.nombre, avatar_color: p.avatar_color, pin: p.pin || "" });
    setShowPin(false);
    setModalPerfil(p);
  };

  const guardarPerfil = async () => {
    if (!formPerfil.client_id || !formPerfil.nombre.trim()) {
      alert("Selecciona un cliente e ingresa un nombre."); return;
    }
    if (formPerfil.pin && !/^\d{4}$/.test(formPerfil.pin)) {
      alert("El PIN debe ser exactamente 4 dígitos numéricos."); return;
    }
    const esNuevo = modalPerfil === "nuevo";
    if (esNuevo) {
      const clientePerfiles = perfiles.filter(p => p.client_id === formPerfil.client_id);
      if (clientePerfiles.length >= 5) { alert("Este cliente ya tiene 5 perfiles (límite máximo)."); return; }
    }
    setSaving(true);
    const payload = {
      client_id: formPerfil.client_id,
      nombre: formPerfil.nombre.trim(),
      avatar_color: formPerfil.avatar_color,
      pin: formPerfil.pin || null,
    };
    if (esNuevo) {
      await supabase.from("profiles").insert([{ ...payload, favoritos: [] }]);
    } else {
      await supabase.from("profiles").update(payload).eq("id", modalPerfil.id);
    }
    setSaving(false);
    setModalPerfil(null);
    showToast(esNuevo ? "✅ Perfil creado" : "✅ Perfil actualizado");
    cargar();
  };

  const eliminarPerfil = async (id, nombre) => {
    if (!confirm(`¿Eliminar el perfil "${nombre}"?`)) return;
    await supabase.from("profiles").delete().eq("id", id);
    showToast("Perfil eliminado");
    cargar();
  };

  const perfilesFiltrados = perfiles.filter(p => {
    if (filtroClientePerfil && p.client_id !== filtroClientePerfil) return false;
    if (busquedaPerfil) {
      const q = busquedaPerfil.toLowerCase();
      const cliente = clientes.find(c => c.id === p.client_id);
      if (!p.nombre.toLowerCase().includes(q) && !(cliente?.nombre.toLowerCase().includes(q))) return false;
    }
    return true;
  });
  const totalPaginasPerfil = Math.ceil(perfilesFiltrados.length / PERFILES_POR_PAGINA);
  const perfilesPaginados = perfilesFiltrados.slice(paginaPerfil * PERFILES_POR_PAGINA, (paginaPerfil + 1) * PERFILES_POR_PAGINA);

  // ── SERVIDORES ──
  const abrirNuevoServidor = () => { setFormServidor(EMPTY_SERVER); setModalServidor("nuevo"); };
  const abrirEditarServidor = (s) => { setFormServidor(s); setModalServidor(s); };

  const guardarServidor = async () => {
    if (!formServidor.nombre || !formServidor.url) { alert("Completa nombre y URL."); return; }
    setSaving(true);
    let url = formServidor.url.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    const payload = { ...formServidor, url, updated_at: new Date().toISOString() };
    if (modalServidor === "nuevo") {
      await supabase.from("iptv_servers").insert([payload]);
    } else {
      await supabase.from("iptv_servers").update(payload).eq("id", modalServidor.id);
    }
    setSaving(false); setModalServidor(null);
    showToast("✅ Servidor guardado");
    cargar();
  };

  const eliminarServidor = async (id) => {
    if (!confirm("¿Eliminar este servidor?")) return;
    await supabase.from("iptv_servers").delete().eq("id", id);
    showToast("Servidor eliminado");
    cargar();
  };

  // ── PAQUETES ──
  const abrirNuevoPaquete = () => { setFormPaquete(EMPTY_PACKAGE); setModalPaquete("nuevo"); };
  const abrirEditarPaquete = (p) => { setFormPaquete(p); setModalPaquete(p); };

  const guardarPaquete = async () => {
    if (!formPaquete.nombre) { alert("Ingresa el nombre del paquete."); return; }
    setSaving(true);
    const payload = { ...formPaquete, updated_at: new Date().toISOString() };
    if (modalPaquete === "nuevo") {
      await supabase.from("iptv_packages").insert([payload]);
    } else {
      await supabase.from("iptv_packages").update(payload).eq("id", modalPaquete.id);
    }
    setSaving(false); setModalPaquete(null);
    showToast("✅ Paquete guardado");
    cargar();
  };

  const eliminarPaquete = async (id) => {
    if (!confirm("¿Eliminar este paquete?")) return;
    await supabase.from("iptv_packages").delete().eq("id", id);
    showToast("Paquete eliminado");
    cargar();
  };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", borderRadius: 30, padding: "10px 24px", fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#2563eb", borderRadius: 10, padding: 8 }}><Tv size={22} color="#fff" /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Panel IPTV</h2>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Gestión de clientes y servicios IPTV</p>
          </div>
        </div>
        <button onClick={cargar} style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f3f4f6", borderRadius: 10, padding: 4 }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all .15s",
                background: active ? "#fff" : "transparent", color: active ? "#2563eb" : "#6b7280",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Cargando...</div>}

      {/* ── DASHBOARD ── */}
      {!loading && tab === "dashboard" && (
        <div>
          <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
            <StatCard icon={Users} label="Total clientes" value={stats.total} color="#2563eb" />
            <StatCard icon={CheckCircle} label="Activos" value={stats.activos} color="#16a34a" />
            <StatCard icon={Clock} label="Expirados" value={stats.expirados} color="#d97706" />
            <StatCard icon={XCircle} label="Suspendidos" value={stats.suspendidos} color="#dc2626" />
          </div>
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Próximos a vencer (7 días)</h3>
            {(() => {
              const en7dias = clientes.filter(c => {
                if (!c.fecha_expiracion) return false;
                const diff = (new Date(c.fecha_expiracion) - new Date()) / 86400000;
                return diff >= 0 && diff <= 7;
              });
              if (!en7dias.length) return <p style={{ color: "#6b7280", fontSize: 13 }}>Sin vencimientos próximos.</p>;
              return en7dias.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{c.username} · {serverNombre(c.server_id)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#d97706", fontWeight: 700 }}>
                      {new Date(c.fecha_expiracion).toLocaleDateString("es-PE")}
                    </span>
                    <button onClick={() => abrirRenovar(c)} style={{ ...btnGreen, display: "flex", alignItems: "center", gap: 4 }}>
                      <CalendarPlus size={13} /> Renovar
                    </button>
                    <button onClick={() => enviarWhatsApp(c)} style={{ ...btnWa, display: "flex", alignItems: "center", gap: 4 }}>
                      <MessageCircle size={13} /> WA
                    </button>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── CLIENTES ── */}
      {!loading && tab === "clientes" && !clienteDetalle && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
              <input
                style={{ ...inputSt, paddingLeft: 34, background: "#fff" }}
                placeholder="Buscar por nombre o usuario..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>{clientesFiltrados.length} de {clientes.length}</span>
              <button onClick={abrirNuevoCliente} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> Nuevo cliente
              </button>
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Cliente", "Usuario", "Servidor", "Vencimiento", "Estado", "Acciones"].map(h => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>
                    {busqueda ? "Sin resultados para la búsqueda." : "Sin clientes registrados."}
                  </td></tr>
                )}
                {clientesFiltrados.map(c => {
                  const expirado = estaExpirado(c.fecha_expiracion);
                  const cPerfiles = perfiles.filter(p => p.client_id === c.id);
                  return (
                    <tr key={c.id} style={{ borderTop: "1px solid #f3f4f6", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}
                    >
                      <td style={{ padding: "11px 14px" }}
                        onClick={() => { setClienteDetalle(c); setTabDetalle("credenciales"); }}>
                        <div style={{ fontWeight: 700, color: "#2563eb" }}>{c.nombre}</div>
                        {c.cliente_ref && <div style={{ fontSize: 11, color: "#9ca3af" }}>Ref: {c.cliente_ref}</div>}
                      </td>
                      <td style={{ padding: "11px 14px" }}
                        onClick={() => { setClienteDetalle(c); setTabDetalle("credenciales"); }}>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#374151" }}>{c.username}</span>
                      </td>
                      <td style={{ padding: "11px 14px", color: "#6b7280" }}
                        onClick={() => { setClienteDetalle(c); setTabDetalle("credenciales"); }}>
                        {serverNombre(c.server_id)}
                      </td>
                      <td style={{ padding: "11px 14px" }}
                        onClick={() => { setClienteDetalle(c); setTabDetalle("credenciales"); }}>
                        <div style={{ color: expirado ? "#dc2626" : "#374151", fontWeight: expirado ? 700 : 400, fontSize: 12 }}>
                          {c.fecha_expiracion ? new Date(c.fecha_expiracion).toLocaleDateString("es-PE") : "Sin límite"}
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px" }}
                        onClick={() => { setClienteDetalle(c); setTabDetalle("credenciales"); }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Badge activo={c.activo} expirado={expirado} />
                          {cPerfiles.length > 0 && (
                            <span style={{ fontSize: 11, color: "#6b7280" }}>
                              <UserCircle size={11} style={{ display: "inline", marginRight: 3 }} />{cPerfiles.length}/5
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button onClick={e => { e.stopPropagation(); abrirRenovar(c); }} style={btnGreen} title="Renovar"><CalendarPlus size={13} /></button>
                          <button onClick={e => { e.stopPropagation(); enviarWhatsApp(c); }} style={btnWa} title="WhatsApp"><MessageCircle size={13} /></button>
                          <button onClick={e => { e.stopPropagation(); abrirEditarCliente(c); }} style={btnEdit} title="Editar"><Edit2 size={13} /></button>
                          {esAdmin && <button onClick={e => { e.stopPropagation(); eliminarCliente(c.id); }} style={btnDanger} title="Eliminar"><Trash2 size={13} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DETALLE CLIENTE ── */}
      {!loading && tab === "clientes" && clienteDetalle && (() => {
        const c = clienteDetalle;
        const expirado = estaExpirado(c.fecha_expiracion);
        const cPerfiles = perfiles.filter(p => p.client_id === c.id);
        const totalFavs = cPerfiles.reduce((acc, p) => acc + (Array.isArray(p.favoritos) ? p.favoritos.length : 0), 0);
        const DETAIL_TABS = [
          { key: "credenciales", label: "Credenciales" },
          { key: "perfiles", label: `Perfiles (${cPerfiles.length}/5)` },
        ];
        const avatarColors = ["#2563eb","#7c3aed","#db2777","#059669","#d97706","#dc2626"];
        const avatarColor = avatarColors[c.nombre.charCodeAt(0) % avatarColors.length];
        return (
          <div>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 13, color: "#6b7280" }}>
              <button onClick={() => setClienteDetalle(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontWeight: 600, fontSize: 13, padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                ← Clientes
              </button>
              <span>›</span>
              <span style={{ color: "#111", fontWeight: 600 }}>{c.nombre}</span>
            </div>

            {/* Header card */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                  {c.nombre[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 18, fontWeight: 800 }}>{c.nombre}</span>
                    <Badge activo={c.activo} expirado={expirado} />
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                    <span style={{ fontFamily: "monospace" }}>{c.username}</span>
                    {c.cliente_ref && <span style={{ marginLeft: 10 }}>· Ref: {c.cliente_ref}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => abrirEditarCliente(c)} style={{ ...btnEdit, display: "flex", alignItems: "center", gap: 5 }}><Edit2 size={13} /> Editar</button>
                <button onClick={() => abrirRenovar(c)} style={{ ...btnGreen, display: "flex", alignItems: "center", gap: 5 }}><CalendarPlus size={13} /> Renovar</button>
                <button onClick={() => enviarWhatsApp(c)} style={{ ...btnWa, display: "flex", alignItems: "center", gap: 5 }}><MessageCircle size={13} /> WA</button>
                <button onClick={() => toggleActivo(c)} style={{ ...btnSecondary, padding: "7px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
                  {c.activo ? <><XCircle size={13} /> Suspender</> : <><CheckCircle size={13} /> Activar</>}
                </button>
              </div>
            </div>

            {/* Stat cards */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Suscripción</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: expirado ? "#dc2626" : c.activo ? "#16a34a" : "#d97706" }}>
                  {expirado ? "Expirado" : c.activo ? "Activo" : "Suspendido"}
                </div>
                {c.fecha_expiracion && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Vence {new Date(c.fecha_expiracion).toLocaleDateString("es-PE")}</div>}
              </div>
              <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", flex: 1, minWidth: 140, cursor: "pointer" }}
                onClick={() => setTabDetalle("perfiles")}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Perfiles</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{cPerfiles.length}<span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 400 }}>/5</span></div>
              </div>
              <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Favoritos</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{totalFavs}</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Paquete</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{paqueteNombre(c.package_id)}</div>
              </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #f3f4f6" }}>
              {DETAIL_TABS.map(t => (
                <button key={t.key} onClick={() => setTabDetalle(t.key)}
                  style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                    color: tabDetalle === t.key ? "#2563eb" : "#6b7280",
                    borderBottom: tabDetalle === t.key ? "2px solid #2563eb" : "2px solid transparent",
                    marginBottom: -2 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Credenciales tab */}
            {tabDetalle === "credenciales" && (
              <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px" }}>
                  {[
                    { label: "Servidor", value: serverNombre(c.server_id) },
                    { label: "URL del servidor", value: servidores.find(s => s.id === c.server_id)?.url || "—" },
                    { label: "Usuario", value: c.username, copy: true },
                    { label: "Contraseña", value: c.password, copy: true, mask: true },
                    { label: "Vencimiento", value: c.fecha_expiracion ? new Date(c.fecha_expiracion).toLocaleDateString("es-PE") : "Sin límite" },
                    { label: "Paquete", value: paqueteNombre(c.package_id) },
                  ].map(f => (
                    <div key={f.label} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{f.label}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: f.copy ? "monospace" : "inherit", fontSize: 13, color: "#111", wordBreak: "break-all" }}>
                          {f.mask ? "••••••••" : f.value}
                        </span>
                        {f.copy && <CopyBtn text={f.value} label="Copiar" />}
                      </div>
                    </div>
                  ))}
                </div>
                {c.notas && (
                  <div style={{ marginTop: 16, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 13, color: "#6b7280" }}>
                    <span style={{ fontWeight: 700, color: "#374151" }}>Notas: </span>{c.notas}
                  </div>
                )}
              </div>
            )}

            {/* Perfiles tab */}
            {tabDetalle === "perfiles" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                  {cPerfiles.length < 5 && (
                    <button onClick={() => abrirNuevoPerfil(c.id)} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6 }}>
                      <Plus size={14} /> Nuevo perfil
                    </button>
                  )}
                </div>
                {cPerfiles.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 24px", color: "#9ca3af" }}>
                    <UserCircle size={36} style={{ marginBottom: 10, opacity: 0.35 }} />
                    <div style={{ fontSize: 14 }}>Sin perfiles. Crea el primero.</div>
                  </div>
                ) : (
                  <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={thSt}>Perfil</th>
                          <th style={{ ...thSt, textAlign: "center" }}>PIN</th>
                          <th style={{ ...thSt, textAlign: "center" }}>Favoritos</th>
                          <th style={thSt}>Creado</th>
                          <th style={{ ...thSt, textAlign: "right" }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cPerfiles.map((p, idx) => {
                          const favCnt = Array.isArray(p.favoritos) ? p.favoritos.length : 0;
                          return (
                            <tr key={p.id} style={{ borderTop: "1px solid #f3f4f6", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={tdSt}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ width: 34, height: 34, borderRadius: 8, background: p.avatar_color || "#00D679", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#000", flexShrink: 0 }}>
                                    {p.nombre[0].toUpperCase()}
                                  </div>
                                  <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                                </div>
                              </td>
                              <td style={{ ...tdSt, textAlign: "center" }}>
                                {p.pin ? <span title="Con PIN">🔒</span> : <span style={{ color: "#d1d5db" }}>—</span>}
                              </td>
                              <td style={{ ...tdSt, textAlign: "center" }}>
                                {favCnt > 0
                                  ? <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontWeight: 700, fontSize: 12 }}>{favCnt}</span>
                                  : <span style={{ color: "#d1d5db" }}>0</span>}
                              </td>
                              <td style={{ ...tdSt, color: "#9ca3af", fontSize: 12 }}>{new Date(p.created_at).toLocaleDateString("es-PE")}</td>
                              <td style={{ ...tdSt, textAlign: "right" }}>
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button onClick={() => abrirEditarPerfil(p)} style={btnEdit} title="Editar"><Edit2 size={13} /></button>
                                  <button onClick={() => eliminarPerfil(p.id, p.nombre)} style={btnDanger} title="Eliminar"><Trash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── PERFILES ── */}
      {!loading && tab === "perfiles" && (
        <div>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 2, minWidth: 200 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
              <input
                placeholder="Buscar por perfil o cliente..."
                value={busquedaPerfil}
                onChange={e => { setBusquedaPerfil(e.target.value); setPaginaPerfil(0); }}
                style={{ ...inputSt, paddingLeft: 32 }}
              />
            </div>
            <select
              style={{ ...inputSt, flex: 1, minWidth: 180, background: "#fff" }}
              value={filtroClientePerfil}
              onChange={e => { setFiltroClientePerfil(e.target.value); setPaginaPerfil(0); }}
            >
              <option value="">Todos los clientes</option>
              {clientes.map(c => {
                const cnt = perfiles.filter(p => p.client_id === c.id).length;
                return <option key={c.id} value={c.id}>{c.nombre} ({cnt}/5)</option>;
              })}
            </select>
            <button onClick={() => abrirNuevoPerfil(filtroClientePerfil)} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
              <Plus size={14} /> Nuevo perfil
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              {perfilesFiltrados.length} perfil{perfilesFiltrados.length !== 1 ? "es" : ""}
              {(busquedaPerfil || filtroClientePerfil) ? " encontrados" : ` · ${perfiles.length} total`}
            </span>
            {(busquedaPerfil || filtroClientePerfil) && (
              <button
                onClick={() => { setBusquedaPerfil(""); setFiltroClientePerfil(""); setPaginaPerfil(0); }}
                style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                ✕ Limpiar filtros
              </button>
            )}
          </div>

          {/* Table */}
          {perfilesFiltrados.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#9ca3af" }}>
              <UserCircle size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 14 }}>No se encontraron perfiles.</div>
            </div>
          ) : (
            <>
              <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thSt}>Perfil</th>
                      <th style={thSt}>Cliente</th>
                      <th style={{ ...thSt, textAlign: "center" }}>PIN</th>
                      <th style={{ ...thSt, textAlign: "center" }}>Favoritos</th>
                      <th style={thSt}>Creado</th>
                      <th style={{ ...thSt, textAlign: "right" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfilesPaginados.map((p, idx) => {
                      const cliente = clientes.find(c => c.id === p.client_id);
                      const favCnt = Array.isArray(p.favoritos) ? p.favoritos.length : 0;
                      return (
                        <tr key={p.id} style={{ borderTop: "1px solid #f3f4f6", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={tdSt}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ position: "relative", flexShrink: 0 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 8, background: p.avatar_color || "#00D679", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#000" }}>
                                  {p.nombre[0].toUpperCase()}
                                </div>
                              </div>
                              <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                            </div>
                          </td>
                          <td style={{ ...tdSt, color: "#6b7280" }}>{cliente?.nombre || "—"}</td>
                          <td style={{ ...tdSt, textAlign: "center" }}>
                            {p.pin
                              ? <span title="Tiene PIN" style={{ fontSize: 14 }}>🔒</span>
                              : <span style={{ color: "#d1d5db", fontSize: 16 }}>—</span>}
                          </td>
                          <td style={{ ...tdSt, textAlign: "center", color: "#6b7280" }}>
                            {favCnt > 0
                              ? <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: 6, padding: "2px 8px", fontWeight: 700, fontSize: 12 }}>{favCnt}</span>
                              : <span style={{ color: "#d1d5db" }}>0</span>}
                          </td>
                          <td style={{ ...tdSt, color: "#9ca3af", fontSize: 12 }}>{new Date(p.created_at).toLocaleDateString("es-PE")}</td>
                          <td style={{ ...tdSt, textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button onClick={() => abrirEditarPerfil(p)} style={btnEdit} title="Editar / cambiar PIN"><Edit2 size={13} /></button>
                              <button onClick={() => eliminarPerfil(p.id, p.nombre)} style={btnDanger} title="Eliminar"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPaginasPerfil > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
                  <button
                    onClick={() => setPaginaPerfil(p => Math.max(0, p - 1))}
                    disabled={paginaPerfil === 0}
                    style={{ ...btnSecondary, padding: "6px 16px", opacity: paginaPerfil === 0 ? 0.4 : 1 }}
                  >‹ Anterior</button>
                  <span style={{ fontSize: 13, color: "#6b7280", minWidth: 100, textAlign: "center" }}>
                    Pág {paginaPerfil + 1} de {totalPaginasPerfil}
                  </span>
                  <button
                    onClick={() => setPaginaPerfil(p => Math.min(totalPaginasPerfil - 1, p + 1))}
                    disabled={paginaPerfil >= totalPaginasPerfil - 1}
                    style={{ ...btnSecondary, padding: "6px 16px", opacity: paginaPerfil >= totalPaginasPerfil - 1 ? 0.4 : 1 }}
                  >Siguiente ›</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SERVIDORES ── */}
      {!loading && tab === "servidores" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: "#6b7280" }}>{servidores.length} servidores configurados</span>
            {esAdmin && (
              <button onClick={abrirNuevoServidor} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> Nuevo servidor
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {servidores.length === 0 && <p style={{ color: "#9ca3af", gridColumn: "1/-1" }}>Sin servidores registrados.</p>}
            {servidores.map(s => (
              <div key={s.id} style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ background: "#eff6ff", borderRadius: 8, padding: 8 }}><Server size={18} color="#2563eb" /></div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{s.nombre}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, wordBreak: "break-all" }}>{s.url}</div>
                    </div>
                  </div>
                  {esAdmin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => abrirEditarServidor(s)} style={btnEdit}><Edit2 size={13} /></button>
                      <button onClick={() => eliminarServidor(s.id)} style={btnDanger}><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>URL:</span>
                  <CopyBtn text={s.url} label="Copiar URL" />
                </div>
                {s.xtream_user && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Admin: <span style={{ fontFamily: "monospace", color: "#374151" }}>{s.xtream_user}</span></div>}
                {s.notas && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>{s.notas}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PAQUETES ── */}
      {!loading && tab === "paquetes" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: "#6b7280" }}>{paquetes.length} paquetes</span>
            {esAdmin && (
              <button onClick={abrirNuevoPaquete} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> Nuevo paquete
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {paquetes.length === 0 && <p style={{ color: "#9ca3af", gridColumn: "1/-1" }}>Sin paquetes registrados.</p>}
            {paquetes.map(p => (
              <div key={p.id} style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.nombre}</div>
                  {esAdmin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => abrirEditarPaquete(p)} style={btnEdit}><Edit2 size={13} /></button>
                      <button onClick={() => eliminarPaquete(p.id)} style={btnDanger}><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#2563eb", margin: "10px 0 4px" }}>
                  {p.precio ? `S/. ${Number(p.precio).toFixed(2)}` : "—"}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>{p.duracion_dias} días</div>
                {p.descripcion && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>{p.descripcion}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ MODAL CLIENTE ══ */}
      {modalCliente !== null && (
        <Modal title={modalCliente === "nuevo" ? "Nuevo cliente IPTV" : "Editar cliente"} onClose={() => setModalCliente(null)}>
          <div style={fieldSt}><label style={labelSt}>Nombre completo *</label><input style={inputSt} value={formCliente.nombre} onChange={e => setFormCliente(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Juan Pérez" /></div>
          <div style={fieldSt}><label style={labelSt}>Usuario *</label><input style={inputSt} value={formCliente.username} onChange={e => setFormCliente(p => ({ ...p, username: e.target.value }))} placeholder="usuario_iptv" /></div>
          <div style={fieldSt}>
            <label style={labelSt}>Contraseña *</label>
            <div style={{ position: "relative" }}>
              <input style={{ ...inputSt, paddingRight: 40 }} type={showPass ? "text" : "password"} value={formCliente.password} onChange={e => setFormCliente(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
              <button onClick={() => setShowPass(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div style={fieldSt}>
            <label style={labelSt}>Servidor *</label>
            <select style={inputSt} value={formCliente.server_id} onChange={e => setFormCliente(p => ({ ...p, server_id: e.target.value }))}>
              <option value="">Seleccionar servidor...</option>
              {servidores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div style={fieldSt}>
            <label style={labelSt}>Paquete</label>
            <select style={inputSt} value={formCliente.package_id} onChange={e => setFormCliente(p => ({ ...p, package_id: e.target.value }))}>
              <option value="">Sin paquete</option>
              {paquetes.map(p => <option key={p.id} value={p.id}>{p.nombre} — {p.duracion_dias}d · S/. {Number(p.precio || 0).toFixed(2)}</option>)}
            </select>
          </div>
          <div style={fieldSt}><label style={labelSt}>Fecha de expiración</label><input style={inputSt} type="date" value={formCliente.fecha_expiracion} onChange={e => setFormCliente(p => ({ ...p, fecha_expiracion: e.target.value }))} /></div>
          <div style={fieldSt}><label style={labelSt}>Referencia cliente ISP</label><input style={inputSt} value={formCliente.cliente_ref} onChange={e => setFormCliente(p => ({ ...p, cliente_ref: e.target.value }))} placeholder="ID o nombre en el sistema" /></div>
          <div style={fieldSt}><label style={labelSt}>Notas</label><textarea style={{ ...inputSt, resize: "vertical", minHeight: 60 }} value={formCliente.notas} onChange={e => setFormCliente(p => ({ ...p, notas: e.target.value }))} placeholder="Observaciones..." /></div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setModalCliente(null)} style={btnSecondary}>Cancelar</button>
            <button onClick={guardarCliente} style={btnPrimary} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL RENOVAR ══ */}
      {modalRenovar !== null && (
        <Modal title="Renovar suscripción" onClose={() => setModalRenovar(null)}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{modalRenovar.nombre}</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Vencimiento actual: <strong style={{ color: estaExpirado(modalRenovar.fecha_expiracion) ? "#dc2626" : "#374151" }}>
                {modalRenovar.fecha_expiracion ? new Date(modalRenovar.fecha_expiracion).toLocaleDateString("es-PE") : "Sin límite"}
              </strong>
            </div>
          </div>
          <div style={fieldSt}>
            <label style={labelSt}>Días a agregar</label>
            <input style={inputSt} type="number" min={1} value={diasRenovar} onChange={e => setDiasRenovar(Number(e.target.value))} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {[7, 15, 30, 60, 90, 365].map(d => (
              <button key={d} onClick={() => setDiasRenovar(d)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: diasRenovar === d ? "#2563eb" : "#f3f4f6", color: diasRenovar === d ? "#fff" : "#374151" }}>
                {d === 365 ? "1 año" : `${d}d`}
              </button>
            ))}
          </div>
          {(() => {
            const base = modalRenovar.fecha_expiracion && new Date(modalRenovar.fecha_expiracion) > new Date()
              ? new Date(modalRenovar.fecha_expiracion) : new Date();
            const nueva = new Date(base);
            nueva.setDate(nueva.getDate() + Number(diasRenovar));
            return <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", fontWeight: 600, marginBottom: 20 }}>
              Nueva fecha de vencimiento: {nueva.toLocaleDateString("es-PE")}
            </div>;
          })()}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setModalRenovar(null)} style={btnSecondary}>Cancelar</button>
            <button onClick={renovar} style={btnPrimary} disabled={saving}>{saving ? "Renovando..." : "Confirmar renovación"}</button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL SERVIDOR ══ */}
      {modalServidor !== null && (
        <Modal title={modalServidor === "nuevo" ? "Nuevo servidor" : "Editar servidor"} onClose={() => setModalServidor(null)}>
          <div style={fieldSt}><label style={labelSt}>Nombre *</label><input style={inputSt} value={formServidor.nombre} onChange={e => setFormServidor(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: StreamPeru Principal" /></div>
          <div style={fieldSt}><label style={labelSt}>URL del servidor *</label><input style={inputSt} value={formServidor.url} onChange={e => setFormServidor(p => ({ ...p, url: e.target.value }))} placeholder="http://servidor:25461" /></div>
          <div style={fieldSt}><label style={labelSt}>Usuario Xtream (admin)</label><input style={inputSt} value={formServidor.xtream_user} onChange={e => setFormServidor(p => ({ ...p, xtream_user: e.target.value }))} placeholder="admin" /></div>
          <div style={fieldSt}><label style={labelSt}>Contraseña Xtream (admin)</label><input style={inputSt} type="password" value={formServidor.xtream_pass} onChange={e => setFormServidor(p => ({ ...p, xtream_pass: e.target.value }))} placeholder="••••••••" /></div>
          <div style={fieldSt}><label style={labelSt}>Notas</label><textarea style={{ ...inputSt, resize: "vertical", minHeight: 60 }} value={formServidor.notas} onChange={e => setFormServidor(p => ({ ...p, notas: e.target.value }))} /></div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setModalServidor(null)} style={btnSecondary}>Cancelar</button>
            <button onClick={guardarServidor} style={btnPrimary} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL PERFIL ══ */}
      {modalPerfil !== null && (
        <Modal title={modalPerfil === "nuevo" ? "Nuevo perfil" : "Editar perfil"} onClose={() => setModalPerfil(null)}>
          <div style={fieldSt}>
            <label style={labelSt}>Cliente *</label>
            <select style={inputSt} value={formPerfil.client_id} onChange={e => setFormPerfil(p => ({ ...p, client_id: e.target.value }))} disabled={modalPerfil !== "nuevo"}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map(c => {
                const cnt = perfiles.filter(p => p.client_id === c.id).length;
                return <option key={c.id} value={c.id} disabled={modalPerfil === "nuevo" && cnt >= 5}>{c.nombre} ({cnt}/5){modalPerfil === "nuevo" && cnt >= 5 ? " — LLENO" : ""}</option>;
              })}
            </select>
          </div>
          <div style={fieldSt}>
            <label style={labelSt}>Nombre del perfil *</label>
            <input style={inputSt} value={formPerfil.nombre} onChange={e => setFormPerfil(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Mamá, Papá, Niños..." maxLength={20} />
          </div>
          <div style={fieldSt}>
            <label style={labelSt}>Color del avatar</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
              {AVATAR_COLORS.map(color => (
                <div key={color} onClick={() => setFormPerfil(p => ({ ...p, avatar_color: color }))}
                  style={{ width: 34, height: 34, borderRadius: 17, background: color, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: formPerfil.avatar_color === color ? "3px solid #111" : "3px solid transparent", boxSizing: "border-box" }}>
                  {formPerfil.avatar_color === color ? "✓" : ""}
                </div>
              ))}
            </div>
          </div>
          <div style={fieldSt}>
            <label style={labelSt}>PIN de seguridad (4 dígitos, opcional)</label>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...inputSt, paddingRight: 40 }}
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                value={formPerfil.pin}
                onChange={e => setFormPerfil(p => ({ ...p, pin: e.target.value.replace(/\D/g,"").slice(0,4) }))}
                placeholder="Dejar vacío = sin PIN"
                maxLength={4}
              />
              <button onClick={() => setShowPin(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {formPerfil.pin && formPerfil.pin.length !== 4 && (
              <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>Debe tener exactamente 4 dígitos</div>
            )}
          </div>
          {/* Preview */}
          {formPerfil.nombre && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, marginBottom: 16 }}>
              <div style={{ position: "relative" }}>
                <div style={{ width: 44, height: 44, borderRadius: 9, background: formPerfil.avatar_color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#000" }}>
                  {formPerfil.nombre[0].toUpperCase()}
                </div>
                {formPerfil.pin?.length === 4 && (
                  <div style={{ position: "absolute", bottom: -4, right: -4, background: "#374151", borderRadius: 8, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>🔒</div>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{formPerfil.nombre}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{formPerfil.pin?.length === 4 ? "Con PIN activado" : "Sin PIN"}</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setModalPerfil(null)} style={btnSecondary}>Cancelar</button>
            <button onClick={guardarPerfil} style={btnPrimary} disabled={saving}>{saving ? "Guardando..." : modalPerfil === "nuevo" ? "Crear perfil" : "Guardar cambios"}</button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL PAQUETE ══ */}
      {modalPaquete !== null && (
        <Modal title={modalPaquete === "nuevo" ? "Nuevo paquete" : "Editar paquete"} onClose={() => setModalPaquete(null)}>
          <div style={fieldSt}><label style={labelSt}>Nombre *</label><input style={inputSt} value={formPaquete.nombre} onChange={e => setFormPaquete(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Plan Mensual" /></div>
          <div style={fieldSt}><label style={labelSt}>Duración (días)</label><input style={inputSt} type="number" value={formPaquete.duracion_dias} onChange={e => setFormPaquete(p => ({ ...p, duracion_dias: Number(e.target.value) }))} min={1} /></div>
          <div style={fieldSt}><label style={labelSt}>Precio (S/.)</label><input style={inputSt} type="number" value={formPaquete.precio} onChange={e => setFormPaquete(p => ({ ...p, precio: e.target.value }))} placeholder="0.00" min={0} step={0.01} /></div>
          <div style={fieldSt}><label style={labelSt}>Descripción</label><textarea style={{ ...inputSt, resize: "vertical", minHeight: 60 }} value={formPaquete.descripcion} onChange={e => setFormPaquete(p => ({ ...p, descripcion: e.target.value }))} /></div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setModalPaquete(null)} style={btnSecondary}>Cancelar</button>
            <button onClick={guardarPaquete} style={btnPrimary} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
