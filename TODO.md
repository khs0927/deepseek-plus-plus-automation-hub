# DeepSeek++ 잔여 TODO

기준일: 2026-09-21
기준 브랜치: `feat/jev-decision-plane`
구현 기준: 현재 브랜치 HEAD와 `docs/private-project/UPGRADE_IMPLEMENTATION_STATUS_KO.md`

이 문서는 “이미 구현된 기능”과 “아직 완료로 표시하면 안 되는 항목”을 분리하는 단일 작업 목록이다. 로그인, API key 발급, MCP 비밀값 연결은 사용자가 담당하는 설치 외부 작업이므로 제품 TODO로 세지 않는다.

## 우선순위 요약

| 우선순위 | 항목 | 상태 | 완료 기준 |
|---|---|---|---|
| P0 | realpath 기반 자원 잠금 | 미완료 | symlink/junction/short-name alias가 같은 lock identity로 직렬화되고 resolver 실패 시 fail-closed 보수 직렬화 |
| P0 | Chrome 실브라우저 다중 대화 E2E | 미확인 | Chrome에서 worker, sidepanel, 2개 독립 DeepSeek 탭과 회귀 결과 기록 |
| P1 | Firefox 실브라우저 E2E | 수동 필요 | 임시 add-on 로드 후 worker/sidebar/Native Host와 다중 탭 점검 |
| P1 | Job Object 제한 환경 검증 | 부분 완료 | 외부 Job Object/nested job 거부 시 `guaranteed`를 false로 유지하고 운영 화면에 표시 |
| P1 | 실제 MCP·프로젝트 기억 인수 | 수동 필요 | 로그인된 프로필에서 A/B 대화 출처, 정책 재검사, 병렬 독립 조회 확인 |
| P2 | 설치/배포 자동화 개선 | 부분 완료 | clone 후 wrapper로 build/Native Host까지 재현하고 브라우저 보안상 수동 단계만 남김 |
| P2 | 프로젝트 기록 기기 간 동기화 | 범위 제외 | 원문 project-context 동기화 계약과 충돌 병합 정책을 별도 승인 후 설계 |
| P2 | 완전한 OS sandbox | 범위 제외 | Shell 승인과 OS-level 네트워크/프로세스 격리를 별도 제품 범위로 재승인 |
| P2 | 임의 원격 MCP exactly-once | 보장 불가 | provider idempotency 계약 없이는 자동 재실행하지 않고 `outcome_unknown` 보존 |

## P0 — realpath 기반 자원 잠금

### 현재 문제

현재 scheduler의 경로 키는 lexical 정규화다. symlink, junction, Windows 8.3 short name, reparse point, 존재하지 않는 suffix가 실제 동일 자원을 서로 다른 key로 만들 수 있다. 이 상태에서 변경 도구를 병렬 실행하면 같은 파일 또는 같은 디렉터리를 동시에 변경할 위험이 남는다.

### 구현 범위

1. Native Host에 권한 없는 `path_identity`/realpath 조회 capability를 추가한다.
2. 기존 경로 allowlist 검사와 별개로 scheduler 실행 전에 provider별 identity resolver를 호출한다.
3. 존재하는 prefix를 realpath로 해석하고, 마지막 non-existent suffix를 안전하게 결합한다.
4. resolver 미지원·권한 오류·race가 있으면 변경 작업은 서버/작업 트리 단위로 보수적으로 직렬화한다.
5. lexical key와 realpath identity를 함께 lock하고, symlink/junction 변경이 감지되면 identity를 폐기한다.
6. 파일 생성·rename·delete 이후에는 예약 시점 identity가 여전히 유효한지 확인한다.

### 관련 파일

- `core/tool/scheduler-policy.ts`
- `core/tool/scheduler.ts`
- `core/tool/runtime.ts`
- `packages/shell-host/native/file-provider.mjs`
- `packages/shell-host/native/runtime-dispatcher.mjs`
- `packages/shell-host/native/process-provider.mjs`
- `integrations/native-host/file-provider.mjs`
- `integrations/deepseek-pp-custom/native-host/file-provider.mjs`
- `tests/tool-execution-scheduler.test.ts`
- 신규 권장: `tests/path-identity-lock.test.ts`
- 신규 권장: `scripts/path-identity-smoke.mjs`

### 인수 테스트

- 같은 파일을 real path와 symlink path로 변경 요청하면 동시 실행하지 않는다.
- Windows junction과 target directory 경유 요청이 한 lock으로 합쳐진다.
- 8.3 short name과 long name을 사용할 수 있는 환경에서 alias가 합쳐진다.
- 대상이 아직 없을 때 공통 부모 identity와 suffix를 사용한다.
- realpath 조회 중 오류가 나면 독립 병렬성을 낙관하지 않고 보수적으로 직렬화한다.
- resolver가 늦게 도착하거나 취소된 뒤 오래된 identity가 새 실행에 재사용되지 않는다.

## P0 — Chrome 실브라우저 E2E

현재 Edge 2-tab harness는 통과했지만 이 실행 환경의 Chrome channel에서는 extension service worker가 timeout되어 Chrome 결과를 확정하지 않았다.

관련 파일:

- `scripts/e2e-multi-chat.mjs`
- `docs/verification/browser-multi-chat-e2e.md`
- `wxt.config.ts`
- `dist/chrome-mv3/` (빌드 산출물)

완료 절차:

1. 실제 설치된 Chrome 경로와 버전을 확인한다.
2. `npm run build:chrome` 후 harness를 실행한다.
3. worker, sidepanel, 2개 DeepSeek 탭을 확인한다.
4. 로그인된 프로젝트에서 대화를 전송하지 않고도 탭 격리와 project-context 조회 상태를 점검한다.
5. 결과·브라우저 버전·실행 시각을 `docs/verification/browser-multi-chat-e2e.md`에 추가한다.

## P1 — Firefox 실브라우저 E2E

Firefox는 `about:debugging` 임시 add-on이 필요한 수동 경로다. 자동 harness가 Chrome/Edge처럼 확장 ID와 sidepanel API를 동일하게 사용할 수 있다고 가정하면 안 된다.

관련 파일:

- `scripts/e2e-multi-chat.mjs`
- `wxt.config.ts`
- `docs/archives/edge-firefox-browser-support/`
- `integrations/native-host/installer-locations.mjs`

확인 항목:

- Firefox MV3 manifest와 고정 extension ID
- toolbar action에서 sidebar 열기
- Native Host manifest 등록 및 `tools/list`
- 두 DeepSeek 탭의 탭·대화 owner 분리
- Firefox 재시작 후 임시 add-on 재로드 필요성을 문서에 반영

## P1 — Windows Job Object 제한 환경

일반 Windows smoke는 통과했다. 다만 Native Host가 이미 외부 Job Object 안에서 실행되거나 nested/breakaway 정책이 제한되면 `AssignProcessToJobObject`가 거부될 수 있다. 이 경우 fallback `taskkill /T /F`는 best-effort일 뿐 종료 보장이 아니다.

관련 파일:

- `packages/shell-host/native/process-lifecycle.mjs`
- `packages/shell-host/native/windows-job-object-helper.ps1`
- `packages/shell-host/native/process-provider.mjs`
- `scripts/windows-job-object-smoke.mjs`
- `docs/private-project/UPGRADE_IMPLEMENTATION_STATUS_KO.md`

완료 기준:

- attach 성공/실패가 운영 상태에 구분되어 보인다.
- `guaranteed: false` 결과를 성공 또는 완전 취소로 표시하지 않는다.
- helper가 없는 구버전 Host는 capability 제한으로 보고된다.
- 취소 후 실제 child와 child tree의 종료를 확인할 수 있다.

## P1 — 실제 MCP와 프로젝트 기억 인수

Mock MCP와 단위 테스트가 통과해도 외부 서버의 지연, 재연결, 권한 변경, 중복 응답은 별도 확인이 필요하다.

관련 파일:

- `core/mcp/transports/native.ts`
- `core/tool/scheduler.ts`
- `core/project-context/`
- `entrypoints/background/project-knowledge-handlers.ts`
- `entrypoints/sidepanel/components/ProjectKnowledgePanel.tsx`
- `entrypoints/sidepanel/components/ProjectExecutionPolicyPanel.tsx`
- `docs/private-project/PROJECT_MEMORY_KO.md`
- `docs/verification/browser-multi-chat-e2e.md`

수동 인수 시나리오:

1. 프로젝트 정책을 저장하지 않은 프로젝트 대화에서 tool call이 `policy_not_configured`로 거부되는지 확인한다.
2. 정책 저장 후 허용된 서버/도구만 실행되는지 확인한다.
3. 대화 A의 결정·검증 결과를 대화 B가 출처와 상태와 함께 검색하는지 확인한다.
4. 대화 A/B에서 독립적인 MCP 조회를 동시에 실행하고 결과가 서로 섞이지 않는지 확인한다.
5. 연결 재시작 후 늦은 응답이 새 대화의 결과로 배달되지 않는지 확인한다.
6. 공유 제외·정정·삭제 후 다음 prompt에 이전 기록이 재주입되지 않는지 확인한다.

## P2 — 설치와 배포의 남은 경계

현재 다음 파일로 clone 후 설치가 자동화되어 있다.

- `install-one-click.cmd`
- `install-one-click.ps1`
- `install-one-click.sh`
- `scripts/setup.mjs`
- `INSTALL.md`

아직 브라우저가 허용하지 않는 수동 단계는 남는다.

- Chrome/Edge 로컬 확장의 최초 `Load unpacked`
- Chrome/Edge 확장 ID 확인 후 Native Host 재등록
- Firefox 임시 add-on 로드
- 로그인·API key·MCP credential

이것들을 자동 설치가 끝났다고 표시하면 안 된다. 브라우저 store 패키지·서명·정책을 사용하는 정식 배포는 별도 release 작업이다.

## 범위 밖이지만 명시적으로 남겨두는 항목

### 프로젝트 기억의 다른 PC 동기화

현재 project-context 원문은 동일 브라우저 프로필 범위다. 기존 장기 Memory sync와 섞어 조용히 업로드하면 프로젝트 격리와 충돌 출처가 깨질 수 있다. export/import 또는 새 sync schema를 별도 설계·승인해야 한다.

### 완전한 OS sandbox

승인된 Shell은 경로 allowlist만으로 네트워크, 다른 프로세스, 명령 자체의 권한을 제거하지 않는다. OS sandbox를 주장하려면 Windows AppContainer/Job Object 정책, macOS sandbox-exec 대체, Linux namespace/seccomp 등 플랫폼별 별도 설계가 필요하다.

### 임의 원격 MCP exactly-once

취소 응답과 외부 변경의 실제 반영 시점이 분리될 수 있다. provider가 idempotency 계약을 제공하지 않는 한 변경 요청을 자동 재실행하지 않고 `outcome_unknown`으로 기록하는 것이 최종 보장이다.

## 완료 처리 규칙

- 코드·테스트·문서가 함께 변경되어야 `완료`로 바꾼다.
- mock 통과만으로 실브라우저/외부 provider 완료를 선언하지 않는다.
- 운영 fallback은 best-effort와 guarantee를 구분한다.
- 각 항목을 완료하면 이 문서의 상태와 `docs/private-project/UPGRADE_IMPLEMENTATION_STATUS_KO.md`를 같은 커밋에서 갱신한다.
- 새 컴퓨터 설치 경로가 바뀌면 `INSTALL.md`와 README의 링크/명령을 함께 확인한다.
