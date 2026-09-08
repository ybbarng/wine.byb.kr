import { describe, expect, it } from "vitest";
import { DEFAULT_ABV, deriveLegs, LEG_FLOOR } from "./legs";

// 실제 DB 에 들어 있는 도수 범위를 기준으로 본다.
const MOSCATO = 5.5; // 토스티 모스카토 다스티 — 눈물이 거의 없다
const CHABLIS = 12.5; // 도멘 라로슈 샤블리
const CABERNET = 13.5; // 흔한 레드
const ZINFANDEL = 15.5; // 프리시전 네비게이터 진판델 — 굵고 느린 눈물

describe("deriveLegs — 도수가 높을수록 뚜렷하고 느리다", () => {
  it("도수가 오르면 눈물이 진해진다", () => {
    const weak = deriveLegs(MOSCATO);
    const mid = deriveLegs(CABERNET);
    const strong = deriveLegs(ZINFANDEL);
    expect(weak.strength).toBeLessThan(mid.strength);
    expect(mid.strength).toBeLessThan(strong.strength);
  });

  it("도수가 오르면 방울이 천천히 내려오고 늦게 마른다", () => {
    // 에탄올·글리세롤이 많으면 띠가 두껍고 점성이 커진다.
    const weak = deriveLegs(MOSCATO);
    const strong = deriveLegs(ZINFANDEL);
    expect(strong.dripRate).toBeLessThan(weak.dripRate);
    expect(strong.dryRate).toBeLessThan(weak.dryRate);
  });

  it("모스카토는 사실상 눈물이 없다", () => {
    // 8% 아래는 물처럼 미끄러져 내린다. 벽이 젖은 흔적만 남긴다.
    expect(deriveLegs(MOSCATO).strength).toBe(LEG_FLOOR);
  });

  it("15% 위로는 더 세지지 않는다", () => {
    expect(deriveLegs(ZINFANDEL).strength).toBe(1);
    expect(deriveLegs(20).strength).toBe(1);
  });

  it("샤블리는 그 사이 어딘가", () => {
    const s = deriveLegs(CHABLIS).strength;
    expect(s).toBeGreaterThan(LEG_FLOOR);
    expect(s).toBeLessThan(1);
  });
});

describe("deriveLegs — 도수를 모를 때", () => {
  it("빈 값은 흔한 식탁 와인으로 본다", () => {
    // 데이터가 빈 것이 화면에서 "도수 낮은 와인"으로 읽히면 안 된다.
    const fallback = deriveLegs(DEFAULT_ABV);
    expect(deriveLegs(null)).toEqual(fallback);
    expect(deriveLegs(undefined)).toEqual(fallback);
    expect(deriveLegs(Number.NaN)).toEqual(fallback);
  });

  it("기본값은 모스카토보다 뚜렷하다", () => {
    expect(deriveLegs(null).strength).toBeGreaterThan(deriveLegs(MOSCATO).strength);
  });
});
