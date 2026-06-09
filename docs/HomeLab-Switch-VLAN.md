# Enterprise HomeLab — Switch & VLAN Configuration Manual

**Version:** 1.0  
**Date:** May 2026  
**Scope:** TP-Link TL-SG108E · 802.1Q VLANs · Proxmox vmbr1 trunk · Network segmentation  
**Prerequisites:** Proxmox VE 9.1.1 installed · AdGuard Home LXC running (see previous manual)

---

## Table of Contents

1. [Network Architecture Overview](#1-network-architecture-overview)
2. [Hardware Inventory](#2-hardware-inventory)
3. [Physical Port Layout](#3-physical-port-layout)
4. [VLAN Design](#4-vlan-design)
5. [Accessing the Switch](#5-accessing-the-switch)
6. [Switch IP Configuration](#6-switch-ip-configuration)
7. [802.1Q VLAN Configuration](#7-8021q-vlan-configuration)
8. [PVID Configuration](#8-pvid-configuration)
9. [Proxmox Bridge Verification](#9-proxmox-bridge-verification)
10. [Backup Switch Configuration](#10-backup-switch-configuration)
11. [Troubleshooting Reference](#11-troubleshooting-reference)
12. [Roadmap — Next Steps](#12-roadmap--next-steps)

---

## 1. Network Architecture Overview

### Current State (Post-Switch Configuration)

```
Internet / ISP (Telmex Infinitum)
         │
   Nokia GPON Router
   192.168.1.254
         │
   nic0 (vmbr0)
   Proxmox — 192.168.1.65
         │
   enp1s0f0 (vmbr1) ← VLAN-aware 802.1Q trunk
         │
   TL-SG108E — 10.10.10.2 (VLAN 10 MGMT)
         │
   ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
   │     │     │     │     │     │     │     │     │
  P1    P2    P3    P4    P5    P6    P7    P8
 Trunk  7490  5480  7490  T440p  P52  T430  Parrot
        #1         #2  storage       mon   VLAN90
       V20   V20   V20   V20    V20  V10   PENTEST
  (M720q) ctrl  wkr2  wkr1  wkr4  wkr3  mgmt
```

**Estado actual — Junio 2026 — VERIFICADO Y ACTIVO**

### Design Principles

- The PCIe NIC ports (`enp1s0f0–3`) are **isolated from the ISP network** (`192.168.1.x`)
- All lab traffic uses the `10.10.x.x` address space
- pfSense (future) will handle NAT and inter-VLAN routing between `192.168.1.x` (WAN) and `10.10.x.x` (LAN)
- The Parrot OS machine is **physically isolated** in VLAN 90 with no route to other VLANs

---

## 2. Hardware Inventory

| Device | Model | Role | IP |
|---|---|---|---|
| Hypervisor | Lenovo M720q | Proxmox VE host | 192.168.1.65 (vmbr0) |
| Switch | TP-Link TL-SG108E v6.0 | Layer 2 managed switch | 10.10.10.2 (VLAN 10) |
| K3s control-plane | Dell Latitude 7490 #1 | K3s server — Port 2 | 10.10.20.100 (VLAN 20) |
| K3s worker2 | Dell Latitude 5480 | K3s agent — Port 3 | 10.10.20.102 (VLAN 20) |
| K3s worker1 | Dell Latitude 7490 #2 | K3s agent — Port 4 | 10.10.20.101 (VLAN 20) |
| K3s worker4 storage | ThinkPad T440p | K3s agent — Port 5 | 10.10.20.104 (VLAN 20) |
| K3s worker3 ML/GPU | ThinkPad P52 | K3s agent — Port 6 | 10.10.20.103 (VLAN 20) |
| Monitoring server | ThinkPad T430 | Prometheus+Grafana+Loki — Port 7 | 10.10.10.10 (VLAN 10) |
| Pentesting | Parrot OS machine | Red team — Port 8 | VLAN 90 (10.10.90.x) |

### Switch Specifications

| Field | Value |
|---|---|
| Model | TL-SG108E |
| Hardware Version | 6.0 |
| Firmware Version | 1.0.0 Build 20250710 Rel.71093 |
| MAC Address | AC:A7:F1:36:55:96 |
| Ports | 8x Gigabit RJ45 |
| Management | Web UI + Easy Smart Utility |
| VLAN Support | 802.1Q, Port-based, MTU |

---

## 3. Physical Port Layout

| Port | Connected Device | VLAN | Mode | PVID |
|---|---|---|---|---|
| 1 | M720q (enp1s0f0) | 10,20,30,40,50,90 | **Tagged (trunk)** | 1 |
| 2 | T440p (K3s master) | 20 | Untagged | 20 |
| 3 | T430 (K3s worker 1) | 20 | Untagged | 20 |
| 4 | — (free) | — | — | 1 |
| 5 | — (free) | — | — | 1 |
| 6 | — (free) | — | — | 1 |
| 7 | — (free) | — | — | 1 |
| 8 | T440p Parrot OS | 90 | Untagged | 90 |

> **Port 1 is the uplink/trunk port** connecting to the Proxmox host. It carries all VLAN traffic tagged, allowing pfSense VMs and LXC containers to be assigned to specific VLANs.

---

## 4. VLAN Design

| VLAN ID | Name | Subnet | Purpose | Devices |
|---|---|---|---|---|
| 1 | Default | — | Switch management default | All ports (base) |
| 10 | MGMT | 10.10.10.0/24 | Out-of-band management | Proxmox, switch, AdGuard |
| 20 | PROD | 10.10.20.0/24 | K3s production cluster | T440p, T430, P52 (future) |
| 30 | DEV | 10.10.30.0/24 | Development & builds | P52, P53 (future) |
| 40 | STORAGE | 10.10.40.0/24 | Longhorn replication traffic | K3s nodes (future) |
| 50 | DMZ | 10.10.50.0/24 | Exposed services / Ingress | K3s Traefik (future) |
| 90 | PENTEST | 10.10.90.0/24 | Red team — fully isolated | T440p Parrot OS |

### VLAN Security Policy

```
VLAN 10 (MGMT)    → Can reach all VLANs (admin access)
VLAN 20 (PROD)    → Can reach VLAN 40 (storage) only
VLAN 30 (DEV)     → Can reach VLAN 20 (prod) read-only
VLAN 40 (STORAGE) → Isolated — only K3s nodes
VLAN 50 (DMZ)     → Can reach VLAN 20 (prod) via specific ports only
VLAN 90 (PENTEST) → NO routes to any other VLAN — fully isolated
```

> Inter-VLAN routing rules will be enforced by pfSense firewall rules (future configuration).

---

## 5. Accessing the Switch

### Problem: Switch on Different Subnet

The TL-SG108E uses a proprietary Layer 2 discovery protocol. When the switch has an IP on a different subnet than the management host, it cannot be reached via standard IP tools (`ping`, browser). The **Easy Smart Configuration Utility** must be used — it discovers switches via broadcast regardless of IP.

### Discovery Method Used

Since the switch was connected to `vmbr1` (PCIe NIC) and not `vmbr0` (main LAN), a Windows VM was required:

**Step 1 — Identify which Proxmox bridge the switch is connected to:**

```bash
# From Proxmox shell — check which PCIe port has link
ip link show enp1s0f0
ip link show enp1s0f1
ip link show enp1s0f2
ip link show enp1s0f3
```

Result: `enp1s0f0` (master `vmbr1`) showed `state UP` — switch connected here.

**Step 2 — Move Windows VM to the correct bridge:**

```bash
# Stop the VM
qm stop 199

# Change bridge from vmbr0 to vmbr1
qm set 199 --net0 e1000=BC:24:11:B9:78:84,bridge=vmbr1,firewall=1

# Start the VM
qm start 199
```

**Step 3 — Run Easy Smart Configuration Utility in Windows VM**

Download from: `https://www.tp-link.com/us/support/download/tl-sg108e/#Utility`

The utility discovered the switch at IP `10.10.10.101` — its previous configuration.

### Default Access Credentials

| Field | Value |
|---|---|
| Default IP | 192.168.0.1 (factory) |
| Username | Printed on switch label |
| Password | Printed on switch label |
| Web UI port | 80 |

> **Note:** The TL-SG108E v6.0 has a web UI accessible via browser once on the same subnet. Earlier versions (v1.0) required the Windows utility only.

### Factory Reset Procedure

If the switch IP is unknown or unreachable:

1. Power on the switch
2. Press and hold the **Reset button for 15 seconds** (until all port LEDs flash simultaneously)
3. Wait **60 seconds** for full reboot
4. Default IP restored to `192.168.0.1`

> **Critical:** 5 seconds is NOT sufficient. The reset requires a full 15-second hold with visual confirmation (simultaneous LED flash).

---

## 6. Switch IP Configuration

### Via Easy Smart Configuration Utility

1. Open the utility — switch appears in **Discovered Switches** list
2. Click the **gear icon** (IP Setting) on the switch row
3. Configure:

| Field | Value |
|---|---|
| DHCP Setting | **Disable** |
| IP Address | `10.10.10.2` |
| Subnet Mask | `255.255.255.0` |
| Default Gateway | `10.10.10.1` |

4. Enter credentials from the switch label
5. Click **Apply**

### Via Web UI (System → IP Setting)

Once accessible, the IP can also be changed at:
```
System → IP Setting
```

### IP Address Rationale

| Address | Reason |
|---|---|
| `10.10.10.2` | VLAN 10 MGMT subnet — management plane |
| Gateway `10.10.10.1` | Future pfSense LAN interface for VLAN 10 |
| NOT `192.168.x.x` | Isolated from ISP router — security best practice |

---

## 7. 802.1Q VLAN Configuration

### Enable 802.1Q

Navigate to `VLAN → 802.1Q VLAN`

A confirmation dialog appears:
> "802.1Q VLAN will be enabled. Port based VLAN and MTU VLAN will be disabled automatically."

Click **Yes**.

### Create VLANs

Navigate to `VLAN → 802.1Q VLAN` and create each VLAN using the form:

---

#### VLAN 10 — MGMT

| Field | Value |
|---|---|
| VLAN ID | `10` |
| VLAN Name | `MGMT` |
| Tagged Ports | Port 1 |
| Untagged Ports | Port 7 |

> Puerto 7 untagged para el T430 (servidor de monitoreo dedicado, 10.10.10.10). Actualizado Junio 2026.

---

#### VLAN 20 — PROD

| Field | Value |
|---|---|
| VLAN ID | `20` |
| VLAN Name | `PROD` |
| Tagged Ports | Port 1 |
| Untagged Ports | Ports 2, 3, 4, 5, 6 |

> Puertos 2-6 para los 5 nodos K3s: Dell 7490 #1 (ctrl-plane), Dell 5480 (wkr2), Dell 7490 #2 (wkr1), T440p (wkr4 storage), P52 (wkr3 ML). Actualizado Junio 2026.

---

#### VLAN 30 — DEV

| Field | Value |
|---|---|
| VLAN ID | `30` |
| VLAN Name | `DEV` |
| Tagged Ports | Port 1 |
| Untagged Ports | None (P52 not yet connected) |

---

#### VLAN 40 — STORAGE

| Field | Value |
|---|---|
| VLAN ID | `40` |
| VLAN Name | `STORAGE` |
| Tagged Ports | Port 1 |
| Untagged Ports | None (dedicated to Longhorn replication) |

---

#### VLAN 50 — DMZ

| Field | Value |
|---|---|
| VLAN ID | `50` |
| VLAN Name | `DMZ` |
| Tagged Ports | Port 1 |
| Untagged Ports | None (K3s Ingress via pfSense) |

---

#### VLAN 90 — PENTEST

| Field | Value |
|---|---|
| VLAN ID | `90` |
| VLAN Name | `PENTEST` |
| Tagged Ports | Port 1 |
| Untagged Ports | Port 8 |

> Port 8 is untagged because Parrot OS does not need to be aware of VLANs. The switch places all traffic from port 8 into VLAN 90 automatically. **No route exists from VLAN 90 to any other VLAN.**

---

### Final VLAN Table — Estado actual (Junio 2026) ✅

| VLAN | Name | Member Ports | Tagged Ports | Untagged Ports |
|---|---|---|---|---|
| 1 | Default | 1-8 | — | 1-8 |
| 10 | MGMT | 1, 7 | 1 | 7 |
| 20 | PROD | 1-6 | 1 | 2-6 |
| 30 | DEV | 1 | 1 | — |
| 40 | STORAGE | 1 | 1 | — |
| 50 | DMZ | 1 | 1 | — |
| 90 | PENTEST | 1, 8 | 1 | 8 |

---

## 8. PVID Configuration

Navigate to `VLAN → 802.1Q PVID Setting`

The PVID (Port VLAN ID) determines which VLAN **untagged ingress traffic** is assigned to.

### PVID Settings — Estado actual (Junio 2026) ✅

| Port | PVID | Device | Reason |
|---|---|---|---|
| Port 1 | 1 | M720q trunk | Trunk port — M720q sends pre-tagged traffic |
| Port 2 | 20 | Dell 7490 #1 | K3s control-plane → VLAN 20 PROD |
| Port 3 | 20 | Dell 5480 | K3s worker2 → VLAN 20 PROD |
| Port 4 | 20 | Dell 7490 #2 | K3s worker1 → VLAN 20 PROD |
| Port 5 | 20 | T440p storage | K3s worker4 → VLAN 20 PROD |
| Port 6 | 20 | P52 ML/GPU | K3s worker3 → VLAN 20 PROD |
| Port 7 | 10 | T430 monitoring | Monitoring server → VLAN 10 MGMT |
| Port 8 | 90 | Parrot OS | Red team → VLAN 90 PENTEST |

### How to Configure

1. Select the checkbox for **port 2 and port 3**
2. Enter PVID: `20`
3. Click **Apply**
4. Select the checkbox for **port 8**
5. Enter PVID: `90`
6. Click **Apply**

### PVID Logic Explained

```
Packet arrives at Port 2 (T440p) with no VLAN tag
    ↓
Switch applies PVID 20
    ↓
Packet is now treated as VLAN 20 traffic internally
    ↓
Exits Port 1 (trunk) with VLAN 20 tag added
    ↓
Proxmox/pfSense receives packet tagged as VLAN 20
```

```
Packet arrives at Port 1 (trunk) tagged VLAN 20
    ↓
Switch strips the VLAN 20 tag
    ↓
Forwards untagged to Port 2 or Port 3 (VLAN 20 members)
    ↓
T440p/T430 receive a normal untagged Ethernet frame
```

---

## 9. Proxmox Bridge Verification

### vmbr1 Configuration

The Proxmox bridge `vmbr1` was already configured correctly before switch setup:

```bash
cat /etc/network/interfaces | grep -A8 vmbr1
```

```
auto vmbr1
iface vmbr1 inet manual
        bridge-ports enp1s0f0
        bridge-stp off
        bridge-fd 0
        bridge-vlan-aware yes
        bridge-vids 2-4094
#LAN trunk 802.1Q → TL-SG10
```

### Key Parameters

| Parameter | Value | Importance |
|---|---|---|
| `bridge-vlan-aware yes` | Enabled | Allows VMs/LXCs to use VLAN tags |
| `bridge-vids 2-4094` | Full range | Accepts all VLAN IDs from the switch trunk |
| `bridge-ports enp1s0f0` | PCIe port 0 | Physical uplink to switch port 1 |
| `inet manual` | No IP on bridge | IP is assigned per-VLAN via pfSense |

### Full Network Interface Summary

| Bridge | Physical Port | IP | Role |
|---|---|---|---|
| vmbr0 | nic0 | 192.168.1.65 | WAN/ISP uplink |
| vmbr1 | enp1s0f0 | None (manual) | LAN trunk → switch |
| vmbr2 | enp1s0f1 | None (manual) | VPN uplink (future) |
| vmbr3 | enp1s0f2 | None (manual) | OPT2 reserved |
| vmbr4 | enp1s0f3 | None (manual) | Storage/backup segment |

### Assigning VMs/LXCs to VLANs

With `bridge-vlan-aware yes`, VMs and LXCs can be assigned to specific VLANs by adding a VLAN tag to their network interface:

```bash
# Assign a VM to VLAN 20 (PROD)
qm set <VMID> --net0 virtio,bridge=vmbr1,tag=20

# Assign an LXC to VLAN 10 (MGMT)
pct set <CTID> --net0 name=eth0,bridge=vmbr1,tag=10,ip=10.10.10.x/24,gw=10.10.10.1
```

> **Current state:** No VMs are yet assigned to VLANs on vmbr1. This will be done after pfSense is configured as the inter-VLAN router.

---

## 10. Backup Switch Configuration

### Via Web UI

Navigate to `System → Backup and Restore → Backup`

Click **Backup** — downloads a `.bin` configuration file.

Store this file safely. It contains:
- All VLAN definitions
- PVID settings
- IP configuration
- User credentials

### Restore Procedure

Navigate to `System → Backup and Restore → Restore`

Upload the `.bin` file and click **Restore**. The switch reboots with the saved configuration.

### Manual Config Reference

For disaster recovery without the backup file, recreate using this reference:

```
Switch IP:    10.10.10.2/24
Gateway:      10.10.10.1
802.1Q:       Enabled

VLANs:
  VLAN 1   Default  - Untagged: 1-8
  VLAN 10  MGMT     - Tagged: 1
  VLAN 20  PROD     - Tagged: 1, Untagged: 2-3
  VLAN 30  DEV      - Tagged: 1
  VLAN 40  STORAGE  - Tagged: 1
  VLAN 50  DMZ      - Tagged: 1
  VLAN 90  PENTEST  - Tagged: 1, Untagged: 8

PVIDs:
  Port 1: PVID 1
  Port 2: PVID 20
  Port 3: PVID 20
  Port 4: PVID 1
  Port 5: PVID 1
  Port 6: PVID 1
  Port 7: PVID 1
  Port 8: PVID 90
```

---

## 11. Troubleshooting Reference

### Switch Not Responding to Ping

| Cause | Solution |
|---|---|
| Switch on different subnet | Use Easy Smart Utility — discovers via Layer 2 broadcast |
| Switch on wrong bridge | Check which PCIe port is UP: `ip link show enp1s0fx` |
| Factory reset needed | Hold reset 15 seconds until LEDs flash simultaneously |
| Windows VM on wrong bridge | `qm set <ID> --net0 e1000=<MAC>,bridge=vmbr1` |

### Easy Smart Utility Shows "No Switch Exists"

**Root cause:** Windows VM was on `vmbr0` but switch is on `vmbr1`.

**Fix:** Move VM to the bridge where the switch is physically connected.

```bash
qm stop 199
qm set 199 --net0 e1000=BC:24:11:B9:78:84,bridge=vmbr1,firewall=1
qm start 199
```

### VLAN Traffic Not Passing

Check in order:
1. Port 1 is **Tagged** in all VLANs (it's the trunk)
2. End-device ports have correct **PVID** set
3. `bridge-vlan-aware yes` is set on `vmbr1` in Proxmox
4. VM/LXC network interface has the correct `tag=` set

### Switch IP Changed Unexpectedly

If DHCP was accidentally enabled:

1. Connect via Easy Smart Utility (finds switch regardless of IP)
2. Go to IP Setting → set DHCP to **Disable**
3. Re-enter static IP `10.10.10.2`

---

## 12. Roadmap — Next Steps

### Immediate — pfSense Configuration

pfSense must be configured as the inter-VLAN router and DHCP server. It will run as a VM on Proxmox with:

| Interface | Bridge | VLAN Tag | IP | Role |
|---|---|---|---|---|
| WAN | vmbr0 | none | DHCP from ISP | Internet uplink |
| LAN | vmbr1 | 10 | 10.10.10.1/24 | MGMT gateway |
| OPT1 | vmbr1 | 20 | 10.10.20.1/24 | PROD gateway |
| OPT2 | vmbr1 | 30 | 10.10.30.1/24 | DEV gateway |
| OPT3 | vmbr1 | 40 | 10.10.40.1/24 | STORAGE gateway |
| OPT4 | vmbr1 | 50 | 10.10.50.1/24 | DMZ gateway |
| OPT5 | vmbr1 | 90 | 10.10.90.1/24 | PENTEST gateway (no inter-VLAN) |

### AdGuard Home Migration

After pfSense is running, migrate AdGuard from `192.168.1.100` to `10.10.10.2`:

```bash
pct stop 101
pct set 101 --net0 name=eth0,bridge=vmbr1,tag=10,ip=10.10.10.3/24,gw=10.10.10.1
pct start 101
```

> Note: Switch uses `10.10.10.2`, so AdGuard gets `10.10.10.3`.

### K3s Nodes — Fedora Server Installation

Once pfSense provides DHCP on VLAN 20, install Fedora Server minimal on:
- T440p (port 2) — K3s control-plane
- T430 (port 3) — K3s worker 1

Both will receive IPs in `10.10.20.0/24` automatically.

### Future Port Assignments

| Port | Future Device | VLAN |
|---|---|---|
| 4 | P52 (K3s worker 2) | 20 |
| 5 | Dell 3501 (monitoring/bastion) | 10 |
| 6 | Reserved | — |
| 7 | Reserved | — |

---

## Appendix — Quick Reference Card

### Switch Access

```
URL:      http://10.10.10.2
User:     (see switch label)
Password: (see switch label)
```

### Key IPs

```text
ISP Router:       192.168.1.254
Proxmox (WAN):    192.168.1.65
AdGuard Home:     192.168.1.100 (temp) → 10.10.10.3 (post-pfSense)
Switch MGMT:      10.10.10.2
pfSense LAN:      10.10.10.1 (future)
```

### VLAN Subnets

```text
VLAN 10  MGMT:     10.10.10.0/24  GW: 10.10.10.1
VLAN 20  PROD:     10.10.20.0/24  GW: 10.10.20.1
VLAN 30  DEV:      10.10.30.0/24  GW: 10.10.30.1
VLAN 40  STORAGE:  10.10.40.0/24  GW: 10.10.40.1
VLAN 50  DMZ:      10.10.50.0/24  GW: 10.10.50.1
VLAN 90  PENTEST:  10.10.90.0/24  GW: 10.10.90.1 (no inter-VLAN)
```

### Proxmox Commands

```bash
# Check bridge status
ip link show vmbr1
bridge vlan show

# Assign VM to VLAN 20
qm set <VMID> --net0 virtio,bridge=vmbr1,tag=20

# Assign LXC to VLAN 10
pct set <CTID> --net0 name=eth0,bridge=vmbr1,tag=10,ip=10.10.10.x/24,gw=10.10.10.1

# Verify VLAN-aware bridge
cat /etc/network/interfaces | grep -A8 vmbr1
```

---

*Document generated from live lab session — TL-SG108E v6.0 on Proxmox 9.1.1 / Lenovo M720q*
