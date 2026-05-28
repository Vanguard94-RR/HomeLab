#!/bin/bash
# =============================================================================
# HomeLab — K3s Node Pre-Fix Script
# Version : 1.2 (final)
# Usage   : ./homelab-k3s-prefix.sh [--role master|worker] [--hostname NAME] [--dry-run]
# Example : ./homelab-k3s-prefix.sh --role master --hostname t440p-server
# Idempotent: safe to run multiple times, only applies missing fixes
# Verified : Fedora 42 · t440p-server (master) · t430 (worker) · May 2026
# =============================================================================

# ── Defaults ──────────────────────────────────────────────────────────────────
NODE_ROLE="worker"
NEW_HOSTNAME=""
DRY_RUN=0

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --role)     NODE_ROLE="$2";     shift 2 ;;
    --hostname) NEW_HOSTNAME="$2";  shift 2 ;;
    --dry-run)  DRY_RUN=1;          shift ;;
    --help|-h)
      echo "Usage: $0 [--role master|worker] [--hostname NAME] [--dry-run]"
      echo "  --role      Node role: master or worker (default: worker)"
      echo "  --hostname  New lowercase hostname (default: lowercase of current)"
      echo "  --dry-run   Show what would be done without applying changes"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
APPLIED=0
SKIPPED=0
FAILED=0

run() {
  local DESC="$1"; shift
  if [ "$DRY_RUN" = "1" ]; then
    echo "  [DRY-RUN] $DESC"
    echo "            cmd: $*"
    return 0
  fi
  echo "  [RUN] $DESC"
  if "$@"; then
    APPLIED=$((APPLIED + 1))
    return 0
  else
    echo "  [FAIL] Command failed: $*"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

skip() {
  echo "  [SKIP] $1 -- already configured"
  SKIPPED=$((SKIPPED + 1))
}

info() {
  echo "  [INFO] $1"
}

need_root() {
  if [ "$EUID" -ne 0 ]; then
    echo ""
    echo "  [FAIL] This script must be run as root or with sudo"
    echo "         Run: sudo $0 $*"
    exit 1
  fi
}

need_root "$@"

# =============================================================================
# HEADER
# =============================================================================
CURRENT_HOSTNAME=$(hostname)
NEW_HOSTNAME="${NEW_HOSTNAME:-$(echo "$CURRENT_HOSTNAME" | tr '[:upper:]' '[:lower:]')}"

echo ""
echo "============================================================"
echo "  HomeLab -- K3s Node Pre-Fix"
echo "  Role       : $NODE_ROLE"
echo "  Current HN : $CURRENT_HOSTNAME"
echo "  Target HN  : $NEW_HOSTNAME"
echo "  Dry run    : $( [ "$DRY_RUN" = "1" ] && echo "YES -- no changes will be made" || echo "NO -- changes will be applied")"
echo "============================================================"

# =============================================================================
# FIX 1 — HOSTNAME
# =============================================================================
echo ""
echo "[ FIX 1 -- HOSTNAME ]"

if [ "$CURRENT_HOSTNAME" = "$NEW_HOSTNAME" ]; then
  skip "Hostname already correct: $NEW_HOSTNAME"
else
  run "Set hostname to $NEW_HOSTNAME" hostnamectl set-hostname "$NEW_HOSTNAME"
fi

# Ensure hostname is in /etc/hosts
PRIMARY_IP=$(ip route | grep default | awk '{print $5}' | head -1 | \
  xargs -I{} ip addr show {} 2>/dev/null | grep 'inet ' | awk '{print $2}' | \
  cut -d/ -f1 | head -1)

if grep -q "$NEW_HOSTNAME" /etc/hosts 2>/dev/null; then
  skip "/etc/hosts already has entry for $NEW_HOSTNAME"
else
  run "Add $NEW_HOSTNAME to /etc/hosts" bash -c \
    "echo '$PRIMARY_IP $NEW_HOSTNAME' >> /etc/hosts"
fi

# =============================================================================
# FIX 2 — SWAP
# =============================================================================
echo ""
echo "[ FIX 2 -- SWAP ]"

SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')

if [ "$SWAP_MB" -eq 0 ]; then
  skip "Swap already disabled"
else
  info "Swap currently: ${SWAP_MB}MB -- disabling"
  run "Disable swap immediately" swapoff -a
fi

# Remove swap entries from /etc/fstab (idempotent)
if grep -qE '^\s*[^#].*\sswap\s' /etc/fstab 2>/dev/null; then
  run "Remove swap from /etc/fstab" sed -i '/\bswap\b/s/^/#/' /etc/fstab
  info "Swap entries commented out in /etc/fstab"
else
  skip "No active swap entries in /etc/fstab"
fi

# Disable zram swap if present (common on Fedora)
if systemctl is-active --quiet zram-swap 2>/dev/null; then
  run "Disable zram-swap service" systemctl disable --now zram-swap
elif systemctl is-active --quiet systemd-zram-setup@zram0 2>/dev/null; then
  run "Disable systemd zram swap" systemctl disable --now systemd-zram-setup@zram0
else
  skip "zram swap service not active"
fi

# =============================================================================
# FIX 3 — SELinux K3s POLICY
# =============================================================================
echo ""
echo "[ FIX 3 -- SELinux K3s POLICY ]"

if ! command -v getenforce &>/dev/null; then
  skip "SELinux not present on this system"
else
  SELINUX_MODE=$(getenforce)
  info "SELinux mode: $SELINUX_MODE"

  if [ "$SELINUX_MODE" = "Disabled" ]; then
    skip "SELinux disabled -- no policy needed"
  else
    # Install container-selinux if missing
    if rpm -q container-selinux &>/dev/null; then
      skip "container-selinux already installed"
    else
      run "Install container-selinux" dnf install -y container-selinux
    fi

    # Install selinux-policy-base if missing
    if rpm -q selinux-policy-base &>/dev/null; then
      skip "selinux-policy-base already installed"
    else
      run "Install selinux-policy-base" dnf install -y selinux-policy-base
    fi

    # Install k3s-selinux policy
    if rpm -q k3s-selinux &>/dev/null; then
      skip "k3s-selinux policy already installed: $(rpm -q k3s-selinux)"
    else
      info "Installing k3s-selinux from GitHub releases (el9 — compatible with Fedora)"
      run "Download k3s-selinux RPM" curl -fsSL -o /tmp/k3s-selinux.rpm \
        "https://github.com/k3s-io/k3s-selinux/releases/download/v1.6.latest.1/k3s-selinux-1.6-1.el9.noarch.rpm"
      if [ -f /tmp/k3s-selinux.rpm ]; then
        run "Install k3s-selinux RPM" dnf install -y /tmp/k3s-selinux.rpm
        rm -f /tmp/k3s-selinux.rpm
      else
        echo "  [FAIL] RPM download failed"
        FAILED=$((FAILED + 1))
      fi
    fi
  fi
fi

# =============================================================================
# FIX 4 — FIREWALLD PORTS
# =============================================================================
echo ""
echo "[ FIX 4 -- FIREWALLD ]"

if ! systemctl is-active --quiet firewalld 2>/dev/null; then
  skip "firewalld not running -- no port configuration needed"
else
  info "firewalld is active -- configuring K3s ports"

  # Ports required for K3s
  # master: 6443 (API), 10250 (kubelet), 8472 (flannel VXLAN), 51820 (WireGuard)
  # worker: 10250 (kubelet), 8472 (flannel VXLAN), 51820 (WireGuard)

  declare -A PORTS
  PORTS["6443/tcp"]="K3s API server"
  PORTS["10250/tcp"]="K3s kubelet metrics"
  PORTS["8472/udp"]="Flannel VXLAN overlay"
  PORTS["51820/udp"]="WireGuard VPN (optional)"
  PORTS["2379/tcp"]="etcd client (master only)"
  PORTS["2380/tcp"]="etcd peer (master only)"

  for PORT_PROTO in "${!PORTS[@]}"; do
    DESC="${PORTS[$PORT_PROTO]}"
    # Skip etcd ports for worker nodes
    if [ "$NODE_ROLE" = "worker" ] && \
       { [ "$PORT_PROTO" = "2379/tcp" ] || [ "$PORT_PROTO" = "2380/tcp" ]; }; then
      info "Skipping $PORT_PROTO ($DESC) -- worker node"
      continue
    fi
    OPEN_PORTS=$(firewall-cmd --list-ports --permanent 2>/dev/null)
    if echo "$OPEN_PORTS" | grep -q "$PORT_PROTO"; then
      skip "Port $PORT_PROTO already open ($DESC)"
    else
      run "Open port $PORT_PROTO ($DESC)" \
        firewall-cmd --permanent --add-port="$PORT_PROTO"
    fi
  done

  # Allow pod-to-pod traffic (CNI)
  if firewall-cmd --list-all --permanent 2>/dev/null | grep -q "masquerade: yes"; then
    skip "Masquerade already enabled"
  else
    run "Enable masquerade for pod routing" firewall-cmd --permanent --add-masquerade
  fi

  # Reload firewalld to apply changes
  run "Reload firewalld" firewall-cmd --reload
fi

# =============================================================================
# FIX 5 — KERNEL MODULES (pre-load for faster K3s start)
# =============================================================================
echo ""
echo "[ FIX 5 -- KERNEL MODULES ]"

for MOD in br_netfilter overlay ip_conntrack; do
  if lsmod | grep -q "^$MOD" 2>/dev/null; then
    skip "Module $MOD already loaded"
  else
    run "Load kernel module: $MOD" modprobe "$MOD"
  fi
done

# Make modules persistent across reboots
MODULES_FILE="/etc/modules-load.d/k3s.conf"
if [ -f "$MODULES_FILE" ] && grep -q "br_netfilter" "$MODULES_FILE" 2>/dev/null; then
  skip "Kernel modules already configured for persistence: $MODULES_FILE"
else
  run "Persist kernel modules in $MODULES_FILE" bash -c \
    "printf 'br_netfilter\noverlay\nip_conntrack\n' > $MODULES_FILE"
fi

# =============================================================================
# FIX 6 — SYSCTL PARAMS
# =============================================================================
echo ""
echo "[ FIX 6 -- SYSCTL ]"

SYSCTL_FILE="/etc/sysctl.d/k3s.conf"

if [ -f "$SYSCTL_FILE" ] && grep -q "net.ipv4.ip_forward" "$SYSCTL_FILE" 2>/dev/null; then
  skip "K3s sysctl params already configured: $SYSCTL_FILE"
else
  run "Write K3s sysctl config to $SYSCTL_FILE" bash -c "cat > $SYSCTL_FILE << 'SYSCTL'
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
SYSCTL"
  run "Apply sysctl params" sysctl --system
fi

# Verify ip_forward
IP_FWD=$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)
if [ "$IP_FWD" = "1" ]; then
  skip "ip_forward already enabled: $IP_FWD"
else
  run "Enable ip_forward immediately" sysctl -w net.ipv4.ip_forward=1
fi

# =============================================================================
# FIX 7 — TIME SYNC
# =============================================================================
echo ""
echo "[ FIX 7 -- TIME SYNC ]"

if timedatectl status 2>/dev/null | grep -q "NTP service: active"; then
  skip "NTP already active"
else
  run "Enable NTP time sync" timedatectl set-ntp true
fi

if systemctl is-active --quiet chronyd 2>/dev/null; then
  skip "chronyd already running"
elif systemctl is-active --quiet systemd-timesyncd 2>/dev/null; then
  skip "systemd-timesyncd already running"
else
  info "No NTP daemon detected -- enabling systemd-timesyncd"
  run "Enable systemd-timesyncd" systemctl enable --now systemd-timesyncd
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "============================================================"
echo "  SUMMARY -- $(hostname) | $NODE_ROLE"
echo "============================================================"
echo "  Applied : $APPLIED changes"
echo "  Skipped : $SKIPPED (already configured)"
echo "  Failed  : $FAILED"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo "  STATUS: [FAIL] $FAILED fix(es) failed -- review output above"
  echo ""
  echo "  Next: fix failures manually, then re-run this script"
  EXIT_CODE=2
elif [ "$DRY_RUN" = "1" ]; then
  echo "  STATUS: [DRY-RUN] No changes applied"
  echo ""
  echo "  Next: run without --dry-run to apply changes"
  EXIT_CODE=0
else
  echo "  STATUS: [PASS] All fixes applied successfully"
  echo ""
  echo "  Next steps:"
  echo "    1. Re-run pre-check: ./homelab-k3s-precheck.sh --role $NODE_ROLE"
  echo "    2. Install K3s:"
  if [ "$NODE_ROLE" = "master" ]; then
    echo "       curl -sfL https://get.k3s.io | sh -"
  else
    echo "       curl -sfL https://get.k3s.io | K3S_URL=https://MASTER_IP:6443 K3S_TOKEN=TOKEN sh -"
  fi
  EXIT_CODE=0
fi

echo "============================================================"
echo ""
exit $EXIT_CODE
