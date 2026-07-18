import { describe, expect, it } from "vitest";
import type { Config } from "./money";
import {
  addDays,
  dayKey,
  dayStart,
  longestMs,
  msByDay,
  type SlackEvent,
  stolenMoney,
  totalMs,
  unionMs,
  weekStart,
} from "./slack";

const MIN = 60_000;
const at = (s: string) => new Date(s).getTime();

const ev = (startedAt: string, endedAt: string): SlackEvent => ({
  id: crypto.randomUUID(),
  startedAt: at(startedAt),
  endedAt: at(endedAt),
});

describe("totalMs", () => {
  const events = [
    ev("2026-07-17T10:00:00", "2026-07-17T10:30:00"),
    ev("2026-07-17T15:00:00", "2026-07-17T15:20:00"),
  ];

  it("加總區間內的事件", () => {
    expect(totalMs(events, at("2026-07-17T00:00:00"), at("2026-07-18T00:00:00"))).toBe(50 * MIN);
  });

  it("沒有事件就是 0", () => {
    expect(totalMs([], 0, Date.now())).toBe(0);
  });

  it("區間外的事件不算", () => {
    expect(totalMs(events, at("2026-07-18T00:00:00"), at("2026-07-19T00:00:00"))).toBe(0);
  });

  it("跨越區間邊界的事件只算落在區間內的那半", () => {
    const spanning = [ev("2026-07-17T09:45:00", "2026-07-17T10:15:00")];
    // 區間從 10:00 開始 → 只有後面 15 分鐘算數
    expect(totalMs(spanning, at("2026-07-17T10:00:00"), at("2026-07-17T11:00:00"))).toBe(15 * MIN);
  });
});

describe("unionMs(排行榜防灌水)", () => {
  it("不重疊時跟 totalMs 一樣", () => {
    const events = [
      ev("2026-07-17T10:00:00", "2026-07-17T10:30:00"),
      ev("2026-07-17T15:00:00", "2026-07-17T15:20:00"),
    ];
    expect(unionMs(events, at("2026-07-17T00:00:00"), at("2026-07-18T00:00:00"))).toBe(50 * MIN);
  });

  it("完全重疊的事件只算一次 —— 塞 100 筆整週覆蓋灌不了水", () => {
    const many = Array.from({ length: 100 }, () =>
      ev("2026-07-17T09:00:00", "2026-07-17T17:00:00"),
    );
    const day = unionMs(many, at("2026-07-17T00:00:00"), at("2026-07-18T00:00:00"));
    expect(day).toBe(8 * 60 * MIN); // 就是那 8 小時,不是 800 小時
  });

  it("部分重疊 union 成一段", () => {
    const events = [
      ev("2026-07-17T10:00:00", "2026-07-17T11:00:00"),
      ev("2026-07-17T10:30:00", "2026-07-17T12:00:00"),
    ];
    expect(unionMs(events, at("2026-07-17T00:00:00"), at("2026-07-18T00:00:00"))).toBe(120 * MIN);
  });

  it("包含關係:小區間被大區間吃掉", () => {
    const events = [
      ev("2026-07-17T10:00:00", "2026-07-17T14:00:00"),
      ev("2026-07-17T11:00:00", "2026-07-17T12:00:00"),
    ];
    expect(unionMs(events, at("2026-07-17T00:00:00"), at("2026-07-18T00:00:00"))).toBe(4 * 60 * MIN);
  });

  it("相鄰但不重疊:兩段都算,不會誤併", () => {
    const events = [
      ev("2026-07-17T10:00:00", "2026-07-17T11:00:00"),
      ev("2026-07-17T11:00:00", "2026-07-17T11:30:00"),
    ];
    expect(unionMs(events, at("2026-07-17T00:00:00"), at("2026-07-18T00:00:00"))).toBe(90 * MIN);
  });

  it("空陣列是 0", () => {
    expect(unionMs([], 0, Date.now())).toBe(0);
  });
});

describe("msByDay", () => {
  it("同一天的多筆事件會累加到同一格", () => {
    const m = msByDay([
      ev("2026-07-17T10:00:00", "2026-07-17T10:30:00"),
      ev("2026-07-17T14:00:00", "2026-07-17T14:10:00"),
    ]);
    expect(m.get("2026-07-17")).toBe(40 * MIN);
    expect(m.size).toBe(1);
  });

  it("忘記按結束、跨過午夜的事件會被拆到兩天,而不是整包算在第一天", () => {
    const m = msByDay([ev("2026-07-17T23:00:00", "2026-07-18T01:30:00")]);
    expect(m.get("2026-07-17")).toBe(60 * MIN);
    expect(m.get("2026-07-18")).toBe(90 * MIN);
  });

  it("跨好幾天的事件,中間整天的格子是滿的 24 小時", () => {
    const m = msByDay([ev("2026-07-17T22:00:00", "2026-07-20T02:00:00")]);
    expect(m.get("2026-07-17")).toBe(2 * 60 * MIN);
    expect(m.get("2026-07-18")).toBe(24 * 60 * MIN);
    expect(m.get("2026-07-19")).toBe(24 * 60 * MIN);
    expect(m.get("2026-07-20")).toBe(2 * 60 * MIN);
  });

  it("拆開之後的總和等於原本的長度,一毫秒都沒有漏掉", () => {
    const e = ev("2026-07-17T23:00:00", "2026-07-19T07:23:00");
    const sum = [...msByDay([e]).values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(e.endedAt - e.startedAt);
  });

  it("沒有事件就是空的", () => {
    expect(msByDay([]).size).toBe(0);
  });
});

describe("日期工具", () => {
  it("dayStart 歸零到當天午夜", () => {
    expect(dayStart(at("2026-07-17T15:47:23"))).toBe(at("2026-07-17T00:00:00"));
  });

  it("addDays 跨月", () => {
    expect(dayKey(addDays(at("2026-07-31T10:00:00"), 1))).toBe("2026-08-01");
  });

  it("addDays 跨年", () => {
    expect(dayKey(addDays(at("2026-12-31T10:00:00"), 1))).toBe("2027-01-01");
  });

  it("addDays 吃得下閏年的 2/29", () => {
    expect(dayKey(addDays(at("2028-02-28T10:00:00"), 1))).toBe("2028-02-29");
  });

  it("weekStart 回到那週的星期日", () => {
    // 2026-07-17 是星期五
    expect(dayKey(weekStart(at("2026-07-17T15:00:00")))).toBe("2026-07-12");
  });

  it("weekStart 對星期日本身是它自己", () => {
    expect(dayKey(weekStart(at("2026-07-12T23:59:00")))).toBe("2026-07-12");
  });
});

describe("stolenMoney", () => {
  // 日薪 2000 / 給薪 8 小時 → 時薪 250
  const cfg: Config = {
    monthlySalary: 44000,
    workdaysPerMonth: 22,
    shiftStart: "09:00",
    shiftEnd: "18:00",
    lunchStart: "12:00",
    lunchMinutes: 60,
  };

  it("摸魚兩小時 = 偷了兩小時的時薪", () => {
    const events = [ev("2026-07-17T10:00:00", "2026-07-17T12:00:00")];
    const v = stolenMoney(events, cfg, at("2026-07-17T00:00:00"), at("2026-07-18T00:00:00"));
    expect(v).toBeCloseTo(500, 6);
  });

  it("沒摸魚就沒偷", () => {
    expect(stolenMoney([], cfg, 0, Date.now())).toBe(0);
  });
});

describe("longestMs", () => {
  it("找出最長的一次", () => {
    const events = [
      ev("2026-07-17T10:00:00", "2026-07-17T10:05:00"),
      ev("2026-07-17T14:00:00", "2026-07-17T14:47:00"),
      ev("2026-07-17T16:00:00", "2026-07-17T16:10:00"),
    ];
    expect(longestMs(events)).toBe(47 * MIN);
  });

  it("沒有事件就是 0,不是 -Infinity", () => {
    expect(longestMs([])).toBe(0);
  });
});
