---
name: web-search-and-fetch
description: >-
  글로벌 및 국내 종합 웹 검색 엔진 팩. Brave Search(AI Summarizer), Jina AI(리더/스크린샷/SSRN), Naver Search(블로그/뉴스/카페/쇼핑 12종), Keenable, Google Super, Exa 검색.
version: 1.0.0
servers:
  - "brave"
  - "jina"
  - "naver-search"
  - "keenable-web-search"
  - "googlesuper"
  - "vercel-grep"
  - "exa"
tools_count: 25
---

# WEB SEARCH AND FETCH Skill

글로벌 및 국내 종합 웹 검색 엔진 팩. Brave Search(AI Summarizer), Jina AI(리더/스크린샷/SSRN), Naver Search(블로그/뉴스/카페/쇼핑 12종), Keenable, Google Super, Exa 검색.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 25개)

### 연결 서버:
- `brave`
- `jina`
- `naver-search`
- `keenable-web-search`
- `googlesuper`
- `vercel-grep`
- `exa`

### 도구 목록 (Actual Tool Names):
- `brave_web_search`
- `brave_summarizer`
- `brave_local_search`
- `brave_news_search`
- `brave_video_search`
- `brave_image_search`
- `read_url`
- `search_web`
- `search_images`
- `search_arxiv`
- `search_ssrn`
- `capture_screenshot_url`
- `extract_pdf`
- `search_blogs`
- `search_news`
- `search_cafe_articles`
- `search_shopping`
- `search_local`
- `search_knowledge_in`
- `search_encyclopedia`
- `search_professional_documents`
- `spellcheck_query`
- `search_web_pages`
- `fetch_page_content`
- `searchGitHub`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="brave", tool="brave_web_search", arguments={"q": "Next.js 15 features", "summary": true})`
`execute(server="naver-search", tool="search_blogs", arguments={"query": "제주도 여행 코스", "display": 5})`
`execute(server="jina", tool="read_url", arguments={"url": "https://example.com"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
