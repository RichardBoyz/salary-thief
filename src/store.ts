import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Invite } from "./companies";
import type { Config } from "./money";
import type { SlackEvent } from "./slack";

export const defaultConfig: Config = {
  shiftStart: "09:00",
  shiftEnd: "18:00",
  lunchStart: "12:00",
  lunchMinutes: 60,
};

type State = {
  /** money.ts 的輸入。純算錢用,不放偏好設定 —— 純函式不該知道偽裝的存在 */
  config: Config;
  /** append-only。只有 push,沒有 update 也沒有 delete */
  slackEvents: SlackEvent[];
  /** 正在摸魚中的起始時間。這是暫時狀態,按下結束才會變成一筆 SlackEvent */
  activeSince: number | null;
  /**
   * 這次摸魚的事件 id,開始的當下就產生 —— 這樣登入時 sync.ts 能先 insert
   * 一筆 open event(ended_at null)讓同事看到「摸魚中」,結束時 update 同
   * 一列。有 persist,重新整理不會弄丟,server 上那筆 open event 關得掉。
   */
  activeId: string | null;
  /**
   * 自己公司的顯示名,只存在本機、永不上傳。目錄公司靠 companies.ts 反查真名,
   * 但自訂公司 DB 只有 uuid、反查不到,就靠這個本機標籤顯示。這樣 DB 仍然
   * 「不存公司名」—— 外洩看不出是哪家公司。
   */
  companyLabel: string | null;
  /** 外快區今天站了幾毫秒。跟其他數字一樣存時間不存錢,錢用時薪即時換算 */
  zoneMs: { day: string; ms: number };
  /**
   * 點了邀請連結還沒處理的邀請。要落地:點連結 → 去登入(OAuth 轉跳離站)
   * → 回來,這中間 hash 早就被清掉了,靠 persist 把邀請帶過整趟來回。
   */
  pendingInvite: Invite | null;
  setPendingInvite: (inv: Invite | null) => void;
  /** 看過新手教學了沒。false = 第一次開,App 直接開在說明頁 */
  helpSeen: boolean;
  setHelpSeen: (v: boolean) => void;
  /** 深色終端機(預設)或 Win3.1 復古灰。App 把它印到 <html data-theme> */
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  /**
   * 自己外觀的本機快取。真相在伺服器(profiles.avatar),這份只是讓進辦公室的
   * 第一幀就是你挑的樣子 —— 不然每次都先閃一下預設臉,等資料回來才換裝。
   * 綁 uid:同一台電腦換帳號登入時不會套到別人的造型。
   */
  myAvatar: { uid: string; code: string | null } | null;
  setMyAvatar: (v: { uid: string; code: string | null }) => void;
  /** 休息室裡被我靜音的人(只影響這台裝置的畫面,對方不會知道) */
  loungeMuted: string[];
  toggleLoungeMute: (uid: string) => void;
  setConfig: (patch: Partial<Config>) => void;
  setCompanyLabel: (label: string | null) => void;
  startSlacking: () => void;
  stopSlacking: () => void;
  addZoneMs: (ms: number, day: string) => void;
  /** 清掉本機紀錄(摸魚歷史、外快、公司/隊伍標籤),留著偏好(薪水/主題/教學) */
  resetData: () => void;
};

// persist middleware 直接處理 localStorage 讀寫和 JSON 序列化。
// 不要自己寫 useEffect 同步 localStorage,那是在重造這個 middleware。
export const useStore = create<State>()(
  persist(
    (set) => ({
      config: defaultConfig,
      slackEvents: [],
      activeSince: null,
      activeId: null,
      companyLabel: null,
      zoneMs: { day: "", ms: 0 },
      pendingInvite: null,
      setPendingInvite: (pendingInvite) => set({ pendingInvite }),
      helpSeen: false,
      setHelpSeen: (helpSeen) => set({ helpSeen }),
      theme: "dark",
      setTheme: (theme) => set({ theme }),
      myAvatar: null,
      setMyAvatar: (myAvatar) => set({ myAvatar }),
      loungeMuted: [],
      toggleLoungeMute: (uid) =>
        set((s) => ({
          loungeMuted: s.loungeMuted.includes(uid)
            ? s.loungeMuted.filter((u) => u !== uid)
            : [...s.loungeMuted, uid],
        })),

      // 換日自動歸零:day 對不上就從 0 起算,不用排程也不用清舊資料
      addZoneMs: (ms, day) =>
        set((s) => ({
          zoneMs: { day, ms: (s.zoneMs.day === day ? s.zoneMs.ms : 0) + ms },
        })),

      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      setCompanyLabel: (companyLabel) => set({ companyLabel }),

      // 只清紀錄不清偏好。server 上的資料(有登入的話)另外靠登出處理
      resetData: () =>
        set({
          slackEvents: [],
          activeSince: null,
          activeId: null,
          zoneMs: { day: "", ms: 0 },
          companyLabel: null,
          pendingInvite: null,
        }),

      // crypto.randomUUID() 是瀏覽器原生的,不需要 uuid 套件。
      // id 在 client 端產生 → 兩台裝置合併時不會撞,聯集就是答案。
      startSlacking: () =>
        set({ activeSince: Date.now(), activeId: crypto.randomUUID() }),
      stopSlacking: () =>
        set((s) => {
          if (s.activeSince === null) return {};
          return {
            activeSince: null,
            activeId: null,
            slackEvents: [
              ...s.slackEvents,
              {
                // ?? 只為了舊版 persist 資料(還沒有 activeId 就開始摸魚)不炸
                id: s.activeId ?? crypto.randomUUID(),
                startedAt: s.activeSince,
                endedAt: Date.now(),
              },
            ],
          };
        }),
    }),
    {
      name: "salary-thief",
      // v8 去薪水化。migrate 不是為了型別(多餘欄位對 TS 無害),是為了把使用者
      // 舊的月薪真的從這台裝置上刪掉 —— 不然「app 從此不知道你的薪水」是假的。
      // 注意:zustand 只在 storage 裡的 version 是 number 時才呼叫 migrate。
      // 舊資料一定有(persist 從第一天就會寫 version: 0),但手寫測試資料時
      // 漏掉 version 欄位就會靜默跳過遷移 —— 驗證時被這個騙過一次。
      // v2(v8b):摸魚幣改由伺服器記帳,本機累積的點數歸零重來 —— 不把
      // client 自報的餘額當成起始值搬上去,省掉一個一次性的作弊窗口。
      version: 2,
      migrate: (persisted) => {
        const s = persisted as {
          config?: Record<string, unknown>;
          zoneMs?: { day: string; ms: number };
        };
        delete s?.config?.monthlySalary;
        delete s?.config?.workdaysPerMonth;
        if (s) s.zoneMs = { day: "", ms: 0 };
        return s;
      },
    },
  ),
);
