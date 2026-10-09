import { describe, expect, it } from "vitest";
import {
  bonusZoneAt,
  COLS,
  inBonusZone,
  pathTo,
  DOOR,
  LOUNGE,
  LOUNGE_SPAWN,
  OFFICE_DOOR,
  RAW,
  ROWS,
  SPAWN_BREAK,
  SPAWN_DESK,
  SPAWN_DOOR,
  hits,
  slide,
  SPOTS,
  tileAt,
  tileOf,
  walkable,
  ZONE_ANCHORS,
  ZONE_SLOT_MS,
  zoneAt,
} from "./map";

describe("地圖本身", () => {
  it("每一列等寬 —— ASCII 手繪最容易出的錯", () => {
    for (const row of RAW) expect(row.length).toBe(COLS);
  });

  it("四周是牆,只在下牆開一扇門;走進門也走不出世界", () => {
    for (let x = 0; x < COLS; x++) {
      expect(RAW[0][x]).toBe("#");
      expect(RAW[ROWS - 1][x]).toBe(x === OFFICE_DOOR.x ? DOOR : "#");
    }
    for (let y = 0; y < ROWS; y++) {
      expect(RAW[y][0]).toBe("#");
      expect(RAW[y][COLS - 1]).toBe("#");
    }
    expect([...RAW.join("")].filter((c) => c === DOOR)).toHaveLength(1);
    // 門外(地圖外)當牆:一直往下走,腳底停在門那一格裡
    let p = { x: OFFICE_DOOR.x + 0.5, y: OFFICE_DOOR.y - 0.5 };
    for (let i = 0; i < 30; i++) p = slide(p, 0, 0.1);
    expect(tileOf(p)).toEqual(OFFICE_DOOR);
  });

  it("兩間的門都走得到:從出生點有路走進門", () => {
    expect(pathTo(SPAWN_DESK, OFFICE_DOOR).at(-1)).toEqual(OFFICE_DOOR);
    expect(walkable(OFFICE_DOOR)).toBe(true);
    const loungeDoor = { x: LOUNGE_SPAWN.x, y: LOUNGE_SPAWN.y + 1 };
    expect(LOUNGE.tileAt(loungeDoor)).toBe(DOOR);
    expect(LOUNGE.pathTo(LOUNGE_SPAWN, loungeDoor)).toEqual([loungeDoor]);
  });

  it("恰好一個自己的座位、至少一格摸魚區", () => {
    const all = RAW.join("");
    expect([...all].filter((c) => c === "y").length).toBe(1);
    expect([...all].filter((c) => c === "b").length).toBeGreaterThan(0);
  });

  it("三個出生點都站得住,門口是中性走道(從門進來不會一進門就開始/結束摸魚)", () => {
    expect(walkable(SPAWN_DESK)).toBe(true);
    expect(walkable(SPAWN_BREAK)).toBe(true);
    expect(walkable(SPAWN_DOOR)).toBe(true);
    expect(zoneAt(SPAWN_DOOR)).toBe("floor");
    expect(LOUNGE.walkable(LOUNGE_SPAWN)).toBe(true);
  });

  it("同事的每個站位都站得住 —— 改地圖字串時這條會擋住把人埋進牆裡", () => {
    for (const p of [...SPOTS.chairs, ...SPOTS.breaks, ...SPOTS.floor]) {
      expect(walkable(p)).toBe(true);
    }
  });

  it("摸魚站位真的在摸魚區,座位站位不在 —— 站錯區會觸發錯的狀態語意", () => {
    for (const p of SPOTS.breaks) expect(zoneAt(p)).toBe("break");
    for (const p of SPOTS.chairs) expect(zoneAt(p)).toBe("floor");
  });
});

describe("zoneAt", () => {
  it("座位是 desk、摸魚格是 break、地板是 floor", () => {
    expect(zoneAt(SPAWN_DESK)).toBe("desk");
    expect(zoneAt(SPAWN_BREAK)).toBe("break");
    expect(zoneAt({ x: 10, y: 5 })).toBe("floor");
  });
});

describe("家具都是實體", () => {
  it("桌子、茶水間、沙發、盆栽、書櫃、印表機都走不進去", () => {
    for (const ch of "DCSPBR") {
      const y = RAW.findIndex((row) => row.includes(ch));
      expect(y, `地圖上找不到 ${ch}`).toBeGreaterThan(-1);
      expect(walkable({ x: RAW[y].indexOf(ch), y })).toBe(false);
    }
  });

  it("地圖外當牆:就算資料壞掉指到外面,也走不出去", () => {
    expect(walkable({ x: -1, y: 3 })).toBe(false);
    expect(walkable({ x: 3, y: 99 })).toBe(false);
  });
});

describe("slide(連續移動 + 碰撞)", () => {
  const open = { x: 10.5, y: 4.5 }; // 走道正中間,四周都是地板

  it("空地板照實移動", () => {
    expect(slide(open, 0.1, -0.05)).toEqual({ x: 10.6, y: 4.45 });
  });

  it("撞牆停下,不會走進牆裡", () => {
    let p = { x: 1.5, y: 4.5 };
    for (let i = 0; i < 20; i++) p = slide(p, -0.1, 0);
    expect(p.x).toBeGreaterThan(1);
    expect(p.x).toBeLessThan(1.5);
    expect(hits(p.x, p.y)).toBe(false);
  });

  it("斜著貼牆走會沿牆滑,不會整個黏住", () => {
    // 貼著上牆往右上走:y 被擋,x 照走
    let p = { x: 10.5, y: 1.25 };
    for (let i = 0; i < 5; i++) p = slide(p, 0.1, -0.1);
    expect(p.x).toBeCloseTo(11, 5);
    expect(p.y).toBeGreaterThan(1);
  });

  it("擦到桌角會被推進走道 —— 不用先對準格子", () => {
    // 桌子在 (5,2),(3,2)(4,2) 是走道。站在 (4,3) 偏右、碰撞框跨進桌子那欄,一直往上
    let p = { x: 4.9, y: 3.5 };
    for (let i = 0; i < 40; i++) p = slide(p, 0, -0.1);
    expect(p.y).toBeLessThan(2); // 穿過桌子那一排,一路走到上牆
    expect(tileOf(p).x).toBe(4);
  });

  it("正面撞牆不亂推:框整個在桌子正下方時就是停住", () => {
    let p = { x: 5.5, y: 3.5 };
    for (let i = 0; i < 20; i++) p = slide(p, 0, -0.1);
    expect(p.x).toBe(5.5);
    expect(tileOf(p)).toEqual({ x: 5, y: 3 });
  });

  it("隨機亂走五千步,碰撞框一次都沒有壓進實體格", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
    let p = { x: 10.5, y: 4.5 };
    for (let i = 0; i < 5000; i++) {
      p = slide(p, rand() * 0.3, rand() * 0.3);
      expect(hits(p.x, p.y)).toBe(false);
      expect(walkable(tileOf(p))).toBe(true);
    }
  });

  it("tileOf 取腳底所在的格子", () => {
    expect(tileOf({ x: 2.99, y: 3.01 })).toEqual({ x: 2, y: 3 });
  });
});

describe("外快區", () => {
  it("錨點存在,且 2×2 全是空地板(不會框到牆或家具)", () => {
    expect(ZONE_ANCHORS.length).toBeGreaterThan(0);
    for (const a of ZONE_ANCHORS)
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const)
        expect(tileAt({ x: a.x + dx, y: a.y + dy })).toBe(".");
  });

  it("同一時段同位置 —— 重整頁面外快區不跳位", () => {
    const slotStart =
      Math.floor(Date.parse("2026-07-20T10:00:00") / ZONE_SLOT_MS) * ZONE_SLOT_MS;
    expect(bonusZoneAt(slotStart)).toEqual(bonusZoneAt(slotStart + ZONE_SLOT_MS - 1));
  });

  it("時段輪替會換位置(掃一天不會永遠同一格)", () => {
    const t0 = Date.parse("2026-07-20T00:00:00");
    const spots = new Set(
      Array.from({ length: 144 }, (_, i) => {
        const p = bonusZoneAt(t0 + i * ZONE_SLOT_MS);
        return `${p.x},${p.y}`;
      }),
    );
    expect(spots.size).toBeGreaterThan(1);
  });

  it("inBonusZone 判 2×2 範圍,邊界外不算", () => {
    const a = { x: 3, y: 4 };
    expect(inBonusZone({ x: 3, y: 4 }, a)).toBe(true);
    expect(inBonusZone({ x: 4, y: 5 }, a)).toBe(true);
    expect(inBonusZone({ x: 5, y: 4 }, a)).toBe(false);
    expect(inBonusZone({ x: 2, y: 4 }, a)).toBe(false);
  });
});

describe("pathTo(手機 tap-to-move)", () => {
  it("直線路徑:步數 = 曼哈頓距離,每步都可走", () => {
    const from = { x: 3, y: 4 };
    const to = { x: 7, y: 4 };
    const path = pathTo(from, to);
    expect(path.length).toBe(4);
    expect(path.at(-1)).toEqual(to);
    for (const p of path) expect(walkable(p)).toBe(true);
  });

  it("每一步都跟前一步相鄰(沒有跳格)", () => {
    const path = pathTo({ x: 2, y: 3 }, { x: 15, y: 8 });
    let prev = { x: 2, y: 3 };
    for (const p of path) {
      expect(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)).toBe(1);
      prev = p;
    }
    expect(path.at(-1)).toEqual({ x: 15, y: 8 });
  });

  it("目標是牆 → 空路徑(點不進去)", () => {
    expect(pathTo({ x: 2, y: 3 }, { x: 0, y: 0 })).toEqual([]);
  });

  it("原地不動 → 空路徑", () => {
    expect(pathTo({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([]);
  });
});
