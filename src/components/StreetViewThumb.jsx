import { streetViewEmbedUrlFromStr, parseCoordsStr } from "../utils/streetView.js";

/** Street View interactivo (360°, arrastrable) a partir de un string de
 * coordenadas "lat, lng". Se oculta sola si no hay coordenadas validas. */
export default function StreetViewThumb({ coordenadas, height = 220, style }) {
  const url = streetViewEmbedUrlFromStr(coordenadas);
  if (!url || !parseCoordsStr(coordenadas)) return null;
  return (
    <iframe
      src={url}
      title="Vista de calle"
      loading="lazy"
      allowFullScreen
      style={{ width: "100%", height, border: "none", borderRadius: 10, display: "block", ...style }}
    />
  );
}
