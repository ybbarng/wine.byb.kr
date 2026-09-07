import { describe, expect, it } from "vitest";
import {
  buildTastingNoteUpdate,
  parseAromas,
  parseFlavor,
  serializeAromas,
  serializeFlavor,
  type TastingNoteInput,
} from "./tasting-note-schema";

// 편집 저장(PATCH) 부분 갱신 — 회귀 방지.
// 과거: 폼이 안 보낸 칸까지 null 로 덮어써 리뷰 내용(별점·색·안주 등)이 유실됐다.
// 지금: 요청 본문에 실제로 온 칸만 갱신하고, 안 온 칸은 결과에서 빠져 그대로 보존된다.
const asInput = (o: Record<string, unknown>) => o as unknown as TastingNoteInput;

describe("buildTastingNoteUpdate — 편집은 온 칸만 바꾼다(유실 방지)", () => {
  it("요청에 없는 칸은 결과에 포함되지 않는다(=DB 값 보존)", () => {
    const raw = { wineId: "w1", rating: 3 };
    const out = buildTastingNoteUpdate(raw, asInput({ wineId: "w1", rating: 3 }));
    expect(out).toEqual({ wineId: "w1", rating: 3 });
    // 안 보낸 칸들은 결과에 없어야 update 가 건드리지 않는다.
    for (const k of ["colorHex", "bodyText", "value", "repurchase", "foodPaired", "drankOn"]) {
      expect(Object.hasOwn(out, k)).toBe(false);
    }
  });

  it("칸이 왔지만 값이 비어 있으면 null 로 지운다(명시적 clear만 허용)", () => {
    // 폼이 colorHex 키를 빈 값으로 보냄 → 스키마가 undefined 로 정규화 → 의도된 삭제.
    const out = buildTastingNoteUpdate({ colorHex: "" }, asInput({ colorHex: undefined }));
    expect(out).toEqual({ colorHex: null });
  });

  it("여러 칸을 값과 함께 보내면 그 칸만 갱신", () => {
    const raw = { wineId: "w", colorHex: "#abcdef", value: "만족" };
    const out = buildTastingNoteUpdate(
      raw,
      asInput({ wineId: "w", colorHex: "#abcdef", value: "만족" })
    );
    expect(out).toEqual({ wineId: "w", colorHex: "#abcdef", value: "만족" });
  });

  it("날짜 칸은 UTC 자정 Date 로 변환한다", () => {
    const out = buildTastingNoteUpdate(
      { drankOn: "2026-08-28" },
      asInput({ drankOn: "2026-08-28" })
    );
    expect(out.drankOn).toBeInstanceOf(Date);
    expect((out.drankOn as Date).toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });

  it("빈 본문이면 아무 칸도 갱신하지 않는다", () => {
    expect(buildTastingNoteUpdate({}, asInput({}))).toEqual({});
  });

  it("맡은 향(aromasConfirmed)은 온 칸만 JSON 문자열로 저장한다", () => {
    // 안 보내면 그대로 보존(결과에 없음).
    expect(
      Object.hasOwn(
        buildTastingNoteUpdate({ rating: 3 }, asInput({ rating: 3 })),
        "aromasConfirmed"
      )
    ).toBe(false);
    // 보내면 JSON 문자열로.
    const out = buildTastingNoteUpdate(
      { aromasConfirmed: ["자두", "후추"] },
      asInput({ aromasConfirmed: ["자두", "후추"] })
    );
    expect(out).toEqual({ aromasConfirmed: JSON.stringify(["자두", "후추"]) });
    // 빈 배열은 스키마가 undefined 로 정규화 → null 로 지운다.
    expect(
      buildTastingNoteUpdate({ aromasConfirmed: [] }, asInput({ aromasConfirmed: undefined }))
    ).toEqual({ aromasConfirmed: null });
  });

  it("느낀 맛(flavorFelt)은 온 칸만 JSON 문자열로 저장한다", () => {
    // 안 보내면 그대로 보존(결과에 없음).
    expect(
      Object.hasOwn(buildTastingNoteUpdate({ rating: 3 }, asInput({ rating: 3 })), "flavorFelt")
    ).toBe(false);
    // 보내면 JSON 문자열로.
    const felt = { acidity: 4, tannin: 2, body: 5 };
    expect(buildTastingNoteUpdate({ flavorFelt: felt }, asInput({ flavorFelt: felt }))).toEqual({
      flavorFelt: JSON.stringify(felt),
    });
    // 빈 객체는 스키마가 undefined 로 정규화 → null 로 지운다.
    expect(buildTastingNoteUpdate({ flavorFelt: {} }, asInput({ flavorFelt: undefined }))).toEqual({
      flavorFelt: null,
    });
  });
});

describe("serializeAromas / parseAromas — 왕복", () => {
  it("배열 ↔ JSON 문자열", () => {
    expect(serializeAromas(["자두", "후추"])).toBe(JSON.stringify(["자두", "후추"]));
    expect(parseAromas(serializeAromas(["자두", "후추"]))).toEqual(["자두", "후추"]);
  });

  it("비었거나 깨진 값은 안전하게 처리", () => {
    expect(serializeAromas(undefined)).toBeNull();
    expect(serializeAromas([])).toBeNull();
    expect(parseAromas(null)).toEqual([]);
    expect(parseAromas("깨진json")).toEqual([]);
  });
});

describe("serializeFlavor / parseFlavor — 왕복", () => {
  it("평가한 축만 담아 왕복한다", () => {
    const felt = { acidity: 4, tannin: 2, body: 5 };
    expect(parseFlavor(serializeFlavor(felt))).toEqual(felt);
    // 평가 안 한 축(undefined)은 저장에서 빠진다.
    expect(serializeFlavor({ acidity: 3, tannin: undefined })).toBe(JSON.stringify({ acidity: 3 }));
  });

  it("비었거나 깨진 값·범위 밖 값은 안전하게 처리", () => {
    expect(serializeFlavor(undefined)).toBeNull();
    expect(serializeFlavor({})).toBeNull();
    expect(parseFlavor(null)).toEqual({});
    expect(parseFlavor("깨진json")).toEqual({});
    // 1~5 밖이거나 정수가 아닌 값은 버린다.
    expect(parseFlavor(JSON.stringify({ acidity: 9, tannin: 0, body: 2.5, sweetness: 3 }))).toEqual(
      {
        sweetness: 3,
      }
    );
  });
});
