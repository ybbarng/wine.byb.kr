// 블렌드 — 여러 품종이 섞인 와인에서 "무엇이 이 와인의 얼굴인가"를 가른다.
//
// 왜 필요한가: 예상을 만들 때 모든 품종을 똑같이 다루면 두 가지가 어긋난다.
//  - 향: 네 품종의 향을 다 합치면 목록이 길어져 무엇을 찾을지 흐려진다. 1%만 섞인
//    품종의 향까지 "예상"이라고 내놓는 건 사실도 아니다.
//  - 맛: 축마다 "값이 있는 첫 품종"의 값을 쓰면, 40/30/30 처럼 고르게 섞인 와인도
//    한 품종의 성격으로만 읽힌다.
//
// 그래서 주 품종(lead)과 곁들인 품종(support)을 갈라, 향은 나눠 보여주고 맛은
// 주 품종들만 평균낸다.

/** 품종 하나와 그 비율. 비율은 모르는 와인이 많다(59종 중 절반쯤). */
export type GrapeShare = { name: string; percent?: number | null };

/**
 * 곁들임과 가르는 비율 문턱(%). 이 아래는 향·맛의 얼굴을 바꾸지 못한다고 본다.
 *
 * 실제 데이터로 맞췄다 — 40/30/30(남프랑스 GSM)은 셋 다 주 품종이어야 하고,
 * 98/1/1(덕혼 디코이)은 메를로 하나여야 하며, 70/10/9/8/3(기갈 블랑)은 비오니에
 * 하나여야 한다. 20%가 이 셋을 모두 뜻대로 가른다.
 */
export const LEAD_MIN_PERCENT = 20;

export type Blend = {
  /** 이 와인의 얼굴. 비율을 모르면 첫 품종 하나. 품종이 있으면 최소 하나는 들어간다. */
  lead: string[];
  /** 주 품종의 비율(lead 와 같은 순서). 비율을 모르면 모두 null. */
  leadPercents: (number | null)[];
  /** 곁들인 품종. 향에서는 따로 묶어 보여주고, 맛 예상에는 넣지 않는다. */
  support: string[];
};

/** 이름만 담긴 배열도 받아 준다 — 비율을 모르는 호출부가 많다. */
export type GrapeLike = string | GrapeShare | null | undefined;

/** 문자열·객체가 섞여 들어와도 같은 모양으로 맞춘다. */
export function toShares(grapes: GrapeLike[]): GrapeShare[] {
  return grapes
    .map((g) => (typeof g === "string" ? { name: g } : g))
    .filter((g): g is GrapeShare => !!g?.name);
}

/**
 * 주 품종과 곁들인 품종을 가른다.
 *
 * 비율을 알면 문턱(20%)으로 가르고, 모르면 **저장된 순서의 첫 품종**을 주 품종으로 본다
 * (와인 조회가 비율 내림차순으로 정렬하므로 첫 품종이 대표일 가능성이 높다).
 * ⚠️ 비율이 없는 와인은 이 순서를 믿는 것이라, 순서가 틀리면 예상도 틀어진다.
 */
export function splitBlend(grapes: GrapeLike[]): Blend {
  const named = toShares(grapes).filter((g) => g.name.trim());
  if (named.length === 0) return { lead: [], leadPercents: [], support: [] };
  if (named.length === 1) {
    return { lead: [named[0].name], leadPercents: [named[0].percent ?? null], support: [] };
  }

  const hasPercent = named.some((g) => g.percent != null && Number.isFinite(g.percent));
  if (!hasPercent) {
    return {
      lead: [named[0].name],
      leadPercents: [null],
      support: named.slice(1).map((g) => g.name),
    };
  }

  const sorted = [...named].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  const lead: string[] = [];
  const leadPercents: (number | null)[] = [];
  const support: string[] = [];
  for (const [i, g] of sorted.entries()) {
    // 가장 높은 품종은 비율이 얼마든 주 품종이다(문턱만 보면 다 곁들임이 될 수 있다).
    if (i === 0 || (g.percent ?? 0) >= LEAD_MIN_PERCENT) {
      lead.push(g.name);
      leadPercents.push(g.percent ?? null);
    } else {
      support.push(g.name);
    }
  }
  return { lead, leadPercents, support };
}

// ── 맛 축의 말 ↔ 눈금 ────────────────────────────────────────────────
// 큐레이션은 "낮음·중간·높음"(바디는 "가벼움·중간·묵직함") 같은 말로 적혀 있고,
// "가벼움~중간" 처럼 두 칸에 걸친 표현도 있다. 평균을 내려면 숫자로 바꿔야 한다.

const WORD_SCALE: Record<string, number> = {
  낮음: 1,
  가벼움: 1,
  중간: 2,
  높음: 3,
  묵직함: 3,
};

/** "가벼움~중간" 같은 범위는 양 끝의 가운데로 본다. 모르는 말이면 null. */
export function levelOf(word: string | null | undefined): number | null {
  if (!word) return null;
  const parts = word.split("~").map((w) => WORD_SCALE[w.trim()]);
  if (parts.some((v) => v == null)) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/** 눈금을 다시 말로. 축마다 낮은 쪽·높은 쪽 표현이 다르다. */
export function wordOf(level: number, axis: "body" | "other"): string {
  const low = axis === "body" ? "가벼움" : "낮음";
  const high = axis === "body" ? "묵직함" : "높음";
  if (level < 1.5) return low;
  if (level > 2.5) return high;
  // 1.5~2.5 사이는 중간이되, 한쪽으로 치우치면 그렇게 적는다(정보를 버리지 않는다).
  if (level <= 1.75) return `${low}~중간`;
  if (level >= 2.25) return `중간~${high}`;
  return "중간";
}
