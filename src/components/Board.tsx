import { useEffect, useRef, useState } from "react";
import { t } from "../strings";
import { postMessage, useBoard, useSession } from "../sync";

/** 伺服器的錯誤是英文技術字串,對到看得懂的文案;沒對到就照實顯示 */
const errText = (msg: string): string =>
  msg.includes("too fast")
    ? t.boardTooFast
    : msg.includes("duplicate")
      ? t.boardDuplicate
      : msg.includes("daily limit")
        ? t.boardDailyLimit
        : msg.includes("too long")
          ? t.boardTooLong
          : msg.includes("no profile")
            ? t.boardNeedProfile
            : msg;

/** "14:03" —— 留言只留七天,不需要日期 */
const hhmm = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

const MAX = 140;

/**
 * 房間的留言板。開在辦公室裡(點牆上那塊白板),不是獨立頁面 —— 留言板
 * 屬於「這間辦公室」,一隊一房,跟辦公室本身同一個分房規則。
 *
 * `canPost` 為 false = 你在別隊房間串門子。你是幽靈,別隊的牆不歸你寫;
 * 而且伺服器蓋的是**你自己的隊**,就算硬送也只會貼到自己房間,看起來像
 * 訊息消失了 —— 直接把輸入框關掉比事後解釋清楚。
 */
export default function Board({
  team,
  canPost,
  onClose,
}: {
  team: string | null;
  canPost: boolean;
  onClose: () => void;
}) {
  const session = useSession();
  const { rows, refresh } = useBoard(team, 20_000);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 板子在地圖下方,而地圖有 384px 高 —— 手機上點了白板卻什麼都沒發生
  // (其實開在畫面外)是最糟的。捲進畫面裡,而且不搶走輸入焦點
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr(null);
    const msg = await postMessage(text);
    if (msg) setErr(errText(msg));
    else setBody("");
    setBusy(false);
    refresh();
  };

  return (
    <div
      ref={panel}
      className="px-panel px-unroll flex max-h-[70vh] flex-col gap-3 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-crt-white">
          {t.board}
          <span className="px-small ml-2 text-crt-dim">{team ?? t.lobby}</span>
        </span>
        <button onClick={onClose} className="px-btn">
          {t.close}
        </button>
      </div>

      <p className="px-small text-crt-dim">{t.boardHint}</p>

      {canPost ? (
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX))}
              maxLength={MAX}
              placeholder={t.boardPlaceholder}
              className="px-input"
            />
            <button
              type="submit"
              className="px-btn text-crt-gold"
              disabled={busy || !body.trim()}
            >
              {t.boardSend}
            </button>
          </div>
          <div className="px-small flex justify-between text-crt-dim">
            <span>{t.boardRateHint}</span>
            <span className="tabular-nums">
              {body.length}/{MAX}
            </span>
          </div>
        </form>
      ) : (
        <p className="px-small px-bevel-in bg-crt-deep px-3 py-2 text-crt-dim">
          {t.boardVisiting}
        </p>
      )}

      {err && <p className="px-bevel-in bg-crt-deep px-3 py-2 text-crt-red">{err}</p>}

      {rows.length === 0 ? (
        <p className="text-crt-dim">{t.boardEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {rows.map((m) => (
            <li
              key={m.id}
              className={`${m.user_id === session?.user.id ? "px-row-me" : "px-row"} flex flex-wrap items-baseline gap-x-2 px-3 py-2`}
            >
              <span className="px-small tabular-nums text-crt-dim">{hhmm(m.at)}</span>
              <span className="text-crt-gold">{m.handle}</span>
              {/* React 預設會轉義,所以這裡不需要任何消毒 ——
                  只要永遠不用 dangerouslySetInnerHTML,XSS 就不成立 */}
              <span className="flex-1 wrap-anywhere text-crt-white">{m.body}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
