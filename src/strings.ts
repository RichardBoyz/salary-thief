// i18n。刻意不裝 i18next:語言在載入時選定一次,切換靠寫 localStorage +
// reload。這樣所有 `import { t }` 照舊,連 module-scope 的 t.xxx 都不用改
// (reload 會讓 t 重新選)。中英切換用 reload 完全可接受,這不是 SPA 關鍵路徑。
import { en } from "./locales/en";
import { zhTW, type Strings } from "./locales/zh-TW";

export type Lang = "zh-TW" | "en";

const LOCALES: Record<Lang, Strings> = { "zh-TW": zhTW, en };

const detect = (): Lang => {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;
  if (saved === "en" || saved === "zh-TW") return saved;
  return typeof navigator !== "undefined" && navigator.language.startsWith("en") ? "en" : "zh-TW";
};

export const lang: Lang = detect();
export const t: Strings = LOCALES[lang];

/** 切語言 = 存偏好 + 重載。document.lang 也順手更新 */
export const setLang = (l: Lang) => {
  localStorage.setItem("lang", l);
  location.reload();
};
