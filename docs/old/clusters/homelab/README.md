# Homelab GitOps Cluster

This directory is the GitOps entrypoint for ArgoCD.

Structure:
- argocd/      -> manual bootstrap applications
- platform/    -> infrastructure/platform ArgoCD applications
- workloads/   -> user workload ArgoCD applications

Bootstrap:

```bash
kubectl apply -f clusters/homelab/argocd/root-app.yaml
```

The root application reconciles `clusters/homelab`, which currently deploys:

- `external-secrets` from the upstream Helm chart
- `external-secrets-config` with the Vault `ClusterSecretStore`
- `jenkins` from the upstream Helm chart
- Vault Kubernetes auth reviewer RBAC
- `homepage` from `helm/custom/homepage` using production values
- `calibreweb` from `helm/custom/calibreweb`
- `registry` from `workloads/registry/k8s`
