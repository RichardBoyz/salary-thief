// 辦公室地圖。ASCII 手繪,要改格局改字串就好,不需要地圖編輯器。
//
// 圖例:# 牆  D 桌子  C 茶水間(飲水機/咖啡機)  S 沙發  P 盆栽
//       B 書櫃  R 印表機(以上不可走)
//       . 地板  y 你的座位(工作區)  b 摸魚區(茶水間前/沙發前)
//       E 門(開在下牆,走進去就換房間:辦公室 ↔ 休息室)
// ⚠ 尺寸寫死在 migrate-v16-rooms.sql 的座標檢查裡(20×12),改大小要一起改
export const RAW = [
  "####################",
  "#B................P#",
  "#.D..D..D..D.R.P...#",
  "#.y................#",
  "#..................#",
  "#.D..D..D..........#",
  "#..................#",
  "#..............CC..#",
  "#....SS........bb..#",
  "#....b.............#",
  "#P.................#",
  "##########E#########",
] as const;

/** 不可走的代號。同一個字母在每張地圖意思都一樣(T 桌子、V 販賣機是休息室的) */
const SOLID = "#DCSPBRTV";

/** 門。走得進去(不在 SOLID),走進去的那一刻換房間 —— 判斷在 Office / Lounge */
export const DOOR = "E";

export const TILE = 32;
export const COLS = RAW[0].length;
export const ROWS = RAW.length;

export type Pos = { x: number; y: number };
export type Zone = "desk" | "break" | "floor";

// ---- 連續移動 ----
// v13 前是一格一格跳(Pokémon 式),現在角色座標是小數、每幀移動。遊戲判定
// (座位、茶水間、魚、外快區)仍然只看「腳底在哪一格」—— tileOf —— 所以
// 上面那些整數格的邏輯一行都不用改。

/** 腳底碰撞框的半寬/半高(格)。比一格小,一格寬的走道走得過去 */
const HX = 0.3;
const HY = 0.2;
const EPS = 1e-3;
/** 卡桌角時最多往旁邊推多遠(格)。再遠就是正面撞牆,不是擦邊 */
const NUDGE = 0.45;

/** 小數座標 → 腳底所在的格子 */
export const tileOf = (p: Pos): Pos => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

/**
 * 沿 a 軸前進被擋時,b 軸要挪多少才鑽得過去(0 = 正面撞牆,不推)。
 * hitAt(a, b) 把軸換回 (x,y),同一份邏輯給兩個方向用。
 */
const nudge = (
  hitAt: (a: number, b: number) => boolean,
  a0: number,
  a1: number,
  b: number,
  h: number,
  step: number,
): number => {
  const lo = Math.floor(b - h);
  const hi = Math.floor(b + h);
  if (lo === hi) return 0;
  const targets = [lo + 1 - h - EPS, hi + h + EPS].sort(
    (m, n) => Math.abs(m - b) - Math.abs(n - b),
  );
  for (const t of targets) {
    if (Math.abs(t - b) > NUDGE || hitAt(a1, t)) continue;
    const d = Math.sign(t - b) * Math.min(step, Math.abs(t - b));
    if (!hitAt(a0, b + d)) return d;
  }
  return 0;
};

export type GameMap = {
  raw: readonly string[];
  cols: number;
  rows: number;
  /** 地圖外一律當牆,走不出去 */
  tileAt: (p: Pos) => string;
  walkable: (p: Pos) => boolean;
  /** 腳底框中心在 (x,y) 時有沒有壓到實體格 */
  hits: (x: number, y: number) => boolean;
  slide: (p: Pos, dx: number, dy: number) => Pos;
  pathTo: (from: Pos, to: Pos) => Pos[];
};

/**
 * 一張 ASCII 地圖 → 碰撞與尋路。辦公室和休息室各一張,規則同一套:
 * 走起來手感一樣,遠端玩家的走位也用同一份 pathTo 重播。
 */
export function makeMap(raw: readonly string[]): GameMap {
  const tileAt = (p: Pos): string => raw[p.y]?.[p.x] ?? "#";
  const walkable = (p: Pos): boolean => !SOLID.includes(tileAt(p));
  const solidAt = (x: number, y: number) => !walkable({ x: Math.floor(x), y: Math.floor(y) });

  // 框小於一格,四個角就涵蓋所有可能
  const hits = (x: number, y: number): boolean =>
    solidAt(x - HX, y - HY) ||
    solidAt(x + HX, y - HY) ||
    solidAt(x - HX, y + HY) ||
    solidAt(x + HX, y + HY);

  /**
   * 移動 + 碰撞。逐軸處理:撞到的那一軸停下、另一軸照走,所以斜著貼牆會沿牆滑,
   * 不會整個黏住。只按一個方向卻擦到桌角時,往空的那邊推一點 —— 不用先對準格子
   * 才鑽得進桌子之間的走道。手感順不順,九成在這幾行。
   */
  const slide = (p: Pos, dx: number, dy: number): Pos => {
    let { x, y } = p;
    if (dx) {
      if (!hits(x + dx, y)) x += dx;
      else if (!dy) y += nudge((a, b) => hits(a, b), x, x + dx, y, HY, Math.abs(dx));
    }
    if (dy) {
      if (!hits(x, y + dy)) y += dy;
      else if (!dx) x += nudge((a, b) => hits(b, a), y, y + dy, x, HX, Math.abs(dy));
    }
    return { x, y };
  };

  /**
   * BFS 找從 from 到 to 的路徑,回傳步驟座標陣列(不含 from,含 to)。
   * 走不到或 to 不可走就回空陣列。地圖才幾百格,BFS 成本可以忽略。
   */
  const pathTo = (from: Pos, to: Pos): Pos[] => {
    if (!walkable(to)) return [];
    if (from.x === to.x && from.y === to.y) return [];
    const key = (p: Pos) => `${p.x},${p.y}`;
    const queue: Pos[] = [from];
    const prev = new Map<string, Pos | null>([[key(from), null]]);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.x === to.x && cur.y === to.y) {
        const path: Pos[] = [];
        let step: Pos | null = cur;
        while (step && !(step.x === from.x && step.y === from.y)) {
          path.unshift(step);
          step = prev.get(key(step)) ?? null;
        }
        return path;
      }
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        const next = { x: cur.x + dx, y: cur.y + dy };
        if (walkable(next) && !prev.has(key(next))) {
          prev.set(key(next), cur);
          queue.push(next);
        }
      }
    }
    return [];
  };

  return { raw, cols: raw[0].length, rows: raw.length, tileAt, walkable, hits, slide, pathTo };
}

export const OFFICE = makeMap(RAW);
// 辦公室的既有名字照舊匯出 —— 呼叫端與測試不用跟著改
export const { tileAt, walkable, hits, slide, pathTo } = OFFICE;


export const zoneAt = (p: Pos): Zone =>
  tileAt(p) === "y" ? "desk" : tileAt(p) === "b" ? "break" : "floor";

const find = (raw: readonly string[], ch: string): Pos => {
  for (let y = 0; y < raw.length; y++) {
    const x = raw[y].indexOf(ch);
    if (x !== -1) return { x, y };
  }
  throw new Error(`map has no '${ch}'`);
};

/** 進辦公室時的出生點:工作中站座位,摸魚中站茶水間 */
export const SPAWN_DESK = find(RAW, "y");
export const SPAWN_BREAK = find(RAW, "b");
export const OFFICE_DOOR = find(RAW, DOOR);
/** 從門進來的人站這裡(門正上方那格):從休息室回來、串門子進別隊房間 */
export const SPAWN_DOOR: Pos = { x: OFFICE_DOOR.x, y: OFFICE_DOOR.y - 1 };

/** 所有空地板格。魚點用 server 給的亂數對這個清單取模挑格子 —— 位置是
 *  純裝飾(可驗證的核心是時間視窗),所以 client 挑格子沒有作弊空間 */
export const FLOOR_TILES: Pos[] = [];
for (let fy = 0; fy < ROWS; fy++) {
  for (let fx = 0; fx < COLS; fx++) {
    if (RAW[fy][fx] === ".") FLOOR_TILES.push({ x: fx, y: fy });
  }
}

// ---- 外快區:2×2 綠框,站在裡面加倍領錢 ----
// 跟魚點不同,位置純本機決定:錢永遠不上傳、沒有作弊對象,所以不需要
// 伺服器種子,沒登入也玩得到。

/** 外快區換位週期(10 分鐘) */
export const ZONE_SLOT_MS = 10 * 60_000;

/** 所有「2×2 全是空地板」的錨點(左上角) */
export const ZONE_ANCHORS: Pos[] = FLOOR_TILES.filter(
  (p) =>
    tileAt({ x: p.x + 1, y: p.y }) === "." &&
    tileAt({ x: p.x, y: p.y + 1 }) === "." &&
    tileAt({ x: p.x + 1, y: p.y + 1 }) === ".",
);

/** 這個時刻的外快區錨點。決定性:同一時段永遠同位置,重整不跳位 */
export const bonusZoneAt = (now: number): Pos => {
  const slot = Math.floor(now / ZONE_SLOT_MS);
  // 打散 slot 再取模 —— 不打散的話位置會照清單順序規律輪播,太好背
  let h = (slot ^ 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return ZONE_ANCHORS[h % ZONE_ANCHORS.length];
};

/** p 是否落在 anchor 起算的 2×2 範圍內 */
export const inBonusZone = (p: Pos, a: Pos): boolean =>
  p.x >= a.x && p.x <= a.x + 1 && p.y >= a.y && p.y <= a.y + 1;

/**
 * 公司休息室(v15)。同公司所有隊伍共用一間,人可以很多,所以比辦公室大、
 * 中間留大片空地。整間都算摸魚,沒有座位/茶水間那種區域語意。
 *
 * 圖例(除辦公室那些之外):T 咖啡桌  V 販賣機。門(E)回辦公室
 * ⚠ 尺寸寫死在 migrate-v16-rooms.sql 的座標檢查裡(26×11),改大小要一起改
 */
export const LOUNGE_RAW = [
  "##########################",
  "#B...P......VV.CC.....P.B#",
  "#........................#",
  "#..T....T....T...........#",
  "#........................#",
  "#..T....T....T.....SS.SS.#",
  "#........................#",
  "#..................SS.SS.#",
  "#........................#",
  "#P......................P#",
  "############E#############",
] as const;

export const LOUNGE = makeMap(LOUNGE_RAW);
export const LOUNGE_DOOR = find(LOUNGE_RAW, DOOR);
/** 進休息室的位置:門口(門正上方那格) —— 不管走門還是按按鈕,都是從門進來 */
export const LOUNGE_SPAWN: Pos = { x: LOUNGE_DOOR.x, y: LOUNGE_DOOR.y - 1 };

/**
 * 同事 avatar 的站位。上班中 → 座位,摸魚中 → 茶水間/沙發,滿了站走道。
 * 同事的走位不同步(PLAN Phase 4),他們只會在狀態改變時「走」到對應區域。
 */
export const SPOTS = {
  chairs: [
    { x: 5, y: 3 },
    { x: 8, y: 3 },
    { x: 11, y: 3 },
    { x: 2, y: 6 },
    { x: 5, y: 6 },
    { x: 8, y: 6 },
  ] as Pos[],
  breaks: [
    { x: 16, y: 8 },
    { x: 5, y: 9 },
    { x: 15, y: 8 },
  ] as Pos[],
  floor: [
    { x: 3, y: 4 },
    { x: 7, y: 4 },
    { x: 11, y: 4 },
    { x: 4, y: 7 },
    { x: 8, y: 7 },
    { x: 12, y: 9 },
  ] as Pos[],
};
