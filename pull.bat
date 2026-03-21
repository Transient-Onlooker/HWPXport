@echo off
chcp 65001 >nul
echo Pulling latest changes from remote repository...

git pull

echo.
echo Pull complete!
pause
