# 실브라우저 다중 대화 E2E

이 검사는 로그인·API key·MCP credential을 자동으로 다루지 않는다. 사용자 프로필과 로그인 상태를 직접 준비한 뒤 Chrome 또는 Edge에서 실행한다.

## 1. 빌드와 기본 smoke

```bash
npm ci
npm run build:chrome
npm run e2e:browser -- --browser chrome --chat-url https://chat.deepseek.com/
```

Edge:

```bash
npm run build:edge
npm run e2e:browser -- --browser edge --chat-url https://chat.deepseek.com/
```

여러 대화를 동시에 열려면 URL을 반복한다.

```bash
npm run e2e:browser -- \
  --browser chrome \
  --chat-url https://chat.deepseek.com/a \
  --chat-url https://chat.deepseek.com/b \
  --keep-open
```

## 2. 인수 시나리오

1. A 탭과 B 탭을 서로 다른 DeepSeek 대화로 연다.
2. A를 하나의 프로젝트에 등록하고 결정·검증 결과를 만든다.
3. B가 같은 프로젝트에 등록되어 있는지 확인한다.
4. B에서 Project knowledge 검색 결과의 status/sourceRefs/evidenceRefs를 확인한다.
5. B에서 독립 MCP read 4개를 실행하고 결과가 호출 순서로 정렬되는지 확인한다.
6. 같은 파일에 대한 write 2개를 실행하고 직렬화되는지 확인한다.
7. A의 장기 Shell 작업을 취소하고 실제 Host 프로세스가 종료되는지 확인한다.
8. 탭을 전환한 뒤에도 결과가 원래 conversation/run으로만 돌아오는지 확인한다.
9. service worker를 재시작하고 B가 A의 기억을 다시 검색하는지 확인한다.

Firefox는 Playwright가 임시 MV3 add-on을 자동 로드하는 방식이 Chromium과 달라 이 harness에서 추측하지 않는다. Firefox는 `dist/firefox-mv3/manifest.json`을 `about:debugging`에 로드한 뒤 같은 시나리오를 수동 수행한다.
