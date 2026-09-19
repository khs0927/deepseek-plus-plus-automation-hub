@echo off
chcp 65001 >nul
setlocal
echo [DeepSeek++ Custom] 백그라운드 서비스 중지 확인 중...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8932 " ^| findstr "LISTENING"') do (
    echo Subagent Server (PID: %%a) 종료 중...
    taskkill /pid %%a /T /F >nul 2>&1
)

echo 모든 DeepSeek++ 백그라운드 서비스가 정리되었습니다.
pause
