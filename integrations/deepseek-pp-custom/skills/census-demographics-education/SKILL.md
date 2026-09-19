---
name: census-demographics-education
description: >-
  미국 통계청(US Census Bureau) 인구통계, 가계소득, 주거비용, 고용현황, 비즈니스 지표 및 미 교육부 College Scorecard 대학별 등록금/입학률/졸업후 소득 성과 분석.
version: 1.0.0
servers:
  - "blackboxfoundry-livedatalink"
tools_count: 13
---

# CENSUS DEMOGRAPHICS EDUCATION Skill

미국 통계청(US Census Bureau) 인구통계, 가계소득, 주거비용, 고용현황, 비즈니스 지표 및 미 교육부 College Scorecard 대학별 등록금/입학률/졸업후 소득 성과 분석.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 13개)

### 연결 서버:
- `blackboxfoundry-livedatalink`

### 도구 목록 (Actual Tool Names):
- `census_population`
- `census_demographics`
- `census_income_housing`
- `census_commute_employment`
- `census_business`
- `census_geography_lookup`
- `college_search`
- `college_metrics`
- `college_demographics`
- `college_accreditation`
- `college_compare`
- `college_outcomes_by_program`
- `college_trends`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="blackboxfoundry-livedatalink", tool="census_population", arguments={"state": "CA", "county": "Santa Clara"})`
`execute(server="blackboxfoundry-livedatalink", tool="college_compare", arguments={"unitids": ["166027", "243744"]})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
