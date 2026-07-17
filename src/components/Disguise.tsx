// 假的試算表。整頁靜態,沒有互動、沒有依賴。
//
// 不用 faker:決定性偽亂數同樣說服力,而且「每次重整數字都一樣」反而更像
// 一個真的檔案 —— 每次切過來營收都不一樣才是破綻。

import { t } from "../strings";

const COLS = ["A", "B", "C", "D", "E", "F", "G"] as const;
const HEADERS = ["產品線", "區域", "月份", "營收", "成本", "毛利", "毛利率"] as const;

const PRODUCTS = ["行動支付", "企業金流", "跨境匯款", "帳務對帳", "風控引擎"];
const REGIONS = ["台北", "台中", "高雄", "新竹"];
const MONTHS = ["2026-07", "2026-08"];

/** 決定性偽亂數 (LCG),同樣的 i 永遠給同樣的值 */
const rnd = (i: number, salt: number) =>
  ((i * 9301 + salt * 49297 + 233280) % 233280) / 233280;

const int = (n: number) => Math.round(n).toLocaleString("en-US");

const rows = PRODUCTS.flatMap((product, p) =>
  REGIONS.flatMap((region, r) =>
    MONTHS.map((month, m) => {
      const i = p * 100 + r * 10 + m;
      const revenue = 180_000 + rnd(i, 7) * 940_000;
      const cost = revenue * (0.48 + rnd(i, 13) * 0.34);
      return {
        product,
        region,
        month,
        revenue,
        cost,
        margin: revenue - cost,
        marginPct: (revenue - cost) / revenue,
      };
    }),
  ),
);

const total = rows.reduce((a, r) => a + r.revenue, 0);

const cell = "border border-[#d4d4d4] px-1.5 py-[3px] whitespace-nowrap";
const num = `${cell} text-right tabular-nums`;

export default function Disguise() {
  return (
    <div className="flex h-dvh flex-col bg-[#f3f3f3] text-[11px] text-[#212121] select-none">
      {/* 標題列 */}
      <div className="flex items-center gap-2 bg-[#217346] px-3 py-1.5 text-white">
        <span className="font-semibold">X</span>
        <span className="flex-1 text-center text-[12px]">{t.disguiseTitle}</span>
        <span className="tracking-widest text-white/70">— ▫ ✕</span>
      </div>

      {/* 功能區索引標籤 */}
      <div className="flex gap-4 border-b border-[#d4d4d4] bg-white px-3 py-1.5 text-[12px]">
        <span className="text-[#217346]">檔案</span>
        {["常用", "插入", "頁面配置", "公式", "資料", "校閱", "檢視", "說明"].map((x) => (
          <span key={x} className="text-[#444]">
            {x}
          </span>
        ))}
      </div>

      {/* 資料編輯列 */}
      <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-white px-2 py-1">
        <span className="w-16 border border-[#d4d4d4] px-1.5 py-0.5">D42</span>
        <span className="text-[#888] italic">fx</span>
        <span className="flex-1 border-l border-[#d4d4d4] pl-2 tabular-nums">
          =SUM(D2:D41)
        </span>
      </div>

      {/* 儲存格 */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#f3f3f3]">
              <th className="w-9 border border-[#d4d4d4] font-normal text-[#666]" />
              {COLS.map((c) => (
                <th
                  key={c}
                  className="min-w-24 border border-[#d4d4d4] px-1.5 py-[3px] font-normal text-[#666]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-[#eaeaea] font-semibold">
              <td className="border border-[#d4d4d4] text-center font-normal text-[#666]">1</td>
              {HEADERS.map((h) => (
                <td key={h} className={cell}>
                  {h}
                </td>
              ))}
            </tr>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border border-[#d4d4d4] bg-[#f3f3f3] text-center text-[#666]">
                  {i + 2}
                </td>
                <td className={cell}>{r.product}</td>
                <td className={cell}>{r.region}</td>
                <td className={cell}>{r.month}</td>
                <td className={num}>{int(r.revenue)}</td>
                <td className={num}>{int(r.cost)}</td>
                <td className={num}>{int(r.margin)}</td>
                <td className={`${num} ${r.marginPct < 0.25 ? "text-[#c00]" : ""}`}>
                  {(r.marginPct * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-[#d4d4d4] bg-[#f3f3f3] text-center font-normal text-[#666]">
                42
              </td>
              <td className={cell}>總計</td>
              <td className={cell} />
              <td className={cell} />
              {/* 選取中的儲存格 */}
              <td className={`${num} outline outline-2 -outline-offset-2 outline-[#217346]`}>
                {int(total)}
              </td>
              <td className={cell} />
              <td className={cell} />
              <td className={cell} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* 工作表索引標籤 */}
      <div className="flex gap-1 border-t border-[#d4d4d4] bg-[#f3f3f3] px-2 py-1">
        <span className="border-t-2 border-[#217346] bg-white px-3 py-0.5 font-semibold">
          明細
        </span>
        {["彙總", "假設", "Sheet4"].map((x) => (
          <span key={x} className="px-3 py-0.5 text-[#666]">
            {x}
          </span>
        ))}
      </div>

      {/* 狀態列 */}
      <div className="flex justify-between border-t border-[#d4d4d4] bg-[#f3f3f3] px-3 py-1 text-[#444]">
        <span>就緒</span>
        <span className="tabular-nums">
          平均: {int(total / rows.length)}　項目個數: {rows.length}　加總: {int(total)}
        </span>
      </div>
    </div>
  );
}
