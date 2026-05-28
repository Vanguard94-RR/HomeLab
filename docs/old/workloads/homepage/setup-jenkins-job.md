# Jenkins Configuration for Homepage Pipeline

## Access Jenkins
URL: http://192.168.1.91:32000
Username: admin
Password: See `.vault-root-token` or Vault secret (not stored in git)

## Required Plugins
1. Go to **Manage Jenkins** → **Plugins** → **Available**
2. Install:
   - Kubernetes CLI Plugin
   - Pipeline Plugin (already installed)
   - Git Plugin (already installed)

## Create Credentials

### 1. Kubernetes Token
- Go to **Manage Jenkins** → **Credentials** → **System** → **Global credentials**
- Click **Add Credentials**
- Kind: **Secret text**
- Secret: `<Generate with: kubectl create token jenkins -n ci-cd>`  # ⚠️ Never commit actual tokens
- ID: `k8s-token`
- Description: `Kubernetes ServiceAccount Token`

## Create Pipeline Job

1. Click **New Item**
2. Name: `homepage-pipeline`
3. Type: **Pipeline**
4. Click **OK**

### Pipeline Configuration

**General:**
- Description: `CI/CD pipeline for Homepage deployment`

**Build Triggers:**
- Check **Poll SCM**
- Schedule: `H/5 * * * *` (poll every 5 minutes)

**Pipeline:**
- Definition: **Pipeline script from SCM**
- SCM: **Git**
- Repository URL: `/home/admin/Documents/HomeLab/HomePage`
- Branch: `*/main` (or `*/master`)
- Script Path: `Jenkinsfile`

Click **Save**

## Run Pipeline

1. On the job page, click **Build Now**
2. Monitor the build in **Console Output**

## Expected Result

Pipeline stages:
1. ✓ Checkout code from local directory
2. ✓ Build Docker image (192.168.1.91:32500/homepage:latest)
3. ✓ Push to private registry
4. ✓ Deploy via Helm to homepage namespace
5. ✓ Verify deployment

Homepage accessible at: **http://192.168.1.91:32300**
