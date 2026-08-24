"use client";

import { useEffect, useRef } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { UltraHDRLoader } from "three/examples/jsm/loaders/UltraHDRLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  atomicAdd,
  atomicLoad,
  atomicStore,
  attribute,
  clamp,
  cos,
  cross,
  exp,
  float,
  frontFacing,
  mix,
  instanceIndex,
  instancedArray,
  int,
  ivec3,
  normalize,
  normalView,
  normalWorld,
  positionView,
  pow,
  screenUV,
  sin,
  struct,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

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

// Position Based Fluids (Macklin & Müller 2013) 을 three/tsl 로 재구현.
// 비압축(밀도 제약) + 해시 그리드 이웃 + 잔 SDF 경계.
// biome-ignore lint: PBF 구조
export default function FluidLab({
  wineAbsorb,
}: {
  wineAbsorb?: [number, number, number];
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

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    // biome-ignore lint/suspicious/noExplicitAny: TSL/webgpu
    const A = THREE as any;

    // 와인 Beer–Lambert 흡수계수 uniform(프리셋 버튼으로 실시간 변경). 기본은
    // 현재 프리셋(있으면) 아니면 메를로/가넷 기본값.
    const absorbU = uniform(
      new THREE.Vector3(
        wineAbsorb ? wineAbsorb[0] : 16,
        wineAbsorb ? wineAbsorb[1] : 78,
        wineAbsorb ? wineAbsorb[2] : 98,
      ),
    );
    absorbURef.current = absorbU;

    let renderer: THREE.WebGPURenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controls: OrbitControls;
    let disposed = false;
    let frameCount = 0;

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
    const glass = {
      profile: [
        [0.0, 0.0], [0.55, 0.0], [0.55, 0.018], [0.42, 0.04],
        [0.12, 0.09], [0.05, 0.16], [0.042, 0.7], [0.042, 1.25],
        [0.05, 1.36], [0.1, 1.44], [0.17, 1.53], [0.26, 1.65],
        [0.34, 1.79], [0.4, 1.94], [0.44, 2.1], [0.46, 2.26],
        [0.455, 2.42], [0.43, 2.57], [0.4, 2.7], [0.36, 2.82],
        [0.325, 2.92],
      ] as [number, number][],
      wallThickness: 0.025,
      bowlBottomY: 1.7,
      bowlTopY: 2.7,
      worldScale: 0.42,
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

    let bowlRmax = 0;
    for (let py = glass.bowlBottomY; py <= glass.bowlTopY; py += 0.01) {
      bowlRmax = Math.max(bowlRmax, innerRadiusAt(py));
    }
    const cubeSpanProfile = Math.max(
      glass.bowlTopY - glass.bowlBottomY,
      bowlRmax * 2,
    );
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
    const metersPerCoord =
      DOMAIN_SCALE * (metersPerProfile / glass.worldScale);
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
    let glassMesh: THREE.Mesh; // 잔(직접 굴절용 — render에서 숨겼다 그림)
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
        const tSh = clamp(
          hC.sub(BODY_TOP).div(SHOULDER_TOP - BODY_TOP),
          0.0,
          1.0,
        ).toVar();
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
            clz.add(PIVOT[2]),
          ),
        );
        // 도메인 경계 (y는 YMAX까지)
        result.assign(
          clamp(result, vec3(0.001), vec3(0.999, YMAX - 0.001, 0.999)),
        );
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
          clamp(p.z.mul(GRID_RES), float(0), float(GRID_RES - 1)),
        );
      };
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const cellId = (c: any) =>
        c.x.add(c.y.mul(GRID_RES)).add(c.z.mul(GRID_RES * GRID_RES_Y));

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
          const idx = atomicAdd(
            cellCountBuffer.element(cid).get("count"),
            int(1),
          ).toVar();
          If(idx.lessThan(int(MAX_PER_CELL)), () => {
            cellIdsBuffer
              .element(cid.mul(MAX_PER_CELL).add(idx))
              .assign(int(instanceIndex));
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
                    const nc = ivec3(
                      base.x.add(ox),
                      base.y.add(oy),
                      base.z.add(oz),
                    ).toVar();
                    const inb = nc.x
                      .greaterThanEqual(int(0))
                      .and(nc.x.lessThan(int(GRID_RES)))
                      .and(nc.y.greaterThanEqual(int(0)))
                      .and(nc.y.lessThan(int(GRID_RES_Y)))
                      .and(nc.z.greaterThanEqual(int(0)))
                      .and(nc.z.lessThan(int(GRID_RES)));
                    If(inb, () => {
                      const cid = cellId(nc).toConst();
                      const cnt = atomicLoad(
                        cellCountBuffer.element(cid).get("count"),
                      ).toConst();
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
                            const j = cellIdsBuffer
                              .element(cid.mul(MAX_PER_CELL).add(k))
                              .toConst();
                            const pj = particleBuffer
                              .element(j)
                              .get("predicted");
                            const rij = pi.sub(pj).toVar();
                            const r2 = rij.dot(rij).toVar();
                            If(r2.lessThan(H2).and(r2.greaterThan(1e-12)), () => {
                              body({ j, rij, r2 });
                            });
                          });
                        },
                      );
                    });
                  },
                );
              },
            );
          },
        );
      };

      // 4) λ 계산: 밀도 제약 C_i = ρ_i/ρ0 − 1, λ_i = −C_i/(Σ|∇C|²+ε)
      lambdaKernel = Fn(() => {
        If(int(instanceIndex).lessThan(pourCountUniform), () => {
          const pi = particleBuffer
            .element(instanceIndex)
            .get("predicted")
            .toConst();
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
            const vj = pj
              .get("predicted")
              .sub(pj.get("position"))
              .div(dtUniform);
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
        new THREE.IcosahedronGeometry(PARTICLE_R, 2).deleteAttribute("uv"),
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

    function setupGlass() {
      const curve = new THREE.CatmullRomCurve3(
        glass.profile.map(([r, y]) => new THREE.Vector3(r, y, 0)),
        false,
        "centripetal",
        0.5,
      );
      const pts = curve
        .getPoints(260)
        .map((p) => new THREE.Vector2(Math.max(p.x, 0.0006), p.y));
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
      glassMesh = new THREE.Mesh(geometry, material);
      glassMesh.scale.setScalar(glass.worldScale);
      glassMesh.position.set(0, glass.worldY, 0);
      glassMesh.frustumCulled = false;
      scene.add(glassMesh);
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
        [bore, H], // 입구(내경 bore)
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
        DOMAIN_MIN[2] + PIVOT[2] * DOMAIN_SCALE,
      );
      bottleGroup = new THREE.Group();
      bottleGroup.position.copy(pivotWorld);
      bottlePivotWorld = pivotWorld.clone();
      // 병은 world (0.42, -0.06, 0) 에 서 있음 → 그룹(피벗) 기준 상대 위치로.
      mesh.position.set(
        0.42 - pivotWorld.x,
        glass.worldY - pivotWorld.y,
        0.0 - pivotWorld.z,
      );
      bottleGroup.add(mesh);
      // 입구(주둥이) 마커 — 병 로컬 (0, H, 0) = 병 끝 중심(bore). 기울면 함께 이동.
      bottleSpout = new THREE.Object3D();
      bottleSpout.position.set(
        mesh.position.x,
        mesh.position.y + 0.3 * BOTTLE_M,
        mesh.position.z,
      );
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
    const GLASS_WINE_BOTTOM = 1.36; // 컵 내부 바닥(프로파일 y)
    const GLASS_WINE_FILL = 1.98; // 수면(프로파일 y) — 볼 하단~중간(자연스러운 양)
    let liquidMesh: THREE.Mesh;
    let liquidGeo: THREE.BufferGeometry;
    let glassGroup: THREE.Group; // 유리+액체를 함께 기울이는 그룹(드래그 스월)
    // 액체 그리드(파라메트릭): 각도 L_SEG × (벽 L_NV + 표면 L_NS). 매 프레임
    // 각도별 수위선을 구해 "기운 잔 안 + 수평면 아래"로 다시 채운다(강체 아님).
    const L_SEG = 96;
    const L_NV = 20; // 벽(바닥→수위선) 세로 분할
    const L_NS = 8; // 표면(수위선→중심) 분할
    const L_PPC = L_NV + 1 + L_NS; // 컬럼당 정점 수
    const L_COS: number[] = [];
    const L_SIN: number[] = [];
    for (let i = 0; i <= L_SEG; i++) {
      const ang = (i / L_SEG) * Math.PI * 2;
      L_COS.push(Math.cos(ang));
      L_SIN.push(Math.sin(ang));
    }
    // biome-ignore lint/suspicious/noExplicitAny: BufferAttribute
    let liquidPosAttr: any;
    // Beer–Lambert: 와인 뒷면 거리 버퍼(두께=back−front) + 뒷면 재질 + 본 재질.
    // biome-ignore lint/suspicious/noExplicitAny: TSL RT/Material
    let wineThickRT: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL material
    let wineBackMat: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL material
    let liquidBodyMat: any;
    let liqV0 = 0; // 목표 부피(upright 기준) — 기울여도 이만큼 유지
    let liqH = GLASS_WINE_FILL; // 현재 수면 높이(부피 보존으로 조절)
    let liqVol = 0; // 이번 rebuild 의 부피
    let liqFoot = 1; // 수면 수평 단면적(dV/dH ≈ 이 값)
    // 스월 상태(WineGlass.tsx 방식 이식): 드래그로 잔을 기울이고, 액체 수면은
    // 월드 수평(중력)을 유지 → 잔 벽을 타고 출렁. 관성 진동(a)으로 넘실.
    // 슬로싱: 수면 기울기(sloshX,Z)=2D 감쇠 진동자. 마우스 움직임이 구동 →
    // 원으로 흔들면 기울기가 세차(회전)해 수면 크레스트가 돌고, 멈추면 잦아듦.
    // 잔은 세운 채, 와인 표면만 기울어 돈다(실제 스월).
    let sloshX = 0;
    let sloshZ = 0;
    let sloshVX = 0;
    let sloshVZ = 0;
    // 마우스 = 잔 제어. 잔은 마우스 오프셋을 추종해 기울고, 놓으면 세워진다.
    // 와인 슬로싱은 잔의 움직임(속도)에 구동 → 놓으면 잔은 멈추고 와인만 출렁.
    let mStartX = 0;
    let mStartY = 0;
    let mCurX = 0;
    let mCurY = 0;
    let gTiltX = 0; // 잔 기울기(마우스 추종)
    let gTiltZ = 0;
    let gPrevX = 0; // 이전 프레임 잔 기울기(속도 계산)
    let gPrevZ = 0;
    let swDragging = false;
    // 클릭(거의 안 움직임) → 자동 스월 3바퀴(일관된 동작 보기용).
    let autoSwirl = false;
    let autoSwirlT = 0;
    let downX = 0;
    let downY = 0;

    // 고정 토폴로지 그리드 생성(정점 위치는 rebuildLiquid 가 매 프레임 채움).
    function buildLiquid() {
      const nCol = L_SEG + 1;
      liquidGeo = new THREE.BufferGeometry();
      liquidPosAttr = new THREE.BufferAttribute(
        new Float32Array(nCol * L_PPC * 3),
        3,
      );
      liquidGeo.setAttribute("position", liquidPosAttr);
      const idx: number[] = [];
      for (let i = 0; i < L_SEG; i++)
        for (let r = 0; r < L_PPC - 1; r++) {
          const a = i * L_PPC + r;
          const b = (i + 1) * L_PPC + r;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      liquidGeo.setIndex(idx);
      rebuildLiquid(0, 1, 0, GLASS_WINE_FILL, 0); // 초기(수직) 채움
    }

    // 각도별 수위선(벽∩수평면)을 구해 잔 내부를 수평면 아래로 채운다. m1,m5,m9 는
    // glassGroup 회전행렬 y행 → 수평면을 액체 로컬 프레임의 기운 평면으로 표현.
    // K: 회전 오목 포물면 계수(스월 세기). 표면 = 평면 + K·r²(벽 쪽 차오름).
    function rebuildLiquid(
      m1: number,
      m5: number,
      m9: number,
      H0: number,
      K: number,
    ) {
      const arr = liquidPosAttr.array as Float32Array;
      const m5s = m5 || 1;
      const dPhi = (Math.PI * 2) / L_SEG;
      let foot = 0;
      for (let i = 0; i <= L_SEG; i++) {
        const c = L_COS[i];
        const s = L_SIN[i];
        // 수위선 py_w: 벽(r=innerRadiusAt(py))이 표면(평면+포물)과 만나는 높이.
        let pw = H0 / m5s;
        for (let it = 0; it < 5; it++) {
          const rr = Math.max(
            innerRadiusAt(Math.max(GLASS_WINE_BOTTOM, Math.min(pw, 2.91))),
            0.0006,
          );
          pw = (H0 - m1 * rr * c - m9 * rr * s) / m5s + K * rr * rr;
        }
        pw = Math.max(GLASS_WINE_BOTTOM + 0.02, Math.min(pw, 2.91));
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
        // 표면: 수위선→중심(평면 + 포물면)
        for (let k = 1; k <= L_NS; k++) {
          const r = rw * (1 - k / L_NS);
          const px = r * c;
          const pz = r * s;
          arr[base] = px;
          arr[base + 1] = (H0 - m1 * px - m9 * pz) / m5s + K * r * r;
          arr[base + 2] = pz;
          base += 3;
        }
      }
      liquidPosAttr.needsUpdate = true;
      liquidGeo.computeVertexNormals();
      liqFoot = foot;
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
      liqVol = Math.abs(vol) / 6;
    }

    function setupGlassWine() {
      buildLiquid();
      liqV0 = liqVol; // upright 부피를 목표로(기울여도 유지)
      liqH = GLASS_WINE_FILL;
      // 액체 재질: 불투명(유리 뒤로 확실히 보임) + 물리적 Beer–Lambert 흡수.
      // 색을 프레넬로 흉내내지 않고, 시선이 와인을 실제로 통과하는 두께 d 로부터
      // exp(−absorb·d) 로 계산 → 두꺼운 곳(수면 아래·중심) 검붉게, 얇은 가장자리
      // 밝게가 물리적으로 나온다. 두께 = 뒷면거리(wineThickRT) − 앞면거리.
      const bodyMat = new A.MeshPhysicalNodeMaterial({
        color: new THREE.Color(0x080103), // 디퓨즈 최소(색은 흡수가 담당)
        roughness: 0.15, // 매끈 → 젖은 표면 광택
        metalness: 0,
        side: THREE.DoubleSide,
      });
      bodyMat.envMapIntensity = 0.25; // 광택(이제 따뜻한 스튜디오 반사라 자연스러움)
      bodyMat.emissiveNode = Fn(() => {
        const frontDist = positionView.z.negate();
        const backDist = texture(wineThickRT.texture, screenUV).x;
        // 벽 두께(back−front, 최소 0.045). 수면(윗면)은 FrontSide 로 두께가 0 이
        // 되므로, 아래로 깊은 시선을 반영해 큰 두께(0.28)로 강제 → 어두운 수면.
        const tWall = backDist.sub(frontDist).max(0.045);
        const surfaceMask = normalWorld.y.abs();
        const t = mix(tWall, float(0.28), surfaceMask).toVar();
        // Beer–Lambert exp(-k·d). 흡수계수는 uniform(프리셋 버튼으로 실시간 변경).
        const col = vec3(
          t.mul(absorbU.x).negate().exp(),
          t.mul(absorbU.y).negate().exp(),
          t.mul(absorbU.z).negate().exp(),
        ).toVar();
        // 밝은(옅은 와인) 값을 압축 → 자체발광 형광 느낌 완화(어두운 레드는 거의
        // 그대로). 옅은 와인은 빛나기보다 은은히 비치게.
        return col.div(col.add(0.85));
      })();
      liquidBodyMat = bodyMat;
      // 뒷면(먼 면) 거리 — winding 상 FrontSide 가 먼 면. view 거리 R 채널에.
      wineBackMat = new A.MeshBasicNodeMaterial();
      wineBackMat.colorNode = Fn(() => vec4(positionView.z.negate(), 0, 0, 1))();
      wineBackMat.side = THREE.FrontSide;
      void frontFacing;
      liquidMesh = new THREE.Mesh(liquidGeo, bodyMat);
      liquidMesh.scale.setScalar(glass.worldScale);
      liquidMesh.frustumCulled = false;
      // 유리+액체를 그룹에 담아 함께 기울인다(드래그 스월).
      glassGroup = new THREE.Group();
      glassGroup.position.set(0, glass.worldY, 0);
      scene.remove(glassMesh);
      glassMesh.position.set(0, 0, 0); // 그룹 로컬 원점
      glassGroup.add(glassMesh);
      glassGroup.add(liquidMesh);
      scene.add(glassGroup);
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
        dir.multiplyScalar(1 / len),
      );
    }

    function setupParticles() {
      if (FLUID_ON) {
        setupBuffers();
        setupUniforms();
        setupComputeShaders();
        setupMesh();
      }
      setupGlass();
      setupBottle();
      if (!FLUID_ON) {
        setupGlassWine(); // 표면·부피 기반 잔 와인
        setupStream(); // 붓기 물줄기
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
        // ── 스월링 ── 드래그로 잔(그룹)을 기울이고, 액체 수면은 월드 수평 유지.
        const dt = 1 / 60;
        // 잔 = 마우스 추종. 드래그 시작점 기준 오프셋으로 기울고, 놓으면 세워진다.
        const GAMP = 0.007; // px → rad
        const GMAX = 0.32;
        let gtx = 0;
        let gtz = 0;
        if (autoSwirl) {
          // 자동 스월: 잔 기울기를 원으로 3바퀴(진폭 ramp in/out).
          const TOTAL = 2.0;
          const ROT = 3;
          const ph = (2 * Math.PI * ROT * autoSwirlT) / TOTAL;
          const env = Math.max(
            0,
            Math.min(autoSwirlT / 0.3, 1) *
              Math.min((TOTAL - autoSwirlT) / 0.4, 1),
          );
          const amp = GMAX * 0.85 * env;
          gtx = amp * Math.cos(ph);
          gtz = amp * Math.sin(ph);
          autoSwirlT += dt;
          if (autoSwirlT >= TOTAL) autoSwirl = false;
        } else if (swDragging) {
          // 마우스 위=잔 먼쪽, 아래=가까운쪽(더 자연스러움) → Y 부호 반전.
          gtx = Math.max(-GMAX, Math.min(GMAX, (mStartY - mCurY) * GAMP));
          gtz = Math.max(-GMAX, Math.min(GMAX, (mCurX - mStartX) * GAMP));
        }
        // 자동 스월 중엔 잔이 프로그램대로 돌게 빠르게 추종.
        const gEase = swDragging || autoSwirl ? 0.5 : 0.14;
        gTiltX += (gtx - gTiltX) * gEase;
        gTiltZ += (gtz - gTiltZ) * gEase;
        // 잔 기울기 속도 → 와인 슬로싱 구동. 잔을 움직이면 와인이 출렁이고,
        // 놓으면 잔은 세워지며 와인만 관성으로 계속 출렁이다 잦아든다.
        const gvx = (gTiltX - gPrevX) / dt;
        const gvz = (gTiltZ - gPrevZ) / dt;
        gPrevX = gTiltX;
        gPrevZ = gTiltZ;
        const OMEGA = 8.0;
        const ZETA = 0.055; // 감쇠 낮춤 — 더 오래·크게 출렁
        const COUPLE = 2.7; // 잔 움직임 → 와인 슬로싱 결합↑(세게 흔들면 크게)
        const SLOSH_MAX = 0.78; // 최대 수면 기울기↑ — 세게 흔들수록 더 세워짐
        sloshVX += (-(OMEGA * OMEGA) * sloshX - 2 * ZETA * OMEGA * sloshVX) * dt - COUPLE * gvz * dt;
        sloshVZ += (-(OMEGA * OMEGA) * sloshZ - 2 * ZETA * OMEGA * sloshVZ) * dt - COUPLE * gvx * dt;
        sloshX = Math.max(-SLOSH_MAX, Math.min(SLOSH_MAX, sloshX + sloshVX * dt));
        sloshZ = Math.max(-SLOSH_MAX, Math.min(SLOSH_MAX, sloshZ + sloshVZ * dt));
        // 잔 기울기 적용(마우스 추종).
        glassGroup.rotation.set(gTiltX, 0, gTiltZ);
        glassGroup.updateMatrix();
        // 와인 수면 = 월드 (수평 + 슬로싱 기울기). 잔이 기울어도(회전 R) 로컬
        // 프레임에서 그 월드 평면을 표현하도록 계수 계산. a,b=슬로싱 월드 기울기.
        const el = glassGroup.matrix.elements;
        const a = sloshX;
        const b = sloshZ;
        const M1 = el[1] - a * el[0] - b * el[2];
        const M5 = el[5] - a * el[4] - b * el[6];
        const M9 = el[9] - a * el[8] - b * el[10];
        // 회전 오목 포물면: 스월 세기(수면 기울기 크기)에 비례해 벽 쪽 차오름.
        const swirlMag = Math.hypot(sloshX, sloshZ);
        const K = swirlMag * 1.1;
        for (let it = 0; it < 4; it++) {
          rebuildLiquid(M1, M5, M9, liqH, K);
          liqH += (liqV0 - liqVol) / (liqFoot || 1);
          liqH = Math.max(GLASS_WINE_BOTTOM + 0.1, Math.min(liqH, 2.7));
        }
        // 와인 뒷면 거리 → wineThickRT (Beer–Lambert 두께용). 유리·병·배경 끔.
        const savedBg = scene.background;
        scene.background = null;
        glassMesh.visible = false;
        liquidMesh.material = wineBackMat;
        renderer.setRenderTarget(wineThickRT);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.render(scene, camera);
        scene.background = savedBg;
        glassMesh.visible = true;
        liquidMesh.material = liquidBodyMat;
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
      glassMesh.visible = false;
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      glassMesh.visible = true;
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
              `[wine] t=${t}s vAvg=${(sumV / N).toFixed(4)} vMax=${maxV.toFixed(3)} leaked=${leaked}/${N} comY=${(comY / N).toFixed(4)} dAvg=${(sumD / N).toFixed(0)}`,
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
        10,
      );
      // 병(큰 편)이 옆에 있으니 줌아웃 + 잔·병 사이를 타깃으로.
      camera.position.set(-1.9, 1.7, -1.9);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.minDistance = 1;
      controls.maxDistance = 5;
      controls.maxPolarAngle = Math.PI * 0.5;
      controls.target.set(0.25, 0.55, 0);
      controls.enableRotate = false; // 드래그는 카메라 회전이 아니라 스월(잔 기울임)
      controls.enablePan = false;

      const hdrLoader = new UltraHDRLoader().setPath("/textures/equirectangular/");
      const hdrTexture = await hdrLoader.loadAsync("royal_esplanade_2k.hdr.jpg");
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = hdrTexture; // 배경은 따뜻한 블러 유지
      scene.backgroundBlurriness = 0.5;
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
          const k = Math.exp(
            -((uu - 0.32) ** 2 / 0.02 + (vv - 0.74) ** 2 / 0.012),
          );
          r += k * 2.4;
          g += k * 2.0;
          bl += k * 1.5;
          // 필(반대편, 약하게)
          const f = Math.exp(
            -((uu - 0.82) ** 2 / 0.05 + (vv - 0.58) ** 2 / 0.04),
          );
          r += f * 0.7;
          g += f * 0.58;
          bl += f * 0.5;
          const i = (y * ew + x) * 4;
          edata[i] = r;
          edata[i + 1] = g;
          edata[i + 2] = bl;
          edata[i + 3] = 1;
        }
      }
      const studioEnv = new THREE.DataTexture(
        edata,
        ew,
        eh,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      studioEnv.mapping = THREE.EquirectangularReflectionMapping;
      studioEnv.needsUpdate = true;
      scene.environment = studioEnv;

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
              const w = du
                .greaterThan(0.001)
                .select(float(ws).mul(wr), float(0));
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
      const tanF = Math.tan(((40 * Math.PI) / 180) / 2); // fov 40°
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
              depth.negate(),
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
          const fres = pow(
            float(1).sub(normal.dot(viewDir).max(0.0)),
            3.0,
          );
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
      controls.update();
      if (!disposed) renderer.setAnimationLoop(render);
    }

    init();

    return () => {
      disposed = true;
      window.removeEventListener("resize", onWindowResize);
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  }, []);

  return <div ref={ref} style={{ width: "100vw", height: "100vh" }} />;
}
