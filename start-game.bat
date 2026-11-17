@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install it from https://nodejs.org/ first.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)
echo Starting the game. Close this window to stop it.
call npm run start
pause
