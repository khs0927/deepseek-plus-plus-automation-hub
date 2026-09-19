---
name: zapier-app-automation
description: >-
  Zapier MCP를 통해 Gmail, Slack, Google Calendar, Notion, Jira, HubSpot 등 7,000개 이상의 웹 서비스 및 비즈니스 앱 작업을 원클릭으로 검색, 실행 및 연동합니다.
version: 1.0.0
servers:
  - "zapier"
tools_count: 10
---

# ZAPIER APP AUTOMATION Skill

Zapier MCP를 통해 Gmail, Slack, Google Calendar, Notion, Jira, HubSpot 등 7,000개 이상의 웹 서비스 및 비즈니스 앱 작업을 원클릭으로 검색, 실행 및 연동합니다.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 10개)

### 연결 서버:
- `zapier`

### 도구 목록 (Actual Tool Names):
- `discover_zapier_actions`
- `inspect_zapier_actions`
- `enable_zapier_action`
- `disable_zapier_action`
- `execute_zapier_read_action`
- `execute_zapier_write_action`
- `list_zapier_connections`
- `manage_zapier_connections`
- `list_zapier_skills`
- `create_zapier_skill`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식 (Direct MCP Call):
`discover_zapier_actions(query="send slack message")`
`execute_zapier_write_action(action_name="Slack: Send Channel Message", parameters={"channel": "#general", "message_text": "Hello"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
