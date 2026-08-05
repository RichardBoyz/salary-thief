---
name: pixel-ui
description: 薪水小偷專案的像素風 UI 規範 —— p10k 深色終端機打卡機視覺方向、繁中像素字型、CSS 像素技法、動畫原則。改任何 UI 樣式、加新畫面、調整視覺時必讀。搭配 frontend-design(反模板)與 gsap-*(真的需要 tween 才用)。
---

# Pixel UI — 薪水小偷視覺規範

方向:**p10k 風深色終端機裡的打卡機**。不是 Game Boy、不是 NES 紅白機
—— 是工程師開一整天不傷眼的深色終端機。這個選擇來自主題本身:
app 假裝是辦公軟體,所以復古的是「辦公軟體」而不是「遊戲機」。

## 鐵律(違反 = 破壞產品)

1. **`Disguise.tsx`(假 Excel)永遠保持現代樣貌。** 偽裝殼的唯一工作是
   看起來像真的公司軟體,像素化它等於自爆。它不 import 全域 pixel 樣式
   之外的東西沒關係,但絕不套用像素字型、像素邊框、掃描線。
2. **老闆鍵切換瞬間不能有過場動畫。** 偽裝要快,tween 會害死使用者。
3. 隱私與資料規則不變(見 PLAN.md)—— 視覺改版不碰資料層。

## 字型

繁中像素字型用 **fusion-pixel-font**(TakWolf,SIL OFL,支援繁中),
12px proportional zh_hant 變體。像素字型只在**整數倍**尺寸下乾淨:
12 / 24 / 36 / 48px,text size 全部貼齊這些檔位,不要用 14px、20px 這種
會糊掉的尺寸。數字與金額可搭配等寬變體對齊。

**現行檔位**(v8,base 從 12 提到 24):內文 24px、密集區與徽章(團隊列、
熱力圖圖例、辦公室名牌)12px、標題 36px、主畫面大數字 48px(sm 以上 72px)。
Tailwind 的 `text-sm`(14)、`text-xs` 之外的預設檔位大多不在格上,**一律
寫成 `text-[24px]` 這種明確值**,不要用 `text-sm/lg/xl`。大數字刻意不跟著
內文翻倍——它本來就夠大,再翻一倍窄螢幕會爆版。唯一例外是 `Disguise.tsx`
(鐵律 1:假 Excel 要現代臉,不受這套檔位管)。

## CSS 像素技法

- **邊框**:2px 實線,**零 border-radius**。立體感用 Win3.1 斜角:
  `border-color: 亮 暗 暗 亮`(凸起),按下時反轉(凹陷)。
- **陰影**:硬位移零模糊 `box-shadow: 3px 3px 0 <深色>`,絕不用 blur。
- **縮放點陣圖 / SVG 圖塊**:`image-rendering: pixelated`。
- **進度條**:分段方塊(repeating-linear-gradient 或格子),不要平滑漸層。
- **掃描線**:全螢幕 overlay,repeating-linear-gradient,透明度 ≤ 0.06,
  `pointer-events: none`。這是氛圍不是主角。
- 調色盤紀律:全 app ≤ 7 色(定義在 index.css 的 @theme),新 UI 不准
  引入盤外顏色。

## 動畫

- **CSS `steps()` 優先** —— 像素風的動作本來就該一格一格跳,這正是
  steps() 的語意,免費且免依賴。游標閃爍、精靈步伐、打字機效果都是它。
- 真的需要 tween/timeline(彈性、物理、複雜編排)才用 GSAP —— skills
  已裝(gsap-core / gsap-react / gsap-timeline),npm 套件**等真的要用
  才裝**,不要因為 skill 在就先裝。
- 尊重 `prefers-reduced-motion`;辦公室走位與金額跳動是功能不是裝飾,
  可保留,裝飾性動畫要能關。

## 已像素化 / 不像素化清單

- 像素化:計數器、設定、摸魚報告、團隊、辦公室的「介面外框」。
- 辦公室地圖(`office/map.ts` 的 SVG tiles)本來就是像素邏輯,配色要跟
  @theme 的盤一致。
- 不像素化:Disguise.tsx(見鐵律)、分頁 title/favicon 的偽裝行為。
