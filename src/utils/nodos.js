// Reverso: numero crudo de router Mikrowisp -> etiqueta visual "Nod_XX".
// Un mismo Nod_XX puede tener varios IDs historicos de Mikrowisp (routers
// reemplazados/migrados con el tiempo). Se usa para traducir datos que
// llegan con el numero crudo en vez de la etiqueta (ej: clientes sincronizados
// desde Mikrowisp, import CSV/Sheet).
// IDs confirmados en Mikrowisp (instancia DimFiber): Nod_04=5, Nod_05=11, Nod_06=12.
// OJO: "12" ya se usaba para Nod_03 migrado a VLAN 102 (otra instancia de
// Mikrowisp) -- como este mapa no distingue instancia, se deja "12" apuntando
// a Nod_03 (uso pre-existente) y Nod_06 no tiene entrada aca; su etiqueta real
// deberia venir siempre como "Nod_06" desde donde se genera el dato.
export const NODO_POR_ROUTER_MIKROWISP = {
  "1": "Nod_01", "7": "Nod_01", "8": "Nod_01", "9": "Nod_01",
  "2": "Nod_02",
  "3": "Nod_03", "10": "Nod_03", "12": "Nod_03",
  "5": "Nod_04", "6": "Nod_04",
  "11": "Nod_05",
};

export function normalizarEtiquetaNodo(valor) {
  const raw = String(valor || "").trim();
  if (!raw) return "";
  if (/^Nod_0[1-6]$/i.test(raw)) return raw.replace(/^nod_/i, "Nod_");
  return NODO_POR_ROUTER_MIKROWISP[raw] || raw;
}

// ── Configuracion de nodos, cargada desde Supabase (tabla nodos_config) ──
// Antes esta informacion (patron de usuario, clave fija, ID de router en
// Mikrowisp, VLAN, si es DimFiber, si tiene automatizacion) vivia hardcodeada
// y duplicada en 3 archivos distintos (SidebarApp.jsx, App.jsx,
// OrdersScreen.js del app movil) -- agregar un nodo nuevo requeria editar
// codigo en los 3 lugares, y un dato mal copiado en uno de ellos (como paso
// con el ID de router de Nod_06) quedaba invisible hasta que alguien lo
// pisaba en produccion. Ahora la fuente de verdad es esta tabla; estos
// valores por defecto solo son un respaldo por si la carga desde Supabase
// falla (sin internet, tabla vacia, etc.) y para no romper nada mientras se
// migra el resto del codigo.
export const NODOS_CONFIG_DEFAULT = {
  Nod_01: { empresa: "Americanet", mikrowispRouterId: 1,  usuarioPrefix: "user",     usuarioSuffix: "@americanet", usuarioPad: 0, usuarioStart: 801, passwordFija: "madrid0021",   vlan: "100", esDim: false, mkwAuto: false, activo: true, orden: 1 },
  Nod_02: { empresa: "Americanet", mikrowispRouterId: 2,  usuarioPrefix: "usuario_", usuarioSuffix: "",            usuarioPad: 0, usuarioStart: 600, passwordFija: "speedy2000",   vlan: "100", esDim: false, mkwAuto: false, activo: true, orden: 2 },
  Nod_03: { empresa: "Americanet", mikrowispRouterId: 10, usuarioPrefix: "",         usuarioSuffix: "@americanet", usuarioPad: 4, usuarioStart: 501, passwordFija: "aqp0021",      vlan: "102", esDim: false, mkwAuto: false, activo: true, orden: 3 },
  Nod_04: { empresa: "DIM",        mikrowispRouterId: 5,  usuarioPrefix: "user",     usuarioSuffix: "@fiber",      usuarioPad: 0, usuarioStart: 467, passwordFija: "uchumayo0021", vlan: null,  esDim: true,  mkwAuto: true,  activo: true, orden: 4 },
  Nod_05: { empresa: "DIM",        mikrowispRouterId: 11, usuarioPrefix: "",         usuarioSuffix: "@dim",        usuarioPad: 3, usuarioStart: 1,   passwordFija: "selva0021",    vlan: null,  esDim: true,  mkwAuto: true,  activo: true, orden: 5 },
  Nod_06: { empresa: "DIM",        mikrowispRouterId: 12, usuarioPrefix: "",         usuarioSuffix: "@amnet",      usuarioPad: 0, usuarioStart: 130, passwordFija: "apipa0021",    vlan: null,  esDim: true,  mkwAuto: true,  activo: true, orden: 6 },
  Nod_07: { empresa: "DIM",        mikrowispRouterId: null, usuarioPrefix: "Acliente", usuarioSuffix: "",         usuarioPad: 0, usuarioStart: 208, passwordFija: null,           vlan: null,  esDim: true,  mkwAuto: false, activo: true, orden: 7 },
};

const filaANodoConfig = (row) => ({
  empresa: row.empresa || "Americanet",
  mikrowispRouterId: row.mikrowisp_router_id != null ? Number(row.mikrowisp_router_id) : null,
  usuarioPrefix: row.usuario_prefix || "",
  usuarioSuffix: row.usuario_suffix || "",
  usuarioPad: Number(row.usuario_pad || 0),
  usuarioStart: Number(row.usuario_start || 1),
  passwordFija: row.password_fija || null,
  vlan: row.vlan || null,
  esDim: !!row.es_dim,
  mkwAuto: !!row.mkw_auto,
  activo: row.activo !== false,
  orden: Number(row.orden || 0),
});

// Carga la tabla nodos_config desde Supabase y la fusiona sobre los
// defaults de arriba (un nodo no migrado/no encontrado en la tabla sigue
// funcionando igual que hoy). Recibe el cliente supabase ya inicializado
// del archivo que la llama (SidebarApp.jsx y App.jsx) para no crear una
// segunda instancia del cliente.
export async function cargarNodosConfig(supabase) {
  const config = { ...NODOS_CONFIG_DEFAULT };
  try {
    const { data, error } = await supabase.from("nodos_config").select("*");
    if (error) throw error;
    (data || []).forEach((row) => {
      if (row?.nodo) config[row.nodo] = filaANodoConfig(row);
    });
  } catch (e) {
    console.warn("No se pudo cargar nodos_config desde Supabase, usando valores por defecto.", e);
  }
  return config;
}

// ── Helpers derivados de la config cargada, para reemplazar los mapas
// hardcodeados que antes vivian sueltos en cada archivo ──────────────────
export function nodosActivosOrdenados(nodosConfig) {
  return Object.entries(nodosConfig || {})
    .filter(([, c]) => c.activo !== false)
    .sort((a, b) => (a[1].orden || 0) - (b[1].orden || 0))
    .map(([nodo]) => nodo);
}
export function mwNodoMapDesdeConfig(nodosConfig) {
  const out = {};
  Object.entries(nodosConfig || {}).forEach(([nodo, c]) => {
    if (c.mikrowispRouterId != null) out[nodo] = c.mikrowispRouterId;
  });
  return out;
}
export function nodoUsuarioRulesDesdeConfig(nodosConfig) {
  const out = {};
  Object.entries(nodosConfig || {}).forEach(([nodo, c]) => {
    out[nodo.toUpperCase()] = { prefix: c.usuarioPrefix, suffix: c.usuarioSuffix, pad: c.usuarioPad, start: c.usuarioStart };
  });
  return out;
}
export function nodoPasswordRulesDesdeConfig(nodosConfig) {
  const out = {};
  Object.entries(nodosConfig || {}).forEach(([nodo, c]) => {
    if (c.passwordFija) out[nodo.toUpperCase()] = c.passwordFija;
  });
  return out;
}
export function vlanPorNodoDesdeConfig(nodosConfig) {
  const out = {};
  Object.entries(nodosConfig || {}).forEach(([nodo, c]) => {
    if (c.vlan) out[nodo] = c.vlan;
  });
  return out;
}
export function nodosMkwAutoDesdeConfig(nodosConfig) {
  return Object.entries(nodosConfig || {}).filter(([, c]) => c.mkwAuto).map(([nodo]) => nodo);
}
export function esDimNodoDesdeConfig(nodosConfig, nodo) {
  return !!nodosConfig?.[String(nodo || "").trim()]?.esDim;
}
export function empresaPorNodoDesdeConfig(nodosConfig, nodo) {
  return nodosConfig?.[String(nodo || "").trim()]?.empresa || "Americanet";
}
