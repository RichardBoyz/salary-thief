import { describe, expect, it } from "vitest";
import { COLS, RAW, ROWS, walkable } from "./map";
import { ART, CHAIR, PANTRY, PROP_COLORS, PROPS, RUG } from "./props";

const all = { ...Object.fromEntries(Object.entries(PROPS).map(([k, p]) => [k, p.art])), CHAIR };

describe("家具美術", () => {
  it("每件家具每一列等寬,寬度是整數格、至少一格高", () => {
    for (const [name, art] of Object.entries(all)) {
      const w = art[0].length;
      expect(w % ART, name).toBe(0);
      expect(art.length, name).toBeGreaterThanOrEqual(ART);
      for (const row of art) expect(row, name).toHaveLength(w);
    }
  });

  it("用到的代號都有顏色", () => {
    for (const [name, art] of Object.entries(all))
      for (const ch of new Set(art.join("").replaceAll(".", "")))
        expect(PROP_COLORS[ch], `${name} 缺 ${ch}`).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("地圖上每種實體格都畫得出來 —— 不會有看不見的空氣牆", () => {
    RAW.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== "#" && !walkable({ x, y })) expect(PROPS[ch], ch).toBeDefined();
      }),
    );
    expect(PROPS.c).toBeDefined(); // 茶水間右邊那台咖啡機
  });

  it("地板分區都在牆內", () => {
    for (const r of [PANTRY, RUG]) {
      expect(r.x).toBeGreaterThanOrEqual(1);
      expect(r.y).toBeGreaterThanOrEqual(1);
      expect(r.x + r.w).toBeLessThanOrEqual(COLS - 1);
      expect(r.y + r.h).toBeLessThanOrEqual(ROWS - 1);
    }
  });
});
