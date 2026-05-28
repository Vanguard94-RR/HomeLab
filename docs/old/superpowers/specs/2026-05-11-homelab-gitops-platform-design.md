# HomeLab GitOps Platform Design

Date: 2026-05-11

## Purpose

Stabilize the HomeLab GitOps platform in three milestones. The platform should use Git as the source of truth, Jenkins for CI only, ArgoCD for deployment, Vault for secret authority, and External Secrets Operator for Kubernetes secret synchronization.

## Current Repository State

The repository already includes:

- ArgoCD root application at `clusters/homelab/argocd/root-app.yaml`.
- App-of-apps structure under `clusters/homelab/platform` and `clusters/homelab/workloads`.
- Platform applications for Jenkins and External Secrets Operator.
- Vault bootstrap script and Vault policies under `platform/vault`.
- Helm charts for `homepage` and `calibreweb`.
- Raw Kubernetes manifests for the private registry.

Important gaps remain:

- `workloads/calibreweb/config/.key` is tracked and looks secret-like.
- Jenkins JCasC contains a hardcoded admin password and static Vault token placeholder.
- Jenkins seed job points to `apps/homepage/Jenkinsfile`, but the repo uses `workloads/homepage/Jenkinsfile`.
- Jenkinsfiles and legacy scripts still run direct `helm upgrade` and `kubectl` deployment commands.
- Application charts still use `latest` tags, NodePorts, hardcoded namespaces, and incomplete secret/config patterns.

## Target Architecture

```text
GitHub repo
  -> Jenkins CI builds/tests/images
  -> Registry stores immutable image tags
  -> Jenkins commits Helm value tag change
  -> ArgoCD reconciles cluster
  -> ESO syncs secrets from Vault to Kubernetes
```

Jenkins must not deploy directly to Kubernetes. Jenkins builds, tests, scans, pushes images, and commits GitOps state. ArgoCD is the only deployment and reconciliation engine.

## Repository Ownership

```text
clusters/homelab/
  argocd/      bootstrap root application only
  platform/    ArgoCD platform apps and cluster-level platform config
  workloads/   ArgoCD workload apps

platform/
  argocd/      projects, RBAC, repositories
  jenkins/     chart values, JCasC, seed jobs
  vault/       policies, bootstrap, auth roles
  eso/         reusable ExternalSecret patterns

helm/custom/
  homepage/
  calibreweb/

workloads/
  app source, runtime config, legacy docs; no direct deploy authority
```

## Milestone 1: Platform Foundation

Goal: the cluster can reconcile platform resources safely and predictably.

Deliverables:

- Add ArgoCD `AppProject`s for `platform` and `workloads`.
- Assign platform apps and workload apps to the correct projects.
- Add sync waves so platform primitives reconcile before dependent workload resources.
- Keep one source of truth for each ArgoCD application. Avoid duplicated Jenkins app definitions.
- Move Jenkins Helm values to a versioned file or clearly owned ArgoCD app manifest.
- Remove hardcoded Jenkins admin password and static Vault token placeholder from JCasC.
- Ensure Vault bootstrap paths, policies, and roles match actual repo and cluster objects.
- Add a repo validation script covering Kustomize, YAML parsing, ShellCheck, and optional Helm checks.
- Untrack and ignore secret-like local files such as `workloads/calibreweb/config/.key`.

## Milestone 2: Homepage GitOps Delivery

Goal: make Homepage the first fully GitOps-delivered application.

Deliverables:

- Fix the Homepage chart so config files are rendered as ConfigMaps or mounted from declared existing ConfigMaps.
- Replace `latest` deployment flow with immutable image tags.
- Update the Jenkins Homepage pipeline to build, test, push, and commit the image tag into `helm/custom/homepage/environments/prod/values.yaml`.
- Remove direct `helm upgrade` and `kubectl apply` from the active Homepage pipeline.
- Let ArgoCD deploy Homepage from Git state only.

## Milestone 3: ESO Secrets Adoption

Goal: app secrets come from Vault through External Secrets Operator.

Deliverables:

- Add ExternalSecret examples for Jenkins GitHub token and app secrets.
- Add `envFrom` and explicit secret reference support to application charts.
- Align Vault policy paths with ESO remote references.
- Document secret bootstrap, rotation, and failure recovery.

## Risks And Required Fixes

Critical:

- Tracked `workloads/calibreweb/config/.key` must be removed from Git index and ignored.
- Jenkins JCasC must not contain `admin123` as a stable platform password.
- Jenkins Vault integration must not use a committed static token placeholder.

High:

- Jenkins seed job path must change from `apps/homepage/Jenkinsfile` to `workloads/homepage/Jenkinsfile`.
- Active CI pipelines must stop deploying directly to Kubernetes.
- Homepage chart values mention external config maps, but templates do not mount them yet.
- CalibreWeb chart depends on hostPath `/DATA/Biblioteca` and node `t430`; this is acceptable only if documented as a single-node data dependency or replaced by Longhorn-backed storage.

Medium:

- `latest` tags reduce GitOps traceability and rollback quality.
- NodePorts are acceptable for the MVP but should be replaced or fronted by ingress/TLS later.
- Validation tooling is incomplete because `helm`, `argocd`, and `kubeconform` are not available locally.

## Testing And Validation

Static checks:

```bash
git status --short
git ls-files | rg '(^|/)(\.vault|\.GitHubToken|.*\.key$|.*token.*|secret.*\.ya?ml$)'
yq '.' <changed-yaml-files>
kubectl kustomize clusters/homelab
kubectl kustomize clusters/homelab/platform/eso-config
shellcheck platform/vault/bootstrap/bootstrap-vault.sh scripts/*.sh workloads/registry/deploy.sh
```

Optional checks when tools are installed:

```bash
helm template homepage helm/custom/homepage -f helm/custom/homepage/environments/prod/values.yaml
helm template calibreweb helm/custom/calibreweb
kubeconform <rendered-manifests>
argocd app diff <app-name>
```

Cluster checks:

- ArgoCD root app is synced and healthy.
- Platform apps are synced before workload apps.
- External Secrets Operator CRDs exist.
- `ClusterSecretStore/vault-backend` is ready.
- Jenkins controller pod uses the `jenkins` ServiceAccount.
- Vault Kubernetes auth login succeeds for Jenkins and ESO ServiceAccounts.
- Homepage deployed image tag matches Git state.

## Implementation Phases

Phase 1: repo safety and validation.

- Ignore and untrack `.key` files that are local secrets.
- Add `scripts/validate-gitops.sh`.
- Fix ShellCheck findings.
- Refresh README to reflect current layout and GitOps workflow.

Phase 2: ArgoCD foundation.

- Add ArgoCD projects and RBAC.
- Assign apps to projects.
- Add sync waves.
- Choose one Jenkins ArgoCD application source of truth.

Phase 3: Jenkins foundation.

- Move or normalize Jenkins Helm values.
- Remove hardcoded admin and static Vault token from JCasC.
- Fix seed job path.
- Document CI-only Jenkins contract.

Phase 4: Homepage GitOps delivery.

- Fix Homepage chart config mounting.
- Replace direct deploy pipeline with build, push, and GitOps commit stages.
- Validate ArgoCD reconciles the committed image tag.

Phase 5: ESO adoption.

- Add ExternalSecret manifests.
- Add chart secret reference support.
- Align Vault policies and secret paths.

## Later Milestones

After the hybrid foundation is stable:

- Add ingress controller and cert-manager for TLS.
- Add observability with Prometheus, Grafana, and Loki.
- Add policy/security controls such as Kyverno and Trivy Operator.
- Add backup and disaster recovery for Vault, Longhorn, and GitOps repository state.

## Non-Goals For First Implementation Plan

- Full production hardening in one pass.
- Internet exposure for Jenkins.
- Replacing all NodePorts before the GitOps delivery path works.
- Migrating CalibreWeb data storage before the current hostPath dependency is documented and controlled.
