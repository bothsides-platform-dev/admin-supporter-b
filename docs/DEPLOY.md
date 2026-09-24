# 배포 런북 — admin-supporter-b

이 admin 콘솔은 **메인 앱(bidit)과 같은 AWS Lightsail VM**에 올리는 **두 번째 PM2 프로세스**다.
별도 인스턴스·DB·프록시를 두지 않고, 메인 앱의 자산을 공유한다.

```
인터넷 ──443──▶ Caddy (systemd) ──┬─▶ 127.0.0.1:3000   bidit       (<도메인>)
                                  └─▶ 127.0.0.1:4242   admin       (admin.<도메인>)
                                           │
                                     127.0.0.1:5432   Postgres (docker, bidit 소유 — 공유)
```

| 자산 | 소유 | 비고 |
|---|---|---|
| VM 프로비저닝 (Node/pnpm/PM2/Caddy/swap) | **bidit** `lightsail-bootstrap.sh` | admin은 재실행 불필요 |
| Postgres 컨테이너 + admin 스키마 마이그레이션 | **bidit** | admin은 `DATABASE_URL`로 접속만 — **마이그레이션 안 함** |
| Caddy 설정 (`admin.<도메인>` 라우트) | **bidit** `deploy/Caddyfile` | `admin.{$APP_DOMAIN} → 127.0.0.1:4242` |
| admin 앱 빌드·릴리스 (PM2) | **이 레포** | `scripts/deploy/lightsail-deploy.sh` |

> **포트 4242 고정.** `ecosystem.config.cjs`(PM2), `package.json`(`dev`/`start`), bidit `deploy/Caddyfile`이 모두 4242로 일치해야 한다. 한 곳이라도 어긋나면 `admin.<도메인>`이 502.

## 사전 조건 (콘솔 — 최초 1회)

1. **DNS**: `admin.<도메인>` A 레코드 → 메인 앱과 같은 **고정 IP**. (또는 `*.<도메인>` 와일드카드.)
   Caddy가 서브도메인 인증서를 발급하기 전에 전파돼 있어야 함 — `dig +short admin.<도메인>`로 확인.
2. **Google OAuth 리디렉트 URI**: Google Cloud Console OAuth 클라이언트에
   `https://admin.<도메인>/api/auth/callback/google` 추가.
3. **방화벽**: 443은 bidit 배포 때 이미 열려 있으면 추가 작업 없음.

## 최초 배포

```bash
# VM 접속 (Lightsail AL2023 기본 사용자: ec2-user)
ssh -i ~/Downloads/LightsailDefaultKey.pem ec2-user@<STATIC_IP>

# 1) admin 레포 클론
git clone git@github.com:bothsides-platform-dev/admin-supporter-b.git
cd admin-supporter-b
git checkout main

# 2) 운영 환경변수 — 빌드 전에 채운다 (NEXT_PUBLIC_BASE_URL이 빌드에 인라인됨)
cp .env.example .env.production
$EDITOR .env.production          # 아래 §환경변수

# 3) 빌드 + 릴리스
bash scripts/deploy/lightsail-deploy.sh

# 4) 재부팅 후에도 살아남게 (메인 앱에서 이미 했다면 pm2 save 만)
pm2 save
```

### Caddy에 admin 서브도메인 반영

`admin.<도메인>` 라우트는 **bidit 레포**의 `deploy/Caddyfile`에 정의돼 있고,
`/etc/caddy/Caddyfile`은 bidit bootstrap이 복사한 사본이다. 라우트(또는 포트)를 바꿨다면
bidit 체크아웃(이 서버는 `~/supporter-b`)에서 수동 반영한다:

```bash
cd ~/supporter-b && git pull --ff-only
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
journalctl -u caddy -f          # admin 서브도메인 인증서 발급 확인
```

## 환경변수 (`.env.production`)

`.env.example`을 채운다. `.env*`는 `.gitignore` 대상이라 깃에 올라가지 않는다(시크릿 안전).

| 키 | 값 |
|---|---|
| `DATABASE_URL` | `postgresql://supporter_b:<PW>@127.0.0.1:5432/supporter_b` (bidit과 **동일 DB**) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` — 프록시 뒤에서 Auth.js v5가 호스트를 신뢰하도록 (`.env.example`에 없으니 직접 추가) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth 클라이언트 |
| `NEXT_PUBLIC_BASE_URL` | `https://admin.<도메인>` — admin 자체 origin. **빌드 타임 인라인**이라 deploy 전에 설정 |
| `PUBLIC_APP_URL` | `https://<도메인>` — **메인 앱** URL (승인/반려 메일 링크용, admin 자신 아님) |
| `RESEND_API_KEY` / `RESEND_FROM` | 워크스페이스·PG 담당자 멤버십 승인/반려 메일 발송 (outbox 패턴) |
| `ADMIN_EMAILS` | 허용 admin Google 이메일 (쉼표 구분) |
| `ADMIN_SUPER_EMAILS` | 그중 `super_admin` 역할 부분집합 |

## 갱신 배포 (이후 매번)

```bash
cd ~/admin-supporter-b && bash scripts/deploy/lightsail-deploy.sh
```

git pull → install → build → `pm2 reload` (무중단). DB·Caddy는 건드리지 않음.

### 맞춤 PG 상담 기준 변경 배포

구매사 맞춤 PG 상담 기능과 함께 배포할 때는 **메인 앱의 DB 변경 → 관리자 앱 설정 → 메인 앱** 순서로 진행한다. 관리자 `/pg-recommendations`가 이 스키마를 읽으므로 두 DDL을 적용하기 전에 관리자 앱을 올리면 화면이 열리지 않는다. 이 레포는 마이그레이션을 실행하지 않는다.

1. 메인 앱의 `scripts/sql/20260919-pg-matching.sql`과 `scripts/sql/20260924-pg-matching-defaults.sql` 추가 DDL을 공유 DB에 적용한다. 적용 전 DB와 백업을 확인하고 두 스크립트의 실행 순서를 지킨다.
2. 이 레포를 배포한다. `/pg-recommendations`에서 업종별 접수 기준(White·Gray·Black), PG 추천 순서·사유, 확인된 요율 조건을 설정하고, 기본 추천 PG를 저장한 뒤 표준 업종을 검색·일괄 등록한다. 운영 절차와 MCC 출처는 [업종 목록과 기본 추천 PG](INDUSTRY_DEFAULTS.md)를 따른다. 새 정책이 없는 업종은 기본 후보로 이어지며, 이전 PG 연결을 자동으로 White로 바꾸지 않는다.
3. 메인 앱을 배포한 뒤 테스트 계정으로 업종 선택·상담 요청 → PG 심사·거절 → 다음 PG 추천 → 견적 → 구매사 최종 선정을 확인한다. 선정 전에는 전자서명 준비가 시작되지 않아야 한다.

세부 운영·복구 방법은 메인 앱의 `docs/PG_MATCHING_ROLLOUT.md`를 따른다. PG가 여러 업종의 추천 후보가 될 수 있지만, 실제 수용 가능 업종과 요율은 운영자가 확인한 값만 등록한다.

### 장기합의서 표준 수수료 배포

`/agreement-rates`는 메인 앱이 소유하는 `pg_agreement_rates` 테이블을 사용한다. 메인 앱의 추가 DDL을 먼저 적용하고 관리자 앱을 배포해 PG별 표준 요율을 등록한 다음, 메인 앱의 장기합의서 기능을 배포한다. 입력 규칙과 상세 순서는 [장기합의서 수수료 기준](LONG_TERM_AGREEMENT_RATES.md)을 따른다.

## 운영

| 작업 | 명령 |
|---|---|
| 로그 | `pm2 logs admin-supporter-b` |
| 상태/재시작 | `pm2 status` / `pm2 reload admin-supporter-b` |
| 빌드 OOM 시 힙 더 낮추기 | `NODE_BUILD_HEAP_MB=768 bash scripts/deploy/lightsail-deploy.sh` |
| 롤백 | `git checkout <이전-sha> && bash scripts/deploy/lightsail-deploy.sh` |

## 트러블슈팅

- **`admin.<도메인>` 502**: 포트 불일치가 가장 흔하다. `pm2 describe admin-supporter-b`로 4242 바인딩 확인,
  `/etc/caddy/Caddyfile`의 admin 블록이 `127.0.0.1:4242`인지 확인 (bidit 레포에서 동기화).
- **로그인 거부**: 본인 Google 이메일이 `ADMIN_EMAILS`에 있는지, OAuth 리디렉트 URI에
  `https://admin.<도메인>/api/auth/callback/google`이 등록됐는지 확인.
- **TLS 안 됨**: `dig +short admin.<도메인>`이 고정 IP를 가리키는지, `journalctl -u caddy`의 ACME 에러 확인.
- **DB 접속 실패**: bidit의 Postgres 컨테이너가 떠 있는지(`docker compose -f ~/supporter-b/docker-compose.prod.yml ps`),
  `DATABASE_URL` 자격증명이 bidit의 `POSTGRES_*`와 일치하는지 확인.
