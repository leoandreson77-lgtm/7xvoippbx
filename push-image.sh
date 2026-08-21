#!/usr/bin/env bash
# =============================================================================
#  KRAD Global Call Center — Docker Hub Push Script (Linux/macOS)
# =============================================================================

set -e

echo "============================================================================="
echo "  Docker Repository Push Tool"
echo "============================================================================="

read -p "Enter your Docker Hub username: " DOCKER_USER
if [ -z "$DOCKER_USER" ]; then
    echo "[ERROR] Docker Hub username cannot be empty."
    exit 1
fi

read -p "Enter repository name [default: krad-global-app]: " REPO_NAME
REPO_NAME=${REPO_NAME:-krad-global-app}

read -p "Enter image tag [default: latest]: " IMAGE_TAG
IMAGE_TAG=${IMAGE_TAG:-latest}

TARGET_IMAGE="${DOCKER_USER}/${REPO_NAME}:${IMAGE_TAG}"

echo ""
echo "[*] Target Image: ${TARGET_IMAGE}"
echo ""

# 1. Login
echo "[*] Step 1: Logging in to Docker Hub..."
docker login

# 2. Build & Tag
echo ""
echo "[*] Step 2: Building image from Dockerfile..."
docker build -t "${TARGET_IMAGE}" .

# 3. Push
echo ""
echo "[*] Step 3: Pushing image to Docker repository (${TARGET_IMAGE})..."
docker push "${TARGET_IMAGE}"

echo ""
echo "============================================================================="
echo "[SUCCESS] Image successfully pushed to Docker Hub!"
echo "URL: https://hub.docker.com/r/${DOCKER_USER}/${REPO_NAME}"
echo ""
echo "Pull command:"
echo "  docker pull ${TARGET_IMAGE}"
echo "============================================================================="
