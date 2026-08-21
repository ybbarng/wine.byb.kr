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

/** 보르도 잔 — 매끄러운 난형 볼. */
function useGlassGeometry() {
  return useMemo(() => {
    const key: [number, number][] = [
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
    const geo = new THREE.LatheGeometry(smoothProfile(key, 260), 240);
    geo.computeVertexNormals();
    return geo;
  }, []);
}

// 액체: 잔 내벽을 따라 채운 볼륨 + 평평한 표면(덮개 아님, 볼륨의 윗면).
// 프로파일 뒷부분(SURFACE_START 이후)이 표면 정점 — 흔들면 이 y 들을 동적으로 변형한다.
const LIQ_PROFILE: [number, number][] = [
  [0.0, 1.4], // 바닥 중심
  [0.09, 1.44],
  [0.18, 1.54],
  [0.28, 1.68],
  [0.36, 1.84],
  [0.42, 2.0],
  [0.435, 2.16], // 표면 가장자리(잔 내벽 근처)
  [0.435, 2.2], // ── 여기부터 표면 ──
  [0.36, 2.2],
  [0.28, 2.2],
  [0.2, 2.2],
  [0.12, 2.2],
  [0.05, 2.2],
  [0.0, 2.2], // 표면 중심
];
const LIQ_POINTS = LIQ_PROFILE.length; // 14
const SURFACE_START = 7; // 이 index 이상이 표면 정점
const SURFACE_Y_LOCAL = 2.2;
const LATHE_SEG = 120;
const GROUP_Y = -1.46;

function Scene() {
  const glassGeo = useGlassGeometry();
  const liquidGeo = useMemo(() => {
    const pts = LIQ_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, LATHE_SEG);
    g.computeVertexNormals();
    return g;
  }, []);

  // 표면 정점의 기준 위치(x,z)를 미리 뽑아둔다
  const surfaceVerts = useMemo(() => {
    const list: { idx: number; x: number; z: number }[] = [];
    const pos = liquidGeo.attributes.position;
    for (let i = 0; i <= LATHE_SEG; i++) {
      for (let j = SURFACE_START; j < LIQ_POINTS; j++) {
        const idx = i * LIQ_POINTS + j;
        list.push({ idx, x: pos.getX(idx), z: pos.getZ(idx) });
      }
    }
    return list;
  }, [liquidGeo]);

  const group = useRef<THREE.Group>(null!);

  const target = useRef({ x: 0, z: 0 });
  const cur = useRef({ x: 0, z: 0 });
  // 표면 기울기(월드 수평을 유지하려는 액체) — 관성 스프링으로 잔 기울기를 추종
  const tilt = useRef({ a: 0, b: 0, va: 0, vb: 0 });
  const dragging = useRef(false);

  useFrame((_, dtRaw) => {
    if (!group.current) return;
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
    group.current.updateMatrix();

    // 관성: 표면의 실제 수평 높이(h)가 목표를 스프링으로 지연 추종 → 출렁.
    const t = tilt.current;
    const k = 60;
    const damp = 5.5;
    t.va += (0 - t.a) * k * dt; // 목표는 수평(0). 흔들면 관성으로 넘실
    t.va -= t.va * damp * dt;
    t.a += t.va * dt;

    // 잔 회전 행렬의 y행(R10,R11,R12)으로 각 표면 정점의 로컬 y를 역산해
    // 월드에서 완벽히 수평인 표면을 만든다. (관성 h 로 위아래 넘실댐)
    const e = group.current.matrix.elements;
    const R10 = e[1];
    const R11 = e[5];
    const R12 = e[9];
    const h = SURFACE_Y_LOCAL + t.a;
    const pos = liquidGeo.attributes.position;
    for (const v of surfaceVerts) {
      const ly = (h - R10 * v.x - R12 * v.z) / (R11 || 1);
      pos.setY(v.idx, ly);
    }
    pos.needsUpdate = true;
    liquidGeo.computeVertexNormals();
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
  }, [liquidGeo, surfaceVerts]);

  return (
    <group ref={group} position={[0, GROUP_Y, 0]}>
      {/* 액체 — 잔 내벽을 따라 채운 단일 볼륨(원판·clip 없음) */}
      <mesh geometry={liquidGeo} renderOrder={0}>
        <meshPhysicalMaterial
          color="#4e0c1f"
          roughness={0.18}
          metalness={0}
          transmission={0.25}
          thickness={1.5}
          ior={1.35}
          attenuationColor="#360712"
          attenuationDistance={0.5}
          envMapIntensity={1.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 유리 */}
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
