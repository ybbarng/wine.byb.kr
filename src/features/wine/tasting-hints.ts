// 가이드 시음 — 각 단계의 "예상 + 근거" 안내 문구. 와인 데이터에서 만든다.
// docs/guided-tasting.md 참고. 안내는 강제가 아니라 곁들이는 힌트다(읽기 전용).
//
// P1: 색. 와인 종류(type)로 "이런 색이 예상되고, 왜 그런지"를 한 줄로.
// P2: 향. 이 와인의 품종에서 예상되는 향 태그를 모은다(근거: 품종 아로마).
// P3: 맛. 산도·타닌·단맛·바디의 예상 수준을 품종에서 가져온다.
// 숙성: 빈티지가 있으면 나이를 재, 색·향·맛에 나이가 남긴 흔적을 곁들인다.
// 오크: 배럴에서 오는 향(바닐라·토스트)은 품종이 아니라 Wine.oakAging 을 근거로.
// 기후·도수: 값을 바꾸지 않고 "이래서 이렇게 치우칠 수 있다"는 안내만 곁들인다.

import { deriveLegs, LEG_FLOOR } from "@/features/glass/legs";
import { withJosa } from "@/lib/korean";
import { type GrapeLike, levelOf, splitBlend, toShares, wordOf } from "./blend";
import { grapeInfo } from "./grape-info";
import { countryInfo, regionInfo } from "./region-info";
import { type WinemakingTag, winemakingAromas, winemakingLabel, winemakingWhy } from "./winemaking";

const COLOR_HINT: Record<string, string> = {
  red: "진한 루비~자주빛이 예상돼요 — 레드는 포도 껍질째 담가 색소가 진하게 우러나거든요.",
  white: "옅은 레몬~황금빛이 예상돼요 — 껍질을 빼고 즙만 발효해 색이 연해요.",
  rose: "은은한 분홍빛이 예상돼요 — 껍질을 잠깐만 담가 색이 살짝 배어요.",
  sparkling: "옅은 황금빛에 기포가 올라올 거예요 — 병 속 2차 발효로 탄산이 생겨요.",
  champagne: "옅은 황금빛에 섬세한 기포가 올라올 거예요 — 병 속 2차 발효(샴페인 방식)예요.",
  dessert: "짙은 황금~호박빛이 예상돼요 — 당도가 높고 오래 숙성돼 색이 깊어요.",
  fortified: "짙은 적갈~호박빛이 예상돼요 — 주정 강화로 농축돼 색이 진해요.",
};

/** 와인 종류로 예상 색 안내를 만든다. 종류를 모르면 null(안내 생략). */
export function expectedColorHint(type: string | null | undefined): string | null {
  if (!type) return null;
  return COLOR_HINT[type] ?? null;
}

/**
 * 와인의 품종들에서 예상되는 향 태그를 모은다(근거: 품종 아로마, [[grape-info]]).
 * 대표 품종부터 순서를 지키며 중복은 제거한다. 아는 향이 없으면 빈 배열.
 * 블렌드는 여러 품종의 향을 합쳐 넉넉히 보여준다(비율 가중은 P5에서).
 */
export function expectedAromasFor(grapeNames: GrapeLike[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { name } of toShares(grapeNames)) {
    for (const aroma of grapeInfo(name)?.aroma ?? []) {
      if (seen.has(aroma)) continue;
      seen.add(aroma);
      out.push(aroma);
    }
  }
  return out;
}

// ── 숙성(빈티지 나이) ──────────────────────────────────────────────
// 같은 품종이라도 몇 해 묵었는지에 따라 향·색이 달라진다. 빈티지를 적어 뒀으면
// 나이를 계산해 "숙성에서 오는" 예상을 따로 보여준다. 빈티지가 없으면 아무 말도
// 하지 않는다(모르는 걸 지어내지 않는다).

export type AgingStage = "young" | "developing" | "mature";

/** 마신 해 − 빈티지. 빈티지가 없거나 앞날이면 null(숙성 안내 생략). */
export function wineAgeYears(
  vintageYear: number | null | undefined,
  drankOn?: string | null
): number | null {
  if (!vintageYear) return null;
  const refYear = drankOn ? Number(drankOn.slice(0, 4)) : new Date().getFullYear();
  if (!Number.isFinite(refYear)) return null;
  const age = refYear - vintageYear;
  return age >= 0 ? age : null;
}

/** 나이를 세 구간으로. 3년까지 어림 · 8년까지 익어가는 중 · 그 뒤는 무르익음. */
export function agingStage(age: number): AgingStage {
  if (age <= 3) return "young";
  if (age <= 8) return "developing";
  return "mature";
}

// 레드 계열은 껍질·타닌에서, 화이트 계열은 산·당에서 숙성 향이 온다. 갈래를 나눠 둔다.
const RED_FAMILY = new Set(["red", "fortified"]);
type AgingFamily = "red" | "white";
const agingFamily = (type: string | null | undefined): AgingFamily =>
  type && RED_FAMILY.has(type) ? "red" : "white";

const AGING_AROMAS: Record<AgingFamily, Record<"developing" | "mature", string[]>> = {
  red: {
    developing: ["말린 붉은 과실", "향신료", "삼나무"],
    mature: ["말린 자두", "가죽", "담배", "버섯", "흙"],
  },
  white: {
    developing: ["잘 익은 과일", "꿀"],
    mature: ["꿀", "견과", "말린 살구", "토스트"],
  },
};

/** 숙성에서 오는 예상 향. 어린 와인은 따로 더할 게 없어 빈 배열. */
export function agingAromas(age: number, type: string | null | undefined): string[] {
  const stage = agingStage(age);
  if (stage === "young") return [];
  return AGING_AROMAS[agingFamily(type)][stage];
}

/** 나이가 향에 어떻게 작용하는지 한 줄로. */
export function agingAromaWhy(age: number): string {
  const stage = agingStage(age);
  if (stage === "young") return `${age}년밖에 안 됐어요 — 신선한 과실·꽃 향이 또렷할 때예요.`;
  if (stage === "developing")
    return `${age}년 지났어요 — 과실 향이 조금씩 잦아들고 숙성 향이 올라올 때예요.`;
  return `${age}년이나 지났어요 — 신선한 과실보다 말린 과일·흙 같은 숙성 향이 앞설 수 있어요.`;
}

/** 나이가 색에 남긴 흔적. 어리면 덧붙일 말이 없어 null. */
export function agingColorNote(age: number, type: string | null | undefined): string | null {
  const stage = agingStage(age);
  if (stage === "young") return null;
  if (agingFamily(type) === "red") {
    return stage === "mature"
      ? `${age}년 묵어 잔 가장자리가 벽돌빛으로 돌았을 수 있어요.`
      : `${age}년 지나 가장자리가 살짝 벽돌빛을 띠기 시작할 수 있어요.`;
  }
  return stage === "mature"
    ? `${age}년 묵어 색이 짙은 황금빛까지 깊어졌을 수 있어요.`
    : `${age}년 지나 색이 조금 더 짙은 황금빛으로 갔을 수 있어요.`;
}

/** 나이가 맛에 남긴 흔적(주로 타닌이 부드러워진다). 어리면 null. */
export function agingFlavorNote(age: number, type: string | null | undefined): string | null {
  const stage = agingStage(age);
  if (stage === "young") return null;
  if (agingFamily(type) === "red") {
    return stage === "mature"
      ? `${age}년 묵어 타닌이 많이 부드러워졌을 수 있어요 — 예상보다 덜 떫게 느껴질 거예요.`
      : `${age}년 지나 타닌이 조금 둥글어졌을 수 있어요.`;
  }
  return `${age}년 지나 산미가 조금 누그러지고 질감이 둥글어졌을 수 있어요.`;
}

// ── 오크(배럴 숙성) ────────────────────────────────────────────────
// 바닐라·토스트 같은 향은 포도가 아니라 배럴에서 온다. 그래서 품종이 아니라
// 와인마다 정해진 `Wine.oakAging`(none|light|heavy)을 근거로 삼는다.
// 모르면(null) 오크 얘기를 아예 하지 않는다.

const OAK_AROMAS: Record<"light" | "heavy", string[]> = {
  light: ["바닐라", "토스트"],
  heavy: ["바닐라", "토스트", "훈연", "코코넛", "정향"],
};

const OAK_WHY: Record<"light" | "heavy", string> = {
  light: "오크통에서 숙성했어요 — 과실을 덮지 않을 만큼 은은하게 배어 있을 거예요.",
  heavy: "오크를 뚜렷하게 쓴 와인이에요 — 배럴에서 온 달콤한 나무 향이 앞에 설 수 있어요.",
};

/** 오크에서 오는 예상 향. 안 썼거나(none) 모르면(null) 빈 배열. */
export function oakAromas(oakAging: string | null | undefined): string[] {
  if (oakAging !== "light" && oakAging !== "heavy") return [];
  return OAK_AROMAS[oakAging];
}

/** 오크를 안 썼다고 아는 와인엔 그 사실 자체가 힌트가 된다(과실이 깨끗하게 드러남). */
export function oakNone(oakAging: string | null | undefined): boolean {
  return oakAging === "none";
}

// ── 산지 기후 ──────────────────────────────────────────────────────
// 같은 품종이라도 서늘한 곳에선 산미가 또렷하고 가볍게, 따뜻한 곳에선 과실이 잘 익고
// 묵직하게 나온다. 기후는 향을 "더한다"기보다 품종의 기본값을 흔드는 성격이라,
// 예상 값을 바꾸지 않고 안내만 곁들인다(품종 큐레이션과 충돌하지 않게).
// 근거는 [[region-info]]에 이미 큐레이션된 산지 기후 문장이다.

export type ClimateBand = "cool" | "moderate" | "warm";

/** 기후를 적어 둔 문장을 찾는다. 세부 산지가 없으면 국가 설명으로 물러선다. */
function climateText(regionName: string | null | undefined): string | null {
  return regionInfo(regionName)?.climate ?? countryInfo(regionName) ?? null;
}

/**
 * 산지 기후 문장에서 서늘/온화/따뜻을 가른다.
 * - 서늘·따뜻이 함께 적힌 곳(예: "해안 서늘~내륙 따뜻")은 편차가 크다는 뜻이라 moderate.
 * - 온도 단어가 없어도 기후 유형으로 가른다: 지중해성은 따뜻한 쪽, 대륙성·해양성·
 *   고지대(일교차 큰 곳)는 한쪽으로 몰기 어려워 moderate.
 * - 이탈리아·프랑스처럼 나라 안에서 기후가 갈리는 곳은 판단하지 않는다(null).
 */
export function climateBand(regionName: string | null | undefined): ClimateBand | null {
  const climate = climateText(regionName);
  if (!climate) return null;
  const cool = /서늘|최북단|북쪽 한계|일조가 짧|북방/.test(climate);
  const warm = /덥|따뜻|더운|지중해성/.test(climate);
  if (cool && warm) return "moderate";
  if (cool) return "cool";
  if (warm) return "warm";
  if (/온화|대륙성|해양성|사막성|일교차/.test(climate)) return "moderate";
  return null;
}

/** 기후가 향에 남기는 결. 온화한 곳은 특별히 덧붙일 말이 없어 null. */
export function climateAromaNote(regionName: string | null | undefined): string | null {
  const band = climateBand(regionName);
  const where = regionInfo(regionName)?.name ?? regionName ?? "이 산지";
  if (band === "cool")
    return `${withJosa(where, "은/는")} 서늘한 산지라 과실이 농익기보다 새콤하고, 허브 같은 풋풋한 결이 스칠 수 있어요.`;
  if (band === "warm")
    return `${withJosa(where, "은/는")} 따뜻한 산지라 과실이 잘 익어 잼이나 말린 과일처럼 진하게 느껴질 수 있어요.`;
  return null;
}

/** 기후가 맛에 남기는 결(주로 산도·바디). 온화한 곳은 null. */
export function climateFlavorNote(regionName: string | null | undefined): string | null {
  const band = climateBand(regionName);
  const where = regionInfo(regionName)?.name ?? regionName ?? "이 산지";
  if (band === "cool")
    return `${withJosa(where, "은/는")} 서늘한 산지라 산도가 예상보다 또렷하고 바디는 가볍게 느껴질 수 있어요.`;
  if (band === "warm")
    return `${withJosa(where, "은/는")} 따뜻한 산지라 산도가 예상보다 눅고 바디는 묵직하게 느껴질 수 있어요.`;
  return null;
}

// ── 알코올 도수 ────────────────────────────────────────────────────
// 도수는 바디감과 목넘김의 따뜻한 기운에 직결된다. 보통 범위(11.5~13.4도)는
// 굳이 말할 게 없어 안내를 생략하고, 눈에 띄게 낮거나 높을 때만 알려준다.

/** 도수가 질감에 남기는 결. 평범한 범위면 null. */
export function abvNote(abv: number | null | undefined): string | null {
  if (abv == null || !Number.isFinite(abv)) return null;
  const shown = Number.isInteger(abv) ? `${abv}` : abv.toFixed(1);
  if (abv < 9) return `도수가 ${shown}도로 아주 낮아 가볍고 산뜻하게 넘어가요.`;
  if (abv < 11.5) return `도수가 ${shown}도로 낮은 편이라 가볍게 느껴질 거예요.`;
  if (abv >= 13.5)
    return `도수가 ${shown}도로 높은 편이라 목넘김에 따뜻한 기운이 돌고 바디가 묵직하게 느껴질 수 있어요.`;
  return null;
}

/** 예상 향 한 묶음 — 어디서 오는 향인지(출처)와 그 근거를 함께 담는다. */
export interface AromaGroup {
  source: string;
  why: string;
  aromas: string[];
}

/**
 * 예상 향을 출처별로 묶는다. "무엇이 예상되는가"에 더해 "왜 그런가"를 같이 보여주려고
 * 품종에서 오는 향과 숙성에서 오는 향을 나눈다. (오크에서 오는 향은 다음 단계에서.)
 * 아는 게 없는 묶음은 아예 넣지 않는다.
 */
export function expectedAromaGroups(opts: {
  /** 비율을 알면 함께 준다. 모르면 이름만 — 그때는 순서(비율 내림차순)로 주 품종을 정한다. */
  grapes: GrapeLike[];
  type: string | null | undefined;
  vintageYear?: number | null;
  drankOn?: string | null;
  oakAging?: string | null;
  /** 양조 기법 태그. 빵·건포도처럼 포도가 아니라 양조에서 오는 향의 근거. */
  winemaking?: WinemakingTag[];
}): AromaGroup[] {
  const groups: AromaGroup[] = [];
  // 앞 묶음에서 이미 나온 향은 뒤에서 빼, 같은 칩이 두 번 뜨지 않게 한다.
  const seen = new Set<string>();
  const add = (source: string, why: string, aromas: string[]) => {
    const fresh = aromas.filter((a) => !seen.has(a));
    if (fresh.length === 0) return;
    for (const a of fresh) seen.add(a);
    groups.push({ source, why, aromas: fresh });
  };

  // 주 품종과 곁들인 품종을 나눠 보여준다 — 다 합치면 목록이 길어져 무엇을 찾을지
  // 흐려지고, 1%만 섞인 품종의 향까지 "예상"이라 말하는 셈이 된다.
  const { lead, support } = splitBlend(opts.grapes);
  const knows = (g: string) => grapeInfo(g) != null;
  const leadKnown = lead.filter(knows);
  const supportKnown = support.filter(knows);
  add(
    supportKnown.length > 0 ? "주 품종에서" : "품종에서",
    leadKnown.length > 0
      ? `${leadKnown.join("·")}에서 흔히 나는 향이에요.`
      : "품종에서 오는 향이에요.",
    expectedAromasFor(lead)
  );
  if (supportKnown.length > 0) {
    add(
      "곁들인 품종에서",
      `${withJosa(supportKnown.join("·"), "이/가")} 조금씩 섞여 있어요 — 주 품종만큼 앞에 서진 않아요.`,
      expectedAromasFor(support)
    );
  }

  // 양조에서 오는 향(효모 숙성의 빵, 말린 포도의 건포도). 품종·오크와 나란히 근거를 밝힌다.
  const wm = opts.winemaking ?? [];
  const wmAromas = winemakingAromas(wm);
  if (wmAromas.length > 0) {
    const label = winemakingLabel(wm);
    add(label ? `양조에서 (${label})` : "양조에서", winemakingWhy(wm) ?? "", wmAromas);
  }

  const oaked = oakAromas(opts.oakAging);
  if (oaked.length > 0) {
    const level = opts.oakAging === "heavy" ? "heavy" : "light";
    add("오크에서", OAK_WHY[level], oaked);
  }

  const age = wineAgeYears(opts.vintageYear, opts.drankOn);
  if (age != null) {
    add(`숙성에서 (${age}년)`, agingAromaWhy(age), agingAromas(age, opts.type));
  }

  return groups;
}

/** 맛의 네 축. 저장 키와 화면 라벨·양 끝 설명을 한곳에 둔다. */
export const FLAVOR_AXES = [
  { key: "acidity", label: "산도", low: "부드럽다", high: "새콤하다" },
  { key: "tannin", label: "타닌", low: "매끄럽다", high: "떫다" },
  { key: "sweetness", label: "단맛", low: "드라이", high: "달다" },
  { key: "body", label: "바디", low: "가볍다", high: "묵직하다" },
] as const;

export type FlavorAxis = (typeof FLAVOR_AXES)[number]["key"];

/** 축별 예상 수준(품종 큐레이션의 표현 그대로 — "중간~높음" 같은 범위도 있다). */
export type ExpectedFlavor = Partial<Record<FlavorAxis, string>>;

/** 느낀 정도(1~5)를 그 축의 말로 옮긴다. 1·2는 낮은 쪽, 3은 중간, 4·5는 높은 쪽. */
export function flavorLevelWord(axis: FlavorAxis, level: number): string {
  const found = FLAVOR_AXES.find((a) => a.key === axis);
  if (!found) return "";
  if (level <= 2) return found.low;
  if (level === 3) return "중간";
  return found.high;
}

/**
 * 품종만으로는 정해지지 않는 표현. 축의 양 끝을 다 덮어서 "예상"으로 내놓으면
 * 모든 선택지를 가리키는 셈이라 아무 정보가 없다 — 오히려 고르기 어려워진다.
 * 리즐링·푸르민트·무스캇처럼 같은 품종으로 드라이도 스위트도 만드는 경우다.
 * 이런 축은 예상을 비우고 `sweetnessBreadthNote` 로 "폭이 넓다"만 알린다.
 */
const UNSETTLED_BY_GRAPE = new Set(["드라이~스위트", "오프드라이~스위트"]);

/**
 * 라벨 표기에서 단맛을 읽는다. 품종이 못 정하는 걸 라벨은 정해 준다 —
 * 독일 트로켄, 샴페인 브뤼처럼 당도는 대개 라벨에 적힌다.
 * 이름(원어)·등급 어디에 있든 찾는다. 못 찾으면 null.
 *
 * 긴 표기를 먼저 본다 — "halbtrocken" 안에 "trocken" 이 들어 있어 순서가 뒤집히면
 * 반달지를 드라이로 읽는다.
 */
const LABEL_SWEETNESS: [words: string[], level: string][] = [
  [["halbtrocken", "feinherb", "demi-sec", "demisec", "off-dry", "abboccato"], "약간 단맛"],
  [["extra brut", "brut nature", "pas dose", "brut", "trocken", "secco", "sec", "seco"], "드라이"],
  [["doux", "dolce", "moelleux", "auslese", "beerenauslese", "trockenbeerenauslese"], "달다"],
];

export function labelSweetness(...texts: (string | null | undefined)[]): string | null {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return null;
  for (const [words, level] of LABEL_SWEETNESS) {
    for (const w of words) if (hay.includes(w)) return level;
  }
  return null;
}

/**
 * 와인의 품종들에서 예상되는 맛 수준을 모은다(근거: 품종 특성, [[grape-info]]).
 * 축마다 비율이 높은 품종부터 보며 값이 있는 첫 품종의 표현을 쓴다.
 * (블렌드 비율 가중 합성은 P5에서. 지금은 대표 품종 우선으로 단순하게.)
 * 화이트처럼 타닌 값이 없는 축은 키를 비워 둬 "예상"을 지어내지 않는다.
 *
 * `label` 에 와인 이름·등급을 주면 단맛은 라벨 표기를 우선한다(트로켄·브뤼 등).
 */
export type FlavorContext = {
  /** 와인 종류. 디저트는 종류만으로 달다는 게 정해진다. */
  type?: string | null;
  /** 이름(원어·한국어)·등급 등 라벨에 적히는 말. 여기서 단맛 표기를 찾는다. */
  label?: (string | null | undefined)[];
};

export function expectedFlavorFor(
  grapeNames: GrapeLike[],
  ctx: FlavorContext = {}
): ExpectedFlavor {
  const out: ExpectedFlavor = {};
  // 주 품종들만 평균낸다. 축마다 "값이 있는 첫 품종"을 쓰면 40/30/30 처럼 고르게 섞인
  // 와인도 한 품종의 성격으로만 읽힌다. 곁들인 품종은 맛의 얼굴을 바꾸지 못한다고 본다.
  const { lead, leadPercents } = splitBlend(grapeNames);
  for (const { key } of FLAVOR_AXES) {
    // 비율을 알면 그만큼 무게를 준다 — 60/20/20 을 균등 평균내면 60% 품종이 묻힌다.
    // 비율을 모르면 무게 1로 균등하게(그때는 주 품종이 어차피 하나다).
    let sum = 0;
    let weight = 0;
    let firstWord: string | null = null;
    for (const [i, name] of lead.entries()) {
      const v = grapeInfo(name)?.[key];
      if (!v || UNSETTLED_BY_GRAPE.has(v)) continue;
      firstWord ??= v;
      const n = levelOf(v);
      if (n == null) continue;
      const w = leadPercents[i] ?? 1;
      sum += n * w;
      weight += w;
    }
    if (weight === 0) {
      // 말은 있는데 눈금으로 못 읽는 표현이면(새 표현 등) 첫 값을 그대로 쓴다.
      if (firstWord) out[key] = firstWord;
      continue;
    }
    out[key] = wordOf(sum / weight, key === "body" ? "body" : "other");
  }
  // 단맛은 근거가 확실한 순서로: 라벨 표기 > 종류(디저트) > 품종.
  const fromLabel = labelSweetness(...(ctx.label ?? []));
  if (fromLabel) out.sweetness = fromLabel;
  else if (ctx.type === "dessert") out.sweetness = "달다";
  return out;
}

/**
 * 단맛이 품종만으로 안 정해지는 와인에 붙일 안내. 예상을 비운 자리를 설명한다 —
 * "왜 안 알려주지"가 아니라 "이건 라벨을 봐야 한다"가 되도록.
 * 라벨에서 이미 읽어냈거나 폭이 넓은 품종이 아니면 null(할 말이 없으면 안 한다).
 */
export function sweetnessBreadthNote(
  grapeNames: GrapeLike[],
  ctx: FlavorContext = {}
): string | null {
  // 이미 단맛을 알아냈으면(라벨·종류) 할 말이 없다.
  if (expectedFlavorFor(grapeNames, ctx).sweetness) return null;
  for (const { name } of toShares(grapeNames)) {
    const v = grapeInfo(name)?.sweetness;
    if (v && UNSETTLED_BY_GRAPE.has(v)) {
      return `${name} 같은 품종은 드라이도 스위트도 만들어요. 단맛은 품종보다 라벨(트로켄·브뤼 같은 표기)이 정하니, 예상 없이 느낀 대로 표시해 주세요.`;
    }
  }
  return null;
}

// ── 스월·외관(눈물자국) ─────────────────────────────────────────────
// 잔을 돌리면 벽에 얇은 막이 남고, 거기서 에탄올이 물보다 빨리 증발하며 액체를 끌어
// 올린다(마랑고니). 그래서 **눈물은 도수가 만든다** — 굵고 느리면 도수가 높다는 신호다.
//
// 세기·속도는 3D 잔이 쓰는 `features/glass/legs` 의 `deriveLegs` 를 그대로 쓴다.
// 안내와 화면이 **같은 근거**를 봐야 "예상대로인지" 눈으로 대볼 수 있다.

/** 눈물 세기(0~1)를 1~5 눈금으로. 화면의 잔과 사용자의 눈금이 같은 축을 쓰게 한다. */
export function expectedLegsLevel(abv: number | null | undefined): number | null {
  if (abv == null || !Number.isFinite(abv)) return null;
  const { strength } = deriveLegs(abv);
  // strength 는 하한 LEG_FLOOR(0.15)~1 이라 그 구간을 1~5 로 편다.
  const t = (strength - LEG_FLOOR) / (1 - LEG_FLOOR);
  return Math.min(5, Math.max(1, Math.round(1 + t * 4)));
}

/** 눈물 예상 한 줄(근거 포함). 도수를 모르면 null — 지어내지 않는다. */
export function expectedLegsNote(abv: number | null | undefined): string | null {
  const level = expectedLegsLevel(abv);
  if (level == null) return null;
  const how =
    level >= 4
      ? "굵고 천천히 흐를 거예요"
      : level <= 2
        ? "가늘고 금방 사라질 거예요"
        : "중간쯤으로 흐를 거예요";
  return `${abv}도라 눈물자국이 ${how} — 눈물은 에탄올이 만들거든요. 도수가 높을수록 띠가 두껍고 점성이 커져 느리게 내려와요.`;
}
