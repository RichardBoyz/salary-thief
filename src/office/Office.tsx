import { useEffect, useMemo, useRef, useState } from "react";
import { dur, twd } from "../fmt";
import { earnedToday } from "../money";
import { useStore } from "../store";
import { t } from "../strings";
import { useNow } from "../useNow";
import {
  COLS,
  RAW,
  ROWS,
  SPAWN_BREAK,
  SPAWN_DESK,
  TILE,
  tryMove,
  zoneAt,
  type Pos,
} from "./map";

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
      fill={(x + y) % 2 ? "#1c2942" : "#1e2c47"}
    />
  );
  switch (ch) {
    case "#":
      return <rect x={px} y={py} width={TILE} height={TILE} fill="#0b1425" />;
    case "D":
      return (
        <>
          {floor}
          <rect x={px + 2} y={py + 6} width={28} height={22} rx={3} fill="#7c5a3a" />
          <rect x={px + 8} y={py + 10} width={16} height={10} rx={1} fill="#0f172a" />
        </>
      );
    case "C":
      return (
        <>
          {floor}
          <rect x={px + 8} y={py + 4} width={16} height={26} rx={3} fill="#64748b" />
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
          <circle cx={px + 16} cy={py + 16} r={10} fill="#334155" />
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
            fill="rgba(245,158,11,.10)"
            stroke="rgba(245,158,11,.25)"
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
  const zone = zoneAt(pos);
  useEffect(() => {
    if (zone === "break" && activeSince === null) startSlacking();
    if (zone === "desk" && activeSince !== null) stopSlacking();
  }, [zone, activeSince, startSlacking, stopSlacking]);

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
        <h1 className="text-lg font-semibold text-slate-100">{t.office}</h1>
        <button
          onClick={onBack}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          {t.back}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {activeSince === null ? (
          <span className="rounded-full bg-emerald-950/60 px-3 py-1 text-emerald-400">
            {t.stateWorking}
          </span>
        ) : (
          <span className="rounded-full bg-amber-950/60 px-3 py-1 text-amber-300">
            {t.officeSlacking} · <span className="tabular-nums">{dur(now - activeSince)}</span>
          </span>
        )}
        <span className="tabular-nums text-slate-500">
          {t.todayEarned} {twd.format(earnedToday(cfg, now))}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <div
          className="relative"
          style={{ width: COLS * TILE, height: ROWS * TILE }}
        >
          {map}
          <div
            data-player
            className="absolute top-0 left-0 flex size-8 items-center justify-center transition-transform duration-130 ease-linear"
            style={{ transform: `translate(${pos.x * TILE}px, ${pos.y * TILE}px)` }}
          >
            <span
              className="text-2xl drop-shadow"
              style={{ transform: `scaleX(${facing})` }}
            >
              {moving ? "🚶" : "🧍"}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-600">{t.officeHint}</p>
    </div>
  );
}
