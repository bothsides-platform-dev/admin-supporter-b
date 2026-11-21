# Grafana Cloud + Alloy 운영

현재 운영 스택은 [cordialpike3024](https://cordialpike3024.grafana.net)이다. 2026-11-18 활성화 상태와 토큰 만료·교체 경로는 [운영 연결 기록](OBSERVABILITY_DEPLOYMENT_2026-11-18.md)에 있다.

`/observability`에서 시스템 지표, 서버 로그, 기존 Axiom 운영 로그, Sentry 오류·업무 이벤트, DB 사용자 활동을 조회한다. 핵심 업무 지표는 `/metrics`, 관리자 작업 이력은 `/audit-log`에 있다.

```text
Lightsail: host / Caddy / Postgres ── Alloy ──▶ Grafana Cloud Metrics + Logs
           bidit / admin PM2 stdout ──┘                  ▲ 읽기 전용 API
기존 bidit Pino ──▶ Axiom ───────────────────────────────┤
기존 bidit Sentry + admin 서버 오류 ──▶ Sentry ──────────┤
공유 DB audit_logs ───────────────────────────▶ admin /observability
```

Alloy만 VM의 systemd 서비스로 설치한다. Grafana·Loki·Prometheus 서버는 VM에서 실행하지 않는다. 메인 앱의 Pino는 Axiom을 설정하면 stdout으로 복제하지 않으므로 해당 로그는 Axiom 탭에서 조회한다. Alloy가 읽는 PM2 파일은 stdout/stderr에 실제로 쓰인 내용이다.

## 1. Cloud와 조회 자격증명

Grafana Cloud stack을 만든 뒤 portal의 Prometheus/Loki connection details에서 다음 값을 확인한다. 아래 경로는 예시이며 해당 stack의 값을 사용한다.

| 위치 | 환경변수 | 값 / 최소 권한 |
|---|---|---|
| admin `.env.production` | `GRAFANA_METRICS_QUERY_URL` | `https://prometheus-….grafana.net/api/prom` (query base) |
| admin | `GRAFANA_LOGS_QUERY_URL` | `https://logs-….grafana.net` (push 경로 제외) |
| admin + Alloy | `GRAFANA_METRICS_USER`, `GRAFANA_LOGS_USER` | 각 서비스의 instance ID. Grafana 로그인 이메일이 아님 |
| admin | `GRAFANA_READ_TOKEN` | 이 stack으로 제한한 access policy: `metrics:read`, `logs:read` |
| Alloy 전용 env | `GRAFANA_METRICS_WRITE_URL` | portal의 전체 remote_write URL, 보통 `/api/prom/push` |
| Alloy 전용 env | `GRAFANA_LOGS_WRITE_URL` | portal의 전체 push URL, 보통 `/loki/api/v1/push` |
| Alloy 전용 env | `GRAFANA_WRITE_TOKEN` | 별도 access policy: `metrics:write`, `logs:write` |
| admin + Alloy | `OBSERVABILITY_ENVIRONMENT` | 동일한 값, 기본 `production` |
| Alloy | `OBSERVABILITY_INSTANCE` | 재시작해도 변하지 않는 서버 이름, 예: `bidit-lightsail-1` |

읽기·쓰기 토큰을 분리하고 stack 범위와 만료일을 지정한다. 토큰은 `NEXT_PUBLIC_*`에 넣지 않는다. 화면/JSON 응답에 토큰이나 Cloud 요청 헤더를 반환하지 않는다. 토큰 회전 후 admin과 Alloy를 각각 재시작한다.

기존 서비스 연결은 선택 사항이다. 미설정된 수집원은 **연결 전**, API 실패는 **조회 실패**, 정상 응답의 빈 목록은 **기록 없음**으로 구분한다.

- **Axiom**: `AXIOM_QUERY_DATASET`은 운영 환경 전용 데이터셋, `AXIOM_QUERY_TOKEN`은 그 데이터셋의 Query 권한 토큰이다. 메인 앱의 ingest 전용 `AXIOM_TOKEN`을 재사용하지 않는다. Axiom 조회는 dataset으로 환경을 분리하므로 다른 환경과 섞인 dataset을 지정하지 않는다.
- **Sentry**: `SENTRY_OBSERVABILITY_ORG`, `SENTRY_OBSERVABILITY_PROJECTS`(숫자 ID, 쉼표 구분), `SENTRY_READ_TOKEN`을 설정한다. 미해결 오류 조회에는 `event:read`, Logs 조회에는 `org:read`가 필요하다. 대상 프로젝트로 제한한 내부 integration을 사용한다. 빈 목록/전체 프로젝트 `-1`은 거부한다. 메인 앱의 Sentry environment도 위 환경 이름과 일치해야 한다.
- **admin 오류 수집**: admin용 Sentry 프로젝트의 `SENTRY_DSN`을 설정하면 기존 명시적 오류 캡처와 Next 서버 요청 오류를 수집한다. 서버 오류는 DSN 없이도 PM2에 JSON으로 기록한다. 이번 변경은 admin 브라우저 SDK·리플레이·트레이스·소스맵 업로드를 추가하지 않는다. 메인 앱의 기존 브라우저 오류는 Sentry 조회 대상에 메인 프로젝트를 넣으면 확인할 수 있다.

## 2. Alloy 설치와 설정

기준 버전은 **Alloy 1.22.0**이다. [공식 Linux 설치 안내](https://grafana.com/docs/alloy/latest/set-up/install/linux/)에 따라 Grafana RPM 서명 키와 저장소를 등록한 다음 AL2023에 `sudo dnf install alloy-1.22.0`으로 설치한다. 패키지 버전이 다르면 먼저 해당 버전으로 아래 설정 검증을 수행한다. VM에 새 공개 포트를 열지 않는다.

저장소 루트에서 실행한다. 이 절은 **운영 서버에서 실행할 절차**이며 앱 배포 스크립트가 자동 실행하지 않는다.

```bash
sudo install -d -o root -g alloy -m 0750 /etc/alloy/observability
sudo install -o root -g alloy -m 0640 deploy/observability/alloy.env.example /etc/alloy/observability.env
sudoedit /etc/alloy/observability.env
sudo install -o root -g alloy -m 0640 deploy/observability/config.alloy /etc/alloy/observability/config.alloy
sudo install -d /etc/systemd/system/alloy.service.d
sudo install -m 0644 deploy/observability/alloy.service.d.conf /etc/systemd/system/alloy.service.d/observability.conf
sudo install -d -o alloy -g alloy -m 0750 /var/lib/alloy
```

재배포 시 **기존 env를 예제로 덮어쓰지 않는다.** `.alloy`만 교체하고 env는 필요한 키만 편집한다. `alloy.env.example`의 PM2 경로는 `ec2-user` 기준이다. 실제 `pm2 describe bidit`, `pm2 describe admin-supporter-b`의 stdout/stderr 파일 경로와 일치시킨다. 프로세스 이름이 다르면 config의 glob도 변경한다.

Alloy에는 PM2 로그 읽기와 상위 디렉터리 통과 권한만 준다. 앱의 `.env`를 읽을 수 있는 전체 홈/앱 권한이나 Docker 그룹을 주지 않는다.

```bash
sudo dnf install acl
sudo setfacl -m u:alloy:--x /home/ec2-user /home/ec2-user/.pm2
sudo setfacl -m u:alloy:r-x /home/ec2-user/.pm2/logs
sudo setfacl -m d:u:alloy:r-x /home/ec2-user/.pm2/logs
sudo find /home/ec2-user/.pm2/logs -maxdepth 1 -type f \( -name 'bidit-*.log' -o -name 'admin-supporter-b-*.log' \) -exec setfacl -m u:alloy:r-- {} +
sudo usermod -aG systemd-journal alloy
# 배포판에서 journal 파일에 adm 그룹도 필요한 경우에만 추가한다.
sudo -u alloy journalctl -u caddy -n 1 --no-pager
sudo -u alloy bash -c 'set -a; . /etc/alloy/observability.env; set +a; /usr/bin/alloy validate /etc/alloy/observability'
sudo systemctl daemon-reload
sudo systemctl enable --now alloy
sudo systemctl restart alloy
sudo systemctl status alloy --no-pager
```

`/var/lib/alloy`에는 파일 읽기 위치와 지표 WAL이 저장된다. 재배포/재시작 시 지우지 않는다. 처음 발견한 PM2 파일은 끝에서 읽기 시작하여 과거 로그를 대량 업로드하지 않는다. 기존 파일 위치를 찾으면 그 위치부터 이어 읽는다. 새 파일/로테이션 시 실제 기록이 누락되지 않는지 검수한다. PM2 자체 로그 회전은 기존 운영 설정에서 유지한다.

지표는 60초 간격이며 필요한 metric 이름만 전송한다. Go 메모리 목표는 192MiB, systemd `MemoryHigh=256M`, `MemoryMax=384M`, `CPUQuota=50%`로 시작한다. 이는 측정된 사용량이 아니라 2GB VM 보호를 위한 초기 한도다. 실제 `MemoryCurrent`, OOM/restart, 앱 응답 시간을 관찰해 조정한다. 지표 WAL은 최대 보관 시간 2시간으로 설정되어 있지만 디스크 바이트 상한은 아니다. `/var/lib/alloy` 크기와 루트 디스크 사용량을 함께 감시한다.

로그 전송은 기본 GA Loki client를 사용한다. 전송 재시도 소진·프로세스 강제 종료 때 큐의 로그가 유실될 수 있으며 파일 위치 저장이 Cloud 수신 보장을 뜻하지 않는다. 감사 기록의 원장은 DB에 유지한다. `loki_write_dropped_entries_total`과 `loki_process_dropped_lines_total`로 의도한 필터/전송 손실을 구분한다.

## 3. Caddy와 Postgres 연결

**Caddy**는 메인 `bidit` 저장소가 소유한다. 그 저장소의 Caddyfile 전역 블록에 `metrics`를 추가하고, `deploy/observability/Caddyfile.snippet`의 선언을 병합한 뒤 필요한 두 사이트 블록에서 `import observability_access`를 사용한다. 기존 전역 블록/라우트를 새 파일로 덮어쓰지 않는다.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
curl --fail --silent http://127.0.0.1:2019/metrics
```

메트릭 엔드포인트는 localhost 2019에 유지한다. HTTP 요청량·5xx·p95는 현재 Caddyfile의 최상위 `handler="subroute"` 통계다. `requests_total`에는 상태 코드가 없으므로 5xx 비율은 상태 코드가 있는 `request_duration_seconds_count`로 계산한다. access log는 stderr→journal→Alloy로 수집하며 요청 URL·헤더·IP를 제외한다. 메인 저장소의 배포 원본에도 반영해야 다음 배포에서 설정이 사라지지 않는다.

**Postgres 지표**는 공유 DB 소유 저장소/운영 절차에서 별도 모니터링 계정을 만든 후 활성화한다. admin 앱은 스키마 마이그레이션이나 이 SQL을 자동 실행하지 않는다. 아래는 DB 운영자가 psql에서 실행할 예시다.

```sql
CREATE ROLE alloy_monitor LOGIN;
GRANT CONNECT ON DATABASE supporter_b TO alloy_monitor;
GRANT pg_monitor TO alloy_monitor;
\password alloy_monitor
```

Alloy env의 `POSTGRES_MONITOR_DSN`을 이 계정의 `postgresql://alloy_monitor:…@127.0.0.1:5432/supporter_b?sslmode=disable`로 설정한다. 비밀번호는 URL 인코딩하고 DB 포트는 기존 localhost 바인딩을 유지한다. 애플리케이션의 DB 쓰기 계정을 재사용하지 않는다.

```bash
sudo install -o root -g alloy -m 0640 deploy/observability/postgres.alloy.example /etc/alloy/observability/postgres.alloy
sudo -u alloy bash -c 'set -a; . /etc/alloy/observability.env; set +a; /usr/bin/alloy validate /etc/alloy/observability'
sudo systemctl restart alloy
```

`up`은 exporter scrape 성공, `pg_up`은 DB 접속 성공이다. 화면은 이를 각각 표시한다.

**Postgres 서버 로그**도 필요하면 메인 저장소의 Postgres compose 서비스에 다음 설정을 병합하고, DB 운영 절차에 따라 컨테이너를 재생성한다. 로깅 드라이버 변경에는 DB 재시작이 필요하므로 최초 지표 연결과 분리해 적용한다. Docker daemon 전체 설정은 변경하지 않는다.

```yaml
logging:
  driver: journald
  options:
    tag: bidit-postgres
```

그다음 `postgres-logs.alloy.example`을 `/etc/alloy/observability/postgres-logs.alloy`로 설치하고 validate/restart한다. `journalctl CONTAINER_TAG=bidit-postgres`로 원본 유입을 확인한다. SQL statement·DETAIL·HINT·CONTEXT·이어지는 줄은 전송하지 않는다. PostgreSQL은 `log_statement=none`, `log_min_error_statement=panic`, `log_parameter_max_length_on_error=0`으로 운영하고 slow SQL 전문 기록은 별도 검토한다. 오류 메시지 자체의 업무 데이터는 정규식으로 완전히 제거할 수 없으므로 켜기 전에 실제 로그 표본을 검수한다.

## 4. 관리자 앱 배포와 동작 확인

1. `.env.production`에 읽기 연결값을 채운 후 기존 `scripts/deploy/lightsail-deploy.sh`로 admin을 배포한다. 새로운 DB 테이블이나 마이그레이션은 없다.
2. Google 로그인과 TOTP를 완료한 관리자로 `/observability`에 접속한다. 최초 rate 지표는 샘플이 쌓이도록 5분 정도 기다린다. CPU·메모리·디스크, Caddy 통계, `up`, 활성화했다면 `pg_up`/DB 연결 수가 나타나는지 확인한다.
3. 테스트 요청을 보내 Caddy access log를, 개인정보 없는 테스트 오류로 admin PM2/Sentry 유입을 확인한다. Axiom/Sentry는 기존 앱에서 알려진 이벤트 하나를 검색한다. 각 프로젝트의 environment와 dataset 범위를 다시 확인한다.
4. 비로그인·TOTP 미완료 요청은 `/api/observability`에서도 인증으로 이동해야 한다. 브라우저 응답/HTML에 서비스 토큰이 없어야 한다. 조회 토큰 폐기 시 해당 수집원은 실패로 표시되어야 한다.
5. Alloy를 재시작한 뒤 파일 위치가 유지되는지, `systemctl show alloy -p MemoryCurrent -p NRestarts`와 Cloud의 드롭 카운터를 확인한다. VM 장애 때도 받을 수 있도록 Cloud 쪽에서 알림을 설정하고 테스트한다.

조회 조건은 URL에 유지된다. 기본 최근 1시간, 최대 7일 창과 KST 종료 시각을 지원한다. 로그·이슈는 최신 100건만 표시하고 메시지 검색은 리터럴 문자열로 처리한다. Axiom은 `msg`, Sentry Logs는 `message`, 사용자 활동은 작업명/대상 ID를 검색한다. Loki 수준 필터는 JSON에 level이 있는 기록에 적용되며 일반 텍스트는 전체 수준에서 조회한다.

서버가 고정 PromQL/LogQL/APL만 생성한다. 임의 쿼리·임의 URL을 받지 않는다. 조회마다 allowlist·TOTP·`observability.view` 권한을 확인하며 현재 정책상 모든 허용 관리자는 super_admin이다. 응답 캐시는 사용하지 않고 외부 요청은 8초/2MiB로 제한한다. 관리자당 분당 20회·동시 2회 제한은 **현재 단일 PM2 프로세스 기준**이므로 다중 인스턴스로 확장할 때 공유 limiter가 필요하다.

## 알림과 운영 한계

Cloud Alerting에서 다음 PromQL로 알림을 만든다. 아래 환경/instance는 실제 설정값으로 바꾸고, 연락 수단 및 수신자를 지정한 뒤 테스트한다. 설정 파일을 배포하는 것만으로 Cloud 알림이나 메시지 전송이 생성되지는 않는다.

| 상황 | PromQL 조건 | 지속 시간 |
|---|---|---|
| VM/Alloy 데이터 단절 | `absent_over_time(up{environment="production",job="integrations/node_exporter",instance="bidit-lightsail-1"}[10m])` | 즉시 |
| scrape 실패 | `up{environment="production",job=~"integrations/.*"} == 0` | 5분 |
| DB 연결 실패 | `pg_up{environment="production",job="integrations/postgres"} == 0` | 5분 |
| 메모리 부족 | `100 * (1 - node_memory_MemAvailable_bytes{environment="production"} / node_memory_MemTotal_bytes{environment="production"}) > 90` | 10분 |
| 루트 디스크 부족 | `100 * (1 - node_filesystem_avail_bytes{environment="production",mountpoint="/"} / node_filesystem_size_bytes{environment="production",mountpoint="/"}) > 85` | 10분 |
| 로그 전송 유실 | `sum(increase(loki_write_dropped_entries_total{environment="production"}[5m])) > 0` | 즉시 |

Alloy의 구조화 로그는 필드 허용 목록으로 요약한 후 전송한다. 원본 요청 body/header/URL·업무 객체를 전송하지 않고 이메일·토큰·접속 문자열 패턴을 추가 마스킹한다. 자유 텍스트에 들어간 임의 개인정보까지 보장하지 않으므로 앱에서 먼저 제거해야 한다. Cloud에서 보관 기간·series 수·로그 용량 및 알림 수신 상태를 점검한다. 이 화면은 수집된 데이터만 보여 주며 계측되지 않은 이벤트를 복원하지 않는다.

## 검증과 롤백

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# Alloy 1.22.0 바이너리가 PATH에 있거나 ALLOY_BIN으로 지정된 상태
pnpm check:alloy
```

`check:alloy`는 기본/선택 Postgres 설정을 검증하고 실제 Alloy에 가짜 로그를 흘려 토큰·이메일·헤더 제거를 확인한다. Cloud로 전송하지 않는다. macOS 검사만으로 Linux journal 접근 권한, 실제 DB 연결, Cloud 자격증명이나 운영 메모리 사용량까지 검증되지는 않는다.

중단 시 `sudo systemctl disable --now alloy`로 수집만 끈다. 앱/DB는 계속 동작하고 admin은 기간 경과 후 지표 없음으로 표시한다. 설정 변경 전 `/etc/alloy/observability`와 drop-in을 백업해 두고 이전 설정을 복원한 후 validate/restart한다. 상태 디렉터리 `/var/lib/alloy`는 보존한다. admin은 기존 배포 런북의 코드 롤백을 사용하고 사용하지 않을 Cloud 토큰은 폐기한다.

공식 참고: [Alloy 구성 검증](https://grafana.com/docs/alloy/latest/reference/cli/validate/), [Caddy metrics](https://caddyserver.com/docs/metrics), [Docker journald](https://docs.docker.com/engine/logging/drivers/journald/), [Loki write와 전송 한계](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.write/).
