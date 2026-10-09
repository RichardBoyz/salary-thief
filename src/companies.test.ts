import { describe, expect, it } from "vitest";
import {
  buildInviteLink,
  inviteHash,
  COMPANIES,
  companyName,
  isDirectoryCompany,
  normalizeCustom,
  parseInvite,
  parseRegistry,
  searchCompanies,
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

describe("邀請連結", () => {
  it("build → parse round-trip,中文名字、暱稱、隊名經得起 URL 編碼", () => {
    const code = slugToUuid("tsmc");
    const invite = { code, name: "台積電", handle: "小明", team: "後端 組" };
    const link = buildInviteLink("https://example.com", invite);
    expect(parseInvite(new URL(link).hash)).toEqual(invite);
  });

  it("隊伍跟著連結走:收件人跟邀請人同一隊;邀請人沒選隊 = 大廳(null)", () => {
    const code = slugToUuid("tsmc");
    const lobby = buildInviteLink("https://example.com", { code, name: "台積電", handle: "小明", team: null });
    expect(new URL(lobby).hash).not.toContain("t=");
    expect(parseInvite(new URL(lobby).hash)!.team).toBeNull();
    // v16b 之前的舊連結沒有 t:一樣是大廳
    expect(parseInvite(`#join=${code}&n=x&h=y`)!.team).toBeNull();
  });

  it("連結叫 LINE 直接開系統瀏覽器(內建瀏覽器擋 Google 登入),邀請內容仍只在 hash", () => {
    const code = slugToUuid("tsmc");
    const url = new URL(buildInviteLink("https://example.com", { code, name: "台積電", handle: "小明", team: "後端組" }));
    expect(url.searchParams.get("openExternalBrowser")).toBe("1");
    expect([...url.searchParams.keys()]).toEqual(["openExternalBrowser"]); // server 看得到的 query 不帶任何資訊
    expect(url.hash).toContain(code);
  });

  it("登入前放回網址列的 hash 跟連結解出來的一模一樣", () => {
    const invite = { code: slugToUuid("tsmc"), name: "台積電", handle: "小明", team: "後端組" };
    expect(parseInvite(`#${inviteHash(invite)}`)).toEqual(invite);
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
