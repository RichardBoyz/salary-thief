import { dur } from "../fmt";
import {
  addDays,
  dayKey,
  dayStart,
  longestMs,
  msByDay,
  type SlackEvent,
  totalMs,
  weekStart,
  withActive,
} from "../slack";
import { useStore } from "../store";
import { t } from "../strings";

const MIN = 60_000;
const WEEKS = 12;

// GitHub 那張圖就是一個 CSS grid 裡塞方塊。裝 Recharts 只為了畫 84 個
// 有背景色的 div 是純虧損。等真的需要 tooltip 以外的互動再說。
// 熱度 = 金色的濃度 —— 摸魚就是偷錢,愈燙愈金。單色階不出調色盤
const LEVEL_BG = [
  "bg-crt-deep",
  "bg-crt-gold/20",
  "bg-crt-gold/45",
  "bg-crt-gold/70",
  "bg-crt-gold",
];

const level = (ms: number): number =>
  ms === 0 ? 0 : ms < 30 * MIN ? 1 : ms < 60 * MIN ? 2 : ms < 120 * MIN ? 3 : 4;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-panel px-4 py-3">
      <div className="text-crt-dim">{label}</div>
      <div className="mt-1 tabular-nums text-crt-white">{value}</div>
    </div>
  );
}

function Heatmap({ events }: { events: SlackEvent[] }) {
  const today = dayStart(Date.now());
  const first = weekStart(addDays(today, -(WEEKS - 1) * 7));
  const perDay = msByDay(events);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(first, i));

  return (
    <div>
      <div className="mb-2 text-crt-dim">{t.heatmap}</div>
      <div className="flex gap-1.5">
        <div className="grid grid-rows-7 gap-1 px-small leading-3 text-crt-dim">
          {["", "一", "", "三", "", "五", ""].map((d, i) => (
            <span key={i} className="h-3">
              {d}
            </span>
          ))}
        </div>
        {/* grid-flow-col + grid-rows-7 → 一欄就是一週,一列就是星期幾 */}
        <div className="grid grid-flow-col grid-rows-7 gap-1">
          {days.map((d) => {
            if (d > today) return <span key={d} className="size-3" />;
            const ms = perDay.get(dayKey(d)) ?? 0;
            return (
              <span
                key={d}
                // 原生 title 就是 tooltip,不需要任何套件
                title={`${dayKey(d)} ${ms ? `${t.slackedFor} ${dur(ms)}` : "沒摸魚"}`}
                className={`size-3 ${LEVEL_BG[level(ms)]}`}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 px-small text-crt-dim">
        <span>{t.less}</span>
        {LEVEL_BG.map((bg) => (
          <span key={bg} className={`size-3 ${bg}`} />
        ))}
        <span>{t.more}</span>
      </div>
    </div>
  );
}

export default function Stats({ onBack }: { onBack: () => void }) {
  const slackEvents = useStore((s) => s.slackEvents);
  const activeSince = useStore((s) => s.activeSince);

  // 這頁不需要跳錶,render 當下讀一次時鐘就夠了
  const now = Date.now();

  // 正在進行中的那一段也算進去,不然「摸魚中」的當下報告是空的
  const events: SlackEvent[] = withActive(slackEvents, activeSince, now);

  const monthFrom = dayStart(new Date(now).setDate(1));

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-[36px] text-crt-white">{t.stats}</h1>
        <button
          onClick={onBack}
          className="px-btn"
        >
          {t.back}
        </button>
      </header>

      {events.length === 0 ? (
        <p className="text-crt-dim">{t.noSlackData}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t.monthSlack} value={dur(totalMs(events, monthFrom, now))} />
            {/* v8 拿掉「摸魚換算」(時數 × 時薪)—— 沒有時薪了,換成同尺度的本週 */}
            <Stat label={t.weekSlack} value={dur(totalMs(events, weekStart(now), now))} />
            <Stat label={t.longest} value={dur(longestMs(events))} />
            <Stat label={t.sessions} value={`${events.length}`} />
          </div>

          <Heatmap events={events} />
        </>
      )}
    </div>
  );
}
