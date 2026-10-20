# 배포 가이드

`wine.byb.kr` → byb.kr 서버 → nginx(TLS) → Traefik → `wine` 컨테이너. (2026-10-20 pm2 에서 옮김)

- 서버를 돌리는 설정(compose·배포·백업 덤프 스크립트)은 **`ybbarng/servers` 저장소의 `byb.kr/apps/wine/`** 에 있다.
  이 저장소는 앱 코드와 이미지 빌드만 맡는다.
- `main` 에 push 하면 `.github/workflows/image.yml` 이
  1. 이미지 두 개를 빌드해 GHCR 에 올리고
     - `ghcr.io/ybbarng/wine.byb.kr` — 앱 (`Dockerfile` 의 `runner`, Next standalone)
     - `ghcr.io/ybbarng/wine.byb.kr-tools` — DB 반영·시드·백업 덤프 (`tools`)
  2. 배포 키로 서버에 SSH 접속해 `deploy <sha>` 를 보낸다.
- 서버에서 빌드하지 않는다.

## 서버에서 일어나는 일 (`servers/byb.kr/apps/wine/deploy.sh`)

1. DB 백업 (`~/data/wine/wine.db.bak.*`, 최근 14개)
2. 이미지 받기 — 그 실행의 `GITHUB_TOKEN` 을 SSH 표준입력으로 받아 임시로만 쓰고 지운다.
   서버에 오래 남는 토큰은 없다(classic PAT 는 회사 조직까지 읽을 수 있어서 쓰지 않는다).
3. `tools` 컨테이너로 [`ops/release.sh`](../ops/release.sh) — `prisma db push` + 멱등 시드
4. 앱 컨테이너 교체, 헬스체크, 지난 이미지 정리

## 새 시드 스크립트를 추가할 때

`ops/release.sh` 에 한 줄 추가한다. 스크립트도 이미지에 들어가므로 **머지하면 그 배포에서 바로 돈다**
(옛 `./server` 처럼 "다음 배포부터"가 아니다).

## 손으로 해야 할 때 (서버에서)

```bash
cd ~/servers/byb.kr/apps/wine
docker compose ps
docker compose logs --tail 100 wine
docker compose run --rm tools node_modules/.bin/tsx scripts/db-summary.ts   # DB 요약
# 이미 받아 둔 이미지로 다시 배포
SSH_ORIGINAL_COMMAND="deploy $(docker images --format '{{.Tag}}' ghcr.io/ybbarng/wine.byb.kr | grep -v latest | head -1)" ./deploy.sh </dev/null
```

## 키와 시크릿

GitHub → Settings → Secrets and variables → Actions:

| Secret | 값 |
| --- | --- |
| `SERVER_HOST` / `SERVER_USER` / `SERVER_PORT` | `byb.kr` / `ybbarng` / (22 면 생략) |
| `SERVER_SSH_KEY` | 배포 키. 서버 `authorized_keys` 에서 `command="/home/ybbarng/servers/byb.kr/apps/wine/deploy.sh"` 로 묶여 있다 |
| `BACKUP_SSH_KEY` | 백업 키. `command="/home/ybbarng/servers/byb.kr/apps/wine/dump-tastings.sh"` 로 묶여 있다 |

두 키 모두 forced-command 라 새어도 배포·덤프 말고는 할 수 있는 게 없다.
로컬에서 키를 시험할 땐 `-o IdentitiesOnly=yes` 를 붙인다(없으면 다른 키로 붙어 평범한 셸이 열린다).

서버에만 있는 값(`ADMIN_PASSWORD`, `SESSION_SECRET`)은 `servers/byb.kr/apps/wine/.env` 에 있다.
