// 자동 스월 — 잔이 스스로 한 번 도는 동작의 파형.
//
// 잔 기울기를 원으로 몇 바퀴 돌린다. 진폭은 들어갈 때·나올 때 부드럽게 여닫아
// 갑자기 홱 꺾이지 않게 한다.
//
// 왜 FluidLab.tsx 밖에 두나: 그 파일은 `@ts-nocheck` 라 상수를 잘못 고쳐도 아무도
// 안 잡는다. 여기 있으면 테스트가 슬로싱과 함께 돌려 보고 "정말 커지는지"를 잰다
// (slosh.ts·legs.ts 를 뺀 것과 같은 이유).
//
// ── 숫자의 근거 (auto-swirl.test.ts 가 확인한다) ──
//
// **길이는 바퀴 수가 아니라 램프가 정한다.** 수면은 스월 시작 0.4초에 이미 최대로
// 오른다 — 그 뒤로는 잔만 계속 돌 뿐 와인이 더 올라오지 않는다. 그래서 5바퀴를
// 2.4초에 돌리던 것을 3바퀴 1.45초로 줄여도 잃는 게 없다.
//
// 정작 예전에 잃고 있던 건 램프 쪽이었다. 2.4초 중 0.7초(0.3 들어가기 + 0.4 나오기)가
// 여닫는 데 쓰여, 좁은 잔일수록 제대로 밀리기 전에 진폭이 줄었다. 램프를 0.15·0.25 로
// 줄이니 **같은 회전 속도에서** 플루트가 0.083 → 0.120 rad 로 올라왔다(예전에는
// 사실상 스월이 안 보였다).
//
// 회전 속도는 **화면에서 손놀림처럼 보이는가**로 정한다. 사람이 스월하는 범위가
// 1~2.5Hz 인데, 그 안이어도 화면의 잔은 실물보다 크게 그려져 빠르게 읽힌다.
//
//   2.50Hz  보르도 0.237  "잔이 빠르게 떠는 것 같다"
//   2.07Hz  보르도 0.180  이것도 빠르다는 이야기를 들었다(예전 기본값과 같은 속도)
//   1.71Hz  보르도 0.151  지금 값
//
// 느릴수록 공진(보르도 4.1Hz)에서 멀어져 수면이 덜 밀린다 — 2.07 → 1.71 에서 16% 줄었다.
// 1.8Hz 아래부터는 램프를 고쳐 얻은 몫을 도로 내주는 구간이다(예전 기본값이 0.155).
// 그래도 눈에 보이는 게 먼저라 1.71 을 골랐다. **1.5Hz 아래로는 내리지 말 것** —
// 거기서부터는 스월인지 아닌지 알아보기 어려워진다(테스트가 하한으로 잡고 있다).

/** 도는 바퀴 수. */
export const AUTO_SWIRL_ROTATIONS = 3;

/** 도는 데 걸리는 시간(초). 바퀴 수와 함께 회전 속도를 정한다 — 3/1.75 ≈ 1.71Hz. */
export const AUTO_SWIRL_SECONDS = 1.75;

/**
 * 진폭이 차오르는 시간(초). 여기를 늘리면 전체를 늘려도 스월이 약해진다 — 여닫는
 * 동안은 잔이 액체를 제대로 못 민다.
 */
const RAMP_IN = 0.15;

/** 진폭이 잦아드는 시간(초). 들어갈 때보다 길어야 끝이 툭 끊기지 않는다. */
const RAMP_OUT = 0.25;

/** 회전 속도(Hz). 사람이 스월하는 범위(1~2.5Hz) 안이어야 한다. */
export const AUTO_SWIRL_HZ = AUTO_SWIRL_ROTATIONS / AUTO_SWIRL_SECONDS;

/**
 * 스월 시작 후 `t` 초일 때의 잔 기울기(월드 x·z).
 *
 * `maxTilt` 는 이 잔에서 허용하는 최대 기울기(rad) — 넘기면 잔이 프레임을 벗어난다.
 * `t` 가 `AUTO_SWIRL_SECONDS` 를 넘으면 0 을 준다(끝났다는 뜻).
 */
/**
 * 이번 유휴 구간에서 이미 `done` 번 돌았을 때, 다음 스월까지 기다릴 시간(초).
 * `null` 이면 더 안 돈다.
 *
 * 처음과 그 뒤의 간격이 다르다 — 진입 직후엔 빨리 한 번 보여 주고("이거 움직인다"),
 * 그 뒤엔 천천히. 첫 간격으로 계속 돌면 화면이 쉬지 않아 부산하다.
 * `every` 를 안 주면 한 번만 돌고 만다(상세 화면처럼 조용해야 하는 자리).
 */
export function nextSwirlWait(
  done: number,
  after: number | undefined,
  every: number | undefined
): number | null {
  if (after == null) return null; // 자동 스월을 아예 안 쓰는 화면
  return done === 0 ? after : (every ?? null);
}

export function autoSwirlTilt(t: number, maxTilt: number): { x: number; z: number } {
  if (t < 0 || t >= AUTO_SWIRL_SECONDS) return { x: 0, z: 0 };
  const phase = (2 * Math.PI * AUTO_SWIRL_ROTATIONS * t) / AUTO_SWIRL_SECONDS;
  const env = Math.min(t / RAMP_IN, 1) * Math.min((AUTO_SWIRL_SECONDS - t) / RAMP_OUT, 1);
  const amp = maxTilt * Math.max(0, env);
  return { x: amp * Math.cos(phase), z: amp * Math.sin(phase) };
}
