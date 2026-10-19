@echo off
rem Fake agy for test_run_tasks_agy.py; interpreter from FAKE_AGY_PYTHON
"%FAKE_AGY_PYTHON%" -X utf8 "%~dp0fake_agy.py" %*
