# Enterprise HomeLab — Proxmox VE VLAN Persistence Manual

**Version:** 1.0
**Date:** May 2026
**Scope:** Proxmox VE · Linux Bridge · 802.1Q VLAN Persistence · `/etc/network/interfaces`
**Environment:** Lenovo M720q · Proxmox VE 9.1.1 · Kernel 6.17.2-1-pve · Intel I350-T4 NIC

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture — Bridge & VLAN Design](#2-architecture--bridge--vlan-design)
3. [How Proxmox VLAN Persistence Works](#3-how-proxmox-vlan-persistence-works)
4. [Current Configuration (Verified)](#4-current-configuration-verified)
5. [Configuration File Reference](#5-configuration-file-reference)
6. [VM & LXC VLAN Assignment](#6-vm--lxc-vlan-assignment)
7. [Verification Procedures](#7-verification-procedures)
8. [Making Changes Safely](#8-making-changes-safely)
9. [Troubleshooting](#9-troubleshooting)
10. [Roadmap — Pending Items](#10-roadmap--pending-items)

---

## 1. Overview

### Problem

By default, VLAN memberships configured via the Proxmox web UI or `bridge vlan add` commands are **not persisted across reboots**. After a reboot, the kernel bridge loses its VLAN table and VM/LXC network connectivity breaks.

### Solution

Proxmox VE manages bridge configuration through `/etc/network/interfaces`. Adding `bridge-vlan-aware yes` and `bridge-vids 2-4094` to the bridge definition makes all VLAN configurations **survive reboots** without additional tooling.

### Status in This Lab

```
✅ vmbr1 — VLAN-aware trunk bridge — PERSISTENT
   bridge-vlan-aware yes
   bridge-vids 2-4094
   Verified: VLANs 10, 20, 30, 40, 50, 90 active post-reboot
```

---

## 2. Architecture — Bridge & VLAN Design

### Physical NIC Layout

| NIC | Physical Port | Bridge | Role |
|---|---|---|---|
| `nic0` (onboard) | Intel I219 | `vmbr0` | WAN / ISP (untagged) |
| `enp1s0f0` (I350-T4 port 1) | PCIe NIC p1 | `vmbr1` | LAN trunk 802.1Q → TL-SG108E |
| `enp1s0f1` (I350-T4 port 2) | PCIe NIC p2 | `vmbr2` | VPN uplink (reserved) |
| `enp1s0f2` (I350-T4 port 3) | PCIe NIC p3 | `vmbr3` | OPT2 (reserved) |
| `enp1s0f3` (I350-T4 port 4) | PCIe NIC p4 | `vmbr4` | Storage / backup segment |

### Bridge Roles

| Bridge | Mode | VLAN-aware | Purpose |
|---|---|---|---|
| `vmbr0` | Static IP `192.168.1.65/24` | No | WAN/ISP — pfSense WAN, AdGuard eth1 |
| `vmbr1` | Manual (no IP) | **Yes** | LAN trunk — pfSense LAN, all VLANs |
| `vmbr2` | Manual | No | Reserved — VPN uplink |
| `vmbr3` | Manual | No | Reserved — OPT2 |
| `vmbr4` | Manual | No | Storage / backup segment |

### VLAN Structure on vmbr1

| VLAN ID | Name | Subnet | Gateway | Usage |
|---|---|---|---|---|
| 10 | MGMT | 10.10.10.0/24 | 10.10.10.1 | Proxmox mgmt, AdGuard, pfSense LAN, switch |
| 20 | PROD | 10.10.20.0/24 | 10.10.20.1 | K3s cluster nodes |
| 30 | DEV | 10.10.30.0/24 | 10.10.30.1 | Build servers, staging |
| 40 | STORAGE | 10.10.40.0/24 | 10.10.40.1 | Longhorn replication |
| 50 | DMZ | 10.10.50.0/24 | 10.10.50.1 | Ingress / exposed services |
| 90 | PENTEST | 10.10.90.0/24 | 10.10.90.1 | Parrot OS — fully isolated |

---

## 3. How Proxmox VLAN Persistence Works

### The Linux Bridge VLAN Model

Proxmox uses the Linux kernel bridge subsystem. In VLAN-aware mode, the bridge itself acts as an 802.1Q trunk — every port (physical NIC, VM tap, LXC veth) has its own VLAN membership table.

```
                    vmbr1 (VLAN-aware bridge)
                          │
          ┌───────────────┼───────────────┐
          │               │               │
      enp1s0f0        tap100i1        veth101i0
   (trunk to switch)  (pfSense LAN)  (AdGuard eth0)
   VLANs 1-4094       VLAN trunk      VLAN 10
```

### Key Configuration Parameters

| Parameter | Value | Effect |
|---|---|---|
| `bridge-vlan-aware yes` | Enables 802.1Q mode on the bridge | Without this, all VLAN tags are stripped |
| `bridge-vids 2-4094` | Pre-registers VLANs 2–4094 on the bridge port | Bridge accepts any tagged frame in this range |
| `tag=N` on VM/LXC net | Assigns VLAN N to the VM's port | Frames are tagged/untagged at the bridge port |

### Why `bridge-vids 2-4094`

Setting a wide range (`2-4094`) on `enp1s0f0` means the trunk port accepts any VLAN tag coming from the TL-SG108E switch. Individual VMs and LXCs are still restricted to their own `tag=N` — the wide range only applies to the physical uplink.

This avoids having to enumerate VLANs in the bridge config. New VLANs added to the switch and pfSense work immediately without touching `/etc/network/interfaces`.

### What Persists vs What Doesn't

| Configuration | Persists across reboot? | Where stored |
|---|---|---|
| Bridge definition (`vmbr1`) | ✅ Yes | `/etc/network/interfaces` |
| `bridge-vlan-aware` flag | ✅ Yes | `/etc/network/interfaces` |
| `bridge-vids` range | ✅ Yes | `/etc/network/interfaces` |
| VM NIC VLAN tag (`tag=10`) | ✅ Yes | `/etc/pve/qemu-server/VMID.conf` |
| LXC NIC VLAN tag (`tag=10`) | ✅ Yes | `/etc/pve/lxc/CTID.conf` |
| Manual `bridge vlan add` commands | ❌ No | Kernel only — lost on reboot |

> **Key insight:** Never use `bridge vlan add` in the CLI to configure VLANs. Always go through `/etc/network/interfaces` (for the bridge) or VM/LXC config files (for individual ports).

---

## 4. Current Configuration (Verified)

### `/etc/network/interfaces` — Actual File

```
# network interface settings; autogenerated
# Please do NOT modify this file directly, unless you know what
# you're doing.
#
# If you want to manage parts of the network configuration manually,
# please utilize the 'source' or 'source-directory' directives to do
# so.
# PVE will preserve these directives, but will NOT read its network
# configuration from sourced files, so do not attempt to move any of
# the PVE managed interfaces into external files!

auto lo
iface lo inet loopback

iface nic0 inet manual
iface enp1s0f0 inet manual
iface enp1s0f1 inet manual
iface enp1s0f2 inet manual
iface enp1s0f3 inet manual

auto vmbr0
iface vmbr0 inet static
        address 192.168.1.65/24
        gateway 192.168.1.254
        bridge-ports nic0
        bridge-stp off
        bridge-fd 0

auto vmbr1
iface vmbr1 inet manual
        bridge-ports enp1s0f0
        bridge-stp off
        bridge-fd 0
        bridge-vlan-aware yes
        bridge-vids 2-4094
#LAN trunk 802.1Q → TL-SG108E

auto vmbr2
iface vmbr2 inet manual
        bridge-ports enp1s0f1
        bridge-stp off
        bridge-fd 0
#VPN uplink

auto vmbr3
iface vmbr3 inet manual
        bridge-ports enp1s0f2
        bridge-stp off
        bridge-fd 0
#OPT2 — reserved

auto vmbr4
iface vmbr4 inet manual
        bridge-ports enp1s0f3
        bridge-stp off
        bridge-fd 0
#Storage / backup segment

source /etc/network/interfaces.d/*
```

### Active VM/LXC VLAN Assignments (Verified)

```
VM 100  — pfSense CE 2.7.2
  net0: virtio, bridge=vmbr0, firewall=1          ← WAN (untagged, Telmex)
  net1: virtio, bridge=vmbr1, firewall=0           ← LAN trunk (all VLANs, no tag — pfSense handles 802.1Q internally)

VM 199  — Windows Desktop (management)
  net0: e1000, bridge=vmbr1, tag=10, firewall=0   ← VLAN 10 MGMT (10.10.10.50)

LXC 101 — AdGuard Home (Alpine 3.22)
  eth0: bridge=vmbr1, tag=10, ip=10.10.10.3/24    ← VLAN 10 MGMT
  eth1: bridge=vmbr0, ip=192.168.1.100/24          ← Telmex LAN (dual-homed)
```

### Bridge VLAN Table (Verified)

```bash
bridge vlan show | grep -E "^(enp1s0f0|vmbr1|tap|veth)" | grep -v "^\s"
```

Output:
```
enp1s0f0     1 PVID Egress Untagged   ← physical trunk port (accepts all VLANs 2-4094)
vmbr1        1 PVID Egress Untagged   ← bridge itself
tap100i0     1 PVID Egress Untagged   ← pfSense WAN (vmbr0)
tap100i1     1 Egress Untagged        ← pfSense LAN (trunk — no tag, pfSense tags internally)
tap199i0    10 PVID Egress Untagged   ← Windows VM VLAN 10 ✅
veth101i0   10 PVID Egress Untagged   ← AdGuard eth0 VLAN 10 ✅
veth101i1    1 PVID Egress Untagged   ← AdGuard eth1 (vmbr0, Telmex)
```

---

## 5. Configuration File Reference

### How to Edit Safely

> ⚠️ The Proxmox web UI will overwrite `/etc/network/interfaces` when you apply network changes through the UI. Always make changes through the UI when possible, and use the CLI only for parameters the UI doesn't expose (like comments).

**Preferred method — Proxmox Web UI:**

```
Datacenter → proxmox → System → Network → Edit
```

The UI exposes `VLAN aware` checkbox and `VLAN IDs` field, which map to `bridge-vlan-aware` and `bridge-vids`.

**CLI method — when UI is insufficient:**

```bash
# 1. Make a backup first
cp /etc/network/interfaces /etc/network/interfaces.bak-$(date +%Y%m%d)

# 2. Edit
nano /etc/network/interfaces

# 3. Apply without rebooting
ifreload -a

# 4. Verify
ip link show vmbr1
bridge vlan show | grep enp1s0f0 | head -5
```

### Adding a New VLAN (Future Reference)

Since `bridge-vids 2-4094` is already set, **no changes to `/etc/network/interfaces` are needed** when adding new VLANs. The only steps are:

1. Add the VLAN to the TL-SG108E switch (see Switch & VLANs manual)
2. Add the VLAN interface to pfSense (see pfSense manual)
3. Assign `tag=N` to any VM/LXC that needs to be in that VLAN

### Adding `bridge-vids` for Specific VLANs Only (Alternative)

If you prefer to enumerate VLANs explicitly instead of allowing all:

```
bridge-vids 10 20 30 40 50 90
```

This is more restrictive but requires updating the file every time a new VLAN is added. The `2-4094` range is preferred for a lab environment.

---

## 6. VM & LXC VLAN Assignment

### Assigning a VLAN to a VM

**Via Proxmox UI:**
```
VM → Hardware → Network Device → Edit → VLAN Tag: 10
```

**Via CLI:**
```bash
# Stop the VM first
qm stop VMID

# Set VLAN tag
qm set VMID --net0 virtio,bridge=vmbr1,tag=10,firewall=0

# Start
qm start VMID
```

### Assigning a VLAN to an LXC Container

**Via Proxmox UI:**
```
Container → Network → Edit → VLAN Tag: 10
```

**Via CLI:**
```bash
# Stop the container
pct stop CTID

# Set VLAN tag on eth0
pct set CTID --net0 name=eth0,bridge=vmbr1,tag=10,ip=10.10.10.X/24,gw=10.10.10.1

# Start
pct start CTID
```

### VLAN Tag Behavior at the Bridge Port

| Tag config | Frame direction | What happens |
|---|---|---|
| `tag=10` on VM port | VM → bridge | Bridge adds VLAN 10 tag to outgoing frames |
| `tag=10` on VM port | Bridge → VM | Bridge strips VLAN 10 tag before delivering to VM |
| No tag (pfSense trunk) | Both | Frames pass through with original 802.1Q tags intact |

> pfSense (VM 100 net1) has **no VLAN tag** on its bridge port. This is intentional — pfSense receives all tagged frames and handles 802.1Q internally via sub-interfaces (vtnet1.10, vtnet1.20, etc.).

### NIC Type Considerations

| NIC Type | Driver | Notes |
|---|---|---|
| `virtio` | VirtIO paravirtual | Best performance — requires VirtIO drivers in guest |
| `e1000` | Intel PRO/1000 emulation | Works without drivers — used for Windows guests without VirtIO installed |
| `vmxnet3` | VMware-compatible | Not recommended for Proxmox |

> Windows VM (199) uses `e1000` because VirtIO drivers are not installed. Migrating to `virtio` after installing VirtIO drivers will improve throughput significantly.

---

## 7. Verification Procedures

### 7.1 Verify Bridge is VLAN-aware

```bash
# Should show "vlan_filtering 1"
ip -d link show vmbr1 | grep vlan_filtering
# Expected: vlan_filtering 1

# Alternative
cat /sys/class/net/vmbr1/bridge/vlan_filtering
# Expected: 1
```

### 7.2 Verify Physical Port Accepts All VLANs

```bash
bridge vlan show dev enp1s0f0 | head -10
# Expected: shows VLAN 1 as PVID and 2-4094 range
```

### 7.3 Verify VM/LXC Port VLAN Assignment

```bash
# Show VLAN for all active tap/veth interfaces
bridge vlan show | grep -E "^(tap|veth)" | grep -v "^\s"
```

Expected:
```
tap100i1    1 Egress Untagged     ← pfSense LAN (trunk)
tap199i0   10 PVID Egress Untagged  ← Windows VM VLAN 10
veth101i0  10 PVID Egress Untagged  ← AdGuard eth0 VLAN 10
veth101i1   1 PVID Egress Untagged  ← AdGuard eth1 (vmbr0)
```

### 7.4 Verify VM/LXC Config Files

```bash
# pfSense
qm config 100 | grep net

# Windows VM
qm config 199 | grep net

# AdGuard LXC
pct config 101 | grep net
```

### 7.5 Verify Persistence After Reboot

```bash
# Reboot Proxmox
reboot

# After boot — re-verify
bridge vlan show | grep -E "^(tap|veth)" | grep -v "^\s"
ip -d link show vmbr1 | grep vlan_filtering

# Verify VMs are running
qm status 100
qm status 199
pct status 101
```

### 7.6 End-to-End Connectivity Test

```bash
# From Proxmox shell — ping AdGuard on VLAN 10
ping -c 3 10.10.10.3

# From Proxmox shell — ping pfSense LAN
ping -c 3 10.10.10.1

# DNS resolution via AdGuard
nslookup google.com 10.10.10.3
nslookup proxmox.mgmt 10.10.10.3
```

---

## 8. Making Changes Safely

### Before Any Network Change

```bash
# 1. Snapshot all running VMs and containers
pct snapshot 101 pre-netchange-$(date +%Y%m%d) --description "Pre network change"
# (repeat for each VM/LXC)

# 2. Backup network config
cp /etc/network/interfaces /root/interfaces.bak-$(date +%Y%m%d-%H%M)

# 3. Verify current state
ip addr
bridge vlan show | grep -E "^(tap|veth)" | grep -v "^\s"
```

### Applying Changes Without Reboot

```bash
# After editing /etc/network/interfaces
ifreload -a

# Verify the bridge came back correctly
ip link show vmbr1
bridge vlan show dev enp1s0f0 | head -5
```

### Rolling Back

```bash
# Restore from backup
cp /root/interfaces.bak-YYYYMMDD-HHMM /etc/network/interfaces
ifreload -a
```

### When a Full Reboot is Required

Changes to `bridge-vlan-aware` on a bridge with active VMs require a reboot. Plan accordingly:

```bash
# Gracefully stop all VMs/containers before reboot
qm shutdown 100
qm shutdown 199
pct stop 101

# Reboot
reboot

# After boot — start services in order
pct start 101     # AdGuard first (DNS)
qm start 100      # pfSense second (routing)
qm start 199      # Windows VM last
```

---

## 9. Troubleshooting

### VM has no network after reboot

```bash
# Check if bridge is VLAN-aware
cat /sys/class/net/vmbr1/bridge/vlan_filtering
# If 0: bridge-vlan-aware not applied — check /etc/network/interfaces and run ifreload -a

# Check VM VLAN tag
qm config VMID | grep net
# Verify tag= is correct

# Check if tap interface has correct VLAN
bridge vlan show | grep tapVMID
```

### VLAN tag stripped — VM receives untagged traffic

```bash
# Verify bridge port shows PVID = correct VLAN
bridge vlan show | grep tapVMID
# Should show: tapXXXiY   10 PVID Egress Untagged
# If missing — VM was started before bridge was VLAN-aware, restart the VM
qm stop VMID && qm start VMID
```

### pfSense doesn't see VLANs after reboot

pfSense (VM 100, net1) has no `tag=` on its bridge port — this is correct. pfSense handles 802.1Q internally. If VLANs are missing in pfSense after reboot:

```bash
# Verify tap100i1 is on the VLAN-aware bridge
bridge vlan show | grep tap100i1
# Should show: tap100i1   1 Egress Untagged (trunk port — no PVID restriction)

# If pfSense sub-interfaces are missing, restart pfSense VM
qm stop 100 && qm start 100
```

### `ifreload -a` fails

```bash
# Check syntax errors in the interfaces file
ifup --no-act -a 2>&1 | head -20

# Common causes:
# - Missing blank line between stanzas
# - Indentation error (must use spaces, not tabs... actually tabs work, be consistent)
# - Duplicate interface definition
```

### Bridge VLAN table empty after `ifreload -a`

```bash
# ifreload may not re-trigger bridge-vids on a live bridge
# Force it manually
bridge vlan add vid 2-4094 dev enp1s0f0

# Then verify
bridge vlan show dev enp1s0f0 | wc -l
# Should show 4094+ lines

# Note: this is temporary — survives until next reboot
# Permanent fix: ensure bridge-vids 2-4094 is in /etc/network/interfaces
```

---

## 10. Roadmap — Pending Items

### 10.1 Assign VLANs to K3s Nodes When Connected

When T440p (master) and T430 (worker1) are connected to the switch:

```bash
# No changes needed to /etc/network/interfaces
# The switch ports are already configured: P2 → VLAN 20, P3 → VLAN 20
# Nodes will receive DHCP from pfSense VLAN 20 (10.10.20.100–200) automatically
```

### 10.2 Add P52 as Worker Node 2

```bash
# Connect P52 to an available switch port (P4–P7)
# Configure that port on TL-SG108E: PVID=20, untagged VLAN 20
# P52 will receive IP from pfSense DHCP VLAN 20
```

### 10.3 Future — Upgrade Windows VM NIC to VirtIO

```bash
# Step 1: Mount VirtIO ISO in VM 199
qm set 199 --ide2 local:iso/virtio-win.iso,media=cdrom

# Step 2: Boot VM, install VirtIO drivers from ISO

# Step 3: Change NIC to virtio
qm stop 199
qm set 199 --net0 virtio,bridge=vmbr1,tag=10,firewall=0
qm start 199
```

### 10.4 Future — VLAN 40 Storage Isolation

When K3s Longhorn is deployed, nodes will need an additional interface in VLAN 40 for storage replication traffic:

```bash
# Add a second NIC to each K3s node VM/bare-metal
# VLAN 40 — dedicated storage traffic, no internet access
# Longhorn will use 10.10.40.x addresses for replication
```

---

## Appendix A — Quick Reference

### Key Commands

```bash
# Verify VLAN-aware mode
cat /sys/class/net/vmbr1/bridge/vlan_filtering

# Show active port VLANs
bridge vlan show | grep -E "^(tap|veth)" | grep -v "^\s"

# Show physical port VLANs
bridge vlan show dev enp1s0f0 | head -10

# Apply network config without reboot
ifreload -a

# Backup network config
cp /etc/network/interfaces /root/interfaces.bak-$(date +%Y%m%d-%H%M)
```

### VM/LXC Network Config Commands

```bash
# View network config
qm config VMID | grep net
pct config CTID | grep net

# Set VLAN tag on VM
qm set VMID --net0 virtio,bridge=vmbr1,tag=VLAN_ID,firewall=0

# Set VLAN tag on LXC
pct set CTID --net0 name=eth0,bridge=vmbr1,tag=VLAN_ID,ip=10.10.VLAN.X/24,gw=10.10.VLAN.1
```

### Startup Order

```
1. Proxmox VE boots → vmbr0 + vmbr1 come up automatically (auto in /etc/network/interfaces)
2. LXC 101 (AdGuard) → starts automatically (onboot=1)
3. VM 100 (pfSense)  → starts automatically (onboot=1 if configured)
4. VM 199 (Windows)  → manual or onboot as needed
```

### File Locations

| File | Purpose |
|---|---|
| `/etc/network/interfaces` | Bridge definitions — VLAN persistence |
| `/etc/pve/qemu-server/100.conf` | pfSense VM config (net0/net1) |
| `/etc/pve/qemu-server/199.conf` | Windows VM config (net0 tag=10) |
| `/etc/pve/lxc/101.conf` | AdGuard LXC config (eth0 tag=10, eth1) |

---

## Appendix B — Troubleshooting Reference

| Symptom | Cause | Fix |
|---|---|---|
| VM loses network after reboot | `bridge-vlan-aware` not in interfaces file | Add to `/etc/network/interfaces`, run `ifreload -a` |
| VLAN table empty after reboot | `bridge-vids` missing from interfaces file | Add `bridge-vids 2-4094` to `vmbr1` stanza |
| pfSense VLANs missing | pfSense VM restarted before bridge was ready | Restart pfSense VM after bridge is up |
| VM can ping gateway but not other VLANs | VLAN tag mismatch between VM and switch | Verify `tag=N` matches switch PVID for that port |
| `ifreload -a` breaks connectivity | Syntax error in interfaces file | Restore backup, fix syntax, retry |
| `bridge vlan filtering` shows 0 | `bridge-vlan-aware yes` not applied | Check file, apply with `ifreload -a` or reboot |
| LXC loses VLAN 10 after container restart | Container config missing `tag=10` | `pct set CTID --net0 ...,tag=10,...` |
| New VLAN not working on existing port | `bridge-vids` range too narrow | Expand to `2-4094` or add specific VLAN ID |

---

*Document v1.0 — Generated from live lab session · Proxmox VE 9.1.1 · Lenovo M720q · May 2026*
