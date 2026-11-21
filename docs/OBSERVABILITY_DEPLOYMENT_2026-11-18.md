# 2026-11-18 Grafana Cloud 운영 연결

기존 Google 로그인으로 Grafana Cloud 계정과 첫 스택을 생성하고, 전날 준비한 운영 Alloy와 관리자 조회 설정을 연결했다. Cloud에서 실제 지표와 로그 수신을 확인했다.

## 계정·스택

| 항목 | 값 |
|---|---|
| Grafana | https://cordialpike3024.grafana.net |
| Organization / stack slug | `cordialpike3024` |
| Stack ID | `1927743` |
| 리전 | Japan / `prod-ap-northeast-0` |
| 현재 요금제 | Cloud Free. 가입 시 제공되는 한도 확대 체험이 표시됨. 카드 등록·유료 업그레이드 없음 |
| Metrics instance ID | `3779696` |
| Metrics query base | `https://prometheus-prod-49-prod-ap-northeast-0.grafana.net/api/prom` |
| Metrics remote write | 위 query base + `/push` |
| Logs instance ID | `1885516` |
| Logs query base | `https://logs-prod-030.grafana.net` |
| Logs push | 위 query base + `/loki/api/v1/push` |

Grafana 화면에서 현재 요금제가 Cloud Free이고 사용량은 무료 한도로 제한된다고 확인했다. 체험 기간에 가능한 사용량과 지속 가능한 무료 한도는 다르므로 실제 사용량을 점검한다.

## 자격증명

두 access policy 모두 이 스택(`type=stack`, `identifier=1927743`)으로 제한했다. 조직 전체 권한이나 정책 관리 권한은 부여하지 않았다.

| 용도 | Policy / 권한 | 토큰 만료 (KST) |
|---|---|---|
| 관리자 조회 | `bidit-production-admin-read`, `metrics:read`, `logs:read` | 2027-02-16 00:36:13 |
| Alloy 전송 | `bidit-production-alloy-write`, `metrics:write`, `logs:write` | 2027-02-16 00:37:46 |

**2027-02-15까지 두 토큰을 교체한다.** [Access Policies](https://grafana.com/orgs/cordialpike3024/access-policies)에서 같은 정책에 새 토큰을 만든 다음 아래 파일의 해당 키만 교체한다. 관리자와 Alloy를 재시작하고 조회·전송을 검증한 후 기존 토큰을 폐기한다. 자동 갱신이나 알림 일정은 생성하지 않았다.

- 관리자: `/home/ec2-user/release-20261117-observability-v2/.env.production`, 0600. `GRAFANA_READ_TOKEN` 및 조회 endpoint·instance ID 설정.
- Alloy: `/etc/alloy/observability.env`, `root:alloy` 0640. `GRAFANA_WRITE_TOKEN` 및 전송 endpoint·instance ID 설정. 기존 PostgreSQL DSN은 보존.
- 환경변수 교체 전 백업: `/home/ec2-user/admin-observability-cloud-20261118/{admin,alloy}.env.before-cloud`, 0600. 상위 디렉터리 0700.
- 토큰 값은 문서·Git에 기록하지 않는다.

## 운영 상태와 검증

- Alloy 1.22.0: 실제 환경변수로 validate 통과 후 unmask, enable/start. `/-/ready` HTTP 200, systemd active/running 확인.
- 관리자: 기존 v2 릴리스를 환경변수 갱신 후 재시작하고 `pm2 save`. 메인 앱과 DB는 재시작하지 않았다.
- Cloud 조회: 실제 운영 코드와 동일한 9개 PromQL을 `query_range`로 실행해 모두 HTTP 200, 유효한 숫자 샘플, warning 없음 확인.
- 운영 서버의 실제 `.env.production`과 배포된 `loadMetrics`·`loadLogs` 어댑터를 서버 검증 스크립트에서 실행해 지표 9개 `ready`, 테스트 로그 1건 `ready` 확인. 반환 데이터에 읽기 토큰이 포함되지 않음. 이 검사는 로그인한 브라우저나 인증된 HTTP API 검사를 대체하지 않는다.
- CPU·메모리·디스크·프록시 요청량·5xx·p95·DB 연결 수·DB 접속·수집 대상 상태 조회 성공.
- `up=1`: node exporter, Caddy, PostgreSQL exporter, Alloy 4개. `pg_up=1`로 실제 DB 접속도 확인.
- Loki: Caddy access log와 관리자 PM2 테스트 이벤트 도착 확인.
- Alloy 재시작 후 테스트 이벤트를 추가했으며 이전·이후 이벤트가 각각 1건으로 조회되어 읽기 위치 유지와 수집 재개를 확인.
- 가짜 이메일·토큰·request header/body를 넣은 테스트 로그에서 이메일·토큰 마스킹과 header/body 제외를 Cloud에 저장된 결과로 확인. 실제 개인정보나 자격증명은 테스트에 사용하지 않음.
- 점검 시 전송 실패·로그 드롭 0, 비정상 재시작 0. 재시작 후 관찰한 Alloy 메모리는 약 65MiB. 장기 부하 검증 결과는 아님.
- 관리자 Google 로그인 후 TOTP 입력 화면까지 확인. 인증 앱 코드가 필요하므로 로그인 완료 후 관측 화면·인증된 관리자 API 검증은 아직 미완료.

이 작업에서는 애플리케이션 코드를 추가 변경하지 않았다. 전날의 빌드·테스트 결과와 격리 릴리스는 [2026-11-17 배포 기록](OBSERVABILITY_DEPLOYMENT_2026-11-17.md)에 있다. 수동 배포 원본이 Git 원격에 아직 반영되지 않았으므로 다음 일반 배포 전에 해당 코드와 **현재 운영 환경변수**를 이어받는다.

## 남은 별도 연결

Axiom·Sentry 조회용 자격증명, 관리자 Sentry DSN, PostgreSQL 서버 로그 수집, Cloud 알림 규칙·수신 경로는 이번 Cloud 연결로 활성화되지 않았다. 현재 확인한 범위는 호스트/Caddy/PostgreSQL 지표와 PM2/Caddy 로그다. 메인 앱에서 Axiom으로만 보내는 업무 로그는 해당 조회 연결을 별도로 설정해야 한다.

## 중단·복구

수집만 중단하려면 `sudo systemctl stop alloy`를 사용한다. `/var/lib/alloy`는 지우지 않는다. 관리자 앱은 계속 실행되며 외부 조회 설정을 비우면 연결 전 상태로 표시한다.

Cloud 연결 전 상태로 복구할 때는 위 백업의 환경변수를 각각 기존 소유자·권한으로 복원하고 관리자 프로세스를 재시작한다. Alloy는 stop/disable한다. 필요 없는 Cloud 토큰은 폐기한다. 앱·Caddy 전체 복구 지점은 전날 배포 기록을 따른다.
