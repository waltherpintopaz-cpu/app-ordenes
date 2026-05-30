import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import SidebarApp from "./components/SidebarApp.jsx";
import "./App.css";

const isSidebar = window.location.pathname === "/sidebar";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isSidebar ? <SidebarApp /> : <App />}
  </React.StrictMode>
);
