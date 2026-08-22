"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { UltraHDRLoader } from "three/examples/jsm/loaders/UltraHDRLoader.js";
import { WebGLPathTracer } from "three-gpu-pathtracer";

// 정지 병+잔+와인을 "패스트레이싱"으로 렌더 — 유리→병유리→와인 중첩 굴절이
// 물리적으로 정확하게 계산된다(래스터의 근사가 아니라 진짜 광선 추적).
// 실시간 유체(WebGPU FluidLab)와 별개의 정지 showcase.
export default function PathTraceShowcase() {
  const mountRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let raf = 0;

    // ── 잔 프로파일 (FluidLab와 동일) ──────────────────────────────
    const glassProfile: [number, number][] = [
      [0.0, 0.0], [0.55, 0.0], [0.55, 0.018], [0.42, 0.04],
      [0.12, 0.09], [0.05, 0.16], [0.042, 0.7], [0.042, 1.25],
      [0.05, 1.36], [0.1, 1.44], [0.17, 1.53], [0.26, 1.65],
      [0.34, 1.79], [0.4, 1.94], [0.44, 2.1], [0.46, 2.26],
      [0.455, 2.42], [0.43, 2.57], [0.4, 2.7], [0.36, 2.82],
      [0.325, 2.92],
    ];
    const worldScale = 0.42;
    const worldY = -0.06;
    const profileMaxY = 2.92;
    const GLASS_HEIGHT_M = 0.24;
    const m = (profileMaxY * worldScale) / GLASS_HEIGHT_M; // 미터→world ≈5.11

    async function main() {
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(1);
      renderer.setSize(mount!.clientWidth, mount!.clientHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      mount!.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        38,
        mount!.clientWidth / mount!.clientHeight,
        0.05,
        100,
      );
      camera.position.set(-1.9, 1.7, -1.9);
      camera.lookAt(0.25, 0.55, 0);

      // ── 환경 HDR (조명 + 반사) ─────────────────────────────────
      const hdrLoader = new UltraHDRLoader().setPath(
        "/textures/equirectangular/",
      );
      const hdr = await hdrLoader.loadAsync("royal_esplanade_2k.hdr.jpg");
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = hdr; // 조명·반사는 HDR 유지
      scene.background = new THREE.Color(0xece7dd); // 배경은 맑은 중립(제품샷)

      // ── 유리잔 (맑은 유리, 완전 투과) ──────────────────────────
      const gCurve = new THREE.CatmullRomCurve3(
        glassProfile.map(([r, y]) => new THREE.Vector3(r, y, 0)),
        false,
        "centripetal",
        0.5,
      );
      const gPts = gCurve
        .getPoints(260)
        .map((p) => new THREE.Vector2(Math.max(p.x, 0.0006), p.y));
      const glassGeo = new THREE.LatheGeometry(gPts, 240);
      glassGeo.computeVertexNormals();
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.02,
        transmission: 1,
        ior: 1.5,
        thickness: 0.25,
        attenuationColor: new THREE.Color(0xffffff),
        attenuationDistance: 100,
        side: THREE.DoubleSide,
      });
      const glassMesh = new THREE.Mesh(glassGeo, glassMat);
      glassMesh.scale.setScalar(worldScale);
      glassMesh.position.set(0, worldY, 0);
      scene.add(glassMesh);

      // ── 보르도 750ml 병 (초록 유리, 투과+감쇠 착색) ────────────
      const Rb = 0.0368, Rn = 0.01475, bore = 0.00925, punt = 0.016;
      const H = 0.3, yBody = 0.184, yNeck = 0.216, yLip = 0.29;
      const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
      const P: number[][] = [
        [0.0001, punt], [Rb * 0.35, punt * 0.5], [Rb * 0.8, 0.004],
        [Rb * 0.97, 0.0], [Rb, 0.011], [Rb, yBody],
      ];
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        const y = yBody + t * (yNeck - yBody);
        P.push([Rb + (Rn - Rb) * smoother(t), y]);
      }
      P.push([Rn, yLip], [Rn * 1.12, yLip + 0.006], [Rn * 1.12, H], [bore, H]);
      const bPts = P.map(([r, y]) => new THREE.Vector2(r * m, y * m));
      const bottleGeo = new THREE.LatheGeometry(bPts, 128);
      bottleGeo.computeVertexNormals();
      const bottleMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.04,
        transmission: 1,
        ior: 1.5,
        thickness: 0.05 * m,
        attenuationColor: new THREE.Color(0x2f7d45), // 병유리 초록(속 비치게 밝게)
        attenuationDistance: 0.16 * m,
        side: THREE.DoubleSide,
      });
      const bottleMesh = new THREE.Mesh(bottleGeo, bottleMat);
      bottleMesh.position.set(0.42, worldY, 0);
      scene.add(bottleMesh);

      // ── 병 속 와인 (투과성 액체, 깊은 레드 감쇠) ───────────────
      const Rw = (0.0368 - 0.0025) * m * 0.97;
      const yBase = worldY + 0.03;
      const yTop = worldY + 0.72;
      const wh = yTop - yBase;
      const wineGeo = new THREE.CylinderGeometry(Rw, Rw * 0.95, wh, 64, 1, false);
      const wineMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.12,
        transmission: 1,
        ior: 1.37,
        thickness: Rw * 2,
        attenuationColor: new THREE.Color(0x6e0c1a), // 깊은 레드와인(비치게 밝게)
        attenuationDistance: Rw * 0.9,
        side: THREE.DoubleSide,
      });
      const wineMesh = new THREE.Mesh(wineGeo, wineMat);
      wineMesh.position.set(0.42, yBase + wh * 0.5, 0);
      scene.add(wineMesh);

      // ── 테이블 (부드러운 바닥, 접지 그림자용) ──────────────────
      const floorGeo = new THREE.PlaneGeometry(20, 20);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0xcabfae,
        roughness: 0.55,
        metalness: 0,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = worldY;
      scene.add(floor);

      // ── 패스트레이서 ───────────────────────────────────────────
      const pathTracer = new WebGLPathTracer(renderer);
      pathTracer.tiles.set(2, 2);
      pathTracer.setScene(scene, camera);

      const info = infoRef.current;
      const loop = () => {
        if (disposed) return;
        pathTracer.renderSample();
        if (info) info.textContent = `patchtrace · samples ${pathTracer.samples | 0}`;
        raf = requestAnimationFrame(loop);
      };
      loop();
    }

    main().catch((e) => {
      const info = infoRef.current;
      if (info) info.textContent = "ERR " + (e?.message || e);
      console.error(e);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (mount) mount.innerHTML = "";
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" />
      <div
        ref={infoRef}
        className="absolute left-3 top-3 rounded bg-black/40 px-2 py-1 font-mono text-xs text-white/80"
      >
        loading…
      </div>
    </div>
  );
}
