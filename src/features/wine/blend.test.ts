import { describe, expect, it } from "vitest";
import { levelOf, splitBlend, wordOf } from "./blend";

// DB 에 실제로 들어 있는 블렌드로 확인한다 — 문턱은 이 와인들을 뜻대로 가르도록 잡았다.
describe("splitBlend — 주 품종과 곁들임을 가른다", () => {
  it("고르게 섞인 와인은 모두 주 품종", () => {
    // 제라르 베르트랑 GSM 40/30/30 — 셋 다 이 와인의 얼굴이다.
    const b = splitBlend([
      { name: "쉬라즈", percent: 40 },
      { name: "무르베드르", percent: 30 },
      { name: "그르나슈", percent: 30 },
    ]);
    expect(b.lead).toEqual(["쉬라즈", "무르베드르", "그르나슈"]);
    expect(b.leadPercents).toEqual([40, 30, 30]);
    expect(b.support).toEqual([]);
  });

  it("거의 단일인 와인은 곁들임을 걸러낸다", () => {
    // 덕혼 디코이 98/1/1 — 1%짜리 향까지 "예상"이라 하면 사실이 아니다.
    const b = splitBlend([
      { name: "메를로", percent: 98 },
      { name: "까베르네 소비뇽", percent: 1 },
    ]);
    expect(b.lead).toEqual(["메를로"]);
    expect(b.support).toEqual(["까베르네 소비뇽"]);
  });

  it("주 품종이 뚜렷한 여러 품종 블렌드", () => {
    // 기갈 코트 뒤 론 블랑 70/10/9/8/3 — 비오니에의 와인이다.
    const b = splitBlend([
      { name: "비오니에", percent: 70 },
      { name: "루산느", percent: 10 },
      { name: "마르산느", percent: 9 },
      { name: "끌레레뜨", percent: 8 },
      { name: "부르불랑", percent: 3 },
    ]);
    expect(b.lead).toEqual(["비오니에"]);
    expect(b.support).toHaveLength(4);
  });

  it("비율이 낮아도 가장 높은 품종은 주 품종", () => {
    // 문턱만 보면 전부 곁들임이 되어 얼굴이 없는 와인이 된다.
    const b = splitBlend([
      { name: "가", percent: 15 },
      { name: "나", percent: 10 },
    ]);
    expect(b.lead).toEqual(["가"]);
  });

  it("비율을 모르면 저장된 순서의 첫 품종을 주 품종으로 본다", () => {
    // 샤또 딸보 — 비율이 없다. 조회가 비율 내림차순이라 첫 품종이 대표일 가능성이 높다.
    const b = splitBlend([
      { name: "까베르네 소비뇽" },
      { name: "메를로" },
      { name: "쁘띠 베르도" },
      { name: "까베르네 프랑" },
    ]);
    expect(b.lead).toEqual(["까베르네 소비뇽"]);
    expect(b.support).toEqual(["메를로", "쁘띠 베르도", "까베르네 프랑"]);
  });

  it("비율이 뒤섞여 들어와도 높은 순으로 본다", () => {
    const b = splitBlend([
      { name: "적게", percent: 20 },
      { name: "많이", percent: 80 },
    ]);
    expect(b.lead).toEqual(["많이", "적게"]);
  });

  it("비율을 모르면 무게도 비운다", () => {
    const b = splitBlend([{ name: "가" }, { name: "나" }]);
    expect(b.leadPercents).toEqual([null]);
  });

  it("단일 품종·빈 목록", () => {
    expect(splitBlend([{ name: "템프라니요" }])).toEqual({
      lead: ["템프라니요"],
      leadPercents: [null],
      support: [],
    });
    expect(splitBlend([])).toEqual({ lead: [], leadPercents: [], support: [] });
    expect(splitBlend([{ name: "  " }])).toEqual({ lead: [], leadPercents: [], support: [] });
  });
});

describe("levelOf / wordOf — 말과 눈금 사이", () => {
  it("큐레이션에 쓰는 말을 모두 읽는다", () => {
    expect(levelOf("낮음")).toBe(1);
    expect(levelOf("가벼움")).toBe(1);
    expect(levelOf("중간")).toBe(2);
    expect(levelOf("높음")).toBe(3);
    expect(levelOf("묵직함")).toBe(3);
  });

  it("범위 표현은 가운데로 본다", () => {
    expect(levelOf("가벼움~중간")).toBe(1.5);
    expect(levelOf("중간~높음")).toBe(2.5);
  });

  it("모르는 말은 null — 지어내지 않는다", () => {
    expect(levelOf("아주높음")).toBeNull();
    expect(levelOf(null)).toBeNull();
    expect(levelOf("")).toBeNull();
  });

  it("눈금을 말로 되돌린다(축마다 표현이 다르다)", () => {
    expect(wordOf(1, "other")).toBe("낮음");
    expect(wordOf(1, "body")).toBe("가벼움");
    expect(wordOf(3, "body")).toBe("묵직함");
    expect(wordOf(2, "other")).toBe("중간");
  });

  it("치우친 평균은 치우친 대로 적는다", () => {
    // 정보를 "중간" 한 마디로 뭉개지 않는다.
    expect(wordOf(1.5, "other")).toBe("낮음~중간");
    expect(wordOf(2.5, "other")).toBe("중간~높음");
    expect(wordOf(2.5, "body")).toBe("중간~묵직함");
  });

  it("말 → 눈금 → 말 이 그대로 돌아온다", () => {
    for (const w of ["낮음", "중간", "높음"]) {
      expect(wordOf(levelOf(w) as number, "other"), w).toBe(w);
    }
    for (const w of ["가벼움", "중간", "묵직함"]) {
      expect(wordOf(levelOf(w) as number, "body"), w).toBe(w);
    }
  });
});
