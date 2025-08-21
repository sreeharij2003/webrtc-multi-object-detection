@echo off
setlocal enabledelayedexpansion

REM WebRTC VLM Detection System Startup Script for Windows
title WebRTC VLM Detection System

REM Default configuration
if "%MODE%"=="" set MODE=wasm
if "%USE_NGROK%"=="" set USE_NGROK=false
if "%PORT%"=="" set PORT=3000
if "%SIGNALING_PORT%"=="" set SIGNALING_PORT=8080

REM Parse command line arguments
:parse_args
if "%1"=="--mode" (
    set MODE=%2
    shift
    shift
    goto parse_args
)
if "%1"=="--ngrok" (
    set USE_NGROK=true
    shift
    goto parse_args
)
if "%1"=="--port" (
    set PORT=%2
    shift
    shift
    goto parse_args
)
if "%1"=="--help" (
    echo Usage: %0 [OPTIONS]
    echo.
    echo Options:
    echo   --mode MODE     Set processing mode (server^|wasm) [default: wasm]
    echo   --ngrok         Enable ngrok for external access
    echo   --port PORT     Set HTTP port [default: 3000]
    echo   --help          Show this help message
    echo.
    echo Examples:
    echo   %0                          # Start in WASM mode
    echo   %0 --mode server            # Start in server mode
    echo   %0 --ngrok                  # Start with ngrok tunnel
    echo   %0 --mode server --ngrok    # Server mode with ngrok
    exit /b 0
)
if "%1" neq "" (
    echo [ERROR] Unknown option: %1
    echo Use --help for usage information
    exit /b 1
)

echo ================================
echo  WebRTC VLM Detection System
echo ================================
echo.

REM Validate mode
if "%MODE%" neq "server" if "%MODE%" neq "wasm" (
    echo [ERROR] Invalid mode: %MODE%. Must be 'server' or 'wasm'
    exit /b 1
)

echo [INFO] Starting in %MODE% mode...

REM Check if Docker is available
docker --version >nul 2>&1
if %errorlevel% equ 0 (
    docker-compose --version >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] Using Docker Compose...
        
        REM Build and start services
        docker-compose down --remove-orphans >nul 2>&1
        docker-compose up --build -d
        
        if !errorlevel! equ 0 (
            echo [INFO] Services started successfully!
        ) else (
            echo [ERROR] Failed to start services
            docker-compose logs
            exit /b 1
        )
    ) else (
        goto local_start
    )
) else (
    goto local_start
)

goto setup_ngrok

:local_start
echo [INFO] Docker not available, starting locally...

REM Check if Node.js is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required but not installed
    exit /b 1
)

REM Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    npm install
)

REM Install client dependencies if needed
if not exist "client\node_modules" (
    echo [INFO] Installing client dependencies...
    cd client && npm install && cd ..
)

REM Build client if needed
if not exist "client\dist" (
    echo [INFO] Building client...
    cd client && npm run build && cd ..
)

REM Start the application
start /b npm start

:setup_ngrok
REM Setup ngrok if requested
if "%USE_NGROK%"=="true" (
    ngrok version >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] Starting ngrok tunnel...
        start /b ngrok http %PORT% --log=stdout
        
        REM Wait for ngrok to start
        timeout /t 3 /nobreak >nul
        
        REM Try to get ngrok URL (simplified for Windows)
        echo [INFO] Ngrok tunnel started on port %PORT%
        echo [INFO] Check http://localhost:4040 for tunnel URL
    ) else (
        echo [WARN] ngrok not found, install it from https://ngrok.com/
    )
)

REM Display connection information
echo.
echo [INFO] System ready!
echo.
echo Local URL: http://localhost:%PORT%
echo Mode: %MODE%
echo Signaling Port: %SIGNALING_PORT%
echo.
echo [INFO] Open the URL on your laptop and scan the QR code with your phone
echo [INFO] Press Ctrl+C to stop the system
echo.

REM Keep the window open
pause
