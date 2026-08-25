# 사이트 테마 가이드

새 페이지·컴포넌트를 만들 때 이 문서의 토큰과 규칙만 쓴다. `gray/slate/zinc/white`
같은 Tailwind 기본 색이나 새로운 `#hex`를 화면 요소에 직접 쓰지 않는다. 색이
필요하면 먼저 여기에 맞는 토큰이 있는지 본다. 없으면 토큰을 새로 정의하고 이
문서에 적는다.

## 팔레트 (단일 소스: `src/app/globals.css`)

밝은 **웜 톤** 테마. 배경색은 3D 와인잔 모듈의 캔버스 렌더색과 같아서 홈에서
글라스와 페이지 사이에 이음새가 없다.

| 토큰 | 값 | Tailwind 클래스 | 역할 |
| --- | --- | --- | --- |
| `--background` | `#bda588` | `bg-background` | 페이지 배경 (웜 타우프). 글라스 캔버스 렌더색과 동일 |
| `--foreground` | `#2b1712` | `text-foreground` | 본문·제목 등 기본 텍스트 (짙은 웜 브라운) |
| `--muted` | `#6d5a49` | `text-muted` | 보조 텍스트 (메타·라벨·설명) |
| `--card` | `#ece0cd` | `bg-card` | 떠 있는 표면 — 카드·검색바·드롭다운 (살짝 밝은 크림) |
| `--on-accent` | `#f6efe3` | `text-on-accent` | 어두운 액센트 **채움** 위 텍스트 (웜 오프화이트) |
| `--wine` | `#6e1a33` | `text-wine` `bg-wine` | 딥 와인 — 로고·주 버튼 채움 |
| `--wine-bright` | `#9d2846` | `bg-wine-bright` | 와인 밝은 변형 — hover·강조 바 |
| `--gold` | `#8a5616` | `text-gold` | 골드 액센트 (날짜·보조 링크). 웜 배경에서 읽히게 어둡게 |
| `--rose` | `#8a4a54` | `text-rose` | 뮤트 와인로제 — 보조 액센트(테두리 등). **본문 텍스트로 쓰지 말 것** |

## 의미별 사용 규칙

- **텍스트**: 기본 = `text-foreground`, 보조 = `text-muted`. 필요하면 투명도로
  단계를 준다(`text-muted/70`). 밝은 rose를 본문 텍스트로 쓰지 않는다(옛 다크
  테마 잔재 — 밝은 배경에서 흐릿하다).
- **표면(카드)**: 떠 있는 표면은 `bg-card`(+ 반투명 `bg-card/70`, `backdrop-blur`).
  hover 강조는 `hover:bg-foreground/5`. 반투명 흰색(`bg-white/5`)은 쓰지 않는다 —
  밝은 배경에서 거의 안 보인다.
- **테두리**: `border-foreground/10`~`/15` 기본. 강조는 `border-gold/20`,
  `border-foreground/25`(hover).
- **채움 버튼**: `bg-wine text-on-accent`(주), hover `bg-wine-bright`. 어두운
  채움 위에는 반드시 `text-on-accent`(밝은 텍스트) — `text-foreground`(어두움)를
  얹으면 대비가 무너진다.
- **아웃라인 버튼**: `border-gold/30 bg-gold/10 text-gold` hover `bg-gold/20`.

## 폰트

`@theme inline`에 매핑돼 있다.

- `font-sans` — Pretendard (본문 기본)
- `font-serif` — Playfair Display (제목·와인 이름)
- `font-logo` — Cormorant Garamond (로고 워드마크 전용)
- `font-mono` — Geist Mono (날짜·수치)

## 공용 컴포넌트

- **`BrandLogo`** (`src/components/BrandLogo.tsx`) — 와인잔 심볼(`WineMark`) +
  `wine` 워드마크. 모든 헤더가 이걸 쓴다. 로고를 새로 그리지 않는다.
- **헤더 두 종류**
  - `ShowcaseHeader` — 홈·와인 상세·산지/품종/종류 결과 등 **풀스크린 쇼케이스**
    페이지용. 통합 검색(→ `/wine/[slug]`) 포함. `absolute inset-x-0 top-0`.
  - `SiteHeader` — 셀러·학습 등 **콘텐츠 페이지**용. 검색 없이 로고 + 내비 +
    `AdminBadge`. `max-w-5xl` 정적 배치.
  - 둘 다 하단에 같은 와인톤 헤어라인(그라데이션 `rgba(110,26,51,0.15)`)을 둔다.
- **`WineDetailView`** (`src/components/WineDetailView.tsx`) — 3칸 쇼케이스 레이아웃
  (왼쪽 글라스 · 가운데 산지 지도 · 오른쪽 상세). 와인 상세와 산지/품종/종류
  결과 페이지가 공유한다. `children`으로 오른쪽 패널 내용을 넘긴다.
- **`WineList`** (`src/components/WineList.tsx`) — 컬렉션 상세 패널의 와인 목록.
  각 항목 → `/wine/[slug]`.
- **글라스 색 매핑**: `wineGlassFor(type, grapeNames)`
  (`src/features/wine/wine-glass.ts`) — DB 와인 타입 + 대표 품종 → 글라스
  색(absorb)·잔 모양. 홈 쇼케이스와 같은 규칙을 쓰는 단일 소스.

## 쇼케이스 캔버스 배경 (글라스 페이지 전용)

글라스 3D 씬은 ACES 톤매핑을 거쳐 화면에 `#bda588`로 나온다. 그래서 캔버스에
넘기는 배경(`bgColor`)은 `#9a8168`(= 톤매핑 후 `#bda588`), 페이지 배경은
`#bda588`로 둬야 이음새가 없다. `WineDetailView`가 이 두 값을 상수로 들고 있다
(`CANVAS_BG` / `CANVAS_RENDERED`).
