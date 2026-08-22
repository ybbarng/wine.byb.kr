import { describe, expect, it } from "vitest";
import {
  koreanKey,
  parseAbv,
  parseBlend,
  parseCsv,
  parseFrenchDate,
  parsePriceKRW,
  parseVintage,
  slugify,
  splitName,
} from "./normalize";

describe("parseFrenchDate", () => {
  it("프랑스어 날짜를 UTC Date로 옮긴다", () => {
    expect(parseFrenchDate("3 février 2025")?.toISOString()).toBe("2025-02-03T00:00:00.000Z");
    expect(parseFrenchDate("19 août 2025")?.toISOString()).toBe("2025-08-19T00:00:00.000Z");
    expect(parseFrenchDate("4 juillet 2025")?.toISOString()).toBe("2025-07-04T00:00:00.000Z");
  });

  it("악센트를 뗀 표기도 받는다", () => {
    expect(parseFrenchDate("8 aout 2025")?.toISOString()).toBe("2025-08-08T00:00:00.000Z");
  });

  it("형식이 어긋나면 null", () => {
    expect(parseFrenchDate("없음")).toBeNull();
    expect(parseFrenchDate("2025-08-01")).toBeNull();
  });
});

describe("parseAbv", () => {
  it("쉼표 소수점을 점으로 바꾼다", () => {
    expect(parseAbv("14,5")).toBe(14.5);
    expect(parseAbv("13,8")).toBe(13.8);
  });
  it("정수와 빈 값", () => {
    expect(parseAbv("6")).toBe(6);
    expect(parseAbv("")).toBeNull();
  });
});

describe("parsePriceKRW", () => {
  it("공백·기호를 떼고 숫자만 남긴다", () => {
    expect(parsePriceKRW("29 920 ₩")).toBe(29920);
    expect(parsePriceKRW("35 920 ₩")).toBe(35920);
    expect(parsePriceKRW("39,900원")).toBe(39900);
  });
  it("숫자가 없으면 null", () => {
    expect(parsePriceKRW("없음")).toBeNull();
  });
});

describe("parseVintage", () => {
  it("연도만 뽑는다", () => {
    expect(parseVintage("2018 (+6)")).toBe(2018);
    expect(parseVintage("2023")).toBe(2023);
  });
  it("없음/빈 값은 null", () => {
    expect(parseVintage("없음")).toBeNull();
    expect(parseVintage("")).toBeNull();
  });
});

describe("splitName", () => {
  it("한글 이름과 라틴 표기를 나눈다", () => {
    expect(splitName("신퀀타 꼴레지오네 Cinquanta Collezione")).toEqual({
      nameKo: "신퀀타 꼴레지오네",
      nameLocal: "Cinquanta Collezione",
    });
    expect(splitName("음 말벡 mmm! MALVEC")).toEqual({
      nameKo: "음 말벡",
      nameLocal: "mmm! MALVEC",
    });
  });

  it("라틴 표기가 없으면 nameLocal은 null", () => {
    expect(splitName("카멜로드 피노누아")).toEqual({
      nameKo: "카멜로드 피노누아",
      nameLocal: null,
    });
  });
});

describe("parseBlend", () => {
  it("이름·라틴·비율을 모두 뽑는다", () => {
    expect(parseBlend("프리미티보 Primitivo 50%, 네그로아마로 Negroamaro 50%")).toEqual([
      { nameKo: "프리미티보", nameLocal: "Primitivo", percent: 50 },
      { nameKo: "네그로아마로", nameLocal: "Negroamaro", percent: 50 },
    ]);
  });

  it("비율이 없으면 percent는 null", () => {
    expect(parseBlend("메를로, 까베르네 소비뇽, 산지오베제")).toEqual([
      { nameKo: "메를로", nameLocal: null, percent: null },
      { nameKo: "까베르네 소비뇽", nameLocal: null, percent: null },
      { nameKo: "산지오베제", nameLocal: null, percent: null },
    ]);
  });

  it("콤마 없이 붙은 여러 품종을 갈라낸다", () => {
    expect(parseBlend("까르미네르 90 까베르네 소비뇽 10")).toEqual([
      { nameKo: "까르미네르", nameLocal: null, percent: 90 },
      { nameKo: "까베르네 소비뇽", nameLocal: null, percent: 10 },
    ]);
  });

  it("% 기호가 없어도 숫자를 비율로 본다", () => {
    expect(parseBlend("멀롯 98, 카버네 소비뇽 1")).toEqual([
      { nameKo: "멀롯", nameLocal: null, percent: 98 },
      { nameKo: "카버네 소비뇽", nameLocal: null, percent: 1 },
    ]);
  });

  it("'기타' 항목은 버린다", () => {
    expect(parseBlend("산지오베제 85%, 기타 15%")).toEqual([
      { nameKo: "산지오베제", nameLocal: null, percent: 85 },
    ]);
  });

  it("서술형 블렌딩은 구조화하지 않는다", () => {
    expect(parseBlend("보르도 블렌딩(까소, 메를로, 까베르네 프랑)")).toEqual([]);
  });

  it("빈 문자열은 빈 배열", () => {
    expect(parseBlend("")).toEqual([]);
  });
});

describe("slugify", () => {
  it("라틴은 소문자 하이픈", () => {
    expect(slugify("Cinquanta Collezione")).toBe("cinquanta-collezione");
    expect(slugify("Chateau Talbot")).toBe("chateau-talbot");
  });
  it("한글은 남긴다", () => {
    expect(slugify("카멜로드 피노누아")).toBe("카멜로드-피노누아");
  });
});

describe("koreanKey", () => {
  it("한글·숫자만 남긴다", () => {
    expect(koreanKey("신퀀타 꼴레지오네 Cinquanta Collezione")).toBe("신퀀타꼴레지오네");
    expect(koreanKey("샤또생피에르13")).toBe("샤또생피에르13");
  });
});

describe("parseCsv", () => {
  it("따옴표 안의 콤마를 한 필드로 지킨다", () => {
    const rows = parseCsv('a,b,c\n"x,y",z,"14,5"');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x,y", "z", "14,5"],
    ]);
  });

  it("BOM을 떼어낸다", () => {
    const rows = parseCsv("﻿Nom,국가\n신퀀타,이탈리아");
    expect(rows[0]).toEqual(["Nom", "국가"]);
  });
});
