// 스월 회전 파동 — 잔을 도는 표면 파동의 높이.
//
// 고정 방향 평면파(연못 물결처럼 교차 → 부자연)를 버리고 잔을 도는 응집 파동으로 만든다.
//  - mode-1: 벽을 타고 오르는 크레스트(rp² · cos(θ−φ)), φ = 스월 방향
//  - mode-2,3: 그 위를 도는 회전 로브(rp · cos(mθ−φ−w·t))
//
// three.js 를 쓰지 않는 순수 계산이라 렌더 코드 밖에 둔다.

/** 벽 크레스트(mode-1) 진폭. */
export const WAMP1 = 0.08;
/** mode-2 로브 진폭. */
export const WAMP2 = 0.024;
/** mode-3 로브 진폭. */
export const WAMP3 = 0.014;

/**
 * Stokes 2차 계수 — 주 마루를 뾰족하게, 골을 완만하게.
 * 사인파의 둥근 마루(젤리 표면)가 아니라 실제 중력파의 형상이다. 평균 0 → 부피 보존.
 */
export const WCREST_SHARP = 0.3;

/**
 * mode-m 각진동수. 원형 용기에서 ω_m = √(g·k_m·tanh(k_m·h)), k_m = ε_m1/R.
 * 위상이 cos(mθ−φ−w·t) 라 w 는 그 모드의 각진동수이고, 화면에서 도는 무늬의
 * 각속도는 w/m 이다(차수가 높을수록 무늬가 느리게 돈다).
 *
 * ⚠️ 베셀 근 ε₂₁=3.054·ε₃₁=4.201 을 그대로 여기 넣으면 안 된다. 값이 비슷해 보이지만
 * 그건 파수를 정하는 무차원 상수지 각진동수가 아니다. 넣으면 무늬가 10배 가까이 느려지고
 * mode-3 이 mode-2 보다 빠르게 도는 역전이 생긴다.
 */
export const W2SPD = 32.3;
export const W3SPD = 37.9;

/**
 * 로브(mode-2,3) 회전이 크레스트보다 먼저 멎는 정도 — 회전 관성 `spin` 의 이 제곱을 쓴다.
 *
 * 차수가 높은 모드일수록 감쇠가 크다. 파장이 짧아 경계층 손실이 상대적으로 커서,
 * 실제로도 잔무늬가 큰 너울보다 먼저 사라진다.
 *
 * 1 로 두면(= 크레스트와 같은 속도로 잦아들면) 큰 출렁임이 거의 가라앉은 뒤에도 잔무늬가
 * 계속 빠르게 돌아 "액체가 아직 회전하고 있다"는 인상이 남는다. W2SPD 가 32 rad/s 라
 * spin 이 0.5 만 돼도 무늬는 초당 1.3 바퀴를 돈다 — 눈에 제일 먼저 띄는 게 이쪽이다.
 * 2026-09-10 에 "회전이 오래 지속되는 게 아쉽다"는 이야기가 나온 원인.
 */
export const LOBE_SPIN_EXP = 2;

/** 파동 위상 캐시 — 프레임마다 갱신해 컬럼마다 재사용한다. */
export interface WavePhase {
  /** 활성도 0~1. 0이면 완전 평면. */
  act: number;
  crC: number; // cos φ
  crS: number; // sin φ
  l2c: number; // cos(φ + w2·t)
  l2s: number;
  l3c: number; // cos(φ + w3·t)
  l3s: number;
}

export const flatWave = (): WavePhase => ({
  act: 0,
  crC: 1,
  crS: 0,
  l2c: 1,
  l2s: 0,
  l3c: 1,
  l3s: 0,
});

/** 컬럼 각도의 삼각함수 묶음(θ, 2θ, 3θ). 각도마다 미리 계산해 돌려 쓴다. */
export interface ColumnTrig {
  c: number;
  s: number;
  c2: number;
  s2: number;
  c3: number;
  s3: number;
}

/**
 * 표면 파동 높이. `rp` 는 중심 0 ~ 벽 1 의 정규화 반경.
 * 정지 상태(act≈0)에선 0 을 돌려 완전한 평면이 된다.
 */
export function surfaceWaveHeight(p: WavePhase, t: ColumnTrig, rp: number): number {
  if (p.act <= 1e-4) return 0;
  const m1 = t.c * p.crC + t.s * p.crS; // cos(θ−φ)
  const m2 = t.c2 * p.l2c + t.s2 * p.l2s; // cos(2θ−φ−w2·t)
  const m3 = t.c3 * p.l3c + t.s3 * p.l3s; // cos(3θ−φ−w3·t)
  const m1s = m1 + WCREST_SHARP * (m1 * m1 - 0.5);
  return p.act * (WAMP1 * rp * rp * m1s + WAMP2 * rp * m2 + WAMP3 * rp * m3);
}
