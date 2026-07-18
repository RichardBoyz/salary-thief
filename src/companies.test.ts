import { describe, expect, it } from "vitest";
import {
  COMPANIES,
  companyName,
  isDirectoryCompany,
  normalizeCustom,
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
