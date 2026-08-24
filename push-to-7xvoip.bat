@echo off
REM =============================================================================
REM  Push to Docker Hub: leoaddre/7xvoip
REM =============================================================================

REM Ensure Docker Desktop binaries are in PATH
set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;C:\Program Files\Docker\Docker\resources\bin;%PATH%"

set REPO=leoaddre/7xvoip
set TAG=latest

echo.
echo =============================================================================
echo   Pushing Image to: %REPO%:%TAG%
echo =============================================================================
echo.

echo [*] Step 1: Logging in to Docker Hub (if not logged in)...
docker login
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Docker login failed.
    pause
    exit /b 1
)

echo.
echo [*] Step 2: Building image from Dockerfile...
docker build -t %REPO%:%TAG% .
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Docker build failed.
    pause
    exit /b 1
)

echo.
echo [*] Step 3: Pushing image to %REPO%:%TAG%...
docker push %REPO%:%TAG%

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =============================================================================
    echo [SUCCESS] Successfully pushed to Docker Hub!
    echo View Tags: https://hub.docker.com/repository/docker/leoaddre/7xvoip/tags
    echo.
    echo Pull command for any server:
    echo   docker pull leoaddre/7xvoip:latest
    echo =============================================================================
    echo.
) else (
    echo.
    echo [ERROR] Docker push failed. Please check your credentials and network.
)

pause
