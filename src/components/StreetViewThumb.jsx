import { useState } from "react";
import { streetViewUrlFromStr, streetViewEmbedUrlFromStr, parseCoordsStr } from "../utils/streetView.js";

/** Foto de Google Street View a partir de un string de coordenadas
 * "lat, lng" — se muestra directo. Boton opcional para pasar a la vista
 * interactiva 360° (arrastrable), que recien ahi carga el iframe. */
export default function StreetViewThumb({ coordenadas, height = 220, style }) {
  const [modo360, setModo360] = useState(false);
  const [error, setError] = useState(false);
  if (!parseCoordsStr(coordenadas)) return null;

  if (modo360) {
    const embedUrl = streetViewEmbedUrlFromStr(coordenadas);
    if (!embedUrl) return null;
    return (
      <iframe
        src={embedUrl}
        title="Vista de calle"
        loading="lazy"
        allowFullScreen
        style={{ width: "100%", height, border: "none", borderRadius: 10, display: "block", ...style }}
      />
    );
  }

  const url = streetViewUrlFromStr(coordenadas, { width: 500, height });
  if (!url || error) return null;
  return (
    <div style={{ position: "relative", ...style }}>
      <img
        src={url}
        alt="Vista de calle"
        onError={() => setError(true)}
        style={{ width: "100%", height, objectFit: "cover", borderRadius: 10, display: "block" }}
      />
      <button
        type="button"
        onClick={() => setModo360(true)}
        title="Ver vista interactiva 360°"
        style={{
          position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.65)", color: "#fff",
          border: "none", borderRadius: 6, padding: "4px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer",
        }}
      >
        🔄 Ver en 360°
      </button>
    </div>
  );
}
