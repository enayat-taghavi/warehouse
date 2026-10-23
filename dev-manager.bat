@echo off
setlocal enabledelayedexpansion
title Warehouse Dev Manager
chcp 65001 >nul

:: Automatically relaunch inside Windows Terminal if opened in standalone CMD
if "%WT_SESSION%"=="" (
    start "" wt -w _new --title "Warehouse Dev Manager" cmd /k "%~f0"
    exit /b
)

:: Dynamic project root and directory paths without trailing backslashes
set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "BACKEND_DIR=%ROOT_DIR%\backend"
set "FRONT_DIR=%ROOT_DIR%\frontend"

:MENU
cls
echo ================================================================
echo           WAREHOUSE DEVELOPMENT ENVIRONMENT MANAGER
echo ================================================================
echo --- COMBINED STACKS ---
echo [1] Full Stack        : Daphne + SSR 4200 + Cloudflare + Dev 4300
echo [2] Fast Dev Mode     : Daphne 8000 + Angular Dev 4300
echo [3] SSR Preview       : Daphne 8000 + Frontend SSR 4200
echo [4] SSR + Cloudflare  : Daphne 8000 + SSR 4200 + Cloudflare Tunnel
echo.
echo --- STANDALONE SERVICES (ONLY) ---
echo [5] Backend Only      : Daphne 8000 (Single Tab)
echo [6] Frontend Dev Only : Angular Dev Server 4300 (Single Tab)
echo [7] Frontend SSR Only : Frontend SSR 4200 (Single Tab)
echo [8] Tunnel Only       : Cloudflare Tunnel (localhost:4200)
echo [9] Omniroute Only    : Omniroute CLI (Single Tab)
echo.
echo --- TOOLS ^& UTILITIES ---
echo [B] Build Only : Frontend SSR 4200 (Single Tab)
echo [M] Database Migrate  : Apply Migrations + Start Backend
echo [K] Stop ^& Clean      : Kill processes on ports 8000, 4200, 4300
echo [G] GDrive Worker     : Google Drive Sync Background Worker
echo [0] Exit
echo ================================================================
choice /c 123456789BMKG0 /n /m "Select an option [1-9,B,M,K,G,0]: "
set CHOICE_VAL=%errorlevel%

if "%CHOICE_VAL%"=="1" goto DO_FULL
if "%CHOICE_VAL%"=="2" goto DO_FAST
if "%CHOICE_VAL%"=="3" goto DO_SSR
if "%CHOICE_VAL%"=="4" goto DO_SSR_TUNNEL
if "%CHOICE_VAL%"=="5" goto DO_BACKEND
if "%CHOICE_VAL%"=="6" goto DO_FRONT
if "%CHOICE_VAL%"=="7" goto DO_FRONT_SSR
if "%CHOICE_VAL%"=="8" goto DO_TUNNEL
if "%CHOICE_VAL%"=="9" goto DO_OMNI
if "%CHOICE_VAL%"=="10" goto DO_FRONT_SSR_build
if "%CHOICE_VAL%"=="11" goto DO_MIGRATE
if "%CHOICE_VAL%"=="12" goto DO_CLEAN
if "%CHOICE_VAL%"=="13" goto DO_GDRIVE_WORKER
if "%CHOICE_VAL%"=="14" goto DO_EXIT
goto MENU

:CHECK_VENV
if not exist "%BACKEND_DIR%\venv\Scripts\python.exe" (
    echo.
    echo [ERROR] Python virtual environment not found at:
    echo "%BACKEND_DIR%\venv"
    echo Please make sure the virtual environment exists.
    echo.
    pause
    goto MENU
)
goto :eof

:DO_FULL
call :CHECK_VENV
echo Launching Full Stack in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne" cmd /k ".\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ; split-pane -V -d "%FRONT_DIR%" --title "Frontend SSR" cmd /k "npm run build && node server.js" ; split-pane -H -d "%ROOT_DIR%" --title "Cloudflare Tunnel" cmd /k "npx cloudflared tunnel run --protocol http2 --url http://localhost:4200 warehouse" ; split-pane -H -d "%FRONT_DIR%" --title "Frontend Dev (4300)" cmd /k "npm run start -- --port 4300"
goto MENU

:DO_FAST
call :CHECK_VENV
echo Launching Fast Dev Mode in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne" cmd /k ".\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ; split-pane -V -d "%FRONT_DIR%" --title "Frontend Dev (4300)" cmd /k "npm run start -- --port 4300"
goto MENU

:DO_SSR
call :CHECK_VENV
echo Launching SSR Preview in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne" cmd /k ".\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ; split-pane -V -d "%FRONT_DIR%" --title "Frontend SSR (4200)" cmd /k "npm run build && node server.js"
goto MENU

:DO_SSR_TUNNEL
call :CHECK_VENV
echo Launching SSR + Cloudflare in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne" cmd /k ".\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ; split-pane -V -d "%FRONT_DIR%" --title "Frontend SSR (4200)" cmd /k "npm run build && node server.js" ; split-pane -H -d "%ROOT_DIR%" --title "Cloudflare Tunnel" cmd /k "npx cloudflared tunnel run --protocol http2 --url http://localhost:4200 warehouse"
goto MENU

:DO_BACKEND
call :CHECK_VENV
echo Launching Backend Daphne (8000) in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne (8000)" cmd /k ".\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application"
goto MENU

:DO_FRONT
echo Launching Frontend Dev (4300) in a new tab...
wt -w 0 new-tab -d "%FRONT_DIR%" --title "Frontend Dev (4300)" cmd /k "npm run start -- --port 4300"
goto MENU

:DO_FRONT_SSR
echo Launching Frontend SSR (4200) in a new tab...
wt -w 0 new-tab -d "%FRONT_DIR%" --title "Frontend SSR (4200)" cmd /k "npm run build && node server.js"
goto MENU

:DO_FRONT_SSR_build
echo Launching Frontend SSR (4200) in a new tab...
wt -w 0 new-tab -d "%FRONT_DIR%" --title "Frontend SSR (4200)" cmd /k "npm run build"
goto MENU

:DO_TUNNEL
echo Launching Cloudflare Tunnel in a new tab...
wt -w 0 new-tab -d "%ROOT_DIR%" --title "Cloudflare Tunnel" cmd /k "npx cloudflared tunnel run --protocol http2 --url http://localhost:4200 warehouse"
goto MENU

:DO_OMNI
echo Launching Omniroute in a new tab...
wt -w 0 new-tab -d "%USERPROFILE%" --title "Omniroute" cmd /k "omniroute"
goto MENU

:DO_MIGRATE
call :CHECK_VENV
echo Launching Migrations and Backend in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Migrate & Run" cmd /k ".\venv\Scripts\python.exe manage.py migrate && .\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application"
goto MENU

:DO_CLEAN
echo.
echo Cleaning up active processes on ports 8000, 4200, 4300...
for %%p in (8000 4200 4300) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%p') do (
        echo Killing process with PID %%a on port %%p...
        taskkill /f /pid %%a >nul 2>&1
    )
)
echo All ports are freed successfully!
echo.
goto MENU

:DO_GDRIVE_WORKER
call :CHECK_VENV
echo Launching Google Drive Sync Worker in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "GDrive Sync Worker" cmd /k "for /l %%i in (1,0,2) do (.\venv\Scripts\python.exe -X utf8 manage.py run_gdrive_sync_worker --interval 5 & timeout /t 10 /nobreak >nul)"
goto MENU

:DO_EXIT
echo Exiting...
exit
