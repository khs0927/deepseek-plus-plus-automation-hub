# DeepSeek++ 설치·검증 매트릭스

이 문서는 저장소 clone 이후 어떤 컴퓨터에서 무엇을 자동으로 확인하고, 어떤 단계가 브라우저 정책 때문에 수동인지 기록한다.

## 공통 전제

| 항목 | 기준 |
|---|---|
| Node.js | 18.17 이상 |
| 의존성 | `package-lock.json` 기준 `npm ci` |
| 확장 빌드 | Chrome / Edge / Firefox MV3 |
| 비밀값 | 저장소·설치 스크립트에서 생성하지 않음 |
| 지원 제품 | 데스크톱 Chrome, Edge, Firefox |

## 플랫폼별 자동 단계

| 플랫폼 | 원클릭 파일 | 자동 처리 | 남는 수동 단계 |
|---|---|---|---|
| Windows | `install-one-click.cmd` 또는 `install-one-click.ps1` | npm, build, 사용자 Native Host, Windows registry HKCU | Chrome/Edge unpacked load와 ID 입력, 로그인/credential |
| macOS | `bash install-one-click.sh` | npm, build, 사용자 Native Host | 브라우저 확장 로드, 로그인/credential |
| Linux | `bash install-one-click.sh` | npm, build, 사용자 Native Host | 브라우저 확장 로드, 로그인/credential |

`all`은 Chrome·Edge·Firefox build를 모두 만든다. 특정 브라우저만 설치할 때는 Windows PowerShell의 `-Browser` 또는 setup CLI의 `--browser`를 사용한다.

## 명령표

```text
clone                 git clone ...
원클릭 설치             install-one-click.cmd / install-one-click.sh
상태 확인               npm run setup:status -- --browser all
컴파일                  npm run compile -- --pretty false
Shell smoke             npm run smoke:shell
Native 동시성 smoke     npm run smoke:native-concurrent
Windows 종료 smoke      npm run smoke:windows-job
실브라우저 smoke        npm run e2e:browser -- --browser edge --chat-url ... --chat-url ...
```

## 브라우저 인수 경계

Chrome/Edge의 로컬 unpacked extension ID는 브라우저가 생성하므로 저장소가 미리 알 수 없다. Native Host manifest의 `allowed_origins`는 이 ID를 필요로 한다. 따라서 다음은 의도된 2단계다.

```text
build → 브라우저 Load unpacked → 확장 ID 확인 → Native Host 등록 → 브라우저 재시작
```

Firefox는 manifest의 고정 ID를 사용하지만 temporary add-on은 브라우저 재시작 뒤 재로드해야 한다.

## 진단 결과 기록 양식

실제 컴퓨터에서 다음을 기록한다.

```text
date/time:
os/version:
node/npm:
browser/version:
commit:
setup command:
shell status:
worker/sidepanel:
multi-chat tabs:
MCP smoke:
known limitation:
```

비밀번호, 쿠키, API key, 환경변수 값, 전체 대화 원문은 기록하지 않는다.

## 정상으로 볼 수 없는 상태

- Native Host 파일만 있고 manifest/registry가 없는데 성공으로 표시되는 상태
- Job Object attach 실패를 guaranteed termination으로 표시하는 상태
- Chrome/Edge 확장 ID 없이 Native Host가 허용되었다고 표시하는 상태
- 실브라우저를 열지 않고 E2E 통과로 기록하는 상태
- 정책이 없는 프로젝트 대화에서 도구 실행이 허용되는 상태
