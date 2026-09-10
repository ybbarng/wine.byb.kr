import { describe, expect, it } from "vitest";
import { ALL_PALETTE_AROMAS } from "@/features/wine/aroma-palette";
import {
  ALL_WINEMAKING_TAGS,
  parseWinemaking,
  serializeWinemaking,
  winemakingAromas,
  winemakingFlavorNote,
  winemakingLabel,
  winemakingWhy,
} from "@/features/wine/winemaking";

describe("parseWinemaking / serializeWinemaking", () => {
  it("돌아온다", () => {
    expect(parseWinemaking(serializeWinemaking(["lees"]))).toEqual(["lees"]);
    expect(parseWinemaking(serializeWinemaking(["lees", "appassimento"]))).toEqual([
      "lees",
      "appassimento",
    ]);
  });

  it("모르는 값·깨진 JSON 은 버린다 — 모르면 말하지 않는다", () => {
    expect(parseWinemaking('["lees","존재하지않는기법"]')).toEqual(["lees"]);
    // `in` 을 쓰면 프로토타입 체인이 걸려 이것들이 통과한다 → 화면에 함수 소스가 찍힌다.
    expect(parseWinemaking('["constructor","toString","hasOwnProperty"]')).toEqual([]);
    expect(parseWinemaking("깨진 JSON")).toEqual([]);
    expect(parseWinemaking('{"lees":true}')).toEqual([]); // 배열이 아님
    expect(parseWinemaking(null)).toEqual([]);
  });

  it("빈 배열은 null 로 저장한다(= 모름)", () => {
    expect(serializeWinemaking([])).toBeNull();
  });

  it("같은 태그가 두 번 들어와도 한 번만 센다", () => {
    // 안 걸러내면 "효모 숙성·효모 숙성" 처럼 근거 문구가 두 번 붙는다.
    expect(serializeWinemaking(["lees", "lees"])).toBe('["lees"]');
    expect(parseWinemaking('["lees","lees"]')).toEqual(["lees"]);
  });
});

describe("winemakingAromas — 양조에서 오는 향", () => {
  it("기법마다 다른 향을 준다", () => {
    expect(winemakingAromas(["lees"])).toContain("빵");
    expect(winemakingAromas(["appassimento"])).toContain("건포도");
    expect(winemakingAromas(["lees"])).not.toContain("건포도");
  });

  it("여러 기법이면 합치되 중복은 없다", () => {
    const all = winemakingAromas(["lees", "appassimento"]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("태그가 없으면 빈 배열", () => {
    expect(winemakingAromas([])).toEqual([]);
  });

  it("팔레트가 **모든 태그의** 향을 담는다", () => {
    // 태그를 하드코딩하면 새 태그를 추가할 때 아무도 안 잡는다. 정의된 전부를 순회한다.
    // 안 담기면 "예상에는 뜨는데 고를 수 없는 향"이 된다(aroma-palette.ts 참고).
    const missing = winemakingAromas(ALL_WINEMAKING_TAGS).filter(
      (a) => !ALL_PALETTE_AROMAS.includes(a)
    );
    expect(missing, `팔레트에 없는 향: ${missing.join(", ")}`).toEqual([]);
  });

  it("정의된 태그마다 이름·근거·향이 있다", () => {
    for (const t of ALL_WINEMAKING_TAGS) {
      expect(winemakingAromas([t]).length, t).toBeGreaterThan(0);
      expect(winemakingLabel([t]), t).toBeTruthy();
      expect(winemakingWhy([t]), t).toBeTruthy();
    }
  });
});

describe("근거·안내 문구", () => {
  it("무엇에서 오는지 이름을 밝힌다", () => {
    expect(winemakingLabel(["lees"])).toBe("효모 숙성");
    expect(winemakingLabel(["lees", "appassimento"])).toBe("효모 숙성·포도 말리기");
    expect(winemakingLabel([])).toBeNull();
  });

  it("왜 그런지를 함께 적는다 — 근거 없이 단정하지 않는다", () => {
    expect(winemakingWhy(["lees"])).toContain("효모");
    expect(winemakingWhy(["appassimento"])).toContain("말려");
    expect(winemakingWhy([])).toBeNull();
  });

  it("맛·질감 안내도 준다", () => {
    expect(winemakingFlavorNote(["lees"])).toContain("크리미");
    expect(winemakingFlavorNote([])).toBeNull();
  });
});
