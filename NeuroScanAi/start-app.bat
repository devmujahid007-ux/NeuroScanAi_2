@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

cls
echo ================================================================
echo NeuroScanAI - Frontend + Backend Starter
echo ================================================================
echo.

REM Check if virtual environment exists
if not exist "backend\venv" (
    echo ERROR: Virtual environment not found at backend\venv
    echo.
    echo Please run this first to create the environment:
    echo   cd backend
    echo   python -m venv venv
    echo   venv\Scripts\activate
    echo   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

REM Check if npm_modules exist
if not exist "frontend\Tumer-Alzheimer-Detection\t-a-det\node_modules" (
    echo WARNING: Node modules not found. Installing npm dependencies...
    cd frontend\Tumer-Alzheimer-Detection\t-a-det
    call npm install
    cd /d "%~dp0"
    echo.
)

echo Starting Backend (Port 8000)...
start "NeuroScanAI Backend" cmd /k "cd /d "%cd%\backend" && venv\Scripts\activate.bat && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

timeout /t 4 /nobreak

echo Starting Frontend (Port 3000)...
start "NeuroScanAI Frontend" cmd /k "cd /d "%cd%\frontend\Tumer-Alzheimer-Detection\t-a-det" && npm start"

echo.
echo ================================================================
echo Services are starting...
echo.
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:8000
echo.
echo Both windows will stay open. Close them when you're done.
echo ================================================================
echo.
pause
