# DeepSeek++ Automation Hub — 기능 추가 프레임워크 (Feature Framework)

> 새로운 능력(도구, 스킬, MCP 서버, 자동화)을 허브에 안전하게 추가하기 위한
> 공식 확장 포트와 계약. 이 문서는 실제 코드 경로만을 다루며, AGENTS.md의
> 아키텍처 불변 조건(Architecture and Compatibility Invariants)을 전제로 한다.

---

## 0. 프레임워크 설계 원칙

허브는 **단일 진실 라우터 + 폐쇄형 도구 카탈로그** 구조다. 새 기능은
"또 하나의 길(path)"을 만들지 않고, **기존 길에 끼워 들어가야 한다.**

| 원칙 | 의미 |
|---|---|
| **계약 먼저** | 구현보다 계약(컨트랙트 모듈)을 먼저 정의한다. 컨트랙트 모듈은 브라우저·DOM·provider·entrypoint 구현을 import하지 않는다. |
| **폐쇄형 카탈로그** | 라우터는 `TOOL_DEFINITIONS`에 선언되지 않은 도구 핸들러를 거부한다(fail-closed). 선언과 구현이 어긋나면 부팅이 아예 안 된다. |
| **하나의 진실** | 개념마다 라우터/검증기/정책/저장소는 하나만 존재한다. 대체 경로를 옆에 세우지 않는다. |
| **생명주기 온전히 소유** | 각 기능 모듈은 자신의 리스너·타이머·자식 프로세스·mutable state를 전부 만들고, `shutdown()`으로 전부 정리한다. |
| **직렬화 + 경계 검증** | 크로스 런타임/외부 I/O 계약은 수신 신뢰 경계에서 반드시 검증한다. |
| **권한 경로 단일** | 모든 프로덕션 도구 실행은 payload 재수화나 provider 실행 전에 런타임 인가 경로를 통과한다. |

---

## 1. 확장 포트 매트릭스 (Extension Ports)

### 포트 A — 네이티브 호스트 도구 (Native Host Tool)

LLM이 로컬 시스템(파일, 셸, 프로세스)에 접근하는 도구. **가장 많이 쓰이는 포트.**

```
packages/shell-host/native/          ← 표준 호스트 (12 → 18 tools)
integrations/native-host/            ← 허브 커스텀 호스트 (github_control, mcp_* 게이트웨이 포함)
```

**계약 (Contract):**
- 도구 정의: `contracts.mjs`의 `TOOL_DEFINITIONS` 배열
  - `{ name, title, description, inputSchema, annotations: { operation: 'read'|'write', risk: 'low'|'medium'|'high' } }`
- 핸들러 등록: `shell-mcp-host.mjs`의 `toolHandlerGroups` 배열
- 라우터: `router.mjs`의 `createToolRegistry()` — 카탈로그 미선언 핸들러 거부, 중복 등록 거부, 누락 핸들러 거부

**등록 절차 (6단계):**
1. `contracts.mjs`에 상수와 `TOOL_DEFINITIONS` 엔트리 추가
2. `<feature>-provider.mjs` 작성 — `create<Feature>ToolHandlers({ logLine })` 형태, `handlers` 배열 + `shutdown()` 반환
3. `contracts.mjs` export 블록에 새 상수 추가
4. `shell-mcp-host.mjs`에서 import 후 `toolHandlerGroups`에 추가
5. 호스트 종료 시 `main()`에서 `provider.shutdown()` 호출
6. **두 호스트 모두**에 동일하게 적용 (packages/ + integrations/)

**수호 테스트 (Guard Tests):**
- `tests/shell-host-external-contract.test.ts` — 호스트를 실제 spawn해서 `tools/list`와 fixture를 1:1 비교
- `tests/fixtures/external-runtime/shell-tools.json` — 호스트가 내려주는 도구 목록의 골든 카피

> ⚠️ **핵심 함정:** 확장 코어(`core/shell/contracts.ts`)와 네이티브 호스트(`contracts.mjs`)는
> **서로 다른 진실 원본**이다. 한쪽만 고치면 `tools/list`가 어긋나서 계약 테스트가 깨진다.
> 양쪽을 같이 고치고 fixture도 재생성해야 한다. (이것이 이번에 발견한 "연결 안 된 기능"의 원인이었다.)

**확장 코어 측 (Extension Core):**
- 도구 이름/리스크: `core/shell/contracts.ts`의 `SHELL_TOOL_NAMES` + `SHELL_TOOL_SPECS`
- 허용 목록 정책: `core/shell/policy.ts`의 `LOCAL_FILE_SHELL_TOOL_NAMES` / `TASK_SHELL_TOOL_NAMES` + `buildShellAllowlistUpgrade()`
- 사전 설정: `createShellMcpPresetInput()`
- 시작 시 자동 보정: `entrypoints/background.ts`의 `ensureShellMcpCompatibility()`

---

### 포트 B — 인-프로세스 도구 (In-Process Tool)

확장 프로세스 내부에서 실행되는 도구 (memory, web-search, skill-creator, browser-control, memory-import).

**계약:**
- 타입: `core/tool/types.ts`의 `ToolDescriptor`, `ToolProviderRegistration`, `ToolExecutionContext`
- 디스크립터: `core/tool/<feature>.ts`에서 `create<Feature>ToolDescriptors(locale)` export
- 실행: `execute<Feature>ToolCall(context, call, locale)`
- 카탈로그 조립: `core/tool/invocation.ts`의 `createDefaultToolDescriptors()`
- 제공자 등록: `core/tool/provider-registry.ts` (ToolProviderRegistry)

**등록 절차:**
1. `core/tool/<feature>.ts` 작성
2. `core/tool/invocation.ts`의 `createDefaultToolDescriptors()`에 spread 추가
3. `core/tool/index.ts` export 블록에 이름/타입/생성자 export
4. 필요 시 `core/prompt/augmentation.ts`에 힌트 텍스트 추가

**수호 테스트:**
- `tests/prompt-output-contract.test.ts` — 프롬프트 바이트 골든
- `tests/prompt-output/request/*.txt` — 골든 파일들

---

### 포트 C — MCP 서버 (외부 / 네이티브 / HTTP / SSE)

**계약:**
- 타입: `core/mcp/types.ts`의 `McpServerConfig`, `McpServerCreateInput`
- 저장소: `core/mcp/store.ts` — `createMcpServer`, `updateMcpServer`, `getAllMcpServers`
- 스토리지 코덱: `core/mcp/storage-codec.ts` (키: `deepseek_pp_mcp_servers`, 스키마 버전: `MCP_STORAGE_VERSION`)
- 디스커버리: `core/mcp/discovery.ts` — `refreshMcpServerDiscovery()`, `getMcpToolDescriptors()`
- 전송: `core/mcp/transports.ts` — native_messaging / http / sse / streamable_http
- 사전 설정: `core/multimodal/policy.ts` (멀티모달), `core/shell/policy.ts` (셸)

**등록 절차:**
1. `createMcpServer(input)`로 서버 등록 (background 시작 핸들러에서)
2. 전송 계약이 직렬화 가능하고 수신 경로에서 검증되는지 확인
3. `sanitizeMcpServerConfig()` 통과
4. 도구 캐시는 `saveMcpToolCache()` / `clearMcpToolCache()`로만

**수호 테스트:**
- `tests/mcp-external-contract.test.ts`, `tests/mcp-persistence-contract.test.ts`
- `tests/automation-storage-contract.test.ts`

---

### 포트 D — 스킬 (Skill)

**계약:**
- 타입: `core/types.ts`의 `Skill`, `SkillSource`
- 레지스트리: `core/skill/registry.ts` (스토리지 키: `deepseek_pp_skills`, `deepseek_pp_skill_sources`)
- 번들 로더: `core/skill/bundled-loader.ts` (공식 스킬)
- 로컬 임포터: `core/skill/local-importer.ts` — `parseSkillDoc()`가 SKILL.md 파싱의 단일 진실
- 생성 도구: `core/skill/creator-tool.ts`

**등록 절차 (번들 스킬):**
1. `core/skill/bundled-loader.ts`의 `BUNDLED_SKILL_REGISTRATIONS`에 등록
2. 에셋은 fetch 가능한 URL로
3. **반드시** `scripts/bundled-skill-package-policy.json`의 `skillSha256`에 해시 추가
   (이 해시가 `tests/bundled-skill-compatibility.test.ts`의 골든이다)

**수호 테스트:**
- `tests/bundled-skill-compatibility.test.ts` — 스킬 바이트 정체성
- `tests/local-skill-importer.test.ts`

---

### 포트 E — 자동화 (Automation)

**계약:**
- 런타임: `core/automation/` — 하나의 `running` 리스 + 인-프로세스 실행 컨텍스트(run ID, 데드라인, AbortSignal, 멱등키 팩토리)
- 스케줄러: 예정된 발생은 원자적으로 클레임, 재시작 후 재생 금지
- 시나리오: `core/scenario/`, 프리셋: `core/preset/`

**수호 테스트:** `tests/verify-automation` 스크립트 (`scripts/automation-contract-smoke.mjs`)

---

### 포트 F — 콘텐츠 스크립트 능력 (Content Capability)

**계약:**
- 명시적 멱등 `start/stop` 생명주기 + 자신이 만든 리스너·옵저버·타이머·DOM 루트·mutable state 전부 소유
- `entrypoints/content/controllers/`, `entrypoints/content/adapters/`

---

### 포트 G — 백그라운드 핸들러 / 메시지 라우팅

**계약:**
- `entrypoints/background.ts`는 composition/lifecycle 루트; 도메인 동작은 typed handler/service에
- 권한 파생: 브라우저가 제공하는 sender/tab/frame/document/WindowProxy + 수신 측 correlation state에서만
- 메시지가 선언하는 source/tab/frame/session/request ID는 **라우팅 주장이지 신원이 아니다**

---

## 2. 새 도구 추가 전체 체크리스트

새 네이티브 도구 하나를 추가할 때:

- [ ] `contracts.mjs` (packages/ **및** integrations/) — `TOOL_DEFINITIONS` + 상수 + export
- [ ] `<feature>-provider.mjs` (두 호스트 모두) — handlers + shutdown
- [ ] `shell-mcp-host.mjs` (두 호스트 모두) — import + toolHandlerGroups + main() shutdown
- [ ] `core/shell/contracts.ts` — `SHELL_TOOL_NAMES` + `SHELL_TOOL_SPECS` (이름·리스크 일치)
- [ ] `core/shell/policy.ts` — 해당하면 `LOCAL_FILE_SHELL_TOOL_NAMES` / `TASK_SHELL_TOOL_NAMES`에 추가
- [ ] `tests/fixtures/external-runtime/shell-tools.json` — 호스트에서 재생성
- [ ] 영향받는 테스트 기대값 갱신 (shell-policy, local-skill-importer 등)
- [ ] `npm run prompt:freeze:update` — 프롬프트 골든 (도구 목록이 프롬프트에 들어가므로)
- [ ] `npm run compile` + `npx vitest run`
- [ ] `integrations/deepseek-pp-custom/extension/` 빌드 재생성 (background.js 등)

---

## 3. 골든/픽스처 갱신 규칙 (AGENTS.md Testing 연계)

- 프롬프트 골든은 **반드시** `npm run prompt:freeze:update`로만. 수동 편집 금지.
- `shell-tools.json`은 호스트에서 재생성 (스크립스: `node scripts/regen-shell-tools.mjs`).
  현재는 임시 스크립트로 재생성했으므로, 이를 `scripts/`에 영구화하는 것을 권장.
- 스킬 해시는 `scripts/bundled-skill-package-policy.json`의 `skillSha256`.
- **단, 단순히 골든를 덮어쓰기만 해서는 안 된다.** AGENTS.md: "never promote malformed behavior
  to a legal fixture without an explicit compatibility decision." 바이트 변경이
  의도된 것인지 확인한 뒤에만 갱신.

---

## 4. 품질 검증 상태 (Quality Gates Status) — 2026-09-21 기준

| 검증 항목 | 상태 | 해결 내용 |
|---|---|---|
| `tests/bundled-skill-compatibility.test.ts` 스킬 해시 불일치 | **해결 완료 ✅** | 6대 신규 Shell 도구 반영에 따른 번들 스킬 바이트 아이덴티티 policy JSON 최신 동기화 |
| `tests/shell-host-runtime-modules.test.ts` Windows 동시성 | **통과 ✅** | 격리 실행 및 비동기 스트림 처리 안정화 |
| `tests/shell-host-local-skill-preview.test.ts` DPP_LOG_FILE 진단 | **해결 완료 ✅** | 크로스 플랫폼(Windows/Linux) 미작성 경로 정규화 |
| `tests/persistence-burst-budget.test.ts` 타이밍 버짓 | **해결 완료 ✅** | 플랫폼 타이머 정밀도(Windows win32 timer resolution) 반영 |
| 번들 사이즈 및 릴리스 에셋 정책 (`verify:sidepanel-chunks`, `verify:manifest-policy`, `verify:release-assets`) | **해결 완료 ✅** | 신규 도구 및 `unlimitedStorage` 권한, Windows `tar` zip 검증 호환성 반영 |

---

## 5. 프레임워크 확장 예시 (참고 구현)

`task-provider.mjs`와 `directory-provider.mjs`가 이 프레임워크의 **참고 구현**이다.
두 모듈은:

1. `contracts.mjs` `TOOL_DEFINITIONS`에 도구를 선언하고 (라우터가 폐쇄형으로 검증)
2. `toolHandlerGroups`를 통해 조립되며
3. 자신의 전체 생명주기(자식 프로세스, 바운디드 버퍼, 유휴 타이머, shutdown)를 소유하고
4. 모든 외부 입력(경로, 정규식, 크기)을 수신 경계에서 검증하고
5. 자원 소모에 하한선(MAX_TASKS, MAX_DIR_LIST_ENTRIES, MAX_FILE_SEARCH_HITS 등)을 둔다

새 기능을 추가할 때 이 두 모듈의 구조를 그대로 복사하는 것부터 시작하라.
