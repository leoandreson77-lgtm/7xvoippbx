@echo off
REM =============================================================================
REM  KRAD Global Call Center — Docker Hub / Registry Push Script (Windows)
REM =============================================================================

REM Ensure Docker Desktop binaries are in PATH
set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;C:\Program Files\Docker\Docker\resources\bin;%PATH%"

echo.
echo =============================================================================
echo   Docker Repository Push Tool
echo =============================================================================
echo.

REM Prompt user for Docker Hub / Registry Username
set /p DOCKER_USER="Enter your Docker Hub username [default: leoaddre]: "
if "%DOCKER_USER%"=="" set DOCKER_USER=leoaddre

set /p REPO_NAME="Enter repository name [default: 7xvoip]: "
if "%REPO_NAME%"=="" set REPO_NAME=7xvoip

set /p IMAGE_TAG="Enter tag [default: latest]: "
if "%IMAGE_TAG%"=="" set IMAGE_TAG=latest

set TARGET_IMAGE=%DOCKER_USER%/%REPO_NAME%:%IMAGE_TAG%

echo.
echo [*] Target Image: %TARGET_IMAGE%
echo.

REM 1. Check Docker Login
echo [*] Step 1: Logging in to Docker Hub...
docker login
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Docker login failed. Please check your credentials.
    pause
    exit /b 1
)

REM 2. Build or Tag the local image
echo.
echo [*] Step 2: Building/Tagging Docker image (%TARGET_IMAGE%)...
docker build -t %TARGET_IMAGE% .

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker build failed.
    pause
    exit /b 1
)

REM 3. Push to Docker Hub Repository
echo.
echo [*] Step 3: Pushing image to Docker repository (%TARGET_IMAGE%)...
docker push %TARGET_IMAGE%

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =============================================================================
    echo [SUCCESS] Image successfully pushed to Docker Hub!
    echo URL: https://hub.docker.com/r/%DOCKER_USER%/%REPO_NAME%
    echo.
    echo Pull command for any server:
    echo   docker pull %TARGET_IMAGE%
    echo =============================================================================
    echo.
) else (
    echo.
    echo [ERROR] Docker push failed. Please verify that:
    echo   - You are logged in with 'docker login'
    echo   - Repository name and permissions are valid on Docker Hub
    echo.
)

pause
