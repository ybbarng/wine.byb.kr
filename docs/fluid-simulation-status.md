# 와인 유체 시뮬레이션 — 진행 상황 및 계획

> 대화 압축/새 세션 후에도 이어가기 위한 개발 상태 문서. (2026-08-21 기준)
> 발표용 여정 서술은 `docs/fluid-journey.md`, 시행착오 캡처는 `docs/fluid-journey/`.

## 지금 어디까지 왔나

- **브랜치**: `pbf` (MLS-MPM 구현은 `webgpu-fluid` 브랜치에 보존됨)
- **최신 커밋**: `a9c1278` (SSFR 2단계)
- **핵심 파일**: `src/components/FluidLab.tsx` (PBF 물리 + SSFR 렌더), `/lab` 페이지
- **동작 상태**: PBF 비압축 유체가 잔에 자연 부피로 담김 · 안 샘 · 정지 근접. SSFR 1–2단계(깊이 렌더 → 법선 재구성)까지. 표면 blur·합성·색은 미완.

## 아키텍처

### 물리: PBF (Position Based Fluids, Macklin & Müller 2013)
`render()` 루프의 compute 커널 순서:
1. **predict** — `v += g·dt`, `predicted = x + v·dt`
2. **clearCell + buildGrid** — 해시 그리드로 이웃 탐색 (셀당 atomic 카운트 + 인덱스 버킷)
3. **solver ×SOLVER_ITER**: `lambda`(밀도 제약 λ 계산) + `deltaP`(위치 보정 Δp + 표면장력 s_corr, 경계 clamp)
4. **velocity** — `v = (predicted − x)/dt` + XSPH 점성

- **경계**: 잔 내벽 SDF. `bowlRadiusAtCoordY`(다항식, CPU) / `clampToBowl`(셰이더)로 `deltaP`에서 predicted를 볼 안으로. MLS-MPM의 "대류↔샘 딜레마"가 PBF에선 없음(위치 강제 안 하고 밀도 제약으로 비압축).
- **버퍼**: `particleBuffer`(struct: position, velocity, predicted / STRIDE 12), `lambdaBuffer`, `densityBuffer`(로그), `cellCountBuffer`(atomic), `cellIdsBuffer`.

### 렌더: SSFR (Screen-Space Fluid Rendering, 진행 중)
- `fluidScene`: 입자 sphere(ico 0.03, 겹치게 키움) → `depthRT`에 뷰 공간 깊이 저장.
- `surfaceQuad`(QuadMesh): 깊이 → view 위치 복원 → 이웃 차로 법선 재구성 → 와인 색 + 프레넬.
- **유리잔**: `scene`에 `MeshPhysicalNodeMaterial`(transmission, ior 1.52). 배경 HDR.
- **미완**: bilateral blur(깊이 매끈), 배경/유리잔 굴절 합성, 색 보정.

## 핵심 파라미터 (FluidLab.tsx 상단 상수)
| 이름 | 값 | 의미 |
|---|---|---|
| particleCount | 16384 (8192·2) | 입자 수 = 와인 양(향후 파라미터화) |
| H | 0.045 | SPH 커널 반경 (coord 0~1 공간) |
| SOLVER_ITER | 8 | PBF solver 반복 (밀도 수렴) |
| C_XSPH | 2.0 | XSPH 점성 (속도 감쇠) |
| SCORR_K | 0.00003 | 표면장력 강도 |
| GRAVITY | −9.81²/64 | coord 스케일 중력 |
| restDensity | 50000 | 목표 밀도 (실측 ~50340) |
| 입자 렌더 | ico 0.03 | 겹쳐서 알갱이 완화 |

## 검증 방법 (시각만으론 부족 — 로그가 정답)
- `shot-speed.mjs` → 콘솔 `[speed]` 로그: **vAvg**(평균 속도=미동), **vrAbs**(반경 속도=대류), **dAvg**(밀도), **out**(볼 밖 입자 수). `/shot*.mjs`는 gitignore.
- `shot-anim.mjs` → 6프레임 캡처 → `magick montage`로 몽타주.
- **현재 지표**: vAvg ~0.03(미동), dAvg ~50340(rest 50000 → ratio 1.007 = 거의 비압축), out=0(안 샘), vrAbs ~0.015(대류 적음).
- 디버그 로그는 `render()`에서 매 60프레임 GPU readback → **성능 부담(나중 제거 대상)**.

## 왜 MLS-MPM → PBF 인가 (여정 요약)
MLS-MPM(약압축)으로 시작. 잔 경계에서 **"대류↔샘 딜레마"**: 위치 clamp를 넣으면 벽 입자를 안으로 밀어 대류(반경 왕복), 빼면 미세 드리프트로 샘. 밀도/속도/대류/볼밖 로그로 진단해 **약압축의 본질적 한계**임을 규명(밀도가 restDensity의 2.5배로 과압축, 압력 진동). 게다가 붓기(격자 물줄기 끊김)·스월링(움직이는 경계)·벽 코팅(표면장력 없음)에 구조적 한계. → **PBF 전환**: 밀도 제약으로 비압축 직접 강제(첫 구현에 밀도 ratio 2.5→1.01), SDF 경계로 딜레마 소멸, 표면장력 내장.

## 다음 계획 (우선순위 순)
1. **SSFR 마무리**
   - (a) **bilateral blur**: `depthRT` → `blurRT`(separable, depth 차 가중). 깊이 매끈 → 법선 매끈 → 진짜 표면.
   - (b) **합성**: `scene`(배경+유리잔)을 texture로 렌더 → `surfaceQuad`에서 굴절(refraction) 샘플 + 표면 합성.
   - (c) **색 보정**: 진한 버건디, thickness 기반 흡수(Beer-Lambert), 프레넬 강도 조정.
2. **붓기** (병에서 따르기) — 위에서 입자 유입(스폰), 물줄기.
3. **스월링** (잔 회전) — 경계에 회전 속도 부여, 관성 + 벽 코팅(legs).
4. **디버그 로그 정리** (성능) — 렌더 작업 시 끄기.
5. **와인 양 파라미터화** (particleCount) + 잔 종류(glass 객체).

## 알려진 이슈 / 주의점
- **미동 vAvg ~0.03**: PBF가 매 프레임 밀도 제약을 위치 보정으로 만족 → 속도 잔류(본질, 완전 0 어려움). XSPH·표면장력으로 완화. 정지 임계(인위적)는 붓기·스월링과 충돌하니 **쓰지 않기로** 결정. SSFR 표면 아래로 들어가면 시각적으로 완화 기대.
- **잔 교체**: `glass` 객체(프로파일+wallThickness+bowl y범위+worldScale/Y)만 바꾸면 유리 메쉬와 물리 경계가 자동 일치.
- **TSL 함정**(MLS-MPM 여정에서 확인): 컴퓨트 셰이더에서 **배열 동적 인덱스 조회가 막힘** — `uniformArray`는 고정 인덱스만, CPU 초기값 `instancedArray`는 업로드 생략, `DataTexture`는 compute에서 load 실패. → 다항식 계수를 개별 `uniform`으로 넘겨 산술 평가하는 식으로 우회. (해시 그리드의 `cellIdsBuffer`는 compute에서 write하는 storage라 동적 read 가능.)
- **작업 절차**(사용자 요청, CLAUDE.md에도 명시): 시각화 가능한 상태마다 커밋 — 실행 전 원인·기대를 커밋, 실행 후 에러면 amend·시각화되면 결과 보강 amend. 캡처는 `docs/fluid-journey/`에.

## 발표 자산
- `docs/fluid-journey/`: `boundary-01~18`(MLS-MPM 경계/안정화 딜레마), `pbf-01~06`(PBF 전환 + SSFR). 각 시행착오의 캡처.
- `docs/fluid-journey.md`: 발표 서술(Act 1~11, MLS-MPM 초기 여정). **PBF 전환 이후 Act는 아직 미작성 → 추가 필요.**
