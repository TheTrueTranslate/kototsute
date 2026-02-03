import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "../features/shared/lib/firebase";
import { initWebI18n, resolveBrowserLocale } from "../features/shared/lib/i18n";
import "../index.css";

void initWebI18n(resolveBrowserLocale());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
