"use client";

import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  float,
  hash,
  instanceIndex,
  positionLocal,
  storage,
  uniform,
  vec3,
} from "three/tsl";

extend(THREE as unknown as Record<string, unknown>);

const COUNT = 4000;
const RADIUS = 1.0;
const FLOOR = 0.0;
// 물리 파라미터 (프로토타입 — 캡처로 튜닝)
const H = 0.2; // 상호작용 반경
const STIFF = 45.0; // 반발 강도
const VISC = 1.2; // 점성(속도 정렬)
const GRAV = 3.0;

function Particles() {
  const { gl } = useThree();

  const { points, initNode, forceNode, stepNode, uDelta } = useMemo(() => {
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
    const uDelta = uniform(0.016);

    const initNode = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const fi = float(instanceIndex);
      const rx = hash(fi.mul(0.1731).add(11)).sub(0.5);
      const ry = hash(fi.mul(0.3719).add(37));
      const rz = hash(fi.mul(0.9137).add(91)).sub(0.5);
      pos.assign(vec3(rx.mul(1.4), ry.mul(1.6).add(1.8), rz.mul(1.4)));
      vel.assign(vec3(0.0));
    })().compute(COUNT);

    // 1패스: 힘 계산(반발 + 점성 + 중력). 모든 위치를 읽기만 하므로 race 없음.
    const forceNode = Fn(() => {
      const posI = positions.element(instanceIndex);
      const velI = velocities.element(instanceIndex);
      const force = vec3(0.0, GRAV.valueOf() * -1, 0.0).toVar();
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

    // 2패스: 적분 + 경계
    const stepNode = Fn(() => {
      const p = positions.element(instanceIndex);
      const v = velocities.element(instanceIndex);
      const f = forces.element(instanceIndex);
      const nv = v.add(f.mul(uDelta)).mul(0.98).toVar();
      const np = p.add(nv.mul(uDelta)).toVar();
      If(np.y.lessThan(FLOOR), () => {
        np.y.assign(FLOOR);
        nv.y.assign(nv.y.mul(-0.2));
      });
      const rxz = np.xz.length();
      If(rxz.greaterThan(RADIUS), () => {
        const clamped = np.xz.normalize().mul(RADIUS);
        np.x.assign(clamped.x);
        np.z.assign(clamped.y);
        nv.x.assign(nv.x.mul(-0.2));
        nv.z.assign(nv.z.mul(-0.2));
      });
      v.assign(nv);
      p.assign(np);
    })().compute(COUNT);

    // 각 입자를 작은 구(球)로 인스턴싱 — 물/와인 굴절 재질
    const sphereGeo = new THREE.SphereGeometry(0.08, 10, 8);
    const material = new THREE.MeshPhysicalNodeMaterial();
    material.positionNode = positionLocal.add(positions.element(instanceIndex));
    material.colorNode = vec3(0.5, 0.08, 0.16);
    material.roughness = 0.12;
    material.metalness = 0.0;
    material.transmission = 0.9;
    material.ior = 1.34;
    material.thickness = 0.4;

    const points = new THREE.InstancedMesh(sphereGeo, material, COUNT);
    points.frustumCulled = false;

    return { points, initNode, forceNode, stepNode, uDelta };
  }, []);

  useEffect(() => {
    gl.computeAsync(initNode);
  }, [gl, initNode]);

  useFrame((_, dt) => {
    uDelta.value = Math.min(dt, 1 / 60);
    gl.compute(forceNode);
    gl.compute(stepNode);
  });

  return <primitive object={points} />;
}

export default function FluidLab() {
  return (
    <Canvas
      camera={{ position: [0, 1.3, 4.5], fov: 45 }}
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer(
          props as unknown as ConstructorParameters<
            typeof THREE.WebGPURenderer
          >[0],
        );
        await renderer.init();
        return renderer;
      }}
      onCreated={({ camera }) => camera.lookAt(0, 1, 0)}
    >
      <color attach="background" args={["#1a0510"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 6, 4]} intensity={2.5} />
      <directionalLight position={[-3, 2, -2]} intensity={0.8} color="#e8b4be" />
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[RADIUS, RADIUS, 3, 48, 1, true]} />
        <meshBasicMaterial color="#e8b4be" wireframe transparent opacity={0.15} />
      </mesh>
      <Particles />
    </Canvas>
  );
}
