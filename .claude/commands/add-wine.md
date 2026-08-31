---
description: 준 와인을 사이트에 추가 — 상세·산지·생산자·품종·국내 적정가까지 모두 챙긴다
---

사용자가 와인 정보(이름, 구매 정보 등)를 주면 wine.byb.kr 에 추가한다. 인자: $ARGUMENTS

목표는 "연결에 필요한 최소한"이 아니라 **화면에 필요한 모든 것**을 한 번에 채우는 것이다.
빠뜨리기 쉬운 것: 국내 적정가, 산지·생산자·품종 큐레이션, 시음 포인트.

## 먼저 챙길 정보 (사용자가 안 줬으면 웹 검증으로 채운다)
- 와인: 한국어·원어 이름, 종류(type), 빈티지, abv, 분류(classification)
- 생산자: 이름, 소개(설립연도·지역)
- 산지: 이름, 국가, 기후·토양, 대표 품종
- 품종: 이름(들), 블렌드 비율(알면)
- 구매: 구매일, 가격, 구매처, (마셨으면) 음용일·별점·메모·관찰한 색
- 국내 소매 적정가(원)

## 절차
1. **웹 검증(WebSearch/WebFetch)** — 생산자·산지·품종·스타일·abv 확인.
   확인 안 되는 사실은 **지어내지 말 것**(producer-info 의 "확인된 것만" 규칙).
   abv 미확인 시 그 카테고리 통상값으로 추정하고 주석에 "추정" 명시.

2. **`scripts/add-tastings.ts` 편집**
   - `REGIONS`: 새 산지면 추가 — `{ slug, nameKo, nameLocal, country, level, parentSlug, latitude, longitude }`.
     상위 국가(spain 등)가 없으면 그것부터. 좌표는 산지 중심 위경도.
   - `GRAPES`: 새 품종이면 추가 — `{ slug, nameKo, nameLocal, color: "red"|"white" }`.
     nameKo 는 wine-glass 색 매칭에 쓰이니 표준 표기로.
   - `ENTRIES`: 와인 항목 —
     `{ regionSlug, producer{slug,nameKo,nameLocal}, wine{slug,nameKo,nameLocal,type,classification?}, grapeSlugs:[{slug,percent?}], tasting{drankOn?,purchasedOn,purchasePrice,purchasePlace?} }`
     - **아직 안 마셨으면 `drankOn` 생략** → 구매 기록만 남는다.
     - 이미 있는 와인(재구매/추가 시음)은 `ENTRIES` 에 항목만 더한다(와인·생산자·산지는 재사용).
   - `WINE_DETAILS`: `{ abv?, notesKo }` — 시음 포인트는 "이 와인을 마실 때 무엇에
     주목할지"(첫 향→입안→여운, 온도·잔, 놓치기 쉬운 점). 웹 검증, 자연스러운 한국어.

3. **큐레이션 (해당 산지/생산자/품종이 없으면 추가)**
   - `src/features/wine/region-info.ts` — `RegionDetail { desc, climate?, soil?, classification?, keyGrapes?, styles? }`. 키=한국어 산지명(regionName.includes 매칭).
   - `src/features/wine/producer-info.ts` — `ProducerDetail { desc, homepage? }`. 키=이름 일부(공백제거 소문자 norm, includes). 홈페이지는 확인된 것만.
   - `src/features/wine/grape-info.ts` — `[aliases[], { desc, body?, acidity?, tannin?, aroma?, pairings?:[{food,why}] }]`. 레드/화이트 섹션에 맞게.

4. **국내 적정가** — `src/features/wine/wine-price-info.ts` 의 `PRICES` 에
   `{ low, high, note? }`(원). 실구매가가 "아주 잘 샀어요~비싸게" 중 무엇인지 판정하는
   기준선. **자주 빠뜨리니 꼭 챙긴다.** 2024–2025 국내 소매(마진·주세 포함) 감각.

5. **디저트/스파클링 주의**
   - type: `red|white|rose|sparkling|champagne|dessert|fortified`.
   - 카바·프로세코 등은 `sparkling`, 샴페인만 `champagne`.
   - **디저트는 색이 황금~레드로 다양**해 type 기본색이 안 맞는다. 필요하면
     `scripts/fix-catalog-data.ts` 처럼 `colorHex` 를 개별 지정.

6. **로컬 반영·검증**
   - `npx tsx scripts/add-tastings.ts` 실행.
   - `sqlite3 data/wine.db` 로 와인(type·abv·notesKo)·산지·생산자·품종·구매 기록 확인.
   - `npx biome check --write <편집한 파일들>` + `npx tsc --noEmit -p tsconfig.json`(관련 오류만 확인).
   - `npm run dev` → `http://localhost:3000/wine/<slug>` 에서 큐레이션·**가격 배지** 노출 확인.

7. **커밋·배포**
   - 기본 브랜치면 브랜치부터. 커밋 → PR → 머지.
   - add-tastings 는 배포 스크립트(`./server`)가 자동 실행하니 머지하면 서버 반영된다.
   - 단 `./server` 자체를 바꾸거나 **새 스크립트를 추가**했다면 첫 배포엔 안 돈다
     (실행 중인 옛 server) → 그 배포 뒤 서버에서 1회 수동 실행:
     `ssh ybbarng@byb.kr 'cd /home/ybbarng/wine.byb.kr && . "$HOME/.nvm/nvm.sh" && pnpm exec tsx scripts/<스크립트>.ts'`

## 값 규칙
- slug: 소문자·하이픈, 원어 romanize(특수문자→하이픈). 기존 한국어 slug 품종(메를로 등)은 그대로 참조.
- 날짜: 연도 없이 "8월 31일"이면 현재 연도로 해석하되 사용자에게 한 줄 확인.
- 구매처: 불명이면 `purchasePlace` 생략. 우리동네GS 앱 예약픽업은 `와인25플러스`, 오프라인 즉시구매는 `GS25`.
- 사실(설립연도·품종·산지·분류)은 웹 검증, 서술(시음 포인트·소개)은 작성.
