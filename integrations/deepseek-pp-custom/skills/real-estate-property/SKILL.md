---
name: real-estate-property
description: >-
  미국 전역 부동산 필지(Parcel), 재산세 감정가, 시세 변동, 임대료 및 FEMA 홍수위험 구역 분석. 주택 가격, 필지 경계, 소유자 이력, Zillow/Redfin 트렌드, Flood Zone 조사 시 활성화됩니다.
version: 1.0.0
servers:
  - "blackboxfoundry-livedatalink"
tools_count: 16
---

# REAL ESTATE PROPERTY Skill

미국 전역 부동산 필지(Parcel), 재산세 감정가, 시세 변동, 임대료 및 FEMA 홍수위험 구역 분석. 주택 가격, 필지 경계, 소유자 이력, Zillow/Redfin 트렌드, Flood Zone 조사 시 활성화됩니다.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 16개)

### 연결 서버:
- `blackboxfoundry-livedatalink`

### 도구 목록 (Actual Tool Names):
- `property_lookup`
- `property_search_owner`
- `property_search_area`
- `property_value_history`
- `realestate_search`
- `realestate_home_values`
- `realestate_rents`
- `realestate_market_screen`
- `realestate_trend`
- `realestate_status`
- `parcel_search`
- `parcel_details`
- `parcel_sales_history`
- `parcel_coverage`
- `flood_zone_lookup`
- `nfip_flood_claims`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="blackboxfoundry-livedatalink", tool="property_lookup", arguments={"address": "...", "city": "...", "state": "CA"})`
`execute(server="blackboxfoundry-livedatalink", tool="flood_zone_lookup", arguments={"latitude": 37.77, "longitude": -122.41})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
