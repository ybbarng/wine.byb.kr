"use client";

import { Environment, MeshTransmissionMaterial } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** 키포인트를 Catmull-Rom 곡선으로 부드럽게 이어 lathe 프로파일을 만든다. */
function smoothProfile(key: [number, number][], samples: number) {
  const curve = new THREE.CatmullRomCurve3(
    key.map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    "centripetal",
    0.5,
  );
  return curve
    .getPoints(samples)
    .map((p) => new THREE.Vector2(Math.max(p.x, 0.0006), p.y));
}

/**
 * 보르도 잔 — 촘촘한 단조 좌표로 매끄러운 난형 볼을 만든다(물결 방지).
 * 넓은 받침 · 얇고 긴 스템 · 아래로 둥근 난형 볼 · 좁아지는 rim.
 */
function useGlassGeometry() {
  return useMemo(() => {
    const key: [number, number][] = [
      [0.0, 0.0],
      [0.55, 0.0], // 받침
      [0.55, 0.018],
      [0.42, 0.04],
      [0.12, 0.09],
      [0.05, 0.16],
      [0.042, 0.7],
      [0.042, 1.25], // 얇고 긴 스템
      [0.05, 1.36], // 볼 목
      [0.1, 1.44],
      [0.17, 1.53],
      [0.26, 1.65],
      [0.34, 1.79],
      [0.4, 1.94],
      [0.44, 2.1],
      [0.46, 2.26], // 볼 최대폭
      [0.455, 2.42],
      [0.43, 2.57],
      [0.4, 2.7],
      [0.36, 2.82],
      [0.325, 2.92], // rim
    ];
    const geo = new THREE.LatheGeometry(smoothProfile(key, 260), 240);
    geo.computeVertexNormals();
    return geo;
  }, []);
}

/** 볼 안을 채우는 액체(윗부분은 clipping plane 이 잘라낸다). */
function useWineBodyGeometry() {
  return useMemo(() => {
    const key: [number, number][] = [
      [0.0, 1.4],
      [0.09, 1.44],
      [0.18, 1.54],
      [0.28, 1.68],
      [0.36, 1.84],
      [0.42, 2.02],
      [0.44, 2.2], // 볼 형태를 따라가다
      [0.44, 2.95], // 표면 위까지 원통으로 넉넉히 (clip 여유)
      [0.0, 2.95],
    ];
    const geo = new THREE.LatheGeometry(smoothProfile(key, 180), 240);
    geo.computeVertexNormals();
    return geo;
  }, []);
}

// 잔 세로 중심을 원점 근처로: group.position.y = -1.46, 표면 로컬 ≈ 2.28
const GROUP_Y = -1.46;
const SURFACE_Y = 2.28 + GROUP_Y;

function Scene() {
  const glassGeo = useGlassGeometry();
  const bodyGeo = useWineBodyGeometry();
  const surfacePlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, -1, 0), SURFACE_Y),
    [],
  );

  const group = useRef<THREE.Group>(null!);
  const surface = useRef<THREE.Mesh>(null!);

  const target = useRef({ x: 0, z: 0 });
  const cur = useRef({ x: 0, z: 0 });
  const liq = useRef({ x: 0, z: 0, vx: 0, vz: 0 });
  const dragging = useRef(false);

  const tmpNormal = useMemo(() => new THREE.Vector3(), []);
  const tmpPoint = useMemo(() => new THREE.Vector3(0, SURFACE_Y, 0), []);
  const tmpEuler = useMemo(() => new THREE.Euler(), []);

  useFrame((_, dtRaw) => {
    if (!group.current || !surface.current) return;
    const dt = Math.min(dtRaw, 1 / 30);

    if (!dragging.current) {
      target.current.x += (0 - target.current.x) * Math.min(1, dt * 3);
      target.current.z += (0 - target.current.z) * Math.min(1, dt * 3);
    }

    const ease = Math.min(1, dt * 9);
    cur.current.x += (target.current.x - cur.current.x) * ease;
    cur.current.z += (target.current.z - cur.current.z) * ease;
    group.current.rotation.x = cur.current.x;
    group.current.rotation.z = cur.current.z;

    const k = 55;
    const damp = 5.5;
    for (const axis of ["x", "z"] as const) {
      const v = axis === "x" ? "vx" : "vz";
      liq.current[v] += (cur.current[axis] - liq.current[axis]) * k * dt;
      liq.current[v] -= liq.current[v] * damp * dt;
      liq.current[axis] += liq.current[v] * dt;
    }

    const sx = (cur.current.x - liq.current.x) * 1.3;
    const sz = (cur.current.z - liq.current.z) * 1.3;

    tmpNormal.set(0, -1, 0).applyEuler(tmpEuler.set(sx, 0, sz));
    surfacePlane.setFromNormalAndCoplanarPoint(tmpNormal, tmpPoint);
    surface.current.rotation.set(-Math.PI / 2 + sx, 0, sz);
  });

  useEffect(() => {
    const onDown = () => {
      dragging.current = true;
    };
    const onUp = () => {
      dragging.current = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      target.current.x = THREE.MathUtils.clamp(
        target.current.x + e.movementY / 200,
        -0.5,
        0.5,
      );
      target.current.z = THREE.MathUtils.clamp(
        target.current.z - e.movementX / 200,
        -0.5,
        0.5,
      );
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <>
      {/* 액체 표면 원판 */}
      <mesh ref={surface} position={[0, SURFACE_Y, 0]}>
        <circleGeometry args={[0.415, 96]} />
        <meshPhysicalMaterial
          color="#5a0d20"
          roughness={0.15}
          metalness={0}
          clearcoat={0.35}
          clearcoatRoughness={0.2}
          envMapIntensity={1.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      <group ref={group} position={[0, GROUP_Y, 0]}>
        {/* 액체 덩어리 — 표면 원판과 색·밝기를 통일해 이음새를 줄인다 */}
        <mesh geometry={bodyGeo} renderOrder={0}>
          <meshPhysicalMaterial
            color="#5a0d20"
            roughness={0.2}
            metalness={0}
            envMapIntensity={1.0}
            clippingPlanes={[surfacePlane]}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* 유리 — clearcoat 없이 순수 굴절 유리(플라스틱감 제거) */}
        <mesh geometry={glassGeo} renderOrder={1}>
          <MeshTransmissionMaterial
            samples={8}
            resolution={1024}
            transmission={1}
            roughness={0.02}
            thickness={0.7}
            ior={1.5}
            chromaticAberration={0.02}
            anisotropy={0}
            distortion={0.0}
            distortionScale={0.1}
            temporalDistortion={0.0}
            attenuationColor="#ffffff"
            color="#ffffff"
          />
        </mesh>
      </group>
    </>
  );
}

export default function WineGlass() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 6.5], fov: 32 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
        gl.domElement.addEventListener(
          "webglcontextlost",
          (e) => e.preventDefault(),
          false,
        );
      }}
      style={{ touchAction: "none", cursor: "grab" }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 6, 4]} intensity={1.4} />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#e8b4be" />
      <Scene />
      <Environment
        preset="apartment"
        background={false}
        environmentIntensity={0.9}
      />
      <EffectComposer disableNormalPass>
        <Bloom
          mipmapBlur
          luminanceThreshold={1.15}
          luminanceSmoothing={0.3}
          intensity={0.18}
        />
        <Vignette eskil={false} offset={0.25} darkness={0.6} />
      </EffectComposer>
    </Canvas>
  );
}
