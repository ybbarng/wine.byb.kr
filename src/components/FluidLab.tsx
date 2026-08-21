"use client";

import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";
import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  dFdx,
  dFdy,
  float,
  hash,
  instanceIndex,
  mix,
  pass,
  positionLocal,
  step,
  storage,
  uniform,
  vec3,
} from "three/tsl";

extend(THREE as unknown as Record<string, unknown>);

const COUNT = 4500;
const RADIUS = 1.0;
const FLOOR = 0.0;
const H = 0.15;
const STIFF = 45.0;
const VISC = 1.2;
const GRAV = 3.0;
const POUR_DUR = 3.5; // 붓는 시간(초)
const EMIT_Y = 2.4; // 물줄기 하단(표면 위)에서 방출

function Particles() {
  const { gl } = useThree();

  const { points, initNode, forceNode, stepNode, uDelta, uTime } =
    useMemo(() => {
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
      const uDelta = uniform(0.016);
      const uTime = uniform(0.0);

      // 초기화: 모두 화면 밖에 숨김(아직 안 부어짐)
      const initNode = Fn(() => {
        positions.element(instanceIndex).assign(vec3(0.0, 40.0, 0.0));
        velocities.element(instanceIndex).assign(vec3(0.0));
        activated.element(instanceIndex).assign(0.0);
      })().compute(COUNT);

      const forceNode = Fn(() => {
        const posI = positions.element(instanceIndex);
        const velI = velocities.element(instanceIndex);
        const force = vec3(0.0, GRAV * -1, 0.0).toVar();
        Loop(COUNT, ({ i }: { i: unknown }) => {
          If(instanceIndex.notEqual(i as never), () => {
            const posJ = positions.element(i as never);
            const velJ = velocities.element(i as never);
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
        forces.element(instanceIndex).assign(force);
      })().compute(COUNT);

      const stepNode = Fn(() => {
        const p = positions.element(instanceIndex);
        const v = velocities.element(instanceIndex);
        const f = forces.element(instanceIndex);
        const act = activated.element(instanceIndex);

        // 방출 시각: 입자마다 순차로
        const at = float(instanceIndex).div(COUNT).mul(POUR_DUR);

        // 최초 방출: 물줄기 하단(표면 위)에서 아주 좁게, 아래로
        If(uTime.greaterThanEqual(at).and(act.lessThan(0.5)), () => {
          const ea = hash(float(instanceIndex).mul(0.53).add(5)).mul(6.2832);
          const er = hash(float(instanceIndex).mul(1.9).add(2)).mul(0.03);
          p.assign(vec3(ea.cos().mul(er), EMIT_Y, ea.sin().mul(er)));
          v.assign(vec3(0.0, -2.2, 0.0));
          act.assign(1.0);
        });

        // 활성 입자만 물리 적분
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

      // 입자는 깊이만 기여 — 색/광택은 후처리에서
      const sphereGeo = new THREE.SphereGeometry(0.07, 8, 6);
      const material = new THREE.MeshBasicNodeMaterial();
      material.colorNode = vec3(0.4, 0.06, 0.13);
      material.positionNode = positionLocal.add(
        positions.element(instanceIndex),
      );

      const points = new THREE.InstancedMesh(sphereGeo, material, COUNT);
      points.frustumCulled = false;

      return { points, initNode, forceNode, stepNode, uDelta, uTime };
    }, []);

  useEffect(() => {
    gl.computeAsync(initNode);
  }, [gl, initNode]);

  useFrame((state, dt) => {
    uDelta.value = Math.min(dt, 1 / 60);
    uTime.value = state.clock.elapsedTime;
    gl.compute(forceNode);
    gl.compute(stepNode);
  });

  return <primitive object={points} />;
}

// 병에서 쏟아지는 가는 물줄기 — 붓는 동안만 표시
function PourStream() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current)
      ref.current.visible = state.clock.elapsedTime < POUR_DUR + 0.3;
  });
  return (
    <mesh ref={ref} position={[0, 3.4, 0]}>
      <cylinderGeometry args={[0.028, 0.05, 6.0, 16, 1]} />
      <meshBasicNodeMaterial color="#4a0a1c" />
    </mesh>
  );
}

// 스크린스페이스 유체 표면: 깊이 블러 → 법선 → 라이팅·스펙큘러
function PostFX() {
  const { gl, scene, camera } = useThree();
  const post = useMemo(() => {
    const p = new THREE.PostProcessing(gl as unknown as THREE.WebGPURenderer);
    const scenePass = pass(scene, camera);
    const depth = gaussianBlur(scenePass.getLinearDepthNode(), null, 14).x;

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
      <PourStream />
      <PostFX />
    </Canvas>
  );
}
