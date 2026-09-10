import { describe, expect, it } from "vitest";
import { buildGlassShape, GLASSES, realDimensions } from "./glass-geometry";
import {
  deriveSloshConstants,
  SLOSH_MAX,
  type SloshConstants,
  type SloshState,
  stepSlosh,
  stepSpin,
  zeroSlosh,
} from "./slosh";

// 슬로싱이 실제 와인잔 물리에 맞는지 여기서 직접 잰다 — 상수를 눈으로 보는 대신
// 적분해서 주파수·감쇠를 재고, 물리식이 주는 값과 대조한다.

const DT = 1 / 60;
const constsFor = (key: string) => {
  const def = GLASSES.find((g) => g.key === key);
  if (!def) throw new Error(key);
  const { surfR, liqH } = realDimensions(buildGlassShape(def));
  return deriveSloshConstants(surfR, liqH);
};

/** 자유 진동을 돌려 주파수와 진폭 반감기를 잰다. 진폭은 에너지로 재야 한다 — */
/** |기울기| 는 선형 진동에서 반주기마다 0 을 지나므로 감쇠 대신 위상을 재게 된다. */
function ringDown(c: SloshConstants, seconds = 25, x0 = 0.1) {
  let s = { ...zeroSlosh(), x: x0 }; // 기울인 채로 놓는다
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
    // 잔마다 달라야 한다 — 상수 하나를 모든 잔에 쓰면 안 된다.
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

  it("크게 출렁일수록 빨리 죽는다 — 액체와 용수철을 가르는 축", () => {
    // 선형 감쇠만 있으면 진폭과 무관하게 같은 비율로 줄어, 출렁임이 앞것의 축소
    // 복사본이 된다. 그게 "젤리 같다"의 정체다(2026-08-31·2026-09-09 실사용 피드백).
    const c = constsFor("bordeaux");
    const big = ringDown({ ...c }, 25, 0.28).halfLife;
    const small = ringDown({ ...c }, 25, 0.06).halfLife;
    expect(small / big, `큰 ${big.toFixed(2)}s · 작은 ${small.toFixed(2)}s`).toBeGreaterThan(1.3);
  });

  it("그래도 초기에 급사하지는 않는다 — 급사하면 꿀처럼 보인다", () => {
    // QUAD 가 과하면(예전에 3.0 에서 겪음) 첫 출렁에서 뚝 떨어져 점성 인상이 된다.
    const { halfLife } = ringDown(constsFor("bordeaux"), 25, 0.28);
    expect(halfLife).toBeGreaterThan(0.4);
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

describe("stepSpin — 놓으면 수면 회전이 멎는다", () => {
  /** 회전 관성이 0 이 될 때까지 걸린 시간(초). 잔은 가만히 둔다. */
  function spinDownSeconds(from = 1) {
    let spin = from;
    let t = 0;
    while (spin > 0 && t < 10) {
      spin = stepSpin(spin, 0, DT);
      t += DT;
    }
    return t;
  }

  it("1.5초 안에 멈춘다", () => {
    // 2026-09-10 이전엔 2.4초여서 "액체가 너무 오래 돈다"는 이야기를 들었다.
    // 너무 짧아도 안 된다 — 놓자마자 뚝 서면 물이 아니라 젤리로 보인다.
    const t = spinDownSeconds();
    expect(t).toBeGreaterThan(0.8);
    expect(t).toBeLessThan(1.5);
  });

  it("느려질수록 더 빨리 준다 — 끝이 흐지부지되지 않게", () => {
    // 같은 폭(0.2)을 지나는 데 걸리는 시간을 빠를 때와 느릴 때로 비교한다.
    const span = (from: number, to: number) => {
      let spin = from;
      let t = 0;
      while (spin > to && t < 10) {
        spin = stepSpin(spin, 0, DT);
        t += DT;
      }
      return t;
    };
    expect(span(1, 0.8)).toBeGreaterThan(span(0.3, 0.1));
  });

  it("잔을 움직이면 곧바로 다시 찬다", () => {
    let spin = 0;
    for (let i = 0; i < 10; i++) spin = stepSpin(spin, 2.0, DT);
    expect(spin).toBeGreaterThan(0.9);
  });

  it("천천히 움직이면 그만큼만 찬다 — 살살 흔들면 살살 돈다", () => {
    let spin = 0;
    for (let i = 0; i < 30; i++) spin = stepSpin(spin, 0.4, DT);
    expect(spin).toBeGreaterThan(0.3);
    expect(spin).toBeLessThan(0.7);
  });
});

describe("회전 마찰 — 도는 것만 잡고 출렁임은 놔둔다", () => {
  /** 한 주기 창에서 |s| 의 최소/최대 비. 1 이면 원운동, 0 이면 한 축 왕복. */
  function roundnessAt(c: SloshConstants, s0: SloshState, seconds: number) {
    const win = Math.round((2 * Math.PI) / c.omega / DT);
    let s = s0;
    const hist: number[] = [];
    for (let t = 0; t < seconds; t += DT) {
      s = stepSlosh(s, { glassTiltVX: 0, glassTiltVZ: 0 }, c, DT);
      hist.push(Math.hypot(s.x, s.z));
      if (hist.length > win) hist.shift();
    }
    const hi = Math.max(...hist);
    const lo = Math.min(...hist);
    return { round: hi > 1e-12 ? lo / hi : 0, mag: Math.hypot(s.x, s.z) };
  }

  /** 정확히 원을 그리며 도는 초기 상태. */
  const circular = (c: SloshConstants, a = 0.2): SloshState => ({
    x: a,
    z: 0,
    vx: 0,
    vz: a * c.omega,
  });

  it("원운동은 한 축 왕복으로 바뀐다", () => {
    // 시간이 갈수록 덜 둥글어지고, 1.5초 뒤에는 거의 한 축으로만 오간다.
    const c = constsFor("bordeaux");
    const early = roundnessAt(c, circular(c), 0.35).round;
    const late = roundnessAt(c, circular(c), 1.5).round;
    expect(late, `이른 ${early.toFixed(2)} · 늦은 ${late.toFixed(2)}`).toBeLessThan(early);
    expect(late).toBeLessThan(0.35);
  });

  it("가장 오래 도는 잔(부르고뉴)도 2초 안에 회전이 사라진다", () => {
    // 감쇠가 가장 작은 잔이라 예전에는 3초 뒤에도 둥글기 0.87 로 계속 돌았다.
    const c = constsFor("burgundy");
    expect(roundnessAt(c, circular(c), 2).round).toBeLessThan(0.4);
  });

  it("한 축으로만 출렁이면 아무 영향도 받지 않는다", () => {
    // 사용자가 좋다고 한 "출렁임의 액체 느낌"이 이쪽이다. 접선 성분이 0 이라
    // 마찰이 걸릴 데가 없어야 한다 — 축을 벗어나지 않고 그대로 오간다.
    const c = constsFor("bordeaux");
    let s: SloshState = { x: 0.2, z: 0, vx: 0, vz: 0 };
    for (let t = 0; t < 3; t += DT) {
      s = stepSlosh(s, { glassTiltVX: 0, glassTiltVZ: 0 }, c, DT);
      expect(Math.abs(s.z)).toBeLessThan(1e-12);
    }
  });
});
