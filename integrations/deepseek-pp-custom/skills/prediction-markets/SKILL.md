---
name: prediction-markets
description: >-
  Polymarket 예측 시장 데이터 전용 분석 Skill. 선거, 정책, 경제 지표, 스포츠 등 글로벌 이벤트의 실시간 베팅 확률, 오즈(Odds), 마켓 거래량(Volume), 호가창 및 최신 체결 내역(Trades) 조회.
version: 1.0.0
servers:
  - "aryankeluskar-polymarket-mcp"
tools_count: 7
---

# PREDICTION MARKETS Skill

Polymarket 예측 시장 데이터 전용 분석 Skill. 선거, 정책, 경제 지표, 스포츠 등 글로벌 이벤트의 실시간 베팅 확률, 오즈(Odds), 마켓 거래량(Volume), 호가창 및 최신 체결 내역(Trades) 조회.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 7개)

### 연결 서버:
- `aryankeluskar-polymarket-mcp`

### 도구 목록 (Actual Tool Names):
- `search_markets`
- `get_market`
- `search_events`
- `get_event`
- `list_tags`
- `get_trades`
- `analyze_market`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="aryankeluskar-polymarket-mcp", tool="search_markets", arguments={"query": "US Interest Rates", "limit": 5})`
`execute(server="aryankeluskar-polymarket-mcp", tool="analyze_market", arguments={"market_id": "..."})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
