---
name: academic-research-papers
description: >-
  arXiv, Semantic Scholar, Crossref, bioRxiv, medRxiv, Google Scholar 논문 메타데이터, 초록, 인용 네트워크 분석 및 오픈액세스 PDF/전문 다운로드, Gutenberg 고전 도서 전문 검색.
version: 1.0.0
servers:
  - "adamamer20-paper-search-mcp-openai"
  - "titansneaker-paper-search-mcp-openai-v2"
  - "arxiv"
  - "hamid-vakilzadeh-mcpsemanticscholar"
  - "blackboxfoundry-livedatalink"
tools_count: 26
---

# ACADEMIC RESEARCH PAPERS Skill

arXiv, Semantic Scholar, Crossref, bioRxiv, medRxiv, Google Scholar 논문 메타데이터, 초록, 인용 네트워크 분석 및 오픈액세스 PDF/전문 다운로드, Gutenberg 고전 도서 전문 검색.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 26개)

### 연결 서버:
- `adamamer20-paper-search-mcp-openai`
- `titansneaker-paper-search-mcp-openai-v2`
- `arxiv`
- `hamid-vakilzadeh-mcpsemanticscholar`
- `blackboxfoundry-livedatalink`

### 도구 목록 (Actual Tool Names):
- `search_arxiv`
- `search_pubmed`
- `search_biorxiv`
- `search_medrxiv`
- `search_google_scholar`
- `search_semantic`
- `search_crossref`
- `download_arxiv`
- `download_pubmed`
- `read_arxiv_paper`
- `read_pubmed_paper`
- `get_crossref_paper_by_doi`
- `search_papers`
- `get_paper`
- `paper-search-advanced`
- `papers-search-basic`
- `get-paper-abstract`
- `download-full-paper-arxiv`
- `papers-citations`
- `papers-references`
- `analysis-citation-network`
- `paper_search`
- `paper_details`
- `book_search`
- `book_details`
- `book_fulltext_search`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="adamamer20-paper-search-mcp-openai", tool="search_arxiv", arguments={"query": "DeepSeek R1 reasoning"})`
`execute(server="hamid-vakilzadeh-mcpsemanticscholar", tool="analysis-citation-network", arguments={"paper_id": "..."})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
