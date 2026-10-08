// 家具。跟角色同一套:ASCII 手繪、一格 16 像素、畫面上放大 2 倍。
// 家具跟角色必須是同一個像素密度 —— 舊版家具用螢幕像素畫、角色用 2 倍像素,
// 兩種顆粒擺在一起就是「拼貼感」的來源。
//
// 每件家具底部對齊它那一格的底邊,往上可以超出一格(螢幕、盆栽、書櫃)。
// 超出的部分會蓋住後一排的人 —— 這正是深度排序要的效果。

/** 一格幾個 art 像素。畫面上一格 = TILE 螢幕像素 = ART × PIXEL */
export const ART = 16;

export type Prop = {
  art: string[];
  /** 動畫:代號 → class。同 class 的色塊包在同一個 <g>,整組一起動 */
  anim?: Record<string, string>;
};

const DESK = [
  "..kkkkkkkkkkkk..",
  "..kMMMMMMMMMMk..",
  "..kMnnnnnMMMMk..",
  "..kMnnnMMMMMMk..",
  "..kMnnnnnnMMMk..",
  "..kMMMMMMMMMMk..",
  "..kkkkkkkkkkkk..",
  "kkkkkkkggkkkkkkk",
  "kddddddggddddddk",
  "kdddddggggdddddk",
  "kddddddddddddddk",
  "kddKKKKKKKKduudk",
  "kddjjjjjjjjdUUdk",
  "kddddddddddddddk",
  "kDDDDDDDDDDDDDDk",
  "kffffffffffffffk",
  "kFFFFFFFFFFFFFFk",
  "kkkkkkkkkkkkkkkk",
  "kfk..........kfk",
  "kFk..........kFk",
  "kkk..........kkk",
  "................",
];

const PLANT = [
  ".....kkkkkk.....",
  "...kkYYLLLLkk...",
  "..kYYLLLLLLLVk..",
  ".kYLLLLVLLLLLVk.",
  ".kLLLVLLLLLVLLk.",
  "kYLLLLLLVLLLLLVk",
  "kLLVLLLLLLLVLLLk",
  "kLLLLLVLLLLLLVLk",
  "kVLLLLLLLVLLLLVk",
  ".kLLVLLLLLLLVLk.",
  ".kVLLLLVLLLLVVk.",
  "..kVVLLLLLVVVk..",
  "...kkVVVVVVkk...",
  "...kkkkkkkkkk...",
  "...kqqqqqqqqk...",
  "...kTTTTTTTQk...",
  "....kTTTTTQk....",
  "....kTTTTTQk....",
  "....kTTTTTQk....",
  "....kQQQQQQk....",
  ".....kkkkkk.....",
  "................",
  "................",
  "................",
];

const COOLER = [
  ".....kkkkkk.....",
  "....kbbBBBBk....",
  "....kbBBBBBk....",
  "....kbBBBBBk....",
  "....kbBBBBBk....",
  "....kBBBBBBk....",
  "....kBBBBBBk....",
  ".....kkBBkk.....",
  "...kkkkkkkkkk...",
  "...kWWWWWWWwk...",
  "...kWRWWWWiwk...",
  "...kWkWWWWkwk...",
  "...kWWWWWWWwk...",
  "...kWggggggwk...",
  "...kWWWWWWWwk...",
  "...kWWWWWWWwk...",
  "...kWWWWWWWwk...",
  "...kWWWWWWWwk...",
  "...kWWWWWWWwk...",
  "...kWWWWWWWwk...",
  "...kWWWWWWWwk...",
  "...kWWWWWWWwk...",
  "...kWWWWWWWwk...",
  "...kwwwwwwwwk...",
  "...kkkkkkkkkk...",
  "................",
];

const COFFEE = [
  "....kkkkkkkk....",
  "....kxxxxxxk....",
  "....kxRxxNxk....",
  "....kxxxxxxk....",
  "....kXXXXXXk....",
  "....kXkkkkXk....",
  "....kXkGGkXk....",
  "....kXkuukXk....",
  "kkkkkXkUUkXkkkkk",
  "kdddkXXXXXXkdddk",
  "kdddkkkkkkkkdddk",
  "kddddddddddddddk",
  "kDDDDDDDDDDDDDDk",
  "kffffffkkffffffk",
  "kffffffkkffffffk",
  "kfffffgkkgfffffk",
  "kffffffkkffffffk",
  "kffffffkkffffffk",
  "kffffffkkffffffk",
  "kFFFFFFkkFFFFFFk",
  "kkkkkkkkkkkkkkkk",
  "................",
  "................",
  "................",
];

const SOFA = [
  "...kkkkkkkkkkkkkkkkkkkkkkkkkk...",
  "..kAAAAAAAAAAAAAAAAAAAAAAAAAAk..",
  "..kAeeAAAAAAAAAAAAAAAAAAAAAAAk..",
  "..kAAAAAAAAAAAAAAAAAAAAAAAAAAk..",
  "..kaaaaaaaaaaaaaaaaaaaaaaaaaak..",
  "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
  "kAAkeeeeeeeeeeekkeeeeeeeeeeekAAk",
  "kAAkAAAAAAAAAAAkkAAAAAAAAAAAkAAk",
  "kAAkAAAAAAAAAAAkkAAAAAAAAAAAkAAk",
  "kAAkAAAAAAAAAAAkkAAAAAAAAAAAkAAk",
  "kaAkaaaaaaaaaaakkaaaaaaaaaaakaAk",
  "kaakkkkkkkkkkkkkkkkkkkkkkkkkkaak",
  "kaaaaaaaaaaaaaaaaaaaaaaaaaaaaaak",
  "kaaaaaaaaaaaaaaaaaaaaaaaaaaaaaak",
  "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
  "..kk........................kk..",
  "................................",
  "................................",
  "................................",
  "................................",
];

const SHELF = [
  "kkkkkkkkkkkkkkkk",
  "kffffffffffffffk",
  "kfGGGGGGGGGGGGfk",
  "kfG1GG3GGGG5GGfk",
  "kf11G33G44G55Gfk",
  "kf112333445552fk",
  "kf112333445552fk",
  "kf112333445552fk",
  "kFFFFFFFFFFFFFFk",
  "kfGGGGGGGGGGGGfk",
  "kfGGG44GGGGGGGfk",
  "kf22G441133G55fk",
  "kf223441133455fk",
  "kf223441133455fk",
  "kf223441133455fk",
  "kFFFFFFFFFFFFFFk",
  "kfGGGGGGGGGGGGfk",
  "kfGGGGGGGG2GGGfk",
  "kfwwwwGG3G22G1fk",
  "kfwwwwG33122G1fk",
  "kfwwwwG33122G1fk",
  "kfWWWWG33122G1fk",
  "kFFFFFFFFFFFFFFk",
  "kffffffkkffffffk",
  "kfffffgkkgfffffk",
  "kffffffkkffffffk",
  "kffffffkkffffffk",
  "kFFFFFFkkFFFFFFk",
  "kkkkkkkkkkkkkkkk",
  "................",
  "................",
  "................",
];

const PRINTER = [
  "..kkkkkkkkkkkk..",
  "..kwwwwwwwwwwk..",
  ".kkkkkkkkkkkkkk.",
  ".kWWWWWWWWWWWWk.",
  ".kWWWWWWWWWNWWk.",
  ".kWWWWWWWWWWWWk.",
  ".kWGGGGGGGGGGWk.",
  ".kWWWWWWWWWWWWk.",
  ".kwwwwwwwwwwwwk.",
  ".kkkkkkkkkkkkkk.",
  "..kffffffffffk..",
  "..kfkkkkkkkkfk..",
  "..kfk......kfk..",
  "..kFk......kFk..",
  "..kFk......kFk..",
  "..kkk......kkk..",
  "................",
  "................",
  "................",
  "................",
];

/** 椅子:畫在每張桌子正下方那格(含你的座位)。純裝飾,不擋路 */
export const CHAIR = [
  "................",
  "...kkkkkkkkkk...",
  "...kHHHHHHHHk...",
  "...kHHHHHHHHk...",
  "...kHHHHHHHHk...",
  "..kkkkkkkkkkkk..",
  "..kOOOOOOOOOOk..",
  "..kOOOOOOOOOOk..",
  "..kooooooooook..",
  "..kkkkkkkkkkkk..",
  "......kXXk......",
  "....kkkXXkkk....",
  "...kXXXXXXXXk...",
  "...kXkkkkkkXk...",
  "...kk......kk...",
  "................",
];


/** 咖啡桌(休息室)。圓桌面 + 單腳,桌上一杯咖啡 */
const TABLE = [
  "................",
  "................",
  "................",
  "................",
  "....kkkkkkkk....",
  "..kkddddddddkk..",
  ".kddddduudddddk.",
  ".kddddUUUUddddk.",
  ".kDddddddddddDk.",
  "..kkDDDDDDDDkk..",
  "....kkkkkkkk....",
  "......kffk......",
  "......kffk......",
  "......kFFk......",
  "......kFFk......",
  "....kkkFFkkk....",
  "...kFFFFFFFFk...",
  "...kkkkkkkkkk...",
  "................",
  "................",
];

/** 販賣機(休息室)。玻璃窗裡一排排飲料,右邊投幣面板的燈會閃 */
const VENDING = [
  "..kkkkkkkkkkkk..",
  "..kRRRRRRRRRRk..",
  "..kRwwwRRRRRRk..",
  "..kRRRRRRRRRRk..",
  "..kkkkkkkkkkkk..",
  "..kGGGGGGGkxxk..",
  "..kG1G2G3GkxNk..",
  "..kG1G2G3Gkxxk..",
  "..kGGGGGGGkxxk..",
  "..kG4G5G1Gkxxk..",
  "..kG4G5G1Gkxxk..",
  "..kGGGGGGGkxxk..",
  "..kG2G3G4GkxRk..",
  "..kG2G3G4Gkxxk..",
  "..kGGGGGGGkxxk..",
  "..kbGGGGGGkxxk..",
  "..kkkkkkkkkxxk..",
  "..kRRRRRRRRRRk..",
  "..kRRRRRRRRRRk..",
  "..kRkkkkkkkkRk..",
  "..kRkGGGGGGkRk..",
  "..kRkkkkkkkkRk..",
  "..kRRRRRRRRRRk..",
  "..kaaaaaaaaaak..",
  "..kkkkkkkkkkkk..",
  "................",
  "................",
  "................",
];

/** 高腳椅:咖啡桌左右那兩格。純裝飾、不擋路,站上去就像坐著 */
export const STOOL = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....kkkkkk.....",
  "....kHHHHHHk....",
  "....kOOOOOOk....",
  ".....kkkkkk.....",
  ".......kk.......",
  ".......kk.......",
  "......kXXk......",
  ".....kkkkkk.....",
  "................",
];

/**
 * 地圖代號 → 家具。茶水間那兩格 C:左邊飲水機、右邊咖啡機(Scene 依左鄰決定)。
 * 沙發跨兩格,只在最左那格畫一次。
 */
export const PROPS: Record<string, Prop> = {
  D: { art: DESK, anim: { M: "px-screen" } },
  P: { art: PLANT, anim: { Y: "px-plant", L: "px-plant", V: "px-plant" } },
  C: { art: COOLER },
  c: { art: COFFEE, anim: { N: "px-led" } },
  S: { art: SOFA },
  B: { art: SHELF },
  R: { art: PRINTER, anim: { N: "px-led" } },
  T: { art: TABLE },
  V: { art: VENDING, anim: { N: "px-led" } },
};

/** 家具調色盤。跟角色共用描邊色 —— 同一個世界的東西要有同一條輪廓線 */
export const PROP_COLORS: Record<string, string> = {
  k: "#1d1720",
  // 木頭:桌面、櫃子
  d: "#b0835a",
  D: "#8d6442",
  f: "#7b5637",
  F: "#5e4029",
  // 螢幕
  M: "#5bb7ea",
  n: "#c4ecff",
  g: "#6b7080",
  G: "#2c2a33",
  K: "#dcd8cf",
  j: "#a9a49a",
  u: "#ece8df",
  U: "#bdb7aa",
  // 盆栽
  Y: "#8fce6f",
  L: "#5aa45a",
  V: "#3c7a42",
  q: "#d98a5c",
  T: "#c0704a",
  Q: "#93512e",
  // 飲水機 / 咖啡機 / 印表機
  b: "#bfe8fb",
  B: "#7cc8f0",
  W: "#e6e3dc",
  w: "#b8b4ab",
  R: "#e0625f",
  i: "#4d7fd6",
  N: "#8fe07a",
  x: "#5a5562",
  X: "#3a3640",
  // 沙發
  A: "#c4564f",
  a: "#93393a",
  e: "#d9776d",
  // 椅子
  H: "#3e4558",
  O: "#55607a",
  o: "#3b4357",
  // 書背
  "1": "#c4564f",
  "2": "#4d7fd6",
  "3": "#e2b23f",
  "4": "#5ea95a",
  "5": "#8a69cc",
};

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * 每張地圖的「佈置」:牆上掛什麼、地板怎麼分區。純視覺 —— 不影響碰撞與任何
 * 遊戲判定,所以不進 map.ts。單位都是格;窗戶與冷氣各佔 2 格寬,填的是左邊那格。
 * 位置要避開會往上長進牆面的家具(書櫃、販賣機、飲水機)。
 */
export type SceneDef = {
  windows: number[];
  clock: number;
  ac: number | null;
  /** 磁磚地板(茶水間那種) */
  tiles: Rect | null;
  rug: Rect | null;
};

export const OFFICE_SCENE: SceneDef = {
  windows: [2, 16],
  clock: 9,
  ac: 12,
  tiles: { x: 14, y: 6, w: 5, h: 5 },
  rug: { x: 4, y: 8, w: 4, h: 2 },
};

export const LOUNGE_SCENE: SceneDef = {
  windows: [2, 7, 18],
  clock: 10,
  ac: 20,
  tiles: { x: 11, y: 1, w: 7, h: 2 },
  rug: { x: 18, y: 5, w: 7, h: 4 },
};
