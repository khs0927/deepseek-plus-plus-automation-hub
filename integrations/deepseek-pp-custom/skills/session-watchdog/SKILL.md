---
name: session-watchdog
description: >-
  DeepSeek++ 대화 세션의 멈춤, 도구 오류, 스트림 중단을 실시간 감지하고 복구하는 전문 Skill. 세션 트레이스 로그 분석, 재시도/계속 버튼 자동 클릭 또는 지시문 주입으로 완전 자동 완주를 보장합니다.
version: 1.0.0
servers:
  - "Subagent Manager"
tools_count: 4
---

# SESSION WATCHDOG Skill

DeepSeek++ 대화 세션의 멈춤, 도구 오류, 스트림 중단을 실시간 감지하고 복구하는 전문 Skill. 세션 트레이스 로그 분석, 재시도/계속 버튼 자동 클릭 또는 지시문 주입으로 완전 자동 완주를 보장합니다.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 4개)

### 연결 서버:
- `Subagent Manager`

### 도구 목록 (Actual Tool Names):
- `list_deepseek_sessions`
- `get_session_logs`
- `wake_up_session`
- `configure_watchdog`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식 (Direct MCP Call):
`list_deepseek_sessions()`
`get_session_logs(session_id="dfd9198e-b7cb-4237-85bf-624fb13c4076")`
`wake_up_session(session_id="current", custom_message="중단된 부분부터 이어서 계속 진행해주세요.")`
`configure_watchdog(auto_wake=true, interval_seconds=10)`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
