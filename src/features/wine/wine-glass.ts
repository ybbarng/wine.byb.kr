// 실제 와인(DB) 의 type + 대표 품종 → 3D 글라스 색(Beer–Lambert absorb)·잔(glass 인덱스).
// 홈 쇼케이스와 와인 상세/검색 페이지가 같은 규칙으로 글라스를 그리게 하는 단일 소스.
import { GLASS } from "./showcase-wines";

// 품종별 색(absorb). 없으면 타입 기본색. (홈 쇼케이스 값과 일관)
const GRAPE_ABSORB: Record<string, [number, number, number]> = {
  "카베르네 소비뇽": [13, 60, 80],
  메를로: [16, 78, 98],
  "피노 누아": [9, 40, 52],
  시라: [11, 55, 72],
  쉬라즈: [11, 55, 72],
  산지오베제: [14, 66, 78],
  네비올로: [10, 46, 58],
  말벡: [15, 64, 74],
  진판델: [13, 58, 72],
  그르나슈: [10, 42, 54],
  템프라니요: [13, 58, 72],
  가메: [8, 36, 48],
  샤르도네: [1.6, 3.2, 13],
  "소비뇽 블랑": [1.3, 2.4, 11],
  리슬링: [1.4, 2.6, 10],
  모스카토: [1.5, 3.0, 12],
};

// 타입별 기본 색·잔.
const TYPE_DEFAULT: Record<string, { absorb: [number, number, number]; glass: number }> = {
  red: { absorb: [13, 60, 78], glass: GLASS.bordeaux },
  white: { absorb: [1.6, 3.2, 13], glass: GLASS.white },
  rose: { absorb: [3.5, 10, 8.5], glass: GLASS.white },
  sparkling: { absorb: [1.4, 3.0, 12], glass: GLASS.flute },
  champagne: { absorb: [1.4, 3.0, 12], glass: GLASS.flute },
  dessert: { absorb: [5, 12, 27], glass: GLASS.dessert },
  fortified: { absorb: [18, 74, 90], glass: GLASS.dessert },
};

// 레드 중 넓은 볼(부르고뉴)이 어울리는 아로마틱 품종.
const BURGUNDY_GRAPES = new Set(["피노 누아", "네비올로", "산지오베제", "가메"]);

export type GlassSpec = { absorb: [number, number, number]; glass: number };

/** 와인 타입 + 대표 품종(첫 번째)으로 글라스 색·잔을 정한다. */
export function wineGlassFor(
  type: string | null | undefined,
  grapeNames: string[] = []
): GlassSpec {
  const t = type ?? "red";
  const base = TYPE_DEFAULT[t] ?? TYPE_DEFAULT.red;
  let absorb = base.absorb;
  let glass = base.glass;
  const primary = grapeNames[0];
  if (primary && GRAPE_ABSORB[primary]) absorb = GRAPE_ABSORB[primary];
  if (t === "red" && primary && BURGUNDY_GRAPES.has(primary)) glass = GLASS.burgundy;
  return { absorb, glass };
}
