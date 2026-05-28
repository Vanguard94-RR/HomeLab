# Enterprise HomeLab — Installation & Configuration Manual

**Version:** 2.1
**Date:** May 2026
**Scope:** Proxmox VE · AdGuard Home (Alpine LXC) · pfSense CE · Network DNS Configuration
**Environment:** Lenovo M720q · Proxmox 9.1.1 · Alpine Linux 3.22 · AdGuard Home v0.107.76

> **Changelog v1.0 → v2.0**
> - AdGuard migrated from `192.168.1.100` (flat network) → `10.10.10.3/24` on VLAN 10 (MGMT)
> - LXC is now dual-homed: `eth0` on VLAN 10 (`10.10.10.3`) + `eth1` on Telmex LAN (`192.168.1.100`)
> - pfSense CE 2.7.2 manages inter-VLAN routing and distributes AdGuard as DNS via DHCP
> - TL-SG108E v6.0 handles 802.1Q with 6 VLANs
> - Upstream DNS updated to DoH triple-redundant stack (Quad9 · Cloudflare · Google)
> - Blocklists expanded: 5 lists, 931K+ rules active
> - DNS Rewrites (split-horizon) configured for internal lab services
>
> **Changelog v2.0 → v2.1**
> - P53 daily driver (ThinkPad P53, Fedora, WiFi + USB-C dock ethernet) configured to use AdGuard as DNS
> - `systemd-resolved` was using `127.0.0.53` stub — Telmex DHCP was distributing `1.1.1.1` to WiFi, bypassing AdGuard
> - Fix: NetworkManager `ipv4.ignore-auto-dns yes` + `ipv4.dns 192.168.1.100` on both connections
> - DNS Rewrites verified working end-to-end from daily driver: `proxmox.mgmt`, `pfsense.mgmt`, `adguard.mgmt`
> - Added Section 8.1: Client DNS Configuration — Daily Driver (Linux/NetworkManager)

---

## Table of Contents

1. [Environment Overview](#1-environment-overview)
2. [Proxmox VE — Base Setup](#2-proxmox-ve--base-setup)
3. [Alpine Linux LXC Container](#3-alpine-linux-lxc-container)
4. [AdGuard Home Installation](#4-adguard-home-installation)
5. [AdGuard Home Configuration](#5-adguard-home-configuration)
6. [Network Integration — Dual-Homed LXC](#6-network-integration--dual-homed-lxc)
7. [pfSense DHCP — DNS Distribution](#7-pfsense-dhcp--dns-distribution)
8. [Client DNS Configuration — Daily Driver](#8-client-dns-configuration--daily-driver)
9. [Telmex Router — DNS Configuration](#9-telmex-router--dns-configuration)
10. [Validation & Testing](#10-validation--testing)
11. [Maintenance & Operations](#11-maintenance--operations)
12. [Roadmap — Next Steps](#12-roadmap--next-steps)

---

## 1. Environment Overview

### Hardware

| Component | Device | Role |
|---|---|---|
| Hypervisor host | Lenovo M720q | Proxmox VE node |
| CPU | Intel Core i5-8500T (6C/6T) | — |
| RAM | 32GB DDR4 SO-DIMM | — |
| Storage | 512GB NVMe M.2 | OS + LXC storage |
| Network | Intel I350-T4 PCIe NIC (4 ports) | VLAN trunk to switch |
| Switch | TP-Link TL-SG108E v6.0 | 802.1Q managed, 10.10.10.2 |
| ISP Router | Nokia GPON (Telmex Infinitum) | Gateway 192.168.1.254 |

### IP Addressing (v2.0 — Post-Migration)

| Service | IP | Interface | VLAN | Notes |
|---|---|---|---|---|
| ISP Router / Gateway | 192.168.1.254 | — | — | Nokia GPON |
| pfSense WAN | 192.168.1.131 | vtnet0 → vmbr0 | — | DHCP from Telmex |
| pfSense LAN (MGMT) | 10.10.10.1 | vtnet1 → vmbr1 | VLAN 10 | Gateway for MGMT |
| TL-SG108E Switch | 10.10.10.2 | — | VLAN 10 | Management IP |
| AdGuard Home LXC | 10.10.10.3 | eth0 → vmbr1 | VLAN 10 | DNS — primary |
| AdGuard Home LXC | 192.168.1.100 | eth1 → vmbr0 | — | DNS — Telmex LAN |
| Proxmox VE | 192.168.1.65 | vmbr0 | — | Hypervisor management |
| Windows VM (mgmt) | 10.10.10.50 | e1000 → vmbr1 | VLAN 10 | Static — UI access |

> **Dual-homed design:** AdGuard listens on both `10.10.10.3` (VLAN 10) and `192.168.1.100` (Telmex LAN).
> This provides DNS resilience: if pfSense is unavailable, Telmex devices still resolve via `192.168.1.100`.
> pfSense is never a DNS intermediary — clients always query AdGuard directly.

### VLAN Structure

| VLAN ID | Name | Subnet | Gateway | DHCP |
|---|---|---|---|---|
| 10 | MGMT | 10.10.10.0/24 | 10.10.10.1 | No — static IPs |
| 20 | PROD | 10.10.20.0/24 | 10.10.20.1 | Yes — .100–.200 |
| 30 | DEV | 10.10.30.0/24 | 10.10.30.1 | Yes — .100–.200 |
| 40 | STORAGE | 10.10.40.0/24 | 10.10.40.1 | No — static IPs |
| 50 | DMZ | 10.10.50.0/24 | 10.10.50.1 | No — static IPs |
| 90 | PENTEST | 10.10.90.0/24 | 10.10.90.1 | Yes — .100–.150 |

### Software Versions

| Software | Version |
|---|---|
| Proxmox VE | 9.1.1 |
| Proxmox Kernel | 6.17.2-1-pve |
| Alpine Linux | 3.22 |
| AdGuard Home | v0.107.76 |
| pfSense CE | 2.7.2 |
| TL-SG108E Firmware | 1.0.0 Build 20250710 |

---

## 2. Proxmox VE — Base Setup

### 2.1 Verify Host Network Configuration

From the Proxmox shell (`Datacenter → proxmox → Shell`):

```bash
# Verify bridges and IPs
ip addr show vmbr0
ip addr show vmbr1

# Verify default route
ip route show default
```

Expected output:
```
default via 192.168.1.254 dev vmbr0
...
vmbr0: inet 192.168.1.65/24
vmbr1: (no IP — trunk bridge, VLAN-aware)
```

### 2.2 Verify Bridge Configuration

```bash
cat /etc/network/interfaces
```

Required configuration for VLAN-aware trunk:
```
auto vmbr1
iface vmbr1 inet manual
    bridge-ports enp1s0f0
    bridge-stp off
    bridge-fd 0
    bridge-vlan-aware yes
    bridge-vids 2-4094
```

> **Note:** If VLANs are lost after reboot, `bridge-vlan-aware yes` and `bridge-vids 2-4094` must be present in `/etc/network/interfaces`. See Section 11 (Roadmap) for persistence fix.

### 2.3 Verify Host Time Synchronization

LXC containers inherit the host clock. Time drift causes SSL certificate validation failures.

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

### 2.4 Download Alpine Linux Template

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

---

## 3. Alpine Linux LXC Container

### 3.1 Initial Container Creation (Historical Reference)

The container was originally created on the flat Telmex network (`192.168.1.100`) without VLAN tagging, since the managed switch was not yet deployed:

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

### 3.2 Migration to VLAN 10 (v2.0)

After pfSense and TL-SG108E were deployed, the container was migrated to VLAN 10:

```bash
# Stop the container
pct stop 101

# Migrate eth0 to VLAN 10 on vmbr1
pct set 101 --net0 name=eth0,bridge=vmbr1,tag=10,ip=10.10.10.3/24,gw=10.10.10.1

# Start the container
pct start 101

# Verify AdGuard is running
pct exec 101 -- rc-service AdGuardHome status
# Expected: status: started
```

### 3.3 Adding Dual-Homed Interface (v2.0)

To maintain access from the Telmex LAN (`192.168.1.x`) while serving DNS to all VLANs, a second NIC was added to the container:

```bash
# Stop the container
pct stop 101

# Add eth1 on vmbr0 (untagged — Telmex LAN)
pct set 101 --net1 name=eth1,bridge=vmbr0,ip=192.168.1.100/24,gw=192.168.1.254

# Start the container
pct start 101

# Verify both interfaces
pct exec 101 -- ip addr
```

Expected output:
```
2: eth0@if45: <BROADCAST,MULTICAST,UP,LOWER_UP>
    inet 10.10.10.3/24 scope global eth0

3: eth1@if46: <BROADCAST,MULTICAST,UP,LOWER_UP>
    inet 192.168.1.100/24 scope global eth1
```

### 3.4 Routing Table Verification

With two interfaces, confirm the default route is correct:

```bash
pct exec 101 -- ip route
```

Expected output:
```
default via 10.10.10.1 dev eth0  metric 1 onlink
10.10.10.0/24 dev eth0 scope link  src 10.10.10.3
192.168.1.0/24 dev eth1 scope link  src 192.168.1.100
```

> The default route must exit via `eth0` (pfSense/VLAN 10), not `eth1` (Telmex). This ensures upstream DNS queries (DoH) go through pfSense → internet.
> The `192.168.1.0/24` connected route on `eth1` allows DNS replies to reach Telmex clients without using the default route.

### 3.5 Current Container Configuration

```bash
pct config 101
```

Expected output (v2.0):
```
arch: amd64
cores: 1
features: nesting=1
hostname: adguard-home
memory: 256
net0: name=eth0,bridge=vmbr1,tag=10,ip=10.10.10.3/24,gw=10.10.10.1
net1: name=eth1,bridge=vmbr0,ip=192.168.1.100/24,gw=192.168.1.254
onboot: 1
ostype: alpine
rootfs: local-lvm:vm-101-disk-0,size=512M
swap: 128
unprivileged: 1
```

### 3.6 Set Root Password

```bash
# From the Proxmox shell (not inside the container)
pct exec 101 -- passwd root
```

### 3.7 Troubleshooting — Network Device Error

**Error:** `lxc_create_network_priv: Failed to create network device`

**Cause:** The bridge does not have VLAN-aware mode enabled, and a `tag=` parameter was passed.

**Solution:** Ensure `vmbr1` has `bridge-vlan-aware yes` in `/etc/network/interfaces`, then retry.

```bash
# Verify vmbr1 is VLAN-aware
bridge vlan show dev vmbr1
```

---

## 4. AdGuard Home Installation

### 4.1 Enter the Container

From the Proxmox UI: `Container 101 → Console`

Alternatively from the Proxmox shell:

```bash
pct enter 101
```

### 4.2 Bootstrap Package Manager (SSL Fix)

Fresh Alpine LXC containers have no CA certificates, which causes HTTPS failures on `apk`.

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
serving url=http://10.10.10.3:3000
```

> **Troubleshooting — SSL error during download:** If curl reports `certificate is not yet valid`, the Proxmox host clock is out of sync. Exit the container and fix NTP on the host (see Section 2.3), then retry.

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
ss -tlnp | grep -E '53|3000'
```

AdGuard Home listens on:
- **Port 53** — DNS queries (UDP/TCP) on all interfaces
- **Port 3000** — Web UI / initial setup wizard

---

## 5. AdGuard Home Configuration

### 5.1 Access the Web UI

AdGuard is accessible from both networks:

| Network | URL |
|---|---|
| Telmex LAN (192.168.1.x) | `http://192.168.1.100:3000` |
| VLAN 10 / MGMT | `http://10.10.10.3:3000` |

> **Note:** VLAN 10 has no DHCP. To access from a VM in VLAN 10, assign a static IP.
> The Windows management VM (ID 199) uses `10.10.10.50/24`, gateway `10.10.10.1`.

### 5.2 Initial Setup Wizard

**Step 1 — Welcome screen:** Click "Get Started"

**Step 2 — Admin Web Interface:**
- Interface: `All interfaces`
- Port: `3000`

**Step 3 — DNS Server:**
- Interface: `All interfaces`
- Port: `53`

**Step 4 — Authentication:**
- Username: `admin` (or your preferred username)
- Password: choose a strong password

**Step 5 — Finish:** Click Open Dashboard.

### 5.3 Configure Upstream DNS (DoH)

Navigate to `Settings → DNS Settings → Upstream DNS servers`

Replace any existing entries with the following (one per line):

```
https://dns10.quad9.net/dns-query
https://dns.cloudflare.com/dns-query
https://dns.google/dns-query
```

**Upstream DNS mode:** `Load balancing` (distributes queries across all upstreams)

**Why this stack:**

| Provider | Protocol | Feature |
|---|---|---|
| Quad9 | DoH | Malware/botnet blocking at DNS level |
| Cloudflare | DoH | Speed + privacy-first |
| Google | DoH | Reliable global fallback |

Scroll down to `Bootstrap DNS servers` and enter:

```
9.9.9.9
1.1.1.1
8.8.8.8
```

> **Bootstrap DNS** resolves the hostnames of DoH servers (e.g. `dns.cloudflare.com`) before encrypted DNS is available. These are plain UDP resolvers used only during startup.

Click **Test upstreams** — all three should return green. Then click **Apply**.

### 5.4 Add Blocklists

Navigate to `Filters → DNS Blocklists → Add blocklist → Add a custom list`

| List Name | URL | Rules (active) |
|---|---|---|
| AdGuard DNS filter | Pre-installed | 164,088 |
| OISD Big | `https://big.oisd.nl` | 441,906 |
| Steven Black Unified | `https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts` | 83,081 |
| URLhaus Malware | `https://urlhaus-filter.pages.dev/urlhaus-filter-agh.txt` | 32,507 |
| Hagezi Pro | `https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt` | 209,827 |

**Total: 931,409 rules active**

After adding each list, click **Save**. AdGuard downloads and parses it immediately.

To force a refresh of all lists:
```
Filters → DNS Blocklists → Check for updates
```

> **Note:** AdAway Default Blocklist is pre-installed but disabled (0 rules loaded). It can be left disabled or removed — it does not contribute to blocking.

### 5.5 Configure DNS Rewrites (Split-Horizon)

Navigate to `Filters → DNS Rewrites → Add DNS rewrite`

These entries allow lab services to be accessed by hostname instead of IP:

| Domain | Answer | Service |
|---|---|---|
| `proxmox.mgmt` | `192.168.1.65` | Proxmox VE web UI |
| `pfsense.mgmt` | `10.10.10.1` | pfSense web UI |
| `adguard.mgmt` | `192.168.1.100` | AdGuard Home web UI |

> These entries will expand as services are deployed. Future entries will include K3s ingress endpoints (`*.lab.internal`), Gitea, ArgoCD, Grafana, Harbor, Vault, etc.

### 5.6 Configure Client Settings

Navigate to `Settings → Client Settings → Add client`

Register known lab devices with persistent names for better dashboard visibility:

| Client Name | Identifier (IP) |
|---|---|
| proxmox | `192.168.1.65` |
| pfsense | `10.10.10.1` |
| adguard-lxc | `10.10.10.3` |
| win-mgmt | `10.10.10.50` |

### 5.7 Enable Query Log and Statistics

Navigate to `Settings → General Settings`

- Query log: **Enabled**
- Log retention: `90 days`
- Statistics: **Enabled**
- Statistics retention: `90 days`
- **Use AdGuard Browsing Security:** Enabled (malware/phishing protection)

Click **Save**.

---

## 6. Network Integration — Dual-Homed LXC

### 6.1 Architecture Overview

AdGuard Home is dual-homed, serving DNS to two separate networks simultaneously:

```
Telmex LAN (192.168.1.x)
  └─ eth1 (192.168.1.100) ─┐
                             ├── AdGuard Home LXC 101
  ┌─ eth0 (10.10.10.3) ────┘
  │
VLAN 10 / pfSense → all VLANs (20, 30, 40, 50, 90)
```

### 6.2 DNS Flow

```
Client (any VLAN) ──DNS query──▶ pfSense DHCP-assigned DNS: 10.10.10.3
                                        │
                                 AdGuard Home (10.10.10.3:53)
                                        │
                                 DoH upstream (Quad9 / Cloudflare / Google)
                                        │
                                    Internet

Client (Telmex LAN) ──DNS query──▶ 192.168.1.100:53
                                        │
                                 Same AdGuard Home instance
                                        │
                                 Same DoH upstream stack
```

### 6.3 Why Dual-Homed Instead of Port Forward

| Approach | Pros | Cons |
|---|---|---|
| Port forward (pfSense NAT) | No LXC changes | Depends on pfSense being up; NAT adds latency |
| Dual-homed LXC | Direct DNS on both networks; pfSense-independent | LXC has 2 NICs; routing must be verified |
| Static route on Telmex | Transparent routing | Telmex Nokia routers do not support static routes |

The dual-homed approach provides DNS resilience: if pfSense goes down, Telmex devices continue to resolve DNS via `192.168.1.100`.

### 6.4 Accessing the Web UI

| Client Location | URL to use |
|---|---|
| Any device on 192.168.1.x | `http://192.168.1.100:3000` |
| VM or device in VLAN 10 | `http://10.10.10.3:3000` |
| By hostname (if DNS resolving) | `http://adguard.mgmt:3000` |

> **Recommended:** Use `http://192.168.1.100:3000` from your main workstation for all configuration work. Copy/paste works normally from the browser, unlike the noVNC console.

---

## 7. pfSense DHCP — DNS Distribution

pfSense distributes `10.10.10.3` as the DNS server to all DHCP clients across VLANs.

### 7.1 Configure DNS per VLAN

Navigate to `Services → DHCP Server` and select each VLAN tab:

**VLAN 20 — PROD (`Services → DHCP Server → OPT1`):**

| Field | Value |
|---|---|
| Enable | ✅ |
| Range From | 10.10.20.100 |
| Range To | 10.10.20.200 |
| DNS Server 1 | `10.10.10.3` |
| Domain | `lab.internal` |

**VLAN 30 — DEV (`Services → DHCP Server → OPT2`):**

| Field | Value |
|---|---|
| Enable | ✅ |
| Range From | 10.10.30.100 |
| Range To | 10.10.30.200 |
| DNS Server 1 | `10.10.10.3` |
| Domain | `lab.internal` |

**VLAN 90 — PENTEST (`Services → DHCP Server → OPT5`):**

| Field | Value |
|---|---|
| Enable | ✅ |
| Range From | 10.10.90.100 |
| Range To | 10.10.90.150 |
| DNS Server 1 | `10.10.90.1` (pfSense local — intentional) |

> **PENTEST isolation:** VLAN 90 DNS intentionally points to pfSense (`10.10.90.1`), NOT to AdGuard (`10.10.10.3`). This prevents Parrot OS from resolving `lab.internal` hostnames and discovering internal services. Security boundary is maintained at the DNS layer.

Click **Save** on each VLAN.

### 7.2 Force DHCP Renewal on Clients

After updating DNS settings, existing clients must renew their DHCP lease to receive the new DNS server.

**Linux:**
```bash
sudo dhclient -r && sudo dhclient
# or
sudo systemctl restart NetworkManager
```

**Windows:**
```powershell
ipconfig /release
ipconfig /renew
ipconfig /flushdns
```

---

## 8. Client DNS Configuration — Daily Driver

Devices that receive DNS from the Telmex router via DHCP may get `1.1.1.1` or other public resolvers instead of AdGuard (`192.168.1.100`). This section documents how to override DNS per connection using NetworkManager on Linux.

### 8.1 Diagnose Current DNS (Linux)

```bash
# See which DNS server each interface is using
resolvectl status

# Test AdGuard directly (bypassing system DNS)
nslookup proxmox.mgmt 192.168.1.100

# Test via system DNS (shows if rewrites work end-to-end)
nslookup proxmox.mgmt
```

**Interpretation:**

| Result | Meaning |
|---|---|
| `nslookup proxmox.mgmt 192.168.1.100` works, `nslookup proxmox.mgmt` fails | System DNS is not AdGuard |
| Both fail | DNS rewrite not saved in AdGuard |
| Both work | ✅ Fully configured |

### 8.2 Fix — NetworkManager (Fedora / Ubuntu / Debian)

Identify active connections:

```bash
nmcli connection show --active
```

Apply AdGuard as DNS, ignoring DHCP-assigned servers:

```bash
# WiFi connection (replace "INFINITUMC241" with your SSID)
nmcli connection modify "INFINITUMC241" \
  ipv4.dns "192.168.1.100" \
  ipv4.ignore-auto-dns yes

# Wired / USB-C dock ethernet (replace name as needed)
nmcli connection modify "Wired connection 1" \
  ipv4.dns "192.168.1.100" \
  ipv4.ignore-auto-dns yes

# Apply changes
nmcli connection up "INFINITUMC241"
nmcli connection up "Wired connection 1"
```

> `ipv4.ignore-auto-dns yes` tells NetworkManager to discard DNS servers received via DHCP and use only the manually specified ones. This survives reboots and reconnections.

### 8.3 Verify

```bash
# Confirm both interfaces use AdGuard
resolvectl status | grep -A8 wlp82s0
resolvectl status | grep -A8 enp0s20f0u2u1i5

# Test rewrites
nslookup proxmox.mgmt   # → 192.168.1.65
nslookup pfsense.mgmt   # → 10.10.10.1
nslookup adguard.mgmt   # → 192.168.1.100
```

### 8.4 Confirmed Working — Lenovo ThinkPad P53 (Daily Driver)

| Interface | Device | Connection Name | DNS After Fix |
|---|---|---|---|
| `wlp82s0` | WiFi | `INFINITUMC241` | `192.168.1.100` ✅ |
| `enp0s20f0u2u1i5` | USB-C dock ethernet | `Wired connection 1` | `192.168.1.100` ✅ |

**Root cause:** Telmex DHCP was distributing `1.1.1.1` / `1.0.0.1` to WiFi clients. `systemd-resolved` used `127.0.0.53` as local stub, forwarding to those servers. AdGuard was never queried for `.mgmt` rewrites.

---

## 9. Telmex Router — DNS Configuration

### 8.1 Access Router Admin Panel

```
http://192.168.1.254
```

### 8.2 Current DNS Configuration

Navigate to `Red → Red Doméstica`

Since AdGuard is dual-homed and retains `192.168.1.100`, **no changes are required** to the Telmex router. The configuration was set in v1.0 and remains valid:

| Field | Value | Notes |
|---|---|---|
| DNS Primario | `192.168.1.100` | AdGuard Home (eth1) |
| DNS Secundario | `192.168.1.254` | Telmex fallback |

> Telmex devices receive `192.168.1.100` as DNS. AdGuard's `eth1` interface answers on this IP. No pfSense intermediary is involved for this traffic path.

---

## 10. Validation & Testing

### 9.1 Verify Dual-Homed Interfaces from Proxmox

```bash
pct exec 101 -- ip addr
```

Expected:
```
eth0: inet 10.10.10.3/24   ← VLAN 10
eth1: inet 192.168.1.100/24 ← Telmex LAN
```

```bash
pct exec 101 -- ip route
```

Expected:
```
default via 10.10.10.1 dev eth0  metric 1 onlink
10.10.10.0/24 dev eth0 scope link
192.168.1.0/24 dev eth1 scope link
```

### 9.2 Test DNS via Both Interfaces

```bash
# Test via Telmex LAN interface
pct exec 101 -- nslookup google.com 192.168.1.100

# Test via VLAN 10 interface
pct exec 101 -- nslookup google.com 10.10.10.3
```

Both should return a valid A record. Confirm the server address in each response matches the queried IP.

### 9.3 Test Blocked Domain

```bash
# A known ad domain — should return NXDOMAIN or 0.0.0.0
pct exec 101 -- nslookup doubleclick.net 127.0.0.1
# Expected: Address: 0.0.0.0
```

### 9.4 Test DNS from Proxmox Host

```bash
nslookup google.com 10.10.10.3
nslookup google.com 192.168.1.100

# Update Proxmox host DNS permanently
echo "nameserver 10.10.10.3" > /etc/resolv.conf
```

### 9.5 Test from a Client in VLAN 20/30

Once T440p and T430 are connected to the switch:

```bash
# Verify DHCP-assigned DNS
cat /etc/resolv.conf
# Should show: nameserver 10.10.10.3

# Test resolution
dig google.com
# Should show: ;; SERVER: 10.10.10.3#53

# Test blocked domain
dig doubleclick.net
# Should show: 0.0.0.0
```

### 9.6 Test DNS Rewrites

```bash
# From any client using AdGuard as DNS
nslookup proxmox.mgmt 10.10.10.3
# Expected: Address: 192.168.1.65

nslookup pfsense.mgmt 10.10.10.3
# Expected: Address: 10.10.10.1

nslookup adguard.mgmt 10.10.10.3
# Expected: Address: 192.168.1.100
```

### 9.7 Verify AdGuard Dashboard Activity

Open `http://192.168.1.100:3000` and verify:

- **DNS Queries** counter is incrementing
- **Top Clients** shows devices from multiple VLANs
- **Top Blocked Domains** starts populating after a few minutes
- **Query Log** shows requests with upstream server used (Quad9/Cloudflare/Google)
- **Blocklists** shows 5 lists enabled, 931K+ rules

### 9.8 Verify Service Persistence

```bash
# Reboot the container
pct reboot 101

# Wait 30 seconds, then verify AdGuard is back up
sleep 30
pct exec 101 -- rc-service AdGuardHome status
# Expected: status: started

# Verify both interfaces restored
pct exec 101 -- ip addr show eth0
pct exec 101 -- ip addr show eth1
```

---

## 11. Maintenance & Operations

### 10.1 Common Commands

**From the Proxmox shell:**

```bash
# Container lifecycle
pct start 101
pct stop 101
pct reboot 101
pct status 101

# Enter the container shell
pct enter 101

# Run commands inside the container without entering
pct exec 101 -- rc-service AdGuardHome status
pct exec 101 -- ss -tlnp | grep -E '53|3000'
pct exec 101 -- ip addr
pct exec 101 -- ip route
```

**From inside the container:**

```bash
# AdGuard Home service control (OpenRC)
rc-service AdGuardHome start
rc-service AdGuardHome stop
rc-service AdGuardHome restart
rc-service AdGuardHome status

# AdGuard Home binary directly
/opt/AdGuardHome/AdGuardHome -s start
/opt/AdGuardHome/AdGuardHome -s stop
/opt/AdGuardHome/AdGuardHome -s status

# Update Alpine packages
apk update && apk upgrade
```

### 10.2 Update AdGuard Home

```bash
pct enter 101

# The install script detects existing installation and updates in-place
curl -s -S -L \
  https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh \
  | sh -s -- -v

# Restart the service
rc-service AdGuardHome restart
rc-service AdGuardHome status
```

> Configuration, query logs, blocklists, and DNS rewrites are preserved during updates. All data is stored in `/opt/AdGuardHome/` alongside the binary.

### 10.3 Configuration Backup

```bash
# Backup AdGuard YAML config from Proxmox shell
pct exec 101 -- cat /opt/AdGuardHome/AdGuardHome.yaml \
  > adguard-backup-$(date +%Y%m%d).yaml

# Take a Proxmox snapshot before major changes
pct snapshot 101 pre-update-$(date +%Y%m%d) \
  --description "AdGuard Home pre-update snapshot"

# List existing snapshots
pct listsnapshot 101

# Rollback if needed
pct rollback 101 <snapshot-name>
```

### 10.4 Key File Paths (inside LXC 101)

| File | Purpose |
|---|---|
| `/opt/AdGuardHome/AdGuardHome` | Binary |
| `/opt/AdGuardHome/AdGuardHome.yaml` | Main configuration |
| `/opt/AdGuardHome/data/` | Query logs, statistics |
| `/etc/apk/repositories` | Alpine package repos |
| `/etc/init.d/AdGuardHome` | OpenRC service file |

### 10.5 Log Locations

```bash
# AdGuard Home runtime logs (tail)
pct exec 101 -- tail -f /var/log/AdGuardHome/AdGuardHome.log

# OpenRC service logs
pct exec 101 -- cat /var/log/messages | grep AdGuard
```

---

## 12. Roadmap — Next Steps

### 11.1 Pending — VLANs Persistent After Reboot

Currently, VLAN bridge settings on Proxmox are lost after reboot. Permanent fix:

```bash
# Edit the network interfaces file on Proxmox host
nano /etc/network/interfaces
```

Ensure `vmbr1` section contains:
```
auto vmbr1
iface vmbr1 inet manual
    bridge-ports enp1s0f0
    bridge-stp off
    bridge-fd 0
    bridge-vlan-aware yes
    bridge-vids 2-4094
```

Apply without rebooting:
```bash
ifreload -a
```

### 11.2 Pending — Connect K3s Nodes to Switch

| Device | Switch Port | VLAN | Role |
|---|---|---|---|
| T440p (K3s master) | Port 2 | VLAN 20 | control-plane |
| T430 (K3s worker1) | Port 3 | VLAN 20 | worker1 |
| P52 (K3s worker2) | Port 4–7 | VLAN 20 | worker2 |

Once connected, DHCP on VLAN 20 will assign IPs with `10.10.10.3` as DNS automatically.

### 11.3 Pending — Firewall Rules for DNS

Add explicit pfSense firewall rules to allow DNS traffic from all VLANs to AdGuard:

`Firewall → Rules → VLAN_XX → Add`

| Field | Value |
|---|---|
| Action | Pass |
| Protocol | TCP/UDP |
| Source | VLAN_XX net |
| Destination | `10.10.10.3` |
| Destination Port | 53 |
| Description | Allow DNS to AdGuard |

### 11.4 Future — AdGuard Monitoring with Prometheus

Once the K3s cluster is deployed, integrate AdGuard metrics:

```bash
# Inside the AdGuard LXC
docker run -d \
  -p 9617:9617 \
  -e ADGUARD_HOSTNAME=10.10.10.3 \
  -e ADGUARD_PORT=3000 \
  -e ADGUARD_USERNAME=admin \
  -e ADGUARD_PASSWORD=${SECRET} \
  ebrianne/adguard-exporter
```

Prometheus scrape config:
```yaml
- job_name: adguard
  static_configs:
  - targets: ['10.10.10.3:9617']
```

### 11.5 Future — Alertmanager Rules

```yaml
groups:
- name: adguard
  rules:
  - alert: AdGuardDown
    expr: up{job="adguard"} == 0
    for: 1m
    labels:
      severity: critical

  - alert: DNSLatencyHigh
    expr: adguard_avg_processing_time > 500
    for: 5m
    labels:
      severity: warning
```

---

## Appendix A — Quick Reference

### Service URLs

| Service | URL (Primary) | URL (Alternate) |
|---|---|---|
| AdGuard Home Dashboard | `http://192.168.1.100:3000` | `http://10.10.10.3:3000` |
| AdGuard Home Dashboard | `http://adguard.mgmt:3000` | — |
| pfSense Web UI | `https://10.10.10.1` | — |
| Proxmox UI | `https://192.168.1.65:8006` | `http://proxmox.mgmt:8006` |
| ISP Router | `http://192.168.1.254` | — |
| TL-SG108E Switch | `http://10.10.10.2` | — |

### Upstream DNS Summary

| Provider | URL | Bootstrap IP |
|---|---|---|
| Quad9 | `https://dns10.quad9.net/dns-query` | `9.9.9.9` |
| Cloudflare | `https://dns.cloudflare.com/dns-query` | `1.1.1.1` |
| Google | `https://dns.google/dns-query` | `8.8.8.8` |

### Blocklist Summary

| List | Rules |
|---|---|
| AdGuard DNS filter | 164,088 |
| OISD Big | 441,906 |
| Steven Black Unified | 83,081 |
| URLhaus Malware | 32,507 |
| Hagezi Pro | 209,827 |
| **Total** | **931,409** |

### DNS Rewrites

| Domain | Resolves To |
|---|---|
| `proxmox.mgmt` | `192.168.1.65` |
| `pfsense.mgmt` | `10.10.10.1` |
| `adguard.mgmt` | `192.168.1.100` |

### Key File Paths (inside LXC 101)

| File | Purpose |
|---|---|
| `/opt/AdGuardHome/AdGuardHome` | Binary |
| `/opt/AdGuardHome/AdGuardHome.yaml` | Main configuration |
| `/opt/AdGuardHome/data/` | Query logs, statistics |
| `/etc/apk/repositories` | Alpine package repos |
| `/etc/init.d/AdGuardHome` | OpenRC service file |

### Network Summary (v2.0)

```
Internet (ISP)
      │
Nokia GPON Router — 192.168.1.254
      │
  ┌───┴──────────────────────┐
  │ vmbr0                    │ vmbr1 (VLAN-aware trunk)
  │                          │
pfSense WAN              pfSense LAN → TL-SG108E
192.168.1.131            10.10.10.1
  │                          │
  │                    ┌─────┼─────────────┐
  │                 V10-MGMT V20-PROD    V30-DEV ...
  │                          │
  └──eth1──[LXC 101]──eth0───┘
     192.168.1.100  AdGuard  10.10.10.3
                    Home
                    Port 53 (DNS)
                    Port 3000 (UI)
```

---

## Appendix B — Troubleshooting Reference

| Symptom | Cause | Fix |
|---|---|---|
| `Get-NetAdapter` empty in Windows VM | VirtIO driver not installed | Use `e1000` NIC type instead of `virtio` |
| No access to `10.10.10.3:3000` | Client VM not in VLAN 10 | Set `tag=10` on VM NIC; use static IP in `10.10.10.x` |
| Cannot paste in noVNC console | noVNC clipboard limitation | Use VNC panel clipboard button, or configure via GUI (ncpa.cpl) |
| DNS not resolving in VLAN 20/30 | DHCP not distributing `10.10.10.3` | Update DNS Server field in pfSense DHCP per VLAN |
| AdGuard not starting after reboot | OpenRC not configured | `rc-update add AdGuardHome default` inside container |
| Both interfaces up but no internet | Default route via wrong interface | Verify `default via 10.10.10.1 dev eth0` in `ip route` |
| `Failed to create network device` | VLAN tag on non-VLAN-aware bridge | Add `bridge-vlan-aware yes` to `vmbr1` in `/etc/network/interfaces` |
| `SSL certificate verify failed` on `apk` | No CA certs in fresh container | Bootstrap with HTTP (Section 4.2) |
| `certificate is not yet valid` on `curl` | Host clock out of sync | Sync NTP on Proxmox host (Section 2.3), not inside LXC |
| `settimeofday: Operation not permitted` | Cannot change time inside LXC | Fix time on Proxmox host only |
| VLAN settings lost after Proxmox reboot | Bridge config not persistent | Edit `/etc/network/interfaces` (Section 11.1) |
| Telmex clients not using AdGuard DNS | Router DNS not set | Set DNS Primario to `192.168.1.100` in Telmex admin panel |

---

*Document v2.0 — Generated from live lab session · Proxmox 9.1.1 · Lenovo M720q · May 2026*
