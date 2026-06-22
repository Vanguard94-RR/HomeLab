#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Bootstrap Orquestador  v1.0
#
#  Uso:
#    Control-plane:  sudo bash bootstrap.sh --role server
#    Worker:         sudo bash bootstrap.sh --role worker \
#                      --server-ip <IP> --token <TOKEN>
#
#  Flags opcionales:
#    --node-ip       IP del nodo (default: autodetectada)
#    --dry-run       Muestra qué haría sin aplicar cambios
#    --skip          Módulos a saltar, separados por coma (ej: --skip 05,06)
#    --only          Ejecutar solo estos módulos (ej: --only 04)
#    --from          Empezar desde este módulo (ej: --from 03)
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Cargar librería común
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/config/cluster.env"

# -----------------------------------------------------------------------------
# Defaults de argumentos
# -----------------------------------------------------------------------------
export ROLE=""
export SERVER_IP=""
export TOKEN=""
export NODE_IP=""
export DRY_RUN=false
SKIP_MODULES=()
ONLY_MODULES=()
FROM_MODULE=""

LOG_FILE="/tmp/homelab-bootstrap-$(hostname)-$(date +%Y%m%d-%H%M%S).log"
export LOG_FILE

# -----------------------------------------------------------------------------
# Parse argumentos
# -----------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --role)       export ROLE="$2";       shift 2 ;;
    --server-ip)  export SERVER_IP="$2";  shift 2 ;;
    --token)      export TOKEN="$2";      shift 2 ;;
    --node-ip)    export NODE_IP="$2";    shift 2 ;;
    --dry-run)    export DRY_RUN=true;    shift ;;
    --skip)
      IFS=',' read -ra SKIP_MODULES <<< "$2"
      shift 2 ;;
    --only)
      IFS=',' read -ra ONLY_MODULES <<< "$2"
      shift 2 ;;
    --from)
      FROM_MODULE="$2"
      shift 2 ;;
    *)
      echo "Argumento desconocido: $1"
      echo ""
      echo "Uso: sudo bash bootstrap.sh --role server"
      echo "     sudo bash bootstrap.sh --role worker --server-ip <IP> --token <TOKEN>"
      exit 1 ;;
  esac
done

# -----------------------------------------------------------------------------
# Validaciones
# -----------------------------------------------------------------------------
if [[ -z "$ROLE" ]]; then
  echo "ERROR: --role es requerido (server | worker)"
  echo ""
  echo "Uso:"
  echo "  sudo bash bootstrap.sh --role server"
  echo "  sudo bash bootstrap.sh --role worker --server-ip <IP> --token <TOKEN>"
  exit 1
fi

if [[ "$ROLE" != "server" && "$ROLE" != "worker" ]]; then
  echo "ERROR: --role debe ser 'server' o 'worker'"
  exit 1
fi

if [[ "$ROLE" == "worker" && -z "$TOKEN" ]]; then
  echo "ERROR: --token es requerido para rol worker"
  exit 1
fi

if [[ "$ROLE" == "worker" && -z "$SERVER_IP" ]]; then
  echo "ERROR: --server-ip es requerido para rol worker"
  exit 1
fi

require_root

# Autodetectar NODE_IP si no se especificó
if [[ -z "$NODE_IP" ]]; then
  # Preferir IP no-loopback con mejor métrica de gateway
  GW_IFACE=$(ip route show default 2>/dev/null | head -1 | awk '{print $5}')
  if [[ -n "$GW_IFACE" ]]; then
    export NODE_IP=$(ip addr show "$GW_IFACE" 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1 | head -1)
  fi
  # Fallback
  if [[ -z "$NODE_IP" ]]; then
    export NODE_IP=$(hostname -I | awk '{print $1}')
  fi
fi

mkdir -p "$(dirname "$LOG_FILE")"

# -----------------------------------------------------------------------------
# Header
# -----------------------------------------------------------------------------
log ""
log "╔══════════════════════════════════════════════════════════╗"
log "║  ${BOLD}HomeLab Bootstrap Orquestador  v1.0${NC}"
log "╠══════════════════════════════════════════════════════════╣"
log "║  Role       : ${BOLD}${ROLE}${NC}"
log "║  Hostname   : $(hostname)"
log "║  Node IP    : ${NODE_IP}"
[[ "$ROLE" == "worker" ]] && log "║  Server IP  : ${SERVER_IP}"
log "║  Dry run    : ${DRY_RUN}"
log "║  Log file   : ${LOG_FILE}"
log "╚══════════════════════════════════════════════════════════╝"
log ""

# -----------------------------------------------------------------------------
# Definición de módulos
# -----------------------------------------------------------------------------
# Formato: "ID:archivo:descripción:roles"
# roles: "all" | "server" | "worker"
declare -a MODULES=(
  "01:01-preflight.sh:Preflight — prerequisitos del nodo:all"
  "02:02-k3s-install.sh:K3s Install — server o agent:all"
  "03:03-helm-tools.sh:Helm + CLI Tools:server"
  "04:04-cilium.sh:Cilium CNI:server"
  "05:05-longhorn.sh:Longhorn Storage:server"
  "06:06-argocd.sh:ArgoCD GitOps:server"
  "07:07-monitoring-agents.sh:Monitoring Agents (node-exporter DaemonSet):server"
)

# -----------------------------------------------------------------------------
# Función auxiliar: ¿debe ejecutarse este módulo?
# -----------------------------------------------------------------------------
should_run() {
  local mod_id="$1"
  local mod_roles="$2"

  # Filtro por rol
  if [[ "$mod_roles" != "all" && "$mod_roles" != "$ROLE" ]]; then
    return 1
  fi

  # Filtro --only
  if [[ ${#ONLY_MODULES[@]} -gt 0 ]]; then
    for only in "${ONLY_MODULES[@]}"; do
      [[ "$mod_id" == "$only" ]] && return 0
    done
    return 1
  fi

  # Filtro --from
  if [[ -n "$FROM_MODULE" && "$mod_id" < "$FROM_MODULE" ]]; then
    return 1
  fi

  # Filtro --skip
  for skip in "${SKIP_MODULES[@]}"; do
    [[ "$mod_id" == "$skip" ]] && return 1
  done

  return 0
}

# -----------------------------------------------------------------------------
# Ejecutar módulos en orden
# -----------------------------------------------------------------------------
TOTAL_APPLIED=0
TOTAL_SKIPPED=0
TOTAL_FAILED=0
MODULES_RUN=()
MODULES_SKIPPED=()
MODULES_FAILED=()

for MODULE_DEF in "${MODULES[@]}"; do
  IFS=':' read -r MOD_ID MOD_FILE MOD_DESC MOD_ROLES <<< "$MODULE_DEF"
  MOD_PATH="${SCRIPT_DIR}/modules/${MOD_FILE}"

  if ! should_run "$MOD_ID" "$MOD_ROLES"; then
    log "  ${YELLOW}[SKIP MODULE]${NC} $MOD_ID — $MOD_DESC (rol: $ROLE, requiere: $MOD_ROLES)"
    MODULES_SKIPPED+=("$MOD_ID:$MOD_DESC")
    continue
  fi

  if [[ ! -f "$MOD_PATH" ]]; then
    log "  ${RED}[ERROR]${NC} Módulo no encontrado: $MOD_PATH"
    MODULES_FAILED+=("$MOD_ID:$MOD_DESC — archivo no encontrado")
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
    continue
  fi

  log ""
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "  ${BOLD}Ejecutando módulo $MOD_ID: $MOD_DESC${NC}"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log ""

  # Ejecutar módulo — capturar exit code sin abortar bootstrap
  bash "${MOD_PATH}"
  MOD_RC=$?

  if [[ $MOD_RC -eq 0 ]]; then
    MODULES_RUN+=("$MOD_ID:$MOD_DESC")
  else
    MODULES_FAILED+=("$MOD_ID:$MOD_DESC (exit $MOD_RC)")
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
    warn "Módulo $MOD_ID falló — continuando con el siguiente"
  fi
done

# -----------------------------------------------------------------------------
# Summary global
# -----------------------------------------------------------------------------
log ""
log "╔══════════════════════════════════════════════════════════╗"
log "║  ${BOLD}BOOTSTRAP SUMMARY — $(hostname)${NC}"
log "╠══════════════════════════════════════════════════════════╣"
log "║  Role    : $ROLE"
log "║  Node IP : $NODE_IP"
log "╠══════════════════════════════════════════════════════════╣"

log "║"
log "║  ${GREEN}Módulos completados:${NC}"
if [[ ${#MODULES_RUN[@]} -eq 0 ]]; then
  log "║    (ninguno)"
else
  for M in "${MODULES_RUN[@]}"; do
    IFS=':' read -r MID MDESC <<< "$M"
    log "║    ${GREEN}✓${NC} $MID — $MDESC"
  done
fi

if [[ ${#MODULES_SKIPPED[@]} -gt 0 ]]; then
  log "║"
  log "║  ${YELLOW}Módulos saltados:${NC}"
  for M in "${MODULES_SKIPPED[@]}"; do
    IFS=':' read -r MID MDESC <<< "$M"
    log "║    ${YELLOW}—${NC} $MID — $MDESC"
  done
fi

if [[ ${#MODULES_FAILED[@]} -gt 0 ]]; then
  log "║"
  log "║  ${RED}Módulos con errores:${NC}"
  for M in "${MODULES_FAILED[@]}"; do
    IFS=':' read -r MID MDESC <<< "$M"
    log "║    ${RED}✗${NC} $MID — $MDESC"
  done
fi

log "║"
log "╠══════════════════════════════════════════════════════════╣"

if [[ $TOTAL_FAILED -eq 0 ]]; then
  log "║  ${GREEN}STATUS: [PASS] Bootstrap completado correctamente${NC}"
  log "╠══════════════════════════════════════════════════════════╣"
  log "║"
  if [[ "$ROLE" == "server" ]]; then
    log "║  Próximos pasos:"
    log "║    1. Verificar: kubectl get nodes -o wide"
    log "║    2. Verificar pods: kubectl get pods -A"
    log "║    3. Unir workers via deploy.sh --only-workers"
    log "║    4. ArgoCD UI: kubectl port-forward svc/argocd-server -n argocd 8080:443"
    log "║    5. Longhorn UI: kubectl port-forward svc/longhorn-frontend -n longhorn-system 8081:80"
  else
    log "║  Próximos pasos:"
    log "║    1. Verificar desde el control-plane: kubectl get nodes"
  fi
  log "║"
else
  log "║  ${RED}STATUS: [FAIL] $TOTAL_FAILED módulo(s) con errores${NC}"
  log "║  Revisar log: $LOG_FILE"
fi

log "╚══════════════════════════════════════════════════════════╝"
log ""

[[ $TOTAL_FAILED -eq 0 ]] && exit 0 || exit 1
