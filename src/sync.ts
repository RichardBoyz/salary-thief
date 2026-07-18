// 網路層。原則:server 掛了 app 照常動 —— 每個寫入都是 fire-and-forget,
// 失敗只 console.warn,本地 localStorage 永遠是你自己資料的真相來源。
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { weekStart } from "./slack";
import { useStore } from "./store";
import { sb } from "./supabase";
import {
  standings,
  teamTotalMs,
  type EventRow,
  type ProfileRow,
  type ReactionRow,
  type Standing,
} from "./team";

const warn = (label: string) => (e: unknown) => console.warn(`[sync] ${label}`, e);

/** main.tsx 呼叫一次。全部自我防衛:沒登入時每個動作都是 no-op */
export function initSync() {
  watchStore();
  startHeartbeat();
  sb.auth.onAuthStateChange((ev) => {
    // 開頁有舊 session 或剛登入 → 把本地事件推上去。upsert 冪等,多推無害
    if (ev === "INITIAL_SESSION" || ev === "SIGNED_IN") pushLocalEvents();
  });
}

// ---------- session ----------

export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

export const sendMagicLink = (email: string) =>
  sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });

// select_account 強制跳 Google 的帳號選擇畫面 —— 不然公司電腦上一鍵就
// 順手登成 Workspace 帳號,違反「不用公司信箱」的隱私原則
export const signInWithGoogle = () =>
  sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: "select_account" },
    },
  });

export const signOut = () => sb.auth.signOut();

// ---------- profile ----------

export async function fetchMyProfile(): Promise<ProfileRow | null> {
  const uid = (await sb.auth.getSession()).data.session?.user.id;
  if (!uid) return null;
  const { data } = await sb.from("profiles").select("*").eq("user_id", uid).maybeSingle();
  return data;
}

export async function saveProfile(
  handle: string,
  companyCode: string | null,
  team: string | null,
) {
  const uid = (await sb.auth.getSession()).data.session?.user.id;
  if (!uid) return;
  await sb.from("profiles").upsert({
    user_id: uid,
    handle,
    company_code: companyCode,
    team,
    last_seen_at: Date.now(),
  });
  // 入司時把歷史事件補上公司碼,不然加入前偷的時數不會出現在榜上。
  // 隊伍不用補 —— 事件表不存隊,歸屬看人現在的隊(換組歷史帶著走)
  if (companyCode) {
    await sb
      .from("slack_events")
      .update({ company_code: companyCode })
      .eq("user_id", uid)
      .then(({ error }) => error && warn("backfill")(error));
  }
  pushLocalEvents();
}

// ---------- 事件上傳(單寫者:每一列只有這台裝置會寫) ----------

const DAYS_30 = 30 * 86_400_000;

/** 把本地事件(近 30 天)推上去。merge upsert:local 是單寫者的真相,直接蓋 */
export async function pushLocalEvents() {
  const session = (await sb.auth.getSession()).data.session;
  if (!session) return;
  const profile = await fetchMyProfile();
  const s = useStore.getState();
  const cutoff = Date.now() - DAYS_30;
  const rows = s.slackEvents
    .filter((e) => e.endedAt >= cutoff)
    .map((e) => ({
      id: e.id,
      user_id: session.user.id,
      company_code: profile?.company_code ?? null,
      started_at: e.startedAt,
      ended_at: e.endedAt,
    }));
  if (s.activeId && s.activeSince !== null) {
    rows.push({
      id: s.activeId,
      user_id: session.user.id,
      company_code: profile?.company_code ?? null,
      started_at: s.activeSince,
      ended_at: null as unknown as number,
    });
  }
  if (rows.length) {
    await sb.from("slack_events").upsert(rows).then(({ error }) => error && warn("push")(error));
  }
}

/**
 * 監聽 store:開始摸魚 → insert open event(同事立刻看得到「摸魚中」),
 * 結束 → upsert 補上 ended_at。用 upsert 不用 update:就算 open insert
 * 當時斷網失敗,結束時整列補上,結果一樣對。
 */
let watching = false;
export function watchStore() {
  if (watching) return; // idempotent,React StrictMode 掛兩次也只訂一次
  watching = true;
  useStore.subscribe((state, prev) => {
    if (state.activeId === prev.activeId) return;
    if (state.activeId && state.activeSince !== null) {
      sb.auth.getSession().then(async ({ data }) => {
        if (!data.session) return;
        const profile = await fetchMyProfile();
        sb.from("slack_events")
          .upsert({
            id: state.activeId,
            user_id: data.session.user.id,
            company_code: profile?.company_code ?? null,
            started_at: state.activeSince,
            ended_at: null,
          })
          .then(({ error }) => error && warn("open")(error));
      });
    }
    if (!state.activeId && prev.activeId) {
      const closed = state.slackEvents.find((e) => e.id === prev.activeId);
      if (closed) {
        sb.auth.getSession().then(({ data }) => {
          if (!data.session) return;
          sb.from("slack_events")
            .update({ ended_at: closed.endedAt })
            .eq("id", closed.id)
            .then(({ error }) => error && warn("close")(error));
        });
      }
    }
  });
}

// ---------- 心跳(在線 = 心跳夠新;斷線靠老化,不用 websocket) ----------

let beating = false;
export function startHeartbeat() {
  if (beating) return;
  beating = true;
  const beat = async () => {
    if (document.hidden) return;
    const uid = (await sb.auth.getSession()).data.session?.user.id;
    if (!uid) return;
    sb.from("profiles")
      .update({ last_seen_at: Date.now() })
      .eq("user_id", uid)
      .then(({ error }) => error && warn("beat")(error));
  };
  setInterval(beat, 60_000);
  document.addEventListener("visibilitychange", beat);
  beat();
}

// ---------- 隊伍資料(開頁查一次 + 輪詢,沒有 Realtime 訂閱) ----------

export type TeamData = {
  profile: ProfileRow | null;
  rows: Standing[];
  totalMs: number;
  events: EventRow[];
  reactions: ReactionRow[];
  members: ProfileRow[];
};

export async function fetchTeam(now: number): Promise<TeamData> {
  const profile = await fetchMyProfile();
  const [members, events, reactions] = await Promise.all([
    sb.from("profiles").select("*"),
    // 本週的、加上還開著的(上週開始摸到現在也算摸魚中)。RLS 已鎖同隊
    sb.from("slack_events").select("*").or(`ended_at.is.null,started_at.gte.${weekStart(now)}`),
    sb.from("reactions").select("*").order("created_at", { ascending: false }).limit(30),
  ]);
  const rows = standings(members.data ?? [], events.data ?? [], now);
  return {
    profile,
    rows,
    totalMs: teamTotalMs(rows),
    events: events.data ?? [],
    reactions: reactions.data ?? [],
    members: members.data ?? [],
  };
}

export async function react(eventId: string, emoji: string) {
  const session = (await sb.auth.getSession()).data.session;
  if (!session) return;
  const profile = await fetchMyProfile();
  await sb
    .from("reactions")
    .insert({
      event_id: eventId,
      company_code: profile?.company_code ?? null,
      from_user: session.user.id,
      emoji,
      created_at: Date.now(),
    })
    .then(({ error }) => error && warn("react")(error));
}

/** Team 頁和 Office 共用的輪詢 hook。沒登入回傳 null,一切照舊單機跑 */
export function useTeam(pollMs: number): (TeamData & { refresh: () => void }) | null {
  const session = useSession();
  const [data, setData] = useState<TeamData | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session) {
      setData(null);
      return;
    }
    let alive = true;
    const load = () => fetchTeam(Date.now()).then((d) => alive && setData(d)).catch(warn("fetch"));
    load();
    const id = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [session, pollMs, tick]);
  if (!session || !data) return null;
  return { ...data, refresh: () => setTick((t) => t + 1) };
}
