# 배포 런북 — admin-supporter-b

이 admin 콘솔은 **메인 앱(bidit)과 같은 AWS Lightsail VM**에 올리는 **두 번째 PM2 프로세스**다.
별도 인스턴스·DB·프록시를 두지 않고, 메인 앱의 자산을 공유한다.

공유 Node.js 기준 버전은 **22.23.4**다. 로컬도 `.nvmrc`에 맞춰 `nvm install && nvm use`를 실행한다. `package.json`의 `engines.node`와 `.npmrc`의 `engine-strict=true`는 22.23.4 미만 또는 다른 메이저 버전에서 의존성 설치를 차단한다. 서버 Node 설치·교체는 메인 앱이 소유하며, 교체 후 PM2 데몬과 메인·관리자 앱 모두 새 바이너리로 실행되는지 확인한다. 저장소의 버전 설정만으로 이미 실행 중인 서버 프로세스가 교체되지는 않는다.

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
| `ADMIN_TOTP_ENCRYPTION_KEY` | `openssl rand -base64 32` — 공유 DB에 저장하는 TOTP 시크릿의 암호화 키. **잃어버리면 모든 관리자가 2단계 인증을 다시 등록해야 하므로** 서버 밖에도 보관한다 |

허용 관리자 목록은 env가 아니라 공유 DB의 `admin_users` 테이블에 있다(`/admins` 화면에서 관리). 예전 `ADMIN_EMAILS`·`ADMIN_SUPER_EMAILS`는 더 이상 읽지 않지만, 이전 버전으로 롤백할 때 필요하므로 아래 전환 순서 5단계까지 지우지 않는다.

## 관리자 계정·2단계 인증 (TOTP)

로그인은 **Google 로그인 → `admin_users`에 있는 이메일인지 확인 → 인증 앱 6자리 코드(TOTP) 또는 등록한 패스키** 순서다. 2단계 인증은 한 번 통과하면 12시간 유지되고, 로그아웃하거나 Google로 다시 로그인하면 다시 묻는다. 코드를 5번 틀리면 15분 동안 잠긴다(공유 `login_attempts` 테이블, 키 `admin-2fa:<email>`).

### 최초 전환 순서 (env 허용 목록 → `admin_users`)

1. **메인 앱(bidit) 스키마를 `main`까지 반영**한다. bidit의 `admin_users` 스키마가 `main`에 들어가기 전에 운영 DB에 테이블을 만들면, 테이블이 없는 bidit 체크아웃의 `pnpm db:push`가 DROP을 제안한다. bidit `main`의 운영 배포는 스키마 fingerprint가 바뀌어 `shared/schema-ready` 확인에서 멈추는데, 정상이다(bidit `docs/PRODUCTION_CI.md`).
2. **DDL·시드**: bidit 체크아웃에서 `scripts/migrations/20261115-admin-users.sql`을 공유 DB에 적용하고, 현재 `ADMIN_EMAILS`의 이메일을 **소문자로** 넣는다. 그다음 bidit의 `shared/schema-ready`를 기록해 메인 앱 배포를 이어 간다. 구 버전 admin은 이 테이블을 무시하므로 admin 배포 전에 적용해도 안전하다.
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/20261115-admin-users.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO admin_users (email, created_by) VALUES ('a@example.com', 'migration:env'), ('b@example.com', 'migration:env') ON CONFLICT (email) DO NOTHING"
   ```
3. `.env.production`에 `ADMIN_TOTP_ENCRYPTION_KEY`를 추가한다(위 표). 테이블 없이 이 앱을 먼저 배포하면 로그인이 전부 실패한다.
4. 이 앱을 배포한다. 배포 전에 발급된 로그인 세션은 한 번 로그아웃되므로 **모든 관리자가 다시 로그인해 QR로 인증 앱을 등록**한다. 미등록 계정은 그 Google 계정으로 처음 로그인한 사람이 등록하게 되니, 배포 직후 바로 등록하도록 안내한다.
5. **`ADMIN_EMAILS`는 롤백 가능성이 없어질 때까지 남겨 둔다.** 이전 버전 admin은 이 값으로 허용 목록을 판단하므로, 지운 상태로 롤백하면 아무도 로그인하지 못한다. 모두 등록한 것을 `/admins`에서 확인하고 롤백할 일이 없다고 판단되면 `ADMIN_EMAILS`·`ADMIN_SUPER_EMAILS`를 지운다. 롤백해도 `admin_users` 테이블과 행은 남겨 둔다(이전 버전은 무시한다).

### 패스키 (지문·얼굴 인식·기기 잠금)

인증 앱을 등록한 관리자는 메뉴의 **내 패스키**(`/passkeys`)에서 패스키를 추가할 수 있다. 등록한 뒤에는 2단계 인증 화면에서 코드 대신 **패스키로 인증**을 누르면 된다. 인증 앱 등록은 그대로 남으므로 코드로도 계속 로그인할 수 있다.

- **등록에는 현재 인증 앱 코드가 한 번 더 필요하다.** 로그인된 세션을 탈취해도 자기 패스키를 심어 12시간 재인증 한도를 넘기지 못하게 하기 위해서다. 방금 로그인에 쓴 코드는 다시 쓸 수 없으므로 새 코드가 뜨면 입력한다. 여기서 틀린 코드도 로그인과 같은 5회 잠금에 합산된다.
- 패스키 인증은 코드 잠금과 별개다. 코드가 15분 잠겨 있어도 패스키로는 로그인할 수 있다.
- 한 사람당 10개까지 등록한다. 등록·삭제는 감사 로그에 `admin_user.passkey_register`·`admin_user.passkey_remove`로 남는다.
- **새 환경변수는 없다.** 패스키는 `AUTH_URL`의 호스트(`admin.<도메인>`)에 묶인다. 이 호스트를 바꾸면 기존 패스키는 모두 쓸 수 없게 되어 다시 등록해야 한다. `AUTH_URL`이 없거나 IP 주소인 환경에서는 패스키 버튼과 등록 화면이 나오지 않고 인증 앱 코드만 쓴다.

**배포 순서 (DDL 선행)** — 운영과 스테이징 모두 같다.

1. bidit의 `admin_passkeys` 스키마를 **`main`까지 반영**한다. 이유와 `shared/schema-ready`에서 멈추는 동작은 위 `admin_users` 전환과 같다.
2. bidit 체크아웃에서 DDL을 적용하고 `shared/schema-ready`를 기록한다. `admin_users`가 먼저 있어야 하고 시드는 없다. 구 버전 admin은 이 테이블을 무시한다.
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/20261121-admin-passkeys.sql
   ```
3. 그다음 이 앱을 배포한다. **테이블 없이 먼저 배포하면 패스키를 쓰지 않는 관리자의 코드 로그인까지 실패한다**(2단계 인증 화면이 이 테이블을 조회한다).
4. 롤백하면 이전 버전은 이 테이블을 무시하고 인증 앱 코드만 받는다. 테이블과 행은 남겨 둔다.

### 휴대폰·기기 분실·잠김 복구

- 다른 관리자가 `/admins`에서 **2단계 인증 초기화**를 누른다. 대상자의 인증 앱 등록과 **패스키가 모두 삭제**되고, 다음 로그인 때 QR로 다시 등록하며, 잠금도 함께 풀린다. 본인 계정은 본인이 초기화할 수 없다.
- 패스키를 등록한 기기만 잃어버렸고 로그인은 할 수 있다면, 본인이 **내 패스키**에서 그 패스키를 삭제한다.
- 로그인할 수 있는 관리자가 아무도 없으면 공유 DB에서 직접 초기화한다. 패스키도 함께 지운다.
  ```sql
  DELETE FROM admin_passkeys WHERE admin_user_id = (SELECT id FROM admin_users WHERE email = 'a@example.com');
  UPDATE admin_users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_used_step = NULL, updated_at = now()
   WHERE email = 'a@example.com';
  DELETE FROM login_attempts WHERE key = 'admin-2fa:a@example.com';
  ```
- 관리자 추가도 같은 방식으로 `INSERT INTO admin_users (email, created_by) VALUES ('…', 'manual:sql')`. 평소에는 `/admins` 화면을 쓴다(감사 로그에 남는다).

## 갱신 배포 (이후 매번)

```bash
cd ~/admin-supporter-b && bash scripts/deploy/lightsail-deploy.sh
```

git pull → install → build → PM2 프로세스 삭제·재시작 순서로 진행하며, 재시작 중에는 잠시 접속이 끊길 수 있다. DB·Caddy는 건드리지 않음.

### 신규사업체 구매사 자동 승인

메인 앱의 `scripts/migrations/20261020-buyer-auto-approval.sql`과 `scripts/migrations/20261025-new-business-approval.sql`을 공유 DB에 실행하고 커밋한 뒤 **관리자 앱 → 메인 앱** 순서로 배포한다. 구매사 서버의 APICK·국세청 키 설정 후 신규사업체 조회·판정을 실행한다. 보나페이 조회는 제거하며 과거 이력은 보존한다. 별도 APICK 원본 조회 감사는 기존 테이블을 사용하므로 추가 필드 DDL은 없다. 표시 방식과 운영 확인 과제는 [신규사업체 구매사 자동 승인 표시](BUYER_AUTO_APPROVAL.md)를 따른다.

### 입점 심사 알림 링크 복구

관리자 심사 주소는 `/review`·`/review/:id`다. 기존 알림의
`/admin/review`·`/admin/review/:id`는 쿼리를 유지한 308 리디렉트로 연결한다.
실제 운영 경로인 `/admin/pg-members`는 그대로 유지한다.

비로그인 요청은 경로와 쿼리를 `/login?callbackUrl=…`로 전달한다.
로그인 폼과 액션은 내부 상대경로만 허용하며, 외부 주소·로그인/인증 경로·
잘못된 입력은 `/`로 대체한다. 관리자 이메일 권한 검사와 독립 쿠키 정책은 유지한다.
로그인 후 2단계 인증이 필요하면 같은 경로를 `/login/2fa?callbackUrl=…`로 넘겨 인증 뒤에 돌아온다.

배포 순서는 **관리자 앱 → 메인 앱(bidit)**이다. 관리자 앱으로 기존 링크와
로그인 복귀를 복구한 뒤 메인 앱의 새 알림 주소 생성을 배포한다.
DB 변경이나 기존 알림 재발송은 필요하지 않다. 배포 후 기존 링크를 비로그인
상태로 열고 Google 로그인 후 같은 심사 신청으로 돌아오는지 확인한다.

### 맞춤 PG 상담 기준 변경 배포

구매사 맞춤 PG 상담 기능과 함께 배포할 때는 **메인 앱의 DB 변경 → 관리자 앱 설정 → 메인 앱** 순서로 진행한다. 관리자 `/pg-recommendations`가 이 스키마를 읽으므로 두 DDL을 적용하기 전에 관리자 앱을 올리면 화면이 열리지 않는다. 이 레포는 마이그레이션을 실행하지 않는다.

1. 메인 앱의 `scripts/sql/20260919-pg-matching.sql`과 `scripts/sql/20260924-pg-matching-defaults.sql` 추가 DDL을 공유 DB에 적용한다. 적용 전 DB와 백업을 확인하고 두 스크립트의 실행 순서를 지킨다.
2. 이 레포를 배포한다. `/pg-recommendations`에서 업종별 접수 기준(White·Gray·Black), PG 추천 순서·사유, 확인된 요율 조건을 설정하고, 기본 추천 PG를 저장한 뒤 표준 업종을 검색·일괄 등록한다. 운영 절차와 MCC 출처는 [업종 목록과 기본 추천 PG](INDUSTRY_DEFAULTS.md)를 따른다. 새 정책이 없는 업종은 기본 후보로 이어지며, 이전 PG 연결을 자동으로 White로 바꾸지 않는다.
3. 메인 앱을 배포한 뒤 테스트 계정으로 업종 선택·상담 요청 → PG 심사·거절 → 다음 PG 추천 → 견적 → 구매사 최종 선정을 확인한다. 선정 전에는 전자서명 준비가 시작되지 않아야 한다.

세부 운영·복구 방법은 메인 앱의 `docs/PG_MATCHING_ROLLOUT.md`를 따른다. PG가 여러 업종의 추천 후보가 될 수 있지만, 실제 수용 가능 업종과 요율은 운영자가 확인한 값만 등록한다.

### 장기합의서 표준 수수료 배포

`/agreement-rates`는 메인 앱이 소유하는 `pg_agreement_rates` 테이블을 사용한다. 메인 앱의 추가 DDL을 먼저 적용하고 관리자 앱을 배포해 PG별 표준 요율을 등록한 다음, 메인 앱의 장기합의서 기능을 배포한다. 입력 규칙과 상세 순서는 [장기합의서 수수료 기준](LONG_TERM_AGREEMENT_RATES.md)을 따른다.

## 운영

시스템 지표·로그는 `/observability`에서 확인한다. Grafana Cloud 연결, Alloy systemd 배포, Caddy/Postgres 계측과 수집 검수는 [관측 운영 런북](OBSERVABILITY.md)을 따른다. 앱 배포가 Cloud 계정이나 Alloy 서비스를 자동으로 생성하지는 않는다.

2026-11-17 수동 릴리스의 실행 경로·소스 범위는 [관측 기능 운영 반영 기록](OBSERVABILITY_DEPLOYMENT_2026-11-17.md), 2026-11-18 Cloud 연결과 토큰 교체 경로는 [운영 연결 기록](OBSERVABILITY_DEPLOYMENT_2026-11-18.md)에 남겼다. 다음 배포 전에 이 릴리스의 코드와 현재 운영 환경변수를 이어받는다.

| 작업 | 명령 |
|---|---|
| 로그 | `pm2 logs admin-supporter-b` |
| 상태/재시작 | `pm2 status` / `pm2 reload admin-supporter-b` |
| 빌드 OOM 시 힙 더 낮추기 | `NODE_BUILD_HEAP_MB=768 bash scripts/deploy/lightsail-deploy.sh` |
| 롤백 | `git checkout <이전-sha> && bash scripts/deploy/lightsail-deploy.sh` |

## 트러블슈팅

- **`admin.<도메인>` 502**: 포트 불일치가 가장 흔하다. `pm2 describe admin-supporter-b`로 4242 바인딩 확인,
  `/etc/caddy/Caddyfile`의 admin 블록이 `127.0.0.1:4242`인지 확인 (bidit 레포에서 동기화).
- **로그인 거부**: 본인 Google 이메일이 `admin_users`에 (소문자로) 있는지, OAuth 리디렉트 URI에
  `https://admin.<도메인>/api/auth/callback/google`이 등록됐는지 확인.
- **2단계 인증 화면에서 오류**: `ADMIN_TOTP_ENCRYPTION_KEY`가 설정돼 있고 시크릿을 암호화할 때 쓴 키와 같은지 확인. `admin_passkeys` 테이블이 없어도 이 화면이 실패한다(위 패스키 배포 순서).
- **패스키 버튼이나 등록 화면이 안 보임**: `AUTH_URL`이 `https://admin.<도메인>`으로 설정돼 있는지 확인. 접속 주소와 `AUTH_URL`의 호스트가 다르면 브라우저가 패스키를 거부한다.
  키가 바뀌었으면 위 "휴대폰 분실·잠김 복구"의 SQL로 초기화한 뒤 다시 등록한다. 코드가 계속 틀리면 휴대폰 시계가 자동 설정인지 확인한다.
- **TLS 안 됨**: `dig +short admin.<도메인>`이 고정 IP를 가리키는지, `journalctl -u caddy`의 ACME 에러 확인.
- **DB 접속 실패**: bidit의 Postgres 컨테이너가 떠 있는지(`docker compose -f ~/supporter-b/docker-compose.prod.yml ps`),
  `DATABASE_URL` 자격증명이 bidit의 `POSTGRES_*`와 일치하는지 확인.

### 등급별 단일 판가 전환 (2026-10-08)

등급별 판가 입력·저장은 별도 활성화 설정 없이 바로 동작한다. 배포 중에는 관리자 서비스를 잠시 중지하고 메인 앱의 호환 리더를 먼저 배포한다. 대상 DB 백업 후 메인 앱 `scripts/sql/20261008-pg-tier-fees.sql`을 실행하고 마이그레이션 기록과 구형 요율 키 제거를 확인한 다음 새 관리자 앱을 시작한다. 전환 SQL이 새로 입력한 판가를 초기화하지 않도록 데이터 전환을 관리자 서비스 재개 전에 마친다.

기본·업종별 정책의 5개 등급 판가는 모두 미입력으로 시작한다. 후보·순서·사유·공통 조건은 보존하고 상담 이력·감사 로그에는 쓰지 않는다. 재실행은 새 판가를 지우지 않는다. 상세 절차와 복구 기준은 메인 앱 `docs/PG_MATCHING_ROLLOUT.md`의 2026-10-08 절을 따른다. 신형 정책을 읽지 못하는 구형 앱으로 롤백하지 않는다.
