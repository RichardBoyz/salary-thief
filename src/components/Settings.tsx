import type { ReactNode } from "react";
import { todayShift } from "../money";
import { useStore } from "../store";
import { t } from "../strings";

const input =
  "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 tabular-nums outline-none transition focus:border-emerald-500";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default function Settings({ onBack }: { onBack: () => void }) {
  const cfg = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const autoDisguise = useStore((s) => s.autoDisguise);
  const setAutoDisguise = useStore((s) => s.setAutoDisguise);

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
        <h1 className="text-lg font-semibold text-slate-100">{t.settings}</h1>
        <button
          onClick={onBack}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          {t.back}
        </button>
      </header>

      <div className="grid gap-4">
        <Field label={t.monthlySalary}>
          <input
            type="number"
            min={0}
            step={1000}
            value={cfg.monthlySalary}
            onChange={(e) =>
              setConfig({ monthlySalary: Math.max(0, e.target.valueAsNumber || 0) })
            }
            className={input}
          />
        </Field>

        <Field label={t.workdaysPerMonth}>
          <input
            type="number"
            min={1}
            max={31}
            value={cfg.workdaysPerMonth}
            onChange={(e) =>
              setConfig({ workdaysPerMonth: Math.max(1, e.target.valueAsNumber || 1) })
            }
            className={input}
          />
        </Field>

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

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3">
        <input
          type="checkbox"
          checked={autoDisguise}
          onChange={(e) => setAutoDisguise(e.target.checked)}
          className="mt-0.5 size-4 accent-emerald-500"
        />
        <span>
          <span className="text-sm text-slate-200">{t.autoDisguise}</span>
          <span className="mt-0.5 block text-xs text-slate-500">{t.autoDisguiseHint}</span>
        </span>
      </label>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <p className="text-xs text-slate-600">{t.settingsHint}</p>
    </div>
  );
}
