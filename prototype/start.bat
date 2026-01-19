@echo off
REM HMCTS Common Components Catalogue - Prototype Startup Script

setlocal enabledelayedexpansion

echo.
echo ============================================
echo  HMCTS Common Components Catalogue
echo  Prototype Startup
echo ============================================
echo.

REM Check if we're in the prototype directory
if not exist "package.json" (
    echo ERROR: package.json not found
    echo Please run this script from the prototype directory
    pause
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Checking Node.js version...
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Found: !NODE_VERSION!
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    echo This may take a minute or two...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully!
    echo.
) else (
    echo Dependencies already installed
    echo.
)

REM Start the server
echo Starting the HMCTS Catalogue Prototype...
echo.
echo ============================================
echo  Server Starting on http://localhost:3000
echo ============================================
echo.
echo Press Ctrl+C to stop the server
echo.

call npm start

REM Pause on exit if there was an error
if errorlevel 1 (
    echo.
    echo ERROR: Failed to start server
    pause
)

endlocal
