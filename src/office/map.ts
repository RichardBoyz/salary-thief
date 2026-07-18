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

/** 撞牆就站在原地。回傳同一個物件參考 = 沒動,呼叫端可以直接比較 */
export const tryMove = (p: Pos, dx: number, dy: number): Pos => {
  const next = { x: p.x + dx, y: p.y + dy };
  return walkable(next) ? next : p;
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
