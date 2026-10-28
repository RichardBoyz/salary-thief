import { useEffect, useState, useSyncExternalStore } from "react";
import Boss from "./components/Boss";
import Counter from "./components/Counter";
import Help from "./components/Help";
import Settings from "./components/Settings";
import Stats from "./components/Stats";
import Stocks from "./components/Stocks";
import Team from "./components/Team";
import Lounge from "./office/Lounge";
import Office from "./office/Office";
import { useStore } from "./store";
import { lang, onLangChange, t } from "./strings";
import { useSession } from "./sync";

// 不裝 router:網址列出現 /salary-thief 是這個 app 最大的破綻。
// 整個 app 活在同一個 URL 上,畫面切換一個 useState 就夠了。
// 留言板刻意不在這裡:它開在辦公室裡(點牆上那塊板),因為它屬於那間辦公室
type View = "counter" | "settings" | "stats" | "office" | "lounge" | "team" | "help" | "stocks";

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
  // 從休息室走門回辦公室:辦公室的出生點在門口,不是座位
  const [atDoor, setAtDoor] = useState(false);
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
  const toOffice = () => {
    setAtDoor(false);
    setView("office");
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

  // 分頁標題跟著語言走(index.html 寫死的是中文)
  useEffect(() => {
    document.title = t.appName;
  }, [langNow]);

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
          onOffice={toOffice}
          onStocks={() => setView("stocks")}
          onTeam={() => setView("team")}
          onHelp={() => setView("help")}
        />
      )}
      {view === "settings" && <Settings onBack={() => setView("counter")} />}
      {view === "stats" && <Stats onBack={() => setView("counter")} />}
      {view === "stocks" && <Stocks onBack={() => setView("counter")} />}
      {view === "office" && (
        <Office
          atDoor={atDoor}
          onBack={() => setView("counter")}
          onLounge={() => setView("lounge")}
        />
      )}
      {view === "lounge" && (
        <Lounge
          onBack={() => {
            setAtDoor(true);
            setView("office");
          }}
        />
      )}
      {view === "team" && <Team onBack={() => setView("counter")} onOffice={toOffice} />}
      {view === "help" && <Help onClose={closeHelp} />}
      {/* 老闆不管你在哪一頁都會找上門。只在登入後:扣款記在伺服器的帳上 */}
      <Boss />
    </main>
  );
}
