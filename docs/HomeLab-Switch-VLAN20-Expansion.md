# Enterprise HomeLab — VLAN 20 Expansion with Unmanaged Switch

**Version:** 1.0
**Date:** May 2026
**Status:** Proposed improvement — pending implementation
**Scope:** TL-SG108 (unmanaged) · TL-SG108E port 7 · VLAN 20 PROD expansion
**Prerequisites:** TL-SG108E 802.1Q configured · pfSense DHCP VLAN 20 active · K3s cluster running

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Architecture — Before and After](#3-architecture--before-and-after)
4. [How Unmanaged Switch VLAN Extension Works](#4-how-unmanaged-switch-vlan-extension-works)
5. [Hardware Required](#5-hardware-required)
6. [Configuration — TL-SG108E Port 7](#6-configuration--tl-sg108e-port-7)
7. [Physical Connection](#7-physical-connection)
8. [Verification](#8-verification)
9. [Capacity and Future Nodes](#9-capacity-and-future-nodes)
10. [Limitations and Considerations](#10-limitations-and-considerations)
11. [Troubleshooting Reference](#11-troubleshooting-reference)

---

## 1. Problem Statement

### Current Switch Port Utilization

The TL-SG108E (managed, 8 ports) is nearly full after connecting all K3s cluster nodes:

| Port | Connected device | VLAN | Status |
|---|---|---|---|
| 1 | M720q trunk (Proxmox) | All VLANs tagged | Occupied |
| 2 | Dell 7490 #1 (control-plane) | VLAN 20 | Occupied |
| 3 | Dell 5480 (worker2) | VLAN 20 | Occupied |
| 4 | Dell 7490 #2 (worker1) | VLAN 20 | Occupied |
| 5 | T440p storage (worker4) | VLAN 20 | Occupied |
| 6 | P52 ML/GPU (worker3) | VLAN 20 | Occupied |
| 7 | — | — | **Available** |
| 8 | Parrot OS (PENTEST) | VLAN 90 | Occupied |

Only **1 free port** remains. Any future K3s worker node, development machine, or VLAN 20 device would have no port to connect to.

### Impact

- Cannot add K3s worker5, worker6, or further expansion nodes
- Cannot connect additional VLAN 20 devices (build machines, CI agents)
- The managed switch is the single point of capacity constraint for cluster growth

---

## 2. Solution Overview

Connect a **TL-SG108 (unmanaged, 8-port)** to port 7 of the TL-SG108E, configured as a VLAN 20 access port.

The unmanaged switch requires **zero configuration** — it acts as a transparent ethernet extension. All devices connected to it inherit VLAN 20 membership from the managed switch's port configuration.

### Key principle

An unmanaged switch does not process 802.1Q tags. When connected to an **access port** (untagged, single VLAN) on the managed switch, it passes frames as-is. Every device plugged into the unmanaged switch becomes a VLAN 20 member automatically.

### Result

```
Before: 1 free port on TL-SG108E (port 7)
After:  1 port used as uplink + 8 new ports = 8 new VLAN 20 slots
```

Expansion capacity: **+7 additional VLAN 20 devices** (one port used as uplink to the managed switch).

---

## 3. Architecture — Before and After

### Before — TL-SG108E only

```
TL-SG108E (managed)
  P1 ── trunk → M720q (Proxmox)
  P2 ── VLAN 20 → Dell 7490 #1 (control-plane)   10.10.20.100
  P3 ── VLAN 20 → Dell 5480 (worker2)             10.10.20.102
  P4 ── VLAN 20 → Dell 7490 #2 (worker1)          10.10.20.101
  P5 ── VLAN 20 → T440p storage (worker4)         10.10.20.104
  P6 ── VLAN 20 → P52 ML/GPU (worker3)            10.10.20.103
  P7 ── (empty — only 1 slot left)
  P8 ── VLAN 90 → Parrot OS (PENTEST)             10.10.90.x
```

### After — TL-SG108E + TL-SG108 (unmanaged)

```
TL-SG108E (managed)
  P1 ── trunk → M720q (Proxmox)
  P2 ── VLAN 20 → Dell 7490 #1 (control-plane)   10.10.20.100
  P3 ── VLAN 20 → Dell 5480 (worker2)             10.10.20.102
  P4 ── VLAN 20 → Dell 7490 #2 (worker1)          10.10.20.101
  P5 ── VLAN 20 → T440p storage (worker4)         10.10.20.104
  P6 ── VLAN 20 → P52 ML/GPU (worker3)            10.10.20.103
  P7 ── VLAN 20 access ──────────────────────────────────┐
  P8 ── VLAN 90 → Parrot OS (PENTEST)             10.10.90.x
                                                         │
                                              TL-SG108 (unmanaged)
                                                P1 ── uplink (from managed P7)
                                                P2 ── worker5 (future)  10.10.20.x
                                                P3 ── worker6 (future)  10.10.20.x
                                                P4 ── worker7 (future)  10.10.20.x
                                                P5 ── dev machine       10.10.20.x
                                                P6 ── CI agent          10.10.20.x
                                                P7 ── (available)
                                                P8 ── (available)
```

---

## 4. How Unmanaged Switch VLAN Extension Works

### The access port pattern

When a managed switch port is configured as an **access port** (PVID = 20, untagged member of VLAN 20, not a member of any other VLAN):

- Frames arriving **from** the managed switch on that port are **already stripped** of their VLAN 20 tag before leaving the port (because the port is untagged).
- Frames arriving **from** devices plugged into the unmanaged switch are plain ethernet frames (no tag).
- The managed switch **accepts** these untagged frames on port 7 and **stamps them** with PVID 20, placing them in VLAN 20.

This is identical to how any end device (a laptop, a server) works on a VLAN access port — the device never sees 802.1Q tags, yet it communicates within the VLAN correctly.

### Traffic flow

```
Device on TL-SG108 (untagged)
      │
      ▼
TL-SG108 port (transparent — passes frame unchanged)
      │
      ▼
TL-SG108E port 7 (ingress: no tag → stamp PVID 20)
      │   VLAN 20
      ▼
vmbr1 trunk → pfSense (VLAN 20 interface)
      │
      ▼
pfSense DHCP assigns 10.10.20.x + DNS 10.10.10.3
```

### What the unmanaged switch does NOT do

- It does NOT process 802.1Q headers
- It does NOT isolate ports from each other
- It does NOT allow devices connected to it to reach other VLANs
- All devices on the unmanaged switch are in the same broadcast domain (VLAN 20)

---

## 5. Hardware Required

| Item | Model | Status |
|---|---|---|
| Managed switch | TP-Link TL-SG108E v6.0 | Already installed |
| Unmanaged switch | TP-Link TL-SG108 (8-port) | Available |
| Patch cable | Cat5e or Cat6 (any length) | Required for uplink |

> **Cable note:** The uplink between the two switches is a standard ethernet patch cable. No crossover cable is needed — modern switches auto-negotiate MDI/MDIX.

---

## 6. Configuration — TL-SG108E Port 7

Only **two changes** are required on the managed switch. No Proxmox, pfSense, or AdGuard changes needed.

### Access the switch

```
http://10.10.10.2
```

Must be accessed from a device on VLAN 10 (MGMT) — e.g. Windows VM 199 at `10.10.10.50`, or any device that reaches `10.10.10.x`.

---

### Step 1 — 802.1Q VLAN: Add port 7 as Untagged member of VLAN 20

Navigate to: `VLAN → 802.1Q VLAN`

1. Enter `20` in the VLAN ID field
2. Enter `PROD` in the VLAN Name field (optional — already exists)
3. Set Port 7 to **Untagged**
4. Leave all other ports unchanged
5. Click **Add/Modify**

| Port | Setting for VLAN 20 |
|---|---|
| Port 1 | Tagged (trunk — no change) |
| Port 2 | Untagged (no change) |
| Port 3 | Untagged (no change) |
| Port 4 | Untagged (no change) |
| Port 5 | Untagged (no change) |
| Port 6 | Untagged (no change) |
| **Port 7** | **Untagged ← change this** |
| Port 8 | Not Member (no change) |

> **Important:** Do not set port 7 as Tagged. Tagged mode would require devices on the unmanaged switch to handle 802.1Q — they cannot. Untagged = access port = correct.

---

### Step 2 — 802.1Q PVID Setting: Set port 7 PVID to 20

Navigate to: `VLAN → 802.1Q PVID Setting`

Change only port 7:

| Port | Current PVID | New PVID |
|---|---|---|
| Port 7 | 1 | **20** |

Click **Apply**.

---

### Verification after configuration

Navigate to: `VLAN → 802.1Q VLAN`

Select VLAN ID 20. Confirm:

```
VLAN 20 — PROD
Member Ports:    1, 2, 3, 4, 5, 6, 7
Tagged Ports:    1
Untagged Ports:  2, 3, 4, 5, 6, 7
```

Navigate to: `VLAN → 802.1Q PVID Setting`

Confirm:
```
Port 7: PVID = 20
```

Configuration complete. No reboot required — changes take effect immediately.

---

## 7. Physical Connection

### Cable the switches

1. Connect one end of a patch cable to **any port** on the TL-SG108 (unmanaged)
2. Connect the other end to **Port 7** of the TL-SG108E (managed)
3. Both switch link LEDs should illuminate green

> **Which port on the TL-SG108?** It does not matter — all ports on an unmanaged switch are equivalent. Conventionally use port 1 as the uplink to keep cabling organized.

### Connect future devices

Plug any VLAN 20 device into ports 2–8 of the TL-SG108. Each device will:

1. Receive a DHCP lease from pfSense VLAN 20 (`10.10.20.100–200`)
2. Get DNS from AdGuard (`10.10.10.3`)
3. Be routable to other VLANs per pfSense firewall rules
4. Appear in the K3s cluster (if configured as a worker node)

---

## 8. Verification

### From a newly connected device

```bash
# Verify IP is in VLAN 20 range
ip addr show
# Expected: 10.10.20.x/24

# Verify gateway
ip route | grep default
# Expected: default via 10.10.20.1

# Verify DNS (AdGuard)
cat /etc/resolv.conf
# Expected: nameserver 10.10.10.3

# Ping gateway
ping -c 3 10.10.20.1

# Ping AdGuard
ping -c 3 10.10.10.3

# DNS resolution
nslookup google.com 10.10.10.3
nslookup k3s.mgmt
```

### From Proxmox shell

```bash
# Verify the switch port is working
# New device should appear in DHCP leases
# pfSense: Status → DHCP Leases → filter 10.10.20.x

# From Proxmox, ping a new device
ping -c 3 10.10.20.105   # expected new node IP
```

### From K3s control-plane (after joining worker)

```bash
# New node should appear
kubectl get nodes -o wide
# NAME             STATUS   INTERNAL-IP
# dell-7490-1      Ready    10.10.20.100
# dell-7490-2      Ready    10.10.20.101
# dell-5480        Ready    10.10.20.102
# p52              Ready    10.10.20.103
# t440p-storage    Ready    10.10.20.104
# worker5          Ready    10.10.20.105   ← new node via TL-SG108
```

---

## 9. Capacity and Future Nodes

### Available expansion slots

| Slot | Location | Capacity | Notes |
|---|---|---|---|
| TL-SG108 P2–P8 | Unmanaged switch | 7 devices | VLAN 20, DHCP auto |
| TL-SG108E P7 | Used as uplink | — | Dedicated to TL-SG108 uplink |

### Future K3s workers — recommended IPs

| Node | Hostname | IP | Switch |
|---|---|---|---|
| K3s worker5 | `worker5` | 10.10.20.105 | TL-SG108 P2 |
| K3s worker6 | `worker6` | 10.10.20.106 | TL-SG108 P3 |
| CI agent | `ci-agent-1` | 10.10.20.107 | TL-SG108 P4 |
| Dev machine | `dev-1` | 10.10.20.108 | TL-SG108 P5 |

Set DHCP static reservations in pfSense after identifying MAC addresses:

```
Services → DHCP Server → VLAN20 → Static Mappings → Add
```

### Further expansion

If the TL-SG108 (8 ports) also fills up, the same pattern can be chained:

```
TL-SG108E P7 → TL-SG108 #1 → TL-SG108 #2 (via uplink port)
```

> **Chaining limit:** Each unmanaged switch adds ~1–2ms latency. Up to 3 hops from the managed switch is safe for Gigabit ethernet in a lab environment. Beyond that, consider a second managed switch with a tagged uplink.

---

## 10. Limitations and Considerations

### What this expansion does NOT provide

| Capability | Available? | Notes |
|---|---|---|
| VLAN isolation between TL-SG108 ports | ❌ No | All ports share VLAN 20 broadcast domain |
| Different VLANs on different TL-SG108 ports | ❌ No | All ports inherit VLAN 20 from uplink |
| Port monitoring / SNMP | ❌ No | Unmanaged — no visibility |
| Spanning Tree Protocol | ❌ No | Do not create loops |
| Link aggregation / LACP | ❌ No | Single uplink only |

### Broadcast domain

All 7 devices on the TL-SG108 share the same VLAN 20 broadcast domain as the devices on the TL-SG108E. Broadcast traffic (ARP, DHCP discover) reaches all 12 VLAN 20 ports. This is acceptable for a lab cluster of this size — broadcast overhead becomes a concern only above ~200 devices in the same VLAN.

### Loop prevention

**Never connect two ports of the TL-SG108 to the TL-SG108E** — this creates an ethernet loop. Without STP, it will saturate the network. One uplink cable only.

### Bandwidth

The single uplink between the two switches is **1Gbps**. All 7 downstream ports share this bandwidth. For K3s cluster traffic (Longhorn replication, pod scheduling), 1Gbps shared is sufficient for a lab environment. If Longhorn replication on worker5+ becomes a bottleneck, consider the dedicated storage network approach (second NIC per node on a separate unmanaged switch).

### pfSense DHCP range

Current VLAN 20 DHCP range: `10.10.20.100 – 10.10.20.200`. This supports up to 101 dynamic leases — well above the 7 new expansion slots. No pfSense changes required.

---

## 11. Troubleshooting Reference

### Device on TL-SG108 gets 169.254.x.x (APIPA)

**Cause:** DHCP not reaching the device.

**Check:**
```bash
# On TL-SG108E — verify port 7 PVID
# http://10.10.10.2 → VLAN → 802.1Q PVID Setting
# Port 7 must show PVID = 20

# Verify VLAN 20 membership
# VLAN → 802.1Q VLAN → VLAN ID 20
# Port 7 must appear as Untagged
```

---

### Device on TL-SG108 gets 10.10.10.x instead of 10.10.20.x

**Cause:** Port 7 PVID is still 1 (MGMT), not 20 (PROD).

**Fix:** Return to `VLAN → 802.1Q PVID Setting`, set Port 7 = 20, click Apply.

---

### Device on TL-SG108 cannot reach other VLANs

**Cause:** pfSense firewall rule may be blocking the traffic.

```bash
# Verify pfSense firewall rules allow VLAN 20 → destination VLAN
# pfSense: Firewall → Rules → VLAN20
# Check DEV→PROD and PROD→STORAGE rules are present
```

---

### No link light on TL-SG108E port 7 after connecting the cable

**Cause:** Cable fault or port issue.

**Fix:**
1. Try a different cable
2. Try a different port on the TL-SG108
3. Verify the TL-SG108 is powered (link lights on its side)

---

### K3s node on TL-SG108 joins but shows NotReady

This is a K3s/Cilium issue, not a switch issue. Follow the K3s troubleshooting section in `troubleshooting.md`.

---

## Appendix — Quick Reference

### Switch port summary (after implementation)

| Switch | Port | Device | VLAN | IP |
|---|---|---|---|---|
| TL-SG108E | 1 | M720q trunk | All (tagged) | — |
| TL-SG108E | 2 | Dell 7490 #1 | VLAN 20 | 10.10.20.100 |
| TL-SG108E | 3 | Dell 5480 | VLAN 20 | 10.10.20.102 |
| TL-SG108E | 4 | Dell 7490 #2 | VLAN 20 | 10.10.20.101 |
| TL-SG108E | 5 | T440p storage | VLAN 20 | 10.10.20.104 |
| TL-SG108E | 6 | P52 ML/GPU | VLAN 20 | 10.10.20.103 |
| TL-SG108E | 7 | **TL-SG108 uplink** | VLAN 20 | — |
| TL-SG108E | 8 | Parrot OS | VLAN 90 | 10.10.90.x |
| TL-SG108 | 1 | Uplink to TL-SG108E | VLAN 20 | — |
| TL-SG108 | 2–8 | Future devices | VLAN 20 | 10.10.20.105+ |

### Configuration steps summary

```
1. http://10.10.10.2
2. VLAN → 802.1Q VLAN → VLAN ID 20 → Port 7: Untagged → Add/Modify
3. VLAN → 802.1Q PVID Setting → Port 7: PVID = 20 → Apply
4. Connect TL-SG108 to Port 7 with a patch cable
5. Verify: new devices get 10.10.20.x from DHCP
```

### No changes required in

- Proxmox `/etc/network/interfaces`
- pfSense DHCP Server (range already covers new IPs)
- pfSense Firewall rules
- AdGuard Home DNS
- K3s cluster configuration

---

*Document v1.0 — Proposed improvement · TL-SG108 VLAN 20 expansion · May 2026*
