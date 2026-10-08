import { describe, expect, it } from "vitest";
import { LOUNGE, OFFICE } from "./map";
import { ART, CHAIR, LOUNGE_SCENE, OFFICE_SCENE, PROP_COLORS, PROPS, STOOL } from "./props";

const all = { ...Object.fromEntries(Object.entries(PROPS).map(([k, p]) => [k, p.art])), CHAIR, STOOL };

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

  it("兩張地圖上每種實體格都畫得出來 —— 不會有看不見的空氣牆", () => {
    for (const map of [OFFICE, LOUNGE])
      map.raw.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch !== "#" && !map.walkable({ x, y })) expect(PROPS[ch], ch).toBeDefined();
        }),
      );
    expect(PROPS.c).toBeDefined(); // 茶水間右邊那台咖啡機
  });

  it("地板分區與牆上掛的東西都在房間範圍內", () => {
    for (const [map, def] of [
      [OFFICE, OFFICE_SCENE],
      [LOUNGE, LOUNGE_SCENE],
    ] as const) {
      for (const r of [def.tiles, def.rug]) {
        if (!r) continue;
        expect(r.x).toBeGreaterThanOrEqual(1);
        expect(r.y).toBeGreaterThanOrEqual(1);
        expect(r.x + r.w).toBeLessThanOrEqual(map.cols - 1);
        expect(r.y + r.h).toBeLessThanOrEqual(map.rows - 1);
      }
      for (const col of [...def.windows, def.ac ?? 1]) expect(col + 2).toBeLessThanOrEqual(map.cols - 1);
      expect(def.clock).toBeLessThan(map.cols - 1);
    }
  });
});
