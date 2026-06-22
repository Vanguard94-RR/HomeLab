#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 04: Cilium CNI  v1.0
#  Instala y verifica Cilium como CNI del cluster K3s
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="04-CILIUM"
reset_counters

section "$MODULE_NAME"

if [[ "${ROLE:-worker}" != "server" ]]; then
  info "Módulo solo aplica al control-plane — saltando"
  exit 0
fi

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# -----------------------------------------------------------------------------
# Verificar que K3s está corriendo
# -----------------------------------------------------------------------------
if ! systemctl is-active --quiet k3s 2>/dev/null; then
  fail "K3s no está activo — ejecutar módulo 02 primero"
  print_summary "$MODULE_NAME"
  exit 1
fi

# Verificar que Helm está disponible
if ! command -v helm &>/dev/null; then
  fail "Helm no encontrado — ejecutar módulo 03 primero"
  print_summary "$MODULE_NAME"
  exit 1
fi

# -----------------------------------------------------------------------------
# Verificar si Cilium ya está instalado
# -----------------------------------------------------------------------------
if helm status cilium -n kube-system &>/dev/null; then
  CURRENT_VER=$(helm list -n kube-system 2>/dev/null | grep cilium | awk '{print $9}')
  skip "Cilium ya instalado ($CURRENT_VER)"
  print_summary "$MODULE_NAME"
  exit 0
fi

# -----------------------------------------------------------------------------
# Determinar API server IP
# -----------------------------------------------------------------------------
API_IP="${NODE_IP:-$(hostname -I | awk '{print $1}')}"
info "API Server IP: $API_IP"
info "Cluster CIDR: $CLUSTER_CIDR"

# Versión
if [[ -n "${CILIUM_VERSION:-}" ]]; then
  VERSION_FLAG="--version ${CILIUM_VERSION}"
  info "Versión: $CILIUM_VERSION"
else
  VERSION_FLAG=""
  info "Versión: latest stable"
fi

# -----------------------------------------------------------------------------
# Instalar Cilium via Helm
# -----------------------------------------------------------------------------
info "Instalando Cilium..."
log ""

if [[ "${DRY_RUN:-false}" == false ]]; then
  # shellcheck disable=SC2086
  helm install cilium cilium/cilium $VERSION_FLAG \
    --namespace kube-system \
    --set k8sServiceHost="${API_IP}" \
    --set k8sServicePort=6443 \
    --set ipam.mode=kubernetes \
    --set ipam.operator.clusterPoolIPv4PodCIDRList="${CLUSTER_CIDR}" \
    --set kubeProxyReplacement=true \
    --set operator.replicas=1 \
    --set hubble.relay.enabled="${HUBBLE_ENABLED:-true}" \
    --set hubble.ui.enabled="${HUBBLE_UI_ENABLED:-true}" \
    2>&1 | tee -a "${LOG_FILE:-/dev/null}"

  rc=${PIPESTATUS[0]}
  if [[ $rc -eq 0 ]]; then
    ok "Cilium instalado via Helm"
    APPLIED=$((APPLIED + 1))
  else
    fail "Helm install Cilium falló (exit $rc)"
    print_summary "$MODULE_NAME"
    exit 1
  fi
else
  log "  ${YELLOW}[DRY]${NC}  Se instalaría Cilium con k8sServiceHost=$API_IP"
  APPLIED=$((APPLIED + 1))
fi

# -----------------------------------------------------------------------------
# Esperar pods Cilium Running
# -----------------------------------------------------------------------------
if [[ "${DRY_RUN:-false}" == false ]]; then
  log ""
  info "Esperando pods Cilium (max 3 min)..."
  WAIT=0
  CILIUM_OK=false
  while [[ $WAIT -lt 180 ]]; do
    TOTAL=$(kubectl get pods -n kube-system -l k8s-app=cilium \
      --no-headers 2>/dev/null | wc -l)
    RUNNING=$(kubectl get pods -n kube-system -l k8s-app=cilium \
      --no-headers 2>/dev/null | grep -c "Running" || true)
    if [[ $TOTAL -gt 0 && "$RUNNING" -eq "$TOTAL" ]]; then
      CILIUM_OK=true
      break
    fi
    printf "  Cilium pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 5
    WAIT=$((WAIT + 5))
  done
  echo ""

  if [[ "$CILIUM_OK" == true ]]; then
    ok "Cilium pods Running ($RUNNING/$TOTAL)"
  else
    fail "Cilium pods no Running después de 3 min"
  fi

  # -----------------------------------------------------------------------------
  # Esperar nodos Ready
  # -----------------------------------------------------------------------------
  log ""
  info "Esperando nodos Ready (max 3 min)..."
  WAIT=0
  NODES_OK=false
  while [[ $WAIT -lt 180 ]]; do
    NOT_READY=$(kubectl get nodes --no-headers 2>/dev/null | grep -v " Ready" | wc -l)
    TOTAL_NODES=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
    if [[ $TOTAL_NODES -gt 0 && $NOT_READY -eq 0 ]]; then
      NODES_OK=true
      break
    fi
    printf "  Nodos Ready: %d/%d\r" "$((TOTAL_NODES - NOT_READY))" "$TOTAL_NODES"
    sleep 5
    WAIT=$((WAIT + 5))
  done
  echo ""

  if [[ "$NODES_OK" == true ]]; then
    ok "Todos los nodos Ready"
  else
    warn "Algunos nodos aún NotReady — puede ser normal si hay workers pendientes"
  fi

  # -----------------------------------------------------------------------------
  # Estado final
  # -----------------------------------------------------------------------------
  log ""
  info "Estado de los nodos:"
  kubectl get nodes -o wide 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true
  log ""
  info "Pods Cilium:"
  kubectl get pods -n kube-system -l k8s-app=cilium -o wide 2>/dev/null \
    | tee -a "${LOG_FILE:-/dev/null}" || true

  # Cilium status
  if command -v cilium &>/dev/null; then
    log ""
    info "Cilium status:"
    cilium status 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true
  fi
fi

print_summary "$MODULE_NAME"
