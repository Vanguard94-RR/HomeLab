# Enterprise HomeLab — Installation & Configuration Manual

**Version:** 1.0  
**Date:** May 2026  
**Scope:** Proxmox VE · AdGuard Home (Alpine LXC) · Network DNS Configuration  
**Environment:** Lenovo M720q · Proxmox 9.1.1 · Alpine Linux 3.22 · AdGuard Home v0.107.76

---

## Table of Contents

1. [Environment Overview](#1-environment-overview)
2. [Proxmox VE — Base Setup](#2-proxmox-ve--base-setup)
3. [Alpine Linux LXC Container](#3-alpine-linux-lxc-container)
4. [AdGuard Home Installation](#4-adguard-home-installation)
5. [AdGuard Home Configuration](#5-adguard-home-configuration)
6. [Network Integration — Telmex/Infinitum Router](#6-network-integration--telmexinfinitum-router)
7. [DHCP Static Reservation](#7-dhcp-static-reservation)
8. [Validation & Testing](#8-validation--testing)
9. [Maintenance & Operations](#9-maintenance--operations)
10. [Roadmap — Next Steps](#10-roadmap--next-steps)

---

## 1. Environment Overview

### Hardware

| Component | Device | Role |
|---|---|---|
| Hypervisor host | Lenovo M720q | Proxmox VE node |
| CPU | Intel Core i5-8500T (6C/6T) | — |
| RAM | 32GB DDR4 SO-DIMM | — |
| Storage | 512GB NVMe M.2 | OS + LXC storage |
| Network | Intel I350-T4 PCIe NIC (4 ports) | Future VLAN trunk |
| ISP Router | Nokia GPON (Telmex Infinitum) | Gateway 192.168.1.254 |

### IP Addressing (Current — Pre-VLAN)

| Service | IP | Notes |
|---|---|---|
| ISP Router / Gateway | 192.168.1.254 | Nokia GPON |
| Proxmox VE (vmbr0) | 192.168.1.65 | Management |
| AdGuard Home LXC | 192.168.1.100 | DNS server — static |
| DHCP Pool | 192.168.1.64 – 192.168.1.253 | Router DHCP |

> **Note:** This configuration is temporary. Once a managed switch is deployed, AdGuard Home will migrate to `192.168.10.2` on VLAN 10 (MGMT), and pfSense will handle inter-VLAN DNS forwarding.

### Software Versions

| Software | Version |
|---|---|
| Proxmox VE | 9.1.1 |
| Proxmox Kernel | 6.17.2-1-pve |
| Alpine Linux | 3.22 |
| AdGuard Home | v0.107.76 |

---

## 2. Proxmox VE — Base Setup

### 2.1 Verify Host Network Configuration

From the Proxmox shell (`Datacenter → proxmox → Shell`):

```bash
# Verify default gateway and IP
ip route show default && ip addr show vmbr0
```

Expected output:
```
default via 192.168.1.254 dev vmbr0
...
inet 192.168.1.65/24 scope global vmbr0
```

### 2.2 Verify Host Time Synchronization

LXC containers inherit the host clock. This is critical — time drift causes SSL certificate validation failures during package installation.

```bash
# Check current time sync status
timedatectl status

# Enable and restart NTP sync if needed
timedatectl set-ntp true
systemctl restart systemd-timesyncd

# Force immediate sync if offset is large
systemctl stop systemd-timesyncd
ntpdate pool.ntp.org
systemctl start systemd-timesyncd

# Confirm sync is active
timedatectl status
# Must show: "System clock synchronized: yes"
```

> **Important:** Do not attempt to sync time from inside an LXC container — `settimeofday` is not permitted in unprivileged containers. Always sync from the Proxmox host.

### 2.3 Download Alpine Linux Template

```bash
# Update the template repository index
pveam update

# List available Alpine templates
pveam available | grep alpine

# Download Alpine 3.22 template
pveam download local alpine-3.22-default_20250617_amd64.tar.xz

# Verify download
pveam list local
```

The template is stored at:
```
/var/lib/vz/template/cache/alpine-3.22-default_20250617_amd64.tar.xz
```

It is also visible in the Proxmox UI under:
```
Datacenter → proxmox → local → CT Templates
```

---

## 3. Alpine Linux LXC Container

### 3.1 Create the Container

From the Proxmox shell:

```bash
pct create 101 local:vztmpl/alpine-3.22-default_20250617_amd64.tar.xz \
  --hostname adguard-home \
  --cores 1 \
  --memory 256 \
  --swap 128 \
  --rootfs local-lvm:512 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.100/24,gw=192.168.1.254 \
  --unprivileged 1 \
  --features nesting=1 \
  --start 1 \
  --onboot 1
```

**Parameter reference:**

| Parameter | Value | Reason |
|---|---|---|
| `--cores 1` | 1 vCPU | Sufficient for DNS workload |
| `--memory 256` | 256 MB | Alpine is minimal; AdGuard needs ~80MB |
| `--swap 128` | 128 MB | Safety buffer |
| `--rootfs local-lvm:512` | 512 MB disk | Ample for AdGuard + logs |
| `--unprivileged 1` | true | Security best practice |
| `--features nesting=1` | enabled | Required for some network operations |
| `--onboot 1` | true | Auto-start with Proxmox |
| `ip=192.168.1.100/24` | Static IP | DNS servers must have fixed IPs |
| `gw=192.168.1.254` | Router IP | Current network gateway |

> **Note:** The `tag=10` VLAN parameter is intentionally omitted. The current switch (TP-Link TL-SG108) is unmanaged and does not support 802.1Q. The VLAN tag will be added after a managed switch is deployed.

### 3.2 Verify Container Status

```bash
# Check container is running
pct status 101

# View container configuration
pct config 101
```

### 3.3 Set Root Password

The container is created without a root password when using the CLI. Set it before first login:

```bash
# From the Proxmox shell (not inside the container)
pct exec 101 -- passwd root
```

Alternatively, enter the container directly without a password:

```bash
pct enter 101
passwd root
```

### 3.4 Troubleshooting — Network Device Error

**Error:** `lxc_create_network_priv: Failed to create network device`

**Cause:** The bridge `vmbr0` does not have VLAN-aware mode enabled, and a `tag=` parameter was passed.

**Solution:** Remove the `tag=10` parameter from the `--net0` argument. VLAN tagging requires a managed switch and VLAN-aware bridge configuration.

```bash
# If the container was created with a failed network config, destroy it cleanly
pct destroy 101 --purge

# Recreate without VLAN tag (see Section 3.1)
```

---

## 4. AdGuard Home Installation

### 4.1 Enter the Container

From the Proxmox UI: `Container 101 → Console`

Log in as `root` with the password set in Section 3.3.

Alternatively from the Proxmox shell:

```bash
pct enter 101
```

### 4.2 Bootstrap Package Manager (SSL Fix)

Fresh Alpine LXC containers have no CA certificates, which causes a chicken-and-egg problem: `apk` cannot connect to HTTPS repos to download certificates, because it has no certificates.

**Solution:** Temporarily use HTTP to bootstrap the certificate store.

```bash
# Step 1 — Switch repos to HTTP temporarily
sed -i 's/https/http/' /etc/apk/repositories

# Step 2 — Install CA certificates and curl over HTTP
apk update && apk add curl ca-certificates

# Step 3 — Restore HTTPS in repos
sed -i 's/http:/https:/' /etc/apk/repositories

# Step 4 — Remove any stale sslverify lines if present
sed -i '/sslverify/d' /etc/apk/repositories

# Step 5 — Activate the certificate store
update-ca-certificates

# Step 6 — Verify repos now work with SSL
apk update
```

### 4.3 Upgrade System Packages

```bash
apk upgrade
```

### 4.4 Install AdGuard Home

```bash
curl -s -S -L \
  https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh \
  | sh -s -- -v
```

The script will:
1. Detect the OS (Linux) and architecture (amd64)
2. Download the AdGuard Home binary to `/opt/AdGuardHome/`
3. Install and start the service
4. Register it with OpenRC for auto-start

**Expected output (last lines):**
```
AdGuard Home is now installed and running
AdGuard Home will be installed into /opt/AdGuardHome
serving url=http://192.168.1.100:3000
```

> **Troubleshooting — SSL error during download:** If curl reports `certificate is not yet valid`, the Proxmox host clock is out of sync. Exit the container and fix NTP on the host (see Section 2.2), then retry.

### 4.5 Enable Auto-start with OpenRC

```bash
rc-update add AdGuardHome default
rc-service AdGuardHome start

# Verify service is running
rc-service AdGuardHome status
# Expected: status: started
```

### 4.6 Verify Installation

```bash
# Check the binary
ls -la /opt/AdGuardHome/AdGuardHome

# Check the service
rc-service AdGuardHome status

# Check listening ports
netstat -tlnp | grep -E '53|3000'
# or
ss -tlnp | grep -E '53|3000'
```

AdGuard Home listens on:
- **Port 53** — DNS queries (UDP/TCP)
- **Port 3000** — Web UI / initial setup wizard

---

## 5. AdGuard Home Configuration

### 5.1 Initial Setup Wizard

Open a browser and navigate to:

```
http://192.168.1.100:3000
```

**Step 1 — Welcome screen:** Click "Get Started"

**Step 2 — Admin Web Interface:**
- Interface: `All interfaces`
- Port: `3000`

**Step 3 — DNS Server:**
- Interface: `All interfaces`
- Port: `53`

> **Static IP notice:** AdGuard Home warns about static IP. This is already handled — the LXC was created with a static IP assignment in Proxmox (`ip=192.168.1.100/24`). Click Next.

**Step 4 — Authentication:**
- Username: `admin` (or your preferred username)
- Password: choose a strong password

**Step 5 — Finish:** Click Open Dashboard.

### 5.2 Configure Upstream DNS (DoH)

Navigate to `Settings → DNS Settings → Upstream DNS servers`

Replace the default entries with:

```
https://cloudflare-dns.com/dns-query
https://dns.quad9.net/dns-query
https://dns.nextdns.io
```

**Upstream DNS mode:** `Load balancing` (distributes queries across all upstreams)

Scroll down to `Bootstrap DNS servers`:
```
1.1.1.1
9.9.9.9
```

Click **Apply**.

Test the upstream configuration by clicking **Test upstreams** — all should show green.

### 5.3 Add Blocklists

Navigate to `Filters → DNS Blocklists → Add blocklist → Add a custom list`

| List Name | URL | Approx. Domains |
|---|---|---|
| AdGuard DNS filter | Pre-installed | ~800K |
| OISD Big | `https://big.oisd.nl` | ~4M |
| Steven Black Unified | `https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts` | ~200K |
| URLhaus Malware | `https://urlhaus-filter.pages.dev/urlhaus-filter-agh.txt` | ~100K |
| Hagezi Pro | `https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt` | ~500K |

After adding each list, click **Save**. AdGuard will download and parse the lists immediately.

To force a refresh of all lists:
```
Filters → DNS Blocklists → Update now
```

### 5.4 Configure DNS Rewrites (Split-Horizon)

Navigate to `Filters → DNS Rewrites → Add DNS rewrite`

Add entries for internal lab services:

| Domain | Answer |
|---|---|
| `proxmox.mgmt` | `192.168.1.65` |
| `adguard.mgmt` | `192.168.1.100` |

> These entries will expand as services are deployed. Future entries will include K3s ingress endpoints, Gitea, ArgoCD, Grafana, etc.

### 5.5 Configure Client Settings

Navigate to `Settings → Client Settings → Add client`

Register known lab devices with persistent names:

| Client Name | Identifier (IP or MAC) |
|---|---|
| proxmox | `192.168.1.65` |
| adguard-lxc | `192.168.1.100` |

### 5.6 Enable Query Log

Navigate to `Settings → General Settings`

- Query log: **Enabled**
- Retention: `90 days`
- Statistics: **Enabled**
- Retention: `90 days`

Click **Save**.

### 5.7 Configure Safe Browsing (Optional)

Navigate to `Settings → General Settings`

- **Use AdGuard Browsing Security** — enable for malware/phishing protection
- **Safe Search** — enable per-client if needed (can break some searches)

---

## 6. Network Integration — Telmex/Infinitum Router

### 6.1 Access Router Admin Panel

```
http://192.168.1.254
```

Default credentials (if unchanged):
- Username: `adminadmin`
- Password: `adminadmin`

### 6.2 Configure DHCP DNS Distribution

Navigate to `Red → Red Doméstica`

Set the following fields:

| Field | Value |
|---|---|
| DNS Primario | `192.168.1.100` |
| DNS Secundario | `192.168.1.254` |

Click **Guardar**.

This instructs the router to distribute AdGuard Home's IP as the DNS server to all DHCP clients on the network. The secondary (`192.168.1.254`) serves as a fallback if AdGuard Home is unavailable.

---

## 7. DHCP Static Reservation

### 7.1 Get the MAC Address of the LXC

From the Proxmox shell:

```bash
pct exec 101 -- ip link show eth0
```

Output:
```
2: eth0@if35: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ...
    link/ether bc:24:11:76:10:9c brd ff:ff:ff:ff:ff:ff
```

MAC address: `bc:24:11:76:10:9c`

### 7.2 Create Static DHCP Reservation

Navigate to `Red → Red Doméstica` and scroll down to the **Estática DHCP Entrada** section.

| Field | Value |
|---|---|
| Dirección MAC | `bc:24:11:76:10:9c` |
| Dirección IP | `192.168.1.100` |

Click **Agregar**, then **Guardar**.

This ensures the router always assigns `192.168.1.100` to the AdGuard LXC container, preventing IP conflicts with the DHCP pool (`192.168.1.64 – 192.168.1.253`).

---

## 8. Validation & Testing

### 8.1 Test DNS Resolution from the LXC

```bash
# Enter the container
pct enter 101

# Test resolution via AdGuard itself
nslookup google.com 127.0.0.1
nslookup google.com 192.168.1.100

# Test a known ad domain — should be BLOCKED
nslookup doubleclick.net 192.168.1.100
# Expected: NXDOMAIN or 0.0.0.0
```

### 8.2 Test DNS Resolution from Proxmox Host

```bash
# From Proxmox shell
nslookup google.com 192.168.1.100

# Point Proxmox DNS to AdGuard permanently
echo "nameserver 192.168.1.100" > /etc/resolv.conf
```

### 8.3 Test DNS Resolution from a Client Device

On any device connected to the router (after DHCP renewal):

**Windows:**
```powershell
ipconfig /flushdns
nslookup google.com
# Check that server shows 192.168.1.100
```

**Linux/macOS:**
```bash
dig google.com
# Check ;; SERVER: 192.168.1.100
```

**Force DHCP renewal (Linux):**
```bash
sudo dhclient -r && sudo dhclient
```

### 8.4 Verify AdGuard Dashboard Activity

Open `http://192.168.1.100:3000` and check:

- **Consultas DNS** counter is incrementing
- **Clientes más frecuentes** shows your devices
- **Dominios más bloqueados** starts populating after a few minutes

### 8.5 Verify Service Persistence

```bash
# Reboot the container
pct reboot 101

# Wait 30 seconds, then verify AdGuard is back up
pct exec 101 -- rc-service AdGuardHome status
# Expected: status: started
```

---

## 9. Maintenance & Operations

### 9.1 Common Commands

**From the Proxmox shell:**

```bash
# Start / stop / restart / status
pct start 101
pct stop 101
pct reboot 101
pct status 101

# Enter the container shell
pct enter 101

# Run a command inside the container
pct exec 101 -- rc-service AdGuardHome status
```

**From inside the container:**

```bash
# AdGuard Home service control
/opt/AdGuardHome/AdGuardHome -s start
/opt/AdGuardHome/AdGuardHome -s stop
/opt/AdGuardHome/AdGuardHome -s restart
/opt/AdGuardHome/AdGuardHome -s status

# Using OpenRC
rc-service AdGuardHome start
rc-service AdGuardHome stop
rc-service AdGuardHome restart
rc-service AdGuardHome status

# Update system packages
apk update && apk upgrade
```

### 9.2 Update AdGuard Home

```bash
pct enter 101

# Run the install script again — it detects existing installation and updates
curl -s -S -L \
  https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh \
  | sh -s -- -v

# Restart the service
rc-service AdGuardHome restart
```

> Configuration, query logs, and blocklists are preserved during updates. They are stored in `/opt/AdGuardHome/` alongside the binary.

### 9.3 Configuration File Location

```
/opt/AdGuardHome/AdGuardHome.yaml
```

Back up this file before updates or migrations:

```bash
# From Proxmox shell
pct exec 101 -- cat /opt/AdGuardHome/AdGuardHome.yaml > adguard-backup-$(date +%Y%m%d).yaml
```

### 9.4 Log Locations

```bash
# AdGuard Home runtime logs
pct exec 101 -- tail -f /var/log/AdGuardHome/AdGuardHome.log

# OpenRC service logs
pct exec 101 -- cat /var/log/messages | grep AdGuard
```

### 9.5 Proxmox Container Snapshot

Before major changes, take a snapshot:

```bash
# From Proxmox shell
pct snapshot 101 pre-update-$(date +%Y%m%d) \
  --description "AdGuard Home pre-update snapshot"

# List snapshots
pct listsnapshot 101

# Rollback if needed
pct rollback 101 pre-update-20260524
```

---

## 10. Roadmap — Next Steps

### 10.1 Pending — Managed Switch

The current TP-Link TL-SG108 is **unmanaged** and does not support 802.1Q VLANs. All services are currently on a flat `192.168.1.0/24` network.

**Required upgrade:** TP-Link TL-SG108E or Netgear GS308E (~$60–100 USD)

Once deployed, the following VLAN structure will be implemented:

| VLAN ID | Name | Subnet | Purpose |
|---|---|---|---|
| 10 | MGMT | 192.168.10.0/24 | Proxmox, AdGuard, pfSense |
| 20 | PROD | 192.168.20.0/24 | K3s cluster nodes |
| 30 | DEV | 192.168.30.0/24 | Build servers, staging |
| 40 | STORAGE | 192.168.40.0/24 | Longhorn replication |
| 50 | PENTEST | 192.168.50.0/24 | Isolated red team |
| 60 | DMZ | 192.168.60.0/24 | Ingress / exposed services |

### 10.2 AdGuard Migration Post-Switch

After the managed switch is deployed:

```bash
# Stop the container
pct stop 101

# Update the network config with VLAN tag and new IP
pct set 101 --net0 name=eth0,bridge=vmbr0,tag=10,ip=192.168.10.2/24,gw=192.168.10.1

# Start the container
pct start 101
```

Update DNS rewrites and pfSense to point to `192.168.10.2`.

### 10.3 pfSense VM

pfSense will be deployed as a VM on the M720q alongside AdGuard Home. It will:
- Handle inter-VLAN routing and firewall rules
- Forward DNS queries to AdGuard Home (`192.168.10.2`)
- Distribute `192.168.10.2` as DNS via DHCP options per VLAN
- Run WireGuard for remote access

### 10.4 AdGuard Monitoring Integration

Once the K3s cluster is deployed (T440p + T430 + P52), AdGuard metrics will be scraped by Prometheus via `adguard-exporter`:

```bash
# Inside the AdGuard LXC
docker run -d \
  -p 9617:9617 \
  -e ADGUARD_HOSTNAME=localhost \
  -e ADGUARD_PORT=3000 \
  -e ADGUARD_USERNAME=admin \
  -e ADGUARD_PASSWORD=${SECRET} \
  ebrianne/adguard-exporter
```

Prometheus scrape config:
```yaml
- job_name: adguard
  static_configs:
  - targets: ['192.168.10.2:9617']
```

### 10.5 Recommended Alertmanager Rules

```yaml
groups:
- name: adguard
  rules:
  - alert: AdGuardDown
    expr: up{job="adguard"} == 0
    for: 1m
    severity: critical

  - alert: DNSLatencyHigh
    expr: adguard_avg_processing_time > 500
    for: 5m
    severity: warning
```

---

## Appendix A — Quick Reference

### Service URLs

| Service | URL |
|---|---|
| AdGuard Home Dashboard | `http://192.168.1.100:3000` |
| Proxmox UI | `https://192.168.1.65:8006` |
| ISP Router | `http://192.168.1.254` |

### Key File Paths (inside LXC 101)

| File | Purpose |
|---|---|
| `/opt/AdGuardHome/AdGuardHome` | Binary |
| `/opt/AdGuardHome/AdGuardHome.yaml` | Main configuration |
| `/opt/AdGuardHome/data/` | Query logs, statistics |
| `/etc/apk/repositories` | Alpine package repos |
| `/etc/init.d/AdGuardHome` | OpenRC service file |

### Network Summary

```
Internet (ISP)
      │
Nokia GPON Router — 192.168.1.254
      │
   vmbr0 (Proxmox bridge)
      │
  ┌───┴────────────┐
  │                │
Proxmox VE      LXC 101
192.168.1.65    AdGuard Home
                192.168.1.100
                Port 53 (DNS)
                Port 3000 (UI)
```

---

## Appendix B — Troubleshooting Reference

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to create network device` | VLAN tag on non-VLAN-aware bridge | Remove `tag=` from `--net0` |
| `SSL certificate verify failed` on `apk` | No CA certs in fresh container | Bootstrap with HTTP (Section 4.2) |
| `certificate is not yet valid` on `curl` | Host clock out of sync | Sync NTP on Proxmox host (Section 2.2) |
| `settimeofday: Operation not permitted` | Cannot change time inside LXC | Fix time on Proxmox host, not inside LXC |
| `openntpd / ntp: no such package` | Alpine repo unreachable | Fix SSL bootstrap first |
| AdGuard not resolving after reboot | OpenRC not configured | Run `rc-update add AdGuardHome default` |
| DNS queries not appearing in dashboard | Devices not using AdGuard as DNS | Check DHCP DNS option in router |

---

*Document generated from live lab session — Proxmox 9.1.1 on Lenovo M720q*