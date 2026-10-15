// 網路層。原則:server 掛了 app 照常動 —— 每個寫入都是 fire-and-forget,
// 失敗只 console.warn,本地 localStorage 永遠是你自己資料的真相來源。
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import {
  apply,
  clampToRoom,
  EMPTY,
  errorKind,
  fromSnapshot,
  parseEvent,
  reconcile,
  shouldSend,
  supersedes,
  type Facing,
  type LoungeError,
  type LoungeState,
  type RoomKind,
} from "./lounge";
import { dayKey, weekStart } from "./slack";
import type { Side, Trade } from "./stocks";
import { useStore } from "./store";
import { sb } from "./supabase";
import {
  standings,
  teamTotalMs,
  type CatchRow,
  type CompanyRanking,
  type Employment,
  type EventRow,
  type ProfileRow,
  type ReactionRow,
  type Standing,
  type ZonePointRow,
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

/**
 * `undefined` = 還在問 supabase,`null` = 確定沒登入。
 *
 * 兩者分開是 v8b 逼出來的:全 app 強制登入之後,如果 loading 也回 null,
 * 已登入的人每次開頁都會先閃一下登入畫面。其他呼叫端寫的是 `if (!session)`,
 * undefined 一樣是 falsy,行為不變。
 */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
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
  employment: Employment = "current",
) {
  const uid = (await sb.auth.getSession()).data.session?.user.id;
  if (!uid) return;
  await sb.from("profiles").upsert({
    user_id: uid,
    handle,
    company_code: companyCode,
    team,
    employment,
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

/** 只改在職/離職。離職者不列入公司統計(company_rankings RPC 過濾掉) */
export async function setEmployment(employment: Employment) {
  const uid = (await sb.auth.getSession()).data.session?.user.id;
  if (!uid) return;
  await sb
    .from("profiles")
    .update({ employment })
    .eq("user_id", uid)
    .then(({ error }) => error && warn("employment")(error));
}

/**
 * 自訂外觀。存的是 6 碼選項編號(office/sprite.ts 的 encodeAvatar),null = 回預設。
 * 回傳錯誤訊息,null = 成功。select 回來確認真的改到一列:還沒建 profile 的人
 * update 不會報錯、只是什麼都沒改,不檢查的話會以為存好了。
 */
export async function saveAvatar(code: string | null): Promise<string | null> {
  const uid = (await sb.auth.getSession()).data.session?.user.id;
  if (!uid) return "no profile";
  const { data, error } = await sb
    .from("profiles")
    .update({ avatar: code })
    .eq("user_id", uid)
    .select("user_id");
  if (error) return error.message;
  return data.length ? null : "no profile";
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
  const [members, events, reactions, catches, zonePoints] = await Promise.all([
    sb.from("profiles").select("*"),
    // 本週的、加上還開著的(上週開始摸到現在也算摸魚中)。RLS 已鎖同公司
    sb.from("slack_events").select("*").or(`ended_at.is.null,started_at.gte.${weekStart(now)}`),
    sb.from("reactions").select("*").order("created_at", { ascending: false }).limit(30),
    // v3 表。還沒跑 migrate-v3 時這查詢會錯,data 是 null → 漁獲全 0,app 照常
    sb.from("catches").select("user_id,caught_at").gte("caught_at", weekStart(now)),
    // v8 表。同理:沒跑 migrate-v8 → 摸魚幣欄位全 0,排行榜其他欄照常
    sb.from("zone_points").select("user_id,day,points").gte("day", dayKey(weekStart(now))),
  ]);
  const rows = standings(
    members.data ?? [],
    events.data ?? [],
    now,
    (catches.data ?? []) as CatchRow[],
    (zonePoints.data ?? []) as ZonePointRow[],
  );
  return {
    profile,
    rows,
    totalMs: teamTotalMs(rows),
    events: events.data ?? [],
    reactions: reactions.data ?? [],
    members: members.data ?? [],
  };
}

// ---------- 魚點(隨機摸魚區塊,伺服器驗證) ----------

export type Spot = {
  spot_index: number;
  start_ms: number;
  end_ms: number;
  r1: number;
  r2: number;
  caught: boolean;
};

/** 伺服器的「今天」是台北時區,client 送 day 時要用同一個曆 */
export const taipeiDay = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());

/**
 * 今天的魚點時刻表。只能查自己的(RPC 內部用 auth.uid()),種子在 DB 的
 * private schema,API 拿不到。還沒跑 migrate-v3 → RPC 404 → 空陣列,辦公室
 * 就是沒有魚,一切照常。
 */
export function useSpots(): { spots: Spot[]; refresh: () => void } {
  const session = useSession();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session) {
      setSpots([]);
      return;
    }
    let alive = true;
    sb.rpc("my_spots").then(({ data, error }) => {
      if (error) return warn("spots")(error);
      if (alive) setSpots((data ?? []) as Spot[]);
    });
    return () => {
      alive = false;
    };
  }, [session, tick]);
  return { spots, refresh: () => setTick((n) => n + 1) };
}

/**
 * 跨公司排行。RPC 是 k-anon 聚合(只回 >= 5 人的公司、只回聚合不回個人),
 * 名字靠 client 的 companies.ts 反查 —— 只有目錄公司會被具名。還沒跑
 * migrate-v5 → RPC 404 → 空陣列,這個區塊就不顯示。
 */
export function useCompanyRankings(pollMs: number): CompanyRanking[] {
  const session = useSession();
  const [rows, setRows] = useState<CompanyRanking[]>([]);
  useEffect(() => {
    if (!session) {
      setRows([]);
      return;
    }
    let alive = true;
    const load = () => {
      const now = Date.now();
      sb.rpc("company_rankings", { week_start: weekStart(now), now_ms: now }).then(
        ({ data, error }) => {
          if (error) return warn("rankings")(error);
          if (alive) setRows((data ?? []) as CompanyRanking[]);
        },
      );
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [session, pollMs]);
  return rows;
}

/**
 * 抓魚。合法性完全由 DB trigger 決定:視窗必須「此刻」開著(伺服器時鐘),
 * caught_at 由伺服器蓋。這裡送什麼時間戳都無所謂。
 */
export async function catchFish(spotIndex: number): Promise<boolean> {
  const session = (await sb.auth.getSession()).data.session;
  if (!session) return false;
  const profile = await fetchMyProfile();
  const { error } = await sb.from("catches").insert({
    user_id: session.user.id,
    company_code: profile?.company_code ?? null,
    day: taipeiDay(),
    spot_index: spotIndex,
    caught_at: Date.now(), // 伺服器會蓋掉,填了只是好看
  });
  if (error) {
    warn("catch")(error);
    return false;
  }
  return true;
}

/**
 * 把今天在外快區站到的點數回報上去,回傳伺服器認可的值(不是我們送的值)。
 *
 * 伺服器會夾在「今天已流逝時間 × 10 點/分」以內,而且只准往上。所以這裡
 * 送整包今日總量而不是增量 —— 重送、漏送、順序亂掉都不會算錯,失敗也不用
 * 補償:下一次 tick 送的還是同一個總量。
 */
export async function syncZonePoints(todayPoints: number): Promise<number | null> {
  const session = (await sb.auth.getSession()).data.session;
  if (!session) return null;
  const { data, error } = await sb.rpc("sync_zone_points", { p_points: todayPoints });
  if (error) {
    warn("points")(error);
    return null;
  }
  return data as number;
}

// ---------- 股市(v9)----------

export type StockRow = {
  symbol: string;
  name: string;
  close_ntd: number | null;
  trade_date: string | null;
  featured?: boolean;
};

/**
 * 搜尋全市場。代號或名稱都吃,結果限 20 筆。
 *
 * 全市場一千多列已經在自己的 DB 裡(每日排程本來就整批抓回來),所以搜尋
 * 不打任何外部 API、不需要同源轉發、也不用怕限流 —— 跟公司搜尋要繞 gcis
 * 是完全不同的處境。一千列的 ilike 掃描不值得為它加索引。
 */
export async function searchStocks(q: string): Promise<StockRow[]> {
  const term = q.trim().replace(/[%,()]/g, "");
  if (term.length < 1) return [];
  const { data, error } = await sb
    .from("stocks")
    .select("*")
    .or(`symbol.ilike.%${term}%,name.ilike.%${term}%`)
    .not("close_ntd", "is", null)
    .order("symbol")
    .limit(20);
  if (error) {
    warn("stock search")(error);
    return [];
  }
  return (data ?? []) as StockRow[];
}

type TradeRow = {
  id: string;
  symbol: string;
  side: Side;
  shares: number;
  price_ntd: number;
  points: number;
  at: string;
};

/**
 * 股市頁要的三份資料:標的+收盤價、自己的交易、伺服器算的現金。
 *
 * 現金一律用伺服器的 my_cash(),不用本機推算 —— 本機那份(stocks.ts 的
 * cashPts)是拿來對帳與試算的,不是真相。沒跑 migrate-v9 → 查詢失敗 →
 * 空清單,這頁就是空的,其他功能照常(跟 v3/v5/v8 一樣靜默變空)。
 *
 * **刻意沒有輪詢**:價格是每日收盤價,一天只變一次,輪詢等於拿免費方案的
 * 出站流量去撈同一份資料。進頁面查一次、下單後 refresh 一次就夠 —— 這也是
 * 為什麼團隊頁那種「誰在摸魚」才需要輪詢,這頁不需要。
 */
export function useStocks() {
  const session = useSession();
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [cash, setCash] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    const load = async () => {
      const [t, c] = await Promise.all([
        sb.from("trades").select("*").order("at"),
        sb.rpc("my_cash"),
      ]);
      const rows = ((t.data ?? []) as TradeRow[]).map((r) => ({
        id: r.id,
        symbol: r.symbol,
        side: r.side,
        shares: r.shares,
        priceNtd: Number(r.price_ntd),
        at: Date.parse(r.at),
      }));

      // 只載預設清單 + 你持有的。全市場一千多列不該在每次開頁時整包送過來,
      // 那是拿免費方案的出站流量去換一個沒人會滑到底的清單 —— 其他靠搜尋。
      const held = [...new Set(rows.map((r) => r.symbol))];
      const filter = held.length
        ? `featured.is.true,symbol.in.(${held.join(",")})`
        : "featured.is.true";
      let s = await sb.from("stocks").select("*").or(filter).order("symbol");
      // 還沒跑 migrate-v10 時沒有 featured 欄位 → 退回舊行為,頁面不會空掉
      if (s.error) s = await sb.from("stocks").select("*").order("symbol").limit(50);

      if (!alive) return;
      setStocks((s.data ?? []) as StockRow[]);
      setTrades(rows);
      setCash(Number(c.data ?? 0));
    };
    load().catch(warn("stocks"));
    return () => {
      alive = false;
    };
  }, [session, tick]);

  return { stocks, trades, cash, refresh: () => setTick((n) => n + 1) };
}

/**
 * 下單。client 只送「買什麼、幾股」—— 價格、費用、成不成交全由伺服器判,
 * 所以這裡沒有任何值得偽造的東西。回傳 null = 成功,字串 = 伺服器的理由。
 */
async function trade(fn: "buy_stock" | "sell_stock", symbol: string, shares: number) {
  const { error } = await sb.rpc(fn, { p_symbol: symbol, p_shares: shares });
  return error ? error.message : null;
}

export const buyStock = (symbol: string, shares: number) => trade("buy_stock", symbol, shares);
export const sellStock = (symbol: string, shares: number) => trade("sell_stock", symbol, shares);

// ---------- 留言板(v11)----------

export type MessageRow = {
  id: string;
  user_id: string;
  handle: string;
  body: string;
  at: string;
};

/** 一次最多讀 50 則。留言板不是檔案庫,DB 端也只留七天 */
export const BOARD_LIMIT = 50;

/**
 * 同公司留言。**只在分頁可見時輪詢** —— 掛在背景的分頁每 20 秒撈一次資料
 * 是純粹的浪費(心跳那邊也是同一個判斷)。切回來會立刻補一次。
 */
export function useBoard(team: string | null, pollMs: number) {
  const session = useSession();
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      const q = sb.from("messages").select("id,user_id,handle,body,at");
      // 一隊一房,留言板也一樣。沒選隊的人在大廳(team is null)
      (team === null ? q.is("team", null) : q.eq("team", team))
        .order("at", { ascending: false })
        .limit(BOARD_LIMIT)
        .then(({ data, error }) => {
          if (error) return warn("board")(error);
          if (alive) setRows((data ?? []) as MessageRow[]);
        });
    };
    load();
    const id = setInterval(load, pollMs);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [session, team, pollMs, tick]);

  return { rows, refresh: () => setTick((n) => n + 1) };
}

/** 發言。長度、頻率、重複全在伺服器判 —— 回傳 null = 成功,字串 = 理由 */
export async function postMessage(body: string): Promise<string | null> {
  const { error } = await sb.rpc("post_message", { p_body: body });
  return error ? error.message : null;
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

// ---------- 即時房間(v15 休息室、v16 辦公室) ----------

export type RoomStatus =
  | "off"
  | "connecting"
  | "live"
  | "away"
  | "full"
  | "replaced"
  | "needCompany"
  | "notReady"
  | "error";

const ROOM_EVENTS = ["join", "leave", "move", "say", "emote"] as const;

/**
 * 離開房間。⚠ 一定要 .then():supabase 的查詢是「有人 then 才送出」的 thenable,
 * 只寫 `void sb.rpc(...)` 請求根本不會發 —— 實機測試時抓到人影離開後還掛 60 秒。
 */
const leaveRoom = (session: string) =>
  sb.rpc("lounge_leave", { p_session: session }).then(({ error }) => error && warn("room leave")(error));

/**
 * 即時房間的連線:休息室(同公司共用)或自己隊的辦公室,一個人同時只在一間。
 * 進門(RPC 發 session 與頻道名)→ 訂閱私有頻道(只收不發)→ 對帳 → 之後每 20 秒
 * 心跳、每 30 秒對帳。所有「發」都走 RPC,由 DB 驗證、蓋章後才廣播 —— 瀏覽器沒有
 * 直接廣播的權限(realtime.messages 只給 select)。頻道名由伺服器從 profiles 算,
 * 前端指定不了要進哪一隊的辦公室。
 *
 * 生命週期就是元件的生命週期:離開畫面、走門換房間就離開;切走分頁 30 秒也離開(別人不該看到一個掛著不動的人),切回來自動重新進門。
 * 關掉分頁來不及送 leave 的,DB 60 秒沒心跳就不算在場。
 *
 * kind = null:不連(串門子中)。feet:進門時回報的位置,讀當下的腳底 —— 切回分頁
 * 重新進門時,別人看到的是你站的地方,不是出生點。
 */
export function useRoom(kind: RoomKind | null, feet: { readonly current: { x: number; y: number } }) {
  const session = useSession();
  const uid = session?.user.id ?? null;
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [state, setState] = useState<LoungeState>(EMPTY);
  const [emotes, setEmotes] = useState<Record<string, { emoji: string; at: number }>>({});
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  // 換一個數字 = 重新進門(對方分頁接手後按「在這裡繼續」、被清掉後自動回來)
  const [epoch, setEpoch] = useState(0);
  const ticket = useRef<{ session: string; sid: string; topic: string } | null>(null);
  const lastSent = useRef<{ at: number; x: number; y: number } | null>(null);
  // 最後一則走位的請求。離開排在它後面送:走進門時別人先看到你走到門口,才看到你離開
  const lastMove = useRef<PromiseLike<unknown>>(Promise.resolve());
  // 動作 RPC 回來的錯誤若代表「這張票不能用了」,交給目前這一輪連線處理
  const lostTicket = useRef<(kind: LoungeError | null) => void>(() => {});

  useEffect(() => {
    // 換房間(或不連了)先清空:上一間的人與聊天不能留在畫面上
    setState(EMPTY);
    setEmotes({});
    if (!kind) {
      setStatus("off");
      return;
    }
    if (!uid) return;
    let alive = true;
    let away = false;
    let channel: RealtimeChannel | null = null;
    let awayTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const timers: ReturnType<typeof setInterval>[] = [];
    const me = { uid, sid: "" };

    const stop = (leave: boolean) => {
      timers.splice(0).forEach(clearInterval);
      if (channel) void sb.removeChannel(channel);
      channel = null;
      const t = ticket.current;
      ticket.current = null;
      lastSent.current = null;
      if (leave && t) void lastMove.current.then(() => leaveRoom(t.session));
    };

    lostTicket.current = (lost) => {
      if (!alive || away) return;
      if (lost === "replaced") {
        stop(false); // 票已經是別的分頁的了,不能拿它去 leave
        setStatus("replaced");
      } else if (lost === "gone") {
        stop(false); // 被清掉(太久沒心跳)或換了公司/隊伍:重新進門
        setEpoch((e) => e + 1);
      }
    };

    const refresh = async () => {
      const { data, error } = await sb.rpc("lounge_snapshot", { p_kind: kind });
      if (!alive || error) return;
      setState((s) => reconcile(s, fromSnapshot(kind, data)));
      setMutedUntil((data as { mutedUntil?: number | null } | null)?.mutedUntil ?? null);
    };

    const start = async () => {
      setStatus("connecting");
      const at = clampToRoom(kind, feet.current.x, feet.current.y);
      const { data, error } = await sb.rpc("lounge_enter", { p_kind: kind, p_x: at.x, p_y: at.y });
      if (error) {
        if (!alive) return;
        const why = errorKind(error.message);
        // 剛離開又馬上進(重新整理、切回分頁、走門來回)會撞到「三秒內不能重進」:等一下再試
        if (why === "tooFast") {
          retryTimer = setTimeout(() => void start(), 3000);
          return;
        }
        setStatus(
          why === "full"
            ? "full"
            : why === "needCompany"
              ? "needCompany"
              : why === "notReady"
                ? "notReady"
                : "error",
        );
        return;
      }
      const t = data as { session: string; sid: string; topic: string };
      // 進門的回應回來時元件已經不在了:馬上離開,不要留一個沒人操作的人影
      if (!alive) {
        void leaveRoom(t.session);
        return;
      }
      ticket.current = t;
      me.sid = t.sid;
      lastSent.current = { at: Date.now(), x: at.x, y: at.y };
      const token = (await sb.auth.getSession()).data.session?.access_token;
      if (token) await sb.realtime.setAuth(token);
      if (!alive) return;

      channel = sb.channel(t.topic, { config: { private: true } });
      for (const name of ROOM_EVENTS) {
        channel.on("broadcast", { event: name }, ({ payload }) => {
          const ev = parseEvent(kind, name, payload);
          if (!ev || !alive) return;
          if (supersedes(ev, me)) {
            stop(false);
            setStatus("replaced");
            return;
          }
          if (ev.type === "emote")
            setEmotes((e) => ({ ...e, [ev.uid]: { emoji: ev.emoji, at: Date.now() } }));
          setState((s) => apply(s, ev));
        });
      }
      // 每次(重新)接上都對一次帳:斷線期間漏掉的廣播靠這個補回來
      channel.subscribe((st) => {
        if (st === "SUBSCRIBED") void refresh();
      });
      setStatus("live");
      timers.push(
        setInterval(async () => {
          const cur = ticket.current;
          if (!cur) return;
          const { error: e } = await sb.rpc("lounge_ping", { p_session: cur.session });
          if (e) lostTicket.current(errorKind(e.message));
        }, 20_000),
        setInterval(() => void refresh(), 30_000),
      );
    };

    const onVisibility = () => {
      if (document.hidden) {
        awayTimer = setTimeout(() => {
          away = true;
          stop(true);
          if (alive) setStatus("away");
        }, 30_000);
        return;
      }
      if (awayTimer) clearTimeout(awayTimer);
      awayTimer = null;
      // 只有「因為切走而離開」才自動回來 —— 被別的分頁接手的不能自動搶回去,
      // 不然兩個分頁會在每次切換時互相踢來踢去
      if (away && alive) {
        away = false;
        void start();
      }
    };

    void start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (awayTimer) clearTimeout(awayTimer);
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      stop(true);
    };
    // feet 是 ref,讀的是進門那一刻的位置,不是依賴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, kind, epoch]);

  /**
   * 走位。每一幀都可以叫,依 shouldSend 節流(停下時、走路中每 2 秒)。走進門(出界)
   * 的那一刻當作停下:位置夾回門口立刻送出,別人會看到你走到門口
   */
  const move = (x: number, y: number, dir: Facing, stopped: boolean) => {
    const t = ticket.current;
    if (!t || !kind) return;
    const at = clampToRoom(kind, x, y);
    const atDoor = at.x !== x || at.y !== y;
    const now = Date.now();
    if (!shouldSend(lastSent.current, now, at.x, at.y, stopped || atDoor)) return;
    lastSent.current = { at: now, ...at };
    lastMove.current = sb
      .rpc("lounge_move", { p_session: t.session, p_x: at.x, p_y: at.y, p_dir: dir })
      .then(({ error }) => {
        // 太快、預算滿、被判瞬移都不用補救:下一則送的是最新位置,DB 那邊自然追上
        if (error) lostTicket.current(errorKind(error.message));
      });
  };

  /** 帶票的動作。回傳 null = 成功,字串 = 伺服器給的理由 */
  const act = async (fn: string, args: Record<string, unknown>): Promise<string | null> => {
    const t = ticket.current;
    if (!t) return "not in lounge";
    const { error } = await sb.rpc(fn, { p_session: t.session, ...args });
    if (!error) return null;
    lostTicket.current(errorKind(error.message));
    return error.message;
  };

  return {
    status,
    state,
    emotes,
    mutedUntil,
    me: uid,
    move,
    say: (body: string) => act("lounge_say", { p_body: body }),
    emote: (emoji: string) => act("lounge_emote", { p_emoji: emoji }),
    report: async (target: string): Promise<string | null> => {
      const { error } = await sb.rpc("lounge_report", { p_target: target });
      return error?.message ?? null;
    },
    retry: () => setEpoch((e) => e + 1),
  };
}

export type Room = ReturnType<typeof useRoom>;
