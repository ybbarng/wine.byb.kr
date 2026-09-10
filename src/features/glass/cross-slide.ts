// 교차 슬라이드 — 잔이 화면 밖에서 들어오고 반대편으로 나가는 움직임.
//
// 위치는 smootherstep 으로 잇는다(가속 → 등속 → 감속). 그 **가속도가 안의 액체를
// 밀어** 잔이 미끄러지는 동안 와인이 관성으로 출렁인다. 액체가 얼마나 밀리는지는
// `slosh.ts` 의 `SLIDE_COUPLING` 이 정한다.
//
// FluidLab.tsx 는 `@ts-nocheck` 라 여기 숫자를 잘못 고쳐도 아무도 못 잡는다. 시간과
// 파형을 밖에 두어야 테스트가 실제와 같은 구동을 재현할 수 있다(auto-swirl.ts 와 같은
// 이유 — 테스트가 상수를 손으로 다시 적으면 한쪽만 바뀌어도 초록불이 나온다).

/** 잔이 한 번 미끄러지는 데 걸리는 시간(초). */
export const CROSS_SLIDE_SECONDS = 1.3;

/** 진행도 0~1 → 이동한 비율. smootherstep: 시작과 끝에서 속도·가속도가 0 이다. */
export function crossSlideEase(u: number): number {
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/**
 * 시작 후 `t` 초일 때의 가속도(거리 `dist` 를 `dur` 초에 갈 때). 끝나면 0.
 *
 * `crossSlideEase` 의 2계 도함수 × dist/dur². FluidLab 은 실제 위치를 2차 차분해
 * 쓰지만(손 슬라이더 경로도 함께 처리해야 해서), 값은 이 식과 같다.
 */
export function crossSlideAccel(t: number, dist: number, dur = CROSS_SLIDE_SECONDS): number {
  if (t < 0 || t >= dur) return 0;
  const u = t / dur;
  return ((60 * u - 180 * u * u + 120 * u * u * u) * dist) / (dur * dur);
}
