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
 * 용기에서는 접촉선(메니스커스) 소산이 크게 더해진다. 하한 그대로 두면 한 번
 * 기울일 때 30회쯤 출렁여 촐랑거린다(2026-09-08 실사용 확인).
 *
 * 값을 3.4 → 2.0 으로 낮추고 그만큼을 `QUAD_DAMPING` 으로 옮겼다. 감쇠 **총량**은
 * 같지만(큰 출렁 반감기 0.72초 그대로) 성격이 달라진다 — 아래 참고.
 * 1.0 아래로는 내려갈 수 없다: 접촉선 소산은 점성에 **더해지는** 것이라 Miles 하한이
 * 물리적 바닥이다.
 */
export const CONTACT_DAMPING = 2.0;

/**
 * 잔 움직임 → 슬로싱 결합 계수를 ω 에 비례시키는 비율.
 *
 * 충격성 입력(드래그)의 진폭은 COUPLE/ω 에 비례한다(준정적 구동의 COUPLE/ω² 와
 * 다르다). 그래서 ω 에 비례시켜야 어떤 잔이든 손맛이 같다. 값은 보르도(ω≈25)에서
 * 손으로 맞췄다.
 */
export const COUPLE_PER_OMEGA = 0.664;

/**
 * 2차(난류) 감쇠. 크게 출렁일수록 손실이 는다 — 큰 파도는 깨지며 흩어지고 작은
 * 잔물결은 그냥 잦아든다.
 *
 * **이 항이 액체와 용수철을 가른다.** 선형 감쇠(위 ζ)만 있으면 진폭과 무관하게 같은
 * 비율로 줄어, 출렁임 하나하나가 앞것을 그대로 축소한 복사본이 된다 — 그게 "젤리
 * 같다"의 물리적 정체다. 0.05 에서는 큰 출렁과 작은 출렁의 감쇠가 거의 같았고
 * (반감기 비 1.14배), 0.16 에서는 1.51배가 된다.
 *
 * 과하면 초기에 급사해 꿀처럼 보인다(예전에 3.0 에서 겪음). 감쇠 총량을 고정한 채
 * ζ 와 맞바꾼 값이라 드래그 뒤 출렁 횟수는 7 → 8 회로 거의 그대로다.
 */
export const QUAD_DAMPING = 0.16;

/**
 * 수면 기울기 상한(rad). 45°는 사실상 안 걸려 넓은 볼에서 자동 스월 때 와인이
 * 잔 위로 넘쳐 보였다. 17°면 좁은 잔엔 영향이 없고 넓은 볼의 과한 피크만 깎는다.
 */
export const SLOSH_MAX = 0.3;

/**
 * **회전 마찰** — 수면이 도는 성분에만 따로 거는 감쇠(1/s).
 *
 * 감쇠 진동자는 진폭만 줄일 뿐 편광을 바꾸지 않는다. 원을 그리며 돌던 수면은 작아지면서도
 * 계속 같은 속도로 돌아, 큰 출렁임이 가라앉은 뒤에도 "잔잔하게 계속 회전"하는 상태가
 * 오래 남는다(2026-09-10 실사용 피드백). 잔을 놓은 지 2초가 지나도 그랬다.
 *
 * 실제로는 도는 성분이 벽·바닥 마찰로 따로 잃는다(각운동량 소산). 그래서 속도를 위치에
 * 대한 **지름 방향과 접선 방향**으로 나눠, 접선 쪽만 이 비율로 깎는다.
 *
 * 효과: 원운동은 빠르게 한 축 왕복으로 바뀌고, 그 왕복은 원래 감쇠대로 잦아든다.
 * 앞뒤로 출렁이기만 하는 움직임(접선 성분 ≈ 0)은 **아무 영향도 받지 않는다** — 사용자가
 * 좋다고 한 "출렁임의 액체 느낌"을 건드리지 않으려면 이 점이 중요하다. ζ·QUAD 를 올려
 * 같은 효과를 내려 하면 출렁임까지 함께 죽어 꿀처럼 보인다.
 *
 * 값은 자동 스월을 한 번 돌려 재서 골랐다. 부르고뉴(감쇠가 가장 작은 잔)가 기준이다:
 *
 * ```
 *   마찰   스월 최대   t=2.0 (기울기/둥글기)   t=3.0
 *   0      0.384       0.197 / 0.82            0.118 / 0.87   ← 3초 뒤에도 계속 돈다
 *   3      0.344       0.066 / 0.53            0.016 / 0.40   ← 지금 값
 *   5      0.308       0.027 / 0.34            0.010 / 0.05   ← 스월 뒤가 너무 빨리 죽는다
 *   12     0.184       0.003 / 0.06            0.014 / 0.01   ← 스월 자체가 약해진다
 * ```
 *
 * 마찰은 도는 성분을 깎으므로 **스월 최대 진폭도 함께 줄인다.** 그게 올릴 수 있는 한계다.
 *
 * 2.5 아래로는 내리지 말 것 — 거기서부터 "스월이 끝나도 수면이 계속 돈다"가 돌아온다
 * (아래 회전 테스트가 2.5 에서 턱걸이로 걸린다). 위로는 5.0 에서 스월 뒤 잔여가 보르도
 * 0.6초까지 짧아져 뚝 서는 인상이 된다. 3.0 은 그 사이다.
 *
 * 아래 `SLIDE_COUPLING` 과 짝이다 — 스월 뒤와 이동 뒤가 비슷한 시간에 멎어야 한다.
 */
export const SWIRL_FRICTION = 3.0;

/**
 * 잔이 옆으로 미끄러질 때 그 가속도가 액체를 미는 세기.
 *
 * **값은 실제 물리에 맞춘다.** 1 월드 단위가 19.6cm 이므로(`GLASS_HEIGHT_M/SCREEN_REF`),
 * 보통 폭의 화면에서 잔은 1.3초에 59cm 를 건너간다 — 최대 가속 2.0m/s². 가속하는 잔
 * 안에서 수면은 실효 중력에 직각으로 서므로 `a/g = 0.204rad` 만큼 기운다. 보르도에서
 * 0.6 이 그 값을 준다(0.191).
 *
 * ```
 *   결합   보르도 최대 / 이동 뒤 잦아듦
 *   0.30   0.095 / 0.5초   ← 물리값의 절반. 잔만 미끄러지고 안은 잠잠해 보인다
 *   0.60   0.191 / 1.2초
 *   0.80   0.254 / 1.5초   ← 물리값을 넘는다
 * ```
 *
 * 이동 거리는 화면 가로 비율을 따르므로(`offscreenSlide` = camera.right + 1.2) 넓은
 * 화면일수록 더 세게 밀린다. 그쪽이 상한이다.
 *
 * 한때 0.35 까지 내렸던 적이 있다. 스월은 회전이라 `SWIRL_FRICTION` 이 잡는데 이건
 * 한 축 왕복이라 걸릴 데가 없어, 이동 뒤에만 3.3초씩 출렁였기 때문이다. 지금은
 * `CONTACT_STICK` 이 꼬리를 끊으므로 미는 양을 줄일 이유가 없다 — **구동을 깎아
 * 잔여를 줄이려 하지 말 것.** 그건 원인이 아닌 곳을 누르는 것이다.
 */
export const SLIDE_COUPLING = 0.6;

/**
 * 회전 관성(0~1) — 수면의 크레스트가 잔을 도는 "여력".
 *
 * 감쇠 진동자는 진폭만 줄고 회전 주파수는 ω 로 고정이라, 그냥 두면 수면이 거의
 * 평평해져도 계속 빠르게 도는 것처럼 보인다. 실제 유체는 각운동량을 잃으며 멎는다.
 * 그래서 크레스트가 한 프레임에 돌 수 있는 각도에 이 값을 상한으로 건다.
 *
 * 충전은 빠르게(잔을 움직이는 동안 곧바로 1), 방전은 느리게. 방전 속도를 `(1−spin)`
 * 에 비례시켜 **빠를 땐 천천히, 느려지면 더 빨리** 줄인다 — 끝이 흐지부지되지 않고
 * 깔끔히 멈춘다(마른 마찰·접촉선 정지 느낌).
 *
 * 2026-09-10: 멎는 데 2.4초가 걸려 "액체가 너무 오래 돈다"는 이야기를 들었다.
 * 1.43초로 줄였는데도 아직 길다고 해서 1.12초까지 내렸다. 여기서 더 내리면 놓자마자
 * 뚝 서서 물이 아니라 젤리로 보인다 — 남은 건 잔무늬 쪽이라 `LOBE_SPIN_EXP` 로 뺐다.
 *
 * 감쇠(ζ·QUAD)는 건드리지 않았다 — 그쪽을 올리면 출렁임 자체가 급사해 꿀처럼 보이고,
 * 정작 "출렁임은 액체 같아서 좋다"는 쪽이었다. 문제는 출렁임이 아니라 **회전**이다.
 */
const SPIN_DECAY_BASE = 0.45;
const SPIN_DECAY_SLOW = 1.1;

/** 이 각속도(rad/s)로 잔을 움직이면 회전 관성이 가득 찬다. */
const SPIN_CHARGE_SPEED = 0.8;

/** 충전은 프레임당 이 비율로 따라붙는다. */
const SPIN_CHARGE_EASE = 0.3;

/**
 * 회전 관성 한 스텝. `glassSpeed` 는 잔 기울기의 각속도 크기(rad/s).
 * 움직이는 동안엔 차고, 놓으면 잦아든다.
 */
export function stepSpin(spin: number, glassSpeed: number, dt: number): number {
  const charge = Math.min(1, glassSpeed / SPIN_CHARGE_SPEED);
  if (charge > spin) return spin + (charge - spin) * SPIN_CHARGE_EASE;
  return Math.max(0, spin - (SPIN_DECAY_BASE + SPIN_DECAY_SLOW * (1 - spin)) * dt);
}

/**
 * **접촉선 고착** — 아주 작은 출렁임을 실제로 멈춰 세우는 마찰(rad/s²).
 *
 * ζ·QUAD 는 둘 다 속도에 비례하는 항이라, 작아질수록 제동력도 같이 작아져 **영원히
 * 안 멈춘다**. 실제로 재 보면 잔이 한 번 미끄러진 뒤 진폭 0.01 을 넘는 상태가 보르도
 * 4.0초, 부르고뉴 6.8초씩 이어지고, 0.002 까지 내려가는 데 7~13초가 걸린다. 42초마다
 * 잔을 바꾸고 18초마다 스월하는 화면에서는 이게 "가만히 있는데 계속 진동한다"가 된다
 * (2026-09-11 실사용 피드백).
 *
 * 진짜 액체는 그렇지 않다. 작은 용기에서는 메니스커스가 벽에 고착돼(접촉각 이력),
 * 미는 힘이 어느 선 아래로 내려가면 수면이 **그냥 선다**. 그래서 속도에 비례하지 않는
 * 일정한 감속을 둔다 — 마른 마찰과 같은 꼴이라 유한한 시간에 정지한다.
 *
 * **최대 진폭은 건드리지 않고 꼬리 길이만 정한다.** 큰 출렁임에는 사실상 영향이 없고
 * (속도 5rad/s 에서 초당 1.75 를 깎아 봐야 QUAD 가 이미 훨씬 크게 먹는다) 작은 것만
 * 골라 세우기 때문이다. 그래서 "멈출 때까지 자잘하게 떨린다"를 잡는 손잡이가 이것이다.
 *
 * ```
 *   STICK   이동 뒤(최대/눈에 띄는 출렁 횟수)   드래그 뒤 횟수
 *   1.00    0.191 / 6회                        7회
 *   1.75    0.190 / 4회                        5회
 *   2.50    0.188 / 3회                        4회   ← 드래그 손맛이 밋밋해진다
 * ```
 *
 * 멈춘 자리는 완전한 수평이 아니라 `STICK/ω²` 만큼 기울어 있을 수 있다 — 보르도에서
 * 0.0026rad(0.15°)라 눈에 안 띈다. 이 값을 올리면 그 기울기가 커져 수면이 비뚤어진 채
 * 서는 게 보이기 시작한다.
 */
export const CONTACT_STICK = 1.75;

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
  if (drive.slideAX) vx -= c.couple * SLIDE_COUPLING * drive.slideAX * dt;
  if (drive.slideAZ) vz -= c.couple * SLIDE_COUPLING * drive.slideAZ * dt;
  // 회전 마찰 — 속도를 지름/접선으로 나눠 접선(도는) 쪽만 깎는다. 한 축 왕복은 접선
  // 성분이 0 이라 그대로 지나간다(SWIRL_FRICTION 참고).
  const r2 = s.x * s.x + s.z * s.z;
  if (r2 > 1e-10) {
    const tanX = -s.z; // 접선 방향(위치에 수직), 길이 = |s|
    const tanZ = s.x;
    const orbit = (vx * tanX + vz * tanZ) / r2; // 공전 각속도
    const cut = Math.min(1, SWIRL_FRICTION * dt);
    vx -= orbit * tanX * cut;
    vz -= orbit * tanZ * cut;
  }
  // 접촉선 고착 — 속도에서 일정량을 깎는다(마른 마찰). 남은 속도보다 크면 0 으로.
  // 속도가 정확히 0 이면 나눗셈이 NaN 이 되므로 건너뛴다.
  const sp = Math.hypot(vx, vz);
  if (sp > 1e-12) {
    const keep = Math.max(0, sp - CONTACT_STICK * dt) / sp;
    vx *= keep;
    vz *= keep;
  }
  const clamp = (v: number) => Math.max(-SLOSH_MAX, Math.min(SLOSH_MAX, v));
  return { x: clamp(s.x + vx * dt), z: clamp(s.z + vz * dt), vx, vz };
}
