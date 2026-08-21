"use client";

import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";
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
  clamp,
  cross,
  dFdx,
  dFdy,
  float,
  instanceIndex,
  instancedArray,
  int,
  ivec3,
  mat3,
  max,
  mix,
  pass,
  pow,
  positionLocal,
  screenUV,
  step,
  struct,
  uniform,
  vec3,
  vec4,
  viewportSharedTexture,
} from "three/tsl";

extend(THREE as unknown as Record<string, unknown>);

// three.js 공식 webgpu_compute_particles_fluid (MLS-MPM) 이식
const GRID = 64;
const CELL_COUNT = GRID * GRID * GRID;
const PARTICLE_COUNT = 8192 * 16;
const FP = 1e7; // fixed-point 배율 (WebGPU는 int atomic만)

function Fluid() {
  const { gl } = useThree();

  const built = useMemo(() => {
    // 입자: position/velocity/C(affine)
    const particleStruct = struct({
      position: { type: "vec3" },
      velocity: { type: "vec3" },
      C: { type: "mat3" },
    });
    const PSIZE = 20; // vec3=4, mat3=12 (webgpu 정렬)
    const parr = new Float32Array(PARTICLE_COUNT * PSIZE);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      parr[i * PSIZE] = Math.random() * 0.8 + 0.1;
      parr[i * PSIZE + 1] = Math.random() * 0.8 + 0.1;
      parr[i * PSIZE + 2] = Math.random() * 0.8 + 0.1;
    }
    const particleBuffer = instancedArray(parr, particleStruct);

    const cellStruct = struct({
      x: { type: "int", atomic: true },
      y: { type: "int", atomic: true },
      z: { type: "int", atomic: true },
      mass: { type: "int", atomic: true },
    });
    const cellBuffer = instancedArray(CELL_COUNT, cellStruct);
    const cellFloat = instancedArray(CELL_COUNT, "vec4");

    const gridSizeU = uniform(new THREE.Vector3(GRID, GRID, GRID));
    const stiffnessU = uniform(50);
    const restDensityU = uniform(1.5);
    const viscosityU = uniform(0.1);
    const dtU = uniform(1 / 60);
    const gravityU = uniform(new THREE.Vector3(0, -9.81 * 9.81 * 3, 0));

    const enc = (f: ReturnType<typeof float>) => int(f.mul(FP));
    const dec = (i: ReturnType<typeof int>) => float(i).div(FP);

    // B-spline 가중치 (공통)
    const weightsOf = (gridPosition: ReturnType<typeof vec3>) => {
      const cellDiff = gridPosition.fract().sub(0.5);
      const w0 = float(0.5)
        .mul(float(0.5).sub(cellDiff))
        .mul(float(0.5).sub(cellDiff));
      const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
      const w2 = float(0.5)
        .mul(float(0.5).add(cellDiff))
        .mul(float(0.5).add(cellDiff));
      return array([w0, w1, w2]);
    };

    const clearK = Fn(() => {
      atomicStore(cellBuffer.element(instanceIndex).get("x"), 0);
      atomicStore(cellBuffer.element(instanceIndex).get("y"), 0);
      atomicStore(cellBuffer.element(instanceIndex).get("z"), 0);
      atomicStore(cellBuffer.element(instanceIndex).get("mass"), 0);
    })().compute(CELL_COUNT);

    const p2g1K = Fn(() => {
      const pos = particleBuffer.element(instanceIndex).get("position");
      const vel = particleBuffer.element(instanceIndex).get("velocity");
      const C = particleBuffer.element(instanceIndex).get("C");
      const gridPosition = pos.mul(gridSizeU).toVar();
      const cellIndex = ivec3(gridPosition).sub(1).toConst();
      const weights = weightsOf(gridPosition).toConst();

      Loop(
        { start: 0, end: 3, type: "int", name: "gx", condition: "<" },
        ({ gx }: { gx: unknown }) => {
          Loop(
            { start: 0, end: 3, type: "int", name: "gy", condition: "<" },
            ({ gy }: { gy: unknown }) => {
              Loop(
                { start: 0, end: 3, type: "int", name: "gz", condition: "<" },
                ({ gz }: { gz: unknown }) => {
                  const weight = weights
                    .element(gx as never)
                    .x.mul(weights.element(gy as never).y)
                    .mul(weights.element(gz as never).z);
                  const cellX = cellIndex
                    .add(ivec3(gx as never, gy as never, gz as never))
                    .toConst();
                  const cellDist = vec3(cellX)
                    .add(0.5)
                    .sub(gridPosition)
                    .toConst();
                  const Q = C.mul(cellDist);
                  const velContrib = weight.mul(vel.add(Q)).toConst();
                  const cellPtr = cellX.x
                    .mul(int(GRID * GRID))
                    .add(cellX.y.mul(int(GRID)))
                    .add(cellX.z)
                    .toConst();
                  const cell = cellBuffer.element(cellPtr);
                  atomicAdd(cell.get("x"), enc(velContrib.x));
                  atomicAdd(cell.get("y"), enc(velContrib.y));
                  atomicAdd(cell.get("z"), enc(velContrib.z));
                  atomicAdd(cell.get("mass"), enc(weight));
                },
              );
            },
          );
        },
      );
    })().compute(PARTICLE_COUNT);

    const p2g2K = Fn(() => {
      const pos = particleBuffer.element(instanceIndex).get("position");
      const gridPosition = pos.mul(gridSizeU).toVar();
      const cellIndex = ivec3(gridPosition).sub(1).toConst();
      const weights = weightsOf(gridPosition).toConst();

      const density = float(0).toVar();
      Loop(
        { start: 0, end: 3, type: "int", name: "gx", condition: "<" },
        ({ gx }: { gx: unknown }) => {
          Loop(
            { start: 0, end: 3, type: "int", name: "gy", condition: "<" },
            ({ gy }: { gy: unknown }) => {
              Loop(
                { start: 0, end: 3, type: "int", name: "gz", condition: "<" },
                ({ gz }: { gz: unknown }) => {
                  const weight = weights
                    .element(gx as never)
                    .x.mul(weights.element(gy as never).y)
                    .mul(weights.element(gz as never).z);
                  const cellX = cellIndex
                    .add(ivec3(gx as never, gy as never, gz as never))
                    .toConst();
                  const cellPtr = cellX.x
                    .mul(int(GRID * GRID))
                    .add(cellX.y.mul(int(GRID)))
                    .add(cellX.z)
                    .toConst();
                  const mass = dec(
                    atomicLoad(cellBuffer.element(cellPtr).get("mass")),
                  );
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
        pow(density.div(restDensityU), 5.0).sub(1).mul(stiffnessU),
      ).toConst();
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
      ).toVar();
      const C = particleBuffer.element(instanceIndex).get("C");
      const strain = C.add(C.transpose());
      stress.addAssign(strain.mul(viscosityU));
      const eq16 = volume.mul(-4).mul(stress).mul(dtU);

      Loop(
        { start: 0, end: 3, type: "int", name: "gx", condition: "<" },
        ({ gx }: { gx: unknown }) => {
          Loop(
            { start: 0, end: 3, type: "int", name: "gy", condition: "<" },
            ({ gy }: { gy: unknown }) => {
              Loop(
                { start: 0, end: 3, type: "int", name: "gz", condition: "<" },
                ({ gz }: { gz: unknown }) => {
                  const weight = weights
                    .element(gx as never)
                    .x.mul(weights.element(gy as never).y)
                    .mul(weights.element(gz as never).z);
                  const cellX = cellIndex
                    .add(ivec3(gx as never, gy as never, gz as never))
                    .toConst();
                  const cellDist = vec3(cellX)
                    .add(0.5)
                    .sub(gridPosition)
                    .toConst();
                  const momentum = eq16.mul(weight).mul(cellDist).toConst();
                  const cellPtr = cellX.x
                    .mul(int(GRID * GRID))
                    .add(cellX.y.mul(int(GRID)))
                    .add(cellX.z)
                    .toConst();
                  const cell = cellBuffer.element(cellPtr);
                  atomicAdd(cell.get("x"), enc(momentum.x));
                  atomicAdd(cell.get("y"), enc(momentum.y));
                  atomicAdd(cell.get("z"), enc(momentum.z));
                },
              );
            },
          );
        },
      );
    })().compute(PARTICLE_COUNT);

    const updateGridK = Fn(() => {
      const cell = cellBuffer.element(instanceIndex);
      const mass = dec(atomicLoad(cell.get("mass"))).toConst();
      If(mass.lessThanEqual(0), () => {
        Return();
      });
      const vx = dec(atomicLoad(cell.get("x"))).div(mass).toVar();
      const vy = dec(atomicLoad(cell.get("y"))).div(mass).toVar();
      const vz = dec(atomicLoad(cell.get("z"))).div(mass).toVar();
      const x = int(instanceIndex).div(int(GRID * GRID));
      const y = int(instanceIndex).div(int(GRID)).mod(int(GRID));
      const z = int(instanceIndex).mod(int(GRID));
      If(x.lessThan(int(1)).or(x.greaterThan(int(GRID - 2))), () => {
        vx.assign(0);
      });
      If(y.lessThan(int(1)).or(y.greaterThan(int(GRID - 2))), () => {
        vy.assign(0);
      });
      If(z.lessThan(int(1)).or(z.greaterThan(int(GRID - 2))), () => {
        vz.assign(0);
      });
      cellFloat.element(instanceIndex).assign(vec4(vx, vy, vz, mass));
    })().compute(CELL_COUNT);

    const clampToRoundedBox = (
      pos: ReturnType<typeof vec3>,
      box: ReturnType<typeof vec3>,
      radius: ReturnType<typeof float>,
    ) => {
      const result = pos.sub(0.5).toVar();
      const pp = step(box, result.abs()).mul(
        result.add(box.negate().mul(result.sign())),
      );
      const ppLen = pp.length().toVar();
      const dist = ppLen.sub(radius);
      If(dist.greaterThan(0.0), () => {
        result.subAssign(pp.normalize().mul(dist).mul(1.3));
      });
      result.addAssign(0.5);
      return result;
    };

    const g2pK = Fn(() => {
      const pos = particleBuffer
        .element(instanceIndex)
        .get("position")
        .toVar();
      const gridPosition = pos.mul(gridSizeU).toVar();
      const vel = vec3(0).toVar();
      const cellIndex = ivec3(gridPosition).sub(1).toConst();
      const weights = weightsOf(gridPosition).toConst();

      const B = mat3(0).toVar();
      Loop(
        { start: 0, end: 3, type: "int", name: "gx", condition: "<" },
        ({ gx }: { gx: unknown }) => {
          Loop(
            { start: 0, end: 3, type: "int", name: "gy", condition: "<" },
            ({ gy }: { gy: unknown }) => {
              Loop(
                { start: 0, end: 3, type: "int", name: "gz", condition: "<" },
                ({ gz }: { gz: unknown }) => {
                  const weight = weights
                    .element(gx as never)
                    .x.mul(weights.element(gy as never).y)
                    .mul(weights.element(gz as never).z);
                  const cellX = cellIndex
                    .add(ivec3(gx as never, gy as never, gz as never))
                    .toConst();
                  const cellDist = vec3(cellX)
                    .add(0.5)
                    .sub(gridPosition)
                    .toConst();
                  const cellPtr = cellX.x
                    .mul(int(GRID * GRID))
                    .add(cellX.y.mul(int(GRID)))
                    .add(cellX.z)
                    .toConst();
                  const wv = cellFloat.element(cellPtr).xyz.mul(weight).toConst();
                  const term = mat3(
                    wv.mul(cellDist.x),
                    wv.mul(cellDist.y),
                    wv.mul(cellDist.z),
                  );
                  B.addAssign(term);
                  vel.addAssign(wv);
                },
              );
            },
          );
        },
      );

      particleBuffer.element(instanceIndex).get("C").assign(B.mul(4));
      vel.addAssign(gravityU.mul(dtU));
      vel.mulAssign(0.997); // 아주 약한 감쇠(낙하는 방해 않되 서서히 잦아듦)
      vel.divAssign(gridSizeU);
      pos.addAssign(vel.mul(dtU));
      pos.assign(
        clamp(
          pos,
          vec3(1).div(gridSizeU),
          vec3(GRID, GRID, GRID).sub(1).div(gridSizeU),
        ),
      );
      // 원통(잔 대용) 경계: 중심축 y, 반지름 0.4, 바닥 0.08
      const cxz = pos.xz.sub(0.5).toVar();
      const rr = cxz.length().toVar();
      If(rr.greaterThan(0.4), () => {
        const nn = cxz.div(rr).mul(0.4);
        pos.x.assign(nn.x.add(0.5));
        pos.z.assign(nn.y.add(0.5));
      });
      If(pos.y.lessThan(0.08), () => {
        pos.y.assign(0.08);
      });

      particleBuffer.element(instanceIndex).get("position").assign(pos);
      particleBuffer.element(instanceIndex).get("velocity").assign(vel);
    })().compute(PARTICLE_COUNT);

    // 렌더: 아주 작은 구 인스턴스
    const geo = new THREE.IcosahedronGeometry(0.006, 1);
    const material = new THREE.MeshStandardNodeMaterial();
    material.colorNode = vec3(0.55, 0.06, 0.16);
    material.roughness = 0.3;
    material.metalness = 0.0;
    material.positionNode = positionLocal.add(
      particleBuffer.element(instanceIndex).get("position"),
    );
    const mesh = new THREE.InstancedMesh(geo, material, PARTICLE_COUNT);
    mesh.frustumCulled = false;

    return { mesh, clearK, p2g1K, p2g2K, updateGridK, g2pK, dtU };
  }, []);

  useFrame((_, dt) => {
    // 실제 프레임 시간을 반영(clamp) → fps 가 낮아도 슬로모션이 되지 않음
    built.dtU.value = Math.min(dt, 1 / 45);
    gl.compute(built.clearK);
    gl.compute(built.p2g1K);
    gl.compute(built.p2g2K);
    gl.compute(built.updateGridK);
    gl.compute(built.g2pK);
  });

  return <primitive object={built.mesh} />;
}

// SSFR: 입자 깊이 → 블러 → 법선 재구성 → 셰이딩 (개별 입자를 매끈한 표면으로)
function PostFX() {
  const { gl, scene, camera } = useThree();
  const post = useMemo(() => {
    const p = new THREE.PostProcessing(gl as unknown as THREE.WebGPURenderer);
    const scenePass = pass(scene, camera);
    const depth = gaussianBlur(scenePass.getLinearDepthNode(), null, 20).x;

    const dx = dFdx(depth);
    const dy = dFdy(depth);
    const normal = vec3(dx.mul(-120.0), dy.mul(-120.0), float(1.0)).normalize();

    const lightDir = vec3(0.4, 0.85, 0.5).normalize();
    // 가장자리(법선 급경사)가 어둡게 죽지 않도록 ambient 를 올린다
    const diff = normal.dot(lightDir).max(0.0).mul(0.5).add(0.55);
    const halfV = lightDir.add(vec3(0.0, 0.0, 1.0)).normalize();
    const spec = normal.dot(halfV).max(0.0).pow(60.0).mul(0.9);

    const wine = vec3(0.46, 0.06, 0.14);
    // 굴절: 법선만큼 배경을 왜곡해 샘플 → 뒤가 비치는 투명한 와인
    const refr = viewportSharedTexture(screenUV.add(normal.xy.mul(0.06))).rgb;
    const body = mix(refr.mul(1.1), wine.mul(diff), 0.55).add(spec);

    const bg = vec3(0.1, 0.02, 0.06);
    p.outputNode = mix(bg, body, step(depth, 0.985));
    return p;
  }, [gl, scene, camera]);

  useFrame(() => {
    (post as unknown as { render: () => void }).render();
  }, 1);

  return null;
}

export default function FluidLab() {
  return (
    <Canvas
      camera={{ position: [1.6, 1.1, 1.6], fov: 40 }}
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer({
          ...(props as object),
          requiredLimits: { maxStorageBuffersInVertexStage: 1 },
        } as unknown as ConstructorParameters<typeof THREE.WebGPURenderer>[0]);
        await renderer.init();
        return renderer;
      }}
      onCreated={({ camera }) => camera.lookAt(0.5, 0.4, 0.5)}
    >
      <color attach="background" args={["#1a0510"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 2]} intensity={2.5} />
      <Fluid />
      <PostFX />
    </Canvas>
  );
}
