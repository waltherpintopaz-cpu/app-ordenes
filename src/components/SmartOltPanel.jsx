import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const SMART_OLT_TOKEN = String(import.meta.env.VITE_SMART_OLT_TOKEN || "0cb1ad391ea4458cab6efe97769c761d").trim();

const buildApiUrl = (path = "") => {
  const p = String(path || "");
  if (/^https?:\/\//i.test(p)) return p;
  if (API_BASE_URL) {
    const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const suffix = p.startsWith("/") ? p : `/${p}`;
    return `${base}${suffix}`;
  }
  if (p.startsWith("/api/")) return p;
  if (p.startsWith("/api/smartolt")) {
    return `https://americanet.smartolt.com${p.replace(/^\/api\/smartolt/, "/api")}`;
  }
  return p;
};

const readJsonSafe = async (res, context = "API") => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(`${context} devolvio respuesta no JSON (HTTP ${res.status}). ${preview || "<vacia>"}`);
  }
};

const requestSmartOlt = async ({ path, token, method = "GET", context = "Smart OLT", formData = null }) => {
  const url = buildApiUrl(path);
  const options = {
    method,
    headers: {
      "X-Token": token,
      Accept: "application/json",
    },
  };
  if (formData instanceof FormData) options.body = formData;
  const res = await fetch(url, options);
  const json = await readJsonSafe(res, context);
  return { status: Number(res.status || 0), json };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeSmartOltText = (text = "") =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 @$&()+,/_`.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const baseForm = () => ({
  onuType: "HS8145V",
  onuMode: "Routing",
  userVlanId: "100",
  nombre: "",
  comentario: "",
  onuExternalId: "",
});

export default function SmartOltPanel() {
  const [ponFiltro, setPonFiltro] = useState("TODOS");
  const [oltFiltro, setOltFiltro] = useState("TODOS");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [onus, setOnus] = useState([]);
  const [ultimaActualizacion, setUltimaActualizacion] = useState("");

  const [signalError, setSignalError] = useState("");
  const [signalInfo, setSignalInfo] = useState("");
  const [signalCargando, setSignalCargando] = useState(false);
  const [signalUltimoSn, setSignalUltimoSn] = useState("");
  const [signalDetalle, setSignalDetalle] = useState(null);
  const [eliminandoOnu, setEliminandoOnu] = useState(false);
  const [snConsulta, setSnConsulta] = useState("");

  const [onuSeleccionada, setOnuSeleccionada] = useState(null);
  const [ordenesPendientes, setOrdenesPendientes] = useState([]);
  const [ordenSeleccionadaId, setOrdenSeleccionadaId] = useState("");
  const [form, setForm] = useState(baseForm);
  const [customProfile, setCustomProfile] = useState("Generic_1");
  const [pppoeUser, setPppoeUser] = useState("");
  const [pppoePass, setPppoePass] = useState("");
  const [autorizando, setAutorizando] = useState(false);
  const [cambiandoProfile, setCambiandoProfile] = useState(false);
  const [configurandoPppoe, setConfigurandoPppoe] = useState(false);

  const hasToken = Boolean(SMART_OLT_TOKEN);

  const cargarOrdenesPendientes = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const { data, error: err } = await supabase
        .from("ordenes")
        .select("id,codigo,nombre,dni,direccion,celular,usuario_nodo,password_usuario,sn_onu,estado,fecha_actuacion,fecha_creacion")
        .or("estado.ilike.%pend%,estado.ilike.%proceso%")
        .order("id", { ascending: false })
        .limit(300);
      if (err) throw err;
      setOrdenesPendientes(Array.isArray(data) ? data : []);
    } catch {
      setOrdenesPendientes([]);
    }
  }, []);

  const cargarOnus = useCallback(
    async ({ silent = false } = {}) => {
      if (!hasToken) {
        if (!silent) setError("Token Smart OLT no configurado.");
        return;
      }
      if (!silent) {
        setCargando(true);
        setError("");
        setInfo("");
      }
      try {
        const { status, json } = await requestSmartOlt({
          path: "/api/smartolt/onu/unconfigured_onus",
          token: SMART_OLT_TOKEN,
          context: "Smart OLT unconfigured_onus",
        });
        if (!(status >= 200 && status < 300) || json?.status !== true || !Array.isArray(json?.response)) {
          throw new Error(json?.message || `No se pudo obtener ONUs sin autorizar (HTTP ${status}).`);
        }
        const rows = json.response.map((item, idx) => ({
          idLocal: `${Date.now()}-${idx}`,
          ponType: String(item?.pon_type || "").toUpperCase(),
          board: String(item?.board || ""),
          port: String(item?.port || ""),
          onu: String(item?.onu || ""),
          sn: String(item?.sn || ""),
          onuTypeName: String(item?.onu_type_name || ""),
          oltId: String(item?.olt_id || ""),
        }));
        setOnus(rows);
        setUltimaActualizacion(new Date().toLocaleString());
      } catch (e) {
        setOnus([]);
        if (!silent) setError(String(e?.message || "Error consultando Smart OLT."));
      } finally {
        if (!silent) setCargando(false);
      }
    },
    [hasToken]
  );

  useEffect(() => {
    void cargarOnus();
    void cargarOrdenesPendientes();
  }, [cargarOnus, cargarOrdenesPendientes]);

  useEffect(() => {
    if (!autoRefresh || !hasToken) return undefined;
    const id = setInterval(() => {
      void cargarOnus({ silent: true });
    }, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, hasToken, cargarOnus]);

  const oltsDisponibles = useMemo(
    () => Array.from(new Set(onus.map((o) => String(o.oltId || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [onus]
  );

  const onusFiltradas = useMemo(
    () =>
      onus.filter((item) => {
        if (ponFiltro !== "TODOS" && String(item.ponType || "") !== ponFiltro) return false;
        if (oltFiltro !== "TODOS" && String(item.oltId || "") !== String(oltFiltro)) return false;
        return true;
      }),
    [onus, ponFiltro, oltFiltro]
  );

  const seleccionarOrden = (id) => {
    setOrdenSeleccionadaId(String(id || ""));
    const item = ordenesPendientes.find((o) => String(o.id) === String(id));
    if (!item) return;
    const comentario = [`DNI ${item.dni || "-"}`, `Direccion ${item.direccion || "-"}`, `Celular ${item.celular || "-"}`].join(" / ");
    setForm((prev) => ({
      ...prev,
      nombre: String(item.nombre || "").trim(),
      comentario,
      onuExternalId: String(onuSeleccionada?.sn || prev.onuExternalId || ""),
    }));
    setPppoeUser(String(item.usuario_nodo || "").trim());
    setPppoePass(String(item.password_usuario || "").trim());
  };

  const abrirPreAutorizacion = (onu) => {
    setOnuSeleccionada(onu);
    setOrdenSeleccionadaId("");
    setCustomProfile("Generic_1");
    setPppoeUser("");
    setPppoePass("");
    setForm({
      ...baseForm(),
      onuExternalId: String(onu?.sn || ""),
    });
  };

  const aplicarCustomProfilePorSn = async (sn, profile) => {
    const fd = new FormData();
    fd.append("custom_profile", profile);
    const { status, json } = await requestSmartOlt({
      path: `/api/smartolt/onu/change_custom_profile/${encodeURIComponent(sn)}`,
      method: "POST",
      token: SMART_OLT_TOKEN,
      context: "Smart OLT change_custom_profile",
      formData: fd,
    });
    if (!(status >= 200 && status < 300) || json?.status !== true) {
      throw new Error(json?.message || "No se pudo cambiar custom profile.");
    }
  };

  const aplicarPppoePorSn = async (sn, username, password) => {
    const fd = new FormData();
    fd.append("username", String(username || "").trim());
    fd.append("password", String(password || "").trim());
    const { status, json } = await requestSmartOlt({
      path: `/api/smartolt/onu/set_onu_wan_mode_pppoe/${encodeURIComponent(sn)}`,
      method: "POST",
      token: SMART_OLT_TOKEN,
      context: "Smart OLT set_onu_wan_mode_pppoe",
      formData: fd,
    });
    if (!(status >= 200 && status < 300) || json?.status !== true) {
      throw new Error(json?.message || "No se pudo configurar PPPoE.");
    }
  };

  const verSenalOnu = useCallback(
    async (sn, { silent = false } = {}) => {
      const snLimpio = String(sn || "").trim();
      if (!snLimpio) return null;
      if (!silent) {
        setSignalCargando(true);
        setSignalError("");
        setSignalInfo("");
      }
      try {
        const { status, json } = await requestSmartOlt({
          path: `/api/smartolt/onu/get_onu_full_status_info/${encodeURIComponent(snLimpio)}`,
          token: SMART_OLT_TOKEN,
          context: "Smart OLT get_onu_full_status_info",
        });
        if (!(status >= 200 && status < 300) || json?.status !== true) {
          throw new Error(json?.message || "No se pudo consultar la señal.");
        }
        const base =
          (json?.full_status_json && typeof json.full_status_json === "object" ? json.full_status_json : null) ||
          (json?.response?.full_status_json && typeof json.response.full_status_json === "object" ? json.response.full_status_json : null) ||
          (Array.isArray(json?.response) ? json.response[0] : null) ||
          (json?.response && typeof json.response === "object" ? json.response : null) ||
          json;
        if (!base || typeof base !== "object") throw new Error("Respuesta sin datos para la ONU.");
        const rx = base?.["Optical status"]?.["Rx optical power(dBm)"] || base?.["Rx optical power(dBm)"] || "-";
        const oltRx = base?.["Optical status"]?.["OLT Rx ONT optical power(dBm)"] || base?.["OLT Rx ONT optical power(dBm)"] || "-";
        const detalle = {
          sn: String(base?.sn || snLimpio),
          estado: String(json?.response_code || base?.status || base?.onu_status || "-"),
          rxOnuDbm: String(rx || "-"),
          oltRxOntDbm: String(oltRx || "-"),
          fechaConsulta: new Date().toLocaleString(),
        };
        setSignalUltimoSn(detalle.sn);
        setSignalDetalle(detalle);
        return detalle;
      } catch (e) {
        if (!silent) {
          setSignalError(String(e?.message || "Error consultando señal."));
          setSignalDetalle(null);
        }
        return null;
      } finally {
        if (!silent) setSignalCargando(false);
      }
    },
    []
  );

  const esperarSenal = async (sn, intentos = 6, esperaMs = 5000) => {
    for (let i = 0; i < intentos; i += 1) {
      await wait(esperaMs);
      const detalle = await verSenalOnu(sn, { silent: true });
      if (detalle) return detalle;
    }
    return null;
  };

  const autorizarOnu = async () => {
    if (!hasToken) {
      setError("Token Smart OLT no configurado.");
      return;
    }
    if (!onuSeleccionada) {
      setError("Selecciona una ONU para autorizar.");
      return;
    }
    if (!String(ordenSeleccionadaId || "").trim()) {
      setError("Selecciona una orden para copiar el SN autorizado.");
      return;
    }

    const sn = String(onuSeleccionada.sn || "").trim();
    const esMst = sn.toUpperCase().startsWith("MST");
    const esHwt = sn.toUpperCase().startsWith("HWT");
    const vlan = String(form.userVlanId || "").split("-")[0].trim() || "100";

    const fd = new FormData();
    fd.append("olt_id", String(onuSeleccionada.oltId || ""));
    const ponType = String(onuSeleccionada.ponType || "").toLowerCase();
    fd.append("pon_type", ponType);
    fd.append("gpon_channel", ponType === "epon" ? "epon" : "gpon");
    fd.append("board", String(onuSeleccionada.board || ""));
    fd.append("port", String(onuSeleccionada.port || ""));
    fd.append("sn", sn);
    fd.append("vlan", vlan);
    fd.append("onu_type", String(form.onuType || "HS8145V"));
    fd.append("zone", "Zone 1");
    fd.append("name", sanitizeSmartOltText(form.nombre || ""));
    fd.append("address_or_comment", sanitizeSmartOltText(form.comentario || ""));
    fd.append("onu_mode", String(form.onuMode || "Routing"));
    fd.append("onu_external_id", sanitizeSmartOltText(form.onuExternalId || ""));

    setAutorizando(true);
    setError("");
    setSignalInfo("");
    try {
      const { status, json } = await requestSmartOlt({
        path: "/api/smartolt/onu/authorize_onu",
        method: "POST",
        token: SMART_OLT_TOKEN,
        context: "Smart OLT authorize_onu",
        formData: fd,
      });
      if (!(status >= 200 && status < 300) || json?.status !== true) {
        throw new Error(json?.message || "No se pudo autorizar la ONU.");
      }

      let pppoeAplicado = false;
      if (esHwt && pppoeUser.trim() && pppoePass.trim()) {
        if (window.confirm(`ONU ${sn} autorizada. ¿Aplicar PPPoE en 8 segundos?`)) {
          await wait(8000);
          await aplicarPppoePorSn(sn, pppoeUser, pppoePass);
          pppoeAplicado = true;
        }
      }

      if (esMst) {
        const profile = sanitizeSmartOltText(customProfile || "Generic_1") || "Generic_1";
        if (window.confirm(`¿Aplicar custom profile "${profile}" a ${sn} en 8 segundos?`)) {
          await wait(8000);
          await aplicarCustomProfilePorSn(sn, profile);
        }
      }

      const ordenIdActual = String(ordenSeleccionadaId || "").trim();
      const ordenSeleccionada = ordenesPendientes.find((x) => String(x?.id) === ordenIdActual) || null;
      const codigoOrdenSeleccionada = String(ordenSeleccionada?.codigo || "").trim();
      setOnuSeleccionada(null);
      setOrdenSeleccionadaId("");
      let snOrdenMensaje = "";
      if (ordenIdActual && isSupabaseConfigured) {
        let updSnErr = null;
        const updById = await supabase.from("ordenes").update({ sn_onu: sn }).eq("id", ordenIdActual);
        updSnErr = updById.error || null;

        if (updSnErr && codigoOrdenSeleccionada) {
          const updByCode = await supabase.from("ordenes").update({ sn_onu: sn }).eq("codigo", codigoOrdenSeleccionada);
          updSnErr = updByCode.error || null;
        }

        if (updSnErr) {
          snOrdenMensaje = ` No se pudo guardar SN en la orden: ${updSnErr.message || "error"}.`;
          setError(snOrdenMensaje.trim());
        } else {
          snOrdenMensaje = " SN guardado en la orden seleccionada.";
          setOrdenesPendientes((prev) =>
            prev.map((item) => (String(item.id) === ordenIdActual ? { ...item, sn_onu: sn } : item))
          );
        }
      }

      await cargarOnus({ silent: true });
      setSignalInfo(`ONU ${sn} autorizada${pppoeAplicado ? " y PPPoE aplicado" : ""}.${snOrdenMensaje} Consultando señal...`);
      let detalle = await verSenalOnu(sn);
      if (!detalle) {
        setSignalInfo(`ONU ${sn} autorizada. Esperando telemetría de potencia...`);
        detalle = await esperarSenal(sn, 8, 4000);
      }
      if (detalle) {
        setSignalInfo(`Señal detectada: ${detalle.rxOnuDbm} / ${detalle.oltRxOntDbm}.`);
      } else {
        setSignalInfo(`ONU ${sn} autorizada. Aún sin lectura de señal, intenta refrescar luego.`);
      }
      window.alert("ONU autorizada correctamente.");
    } catch (e) {
      setError(String(e?.message || "Error autorizando ONU."));
    } finally {
      setAutorizando(false);
    }
  };

  const configurarPppoeManual = async () => {
    const sn = String(onuSeleccionada?.sn || "").trim();
    if (!sn.toUpperCase().startsWith("HWT")) {
      setError("PPPoE manual aplica solo para SN HWT.");
      return;
    }
    if (!pppoeUser.trim() || !pppoePass.trim()) {
      setError("Completa usuario y clave PPPoE.");
      return;
    }
    if (!window.confirm(`¿Configurar PPPoE en ${sn}?`)) return;
    setConfigurandoPppoe(true);
    setError("");
    try {
      await aplicarPppoePorSn(sn, pppoeUser, pppoePass);
      window.alert(`PPPoE aplicado en ${sn}.`);
    } catch (e) {
      setError(String(e?.message || "Error configurando PPPoE."));
    } finally {
      setConfigurandoPppoe(false);
    }
  };

  const cambiarProfileManual = async () => {
    const sn = String(onuSeleccionada?.sn || "").trim();
    if (!sn.toUpperCase().startsWith("MST")) {
      setError("Custom profile manual aplica solo para SN MST.");
      return;
    }
    const profile = sanitizeSmartOltText(customProfile || "Generic_1") || "Generic_1";
    if (!window.confirm(`¿Cambiar custom profile a "${profile}" en ${sn}?`)) return;
    setCambiandoProfile(true);
    setError("");
    try {
      await aplicarCustomProfilePorSn(sn, profile);
      window.alert(`Custom profile aplicado en ${sn}.`);
    } catch (e) {
      setError(String(e?.message || "Error cambiando custom profile."));
    } finally {
      setCambiandoProfile(false);
    }
  };

  const eliminarOnuPorSn = async (snInput) => {
    const sn = String(snInput || "").trim();
    if (!hasToken) {
      setError("Token Smart OLT no configurado.");
      return;
    }
    if (!sn) {
      setError("No hay SN para eliminar ONU.");
      return;
    }
    if (!window.confirm(`¿Eliminar ONU ${sn}? Esta acción no se puede deshacer.`)) return;

    setEliminandoOnu(true);
    setError("");
    try {
      const { status, json } = await requestSmartOlt({
        path: `/api/smartolt/onu/delete/${encodeURIComponent(sn)}`,
        method: "POST",
        token: SMART_OLT_TOKEN,
        context: "Smart OLT delete_onu",
      });
      if (!(status >= 200 && status < 300) || json?.status !== true) {
        throw new Error(json?.message || json?.response || `No se pudo eliminar ONU (HTTP ${status}).`);
      }
      if (String(onuSeleccionada?.sn || "").trim() === sn) {
        setOnuSeleccionada(null);
        setOrdenSeleccionadaId("");
      }
      setSignalDetalle(null);
      setSignalUltimoSn("");
      setSignalInfo(`ONU ${sn} eliminada.`);
      await cargarOnus({ silent: true });
      window.alert("ONU eliminada correctamente.");
    } catch (e) {
      setError(String(e?.message || "Error eliminando ONU."));
    } finally {
      setEliminandoOnu(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    const snPrefill = String(params.get("prefillSn") || "").trim();
    if (!snPrefill) return;
    setSnConsulta(snPrefill);
    setSignalInfo(`Consultando señal de ${snPrefill}...`);
    setSignalError("");
    void verSenalOnu(snPrefill);
  }, [verSenalOnu]);

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div style={{ border: "1px solid #dbe4ef", borderRadius: "14px", background: "#fff", padding: "16px" }}>
        <h2 style={{ margin: 0, fontSize: "24px", color: "#183b62" }}>Smart OLT</h2>
        <p style={{ margin: "8px 0 0", color: "#64748b" }}>ONUs sin autorizar, preautorización y diagnóstico de señal.</p>
      </div>

      <div style={{ border: "1px solid #dbe4ef", borderRadius: "14px", background: "#fff", padding: "16px", display: "grid", gap: "10px" }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontWeight: 700 }}>OLT:</label>
          <select value={oltFiltro} onChange={(e) => setOltFiltro(e.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "8px 10px" }}>
            <option value="TODOS">Todos</option>
            {oltsDisponibles.map((olt) => (
              <option key={olt} value={olt}>{olt}</option>
            ))}
          </select>
          <label style={{ fontWeight: 700 }}>PON:</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {["TODOS", "GPON", "EPON"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPonFiltro(v)}
                style={{
                  border: ponFiltro === v ? "none" : "1px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "8px 10px",
                  background: ponFiltro === v ? "#1d4ed8" : "#fff",
                  color: ponFiltro === v ? "#fff" : "#334155",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {v === "TODOS" ? "Any" : v}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void cargarOnus()}
            disabled={cargando}
            style={{ border: "none", borderRadius: "10px", background: "#ea580c", color: "#fff", padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}
          >
            {cargando ? "Cargando..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setAutoRefresh((p) => !p)}
            style={{
              border: autoRefresh ? "none" : "1px solid #cbd5e1",
              borderRadius: "10px",
              background: autoRefresh ? "#1d4ed8" : "#fff",
              color: autoRefresh ? "#fff" : "#334155",
              padding: "9px 12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {autoRefresh ? "Auto refresh: ON" : "Auto refresh: OFF"}
          </button>
        </div>

        <div style={{ color: "#64748b", fontSize: "13px" }}>Última actualización: {ultimaActualizacion || "-"}</div>
        {error ? <div style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div> : null}
        {signalError ? <div style={{ color: "#b91c1c", fontWeight: 700 }}>{signalError}</div> : null}
        {info ? <div style={{ color: "#065f46", fontWeight: 700 }}>{info}</div> : null}
        {signalInfo ? <div style={{ color: "#0f766e", fontWeight: 700 }}>{signalInfo}</div> : null}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={snConsulta}
            onChange={(e) => setSnConsulta(e.target.value)}
            placeholder="SN para consultar señal"
            style={{ minWidth: "260px", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px" }}
          />
          <button
            type="button"
            onClick={() => void verSenalOnu(snConsulta)}
            disabled={signalCargando}
            style={{ border: "1px solid #93c5fd", borderRadius: "10px", background: "#eff6ff", color: "#1e40af", padding: "10px 12px", fontWeight: 700, cursor: "pointer" }}
          >
            {signalCargando ? "Consultando..." : "Ver señal"}
          </button>
          <button
            type="button"
            onClick={() => void eliminarOnuPorSn(snConsulta || signalUltimoSn)}
            disabled={eliminandoOnu}
            style={{ border: "1px solid #f2b3a6", borderRadius: "10px", background: "#fdecec", color: "#cc4a00", padding: "10px 12px", fontWeight: 700, cursor: "pointer" }}
          >
            {eliminandoOnu ? "Eliminando..." : "Eliminar ONU"}
          </button>
        </div>
      </div>

      {signalDetalle ? (
        <div style={{ border: "1px solid #dbe4ef", borderRadius: "14px", background: "#fff", padding: "16px" }}>
          <div style={{ fontWeight: 800, color: "#1e3a8a" }}>Estado ONU: {signalDetalle.sn}</div>
          <div style={{ marginTop: "6px", color: "#334155" }}>Estado: {signalDetalle.estado}</div>
          <div style={{ marginTop: "4px", color: "#334155" }}>Señal: {signalDetalle.rxOnuDbm} / {signalDetalle.oltRxOntDbm}</div>
          <div style={{ marginTop: "4px", color: "#64748b", fontSize: "13px" }}>Consulta: {signalDetalle.fechaConsulta}</div>
        </div>
      ) : null}

      <div style={{ border: "1px solid #dbe4ef", borderRadius: "14px", background: "#fff", padding: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "18px", color: "#1f2937" }}>ONUs detectadas ({onusFiltradas.length})</h3>
        {onusFiltradas.length === 0 ? (
          <p style={{ marginTop: "10px", color: "#64748b" }}>No hay ONUs sin autorizar para los filtros seleccionados.</p>
        ) : (
          <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
            {onusFiltradas.map((item) => (
              <div key={item.idLocal} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px", background: "#f8fafc" }}>
                <div style={{ fontWeight: 800, color: "#1e3a8a" }}>{item.sn || "-"}</div>
                <div style={{ marginTop: "2px", color: "#475569", fontSize: "13px" }}>
                  {item.ponType || "-"} | Board {item.board || "-"} | Port {item.port || "-"} | ONU {item.onu || "-"}
                </div>
                <div style={{ marginTop: "2px", color: "#64748b", fontSize: "13px" }}>Type: {item.onuTypeName || "-"} | OLT: {item.oltId || "-"}</div>
                <button
                  type="button"
                  onClick={() => abrirPreAutorizacion(item)}
                  style={{ marginTop: "8px", border: "none", borderRadius: "8px", background: "#1d4ed8", color: "#fff", padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}
                >
                  Pre-autorizar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {onuSeleccionada ? (
        <div style={{ border: "1px solid #dbe4ef", borderRadius: "14px", background: "#fff", padding: "16px", display: "grid", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "18px", color: "#1f2937" }}>Pre-autorización ONU</h3>
            <button type="button" onClick={() => setOnuSeleccionada(null)} style={{ border: "1px solid #cbd5e1", borderRadius: "8px", background: "#fff", color: "#334155", padding: "7px 10px", fontWeight: 700, cursor: "pointer" }}>
              Cerrar
            </button>
          </div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>OLT: {onuSeleccionada.oltId || "-"} · PON: {onuSeleccionada.ponType || "-"} · Board/Port/ONU: {onuSeleccionada.board || "-"} / {onuSeleccionada.port || "-"} / {onuSeleccionada.onu || "-"}</div>
          <div style={{ color: "#1e3a8a", fontWeight: 800 }}>SN: {onuSeleccionada.sn || "-"}</div>

          <label style={{ fontWeight: 700 }}>Orden/cliente</label>
          <select
            value={ordenSeleccionadaId}
            onChange={(e) => seleccionarOrden(e.target.value)}
            style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px" }}
          >
            <option value="">Seleccionar orden</option>
            {ordenesPendientes.map((item) => (
              <option key={String(item.id)} value={String(item.id)}>
                {item.codigo || "SIN-CODIGO"} | {item.nombre || "-"} | DNI {item.dni || "-"}
              </option>
            ))}
          </select>
          <div style={{ color: "#64748b", fontSize: "13px" }}>Obligatorio: la orden seleccionada recibirá el SN al autorizar.</div>

          <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <input value={form.userVlanId} onChange={(e) => setForm((p) => ({ ...p, userVlanId: e.target.value }))} placeholder="User VLAN-ID" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px" }} />
            <input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Name" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px" }} />
            <input value={form.onuExternalId} onChange={(e) => setForm((p) => ({ ...p, onuExternalId: e.target.value }))} placeholder="ONU external ID" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px" }} />
            <input value={form.comentario} onChange={(e) => setForm((p) => ({ ...p, comentario: e.target.value }))} placeholder="Address or comment" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px" }} />
          </div>

          {String(onuSeleccionada.sn || "").toUpperCase().startsWith("MST") ? (
            <div style={{ border: "1px solid #f59e0b", background: "#fff8e1", borderRadius: "10px", padding: "10px", display: "grid", gap: "8px" }}>
              <div style={{ color: "#a44a00", fontWeight: 700 }}>SN MST detectado</div>
              <div style={{ color: "#64748b", fontSize: "13px" }}>Recomendado: aplicar custom profile antes o después de autorizar.</div>
              <input value={customProfile} onChange={(e) => setCustomProfile(e.target.value)} placeholder="Generic_1" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px", background: "#fff" }} />
              <button type="button" onClick={() => void cambiarProfileManual()} disabled={cambiandoProfile} style={{ border: "none", borderRadius: "8px", background: "#f59e0b", color: "#fff", padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>
                {cambiandoProfile ? "Aplicando..." : "Aplicar custom profile"}
              </button>
            </div>
          ) : null}

          {String(onuSeleccionada.sn || "").toUpperCase().startsWith("HWT") ? (
            <div style={{ border: "1px solid #0ea5e9", background: "#f3f7ff", borderRadius: "10px", padding: "10px", display: "grid", gap: "8px" }}>
              <div style={{ color: "#0c4a6e", fontWeight: 700 }}>PPPoE para ONU HWT</div>
              <input value={pppoeUser} onChange={(e) => setPppoeUser(e.target.value)} placeholder="Usuario PPPoE" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px", background: "#fff" }} />
              <input value={pppoePass} onChange={(e) => setPppoePass(e.target.value)} placeholder="Clave PPPoE" style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px", background: "#fff" }} />
              <button type="button" onClick={() => void configurarPppoeManual()} disabled={configurandoPppoe} style={{ border: "none", borderRadius: "8px", background: "#1d4ed8", color: "#fff", padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>
                {configurandoPppoe ? "Aplicando PPPoE..." : "Aplicar PPPoE ahora"}
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void autorizarOnu()}
            disabled={autorizando}
            style={{ border: "none", borderRadius: "10px", background: "#00c853", color: "#fff", padding: "12px 16px", fontWeight: 800, cursor: "pointer" }}
          >
            {autorizando ? "Autorizando..." : "Autorizar ONU"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
