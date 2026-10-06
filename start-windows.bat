@echo off
cd /d "%~dp0"
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening https://nodejs.org ...
  start "" https://nodejs.org
  pause
  exit /b
)
node start.js
pause
