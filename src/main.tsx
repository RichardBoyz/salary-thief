import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { lang } from "./strings";
import { initSync } from "./sync";

document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
initSync();

// 只在 production 註冊 SW —— dev 有 HMR,SW 快取 dev 資源會很亂
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
