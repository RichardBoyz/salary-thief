import { useLayoutEffect, useRef, useState } from "react";
import { ACTOR_H, ACTOR_W, type Pose } from "./Actor";
import { TILE, tileOf, type GameMap, type Pos } from "./map";
import { WALK, type Dir } from "./sprite";

/** 腳底點(小數格座標)→ 角色 svg 左上角(螢幕 px)。鞋底落在腳底點下方 6px,
 *  看起來是踩在格子裡,而不是頭頂對齊格線、整個人飄在上一格 */
export const actorAt = (x: number, y: number): [number, number] => [
  Math.round(x * TILE - ACTOR_W / 2),
  Math.round(y * TILE - ACTOR_H + 6),
];

/** 深度排序:腳底越下面越前面。家具用底邊列數 × 10,同一條軸 */
export const depth = (y: number) => Math.round(y * 10);

export const center = (p: Pos): Pos => ({ x: p.x + 0.5, y: p.y + 0.5 });

/** 走路速度(格/秒)。舊版一格 140ms ≈ 7 格/秒,但那是跳格;連續移動 5 格就夠快 */
export const SPEED = 5;
/** 走多遠換一拍走路動畫(格)。太短腳會像在跑,太長會像在滑 */
export const STRIDE = 0.4;

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

/** 打字中的按鍵不是走路 —— 不擋的話在留言板/聊天打 w/a/s/d 會被 preventDefault 吃掉 */
const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** 朝向:誰的分量大就面向誰。正斜走時原本的朝向還說得通就不換,不然會左右/上下抖 */
export function facing(c: Pose, vx: number, vy: number): Pick<Pose, "dir" | "flip"> {
  const side = { dir: "side" as Dir, flip: vx < 0 };
  const vert = { dir: (vy < 0 ? "up" : "down") as Dir, flip: c.flip };
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if (ax > ay + 0.01) return side;
  if (ay > ax + 0.01) return vert;
  if (c.dir === "side" && c.flip === side.flip) return side;
  if (c.dir === vert.dir) return vert;
  return side;
}

/**
 * 自己那個角色的走位:鍵盤、點地板走路(BFS)、碰撞、走路動畫、鏡頭。
 * 辦公室和休息室共用,地圖由參數決定。
 *
 * 腳底座標是小數(feet),每幀移動;遊戲判定只看它落在哪一格(pos)。位置與
 * 鏡頭直接寫 DOM transform,不經 React —— 60fps 重畫整個房間沒必要,React 只
 * 在「換格」與「換姿勢」時才知道(一秒幾次)。
 *
 * onMove 每一幀都會被叫(停下的那一幀 stopped = true);要省流量的呼叫端自己節流。
 */
export function useWalker(
  map: GameMap,
  spawn: Pos,
  spawnPose: Pose,
  onMove?: (feet: Pos, pose: Pose, stopped: boolean) => void,
) {
  const feet = useRef<Pos>(center(spawn));
  const [pos, setPos] = useState<Pos>(() => tileOf(feet.current));
  const [pose, setPose] = useState<Pose>(spawnPose);
  const poseRef = useRef(pose);
  // 點地板走路:點一格 → BFS 算好路徑塞這裡,每幀朝下一個格子中心走
  const path = useRef<Pos[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<HTMLDivElement>(null);
  const ctl = useRef({ kick: () => {}, place: () => {} });
  const moveCb = useRef(onMove);
  moveCb.current = onMove;

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const world = worldRef.current!;
    const me = meRef.current!;
    const keys = new Set<string>();
    let stageW = stage.clientWidth;
    let raf = 0;
    let last = 0;
    let walked = 0;

    const setPoseIf = (next: Pose) => {
      const c = poseRef.current;
      if (c.dir === next.dir && c.flip === next.flip && c.body === next.body && c.lift === next.lift)
        return;
      poseRef.current = next;
      setPose(next);
    };

    // 角色、鏡頭、深度一次寫完。鏡頭:舞台比房間寬就置中,窄就跟著人走
    const place = () => {
      const { x, y } = feet.current;
      const [ax, ay] = actorAt(x, y);
      me.style.transform = `translate(${ax}px, ${ay}px)`;
      me.style.zIndex = String(depth(y));
      const worldW = map.cols * TILE;
      const cam =
        stageW >= worldW
          ? (stageW - worldW) / 2
          : Math.min(0, Math.max(stageW - worldW, stageW / 2 - x * TILE));
      world.style.transform = `translateX(${Math.round(cam)}px)`;
      const tile = tileOf(feet.current);
      setPos((p) => (p.x === tile.x && p.y === tile.y ? p : tile));
    };

    const frame = (time: number) => {
      // dt 夾在 100ms:切回分頁的第一幀不會一口氣瞬移好幾格,掉幀的舊電腦也不會變慢動作
      const dt = last ? Math.min(time - last, 100) / 1000 : 1 / 60;
      last = time;
      let vx = 0;
      let vy = 0;
      let limit = Infinity;
      for (const k of keys) {
        vx += DIRS[k][0];
        vy += DIRS[k][1];
      }
      const p = feet.current;
      if (vx || vy) {
        path.current = []; // 鍵盤介入就取消 tap 走路
      } else {
        while (path.current.length) {
          const c = center(path.current[0]);
          const d = Math.hypot(c.x - p.x, c.y - p.y);
          if (d > 0.02) {
            vx = (c.x - p.x) / d;
            vy = (c.y - p.y) / d;
            limit = d; // 不要衝過頭,到格子中心剛好停
            break;
          }
          path.current.shift();
        }
      }
      const len = Math.hypot(vx, vy);
      let moved = 0;
      if (len) {
        const step = Math.min(SPEED * dt, limit);
        const next = map.slide(p, (vx / len) * step, (vy / len) * step);
        moved = Math.hypot(next.x - p.x, next.y - p.y);
        feet.current = next;
        if (path.current.length && moved < step / 4) path.current = []; // 卡住就放棄
      }
      // 走路格由「實際移動距離」驅動:面壁推不動時腳不會空踩
      walked += moved;
      const beat = WALK[Math.floor(walked / STRIDE) % WALK.length];
      const turn = len ? facing(poseRef.current, vx, vy) : poseRef.current;
      setPoseIf({ ...turn, body: moved ? beat : 0, lift: moved > 0 && beat === 0 });
      place();
      const going = keys.size > 0 || path.current.length > 0;
      if (going) raf = requestAnimationFrame(frame);
      else {
        // 停下來就停掉 rAF:這個 app 會被開一整天,站著不動不該燒 CPU
        raf = 0;
        last = 0;
        setPoseIf({ ...poseRef.current, body: 0, lift: false });
      }
      moveCb.current?.(feet.current, poseRef.current, !going);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in DIRS) || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault(); // 方向鍵不捲頁面
      // 按住不放的自動連發不算「新按下」:按著 ↓ 走進門,到了另一間還按著,不擋的話
      // 會一路走回門裡被彈回來;切回分頁時還按著的鍵也一樣,要放開再按才走
      if (e.repeat) return;
      keys.add(k);
      kick();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    // 切走分頁時收不到 keyup,不清掉的話回來角色會自己一直走
    const blur = () => keys.clear();
    const ro = new ResizeObserver(() => {
      stageW = stage.clientWidth;
      place();
    });

    ctl.current = { kick, place };
    place();
    ro.observe(stage);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [map]);

  // 點/觸控地圖某一格 → 走過去(BFS)。world 的 rect 已含鏡頭位移,直接換算
  const tapMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const target = {
      x: Math.floor((e.clientX - rect.left) / TILE),
      y: Math.floor((e.clientY - rect.top) / TILE),
    };
    const p = map.pathTo(tileOf(feet.current), target);
    if (p.length) {
      path.current = p;
      ctl.current.kick();
    }
  };

  /** 瞬移到某一格(換房間、重生)。不是走過去,所以不觸發 onMove */
  const teleport = (tile: Pos, facingPose: Pose) => {
    feet.current = center(tile);
    path.current = [];
    poseRef.current = facingPose;
    setPose(facingPose);
    ctl.current.place();
  };

  return { stageRef, worldRef, meRef, feet, pos, pose, tapMove, teleport };
}
