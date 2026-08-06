// 8-bit 角色。ASCII 手繪,跟 map.ts 同一個慣用法:要改角色就改字串,
// 不需要美術工具、不需要圖檔、不需要 sprite sheet 產生器。
//
// 為什麼不用 PNG sprite sheet 當 background-image(那是最常見的做法):
// 圖檔裡的顏色是死的,而這個 app 有深/亮兩套主題共用一組 CSS 變數。畫成
// inline SVG 才能讓角色跟著換色 —— 亮色主題下深色頭髮要變、襯衫要變。
// 代價是多一些 DOM 節點,用同色橫向合併(runs)壓到每格約 20 個 rect。

/** 一個 sprite 像素在畫面上的大小。TILE=32,角色 12×14 格 → 24×28px */
export const PIXEL = 2;

export const SPRITE_W = 12;
export const SPRITE_H = 14;

/**
 * 調色盤代號 → CSS 變數。**只用 @theme 那 7 色**,不引進盤外顏色
 * (pixel-ui 紀律)。皮膚借用金色 —— 在這個色盤裡它是唯一的暖色。
 */
export const SPRITE_COLORS: Record<string, string> = {
  h: "var(--color-crt-deep)", // 頭髮
  e: "var(--color-crt-deep)", // 眼睛
  o: "var(--color-crt-deep)", // 鞋
  s: "var(--color-crt-gold)", // 皮膚
  b: "var(--color-crt-white)", // 襯衫
  p: "var(--color-crt-dim)", // 褲子
};

/**
 * 三格:站著、走路 A(兩腳張開)、走路 B(兩腳併攏)。
 * 「.」是透明。每一列必須剛好 SPRITE_W 個字元 —— sprite.test.ts 會擋。
 *
 * 走路只換下半身:8-bit 的走路辨識度九成來自腳,手臂多畫兩格換不到什麼,
 * 卻要多維護兩份圖。
 */
const IDLE = [
  "............",
  "....hhhh....",
  "...hhhhhh...",
  "...hssssh...",
  "...hesseh...",
  "....ssss....",
  "...bbbbbb...",
  "..sbbbbbbs..",
  "..sbbbbbbs..",
  "...bbbbbb...",
  "....pppp....",
  "....pppp....",
  "....pp.p....",
  "...oo..oo...",
];

const WALK_A = [
  ...IDLE.slice(0, 10),
  "....pppp....",
  "...pp..pp...",
  "...pp..pp...",
  "..oo....oo..",
];

const WALK_B = [
  ...IDLE.slice(0, 10),
  "....pppp....",
  "....pppp....",
  "....pppp....",
  "....oooo....",
];

export const FRAMES = [IDLE, WALK_A, WALK_B];

export type Run = { x: number; y: number; w: number; color: string };

/**
 * 一格 sprite → 橫向合併過的色塊。
 *
 * 不合併的話一個角色就是 168 個 rect,場上十個人就破千。合併同色連續格
 * 之後大約 20 個 —— 一個 for 迴圈換掉一個效能問題,不需要 canvas。
 */
export function runs(frame: string[]): Run[] {
  const out: Run[] = [];
  frame.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === ".") {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      out.push({ x, y, w, color: SPRITE_COLORS[ch] });
      x += w;
    }
  });
  return out;
}

/** 走路時的格子:踏一步換一格,所以腳步跟實際移動同步,不是各跑各的 */
export const walkFrame = (step: number): number => 1 + (Math.abs(step) % 2);
