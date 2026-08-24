import { z } from "zod";

// 새 와인 등록 입력. 이름만 필수, 나머지는 나중에 채워도 된다(진입 장벽 최소화).
// 품종은 원본 문자열(blendRaw)로만 받고 구조화는 하지 않는다(수동 추가 와인은 가볍게).

const emptyToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

export const WINE_TYPES = [
  "red",
  "white",
  "rose",
  "sparkling",
  "champagne",
  "dessert",
  "fortified",
] as const;

export const wineSchema = z.object({
  nameKo: z.string().min(1, "이름을 입력하세요").max(200),
  nameLocal: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  type: z.preprocess(emptyToUndefined, z.enum(WINE_TYPES).optional()),
  abv: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(70).optional()),
  country: z.preprocess(emptyToUndefined, z.string().max(50).optional()),
  producer: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  classification: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  blendRaw: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
});

export type WineFormInput = z.input<typeof wineSchema>;
export type WineInput = z.output<typeof wineSchema>;
