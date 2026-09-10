// 자동 스월 — 잔이 스스로 한 번 도는 동작의 파형.
//
// 잔 기울기를 원으로 몇 바퀴 돌린다. 진폭은 들어갈 때·나올 때 부드럽게 여닫아
// 갑자기 홱 꺾이지 않게 한다.
//
// 왜 FluidLab.tsx 밖에 두나: 그 파일은 `@ts-nocheck` 라 상수를 잘못 고쳐도 아무도
// 안 잡는다. 여기 있으면 테스트가 슬로싱과 함께 돌려 보고 "정말 커지는지"를 잰다
// (slosh.ts·legs.ts 를 뺀 것과 같은 이유).
//
// ── 숫자의 근거 (2026-09-10 측정, auto-swirl.test.ts 가 확인한다) ──
//
// 예전엔 5바퀴를 2.4초에 돌렸는데, 재 보니 **수면은 0.4초에 이미 최대**였고 나머지
// 2초는 잔만 계속 돌 뿐 와인은 더 안 올라왔다. 3.5바퀴로 줄여도 잃는 게 없다.
//
// 속도는 오히려 올렸다. 보르도 잔의 슬로싱 고유진동수가 4.0Hz 인데 2.1Hz 로 돌리면
// 공진에서 멀어 손해를 본다. 2.5Hz 로 올리니 같은 기울기로 수면이 64% 더 크게
// 넘실댄다(0.171 → 0.280 rad). 플루트는 0.082 → 0.174 로, 예전엔 사실상 스월이
// 안 보이던 것이 보이게 됐다.
//
// **2.5Hz 위로 올리지 말 것.** 더 크게는 되지만(2.9Hz 에서 0.340) 사람이 실제로
// 스월하는 범위가 1~2.5Hz 라, 그 위는 손으로 돌리는 게 아니라 잔이 떠는 것처럼 보인다.

/** 도는 바퀴 수. */
export const AUTO_SWIRL_ROTATIONS = 3.5;

/** 도는 데 걸리는 시간(초). 바퀴 수와 함께 회전 속도를 정한다 — 3.5/1.4 = 2.5Hz. */
export const AUTO_SWIRL_SECONDS = 1.4;

/** 진폭이 차오르는 시간(초). */
const RAMP_IN = 0.15;

/** 진폭이 잦아드는 시간(초). 들어갈 때보다 길어야 끝이 툭 끊기지 않는다. */
const RAMP_OUT = 0.25;

/** 회전 속도(Hz). 사람이 세게 스월하는 상한이다. */
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
