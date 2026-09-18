@echo off
set "SCRIPT=%~dp0launch_visible_edge.ps1"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
