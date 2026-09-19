@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo  DeepSeek++ Custom - Native Host Registration
echo ========================================================
echo.

set NODE_EXE=node
if exist "C:\nodejs\node.exe" set NODE_EXE="C:\nodejs\node.exe"

%NODE_EXE% "%~dp0register-host.mjs"

echo.
pause

