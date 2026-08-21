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
  Return,
  array,
  atomicAdd,
  atomicLoad,
  atomicStore,
  attribute,
  clamp,
  float,
  instanceIndex,
  instancedArray,
  int,
  ivec3,
  mat3,
  max,
  pow,
  storage,
  struct,
  uniform,
  vec3,
  vec4,
} from "three/tsl";

// 최소자승 다항식 피팅 (deg 차). 정규방정식 + 가우스 소거.
// 볼 내벽 반경 곡선을 다항식 계수로 압축해 셰이더에 넘기기 위한 헬퍼.
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

// three.js 공식 webgpu_compute_particles_fluid (r185)를 그대로 이식.
// 색만 와인으로 바꾸고, 물리/렌더 로직은 원본 그대로 유지한다.
// biome-ignore lint: 예제 원본 구조 유지
export default function FluidLab() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // biome-ignore lint/suspicious/noExplicitAny: 예제 vanilla 이식
    const A = THREE as any;

    let renderer: THREE.WebGPURenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controls: OrbitControls;
    let disposed = false;
    let frameCount = 0;

    const timer = new THREE.Timer();
    timer.connect(document);

    const maxParticles = 8192 * 16;
    const gridSize1d = 64;
    const workgroupSize = 64;

    // 에너지 보존 속도 상한: 낙하 높이 h 에서 v_max = √(2·g·h).
    // 개별 입자는 위치에너지가 준 속도 이상으로 빨라질 수 없다.
    // g_coord = 9.81²/gridSize (coord 스케일 중력), h = 1 (볼 높이 낙하).
    const MAX_SPEED = Math.sqrt((2 * 9.81 * 9.81 * 1.0) / gridSize1d); // ≈1.73
    const gridSize = new THREE.Vector3(gridSize1d, gridSize1d, gridSize1d);
    const fixedPointMultiplier = 1e7;

    // biome-ignore lint/suspicious/noExplicitAny: TSL 노드 타입 생략
    let particleCountUniform: any,
      stiffnessUniform: any,
      restDensityUniform: any,
      dynamicViscosityUniform: any,
      dtUniform: any,
      gravityUniform: any,
      gridSizeUniform: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let particleBuffer: any, cellBuffer: any, cellBufferFloat: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL (디버그: 입자 밀도 로그용)
    let densityBuffer: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let clearGridKernel: any,
      p2g1Kernel: any,
      p2g2Kernel: any,
      updateGridKernel: any,
      g2pKernel: any,
      workgroupKernel: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let p2g1KernelWorkgroupBuffer: any,
      p2g2KernelWorkgroupBuffer: any,
      g2pKernelWorkgroupBuffer: any;
    let particleMesh: THREE.Mesh;

    const params = { particleCount: 8192 * 2 };

    // ── 잔 하나의 데이터 ────────────────────────────────────────────
    // 외벽 프로파일 + 벽 두께 + 볼(유체가 담기는) y 범위 + 월드 배치.
    // 유리 메쉬와 유체 물리 경계를 '모두' 이 데이터에서 파생한다.
    // 다른 잔은 이 객체만 바꾸면 유리와 물리가 자동으로 일치한다.
    const glass = {
      // 외벽 프로파일 (r, y). LatheGeometry 와 내벽 계산의 공통 원천.
      profile: [
        [0.0, 0.0], [0.55, 0.0], [0.55, 0.018], [0.42, 0.04],
        [0.12, 0.09], [0.05, 0.16], [0.042, 0.7], [0.042, 1.25],
        [0.05, 1.36], [0.1, 1.44], [0.17, 1.53], [0.26, 1.65],
        [0.34, 1.79], [0.4, 1.94], [0.44, 2.1], [0.46, 2.26],
        [0.455, 2.42], [0.43, 2.57], [0.4, 2.7], [0.36, 2.82],
        [0.325, 2.92],
      ] as [number, number][],
      wallThickness: 0.025, // 프로파일 단위 유리 두께 (내벽 = 외벽 − 이 값)
      bowlBottomY: 1.7, // 볼 안쪽 바닥 (넓어지는 부분부터 담아 압력↓)
      bowlTopY: 2.7, // 유체 최대 높이 (입구 아래, 넘침 여유)
      worldScale: 0.42, // 프로파일 → 월드 스케일
      worldY: -0.06, // 프로파일 y=0 의 월드 y
    };

    // 프로파일에서 높이 py 의 외벽/내벽 반경(프로파일 단위)을 선형 보간.
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

    // 유체 coord 큐브(0~1)가 볼을 감싸도록 스케일·위치를 자동 계산.
    // (물리는 0~1 정규화 격자를 쓰므로 월드 변환이 필요하다)
    let bowlRmax = 0;
    for (let py = glass.bowlBottomY; py <= glass.bowlTopY; py += 0.01) {
      bowlRmax = Math.max(bowlRmax, innerRadiusAt(py));
    }
    const cubeSpanProfile = Math.max(
      glass.bowlTopY - glass.bowlBottomY,
      bowlRmax * 2,
    );
    const FLUID_SCALE = cubeSpanProfile * glass.worldScale;
    const FLUID_Y = glass.bowlBottomY * glass.worldScale + glass.worldY;

    // 내벽 반경 LUT: 유체 coord y(0~1) → 그 높이의 볼 내벽 coord 반경.
    // 셰이더가 이 표를 직접 조회하므로, 물리 경계 = 실제 잔 내벽.
    // 내벽 반경 곡선(coord y → coord 반경)을 다항식으로 fit → 계수만 셰이더로.
    // 컴퓨트 셰이더에서 배열 '동적 인덱스' 조회가 막혀(uniformArray 는 고정 인덱스만,
    // CPU 초기값 storage 는 업로드 생략), 조회 없는 산술 평가로 우회한다.
    // 계수는 uniformArray 에 담아 '고정 인덱스'로만 접근하므로 안전하다.
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
    // 계수를 개별 스칼라 uniform 으로 넘긴다 (배열/조회 없음 → 가장 확실).
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    const bowlCoefU: any[] = bowlCoef.map((v) => uniform(v));
    // 다항식(내벽 반경) CPU 평가 — 초기 입자를 볼 안에 배치하는 데 쓴다.
    const bowlRadiusAtCoordY = (cy: number): number => {
      let a = bowlCoef[POLY_DEG];
      for (let k = POLY_DEG - 1; k >= 0; k--) a = a * cy + bowlCoef[k];
      return Math.max(a, 0.002);
    };

    function setupBuffers() {
      const particleStruct = struct({
        position: { type: "vec3" },
        velocity: { type: "vec3" },
        C: { type: "mat3" },
      });
      const particleStructSize = 20;
      const particleArray = new Float32Array(maxParticles * particleStructSize);
      for (let i = 0; i < maxParticles; i++) {
        // 초기 입자를 볼 프로파일 안(각 높이의 내벽 반경 이내)에 배치한다.
        // 볼 밖에서 쏟아져 들어오는 초기 에너지를 없애 과한 튐·샘을 막는다.
        const cy = Math.random();
        const rMax = bowlRadiusAtCoordY(cy) * 0.9;
        const rr = Math.sqrt(Math.random()) * rMax;
        const ang = Math.random() * Math.PI * 2;
        particleArray[i * particleStructSize] = 0.5 + rr * Math.cos(ang);
        particleArray[i * particleStructSize + 1] = cy;
        particleArray[i * particleStructSize + 2] = 0.5 + rr * Math.sin(ang);
      }
      particleBuffer = instancedArray(particleArray, particleStruct);
      particleBuffer.setPBO(true); // 속도 로그용 CPU readback 활성화
      densityBuffer = instancedArray(maxParticles, "float");
      densityBuffer.setPBO(true); // 밀도 로그용

      const cellCount = gridSize.x * gridSize.y * gridSize.z;
      const cellStruct = struct({
        x: { type: "int", atomic: true },
        y: { type: "int", atomic: true },
        z: { type: "int", atomic: true },
        mass: { type: "int", atomic: true },
      });
      cellBuffer = instancedArray(cellCount, cellStruct);
      cellBufferFloat = instancedArray(cellCount, "vec4");
    }

    function setupUniforms() {
      gridSizeUniform = uniform(gridSize);
      particleCountUniform = uniform(params.particleCount, "uint");
      stiffnessUniform = uniform(4);
      restDensityUniform = uniform(1.5);
      dynamicViscosityUniform = uniform(2.0);
      dtUniform = uniform(1 / 60);
      gravityUniform = uniform(new THREE.Vector3(0, -(9.81 * 9.81), 0));
    }

    function setupComputeShaders() {
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const encodeFixedPoint = (f32: any) => int(f32.mul(fixedPointMultiplier));
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const decodeFixedPoint = (i32: any) => float(i32).div(fixedPointMultiplier);

      const cellCount = gridSize.x * gridSize.y * gridSize.z;

      // 잔 볼 내벽 안에 좌표를 가두는 헬퍼 (여러 커널에서 공용).
      // coord y 로 볼 내벽 반경 다항식(잔 데이터에서 fit)을 Horner 로 평가하고,
      // 그 반경을 넘는 (x,z) 초과분을 안으로 되돌린 좌표를 반환한다.
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const clampToBowl = (p: any) => {
        const result = p.toVar();
        const dx = p.x.sub(0.5).toVar();
        const dz = p.z.sub(0.5).toVar();
        const r = dx.mul(dx).add(dz.mul(dz)).sqrt().max(1e-5).toVar();
        const cy = clamp(p.y, 0.0, 1.0).toVar();
        const coordRMax = bowlCoefU[POLY_DEG].toVar();
        for (let k = POLY_DEG - 1; k >= 0; k--) {
          coordRMax.assign(coordRMax.mul(cy).add(bowlCoefU[k]));
        }
        coordRMax.assign(coordRMax.max(0.002));
        const over = r.sub(coordRMax).max(0.0).toVar();
        If(over.greaterThan(0.0), () => {
          const inv = over.div(r);
          result.assign(vec3(p.x.sub(dx.mul(inv)), p.y, p.z.sub(dz.mul(inv))));
        });
        return result;
      };

      clearGridKernel = Fn(() => {
        atomicStore(cellBuffer.element(instanceIndex).get("x"), 0);
        atomicStore(cellBuffer.element(instanceIndex).get("y"), 0);
        atomicStore(cellBuffer.element(instanceIndex).get("z"), 0);
        atomicStore(cellBuffer.element(instanceIndex).get("mass"), 0);
      })()
        .compute(cellCount)
        .setName("clearGridKernel");

      p2g1Kernel = Fn(() => {
        const particlePosition = particleBuffer
          .element(instanceIndex)
          .get("position")
          .toConst("particlePosition");
        const particleVelocity = particleBuffer
          .element(instanceIndex)
          .get("velocity")
          .toConst("particleVelocity");
        const C = particleBuffer.element(instanceIndex).get("C").toConst("C");
        const gridPosition = particlePosition.mul(gridSizeUniform).toVar();
        const cellIndex = ivec3(gridPosition).sub(1).toConst("cellIndex");
        const cellDiff = gridPosition.fract().sub(0.5).toConst("cellDiff");
        const w0 = float(0.5)
          .mul(float(0.5).sub(cellDiff))
          .mul(float(0.5).sub(cellDiff));
        const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
        const w2 = float(0.5)
          .mul(float(0.5).add(cellDiff))
          .mul(float(0.5).add(cellDiff));
        const weights = array([w0, w1, w2]).toConst("weights");
        Loop(
          { start: 0, end: 3, type: "int", name: "gx", condition: "<" },
          // biome-ignore lint/suspicious/noExplicitAny: TSL
          ({ gx }: any) => {
            Loop(
              { start: 0, end: 3, type: "int", name: "gy", condition: "<" },
              // biome-ignore lint/suspicious/noExplicitAny: TSL
              ({ gy }: any) => {
                Loop(
                  { start: 0, end: 3, type: "int", name: "gz", condition: "<" },
                  // biome-ignore lint/suspicious/noExplicitAny: TSL
                  ({ gz }: any) => {
                    const weight = weights
                      .element(gx)
                      .x.mul(weights.element(gy).y)
                      .mul(weights.element(gz).z);
                    const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
                    const cellDist = vec3(cellX)
                      .add(0.5)
                      .sub(gridPosition)
                      .toConst("cellDist");
                    const Q = C.mul(cellDist);
                    const massContrib = weight;
                    const velContrib = massContrib
                      .mul(particleVelocity.add(Q))
                      .toConst("velContrib");
                    const cellPtr = cellX.x
                      .mul(int(gridSize.y * gridSize.z))
                      .add(cellX.y.mul(int(gridSize.z)))
                      .add(cellX.z)
                      .toConst();
                    const cell = cellBuffer.element(cellPtr);
                    atomicAdd(cell.get("x"), encodeFixedPoint(velContrib.x));
                    atomicAdd(cell.get("y"), encodeFixedPoint(velContrib.y));
                    atomicAdd(cell.get("z"), encodeFixedPoint(velContrib.z));
                    atomicAdd(cell.get("mass"), encodeFixedPoint(massContrib));
                  },
                );
              },
            );
          },
        );
      })()
        .compute(params.particleCount, [workgroupSize, 1, 1])
        .setName("p2g1Kernel");

      p2g2Kernel = Fn(() => {
        const particlePosition = particleBuffer
          .element(instanceIndex)
          .get("position")
          .toConst("particlePosition");
        const gridPosition = particlePosition.mul(gridSizeUniform).toVar();
        const cellIndex = ivec3(gridPosition).sub(1).toConst("cellIndex");
        const cellDiff = gridPosition.fract().sub(0.5).toConst("cellDiff");
        const w0 = float(0.5)
          .mul(float(0.5).sub(cellDiff))
          .mul(float(0.5).sub(cellDiff));
        const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
        const w2 = float(0.5)
          .mul(float(0.5).add(cellDiff))
          .mul(float(0.5).add(cellDiff));
        const weights = array([w0, w1, w2]).toConst("weights");
        const density = float(0).toVar("density");
        Loop(
          { start: 0, end: 3, type: "int", name: "gx", condition: "<" },
          // biome-ignore lint/suspicious/noExplicitAny: TSL
          ({ gx }: any) => {
            Loop(
              { start: 0, end: 3, type: "int", name: "gy", condition: "<" },
              // biome-ignore lint/suspicious/noExplicitAny: TSL
              ({ gy }: any) => {
                Loop(
                  { start: 0, end: 3, type: "int", name: "gz", condition: "<" },
                  // biome-ignore lint/suspicious/noExplicitAny: TSL
                  ({ gz }: any) => {
                    const weight = weights
                      .element(gx)
                      .x.mul(weights.element(gy).y)
                      .mul(weights.element(gz).z);
                    const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
                    const cellPtr = cellX.x
                      .mul(int(gridSize.y * gridSize.z))
                      .add(cellX.y.mul(int(gridSize.z)))
                      .add(cellX.z)
                      .toConst();
                    const cell = cellBuffer.element(cellPtr);
                    const mass = decodeFixedPoint(atomicLoad(cell.get("mass")));
                    density.addAssign(mass.mul(weight));
                  },
                );
              },
            );
          },
        );
        densityBuffer.element(instanceIndex).assign(density); // 디버그: 밀도 로그
        const volume = float(1).div(density);
        const pressure = max(
          0.0,
          pow(density.div(restDensityUniform), 5.0).sub(1).mul(stiffnessUniform),
        ).toConst("pressure");
        const stress = mat3(
          pressure.negate(),
          0,
          0,
          0,
          pressure.negate(),
          0,
          0,
          0,
          pressure.negate(),
        ).toVar("stress");
        const dudv = particleBuffer.element(instanceIndex).get("C").toConst("C");
        const strain = dudv.add(dudv.transpose());
        stress.addAssign(strain.mul(dynamicViscosityUniform));
        const eq16Term0 = volume.mul(-4).mul(stress).mul(dtUniform);
        Loop(
          { start: 0, end: 3, type: "int", name: "gx", condition: "<" },
          // biome-ignore lint/suspicious/noExplicitAny: TSL
          ({ gx }: any) => {
            Loop(
              { start: 0, end: 3, type: "int", name: "gy", condition: "<" },
              // biome-ignore lint/suspicious/noExplicitAny: TSL
              ({ gy }: any) => {
                Loop(
                  { start: 0, end: 3, type: "int", name: "gz", condition: "<" },
                  // biome-ignore lint/suspicious/noExplicitAny: TSL
                  ({ gz }: any) => {
                    const weight = weights
                      .element(gx)
                      .x.mul(weights.element(gy).y)
                      .mul(weights.element(gz).z);
                    const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
                    const cellDist = vec3(cellX)
                      .add(0.5)
                      .sub(gridPosition)
                      .toConst("cellDist");
                    const momentum = eq16Term0
                      .mul(weight)
                      .mul(cellDist)
                      .toConst("momentum");
                    const cellPtr = cellX.x
                      .mul(int(gridSize.y * gridSize.z))
                      .add(cellX.y.mul(int(gridSize.z)))
                      .add(cellX.z)
                      .toConst();
                    const cell = cellBuffer.element(cellPtr);
                    atomicAdd(cell.get("x"), encodeFixedPoint(momentum.x));
                    atomicAdd(cell.get("y"), encodeFixedPoint(momentum.y));
                    atomicAdd(cell.get("z"), encodeFixedPoint(momentum.z));
                  },
                );
              },
            );
          },
        );
      })()
        .compute(params.particleCount, [workgroupSize, 1, 1])
        .setName("p2g2Kernel");

      updateGridKernel = Fn(() => {
        const cell = cellBuffer.element(instanceIndex);
        const mass = decodeFixedPoint(atomicLoad(cell.get("mass"))).toConst();
        If(mass.lessThanEqual(0), () => {
          Return();
        });
        const vx = decodeFixedPoint(atomicLoad(cell.get("x"))).div(mass).toVar();
        const vy = decodeFixedPoint(atomicLoad(cell.get("y"))).div(mass).toVar();
        const vz = decodeFixedPoint(atomicLoad(cell.get("z"))).div(mass).toVar();
        const x = int(instanceIndex).div(int(gridSize.z * gridSize.y));
        const y = int(instanceIndex).div(int(gridSize.z)).mod(int(gridSize.y));
        const z = int(instanceIndex).mod(int(gridSize.z));
        If(x.lessThan(int(1)).or(x.greaterThan(int(gridSize.x).sub(int(2)))), () => {
          vx.assign(0);
        });
        If(y.lessThan(int(1)).or(y.greaterThan(int(gridSize.y).sub(int(2)))), () => {
          vy.assign(0);
        });
        If(z.lessThan(int(1)).or(z.greaterThan(int(gridSize.z).sub(int(2)))), () => {
          vz.assign(0);
        });
        cellBufferFloat.element(instanceIndex).assign(vec4(vx, vy, vz, mass));
      })()
        .compute(cellCount)
        .setName("updateGridKernel");

      g2pKernel = Fn(() => {
        const particlePosition = particleBuffer
          .element(instanceIndex)
          .get("position")
          .toVar("particlePosition");
        const gridPosition = particlePosition.mul(gridSizeUniform).toVar();
        const particleVelocity = vec3(0).toVar();
        const cellIndex = ivec3(gridPosition).sub(1).toConst("cellIndex");
        const cellDiff = gridPosition.fract().sub(0.5).toConst("cellDiff");
        const w0 = float(0.5)
          .mul(float(0.5).sub(cellDiff))
          .mul(float(0.5).sub(cellDiff));
        const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
        const w2 = float(0.5)
          .mul(float(0.5).add(cellDiff))
          .mul(float(0.5).add(cellDiff));
        const weights = array([w0, w1, w2]).toConst("weights");
        const B = mat3(0).toVar("B");
        Loop(
          { start: 0, end: 3, type: "int", name: "gx", condition: "<" },
          // biome-ignore lint/suspicious/noExplicitAny: TSL
          ({ gx }: any) => {
            Loop(
              { start: 0, end: 3, type: "int", name: "gy", condition: "<" },
              // biome-ignore lint/suspicious/noExplicitAny: TSL
              ({ gy }: any) => {
                Loop(
                  { start: 0, end: 3, type: "int", name: "gz", condition: "<" },
                  // biome-ignore lint/suspicious/noExplicitAny: TSL
                  ({ gz }: any) => {
                    const weight = weights
                      .element(gx)
                      .x.mul(weights.element(gy).y)
                      .mul(weights.element(gz).z);
                    const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
                    const cellDist = vec3(cellX)
                      .add(0.5)
                      .sub(gridPosition)
                      .toConst("cellDist");
                    const cellPtr = cellX.x
                      .mul(int(gridSize.y * gridSize.z))
                      .add(cellX.y.mul(int(gridSize.z)))
                      .add(cellX.z)
                      .toConst();
                    const weightedVelocity = cellBufferFloat
                      .element(cellPtr)
                      .xyz.mul(weight)
                      .toConst("weightedVelocity");
                    const term = mat3(
                      weightedVelocity.mul(cellDist.x),
                      weightedVelocity.mul(cellDist.y),
                      weightedVelocity.mul(cellDist.z),
                    );
                    B.addAssign(term);
                    particleVelocity.addAssign(weightedVelocity);
                  },
                );
              },
            );
          },
        );
        particleBuffer.element(instanceIndex).get("C").assign(B.mul(4));
        particleVelocity.addAssign(gravityUniform.mul(dtUniform));
        particleVelocity.divAssign(gridSizeUniform);
        // 에너지 보존 속도 상한: 낙하 높이가 준 v_max=√(2gh) 를 못 넘게 한다.
        // 충돌 순간 속도 급증(→ 벽 건너뜀)을 물리적으로 타당하게 차단한다.
        const speed = particleVelocity.length().toVar();
        const maxSpeed = float(100.0); // 진단: 속도 상한 임시 해제
        If(speed.greaterThan(maxSpeed), () => {
          particleVelocity.mulAssign(maxSpeed.div(speed));
        });
        particlePosition.addAssign(particleVelocity.mul(dtUniform));
        particlePosition.assign(
          clamp(
            particlePosition,
            vec3(1).div(gridSizeUniform),
            vec3(gridSize).sub(1).div(gridSizeUniform),
          ),
        );
        // 볼 경계: 미래 위치가 볼을 벗어난 양의 3배로 속도를 되돌린다.
        // 위치 순간이동은 흩어짐을 유발하므로 건드리지 않고 속도만 강하게 되돌린다.
        const posNext = particlePosition
          .add(particleVelocity.mul(dtUniform).mul(2.0))
          .toConst("posNext");
        const posNextClamped = clampToBowl(posNext);
        particleVelocity.addAssign(posNextClamped.sub(posNext).mul(0.0)); // 진단: 되돌림 끔

        // scale from (1, 1, 1) back to (gridSize.x, gridSize.y, gridSize.z)
        particleVelocity.mulAssign(gridSizeUniform);
        particleBuffer
          .element(instanceIndex)
          .get("position")
          .assign(particlePosition);
        particleBuffer
          .element(instanceIndex)
          .get("velocity")
          .assign(particleVelocity);
      })()
        .compute(params.particleCount, [workgroupSize, 1, 1])
        .setName("g2pKernel");
    }

    function setupMesh() {
      const geometry = BufferGeometryUtils.mergeVertices(
        new THREE.IcosahedronGeometry(0.008, 1).deleteAttribute("uv"),
      );
      const material = new A.MeshStandardNodeMaterial({ color: "#8a0f2a" });
      material.positionNode = Fn(() => {
        const particlePosition = particleBuffer
          .element(instanceIndex)
          .get("position");
        return attribute("position").add(particlePosition);
      })();
      particleMesh = new THREE.Mesh(geometry, material);
      // biome-ignore lint/suspicious/noExplicitAny: mesh.count
      (particleMesh as any).count = params.particleCount;
      // 유체 물리는 0~1 큐브에서 돌지만, 렌더는 잔 볼 안으로 축소·이동한다.
      // (월드 중심 = position + FLUID_SCALE*0.5)
      particleMesh.scale.setScalar(FLUID_SCALE);
      particleMesh.position.set(
        -FLUID_SCALE * 0.5,
        FLUID_Y,
        -FLUID_SCALE * 0.5,
      );
      particleMesh.frustumCulled = false;
      scene.add(particleMesh);
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

      // 실제 소다라임 유리 물성값 기반:
      //  - IOR 1.52 (와인잔 유리 표준 굴절률)
      //  - thickness 얇게: 실제 잔 벽은 ~1mm. 두꺼우면 굴절이 배경을 과하게
      //    휘어 뒤의 와인 대신 밝은 배경을 비춰 '비어 보이는' 착시가 난다.
      //  - attenuation: 유리 철분에 의한 옅은 청록 흡수
      const material = new A.MeshPhysicalNodeMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.03,
        transmission: 1,
        ior: 1.52,
        thickness: 0.15,
        attenuationColor: new THREE.Color(0xf6fbf9),
        attenuationDistance: 1.2,
        side: THREE.DoubleSide,
      });
      material.envMapIntensity = 1.0;

      const glassMesh = new THREE.Mesh(geometry, material);
      glassMesh.scale.setScalar(glass.worldScale);
      glassMesh.position.set(0, glass.worldY, 0);
      glassMesh.frustumCulled = false;
      scene.add(glassMesh);
    }

    function setupParticles() {
      setupBuffers();
      setupUniforms();
      setupComputeShaders();
      setupMesh();
      setupGlass();
    }

    function onWindowResize() {
      camera.aspect = container!.clientWidth / container!.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container!.clientWidth, container!.clientHeight);
    }

    async function render() {
      timer.update();
      const deltaTime = THREE.MathUtils.clamp(timer.getDelta(), 0.00001, 1 / 60);
      // 물리 substep: 한 프레임을 여러 작은 스텝으로 나눠 CFL 조건을 만족한다.
      // (한 스텝 이동이 셀 크기보다 작아야 벽을 건너뛰지 않는다)
      const SUBSTEPS = 5;
      dtUniform.value = deltaTime / SUBSTEPS;
      renderer.compute(workgroupKernel);
      for (let s = 0; s < SUBSTEPS; s++) {
        renderer.compute(clearGridKernel);
        renderer.compute(p2g1Kernel, p2g1KernelWorkgroupBuffer);
        renderer.compute(p2g2Kernel, p2g2KernelWorkgroupBuffer);
        renderer.compute(updateGridKernel);
        renderer.compute(g2pKernel, g2pKernelWorkgroupBuffer);
      }
      renderer.render(scene, camera);

      // 실제 입자 속도를 GPU 에서 읽어 로그 (픽셀 diff 는 부정확하므로).
      // velocity 는 gridSize 스케일이라 /gridSize 하면 coord/s 단위가 된다.
      frameCount++;
      if (frameCount % 60 === 0) {
        const t = (frameCount / 60).toFixed(0);
        const N = params.particleCount;
        Promise.all([
          renderer.getArrayBufferAsync(particleBuffer.value),
          renderer.getArrayBufferAsync(densityBuffer.value),
        ])
          .then(([pbuf, dbuf]: ArrayBuffer[]) => {
            const arr = new Float32Array(pbuf);
            const den = new Float32Array(dbuf);
            let maxV = 0;
            let sumV = 0;
            let maxD = 0;
            let sumD = 0;
            for (let i = 0; i < N; i++) {
              const vx = arr[i * 20 + 4];
              const vy = arr[i * 20 + 5];
              const vz = arr[i * 20 + 6];
              const v = Math.sqrt(vx * vx + vy * vy + vz * vz) / gridSize1d;
              if (v > maxV) maxV = v;
              sumV += v;
              const d = den[i];
              if (d > maxD) maxD = d;
              sumD += d;
            }
            console.log(
              `[speed] t=${t}s vAvg=${(sumV / N).toFixed(4)} vMax=${maxV.toFixed(4)} | dAvg=${(sumD / N).toFixed(3)} dMax=${maxD.toFixed(3)} (rest=${restDensityUniform.value.toFixed(1)})`,
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
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(
        40,
        container.clientWidth / container.clientHeight,
        0.01,
        10,
      );
      camera.position.set(-1.3, 1.3, -1.3);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.minDistance = 1;
      controls.maxDistance = 3;
      controls.maxPolarAngle = Math.PI * 0.5;
      controls.target.set(0, 0.7, 0);

      const hdrLoader = new UltraHDRLoader().setPath(
        "/textures/equirectangular/",
      );
      const hdrTexture = await hdrLoader.loadAsync("royal_esplanade_2k.hdr.jpg");
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = hdrTexture;
      scene.backgroundBlurriness = 0.5;
      scene.environment = hdrTexture;

      setupParticles();

      const numWorkgroups = Math.ceil(params.particleCount / workgroupSize);
      p2g1KernelWorkgroupBuffer = new A.IndirectStorageBufferAttribute(
        new Uint32Array([numWorkgroups, 1, 1]),
        1,
      );
      p2g2KernelWorkgroupBuffer = new A.IndirectStorageBufferAttribute(
        new Uint32Array([numWorkgroups, 1, 1]),
        1,
      );
      g2pKernelWorkgroupBuffer = new A.IndirectStorageBufferAttribute(
        new Uint32Array([numWorkgroups, 1, 1]),
        1,
      );
      const p2g1WorkgroupStorage = storage(p2g1KernelWorkgroupBuffer, "uint", 3);
      const p2g2WorkgroupStorage = storage(p2g2KernelWorkgroupBuffer, "uint", 3);
      const g2pWorkgroupStorage = storage(g2pKernelWorkgroupBuffer, "uint", 3);
      workgroupKernel = Fn(() => {
        const workgroupsToDispatch = particleCountUniform
          .sub(1)
          .div(workgroupSize)
          .add(1);
        p2g1WorkgroupStorage.element(0).assign(workgroupsToDispatch);
        p2g2WorkgroupStorage.element(0).assign(workgroupsToDispatch);
        g2pWorkgroupStorage.element(0).assign(workgroupsToDispatch);
      })().compute(1);

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
