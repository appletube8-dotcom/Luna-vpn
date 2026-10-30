@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" goto install_first
".venv\Scripts\python.exe" scripts\run_local.py
if errorlevel 1 pause
exit /b
:install_first
echo First run INSTALL_WINDOWS.cmd.
pause
exit /b 1
