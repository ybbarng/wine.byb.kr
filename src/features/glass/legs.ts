// 눈물자국(legs) — 도수에서 세기·속도를 유도한다.
//
// 잔을 돌리면 벽에 얇은 막이 남고, 거기서 에탄올이 물보다 빨리 증발한다. 에탄올이
// 빠진 자리는 표면장력이 높아져 아래쪽 액체를 위로 끌어올리고(마랑고니 효과), 위에
// 모인 액체가 무거워지면 방울이 되어 흘러내린다. 그래서 **눈물은 도수가 만든다** —
// 물만 있으면 막이 그냥 미끄러져 내릴 뿐 방울 줄기가 생기지 않는다.
//
// three.js 를 쓰지 않는 순수 계산이라 렌더 코드(FluidLab.tsx) 밖에 둔다.

/** 눈물이 거의 안 생기는 도수(%). 이 아래면 물처럼 미끄러져 내린다. */
export const ABV_NONE = 8;

/** 눈물이 가장 뚜렷해지는 도수(%). 이 위로는 더 세지지 않는다. */
export const ABV_FULL = 15;

/**
 * 도수를 모르는 와인에 쓸 값. 흔한 식탁 와인쯤으로 둔다 — 모른다고 눈물을 없애면
 * 데이터가 빈 것이 화면에서 "도수 낮은 와인"으로 잘못 읽힌다.
 */
export const DEFAULT_ABV = 13;

/**
 * 도수가 낮아도 벽은 젖는다. 방울 줄기는 없어도 수면이 닿았던 아치 자국은 남으므로
 * 완전히 0 으로 만들지 않는다.
 */
export const LEG_FLOOR = 0.15;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 이 와인의 눈물 성질. */
export interface LegsProfile {
  /** 눈물 세기 0~1. 셰이더에서 자국·줄기 진하기에 곱한다. */
  strength: number;
  /** 흘러내림 진행 속도(1/s). 1 이 되면 방울이 수위선까지 내려온 것. */
  dripRate: number;
  /**
   * 막이 마르는 속도(1/s). 역수가 대략 자국이 남아 있는 시간이다.
   *
   * 실제 잔에 남은 눈물 자국은 30초~1분쯤 간다 — 한 모금 마시고 이야기하다 다시 봐도
   * 아직 있다. 처음엔 5~10초 만에 말라, 스월을 돌린 직후를 놓치면 눈물이 있는지 없는지
   * 알 수 없었다(2026-09-08 실사용 확인).
   */
  dryRate: number;
}

/**
 * 도수(%)에서 눈물 성질을 유도한다.
 *
 * 도수가 높을수록 **뚜렷하고 느리다.** 에탄올·글리세롤이 많으면 벽에 맺히는 띠가
 * 두껍고 점성이 커져 천천히 내려온다 — 소믈리에가 "눈물이 굵고 느리면 도수가 높다"고
 * 보는 근거다. 반대로 5.5% 모스카토는 방울이 거의 안 맺히고 금방 마른다.
 */
export function deriveLegs(abv?: number | null): LegsProfile {
  const a = abv == null || !Number.isFinite(abv) ? DEFAULT_ABV : abv;
  const s = smoothstep(ABV_NONE, ABV_FULL, a);
  return {
    strength: LEG_FLOOR + (1 - LEG_FLOOR) * s,
    dripRate: 0.55 - 0.3 * s,
    dryRate: 0.045 - 0.03 * s,
  };
}
