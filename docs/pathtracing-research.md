# 패스트레이싱(경로 추적) 연구 — 자료 보존용

> 2026-08-22. "three.js 말고 다른 걸 쓸 수 없나?"라는 질문에서 출발해,
> 반투명 중첩(유리 너머로 병·와인이 비치는) 문제를 실제로 검증한 기록.
> **결론: 붓기(실시간)에 집중하기로 하고 이 코드는 제거. 아래는 재현용 자료.**

## 핵심 결론

- **"다른 엔진"으로는 안 풀린다.** 반투명 중첩을 근사로 처리하는 건
  Babylon.js·PlayCanvas·Unity·Unreal·네이티브 게임까지 **실시간 래스터라이제이션의 공통 방식**.
  엔진 브랜드 문제가 아니다.
- **진짜 해법은 "다른 렌더링 방식" = 레이/패스 트레이싱.** three.js를 떠날 필요 없이
  `three-gpu-pathtracer`(WebGL)로 브라우저에서 가능.
- **검증됨(캡처 확인):**
  - 브라우저 패스트레이싱 실제 작동, ~125 샘플에 노이즈 없이 수렴.
  - **중첩 투과가 물리적으로 정확** — 맑은 병 유리 너머로 속 붉은 와인이 그대로 비침.
    (래스터 three.js가 못 하던 바로 그것)
- **결정적 트레이드오프: 점진 수렴이라 정지 장면 전용.** 60fps 실시간 유체 붓기는 불가.
  → 정지 히어로 한 장엔 실사를 주지만, 붓는 순간엔 실시간 래스터가 필요.
- 처음엔 올리브 금속처럼 보였는데 근본 문제가 아니라 아트 디렉션 이슈였음:
  1. **환경맵 부적합** — royal_esplanade(따뜻한 야외)는 유리에 안 맞음.
     유리 제품샷은 어두운 배경 + 밝은 소프트박스(스튜디오)라야 유리감이 생김.
  2. **유리 형상이 단일벽(얇은 껍질)** — 유체 시뮬용 프로파일 재활용 탓.
     진짜 유리는 속벽+겉벽 이중이라 이중 굴절이 유리감을 만듦.

## 재현 방법 (필요 시)

```bash
pnpm add three-gpu-pathtracer three-mesh-bvh
```

- 고수준 API: `WebGLPathTracer`(three-gpu-pathtracer 0.0.24)
  ```js
  const pathTracer = new WebGLPathTracer(renderer); // renderer = WebGLRenderer
  pathTracer.tiles.set(2, 2);
  pathTracer.setScene(scene, camera);
  // 루프: pathTracer.renderSample();  (pathTracer.samples 로 누적 확인)
  ```
- 재질은 `MeshPhysicalMaterial`(transmission/ior/thickness/attenuationColor/
  attenuationDistance)를 그대로 인식 → 유리·병유리·와인 모두 투과.
- 환경은 `scene.environment`(HDR)로 조명·반사. 배경은 별도 색 지정 가능.
- 유체(WebGPU)와는 렌더러가 달라 한 화면에서 못 섞음 → 정지 showcase는 별도 페이지로.

## 원본 코드

`src/components/PathTraceShowcase.tsx` + `src/app/showcase/`. git 이력에 보존
(커밋: "패스트레이스 정지 showcase 추가" 및 후속 튜닝 커밋들). 이 문서 작성 후 제거.
