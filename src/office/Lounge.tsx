import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { displayNames, errorKind, type Facing, type Member } from "../lounge";
import { useStore } from "../store";
import { t } from "../strings";
import { fetchMyProfile, useSession, useLounge } from "../sync";
import { EMOJIS } from "../team";
import { useNow } from "../useNow";
import Actor, { NameTag, STAND, type Pose } from "./Actor";
import { LOUNGE, LOUNGE_SPAWN, LOUNGE_SPAWN_FEET, TILE, tileOf, type Pos } from "./map";
import { LOUNGE_SCENE } from "./props";
import Scene from "./Scene";
import { lookFor, WALK, type Look } from "./sprite";
import { actorAt, center, depth, facing, SPEED, STRIDE, useWalker } from "./useWalker";

/** 聊天泡泡在頭上停幾秒、表情停幾秒 */
const SAY_MS = 6000;
const EMOTE_MS = 3000;

const facingOf = (p: Pose): Facing =>
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

/** 頭上的泡泡:聊天(白底)或表情(只有 emoji) */
const Bubble = ({ text, emoji }: { text: string | null; emoji: string | null }) =>
  text || emoji ? (
    <span className={`pointer-events-none absolute bottom-full left-1/2 mb-6 -translate-x-1/2 ${text ? "px-say" : "text-[24px]"}`}>
      {text ?? emoji}
    </span>
  ) : null;

/**
 * 別人。收到新位置就用 BFS 沿走道「走」過去(每個人只在移動時跑自己的 rAF),
 * 不是直線滑過桌子。對方每 2 秒才送一次位置,這邊用同樣的速度走,剛好在下一則
 * 進來時走到 —— 看起來是連續走動,網路上其實很少訊息。
 */
const Remote = memo(function Remote({
  member,
  look,
  name,
  say,
  emoji,
}: {
  member: Member;
  look: Look;
  name: string;
  say: string | null;
  emoji: string | null;
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
    const tiles = LOUNGE.pathTo(tileOf(from), tileOf(target));
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
  }, [member.x, member.y, member.dir]);

  return (
    <div ref={ref} data-member={member.uid} className="pointer-events-none absolute top-0 left-0">
      <Bubble text={say} emoji={emoji} />
      <NameTag name={name} />
      <Actor look={look} pose={pose} blink={(member.x * 7 + member.y * 3) % 5} />
    </div>
  );
});

/**
 * 公司休息室。同公司所有隊伍共用一間,即時看到彼此走動、聊天。
 * 待在這裡算摸魚時數,但不生摸魚幣(不然要多一套防作弊)。
 */
export default function Lounge({ onBack }: { onBack: () => void }) {
  const session = useSession();
  const myId = session?.user.id ?? "me";
  const now = useNow();
  const activeSince = useStore((s) => s.activeSince);
  const startSlacking = useStore((s) => s.startSlacking);
  const myAvatar = useStore((s) => s.myAvatar);
  const muted = useStore((s) => s.loungeMuted);
  const toggleMute = useStore((s) => s.toggleLoungeMute);
  const myLook = lookFor(myId, myAvatar?.uid === myId ? myAvatar.code : null);

  // 公司碼:進哪一間由 DB 的 my_company() 決定,這裡只是拿來組頻道名
  const [company, setCompany] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchMyProfile().then((p) => alive && setCompany(p?.company_code ?? null));
    return () => {
      alive = false;
    };
  }, []);

  // 走進休息室 = 摸魚(跟走進茶水間一樣);離開這裡不會自動結束,回座位才算
  useEffect(() => {
    if (activeSince === null) startSlacking();
  }, [activeSince, startSlacking]);

  const lounge = useLounge(company, LOUNGE_SPAWN_FEET);
  const { stageRef, worldRef, meRef, pose, tapMove } = useWalker(
    LOUNGE,
    LOUNGE_SPAWN,
    STAND,
    (feet, p, stopped) => lounge.move(feet.x, feet.y, facingOf(p), stopped),
  );

  const members = Object.values(lounge.state.members);
  const names = displayNames(members);
  const others = members.filter((m) => m.uid !== myId);
  const count = members.some((m) => m.uid === myId) ? members.length : members.length + 1;

  // 每個人最近一則(還沒過期的)聊天,掛在頭上
  const lastSay: Record<string, string> = {};
  for (const c of lounge.state.chat) if (now - c.at < SAY_MS) lastSay[c.uid] = c.body;
  const emoteOf = (uid: string) => {
    const e = lounge.emotes[uid];
    return e && now - e.at < EMOTE_MS ? e.emoji : null;
  };

  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    const e = await lounge.say(body);
    setBusy(false);
    if (e) setErr(errText(e));
    else setDraft("");
  };
  const report = async (uid: string) => {
    if (!confirm(t.reportConfirm)) return;
    const e = await lounge.report(uid);
    setErr(e ? (errorKind(e) === "dailyLimit" ? t.reportLimit : errText(e)) : t.reportDone);
  };

  const live = lounge.status === "live";
  const banner =
    lounge.status === "connecting"
      ? t.loungeConnecting
      : lounge.status === "full"
        ? t.loungeFull
        : lounge.status === "replaced"
          ? t.loungeReplaced
          : lounge.status === "away"
            ? t.loungeAway
            : lounge.status === "needCompany"
              ? t.loungeNeedCompany
              : lounge.status === "notReady"
                ? t.loungeNotReady
                : lounge.status === "error"
                  ? t.loungeError
                  : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-[36px] text-crt-white">{t.lounge}</h1>
        <button onClick={onBack} className="px-btn">
          {t.loungeBack}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-small">
        <span className="px-bevel-in bg-crt-deep px-3 py-1 text-crt-gold">{t.officeSlacking}</span>
        {live && (
          <span className="tabular-nums text-crt-dim">
            {count} {t.loungePeople}
          </span>
        )}
        {banner && <span className="text-crt-dim">{banner}</span>}
        {(lounge.status === "replaced" || lounge.status === "full" || lounge.status === "error") && (
          <button onClick={lounge.retry} className="px-btn">
            {lounge.status === "replaced" ? t.loungeRetake : t.loungeRetry}
          </button>
        )}
      </div>

      <div
        ref={stageRef}
        className="px-bevel relative overflow-hidden bg-crt-deep"
        style={{ height: LOUNGE.rows * TILE + 4 }}
      >
        <div
          ref={worldRef}
          className="absolute top-0 left-0 cursor-pointer select-none"
          style={{ width: LOUNGE.cols * TILE, height: LOUNGE.rows * TILE, touchAction: "manipulation" }}
          onClick={tapMove}
        >
          <Scene map={LOUNGE} def={LOUNGE_SCENE} />
          {others.map((m) => (
            <Remote
              key={m.uid}
              member={m}
              look={lookFor(m.uid, m.avatar)}
              name={names[m.uid] ?? m.handle}
              say={muted.includes(m.uid) ? null : (lastSay[m.uid] ?? null)}
              emoji={muted.includes(m.uid) ? null : emoteOf(m.uid)}
            />
          ))}
          <div ref={meRef} data-player className="pointer-events-none absolute top-0 left-0">
            <Bubble text={lastSay[myId] ?? null} emoji={emoteOf(myId)} />
            <Actor look={myLook} pose={pose} blink={2.3} />
          </div>
        </div>
      </div>

      <div className="px-panel flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-crt-white">{t.chatTitle}</span>
          <span className="flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => void lounge.emote(e)}
                disabled={!live}
                className="px-btn px-2"
                aria-label={e}
              >
                {e}
              </button>
            ))}
          </span>
        </div>

        <p className="px-small text-crt-dim">{t.chatPrivacy}</p>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 100))}
            maxLength={100}
            placeholder={t.chatPlaceholder}
            disabled={!live || (lounge.mutedUntil ?? 0) > now}
            className="px-input"
          />
          <button type="submit" className="px-btn text-crt-gold" disabled={!live || busy || !draft.trim()}>
            {t.chatSend}
          </button>
        </form>

        {(lounge.mutedUntil ?? 0) > now && (
          <p className="px-small px-bevel-in bg-crt-deep px-3 py-2 text-crt-red">{t.chatMuted}</p>
        )}
        {err && <p className="px-small px-bevel-in bg-crt-deep px-3 py-2 text-crt-red">{err}</p>}

        {lounge.state.chat.length === 0 ? (
          <p className="text-crt-dim">{t.chatEmpty}</p>
        ) : (
          <ul className="flex max-h-[40vh] flex-col-reverse gap-1 overflow-y-auto">
            {[...lounge.state.chat].reverse().map((c) =>
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
          <button onClick={() => muted.forEach(toggleMute)} className="self-start px-small text-crt-dim hover:text-crt-white">
            {t.chatUnmuteAll} ({muted.length})
          </button>
        )}
      </div>

      <p className="text-crt-dim">
        <span className="sm:hidden">{t.loungeHintMobile}</span>
        <span className="hidden sm:inline">{t.loungeHint}</span>
      </p>
    </div>
  );
}
