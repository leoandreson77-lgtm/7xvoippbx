#!/usr/bin/env bash
# =============================================================================
#  KRAD Global Call Center — Docker Image Build Script (Linux/macOS)
# =============================================================================

set -e

IMAGE_NAME="krad-global-app"
TAG="${1:-latest}"
FULL_TAG="${IMAGE_NAME}:${TAG}"

echo "============================================================================="
echo "  Building Docker Image: ${FULL_TAG}"
echo "============================================================================="

if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker CLI not found. Please install Docker and try again."
    exit 1
fi

echo "[*] Building image from Dockerfile..."
docker build -t "${FULL_TAG}" -t "${IMAGE_NAME}:v1.0.0" .

echo ""
echo "[SUCCESS] Image '${FULL_TAG}' built successfully!"
echo ""
echo "Commands to use this image:"
echo "  • Run container:"
echo "      docker run -d -p 3000:3000 -v krad_sqlite_data:/app/data --name krad-app ${FULL_TAG}"
echo "  • Tag for Docker Hub:"
echo "      docker tag ${FULL_TAG} your-username/${IMAGE_NAME}:${TAG}"
echo "  • Export image to tar file:"
echo "      docker save -o ${IMAGE_NAME}.tar ${FULL_TAG}"
echo ""
