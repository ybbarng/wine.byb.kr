"use client";

import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  float,
  hash,
  instanceIndex,
  storage,
  uniform,
  vec3,
  vertexIndex,
} from "three/tsl";

extend(THREE as unknown as Record<string, unknown>);

const COUNT = 8000;
const RADIUS = 1.0; // 원통(잔 대용) 반지름
const FLOOR = 0.0;

function Particles() {
  const { gl } = useThree();

  const { points, initNode, updateNode, uDelta } = useMemo(() => {
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
    const uDelta = uniform(0.016);

    // 초기화: 위쪽 상자 안에 흩뿌린다
    const initNode = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const fi = float(instanceIndex);
      const rx = hash(fi.mul(0.1731).add(11)).sub(0.5);
      const ry = hash(fi.mul(0.3719).add(37));
      const rz = hash(fi.mul(0.9137).add(91)).sub(0.5);
      pos.assign(vec3(rx.mul(1.4), ry.mul(1.6).add(2.2), rz.mul(1.4)));
      vel.assign(vec3(0.0));
    })().compute(COUNT);

    // 매 프레임: 중력 + 바닥/원통벽 충돌
    const updateNode = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);

      vel.addAssign(vec3(0.0, -4.0, 0.0).mul(uDelta));
      pos.addAssign(vel.mul(uDelta));

      // 바닥
      If(pos.y.lessThan(FLOOR), () => {
        pos.y.assign(FLOOR);
        vel.y.assign(vel.y.mul(-0.3));
      });

      // 원통 벽
      const rxz = pos.xz.length();
      If(rxz.greaterThan(RADIUS), () => {
        pos.xz.assign(pos.xz.normalize().mul(RADIUS));
        vel.xz.assign(vel.xz.mul(-0.3));
      });
    })().compute(COUNT);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3),
    );
    const material = new THREE.PointsNodeMaterial();
    material.positionNode = positions.element(vertexIndex);
    material.colorNode = vec3(0.72, 0.2, 0.35);
    material.size = 8;

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;

    return { points, initNode, updateNode, uDelta };
  }, []);

  useEffect(() => {
    gl.computeAsync(initNode);
  }, [gl, initNode]);

  useFrame((_, dt) => {
    uDelta.value = Math.min(dt, 1 / 30);
    gl.compute(updateNode);
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
      {/* 참조용 원통(잔 대용) — 입자 충돌 경계를 눈으로 보이게 */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[RADIUS, RADIUS, 3, 48, 1, true]} />
        <meshBasicMaterial color="#e8b4be" wireframe transparent opacity={0.15} />
      </mesh>
      <Particles />
    </Canvas>
  );
}
