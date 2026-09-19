@echo off
set NODE_EXE=node
if exist "C:\nodejs\node.exe" set NODE_EXE="C:\nodejs\node.exe"
%NODE_EXE% "%~dp0shell-mcp-host.mjs" %*

