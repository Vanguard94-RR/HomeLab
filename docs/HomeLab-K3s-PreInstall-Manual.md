# Enterprise HomeLab — K3s Pre-Installation & Configuration Manual

**Version:** 1.0
**Date:** May 2026
**Scope:** K3s cluster preparation · Fedora 42 · VLAN 20 (PROD) · 2-node initial cluster
**Nodes:** t440p-server (control-plane) · t430 (worker1)

---

## Table of Contents

1. [Cluster Architecture](#1-cluster-architecture)
2. [Node Inventory](#2-node-inventory)
3. [Pre-Installation Scripts](#3-pre-installation-scripts)
4. [Pre-Installation Checklist](#4-pre-installation-checklist)
5. [What Was Fixed and Why](#5-what-was-fixed-and-why)
6. [Network Configuration for K3s](#6-network-configuration-for-k3s)
7. [K3s Component Overview](#7-k3s-component-overview)
8. [Installation Plan](#8-installation-plan)
9. [Post-Installation Roadmap](#9-post-installation-roadmap)
10. [Troubleshooting Reference](#10-troubleshooting-reference)

---

## 1. Cluster Architecture

```
VLAN 20 — PROD (10.10.20.0/24)
          │
          ├── t440p-server (10.10.20.100)
          │   Role: K3s control-plane (server)
          │   K3s API: https://10.10.20.100:6443
          │
          └── t430 (10.10.20.101)
              Role: K3s worker node 1 (agent)

DNS: AdGuard Home (10.10.10.3 / 192.168.1.100)
GW:  pfSense (10.10.20.1)
```

### Design Decisions

**Single control-plane (no HA etcd)** — for a 2-node lab cluster, a single server node is appropriate. HA etcd requires 3 server nodes minimum. Worker nodes can be added without disrupting the control-plane.

**Embedded etcd** — K3s uses embedded SQLite by default for single-server deployments. This is production-ready for lab workloads and eliminates the need for an external database.

**Flannel CNI (default)** — K3s ships with Flannel as its CNI. VXLAN mode is used by default, which is why port `8472/udp` is required. Flannel is well-tested and sufficient for lab use.

**Pod CIDR:** `10.42.0.0/16` (K3s default)
**Service CIDR:** `10.43.0.0/16` (K3s default)

> These CIDRs must not overlap with existing VLANs (10.10.0.0/8). K3s defaults are safe for this lab.

---

## 2. Node Inventory

### t440p-server — Control-Plane

| Parameter | Value |
|---|---|
| Role | K3s server (control-plane) |
| Hostname | `t440p-server` |
| IP | `10.10.20.100/24` |
| Gateway | `10.10.20.1` |
| DNS | `10.10.10.3` (AdGuard) |
| OS | Fedora Linux 42 (Server Edition) |
| Kernel | 6.19.14-108.fc42.x86_64 |
| CPU | Intel Core i7-4712MQ @ 2.30GHz (8 cores) |
| RAM | 15,669 MB |
| Disk | 476GB LVM (`/dev/mapper/fedora-root`) |
| Disk free | 465GB |
| Swap | Disabled |
| SELinux | Enforcing + k3s-selinux-1.6-1.el9 |

### t430 — Worker Node 1

| Parameter | Value |
|---|---|
| Role | K3s agent (worker) |
| Hostname | `t430` |
| IP | `10.10.20.101/24` |
| Gateway | `10.10.20.1` |
| DNS | `10.10.10.3` (AdGuard) |
| OS | Fedora Linux 42 (Server Edition) |
| Kernel | 6.19.14-108.fc42.x86_64 |
| CPU | Intel Core i7-3630QM @ 2.40GHz (8 cores) |
| RAM | 15,631 MB |
| Disk | 476GB LVM (`/dev/mapper/vg_t430-lv_root`) |
| Disk free | 464GB |
| Swap | Disabled |
| SELinux | Enforcing + k3s-selinux-1.6-1.el9 |

---

## 3. Pre-Installation Scripts

Two scripts were developed and verified on both nodes.

### 3.1 homelab-k3s-precheck.sh (v1.3)

**Purpose:** Read-only audit of node readiness. Safe to run at any time.

**Usage:**
```bash
./homelab-k3s-precheck.sh --role master   # on t440p-server
./homelab-k3s-precheck.sh --role worker   # on t430
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--role` | `worker` | Node role: `master` or `worker` |
| `--adguard` | `10.10.10.3` | AdGuard DNS IP to test against |
| `--gateway` | auto-detected | Default gateway IP |

**Exit codes:**
- `0` — All checks pass
- `1` — Warnings present (node likely usable, review warnings)
- `2` — Failures present (fix before installing K3s)

**Checks performed:**

| Section | Checks |
|---|---|
| Host Identity | Hostname RFC 1123 format, /etc/hosts resolution |
| Network | Interface, IP in lab range, gateway, AdGuard, DNS, internet |
| CPU | Architecture (x86_64/aarch64), core count |
| Memory | Total RAM, available RAM, swap status |
| Disk | Available space, /var/lib/rancher presence |
| K3s Pre-requisites | curl, systemd, SELinux+k3s-selinux, firewalld ports, kernel modules, IP forwarding, NTP, nm-cloud-setup |
| Existing K3s | Binary, services, CNI leftovers |
| Role-specific | master: disk type, port 6443; worker: port 10250 |

### 3.2 homelab-k3s-prefix.sh (v1.2)

**Purpose:** Apply all pre-installation fixes. Idempotent — skips already-configured items.

**Usage:**
```bash
sudo ./homelab-k3s-prefix.sh --role master --hostname t440p-server
sudo ./homelab-k3s-prefix.sh --role worker --hostname t430
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--role` | `worker` | Node role: `master` or `worker` |
| `--hostname` | lowercase of current | Target hostname |
| `--dry-run` | off | Preview changes without applying |

**Fixes applied:**

| Fix | What it does |
|---|---|
| FIX 1 — Hostname | Sets RFC 1123 lowercase hostname, adds to /etc/hosts |
| FIX 2 — Swap | Disables swap immediately + comments out fstab entry + disables zram |
| FIX 3 — SELinux | Installs container-selinux, selinux-policy-base, k3s-selinux RPM from GitHub |
| FIX 4 — Firewalld | Opens K3s ports (6443/tcp, 10250/tcp, 8472/udp, 51820/udp), etcd ports for master (2379/tcp, 2380/tcp), enables masquerade |
| FIX 5 — Kernel modules | Loads br_netfilter, overlay, ip_conntrack; persists in /etc/modules-load.d/k3s.conf |
| FIX 6 — Sysctl | Writes /etc/sysctl.d/k3s.conf with ip_forward, bridge-nf-call-iptables |
| FIX 7 — Time sync | Enables NTP via timedatectl |

### 3.3 Verified Results

**t440p-server (master):**
```
Results: 26 passed | 0 warnings | 0 failed
STATUS: [PASS] READY -- node is ready for K3s installation
```

**t430 (worker):**
```
Results: 26 passed | 0 warnings | 0 failed
STATUS: [PASS] READY -- node is ready for K3s installation
```

---

## 4. Pre-Installation Checklist

Use this checklist before running the K3s install script.

### Both Nodes

- [x] Hostname is lowercase RFC 1123 (`t440p-server`, `t430`)
- [x] Hostname resolves in `/etc/hosts`
- [x] IP in VLAN 20 range (`10.10.20.x`)
- [x] Gateway reachable (`10.10.20.1`)
- [x] AdGuard DNS reachable (`10.10.10.3`)
- [x] Internet reachable (`8.8.8.8`)
- [x] 8 CPU cores available
- [x] 15+ GB RAM, swap disabled
- [x] 464+ GB disk free, `/var/lib/rancher` absent
- [x] curl installed
- [x] systemd active
- [x] SELinux Enforcing + `k3s-selinux-1.6-1.el9` installed
- [x] firewalld: ports 6443/tcp 10250/tcp 8472/udp 51820/udp open
- [x] `br_netfilter` and `overlay` modules loaded
- [x] IP forwarding enabled
- [x] NTP synchronized
- [x] No existing K3s installation

### Master Only (t440p-server)

- [x] Port 6443 available (K3s API server)
- [x] firewalld: ports 2379/tcp 2380/tcp open (etcd)
- [ ] Static IP configured (DHCP lease is long but should be made static)
- [ ] DNS rewrite `k3s.mgmt` → `10.10.20.100` added in AdGuard (optional)

### Worker Only (t430)

- [x] Port 10250 available (kubelet)
- [ ] Master IP and token available before running agent install

---

## 5. What Was Fixed and Why

### 5.1 Hostname — RFC 1123 compliance

**Problem:** Hostnames `T440p-Server` and `T430` contain uppercase letters.

**Why it matters:** Kubernetes node names are derived from the hostname. The Kubernetes spec (RFC 1123) requires node names to be lowercase alphanumeric with hyphens only. Uppercase hostnames cause node registration failures or unpredictable behavior.

**Fix applied:**
```bash
hostnamectl set-hostname t440p-server   # on T440p-Server
hostnamectl set-hostname t430           # on T430
```

### 5.2 Swap — disabled

**Problem:** Both nodes had 8191MB swap enabled.

**Why it matters:** Kubernetes assumes consistent memory availability. When the kernel swaps memory to disk, pod scheduling decisions become unreliable. Kubelets will refuse to start or emit warnings when swap is enabled unless explicitly configured to allow it (not default behavior in K3s).

**Fix applied:**
```bash
swapoff -a
sed -i '/\bswap\b/s/^/#/' /etc/fstab
```

### 5.3 SELinux — k3s-selinux policy

**Problem:** SELinux was Enforcing but `k3s-selinux` policy was not installed.

**Why it matters:** K3s runs containerd and creates special file contexts (e.g. `/usr/local/bin/k3s` needs `container_runtime_exec_t`). Without the policy, SELinux denies these operations and K3s fails to start.

**Fix applied:**
```bash
# Downloaded from GitHub releases (Rancher RPM repo is deprecated for Fedora)
dnf install -y /tmp/k3s-selinux-1.6-1.el9.noarch.rpm
```

> **Note:** The Rancher RPM repository (`rpm.rancher.io`) returns 404 for all CentOS/el8/el9 paths as of May 2026. The correct source is the GitHub releases page: `https://github.com/k3s-io/k3s-selinux/releases`

### 5.4 Firewalld — K3s ports

**Problem:** firewalld was active with some ports missing.

**Why it matters:** K3s requires specific ports to be open for cluster communication.

| Port | Protocol | Purpose |
|---|---|---|
| 6443 | TCP | K3s API server (kubectl, agents) |
| 10250 | TCP | Kubelet metrics / exec |
| 8472 | UDP | Flannel VXLAN overlay (pod-to-pod) |
| 51820 | UDP | WireGuard (if enabled) |
| 2379 | TCP | etcd client (master only) |
| 2380 | TCP | etcd peer (master only) |

**Fix applied:**
```bash
firewall-cmd --permanent --add-port=6443/tcp
firewall-cmd --permanent --add-port=10250/tcp
firewall-cmd --permanent --add-port=8472/udp
firewall-cmd --permanent --add-port=51820/udp
firewall-cmd --permanent --add-masquerade   # pod routing
firewall-cmd --reload
```

> **Important:** Also add the pod and service CIDRs to the trusted zone after K3s is installed:
> ```bash
> firewall-cmd --permanent --zone=trusted --add-source=10.42.0.0/16
> firewall-cmd --permanent --zone=trusted --add-source=10.43.0.0/16
> firewall-cmd --reload
> ```

### 5.5 Kernel Modules

**Problem:** `br_netfilter` and `overlay` not loaded (or loaded but not persistent).

**Why it matters:**
- `br_netfilter` — allows iptables to see bridged traffic, required for Flannel networking rules
- `overlay` — required by containerd for overlay filesystem (container layers)
- `ip_conntrack` — connection tracking for NAT (required for pod-to-pod and pod-to-service routing)

**Fix applied:**
```bash
modprobe br_netfilter overlay ip_conntrack
printf 'br_netfilter\noverlay\nip_conntrack\n' > /etc/modules-load.d/k3s.conf
```

### 5.6 Sysctl Parameters

**Problem:** `net.bridge.bridge-nf-call-iptables` not set.

**Why it matters:** Without this, bridged traffic bypasses iptables rules, breaking Flannel's network policies and pod-to-service routing.

**Fix applied:**
```bash
cat > /etc/sysctl.d/k3s.conf << EOF
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF
sysctl --system
```

---

## 6. Network Configuration for K3s

### 6.1 VLAN 20 — PROD

K3s nodes live in VLAN 20. pfSense routes traffic between VLANs.

```
VLAN 20 — 10.10.20.0/24
  t440p-server  10.10.20.100  (control-plane)
  t430          10.10.20.101  (worker1)
  P52 (future)  10.10.20.102  (worker2)

  DHCP range: 10.10.20.100 – 10.10.20.200
  Gateway:    10.10.20.1 (pfSense)
  DNS:        10.10.10.3 (AdGuard)
```

### 6.2 K3s Internal Networks

| Network | CIDR | Purpose |
|---|---|---|
| Pod network | `10.42.0.0/16` | Pod IPs assigned by Flannel |
| Service network | `10.43.0.0/16` | ClusterIP service IPs |
| Node network | `10.10.20.0/24` | Physical node IPs (VLAN 20) |

> These three networks must not overlap. The K3s defaults (10.42/10.43) are safe for this lab.

### 6.3 DNS Integration

AdGuard Home will resolve lab service names. Add these rewrites after K3s is installed:

| Domain | Target | Purpose |
|---|---|---|
| `k3s.mgmt` | `10.10.20.100` | K3s API endpoint |
| `*.lab.internal` | MetalLB IP pool | Ingress services (future) |

### 6.4 Static IP Recommendation

Both nodes currently have DHCP-assigned IPs in VLAN 20. While the DHCP lease is long (5664–7231 seconds), it is best practice to configure static IPs for cluster nodes.

**Option A — Static via NetworkManager (recommended):**
```bash
# On t440p-server
nmcli connection modify "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses "10.10.20.100/24" \
  ipv4.gateway "10.10.20.1" \
  ipv4.dns "10.10.10.3"
nmcli connection up "Wired connection 1"
```

**Option B — DHCP static reservation in pfSense:**

Navigate to `Services → DHCP Server → VLAN20 → Static Mappings`

| Hostname | MAC | IP |
|---|---|---|
| t440p-server | `28:d2:44:8c:20:89` | `10.10.20.100` |
| t430 | `28:d2:44:31:83:bc` | `10.10.20.101` |

Option B is simpler and doesn't require touching the nodes.

### 6.5 Firewall Rules — Pod CIDR

After K3s is installed, add the pod and service CIDRs to firewalld's trusted zone on **both nodes** so pod-to-pod traffic is not blocked:

```bash
sudo firewall-cmd --permanent --zone=trusted --add-source=10.42.0.0/16
sudo firewall-cmd --permanent --zone=trusted --add-source=10.43.0.0/16
sudo firewall-cmd --reload
```

---

## 7. K3s Component Overview

### 7.1 Components bundled in K3s (kept)

| Component | Purpose |
|---|---|
| Kubernetes API server | Cluster control plane |
| containerd 2.0 | Container runtime |
| CoreDNS | In-cluster DNS resolution |
| kube-proxy | Service traffic routing |
| Metrics Server | Resource metrics (kubectl top) |

### 7.2 Components disabled at install (replaced by enterprise alternatives)

| Disabled | Replaced by | Reason |
|---|---|---|
| Flannel CNI | **Cilium** | eBPF networking, NetworkPolicy, L7 visibility |
| Klipper ServiceLB | **Cilium L2** | Cilium replaces MetalLB natively |
| Traefik (default) | **Traefik v3 + Nginx** | Separate internal/external ingress |
| K3s NetworkPolicy | **Cilium** | More powerful policy engine |

> K3s is installed with `--flannel-backend=none --disable-network-policy --disable=traefik` so nodes start without CNI. Cilium must be installed immediately after, before any pods can schedule.

### 7.3 Enterprise Stack — Full Component List

| Category | Component | Purpose |
|---|---|---|
| **Orchestration** | K3s | Lightweight Kubernetes distribution |
| | Helm v3 | Package manager |
| **CNI & Networking** | Cilium | eBPF CNI · NetworkPolicy L3/L4/L7 · WireGuard mTLS |
| | Hubble | Network flow observability · L7 visibility |
| | Cilium L2 LB | Replaces MetalLB — L2 announcement |
| **Service Mesh** | Istio | mTLS · traffic management · canary releases |
| | Kiali | Service mesh topology · traffic visualization |
| **Ingress** | Traefik v3 | Internal services · lab admin UIs |
| | Nginx Ingress | External / production-exposed services |
| **Storage** | Longhorn CSI | Distributed block storage · 2× replication |
| **TLS** | cert-manager | Automatic TLS · ACME · Let's Encrypt |
| **GitOps** | ArgoCD | Pull-based GitOps deployments |
| | Tekton | CI pipelines · SAST · image builds |
| **SCM & Registry** | Gitea | Self-hosted Git + webhooks |
| | Harbor | OCI registry · vulnerability scanning |
| **IAM** | Keycloak | OIDC IdP · SAML · multi-realm |
| | HashiCorp Vault | Secrets management · PKI |
| | External Secrets Op. | Vault → K8s Secrets sync |
| **Observability** | Prometheus | Metrics scraping + storage |
| | Grafana | Dashboards + alerting UI |
| | Loki | Log aggregation · LogQL |
| | Tempo | Distributed tracing · OTLP |
| | Alertmanager | Alert routing · silencing |

### 7.4 Why Cilium over Flannel

| | Flannel | Cilium |
|---|---|---|
| Dataplane | iptables / VXLAN | eBPF (kernel bypass) |
| NetworkPolicy | Requires extra plugin | Native L3/L4/L7 |
| Load Balancing | Klipper (basic) | L2 announcement (replaces MetalLB) |
| Observability | None | Hubble — per-flow visibility |
| mTLS | None | WireGuard transparent encryption |
| Performance | ~10% overhead | Near-native kernel performance |
| Enterprise use | Dev/lab only | Production Kubernetes standard |

### 7.5 Why Istio for Service Mesh

Istio provides zero-trust networking between microservices:
- **mTLS** — all pod-to-pod traffic encrypted by default
- **Traffic Management** — canary releases, A/B testing, circuit breakers
- **Observability** — L7 metrics, traces, access logs per service
- **Kiali** — visual service topology and health dashboard

> Istio + Cilium together give both infrastructure-level (Cilium eBPF) and application-level (Istio sidecar) security and observability.

### 7.6 Why Dual Ingress

| | Traefik v3 | Nginx Ingress |
|---|---|---|
| Purpose | Internal lab services, admin UIs | External / production services |
| Config | Dynamic (file/CRD) | Standard Kubernetes Ingress |
| Auth | Forward auth (Keycloak) | External auth via annotations |
| Use cases | Proxmox UI, AdGuard, Grafana, ArgoCD | Public APIs, exposed apps |
| TLS | cert-manager integration | cert-manager integration |

---

## 8. Installation Plan

### 8.1 Order of Operations

```
Step 1 — Install K3s server on t440p-server
Step 2 — Get cluster token from t440p-server
Step 3 — Install K3s agent on t430
Step 4 — Verify cluster: kubectl get nodes
Step 5 — Add pod CIDRs to firewalld trusted zone (both nodes)
Step 6 — Add DNS rewrites in AdGuard
Step 7 — Verify workloads: kubectl get pods -A
```

### 8.2 Step 1 — Install K3s Server (t440p-server)

```bash
# Install K3s — disable Flannel and Traefik (Cilium replaces both)
curl -sfL https://get.k3s.io | \
  INSTALL_K3S_EXEC="--selinux \
    --write-kubeconfig-mode 644 \
    --tls-san 10.10.20.100 \
    --tls-san t440p-server \
    --flannel-backend=none \
    --disable-network-policy \
    --disable=traefik" \
  sh -

# Verify service is running
sudo systemctl status k3s

# Node will be NotReady until Cilium is installed — this is expected
sudo kubectl get nodes
```

**Flags explained:**

| Flag | Purpose |
|---|---|
| `--selinux` | Enable SELinux support in containerd |
| `--write-kubeconfig-mode 644` | Allow non-root kubectl access |
| `--tls-san 10.10.20.100` | Add node IP to TLS certificate SANs |
| `--tls-san t440p-server` | Add hostname to TLS certificate SANs |
| `--flannel-backend=none` | Disable Flannel CNI — Cilium will replace it |
| `--disable-network-policy` | Disable K3s built-in NetworkPolicy — Cilium handles this |
| `--disable=traefik` | Disable default Traefik — we install our own dual ingress |

> ⚠️ After this step, nodes will show `NotReady`. This is expected — no CNI is installed yet. Proceed immediately to Step 2 (Cilium install).

### 8.2b Step 1b — Install Cilium CNI

Install Cilium immediately after K3s server, before joining workers:

```bash
# Install Helm if not present
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Add Cilium repo
helm repo add cilium https://helm.cilium.io
helm repo update

# Install Cilium with L2 LB (replaces MetalLB) and Hubble
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set l2announcements.enabled=true \
  --set hubble.relay.enabled=true \
  --set hubble.ui.enabled=true \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=10.10.20.100 \
  --set k8sServicePort=6443

# Wait for Cilium to be ready
sudo kubectl -n kube-system rollout status daemonset/cilium

# Verify node is now Ready
sudo kubectl get nodes
```

### 8.3 Step 2 — Get Cluster Token

```bash
# On t440p-server
sudo cat /var/lib/rancher/k3s/server/node-token
```

Save this token — it is required to join worker nodes.

### 8.4 Step 3 — Install K3s Agent (t430)

```bash
# On t430 — replace TOKEN with value from Step 2
curl -sfL https://get.k3s.io | \
  K3S_URL="https://10.10.20.100:6443" \
  K3S_TOKEN="TOKEN_FROM_STEP_2" \
  INSTALL_K3S_EXEC="--selinux" \
  sh -

# Verify agent service
sudo systemctl status k3s-agent
```

### 8.5 Step 4 — Verify Cluster

```bash
# On t440p-server
sudo kubectl get nodes -o wide
```

Expected output:
```
NAME            STATUS   ROLES                  AGE   VERSION        INTERNAL-IP
t440p-server    Ready    control-plane,master   Xm    v1.31.x+k3s1  10.10.20.100
t430            Ready    <none>                 Xm    v1.31.x+k3s1  10.10.20.101
```

Both nodes must show `Ready` before proceeding.

### 8.6 Step 5 — Post-Install Firewall (both nodes)

```bash
# Run on BOTH t440p-server and t430
sudo firewall-cmd --permanent --zone=trusted --add-source=10.42.0.0/16
sudo firewall-cmd --permanent --zone=trusted --add-source=10.43.0.0/16
sudo firewall-cmd --reload
```

### 8.7 Step 6 — kubectl from Daily Driver (P53)

Configure remote kubectl access from the P53 daily driver:

```bash
# On t440p-server — copy kubeconfig
sudo cat /etc/rancher/k3s/k3s.yaml
```

On P53:
```bash
mkdir -p ~/.kube

# Copy content from above, replace 127.0.0.1 with 10.10.20.100
# Save to ~/.kube/config

# Test
kubectl get nodes
kubectl get pods -A
```

---

## 9. Post-Installation Roadmap

### Phase 1 — Cluster stable (immediate after install)

```
✅ K3s server on t440p-server
✅ K3s agent on t430
✅ kubectl from P53 daily driver
⏳ Static IPs or DHCP reservations for nodes
⏳ AdGuard DNS rewrites: k3s.mgmt, *.lab.internal
⏳ Verify Traefik ingress controller running
⏳ Verify CoreDNS running
```

### Phase 2 — Add Worker Node 2 (P52)

```
⏳ Install Fedora Server on P52
⏳ Run homelab-k3s-precheck.sh --role worker on P52
⏳ Run homelab-k3s-prefix.sh --role worker on P52
⏳ Join P52 as K3s agent
```

> P52 (i7 6C/12T, 32GB DDR4, Quadro P1000) is the recommended worker2 for build and ML workloads.

### Phase 3 — Storage (requires 3 nodes)

```
⏳ Install Longhorn CSI
⏳ Verify 3-node replication (2× default)
⏳ Create StorageClasses: longhorn (default), longhorn-single, longhorn-rwx
```

### Phase 4 — GitOps

```
⏳ Deploy Gitea (self-hosted Git)
⏳ Deploy ArgoCD
⏳ Configure GitOps pipeline
⏳ Deploy Harbor OCI registry
```

### Phase 5 — Observability

```
⏳ Deploy Prometheus + Grafana stack
⏳ Add AdGuard exporter (scrape 10.10.10.3:9617)
⏳ Deploy Loki + Promtail for log aggregation
⏳ Configure Alertmanager
```

---

## 10. Troubleshooting Reference

### K3s service fails to start

```bash
# Check logs
sudo journalctl -u k3s -f
sudo journalctl -u k3s-agent -f

# Common causes:
# - SELinux denial → check: sudo ausearch -m avc -ts recent
# - Port 6443 in use → check: sudo ss -tlnp | grep 6443
# - Swap still enabled → check: free -m | grep Swap
# - Token mismatch → re-check /var/lib/rancher/k3s/server/node-token
```

### Node stuck in NotReady

```bash
# Check kubelet logs
sudo journalctl -u k3s -n 100 | grep -i error

# Check CNI
sudo kubectl get pods -n kube-system | grep flannel
sudo kubectl describe pod -n kube-system <flannel-pod>

# Most common fix — add pod CIDRs to firewalld
sudo firewall-cmd --permanent --zone=trusted --add-source=10.42.0.0/16
sudo firewall-cmd --permanent --zone=trusted --add-source=10.43.0.0/16
sudo firewall-cmd --reload
```

### SELinux denials after install

```bash
# Check for denials
sudo ausearch -m avc -ts recent | grep k3s

# If denials found, check k3s-selinux version
rpm -q k3s-selinux

# Temporary workaround (not recommended for production)
sudo setenforce 0
```

### Worker cannot join cluster

```bash
# Verify token is correct (on master)
sudo cat /var/lib/rancher/k3s/server/node-token

# Verify API port is reachable from worker
curl -k https://10.10.20.100:6443

# Check firewalld on master
sudo firewall-cmd --list-ports | grep 6443
```

### etcd performance issues (master)

```bash
# Check disk I/O latency
sudo fio --filename=/var/lib/rancher/k3s/server/db/etcd \
  --direct=1 --rw=randwrite --bs=4k \
  --ioengine=libaio --iodepth=1 --runtime=10 \
  --numjobs=1 --time_based --name=etcd-bench

# etcd needs <10ms latency — HDDs typically give 100ms+
# SSD strongly recommended for the master node
```

### kubectl connection refused from P53

```bash
# Verify kubeconfig has correct server IP
grep server ~/.kube/config
# Should show: https://10.10.20.100:6443

# Verify API server is running on master
curl -k https://10.10.20.100:6443/healthz
# Expected: ok
```

---

## Appendix A — Quick Reference

### Node Summary

| Node | Role | IP | Hostname |
|---|---|---|---|
| T440p | K3s control-plane | 10.10.20.100 | t440p-server |
| T430 | K3s worker1 | 10.10.20.101 | t430 |
| P52 (future) | K3s worker2 | 10.10.20.102 | p52 |

### Script Usage

```bash
# Pre-check (read-only, run as any user)
./homelab-k3s-precheck.sh --role master   # on t440p-server
./homelab-k3s-precheck.sh --role worker   # on t430 / P52

# Pre-fix (requires sudo)
sudo ./homelab-k3s-prefix.sh --role master --hostname t440p-server
sudo ./homelab-k3s-prefix.sh --role worker --hostname t430

# Dry-run mode (preview without changes)
sudo ./homelab-k3s-prefix.sh --role worker --dry-run
```

### K3s Install Commands (Enterprise Stack — Cilium)

```bash
# Step 1 — Master (t440p-server) — disable Flannel + Traefik
curl -sfL https://get.k3s.io | \
  INSTALL_K3S_EXEC="--selinux --write-kubeconfig-mode 644 \
    --tls-san 10.10.20.100 --tls-san t440p-server \
    --flannel-backend=none --disable-network-policy \
    --disable=traefik" sh -

# Step 2 — Install Cilium CNI (node NotReady until this runs)
helm repo add cilium https://helm.cilium.io && helm repo update
helm install cilium cilium/cilium --namespace kube-system \
  --set l2announcements.enabled=true \
  --set hubble.relay.enabled=true \
  --set hubble.ui.enabled=true \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=10.10.20.100 \
  --set k8sServicePort=6443

# Step 3 — Get token
sudo cat /var/lib/rancher/k3s/server/node-token

# Step 4 — Worker (t430)
curl -sfL https://get.k3s.io | \
  K3S_URL="https://10.10.20.100:6443" \
  K3S_TOKEN="<TOKEN>" \
  INSTALL_K3S_EXEC="--selinux" sh -

# Step 5 — Post-install firewall (both nodes)
sudo firewall-cmd --permanent --zone=trusted --add-source=10.42.0.0/16
sudo firewall-cmd --permanent --zone=trusted --add-source=10.43.0.0/16
sudo firewall-cmd --reload

# Step 6 — Verify cluster
sudo kubectl get nodes -o wide
sudo kubectl get pods -A
```

### Key File Paths

| Path | Purpose |
|---|---|
| `/etc/rancher/k3s/k3s.yaml` | Kubeconfig |
| `/var/lib/rancher/k3s/server/node-token` | Cluster join token |
| `/var/lib/rancher/k3s/server/db/` | etcd data |
| `/etc/rancher/k3s/registries.yaml` | Container registry config |
| `/etc/modules-load.d/k3s.conf` | Persistent kernel modules |
| `/etc/sysctl.d/k3s.conf` | K3s sysctl parameters |
| `/etc/modules-load.d/k3s.conf` | Kernel module persistence |

---

*Document v1.0 — Pre-installation complete · Both nodes [PASS] READY · May 2026*
