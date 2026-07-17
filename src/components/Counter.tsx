import { useEffect, useState } from "react";
import {
  earnedToday,
  msUntilOffWork,
  progress,
  ratePerSecond,
  todayShift,
  workState,
  type WorkState,
} from "../money";
import { useStore } from "../store";
import { t } from "../strings";

/**
 * 每 100ms 重讀一次時鐘。
 *
 * 這裡的 setInterval 只負責「叫 React 重畫」,不負責算錢 —— 錢是 money.ts
 * 從 now 推導的。所以瀏覽器把背景分頁的計時器降頻到每秒一次也無所謂,
 * 切回來的第一次 tick 就是正確數字。
 *
 * 為什麼是 100ms 而不是 rAF:金額只顯示到小數點後兩位,每秒大約變 8 次,
 * 60fps 等於把同樣的數字重畫 52 次。這個 app 會被開著一整天,不值得為了
 * 看不出來的滑順度燒一整天的 CPU。
 */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  return now;
}

const twd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const twdFine = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const countdown = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
};

const style: Record<WorkState, { label: string; quip: string; dot: string; text: string; bar: string }> = {
  before: {
    label: t.stateBefore,
    quip: t.quipBefore,
    dot: "bg-slate-400",
    text: "text-slate-400",
    bar: "bg-slate-500",
  },
  working: {
    label: t.stateWorking,
    quip: t.quipWorking,
    dot: "bg-emerald-400 animate-pulse",
    text: "text-emerald-400",
    bar: "bg-emerald-500",
  },
  lunch: {
    label: t.stateLunch,
    quip: t.quipLunch,
    dot: "bg-amber-400",
    text: "text-amber-400",
    bar: "bg-amber-500",
  },
  after: {
    label: t.stateAfter,
    quip: t.quipAfter,
    dot: "bg-sky-400",
    text: "text-sky-400",
    bar: "bg-sky-500",
  },
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold tabular-nums text-slate-200">{value}</div>
    </div>
  );
}

export default function Counter({ onSettings }: { onSettings: () => void }) {
  const cfg = useStore((s) => s.config);
  const now = useNow();

  const state = workState(cfg, now);
  const s = style[state];
  const earned = earnedToday(cfg, now);
  const pct = progress(cfg, now) * 100;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${s.dot}`} />
          <span className={`text-sm font-medium ${s.text}`}>{s.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <kbd className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-500">
            {t.bossKeyHint}
          </kbd>
          <button
            onClick={onSettings}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            {t.settings}
          </button>
        </div>
      </header>

      <div>
        <div className="text-sm text-slate-500">{t.todayEarned}</div>
        <div className="mt-2 text-5xl font-bold tabular-nums tracking-tight text-slate-50 sm:text-7xl">
          {twd.format(earned)}
        </div>
        <p className="mt-3 text-sm text-slate-500">{s.quip}</p>
      </div>

      <div>
        <div className="mb-2 flex justify-between text-xs text-slate-500">
          <span>{t.progressOfDay}</span>
          <span className="tabular-nums">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${s.bar}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t.perSecond} value={twdFine.format(ratePerSecond(cfg, now))} />
        <Stat label={t.untilOffWork} value={countdown(msUntilOffWork(cfg, now))} />
        <Stat label={t.dailyPay} value={twd.format(todayShift(cfg, now).dailyPay)} />
      </div>
    </div>
  );
}
