import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { parseInvite } from "./companies";
import "./index.css";
import { useStore } from "./store";
import { lang } from "./strings";
import { initSync } from "./sync";

document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
initSync();

// 邀請連結:#join=… 進來就收進 store,馬上把網址洗乾淨 —— 這個 app 的
// 網址列任何時候都不該有東西可看(偽裝考量)。supabase 的 OAuth hash
// 不是合法邀請,parseInvite 會回 null,不會誤吃。
// hashchange 也聽:把連結貼進「已經開著的分頁」不會重載頁面。
const consumeInvite = () => {
  const invite = parseInvite(location.hash);
  if (invite) {
    useStore.getState().setPendingInvite(invite);
    history.replaceState(null, "", location.pathname + location.search);
  }
};
consumeInvite();
window.addEventListener("hashchange", consumeInvite);

// 只在 production 註冊 SW —— dev 有 HMR,SW 快取 dev 資源會很亂
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
