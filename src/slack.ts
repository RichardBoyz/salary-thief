import { overlap, ratePerSecond, type Config } from "./money";

/**
 * 摸魚事件。append-only,id 由 client 端產生。
 *
 * 這不只是懶,是 Phase 3 同步的整個設計:兩台裝置各自新增的事件 id 不會撞,
 * 合併就是聯集。不需要 CRDT、不需要 vector clock、不需要任何合併程式碼。
 */
export type SlackEvent = {
  id: string;
  startedAt: number;
  endedAt: number;
};

/** 進行中的那段(如果有)補成一筆到 now 的事件。Counter/Office/Stats 都要「含當下」的視圖 */
export const withActive = (
  events: SlackEvent[],
  activeSince: number | null,
  now: number,
): SlackEvent[] =>
  activeSince === null
    ? events
    : [...events, { id: "active", startedAt: activeSince, endedAt: now }];

/** 那一天的 00:00(本地時區) */
export const dayStart = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * 加 n 天。用 setDate 而不是 t + n * 86400000 —— 有日光節約時間的時區裡
 * 一天不一定是 24 小時,直接加毫秒會在換日那週整個歪掉。台灣沒有 DST,
 * 但這個版本一樣短,沒有理由選會壞的那個。
 */
export const addDays = (t: number, n: number): number => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

export const dayKey = (t: number): string => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 該週的星期日 00:00 */
export const weekStart = (t: number): number => {
  const d = new Date(dayStart(t));
  return addDays(d.getTime(), -d.getDay());
};

/** [from, to) 內的摸魚總毫秒。跨越邊界的事件會被裁掉,只算落在區間內的部分 */
export const totalMs = (events: SlackEvent[], from: number, to: number): number =>
  events.reduce((sum, e) => sum + overlap(e.startedAt, e.endedAt, from, to), 0);

/**
 * [from, to) 內的摸魚總毫秒,但重疊區間只算一次。
 *
 * totalMs 是純加總,對「自己看自己」夠用;但排行榜是跨公司可見的攻擊面 ——
 * 惡意成員可以塞 100 筆都覆蓋整週的事件,用 sum 就虛報 100 倍。先把區間
 * union 起來再算長度,結構上免疫這種灌水:你不可能同時摸兩次魚,重疊的
 * 部分本來就只該算一次。誠實使用者的事件不重疊,union 的結果跟 sum 一樣。
 */
export const unionMs = (events: SlackEvent[], from: number, to: number): number => {
  const clipped = events
    .map((e) => [Math.max(e.startedAt, from), Math.min(e.endedAt, to)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = 0;
  let curEnd = 0;
  for (const [s, e] of clipped) {
    if (s > curEnd) {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  return total + (curEnd - curStart);
};

/**
 * 每天摸魚幾毫秒。
 *
 * 一個事件會被拆到它實際跨過的每一天 —— 因為忘記按「結束」是這個 app 最
 * 可能發生的事,而一筆從下午三點跑到隔天的事件不能整包算在第一天頭上。
 */
export const msByDay = (events: SlackEvent[]): Map<string, number> => {
  const out = new Map<string, number>();
  for (const e of events) {
    for (let d = dayStart(e.startedAt); d < e.endedAt; d = addDays(d, 1)) {
      const ms = overlap(e.startedAt, e.endedAt, d, addDays(d, 1));
      if (ms > 0) out.set(dayKey(d), (out.get(dayKey(d)) ?? 0) + ms);
    }
  }
  return out;
};

/** 摸魚偷到的錢 = 摸魚時數 × 時薪。這個 app 的中心思想 */
export const stolenMoney = (
  events: SlackEvent[],
  cfg: Config,
  from: number,
  to: number,
): number => (totalMs(events, from, to) / 1000) * ratePerSecond(cfg, to);

/** 最長的一次摸魚 */
export const longestMs = (events: SlackEvent[]): number =>
  events.reduce((max, e) => Math.max(max, e.endedAt - e.startedAt), 0);
