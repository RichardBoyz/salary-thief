import { useState } from "react";
import { pts } from "../fmt";
import {
  buyCost,
  canBuy,
  canSell,
  holdings,
  marketValuePts,
  NTD_PER_POINT,
  sellProceeds,
} from "../stocks";
import { t } from "../strings";
import { buyStock, sellStock, useStocks, type StockRow } from "../sync";

/** 伺服器的錯誤訊息是英文技術字串,對到看得懂的文案;沒對到就照實顯示 */
const errText = (msg: string): string =>
  msg.includes("not enough points")
    ? t.errNotEnoughPoints
    : msg.includes("not enough shares")
      ? t.errNotEnoughShares
      : msg.includes("no price")
        ? t.errNoPrice
        : msg;

function Row({
  s,
  held,
  cash,
  busy,
  onTrade,
}: {
  s: StockRow;
  held: number;
  cash: number;
  busy: boolean;
  onTrade: (side: "buy" | "sell", shares: number) => void;
}) {
  const [shares, setShares] = useState(1);
  const price = s.close_ntd ?? 0;
  const n = Number.isInteger(shares) && shares > 0 ? shares : 0;

  return (
    <li className="px-row flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="min-w-24 flex-1 text-crt-white">
        {s.name}
        <span className="px-small ml-2 text-crt-dim">{s.symbol}</span>
      </span>

      <span className="tabular-nums text-crt-gold">
        {price > 0 ? price.toFixed(2) : t.noPrice}
      </span>

      {held > 0 && (
        <span className="px-small tabular-nums text-crt-dim">
          {t.holdingShares} {held}
        </span>
      )}

      <input
        type="number"
        min={1}
        step={1}
        value={shares}
        onChange={(e) => setShares(Math.floor(e.target.valueAsNumber) || 0)}
        className="px-input w-20 tabular-nums"
        aria-label={t.sharesUnit}
      />

      <button
        className="px-btn text-crt-green"
        disabled={busy || !canBuy(n, price, cash)}
        // title 用原生 tooltip 顯示會扣多少 —— 不裝任何 tooltip 套件
        title={n > 0 && price > 0 ? `−${pts.format(buyCost(n, price))} ${t.pointsUnit}` : ""}
        onClick={() => onTrade("buy", n)}
      >
        {t.buy}
      </button>
      <button
        className="px-btn text-crt-red"
        disabled={busy || !canSell(n, price, held)}
        title={n > 0 && price > 0 ? `+${pts.format(sellProceeds(n, price))} ${t.pointsUnit}` : ""}
        onClick={() => onTrade("sell", n)}
      >
        {t.sell}
      </button>
    </li>
  );
}

export default function Stocks({ onBack }: { onBack: () => void }) {
  const { stocks, trades, cash, refresh } = useStocks(60_000);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hs = holdings(trades);
  const prices = Object.fromEntries(
    stocks.map((s) => [s.symbol, s.close_ntd ?? 0]),
  ) as Record<string, number>;
  const value = marketValuePts(hs, prices);
  const heldOf = (symbol: string) => hs.find((h) => h.symbol === symbol)?.shares ?? 0;

  const onTrade = async (symbol: string, side: "buy" | "sell", shares: number) => {
    setBusy(true);
    setErr(null);
    const msg = await (side === "buy" ? buyStock : sellStock)(symbol, shares);
    if (msg) setErr(errText(msg));
    setBusy(false);
    refresh();
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-[36px] text-crt-white">{t.stocks}</h1>
        <button onClick={onBack} className="px-btn">
          {t.back}
        </button>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="px-panel px-4 py-3">
          <div className="px-small text-crt-dim">{t.cashOnHand}</div>
          <div className="mt-1 tabular-nums text-crt-gold">{pts.format(cash)}</div>
        </div>
        <div className="px-panel px-4 py-3">
          <div className="px-small text-crt-dim">{t.holdingValue}</div>
          <div className="mt-1 tabular-nums text-crt-white">{pts.format(value)}</div>
        </div>
        <div className="px-panel px-4 py-3">
          <div className="px-small text-crt-dim">{t.totalAssets}</div>
          <div className="mt-1 tabular-nums text-crt-white">{pts.format(cash + value)}</div>
        </div>
      </div>

      {err && <p className="px-bevel-in bg-crt-deep px-3 py-2 text-crt-red">{err}</p>}

      <ul className="flex flex-col gap-1">
        {stocks.map((s) => (
          <Row
            key={s.symbol}
            s={s}
            held={heldOf(s.symbol)}
            cash={cash}
            busy={busy}
            onTrade={(side, shares) => onTrade(s.symbol, side, shares)}
          />
        ))}
      </ul>

      {hs.length > 0 && (
        <div>
          <div className="mb-2 text-crt-dim">{t.myHoldings}</div>
          <ul className="flex flex-col gap-1">
            {hs.map((h) => {
              const now = Math.floor((h.shares * (prices[h.symbol] ?? 0)) / NTD_PER_POINT);
              const pnl = now - h.costPts;
              return (
                <li key={h.symbol} className="px-row flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
                  <span className="flex-1 text-crt-white">{h.symbol}</span>
                  <span className="px-small tabular-nums text-crt-dim">
                    {h.shares} {t.sharesUnit}
                  </span>
                  <span className="px-small tabular-nums text-crt-dim">
                    {t.avgCost} {Math.round(h.costPts / h.shares)}
                  </span>
                  <span
                    className={`tabular-nums ${pnl >= 0 ? "text-crt-green" : "text-crt-red"}`}
                  >
                    {pnl >= 0 ? "+" : ""}
                    {pts.format(pnl)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="px-small text-crt-dim">{t.stocksHint}</p>
    </div>
  );
}
