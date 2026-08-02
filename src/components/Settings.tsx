import type { ReactNode } from "react";
import { todayShift } from "../money";
import { useStore } from "../store";
import { lang, setLang, t, type Lang } from "../strings";

const input = "px-input tabular-nums";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-crt-dim">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default function Settings({ onBack }: { onBack: () => void }) {
  const cfg = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const autoDisguise = useStore((s) => s.autoDisguise);
  const setAutoDisguise = useStore((s) => s.setAutoDisguise);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const resetData = useStore((s) => s.resetData);

  const shift = todayShift(cfg, Date.now());
  const error =
    shift.end <= shift.start
      ? t.errShiftOrder
      : shift.paidMs <= 0
        ? t.errLunchTooLong
        : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl text-crt-white">{t.settings}</h1>
        <button
          onClick={onBack}
          className="px-btn"
        >
          {t.back}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-crt-dim">{t.lang}</span>
        <div className="flex gap-1">
          {(["zh-TW", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => l !== lang && setLang(l)}
              className={`px-2.5 py-1 text-xs ${
                lang === l ? "px-bevel-in bg-crt-deep text-crt-white" : "text-crt-dim hover:text-crt-white"
              }`}
            >
              {l === "zh-TW" ? "中文" : "EN"}
            </button>
          ))}
        </div>
        <span className="ml-3 text-crt-dim">{t.theme}</span>
        <div className="flex gap-1">
          {(["dark", "light"] as const).map((th) => (
            <button
              key={th}
              onClick={() => setTheme(th)}
              className={`px-2.5 py-1 text-xs ${
                theme === th ? "px-bevel-in bg-crt-deep text-crt-white" : "text-crt-dim hover:text-crt-white"
              }`}
            >
              {th === "dark" ? t.themeDark : t.themeLight}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          {/* <input type="time"> 是原生的:手機上會叫出系統時間選擇器,
              值直接就是 "09:00" 字串,不需要任何日期套件去解析 */}
          <Field label={t.shiftStart}>
            <input
              type="time"
              value={cfg.shiftStart}
              onChange={(e) => e.target.value && setConfig({ shiftStart: e.target.value })}
              className={input}
            />
          </Field>
          <Field label={t.shiftEnd}>
            <input
              type="time"
              value={cfg.shiftEnd}
              onChange={(e) => e.target.value && setConfig({ shiftEnd: e.target.value })}
              className={input}
            />
          </Field>
          <Field label={t.lunchStart}>
            <input
              type="time"
              value={cfg.lunchStart}
              onChange={(e) => e.target.value && setConfig({ lunchStart: e.target.value })}
              className={input}
            />
          </Field>
          <Field label={t.lunchMinutes}>
            <input
              type="number"
              min={0}
              max={240}
              step={15}
              value={cfg.lunchMinutes}
              onChange={(e) =>
                setConfig({ lunchMinutes: Math.max(0, e.target.valueAsNumber || 0) })
              }
              className={input}
            />
          </Field>
        </div>
      </div>

      <label className="px-panel flex cursor-pointer items-start gap-3 px-3 py-3">
        <input
          type="checkbox"
          checked={autoDisguise}
          onChange={(e) => setAutoDisguise(e.target.checked)}
          className="mt-0.5 size-4 accent-crt-gold"
        />
        <span>
          <span className="text-crt-white">{t.autoDisguise}</span>
          <span className="mt-0.5 block text-crt-dim">{t.autoDisguiseHint}</span>
        </span>
      </label>

      {error && (
        <p className="px-bevel-in bg-crt-deep px-3 py-2 text-crt-red">{error}</p>
      )}

      {/* confirm() 是原生的破壞性操作攔截,不為一顆按鈕做自訂對話框 */}
      <button
        onClick={() => window.confirm(t.resetConfirm) && resetData()}
        className="px-btn self-start text-crt-red"
      >
        {t.resetData}
      </button>

      <p className="text-crt-dim">{t.settingsHint}</p>
    </div>
  );
}
