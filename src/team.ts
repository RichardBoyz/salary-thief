// 隊伍資料的純函式層。不 import supabase —— 網路歸 sync.ts,這裡只算數,
// 所以可以直接餵假資料測試。
import { totalMs, weekStart, type SlackEvent } from "./slack";

// 跟 supabase 三張表一一對應(schema.sql),時間都是 epoch ms
export type ProfileRow = {
  user_id: string;
  handle: string;
  team_code: string | null;
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

/** 心跳超過這個歲數就當離線。斷線不用通知任何人,老化自然下線 */
export const ONLINE_MS = 2 * 60_000;

export type MemberState = "slacking" | "working" | "offline";

export type Standing = {
  userId: string;
  handle: string;
  state: MemberState;
  /** 本週摸魚毫秒(摸魚中的那段算到 now) */
  weekMs: number;
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
): Standing[] {
  const from = weekStart(now);
  const byUser = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = byUser.get(e.user_id) ?? [];
    list.push(e);
    byUser.set(e.user_id, list);
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
        state: (!online ? "offline" : open ? "slacking" : "working") as MemberState,
        weekMs: totalMs(clipped, from, now),
        latestEventId: latest?.id ?? null,
      };
    })
    .sort((a, b) => b.weekMs - a.weekMs);
}

/** 本週全隊總偷(毫秒) */
export const teamTotalMs = (rows: Standing[]): number =>
  rows.reduce((sum, r) => sum + r.weekMs, 0);

// schema.sql 的 emoji 白名單是同一份 —— 改這裡要一起改 DB 的 check
export const EMOJIS = ["👍", "🔥", "🐟", "👀", "😂", "🫡"] as const;
