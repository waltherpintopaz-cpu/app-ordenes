import { useState } from "react";
import { streetViewEmbedUrlFromStr, parseCoordsStr } from "../utils/streetView.js";

/** Street View interactivo (360°, arrastrable) a partir de un string de
 * coordenadas "lat, lng". Oculto por defecto — se muestra recien al
 * tocar el boton, para no cargarlo de mas cuando no se necesita. */
export default function StreetViewThumb({ coordenadas, height = 220, style }) {
  const [mostrar, setMostrar] = useState(false);
  const url = streetViewEmbedUrlFromStr(coordenadas);
  if (!url || !parseCoordsStr(coordenadas)) return null;

  if (!mostrar) {
    return (
      <button
        type="button"
        onClick={() => setMostrar(true)}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "#eff6ff", color: "#2563eb",
          border: "1px solid #bfdbfe", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600,
          cursor: "pointer", width: "100%", justifyContent: "center", ...style,
        }}
      >
        📷 Ver vista de calle 360°
      </button>
    );
  }

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
