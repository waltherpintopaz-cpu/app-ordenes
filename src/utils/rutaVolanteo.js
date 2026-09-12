// Generador de rutas de volanteo: dado el poligono de una zona, trae las
// calles reales de OpenStreetMap, las reparte entre N volanteadores y
// calcula para cada quien la ruta a pie que cubre todas sus calles
// asignadas (problema de "inspeccion de rutas" / Chinese Postman Problem).
//
// Flujo:
//   1. obtenerCallesDeZona(poligono)      -> construye el grafo de calles
//   2. particionarGrafo(grafo, n)         -> reparte las calles en n partes
//   3. calcularRutaCobertura(subgrafo)    -> ruta a pie que cubre esa parte
//
// Todo esto es matematica/algoritmos deterministas -- nada de IA en este
// modulo. La IA (si se agrega mas adelante) decide QUIEN recibe cada
// sub-zona ya calculada aqui, no calcula la geometria.

// Varios espejos publicos de Overpass -- si el principal esta saturado
// (429/503/504) se prueba el siguiente en vez de solo esperar al mismo
// servidor, que puede seguir bloqueado por minutos.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

function haversineM(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Ray casting: true si (lat,lng) cae dentro del poligono cerrado `coordinates`.
// (misma logica que src/utils/cobertura.js, copiada aca para no acoplar
// este modulo -- puramente geometrico, a proposito -- a otro con proposito
// distinto).
export function puntoEnPoligono(lat, lng, coordinates) {
  let dentro = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const yi = coordinates[i].lat, xi = coordinates[i].lng;
    const yj = coordinates[j].lat, xj = coordinates[j].lng;
    const interseca = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (interseca) dentro = !dentro;
  }
  return dentro;
}

// Trae de OpenStreetMap (Overpass API) todas las calles caminables dentro
// del rectangulo que contiene al poligono, y arma un grafo con solo los
// segmentos cuyo punto medio cae DENTRO del poligono real (no solo del
// rectangulo). Devuelve { nodos: Map<id, {lat,lng}>, aristas: [...] }.
// El servidor publico y gratuito de Overpass a veces responde 429 (limite
// de solicitudes) o 503/504 (sobrecargado) bajo uso normal -- son fallas
// temporales del servicio, no del poligono ni de la app. Ante una falla
// reintentable se prueba el SIGUIENTE espejo de inmediato (un servidor
// saturado puede seguir asi por minutos, esperarlo no ayuda); solo si
// ninguno de los espejos responde se espera un poco y se repite la ronda.
const OVERPASS_RONDAS = 2;
const OVERPASS_ESPERA_ENTRE_RONDAS_MS = 15000;
async function fetchOverpass(query) {
  let ultimoStatus = null;
  for (let ronda = 0; ronda < OVERPASS_RONDAS; ronda += 1) {
    for (const url of OVERPASS_URLS) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "*/*",
          "User-Agent": "AmnetVolanteo/1.0",
        },
        body: "data=" + encodeURIComponent(query),
      });
      if (res.ok) return res.json();
      ultimoStatus = res.status;
      const esReintentable = res.status === 429 || res.status === 503 || res.status === 504;
      if (!esReintentable) throw new Error(`Overpass respondio ${res.status}`);
    }
    if (ronda < OVERPASS_RONDAS - 1) {
      await new Promise((resolve) => setTimeout(resolve, OVERPASS_ESPERA_ENTRE_RONDAS_MS));
    }
  }
  throw new Error(`Overpass respondio ${ultimoStatus} en los ${OVERPASS_URLS.length} espejos disponibles -- el servicio publico esta saturado, probar de nuevo en unos minutos`);
}

export async function obtenerCallesDeZona(poligono) {
  if (!Array.isArray(poligono) || poligono.length < 3) {
    throw new Error("Poligono de zona invalido.");
  }
  const lats = poligono.map((p) => Number(p.lat));
  const lngs = poligono.map((p) => Number(p.lng));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  const query = `[out:json][timeout:30];(way["highway"]["highway"!~"^(motorway|trunk|motorway_link|trunk_link)$"](${minLat},${minLng},${maxLat},${maxLng}););out body;>;out skel qt;`;

  const data = await fetchOverpass(query);

  const nodosCrudos = new Map();
  data.elements.forEach((el) => {
    if (el.type === "node") nodosCrudos.set(el.id, { lat: el.lat, lng: el.lon });
  });

  const nodos = new Map();
  const aristas = [];
  data.elements
    .filter((el) => el.type === "way" && Array.isArray(el.nodes))
    .forEach((way) => {
      for (let i = 1; i < way.nodes.length; i += 1) {
        const idA = way.nodes[i - 1];
        const idB = way.nodes[i];
        const a = nodosCrudos.get(idA);
        const b = nodosCrudos.get(idB);
        if (!a || !b) continue;
        const midLat = (a.lat + b.lat) / 2;
        const midLng = (a.lng + b.lng) / 2;
        // Solo se incluye el segmento si su punto medio cae dentro del
        // poligono real de la zona -- evita traer calles del rectangulo
        // que en realidad quedan fuera de la zona dibujada.
        if (!puntoEnPoligono(midLat, midLng, poligono)) continue;
        nodos.set(idA, a);
        nodos.set(idB, b);
        aristas.push({
          id: `${idA}-${idB}-${aristas.length}`,
          from: idA,
          to: idB,
          length: haversineM(a.lat, a.lng, b.lat, b.lng),
          wayId: way.id,
          wayName: way.tags?.name || null,
        });
      }
    });

  return { nodos, aristas };
}

// Reparte las aristas del grafo entre `n` grupos de longitud total similar
// y geograficamente compactos: arranca de n "semillas" repartidas en el
// espacio (mas separadas entre si posible) y va asignando cada arista al
// grupo mas cercano cuya longitud acumulada aun no supere el promedio --
// asi el reparto sigue la forma real de las calles en vez de cortar por
// mitad de un area cruda.
// Penalizacion fija (en metros-equivalentes) por cada calle asignada,
// ademas de su longitud real, al momento de balancear grupos. En volanteo el
// esfuerzo de una calle no es solo caminarla: cruzar la esquina, girar y
// repartir en cada tramo cuesta tiempo aparte de los metros. Sin esto, un
// grupo con muchas calles cortas queda "liviano" en metros pero termina
// siendo el mas pesado en la practica (ver caso real: Joss 62 calles/8.9km
// vs Josue 30 calles/11.4km).
const PENALIZACION_POR_CALLE_M = 60;

export function particionarGrafo(grafo, n) {
  const { nodos, aristas } = grafo;

  const centroDeArista = (a) => {
    const na = nodos.get(a.from), nb = nodos.get(a.to);
    return { lat: (na.lat + nb.lat) / 2, lng: (na.lng + nb.lng) / 2 };
  };
  // Nodo de un conjunto de aristas mas cercano a un punto dado -- se usa para
  // elegir el "punto de partida" sugerido de cada grupo (ver mas abajo).
  const nodoMasCercanoA = (arr, punto) => {
    let mejorId = null, mejorDist = Infinity;
    const vistos = new Set();
    arr.forEach((a) => {
      [a.from, a.to].forEach((id) => {
        if (vistos.has(id)) return;
        vistos.add(id);
        const nodo = nodos.get(id);
        if (!nodo) return;
        const d = haversineM(nodo.lat, nodo.lng, punto.lat, punto.lng);
        if (d < mejorDist) { mejorDist = d; mejorId = id; }
      });
    });
    return mejorId;
  };

  if (n <= 1 || aristas.length === 0) {
    if (aristas.length === 0) return { grupos: [grafo], puntosPartida: [{ nodoId: null, orden: 1 }] };
    let sumaLat = 0, sumaLng = 0, sumaPeso = 0;
    aristas.forEach((a) => {
      const c = centroDeArista(a);
      sumaLat += c.lat * a.length;
      sumaLng += c.lng * a.length;
      sumaPeso += a.length;
    });
    const centro = { lat: sumaLat / sumaPeso, lng: sumaLng / sumaPeso };
    return { grupos: [grafo], puntosPartida: [{ nodoId: nodoMasCercanoA(aristas, centro), orden: 1 }] };
  }
  const costoArista = (a) => a.length + PENALIZACION_POR_CALLE_M;

  // Semillas: la primera arista, y luego siempre la mas lejana a todas las
  // semillas ya elegidas (maximiza separacion, tipo k-means++).
  const centros = aristas.map(centroDeArista);
  const semillas = [0];
  while (semillas.length < n) {
    let mejorIdx = -1, mejorDist = -1;
    for (let i = 0; i < aristas.length; i += 1) {
      if (semillas.includes(i)) continue;
      const distMin = Math.min(...semillas.map((s) => haversineM(centros[i].lat, centros[i].lng, centros[s].lat, centros[s].lng)));
      if (distMin > mejorDist) { mejorDist = distMin; mejorIdx = i; }
    }
    if (mejorIdx === -1) break;
    semillas.push(mejorIdx);
  }

  const totalCosto = aristas.reduce((acc, a) => acc + costoArista(a), 0);
  const objetivoPorGrupo = totalCosto / n;
  let gruposCentro = semillas.map((i) => centros[i]);
  let gruposAristas = Array.from({ length: n }, () => []);
  let gruposCosto = new Array(n).fill(0);

  // Refinamiento iterativo (estilo Lloyd/k-means): en cada vuelta se
  // reasignan TODAS las aristas contra los centros actuales (penalizando
  // grupos ya cargados) y al final de la vuelta se recalculan los centros
  // como el promedio ponderado de lo que le toco a cada grupo. Repetirlo
  // varias veces deja clusters mas compactos y balanceados que una sola
  // pasada -- los centros "persiguen" su propio grupo hasta asentarse.
  const ITERACIONES = 6;
  for (let iter = 0; iter < ITERACIONES; iter += 1) {
    const esUltima = iter === ITERACIONES - 1;
    const nuevasAristas = Array.from({ length: n }, () => []);
    const nuevosCostos = new Array(n).fill(0);

    const orden = aristas.map((_, i) => i).sort((i, j) => {
      const di = Math.min(...gruposCentro.map((c) => haversineM(centros[i].lat, centros[i].lng, c.lat, c.lng)));
      const dj = Math.min(...gruposCentro.map((c) => haversineM(centros[j].lat, centros[j].lng, c.lat, c.lng)));
      return di - dj;
    });

    orden.forEach((i) => {
      const a = aristas[i];
      const c = centros[i];
      let mejorGrupo = -1, mejorPuntaje = Infinity;
      for (let g = 0; g < n; g += 1) {
        const dist = haversineM(c.lat, c.lng, gruposCentro[g].lat, gruposCentro[g].lng);
        const proporcion = nuevosCostos[g] / objetivoPorGrupo;
        // En la ultima vuelta se aprieta mas la penalizacion por carga para
        // terminar de parejar los grupos, ya con los centros asentados.
        const factorCarga = 1 + Math.max(0, proporcion - 0.6) * (esUltima ? 4 : 2.2);
        const puntaje = dist * factorCarga;
        if (puntaje < mejorPuntaje) { mejorPuntaje = puntaje; mejorGrupo = g; }
      }
      nuevasAristas[mejorGrupo].push(a);
      nuevosCostos[mejorGrupo] += costoArista(a);
    });

    gruposAristas = nuevasAristas;
    gruposCosto = nuevosCostos;
    // Recalcula cada centro como el promedio (ponderado por largo) de sus
    // propias aristas -- si un grupo quedo vacio (raro, solo con n grande
    // y pocas aristas) conserva su centro anterior.
    gruposCentro = gruposCentro.map((centroPrev, g) => {
      if (gruposAristas[g].length === 0) return centroPrev;
      let sumaLat = 0, sumaLng = 0, sumaPeso = 0;
      gruposAristas[g].forEach((a) => {
        const c = centroDeArista(a);
        sumaLat += c.lat * a.length;
        sumaLng += c.lng * a.length;
        sumaPeso += a.length;
      });
      return { lat: sumaLat / sumaPeso, lng: sumaLng / sumaPeso };
    });
  }

  // Pasada final de rebalanceo fino: mueve aristas sueltas del grupo mas
  // cargado hacia el mas corto mientras la diferencia siga siendo grande,
  // priorizando las que esten geograficamente mas cerca del grupo corto
  // (para no dejar "islas" separadas del resto de su nuevo grupo).
  let intentos = 0;
  while (intentos < n * 25) {
    intentos += 1;
    const idxCorto = gruposCosto.reduce((mejor, l, idx) => (l < gruposCosto[mejor] ? idx : mejor), 0);
    const idxLargo = gruposCosto.reduce((mejor, l, idx) => (l > gruposCosto[mejor] ? idx : mejor), 0);
    const diferencia = gruposCosto[idxLargo] - gruposCosto[idxCorto];
    // Umbral de tolerancia: antes 20% del objetivo dejaba pasar diferencias
    // grandes sin corregir (ej: un grupo 16-17% por debajo del objetivo ya
    // no se tocaba, aunque en km eso se notara mucho -- ver caso real con
    // spread de 8.7km a 13.5km). Se aprieta a 8% para forzar mas correccion.
    if (idxLargo === idxCorto || diferencia < objetivoPorGrupo * 0.08) break;
    const candidatos = gruposAristas[idxLargo]
      .map((a, idx) => ({ idx, a, dist: haversineM(centroDeArista(a).lat, centroDeArista(a).lng, gruposCentro[idxCorto].lat, gruposCentro[idxCorto].lng) }))
      .sort((x, y) => x.dist - y.dist);
    // Antes solo se probaba el candidato mas cercano: si esa arista sola ya
    // pasaba el objetivo del grupo corto, el bucle se rendia entero aunque
    // hubiera otras aristas mas chicas que si cabian. Ahora se recorre la
    // lista (ya ordenada por cercania) hasta encontrar una que quepa.
    const mover = candidatos.find(
      (c) => gruposCosto[idxCorto] + costoArista(c.a) <= objetivoPorGrupo * 1.05
    );
    if (!mover) break;
    gruposAristas[idxLargo].splice(mover.idx, 1);
    gruposAristas[idxCorto].push(mover.a);
    gruposCosto[idxLargo] -= costoArista(mover.a);
    gruposCosto[idxCorto] += costoArista(mover.a);
  }

  // Orden de dejada sugerido: cadena de vecino mas cercano sobre los centros
  // finales de cada grupo -- el supervisor puede ir dejando a cada voluntario
  // en este orden sin ir y volver por el mapa. Es puramente informativo, no
  // afecta el reparto de calles ya calculado arriba.
  const visitado = new Array(n).fill(false);
  const ordenVisita = [0];
  visitado[0] = true;
  while (ordenVisita.length < n) {
    const actual = ordenVisita[ordenVisita.length - 1];
    let mejorIdx = -1, mejorDist = Infinity;
    for (let g = 0; g < n; g += 1) {
      if (visitado[g]) continue;
      const d = haversineM(gruposCentro[actual].lat, gruposCentro[actual].lng, gruposCentro[g].lat, gruposCentro[g].lng);
      if (d < mejorDist) { mejorDist = d; mejorIdx = g; }
    }
    if (mejorIdx === -1) break;
    visitado[mejorIdx] = true;
    ordenVisita.push(mejorIdx);
  }

  // Punto de partida sugerido por grupo: el primero de la cadena arranca en
  // el nodo mas "propio" (el mas cercano a su propio centro); cada siguiente
  // arranca en el nodo de sus calles mas cercano al centro del grupo anterior
  // en la cadena, para que el punto de entrada quede del lado por donde
  // viene el supervisor -- referencial, no obliga a nada.
  const puntosPartida = new Array(n);
  ordenVisita.forEach((g, posicion) => {
    const puntoReferencia = posicion === 0 ? gruposCentro[g] : gruposCentro[ordenVisita[posicion - 1]];
    const nodoId = nodoMasCercanoA(gruposAristas[g], puntoReferencia) ?? nodoMasCercanoA(gruposAristas[g], gruposCentro[g]);
    puntosPartida[g] = { nodoId, orden: posicion + 1 };
  });

  return {
    grupos: gruposAristas.map((arr) => {
      const idsUsados = new Set();
      arr.forEach((a) => { idsUsados.add(a.from); idsUsados.add(a.to); });
      const subNodos = new Map();
      idsUsados.forEach((id) => subNodos.set(id, nodos.get(id)));
      return { nodos: subNodos, aristas: arr };
    }),
    puntosPartida,
  };
}

// Dijkstra simple entre dos nodos de un grafo (usado para conectar nodos de
// grado impar que no son vecinos directos al parear-los).
function caminoMasCorto(grafo, origen, destino) {
  const { nodos, aristas } = grafo;
  const adj = new Map();
  aristas.forEach((a) => {
    if (!adj.has(a.from)) adj.set(a.from, []);
    if (!adj.has(a.to)) adj.set(a.to, []);
    adj.get(a.from).push({ hacia: a.to, peso: a.length, arista: a });
    adj.get(a.to).push({ hacia: a.from, peso: a.length, arista: a });
  });

  const dist = new Map([[origen, 0]]);
  const prev = new Map();
  const visitados = new Set();
  const pendientes = new Set(nodos.keys());

  while (pendientes.size > 0) {
    let actual = null, mejor = Infinity;
    pendientes.forEach((id) => {
      const d = dist.get(id) ?? Infinity;
      if (d < mejor) { mejor = d; actual = id; }
    });
    if (actual === null) break;
    pendientes.delete(actual);
    visitados.add(actual);
    if (actual === destino) break;
    (adj.get(actual) || []).forEach(({ hacia, peso, arista }) => {
      if (visitados.has(hacia)) return;
      const nuevaDist = mejor + peso;
      if (nuevaDist < (dist.get(hacia) ?? Infinity)) {
        dist.set(hacia, nuevaDist);
        prev.set(hacia, { nodo: actual, arista });
      }
    });
  }

  const path = [];
  let cursor = destino;
  while (prev.has(cursor)) {
    const { nodo, arista } = prev.get(cursor);
    path.unshift(arista);
    cursor = nodo;
  }
  return { distancia: dist.get(destino) ?? Infinity, aristas: path };
}

// Encuentra los componentes conectados del (sub)grafo -- BFS por las
// aristas. Repartir calles por cercania/carga (particionarGrafo) puede
// dejarle a una persona un par de calles sueltas, sin conexion real por
// las DEMAS calles de su propia porcion (aunque en la realidad si se
// puede llegar caminando por calles que le tocaron a otra persona). Nunca
// hay que fingir que esas islas estan conectadas -- eso es lo que causaba
// el bug de "lineas rectas atravesando manzanas" (ver conversacion: el
// emparejamiento de cruces de grado impar fallaba en silencio entre
// componentes distintos, y el resultado terminaba con dos puntos lejanos
// consecutivos en la ruta).
function componentesConectados(nodos, aristas) {
  const adj = new Map();
  aristas.forEach((a) => {
    if (!adj.has(a.from)) adj.set(a.from, []);
    if (!adj.has(a.to)) adj.set(a.to, []);
    adj.get(a.from).push(a);
    adj.get(a.to).push(a);
  });
  const visitados = new Set();
  const componentes = [];
  adj.forEach((_, nodoId) => {
    if (visitados.has(nodoId)) return;
    const nodosComp = new Set([nodoId]);
    const aristasComp = new Set();
    const cola = [nodoId];
    visitados.add(nodoId);
    while (cola.length > 0) {
      const v = cola.shift();
      (adj.get(v) || []).forEach((a) => {
        aristasComp.add(a);
        const vecino = a.from === v ? a.to : a.from;
        if (!visitados.has(vecino)) { visitados.add(vecino); nodosComp.add(vecino); cola.push(vecino); }
      });
    }
    const subNodos = new Map();
    nodosComp.forEach((id) => subNodos.set(id, nodos.get(id)));
    componentes.push({ nodos: subNodos, aristas: [...aristasComp] });
  });
  // De mas a menos calles primero -- el componente principal (donde
  // probablemente cae nodoInicioForzado) se resuelve primero.
  return componentes.sort((a, b) => b.aristas.length - a.aristas.length);
}

// Resuelve UN componente ya garantizado conectado (ver calcularRutaCobertura
// para el caso general con posibles islas separadas).
function resolverComponenteConectado(subgrafo, nodoInicioForzado) {
  const { nodos, aristas } = subgrafo;
  if (aristas.length === 0) return { coords: [], distanciaM: 0 };

  const grado = new Map();
  aristas.forEach((a) => {
    grado.set(a.from, (grado.get(a.from) || 0) + 1);
    grado.set(a.to, (grado.get(a.to) || 0) + 1);
  });
  const impares = [...grado.entries()].filter(([, g]) => g % 2 !== 0).map(([id]) => id);

  const aristasTrabajo = [...aristas];
  const restantes = [...impares];
  const paresParaConectar = [];
  while (restantes.length > (nodoInicioForzado ? 0 : 1)) {
    const base = restantes.shift();
    let mejorIdx = 0, mejorDist = Infinity;
    restantes.forEach((id, idx) => {
      const na = nodos.get(base), nb = nodos.get(id);
      if (!na || !nb) return;
      const d = haversineM(na.lat, na.lng, nb.lat, nb.lng);
      if (d < mejorDist) { mejorDist = d; mejorIdx = idx; }
    });
    const par = restantes.splice(mejorIdx, 1)[0];
    paresParaConectar.push([base, par]);
  }

  // Dentro de UN mismo componente conectado, caminoMasCorto SIEMPRE
  // encuentra un camino real (por definicion de "conectado") -- no hace
  // falta el manejo de fallo que si hacia falta cuando esto operaba sobre
  // grafos con islas separadas.
  paresParaConectar.forEach(([a, b]) => {
    const { aristas: camino } = caminoMasCorto(subgrafo, a, b);
    camino.forEach((ar) => aristasTrabajo.push({ ...ar, id: `${ar.id}-dup${aristasTrabajo.length}` }));
  });

  const adj = new Map();
  aristasTrabajo.forEach((a) => {
    if (!adj.has(a.from)) adj.set(a.from, []);
    if (!adj.has(a.to)) adj.set(a.to, []);
    adj.get(a.from).push(a);
    adj.get(a.to).push(a);
  });
  const usadas = new Set();

  const inicio = nodoInicioForzado ?? impares[0] ?? aristasTrabajo[0].from;
  const pila = [inicio];
  const circuito = [];
  while (pila.length > 0) {
    const v = pila[pila.length - 1];
    const vecinos = adj.get(v) || [];
    const siguiente = vecinos.find((a) => !usadas.has(a.id));
    if (!siguiente) {
      circuito.push(pila.pop());
      continue;
    }
    usadas.add(siguiente.id);
    const destino = siguiente.from === v ? siguiente.to : siguiente.from;
    pila.push(destino);
  }
  circuito.reverse();

  const coords = circuito.map((id) => nodos.get(id)).filter(Boolean);
  let distM = 0;
  for (let i = 1; i < coords.length; i += 1) {
    distM += haversineM(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng);
  }
  return { coords, distanciaM: distM };
}

// Calcula la(s) ruta(s) a pie que cubren todas las calles del sub-grafo
// dado, aproximando el "Route Inspection Problem" (Chinese Postman) POR
// CADA COMPONENTE CONECTADO por separado -- nunca se traza una linea recta
// entre dos calles que no tienen conexion real dentro de lo asignado (eso
// es lo que producia el bug de "lineas rectas cruzando manzanas": el
// emparejamiento de cruces de grado impar fallaba en silencio entre islas
// separadas). Si hay mas de un componente, `segmentos` tiene una entrada
// por cada uno -- el que llega a dibujar debe pintarlos como polylines
// independientes, NUNCA conectados entre si.
// `nodoInicioForzado`: si se pasa (recalculo en vivo "la mejor ruta desde
// donde estoy"), el componente que lo contiene arranca exactamente ahi y
// se resuelve como circuito CERRADO (se puede empezar en cualquier nodo).
// Los demas componentes (islas que solo se pueden alcanzar caminando por
// calles que no son tuyas) se resuelven como caminos abiertos normales.
export function calcularRutaCobertura(subgrafo, nodoInicioForzado) {
  const { nodos, aristas } = subgrafo;
  if (aristas.length === 0) return { coords: [], segmentos: [], distanciaM: 0, callesUnicas: 0 };

  let componentes = componentesConectados(nodos, aristas);
  // El componente que contiene nodoInicioForzado (la posicion actual) va
  // siempre primero -- es "por donde hay que empezar", el resto son islas
  // que se cubren despues (caminando por calles ajenas para llegar a ellas).
  if (nodoInicioForzado) {
    const idx = componentes.findIndex((c) => c.nodos.has(nodoInicioForzado));
    if (idx > 0) componentes = [componentes[idx], ...componentes.slice(0, idx), ...componentes.slice(idx + 1)];
  }
  const segmentos = componentes.map((comp) => {
    const contieneInicio = nodoInicioForzado && comp.nodos.has(nodoInicioForzado);
    return resolverComponenteConectado(comp, contieneInicio ? nodoInicioForzado : undefined);
  });
  // `coords` = el segmento principal, se mantiene por compatibilidad con
  // quien todavia no distingue segmentos; `segmentos` trae todos, para
  // dibujarlos como polylines independientes (nunca conectados entre si).
  const coords = segmentos[0]?.coords || [];
  const distanciaM = segmentos.reduce((acc, s) => acc + s.distanciaM, 0);
  return { coords, segmentos: segmentos.map((s) => s.coords), distanciaM, callesUnicas: new Set(aristas.map((a) => a.wayId)).size };
}
