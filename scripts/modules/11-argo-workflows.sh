#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 15: Argo Workflows  v1.0
#  Equivalente open-source a Control-M — Kubernetes nativo
#
#  Despliega en namespace workload-automation:
#    - Argo Workflows Controller + Server (UI)
#    - Workflow Archive → PostgreSQL (databases namespace)
#    - CronWorkflow support (equivalente a schedules de CTM)
#    - REST API completa (equivalente a Automation API de CTM)
#    - NodePort 30888 para UI
#    - Ingress Traefik: workflows.lab.internal
#
#  Integración con stack existente:
#    - PostgreSQL: workflows archive (secret/databases/postgresql en Vault)
#    - Vault: credenciales vía K8s auth
#    - ArgoCD: gestión GitOps de WorkflowTemplates
#    - Jenkins: trigger workflows desde pipelines CI/CD
#
#  Conceptos CTM → Argo Workflows:
#    Job/Task          → Step en un Workflow
#    Job Flow/Folder   → Workflow (DAG o Steps)
#    Schedule          → CronWorkflow
#    Control-M Server  → Argo Workflows Controller
#    Workbench UI      → Argo Workflows UI
#    Automation API    → Argo Workflows REST API
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="11-ARGO-WORKFLOWS"
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

if ! kubectl get namespace databases &>/dev/null; then
  fail "Namespace databases no existe — ejecutar módulo 14 primero"
  print_summary "$MODULE_NAME"; exit 1
fi

# Verificar PostgreSQL disponible
if ! kubectl get pod postgresql-0 -n databases &>/dev/null; then
  fail "PostgreSQL no disponible — ejecutar módulo 14 primero"
  print_summary "$MODULE_NAME"; exit 1
fi

# -----------------------------------------------------------------------------
# Helm repo Argo
# -----------------------------------------------------------------------------
section "15.1 — HELM REPO"
if helm repo list 2>/dev/null | grep -q "^argo"; then
  skip "Repo argo ya agregado"
else
  do_run "Agregar repo argo" \
    helm repo add argo https://argoproj.github.io/argo-helm
fi
do_run_soft "Actualizar repos" helm repo update

# -----------------------------------------------------------------------------
# Namespace — ya existe (workload-automation creado por módulo 11)
# -----------------------------------------------------------------------------
section "15.2 — NAMESPACE"
if kubectl get namespace "${CONTROLM_NAMESPACE:-workload-automation}" &>/dev/null; then
  skip "Namespace ${CONTROLM_NAMESPACE:-workload-automation} ya existe"
else
  do_run "Crear namespace workload-automation" \
    kubectl create namespace workload-automation
fi

WF_NS="${CONTROLM_NAMESPACE:-workload-automation}"

# -----------------------------------------------------------------------------
# Obtener credenciales PostgreSQL desde Vault para workflow archive
# -----------------------------------------------------------------------------
section "15.3 — POSTGRESQL CREDENTIALS"

PG_PASSWORD=""
if kubectl get pod vault-0 -n "${VAULT_NAMESPACE:-vault}" &>/dev/null; then
  PG_PASSWORD=$(kubectl exec vault-0 -n "${VAULT_NAMESPACE:-vault}" -- \
    env VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-homelab-root}" \
        VAULT_ADDR="http://127.0.0.1:8200" \
    vault kv get -field=password secret/databases/postgresql 2>/dev/null || echo "")

  if [[ -n "$PG_PASSWORD" ]]; then
    ok "Credenciales PostgreSQL obtenidas de Vault"
  else
    warn "No se pudo obtener password de Vault — usando valor por defecto"
    PG_PASSWORD="homelab"
  fi
else
  warn "Vault no disponible — usando credenciales por defecto"
  PG_PASSWORD="homelab"
fi

# Crear Secret con credenciales PostgreSQL para Argo Workflows
if kubectl get secret argo-postgresql-creds -n "${WF_NS}" &>/dev/null; then
  skip "Secret argo-postgresql-creds ya existe"
else
  if [[ "${DRY_RUN:-false}" == false ]]; then
    kubectl create secret generic argo-postgresql-creds \
      -n "${WF_NS}" \
      --from-literal=password="${PG_PASSWORD}" \
      >> "${LOG_FILE:-/dev/null}" 2>&1 && \
      ok "Secret argo-postgresql-creds creado" && \
      APPLIED=$((APPLIED + 1)) || \
      fail "No se pudo crear Secret PostgreSQL"
  fi
fi

# -----------------------------------------------------------------------------
# Instalar Argo Workflows
# -----------------------------------------------------------------------------
section "15.4 — ARGO WORKFLOWS INSTALL"

if helm status argo-workflows -n "${WF_NS}" &>/dev/null; then
  CURRENT=$(helm list -n "${WF_NS}" | grep argo-workflows | awk '{print $9}')
  skip "Argo Workflows ya instalado ($CURRENT)"
else
  info "Namespace: ${WF_NS}"
  info "UI NodePort: 30888"
  info "PostgreSQL archive: postgresql.databases.svc.cluster.local:5432"
  log ""

  if [[ "${DRY_RUN:-false}" == false ]]; then
    helm install argo-workflows argo/argo-workflows \
      --namespace "${WF_NS}" \
      --set server.extraArgs[0]="--auth-mode=server" \
      --set server.serviceType=NodePort \
      --set server.nodePort=30888 \
      --set server.resources.requests.cpu=100m \
      --set server.resources.requests.memory=128Mi \
      --set server.resources.limits.cpu=500m \
      --set server.resources.limits.memory=256Mi \
      --set controller.resources.requests.cpu=100m \
      --set controller.resources.requests.memory=128Mi \
      --set controller.resources.limits.cpu=500m \
      --set controller.resources.limits.memory=256Mi \
      --set workflow.serviceAccount.create=true \
      --set workflow.serviceAccount.name=argo-workflow \
      --set workflow.rbac.create=true \
      --set executor.resources.requests.cpu=100m \
      --set executor.resources.requests.memory=64Mi \
      --set useStatefulSet=true \
      --set controller.persistence.archive=true \
      --set controller.persistence.postgresql.host=postgresql.databases.svc.cluster.local \
      --set controller.persistence.postgresql.port=5432 \
      --set controller.persistence.postgresql.database=homelab \
      --set controller.persistence.postgresql.tableName=argo_workflows \
      --set controller.persistence.postgresql.userNameSecret.name=argo-postgresql-creds \
      --set controller.persistence.postgresql.userNameSecret.key=username \
      --set controller.persistence.postgresql.passwordSecret.name=argo-postgresql-creds \
      --set controller.persistence.postgresql.passwordSecret.key=password \
      2>&1 | tee -a "${LOG_FILE:-/dev/null}"

    rc=${PIPESTATUS[0]}
    if [[ $rc -eq 0 ]]; then
      ok "Argo Workflows instalado"
      APPLIED=$((APPLIED + 1))
    else
      fail "Helm install Argo Workflows falló (exit $rc)"
      print_summary "$MODULE_NAME"; exit 1
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría Argo Workflows en ${WF_NS}"
    APPLIED=$((APPLIED + 1))
  fi
fi

# Agregar username al secret PostgreSQL (lo necesita Argo)
if [[ "${DRY_RUN:-false}" == false ]]; then
  kubectl patch secret argo-postgresql-creds -n "${WF_NS}" \
    --type=merge \
    -p '{"stringData":{"username":"homelab"}}' \
    >> "${LOG_FILE:-/dev/null}" 2>&1 || true
fi

# -----------------------------------------------------------------------------
# Ingress Traefik
# -----------------------------------------------------------------------------
section "15.5 — INGRESS"

if kubectl get ingress argo-workflows-ingress -n "${WF_NS}" &>/dev/null; then
  skip "Ingress argo-workflows-ingress ya existe"
else
  if [[ "${DRY_RUN:-false}" == false ]]; then
    kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argo-workflows-ingress
  namespace: ${WF_NS}
  labels:
    app.kubernetes.io/managed-by: homelab-iac
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
    - host: workflows.lab.internal
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argo-workflows-server
                port:
                  number: 2746
EOF
    ok "Ingress workflows.lab.internal creado"
    APPLIED=$((APPLIED + 1))
  fi
fi

# Guardar info en Vault
if kubectl get pod vault-0 -n "${VAULT_NAMESPACE:-vault}" &>/dev/null && \
   [[ "${DRY_RUN:-false}" == false ]]; then
  NODE_IP=$(kubectl get nodes -l node-role.kubernetes.io/control-plane=true \
    -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)
  kubectl exec vault-0 -n "${VAULT_NAMESPACE:-vault}" -- \
    env VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-homelab-root}" \
        VAULT_ADDR="http://127.0.0.1:8200" \
    vault kv put secret/workload-automation/argo-workflows \
      host="http://${NODE_IP}:30888" \
      ingress="http://workflows.lab.internal:30180" \
      auth_mode="server" \
      postgresql_archive="postgresql.databases.svc.cluster.local:5432/homelab" \
    >> "${LOG_FILE:-/dev/null}" 2>&1 && \
    ok "Config Argo Workflows guardada en Vault (secret/workload-automation/argo-workflows)" && \
    APPLIED=$((APPLIED + 1))
fi

# -----------------------------------------------------------------------------
# Esperar Ready
# -----------------------------------------------------------------------------
section "15.6 — READY"

if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Esperando Argo Workflows (max 3 min)..."
  WAIT=0
  AW_READY=false
  while [[ $WAIT -lt 180 ]]; do
    RUNNING=$(kubectl get pods -n "${WF_NS}" -l app.kubernetes.io/part-of=argo-workflows \
      --no-headers 2>/dev/null | grep -c "Running" || true)
    TOTAL=$(kubectl get pods -n "${WF_NS}" -l app.kubernetes.io/part-of=argo-workflows \
      --no-headers 2>/dev/null | wc -l)
    if [[ $TOTAL -gt 0 && "$RUNNING" -eq "$TOTAL" ]]; then
      AW_READY=true; break
    fi
    printf "  Argo Workflows pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 5; WAIT=$((WAIT + 5))
  done
  echo ""

  NODE_IP=$(kubectl get nodes -l node-role.kubernetes.io/control-plane=true \
    -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)

  if [[ "$AW_READY" == true ]]; then
    ok "Argo Workflows Running"
  else
    warn "Argo Workflows aún inicializando"
  fi

  log ""
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
  log "  ${BOLD}  Argo Workflows — Acceso:${NC}"
  log "  ${CYAN}  UI:              http://${NODE_IP}:30888${NC}"
  log "  ${CYAN}  Via Ingress:     http://workflows.lab.internal:30180${NC}"
  log "  ${CYAN}  REST API:        http://${NODE_IP}:30888/api/v1${NC}"
  log "  ${CYAN}  Auth:            Server mode (sin login)${NC}"
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
  log ""
  log "  ${BOLD}  Equivalencias CTM → Argo Workflows:${NC}"
  log "  ${CYAN}  Job/Task          → Step en un Workflow${NC}"
  log "  ${CYAN}  Job Flow/Folder   → Workflow (DAG o Steps)${NC}"
  log "  ${CYAN}  Schedule          → CronWorkflow${NC}"
  log "  ${CYAN}  Control-M Server  → Argo Workflows Controller${NC}"
  log "  ${CYAN}  Automation API    → REST API http://${NODE_IP}:30888/api/v1${NC}"
  log ""
  log "  ${BOLD}  Primer workflow de prueba:${NC}"
  log "  ${CYAN}  kubectl create -n ${WF_NS} -f - << 'WFEOF'${NC}"
  log "  ${CYAN}  apiVersion: argoproj.io/v1alpha1${NC}"
  log "  ${CYAN}  kind: Workflow${NC}"
  log "  ${CYAN}  metadata:${NC}"
  log "  ${CYAN}    generateName: hello-${NC}"
  log "  ${CYAN}  spec:${NC}"
  log "  ${CYAN}    entrypoint: hello${NC}"
  log "  ${CYAN}    templates:${NC}"
  log "  ${CYAN}    - name: hello${NC}"
  log "  ${CYAN}      container:${NC}"
  log "  ${CYAN}        image: alpine:latest${NC}"
  log "  ${CYAN}        command: [echo]${NC}"
  log "  ${CYAN}        args: [\"Hello from HomeLab!\"]${NC}"
  log "  ${CYAN}  WFEOF${NC}"

  log ""
  info "Pods workload-automation:"
  kubectl get pods -n "${WF_NS}" 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true
fi

print_summary "$MODULE_NAME"
