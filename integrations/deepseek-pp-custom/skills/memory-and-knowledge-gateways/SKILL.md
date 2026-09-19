---
name: memory-and-knowledge-gateways
description: >-
  DeepSeek++ 지속 기억(Memory) 관리 및 지식 게이트웨이. Mem0 AI 메모리 저장/검색, Lotus Wisdom 불교/철학 경전 지혜, Gliana AI 지식 엔진, TheAgentTimes 글로벌 AI 에이전트 뉴스/리포트.
version: 1.0.0
servers:
  - "mem0ai-mem0-memory-mcp"
  - "linxule-lotus-wisdom-mcp"
  - "glianalabs-gliana-ai"
  - "theagenttimes-news"
  - "re-port-flow-reportflow-mcp"
tools_count: 19
---

# MEMORY AND KNOWLEDGE GATEWAYS Skill

DeepSeek++ 지속 기억(Memory) 관리 및 지식 게이트웨이. Mem0 AI 메모리 저장/검색, Lotus Wisdom 불교/철학 경전 지혜, Gliana AI 지식 엔진, TheAgentTimes 글로벌 AI 에이전트 뉴스/리포트.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 19개)

### 연결 서버:
- `mem0ai-mem0-memory-mcp`
- `linxule-lotus-wisdom-mcp`
- `glianalabs-gliana-ai`
- `theagenttimes-news`
- `re-port-flow-reportflow-mcp`

### 도구 목록 (Actual Tool Names):
- `add_memory`
- `search_memories`
- `get_memories`
- `get_memory`
- `update_memory`
- `delete_memory`
- `lotuswisdom`
- `lotuswisdom_summary`
- `run_free_tool`
- `list_models`
- `how_to_generate`
- `search_articles`
- `get_article`
- `get_latest_articles`
- `ask_expert`
- `tat_search`
- `tat_recommend`
- `search_gallery_templates`
- `get_gallery_template`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="mem0ai-mem0-memory-mcp", tool="add_memory", arguments={"messages": [{"role": "user", "content": "사용자는 React 19와 TypeScript를 선호함"}]})`
`execute(server="theagenttimes-news", tool="get_latest_articles", arguments={"limit": 5})`
`execute(server="linxule-lotus-wisdom-mcp", tool="lotuswisdom", arguments={"query": "마음의 평정"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
