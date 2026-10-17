/**
 * 股市模擬的純函式層。只有買進與賣出,沒有掛單、沒有做空、沒有槓桿。
 *
 * 兩個貫穿全檔的決定:
 *
 * 1. **不存餘額,只存交易,現金當場算。** 跟「存毫秒不存錢」是同一個原則。
 *    附帶好處是稽核不變式變成免費的:現金 = 累積偷到 − 買進 + 賣出,
 *    對不上就是有人動過手腳。收入帳(zone_points)與資產帳(交易)分開記,
 *    這條才查得動 —— 見 CONTRIBUTING 隱私鐵律第 4 條。
 * 2. **匯率是全站固定常數,不由任何人的收入導出。** 一旦匯率跟個人薪水
 *    有關,點數就又變成可反推薪水的數字,v8 拆掉的東西會整包長回來。
 */

/** 1 摸魚幣 = 1 元。現有費率下不需要乘數:綠框一小時 600 點、一條魚 150,
 *  認真摸一天約 1000~1800 點,剛好買得起一股千元股。要調就調這裡 */
export const NTD_PER_POINT = 1;

/** 台股實際費率:手續費買賣各一次 */
export const FEE_RATE = 0.001425;
/** 證交稅只有賣出收 */
export const TAX_RATE = 0.003;

export type Side = "buy" | "sell";

export type Trade = {
  id: string;
  symbol: string;
  side: Side;
  shares: number;
  /** 成交當下的股價(台幣)。伺服器蓋章,client 送什麼都不算數 */
  priceNtd: number;
  at: number;
};

export type Holding = {
  symbol: string;
  shares: number;
  /** 累計成本(摸魚幣)。均價 = costPts / shares */
  costPts: number;
};

/** 爛值(NaN / 負數 / localStorage 被亂改)一律當 0,不讓它汙染整條鏈 */
const safe = (v: number): number => (Number.isFinite(v) ? Math.max(0, v) : 0);

/**
 * 買進要付多少摸魚幣(含手續費)。
 *
 * 進位方向刻意都對使用者不利(買進無條件進位、賣出無條件捨去):點數是
 * 整數,如果零頭往有利的方向倒,買一股賣一股就能刷出點數 —— 一個迴圈
 * 就把經濟洗爛。差額最多 1 點,沒人會在意,但漏洞是關死的。
 */
export const buyCost = (shares: number, priceNtd: number): number =>
  Math.ceil((safe(shares) * safe(priceNtd) * (1 + FEE_RATE)) / NTD_PER_POINT);

/** 賣出拿得回多少摸魚幣(扣手續費與證交稅) */
export const sellProceeds = (shares: number, priceNtd: number): number =>
  Math.floor((safe(shares) * safe(priceNtd) * (1 - FEE_RATE - TAX_RATE)) / NTD_PER_POINT);

/**
 * 交易紀錄 → 現在持有什麼。
 *
 * 賣出用移動平均成本法:賣掉一半就帶走一半的累計成本。不做先進先出 ——
 * FIFO 要記每一批的批次,而這裡只需要「我賺了還賠了」,平均成本就夠。
 */
export function holdings(trades: Trade[]): Holding[] {
  const bySymbol = new Map<string, Holding>();
  for (const t of trades) {
    const h = bySymbol.get(t.symbol) ?? { symbol: t.symbol, shares: 0, costPts: 0 };
    if (t.side === "buy") {
      h.shares += t.shares;
      h.costPts += buyCost(t.shares, t.priceNtd);
    } else {
      // 賣超過持有量在 canSell 就被擋掉;真的發生時夾住,不吐負數持股
      const sold = Math.min(t.shares, h.shares);
      const costOut = h.shares > 0 ? Math.round((h.costPts * sold) / h.shares) : 0;
      h.shares -= sold;
      h.costPts -= costOut;
    }
    bySymbol.set(t.symbol, h);
  }
  return [...bySymbol.values()].filter((h) => h.shares > 0);
}

/**
 * 可用摸魚幣 = 累積偷到 − 買進 + 賣出。
 *
 * earnedPts 來自伺服器(zone_points − 老闆罰款 + 漁獲),交易也來自伺服器。這個函式
 * 不信任何本機狀態,所以它同時就是稽核公式:算出來是負的,代表帳被動過。
 */
export function cashPts(earnedPts: number, trades: Trade[]): number {
  let cash = safe(earnedPts);
  for (const t of trades) {
    cash +=
      t.side === "buy" ? -buyCost(t.shares, t.priceNtd) : sellProceeds(t.shares, t.priceNtd);
  }
  return cash;
}

/**
 * 持股市值(摸魚幣)。價格表查不到就當 0 —— 收盤後、抓價失敗、剛下市,
 * 這些情況都不該讓畫面變成 NaN。
 */
export const marketValuePts = (hs: Holding[], prices: Record<string, number>): number =>
  hs.reduce((sum, h) => sum + Math.floor((h.shares * safe(prices[h.symbol])) / NTD_PER_POINT), 0);

/** 股數必須是正整數 —— 零股一股起跳,但沒有半股這種東西 */
const validShares = (shares: number): boolean =>
  Number.isInteger(shares) && shares > 0;

/** 這筆買單能不能成立。價格必須是正數:抓不到價就不准交易,不猜 */
export const canBuy = (
  shares: number,
  priceNtd: number,
  cash: number,
): boolean =>
  validShares(shares) && priceNtd > 0 && buyCost(shares, priceNtd) <= safe(cash);

/** 這筆賣單能不能成立。不能賣超過持有量 = 結構上不可能做空 */
export const canSell = (shares: number, priceNtd: number, held: number): boolean =>
  validShares(shares) && priceNtd > 0 && shares <= held;
