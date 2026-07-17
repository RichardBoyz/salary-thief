export type Config = {
  monthlySalary: number;
  workdaysPerMonth: number;
  shiftStart: string; // "09:00" —— 直接是 <input type="time"> 的值
  shiftEnd: string; // "18:00"
  lunchStart: string; // "12:00"
  lunchMinutes: number;
};

export type WorkState = "before" | "working" | "lunch" | "after";

const MIN = 60_000;

/**
 * "09:00" + now 所在的那一天 → epoch ms(使用者本地時區)
 *
 * `|| 0` 不只是防呆:localStorage 是使用者可以直接編輯的,爛值進來時
 * 這裡吐一個 NaN 出去會汙染整條計算鏈,畫面上每個數字都變成 NaN。
 */
const at = (now: number, hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
};

/** 兩個區間重疊的毫秒數,不重疊為 0 */
const overlap = (a1: number, a2: number, b1: number, b2: number): number =>
  Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

export type Shift = {
  start: number;
  end: number;
  lunchStart: number;
  lunchEnd: number;
  /** 實際有給薪的毫秒數 = 班表長度 - 落在班表內的午休 */
  paidMs: number;
  dailyPay: number;
};

// ponytail: 不支援跨夜班表(end <= start)。paidMs 會是 0,計數器顯示 0 而不是負數,
// 設定頁也擋掉這種輸入。真的有大夜班使用者再處理跨日,那要改的不只這裡。
export function todayShift(cfg: Config, now: number): Shift {
  const start = at(now, cfg.shiftStart);
  const end = at(now, cfg.shiftEnd);
  const lunchStart = at(now, cfg.lunchStart);
  const lunchEnd = lunchStart + cfg.lunchMinutes * MIN;
  return {
    start,
    end,
    lunchStart,
    lunchEnd,
    paidMs: Math.max(0, end - start - overlap(start, end, lunchStart, lunchEnd)),
    dailyPay: cfg.monthlySalary / Math.max(1, cfg.workdaysPerMonth),
  };
}

/**
 * 今天到 now 為止賺了多少。
 *
 * 關鍵:數字永遠從 now 重新推導,絕不用 setInterval 累加。
 * 分頁切到背景被降頻、電腦睡眠醒來、使用者改系統時間,這個函式都還是對的。
 */
export function earnedToday(cfg: Config, now: number): number {
  const s = todayShift(cfg, now);
  if (s.paidMs <= 0 || now <= s.start) return 0;
  const capped = Math.min(now, s.end);
  const worked =
    capped - s.start - overlap(s.start, capped, s.lunchStart, s.lunchEnd);
  return (worked / s.paidMs) * s.dailyPay;
}

export function workState(cfg: Config, now: number): WorkState {
  const s = todayShift(cfg, now);
  if (now < s.start) return "before";
  if (now >= s.end) return "after";
  if (now >= s.lunchStart && now < s.lunchEnd) return "lunch";
  return "working";
}

/** 你的每秒身價。午休不給薪,所以是用 paidMs 算的 */
export function ratePerSecond(cfg: Config, now: number): number {
  const s = todayShift(cfg, now);
  return s.paidMs <= 0 ? 0 : s.dailyPay / (s.paidMs / 1000);
}

/** 距離下班還有幾毫秒,已下班為 0 */
export function msUntilOffWork(cfg: Config, now: number): number {
  return Math.max(0, todayShift(cfg, now).end - now);
}

/** 今日進度 0~1,給進度條用 */
export function progress(cfg: Config, now: number): number {
  const s = todayShift(cfg, now);
  return s.dailyPay <= 0 ? 0 : earnedToday(cfg, now) / s.dailyPay;
}
