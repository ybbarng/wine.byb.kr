# wine.byb.kr

와인을 검색하면 생산지·포도·와이너리 정보를 지도와 함께 흥미롭게 보여주고, 가격이 합리적인지 판단을 돕고, 내가 마신 기록을 쌓아 나가는 와인 테마 웹사이트.

전체 기획은 [docs/SPEC.md](docs/SPEC.md) 참고.

## 기술 스택

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS 4
- Prisma + SQLite (libSQL) · MapLibre GL (산지 지도) · three.js/WebGPU (와인잔 렌더)
- 테스트: vitest(유닛) · Playwright(e2e) · biome(린트) · lefthook(git 훅)

## 개발

```bash
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000)

## 검사 · 테스트

```bash
pnpm lint          # biome 린트(스타일·정합성)
pnpm typecheck     # prisma generate + next typegen + tsc --noEmit
pnpm test          # vitest 유닛 테스트(순수 로직: 포맷·슬러그·검색·와인잔 색 등)
pnpm test:e2e      # Playwright e2e — 브라우저 인터랙션 회귀 가드
```

- **커밋 훅(lefthook)**: pre-commit 에서 biome, pre-push 에서 biome + `pnpm test` 가 자동 실행된다.
- **e2e(`pnpm test:e2e`)**: 와인잔(WebGPU)·지도(MapLibre) 같은 브라우저 인터랙션을 실제 크롬에서 확인한다. dev 서버(`:3000`)가 떠 있으면 재사용하고, 없으면 자동으로 띄운다. WebGPU 때문에 headed(창이 뜨는) 모드로 돈다. 테스트는 `e2e/*.spec.ts`.
  - 예: `e2e/glass-swirl.spec.ts` 는 홈·상세 공유 잔 캔버스가 포인터 입력을 받는지(스월이 막히지 않는지) 검사한다.

## 환경 변수

배포 환경 종속 값(포트, 관리자 비밀번호 등)은 **각 환경의 `.env` 에만** 두고 저장소에는 커밋하지 않는다.
필요한 키는 [`.env.example`](.env.example) 참고. 실제 값은 운영 서버(byb.kr)의 `.env` 에서만 관리한다.

## 배포

byb.kr Ubuntu 서버에서 nginx 리버스 프록시 뒤에 pm2로 구동한다. 포트는 서버 `.env` 의 `PORT` 로 지정한다.

```bash
pnpm server   # .env 로드 → DB 백업 → 빌드 → pm2 재시작 → 헬스체크
```
