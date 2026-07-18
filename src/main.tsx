import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { lang } from "./strings";
import { initSync } from "./sync";

document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
initSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
