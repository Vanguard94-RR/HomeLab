# Longhorn Complete Configuration Manual for Kubernetes HomeLab

## Overview

This document provides a complete end-to-end guide for deploying, stabilizing, and configuring Longhorn in a Kubernetes HomeLab environment intended for GitOps and Platform Engineering workloads.

The guide includes:

- Initial architecture recommendations
- Disk preparation
- Kubernetes prerequisites
- Longhorn installation
- Storage migration
- Best practices for single-node HomeLab clusters
- Backup strategy recommendations
- Operational validation procedures
- Troubleshooting

---

# 1. Recommended HomeLab Architecture

## Target Environment

This manual assumes:

| Component | Purpose |
|---|---|
| Small SSD (~120GB) | Operating System + Kubernetes Runtime |
| Large Disk (~500GB+) | Persistent Longhorn Storage |
| Kubernetes Distribution | k3s / RKE2 / kubeadm |
| Longhorn | CSI Storage Platform |
| Single Node Cluster | Initial HomeLab deployment |

---

## Recommended Storage Layout

```text
/
├── boot
├── home
├── var
│   ├── lib
│   │   ├── kubelet
│   │   └── containerd
│
/DATA
├── longhorn
├── backups
├── registry
├── git
└── archives
```

---

## Design Goals

The primary goal is to avoid storing Kubernetes persistent volumes on the operating system disk.

Longhorn data must be isolated to the large storage disk.

Benefits:

- Prevent OS disk exhaustion
- Improve cluster stability
- Improve snapshot operations
- Improve storage scalability
- Simplify backup strategy
- Reduce operational risk

---

# 2. Kubernetes Prerequisites

## Required Packages

This guide is optimized for Fedora Server.

Install required packages:

```bash
sudo dnf install -y \
  iscsi-initiator-utils \
  nfs-utils \
  cryptsetup \
  device-mapper-persistent-data
```

Enable required services:

```bash
sudo systemctl enable iscsid
sudo systemctl start iscsid
```

Verify:

```bash
sudo systemctl status iscsid
```

---

## SELinux Considerations

Fedora enables SELinux by default.

Verify SELinux status:

```bash
getenforce
```

Recommended mode:

```text
Enforcing
```

Longhorn works correctly with SELinux enabled when properly configured.

If mount permission issues occur during initial setup, temporarily test using:

```bash
sudo setenforce 0
```

If this resolves the issue, configure proper SELinux policies instead of permanently disabling SELinux.

To make SELinux permissive temporarily:

```bash
sudo setenforce 0
```

To re-enable enforcing mode:

```bash
sudo setenforce 1
```

Permanent SELinux disabling is NOT recommended for Platform Engineering environments.

---

## Firewall Considerations

Fedora Server commonly uses firewalld.

Verify firewall status:

```bash
sudo systemctl status firewalld
```

Recommended approach:

- allow Kubernetes networking
- allow Longhorn communication
- avoid disabling the firewall globally unless required for isolated HomeLab testing

Example:

```bash
sudo firewall-cmd --permanent --add-port=30000-32767/tcp
sudo firewall-cmd --reload
```

Adjust firewall rules according to:

- Kubernetes distribution
- CNI plugin
- ingress controller
- storage networking requirements

---

Verify:

```bash
sudo systemctl status iscsid
```

---

## Fedora Filesystem Considerations

Fedora installations frequently use:

```text
BTRFS
```

for the operating system filesystem.

This is acceptable for the OS disk.

However, Longhorn storage disks should preferably use:

```text
EXT4
```

or:

```text
XFS
```

Recommended:

| Purpose | Filesystem |
|---|---|
| OS Disk | BTRFS |
| Longhorn Disk | EXT4 |

This avoids snapshot layering complexity and improves operational predictability.

---

## Kubernetes Requirements

Minimum recommended:

| Resource | Recommended |
|---|---|
| CPU | 4 vCPU |
| RAM | 16GB |
| Storage | 500GB+ dedicated disk |

---

# 3. Identify Available Disks

List block devices:

```bash
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT
```

Example:

```text
sda    119.2G
├─sda1     1M
├─sda2     1G ext4   /boot
└─sda3 118.2G btrfs  /home

sdb    465.8G
└─sdb5 464.8G ext4
```

In this scenario:

| Disk | Purpose |
|---|---|
| sda | OS Disk |
| sdb | Longhorn Storage Disk |

---

# 4. Prepare Dedicated Longhorn Disk

## Create Mount Point

```bash
sudo mkdir -p /DATA
```

---

## Obtain Disk UUID

```bash
sudo blkid /dev/sdb5
```

Example:

```text
/dev/sdb5: UUID="2a77e9bc-43a4-4e4f-9fdf-123456789abc" TYPE="ext4"
```

---

## Configure Persistent Mount

Edit fstab:

```bash
sudo nano /etc/fstab
```

Add:

```fstab
UUID=2a77e9bc-43a4-4e4f-9fdf-123456789abc /DATA ext4 defaults,nofail 0 2
```

Mount filesystem:

```bash
sudo mount -a
```

Verify:

```bash
df -h
```

Expected:

```text
/dev/sdb5   458G   ...   /DATA
```

---

## Create Longhorn Directory

```bash
sudo mkdir -p /DATA/longhorn
```

Set permissions:

```bash
sudo chown -R root:root /DATA/longhorn
sudo chmod -R 755 /DATA/longhorn
```

---

# 5. Install Longhorn

## Add Helm Repository

```bash
helm repo add longhorn https://charts.longhorn.io
helm repo update
```

---

## Create Namespace

```bash
kubectl create namespace longhorn-system
```

---

## Create values.yaml

Recommended HomeLab configuration:

```yaml
persistence:
  defaultClass: true
  defaultClassReplicaCount: 1
  reclaimPolicy: Delete

csi:
  kubeletRootDir: /var/lib/kubelet

defaultSettings:
  defaultDataPath: /DATA/longhorn
  defaultReplicaCount: 1
  createDefaultDiskLabeledNodes: false
  replicaSoftAntiAffinity: true
  storageReservedPercentageForDefaultDisk: 10
  defaultLonghornStaticStorageClass: longhorn-static
```

---

## Install Longhorn

```bash
helm install longhorn longhorn/longhorn \
  --namespace longhorn-system \
  --values values.yaml
```

---

## Verify Installation

```bash
kubectl get pods -n longhorn-system
```

All pods should be:

```text
Running
```

---

# 6. Access Longhorn UI

## Port Forward

```bash
kubectl -n longhorn-system port-forward svc/longhorn-frontend 8080:80
```

Access:

```text
http://localhost:8080
```

---

# 7. Configure Longhorn Disk

## Open Node Configuration

Navigate:

```text
Nodes → Edit Node
```

---

## Add Dedicated Disk

Configure:

| Field | Value |
|---|---|
| Path | /DATA/longhorn |
| Allow Scheduling | Enabled |
| Storage Reserved | 50Gi |

---

## Remove Old Disk Usage

Disable scheduling on:

```text
/var/lib/longhorn
```

Do NOT remove immediately.

Wait until:

```text
Replicas = 0
```

Then delete the old disk.

---

# 8. Configure Global Longhorn Settings

Navigate:

```text
Settings
```

---

## Recommended Settings

| Setting | Recommended Value |
|---|---|
| Default Data Path | /DATA/longhorn |
| Default Replica Count | 1 |
| Default Backing Image Copies | 1 |
| Storage Reserved | 50Gi |

---

## Why Replica Count = 1

Single-node clusters do NOT gain real high availability from multiple replicas.

Using 3 replicas on a single node causes:

- Higher disk usage
- Increased write amplification
- Additional CPU usage
- Additional snapshot overhead
- Lower performance

For HomeLab environments:

```text
Replica Count = 1
```

is the correct configuration.

---

# 9. Migrate Existing Volumes

Navigate:

```text
Volumes
```

For each volume:

- homepage
- vault
- docker-registry
- jenkins
- argocd

Perform:

```text
Edit Replica Count → 1
```

Wait until each volume becomes:

```text
Healthy
```

before proceeding to the next volume.

---

# 10. Validate Storage Migration

## Verify Replicas

```bash
kubectl -n longhorn-system get replicas.longhorn.io
```

Verify:

- replicas use `/DATA/longhorn`
- old disk has zero replicas

---

## Validate Disk Usage

Expected:

| Disk | State |
|---|---|
| /DATA/longhorn | Schedulable |
| /var/lib/longhorn | Removed |

---

# 11. Create Persistent StorageClass

Example:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn
provisioner: driver.longhorn.io
allowVolumeExpansion: true
reclaimPolicy: Delete
volumeBindingMode: Immediate
parameters:
  numberOfReplicas: "1"
  staleReplicaTimeout: "30"
  fromBackup: ""
```

Apply:

```bash
kubectl apply -f storageclass.yaml
```

---

# 12. Test Persistent Volumes

## Create PVC

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: longhorn
  resources:
    requests:
      storage: 5Gi
```

Apply:

```bash
kubectl apply -f pvc.yaml
```

---

## Verify

```bash
kubectl get pvc
```

Expected:

```text
STATUS: Bound
```

---

# 13. Backup Strategy

## Critical Recommendation

Single-node Longhorn does NOT provide real HA.

Protection must come from:

- backups
- snapshots
- GitOps recovery
- infrastructure as code

---

## Recommended Backup Structure

```text
/DATA/backups
├── longhorn
├── velero
├── etcd
└── jenkins
```

---

## Recommended Backup Targets

| Option | Recommended |
|---|---|
| NFS | Yes |
| MinIO | Yes |
| S3 | Yes |
| External NAS | Yes |

---

# 14. Configure Recurring Backups

Navigate:

```text
Recurring Jobs
```

Recommended jobs:

| Job | Schedule |
|---|---|
| Snapshot | Every 6h |
| Backup | Daily |
| Cleanup | Weekly |

---

## Suggested Retention

| Type | Retention |
|---|---|
| Snapshots | 24 |
| Backups | 7-14 |

---

# 15. Operational Recommendations

## Recommended Applications

Longhorn is ideal for:

- Jenkins
- Vault
- Docker Registry
- PostgreSQL
- MinIO
- Git repositories
- Prometheus

---

## Avoid Storing on OS Disk

Never store:

- PVCs
- snapshots
- backups
- registries

on:

```text
/var/lib/longhorn
```

in production-like environments.

---

# 16. Monitoring Recommendations

## Monitor:

- disk usage
- replica health
- snapshot growth
- backup execution
- filesystem usage

---

## Useful Commands

### Check PVCs

```bash
kubectl get pvc -A
```

### Check Longhorn Volumes

```bash
kubectl -n longhorn-system get volumes.longhorn.io
```

### Check Replicas

```bash
kubectl -n longhorn-system get replicas.longhorn.io
```

### Check Disk Usage

```bash
df -h
```

---

# 17. Troubleshooting

## Disk Appears Unschedulable

Possible causes:

- invalid mountpoint
- excessive reserved storage
- missing permissions
- filesystem unavailable

Verify:

```bash
df -h
mount | grep DATA
```

---

## Negative Available Space

Example:

```text
0 / -8.61 Gi
```

Cause:

Reserved storage exceeds available capacity.

Fix:

Reduce:

```text
Storage Reserved
```

in Longhorn disk settings.

---

## Replica Rebuild Loops

Cause:

Using multiple replicas in single-node clusters.

Fix:

Set:

```text
Replica Count = 1
```

---

## Volume Stuck Degraded

Check:

```bash
kubectl describe volume <volume-name>
```

and verify:

- disk schedulable
- replica health
- available storage

---

# 18. Recommended HomeLab Final State

## Final Architecture

| Component | Location |
|---|---|
| Kubernetes Runtime | OS Disk |
| Longhorn Volumes | /DATA/longhorn |
| Backups | /DATA/backups |
| Registry Storage | Longhorn PVC |
| Jenkins Home | Longhorn PVC |
| Vault Storage | Longhorn PVC |

---

# 19. GitOps Integration Recommendations

Recommended stack:

| Component | Purpose |
|---|---|
| ArgoCD | GitOps |
| Vault | Secrets |
| Jenkins | CI/CD |
| Longhorn | Persistent Storage |
| MinIO | S3 Backup Target |
| Prometheus | Monitoring |
| Grafana | Dashboards |

---

# 20. Conclusion

After completing this configuration:

- Longhorn will use the dedicated large storage disk
- Kubernetes workloads will avoid exhausting the OS disk
- Persistent volumes will operate with improved stability
- The HomeLab will be ready for GitOps workflows
- The platform will support CI/CD, Vault, Registry, and observability workloads safely

This configuration provides a stable foundation for a modern Kubernetes Platform Engineering HomeLab.


