# DeepSeek++ 설치 가이드

이 문서는 새 컴퓨터에서 저장소를 clone한 뒤 DeepSeek++를 설치하고 점검하는 단일 기준 문서다. 로그인, API key, MCP credential은 설치 스크립트가 읽거나 생성하지 않는다.

## 지원 범위

- 데스크톱 Chrome, Edge, Firefox
- Windows, macOS, Linux
- Node.js 18.17 이상과 npm
- Windows에서 Shell Native Host를 사용할 때는 사용자 권한으로 설치되며, 프로세스 종료 보장을 위해 Job Object helper를 사용한다.

Android, 모바일 WebView, 모바일 패키지는 지원 범위가 아니다.

## 가장 빠른 설치

### Windows

저장소를 clone한 뒤 `install-one-click.cmd`를 더블클릭한다. PowerShell에서 실행하려면 다음을 사용한다.

```powershell
git clone https://github.com/khs0927/deepseek-plus-plus-automation-hub.git
cd deepseek-plus-plus-automation-hub
.\install-one-click.cmd
```

PowerShell 실행 정책을 바꾸지 않고 현재 프로세스에서 실행한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-one-click.ps1
```

의존성을 다시 lockfile 기준으로 설치하려면 `-ForceDependencies`를 추가한다. 특정 브라우저만 빌드하려면 `-Browser edge`처럼 지정한다.

```powershell
.\install-one-click.ps1 -Browser edge -ForceDependencies
```

### macOS / Linux

```bash
git clone https://github.com/khs0927/deepseek-plus-plus-automation-hub.git
cd deepseek-plus-plus-automation-hub
bash ./install-one-click.sh
```

이미 의존성이 있어도 다시 설치하려면 다음과 같이 실행한다.

```bash
DPP_FORCE_NPM_CI=1 bash ./install-one-click.sh
```

직접 실행 권한을 부여해도 된다.

```bash
chmod +x ./install-one-click.sh
./install-one-click.sh --browser firefox
```

래퍼가 하는 일은 Node/npm 확인, `npm ci`, `.env.example`에서 `.env` 생성, 브라우저별 production build, 가능한 Native Host 설치다. 이미 존재하는 `.env`는 덮어쓰지 않는다.

## 브라우저 최초 연결

브라우저 보안 정책상 clone한 로컬 확장을 명령줄에서 자동으로 활성화할 수 없다. 따라서 아래의 확장 로드는 최초 1회 사용자가 해야 한다. 이것은 설치 실패가 아니라 브라우저의 개발자 확장 보안 경계다.

### Chrome

1. `chrome://extensions`를 연다.
2. Developer mode를 켠다.
3. `Load unpacked`를 눌러 `dist/chrome-mv3`를 선택한다.
4. 표시된 확장 ID를 사용해 Native Host를 등록한다.

```powershell
npm run setup -- --browser chrome --chrome-extension-id <확장ID>
```

### Edge

1. `edge://extensions`를 연다.
2. Developer mode를 켠다.
3. `Load unpacked`를 눌러 `dist/edge-mv3`를 선택한다.
4. 표시된 확장 ID를 사용해 Native Host를 등록한다.

```powershell
npm run setup -- --browser edge --edge-extension-id <확장ID>
```

### Firefox

Firefox는 manifest에 고정된 `deepseek-pp@zhu1090093659.github` ID가 있다.

1. `about:debugging#/runtime/this-firefox`를 연다.
2. `Load Temporary Add-on`을 선택한다.
3. `dist/firefox-mv3/manifest.json`을 선택한다.

Firefox Native Host 등록은 다음으로 처리된다.

```bash
npm run setup -- --browser firefox
```

임시 add-on은 Firefox 재시작 시 다시 로드해야 한다. 배포용 영구 설치는 서명된 Firefox 패키지를 사용한다.

## 설치 확인

```bash
npm run setup:status -- --browser all
npm run compile -- --pretty false
npm run smoke:shell
npm run smoke:native-concurrent
```

Windows에서 Job Object 종료를 확인한다.

```powershell
npm run smoke:windows-job
```

Edge에서 로그인된 프로필로 확장 worker와 두 개의 독립 DeepSeek 대화 탭을 확인한다.

```bash
npm run e2e:browser -- --browser edge \
  --chat-url https://chat.deepseek.com/ \
  --chat-url https://chat.deepseek.com/
```

이 E2E는 로그인 정보를 입력하거나 메시지를 전송하지 않는다. 실제 MCP 호출과 프로젝트 기억 공유는 사용자가 로그인한 상태에서 수동 인수해야 한다.

## 업데이트와 복구

```bash
git pull --ff-only
```

```powershell
.\install-one-click.cmd
```

```bash
bash ./install-one-click.sh
npm run setup:status -- --browser all
```

Native Host가 이전 버전으로 보이면 브라우저를 완전히 종료한 뒤 setup을 다시 실행한다. 설치 상태가 여전히 불완전하면 다음 출력과 함께 진단한다.

```bash
npm run shell:status -- --browser chrome
npm run shell:status -- --browser edge
npm run shell:status -- --browser firefox
```

Node.js 26에서 `spawnSync npm.cmd EINVAL`이 보이면 저장소를 최신 커밋으로 갱신한 뒤 원클릭 설치를 다시 실행한다. 최신 setup은 Windows `cmd.exe`를 명시적으로 사용해 이 문제를 피한다.

삭제는 브라우저별로 수행한다.

```bash
npm run shell:uninstall -- --browser chrome
npm run shell:uninstall -- --browser edge
npm run shell:uninstall -- --browser firefox
```

확장 자체는 각 브라우저의 확장 관리 화면에서 제거한다. 사용자 `.env`, 브라우저 저장소, DeepSeek 로그인 세션은 이 명령으로 삭제하지 않는다.

## 설치에서 의도적으로 자동화하지 않는 것

- DeepSeek 로그인과 세션 쿠키
- 공식 API key와 MCP credential
- 로컬 MCP 구성 파일(`integrations/mcp/mcp_servers.master.json`)
- Chrome/Edge 개발자 모드 확장 로드
- 외부 MCP 서버 설치·신뢰 승인
- 임의 Shell 명령에 대한 OS sandbox

이 경계는 비밀값을 저장소에 넣지 않고 브라우저의 확장 보안 모델을 지키기 위한 것이다. 프로젝트 실행 정책 UI에서 승인 루트, MCP 서버/도구, Shell capability를 저장해야 프로젝트 대화의 도구 호출이 허용된다. 정책이 없거나 삭제된 프로젝트는 fail-closed로 차단된다.

## 문서 지도

- [잔여 TODO와 인수 조건](TODO.md)
- [통합 업그레이드 구현 현황](docs/private-project/UPGRADE_IMPLEMENTATION_STATUS_KO.md)
- [운영 지침](docs/private-project/OPERATIONS_GUIDE_KO.md)
- [프로젝트 기억 설계](docs/private-project/PROJECT_MEMORY_KO.md)
- [실브라우저 다중 대화 검증](docs/verification/browser-multi-chat-e2e.md)
- [설치 매트릭스](docs/verification/install-matrix.md)
