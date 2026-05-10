#!/bin/bash
set -e

BUILD_NUMBER=${1:-latest}
REGISTRY="192.168.1.91:32500"
IMAGE_NAME="homepage"
HOMEPAGE_DIR="/home/admin/Documents/HomeLab/HomePage"
NAMESPACE="homepage"

echo "=== Homepage Deployment Script ==="
echo "Build: $BUILD_NUMBER"

cd $HOMEPAGE_DIR

echo "Building Docker image..."
docker build -t ${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER} .
docker tag ${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER} ${REGISTRY}/${IMAGE_NAME}:latest

echo "Pushing to registry..."
docker push ${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER}
docker push ${REGISTRY}/${IMAGE_NAME}:latest

echo "Ensuring namespace exists..."
kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

echo "Updating ConfigMaps from config files BEFORE deployment..."
cd config
kubectl create configmap homepage-bookmarks --from-file=bookmarks.yaml -n ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap homepage-services --from-file=services.yaml -n ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap homepage-widgets --from-file=widgets.yaml -n ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap homepage-settings --from-file=settings.yaml -n ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap homepage-docker --from-file=docker.yaml -n ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null || true
kubectl create configmap homepage-kubernetes --from-file=kubernetes.yaml -n ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null || true
kubectl create configmap homepage-proxmox --from-file=proxmox.yaml -n ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null || true
cd ..

echo "Deploying via Helm..."
helm upgrade --install homepage \
  /home/admin/Documents/HomeLab/Helm-Charts/homepage \
  --set image.tag=latest \
  --wait

echo "Forcing pod restart to load new ConfigMaps..."
kubectl rollout restart deployment/homepage -n ${NAMESPACE}
kubectl rollout status deployment/homepage -n ${NAMESPACE} --timeout=120s

echo "Verifying deployment..."
kubectl get pods -n ${NAMESPACE}
kubectl get svc -n ${NAMESPACE}

echo ""
echo "✓ Homepage deployed successfully!"
echo "✓ ConfigMaps updated from source files"
echo "✓ Pod restarted to load new configuration"
echo "Access at: http://192.168.1.91:32300"
