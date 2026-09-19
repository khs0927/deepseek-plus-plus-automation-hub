---
name: patents-business-records
description: >-
  USPTO 특허 검색, 발명자/양수인 추적, IRS 비영리 법인 Form 990 재무제표, USAspending 연방 정부 조달/보조금 지출, FMCSA 상용차 운송업체 안전점검 및 차량 VIN 디코딩/리콜 조회.
version: 1.0.0
servers:
  - "blackboxfoundry-livedatalink"
tools_count: 20
---

# PATENTS BUSINESS RECORDS Skill

USPTO 특허 검색, 발명자/양수인 추적, IRS 비영리 법인 Form 990 재무제표, USAspending 연방 정부 조달/보조금 지출, FMCSA 상용차 운송업체 안전점검 및 차량 VIN 디코딩/리콜 조회.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 20개)

### 연결 서버:
- `blackboxfoundry-livedatalink`

### 도구 목록 (Actual Tool Names):
- `patent_search`
- `patent_details`
- `patent_inventor_search`
- `patent_assignee_search`
- `patent_recent`
- `nonprofit_lookup_ein`
- `nonprofit_search_name`
- `nonprofit_search_location`
- `nonprofit_details`
- `nonprofit_status`
- `spending_search_awards`
- `spending_award_details`
- `spending_recipient_summary`
- `fmcsa_carrier_lookup`
- `fmcsa_carrier_search`
- `fmcsa_safety_scores`
- `fmcsa_carrier_authority`
- `vin_decode`
- `vehicle_recalls`
- `package_track`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="blackboxfoundry-livedatalink", tool="patent_search", arguments={"query": "solid state battery"})`
`execute(server="blackboxfoundry-livedatalink", tool="vin_decode", arguments={"vin": "1HGCR2F83HA..."})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
