import { useEffect, useMemo, useRef, useState } from "react";
import { dur, pts } from "../fmt";
import { points } from "../money";
import { dayKey } from "../slack";
import { useStore } from "../store";
import { t } from "../strings";
import { catchFish, useSession, useSpots, useTeam, type Spot } from "../sync";
import type { Standing } from "../team";
import { useNow } from "../useNow";
import {
  bonusZoneAt,
  COLS,
  FLOOR_TILES,
  inBonusZone,
  pathTo,
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

/** server 給的亂數 → 地圖格子。位置純裝飾,可驗證的核心是時間視窗 */
const fishTile = (s: Spot): Pos => FLOOR_TILES[(s.r1 * 31 + s.r2) % FLOOR_TILES.length];

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

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
      fill={(x + y) % 2 ? "#1a1d24" : "#1e222a"}
    />
  );
  switch (ch) {
    case "#":
      return <rect x={px} y={py} width={TILE} height={TILE} fill="#0b0d11" />;
    case "D":
      return (
        <>
          {floor}
          <rect x={px + 2} y={py + 6} width={28} height={22} rx={3} fill="#7c5a3a" />
          <rect x={px + 8} y={py + 10} width={16} height={10} rx={1} fill="#0b0d11" />
        </>
      );
    case "C":
      return (
        <>
          {floor}
          <rect x={px + 8} y={py + 4} width={16} height={26} rx={3} fill="#6f7684" />
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
          <circle cx={px + 16} cy={py + 16} r={10} fill="#343a46" />
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
            fill="rgba(232,194,100,.12)"
            stroke="rgba(232,194,100,.3)"
            strokeDasharray="3 3"
          />
        </>
      );
    default:
      return floor;
  }
}

export default function Office({ onBack }: { onBack: () => void }) {
  const activeSince = useStore((s) => s.activeSince);
  const startSlacking = useStore((s) => s.startSlacking);
  const stopSlacking = useStore((s) => s.stopSlacking);
  const zoneMs = useStore((s) => s.zoneMs);
  const addZoneMs = useStore((s) => s.addZoneMs);
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
  const posRef = useRef(pos);
  posRef.current = pos;
  // 手機 tap-to-move:點一格 → BFS 算好路徑塞這裡,interval 一格一格消化
  const path = useRef<Pos[]>([]);

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
      path.current = []; // 鍵盤介入就取消 tap 走路
      if (!pressed.current.has(k)) {
        pressed.current.add(k);
        setMoving(true);
        step(k); // 第一步立即走,不等 interval —— 手感差很多
      }
    };
    const up = (e: KeyboardEvent) => {
      pressed.current.delete(e.key.toLowerCase());
      if (pressed.current.size === 0 && path.current.length === 0) setMoving(false);
    };
    // 按著不放 / tap 路徑:固定節奏一格一格走。鍵盤優先,其次消化 tap 路徑
    const id = setInterval(() => {
      const k = [...pressed.current][0];
      if (k) {
        step(k);
      } else if (path.current.length) {
        const next = path.current.shift()!;
        if (next.x !== posRef.current.x) setFacing(next.x > posRef.current.x ? 1 : -1);
        setPos(next);
        setMoving(true);
      } else {
        setMoving(false);
      }
    }, 140);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // 點/觸控地圖某一格 → 走過去(BFS)。座標沒縮放(1px=1格線性),直接換算
  const tapMove: React.MouseEventHandler = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tx = Math.floor((e.clientX - rect.left) / TILE);
    const ty = Math.floor((e.clientY - rect.top) / TILE);
    const p = pathTo(posRef.current, { x: tx, y: ty });
    if (p.length) path.current = p;
  };

  // 魚點:今天的時刻表由伺服器種子決定,只在自己房間出現
  const { spots, refresh: refreshSpots } = useSpots();
  const activeSpot =
    spots.find((s) => !s.caught && now >= s.start_ms && now < s.end_ms) ?? null;
  const nextSpot = spots.find((s) => now < s.start_ms) ?? null;
  const todayFishes = spots.filter((s) => s.caught).length;
  const fishPos = activeSpot ? fishTile(activeSpot) : null;
  const onFish =
    isOwnRoom && fishPos !== null && pos.x === fishPos.x && pos.y === fishPos.y;

  // 走位的語意:茶水間或魚點 = 開始摸魚,自己座位 = 結束,走廊中性。
  // 辦公室是 Phase 2 那顆按鈕的皮,動的是同一個 store。
  // 只在自己房間生效 —— 串門子是旁觀,別隊的茶水間不是你的茶水間。
  const zone = zoneAt(pos);
  useEffect(() => {
    if (!isOwnRoom) return;
    if ((zone === "break" || onFish) && activeSince === null) startSlacking();
    if (zone === "desk" && activeSince !== null) stopSlacking();
  }, [zone, onFish, activeSince, isOwnRoom, startSlacking, stopSlacking]);

  // 外快區:2×2 綠框,站著加倍領錢。位置純本機決定(錢不上傳,沒有作弊
  // 對象,不像魚需要伺服器種子),免登入。串門子不生效 —— 你是幽靈。
  const bonusAnchor = bonusZoneAt(now);
  const onBonus = isOwnRoom && inBonusZone(pos, bonusAnchor);

  // 站進去記時間戳,離開(含換位、離開辦公室)才把這段折進 store。
  // 顯示值照舊即時推導 —— 存的是毫秒不是錢,不用 interval 累加。
  const bonusEnteredAt = useRef<number | null>(null);
  useEffect(() => {
    if (!onBonus) return;
    bonusEnteredAt.current = Date.now();
    return () => {
      if (bonusEnteredAt.current !== null) {
        addZoneMs(Date.now() - bonusEnteredAt.current, dayKey(Date.now()));
        bonusEnteredAt.current = null;
      }
    };
  }, [onBonus, addZoneMs]);

  const zoneLiveMs =
    (zoneMs.day === dayKey(now) ? zoneMs.ms : 0) +
    (onBonus && bonusEnteredAt.current !== null ? Math.max(0, now - bonusEnteredAt.current) : 0);

  // 站上魚點就抓。合法性由 DB trigger 用伺服器時鐘判,這裡只是提出申請。
  // inflight guard 擋連發;成功後 refresh 讓 caught 從伺服器回來,魚消失。
  const catching = useRef(false);
  useEffect(() => {
    if (!onFish || !activeSpot || catching.current) return;
    catching.current = true;
    catchFish(activeSpot.spot_index).then((ok) => {
      catching.current = false;
      if (ok) refreshSpots();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFish, activeSpot?.spot_index]);

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
        <span className="tabular-nums text-crt-dim" title={t.zoneHint}>
          {/* 跟主畫面同一個數:摸魚幣 = 外快區站立(含進行中)+ 漁獲獎勵 */}
          {t.todayStolen} {pts.format(points(zoneLiveMs, todayFishes))} {t.pointsUnit}
        </span>
        {/* 魚況:沒登入不顯示(魚點需要伺服器種子);沒跑 v3 遷移 = 沒有魚 */}
        {session && spots.length > 0 && (
          <span className="tabular-nums text-crt-dim">
            {activeSpot ? (
              <span className="text-crt-gold">
                {t.fishHere} {mmss(activeSpot.end_ms - now)}
              </span>
            ) : nextSpot ? (
              `${t.fishNext} ${hhmm(nextSpot.start_ms)}`
            ) : (
              t.fishNone
            )}
            {"　"}
            {t.fishToday} 🐟×{todayFishes}
          </span>
        )}
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
          className="relative cursor-pointer select-none"
          style={{ width: COLS * TILE, height: ROWS * TILE, touchAction: "manipulation" }}
          onClick={tapMove}
        >
          {map}
          {/* 外快區:綠框白底,站進去補血十字往上飄 + 加倍領錢。
              pointer-events-none 讓 tap-to-move 的點擊穿過去 */}
          {isOwnRoom && (
            <div
              data-bonus
              className="pointer-events-none absolute top-0 left-0"
              style={{
                transform: `translate(${bonusAnchor.x * TILE}px, ${bonusAnchor.y * TILE}px)`,
              }}
            >
              <div className="px-zone" style={{ width: TILE * 2, height: TILE * 2 }} />
              {onBonus && (
                <>
                  <span className="px-heal" style={{ left: 8 }} />
                  <span className="px-heal" style={{ left: 38, animationDelay: ".5s" }} />
                  <span className="px-heal" style={{ left: 23, animationDelay: "1s" }} />
                </>
              )}
            </div>
          )}
          {/* 魚點只長在自己房間。站上去 = 摸魚 + 抓魚 */}
          {isOwnRoom && activeSpot && fishPos && (
            <div
              data-fish
              className="absolute top-0 left-0 flex size-8 flex-col items-center justify-center"
              style={{ transform: `translate(${fishPos.x * TILE}px, ${fishPos.y * TILE}px)` }}
            >
              <span className="px-bob text-xl">🐟</span>
              <span className="bg-crt-deep/90 px-1 text-[9px] leading-tight text-crt-gold tabular-nums">
                {mmss(activeSpot.end_ms - now)}
              </span>
            </div>
          )}
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
