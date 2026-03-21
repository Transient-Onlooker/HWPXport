@echo off
chcp 65001 >nul
set /p message="Enter commit message: "

echo.
echo Staging all changes...
git add .

echo.
echo Committing changes...
git commit -m "%message%"

echo.
echo Pushing to remote repository...
git push origin main

echo.
echo Push complete!
pause
