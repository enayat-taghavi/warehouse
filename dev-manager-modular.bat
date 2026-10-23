@echo off
setlocal enabledelayedexpansion
title Modular Dev Manager
chcp 65001 >nul

:: Automatically relaunch inside Windows Terminal if opened in standalone CMD
if "%WT_SESSION%"=="" (
    start "" wt -w _new --title "Modular Dev Manager" cmd /k "%~f0"
    exit /b
)

:: Dynamic project root and directory paths without trailing backslashes
set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "BACKEND_DIR=%ROOT_DIR%\backend"
set "FRONT_DIR=%ROOT_DIR%\frontend"

:SELECT_MODE
cls
echo ================================================================
echo           MODULAR ENVIRONMENT MANAGER - SELECT MODE
echo ================================================================
echo Please choose the active domain mode:
echo.
echo [1] Full Suite       : Both Warehouse and Accounting (All Modules)
echo [2] Accounting Only  : Finance, Payroll, Fleet, Projects (No Warehouse)
echo [3] Warehouse Only   : Inventory, Counting, Warehouses (No Accounting)
echo.
echo --- UTILITIES ---
echo [K] Stop ^& Clean     : Kill processes on ports 8000, 4200, 4300
echo [0] Exit
echo ================================================================
choice /c 123K0 /n /m "Select module mode [1-3, K, 0]: "
set MODE_CHOICE=%errorlevel%

if "%MODE_CHOICE%"=="1" goto SET_MODE_FULL
if "%MODE_CHOICE%"=="2" goto SET_MODE_ACCOUNTING
if "%MODE_CHOICE%"=="3" goto SET_MODE_WAREHOUSE
if "%MODE_CHOICE%"=="4" goto DO_CLEAN_FROM_MAIN
if "%MODE_CHOICE%"=="5" goto DO_EXIT
goto SELECT_MODE

:SET_MODE_FULL
set "MODE_NAME=Full Suite (Warehouse + Accounting)"
set "MODE_SHORT=Full"
set "WH_MOD_VAL="
set "FRONT_BUILD=npm run build"
set "FRONT_SSR=npm run build && node server.js"
set "FRONT_DEV=npm run start -- --port 4300"
goto OPERATIONAL_MENU

:SET_MODE_ACCOUNTING
set "MODE_NAME=Accounting Only (Finance & Personnel)"
set "MODE_SHORT=Accounting"
set "WH_MOD_VAL=accounting"
set "FRONT_BUILD=npm run build:accounting"
set "FRONT_SSR=npm run build:accounting && node server.js"
rem The dev server always shows all modules; single-module builds use npm run build:modules
set "FRONT_DEV=npm start -- --port 4300"
goto OPERATIONAL_MENU

:SET_MODE_WAREHOUSE
set "MODE_NAME=Warehouse Only (Inventory & Warehouses)"
set "MODE_SHORT=Warehouse"
set "WH_MOD_VAL=warehouse"
set "FRONT_BUILD=npm run build:warehouse"
set "FRONT_SSR=npm run build:warehouse && node server.js"
rem The dev server always shows all modules; single-module builds use npm run build:modules
set "FRONT_DEV=npm start -- --port 4300"
goto OPERATIONAL_MENU

:OPERATIONAL_MENU
cls
echo ================================================================
echo           MODULAR DEVELOPMENT ENVIRONMENT MANAGER
echo ================================================================
echo  ACTIVE MODE : [ %MODE_NAME% ]
echo  ENV CONFIG  : WH_MODULES=%WH_MOD_VAL%
echo ================================================================
echo --- COMBINED STACKS ---
echo [1] Full Stack        : Daphne + SSR 4200 + Cloudflare + Dev 4300
echo [2] Fast Dev Mode     : Daphne 8000 + Angular Dev 4300
echo [3] SSR Preview       : Daphne 8000 + Frontend SSR 4200
echo [4] SSR + Cloudflare  : Daphne 8000 + SSR 4200 + Cloudflare Tunnel
echo.
echo --- STANDALONE SERVICES (ONLY) ---
echo [5] Backend Only      : Daphne 8000 (%MODE_SHORT%)
echo [6] Frontend Dev Only : Angular Dev Server 4300 (%MODE_SHORT%)
echo [7] Frontend SSR Only : Frontend SSR 4200 (%MODE_SHORT%)
echo [8] Tunnel Only       : Cloudflare Tunnel (localhost:4200)
echo [9] Omniroute Only    : Omniroute CLI (Single Tab)
echo.
echo --- TOOLS ^& UTILITIES ---
echo [B] Build Only        : Frontend SSR/Bundle (%MODE_SHORT%)
echo [M] Database Migrate  : Apply Migrations + Start Backend (%MODE_SHORT%)
echo [C] Change Mode       : Switch Mode (Full / Accounting / Warehouse)
echo [K] Stop ^& Clean      : Kill processes on ports 8000, 4200, 4300
echo [0] Exit
echo ================================================================
choice /c 123456789BMKC0 /n /m "Select an option [1-9,B,M,K,C,0]: "
set OP_CHOICE=%errorlevel%

if "%OP_CHOICE%"=="1" goto DO_FULL
if "%OP_CHOICE%"=="2" goto DO_FAST
if "%OP_CHOICE%"=="3" goto DO_SSR
if "%OP_CHOICE%"=="4" goto DO_SSR_TUNNEL
if "%OP_CHOICE%"=="5" goto DO_BACKEND
if "%OP_CHOICE%"=="6" goto DO_FRONT
if "%OP_CHOICE%"=="7" goto DO_FRONT_SSR
if "%OP_CHOICE%"=="8" goto DO_TUNNEL
if "%OP_CHOICE%"=="9" goto DO_OMNI
if "%OP_CHOICE%"=="10" goto DO_BUILD
if "%OP_CHOICE%"=="11" goto DO_MIGRATE
if "%OP_CHOICE%"=="12" goto DO_CLEAN
if "%OP_CHOICE%"=="13" goto SELECT_MODE
if "%OP_CHOICE%"=="14" goto DO_EXIT
goto OPERATIONAL_MENU

:CHECK_VENV
if not exist "%BACKEND_DIR%\venv\Scripts\python.exe" (
    echo.
    echo [ERROR] Python virtual environment not found at:
    echo "%BACKEND_DIR%\venv"
    echo Please make sure the virtual environment exists.
    echo.
    pause
    goto OPERATIONAL_MENU
)
goto :eof

:DO_FULL
call :CHECK_VENV
echo Launching Full Stack [%MODE_SHORT%] in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne (%MODE_SHORT%)" cmd /k "set WH_MODULES=%WH_MOD_VAL%&& .\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ; split-pane -V -d "%FRONT_DIR%" --title "Frontend SSR (%MODE_SHORT%)" cmd /k "%FRONT_SSR%" ; split-pane -H -d "%ROOT_DIR%" --title "Cloudflare Tunnel" cmd /k "npx cloudflared tunnel run --protocol http2 --url http://localhost:4200 warehouse" ; split-pane -H -d "%FRONT_DIR%" --title "Frontend Dev (%MODE_SHORT%)" cmd /k "%FRONT_DEV%"
goto OPERATIONAL_MENU

:DO_FAST
call :CHECK_VENV
echo Launching Fast Dev Mode [%MODE_SHORT%] in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne (%MODE_SHORT%)" cmd /k "set WH_MODULES=%WH_MOD_VAL%&& .\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ; split-pane -V -d "%FRONT_DIR%" --title "Frontend Dev (%MODE_SHORT%)" cmd /k "%FRONT_DEV%"
goto OPERATIONAL_MENU

:DO_SSR
call :CHECK_VENV
echo Launching SSR Preview [%MODE_SHORT%] in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne (%MODE_SHORT%)" cmd /k "set WH_MODULES=%WH_MOD_VAL%&& .\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ; split-pane -V -d "%FRONT_DIR%" --title "Frontend SSR (%MODE_SHORT%)" cmd /k "%FRONT_SSR%"
goto OPERATIONAL_MENU

:DO_SSR_TUNNEL
call :CHECK_VENV
echo Launching SSR + Cloudflare [%MODE_SHORT%] in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne (%MODE_SHORT%)" cmd /k "set WH_MODULES=%WH_MOD_VAL%&& .\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ; split-pane -V -d "%FRONT_DIR%" --title "Frontend SSR (%MODE_SHORT%)" cmd /k "%FRONT_SSR%" ; split-pane -H -d "%ROOT_DIR%" --title "Cloudflare Tunnel" cmd /k "npx cloudflared tunnel run --protocol http2 --url http://localhost:4200 warehouse"
goto OPERATIONAL_MENU

:DO_BACKEND
call :CHECK_VENV
echo Launching Backend Daphne 8000 [%MODE_SHORT%] in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Daphne (%MODE_SHORT%)" cmd /k "set WH_MODULES=%WH_MOD_VAL%&& .\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application"
goto OPERATIONAL_MENU

:DO_FRONT
echo Launching Frontend Dev 4300 [%MODE_SHORT%] in a new tab...
wt -w 0 new-tab -d "%FRONT_DIR%" --title "Frontend Dev (%MODE_SHORT%)" cmd /k "%FRONT_DEV%"
goto OPERATIONAL_MENU

:DO_FRONT_SSR
echo Launching Frontend SSR 4200 [%MODE_SHORT%] in a new tab...
wt -w 0 new-tab -d "%FRONT_DIR%" --title "Frontend SSR (%MODE_SHORT%)" cmd /k "%FRONT_SSR%"
goto OPERATIONAL_MENU

:DO_BUILD
echo Building Frontend [%MODE_SHORT%] in a new tab...
wt -w 0 new-tab -d "%FRONT_DIR%" --title "Frontend Build (%MODE_SHORT%)" cmd /k "%FRONT_BUILD%"
goto OPERATIONAL_MENU

:DO_TUNNEL
echo Launching Cloudflare Tunnel in a new tab...
wt -w 0 new-tab -d "%ROOT_DIR%" --title "Cloudflare Tunnel" cmd /k "npx cloudflared tunnel run --protocol http2 --url http://localhost:4200 warehouse"
goto OPERATIONAL_MENU

:DO_OMNI
echo Launching Omniroute in a new tab...
wt -w 0 new-tab -d "%USERPROFILE%" --title "Omniroute" cmd /k "omniroute"
goto OPERATIONAL_MENU

:DO_MIGRATE
call :CHECK_VENV
echo Launching Migrations and Backend [%MODE_SHORT%] in a new tab...
wt -w 0 new-tab -d "%BACKEND_DIR%" --title "Backend Migrate & Run (%MODE_SHORT%)" cmd /k "set WH_MODULES=%WH_MOD_VAL%&& .\venv\Scripts\python.exe manage.py migrate && .\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application"
goto OPERATIONAL_MENU

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
pause
goto OPERATIONAL_MENU

:DO_CLEAN_FROM_MAIN
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
pause
goto SELECT_MODE

:DO_EXIT
echo Exiting...
exit
