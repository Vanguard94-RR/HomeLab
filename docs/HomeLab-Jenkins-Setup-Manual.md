# HomeLab Jenkins Complete Setup Manual

## Overview

This document describes the complete setup process for a production-style Jenkins environment running on Kubernetes inside the HomeLab platform.

The implementation includes:

- Kubernetes-native Jenkins deployment
- Helm-based lifecycle management
- Persistent storage with Longhorn
- JCasC (Jenkins Configuration as Code)
- GitHub integration
- HashiCorp Vault integration
- GitOps-compatible repository structure
- Kubernetes RBAC
- Jenkins agents
- Vault-based secret management

---

# Architecture

```text
GitHub
   |
   v
Jenkins (Kubernetes)
   |
   +--> Vault Authentication
   |
   +--> Kubernetes API
   |
   +--> Helm Deployments
   |
   +--> Longhorn Persistent Volumes
```

---

# Repository Structure

```text
HomeLab/
├── apps/
├── docs/
├── infrastructure/
│   ├── helm-charts/
│   │   ├── jenkins/
│   │   ├── vault/
│   │   ├── longhorn/
│   │   └── homepage/
│   ├── jenkins/
│   │   ├── groovy/
│   │   ├── jcasc/
│   │   └── jobs/
│   └── policies/
│       └── vault/
├── scripts/
│   └── bootstrap/
└── backups/
```

---

# Prerequisites

## Required Components

- Linux workstation
- Kubernetes cluster
- kubectl
- Helm v3
- Git
- jq
- Longhorn storage
- GitHub account
- GitHub Personal Access Token

---

# Install Required Repositories

```bash
helm repo add jenkins https://charts.jenkins.io
helm repo add longhorn https://charts.longhorn.io
helm repo add hashicorp https://helm.releases.hashicorp.com
helm repo update
```

---

# Install Longhorn

## Create Local Wrapper Chart

Directory:

```text
infrastructure/helm-charts/longhorn/
```

## Chart.yaml

```yaml
apiVersion: v2
name: longhorn-wrapper
description: Local Longhorn Wrapper Chart
type: application
version: 0.1.0

dependencies:
  - name: longhorn
    version: 1.10.1
    repository: https://charts.longhorn.io
```

## values.yaml

```yaml
defaultSettings:
  defaultDataPath: /var/lib/longhorn
  defaultReplicaCount: 1

service:
  ui:
    type: NodePort
    nodePort: 32100

persistence:
  defaultClass: true
  defaultClassReplicaCount: 1
```

## Download Dependencies

```bash
helm dependency update infrastructure/helm-charts/longhorn
```

## Deploy Longhorn

```bash
helm upgrade --install longhorn \
  infrastructure/helm-charts/longhorn \
  -n longhorn-system \
  --create-namespace
```

---

# Jenkins Namespace

```bash
kubectl create namespace ci-cd
```

---

# Jenkins Helm Wrapper

## Directory

```text
infrastructure/helm-charts/jenkins/
```

## Chart.yaml

```yaml
apiVersion: v2
name: jenkins-wrapper
description: Local Jenkins Wrapper Chart
type: application
version: 0.1.0

dependencies:
  - name: jenkins
    version: 5.9.18
    repository: https://charts.jenkins.io
```

## Download Dependencies

```bash
helm dependency update infrastructure/helm-charts/jenkins
```

---

# Jenkins values.yaml

## infrastructure/helm-charts/jenkins/values.yaml

```yaml
controller:
  containerEnv:
    - name: LANG
      value: C.UTF-8

  image:
    registry: docker.io
    repository: jenkins/jenkins
    tag: lts-jdk17

  admin:
    createSecret: true
    username: admin
    # password: generated automatically by Helm chart
    # store in Vault: vault kv put secret/jenkins/admin username=admin password=$(kubectl get secret -n ci-cd jenkins-admin -o jsonpath='{.data.jenkins-admin-password}' | base64 -d)

  serviceType: NodePort
  nodePort: 32000

  installPlugins:
    - kubernetes
    - kubernetes-cli
    - kubernetes-credentials
    - kubernetes-credentials-provider
    - git
    - git-client
    - github
    - github-branch-source
    - workflow-aggregator
    - workflow-job
    - workflow-multibranch
    - pipeline-model-definition
    - pipeline-stage-view
    - pipeline-utility-steps
    - docker-workflow
    - credentials
    - credentials-binding
    - plain-credentials
    - ssh-credentials
    - configuration-as-code
    - job-dsl
    - ansible
    - hashicorp-vault-plugin
    - hashicorp-vault-pipeline
    - dark-theme
    - theme-manager

  installLatestPlugins: false
  installLatestSpecifiedPlugins: false

  JCasC:
    defaultConfig: false
    overwriteConfiguration: true

    configScripts:
      system: |
        jenkins:
          systemMessage: "HomeLab Jenkins managed by Helm + JCasC"

      security: |
        jenkins:
          authorizationStrategy:
            loggedInUsersCanDoAnything:
              allowAnonymousRead: false

      vault: |
        unclassified:
          hashicorpVault:
            configuration:
              vaultUrl: "http://vault.vault.svc.cluster.local:8200"
              vaultCredentialId: "vault-token"
              engineVersion: 2

agent:
  enabled: true
  podRetention: Never

persistence:
  enabled: true
  storageClass: longhorn
  accessMode: ReadWriteOnce
  size: 20Gi

rbac:
  create: true
  readSecrets: false

serviceAccount:
  create: true
```

---

# Deploy Jenkins

```bash
helm upgrade --install jenkins \
  infrastructure/helm-charts/jenkins \
  -n ci-cd
```

---

# Validate Jenkins

## Check Pods

```bash
kubectl get pods -n ci-cd
```

## Check Logs

```bash
kubectl logs -n ci-cd jenkins-0 -c jenkins
```

## Access Jenkins

```text
http://NODE_IP:32000
```

---

# Jenkins Persistent Storage

Verify PVC:

```bash
kubectl get pvc -n ci-cd
```

Expected:

```text
jenkins
Bound
longhorn
```

---

# Jenkins JCasC Structure

```text
infrastructure/jenkins/jcasc/
├── security.yaml
├── system.yaml
└── vault.yaml
```

---

# Jenkins Groovy Scripts

```text
infrastructure/jenkins/groovy/
├── github.groovy
└── vault.groovy
```

---

# Jenkins Security Recommendations

## Avoid Hardcoded Secrets

Never store:

- GitHub tokens
- passwords
- API keys
- kubeconfigs
- certificates

inside:

- values.yaml
- Jenkinsfile
- Git repositories

Use Vault integration instead.

---

# GitHub Integration

## Recommended Authentication

Preferred:

- GitHub App
- SSH Deploy Keys

Temporary bootstrap:

- Personal Access Token

---

# Jenkins Kubernetes RBAC

Minimal permissions are recommended.

Avoid:

```yaml
cluster-admin
```

Prefer namespace-scoped RBAC.

---

# Troubleshooting

## CrashLoopBackOff

Check:

```bash
kubectl logs -n ci-cd jenkins-0 -c jenkins
```

Common causes:

- invalid JCasC
- missing plugins
- malformed YAML
- invalid credentials

---

## Plugin Issues

Validate plugin compatibility.

Avoid latest plugin auto-upgrades in production.

---

# Recommended Next Steps

- ArgoCD integration
- GitHub webhooks
- dynamic Jenkins agents
- External Secrets Operator
- ingress-nginx
- cert-manager
- TLS everywhere
- Vault Agent injection
- auto-unseal

---

