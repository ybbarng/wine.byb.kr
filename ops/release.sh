#!/usr/bin/env bash
# 배포 직전에 tools 이미지 안에서 돈다 — DB 스키마 반영 + 멱등 시드.
#   docker compose run --rm tools ops/release.sh
# 예전 ./server 의 1~8번(빌드 전) 단계를 그대로 옮겼다. DB 는 /data/wine.db (DATABASE_URL).
# 시드는 실패해도 배포를 막지 않는다(기존과 같음).
set -euo pipefail

cd "$(dirname "$0")/.."

# pnpm 을 거치지 않고 설치된 실행 파일을 바로 쓴다. 컨테이너는 바깥과 통신하지 않아서
# corepack 이 pnpm 을 내려받으려 하면 실패한다.
BIN=node_modules/.bin

echo "🗄  Syncing DB schema..."
"$BIN/prisma" db push

run_seed() {
  local label="$1" script="$2"
  echo "$label"
  "$BIN/tsx" "$script" || echo "⚠️  $script skipped (non-fatal)"
}

run_seed "🍷 Applying tasting seed..." scripts/add-tastings.ts
run_seed "🍇 Deduping grapes..." scripts/dedupe-grapes.ts
run_seed "🍷 Enriching wine notes..." scripts/enrich-wine-notes.ts
run_seed "🗂  Fixing catalog data..." scripts/fix-catalog-data.ts
run_seed "🧪 Setting winemaking..." scripts/set-wine-winemaking.ts
run_seed "🍇 Setting blend percents..." scripts/set-blend-percents.ts
run_seed "🛢  Setting wine oak aging..." scripts/set-wine-oak.ts

echo "✅ release steps done"
