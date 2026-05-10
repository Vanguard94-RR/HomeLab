#!/bin/bash
set -e

echo "Deploying Private Docker Registry..."

# Apply manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

echo ""
echo "Waiting for registry to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/docker-registry -n docker-registry

echo ""
echo "Registry deployed successfully!"
echo ""
echo "Registry URL: http://192.168.1.91:32500"
echo ""
echo "Test with: curl http://192.168.1.91:32500/v2/"
echo ""
