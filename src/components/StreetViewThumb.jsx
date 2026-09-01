import { useState } from "react";
import { streetViewUrlFromStr } from "../utils/streetView.js";

/** Miniatura de Street View a partir de un string de coordenadas "lat, lng".
 * Se oculta sola si no hay coordenadas o si Google no tiene imagen ahi. */
export default function StreetViewThumb({ coordenadas, width = 400, height = 200, style }) {
  const [error, setError] = useState(false);
  const url = streetViewUrlFromStr(coordenadas, { width, height });
  if (!url || error) return null;
  return (
    <img
      src={url}
      alt="Vista de calle"
      onError={() => setError(true)}
      style={{ width: "100%", maxWidth: width, borderRadius: 10, display: "block", ...style }}
    />
  );
}
