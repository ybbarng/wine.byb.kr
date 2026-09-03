// @ts-nocheck — three/tsl·WebGPU 노드 API 는 타입 정의가 불완전하다(Loop({...}),
// toConst/add, WebGPURenderer.localClippingEnabled 등 런타임엔 동작하나 타입 없음).
// 실험적 3D 렌더 파일이라 파일 단위로 타입체크를 끈다(런타임은 dev 로 검증).
"use client";

import { useEffect, useRef } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { UltraHDRLoader } from "three/examples/jsm/loaders/UltraHDRLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  atan,
  atomicAdd,
  atomicLoad,
  atomicStore,
  attribute,
  clamp,
  cos,
  cross,
  dFdx,
  dFdy,
  exp,
  Fn,
  float,
  frontFacing,
  If,
  instancedArray,
  instanceIndex,
  int,
  ivec3,
  Loop,
  mix,
  mx_fractal_noise_float,
  normalize,
  normalView,
  normalWorld,
  positionLocal,
  positionView,
  pow,
  screenUV,
  sin,
  smoothstep,
  struct,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import * as THREE from "three/webgpu";

// 최소자승 다항식 피팅 — 볼 내벽 반경 곡선을 계수로 압축(잔 경계용).
function polyfit(xs: number[], ys: number[], deg: number): number[] {
  const n = deg + 1;
  const A: number[][] = [];
  const b: number[] = [];
  for (let j = 0; j < n; j++) {
    const row = new Array(n).fill(0);
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let i = 0; i < xs.length; i++) s += xs[i] ** (j + k);
      row[k] = s;
    }
    A.push(row);
    let sb = 0;
    for (let i = 0; i < xs.length; i++) sb += ys[i] * xs[i] ** j;
    b.push(sb);
  }
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    }
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < n; r++) {
      if (r !== c) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

// ── 대표 와인잔 형태 ── 각 잔은 프로파일(외곽 반경 곡선, 아래→위)·벽두께·와인
// 채움 높이(바닥/수면, 프로파일 y)를 갖는다. 발+기둥은 공통, 볼(bowl)만 형태별.
// worldScale 은 setup 에서 프로파일 높이로 자동 계산해 모두 같은 화면 높이로 맞춘다.
// 나중에 와인 선택 → 어울리는 잔 자동 표시에 이 인덱스를 매핑한다.
// 발(foot)+기둥(stem) 을 잔별 값으로 생성. footR=발 반경(큰 볼일수록 넓게),
// stemLen=기둥 위 끝 높이(=볼 바닥 y, 기둥 길이). 볼은 이 위에 상대높이로 얹는다.
function footStem(footR: number, stemLen: number): [number, number][] {
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
type GlassDef = {
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
const GLASSES: GlassDef[] = [
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

// Position Based Fluids (Macklin & Müller 2013) 을 three/tsl 로 재구현.
// 비압축(밀도 제약) + 해시 그리드 이웃 + 잔 SDF 경계.
// biome-ignore lint: PBF 구조
export default function FluidLab({
  wineAbsorb,
  glassType,
  bgColor,
  swirlScale,
  bgIntensity,
  slideX,
  onReady,
}: {
  glassType?: number;
  wineAbsorb?: [number, number, number];
  bgColor?: string; // 지정 시 배경을 이 단색으로(사이트 배경과 매끄럽게). 미지정=따뜻한 HDR.
  swirlScale?: number; // 최대 스월 기울기 배율(기본 1). 좁은 컨테이너(홈)에선 <1 로 줄여 영역 이탈 방지.
  bgIntensity?: number; // 배경(HDR) 밝기 배율(기본 1). 좁은 프레임이 어두운 영역을 비출 때 ↑.
  // 잔을 캔버스 안에서 x축(world)으로 옮긴다. 0=중앙. 컨베이어 슬라이드 검증용.
  // y(높이)·회전(스월)은 건드리지 않으므로 위아래 흔들림이 생기지 않는다.
  slideX?: number;
  // 두 잔 검증용 imperative 핸들(선택). 안 주면 지금처럼 잔 1개로만 동작한다.
  onReady?: (api: {
    addGlass: (
      glassType: number,
      absorb?: [number, number, number],
      fromDir?: "left" | "right"
    ) => void;
    slideOut: (dir: "left" | "right") => void;
    getCount: () => number;
  }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 와인 흡수계수 uniform(실시간 색 변경). setup 에서 채워지고 prop 으로 갱신.
  // biome-ignore lint/suspicious/noExplicitAny: TSL uniform
  const absorbURef = useRef<any>(null);

  // 와인 프리셋 버튼 → 흡수계수 갱신(실시간).
  useEffect(() => {
    if (absorbURef.current && wineAbsorb) {
      absorbURef.current.value.set(wineAbsorb[0], wineAbsorb[1], wineAbsorb[2]);
    }
  }, [wineAbsorb]);

  // 스월 기울기 배율 — 컨테이너 폭에 따라 실시간으로 바뀔 수 있어 ref 로 읽는다
  // (반응형: 좁은 데스크톱 3분할 칸은 작게, 풀폭 모바일/홈은 크게).
  const swirlRef = useRef(swirlScale ?? 1);
  useEffect(() => {
    swirlRef.current = swirlScale ?? 1;
  }, [swirlScale]);

  // 슬라이드 x 위치 — 매 프레임 render 가 glassGroup.position.x 에 반영(리렌더/재초기화 없음).
  const slideXRef = useRef(slideX ?? 0);
  useEffect(() => {
    slideXRef.current = slideX ?? 0;
  }, [slideX]);

  // 색(wineAbsorb)은 위 별도 effect 로 실시간 반영 — 여기(씬 셋업)는 glassType 변경 시에만 재빌드.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 색은 별도 effect로 실시간 반영, glassType 변경 시에만 재빌드
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    // biome-ignore lint/suspicious/noExplicitAny: TSL/webgpu
    const A = THREE as any;

    // 와인 흡수계수 uniform 은 이제 각 잔이 자기 것을 갖는다(buildGlass 에서 생성).
    // 실시간 색 변경(wineAbsorb 프리셋)은 첫 잔의 uniform 을 absorbURef 로 잡아 갱신한다.

    let renderer: THREE.WebGPURenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let ro: ResizeObserver | undefined; // 컨테이너 크기 관찰
    // 배경 두 겹: warmBg=와인 투과(bgRT) 샘플용 따뜻한 HDR(와인이 빛남),
    // pageBg=화면에 보이는 배경(사이트 색과 매칭). bgColor 없으면 둘 다 따뜻한 HDR.
    let warmBg: unknown;
    let pageBg: unknown;
    let controls: OrbitControls;
    let disposed = false;
    let frameCount = 0;
    // 한 캔버스 안의 잔들. 초기 1개, addGlass 로 두 번째 잔을 넣어 각자 독립 스월·슬라이드.
    // biome-ignore lint/suspicious/noExplicitAny: GlassRuntime 은 아래에서 선언
    const glasses: any[] = [];

    const timer = new THREE.Timer();
    timer.connect(document);

    // 표면·부피 기반으로 전환(docs/wine-experience-goals.md). 입자 유체는 끔.
    const FLUID_ON = false;
    const SIMULATE = false; // 입자 물리 미사용
    void SIMULATE;
    const N_TARGET = 12000; // 목표 입자 수(전체 채움 검증) — 실제 N 은 채움 후 확정
    const WINE_FILL_TOP = 0.72; // (구) 정적 와인 메쉬용 — FLUID_ON 이면 미사용

    // PBF 이산화(H·격자·rest density·완화)는 아래 병 규격 뒤에서 채움 간격 d
    // 로부터 유도한다(자기일관). d 와 무관한 상수만 뒤에 따로 둔다.

    // ── 물리 도메인: world 정렬. 잔(x=0)·병(x=0.42)·따르는 공간을 담는다. ──
    // coord(0..1, 0..YMAX, 0..1) → world = DOMAIN_MIN + coord·DOMAIN_SCALE (등방).
    // 병이 -x(잔) 쪽으로 기울며 쏟아진다. z 는 0 중심.
    const DOMAIN_SCALE = 1.4; // coord 1.0 = 1.4 world (기울인 병 arc 담을 폭)
    const DOMAIN_MIN = [-0.6, -0.12, -0.7]; // coord 원점의 world 좌표
    const YMAX = 1.3; // coord y 상단 (world y ≈ 1.7 까지)
    const w2c = (wx: number, wy: number, wz: number): [number, number, number] => [
      (wx - DOMAIN_MIN[0]) / DOMAIN_SCALE,
      (wy - DOMAIN_MIN[1]) / DOMAIN_SCALE,
      (wz - DOMAIN_MIN[2]) / DOMAIN_SCALE,
    ];

    // ── 세워진 와인병 (물리 SDF) — 보이는 병(setupBottle)과 같은 자리·규격. ──
    // 병 축은 수직. world (0.42, -0.06, 0) 에 서 있다. m = 미터→world(≈5.11).
    const BOTTLE_M = (2.92 * 0.42) / 0.24; // setupBottle 의 m 과 동일
    const _bAxis = w2c(0.42, -0.06, 0.0); // 병 바닥 중심의 coord
    const BOTTLE_AXIS = [_bAxis[0], _bAxis[2]]; // 병 축 coord x,z
    const BOTTLE_BOTTOM = _bAxis[1]; // 병 바닥 coord y
    // 보이는 병(setupBottle) 프로파일과 동일: 몸통(Rb) → 짧은 어깨(smootherstep,
    // yBody→yNeck) → 곧은 목(Rn) → 입구. 내반경 = 외반경 − 벽두께(0.003m).
    const BODY_R = ((0.0368 - 0.003) * BOTTLE_M) / DOMAIN_SCALE; // 몸통 내반경
    const NECK_R = ((0.01475 - 0.003) * BOTTLE_M) / DOMAIN_SCALE; // 목 내반경
    const BODY_TOP = (0.184 * BOTTLE_M) / DOMAIN_SCALE; // 어깨 시작(yBody)
    const SHOULDER_TOP = (0.216 * BOTTLE_M) / DOMAIN_SCALE; // 어깨 끝=목 시작(yNeck)
    const NECK_TOP = (0.3 * BOTTLE_M) / DOMAIN_SCALE; // 병 끝(입구, H)
    // 기울기 피벗(coord): 병 축, 몸통 중간 높이(손으로 잡는 지점)
    const PIVOT = [BOTTLE_AXIS[0], BOTTLE_BOTTOM + BODY_TOP * 0.6, BOTTLE_AXIS[1]];

    // ── 자기일관 SPH 이산화 — 채움 간격 d 를 정하면 H·격자·rest density·완화를
    // 모두 그로부터 유도한다. 잔에서 검증된 안정 영역(H/d≈1.8, EPS∝1/H²)을
    // 입자 수와 무관하게 유지 → 어떤 N 에서도 같은 물리, 지터 없이 정지에 도달.
    // 병 내부 반경(바닥 기준 높이 h) — shader 의 rAt 과 동일식(채움·검증 공용).
    // 몸통(BODY_R) → 어깨(smootherstep, BODY_TOP→SHOULDER_TOP) → 곧은 목(NECK_R).
    const radiusAtJS = (hh: number): number => {
      if (hh <= BODY_TOP) return BODY_R;
      if (hh >= SHOULDER_TOP) return NECK_R;
      const t = (hh - BODY_TOP) / (SHOULDER_TOP - BODY_TOP);
      const s = t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
      return BODY_R + (NECK_R - BODY_R) * s;
    };
    // 전체 내부 부피(원판 적분)에서 목표 입자 수 → 격자 간격 d 산출(자기일관).
    let volFull = 0;
    {
      const S = 240;
      for (let i = 0; i < S; i++) {
        const hh = ((i + 0.5) / S) * NECK_TOP;
        volFull += Math.PI * radiusAtJS(hh) ** 2 * (NECK_TOP / S);
      }
    }
    const d = Math.cbrt(volFull / N_TARGET); // 격자 간격
    const WALL = (0.003 * BOTTLE_M) / DOMAIN_SCALE; // 병유리 두께(coord)
    // 렌더 입자 반경 — 벽 두께보다 작게 캡 → 벽까지 채워도 표면이 바깥벽을 안 넘음.
    const PARTICLE_R = Math.min(d, WALL * 0.9);
    const H = 1.8 * d; // 커널 반경 = 간격의 1.8배 (안정 이웃 수 ~ 잔과 동일)
    const H2 = H * H;
    const GRID_RES = Math.ceil(1 / H); // 해시 그리드 해상도 (x,z: [0,1])
    const GRID_RES_Y = Math.ceil(YMAX * GRID_RES); // y축 셀 수
    const CELL_COUNT = GRID_RES * GRID_RES_Y * GRID_RES;
    const MAX_PER_CELL = 24; // H/d≈1.8 → 셀당 ~6, 24 면 여유
    const POLY6 = 315 / (64 * Math.PI * H ** 9); // 밀도 커널 계수
    const SPIKY = 45 / (Math.PI * H ** 6); // 그래디언트 커널 계수
    const SOLVER_ITER = 4; // 비압축 강화(점프·표면진동 완화)
    // rest density = 채운 격자에서의 밀도(수치합) — 이 밀도에서 압력 0(정지).
    const restDensityFor = (dd: number): number => {
      let s = 0;
      const R = Math.ceil(H / dd);
      for (let i = -R; i <= R; i++)
        for (let j = -R; j <= R; j++)
          for (let k = -R; k <= R; k++) {
            const r2 = (i * i + j * j + k * k) * dd * dd;
            if (r2 < H2) {
              const e = H2 - r2;
              s += POLY6 * e * e * e;
            }
          }
      return s;
    };
    const restDensityValue = restDensityFor(d);
    // λ 완화(CFM): 잔 세트(H=0.045, EPS=500)에서 Σ|∇C|²∝1/H² 이므로 1/H² 로 스케일.
    const EPS_RELAX = 500.0 * (0.045 / H) ** 2;
    // ── 채움: 병 내부를 SDF 형상 따라 벽(radiusAt)까지 가득. 벽까지 채워야 퍼져
    // 내려앉지 않고 입구까지 차오른다. 입구(NECK_TOP) 살짝 위까지 채워 한두 개
    // 넘치게(정합 확인). 렌더 반경이 벽보다 작아 바깥벽은 안 넘는다. ──
    const wineFill: number[][] = [];
    {
      const topH = NECK_TOP + d; // 입구 살짝 위 → 넘침 1~2개
      for (let iy = 0; ; iy++) {
        const h = d * 0.5 + iy * d; // 바닥 기준 높이
        if (h > topH) break;
        // 렌더 표면(+PARTICLE_R)이 정확히 내벽에 걸리도록 그만큼 안쪽에 채움
        // → 초록 유리 두께가 둘러 보임(중력 꺼진 검증이라 침강 없음).
        const rMax = Math.max(radiusAtJS(Math.min(h, NECK_TOP)) - PARTICLE_R, 0);
        const nx = Math.ceil(rMax / d);
        const y = BOTTLE_BOTTOM + h;
        for (let ix = -nx; ix <= nx; ix++)
          for (let iz = -nx; iz <= nx; iz++) {
            if (Math.hypot(ix * d, iz * d) <= rMax)
              wineFill.push([BOTTLE_AXIS[0] + ix * d, y, BOTTLE_AXIS[1] + iz * d]);
          }
      }
    }
    const N = wineFill.length; // 실제 입자 수(채운 결과)
    const C_XSPH = 0.2; // XSPH 점성 (낮춰 생동감 복원 — 튐·흐름 살림)
    // 표면장력(s_corr): 표면 입자를 응집시켜 요동 억제 + 벽 코팅.
    const SCORR_K = 0.00001; // 표면장력 (원래 3e-5 → 순환 완화·응집 유지 절충)
    const DELTA_Q2 = (0.2 * H) ** 2; // (0.2·H)² 기준 거리²
    const POLY6_DQ = POLY6 * (H2 - DELTA_Q2) ** 3; // poly6(ΔQ²)
    // GRAVITY 는 실제 g를 좌표 공간으로 매핑해야 하므로 잔 스케일이 정해진 뒤
    // (cubeSpanProfile 계산 후) 아래에서 유도한다.

    // ── 잔 데이터 + 경계 SDF (MLS-MPM 에서 재활용) ────────────────────
    // 선택된 잔(glassType)으로 프로파일·채움을 구성. 발+기둥 공통 + 볼 형태별.
    const gdef = GLASSES[Math.min(Math.max(glassType ?? 0, 0), GLASSES.length - 1)];
    // 발+기둥(잔별 footR·stemLen) 위에 볼(상대높이)을 stemLen 만큼 올려 붙인다.
    const gProfile = [
      ...footStem(gdef.footR, gdef.stemLen),
      ...gdef.bowl.map(([r, y]) => [r, y + gdef.stemLen] as [number, number]),
    ];
    const gMaxY = Math.max(...gProfile.map((p) => p[1])); // 림 높이(프로파일)
    const glass = {
      profile: gProfile,
      wallThickness: gdef.wallThickness,
      bowlBottomY: gdef.wineBottom - 0.05,
      bowlTopY: gMaxY,
      // 모든 잔을 같은 화면 높이로: 기준(표준 2.92 × 0.42)을 프로파일 높이로 나눔.
      // sizeScale 로 작은 잔(디저트)은 실제로 작게 보이게.
      worldScale: ((0.42 * 2.92) / gMaxY) * (gdef.sizeScale ?? 1),
      worldY: -0.06,
    };
    const outerRadiusAt = (py: number): number => {
      const p = glass.profile;
      if (py <= p[0][1]) return p[0][0];
      for (let i = 1; i < p.length; i++) {
        if (py <= p[i][1]) {
          const [r0, y0] = p[i - 1];
          const [r1, y1] = p[i];
          const t = (py - y0) / (y1 - y0 || 1);
          return r0 + (r1 - r0) * t;
        }
      }
      return p[p.length - 1][0];
    };
    const innerRadiusAt = (py: number): number =>
      Math.max(outerRadiusAt(py) - glass.wallThickness, 0);

    // ── 한 "잔"의 가변 상태·상수·메쉬를 하나로 묶은 런타임 객체 ──────────────
    // 배열화(두 잔 컨베이어)를 위해, 잔마다 달라지는 상태·상수·메쉬·유니폼을 한
    // 객체(GlassRuntime)로 모은다. buildGlass 팩토리가 호출할 때마다 독립된 객체를
    // 새로 만들어 반환한다. 아래 초기 gdef/glass/innerRadiusAt/GLASS_WINE_* 는
    // 이제 (FLUID_ON 시의) 물리 도메인 상수 유도에만 쓰는 "대표 잔" 값이다.
    // biome-ignore lint/suspicious/noExplicitAny: TSL/three 노드·메쉬·유니폼 타입 불완전
    type GlassRuntime = { [k: string]: any };
    // 잔 파생 와인 채움 상수(GLASS_WINE_BOTTOM/FILL)는 이제 buildGlass 안에서
    // 잔별로 계산한다. 아래 대표 gdef/glass 는 (FLUID_ON) 물리 도메인 유도 전용.

    let bowlRmax = 0;
    for (let py = glass.bowlBottomY; py <= glass.bowlTopY; py += 0.01) {
      bowlRmax = Math.max(bowlRmax, innerRadiusAt(py));
    }
    const cubeSpanProfile = Math.max(glass.bowlTopY - glass.bowlBottomY, bowlRmax * 2);
    const FLUID_SCALE = DOMAIN_SCALE; // 물리 coord → world 등방 배율
    const FLUID_Y = DOMAIN_MIN[1]; // coord y=0 의 world y
    void cubeSpanProfile; // (구 잔 중심 매핑 값 — 현재 미사용)

    // ── 중력: 실제 물리값에서 유도 (겉은 실제, 시간 축만 연출값) ──────────
    // g·잔 크기는 실제값으로 두고, g_sim = g_real·T²/L 로 sim 단위로 변환한다.
    // 셋 다(중력·크기·시간)를 동시에 실시간 실제값으로 하면 매우 빠른 동역학이
    // 돼 substep이 √g 규칙으로 16까지 필요해 무겁다. 그래서 눈에 안 보이는
    // 시간 축(TIME_SCALE)만 연출값으로 잡아, 기존의 좋던 낙하감(substep 2,
    // 가벼운 계산)을 그대로 유지한다. 아무도 담기는 시간을 재지 않으므로 문제없음.
    const GLASS_HEIGHT_M = 0.24; // 실제 와인잔 총 높이 ~24cm (리델 21~27.5cm 중간)
    const G_REAL = 9.81; // 실제 중력 m/s²
    const profileMaxY = Math.max(...glass.profile.map((p) => p[1])); // 림(2.92)
    const metersPerProfile = GLASS_HEIGHT_M / profileMaxY;
    // 1 coord = DOMAIN_SCALE world, 1 world = (metersPerProfile/worldScale) m.
    const metersPerCoord = DOMAIN_SCALE * (metersPerProfile / glass.worldScale);
    // 시간 배율 T: 1 sim-초 = 실제 T 초. 기존 좋던 g_sim≈1.5 가 나오도록 맞춤.
    const TIME_SCALE = 0.34; // 슬로모션 9배→3배 (물성 크리스프하게, substep↑ 비용)
    // g_sim = g_real · T² / L  (실제 g를 sim 좌표·시간 단위로 변환)
    const GRAVITY = -(G_REAL * TIME_SCALE * TIME_SCALE) / metersPerCoord;

    const POLY_DEG = 5;
    const lutXs: number[] = [];
    const lutYs: number[] = [];
    for (let i = 0; i < 64; i++) {
      const coordY = i / 63;
      const worldY = FLUID_Y + coordY * FLUID_SCALE;
      const py = (worldY - glass.worldY) / glass.worldScale;
      let coordR = 0.002;
      if (py >= glass.bowlBottomY && py <= glass.bowlTopY) {
        coordR = (innerRadiusAt(py) * glass.worldScale) / FLUID_SCALE;
      }
      lutXs.push(coordY);
      lutYs.push(Math.max(coordR, 0.002));
    }
    const bowlCoef = polyfit(lutXs, lutYs, POLY_DEG);
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    const bowlCoefU: any[] = bowlCoef.map((v) => uniform(v));
    const bowlRadiusAtCoordY = (cy: number): number => {
      let a = bowlCoef[POLY_DEG];
      for (let k = POLY_DEG - 1; k >= 0; k--) a = a * cy + bowlCoef[k];
      return Math.max(a, 0.002);
    };

    // ── 버퍼/유니폼/커널 핸들 ─────────────────────────────────────────
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let dtUniform: any, restDensityUniform: any, viscUniform: any, gravUniform: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL — 따르기(pour): 활성 입자 수
    let pourCountUniform: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL — 병 기울기 각(라디안)
    let tiltUniform: any;
    let bottleGroup: THREE.Group; // 보이는 병 — 피벗 둘레로 기울이는 그룹
    let bottleSpout: THREE.Object3D; // 병 입구(주둥이) 마커 — 붓기 스트림 시작점
    let bottlePivotWorld: THREE.Vector3; // 병 피벗 world(서 있는 위치)
    let streamMesh: THREE.Mesh; // 붓기 물줄기(스포우트→잔)
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let particleBuffer: any,
      lambdaBuffer: any,
      densityBuffer: any,
      cellCountBuffer: any,
      cellIdsBuffer: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let clearCellKernel: any,
      predictKernel: any,
      buildGridKernel: any,
      lambdaKernel: any,
      deltaPKernel: any,
      velocityKernel: any;
    let particleMesh: THREE.Mesh;
    // 잔(직접 굴절용 — render에서 숨겼다 그림)은 이제 glass1.glassMesh 에 담긴다.
    let fluidScene: THREE.Scene;
    // biome-ignore lint/suspicious/noExplicitAny: TSL RenderTarget/QuadMesh
    let depthRT: any, sceneRT: any; // sceneRT: 잔 뺀 장면(굴절 샘플용)
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let blurRT: any, blurRT2: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL — 여러 번 반복 평활화용 ping-pong
    let blurFromDepth: any, blurPing: any, blurPong: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let surfaceQuad: any;

    const STRIDE = 12; // vec3 position, velocity, predicted (각 16바이트 정렬 → 4 float)

    function setupBuffers() {
      const pStruct = struct({
        position: { type: "vec3" },
        velocity: { type: "vec3" },
        predicted: { type: "vec3" },
      });
      const arr = new Float32Array(N * STRIDE);
      // 세워진 병 안에 정적으로 배치(위에서 만든 wineFill 격자 그대로).
      for (let i = 0; i < N; i++) {
        arr[i * STRIDE] = wineFill[i][0];
        arr[i * STRIDE + 1] = wineFill[i][1];
        arr[i * STRIDE + 2] = wineFill[i][2];
      }
      particleBuffer = instancedArray(arr, pStruct);
      particleBuffer.setPBO(true);
      lambdaBuffer = instancedArray(N, "float");
      densityBuffer = instancedArray(N, "float");
      densityBuffer.setPBO(true);

      // 해시 그리드: 셀당 입자 카운트(atomic) + 입자 인덱스 버킷
      const cellStruct = struct({ count: { type: "int", atomic: true } });
      cellCountBuffer = instancedArray(CELL_COUNT, cellStruct);
      cellIdsBuffer = instancedArray(CELL_COUNT * MAX_PER_CELL, "int");
    }

    function setupUniforms() {
      dtUniform = uniform(1 / 60);
      restDensityUniform = uniform(restDensityValue); // 채운 격자 밀도(정지)
      tiltUniform = uniform(0); // 병 기울기 각(라디안) — render 에서 애니메이션
      // 점성(substep당 속도 유지율). 실제 유체의 점성 소산 — 출렁임(슬로싱)이
      // 잦아들게 한다. 0.99는 약해서 낙하 종단속도(1.25)가 관측 낙하(0.44)보다
      // 훨씬 높아 낙하를 안 늦춘다(과거 0.9는 종단 0.125로 낙하를 깎았음).
      viscUniform = uniform(0.99); // 잔에서 검증된 약한 점성(정지는 EPS_RELAX가)
      gravUniform = uniform(GRAVITY);
      pourCountUniform = uniform(0, "int"); // 따르기: 활성 입자 수(render에서 증가)
    }

    function setupComputeShaders() {
      // 경계: 잔(y<1, 볼 SDF) + 병(y>BOTTLE_BOT, 원통+바닥구멍) + 사이 공기(자유).
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const clampToBoundary = (p: any) => {
        const result = p.toVar();
        // ── 세운 병(틸트) 경계 — 피벗 둘레 z축 회전으로 로컬 프레임에서 판정 ──
        // 로컬: 병 축은 y, 반경 = √(lx²+lz²), h = 바닥으로부터 높이.
        const th = tiltUniform.toVar();
        const c = cos(th).toVar();
        const s = sin(th).toVar();
        const d = p.sub(vec3(PIVOT[0], PIVOT[1], PIVOT[2])).toVar();
        // local = R(-θ)·d (x-y 평면 회전)
        const lx = d.x.mul(c).add(d.y.mul(s)).toVar();
        const ly = d.x.mul(s).negate().add(d.y.mul(c)).toVar();
        const lz = d.z.toVar();
        const rad = lx.mul(lx).add(lz.mul(lz)).sqrt().max(1e-5).toVar();
        const bottomLocalY = float(BOTTLE_BOTTOM - PIVOT[1]);
        const h = ly.sub(bottomLocalY).toVar(); // 0=바닥, NECK_TOP=입구
        // 반경 판정용 높이(바닥 아래/입구 위는 clamp) — 모서리 누수 방지 핵심.
        const hC = clamp(h, 0.0, NECK_TOP).toVar();
        // 높이별 내반경: 몸통 BODY_R → 어깨(smootherstep) → 곧은 목 NECK_R.
        const tSh = clamp(hC.sub(BODY_TOP).div(SHOULDER_TOP - BODY_TOP), 0.0, 1.0).toVar();
        const sSh = tSh
          .mul(tSh)
          .mul(tSh)
          .mul(tSh.mul(tSh.mul(6.0).sub(15.0)).add(10.0)); // smootherstep
        const rAt = mix(float(BODY_R), float(NECK_R), sSh).toVar();
        const clx = lx.toVar();
        const cly = ly.toVar();
        const clz = lz.toVar();
        // 몸통·목 벽: 병 높이 안(h<NECK_TOP) & 반경 초과 → 축 쪽으로. h<0 이면
        // hC=0 이라 BODY_R 적용 → 바닥 밀기와 합쳐 바닥 모서리를 완전히 막는다.
        If(h.lessThan(NECK_TOP).and(rad.greaterThan(rAt)), () => {
          const k = rAt.div(rad);
          clx.assign(lx.mul(k));
          clz.assign(lz.mul(k));
        });
        // 바닥: 바닥면 아래로 내려가면 바닥으로 올림(못 빠짐)
        If(h.lessThan(0.0), () => {
          cly.assign(bottomLocalY);
        });
        // local → world: R(θ)·(clx,cly) + pivot (안 걸리면 항등 = 원위치)
        result.assign(
          vec3(
            clx.mul(c).sub(cly.mul(s)).add(PIVOT[0]),
            clx.mul(s).add(cly.mul(c)).add(PIVOT[1]),
            clz.add(PIVOT[2])
          )
        );
        // 도메인 경계 (y는 YMAX까지)
        result.assign(clamp(result, vec3(0.001), vec3(0.999, YMAX - 0.001, 0.999)));
        return result;
      };

      // SPH 커널 (Poly6 밀도, Spiky 그래디언트)
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const poly6 = (r2: any) => {
        const d = float(H2).sub(r2);
        return d.mul(d).mul(d).mul(POLY6);
      };
      // ∇W_i = -SPIKY (H-r)² (r_ij)/|r_ij|,  r_ij = p_i − p_j
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const spikyGrad = (rij: any, r: any) => {
        const c = float(H).sub(r);
        return rij.mul(float(-SPIKY).mul(c).mul(c).div(r));
      };

      // 셀 인덱스 계산 (coord → grid cell)
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const cellOf = (p: any) => {
        return ivec3(
          clamp(p.x.mul(GRID_RES), float(0), float(GRID_RES - 1)),
          clamp(p.y.mul(GRID_RES), float(0), float(GRID_RES_Y - 1)),
          clamp(p.z.mul(GRID_RES), float(0), float(GRID_RES - 1))
        );
      };
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const cellId = (c: any) => c.x.add(c.y.mul(GRID_RES)).add(c.z.mul(GRID_RES * GRID_RES_Y));

      // 1) 셀 카운트 초기화
      clearCellKernel = Fn(() => {
        atomicStore(cellCountBuffer.element(instanceIndex).get("count"), 0);
      })()
        .compute(CELL_COUNT)
        .setName("clearCell");

      // 2) 예측: v += g·dt, predicted = x + v·dt
      predictKernel = Fn(() => {
        // 대기(parked) 입자는 건너뜀 — 풀린(활성) 입자만 물리 적용.
        If(int(instanceIndex).lessThan(pourCountUniform), () => {
          const p = particleBuffer.element(instanceIndex);
          const v = p.get("velocity").toVar();
          v.y.addAssign(gravUniform.mul(dtUniform));
          const pred = p.get("position").add(v.mul(dtUniform)).toVar();
          pred.assign(clamp(pred, vec3(0.001), vec3(0.999, YMAX - 0.001, 0.999)));
          p.get("velocity").assign(v);
          p.get("predicted").assign(pred);
        });
      })()
        .compute(N)
        .setName("predict");

      // 3) 해시 그리드 빌드 (predicted 기준)
      buildGridKernel = Fn(() => {
        // 대기 입자는 그리드에 안 넣음 — 활성 입자만 이웃으로 잡힘.
        If(int(instanceIndex).lessThan(pourCountUniform), () => {
          const pred = particleBuffer.element(instanceIndex).get("predicted");
          const cid = cellId(cellOf(pred)).toVar();
          const idx = atomicAdd(cellCountBuffer.element(cid).get("count"), int(1)).toVar();
          If(idx.lessThan(int(MAX_PER_CELL)), () => {
            cellIdsBuffer.element(cid.mul(MAX_PER_CELL).add(idx)).assign(int(instanceIndex));
          });
        });
      })()
        .compute(N)
        .setName("buildGrid");

      // 이웃 순회 매크로: 27개 이웃 셀 × 버킷을 돌며 body(j, rij, r2, r) 호출
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const forEachNeighbor = (pi: any, body: (ctx: any) => void) => {
        const base = cellOf(pi).toConst();
        Loop(
          { start: -1, end: 2, type: "int", name: "ox", condition: "<" },
          // biome-ignore lint/suspicious/noExplicitAny: TSL
          ({ ox }: any) => {
            Loop(
              { start: -1, end: 2, type: "int", name: "oy", condition: "<" },
              // biome-ignore lint/suspicious/noExplicitAny: TSL
              ({ oy }: any) => {
                Loop(
                  { start: -1, end: 2, type: "int", name: "oz", condition: "<" },
                  // biome-ignore lint/suspicious/noExplicitAny: TSL
                  ({ oz }: any) => {
                    const nc = ivec3(base.x.add(ox), base.y.add(oy), base.z.add(oz)).toVar();
                    const inb = nc.x
                      .greaterThanEqual(int(0))
                      .and(nc.x.lessThan(int(GRID_RES)))
                      .and(nc.y.greaterThanEqual(int(0)))
                      .and(nc.y.lessThan(int(GRID_RES_Y)))
                      .and(nc.z.greaterThanEqual(int(0)))
                      .and(nc.z.lessThan(int(GRID_RES)));
                    If(inb, () => {
                      const cid = cellId(nc).toConst();
                      const cnt = atomicLoad(cellCountBuffer.element(cid).get("count")).toConst();
                      Loop(
                        {
                          start: 0,
                          end: MAX_PER_CELL,
                          type: "int",
                          name: "k",
                          condition: "<",
                        },
                        // biome-ignore lint/suspicious/noExplicitAny: TSL
                        ({ k }: any) => {
                          If(k.lessThan(cnt), () => {
                            const j = cellIdsBuffer.element(cid.mul(MAX_PER_CELL).add(k)).toConst();
                            const pj = particleBuffer.element(j).get("predicted");
                            const rij = pi.sub(pj).toVar();
                            const r2 = rij.dot(rij).toVar();
                            If(r2.lessThan(H2).and(r2.greaterThan(1e-12)), () => {
                              body({ j, rij, r2 });
                            });
                          });
                        }
                      );
                    });
                  }
                );
              }
            );
          }
        );
      };

      // 4) λ 계산: 밀도 제약 C_i = ρ_i/ρ0 − 1, λ_i = −C_i/(Σ|∇C|²+ε)
      lambdaKernel = Fn(() => {
        If(int(instanceIndex).lessThan(pourCountUniform), () => {
          const pi = particleBuffer.element(instanceIndex).get("predicted").toConst();
          const rho = float(0).toVar();
          const gradCi = vec3(0).toVar(); // Σ∇W (·1/ρ0 로 ∇C_ii)
          const sumGrad2 = float(0).toVar(); // Σ_{j} |∇C_ij|²
          rho.addAssign(poly6(float(0))); // self (r=0)
          forEachNeighbor(pi, ({ rij, r2 }) => {
            const r = r2.sqrt();
            rho.addAssign(poly6(r2));
            const grad = spikyGrad(rij, r).div(restDensityUniform);
            gradCi.addAssign(grad);
            sumGrad2.addAssign(grad.dot(grad));
          });
          densityBuffer.element(instanceIndex).assign(rho);
          const c = rho.div(restDensityUniform).sub(1.0);
          sumGrad2.addAssign(gradCi.dot(gradCi));
          const lambda = c.negate().div(sumGrad2.add(EPS_RELAX));
          lambdaBuffer.element(instanceIndex).assign(lambda);
        });
      })()
        .compute(N)
        .setName("lambda");

      // 5) 위치 보정 Δp_i = (1/ρ0) Σ (λ_i+λ_j) ∇W, predicted += Δp, 경계
      deltaPKernel = Fn(() => {
        If(int(instanceIndex).lessThan(pourCountUniform), () => {
          const p = particleBuffer.element(instanceIndex);
          const pi = p.get("predicted").toVar();
          const lambdaI = lambdaBuffer.element(instanceIndex).toConst();
          const dp = vec3(0).toVar();
          forEachNeighbor(pi, ({ j, rij, r2 }) => {
            const r = r2.sqrt();
            const lambdaJ = lambdaBuffer.element(j).toConst();
            const grad = spikyGrad(rij, r);
            // 표면장력 s_corr = −k (W(r)/W(ΔQ))⁴ (Macklin&Müller 식 13)
            const ratio = poly6(r2).div(POLY6_DQ).toVar();
            const r2c = ratio.mul(ratio);
            const scorr = float(-SCORR_K).mul(r2c).mul(r2c);
            dp.addAssign(grad.mul(lambdaI.add(lambdaJ).add(scorr)));
          });
          dp.divAssign(restDensityUniform);
          pi.addAssign(dp);
          pi.assign(clampToBoundary(pi));
          p.get("predicted").assign(pi);
        });
      })()
        .compute(N)
        .setName("deltaP");

      // 6) 속도 갱신: v = (predicted − x)/dt, x = predicted
      velocityKernel = Fn(() => {
        If(int(instanceIndex).lessThan(pourCountUniform), () => {
          const p = particleBuffer.element(instanceIndex);
          const pos = p.get("position").toConst();
          const pred = p.get("predicted").toConst();
          const vi = pred.sub(pos).div(dtUniform).toVar();
          // XSPH 점성: 이웃과의 속도 차를 줄여 유체가 매끄럽게 잦아든다.
          const dv = vec3(0).toVar();
          forEachNeighbor(pred, ({ j, r2 }) => {
            const pj = particleBuffer.element(j);
            const vj = pj.get("predicted").sub(pj.get("position")).div(dtUniform);
            dv.addAssign(vj.sub(vi).mul(poly6(r2)));
          });
          vi.addAssign(dv.div(restDensityUniform).mul(C_XSPH));
          // 점성 소산: 출렁임(슬로싱)을 잦아들게 (약하게 — 낙하는 안 늦춤)
          vi.mulAssign(viscUniform);
          p.get("velocity").assign(vi);
          p.get("position").assign(pred);
        });
      })()
        .compute(N)
        .setName("velocity");
    }

    function setupMesh() {
      // SSFR 1단계: 입자를 sphere 로 렌더해 '뷰 공간 깊이'를 depthRT 에 쓴다.
      const geometry = BufferGeometryUtils.mergeVertices(
        new THREE.IcosahedronGeometry(PARTICLE_R, 2).deleteAttribute("uv")
      );
      const material = new A.MeshBasicNodeMaterial();
      material.positionNode = Fn(() => {
        const pos = particleBuffer.element(instanceIndex).get("position");
        return attribute("position").add(pos);
      })();
      // 뷰 공간 선형 깊이(카메라 앞이 양수). R 채널에 저장.
      material.colorNode = Fn(() => vec4(positionView.z.negate(), 0, 0, 1))();
      particleMesh = new THREE.Mesh(geometry, material);
      // biome-ignore lint/suspicious/noExplicitAny: mesh.count
      (particleMesh as any).count = N;
      particleMesh.scale.setScalar(DOMAIN_SCALE);
      // coord(0,0,0) = world DOMAIN_MIN (도메인 원점)
      particleMesh.position.set(DOMAIN_MIN[0], DOMAIN_MIN[1], DOMAIN_MIN[2]);
      particleMesh.frustumCulled = false;
      fluidScene.add(particleMesh);
    }

    // 와인 legs(눈물) — 유리 벽 젖은 자리에서 투과 배경을 와인색으로 흡수(감쇠).
    // 발광 아님. 젖음=0 이면 감쇠 없음 → 마른 유리와 동일. render 가 갱신.
    // 유니폼 핸들(glassWetU/glassWlU/glassDripU/rippleActU/rippleTimeU/roughnessU)과
    // 도달 최고점 배열·텍스처(wetTopArr/legTex)는 이제 glass1 에 담긴다.
    // 둘레별 도달 최고점(수위선 위, 프로파일). 자국은 와인이 실제 오른 방향에만
    // 생긴다(왼쪽 기울이면 왼쪽만). 스칼라 대신 둘레 배열→텍스처로 셰이더에 전달.
    const LEG_NA = 96;

    // ── buildGlass 팩토리 ────────────────────────────────────────────────
    // 호출할 때마다 완전히 독립된 GlassRuntime(자기 glassGroup·mesh·material·
    // uniform·스월 상태 0·파생상수·rebuild/surfWaveH 클로저)을 반환한다.
    // scene.add(gg.glassGroup) 는 호출부(초기화·addGlass)에서 한다.
    function buildGlass(glassTypeArg: number, absorbArg?: [number, number, number]): GlassRuntime {
      const gdef = GLASSES[Math.min(Math.max(glassTypeArg ?? 0, 0), GLASSES.length - 1)];
      const gProfile = [
        ...footStem(gdef.footR, gdef.stemLen),
        ...gdef.bowl.map(([r, y]) => [r, y + gdef.stemLen] as [number, number]),
      ];
      const gMaxY = Math.max(...gProfile.map((p) => p[1])); // 림 높이(프로파일)
      const glass = {
        profile: gProfile,
        wallThickness: gdef.wallThickness,
        bowlBottomY: gdef.stemLen - 0.05,
        bowlTopY: gMaxY,
        worldScale: ((0.42 * 2.92) / gMaxY) * (gdef.sizeScale ?? 1),
        worldY: -0.06,
      };
      const outerRadiusAt = (py: number): number => {
        const p = glass.profile;
        if (py <= p[0][1]) return p[0][0];
        for (let i = 1; i < p.length; i++) {
          if (py <= p[i][1]) {
            const [r0, y0] = p[i - 1];
            const [r1, y1] = p[i];
            const t = (py - y0) / (y1 - y0 || 1);
            return r0 + (r1 - r0) * t;
          }
        }
        return p[p.length - 1][0];
      };
      const innerRadiusAt = (py: number): number =>
        Math.max(outerRadiusAt(py) - glass.wallThickness, 0);
      const GLASS_WINE_BOTTOM = gdef.stemLen; // 컵 내부 바닥(=볼 바닥, 프로파일 y)
      const GLASS_WINE_FILL = gdef.stemLen + gdef.fillLevel; // 수면(잔별 적정 채움)

      // 이 잔의 독립 런타임 객체. 스월/슬로싱 상태는 모두 0 으로 초기화한다.
      const gg: GlassRuntime = {
        // 잔 파생 상수
        glass,
        gMaxY,
        innerRadiusAt,
        GLASS_WINE_BOTTOM,
        GLASS_WINE_FILL,
        // 파동 위상 캐시(surfWaveH 가 읽음) — 초기 수직 상태값
        crC: 1,
        crS: 0,
        l2c: 1,
        l2s: 0,
        l3c: 1,
        l3s: 0,
        // 스월 상태
        sloshX: 0,
        sloshZ: 0,
        sloshVX: 0,
        sloshVZ: 0,
        rotSmooth: 0,
        w2ph: 0,
        w3ph: 0,
        crestPh: 0,
        spinE: 0,
        simT: 0,
        waveAct: 0,
        // legs(눈물)
        wetness: 0,
        dripT: 0,
        wasWet: false,
        // 잔 기울기(마우스 추종)
        gTiltX: 0,
        gTiltZ: 0,
        gPrevX: 0,
        gPrevZ: 0,
        // 액체 부피 상태(setupGlassWine 에서 확정)
        liqV0: 0,
        liqH: GLASS_WINE_FILL,
        liqVol: 0,
        liqFoot: 1,
        // 화면 수평 슬라이드(잔별) — slideX 는 현재 위치, slideTarget 은 이징 목표.
        // exiting=true 인 잔만 화면 밖 도달 시 dispose(슬라이더 이동과 구분).
        slideX: 0,
        slideTarget: 0,
        exiting: false,
        // 교차 슬라이드(addGlass/slideOut)는 시간 기반 ease-in-out(가속→등속→감속)로
        // 움직인다. slideFrom=출발 위치, slideTo=도착 위치, slideT=진행(0~1),
        // slideDur=총 시간(초), sliding=진행 중 여부. 손 슬라이더 경로는 지수 이징을 쓴다.
        slideFrom: 0,
        slideTo: 0,
        slideT: 0,
        slideDur: 0.7,
        sliding: false,
        // 슬라이드 가속도 수치미분용 — 이전 두 프레임의 slideX.
        slidePrev1: 0,
        slidePrev2: 0,
        // legs 배열/텍스처 — setupGlass 에서 채움
        pwCol: null,
        wetTopArr: new Float32Array(LEG_NA),
        legTex: null,
        // mesh/geometry/material — setup 에서 채움
        glassMesh: null,
        liquidMesh: null,
        glassGroup: null,
        liquidGeo: null,
        liquidPosAttr: null,
        wineBackMat: null,
        liquidBodyMat: null,
        // uniform 핸들
        glassWetU: null,
        glassWlU: null,
        glassDripU: null,
        rippleActU: null,
        rippleTimeU: null,
        roughnessU: null,
        // 이 잔 전용 흡수계수 uniform(잔별 와인색) — 미지정이면 공통 기본색.
        absorbU: uniform(
          new THREE.Vector3(
            absorbArg ? absorbArg[0] : 16,
            absorbArg ? absorbArg[1] : 78,
            absorbArg ? absorbArg[2] : 98
          )
        ),
        // 이 잔의 상태/상수를 캡처하는 함수 — 아래 헬퍼가 채움
        surfWaveH: null,
        rebuild: null,
      };
      // 이 잔의 유리 lathe·와인 표면 메쉬·재질·surfWaveH·rebuild 를 만들어 gg 에 채운다.
      // glassGroup 은 여기서 scene 에 넣지 않는다(호출부가 scene.add).
      setupGlassLathe(gg);
      buildLiquid(gg);
      setupGlassWine(gg);
      return gg;
    }

    // 유리 lathe(굴절 유리) + legs(눈물) 재질. gg 의 잔 파생 상수를 읽어 만든다.
    function setupGlassLathe(gg: GlassRuntime) {
      const glass = gg.glass;
      const GLASS_WINE_FILL = gg.GLASS_WINE_FILL;
      const curve = new THREE.CatmullRomCurve3(
        glass.profile.map(([r, y]: [number, number]) => new THREE.Vector3(r, y, 0)),
        false,
        "centripetal",
        0.5
      );
      const pts = curve.getPoints(260).map((p) => new THREE.Vector2(Math.max(p.x, 0.0006), p.y));
      const geometry = new THREE.LatheGeometry(pts, 240);
      geometry.computeVertexNormals();
      // 알파 블렌딩 유리(투과 대신) — 반투명끼리 중첩 정상. 가장자리(프레넬)는
      // 더 뿌옇고 정면은 맑게. 살짝 파랑기 도는 맑은 유리.
      // 직접 굴절 유리: sceneRT(잔 뺀 장면=배경+병+와인)를 법선만큼 밀어 샘플
      // → 유리 너머가 휘어 보임(굴절·질감). 반투명 병도 sceneRT에 있으니 비침.
      // 예전 실사 유리 복원 — three.js 내장 투과(transmission). 물리적 굴절이라
      // 속 와인(불투명)이 잔을 자연스럽게 채워 보인다. (반투명 병은 투과 대상이
      // 아니라 잔 너머로 안 비침 — 옆에 있어 겹침은 미미.)
      const material = new A.MeshPhysicalNodeMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.04,
        transmission: 1,
        ior: 1.5,
        thickness: 0.012, // 실제 잔 벽 두께 ~2mm (world). 과장된 굴절/아크 제거
        transparent: true,
        side: THREE.DoubleSide,
      });
      // ── 와인 legs(눈물) ── 젖은 자리에서 투과 감쇠(attenuation)를 와인색으로 —
      // 유리를 통과하는 배경 빛을 흡수해 어둡게·붉게 물들인다(발광 아님). 마른 곳은
      // 감쇠 없음(맑음). 수위선 위 벽에 막(아치)+흘러내리는 줄기를 만든다.
      gg.glassWetU = uniform(0);
      gg.glassWlU = uniform(GLASS_WINE_FILL);
      gg.glassDripU = uniform(0);
      // 둘레별 도달 최고점 텍스처(1D, R=수위선 위 높이). 방향별로 자국 범위가 다름.
      const legTex = new THREE.DataTexture(
        gg.wetTopArr,
        LEG_NA,
        1,
        THREE.RedFormat,
        THREE.FloatType
      );
      legTex.magFilter = THREE.LinearFilter;
      legTex.minFilter = THREE.LinearFilter;
      legTex.wrapS = THREE.RepeatWrapping;
      legTex.needsUpdate = true;
      gg.legTex = legTex;
      const filmMask = Fn(() => {
        const yl = positionLocal.y.toVar(); // 프로파일 높이(0~2.92)
        const up = yl.sub(gg.glassWlU).toVar(); // 수위선 위 높이
        const th = atan(positionLocal.z, positionLocal.x).toVar(); // -π..π
        // 이 방위(θ)에서 와인이 실제 도달한 최고점(절대 프로파일 y)을 텍스처에서
        // 읽고, 수위선 위 높이로 변환. 오르지 않은 방향은 top≈0 → 자국 없음.
        const u = th.div(Math.PI * 2).toVar(); // 컬럼 인덱싱(RepeatWrapping)
        // 최고점의 4/5 높이에 자국 위쪽이 오게(peak 그대로면 조금 높아 보임).
        const top = texture(gg.legTex, vec2(u, 0.5)).x.sub(gg.glassWlU).max(0).mul(0.8).toVar();
        // 자국은 "그 방위의 도달점 ~ 수위선" 범위에만.
        const topGate = smoothstep(float(0.02), float(0.05), top).toVar(); // 오른 방위만
        // 밴드 아래 경계를 수면에서 살짝 띄운다(0.03~0.07). 수면 바로 위까지 막이
        // 내려오면 그 자리 유리가 아래 와인색을 굴절해 "먼지" 같은 색 프린지가 생겼다.
        const bandGate = smoothstep(float(0.03), float(0.07), up)
          .mul(smoothstep(top.add(0.02), top.sub(0.04), up)) // [수위선 위, 최고점]
          .toVar();
        // 밴드 내 정규화 높이(0=수위선, 1=최고점).
        const frac = up.div(top.max(0.001)).clamp(0, 1).toVar();
        // 아치 선: 도달 최고점의 진한 가는 선(와인이 고였던 자리).
        const dTop = up.sub(top).div(0.03).toVar();
        const archLine = dTop.mul(dTop).negate().exp().toVar();
        // ── 흘러내림 애니메이션 ── 방울 머리가 최고점(frac=1)→수위선(0)으로 내려간다.
        // 줄기마다 시차(phase)를 둬 동시에 안 내려감. dripT(glassDripU) 진행.
        const phase = sin(th.mul(7.0)).mul(0.5).add(0.5).mul(0.4).toVar();
        const prog = gg.glassDripU.sub(phase).clamp(0, 1).toVar();
        const head = float(1).sub(prog).toVar(); // 내려가는 아래 끝
        const stripe = pow(sin(th.mul(11.0)).max(0), float(8.0)).toVar();
        // 자취: 머리 위쪽(frac>head)이 젖어 있다. 머리: 밝은 방울.
        const trail = smoothstep(head.sub(0.03), head.add(0.03), frac).toVar();
        const dH = frac.sub(head).div(0.05).toVar();
        const bead = dH.mul(dH).negate().exp().toVar();
        const leg = stripe.mul(trail.mul(0.35).add(bead.mul(0.85))).toVar();
        return gg.glassWetU
          .mul(topGate)
          .mul(bandGate)
          .mul(archLine.mul(0.4).add(leg.mul(0.9)))
          .clamp(0, 1);
      });
      // 실제 와인 눈물은 색이 거의 없는 투명한 물줄기 — 색 흡수 대신 "그 자리만
      // 굴절이 살짝 다르게". 젖은 막/줄기(filmMask)의 화면 기울기(dFdx/dFdy)로
      // 유리 법선을 미세하게 틀어 → 투과·반사가 그 줄기에서만 굴절돼 보인다.
      // 마른 곳은 mask=0 → 섭동 0 → 유리 그대로(저위험).
      material.normalNode = Fn(() => {
        const m = filmMask().toVar();
        const bump = vec3(dFdx(m), dFdy(m), float(0)).mul(-7.0).toVar();
        return normalize(normalView.add(bump));
      })();
      const glassMesh = new THREE.Mesh(geometry, material);
      glassMesh.scale.setScalar(glass.worldScale);
      glassMesh.position.set(0, glass.worldY, 0);
      glassMesh.frustumCulled = false;
      gg.glassMesh = glassMesh;
    }

    // 실제 750ml 와인병 — 잔 옆에 세워서(반투명) 렌더. 잔 크기 대비 정확한 비율.
    function setupBottle() {
      // 잔 높이(프로파일 2.92 × worldScale) = 실제 24cm. → world/m 배율.
      const m = (profileMaxY * glass.worldScale) / GLASS_HEIGHT_M; // 미터→world
      // ── 실제 표준 보르도 750ml 규격 (dimensions.com/제조 스펙, m 단위) ──
      const Rb = 0.0368; // 몸통 반경(지름 73.6mm)
      const Rn = 0.01475; // 목 외반경(입구 외경 29.5mm)
      const bore = 0.00925; // 입구 내경 18.5mm
      const punt = 0.016; // 펀트(바닥 오목) 16mm
      const H = 0.3; // 전체 높이 300mm
      const yBody = 0.184; // 곧은 몸통 끝 = 어깨 시작(184mm)
      const yNeck = 0.216; // 목 시작(높고 각진 어깨 ~32mm)
      const yLip = 0.29; // 립 시작
      // 펀트→평평한 바닥→곧은 몸통→매끄러운(각진) 어깨→목→립→입구(bore)
      const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
      const P: number[][] = [
        [0.0001, punt], // 펀트 꼭대기(중심)
        [Rb * 0.35, punt * 0.5],
        [Rb * 0.8, 0.004],
        [Rb * 0.97, 0.0], // 바닥 바깥(최저, 평평)
        [Rb, 0.011], // 작은 모서리
        [Rb, yBody], // 곧은 몸통
      ];
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        const y = yBody + t * (yNeck - yBody);
        P.push([Rb + (Rn - Rb) * smoother(t), y]); // 매끄러운 어깨
      }
      P.push(
        [Rn, yLip], // 목
        [Rn * 1.12, yLip + 0.006], // 립 밖으로
        [Rn * 1.12, H],
        [bore, H] // 입구(내경 bore)
      );
      const pts = P.map(([r, y]) => new THREE.Vector2(r * m, y * m));
      const geometry = new THREE.LatheGeometry(pts, 72);
      geometry.computeVertexNormals();
      const material = new A.MeshPhysicalNodeMaterial({
        color: 0x1a5030, // 병유리 초록 (알파 반투명 — 속 와인 비침 + 병 존재)
        metalness: 0,
        roughness: 0.1,
        ior: 1.5,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      // 프레넬 알파: 정면은 속 와인 비치게(≈0.45), 가장자리는 병 뚜렷(≈0.9)
      const bvd = normalize(positionView.negate());
      const bfr = pow(float(1).sub(normalView.dot(bvd).abs()), 3.0);
      material.opacityNode = float(0.45).add(bfr.mul(0.45));
      material.envMapIntensity = 1.2;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      // 피벗(coord→world) 둘레로 기울이도록 그룹에 담는다. 물리 SDF 와 같은 피벗.
      const pivotWorld = new THREE.Vector3(
        DOMAIN_MIN[0] + PIVOT[0] * DOMAIN_SCALE,
        DOMAIN_MIN[1] + PIVOT[1] * DOMAIN_SCALE,
        DOMAIN_MIN[2] + PIVOT[2] * DOMAIN_SCALE
      );
      bottleGroup = new THREE.Group();
      bottleGroup.position.copy(pivotWorld);
      bottlePivotWorld = pivotWorld.clone();
      // 병은 world (0.42, -0.06, 0) 에 서 있음 → 그룹(피벗) 기준 상대 위치로.
      mesh.position.set(0.42 - pivotWorld.x, glass.worldY - pivotWorld.y, 0.0 - pivotWorld.z);
      bottleGroup.add(mesh);
      // 입구(주둥이) 마커 — 병 로컬 (0, H, 0) = 병 끝 중심(bore). 기울면 함께 이동.
      bottleSpout = new THREE.Object3D();
      bottleSpout.position.set(mesh.position.x, mesh.position.y + 0.3 * BOTTLE_M, mesh.position.z);
      bottleGroup.add(bottleSpout);
      scene.add(bottleGroup);
    }

    // 병 속 정적 와인 — 병 내부 원통 메쉬(깊이 정상, 병유리가 앞을 가림).
    function setupWine() {
      const m = (profileMaxY * glass.worldScale) / GLASS_HEIGHT_M;
      const Rw = (0.0368 - 0.0025) * m * 0.97; // 병 몸통 내반경(살짝 안쪽)
      const yBase = glass.worldY + 0.03; // 펀트 위
      const yTop = glass.worldY + WINE_FILL_TOP; // 채움 높이(절반쯤)
      const h = yTop - yBase;
      const geometry = new THREE.CylinderGeometry(Rw, Rw * 0.95, h, 56, 1, false);
      const material = new A.MeshPhysicalNodeMaterial({
        color: 0x7a0f1e, // 진한 레드 와인 (불투명 — 병 투과 뒤로 비침)
        metalness: 0,
        roughness: 0.25,
        side: THREE.DoubleSide,
      });
      material.envMapIntensity = 1.0;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0.42, yBase + h * 0.5, 0.0);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    // 잔 속 와인 — 표면·부피 기반. 잔 내벽 프로파일 lathe 를 "수면까지만" 생성
    // (클립은 WebGPU 노드머티리얼에서 안 먹어 지오메트리로 제한) + 수면 disc.
    // 깊은 버건디 + 프레넬 가장자리(얇은 곳 밝은 레드 = 흡수 근사).
    // GLASS_WINE_BOTTOM/GLASS_WINE_FILL 은 glass1 에 담겼다(잔 파생 상수).
    // 액체 그리드(파라메트릭): 각도 L_SEG × (벽 L_NV + 표면 L_NS). 매 프레임
    // 각도별 수위선을 구해 "기운 잔 안 + 수평면 아래"로 다시 채운다(강체 아님).
    const L_SEG = 96;
    const L_NV = 20; // 벽(바닥→수위선) 세로 분할
    const L_NS = 14; // 표면(수위선→중심) 분할 — 잔물결이 각지지 않게 촘촘히
    const L_PPC = L_NV + 1 + L_NS; // 컬럼당 정점 수
    const L_COS: number[] = [];
    const L_SIN: number[] = [];
    for (let i = 0; i <= L_SEG; i++) {
      const ang = (i / L_SEG) * Math.PI * 2;
      L_COS.push(Math.cos(ang));
      L_SIN.push(Math.sin(ang));
    }
    // 스월 회전 파동(자연스러운 스월). 고정 방향 평면파(연못 물결처럼 교차 →
    // 부자연)를 버리고, 잔을 도는 응집 파동으로 대체:
    //  - mode-1: 벽을 타고 오르는 크레스트(rp² · cos(θ-φ)), φ=스월 방향.
    //  - mode-2,3: 그 위를 천천히 도는 회전 로브(rp · cos(mθ-φ-w·t)).
    // 정지(waveAct=0)=평면. 위상 트리그(crC/crS/l2c…l3s)는 gg 에 담기고
    // render 에서 프레임마다 갱신. 파동 진폭·속도 상수는 잔과 무관해 공유.
    const WAMP1 = 0.08; // 벽 크레스트(mode-1)
    const WAMP2 = 0.024; // mode-2 로브
    const WAMP3 = 0.014; // mode-3 로브
    const WCREST_SHARP = 0.3; // Stokes 2차 — 주 마루 뾰족·골 완만(troch.js 검증, 평균 0)
    const W2SPD = 3.0; // mode-2 회전 속도
    const W3SPD = 4.2; // mode-3 회전 속도
    // 표면 파동 높이. c,s=cosθ,sinθ(컬럼각), c2..s3=2θ·3θ 트리그, rp=r/rw(0중심~1벽).
    // 이 잔(gg)의 파동 위상·활성도를 읽어 render/rebuildLiquid 가 공유한다.
    function surfWaveH(
      gg: GlassRuntime,
      c: number,
      s: number,
      c2: number,
      s2: number,
      c3: number,
      s3: number,
      rp: number
    ): number {
      if (gg.waveAct <= 1e-4) return 0;
      const m1 = c * gg.crC + s * gg.crS; // cos(θ-φ)
      const m2 = c2 * gg.l2c + s2 * gg.l2s; // cos(2θ-φ-w2·t)
      const m3 = c3 * gg.l3c + s3 * gg.l3s; // cos(3θ-φ-w3·t)
      // Stokes 2차 파형: 주 크레스트(mode-1) 마루를 뾰족하게·골을 완만하게 만든다.
      // 사인파의 둥근 마루(젤리 표면)가 아니라 실제 중력파의 뾰족한 마루. 평균 0 → 부피 보존.
      const m1s = m1 + WCREST_SHARP * (m1 * m1 - 0.5);
      return gg.waveAct * (WAMP1 * rp * rp * m1s + WAMP2 * rp * m2 + WAMP3 * rp * m3);
    }
    // Beer–Lambert: 와인 뒷면 거리 버퍼(두께=back−front) + 뒷면 재질 + 본 재질.
    // wineBackMat/liquidBodyMat/liquidMesh/liquidGeo/liquidPosAttr/glassGroup 은
    // glass1 에 담긴다. liqV0/liqH/liqVol/liqFoot(부피 상태)도 glass1.
    // biome-ignore lint/suspicious/noExplicitAny: TSL RT/Material
    let wineThickRT: any;
    // 와인 뒤 장면(와인만 숨김) — 와인이 이걸 굴절+흡수로 샘플 → 투과(화이트와인 비침).
    // biome-ignore lint/suspicious/noExplicitAny: TSL RT
    let bgRT: any;
    // 스월 상태(WineGlass.tsx 방식 이식): 드래그로 잔을 기울이고, 액체 수면은
    // 월드 수평(중력)을 유지 → 잔 벽을 타고 출렁. 관성 진동(a)으로 넘실.
    // 슬로싱: 수면 기울기(sloshX,Z)=2D 감쇠 진동자. 마우스 움직임이 구동 →
    // 원으로 흔들면 기울기가 세차(회전)해 수면 크레스트가 돌고, 멈추면 잦아듦.
    // 잔은 세운 채, 와인 표면만 기울어 돈다(실제 스월). 스월 상태·잔 기울기·legs
    // 상태(sloshX…gPrevZ, simT, waveAct, wetness, dripT, wasWet)는 glass1 에 담긴다.
    // 드래그→잔 기울기 매핑용: 카메라의 화면 오른쪽·위를 월드 수평면에 투영(재사용).
    const swR = new THREE.Vector3();
    const swU = new THREE.Vector3();
    // 마우스 = 잔 제어. 잔은 마우스 오프셋을 추종해 기울고, 놓으면 세워진다.
    // 이 마우스 입력 상태(mStart…downX/Y·swDragging·autoSwirl)는 "잔"이 아니라
    // 캔버스 전역 입력이므로 glass1 에 담지 않고 클로저에 그대로 둔다.
    // 와인 슬로싱은 잔의 움직임(속도)에 구동 → 놓으면 잔은 멈추고 와인만 출렁.
    let mStartX = 0;
    let mStartY = 0;
    let mCurX = 0;
    let mCurY = 0;
    let swDragging = false;
    // 클릭(거의 안 움직임) → 자동 스월 3바퀴(일관된 동작 보기용).
    let autoSwirl = false;
    let autoSwirlT = 0;
    let downX = 0;
    let downY = 0;

    // 고정 토폴로지 그리드 생성(정점 위치는 rebuildLiquid 가 매 프레임 채움).
    // 방위별 수위선(pwCol)·파동(surfWaveH)·rebuild 클로저를 이 잔(gg)에 바인딩한다.
    function buildLiquid(gg: GlassRuntime) {
      // 방위별 수위선(벽∩와인표면 높이) — legs 가 실제 젖은 높이로 생기게(rebuildLiquid 채움).
      gg.pwCol = new Float32Array(L_SEG + 1);
      gg.surfWaveH = (c, s, c2, s2, c3, s3, rp) => surfWaveH(gg, c, s, c2, s2, c3, s3, rp);
      gg.rebuild = (m1, m5, m9, H0, K) => rebuildLiquid(gg, m1, m5, m9, H0, K);
      const nCol = L_SEG + 1;
      const liquidGeo = new THREE.BufferGeometry();
      const liquidPosAttr = new THREE.BufferAttribute(new Float32Array(nCol * L_PPC * 3), 3);
      liquidGeo.setAttribute("position", liquidPosAttr);
      const idx: number[] = [];
      for (let i = 0; i < L_SEG; i++)
        for (let r = 0; r < L_PPC - 1; r++) {
          const a = i * L_PPC + r;
          const b = (i + 1) * L_PPC + r;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      liquidGeo.setIndex(idx);
      gg.liquidGeo = liquidGeo;
      gg.liquidPosAttr = liquidPosAttr;
      rebuildLiquid(gg, 0, 1, 0, gg.GLASS_WINE_FILL, 0); // 초기(수직) 채움
    }

    // 각도별 수위선(벽∩수평면)을 구해 잔 내부를 수평면 아래로 채운다. m1,m5,m9 는
    // glassGroup 회전행렬 y행 → 수평면을 액체 로컬 프레임의 기운 평면으로 표현.
    // K: 회전 오목 포물면 계수(스월 세기). 표면 = 평면 + K·r²(벽 쪽 차오름).
    // 이 잔(gg)의 상태·상수를 캡처한다 → render 는 gg.rebuild 로 호출.
    function rebuildLiquid(
      gg: GlassRuntime,
      m1: number,
      m5: number,
      m9: number,
      H0: number,
      K: number
    ) {
      const arr = gg.liquidPosAttr.array as Float32Array;
      const liquidGeo = gg.liquidGeo;
      const innerRadiusAt = gg.innerRadiusAt;
      const surfWaveH = gg.surfWaveH;
      const pwCol = gg.pwCol;
      const GLASS_WINE_BOTTOM = gg.GLASS_WINE_BOTTOM;
      const gMaxY = gg.gMaxY;
      const m5s = m5 || 1;
      const dPhi = (Math.PI * 2) / L_SEG;
      let foot = 0;
      for (let i = 0; i <= L_SEG; i++) {
        const c = L_COS[i];
        const s = L_SIN[i];
        const c2 = c * c - s * s; // cos2θ
        const s2 = 2 * c * s; // sin2θ
        const c3 = c2 * c - s2 * s; // cos3θ
        const s3 = c2 * s + s2 * c; // sin3θ
        // 벽(r=rw)에서의 파동값 = 크레스트가 벽을 타고 오른 높이(rp=1).
        const wWall = surfWaveH(c, s, c2, s2, c3, s3, 1);
        // 수위선 py_w: 벽(r=innerRadiusAt(py))이 표면(평면+포물+파동)과 만나는 높이.
        let pw = H0 / m5s;
        for (let it = 0; it < 5; it++) {
          const rr = Math.max(
            innerRadiusAt(Math.max(GLASS_WINE_BOTTOM, Math.min(pw, gMaxY - 0.02))),
            0.0006
          );
          pw = (H0 - m1 * rr * c - m9 * rr * s) / m5s + K * rr * rr + wWall;
        }
        pw = Math.max(GLASS_WINE_BOTTOM + 0.02, Math.min(pw, gMaxY - 0.02));
        pwCol[i] = pw; // legs: 이 방위에서 와인이 벽과 만난 높이
        const rw = Math.max(innerRadiusAt(pw), 0.0006);
        if (i < L_SEG) foot += 0.5 * rw * rw * dPhi; // 수면 수평 단면적
        let base = i * L_PPC * 3;
        // 벽: 바닥(중심)→수위선
        for (let j = 0; j <= L_NV; j++) {
          const py = GLASS_WINE_BOTTOM + ((pw - GLASS_WINE_BOTTOM) * j) / L_NV;
          const r = j === 0 ? 0 : Math.max(innerRadiusAt(py), 0.0006);
          arr[base] = r * c;
          arr[base + 1] = py;
          arr[base + 2] = r * s;
          base += 3;
        }
        // 표면: 수위선→중심(평면 + 포물면 + 회전 파동). rp=r/rw(1벽~0중심).
        for (let k = 1; k <= L_NS; k++) {
          const rp = 1 - k / L_NS;
          const r = rw * rp;
          const px = r * c;
          const pz = r * s;
          const wv = surfWaveH(c, s, c2, s2, c3, s3, rp);
          arr[base] = px;
          arr[base + 1] = (H0 - m1 * px - m9 * pz) / m5s + K * r * r + wv;
          arr[base + 2] = pz;
          base += 3;
        }
      }
      gg.liquidPosAttr.needsUpdate = true;
      liquidGeo.computeVertexNormals(); // 표면 파동 법선은 이걸로 정확히 얻음.
      // 다만 수위선 정점(j=L_NV)은 벽(수직)+수면(수평) 평균(~45°)이 돼 그 테두리
      // 한 줄만 어두운 환경을 반사 → "원반 테" 어두운 선. 그 정점 법선을 바로 안쪽
      // 표면 정점(k=1)의 법선으로 덮어써 수면과 이어지게 → 테 소멸.
      {
        const narr = liquidGeo.attributes.normal.array as Float32Array;
        for (let i = 0; i <= L_SEG; i++) {
          const cbase = i * L_PPC * 3;
          const oW = cbase + L_NV * 3; // 수위선 정점
          const oS = cbase + (L_NV + 1) * 3; // 안쪽 표면 정점(k=1)
          narr[oW] = narr[oS];
          narr[oW + 1] = narr[oS + 1];
          narr[oW + 2] = narr[oS + 2];
        }
        liquidGeo.attributes.normal.needsUpdate = true;
      }
      gg.liqFoot = foot;
      // 부피(닫힌 메쉬 signed volume) — 중심이 r=0 로 공유돼 닫힘.
      const ix = liquidGeo.index.array as ArrayLike<number>;
      let vol = 0;
      for (let t = 0; t < ix.length; t += 3) {
        const a = ix[t] * 3;
        const b = ix[t + 1] * 3;
        const d = ix[t + 2] * 3;
        vol +=
          arr[a] * (arr[b + 1] * arr[d + 2] - arr[b + 2] * arr[d + 1]) -
          arr[a + 1] * (arr[b] * arr[d + 2] - arr[b + 2] * arr[d]) +
          arr[a + 2] * (arr[b] * arr[d + 1] - arr[b + 1] * arr[d]);
      }
      gg.liqVol = Math.abs(vol) / 6;
    }

    function setupGlassWine(gg: GlassRuntime) {
      const glass = gg.glass;
      gg.liqV0 = gg.liqVol; // upright 부피를 목표로(기울여도 유지)
      gg.liqH = gg.GLASS_WINE_FILL;
      // 액체 재질: 불투명(유리 뒤로 확실히 보임) + 물리적 Beer–Lambert 흡수.
      // 색을 프레넬로 흉내내지 않고, 시선이 와인을 실제로 통과하는 두께 d 로부터
      // exp(−absorb·d) 로 계산 → 두꺼운 곳(수면 아래·중심) 검붉게, 얇은 가장자리
      // 밝게가 물리적으로 나온다. 두께 = 뒷면거리(wineThickRT) − 앞면거리.
      const bodyMat = new A.MeshPhysicalNodeMaterial({
        // 디퓨즈=검정: 와인은 빛을 되쏘지 않고 안으로 흡수한다. 어두운 디퓨즈라도
        // 환경광(IBL)을 받으면 각도 무관 균일 sheen(고무 느낌)이 생겨 액체답지 않다.
        // 색·깊이는 emissiveNode(흡수 투과)가, 반사는 프레넬 스페큘러만 담당.
        color: new THREE.Color(0x000000),
        // 와인은 물 기반(굴절률 1.33) — 유리 기본값 1.5로 두면 표면 반사율이 ~4%로
        // 유리처럼 번쩍인다. 1.33이면 F0~2%: 중앙(정면)은 거의 안 비치고 가장자리
        // (얕은 각도)에서만 프레넬로 환경이 비쳐 "안으로 빨려드는" 깊이가 산다.
        ior: 1.33,
        // 낮은 roughness = 반사가 넓은 무광 띠 대신 좁고 또렷한 "젖은 하이라이트"로
        // 모인다(반사 면적↓, 액체 느낌↑). 실제 와인도 조명 하나가 또렷이 맺힐 뿐
        // 표면 전체가 균일하게 빛나지 않는다.
        roughness: 0.14,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      // 노드 재질은 envMapIntensity 를 무시하므로(교훈), 표면 반사 세기는 ior·roughness
      // 로만 제어된다. 전역 scene.environmentIntensity(0.42)는 유리 반짝임용으로 유지.
      bodyMat.envMapIntensity = 0.18;
      // 스월 중엔 표면을 거칠게 — 움직이는 수면은 미세물결로 난반사한다. 매끈한 오목
      // 포물면(회전 중심 팸)이 환경을 동심원(과녁)으로 집속하던 것을, 스월 활성도에
      // 비례해 roughness 를 올려 흐트러뜨린다. 정지 시엔 0.14(유리 같은 매끈함) 유지.
      gg.roughnessU = uniform(0.14);
      bodyMat.roughnessNode = gg.roughnessU;
      // 미세 잔물결(capillary ripple): 큰 스월 파동(지오메트리)은 그대로 두고, 표면
      // 법선에 픽셀 단위 고주파 요철을 얹어 매끈한 반사가 반짝이는 조각으로 부서지게.
      // 단, 정지한 와인은 유리처럼 매끈하므로 스월 활성도(rippleActU)로 게이팅한다 —
      // 가만히 있으면 0(매끈), 흔들 때만 잔물결이 돋는다. 세기는 작게(과하면 젤리).
      gg.rippleActU = uniform(0); // 렌더 루프에서 waveAct 로 갱신
      gg.rippleTimeU = uniform(0); // 렌더 루프에서 simT 로 갱신 — 물결 이동·명멸
      const rippleFreqU = uniform(40); // 잔물결 촘촘함(클수록 잘게)
      const rippleAmpU = uniform(0.12); // 흔들 때 최대 섭동 세기(과하면 울퉁불퉁)
      bodyMat.normalNode = Fn(() => {
        // 사인 겹침은 규칙적 격자(벌집)가 생긴다 → fbm 노이즈로 불규칙한 잔물결.
        // 정지 얼룩이 아니라 시간에 따라 흐르고(이동) 모양이 바뀌게(명멸) 한다 —
        // xy 좌표에 시각을 더해 물결이 스월 방향으로 흐르고, 3번째 옥타브 좌표에
        // 시각을 넣어 fbm 이 변하며 반짝임이 잘게 명멸한다(scintillation).
        const tt = gg.rippleTimeU;
        const p = vec3(
          positionLocal.x.mul(rippleFreqU).add(tt.mul(0.6)),
          positionLocal.z.mul(rippleFreqU).sub(tt.mul(0.5)),
          tt.mul(1.5)
        ).toVar();
        const h = mx_fractal_noise_float(p, int(3), float(2.0), float(0.5)).toVar();
        // 화면 미분으로 높이장의 기울기를 구해 뷰 법선을 미세하게 튼다(legs와 같은 법).
        // 스월 활성도로 게이팅 → 정지 시 섭동 0(매끈).
        const amp = rippleAmpU.mul(gg.rippleActU).toVar();
        const bump = vec3(dFdx(h), dFdy(h), float(0)).mul(amp).toVar();
        return normalize(normalView.add(bump));
      })();
      bodyMat.emissiveNode = Fn(() => {
        // 시선이 와인을 통과하는 실제 두께 t = 뒷면거리 − 앞면거리.
        const frontDist = positionView.z.negate();
        const backDist = texture(wineThickRT.texture, screenUV).x;
        const t = backDist.sub(frontDist).max(0.02).toVar();
        // 굴절: 표면 법선(뷰)의 화면 투영 방향으로 배경(bgRT)을 민다. 두께가
        // 클수록 더 굴절. 화이트와인이 잔 기둥·배경을 휘어 비추게 하는 핵심.
        const refr = normalView.xy.mul(t.mul(0.35).add(0.02)).toVar();
        const bg = texture(bgRT.texture, screenUV.add(refr)).xyz.toVar();
        // Beer–Lambert 투과율 exp(−absorb·t) (0~1). 배경이 와인을 통과하며 흡수돼
        // 물든다: 화이트(흡수 작음)=뒤 비침, 레드(흡수 큼)=깊은 붉은색. absorbU=프리셋.
        const trans = vec3(
          t.mul(gg.absorbU.x).negate().exp(),
          t.mul(gg.absorbU.y).negate().exp(),
          t.mul(gg.absorbU.z).negate().exp()
        ).toVar();
        return bg.mul(trans);
      })();
      gg.liquidBodyMat = bodyMat;
      // 뒷면(먼 면) 거리 — winding 상 FrontSide 가 먼 면. view 거리 R 채널에.
      const wineBackMat = new A.MeshBasicNodeMaterial();
      wineBackMat.colorNode = Fn(() => vec4(positionView.z.negate(), 0, 0, 1))();
      wineBackMat.side = THREE.FrontSide;
      gg.wineBackMat = wineBackMat;
      void frontFacing;
      const glassMesh = gg.glassMesh;
      const liquidMesh = new THREE.Mesh(gg.liquidGeo, bodyMat);
      liquidMesh.scale.setScalar(glass.worldScale);
      liquidMesh.frustumCulled = false;
      gg.liquidMesh = liquidMesh;
      // 유리+액체를 그룹에 담아 함께 기울인다(드래그 스월). scene 추가는 호출부에서.
      const glassGroup = new THREE.Group();
      glassGroup.position.set(0, glass.worldY, 0);
      glassMesh.position.set(0, 0, 0); // 그룹 로컬 원점
      glassGroup.add(glassMesh);
      glassGroup.add(liquidMesh);
      gg.glassGroup = glassGroup;
    }

    // 붓기 물줄기 — 단위 원통(Y축, 아래로 가늘어짐). 매 프레임 스포우트→잔 표면
    // 으로 위치·방향·길이 조정. 와인(살짝 투과)으로 렌더.
    function setupStream() {
      const geo = new THREE.CylinderGeometry(1, 0.62, 1, 20, 1, true);
      const mat = new A.MeshPhysicalNodeMaterial({
        color: 0x66101c, // 붓는 와인(밝은 레드 — 얇은 줄기라 빛 통과)
        roughness: 0.12,
        transmission: 0.5,
        ior: 1.35,
        thickness: 0.02,
        transparent: true,
        side: THREE.DoubleSide,
      });
      streamMesh = new THREE.Mesh(geo, mat);
      streamMesh.visible = false;
      streamMesh.frustumCulled = false;
      scene.add(streamMesh);
    }
    // 스트림을 두 점(a=스포우트, b=잔 표면) 사이에 배치. rTop=위 반경.
    function placeStream(a: THREE.Vector3, b: THREE.Vector3, rTop: number) {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = Math.max(dir.length(), 1e-4);
      streamMesh.position.copy(a).add(b).multiplyScalar(0.5);
      streamMesh.scale.set(rTop, len, rTop); // 지오메트리 taper 유지(위 rTop, 아래 0.62·rTop)
      streamMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.multiplyScalar(1 / len)
      );
    }

    function setupParticles() {
      if (FLUID_ON) {
        setupBuffers();
        setupUniforms();
        setupComputeShaders();
        setupMesh();
      }
      // 초기 잔 1개(현재 glassType·색). 이후 addGlass 로 두 번째 잔을 넣어 검증한다.
      const gg = buildGlass(glassType ?? 0, wineAbsorb);
      absorbURef.current = gg.absorbU; // wineAbsorb 프리셋 실시간 변경은 첫 잔에 반영
      scene.add(gg.glassGroup);
      glasses.push(gg);
      setupBottle();
      if (!FLUID_ON) {
        setupStream(); // 붓기 물줄기
      }
    }

    // ── 화면 수평 슬라이드 벡터 ─────────────────────────────────────────
    // 카메라가 대각(-1.9,1.7,-1.9)이라 world x 를 그대로 쓰면 화면에서 위아래로
    // 비껴 움직인다(과거 버그). 카메라 화면-오른쪽 벡터를 world 수평면(y=0)에
    // 투영한 방향으로 slideX 만큼 옮겨야 화면상 순수 좌우 슬라이드가 된다.
    function applySlide(gg: GlassRuntime) {
      const rEl = camera.matrixWorld.elements;
      const rlen = Math.hypot(rEl[0], rEl[2]) || 1;
      const sx = gg.slideX;
      gg.glassGroup.position.set((rEl[0] / rlen) * sx, gg.glass.worldY, (rEl[2] / rlen) * sx);
    }

    // 카메라 가로 시야 기준 "화면 밖" 슬라이드 거리 — 잔이 완전히 사라질 만큼.
    function offscreenSlide(): number {
      const dist = camera.position.distanceTo(controls.target);
      const halfW = Math.tan((camera.fov * Math.PI) / 180 / 2) * dist * camera.aspect;
      return halfW + 1.2; // 잔 폭 여유
    }

    // 잔 하나의 GPU 자원을 모두 반환하고 scene 에서 뺀다.
    function disposeGlass(gg: GlassRuntime) {
      if (gg.glassGroup) scene.remove(gg.glassGroup);
      gg.glassMesh?.geometry?.dispose();
      gg.glassMesh?.material?.dispose();
      gg.liquidGeo?.dispose();
      gg.liquidBodyMat?.dispose();
      gg.wineBackMat?.dispose();
      gg.legTex?.dispose();
    }

    // 교차 슬라이드(가속→등속→감속)를 시작한다. 현재 slideX 에서 to 까지
    // 시간 기반 smootherstep 으로 움직이며, 그 가속도가 액체 슬로싱을 구동한다.
    function startCrossSlide(gg: GlassRuntime, to: number) {
      gg.slideFrom = gg.slideX;
      gg.slideTo = to;
      gg.slideTarget = to;
      gg.slideT = 0;
      gg.slideDur = 0.7;
      gg.sliding = true;
    }

    // ── imperative API (lab 검증용) ─────────────────────────────────────
    // 반대편 화면 밖에서 slideTarget 0 으로 이징 진입하는 새 잔을 추가한다.
    function addGlass(
      glassTypeArg: number,
      absorbArg?: [number, number, number],
      fromDir: "left" | "right" = "right"
    ) {
      const gg = buildGlass(glassTypeArg, absorbArg);
      const off = offscreenSlide();
      gg.slideX = fromDir === "right" ? off : -off; // 화면 밖에서 시작
      gg.slideTarget = 0; // 중앙으로 진입
      // 시간 기반 ease-in-out(가속→등속→감속) 교차 슬라이드 시작.
      startCrossSlide(gg, 0);
      applySlide(gg);
      // 가속도 수치미분 초기화(첫 두 프레임은 가속 0으로 처리).
      gg.slidePrev1 = gg.slideX;
      gg.slidePrev2 = gg.slideX;
      scene.add(gg.glassGroup);
      glasses.push(gg);
    }
    // 현재 잔들을 그 방향으로 내보내고, 화면 밖 도달 시 dispose(exiting 표시).
    function slideOut(dir: "left" | "right") {
      const off = offscreenSlide();
      for (const gg of glasses) {
        startCrossSlide(gg, dir === "right" ? off : -off);
        gg.exiting = true; // 도착하면 dispose 대상
      }
    }

    function onWindowResize() {
      camera.aspect = container!.clientWidth / container!.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container!.clientWidth, container!.clientHeight);
    }

    async function render() {
      // 물리 타임스텝을 프레임 타이밍에서 분리(고정). getDelta 기반이면
      // 탭 복귀(누적된 큰 delta)·큰 화면(낮은 프레임률)에서 스텝이 커져 확
      // 튄다. 고정 스텝이면 프레임률과 무관하게 항상 같은 물리 → 튐 원천 차단.
      // (느린 기기에선 살짝 슬로모션이지만 안정적. 표준 물리엔진 방식.)
      if (!FLUID_ON) {
        // 병·붓기는 지금 숨김(코드는 보존 — 나중에 사용).
        if (bottleGroup) bottleGroup.visible = false;
        if (streamMesh) streamMesh.visible = false;
        const dt = 1 / 60;
        // 활성 잔 = slideX 가 0 에 가장 가까운(화면 중앙) 잔. 마우스/자동스월 입력은
        // 이 잔의 스월에만 반영하고, 나머지 잔은 입력 없이 자기 관성으로만 출렁인다.
        let active = null;
        let bestAbs = Number.POSITIVE_INFINITY;
        for (const gg of glasses) {
          const ax = Math.abs(gg.slideX);
          if (ax < bestAbs) {
            bestAbs = ax;
            active = gg;
          }
        }
        // ── 잔별 스월·슬로싱·파동·legs·슬라이드 (각자 독립 상태로 실행) ──
        // 스월 물리 수식·상수는 잔이 1개일 때와 한 글자도 다르지 않다. 오직 g 가
        // 잔별 GlassRuntime 을 가리키고, 입력(gtx/gtz)이 활성 잔에만 들어갈 뿐.
        for (const g of glasses) {
          const isActive = g === active;
          // 슬라이드 이징 — 두 종류.
          //  ① 교차(addGlass/slideOut): 시간 기반 ease-in-out(가속→등속→감속).
          //     smootherstep 으로 slideFrom→slideTo. 그 가속도가 액체를 출렁이게 한다.
          //  ② 손 슬라이더(잔 1개, 활성): 연속 조작이라 지수 이징(부드럽게 따라가기).
          if (g.sliding) {
            g.slideT = Math.min(1, g.slideT + dt / g.slideDur);
            const t = g.slideT;
            const s = t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
            g.slideX = g.slideFrom + (g.slideTo - g.slideFrom) * s;
            if (g.slideT >= 1) g.sliding = false;
          } else {
            // 활성(중앙) 잔은 lab 슬라이더 값을 목표로 삼아 손으로 검증할 수 있게 한다.
            // 단 내보내는(exiting) 잔은 슬라이더가 목표를 덮지 않게 둔다.
            if (isActive && !g.exiting && glasses.length === 1) g.slideTarget = slideXRef.current;
            g.slideX += (g.slideTarget - g.slideX) * 0.14;
          }
          // 슬라이드 가속도(수치 2차 미분) — 액체 관성 구동에 쓴다. 첫 두 프레임은
          // 이전 값이 채워지지 않아 0 처리(slidePrev1/2 를 slideX 로 초기화해 둔다).
          const slideAccel = (g.slideX - 2 * g.slidePrev1 + g.slidePrev2) / (dt * dt);
          g.slidePrev2 = g.slidePrev1;
          g.slidePrev1 = g.slideX;
          // ── 스월링 ── 드래그로 잔(그룹)을 기울이고, 액체 수면은 월드 수평 유지.
          // 잔 = 마우스 추종. 드래그 시작점 기준 오프셋으로 기울고, 놓으면 세워진다.
          const GAMP = 0.007; // px → rad
          const GMAX = 0.32 * swirlRef.current; // 최대 잔 기울기(컨테이너 폭에 맞춰 실시간)
          let gtx = 0;
          let gtz = 0;
          // 입력은 활성 잔에만. 나머지 잔은 gtx=gtz=0 → 자기 관성으로만 출렁.
          if (isActive && autoSwirl) {
            // 자동 스월: 잔 기울기를 원으로 3바퀴(진폭 ramp in/out).
            // 3바퀴/2.7초 ≈ 1회전 0.9초(초당 1.1바퀴) — 사람이 손으로 스월하는 속도.
            const TOTAL = 2.7;
            const ROT = 3;
            const ph = (2 * Math.PI * ROT * autoSwirlT) / TOTAL;
            const env = Math.max(
              0,
              Math.min(autoSwirlT / 0.3, 1) * Math.min((TOTAL - autoSwirlT) / 0.4, 1)
            );
            const amp = GMAX * 0.85 * env;
            gtx = amp * Math.cos(ph);
            gtz = amp * Math.sin(ph);
            autoSwirlT += dt;
            if (autoSwirlT >= TOTAL) autoSwirl = false;
          } else if (isActive && swDragging) {
            // 카메라가 XZ 대각(−1.9,1.7,−1.9)에 있어 월드 X·Z 축이 화면과 45° 어긋난다.
            // 카메라의 화면 오른쪽·위를 월드 수평면에 투영해, 드래그 방향대로 잔 윗부분이
            // 기울게 한다(위=뒤, 아래=앞, 왼쪽=왼, 오른쪽=오른쪽).
            swR.setFromMatrixColumn(camera.matrixWorld, 0);
            swR.y = 0;
            swR.normalize(); // 화면 오른쪽(월드 수평)
            swU.setFromMatrixColumn(camera.matrixWorld, 1);
            swU.y = 0;
            swU.normalize(); // 화면 위(월드 수평)
            const sx = (mCurX - mStartX) * GAMP; // 화면 오른쪽 +
            const sy = (mStartY - mCurY) * GAMP; // 화면 위 +
            // 잔 top이 향할 월드 수평 방향 T. rotation.x>0→top+Z, rotation.z>0→top−X.
            gtx = swR.z * sx + swU.z * sy; // = T.z
            gtz = -(swR.x * sx + swU.x * sy); // = −T.x
            // 기울기 벡터 크기를 반지름으로 제한(방향 보존). 축별로 자르면(box) 한
            // 축이 먼저 한계에 걸릴 때 직선 드래그가 코너로 꺾여 없던 회전이 생긴다.
            const gLen = Math.hypot(gtx, gtz);
            if (gLen > GMAX) {
              gtx *= GMAX / gLen;
              gtz *= GMAX / gLen;
            }
          }
          // 자동 스월 중엔 잔이 프로그램대로 돌게 빠르게 추종.
          const gEase = isActive && (swDragging || autoSwirl) ? 0.5 : 0.14;
          g.gTiltX += (gtx - g.gTiltX) * gEase;
          g.gTiltZ += (gtz - g.gTiltZ) * gEase;
          // 잔 기울기 속도 → 와인 슬로싱 구동. 잔을 움직이면 와인이 출렁이고,
          // 놓으면 잔은 세워지며 와인만 관성으로 계속 출렁이다 잦아든다.
          const gvx = (g.gTiltX - g.gPrevX) / dt;
          const gvz = (g.gTiltZ - g.gPrevZ) / dt;
          g.gPrevX = g.gTiltX;
          g.gPrevZ = g.gTiltZ;
          // 와인잔 1차 슬로싱은 실제 ~3Hz 대다. 8(1.3Hz)은 물치고 느려 점성 있어
          // 보였다 → 11(≈1.75Hz)로 올려 물답게 빠릿하게(오일러 안정: ω·dt=0.18).
          const OMEGA = 11.0;
          const ZETA = 0.055; // 선형(점성) 감쇠 — 작은 진폭에서 부드럽게 멈춤
          // 2차(난류) 감쇠: 크게 출렁일수록 손실↑. 3.0 은 초기에 너무 빨리 죽어
          // 점성(꿀) 인상을 줬다 → 1.5 로 낮춰 물처럼 여러 번 출렁이다 잦아들게.
          const QUAD = 1.5;
          // ω 를 올리면 복원력(ω²)이 세져 같은 구동에 진폭이 줄어든다. 결합을 살짝
          // 올려서 스월 진폭을 보전한다. ω 8→11 로 복원력(ω²)이 64→121(1.9배)
          // 커진 만큼 결합도 2.7→5.0 으로 맞춰(≈ω² 비례) ⑤ 이전 진폭을 회복 —
          // 진폭이 곧 오목 포물면 깊이라, 덜 보정하면 표면이 과하게 평평해진다.
          const COUPLE = 5.0; // 잔 움직임 → 와인 슬로싱 결합(세게 흔들면 크게)
          const SLOSH_MAX = 0.78; // 최대 수면 기울기↑ — 세게 흔들수록 더 세워짐
          // 슬라이드 가속도 → 슬로싱 결합. 잔이 옆으로 가속하면 안의 액체가 관성으로
          // 반대쪽으로 쏠린다(출발 때 뒤로, 도착 때 앞으로 쏠렸다 잦아듦). 부호·크기는
          // lab 캡처로 튜닝하므로 상수로 둔다. sloshX/Z 는 SLOSH_MAX 로 clamp 돼 폭주 없음.
          const COUPLE_SLIDE = 0.02;
          // 두 축 결합 부호는 표면 크레스트가 잔 스월과 "같은 방향"으로 돌게 맞춘다
          // (와인은 잔을 쫓아감). 좌우(roll) 항은 그대로, 앞뒤(pitch) 항 부호만 뒤집어
          // 회전 방향을 바로잡되 선형 정렬은 유지.
          const sloshSpeed = Math.hypot(g.sloshVX, g.sloshVZ);
          const damp = 2 * ZETA * OMEGA + QUAD * sloshSpeed; // 속도(진폭) 의존 감쇠
          g.sloshVX += (-(OMEGA * OMEGA) * g.sloshX - damp * g.sloshVX) * dt - COUPLE * gvz * dt;
          g.sloshVZ += (-(OMEGA * OMEGA) * g.sloshZ - damp * g.sloshVZ) * dt + COUPLE * gvx * dt;
          // 슬라이드 관성 항 추가(스월 수식·상수는 위 그대로 유지). slideX 는 화면 수평
          // = 카메라 화면-오른쪽 벡터를 world y=0 에 투영한 방향(applySlide 와 동일).
          // 슬라이드 가속의 world 성분으로 나눠, 잔이 +방향 가속하면 액체는 −방향으로 쏠림.
          // sloshX/Z 는 각각 world x·z 수면 기울기라 aWx→sloshVX, aWz→sloshVZ 로 직접 매핑.
          const rElS = camera.matrixWorld.elements;
          const rlenS = Math.hypot(rElS[0], rElS[2]) || 1;
          const aWx = (rElS[0] / rlenS) * slideAccel;
          const aWz = (rElS[2] / rlenS) * slideAccel;
          g.sloshVX += -COUPLE_SLIDE * aWx * dt;
          g.sloshVZ += -COUPLE_SLIDE * aWz * dt;
          g.sloshX = Math.max(-SLOSH_MAX, Math.min(SLOSH_MAX, g.sloshX + g.sloshVX * dt));
          g.sloshZ = Math.max(-SLOSH_MAX, Math.min(SLOSH_MAX, g.sloshZ + g.sloshVZ * dt));
          // 잔 기울기 적용(마우스 추종).
          g.glassGroup.rotation.set(g.gTiltX, 0, g.gTiltZ);
          // 슬라이드: 화면 "수평"으로 옮긴다(각 잔 자기 slideX). 카메라가 대각이라
          // world x 를 그대로 쓰면 화면에서 위아래로 비껴 움직인다 — 카메라 화면-오른쪽
          // 벡터를 world 수평면(y=0)에 투영한 방향으로 옮겨야 순수 좌우 슬라이드가 된다.
          applySlide(g);
          g.glassGroup.updateMatrix();
          // 와인 수면 = 월드 (수평 + 슬로싱 기울기). 잔이 기울어도(회전 R) 로컬
          // 프레임에서 그 월드 평면을 표현하도록 계수 계산. a,b=슬로싱 월드 기울기.
          const el = g.glassGroup.matrix.elements;
          const a = g.sloshX;
          const b = g.sloshZ;
          const M1 = el[1] - a * el[0] - b * el[2];
          const M5 = el[5] - a * el[4] - b * el[6];
          const M9 = el[9] - a * el[8] - b * el[10];
          // 회전 오목 포물면: 스월 세기(수면 기울기 크기)에 비례해 벽 쪽 차오름.
          // 계수를 1.1→1.4 로 키워 "안쪽으로 오목했다가 평평 복귀"가 또렷하게.
          const swirlMag = Math.hypot(g.sloshX, g.sloshZ);
          const K = swirlMag * 1.4;
          // 회전 파동: 정지=평면, 흔들면 활성. 크레스트 방향 φ=슬로싱 벡터각(스월
          // 방향) → 마루가 잔을 돈다. mode-2,3 은 그 위를 시간에 따라 더 돈다.
          g.simT += dt;
          g.waveAct = Math.min(1, swirlMag * 3.5);
          if (g.rippleActU) g.rippleActU.value = g.waveAct; // 정지=매끈, 흔들 때만 잔물결
          if (g.rippleTimeU) g.rippleTimeU.value = g.simT; // 잔물결 이동·명멸 시각
          // 스월 중 표면 거칠기↑ → 오목면의 거울 반사(과녁·회전선) 흐림. 정지=0.14 매끈.
          // 단 너무 올리면(0.49) 오목을 알려주던 반사 왜곡까지 사라져 표면이 볼록처럼
          // 보인다(중심이 얇아 밝은 것만 남음). 0.18 로 낮춰 오목 반사 단서를 남긴다.
          if (g.roughnessU) g.roughnessU.value = 0.14 + g.waveAct * 0.18;
          const phi = Math.atan2(g.sloshZ, g.sloshX);
          // 스핀다운(회전 관성): 감쇠 진동자는 진폭만 줄고 회전 주파수는 ω로 고정이라,
          // 그냥 두면 수면이 평평해져도 계속 빠르게 도는 것처럼 보인다. 실제 유체는
          // 각운동량을 잃으며 잦아든다. 크레스트 각도(crestPh)를 슬로싱 방향 φ에 붙이되,
          // 한 프레임 회전 상한을 회전 관성 spinE(0~1)로 건다.
          //  - 충전: 잔을 움직이는 동안(gv) 빠르게 1로 → 선형·스월 모두 φ를 즉각 추종.
          //  - 방전: 놓으면 감소. 감쇠율을 (1−spinE)에 비례시켜, 빠를 땐 천천히 줄고
          //    느려지면 더 빨리 줄어 깔끔히 멈춘다(마른 마찰·접촉선 정지 느낌).
          const glassMove = Math.hypot(gvx, gvz);
          const charge = Math.min(1, glassMove / 0.8);
          if (charge > g.spinE) g.spinE += (charge - g.spinE) * 0.3;
          else g.spinE = Math.max(0, g.spinE - (0.18 + 0.6 * (1 - g.spinE)) * dt);
          let dPhi = phi - g.crestPh;
          while (dPhi > Math.PI) dPhi -= Math.PI * 2;
          while (dPhi < -Math.PI) dPhi += Math.PI * 2;
          const maxStep = OMEGA * g.spinE * dt;
          g.crestPh += Math.max(-maxStep, Math.min(maxStep, dPhi));
          g.crC = Math.cos(g.crestPh);
          g.crS = Math.sin(g.crestPh);
          // "얼마나·어느 쪽으로 도나" 판별: 슬로싱 벡터의 부호 있는 각속도
          // (각운동량/‖s‖²·ω). 원형 스월이면 ±1, 한 축 왕복(선형)이면 ~0. 부호를
          // 살려 로브가 스월 방향으로 돌게 하고, 선형이면 거의 안 돈다.
          const angMom = g.sloshX * g.sloshVZ - g.sloshZ * g.sloshVX;
          const rotInstant =
            swirlMag > 0.06 ? Math.max(-1, Math.min(1, angMom / (swirlMag * swirlMag * OMEGA))) : 0;
          g.rotSmooth += (rotInstant - g.rotSmooth) * 0.08;
          // 로브 회전도 회전 관성으로 함께 잦아들게. 크레스트(crestPh) 위를 더 돈다.
          g.w2ph += W2SPD * g.rotSmooth * g.spinE * dt;
          g.w3ph += W3SPD * g.rotSmooth * g.spinE * dt;
          const a2 = g.crestPh + g.w2ph;
          g.l2c = Math.cos(a2);
          g.l2s = Math.sin(a2);
          const a3 = g.crestPh + g.w3ph;
          g.l3c = Math.cos(a3);
          g.l3s = Math.sin(a3);
          // legs: 스월 중엔 벽이 젖고(빠르게↑, 흘러내림 리셋), 멈추면 서서히 마르며
          // 줄기가 아래로 흘러내린다(dripT↑). 유리 감쇠 필름 uniform 갱신.
          // 벽 젖음(legs): 각 방위에서 와인이 벽과 만난 높이(pwCol)가 정착 수위보다
          // 높으면 그 자리 벽이 젖는다. 방위별 최고점(절대 y)을 wetTopArr 에 누적 —
          // 느리게 기울여도 pw 가 오르면 기록되므로 자국이 생긴다(속도 무관).
          let curMax = 0;
          const pwCol = g.pwCol;
          const wetTopArr = g.wetTopArr;
          for (let bi = 0; bi < LEG_NA; bi++) {
            const pw = pwCol[bi];
            if (pw > wetTopArr[bi]) wetTopArr[bi] = pw;
            const rr = pw - g.GLASS_WINE_FILL; // 정착 수위 위로 얼마나 올랐나
            if (rr > curMax) curMax = rr;
          }
          if (g.legTex) g.legTex.needsUpdate = true;
          // 지금 어딘가 정착보다 높으면(기울어 젖는 중) wetness↑, 아니면 서서히 마름.
          if (curMax > 0.02) {
            g.wetness = Math.min(1, g.wetness + dt * 2.5);
          } else {
            g.wetness = Math.max(0, g.wetness - dt * 0.12);
            if (g.wetness <= 0.001) wetTopArr.fill(0); // 완전히 마르면 초기화
          }
          // 흘러내림: 벽이 젖는 즉시(아주 짧은 지연 후) 바로 시작. 새 젖음 에피소드가
          // 시작될 때만(마른 상태→젖음) 리셋 → 스월이 끝날 때까지 기다리지 않음.
          if (g.wetness > 0.05) {
            if (!g.wasWet) g.dripT = -0.12; // 짧은 지연(음수 구간=대기, 셰이더서 clamp 0)
            g.dripT = Math.min(1, g.dripT + dt * 0.4);
            g.wasWet = true;
          } else {
            g.dripT = 0;
            g.wasWet = false;
          }
          if (g.glassWetU) {
            g.glassWetU.value = g.wetness;
            g.glassDripU.value = g.dripT;
            // 눈물은 유리 벽의 고정 자국 → 출렁이는 수면(liqH)이 아니라 정지 수위선에
            // 앵커. 이전엔 liqH 로 갱신해 수면 따라 눈물이 위아래로 움직여 어색했다.
            g.glassWlU.value = g.GLASS_WINE_FILL;
          }
          for (let it = 0; it < 4; it++) {
            g.rebuild(M1, M5, M9, g.liqH, K);
            g.liqH += (g.liqV0 - g.liqVol) / (g.liqFoot || 1);
            g.liqH = Math.max(g.GLASS_WINE_BOTTOM + 0.1, Math.min(g.liqH, g.gMaxY - 0.05));
          }
        }
        // 내보낸(exiting) 잔이 화면 밖 목표에 거의 도달하면 dispose. 슬라이더로 옮긴
        // (exiting 아님) 잔은 아무리 밀어도 dispose 되지 않는다.
        const gone = glasses.filter(
          (gg) => gg.exiting && Math.abs(gg.slideX - gg.slideTarget) < 0.05
        );
        for (const gg of gone) {
          disposeGlass(gg);
          const idx = glasses.indexOf(gg);
          if (idx >= 0) glasses.splice(idx, 1);
        }
        // ── 렌더 패스 ── 두 잔이 다 scene 에 있으므로 각 패스에서 모든 잔의 mesh 를
        // 함께 토글해 한 번의 renderer.render 로 처리한다(slideX 로 좌우 분리 → 안 겹침).
        // 와인 뒷면 거리 → wineThickRT (Beer–Lambert 두께용). 유리·병·배경 끔.
        scene.background = null;
        for (const g of glasses) {
          g.glassMesh.visible = false;
          g.liquidMesh.material = g.wineBackMat;
        }
        renderer.setRenderTarget(wineThickRT);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.render(scene, camera);
        for (const g of glasses) {
          g.glassMesh.visible = true;
          g.liquidMesh.material = g.liquidBodyMat;
        }
        // 와인 뒤 장면 → bgRT: 따뜻한 HDR(warmBg)로 렌더해 와인이 빛나게(투과 backlit).
        // 와인·유리 숨김 → 배경만. 유리를 빼는 이유: 빈 잔 굴절 X자 방지.
        scene.background = warmBg;
        for (const g of glasses) {
          g.liquidMesh.visible = false;
          g.glassMesh.visible = false;
        }
        renderer.setRenderTarget(bgRT);
        renderer.render(scene, camera);
        for (const g of glasses) {
          g.glassMesh.visible = true;
          g.liquidMesh.visible = true;
        }
        // 화면에 보이는 최종 렌더: 배경은 pageBg(사이트 색과 매칭). 유리 뒤로는
        // 어두운 페이지 색이 보이지만, 와인은 warmBg 로 이미 빛나는 상태로 합성됨.
        scene.background = pageBg;
        frameCount++;
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      // biome-ignore lint/suspicious/noExplicitAny: mesh.count
      (particleMesh as any).count = N;
      // ── 붓기 일시정지: 병은 세운 채 고정(tilt=0). 와인이 진짜 정지에 도달하는지 ──
      // 하나의 시뮬로 확인(freeze 안 함). 여기서 평형이어야 붓기가 자연스럽게 이어짐.
      const tilt = 0;
      tiltUniform.value = tilt;
      bottleGroup.rotation.z = tilt;
      if (SIMULATE) {
        const PBF_SUBSTEPS = 8;
        dtUniform.value = 1 / 60 / PBF_SUBSTEPS;
        // 검증(SDF↔시각 대조): 중력 끔 → 침강 없이 채운 SDF 형상 그대로 확인.
        // (붓기 단계에선 실제 중력으로 복귀.)
        gravUniform.value = 0;
        pourCountUniform.value = N;
        for (let s = 0; s < PBF_SUBSTEPS; s++) {
          renderer.compute(predictKernel);
          renderer.compute(clearCellKernel);
          renderer.compute(buildGridKernel);
          for (let it = 0; it < SOLVER_ITER; it++) {
            renderer.compute(lambdaKernel);
            renderer.compute(deltaPKernel);
          }
          renderer.compute(velocityKernel);
        }
      } // end if (SIMULATE)
      // SSFR 1단계: 입자 깊이를 depthRT 에 렌더 → grayscale 로 화면 확인
      renderer.setRenderTarget(depthRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(fluidScene, camera);
      // 깊이 평활화(분리형 1D 가로+세로)를 여러 번 반복해 강하게 평평화 → 뭉게구름 제거
      renderer.setRenderTarget(blurRT2);
      renderer.clear();
      blurFromDepth.render(renderer); // 가로: depthRT → blurRT2
      renderer.setRenderTarget(blurRT);
      renderer.clear();
      blurPong.render(renderer); // 세로: blurRT2 → blurRT
      const SMOOTH_ITER = 2; // 추가 2D 반복 (가로+세로)
      for (let s = 0; s < SMOOTH_ITER; s++) {
        renderer.setRenderTarget(blurRT2);
        renderer.clear();
        blurPing.render(renderer); // 가로: blurRT → blurRT2
        renderer.setRenderTarget(blurRT);
        renderer.clear();
        blurPong.render(renderer); // 세로: blurRT2 → blurRT
      }
      // 잔 직접 굴절용 sceneRT(잔 뺀 장면=배경+병) 렌더
      for (const g of glasses) g.glassMesh.visible = false;
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      for (const g of glasses) g.glassMesh.visible = true;
      // 배경 HDR + 병 + 유리잔 렌더 → 그 위에 유체 표면(알파) 합성
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      renderer.autoClear = false; // 배경을 지우지 않고 그 위에 합성
      surfaceQuad.render(renderer);
      renderer.autoClear = true;

      // 디버그 로그: 속도·밀도·대류·볼 밖 입자 (MLS-MPM 여정에서 만든 지표)
      frameCount++;
      if (SIMULATE && frameCount % 60 === 0) {
        const t = (frameCount / 60).toFixed(0);
        Promise.all([
          renderer.getArrayBufferAsync(particleBuffer.value),
          renderer.getArrayBufferAsync(densityBuffer.value),
        ])
          .then(([pbuf, dbuf]: ArrayBuffer[]) => {
            const arr = new Float32Array(pbuf);
            const den = new Float32Array(dbuf);
            let sumV = 0;
            let maxV = 0;
            let sumD = 0;
            let leaked = 0; // 병 밖으로 샌 입자 수
            let comY = 0; // 무게중심 높이(coord) — 안정되면 일정
            const eps = 0.012; // 병 SDF 판정 여유(입자 반경 정도)
            for (let i = 0; i < N; i++) {
              const vx = arr[i * STRIDE + 4];
              const vy = arr[i * STRIDE + 5];
              const vz = arr[i * STRIDE + 6];
              const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
              sumV += v;
              if (v > maxV) maxV = v;
              sumD += den[i];
              const px = arr[i * STRIDE];
              const py = arr[i * STRIDE + 1];
              const pz = arr[i * STRIDE + 2];
              comY += py;
              const rad = Math.hypot(px - BOTTLE_AXIS[0], pz - BOTTLE_AXIS[1]);
              const hh = py - BOTTLE_BOTTOM;
              const inside =
                hh > -eps &&
                hh < NECK_TOP + eps &&
                rad < radiusAtJS(Math.max(0, Math.min(NECK_TOP, hh))) + eps;
              if (!inside) leaked++;
            }
            console.log(
              `[wine] t=${t}s vAvg=${(sumV / N).toFixed(4)} vMax=${maxV.toFixed(3)} leaked=${leaked}/${N} comY=${(comY / N).toFixed(4)} dAvg=${(sumD / N).toFixed(0)}`
            );
          })
          .catch(() => {});
      }
    }

    async function init() {
      renderer = new THREE.WebGPURenderer({
        antialias: true,
        requiredLimits: { maxStorageBuffersInVertexStage: 1 },
      });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.localClippingEnabled = true; // 와인 수면 클립(부피 채움 표현)
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      container.appendChild(renderer.domElement);

      // 스월링 입력: 드래그로 잔을 기울인다(WineGlass.tsx 방식).
      const onSwDown = (e: PointerEvent) => {
        autoSwirl = false; // 새 조작이 자동 스월 중단
        swDragging = true;
        mStartX = e.clientX;
        mStartY = e.clientY;
        mCurX = e.clientX;
        mCurY = e.clientY;
        downX = e.clientX;
        downY = e.clientY;
      };
      const onSwUp = () => {
        if (!swDragging) return; // down 이 캔버스에서 시작 안 했으면 무시(버튼 등)
        swDragging = false;
        // 거의 안 움직였으면 클릭 → 자동 스월 3바퀴.
        if (Math.hypot(mCurX - downX, mCurY - downY) < 6) {
          autoSwirl = true;
          autoSwirlT = 0;
        }
      };
      const onSwMove = (e: PointerEvent) => {
        if (!swDragging) return;
        mCurX = e.clientX;
        mCurY = e.clientY;
      };
      renderer.domElement.addEventListener("pointerdown", onSwDown); // 캔버스에서만 시작
      window.addEventListener("pointerup", onSwUp);
      window.addEventListener("pointermove", onSwMove);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(
        40,
        container.clientWidth / container.clientHeight,
        0.01,
        10
      );
      // 병(큰 편)이 옆에 있으니 줌아웃 + 잔·병 사이를 타깃으로.
      camera.position.set(-1.9, 1.7, -1.9);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.minDistance = 1;
      controls.maxDistance = 5;
      controls.maxPolarAngle = Math.PI * 0.5;
      controls.target.set(0, 0.55, 0); // x=0: 글라스를 프레임 수평 중앙에
      controls.enableRotate = false; // 드래그는 카메라 회전이 아니라 스월(잔 기울임)
      controls.enablePan = false;

      const hdrLoader = new UltraHDRLoader().setPath("/textures/equirectangular/");
      const hdrTexture = await hdrLoader.loadAsync("royal_esplanade_2k.hdr.jpg");
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
      // 와인 투과(bgRT)는 따뜻한 HDR 로 샘플해 와인이 빛나게, 화면에 보이는 배경은
      // pageBg(=bgColor 지정 시 사이트 색). bgColor 없으면 둘 다 따뜻한 HDR(기존).
      warmBg = hdrTexture;
      pageBg = bgColor ? new THREE.Color(bgColor) : hdrTexture;
      scene.background = pageBg;
      scene.backgroundBlurriness = 0.5;
      scene.backgroundIntensity = bgIntensity ?? 1; // 배경 밝기(좁은 프레임 보정용)
      // 반사(IBL)는 와인잔용 따뜻한 스튜디오 환경을 절차적으로 생성 — 파란 하늘
      // 대신 따뜻한 소프트박스가 비쳐 수면·유리 반사가 자연스럽다.
      const ew = 256;
      const eh = 128;
      const edata = new Float32Array(ew * eh * 4);
      for (let y = 0; y < eh; y++) {
        const vv = y / (eh - 1); // 0 아래 ~ 1 위
        for (let x = 0; x < ew; x++) {
          const uu = x / (ew - 1);
          let r = 0.05;
          let g = 0.035;
          let bl = 0.028; // 따뜻한 어두운 base
          const top = Math.max(0, vv - 0.5) * 2; // 상단 따뜻한 글로우(하늘 대신)
          r += top * 0.22;
          g += top * 0.15;
          bl += top * 0.1;
          // 키 소프트박스(정면 상단, 따뜻 밝게)
          const k = Math.exp(-((uu - 0.32) ** 2 / 0.02 + (vv - 0.74) ** 2 / 0.012));
          r += k * 2.4;
          g += k * 2.0;
          bl += k * 1.5;
          // 필(반대편, 약하게)
          const f = Math.exp(-((uu - 0.82) ** 2 / 0.05 + (vv - 0.58) ** 2 / 0.04));
          r += f * 0.7;
          g += f * 0.58;
          bl += f * 0.5;
          // 가는 가로 스트립 조명(모든 방위, 상단): 수평 수면의 일부 픽셀만 이
          // 좁은 띠를 반사 → 와인색 위에 또렷한 하이라이트 "줄"(젖은 액체 신호).
          // 폭을 넓히면 표면 전체가 반사돼 흰 원반이 되므로 좁게 유지한다.
          const band = Math.exp(-((vv - 0.64) ** 2) / 0.0008);
          r += band * 1.15;
          g += band * 0.98;
          bl += band * 0.76;
          const i = (y * ew + x) * 4;
          edata[i] = r;
          edata[i + 1] = g;
          edata[i + 2] = bl;
          edata[i + 3] = 1;
        }
      }
      const studioEnv = new THREE.DataTexture(edata, ew, eh, THREE.RGBAFormat, THREE.FloatType);
      studioEnv.mapping = THREE.EquirectangularReflectionMapping;
      studioEnv.needsUpdate = true;
      void studioEnv; // (절차적 스튜디오맵 — 지금은 실내 HDR 반사 사용, 필요 시 되돌림용 보존)
      // 유리 표면에 창문/방이 비치도록 실내 HDR 을 반사 환경으로. 절차적 스튜디오맵은
      // 디테일이 없어 창문이 안 비쳤다. royal_esplanade = 아치·창 있는 실내.
      scene.environment = hdrTexture;
      // 노드 재질은 envMapIntensity 대신 scene.environmentIntensity 로 IBL 세기 제어.
      scene.environmentIntensity = 0.42; // 반사 밝게 — 창문/방이 더 또렷이 비침

      // SSFR: 유체 입자만 담는 씬 + 깊이 RenderTarget + 화면 표면 quad
      fluidScene = new THREE.Scene();
      const dpr = renderer.getPixelRatio();
      const rtW = Math.floor(container.clientWidth * dpr);
      const rtH = Math.floor(container.clientHeight * dpr);
      depthRT = new THREE.RenderTarget(rtW, rtH);
      depthRT.texture.type = THREE.FloatType;
      // 잔 뺀 장면(배경+병+와인) — 잔이 이걸 굴절해서 샘플(직접 굴절)
      sceneRT = new THREE.RenderTarget(rtW, rtH);
      // 와인 뒷면 거리(Beer–Lambert 두께 계산)
      wineThickRT = new THREE.RenderTarget(rtW, rtH);
      wineThickRT.texture.type = THREE.FloatType;
      // 와인 뒤 장면(와인만 숨김) — 굴절+흡수 투과 샘플용
      bgRT = new THREE.RenderTarget(rtW, rtH);
      bgRT.texture.type = THREE.HalfFloatType;
      blurRT = new THREE.RenderTarget(rtW, rtH);
      blurRT.texture.type = THREE.FloatType;
      blurRT2 = new THREE.RenderTarget(rtW, rtH);
      blurRT2.texture.type = THREE.FloatType;
      const texel = new THREE.Vector2(1 / rtW, 1 / rtH);

      // SSFR 2.5단계: 깊이 bilateral blur (둥근 블롭·뭉게구름 제거)를 강하게 하되
      // 싸게 — 2D 커널(N²) 대신 분리형(separable) 1D(가로+세로, 2N)로 쪼개 반복.
      // dux/duy 로 방향 지정. factory 로 입력 텍스처만 바꿔 ping-pong 재사용.
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const makeBlur1D = (srcTex: any, dux: number, duy: number) => {
        const q = new A.QuadMesh(new A.MeshBasicNodeMaterial());
        q.material.colorNode = Fn(() => {
          const uv = screenUV;
          const dCen = texture(srcTex, uv).x.toVar();
          const out = dCen.toVar();
          If(dCen.greaterThan(0.001), () => {
            const sum = dCen.toVar();
            const wsum = float(1).toVar();
            const R = 6;
            const sigR2 = 2 * 0.06 * 0.06; // 깊이 차(range) 분산
            for (let i = -R; i <= R; i++) {
              if (i === 0) continue;
              const off = vec2(i * dux * texel.x, i * duy * texel.y);
              const du = texture(srcTex, uv.add(off)).x.toVar();
              const dd = du.sub(dCen);
              const wr = exp(dd.mul(dd).div(-sigR2));
              const ws = Math.exp(-(i * i) / (2 * (R * 0.5) ** 2));
              const w = du.greaterThan(0.001).select(float(ws).mul(wr), float(0));
              sum.addAssign(du.mul(w));
              wsum.addAssign(w);
            }
            out.assign(sum.div(wsum));
          });
          return vec4(out, 0, 0, 1);
        })();
        return q;
      };
      // 가로: depthRT→blurRT2, 세로: blurRT2→blurRT (1 full 2D 패스)
      // 반복: 가로 blurRT→blurRT2, 세로 blurRT2→blurRT
      blurFromDepth = makeBlur1D(depthRT.texture, 1, 0); // 가로(첫 입력=depth)
      blurPing = makeBlur1D(blurRT.texture, 1, 0); // 가로(입력=blurRT)
      blurPong = makeBlur1D(blurRT2.texture, 0, 1); // 세로(입력=blurRT2)

      // SSFR 2단계: 깊이에서 view 위치→법선 재구성 + 와인 셰이딩(색+프레넬)
      const tanF = Math.tan((40 * Math.PI) / 180 / 2); // fov 40°
      const aspect = rtW / rtH;
      surfaceQuad = new A.QuadMesh(new A.MeshBasicNodeMaterial());
      surfaceQuad.material.colorNode = Fn(() => {
        const uv = screenUV;
        const dC = texture(blurRT.texture, uv).x.toVar();
        const outCol = vec3(0.02, 0.02, 0.025).toVar(); // 배경(임시)
        If(dC.greaterThan(0.001), () => {
          // uv+깊이 → view 위치
          // biome-ignore lint/suspicious/noExplicitAny: TSL
          const vp = (u: any, depth: any) => {
            const ndc = u.mul(2).sub(1);
            return vec3(
              ndc.x.mul(depth).mul(tanF * aspect),
              ndc.y.mul(depth).mul(tanF),
              depth.negate()
            );
          };
          // 법선을 넓은 중앙 차분(S픽셀)으로 재구성 — 1픽셀 차분은 알갱이
          // 요철을 그대로 드러내 슬러시처럼 보인다. 넓게 뜨면 저역통과돼 매끈.
          const S = 3;
          const oX = vec2(S * texel.x, 0);
          const oY = vec2(0, S * texel.y);
          const dRr = texture(blurRT.texture, uv.add(oX)).x;
          const dLl = texture(blurRT.texture, uv.sub(oX)).x;
          const dUu = texture(blurRT.texture, uv.add(oY)).x;
          const dDd = texture(blurRT.texture, uv.sub(oY)).x;
          const pR = vp(uv.add(oX), dRr);
          const pL = vp(uv.sub(oX), dLl);
          const pU = vp(uv.add(oY), dUu);
          const pD = vp(uv.sub(oY), dDd);
          const pC = vp(uv, dC);
          const normal = normalize(cross(pR.sub(pL), pU.sub(pD)));
          const viewDir = normalize(pC.negate());
          const fres = pow(float(1).sub(normal.dot(viewDir).max(0.0)), 3.0);
          const wine = vec3(0.28, 0.014, 0.05); // 진한 버건디
          // 프레넬 하이라이트 (표면 가장자리 밝게)
          outCol.assign(wine.add(vec3(0.9, 0.55, 0.65).mul(fres.mul(0.35))));
        });
        // 유체 픽셀만 불투명, 배경은 투명 → scene(배경+유리잔) 위에 합성
        const alpha = dC.greaterThan(0.001).select(float(1), float(0));
        return vec4(outCol, alpha);
      })();
      surfaceQuad.material.transparent = true;

      setupParticles();

      window.addEventListener("resize", onWindowResize);
      // 컨테이너 크기 변화(레이아웃 전환 등)에도 캔버스를 맞춘다.
      ro = new ResizeObserver(() => onWindowResize());
      ro.observe(container);
      controls.update();
      // imperative API 노출(lab 검증용). onReady 를 안 주면 지금처럼 동작(잔 1개).
      if (onReady && !disposed) {
        onReady({
          addGlass,
          slideOut,
          getCount: () => glasses.length,
        });
      }
      if (!disposed) renderer.setAnimationLoop(render);
    }

    init();

    return () => {
      disposed = true;
      window.removeEventListener("resize", onWindowResize);
      if (ro) ro.disconnect();
      for (const gg of glasses.slice()) disposeGlass(gg); // 잔 GPU 자원 반환
      glasses.length = 0;
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  }, [glassType]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
