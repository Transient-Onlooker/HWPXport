@echo off
chcp 65001 >nul
echo ========================================
echo   HWPX Port - 개발 서버 시작
echo ========================================
echo.
echo 로컬 주소: http://localhost:3000
echo.
echo 서버를 중지하려면 Ctrl+C 를 누르세요.
echo ========================================
echo.

npm run dev
