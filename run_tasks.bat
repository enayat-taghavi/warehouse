@echo off
setlocal
cd /d "%~dp0"
title Antigravity Task Runner

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "PY_CMD=python"
) else (
    if exist "warehouse-backend\venv\Scripts\python.exe" (
        set "PY_CMD=warehouse-backend\venv\Scripts\python.exe"
    ) else (
        set "PY_CMD=py"
    )
)

%PY_CMD% -X utf8 run_tasks.py
echo.
pause
