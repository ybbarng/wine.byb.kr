# wine 이미지 — GitHub Actions 가 빌드해 GHCR 에 올린다. 서버에서는 빌드하지 않는다.
#
# 타깃 두 개:
#   runner : 앱 실행용. Next standalone 출력만 담아 작게 만든다.
#   tools  : DB 스키마 반영·시드·백업 덤프용. prisma CLI·tsx·scripts 가 들어 있다.
#            배포 때 `docker compose run --rm tools ...` 로 잠깐 띄운다.
#
# 두 타깃 모두 DB 는 컨테이너 밖(서버 폴더)을 /data 로 붙여 쓴다(DATABASE_URL=file:/data/wine.db).

FROM node:24-bookworm-slim AS base
# prisma CLI(db push 의 schema engine)가 openssl 을 찾는다. slim 이미지에는 없다.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# 의존성 — lockfile 이 바뀔 때만 다시 받는다
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile

# 빌드 — prisma generate + next build (DB 조회 페이지는 force-dynamic 이라 빌드에 DB 가 필요 없다)
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# 도구 — 빌드 단계를 그대로 쓴다(전체 node_modules·scripts·prisma 포함)
FROM build AS tools
ENV NODE_ENV=production DATABASE_URL=file:/data/wine.db
CMD ["node_modules/.bin/tsx", "scripts/db-summary.ts"]

# 실행 — standalone 출력 + 정적 파일
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 PORT=3000 DATABASE_URL=file:/data/wine.db
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
