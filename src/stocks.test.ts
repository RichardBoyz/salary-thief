import { describe, expect, it } from "vitest";
import {
  buyCost,
  canBuy,
  canSell,
  cashPts,
  FEE_RATE,
  holdings,
  marketValuePts,
  sellProceeds,
  TAX_RATE,
  type Trade,
} from "./stocks";

let seq = 0;
const trade = (
  side: "buy" | "sell",
  symbol: string,
  shares: number,
  priceNtd: number,
): Trade => ({ id: `t${seq++}`, symbol, side, shares, priceNtd, at: 0 });

describe("成交金額與費用", () => {
  it("買進含手續費,而且無條件進位", () => {
    // 1000 × 1.001425 = 1001.425 → 1002
    expect(buyCost(1, 1000)).toBe(1002);
    expect(buyCost(1, 1000)).toBeGreaterThan(1000);
  });

  it("賣出扣手續費與證交稅,而且無條件捨去", () => {
    // 1000 × (1 - 0.001425 - 0.003) = 995.575 → 995
    expect(sellProceeds(1, 1000)).toBe(995);
    expect(sellProceeds(1, 1000)).toBeLessThan(1000);
  });

  it("同價買了又賣一定虧 —— 進位方向不能被拿來刷點數", () => {
    // 這是這個檔案最重要的一條:如果零頭往有利方向倒,一個迴圈就能洗爆經濟
    for (const price of [1, 7, 13, 99, 100, 517, 1000, 1234]) {
      for (const shares of [1, 3, 100]) {
        const net = sellProceeds(shares, price) - buyCost(shares, price);
        expect(net).toBeLessThan(0);
      }
    }
  });

  it("費率就是台股的實際費率,不是我編的", () => {
    expect(FEE_RATE).toBeCloseTo(0.001425, 9);
    expect(TAX_RATE).toBeCloseTo(0.003, 9);
  });
});

describe("holdings(交易紀錄 → 現在持有什麼)", () => {
  it("同一檔多次買進會累加股數與成本", () => {
    const hs = holdings([trade("buy", "2330", 2, 1000), trade("buy", "2330", 3, 1100)]);
    expect(hs).toHaveLength(1);
    expect(hs[0].shares).toBe(5);
    expect(hs[0].costPts).toBe(buyCost(2, 1000) + buyCost(3, 1100));
  });

  it("賣一半就帶走一半的成本(移動平均)", () => {
    const cost = buyCost(10, 100);
    const hs = holdings([trade("buy", "2330", 10, 100), trade("sell", "2330", 5, 120)]);
    expect(hs[0].shares).toBe(5);
    expect(hs[0].costPts).toBe(Math.round((cost * 5) / 10));
  });

  it("賣光就從清單消失,不留 0 股的殭屍列", () => {
    expect(holdings([trade("buy", "2330", 2, 1000), trade("sell", "2330", 2, 1000)])).toEqual([]);
  });

  it("多檔各自分開算", () => {
    const hs = holdings([trade("buy", "2330", 1, 1000), trade("buy", "2317", 4, 200)]);
    expect(hs.map((h) => [h.symbol, h.shares])).toEqual([
      ["2330", 1],
      ["2317", 4],
    ]);
  });

  it("賣超過持有量時夾住,不吐負數持股", () => {
    // canSell 會先擋掉,這是第二道防線:資料被動過也不能算出負持股
    const hs = holdings([trade("buy", "2330", 1, 1000), trade("sell", "2330", 99, 1000)]);
    expect(hs).toEqual([]);
  });
});

describe("cashPts(現金當場算,不存餘額)", () => {
  it("累積偷到 − 買進 + 賣出", () => {
    const trades = [trade("buy", "2330", 1, 1000), trade("sell", "2330", 1, 1200)];
    expect(cashPts(5000, trades)).toBe(5000 - buyCost(1, 1000) + sellProceeds(1, 1200));
  });

  it("沒交易就等於全部賺到的", () => {
    expect(cashPts(1234, [])).toBe(1234);
  });

  it("這就是稽核公式 —— 算出負數代表帳被動過", () => {
    // 只賺 100 卻買了一股千元股:正常流程被 canBuy 擋死,能算出負數
    // 就表示交易不是從 app 走的
    expect(cashPts(100, [trade("buy", "2330", 1, 1000)])).toBeLessThan(0);
  });

  it("爛值不吐 NaN", () => {
    expect(cashPts(NaN, [])).toBe(0);
    expect(cashPts(-5, [])).toBe(0);
    expect(cashPts(100, [trade("buy", "2330", NaN, 1000)])).toBe(100);
  });
});

describe("marketValuePts", () => {
  it("按價格表算市值", () => {
    const hs = holdings([trade("buy", "2330", 2, 1000)]);
    expect(marketValuePts(hs, { "2330": 1100 })).toBe(2200);
  });

  it("價格表查不到就當 0,不是 NaN —— 收盤或抓價失敗不該炸畫面", () => {
    const hs = holdings([trade("buy", "2330", 2, 1000)]);
    expect(marketValuePts(hs, {})).toBe(0);
    expect(marketValuePts(hs, { "2330": NaN })).toBe(0);
  });
});

describe("canBuy / canSell", () => {
  it("現金剛好夠才買得下去", () => {
    expect(canBuy(1, 1000, buyCost(1, 1000))).toBe(true);
    expect(canBuy(1, 1000, buyCost(1, 1000) - 1)).toBe(false);
  });

  it("股數必須是正整數 —— 沒有半股,也不能買 0 股或負數股", () => {
    expect(canBuy(1.5, 1000, 999_999)).toBe(false);
    expect(canBuy(0, 1000, 999_999)).toBe(false);
    expect(canBuy(-1, 1000, 999_999)).toBe(false);
  });

  it("抓不到價就不准交易,不猜一個價格", () => {
    expect(canBuy(1, 0, 999_999)).toBe(false);
    expect(canSell(1, 0, 10)).toBe(false);
  });

  it("賣不能超過持有量 —— 結構上做不了空", () => {
    expect(canSell(10, 1000, 10)).toBe(true);
    expect(canSell(11, 1000, 10)).toBe(false);
    expect(canSell(1, 1000, 0)).toBe(false);
  });
});
