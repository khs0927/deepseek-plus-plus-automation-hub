# IDE 없이 DeepSeek 사이트에서 전부 하기 — 워크플로 프레임워크

목표: Codex/Antigravity 같은 로컬 IDE 없이 `chat.deepseek.com` + DeepSeek++ 확장만으로
파일·셸·MCP·자동화를 수행한다. 아래 매핑과 규칙이 프레임워크 전부다.

## 1. 연결 상태 (검증됨)

- 확장 `deepseek-plus-plus v1.14.0` Edge `dist/edge-mv3` 로드
- Native Host 16 도구: shell(5) + python(2) + file(4) + skill/picker(3) + mcp gateway(3) + github(1)
- MCP 39 서버 (`mcp_config.json` 로컬 관리, 값은 커밋 금지)
- 세움터 MCP `http://127.0.0.1:3300`, Edge CDP `http://127.0.0.1:9222` (프로필 `C:\edge_dev`)
- 서브에이전트 MCP `:8932` (장시간 백그라운드 전용)

## 2. 세션 규칙 (필수)

1. 채팅 1개 = shell 세션 풀 1개. `shell_session_begin` 한 번, 이후 `shell_session_exec` 재사용.
2. OfficeCLI 상주모드는 세션을 절대 먼저 닫지 않는다. 상주가 죽으면 같은 세션에서
   `begin`부터 다시 (새 세션에 옛 `session_id` 재사용 금지).
3. 한 세션 안에서는 명령을 순차로만 보낸다 (마커 프로토콜). 병렬이 필요하면 세션을 하나 더 연다.
4. 작업 끝나면 `shell_session_end`로 닫는다 (idle 5분 자동 정리도 있음).
5. `local_file_write` 900KB 상한: 큰 파일은 분할 쓰기.

## 3. 로컬 IDE 작업 매핑표

| IDE에서 하던 것 | 딥식 사이트에서 할 것 |
|---|---|
| 터미널 명령 | 채팅에서 `shell_session_exec` (세션 유지) |
| 파일 읽기/쓰기 | `local_file_read` 창읽기 + `local_file_write` (경로는 절대경로) |
| 장시간 실행/관찰 | `shell_session_begin` + 자동화 태스크(cron/RRULE, 독립세션, lease) |
| 웹 검색·문서 읽기 | `web_search`/`web_fetch` 또는 MCP `exa` 경유 `mcp_call` |
| 코드 리뷰 | 인라인 에이전트 + Skill (`review-spd`, `spec-driven-develop`) |
| PR/이슈 | `github_control` (repo/pr/issue 고정 액션, freeform은 `exec_gh`) |
| 세움터·BIRA | 세움터 MCP(`mcp_call`) + 로그인된 CDP Edge 창 유지 |
| 백그라운드 데몬 | 서브에이전트 MCP `:8932` ( 확장과 별도 프로세스) |

## 4. 동시성 보장 (구현됨, 2026-09-20)

- 디스패처가 세션별 FIFO + 세션 간 병렬로 동작한다 (3본 패치:
  `integrations/native-host`, `packages/shell-host/native`,
  `deepseek-pp-custom/native-host`).
- 한 채팅의 장시간 셸이 다른 채팅을 막지 않는다. 같은 세션 안의 순서는 보장된다.
- 응답 프레이밍은 `framing.mjs writeTail`이 보호한다.

## 5. 보안 경계 (어기면 안 됨)

- MCP/셸 자식 프로세스는 최소 env (`createChildEnv`) + 토큰은 `gh auth`/키링.
- 위조 캐시 어노테이션은 fail-closed (`storage-codec.ts`, 테스트
  `mcp-persistence-contract` 29개가 수호).
- `caller-supplied metadata`는 권한 근거가 아니다 (grant 세션 정규화 유지).
- 실토큰·쿠키·프로필·산출물은 커밋 금지 (`.env.example` + 이름만).

## 6. 남은 갭 (우선순위순)

1. `mcp_servers.json` 실토큰 폐기 (보안, 최우선).
2. MCP 호출당 프로세스 스폰 → 연결 풀링 (후속 과제).
3. native-host 3본 / subagent-mcp 2본 중복을 `packages/shell-host` 단일 진실로 통합.
4. 와치독 SKILL.md(30초 자동감시) vs `watchdog-daemon.js`(자동주입 영구비활성) 괴리 해소.
5. P1 테스트코드 3건 (`npm.cmd`, 경로구분자, locale).
