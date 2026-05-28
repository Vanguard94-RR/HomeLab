#!/bin/bash
# =============================================================================
# HomeLab — K3s Node Pre-Check Script
# Version : 1.1
# Usage   : ./homelab-k3s-precheck.sh [--adguard IP] [--gateway IP] [--role master|worker]
# Example : ./homelab-k3s-precheck.sh --adguard 10.10.10.3 --role master
# Idempotent: safe to run multiple times, makes no changes to the system
# =============================================================================

# ── Defaults (override via flags) ────────────────────────────────────────────
ADGUARD_IP="10.10.10.3"
GATEWAY_IP=""
NODE_ROLE="worker"

# ── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --adguard)  ADGUARD_IP="$2";  shift 2 ;;
    --gateway)  GATEWAY_IP="$2";  shift 2 ;;
    --role)     NODE_ROLE="$2";   shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--adguard IP] [--gateway IP] [--role master|worker]"
      echo "  --adguard  IP of AdGuard Home DNS server (default: 10.10.10.3)"
      echo "  --gateway  IP of default gateway (default: auto-detected)"
      echo "  --role     Node role: master or worker (default: worker)"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Symbols ──────────────────────────────────────────────────────────────────
PASS="[PASS]"
WARN="[WARN]"
FAIL="[FAIL]"
INFO="[INFO]"

# ── Counters ─────────────────────────────────────────────────────────────────
PASSES=0
WARNS=0
FAILS=0

pass() { echo "  $PASS $1"; ((PASSES++)); }
warn() { echo "  $WARN $1"; ((WARNS++)); }
fail() { echo "  $FAIL $1"; ((FAILS++)); }
info() { echo "  $INFO $1"; }

# ── Helper: detect primary interface and IP ───────────────────────────────────
detect_network() {
  PRIMARY_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
  PRIMARY_IP=$(ip addr show "$PRIMARY_IFACE" 2>/dev/null \
    | grep 'inet ' | awk '{print $2}' | head -1)
  DETECTED_GW=$(ip route | grep default | awk '{print $3}' | head -1)
  # Use provided gateway or fall back to detected
  GATEWAY_IP="${GATEWAY_IP:-$DETECTED_GW}"
}

# ── Helper: detect OS ─────────────────────────────────────────────────────────
detect_os() {
  if [ -f /etc/os-release ]; then
    OS_NAME=$(. /etc/os-release && echo "$PRETTY_NAME")
    OS_ID=$(. /etc/os-release && echo "$ID")
  elif [ -f /etc/fedora-release ]; then
    OS_NAME=$(cat /etc/fedora-release)
    OS_ID="fedora"
  elif [ -f /etc/alpine-release ]; then
    OS_NAME="Alpine Linux $(cat /etc/alpine-release)"
    OS_ID="alpine"
  else
    OS_NAME="Unknown"
    OS_ID="unknown"
  fi
}

# =============================================================================
# HEADER
# =============================================================================
detect_network
detect_os

echo ""
echo "============================================================"
echo "  HomeLab — K3s Node Pre-Check"
echo "  Role   : $NODE_ROLE"
echo "  Host   : $(hostname)"
echo "  OS     : $OS_NAME"
echo "  Date   : $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# =============================================================================
# SECTION 1 — HOST IDENTITY
# =============================================================================
echo ""
echo "[ HOST IDENTITY ]"
info "Hostname  : $(hostname)"
info "Kernel    : $(uname -r)"
info "Uptime    : $(uptime -p 2>/dev/null || uptime)"
info "OS        : $OS_NAME"
info "OS ID     : $OS_ID"

# Hostname must be lowercase, no dots at start
HN=$(hostname)
if [[ "$HN" =~ ^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$ ]]; then
  pass "Hostname format is valid for K3s: $HN"
else
  warn "Hostname '$HN' may cause issues — K3s requires lowercase RFC 1123 hostname"
fi

# /etc/hosts entry
if getent hosts "$(hostname)" &>/dev/null; then
  HOSTS_IP=$(getent hosts "$(hostname)" | awk '{print $1}' | head -1)
  pass "Hostname resolves to $HOSTS_IP"
else
  warn "Hostname not in /etc/hosts — add: $PRIMARY_IP $(hostname)"
fi

# =============================================================================
# SECTION 2 — NETWORK
# =============================================================================
echo ""
echo "[ NETWORK ]"
info "Interface : $PRIMARY_IFACE"
info "IP/CIDR   : $PRIMARY_IP"
info "Gateway   : $GATEWAY_IP"
info "AdGuard   : $ADGUARD_IP"

# IP must be in expected range for lab
if [[ "$PRIMARY_IP" == 10.10.*.* ]]; then
  pass "IP in lab range (10.10.x.x): $PRIMARY_IP"
else
  warn "IP not in lab VLAN range (10.10.x.x) — got: $PRIMARY_IP"
fi

# Gateway reachability
if ping -c 1 -W 2 "$GATEWAY_IP" &>/dev/null; then
  pass "Gateway reachable: $GATEWAY_IP"
else
  fail "Gateway unreachable: $GATEWAY_IP"
fi

# AdGuard reachability
if ping -c 1 -W 2 "$ADGUARD_IP" &>/dev/null; then
  pass "AdGuard DNS reachable: $ADGUARD_IP"
else
  warn "AdGuard DNS unreachable: $ADGUARD_IP — DNS resolution may fail"
fi

# DNS resolution
if command -v nslookup &>/dev/null; then
  DNS_RESULT=$(nslookup google.com "$ADGUARD_IP" 2>/dev/null | grep "Address" | tail -1)
  if [ -n "$DNS_RESULT" ]; then
    pass "DNS resolution via AdGuard: $DNS_RESULT"
  else
    warn "DNS resolution via AdGuard failed — check AdGuard status"
  fi
else
  DNS_RESULT=$(dig +short google.com @"$ADGUARD_IP" 2>/dev/null | head -1)
  if [ -n "$DNS_RESULT" ]; then
    pass "DNS resolution via AdGuard: $DNS_RESULT"
  else
    warn "nslookup/dig not available or DNS failed"
  fi
fi

# Internet connectivity
if ping -c 1 -W 3 8.8.8.8 &>/dev/null; then
  pass "Internet reachable (8.8.8.8)"
else
  fail "Internet unreachable — K3s install script requires internet access"
fi

# K3s API server port (6443) — only relevant for workers connecting to master
if [ "$NODE_ROLE" = "worker" ] && [ -n "$MASTER_IP" ]; then
  if timeout 2 bash -c "cat < /dev/null > /dev/tcp/$MASTER_IP/6443" &>/dev/null; then
    pass "Master API port 6443 reachable: $MASTER_IP"
  else
    warn "Master API port 6443 not reachable — expected if master K3s not yet installed"
  fi
fi

# =============================================================================
# SECTION 3 — CPU
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

# Architecture check
if [[ "$CPU_ARCH" == "x86_64" ]] || [[ "$CPU_ARCH" == "aarch64" ]]; then
  pass "Architecture supported by K3s: $CPU_ARCH"
else
  fail "Architecture may not be supported by K3s: $CPU_ARCH"
fi

# Core count
if [ "$CORES" -ge 2 ]; then
  pass "CPU cores meet K3s minimum (2): $CORES cores"
else
  warn "Only $CORES core(s) — K3s recommends at least 2 for production"
fi

# Master needs more cores
if [ "$NODE_ROLE" = "master" ] && [ "$CORES" -lt 4 ]; then
  warn "Master node benefits from 4+ cores — got $CORES (usable but limited)"
fi

# =============================================================================
# SECTION 4 — MEMORY
# =============================================================================
echo ""
echo "[ MEMORY ]"
TOTAL_MB=$(free -m | awk '/^Mem:/{print $2}')
AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')

info "Total     : ${TOTAL_MB}MB"
info "Available : ${AVAIL_MB}MB"
info "Swap      : ${SWAP_MB}MB"

# RAM minimum
MIN_RAM=1800
[ "$NODE_ROLE" = "master" ] && MIN_RAM=2048
if [ "$TOTAL_MB" -ge "$MIN_RAM" ]; then
  pass "RAM meets K3s minimum for $NODE_ROLE (${MIN_RAM}MB): ${TOTAL_MB}MB"
else
  fail "Insufficient RAM for $NODE_ROLE — need ${MIN_RAM}MB, got ${TOTAL_MB}MB"
fi

# Available RAM
if [ "$AVAIL_MB" -ge 512 ]; then
  pass "Available RAM sufficient (>512MB): ${AVAIL_MB}MB"
else
  warn "Low available RAM: ${AVAIL_MB}MB — close other processes before installing K3s"
fi

# Swap
if [ "$SWAP_MB" -eq 0 ]; then
  pass "Swap is disabled — recommended for K3s"
else
  warn "Swap enabled (${SWAP_MB}MB) — K3s recommends disabling: sudo swapoff -a"
fi

# =============================================================================
# SECTION 5 — DISK
# =============================================================================
echo ""
echo "[ DISK ]"
ROOT_AVAIL_GB=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
ROOT_TOTAL_GB=$(df -BG / | awk 'NR==2{gsub("G","",$2); print $2}')
ROOT_USE_PCT=$(df / | awk 'NR==2{print $5}')

info "Root total     : ${ROOT_TOTAL_GB}GB"
info "Root available : ${ROOT_AVAIL_GB}GB (${ROOT_USE_PCT} used)"

df -h / | awk 'NR==1{print "  "$0} NR==2{print "  "$0}'

# Disk minimum
MIN_DISK=10
[ "$NODE_ROLE" = "master" ] && MIN_DISK=15
if [ "$ROOT_AVAIL_GB" -ge "$MIN_DISK" ]; then
  pass "Disk space meets K3s minimum for $NODE_ROLE (${MIN_DISK}GB): ${ROOT_AVAIL_GB}GB available"
else
  fail "Insufficient disk for $NODE_ROLE — need ${MIN_DISK}GB free, got ${ROOT_AVAIL_GB}GB"
fi

# Warn if >80% used
USE_NUM=${ROOT_USE_PCT/\%/}
if [ "$USE_NUM" -ge 80 ]; then
  warn "Disk usage is high (${ROOT_USE_PCT}) — consider cleanup before K3s install"
fi

# Check /var/lib/rancher (K3s data dir)
RANCHER_DIR="/var/lib/rancher"
if [ -d "$RANCHER_DIR" ]; then
  RANCHER_SIZE=$(du -sh "$RANCHER_DIR" 2>/dev/null | cut -f1)
  warn "K3s data dir already exists: $RANCHER_DIR ($RANCHER_SIZE) — previous install?"
else
  pass "K3s data dir clean: $RANCHER_DIR does not exist"
fi

# =============================================================================
# SECTION 6 — K3s PRE-REQUISITES
# =============================================================================
echo ""
echo "[ K3s PRE-REQUISITES ]"

# curl (required for install script)
if command -v curl &>/dev/null; then
  pass "curl available: $(curl --version 2>/dev/null | head -1 | cut -d' ' -f1-2)"
else
  fail "curl not installed — required for K3s install script (sudo dnf install curl)"
fi

# systemd
if command -v systemctl &>/dev/null; then
  SYSTEMD_VER=$(systemctl --version 2>/dev/null | head -1)
  pass "systemd available: $SYSTEMD_VER"
else
  fail "systemd not found — K3s requires systemd"
fi

# SELinux
if command -v getenforce &>/dev/null; then
  SELINUX_MODE=$(getenforce)
  info "SELinux: $SELINUX_MODE"
  if [ "$SELINUX_MODE" = "Enforcing" ]; then
    warn "SELinux Enforcing — install k3s-selinux policy first: sudo dnf install -y container-selinux selinux-policy-base; sudo dnf install -y https://rpm.rancher.io/k3s/latest/common/centos/8/noarch/k3s-selinux-*.rpm"
  elif [ "$SELINUX_MODE" = "Permissive" ]; then
    pass "SELinux Permissive — K3s compatible"
  else
    pass "SELinux Disabled — K3s compatible"
  fi
else
  pass "SELinux not present — K3s compatible"
fi

# firewalld
if systemctl is-active --quiet firewalld 2>/dev/null; then
  warn "firewalld is running — K3s requires ports: 6443/tcp 10250/tcp 8472/udp 51820/udp"
  info "Run: sudo firewall-cmd --permanent --add-port=6443/tcp --add-port=10250/tcp --add-port=8472/udp && sudo firewall-cmd --reload"
else
  pass "firewalld not running — no port configuration needed"
fi

# iptables / nftables
if command -v iptables &>/dev/null; then
  pass "iptables available: $(iptables --version 2>/dev/null)"
else
  warn "iptables not found — K3s may install its own"
fi

# NetworkManager
if systemctl is-active --quiet NetworkManager 2>/dev/null; then
  NM_VER=$(NetworkManager --version 2>/dev/null)
  pass "NetworkManager active: $NM_VER"
  # Check nm-cloud-setup (can interfere with K3s)
  if systemctl is-active --quiet nm-cloud-setup 2>/dev/null; then
    warn "nm-cloud-setup is active — may conflict with K3s CNI. Disable: sudo systemctl disable nm-cloud-setup nm-cloud-setup.timer"
  fi
else
  info "NetworkManager not active — using other network management"
fi

# br_netfilter module (required for K3s networking)
if lsmod | grep -q br_netfilter 2>/dev/null; then
  pass "br_netfilter module loaded"
else
  warn "br_netfilter not loaded — K3s will load it automatically, but you can pre-load: sudo modprobe br_netfilter"
fi

# overlay module (required for container storage)
if lsmod | grep -q overlay 2>/dev/null; then
  pass "overlay module loaded"
else
  warn "overlay module not loaded — K3s will load it automatically"
fi

# ip_forward
IP_FORWARD=$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)
if [ "$IP_FORWARD" = "1" ]; then
  pass "IP forwarding enabled"
else
  warn "IP forwarding disabled — K3s will enable it, or run: sudo sysctl -w net.ipv4.ip_forward=1"
fi

# Time sync
if timedatectl status 2>/dev/null | grep -q "System clock synchronized: yes"; then
  TIMESERVER=$(timedatectl show-timesync --property=ServerName --value 2>/dev/null || echo "unknown")
  pass "Time synchronized (NTP server: $TIMESERVER)"
else
  warn "Time not synchronized — clock drift can cause etcd/TLS issues. Run: sudo timedatectl set-ntp true"
fi

# =============================================================================
# SECTION 7 — EXISTING K3s
# =============================================================================
echo ""
echo "[ EXISTING K3s ]"

if command -v k3s &>/dev/null; then
  K3S_VER=$(k3s --version 2>/dev/null | head -1)
  warn "K3s binary already installed: $K3S_VER"
  if systemctl is-active --quiet k3s 2>/dev/null; then
    warn "k3s service is running — stop before reinstalling: sudo systemctl stop k3s"
  elif systemctl is-active --quiet k3s-agent 2>/dev/null; then
    warn "k3s-agent service is running — stop before reinstalling: sudo systemctl stop k3s-agent"
  else
    info "k3s service not running — binary exists but service stopped"
  fi
else
  pass "No existing K3s installation — clean node"
fi

# Check for leftover CNI configs
if [ -d "/etc/cni/net.d" ] && [ "$(ls -A /etc/cni/net.d 2>/dev/null)" ]; then
  warn "CNI config directory not empty: /etc/cni/net.d — leftover from previous install?"
else
  pass "CNI config directory clean"
fi

# Check for leftover flannel/containerd
if [ -d "/var/lib/rancher" ]; then
  warn "Rancher data dir exists: /var/lib/rancher — previous K3s data present"
fi

# =============================================================================
# SECTION 8 — ROLE-SPECIFIC CHECKS
# =============================================================================
echo ""
echo "[ ROLE: $(echo $NODE_ROLE | tr '[:lower:]' '[:upper:]') ]"

if [ "$NODE_ROLE" = "master" ]; then
  info "This node will be the K3s control-plane (server)"
  info "Install command will be: curl -sfL https://get.k3s.io | sh -"

  # etcd needs fast disk
  DISK_TYPE=$(cat /sys/block/$(lsblk -no pkname $(findmnt -n -o SOURCE /) | head -1)/queue/rotational 2>/dev/null)
  if [ "$DISK_TYPE" = "0" ]; then
    pass "Root disk is SSD/NVMe — ideal for etcd"
  elif [ "$DISK_TYPE" = "1" ]; then
    warn "Root disk is HDD (rotational) — etcd may be slow, timeouts possible. SSD strongly recommended."
  else
    info "Could not detect disk type"
  fi

  # Port 6443 must be free
  if ss -tlnp 2>/dev/null | grep -q ':6443'; then
    warn "Port 6443 already in use — K3s API server needs this port"
  else
    pass "Port 6443 available for K3s API server"
  fi

elif [ "$NODE_ROLE" = "worker" ]; then
  info "This node will be a K3s agent (worker)"
  info "Install command will be: curl -sfL https://get.k3s.io | K3S_URL=https://MASTER_IP:6443 K3S_TOKEN=TOKEN sh -"

  # Port 10250 must be free (kubelet)
  if ss -tlnp 2>/dev/null | grep -q ':10250'; then
    warn "Port 10250 already in use — K3s kubelet needs this port"
  else
    pass "Port 10250 available for K3s kubelet"
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "============================================================"
echo "  SUMMARY — $(hostname) · $NODE_ROLE"
echo "============================================================"
echo "  IP       : $PRIMARY_IP"
echo "  Gateway  : $GATEWAY_IP"
echo "  AdGuard  : $ADGUARD_IP"
echo "  OS       : $OS_NAME"
echo "  CPU      : $CORES cores"
echo "  RAM      : ${TOTAL_MB}MB total / ${AVAIL_MB}MB available"
echo "  Disk     : ${ROOT_AVAIL_GB}GB available on /"
echo ""
echo "  Results  : $PASSES passed · $WARNS warnings · $FAILS failed"
echo ""

if [ "$FAILS" -gt 0 ]; then
  echo "  STATUS: ❌ NOT READY — fix $FAILS failing check(s) before installing K3s"
  EXIT_CODE=2
elif [ "$WARNS" -gt 0 ]; then
  echo "  STATUS: ⚠️  READY WITH WARNINGS — review $WARNS warning(s) above"
  EXIT_CODE=1
else
  echo "  STATUS: ✅ READY — node is ready for K3s installation"
  EXIT_CODE=0
fi

echo "============================================================"
echo ""
exit $EXIT_CODE
