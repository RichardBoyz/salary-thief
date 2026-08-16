import { useState } from "react";
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

export default function Board({ onBack }: { onBack: () => void }) {
  const session = useSession();
  const { rows, refresh } = useBoard(20_000);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-[36px] text-crt-white">{t.board}</h1>
        <button onClick={onBack} className="px-btn">
          {t.back}
        </button>
      </header>

      <p className="px-small text-crt-dim">{t.boardHint}</p>

      <form
        className="flex flex-col gap-2"
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
          <button type="submit" className="px-btn text-crt-gold" disabled={busy || !body.trim()}>
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

      {err && <p className="px-bevel-in bg-crt-deep px-3 py-2 text-crt-red">{err}</p>}

      {rows.length === 0 ? (
        <p className="text-crt-dim">{t.boardEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
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
