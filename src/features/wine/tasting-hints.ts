// 가이드 시음 — 각 단계의 "예상 + 근거" 안내 문구. 와인 데이터에서 만든다.
// docs/guided-tasting.md 참고. 안내는 강제가 아니라 곁들이는 힌트다(읽기 전용).
//
// P1: 색. 와인 종류(type)로 "이런 색이 예상되고, 왜 그런지"를 한 줄로.
// P2: 향. 이 와인의 품종에서 예상되는 향 태그를 모은다(근거: 품종 아로마).
// P3: 맛. 산도·타닌·단맛·바디의 예상 수준을 품종에서 가져온다.

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

/**
 * 와인의 품종들에서 예상되는 맛 수준을 모은다(근거: 품종 특성, [[grape-info]]).
 * 축마다 비율이 높은 품종부터 보며 값이 있는 첫 품종의 표현을 쓴다.
 * (블렌드 비율 가중 합성은 P5에서. 지금은 대표 품종 우선으로 단순하게.)
 * 화이트처럼 타닌 값이 없는 축은 키를 비워 둬 "예상"을 지어내지 않는다.
 */
/** 느낀 정도(1~5)를 그 축의 말로 옮긴다. 1·2는 낮은 쪽, 3은 중간, 4·5는 높은 쪽. */
export function flavorLevelWord(axis: FlavorAxis, level: number): string {
  const found = FLAVOR_AXES.find((a) => a.key === axis);
  if (!found) return "";
  if (level <= 2) return found.low;
  if (level === 3) return "중간";
  return found.high;
}

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
