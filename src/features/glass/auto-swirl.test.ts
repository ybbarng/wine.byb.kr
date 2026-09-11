import { describe, expect, it } from "vitest";
import {
  AUTO_SWIRL_HZ,
  AUTO_SWIRL_ROTATIONS,
  AUTO_SWIRL_SECONDS,
  autoSwirlTilt,
  nextSwirlWait,
} from "./auto-swirl";
import { buildGlassShape, GLASS, GLASSES, realDimensions } from "./glass-geometry";
import { deriveSloshConstants, stepSlosh, zeroSlosh } from "./slosh";

const DT = 1 / 60;
/** 홈 잔의 최대 기울기 — FluidLab 의 `GMAX = 0.32 * swirlScale`, 홈은 0.8. */
const MAX_TILT = 0.32 * 0.8;
/** FluidLab 이 잔 기울기를 목표값으로 따라가는 비율(프레임당). */
const G_EASE = 0.5;

/** 스월 한 번 = 그동안의 목표 기울기를 주는 함수 + 그 길이. */
type Swirl = { tiltAt: (t: number) => { x: number; z: number }; seconds: number };

/** 지금 설정 — 제품이 실제로 쓰는 파형 그대로 넣는다(테스트가 상수를 다시 적지 않게). */
const NOW: Swirl = {
  tiltAt: (t) => autoSwirlTilt(t, MAX_TILT),
  seconds: AUTO_SWIRL_SECONDS,
};

/**
 * 같은 속도·길이인데 **램프만 예전 값(0.3·0.4)**인 파형. 램프가 얼마나 먹는지를
 * 속도와 섞이지 않게 재려고 둔다 — 회전 속도는 눈에 맞춰 바뀔 수 있으므로, 그것과
 * 함께 묶어 비교하면 속도를 조정할 때마다 이 테스트가 엉뚱하게 깨진다.
 */
const OLD_RAMP: Swirl = {
  seconds: AUTO_SWIRL_SECONDS,
  tiltAt: (t) => {
    const dur = AUTO_SWIRL_SECONDS;
    if (t < 0 || t >= dur) return { x: 0, z: 0 };
    const phase = (2 * Math.PI * AUTO_SWIRL_ROTATIONS * t) / dur;
    const env = Math.max(0, Math.min(t / 0.3, 1) * Math.min((dur - t) / 0.4, 1));
    return { x: MAX_TILT * env * Math.cos(phase), z: MAX_TILT * env * Math.sin(phase) };
  },
};

/**
 * 자동 스월을 한 번 돌리고, 수면이 얼마나 기울었다가 언제 최대에 이르는지 잰다.
 * FluidLab 의 루프와 같은 순서로 돈다 — 목표 기울기 → 잔이 따라감 → 그 각속도가 구동.
 */
function swirlOnce(glassKey: keyof typeof GLASS, cfg: Swirl = NOW) {
  const { tiltAt, seconds } = cfg;
  const { surfR, liqH } = realDimensions(buildGlassShape(GLASSES[GLASS[glassKey]]));
  const c = deriveSloshConstants(surfR, liqH);
  let s = zeroSlosh();
  let tiltX = 0;
  let tiltZ = 0;
  let peak = 0;
  let peakAt = 0;

  for (let t = 0; t < seconds + 8; t += DT) {
    const { x: goalX, z: goalZ } = tiltAt(t);
    const prevX = tiltX;
    const prevZ = tiltZ;
    tiltX += (goalX - tiltX) * G_EASE;
    tiltZ += (goalZ - tiltZ) * G_EASE;
    s = stepSlosh(
      s,
      { glassTiltVX: (tiltX - prevX) / DT, glassTiltVZ: (tiltZ - prevZ) / DT },
      c,
      DT
    );

    const mag = Math.hypot(s.x, s.z);
    if (mag > peak) {
      peak = mag;
      peakAt = t;
    }
  }
  return { peak, peakAt };
}

describe("언제 도는가", () => {
  it("처음은 빨리, 그 뒤는 천천히", () => {
    expect(nextSwirlWait(0, 7, 18)).toBe(7);
    expect(nextSwirlWait(1, 7, 18)).toBe(18);
    expect(nextSwirlWait(9, 7, 18)).toBe(18);
  });

  it("간격을 안 주면 한 번만 돈다 — 상세 화면처럼 조용해야 하는 자리", () => {
    expect(nextSwirlWait(0, 7, undefined)).toBe(7);
    expect(nextSwirlWait(1, 7, undefined)).toBeNull();
  });

  it("첫 대기를 안 주면 아예 안 돈다", () => {
    // 간격만 넘겼다고 돌기 시작하면, 자동 스월을 끈 화면에서 잔이 혼자 움직인다.
    expect(nextSwirlWait(0, undefined, 18)).toBeNull();
    expect(nextSwirlWait(3, undefined, 18)).toBeNull();
  });
});

describe("자동 스월 파형", () => {
  it("끝나면 잔을 놓는다", () => {
    expect(autoSwirlTilt(AUTO_SWIRL_SECONDS, MAX_TILT)).toEqual({ x: 0, z: 0 });
    expect(autoSwirlTilt(AUTO_SWIRL_SECONDS + 1, MAX_TILT)).toEqual({ x: 0, z: 0 });
    expect(autoSwirlTilt(-0.1, MAX_TILT)).toEqual({ x: 0, z: 0 });
  });

  it("시작과 끝은 기울기가 0 에서 여닫힌다 — 갑자기 홱 꺾이지 않게", () => {
    expect(Math.hypot(...Object.values(autoSwirlTilt(0, MAX_TILT)))).toBe(0);
    const nearEnd = autoSwirlTilt(AUTO_SWIRL_SECONDS - 0.01, MAX_TILT);
    expect(Math.hypot(nearEnd.x, nearEnd.z)).toBeLessThan(MAX_TILT * 0.1);
  });

  it("최대 기울기를 넘지 않는다 — 넘기면 잔이 프레임을 벗어난다", () => {
    for (let t = 0; t < AUTO_SWIRL_SECONDS; t += 0.01) {
      const { x, z } = autoSwirlTilt(t, MAX_TILT);
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(MAX_TILT + 1e-9);
    }
  });

  it("한 방향으로 돈다 — 정한 바퀴 수만큼", () => {
    // 위상이 되돌아가면 잔이 흔들리는 것처럼 보인다. 각도가 단조 증가하는지 본다.
    let turns = 0;
    let prev = Math.atan2(autoSwirlTilt(0.02, MAX_TILT).z, autoSwirlTilt(0.02, MAX_TILT).x);
    for (let t = 0.02; t < AUTO_SWIRL_SECONDS - 0.02; t += 0.005) {
      const { x, z } = autoSwirlTilt(t, MAX_TILT);
      const a = Math.atan2(z, x);
      let d = a - prev;
      if (d < -Math.PI) d += 2 * Math.PI;
      expect(d).toBeGreaterThanOrEqual(0);
      turns += d;
      prev = a;
    }
    expect(turns / (2 * Math.PI)).toBeCloseTo(AUTO_SWIRL_ROTATIONS, 0);
  });
});

describe("왜 짧게, 왜 이 속도로 (2026-09-10 측정)", () => {
  it("수면은 0.5초 안에 최대로 오른다 — 더 도는 건 아무것도 더하지 않는다", () => {
    // 예전엔 5바퀴를 2.4초 돌렸는데 수면은 0.4초에 이미 최대였다. 바퀴를 늘리려는
    // 사람이 있으면 이 숫자를 먼저 보라는 뜻으로 남긴다.
    for (const g of ["bordeaux", "burgundy", "flute"] as const) {
      expect(swirlOnce(g).peakAt, g).toBeLessThan(0.8);
    }
  });

  it("예전(5바퀴/2.4초)보다 짧게 돈다", () => {
    // 수면이 0.4초에 최대에 이르므로 길게 돌 이유가 없다. 위 테스트가 그 근거다.
    expect(AUTO_SWIRL_SECONDS).toBeLessThan(2.4);
  });

  it("램프를 짧게 한 덕에 같은 속도에서도 더 크게 출렁인다", () => {
    // 여닫는 시간(0.3·0.4 → 0.15·0.25)을 줄여 실제로 미는 구간이 늘었다. 좁은 잔일수록
    // 크게 달라진다 — 예전엔 플루트에서 스월이 사실상 안 보였다.
    // **회전 속도와 섞어서 재지 말 것.** 속도는 화면에서 손놀림처럼 보이는가로 정하므로
    // 바뀔 수 있고, 그때마다 이 비교가 엉뚱하게 깨진다.
    for (const g of ["bordeaux", "flute"] as const) {
      const now = swirlOnce(g).peak;
      const old = swirlOnce(g, OLD_RAMP).peak;
      expect(now, `${g}: 지금 ${now.toFixed(3)} vs 옛 램프 ${old.toFixed(3)}`).toBeGreaterThan(
        old * 1.15
      );
    }
  });

  it("화면에서 손놀림처럼 보이는 속도 범위 안에 있다", () => {
    // 위로 올리면 수면은 더 커지지만 잔이 빠르게 떠는 것처럼 보인다(2.5Hz·2.07Hz 에서
    // 연달아 그런 이야기를 들었다). 아래로 내리면 공진에서 멀어져 액체가 안 밀린다.
    expect(AUTO_SWIRL_HZ).toBeGreaterThanOrEqual(1.5);
    expect(AUTO_SWIRL_HZ).toBeLessThanOrEqual(2.2);
  });

  it("느리게 잡아도 수면이 눈에 띄게 기운다 — 속도를 낮추다 스월을 죽이지 않게", () => {
    expect(swirlOnce("bordeaux").peak).toBeGreaterThan(0.13);
    expect(swirlOnce("flute").peak).toBeGreaterThan(0.08);
  });
});
