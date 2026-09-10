import { describe, expect, it } from "vitest";
import { buildSearchResults, SEARCH_RESULT_LIMIT } from "@/features/wine/search";

// 실제 DB 조회 결과 형태에 맞춘 픽스처.
const region = {
  slug: "bordeaux-saint-julien",
  nameKo: "보르도, 생줄리앙",
  country: "프랑스",
  parent: { nameKo: "보르도" },
};
const grape = { slug: "메를로", nameKo: "메를로", nameLocal: "Merlot" };
const wine = {
  slug: "ch-teau-talbot",
  nameKo: "샤또 딸보",
  nameLocal: "Château Talbot",
  type: "red",
  region: { nameKo: "보르도, 생줄리앙" },
};

describe("buildSearchResults", () => {
  it("산지 → 품종 → 와인 순서로 합친다", () => {
    const out = buildSearchResults({ regions: [region], grapes: [grape], wines: [wine] });
    expect(out.map((r) => r.kind)).toEqual(["region", "grape", "wine"]);
  });

  it("각 분류를 자기 페이지 경로로 잇는다", () => {
    const out = buildSearchResults({ regions: [region], grapes: [grape], wines: [wine] });
    expect(out[0].href).toBe("/region/bordeaux-saint-julien");
    expect(out[1].href).toBe("/grape/메를로");
    expect(out[2].href).toBe("/wine/ch-teau-talbot");
  });

  it("와인 이름은 원어 우선, 부가정보는 산지 · 종류", () => {
    const [w] = buildSearchResults({ regions: [], grapes: [], wines: [wine] });
    expect(w.name).toBe("Château Talbot");
    expect(w.sub).toBe("보르도, 생줄리앙 · 레드");
  });

  it("산지 부가정보는 country → 상위 → '산지' 순으로 채운다", () => {
    const noCountry = { ...region, country: null };
    const noParent = { ...region, country: null, parent: null };
    expect(buildSearchResults({ regions: [noCountry], grapes: [], wines: [] })[0].sub).toBe(
      "보르도"
    );
    expect(buildSearchResults({ regions: [noParent], grapes: [], wines: [] })[0].sub).toBe("산지");
  });

  it("품종 원어가 없으면 부가정보는 빈 문자열", () => {
    const noLocal = { ...grape, nameLocal: null };
    expect(buildSearchResults({ regions: [], grapes: [noLocal], wines: [] })[0].sub).toBe("");
  });

  it(`전체 결과를 ${SEARCH_RESULT_LIMIT}개로 자른다`, () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...grape, slug: `g${i}` }));
    const out = buildSearchResults({ regions: [region], grapes: many, wines: [wine] });
    expect(out).toHaveLength(SEARCH_RESULT_LIMIT);
    // 산지가 먼저이므로 첫 결과는 산지, 와인은 잘려 나간다.
    expect(out[0].kind).toBe("region");
    expect(out.some((r) => r.kind === "wine")).toBe(false);
  });
});
