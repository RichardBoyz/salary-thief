import { describe, expect, it } from "vitest";
import {
  buildInviteLink,
  inviteParams,
  COMPANIES,
  companyName,
  isDirectoryCompany,
  normalizeCustom,
  ORGS,
  orgCode,
  parseInvite,
  parseRegistry,
  searchCompanies,
  searchOrgs,
  slugToUuid,
} from "./companies";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("slugToUuid", () => {
  it("輸出合法 uuid 格式(Postgres uuid 欄位要收)", () => {
    for (const c of COMPANIES) expect(slugToUuid(c.slug)).toMatch(UUID_RE);
  });

  it("決定性:同 slug 永遠同 uuid —— 兩個同事各自選才會同房", () => {
    expect(slugToUuid("tsmc")).toBe(slugToUuid("tsmc"));
  });

  it("不同 slug 給不同 uuid(目錄內零碰撞)", () => {
    const codes = COMPANIES.map((c) => slugToUuid(c.slug));
    expect(new Set(codes).size).toBe(COMPANIES.length);
  });
});

describe("normalizeCustom", () => {
  it("大小寫、前後空白、內部空白都正規化 —— 打一樣名字的人同房", () => {
    expect(normalizeCustom("  My Corp ")).toBe("mycorp");
    expect(slugToUuid(normalizeCustom("我的公司 "))).toBe(
      slugToUuid(normalizeCustom("我的公司")),
    );
  });
});

describe("companyName 反查", () => {
  it("目錄公司回真名", () => {
    expect(companyName(slugToUuid("tsmc"))).toBe("台積電");
  });

  it("自訂公司(不在目錄)回 fallback", () => {
    const custom = slugToUuid(normalizeCustom("小小新創"));
    expect(companyName(custom, "小小新創")).toBe("小小新創");
  });

  it("自訂公司沒 fallback 回短碼,不會爆", () => {
    const custom = slugToUuid("zzz-unknown");
    expect(companyName(custom)).toContain("自訂公司");
  });

  it("null code 回空字串", () => {
    expect(companyName(null)).toBe("");
  });
});

describe("isDirectoryCompany(能不能被跨公司統計具名)", () => {
  it("目錄公司可具名", () => {
    expect(isDirectoryCompany(slugToUuid("foxconn"))).toBe(true);
  });
  it("自訂公司永遠不具名", () => {
    expect(isDirectoryCompany(slugToUuid(normalizeCustom("路邊攤")))).toBe(false);
    expect(isDirectoryCompany(null)).toBe(false);
  });
});

describe("searchCompanies", () => {
  it("空字串回全部", () => {
    expect(searchCompanies("")).toHaveLength(COMPANIES.length);
  });
  it("中文名比對", () => {
    expect(searchCompanies("台積").map((c) => c.slug)).toContain("tsmc");
  });
  it("英文 aka 比對", () => {
    expect(searchCompanies("TSMC").map((c) => c.slug)).toContain("tsmc");
  });
});

describe("parseRegistry", () => {
  it("gcis 列轉成 name/taxId/city,城市取地址前三字", () => {
    const rows = parseRegistry([
      {
        Business_Accounting_NO: "22099131",
        Company_Name: "台灣積體電路製造股份有限公司",
        Company_Location: "新竹市力行六路8號",
      },
    ]);
    expect(rows).toEqual([
      { name: "台灣積體電路製造股份有限公司", taxId: "22099131", city: "新竹市" },
    ]);
  });

  it("查無資料時 gcis 回非陣列 → 空陣列;爛列被濾掉", () => {
    expect(parseRegistry({ message: "no data" })).toEqual([]);
    expect(parseRegistry(null)).toEqual([]);
    expect(parseRegistry([{ Company_Name: 123 }, null])).toEqual([]);
  });

  it("登記公司的房間鍵(統編)是合法 uuid 且不具名", () => {
    const code = slugToUuid("22099131");
    expect(code).toMatch(UUID_RE);
    expect(isDirectoryCompany(code)).toBe(false);
  });
});

describe("醫院與財團法人(公司登記查不到的)", () => {
  it("慈濟:醫院和基金會都找得到;打「慈濟財團法人」也行(不管法人型態寫在哪)", () => {
    for (const q of ["慈濟", "慈濟財團法人", "財團法人慈濟"]) {
      const hits = searchOrgs(q);
      expect(hits, q).toContain("財團法人佛教慈濟慈善事業基金會");
      expect(hits.some((h) => h.includes("花蓮慈濟醫院")), q).toBe(true);
    }
  });

  it("縮寫與台/臺混用也找得到,最像的排第一", () => {
    expect(searchOrgs("台大醫院")[0]).toBe("國立台灣大學醫學院附設醫院");
    expect(searchOrgs("臺大醫院")[0]).toBe("國立台灣大學醫學院附設醫院");
    expect(searchOrgs("工研院")[0]).toBe("財團法人工業技術研究院");
    expect(searchOrgs("北榮")[0]).toBe("臺北榮民總醫院");
    expect(searchOrgs("長庚").every((h) => h.includes("長庚"))).toBe(true);
  });

  it("只打法人型態照原字比;一個字不搜", () => {
    expect(searchOrgs("財團法人").length).toBeGreaterThan(0);
    expect(searchOrgs("慈")).toEqual([]);
    expect(searchOrgs("")).toEqual([]);
  });

  it("房間鍵:合法 uuid、跟自訂同名與目錄各自一個鍵空間、台/臺寫法不同也同一間", () => {
    const name = "佛教慈濟醫療財團法人台北慈濟醫院";
    expect(orgCode(name)).toMatch(UUID_RE);
    expect(orgCode(name)).toBe(orgCode(name.replace("台北", "臺北")));
    expect(orgCode(name)).not.toBe(slugToUuid(normalizeCustom(name)));
  });

  it("名稱反查得回來(換裝置也顯示正式名稱),但不算目錄公司 —— 跨公司統計不具名", () => {
    const name = "財團法人工業技術研究院";
    expect(companyName(orgCode(name))).toBe(name);
    expect(isDirectoryCompany(orgCode(name))).toBe(false);
  });

  it("清單沒有重複,正規化之後也不撞鍵", () => {
    expect(new Set(ORGS).size).toBe(ORGS.length);
    expect(new Set(ORGS.map(orgCode)).size).toBe(ORGS.length);
  });
});

describe("邀請連結", () => {
  it("build → parse round-trip,中文名字、暱稱、隊名經得起 URL 編碼", () => {
    const code = slugToUuid("tsmc");
    const invite = { code, name: "台積電", handle: "小明", team: "後端 組" };
    const link = buildInviteLink("https://example.com", invite);
    expect(parseInvite(new URL(link).search)).toEqual(invite);
  });

  it("隊伍跟著連結走:收件人跟邀請人同一隊;邀請人沒選隊 = 大廳(null)", () => {
    const code = slugToUuid("tsmc");
    const lobby = buildInviteLink("https://example.com", { code, name: "台積電", handle: "小明", team: null });
    expect(new URL(lobby).searchParams.has("t")).toBe(false);
    expect(parseInvite(new URL(lobby).search)!.team).toBeNull();
    // v16b 之前的舊連結沒有 t:一樣是大廳
    expect(parseInvite(`#join=${code}&n=x&h=y`)!.team).toBeNull();
  });

  it("邀請整段在 ? 不在 #:iOS 的 LINE 用外部瀏覽器開時會丟掉 # 後面;LINE 開關一起帶", () => {
    const code = slugToUuid("tsmc");
    const url = new URL(buildInviteLink("https://example.com", { code, name: "台積電", handle: "小明", team: "後端組" }));
    expect(url.hash).toBe("");
    expect(url.searchParams.get("openExternalBrowser")).toBe("1");
    expect([...url.searchParams.keys()][0]).toBe("join"); // 被截短時公司碼最後才掉
    // LINE 丟掉 # 之後的樣子(https://…/?…#)照樣解得出來
    expect(parseInvite(new URL(`${url.href}#`).search)!.team).toBe("後端組");
  });

  it("v16d 之前放在 # 的舊連結照樣解得出來", () => {
    const code = slugToUuid("tsmc");
    expect(parseInvite(`#join=${code}&n=${encodeURIComponent("台積電")}&t=x`)).toEqual({
      code, name: "台積電", handle: null, team: "x",
    });
  });

  it("登入前放回網址列的參數跟連結解出來的一模一樣", () => {
    const invite = { code: slugToUuid("tsmc"), name: "台積電", handle: "小明", team: "後端組" };
    expect(parseInvite(`?${inviteParams(invite)}`)).toEqual(invite);
  });

  it("hash 是不可信輸入:非 uuid 的 code 一律拒收", () => {
    expect(parseInvite("#join=not-a-uuid&n=x")).toBeNull();
    expect(parseInvite("#join=")).toBeNull();
    expect(parseInvite("#access_token=supabase-oauth-stuff")).toBeNull();
    expect(parseInvite("")).toBeNull();
  });

  it("名字截 30 / 暱稱截 20,缺就回 null", () => {
    const code = slugToUuid("tsmc");
    expect(parseInvite(`#join=${code}`)!.name).toBeNull();
    expect(parseInvite(`#join=${code}`)!.handle).toBeNull();
    expect(parseInvite(`#join=${code}&n=${"甲".repeat(99)}`)!.name).toHaveLength(30);
    expect(parseInvite(`#join=${code}&h=${"乙".repeat(99)}`)!.handle).toHaveLength(20);
  });

  it("隊名會存進收件人的 profile:剝隱形字元、去空白、截 20,空的就是大廳", () => {
    const code = slugToUuid("tsmc");
    const team = (raw: string) => parseInvite(`#join=${code}&t=${encodeURIComponent(raw)}`)!.team;
    expect(team("後\u202e端\u200b組")).toBe("後端組");
    expect(team("  後端組  ")).toBe("後端組");
    expect(team("丙".repeat(99))).toHaveLength(20);
    expect(team("   ")).toBeNull();
    expect(team("\u200b")).toBeNull();
  });
});
