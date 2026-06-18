#!/bin/bash

set -e

# ==========================================
# CONFIG
# ==========================================

IMAGE_TAG=$(git rev-parse --short=12 HEAD)

REGISTRY="reg.staging.redappletech.com"
PROJECT="cicd"
APP_NAME="dashboard-backend"

IMAGE_NAME="${REGISTRY}/${PROJECT}/${APP_NAME}:${IMAGE_TAG}"

# ==========================================
# INFO
# ==========================================

echo "========================================="
echo "CICD DASHBOARD BACKEND DEPLOYMENT"
echo "========================================="
echo "IMAGE_TAG  : ${IMAGE_TAG}"
echo "IMAGE_NAME : ${IMAGE_NAME}"
echo "========================================="

# ==========================================
# DOCKER LOGIN
# ==========================================

echo ""
echo "STEP 0: Docker login to Harbor..."

docker login ${REGISTRY} -u rat_276 -p 'lz1N<I2pNVV4'

# ==========================================
# BUILD
# ==========================================

echo ""
echo "STEP 1: Building Docker image..."

docker build \
  --no-cache \
  -t ${IMAGE_NAME} \
  ./backend

# ==========================================
# PUSH
# ==========================================

echo ""
echo "STEP 2: Pushing Docker image..."

docker push ${IMAGE_NAME}

# ==========================================
# DONE
# ==========================================

echo ""
echo "========================================="
echo "DEPLOYMENT COMPLETED"
echo "========================================="
echo ""
echo "Image pushed to:"
echo "${IMAGE_NAME}"
echo ""
echo "To deploy via ArgoCD, create cd/deployment.yaml and update the image tag."