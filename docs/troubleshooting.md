# Enterprise HomeLab — Troubleshooting Reference

**Version:** 1.0
**Date:** May 2026
**Scope:** Proxmox · pfSense · AdGuard · TL-SG108E · K3s · Cilium · Longhorn

---

## Table of Contents

1. [Proxmox VE](#1-proxmox-ve)
2. [pfSense](#2-pfsense)
3. [AdGuard Home](#3-adguard-home)
4. [TL-SG108E Switch](#4-tl-sg108e-switch)
5. [K3s Node Preparation](#5-k3s-node-preparation)
6. [K3s Cluster](#6-k3s-cluster)
7. [Cilium CNI](#7-cilium-cni)
8. [Longhorn Storage](#8-longhorn-storage)
9. [Network Connectivity](#9-network-connectivity)
10. [DNS Resolution](#10-dns-resolution)
11. [Quick Diagnostic Commands](#11-quick-diagnostic-commands)

---

## 1. Proxmox VE

### VM/LXC has no network after reboot

```bash
# Check if bridge is VLAN-aware
cat /sys/class/net/vmbr1/bridge/vlan_filtering
# Expected: 1

# Check VM VLAN tag
qm config VMID | grep net

# Restart VM to re-create tap interface with correct VLAN
qm stop VMID && qm start VMID
```

**Root cause:** `bridge-vlan-aware yes` or `bridge-vids 2-4094` missing from `/etc/network/interfaces`. See `HomeLab-Proxmox-VLAN-Persistence.md`.

---

### LXC container won't start after network change

```bash
# Check container config
pct config 101

# Check for bridge errors
journalctl -u pve-manager --no-pager | tail -20

# Force restart
pct stop 101 && pct start 101
pct status 101
```

---

### `Failed to create network device` on LXC start

**Cause:** `tag=` parameter on a non-VLAN-aware bridge.

```bash
# Verify vmbr1 is VLAN-aware
bridge vlan show dev vmbr1 | head -5

# Fix: ensure /etc/network/interfaces has:
# bridge-vlan-aware yes
# bridge-vids 2-4094
# then:
ifreload -a
pct start 101
```

---

### Proxmox web UI unreachable

```bash
# Check service
systemctl status pveproxy

# Restart if needed
systemctl restart pveproxy

# Check port
ss -tlnp | grep 8006
```

---

## 2. pfSense

### pfSense VM not routing between VLANs

```bash
# On Proxmox, verify VM net1 has no VLAN tag (trunk mode)
qm config 100 | grep net1
# Expected: bridge=vmbr1,firewall=0  (NO tag= parameter)

# Check pfSense sub-interfaces
# In pfSense: Interfaces → Interface Assignments
# Each VLAN should have its own OPT interface
```

---

### DHCP not assigning IPs on a VLAN

```bash
# On client — force DHCP renewal
sudo dhclient -r enp0s25 && sudo dhclient enp0s25

# Verify DHCP is enabled in pfSense
# Services → DHCP Server → VLAN_XX → Enable DHCP server on this interface

# Check DHCP range is configured
# Range: 10.10.20.100 – 10.10.20.200 for VLAN 20
```

---

### Client gets wrong VLAN IP (e.g. 10.10.10.x instead of 10.10.20.x)

**Cause:** Switch PVID misconfigured for that port.

```bash
# Check switch — access http://10.10.10.2
# VLAN → 802.1Q PVID Setting
# Verify the port has PVID = 20, not 10 or 1
```

---

### pfSense web UI unreachable after RAM reduction

The M720q pfSense VM was reduced from 4.5GB → 2GB RAM. If unresponsive:

```bash
# Check VM status
qm status 100

# Increase RAM if needed
qm stop 100
qm set 100 --memory 2048
qm start 100
```

---

## 3. AdGuard Home

### AdGuard web UI unreachable at 10.10.10.3:3000 or 192.168.1.100:3000

```bash
# Verify LXC is running
pct status 101

# Check AdGuard service
pct exec 101 -- rc-service AdGuardHome status
# Expected: status: started

# Check ports
pct exec 101 -- ss -tlnp | grep -E '53|3000'

# Restart if needed
pct exec 101 -- rc-service AdGuardHome restart
```

---

### DNS not resolving from a VLAN client

```bash
# Test AdGuard directly
nslookup google.com 10.10.10.3

# Verify DHCP is distributing AdGuard as DNS
# pfSense: Services → DHCP Server → VLAN_XX → DNS Server = 10.10.10.3

# Force DHCP renewal on client
sudo nmcli connection down "Wired connection 1"
sudo nmcli connection up "Wired connection 1"
```

---

### `.mgmt` DNS rewrites not resolving from daily driver (P53)

```bash
# Verify P53 is using AdGuard as DNS
resolvectl status | grep -A5 wlp82s0
# Current DNS Server: 192.168.1.100

# If not, fix NetworkManager
nmcli connection modify "INFINITUMC241" ipv4.dns "192.168.1.100" ipv4.ignore-auto-dns yes
nmcli connection up "INFINITUMC241"

# Test rewrite
nslookup proxmox.mgmt
# Expected: 192.168.1.65
```

---

### AdGuard is dual-homed but only responds on one interface

```bash
# Verify both interfaces
pct exec 101 -- ip addr show eth0
pct exec 101 -- ip addr show eth1

# Verify routing table (default must be via eth0/pfSense)
pct exec 101 -- ip route
# Expected:
# default via 10.10.10.1 dev eth0
# 192.168.1.0/24 dev eth1 scope link

# If wrong default route — restart container
pct reboot 101
```

---

## 4. TL-SG108E Switch

### Switch management UI unreachable at 10.10.10.2

```bash
# You must be on a device with IP in 10.10.10.x (VLAN 10 MGMT)
# Windows VM 199 at 10.10.10.50 can reach it
# Or from Proxmox: ping 10.10.10.2

# If unreachable, check switch port 1 PVID and trunk config
# Port 1 should be tagged member of VLAN 10 in 802.1Q table
```

---

### Port connected but no link / wrong VLAN

1. Verify cable is properly seated
2. Check **802.1Q PVID Setting** — port must have PVID matching intended VLAN
3. Check **802.1Q VLAN** — port must be **Untagged** member of that VLAN

```
VLAN 20 → Ports 2, 3, 4, 5, 6 as Untagged
VLAN 10 → Port 1 as Tagged (trunk)
VLAN 90 → Port 8 as Untagged (Parrot OS)
```

---

## 5. K3s Node Preparation

### Pre-check script exits with warnings

```bash
# Re-run after fixes
./homelab-k3s-precheck.sh --role master    # Dell 7490 #1
./homelab-k3s-precheck.sh --role worker    # all others

# Common warnings and fixes:
# [WARN] Swap enabled → sudo swapoff -a && sed -i '/swap/s/^/#/' /etc/fstab
# [WARN] SELinux Enforcing → see prefix script FIX 3
# [WARN] firewalld ports missing → sudo firewall-cmd --permanent --add-port=6443/tcp && sudo firewall-cmd --reload
# [WARN] br_netfilter not loaded → sudo modprobe br_netfilter
# [WARN] Time not synced → sudo timedatectl set-ntp true
```

---

### k3s-selinux RPM install fails (404)

The Rancher RPM repo (`rpm.rancher.io`) is deprecated for Fedora 42. Use GitHub releases:

```bash
curl -fsSL -o /tmp/k3s-selinux.rpm \
  https://github.com/k3s-io/k3s-selinux/releases/download/v1.6.latest.1/k3s-selinux-1.6-1.el9.noarch.rpm
sudo dnf install -y /tmp/k3s-selinux.rpm
rpm -q k3s-selinux
```

---

### firewall-cmd --query-port returns false even though port is open

Known issue on Fedora 42 — `--query-port` may not match correctly. Use `--list-ports` instead:

```bash
sudo firewall-cmd --list-ports --permanent
# Verify: 6443/tcp 10250/tcp 8472/udp 51820/udp
```

The pre-check and prefix scripts (v1.2+) already use `--list-ports` to avoid this.

---

## 6. K3s Cluster

### Node shows NotReady after K3s server install

**This is expected** when Cilium has not been installed yet. Nodes go `NotReady` without a CNI.

```bash
# Install Cilium immediately after K3s server
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set k8sServiceHost=10.10.20.100 \
  --set k8sServicePort=6443 \
  --set flannel-backend=none

# Watch for Ready
kubectl -n kube-system rollout status daemonset/cilium
kubectl get nodes
```

---

### Worker node fails to join cluster

```bash
# Verify token is correct (on master)
sudo cat /var/lib/rancher/k3s/server/node-token

# Verify API is reachable from worker
curl -k https://10.10.20.100:6443/healthz
# Expected: ok

# Check firewalld on master allows 6443
sudo firewall-cmd --list-ports | grep 6443

# Check k3s-agent logs on worker
sudo journalctl -u k3s-agent -f
```

---

### etcd slow / leader elections

**Cause:** Root disk is HDD (only relevant for T440p if used as control-plane, which is NOT recommended).

```bash
# Check disk type
cat /sys/block/$(findmnt -n -o SOURCE / | xargs lsblk -no pkname)/queue/rotational
# 0 = SSD ✓ / 1 = HDD ✗

# Check etcd latency
sudo kubectl -n kube-system exec -it etcd-$(hostname) -- \
  etcdctl endpoint health --cluster
```

> **Prevention:** Dell 7490 #1 is the control-plane. Its 256GB SSD ensures etcd latency <10ms.

---

### Pod stuck in Pending

```bash
# Check events
kubectl describe pod POD_NAME -n NAMESPACE

# Check node resources
kubectl describe nodes | grep -A5 "Allocated resources"

# Check taints
kubectl describe node NODE_NAME | grep Taints
# T440p: storage=preferred:PreferNoSchedule
# P52: gpu=true:NoSchedule
```

---

## 7. Cilium CNI

### Cilium pods in CrashLoopBackOff

```bash
# Check logs
kubectl -n kube-system logs -l k8s-app=cilium --previous

# Common cause: K3s was not installed with --flannel-backend=none
# Fix: reinstall K3s with correct flags
curl -sfL https://get.k3s.io | \
  INSTALL_K3S_EXEC="--flannel-backend=none --disable-network-policy --disable=traefik" sh -
```

---

### Pod-to-pod communication fails

```bash
# Verify pod CIDRs are in firewalld trusted zone on ALL nodes
sudo firewall-cmd --list-all --zone=trusted | grep source
# Expected: 10.42.0.0/16 and 10.43.0.0/16

# If missing:
sudo firewall-cmd --permanent --zone=trusted --add-source=10.42.0.0/16
sudo firewall-cmd --permanent --zone=trusted --add-source=10.43.0.0/16
sudo firewall-cmd --reload
```

---

### Hubble UI not accessible

```bash
# Verify Hubble relay is running
kubectl -n kube-system get pods | grep hubble

# Port-forward for local access
kubectl -n kube-system port-forward svc/hubble-ui 12000:80

# Access at http://localhost:12000
```

---

## 8. Longhorn Storage

### Longhorn volume stuck in Degraded

```bash
# Check replicas
kubectl -n longhorn-system get replicas

# Verify T440p storage node is healthy
kubectl get nodes | grep t440p-storage
# Must show Ready

# Check Longhorn manager on T440p
kubectl -n longhorn-system logs -l app=longhorn-manager \
  --field-selector spec.nodeName=t440p-storage
```

---

### T440p HDD paths not visible to Longhorn

```bash
# On T440p, verify disks
lsblk
# Expected:
# sda (SSD 512GB — OS)
# sdb (HDD 1TB — Longhorn)
# sdc (HDD 1TB — Longhorn)

# In Longhorn UI: Node → t440p-storage → Edit → Add Disk
# Path: /var/lib/longhorn-hdd1 and /var/lib/longhorn-hdd2
# (after mounting sdb and sdc to those paths)
```

---

### PVC stuck in Pending

```bash
kubectl describe pvc PVC_NAME -n NAMESPACE

# Common causes:
# - No storage class available → kubectl get storageclass
# - Insufficient Longhorn replicas → check node count
# - Longhorn manager not running → kubectl -n longhorn-system get pods
```

---

## 9. Network Connectivity

### Cannot ping between VLANs

```bash
# Verify pfSense firewall rules allow the traffic
# pfSense: Firewall → Rules → VLAN_XX

# Test from pfSense shell (Diagnostics → Command Prompt)
ping -c 3 10.10.20.100    # VLAN 20 from VLAN 10

# Verify both interfaces are UP in pfSense
# Interfaces → Interface Assignments
```

---

### No internet from VLAN 20/30

```bash
# Test from a node
ping 8.8.8.8

# If ping fails, check pfSense NAT
# pfSense: Firewall → NAT → Outbound
# Hybrid or Manual mode must include VLAN 20/30 subnets

# Check pfSense WAN interface is up
# Status → Interfaces → WAN
```

---

### T440p storage node can't reach cluster nodes

T440p is in VLAN 20. All K3s nodes are in VLAN 20. Check switch port 5 configuration:

```bash
# Verify PVID on switch port 5
# http://10.10.10.2 → VLAN → 802.1Q PVID Setting → Port 5 = 20

# On T440p, verify IP is in VLAN 20 range
ip addr show enp0s25
# Expected: 10.10.20.104/24
```

---

## 10. DNS Resolution

### DNS rewrite not resolving (e.g. `k3s.mgmt`)

```bash
# Test directly against AdGuard
nslookup k3s.mgmt 10.10.10.3
nslookup k3s.mgmt 192.168.1.100

# If it resolves directly but not from system DNS,
# check that NetworkManager is using AdGuard:
resolvectl status | grep "DNS Server"

# Fix if needed (P53 daily driver)
nmcli connection modify "INFINITUMC241" \
  ipv4.dns "192.168.1.100" ipv4.ignore-auto-dns yes
nmcli connection up "INFINITUMC241"
```

---

### DNS rewrites to update after K3s install

After Cilium L2 LB assigns IPs to services, update AdGuard DNS rewrites:

```
Filters → DNS Rewrites → Add DNS rewrite

argocd.lab.internal    → <MetalLB IP>
gitea.lab.internal     → <MetalLB IP>
grafana.lab.internal   → <MetalLB IP>
harbor.lab.internal    → <MetalLB IP>
hubble.lab.internal    → <MetalLB IP>
kiali.lab.internal     → <MetalLB IP>
ollama.lab.internal    → <MetalLB IP>
```

---

## 11. Quick Diagnostic Commands

### Full lab health check

```bash
# Proxmox — all VMs/LXCs
qm list && pct list

# pfSense connectivity
ping -c 2 10.10.10.1   # pfSense LAN
ping -c 2 10.10.10.3   # AdGuard

# AdGuard DNS
nslookup google.com 10.10.10.3
nslookup proxmox.mgmt

# K3s cluster (from control-plane)
sudo kubectl get nodes -o wide
sudo kubectl get pods -A | grep -v Running
sudo kubectl top nodes

# Cilium health
sudo kubectl -n kube-system exec -it ds/cilium -- cilium status

# Longhorn
sudo kubectl -n longhorn-system get pods
sudo kubectl get pvc -A

# Switch reachability
ping -c 2 10.10.10.2

# VLAN 20 nodes
ping -c 1 10.10.20.100   # dell-7490-1
ping -c 1 10.10.20.101   # dell-7490-2
ping -c 1 10.10.20.102   # dell-5480
ping -c 1 10.10.20.103   # p52
ping -c 1 10.10.20.104   # t440p-storage
```

### Service restart order (after full power cycle)

```bash
# 1. M720q boots → Proxmox starts
# 2. LXC 101 (AdGuard) — starts automatically (onboot=1)
# 3. VM 100 (pfSense) — starts automatically (onboot=1)
# 4. K3s nodes boot → k3s-agent starts automatically
# 5. Verify: kubectl get nodes (all Ready within ~60s)
```

### Useful log commands

```bash
# AdGuard
pct exec 101 -- tail -f /var/log/AdGuardHome/AdGuardHome.log

# pfSense (from pfSense shell)
clog /var/log/system.log

# K3s server
sudo journalctl -u k3s -f

# K3s agent
sudo journalctl -u k3s-agent -f

# Cilium
kubectl -n kube-system logs -l k8s-app=cilium --tail=50

# Longhorn
kubectl -n longhorn-system logs -l app=longhorn-manager --tail=50
```

## 12. Monitoring Stack (T430)

### Contenedor no arranca — permission denied

**Causa más común:** SELinux Enforcing bloquea acceso de contenedores a volúmenes del host.

```bash
# Síntoma en logs
sudo podman logs prometheus 2>&1 | grep "permission denied"

# Fix — el :z en los volume mounts re-etiqueta para SELinux
# Verificar que todos los volumes en docker-compose.yml tengan :z
grep -A2 "volumes:" /opt/monitoring/docker-compose.yml
# Debe mostrar: /opt/monitoring/prometheus/data:/prometheus:z

# Verificar UIDs
stat -c '%u:%g' /opt/monitoring/prometheus/data   # → 65534:65534
stat -c '%u:%g' /opt/monitoring/grafana/data      # → 472:472
stat -c '%u:%g' /opt/monitoring/tempo/data        # → 10001:10001
stat -c '%u:%g' /srv/storage                      # → 10001:10001

# Reaplicar permisos si es necesario
sudo chown -R 65534:65534 /opt/monitoring/prometheus/data
sudo chown -R 65534:65534 /opt/monitoring/alertmanager/data
sudo chown -R 472:472     /opt/monitoring/grafana/data
sudo chown -R 10001:10001 /opt/monitoring/tempo/data
sudo chown -R 10001:10001 /srv/storage
```

### Loki no arranca — delete-request-store error

```bash
# Síntoma
sudo podman logs loki 2>&1 | grep "delete-request-store"
# Error: invalid compactor config: compactor.delete-request-store should be configured

# Fix — agregar al compactor en loki.yml
grep "delete_request_store" /opt/monitoring/loki/config/loki.yml
# Debe existir: delete_request_store: filesystem
```

### Prometheus puerto 9090 ocupado por Cockpit

```bash
# Verificar conflicto
ss -tlnp | grep 9090
# Si muestra cockpit: Prometheus debe usar 9091

# Verificar mapeo en docker-compose
grep "9091\|9090" /opt/monitoring/docker-compose.yml
# Debe mostrar: "9091:9090"

# Acceso externo siempre por 9091
curl -sf http://localhost:9091/-/healthy
```

### Grafana password — el ! rompe bash

```bash
# Síntoma: curl -u "admin:<REDACTED>" retorna 401
# Causa: el ! es interpretado por bash como expansión de historia

# Fix — resetear password sin caracteres especiales problemáticos
sudo podman exec grafana grafana cli admin reset-admin-password <REDACTED>

# Verificar
curl -sf -u "admin:<REDACTED>" http://localhost:3000/api/org | grep name
```

### Grafana import dashboard vía API

```bash
# Descargar y preparar payload
curl -fsSL -o /tmp/dash-1860.json \
  "https://grafana.com/api/dashboards/1860/revisions/latest/download"

python3 << 'PYEOF'
import json
with open('/tmp/dash-1860.json') as f:
    dashboard = json.load(f)
payload = {
    "dashboard": dashboard,
    "overwrite": True,
    "inputs": [{"name": "DS_PROMETHEUS", "type": "datasource",
                "pluginId": "prometheus", "value": "Prometheus"}],
    "folderId": 0
}
with open('/tmp/payload-1860.json', 'w') as f:
    json.dump(payload, f)
PYEOF

# Importar
curl -s -X POST \
  -u "admin:<REDACTED>" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/dashboards/import \
  -d @/tmp/payload-1860.json | python3 -m json.tool | grep -E "status|url"
```

### Stack completo no responde — reinicio limpio

```bash
sudo bash << 'EOF'
cd /opt/monitoring
podman-compose down 2>/dev/null || true
podman rm -f prometheus grafana loki tempo alertmanager 2>/dev/null || true
sleep 5
podman-compose up -d
sleep 25
echo "=== Health checks ==="
curl -sf http://localhost:9091/-/healthy  && echo "[OK] Prometheus" || echo "[FAIL] Prometheus"
curl -sf http://localhost:3000/api/health && echo "[OK] Grafana"    || echo "[FAIL] Grafana"
curl -sf http://localhost:3100/ready      && echo "[OK] Loki"       || echo "[FAIL] Loki"
curl -sf http://localhost:3200/ready      && echo "[OK] Tempo"      || echo "[FAIL] Tempo"
curl -sf http://localhost:9093/-/healthy  && echo "[OK] Alertmanager" || echo "[FAIL] Alertmanager"
EOF
```

### Verificar targets Prometheus

```bash
curl -s http://localhost:9091/api/v1/targets | \
  python3 -c "
import sys,json
t=json.load(sys.stdin)['data']['activeTargets']
for x in t:
  print(f\"  {x['labels'].get('job','?'):25s} {x['health']:6s} {x['labels'].get('instance','?')}\")"
```

---

| Error | Component | Fix |
|---|---|---|
| `Failed to create network device` | Proxmox LXC | Add `bridge-vlan-aware yes` to vmbr1 |
| `certificate is not yet valid` | AdGuard curl install | Sync NTP on Proxmox host |
| `settimeofday: Operation not permitted` | LXC container | Fix time on Proxmox host, not in LXC |
| `Get-NetAdapter` empty in Windows VM | Proxmox VM | Use `e1000` NIC instead of `virtio` |
| `firewall-cmd --query-port` false positive | Fedora 42 | Use `--list-ports` instead |
| `k3s-selinux` 404 from Rancher repo | Fedora 42 | Download from GitHub releases |
| Node `NotReady` after K3s install | K3s + Cilium | Install Cilium CNI immediately |
| etcd timeouts | K3s master | Ensure master (Dell 7490 #1) uses SSD |
| Longhorn volume Degraded | Longhorn | Check T440p storage node is Ready |
| DNS `.mgmt` NXDOMAIN from P53 | NetworkManager | Set `ipv4.ignore-auto-dns yes` |
| VLAN client gets 10.10.10.x IP | Switch PVID | Correct PVID on switch port |
| Pod stuck in Pending (T440p) | K3s taints | Add toleration for `storage=preferred` |
| Pod stuck in Pending (P52) | K3s taints | Add toleration for `gpu=true` |

---

*Document v1.0 — Enterprise HomeLab Troubleshooting · May 2026*
