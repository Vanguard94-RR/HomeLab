# Enterprise HomeLab — pfSense Installation & Configuration Manual

**Version:** 1.0  
**Date:** May 2026  
**Scope:** pfSense CE 2.7.2 · VM on Proxmox · Inter-VLAN Routing · DHCP · Firewall Rules  
**Prerequisites:** Proxmox VE 9.1.1 · TL-SG108E configured with 802.1Q VLANs · AdGuard Home LXC running

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [VM Configuration](#2-vm-configuration)
3. [Initial Access & Password Reset](#3-initial-access--password-reset)
4. [Setup Wizard](#4-setup-wizard)
5. [RAM Optimization](#5-ram-optimization)
6. [VLAN Interface Configuration](#6-vlan-interface-configuration)
7. [DHCP Server Configuration](#7-dhcp-server-configuration)
8. [Firewall Rules](#8-firewall-rules)
9. [Validation & Testing](#9-validation--testing)
10. [Roadmap — Next Steps](#10-roadmap--next-steps)

---

## 1. Architecture Overview

### Network Topology

```
Internet / ISP (Telmex Infinitum)
         │
   Nokia GPON Router — 192.168.1.254
         │
   vmbr0 (nic0) — Proxmox WAN
   Proxmox: 192.168.1.65
         │
   pfSense VM (VM 100)
   WAN:  vtnet0   → 192.168.1.131 (DHCP from ISP router)
   LAN:  vtnet1.10 → 10.10.10.1/24 (MGMT gateway) ← ACTUALIZADO Jun 2026
         │
   vmbr1 (enp1s0f0) — VLAN-aware trunk
         │
   TL-SG108E — 10.10.10.2
         │
   ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
   │      │      │      │      │      │      │      │      │
 P1(trunk) P2   P3     P4     P5     P6    P7(V10) P8(V90)
  M720q  7490#1 5480  7490#2 T440p  P52   T430    Parrot
         V20    V20    V20    V20    V20   mon
```

> **⚠️ Cambio Jun 2026:** La interfaz LAN fue migrada de `vtnet1` (native/untagged) a `vtnet1.10` (tagged VLAN 10). Esto permite que dispositivos físicos en VLAN 10 (como el T430 en puerto 7) alcancen pfSense correctamente.

### VLAN Routing Table — Estado actual (Junio 2026) ✅

| Interface | VLAN | Subnet | Gateway (pfSense) | Purpose |
|---|---|---|---|---|
| vtnet1.10 (LAN) | 10 | 10.10.10.0/24 | 10.10.10.1 | Management ← migrado de vtnet1 |
| vtnet1.20 (PROD) | 20 | 10.10.20.0/24 | 10.10.20.1 | K3s cluster |
| vtnet1.30 (DEV) | 30 | 10.10.30.0/24 | 10.10.30.1 | Development |
| vtnet1.40 (STORAGE) | 40 | 10.10.40.0/24 | 10.10.40.1 | Longhorn replication |
| vtnet1.50 (DMZ) | 50 | 10.10.50.0/24 | 10.10.50.1 | Ingress / exposed services |
| vtnet1.90 (PENTEST) | 90 | 10.10.90.0/24 | 10.10.90.1 | Red team — isolated |

### Firewall Policy Summary

```
LAN (MGMT)  → Any            ✓ Full access (management plane)
PROD        → Internet       ✓ Allow
PROD        → STORAGE        ✓ Allow (Longhorn replication)
PROD        → Other VLANs    ✗ Deny
DEV         → Internet       ✓ Allow
DEV         → PROD           ✓ Allow (deploy to cluster)
DEV         → Other VLANs    ✗ Deny
STORAGE     → STORAGE        ✓ Allow (intra-VLAN only)
STORAGE     → Other VLANs    ✗ Deny
DMZ         → (pending)      Configured when Traefik is deployed
PENTEST     → 10.10.0.0/8   ✗ Block ALL internal networks
PENTEST     → Internet       ✓ Allow (internet access only)
```

---

## 2. VM Configuration

### Proxmox VM Specs

```bash
# Verify VM configuration
qm config 100
```

| Parameter | Value | Notes |
|---|---|---|
| VM ID | 100 | |
| Name | pfsense | |
| Cores | 2 vCPU | `cpu: host` — uses all host CPU features |
| Memory | 2048 MB | Reduced from 4608MB (see Section 5) |
| Disk | 32GB (local-lvm) | ide0 |
| net0 | vtnet0 → vmbr0 | WAN — ISP network 192.168.1.x |
| net1 | vtnet1 → vmbr1 | LAN — VLAN trunk to switch |
| OS | FreeBSD (pfSense CE 2.7.2) | |

### Network Interface Mapping

```
Proxmox          pfSense
─────────        ─────────
vmbr0    ───→    vtnet0   (WAN)
vmbr1    ───→    vtnet1   (LAN / VLAN trunk)
```

The key design point: `vmbr1` has `bridge-vlan-aware yes` and `bridge-vids 2-4094` configured in Proxmox, allowing pfSense to receive tagged VLAN frames from the TL-SG108E trunk.

---

## 3. Initial Access & Password Reset

### Console Access

pfSense is accessible via the Proxmox console:

```
Proxmox UI → VM 100 (pfsense) → Console
```

The console shows the pfSense menu with interface status:

```
WAN (wan)  → vtnet0  → v4/DHCP4: 192.168.1.131/24
LAN (lan)  → vtnet1  → v4: 10.10.10.1/24
```

### Web UI Access

The web UI is accessible from any machine on the `10.10.10.x` network:

```
http://10.10.10.1
```

The Windows VM (VM 199) on `vmbr1` was used to access pfSense during initial setup.

### Password Reset

If the admin password is unknown, reset it from the pfSense console:

1. In the console menu, type `3` and press Enter
2. Confirm with `y`
3. Password is reset to `pfsense`
4. Log in with `admin` / `pfsense`
5. **Change the password immediately** after login via `System → User Manager`

> **Security note:** The web UI shows a persistent WARNING until the default password is changed.

---

## 4. Setup Wizard

The setup wizard runs automatically on first login. Navigate through all 9 steps:

### Step 2 — General Information

| Field | Value | Notes |
|---|---|---|
| Hostname | `pfsense` | |
| Domain | `lab.internal` | Used for split-horizon DNS |
| Primary DNS | `10.10.10.3` | AdGuard Home (post-migration IP) |
| Secondary DNS | `1.1.1.1` | Cloudflare fallback |
| Override DNS | ☑ Enabled | Allow WAN DHCP to override DNS |

> Domain `lab.internal` enables internal service resolution as `service.lab.internal`.

### Step 3 — Time Server

| Field | Value |
|---|---|
| Time server | `2.pfsense.pool.ntp.org` (default) |
| Timezone | `America/Mexico_City` |

### Step 4 — WAN Interface

| Field | Value | Notes |
|---|---|---|
| Type | `DHCP` | ISP router assigns IP automatically |
| MAC / MTU / MSS | blank | Leave default |
| Block RFC1918 | ☐ **UNCHECKED** | **Critical** — WAN is on private 192.168.1.x network |
| Block bogon | ☑ Checked | Leave enabled |

> **Important:** Block RFC1918 must be disabled because the WAN interface connects to the Telmex router (192.168.1.x) which is itself a private RFC1918 network. Leaving it enabled would block all WAN traffic.

### Step 5 — LAN Interface

| Field | Value |
|---|---|
| LAN IP Address | `10.10.10.1` |
| Subnet Mask | `24` |

> This was already pre-configured correctly. No changes needed.

### Steps 6–7 — Admin Password

Set a strong password for the admin account. This eliminates the persistent WARNING banner.

### Steps 8–9 — Apply & Finish

pfSense applies all configuration and reloads. The browser tab title changes to `pfSense.lab.internal` confirming the domain was applied.

---

## 5. RAM Optimization

### Default vs Optimized

| Parameter | Default | Optimized | Savings |
|---|---|---|---|
| Memory | 4608 MB | 2048 MB | 2.5 GB freed |
| Usage at idle | 7% (~320MB) | 18% (~360MB) | — |

### Minimum Requirements for This Configuration

| Use Case | RAM Needed |
|---|---|
| Basic routing only | 512 MB |
| VLANs + DHCP + Firewall | 1 GB |
| + WireGuard VPN | 1.5 GB |
| + pfBlockerNG / Suricata | 2+ GB |

2 GB provides comfortable headroom for all planned features including WireGuard.

### Procedure

```bash
# From Proxmox shell
qm stop 100
qm set 100 --memory 2048
qm config 100 | grep memory    # verify
qm start 100
```

---

## 6. VLAN Interface Configuration

### Step 1 — Create VLAN Sub-interfaces

Navigate to `Interfaces → Assignments → VLANs → Add`

Create each VLAN on the **vtnet1 (lan)** parent interface:

| VLAN Tag | Parent | Description |
|---|---|---|
| 20 | vtnet1 (lan) | PROD |
| 30 | vtnet1 (lan) | DEV |
| 40 | vtnet1 (lan) | STORAGE |
| 50 | vtnet1 (lan) | DMZ |
| 90 | vtnet1 (lan) | PENTEST |

> **Note:** VLAN 10 is NOT created here. The physical LAN interface (vtnet1) **is** VLAN 10 — it already has IP `10.10.10.1/24` assigned.

> **Common mistake fixed:** VLAN 90 PENTEST was initially created on `vtnet0 (wan)` by mistake. It was corrected to `vtnet1 (lan)` before proceeding.

### Step 2 — Assign Interfaces

Navigate to `Interfaces → Assignments`

Click **Add** for each VLAN to assign it as an interface:

| pfSense Interface | Network Port | VLAN |
|---|---|---|
| WAN | vtnet0 (bc:24:11:ed:86:90) | — |
| LAN | vtnet1 (bc:24:11:d8:5c:e7) | 10 |
| OPT1 → PROD | VLAN 20 on vtnet1 | 20 |
| OPT2 → DEV | VLAN 30 on vtnet1 | 30 |
| OPT3 → STORAGE | VLAN 40 on vtnet1 | 40 |
| OPT4 → DMZ | VLAN 50 on vtnet1 | 50 |
| OPT5 → PENTEST | VLAN 90 on vtnet1 | 90 |

Click **Save** after adding all 5 VLANs.

### Step 3 — Configure Each Interface

For each OPT interface, navigate to `Interfaces → OPT{N}` and configure:

#### PROD (OPT1 / vtnet1.20)

| Field | Value |
|---|---|
| Enable | ☑ |
| Description | `PROD` |
| IPv4 Config Type | Static IPv4 |
| IPv4 Address | `10.10.20.1 / 24` |
| IPv4 Upstream Gateway | None |

#### DEV (OPT2 / vtnet1.30)

| Field | Value |
|---|---|
| Enable | ☑ |
| Description | `DEV` |
| IPv4 Config Type | Static IPv4 |
| IPv4 Address | `10.10.30.1 / 24` |
| IPv4 Upstream Gateway | None |

#### STORAGE (OPT3 / vtnet1.40)

| Field | Value |
|---|---|
| Enable | ☑ |
| Description | `STORAGE` |
| IPv4 Config Type | Static IPv4 |
| IPv4 Address | `10.10.40.1 / 24` |
| IPv4 Upstream Gateway | None |

#### DMZ (OPT4 / vtnet1.50)

| Field | Value |
|---|---|
| Enable | ☑ |
| Description | `DMZ` |
| IPv4 Config Type | Static IPv4 |
| IPv4 Address | `10.10.50.1 / 24` |
| IPv4 Upstream Gateway | None |

#### PENTEST (OPT5 / vtnet1.90)

| Field | Value |
|---|---|
| Enable | ☑ |
| Description | `PENTEST` |
| IPv4 Config Type | Static IPv4 |
| IPv4 Address | `10.10.90.1 / 24` |
| IPv4 Upstream Gateway | None |

### Verified Interface Status

After configuration, all interfaces show UP in the dashboard:

```
WAN       ↑  192.168.1.131    (vtnet0)
LAN       ↑  10.10.10.1       (vtnet1)
PROD      ↑  10.10.20.1       (vtnet1.20)
DEV       ↑  10.10.30.1       (vtnet1.30)
STORAGE   ↑  10.10.40.1       (vtnet1.40)
DMZ       ↑  10.10.50.1       (vtnet1.50)
PENTEST   ↑  10.10.90.1       (vtnet1.90)
```

---

## 7. DHCP Server Configuration

Navigate to `Services → DHCP Server`

DHCP is configured only for VLANs with dynamic clients. STORAGE and DMZ use static IP assignment.

### PROD (VLAN 20)

| Field | Value |
|---|---|
| Enable | ☑ |
| Range From | `10.10.20.100` |
| Range To | `10.10.20.200` |
| DNS Server 1 | `10.10.10.3` (AdGuard Home) |
| Gateway | `10.10.20.1` |
| Domain name | `lab.internal` |

### DEV (VLAN 30)

| Field | Value |
|---|---|
| Enable | ☑ |
| Range From | `10.10.30.100` |
| Range To | `10.10.30.200` |
| DNS Server 1 | `10.10.10.3` (AdGuard Home) |
| Gateway | `10.10.30.1` |
| Domain name | `lab.internal` |

### PENTEST (VLAN 90)

| Field | Value | Notes |
|---|---|---|
| Enable | ☑ | |
| Range From | `10.10.90.100` | |
| Range To | `10.10.90.150` | Smaller pool — isolated segment |
| DNS Server 1 | `10.10.90.1` | **pfSense itself** — NOT AdGuard |
| Gateway | `10.10.90.1` | |
| Domain name | *(empty)* | No internal domain visibility |

> **Security design:** PENTEST DNS points to `10.10.90.1` (pfSense gateway) instead of AdGuard Home (`10.10.10.3`). This prevents the Parrot OS machine from resolving internal `lab.internal` hostnames and gaining visibility into the lab infrastructure.

### No DHCP Required

| VLAN | Reason |
|---|---|
| VLAN 10 MGMT | Proxmox, switch, AdGuard have static IPs |
| VLAN 40 STORAGE | Longhorn nodes have static IPs (K3s nodes) |
| VLAN 50 DMZ | Traefik Ingress has static IP assigned via K3s MetalLB |

---

## 8. Firewall Rules

Navigate to `Firewall → Rules`

pfSense uses a **default deny** policy — only explicitly allowed traffic passes. Rules are evaluated top-to-bottom on each interface.

### LAN (MGMT — VLAN 10)

Pre-configured by pfSense. No modifications needed.

| Rule | Protocol | Source | Destination | Action |
|---|---|---|---|---|
| Anti-Lockout Rule | TCP | * | LAN address:443/80 | ✓ Pass |
| Default allow LAN to any | IPv4 * | LAN subnets | * | ✓ Pass |
| Default allow LAN IPv6 | IPv6 * | LAN subnets | * | ✓ Pass |

> The Anti-Lockout Rule prevents accidental lockout from the web UI — it cannot be deleted.

### PROD (VLAN 20)

| # | Rule | Source | Destination | Action | Description |
|---|---|---|---|---|---|
| 1 | Pass | PROD subnets | * | ✓ Allow | Allow PROD to internet |
| 2 | Pass | PROD subnets | STORAGE subnets | ✓ Allow | Allow PROD to STORAGE (Longhorn) |

### DEV (VLAN 30)

| # | Rule | Source | Destination | Action | Description |
|---|---|---|---|---|---|
| 1 | Pass | DEV subnets | * | ✓ Allow | Allow DEV to internet |
| 2 | Pass | DEV subnets | PROD subnets | ✓ Allow | Allow DEV to PROD (deploy to K3s) |

### STORAGE (VLAN 40)

| # | Rule | Source | Destination | Action | Description |
|---|---|---|---|---|---|
| 1 | Pass | STORAGE subnets | STORAGE subnets | ✓ Allow | Allow Storage intra-VLAN (Longhorn replication) |

### DMZ (VLAN 50)

Pending configuration — will be set up when Traefik Ingress is deployed in K3s.

Planned rules:
- Allow inbound HTTPS (443) from WAN to DMZ
- Allow DMZ to PROD on specific K3s service ports
- Deny DMZ to all other VLANs

### PENTEST (VLAN 90)

| # | Rule | Source | Destination | Action | Description |
|---|---|---|---|---|---|
| 1 | **Block** | PENTEST subnets | 10.10.0.0/8 | ✗ Block | Block PENTEST to all internal networks |
| 2 | Pass | PENTEST subnets | * | ✓ Allow | Allow PENTEST to internet |

> **Rule order is critical.** Rule 1 (Block) must be above Rule 2 (Allow any). pfSense evaluates rules top-to-bottom and stops at the first match. The Block rule catches all `10.x.x.x` traffic before the Allow rule can permit it.

### Firewall Rules Summary Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    pfSense Firewall                         │
├──────────┬───────────────────────────────────────────────── │
│ MGMT     │ → Any                              ✓ ALLOW ALL  │
├──────────┼─────────────────────────────────────────────────┤
│ PROD     │ → Internet                         ✓ ALLOW      │
│          │ → STORAGE (10.10.40.0/24)          ✓ ALLOW      │
│          │ → Other internal                   ✗ DENY       │
├──────────┼─────────────────────────────────────────────────┤
│ DEV      │ → Internet                         ✓ ALLOW      │
│          │ → PROD (10.10.20.0/24)             ✓ ALLOW      │
│          │ → Other internal                   ✗ DENY       │
├──────────┼─────────────────────────────────────────────────┤
│ STORAGE  │ → STORAGE (intra-VLAN only)        ✓ ALLOW      │
│          │ → Any other                        ✗ DENY       │
├──────────┼─────────────────────────────────────────────────┤
│ DMZ      │ Pending Traefik deployment         ⏳ TODO      │
├──────────┼─────────────────────────────────────────────────┤
│ PENTEST  │ → 10.10.0.0/8 (ALL internal)       ✗ BLOCK      │
│          │ → Internet                         ✓ ALLOW      │
└──────────┴─────────────────────────────────────────────────┘
```

---

## 9. Validation & Testing

### Verify Interface Status

From the pfSense dashboard (`Status → Dashboard`):

All 7 interfaces should show ↑ (UP) with correct IPs:

```
WAN     ↑  192.168.1.131
LAN     ↑  10.10.10.1
PROD    ↑  10.10.20.1
DEV     ↑  10.10.30.1
STORAGE ↑  10.10.40.1
DMZ     ↑  10.10.50.1
PENTEST ↑  10.10.90.1
```

### Test Inter-VLAN Routing

From the pfSense console (option 8 — Shell):

```bash
# Test WAN connectivity
ping -c 3 8.8.8.8

# Test each VLAN gateway
ping -c 3 10.10.20.1
ping -c 3 10.10.30.1
ping -c 3 10.10.40.1
ping -c 3 10.10.90.1
```

### Test DHCP

Connect a device to switch port 2 (VLAN 20) or port 3 (VLAN 20). It should receive:
- IP: `10.10.20.100–200`
- Gateway: `10.10.20.1`
- DNS: `10.10.10.3`
- Domain: `lab.internal`

### Test PENTEST Isolation

From the Parrot OS machine (VLAN 90):

```bash
# This should FAIL — blocked by firewall
ping 10.10.10.1
ping 10.10.20.1

# This should SUCCEED — internet allowed
ping 8.8.8.8
curl https://google.com
```

### Verify NAT

pfSense automatically creates NAT (outbound masquerade) rules. Verify at `Firewall → NAT → Outbound`:

Should show automatic rules translating all internal subnets (`10.10.x.0/24`) to the WAN IP (`192.168.1.131`).

---

## 10. Roadmap — Next Steps

### Immediate

**Change admin password:**
```
System → User Manager → Edit admin → Password
```

### AdGuard Home Migration

Once pfSense is the DHCP server for all VLANs, migrate AdGuard from `192.168.1.100` to `10.10.10.3` on VLAN 10:

```bash
# From Proxmox shell
pct stop 101
pct set 101 --net0 name=eth0,bridge=vmbr1,tag=10,ip=10.10.10.3/24,gw=10.10.10.1
pct start 101
```

Then update pfSense DHCP DNS to `10.10.10.3` for all VLANs.

### WireGuard VPN

Configure WireGuard for remote access to the lab:

```
VPN → WireGuard → Add Tunnel
```

- Listen port: `51820`
- Tunnel network: `10.10.100.0/24`
- Firewall rule: Allow WireGuard clients to LAN

### K3s Nodes

Con pfSense proveyendo DHCP en VLAN 20. Nodos conectados y funcionando:
- Dell 7490 #1 (puerto 2) → 10.10.20.100 ✅
- Dell 5480 (puerto 3) → 10.10.20.102 ✅
- Dell 7490 #2 (puerto 4) → 10.10.20.101 ✅
- T440p storage (puerto 5) → 10.10.20.104 ✅
- P52 ML/GPU (puerto 6) → 10.10.20.103 ✅

### Monitoring server (T430 — Junio 2026 ✅)

El T430 fue migrado de VLAN 20 a VLAN 10 para actuar como servidor de monitoreo dedicado:
1. pfSense: VLAN 10 creada como `vtnet1.10`, LAN migrada de `vtnet1` a `vtnet1.10`
2. Switch: puerto 7 configurado con PVID 10 y VLAN 10 untagged
3. T430: IP estática `10.10.10.10/24`, gateway `10.10.10.1`

### Acceso P53 al lab (Junio 2026 ✅)

Reglas de firewall WAN agregadas para acceso desde P53 (192.168.1.x):

```
Firewall → Rules → WAN:
  Action: Pass | Source: 192.168.1.0/24 | Dest: WAN address | Port: 80
  Action: Pass | Source: 192.168.1.0/24 | Dest: 10.10.0.0/8 | Protocol: Any
```

Rutas estáticas en P53:
```bash
nmcli connection modify "INFINITUMC241" \
  +ipv4.routes "10.10.10.0/24 192.168.1.131" \
  +ipv4.routes "10.10.20.0/24 192.168.1.131"
```

### DMZ Firewall Rules

After Traefik Ingress is deployed in K3s:
```
Allow: WAN:443 → DMZ (Traefik)
Allow: DMZ → PROD:specific ports (K3s services)
Deny:  DMZ → all other VLANs
```

### pfSense Backup

Always backup after significant changes:

```
Diagnostics → Backup & Restore → Download configuration as XML
```

Store the backup file securely — it contains the full firewall configuration.

---

## Appendix — Quick Reference

### Access

```
pfSense Web UI:   http://10.10.10.1      (desde VLAN 10 — T430, Windows VM)
pfSense Web UI:   http://192.168.1.131   (desde P53 via regla WAN — requiere ruta estática)
Username:         admin
Password:         (changed from default 'pfsense')
Console:          Proxmox → VM 100 → Console
```

> **Nota Jun 2026:** Para acceder desde pfSense shell: opción 8 (Shell) → `pfctl -d` deshabilita temporalmente el firewall para debug. Reactivar con `pfctl -e`.

### Key IPs

```
pfSense WAN:      192.168.1.131 (DHCP)
pfSense LAN:      10.10.10.1 (vtnet1.10 — VLAN 10 tagged)
pfSense PROD GW:  10.10.20.1
pfSense DEV GW:   10.10.30.1
pfSense STOR GW:  10.10.40.1
pfSense DMZ GW:   10.10.50.1
pfSense PEN GW:   10.10.90.1
AdGuard DNS:      192.168.1.100 → 10.10.10.3
Switch MGMT:      10.10.10.2
Proxmox:          192.168.1.65
T430 monitoring:  10.10.10.10
```

### DHCP Pools

```
VLAN 10 MGMT:     sin DHCP — IPs estáticas (T430: 10.10.10.10, AdGuard: 10.10.10.3, Switch: 10.10.10.2)
VLAN 20 PROD:     10.10.20.100 – 10.10.20.200  DNS: 10.10.10.3
VLAN 30 DEV:      10.10.30.100 – 10.10.30.200  DNS: 10.10.10.3
VLAN 90 PENTEST:  10.10.90.100 – 10.10.90.150  DNS: 10.10.90.1
```

### Proxmox Commands

```bash
# Start/stop pfSense
qm start 100
qm stop 100
qm reboot 100

# Check status
qm status 100

# Console access (non-graphical)
qm terminal 100
```

### Cambios Jun 2026

| Cambio | Descripción |
|---|---|
| LAN migrada | vtnet1 (untagged) → vtnet1.10 (VLAN 10 tagged) |
| T430 VLAN | VLAN 20 → VLAN 10, IP 10.10.20.101 → 10.10.10.10 |
| Regla WAN P53 | 192.168.1.0/24 → WAN:80 y 10.10.0.0/8 |
| Switch puerto 7 | libre → T430 monitoring PVID 10 |

---

*Document generated from live lab session — pfSense CE 2.7.2 on Proxmox 9.1.1 / Lenovo M720q*
