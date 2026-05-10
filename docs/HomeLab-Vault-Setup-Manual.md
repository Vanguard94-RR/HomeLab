# HomeLab Vault Complete Setup Manual

## Overview

This document describes the complete deployment and configuration of HashiCorp Vault inside the HomeLab Kubernetes platform.

The deployment includes:

- Kubernetes-native Vault deployment
- Helm-managed lifecycle
- Longhorn persistent storage
- Kubernetes authentication
- Jenkins integration
- KV v2 secret engine
- GitOps repository structure
- bootstrap automation

---

# Architecture

```text
Vault
  |
  +--> Kubernetes Auth
  +--> KV v2 Secrets
  +--> Jenkins Authentication
  +--> Longhorn Storage
```

---

# Vault Namespace

```bash
kubectl create namespace vault
```

---

# Vault Wrapper Chart

## Directory

```text
infrastructure/helm-charts/vault/
```

## Chart.yaml

```yaml
apiVersion: v2
name: vault-wrapper
description: Local Vault Wrapper Chart
type: application
version: 0.1.0

dependencies:
  - name: vault
    version: 0.31.0
    repository: https://helm.releases.hashicorp.com
```

---

# Vault values.yaml

## infrastructure/helm-charts/vault/values.yaml

```yaml
vault:
  server:
    dev:
      enabled: false

    standalone:
      enabled: true

      config: |
        ui = true

        listener "tcp" {
          tls_disable = 1
          address = "[::]:8200"
          cluster_address = "[::]:8201"
        }

        storage "file" {
          path = "/vault/data"
        }

        disable_mlock = true

    dataStorage:
      enabled: true
      size: 5Gi
      storageClass: longhorn

    service:
      enabled: true
      type: ClusterIP

    ingress:
      enabled: false

  injector:
    enabled: false
```

---

# Download Dependencies

```bash
helm dependency update infrastructure/helm-charts/vault
```

---

# Deploy Vault

```bash
helm upgrade --install vault \
  infrastructure/helm-charts/vault \
  -n vault \
  --create-namespace
```

---

# Validate Vault

```bash
kubectl get pods -n vault
```

Expected:

```text
vault-0   Running
```

---

# Check Vault Status

```bash
kubectl exec -it vault-0 -n vault -- vault status
```

Initial state:

```text
Initialized false
Sealed true
```

---

# Vault Bootstrap Automation

## Script Location

```text
scripts/bootstrap/bootstrap-vault.sh
```

## Features

The script performs:

- Vault initialization
- unseal
- root token storage
- Kubernetes auth enablement
- KV v2 enablement
- policy creation
- Jenkins role creation
- GitHub secret storage

---

# Bootstrap Script Execution

```bash
chmod +x scripts/bootstrap/bootstrap-vault.sh

./scripts/bootstrap/bootstrap-vault.sh
```

---

# Bootstrap Artifacts

Generated files:

```text
.vault-root-token
.vault-unseal-key
vault-init.txt
```

These files MUST NOT be committed to Git.

---

# Recommended .gitignore

```gitignore
.vault-root-token
.vault-unseal-key
vault-init.txt
backups/
**/charts/*.tgz
```

---

# Vault Policy

## infrastructure/policies/vault/jenkins-policy.hcl

```hcl
path "secret/data/jenkins/*" {
  capabilities = ["read"]
}
```

---

# Kubernetes Authentication

Vault uses:

```text
auth/kubernetes
```

Authentication flow:

```text
Jenkins ServiceAccount
        |
        v
Kubernetes JWT
        |
        v
Vault Kubernetes Auth
        |
        v
Vault Policy
        |
        v
Secrets Access
```

---

# Jenkins Vault Role

Created automatically:

```text
auth/kubernetes/role/jenkins
```

Bound objects:

```text
ServiceAccount: jenkins
Namespace: ci-cd
```

---

# Store GitHub Secret

```bash
vault kv put secret/jenkins/github \
  username=Vanguard94-RR \
  token=YOUR_GITHUB_TOKEN
```

---

# Validate Secret

```bash
vault kv get secret/jenkins/github
```

---

# Jenkins ↔ Vault Integration

Jenkins retrieves secrets dynamically from Vault.

Avoid:

- Kubernetes Secrets
- hardcoded tokens
- plaintext credentials

---

# Production Recommendations

## Recommended Future Improvements

### TLS

Enable TLS for:

- Vault
- Jenkins
- ingress

### Auto-Unseal

Recommended backends:

- AWS KMS
- Azure Key Vault
- GCP KMS
- HSM

### HA Mode

Use:

- Integrated Raft storage
- Multiple Vault replicas

### Secret Rotation

Implement:

- short-lived tokens
- dynamic credentials
- automatic rotation

---

# Troubleshooting

## Vault Sealed

```bash
vault operator unseal
```

---

## Kubernetes Auth Failure

Validate:

```bash
vault auth list
```

and:

```bash
vault read auth/kubernetes/config
```

---

## Policy Validation

```bash
vault policy read jenkins
```

---

# Security Recommendations

Avoid:

- storing root token in Git
- exposing Vault externally without TLS
- long-lived static credentials
- disabling RBAC

---

# Final Environment State

The HomeLab platform now includes:

- Kubernetes-native Jenkins
- Kubernetes-native Vault
- Longhorn persistent storage
- GitOps repository structure
- Helm wrapper charts
- bootstrap automation
- JCasC
- Vault policies
- GitHub integration
- secure secret storage

This architecture provides a strong foundation for:

- CI/CD
- GitOps
- platform engineering
- infrastructure automation
- Kubernetes operations
- secret management


