# 작업 스트림 조율 (병렬 세션용)

여러 세션·워크플로우가 동시에 일할 때 충돌을 피하려고 두는 문서다.

> 최종 갱신: 2026-08-27 · 상태: **산지·품종·탐험·학습 보강 모두 완료(머지). 소유 중인 파일 없음 — 전부 자유.**

---

## 완료 (전부 main에 머지됨)

산지 정보 보강 세션(worktree `wine-map`)이 진행하던 일은 모두 끝났고, **어떤 파일도 점유하지 않는다.** 다른 세션이 아래 파일을 포함해 자유롭게 작업해도 된다.

- **산지 상세**(`region/[slug]`) — 떼루아·내 기록 통계·대표 생산자·비슷한 산지. `region-info.ts`, `region-terroir.tsx`, `region-my-stats.tsx`, `region-producers.tsx`, `region-similar.tsx`.
- **생산자**(`/producer/[slug]`) — 소개·공식 홈페이지(`producer-info.ts`).
- **품종 상세**(`/grape/[slug]`) — 특성·아로마·페어링(이유 포함)·내 기록·대표 산지. `grape-info.ts`, `grape-character.tsx`, `grape-color.tsx`.
- **탐험**(`/explore`) — 세계 지도, "마신 곳만"·품종별 필터. `explore-map.tsx`.
- **학습**(`/learn`) — 8강 + 퀴즈(블록 기반: 표·카드·스케일·스펙트럼). `learn-content.ts`, `lesson-blocks.tsx`, `wine-quiz.tsx`.
- **경계 폴리곤** — 프랑스·이탈리아·아르헨티나·뉴질랜드·미국. `public/geo/region-shapes.geojson`, `scripts/append-admin-shapes.mjs`.
- 공유 파일 `region/[slug]/page.tsx`, `collection-queries.ts` — **더 이상 점유하지 않음.**

`region-info.ts`·`grape-info.ts` 같은 큐레이션 데이터는 이제 안정 상태라, 다른 세션이 내용을 늘리거나 고쳐도 된다.

---

## 남은 자유 작업(참고)

- **경계 폴리곤 추가** — 칠레·독일·헝가리·남아공·호주는 깨끗한 공개 와인경계 GeoJSON이 없어 원형 폴백. OSM 등에서 지역별로 받아 개별 검증 후 `scripts/append-admin-shapes.mjs`의 `SINGLE_SOURCES`에 넣으면 된다.
- **그 외 도메인** — 홈/쇼케이스, 3D(`FluidLab`) 등은 위 작업과 무관하다.

## 규칙
- 시작 전 `git fetch --all --prune`으로 최신 `origin/main` 확인.
- 큐레이션 데이터·설명은 코드에 둔다(DB에 값이 생기면 페이지가 그걸 우선).
