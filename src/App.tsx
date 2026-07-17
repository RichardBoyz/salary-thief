import { useState } from "react";
import Counter from "./components/Counter";
import Settings from "./components/Settings";

// 不裝 router:網址列出現 /salary-thief 是這個 app 最大的破綻。
// 整個 app 活在同一個 URL 上,畫面切換一個 useState 就夠了。
type View = "counter" | "settings";

export default function App() {
  const [view, setView] = useState<View>("counter");

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100 antialiased">
      {view === "counter" ? (
        <Counter onSettings={() => setView("settings")} />
      ) : (
        <Settings onBack={() => setView("counter")} />
      )}
    </main>
  );
}
