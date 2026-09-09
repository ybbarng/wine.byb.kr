import { describe, expect, it } from "vitest";
import { ALL_PALETTE_AROMAS } from "./aroma-palette";
import {
  parseWinemaking,
  serializeWinemaking,
  winemakingAromas,
  winemakingFlavorNote,
  winemakingLabel,
  winemakingWhy,
} from "./winemaking";

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
    expect(parseWinemaking("깨진 JSON")).toEqual([]);
    expect(parseWinemaking('{"lees":true}')).toEqual([]); // 배열이 아님
    expect(parseWinemaking(null)).toEqual([]);
  });

  it("빈 배열은 null 로 저장한다(= 모름)", () => {
    expect(serializeWinemaking([])).toBeNull();
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

  it("팔레트가 이 향을 모두 담는다", () => {
    // 안 담기면 "예상에는 뜨는데 고를 수 없는 향"이 된다(aroma-palette.ts 참고).
    const missing = winemakingAromas(["lees", "appassimento"]).filter(
      (a) => !ALL_PALETTE_AROMAS.includes(a)
    );
    expect(missing, `팔레트에 없는 향: ${missing.join(", ")}`).toEqual([]);
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
