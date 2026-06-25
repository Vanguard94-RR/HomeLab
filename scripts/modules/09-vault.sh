#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 09: HashiCorp Vault  v1.0
#  Despliega Vault en dev mode con:
#    - K8s auth method habilitado
#    - Políticas base para Jenkins, ArgoCD, Control-M
#    - KV secrets engine v2
#    - Auto-init via Job de Kubernetes
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="09-VAULT"
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

# -----------------------------------------------------------------------------
# Namespace
# -----------------------------------------------------------------------------
section "09.1 — NAMESPACE"
if kubectl get namespace "${VAULT_NAMESPACE}" &>/dev/null; then
  skip "Namespace ${VAULT_NAMESPACE} ya existe"
else
  do_run "Crear namespace ${VAULT_NAMESPACE}" \
    kubectl create namespace "${VAULT_NAMESPACE}"
fi

# -----------------------------------------------------------------------------
# Helm repo HashiCorp
# -----------------------------------------------------------------------------
section "09.2 — HELM REPO"
if helm repo list 2>/dev/null | grep -q "^hashicorp"; then
  skip "Repo hashicorp ya agregado"
else
  do_run "Agregar repo hashicorp" \
    helm repo add hashicorp https://helm.releases.hashicorp.com
fi
do_run_soft "Actualizar repos" helm repo update

# -----------------------------------------------------------------------------
# Instalar Vault
# -----------------------------------------------------------------------------
section "09.3 — VAULT INSTALL"

if helm status vault -n "${VAULT_NAMESPACE}" &>/dev/null; then
  CURRENT=$(helm list -n "${VAULT_NAMESPACE}" | grep vault | awk '{print $9}')
  skip "Vault ya instalado ($CURRENT)"
else
  VERSION_FLAG=""
  [[ -n "${VAULT_VERSION:-}" ]] && VERSION_FLAG="--version ${VAULT_VERSION}"

  info "Modo: ${VAULT_MODE:-dev}"
  info "Namespace: ${VAULT_NAMESPACE}"
  log ""

  if [[ "${DRY_RUN:-false}" == false ]]; then
    # shellcheck disable=SC2086
    helm install vault hashicorp/vault $VERSION_FLAG \
      --namespace "${VAULT_NAMESPACE}" \
      --set "server.dev.enabled=true" \
      --set "server.dev.devRootToken=${VAULT_DEV_ROOT_TOKEN:-homelab-root}" \
      --set "server.logLevel=info" \
      --set "server.resources.requests.cpu=100m" \
      --set "server.resources.requests.memory=256Mi" \
      --set "server.resources.limits.cpu=500m" \
      --set "server.resources.limits.memory=512Mi" \
      --set "server.dataStorage.enabled=false" \
      --set "ui.enabled=true" \
      --set "ui.serviceType=ClusterIP" \
      --set "injector.enabled=true" \
      --set "injector.resources.requests.cpu=50m" \
      --set "injector.resources.requests.memory=64Mi" \
      2>&1 | tee -a "${LOG_FILE:-/dev/null}"

    rc=${PIPESTATUS[0]}
    if [[ $rc -eq 0 ]]; then
      ok "Vault instalado via Helm"
      APPLIED=$((APPLIED + 1))
    else
      fail "Helm install Vault falló (exit $rc)"
      print_summary "$MODULE_NAME"; exit 1
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría Vault dev mode en ${VAULT_NAMESPACE}"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# Esperar que Vault esté Running
# -----------------------------------------------------------------------------
section "09.4 — VAULT READY"

if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Esperando pod vault-0 (max 3 min)..."
  WAIT=0
  VAULT_READY=false
  while [[ $WAIT -lt 180 ]]; do
    STATUS=$(kubectl get pod vault-0 -n "${VAULT_NAMESPACE}" \
      --no-headers 2>/dev/null | awk '{print $3}')
    if [[ "$STATUS" == "Running" ]]; then
      VAULT_READY=true
      break
    fi
    printf "  vault-0 status: %s\r" "$STATUS"
    sleep 5; WAIT=$((WAIT + 5))
  done
  echo ""

  if [[ "$VAULT_READY" == true ]]; then
    ok "vault-0 Running"
  else
    fail "vault-0 no Ready después de 3 min"
    print_summary "$MODULE_NAME"; exit 1
  fi

  # Verificar que Vault responde
  sleep 5
  VAULT_STATUS=$(kubectl exec vault-0 -n "${VAULT_NAMESPACE}" -- \
    vault status -format=json 2>/dev/null | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('initialized','?'),d.get('sealed','?'))" \
    2>/dev/null || echo "unknown unknown")
  VAULT_INIT=$(echo "$VAULT_STATUS" | awk '{print $1}')
  VAULT_SEALED=$(echo "$VAULT_STATUS" | awk '{print $2}')
  info "Vault initialized: $VAULT_INIT | sealed: $VAULT_SEALED"
fi

# -----------------------------------------------------------------------------
# Configurar Vault — K8s auth + KV + políticas
# -----------------------------------------------------------------------------
section "09.5 — VAULT CONFIG"

VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-homelab-root}"
VAULT_ADDR="http://vault.${VAULT_NAMESPACE}.svc.cluster.local:8200"

if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Configurando Vault via kubectl exec..."

  # Función helper para ejecutar comandos en vault-0
  vault_exec() {
    kubectl exec vault-0 -n "${VAULT_NAMESPACE}" -- \
      env VAULT_TOKEN="${VAULT_TOKEN}" VAULT_ADDR="http://127.0.0.1:8200" \
      vault "$@" 2>/dev/null
  }

  # KV secrets engine v2
  if vault_exec secrets list 2>/dev/null | grep -q "^secret/"; then
    skip "KV secrets engine ya habilitado en secret/"
  else
    if vault_exec secrets enable -path=secret -version=2 kv >> "${LOG_FILE:-/dev/null}" 2>&1; then
      ok "KV v2 habilitado en secret/"
      APPLIED=$((APPLIED + 1))
    else
      warn "KV engine — puede ya existir en dev mode"
    fi
  fi

  # Kubernetes auth method
  if vault_exec auth list 2>/dev/null | grep -q "^kubernetes/"; then
    skip "K8s auth method ya habilitado"
  else
    vault_exec auth enable kubernetes >> "${LOG_FILE:-/dev/null}" 2>&1 && \
      ok "K8s auth method habilitado" && APPLIED=$((APPLIED + 1)) || \
      warn "K8s auth enable — puede ya existir"
  fi

  # Configurar K8s auth con las credenciales del cluster
  info "Configurando K8s auth..."
  K8S_HOST="https://kubernetes.default.svc"
  K8S_CA=$(kubectl config view --raw --minify --flatten \
    -o jsonpath='{.clusters[].cluster.certificate-authority-data}' 2>/dev/null | base64 -d)

  if [[ -n "$K8S_CA" ]]; then
    vault_exec write auth/kubernetes/config \
      kubernetes_host="$K8S_HOST" \
      kubernetes_ca_cert="$K8S_CA" \
      >> "${LOG_FILE:-/dev/null}" 2>&1 && \
      ok "K8s auth configurado" && APPLIED=$((APPLIED + 1)) || \
      warn "K8s auth config — revisar manualmente"
  else
    warn "No se pudo obtener CA del cluster para K8s auth"
  fi

  # Políticas base
  info "Creando políticas..."

  # Política Jenkins — acceso a ci-cd/*
  vault_exec policy write jenkins - >> "${LOG_FILE:-/dev/null}" 2>&1 << 'POLICY'
path "secret/data/jenkins/*" {
  capabilities = ["read", "list"]
}
path "secret/data/ci-cd/*" {
  capabilities = ["read", "list"]
}
POLICY
  ok "Política jenkins creada" && APPLIED=$((APPLIED + 1))

  # Política Control-M — acceso a workload-automation/*
  vault_exec policy write controlm - >> "${LOG_FILE:-/dev/null}" 2>&1 << 'POLICY'
path "secret/data/workload-automation/*" {
  capabilities = ["read", "list"]
}
path "secret/data/controlm/*" {
  capabilities = ["read", "list"]
}
POLICY
  ok "Política controlm creada" && APPLIED=$((APPLIED + 1))

  # Política AWX — acceso a awx/*
  vault_exec policy write awx - >> "${LOG_FILE:-/dev/null}" 2>&1 << 'POLICY'
path "secret/data/awx/*" {
  capabilities = ["read", "list"]
}
path "secret/data/ansible/*" {
  capabilities = ["read", "list"]
}
POLICY
  ok "Política awx creada" && APPLIED=$((APPLIED + 1))

  # Política admin — acceso total (para ArgoCD y operaciones manuales)
  vault_exec policy write homelab-admin - >> "${LOG_FILE:-/dev/null}" 2>&1<< 'POLICY'
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "auth/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "sys/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
POLICY
  ok "Política homelab-admin creada" && APPLIED=$((APPLIED + 1))

  # Roles K8s para cada namespace
  for ROLE_DEF in "jenkins:ci-cd:jenkins" "controlm:workload-automation:controlm" "awx:awx:awx"; do
    ROLE_NAME=$(echo "$ROLE_DEF" | cut -d: -f1)
    ROLE_NS=$(echo "$ROLE_DEF" | cut -d: -f2)
    ROLE_POLICY=$(echo "$ROLE_DEF" | cut -d: -f3)

    vault_exec write "auth/kubernetes/role/${ROLE_NAME}" \
      bound_service_account_names="*" \
      bound_service_account_namespaces="${ROLE_NS}" \
      policies="${ROLE_POLICY}" \
      ttl=1h \
      >> "${LOG_FILE:-/dev/null}" 2>&1 && \
      ok "K8s role ${ROLE_NAME} creado (ns: ${ROLE_NS})" && \
      APPLIED=$((APPLIED + 1)) || \
      warn "K8s role ${ROLE_NAME} — revisar manualmente"
  done

  # Secrets iniciales de ejemplo
  info "Cargando secrets iniciales..."
  vault_exec kv put secret/jenkins/config \
    admin_user="admin" \
    admin_password="change-me-$(date +%s | sha256sum | head -c 8)" \
    >> "${LOG_FILE:-/dev/null}" 2>&1 && \
    ok "Secret jenkins/config creado" && APPLIED=$((APPLIED + 1))

  vault_exec kv put secret/homelab/cluster \
    k3s_api="https://10.10.20.101:6443" \
    argocd_password="${ARGOCD_PASSWORD:-changeme}" \
    >> "${LOG_FILE:-/dev/null}" 2>&1 && \
    ok "Secret homelab/cluster creado" && APPLIED=$((APPLIED + 1))

fi

# -----------------------------------------------------------------------------
# Estado final
# -----------------------------------------------------------------------------
section "09.6 — ESTADO"

if [[ "${DRY_RUN:-false}" == false ]]; then
  log ""
  info "Pods Vault:"
  kubectl get pods -n "${VAULT_NAMESPACE}" -o wide 2>/dev/null | \
    tee -a "${LOG_FILE:-/dev/null}" || true

  log ""
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
  log "  ${BOLD}  Vault UI:${NC}"
  log "  ${CYAN}  kubectl port-forward svc/vault-ui -n ${VAULT_NAMESPACE} 8200:8200${NC}"
  log "  ${CYAN}  http://localhost:8200${NC}"
  log "  ${CYAN}  Token: ${VAULT_TOKEN}${NC}"
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
  log ""
  log "  ${BOLD}  CLI directo:${NC}"
  log "  ${CYAN}  kubectl exec -it vault-0 -n ${VAULT_NAMESPACE} -- vault status${NC}"
  log "  ${CYAN}  kubectl exec -it vault-0 -n ${VAULT_NAMESPACE} -- \\${NC}"
  log "  ${CYAN}    env VAULT_TOKEN=${VAULT_TOKEN} VAULT_ADDR=http://127.0.0.1:8200 \\${NC}"
  log "  ${CYAN}    vault kv list secret/${NC}"
fi

print_summary "$MODULE_NAME"
