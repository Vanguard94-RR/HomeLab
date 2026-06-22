#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 01: Preflight  v1.0
#  Verifica y corrige prerequisitos del nodo para K3s
#  No se ejecuta directamente — lo llama bootstrap.sh
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="01-PREFLIGHT"
reset_counters

section "$MODULE_NAME"

# -----------------------------------------------------------------------------
# Hostname
# -----------------------------------------------------------------------------
CURRENT_HN=$(hostname)
info "Hostname actual: $CURRENT_HN"

# /etc/hosts
if grep -q "$CURRENT_HN" /etc/hosts; then
  skip "Hostname en /etc/hosts"
else
  do_run "Agregar hostname a /etc/hosts" bash -c "echo '127.0.1.1 $CURRENT_HN' >> /etc/hosts"
fi

# -----------------------------------------------------------------------------
# Swap
# -----------------------------------------------------------------------------
SWAP_LINES=$(swapon --show 2>/dev/null | wc -l)
if [[ "$SWAP_LINES" -gt 0 ]]; then
  info "Swap activa — deshabilitando"
  swapoff -a >> "${LOG_FILE:-/dev/null}" 2>&1 && ok "Swap deshabilitada" || warn "swapoff retornó error (no crítico)"
else
  skip "Swap ya deshabilitada"
fi

# zram
if systemctl is-active --quiet systemd-zram-setup@zram0 2>/dev/null; then
  do_run_soft "Deshabilitar zram" systemctl stop systemd-zram-setup@zram0
else
  skip "zram no activo"
fi

# Persistir swap deshabilitada
if grep -qE '^\s*[^#].*swap' /etc/fstab 2>/dev/null; then
  do_run "Comentar swap en fstab" sed -i '/swap/s/^/#/' /etc/fstab
else
  skip "fstab sin entradas de swap activas"
fi

# -----------------------------------------------------------------------------
# Kernel modules
# -----------------------------------------------------------------------------
for MOD in br_netfilter overlay ip_conntrack; do
  if lsmod | grep -q "^${MOD}"; then
    skip "Módulo $MOD ya cargado"
  else
    do_run "Cargar módulo $MOD" modprobe "$MOD"
  fi
done

# Persistencia de módulos
MODULES_CONF="/etc/modules-load.d/k3s.conf"
if [[ -f "$MODULES_CONF" ]]; then
  skip "Módulos persistentes ya configurados ($MODULES_CONF)"
else
  do_run "Persistir módulos kernel" bash -c "cat > $MODULES_CONF << 'EOF'
br_netfilter
overlay
ip_conntrack
EOF"
fi

# -----------------------------------------------------------------------------
# Sysctl
# -----------------------------------------------------------------------------
SYSCTL_CONF="/etc/sysctl.d/k3s.conf"
if [[ -f "$SYSCTL_CONF" ]]; then
  skip "sysctl params ya configurados ($SYSCTL_CONF)"
else
  do_run "Configurar sysctl para K3s" bash -c "cat > $SYSCTL_CONF << 'EOF'
net.ipv4.ip_forward=1
net.bridge.bridge-nf-call-iptables=1
net.bridge.bridge-nf-call-ip6tables=1
EOF"
  do_run_soft "Aplicar sysctl" sysctl --system
fi

# Verificar valores actuales
[[ "$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)" == "1" ]] && \
  skip "ip_forward ya activo" || \
  do_run_soft "Habilitar ip_forward runtime" sysctl -w net.ipv4.ip_forward=1

[[ "$(cat /proc/sys/net/bridge/bridge-nf-call-iptables 2>/dev/null)" == "1" ]] && \
  skip "bridge-nf-call-iptables ya activo" || \
  do_run_soft "Habilitar bridge-nf-call-iptables runtime" sysctl -w net.bridge.bridge-nf-call-iptables=1

# -----------------------------------------------------------------------------
# SELinux
# -----------------------------------------------------------------------------
if command -v getenforce &>/dev/null; then
  SELINUX_MODE=$(getenforce 2>/dev/null || echo "Disabled")
  info "SELinux: $SELINUX_MODE"

  if rpm -q container-selinux &>/dev/null; then
    skip "container-selinux instalado"
  else
    do_run "Instalar container-selinux" dnf install -y container-selinux
  fi

  if rpm -q k3s-selinux &>/dev/null; then
    skip "k3s-selinux instalado"
  else
    # k3s-selinux no está en repos de Fedora 42 — intentar, ignorar si falla
    dnf install -y k3s-selinux >> "${LOG_FILE:-/dev/null}" 2>&1 && ok "k3s-selinux instalado" || warn "k3s-selinux no disponible en este repo (no crítico en Fedora 42)"
  fi
else
  skip "SELinux no presente en este sistema"
fi

# -----------------------------------------------------------------------------
# Firewalld — puertos K3s + Cilium
# -----------------------------------------------------------------------------
if systemctl is-active --quiet firewalld 2>/dev/null; then
  info "firewalld activo — configurando puertos"

  declare -A PORTS_COMMON=(
    ["8472/udp"]="VXLAN overlay"
    ["10250/tcp"]="Kubelet"
    ["9100/tcp"]="node-exporter (Prometheus scraping)"
    ["4240/tcp"]="Cilium health"
    ["4244/tcp"]="Cilium Hubble"
    ["4245/tcp"]="Cilium Hubble Relay"
    ["51871/udp"]="WireGuard Cilium"
  )

  declare -A PORTS_SERVER=(
    ["6443/tcp"]="K3s API server"
    ["2379/tcp"]="etcd client"
    ["2380/tcp"]="etcd peer"
  )

  for PORT in "${!PORTS_COMMON[@]}"; do
    if firewall-cmd --query-port="$PORT" --permanent &>/dev/null; then
      skip "Puerto $PORT ya abierto (${PORTS_COMMON[$PORT]})"
    else
      do_run "Abrir puerto $PORT (${PORTS_COMMON[$PORT]})" \
        firewall-cmd --add-port="$PORT" --permanent
    fi
  done

  if [[ "${ROLE:-worker}" == "server" ]]; then
    for PORT in "${!PORTS_SERVER[@]}"; do
      if firewall-cmd --query-port="$PORT" --permanent &>/dev/null; then
        skip "Puerto $PORT ya abierto (${PORTS_SERVER[$PORT]})"
      else
        do_run "Abrir puerto $PORT (${PORTS_SERVER[$PORT]})" \
          firewall-cmd --add-port="$PORT" --permanent
      fi
    done
  fi

  # Masquerade
  if firewall-cmd --query-masquerade --permanent &>/dev/null; then
    skip "Masquerade ya habilitado"
  else
    do_run "Habilitar masquerade" firewall-cmd --add-masquerade --permanent
  fi

  # CIDRs en zona trusted
  for CIDR in "$CLUSTER_CIDR" "$SERVICE_CIDR"; do
    if firewall-cmd --zone=trusted --query-source="$CIDR" --permanent &>/dev/null; then
      skip "CIDR $CIDR ya en zona trusted"
    else
      do_run "Agregar $CIDR a zona trusted" \
        firewall-cmd --zone=trusted --add-source="$CIDR" --permanent
    fi
  done

  do_run_soft "Reload firewalld" firewall-cmd --reload
else
  skip "firewalld no activo"
fi

# -----------------------------------------------------------------------------
# NTP
# -----------------------------------------------------------------------------
if systemctl is-active --quiet chronyd 2>/dev/null || \
   systemctl is-active --quiet systemd-timesyncd 2>/dev/null; then
  skip "NTP ya activo"
else
  do_run "Habilitar e iniciar chronyd" bash -c "systemctl enable --now chronyd"
fi

# -----------------------------------------------------------------------------
# LVM root expansion
# -----------------------------------------------------------------------------
VG=$(vgdisplay 2>/dev/null | grep "VG Name" | awk '{print $3}' | head -1)
if [[ -n "$VG" ]]; then
  VG_FREE=$(vgdisplay "$VG" 2>/dev/null | grep "Free  PE" | awk '{print $5}')
  if [[ "${VG_FREE:-0}" -gt 1280 ]]; then   # >5GB libres (1280 PEs × 4MB)
    info "VG $VG tiene espacio libre — expandiendo LV root"
    do_run "Extender LV root" lvextend -l +100%FREE "/dev/${VG}/root"
    ROOT_FS=$(df / --output=fstype | tail -1)
    if [[ "$ROOT_FS" == "xfs" ]]; then
      do_run_soft "Grow xfs /" xfs_growfs /
    else
      do_run_soft "Resize2fs /" resize2fs "/dev/${VG}/root"
    fi
  else
    skip "VG $VG sin espacio libre suficiente para expandir"
  fi
else
  skip "Sin LVM detectado"
fi

# -----------------------------------------------------------------------------
# Gateway — asegurar ruta de salida a internet
# -----------------------------------------------------------------------------
DEAD_GW="10.10.20.1"
if ip route show default | grep -q "$DEAD_GW"; then
  warn "Ruta default por $DEAD_GW detectada (pfSense apagado) — eliminando"
  ip route del default via "$DEAD_GW" 2>/dev/null || true
  ok "Ruta muerta eliminada"
else
  skip "Sin ruta muerta por $DEAD_GW"
fi

# -----------------------------------------------------------------------------
# Ruta estática MGMT — para scraping de Prometheus (T430 → nodos K3s)
# El T430 (10.10.10.10, VLAN 10) necesita scrapear :9100 en los nodos (VLAN 20)
# Sin esta ruta, el nodo responde por WiFi y el T430 no recibe la respuesta
# -----------------------------------------------------------------------------
MGMT_CIDR="${MGMT_CIDR:-10.10.10.0/24}"
MGMT_GW="${MGMT_GW:-10.10.20.1}"

# Detectar interfaz ethernet VLAN 20
VLAN20_IFACE=$(ip route show | grep "10.10.20" | awk '{print $3}' | head -1)

if [[ -n "$VLAN20_IFACE" ]]; then
  if ip route show | grep -q "$MGMT_CIDR"; then
    skip "Ruta estática $MGMT_CIDR ya configurada"
  else
    info "Agregando ruta estática $MGMT_CIDR via $MGMT_GW dev $VLAN20_IFACE"
    ip route add "$MGMT_CIDR" via "$MGMT_GW" dev "$VLAN20_IFACE" 2>/dev/null && ok "Ruta temporal agregada" || warn "ip route add falló (puede ya existir)"
    # Persistir via NetworkManager
    NM_CONN=$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null | grep "$VLAN20_IFACE" | cut -d: -f1)
    if [[ -n "$NM_CONN" ]]; then
      nmcli connection modify "$NM_CONN" +ipv4.routes "$MGMT_CIDR $MGMT_GW" 2>/dev/null && \
        nmcli connection up "$NM_CONN" >> "${LOG_FILE:-/dev/null}" 2>&1 && \
        ok "Ruta $MGMT_CIDR persistida en NetworkManager ($NM_CONN)" || \
        warn "No se pudo persistir la ruta en NetworkManager"
    else
      warn "No se encontró conexión NetworkManager para $VLAN20_IFACE — persistir manualmente"
    fi
  fi
else
  warn "No se detectó interfaz VLAN 20 — ruta MGMT no configurada"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
print_summary "$MODULE_NAME"

# -----------------------------------------------------------------------------
# Longhorn prerequisitos — todos los nodos
# -----------------------------------------------------------------------------
section "01-LONGHORN-PREREQS"

# open-iscsi — requerido por Longhorn para block storage
if systemctl is-active --quiet iscsid 2>/dev/null; then
  skip "iscsid ya activo"
else
  if rpm -q iscsi-initiator-utils &>/dev/null; then
    info "iscsi-initiator-utils instalado pero iscsid no activo — habilitando"
    do_run "Habilitar iscsid" systemctl enable --now iscsid
  else
    do_run "Instalar iscsi-initiator-utils" dnf install -y iscsi-initiator-utils
    do_run "Habilitar iscsid" systemctl enable --now iscsid
  fi
fi

# nfs-utils — requerido por Longhorn para ReadWriteMany volumes
if rpm -q nfs-utils &>/dev/null; then
  skip "nfs-utils ya instalado"
else
  do_run "Instalar nfs-utils" dnf install -y nfs-utils
fi

# cryptsetup — requerido por Longhorn para encrypted volumes
if rpm -q cryptsetup &>/dev/null; then
  skip "cryptsetup ya instalado"
else
  do_run "Instalar cryptsetup" dnf install -y cryptsetup
fi

# Directorio de datos Longhorn
LONGHORN_DIR="${LONGHORN_DATA_PATH:-/var/lib/longhorn}"
if [[ -d "$LONGHORN_DIR" ]]; then
  skip "Directorio Longhorn ya existe ($LONGHORN_DIR)"
else
  do_run "Crear directorio Longhorn $LONGHORN_DIR" mkdir -p "$LONGHORN_DIR"
fi

print_summary "$MODULE_NAME"
