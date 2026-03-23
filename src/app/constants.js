import L from "leaflet";

export const initialOrder = {
  empresa: "Americanet",
  codigo: "",
  generarUsuario: "SI",
  orden: "ORDEN DE SERVICIO",
  tipoActuacion: "Instalacion Internet",
  fechaActuacion: "",
  hora: "",
  estado: "Pendiente",
  prioridad: "Normal",

  dni: "",
  nombre: "",
  direccion: "",
  celular: "",
  email: "",
  contacto: "",

  velocidad: "",
  precioPlan: "",
  nodo: "",
  usuarioNodo: "",
  passwordUsuario: "",
  snOnu: "",

  ubicacion: "-16.438490, -71.598208",
  descripcion: "",
  fotoFachada: "",
  fotosOrden: [],

  solicitarPago: "SI",
  montoCobrar: "",
  autorOrden: "",
  tecnico: "",
};

export const initialLiquidacion = {
  tecnicoLiquida: "",
  resultadoFinal: "Completada",
  observacionFinal: "",
  cobroRealizado: "NO",
  montoCobrado: "",
  medioPago: "",
  codigoEtiqueta: "",
  snOnu: "",
  equipos: [],
  materiales: [],
  fotos: [],
  codigoQRManual: "",
};

export const initialUsuario = {
  nombre: "",
  username: "",
  password: "",
  rol: "Tecnico",
  celular: "",
  email: "",
  empresa: "Americanet",
  activo: true,
};

export const initialEquipoCatalogo = {
  empresa: "Americanet",
  tipo: "ONU",
  marca: "",
  modelo: "",
  precioUnitario: "",
  codigoQR: "",
  serialMac: "",
  fotoReferencia: "",
  fotoEtiqueta: "",
  estado: "almacen",
  tecnicoAsignado: "",
};

export const initialAsignacionInventario = {
  tecnico: "",
  equipoId: "",
};

export const initialAsignacionMaterial = {
  tecnico: "",
  materialId: "",
  cantidad: "",
  unidad: "unidad",
};

export const defaultTiposEquipoCatalogo = ["ONU", "Router", "Repetidor", "Switch", "Otro"];

export const defaultMaterialesCatalogo = [
  { nombre: "Drop cable", unidadDefault: "metros", costoUnitario: 0 },
  { nombre: "Conector", unidadDefault: "unidad", costoUnitario: 0 },
  { nombre: "Grapas", unidadDefault: "unidad", costoUnitario: 0 },
  { nombre: "Roseta", unidadDefault: "unidad", costoUnitario: 0 },
];

export const unidadesMaterial = ["unidad", "metros", "rollo", "caja"];
export const defaultModelosEquipoCatalogo = [];
export const ROLES_USUARIO = ["Administrador", "Tecnico", "Gestora", "Almacen"];

export const PERMISOS_POR_ROL = {
  Administrador: [
    "dashboardAdmin",
    "crear",
    "ordenesGeneradas",
    "pendientes",
    "consultaCliente",
    "smartOlt",
    "historial",
    "dashboardGestora",
    "mapa",
    "inventario",
    "stockTecnico",
    "dashboardTecnico",
    "catalogos",
    "usuarios",
    "clientes",
    "detalleCliente",
    "detalleOrden",
    "liquidar",
    "detalleLiquidacion",
    "detalleEquipoInventario",
    "reportes",
  ],
  Gestora: [
    "crear",
    "ordenesGeneradas",
    "historial",
    "dashboardGestora",
    "clientes",
    "detalleCliente",
    "detalleLiquidacion",
    "reportes",
  ],
  Tecnico: [
    "dashboardTecnico",
    "ordenesGeneradas",
    "historial",
    "pendientes",
    "consultaCliente",
    "smartOlt",
    "detalleOrden",
    "liquidar",
    "stockTecnico",
    "detalleLiquidacion",
  ],
  Almacen: [
    "ordenesGeneradas",
    "inventario",
    "catalogos",
    "stockTecnico",
    "detalleLiquidacion",
    "detalleEquipoInventario",
    "reportes",
    "smartOlt",
  ],
};

export const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
