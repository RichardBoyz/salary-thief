// 真實公司目錄。用途:加入房間時用「選公司」取代「貼 UUID」——兩個同事
// 各自選「台積電」就會落進同一間房,不必互傳邀請碼。
//
// 隱私設計(使用者選的「真實目錄+維持匿名」方向):
//   * DB 只存 company_code(uuid),不存公司名。名字的對照表在這份 client
//     檔案裡(公司名本來就是公開常識)。DB 外洩也看不出是哪家公司。
//   * company_code = slugToUuid(slug),決定性導出 —— 同公司同房,免傳碼。
//   * 只有列在這份目錄裡的公司,才可能出現在「跨公司統計」被具名。等於
//     我用這份清單控制了「哪些公司能被公開具名」,自訂公司永遠不具名。

import { safeText } from "./lounge";
import { FOUNDATIONS, HOSPITALS } from "./orgs";

export type Company = { slug: string; name: string; aka?: string };

// 台灣知名企業。都是公開已知的真實公司名,非杜撰、非冒充。
export const COMPANIES: Company[] = [
  { slug: "tsmc", name: "台積電", aka: "TSMC 台灣積體電路" },
  { slug: "foxconn", name: "鴻海", aka: "Foxconn 富士康" },
  { slug: "mediatek", name: "聯發科", aka: "MediaTek" },
  { slug: "delta", name: "台達電", aka: "Delta" },
  { slug: "quanta", name: "廣達", aka: "Quanta" },
  { slug: "asus", name: "華碩", aka: "ASUS" },
  { slug: "acer", name: "宏碁", aka: "Acer" },
  { slug: "pegatron", name: "和碩", aka: "Pegatron" },
  { slug: "wistron", name: "緯創", aka: "Wistron" },
  { slug: "ase", name: "日月光", aka: "ASE" },
  { slug: "umc", name: "聯電", aka: "UMC" },
  { slug: "htc", name: "宏達電", aka: "HTC" },
  { slug: "largan", name: "大立光", aka: "Largan" },
  { slug: "cathay", name: "國泰金", aka: "Cathay" },
  { slug: "fubon", name: "富邦金", aka: "Fubon" },
  { slug: "ctbc", name: "中信金", aka: "CTBC 中國信託" },
  { slug: "esun", name: "玉山金", aka: "E.SUN" },
  { slug: "taishin", name: "台新金", aka: "Taishin" },
  { slug: "mega", name: "兆豐金", aka: "Mega" },
  { slug: "cht", name: "中華電信", aka: "Chunghwa Telecom" },
  { slug: "twm", name: "台灣大哥大", aka: "Taiwan Mobile" },
  { slug: "fet", name: "遠傳電信", aka: "FET" },
  { slug: "unipresident", name: "統一企業", aka: "Uni-President" },
  { slug: "seveneleven", name: "統一超商", aka: "7-ELEVEN" },
  { slug: "familymart", name: "全家便利商店", aka: "FamilyMart" },
  { slug: "pxmart", name: "全聯", aka: "PX Mart" },
  { slug: "momo", name: "富邦媒 momo", aka: "momo購物" },
  { slug: "eslite", name: "誠品", aka: "Eslite" },
  { slug: "evaair", name: "長榮航空", aka: "EVA Air" },
  { slug: "chinaairlines", name: "中華航空", aka: "China Airlines" },
  { slug: "evergreen", name: "長榮海運", aka: "Evergreen" },
  { slug: "yangming", name: "陽明海運", aka: "Yang Ming" },
  { slug: "fpc", name: "台塑", aka: "Formosa Plastics" },
  { slug: "csc", name: "中鋼", aka: "China Steel" },
  { slug: "tcc", name: "台泥", aka: "Taiwan Cement" },
  { slug: "linetw", name: "台灣大型軟體/新創", aka: "軟體 新創 startup" },
];

/**
 * slug → uuid 的決定性導出。非加密雜湊 —— slug 是公開資訊,只需要「同 slug
 * 永遠同 uuid」,不需要防碰撞。輸出是合法 uuid 格式(Postgres uuid 欄位吃)。
 * 4 輪 FNV-1a 各產 8 hex = 32 hex,套 8-4-4-4-12 版型。
 */
export function slugToUuid(slug: string): string {
  const hx: string[] = [];
  for (let round = 0; round < 4; round++) {
    let h = (0x811c9dc5 ^ Math.imul(round, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < slug.length; i++) {
      h ^= slug.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hx.push(h.toString(16).padStart(8, "0"));
  }
  const s = hx.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** 自訂公司:正規化後當 slug,讓打一樣名字的人也會同房 */
export const normalizeCustom = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, "");

// ---- 醫院與財團法人(公司登記查不到的大雇主,清單在 orgs.ts)----

export const ORGS: readonly string[] = [...HOSPITALS, ...FOUNDATIONS];

/** 比對與房間鍵用的正規化:台/臺當成同一個字、去空白。畫面上照原名顯示 */
const canon = (s: string): string => s.replace(/台/g, "臺").replace(/\s+/g, "");

/**
 * 房間鍵:由正規化後的名稱導出(所以清單只加不改,見 orgs.ts)。前綴讓它跟目錄、
 * 登記公司(統編)、自訂公司各自一個鍵空間 —— 資料把「台」改成「臺」也還是同一間
 */
export const orgCode = (name: string): string => slugToUuid(`org:${canon(name)}`);

// 搜尋時不管法人型態:打「慈濟財團法人」要找得到「財團法人佛教慈濟…」。
// 「醫療」不在裡面 —— 打「醫療」本來就該找得到醫療財團法人
const LEGAL_FORM = /財團法人|社團法人|股份有限公司|有限公司/g;

const ORG_INDEX = ORGS.map((name) => {
  const full = canon(name);
  return { name, full, bare: full.replace(LEGAL_FORM, "") };
});

/**
 * query 的字依序出現在名稱裡就算,所以縮寫也找得到(台大醫院 → 國立台灣大學醫學院
 * 附設醫院、工研院 → 工業技術研究院)。回傳涵蓋的最短長度:越短越像,-1 = 不符。
 * ponytail: 每次搜尋掃一遍 ~170 筆,不到一毫秒;清單上千筆再建索引
 */
const span = (q: string, s: string): number => {
  let best = -1;
  for (let start = s.indexOf(q[0]); start !== -1; start = s.indexOf(q[0], start + 1)) {
    let k = 0;
    let i = start;
    for (; i < s.length && k < q.length; i++) if (s[i] === q[k]) k++;
    if (k === q.length && (best === -1 || i - start < best)) best = i - start;
  }
  return best;
};

/** 搜醫院與財團法人。越緊湊的越前面(整段連續出現最好),一樣緊湊就短名先 */
export const searchOrgs = (q: string, limit = 8): string[] => {
  const raw = canon(q);
  const stripped = raw.replace(LEGAL_FORM, "");
  // 只打了「財團法人」這類字:照原字比,不然拿掉之後什麼都不剩
  const bare = stripped.length >= 2;
  const needle = bare ? stripped : raw;
  if (needle.length < 2) return [];
  return ORG_INDEX.map((o) => ({ name: o.name, span: span(needle, bare ? o.bare : o.full) }))
    .filter((r) => r.span !== -1)
    .sort((a, b) => a.span - b.span || a.name.length - b.name.length)
    .slice(0, limit)
    .map((r) => r.name);
};

/** company_code(uuid)→ 顯示名的反查表。只認得目錄裡的公司(會在跨公司統計具名的那些) */
const byCode = new Map(COMPANIES.map((c) => [slugToUuid(c.slug), c.name]));
/** 醫院與財團法人的反查。名稱是公開資料,換裝置也顯示得出來;但不算目錄公司、不具名 */
const orgByCode = new Map(ORGS.map((n) => [orgCode(n), n]));

/** 目錄公司、醫院與財團法人回正式名稱;其他回 fallback(使用者本機記的名字)或短碼 */
export const companyName = (code: string | null, fallback?: string | null): string => {
  if (!code) return "";
  return byCode.get(code) ?? orgByCode.get(code) ?? fallback ?? `自訂公司 ${code.slice(0, 4)}`;
};

/** 這個 code 是不是目錄公司(= 可以在跨公司統計被具名) */
export const isDirectoryCompany = (code: string | null): boolean =>
  !!code && byCode.has(code);

/** 搜尋:比對名稱與 aka,回符合的公司 */
export const searchCompanies = (q: string): Company[] => {
  const s = q.trim().toLowerCase();
  if (!s) return COMPANIES;
  return COMPANIES.filter(
    (c) => c.name.toLowerCase().includes(s) || (c.aka ?? "").toLowerCase().includes(s),
  );
};

// ---- 邀請連結 ----
// 自訂公司靠「打同名」同房太碰運氣,邀請連結把房間碼直接帶過去。
// 邀請內容放 query(?join=…)。v16d 之前放 hash(# 後面,不會進任何 server log),
// 但 iOS 的 LINE 用「預設瀏覽器開啟」時會把 # 後面整段丟掉,收件人只拿到首頁。
// 代價是自家網站的請求紀錄看得到 query;連結本來就以明文躺在聊天訊息裡,站上
// 也設了 no-referrer 不外流,進站讀完立刻從網址列洗掉(偽裝考量)。名字放連結裡
// 只是幫收件人設本機顯示標籤 —— DB 仍然不存公司名。

// name = 房間顯示名(幫收件人設本機標籤);handle = 邀請人暱稱(給收件人看清楚
// 是誰邀的);team = 邀請人當下的隊(null = 大廳)。收件人按「加入」就跟邀請人
// 同公司、同隊 —— v16b 之前只帶公司,收件人一律落在大廳,邀請人有隊的話兩個人
// 在辦公室永遠碰不到面。舊連結沒有 t,等於大廳(跟以前一樣)。
export type Invite = { code: string; name: string | null; handle: string | null; team: string | null };

/**
 * 待過的公司/隊伍(換公司畫面一鍵回去)。只存本機 —— DB 只記你「現在」在哪、不存公司名;
 * name 是當下畫面上顯示的名字。綁 uid:同一台電腦換帳號登入時不會列出別人的。
 */
export type Place = { uid: string; code: string; name: string; team: string | null };

/** 最新的排最前面;同一人同公司同隊只留一筆(名字以最新為準);最多留 max 筆 */
export const addPlace = (list: Place[], p: Place, max = 8): Place[] =>
  [p, ...list.filter((x) => !(x.uid === p.uid && x.code === p.code && x.team === p.team))].slice(0, max);

const INVITE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 邀請參數(不含 ?)。連結本身、與登入前把邀請放回網址列(Team.tsx)共用 */
export const inviteParams = (i: Invite): string => {
  const p = new URLSearchParams({ join: i.code });
  if (i.name) p.set("n", i.name.slice(0, 30));
  if (i.handle) p.set("h", i.handle.slice(0, 20));
  if (i.team) p.set("t", i.team.slice(0, 20));
  return p.toString();
};

/**
 * 邀請連結。openExternalBrowser=1 是 LINE 的開關:在 LINE 裡點開直接跳系統瀏覽器
 * (LINE 內建瀏覽器擋 Google 登入)。join 放第一個 —— 萬一哪個 App 把連結截短,
 * 至少公司碼還在。進站後 main.tsx 整段從網址列洗掉
 */
export const buildInviteLink = (origin: string, invite: Invite): string =>
  `${origin}/?${inviteParams(invite)}&openExternalBrowser=1`;

/**
 * 解 location.search(新連結)或 location.hash(v16d 前的舊連結)。不可信輸入:
 * code 必須是合法 uuid,其他欄位剝隱形字元、去頭尾空白、截長度(隊名在收件人按
 * 「加入」後會存進他自己的 profile)。不合格回 null
 */
export const parseInvite = (raw: string): Invite | null => {
  const p = new URLSearchParams(raw.replace(/^[?#]/, ""));
  const code = p.get("join")?.toLowerCase() ?? "";
  if (!INVITE_UUID_RE.test(code)) return null;
  const field = (key: string, max: number) => safeText(p.get(key) ?? "").trim().slice(0, max) || null;
  return { code, name: field("n", 30), handle: field("h", 20), team: field("t", 20) };
};

// ---- 政府登記公司(經濟部商工登記 open data)----
// 目錄之外的長尾:搜「登記全名」找全台所有核准設立的公司。房間鍵用統編
// (更名也不換房),隱私規則不變 —— DB 仍只存 uuid,跨公司統計不具名
// (isDirectoryCompany 為 false),顯示名只記在本機 companyLabel。

export type RegistryCompany = { name: string; taxId: string; city: string };

/** gcis 回應 → RegistryCompany[]。查無資料時 gcis 回非陣列,一律當空 */
export const parseRegistry = (data: unknown): RegistryCompany[] => {
  if (!Array.isArray(data)) return [];
  return data
    .filter((r) => r && typeof r.Company_Name === "string" && r.Business_Accounting_NO)
    .map((r) => ({
      name: r.Company_Name as string,
      taxId: String(r.Business_Accounting_NO),
      city: String(r.Company_Location ?? "").slice(0, 3),
    }));
};

/**
 * 打經濟部商工登記 API 搜公司。/gcis 由 worker.js(prod)/ vite proxy(dev)
 * 轉發 —— gcis 不給 CORS。注意它比對的是「登記全名」子字串:搜「台積電」
 * 找不到台積電(登記名是台灣積體電路製造),知名公司靠上面的目錄接住。
 */
export async function searchRegistry(q: string, signal?: AbortSignal): Promise<RegistryCompany[]> {
  // gcis 的 odata 方言:like 的值不加引號,空白會弄壞 filter,先拿掉
  const name = q.replace(/\s+/g, "");
  const filter = `Company_Name like ${name} and Company_Status eq 01`;
  const url =
    "/gcis/od/data/api/6BBA2268-1367-4B42-9CCA-BC17499EBE8C" +
    `?$format=json&$filter=${encodeURIComponent(filter)}&$skip=0&$top=10`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  return parseRegistry(await res.json().catch(() => null));
}
