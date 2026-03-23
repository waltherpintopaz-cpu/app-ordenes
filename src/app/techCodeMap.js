export const LEGACY_TECH_CODE_MAP = Object.freeze({
  "AFS-LUI-01": "Luis Pacsi",
  "AFS-WILL-01": "Willans H.",
  "AFS-HER-03": "Hernan Tticona",
  "AFS-JRC-04": "Juan Ramirez",
  "AFS-CRIS-05": "Cristian Huayapa",
  "AFS-WAL-06": "Walter Pinto",
  "AFS-ERI-07": "Erick Milton",
  "AFS-SCO-08": "Scott Gonzales",
  "AFS-PROVE": "Proveedor",
  "AFS-FRAN": "Francisco M.",
  "AFS-GRE": "Giovanny Robles",
  "AFS-NOD01": "Nodo_01",
  "AFS-NOD02": "Nodo_02",
  "AFS-NOD03": "Nodo_03",
  "AFS-NOD04": "Nodo_04",
  "AFS-ALE-02": "Alejandro Juno",
});

export const normalizeTechCode = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");

