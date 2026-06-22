# Enterprise HomeLab — K3s Pre-Installation & Configuration Manual

**Version:** 2.0
**Date:** June 2026
**Scope:** K3s cluster preparation · Fedora 42 · VLAN 20 (PROD) · 3-node initial cluster
**Nodos disponibles ahora:** Dell 7490 #1 (control-plane temporal) · Dell 7490 #2 (worker1) · T440p (worker4)
**Nodos pendientes:** Dell 5480 (control-plane permanente) · P52 (worker3 ML/GPU)

---

## Table of Contents

1. [Cluster Architecture](#1-cluster-architecture)
2. [Node Inventory](#2-node-inventory)
3. [IP Configuration — Confirmada Junio 2026](#3-ip-configuration)
4. [Pre-Installation Scripts](#4-pre-installation-scripts)
5. [Pre-Check Results — Junio 2026](#5-pre-check-results)
6. [Installation Plan](#6-installation-plan)
7. [K3s Component Overview](#7-k3s-component-overview)
8. [Network Configuration](#8-network-configuration)
9. [Post-Installation Roadmap](#9-post-installation-roadmap)
10. [Troubleshooting Reference](#10-troubleshooting-reference)

---

## 1. Cluster Architecture

### Arquitectura final (cuando lleguen todos los equipos)

```
VLAN 20 — PROD (10.10.20.0/24)
          │
          ├── Dell 5480     (10.10.20.100)  control-plane PERMANENTE ← llega después
          ├── Dell 7490 #1  (10.10.20.101)  control-plane temporal → worker permanente
          ├── Dell 7490 #2  (10.10.20.102)  worker1
          ├── ThinkPad P52  (10.10.20.103)  worker3 ML/GPU ← llega después
          └── ThinkPad T440p(10.10.20.104)  worker4 storage

DNS: AdGuard Home (10.10.10.3 / 192.168.1.100)
GW:  pfSense (10.10.20.1)
```

### Fase 1 — Cluster inicial (disponible ahora)

```
VLAN 20 — PROD (10.10.20.0/24)
          │
          ├── Dell 7490 #1  (10.10.20.101)  control-plane TEMPORAL ✅ IP configurada
          ├── Dell 7490 #2  (10.10.20.102)  worker1       ✅ IP configurada
          └── ThinkPad T440p(10.10.20.104)  worker4       ✅ IP configurada
```

### Design Decisions

**Dell 5480 como control-plane permanente** — Cuando llegue, se instalará K3s server en 10.10.20.100. Dell 7490 #1 se degradará a worker con `kubectl drain` + reinstall como agent.

**Dell 7490 #1 como control-plane temporal** — 32GB DDR4 + 256GB SSD son suficientes para etcd. Permite arrancar el cluster ahora sin esperar el Dell 5480.

**T440p como worker4 storage** — 16GB DDR4 + 512GB SSD (OS + pods). Capacidad para Longhorn. Taint `storage=preferred:PreferNoSchedule`.

**P52 como worker3 ML** — Quadro P1000 GPU. Dedicado para Ollama, Jupyter, ML inference. NVMe secundario 480GB para Longhorn tier rápido. Taint `gpu=true:NoSchedule`.

**Cilium CNI** — eBPF networking, NetworkPolicy L3/L4/L7, L2 announcements (reemplaza MetalLB). K3s instalado con `--flannel-backend=none --disable-network-policy --disable=traefik`.

**Pod CIDR:** `10.42.0.0/16` (K3s default)
**Service CIDR:** `10.43.0.0/16` (K3s default)

### Cluster Resource Summary (Fase 1)

| Resource | Fase 1 (3 nodos) | Final (5 nodos) |
|---|---|---|
| Total nodes | 1 master + 2 workers | 1 master + 4 workers |
| Total RAM | 80GB | 176GB |
| Total CPU cores | 24C / 24T | 40T |
| Storage (Longhorn) | ~450GB SSD | ~2.5TB (SSD + HDD + NVMe) |
| GPU | — | Quadro P1000 (P52) |

---

## 2. Node Inventory

### Dell Latitude 7490 #1 — Control-Plane TEMPORAL

| Parameter | Value |
|---|---|
| Role | K3s server (control-plane temporal) → worker cuando llegue Dell 5480 |
| Hostname | `dell-7490-1` ✅ |
| IP | `10.10.20.101/24` ✅ configurada estáticamente |
| MAC | c8:f7:50:57:7f:55 |
| Interface | enp0s31f6 |
| OS | Fedora Linux 42 (Server Edition) |
| Kernel | 6.19.14-108.fc42.x86_64 |
| CPU | Intel Core i5-8350U (4C/8T, 8th gen, 15W) |
| RAM | 32GB DDR4 |
| Disk | 256GB NVMe — root expandido a ~236GB post prefix.sh |
| Switch port | P2 (PVID 20, untagged) |

### Dell Latitude 7490 #2 — Worker 1

| Parameter | Value |
|---|---|
| Role | K3s agent (worker1) |
| Hostname | `dell-7490-2` ✅ |
| IP | `10.10.20.102/24` ✅ configurada estáticamente |
| MAC | c8:f7:50:7c:83:f0 |
| Interface | enp0s31f6 |
| OS | Fedora Linux 42 (Server Edition) |
| Kernel | 6.19.14-108.fc42.x86_64 |
| CPU | Intel Core i5-8350U (4C/8T, 8th gen, 15W) |
| RAM | 32GB DDR4 |
| Disk | 256GB NVMe — root expandido a ~236GB post prefix.sh |
| Switch port | P4 (PVID 20, untagged) |

### Dell Latitude 5480 — Control-Plane PERMANENTE (pendiente)

| Parameter | Value |
|---|---|
| Role | K3s server (control-plane permanente) |
| Hostname | `dell-5480` |
| IP | `10.10.20.100/24` ← reservada |
| OS | Fedora Linux 42 (Server Edition) |
| CPU | Intel Core i5-8xxx (4C/8T, 8th gen, 15W) |
| RAM | 32GB DDR4 |
| Disk | 256GB SSD |
| Switch port | P3 (PVID 20, untagged) — pendiente cableado |

### ThinkPad P52 — Worker 3 ML/GPU (pendiente)

| Parameter | Value |
|---|---|
| Role | K3s agent (worker3 — ML/GPU) |
| Hostname | `p52` |
| IP | `10.10.20.103/24` ← reservada |
| OS | Fedora Linux 42 (Server Edition) |
| CPU | Intel Core i7 (6C/12T) |
| RAM | 32GB DDR4 |
| GPU | NVIDIA Quadro P1000 |
| Disk primario | NVMe OS |
| Disk secundario | **480GB NVMe** (del upgrade M720q) → /var/lib/longhorn 350GB + /var/lib/ollama 130GB |
| Switch port | P6 (PVID 20, untagged) — pendiente |

### ThinkPad T440p — Worker 4 Storage

| Parameter | Value |
|---|---|
| Role | K3s agent (worker4 — storage) |
| Hostname | `t440p-storage` ✅ |
| IP | `10.10.20.104/24` ✅ configurada estáticamente |
| MAC | 28:d2:44:8c:20:89 |
| Interface | enp0s25 |
| OS | Fedora Linux 42 (Server Edition) |
| Kernel | 6.19.14-108.fc42.x86_64 |
| CPU | Intel Core i7-4712MQ (4C/8T) |
| RAM | 16GB DDR3L |
| Disk | 512GB — root 465GB disponibles |
| Switch port | P5 (PVID 20, untagged) |

---

## 3. IP Configuration

### IPs configuradas estáticamente — Junio 2026

Todos los nodos disponibles tienen IPs estáticas configuradas via NetworkManager.

**Comando usado en cada nodo:**

```bash
# Dell 7490 #1 — enp0s31f6
sudo nmcli connection modify enp0s31f6 \
  ipv4.method manual \
  ipv4.addresses "10.10.20.101/24" \
  ipv4.gateway "10.10.20.1" \
  ipv4.dns "10.10.10.3" \
  ipv4.ignore-auto-dns yes
sudo nmcli connection up enp0s31f6

# Dell 7490 #2 — enp0s31f6
sudo nmcli connection modify enp0s31f6 \
  ipv4.method manual \
  ipv4.addresses "10.10.20.102/24" \
  ipv4.gateway "10.10.20.1" \
  ipv4.dns "10.10.10.3" \
  ipv4.ignore-auto-dns yes
sudo nmcli connection up enp0s31f6

# T440p — enp0s25
sudo nmcli connection modify enp0s25 \
  ipv4.method manual \
  ipv4.addresses "10.10.20.104/24" \
  ipv4.gateway "10.10.20.1" \
  ipv4.dns "10.10.10.3" \
  ipv4.ignore-auto-dns yes
sudo nmcli connection up enp0s25
```

**Nota:** WiFi activo en todos los nodos (wlp2s0/wlp4s0) — no se deshabilita por ahora. K3s usará la interfaz ethernet para la comunicación del cluster.

### Verificación de conectividad

```bash
# Desde P53
ping -c 2 10.10.20.101 # Dell 7490 #1 ✅
ping -c 2 10.10.20.102 # Dell 7490 #2 ✅
ping -c 2 10.10.20.104 # T440p ✅

# Entre nodos (ejemplo desde T440p)
ping -c 2 10.10.20.101 # Dell 7490 #1 OK — 0.484ms
ping -c 2 10.10.20.102 # Dell 7490 #2 OK — 0.538ms
ping -c 2 8.8.8.8      # Internet OK — 6.6ms
```

---

## 4. Pre-Installation Scripts

Scripts en P53: `/home/admin/Documents/Personal/HomeLab/scripts/`

### homelab-k3s-precheck.sh (v1.3)

Script de diagnóstico — no hace cambios al sistema.

```bash
# Copiar a cada nodo
scp /home/admin/Documents/Personal/HomeLab/scripts/homelab-k3s-precheck.sh admin@10.10.20.101:~/
scp /home/admin/Documents/Personal/HomeLab/scripts/homelab-k3s-precheck.sh admin@10.10.20.102:~/
scp /home/admin/Documents/Personal/HomeLab/scripts/homelab-k3s-precheck.sh admin@10.10.20.104:~/

# Ejecutar
chmod +x ~/homelab-k3s-precheck.sh

# En control-plane
sudo ./homelab-k3s-precheck.sh --role master

# En workers
sudo ./homelab-k3s-precheck.sh --role worker
```

**Secciones que verifica:**
- Host identity (hostname, kernel, uptime)
- Network (IP, gateway, DNS AdGuard, internet)
- CPU (cores, arquitectura)
- Memory (RAM, swap)
- Disk (espacio disponible, LVM)
- K3s pre-requisites (curl, systemd, SELinux, firewalld, módulos kernel, NTP)
- Existing K3s (instalación previa)
- Role-specific checks

### homelab-k3s-prefix.sh (v1.3)

Script de correcciones — aplica todos los fixes necesarios. **Idempotente.**

```bash
# Copiar a cada nodo
scp /home/admin/Documents/Personal/HomeLab/scripts/homelab-k3s-prefix.sh admin@10.10.20.101:~/
scp /home/admin/Documents/Personal/HomeLab/scripts/homelab-k3s-prefix.sh admin@10.10.20.102:~/
scp /home/admin/Documents/Personal/HomeLab/scripts/homelab-k3s-prefix.sh admin@10.10.20.104:~/

# Ejecutar
chmod +x ~/homelab-k3s-prefix.sh

# En control-plane temporal
sudo ./homelab-k3s-prefix.sh --role master 2>&1 | tee ~/prefix-dell1.txt

# En workers
sudo ./homelab-k3s-prefix.sh --role worker 2>&1 | tee ~/prefix-dell2.txt
sudo ./homelab-k3s-prefix.sh --role worker 2>&1 | tee ~/prefix-t440p.txt
```

**Fixes aplicados (v1.3):**

| Fix | Descripción |
|---|---|
| FIX 1 | Hostname — lowercase RFC 1123, /etc/hosts |
| FIX 2 | Swap — deshabilitado (swapoff + fstab + zram) |
| **FIX 2.5** | **LVM root expansion — lvextend + xfs_growfs (NUEVO v1.3)** |
| FIX 3 | SELinux — k3s-selinux policy (el9, compatible Fedora) |
| FIX 4 | Firewalld — puertos K3s + Cilium (4240, 4244, 4245, 51871) + CIDRs trusted |
| FIX 5 | Kernel modules — br_netfilter, overlay, ip_conntrack |
| FIX 6 | Sysctl — ip_forward, bridge-nf-call-iptables |
| FIX 7 | Time sync — NTP via timedatectl |

---

## 5. Pre-Check Results — Junio 2026

### Dell 7490 #1 — 10.10.20.101 (control-plane temporal)

```
Results: 19 passed | 7 warnings | 0 failed
STATUS: [WARN] READY WITH WARNINGS

Hardware:
  CPU: Intel Core i5-8350U (8 cores, x86_64)
  RAM: 31,960MB total / 31,096MB available
  Disk: 11GB free on / (15GB total — root muy pequeño)

Warnings:
  [WARN] Swap enabled (8191MB zram) → fix: prefix.sh
  [WARN] SELinux Enforcing, k3s-selinux not installed → fix: prefix.sh
  [WARN] firewalld active, missing ports → fix: prefix.sh
  [WARN] br_netfilter not loaded → fix: prefix.sh (auto-carga)
  [WARN] overlay not loaded → fix: prefix.sh (auto-carga)
  [WARN] IP forwarding disabled → fix: prefix.sh
  [WARN] Time not synchronized → fix: prefix.sh
  [CRIT] Root disk solo 11GB free — expandir LVM antes de instalar K3s
         → FIX 2.5 del prefix.sh expande automáticamente (221GB libres en VG)
```

### Dell 7490 #2 — 10.10.20.102 (worker1)

```
Results: 20 passed | 6 warnings | 0 failed
STATUS: [WARN] READY WITH WARNINGS

Hardware:
  CPU: Intel Core i5-8350U (8 cores, x86_64)
  RAM: 31,960MB total / 31,079MB available
  Disk: 11GB free on / (15GB total — root muy pequeño)

Warnings:
  [WARN] Swap enabled (8191MB zram) → fix: prefix.sh
  [WARN] SELinux Enforcing, k3s-selinux not installed → fix: prefix.sh
  [WARN] firewalld active, missing ports → fix: prefix.sh
  [WARN] br_netfilter not loaded → fix: prefix.sh
  [WARN] overlay not loaded → fix: prefix.sh
  [CRIT] Root disk solo 11GB free — expandir LVM antes de instalar K3s
         → FIX 2.5 del prefix.sh expande automáticamente (221GB libres en VG)
```

### T440p — 10.10.20.104 (worker4 storage)

```
Results: 24 passed | 2 warnings | 0 failed
STATUS: [WARN] READY WITH WARNINGS

Hardware:
  CPU: Intel Core i7-4712MQ (8 cores, x86_64)
  RAM: 15,669MB total / 14,969MB available
  Disk: 465GB free on / (476GB total — excelente)

Warnings:
  [WARN] Swap enabled (8191MB zram) → fix: prefix.sh
  [WARN] firewalld active, missing ports → fix: prefix.sh
```

**Nota sobre disk en Dell 7490:** Fedora se instaló con root de solo 15GB pero el disco tiene 256GB totales. El VG tiene 221GB libres. El FIX 2.5 del prefix.sh los expande automáticamente.

---

## 6. Installation Plan

### Paso 0 — Pre-requisitos (ANTES de instalar K3s)

```bash
# En cada nodo — ejecutar prefix.sh
sudo ./homelab-k3s-prefix.sh --role master   # Dell 7490 #1
sudo ./homelab-k3s-prefix.sh --role worker   # Dell 7490 #2
sudo ./homelab-k3s-prefix.sh --role worker   # T440p

# Re-verificar con precheck
sudo ./homelab-k3s-precheck.sh --role master  # Dell 7490 #1
sudo ./homelab-k3s-precheck.sh --role worker  # Dell 7490 #2, T440p
# Expected: 0 failures, warnings mínimos
```

### Paso 1 — Instalar K3s en control-plane (Dell 7490 #1)

```bash
# En Dell 7490 #1 (10.10.20.101)
curl -sfL https://get.k3s.io | \
  INSTALL_K3S_EXEC="--selinux \
    --write-kubeconfig-mode 644 \
    --tls-san 10.10.20.101 \
    --flannel-backend=none \
    --disable-network-policy \
    --disable=traefik" sh -

# Verificar
sudo systemctl status k3s
sudo kubectl get nodes

# Obtener token para workers
sudo cat /var/lib/rancher/k3s/server/node-token
```

### Paso 2 — Instalar Cilium CNI

```bash
# Desde P53 con kubeconfig del cluster
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml  # o copiar a ~/.kube/config

# Instalar Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Agregar repo Cilium
helm repo add cilium https://helm.cilium.io
helm repo update

# Instalar Cilium
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set k8sServiceHost=10.10.20.101 \
  --set k8sServicePort=6443 \
  --set l2announcements.enabled=true \
  --set l2announcements.leaseDuration=15s \
  --set l2announcements.leaseRenewDeadline=5s \
  --set l2announcements.leaseRetryPeriod=2s \
  --set hubble.relay.enabled=true \
  --set hubble.ui.enabled=true \
  --set prometheus.enabled=true

# Verificar
kubectl -n kube-system get pods | grep cilium
```

### Paso 3 — Unir workers

```bash
# TOKEN del paso 1
TOKEN=$(ssh admin@10.10.20.101 "sudo cat /var/lib/rancher/k3s/server/node-token")

# Dell 7490 #2 (10.10.20.102)
curl -sfL https://get.k3s.io | \
  K3S_URL=https://10.10.20.101:6443 \
  K3S_TOKEN=$TOKEN \
  INSTALL_K3S_EXEC="--selinux" sh -

# T440p (10.10.20.104)
curl -sfL https://get.k3s.io | \
  K3S_URL=https://10.10.20.101:6443 \
  K3S_TOKEN=$TOKEN \
  INSTALL_K3S_EXEC="--selinux" sh -

# Verificar desde el control-plane
kubectl get nodes -o wide
# Expected: 3 nodos en Ready
```

### Paso 4 — Verificar cluster

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl -n kube-system get pods | grep cilium
kubectl cluster-info
```

### Paso 5 — Agregar Dell 5480 como control-plane permanente (cuando llegue)

```bash
# Instalar K3s en Dell 5480 (10.10.20.100) como server adicional
TOKEN=$(ssh admin@10.10.20.101 "sudo cat /var/lib/rancher/k3s/server/node-token")

curl -sfL https://get.k3s.io | \
  K3S_URL=https://10.10.20.101:6443 \
  K3S_TOKEN=$TOKEN \
  INSTALL_K3S_EXEC="--server --selinux \
    --tls-san 10.10.20.100 \
    --flannel-backend=none \
    --disable-network-policy \
    --disable=traefik" sh -

# Drainear Dell 7490 #1 del rol de control-plane
# y reinstalar como worker puro
kubectl drain dell-7490-1 --ignore-daemonsets --delete-emissary-data
# En Dell 7490 #1:
k3s-uninstall.sh
curl -sfL https://get.k3s.io | \
  K3S_URL=https://10.10.20.100:6443 \
  K3S_TOKEN=$TOKEN \
  INSTALL_K3S_EXEC="--selinux" sh -
```

---

## 7. K3s Component Overview

```
K3s Cluster
├── Control-plane (Dell 7490 #1 temporal / Dell 5480 permanente)
│   ├── kube-apiserver       ← API gateway del cluster
│   ├── kube-scheduler       ← decide en qué nodo va cada pod
│   ├── kube-controller-manager ← reconciliation loops
│   ├── etcd                 ← base de datos del estado del cluster
│   └── CoreDNS              ← DNS interno del cluster
│
├── CNI — Cilium (eBPF)
│   ├── NetworkPolicy L3/L4/L7
│   ├── L2 announcements (reemplaza MetalLB)
│   ├── Hubble (observabilidad de red)
│   └── Pod CIDRs: 10.42.0.0/16
│
└── Workers
    ├── kubelet              ← agente en cada nodo
    ├── kube-proxy           ← routing de servicios
    ├── Container runtime    ← containerd (default K3s)
    └── Cilium agent         ← eBPF dataplane
```

---

## 8. Network Configuration

### Puertos K3s requeridos (firewalld)

| Puerto | Protocolo | Uso |
|---|---|---|
| 6443 | TCP | K3s API server |
| 10250 | TCP | K3s kubelet |
| 8472 | UDP | VXLAN overlay (Cilium) |
| 4240 | TCP | Cilium health check |
| 4244 | TCP | Cilium Hubble |
| 4245 | TCP | Cilium Hubble Relay |
| 51871 | UDP | WireGuard (Cilium) |
| 2379 | TCP | etcd client (solo control-plane) |
| 2380 | TCP | etcd peer (solo control-plane) |

### DNS Rewrites en AdGuard (pendientes)

```
Agregar en AdGuard → Filters → DNS rewrites:

k3s.mgmt          → 10.10.20.101  (API temporal)
hubble.mgmt       → MetalLB IP
argocd.mgmt       → MetalLB IP
grafana-k3s.mgmt  → MetalLB IP
```

### CIDR Summary

```
Pod CIDR:     10.42.0.0/16  (K3s default)
Service CIDR: 10.43.0.0/16  (K3s default)
Node CIDR:    10.10.20.0/24 (VLAN 20 PROD)
MetalLB pool: 10.10.20.200 – 10.10.20.220 (futuro)
```

---

## 9. Post-Installation Roadmap

### Fase 1 (3 nodos — ahora)
- [ ] Ejecutar prefix.sh en los 3 nodos
- [ ] Re-ejecutar precheck — 0 failures
- [ ] Instalar K3s control-plane en Dell 7490 #1
- [ ] Instalar Cilium
- [ ] Unir Dell 7490 #2 y T440p como workers
- [ ] Verificar cluster: `kubectl get nodes`

### Fase 2 (servicios base)
- [ ] Longhorn storage (Helm)
- [ ] ArgoCD GitOps
- [ ] Traefik/Nginx Ingress
- [ ] cert-manager
- [ ] Vault secrets
- [ ] Silenciar alertas NodeDown en Alertmanager

### Fase 3 (cuando lleguen equipos)
- [ ] Dell 5480 → control-plane permanente (10.10.20.100)
- [ ] Dell 7490 #1 → degradar a worker
- [ ] P52 → worker3 ML/GPU + NVMe 480GB
- [ ] Instalar Ollama en P52

### Fase 4 (workloads)
- [ ] Jenkins CI/CD
- [ ] Gitea
- [ ] Harbor (registry)
- [ ] Control-M Workbench (namespace: workload-automation)

---

## 10. Troubleshooting Reference

### Node no responde al ping desde P53

```bash
# Verificar IP desde el nodo
ip addr show | grep inet

# Re-aplicar IP estática si se perdió
sudo nmcli connection up enp0s31f6  # o enp0s25 para T440p
```

### K3s falla al instalar en SELinux Enforcing

```bash
# Verificar que k3s-selinux está instalado
rpm -q k3s-selinux

# Si no:
sudo dnf install -y \
  https://github.com/k3s-io/k3s-selinux/releases/download/v1.6.latest.1/k3s-selinux-1.6-1.el9.noarch.rpm
```

### Nodo no se une al cluster

```bash
# Verificar token
sudo cat /var/lib/rancher/k3s/server/node-token

# Verificar conectividad al API server
curl -k https://10.10.20.101:6443/ping

# Ver logs del agente
sudo journalctl -u k3s-agent -f
```

### LVM root muy pequeño en Dell 7490 (11GB)

```bash
# El prefix.sh v1.3 lo expande automáticamente (FIX 2.5)
# Si necesitas hacerlo manual:
sudo lvextend -l +100%FREE /dev/fedora/root
sudo xfs_growfs /
df -h /
# Expected: ~236GB disponibles
```

---

*Document v2.0 — K3s PreInstall · Fedora 42 · 3 nodos disponibles · Cluster fase 1 · Junio 2026*
*Control-plane temporal: Dell 7490 #1 (10.10.20.101) · Control-plane permanente: Dell 5480 (pending)*
