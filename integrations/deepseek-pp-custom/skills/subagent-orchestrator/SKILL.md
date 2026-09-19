---
name: subagent-orchestrator
description: >-
  서브에이전트(Subagent) 분업 및 오케스트레이션 전문 Skill. 복합 리서치, 다단계 코드 작성, 시스템 아키텍처 설계 시 전문 서브에이전트를 백그라운드로 소환(invoke_subagent)하고 병렬 지휘/통합합니다.
version: 1.0.0
servers:
  - "Subagent Manager"
tools_count: 5
---

# SUBAGENT ORCHESTRATOR Skill

서브에이전트(Subagent) 분업 및 오케스트레이션 전문 Skill. 복합 리서치, 다단계 코드 작성, 시스템 아키텍처 설계 시 전문 서브에이전트를 백그라운드로 소환(invoke_subagent)하고 병렬 지휘/통합합니다.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 5개)

### 연결 서버:
- `Subagent Manager`

### 도구 목록 (Actual Tool Names):
- `invoke_subagent`
- `check_subagent_status`
- `list_subagents`
- `kill_subagent`
- `set_subagent_config`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식 (Direct MCP Call):
`invoke_subagent(role="Code Architect", task="FastAPI 백엔드 구조 설계 및 데이터베이스 스키마 작성", background=false)`
`list_subagents()`
`check_subagent_status(subagent_id="...")`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
