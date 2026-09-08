import { describe, expect, it } from "vitest";
import { grapeInfo } from "./grape-info";
import { GLASS } from "./showcase-wines";
import { wineGlassFor } from "./wine-glass";

// DB 에 실제로 들어 있는 품종 표기. 코드 쪽 표와 표기가 흔들리는 것들을 골랐다.
// 정확히 일치로 찾으면 이것들이 조용히 빗나가 타입 기본값으로 떨어진다.
const DB_NAMES = {
  cabernet: "까베르네 소비뇽", // 표에는 "카베르네"(까/카)
  pinotNoir: "피노누아", // 표에는 "피노 누아"(띄어쓰기)
  riesling: "리즐링", // 표에는 "리슬링"(즐/슬)
  muscat: "무스캇", // 표에는 "모스카토"
  merlot: "메를로",
  sangiovese: "산지오베제",
} as const;

const RED_DEFAULT: [number, number, number] = [13, 60, 78];

describe("wineGlassFor — 품종 표기가 흔들려도 찾는다", () => {
  it("피노누아가 제 색과 부르고뉴 잔을 받는다", () => {
    // 표기가 어긋나면 색도 잔도 못 받고 레드 기본값으로 떨어진다. 여기가 그 관문.
    const spec = wineGlassFor("red", [DB_NAMES.pinotNoir]);
    expect(spec.glass).toBe(GLASS.burgundy);
    expect(spec.absorb).toEqual([9, 40, 52]);
    expect(spec.absorb).not.toEqual(RED_DEFAULT);
  });

  it("까베르네 소비뇽이 제 색을 받는다(까/카 표기 차이)", () => {
    expect(wineGlassFor("red", [DB_NAMES.cabernet]).absorb).toEqual([13, 60, 80]);
  });

  it("리즐링·무스캇이 제 색을 받는다", () => {
    expect(wineGlassFor("white", [DB_NAMES.riesling]).absorb).toEqual([1.4, 2.6, 10]);
    expect(wineGlassFor("dessert", [DB_NAMES.muscat]).absorb).toEqual([1.5, 3.0, 12]);
  });

  it("흑포도로 담근 옅은 술에 붉은색을 씌우지 않는다", () => {
    // 블랑 드 누아 샴페인(알랭 바이 퀴베 페트로니유)의 대표 품종이 피노누아다.
    // 껍질을 안 담갔으니 짙은 루비가 아니라 샴페인 기본색이어야 한다.
    expect(wineGlassFor("champagne", [DB_NAMES.pinotNoir]).absorb).toEqual([1.4, 3.0, 12]);
    // 직압 로제(메종 카스텔 메를로 로제)도 마찬가지 — 연분홍이지 짙은 자주가 아니다.
    expect(wineGlassFor("rose", [DB_NAMES.merlot]).absorb).toEqual([3.5, 10, 8.5]);
  });

  it("산지오베제·네비올로도 부르고뉴 잔", () => {
    expect(wineGlassFor("red", [DB_NAMES.sangiovese]).glass).toBe(GLASS.burgundy);
    expect(wineGlassFor("red", ["네비올로"]).glass).toBe(GLASS.burgundy);
  });

  it("메를로는 보르도 잔(넓은 볼 품종이 아니다)", () => {
    expect(wineGlassFor("red", [DB_NAMES.merlot]).glass).toBe(GLASS.bordeaux);
  });

  it("비슷한 이름끼리 섞이지 않는다", () => {
    // 피노 계열이 여럿이라 부분 일치가 헛짚기 쉽다.
    expect(wineGlassFor("red", ["피노타지"]).glass).toBe(GLASS.bordeaux);
    expect(wineGlassFor("white", ["피노그리"]).absorb).toEqual([1.6, 3.2, 13]); // 화이트 기본
    // 까베르네 프랑은 까베르네 소비뇽 색을 가져오면 안 된다
    expect(wineGlassFor("red", ["까베르네 프랑"]).absorb).toEqual(RED_DEFAULT);
  });
});

describe("wineGlassFor — 타입 기본값", () => {
  it("품종이 없으면 타입 기본 색·잔을 쓴다", () => {
    expect(wineGlassFor("red")).toEqual({ absorb: RED_DEFAULT, glass: GLASS.bordeaux });
    expect(wineGlassFor("white")).toEqual({ absorb: [1.6, 3.2, 13], glass: GLASS.white });
    expect(wineGlassFor("sparkling").glass).toBe(GLASS.flute);
  });

  it("타입이 없거나 모르는 타입이면 레드 기본값으로 돌아간다", () => {
    const red = { absorb: RED_DEFAULT, glass: GLASS.bordeaux };
    expect(wineGlassFor(null)).toEqual(red);
    expect(wineGlassFor(undefined)).toEqual(red);
    expect(wineGlassFor("모르는타입")).toEqual(red);
  });
});

describe("wineGlassFor — 우선순위", () => {
  it("대표 품종은 첫 번째 하나만 본다", () => {
    expect(wineGlassFor("red", [DB_NAMES.merlot, DB_NAMES.cabernet]).absorb).toEqual([16, 78, 98]);
  });

  it("DB 색(colorHex)이 품종 추정을 이긴다", () => {
    const withHex = wineGlassFor("red", [DB_NAMES.pinotNoir], null, "#7a1f2b");
    expect(withHex.absorb).not.toEqual([9, 40, 52]);
    expect(withHex.glass).toBe(GLASS.burgundy); // 잔은 그대로 품종 기준
  });

  it("와인별 특수색(slug)이 품종 추정을 이긴다", () => {
    // 로제 샴페인은 피노 계열이라 품종색을 쓰면 어두워진다.
    const gosset = wineGlassFor("champagne", ["피노누아"], "gosset-grand-rose-brut");
    expect(gosset.absorb).toEqual([2.4, 7, 6]);
  });

  it("모르는 품종은 타입 기본값", () => {
    expect(wineGlassFor("red", ["듣도보도못한품종"]).absorb).toEqual(RED_DEFAULT);
    expect(wineGlassFor("red", []).absorb).toEqual(RED_DEFAULT);
  });

  it("레드가 아니면 넓은 볼로 바꾸지 않는다", () => {
    // 블랑 드 누아 샴페인처럼 흑포도로 만든 화이트·스파클링이 있다.
    expect(wineGlassFor("champagne", ["피노누아"]).glass).toBe(GLASS.flute);
  });
});

describe("grapeInfo — 같은 정규화를 쓴다", () => {
  it("DB 표기 그대로 넣어도 찾는다", () => {
    for (const n of Object.values(DB_NAMES)) {
      expect(grapeInfo(n), n).not.toBeNull();
    }
  });
});
