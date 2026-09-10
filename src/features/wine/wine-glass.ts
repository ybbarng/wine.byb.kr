// 실제 와인(DB) 의 type + 대표 품종 → 3D 글라스 색(Beer–Lambert absorb)·잔(glass 인덱스).
// 홈 쇼케이스와 와인 상세/검색 페이지가 같은 규칙으로 글라스를 그리게 하는 단일 소스.

import { GLASS } from "@/features/glass/glass-geometry";
import { type GrapeAliasEntry, matchGrape } from "./grape-name";

// 품종별 색(absorb). 없으면 타입 기본색. (홈 쇼케이스 값과 일관)
// 별칭으로 적는다 — DB 표기가 흔들려도(까/카, 띄어쓰기, 즐/슬) 같은 품종으로 본다.
// 더 구체적인 품종을 위에 둔다(앞선 항목이 먼저 이긴다).

/** 흑포도 — 껍질을 담가 색을 뽑았을 때의 색이다. 레드에만 쓴다. */
const DARK_GRAPE_ABSORB: readonly GrapeAliasEntry<[number, number, number]>[] = [
  [
    ["까베르네 소비뇽", "카베르네 소비뇽"],
    [13, 60, 80],
  ],
  [
    ["메를로", "멀롯"],
    [16, 78, 98],
  ],
  [
    ["피노누아", "피노 누아"],
    [9, 40, 52],
  ],
  [
    ["쉬라즈", "시라"],
    [11, 55, 72],
  ],
  [["산지오베제"], [14, 66, 78]],
  [["네비올로"], [10, 46, 58]],
  [["말벡"], [15, 64, 74]],
  [
    ["진판델", "프리미티보"],
    [13, 58, 72],
  ],
  [["그르나슈"], [10, 42, 54]],
  [["템프라니요"], [13, 58, 72]],
  [["가메"], [8, 36, 48]],
] as const;

/** 청포도 — 화이트·스파클링·디저트처럼 옅은 술에 쓴다. */
const LIGHT_GRAPE_ABSORB: readonly GrapeAliasEntry<[number, number, number]>[] = [
  [["샤르도네"], [1.6, 3.2, 13]],
  [["소비뇽 블랑"], [1.3, 2.4, 11]],
  [
    ["리즐링", "리슬링"],
    [1.4, 2.6, 10],
  ],
  [
    ["무스캇", "모스카토", "뮈스카"],
    [1.5, 3.0, 12],
  ],
] as const;

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

/** 껍질 색이 그대로 드러나는 술. 나머지(화이트·로제·스파클링·디저트)는 옅다. */
const DARK_TYPES = new Set(["red", "fortified"]);

// 레드 중 넓은 볼(부르고뉴)이 어울리는 아로마틱 품종.
const BURGUNDY_GRAPES: readonly GrapeAliasEntry<true>[] = [
  [["피노누아", "피노 누아"], true],
  [["네비올로"], true],
  [["산지오베제"], true],
  [["가메"], true],
] as const;

// 타입·품종으로는 안 잡히는 특수한 색을 와인별(slug)로 지정. 로제 샴페인처럼
// 품종을 넣으면(피노 누아 등) 오히려 어두워지는 경우를 여기서 바로잡는다.
// (나중에 '색 컬러피커'가 여기를 채우거나 DB 필드로 옮길 자리다.)
const WINE_ABSORB: Record<string, [number, number, number]> = {
  "gosset-grand-rose-brut": [2.4, 7, 6], // 로제 샴페인 — 연한 분홍
};

export type GlassSpec = { absorb: [number, number, number]; glass: number };

// 눈에 보이길 원하는 색(#rrggbb) → Beer–Lambert 흡수계수. 잘 통과하는 채널(밝음)은
// 적게, 흡수되는 채널(어두움)은 많이. 완벽한 물리 변환은 아니고(투명도는 나중에),
// 실시간 미리보기로 눈으로 맞추는 용도. 스케일은 기존 프리셋 범위에 맞춘다.
// 관측색(잔에서 본 색) → Beer–Lambert 흡수계수. 렌더가 observed ≈ exp(−A·t) 이므로
// 역은 A = −ln(관측/255)·k (로그). 선형 (1−c/255)·90 은 밝은 색(화이트)을 과다
// 흡수시켜 연노랑을 갈색으로 튀게 했다. k 는 "고른 색 ≈ 잔에 보이는 색"이 되도록
// (두께 효과 상쇄) 잡음 — k≈1/유효두께. 로그라 화이트·레드 모두 스와치에 근접.
const HEX_ABSORB_K = 14;
export function hexToAbsorb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const ch = (c: number) => {
    const t = Math.max(c / 255, 0.02); // 통과율(0=검정 방지)
    return Math.max(0.4, Math.round(-Math.log(t) * HEX_ABSORB_K * 10) / 10);
  };
  return [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)];
}

// 컬러피커 시작값(종류별 대표 색, 눈에 보이는 색). 지정 색이 없을 때 여기서 출발.
const TYPE_COLOR_HEX: Record<string, string> = {
  red: "#5a1122",
  white: "#ecd88f",
  rose: "#e59aa4",
  sparkling: "#f1e7b4",
  champagne: "#f1e7b4",
  dessert: "#cf8f2a",
  fortified: "#7a2a12",
};
export function defaultColorHex(type: string | null | undefined): string {
  return TYPE_COLOR_HEX[type ?? "red"] ?? "#5a1122";
}

// 여러 관측 색(#rrggbb)을 RGB 평균내 하나의 대표 색으로. 유효한 값이 없으면 null.
export function averageHex(hexes: (string | null | undefined)[]): string | null {
  const rgb = hexes
    .map((h) => (h ? /^#?([0-9a-f]{6})$/i.exec(h.trim()) : null))
    .filter((m): m is RegExpExecArray => m != null)
    .map((m) => Number.parseInt(m[1], 16));
  if (rgb.length === 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const n of rgb) {
    r += (n >> 16) & 255;
    g += (n >> 8) & 255;
    b += n & 255;
  }
  const avg = (x: number) =>
    Math.round(x / rgb.length)
      .toString(16)
      .padStart(2, "0");
  return `#${avg(r)}${avg(g)}${avg(b)}`;
}

// 타입·품종으로는 안 잡히는 특수한 색을 와인별(slug)로 지정(코드). colorHex(DB)가
// 있으면 그게 최우선.
/** 글라스 색·잔을 정한다. 우선순위: colorHex(DB) > slug 특수색 > 품종/타입 추정. */
export function wineGlassFor(
  type: string | null | undefined,
  grapeNames: string[] = [],
  slug?: string | null,
  colorHex?: string | null
): GlassSpec {
  const t = type ?? "red";
  const base = TYPE_DEFAULT[t] ?? TYPE_DEFAULT.red;
  let absorb = base.absorb;
  let glass = base.glass;
  const primary = grapeNames[0];
  // 흑포도로 담근 옅은 술이 많다 — 블랑 드 누아 샴페인, 직압 로제. 껍질을 안 담갔으니
  // 품종의 붉은색을 씌우면 안 된다. 술 색과 같은 계열의 표에서만 찾는다.
  const byGrape = matchGrape(primary, DARK_TYPES.has(t) ? DARK_GRAPE_ABSORB : LIGHT_GRAPE_ABSORB);
  if (byGrape) absorb = byGrape;
  if (t === "red" && matchGrape(primary, BURGUNDY_GRAPES)) glass = GLASS.burgundy;
  if (slug && WINE_ABSORB[slug]) absorb = WINE_ABSORB[slug];
  if (colorHex) {
    const fromHex = hexToAbsorb(colorHex);
    if (fromHex) absorb = fromHex;
  }
  return { absorb, glass };
}
