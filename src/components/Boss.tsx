// 老闆找你:不定時跳出像素 RPG 對話框,限時內按「回覆」就沒事;沒回扣今天偷到的 20%
// (伺服器算)。分頁在背景時不叫 —— 你看不到的東西不算你沒回。沒回的結果卡要按「知道了」
// 才排下一次:人不在位子上最多被扣一次,不會開著分頁整晚一直扣。
import { useEffect, useState, type ReactNode } from "react";
import { pts } from "../fmt";
import { points } from "../money";
import Actor, { STAND } from "../office/Actor";
import { lookOf } from "../office/sprite";
import { dayKey } from "../slack";
import { useStore } from "../store";
import { t } from "../strings";
import { bossFine } from "../sync";
import { useNow } from "../useNow";

/** 要在幾毫秒內回 */
const WAIT_MS = 15_000;
/** 隔多久來一次:這兩個之間隨機 */
const EVERY_MS = [20 * 60_000, 60 * 60_000] as const;
// 灰頭髮、白襯衫、紅領帶:全公司唯一一張固定的臉
const BOSS = lookOf({ hair: 0, hairColor: 4, skin: 0, shirt: 5, pants: 1, tie: 1 });

export default function Boss() {
  const until = useStore((s) => s.bossUntil);
  const setUntil = useStore((s) => s.setBossUntil);
  const addFined = useStore((s) => s.addFined);
  // 沒回之後的結果卡:扣了幾點;null = 沒扣成;undefined = 沒有結果卡
  const [result, setResult] = useState<number | null>();
  const [round, setRound] = useState(0);

  // 沒在找你、也沒有結果卡 → 排下一次。時間到時分頁在背景,就再等一輪
  useEffect(() => {
    if (until !== null || result !== undefined) return;
    const [lo, hi] = EVERY_MS;
    const id = setTimeout(
      () => (document.hidden ? setRound((r) => r + 1) : setUntil(Date.now() + WAIT_MS)),
      lo + Math.random() * (hi - lo),
    );
    return () => clearTimeout(id);
  }, [until, result, round, setUntil]);

  // 時間到還沒回 → 扣款。重新整理回來已經過期的,delay 是負的,掛上就扣
  useEffect(() => {
    if (until === null) return;
    const id = setTimeout(() => {
      setUntil(null);
      const day = dayKey(Date.now());
      const { zoneMs } = useStore.getState();
      void bossFine(points(zoneMs.day === day ? zoneMs.ms : 0, 0)).then((n) => {
        if (n) addFined(n, day);
        setResult(n);
      });
    }, until - Date.now());
    return () => clearTimeout(id);
  }, [until, setUntil, addFined]);

  if (until !== null) return <Call until={until} onReply={() => setUntil(null)} />;
  if (result === undefined) return null;
  return (
    <Dialog
      title={t.bossMissed}
      line={
        result === null
          ? t.bossFinedFail
          : result > 0
            ? `${t.bossFined} ${pts.format(result)} ${t.pointsUnit}${t.bossFinedWhy}`
            : t.bossFinedNone
      }
      button={t.bossOk}
      onButton={() => setResult(undefined)}
    />
  );
}

/** 老闆在等你:倒數條是金色的 —— 時間跑完,流掉的就是你的摸魚幣 */
function Call({ until, onReply }: { until: number; onReply: () => void }) {
  const now = useNow();
  const left = Math.max(0, until - now);
  return (
    <Dialog
      title={t.bossCalling}
      line={t.bossLines[until % t.bossLines.length]}
      // 一個字 50ms,從老闆出現那一刻算:重新整理回來不會重打一次
      typed={Math.floor((now - (until - WAIT_MS)) / 50)}
      button={t.bossReply}
      onButton={onReply}
    >
      <div className="flex items-center gap-2">
        <div className="px-bevel-in h-4 flex-1 overflow-hidden bg-crt-deep">
          <div className="px-meter h-full" style={{ width: `${(left / WAIT_MS) * 100}%` }} />
        </div>
        <span className="px-small tabular-nums text-crt-red">
          {Math.ceil(left / 1000)} {t.bossSec}
        </span>
      </div>
    </Dialog>
  );
}

/** 像素 RPG 對話框:上緣名牌、左邊老闆頭像、台詞一個字一個字跑出來 */
function Dialog({
  title,
  line,
  typed = Infinity,
  button,
  onButton,
  children,
}: {
  title: string;
  line: string;
  typed?: number;
  button: string;
  onButton: () => void;
  children?: ReactNode;
}) {
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-crt-deep/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="boss-title"
        aria-describedby="boss-line"
        className="px-panel px-unroll relative flex w-full max-w-xl gap-3 p-4 pt-5"
      >
        <span className="px-bevel absolute -top-4 left-3 bg-crt-bg px-2 px-small text-crt-gold">
          {t.boss}
        </span>
        <div className="px-bevel-in size-[68px] shrink-0 overflow-hidden bg-crt-deep">
          <Actor look={BOSS} pose={STAND} scale={2} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 id="boss-title" className="text-crt-red">
            {title}
          </h2>
          {/* 整句先佔好位置(讀屏也讀這份),跑出來的字疊在上面 —— 打字時框不會一直長高 */}
          <p id="boss-line" className="relative">
            <span className="opacity-0">{line}</span>
            <span aria-hidden className="absolute inset-0">
              {calm ? line : line.slice(0, typed)}
            </span>
          </p>
          {children}
          <button autoFocus onClick={onButton} className="px-btn self-end text-crt-gold">
            {button}
          </button>
        </div>
      </div>
    </div>
  );
}
