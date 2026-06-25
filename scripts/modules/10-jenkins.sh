#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 10: Jenkins CI/CD  v1.0
#  Despliega Jenkins con:
#    - JCasC (Jenkins Configuration as Code)
#    - Vault Agent Injector para secretos
#    - Longhorn PVC 20GB
#    - Kubernetes agents dinámicos
#    - GitHub integration
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="10-JENKINS"
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
  print_summary "$MODULE_NAME"; exit 1
fi

if ! helm status vault -n "${VAULT_NAMESPACE:-vault}" &>/dev/null; then
  fail "Vault no instalado — ejecutar módulo 09 primero"
  print_summary "$MODULE_NAME"; exit 1
fi

# -----------------------------------------------------------------------------
# Namespace
# -----------------------------------------------------------------------------
section "10.1 — NAMESPACE"
if kubectl get namespace "${JENKINS_NAMESPACE}" &>/dev/null; then
  skip "Namespace ${JENKINS_NAMESPACE} ya existe"
else
  do_run "Crear namespace ${JENKINS_NAMESPACE}" \
    kubectl create namespace "${JENKINS_NAMESPACE}"
fi

# -----------------------------------------------------------------------------
# Helm repo Jenkins
# -----------------------------------------------------------------------------
section "10.2 — HELM REPO"
if helm repo list 2>/dev/null | grep -q "^jenkins"; then
  skip "Repo jenkins ya agregado"
else
  do_run "Agregar repo jenkins" \
    helm repo add jenkins https://charts.jenkins.io
fi
do_run_soft "Actualizar repos" helm repo update

# -----------------------------------------------------------------------------
# ServiceAccount para Vault integration
# -----------------------------------------------------------------------------
section "10.3 — SERVICEACCOUNT"
if kubectl get serviceaccount jenkins -n "${JENKINS_NAMESPACE}" &>/dev/null; then
  skip "ServiceAccount jenkins ya existe"
else
  do_run "Crear ServiceAccount jenkins" \
    kubectl create serviceaccount jenkins -n "${JENKINS_NAMESPACE}"
fi

# -----------------------------------------------------------------------------
# Instalar Jenkins
# -----------------------------------------------------------------------------
section "10.4 — JENKINS INSTALL"

if helm status jenkins -n "${JENKINS_NAMESPACE}" &>/dev/null; then
  CURRENT=$(helm list -n "${JENKINS_NAMESPACE}" | grep jenkins | awk '{print $9}')
  skip "Jenkins ya instalado ($CURRENT)"
else
  VERSION_FLAG=""
  [[ -n "${JENKINS_VERSION:-}" ]] && VERSION_FLAG="--version ${JENKINS_VERSION}"

  info "Namespace: ${JENKINS_NAMESPACE}"
  info "PVC: ${JENKINS_PVC_SIZE:-20Gi} (Longhorn)"
  info "NodePort: ${JENKINS_NODEPORT:-32000}"
  log ""

  if [[ "${DRY_RUN:-false}" == false ]]; then
    # shellcheck disable=SC2086
    helm install jenkins jenkins/jenkins $VERSION_FLAG \
      --namespace "${JENKINS_NAMESPACE}" \
      --set controller.serviceType=NodePort \
      --set controller.nodePort="${JENKINS_NODEPORT:-32000}" \
      --set controller.image.tag="lts-jdk17" \
      --set controller.resources.requests.cpu="200m" \
      --set controller.resources.requests.memory="512Mi" \
      --set controller.resources.limits.cpu="1000m" \
      --set controller.resources.limits.memory="2Gi" \
      --set persistence.enabled=true \
      --set persistence.storageClass=longhorn \
      --set persistence.size="${JENKINS_PVC_SIZE:-20Gi}" \
      --set serviceAccount.create=false \
      --set serviceAccount.name=jenkins \
      --set controller.installPlugins[0]="kubernetes:latest" \
      --set controller.installPlugins[1]="workflow-aggregator:latest" \
      --set controller.installPlugins[2]="git:latest" \
      --set controller.installPlugins[3]="github:latest" \
      --set controller.installPlugins[4]="configuration-as-code:latest" \
      --set controller.installPlugins[5]="hashicorp-vault-plugin:latest" \
      --set controller.installPlugins[6]="pipeline-model-definition:latest" \
      --set controller.installPlugins[7]="pipeline-stage-view:latest" \
      --set controller.installPlugins[8]="credentials-binding:latest" \
      --set controller.installPlugins[9]="kubernetes-cli:latest" \
      --set controller.JCasC.defaultConfig=true \
      2>&1 | tee -a "${LOG_FILE:-/dev/null}"

    rc=${PIPESTATUS[0]}
    if [[ $rc -eq 0 ]]; then
      ok "Jenkins instalado via Helm"
      APPLIED=$((APPLIED + 1))
    else
      fail "Helm install Jenkins falló (exit $rc)"
      print_summary "$MODULE_NAME"; exit 1
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría Jenkins en ${JENKINS_NAMESPACE}"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# Esperar Jenkins Ready
# -----------------------------------------------------------------------------
section "10.5 — JENKINS READY"

if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Esperando Jenkins (max 5 min — descarga plugins)..."
  WAIT=0
  JENKINS_READY=false
  while [[ $WAIT -lt 300 ]]; do
    RUNNING=$(kubectl get pods -n "${JENKINS_NAMESPACE}" \
      --no-headers 2>/dev/null | grep -c "Running" || true)
    TOTAL=$(kubectl get pods -n "${JENKINS_NAMESPACE}" \
      --no-headers 2>/dev/null | wc -l)
    if [[ $TOTAL -gt 0 && "$RUNNING" -eq "$TOTAL" ]]; then
      JENKINS_READY=true
      break
    fi
    printf "  Jenkins pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 10; WAIT=$((WAIT + 10))
  done
  echo ""

  if [[ "$JENKINS_READY" == true ]]; then
    ok "Jenkins Running"
  else
    warn "Jenkins no Ready aún — puede seguir descargando plugins"
  fi

  # Obtener password admin
  JENKINS_PASSWORD=$(kubectl exec -n "${JENKINS_NAMESPACE}" \
    "$(kubectl get pods -n "${JENKINS_NAMESPACE}" -l app.kubernetes.io/name=jenkins \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)" -- \
    cat /run/secrets/additional/chart-admin-password 2>/dev/null || \
    kubectl get secret jenkins -n "${JENKINS_NAMESPACE}" \
    -o jsonpath="{.data.jenkins-admin-password}" 2>/dev/null | base64 -d || \
    echo "NO DISPONIBLE")

  log ""
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
  log "  ${BOLD}  Jenkins:${NC}"
  log "  ${CYAN}  http://10.10.20.101:${JENKINS_NODEPORT:-32000}${NC}"
  log "  ${CYAN}  Usuario: admin${NC}"
  log "  ${CYAN}  Password: ${JENKINS_PASSWORD}${NC}"
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"

  if [[ "$JENKINS_PASSWORD" != "NO DISPONIBLE" ]]; then
    echo "admin:$JENKINS_PASSWORD" > /tmp/jenkins-admin-pass.txt
    chmod 600 /tmp/jenkins-admin-pass.txt
    ok "Credenciales guardadas en /tmp/jenkins-admin-pass.txt"
  fi

  # ConfigMap JCasC para Vault — separado del helm install para evitar problemas de formato
  if ! kubectl get configmap jenkins-jcasc-vault -n "${JENKINS_NAMESPACE}" &>/dev/null; then
    info "Aplicando JCasC ConfigMap para Vault..."
    kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << 'JCASC'
apiVersion: v1
kind: ConfigMap
metadata:
  name: jenkins-jcasc-vault
  namespace: ci-cd
  labels:
    app.kubernetes.io/managed-by: homelab-iac
data:
  vault.yaml: |
    unclassified:
      hashicorpVault:
        configuration:
          vaultUrl: "http://vault.vault.svc.cluster.local:8200"
          engineVersion: 2
JCASC
    ok "JCasC ConfigMap para Vault creado"
    APPLIED=$((APPLIED + 1))
  else
    skip "JCasC ConfigMap vault ya existe"
  fi

  log ""
  info "Pods Jenkins:"
  kubectl get pods -n "${JENKINS_NAMESPACE}" -o wide 2>/dev/null | \
    tee -a "${LOG_FILE:-/dev/null}" || true

  log ""
  info "PVC Jenkins:"
  kubectl get pvc -n "${JENKINS_NAMESPACE}" 2>/dev/null | \
    tee -a "${LOG_FILE:-/dev/null}" || true
fi

print_summary "$MODULE_NAME"
