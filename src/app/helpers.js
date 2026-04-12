import {
  defaultTiposEquipoCatalogo,
} from "./constants";

export function normalizarRolUsuario(rol) {
  const text = String(rol || "").trim().toLowerCase();
  if (text === "gestor") return "Gestora";
  if (text === "gestora") return "Gestora";
  if (text === "tecnico") return "Tecnico";
  if (text === "almacen") return "Almacen";
  if (text === "administrador") return "Administrador";
  return "Tecnico";
}

export function asegurarUsuariosBase(listaUsuarios) {
  const lista = Array.isArray(listaUsuarios) ? [...listaUsuarios] : [];
  const usados = new Set();

  const generarUsername = (base, idx) => {
    const limpio = String(base || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");

    const raiz = limpio || `user${idx + 1}`;
    let candidato = raiz;
    let sufijo = 1;

    while (usados.has(candidato)) {
      candidato = `${raiz}${sufijo}`;
      sufijo += 1;
    }

    usados.add(candidato);
    return candidato;
  };

  const normalizados = lista.map((u, idx) => {
    const baseUsername = String(u.username || "").trim();
    const username = baseUsername
      ? (() => {
          const limpio = baseUsername.toLowerCase();
          if (!usados.has(limpio)) {
            usados.add(limpio);
            return limpio;
          }

          let sufijo = 1;
          let candidato = `${limpio}${sufijo}`;
          while (usados.has(candidato)) {
            sufijo += 1;
            candidato = `${limpio}${sufijo}`;
          }
          usados.add(candidato);
          return candidato;
        })()
      : generarUsername(u.nombre, idx);

    return {
      ...u,
      rol: normalizarRolUsuario(u.rol),
      username,
      password: String(u.password || "").trim() || "123456",
    };
  });

  const tieneAdministrador = normalizados.some(
    (u) => normalizarRolUsuario(u.rol) === "Administrador"
  );
  const tieneAlmacen = normalizados.some(
    (u) => normalizarRolUsuario(u.rol) === "Almacen"
  );

  let nextId = normalizados.reduce((max, u) => Math.max(max, Number(u.id) || 0), 0) + 1;

  if (!tieneAdministrador) {
    normalizados.unshift({
      id: nextId++,
      nombre: "Admin General",
      username: "admin",
      password: "admin123",
      rol: "Administrador",
      celular: "900000001",
      email: "",
      empresa: "Americanet",
      activo: true,
      fechaCreacion: new Date().toLocaleString(),
    });
  }

  if (!tieneAlmacen) {
    normalizados.push({
      id: nextId++,
      nombre: "Carlos Almacen",
      username: "almacen",
      password: "almacen123",
      rol: "Almacen",
      celular: "977777777",
      email: "",
      empresa: "Americanet",
      activo: true,
      fechaCreacion: new Date().toLocaleString(),
    });
  }

  return normalizados;
}

export function normalizarTiposEquipoCatalogo(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, idx) => {
      if (typeof item === "string") {
        return {
          id: idx + 1,
          nombre: item,
          marcas: [],
        };
      }

      const marcas = Array.isArray(item?.marcas)
        ? item.marcas
            .map((m) => String(m || "").trim())
            .filter(Boolean)
            .filter(
              (marca, i, arr) =>
                arr.findIndex((x) => x.toLowerCase() === marca.toLowerCase()) === i
            )
        : [];

      return {
        id: item?.id || idx + 1,
        nombre: String(item?.nombre || "").trim(),
        marcas,
      };
    })
    .filter((item) => item.nombre);
}

export function safeIncludes(value, search) {
  return String(value || "").toLowerCase().includes(search);
}

export function esTipoOnu(tipo) {
  const text = String(tipo || "").toLowerCase();
  return text.includes("onu") || text.includes("ont");
}

export function parseCoords(value) {
  const text = String(value || "").trim();
  if (!text.includes(",")) return null;

  const [latStr, lngStr] = text.split(",").map((x) => x.trim());
  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return [lat, lng];
}

export function fechaDentroDeRango(fecha, desde, hasta) {
  if (!fecha) return true;

  const raw = String(fecha).trim();
  let fechaBase;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    fechaBase = raw;
  } else {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      fechaBase = raw.slice(0, 10);
    } else {
      const p = (n) => String(n).padStart(2, "0");
      fechaBase = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
  }

  if (desde && fechaBase < desde) return false;
  if (hasta && fechaBase > hasta) return false;

  return true;
}

export function normalizarFechaFiltro(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  // Soporta formatos locales comunes: dd/mm/yyyy, dd-mm-yyyy (con o sin hora).
  const localMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (localMatch) {
    const day = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const year = Number(localMatch[3]);

    if (
      Number.isFinite(day) &&
      Number.isFinite(month) &&
      Number.isFinite(year) &&
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12 &&
      year >= 1900
    ) {
      const yyyy = String(year).padStart(4, "0");
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function getDefaultTipoEquipo() {
  return defaultTiposEquipoCatalogo[0] || "ONU";
}
