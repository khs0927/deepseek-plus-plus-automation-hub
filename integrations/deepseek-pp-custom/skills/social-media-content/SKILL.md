---
name: social-media-content
description: >-
  레딧(Reddit) 커뮤니티 여론/토론 분석, 유튜브(YouTube) 영상 검색/자막 추출/채널 통계, Discourse 포럼 주제/채팅 모니터링 및 Grokipedia 심층 지식 조회.
version: 1.0.0
servers:
  - "reddit"
  - "youtube"
  - "king-of-the-grackles-discourse-forum-mcp"
  - "skymoore-grokipedia-mcp"
tools_count: 22
---

# SOCIAL MEDIA CONTENT Skill

레딧(Reddit) 커뮤니티 여론/토론 분석, 유튜브(YouTube) 영상 검색/자막 추출/채널 통계, Discourse 포럼 주제/채팅 모니터링 및 Grokipedia 심층 지식 조회.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 22개)

### 연결 서버:
- `reddit`
- `youtube`
- `king-of-the-grackles-discourse-forum-mcp`
- `skymoore-grokipedia-mcp`

### 도구 목록 (Actual Tool Names):
- `search_across_subreddits`
- `retrieve_reddit_post`
- `retrieve_post_comments`
- `create_reddit_post`
- `post_reddit_comment`
- `search_you_tube`
- `video_details`
- `load_captions`
- `list_channel_videos`
- `get_channel_statistics`
- `upload_video`
- `discourse_search`
- `discourse_read_topic`
- `discourse_read_post`
- `discourse_list_categories`
- `discourse_list_tags`
- `discourse_get_user`
- `search`
- `get_page`
- `get_page_content`
- `get_page_sections`
- `get_related_pages`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="reddit", tool="search_across_subreddits", arguments={"query": "LLM fine-tuning", "subreddit": "MachineLearning"})`
`execute(server="youtube", tool="load_captions", arguments={"video_id": "..."})`
`execute(server="skymoore-grokipedia-mcp", tool="search", arguments={"query": "Quantum Computing"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
