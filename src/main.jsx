import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import SidebarApp from "./components/SidebarApp.jsx";
import LibroReclamacionesPage from "./components/LibroReclamacionesPage.jsx";
import SeguimientoCompartidoPage from "./components/SeguimientoCompartidoPage.jsx";
import MapaVolanteoCompartidoPage from "./components/MapaVolanteoCompartidoPage.jsx";
import "./App.css";

const path = window.location.pathname;
const isSidebar = path === "/sidebar";
const isLibroReclamaciones = path === "/libro-reclamaciones";
const isSeguimientoCompartido = path === "/seguimiento";
const isMapaVolanteoCompartido = path === "/mapa-volanteo";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isSidebar ? <SidebarApp />
      : isLibroReclamaciones ? <LibroReclamacionesPage />
      : isSeguimientoCompartido ? <SeguimientoCompartidoPage />
      : isMapaVolanteoCompartido ? <MapaVolanteoCompartidoPage />
      : <App />}
  </React.StrictMode>
);
