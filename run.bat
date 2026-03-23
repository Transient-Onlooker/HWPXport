@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   HWPXport - Dev Server
echo ========================================
echo.
echo Local URL: http://localhost:3000
echo.

if not exist node_modules (
  echo node_modules not found. Running npm install first...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting dev server...
echo Press Ctrl+C to stop.
echo.

call npm run dev
if errorlevel 1 (
  echo.
  echo Failed to start the dev server.
  pause
  exit /b 1
)

pause
