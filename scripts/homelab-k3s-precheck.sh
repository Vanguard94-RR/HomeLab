#!/bin/bash
# =============================================================================
# HomeLab — K3s Node Pre-Check Script
# Version : 1.3 (final)
# Usage   : ./homelab-k3s-precheck.sh [--adguard IP] [--gateway IP] [--role master|worker]
# Example : ./homelab-k3s-precheck.sh --adguard 10.10.10.3 --role master
# Idempotent: safe to run multiple times, makes no changes to the system
# Verified : Fedora 42 · t440p-server (master) · t430 (worker) · May 2026
# =============================================================================

# ── Defaults ──────────────────────────────────────────────────────────────────
ADGUARD_IP="10.10.10.3"
GATEWAY_IP=""
NODE_ROLE="worker"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --adguard) ADGUARD_IP="$2"; shift 2 ;;
    --gateway) GATEWAY_IP="$2"; shift 2 ;;
    --role)    NODE_ROLE="$2";  shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--adguard IP] [--gateway IP] [--role master|worker]"
      echo "  --adguard  AdGuard Home DNS IP     (default: 10.10.10.3)"
      echo "  --gateway  Default gateway IP      (default: auto-detected)"
      echo "  --role     Node role: master|worker (default: worker)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Symbols ───────────────────────────────────────────────────────────────────
PASS="[PASS]"
WARN="[WARN]"
FAIL="[FAIL]"
INFO="[INFO]"

# ── Counters ──────────────────────────────────────────────────────────────────
PASSES=0
WARNS=0
FAILS=0

pass() {
  echo "  $PASS $1"
  PASSES=$((PASSES + 1))
}

warn() {
  echo "  $WARN $1"
  WARNS=$((WARNS + 1))
}

fail() {
  echo "  $FAIL $1"
  FAILS=$((FAILS + 1))
}

info() {
  echo "  $INFO $1"
}

# ── Detect network ────────────────────────────────────────────────────────────
detect_network() {
  PRIMARY_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
  PRIMARY_IP=$(ip addr show "$PRIMARY_IFACE" 2>/dev/null \
    | grep 'inet ' | awk '{print $2}' | head -1)
  DETECTED_GW=$(ip route | grep default | awk '{print $3}' | head -1)
  GATEWAY_IP="${GATEWAY_IP:-$DETECTED_GW}"
}

# ── Detect OS ─────────────────────────────────────────────────────────────────
detect_os() {
  if [ -f /etc/os-release ]; then
    OS_NAME=$(. /etc/os-release && echo "$PRETTY_NAME")
    OS_ID=$(. /etc/os-release && echo "$ID")
  elif [ -f /etc/alpine-release ]; then
    OS_NAME="Alpine Linux $(cat /etc/alpine-release)"
    OS_ID="alpine"
  else
    OS_NAME="Unknown"
    OS_ID="unknown"
  fi
}

detect_network
detect_os

# =============================================================================
# HEADER
# =============================================================================
echo ""
echo "============================================================"
echo "  HomeLab -- K3s Node Pre-Check"
echo "  Role   : $NODE_ROLE"
echo "  Host   : $(hostname)"
echo "  OS     : $OS_NAME"
echo "  Date   : $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# =============================================================================
# SECTION 1 -- HOST IDENTITY
# =============================================================================
echo ""
echo "[ HOST IDENTITY ]"
info "Hostname  : $(hostname)"
info "Kernel    : $(uname -r)"
info "Uptime    : $(uptime -p 2>/dev/null || uptime)"

HN=$(hostname)
if echo "$HN" | grep -qE '^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$'; then
  pass "Hostname format valid for K3s: $HN"
else
  warn "Hostname '$HN' may cause issues -- K3s requires lowercase RFC 1123 hostname"
fi

if getent hosts "$(hostname)" &>/dev/null; then
  HOSTS_IP=$(getent hosts "$(hostname)" | awk '{print $1}' | head -1)
  pass "Hostname resolves to: $HOSTS_IP"
else
  warn "Hostname not in /etc/hosts -- add: $PRIMARY_IP $(hostname)"
fi

# =============================================================================
# SECTION 2 -- NETWORK
# =============================================================================
echo ""
echo "[ NETWORK ]"
info "Interface : $PRIMARY_IFACE"
info "IP/CIDR   : $PRIMARY_IP"
info "Gateway   : $GATEWAY_IP"
info "AdGuard   : $ADGUARD_IP"

if echo "$PRIMARY_IP" | grep -qE '^10\.10\.'; then
  pass "IP in lab VLAN range (10.10.x.x): $PRIMARY_IP"
else
  warn "IP not in lab VLAN range -- got: $PRIMARY_IP"
fi

if ping -c 1 -W 2 "$GATEWAY_IP" &>/dev/null; then
  pass "Gateway reachable: $GATEWAY_IP"
else
  fail "Gateway unreachable: $GATEWAY_IP"
fi

if ping -c 1 -W 2 "$ADGUARD_IP" &>/dev/null; then
  pass "AdGuard DNS reachable: $ADGUARD_IP"
else
  warn "AdGuard DNS unreachable: $ADGUARD_IP"
fi

if command -v nslookup &>/dev/null; then
  DNS_RESULT=$(nslookup google.com "$ADGUARD_IP" 2>/dev/null | grep "Address" | tail -1)
elif command -v dig &>/dev/null; then
  DNS_RESULT=$(dig +short google.com "@$ADGUARD_IP" 2>/dev/null | head -1)
else
  DNS_RESULT=""
fi

if [ -n "$DNS_RESULT" ]; then
  pass "DNS resolution via AdGuard OK: $DNS_RESULT"
else
  warn "DNS resolution via AdGuard failed"
fi

if ping -c 1 -W 3 8.8.8.8 &>/dev/null; then
  pass "Internet reachable (8.8.8.8)"
else
  fail "Internet unreachable -- K3s install requires internet"
fi

# =============================================================================
# SECTION 3 -- CPU
# =============================================================================
echo ""
echo "[ CPU ]"
CORES=$(nproc)
CPU_MODEL=$(grep -m1 "model name" /proc/cpuinfo 2>/dev/null \
  | cut -d: -f2 | xargs || echo "Unknown")
CPU_ARCH=$(uname -m)

info "Model : $CPU_MODEL"
info "Arch  : $CPU_ARCH"
info "Cores : $CORES"

if [ "$CPU_ARCH" = "x86_64" ] || [ "$CPU_ARCH" = "aarch64" ]; then
  pass "Architecture supported by K3s: $CPU_ARCH"
else
  fail "Architecture may not be supported: $CPU_ARCH"
fi

if [ "$CORES" -ge 2 ]; then
  pass "CPU cores meet K3s minimum (2): $CORES cores"
else
  warn "Only $CORES core(s) -- K3s recommends at least 2"
fi

if [ "$NODE_ROLE" = "master" ] && [ "$CORES" -lt 4 ]; then
  warn "Master node benefits from 4+ cores -- got $CORES"
fi

# =============================================================================
# SECTION 4 -- MEMORY
# =============================================================================
echo ""
echo "[ MEMORY ]"
TOTAL_MB=$(free -m | awk '/^Mem:/{print $2}')
AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')

info "Total     : ${TOTAL_MB}MB"
info "Available : ${AVAIL_MB}MB"
info "Swap      : ${SWAP_MB}MB"

MIN_RAM=1800
[ "$NODE_ROLE" = "master" ] && MIN_RAM=2048

if [ "$TOTAL_MB" -ge "$MIN_RAM" ]; then
  pass "RAM meets K3s minimum for $NODE_ROLE (${MIN_RAM}MB): ${TOTAL_MB}MB"
else
  fail "Insufficient RAM for $NODE_ROLE -- need ${MIN_RAM}MB, got ${TOTAL_MB}MB"
fi

if [ "$AVAIL_MB" -ge 512 ]; then
  pass "Available RAM sufficient (>512MB): ${AVAIL_MB}MB"
else
  warn "Low available RAM: ${AVAIL_MB}MB"
fi

if [ "$SWAP_MB" -eq 0 ]; then
  pass "Swap disabled -- recommended for K3s"
else
  warn "Swap enabled (${SWAP_MB}MB) -- disable: sudo swapoff -a"
fi

# =============================================================================
# SECTION 5 -- DISK
# =============================================================================
echo ""
echo "[ DISK ]"
ROOT_AVAIL_GB=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
ROOT_TOTAL_GB=$(df -BG / | awk 'NR==2{gsub("G","",$2); print $2}')
ROOT_USE_PCT=$(df / | awk 'NR==2{print $5}')

info "Root total     : ${ROOT_TOTAL_GB}GB"
info "Root available : ${ROOT_AVAIL_GB}GB (${ROOT_USE_PCT} used)"

df -h / | awk 'NR==1{print "  "$0} NR==2{print "  "$0}'

MIN_DISK=10
[ "$NODE_ROLE" = "master" ] && MIN_DISK=15

if [ "$ROOT_AVAIL_GB" -ge "$MIN_DISK" ]; then
  pass "Disk meets K3s minimum for $NODE_ROLE (${MIN_DISK}GB): ${ROOT_AVAIL_GB}GB free"
else
  fail "Insufficient disk for $NODE_ROLE -- need ${MIN_DISK}GB free, got ${ROOT_AVAIL_GB}GB"
fi

USE_NUM=${ROOT_USE_PCT/\%/}
if [ "$USE_NUM" -ge 80 ]; then
  warn "Disk usage high (${ROOT_USE_PCT}) -- consider cleanup"
fi

if [ -d "/var/lib/rancher" ]; then
  RANCHER_SIZE=$(du -sh "/var/lib/rancher" 2>/dev/null | cut -f1)
  warn "K3s data dir exists: /var/lib/rancher ($RANCHER_SIZE) -- previous install?"
else
  pass "K3s data dir clean: /var/lib/rancher not present"
fi

# =============================================================================
# SECTION 6 -- K3s PRE-REQUISITES
# =============================================================================
echo ""
echo "[ K3s PRE-REQUISITES ]"

if command -v curl &>/dev/null; then
  pass "curl available: $(curl --version 2>/dev/null | head -1 | cut -d' ' -f1-2)"
else
  fail "curl not installed -- run: sudo dnf install -y curl"
fi

if command -v systemctl &>/dev/null; then
  pass "systemd available: $(systemctl --version 2>/dev/null | head -1)"
else
  fail "systemd not found -- K3s requires systemd"
fi

if command -v getenforce &>/dev/null; then
  SELINUX_MODE=$(getenforce)
  info "SELinux: $SELINUX_MODE"
  if [ "$SELINUX_MODE" = "Enforcing" ]; then
    if rpm -q k3s-selinux &>/dev/null; then
      pass "SELinux Enforcing + k3s-selinux installed: $(rpm -q k3s-selinux)"
    else
      warn "SELinux Enforcing -- k3s-selinux not installed. Run: dnf install -y https://github.com/k3s-io/k3s-selinux/releases/download/v1.6.latest.1/k3s-selinux-1.6-1.el9.noarch.rpm"
    fi
  else
    pass "SELinux $SELINUX_MODE -- K3s compatible"
  fi
else
  pass "SELinux not present -- K3s compatible"
fi

if systemctl is-active --quiet firewalld 2>/dev/null; then
  REQUIRED_PORTS="6443/tcp 10250/tcp 8472/udp 51820/udp"
  OPEN_PORTS=$(firewall-cmd --list-ports --permanent 2>/dev/null)
  MISSING_PORTS=""
  for PORT in $REQUIRED_PORTS; do
    echo "$OPEN_PORTS" | grep -q "$PORT" || MISSING_PORTS="$MISSING_PORTS $PORT"
  done
  if [ -z "$MISSING_PORTS" ]; then
    pass "firewalld active + all K3s ports open: $REQUIRED_PORTS"
  else
    warn "firewalld active -- missing ports:$MISSING_PORTS. Run: sudo firewall-cmd --permanent --add-port=PORT && sudo firewall-cmd --reload"
  fi
else
  pass "firewalld not running -- no port config needed"
fi

if lsmod | grep -q br_netfilter 2>/dev/null; then
  pass "br_netfilter module loaded"
else
  warn "br_netfilter not loaded -- K3s loads it automatically"
fi

if lsmod | grep -q "^overlay" 2>/dev/null; then
  pass "overlay module loaded"
else
  warn "overlay not loaded -- K3s loads it automatically"
fi

IP_FWD=$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)
if [ "$IP_FWD" = "1" ]; then
  pass "IP forwarding enabled"
else
  warn "IP forwarding disabled -- K3s enables it, or: sudo sysctl -w net.ipv4.ip_forward=1"
fi

if timedatectl status 2>/dev/null | grep -q "System clock synchronized: yes"; then
  pass "Time synchronized (NTP active)"
else
  warn "Time not synchronized -- run: sudo timedatectl set-ntp true"
fi

if systemctl is-active --quiet nm-cloud-setup 2>/dev/null; then
  warn "nm-cloud-setup active -- may conflict with K3s CNI. Disable: sudo systemctl disable nm-cloud-setup nm-cloud-setup.timer"
else
  pass "nm-cloud-setup not active -- no CNI conflict"
fi

# =============================================================================
# SECTION 7 -- EXISTING K3s
# =============================================================================
echo ""
echo "[ EXISTING K3s ]"

if command -v k3s &>/dev/null; then
  K3S_VER=$(k3s --version 2>/dev/null | head -1)
  warn "K3s already installed: $K3S_VER"
  if systemctl is-active --quiet k3s 2>/dev/null; then
    warn "k3s service running -- stop before reinstall: sudo systemctl stop k3s"
  elif systemctl is-active --quiet k3s-agent 2>/dev/null; then
    warn "k3s-agent running -- stop before reinstall: sudo systemctl stop k3s-agent"
  else
    info "K3s binary present but service stopped"
  fi
else
  pass "No existing K3s -- clean node"
fi

if [ -d "/etc/cni/net.d" ] && [ "$(ls -A /etc/cni/net.d 2>/dev/null)" ]; then
  warn "CNI config dir not empty: /etc/cni/net.d -- leftover from previous install?"
else
  pass "CNI config dir clean"
fi

# =============================================================================
# SECTION 8 -- ROLE-SPECIFIC CHECKS
# =============================================================================
echo ""
echo "[ ROLE: $(echo "$NODE_ROLE" | tr '[:lower:]' '[:upper:]') ]"

if [ "$NODE_ROLE" = "master" ]; then
  info "This node will be the K3s control-plane (server)"
  info "Install: curl -sfL https://get.k3s.io | sh -"

  DISK_ROTATIONAL=""
  ROOT_DEV=$(findmnt -n -o SOURCE / 2>/dev/null | head -1)
  PARENT_DEV=$(lsblk -no pkname "$ROOT_DEV" 2>/dev/null | head -1)
  if [ -n "$PARENT_DEV" ]; then
    DISK_ROTATIONAL=$(cat "/sys/block/$PARENT_DEV/queue/rotational" 2>/dev/null)
  fi

  if [ "$DISK_ROTATIONAL" = "0" ]; then
    pass "Root disk is SSD/NVMe -- ideal for etcd"
  elif [ "$DISK_ROTATIONAL" = "1" ]; then
    warn "Root disk is HDD -- etcd may be slow, SSD strongly recommended"
  else
    info "Could not detect disk type"
  fi

  if ss -tlnp 2>/dev/null | grep -q ':6443'; then
    warn "Port 6443 already in use -- K3s API server needs this port"
  else
    pass "Port 6443 available for K3s API server"
  fi

elif [ "$NODE_ROLE" = "worker" ]; then
  info "This node will be a K3s agent (worker)"
  info "Install: curl -sfL https://get.k3s.io | K3S_URL=https://MASTER_IP:6443 K3S_TOKEN=TOKEN sh -"

  if ss -tlnp 2>/dev/null | grep -q ':10250'; then
    warn "Port 10250 already in use -- K3s kubelet needs this port"
  else
    pass "Port 10250 available for K3s kubelet"
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "============================================================"
echo "  SUMMARY -- $(hostname) | $NODE_ROLE"
echo "============================================================"
echo "  IP       : $PRIMARY_IP"
echo "  Gateway  : $GATEWAY_IP"
echo "  AdGuard  : $ADGUARD_IP"
echo "  OS       : $OS_NAME"
echo "  CPU      : $CORES cores ($CPU_ARCH)"
echo "  RAM      : ${TOTAL_MB}MB total / ${AVAIL_MB}MB available"
echo "  Disk     : ${ROOT_AVAIL_GB}GB free on /"
echo ""
echo "  Results  : $PASSES passed | $WARNS warnings | $FAILS failed"
echo ""

if [ "$FAILS" -gt 0 ]; then
  echo "  STATUS: [FAIL] NOT READY -- fix $FAILS check(s) before installing K3s"
  EXIT_CODE=2
elif [ "$WARNS" -gt 0 ]; then
  echo "  STATUS: [WARN] READY WITH WARNINGS -- review $WARNS warning(s) above"
  EXIT_CODE=1
else
  echo "  STATUS: [PASS] READY -- node is ready for K3s installation"
  EXIT_CODE=0
fi

echo "============================================================"
echo ""
exit $EXIT_CODE
