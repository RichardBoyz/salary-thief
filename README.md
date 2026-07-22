# 薪水小偷

即時告訴你「你今天摸魚偷了老闆多少錢」。

錢要親自賺:按「開始摸魚」會直接帶你進 2D 辦公室,站上外快區綠框數字才會跳、抓到魚再加碼。「開始摸魚」同時記**時數**(進報告與排行榜),但時數本身不生錢。畫面上刻意**不顯示**日薪、每秒身價這類能被路過同事反推月薪的數字 —— 錢只以「偷到」的形式出現。

- **薪水計數器** —— 今天偷到多少(= 外快區站立 + 漁獲獎勵)、今日/本週摸魚時長、距離下班、今日進度。刻意**不**顯示日薪或每秒身價 —— 路過瞄到螢幕的人推不出你的月薪
- **老闆鍵** —— `Esc`(手機快速點兩下)一鍵切成假試算表,離開分頁時自動偽裝,連分頁標題和 favicon 都一起換掉
- **主題** —— 深色終端機(預設)/ Win3.1 復古灰亮色,設定頁切換;中英介面也在設定頁切
- **摸魚報告** —— 摸魚時數換算成偷到多少錢,加上過去 12 週的熱力圖
- **2D 辦公室** —— WASD 操作角色,走到茶水間記摸魚時數,走回座位結束。沒裝遊戲引擎,地圖是 ASCII 字串手繪的。**外快區**:2×2 綠框每 10 分鐘隨機換位,錢的主要來源 —— 站進去以你的時薪累積,補血十字一格一格往上飄(免登入,錢照舊不上傳);抓到魚一條再加 15 分鐘時薪
- **魚點** —— 每天 8 個隨機時段在辦公室冒出 🐟,站上去抓。時刻表由伺服器種子導出、抓魚由 DB trigger 用伺服器時鐘驗證蓋章 —— 逆向了時刻表也沒用,事後補寫和竄改都被擋,🐟 是排行榜上唯一伺服器擔保的數字
- **團隊** —— Google 登入,從真實公司目錄選你的公司加入(選台積電就跟同事同房,免傳碼),目錄外可搜**經濟部商工登記**的全台公司(房間鍵用統編),或按「邀請同事」複製連結、同事點開會直接看到「誰邀請你加入哪間」,登入確認就進同房。公司底下依部門開隊伍:誰在摸魚(心跳老化判定,沒有 websocket)、本週排行、隊伍對抗、各公司摸魚 k-anon 聚合(≥5 人才顯示、不點名個人)、在職/離職、emoji 起鬨、串門子(👻 旁觀)。**排行榜比時數不比錢,月薪永遠不離開你的瀏覽器;DB 只存公司代碼不存公司名、個人只綁暱稱不綁真名**

**[設計決策與後續計畫](PLAN.md)** · **[開發規範](CONTRIBUTING.md)** · 線上版:https://salary-thief.r1382333.workers.dev

## 跑起來

```bash
npm install
npm run dev
```

## 這專案唯一有趣的技術決定

金額**永遠**從當下的時鐘重新推導,絕不用 `setInterval` 累加:

```ts
const worked = Math.min(now, shift.end) - shift.start - lunchOverlap;
return (worked / shift.paidMs) * shift.dailyPay;
```

累加版本會在三個地方壞掉:分頁切到背景時瀏覽器把計時器降頻、電腦睡眠時計時器完全停掉、使用者改系統時間時直接歪掉。你午休回來會發現自己少賺了一小時。

推導版本對這三種情況全部免疫,而且附帶兩個好處:`setInterval` 只負責叫 React 重畫,所以間隔可以放到 100ms(不需要 60fps 去重畫一個每秒只變 8 次的數字,這個 app 會被開一整天,不值得為此燒 CPU);以及 `earnedToday(cfg, t)` 是純函式,測試不用假時鐘、不用 `vi.useFakeTimers`,直接餵時間戳斷言就好。

## 技術

React + TypeScript + Vite + Tailwind + Zustand。執行期依賴三個。

沒有 router(網址列出現 `/salary-thief` 是最大的破綻,整個 app 活在同一個 URL 上)、沒有圖表庫、沒有日期庫、沒有 UI 元件庫 —— 理由都寫在 [PLAN.md](PLAN.md) 裡,包含「什麼條件下該把它們裝回來」。

## 測試

```bash
npm test
```

只測 `src/money.ts`。那是唯一有邊界條件、而且算錯會讓整個 app 失去意義的地方(上班前、下班後、跨午休、剛好卡在邊界、以及 localStorage 被亂改之後不能吐 NaN)。元件不測。

## 資料

預設只存在你自己瀏覽器的 localStorage 裡,不登入就完全沒有後端。登入組隊後,同步上去的只有:暱稱、公司碼(匿名 uuid,不是公司名)、隊名標籤、摸魚時間戳。月薪和所有金額只在本機計算,schema(`supabase/schema.sql`)裡沒有任何薪資欄位。

## 部署(Cloudflare Workers + static assets)

純靜態站,anon key 是設計成公開的(擋資料的是 RLS),所以**不需要環境變數**、不需要 API token、不需要後端。Workers static assets 是 Cloudflare 現行主推路線(Pages 已被整併吸收)。

1. Cloudflare Dashboard → Workers & Pages → Create → 連 Git → 選 `salary-thief` repo
2. 建置設定:**Build command** `npm run build`、**Deploy command** `npx wrangler deploy`、**Path 留空**(repo 根就是專案根)
3. 靜態資產位置由 repo 裡的 [`wrangler.jsonc`](wrangler.jsonc) 指定(`assets.directory = ./dist`)。之後每次 push main 自動部署;`public/_headers`(CSP 等安全標頭)在 Workers static assets 下照常生效

單一 URL、無路由,所以不需要 SPA fallback 設定。

## Supabase 設定(只有組隊功能需要;不登入完全不用碰)

社交功能(排行榜、魚點、跨公司統計、串門子)是「沒跑遷移就默默變空」的設計 —— 不會報錯,只會該區塊空白。所以第一次啟用組隊前,依序把 `supabase/` 的 SQL 貼進 **SQL Editor → Run**,每份跑一次:

| 情況 | 依序執行 |
|---|---|
| 全新 Supabase 專案 | `schema.sql` → `migrate-v3.sql` → `migrate-v4-security.sql` → `migrate-v5-company.sql` |
| 既有 v1 專案 | `migrate-v2.sql` → `migrate-v3.sql` → `migrate-v4-security.sql` → `migrate-v5-company.sql` |

沒跑各份的後果:v3 缺 → **辦公室完全沒有魚**(外快模型的漁獲獎勵消失);v5 缺 → 跨公司統計空白;v2 缺(既有專案)→ 隊伍對抗/一隊一房失效。

**還有一步(不然登入會壞):** Authentication → URL Configuration,把正式網址(`https://salary-thief.<帳號>.workers.dev`)填進 **Site URL**、加進 **Redirect URLs**。不設的話 Google 登入 / magic link 會把人導回 localhost。

驗收:用**個人**信箱登入 → 取代號選公司 → 進辦公室看得到魚點 → 複製邀請連結、換個瀏覽器點開能落進同一間房。
