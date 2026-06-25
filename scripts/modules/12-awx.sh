#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 12: AWX (Ansible Tower)  v1.0
#  Despliega AWX via AWX Operator con:
#    - AWX Operator en namespace awx
#    - Instancia AWX con Longhorn PVC
#    - Inventario dinámico del cluster K3s
#    - Integración Vault para credenciales
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="12-AWX"
reset_counters
AWX_USE_KUSTOMIZE=false

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
section "12.1 — NAMESPACE"
if kubectl get namespace "${AWX_NAMESPACE}" &>/dev/null; then
  skip "Namespace ${AWX_NAMESPACE} ya existe"
else
  do_run "Crear namespace ${AWX_NAMESPACE}" \
    kubectl create namespace "${AWX_NAMESPACE}"
fi

# -----------------------------------------------------------------------------
# AWX Operator via Helm
# -----------------------------------------------------------------------------
section "12.2 — AWX OPERATOR"

if helm repo list 2>/dev/null | grep -q "^awx-operator"; then
  skip "Repo awx-operator ya agregado"
else
  # Probar URLs conocidas del repo AWX Operator
  AWX_REPO_URL=""
  for TRY_URL in \
    "https://ansible-community.github.io/awx-operator-helm/" \
    "https://ansible.github.io/awx-operator/" \
    "https://github.com/ansible/awx-operator/releases/download"; do
    if curl -fsSL --max-time 5 "${TRY_URL}/index.yaml" &>/dev/null 2>&1; then
      AWX_REPO_URL="$TRY_URL"
      break
    fi
  done

  if [[ -z "$AWX_REPO_URL" ]]; then
    warn "Helm repo AWX Operator no encontrado — usando método kustomize (oficial)"
    AWX_USE_KUSTOMIZE=true
  else
    do_run "Agregar repo awx-operator" \
      helm repo add awx-operator "$AWX_REPO_URL"
    AWX_USE_KUSTOMIZE=false
  fi
fi
do_run_soft "Actualizar repos" helm repo update

if helm status awx-operator -n "${AWX_NAMESPACE}" &>/dev/null; then
  CURRENT=$(helm list -n "${AWX_NAMESPACE}" | grep awx-operator | awk '{print $9}')
  skip "AWX Operator ya instalado ($CURRENT)"
elif kubectl get deployment awx-operator-controller-manager -n "${AWX_NAMESPACE}" &>/dev/null; then
  skip "AWX Operator ya instalado via kustomize"
else
  VERSION_FLAG=""
  AWX_VERSION="${AWX_OPERATOR_VERSION:-2.19.1}"
  [[ -n "${AWX_OPERATOR_VERSION:-}" ]] && VERSION_FLAG="--version ${AWX_OPERATOR_VERSION}"

  info "Instalando AWX Operator..."

  if [[ "${DRY_RUN:-false}" == false ]]; then
    if [[ "${AWX_USE_KUSTOMIZE:-false}" == false ]] && helm repo list 2>/dev/null | grep -q "^awx-operator"; then
      # Método Helm
      # shellcheck disable=SC2086
      helm install awx-operator awx-operator/awx-operator $VERSION_FLAG         --namespace "${AWX_NAMESPACE}"         --set "AWX.enabled=false"         2>&1 | tee -a "${LOG_FILE:-/dev/null}"
      rc=${PIPESTATUS[0]}
    else
      # Método kustomize (oficial de Ansible)
      info "Usando método kustomize (oficial AWX)..."
      if ! command -v kustomize &>/dev/null; then
        curl -fsSL "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh"           | bash >> "${LOG_FILE:-/dev/null}" 2>&1
        mv kustomize /usr/local/bin/ 2>/dev/null || true
      fi
      kustomize build "https://github.com/ansible/awx-operator/config/default?ref=${AWX_VERSION}"         | kubectl apply -n "${AWX_NAMESPACE}" -f - >> "${LOG_FILE:-/dev/null}" 2>&1
      rc=$?
    fi

    if [[ $rc -eq 0 ]]; then
      ok "AWX Operator instalado"
      APPLIED=$((APPLIED + 1))
    else
      fail "AWX Operator instalación falló (exit $rc)"
      print_summary "$MODULE_NAME"; exit 1
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría AWX Operator en ${AWX_NAMESPACE}"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# Esperar que el Operator esté Running
# -----------------------------------------------------------------------------
section "12.3 — OPERATOR READY"

if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Esperando AWX Operator (max 2 min)..."
  WAIT=0
  OP_READY=false
  while [[ $WAIT -lt 120 ]]; do
    RUNNING=$(kubectl get pods -n "${AWX_NAMESPACE}" \
      --no-headers 2>/dev/null | grep -c "Running" || true)
    TOTAL=$(kubectl get pods -n "${AWX_NAMESPACE}" \
      --no-headers 2>/dev/null | wc -l)
    if [[ $TOTAL -gt 0 && "$RUNNING" -eq "$TOTAL" ]]; then
      OP_READY=true; break
    fi
    printf "  AWX Operator pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 5; WAIT=$((WAIT + 5))
  done
  echo ""
  [[ "$OP_READY" == true ]] && ok "AWX Operator Running" || \
    warn "AWX Operator no Ready aún"
fi

# -----------------------------------------------------------------------------
# Instancia AWX (Custom Resource)
# -----------------------------------------------------------------------------
section "12.4 — AWX INSTANCE"

if kubectl get awx homelab-awx -n "${AWX_NAMESPACE}" &>/dev/null; then
  skip "AWX instance homelab-awx ya existe"
else
  info "Creando instancia AWX..."
  if [[ "${DRY_RUN:-false}" == false ]]; then
    kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << EOF
---
apiVersion: awx.ansible.com/v1beta1
kind: AWX
metadata:
  name: homelab-awx
  namespace: ${AWX_NAMESPACE}
  labels:
    app.kubernetes.io/managed-by: homelab-iac
spec:
  service_type: NodePort
  nodeport_port: 30080

  # Storage — postgres usa local-path (NO Longhorn)
  # CRÍTICO: Longhorn no aplica fsGroup correcto para el usuario postgres (GID 26)
  # Resultado: "Permission denied" en /var/lib/pgsql/data/userdata
  # local-path no tiene este problema y postgres arranca en <10s
  postgres_storage_class: local-path
  postgres_storage_requirements:
    requests:
      storage: 10Gi

  projects_persistence: true
  projects_storage_class: longhorn
  projects_storage_size: ${AWX_PVC_SIZE:-20Gi}
  projects_storage_access_mode: ReadWriteOnce

  # Resources
  web_resource_requirements:
    requests:
      cpu: 200m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 2Gi

  task_resource_requirements:
    requests:
      cpu: 200m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 2Gi

  redis_resource_requirements:
    requests:
      cpu: 50m
      memory: 64Mi

  postgres_resource_requirements:
    requests:
      cpu: 100m
      memory: 128Mi

  extra_settings:
    - setting: DEFAULT_EXECUTION_ENVIRONMENT_IMAGE
      value: 'quay.io/ansible/awx-ee:latest'
EOF
    rc=$?
    if [[ $rc -eq 0 ]]; then
      ok "AWX instance homelab-awx creada"
      APPLIED=$((APPLIED + 1))
    else
      fail "AWX instance creation falló (exit $rc)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se crearía AWX instance homelab-awx"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# Esperar AWX Ready (puede tardar 5-10 min)
# -----------------------------------------------------------------------------
section "12.5 — AWX READY"

if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Esperando AWX (max 10 min — descarga imágenes)..."
  WAIT=0
  AWX_READY=false
  while [[ $WAIT -lt 600 ]]; do
    AWX_STATUS=$(kubectl get awx homelab-awx -n "${AWX_NAMESPACE}" \
      -o jsonpath='{.status.conditions[?(@.type=="Running")].status}' 2>/dev/null || echo "")
    if [[ "$AWX_STATUS" == "True" ]]; then
      AWX_READY=true; break
    fi
    RUNNING=$(kubectl get pods -n "${AWX_NAMESPACE}" \
      --no-headers 2>/dev/null | grep -c "Running" || true)
    TOTAL=$(kubectl get pods -n "${AWX_NAMESPACE}" \
      --no-headers 2>/dev/null | wc -l)
    printf "  AWX pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 15; WAIT=$((WAIT + 15))
  done
  echo ""

  if [[ "$AWX_READY" == true ]]; then
    ok "AWX Running"
  else
    warn "AWX aún inicializando — puede necesitar más tiempo (normal en primera instalación)"
    info "Verificar: kubectl get pods -n ${AWX_NAMESPACE}"
  fi

  # Obtener password admin
  AWX_PASSWORD=$(kubectl get secret homelab-awx-admin-password \
    -n "${AWX_NAMESPACE}" \
    -o jsonpath="{.data.password}" 2>/dev/null | base64 -d || echo "NO DISPONIBLE")

  log ""
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
  log "  ${BOLD}  AWX UI:${NC}"
  log "  ${CYAN}  http://10.10.20.101:30080${NC}"
  log "  ${CYAN}  Usuario: admin${NC}"
  log "  ${CYAN}  Password: ${AWX_PASSWORD}${NC}"
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"

  if [[ "$AWX_PASSWORD" != "NO DISPONIBLE" ]]; then
    echo "admin:$AWX_PASSWORD" > /tmp/awx-admin-pass.txt
    chmod 600 /tmp/awx-admin-pass.txt
    ok "Credenciales guardadas en /tmp/awx-admin-pass.txt"
    APPLIED=$((APPLIED + 1))

    # Guardar credenciales en Vault
    if kubectl get pod vault-0 -n "${VAULT_NAMESPACE:-vault}" &>/dev/null; then
      NODE_IP=$(kubectl get nodes -l node-role.kubernetes.io/control-plane=true         -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)
      kubectl exec vault-0 -n "${VAULT_NAMESPACE:-vault}" --         env VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-homelab-root}"             VAULT_ADDR="http://127.0.0.1:8200"         vault kv put secret/awx/admin           host="http://${NODE_IP}:30080"           username="admin"           password="${AWX_PASSWORD}"           version="$(kubectl get awx homelab-awx -n "${AWX_NAMESPACE}"             -o jsonpath='{.status.version}' 2>/dev/null || echo 'unknown')"         >> "${LOG_FILE:-/dev/null}" 2>&1 &&         ok "Credenciales AWX guardadas en Vault (secret/awx/admin)" &&         APPLIED=$((APPLIED + 1)) ||         warn "No se pudieron guardar credenciales AWX en Vault"
    fi
  fi

  log ""
  info "Pods AWX:"
  kubectl get pods -n "${AWX_NAMESPACE}" 2>/dev/null | \
    tee -a "${LOG_FILE:-/dev/null}" || true
fi

print_summary "$MODULE_NAME"
