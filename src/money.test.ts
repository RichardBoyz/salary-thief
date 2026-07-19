import { describe, expect, it } from "vitest";
import {
  type Config,
  earnedToday,
  FISH_BONUS_MS,
  gameMoney,
  msUntilOffWork,
  ratePerSecond,
  todayShift,
  workState,
} from "./money";

// 月薪 44000 / 22 天 = 日薪 2000。班表 9 小時扣午休 1 小時 = 給薪 8 小時 → 時薪 250。
const cfg: Config = {
  monthlySalary: 44000,
  workdaysPerMonth: 22,
  shiftStart: "09:00",
  shiftEnd: "18:00",
  lunchStart: "12:00",
  lunchMinutes: 60,
};

/** 本地時區的當天某時刻 */
const t = (hhmm: string) => new Date(`2026-07-17T${hhmm}:00`).getTime();

describe("earnedToday", () => {
  it.each([
    ["上班前一小時", "08:00", 0],
    ["剛好上班", "09:00", 0],
    ["上班一小時", "10:00", 250],
    ["午休開始", "12:00", 750],
    ["午休中不跳錶", "12:30", 750],
    ["午休結束那一刻", "13:00", 750],
    ["午休後又開始跳", "14:00", 1000],
    ["剛好下班", "18:00", 2000],
    ["下班後不再累加", "23:00", 2000],
  ])("%s (%s) → %d", (_label, time, expected) => {
    expect(earnedToday(cfg, t(time))).toBeCloseTo(expected, 6);
  });

  it("整個班表結束後剛好等於日薪,一塊錢都不差", () => {
    expect(earnedToday(cfg, t("18:00"))).toBe(2000);
  });

  it("是 now 的純函式 —— 同樣時刻算幾次都一樣(這就是不用 setInterval 累加的理由)", () => {
    const at1430 = t("14:30");
    const results = Array.from({ length: 100 }, () => earnedToday(cfg, at1430));
    expect(new Set(results).size).toBe(1);
  });

  it("單調遞增,不會因為取樣間隔不同而算出不同總額", () => {
    // 模擬分頁被降頻:每 5 分鐘才取樣一次,結果必須跟每秒取樣的終點一致
    const coarse = earnedToday(cfg, t("18:00"));
    let fine = 0;
    for (let ms = t("09:00"); ms <= t("18:00"); ms += 60_000) {
      const v = earnedToday(cfg, ms);
      expect(v).toBeGreaterThanOrEqual(fine);
      fine = v;
    }
    expect(fine).toBeCloseTo(coarse, 6);
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

describe("衍生數值", () => {
  it("每秒身價是用給薪時數算的,不含午休", () => {
    expect(ratePerSecond(cfg, t("10:00"))).toBeCloseTo(2000 / (8 * 3600), 9);
  });

  it("距離下班", () => {
    expect(msUntilOffWork(cfg, t("17:00"))).toBe(3600_000);
    expect(msUntilOffWork(cfg, t("19:00"))).toBe(0);
  });
});

describe("爛輸入不能算出 NaN 或負數", () => {
  const bad = (patch: Partial<Config>) => ({ ...cfg, ...patch });

  it("上班天數 0 不會變成 Infinity", () => {
    const v = earnedToday(bad({ workdaysPerMonth: 0 }), t("14:00"));
    expect(Number.isFinite(v)).toBe(true);
  });

  it("下班時間早於上班時間 → 0,不是負數", () => {
    const v = earnedToday(bad({ shiftStart: "18:00", shiftEnd: "09:00" }), t("14:00"));
    expect(v).toBe(0);
  });

  it("午休吃掉整個班表 → 0,不是 NaN", () => {
    const v = earnedToday(bad({ lunchStart: "09:00", lunchMinutes: 24 * 60 }), t("14:00"));
    expect(v).toBe(0);
    expect(v).not.toBeNaN();
  });

  it("午休只吃掉班表的後半段 → 只有前半段有給薪,而且賺滿就封頂", () => {
    // 午休 12:00 開始、長達 24 小時 → 只有 09:00~12:00 這 3 小時有給薪。
    // 所以 12:00 就已經賺滿日薪,之後不再增加。這是對的,不是 bug。
    const swallowed = bad({ lunchMinutes: 24 * 60 });
    expect(todayShift(swallowed, t("14:00")).paidMs).toBe(3 * 3600_000);
    expect(earnedToday(swallowed, t("12:00"))).toBe(2000);
    expect(earnedToday(swallowed, t("14:00"))).toBe(2000);
  });

  it("午休完全落在班表外時不扣給薪時數", () => {
    const nightLunch = bad({ lunchStart: "03:00", lunchMinutes: 60 });
    expect(todayShift(nightLunch, t("14:00")).paidMs).toBe(9 * 3600_000);
  });

  it("月薪 0 就是 0", () => {
    expect(earnedToday(bad({ monthlySalary: 0 }), t("14:00"))).toBe(0);
  });

  it("localStorage 被亂改成空字串時不能吐 NaN", () => {
    const junk = bad({ shiftStart: "", shiftEnd: "", lunchStart: "" });
    expect(earnedToday(junk, t("14:00"))).not.toBeNaN();
    expect(ratePerSecond(junk, t("14:00"))).not.toBeNaN();
    expect(msUntilOffWork(junk, t("14:00"))).not.toBeNaN();
  });
});

describe("gameMoney(遊戲化的今天偷到)", () => {
  const cfg: Config = {
    monthlySalary: 66_000,
    workdaysPerMonth: 22,
    shiftStart: "09:00",
    shiftEnd: "18:00",
    lunchStart: "12:00",
    lunchMinutes: 60,
  };
  const noon = new Date("2026-07-20T14:00:00").getTime();
  // 日薪 3000、實付 8 小時 → 每秒 3000/28800
  const rate = 3000 / 28_800;

  it("沒站沒魚就是 0 —— 按鈕計時不生錢", () => {
    expect(gameMoney(0, 0, cfg, noon)).toBe(0);
  });

  it("站一小時 = 3600 秒 × 時薪", () => {
    expect(gameMoney(3_600_000, 0, cfg, noon)).toBeCloseTo(3600 * rate, 6);
  });

  it("一條魚 = 15 分鐘時薪,跟站 15 分鐘等值", () => {
    expect(gameMoney(0, 1, cfg, noon)).toBeCloseTo(gameMoney(FISH_BONUS_MS, 0, cfg, noon), 9);
    expect(gameMoney(0, 2, cfg, noon)).toBeCloseTo(2 * 900 * rate, 6);
  });
});
