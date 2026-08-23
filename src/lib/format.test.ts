import { describe, expect, it } from "vitest";
import { formatDate, formatKRW, joinDot } from "./format";
import { wineTypeLabel } from "./wine";

describe("formatKRW", () => {
  it("천 단위 쉼표 + 원", () => {
    expect(formatKRW(31920)).toBe("31,920원");
    expect(formatKRW(0)).toBe("0원");
  });
  it("null은 빈 문자열", () => {
    expect(formatKRW(null)).toBe("");
  });
});

describe("formatDate", () => {
  it("UTC 기준 YYYY.MM.DD", () => {
    expect(formatDate(new Date("2025-04-19T00:00:00.000Z"))).toBe("2025.04.19");
  });
  it("null은 빈 문자열", () => {
    expect(formatDate(null)).toBe("");
  });
});

describe("joinDot", () => {
  it("빈 값은 건너뛰고 잇는다", () => {
    expect(joinDot("레드", "", "14.5%", null, "프랑스")).toBe("레드 · 14.5% · 프랑스");
  });
});

describe("wineTypeLabel", () => {
  it("코드를 한국어로", () => {
    expect(wineTypeLabel("red")).toBe("레드");
    expect(wineTypeLabel("champagne")).toBe("샴페인");
  });
  it("모르는/빈 값", () => {
    expect(wineTypeLabel(null)).toBe("기타");
    expect(wineTypeLabel("orange")).toBe("orange");
  });
});
