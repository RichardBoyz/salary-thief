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

/** 撞牆就站在原地。回傳同一個物件參考 = 沒動,呼叫端可以直接比較 */
export const tryMove = (p: Pos, dx: number, dy: number): Pos => {
  const next = { x: p.x + dx, y: p.y + dy };
  return walkable(next) ? next : p;
};
