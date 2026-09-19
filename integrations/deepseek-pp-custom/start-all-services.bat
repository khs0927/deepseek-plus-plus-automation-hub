@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set NODE_EXE=node
if exist "C:\nodejs\node.exe" set NODE_EXE="C:\nodejs\node.exe"

%NODE_EXE% "%~dp0start-services.mjs"

pause
