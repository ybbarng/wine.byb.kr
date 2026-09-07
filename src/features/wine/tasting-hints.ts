// 가이드 시음 — 각 단계의 "예상 + 근거" 안내 문구. 와인 데이터에서 만든다.
// docs/guided-tasting.md 참고. 안내는 강제가 아니라 곁들이는 힌트다(읽기 전용).
//
// P1: 색. 와인 종류(type)로 "이런 색이 예상되고, 왜 그런지"를 한 줄로.
// P2: 향. 이 와인의 품종에서 예상되는 향 태그를 모은다(근거: 품종 아로마).
// P3: 맛. 산도·타닌·단맛·바디의 예상 수준을 품종에서 가져온다.
// 숙성: 빈티지가 있으면 나이를 재, 색·향·맛에 나이가 남긴 흔적을 곁들인다.

import { grapeInfo } from "./grape-info";

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
export function expectedAromasFor(grapeNames: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of grapeNames) {
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
  grapes: (string | null | undefined)[];
  type: string | null | undefined;
  vintageYear?: number | null;
  drankOn?: string | null;
}): AromaGroup[] {
  const groups: AromaGroup[] = [];

  const fromGrapes = expectedAromasFor(opts.grapes);
  if (fromGrapes.length > 0) {
    const named = opts.grapes.filter((g): g is string => !!g && grapeInfo(g) != null);
    groups.push({
      source: "품종에서",
      why:
        named.length > 0 ? `${named.join("·")}에서 흔히 나는 향이에요.` : "품종에서 오는 향이에요.",
      aromas: fromGrapes,
    });
  }

  const age = wineAgeYears(opts.vintageYear, opts.drankOn);
  if (age != null) {
    const aged = agingAromas(age, opts.type);
    if (aged.length > 0) {
      groups.push({
        source: `숙성에서 (${age}년)`,
        why: agingAromaWhy(age),
        // 품종에서 이미 나온 향은 빼서 같은 칩이 두 번 뜨지 않게 한다.
        aromas: aged.filter((a) => !fromGrapes.includes(a)),
      });
    }
  }

  return groups.filter((g) => g.aromas.length > 0);
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
 * 와인의 품종들에서 예상되는 맛 수준을 모은다(근거: 품종 특성, [[grape-info]]).
 * 축마다 비율이 높은 품종부터 보며 값이 있는 첫 품종의 표현을 쓴다.
 * (블렌드 비율 가중 합성은 P5에서. 지금은 대표 품종 우선으로 단순하게.)
 * 화이트처럼 타닌 값이 없는 축은 키를 비워 둬 "예상"을 지어내지 않는다.
 */
export function expectedFlavorFor(grapeNames: (string | null | undefined)[]): ExpectedFlavor {
  const out: ExpectedFlavor = {};
  for (const name of grapeNames) {
    const info = grapeInfo(name);
    if (!info) continue;
    for (const { key } of FLAVOR_AXES) {
      if (out[key] == null && info[key]) out[key] = info[key];
    }
  }
  return out;
}
