# 薪水小偷

完整規範見 [CONTRIBUTING.md](CONTRIBUTING.md)。硬規則:

- 分層:算數 → src 根的純邏輯層(純函式+測試);狀態 → store.ts;IO → sync.ts / worker.js;畫面 → components/、office/。依賴單向,純邏輯層不 import React/網路/storage。
- Commit 用 conventional commits:`type(scope): 繁中主旨`。main 即生產(push = 部署),push 前 `npm test && npm run build` 必須全綠。
- 隱私鐵律:金額不上傳、DB 不存公司名、畫面不顯示日薪/每秒/已賺這類能反推月薪的數字。
- UI 字串進 locales/(zh-TW.ts 是型別來源);視覺規範見 .claude/skills/pixel-ui。
- 新依賴前先爬梯子:stdlib → 瀏覽器原生 → 既有依賴 → 自己寫幾行 → 才裝,並在 PLAN.md 記條件。
