@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYEXE=
if exist "G:\DSH-data\dsh-home\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" set PYEXE=G:\DSH-data\dsh-home\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe
if not defined PYEXE ( where py >nul 2>nul && set PYEXE=py )
if not defined PYEXE ( where python >nul 2>nul && set PYEXE=python )
if not defined PYEXE (
  echo [ERROR] Python not found. Install Python 3 or edit PYEXE in this file.
  pause
  exit /b 1
)
echo Starting local server: http://127.0.0.1:8777/app/index.html
start "PCC server" /min "%PYEXE%" -m http.server 8777 --bind 127.0.0.1
timeout /t 2 >nul
start "" http://127.0.0.1:8777/app/index.html
echo Server running in background. Close this window to keep it running.