import { describe, expect, it } from "vitest";
import {
  ONLINE_MS,
  standings,
  teamTotalMs,
  type EventRow,
  type ProfileRow,
} from "./team";

const MIN = 60_000;
// 2026-07-17 是星期五,本週從 07-12(日)開始
const now = new Date("2026-07-17T15:00:00").getTime();

const member = (id: string, handle: string, seenAgo = 0): ProfileRow => ({
  user_id: id,
  handle,
  team_code: "team-1",
  last_seen_at: now - seenAgo,
});

const ev = (
  user: string,
  startAgoMin: number,
  lenMin: number | null,
): EventRow => ({
  id: crypto.randomUUID(),
  user_id: user,
  started_at: now - startAgoMin * MIN,
  ended_at: lenMin === null ? null : now - startAgoMin * MIN + lenMin * MIN,
});

describe("standings", () => {
  it("依本週摸魚時數排序,摸最多的在最上面", () => {
    const rows = standings(
      [member("a", "阿明"), member("b", "小華")],
      [ev("a", 200, 30), ev("b", 200, 90)],
      now,
    );
    expect(rows.map((r) => r.handle)).toEqual(["小華", "阿明"]);
    expect(rows[0].weekMs).toBe(90 * MIN);
  });

  it("摸魚中的 open event 裁到 now 計入 —— 名次會即時爬升", () => {
    const rows = standings([member("a", "阿明")], [ev("a", 45, null)], now);
    expect(rows[0].weekMs).toBe(45 * MIN);
    expect(rows[0].state).toBe("slacking");
  });

  it("上週的事件不計入本週榜", () => {
    const lastWeek = ev("a", 0, 60);
    lastWeek.started_at = new Date("2026-07-10T10:00:00").getTime(); // 上週五
    lastWeek.ended_at = lastWeek.started_at + 60 * MIN;
    const rows = standings([member("a", "阿明")], [lastWeek], now);
    expect(rows[0].weekMs).toBe(0);
  });

  it("跨週界的事件只算本週那半", () => {
    // 週日 00:00 的前後各 30 分
    const weekEdge = new Date("2026-07-12T00:00:00").getTime();
    const spanning: EventRow = {
      id: "x",
      user_id: "a",
      started_at: weekEdge - 30 * MIN,
      ended_at: weekEdge + 30 * MIN,
    };
    const rows = standings([member("a", "阿明")], [spanning], now);
    expect(rows[0].weekMs).toBe(30 * MIN);
  });

  it("心跳老掉 = 離線,即使有 open event 也不算摸魚中", () => {
    const rows = standings(
      [member("a", "阿明", ONLINE_MS + 1)],
      [ev("a", 30, null)],
      now,
    );
    expect(rows[0].state).toBe("offline");
  });

  it("在線但沒有 open event = 上班中", () => {
    const rows = standings([member("a", "阿明")], [ev("a", 60, 10)], now);
    expect(rows[0].state).toBe("working");
  });

  it("latestEventId 是最近開始的那筆,沒事件就是 null", () => {
    const older = ev("a", 100, 10);
    const newer = ev("a", 20, 5);
    const rows = standings([member("a", "阿明"), member("b", "小華")], [older, newer], now);
    expect(rows.find((r) => r.userId === "a")!.latestEventId).toBe(newer.id);
    expect(rows.find((r) => r.userId === "b")!.latestEventId).toBeNull();
  });
});

describe("teamTotalMs", () => {
  it("全隊加總", () => {
    const rows = standings(
      [member("a", "阿明"), member("b", "小華")],
      [ev("a", 200, 30), ev("b", 200, 60)],
      now,
    );
    expect(teamTotalMs(rows)).toBe(90 * MIN);
  });
});
