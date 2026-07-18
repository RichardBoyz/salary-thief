// 隊伍資料的純函式層。不 import supabase —— 網路歸 sync.ts,這裡只算數,
// 所以可以直接餵假資料測試。
import { unionMs, weekStart, type SlackEvent } from "./slack";

// 跟 supabase 三張表一一對應(schema.sql),時間都是 epoch ms
export type ProfileRow = {
  user_id: string;
  handle: string;
  /** 匿名邀請碼。公司沒有名字 —— 「不存公司」是隱私硬約束 */
  company_code: string | null;
  /** 隊伍是標籤不是實體。null = 還沒選隊,在大廳 */
  team: string | null;
  last_seen_at: number;
};
export type EventRow = {
  id: string;
  user_id: string;
  started_at: number;
  ended_at: number | null;
};
export type ReactionRow = {
  id: string;
  event_id: string;
  from_user: string;
  emoji: string;
  created_at: number;
};
export type CatchRow = { user_id: string; caught_at: number };

/** 心跳超過這個歲數就當離線。斷線不用通知任何人,老化自然下線 */
export const ONLINE_MS = 2 * 60_000;

export type MemberState = "slacking" | "working" | "offline";

export type Standing = {
  userId: string;
  handle: string;
  team: string | null;
  state: MemberState;
  /** 本週摸魚毫秒(摸魚中的那段算到 now) */
  weekMs: number;
  /** 本週漁獲。唯一伺服器驗證過的數字 —— 時數是自報的,魚是抓的 */
  fishes: number;
  /** 他最近一筆事件,起鬨的目標。沒摸過魚就沒得起鬨 */
  latestEventId: string | null;
};

/**
 * 排行榜。比時數,不比錢 —— 錢要月薪才算得出來,而月薪永遠不上傳。
 * open event(ended_at null)裁到 now,所以摸魚中的人名次會即時爬升。
 */
export function standings(
  members: ProfileRow[],
  events: EventRow[],
  now: number,
  catches: CatchRow[] = [],
): Standing[] {
  const from = weekStart(now);
  const byUser = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = byUser.get(e.user_id) ?? [];
    list.push(e);
    byUser.set(e.user_id, list);
  }
  const fishByUser = new Map<string, number>();
  for (const c of catches) {
    if (c.caught_at >= from) fishByUser.set(c.user_id, (fishByUser.get(c.user_id) ?? 0) + 1);
  }
  return members
    .map((m) => {
      const mine = byUser.get(m.user_id) ?? [];
      const clipped: SlackEvent[] = mine.map((e) => ({
        id: e.id,
        startedAt: e.started_at,
        endedAt: e.ended_at ?? now,
      }));
      const open = mine.some((e) => e.ended_at === null);
      const online = now - m.last_seen_at <= ONLINE_MS;
      const latest = mine.reduce<EventRow | null>(
        (a, b) => (a === null || b.started_at > a.started_at ? b : a),
        null,
      );
      return {
        userId: m.user_id,
        handle: m.handle,
        team: m.team,
        state: (!online ? "offline" : open ? "slacking" : "working") as MemberState,
        // unionMs 不用 totalMs:排行榜跨公司可見,重疊事件求和會被灌水虛報
        weekMs: unionMs(clipped, from, now),
        fishes: fishByUser.get(m.user_id) ?? 0,
        latestEventId: latest?.id ?? null,
      };
    })
    .sort((a, b) => b.weekMs - a.weekMs);
}

/** 本週全公司總偷(毫秒) */
export const teamTotalMs = (rows: Standing[]): number =>
  rows.reduce((sum, r) => sum + r.weekMs, 0);

export type TeamAggregate = {
  /** null = 大廳(還沒選隊的人) */
  team: string | null;
  members: number;
  totalMs: number;
  perCapMs: number;
};

/**
 * 隊伍對抗。事件的隊伍歸屬看「人現在的隊」—— 換組歷史帶著走,事件表上
 * 不存隊伍。排序比人均不比總量,不然大隊躺著贏。
 */
export function teamAggregates(rows: Standing[]): TeamAggregate[] {
  const byTeam = new Map<string | null, Standing[]>();
  for (const r of rows) {
    const list = byTeam.get(r.team) ?? [];
    list.push(r);
    byTeam.set(r.team, list);
  }
  return [...byTeam.entries()]
    .map(([team, list]) => {
      const totalMs = list.reduce((s, r) => s + r.weekMs, 0);
      return { team, members: list.length, totalMs, perCapMs: totalMs / list.length };
    })
    .sort((a, b) => b.perCapMs - a.perCapMs);
}

// schema.sql 的 emoji 白名單是同一份 —— 改這裡要一起改 DB 的 check
export const EMOJIS = ["👍", "🔥", "🐟", "👀", "😂", "🫡"] as const;
