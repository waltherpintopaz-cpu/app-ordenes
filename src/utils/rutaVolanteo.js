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

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

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
export async function obtenerCallesDeZona(poligono) {
  if (!Array.isArray(poligono) || poligono.length < 3) {
    throw new Error("Poligono de zona invalido.");
  }
  const lats = poligono.map((p) => Number(p.lat));
  const lngs = poligono.map((p) => Number(p.lng));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  const query = `[out:json][timeout:30];(way["highway"]["highway"!~"^(motorway|trunk|motorway_link|trunk_link)$"](${minLat},${minLng},${maxLat},${maxLng}););out body;>;out skel qt;`;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
      "User-Agent": "AmnetVolanteo/1.0",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass respondio ${res.status}`);
  const data = await res.json();

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
export function particionarGrafo(grafo, n) {
  const { nodos, aristas } = grafo;
  if (n <= 1 || aristas.length === 0) return [grafo];

  const centroDeArista = (a) => {
    const na = nodos.get(a.from), nb = nodos.get(a.to);
    return { lat: (na.lat + nb.lat) / 2, lng: (na.lng + nb.lng) / 2 };
  };

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

  const totalLength = aristas.reduce((acc, a) => acc + a.length, 0);
  const objetivoPorGrupo = totalLength / n;
  let gruposCentro = semillas.map((i) => centros[i]);
  let gruposAristas = Array.from({ length: n }, () => []);
  let gruposLongitud = new Array(n).fill(0);

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
    const nuevasLongitudes = new Array(n).fill(0);

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
        const proporcion = nuevasLongitudes[g] / objetivoPorGrupo;
        // En la ultima vuelta se aprieta mas la penalizacion por carga para
        // terminar de parejar los grupos, ya con los centros asentados.
        const factorCarga = 1 + Math.max(0, proporcion - 0.6) * (esUltima ? 4 : 2.2);
        const puntaje = dist * factorCarga;
        if (puntaje < mejorPuntaje) { mejorPuntaje = puntaje; mejorGrupo = g; }
      }
      nuevasAristas[mejorGrupo].push(a);
      nuevasLongitudes[mejorGrupo] += a.length;
    });

    gruposAristas = nuevasAristas;
    gruposLongitud = nuevasLongitudes;
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
  while (intentos < n * 6) {
    intentos += 1;
    const idxCorto = gruposLongitud.reduce((mejor, l, idx) => (l < gruposLongitud[mejor] ? idx : mejor), 0);
    const idxLargo = gruposLongitud.reduce((mejor, l, idx) => (l > gruposLongitud[mejor] ? idx : mejor), 0);
    const diferencia = gruposLongitud[idxLargo] - gruposLongitud[idxCorto];
    if (idxLargo === idxCorto || diferencia < objetivoPorGrupo * 0.2) break;
    const candidatos = gruposAristas[idxLargo]
      .map((a, idx) => ({ idx, a, dist: haversineM(centroDeArista(a).lat, centroDeArista(a).lng, gruposCentro[idxCorto].lat, gruposCentro[idxCorto].lng) }))
      .sort((x, y) => x.dist - y.dist);
    if (candidatos.length === 0) break;
    const mover = candidatos[0];
    // No mover si dejaria al grupo corto pasado del objetivo (evita
    // oscilar de un lado a otro sin converger).
    if (gruposLongitud[idxCorto] + mover.a.length > objetivoPorGrupo * 1.1) break;
    gruposAristas[idxLargo].splice(mover.idx, 1);
    gruposAristas[idxCorto].push(mover.a);
    gruposLongitud[idxLargo] -= mover.a.length;
    gruposLongitud[idxCorto] += mover.a.length;
  }

  return gruposAristas.map((arr) => {
    const idsUsados = new Set();
    arr.forEach((a) => { idsUsados.add(a.from); idsUsados.add(a.to); });
    const subNodos = new Map();
    idsUsados.forEach((id) => subNodos.set(id, nodos.get(id)));
    return { nodos: subNodos, aristas: arr };
  });
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

// Calcula una ruta a pie que cubre todas las calles del sub-grafo dado,
// aproximando el "Route Inspection Problem" (Chinese Postman): empareja los
// cruces de grado impar (por cercania, no es el emparejamiento optimo pero
// es una aproximacion razonable y rapida de calcular) duplicando el camino
// mas corto entre cada par para que el grafo quede recorrible sin
// levantar el lapiz, y despues recorre todo con el algoritmo de Hierholzer.
// `nodoInicioForzado`: si se pasa (recalculo en vivo "la mejor ruta desde
// donde estoy"), se emparejan TODOS los nodos de grado impar sin dejar
// ninguno suelto -- eso deja un circuito CERRADO, que matematicamente se
// puede empezar a recorrer desde cualquier nodo, incluido el mas cercano a
// la posicion actual. Sin el parametro (uso original: generar la ruta
// completa de una sub-zona desde cero), se deja un nodo impar sin
// emparejar para un camino ABIERTO (no hace falta volver al punto de
// partida, que es lo normal al planear el dia completo).
export function calcularRutaCobertura(subgrafo, nodoInicioForzado) {
  const { nodos, aristas } = subgrafo;
  if (aristas.length === 0) return { coords: [], distanciaM: 0 };

  // Multigrafo de trabajo: se van a duplicar aristas para emparejar nodos
  // de grado impar, asi que se trabaja sobre una copia editable.
  const grado = new Map();
  aristas.forEach((a) => {
    grado.set(a.from, (grado.get(a.from) || 0) + 1);
    grado.set(a.to, (grado.get(a.to) || 0) + 1);
  });
  const impares = [...grado.entries()].filter(([, g]) => g % 2 !== 0).map(([id]) => id);

  const aristasTrabajo = [...aristas];
  // Emparejamiento voraz por cercania (no optimo, pero O(k^2) y suficiente
  // para el tamaño tipico de una sub-zona de volanteo).
  const restantes = [...impares];
  const paresParaConectar = [];
  // impares.length siempre es par (lema del apreton de manos), asi que en
  // modo "inicio forzado" (umbral 0) siempre termina emparejando todos sin
  // dejar ninguno suelto -- nunca entra al bucle con exactamente 1 restante.
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
  // Si queda 1 nodo impar sin par (solo quando no hay inicio forzado), la
  // ruta simplemente empieza o termina ahi -- valido (camino euleriano
  // abierto, no circuito cerrado).

  paresParaConectar.forEach(([a, b]) => {
    const { aristas: camino } = caminoMasCorto(subgrafo, a, b);
    camino.forEach((ar) => aristasTrabajo.push({ ...ar, id: `${ar.id}-dup${aristasTrabajo.length}` }));
  });

  // Hierholzer: recorre el multigrafo (ya balanceado) sin repetir ninguna
  // arista de aristasTrabajo, produciendo el circuito/camino euleriano.
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
  let distanciaM = 0;
  for (let i = 1; i < coords.length; i += 1) {
    distanciaM += haversineM(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng);
  }
  return { coords, distanciaM, callesUnicas: new Set(aristas.map((a) => a.wayId)).size };
}
