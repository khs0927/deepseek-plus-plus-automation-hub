# 브라우저 제어 및 CDP 런타임 업그레이드 계획서 (Browser & CDP Runtime Architecture)

## 1. 개요 및 배경

본 문서는 `khs0927/deepseek-plus-plus-automation-hub`의 핵심 런타임 서브시스템인 **브라우저 제어(Browser Control) 및 CDP 런타임**의 고도화 계획 및 실무 구현 명세를 정의합니다.
기존 시스템의 세움터(EAIS) WebSquare5 조작 파편화, CDP 연결 불안정성, 세션 만료(`ds_SessionRep:null`) 문제를 해결하고, Aside 및 Ego-lite와의 런타임 분원화를 통해 전체 시스템의 안정성과 생산성을 극대화합니다.

---

## 2. 브라우저 제어 도구별 최적 역할 분담 매트릭스

| 런타임 / 도구 | 기술적 특성 | 한계점 | 전담 도메인 및 역할 |
| :--- | :--- | :--- | :--- |
| **Playwright (Edge CDP 9222)** | • OS 보안 모듈(AnySign4PC, VeraPort) 및 공인인증서 완벽 공존<br>• C:/edge_dev 프로필 영구 보존<br>• 로컬 파일시스템 직접 제어(도면 대용량 업로드)<br>• WebSquare5 window.$p 심층 조작 | • 로컬 Node.js 백엔드 구동 필요<br>• 브라우저 렌더링 리소스 소모 | **[보안/인허가 전담]**<br>세움터(EAIS), BIRA 등 공인인증서·특수 플러그인·정밀 폼 조작 필수 사이트 |
| **DeepSeek++ 자체 제어 (Extension In-Page)** | • DeepSeek 웹 화면과 무지연 상호작용<br>• 추가 데몬 없이 브라우저 탭 컨텍스트 활용 | • MV3 샌드박스 제약(파일 직접 첨부, 크로스 오리진 제약)<br>• 탭 이동 시 세션 단절 위험 | **[실시간 채팅/인라인 전담]**<br>DeepSeek 채팅창 DOM 제어, 사이드패널 연동, 사용자 입력 보조 |
| **Aside (어사이드)** | • 무료/경량 웹 서핑 및 시각적 페이지 탐색에 최적화<br>• 일상적인 웹 리서치 및 정보 추출 자동화 | • 복잡한 엔터프라이즈 폼 조작 및 보안 모듈 호환성 부족 | **[일반 리서치 전담]**<br>법령 정보 조회, 지자체 고시 확인, 자재/단가 검색, 일반 웹 검색 |
| **Ego-lite (에고라이트)** | • 가벼운 브라우저 런타임 환경 제공<br>• 확장 프로그램 로컬 빌드 및 회귀 테스트 용이 | • 메인 업무 브라우저로 쓰기에는 부가 기능 제한 | **[테스트/검증 전담]**<br>DeepSeek++ 확장 빌드(dist/chrome-mv3, dist/edge-mv3) 격리 테스트 및 헤드리스 검증 |

---

## 3. WebSquare5 전용 SDK (WebSquareDriver) 명세

- **위치**: `integrations/seumter/src/utils/websquare_driver.js`
- **주요 기능**:
  1. `installDialogTrap()`: 브라우저 기본 Alert/Confirm 창 자동 감지 및 수락.
  2. `verifySessionActive()`: 세움터 로그인 세션(`ds_SessionRep`) 상태를 선제 점검하여 `[NULL]처리중` 오류 방지.
  3. `setValue(compId, value)`: WebSquare5 컴포넌트(`$p.getComponentById`) 안전 값 주입 (DOM 폴백 내장).
  4. `setCellData(dataListId, row, col, val)`: 그리드 바인딩 DataList의 셀 값 갱신 및 상태 `U`(Updated) 마킹.
  5. `selectPopupCheckboxAndConfirm(container, btnText)`: 세움터 팝업 내 사각형 체크박스 전수 선택 후 확인 클릭 (항목 누락 버그 원천 방지).
  6. `handleConfirmModal(expectedAction)`: 도면 덮어쓰기/삭제 시 화면 중앙 확인 모달 [예] 버튼 자동 처리.

---

## 4. CDP 세션 자가 치유(Self-Healing) 엔진 명세

- **위치**: `integrations/seumter/src/utils/cdp_lifecycle_manager.js`
- **주요 기능**:
  1. `isCdpReady()`: `http://127.0.0.1:9222/json/version` 엔드포인트 헬스체크.
  2. `ensureCdpReady()`: 포트 미응답 시 `launch_edge.js`를 백그라운드 분리 프로세스로 자동 기동 및 최대 10초 폴링 대기.
  3. `getSeumterPage()`: 활성 세움터 탭 자동 탐색, 부재 시 자동 생성 및 이동, 윈도우 전면 활성화(`bringToFront`).

---

## 5. Aside & Ego-lite 연동 인터페이스 프로토콜

### A. Aside 리서치 위임 규격 (JSON Schema)
```typescript
interface AsideResearchTask {
  taskId: string;
  category: 'LEGAL_REGULATION' | 'ZONING_CHECK' | 'PRICE_ESTIMATE';
  targetAddress: string;
  queryPrompt: string;
  expectedFields: string[];
}

interface AsideResearchResult {
  taskId: string;
  timestamp: string;
  sourceUrls: string[];
  findings: {
    zoningType?: string;
    farRelaxationRate?: number;
    buildingCoverageMax?: number;
    mandatoryCheckItems?: string[];
  };
}
```

### B. Ego-lite CI/CD 검증 플로우
```powershell
# Ego-lite 환경에서 격리 빌드 검증
npm run build:edge
# Ego-lite 실행 후 dist/edge-mv3 로드 및 smoke test 수행
```

---

## 6. 타 에이전트 연계 프롬프트 요약

1. **Agent B (MCP Capability Plane)**: `khs0927 Smithery MCP Toolbox`(100개 도구) 직결 및 Seumter MCP 도구 확장.
2. **Agent C (DeepSeek++ Extension & Automation)**: 인라인 에이전트 UI/UX(Claude Code 스타일 접힘), HITL 서명 일시정지(Pause/Resume) 구현.
3. **Agent D (AEC Domain Pipeline)**: CAD DXF/DWG 면적표 파싱 및 156개 한국건축규정 2단계 로컬 룰 엔진 구축.
