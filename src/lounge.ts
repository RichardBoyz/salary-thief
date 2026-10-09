// 即時房間(休息室、辦公室)的純邏輯層:廣播解析、狀態更新、走位節流。不碰網路
// (那在 sync.ts),所以可以直接餵假資料測試。
//
// 安全的主體在 DB(migrate-v15-lounge.sql、migrate-v16-rooms.sql):身分蓋章、限速、
// 內容檢查都在那裡。這裡再驗一次格式是縱深防禦 —— 萬一哪天 DB 那層漏了,畫面也不會
// 被灌進怪東西。
import { EMOJIS } from "./team";

/** 休息室(同公司共用)或自己隊的辦公室。一個人同時只在一間 */
export type RoomKind = "lounge" | "office";

/** 跟 migrate-v16 的 lounge_pos_ok 同一個範圍:休息室 26×11、辦公室 20×12,牆內才算 */
export const BOUNDS: Record<RoomKind, { minX: number; maxX: number; minY: number; maxY: number }> = {
  lounge: { minX: 1, maxX: 25, minY: 1, maxY: 10 },
  office: { minX: 1, maxX: 19, minY: 1, maxY: 11 },
};

export type Facing = "down" | "up" | "left" | "right";
const FACINGS: Facing[] = ["down", "up", "left", "right"];

export type Member = {
  uid: string;
  sid: string;
  handle: string;
  avatar: string | null;
  x: number;
  y: number;
  dir: Facing;
};

export type ChatLine = { id: string; uid: string; handle: string; body: string; at: number };

export type LoungeEvent =
  | { type: "join"; member: Member }
  | { type: "leave"; uid: string }
  | { type: "move"; uid: string; x: number; y: number; dir: Facing }
  | { type: "say"; line: ChatLine }
  | { type: "emote"; uid: string; emoji: string };

export type LoungeState = {
  members: Record<string, Member>;
  chat: ChatLine[];
};

export const EMPTY: LoungeState = { members: {}, chat: [] };

/** 畫面上最多留幾則聊天。DB 對帳也只給 50 則 */
const CHAT_KEEP = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const inBounds = (kind: RoomKind, x: unknown, y: unknown): boolean =>
  typeof x === "number" &&
  typeof y === "number" &&
  x >= BOUNDS[kind].minX &&
  x < BOUNDS[kind].maxX &&
  y >= BOUNDS[kind].minY &&
  y < BOUNDS[kind].maxY;

/**
 * 腳底座標夾進房間範圍。走進門(下牆那一格)的那一刻位置會出界,伺服器不收 ——
 * 夾回門口送出去,別人才會看到你走到門口才消失,不是在半路蒸發。
 */
export function clampToRoom(kind: RoomKind, x: number, y: number): { x: number; y: number } {
  const b = BOUNDS[kind];
  const EDGE = 1e-3; // 上界是開區間
  return {
    x: Math.min(Math.max(x, b.minX), b.maxX - EDGE),
    y: Math.min(Math.max(y, b.minY), b.maxY - EDGE),
  };
}
const isFacing = (v: unknown): v is Facing => FACINGS.includes(v as Facing);

/**
 * 看不見但會作怪的字元:控制字元、零寬字元、雙向覆寫(RLO 能把字倒過來顯示)。
 * 聊天內容 DB 已經剝過;暱稱是舊資料、沒剝過,顯示前在這裡剝。
 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g;
export const safeText = (s: string): string => s.replace(INVISIBLE, "");

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? safeText(v) : null;

function member(kind: RoomKind, p: Record<string, unknown>): Member | null {
  const handle = text(p.handle, 20);
  const avatar = p.avatar === null || p.avatar === undefined ? null : text(p.avatar, 6);
  if (!isUuid(p.uid) || typeof p.sid !== "string" || !handle || !inBounds(kind, p.x, p.y) || !isFacing(p.dir))
    return null;
  return { uid: p.uid, sid: p.sid, handle, avatar, x: p.x as number, y: p.y as number, dir: p.dir };
}

function chatLine(p: Record<string, unknown>): ChatLine | null {
  const handle = text(p.handle, 20);
  const body = text(p.body, 100);
  if (!isUuid(p.id) || !isUuid(p.uid) || !handle || !body || typeof p.at !== "number") return null;
  return { id: p.id, uid: p.uid, handle, body, at: p.at };
}

/** 廣播 → 事件。格式不對一律丟掉(null),不嘗試修補。座標範圍看是哪一間 */
export function parseEvent(kind: RoomKind, event: string, payload: unknown): LoungeEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  switch (event) {
    case "join": {
      const m = member(kind, p);
      return m && { type: "join", member: m };
    }
    case "leave":
      return isUuid(p.uid) ? { type: "leave", uid: p.uid } : null;
    case "move":
      return isUuid(p.uid) && inBounds(kind, p.x, p.y) && isFacing(p.dir)
        ? { type: "move", uid: p.uid, x: p.x as number, y: p.y as number, dir: p.dir }
        : null;
    case "say": {
      const c = chatLine(p);
      return c && { type: "say", line: c };
    }
    case "emote":
      return isUuid(p.uid) && (EMOJIS as readonly unknown[]).includes(p.emoji)
        ? { type: "emote", uid: p.uid, emoji: p.emoji as string }
        : null;
    default:
      return null;
  }
}

/** lounge_snapshot() 的回傳 → 狀態。壞掉的列個別丟掉,不影響其他人 */
export function fromSnapshot(kind: RoomKind, snap: unknown): LoungeState {
  const s = (snap ?? {}) as { members?: unknown; chat?: unknown };
  const members: Record<string, Member> = {};
  for (const raw of Array.isArray(s.members) ? s.members : []) {
    const m = typeof raw === "object" && raw ? member(kind, raw as Record<string, unknown>) : null;
    if (m) members[m.uid] = m;
  }
  const chat = (Array.isArray(s.chat) ? s.chat : [])
    .map((raw) => (typeof raw === "object" && raw ? chatLine(raw as Record<string, unknown>) : null))
    .filter((c): c is ChatLine => c !== null);
  return { members, chat };
}

/**
 * 有人用「我的帳號」從別的分頁進門了(同一個 uid、不同的 sid)—— 這個分頁該停下來,
 * 不然兩個分頁會搶同一個人影。DB 那邊舊分頁的 session 也已經作廢了。
 */
export const supersedes = (ev: LoungeEvent, me: { uid: string; sid: string }): boolean =>
  ev.type === "join" && ev.member.uid === me.uid && ev.member.sid !== me.sid;

/** 套用一個事件 */
export function apply(s: LoungeState, ev: LoungeEvent): LoungeState {
  switch (ev.type) {
    case "join":
      return { ...s, members: { ...s.members, [ev.member.uid]: ev.member } };
    case "leave": {
      const members = { ...s.members };
      delete members[ev.uid];
      return { ...s, members };
    }
    case "move": {
      const m = s.members[ev.uid];
      // 還沒對帳到的人先忽略,下一次對帳會把他帶進來(連名字都還不知道)
      if (!m) return s;
      return { ...s, members: { ...s.members, [ev.uid]: { ...m, x: ev.x, y: ev.y, dir: ev.dir } } };
    }
    case "say":
      if (s.chat.some((c) => c.id === ev.line.id)) return s;
      return { ...s, chat: [...s.chat, ev.line].slice(-CHAT_KEEP) };
    case "emote":
      return s; // 表情不進狀態,畫面自己顯示幾秒
  }
}

/**
 * 對帳:伺服器的名單為準(誰在、在哪),聊天則合併 —— 對帳之間收到的廣播不能
 * 因為快照稍早就被洗掉。
 */
export function reconcile(s: LoungeState, snap: LoungeState): LoungeState {
  const seen = new Set(snap.chat.map((c) => c.id));
  const chat = [...snap.chat, ...s.chat.filter((c) => !seen.has(c.id))]
    .sort((a, b) => a.at - b.at)
    .slice(-CHAT_KEEP);
  return { members: snap.members, chat };
}

/**
 * 同名的人加上 uid 末四碼,其他人照舊。暱稱不唯一 —— 有人把自己取成跟同事一樣
 * 的名字時,至少看得出是兩個不同的人。(v4 uuid 末段是隨機的;前段在測試資料
 * 裡常常一樣,取末段比較不會撞)
 */
export function displayNames(members: Member[]): Record<string, string> {
  const count = new Map<string, number>();
  for (const m of members) count.set(m.handle, (count.get(m.handle) ?? 0) + 1);
  return Object.fromEntries(
    members.map((m) => [m.uid, count.get(m.handle)! > 1 ? `${m.handle}#${m.uid.slice(-4)}` : m.handle]),
  );
}

/** 走路中多久送一次位置。停下時一定送(位置有變的話) */
export const MOVE_EVERY_MS = 2000;
/** 兩次送出至少隔多久 —— DB 擋 250ms,留餘裕 */
const MOVE_GAP_MS = 400;

/**
 * 這一幀要不要把位置送出去。送得越少,每秒預算越撐得住更多人;
 * 對方那邊會用尋路把人「走」過去,所以兩點之間不需要每一步都送。
 */
export function shouldSend(
  last: { at: number; x: number; y: number } | null,
  now: number,
  x: number,
  y: number,
  stopped: boolean,
): boolean {
  if (!last) return true;
  if (now - last.at < MOVE_GAP_MS) return false;
  const moved = Math.hypot(x - last.x, y - last.y) > 0.05;
  if (stopped) return moved;
  return moved && now - last.at >= MOVE_EVERY_MS;
}

/** 伺服器錯誤訊息 → 畫面上要用的 key。對不到的照實顯示 */
export type LoungeError =
  | "full"
  | "replaced"
  | "notReady"
  | "needCompany"
  | "busy"
  | "tooFast"
  | "duplicate"
  | "dailyLimit"
  | "tooLong"
  | "muted"
  | "tooNew"
  | "gone";

export function errorKind(msg: string): LoungeError | null {
  if (msg.includes("lounge full")) return "full";
  if (msg.includes("session replaced")) return "replaced";
  if (msg.includes("not in lounge")) return "gone";
  if (msg.includes("no company")) return "needCompany";
  if (msg.includes("lounge busy")) return "busy";
  if (msg.includes("too fast")) return "tooFast";
  if (msg.includes("duplicate")) return "duplicate";
  if (msg.includes("daily limit")) return "dailyLimit";
  if (msg.includes("too long")) return "tooLong";
  if (msg.includes("muted")) return "muted";
  if (msg.includes("account too new")) return "tooNew";
  // 沒跑 v15 遷移:PostgREST 說找不到函式
  if (msg.includes("Could not find the function") || msg.includes("lounge_")) return "notReady";
  return null;
}
