# Seumter / EAIS Integration

세움터 연동은 Microsoft Edge의 CDP에 연결해 WebSquare 화면을 점검하고, 기본개요·체크리스트·도면 업로드·BIRA 단계를 자동화한다. 세움터 MCP 서버는 상태 조회, 페이지 읽기, WebSquare 평가, 클릭, 입력, 체크리스트, 개요 입력, 주소 검색, 스크린샷 도구를 제공한다.

## 런타임

- Edge CDP: CDP_URL (기본 http://127.0.0.1:9222)
- MCP: SEUMTER_MCP_PORT (기본 3300)
- Edge profile: EDGE_USER_DATA_DIR (기본 C:\edge_dev)
- 대상 문서/프로젝트 설정은 로컬 파일로만 공급한다.

## 저장소 포함 범위

포함: src, 테스트, MCP 서버, BIRA 모듈, Edge 실행 스크립트, 프로젝트 템플릿.

제외: 실제 HWP/PDF/PNG, SQLite DB, 브라우저 프로필, 세션 쿠키, 사용자별 프로젝트 JSON, scratch 산출물.

세움터 서버가 ds_SessionRep:null 또는 [NULL]처리중 오류를 반환하면 해당 Edge 프로필에서 먼저 사용자가 로그인해야 한다. 자동화는 로그인 정보나 쿠키를 수집·저장하지 않는다.
