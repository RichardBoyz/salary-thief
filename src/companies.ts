// 真實公司目錄。用途:加入房間時用「選公司」取代「貼 UUID」——兩個同事
// 各自選「台積電」就會落進同一間房,不必互傳邀請碼。
//
// 隱私設計(使用者選的「真實目錄+維持匿名」方向):
//   * DB 只存 company_code(uuid),不存公司名。名字的對照表在這份 client
//     檔案裡(公司名本來就是公開常識)。DB 外洩也看不出是哪家公司。
//   * company_code = slugToUuid(slug),決定性導出 —— 同公司同房,免傳碼。
//   * 只有列在這份目錄裡的公司,才可能出現在「跨公司統計」被具名。等於
//     我用這份清單控制了「哪些公司能被公開具名」,自訂公司永遠不具名。

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

/** company_code(uuid)→ 顯示名的反查表。只認得目錄裡的公司 */
const byCode = new Map(COMPANIES.map((c) => [slugToUuid(c.slug), c.name]));

/** 目錄公司回真名;自訂公司回 fallback(使用者本機記的名字)或短碼 */
export const companyName = (code: string | null, fallback?: string | null): string => {
  if (!code) return "";
  return byCode.get(code) ?? fallback ?? `自訂公司 ${code.slice(0, 4)}`;
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
