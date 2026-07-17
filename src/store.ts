import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Config } from "./money";

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
  setConfig: (patch: Partial<Config>) => void;
  setAutoDisguise: (v: boolean) => void;
};

// persist middleware 直接處理 localStorage 讀寫和 JSON 序列化。
// 不要自己寫 useEffect 同步 localStorage,那是在重造這個 middleware。
export const useStore = create<State>()(
  persist(
    (set) => ({
      config: defaultConfig,
      autoDisguise: true,
      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      setAutoDisguise: (autoDisguise) => set({ autoDisguise }),
    }),
    { name: "salary-thief" },
  ),
);
