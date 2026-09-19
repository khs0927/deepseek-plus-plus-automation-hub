---
name: dev-code-repos
description: >-
  GitHub 원격 저장소 코드/이슈/PR 관리, Hugging Face 모델/데이터셋 허브 탐색, Upstash Context7 프레임워크 최신 공식 문서 조회, Gread 리포지토리 코드 트리 열람 및 DataNexus SQL 질의.
version: 1.0.0
servers:
  - "github"
  - "huggingface"
  - "upstash-context7-mcp"
  - "nitrofire-q-gread"
  - "dev-7bd0-mcp-server"
tools_count: 21
---

# DEV CODE REPOS Skill

GitHub 원격 저장소 코드/이슈/PR 관리, Hugging Face 모델/데이터셋 허브 탐색, Upstash Context7 프레임워크 최신 공식 문서 조회, Gread 리포지토리 코드 트리 열람 및 DataNexus SQL 질의.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 21개)

### 연결 서버:
- `github`
- `huggingface`
- `upstash-context7-mcp`
- `nitrofire-q-gread`
- `dev-7bd0-mcp-server`

### 도구 목록 (Actual Tool Names):
- `actions_list`
- `actions_run_trigger`
- `create_pull_request`
- `create_repository`
- `create_or_update_file`
- `delete_file`
- `create_branch`
- `create_gist`
- `add_issue_comment`
- `check_dependency_vulnerabilities`
- `hub_repo_search`
- `hub_repo_details`
- `hf_fs`
- `hf_whoami`
- `resolve-library-id`
- `query-docs`
- `search_repos`
- `list_tree`
- `read_code`
- `search_code`
- `view_repo`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="github", tool="create_pull_request", arguments={"owner": "...", "repo": "...", "title": "Fix", "head": "dev", "base": "main"})`
`execute(server="huggingface", tool="hub_repo_search", arguments={"query": "llama-3-8b", "filter": "model"})`
`execute(server="upstash-context7-mcp", tool="query-docs", arguments={"library_id": "fastapi", "query": "background tasks"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
