"use client";

import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";
import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  atomicAdd,
  atomicLoad,
  atomicStore,
  dFdx,
  dFdy,
  float,
  hash,
  instanceIndex,
  int,
  mix,
  pass,
  positionLocal,
  step,
  storage,
  uint,
  uniform,
  vec3,
} from "three/tsl";

extend(THREE as unknown as Record<string, unknown>);

const COUNT = 45000;
const RADIUS = 1.0;
const FLOOR = 0.0;
const H = 0.06; // 상호작용 반경 = 격자 셀 크기
const STIFF = 40.0;
const VISC = 0.6;
const GRAV = 3.0;
const POUR_DUR = 3.5;
const EMIT_Y = 2.4;

// 공간 해시 격자 도메인
const XMIN = -1.15;
const YMIN = -0.15;
const ZMIN = -1.15;
const NX = 39;
const NY = 111;
const NZ = 39;
const NCELLS = NX * NY * NZ;
const K = 16; // 셀당 최대 입자

function Particles() {
  const { gl } = useThree();

  const built = useMemo(() => {
    const positions = storage(
      new THREE.StorageInstancedBufferAttribute(COUNT, 3),
      "vec3",
      COUNT,
    );
    const velocities = storage(
      new THREE.StorageInstancedBufferAttribute(COUNT, 3),
      "vec3",
      COUNT,
    );
    const forces = storage(
      new THREE.StorageInstancedBufferAttribute(COUNT, 3),
      "vec3",
      COUNT,
    );
    const activated = storage(
      new THREE.StorageInstancedBufferAttribute(COUNT, 1),
      "float",
      COUNT,
    );
    // 격자: 셀별 입자 수(atomic) + 셀별 입자 인덱스
    const cellCount = storage(
      new THREE.StorageInstancedBufferAttribute(new Int32Array(NCELLS), 1),
      "int",
      NCELLS,
    ).setAtomic(true);
    const cellParticles = storage(
      new THREE.StorageInstancedBufferAttribute(new Int32Array(NCELLS * K), 1),
      "int",
      NCELLS * K,
    );

    const uDelta = uniform(0.016);
    const uTime = uniform(0.0);

    // 위치 → 셀 인덱스(float 성분)
    const cellCoord = (p: ReturnType<typeof positions.element>) => {
      const gx = p.x.sub(XMIN).div(H).floor().clamp(0, NX - 1);
      const gy = p.y.sub(YMIN).div(H).floor().clamp(0, NY - 1);
      const gz = p.z.sub(ZMIN).div(H).floor().clamp(0, NZ - 1);
      return { gx, gy, gz };
    };

    const initNode = Fn(() => {
      positions.element(instanceIndex).assign(vec3(0.0, 40.0, 0.0));
      velocities.element(instanceIndex).assign(vec3(0.0));
      activated.element(instanceIndex).assign(0.0);
    })().compute(COUNT);

    // 1) 격자 초기화
    const clearNode = Fn(() => {
      atomicStore(cellCount.element(instanceIndex), int(0));
    })().compute(NCELLS);

    // 2) 각 입자를 자기 셀에 등록
    const assignNode = Fn(() => {
      If(activated.element(instanceIndex).greaterThan(0.5), () => {
        const p = positions.element(instanceIndex);
        const { gx, gy, gz } = cellCoord(p);
        const cell = int(gx.add(gy.mul(NX)).add(gz.mul(NX * NY)));
        const slot = atomicAdd(cellCount.element(cell), int(1));
        If(slot.lessThan(int(K)), () => {
          cellParticles
            .element(cell.mul(int(K)).add(slot))
            .assign(int(instanceIndex));
        });
      });
    })().compute(COUNT);

    // 3) 이웃 27칸만 보고 힘 계산
    const forceNode = Fn(() => {
      const force = vec3(0.0, GRAV * -1, 0.0).toVar();
      If(activated.element(instanceIndex).greaterThan(0.5), () => {
        const posI = positions.element(instanceIndex);
        const velI = velocities.element(instanceIndex);
        const { gx, gy, gz } = cellCoord(posI);
        const cix = int(gx);
        const ciy = int(gy);
        const ciz = int(gz);

        Loop({ start: int(-1), end: int(2) }, ({ i: dz }: { i: unknown }) => {
          Loop({ start: int(-1), end: int(2) }, ({ i: dy }: { i: unknown }) => {
            Loop(
              { start: int(-1), end: int(2) },
              ({ i: dx }: { i: unknown }) => {
                const nx = cix
                  .add(int(dx as never))
                  .clamp(int(0), int(NX - 1));
                const ny = ciy
                  .add(int(dy as never))
                  .clamp(int(0), int(NY - 1));
                const nz = ciz
                  .add(int(dz as never))
                  .clamp(int(0), int(NZ - 1));
                const nc = nx.add(ny.mul(int(NX))).add(nz.mul(int(NX * NY)));
                const cnt = atomicLoad(cellCount.element(nc)).min(int(K));
                Loop({ start: int(0), end: int(K) }, ({ i: s }: { i: unknown }) => {
                  If(int(s as never).lessThan(cnt), () => {
                    const j = cellParticles.element(
                      nc.mul(int(K)).add(int(s as never)),
                    );
                    If(j.notEqual(int(instanceIndex)), () => {
                      const posJ = positions.element(uint(j));
                      const velJ = velocities.element(uint(j));
                      const d = posI.sub(posJ);
                      const r = d.length();
                      If(r.lessThan(H).and(r.greaterThan(0.0001)), () => {
                        const dir = d.div(r);
                        const w = float(H).sub(r);
                        force.addAssign(dir.mul(w.mul(STIFF)));
                        force.addAssign(velJ.sub(velI).mul(w.mul(VISC)));
                      });
                    });
                  });
                });
              },
            );
          });
        });
      });
      forces.element(instanceIndex).assign(force);
    })().compute(COUNT);

    // 4) 방출 + 적분 + 경계
    const stepNode = Fn(() => {
      const p = positions.element(instanceIndex);
      const v = velocities.element(instanceIndex);
      const f = forces.element(instanceIndex);
      const act = activated.element(instanceIndex);
      const at = float(instanceIndex).div(COUNT).mul(POUR_DUR);

      If(uTime.greaterThanEqual(at).and(act.lessThan(0.5)), () => {
        const ea = hash(float(instanceIndex).mul(0.53).add(5)).mul(6.2832);
        const er = hash(float(instanceIndex).mul(1.9).add(2)).mul(0.03);
        p.assign(vec3(ea.cos().mul(er), EMIT_Y, ea.sin().mul(er)));
        v.assign(vec3(0.0, -2.2, 0.0));
        act.assign(1.0);
      });

      If(act.greaterThan(0.5), () => {
        const nv = v.add(f.mul(uDelta)).mul(0.98).toVar();
        const np = p.add(nv.mul(uDelta)).toVar();
        If(np.y.lessThan(FLOOR), () => {
          np.y.assign(FLOOR);
          nv.y.assign(nv.y.mul(-0.05));
        });
        const rxz = np.xz.length();
        If(rxz.greaterThan(RADIUS), () => {
          const clamped = np.xz.normalize().mul(RADIUS);
          np.x.assign(clamped.x);
          np.z.assign(clamped.y);
          nv.x.assign(nv.x.mul(-0.1));
          nv.z.assign(nv.z.mul(-0.1));
        });
        v.assign(nv);
        p.assign(np);
      });
    })().compute(COUNT);

    const sphereGeo = new THREE.SphereGeometry(0.035, 6, 5);
    const material = new THREE.MeshBasicNodeMaterial();
    material.colorNode = vec3(0.4, 0.06, 0.13);
    material.positionNode = positionLocal.add(positions.element(instanceIndex));

    const points = new THREE.InstancedMesh(sphereGeo, material, COUNT);
    points.frustumCulled = false;

    return {
      points,
      initNode,
      clearNode,
      assignNode,
      forceNode,
      stepNode,
      uDelta,
      uTime,
    };
  }, []);

  useEffect(() => {
    gl.computeAsync(built.initNode);
  }, [gl, built]);

  useFrame((state, dt) => {
    built.uDelta.value = Math.min(dt, 1 / 60);
    built.uTime.value = state.clock.elapsedTime;
    gl.compute(built.clearNode);
    gl.compute(built.assignNode);
    gl.compute(built.forceNode);
    gl.compute(built.stepNode);
  });

  return <primitive object={built.points} />;
}

function PostFX() {
  const { gl, scene, camera } = useThree();
  const post = useMemo(() => {
    const p = new THREE.PostProcessing(gl as unknown as THREE.WebGPURenderer);
    const scenePass = pass(scene, camera);
    const depth = gaussianBlur(scenePass.getLinearDepthNode(), null, 12).x;

    const dx = dFdx(depth);
    const dy = dFdy(depth);
    const normal = vec3(dx.mul(-60.0), dy.mul(-60.0), float(1.0)).normalize();

    const lightDir = vec3(0.4, 0.85, 0.5).normalize();
    const diff = normal.dot(lightDir).max(0.0).mul(0.7).add(0.35);
    const halfV = lightDir.add(vec3(0.0, 0.0, 1.0)).normalize();
    const spec = normal.dot(halfV).max(0.0).pow(60.0).mul(0.9);
    const fres = float(1.0).sub(normal.z.clamp(0.0, 1.0)).pow(3.0).mul(0.4);

    const wine = vec3(0.42, 0.05, 0.12);
    const surf = wine.mul(diff).add(spec).add(fres.mul(vec3(0.6, 0.2, 0.3)));

    const bg = vec3(0.1, 0.02, 0.06);
    p.outputNode = mix(bg, surf, step(depth, 0.985));
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
      camera={{ position: [0, 0.7, 6], fov: 42 }}
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer(
          props as unknown as ConstructorParameters<
            typeof THREE.WebGPURenderer
          >[0],
        );
        await renderer.init();
        return renderer;
      }}
      onCreated={({ camera }) => camera.lookAt(0, 0.6, 0)}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 6, 4]} intensity={2.5} />
      <Particles />
      <PostFX />
    </Canvas>
  );
}
