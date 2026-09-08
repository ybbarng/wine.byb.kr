import { describe, expect, it } from "vitest";
import {
  type ColumnTrig,
  flatWave,
  surfaceWaveHeight,
  W2SPD,
  W3SPD,
  WAMP1,
  type WavePhase,
} from "./surface-wave";

const trigAt = (theta: number): ColumnTrig => ({
  c: Math.cos(theta),
  s: Math.sin(theta),
  c2: Math.cos(2 * theta),
  s2: Math.sin(2 * theta),
  c3: Math.cos(3 * theta),
  s3: Math.sin(3 * theta),
});

/** 스월 방향 φ, 회전 로브는 t=0(위상이 φ 뿐)인 상태. 실제 코드의 위상 구성과 같다. */
const wave = (phi: number, act = 1): WavePhase => ({
  act,
  crC: Math.cos(phi),
  crS: Math.sin(phi),
  l2c: Math.cos(phi),
  l2s: Math.sin(phi),
  l3c: Math.cos(phi),
  l3s: Math.sin(phi),
});

describe("surfaceWaveHeight", () => {
  it("정지 상태면 완전한 평면", () => {
    const flat = flatWave();
    for (const th of [0, 1, 2, 3]) {
      for (const rp of [0, 0.5, 1]) expect(surfaceWaveHeight(flat, trigAt(th), rp)).toBe(0);
    }
  });

  it("중심(rp=0)은 움직이지 않는다 — 부피가 보존된다", () => {
    expect(surfaceWaveHeight(wave(0), trigAt(1.2), 0)).toBe(0);
  });

  it("스월 방향 벽에서 가장 높이 오른다", () => {
    // φ=0 이면 θ=0(그 방향 벽)이 마루, θ=π 가 골이다.
    const crest = surfaceWaveHeight(wave(0), trigAt(0), 1);
    const trough = surfaceWaveHeight(wave(0), trigAt(Math.PI), 1);
    expect(crest).toBeGreaterThan(0);
    expect(trough).toBeLessThan(0);
    expect(crest).toBeGreaterThan(Math.abs(trough)); // Stokes 2차 — 마루가 더 뾰족
  });

  it("벽 쪽이 중심보다 크게 움직인다(rp² 로 커진다)", () => {
    const p = wave(0);
    const half = Math.abs(surfaceWaveHeight(p, trigAt(0), 0.5));
    const wall = Math.abs(surfaceWaveHeight(p, trigAt(0), 1));
    expect(wall).toBeGreaterThan(half * 2);
  });

  it("활성도에 비례한다", () => {
    const full = surfaceWaveHeight(wave(0, 1), trigAt(0.7), 0.8);
    const half = surfaceWaveHeight(wave(0, 0.5), trigAt(0.7), 0.8);
    expect(half).toBeCloseTo(full / 2, 9);
  });

  it("스월 방향을 돌리면 마루도 따라 돈다", () => {
    // 2·3차 로브가 마루를 조금 끌어당기므로 마루가 정확히 φ 는 아니다(최대 0.7rad).
    // 그래서 "φ 에 얼마나 가까운가"가 아니라 **φ 를 따라가는가**를 본다 —
    // 마루가 원점(φ=0)보다 항상 φ 쪽에 가까워야 한다.
    const fold = (a: number) => Math.abs(((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const crestAngle = (phi: number) => {
      let best = Number.NEGATIVE_INFINITY;
      let bestTh = 0;
      for (let th = 0; th < 2 * Math.PI; th += 0.01) {
        const h = surfaceWaveHeight(wave(phi), trigAt(th), 1);
        if (h > best) {
          best = h;
          bestTh = th;
        }
      }
      return bestTh;
    };
    for (const phi of [0.8, 1.9, 3.4, 5.0]) {
      const th = crestAngle(phi);
      expect(fold(th - phi), `φ=${phi} 마루 ${th.toFixed(2)}`).toBeLessThan(fold(th - 0));
    }
    // 스월을 한 바퀴 돌리면 마루도 한 바퀴 돈다(단조 추종).
    expect(crestAngle(2.0)).toBeGreaterThan(crestAngle(1.0));
    expect(crestAngle(3.0)).toBeGreaterThan(crestAngle(2.0));
  });

  it("진폭이 잔 밖으로 튈 만큼 크지 않다", () => {
    // 파동은 기울기 위에 얹히므로 과하면 벽을 뚫는다. mode-1 진폭 근처로 묶인다.
    let max = 0;
    for (let th = 0; th < 6.3; th += 0.05) {
      max = Math.max(max, Math.abs(surfaceWaveHeight(wave(0.4), trigAt(th), 1)));
    }
    expect(max).toBeLessThan(WAMP1 * 2);
  });
});

describe("회전 로브 속도", () => {
  it("mode-3 무늬가 mode-2 보다 느리게 돈다", () => {
    // 무늬 각속도는 w/m 이라 차수가 높을수록 느리다. 옛 값(3.0·4.2)은 역전돼 있었다.
    expect(W3SPD / 3).toBeLessThan(W2SPD / 2);
  });

  it("각진동수라서 무늬 속도보다 크다", () => {
    expect(W2SPD).toBeGreaterThan(10); // 베셀 근(3.05)을 그대로 쓰던 옛 값과 구분
    expect(W3SPD).toBeGreaterThan(10);
  });
});
