#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 05: Longhorn Storage  v1.0
#  Instala Longhorn como storage distribuido del cluster
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="05-LONGHORN"
reset_counters

section "$MODULE_NAME"

if [[ "${ROLE:-worker}" != "server" ]]; then
  info "Módulo solo aplica al control-plane — saltando"
  exit 0
fi

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# -----------------------------------------------------------------------------
# Prerequisitos
# -----------------------------------------------------------------------------
if ! command -v helm &>/dev/null; then
  fail "Helm no encontrado — ejecutar módulo 03 primero"
  print_summary "$MODULE_NAME"
  exit 1
fi

if ! kubectl get nodes &>/dev/null; then
  fail "Cluster no accesible — verificar K3s y Cilium"
  print_summary "$MODULE_NAME"
  exit 1
fi

# Verificar que Cilium esté instalado antes de Longhorn
if ! helm status cilium -n kube-system &>/dev/null; then
  fail "Cilium no instalado — ejecutar módulo 04 primero"
  print_summary "$MODULE_NAME"
  exit 1
fi

# -----------------------------------------------------------------------------
# Verificar si ya está instalado
# -----------------------------------------------------------------------------
if helm status longhorn -n "${LONGHORN_NAMESPACE}" &>/dev/null; then
  CURRENT_VER=$(helm list -n "${LONGHORN_NAMESPACE}" 2>/dev/null | grep longhorn | awk '{print $9}')
  skip "Longhorn ya instalado ($CURRENT_VER)"
  print_summary "$MODULE_NAME"
  exit 0
fi

# -----------------------------------------------------------------------------
# Prerequisitos en nodos — open-iscsi
# -----------------------------------------------------------------------------
info "Verificando prerequisitos de Longhorn en nodos..."
NODES=$(kubectl get nodes --no-headers 2>/dev/null | awk '{print $1}')
for NODE in $NODES; do
  NODE_IP_ADDR=$(kubectl get node "$NODE" \
    -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)
  info "Verificando $NODE ($NODE_IP_ADDR)..."
done
info "Prerequisitos de nodos deben verificarse manualmente si hay errores de storage"

# -----------------------------------------------------------------------------
# Namespace
# -----------------------------------------------------------------------------
if kubectl get namespace "${LONGHORN_NAMESPACE}" &>/dev/null; then
  skip "Namespace ${LONGHORN_NAMESPACE} ya existe"
else
  do_run "Crear namespace ${LONGHORN_NAMESPACE}" \
    kubectl create namespace "${LONGHORN_NAMESPACE}"
fi

# -----------------------------------------------------------------------------
# Instalar Longhorn
# -----------------------------------------------------------------------------
if [[ -n "${LONGHORN_VERSION:-}" ]]; then
  VERSION_FLAG="--version ${LONGHORN_VERSION}"
  info "Versión: $LONGHORN_VERSION"
else
  VERSION_FLAG=""
  info "Versión: latest stable"
fi

info "Instalando Longhorn..."
log ""

if [[ "${DRY_RUN:-false}" == false ]]; then
  # shellcheck disable=SC2086
  helm install longhorn longhorn/longhorn $VERSION_FLAG \
    --namespace "${LONGHORN_NAMESPACE}" \
    --set defaultSettings.defaultReplicaCount="${LONGHORN_REPLICA_COUNT:-2}" \
    --set defaultSettings.defaultDataPath="${LONGHORN_DATA_PATH:-/var/lib/longhorn}" \
    --set persistence.defaultClass=true \
    --set persistence.defaultClassReplicaCount="${LONGHORN_REPLICA_COUNT:-2}" \
    2>&1 | tee -a "${LOG_FILE:-/dev/null}"

  rc=${PIPESTATUS[0]}
  if [[ $rc -eq 0 ]]; then
    ok "Longhorn instalado via Helm"
    APPLIED=$((APPLIED + 1))
  else
    fail "Helm install Longhorn falló (exit $rc)"
    print_summary "$MODULE_NAME"
    exit 1
  fi
else
  log "  ${YELLOW}[DRY]${NC}  Se instalaría Longhorn en namespace ${LONGHORN_NAMESPACE}"
  APPLIED=$((APPLIED + 1))
fi

# -----------------------------------------------------------------------------
# Esperar que Longhorn esté listo
# -----------------------------------------------------------------------------
if [[ "${DRY_RUN:-false}" == false ]]; then
  log ""
  info "Esperando pods Longhorn (max 5 min)..."
  WAIT=0
  LH_OK=false
  while [[ $WAIT -lt 300 ]]; do
    TOTAL=$(kubectl get pods -n "${LONGHORN_NAMESPACE}" \
      --no-headers 2>/dev/null | wc -l)
    RUNNING=$(kubectl get pods -n "${LONGHORN_NAMESPACE}" \
      --no-headers 2>/dev/null | grep -c "Running" || true)
    if [[ $TOTAL -gt 0 && "$RUNNING" -eq "$TOTAL" ]]; then
      LH_OK=true
      break
    fi
    printf "  Longhorn pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 10
    WAIT=$((WAIT + 10))
  done
  echo ""

  if [[ "$LH_OK" == true ]]; then
    ok "Longhorn Running ($RUNNING/$TOTAL pods)"
  else
    warn "Algunos pods Longhorn aún no Running — puede necesitar más tiempo"
  fi

  # StorageClass
  log ""
  info "StorageClasses disponibles:"
  kubectl get storageclass 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true

  log ""
  info "Pods Longhorn:"
  kubectl get pods -n "${LONGHORN_NAMESPACE}" 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true
fi

print_summary "$MODULE_NAME"
