@echo off
cd /d "%~dp0"
where pyw >nul 2>nul && (start "" pyw overlay.py & exit /b)
where pythonw >nul 2>nul && (start "" pythonw overlay.py & exit /b)
where py >nul 2>nul && (start "" py overlay.py & exit /b)
where python >nul 2>nul && (python -c "import sys" >nul 2>nul && (start "" python overlay.py & exit /b))
echo.
echo  No se encontro Python en esta PC.
echo  Instalalo desde https://www.python.org/downloads/
echo  y marca la casilla "Add Python to PATH" al instalar.
echo.
start "" https://www.python.org/downloads/
pause
