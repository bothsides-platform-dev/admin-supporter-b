# 2026-11-17 관측 기능 운영 반영 기록

> 후속 상태: 2026-11-18 계정·스택 생성과 실제 Cloud 수집 연결을 완료했다. 현재 상태는 [2026-11-18 연결 기록](OBSERVABILITY_DEPLOYMENT_2026-11-18.md)을 따른다. 아래 내용은 11월 17일 반영 당시 기록이다.

관리자 앱과 서버 계측 준비는 운영에 반영했다. **Grafana Cloud 계정·스택이 아직 없어 Cloud 연결과 지표·로그 전송은 완료하지 않았다.** Alloy는 자격증명을 채우기 전 실행되지 않도록 중지·mask 상태다.

## 반영한 항목

| 항목 | 운영 상태 |
|---|---|
| 관리자 화면 | `https://admin.support-b.com/observability` 배포. Google 로그인·TOTP 필요 |
| 관리자 PM2 | `admin-supporter-b`, `/home/ec2-user/release-20261117-observability-v2`, 포트 4242 |
| Next.js | 빌드에서 확인한 보안 경고에 따라 16.4.3 → 16.4.5 적용 |
| 메인 앱 | 기존 `/home/ec2-user/production/current` 프로세스 유지, 재시작하지 않음 |
| Caddy | localhost 2019 지표와 필터링한 JSON access log 활성화, 설정 검증 후 graceful reload |
| Alloy | 공식 서명 RPM 1.22.0 설치, 설정·로그 읽기 권한·메모리 한도 준비. 서비스는 `inactive`, `masked` |
| PostgreSQL | `alloy_monitor` 계정에 CONNECT·pg_monitor 부여. 애플리케이션 스키마 변경·DB 재시작 없음 |
| Cloud 연결 | 계정·스택·읽기/쓰기 토큰 미설정, 실제 수집 미검증 |

PostgreSQL 서버 로그 수집은 활성화하지 않았다. 현재 Docker 로그 드라이버를 유지했다. Axiom/Sentry 조회용 자격증명과 관리자 Sentry DSN도 미설정이다. 기존 메인 앱의 수집 설정은 유지했으며 기존 토큰을 관리자 조회 토큰으로 재사용하지 않았다.

현재 Caddy는 요청당 최상위 `handler="subroute"` 지표를 제공한다. 요청 수는 `caddy_http_requests_total`, 상태 코드별 비율은 `caddy_http_request_duration_seconds_count`, p95는 해당 히스토그램 bucket으로 조회하도록 수정했다. 요청 수 counter에는 `code` label이 없다.

## 배포 원본과 경로

- 기준 커밋: `6b3a0311ad5dea620c0bc3f0028113d367fcbb66`.
- 기준 커밋에 관측 기능의 파일만 합친 격리 릴리스를 빌드했다. 화면이 사용하는 `AdminPageHeader`·`AdminViewTabs`를 포함했으며 그 외 진행 중인 UI 변경은 제외했다.
- 배포 파일 목록: 운영 릴리스의 `observability-release.json`.
- 서버 소스 아카이브: `/home/ec2-user/admin-observability-source-20261117-v2.tar.gz`.
- 아카이브 SHA-256: `5ac260e584c8e1a7cab6b4b7fe7b67bc5887d123a066992b15d5d5d4d5f718a9`.
- 관리자 환경변수: **현재 실행 릴리스** `/home/ec2-user/release-20261117-observability-v2/.env.production`. 기존 운영 환경변수를 권한 0600으로 복사했다.
- Alloy 환경변수: `/etc/alloy/observability.env`, `root:alloy`, 0640. 생성한 DB 모니터링 비밀번호는 이 파일에만 설정했으며 문서에 기록하지 않는다.
- Alloy 구성: `/etc/alloy/observability/{config,postgres}.alloy`, systemd drop-in `/etc/systemd/system/alloy.service.d/observability.conf`.
- Alloy 상태 보존 경로: `/var/lib/alloy`.

이 배포는 수동 아카이브 배포다. 관측 변경을 Git 원격에 커밋·푸시하지 않았다. 다음 일반 배포 전에 이 변경을 저장소에 반영하고 현재 환경변수를 이어받아야 한다. 기존 `~/admin-supporter-b`에서 배포 스크립트만 실행하면 현재 릴리스를 대체할 수 있다.

Caddy는 `/etc/caddy/Caddyfile`과 서버 체크아웃의 `/home/ec2-user/supporter-b/deploy/Caddyfile`을 동기화했다. 메인 저장소의 로컬·원격 Git에는 커밋하지 않았으므로 이후 Caddy 설정을 배포할 때 이 변경을 보존해야 한다.

## 실제 수행한 검증

- 격리 릴리스 전체 테스트: 68개 파일, 364개 테스트 통과. lint·typecheck 통과.
- 이후 Caddy 쿼리 수정과 회귀 테스트 추가: provider 테스트 9개 통과.
- 최종 v2 릴리스: 운영 Linux에서 의존성 고정 설치와 Next.js production build 통과.
- Alloy: macOS와 운영 Linux에서 설정 검증 및 가짜 로그의 민감 필드 제거 검사 통과. Cloud 전송 없이 검사했다.
- PostgreSQL: 생성한 모니터링 계정으로 localhost TCP 접속 성공, pg_monitor 소속 확인. superuser·CREATEDB·CREATEROLE 권한 없음.
- Caddy: 서비스 active, localhost 지표 HTTP 200, `subroute` 요청 수와 상태 코드가 있는 duration count 확인.
- 외부 HTTP: 메인 `/`·관리자 `/login` 200, `/observability`·`/api/observability` 302 로그인 이동, `/login/2fa` 비로그인 요청은 307 로그인 이동.
- 최종 관리자 PM2 online, 재시작 횟수 0, `pm2 save` 완료. 기존 PM2 부팅 서비스 enabled. 임시 확인용 포트 4342 프로세스 종료.
- 기존 업무 데이터 변경과 인증 세션 생성을 통한 우회 검사는 하지 않았다. Google 로그인·TOTP 완료 후 화면 동작, Cloud 수집·조회·알림, 실제 Alloy 자원 사용량은 아직 확인하지 못했다.

## Cloud 생성 후 이어서 할 일

1. 계정 소유자가 [Grafana Cloud 가입](https://grafana.com/auth/sign-up/create-user)을 완료하고 스택 주소를 확인한다. 토큰은 채팅·Git에 남기지 않고 보안 입력 수단으로 전달한다.
2. 해당 스택에 한정한 `metrics:read`·`logs:read` 토큰과 `metrics:write`·`logs:write` 토큰을 분리 발급한다. 권한·만료일과 서비스별 instance ID·endpoint를 확인한다.
3. 위 **현재 관리자 릴리스**의 `.env.production`에 조회 설정을, `/etc/alloy/observability.env`에 전송 설정을 채운다. 기존 DB DSN과 앱 환경변수를 덮어쓰지 않는다. 상세 키는 [관측 운영 런북](OBSERVABILITY.md)을 따른다.
4. Alloy 사용자로 환경변수를 읽어 `alloy validate /etc/alloy/observability`를 수행한다. 검증 후 `sudo systemctl unmask alloy`, `sudo systemctl enable --now alloy`로 시작하고 관리자 PM2를 재시작한다.
5. Cloud에서 `up`·`pg_up`과 Caddy/PM2 로그의 실제 유입, 관리자 조회 토큰의 읽기 권한을 확인한다. 5분 rate 창에 샘플이 쌓인 뒤 CPU·메모리·디스크·HTTP 요청량·5xx·p95를 확인한다.
6. 인증된 관리자 화면, Alloy 재시작 후 읽기 위치 유지, 드롭 카운터·자원 사용량을 확인한다. 알림을 사용할 경우 Cloud 규칙과 수신 경로를 별도로 설정·검증한다.

## 복구 지점

- 이전 관리자 경로 `/home/ec2-user/admin-supporter-b`와 `.next`가 가리키는 `/home/ec2-user/release-20261116-admin`은 보존했다. 관리자만 이전 경로의 `ecosystem.config.cjs`로 다시 시작한 후 HTTP 확인·`pm2 save`를 수행할 수 있다. 복구 실행 자체는 시험하지 않았다.
- PM2 배포 전 기록: `/home/ec2-user/admin-observability-deploy-20261117` (0700). PM2 JSON에는 환경변수가 있을 수 있으므로 출력·공유하지 않는다.
- Caddy 이전 설정: `/etc/caddy/Caddyfile.before-observability-20261117` (0600). 복구 시 현재 환경변수로 validate한 뒤 reload하고 서버 체크아웃의 원본도 맞춘다.
- 수집 중단은 Alloy 서비스만 중지한다. `/var/lib/alloy`와 환경변수 파일은 보존한다. 관리자 앱과 DB를 함께 중단할 필요는 없다.
