#!/bin/bash
set -e

echo "=== Homepage Deployment Script ==="
cd /home/admin/Documents/HomeLab/HomePage

echo "Building Docker image..."
docker build -t 192.168.1.91:32500/homepage:latest .

echo "Pushing to registry..."
docker push 192.168.1.91:32500/homepage:latest

echo "Deploying via Helm..."
helm upgrade --install homepage \
  /home/admin/Documents/HomeLab/Helm-Charts/homepage \
  --set image.tag=latest \
  --wait

echo "Verifying deployment..."
kubectl wait --for=condition=available --timeout=300s deployment/homepage -n homepage
kubectl get pods -n homepage
kubectl get svc -n homepage

echo ""
echo "✓ Homepage deployed successfully!"
echo "Access at: http://192.168.1.91:32300"
