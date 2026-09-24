# Seumter / EAIS Integration

세움터 연동은 전용 Microsoft Edge 프로필의 CDP에 연결해 WebSquare 화면을 점검하고, 기본개요·체크리스트·도면 업로드·BIRA 단계를 자동화한다. 세움터 MCP 서버는 상태 조회, 구조화된 페이지 검사, 클릭, 입력, 체크리스트, 개요 입력, 주소 검색, 스크린샷 도구를 제공한다. 임의 WebSquare JavaScript 실행은 기본 차단되며 `SEUMTER_ALLOW_EVAL=1`을 명시한 신뢰된 로컬 진단에서만 허용한다.

## Aside 에이전트 제어 CLI

`agent_control` CLI는 로컬 MCP/JSON-RPC 제어 데몬을 통해 전용 Edge CDP를 사용한다. 데몬이 Playwright 연결 수명주기를 소유하므로 단발 명령이 종료되어도 Edge와 로그인 세션이 유지된다. 모든 결과는 JSON으로 반환하며 로그인 정보, 쿠키, 전체 입력값을 출력하지 않는다.

```powershell
npm run control:status
npm run control:tabs
npm run control:inspect
node src/cli/agent_control.js click --text "저장" --confirm
node src/cli/agent_control.js fill --selector "#componentId" --value "값" --confirm
npm run control:install-task
npm run control:uninstall-task
```

- `status`, `tabs`, `inspect`는 읽기 전용이다.
- `click`, `fill`, `screenshot`, `launch`는 `--confirm`이 없으면 실행되지 않는다.
- 기본 CDP 주소는 `http://127.0.0.1:9222`이며 loopback HTTP만 허용한다.
- 세움터 탭이 없으면 임의 탭을 대신 제어하지 않고 명시적으로 실패한다.
- `control:install-task`은 현재 사용자의 Windows 작업 스케줄러에 `Aside-Seumter-Control`을 등록하고 즉시 시작한다. 기본 CLI 호출은 데emon이 없을 때 이 태스크를 시작한다.
- 기존 MCP와 WebSquare 자동화 모듈은 같은 제어 데몬 및 별도 자동화 스크립트로 계속 사용할 수 있다.

## 런타임

- Edge CDP: CDP_URL (기본 http://127.0.0.1:9222)
- MCP: SEUMTER_MCP_PORT (기본 3300)
- Edge profile: EDGE_USER_DATA_DIR (기본 C:\edge_dev)
- 대상 문서/프로젝트 설정은 로컬 파일로만 공급한다.

## 저장소 포함 범위

포함: src, 테스트, MCP 서버, BIRA 모듈, Edge 실행 스크립트, 프로젝트 템플릿.

제외: 실제 HWP/PDF/PNG, SQLite DB, 브라우저 프로필, 세션 쿠키, 사용자별 프로젝트 JSON, scratch 산출물.

세움터 서버가 ds_SessionRep:null 또는 [NULL]처리중 오류를 반환하면 해당 Edge 프로필에서 먼저 사용자가 로그인해야 한다. 자동화는 로그인 정보나 쿠키를 수집·저장하지 않는다.
