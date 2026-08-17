import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Counter from "./components/Counter";
import Disguise from "./components/Disguise";
import Help from "./components/Help";
import Settings from "./components/Settings";
import Stats from "./components/Stats";
import Stocks from "./components/Stocks";
import Team from "./components/Team";
import Office from "./office/Office";
import { useStore } from "./store";
import { lang, onLangChange, t } from "./strings";
import { useSession } from "./sync";

const setFavicon = (emoji: string) => {
  const link = document.querySelector<HTMLLinkElement>("link[rel=icon]");
  if (!link) return;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

// 不裝 router:網址列出現 /salary-thief 是這個 app 最大的破綻。
// 整個 app 活在同一個 URL 上,畫面切換一個 useState 就夠了。
// 留言板刻意不在這裡:它開在辦公室裡(點牆上那塊板),因為它屬於那間辦公室
type View = "counter" | "settings" | "stats" | "office" | "team" | "help" | "stocks";

// 字級只走像素字型的整數倍檔位(12/24/36/48/72/96)—— 12 是最小格,
// 所以「大一點」只有 24 這一個乾淨選擇,中間沒有 16/18 可以挑。
// 密集區(團隊列、徽章)退回 12,維持層級差。見 .claude/skills/pixel-ui。
const shell = "px-crt min-h-dvh bg-crt-bg font-pixel text-[24px] text-crt-white";

export default function App() {
  // 開站落點(useState 初始值只算一次,store 由 persist 同步還原,不閃畫面):
  // 點邀請連結進來(main.tsx 已收好 pendingInvite)→ 直接開團隊頁看加入提示 /
  // 登入;否則第一次開落說明頁,老使用者落計數器。
  const [view, setView] = useState<View>(
    useStore.getState().pendingInvite
      ? "team"
      : useStore.getState().helpSeen
        ? "counter"
        : "help",
  );
  const [disguised, setDisguised] = useState(false);
  // 雙擊逃生口要讀「點下當刻是否已偽裝」,同步更新(render 早於 effect)
  const disguisedRef = useRef(disguised);
  disguisedRef.current = disguised;
  const autoDisguise = useStore((s) => s.autoDisguise);
  // 語言切換不 reload:setLang 原地換 t 的內容後通知這裡,整棵樹重畫。
  // 全 app 沒有 memo,App 一重畫所有元件都會在 render 重讀 t.xxx
  const langNow = useSyncExternalStore(onLangChange, () => lang);
  // v8b:全 app 需要登入 —— 摸魚幣記在伺服器上,沒有帳號就沒有東西可以記
  const session = useSession();
  const setHelpSeen = useStore((s) => s.setHelpSeen);
  const closeHelp = () => {
    setHelpSeen(true);
    setView("counter");
  };

  // 導向:點邀請連結進來 → 一律切到團隊頁看加入提示 / 登入。用 mount effect
  // 而不是只靠 useState 初值 —— persist 補水與 setPendingInvite 在首次載入的
  // 時序不穩,初值偶爾讀不到 pendingInvite;effect 在 mount 後讀一定讀得到。
  useEffect(() => {
    if (useStore.getState().pendingInvite) setView("team");
  }, []);

  // 主題印在 <html>:CSS 變數換值,元件不用知道現在是深是亮。
  // 偽裝殼不受影響 —— 它不用調色盤變數(鐵律:永遠現代亮色 Excel)。
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 老闆鍵。純網頁在分頁沒有 focus 時收不到鍵盤事件,所以這顆鍵只在你正
  // 盯著這個分頁時有效 —— 而那正是你最不需要它的時候。要系統層級的全域
  // 熱鍵得做成 Chrome 擴充或桌面 app。這裡真正實用的是下面的 blur。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDisguised((d) => !d);
    };
    // 手機沒有 Esc,偽裝中快速點兩下當逃生口。用 click 自己數而不是 dblclick:
    // 這是手機唯一的出口,不能賭 iOS 對 dblclick 的支援。
    // 只在「已偽裝」時累計 —— 進入偽裝的那一下(老闆鍵按鈕)發生在未偽裝時,
    // 會 reset 計數,所以連點按鈕不會進了又被馬上解除。
    let last = 0;
    const onClick = () => {
      if (!disguisedRef.current) {
        last = 0;
        return;
      }
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
  }, [disguised, langNow]);

  // 偽裝時 Counter 整個 unmount,計時器跟著停。回來重新掛載時金額直接
  // 從時鐘算出正確值 —— 這是 earnedToday 是純函式換來的。
  // 偽裝殼在 px-crt 掃描線這層之外(early return)—— 假 Excel 必須是現代臉。
  if (disguised) return <Disguise />;

  // 還在問 supabase 有沒有 session:先不畫。undefined 跟 null 分開就是為了
  // 這一格 —— 不然已登入的人每次開頁都會先閃一下登入畫面。
  if (session === undefined) return <main className={shell} />;

  // 沒登入 → 只給團隊頁。它本來就是登入 UI 的所在地,而且邀請連結的流程
  // 本來就得在登入前先跑一段(先看到誰邀請你、哪間房,再要求登入)。
  // 沒有 onBack 可以逃 —— 這是閘門,不是分頁。
  if (session === null)
    return (
      <main className={shell}>
        <Team />
      </main>
    );

  return (
    <main className={shell}>
      {view === "counter" && (
        <Counter
          onSettings={() => setView("settings")}
          onStats={() => setView("stats")}
          onOffice={() => setView("office")}
          onStocks={() => setView("stocks")}
          onTeam={() => setView("team")}
          onHelp={() => setView("help")}
          onDisguise={() => setDisguised(true)}
        />
      )}
      {view === "settings" && <Settings onBack={() => setView("counter")} />}
      {view === "stats" && <Stats onBack={() => setView("counter")} />}
      {view === "stocks" && <Stocks onBack={() => setView("counter")} />}
      {view === "office" && <Office onBack={() => setView("counter")} />}
      {view === "team" && <Team onBack={() => setView("counter")} />}
      {view === "help" && <Help onClose={closeHelp} />}
    </main>
  );
}
