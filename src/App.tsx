import { useEffect, useState } from "react";
import Counter from "./components/Counter";
import Disguise from "./components/Disguise";
import Settings from "./components/Settings";
import Stats from "./components/Stats";
import Team from "./components/Team";
import Office from "./office/Office";
import { useStore } from "./store";
import { t } from "./strings";

const setFavicon = (emoji: string) => {
  const link = document.querySelector<HTMLLinkElement>("link[rel=icon]");
  if (!link) return;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

// 不裝 router:網址列出現 /salary-thief 是這個 app 最大的破綻。
// 整個 app 活在同一個 URL 上,畫面切換一個 useState 就夠了。
type View = "counter" | "settings" | "stats" | "office" | "team";

export default function App() {
  const [view, setView] = useState<View>("counter");
  const [disguised, setDisguised] = useState(false);
  const autoDisguise = useStore((s) => s.autoDisguise);

  // 老闆鍵。純網頁在分頁沒有 focus 時收不到鍵盤事件,所以這顆鍵只在你正
  // 盯著這個分頁時有效 —— 而那正是你最不需要它的時候。要系統層級的全域
  // 熱鍵得做成 Chrome 擴充或桌面 app。這裡真正實用的是下面的 blur。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDisguised((d) => !d);
    };
    // 手機沒有 Esc,快速點兩下當逃生口。只解除、不進入 —— 進入若也綁雙擊,
    // 連點按鈕就會誤觸偽裝。用 click 自己數而不是 dblclick:這是手機唯一的
    // 出口,不能賭 iOS 對 dblclick 的支援。沒偽裝時多點只是 no-op。
    let last = 0;
    const onClick = () => {
      const now = Date.now();
      if (now - last < 400) setDisguised(false);
      last = now;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  // 你 alt-tab 走開的當下畫面就已經偽裝好了,回來才需要按鍵解除。
  // 比熱鍵實用,因為它不需要你反應得夠快。
  useEffect(() => {
    if (!autoDisguise) return;
    const hide = () => setDisguised(true);
    window.addEventListener("blur", hide);
    return () => window.removeEventListener("blur", hide);
  }, [autoDisguise]);

  // 分頁標題和 favicon 是比畫面本身更大的破綻:整個螢幕都是試算表,
  // 分頁上卻寫著「薪水小偷」還掛著一個 💰。
  useEffect(() => {
    document.title = disguised ? t.disguiseTitle : t.appName;
    setFavicon(disguised ? "📊" : "💰");
  }, [disguised]);

  // 偽裝時 Counter 整個 unmount,計時器跟著停。回來重新掛載時金額直接
  // 從時鐘算出正確值 —— 這是 earnedToday 是純函式換來的。
  // 偽裝殼在 px-crt 掃描線這層之外(early return)—— 假 Excel 必須是現代臉。
  if (disguised) return <Disguise />;

  return (
    <main className="px-crt min-h-dvh bg-crt-bg font-pixel text-[12px] text-crt-white">
      {view === "counter" && (
        <Counter
          onSettings={() => setView("settings")}
          onStats={() => setView("stats")}
          onOffice={() => setView("office")}
          onTeam={() => setView("team")}
        />
      )}
      {view === "settings" && <Settings onBack={() => setView("counter")} />}
      {view === "stats" && <Stats onBack={() => setView("counter")} />}
      {view === "office" && <Office onBack={() => setView("counter")} />}
      {view === "team" && <Team onBack={() => setView("counter")} />}
    </main>
  );
}
