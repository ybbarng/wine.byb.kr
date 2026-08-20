# 배포 가이드

`wine.byb.kr` → byb.kr Ubuntu 서버 → nginx → `localhost:3103` (pm2). ftf와 동일한 구조다.

- 최초 1회: 서버에서 아래 **부트스트랩**을 직접 실행한다.
- 이후: `main` 에 push 하면 GitHub Actions가 SSH로 서버의 `./server` 를 실행해 자동 배포한다.
- 포트 같은 배포 환경 종속 값은 **서버의 `.env` 에만** 둔다(저장소에 없음).

---

## 1. 최초 부트스트랩 (서버에서 1회)

현재 운영 서버 기준: 계정 `ybbarng`, 경로 `/home/ybbarng/wine.byb.kr`, 포트 `3104`.

```bash
# 서버에 SSH 접속 후
cd ~                 # 저장소를 홈 바로 아래 둔다 (SERVER_PATH 의 부모)
git clone https://github.com/ybbarng/wine.byb.kr.git
cd wine.byb.kr

# 배포 환경 종속 값 — 이 파일은 서버에만 존재한다
cat > .env <<EOF
PORT=3104
ADMIN_PASSWORD=여기에-실제-비밀번호
SESSION_SECRET=$(openssl rand -hex 32)
EOF
chmod 600 .env

# 첫 구동 (빌드 + pm2 시작 + 헬스체크)
./server

# 재부팅 후에도 뜨도록 pm2 저장
pm2 save
pm2 startup   # 안내되는 명령을 한 번 실행
```

## 2. nginx + HTTPS (서버에서 1회)

```bash
sudo cp deploy/nginx/wine.byb.kr.conf /etc/nginx/sites-available/wine.byb.kr
sudo ln -s /etc/nginx/sites-available/wine.byb.kr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Let's Encrypt 인증서 (443 블록 자동 추가)
sudo certbot --nginx -d wine.byb.kr
```

## 3. 자동 배포용 GitHub Secrets (1회)

저장소 Settings → Secrets and variables → Actions 에 등록(현재 운영 서버 기준):

| Secret | 값 |
| --- | --- |
| `SERVER_HOST` | `byb.kr` |
| `SERVER_USER` | `ybbarng` |
| `SERVER_SSH_KEY` | 배포용 개인키. 공개키는 서버 `~/.ssh/authorized_keys` 에 **forced command** 로 등록 |
| `SERVER_PORT` | SSH 포트 (기본 22면 생략) |
| `SERVER_PATH` | `/home/ybbarng/wine.byb.kr` |

이후 `main` push → `.github/workflows/deploy.yml` 이 서버에서 `./server` 실행.

### 배포 키 보안 (forced command)

배포 전용 키는 만능키를 재사용하지 않고 별도로 만든다. 서버 `~/.ssh/authorized_keys` 에서 그 공개키 앞에 강제 명령을 걸어, 키가 유출돼도 배포 외에는 아무것도 못 하게 한다.

```
command="cd /home/ybbarng/wine.byb.kr && ./server",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAA...공개키... wine-deploy
```

로컬에서 검증할 때는 지정 키만 쓰도록 `-o IdentitiesOnly=yes` 를 붙인다(안 그러면 다른 키로 붙어 일반 셸이 열린다):

```bash
ssh -i ~/.ssh/wine_deploy -o IdentitiesOnly=yes ybbarng@byb.kr   # 접속하면 ./server 가 자동 실행
```

## 참고

- `./server` 동작: `.env` 로드 → SQLite 백업(`data/wine.db.bak.*`, 최근 14개) → `git pull` → `pnpm install` → `pnpm build` → `pm2 restart` → 헬스체크.
- 포트를 바꾸면 서버 `.env` 의 `PORT` 와 `deploy/nginx/wine.byb.kr.conf` 의 `proxy_pass` 를 함께 바꾼다.
