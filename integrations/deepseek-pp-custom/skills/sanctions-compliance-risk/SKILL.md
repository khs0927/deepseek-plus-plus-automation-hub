---
name: sanctions-compliance-risk
description: >-
  OFAC/국제 제재 대상자(Sanctions) 스크리닝, NVD CVE/CWE 보안 취약점 조회, EPA 환경 규제 위반 시설, FEC 연방 선거자금 후원금 조사. 기업 컴플라이언스, 제재 검사, 보안 취약점 점검 시 활성화됩니다.
version: 1.0.0
servers:
  - "blackboxfoundry-livedatalink"
tools_count: 24
---

# SANCTIONS COMPLIANCE RISK Skill

OFAC/국제 제재 대상자(Sanctions) 스크리닝, NVD CVE/CWE 보안 취약점 조회, EPA 환경 규제 위반 시설, FEC 연방 선거자금 후원금 조사. 기업 컴플라이언스, 제재 검사, 보안 취약점 점검 시 활성화됩니다.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 24개)

### 연결 서버:
- `blackboxfoundry-livedatalink`

### 도구 목록 (Actual Tool Names):
- `sanctions_screen_entity`
- `sanctions_screen_batch`
- `sanctions_get_changes`
- `sanctions_screen_address`
- `sanctions_get_entity`
- `sanctions_search_alias`
- `sanctions_status_summary`
- `cve_lookup`
- `cve_search_by_vendor`
- `cve_search_by_keyword`
- `cwe_lookup`
- `epss_score`
- `kev_status_check`
- `cve_recent`
- `epa_facility_search`
- `epa_facility_details`
- `epa_facility_compliance`
- `epa_enforcement_search`
- `epa_water_or_air_violations`
- `fec_candidate_search`
- `fec_candidate_details`
- `fec_committee_search`
- `fec_candidate_financials`
- `fec_independent_expenditures`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="blackboxfoundry-livedatalink", tool="sanctions_screen_entity", arguments={"name": "..."})`
`execute(server="blackboxfoundry-livedatalink", tool="cve_lookup", arguments={"cve_id": "CVE-2024-3094"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
