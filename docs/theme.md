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
  (왼쪽 글라스 · 가운데 산지 지도 · **오른쪽 상세가 가장 넓다**). 와인 상세와
  산지/품종/종류 결과 페이지가 공유한다. `children`으로 오른쪽 패널 내용을,
  `belowMap`으로 가운데 지도 아래 내용(예: 산지 계층)을 넘긴다. `belowMap`이
  있으면 지도가 작아지고 그 아래 칸이 스크롤된다.
- **`WineList`** (`src/components/WineList.tsx`) — 컬렉션 상세 패널의 와인 목록.
  각 항목 → `/wine/[slug]`.
- **글라스 색 매핑**: `wineGlassFor(type, grapeNames)`
  (`src/features/wine/wine-glass.ts`) — DB 와인 타입 + 대표 품종 → 글라스
  색(absorb)·잔 모양. 홈 쇼케이스와 같은 규칙을 쓰는 단일 소스.

## 반응형 · 모바일 (새 UI는 반드시 지킬 것)

이 사이트는 데스크톱과 모바일에서 모두 쓴다. 새 페이지·컴포넌트는 **모바일 우선**으로
짜고, 큰 화면은 `sm:`/`md:` 프리픽스로 넓힌다. 완성 전 **390px 폭(모바일)에서 반드시
확인**한다. 아래 패턴을 지킨다.

- **가로 다단 레이아웃은 모바일에서 세로로 쌓는다.** 여러 칸을 옆으로 놓는 레이아웃
  (`flex-row`, `grid-cols-N`)은 기본을 세로(`flex-col`)로 두고 `md:flex-row` /
  `md:grid-cols-N`으로 큰 화면에서만 가로로. `WineDetailView`가 그 예 — 모바일은
  글라스·지도·상세를 세로로 쌓고, `md:` 이상에서 3칸 한 화면이 된다.
- **`h-screen` + `overflow-hidden`으로 화면을 잠그지 않는다.** 모바일에서는 내용이
  넘쳐 스크롤돼야 한다. 한 화면 레이아웃이 필요하면 `min-h-screen`(모바일) +
  `md:h-screen md:overflow-hidden`(데스크톱)으로 분기한다.
- **상단 내비는 모바일에서 반드시 접근 가능해야 한다.** 가로 내비를 `hidden sm:flex`로
  숨기면, 모바일용 햄버거 메뉴(`sm:hidden`)를 함께 둔다. `ShowcaseHeader`가 그 예.
  내비 항목은 배열 상수 하나로 두고 데스크톱·모바일이 공유한다.
- **전체화면 지도 오버레이**: 컨트롤 바는 좁은 화면에서 `flex-wrap`으로 접히게 하고,
  긴 칩 줄은 모바일에서 `overflow-x-auto`(가로 스크롤), `sm:flex-wrap`으로 둔다.
  칩에는 `shrink-0`. 부제·라벨 같은 부가 텍스트는 `hidden sm:inline`으로 숨겨 공간을
  아낀다. `explore-map.tsx` 참고.
- **표(table)**: 셀 글이 길면 모바일에서 넘칠 수 있으니, 짧게 쓰거나 폭이 넓은 표는
  가로 스크롤 래퍼로 감싼다. 학습의 표는 셀이 줄바꿈되도록 짧게 유지한다.
- **터치 타깃**은 최소 ~36px(예: 아이콘 버튼 `h-9 w-9`). 좌우 여백은 모바일에서
  `px-4`, 큰 화면 `md:px-6` 정도로.
- **콘텐츠 페이지**는 `SiteHeader` + `mx-auto w-full max-w-5xl px-6`로 감싸면 모바일에서
  자연히 한 단이 된다(셀러·학습·도감이 그 예).

## 쇼케이스 캔버스 배경 (글라스 페이지 전용)

글라스 3D 씬은 ACES 톤매핑을 거쳐 화면에 `#bda588`로 나온다. 그래서 캔버스에
넘기는 배경(`bgColor`)은 `#9a8168`(= 톤매핑 후 `#bda588`)이어야 하고, 캔버스를 감싸는
쪽 배경은 `--background`와 같아야 이음새가 없다.

- 캔버스에 넘기는 값은 `features/glass/canvas-bg.ts`의 **`CANVAS_BG` 하나뿐**이다.
  hex를 화면 요소에 다시 적지 않는다.
- 감싸는 쪽 배경은 `bg-background`를 쓴다 — 색의 단일 출처는 토큰이다.
- `--background`를 바꾸면 `CANVAS_BG`도 다시 잡아야 한다. `canvas-bg.test.ts`가
  globals.css를 읽어 어긋남을 잡는다.
