# 와인 유체 시뮬레이션 — 진행 상황 및 계획

> 대화 압축/새 세션 후에도 이어가기 위한 개발 상태 문서. (2026-08-21 기준)
> 발표용 여정 서술은 `docs/fluid-journey.md`, 시행착오 캡처는 `docs/fluid-journey/`.

## 지금 어디까지 왔나

- **브랜치**: `pbf` (MLS-MPM 구현은 `webgpu-fluid` 브랜치에 보존됨)
- **최신 커밋**: `8d466e7` (PBF substep ×2)
- **핵심 파일**: `src/components/FluidLab.tsx` (PBF 물리 + SSFR 렌더), `/lab` 페이지
- **동작 상태**: PBF 비압축 유체가 잔에 담김 · 안 샘(out 0) · substep으로 폴짝 완화(vMax 0.6→0.2, vAvg 0.028). **SSFR 완료**(깊이→bilateral blur→법선→셰이딩→배경/유리잔 알파 합성) — 매끈한 표면이 유리잔에 담겨 보임.
- **미동(진동) 해결됨 ✅**: EPS_RELAX 100→500이 결정적. vAvg 0.031→0.015·vMax 0.2→0.023(사실상 정지). 상세는 아래 "진동 해결 완료" 절.
- **남은 이슈**: ① 색이 밝은 분홍 = **슬러시 느낌**(불투명 셰이딩) → 반투명(굴절+깊이 색) 필요(다음 최우선). ② SSFR pass 순서: depth(depthRT)→blur(blurRT)→scene(배경+유리잔)→surfaceQuad(알파, autoClear=false로 배경 위 합성).

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

## 진동(미동) 해결 완료 ✅ (2026-08-22)
**증상**: 유체가 "살아 숨쉬는 심장"처럼 잔이 멈춰도 계속 미세하게 움직임. (vAvg ~0.031, vMax ~0.2)

**로그 진단으로 가설 두 개 기각**:
- 부호 있는 반경/수직 평균속도(vrNet·vyNet) 추가로 관찰 → vrNet~0 = **결맞은 박동 아님**(무작위 지터). "심장 박동" 가설 기각.
- 속도 감쇠(damp 0.9)·substep 2→4 모두 **거의 무효** → 잔류 속도가 dt·damp·밀도와 **무관하게 불변**. "gravity sag ∝ dt" 가설도 기각. 속도가 매 프레임 `v=(pred−pos)/dt`로 재계산돼 solver 위치 보정이 감쇠를 씻어냄.

**진짜 원인 = 두 성분**:
1. **표면장력 한계 순환**(~0.012): s_corr(인력)이 자연 평형 없이 끌고→밀도 되밀고 반복. s_corr=0으로 −40%(0.031→0.019) 확인. 단 s_corr은 vMax(표면 입자 튐)를 억제하므로 완전히 못 끔 → **3e-5→1e-5로 절충**.
2. **solver 재배열 노이즈**(~0.019 바닥값): 입자가 격자 아닌 잼 상태 + **제약이 너무 뻣뻣**(EPS_RELAX=100)해 위치를 과격하게 스냅 → 속도 노이즈. **EPS_RELAX 100→500**(λ 분모 완화, CFM)이 **결정적 레버** → vAvg 0.023→**0.003(10배↓)**, vMax→0.006(30배↓). 사실상 정지.

**핵심 교훈**: PBF 미동의 주범은 압력 진동이 아니라 **과도하게 뻣뻣한 제약**. EPS_RELAX(constraint softening)로 부드럽게 하면 비압축(밀도 ratio 1.006 유지)은 지키면서 지터만 급감.

**감쇠(damp)는 hack이라 최종 제거**(사용자 지적 "느리게 떨어져" + "중력 실제값 바꾸지 마"): 중간에 속도 감쇠로 진동을 눌렀지만 감쇠는 에너지를 인위로 빼는 **비물리 항** → 낙하를 늦추고 진동도 가릴 뿐. 중력을 올려 보상하려 했으나 중력↑ ∝ λ↑ ∝ 지터↑ 상충 + 중력은 실제 물리값이라 튜닝 금지. → **감쇠·속도상한 전부 제거, 중력 실제값 복귀.** 진동은 정당한 수치 방법만으로: **EPS_RELAX 500 + SOLVER_ITER 8→12**(수렴↑). 감쇠 없이 t=2s부터 vAvg 0.003·vMax 0.006(정지), 밀도 50280(1.006 비압축), out 0. 낙하는 감쇠 없어 물리 그대로(t=1s vMax 0.44). **두 문제(느린 낙하·진동)의 원인이 같은 감쇠였다.** 캡처 `pbf-10-vibration-fixed-clean.png`.

**큰 튐(탭 전환·큰 화면) 해결 — 고정 타임스텝**(사용자: "탭 갔다 오면 움직여", "전체화면에서 크게 튀어"): 진짜 원인은 **물리 타임스텝이 프레임 타이밍에 의존**한 것. `dtUniform = clamp(timer.getDelta())/substep`이라 (a) 탭 백그라운드→복귀 시 누적된 큰 getDelta, (b) 큰 화면의 낮은 프레임률(dt가 clamp 1/60까지 커짐)에서 물리 스텝이 커져 확 튐. **재현**: 탭 백그라운드 8초 후 복귀 → vMax 0.004→**1.166**(300배 스파이크). **해결**: deltaTime 대신 **고정 1/60**을 써 프레임률과 완전히 분리(표준 물리엔진 방식). 재검증: 복귀 후 vMax **0.002**(스파이크 소멸), 큰 화면도 vAvg 0.0004. 대가: 느린 기기에선 살짝 슬로모션(안정적). 필요하면 상한 있는 accumulator로 실시간 페이스 복원 가능. 캡처 `pbf-12-fixed-timestep-bigscreen.png`.

**약한 점성(0.99)**도 추가: 소산 0(마찰 없는 진자)이면 슬로싱이 안 잦아드는 비물리 → 실제 유체 점성 그대로. 종단속도 1.25 ≫ 관측 낙하 0.44라 낙하는 안 늦추고 출렁임만 잡음.

**현재 파라미터**: SCORR_K 1e-5, EPS_RELAX 500, GRAVITY −9.81²/64(실제값), **점성 0.99**, **고정 타임스텝 1/60**, substep 2, SOLVER_ITER 12.

**핵심 교훈(진동 최종)**: 미동/튐의 원인은 세 겹이었다 — ① 뻣뻣한 제약(EPS_RELAX) ② 표면장력 순환(s_corr) ③ **프레임률 의존 타임스텝**(가장 큰 튐). 특히 ③은 물리 로직이 아니라 **프레임 루프 구조** 문제라, 시뮬 파라미터를 아무리 만져도 안 잡히고 로그(탭 복귀 vMax 스파이크)로만 규명됐다.

## 다음 계획 (우선순위 순)
1. **슬러시 → 반투명 와인**: SSFR surfaceQuad를 반투명으로. 배경을 `sceneRT`에 렌더 → 굴절(screenUV를 법선으로 offset해 sceneRT 샘플) + 깊이 기반 색 흡수(Beer-Lambert). **주의**: surfaceQuad를 fullscreen opaque로 바꾸고(배경 sceneRT 샘플 포함) render에서 `scene→sceneRT`, `surfaceQuad→화면`. (한 번 착수했다 진동 우선으로 되돌림.)
3. **붓기** (병에서 따르기) — 위에서 입자 유입(스폰), 물줄기.
4. **스월링** (잔 회전) — 경계 회전 속도 + 관성 + 벽 코팅(legs).
5. **디버그 로그 정리** (성능) — 렌더 작업 시 render()의 readback 로그 끄기.
6. **와인 양 파라미터화** (particleCount) + 잔 종류(glass 객체).

## 알려진 이슈 / 주의점
- **미동 vAvg ~0.03**: PBF가 매 프레임 밀도 제약을 위치 보정으로 만족 → 속도 잔류(본질, 완전 0 어려움). XSPH·표면장력으로 완화. 정지 임계(인위적)는 붓기·스월링과 충돌하니 **쓰지 않기로** 결정. SSFR 표면 아래로 들어가면 시각적으로 완화 기대.
- **잔 교체**: `glass` 객체(프로파일+wallThickness+bowl y범위+worldScale/Y)만 바꾸면 유리 메쉬와 물리 경계가 자동 일치.
- **TSL 함정**(MLS-MPM 여정에서 확인): 컴퓨트 셰이더에서 **배열 동적 인덱스 조회가 막힘** — `uniformArray`는 고정 인덱스만, CPU 초기값 `instancedArray`는 업로드 생략, `DataTexture`는 compute에서 load 실패. → 다항식 계수를 개별 `uniform`으로 넘겨 산술 평가하는 식으로 우회. (해시 그리드의 `cellIdsBuffer`는 compute에서 write하는 storage라 동적 read 가능.)
- **작업 절차**(사용자 요청, CLAUDE.md에도 명시): 시각화 가능한 상태마다 커밋 — 실행 전 원인·기대를 커밋, 실행 후 에러면 amend·시각화되면 결과 보강 amend. 캡처는 `docs/fluid-journey/`에.

## 발표 자산
- `docs/fluid-journey/`: `boundary-01~18`(MLS-MPM 경계/안정화 딜레마), `pbf-01~06`(PBF 전환 + SSFR). 각 시행착오의 캡처.
- `docs/fluid-journey.md`: 발표 서술(Act 1~11, MLS-MPM 초기 여정). **PBF 전환 이후 Act는 아직 미작성 → 추가 필요.**
