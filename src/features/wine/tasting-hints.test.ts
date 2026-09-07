import { describe, expect, it } from "vitest";
import {
  expectedAromasFor,
  expectedColorHint,
  expectedFlavorFor,
  flavorLevelWord,
} from "./tasting-hints";

describe("expectedColorHint — 예상 색 안내", () => {
  it("종류별로 예상 색·근거 문구를 준다", () => {
    expect(expectedColorHint("red")).toContain("루비");
    expect(expectedColorHint("white")).toContain("레몬");
    expect(expectedColorHint("champagne")).toContain("기포");
  });

  it("종류를 모르면 null(안내 생략)", () => {
    expect(expectedColorHint(null)).toBeNull();
    expect(expectedColorHint(undefined)).toBeNull();
    expect(expectedColorHint("unknown-type")).toBeNull();
  });
});

describe("expectedAromasFor — 품종별 예상 향", () => {
  it("품종의 아로마 태그를 모은다", () => {
    const aromas = expectedAromasFor(["까베르네 소비뇽"]);
    expect(aromas).toContain("블랙커런트");
  });

  it("블렌드는 여러 품종의 향을 합치고 중복은 제거한다", () => {
    const aromas = expectedAromasFor(["메를로", "까베르네 소비뇽"]);
    // 메를로: 자두·블랙베리·초콜릿 → 까쇼의 블랙커런트가 뒤에 붙는다.
    expect(aromas).toContain("자두");
    expect(aromas).toContain("블랙커런트");
    expect(new Set(aromas).size).toBe(aromas.length); // 중복 없음
  });

  it("아는 향이 없으면 빈 배열", () => {
    expect(expectedAromasFor([])).toEqual([]);
    expect(expectedAromasFor([null, undefined, "듣도보도못한품종"])).toEqual([]);
  });
});

describe("expectedFlavorFor — 품종별 예상 맛", () => {
  it("품종의 산도·타닌·바디를 가져온다", () => {
    // 까베르네 소비뇽: 바디 묵직함 · 산도 중간 · 타닌 높음.
    expect(expectedFlavorFor(["까베르네 소비뇽"])).toMatchObject({
      body: "묵직함",
      acidity: "중간",
      tannin: "높음",
    });
  });

  it("블렌드는 비율이 앞선 품종의 값을 축마다 먼저 쓴다", () => {
    // 피노 누아(타닌 낮음)가 앞이면 뒤의 까쇼(타닌 높음)가 덮어쓰지 않는다.
    expect(expectedFlavorFor(["피노누아", "까베르네 소비뇽"]).tannin).toBe("낮음");
    expect(expectedFlavorFor(["까베르네 소비뇽", "피노누아"]).tannin).toBe("높음");
  });

  it("값이 없는 축은 비워 둬 예상을 지어내지 않는다", () => {
    // 소비뇽 블랑(화이트)엔 타닌 값이 없다.
    expect(expectedFlavorFor(["소비뇽 블랑"]).tannin).toBeUndefined();
    expect(expectedFlavorFor(["듣도보도못한품종"])).toEqual({});
  });
});

describe("flavorLevelWord — 느낀 정도를 말로", () => {
  it("낮은 쪽·중간·높은 쪽으로 나눈다", () => {
    expect(flavorLevelWord("acidity", 1)).toBe("부드럽다");
    expect(flavorLevelWord("acidity", 3)).toBe("중간");
    expect(flavorLevelWord("acidity", 5)).toBe("새콤하다");
    expect(flavorLevelWord("body", 2)).toBe("가볍다");
    expect(flavorLevelWord("body", 4)).toBe("묵직하다");
  });
});
