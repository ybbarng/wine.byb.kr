#!/usr/bin/env bash
# 시음 기록 백업 덤프 — SSH forced-command 로 실행되는 래퍼.
#
# authorized_keys 에 이렇게 묶어 둔다(백업 전용 키):
#   command="/home/ybbarng/wine.byb.kr/ops/dump-tastings-remote.sh",no-port-forwarding,\
#   no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... wine-backup
#
# 이렇게 하면 그 키로는 **이 덤프 말고 아무것도 못 한다.** 키가 새어도 시음 기록을
# 읽는 것 외에는 할 수 있는 게 없다(배포 키와 권한이 갈린다).
#
# forced-command 는 로그인 셸이 아니라 node·pnpm 이 PATH 에 없다. server 스크립트와
# 같은 방식으로 nvm 을 먼저 불러온다.
#
# **표준출력에는 JSON 만 나가야 한다.** 받는 쪽(GitHub Actions)이 그대로 파일로 쓰기
# 때문이다. 그래서 안내·경고는 전부 표준에러로 보낸다.
set -euo pipefail

cd "$(dirname "$0")/.."

# nvm (비대화형 셸에서도 node 를 쓸 수 있게)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1090,SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

# DATABASE_URL 등은 이 서버의 .env 에만 있다(저장소에 없음).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# 덤프는 표준출력으로. tsx 나 pnpm 이 뱉는 잡음이 섞이지 않게 표준에러는 따로 흘린다.
pnpm exec tsx scripts/dump-tastings.ts --stdout 2>/dev/null
