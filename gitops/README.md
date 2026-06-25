# HomeLab GitOps

Directorio GitOps del HomeLab. Gestionado por ArgoCD via ApplicationSet.

## Estructura

```
gitops/
├── bootstrap/
│   └── applicationset.yaml     # ApplicationSet raíz — descubre apps por directorio
└── apps/
    ├── monitoring/              # node-exporter DaemonSet
    ├── longhorn/                # Longhorn config + StorageClasses
    ├── argocd/                  # ArgoCD self-managed (proyectos)
    └── workload-automation/     # Control-M Lab (namespace + quotas)
```

## Cómo funciona

El `ApplicationSet` en `bootstrap/applicationset.yaml` usa el **directory generator** para:

1. Escanear todos los subdirectorios en `gitops/apps/`
2. Crear una `Application` de ArgoCD por cada directorio encontrado
3. Sincronizar automáticamente con `prune: true` y `selfHeal: true`

## Agregar una nueva app

```bash
mkdir -p gitops/apps/mi-nueva-app
# Crear manifiestos YAML en ese directorio
git add gitops/apps/mi-nueva-app/
git commit -m "feat: add mi-nueva-app to gitops"
git push
# ArgoCD detecta el nuevo directorio y crea la Application automáticamente
```

## Estado actual

| App | Namespace | Estado |
|---|---|---|
| monitoring | monitoring | ✅ Synced — node-exporter DaemonSet |
| longhorn | longhorn-system | ✅ Synced — config + StorageClass |
| argocd | argocd | ✅ Synced — proyectos homelab + workload-automation |
| workload-automation | workload-automation | ✅ Synced — namespace + quotas (Control-M pendiente) |

## Pendientes

- [ ] Control-M Lab — deploy en workload-automation
- [ ] Vault — secrets management
- [ ] Ingress controller — Nginx o Traefik
- [ ] Cert-manager — TLS interno
- [ ] Jenkins CI — integración GitOps

## Cluster

```
K3s v1.35.5+k3s1
API server: https://10.10.20.101:6443

Nodos:
  dell-7490-1  10.10.20.101  control-plane
  dell-7490-2  10.10.20.102  worker1
  t440p-storage 10.10.20.104 worker4 storage
```
