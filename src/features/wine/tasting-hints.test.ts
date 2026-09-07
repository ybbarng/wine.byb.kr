import { describe, expect, it } from "vitest";
import { expectedAromasFor, expectedColorHint } from "./tasting-hints";

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
