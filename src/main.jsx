import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./App.css";

// Carga por ruta con import() dinamico -- antes los 5 puntos de entrada
// (App, SidebarApp y 3 paginas compartidas) se importaban todos de forma
// estatica arriba, asi que Vite los empaquetaba juntos en un solo archivo
// de ~4.8MB. Eso significaba que abrir el sidebar dentro de Chatwoot
// descargaba y parseaba TODO App.jsx (el panel completo, ~28000 lineas,
// con mapas/leaflet, escaner QR, generacion de PDF, etc.) sin usar nada de
// eso. Con lazy(), Vite genera un archivo separado por cada uno y el
// navegador solo pide el que realmente corresponde a la ruta abierta.
const App = lazy(() => import("./App.jsx"));
const SidebarApp = lazy(() => import("./components/SidebarApp.jsx"));
const LibroReclamacionesPage = lazy(() => import("./components/LibroReclamacionesPage.jsx"));
const SeguimientoCompartidoPage = lazy(() => import("./components/SeguimientoCompartidoPage.jsx"));
const MapaVolanteoCompartidoPage = lazy(() => import("./components/MapaVolanteoCompartidoPage.jsx"));

const path = window.location.pathname;
const isSidebar = path === "/sidebar";
const isLibroReclamaciones = path === "/libro-reclamaciones";
const isSeguimientoCompartido = path === "/seguimiento";
const isMapaVolanteoCompartido = path === "/mapa-volanteo";

// Fallback minimo mientras carga el chunk de la ruta -- en el sidebar debe
// ser practicamente invisible (carga rapida, chunk pequeño); en el panel
// completo puede tardar un poco mas la primera vez.
const Cargando = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#64748b", fontSize: 13 }}>
    Cargando...
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={<Cargando />}>
      {isSidebar ? <SidebarApp />
        : isLibroReclamaciones ? <LibroReclamacionesPage />
        : isSeguimientoCompartido ? <SeguimientoCompartidoPage />
        : isMapaVolanteoCompartido ? <MapaVolanteoCompartidoPage />
        : <App />}
    </Suspense>
  </React.StrictMode>
);
