import { describe, expect, it } from "vitest";
import {
  abvNote,
  agingColorNote,
  agingStage,
  climateAromaNote,
  climateBand,
  climateFlavorNote,
  expectedAromaGroups,
  expectedAromasFor,
  expectedColorHint,
  expectedFlavorFor,
  flavorLevelWord,
  labelSweetness,
  oakNone,
  sweetnessBreadthNote,
  wineAgeYears,
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

  it("품종이 못 정하는 단맛은 예상으로 내놓지 않는다", () => {
    // "드라이~스위트"를 그대로 보여주면 다섯 칸 전부를 가리켜 고르기만 어려워진다.
    expect(expectedFlavorFor(["리즐링"]).sweetness).toBeUndefined();
    expect(expectedFlavorFor(["무스캇"]).sweetness).toBeUndefined();
    // 다른 축은 그대로 온다.
    expect(expectedFlavorFor(["리즐링"]).acidity).toBe("높음");
  });

  it("한 가지로 정해지는 단맛은 그대로 쓴다", () => {
    expect(expectedFlavorFor(["브라케토"]).sweetness).toBe("스위트");
  });

  it("디저트 와인은 종류만으로 달다는 걸 안다", () => {
    // 모스카토 다스티: 품종(무스캇)은 폭이 넓지만 디저트로 분류된 이상 달다.
    expect(expectedFlavorFor(["무스캇"], { type: "dessert" }).sweetness).toBe("달다");
    // 같은 품종이라도 화이트로 분류됐으면 종류가 정해주지 못한다.
    expect(expectedFlavorFor(["무스캇"], { type: "white" }).sweetness).toBeUndefined();
  });

  it("라벨에 표기가 있으면 그게 품종보다 앞선다", () => {
    const spec = expectedFlavorFor(["리즐링"], {
      label: ["Mineralschiefer Riesling trocken", "Mosel QbA"],
    });
    expect(spec.sweetness).toBe("드라이");
  });
});

describe("labelSweetness — 라벨에서 단맛 읽기", () => {
  it("독일 표기", () => {
    expect(labelSweetness("Riesling trocken")).toBe("드라이");
    // halbtrocken 안에 trocken 이 들어 있다 — 긴 표기를 먼저 봐야 한다.
    expect(labelSweetness("Riesling halbtrocken")).toBe("약간 단맛");
    expect(labelSweetness("Riesling feinherb")).toBe("약간 단맛");
    expect(labelSweetness("Riesling Auslese")).toBe("달다");
  });

  it("스파클링 표기", () => {
    expect(labelSweetness("Champagne Brut")).toBe("드라이");
    expect(labelSweetness("Brut Nature")).toBe("드라이");
    expect(labelSweetness("Demi-Sec")).toBe("약간 단맛");
  });

  it("표기가 없으면 null — 지어내지 않는다", () => {
    expect(labelSweetness("Pikes Clare Valley Riesling")).toBeNull();
    expect(labelSweetness(null, undefined, "")).toBeNull();
  });
});

describe("sweetnessBreadthNote — 폭이 넓다는 안내", () => {
  it("품종이 못 정하면 라벨을 보라고 알린다", () => {
    const note = sweetnessBreadthNote(["리즐링"], { label: ["Pikes Clare Valley Riesling"] });
    expect(note).toContain("리즐링");
    expect(note).toContain("라벨");
  });

  it("라벨에서 이미 읽어냈으면 말하지 않는다", () => {
    expect(sweetnessBreadthNote(["리즐링"], { label: ["Riesling trocken"] })).toBeNull();
    // 종류로 알아낸 경우도 마찬가지.
    expect(sweetnessBreadthNote(["무스캇"], { type: "dessert" })).toBeNull();
  });

  it("폭이 넓지 않은 품종이면 말하지 않는다", () => {
    expect(sweetnessBreadthNote(["까베르네 소비뇽"], { label: ["Cabernet Sauvignon"] })).toBeNull();
    expect(sweetnessBreadthNote([])).toBeNull();
  });
});

describe("wineAgeYears — 빈티지로 나이 재기", () => {
  it("마신 해에서 빈티지를 뺀다", () => {
    expect(wineAgeYears(2015, "2026-09-07")).toBe(11);
    expect(wineAgeYears(2024, "2026-01-02")).toBe(2);
    // 같은 해에 마시면 0년(햇와인).
    expect(wineAgeYears(2026, "2026-05-01")).toBe(0);
  });

  it("빈티지가 없거나 앞날이면 null(숙성 안내 생략)", () => {
    expect(wineAgeYears(null, "2026-09-07")).toBeNull();
    expect(wineAgeYears(undefined, "2026-09-07")).toBeNull();
    // 마신 날보다 뒤인 빈티지는 잘못 적은 값이라 다루지 않는다.
    expect(wineAgeYears(2030, "2026-09-07")).toBeNull();
  });
});

describe("agingStage — 나이 구간", () => {
  it("3년까지 어림 · 8년까지 익어가는 중 · 그 뒤는 무르익음", () => {
    expect(agingStage(0)).toBe("young");
    expect(agingStage(3)).toBe("young");
    expect(agingStage(4)).toBe("developing");
    expect(agingStage(8)).toBe("developing");
    expect(agingStage(9)).toBe("mature");
    expect(agingStage(25)).toBe("mature");
  });
});

describe("expectedAromaGroups — 출처(품종·숙성)별 예상 향", () => {
  it("품종 향과 숙성 향을 나눠 근거와 함께 담는다", () => {
    const groups = expectedAromaGroups({
      grapes: ["까베르네 소비뇽"],
      type: "red",
      vintageYear: 2010,
      drankOn: "2026-09-07",
    });
    expect(groups).toHaveLength(2);
    expect(groups[0].source).toBe("품종에서");
    expect(groups[0].why).toContain("까베르네 소비뇽"); // 어느 품종인지 근거로 밝힌다
    expect(groups[0].aromas).toContain("블랙커런트");
    expect(groups[1].source).toContain("숙성");
    expect(groups[1].source).toContain("16년");
    expect(groups[1].aromas).toContain("가죽");
  });

  it("빈티지를 모르면 숙성 묶음을 만들지 않는다", () => {
    const groups = expectedAromaGroups({ grapes: ["까베르네 소비뇽"], type: "red" });
    expect(groups.map((g) => g.source)).toEqual(["품종에서"]);
  });

  it("어린 와인은 숙성에서 더할 향이 없다", () => {
    const groups = expectedAromaGroups({
      grapes: ["까베르네 소비뇽"],
      type: "red",
      vintageYear: 2025,
      drankOn: "2026-09-07",
    });
    expect(groups.map((g) => g.source)).toEqual(["품종에서"]);
  });

  it("품종 향과 겹치는 숙성 향은 한 번만 보여준다", () => {
    // 샤르도네엔 이미 '꿀'이 없지만, 겹칠 때 중복되지 않는지 확인한다.
    const groups = expectedAromaGroups({
      grapes: ["푸르민트"], // 사과·배·꿀
      type: "white",
      vintageYear: 2010,
      drankOn: "2026-09-07",
    });
    const all = groups.flatMap((g) => g.aromas);
    expect(new Set(all).size).toBe(all.length);
  });

  it("레드와 화이트의 숙성 향이 다르다", () => {
    const red = expectedAromaGroups({
      grapes: ["메를로"],
      type: "red",
      vintageYear: 2010,
      drankOn: "2026-09-07",
    });
    const white = expectedAromaGroups({
      grapes: ["샤르도네"],
      type: "white",
      vintageYear: 2010,
      drankOn: "2026-09-07",
    });
    expect(red[1].aromas).toContain("가죽");
    expect(white[1].aromas).toContain("견과");
  });
});

describe("오크에서 오는 향", () => {
  it("오크를 쓴 와인만 오크 묶음이 붙고, 정도에 따라 향이 다르다", () => {
    const light = expectedAromaGroups({
      grapes: ["샤르도네"],
      type: "white",
      oakAging: "light",
    });
    const heavy = expectedAromaGroups({
      grapes: ["샤르도네"],
      type: "white",
      oakAging: "heavy",
    });
    expect(light.map((g) => g.source)).toContain("오크에서");
    expect(light.find((g) => g.source === "오크에서")?.aromas).toEqual(["바닐라", "토스트"]);
    expect(heavy.find((g) => g.source === "오크에서")?.aromas).toContain("훈연");
  });

  it("오크를 안 썼거나(none) 모르면(null) 오크 묶음이 없다", () => {
    for (const oakAging of ["none", null, undefined]) {
      const groups = expectedAromaGroups({ grapes: ["샤르도네"], type: "white", oakAging });
      expect(groups.map((g) => g.source)).not.toContain("오크에서");
    }
  });

  it("오크를 안 쓴 샤르도네엔 버터·오크 향이 뜨지 않는다(원래 문제)", () => {
    // 오크 유래 향을 품종 아로마에서 뺐으므로, 샤블리 같은 무오크 와인엔 안 나온다.
    const aromas = expectedAromaGroups({
      grapes: ["샤르도네"],
      type: "white",
      oakAging: "none",
    }).flatMap((g) => g.aromas);
    expect(aromas).not.toContain("버터");
    expect(aromas).not.toContain("오크");
    expect(aromas).toContain("사과"); // 품종 향 자체는 그대로
  });

  it("오크와 숙성 향이 겹치면 앞선 묶음에만 넣는다", () => {
    // 오크(heavy)의 토스트와 화이트 숙성 향의 토스트가 겹친다.
    const groups = expectedAromaGroups({
      grapes: ["샤르도네"],
      type: "white",
      oakAging: "heavy",
      vintageYear: 2010,
      drankOn: "2026-09-07",
    });
    const all = groups.flatMap((g) => g.aromas);
    expect(new Set(all).size).toBe(all.length);
    expect(groups.find((g) => g.source === "오크에서")?.aromas).toContain("토스트");
    expect(groups.find((g) => g.source.startsWith("숙성"))?.aromas).not.toContain("토스트");
  });

  it("oakNone 은 '안 썼다고 아는' 경우만 참", () => {
    expect(oakNone("none")).toBe(true);
    expect(oakNone("light")).toBe(false);
    expect(oakNone(null)).toBe(false); // 모르는 것과 안 쓴 것은 다르다
  });
});

describe("climateBand — 산지 기후 가르기", () => {
  it("서늘한 산지와 따뜻한 산지를 가른다", () => {
    expect(climateBand("샤블리")).toBe("cool"); // "프랑스 최북단, 서늘하고 일조가 짧다"
    expect(climateBand("뿔리아")).toBe("warm"); // "덥고 건조한 남부"
  });

  it("서늘·따뜻이 함께 적힌 곳은 편차가 크다는 뜻이라 moderate", () => {
    expect(climateBand("캘리포니아")).toBe("moderate"); // "해안 서늘~내륙 따뜻, 편차가 크다"
  });

  it("모르는 산지는 null(기후 얘기 생략)", () => {
    expect(climateBand("듣도보도못한산지")).toBeNull();
    expect(climateBand(null)).toBeNull();
  });
});

describe("기후 안내 — 값을 바꾸지 않고 치우칠 방향만", () => {
  it("서늘한 산지는 산도가 또렷·바디는 가볍다고 안내", () => {
    const note = climateFlavorNote("샤블리");
    expect(note).toContain("산도");
    expect(note).toContain("또렷");
  });

  it("따뜻한 산지는 과실이 잘 익는다고 안내", () => {
    expect(climateAromaNote("뿔리아")).toContain("잘 익어");
  });

  it("온화하거나 모르는 산지는 덧붙일 말이 없다", () => {
    expect(climateFlavorNote("캘리포니아")).toBeNull();
    expect(climateAromaNote("듣도보도못한산지")).toBeNull();
  });
});

describe("abvNote — 도수가 질감에 남기는 결", () => {
  it("높은 도수는 묵직함·따뜻한 기운을 알려준다", () => {
    expect(abvNote(14.5)).toContain("묵직");
    expect(abvNote(15)).toContain("15도");
  });

  it("낮은 도수는 가벼움을 알려준다", () => {
    expect(abvNote(5.5)).toContain("가볍");
    expect(abvNote(10)).toContain("가볍");
  });

  it("보통 범위는 굳이 말하지 않는다", () => {
    expect(abvNote(12)).toBeNull();
    expect(abvNote(13)).toBeNull();
    expect(abvNote(null)).toBeNull();
  });
});

describe("agingColorNote — 나이가 색에 남긴 흔적", () => {
  it("오래된 레드는 벽돌빛, 화이트는 짙은 황금빛", () => {
    expect(agingColorNote(15, "red")).toContain("벽돌빛");
    expect(agingColorNote(15, "white")).toContain("황금빛");
  });

  it("어린 와인은 덧붙일 말이 없다", () => {
    expect(agingColorNote(1, "red")).toBeNull();
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
