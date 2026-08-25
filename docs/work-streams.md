# 작업 스트림 조율 (병렬 세션용)

여러 세션·워크플로우가 동시에 일할 때 **충돌을 피하려고** 두는 살아있는 문서다.
다른 워크플로우는 아래 **"진행 중 / 예약"** 파일은 건드리지 말고, **"자유"** 에서 골라 일한다.
각 스트림이 끝날 때마다 담당자가 이 문서를 갱신한다.

> 최종 갱신: 2026-08-25 (🅐·🅑·🅒·🅓 완료 — PR 준비) · 담당 세션: 산지 정보 보강(worktree `wine-map`)

---

## 지금 진행 중 — 산지 정보 보강 (브랜치 `region-enrich`)

한 브랜치에 스트림별 커밋을 쌓아 순차 진행 → 다 되면 PR 하나. **이 브랜치가 다루는
파일은 다른 워크플로우가 건드리지 말 것**(특히 아래 "공유 파일").

| 스트림 | 내용 | 상태 |
|---|---|---|
| 🅐 떼루아 | 기후·토양·등급·주력품종·스타일 (`region-info` 구조화) | ✅ 완료(커밋) |
| 🅑 내 기록 통계 | 이 산지 와인 N병·평균 별점·평균가 (`TastingNote` 파생) | ✅ 완료(커밋) |
| 🅒 대표 생산자 | 산지의 생산자 목록 + `/producer/[slug]` 신설 | ✅ 완료(커밋) |
| 🅓 비슷한 산지 | 품종 기반 추천 교차 링크 | ✅ 완료(커밋) |

**→ 4개 스트림 모두 완료. `region-enrich` 브랜치를 PR로 올린다. 머지되면 이 절 전체가 "자유"로 풀린다.**

### 이 세션이 소유(수정 중, 충돌 주의)한 파일
- `src/app/region/[slug]/page.tsx` — **공유 파일**. 순차 관리 중이니 다른 세션은 건드리지 말 것.
- `src/features/wine/collection-queries.ts` — **공유 파일**. 쿼리는 여기에 append 예정.
- `src/features/wine/region-info.ts`, `region-terroir.tsx`, `region-hierarchy.tsx`, `region-map.tsx`
- `src/features/wine/grape-color.tsx`, `country-names.ts`
- (예정) `src/app/producer/[slug]/`, `src/features/wine/region-stats.ts`, `region-similar.ts`

---

## 자유 — 다른 워크플로우가 해도 되는 일

산지 파일만 피하면 아래는 독립적으로 진행해도 충돌이 거의 없다.

### 🅔 프랑스 외 세부 경계 폴리곤 — 대체로 마무리
- **완료(실제 경계): 프랑스 · 이탈리아 5 · 아르헨티나 2 · 뉴질랜드 2 · 미국 5.**
  깨끗한 공개 데이터가 있는 나라(INAO, openpolis, geoBoundaries, UCDavis AVA/CC0).
- **원형 폴백 유지: 칠레·독일·헝가리·남아공·호주.** 이 나라들의 실제 *와인* 경계는
  깨끗한 공개 GeoJSON이 없다(조사 결론). OSM 수작업 추출(정확도 위험)이나 로그인/유료
  행정경계뿐이라, 라이브에 부정확한 경계를 넣느니 원형을 유지한다. 호주는 데이터는
  있으나(Wine Australia) 산지가 대륙에 흩어져 국가 줌에서 너무 작아 이득이 적다.
- 소유 파일: `public/geo/region-shapes.geojson`, `scripts/append-admin-shapes.mjs`.
  **페이지 코드 수정 없음** — `region-map.tsx`가 폴리곤이 있으면 자동으로 경계 채색.
  단, 산지가 작은 나라는 `wine-geo.ts`의 국가 bbox를 산지 쪽으로 좁혀야 보인다(미국=서부).
- 형식: `properties`는 `{country, region, source}`, 좌표 3자리 반올림(해안선 촘촘한
  NZ·큰 밸리는 2자리). `region` 키는 `wine-geo.ts`의 산지 이름과 맞춰야 라벨·강조가 붙는다.
- 나중에 나머지 나라를 추가하려면 OSM Overpass에서 지역별 relation을 GeoJSON으로 받아
  개별 검증 후 `SINGLE_SOURCES`에 넣으면 된다(정확도 검증 필수).

### 그 외 도메인 (산지와 무관)
- 홈/쇼케이스, 셀러(`/cellar`), 학습(`learn`), 관리자(`admin`), 3D(`FluidLab` 등).
- 이들은 산지 파일과 겹치지 않으므로 병렬 안전.

---

## 규칙
- **공유 파일**(`region/[slug]/page.tsx`, `collection-queries.ts`)은 이 세션이 순차 관리 중.
  꼭 손대야 하면 append만 하고, 되도록 이 세션이 끝날 때까지 피한다.
- 새 기능은 **자기 소유 모듈 + 컴포넌트**로 만들고 페이지엔 렌더 한 줄만 추가(auto-merge 친화).
- 최신 상태는 `origin/main` 기준. 시작 전 `git fetch --all --prune`.
