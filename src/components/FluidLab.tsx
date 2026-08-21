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
  cross,
  exp,
  float,
  instanceIndex,
  instancedArray,
  int,
  ivec3,
  normalize,
  positionView,
  pow,
  screenUV,
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
export default function FluidLab() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    // biome-ignore lint/suspicious/noExplicitAny: TSL/webgpu
    const A = THREE as any;

    let renderer: THREE.WebGPURenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controls: OrbitControls;
    let disposed = false;
    let frameCount = 0;

    const timer = new THREE.Timer();
    timer.connect(document);

    const params = { particleCount: 8192 * 2 }; // 16384
    const N = params.particleCount;

    // ── PBF 파라미터 (물리는 coord 0~1 공간) ──────────────────────────
    const H = 0.045; // smoothing radius (커널 반경)
    const H2 = H * H;
    const GRID_RES = Math.ceil(1 / H); // 해시 그리드 해상도
    const CELL_COUNT = GRID_RES ** 3;
    const MAX_PER_CELL = 64; // 셀당 최대 입자
    const SOLVER_ITER = 8; // PBF solver 반복
    const POLY6 = 315 / (64 * Math.PI * H ** 9); // 밀도 커널 계수
    const SPIKY = 45 / (Math.PI * H ** 6); // 그래디언트 커널 계수
    const EPS_RELAX = 100.0; // λ 분모 relaxation
    const C_XSPH = 2.0; // XSPH 점성 계수 (속도 감쇠)
    // 표면장력(s_corr): 표면 입자를 응집시켜 요동 억제 + 벽 코팅.
    const SCORR_K = 0.00003; // 표면장력 강도
    const DELTA_Q2 = (0.2 * H) ** 2; // (0.2·H)² 기준 거리²
    const POLY6_DQ = POLY6 * (H2 - DELTA_Q2) ** 3; // poly6(ΔQ²)
    // coord 스케일 중력 (MLS-MPM 과 동일 스케일: 9.81²/gridSize)
    const GRAVITY = -(9.81 * 9.81) / 64;

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
    const FLUID_SCALE = cubeSpanProfile * glass.worldScale;
    const FLUID_Y = glass.bowlBottomY * glass.worldScale + glass.worldY;

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
    let dtUniform: any, restDensityUniform: any, dampUniform: any;
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
    let fluidScene: THREE.Scene;
    // biome-ignore lint/suspicious/noExplicitAny: TSL RenderTarget/QuadMesh
    let depthRT: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let blurRT: any;
    // biome-ignore lint/suspicious/noExplicitAny: TSL
    let blurQuad: any;
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
      for (let i = 0; i < N; i++) {
        // 초기 입자를 볼 프로파일 안에 배치.
        const cy = Math.random();
        const rMax = bowlRadiusAtCoordY(cy) * 0.9;
        const rr = Math.sqrt(Math.random()) * rMax;
        const ang = Math.random() * Math.PI * 2;
        arr[i * STRIDE] = 0.5 + rr * Math.cos(ang);
        arr[i * STRIDE + 1] = cy;
        arr[i * STRIDE + 2] = 0.5 + rr * Math.sin(ang);
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
      restDensityUniform = uniform(50000);
      // 점성 감쇠(substep당). 잔이 멈춰 있을 때 무작위 지터를 잦아들게 한다.
      // 와인의 점성 = 물리적으로 옳은 소산. 붓기는 중력이 재가속하니 회복.
      dampUniform = uniform(0.9);
    }

    function setupComputeShaders() {
      // 잔 볼 내벽 안으로 (x,z) 반경을 조이는 SDF 경계 (재활용).
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
        // 위·아래 grid 경계
        result.assign(clamp(result, vec3(0.001), vec3(0.999)));
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
        const c = ivec3(
          clamp(p.mul(GRID_RES), float(0), float(GRID_RES - 1)),
        );
        return c;
      };
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const cellId = (c: any) =>
        c.x.add(c.y.mul(GRID_RES)).add(c.z.mul(GRID_RES * GRID_RES));

      // 1) 셀 카운트 초기화
      clearCellKernel = Fn(() => {
        atomicStore(cellCountBuffer.element(instanceIndex).get("count"), 0);
      })()
        .compute(CELL_COUNT)
        .setName("clearCell");

      // 2) 예측: v += g·dt, predicted = x + v·dt
      predictKernel = Fn(() => {
        const p = particleBuffer.element(instanceIndex);
        const v = p.get("velocity").toVar();
        v.y.addAssign(float(GRAVITY).mul(dtUniform));
        const pred = p.get("position").add(v.mul(dtUniform)).toVar();
        pred.assign(clamp(pred, vec3(0.001), vec3(0.999)));
        p.get("velocity").assign(v);
        p.get("predicted").assign(pred);
      })()
        .compute(N)
        .setName("predict");

      // 3) 해시 그리드 빌드 (predicted 기준)
      buildGridKernel = Fn(() => {
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
                      .and(nc.y.lessThan(int(GRID_RES)))
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
      })()
        .compute(N)
        .setName("lambda");

      // 5) 위치 보정 Δp_i = (1/ρ0) Σ (λ_i+λ_j) ∇W, predicted += Δp, 경계
      deltaPKernel = Fn(() => {
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
        pi.assign(clampToBowl(pi));
        p.get("predicted").assign(pi);
      })()
        .compute(N)
        .setName("deltaP");

      // 6) 속도 갱신: v = (predicted − x)/dt, x = predicted
      velocityKernel = Fn(() => {
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
        // 점성 감쇠: 잔류 지터를 잦아들게 (결맞은 운동까지 잡음, XSPH 보완)
        vi.mulAssign(dampUniform);
        p.get("velocity").assign(vi);
        p.get("position").assign(pred);
      })()
        .compute(N)
        .setName("velocity");
    }

    function setupMesh() {
      // SSFR 1단계: 입자를 sphere 로 렌더해 '뷰 공간 깊이'를 depthRT 에 쓴다.
      const geometry = BufferGeometryUtils.mergeVertices(
        new THREE.IcosahedronGeometry(0.03, 2).deleteAttribute("uv"),
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
      particleMesh.scale.setScalar(FLUID_SCALE);
      particleMesh.position.set(-FLUID_SCALE * 0.5, FLUID_Y, -FLUID_SCALE * 0.5);
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
      // PBF substep: 한 프레임을 작은 스텝으로 나눠 위치 보정을 작게 → 튐↓
      const PBF_SUBSTEPS = 2;
      dtUniform.value = deltaTime / PBF_SUBSTEPS;
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
      // SSFR 1단계: 입자 깊이를 depthRT 에 렌더 → grayscale 로 화면 확인
      renderer.setRenderTarget(depthRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(fluidScene, camera);
      // 깊이 bilateral blur: depthRT → blurRT (개별 입자 요철 제거)
      renderer.setRenderTarget(blurRT);
      renderer.clear();
      blurQuad.render(renderer);
      // 배경 HDR + 유리잔 렌더 → 그 위에 유체 표면(알파) 합성
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      renderer.autoClear = false; // 배경을 지우지 않고 그 위에 합성
      surfaceQuad.render(renderer);
      renderer.autoClear = true;

      // 디버그 로그: 속도·밀도·대류·볼 밖 입자 (MLS-MPM 여정에서 만든 지표)
      frameCount++;
      if (frameCount % 20 === 0) {
        const t = (frameCount / 60).toFixed(1);
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
            let outGlass = 0;
            let vrAbs = 0;
            let vrNet = 0; // 부호 있는 평균 반경 속도(+팽창/−수축) — 결맞은 진동 진단
            let vyNet = 0; // 부호 있는 평균 수직 속도 — 위아래 출렁임 진단
            const wallCoord =
              (glass.wallThickness * glass.worldScale) / FLUID_SCALE;
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
              const cy = Math.max(0, Math.min(1, py));
              const rInner = bowlRadiusAtCoordY(cy);
              const rr = Math.hypot(px - 0.5, pz - 0.5);
              if (rr > rInner + wallCoord) outGlass++;
              vyNet += vy;
              if (rr > 1e-4) {
                const vr = (vx * (px - 0.5) + vz * (pz - 0.5)) / rr;
                vrAbs += Math.abs(vr);
                vrNet += vr;
              }
            }
            console.log(
              `[speed] t=${t}s vAvg=${(sumV / N).toFixed(4)} vMax=${maxV.toFixed(3)} | vrAbs=${(vrAbs / N).toFixed(4)} vrNet=${(vrNet / N).toFixed(4)} vyNet=${(vyNet / N).toFixed(4)} | dAvg=${(sumD / N).toFixed(1)} out=${outGlass}`,
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

      const hdrLoader = new UltraHDRLoader().setPath("/textures/equirectangular/");
      const hdrTexture = await hdrLoader.loadAsync("royal_esplanade_2k.hdr.jpg");
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = hdrTexture;
      scene.backgroundBlurriness = 0.5;
      scene.environment = hdrTexture;

      // SSFR: 유체 입자만 담는 씬 + 깊이 RenderTarget + 화면 표면 quad
      fluidScene = new THREE.Scene();
      const dpr = renderer.getPixelRatio();
      const rtW = Math.floor(container.clientWidth * dpr);
      const rtH = Math.floor(container.clientHeight * dpr);
      depthRT = new THREE.RenderTarget(rtW, rtH);
      depthRT.texture.type = THREE.HalfFloatType;
      blurRT = new THREE.RenderTarget(rtW, rtH);
      blurRT.texture.type = THREE.HalfFloatType;
      const texel = new THREE.Vector2(1 / rtW, 1 / rtH);

      // SSFR 2.5단계: 깊이 bilateral blur (개별 입자 요철 제거)
      blurQuad = new A.QuadMesh(new A.MeshBasicNodeMaterial());
      blurQuad.material.colorNode = Fn(() => {
        const uv = screenUV;
        const dCen = texture(depthRT.texture, uv).x.toVar();
        const out = dCen.toVar();
        If(dCen.greaterThan(0.001), () => {
          const sum = dCen.toVar();
          const wsum = float(1).toVar();
          const R = 6;
          const sigR2 = 2 * 0.04 * 0.04; // 깊이 차(range) 분산
          for (let i = -R; i <= R; i++) {
            for (let j = -R; j <= R; j++) {
              if (i === 0 && j === 0) continue;
              const du = texture(
                depthRT.texture,
                uv.add(vec2(i * texel.x, j * texel.y)),
              ).x.toVar();
              const dd = du.sub(dCen);
              const wr = exp(dd.mul(dd).div(-sigR2));
              const ws = Math.exp(-(i * i + j * j) / (2 * (R * 0.5) ** 2));
              const w = du
                .greaterThan(0.001)
                .select(float(ws).mul(wr), float(0));
              sum.addAssign(du.mul(w));
              wsum.addAssign(w);
            }
          }
          out.assign(sum.div(wsum));
        });
        return vec4(out, 0, 0, 1);
      })();

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
          const dR = texture(blurRT.texture, uv.add(vec2(texel.x, 0))).x;
          const dU = texture(blurRT.texture, uv.add(vec2(0, texel.y))).x;
          const pC = vp(uv, dC);
          const pR = vp(uv.add(vec2(texel.x, 0)), dR);
          const pU = vp(uv.add(vec2(0, texel.y)), dU);
          const normal = normalize(cross(pR.sub(pC), pU.sub(pC)));
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
