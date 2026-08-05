import { dur, pts } from "../fmt";
import { msUntilOffWork, points, progress, workState, type WorkState } from "../money";
import { dayKey, dayStart, totalMs, weekStart, withActive } from "../slack";
import { useStore } from "../store";
import { t } from "../strings";
import { useSpots } from "../sync";
import { useNow } from "../useNow";

const countdown = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
};

// 進度條永遠是金色 —— 它量的是這一天,不是心情。狀態只染 label。
// 函式不做成模組常數:t 會原地換語言,抄在 module scope 字串就凍住了
const styleOf = (): Record<WorkState, { label: string; quip: string; dot: string; text: string }> => ({
  before: { label: t.stateBefore, quip: t.quipBefore, dot: "bg-crt-dim", text: "text-crt-dim" },
  working: {
    label: t.stateWorking,
    quip: t.quipWorking,
    dot: "bg-crt-green animate-pulse",
    text: "text-crt-green",
  },
  lunch: { label: t.stateLunch, quip: t.quipLunch, dot: "bg-crt-gold", text: "text-crt-gold" },
  after: { label: t.stateAfter, quip: t.quipAfter, dot: "bg-crt-white", text: "text-crt-white" },
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-panel px-4 py-3">
      <div className="text-crt-dim">{label}</div>
      <div className="mt-1 tabular-nums text-crt-white">{value}</div>
    </div>
  );
}

export default function Counter({
  onSettings,
  onStats,
  onOffice,
  onTeam,
  onHelp,
  onDisguise,
}: {
  onSettings: () => void;
  onStats: () => void;
  onOffice: () => void;
  onTeam: () => void;
  onHelp: () => void;
  onDisguise: () => void;
}) {
  const cfg = useStore((s) => s.config);
  const activeSince = useStore((s) => s.activeSince);
  const slackEvents = useStore((s) => s.slackEvents);
  const startSlacking = useStore((s) => s.startSlacking);
  const stopSlacking = useStore((s) => s.stopSlacking);
  const now = useNow();

  const state = workState(cfg, now);
  const s = styleOf()[state];
  // 大數字是摸魚幣:只來自辦公室外快區站立 + 漁獲獎勵,按鈕計時只記時數
  // (下面兩格與報告/排行榜),不生幣。v8 起這裡跟薪水完全無關。
  const events = withActive(slackEvents, activeSince, now);
  const zoneMs = useStore((st) => st.zoneMs);
  const { spots } = useSpots();
  const todayFishes = spots.filter((sp) => sp.caught).length;
  const stolen = points(zoneMs.day === dayKey(now) ? zoneMs.ms : 0, todayFishes);
  const pct = progress(cfg, now) * 100;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`size-3 ${s.dot}`} />
          <span className={s.text}>{s.label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 手機的手動老闆鍵:桌機按 Esc,手機沒有 Esc 就點這顆 */}
          <button
            onClick={onDisguise}
            className="px-bevel-in bg-crt-deep px-2 py-1 text-crt-dim hover:text-crt-white"
          >
            {t.bossKeyHint}
          </button>
          <button
            onClick={onOffice}
            className="px-btn"
          >
            {t.office}
          </button>
          <button
            onClick={onTeam}
            className="px-btn"
          >
            {t.team}
          </button>
          <button
            onClick={onStats}
            className="px-btn"
          >
            {t.stats}
          </button>
          <button
            onClick={onSettings}
            className="px-btn"
          >
            {t.settings}
          </button>
          <button onClick={onHelp} className="px-btn" title={t.helpTitle}>
            {t.help}
          </button>
        </div>
      </header>

      <div>
        <div className="text-crt-dim">{t.todayStolen}</div>
        {/* 48/72px 都是 12 的整數倍 —— 像素字型只在整數倍下乾淨。
            內文從 12 加到 24 時這個數字刻意不跟著翻倍:它本來就夠大,
            再翻一倍在窄螢幕上會直接爆版 */}
        <div className="mt-2 text-[48px] tabular-nums text-crt-gold sm:text-[72px]">
          {pts.format(stolen)}
          <span className="ml-2 text-[24px] text-crt-dim sm:text-[36px]">{t.pointsUnit}</span>
          <span className="px-cursor">▍</span>
        </div>
        <p className="mt-3 text-crt-dim">{s.quip}</p>
      </div>

      <div>
        <div className="mb-2 flex justify-between text-crt-dim">
          <span>{t.progressOfDay}</span>
          <span className="tabular-nums">{pct.toFixed(1)}%</span>
        </div>
        {/* 分段金條:量錢的儀表要一格一格,平滑漸層是現代網頁的東西 */}
        <div className="px-bevel-in h-4 overflow-hidden bg-crt-deep">
          <div className="px-meter h-full" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t.todaySlack} value={dur(totalMs(events, dayStart(now), now))} />
        <Stat label={t.untilOffWork} value={countdown(msUntilOffWork(cfg, now))} />
        <Stat label={t.weekSlack} value={dur(totalMs(events, weekStart(now), now))} />
      </div>

      {activeSince === null ? (
        // 開始摸魚 = 開始記時數 + 直接進辦公室,讓你走去綠框賺錢。
        // 進去時 activeSince 已非 null → 出生在茶水間,辦公室不會重複觸發
        <button
          onClick={() => {
            startSlacking();
            onOffice();
          }}
          className="px-btn py-3"
        >
          {t.startSlacking}
        </button>
      ) : (
        <button onClick={stopSlacking} className="px-btn py-3 text-crt-gold">
          {t.stopSlacking} · <span className="tabular-nums">{dur(now - activeSince)}</span>
        </button>
      )}
    </div>
  );
}
