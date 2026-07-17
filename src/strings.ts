// 所有 UI 文字集中在這裡。現在成本是零,之後要加英文時這個檔案改名成
// locales/zh-TW.ts、複製一份 en.ts、加一個十行的 useT() 就結束。
// 不裝 i18next,因為在只有一種語言的期間,t('some.nested.key') 是純虧損。
export const t = {
  appName: "薪水小偷",

  todayEarned: "今天已經賺到",
  perSecond: "每秒身價",
  untilOffWork: "距離下班",
  dailyPay: "今日日薪",
  progressOfDay: "今日進度",

  stateBefore: "還沒上班",
  stateWorking: "上班中",
  stateLunch: "午休中",
  stateAfter: "已下班",

  quipBefore: "上班時間還沒到,你現在是免費的。",
  quipWorking: "每一秒都在把時間換成錢。",
  quipLunch: "午休不算工時,這段時間老闆沒在付你錢。",
  quipAfter: "今天的份全部到手了。可以走了。",

  disguiseTitle: "Q3_forecast_v7_FINAL_修正版.xlsx - Excel",
  bossKeyHint: "Esc 裝忙",

  settings: "設定",
  back: "返回",
  autoDisguise: "離開分頁時自動偽裝",
  autoDisguiseHint: "alt-tab 走開的當下就切成試算表,回來按 Esc 解除。",
  monthlySalary: "月薪",
  workdaysPerMonth: "每月上班天數",
  shiftStart: "上班時間",
  shiftEnd: "下班時間",
  lunchStart: "午休開始",
  lunchMinutes: "午休長度(分鐘)",
  settingsHint: "資料只存在這台裝置的瀏覽器裡,不會上傳。",
  errShiftOrder: "下班時間必須晚於上班時間。",
  errLunchTooLong: "午休比整個班表還長。",
} as const;
