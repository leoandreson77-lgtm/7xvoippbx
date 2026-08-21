@echo off
REM =============================================================================
REM  KRAD Global Call Center — Docker Image Build Script (Windows)
REM =============================================================================

REM Ensure Docker Desktop binaries are in PATH
set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;C:\Program Files\Docker\Docker\resources\bin;%PATH%"

set IMAGE_NAME=krad-global-app
set TAG=latest
set FULL_TAG=%IMAGE_NAME%:%TAG%

echo.
echo =============================================================================
echo   Building Docker Image: %FULL_TAG%
echo =============================================================================
echo.

REM Check if Docker is installed and running
docker --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker is not found in PATH or Docker Desktop is not running.
    echo Please install or start Docker Desktop and try again.
    pause
    exit /b 1
)

echo [*] Building Docker image from Dockerfile...
docker build -t %FULL_TAG% -t %IMAGE_NAME%:v1.0.0 .

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Docker image '%FULL_TAG%' built successfully!
    echo.
    echo Next steps:
    echo   1. Run standalone container:
    echo      docker run -d -p 3000:3000 --name krad-app %FULL_TAG%
    echo.
    echo   2. Run complete stack (App + FreeSWITCH):
    echo      docker compose up -d
    echo.
    echo   3. Save image to a portable tar archive:
    echo      docker save -o %IMAGE_NAME%.tar %FULL_TAG%
    echo.
) else (
    echo.
    echo [ERROR] Docker build failed. Please inspect the error output above.
    pause
    exit /b 1
)

pause
