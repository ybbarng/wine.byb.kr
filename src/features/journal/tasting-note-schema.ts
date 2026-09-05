import { z } from "zod";

// 폼(문자열 입력)과 API(JSON)가 함께 쓰는 시음 기록 입력 스키마.
// 빈 값은 undefined로, 숫자·날짜는 관대하게 받아 정규화한다.

const emptyToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

/** "YYYY-MM-DD" 날짜 문자열(비어 있으면 undefined). */
const dateString = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
    .optional()
);

export const tastingNoteSchema = z.object({
  wineId: z.string().min(1, "와인을 선택하세요"),
  drankOn: dateString,
  purchasedOn: dateString,
  vintageYear: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1900).max(2100).optional()
  ),
  purchasePrice: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  purchasePlace: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  rating: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(5).optional()),
  repurchase: z.preprocess(emptyToUndefined, z.enum(["응", "아마", "아니"]).optional()),
  // 가격 대비 5단계. 기존 3단계(만족/보통/아쉬움)를 포함하는 상위집합이라 옛 기록도
  // 그대로 유효하다(마이그레이션 불필요).
  value: z.preprocess(
    emptyToUndefined,
    z.enum(["아주 만족", "만족", "보통", "아쉬움", "매우 아쉬움"]).optional()
  ),
  colorHex: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "#rrggbb 형식이어야 합니다")
      .optional()
  ),
  bodyText: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  foodPaired: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
});

// 폼 입력(변환 전, 문자열) 타입과 결과(변환 후) 타입을 나눈다.
// react-hook-form에 각각 넘겨 preprocess/coerce로 인한 타입 불일치를 푼다.
export type TastingNoteFormInput = z.input<typeof tastingNoteSchema>;
export type TastingNoteInput = z.output<typeof tastingNoteSchema>;

/** "YYYY-MM-DD" → UTC 자정 Date. 시드가 UTC 자정을 쓰는 것과 맞춘다. */
export function toUtcDate(dateStr: string | undefined): Date | undefined {
  return dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : undefined;
}

/** Date → 날짜 입력칸용 "YYYY-MM-DD"(UTC). 없으면 null. */
export function toDateInput(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

// 편집(PATCH)용 부분 갱신 payload. **요청 본문에 실제로 들어온 칸만** 바꾼다.
// 폼이 어떤 칸을 아예 안 보내면(예: 그 입력이 화면에 없었음) 그 칸은 건드리지 않아,
// 편집 저장이 손대지 않은 칸을 null 로 지워버리는 사고를 막는다(데이터 유실 방지).
// (칸을 명시적으로 비우려면 폼이 그 키를 빈 값으로 보내야 한다 — 그때만 null 로 지운다.)
export function buildTastingNoteUpdate(
  raw: Record<string, unknown>,
  d: TastingNoteInput
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const has = (k: string) => Object.hasOwn(raw, k);
  if (has("wineId")) data.wineId = d.wineId;
  if (has("drankOn")) data.drankOn = toUtcDate(d.drankOn) ?? null;
  if (has("purchasedOn")) data.purchasedOn = toUtcDate(d.purchasedOn) ?? null;
  if (has("vintageYear")) data.vintageYear = d.vintageYear ?? null;
  if (has("purchasePrice")) data.purchasePrice = d.purchasePrice ?? null;
  if (has("purchasePlace")) data.purchasePlace = d.purchasePlace ?? null;
  if (has("rating")) data.rating = d.rating ?? null;
  if (has("repurchase")) data.repurchase = d.repurchase ?? null;
  if (has("value")) data.value = d.value ?? null;
  if (has("colorHex")) data.colorHex = d.colorHex ?? null;
  if (has("bodyText")) data.bodyText = d.bodyText ?? null;
  if (has("foodPaired")) data.foodPaired = d.foodPaired ?? null;
  return data;
}
