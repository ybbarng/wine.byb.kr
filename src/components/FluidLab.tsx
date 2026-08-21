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

    const timer = new THREE.Timer();
    timer.connect(document);

    const maxParticles = 8192 * 16;
    const gridSize1d = 64;
    const workgroupSize = 64;
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

    const params = { particleCount: 8192 * 4 };

    function setupBuffers() {
      const particleStruct = struct({
        position: { type: "vec3" },
        velocity: { type: "vec3" },
        C: { type: "mat3" },
      });
      const particleStructSize = 20;
      const particleArray = new Float32Array(maxParticles * particleStructSize);
      for (let i = 0; i < maxParticles; i++) {
        particleArray[i * particleStructSize] = Math.random() * 0.8 + 0.1;
        particleArray[i * particleStructSize + 1] = Math.random() * 0.8 + 0.1;
        particleArray[i * particleStructSize + 2] = Math.random() * 0.8 + 0.1;
      }
      particleBuffer = instancedArray(particleArray, particleStruct);

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
      stiffnessUniform = uniform(50);
      restDensityUniform = uniform(1.5);
      dynamicViscosityUniform = uniform(0.1);
      dtUniform = uniform(1 / 60);
      gravityUniform = uniform(new THREE.Vector3(0, -(9.81 * 9.81), 0));
    }

    function setupComputeShaders() {
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const encodeFixedPoint = (f32: any) => int(f32.mul(fixedPointMultiplier));
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const decodeFixedPoint = (i32: any) => float(i32).div(fixedPointMultiplier);

      const cellCount = gridSize.x * gridSize.y * gridSize.z;

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

      // 잔 볼을 구의 아래쪽 캡으로 근사한 경계.
      // 유체 좌표(0~1)에서 중심 (0.5, BOWL_CENTER_Y, 0.5), 반경 BOWL_RADIUS 인
      // 구 안쪽에 가둔다. 중력으로 아래 캡(오목한 그릇)에 유체가 고인다.
      // biome-ignore lint/suspicious/noExplicitAny: TSL
      const clampToBowl = (p: any) => {
        const c = vec3(0.5, BOWL_CENTER_Y, 0.5);
        const d = p.sub(c).toVar();
        const len = d.length().toVar();
        const result = p.toVar();
        If(len.greaterThan(BOWL_RADIUS), () => {
          result.assign(c.add(d.div(len).mul(BOWL_RADIUS)));
        });
        return result;
      };

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
        particlePosition.addAssign(particleVelocity.mul(dtUniform));
        particlePosition.assign(
          clamp(
            particlePosition,
            vec3(1).div(gridSizeUniform),
            vec3(gridSize).sub(1).div(gridSizeUniform),
          ),
        );
        // 잔 볼(구 캡 근사) 안에 머물도록 속도에 되돌림 힘을 준다.
        const posNext = particlePosition
          .add(particleVelocity.mul(dtUniform).mul(2.0))
          .toConst("posNext");
        const posNextClamped = clampToBowl(posNext);
        particleVelocity.addAssign(posNextClamped.sub(posNext));

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

    // 보르도 잔 프로파일 (WineGlass.tsx 에서 옮겨옴).
    // Catmull-Rom 으로 부드럽게 이어 LatheGeometry 회전체를 만든다.
    const GLASS_KEY: [number, number][] = [
      [0.0, 0.0],
      [0.55, 0.0],
      [0.55, 0.018],
      [0.42, 0.04],
      [0.12, 0.09],
      [0.05, 0.16],
      [0.042, 0.7],
      [0.042, 1.25],
      [0.05, 1.36],
      [0.1, 1.44],
      [0.17, 1.53],
      [0.26, 1.65],
      [0.34, 1.79],
      [0.4, 1.94],
      [0.44, 2.1],
      [0.46, 2.26],
      [0.455, 2.42],
      [0.43, 2.57],
      [0.4, 2.7],
      [0.36, 2.82],
      [0.325, 2.92],
    ];

    // 유체 큐브(x,z∈[-0.5,0.5], y∈[0,1])에 유리잔을 맞추기 위한 변환.
    // 잔 원본은 높이 2.92 → 축소해서 유체 큐브 영역에 얹는다. 캡처로 조정.
    const GLASS_SCALE = 0.42;
    const GLASS_Y = -0.06;

    // 유체 렌더를 잔 볼 안으로 축소·이동하는 값 (캡처로 조정).
    // FLUID_Y + coord*FLUID_SCALE = 월드 y. 프로파일 SDF 가 이 값으로 볼과 정렬한다.
    const FLUID_SCALE = 0.4;
    const FLUID_Y = 0.68;

    // 유체 물리 경계 = 잔 볼을 근사한 구 캡 (유체 좌표 0~1 기준).
    const BOWL_CENTER_Y = 0.62;
    const BOWL_RADIUS = 0.42;

    function setupGlass() {
      const curve = new THREE.CatmullRomCurve3(
        GLASS_KEY.map(([r, y]) => new THREE.Vector3(r, y, 0)),
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

      const glass = new THREE.Mesh(geometry, material);
      glass.scale.setScalar(GLASS_SCALE);
      glass.position.set(0, GLASS_Y, 0);
      glass.frustumCulled = false;
      scene.add(glass);
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
      dtUniform.value = deltaTime;
      renderer.compute(workgroupKernel);
      renderer.compute(clearGridKernel);
      renderer.compute(p2g1Kernel, p2g1KernelWorkgroupBuffer);
      renderer.compute(p2g2Kernel, p2g2KernelWorkgroupBuffer);
      renderer.compute(updateGridKernel);
      renderer.compute(g2pKernel, g2pKernelWorkgroupBuffer);
      renderer.render(scene, camera);
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
