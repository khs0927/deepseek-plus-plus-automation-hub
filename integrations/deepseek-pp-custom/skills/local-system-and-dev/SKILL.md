---
name: local-system-and-dev
description: >-
  로컬 PC 운영체제 직접 제어: PowerShell/Cmd/Bash 명령 실행, Python 샌드박스 연산, 파일 시스템 검사(Stat/Read) 및 로컬 스킬 폴더 선택/미리보기.
version: 1.0.0
servers:
  - "Shell Local"
tools_count: 8
---

# LOCAL SYSTEM AND DEV Skill

로컬 PC 운영체제 직접 제어: PowerShell/Cmd/Bash 명령 실행, Python 샌드박스 연산, 파일 시스템 검사(Stat/Read) 및 로컬 스킬 폴더 선택/미리보기.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 8개)

### 연결 서버:
- `Shell Local`

### 도구 목록 (Actual Tool Names):
- `shell_exec`
- `shell_status`
- `python_exec`
- `python_status`
- `local_file_read`
- `local_file_stat`
- `local_folder_pick`
- `local_skill_preview`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식 (Direct MCP Call):
`shell_exec(command="Get-Process | Sort-Object CPU -Descending | Select-Object -First 5")`
`python_exec(code="import math; print([math.sin(x) for x in range(5)])")`
`local_file_read(path="C:/Users/HOSAM/data.txt")`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
