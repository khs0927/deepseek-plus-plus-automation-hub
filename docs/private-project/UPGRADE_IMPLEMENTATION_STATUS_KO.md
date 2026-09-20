# DeepSeek++ 통합 업그레이드 구현 현황

- 기준 브랜치: `feat/jev-decision-plane`
- 목적: 여러 대화방의 프로젝트 기억 공유, 실행 권한 격리, MCP 병렬 실행, 명령 정지·취소 복구, 여러 PC 설치 절차를 실제 코드로 통합한다.
- 인증·로그인·API key·MCP credential: 이 문서의 범위 밖이며 사용자가 각 환경에서 직접 설정한다.

## 현재 결론

| 영역 | 상태 | 근거 |
|---|---|---|
| 프로젝트 실행 정책 UI | 구현 | 프로젝트 페이지에서 승인 루트, MCP 서버/도구, Shell 도구를 저장·삭제 |
| 프로젝트 실행 fail-closed | 구현 | 프로젝트 대화에 정책이 없거나 정책에 없는 호출은 Background에서 차단 |
| Windows Job Object 종료 | 구현·Windows smoke 통과 | canonical Host와 두 integration Host에 helper 포함 |
| 출력 marker·UTF-8·취소·timeout | 구현 | Native Host process lifecycle/session parser |
| MCP 병렬 scheduler | 구현 | owner/server/lane/resource lock/fair queue/correlation |
| 프로젝트 대화 기억 | 구현 | project-context store/search/capture/provenance |
| 실브라우저 다중 대화 harness | 구현·Edge 2-tab smoke 통과 | MV3 worker, sidepanel, 2개 DeepSeek 탭 확인 |
| Chrome 실브라우저 smoke | 이 환경 미확인 | 현재 컴퓨터에서 Chrome channel worker가 시작되지 않음 |
| Firefox 실브라우저 smoke | 수동 필요 | about:debugging 임시 add-on 방식 |
| realpath 기반 자원 잠금 | 미완료 | 현재 scheduler는 lexical normalized path만 사용 |
| 완전한 OS sandbox | 미지원 | 승인된 Shell도 명령 자체의 네트워크·프로세스 권한을 제거하지 않음 |

## 설치와 사용

다른 컴퓨터에서는 다음을 실행한다.

```bash
git clone https://github.com/khs0927/deepseek-plus-plus-automation-hub.git
cd deepseek-plus-plus-automation-hub
npm ci
npm run setup -- --browser all
```

Chrome/Edge는 브라우저가 생성하는 확장 ID 때문에 다음 순서를 따른다.

1. `dist/chrome-mv3` 또는 `dist/edge-mv3`를 개발자 모드에서 한 번 로드한다.
2. 표시된 확장 ID로 Native Host를 등록한다.

```bash
npm run setup -- --browser chrome --chrome-extension-id <extension-id>
npm run setup -- --browser edge --edge-extension-id <extension-id>
```

Firefox는 고정 ID를 사용하므로 `npm run setup -- --browser firefox`가 Native Host 설치까지 처리한다. 확장 자체는 Firefox의 `about:debugging`에서 `dist/firefox-mv3/manifest.json`을 임시 로드해야 한다. 로그인·API key·MCP 비밀값은 저장소나 setup 스크립트가 다루지 않는다.

상태 점검:

```bash
npm run setup:status -- --browser all
npm run smoke:shell
npm run smoke:native-concurrent
npm run smoke:windows-job
```

실브라우저 기본 점검:

```bash
npm run e2e:browser -- --browser edge \
  --chat-url https://chat.deepseek.com/ \
  --chat-url https://chat.deepseek.com/
```

이 harness는 로그인·credential 입력·메시지 전송을 하지 않는다. 로그인된 프로필로 열어 프로젝트 기억과 MCP 실제 호출을 수동 인수한다.

## 정책 UI와 fail-closed

정책은 프로젝트 단위로 다음을 명시한다.

- 승인된 절대 경로
- 활성화된 MCP 서버 중 프로젝트에서 허용할 서버
- 서버별 허용 도구
- MCP와 독립된 Shell 활성화 여부
- 허용 Shell 도구

프로젝트 대화에 연결된 호출은 다음 순서로 검사한다.

```text
sender·conversation·project 확인
→ 프로젝트 정책 조회
→ 정책 없음이면 policy_not_configured로 거부
→ 서버의 실제 persisted enabled 상태 재확인
→ 서버·도구·경로 allowlist 검사
→ capability 해석 후 대상에 대해 정책 재검사
→ scheduler 예약
```

정책을 삭제해도 프로젝트 호출은 다시 fail-open 되지 않는다. 새 정책을 저장하기 전까지 차단된다. 프로젝트에 속하지 않은 대화는 프로젝트 정책을 적용할 대상이 없으므로 이 변경의 차단 대상이 아니다. 임의 Shell 명령을 OS sandbox로 바꾸지는 않는다.

관련 파일:

- `core/project/execution-policy.ts`
- `core/project/execution-policy-store.ts`
- `entrypoints/background.ts`
- `entrypoints/background/project-execution-policy-handlers.ts`
- `core/messaging/project-execution-policy-runtime-contracts.ts`
- `core/messaging/project-execution-policy-runtime-request-codec.ts`
- `core/messaging/runtime-command-contracts.ts`
- `core/messaging/runtime-command-registry.ts`
- `entrypoints/sidepanel/components/ProjectExecutionPolicyPanel.tsx`
- `entrypoints/sidepanel/pages/ProjectsPage.tsx`
- `core/i18n/resources/en/sidepanel.ts`
- `core/i18n/resources/zh-CN/sidepanel.ts`
- `tests/project-execution-policy.test.ts`
- `tests/background-persistence-handlers.test.ts`
- `tests/runtime-command-contract.test.ts`
- `tests/runtime-command-registry.test.ts`

## Windows Job Object

각 실행 child를 PowerShell + C# P/Invoke helper가 Job Object에 연결하고 `KILL_ON_JOB_CLOSE`를 설정한다. 취소·timeout 때 helper를 닫으면 관리 대상 child와 자식 프로세스가 함께 종료된다. helper 연결이 성립하지 않으면 결과는 보장된 종료로 표시하지 않고 기존 `taskkill /T /F` best-effort 경로로 남긴다.

canonical source와 배포 복사본은 모두 같은 기능을 갖는다.

- `packages/shell-host/native/process-lifecycle.mjs`
- `packages/shell-host/native/windows-job-object-helper.ps1`
- `packages/shell-host/native/process-provider.mjs`
- `integrations/native-host/process-lifecycle.mjs`
- `integrations/native-host/windows-job-object-helper.ps1`
- `integrations/native-host/process-provider.mjs`
- `integrations/deepseek-pp-custom/native-host/process-lifecycle.mjs`
- `integrations/deepseek-pp-custom/native-host/windows-job-object-helper.ps1`
- `integrations/deepseek-pp-custom/native-host/process-provider.mjs`
- `scripts/windows-job-object-smoke.mjs`

주의할 점은 Native Host가 이미 외부 Job Object 안에서 실행되고 있고 Windows가 nested/breakaway를 허용하지 않는 경우다. 이 경우 `AssignProcessToJobObject`가 거부될 수 있으며, 해당 실행은 guarantee가 아니라 best-effort로 기록된다. 이것을 숨기거나 성공으로 위장하지 않는다.

## MCP 병렬 실행과 명령 정지

공통 scheduler는 전체·대화방·서버·heavy lane의 동시 실행 수와 대기열을 제한한다. 읽기 요청은 병렬, 같은 Shell session·같은 경로의 변경·같은 브라우저 탭은 직렬로 처리한다. 응답은 `connectionGeneration + rpcRequestId`와 run/call owner로 상관시켜 재연결 뒤 늦은 응답이 새 실행으로 오지 않게 한다.

관련 파일:

- `core/tool/scheduler.ts`
- `core/tool/scheduler-policy.ts`
- `core/tool/runtime.ts`
- `core/mcp/transports/native.ts`
- `packages/shell-host/native/framing.mjs`
- `packages/shell-host/native/session-output-parser.mjs`
- `packages/shell-host/native/runtime-dispatcher.mjs`
- `packages/shell-host/native/task-provider.mjs`
- `integrations/native-host/*`
- `integrations/deepseek-pp-custom/native-host/*`
- `tests/tool-execution-scheduler.test.ts`
- `tests/mcp-capability-runtime.test.ts`
- `scripts/shell-smoke.mjs`
- `scripts/mcp-live-mock.mjs`

### 아직 해결하지 않은 realpath 문제

현재 `core/tool/scheduler-policy.ts`의 경로 잠금은 `.`, `..`, separator, Windows drive case를 정규화한 lexical key다. 다음 alias는 실제 같은 파일이어도 scheduler에서 다르게 보일 수 있다.

- symlink 또는 junction 경유 경로
- Windows 8.3 short name과 long name
- mount/reparse point alias
- 아직 존재하지 않는 파일을 포함한 경로

따라서 realpath 기반 잠금은 다음 순서로 별도 구현해야 한다.

1. Native Host에 권한 없는 `path_identity`/realpath 조회 capability를 추가한다.
2. scheduler가 실행 전에 provider별 identity resolver를 호출한다.
3. 존재하는 prefix의 realpath와 마지막 non-existent suffix를 결합한다.
4. 확인 실패·권한 오류·provider 미지원이면 변경 작업을 보수적으로 서버 단위 직렬화한다.
5. 예약 시 identity와 lexical key를 함께 잡고, 경로 변경 결과가 의심스러우면 lock identity를 폐기한다.
6. junction/symlink 생성·삭제 경쟁을 포함한 Windows fixture를 추가한다.

브라우저 service worker만으로는 로컬 OS realpath를 직접 얻을 수 없으므로, 이 부분은 lexical key를 realpath라고 이름만 바꾸는 식으로 해결하면 안 된다.

## 프로젝트 대화 기억

프로젝트에 연결된 대화의 완료 메시지와 확장이 확인한 도구 결과를 project-context에 기록한다. 후보 요약, 확인된 사실, 실패, 인계, 충돌을 구분하고 다음 출처를 보존한다.

- `core/project-context/types.ts`
- `core/project-context/store.ts`
- `core/project-context/search.ts`
- `core/project-context/codec.ts`
- `core/project-context/tools.ts`
- `core/project-context/index.ts`
- `core/memory/database.ts`
- `entrypoints/background/project-knowledge-handlers.ts`
- `entrypoints/sidepanel/components/ProjectKnowledgePanel.tsx`
- `tests/project-context-knowledge.test.ts`
- `tests/project-context-store.test.ts`
- `docs/private-project/PROJECT_MEMORY_KO.md`

현재 범위는 동일 브라우저 프로필이다. 다른 PC의 프로젝트 원문 기록을 자동 동기화한다고 주장하지 않는다. 필요하면 export/import 또는 장기 Memory 승격을 사용한다.

## 검증 결과

이번 작업에서 확인한 명령:

- `npm run compile -- --pretty false`: 통과
- 정책·scheduler·MCP capability·project knowledge·Native Host 테스트 6 files / 51 tests: 통과
- `npm run smoke:windows-job`: 실제 Job Object attach/kill-on-close 통과
- `npm run smoke:native-concurrent`: `tools/list`가 장기 `shell_exec`보다 먼저 응답하는 동시성 통과
- `npm test -- --reporter=dot`: 225 files / 1,847 tests 통과
- `npm run build:chrome`: 통과
- `npm run build:edge`: 통과
- Edge 실브라우저 2-tab harness: extension worker, sidepanel, 독립 DeepSeek 탭 2개 통과
- Chrome 실브라우저 harness: 현재 환경에서 service worker timeout으로 미확인
- Firefox 실브라우저 harness: 수동 검증 필요

푸시 전 남은 검증은 전체 test suite, `build:all`, MCP mock, manifest policy, diff check와 staged diff 점검이다.
