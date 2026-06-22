#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- K3s Cluster Install  v1.0
#  Uso:
#    Control-plane:  sudo bash homelab-k3s-install.sh --role server
#    Worker:         sudo bash homelab-k3s-install.sh --role worker \
#                      --server-ip 10.10.20.101 \
#                      --token <TOKEN>
#
#  Flags opcionales:
#    --dry-run          Muestra qué haría sin aplicar cambios
#    --k3s-version      Versión específica de K3s (default: latest stable)
#    --cluster-cidr     CIDR pods   (default: 10.42.0.0/16)
#    --service-cidr     CIDR svc    (default: 10.43.0.0/16)
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# Defaults
# -----------------------------------------------------------------------------
ROLE=""
SERVER_IP="10.10.20.101"
TOKEN=""
K3S_VERSION=""          # vacío = latest stable
CLUSTER_CIDR="10.42.0.0/16"
SERVICE_CIDR="10.43.0.0/16"
DRY_RUN=false
LOG_FILE="/tmp/k3s-install-$(hostname)-$(date +%Y%m%d-%H%M%S).log"

# TLS SANs adicionales (IPs futuras / VIPs)
EXTRA_SANS=(
  "10.10.20.100"   # Dell 5480 — control-plane permanente (llega después)
  "10.10.20.101"   # Dell 7490 #1 — control-plane temporal
)

# Componentes a deshabilitar en el server (usaremos alternativas)
DISABLE_COMPONENTS="traefik servicelb"

# -----------------------------------------------------------------------------
# Colores y helpers
# -----------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

APPLIED=0; SKIPPED=0; FAILED=0
ERRORS=()

log()  { echo -e "$*" | tee -a "$LOG_FILE"; }
info() { log "${CYAN}  [INFO]${NC} $*"; }
run()  { log "${GREEN}  [RUN]${NC}  $*"; }
skip() { log "${YELLOW}  [SKIP]${NC} $* -- ya configurado"; ((SKIPPED++)); }
fail() { log "${RED}  [FAIL]${NC} $*"; ERRORS+=("$*"); ((FAILED++)); }
ok()   { log "${GREEN}  [OK]${NC}   $*"; ((APPLIED++)); }

do_run() {
  local desc="$1"; shift
  run "$desc"
  if [[ "$DRY_RUN" == true ]]; then
    log "  ${YELLOW}[DRY]${NC}  Comando: $*"
    return 0
  fi
  if "$@" >> "$LOG_FILE" 2>&1; then
    ok "$desc"
  else
    fail "$desc"
    return 1
  fi
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
    --dry-run)      DRY_RUN=true;     shift   ;;
    *) echo "Argumento desconocido: $1"; exit 1 ;;
  esac
done

# Validaciones
if [[ -z "$ROLE" ]]; then
  echo "ERROR: --role es requerido (server | worker)"
  echo "Uso: sudo bash $0 --role server"
  echo "     sudo bash $0 --role worker --server-ip 10.10.20.101 --token <TOKEN>"
  exit 1
fi
if [[ "$ROLE" != "server" && "$ROLE" != "worker" ]]; then
  echo "ERROR: --role debe ser 'server' o 'worker'"; exit 1
fi
if [[ "$ROLE" == "worker" && -z "$TOKEN" ]]; then
  echo "ERROR: --token es requerido para rol worker"; exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Ejecutar con sudo"; exit 1
fi

# -----------------------------------------------------------------------------
# Header
# -----------------------------------------------------------------------------
log ""
log "============================================================"
log "  ${BOLD}HomeLab -- K3s Cluster Install v1.0${NC}"
log "  Role       : ${BOLD}$ROLE${NC}"
log "  Hostname   : $(hostname)"
log "  Node IP    : $(hostname -I | awk '{print $1}')"
[[ "$ROLE" == "worker" ]] && log "  Server IP  : $SERVER_IP"
log "  Dry run    : $DRY_RUN"
log "  Log file   : $LOG_FILE"
log "============================================================"
log ""

# -----------------------------------------------------------------------------
# STEP 1 — Verificar prerequisitos mínimos
# -----------------------------------------------------------------------------
log "${BOLD}[ STEP 1 -- PREREQUISITOS ]${NC}"

# K3s ya instalado?
if systemctl is-active --quiet k3s 2>/dev/null || systemctl is-active --quiet k3s-agent 2>/dev/null; then
  SVC=$(systemctl is-active k3s 2>/dev/null || systemctl is-active k3s-agent 2>/dev/null || echo "unknown")
  skip "K3s ya está corriendo (servicio activo: $SVC) -- saliendo"
  log ""
  log "  Si quieres reinstalar: sudo systemctl stop k3s k3s-agent && sudo /usr/local/bin/k3s-uninstall.sh"
  exit 0
fi
info "K3s no instalado -- procediendo"

# Swap
SWAP=$(swapon --show 2>/dev/null | wc -l)
if [[ $SWAP -gt 0 ]]; then
  info "Swap activa -- deshabilitando"
  do_run "Deshabilitar swap" swapoff -a
else
  skip "Swap ya deshabilitada"
fi

# br_netfilter
if lsmod | grep -q br_netfilter; then
  skip "br_netfilter ya cargado"
else
  do_run "Cargar br_netfilter" modprobe br_netfilter
fi

# ip_forward
if [[ "$(cat /proc/sys/net/ipv4/ip_forward)" == "1" ]]; then
  skip "ip_forward ya habilitado"
else
  do_run "Habilitar ip_forward" sysctl -w net.ipv4.ip_forward=1
fi

log ""

# -----------------------------------------------------------------------------
# STEP 2 — Construir comando de instalación
# -----------------------------------------------------------------------------
log "${BOLD}[ STEP 2 -- INSTALACIÓN K3s ]${NC}"

# Versión
if [[ -n "$K3S_VERSION" ]]; then
  VERSION_ENV="INSTALL_K3S_VERSION=$K3S_VERSION"
  info "Versión solicitada: $K3S_VERSION"
else
  VERSION_ENV=""
  info "Versión: latest stable"
fi

# Construir flags según rol
if [[ "$ROLE" == "server" ]]; then

  # TLS SANs
  TLS_FLAGS=""
  for SAN in "${EXTRA_SANS[@]}"; do
    TLS_FLAGS="$TLS_FLAGS --tls-san $SAN"
  done

  # Disable flags
  DISABLE_FLAGS=""
  for COMP in $DISABLE_COMPONENTS; do
    DISABLE_FLAGS="$DISABLE_FLAGS --disable $COMP"
  done

  K3S_CMD="curl -sfL https://get.k3s.io | $VERSION_ENV sh -s - server \
    --cluster-init \
    --node-name $(hostname) \
    --node-ip $(hostname -I | awk '{print $1}') \
    --advertise-address $(hostname -I | awk '{print $1}') \
    --cluster-cidr $CLUSTER_CIDR \
    --service-cidr $SERVICE_CIDR \
    --flannel-backend=none \
    --disable-network-policy \
    $DISABLE_FLAGS \
    $TLS_FLAGS \
    --write-kubeconfig-mode 644"

  info "Rol: control-plane (--cluster-init)"
  info "Flannel: deshabilitado (se instalará Cilium como CNI)"
  info "Traefik/ServiceLB: deshabilitados"

else  # worker

  K3S_CMD="curl -sfL https://get.k3s.io | $VERSION_ENV \
    K3S_URL=https://${SERVER_IP}:6443 \
    K3S_TOKEN=${TOKEN} \
    sh -s - agent \
    --node-name $(hostname) \
    --node-ip $(hostname -I | awk '{print $1}')"

  info "Rol: worker (agent)"
  info "Server: https://${SERVER_IP}:6443"

fi

# Mostrar comando (sin token completo en logs)
SAFE_CMD=$(echo "$K3S_CMD" | sed "s/$TOKEN/***TOKEN***/g")
info "Comando a ejecutar:"
log "  $SAFE_CMD"
log ""

if [[ "$DRY_RUN" == true ]]; then
  log "  ${YELLOW}[DRY-RUN]${NC} No se ejecutará la instalación"
else
  run "Instalando K3s..."
  if eval "$K3S_CMD" >> "$LOG_FILE" 2>&1; then
    ok "K3s instalado correctamente"
    ((APPLIED++))
  else
    fail "Error en la instalación de K3s -- revisar $LOG_FILE"
  fi
fi

log ""

# -----------------------------------------------------------------------------
# STEP 3 — Post-install (solo server)
# -----------------------------------------------------------------------------
if [[ "$ROLE" == "server" && "$DRY_RUN" == false && $FAILED -eq 0 ]]; then
  log "${BOLD}[ STEP 3 -- POST-INSTALL SERVER ]${NC}"

  # Esperar que el API server esté listo
  info "Esperando que el API server responda..."
  WAIT=0
  until kubectl get nodes &>/dev/null || [[ $WAIT -ge 60 ]]; do
    sleep 3; ((WAIT+=3))
    echo -n "."
  done
  echo ""

  if kubectl get nodes &>/dev/null; then
    ok "API server respondiendo"

    # Mostrar estado del nodo
    info "Estado del nodo:"
    kubectl get nodes -o wide 2>/dev/null | tee -a "$LOG_FILE" || true

    # Extraer y mostrar token
    log ""
    TOKEN_VALUE=$(cat /var/lib/rancher/k3s/server/node-token 2>/dev/null || echo "NO ENCONTRADO")
    log "  ${BOLD}${GREEN}══════════════════════════════════════════════${NC}"
    log "  ${BOLD}TOKEN PARA WORKERS:${NC}"
    log "  ${CYAN}$TOKEN_VALUE${NC}"
    log "  ${BOLD}${GREEN}══════════════════════════════════════════════${NC}"
    log ""
    log "  Guardado también en: /tmp/k3s-node-token.txt"
    echo "$TOKEN_VALUE" > /tmp/k3s-node-token.txt
    chmod 600 /tmp/k3s-node-token.txt

    # Comando listo para copiar
    log ""
    log "  ${BOLD}Comando para unir workers:${NC}"
    log "  ${CYAN}sudo bash homelab-k3s-install.sh --role worker \\${NC}"
    log "  ${CYAN}  --server-ip $(hostname -I | awk '{print $1}') \\${NC}"
    log "  ${CYAN}  --token $TOKEN_VALUE${NC}"

  else
    fail "API server no responde después de 60s -- revisar: sudo journalctl -u k3s -n 50"
  fi

  # kubeconfig para usuario admin
  log ""
  info "Configurando kubeconfig para usuario admin..."
  ADMIN_HOME=$(getent passwd admin | cut -d: -f6 2>/dev/null || echo "/home/admin")
  if [[ -d "$ADMIN_HOME" ]]; then
    mkdir -p "$ADMIN_HOME/.kube"
    cp /etc/rancher/k3s/k3s.yaml "$ADMIN_HOME/.kube/config"
    # Reemplazar 127.0.0.1 con IP real del nodo
    sed -i "s/127.0.0.1/$(hostname -I | awk '{print $1}')/g" "$ADMIN_HOME/.kube/config"
    chown -R admin:admin "$ADMIN_HOME/.kube"
    ok "kubeconfig copiado a $ADMIN_HOME/.kube/config"
    info "Agrega a tu ~/.bashrc en la máquina admin:"
    log "  export KUBECONFIG=$ADMIN_HOME/.kube/config"
  else
    info "Directorio de admin no encontrado -- kubeconfig en /etc/rancher/k3s/k3s.yaml"
  fi

fi

# -----------------------------------------------------------------------------
# STEP 4 — Verificación final
# -----------------------------------------------------------------------------
if [[ "$DRY_RUN" == false && $FAILED -eq 0 ]]; then
  log ""
  log "${BOLD}[ STEP 4 -- VERIFICACIÓN ]${NC}"

  sleep 5  # dar tiempo al servicio

  if [[ "$ROLE" == "server" ]]; then
    SVC="k3s"
  else
    SVC="k3s-agent"
  fi

  if systemctl is-active --quiet "$SVC"; then
    ok "Servicio $SVC activo"
  else
    fail "Servicio $SVC NO activo -- revisar: sudo journalctl -u $SVC -n 30"
  fi
fi

# -----------------------------------------------------------------------------
# SUMMARY
# -----------------------------------------------------------------------------
log ""
log "============================================================"
log "  ${BOLD}SUMMARY -- $(hostname) | $ROLE${NC}"
log "============================================================"
log "  Applied : $APPLIED changes"
log "  Skipped : $SKIPPED (already configured)"
log "  Failed  : $FAILED"
log ""

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  log "  ${RED}Errores:${NC}"
  for E in "${ERRORS[@]}"; do
    log "    ${RED}✗${NC} $E"
  done
  log ""
fi

if [[ $FAILED -eq 0 ]]; then
  log "  ${GREEN}STATUS: [PASS] Instalación completada correctamente${NC}"
  log ""
  if [[ "$ROLE" == "server" ]]; then
    log "  Próximos pasos:"
    log "    1. Instalar Cilium CNI (los pods estarán en Pending hasta entonces)"
    log "    2. Unir workers con el comando mostrado arriba"
    log "    3. Verificar: kubectl get nodes -o wide"
  else
    log "  Próximos pasos:"
    log "    1. Verificar desde el control-plane: kubectl get nodes"
    log "    2. El nodo aparecerá NotReady hasta que Cilium esté instalado"
  fi
else
  log "  ${RED}STATUS: [FAIL] Revisa los errores arriba${NC}"
  log "  Log completo: $LOG_FILE"
fi
log "============================================================"
log ""
