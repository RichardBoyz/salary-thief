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
  config: Config;
  setConfig: (patch: Partial<Config>) => void;
};

// persist middleware 直接處理 localStorage 讀寫和 JSON 序列化。
// 不要自己寫 useEffect 同步 localStorage,那是在重造這個 middleware。
export const useStore = create<State>()(
  persist(
    (set) => ({
      config: defaultConfig,
      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
    }),
    { name: "salary-thief" },
  ),
);
