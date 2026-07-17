import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Config } from "./money";
import type { SlackEvent } from "./slack";

export const defaultConfig: Config = {
  monthlySalary: 50_000,
  workdaysPerMonth: 22,
  shiftStart: "09:00",
  shiftEnd: "18:00",
  lunchStart: "12:00",
  lunchMinutes: 60,
};

type State = {
  /** money.ts 的輸入。純算錢用,不放偏好設定 —— 純函式不該知道偽裝的存在 */
  config: Config;
  /** 離開分頁時自動切成偽裝殼 */
  autoDisguise: boolean;
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
  setConfig: (patch: Partial<Config>) => void;
  setAutoDisguise: (v: boolean) => void;
  startSlacking: () => void;
  stopSlacking: () => void;
};

// persist middleware 直接處理 localStorage 讀寫和 JSON 序列化。
// 不要自己寫 useEffect 同步 localStorage,那是在重造這個 middleware。
export const useStore = create<State>()(
  persist(
    (set) => ({
      config: defaultConfig,
      autoDisguise: true,
      slackEvents: [],
      activeSince: null,
      activeId: null,

      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      setAutoDisguise: (autoDisguise) => set({ autoDisguise }),

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
    { name: "salary-thief" },
  ),
);
