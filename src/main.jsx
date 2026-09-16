import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
// SidebarApp SIGUE siendo import estatico (no lazy): ese archivo registra un
// listener de "message" en cuanto el modulo se evalua (__earlyMessageQueue),
// justo para no perder el postMessage "appContext" que Chatwoot manda apenas
// el iframe reporta que cargo. Si SidebarApp se carga como chunk aparte
// (lazy), ese mensaje puede llegar ANTES de que el archivo termine de
// descargarse/evaluarse y se pierde para siempre -- la pantalla se queda en
// "Esperando conversacion..." sin fin (confirmado en vivo: asi paso). Con
// import estatico, SidebarApp SI queda en el bundle principal (~279KB), pero
// eso es aceptable porque igual es mucho mas chico que App.jsx (~3.39MB),
// que es el que de verdad importaba sacar del camino y ese si sigue lazy.
import SidebarApp from "./components/SidebarApp.jsx";
import "./App.css";

// Carga por ruta con import() dinamico para las paginas SIN el problema de
// timing de arriba -- antes los 5 puntos de entrada se importaban todos de
// forma estatica, asi que Vite los empaquetaba juntos en un solo archivo de
// ~4.8MB. Con lazy(), Vite genera un archivo separado por cada uno y el
// navegador solo pide el que realmente corresponde a la ruta abierta.
const App = lazy(() => import("./App.jsx"));
const LibroReclamacionesPage = lazy(() => import("./components/LibroReclamacionesPage.jsx"));
const SeguimientoCompartidoPage = lazy(() => import("./components/SeguimientoCompartidoPage.jsx"));
const MapaVolanteoCompartidoPage = lazy(() => import("./components/MapaVolanteoCompartidoPage.jsx"));

const path = window.location.pathname;
const isSidebar = path === "/sidebar";
const isLibroReclamaciones = path === "/libro-reclamaciones";
const isSeguimientoCompartido = path === "/seguimiento";
const isMapaVolanteoCompartido = path === "/mapa-volanteo";

// Fallback minimo mientras carga el chunk de la ruta (App y las paginas
// compartidas). El sidebar no pasa por aca -- es estatico, ya esta listo.
const Cargando = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#64748b", fontSize: 13 }}>
    Cargando...
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isSidebar ? <SidebarApp /> : (
      <Suspense fallback={<Cargando />}>
        {isLibroReclamaciones ? <LibroReclamacionesPage />
          : isSeguimientoCompartido ? <SeguimientoCompartidoPage />
          : isMapaVolanteoCompartido ? <MapaVolanteoCompartidoPage />
          : <App />}
      </Suspense>
    )}
  </React.StrictMode>
);
