import { describe, expect, it } from "vitest";
import { buildTastingNoteUpdate, type TastingNoteInput } from "./tasting-note-schema";

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
});
