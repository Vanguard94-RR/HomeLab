# Enterprise HomeLab — M720q Disk Upgrade Manual

**Version:** 1.0
**Date:** June 2026
**Scope:** Upgrade disco NVMe 480GB → 1TB en Lenovo M720q (Proxmox host)
**Status:** INTENTO 2 EN PROGRESO 🔄

---

## Objetivo

Reemplazar el SSD NVMe de 480GB del M720q con uno de 1TB para dar más espacio a Proxmox, VMs y thin pool.

El 480GB liberado irá al **P52** (slot secundario) como NVMe tier rápido para Longhorn y Ollama.

---

## Hardware

| Componente | Detalle |
|---|---|
| Origen | WD PC SN740 SDDQNQD-512G — 480GB NVMe M.2 2280 |
| Destino | 1TB NVMe M.2 2280 (nuevo) |
| Conexión temporal | Adaptador USB 3.0 → M.2 NVMe |
| Host | Lenovo M720q · Proxmox VE 9.1.1 |

---

## Plan de movimiento de discos

```
1TB NVMe nuevo    → M720q  slot interno (reemplaza 480GB)
480GB NVMe libre  → P52    slot M.2 secundario (Longhorn NVMe + Ollama)
```

---

## Proceso de clonación

### ⚠️ REGLA CRÍTICA — Apagar VMs ANTES del dd

```bash
# OBLIGATORIO: apagar todo antes de clonar
pct stop 101      # AdGuard LXC
sleep 5
qm stop 100       # pfSense VM
sleep 5
qm stop 199       # Windows VM

# Verificar
pct list          # todos: stopped
qm list           # todos: stopped
```

### Paso 1 — Conectar el 1TB via USB

Conectar el 1TB al adaptador USB y enchufar al M720q. Verificar:

```bash
lsblk | grep -E "sda|nvme"
dmesg | tail -5
# Expected: sda = 953.9G (1TB via USB)
#           nvme0n1 = 476.9G (480GB interno)
```

### Paso 2 — Verificar disco destino limpio

```bash
mount | grep sda      # nada montado
pvs | grep sda        # si aparece LVM: vgchange -an pve --select 'pv_name=~sda'
```

### Paso 3 — Clonar

```bash
dd if=/dev/nvme0n1 \
   of=/dev/sda \
   bs=4M \
   status=progress \
   conv=fsync

echo "Exit code: $?"
```

**Velocidad esperada:** ~50-80 MB/s via USB 3.0
**Tiempo estimado:** ~90 minutos con VMs apagadas

**Monitorear progreso en otra terminal:**
```bash
kill -USR1 $(pgrep dd)
```

**Si necesitas recuperar velocidad de internet:**
```bash
ionice -c 3 -p $(pgrep dd)
# Sube internet de ~40Mbps a ~78Mbps pero reduce velocidad de dd
```

### Paso 4 — Verificar clon y reparar GPT

```bash
# El disco original era 476GB, el destino es 953GB
# GPT backup table queda en posición incorrecta — normal

# Reparar GPT
sgdisk -e /dev/sda
sgdisk -v /dev/sda
# Expected: "No problems found. X free sectors available"

# Verificar particiones
fdisk -l /dev/sda | grep -E "Disk|Device"
# Expected: mismas particiones que nvme0n1 pero en disco de 1TB

# Verificar LVM visible
pvs /dev/sda3 2>/dev/null || echo "PV visible como duplicate — normal"
```

### Paso 5 — Swap físico

```bash
# Apagar Proxmox limpiamente
shutdown -h now
```

Físicamente:
1. Desconectar adaptador USB con el 1TB
2. Abrir M720q (tornillos base)
3. Retirar el NVMe de 480GB del slot interno
4. Insertar el 1TB NVMe en el slot interno
5. Cerrar M720q y encender

### Paso 6 — Verificación post-arranque

```bash
# Verificar que arrancó desde el 1TB
lsblk
# Expected: nvme0n1 = 953.9G

# Verificar LVM
lvs pve
# Expected: data pve twi-a-tz-- (activo con a)
#           root pve -wi-ao----
#           swap pve -wi-ao----

# Arrancar VMs
pct start 101    # AdGuard
sleep 10
qm start 100     # pfSense
sleep 15
qm start 199     # Windows

# Verificar
qm list
pct list
```

### Paso 7 — Expandir LVM (aprovechar espacio extra)

```bash
# Ver espacio libre en VG
vgs pve
# Expected: VFree ~477GB (espacio nuevo del 1TB)

# Expandir thin pool para aprovechar el espacio
lvextend -l +100%FREE /dev/pve/data

# O expandir root si se necesita más espacio en Proxmox OS
# lvextend -L +100G /dev/pve/root
# resize2fs /dev/pve/root
```

---

## Historial de intentos

### Intento 1 — FALLIDO (Junio 2026)

**Causa del fallo:** dd ejecutado con VMs corriendo.

**Síntoma:** `Thin pool pve-data-tpool transaction_id is 0, while expected 23`

**Proceso de recuperación intentado:**
- thin_repair → falla (bad checksum)
- thin_dump → superblock vacío (transaction=0)
- Copia raw de sectores tmeta del disco original → falla (checksum)
- dmsetup para mapear tmeta original → bad checksum
- Copia sector a sector del tmeta original → exitosa pero LVM ve duplicados
- vgcfgrestore (cambiar transaction_id en metadata LVM) → thin pool activa pero thin volumes fallan
- **Solución:** revertir al disco 480GB original

**Tiempo perdido:** ~4 horas

**Lección:** SIEMPRE apagar VMs antes del dd en Proxmox con thin pools.

### Intento 2 — EN PROGRESO (Junio 2026)

- VMs apagadas antes de iniciar ✅
- dd corriendo a ~52MB/s (USB limitation) 🔄
- Estimado: ~2.5 horas

---

## Plan para el 480GB post-upgrade

Cuando el 1TB esté instalado en el M720q, el 480GB va al P52:

```bash
# En P52 — después de instalar Fedora 42 y unirse al cluster K3s

# Verificar que el disco se reconoce
lsblk
# Expected: nvme1n1 = 476.9G (secundario)

# Particionar
sudo parted /dev/nvme1n1 --script \
  mklabel gpt \
  mkpart longhorn 0% 73% \
  mkpart ollama 73% 100%

# Formatear
sudo mkfs.xfs -L longhorn /dev/nvme1n1p1
sudo mkfs.xfs -L ollama   /dev/nvme1n1p2

# Montar
sudo mkdir -p /var/lib/longhorn /var/lib/ollama
echo "LABEL=longhorn /var/lib/longhorn xfs defaults,noatime 0 0" | sudo tee -a /etc/fstab
echo "LABEL=ollama   /var/lib/ollama   xfs defaults,noatime 0 0" | sudo tee -a /etc/fstab
sudo mount -a

# Distribución:
# /var/lib/longhorn  350GB → Longhorn NVMe tier (más rápido del cluster)
# /var/lib/ollama    130GB → modelos LLM (Llama3 8B=5GB, ~20-25 modelos)
```

---

## Checklist final

- [ ] VMs apagadas ANTES del dd
- [ ] dd completado con exit code 0
- [ ] sgdisk -e reparación GPT exitosa
- [ ] Swap físico realizado
- [ ] Proxmox arranca desde 1TB
- [ ] lvs pve muestra thin pool activo (twi-a-tz--)
- [ ] pfSense, AdGuard y Windows VMs arrancan
- [ ] LVM expandido para usar los 477GB extra
- [ ] 480GB guardado para P52

---

*Document v1.0 — M720q Disk Upgrade · Proxmox VE 9.1.1 · Junio 2026*
