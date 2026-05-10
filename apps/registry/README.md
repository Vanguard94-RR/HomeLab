# Private Docker Registry

This is the private Docker registry for the HomeLab Kubernetes cluster.

## Registry Details

- **URL**: http://192.168.1.91:32500
- **Storage**: Longhorn (5Gi)
- **Namespace**: docker-registry

## Deployment

```bash
# Deploy registry
kubectl apply -f k8s/

# Check status
kubectl get all -n docker-registry

# Test registry
curl http://192.168.1.91:32500/v2/
```

## Usage in Docker

```bash
# Tag an image
docker tag myimage:latest 192.168.1.91:32500/myimage:latest

# Push to registry
docker push 192.168.1.91:32500/myimage:latest

# Pull from registry
docker pull 192.168.1.91:32500/myimage:latest
```

## Usage in Kubernetes

```yaml
spec:
  containers:
  - name: myapp
    image: 192.168.1.91:32500/myimage:latest
```
