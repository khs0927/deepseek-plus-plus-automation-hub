---
name: subagent-orchestrator
description: >-
  서브에이전트(Subagent) 분업 및 오케스트레이션 Skill. 복합 분석, 대규모 리서치,
  다단계 코드 작성, 다중 도구 연계 작업 또는 "서브에이전트", "하위 에이전트",
  "병렬로 조사해줘", "나눠서 진행해줘" 요청 시 활성화합니다.
version: 1.1.0
servers:
  - "Subagent Manager"
tools_count: 6
---

# Subagent Orchestration

주 에이전트는 목표와 제약을 보존한 채 독립적인 하위 과업으로 분해하고, 실제 실행은 `Subagent Manager` MCP에 위임합니다.

## 실행 도구

- `invoke_subagent`: 단일 서브에이전트 실행
- `invoke_subagent_batch`: 여러 독립 작업을 한 번에 등록하고 bounded parallel fan-out 실행
- `check_subagent_status`: QUEUED / RUNNING / COMPLETED / FAILED / CANCELLED 상태 확인
- `list_subagents`: 전체 서브에이전트 및 큐 상태 확인
- `kill_subagent`: queued task 취소 또는 running task 취소 표시
- `set_subagent_config`: 엔진 및 `maxConcurrentSubagents` 설정

## 권장 워크플로

1. Strong LLM Planner가 요청을 2~8개의 독립 하위 과업으로 분해합니다.
2. 작업 간 결과 의존성이 없으면 `invoke_subagent_batch`를 우선 사용합니다.
3. 실제 동시 실행 수는 Subagent Manager의 `maxConcurrentSubagents`가 결정합니다. 기본값은 5이며 1~16 범위입니다.
4. 동시 실행 상한을 넘은 작업은 실패하지 않고 `QUEUED` 상태로 대기합니다.
5. 결과가 합류하면 주 에이전트가 누락, 충돌, 인터페이스 불일치를 검토하고 필요한 작업만 재호출합니다.

### 예시

```json
{
  "tasks": [
    {
      "role": "Code Architect",
      "task": "현재 구조의 병렬 실행 경계와 인터페이스를 검토하고 변경안을 제시하세요.",
      "engine": "auto"
    },
    {
      "role": "Security Auditor",
      "task": "권한 우회, 세션 혼선, secret leakage 가능성을 검토하세요.",
      "engine": "auto"
    },
    {
      "role": "QA Engineer",
      "task": "필요한 회귀 테스트와 동시성 테스트를 설계하세요.",
      "engine": "auto"
    }
  ],
  "background": false
}
```

## JEV Decision Plane 연동 원칙

JEV는 서브에이전트를 직접 실행하거나 권한을 부여하지 않습니다.

```text
Strong LLM Planner
  -> subtask 후보
  -> JEV relevance / route
  -> Subagent Manager MCP
  -> bounded parallel scheduler
  -> worker engines
  -> result join
  -> Result Judge / Outcome Verifier
```

JEV 판단은 semantic recommendation입니다. 실제 MCP enablement, allowlist, capability lease, session binding, 승인 및 실행 정책은 기존 Runtime이 계속 소유합니다.

## 엔진 선택

`engine: "auto"`를 기본으로 사용합니다.

현재 auto는 로컬 설정에 사용 가능한 무료 키가 있으면 Gemini 또는 Groq를 선택하고, 없으면 로그인된 DeepSeek Web/CDP 세션을 사용합니다. 엔진을 강제할 필요가 있을 때만 명시적으로 지정합니다.

## 안전 규칙

- 서로 의존하는 작업은 무조건 같은 batch로 병렬 실행하지 않습니다.
- write 작업을 여러 서브에이전트가 같은 파일/브랜치/리소스에 동시에 적용하게 하지 않습니다.
- running task의 cancel은 현재 cooperative cancellation입니다. 상태는 즉시 CANCELLED가 되지만 underlying worker는 cleanup을 위해 잠시 실행될 수 있습니다.
- API key, cookie, password, session secret을 task 문자열에 포함하지 않습니다.
