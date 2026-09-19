---
name: browser-web-automation
description: >-
  Playwright 기반 완전 브라우저 원격 자동화 도구 25종. 웹페이지 탐색, 폼 입력, 클릭, 스크린샷 캡처, DOM 스냅샷 추출, 네트워크 트래픽 인터셉트, 콘솔 로그 감지.
version: 1.0.0
servers:
  - "browser (Playwright)"
tools_count: 19
---

# BROWSER WEB AUTOMATION Skill

Playwright 기반 완전 브라우저 원격 자동화 도구 25종. 웹페이지 탐색, 폼 입력, 클릭, 스크린샷 캡처, DOM 스냅샷 추출, 네트워크 트래픽 인터셉트, 콘솔 로그 감지.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 19개)

### 연결 서버:
- `browser (Playwright)`

### 도구 목록 (Actual Tool Names):
- `browser_navigate`
- `browser_click`
- `browser_fill_form`
- `browser_type`
- `browser_press_key`
- `browser_take_screenshot`
- `browser_snapshot`
- `browser_find`
- `browser_wait_for`
- `browser_evaluate`
- `browser_select_option`
- `browser_hover`
- `browser_drag`
- `browser_drop`
- `browser_tabs`
- `browser_resize`
- `browser_console_messages`
- `browser_network_requests`
- `browser_close`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식 (Direct MCP Call):
`browser_navigate(url="https://news.ycombinator.com")`
`browser_snapshot()`
`browser_click(selector="a.storylink")`
`browser_take_screenshot(full_page=true)`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
