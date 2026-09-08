// 와인잔 형상 — 잔 정의, 프로파일(외곽 반경 곡선), 반경 보간, 슬로싱 상수 유도.
//
// three.js 를 쓰지 않는 순수 계산이라 FluidLab.tsx(`@ts-nocheck`) 밖에 둔다.
// 그 파일은 three/tsl 타입이 불완전해 파일 단위로 타입체크를 껐는데, 그러다 보니
// 존재하지 않는 필드(`gdef.wineBottom`)를 읽어 NaN 이 되는 것도 못 잡고 있었다.
// 여기로 옮기면 컴파일러가 지켜 주고 테스트도 붙는다.

/** 잔 한 종류의 정의. 발·기둥은 공통 생성, 볼(bowl)만 형태별 곡선. */
export type GlassDef = {
  key: string;
  label: string;
  desc: string;
  footR: number; // 발 반경
  stemLen: number; // 기둥 길이(=볼 바닥 높이)
  bowl: [number, number][]; // 볼 곡선(바닥=0 상대높이 → 림)
  wallThickness: number;
  fillLevel: number; // 수면(볼 바닥 기준 상대높이)
  sizeScale?: number; // 화면 크기 배율(1=표준 높이, <1=작은 잔). 기본 1.
};

/**
 * 발(foot)+기둥(stem)을 잔별 값으로 생성. footR=발 반경(큰 볼일수록 넓게),
 * stemLen=기둥 위 끝 높이(=볼 바닥 y). 볼은 이 위에 상대높이로 얹는다.
 */
export function footStem(footR: number, stemLen: number): [number, number][] {
  return [
    [0.0, 0.0],
    [footR, 0.0],
    [footR, 0.018],
    [footR * 0.76, 0.04],
    [0.12, 0.09],
    [0.05, 0.16],
    [0.042, 0.7],
    [0.042, stemLen],
  ];
}

/** 대표 와인잔 형태. 나중에 와인 종류 → 어울리는 잔 매핑에 이 인덱스를 쓴다. */
export const GLASSES: GlassDef[] = [
  {
    key: "universal",
    label: "표준",
    desc: "만능형",
    footR: 0.55,
    stemLen: 1.3,
    bowl: [
      [0.05, 0.0],
      [0.1, 0.08],
      [0.17, 0.17],
      [0.26, 0.29],
      [0.34, 0.43],
      [0.4, 0.58],
      [0.44, 0.74],
      [0.46, 0.9],
      [0.455, 1.06],
      [0.43, 1.21],
      [0.4, 1.34],
      [0.36, 1.46],
      [0.325, 1.56],
    ],
    wallThickness: 0.025,
    fillLevel: 0.62,
  },
  {
    key: "bordeaux",
    label: "보르도",
    desc: "풀바디 레드 (카베르네·메를로)",
    footR: 0.6, // 큰 볼 → 넓은 발
    stemLen: 1.45, // 긴 기둥(우아)
    bowl: [
      [0.05, 0.0],
      [0.1, 0.09],
      [0.18, 0.22],
      [0.28, 0.4],
      [0.37, 0.61],
      [0.43, 0.84],
      [0.46, 1.08],
      [0.455, 1.32],
      [0.43, 1.52],
      [0.39, 1.68],
      [0.34, 1.79],
    ],
    wallThickness: 0.025,
    fillLevel: 0.68,
  },
  {
    key: "burgundy",
    label: "부르고뉴",
    desc: "피노 누아 (넓은 볼)",
    footR: 0.64, // 가장 큰 볼 → 가장 넓은 발
    stemLen: 1.25,
    bowl: [
      [0.06, 0.0],
      [0.15, 0.1],
      [0.29, 0.24],
      [0.43, 0.42],
      [0.53, 0.61],
      [0.57, 0.8],
      [0.55, 0.98],
      [0.49, 1.16],
      [0.41, 1.3],
      [0.36, 1.39],
    ],
    wallThickness: 0.025,
    fillLevel: 0.56,
  },
  {
    key: "white",
    label: "화이트",
    desc: "샤르도네·소비뇽 블랑",
    footR: 0.5, // 작은 볼 → 좁은 발
    stemLen: 1.35,
    bowl: [
      [0.045, 0.0],
      [0.085, 0.1],
      [0.15, 0.23],
      [0.23, 0.39],
      [0.3, 0.56],
      [0.345, 0.73],
      [0.355, 0.9],
      [0.34, 1.06],
      [0.31, 1.17],
      [0.295, 1.23],
    ],
    wallThickness: 0.023,
    fillLevel: 0.58,
  },
  {
    key: "flute",
    label: "플루트",
    desc: "샴페인·스파클링 (튤립형)",
    footR: 0.46, // 좁은 발
    stemLen: 1.55, // 길고 슬림한 기둥
    bowl: [
      [0.045, 0.0],
      [0.085, 0.15],
      [0.14, 0.37],
      [0.19, 0.63],
      [0.225, 0.91],
      [0.235, 1.17],
      [0.225, 1.39],
      [0.205, 1.55],
      [0.2, 1.63],
    ],
    wallThickness: 0.02,
    fillLevel: 1.15,
  },
  {
    key: "dessert",
    label: "디저트",
    desc: "아이스와인·포트 (작은 잔, 소량)",
    footR: 0.44, // 작은 발
    stemLen: 0.92, // 짧은 기둥 — 오밀조밀한 작은 잔(미니 플루트 아님)
    bowl: [
      [0.04, 0.0],
      [0.08, 0.1],
      [0.14, 0.25],
      [0.19, 0.42],
      [0.215, 0.6],
      [0.22, 0.77],
      [0.205, 0.93],
      [0.185, 1.05],
      [0.18, 1.12],
    ],
    wallThickness: 0.018,
    fillLevel: 0.34, // 소량(디저트 와인)
    sizeScale: 0.74, // 실제로 작은 잔 → 화면에서도 작게
  },
];

/** 실제 와인잔 총 높이(m). 모든 잔을 이 높이 기준으로 실제 치수를 잡는다. */
export const GLASS_HEIGHT_M = 0.24;

/** 화면에서 모든 잔을 같은 높이로 맞추는 기준(표준 프로파일 2.92 × world 0.42). */
const SCREEN_REF = 0.42 * 2.92;

/** 잔 형상 — 프로파일과 거기서 파생된 값들. */
export interface GlassShape {
  def: GlassDef;
  profile: [number, number][];
  gMaxY: number; // 림 높이(프로파일 단위)
  wallThickness: number;
  bowlBottomY: number;
  bowlTopY: number;
  worldScale: number;
  worldY: number;
  /** 프로파일 y 에서의 외곽 반경(구간 선형 보간). */
  outerRadiusAt: (py: number) => number;
  /** 벽 두께를 뺀 내벽 반경. 와인이 닿는 면이다. */
  innerRadiusAt: (py: number) => number;
}

const WORLD_Y = -0.06;

/** 잔 정의로 프로파일과 반경 함수를 만든다. */
export function buildGlassShape(def: GlassDef): GlassShape {
  const profile: [number, number][] = [
    ...footStem(def.footR, def.stemLen),
    ...def.bowl.map(([r, y]) => [r, y + def.stemLen] as [number, number]),
  ];
  const gMaxY = Math.max(...profile.map((p) => p[1]));
  const outerRadiusAt = (py: number): number => {
    if (py <= profile[0][1]) return profile[0][0];
    for (let i = 1; i < profile.length; i++) {
      if (py <= profile[i][1]) {
        const [r0, y0] = profile[i - 1];
        const [r1, y1] = profile[i];
        const t = (py - y0) / (y1 - y0 || 1);
        return r0 + (r1 - r0) * t;
      }
    }
    return profile[profile.length - 1][0];
  };
  return {
    def,
    profile,
    gMaxY,
    wallThickness: def.wallThickness,
    // 볼 바닥은 기둥 끝. 살짝 아래로 내려 잡아 경계를 여유 있게 둔다.
    bowlBottomY: def.stemLen - 0.05,
    bowlTopY: gMaxY,
    worldScale: (SCREEN_REF / gMaxY) * (def.sizeScale ?? 1),
    worldY: WORLD_Y,
    outerRadiusAt,
    innerRadiusAt: (py: number) => Math.max(outerRadiusAt(py) - def.wallThickness, 0),
  };
}

/** 와인 바닥·수면의 프로파일 y. */
export function wineLevels(def: GlassDef): { bottom: number; fill: number } {
  return { bottom: def.stemLen, fill: def.stemLen + def.fillLevel };
}

/** 이 잔의 실제 치수(미터). 슬로싱 물리는 여기서 나온다. */
export function realDimensions(shape: GlassShape): { surfR: number; liqH: number } {
  const { def, gMaxY, innerRadiusAt } = shape;
  const mPerProfile = (GLASS_HEIGHT_M * (def.sizeScale ?? 1)) / gMaxY;
  const { fill } = wineLevels(def);
  return {
    surfR: Math.max(innerRadiusAt(fill) * mPerProfile, 1e-3), // 수면 반경(m)
    liqH: Math.max(def.fillLevel * mPerProfile, 1e-3), // 액체 깊이(m)
  };
}
