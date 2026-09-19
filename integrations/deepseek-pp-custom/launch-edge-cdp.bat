@echo off
chcp 65001 >nul
echo [DeepSeek++ Custom] Microsoft Edge를 디버깅 모드(포트 9223)로 실행합니다...

set EDGE_EXE=""
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set EDGE_EXE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set EDGE_EXE="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if %EDGE_EXE%=="" (
    echo [ERROR] Microsoft Edge 실행 파일을 찾을 수 없습니다.
    pause
    exit /b 1
)

start "" %EDGE_EXE% --remote-debugging-port=9223
echo Edge가 실행되었습니다 (CDP 포트: 9223).
pause
