#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- K3s Cluster Install  v1.1
#
#  Uso:
#    Control-plane:  sudo bash homelab-k3s-install.sh --role server
#    Worker:         sudo bash homelab-k3s-install.sh --role worker \
#                      --server-ip <IP> --token <TOKEN>
#
#  Flags opcionales:
#    --dry-run          Muestra qué haría sin aplicar cambios
#    --k3s-version      Versión específica (default: latest stable)
#    --cluster-cidr     CIDR pods    (default: 10.42.0.0/16)
#    --service-cidr     CIDR svc     (default: 10.43.0.0/16)
#    --node-ip          IP del nodo  (default: autodetectada)
# =============================================================================

# SIN set -e para no romper sesión SSH en swapoff ni en ((counter++))
set -uo pipefail

# -----------------------------------------------------------------------------
# Defaults
# -----------------------------------------------------------------------------
ROLE=""
SERVER_IP=""
TOKEN=""
K3S_VERSION=""
CLUSTER_CIDR="10.42.0.0/16"
SERVICE_CIDR="10.43.0.0/16"
NODE_IP=""
DRY_RUN=false
LOG_FILE="/tmp/k3s-install-$(hostname)-$(date +%Y%m%d-%H%M%S).log"

# TLS SANs adicionales
EXTRA_SANS=(
  "10.10.20.100"    # Dell 5480 — control-plane permanente (llega después)
  "10.10.20.101"    # Dell 7490 #1 — control-plane temporal
  "192.168.1.139"   # WiFi temporal Dell 7490 #1
)

# Componentes a deshabilitar en el server
DISABLE_COMPONENTS="traefik servicelb"

# -----------------------------------------------------------------------------
# Colores
# -----------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

# Contadores
APPLIED=0
SKIPPED=0
FAILED=0
ERRORS=()

# -----------------------------------------------------------------------------
# Helpers de logging
# -----------------------------------------------------------------------------
log()  { echo -e "$*" | tee -a "$LOG_FILE"; }
info() { log "${CYAN}  [INFO]${NC} $*"; }
skip() { log "${YELLOW}  [SKIP]${NC} $* -- ya configurado"; SKIPPED=$((SKIPPED + 1)); }
ok()   { log "${GREEN}  [OK]${NC}   $*"; APPLIED=$((APPLIED + 1)); }
fail() { log "${RED}  [FAIL]${NC} $*"; ERRORS+=("$*"); FAILED=$((FAILED + 1)); }

do_run() {
  local desc="$1"; shift
  log "${GREEN}  [RUN]${NC}  $desc"
  if [[ "$DRY_RUN" == true ]]; then
    log "  ${YELLOW}[DRY]${NC}  Comando: $*"
    APPLIED=$((APPLIED + 1))
    return 0
  fi
  local output
  output=$("$@" 2>&1)
  local rc=$?
  echo "$output" >> "$LOG_FILE"
  if [[ $rc -eq 0 ]]; then
    ok "$desc"
  else
    fail "$desc (exit $rc)"
  fi
  return $rc
}

# do_run que no falla el script si hay error (para operaciones best-effort)
do_run_soft() {
  local desc="$1"; shift
  log "${GREEN}  [RUN]${NC}  $desc"
  if [[ "$DRY_RUN" == true ]]; then
    log "  ${YELLOW}[DRY]${NC}  Comando: $*"
    APPLIED=$((APPLIED + 1))
    return 0
  fi
  local output
  output=$("$@" 2>&1) || true
  echo "$output" >> "$LOG_FILE"
  ok "$desc"
}

# -----------------------------------------------------------------------------
# Parse argumentos
# -----------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --role)         ROLE="$2";        shift 2 ;;
    --server-ip)    SERVER_IP="$2";   shift 2 ;;
    --token)        TOKEN="$2";       shift 2 ;;
    --k3s-version)  K3S_VERSION="$2"; shift 2 ;;
    --cluster-cidr) CLUSTER_CIDR="$2";shift 2 ;;
    --service-cidr) SERVICE_CIDR="$2";shift 2 ;;
    --node-ip)      NODE_IP="$2";     shift 2 ;;
    --dry-run)      DRY_RUN=true;     shift ;;
    *) echo "Argumento desconocido: $1"; exit 1 ;;
  esac
done

# Autodetectar IP del nodo si no se especificó
if [[ -z "$NODE_IP" ]]; then
  NODE_IP=$(hostname -I | awk '{print $1}')
fi

# Validaciones
if [[ -z "$ROLE" ]]; then
  echo "ERROR: --role es requerido (server | worker)"
  echo ""
  echo "Uso:"
  echo "  sudo bash $0 --role server"
  echo "  sudo bash $0 --role worker --server-ip <IP> --token <TOKEN>"
  exit 1
fi
if [[ "$ROLE" != "server" && "$ROLE" != "worker" ]]; then
  echo "ERROR: --role debe ser 'server' o 'worker'"; exit 1
fi
if [[ "$ROLE" == "worker" && -z "$TOKEN" ]]; then
  echo "ERROR: --token es requerido para rol worker"; exit 1
fi
if [[ "$ROLE" == "worker" && -z "$SERVER_IP" ]]; then
  echo "ERROR: --server-ip es requerido para rol worker"; exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Ejecutar con sudo o como root"; exit 1
fi

# Init log
mkdir -p "$(dirname "$LOG_FILE")"
echo "" >> "$LOG_FILE"

# -----------------------------------------------------------------------------
# Header
# -----------------------------------------------------------------------------
log "============================================================"
log "  ${BOLD}HomeLab -- K3s Cluster Install v1.1${NC}"
log "  Role       : ${BOLD}$ROLE${NC}"
log "  Hostname   : $(hostname)"
log "  Node IP    : $NODE_IP"
[[ "$ROLE" == "worker" ]] && log "  Server IP  : $SERVER_IP"
log "  Dry run    : $DRY_RUN"
log "  Log file   : $LOG_FILE"
log "============================================================"
log ""

# -----------------------------------------------------------------------------
# STEP 1 — Prerequisitos
# -----------------------------------------------------------------------------
log "${BOLD}[ STEP 1 -- PREREQUISITOS ]${NC}"

# K3s ya instalado y activo?
K3S_ACTIVE=false
if systemctl is-active --quiet k3s 2>/dev/null; then
  K3S_ACTIVE=true
fi
if systemctl is-active --quiet k3s-agent 2>/dev/null; then
  K3S_ACTIVE=true
fi

if [[ "$K3S_ACTIVE" == true ]]; then
  log ""
  log "${YELLOW}  [WARN]${NC} K3s ya está corriendo en este nodo."
  log "  Para reinstalar:"
  log "    sudo systemctl stop k3s || sudo systemctl stop k3s-agent"
  log "    sudo /usr/local/bin/k3s-uninstall.sh       # server"
  log "    sudo /usr/local/bin/k3s-agent-uninstall.sh # worker"
  log ""
  log "  Saliendo sin cambios."
  exit 0
fi
info "K3s no instalado -- procediendo"

# Swap — usar swapoff pero capturar resultado sin abortar
SWAP_LINES=$(swapon --show 2>/dev/null | wc -l)
if [[ "$SWAP_LINES" -gt 0 ]]; then
  info "Swap activa -- deshabilitando"
  swapoff -a >> "$LOG_FILE" 2>&1 && ok "Swap deshabilitada" || fail "swapoff falló (no crítico, continúa)"
else
  skip "Swap ya deshabilitada"
fi

# zram (Fedora lo usa por defecto)
if systemctl is-active --quiet systemd-zram-setup@zram0 2>/dev/null; then
  do_run_soft "Deshabilitar zram swap" systemctl stop systemd-zram-setup@zram0
else
  skip "zram no activo"
fi

# br_netfilter
if lsmod | grep -q br_netfilter; then
  skip "br_netfilter ya cargado"
else
  do_run "Cargar br_netfilter" modprobe br_netfilter
fi

# overlay
if lsmod | grep -q overlay; then
  skip "overlay ya cargado"
else
  do_run "Cargar overlay" modprobe overlay
fi

# ip_forward
if [[ "$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)" == "1" ]]; then
  skip "ip_forward ya habilitado"
else
  do_run "Habilitar ip_forward" sysctl -w net.ipv4.ip_forward=1
fi

# bridge-nf-call-iptables
if [[ "$(cat /proc/sys/net/bridge/bridge-nf-call-iptables 2>/dev/null)" == "1" ]]; then
  skip "bridge-nf-call-iptables ya habilitado"
else
  do_run_soft "Habilitar bridge-nf-call-iptables" sysctl -w net.bridge.bridge-nf-call-iptables=1
fi

log ""

# -----------------------------------------------------------------------------
# STEP 2 — Instalación K3s
# -----------------------------------------------------------------------------
log "${BOLD}[ STEP 2 -- INSTALACIÓN K3s ]${NC}"

# Vars de entorno para el installer
INSTALL_ENV=""
if [[ -n "$K3S_VERSION" ]]; then
  INSTALL_ENV="INSTALL_K3S_VERSION=$K3S_VERSION"
  info "Versión solicitada: $K3S_VERSION"
else
  info "Versión: latest stable"
fi

if [[ "$ROLE" == "server" ]]; then

  # Construir TLS SANs
  TLS_FLAGS=""
  for SAN in "${EXTRA_SANS[@]}"; do
    TLS_FLAGS="$TLS_FLAGS --tls-san $SAN"
  done

  # Construir disable flags
  DISABLE_FLAGS=""
  for COMP in $DISABLE_COMPONENTS; do
    DISABLE_FLAGS="$DISABLE_FLAGS --disable $COMP"
  done

  info "Rol: control-plane (--cluster-init + etcd embebido)"
  info "CNI: flannel deshabilitado (Cilium se instala después)"
  info "Deshabilitados: $DISABLE_COMPONENTS"
  info "Node IP: $NODE_IP"
  log ""

  if [[ "$DRY_RUN" == false ]]; then
    log "${GREEN}  [RUN]${NC}  Descargando e instalando K3s server..."
    curl -sfL https://get.k3s.io | \
      env $INSTALL_ENV \
      sh -s - server \
        --cluster-init \
        --node-name "$(hostname)" \
        --node-ip "$NODE_IP" \
        --advertise-address "$NODE_IP" \
        --cluster-cidr "$CLUSTER_CIDR" \
        --service-cidr "$SERVICE_CIDR" \
        --flannel-backend=none \
        --disable-network-policy \
        $DISABLE_FLAGS \
        $TLS_FLAGS \
        --write-kubeconfig-mode 644 \
      >> "$LOG_FILE" 2>&1

    K3S_RC=$?
    if [[ $K3S_RC -eq 0 ]]; then
      ok "K3s server instalado correctamente"
      APPLIED=$((APPLIED + 1))
    else
      fail "Instalación de K3s server falló (exit $K3S_RC)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría K3s server con --cluster-init"
    APPLIED=$((APPLIED + 1))
  fi

else  # worker

  info "Rol: worker (agent)"
  info "Server: https://${SERVER_IP}:6443"
  info "Node IP: $NODE_IP"
  log ""

  if [[ "$DRY_RUN" == false ]]; then
    log "${GREEN}  [RUN]${NC}  Descargando e instalando K3s agent..."
    curl -sfL https://get.k3s.io | \
      env $INSTALL_ENV \
        K3S_URL="https://${SERVER_IP}:6443" \
        K3S_TOKEN="$TOKEN" \
      sh -s - agent \
        --node-name "$(hostname)" \
        --node-ip "$NODE_IP" \
      >> "$LOG_FILE" 2>&1

    K3S_RC=$?
    if [[ $K3S_RC -eq 0 ]]; then
      ok "K3s agent instalado correctamente"
      APPLIED=$((APPLIED + 1))
    else
      fail "Instalación de K3s agent falló (exit $K3S_RC)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría K3s agent apuntando a $SERVER_IP"
    APPLIED=$((APPLIED + 1))
  fi

fi

log ""

# -----------------------------------------------------------------------------
# STEP 3 — Post-install server
# -----------------------------------------------------------------------------
if [[ "$ROLE" == "server" && "$DRY_RUN" == false && $FAILED -eq 0 ]]; then
  log "${BOLD}[ STEP 3 -- POST-INSTALL SERVER ]${NC}"

  # Esperar API server — hasta 90s
  info "Esperando que el API server responda (max 90s)..."
  API_OK=false
  for i in $(seq 1 30); do
    if kubectl get nodes >> "$LOG_FILE" 2>&1; then
      API_OK=true
      break
    fi
    sleep 3
    printf "."
  done
  echo ""

  if [[ "$API_OK" == true ]]; then
    ok "API server respondiendo"

    # Estado del nodo
    log ""
    info "Estado del nodo:"
    kubectl get nodes -o wide 2>/dev/null | tee -a "$LOG_FILE" || true

    # Extraer token
    TOKEN_FILE="/var/lib/rancher/k3s/server/node-token"
    if [[ -f "$TOKEN_FILE" ]]; then
      TOKEN_VALUE=$(cat "$TOKEN_FILE")
      echo "$TOKEN_VALUE" > /tmp/k3s-node-token.txt
      chmod 600 /tmp/k3s-node-token.txt

      log ""
      log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
      log "  ${BOLD}  TOKEN PARA WORKERS:${NC}"
      log ""
      log "  ${CYAN}  $TOKEN_VALUE${NC}"
      log ""
      log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
      log ""
      log "  Guardado en: /tmp/k3s-node-token.txt"
      log ""
      log "  ${BOLD}Comando para unir workers:${NC}"
      log ""
      log "  ${CYAN}sudo bash homelab-k3s-install.sh \\${NC}"
      log "  ${CYAN}  --role worker \\${NC}"
      log "  ${CYAN}  --server-ip $NODE_IP \\${NC}"
      log "  ${CYAN}  --token $TOKEN_VALUE${NC}"
      log ""
    else
      fail "No se encontró el token en $TOKEN_FILE"
    fi

    # kubeconfig para usuario admin
    info "Configurando kubeconfig para usuario admin..."
    ADMIN_HOME=$(getent passwd admin 2>/dev/null | cut -d: -f6 || echo "/home/admin")
    if [[ -d "$ADMIN_HOME" ]]; then
      mkdir -p "$ADMIN_HOME/.kube"
      cp /etc/rancher/k3s/k3s.yaml "$ADMIN_HOME/.kube/config"
      sed -i "s/127.0.0.1/$NODE_IP/g" "$ADMIN_HOME/.kube/config"
      chown -R admin:admin "$ADMIN_HOME/.kube"
      chmod 600 "$ADMIN_HOME/.kube/config"
      ok "kubeconfig configurado en $ADMIN_HOME/.kube/config"
    else
      info "Home de admin no encontrada -- kubeconfig en /etc/rancher/k3s/k3s.yaml"
    fi

  else
    fail "API server no respondió en 90s"
    info "Diagnóstico: sudo journalctl -u k3s -n 50 --no-pager"
  fi

  log ""
fi

# -----------------------------------------------------------------------------
# STEP 4 — Verificación de servicio
# -----------------------------------------------------------------------------
if [[ "$DRY_RUN" == false ]]; then
  log "${BOLD}[ STEP 4 -- VERIFICACIÓN ]${NC}"

  sleep 3

  if [[ "$ROLE" == "server" ]]; then
    SVC="k3s"
  else
    SVC="k3s-agent"
  fi

  if systemctl is-active --quiet "$SVC" 2>/dev/null; then
    ok "Servicio $SVC activo y corriendo"
  else
    fail "Servicio $SVC NO activo"
    info "Diagnóstico: sudo journalctl -u $SVC -n 50 --no-pager"
  fi

  log ""
fi

# -----------------------------------------------------------------------------
# SUMMARY
# -----------------------------------------------------------------------------
log "============================================================"
log "  ${BOLD}SUMMARY -- $(hostname) | $ROLE${NC}"
log "============================================================"
log "  Applied : $APPLIED changes"
log "  Skipped : $SKIPPED (already configured)"
log "  Failed  : $FAILED"

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  log ""
  log "  ${RED}Errores:${NC}"
  for E in "${ERRORS[@]}"; do
    log "    ${RED}✗${NC} $E"
  done
fi

log ""

if [[ $FAILED -eq 0 ]]; then
  log "  ${GREEN}STATUS: [PASS] Instalación completada correctamente${NC}"
  log ""
  if [[ "$ROLE" == "server" ]]; then
    log "  Próximos pasos:"
    log "    1. Unir workers con el comando mostrado arriba"
    log "    2. Instalar Cilium CNI -- pods en Pending hasta entonces"
    log "    3. Verificar: kubectl get nodes -o wide"
  else
    log "  Próximos pasos:"
    log "    1. Verificar desde el control-plane: kubectl get nodes"
    log "    2. Nodo en NotReady hasta que Cilium esté instalado"
  fi
else
  log "  ${RED}STATUS: [FAIL] Revisa los errores arriba${NC}"
  log "  Log completo: $LOG_FILE"
fi

log "============================================================"
log ""
