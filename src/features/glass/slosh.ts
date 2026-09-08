// 와인 슬로싱(출렁임) 물리 — 감쇠 진동자 한 스텝.
//
// 수면 기울기를 2D 감쇠 진동자로 푼다. 잔을 움직이면 그 각속도가 액체를 구동하고,
// 놓으면 관성으로 계속 출렁이다 잦아든다.
//
// three.js 를 쓰지 않는 순수 계산이라 렌더 코드(FluidLab.tsx) 밖에 둔다.
// 렌더 루프 안에 있을 때는 값을 확인하려면 이 식을 임시 스크립트에 다시 구현해야 했다.
// 여기 있으면 테스트로 주파수·감쇠를 직접 잰다.

/** 원형 용기 1차 반대칭 모드의 무차원 파수 ε₁₁ = J₁' 의 첫 근. */
export const EPSILON_11 = 1.8412;

/** 와인 동점성계수(20°C, m²/s). 물 1.0e-6 의 약 1.6배. */
export const NU_WINE = 1.6e-6;

const G = 9.81;

/**
 * 점성 감쇠비를 실제보다 키우는 배수.
 *
 * Miles 식은 **매끈한 벽의 점성 경계층만** 본 값이라 하한이다. 와인잔처럼 작은
 * 용기에서는 접촉선(메니스커스) 소산이 크게 더해진다. 하한 그대로 두니 한 번
 * 기울일 때 30회쯤 출렁여 촐랑거렸다(2026-09-08 실사용 확인) → 3.4배로 잡았다.
 */
export const CONTACT_DAMPING = 3.4;

/**
 * 잔 움직임 → 슬로싱 결합 계수를 ω 에 비례시키는 비율.
 *
 * 충격성 입력(드래그)의 진폭은 COUPLE/ω 에 비례한다(준정적 구동의 COUPLE/ω² 와
 * 다르다). 그래서 ω 에 비례시켜야 어떤 잔이든 손맛이 같다. 값은 보르도(ω≈25)에서
 * 손으로 맞췄다.
 */
export const COUPLE_PER_OMEGA = 0.664;

/** 2차(난류) 감쇠. 크게 출렁일수록 손실이 는다. 실제로도 있지만 아주 작다. */
export const QUAD_DAMPING = 0.05;

/**
 * 수면 기울기 상한(rad). 45°는 사실상 안 걸려 넓은 볼에서 자동 스월 때 와인이
 * 잔 위로 넘쳐 보였다. 17°면 좁은 잔엔 영향이 없고 넓은 볼의 과한 피크만 깎는다.
 */
export const SLOSH_MAX = 0.3;

/** 이 잔의 슬로싱 상수. 형상에서 유도한다. */
export interface SloshConstants {
  omega: number; // 1차 슬로싱 각진동수(rad/s)
  zeta: number; // 감쇠비
  couple: number; // 잔 각속도 → 수면 구동 결합
}

/**
 * 잔 형상(수면 반경·액체 깊이)에서 슬로싱 상수를 유도한다.
 *
 *   ω₁ = √(g·k·tanh(k·h)),  k = ε₁₁/R
 *
 * 수면 반경 R 이 작을수록 빠르게 출렁인다 — 부르고뉴(넓은 볼) 3.1Hz ↔
 * 디저트(작은 잔) 5.6Hz 로 1.8배 차이가 난다. 그래서 상수 하나를 모든 잔에 쓸 수 없다.
 */
export function deriveSloshConstants(surfR: number, liqH: number): SloshConstants {
  const k = EPSILON_11 / surfR;
  const omega = Math.sqrt(G * k * Math.tanh(k * liqH));
  // Miles(원통): ζ ≈ 0.83·√(ν/(√g·R^1.5))·[깊이 보정]
  const kh = EPSILON_11 * (liqH / surfR);
  const base = 0.83 * Math.sqrt(NU_WINE / (Math.sqrt(G) * surfR ** 1.5));
  const depth = 1 + (0.318 / Math.sinh(kh)) * (1 + (1 - liqH / surfR) / Math.cosh(kh));
  return {
    omega,
    zeta: CONTACT_DAMPING * base * depth,
    couple: COUPLE_PER_OMEGA * omega,
  };
}

/** 수면 기울기와 그 속도(월드 x·z 축). */
export interface SloshState {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export const zeroSlosh = (): SloshState => ({ x: 0, z: 0, vx: 0, vz: 0 });

/** 이번 프레임의 구동 — 잔 기울기 각속도와 옆으로 미는 가속도(월드). */
export interface SloshDrive {
  glassTiltVX: number;
  glassTiltVZ: number;
  slideAX?: number;
  slideAZ?: number;
}

/**
 * 한 스텝 적분(semi-implicit 오일러 — 속도를 먼저 갱신하고 그 속도로 위치를 옮긴다).
 * ω·dt < 2 면 안정하다. 가장 빠른 잔(디저트 ω≈35)도 35/60 ≈ 0.59 로 여유가 있다.
 *
 * 두 축 결합 부호는 표면 크레스트가 잔 스월과 **같은 방향**으로 돌게 맞춘 것이다
 * (와인은 잔을 쫓아간다). 슬라이드 항은 잔이 +방향으로 가속하면 액체가 −방향으로
 * 쏠리게 부호를 뒤집는다.
 */
export function stepSlosh(
  s: SloshState,
  drive: SloshDrive,
  c: SloshConstants,
  dt: number
): SloshState {
  const speed = Math.hypot(s.vx, s.vz);
  const damp = 2 * c.zeta * c.omega + QUAD_DAMPING * speed;
  const w2 = c.omega * c.omega;
  let vx = s.vx + (-w2 * s.x - damp * s.vx) * dt - c.couple * drive.glassTiltVZ * dt;
  let vz = s.vz + (-w2 * s.z - damp * s.vz) * dt + c.couple * drive.glassTiltVX * dt;
  if (drive.slideAX) vx -= c.couple * 0.8 * drive.slideAX * dt;
  if (drive.slideAZ) vz -= c.couple * 0.8 * drive.slideAZ * dt;
  const clamp = (v: number) => Math.max(-SLOSH_MAX, Math.min(SLOSH_MAX, v));
  return { x: clamp(s.x + vx * dt), z: clamp(s.z + vz * dt), vx, vz };
}
