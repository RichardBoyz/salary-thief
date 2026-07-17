import { describe, expect, it } from "vitest";
import {
  COLS,
  RAW,
  ROWS,
  SPAWN_BREAK,
  SPAWN_DESK,
  tryMove,
  walkable,
  zoneAt,
} from "./map";

describe("地圖本身", () => {
  it("每一列等寬 —— ASCII 手繪最容易出的錯", () => {
    for (const row of RAW) expect(row.length).toBe(COLS);
  });

  it("四周是封閉的牆,角色走不出世界", () => {
    for (let x = 0; x < COLS; x++) {
      expect(RAW[0][x]).toBe("#");
      expect(RAW[ROWS - 1][x]).toBe("#");
    }
    for (let y = 0; y < ROWS; y++) {
      expect(RAW[y][0]).toBe("#");
      expect(RAW[y][COLS - 1]).toBe("#");
    }
  });

  it("恰好一個自己的座位、至少一格摸魚區", () => {
    const all = RAW.join("");
    expect([...all].filter((c) => c === "y").length).toBe(1);
    expect([...all].filter((c) => c === "b").length).toBeGreaterThan(0);
  });

  it("兩個出生點都站得住", () => {
    expect(walkable(SPAWN_DESK)).toBe(true);
    expect(walkable(SPAWN_BREAK)).toBe(true);
  });
});

describe("zoneAt", () => {
  it("座位是 desk、摸魚格是 break、地板是 floor", () => {
    expect(zoneAt(SPAWN_DESK)).toBe("desk");
    expect(zoneAt(SPAWN_BREAK)).toBe("break");
    expect(zoneAt({ x: 10, y: 5 })).toBe("floor");
  });
});

describe("tryMove", () => {
  it("空地板走得動", () => {
    expect(tryMove({ x: 10, y: 5 }, 1, 0)).toEqual({ x: 11, y: 5 });
  });

  it("撞牆站在原地,回傳同一個參考", () => {
    const p = { x: 1, y: 1 };
    expect(tryMove(p, -1, 0)).toBe(p);
    expect(tryMove(p, 0, -1)).toBe(p);
  });

  it("桌子、飲水機、沙發、盆栽都是實體,穿不過去", () => {
    // 座位 (2,3) 正上方 (2,2) 是桌子
    const atDesk = SPAWN_DESK;
    expect(tryMove(atDesk, 0, -1)).toBe(atDesk);
    // 茶水間 b 的正上方是飲水機 C
    expect(tryMove(SPAWN_BREAK, 0, -1)).toBe(SPAWN_BREAK);
  });

  it("地圖外當牆:就算資料壞掉指到外面,也走不出去", () => {
    const p = { x: 0, y: 0 };
    expect(tryMove(p, -1, -1)).toBe(p);
  });
});
