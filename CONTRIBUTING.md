# 開發規範

> 一句話:最短能動的路徑。這個 repo 的每個「沒有」(router、圖表庫、日期庫、websocket)
> 都是決定不是疏忽,理由和「什麼條件下裝回來」記在 [PLAN.md](PLAN.md)。
> 加任何東西之前先爬梯子:真的需要存在?→ 既有程式碼有沒有?→ stdlib / 瀏覽器原生?
> → 既有依賴?→ 都沒有才寫新的。

## 檔案分層

採 bulletproof-react 的**原則**(單向依賴、邏輯與 UI 分離、按功能聚合),
不採它的資料夾結構 —— 20 個檔案的專案套 `features/` 三層是過度工程。

```
src/
  money.ts slack.ts team.ts companies.ts fmt.ts   ← 純邏輯層:純函式,每檔配 .test.ts
  store.ts             ← 本機狀態(zustand persist;唯一碰 localStorage 的地方)
  supabase.ts sync.ts  ← 網路層(唯一打網路的地方)
  strings.ts locales/  ← i18n(zh-TW.ts 是型別來源,en.ts 用 Strings 強制對齊)
  components/          ← 畫面,一個 view 一檔
  office/              ← 辦公室 feature(map + view 自成資料夾)
worker.js              ← 唯一 server 端程式(/gcis 同源轉發)
supabase/              ← schema 與 migration SQL
```

規則:

1. **依賴單向**:`components/`、`office/` → (純邏輯層、store、sync)。
   純邏輯層不 import React、不打網路、不碰 storage —— 所以測試不用 mock。
2. **寫新 code 前先分類**:這行是「算數」(純邏輯層)、「狀態」(store)、
   還是「IO」(sync / worker)?一個函式跨兩類就拆開。
3. **新資料夾門檻**:同一功能出現第 3 個檔案才開資料夾(office 是先例)。
   不做 barrel file(index.ts re-export)。src 超過 ~30 檔或出現第二個
   office 等級的 feature 時,再把 feature 資料夾升級為預設。
4. **UI 字串一律進 locales/**:先加 zh-TW.ts(型別來源),en.ts 少一個 key 編譯就失敗。
5. **樣式**:Tailwind + `index.css` 的 `px-*` 元件類;視覺方向見 `.claude/skills/pixel-ui`。
6. 匯出慣例:元件 default export,其他一律 named export(跟現況一致)。

## Commit 規範(Conventional Commits)

```
type(scope): 主旨(繁中、祈使句、≤50 字)

- body 條列「為什麼」與取捨,不重述 diff
```

- **type** 只用:`feat` `fix` `docs` `refactor` `test` `chore` `perf`
- **scope** 可省略;常用:`counter` `office` `team` `stats` `i18n` `sw` `db` `deploy` `worker`
- **破壞性變更**(DB schema、localStorage 格式):`type!` + body 加
  `BREAKING CHANGE:` 說明遷移方式
- 舊風格對照:「隱私:…」→ `feat(counter):`、「文件:…」→ `docs:`、
  「部署:…」→ `chore(deploy):`
- 一個 commit 一件事。**main 即生產**:push = 部署,
  所以 push 前 `npm test && npm run build` 必須全綠。

## 程式風格

- 註解寫**為什麼與取捨**,不寫「這行在做什麼」。刻意的簡化用 `ponytail:` 標記,
  內容要講出上限跟升級路徑(例:`// ponytail: 不支援跨夜班表,大夜班使用者出現再處理`)。
- **新依賴門檻**(現況 runtime 依賴 5 個):stdlib → 瀏覽器原生
  (`<input type="time">`、`<datalist>`、原生 `title` tooltip 都是先例)→
  既有依賴 → 幾行自己寫 → 都不行才裝,並在 PLAN.md 記下「什麼條件下換掉」。
- 金額/時間的顯示數字**永遠從時鐘重新推導**,絕不用 `setInterval` 累加
  (理由見 README「唯一有趣的技術決定」)。

## 測試

- 純邏輯層一檔配一 `.test.ts`(vitest)。不 mock 時鐘 —— 函式收時間戳,直接餵。
- **錢、時間、隱私、安全路徑**的分支一定要有測試。
- UI 不寫元件測試,用 dev server 實際點過驗證。
- 新的純函式 = 至少一個「邏輯壞掉就會失敗」的測試,不用追求覆蓋率。

## 隱私鐵律(不可妥協,review 檢查點)

1. **月薪與任何金額永遠不上傳**。DB 只存時數與事件;排行榜比時數不比錢。
2. **DB 不存公司名**:只存決定性導出的 uuid(目錄 slug 或統編);
   顯示名靠 client 目錄反查或本機 label。
3. **畫面不出現能直接讀出薪水的絕對值**(日薪、每秒、今日已賺)。
   金額只以「偷到的錢」形式出現 —— 路過瞄螢幕推不出月薪。
4. 暱稱不綁真名;跨公司統計 k-anon(≥5 人)且自訂公司永不具名。
5. **CSP connect-src 白名單**只有 self + supabase。新的外部服務一律走同源轉發
   (worker.js 的 `/gcis` 是先例),CSP 改動要同步兩份:
   `vite.config.ts` 與 `public/_headers`。

## 部署

- push main → Cloudflare Workers git 整合自動 build + deploy
  (dist 靜態資產 + worker.js)。線上版:https://salary-thief.r1382333.workers.dev
- SW 對頁面是 network-first:部署後使用者重整一次即生效,不用改快取版本;
  會被 SW cache-first 釘住的只有內容雜湊過的 assets(不可變,安全)。
  即時資料(supabase、/gcis)已排除,新增即時 API 時記得照做。
- DB 變更:`supabase/` 加 migration SQL,README 部署段記使用者要跑什麼。
