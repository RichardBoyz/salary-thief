import { describe, expect, it } from "vitest";
import {
  ALL_FRAMES,
  AVATAR_SLOTS,
  decodeAvatar,
  defaultAvatar,
  encodeAvatar,
  frameOf,
  HAIRS,
  lookFor,
  lookOf,
  runs,
  shapeRuns,
  SPRITE_H,
  SPRITE_W,
  SWATCHES,
  WALK,
  type Avatar,
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
    const looks = ids.map((id) => lookFor(id));
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

describe("自訂外觀(Avatar)", () => {
  /** 所有組合:3 × 6 × 4 × 8 × 4 × 4 = 9216 種,全掃一遍也只要幾毫秒 */
  const all = AVATAR_SLOTS.reduce<Avatar[]>(
    (acc, [k, n]) => acc.flatMap((a) => Array.from({ length: n }, (_, i) => ({ ...a, [k]: i }))),
    [{} as Avatar],
  );

  it("v13 上線時大家的預設臉,改成可自訂之後一張都沒變", () => {
    // 這幾組值是改版前的 lookFor 實際算出來的。紅了 = 沒自訂的人會突然變臉
    const golden: [string, string, string, string, string, string, string][] = [
      ["me", "bob", "#8f5b3b", "#a8693c", "#e9e5dc", "#3c3c46", "#e9e5dc"],
      ["u0", "bob", "#f7d7bb", "#a8693c", "#8a69cc", "#2f3a58", "#c43b3b"],
      ["3f1c2d4e-0000-4000-8000-000000000001", "bun", "#c98e5f", "#e4c170", "#8a69cc", "#3c3c46", "#8a69cc"],
      ["a8f5b7c2-9e1d-4c3b-b2a1-0d9e8f7c6b5a", "bob", "#f7d7bb", "#a8693c", "#3ea8a3", "#2f3a58", "#3ea8a3"],
    ];
    for (const [id, hair, s, h, c, p, tie] of golden) {
      const { colors, ...rest } = lookFor(id);
      expect([rest.hair, colors.s, colors.h, colors.c, colors.p, colors.t], id).toEqual([
        hair, s, h, c, p, tie,
      ]);
    }
  });

  it("每一種組合編碼後都是 DB 收的格式,而且解得回同一套", () => {
    expect(all).toHaveLength(9216);
    for (const a of all) {
      const code = encodeAvatar(a);
      expect(code).toMatch(/^[0-9a-z]{6}$/); // 跟 migrate-v14 的 check 同一條
      expect(decodeAvatar(code)).toEqual(a);
    }
  });

  it("壞掉的編碼一律不認 —— 呼叫端退回預設臉,不會畫出缺色的人", () => {
    for (const bad of [null, undefined, "", "10234", "1023401", "ABCDEF", "1023-0", "zzzzzz", "302340"])
      expect(decodeAvatar(bad), String(bad)).toBeNull();
  });

  it("有自訂就用自訂,壞掉的存檔退回 userId 的預設臉", () => {
    const mine: Avatar = { hair: 2, hairColor: 5, skin: 0, shirt: 7, pants: 3, tie: 0 };
    expect(lookFor(ids[1], encodeAvatar(mine))).toBe(lookOf(mine));
    expect(lookFor(ids[1], "zzzzzz")).toBe(lookFor(ids[1]));
    expect(lookFor(ids[1], null)).toBe(lookOf(defaultAvatar(ids[1])));
  });

  it("同一套外觀共用同一個物件(Actor 的 memo 靠這個)", () => {
    const a: Avatar = { hair: 1, hairColor: 2, skin: 3, shirt: 4, pants: 1, tie: 2 };
    expect(lookOf({ ...a })).toBe(lookOf({ ...a }));
  });

  it("領帶 0 = 不打(畫成衣服色),其他 = 對應色票", () => {
    const base: Avatar = { hair: 0, hairColor: 0, skin: 0, shirt: 2, pants: 0, tie: 0 };
    const none = lookOf(base);
    expect(none.colors.t).toBe(none.colors.c);
    SWATCHES.tie.forEach((color, i) => expect(lookOf({ ...base, tie: i + 1 }).colors.t).toBe(color));
  });

  it("預設臉一定是合法外觀(解得回來、每一項都在範圍內)", () => {
    for (const id of ids) {
      const a = defaultAvatar(id);
      expect(decodeAvatar(encodeAvatar(a))).toEqual(a);
    }
  });
});
