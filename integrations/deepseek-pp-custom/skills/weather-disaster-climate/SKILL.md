---
name: weather-disaster-climate
description: >-
  실시간 글로벌 기상, 대기질 지수(AQI), NWS 기상특보, USGS 지진 정보, FEMA 연방 재난 선포 및 허리케인 추적. 태풍, 지진, 폭설, 홍수, 기상 예보 요청 시 활성화됩니다.
version: 1.0.0
servers:
  - "blackboxfoundry-livedatalink"
tools_count: 8
---

# WEATHER DISASTER CLIMATE Skill

실시간 글로벌 기상, 대기질 지수(AQI), NWS 기상특보, USGS 지진 정보, FEMA 연방 재난 선포 및 허리케인 추적. 태풍, 지진, 폭설, 홍수, 기상 예보 요청 시 활성화됩니다.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 8개)

### 연결 서버:
- `blackboxfoundry-livedatalink`

### 도구 목록 (Actual Tool Names):
- `weather_current`
- `weather_forecast`
- `air_quality`
- `disaster_declarations`
- `disaster_history_summary`
- `earthquake_recent`
- `nws_active_alerts`
- `hurricane_tracker`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="blackboxfoundry-livedatalink", tool="weather_forecast", arguments={"location": "Seoul"})`
`execute(server="blackboxfoundry-livedatalink", tool="earthquake_recent", arguments={"min_magnitude": 4.5})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
