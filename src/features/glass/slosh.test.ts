import { describe, expect, it } from "vitest";
import { buildGlassShape, GLASSES, realDimensions } from "./glass-geometry";
import {
  deriveSloshConstants,
  SLOSH_MAX,
  type SloshConstants,
  stepSlosh,
  zeroSlosh,
} from "./slosh";

// 슬로싱이 실제 와인잔 물리에 맞는지 여기서 직접 잰다. 예전엔 이 식이 302줄짜리
// 렌더 루프 안에 있어, 값을 확인하려면 임시 스크립트에 다시 구현해야 했다.

const DT = 1 / 60;
const constsFor = (key: string) => {
  const def = GLASSES.find((g) => g.key === key);
  if (!def) throw new Error(key);
  const { surfR, liqH } = realDimensions(buildGlassShape(def));
  return deriveSloshConstants(surfR, liqH);
};

/** 자유 진동을 돌려 주파수와 진폭 반감기를 잰다. 진폭은 에너지로 재야 한다 — */
/** |기울기| 는 선형 진동에서 반주기마다 0 을 지나므로 감쇠 대신 위상을 재게 된다. */
function ringDown(c: SloshConstants, seconds = 25) {
  let s = { ...zeroSlosh(), x: 0.1 }; // 기울인 채로 놓는다
  const trace: { t: number; x: number; amp: number }[] = [];
  for (let t = 0; t < seconds; t += DT) {
    s = stepSlosh(s, { glassTiltVX: 0, glassTiltVZ: 0 }, c, DT);
    const E = s.vx * s.vx + s.vz * s.vz + c.omega * c.omega * (s.x * s.x + s.z * s.z);
    trace.push({ t, x: s.x, amp: Math.sqrt(E) / c.omega });
  }
  const zc: number[] = [];
  for (let i = 1; i < trace.length; i++) {
    if (trace[i - 1].x <= 0 && trace[i].x > 0) zc.push(trace[i].t);
  }
  const periods = zc.slice(1).map((v, i) => v - zc[i]);
  const hz = periods.length ? 1 / (periods.reduce((a, b) => a + b, 0) / periods.length) : NaN;
  const a0 = trace[0].amp;
  const half = trace.find((p) => p.amp <= a0 / 2);
  return { hz, halfLife: half ? half.t : Number.POSITIVE_INFINITY };
}

describe("deriveSloshConstants — 형상에서 물리 유도", () => {
  it("보르도 잔은 약 4Hz 로 출렁인다", () => {
    // ω₁ = √(g·k·tanh(k·h)), k = ε₁₁/R. 수면 반경(벽 두께 뺀 내벽) ≈2.8cm·깊이 5.0cm.
    const c = constsFor("bordeaux");
    expect(c.omega).toBeCloseTo(25.9, 0);
    expect(c.omega / (2 * Math.PI)).toBeCloseTo(4.12, 1);
  });

  it("수면이 넓을수록 느리게 출렁인다", () => {
    // 잔마다 달라야 한다 — 예전엔 상수 하나를 모든 잔에 썼다.
    const burgundy = constsFor("burgundy"); // 가장 넓은 볼
    const dessert = constsFor("dessert"); // 가장 작은 잔
    expect(burgundy.omega).toBeLessThan(dessert.omega);
    expect(dessert.omega / burgundy.omega).toBeGreaterThan(1.5); // 실제 1.8배
  });

  it("좁은 잔일수록 감쇠가 크다(점성 경계층이 상대적으로 두껍다)", () => {
    expect(constsFor("dessert").zeta).toBeGreaterThan(constsFor("burgundy").zeta);
  });

  it("결합은 ω 에 비례한다 — 어떤 잔이든 드래그 손맛이 같게", () => {
    for (const g of GLASSES) {
      const c = constsFor(g.key);
      expect(c.couple / c.omega, g.key).toBeCloseTo(0.664, 6);
    }
  });

  it("모든 잔에서 상수가 유한하고 양수", () => {
    for (const g of GLASSES) {
      const c = constsFor(g.key);
      expect(Number.isFinite(c.omega) && c.omega > 0, g.key).toBe(true);
      expect(Number.isFinite(c.zeta) && c.zeta > 0, g.key).toBe(true);
    }
  });
});

describe("stepSlosh — 적분", () => {
  it("측정한 진동수가 유도한 ω 와 맞는다", () => {
    const c = constsFor("bordeaux");
    expect(ringDown(c).hz).toBeCloseTo(c.omega / (2 * Math.PI), 0);
  });

  it("놓으면 몇 초에 걸쳐 잦아든다(즉시 멈추지도, 영원히 돌지도 않는다)", () => {
    const { halfLife } = ringDown(constsFor("bordeaux"));
    expect(halfLife).toBeGreaterThan(0.5); // 너무 빨리 죽으면 꿀처럼 보인다
    expect(halfLife).toBeLessThan(5); // 너무 오래 돌면 촐랑거린다
  });

  it("가만두면 움직이지 않는다", () => {
    let s = zeroSlosh();
    const c = constsFor("bordeaux");
    for (let i = 0; i < 600; i++) s = stepSlosh(s, { glassTiltVX: 0, glassTiltVZ: 0 }, c, DT);
    expect(Math.hypot(s.x, s.z)).toBeLessThan(1e-9);
  });

  it("잔을 돌리면 수면이 같은 방향으로 따라 돈다", () => {
    // 잔이 +X 축으로 기울어지면 수면은 +Z 쪽으로 밀린다(와인이 잔을 쫓아간다).
    const c = constsFor("bordeaux");
    const s = stepSlosh(zeroSlosh(), { glassTiltVX: 1, glassTiltVZ: 0 }, c, DT);
    expect(s.vz).toBeGreaterThan(0);
    expect(s.vx).toBe(0);
  });

  it("세게 흔들어도 상한을 넘지 않는다(와인이 잔 위로 넘치지 않게)", () => {
    const c = constsFor("burgundy"); // 진폭이 가장 큰 잔
    let s = zeroSlosh();
    let peak = 0;
    for (let t = 0; t < 6; t += DT) {
      // 계속 세게 원운동으로 돌린다
      const ph = 2 * Math.PI * 2.1 * t;
      s = stepSlosh(s, { glassTiltVX: 3 * Math.cos(ph), glassTiltVZ: 3 * Math.sin(ph) }, c, DT);
      peak = Math.max(peak, Math.hypot(s.x, s.z));
    }
    expect(peak).toBeLessThanOrEqual(SLOSH_MAX * Math.SQRT2 + 1e-9);
  });

  it("가장 빠른 잔에서도 수치적으로 안정하다(발산하지 않는다)", () => {
    // semi-implicit 오일러는 ω·dt < 2 면 안정. 디저트 잔이 ω 가 가장 크다.
    const c = constsFor("dessert");
    expect(c.omega * DT).toBeLessThan(2);
    let s = { ...zeroSlosh(), x: 0.2 };
    for (let i = 0; i < 60 * 30; i++) {
      s = stepSlosh(s, { glassTiltVX: 0, glassTiltVZ: 0 }, c, DT);
    }
    expect(Math.hypot(s.x, s.z)).toBeLessThan(0.01); // 발산 대신 잦아든다
  });
});
