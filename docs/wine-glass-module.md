# 와인잔 모듈 (wine glass module) — 사용·확장 가이드

`src/components/FluidLab.tsx` + `src/components/FluidLabMount.tsx` 로 구성된, 실사에
가까운 3D 와인잔 경험 모듈. 잔에 담긴 와인의 **색·투명도·스월링·눈물(legs)** 을
렌더하고, **여러 잔 형태**와 **와인→잔 자동 매핑**을 지원한다.

기술 스택: Next.js + React + **three.js WebGPU**(`three/webgpu`, `three/tsl`).
렌더는 래스터라이즈 실시간(패스트레이싱 아님). 최상위 목표·판단 기준은
`docs/wine-experience-goals.md` 참고.

---

## 1. 빠른 사용

```tsx
import FluidLabMount from "@/components/FluidLabMount";
// 프리셋 컨트롤러까지 포함된 랩 화면
<FluidLabMount />
```

컨트롤러 없이 직접 제어하려면 `FluidLab` 을 쓴다(클라이언트 전용, `ssr:false` 로 dynamic import):

```tsx
<FluidLab
  wineAbsorb={[16, 78, 98]}  // Beer–Lambert 흡수계수 [R,G,B] (아래 3절)
  glassType={1}              // 잔 인덱스 (GLASSES 배열, 아래 2절)
/>
```

**Props (`FluidLab`)**
- `wineAbsorb?: [number, number, number]` — 와인 색(흡수계수). 실시간 반영(재빌드 없음).
- `glassType?: number` — 잔 형태 인덱스. **변경 시 씬 전체 재빌드**(useEffect deps).

상호작용: 잔을 **드래그**하면 흔들리고, **클릭**하면 자동 스월 3바퀴. 흔든 뒤 벽에
눈물(legs)이 맺혀 흘러내린다.

---

## 2. 잔 형태 추가·수정 (`GLASSES`, FluidLab.tsx 상단)

각 잔은 `GlassDef` 데이터로 정의된다. 발(foot)+기둥(stem)은 `footStem(footR, stemLen)`
로 공통 생성하고, **볼(bowl)만 형태별**로 준다.

```ts
type GlassDef = {
  key: string;
  label: string;         // UI 버튼 이름
  desc: string;
  footR: number;         // 발 반경 (큰 볼일수록 넓게 — 안정성)
  stemLen: number;       // 기둥 길이(= 볼 바닥 높이, 프로파일 y)
  bowl: [r, y][];        // 볼 곡선. y 는 "볼 바닥=0" 상대높이, 위로 갈수록 증가. 림까지.
  wallThickness: number; // 유리 벽 두께(프로파일 단위). 내부 반경 = 외부 - 이 값.
  fillLevel: number;     // 수면 높이(볼 바닥 기준 상대). 잔마다 적정 채움.
  sizeScale?: number;    // 화면 크기 배율(1=표준 높이, <1=작은 잔). 기본 1.
};
```

**핵심 규칙**
- 프로파일 = `[...footStem(footR, stemLen), ...bowl(y+stemLen)]` (setup 에서 조립).
- `worldScale` 은 자동: `(0.42 * 2.92 / 림높이) * (sizeScale ?? 1)`.
  → 모든 잔이 **같은 화면 높이**로 맞춰지고, `sizeScale` 로만 작은 잔(디저트)을 작게.
- 내부 공간은 `bowl` 반경 − `wallThickness` 로 자동. 와인은 이 내벽을 따라 담긴다.
- `fillLevel` 로 **어디까지 채울지**를 잔마다 지정(레드는 볼 중간, 화이트 적게,
  플루트 높게, 디저트 소량).

**새 잔 추가 절차**
1. `GLASSES` 에 항목 추가(볼 곡선은 바닥 0 상대높이로 작성, 부드럽게 몇 점만 —
   내부에서 CatmullRom 으로 매끄럽게 보간).
2. `FluidLabMount.tsx` 의 `GLASS`(인덱스 맵)·`GLASS_OPTIONS`(버튼)에 같은 순서로 추가.
3. `pnpm dev` 후 하단 버튼으로 확인. 채움/비율이 어색하면 `fillLevel`·`stemLen`·볼 곡선 조정.

현재 6종: 표준 · 보르도 · 부르고뉴 · 화이트 · 플루트 · 디저트.
비교 캡처: `docs/fluid-journey/glasses-5types-feet-stems.png`.

---

## 3. 와인 추가·색 조정 (`WINE_PRESETS`, FluidLabMount.tsx)

```ts
{ name: "메를로", absorb: [16, 78, 98], color: "#5a1122", glass: GLASS.bordeaux }
```

- `absorb` = **Beer–Lambert 흡수계수 [R,G,B]**. 큰 값 = 그 채널을 많이 흡수(빼기).
  - **레드**: R 작게, G·B 크게 → 붉게 남음. 예 [16, 78, 98].
  - **화이트/앰버**: B 크게, R·G 작게 → 노랑/금색. 예 샤르도네 [1.6, 3.2, 13].
  - 깊이(두께)가 얕은 소량 와인(디저트)은 흡수가 약하게 나오므로 **값을 키워** 보정.
- `color` = 버튼 스와치(대략색, 렌더와 무관).
- `glass` = **어울리는 잔 인덱스**(`GLASS.*`). 와인 선택 시 색과 잔이 **함께** 전환.

와인 클릭 → `pickWine()` 이 `setIdx`(색) + `setGlassIdx`(잔) 동시 호출. 하단 잔
버튼으로 수동 override 가능.

---

## 4. 렌더링 구조 (FluidLab.tsx, `FLUID_ON=false` 경로)

입자 유체(PBF)는 꺼져 있고(`FLUID_ON=false`), **표면·부피 기반**으로 렌더한다.
입자 시뮬 연구 기록은 `docs/fluid-simulation-status.md`.

### 4.1 와인 색·투명 — 흡수/굴절 패스
- 와인 메쉬는 **불투명**(유리 내장 transmission 이 보이게). 매 프레임:
  1. `wineThickRT` ← 와인 뒷면 거리(두께 t 계산용).
  2. `bgRT` ← **와인·유리 숨긴 뒤 장면**(배경만).
  3. 와인 `emissiveNode` = `texture(bgRT, screenUV + 굴절오프셋) × exp(−absorb·t)`.
- 화이트(흡수 작음) = 뒤 배경 비침(투명), 레드(흡수 큼) = 깊은 색. `t`=실제 시선 두께.
- 굴절 오프셋: 표면 법선(뷰)의 화면 투영 × 두께.

### 4.2 스월링 — 회전 파동 + 슬로싱
- 잔(그룹)을 마우스로 기울이고, 와인 수면은 월드 수평 유지 + 슬로싱 기울기.
- **슬로싱** = 2D 감쇠 진동자(`sloshX/Z`, `OMEGA=8`, `ZETA=0.055`, `COUPLE=2.7`,
  `SLOSH_MAX=0.78`). 잔 움직임 속도가 구동, 놓으면 관성으로 출렁이다 잦아듦.
- **회전 파동**(`surfWaveH`): 벽 타고 오르는 mode-1 크레스트(`WAMP1=0.08`) +
  회전 로브 mode-2,3(`WAMP2/3`, `W2SPD/W3SPD`). 위상 φ=슬로싱 벡터각 → 마루가 잔을 돈다.
  정지 시 `waveAct=0` → 평면. (고정 방향 평면파는 연못 물결처럼 부자연 → 폐기.)
- 부피 보존: 닫힌 메쉬 signed volume 을 Newton 4회로 수면 높이 `liqH` 보정.

### 4.3 눈물(legs) — 투명 굴절 자국
- **색 없음.** 젖은 벽 자리에서 유리 법선만 미세 섭동 → 그 자리만 굴절이 살짝 달라짐.
  유리 `material.normalNode` 에 `filmMask` 의 화면기울기(`dFdx/dFdy`) × `bump(-7)`.
  마른 곳은 mask=0 → 섭동 0 → 유리 그대로.
- **실제 젖음 높이 기반**: 각 방위의 수위선 `pwCol`(와인이 벽 만난 높이)을
  `wetTopArr`(둘레 배열 → `legTex` 96) 에 누적. 정착 수위보다 오른 방위만 → **왕관
  방지, 오른 쪽만**. 느리게 기울여도 pw 오르면 생김(속도 무관).
- **범위**: 자국 위쪽은 도달 최고점의 **4/5**(peak 그대로면 높아 보임).
- **흘러내림**: 젖는 즉시(짧은 지연) 방울 머리가 최고점→수위선으로 내려가며 자취.
  `dripT`(마르는 동안 진행), 줄기별 phase 시차. 마르면(`wetness`↓) 사라짐.

### 4.4 환경광·재질
- **절차적 스튜디오 환경**(DataTexture equirect): 따뜻한 어두운 base + 키 소프트박스
  + 가로 스트립 조명(수평 수면 하이라이트). 파란 하늘 반사 방지가 목적.
- **IBL 세기는 `scene.environmentIntensity`(0.28)** 로 제어. ⚠️ 이 WebGPU 노드
  재질은 `material.envMapIntensity` 를 **무시**한다(수면 밝기에 영향 없음). 이걸
  몰라 "흰 원반"을 오래 못 잡았음.
- 유리: `MeshPhysicalNodeMaterial` transmission=1, roughness 0.04, ior 1.5.
- 와인 본체: roughness 0.18, `envMapIntensity 0.18`(무시되나 남겨둠).

---

## 5. 튜닝 노브 요약 (자주 만지는 값)

| 목적 | 위치 | 현재값 |
|---|---|---|
| 와인 색 | `WINE_PRESETS[].absorb` | 프리셋별 |
| 잔 형태·채움 | `GLASSES[]` | 잔별 |
| 수면 반사 세기(흰 원반↔어두움) | `scene.environmentIntensity` | 0.28 |
| 수면 광택(반짝임) | 와인 `roughness` | 0.18 |
| 스월 출렁임 크기 | `SLOSH_MAX`, `COUPLE` | 0.78, 2.7 |
| 스월 감쇠(얼마나 오래) | `ZETA` | 0.055 |
| 파동 마루·잔물결 | `WAMP1/2/3` | 0.08/0.024/0.014 |
| legs 세기(굴절) | `bump` `.mul(-7.0)` | -7 |
| legs 흘러내림 속도 | `dripT += dt*0.4` | 0.4 |
| legs 마르는 속도 | `wetness -= dt*0.12` | 0.12 |
| 자동 스월 기울기·바퀴 | `GMAX`, `ROT` | 0.32, 3 |

---

## 6. 한계·함정 (다음 사람 주의)

- **`material.envMapIntensity` 무시**(WebGPU 노드 재질). IBL 은 `scene.environmentIntensity`.
- **중첩 투명 한계**: 유리 내장 transmission 은 불투명 버퍼만 참조 → 투과 물체 안의
  투과 물체를 못 봄. 그래서 와인은 불투명 + `bgRT` 수동 굴절로 투명을 흉내.
- **메니스커스(수면 테두리 상승)는 폐기**: 위에서 내려다보는 유광 뷰에선 능선이
  "원반 테"를 재생성해 오히려 어색. (능선 반사가 원반처럼 보임.)
- **legs 는 emissive(발광)로 하면 안 됨**: 빛을 더해 "밤 조명"처럼 빛남. 자국은
  빛을 흡수/굴절해야 함 → normalNode 섭동으로 해결.
- **와인 점성 변주는 미구현**: 아이스와인 등 걸쭉함(굵고 느린 legs)은 후속 여지.
- **붓기(pour) 미완**: 병 기울여 따르는 연출은 골격만 보존(`FLUID_ON` 경로·bottleGroup).
- **dev 서버**: 백그라운드 `&` 실행은 세션 종료 시 죽을 수 있음. 프롬프트에서
  `! pnpm dev` 로 직접 띄우는 게 안정적.

## 7. 관련 문서
- 최상위 목표·검토 렌즈: `docs/wine-experience-goals.md`
- 입자 유체 연구 기록(종료): `docs/fluid-simulation-status.md`, `docs/pathtracing-research.md`
- 시도별 캡처(발표 자산): `docs/fluid-journey/`
