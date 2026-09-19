# DeepSeek++ Custom (딥식++ 커스텀 통합 패키지)

> 사용자가 설정하고 사용해온 모든 기능(6대 MCP 서버, 435개 스킬, 자동 감시견 데몬, 다중 채팅 동시 셸 실행)을 하나로 통합한 독립형 패키지입니다.

---

## 🌟 주요 해결 과제 및 핵심 개선 사항

### 1. 셀호스트 타임아웃(Shell Host Timeout) 완벽 해결
- **문제 원인**: 
  - 백그라운드 프로세스 파이프 핸들 누수로 인한 스트림 미종료 현상
  - 기존 딥식++의 글로벌 직렬화(`toolCallTail`)로 인해 한 채팅방에서 셸 명령을 실행 중일 때 다른 대화방이 무기한 대기(Head-of-Line Blocking)되다가 Edge의 120초 제한에 걸려 타임아웃 발생
- **해결 조치**:
  - `framing.mjs`의 안전한 프레이밍 직렬화(`writeTail`)를 기반으로, 대화 세션 간 셸 실행 락을 해제하여 **여러 채팅창에서 동시에 셸 MCP를 호출 가능**하도록 개선.
  - Windows 프로세스 트리 전체를 `taskkill /pid <PID> /T /F`로 즉시 정리하여 좀비 프로세스 및 파이프 잠금 방지.
  - 타임아웃 기본값을 60초(최대 110초)로 캡핑하여 Edge 네이티브 타임아웃(120초) 이전에 항상 안정적인 응답 반환.

### 2. 세션 바인딩 불일치(`tool_session_mismatch`) 패치
- **문제 원인**: DeepSeek 웹 SPA 특성상 새 채팅(`chat.deepseek.com/`)에서 첫 질문 시 URL이 `/a/chat/s/<uuid>`로 변경되면서 사전 발급된 세션 ID와 불일치하여 도구 실행이 강제 취소되던 현상.
- **해결 조치**: `background.js`의 세션 검증 로직(`za`, `Ba`, `ja`, `Va`)을 패치하여 SPA 라우팅 전환 시 세션 ID를 능동적으로 동기화하도록 개선.

### 3. 세션 와치독(Watchdog Daemon) & 자동 재개 시스템 탑재
- Edge CDP(포트 9223)와 연동하여 10초 주기로 대화창 상태를 실시간 스캔.
- DeepSeek 응답이 멈추거나 '계속(Resume)' 버튼이 노출되거나 툴 에러로 중단된 경우, 자동으로 이어서 답변하도록 세션을 자동 깨움(Auto-Wakeup).

---

## 📦 패키지 구성 내용

| 구분 | 내용 |
|---|---|
| **MCP 서버 (6종)** | `shell-local` (로컬 터미널 실행)<br>`subagent-manager` (서브에이전트 오케스트레이션 / 포트 8932)<br>`playwright` (브라우저 자동화)<br>`smithery` (Smithery MCP 레지스트리)<br>`zapier` (Zapier 자동화 연동)<br>`multimodal-vision` (멀티모달 비전 분석) |
| **스킬 라이브러리** | 총 435개 등록 스킬 완벽 보존 (`skills/full-skills-catalog.json`)<br>43개 외부 스킬 소스 자동 등록 (`config/skill_sources.json`)<br>핵심 자동화 스킬(`session-watchdog`, `subagent-orchestrator`) 기본 활성화 |
| **브라우저 확장** | `extension/`: `background.js` 세션 패치 및 기본 스토리지(`defaults.json`) 자동 탑재 |
| **네이티브 호스트** | `native-host/`: 다중 동시 실행 및 프로세스 정리 패치 적용된 Native Messaging Host |
| **서브에이전트 서버** | `subagent-mcp/`: 포트 8932 기반 오케스트레이터 및 와치독 데몬 |

---

## 🚀 빠른 시작 가이드 (Quick Start)

### 1단계: 설치 및 네이티브 호스트 등록
`install.bat`을 더블 클릭하여 실행합니다.
- Node.js 환경 점검
- 네이티브 메시징 레지스트리(Edge & Chrome) 자동 등록

### 2단계: 브라우저에 확장 프로그램 로드
1. Microsoft Edge를 열고 주소창에 `edge://extensions` 입력 (Chrome은 `chrome://extensions`)
2. 좌측 하단(또는 상단)의 **[개발자 모드]** 활성화
3. 상단의 **[압축을 풀지 않은 확장 로드]** 클릭
4. 다음 폴더 선택:
   ```text
   C:\Users\HOSAM\deepseek-pp-custom\extension
   ```
*(팁: 충돌을 방지하기 위해 기존 스토어 버전 DeepSeek++는 토글을 꺼두세요.)*

### 3단계: 통합 서비스 실행
`start-all-services.bat`을 더블 클릭합니다.
- 네이티브 호스트 정상 상태 점검
- Edge CDP(9223) 연결 상태 확인
- Subagent MCP Server 및 Watchdog Daemon(포트 8932) 자동 실행

### 4단계: 딥식 사용 시작
DeepSeek([chat.deepseek.com](https://chat.deepseek.com))에 접속하면 별도의 복잡한 설정 없이 모든 6대 MCP 도구와 435개 스킬이 즉시 로드되어 자유롭게 사용하실 수 있습니다!

---

## 🛠️ 배치 파일 목록

- `install.bat`: 최초 1회 통합 설치 및 레지스트리 등록
- `start-all-services.bat`: 모든 서비스 및 데몬 백그라운드 시작
- `stop-all-services.bat`: 백그라운드 데몬 및 서브에이전트 서버 종료
- `launch-edge-cdp.bat`: Edge 브라우저를 디버깅 포트(9223) 모드로 실행
- `native-host\register-native-host.bat`: 네이티브 호스트 레지스트리 단독 등록
