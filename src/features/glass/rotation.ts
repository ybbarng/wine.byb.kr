// 홈에서 잔을 갈아 끼우는 순서와 리듬.
//
// 화면이 저 혼자 움직이는 일은 **하나의 리듬**으로 묶는다. 스월과 교체를 따로 도는
// 타이머 두 개로 두면 둘이 겹치는 순간이 생기고, 그때가 제일 산만해 보인다.
// 그래서 "와인 한 잔이 들어와서 나갈 때까지"를 한 덩어리로 잡고 그 안에 스월을 둔다.
//
//   0초   잔이 옆에서 들어온다 → 조금 뒤 이름이 따라 들어온다
//   7초   스월 (auto-swirl.ts, FluidLab 이 알아서 돈다)
//   25초  스월 한 번 더
//   42초  이름이 먼저 나가고 잔이 뒤따라 나간다 → 다음 와인
//
// 숫자는 느린 쪽에서 시작했다. 빠른 걸 늦추는 건 쉬워도 이미 산만하다고 느낀 인상은
// 잘 안 지워진다.

/** 와인 한 잔이 머무는 시간(초). */
export const WINE_HOLD_S = 42;

/** 잔이 나가기 얼마 전에 이름이 먼저 빠지는지(초). 이름 → 잔 순서로 나간다. */
export const NAME_LEAD_S = 0.35;

/** 잔이 들어온 뒤 이름이 따라 들어오기까지(초). 잔이 먼저 눈에 들어오게. */
export const NAME_DELAY_S = 0.4;

/**
 * 잔을 만진 뒤 순환을 다시 시작하기까지 기다리는 시간(초).
 *
 * 사용자가 잔을 붙잡고 돌리는 중에 잔이 슬라이드아웃되면 최악이다. 만지는 동안은
 * 물론이고, 손을 뗀 뒤로도 한동안은 그대로 둔다 — 방금 만진 잔을 더 보고 싶을 수 있다.
 */
export const RESUME_AFTER_TOUCH_S = 15;

/**
 * 순환 순서를 만든다. 무작위로 매번 뽑지 않고 **한 번 섞어 차례로** 꺼낸다.
 *
 * 매번 무작위로 뽑으면 같은 와인이 연달아 나오는 일이 생각보다 자주 생기고(60종이라도
 * 체감으로는 자주 겹친다), 한 바퀴 도는 동안 아예 안 나오는 와인도 생긴다.
 *
 * `first` 를 주면 그 와인을 맨 앞에 둔다 — 상세를 보다 홈으로 돌아왔을 때 보던 잔에서
 * 이어지게 하는 용도다.
 */
export function rotationOrder<T extends { slug: string }>(
  wines: readonly T[],
  random: () => number = Math.random,
  first?: string | null
): T[] {
  const rest = wines.filter((w) => w.slug !== first);
  // Fisher–Yates.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const head = wines.find((w) => w.slug === first);
  return head ? [head, ...rest] : rest;
}
