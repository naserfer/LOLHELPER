@echo off
cd /d "%~dp0"
where py >nul 2>nul && (py overlay.py --text & pause & exit /b)
python overlay.py --text
pause
