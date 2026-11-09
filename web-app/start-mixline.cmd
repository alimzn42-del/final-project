@echo off
rem MixLine: double-click to start the web app and open it in the browser (Windows).
rem It starts Docker Desktop if needed, brings every service up (building only what changed),
rem then opens the line page. Stop it again with stop-mixline.cmd. Your data is always kept.
setlocal
cd /d "%~dp0"
title MixLine
echo.
echo  MixLine: starting the web app...
echo.

rem --- 1. Your settings must exist (README, step 2) ---
if exist ".env" goto settings_ok
echo  The settings file .env is missing.
echo  Copy .env.example to .env and set the passwords first (README, step 2).
goto failed
:settings_ok

rem --- 2. Docker Desktop must be running ---
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" goto no_docker
echo  Docker Desktop is not running: starting it (this can take a minute)...
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a tries=0
:wait_docker
timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a tries+=1
if %tries% geq 60 goto docker_slow
goto wait_docker
:no_docker
echo  Docker Desktop was not found. Install it first (README, "What you need").
goto failed
:docker_slow
echo  Docker Desktop did not start within 3 minutes.
echo  Start it by hand, wait until it says it is running, then double-click this file again.
goto failed
:docker_ready

rem --- 3. Every service up; images rebuilt only where the code changed ---
echo  Starting the services (the first time, or after an update, this takes a few minutes)...
docker compose up --build -d --wait
if errorlevel 1 goto compose_failed

rem --- 4. Open the line page (the port from WEB_PORT in .env, 8080 if not set) ---
set "WEB_PORT=8080"
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"WEB_PORT=" ".env"') do set "WEB_PORT=%%b"
echo.
echo  MixLine is running: http://localhost:%WEB_PORT%
if not "%MIXLINE_NO_BROWSER%"=="1" start "" "http://localhost:%WEB_PORT%/line"
echo  You can close this window; the app keeps running. To stop it: stop-mixline.cmd
echo.
timeout /t 15
exit /b 0

:compose_failed
echo.
echo  The services did not start. The messages above say why; "If something goes wrong" in
echo  README.md lists the usual causes (a build that runs out of memory, a port already in use).
:failed
echo.
pause
exit /b 1
