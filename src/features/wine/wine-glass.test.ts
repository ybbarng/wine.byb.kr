import { describe, expect, it } from "vitest";
import { GLASS } from "./showcase-wines";
import { wineGlassFor } from "./wine-glass";

describe("wineGlassFor", () => {
  it("품종이 없으면 타입 기본 색·잔을 쓴다", () => {
    expect(wineGlassFor("red")).toEqual({ absorb: [13, 60, 78], glass: GLASS.bordeaux });
    expect(wineGlassFor("white")).toEqual({ absorb: [1.6, 3.2, 13], glass: GLASS.white });
    expect(wineGlassFor("sparkling").glass).toBe(GLASS.flute);
  });

  it("대표 품종(첫 번째)의 색이 타입 기본 색보다 우선한다", () => {
    // 메를로는 GRAPE_ABSORB에 있으므로 그 값을 쓴다.
    expect(wineGlassFor("red", ["메를로"]).absorb).toEqual([16, 78, 98]);
    // 첫 품종만 반영한다.
    expect(wineGlassFor("red", ["메를로", "카베르네 소비뇽"]).absorb).toEqual([16, 78, 98]);
  });

  it("모르는 품종이면 타입 기본 색으로 남는다", () => {
    expect(wineGlassFor("red", ["없는품종"]).absorb).toEqual([13, 60, 78]);
  });

  it("레드 + 아로마틱 품종은 부르고뉴 잔을 쓴다", () => {
    expect(wineGlassFor("red", ["피노 누아"]).glass).toBe(GLASS.burgundy);
    expect(wineGlassFor("red", ["네비올로"]).glass).toBe(GLASS.burgundy);
    // 부르고뉴 규칙에 없는 레드 품종은 보르도 잔.
    expect(wineGlassFor("red", ["카베르네 소비뇽"]).glass).toBe(GLASS.bordeaux);
  });

  it("부르고뉴 잔 규칙은 레드에만 적용된다", () => {
    // 화이트 타입은 아로마틱 품종이 와도 화이트 잔을 유지.
    expect(wineGlassFor("white", ["피노 누아"]).glass).toBe(GLASS.white);
  });

  it("타입이 없거나 모르는 타입이면 레드 기본값으로 돌아간다", () => {
    const red = { absorb: [13, 60, 78], glass: GLASS.bordeaux };
    expect(wineGlassFor(null)).toEqual(red);
    expect(wineGlassFor(undefined)).toEqual(red);
    expect(wineGlassFor("모르는타입")).toEqual(red);
  });
});
