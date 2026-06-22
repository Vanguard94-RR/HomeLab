# Enterprise HomeLab — Troubleshooting Reference

**Version:** 2.0
**Date:** June 2026
**Scope:** Proxmox · pfSense · AdGuard · TL-SG108E · K3s · Cilium · Longhorn · ArgoCD

---

## Table of Contents

1. [Proxmox VE](#1-proxmox-ve)
2. [pfSense](#2-pfsense)
3. [AdGuard Home](#3-adguard-home)
4. [TL-SG108E Switch](#4-tl-sg108e-switch)
5. [K3s — Instalación](#5-k3s-instalacion)
6. [K3s — Cluster Operativo](#6-k3s-cluster-operativo)
7. [Cilium CNI](#7-cilium-cni)
8. [Longhorn Storage](#8-longhorn-storage)
9. [ArgoCD](#9-argocd)
10. [Network Connectivity](#10-network-connectivity)
11. [DNS Resolution](#11-dns-resolution)
12. [IaC Scripts](#12-iac-scripts)
13. [Quick Diagnostic Commands](#13-quick-diagnostic-commands)

---

## 1. Proxmox VE

### VM/LXC has no network after reboot

```bash
cat /sys/class/net/vmbr1/bridge/vlan_filtering   # Expected: 1
qm config VMID | grep net
qm stop VMID && qm start VMID
```

**Root cause:** `bridge-vlan-aware yes` o `bridge-vids 2-4094` faltantes en `/etc/network/interfaces`.

### LXC container won't start after network change

```bash
pct config 101
journalctl -u pve-manager --no-pager | tail -20
pct stop 101 && pct start 101
pct status 101
```

### Proxmox web UI unreachable

```bash
systemctl status pveproxy
systemctl restart pveproxy
ss -tlnp | grep 8006
```

### pfSense RAM al 101% en Proxmox

**Causa:** FreeBSD no tiene driver balloon de QEMU. Proxmox reporta uso incorrecto.

```bash
# Fix: deshabilitar balloon
qm set 100 --balloon 0
# Reducir RAM a valor real (1GB es suficiente para pfSense)
qm set 100 --memory 1024
```

**Estado:** Resuelto en Junio 2026. RAM real ~440MB, swap=0.

---

## 2. pfSense

### pfSense VM not routing between VLANs

```bash
# En Proxmox — net1 debe ir sin tag (trunk mode)
qm config 100 | grep net1
# Expected: net1=virtio=...,bridge=vmbr1  (sin tag=)
```

### node_exporter en pfSense

```bash
# Verificar servicio
service node_exporter status
sockstat -l | grep 9100

# Si no arranca
/usr/local/etc/rc.d/node_exporter start

# Verificar en Prometheus
curl -s http://10.10.10.1:9100/metrics | head -5
```

**Configuración Prometheus:**
```yaml
- job_name: pfsense
  static_configs:
    - targets: ['10.10.10.1:9100']
  relabel_configs:
    - target_label: nodename
      replacement: pfsense
```

### pfSense QEMU Guest Agent

```bash
# Dentro de pfSense shell
service qemu-guest-agent status
# Si no está instalado:
pkg install -y qemu-guest-agent
echo 'qemu_guest_agent_enable="YES"' >> /etc/rc.conf
# Requiere virtio-serial device + cold start en Proxmox
```

---

## 3. AdGuard Home

### AdGuard not resolving

```bash
# Verificar servicio en T430
systemctl status adguardhome
curl -s http://10.10.10.10:3000  # UI
dig @10.10.10.3 google.com       # Test DNS
```

### adguard-exporter target incorrecto

**Problema:** Target configurado como `10.10.10.3:9617` en lugar de `10.10.10.10:9617`.

**Fix en prometheus.yml:**
```yaml
- job_name: adguard
  static_configs:
    - targets: ['10.10.10.10:9617']  # T430, no AdGuard IP
```

**Estado:** Resuelto en Junio 2026.

---

## 4. TL-SG108E Switch

### Switch unreachable at 10.10.10.2

```bash
# Desde T430 en VLAN 10
ping 10.10.10.2
# Si no responde, verificar que P7 del switch tiene PVID 10
```

### Port not in correct VLAN

Verificar en la UI web del switch (http://10.10.10.2):
- 802.1Q VLAN → cada puerto tiene PVID correcto
- P1: trunk (tagged 10,20,90)
- P2-6: PVID 20 (untagged)
- P7: PVID 10 (untagged)
- P8: PVID 90 (untagged)

---

## 5. K3s — Instalación

### sudo sin TTY al ejecutar via SSH

```bash
# Error: sudo: a terminal is required to read the password
# Fix: configurar NOPASSWD
echo 'admin ALL=(ALL) NOPASSWD: ALL' | sudo tee /etc/sudoers.d/admin-nopasswd
chmod 440 /etc/sudoers.d/admin-nopasswd
```

### Workers sin internet (ruta default muerta)

```bash
ip route show default
# Si aparece: default via 10.10.20.1 dev enp0s31f6 metric 100
# Fix:
sudo ip route del default via 10.10.20.1
# Verificar que queda solo la ruta WiFi
ip route show default
```

**El módulo 01-preflight.sh detecta y elimina esta ruta automáticamente.**

### K3s agent falla con "connection refused"

```bash
# Verificar conectividad al control-plane
curl -k https://10.10.20.101:6443
# Si falla, el worker no tiene ruta al CP

# Verificar ruta
ip route show default
# El worker debe poder alcanzar 10.10.20.101
```

### etcd mismatch de IP tras cambio de node-ip

```bash
# Error: Found [dell-7490-1=https://192.168.1.139:2380]
#        expect: dell-7490-1=https://10.10.20.101:2380

# NO intentar reparar — desinstalar y reinstalar
sudo /usr/local/bin/k3s-uninstall.sh
# Verificar IP ethernet correcta ANTES de reinstalar
ip addr show enp0s31f6 | grep inet
# Reinstalar con IP correcta
sudo bash bootstrap.sh --role server --node-ip 10.10.20.101
```

### NetworkManager: Connected pero sin IP

```bash
nmcli device status   # muestra "connected" pero...
ip addr show enp0s31f6  # NO-CARRIER o sin inet

# Fix:
nmcli connection down enp0s31f6 && nmcli connection up enp0s31f6
ip addr show enp0s31f6 | grep inet
# Debe mostrar 10.10.20.X/24
```

### k3s-selinux no disponible en Fedora 42

```
Error: No match for argument: k3s-selinux
```

**Causa:** Paquete solo en repos RHEL/CentOS. En Fedora 42 es suficiente `container-selinux`.
**Acción:** Ignorar — es un warning, no un error crítico.

---

## 6. K3s — Cluster Operativo

### Nodo NotReady

```bash
kubectl describe node <nodo>
kubectl logs -n kube-system -l k8s-app=cilium \
  --field-selector spec.nodeName=<nodo>
ssh admin@<ip> "sudo journalctl -u k3s-agent -n 50 --no-pager"
```

### Pod en Pending

```bash
kubectl describe pod <pod> -n <namespace>
# Buscar: Insufficient cpu/memory, no nodes available,
#         PVC pending, taint/toleration issues
```

### Token del cluster

```bash
ssh admin@10.10.20.101 "sudo cat /var/lib/rancher/k3s/server/node-token"
# o
ssh admin@10.10.20.101 "cat /tmp/k3s-node-token.txt"
```

### kubeconfig en P53

```bash
scp admin@10.10.20.101:/home/admin/.kube/config ~/.kube/config
export KUBECONFIG=~/.kube/config
kubectl get nodes
```

### Reinstalación limpia del cluster

```bash
# Workers primero
for NODE in 10.10.20.102 10.10.20.104; do
  ssh admin@$NODE "sudo /usr/local/bin/k3s-agent-uninstall.sh"
done

# Control-plane
ssh admin@10.10.20.101 "sudo /usr/local/bin/k3s-uninstall.sh"

# Reinstalar todo con un comando
cd ~/Documents/Personal/HomeLab/scripts
bash deploy.sh
```

---

## 7. Cilium CNI

### Cilium pods en CrashLoopBackOff

```bash
kubectl logs -n kube-system -l k8s-app=cilium
cilium status
cilium connectivity test
```

### Pods en Pending (CNI no configurado)

Los pods quedan en Pending hasta que Cilium esté Running. Es esperado durante la instalación.

```bash
# Verificar Cilium Running
kubectl get pods -n kube-system -l k8s-app=cilium
# Todos deben estar 1/1 Running

# Si no, verificar API server IP en helm values
helm get values cilium -n kube-system | grep k8sService
```

### Hubble UI no accesible

```bash
kubectl port-forward svc/hubble-ui -n kube-system 8082:80
# http://localhost:8082
```

---

## 8. Longhorn Storage

### longhorn-manager 1/2 (admission webhook falla)

```bash
# Verificar iscsid en el nodo afectado
kubectl get pod <manager-pod> -n longhorn-system -o wide
# Ver en qué nodo está
ssh admin@<node-ip> "systemctl is-active iscsid"

# Si no está activo:
ssh admin@<node-ip> "sudo systemctl enable --now iscsid"
```

**Causa raíz:** `iscsid` no instalado/activo. Longhorn usa iSCSI para block storage.
**Prevención:** El módulo 01-preflight.sh lo instala automáticamente.

### longhorn-driver-deployer en Init:0/1

Espera al `longhorn-manager`. Se resuelve solo cuando el manager esté 2/2 Running.

### Longhorn UI

```bash
kubectl port-forward svc/longhorn-frontend -n longhorn-system 8081:80
# http://localhost:8081
```

### PVC en Pending

```bash
kubectl describe pvc <nombre>
# Verificar StorageClass
kubectl get storageclass
# longhorn debe ser (default)
```

---

## 9. ArgoCD

### Password admin inicial

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo
# También en /tmp/argocd-admin-pass.txt en el control-plane
```

### ArgoCD UI

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
# https://localhost:8080
# Usuario: admin
```

### App out of sync

```bash
argocd app sync <app-name>
# o desde la UI: Sync button
```

---

## 10. Network Connectivity

### Nodo sin acceso a internet

```bash
# Verificar ruta default
ip route show default

# Si hay ruta muerta por 10.10.20.1:
sudo ip route del default via 10.10.20.1

# Verificar conectividad
curl -s --max-time 5 -o /dev/null -w '%{http_code}' https://github.com
# Expected: 200
```

### P53 sin acceso a VLANs del lab

```bash
# Verificar rutas estáticas
ip route | grep 10.10
# Expected:
# 10.10.10.0/24 via 192.168.1.131 dev wlp82s0
# 10.10.20.0/24 via 192.168.1.131 dev wlp82s0

# Si no existen, agregar:
nmcli connection modify "INFINITUMC241" \
  +ipv4.routes "10.10.10.0/24 192.168.1.131" \
  +ipv4.routes "10.10.20.0/24 192.168.1.131"
nmcli connection up "INFINITUMC241"
```

---

## 11. DNS Resolution

### Resolución falla para hostnames del lab

```bash
# Verificar DNS
resolvectl status | grep "DNS Server"
# Expected: 192.168.1.100 (AdGuard)

# Test
dig @10.10.10.3 grafana.mgmt
nslookup grafana.mgmt 10.10.10.3
```

### Browsers ignoran DNS del sistema

Agregar a /etc/hosts para acceso desde browser:
```bash
echo "10.10.10.10  grafana.mgmt prometheus.mgmt alertmanager.mgmt" | sudo tee -a /etc/hosts
echo "10.10.10.1   pfsense.mgmt" | sudo tee -a /etc/hosts
```

---

## 12. IaC Scripts

### deploy.sh falla al copiar scripts

```bash
# Verificar que el tarball existe
ls ~/Documents/Personal/HomeLab/scripts/homelab-scripts.tar.gz

# Verificar SSH sin password
ssh admin@10.10.20.101 "echo OK"
```

### Módulo falla con "ya configurado" pero no funciona

```bash
# Ejecutar módulo específico con logs detallados
ssh admin@10.10.20.101 \
  "sudo bash ~/Documents/Personal/HomeLab/scripts/bootstrap.sh \
   --role server --only 04"

# Ver log completo
ssh admin@10.10.20.101 "sudo cat /tmp/homelab-bootstrap-*.log | tail -50"
```

### Bootstrap detecta K3s ya instalado pero quieres reinstalar

```bash
# Desinstalar primero
ssh admin@10.10.20.101 "sudo /usr/local/bin/k3s-uninstall.sh"
# Luego reinstalar
bash deploy.sh --only-cp
```

---

## 13. Monitoring K3s Integration

### node-exporter no responde desde T430

```bash
# 1. Verificar que DaemonSet existe
kubectl get daemonset node-exporter -n monitoring

# 2. Verificar pods Running
kubectl get pods -n monitoring -o wide

# 3. Verificar puerto 9100 abierto en nodo
ssh admin@<node-ip> "sudo firewall-cmd --list-ports | grep 9100"
# Si no: sudo firewall-cmd --add-port=9100/tcp --permanent && sudo firewall-cmd --reload

# 4. Verificar ruta de retorno en el nodo
ssh admin@<node-ip> "ip route get 10.10.10.10"
# Debe mostrar: via 10.10.20.1 dev enp0s31f6 src 10.10.20.X
# Si muestra WiFi: sudo ip route add 10.10.10.0/24 via 10.10.20.1 dev enp0s31f6

# 5. Verificar desde T430
ssh admin@10.10.10.10 "curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://<node-ip>:9100/metrics"
# Expected: 200
```

### Longhorn métricas no accesibles

```bash
# Verificar que el Service es NodePort
kubectl get svc longhorn-backend -n longhorn-system
# Si es ClusterIP, hacer upgrade:
KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm upgrade longhorn longhorn/longhorn \
  -n longhorn-system --reuse-values \
  --set service.manager.type=NodePort \
  --set service.manager.nodePort=30500

# Verificar desde T430
ssh admin@10.10.10.10 "curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://10.10.20.101:30500/metrics"
```

### pfSense node_exporter caído

```bash
ssh admin@10.10.10.1 "service node_exporter status"
ssh admin@10.10.10.1 "service node_exporter start"
# Verificar: curl -s http://10.10.10.1:9100/metrics | head -3
```

### Prometheus targets todos down tras reinstalación K3s

```bash
# 1. Re-desplegar node-exporter DaemonSet
sudo bash bootstrap.sh --role server --only 07

# 2. Reabrir puerto 9100 (si se reinstalaron los nodos)
for NODE in 10.10.20.101 10.10.20.102 10.10.20.104; do
  ssh admin@$NODE "sudo firewall-cmd --add-port=9100/tcp --permanent && sudo firewall-cmd --reload"
done

# 3. Re-verificar rutas MGMT
for NODE in 192.168.1.139 192.168.1.141 192.168.1.89; do
  ssh admin@$NODE "ip route get 10.10.10.10"
done

# 4. Recargar Prometheus
curl -X POST http://10.10.10.10:9091/-/reload
```

---

## 14. Quick Diagnostic Commands

### Estado completo del cluster

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl get pods -A | grep -v Running    # solo problemas
kubectl top nodes                         # recursos
```

### Estado de todos los servicios

```bash
# Proxmox
ssh root@192.168.1.65 "qm list && pct list"

# K3s nodos
for NODE in 10.10.20.101 10.10.20.102 10.10.20.104; do
  echo -n "$NODE: "
  ssh admin@$NODE "systemctl is-active k3s 2>/dev/null || systemctl is-active k3s-agent 2>/dev/null"
done

# Monitoring (T430)
ssh admin@10.10.10.10 "cd /opt/monitoring && sudo podman-compose ps"

# pfSense node_exporter
curl -s --max-time 3 http://10.10.10.1:9100/metrics | head -3
```

### Logs rápidos

```bash
# K3s server
ssh admin@10.10.20.101 "sudo journalctl -u k3s -n 30 --no-pager"

# K3s agent
ssh admin@10.10.20.102 "sudo journalctl -u k3s-agent -n 30 --no-pager"

# Cilium
kubectl logs -n kube-system -l k8s-app=cilium --tail=20

# Longhorn
kubectl logs -n longhorn-system -l app=longhorn-manager --tail=20

# ArgoCD
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-server --tail=20
```

---

*Document v2.1 — Troubleshooting Reference · Junio 2026*
*Actualizado con K3s monitoring integration, node-exporter DaemonSet, rutas MGMT y Longhorn NodePort*
