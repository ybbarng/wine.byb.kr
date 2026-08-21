"use client";

import { Canvas, extend, useFrame } from "@react-three/fiber";
import { useRef } from "react";
// three/webgpu 는 WebGPURenderer 와 노드 기반 재질을 포함한다.
import * as THREE from "three/webgpu";

// R3F 가 three/webgpu 의 클래스들을 JSX 로 인식하도록 등록
extend(THREE as unknown as Record<string, unknown>);

function SpinningBox() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.x += dt * 0.6;
      ref.current.rotation.y += dt * 0.9;
    }
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1.4, 1.4, 1.4]} />
      <meshStandardMaterial color="#b83259" roughness={0.3} metalness={0.1} />
    </mesh>
  );
}

export default function FluidLab() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 45 }}
      gl={async (props) => {
        // WebGPU 렌더러 생성 + 초기화
        const renderer = new THREE.WebGPURenderer(
          props as unknown as ConstructorParameters<
            typeof THREE.WebGPURenderer
          >[0],
        );
        await renderer.init();
        return renderer;
      }}
    >
      <color attach="background" args={["#1a0510"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 3]} intensity={2} />
      <SpinningBox />
    </Canvas>
  );
}
