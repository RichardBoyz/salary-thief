import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { dur, pts } from "../fmt";
import { errorKind, type Facing, type Member } from "../lounge";
import { useStore } from "../store";
import { t } from "../strings";
import type { Room, RoomStatus } from "../sync";
import { EMOJIS, type Standing } from "../team";
import Actor, { NameTag, STAND, type Pose } from "./Actor";
import { TILE, tileOf, type GameMap, type Pos } from "./map";
import { WALK, type Look } from "./sprite";
import { actorAt, center, depth, facing, SPEED, STRIDE } from "./useWalker";

// 兩間即時房間(休息室、辦公室)共用的零件:別人的人影、頭上的泡泡、聊天面板、
// 點人物看他是誰的小卡、門旁邊的指示牌。

/** 聊天泡泡在頭上停幾秒、表情停幾秒 */
const SAY_MS = 6000;
const EMOTE_MS = 3000;

export const facingOf = (p: Pose): Facing =>
  p.dir === "side" ? (p.flip ? "left" : "right") : p.dir;

const poseOf = (f: Facing): Pose =>
  f === "left" || f === "right"
    ? { dir: "side", flip: f === "left", body: 0, lift: false }
    : { dir: f, flip: false, body: 0, lift: false };

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 每個人最近一則還沒過期的聊天與表情 —— 掛在頭上 */
export function bubbles(room: Room, now: number) {
  const say: Record<string, string> = {};
  for (const c of room.state.chat) if (now - c.at < SAY_MS) say[c.uid] = c.body;
  const emote = (uid: string) => {
    const e = room.emotes[uid];
    return e && now - e.at < EMOTE_MS ? e.emoji : null;
  };
  return { say, emote };
}

/** 頭上的泡泡:聊天(白底)或表情(只有 emoji) */
export const Bubble = ({ text, emoji }: { text: string | null; emoji: string | null }) =>
  text || emoji ? (
    <span className={`pointer-events-none absolute bottom-full left-1/2 mb-6 -translate-x-1/2 ${text ? "px-say" : "text-[24px]"}`}>
      {text ?? emoji}
    </span>
  ) : null;

/**
 * 別人。收到新位置就用 BFS 沿走道「走」過去(每個人只在移動時跑自己的 rAF),
 * 不是直線滑過桌子。對方每 2 秒才送一次位置,這邊用同樣的速度走,剛好在下一則
 * 進來時走到 —— 看起來是連續走動,網路上其實很少訊息。點他 = 看他是誰。
 */
export const Remote = memo(function Remote({
  map,
  member,
  look,
  name,
  say,
  emoji,
  onPick,
}: {
  map: GameMap;
  member: Member;
  look: Look;
  name: string;
  say: string | null;
  emoji: string | null;
  onPick: (uid: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const feet = useRef<Pos>({ x: member.x, y: member.y });
  const [pose, setPose] = useState<Pose>(() => poseOf(member.dir));

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const [ax, ay] = actorAt(feet.current.x, feet.current.y);
    el.style.transform = `translate(${ax}px, ${ay}px)`;
    el.style.zIndex = String(depth(feet.current.y));
  };
  useLayoutEffect(place, []);

  useEffect(() => {
    const target = { x: member.x, y: member.y };
    const from = feet.current;
    // 太遠(斷線很久、剛對帳到)就直接出現在那裡,不要讓人看他橫越整間
    if (Math.hypot(target.x - from.x, target.y - from.y) > 12) {
      feet.current = target;
      place();
      setPose(poseOf(member.dir));
      return;
    }
    const tiles = map.pathTo(tileOf(from), tileOf(target));
    const points = [...tiles.slice(0, -1).map(center), target];
    let raf = 0;
    let last = 0;
    let walked = 0;
    let cur = poseOf(member.dir);
    const step = (time: number) => {
      const dt = last ? Math.min(time - last, 100) / 1000 : 1 / 60;
      last = time;
      let budget = SPEED * dt;
      let vx = 0;
      let vy = 0;
      while (budget > 0 && points.length) {
        const p = feet.current;
        const dx = points[0].x - p.x;
        const dy = points[0].y - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= budget) {
          feet.current = points.shift()!;
          budget -= d;
        } else {
          feet.current = { x: p.x + (dx / d) * budget, y: p.y + (dy / d) * budget };
          budget = 0;
        }
        vx = dx;
        vy = dy;
        walked += Math.min(d, SPEED * dt);
      }
      place();
      if (points.length) {
        const beat = WALK[Math.floor(walked / STRIDE) % WALK.length];
        const next = { ...facing(cur, vx, vy), body: beat, lift: beat === 0 };
        if (next.dir !== cur.dir || next.flip !== cur.flip || next.body !== cur.body) {
          cur = next;
          setPose(next);
        }
        raf = requestAnimationFrame(step);
      } else {
        setPose(poseOf(member.dir)); // 停下來面向他自己回報的方向
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [map, member.x, member.y, member.dir]);

  return (
    <div
      ref={ref}
      data-member={member.uid}
      className="absolute top-0 left-0 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation(); // 不然地圖的 tap-to-move 會順便叫你往他那格走
        onPick(member.uid);
      }}
    >
      <Bubble text={say} emoji={emoji} />
      <NameTag name={name} />
      <Actor look={look} pose={pose} blink={(member.x * 7 + member.y * 3) % 5} />
    </div>
  );
});

/**
 * 你在哪:公司 › 房間。看不到某個人,九成是兩個人不在同一間公司(或同一隊),
 * 所以這一行永遠擺在標題下面。自訂公司的名字只記在這台裝置(DB 不存公司名),
 * 換裝置看到的是短碼。
 */
export const Where = ({ company, room }: { company: string; room: string }) => (
  <p className="-mt-2 px-small">
    <span className="text-crt-gold">{company}</span>
    <span className="text-crt-dim"> › </span>
    <span className="text-crt-white">{room}</span>
  </p>
);

/**
 * 門旁邊牆上的指示牌。點擊穿過去 —— 點門那一格本身就會走過去。不畫進 Scene:
 * Scene 是 memo,文字要跟著語言切換重畫
 */
export const DoorSign = ({ at, label }: { at: Pos; label: string }) => (
  <span
    className="pointer-events-none absolute z-[1] -translate-y-1/2 px-small leading-none whitespace-nowrap text-crt-gold"
    style={{ left: (at.x + 1) * TILE + 2, top: (at.y + 0.5) * TILE }}
  >
    ← {label}
  </span>
);

/** 伺服器的錯誤 → 畫面文案。對不到的照實顯示 */
const errText = (msg: string): string => {
  const k = errorKind(msg);
  return k === "tooFast"
    ? t.chatTooFast
    : k === "duplicate"
      ? t.chatDuplicate
      : k === "dailyLimit"
        ? t.chatDailyLimit
        : k === "tooLong"
          ? t.chatTooLong
          : k === "muted"
            ? t.chatMuted
            : k === "busy"
              ? t.loungeBusy
              : k === "tooNew"
                ? t.reportTooNew
                : msg;
};

const reportText = (e: string | null) =>
  e ? (errorKind(e) === "dailyLimit" ? t.reportLimit : errText(e)) : t.reportDone;

const statusText = (s: RoomStatus): string | null =>
  s === "off"
    ? t.chatOffVisit
    : s === "connecting"
      ? t.loungeConnecting
      : s === "full"
        ? t.loungeFull
        : s === "replaced"
          ? t.loungeReplaced
          : s === "away"
            ? t.loungeAway
            : s === "needCompany"
              ? t.loungeNeedCompany
              : s === "notReady"
                ? t.loungeNotReady
                : s === "error"
                  ? t.loungeError
                  : null;

/**
 * 點人物看他是誰:名字、隊伍、狀態、本週戰績。資料是排行榜那一份(同公司本來就
 * 看得到),不是新的曝光。人在即時房間裡時可以順手靜音、檢舉。
 * 換一個人要重開(呼叫端給 key={uid}),上一個人的檢舉結果不能留在這張卡上。
 */
export function PersonCard({
  uid,
  name,
  look,
  row,
  here,
  room,
  onClose,
}: {
  uid: string;
  name: string;
  look: Look;
  /** 排行榜那一列。還沒載到(或剛加入公司)就是 undefined,只顯示名字 */
  row: Standing | undefined;
  /** 人就在這間(即時);辦公室裡照狀態站位的同事是 false */
  here: boolean;
  room: Room;
  onClose: () => void;
}) {
  const muted = useStore((s) => s.loungeMuted.includes(uid));
  const toggleMute = useStore((s) => s.toggleLoungeMute);
  const [msg, setMsg] = useState<string | null>(null);
  const report = async () => {
    if (!confirm(t.reportConfirm)) return;
    setMsg(reportText(await room.report(uid)));
  };
  return (
    <div
      className="px-panel absolute top-2 right-2 z-10 flex w-[calc(100%-1rem)] flex-col gap-2 p-3 sm:w-64"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        {/* 站在木地板色上:角色的深色描邊放在 UI 深底上會整個糊掉 */}
        <div className="px-bevel-in shrink-0 px-1 pt-1" style={{ background: "#5f4636" }}>
          <Actor look={look} pose={STAND} blink={1.7} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* 頭上的名牌太長會截斷,點開的卡片給全名:換行不截(暱稱最多 20 字,頂多兩行) */}
          <span className="wrap-anywhere text-crt-gold">{name}</span>
          <span className="px-small text-crt-dim">{row ? (row.team ?? t.lobby) : "…"}</span>
          {row && (
            <span
              className={`px-small ${
                row.state === "slacking"
                  ? "text-crt-gold"
                  : row.state === "working"
                    ? "text-crt-green"
                    : "text-crt-dim"
              }`}
            >
              {row.state === "slacking"
                ? t.officeSlacking
                : row.state === "working"
                  ? t.stateWorking
                  : t.stateOffline}
              {here && <span className="text-crt-dim"> · {t.cardHere}</span>}
            </span>
          )}
        </div>
        <button onClick={onClose} className="px-small text-crt-dim hover:text-crt-white">
          {t.close}
        </button>
      </div>
      {row && (
        <p className="px-small tabular-nums text-crt-dim">
          {t.cardWeek} {dur(row.weekMs)} · 🐟×{row.fishes} · {pts.format(row.points)} {t.pointsUnit}
        </p>
      )}
      {room.status === "live" && (
        <div className="flex gap-3 px-small">
          <button onClick={() => toggleMute(uid)} className="text-crt-dim hover:text-crt-white">
            {muted ? t.chatUnmute : t.chatMute}
          </button>
          <button onClick={() => void report()} className="text-crt-dim hover:text-crt-red">
            {t.chatReport}
          </button>
        </div>
      )}
      {msg && <p className="px-small text-crt-red">{msg}</p>}
    </div>
  );
}

/**
 * 說話的地方在遊戲畫面裡:右下角 💬(電腦按 Enter)打開,說完就收起來 —— 不用捲到
 * 下面找輸入框,收起來之後 WASD 馬上回到走路。空的 Enter、Esc、「關閉」都是收起來。
 * 聊天紀錄還在下面的面板。
 */
export function ChatBar({ room, now }: { room: Room; now: number }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const live = room.status === "live";
  const muted = (room.mutedUntil ?? 0) > now;

  // iOS 只有在使用者手勢的當下 focus 才會跳鍵盤:先同步把輸入框畫出來再 focus,不等 effect
  const show = () => {
    flushSync(() => setOpen(true));
    input.current?.focus();
  };
  const hide = () => {
    setOpen(false);
    setErr(null);
  };

  // 電腦:沒在打字時按 Enter 打開。按鈕、連結上的 Enter 留給它們自己(那是在按它)
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as Element).closest?.("input, textarea, select, button, a, [contenteditable]")) return;
      e.preventDefault();
      flushSync(() => setOpen(true));
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live]);

  // 斷線、被接手、串門子:收起來,不留一個送不出去的輸入框
  useEffect(() => {
    if (!live) setOpen(false);
  }, [live]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return hide(); // 空的 Enter = 收起來(遊戲的習慣)
    if (busy) return;
    setBusy(true);
    setErr(null);
    const e = await room.say(body);
    setBusy(false);
    if (e) return setErr(errText(e)); // 太快、重複…:留著讓人改
    setDraft("");
    hide();
  };
  const emote = async (emoji: string) => {
    const e = await room.emote(emoji);
    if (e) setErr(errText(e));
    else hide();
  };

  if (!live) return null;
  if (!open)
    return (
      <button
        type="button"
        onClick={show}
        aria-label={t.chatTitle}
        className="px-btn absolute right-2 bottom-2 z-10 flex items-center gap-2 px-2"
      >
        💬<span className="hidden px-small text-crt-dim sm:inline">Enter</span>
      </button>
    );
  return (
    <div className="px-panel absolute inset-x-2 bottom-2 z-10 flex flex-col gap-2 p-2">
      {err && <p className="px-small text-crt-red">{err}</p>}
      <div className="flex flex-wrap gap-1">
        {EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => void emote(e)} className="px-btn px-2" aria-label={e}>
            {e}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 100))}
          onKeyDown={(e) => e.key === "Escape" && hide()}
          maxLength={100}
          enterKeyHint="send"
          placeholder={muted ? t.chatMuted : t.chatPlaceholder}
          aria-label={t.chatPlaceholder}
          disabled={muted}
          className="px-input min-w-0 flex-1"
        />
        <button type="submit" className="px-btn text-crt-gold" disabled={busy || muted}>
          {t.chatSend}
        </button>
        <button type="button" onClick={hide} className="px-btn">
          {t.close}
        </button>
      </form>
    </div>
  );
}

/**
 * 聊天面板:人數、連線狀態、最近的聊天(可靜音、檢舉)。說話在遊戲畫面裡的 ChatBar。連線狀態也寫在這裡 ——
 * 兩間房的狀態訊息是同一套。privacy 是「誰看得到」那一句,兩間不一樣。
 */
export function ChatPanel({
  room,
  names,
  myId,
  now,
  privacy,
  alone,
}: {
  room: Room;
  names: Record<string, string>;
  myId: string;
  now: number;
  privacy: string;
  /** 只有自己在場時的說明:這間看得到誰。null = 不顯示 */
  alone: string | null;
}) {
  const muted = useStore((s) => s.loungeMuted);
  const toggleMute = useStore((s) => s.toggleLoungeMute);
  // 檢舉的結果(成功或為什麼不行)
  const [err, setErr] = useState<string | null>(null);
  const live = room.status === "live";
  const isMuted = (room.mutedUntil ?? 0) > now;
  const members = Object.keys(room.state.members);
  const count = members.includes(myId) ? members.length : members.length + 1;
  const banner = statusText(room.status);

  const report = async (uid: string) => {
    if (!confirm(t.reportConfirm)) return;
    setErr(reportText(await room.report(uid)));
  };

  return (
    <div className="px-panel flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-crt-white">
          {t.chatTitle}
          {live && (
            <span className="ml-2 px-small tabular-nums text-crt-dim">
              {count} {t.loungePeople}
            </span>
          )}
        </span>
      </div>

      {banner && (
        <div className="flex flex-wrap items-center gap-2 px-small text-crt-dim">
          <span>{banner}</span>
          {(room.status === "replaced" || room.status === "full" || room.status === "error") && (
            <button onClick={room.retry} className="px-btn">
              {room.status === "replaced" ? t.loungeRetake : t.loungeRetry}
            </button>
          )}
        </div>
      )}

      {live && count === 1 && alone && <p className="px-small text-crt-gold">{alone}</p>}

      {room.status !== "off" && (
        <>
          {live && <p className="px-small text-crt-white">{t.chatHowTo}</p>}
          <p className="px-small text-crt-dim">{privacy}</p>

          {isMuted && (
            <p className="px-small px-bevel-in bg-crt-deep px-3 py-2 text-crt-red">{t.chatMuted}</p>
          )}
          {err && <p className="px-small px-bevel-in bg-crt-deep px-3 py-2 text-crt-red">{err}</p>}

          {room.state.chat.length === 0 ? (
            <p className="text-crt-dim">{t.chatEmpty}</p>
          ) : (
            <ul className="flex max-h-[40vh] flex-col-reverse gap-1 overflow-y-auto">
              {[...room.state.chat].reverse().map((c) =>
                muted.includes(c.uid) ? null : (
                  <li
                    key={c.id}
                    className={`${c.uid === myId ? "px-row-me" : "px-row"} flex flex-wrap items-baseline gap-x-2 px-3 py-2`}
                  >
                    <span className="px-small tabular-nums text-crt-dim">{hhmm(c.at)}</span>
                    <span className="text-crt-gold">{names[c.uid] ?? c.handle}</span>
                    {/* React 預設轉義 —— 永遠不用 dangerouslySetInnerHTML,XSS 就不成立 */}
                    <span className="flex-1 wrap-anywhere text-crt-white">{c.body}</span>
                    {c.uid !== myId && (
                      <span className="flex gap-2 px-small">
                        <button onClick={() => toggleMute(c.uid)} className="text-crt-dim hover:text-crt-white">
                          {t.chatMute}
                        </button>
                        <button onClick={() => void report(c.uid)} className="text-crt-dim hover:text-crt-red">
                          {t.chatReport}
                        </button>
                      </span>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}

          {muted.length > 0 && (
            <button
              onClick={() => muted.forEach(toggleMute)}
              className="self-start px-small text-crt-dim hover:text-crt-white"
            >
              {t.chatUnmuteAll} ({muted.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}
