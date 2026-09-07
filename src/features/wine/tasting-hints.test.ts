import { describe, expect, it } from "vitest";
import { expectedColorHint } from "./tasting-hints";

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
