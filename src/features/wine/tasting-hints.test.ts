import { describe, expect, it } from "vitest";
import {
  agingColorNote,
  agingStage,
  expectedAromaGroups,
  expectedAromasFor,
  expectedColorHint,
  expectedFlavorFor,
  flavorLevelWord,
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
