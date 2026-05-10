# HomeLab GitOps Platform Implementation Plan

## Objective

Transform the current HomeLab environment into a production-style GitOps platform with:

- Secure dynamic secret management
- Declarative infrastructure
- GitOps-based deployments
- Automated CI/CD pipelines
- Platform-level observability and security
- Reproducible cluster bootstrap and recovery

---

# Current State

The platform already includes:

- Kubernetes cluster
- Longhorn storage
- Vault
- Jenkins
- Helm wrapper charts
- JCasC
- GitHub integration
- Bootstrap scripts
- Internal registry
- Application Helm charts

Current repository structure already demonstrates good platform engineering foundations.

---

# Target Architecture

```text
Developer
   ↓
GitHub
   ↓
Webhook
   ↓
Jenkins CI
   ↓
Build/Test/Scan
   ↓
Container Registry
   ↓
GitOps Repository Update
   ↓
ArgoCD
   ↓
Kubernetes Cluster
```

Secrets flow:

```text
Vault
   ↓
External Secrets Operator
   ↓
Kubernetes Secrets
   ↓
Applications
```

---

# Phase 1 — Repository Refactor and Standardization

## Goal

Prepare the repository for scalable GitOps operations.

---

# Current Problems

Current structure mixes:

- infrastructure
- applications
- backups
- experiments
- generated artifacts

This will become difficult to maintain once ArgoCD reconciliation starts.

---

# Target Repository Layout

```text
homelab-gitops/
├── apps/
│   ├── homepage/
│   ├── calibreweb/
│   └── registry/
│
├── platform/
│   ├── argocd/
│   ├── vault/
│   ├── jenkins/
│   ├── eso/
│   ├── longhorn/
│   ├── ingress/
│   ├── monitoring/
│   └── security/
│
├── clusters/
│   └── homelab/
│       ├── bootstrap/
│       ├── platform/
│       └── apps/
│
├── charts/
│
├── scripts/
│
└── docs/
```

---

# Tasks

## Move Helm charts

```text
infrastructure/helm-charts/*
→ charts/
```

---

## Move Jenkins platform configuration

```text
infrastructure/jenkins/*
→ platform/jenkins/
```

---

## Move Vault policies and bootstrap scripts

```text
infrastructure/policies/vault/*
→ platform/vault/policies/

scripts/bootstrap/bootstrap-vault.sh
→ platform/vault/bootstrap/
```

---

## Remove backup artifacts from main repository

Move:

```text
backups/
```

to:

- separate archive repository
- storage bucket
- backup branch

---

# Deliverables

- Clean GitOps repository structure
- Platform/application separation
- Reduced configuration drift
- Improved ArgoCD compatibility

---

# Phase 2 — Vault Kubernetes Authentication

## Goal

Replace static Vault credentials with Kubernetes-native dynamic authentication.

---

# Architecture

```text
Jenkins Pod
   ↓
ServiceAccount JWT
   ↓
Vault Kubernetes Auth
   ↓
Short-lived Vault Token
   ↓
Dynamic Secrets
```

---

# Tasks

## Enable Kubernetes auth backend

```bash
vault auth enable kubernetes
```

---

## Configure Vault Kubernetes auth

```bash
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc:443" \
  token_reviewer_jwt="$TOKEN_REVIEW_JWT" \
  kubernetes_ca_cert=@ca.crt
```

---

## Create Jenkins ServiceAccount

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: jenkins
  namespace: ci-cd
```

---

## Create Vault policies

Example:

```hcl
path "kv/data/jenkins/*" {
  capabilities = ["read"]
}

path "kv/data/github/*" {
  capabilities = ["read"]
}
```

---

## Create Vault Kubernetes role

```bash
vault write auth/kubernetes/role/jenkins \
    bound_service_account_names=jenkins \
    bound_service_account_namespaces=ci-cd \
    policies=jenkins \
    ttl=1h
```

---

## Configure Jenkins Vault plugin

Required plugins:

- HashiCorp Vault Plugin
- HashiCorp Vault Pipeline Plugin

---

## Configure JCasC integration

Update:

```text
platform/jenkins/jcasc/vault.yaml
```

---

# Deliverables

- Dynamic Vault authentication
- No static Vault tokens
- Short-lived credentials
- Namespace-scoped access policies

---

# Phase 3 — External Secrets Operator (ESO)

## Goal

Centralize secret synchronization from Vault to Kubernetes.

---

# Architecture

```text
Vault
   ↓
ClusterSecretStore
   ↓
ExternalSecret
   ↓
Kubernetes Secret
   ↓
Application
```

---

# Tasks

## Install ESO using Helm

Official documentation:

https://external-secrets.io

---

## Create dedicated namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: external-secrets
```

---

## Configure ClusterSecretStore

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: "http://vault.vault.svc:8200"
      path: "kv"
      version: "v2"

      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "external-secrets"
          serviceAccountRef:
            name: external-secrets
            namespace: external-secrets
```

---

## Create Vault policy for ESO

```hcl
path "kv/data/apps/*" {
  capabilities = ["read"]
}
```

---

## Create ExternalSecret definitions

Example:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: github-token
spec:
  refreshInterval: 1h

  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore

  target:
    name: github-token

  data:
    - secretKey: token
      remoteRef:
        key: github/token
        property: value
```

---

## Refactor applications

Remove:

```yaml
env:
  PASSWORD: hardcoded
```

Replace with:

```yaml
envFrom:
  - secretRef:
      name: app-secret
```

---

# Deliverables

- Centralized secret management
- Automatic secret rotation
- Git-safe deployments
- Vault-integrated Kubernetes secrets

---

# Phase 4 — ArgoCD Deployment

## Goal

Implement declarative GitOps continuous delivery.

---

# Architecture

```text
Git Repository
   ↓
ArgoCD
   ↓
Kubernetes
```

---

# Tasks

## Install ArgoCD using Helm

Official documentation:

https://argo-cd.readthedocs.io

---

## Create ArgoCD project structure

```text
platform/argocd/
├── bootstrap/
├── applications/
├── projects/
└── repositories/
```

---

## Implement App-of-Apps pattern

```text
root-app
├── vault
├── eso
├── longhorn
├── jenkins
├── monitoring
└── applications
```

---

## Create root application

Example:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root-app
spec:
  source:
    repoURL: https://github.com/example/homelab-gitops
    path: clusters/homelab
```

---

## Configure automatic sync policies

```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

---

## Configure RBAC

Create:

- admin roles
- readonly roles
- CI integration roles

---

# Deliverables

- GitOps deployment model
- Drift detection
- Automated reconciliation
- Declarative platform management

---

# Phase 5 — CI/CD Pipeline Refactor

## Goal

Separate CI responsibilities from CD responsibilities.

---

# Required Conceptual Change

## Jenkins becomes:

- Build system
- Test system
- Security scanning system
- Artifact publishing system

## ArgoCD becomes:

- Deployment system
- Reconciliation engine
- Rollback manager

---

# New Pipeline Flow

```text
GitHub Push
   ↓
Jenkins
   ↓
Build
   ↓
Test
   ↓
Container Scan
   ↓
Push Image
   ↓
Update GitOps Manifest
   ↓
Commit to GitOps Repo
   ↓
ArgoCD Sync
```

---

# Tasks

## Remove direct deployments from Jenkins

Remove:

- kubectl apply
- helm upgrade
- direct cluster access

---

## Add image automation

Update:

```yaml
image:
  repository: registry.local/app
  tag: 1.0.5
```

automatically during pipeline execution.

---

## Add GitOps commit stage

Example:

```bash
git commit -am "Update homepage image to 1.0.5"
git push
```

---

# Deliverables

- Proper CI/CD separation
- Immutable deployment workflow
- Full GitOps compliance

---

# Phase 6 — GitHub Webhooks

## Goal

Automate pipeline execution and GitOps synchronization.

---

# Tasks

## Configure Jenkins webhook

GitHub events:

- push
- pull_request
- release

---

## Configure ArgoCD webhook

Allow immediate application refresh after GitOps repository updates.

---

## Secure external access

Recommended options:

- Cloudflare Tunnel
- Tailscale Funnel
- VPN-only access
- Reverse proxy with authentication

Do NOT expose Jenkins directly to the internet.

---

# Deliverables

- Automated CI/CD execution
- Faster synchronization
- Secure external integrations

---

# Phase 7 — Platform Security and Hardening

## Goal

Increase platform resilience and security posture.

---

# Components

## cert-manager

Purpose:

- TLS automation
- wildcard certificates
- internal PKI

Official documentation:

https://cert-manager.io

---

## Ingress Controller

Recommended:

- Traefik
- NGINX Ingress

---

## Policy Enforcement

Recommended:

- Kyverno

Official documentation:

https://kyverno.io

---

## Runtime Security

Recommended:

- Falco

Official documentation:

https://falco.org

---

## Image Scanning

Recommended:

- Trivy Operator

Official documentation:

https://aquasecurity.github.io/trivy-operator

---

# Deliverables

- TLS-enabled platform
- Policy enforcement
- Runtime threat detection
- Vulnerability scanning

---

# Phase 8 — Observability Stack

## Goal

Implement centralized monitoring and logging.

---

# Recommended Stack

```text
Prometheus → Metrics
Grafana   → Dashboards
Loki      → Logs
Tempo     → Traces
```

---

# Tasks

## Install Prometheus stack

Recommended:

- kube-prometheus-stack

---

## Configure Grafana dashboards

Include:

- Kubernetes cluster
- Longhorn
- Vault
- Jenkins
- ArgoCD

---

## Configure Loki log aggregation

Collect:

- container logs
- ingress logs
- audit logs

---

# Deliverables

- Centralized observability
- Platform monitoring
- Operational dashboards

---

# Phase 9 — Disaster Recovery and Backup Strategy

## Goal

Ensure cluster recoverability.

---

# Tasks

## Backup Vault

- Raft snapshots
- encrypted storage
- scheduled exports

---

## Backup Longhorn volumes

- recurring snapshots
- offsite backup target

---

## Backup GitOps repositories

- mirrored repositories
- scheduled archive jobs

---

# Deliverables

- Cluster recovery capability
- Platform resilience
- Data protection

---

# Recommended Timeline

| Week | Focus |
|---|---|
| 1 | Repository refactor |
| 2 | Vault Kubernetes auth |
| 3 | External Secrets Operator |
| 4 | ArgoCD bootstrap |
| 5 | CI/CD refactor |
| 6 | GitHub webhooks |
| 7 | cert-manager + ingress |
| 8 | Security stack |
| 9 | Observability |
| 10 | Backup and disaster recovery |

---

# Phase 1 Execution Runbook — Repository Refactor and GitOps Foundation

## Objective

Prepare the repository for ArgoCD-based reconciliation and GitOps operations.

This phase focuses on:

- repository cleanup
- directory normalization
- platform/application separation
- future ArgoCD compatibility
- removal of legacy structure debt

---

# Step 1 — Create New Directory Structure

Execute:

```bash
mkdir -p platform/{argocd,vault,jenkins,eso,longhorn,monitoring,security,ingress}
mkdir -p clusters/homelab/{bootstrap,platform,apps}
mkdir -p charts
```

---

# Step 2 — Move Existing Helm Wrapper Charts

Current:

```text
infrastructure/helm-charts/
```

Target:

```text
charts/
```

Execute:

```bash
mv infrastructure/helm-charts/* charts/
```

Expected result:

```text
charts/
├── homepage/
├── calibreweb/
├── jenkins/
├── longhorn/
└── vault/
```

---

# Step 3 — Move Jenkins Platform Configuration

Current:

```text
infrastructure/jenkins/
```

Target:

```text
platform/jenkins/
```

Execute:

```bash
mv infrastructure/jenkins/* platform/jenkins/
```

Expected structure:

```text
platform/jenkins/
├── groovy/
├── jcasc/
└── jobs/
```

---

# Step 4 — Move Vault Policies and Bootstrap Assets

Create directories:

```bash
mkdir -p platform/vault/{bootstrap,policies}
```

Move policies:

```bash
mv infrastructure/policies/vault/* platform/vault/policies/
```

Move bootstrap:

```bash
mv scripts/bootstrap/bootstrap-vault.sh platform/vault/bootstrap/
```

---

# Step 5 — Prepare ArgoCD Structure

Create:

```bash
mkdir -p platform/argocd/{applications,bootstrap,projects,repositories}
```

Create root application directory:

```bash
mkdir -p clusters/homelab/bootstrap
```

---

# Step 6 — Remove Legacy Backup Artifacts

Current:

```text
backups/
```

Recommended action:

- move to separate repository
- or archive branch
- or compressed storage

Example:

```bash
mkdir -p ../homelab-archive
mv backups ../homelab-archive/
```

---

# Step 7 — Validate Repository Layout

Final expected structure:

```text
homelab-gitops/
├── apps/
├── charts/
├── clusters/
├── platform/
├── scripts/
└── docs/
```

---

# Step 8 — Git Commit

Execute:

```bash
git checkout -b refactor/gitops-layout

git add .

git commit -m "refactor: standardize gitops repository structure"
```

---

# Validation Checklist

## Repository

- [ ] charts moved successfully
- [ ] platform configs separated
- [ ] vault policies centralized
- [ ] backups removed
- [ ] directory structure normalized

## Jenkins

- [ ] JCasC files preserved
- [ ] Groovy scripts preserved
- [ ] Jobs preserved

## Vault

- [ ] policies preserved
- [ ] bootstrap scripts preserved

---

# Exit Criteria

Phase 1 is complete when:

- repository structure is normalized
- no infrastructure assets remain under legacy paths
- backups are removed from GitOps repo
- git commit completed successfully
- repository is ready for ArgoCD onboarding

---

# Next Phase

After Phase 1:

Proceed to:

# Phase 2 — Vault Kubernetes Authentication

This includes:

- Kubernetes auth backend
- Jenkins ServiceAccount auth
- Vault policies
- short-lived credentials
- Jenkins dynamic secret retrieval

---

# Final Recommended End State

The platform should ultimately provide:

- Fully declarative infrastructure
- GitOps-managed deployments
- Dynamic secret management
- Automated CI/CD pipelines
- Secure Kubernetes operations
- Centralized observability
- Disaster recovery capability
- Reproducible cluster bootstrap
- Scalable platform architecture


