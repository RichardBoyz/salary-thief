// 辦公室角色。ASCII 手繪,跟 map.ts 同一個慣用法:要改角色就改字串,
// 不需要美術工具、不需要圖檔、不需要 sprite sheet 產生器。
//
// v13 改版:16×24、四方向、走路四拍、深色描邊 + 兩階明暗,髮型/膚色/
// 衣服由 userId 決定 —— 辦公室裡每個人長得不一樣,一眼認得出誰是誰。
// 舊版只准用 UI 那 7 色,皮膚借金色、襯衫借霧白,那正是「看起來很敷衍」
// 的根源;場景現在有自己的盤(見 PLAN v13),UI 外框仍守 7 色。

/** 一個 sprite 像素在畫面上的大小。TILE=32 → 一格 16 像素,角色 16×24 = 1.5 格高 */
export const PIXEL = 2;

export const SPRITE_W = 16;
export const SPRITE_H = 24;

export type Dir = "down" | "up" | "side";
export type Hair = "short" | "bob" | "bun";
export const HAIRS: Hair[] = ["short", "bob", "bun"];

/*
 * 代號:k 描邊  s/S 皮膚亮/暗  E 上半眼(會眨)  e 下半眼  r 腮紅  m 嘴
 *       h/H/l 頭髮 本色/暗/高光  c/C 衣服亮/暗  w 領子  t 領帶
 *       p/P 褲子亮/暗  o 鞋  「.」透明
 *
 * 頭(上 12 列)跟身體(下 12 列)分開畫再疊起來:髮型 × 方向 + 方向 × 走路格,
 * 不用把每種組合整張重畫。
 */
const HEADS: Record<Hair, Record<Dir, string[]>> = {
  short: {
    down: [
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhhhhhhhhhk..",
      ".khhllhhhhhhhhk.",
      ".khlhhhhhhhhhhk.",
      ".khhsssssshhhhk.",
      ".khssssssssshhk.",
      ".khssEssssEsshk.",
      ".ksssessssesssk.",
      ".ksrsssmmsssrsk.",
      "..kSssssssssSk..",
      "...kkkkkkkkkk...",
    ],
    up: [
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhhhhhhhhhk..",
      ".khhllhhhhhhhhk.",
      ".khlhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".kHhhhhhhhhhhHk.",
      ".kHHhhhhhhhhHHk.",
      "..kHHHHHHHHHHk..",
      "...kkSSSSSSkk...",
    ],
    side: [
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhhhhhhhhhk..",
      ".khhllhhhhhhhhk.",
      ".khlhhhhhhhhhhk.",
      ".khhhhhhhhhhssk.",
      ".khhhhhhssssssk.",
      ".khhhhSssssEssk.",
      ".khhhhSssssesssk",
      ".khhhsssssssrsk.",
      "..kHHsssssssSk..",
      "...kkkkkkkkkk...",
    ],
  },
  bob: {
    down: [
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhhhhhhhhhk..",
      ".khhllhhhhhhhhk.",
      "khhlhhhhhhhhhhhk",
      "khhhhhhhhhhhhhhk",
      "khHssssssssssHhk",
      "khHssEssssEssHhk",
      "khHssessssessHhk",
      "khHrsssmmsssrHhk",
      "khHSssssssssSHhk",
      ".kkkkkkkkkkkkkk.",
    ],
    up: [
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhhhhhhhhhk..",
      ".khhllhhhhhhhhk.",
      "khhlhhhhhhhhhhhk",
      "khhhhhhhhhhhhhhk",
      "khhhhhhhhhhhhhhk",
      "khhhhhhhhhhhhhhk",
      "khhhhhhhhhhhhhhk",
      "kHhhhhhhhhhhhhHk",
      "kHHHHHHHHHHHHHHk",
      ".kkkkkkkkkkkkkk.",
    ],
    side: [
      ".....kkkkkk.....",
      "...kkhhhhhhkk...",
      "..khhhhhhhhhhk..",
      ".khhllhhhhhhhhk.",
      "khhlhhhhhhhhhhk.",
      "khhhhhhhhhhhhsk.",
      "khhhhhhhssssssk.",
      "khhhhhhssssEssk.",
      "khhhhhhssssesssk",
      "khhhhhhsssssrsk.",
      "kHHHHHHsssssSk..",
      ".kkkkkkkkkkkk...",
    ],
  },
  bun: {
    down: [
      "......kkkk......",
      ".....khllhk.....",
      "....kkhhhhkk....",
      "..kkhhhhhhhhkk..",
      ".khhhlhhhhhhhhk.",
      ".khhsssssssshhk.",
      ".khsssssssssshk.",
      ".khssEssssEsshk.",
      ".ksssessssesssk.",
      ".ksrsssmmsssrsk.",
      "..kSssssssssSk..",
      "...kkkkkkkkkk...",
    ],
    up: [
      "......kkkk......",
      ".....khllhk.....",
      "....kkhhhhkk....",
      "..kkhhhhhhhhkk..",
      ".khhhlhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".khhhhhhhhhhhhk.",
      ".kHhhhhhhhhhhHk.",
      ".kHHhhhhhhhhHHk.",
      "..kHHHHHHHHHHk..",
      "...kkSSSSSSkk...",
    ],
    side: [
      "..kkkk..........",
      ".khllhkkkkkk....",
      ".khhhhkhhhhhkk..",
      "..kkhhhhhhhhhhk.",
      ".khhhhhlhhhhhhk.",
      ".khhhhhhhhssssk.",
      ".khhhhhsssssssk.",
      ".khhhhSssssEssk.",
      ".khhhhSssssesssk",
      ".khhhsssssssrsk.",
      "..kHHsssssssSk..",
      "...kkkkkkkkkk...",
    ],
  },
};

/**
 * 身體:[站, 跨步 A, 跨步 B]。正面/背面左右對稱,B 就是 A 左右翻過來,
 * 只有側面要真的畫兩張(近腳/遠腳、手往前/往後擺)。
 */
const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""));

const DOWN_IDLE = [
  "..kcccwsswccck..",
  "..kCccctttccCk..",
  "..kCccctttccCk..",
  "..kCcccctcccCk..",
  "..kCccccccccCk..",
  "..ksccccccccsk..",
  "..kkppppppppkk..",
  "...kpppPPpppk...",
  "...kpppkkpppk...",
  "...kpppkkpppk...",
  "..kooookkooook..",
  "..kkkkkk.kkkkk..",
];
const DOWN_A = [
  "..kcccwsswccck..",
  "..kCccctttccCk..",
  "..kCccctttccCk..",
  "..kCcccctcccCk..",
  "..ksccccccccCk..",
  "..kkccccccccsk..",
  "...kppppppppkk..",
  "...kpppPPpppk...",
  "...kpppkkpppk...",
  "...kpppkkooook..",
  "..kooookkkkkk...",
  "..kkkkkk........",
];

const UP_IDLE = [
  "..kcccCCCCccck..",
  "..kCccccccccCk..",
  "..kCccccccccCk..",
  "..kCccccccccCk..",
  "..kCccccccccCk..",
  "..ksccccccccsk..",
  "..kkppppppppkk..",
  "...kpppPPpppk...",
  "...kpppkkpppk...",
  "...kpppkkpppk...",
  "..kooookkooook..",
  "..kkkkkk.kkkkk..",
];
const UP_A = [
  "..kcccCCCCccck..",
  "..kCccccccccCk..",
  "..kCccccccccCk..",
  "..kCccccccccCk..",
  "..ksccccccccCk..",
  "..kkccccccccsk..",
  "...kppppppppkk..",
  "...kpppPPpppk...",
  "...kpppkkpppk...",
  "...kpppkkooook..",
  "..kooookkkkkk...",
  "..kkkkkk........",
];

const SIDE_IDLE = [
  "....kcccwwssk...",
  "....kcCCccctk...",
  "....kcCCccctk...",
  "....kcCCccctk...",
  "....kcCCcccck...",
  "....kcssccccck..",
  "....kpppppppk...",
  ".....kpppppk....",
  ".....kppppk.....",
  ".....kppppk.....",
  ".....kooooook...",
  ".....kkkkkkkk...",
];
const SIDE_A = [
  "....kcccwwssk...",
  "...kCCccccctk...",
  "...kCCccccctk...",
  "..kCCcccccctk...",
  "..kssccccccck...",
  "..kkkcccccck....",
  "....kpppppppk...",
  "....kpppkpppk...",
  "...kPPPk.kpppk..",
  "..kPPPk...kpppk.",
  "..kook....kooook",
  "..kkk.....kkkkkk",
];
const SIDE_B = [
  "....kcccwwssk...",
  "....kcccccCCk...",
  "....kcccccCCtk..",
  "....kccccccCCk..",
  "....kccccccssk..",
  "....kcccccckkk..",
  "....kpppppppk...",
  "....kpppkPPPk...",
  "...kpppk.kPPPk..",
  "..kpppk...kPPPk.",
  "..kook....kooook",
  "..kkk.....kkkkkk",
];

const BODIES: Record<Dir, string[][]> = {
  down: [DOWN_IDLE, DOWN_A, mirror(DOWN_A)],
  up: [UP_IDLE, UP_A, mirror(UP_A)],
  side: [SIDE_IDLE, SIDE_A, SIDE_B],
};

/** 走路循環的身體格:跨 → 收 → 跨另一腳 → 收。收腳那兩拍由呼叫端把身體提高 1px */
export const WALK = [1, 0, 2, 0] as const;

/** 一張完整的圖:頭疊在身體上 */
export const frameOf = (hair: Hair, dir: Dir, body: number): string[] => [
  ...HEADS[hair][dir],
  ...BODIES[dir][body],
];

/** 所有組合,給測試一次掃完 */
export const ALL_FRAMES: string[][] = HAIRS.flatMap((h) =>
  (["down", "up", "side"] as Dir[]).flatMap((d) => [0, 1, 2].map((b) => frameOf(h, d, b))),
);

export type Run = { x: number; y: number; w: number; ch: string };

/**
 * 一張圖 → 橫向合併過的色塊。合併同代號連續格,一個角色從 ~300 格壓到
 * ~110 個 rect。回傳代號而不是顏色:同一個形狀所有人共用,顏色在畫的時候
 * 才依每個人的 Look 套上去。
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
      out.push({ x, y, w, ch });
      x += w;
    }
  });
  return out;
}

const cache = new Map<string, Run[]>();
/** runs 的快取版:形狀只有 3 髮型 × 3 方向 × 3 格,全場共用 */
export const shapeRuns = (hair: Hair, dir: Dir, body: number): Run[] => {
  const key = `${hair}/${dir}/${body}`;
  let r = cache.get(key);
  if (!r) cache.set(key, (r = runs(frameOf(hair, dir, body))));
  return r;
};

// ---- 外觀:髮型 + 配色。預設由 userId 雜湊,也可以自己挑(v14)----
//
// 清單只能往尾巴加、不能重排:存進 DB 的是「第幾個」,重排會讓舊存檔解成別的樣子。

const OUTLINE = "#1d1720";
/** [亮, 暗] 成對手調,不用程式算暗色 —— 算出來的暗色會偏灰、沒有色相偏移 */
const SKINS = [
  ["#f7d7bb", "#e2ac8a"],
  ["#f0c08f", "#d0915f"],
  ["#c98e5f", "#a06640"],
  ["#8f5b3b", "#6c3f27"],
];
const HAIR_COLORS = [
  ["#2c2630", "#1b171e", "#4a4152"],
  ["#5b3a26", "#3d2619", "#7a5136"],
  ["#a8693c", "#7f4b28", "#c98a55"],
  ["#e4c170", "#bc9340", "#f4dc9c"],
  ["#a3a7b3", "#777c89", "#c9ccd4"],
  ["#8c3a44", "#64262f", "#b0545e"],
];
const SHIRTS = [
  ["#4d7fd6", "#365ea6"],
  ["#d9615f", "#a94545"],
  ["#5ea95a", "#42813f"],
  ["#e2b23f", "#b48728"],
  ["#8a69cc", "#654aa0"],
  ["#e9e5dc", "#bcb6a9"],
  ["#3ea8a3", "#2b7e7a"],
  ["#e690b2", "#bc6a8b"],
];
const PANTS = [
  ["#2f3a58", "#222a42"],
  ["#3c3c46", "#2a2a32"],
  ["#7e6b52", "#5f503c"],
  ["#4b5669", "#363f4f"],
];
const TIES = ["#c43b3b", "#2f4f9e", "#2c2630"];

export type Look = { hair: Hair; colors: Record<string, string> };

/** 外觀 = 每一項選第幾個。DB 存的就是這 6 個編號,不是顏色 */
export type Avatar = {
  hair: number;
  hairColor: number;
  skin: number;
  shirt: number;
  pants: number;
  /** 0 = 不打領帶,1.. = TIES 的第幾條 */
  tie: number;
};

/** [項目, 選項數]。順序就是編碼順序 —— 跟 DB check 的 6 碼一一對應,不能改 */
export const AVATAR_SLOTS = [
  ["hair", HAIRS.length],
  ["hairColor", HAIR_COLORS.length],
  ["skin", SKINS.length],
  ["shirt", SHIRTS.length],
  ["pants", PANTS.length],
  ["tie", TIES.length + 1],
] as const;

/** 換裝面板的色票:每個選項的代表色(亮的那一階) */
export const SWATCHES = {
  hairColor: HAIR_COLORS.map((c) => c[0]),
  skin: SKINS.map((c) => c[0]),
  shirt: SHIRTS.map((c) => c[0]),
  pants: PANTS.map((c) => c[0]),
  tie: TIES,
};

/** 一碼一項,base36。6 個英數字,DB 用 regex 鎖死格式 */
export const encodeAvatar = (a: Avatar): string =>
  AVATAR_SLOTS.map(([k]) => a[k].toString(36)).join("");

/** 壞掉的、超出選項範圍的一律回 null —— 呼叫端退回預設外觀,不會畫出缺色的人 */
export function decodeAvatar(code: string | null | undefined): Avatar | null {
  if (!code || !/^[0-9a-z]{6}$/.test(code)) return null;
  const a = {} as Avatar;
  for (const [i, [k, n]] of AVATAR_SLOTS.entries()) {
    const v = parseInt(code[i], 36);
    if (v >= n) return null;
    a[k] = v;
  }
  return a;
}

/** FNV-1a。只拿來把 userId 打散成「穩定的亂數」,不是密碼學用途 */
const hash = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

/**
 * 沒自訂的人的臉:同一個 id 永遠同一張,換裝置、重整都一樣,不用存任何東西。
 * 每一項各取 hash 的不同位元,避免「頭髮顏色決定衣服顏色」這種連動。
 * 模數寫死成 v13 上線時的選項數:之後清單加新顏色,沒自訂的人也不會突然變臉。
 */
export function defaultAvatar(id: string): Avatar {
  const h = hash(id);
  return {
    skin: h % 4,
    hairColor: (h >>> 3) % 6,
    shirt: (h >>> 7) % 8,
    pants: (h >>> 11) % 4,
    // 三成的人不打領帶
    tie: (h >>> 14) % 10 < 3 ? 0 : 1 + ((h >>> 17) % 3),
    hair: (h >>> 20) % 3,
  };
}

const looks = new Map<string, Look>();
/** 編號 → 顏色。快取:同一套外觀回傳同一個物件,Actor 的 memo 才擋得住每 100ms 的重畫 */
export function lookOf(a: Avatar): Look {
  const key = encodeAvatar(a);
  const hit = looks.get(key);
  if (hit) return hit;
  const [s, S] = SKINS[a.skin];
  const [hc, hd, hl] = HAIR_COLORS[a.hairColor];
  const [c, C] = SHIRTS[a.shirt];
  const [p, P] = PANTS[a.pants];
  const look: Look = {
    hair: HAIRS[a.hair],
    colors: {
      k: OUTLINE,
      s,
      S,
      E: OUTLINE,
      e: OUTLINE,
      r: "#ec9a8c",
      m: S,
      h: hc,
      H: hd,
      l: hl,
      c,
      C,
      w: "#f4f1ea",
      // 不打領帶:領帶那幾格就畫成衣服色
      t: a.tie ? TIES[a.tie - 1] : c,
      p,
      P,
      o: "#2a2026",
    },
  };
  looks.set(key, look);
  return look;
}

/** 有自訂用自訂;沒有、或存檔壞掉,就用 userId 雜湊出來的那張臉 */
export const lookFor = (id: string, code?: string | null): Look =>
  lookOf(decodeAvatar(code) ?? defaultAvatar(id));
