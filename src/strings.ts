// i18n。刻意不裝 i18next:兩包字串都在 bundle 裡(gzip 後幾 KB),切換 =
// 原地換掉 t 的內容 + 通知 App 重畫 —— 不重新整理頁面。
//
// t 是「可變物件、參考永遠不變」:所有 `import { t }` 照舊,元件在 render
// 時讀 t.xxx 就拿到新語言。代價是一條紀律:不准在 module scope 把 t.xxx
// 抄進常數(那會凍住舊語言),字串相關的表要放進元件裡建。
import { en } from "./locales/en";
import { zhTW, type Strings } from "./locales/zh-TW";

export type Lang = "zh-TW" | "en";

const LOCALES: Record<Lang, Strings> = { "zh-TW": zhTW, en };

const detect = (): Lang => {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;
  if (saved === "en" || saved === "zh-TW") return saved;
  return typeof navigator !== "undefined" && navigator.language.startsWith("en") ? "en" : "zh-TW";
};

export let lang: Lang = detect();
export const t: Strings = { ...LOCALES[lang] };

// App 用 useSyncExternalStore 訂閱這個;夠小,不值得為它拉狀態管理
const listeners = new Set<() => void>();
export const onLangChange = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** 切語言:存偏好、原地換字串、更新 <html lang>、叫 React 重畫。不 reload */
export const setLang = (l: Lang) => {
  if (l === lang) return;
  localStorage.setItem("lang", l);
  lang = l;
  Object.assign(t, LOCALES[l]);
  document.documentElement.lang = l === "en" ? "en" : "zh-Hant";
  listeners.forEach((fn) => fn());
};
