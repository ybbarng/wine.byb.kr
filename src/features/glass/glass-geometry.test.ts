import { describe, expect, it } from "vitest";
import {
  buildGlassShape,
  GLASS,
  GLASS_HEIGHT_M,
  GLASSES,
  realDimensions,
  wineLevels,
} from "./glass-geometry";

const byKey = (k: string) => {
  const d = GLASSES.find((g) => g.key === k);
  if (!d) throw new Error(`잔 없음: ${k}`);
  return d;
};

describe("buildGlassShape — 프로파일과 반경", () => {
  it("발+기둥 위에 볼을 stemLen 만큼 올려 붙인다", () => {
    const def = byKey("bordeaux");
    const s = buildGlassShape(def);
    // 림 높이 = 기둥 길이 + 볼 꼭대기
    const bowlTop = Math.max(...def.bowl.map((p) => p[1]));
    expect(s.gMaxY).toBeCloseTo(def.stemLen + bowlTop, 6);
    // 프로파일은 아래에서 위로 단조 증가해야 lathe 가 뒤집히지 않는다
    for (let i = 1; i < s.profile.length; i++) {
      expect(s.profile[i][1]).toBeGreaterThanOrEqual(s.profile[i - 1][1]);
    }
  });

  it("반경을 구간 선형 보간한다", () => {
    const s = buildGlassShape(byKey("bordeaux"));
    // 프로파일 점 위에서는 그 점의 반경 그대로.
    // 단 발 밑면은 y=0 에 점이 둘(중심·바깥 테두리)이라 같은 y 를 공유한다 → 건너뛴다.
    s.profile.forEach(([r, y], i) => {
      if (i > 0 && y === s.profile[i - 1][1]) return;
      expect(s.outerRadiusAt(y), `y=${y}`).toBeCloseTo(r, 6);
    });
    // 두 점 사이 중간은 두 반경 사이에 있다
    const [r0, y0] = s.profile[3];
    const [r1, y1] = s.profile[4];
    const mid = s.outerRadiusAt((y0 + y1) / 2);
    expect(mid).toBeGreaterThan(Math.min(r0, r1) - 1e-9);
    expect(mid).toBeLessThan(Math.max(r0, r1) + 1e-9);
  });

  it("범위 밖은 양 끝 값으로 물린다", () => {
    const s = buildGlassShape(byKey("white"));
    expect(s.outerRadiusAt(-10)).toBeCloseTo(s.profile[0][0], 6);
    expect(s.outerRadiusAt(999)).toBeCloseTo(s.profile[s.profile.length - 1][0], 6);
  });

  it("내벽 반경은 벽 두께만큼 작고 음수가 되지 않는다", () => {
    const def = byKey("bordeaux");
    const s = buildGlassShape(def);
    const y = def.stemLen + 0.5;
    expect(s.innerRadiusAt(y)).toBeCloseTo(s.outerRadiusAt(y) - def.wallThickness, 6);
    expect(s.innerRadiusAt(0)).toBeGreaterThanOrEqual(0); // 발 중심(반경 0 근처)
  });

  it("모든 잔이 유한한 값을 갖는다", () => {
    // 과거 바깥 사본이 존재하지 않는 필드(gdef.wineBottom)를 읽어 bowlBottomY 가
    // NaN 이었다. @ts-nocheck 때문에 컴파일러가 못 잡았다 — 여기서 막는다.
    for (const def of GLASSES) {
      const s = buildGlassShape(def);
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === "number") expect(Number.isFinite(v), `${def.key}.${k}`).toBe(true);
      }
    }
  });
});

describe("realDimensions — 실제 치수", () => {
  it("잔 높이 24cm 기준으로 수면 반경·깊이를 낸다", () => {
    const { surfR, liqH } = realDimensions(buildGlassShape(byKey("bordeaux")));
    // 보르도: 수면 반경 ≈ 2.9cm, 깊이 ≈ 5.0cm
    expect(surfR * 100).toBeCloseTo(2.9, 0);
    expect(liqH * 100).toBeCloseTo(5.0, 0);
  });

  it("넓은 볼(부르고뉴)이 좁은 잔(디저트)보다 수면이 넓다", () => {
    const burgundy = realDimensions(buildGlassShape(byKey("burgundy")));
    const dessert = realDimensions(buildGlassShape(byKey("dessert")));
    expect(burgundy.surfR).toBeGreaterThan(dessert.surfR);
  });

  it("sizeScale 이 작은 잔은 실제로도 작다", () => {
    const dessert = byKey("dessert");
    expect(dessert.sizeScale).toBeLessThan(1);
    const s = buildGlassShape(dessert);
    const { surfR } = realDimensions(s);
    // 24cm × sizeScale 이 이 잔의 실제 높이 → 수면 반경도 그만큼 줄어든다
    const mPerProfile = (GLASS_HEIGHT_M * dessert.sizeScale!) / s.gMaxY;
    expect(surfR).toBeCloseTo(s.innerRadiusAt(wineLevels(dessert).fill) * mPerProfile, 6);
  });

  it("모든 잔에서 수면 반경·깊이가 양수", () => {
    for (const def of GLASSES) {
      const { surfR, liqH } = realDimensions(buildGlassShape(def));
      expect(surfR, def.key).toBeGreaterThan(0);
      expect(liqH, def.key).toBeGreaterThan(0);
    }
  });
});

describe("GLASS — 이름과 인덱스", () => {
  it("GLASSES 배열의 순서와 일치한다", () => {
    // 어긋나면 "부르고뉴 잔"을 골랐는데 화이트 잔이 뜬다. 조용히 틀리는 종류라
    // 두 값을 같은 파일에 두고 여기서 묶어 둔다.
    for (const [key, idx] of Object.entries(GLASS)) {
      expect(GLASSES[idx]?.key, key).toBe(key);
    }
  });

  it("모든 잔이 이름을 갖는다", () => {
    expect(Object.keys(GLASS)).toHaveLength(GLASSES.length);
  });
});
