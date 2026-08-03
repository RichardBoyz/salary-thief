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
| **v2** | 公司 → 隊伍階層:隊伍對抗、排行榜切換、一隊一房串門子 | 是 | ✅ 遷移已跑(2026-07-31,schema→v3→v4→v5 全綠);真人流程待驗 |
| **Phase 5** | i18n(中英)、PWA(可安裝+SW+tap-to-move)、部署 | — | ✅ 全部完成,線上:salary-thief.r1382333.workers.dev(Workers static assets) |
| **v8** | 去薪水化 → 摸魚幣 → 全 app 登入 → 股市模擬 | 是 | 🔨 v8a 完成,v8b/v8c 進行中 |

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

## v2 — 公司 → 隊伍階層(2026-07-18)

使用者方向:一人一間公司,公司底下依部門開隊伍,隊伍互比、也能在隊內比;
辦公室一隊一房,可以去別隊房間串門子。落地時的四個決定:

**1. 公司沒有名字。** 「不存公司」是第一天就定的隱私硬約束,升級成階層也
不鬆動:公司在系統裡只是一個匿名邀請碼(uuid),UI 永遠不會問公司叫什麼。
RLS 邊界從隊伍升級成公司 —— 同公司互見,跨公司不存在。

**2. 隊伍是標籤,不是實體。** 沒有 teams 表:隊伍就是 profiles 上一個
text 欄位(DB check 鎖 20 字),隊伍清單 = 同公司 distinct team。開隊 =
打一個新名字,加入 = 選既有的(datalist)。打錯字會多一隊,重選一次就修好
—— 這個代價換掉一張表、一組 policy、一套建隊/解散流程。

**3. 事件不記隊,歸屬看人現在的隊。** 換組歷史帶著走(「我的摸魚跟著我」),
也免掉入隊時 backfill 隊伍欄位。隊伍對抗比**人均**不比總量,不然大隊躺贏。

**4. 串門子 v1 是旁觀(👻)。** 你能走進別隊房間看誰在茶水間,但他們看不
到你、你的走位也不觸發摸魚(別隊的茶水間不是你的茶水間)。「讓對方看到你
來串門子」需要多同步一個 visiting 欄位 —— 明確的升級路徑,等有人想要再做。

**遷移(migrate-v2.sql,SQL Editor 跑一次):** 三張表的 team_code 直接
rename 成 company_code —— **既有的「隊伍」原地變成「公司」**,成員關係和
歷史零損失,大家之後在團隊頁各自選隊就好。v1 的 my_team() 函式本體字串寫
著舊欄名,所以 select policy 整組 drop 重建;insert/update policy 只看
auth.uid(),不受影響。

---

## v3 — 魚點:伺服器排程的隨機摸魚區塊(2026-07-18)

需求:辦公室隨機出現有時限的區塊,站進去才算摸魚;隨機機制要防 API 竊取
和資料竄改,使用者提議「伺服器用該使用者的種子產生」。

**採用並強化:光藏種子不夠。** 排行榜的攻擊面是「拿自己的 JWT 直接對 API
寫假資料」,跟亂數猜不猜得到無關。落地成三層(supabase/migrate-v3.sql,
全部經 PGlite 真 Postgres 引擎 18 項驗證):

1. **種子在 `private` schema** —— PostgREST 只暴露 public,API 永遠拿不到。
   時刻表 = `md5(secret‖user‖day‖n)` 決定性導出,不用存,永遠可重算驗證。
   client 只能透過 `my_spots()`(security definer,內部 `auth.uid()`)看
   自己今天的表;直接呼叫 `spot_schedule()` 已 revoke。
2. **合法性由 insert 當下的伺服器時鐘判。** trigger 重算時刻表,要求
   `now()` 落在該視窗內,`caught_at` 由伺服器蓋章。就算逆向出整份時刻表
   也沒用 —— 你必須在視窗開著的當下打 API;事後補寫、改時間戳、預先囤積
   全部被擋。這是比「種子保密」強一級的保證。
3. **寫進去就不能動**:`unique(user, day, spot)` 防重複,沒有 update/
   delete policy(RLS 讓竄改掃到 0 列),冒名寫入被 with check 擋。

一天 8 個魚點、台北時區 09:00–17:49 開窗、一窗 10 分鐘。**地圖位置是純
裝飾**(r1/r2 由 client 對地板格取模)—— 可驗證的核心是時間,位置本來就
無法證明,所以不用防。摸魚時數維持自報(改不掉的事實:網頁遊戲裡「人在
不在」本來就是 client 說了算),**🐟 漁獲是唯一伺服器擔保的數字**,排行榜
兩個都show。站上魚點同時觸發一般摸魚(它就是一塊會移動的茶水間)。

沒登入 = 沒有魚,辦公室其餘照舊;沒跑 v3 遷移 = RPC 404 → 靜默無魚。
魚點只在自己房間出現,串門子看不到別人的魚。

**遷移已於 2026-07-31 跑完**(全新專案的順序是 schema.sql → v3 → v4 → v5;
`migrate-v2.sql` 只給既有 v1 專案改欄名,schema.sql 本身已是 v2 形狀,在空 DB
上跑它會報 42P01)。完整對照表見 README 部署段。

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

## v5 — 真實公司目錄 + 在職/離職(2026-07-18)

使用者想要「像比薪水那樣選真實公司加入、標在職/離職、統計各公司摸魚」。
這翻轉了「不存公司」的原始硬約束,所以先跟使用者確認方向,選了**真實目錄
+ 維持匿名**(個人層匿名不動,公司層改真實)。落地的隱私設計:

**1. 公司名在 client,不在 DB。** 目錄是 `companies.ts` 一份 ~36 家台灣知名
公司的靜態清單。加入時選公司 → 房間鍵 `company_code = slugToUuid(slug)`
決定性導出(兩個同事各自選台積電就同房,免傳碼)。**DB 仍只存 uuid、不存
公司名** —— 外洩看不出是哪家公司。自訂公司的顯示名只記在本機 localStorage
(`companyLabel`),永不上傳。

**2. 只有目錄公司能被具名。** 跨公司統計裡,`isDirectoryCompany()` 為真的
才顯示真名,自訂公司即使湊滿門檻也只顯示「其他公司」。等於**我用這份目錄
控制了哪些公司可能被公開具名**,任意公司不會被隨便掛上摸魚數字。

**3. 跨公司統計是 k-anon 聚合,不是點名榜。** `company_rankings()` RPC
(security definer 繞過 RLS)**只吐成員數 ≥ 5 的公司、只吐聚合、不吐任何
個人列**,且只給登入者(不 grant anon)—— app 內比較,不是對外羞辱榜。
防灌水:每人對公司總和的貢獻 `least(user_sum, 本週流逝)` 夾住,配合 v4 的
單筆 ≤24h,單人無法把公司灌爆。離職者(`employment='former'`)不列入。

**4. 在職/離職自報。** `profiles.employment`,DB check 鎖白名單。誠實標示
是**自報不是驗證** —— 真驗證要公司信箱,那違反「不用公司信箱」原則。

migrate-v5-company.sql 經 PGlite 10 項驗證(k-anon 門檻藏小公司、離職者
排除、單人灌水被夾、anon 不可呼叫、RPC 不吐個人欄位)。個人層匿名不變:
暱稱、不綁真名、不用公司信箱、月薪永不上傳。

## v6 — 去薪水化、商工登記、外快區、邀請連結(2026-07-19)

一批使用者回饋落地,四個決定:

**1. 畫面去薪水化。** 主畫面/辦公室不再顯示今日已賺、日薪、每秒身價 ——
這三個數字任何一個都能讓路過瞄螢幕的同事直接讀出月薪。大數字改成「今天
已經偷到」(摸魚時長 × 時薪),旁格改今日/本週摸魚時長。已知取捨:盯著
跳動中的數字看幾秒仍可估時薪,但靜態一瞥推不出任何薪資絕對值。

**2. 公司搜尋接經濟部商工登記。** 內建目錄(~36 家)之外可搜全台核准設立
公司,房間鍵 `slugToUuid(統編)`(更名不換房)。gcis 不給 CORS,走同源
`/gcis` 轉發:prod 是 worker.js(唯一 server 端程式,只轉這一個 dataset、
快取 1 小時),dev 是 vite proxy。**具名規則不變**:登記公司在跨公司統計
仍顯示「其他公司」,能被具名的只有目錄清單 —— 目錄仍是唯一的具名白名單。

**3. 外快區(辦公室)。** 2×2 綠框每 10 分鐘決定性換位,站進去以時薪累積
「外快」,補血包十字 steps() 往上飄。跟魚點的關鍵差異:**錢永遠不上傳,
沒有作弊對象,所以不需要伺服器種子** —— 純本機、免登入。存毫秒不存錢,
錢照舊即時換算。

**4. 房間邀請連結。** 自訂公司靠「打同名」同房太碰運氣,補上
`#join=<uuid>&n=<名>` 邀請連結:hash 不進任何 server log(連自家 worker
都看不到),名字只用來設收件人的本機顯示標籤,DB 仍不存公司名。邀請
persist 過 OAuth 轉跳來回;hash 是不可信輸入,uuid 驗格式、名字截 30 字。
另補手機偽裝逃生口:快速點兩下解除(手機沒有 Esc;只解除、不進入,
避免連點誤觸)。

## v7 — 錢全遊戲化 + 亮色主題 + 新手教學(2026-07-20)

**1. 偷到的錢全遊戲化(使用者拍板,breaking)。** 使用者兩度反映「按鈕計
錢太籠統,真的摸魚不知道」。錢改成只來自**外快區站立 + 漁獲獎勵**(一條魚
= 15 分鐘時薪);摸魚計時降級為純時數(報告熱力圖、團隊排行榜)。取捨:
主畫面的計時按鈕不再有金額回饋(時長格照跳),換來「錢要親自到辦公室賺」
的真實感。統計頁「偷到的錢」改名「摸魚換算」保留時數×時薪參考。gameMoney
在 money.ts,照舊存毫秒不存錢、金額永不上傳。

**2. 亮色主題 = Win3.1 復古灰。** 同一套 7+1 色變數在 `[data-theme=light]`
換值,元件零改動。多的那格 `crt-hi`(斜角亮邊):深色下與主文字同色,
亮色下文字變深、亮邊必須維持真亮,不能共用。掃描線亮色不掛;偽裝殼不用
調色盤變數,「永遠現代 Excel」鐵律不受影響。預設仍深色。

**3. 使用說明 / 新手教學(v6 後補)。** 內建七節說明頁,首次開啟自動顯示
(helpSeen persist),主畫面「說明」隨時叫回。不裝導覽套件:四個畫面的
app 用 spotlight tour 是過度工程,現代 tooltip 也打壞像素臉。

**4. 遊戲化的兩個收尾(v7 後補)。** 錢遊戲化後留的接縫補上:(a) 首頁
「開始摸魚」從只計時改成「計時 + 直接進辦公室」,把按鈕接上綠框動線,
不然按了大數字不動很怪。(b) 邀請流程:點連結直接導向團隊頁的加入提示
(mount effect 保證,persist 補水時序在首次載入不穩),連結帶邀請人暱稱
(`h=`,截 20 字,本就是公開排行榜暱稱)顯示「<暱稱> 邀請你加入 <房間>」;
未登入先看到邀請人+房間再要求登入。手機手動老闆鍵、清除本機資料也在此波。

## v8 — 去薪水化 + 摸魚幣 + 股市模擬(2026-08-02)

使用者想加股市投資模擬。規劃時撞出兩個衝突,解法收斂成同一個決定:
**把薪水整個拿掉,遊戲經濟一律用摸魚幣(點數)。**

**衝突 1:真實股價 × 存時間不存錢。** 股票是台幣計價、成本固定;而「偷到的
錢」是 `zoneMs × 時薪` 即時換算的,使用者調一次月薪整個歷史就重算。兩者混
在同一個帳戶,改月薪會讓持倉沒動但現金變負數。

**衝突 2:防作弊 × 隱私鐵律。** 要防止竄改持倉就得把餘額放進 DB;但餘額從
時薪導出 → DB 上就出現能反推月薪的數字,撞死第 1 條鐵律。

**解法:摸魚幣跟收入脫鉤(固定 10 點/分、一條魚 150 點)。** 點數不含任何
薪資資訊,可以放心上 DB,同時解掉兩個衝突,而且剛好就是之後儲值贊助需要
的幣別 —— 不用維護兩套錢包。使用者據此拍板:**整個 app 拿掉薪水、全 app
強制登入。**

**誠實的限制(規劃時就講清楚,不要之後才發現):** 點數上 DB 防的是「竄改
持倉與餘額」,不是「多賺點數」。站綠框跟摸魚時數一樣是 client 自報,伺服器
無從驗證(v3 就寫過:網頁遊戲裡人在不在本來就是 client 說了算)。壓制自報
收入只能靠夾制 —— 每日上限 = 伺服器時鐘認定的已流逝上班時間,手法沿用
`migrate-v5-company.sql` 的 `least(user_sum, elapsed)`。

分四段,每段都能停在可上線狀態:

| 段 | 內容 | 後端 | 狀態 |
|---|---|---|---|
| **v8a** | 去薪水化:刪月薪與所有時薪換算,金額全改摸魚幣(先存本機) | 無 | ✅ 完成 |
| **v8b** | 全 app 強制登入 + 點數上 DB(自報收入伺服器夾制) | 一份 SQL | ✅ 程式碼完成,**等使用者跑 `migrate-v8-points.sql`** |
| **v8c** | 股市模擬:5 檔、買/賣、損益、伺服器定價 | SQL + 排程 | 🔨 |
| **v8d** | 儲值贊助 | 金流平台 | 未排 |

**v8a 刪掉的東西**:`Config.monthlySalary`、`workdaysPerMonth`、`earnedToday`、
`ratePerSecond`、`gameMoney`、`Shift.dailyPay`、`slack.ts` 的 `stolenMoney`、
設定頁兩個欄位、Stats 的「摸魚換算」格、Team 的「以你的時薪換算」。
`earnedToday / dailyPay` 塌成一個 `progress()`(分母消失後,分子自己就是進度)。
`points(zoneMs, fishes)` 是純函式、無 Config、永遠整數,10 點/分 = 1 點/6 秒
所以數字不會呆著不動。persist 升到 version 1,migrate 把舊使用者的月薪真的
從 localStorage 刪掉 —— 不然「app 不知道你的薪水」是假的。

**v8b 落地細節**:點數表沒有 insert/update/delete policy —— client 完全不能
直接寫,唯一入口是 `sync_zone_points()`(security definer,內部 `auth.uid()`)。
client 每分鐘送「今天的總量」而不是增量:重送、漏送、順序亂掉都不會算錯,
失敗也不需要補償邏輯。歸零(使用者拍板):persist 升 version 2 時把本機
`zoneMs` 清掉,不把 client 自報的餘額當起始值搬上去,省掉一次性作弊窗口。
登入閘門直接復用團隊頁(登入 UI 本來就在那,邀請流程本來也得在登入前跑
一段);`useSession` 因此要分辨 `undefined`(還在問)與 `null`(確定沒登入),
不然已登入的人每次開頁都會先閃一下登入畫面。

**摸魚幣上排行榜 + 兩本帳分離(使用者拍板,2026-08-03)**:`standings()` 多
一個 `points` 欄(本週 `zone_points` 加總 + 漁獲 × 150),名次仍然比時數 ——
點數是「伺服器認可你真的賺到多少」,不是名次本身。

關鍵決定是**收入帳與資產帳永遠分開**:偷到的摸魚幣一本、股市資產一本,
排行榜只顯示前者。理由不是分類漂亮,是**可稽核** —— 分開才有一條查得動的
不變式:**資產 ≤ 累積偷到 + 交易損益**。合併之後差額從哪來就永遠查不出來,
作弊也就驗不出來。已寫進 CONTRIBUTING 硬規則,不要有人把兩個數字加起來。

**v8c 待驗證(還沒做,不擋 v8a/b)**:伺服器定價需要有東西定時把台股報價寫
進 DB,傾向 `pg_cron` + `pg_net`(不新增 secret、不改部署流程),但要先確認
Supabase 出口打得到證交所 API。報價走 worker.js 同源轉發(`/gcis` 是先例),
**CSP 完全不用改**。台股只有平日 09:00–13:30 會動,收盤後顯示收盤價、不假
裝跳動;用真實標的的畫面要標「模擬,非投資建議」。

## 9. 下一步

`npm create vite@latest . -- --template react-ts`,然後直接做 Phase 0。設定頁和計數器兩個畫面、一個 `money.ts`、一個測試檔,週末結束就能部署。
