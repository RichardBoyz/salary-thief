/**
 * 班表與摸魚幣。
 *
 * v8 之後這個檔案裡沒有薪水了 —— 月薪、日薪、時薪、每秒身價全部刪掉,app
 * 從此不知道你賺多少。剩下的兩件事:班表(狀態、進度、距離下班)與摸魚幣。
 * 檔名維持 money.ts,只是為了不讓 6 個 import 跟著改名失去 git 連續性。
 */
export type Config = {
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

/** 兩個區間重疊的毫秒數,不重疊為 0。slack.ts 也用同一個,別再寫第二份 */
export const overlap = (a1: number, a2: number, b1: number, b2: number): number =>
  Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

export type Shift = {
  start: number;
  end: number;
  lunchStart: number;
  lunchEnd: number;
  /** 實際有給薪的毫秒數 = 班表長度 - 落在班表內的午休 */
  paidMs: number;
};

// ponytail: 不支援跨夜班表(end <= start)。paidMs 會是 0,進度顯示 0 而不是負數,
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
  };
}

/**
 * 今天上班上到哪了,0~1。
 *
 * 關鍵沒變:數字永遠從 now 重新推導,絕不用 setInterval 累加。分頁切到背景
 * 被降頻、電腦睡眠醒來、使用者改系統時間,這個函式都還是對的。
 * (v8 前這裡是 earnedToday/dailyPay —— 分母消失之後,分子自己就是進度。)
 */
export function progress(cfg: Config, now: number): number {
  const s = todayShift(cfg, now);
  if (s.paidMs <= 0 || now <= s.start) return 0;
  const capped = Math.min(now, s.end);
  const worked =
    capped - s.start - overlap(s.start, capped, s.lunchStart, s.lunchEnd);
  return worked / s.paidMs;
}

export function workState(cfg: Config, now: number): WorkState {
  const s = todayShift(cfg, now);
  if (now < s.start) return "before";
  if (now >= s.end) return "after";
  if (now >= s.lunchStart && now < s.lunchEnd) return "lunch";
  return "working";
}

/** 距離下班還有幾毫秒,已下班為 0 */
export function msUntilOffWork(cfg: Config, now: number): number {
  return Math.max(0, todayShift(cfg, now).end - now);
}

/** 站外快區一分鐘給幾點。10 點/分 = 1 點/6 秒,所以數字六秒跳一次,不會呆著不動 */
export const POINTS_PER_MIN = 10;
/** 一條魚 150 點 = 站 15 分鐘,沿用 v7 訂下的等價關係。魚是伺服器擔保的,給大方一點 */
export const FISH_POINTS = 150;

/** 爛值(NaN / 負數 / localStorage 被亂改)一律當 0,不讓它汙染整條鏈 */
const safe = (v: number): number => (Number.isFinite(v) ? Math.max(0, v) : 0);

/**
 * 摸魚幣:錢只來自外快區站立 + 漁獲,按鈕計時不生幣(v7 拍板,v8 換成點數)。
 *
 * 跟薪水完全脫鉤 —— 這正是它能上 DB 的原因:點數不含任何薪資資訊,存進
 * 資料庫也反推不出任何人賺多少。輸入是毫秒與條數,永遠是整數。
 * fined = 今天被老闆扣掉的(伺服器算好的點數),扣到 0 為止。
 */
export const points = (zoneMs: number, fishes: number, fined = 0): number =>
  Math.max(
    0,
    Math.floor(safe(zoneMs) / (MIN / POINTS_PER_MIN)) + safe(fishes) * FISH_POINTS - safe(fined),
  );
