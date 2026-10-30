@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto install
where py >nul 2>nul
if errorlevel 1 goto use_python
py -3 -m venv .venv
if errorlevel 1 goto failed
goto install
:use_python
where python >nul 2>nul
if errorlevel 1 goto no_python
python -m venv .venv
if errorlevel 1 goto failed
:install
".venv\Scripts\python.exe" -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"
if errorlevel 1 goto no_python
".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 goto failed
".venv\Scripts\python.exe" scripts\run_local.py --init
if errorlevel 1 goto failed
echo Ready. Fill BOT_TOKEN and SUPPORT_USERNAME, then run START_LUNA.cmd.
notepad ".env"
pause
exit /b 0
:no_python
echo Install Python 3.12 or newer from https://www.python.org/downloads/windows/
echo Enable the Python launcher or Add python.exe to PATH, then retry.
pause
exit /b 1
:failed
echo Installation failed. Read the error above.
pause
exit /b 1
