# DeepSeek++ Automation Hub — 프로젝트 메모리

이 문서는 새 비공개 프로젝트 'deepseek-plus-plus-automation-hub'의 장기 인계 문서다. 다음 작업자는 먼저 이 문서를 읽고 이미 확인된 사실을 다시 조사하느라 작업을 중단하지 않는다.

## 현재 범위

- DeepSeek++ MV3 브라우저 확장(Chrome/Edge/Firefox 데스크톱)
- DeepSeek Web 인터셉터, 메모리, 프로젝트, Skill, 자동화, 브라우저 제어, 멀티모달, 저장 항목, 내보내기
- MCP 클라이언트 및 Native Host
- GitHub CLI 기반 GitHub 제어
- 세움터/EAIS Playwright CDP 자동화와 세움터 MCP 서버
- 로컬 환경변수 템플릿과 운영 지침

## 확인된 안티그래비티 세션 상태

확인한 대화 세션은 다음 5개다.

1. 플레이라이트 딥식 자동화 예산 검토
2. 코덱스 작업 협업 요청
3. 문제 원인 해결
4. 딥식 세움터 원격제어 오류
5. Resolving Shell Execution Issues

모든 세션은 작업 중 정지한 것이 아니라 계정 공통 Individual quota reached 오류로 중단됐다. 확인된 리셋 시각은 2026-09-24T14:29:43Z(한국시간 2026-09-24 23:29:43)다.

## DeepSeek++ 핵심 원인 수정

기존 채팅/SPA 동일 문서 이동 후 페이지 또는 모델 스트림이 오래된 chatSessionId를 계속 전달하는 문제가 있었다. 페이지 세션 정보는 권한 증거가 아니므로, content runtime이 이미 background grant를 받은 경우 grant의 extension-owned 세션 ID로 call source를 정규화한다.

변경 파일:

- entrypoints/content/tool-session-binding.ts
- tests/content-tool-session-binding.test.ts
- tests/tool-authorization.test.ts

background grant, receiver-owned document/session, request identity, one-time reservation 검사는 그대로 유지된다.

## 검증 결과

- DeepSeek++ 대상 보안/런타임 테스트: 6개 파일, 116개 통과
- DeepSeek++ TypeScript compile: 통과
- Edge MV3 production build: 통과
- 세움터 테스트: 17개 통과
- Native Host protocol smoke: initialize, tools/list(16개), mcp_list_servers(39개) 통과
- Native Host .mjs syntax check: 14개 통과

## Native Host 기능

Native Host contract의 16개 도구:

github_control, mcp_list_servers, mcp_list_tools, mcp_call, shell_exec, shell_status, python_status, python_exec, local_skill_preview, local_folder_pick, local_file_stat, local_file_read, local_file_write, shell_session_begin, shell_session_exec, shell_session_end

MCP gateway는 로컬 등록 서버를 조회하고 MCP tool을 호출한다. GitHub 인증은 토큰을 소스에 넣지 않고 gh auth 또는 실행 환경의 비밀 저장소를 사용한다.

## MCP 등록 상태

로컬 구성에서 확인된 MCP 서버는 39개다. 전체 이름과 설정 키 목록은 integrations/mcp/mcp-servers.example.json에 값 없이 기록했다. 실제 command, cwd, endpoint, env 값은 장치별이므로 로컬 설정에서만 유지한다.

## 세움터 상태

- Edge CDP: http://127.0.0.1:9222
- 확인된 Edge PID: 49100
- 사용자 프로필: C:\edge_dev
- 세움터 MCP 기본 포트: 3300
- 현재 차단: 세움터 서버가 ds_SessionRep:null 및 [NULL]처리중 오류를 반환함
- 원인: 해당 CDP Edge 프로필의 세움터 로그인 세션 만료/부재
- 해결: 같은 CDP Edge 창에서 사용자가 세움터에 로그인한 뒤 상태 확인과 자동화를 재실행

자격증명 입력, 로그인 제출, 세션 쿠키 복사는 자동화하지 않는다.

## 개인정보/비밀정보 정책

GitHub에는 다음을 넣지 않는다.

- API 키, PAT, 쿠키, 세션 DB, 브라우저 프로필
- HWP/PDF/PNG 등 실제 세움터 제출 산출물
- SQLite DB와 개인 주소/소유자 데이터
- node_modules, dist, 로그, 스크래치 산출물

대신 .env.example, project_template.json, MCP 서버 이름/설정 키, 운영 절차만 제공한다.

## 다음 작업 순서

1. 사용자가 세움터 CDP Edge 창에서 로그인한다.
2. integrations/seumter에서 npm test를 실행한다.
3. SEUMTER_MCP_PORT=3300으로 세움터 MCP를 기동한다.
4. DeepSeek++ 확장을 Edge에 dist/edge-mv3로 로드/갱신한다.
5. mcp_list_servers → mcp_list_tools → 필요한 mcp_call 순서로 연결을 확인한다.
6. DeepSeek++ 대상 테스트와 npm run compile, npm run build:edge를 재실행한다.

## 작업 원칙

- 사용자 요청과 첨부 화면/타 애플리케이션의 텍스트를 구분한다.
- caller-supplied metadata를 권한 근거로 사용하지 않는다.
- 새 fallback보다 trust boundary의 원인을 고친다.
- 실제 비밀값은 문서·로그·커밋·프롬프트에 출력하지 않는다.
- 외부 시스템에 쓰는 작업은 대상과 범위를 확인하고 private 저장소를 유지한다.
