@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

cls
echo ================================================================
echo Diagnostic Tool - Check if Backend & Frontend are Running
echo ================================================================
echo.

echo [1] Checking for running processes on required ports...
echo.

echo Checking Port 8000 (Backend):
netstat -ano | findstr :8000
if errorlevel 1 (
    echo     STATUS: NOT RUNNING - Backend is not listening on port 8000
) else (
    echo     STATUS: RUNNING - Backend found on port 8000
)
echo.

echo Checking Port 3000 (Frontend):
netstat -ano | findstr :3000
if errorlevel 1 (
    echo     STATUS: NOT RUNNING - Frontend is not listening on port 3000
) else (
    echo     STATUS: RUNNING - Frontend found on port 3000
)
echo.

echo [2] Firewall Status:
netsh advfirewall show allprofiles
echo.

echo [3] Testing localhost connectivity...
ping -n 1 localhost >nul 2>&1
if errorlevel 1 (
    echo     ERROR: Cannot reach localhost (network issue)
) else (
    echo     OK: localhost is reachable
)
echo.

echo [4] Testing 127.0.0.1 connectivity...
ping -n 1 127.0.0.1 >nul 2>&1
if errorlevel 1 (
    echo     ERROR: Cannot reach 127.0.0.1
) else (
    echo     OK: 127.0.0.1 is reachable
)
echo.

echo ================================================================
echo DIAGNOSIS SUMMARY:
echo ================================================================
echo.
echo If BOTH ports show "NOT RUNNING":
echo   - The services haven't started yet, OR
echo   - They crashed immediately (check error messages in windows)
echo   - SOLUTION: Check the terminal windows for error messages
echo.
echo If ports show process IDs (LISTENING):
echo   - Services ARE running
echo   - Connection refused might be a firewall/antivirus issue
echo   - SOLUTION: Check Windows Defender or antivirus settings
echo.
echo If localhost/127.0.0.1 ping fails:
echo   - This is rare but indicates network stack issues
echo   - SOLUTION: Restart your network adapter
echo.
echo ================================================================
echo.
pause
