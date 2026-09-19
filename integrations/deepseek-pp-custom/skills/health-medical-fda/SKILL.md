---
name: health-medical-fda
description: >-
  FDA 의약품/의료기기 인허가(510k), 식품/약품 안전 리콜, 이상사례(AERS), ClinicalTrials.gov 글로벌 임상시험 2종 검색(Cyanheads & Plainyogurt) 및 의학 연구 분석.
version: 1.0.0
servers:
  - "blackboxfoundry-livedatalink"
  - "cyanheads-clinicaltrialsgov-mcp-server"
  - "plainyogurt21-clintrials-mcp"
tools_count: 16
---

# HEALTH MEDICAL FDA Skill

FDA 의약품/의료기기 인허가(510k), 식품/약품 안전 리콜, 이상사례(AERS), ClinicalTrials.gov 글로벌 임상시험 2종 검색(Cyanheads & Plainyogurt) 및 의학 연구 분석.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 16개)

### 연결 서버:
- `blackboxfoundry-livedatalink`
- `cyanheads-clinicaltrialsgov-mcp-server`
- `plainyogurt21-clintrials-mcp`

### 도구 목록 (Actual Tool Names):
- `fda_drug_lookup`
- `fda_drug_recalls`
- `fda_drug_adverse_events`
- `fda_device_recalls`
- `fda_device_510k`
- `fda_food_recalls`
- `trials_search`
- `trials_details`
- `search_studies`
- `get_study`
- `search_trials_combined`
- `search_trials_by_condition`
- `search_trials_by_intervention`
- `search_trials_by_sponsor`
- `get_trial_details`
- `analyze_trial_phases`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="blackboxfoundry-livedatalink", tool="fda_drug_lookup", arguments={"drug_name": "Ozempic"})`
`execute(server="plainyogurt21-clintrials-mcp", tool="search_trials_by_condition", arguments={"condition": "Alzheimer"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
