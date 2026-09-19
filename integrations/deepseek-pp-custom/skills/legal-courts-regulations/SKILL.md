---
name: legal-courts-regulations
description: >-
  미국 연방 및 주 법원 판례 검색, 법관(Judge) 이력, 판결문(Opinion) 전문, eCFR 연방규정 및 Federal Register 행정규칙 분석. 소송, 판례, 법률 인용구, 행정 규제 조사 시 활성화됩니다.
version: 1.0.0
servers:
  - "blackboxfoundry-livedatalink"
tools_count: 16
---

# LEGAL COURTS REGULATIONS Skill

미국 연방 및 주 법원 판례 검색, 법관(Judge) 이력, 판결문(Opinion) 전문, eCFR 연방규정 및 Federal Register 행정규칙 분석. 소송, 판례, 법률 인용구, 행정 규제 조사 시 활성화됩니다.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 16개)

### 연결 서버:
- `blackboxfoundry-livedatalink`

### 도구 목록 (Actual Tool Names):
- `court_case_search`
- `court_docket_lookup`
- `court_opinion_search`
- `court_judge_lookup`
- `court_citation_resolver`
- `court_oral_argument_search`
- `court_recent_filings`
- `caselaw_search`
- `caselaw_citation_lookup`
- `caselaw_case_details`
- `caselaw_opinion_text`
- `reg_search`
- `reg_document`
- `reg_cfr_search`
- `reg_cfr_section`
- `reg_cfr_titles`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="blackboxfoundry-livedatalink", tool="caselaw_search", arguments={"query": "fair use copyright AI"})`
`execute(server="blackboxfoundry-livedatalink", tool="reg_cfr_section", arguments={"title": 17, "section": "240.10b-5"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
