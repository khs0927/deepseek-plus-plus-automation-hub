# DeepSeek++ Automation Hub 운영 지침

## 1. 설치

~~~powershell
npm ci
Copy-Item .env.example .env
~~~

.env는 .gitignore 대상이며 절대 커밋하지 않는다. GitHub는 가능하면 gh auth login과 OS keyring을 사용한다.

## 2. DeepSeek++ 확장 검증

~~~powershell
npm run compile
npm test -- tests/tool-authorization.test.ts tests/content-tool-session-binding.test.ts tests/runtime-boundary.test.ts tests/background-tool-runtime-handlers.test.ts tests/inline-agent-event-protocol-golden.test.ts tests/pi-tool-bridge-authorization.test.ts --reporter=dot
npm run build:edge
~~~

개발용 확장은 Edge edge://extensions에서 개발자 모드를 켜고 dist/edge-mv3를 로드한다. 코드 변경 후 해당 확장을 Reload한다.

## 3. Native Host

Native Host 소스는 integrations/native-host에 있다. 설치 시 실제 사용자 AppData 경로에 복사하는 절차는 기존 npm run shell:install과 운영체제별 설치 가이드를 따른다. Native Host는 shell/python/GitHub/MCP 호출 권한이 크므로 신뢰된 로컬 세션에서만 사용한다.

protocol smoke의 기준은 initialize, tools/list, mcp_list_servers다. 출력에 토큰, 쿠키, 전체 환경변수 값을 포함하지 않는다.

## 4. MCP

integrations/mcp/mcp-servers.example.json은 실행 파일이 아니라 안전한 인벤토리다. 실제 MCP 구성은 사용자 로컬의 C:/Users/USER/.gemini/config/mcp_config.json에서 관리한다. 새 서버를 추가할 때는 서버 이름, 목적, transport/command/cwd, 필요한 환경변수 이름(값 제외), 위험도, smoke test 방법을 기록한다.

일반 흐름:

~~~text
mcp_list_servers → mcp_list_tools(server) → mcp_call(server, tool, arguments)
~~~

## 5. 세움터

세움터 작업은 로그인된 Edge를 먼저 준비한다.

~~~powershell
cd integrations/seumter
npm ci
npm test
.\\시작_Edge.bat
~~~

기본 연결은 http://127.0.0.1:9222이고 MCP 서버는 http://127.0.0.1:3300/mcp 또는 /sse를 사용한다. 세움터가 [NULL]처리중 오류를 반환하면 자동화 코드보다 로그인 세션을 먼저 확인한다. 인증 입력이 필요하면 사용자에게 요청한다.

## 6. 커밋/푸시

~~~powershell
git diff --check
git status --short
git add .
git commit -m "chore: package private DeepSeek++ automation hub"
gh repo create khs0927/deepseek-plus-plus-automation-hub --private --source . --remote private-origin --push
~~~

이미 저장소가 있으면 gh repo view로 private 여부를 먼저 확인한다. 원격 URL, 토큰, 쿠키를 로그에 출력하지 않는다.

## 7. 장애 대응

- Individual quota reached: 앱 정지가 아니라 계정 쿼터다. 로컬 코드 검증을 계속하고 토큰을 교체하지 않는다.
- tool_session_mismatch: content binding이 grant의 canonical session으로 정규화되는지 확인한다.
- MCP timeout: 서버별 command/cwd와 native host stderr를 확인하되 환경변수 값은 마스킹한다.
- 세움터 [NULL]: CDP 포트, 현재 탭, 로그인 세션, ds_SessionRep 순서로 확인한다.
