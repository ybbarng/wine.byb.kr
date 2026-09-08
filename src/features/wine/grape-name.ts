// 품종 이름 맞추기 — 표기가 흔들려도 같은 품종으로 인식한다.
//
// DB 의 품종명은 사람이 적은 것이라 표기가 제각각이다.
//   까베르네 소비뇽 ↔ 카베르네 소비뇽   (까/카)
//   피노누아        ↔ 피노 누아          (띄어쓰기)
//   리즐링          ↔ 리슬링             (즐/슬)
//   무스캇          ↔ 모스카토            (아예 다른 음역)
// 코드 쪽 표를 정확히 일치(`Set.has`, `Record[key]`)로 찾으면 이런 게 조용히 빗나간다.
// 실제로 `wine-glass.ts` 가 그랬다 — 피노누아 와인이 제 색도, 부르고뉴 잔도 못 받고
// 타입 기본값으로 떨어지고 있었다(2026-09-08 발견).

/** 공백을 지우고 소문자로. 비교 전에 항상 이걸 통과시킨다. */
export const normalizeGrapeName = (s: string): string => s.replace(/\s+/g, "").toLowerCase();

/** 별칭 목록 하나와 그에 딸린 값. */
export type GrapeAliasEntry<T> = readonly [aliases: readonly string[], value: T];

/**
 * 품종명으로 표에서 값을 찾는다. 별칭을 정규화해 **부분 일치**로 본다 —
 * 시드가 "시라/쉬라즈 (Syrah/Shiraz)" 처럼 병기하거나 괄호를 붙여도 걸리게.
 *
 * 별칭은 서로 겹치지 않게 충분히 길게 적는다(예: "소비뇽" 대신 "소비뇽블랑").
 * 앞선 항목이 먼저 이기므로, 더 구체적인 품종을 위에 둔다.
 */
export function matchGrape<T>(
  name: string | null | undefined,
  table: readonly GrapeAliasEntry<T>[]
): T | null {
  if (!name) return null;
  const n = normalizeGrapeName(name);
  for (const [aliases, value] of table) {
    for (const a of aliases) {
      if (n.includes(normalizeGrapeName(a))) return value;
    }
  }
  return null;
}
