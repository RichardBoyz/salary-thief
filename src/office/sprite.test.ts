import { describe, expect, it } from "vitest";
import {
  FRAMES,
  runs,
  SPRITE_COLORS,
  SPRITE_H,
  SPRITE_W,
  walkFrame,
} from "./sprite";

describe("sprite 圖形本身", () => {
  it("每一格都是 SPRITE_W × SPRITE_H —— 手繪 ASCII 最容易錯的就是漏一個字元", () => {
    for (const frame of FRAMES) {
      expect(frame).toHaveLength(SPRITE_H);
      for (const row of frame) expect(row).toHaveLength(SPRITE_W);
    }
  });

  it("只用調色盤裡有的代號,不會畫出盤外顏色", () => {
    const allowed = new Set([".", ...Object.keys(SPRITE_COLORS)]);
    for (const frame of FRAMES) {
      for (const row of frame) {
        for (const ch of row) expect(allowed.has(ch)).toBe(true);
      }
    }
  });

  it("顏色一律走 CSS 變數 —— 寫死色碼會讓亮色主題的角色不換色", () => {
    for (const color of Object.values(SPRITE_COLORS)) {
      expect(color).toMatch(/^var\(--color-crt-/);
    }
  });

  it("三格:站著 + 兩格走路,而且走路那兩格真的不一樣", () => {
    expect(FRAMES).toHaveLength(3);
    expect(FRAMES[1]).not.toEqual(FRAMES[2]);
  });

  it("走路只換下半身,上半身三格完全一致", () => {
    const top = (f: string[]) => f.slice(0, 10);
    expect(top(FRAMES[1])).toEqual(top(FRAMES[0]));
    expect(top(FRAMES[2])).toEqual(top(FRAMES[0]));
  });
});

describe("runs(橫向合併)", () => {
  it("合併同色連續格,而且不吐出透明格", () => {
    const out = runs(["..hhh...bb..", ...Array(13).fill("............")]);
    expect(out).toEqual([
      { x: 2, y: 0, w: 3, color: SPRITE_COLORS.h },
      { x: 8, y: 0, w: 2, color: SPRITE_COLORS.b },
    ]);
  });

  it("相鄰但不同色不會被合併", () => {
    const out = runs(["hhbb........", ...Array(13).fill("............")]);
    expect(out.map((r) => [r.x, r.w])).toEqual([
      [0, 2],
      [2, 2],
    ]);
  });

  it("合併後畫出來的格數跟原圖不透明格數一致 —— 沒有畫多也沒有畫少", () => {
    for (const frame of FRAMES) {
      const solid = frame.join("").split("").filter((c) => c !== ".").length;
      const drawn = runs(frame).reduce((sum, r) => sum + r.w, 0);
      expect(drawn).toBe(solid);
    }
  });

  it("合併確實有省下節點(不然這個函式沒有存在意義)", () => {
    const solid = FRAMES[0].join("").split("").filter((c) => c !== ".").length;
    expect(runs(FRAMES[0]).length).toBeLessThan(solid / 2);
  });
});

describe("walkFrame", () => {
  it("在兩格走路之間交替,永遠不會回到站立格", () => {
    expect([0, 1, 2, 3, 4].map(walkFrame)).toEqual([1, 2, 1, 2, 1]);
  });

  it("負數(理論上不會發生)也不會吐出無效索引", () => {
    for (const n of [-1, -2, -99]) {
      expect(FRAMES[walkFrame(n)]).toBeDefined();
    }
  });
});
