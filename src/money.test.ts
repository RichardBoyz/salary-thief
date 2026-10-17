import { describe, expect, it } from "vitest";
import {
  type Config,
  FISH_POINTS,
  msUntilOffWork,
  points,
  POINTS_PER_MIN,
  progress,
  todayShift,
  workState,
} from "./money";

// 班表 9 小時扣午休 1 小時 = 給薪 8 小時。v8 之後這裡沒有薪水了
const cfg: Config = {
  shiftStart: "09:00",
  shiftEnd: "18:00",
  lunchStart: "12:00",
  lunchMinutes: 60,
};

/** 本地時區的當天某時刻 */
const t = (hhmm: string) => new Date(`2026-07-17T${hhmm}:00`).getTime();

describe("progress(今日進度)", () => {
  it.each([
    ["上班前一小時", "08:00", 0],
    ["剛好上班", "09:00", 0],
    ["上班一小時", "10:00", 1 / 8],
    ["午休開始", "12:00", 3 / 8],
    ["午休中不前進", "12:30", 3 / 8],
    ["午休結束那一刻", "13:00", 3 / 8],
    ["午休後又開始走", "14:00", 4 / 8],
    ["剛好下班", "18:00", 1],
    ["下班後不再累加", "23:00", 1],
  ])("%s (%s) → %f", (_label, time, expected) => {
    expect(progress(cfg, t(time))).toBeCloseTo(expected, 9);
  });

  it("是 now 的純函式 —— 同樣時刻算幾次都一樣(這就是不用 setInterval 累加的理由)", () => {
    const at1430 = t("14:30");
    const results = Array.from({ length: 100 }, () => progress(cfg, at1430));
    expect(new Set(results).size).toBe(1);
  });

  it("單調遞增,不會因為取樣間隔不同而算出不同結果", () => {
    let prev = 0;
    for (let ms = t("09:00"); ms <= t("18:00"); ms += 60_000) {
      const v = progress(cfg, ms);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(prev).toBe(1);
  });
});

describe("workState", () => {
  it.each([
    ["08:59", "before"],
    ["09:00", "working"],
    ["11:59", "working"],
    ["12:00", "lunch"],
    ["12:59", "lunch"],
    ["13:00", "working"],
    ["17:59", "working"],
    ["18:00", "after"],
    ["20:00", "after"],
  ])("%s → %s", (time, expected) => {
    expect(workState(cfg, t(time))).toBe(expected);
  });
});

describe("距離下班", () => {
  it("下班前算得出來,下班後夾 0", () => {
    expect(msUntilOffWork(cfg, t("17:00"))).toBe(3600_000);
    expect(msUntilOffWork(cfg, t("19:00"))).toBe(0);
  });
});

describe("爛輸入不能算出 NaN 或負數", () => {
  const bad = (patch: Partial<Config>) => ({ ...cfg, ...patch });

  it("下班時間早於上班時間 → 0,不是負數", () => {
    expect(progress(bad({ shiftStart: "18:00", shiftEnd: "09:00" }), t("14:00"))).toBe(0);
  });

  it("午休吃掉整個班表 → 0,不是 NaN", () => {
    const v = progress(bad({ lunchStart: "09:00", lunchMinutes: 24 * 60 }), t("14:00"));
    expect(v).toBe(0);
    expect(v).not.toBeNaN();
  });

  it("午休只吃掉班表的後半段 → 只有前半段給薪,而且走滿就封頂", () => {
    // 午休 12:00 開始、長達 24 小時 → 只有 09:00~12:00 這 3 小時算給薪。
    // 所以 12:00 進度就已經滿了,之後不再增加。這是對的,不是 bug。
    const swallowed = bad({ lunchMinutes: 24 * 60 });
    expect(todayShift(swallowed, t("14:00")).paidMs).toBe(3 * 3600_000);
    expect(progress(swallowed, t("12:00"))).toBe(1);
    expect(progress(swallowed, t("14:00"))).toBe(1);
  });

  it("午休完全落在班表外時不扣給薪時數", () => {
    const nightLunch = bad({ lunchStart: "03:00", lunchMinutes: 60 });
    expect(todayShift(nightLunch, t("14:00")).paidMs).toBe(9 * 3600_000);
  });

  it("localStorage 被亂改成空字串時不能吐 NaN", () => {
    const junk = bad({ shiftStart: "", shiftEnd: "", lunchStart: "" });
    expect(progress(junk, t("14:00"))).not.toBeNaN();
    expect(msUntilOffWork(junk, t("14:00"))).not.toBeNaN();
  });
});

describe("points(摸魚幣)", () => {
  it("沒站沒魚就是 0 —— 按鈕計時不生幣", () => {
    expect(points(0, 0)).toBe(0);
  });

  it("站一分鐘 = 10 點,站一小時 = 600 點", () => {
    expect(points(60_000, 0)).toBe(POINTS_PER_MIN);
    expect(points(3_600_000, 0)).toBe(60 * POINTS_PER_MIN);
  });

  it("六秒跳一點,不到六秒不給 —— 整數不會出現小數點", () => {
    expect(points(5_999, 0)).toBe(0);
    expect(points(6_000, 0)).toBe(1);
    expect(Number.isInteger(points(123_456, 3))).toBe(true);
  });

  it("一條魚 150 點,等於站 15 分鐘", () => {
    expect(points(0, 1)).toBe(FISH_POINTS);
    expect(points(0, 1)).toBe(points(15 * 60_000, 0));
    expect(points(0, 2)).toBe(2 * FISH_POINTS);
  });

  it("跟薪水無關 —— 輸入只有毫秒與條數,沒有 Config 可以傳", () => {
    expect(points.length).toBe(2);
  });

  it("負數與 NaN 一律當 0,不讓爛值汙染整條鏈", () => {
    expect(points(-1, 0)).toBe(0);
    expect(points(NaN, 0)).toBe(0);
    expect(points(0, NaN)).toBe(0);
    expect(points(60_000, -5)).toBe(POINTS_PER_MIN);
  });

  it("被老闆扣的從總數扣,扣到 0 為止", () => {
    expect(points(60_000, 1, 32)).toBe(POINTS_PER_MIN + FISH_POINTS - 32);
    expect(points(0, 0, 50)).toBe(0);
    expect(points(60_000, 0, NaN)).toBe(POINTS_PER_MIN);
  });
});
