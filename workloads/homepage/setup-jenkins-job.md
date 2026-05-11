# Jenkins Configuration for Homepage Pipeline

## Access Jenkins
URL: http://192.168.1.91:32000
Username: admin
Password: admin123

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
- Secret: `eyJhbGciOiJSUzI1NiIsImtpZCI6Imk4ZVdnLVFic0F6VUl1X3A3X3liUHRSc0ZVYnMwd1ZMTWZLaEFSelc2OUUifQ.eyJhdWQiOlsiaHR0cHM6Ly9rdWJlcm5ldGVzLmRlZmF1bHQuc3ZjLmNsdXN0ZXIubG9jYWwiXSwiZXhwIjo0OTE3NTU2NTUwLCJpYXQiOjE3NjM5NTY1NTAsImlzcyI6Imh0dHBzOi8va3ViZXJuZXRlcy5kZWZhdWx0LnN2Yy5jbHVzdGVyLmxvY2FsIiwianRpIjoiNzM4MDg3ZTktZTUyMC00NzcyLTgzZjQtNDgyMDEzMWMzMDdkIiwia3ViZXJuZXRlcy5pbyI6eyJuYW1lc3BhY2UiOiJjaS1jZCIsInNlcnZpY2VhY2NvdW50Ijp7Im5hbWUiOiJqZW5raW5zIiwidWlkIjoiMGM4YWM3ODMtMWQxNy00NzkxLTkwYTYtOWI0NjM1OTZmZTEzIn19LCJuYmYiOjE3NjM5NTY1NTAsInN1YiI6InN5c3RlbTpzZXJ2aWNlYWNjb3VudDpjaS1jZDpqZW5raW5zIn0.ChAB7JwoZs6m_8U9gaa5FM2bSRCwlwFu-A1gMa1T1pTiWT_um3wwE1iu4Oc4Zf2aToLoB3gOfPhcRYmERj8B-I5Zre5OVW8sqGzi0DA3W32_pheI_44Ml8z265DVPp7erZyR8cQNx_mS0q6im-tKmCJJqgxzFoWenCdJIiV-5g11Zt1j3o5JyA6TBidZ9mv_m_KUOjfJ7GC5FTyURCUA5S3Mqq54s0vjQ_J5_EvoYWdXOJYgalWP4QQzUnraE5JnlTzxOt2prZKafpVJey7zxqNeo1gYPgr7gLjTkJ2RvEa6a_jhjOWH3NThizLzPIHun5KEjU-GceKAWufP0etwng`
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
