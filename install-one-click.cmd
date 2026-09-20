@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-one-click.ps1" %*
set "exitCode=%ERRORLEVEL%"
if not "%exitCode%"=="0" (
  echo.
  echo DeepSeek++ setup failed with exit code %exitCode%.
)
exit /b %exitCode%
