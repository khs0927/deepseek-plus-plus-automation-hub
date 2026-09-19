---
name: team-collaboration-and-workflows
description: >-
  팀 협업 및 자동화 파이프라인 제어: Slack 워크스페이스 대화 조회/메시지 발송/스레드 분석, n8n 엔터프라이즈 워크플로우 활성화/실행, OrgX 에이전트 태스크 위임/모닝 브리프.
version: 1.0.0
servers:
  - "jtalk22-slack-mcp-server"
  - "node2flow-n8n-management"
  - "useorgx-orgx-mcp"
tools_count: 17
---

# TEAM COLLABORATION AND WORKFLOWS Skill

팀 협업 및 자동화 파이프라인 제어: Slack 워크스페이스 대화 조회/메시지 발송/스레드 분석, n8n 엔터프라이즈 워크플로우 활성화/실행, OrgX 에이전트 태스크 위임/모닝 브리프.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 17개)

### 연결 서버:
- `jtalk22-slack-mcp-server`
- `node2flow-n8n-management`
- `useorgx-orgx-mcp`

### 도구 목록 (Actual Tool Names):
- `slack_list_conversations`
- `slack_conversations_history`
- `slack_search_messages`
- `slack_send_message`
- `slack_get_thread`
- `slack_list_users`
- `n8n_list_executions`
- `n8n_execute_workflow`
- `n8n_create_workflow`
- `n8n_activate_workflow`
- `n8n_get_workflow`
- `delegate_agent_task`
- `approve_agent_work`
- `get_agent_status`
- `get_morning_brief`
- `orgx_act`
- `orgx_decide`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="jtalk22-slack-mcp-server", tool="slack_send_message", arguments={"channel": "C12345", "text": "배포 완료되었습니다."})`
`execute(server="node2flow-n8n-management", tool="n8n_execute_workflow", arguments={"id": "workflow_id"})`
`execute(server="useorgx-orgx-mcp", tool="get_morning_brief", arguments={})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
