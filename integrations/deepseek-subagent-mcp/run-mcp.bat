@echo off
setlocal
cd /d "%~dp0"
set NODE_EXE=node
if exist "%ProgramFiles%\nodejs\node.exe" set NODE_EXE="%ProgramFiles%\nodejs\node.exe"
%NODE_EXE% server.js
