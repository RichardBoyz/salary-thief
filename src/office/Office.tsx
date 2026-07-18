import { useEffect, useMemo, useRef, useState } from "react";
import { dur, twd } from "../fmt";
import { earnedToday } from "../money";
import { useStore } from "../store";
import { t } from "../strings";
import { useSession, useTeam } from "../sync";
import type { Standing } from "../team";
import { useNow } from "../useNow";
import {
  COLS,
  RAW,
  ROWS,
  SPAWN_BREAK,
  SPAWN_DESK,
  SPAWN_VISIT,
  SPOTS,
  TILE,
  tryMove,
  zoneAt,
  type Pos,
} from "./map";

/**
 * 同事站哪:上班中 → 座位,摸魚中 → 茶水間,離線 → 不出現。位置由狀態
 * 推導(排行榜同一份輪詢資料),不同步逐格走位。userId 排序讓每個人的
 * 站位在兩次輪詢之間穩定,不會無故換位。
 */
function placeTeammates(rows: Standing[], me: string | undefined) {
  const others = rows
    .filter((r) => r.userId !== me && r.state !== "offline")
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const spots = { slacking: [...SPOTS.breaks], working: [...SPOTS.chairs] };
  const overflow = [...SPOTS.floor];
  return others.map((r) => ({
    ...r,
    pos: spots[r.state as "slacking" | "working"].shift() ?? overflow.shift() ?? SPOTS.floor[0],
  }));
}

const DIRS: Record<string, [number, number]> = {
  arrowup: [0, -1],
  w: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1],
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
};

/** 一格 SVG。純視覺,碰撞由 map.ts 的 walkable 管,兩邊都只看 RAW */
function Tile({ ch, x, y }: { ch: string; x: number; y: number }) {
  const px = x * TILE;
  const py = y * TILE;
  const floor = (
    <rect
      x={px}
      y={py}
      width={TILE}
      height={TILE}
      fill={(x + y) % 2 ? "#101d8c" : "#132297"}
    />
  );
  switch (ch) {
    case "#":
      return <rect x={px} y={py} width={TILE} height={TILE} fill="#060d52" />;
    case "D":
      return (
        <>
          {floor}
          <rect x={px + 2} y={py + 6} width={28} height={22} rx={3} fill="#7c5a3a" />
          <rect x={px + 8} y={py + 10} width={16} height={10} rx={1} fill="#060d52" />
        </>
      );
    case "C":
      return (
        <>
          {floor}
          <rect x={px + 8} y={py + 4} width={16} height={26} rx={3} fill="#8a93d8" />
          <rect x={px + 10} y={py + 6} width={12} height={12} rx={2} fill="#38bdf8" />
        </>
      );
    case "S":
      return (
        <>
          {floor}
          <rect x={px + 2} y={py + 8} width={28} height={20} rx={6} fill="#b91c1c" />
          <rect x={px + 2} y={py + 4} width={28} height={8} rx={4} fill="#991b1b" />
        </>
      );
    case "P":
      return (
        <>
          {floor}
          <rect x={px + 10} y={py + 18} width={12} height={10} rx={2} fill="#7c5a3a" />
          <circle cx={px + 16} cy={py + 12} r={9} fill="#16a34a" />
        </>
      );
    case "y":
      return (
        <>
          {floor}
          <circle cx={px + 16} cy={py + 16} r={10} fill="#2a36a8" />
        </>
      );
    case "b":
      return (
        <>
          {floor}
          <rect
            x={px + 1}
            y={py + 1}
            width={TILE - 2}
            height={TILE - 2}
            fill="rgba(255,210,62,.12)"
            stroke="rgba(255,210,62,.3)"
            strokeDasharray="3 3"
          />
        </>
      );
    default:
      return floor;
  }
}

export default function Office({ onBack }: { onBack: () => void }) {
  const cfg = useStore((s) => s.config);
  const activeSince = useStore((s) => s.activeSince);
  const startSlacking = useStore((s) => s.startSlacking);
  const stopSlacking = useStore((s) => s.stopSlacking);
  const now = useNow();
  const session = useSession();
  const team = useTeam(45_000); // 沒登入回傳 null,辦公室就是單人版

  // 一隊一房。你預設在自己隊的房間;串門子 = 切到別隊房間旁觀。
  // 房間清單 = 公司裡實際存在的隊(有沒選隊的人就多一間大廳)。
  const myTeam = team?.profile?.team ?? null;
  const [visitingRaw, setVisiting] = useState<string | null | "OWN">("OWN");
  const room = visitingRaw === "OWN" ? myTeam : visitingRaw;
  const isOwnRoom = room === myTeam;
  const roomNames = [
    ...new Set((team?.rows ?? []).map((r) => r.team)),
  ].sort((a, b) => (a === myTeam ? -1 : b === myTeam ? 1 : (a ?? "").localeCompare(b ?? "")));
  const teammates = placeTeammates(
    (team?.rows ?? []).filter((r) => r.team === room),
    session?.user.id,
  );

  // 出生點跟著狀態走:摸魚中進來就站在茶水間,不會出現「人在座位卻在摸魚」
  const [pos, setPos] = useState<Pos>(activeSince ? SPAWN_BREAK : SPAWN_DESK);
  const [facing, setFacing] = useState(1);
  const [moving, setMoving] = useState(false);
  const pressed = useRef(new Set<string>());

  useEffect(() => {
    const step = (k: string) => {
      const [dx, dy] = DIRS[k];
      setPos((p) => tryMove(p, dx, dy));
      if (dx) setFacing(dx);
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in DIRS)) return;
      e.preventDefault(); // 方向鍵不捲頁面
      // e.repeat 靠 pressed 擋掉:OS 的自動重複不算新按鍵,節奏由 interval 控制
      if (!pressed.current.has(k)) {
        pressed.current.add(k);
        setMoving(true);
        step(k); // 第一步立即走,不等 interval —— 手感差很多
      }
    };
    const up = (e: KeyboardEvent) => {
      pressed.current.delete(e.key.toLowerCase());
      if (pressed.current.size === 0) setMoving(false);
    };
    // 按著不放:固定節奏一格一格走
    const id = setInterval(() => {
      const k = [...pressed.current][0];
      if (k) step(k);
    }, 140);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // 走位的語意:茶水間 = 開始摸魚,自己座位 = 結束,走廊中性(路過不誤觸)。
  // 辦公室是 Phase 2 那顆按鈕的皮,動的是同一個 store。
  // 只在自己房間生效 —— 串門子是旁觀,別隊的茶水間不是你的茶水間。
  const zone = zoneAt(pos);
  useEffect(() => {
    if (!isOwnRoom) return;
    if (zone === "break" && activeSince === null) startSlacking();
    if (zone === "desk" && activeSince !== null) stopSlacking();
  }, [zone, activeSince, isOwnRoom, startSlacking, stopSlacking]);

  // 換房間重生:回自己房照狀態站位,去別隊房站門口走道。
  // deps 只有 room —— 摸魚開始/結束不該把人瞬移回出生點
  useEffect(() => {
    const s = useStore.getState();
    setPos(isOwnRoom ? (s.activeSince ? SPAWN_BREAK : SPAWN_DESK) : SPAWN_VISIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const map = useMemo(
    () => (
      <svg width={COLS * TILE} height={ROWS * TILE} className="block">
        {RAW.flatMap((row, y) =>
          [...row].map((ch, x) => <Tile key={`${x},${y}`} ch={ch} x={x} y={y} />),
        )}
      </svg>
    ),
    [],
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl text-crt-white">{t.office}</h1>
        <button
          onClick={onBack}
          className="px-btn"
        >
          {t.back}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {activeSince === null ? (
          <span className="px-bevel-in bg-crt-deep px-3 py-1 text-crt-green">
            {t.stateWorking}
          </span>
        ) : (
          <span className="px-bevel-in bg-crt-deep px-3 py-1 text-crt-gold">
            {t.officeSlacking} · <span className="tabular-nums">{dur(now - activeSince)}</span>
          </span>
        )}
        <span className="tabular-nums text-crt-dim">
          {t.todayEarned} {twd.format(earnedToday(cfg, now))}
        </span>
      </div>

      {/* 一隊一房,點分頁串門子。只有一間(或沒登入)就不顯示 */}
      {roomNames.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1 text-crt-dim">{t.visitTabs}</span>
          {roomNames.map((name) => (
            <button
              key={name ?? "__lobby"}
              onClick={() => setVisiting(name === myTeam ? "OWN" : name)}
              className={`px-2.5 py-1 ${
                room === name
                  ? "px-bevel-in bg-crt-deep text-crt-white"
                  : "text-crt-dim hover:text-crt-white"
              }`}
            >
              {name ?? t.lobby}
              {name === myTeam && (
                <span className="ml-0.5 text-crt-dim">{t.yourRoomSuffix}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="px-bevel overflow-x-auto">
        <div
          className="relative"
          style={{ width: COLS * TILE, height: ROWS * TILE }}
        >
          {map}
          {teammates.map((m) => (
            <div
              key={m.userId}
              data-teammate={m.handle}
              // 狀態變了(座位↔茶水間)靠 transition 自己「走」過去
              className="absolute top-0 left-0 flex size-8 flex-col items-center justify-center transition-transform duration-700 ease-in-out"
              style={{ transform: `translate(${m.pos.x * TILE}px, ${m.pos.y * TILE}px)` }}
              title={`${m.handle} · ${m.state === "slacking" ? t.officeSlacking : t.stateWorking}`}
            >
              <span className="text-xl opacity-90">🧑‍💼</span>
              <span className="max-w-16 truncate bg-crt-deep/80 px-1 text-[9px] leading-tight text-crt-white">
                {m.handle}
              </span>
            </div>
          ))}
          <div
            data-player
            className="absolute top-0 left-0 flex size-8 items-center justify-center transition-transform duration-130 ease-linear"
            style={{ transform: `translate(${pos.x * TILE}px, ${pos.y * TILE}px)` }}
          >
            <span
              className="text-2xl drop-shadow"
              style={{ transform: `scaleX(${facing})` }}
            >
              {/* 串門子時你是幽靈:對方看不到你,你也踩不動任何機關 */}
              {!isOwnRoom ? "👻" : moving ? "🚶" : "🧍"}
            </span>
          </div>
        </div>
      </div>

      <p className="text-crt-dim">{isOwnRoom ? t.officeHint : t.visitHint}</p>
    </div>
  );
}
