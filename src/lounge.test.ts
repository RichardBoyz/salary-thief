import { describe, expect, it } from "vitest";
import {
  apply,
  displayNames,
  EMPTY,
  errorKind,
  fromSnapshot,
  MOVE_EVERY_MS,
  parseEvent,
  reconcile,
  safeText,
  shouldSend,
  supersedes,
  type LoungeState,
  type Member,
} from "./lounge";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = uid(1);
const B = uid(2);
const joinA = { uid: A, sid: "aaaa1111", handle: "阿明", avatar: "253712", x: 12, y: 8, dir: "down" };
const me = { uid: A, sid: "aaaa1111" };

describe("parseEvent(廣播再驗一次)", () => {
  it("合法的 join / move / say / emote / leave 都解得出來", () => {
    expect(parseEvent("join", joinA)).toMatchObject({ type: "join", member: { uid: A, handle: "阿明" } });
    expect(parseEvent("move", { uid: A, x: 3.5, y: 4.2, dir: "left" })).toEqual({
      type: "move", uid: A, x: 3.5, y: 4.2, dir: "left",
    });
    expect(parseEvent("say", { id: uid(9), uid: A, handle: "阿明", body: "嗨", at: 1 })).toMatchObject({
      type: "say", line: { body: "嗨" },
    });
    expect(parseEvent("emote", { uid: A, emoji: "🔥" })).toEqual({ type: "emote", uid: A, emoji: "🔥" });
    expect(parseEvent("leave", { uid: A })).toEqual({ type: "leave", uid: A });
  });

  it("格式不對一律丟掉:座標出界、NaN、方向亂填、uid 不是 uuid、未知事件", () => {
    expect(parseEvent("move", { uid: A, x: 0.5, y: 4, dir: "up" })).toBeNull();
    expect(parseEvent("move", { uid: A, x: Number.NaN, y: 4, dir: "up" })).toBeNull();
    expect(parseEvent("move", { uid: A, x: 30, y: 4, dir: "up" })).toBeNull();
    expect(parseEvent("move", { uid: A, x: 3, y: 4, dir: "sideways" })).toBeNull();
    expect(parseEvent("move", { uid: "admin", x: 3, y: 4, dir: "up" })).toBeNull();
    expect(parseEvent("move", "x")).toBeNull();
    expect(parseEvent("hack", { uid: A })).toBeNull();
  });

  it("表情只認白名單,聊天超過 100 字不收", () => {
    expect(parseEvent("emote", { uid: A, emoji: "<img src=x>" })).toBeNull();
    expect(parseEvent("say", { id: uid(9), uid: A, handle: "x", body: "字".repeat(101), at: 1 })).toBeNull();
  });

  it("暱稱裡的雙向覆寫、零寬字元會被剝掉", () => {
    const ev = parseEvent("join", { ...joinA, handle: "阿‮明​" });
    expect(ev?.type === "join" && ev.member.handle).toBe("阿明");
  });
});

describe("apply", () => {
  it("join 進名單、move 更新位置、leave 移出", () => {
    let s: LoungeState = EMPTY;
    s = apply(s, parseEvent("join", joinA)!);
    s = apply(s, parseEvent("move", { uid: A, x: 5, y: 5, dir: "up" })!);
    expect(s.members[A]).toMatchObject({ x: 5, y: 5, dir: "up" });
    s = apply(s, parseEvent("leave", { uid: A })!);
    expect(s.members[A]).toBeUndefined();
  });

  it("同一個帳號從別的分頁進門(同 uid、不同 sid)→ 這個分頁被取代", () => {
    expect(supersedes(parseEvent("join", joinA)!, me)).toBe(false);
    expect(supersedes(parseEvent("join", { ...joinA, sid: "bbbb2222" })!, me)).toBe(true);
    expect(supersedes(parseEvent("join", { ...joinA, uid: B, sid: "bbbb2222" })!, me)).toBe(false);
  });

  it("還沒對帳到的人的 move 先忽略(連名字都還不知道)", () => {
    const s = apply(EMPTY, parseEvent("move", { uid: B, x: 5, y: 5, dir: "up" })!);
    expect(s.members[B]).toBeUndefined();
  });

  it("同一則聊天(同 id)只收一次", () => {
    const say = parseEvent("say", { id: uid(9), uid: A, handle: "阿明", body: "嗨", at: 1 })!;
    let s = apply(EMPTY, say);
    s = apply(s, say);
    expect(s.chat).toHaveLength(1);
  });
});

describe("對帳", () => {
  it("快照的壞列個別丟掉,不影響其他人", () => {
    const s = fromSnapshot({
      members: [joinA, { ...joinA, uid: "bad" }, { ...joinA, uid: B, x: -5 }],
      chat: [{ id: uid(9), uid: A, handle: "阿明", body: "嗨", at: 1 }, { id: "x" }],
    });
    expect(Object.keys(s.members)).toEqual([A]);
    expect(s.chat).toHaveLength(1);
  });

  it("名單以伺服器為準,聊天合併(對帳之間收到的那幾則不會被洗掉)", () => {
    const local: LoungeState = {
      members: { [B]: { ...(joinA as Member), uid: B } },
      chat: [{ id: uid(8), uid: B, handle: "小華", body: "剛剛那句", at: 5 }],
    };
    const snap = fromSnapshot({
      members: [joinA],
      chat: [{ id: uid(9), uid: A, handle: "阿明", body: "比較早", at: 1 }],
    });
    const s = reconcile(local, snap);
    expect(Object.keys(s.members)).toEqual([A]);
    expect(s.chat.map((c) => c.body)).toEqual(["比較早", "剛剛那句"]);
  });
});

describe("displayNames", () => {
  it("同名的人加 uid 末四碼,不同名照舊 —— 冒用同事暱稱也分得出來", () => {
    const m = (id: string, handle: string) => ({ ...(joinA as Member), uid: id, handle });
    const names = displayNames([m(uid(0xa1), "小明"), m(uid(0xb2), "小明"), m(uid(3), "阿華")]);
    expect(names).toEqual({ [uid(0xa1)]: "小明#0161", [uid(0xb2)]: "小明#0178", [uid(3)]: "阿華" });
  });
});

describe("shouldSend(走位節流)", () => {
  it("第一次一定送;停下來且有移動就送;沒動不送", () => {
    expect(shouldSend(null, 0, 1, 1, false)).toBe(true);
    const last = { at: 0, x: 5, y: 5 };
    expect(shouldSend(last, 1000, 6, 5, true)).toBe(true);
    expect(shouldSend(last, 1000, 5, 5, true)).toBe(false);
  });

  it("走路中每 2 秒才送一次,兩次之間至少隔 400ms", () => {
    const last = { at: 0, x: 5, y: 5 };
    expect(shouldSend(last, 1500, 9, 5, false)).toBe(false);
    expect(shouldSend(last, MOVE_EVERY_MS, 9, 5, false)).toBe(true);
    expect(shouldSend(last, 300, 9, 5, true)).toBe(false);
  });

  it("連續走 10 秒,送出的次數 ≈ 5 次(不是每一幀)", () => {
    let last: { at: number; x: number; y: number } | null = null;
    let sent = 0;
    for (let t = 0; t <= 10_000; t += 16) {
      const x = 2 + t / 1000;
      if (shouldSend(last, t, x, 5, false)) {
        sent++;
        last = { at: t, x, y: 5 };
      }
    }
    expect(sent).toBeLessThanOrEqual(6);
  });
});

describe("safeText / errorKind", () => {
  it("剝掉控制字元與雙向覆寫,一般文字不動", () => {
    expect(safeText("a\u0007b‮c‍d")).toBe("abcd");
    expect(safeText("午餐吃什麼 🍱")).toBe("午餐吃什麼 🍱");
  });

  it("伺服器錯誤對得到畫面文案;沒跑遷移(找不到函式)= 還沒開放", () => {
    expect(errorKind("lounge full")).toBe("full");
    expect(errorKind("session replaced")).toBe("replaced");
    expect(errorKind("Could not find the function public.lounge_join(p_x, p_y)")).toBe("notReady");
    expect(errorKind("something else")).toBeNull();
  });
});
