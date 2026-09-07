// Perfiles de registro GPS -- mismo concepto y mismos valores que los
// perfiles predefinidos de Geo Tracker (Preciso/General/Ahorro de bateria/
// Ahorro de bateria maximo), para que el admin (navegador) o el supervisor
// (app) elijan el mismo balance precision/bateria que ya conocen de esa app.
// "Personalizado" permite ajustar cada valor a mano. La configuracion vive
// en una sola fila compartida (tabla volanteo_config_registro) -- aplica a
// todo el equipo de volanteadores. Espejo exacto de
// app-ordenes-mobile/src/config/volanteoPerfiles.js.
export const PERFILES_REGISTRO = {
  preciso: { label: "Preciso", frecuencia_seg: 1, precision_m: 50, distancia_minima_m: 5, distancia_maxima_m: 500, filtrado_adicional: true },
  general: { label: "General", frecuencia_seg: 1, precision_m: 50, distancia_minima_m: 10, distancia_maxima_m: 500, filtrado_adicional: false },
  ahorro: { label: "Ahorro de batería", frecuencia_seg: 30, precision_m: 500, distancia_minima_m: 20, distancia_maxima_m: 2000, filtrado_adicional: false },
  ahorro_max: { label: "Ahorro de batería máximo", frecuencia_seg: 60, precision_m: 1000, distancia_minima_m: 50, distancia_maxima_m: 5000, filtrado_adicional: false },
};

export const PERFIL_DEFECTO = {
  perfil: "personalizado",
  frecuencia_seg: 15,
  precision_m: 35,
  distancia_minima_m: 8,
  distancia_maxima_m: 500,
  filtrado_adicional: true,
};
