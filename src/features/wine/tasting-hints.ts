// 가이드 시음 — 각 단계의 "예상 + 근거" 안내 문구. 와인 데이터에서 만든다.
// docs/guided-tasting.md 참고. 안내는 강제가 아니라 곁들이는 힌트다(읽기 전용).
//
// P1: 색. 와인 종류(type)로 "이런 색이 예상되고, 왜 그런지"를 한 줄로.
// P2: 향. 이 와인의 품종에서 예상되는 향 태그를 모은다(근거: 품종 아로마).

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
