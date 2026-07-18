# 薪水小偷 — 專案計畫

> 一句話:一個純前端網頁,即時告訴你「你今天坐在這裡已經賺了多少錢」,順便幫你在老闆走過來時把畫面變成 Excel。

---

## 1. 範圍與階段

四個功能全做是三個月的量。但 **Phase 0 自己就是一個完整、可上線、可以丟給朋友笑的產品**,所以照這個順序做,每個階段結束都能停在一個能交付的狀態:

| 階段 | 內容 | 需要後端? | 狀態 |
|---|---|---|---|
| **Phase 0** | 即時薪水計數器 + 設定頁 + localStorage | 否 | ✅ 已完成 |
| **Phase 1** | 老闆鍵 + 一套偽裝殼(Excel) | 否 | ✅ 已完成 |
| **Phase 2** | 摸魚紀錄 + 統計熱力圖 | 否 | ✅ 已完成 |
| **Phase 3** | Supabase 資料層:登入、三張表、排行榜/在線/團隊總計/emoji 起鬨 | 是 | ✅ 上線。RLS 經外部驗證;Google OAuth 為主、magic link 備用 |
| **Phase 4** | 2D 辦公室(操作角色走位;v0 單人版不需後端) | 部分 | ✅ 完成;同事 avatar 已接上 Phase 3 資料 |
| **Phase 5**(保留) | i18n、貢獻指南、發布流程 | — | 之後再說 |

### Phase 3 — 從「跨裝置同步」改成「多人社交」

原本這階段只是把單人資料同步到雲端。後來確定要加同事互動(排行榜、即時在線、團隊總計、互相起鬨),所以重新設計。

**核心決定:除了在線狀態,其他都不做即時連線;在線狀態用時間戳算,不用 websocket。**

- 排行榜、團隊總計:開頁查一次 + 下拉刷新。純聚合查詢,慢個 30 秒沒人在乎。RLS 已把可見範圍鎖在同隊,所以查詢就是 `started_at >= 週一`,拉回來在 client 端 group by —— 一隊撐死二十人、一週幾百筆事件,直接重用 `slack.ts` 裡已經寫好測好的純函式算,不用寫 server-side view/RPC(量真的大了再說)。
- 起鬨:非同步。你摸魚,同事晚點給那次一個 emoji,你下次開 app 看到。它不是聊天。
- 在線:不需要 websocket。兩個訊號拼出來 —— `profiles.last_seen_at` 心跳(分頁可見時每 60 秒 update 自己那一列)+ 有一筆 `ended_at` 為 null 的摸魚。**在線** = 心跳 < 2 分鐘;**摸魚中** = 在線且有開著的事件。斷線不用通知任何人:心跳自然老化就下線了 —— 這正是別人要用 `onDisconnect` 才做得到的事,用一個時間戳比較做掉。

這樣整個階段沒有 Realtime 訂閱、沒有 `onDisconnect`、沒有 websocket 生命週期。**也因此不用 Firebase** —— 它唯一比 Supabase 強的地方(`onDisconnect` 在線偵測)被這個設計繞過了,而聚合查詢和「同組看得到彼此」用 Postgres + RLS 反而更好寫。

**三張表:**

```
profiles(user_id pk, handle, team_code, last_seen_at)   -- 暱稱與分組。不存真名、不存公司
slack_events(id pk, user_id, team_code,                 -- Phase 2 那張表多了 user_id
             started_at, ended_at null)                 -- 開始時 insert(ended_at null),結束時 update 補上
reactions(id pk, event_id, from_user, emoji, created_at) -- 只有 emoji,沒有自由文字
handle 上 check (char_length <= 20) —— 唯一的使用者輸入字串,長度在 DB 層鎖死
```

「append-only」修正為「**單寫者**」:為了讓同事看得到「摸魚中」,事件改成開始就 insert、結束 update 同一列補 `ended_at`。合併不變性沒破 —— 每一列只有建立它的裝置會寫它,跨使用者仍是純聯集,一樣不需要合併邏輯。

**排行榜比時數,永遠不比錢。** 這不是口味,是隱私設計:算錢需要月薪,而月薪只存在各自的 localStorage,**永遠不上傳**——schema 裡沒有任何薪資欄位。「偷到多少錢」只在你自己的裝置上、用你自己的月薪算給你自己看。

**團隊怎麼圈**:一個 `team_code` —— 你們私下傳的一串亂碼(像房間代碼),誰有誰就在同一組。不做邀請、不做管理員、不做成員審核,那串碼本身就是成員資格。
- RLS 只讓你讀到同 `team_code` 的列;聚合查詢自動只算你讀得到的資料,排行榜天然只有你這組。
- `team_code` 刻意反正規化到 `slack_events` 上,讓 RLS 檢查是一次直接比對而不是 join。ponytail:v1 的 team_code 設一次不改,真要換組再處理改列的成本。

**起鬨只做 emoji,不做文字留言(已拍板)**:自由文字正是大家會把自己招出來的地方(「剛睡兩小時被老闆抓到 lol」),而且要處理長度、跳脫、XSS。emoji 反應拿到八成的樂趣、兩成的風險和工作量。要文字是之後的事。

**隱私是這階段的設計前提,不是加分項**(見 3.2):暱稱不綁真名、不存公司欄位、個人信箱登入。多人版把「別用公司信箱」從小提醒升級成硬規則 —— 這是一整個團隊、綁身分、有時間戳的摸魚紀錄,外流傷的是真人。

### Phase 3 驗證紀錄(2026-07-18)

Schema 已套用、RLS 經外部探測驗證:匿名 select 三張表回 `200 []`、匿名
insert 被 `42501` 打回。登入以 **Google OAuth 為主**(強制 `select_account`
防止順手登成公司 Workspace 帳號)、magic link 收合為備用 —— email 身分
相同時 Supabase 自動連成同一使用者,不會分裂帳號。OAuth 跳轉已實測到
Google 登入牆(consent 畫面顯示正確的 supabase callback)。

尚未被任何人測過的:第一次真人登入後的完整流程(取代號 → 組隊 → 第二
人加入 → 互相起鬨)。部署後記得把正式網址加進 Auth → URL Configuration。
免費內建 SMTP 每小時只有個位數封,magic link 省著用。

---

## Phase 4 — 2D 辦公室

需求:操作角色移動的 2D 辦公室。做法上最重要的三個決定:

**1. 不裝 Phaser,不裝任何遊戲引擎。** 格子地圖、十個以內的 avatar、上下左右走 —— DOM/CSS transform 加一張 render 出來的 SVG 地圖就夠了。引擎買到的是物理、資產管線、場景管理,這裡全用不到。地圖用 ASCII 字串手繪在 `map.ts` 裡,要改辦公室格局改字串就好,不需要地圖編輯器。

**2. 走位有語意,辦公室是現有狀態機的皮。** 走到茶水間或沙發 = `startSlacking()`,走回自己座位 = `stopSlacking()`,走廊中性(路過不誤觸)。沒有新增任何狀態 —— 辦公室只是把 Phase 2 那顆按鈕變成一個可以走進去的空間。計數器頁的按鈕照常運作,兩邊動同一個 store。

**3. 你的角色真的能走,同事的 avatar 由狀態擺位(v1 不同步走位)。** 接上 Phase 3 之後,同事顯示規則:上班中 → 站他的座位;摸魚中 → 站茶水間;離線 → 不顯示。資料就是排行榜同一套輪詢(30~60 秒一次),狀態變了 CSS transition 讓 avatar 自己走過去。逐格位置廣播是明確的升級路徑 —— Supabase Realtime broadcast、只播 zone 變化省訊息量 —— 但 v1 不做,因為「看到誰在茶水間」的樂趣九成來自狀態,不來自路徑。emoji 起鬨在辦公室裡 = 點同事 avatar 選 emoji,對方下次輪詢看到氣泡。

**v0(單人版,不需後端):** 你的角色 + 完整地圖 + 走位觸發摸魚,今天就能上線。鍵盤限定(WASD/方向鍵);手機 tap-to-move 等有人真的在手機上玩再說。老闆鍵照常蓋在辦公室上面。

### 建議砍掉的東西

**「偽裝殼裡的小玩意」(原 Q1 第四項)和「老闆鍵偽裝畫面」是同一件事的兩個版本。** 一旦你有了一個夠像的假 Excel,「在裡面塞一個遊戲」就是另一個專案了 —— 那是在做遊戲,不是在做薪水小偷。建議:偽裝殼只做「靜態的、看起來很忙」的假畫面,不做互動。想玩遊戲的話,那個分頁本來就可以開別的網站。

如果你堅持要做,那它是 Phase 5,而且要先想清楚是什麼遊戲 —— 遊戲本身的工作量會遠大於這整個專案。

### 待確認

你在 Q1 選了「其他」但沒填內容。那是什麼?先當作沒有。

---

## 2. 技術選型

### 核心

| 項目 | 選擇 | 理由 |
|---|---|---|
| 建置工具 | **Vite** | 靜態網頁的預設答案,`npm create vite@latest` 一行搞定 |
| 框架 | **React + TypeScript** | 無聊、面試官看得懂、生態最大。作品集用途下這是最安全的選擇 |
| 樣式 | **Tailwind CSS** | 偽裝殼要刻得像 Excel/VS Code,是大量很細的像素工。Tailwind 讓這件事快很多 |
| 狀態 | **Zustand** | 全域狀態只有「設定 + 摸魚紀錄」兩塊。一個 `create()` 就結束,沒有 provider 沒有 boilerplate |
| localStorage | **Zustand 的 `persist` middleware** | 零行程式碼。不要自己寫 `useEffect` 同步 localStorage |
| 同步後端 | **Supabase** | 靜態網頁 + BaaS = 不用養伺服器。Postgres 對「摸魚時間序列」的查詢比 Firestore 好寫太多 |
| 登入 | **Magic link(Email)** | 沒有密碼要處理、沒有 OAuth app 要註冊。最懶也最安全 |
| 測試 | **Vitest** | Vite 內建搭配,零設定 |

### 明確不裝的東西(以及什麼時候該裝)

| 不裝 | 為什麼 | 什麼時候補 |
|---|---|---|
| **React Router** | **偽裝功能主動排斥路由** —— 網址列出現 `/salary-thief` 是最大的破綻。整個 app 活在同一個 URL 上,畫面切換用一個 `useState` 就夠了 | 畫面超過 5 個,或你需要分享特定畫面的連結時 |
| 圖表庫 (Recharts / Chart.js) | 摸魚熱力圖就是一個 CSS grid 裡面塞 30 個方塊,大概 15 行。長條圖是 `height: X%` 的 div | 你想要 tooltip、多資料列、或縮放時。到時候裝 Recharts |
| 日期庫 (date-fns / dayjs) | Phase 0 只需要「今天上班時間 → 現在」。`Date` + `Intl.DateTimeFormat` 夠用 | Phase 2 要做週/月分組時再看。可能還是不用 |
| `uuid` 套件 | `crypto.randomUUID()` 是瀏覽器原生的 | 永遠不用 |
| `react-hotkeys-hook` | 老闆鍵只有一顆鍵。`window.addEventListener('keydown', ...)` 三行 | 熱鍵變成可自訂組合鍵時 |
| faker.js | 假資料是給人看一眼的,寫死 200 行假試算表內容就好,而且更像真的 | 永遠不用 |
| shadcn/ui、MUI | 設定頁只需要 `<input type="time">`、`<input type="number">`、`<dialog>` —— 全是瀏覽器原生的,而且 `<input type="time">` 在手機上還會叫出原生時間選擇器 | 原生元素真的不夠用時 |
| i18next | 見第 8 節,有零成本的預留做法 | Phase 4 |
| TanStack Query | Phase 3 的同步就是「登入時拉一次、改動時推一次」。用不到快取/重試/失效那一整套 | 你發現自己在三個地方手寫 loading state 時 |
| Redux | 不 | 不 |

### package.json 預期長相

```jsonc
// dependencies
"react", "react-dom", "zustand",
"@supabase/supabase-js"        // Phase 3 才裝

// devDependencies
"vite", "@vitejs/plugin-react", "typescript",
"tailwindcss", "@tailwindcss/vite",
"vitest"
```

不釘版本,`npm create vite@latest` 給什麼就用什麼。整個專案的執行期依賴目標是 **4 個以內**。

---

## 3. 會咬人的技術決定

這四個是這專案唯一真正需要想的地方,其他都是照抄。

### 3.1 錢的數字永遠從時鐘算出來,不要用 `setInterval` 累加

這是這個 app 最容易寫錯的地方。如果你寫 `setInterval(() => money += rate, 100)`,那麼:分頁切到背景時瀏覽器會把計時器降頻到每秒一次甚至更少、電腦睡眠時完全停掉、DST 換日時歪掉。使用者中午回來會發現自己少賺了兩小時。

正確做法是每次 render 都從當下時刻重新推導:

```ts
// src/money.ts
export function earnedToday(now: number, cfg: Config): number {
  const { start, end, dailyPay } = todayShift(cfg, now);
  if (now <= start) return 0;
  const worked = Math.min(now, end) - start;
  return (worked / (end - start)) * dailyPay;
}
```

`setInterval` 只負責「觸發重繪」,不負責算錢。這樣分頁降頻只會讓數字跳得比較卡,不會讓數字錯。**這個函式是整個專案唯一必須有測試的東西。**

### 3.2 Supabase 的 anon key 是公開的,擋住資料的是 RLS

靜態網頁的 anon key 一定會被使用者看到 —— 這是設計如此,不是漏洞。真正保護資料的是 Row Level Security policy:

```sql
alter table slack_events enable row level security;
create policy "own rows only" on slack_events
  for all using (auth.uid() = user_id);
```

**RLS 沒開 = 任何人都能讀所有人的摸魚紀錄。** 這是這個專案唯一不能偷懶的地方。Phase 3 第一件事就是開 RLS,在寫任何查詢之前。

另外提醒:登入用個人信箱,不要用公司信箱。理由你懂。

### 3.3 摸魚紀錄設計成 append-only,同步就不用寫合併邏輯

跨裝置同步最麻煩的是衝突。但如果摸魚紀錄是「append-only 的事件」而且 id 由 client 用 `crypto.randomUUID()` 產生,那就**結構上不會衝突** —— 兩台裝置各自新增的事件 id 不同,合併就是聯集,不需要 CRDT、不需要 vector clock、不需要任何合併程式碼。

設定(月薪、上下班時間)是單一列,用 `updated_at` 做 last-write-wins 就好。你不會同時在兩台電腦改月薪。

### 3.4 老闆鍵在純網頁裡有個天花板

分頁沒有 focus 的時候,網頁收不到鍵盤事件。所以熱鍵只在你正看著這個分頁時有效 —— 而那正是你最不需要它的時候。純靜態網頁做不到系統層級全域熱鍵,這是這個部署形式的硬限制。

在網頁能力範圍內能做的補償(都是免費的):

- **`blur` 時自動偽裝** —— 你 alt-tab 走開,這個分頁自己就變成 Excel 了。回來時才需要按鍵解除。這比熱鍵更實用。
- **換 `document.title` 和 favicon** —— 分頁標題寫著「薪水小偷」是比畫面本身更大的破綻。favicon 用 data URI 動態換掉。
- 網址列的破綻:見第 2 節不裝 router 的理由。

如果老闆鍵是你的主打功能,那 Chrome 擴充或 Tauri 才是對的載體,純靜態網頁只能做到「堪用」。你選了純靜態網頁,所以這裡的定位是彩蛋而不是賣點。

---

## 4. 資料模型

```ts
type Config = {
  monthlySalary: number;
  workdaysPerMonth: number;   // 預設 22
  shiftStart: string;         // "09:00" —— 直接吃 <input type="time"> 的值,不解析
  shiftEnd: string;           // "18:00"
  lunchStart: string;         // "12:00"
  lunchMinutes: number;       // 預設 60
};

type SlackEvent = {
  id: string;         // crypto.randomUUID()
  startedAt: number;  // epoch ms
  endedAt: number;
  tag?: string;       // "上廁所" / "滑手機" / "假裝開會"
};
```

時間一律存 epoch ms(數字),`shiftStart`/`shiftEnd` 存字串因為那就是原生 input 給你的格式。全部用使用者本地時區,不處理跨時區 —— 你不會邊搭飛機邊摸魚。

`lunchStart` 是實作時才發現需要的:只有 `lunchMinutes` 的話,你知道午休多長但不知道在哪,於是午休只能被「平均攤進整個班表」—— 等於午休也在付你錢,而且下班那一刻的總額會對不上日薪。給定實際的午休區間之後,計算就是一個區間相減,而且多一個免費的好處:**午休時金額會真的停住**,這比任何文案都更能說明「午休不算工時」。多這一個欄位換掉一整類的錯誤,划算。

Phase 3 的 Supabase schema 就是這兩個 type 各一張表,加 `user_id` 欄位和 RLS。

---

## 5. 檔案結構

```
src/
  main.tsx
  App.tsx           // useState 切畫面:counter | stats | settings | disguise
  store.ts          // zustand + persist
  money.ts          // 算錢的純函式(有測試)
  money.test.ts
  strings.ts        // 所有 UI 文字(見第 8 節)
  components/
    Counter.tsx
    Settings.tsx
    Heatmap.tsx     // CSS grid,不用圖表庫
    Disguise.tsx    // 假 Excel
  sync.ts           // Phase 3
```

沒有 `features/`、沒有 `domain/`、沒有 barrel file、沒有 `index.ts` 轉出。這個專案大概 15 個檔案就結束了,資料夾分層只會讓你多按幾次 Ctrl+P。

---

## 6. 測試

只測 `money.ts`。理由:那是唯一有分支、有邊界、而且錯了會讓整個 app 失去意義的地方(上班前、下班後、跨午休、剛好在邊界上)。

元件不測。E2E 不做。等 Phase 3 有登入流程要防止回歸時,再考慮加一支 Playwright 測 login → 同步 → 登出。

---

## 7. CI 與部署

一個 GitHub Actions 檔案:

```yaml
- run: npm ci
- run: npm run build
- run: npm test
```

部署用 **Cloudflare Pages 或 Vercel 的 git 整合** —— 接上 repo 就自動部署,不需要寫 deploy action、不需要管 secret。作品集要的「線上 demo 連結」直接就有了。

Phase 3 的 Supabase URL 和 anon key 放 build 時的環境變數(`VITE_` 前綴)。再次強調:這兩個值本來就是公開的,不是機密,保護資料的是 RLS。

---

## 8. i18n 的零成本預留

你說開源版本先保留、但之後補齊要容易。做法是:**現在不要裝 i18next,但也不要把中文字串散在 JSX 裡。**

所有 UI 文字集中在 `src/strings.ts`:

```ts
export const t = {
  todayEarned: "今天已賺",
  untilOffWork: "距離下班",
  bossKeyHint: "按 Esc 裝忙",
} as const;
```

用的時候 `{t.todayEarned}`。

之後要加英文時:這個檔案改名成 `locales/zh-TW.ts`、複製一份成 `en.ts`、加一個十行的 `useT()` hook 讀 `navigator.language`。**現在的成本是零行程式碼**,之後的成本是半小時。這比先裝 i18next 然後在 Phase 4 之前都在寫 `t('some.nested.key')` 划算得多。

同理,Phase 4 的其他項目(CONTRIBUTING.md、issue 範本、release 流程)都是純文件,沒有一項需要現在動架構去預留。等真的有第二個人想貢獻時再寫,那時候你也才知道要寫什麼。

---

## 9. 下一步

`npm create vite@latest . -- --template react-ts`,然後直接做 Phase 0。設定頁和計數器兩個畫面、一個 `money.ts`、一個測試檔,週末結束就能部署。
