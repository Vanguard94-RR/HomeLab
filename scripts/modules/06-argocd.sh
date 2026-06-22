#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 06: ArgoCD GitOps  v1.0
#  Instala ArgoCD y configura el repositorio GitOps
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="06-ARGOCD"
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

# -----------------------------------------------------------------------------
# Verificar si ya está instalado
# -----------------------------------------------------------------------------
if helm status argocd -n "${ARGOCD_NAMESPACE}" &>/dev/null; then
  CURRENT_VER=$(helm list -n "${ARGOCD_NAMESPACE}" 2>/dev/null | grep argocd | awk '{print $9}')
  skip "ArgoCD ya instalado ($CURRENT_VER)"
  print_summary "$MODULE_NAME"
  exit 0
fi

# -----------------------------------------------------------------------------
# Namespace
# -----------------------------------------------------------------------------
if kubectl get namespace "${ARGOCD_NAMESPACE}" &>/dev/null; then
  skip "Namespace ${ARGOCD_NAMESPACE} ya existe"
else
  do_run "Crear namespace ${ARGOCD_NAMESPACE}" \
    kubectl create namespace "${ARGOCD_NAMESPACE}"
fi

# -----------------------------------------------------------------------------
# Instalar ArgoCD via Helm
# -----------------------------------------------------------------------------
if [[ -n "${ARGOCD_VERSION:-}" ]]; then
  VERSION_FLAG="--version ${ARGOCD_VERSION}"
  info "Versión: $ARGOCD_VERSION"
else
  VERSION_FLAG=""
  info "Versión: latest stable"
fi

info "Instalando ArgoCD..."
log ""

if [[ "${DRY_RUN:-false}" == false ]]; then
  # shellcheck disable=SC2086
  helm install argocd argo/argo-cd $VERSION_FLAG \
    --namespace "${ARGOCD_NAMESPACE}" \
    --set server.service.type=ClusterIP \
    --set configs.params."server\.insecure"=true \
    2>&1 | tee -a "${LOG_FILE:-/dev/null}"

  rc=${PIPESTATUS[0]}
  if [[ $rc -eq 0 ]]; then
    ok "ArgoCD instalado via Helm"
    APPLIED=$((APPLIED + 1))
  else
    fail "Helm install ArgoCD falló (exit $rc)"
    print_summary "$MODULE_NAME"
    exit 1
  fi
else
  log "  ${YELLOW}[DRY]${NC}  Se instalaría ArgoCD en namespace ${ARGOCD_NAMESPACE}"
  APPLIED=$((APPLIED + 1))
fi

# -----------------------------------------------------------------------------
# Esperar que ArgoCD esté listo
# -----------------------------------------------------------------------------
if [[ "${DRY_RUN:-false}" == false ]]; then
  log ""
  info "Esperando pods ArgoCD (max 5 min)..."
  WAIT=0
  ARGO_OK=false
  while [[ $WAIT -lt 300 ]]; do
    TOTAL=$(kubectl get pods -n "${ARGOCD_NAMESPACE}" \
      --no-headers 2>/dev/null | wc -l)
    RUNNING=$(kubectl get pods -n "${ARGOCD_NAMESPACE}" \
      --no-headers 2>/dev/null | grep -c "Running" || true)
    if [[ $TOTAL -gt 0 && "$RUNNING" -eq "$TOTAL" ]]; then
      ARGO_OK=true
      break
    fi
    printf "  ArgoCD pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 10
    WAIT=$((WAIT + 10))
  done
  echo ""

  if [[ "$ARGO_OK" == true ]]; then
    ok "ArgoCD Running ($RUNNING/$TOTAL pods)"
  else
    warn "Algunos pods ArgoCD aún no Running"
  fi

  # Obtener password inicial
  log ""
  info "Obteniendo password inicial de ArgoCD admin..."
  ARGO_PASS=$(kubectl -n "${ARGOCD_NAMESPACE}" get secret argocd-initial-admin-secret \
    -o jsonpath="{.data.password}" 2>/dev/null | base64 -d 2>/dev/null || echo "NO DISPONIBLE")

  if [[ "$ARGO_PASS" != "NO DISPONIBLE" ]]; then
    log ""
    log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
    log "  ${BOLD}  ArgoCD Admin Credentials:${NC}"
    log "  ${CYAN}  Usuario  : admin${NC}"
    log "  ${CYAN}  Password : $ARGO_PASS${NC}"
    log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
    log ""
    log "  Guardado en: /tmp/argocd-admin-pass.txt"
    echo "admin:$ARGO_PASS" > /tmp/argocd-admin-pass.txt
    chmod 600 /tmp/argocd-admin-pass.txt
    ok "Credenciales obtenidas"
    APPLIED=$((APPLIED + 1))
  else
    warn "Password inicial no disponible aún — puede tardar unos segundos"
    info "Recuperar después con: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
  fi

  # Configurar repo GitOps si está definido
  if [[ -n "${ARGOCD_REPO_URL:-}" ]]; then
    log ""
    info "Configurando repositorio GitOps: $ARGOCD_REPO_URL"
    info "El repo se configurará via ApplicationSet tras el login inicial"
    info "argocd login <IP>:443 --username admin --password $ARGO_PASS --insecure"
  else
    info "ARGOCD_REPO_URL no definido en cluster.env — configurar manualmente"
  fi

  # Estado final
  log ""
  info "Pods ArgoCD:"
  kubectl get pods -n "${ARGOCD_NAMESPACE}" 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true
  log ""
  info "Para acceder al UI (port-forward):"
  log "  kubectl port-forward svc/argocd-server -n ${ARGOCD_NAMESPACE} 8080:443"
  log "  Abrir: https://localhost:8080"
fi

print_summary "$MODULE_NAME"
