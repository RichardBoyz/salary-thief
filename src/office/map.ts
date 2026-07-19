// 辦公室地圖。ASCII 手繪,要改格局改字串就好,不需要地圖編輯器。
//
// 圖例:# 牆  D 桌子  C 飲水機  S 沙發  P 盆栽(以上不可走)
//       . 地板  y 你的座位(工作區)  b 摸魚區(茶水間前/沙發前)
export const RAW = [
  "####################",
  "#..................#",
  "#.D..D..D..D...P...#",
  "#.y................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..............CC..#",
  "#....S.........bb..#",
  "#....b.............#",
  "#..................#",
  "####################",
] as const;

export const TILE = 32;
export const COLS = RAW[0].length;
export const ROWS = RAW.length;

export type Pos = { x: number; y: number };
export type Zone = "desk" | "break" | "floor";

/** 地圖外一律當牆,走不出去 */
export const tileAt = (p: Pos): string => RAW[p.y]?.[p.x] ?? "#";

export const walkable = (p: Pos): boolean => !"#DCSP".includes(tileAt(p));

export const zoneAt = (p: Pos): Zone =>
  tileAt(p) === "y" ? "desk" : tileAt(p) === "b" ? "break" : "floor";

const find = (ch: string): Pos => {
  for (let y = 0; y < ROWS; y++) {
    const x = RAW[y].indexOf(ch);
    if (x !== -1) return { x, y };
  }
  throw new Error(`map has no '${ch}'`);
};

/** 進辦公室時的出生點:工作中站座位,摸魚中站茶水間 */
export const SPAWN_DESK = find("y");
export const SPAWN_BREAK = find("b");
/** 串門子(進別隊房間)的出生點:門口附近的走道,不是任何人的座位 */
export const SPAWN_VISIT: Pos = { x: 10, y: 5 };

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

/** 撞牆就站在原地。回傳同一個物件參考 = 沒動,呼叫端可以直接比較 */
export const tryMove = (p: Pos, dx: number, dy: number): Pos => {
  const next = { x: p.x + dx, y: p.y + dy };
  return walkable(next) ? next : p;
};

/**
 * BFS 找從 from 到 to 的路徑,回傳步驟座標陣列(不含 from,含 to)。
 * 走不到或 to 不可走就回空陣列。給手機 tap-to-move 用 —— 點一格就走過去。
 * 地圖才 20×12,BFS 成本可以忽略。
 */
export const pathTo = (from: Pos, to: Pos): Pos[] => {
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

/**
 * 同事 avatar 的站位。上班中 → 座位,摸魚中 → 茶水間/沙發,滿了站走道。
 * 同事的走位不同步(PLAN Phase 4),他們只會在狀態改變時「走」到對應區域。
 */
export const SPOTS = {
  chairs: [
    { x: 5, y: 3 },
    { x: 8, y: 3 },
    { x: 11, y: 3 },
  ] as Pos[],
  breaks: [
    { x: 16, y: 8 },
    { x: 5, y: 9 },
    { x: 15, y: 8 },
  ] as Pos[],
  floor: [
    { x: 3, y: 5 },
    { x: 5, y: 5 },
    { x: 7, y: 5 },
    { x: 9, y: 5 },
    { x: 11, y: 5 },
    { x: 13, y: 5 },
  ] as Pos[],
};
