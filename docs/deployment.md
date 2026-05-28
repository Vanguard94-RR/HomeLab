# Homepage CI/CD Deployment

## Architecture
- **Source**: /home/admin/Documents/HomeLab/HomePage
- **Registry**: 192.168.1.91:32500
- **Namespace**: homepage
- **Access**: http://192.168.1.91:32300

## Components
1. **Jenkins**: CI/CD orchestration (http://192.168.1.91:32000)
2. **Private Registry**: Docker image storage
3. **Helm Chart**: Kubernetes deployment
4. **ConfigMaps**: Configuration files

## Deployment Process

### Manual Deployment
```bash
ssh admin@192.168.1.91
cd /home/admin/Documents/HomeLab/HomePage
./deploy.sh
```

### Jenkins Pipeline
1. Access Jenkins: http://192.168.1.91:32000 (credentials in Vault: `secret/jenkins/admin`)
2. Go to homepage-pipeline
3. Click "Build Now"

### Pipeline Steps
1. SSH to host from Jenkins pod
2. Build Docker image from source
3. Tag and push to private registry
4. Update ConfigMaps from config files
5. Deploy via Helm with latest image
6. Verify deployment

## Configuration Updates

### Edit Config Files
```bash
vim /home/admin/Documents/HomeLab/HomePage/config/services.yaml
vim /home/admin/Documents/HomeLab/HomePage/config/bookmarks.yaml
vim /home/admin/Documents/HomeLab/HomePage/config/widgets.yaml
```

### Trigger Deployment
Run Jenkins pipeline or execute:
```bash
./deploy.sh
```

## ConfigMaps
ConfigMaps are automatically updated during deployment:
- homepage-bookmarks
- homepage-services
- homepage-widgets
- homepage-settings
- homepage-docker
- homepage-kubernetes
- homepage-proxmox

## Helm Chart Location
`/home/admin/Documents/HomeLab/Helm-Charts/homepage/`

## Backups
Deployment scripts are backed up to:
`/home/admin/Documents/HomeLab/HomePage/backups/`

## Troubleshooting

### Check Homepage logs
```bash
kubectl logs -n homepage -l app=homepage
```

### Check deployment status
```bash
kubectl get pods -n homepage
kubectl describe deployment homepage -n homepage
```

### Restart Homepage
```bash
kubectl rollout restart deployment/homepage -n homepage
```

### Update ConfigMap manually
```bash
kubectl create configmap homepage-services \
  --from-file=config/services.yaml \
  -n homepage --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart deployment/homepage -n homepage
```

## Jenkins SSH Access
Jenkins pod has passwordless SSH access to host (admin@192.168.1.91)
SSH key: /var/jenkins_home/.ssh/id_rsa
