@echo off
rem MixLine: double-click to stop the web app (Windows). Your data is kept; start-mixline.cmd
rem starts it again where it left off.
setlocal
cd /d "%~dp0"
title MixLine
echo.
echo  MixLine: stopping the web app...
echo.
docker info >nul 2>&1
if errorlevel 1 goto not_running
docker compose down
if errorlevel 1 goto failed
echo.
echo  MixLine is stopped. Your data is kept.
echo.
timeout /t 10
exit /b 0

:not_running
echo  Docker Desktop is not running, so MixLine is not running either.
echo.
timeout /t 10
exit /b 0

:failed
echo.
echo  Stopping did not work; the messages above say why.
pause
exit /b 1
