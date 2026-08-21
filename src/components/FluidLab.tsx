"use client";

import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
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

const COUNT = 3200;
const RADIUS = 1.0;
const FLOOR = 0.0;
const H = 0.15;
const STIFF = 45.0;
const VISC = 1.2;
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

    // 초기화: 좁은 세로 기둥 → 중력으로 순차 낙하 → 한 줄기 스트림
    const initNode = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const fi = float(instanceIndex);
      const t = fi.div(COUNT);
      const ang = hash(fi.mul(0.7).add(3)).mul(6.2832);
      const rad = hash(fi.mul(1.3).add(9)).mul(0.09);
      pos.assign(
        vec3(ang.cos().mul(rad), t.mul(7.0).add(2.6), ang.sin().mul(rad)),
      );
      vel.assign(vec3(0.0, -1.5, 0.0));
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

    // 입자는 깊이만 기여 — 색/광택은 후처리에서 (가벼운 재질)
    const sphereGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const material = new THREE.MeshBasicNodeMaterial();
    material.colorNode = vec3(0.4, 0.06, 0.13);
    material.positionNode = positionLocal.add(positions.element(instanceIndex));

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

// 스크린스페이스 유체 표면: 깊이 블러 → 법선 → 라이팅·스펙큘러
function PostFX() {
  const { gl, scene, camera } = useThree();
  const post = useMemo(() => {
    const p = new THREE.PostProcessing(gl as unknown as THREE.WebGPURenderer);
    const scenePass = pass(scene, camera);

    // 깊이를 강하게 블러 → 입자 요철이 녹아 매끈한 표면
    const depth = gaussianBlur(scenePass.getLinearDepthNode(), null, 14).x;

    // 블러된 깊이 기울기로 법선 재구성
    const dx = dFdx(depth);
    const dy = dFdy(depth);
    const normal = vec3(dx.mul(-60.0), dy.mul(-60.0), float(1.0)).normalize();

    // 라이팅 + 스펙큘러(젖은 광택)
    const lightDir = vec3(0.4, 0.85, 0.5).normalize();
    const diff = normal.dot(lightDir).max(0.0).mul(0.7).add(0.35);
    const halfV = lightDir.add(vec3(0.0, 0.0, 1.0)).normalize();
    const spec = normal.dot(halfV).max(0.0).pow(60.0).mul(0.9);
    const fres = float(1.0).sub(normal.z.clamp(0.0, 1.0)).pow(3.0).mul(0.4);

    const wine = vec3(0.42, 0.05, 0.12);
    const surf = wine.mul(diff).add(spec).add(fres.mul(vec3(0.6, 0.2, 0.3)));

    // 입자 있는 픽셀만 (블러된 깊이로 마스크)
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
