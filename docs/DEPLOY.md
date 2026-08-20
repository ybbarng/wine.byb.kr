# 배포 가이드

`wine.byb.kr` → byb.kr Ubuntu 서버 → nginx → `localhost:3103` (pm2). ftf와 동일한 구조다.

- 최초 1회: 서버에서 아래 **부트스트랩**을 직접 실행한다.
- 이후: `main` 에 push 하면 GitHub Actions가 SSH로 서버의 `./server` 를 실행해 자동 배포한다.
- 포트 같은 배포 환경 종속 값은 **서버의 `.env` 에만** 둔다(저장소에 없음).

---

## 1. 최초 부트스트랩 (서버에서 1회)

```bash
# 서버에 SSH 접속 후
cd ~/apps            # 원하는 상위 경로 (SERVER_PATH 의 부모)
git clone https://github.com/ybbarng/wine.byb.kr.git
cd wine.byb.kr

# 배포 환경 종속 값 — 이 파일은 서버에만 존재한다
cat > .env <<'EOF'
PORT=3103
ADMIN_PASSWORD=여기에-실제-비밀번호
SESSION_SECRET=충분히-긴-임의-문자열
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

저장소 Settings → Secrets and variables → Actions 에 등록:

| Secret | 값 |
| --- | --- |
| `SERVER_HOST` | 서버 IP 또는 호스트 |
| `SERVER_USER` | SSH 사용자 |
| `SERVER_SSH_KEY` | 배포용 개인키 (해당 공개키를 서버 `~/.ssh/authorized_keys` 에) |
| `SERVER_PORT` | SSH 포트 (기본 22면 생략 가능) |
| `SERVER_PATH` | 서버의 저장소 경로 (예: `/home/ubuntu/apps/wine.byb.kr`) |

이후 `main` push → `.github/workflows/deploy.yml` 이 서버에서 `./server` 실행.

## 참고

- `./server` 동작: `.env` 로드 → SQLite 백업(`data/wine.db.bak.*`, 최근 14개) → `git pull` → `pnpm install` → `pnpm build` → `pm2 restart` → 헬스체크.
- 포트를 바꾸면 서버 `.env` 의 `PORT` 와 `deploy/nginx/wine.byb.kr.conf` 의 `proxy_pass` 를 함께 바꾼다.
