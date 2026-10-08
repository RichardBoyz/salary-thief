import { describe, expect, it } from "vitest";
import {
  ALL_FRAMES,
  frameOf,
  HAIRS,
  lookFor,
  runs,
  shapeRuns,
  SPRITE_H,
  SPRITE_W,
  WALK,
  type Dir,
} from "./sprite";

const DIRS: Dir[] = ["down", "up", "side"];
const ids = Array.from({ length: 300 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("sprite 圖形本身", () => {
  it("每一張組合圖都是 SPRITE_W × SPRITE_H —— 手繪 ASCII 最容易錯的就是漏一個字元", () => {
    expect(ALL_FRAMES).toHaveLength(HAIRS.length * DIRS.length * 3);
    for (const frame of ALL_FRAMES) {
      expect(frame).toHaveLength(SPRITE_H);
      for (const row of frame) expect(row).toHaveLength(SPRITE_W);
    }
  });

  it("圖上用到的每個代號,每個人的配色都有對應顏色(不會畫出透明破洞)", () => {
    const used = new Set(ALL_FRAMES.flat().join("").replaceAll(".", ""));
    for (const id of ids.slice(0, 50)) {
      const { colors } = lookFor(id);
      for (const ch of used) expect(colors[ch], `${id} 缺 ${ch}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("每個方向的走路兩格真的不一樣,也跟站姿不一樣", () => {
    for (const hair of HAIRS)
      for (const dir of DIRS) {
        const [idle, a, b] = [0, 1, 2].map((n) => frameOf(hair, dir, n));
        expect(a).not.toEqual(b);
        expect(a).not.toEqual(idle);
      }
  });

  it("走路只動身體,頭三格完全一致 —— 不然走起來頭會抖", () => {
    for (const hair of HAIRS)
      for (const dir of DIRS) {
        const head = (n: number) => frameOf(hair, dir, n).slice(0, 12);
        expect(head(1)).toEqual(head(0));
        expect(head(2)).toEqual(head(0));
      }
  });

  it("走路循環:跨一腳、收、跨另一腳、收", () => {
    expect([...WALK]).toEqual([1, 0, 2, 0]);
  });
});

describe("runs(橫向合併)", () => {
  it("合併同代號連續格,而且不吐出透明格", () => {
    const out = runs(["..hhh...bb......"]);
    expect(out).toEqual([
      { x: 2, y: 0, w: 3, ch: "h" },
      { x: 8, y: 0, w: 2, ch: "b" },
    ]);
  });

  it("相鄰但不同代號不會被合併", () => {
    const out = runs(["hhbb............"]);
    expect(out.map((r) => [r.x, r.w])).toEqual([
      [0, 2],
      [2, 2],
    ]);
  });

  it("合併後畫出來的格數跟原圖不透明格數一致 —— 沒有畫多也沒有畫少", () => {
    for (const frame of ALL_FRAMES) {
      const solid = frame.join("").replaceAll(".", "").length;
      const drawn = runs(frame).reduce((sum, r) => sum + r.w, 0);
      expect(drawn).toBe(solid);
    }
  });

  it("合併確實有省下節點(不然這個函式沒有存在意義)", () => {
    const frame = frameOf("short", "down", 0);
    expect(runs(frame).length).toBeLessThan(frame.join("").replaceAll(".", "").length / 2);
  });

  it("shapeRuns 快取:同一個形狀回傳同一個陣列", () => {
    expect(shapeRuns("bob", "side", 1)).toBe(shapeRuns("bob", "side", 1));
  });
});

describe("lookFor(userId → 外觀)", () => {
  it("同一個 id 永遠同一張臉 —— 重整、換裝置都一樣", () => {
    expect(lookFor(ids[7])).toBe(lookFor(ids[7]));
  });

  it("一間辦公室的人長得夠不一樣:髮型、髮色、衣服都有分散", () => {
    const looks = ids.map(lookFor);
    expect(new Set(looks.map((l) => l.hair)).size).toBe(HAIRS.length);
    expect(new Set(looks.map((l) => l.colors.h)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(looks.map((l) => l.colors.c)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(looks.map((l) => l.colors.s)).size).toBeGreaterThanOrEqual(3);
  });

  it("沒有哪一種髮型獨佔(任一種都不超過六成)", () => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(lookFor(id).hair, (counts.get(lookFor(id).hair) ?? 0) + 1);
    for (const n of counts.values()) expect(n / ids.length).toBeLessThan(0.6);
  });
});
