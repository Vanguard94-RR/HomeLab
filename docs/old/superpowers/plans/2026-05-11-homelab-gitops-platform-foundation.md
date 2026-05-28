# HomeLab GitOps Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the GitOps platform foundation before app delivery work.

**Architecture:** ArgoCD owns deployment through projects and app-of-apps. Jenkins remains CI-only and uses repo-managed chart values/JCasC without committed secrets. Vault bootstrap remains imperative but idempotent and aligned with declarative RBAC.

**Tech Stack:** Kubernetes, ArgoCD Applications/AppProjects, Jenkins Helm chart, Jenkins JCasC, Vault, Bash, Kustomize, ShellCheck, yq.

---

## File Structure

- Modify `.gitignore`: ignore local key files and `docs/superpowers/`.
- Modify `workloads/calibreweb/config/.key` Git index only: untrack while leaving local file intact.
- Create `scripts/validate-gitops.sh`: single local validation entrypoint.
- Modify `platform/vault/bootstrap/bootstrap-vault.sh`: fix ShellCheck findings and keep Vault auth paths aligned.
- Modify `scripts/deploy.sh`: fix ShellCheck findings while preserving legacy behavior.
- Create `clusters/homelab/platform/projects.yaml`: ArgoCD AppProjects for platform and workloads.
- Modify `clusters/homelab/platform/kustomization.yaml`: include projects.
- Modify `clusters/homelab/platform/*.yaml`: assign platform apps to `platform` project and set sync waves.
- Modify `clusters/homelab/workloads/*.yaml`: assign workload apps to `workloads` project and set sync waves.
- Create `platform/jenkins/values.yaml`: owned Jenkins Helm values.
- Modify `clusters/homelab/platform/jenkins-app.yaml`: use repo values file.
- Delete or archive `platform/jenkins/application.yaml`: remove duplicate Jenkins ArgoCD app source.
- Modify `platform/jenkins/jcasc/security.yaml`: remove hardcoded admin password.
- Modify `platform/jenkins/jcasc/vault.yaml`: remove committed static Vault token placeholder.
- Modify `platform/jenkins/jobs/seed.groovy`: fix Jenkinsfile path.
- Modify `README.md` and `clusters/homelab/README.md`: document foundation workflow and validation.

---

### Task 1: Secret Hygiene

**Files:**
- Modify: `.gitignore`
- Git index only: `workloads/calibreweb/config/.key`

- [ ] **Step 1: Confirm tracked secret-like files**

Run:

```bash
git ls-files | rg '(^|/)(\.vault|\.GitHubToken|.*\.key$|.*token.*|secret.*\.ya?ml$)'
```

Expected current output includes:

```text
workloads/calibreweb/config/.key
```

- [ ] **Step 2: Add ignore rules**

Edit `.gitignore` so it includes these lines exactly once:

```gitignore
docs/superpowers/
*.key
*.token
.GitHubToken
.vault-*
```

Keep existing secret rules. Remove duplicate `docs/superpowers/*` if present and replace it with `docs/superpowers/`.

- [ ] **Step 3: Untrack CalibreWeb key without deleting local file**

Run:

```bash
git rm --cached workloads/calibreweb/config/.key
```

Expected:

```text
rm 'workloads/calibreweb/config/.key'
```

- [ ] **Step 4: Verify key remains local and ignored**

Run:

```bash
test -f workloads/calibreweb/config/.key
git check-ignore -v --no-index workloads/calibreweb/config/.key
git ls-files workloads/calibreweb/config/.key
```

Expected:

```text
.gitignore:<line>:*.key	workloads/calibreweb/config/.key
```

`git ls-files` should print nothing.

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git add -u workloads/calibreweb/config/.key
git commit -m "chore(secrets): untrack local calibreweb key"
```

---

### Task 2: Validation Script

**Files:**
- Create: `scripts/validate-gitops.sh`

- [ ] **Step 1: Create validation script**

Create `scripts/validate-gitops.sh`:

```bash
#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "== Secret hygiene =="
if git ls-files | rg '(^|/)(\.vault|\.GitHubToken|.*\.key$|.*token.*|secret.*\.ya?ml$)'; then
  echo "Tracked secret-like files found"
  exit 1
fi

echo "== YAML parse =="
yq '.' \
  clusters/homelab/kustomization.yaml \
  clusters/homelab/argocd/root-app.yaml \
  clusters/homelab/platform/kustomization.yaml \
  clusters/homelab/workloads/kustomization.yaml \
  >/dev/null

echo "== Kustomize render =="
kubectl kustomize clusters/homelab >/tmp/homelab-rendered.yaml
kubectl kustomize clusters/homelab/platform/eso-config >/tmp/homelab-eso-config-rendered.yaml

echo "== ShellCheck =="
shellcheck \
  platform/vault/bootstrap/bootstrap-vault.sh \
  scripts/deploy.sh \
  scripts/deploy-homepage.sh \
  workloads/registry/deploy.sh

if command -v helm >/dev/null 2>&1; then
  echo "== Helm render =="
  helm template homepage helm/custom/homepage -f helm/custom/homepage/environments/prod/values.yaml >/tmp/homepage-rendered.yaml
  helm template calibreweb helm/custom/calibreweb >/tmp/calibreweb-rendered.yaml
else
  echo "== Helm render skipped: helm not installed =="
fi

echo "Validation passed"
```

- [ ] **Step 2: Make executable**

Run:

```bash
chmod +x scripts/validate-gitops.sh
```

- [ ] **Step 3: Run validation and observe expected initial failure**

Run:

```bash
scripts/validate-gitops.sh
```

Expected before Task 3:

```text
ShellCheck
```

Then ShellCheck reports quoting/read findings in `platform/vault/bootstrap/bootstrap-vault.sh` and `scripts/deploy.sh`.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-gitops.sh
git commit -m "ci: add gitops validation script"
```

---

### Task 3: ShellCheck Fixes

**Files:**
- Modify: `platform/vault/bootstrap/bootstrap-vault.sh`
- Modify: `scripts/deploy.sh`

- [ ] **Step 1: Fix Vault bootstrap quoting**

In `platform/vault/bootstrap/bootstrap-vault.sh`, change:

```bash
vault operator unseal ${UNSEAL_KEY}
```

to:

```bash
vault operator unseal "${UNSEAL_KEY}"
```

Change:

```bash
vault login ${ROOT_TOKEN}
```

to:

```bash
vault login "${ROOT_TOKEN}"
```

Change:

```bash
read -s -p "GitHub Token: " GITHUB_TOKEN
```

to:

```bash
read -r -s -p "GitHub Token: " GITHUB_TOKEN
```

- [ ] **Step 2: Fix deploy script quoting**

In `scripts/deploy.sh`, change:

```bash
docker build -t ${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER} .
docker tag ${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER} ${REGISTRY}/${IMAGE_NAME}:latest
docker push ${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER}
```

to:

```bash
docker build -t "${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER}" .
docker tag "${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER}" "${REGISTRY}/${IMAGE_NAME}:latest"
docker push "${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER}"
```

- [ ] **Step 3: Run ShellCheck**

Run:

```bash
shellcheck platform/vault/bootstrap/bootstrap-vault.sh scripts/deploy.sh scripts/deploy-homepage.sh workloads/registry/deploy.sh
```

Expected:

```text
```

No output and exit code `0`.

- [ ] **Step 4: Run validation**

Run:

```bash
scripts/validate-gitops.sh
```

Expected:

```text
Validation passed
```

`kubectl` may print gcloud credential warnings in this environment while still rendering Kustomize output.

- [ ] **Step 5: Commit**

```bash
git add platform/vault/bootstrap/bootstrap-vault.sh scripts/deploy.sh
git commit -m "chore: fix shellcheck findings"
```

---

### Task 4: ArgoCD Projects

**Files:**
- Create: `clusters/homelab/platform/projects.yaml`
- Modify: `clusters/homelab/platform/kustomization.yaml`

- [ ] **Step 1: Create AppProjects**

Create `clusters/homelab/platform/projects.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: platform
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "-10"
spec:
  description: HomeLab platform services
  sourceRepos:
    - https://github.com/Vanguard94-RR/HomeLab.git
    - https://charts.jenkins.io
    - https://charts.external-secrets.io
  destinations:
    - server: https://kubernetes.default.svc
      namespace: argocd
    - server: https://kubernetes.default.svc
      namespace: ci-cd
    - server: https://kubernetes.default.svc
      namespace: external-secrets
    - server: https://kubernetes.default.svc
      namespace: vault
  clusterResourceWhitelist:
    - group: "*"
      kind: "*"
  namespaceResourceWhitelist:
    - group: "*"
      kind: "*"
---
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: workloads
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "-10"
spec:
  description: HomeLab workload applications
  sourceRepos:
    - https://github.com/Vanguard94-RR/HomeLab.git
  destinations:
    - server: https://kubernetes.default.svc
      namespace: homepage
    - server: https://kubernetes.default.svc
      namespace: calibreweb
    - server: https://kubernetes.default.svc
      namespace: docker-registry
  clusterResourceWhitelist:
    - group: ""
      kind: Namespace
  namespaceResourceWhitelist:
    - group: "*"
      kind: "*"
```

- [ ] **Step 2: Include projects in platform Kustomization**

Edit `clusters/homelab/platform/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - projects.yaml
  - eso-app.yaml
  - eso-config-app.yaml
  - jenkins-app.yaml
  - vault-auth-rbac.yaml
```

- [ ] **Step 3: Render root**

Run:

```bash
kubectl kustomize clusters/homelab | yq '.kind' | head
```

Expected output includes:

```text
AppProject
```

- [ ] **Step 4: Commit**

```bash
git add clusters/homelab/platform/projects.yaml clusters/homelab/platform/kustomization.yaml
git commit -m "feat(argocd): add platform and workload projects"
```

---

### Task 5: Assign Apps To Projects And Sync Waves

**Files:**
- Modify: `clusters/homelab/platform/eso-app.yaml`
- Modify: `clusters/homelab/platform/eso-config-app.yaml`
- Modify: `clusters/homelab/platform/jenkins-app.yaml`
- Modify: `clusters/homelab/workloads/homepage-app.yaml`
- Modify: `clusters/homelab/workloads/calibreweb-app.yaml`
- Modify: `clusters/homelab/workloads/registry-app.yaml`

- [ ] **Step 1: Platform apps use platform project**

In `clusters/homelab/platform/eso-app.yaml`, keep existing sync-wave `"0"` and set:

```yaml
spec:
  project: platform
```

In `clusters/homelab/platform/eso-config-app.yaml`, keep existing sync-wave `"1"` and set:

```yaml
spec:
  project: platform
```

In `clusters/homelab/platform/jenkins-app.yaml`, add metadata annotation and project:

```yaml
metadata:
  name: jenkins
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "1"
spec:
  project: platform
```

- [ ] **Step 2: Workload apps use workloads project**

In each workload app under `clusters/homelab/workloads/*.yaml`, set:

```yaml
spec:
  project: workloads
```

Add this annotation to each workload app:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "10"
```

- [ ] **Step 3: Verify no app remains in default project**

Run:

```bash
rg -n "project: default" clusters/homelab
```

Expected:

```text
```

No output.

- [ ] **Step 4: Render root**

Run:

```bash
kubectl kustomize clusters/homelab >/tmp/homelab-rendered.yaml
yq 'select(.kind == "Application") | .metadata.name + ":" + .spec.project' /tmp/homelab-rendered.yaml
```

Expected includes:

```text
external-secrets:platform
external-secrets-config:platform
jenkins:platform
homepage:workloads
calibreweb:workloads
registry:workloads
```

- [ ] **Step 5: Commit**

```bash
git add clusters/homelab/platform/*.yaml clusters/homelab/workloads/*.yaml
git commit -m "feat(argocd): assign apps to projects"
```

---

### Task 6: Jenkins Single Source Of Truth

**Files:**
- Create: `platform/jenkins/values.yaml`
- Modify: `clusters/homelab/platform/jenkins-app.yaml`
- Delete: `platform/jenkins/application.yaml`

- [ ] **Step 1: Create Jenkins values file**

Create `platform/jenkins/values.yaml`:

```yaml
controller:
  serviceAccount:
    create: true
    name: jenkins

  JCasC:
    enabled: true
    defaultConfig: false
    configScripts:
      system: |
        jenkins:
          systemMessage: "HomeLab Jenkins"
          numExecutors: 2
          mode: NORMAL
      security: |
        jenkins:
          authorizationStrategy:
            loggedInUsersCanDoAnything:
              allowAnonymousRead: false
      appearance: |
        appearance:
          themeManager:
            disableUserThemes: true
            theme: "darkSystem"
      vault: |
        unclassified:
          hashicorpVault:
            configuration:
              vaultUrl: "http://vault.vault.svc.cluster.local:8200"
              engineVersion: 2

  installPlugins:
    - kubernetes:4306.vc91e951ea_eb_d
    - workflow-aggregator:608.v67378e9d3db_1
    - git:5.7.0
    - configuration-as-code:1932.v75cb_b_f1b_698d
    - job-dsl:1.93
    - github:1.43.0
    - github-branch-source:1815.v9152b_2ff7a_1b_
    - pipeline-stage-view:2.38
    - pipeline-utility-steps:2.18.0
    - docker-workflow:634.vedc7242b_eda_7
    - credentials:1447.v4cb_b_539b_5321
    - credentials-binding:687.v619cb_15e923f
    - plain-credentials:195.vb_906e9073dee
    - ssh-credentials:355.v9b_e5b_cde5003
    - hashicorp-vault-plugin:371.v884a_4dd60fb_6
    - hashicorp-vault-pipeline:1.4
    - dark-theme:524.vd675b_22b_30cb_
    - theme-manager:278.v2e3c063e42cc
```

- [ ] **Step 2: Point ArgoCD Jenkins app at repo values**

Edit `clusters/homelab/platform/jenkins-app.yaml` source:

```yaml
source:
  repoURL: https://charts.jenkins.io
  chart: jenkins
  targetRevision: 5.8.110
  helm:
    valueFiles:
      - https://raw.githubusercontent.com/Vanguard94-RR/HomeLab/main/platform/jenkins/values.yaml
```

- [ ] **Step 3: Remove duplicate Jenkins app manifest**

Run:

```bash
git rm platform/jenkins/application.yaml
```

- [ ] **Step 4: Verify only one Jenkins Application**

Run:

```bash
rg -n "name: jenkins|chart: jenkins" clusters platform
```

Expected app source only in:

```text
clusters/homelab/platform/jenkins-app.yaml
```

Jenkins config files under `platform/jenkins` may still mention Jenkins.

- [ ] **Step 5: Commit**

```bash
git add platform/jenkins/values.yaml clusters/homelab/platform/jenkins-app.yaml
git add -u platform/jenkins/application.yaml
git commit -m "refactor(jenkins): centralize helm values"
```

---

### Task 7: Jenkins Configuration Cleanup

**Files:**
- Modify: `platform/jenkins/jcasc/security.yaml`
- Modify: `platform/jenkins/jcasc/vault.yaml`
- Modify: `platform/jenkins/jobs/seed.groovy`
- Modify: `platform/jenkins/values.yaml`

- [ ] **Step 1: Remove hardcoded admin password from legacy JCasC file**

Edit `platform/jenkins/jcasc/security.yaml` to:

```yaml
jenkins:
  authorizationStrategy:
    loggedInUsersCanDoAnything:
      allowAnonymousRead: false
```

- [ ] **Step 2: Remove static Vault token placeholder from legacy JCasC file**

Edit `platform/jenkins/jcasc/vault.yaml` to:

```yaml
unclassified:
  hashicorpVault:
    configuration:
      vaultUrl: "http://vault.vault.svc.cluster.local:8200"
      engineVersion: 2
```

- [ ] **Step 3: Fix seed job Jenkinsfile path**

In `platform/jenkins/jobs/seed.groovy`, change:

```groovy
scriptPath('apps/homepage/Jenkinsfile')
```

to:

```groovy
scriptPath('workloads/homepage/Jenkinsfile')
```

- [ ] **Step 4: Mirror seed path in Jenkins values if seed job is injected later**

No seed job injection exists in `platform/jenkins/values.yaml` yet. Do not add it in this milestone. Keep seed file correct for future wiring.

- [ ] **Step 5: Verify risky strings are gone from platform config**

Run:

```bash
rg -n "admin123|REPLACE_WITH_REAL_VAULT_TOKEN|apps/homepage/Jenkinsfile" platform/jenkins
```

Expected:

```text
```

No output.

- [ ] **Step 6: Commit**

```bash
git add platform/jenkins/jcasc/security.yaml platform/jenkins/jcasc/vault.yaml platform/jenkins/jobs/seed.groovy platform/jenkins/values.yaml
git commit -m "chore(jenkins): remove committed bootstrap secrets"
```

---

### Task 8: Vault Bootstrap Alignment

**Files:**
- Modify: `platform/vault/bootstrap/bootstrap-vault.sh`
- Modify: `platform/vault/policies/jenkins-policy.hcl`

- [ ] **Step 1: Align Jenkins policy with actual secret path used by pipeline**

Current Homepage Jenkinsfile reads `secret/github`, while bootstrap writes `secret/jenkins/github`. Pick one path. For platform foundation, use `secret/jenkins/github`.

Edit `platform/vault/policies/jenkins-policy.hcl`:

```hcl
path "secret/data/jenkins/*" {
  capabilities = ["read"]
}

path "secret/data/homelab/*" {
  capabilities = ["read"]
}
```

- [ ] **Step 2: Add existence check before token reviewer login**

In `platform/vault/bootstrap/bootstrap-vault.sh`, before:

```bash
TOKEN_REVIEW_JWT=$(kubectl create token vault-token-reviewer -n vault)
```

add:

```bash
kubectl get serviceaccount vault-token-reviewer -n vault >/dev/null
```

- [ ] **Step 3: Verify script syntax**

Run:

```bash
bash -n platform/vault/bootstrap/bootstrap-vault.sh
```

Expected:

```text
```

No output.

- [ ] **Step 4: Commit**

```bash
git add platform/vault/bootstrap/bootstrap-vault.sh platform/vault/policies/jenkins-policy.hcl
git commit -m "fix(vault): align bootstrap policy paths"
```

---

### Task 9: Documentation Refresh

**Files:**
- Modify: `README.md`
- Modify: `clusters/homelab/README.md`

- [ ] **Step 1: Replace outdated root README structure**

Update `README.md` to:

```markdown
# HomeLab

GitOps HomeLab platform based on Kubernetes, ArgoCD, Jenkins, Vault, External Secrets Operator, Helm, Longhorn, and an internal registry.

## Repository Layout

- `clusters/homelab/`: ArgoCD root, platform apps, workload apps
- `platform/`: platform configuration for Jenkins, Vault, ESO, ArgoCD
- `helm/custom/`: internally maintained Helm charts
- `workloads/`: workload source/configuration and legacy operational docs
- `scripts/`: local validation and legacy helper scripts
- `docs/`: architecture, operations, and implementation notes

## Delivery Model

Jenkins builds, tests, scans, pushes images, and commits GitOps state. ArgoCD deploys and reconciles Kubernetes resources. Jenkins must not run direct `helm upgrade` or `kubectl apply` in the stable delivery path.

## Bootstrap

```bash
kubectl apply -f clusters/homelab/argocd/root-app.yaml
```

## Validate

```bash
scripts/validate-gitops.sh
```

## Current Milestones

1. Platform foundation
2. Homepage GitOps delivery
3. ESO secrets adoption
4. Ingress/TLS
5. Observability
6. Security and backup/DR
```

- [ ] **Step 2: Update cluster README with project model**

Add this section to `clusters/homelab/README.md`:

```markdown
## ArgoCD Projects

- `platform`: Jenkins, ESO, Vault auth RBAC, and future platform services.
- `workloads`: Homepage, CalibreWeb, and registry.

Platform resources sync before workloads. Workloads should depend only on committed GitOps state and platform services already reconciled by ArgoCD.
```

- [ ] **Step 3: Verify docs mention no old `apps/` root**

Run:

```bash
rg -n "apps/homepage|infrastructure/|Helm-Charts" README.md clusters/homelab/README.md platform/jenkins/jobs/seed.groovy
```

Expected:

```text
```

No output.

- [ ] **Step 4: Commit**

```bash
git add README.md clusters/homelab/README.md
git commit -m "docs: refresh gitops platform foundation docs"
```

---

### Task 10: Final Foundation Verification

**Files:**
- No file changes expected.

- [ ] **Step 1: Run full validation**

Run:

```bash
scripts/validate-gitops.sh
```

Expected:

```text
Validation passed
```

- [ ] **Step 2: Verify clean app project assignment**

Run:

```bash
kubectl kustomize clusters/homelab >/tmp/homelab-rendered.yaml
yq 'select(.kind == "Application") | .metadata.name + ":" + .spec.project' /tmp/homelab-rendered.yaml | sort
```

Expected:

```text
calibreweb:workloads
external-secrets-config:platform
external-secrets:platform
homepage:workloads
jenkins:platform
registry:workloads
```

- [ ] **Step 3: Verify no known risky strings remain**

Run:

```bash
rg -n "admin123|REPLACE_WITH_REAL_VAULT_TOKEN|apps/homepage/Jenkinsfile" .
```

Expected remaining matches only in historical docs if any. If matches appear in active config under `platform/`, `clusters/`, `helm/`, or `workloads/*/Jenkinsfile`, fix before continuing.

- [ ] **Step 4: Verify working tree**

Run:

```bash
git status --short
```

Expected:

```text
```

No output.

---

## Self-Review

Spec coverage:

- Repo safety is covered by Task 1.
- Validation is covered by Tasks 2, 3, and 10.
- ArgoCD projects and app assignment are covered by Tasks 4 and 5.
- Jenkins single source of truth and secret cleanup are covered by Tasks 6 and 7.
- Vault bootstrap/policy alignment is covered by Task 8.
- Documentation refresh is covered by Task 9.

Scope:

- This plan intentionally covers only Milestone 1: Platform Foundation.
- Homepage GitOps delivery and ESO app secret adoption require separate plans after this foundation is complete.

Placeholder scan:

- No placeholder markers remain.
- Each task has exact files, commands, expected outputs, and commit messages.
