# wine.byb.kr

와인을 검색하면 생산지·포도·와이너리 정보를 지도와 함께 흥미롭게 보여주고, 가격이 합리적인지 판단을 돕고, 내가 마신 기록을 쌓아 나가는 와인 테마 웹사이트.

전체 기획은 [docs/SPEC.md](docs/SPEC.md) 참고.

## 기술 스택

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS 4
- (예정) Prisma + SQLite, MapLibre GL, Framer Motion

## 개발

```bash
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000)

## 환경 변수

배포 환경 종속 값(포트, 관리자 비밀번호 등)은 **각 환경의 `.env` 에만** 두고 저장소에는 커밋하지 않는다.
필요한 키는 [`.env.example`](.env.example) 참고. 실제 값은 운영 서버(byb.kr)의 `.env` 에서만 관리한다.

## 배포

byb.kr Ubuntu 서버에서 nginx 리버스 프록시 뒤에 pm2로 구동한다. 포트는 서버 `.env` 의 `PORT` 로 지정한다.

```bash
pnpm server   # .env 로드 → DB 백업 → 빌드 → pm2 재시작 → 헬스체크
```
