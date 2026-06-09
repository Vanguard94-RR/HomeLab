# HomeLab — K3s Cluster Switch Migration Plan

**Version:** 1.1
**Date:** June 2026
**Scope:** TL-SG108E · TL-SG108 (unmanaged) · K3s cluster VLAN 20 migration
**Status:** ⚠️ REQUIERE REVISIÓN — Puerto 7 ahora ocupado por T430 (monitoring server)

---

## ⚠️ Estado actual vs. plan original (Junio 2026)

El plan original (v1.0, Mayo 2026) asumía que el puerto 7 del TL-SG108E estaría libre para el uplink al TL-SG108 unmanaged. **Esto ya no es válido.**

### Cambio de Junio 2026

El T430 fue desplegado como servidor de monitoreo dedicado (Prometheus + Grafana + Loki + Tempo + Alertmanager) y conectado al **puerto 7** del TL-SG108E con PVID 10 (VLAN 10 MGMT).

### Estado actual de puertos TL-SG108E

```
Port 1  │ Trunk      │ M720q (vmbr1) — tagged all VLANs
Port 2  │ VLAN 20    │ Dell 7490 #1 — K3s control-plane   10.10.20.100
Port 3  │ VLAN 20    │ Dell 5480    — K3s worker2         10.10.20.102
Port 4  │ VLAN 20    │ Dell 7490 #2 — K3s worker1         10.10.20.101
Port 5  │ VLAN 20    │ T440p        — K3s worker4 storage 10.10.20.104
Port 6  │ VLAN 20    │ P52          — K3s worker3 ML/GPU  10.10.20.103
Port 7  │ VLAN 10    │ T430 monitoring — 10.10.10.10      ← OCUPADO
Port 8  │ VLAN 90    │ Parrot OS    — PENTEST
```

**Todos los 8 puertos están en uso.** No hay puertos libres para el uplink al TL-SG108 unmanaged con la arquitectura actual.

---

## Opciones para implementar la expansión

### Opción A — Switch de 16 puertos (RECOMENDADA)

Reemplazar el TL-SG108E (8 puertos) por un switch managed de 16 puertos (ej. TL-SG116E). Esto da capacidad para:
- 5 nodos K3s (puertos 2-6) ← sin cambios
- 1 monitoring server T430 (puerto 7) ← sin cambios
- 1 Parrot OS (puerto 8) ← sin cambios
- **8 puertos libres** para expansión futura

Costo estimado: ~$40-60 USD

### Opción B — TL-SG108 unmanaged con uplink desde P52

Si P52 tiene dos interfaces de red (thunderbolt dock + integrada), una puede actuar como uplink al switch unmanaged. Requiere NIC adicional o dock con Ethernet. Bajo prioridad.

### Opción C — Sin cambio (mantener topología actual)

Con 5 nodos K3s en puertos 2-6 del TL-SG108E, el cluster tiene capacidad suficiente para el roadmap actual. La expansión con TL-SG108 es una mejora de capacidad, no un bloqueante.

**Recomendación actual:** Opción C hasta que el cluster K3s esté instalado y funcionando. Evaluar Opción A si se agregan más máquinas al lab.

---

---

## 1. Overview

Currently all 5 K3s cluster nodes (VLAN 20 PROD) are connected directly to the managed TL-SG108E, consuming 5 of 8 ports. Moving the entire K3s cluster to a dedicated unmanaged TL-SG108 frees those 5 ports on the managed switch for future VLANs and devices, while simplifying the cluster's network topology.

### Key insight — intra-cluster traffic

When all K3s nodes share the same unmanaged switch, **pod-to-pod and Longhorn replication traffic stays local** on the TL-SG108. It never traverses the managed switch uplink. Only external traffic (internet, other VLANs, Proxmox API) uses the uplink. This is a performance benefit for the cluster.

```
[Before] K3s inter-node → TL-SG108E → TL-SG108E  (same switch, but managed overhead)
[After]  K3s inter-node → TL-SG108               (direct, unmanaged, line rate)
          K3s → internet → TL-SG108 → uplink → TL-SG108E → pfSense → WAN
```

---

## 2. Current Architecture

### TL-SG108E Port Layout (current)

```
Port 1  │ Trunk      │ M720q (vmbr1) — tagged all VLANs
Port 2  │ VLAN 20    │ Dell 7490 #1 — K3s control-plane
Port 3  │ VLAN 20    │ Dell 5480    — K3s worker2
Port 4  │ VLAN 20    │ Dell 7490 #2 — K3s worker1
Port 5  │ VLAN 20    │ T440p        — K3s worker4 storage
Port 6  │ VLAN 20    │ P52          — K3s worker3 ML/GPU
Port 7  │ libre      │ —
Port 8  │ VLAN 90    │ Parrot OS    — PENTEST
```

**Problem:** 7 of 8 ports used. Only 1 port free. No room for:
- DEV machines (VLAN 30)
- STORAGE dedicated interfaces (VLAN 40)
- Additional MGMT devices (VLAN 10)
- DMZ servers (VLAN 50)
- Additional PENTEST nodes (VLAN 90)

---

## 3. Proposed Architecture

### TL-SG108E Port Layout (proposed)

```
Port 1  │ Trunk      │ M720q (vmbr1) — tagged all VLANs     [unchanged]
Port 2  │ libre      │ — freed from Dell 7490 #1
Port 3  │ libre      │ — freed from Dell 5480
Port 4  │ libre      │ — freed from Dell 7490 #2
Port 5  │ libre      │ — freed from T440p
Port 6  │ libre      │ — freed from P52
Port 7  │ VLAN 20    │ Uplink → TL-SG108 (unmanaged cluster switch)
Port 8  │ VLAN 90    │ Parrot OS — PENTEST                   [unchanged]
```

**Result:** 5 ports freed for future use (ports 2–6).

### TL-SG108 (unmanaged) Port Layout

```
Port 1  │ Uplink     │ → TL-SG108E port 7 (VLAN 20 untagged)
Port 2  │ VLAN 20    │ Dell 7490 #1 — K3s control-plane   10.10.20.100
Port 3  │ VLAN 20    │ Dell 7490 #2 — K3s worker1         10.10.20.101
Port 4  │ VLAN 20    │ Dell 5480    — K3s worker2         10.10.20.102
Port 5  │ VLAN 20    │ P52          — K3s worker3 ML/GPU  10.10.20.103
Port 6  │ VLAN 20    │ T440p        — K3s worker4 storage 10.10.20.104
Port 7  │ libre      │ — future worker5
Port 8  │ libre      │ — future worker6
```

**Result:** 2 ports available for K3s cluster expansion (worker5, worker6).

### Full Network Diagram

```
Internet (Telmex Infinitum)
         │
   Nokia GPON — 192.168.1.254
         │
   M720q Proxmox — 192.168.1.65
   vmbr0 (WAN) / vmbr1 (LAN trunk)
         │
   ┌─────────────────────────────────┐
   │     TL-SG108E (managed)         │
   │     10.10.10.2 · VLAN-aware     │
   │                                 │
   │  P1: trunk → M720q              │
   │  P2: libre  ← VLAN 30 DEV      │
   │  P3: libre  ← VLAN 40 STORAGE  │
   │  P4: libre  ← VLAN 10 MGMT     │
   │  P5: libre  ← VLAN 50 DMZ      │
   │  P6: libre  ← VLAN 90 PENTEST  │
   │  P7: VLAN20 → uplink cluster ──┼──┐
   │  P8: VLAN90 → Parrot OS        │  │
   └─────────────────────────────────┘  │
                                        │
                          ┌─────────────────────────────────┐
                          │     TL-SG108 (unmanaged)         │
                          │     VLAN 20 PROD — 10.10.20.x    │
                          │                                   │
                          │  P1: uplink → TL-SG108E          │
                          │  P2: Dell 7490 #1 (master)       │
                          │  P3: Dell 7490 #2 (worker1)      │
                          │  P4: Dell 5480    (worker2)      │
                          │  P5: P52          (worker3 ML)   │
                          │  P6: T440p        (worker4 stor) │
                          │  P7: libre        (future wkr5)  │
                          │  P8: libre        (future wkr6)  │
                          └─────────────────────────────────┘
```

---

## 4. Benefits

### Network

| Benefit | Detail |
|---|---|
| 5 ports freed on managed switch | Ports 2–6 disponibles para nuevas VLANs y dispositivos |
| K3s intra-cluster tráfico local | Pod-to-pod y Longhorn replication no atraviesan el managed switch |
| 2 slots de expansión K3s | Puertos 7 y 8 del TL-SG108 para worker5 y worker6 |
| Topología más limpia | Managed switch = control · Unmanaged switch = cluster |

### Operacional

| Benefit | Detail |
|---|---|
| Separación de responsabilidades | Managed switch gestiona VLANs de lab · unmanaged gestiona cluster |
| Simplicidad del cluster | No hay configuración VLAN en el switch del cluster |
| Menos cables en managed switch | De 7 cables a 3 (trunk + uplink + Parrot) |

### Performance

| Benefit | Detail |
|---|---|
| Longhorn replication | Tráfico 2TB entre nodos queda en TL-SG108 a 1Gbps full duplex |
| Pod-to-pod Cilium | Flannel/Cilium overlay entre nodos no añade latencia del managed switch |
| Sin VLAN lookup overhead | El TL-SG108 no procesa tags — forwarding directo a hardware speed |

---

## 5. Considerations & Risks

### Punto único de fallo — uplink

Todo el K3s cluster depende de **un cable**: puerto 7 del TL-SG108E al puerto 1 del TL-SG108. Si ese cable falla:
- Tráfico intra-cluster: **sigue funcionando** (los nodos se ven entre sí)
- Acceso externo (internet, otras VLANs, Proxmox): **cortado**
- kubectl desde P53: **cortado** (P53 está en 192.168.1.x, no en VLAN 20)

**Mitigación:** Usar un cable certificado de calidad. El puerto único de fallo es bajo riesgo para un lab.

### Sin aislamiento entre nodos K3s

Con el switch unmanaged, todos los nodos K3s pueden verse entre sí en capa 2 sin restricciones. Esto es idéntico al estado actual (todos en VLAN 20) y es el comportamiento correcto para K3s/Cilium.

### DHCP y DNS sin cambios

El cambio es puramente físico/L2. pfSense sigue distribuyendo DHCP en VLAN 20, AdGuard sigue respondiendo DNS en VLAN 20. Los nodos K3s no necesitan reconfigurarse.

### Ancho de banda del uplink

El uplink es 1Gbps (ambos switches son GbE). El tráfico intra-cluster (la mayor parte) no usa el uplink. Solo el tráfico hacia internet y otras VLANs lo usa. Para un lab de 5 nodos esto no es un bottleneck.

---

## 6. Switch Configuration

Solo se modifica el **TL-SG108E**. El TL-SG108 no requiere ninguna configuración (es unmanaged).

### 6.1 — Agregar Puerto 7 a VLAN 20 (Untagged)

Accede a `http://10.10.10.2 → VLAN → 802.1Q VLAN`

Selecciona **VLAN ID: 20** y modifica:

| Port | Configuración actual | Configuración nueva |
|---|---|---|
| Port 7 | Not Member | **Untagged** |

Click **Add/Modify**.

### 6.2 — Cambiar PVID del Puerto 7 a 20

`VLAN → 802.1Q PVID Setting`

| Port | PVID actual | PVID nuevo |
|---|---|---|
| Port 7 | 1 | **20** |

Click **Apply**.

### 6.3 — Verificar configuración VLAN 20 final

Después de los cambios, VLAN 20 debe mostrar:

| VLAN ID | Member Ports | Tagged Ports | Untagged Ports |
|---|---|---|---|
| 20 | 1, 7 | 1 | 7 |

> **Nota:** Durante la migración, los puertos 2–6 también aparecerán como miembros de VLAN 20 hasta que se desconecten los cables. Desaparecen automáticamente cuando el switch ya no detecta dispositivos.

---

## 7. Migration Procedure

La migración no requiere downtime del cluster si se ejecuta nodo por nodo. El orden recomendado minimiza el impacto:

### Paso 1 — Preparar el TL-SG108

1. Conectar el TL-SG108 a una fuente de alimentación
2. Aplicar configuración en TL-SG108E (sección 6.1 y 6.2)
3. Conectar cable: **TL-SG108E puerto 7 → TL-SG108 puerto 1**
4. Verificar que el link light está activo en ambos extremos

### Paso 2 — Migrar workers primero (no el master)

Migra workers en orden — el cluster sigue funcionando con el master y los workers que quedan:

```bash
# En el master (Dell 7490 #1) — monitorear el cluster durante la migración
watch -n 2 kubectl get nodes
```

**Worker por worker:**
1. Desconectar cable de **T440p** del TL-SG108E puerto 5
2. Conectar cable de T440p al **TL-SG108 puerto 6**
3. Esperar que el nodo vuelva a `Ready` (~15 segundos)
4. Repetir para P52 (puerto 6 → puerto 5), Dell 5480 (puerto 3 → puerto 4), Dell 7490 #2 (puerto 4 → puerto 3)

### Paso 3 — Migrar el master

Una vez todos los workers estén en el TL-SG108 y en estado `Ready`:

1. Desconectar cable de **Dell 7490 #1** del TL-SG108E puerto 2
2. Conectar cable de Dell 7490 #1 al **TL-SG108 puerto 2**
3. Verificar que el master vuelve a `Ready`

```bash
# Verificar cluster completo
kubectl get nodes -o wide
# Todos deben mostrar Ready y la misma IP 10.10.20.x
```

### Paso 4 — Limpiar TL-SG108E

Opcionalmente, remover los puertos 2–5 de VLAN 20 en el TL-SG108E (ya no tienen dispositivos conectados). No es obligatorio — los puertos vacíos no causan problemas.

### Paso 5 — Verificación final

```bash
# Cluster healthy
kubectl get nodes
kubectl get pods -A | grep -v Running

# Conectividad externa desde un nodo K3s
ping -c 3 8.8.8.8           # internet
ping -c 3 10.10.10.3        # AdGuard (VLAN 10)
ping -c 3 192.168.1.65      # Proxmox

# kubectl desde P53
kubectl get nodes
```

---

## 8. Freed Ports — Future Use

Con 5 puertos libres en el TL-SG108E, el lab puede expandirse en múltiples direcciones:

### Opciones por puerto liberado

| Puerto | VLAN sugerida | Uso futuro |
|---|---|---|
| Port 2 | VLAN 30 DEV | T440p como jumpbox/dev machine · laptops de desarrollo |
| Port 3 | VLAN 40 STORAGE | NAS dedicado · interfaces de storage adicionales |
| Port 4 | VLAN 10 MGMT | Dispositivos de gestión adicionales · out-of-band |
| Port 5 | VLAN 50 DMZ | Servidores expuestos · reverse proxy físico |
| Port 6 | VLAN 90 PENTEST | Máquinas adicionales de red team |

### Expansión máxima del cluster K3s

Si en el futuro se agregan worker5 y worker6, se conectan directamente al TL-SG108 (puertos 7 y 8) sin tocar el managed switch.

### Arquitectura ideal con puertos liberados

```
TL-SG108E
  P1: trunk M720q          (sin cambio)
  P2: VLAN 30 → DEV net
  P3: VLAN 40 → STORAGE net
  P4: VLAN 10 → MGMT extra
  P5: VLAN 50 → DMZ
  P6: VLAN 90 → PENTEST extra
  P7: VLAN 20 → uplink cluster
  P8: VLAN 90 → Parrot OS   (sin cambio)
```

---

## 9. Validation

### Post-migración inmediata

```bash
# Todos los nodos Ready
kubectl get nodes -o wide

# Pods del sistema corriendo
kubectl get pods -n kube-system

# Cilium healthy
kubectl -n kube-system exec -it ds/cilium -- cilium status

# Longhorn healthy (si instalado)
kubectl -n longhorn-system get pods

# Conectividad inter-nodo (desde cualquier worker)
ping -c 3 10.10.20.100    # master
ping -c 3 10.10.20.101    # worker1
ping -c 3 10.10.20.102    # worker2
ping -c 3 10.10.20.103    # worker3
ping -c 3 10.10.20.104    # worker4

# Conectividad a pfSense y AdGuard
ping -c 3 10.10.20.1      # gateway VLAN 20
ping -c 3 10.10.10.3      # AdGuard DNS
nslookup google.com 10.10.10.3

# Internet desde nodo
ping -c 3 8.8.8.8
```

### Verificar switch TL-SG108E

```
http://10.10.10.2 → Monitoring → Port Statistics
```

- Puerto 1: tráfico trunk (normal)
- Puerto 7: tráfico uplink cluster (debe verse actividad)
- Puerto 8: tráfico Parrot (normal)
- Puertos 2-6: sin actividad (desconectados)

---

## Appendix — Quick Reference

### TL-SG108E changes summary

| Setting | Before | After |
|---|---|---|
| Port 7 — VLAN 20 membership | Not Member | Untagged |
| Port 7 — PVID | 1 | 20 |
| Ports 2–6 — VLAN 20 | Untagged (K3s nodes) | Not Member (empty) |

### Cable list for migration

| Cable | From | To |
|---|---|---|
| Uplink | TL-SG108E port 7 | TL-SG108 port 1 |
| Dell 7490 #1 | TL-SG108 port 2 | (from TL-SG108E port 2) |
| Dell 7490 #2 | TL-SG108 port 3 | (from TL-SG108E port 4) |
| Dell 5480 | TL-SG108 port 4 | (from TL-SG108E port 3) |
| P52 | TL-SG108 port 5 | (from TL-SG108E port 6) |
| T440p | TL-SG108 port 6 | (from TL-SG108E port 5) |

---

*Document v1.0 — Proposed improvement · HomeLab Enterprise Lab · May 2026*
