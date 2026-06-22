#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Deploy Orquestador  v1.0
#  Se ejecuta desde el P53 (máquina de administración)
#  Distribuye los scripts a los nodos y ejecuta el bootstrap
#
#  Uso:
#    bash deploy.sh                    # instala todo el cluster
#    bash deploy.sh --dry-run          # muestra qué haría
#    bash deploy.sh --only-cp          # solo control-plane
#    bash deploy.sh --only-workers     # solo workers (CP ya instalado)
#    bash deploy.sh --skip-copy        # no copia scripts, solo ejecuta
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config/cluster.env"

# -----------------------------------------------------------------------------
# Defaults
# -----------------------------------------------------------------------------
DRY_RUN=false
ONLY_CP=false
ONLY_WORKERS=false
SKIP_COPY=false
LOG_FILE="/tmp/homelab-deploy-$(date +%Y%m%d-%H%M%S).log"

# Nodos
CP_NODE="$CP_IP_WIFI"           # control-plane — usamos WiFi para SSH admin
WORKER_NODES=(
  "$WORKER1_IP_WIFI"            # dell-7490-2
  "$WORKER3_IP_WIFI"            # t440p-storage
)

# IPs definitivas VLAN 20
CP_VLAN_IP="$CP_IP_FINAL"
WORKER_VLAN_IPS=(
  "$WORKER1_IP"
  "$WORKER3_IP"
)

ADMIN_USER="admin"
SCRIPTS_REMOTE_DIR="/home/admin/Documents/Personal/HomeLab/scripts"
TARBALL="${SCRIPT_DIR}/homelab-scripts.tar.gz"

# -----------------------------------------------------------------------------
# Colores
# -----------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

log()  { echo -e "$*" | tee -a "$LOG_FILE"; }
info() { log "${CYAN}  [INFO]${NC} $*"; }
ok()   { log "${GREEN}  [OK]${NC}   $*"; }
fail() { log "${RED}  [FAIL]${NC} $*"; }
warn() { log "${YELLOW}  [WARN]${NC} $*"; }
section() { log ""; log "${BOLD}[ $* ]${NC}"; }

# -----------------------------------------------------------------------------
# Parse argumentos
# -----------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)       DRY_RUN=true;       shift ;;
    --only-cp)       ONLY_CP=true;       shift ;;
    --only-workers)  ONLY_WORKERS=true;  shift ;;
    --skip-copy)     SKIP_COPY=true;     shift ;;
    *) echo "Argumento desconocido: $1"; exit 1 ;;
  esac
done

mkdir -p "$(dirname "$LOG_FILE")"

# -----------------------------------------------------------------------------
# Header
# -----------------------------------------------------------------------------
log ""
log "╔══════════════════════════════════════════════════════════╗"
log "║  ${BOLD}HomeLab Deploy  v1.0${NC}"
log "╠══════════════════════════════════════════════════════════╣"
log "║  Control-plane : $CP_NODE → VLAN $CP_VLAN_IP"
log "║  Workers       : ${WORKER_NODES[*]}"
log "║  Dry run       : $DRY_RUN"
log "║  Log           : $LOG_FILE"
log "╚══════════════════════════════════════════════════════════╝"
log ""

# -----------------------------------------------------------------------------
# STEP 1 — Empaquetar scripts
# -----------------------------------------------------------------------------
section "STEP 1 — EMPAQUETAR SCRIPTS"

if [[ ! -f "$TARBALL" ]] || [[ "$SCRIPT_DIR/modules/01-preflight.sh" -nt "$TARBALL" ]]; then
  info "Generando tarball actualizado..."
  if [[ "$DRY_RUN" == false ]]; then
    tar -czf "$TARBALL" \
      -C "$SCRIPT_DIR" \
      bootstrap.sh \
      lib/common.sh \
      config/cluster.env \
      modules/01-preflight.sh \
      modules/02-k3s-install.sh \
      modules/03-helm-tools.sh \
      modules/04-cilium.sh \
      modules/05-longhorn.sh \
      modules/06-argocd.sh && \
    ok "Tarball generado: $TARBALL"
  else
    log "  ${YELLOW}[DRY]${NC}  tar -czf $TARBALL ..."
  fi
else
  ok "Tarball ya actualizado: $TARBALL"
fi

# -----------------------------------------------------------------------------
# STEP 2 — Distribuir scripts a todos los nodos
# -----------------------------------------------------------------------------
section "STEP 2 — DISTRIBUIR SCRIPTS"

ALL_NODES=()
[[ "$ONLY_WORKERS" == false ]] && ALL_NODES+=("$CP_NODE")
[[ "$ONLY_CP" == false ]]      && ALL_NODES+=("${WORKER_NODES[@]}")

if [[ "$SKIP_COPY" == true ]]; then
  info "--skip-copy activo — omitiendo distribución"
else
  for NODE in "${ALL_NODES[@]}"; do
    info "Copiando scripts a $NODE..."
    if [[ "$DRY_RUN" == false ]]; then
      scp -q "$TARBALL" "${ADMIN_USER}@${NODE}:/home/${ADMIN_USER}/" && \
      ssh "${ADMIN_USER}@${NODE}" \
        "mkdir -p ${SCRIPTS_REMOTE_DIR} && \
         tar -xzf ~/homelab-scripts.tar.gz -C ${SCRIPTS_REMOTE_DIR} --overwrite && \
         chmod +x ${SCRIPTS_REMOTE_DIR}/bootstrap.sh ${SCRIPTS_REMOTE_DIR}/modules/*.sh" && \
      ok "Scripts desplegados en $NODE" || \
      fail "Error copiando scripts a $NODE"
    else
      log "  ${YELLOW}[DRY]${NC}  scp + tar en $NODE"
    fi
  done
fi

# -----------------------------------------------------------------------------
# STEP 3 — Instalar control-plane
# -----------------------------------------------------------------------------
if [[ "$ONLY_WORKERS" == false ]]; then
  section "STEP 3 — INSTALAR CONTROL-PLANE ($CP_NODE)"

  info "Ejecutando bootstrap --role server en $CP_NODE..."
  info "Node IP VLAN: $CP_VLAN_IP"

  if [[ "$DRY_RUN" == false ]]; then
    ssh "${ADMIN_USER}@${CP_NODE}" \
      "sudo bash ${SCRIPTS_REMOTE_DIR}/bootstrap.sh \
        --role server \
        --node-ip ${CP_VLAN_IP}"
    CP_RC=$?
    if [[ $CP_RC -eq 0 ]]; then
      ok "Control-plane instalado correctamente"
    else
      fail "Bootstrap control-plane falló (exit $CP_RC)"
      log ""
      log "  Abortando — workers requieren control-plane operativo"
      exit 1
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  bootstrap.sh --role server --node-ip $CP_VLAN_IP"
  fi

  # Extraer token del control-plane
  section "STEP 3.1 — OBTENER TOKEN"

  if [[ "$DRY_RUN" == false ]]; then
    TOKEN=$(ssh "${ADMIN_USER}@${CP_NODE}" \
      "sudo cat /var/lib/rancher/k3s/server/node-token 2>/dev/null || \
       sudo cat /tmp/k3s-node-token.txt 2>/dev/null")

    if [[ -z "$TOKEN" ]]; then
      fail "No se pudo obtener el token del control-plane"
      exit 1
    fi
    ok "Token obtenido"
    echo "$TOKEN" > /tmp/k3s-node-token.txt
    chmod 600 /tmp/k3s-node-token.txt
  else
    TOKEN="DRY_RUN_TOKEN"
    log "  ${YELLOW}[DRY]${NC}  Se obtendría el token del control-plane"
  fi
fi

# -----------------------------------------------------------------------------
# STEP 4 — Instalar workers
# -----------------------------------------------------------------------------
if [[ "$ONLY_CP" == false ]]; then
  section "STEP 4 — INSTALAR WORKERS"

  # Si solo workers, leer token guardado
  if [[ "$ONLY_WORKERS" == true ]]; then
    if [[ -f /tmp/k3s-node-token.txt ]]; then
      TOKEN=$(cat /tmp/k3s-node-token.txt)
      info "Token leído de /tmp/k3s-node-token.txt"
    else
      info "Obteniendo token del control-plane..."
      TOKEN=$(ssh "${ADMIN_USER}@${CP_NODE}" \
        "sudo cat /var/lib/rancher/k3s/server/node-token 2>/dev/null")
      if [[ -z "$TOKEN" ]]; then
        fail "No se pudo obtener el token — ¿está el control-plane instalado?"
        exit 1
      fi
    fi
  fi

  for i in "${!WORKER_NODES[@]}"; do
    NODE="${WORKER_NODES[$i]}"
    NODE_VLAN_IP="${WORKER_VLAN_IPS[$i]}"

    info "Instalando worker $NODE (VLAN: $NODE_VLAN_IP)..."

    if [[ "$DRY_RUN" == false ]]; then
      ssh "${ADMIN_USER}@${NODE}" \
        "sudo bash ${SCRIPTS_REMOTE_DIR}/bootstrap.sh \
          --role worker \
          --server-ip ${CP_VLAN_IP} \
          --token ${TOKEN} \
          --node-ip ${NODE_VLAN_IP}"
      WK_RC=$?
      if [[ $WK_RC -eq 0 ]]; then
        ok "Worker $NODE instalado correctamente"
      else
        fail "Bootstrap worker $NODE falló (exit $WK_RC)"
      fi
    else
      log "  ${YELLOW}[DRY]${NC}  bootstrap.sh --role worker --server-ip $CP_VLAN_IP --node-ip $NODE_VLAN_IP"
    fi
  done
fi

# -----------------------------------------------------------------------------
# STEP 5 — Copiar kubeconfig al P53
# -----------------------------------------------------------------------------
section "STEP 5 — KUBECONFIG LOCAL"

KUBECONFIG_LOCAL="${HOME}/.kube/config"
KUBECONFIG_BACKUP="${HOME}/.kube/config.bak.$(date +%Y%m%d-%H%M%S)"

if [[ "$DRY_RUN" == false ]]; then
  mkdir -p "${HOME}/.kube"
  # Backup si existe
  [[ -f "$KUBECONFIG_LOCAL" ]] && cp "$KUBECONFIG_LOCAL" "$KUBECONFIG_BACKUP" &&     info "Backup kubeconfig: $KUBECONFIG_BACKUP"

  info "Copiando kubeconfig del control-plane..."
  scp -q "${ADMIN_USER}@${CP_NODE}:/home/${ADMIN_USER}/.kube/config" "$KUBECONFIG_LOCAL" &&     ok "kubeconfig copiado a $KUBECONFIG_LOCAL" ||     warn "No se pudo copiar kubeconfig — copiar manualmente con:"

  # Verificar conectividad local
  if kubectl cluster-info &>/dev/null; then
    ok "kubectl conectado al cluster desde el P53"
  else
    warn "kubectl no conecta aún — el API server puede tardar unos segundos"
  fi
else
  log "  ${YELLOW}[DRY]${NC}  Se copiaría kubeconfig a $KUBECONFIG_LOCAL"
fi

# -----------------------------------------------------------------------------
# STEP 6 — Verificación final del cluster
# -----------------------------------------------------------------------------
section "STEP 6 — VERIFICACIÓN CLUSTER"

if [[ "$DRY_RUN" == false ]]; then
  sleep 15
  info "Estado del cluster:"
  kubectl get nodes -o wide 2>/dev/null | tee -a "$LOG_FILE" ||     ssh "${ADMIN_USER}@${CP_NODE}" "kubectl get nodes -o wide" 2>/dev/null | tee -a "$LOG_FILE" ||     warn "No se pudo verificar el cluster — verificar manualmente"

  log ""
  info "Pods del sistema:"
  kubectl get pods -A --field-selector=status.phase!=Running 2>/dev/null | tee -a "$LOG_FILE" || true
else
  log "  ${YELLOW}[DRY]${NC}  kubectl get nodes -o wide"
fi

log ""
log "╔══════════════════════════════════════════════════════════╗"
log "║  ${BOLD}DEPLOY COMPLETADO${NC}"
log "║  Log completo: $LOG_FILE"
log "╚══════════════════════════════════════════════════════════╝"
log ""
