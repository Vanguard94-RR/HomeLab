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

- `homepage` from `helm/custom/homepage` using production values
- `calibreweb` from `helm/custom/calibreweb`
- `registry` from `workloads/registry/k8s`
