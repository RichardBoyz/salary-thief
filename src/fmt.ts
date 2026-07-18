/** "45 分" / "2 小時 30 分"。Counter、Stats、Office 共用。
 *  夾 0:剛按下開始的那一瞬,useNow 的 tick 可能比 activeSince 舊 100ms,
 *  沒夾的話 Math.floor(-0.001) 會閃出「-1 分」 */
export const dur = (ms: number): string => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 60 ? `${m} 分` : `${Math.floor(m / 60)} 小時 ${m % 60} 分`;
};

export const twd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
