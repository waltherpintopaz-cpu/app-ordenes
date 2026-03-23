import { useMemo, useState } from "react";

const MIKROWISP_PROXY_ENDPOINT = "/api/mikrowisp/GetClientsDetails";
const MIKROWISP_DIRECT_ENDPOINT = "https://americanet.club/api/v1/GetClientsDetails";
const MIKROWISP_TOKEN = "LzNXSERnUHBMMS91b0NzUGFTVkFkZz09";
const APPSHEET_APP_ID = String(import.meta.env.VITE_APPSHEET_APP_ID || "504a02bb-0bfc-4894-a2d5-740a254a9df7").trim();
const APPSHEET_ACCESS_KEY = String(import.meta.env.VITE_APPSHEET_ACCESS_KEY || "V2-xKNZN-l65EA-sTLkd-KjoGY-j06T1-BEN6Z-MbXZW-MfiQq").trim();
const APPSHEET_APP_NAME = String(import.meta.env.VITE_APPSHEET_APP_NAME || "Actuaciones02-637142196").trim();
const APPSHEET_TABLE_NAME = String(import.meta.env.VITE_APPSHEET_TABLE_NAME || "Liquidaciones").trim();

const obtenerValorApiCliente = (obj, keys = []) => {
  if (!obj || typeof obj !== "object") return "";
  for (const key of keys) {
    const val = obj?.[key];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return "";
};

const buscarValorApiRecursivo = (root, keys = []) => {
  if (!root || typeof root !== "object") return "";
  const clavesNorm = keys.map((k) => String(k || "").toLowerCase());
  const queue = [root];
  while (queue.length > 0) {
    const actual = queue.shift();
    if (!actual || typeof actual !== "object") continue;
    const entries = Object.entries(actual);
    for (const [key, value] of entries) {
      const keyNorm = String(key || "").toLowerCase();
      if (clavesNorm.includes(keyNorm) && value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
    for (const [, value] of entries) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return "";
};

const construirUrlArchivoAppSheet = (ruta = "") => {
  const filePath = String(ruta || "").trim().replace(/\\/g, "/");
  if (!filePath) return "";
  if (/^https?:\/\//i.test(filePath)) return filePath;
  if (/^(data:image\/|blob:)/i.test(filePath)) return filePath;
  return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(
    APPSHEET_APP_NAME
  )}&tableName=${encodeURIComponent(APPSHEET_TABLE_NAME)}&fileName=${encodeURIComponent(filePath)}`;
};

const normalizarUrlFoto = (valor = "") => {
  const raw = String(valor || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(data:image\/|blob:)/i.test(raw)) return raw;
  const saneado = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
  const sinPrefijoTabla = saneado.replace(/^[^/:\n]+::/, "");
  const pareceRutaArchivo =
    sinPrefijoTabla.includes("/") ||
    /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|svg|avif)$/i.test(sinPrefijoTabla);
  return pareceRutaArchivo ? construirUrlArchivoAppSheet(sinPrefijoTabla) : raw;
};

const valorPlano = (value, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const extraerFotosAppSheet = (fila = {}) => {
  const columnasFoto = [
    "Foto fachada",
    "Foto Opcional",
    "IMG Pago",
    "IMG ONU",
    "IMG Fachada",
    "IMG otros",
    "Foto Onu",
    "Photo Caj",
    "Photo Onu",
    "Photo Caja Post",
    "Captura de pago",
    "FirmaCliente",
    "FirmaEMP",
    "ArchivoContrato",
    "EnlacePDF",
  ];
  return columnasFoto
    .map((col) => ({ campo: col, ruta: String(fila?.[col] || "").trim() }))
    .filter((f) => Boolean(f.ruta))
    .map((f) => ({ ...f, url: normalizarUrlFoto(f.ruta) }))
    .filter((f) => Boolean(f.url));
};

const parseCoords = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
};

const construirMapaEstaticoUrl = (coords) => {
  if (!Array.isArray(coords) || coords.length !== 2) return "";
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(
    `${lat},${lng}`
  )}&zoom=16&size=640x320&markers=${encodeURIComponent(`${lat},${lng},red-pushpin`)}`;
};

const construirMapaGoogleStaticUrl = (coords) => {
  if (!Array.isArray(coords) || coords.length !== 2) return "";
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(
    `${lat},${lng}`
  )}&zoom=16&size=640x320&markers=${encodeURIComponent(`color:red|${lat},${lng}`)}`;
};

const construirMapaYandexStaticUrl = (coords) => {
  if (!Array.isArray(coords) || coords.length !== 2) return "";
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  return `https://static-maps.yandex.ru/1.x/?lang=es_ES&ll=${encodeURIComponent(
    `${lng},${lat}`
  )}&z=16&size=650,320&l=map&pt=${encodeURIComponent(`${lng},${lat},pm2rdm`)}`;
};

const construirMapaOsmExportUrl = (coords) => {
  if (!Array.isArray(coords) || coords.length !== 2) return "";
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  const delta = 0.0035;
  const left = (lng - delta).toFixed(6);
  const bottom = (lat - delta).toFixed(6);
  const right = (lng + delta).toFixed(6);
  const top = (lat + delta).toFixed(6);
  return `https://render.openstreetmap.org/cgi-bin/export?bbox=${left},${bottom},${right},${top}&format=png`;
};

const construirMapaOsmTileUrl = (coords, zoom = 16) => {
  if (!Array.isArray(coords) || coords.length !== 2) return "";
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
};

const obtenerMapasCandidatos = (coords) => {
  const candidatos = [
    construirMapaEstaticoUrl(coords),
    construirMapaGoogleStaticUrl(coords),
    construirMapaYandexStaticUrl(coords),
    construirMapaOsmExportUrl(coords),
    construirMapaOsmTileUrl(coords, 16),
  ].filter(Boolean);
  return Array.from(new Set(candidatos));
};

function MapPreviewInner({ coords, className = "", onOpenMap, sources = [] }) {
  const [idxSource, setIdxSource] = useState(0);
  const [loadingMap, setLoadingMap] = useState(true);
  const source = sources[idxSource] || "";
  if (!source) {
    return (
      <div className={`api-map-fallback ${className}`}>
        <p>Vista previa no disponible.</p>
        <small>{Array.isArray(coords) ? `${coords[0]}, ${coords[1]}` : ""}</small>
      </div>
    );
  }
  return (
    <button type="button" className={`api-map-preview ${className}`.trim()} onClick={onOpenMap} title="Abrir en Google Maps">
      <img
        src={source}
        alt="Mapa de ubicacion"
        onLoadStart={() => setLoadingMap(true)}
        onLoad={() => setLoadingMap(false)}
        onError={() => {
          if (idxSource < sources.length - 1) {
            setIdxSource((prev) => prev + 1);
            setLoadingMap(true);
            return;
          }
          setIdxSource(sources.length);
          setLoadingMap(false);
        }}
      />
      {loadingMap ? <span className="api-map-loading">Cargando...</span> : null}
    </button>
  );
}

function MapPreview({ coords, className = "", onOpenMap }) {
  const coordsKey = Array.isArray(coords) ? `${coords[0] ?? ""}:${coords[1] ?? ""}` : "sin-coords";
  const sources = obtenerMapasCandidatos(coords);
  return <MapPreviewInner key={coordsKey} coords={coords} className={className} onOpenMap={onOpenMap} sources={sources} />;
}

export default function ConsultaApiPanel() {
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAppSheet, setLoadingAppSheet] = useState(false);
  const [error, setError] = useState("");
  const [errorAppSheet, setErrorAppSheet] = useState("");
  const [resultado, setResultado] = useState(null);
  const [resultadoAppSheet, setResultadoAppSheet] = useState([]);
  const [fotoActiva, setFotoActiva] = useState(null);
  const mikrowispEndpoints = useMemo(() => {
    if (import.meta.env.DEV) return [MIKROWISP_PROXY_ENDPOINT, MIKROWISP_DIRECT_ENDPOINT];
    return [MIKROWISP_DIRECT_ENDPOINT, MIKROWISP_PROXY_ENDPOINT];
  }, []);

  const normalizarRespuestaHistoricoAppSheet = (body, dniParam) => {
    const filas = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.Rows)
        ? body.Rows
        : Array.isArray(body?.rows)
          ? body.rows
          : Array.isArray(body?.data)
            ? body.data
            : Array.isArray(body)
              ? body
              : [];

    return filas.map((fila, idx) => ({
      id: String(fila?.id || fila?.ID || fila?.["_RowNumber"] || `${dniParam}-${idx}`),
      fecha: String(fila?.Fecha || fila?.Fecha2 || "-"),
      tipoActuacion: String(fila?.["Tipo de actuacion"] || fila?.Actuacion || "-"),
      nombre: String(fila?.Nombre || "-"),
      dni: String(fila?.DNI || dniParam || "-"),
      direccion: String(fila?.Direccion || "-"),
      celular: String(fila?.Celular || "-"),
      tecnico: String(fila?.["Personal Tecnico"] || fila?.Luis || fila?.Cuadrilla || "-"),
      estado: String(fila?.Estado || "-"),
      userPppoe: String(fila?.UserPPoe || "-"),
      ubicacionGps: String(fila?.["Ubicacion GPS"] || fila?.Ubicacion || "-"),
      codigoEtiqueta: String(fila?.["Cable RG6"] || fila?.codigo_etiqueta || fila?.Etiqueta || "-"),
      observacion: String(fila?.Observacion || "-"),
      fotos: extraerFotosAppSheet(fila),
    }));
  };

  const clasificarEstadoActual = (estadoServicio = "", estadoUsuario = "") => {
    const txt = `${estadoServicio || ""} ${estadoUsuario || ""}`.toLowerCase();
    if (txt.includes("activo") || txt.includes("active")) return "ACTIVO";
    if (txt.includes("suspend") || txt.includes("cort") || txt.includes("mora") || txt.includes("bloq")) return "SUSPENDIDO";
    if (!txt.trim() || txt === "- -") return "DESCONOCIDO";
    return "INACTIVO";
  };

  const extraerResultadoMikrowisp = (json = {}, dniLimpio = "") => {
    const dataBase = json?.data || json?.datos || json?.client || json?.cliente || json || {};
    const data = Array.isArray(dataBase) && dataBase.length > 0 ? dataBase[0] : dataBase;
    const primerServicio = Array.isArray(data?.servicios) && data.servicios.length > 0 ? data.servicios[0] : null;
    const facturacionObj = data?.facturacion && typeof data.facturacion === "object" ? data.facturacion : null;
    const nombre = buscarValorApiRecursivo(data, ["name", "nombre", "client_name", "fullname", "full_name"]);
    const cedula = buscarValorApiRecursivo(data, ["cedula", "dni", "document", "documento"]) || dniLimpio;
    const direccion = buscarValorApiRecursivo(data, ["address", "direccion", "dir", "direccion_principal"]);
    const movil = buscarValorApiRecursivo(data, ["movil", "mobile", "celular"]);
    const usuarioPppoe = buscarValorApiRecursivo(primerServicio || data, [
      "pppuser",
      "pppoe",
      "pppoe_user",
      "usuario_pppoe",
      "usuario",
      "user",
      "username",
    ]);
    const clavePppoe = buscarValorApiRecursivo(primerServicio || data, ["ppppass", "pppoe_pass", "password", "clave", "pass"]);
    const lat = buscarValorApiRecursivo(data, ["lat", "latitude", "y", "coord_y", "coordenada_y"]);
    const lng = buscarValorApiRecursivo(data, ["lng", "longitude", "x", "coord_x", "coordenada_x"]);
    const coordenadas = lat || lng ? `${lat || "-"}, ${lng || "-"}` : buscarValorApiRecursivo(data, ["coordinates", "coordenadas", "ubicacion", "ubicacion_gps"]);
    const codigoEtiqueta = buscarValorApiRecursivo(data, ["codigo_etiqueta", "codigoetiqueta", "etiqueta", "cable_rg6", "cod_rg6"]);
    const deuda = buscarValorApiRecursivo(data, ["debt", "deuda", "balance", "saldo"]);
    const direccionPrincipal = obtenerValorApiCliente(data, ["direccion_principal"]) || direccion;
    const instalado = buscarValorApiRecursivo(primerServicio || data, ["instalado", "fecha_instalacion"]);
    const ipServicio = buscarValorApiRecursivo(primerServicio || data, ["ip"]);
    const macServicio = buscarValorApiRecursivo(primerServicio || data, ["mac"]);
    const perfilServicio = buscarValorApiRecursivo(primerServicio || data, ["perfil", "plan"]);
    const tipoServicio = buscarValorApiRecursivo(primerServicio || data, ["tiposervicio", "tipo_servicio", "servicio"]);
    const estadoUsuario = buscarValorApiRecursivo(primerServicio || data, ["status_user", "estado_usuario", "user_status"]);
    const facturasNoPagadas =
      obtenerValorApiCliente(facturacionObj || {}, ["facturas_nopagadas", "facturasNoPagadas", "unpaid_invoices"]) ||
      buscarValorApiRecursivo(data, ["facturas_nopagadas", "unpaid_invoices"]);
    const totalFacturas =
      obtenerValorApiCliente(facturacionObj || {}, ["total_facturas", "totalFacturas", "monto_total"]) ||
      buscarValorApiRecursivo(data, ["total_facturas", "monto_total"]);
    const estadoServicio =
      obtenerValorApiCliente(data, ["estado", "status", "service_status", "state"]) ||
      buscarValorApiRecursivo(data, ["estado", "status", "service_status", "state"]);
    const estadoApi = obtenerValorApiCliente(json, ["status", "estado", "message", "msg"]) || (json?.success === true ? "success" : "");
    return {
      nombre: valorPlano(nombre),
      cedula: valorPlano(cedula || dniLimpio),
      movil: valorPlano(movil),
      direccion: valorPlano(direccion),
      direccionPrincipal: valorPlano(direccionPrincipal),
      usuarioPppoe: valorPlano(usuarioPppoe),
      clavePppoe: valorPlano(clavePppoe),
      instalado: valorPlano(instalado),
      ipServicio: valorPlano(ipServicio),
      macServicio: valorPlano(macServicio),
      perfilServicio: valorPlano(perfilServicio),
      tipoServicio: valorPlano(tipoServicio),
      estadoUsuario: valorPlano(estadoUsuario),
      facturasNoPagadas: valorPlano(facturasNoPagadas),
      totalFacturas: valorPlano(totalFacturas),
      coordenadas: valorPlano(coordenadas),
      codigoEtiqueta: valorPlano(codigoEtiqueta),
      deuda: valorPlano(deuda),
      estadoServicio: valorPlano(estadoServicio),
      estadoApi: valorPlano(estadoApi),
    };
  };

  const consultarMikrowispPorDni = async (dniLimpio = "") => {
    let json = null;
    let ultimoError = "";
    for (const endpoint of mikrowispEndpoints) {
      if (json) break;
      try {
        const resJson = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: MIKROWISP_TOKEN,
          },
          body: JSON.stringify({
            token: MIKROWISP_TOKEN,
            cedula: dniLimpio,
          }),
        });
        const body = await resJson.json();
        if (resJson.ok && body && body.success !== false) {
          json = body;
          break;
        }
        ultimoError = obtenerValorApiCliente(body, ["message", "error", "msg"]) || "Respuesta invalida del API.";
      } catch (e) {
        ultimoError = e?.message || "Fallo en envio JSON.";
      }
      if (json) break;
      try {
        const payload = new URLSearchParams();
        payload.append("token", MIKROWISP_TOKEN);
        payload.append("cedula", dniLimpio);
        const resForm = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            token: MIKROWISP_TOKEN,
          },
          body: payload.toString(),
        });
        const body = await resForm.json();
        if (resForm.ok && body && body.success !== false) {
          json = body;
          break;
        }
        ultimoError = obtenerValorApiCliente(body, ["message", "error", "msg"]) || "No se pudo consultar el cliente.";
      } catch (e) {
        ultimoError = e?.message || "Fallo en envio formulario.";
      }
    }
    if (!json) throw new Error(ultimoError || "No se pudo consultar Mikrowisp.");
    const parsed = extraerResultadoMikrowisp(json, dniLimpio);
    return parsed;
  };

  const abrirMapaEnGoogle = (coords) => {
    if (!Array.isArray(coords) || coords.length !== 2) return;
    const query = `${coords[0]},${coords[1]}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const consultarAppSheet = async () => {
    const dniLimpio = String(dni || "").trim();
    if (!dniLimpio) {
      setErrorAppSheet("Ingresa el DNI para consultar AppSheet.");
      setResultadoAppSheet([]);
      return;
    }
    setLoadingAppSheet(true);
    setErrorAppSheet("");
    setResultadoAppSheet([]);
    try {
      const appsheetUrl = `https://www.appsheet.com/api/v2/apps/${encodeURIComponent(
        APPSHEET_APP_ID
      )}/tables/${encodeURIComponent(APPSHEET_TABLE_NAME)}/Action`;
      const payload = {
        Action: "Find",
        Properties: {
          Locale: "es-PE",
          Timezone: "America/Lima",
          Selector: `Filter(${APPSHEET_TABLE_NAME}, [DNI] = "${dniLimpio}")`,
        },
        Rows: [],
      };
      const res = await fetch(appsheetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ApplicationAccessKey: APPSHEET_ACCESS_KEY,
        },
        body: JSON.stringify(payload),
      });
      let body = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Consulta AppSheet fallo (HTTP ${res.status}).`);
      }
      const normalizadas = normalizarRespuestaHistoricoAppSheet(body, dniLimpio);
      setResultadoAppSheet(normalizadas);
      if (normalizadas.length === 0) {
        setErrorAppSheet("No se encontraron liquidaciones en AppSheet para ese DNI.");
      }
    } catch (e) {
      setErrorAppSheet(e?.message || "Error consultando AppSheet.");
      setResultadoAppSheet([]);
    } finally {
      setLoadingAppSheet(false);
    }
  };

  const consultar = async () => {
    const dniLimpio = String(dni || "").trim();
    if (!dniLimpio) {
      setError("Ingresa el DNI para consultar.");
      setResultado(null);
      return;
    }
    setLoading(true);
    setError("");
    setErrorAppSheet("");
    setResultado(null);
    try {
      const parsed = await consultarMikrowispPorDni(dniLimpio);
      setResultado(parsed);
    } catch (e) {
      const msg = String(e?.message || "Error consultando API de Mikrowisp.");
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        setError("No se pudo conectar con Mikrowisp (red/CORS). Usa el proxy local y verifica que `npm run dev` este activo.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const estadoColor = useMemo(() => {
    const estado = String(resultado?.estadoServicio || "").toLowerCase();
    if (estado.includes("activo")) return "#0d8a47";
    if (estado.includes("suspend")) return "#cc4a00";
    if (estado.includes("cort")) return "#b42318";
    return "#4f6076";
  }, [resultado]);

  const coordenadasConsulta = useMemo(() => parseCoords(resultado?.coordenadas || ""), [resultado?.coordenadas]);

  return (
    <section className="panel apiq-panel">
      <div className="apiq-card">
        <h2>Consulta API</h2>
        <p className="panel-meta">Consulta de cliente por DNI (Mikrowisp y AppSheet).</p>
        <div className="apiq-form-row">
          <input
            className="panel-search apiq-input"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            placeholder="Ingresa DNI"
            inputMode="numeric"
          />
          <button type="button" className="primary-btn" onClick={() => void consultar()} disabled={loading}>
            {loading ? "Consultando..." : "Consultar Mikrowisp"}
          </button>
          <button type="button" className="secondary-btn" onClick={() => void consultarAppSheet()} disabled={loadingAppSheet}>
            {loadingAppSheet ? "Consultando..." : "Consultar AppSheet"}
          </button>
        </div>
        {error ? <p className="warn-text">{error}</p> : null}
        {errorAppSheet ? <p className="warn-text">{errorAppSheet}</p> : null}
      </div>

      {resultado ? (
        <div className="apiq-card">
          <div className="apiq-status">
            <span>Estado del servicio</span>
            <strong style={{ color: estadoColor }}>{resultado.estadoServicio}</strong>
          </div>
          <div className="client-grid">
            <div>
              <span>Nombre</span>
              <p>{resultado.nombre}</p>
            </div>
            <div>
              <span>DNI</span>
              <p>{resultado.cedula}</p>
            </div>
            <div>
              <span>Movil</span>
              <p>{resultado.movil}</p>
            </div>
            <div>
              <span>Direccion</span>
              <p>{resultado.direccion}</p>
            </div>
            <div>
              <span>Direccion principal</span>
              <p>{resultado.direccionPrincipal}</p>
            </div>
            <div>
              <span>Usuario PPPoE</span>
              <p>{resultado.usuarioPppoe}</p>
            </div>
            <div>
              <span>Clave PPPoE</span>
              <p>{resultado.clavePppoe}</p>
            </div>
            <div>
              <span>Instalado</span>
              <p>{resultado.instalado}</p>
            </div>
            <div>
              <span>IP</span>
              <p>{resultado.ipServicio}</p>
            </div>
            <div>
              <span>MAC</span>
              <p>{resultado.macServicio}</p>
            </div>
            <div>
              <span>Perfil</span>
              <p>{resultado.perfilServicio}</p>
            </div>
            <div>
              <span>Tipo servicio</span>
              <p>{resultado.tipoServicio}</p>
            </div>
            <div>
              <span>Estado usuario</span>
              <p>{resultado.estadoUsuario}</p>
            </div>
            <div>
              <span>Coordenadas</span>
              <p>{resultado.coordenadas || "-"}</p>
            </div>
            <div>
              <span>Codigo etiqueta</span>
              <p>{resultado.codigoEtiqueta || "-"}</p>
            </div>
            <div>
              <span>Deuda</span>
              <p>{resultado.deuda}</p>
            </div>
            <div>
              <span>Facturas no pagadas</span>
              <p>{resultado.facturasNoPagadas}</p>
            </div>
            <div>
              <span>Total facturas</span>
              <p>{resultado.totalFacturas}</p>
            </div>
            <div>
              <span>Estado API</span>
              <p>{resultado.estadoApi}</p>
            </div>
          </div>

          <div className="apiq-map-wrap">
            {coordenadasConsulta ? (
              <>
                <h3>Mapa de ubicacion</h3>
                <MapPreview
                  coords={coordenadasConsulta}
                  className="apiq-map-thumb"
                  onOpenMap={() => abrirMapaEnGoogle(coordenadasConsulta)}
                />
                <button type="button" className="secondary-btn small" onClick={() => abrirMapaEnGoogle(coordenadasConsulta)}>
                  Abrir en Google Maps
                </button>
              </>
            ) : (
              <p className="panel-meta">Mapa: coordenadas no validas.</p>
            )}
          </div>
        </div>
      ) : null}

      {resultadoAppSheet.length > 0 ? (
        <div className="apiq-card">
          <h3>Historico AppSheet ({resultadoAppSheet.length})</h3>
          <div className="apiq-history-list">
            {resultadoAppSheet.map((item) => {
              const coords = parseCoords(item.ubicacionGps);
              return (
                <article key={item.id} className="apiq-history-item">
                  <p className="hist-card-meta"><strong>Fecha:</strong> {item.fecha}</p>
                  <p className="hist-card-meta"><strong>Actuacion:</strong> {item.tipoActuacion}</p>
                  <p className="hist-card-meta"><strong>Nombre:</strong> {item.nombre}</p>
                  <p className="hist-card-meta"><strong>DNI:</strong> {item.dni}</p>
                  <p className="hist-card-meta"><strong>Direccion:</strong> {item.direccion}</p>
                  <p className="hist-card-meta"><strong>Celular:</strong> {item.celular}</p>
                  <p className="hist-card-meta"><strong>Tecnico:</strong> {item.tecnico}</p>
                  <p className="hist-card-meta"><strong>Estado:</strong> {item.estado}</p>
                  <p className="hist-card-meta"><strong>User PPPoE:</strong> {item.userPppoe}</p>
                  <p className="hist-card-meta"><strong>Ubicacion GPS:</strong> {item.ubicacionGps || "-"}</p>
                  <p className="hist-card-meta"><strong>Codigo etiqueta:</strong> {item.codigoEtiqueta || "-"}</p>
                  <p className="hist-card-meta"><strong>Observacion:</strong> {item.observacion}</p>
                  {coords ? (
                    <div className="apiq-map-wrap small">
                      <MapPreview coords={coords} className="apiq-map-thumb small" onOpenMap={() => abrirMapaEnGoogle(coords)} />
                      <button type="button" className="secondary-btn small" onClick={() => abrirMapaEnGoogle(coords)}>
                        Ver mapa
                      </button>
                    </div>
                  ) : null}
                  {Array.isArray(item.fotos) && item.fotos.length > 0 ? (
                    <div className="apiq-photos-wrap">
                      <p className="hist-card-meta">
                        <strong>Fotos:</strong> {item.fotos.length}
                      </p>
                      <div className="apiq-photo-grid">
                        {item.fotos.map((foto, idx) => (
                          <button
                            key={`${item.id}-${foto.campo}-${idx}`}
                            type="button"
                            className="photo-btn"
                            onClick={() => setFotoActiva({ url: foto.url, campo: foto.campo })}
                            title={foto.campo}
                          >
                            <img src={foto.url} alt={foto.campo || `foto-${idx + 1}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {fotoActiva ? (
        <div
          className="apiq-photo-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) setFotoActiva(null);
          }}
        >
          <article className="apiq-photo-card">
            <h4>{fotoActiva?.campo || "Foto"}</h4>
            <img src={fotoActiva?.url || ""} alt={fotoActiva?.campo || "foto"} />
            <button type="button" className="secondary-btn small" onClick={() => setFotoActiva(null)}>
              Cerrar
            </button>
          </article>
        </div>
      ) : null}
    </section>
  );
}

