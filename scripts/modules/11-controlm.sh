#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 11: Control-M Lab  v1.0
#  Despliega Control-M en el namespace workload-automation con:
#    - Longhorn PVC 50GB
#    - Integración Vault para secretos
#    - NodePort para acceso UI
#    - ServiceAccount con RBAC mínimo
#  Solo se ejecuta en el control-plane
#
#  PREREQUISITO: Licencia de Control-M (BMC) requerida
#  Ver: HomeLab-ControlM-Manual.md para detalles de configuración
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="11-CONTROLM"
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
if ! helm status vault -n "${VAULT_NAMESPACE:-vault}" &>/dev/null; then
  fail "Vault no instalado — ejecutar módulo 09 primero"
  print_summary "$MODULE_NAME"; exit 1
fi

if ! helm status longhorn -n "${LONGHORN_NAMESPACE:-longhorn-system}" &>/dev/null; then
  fail "Longhorn no instalado — ejecutar módulo 05 primero"
  print_summary "$MODULE_NAME"; exit 1
fi

# -----------------------------------------------------------------------------
# Namespace — ya creado por ArgoCD (workload-automation/namespace.yaml)
# -----------------------------------------------------------------------------
section "11.1 — NAMESPACE"
if kubectl get namespace "${CONTROLM_NAMESPACE}" &>/dev/null; then
  skip "Namespace ${CONTROLM_NAMESPACE} ya existe (ArgoCD)"
else
  do_run "Crear namespace ${CONTROLM_NAMESPACE}" \
    kubectl create namespace "${CONTROLM_NAMESPACE}"
fi

# -----------------------------------------------------------------------------
# ServiceAccount + RBAC
# -----------------------------------------------------------------------------
section "11.2 — RBAC"

if kubectl get serviceaccount controlm -n "${CONTROLM_NAMESPACE}" &>/dev/null; then
  skip "ServiceAccount controlm ya existe"
else
  if [[ "${DRY_RUN:-false}" == false ]]; then
    kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << 'EOF'
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: controlm
  namespace: workload-automation
  labels:
    app: controlm
    app.kubernetes.io/managed-by: homelab-iac
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: controlm-role
  namespace: workload-automation
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "services", "configmaps"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: controlm-rolebinding
  namespace: workload-automation
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: controlm-role
subjects:
  - kind: ServiceAccount
    name: controlm
    namespace: workload-automation
EOF
    ok "ServiceAccount + RBAC creados"
    APPLIED=$((APPLIED + 1))
  else
    log "  ${YELLOW}[DRY]${NC}  Se crearía ServiceAccount + RBAC para controlm"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# PVC Longhorn 50GB
# -----------------------------------------------------------------------------
section "11.3 — PVC LONGHORN"

if kubectl get pvc controlm-data -n "${CONTROLM_NAMESPACE}" &>/dev/null; then
  skip "PVC controlm-data ya existe"
else
  if [[ "${DRY_RUN:-false}" == false ]]; then
    kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: controlm-data
  namespace: ${CONTROLM_NAMESPACE}
  labels:
    app: controlm
    app.kubernetes.io/managed-by: homelab-iac
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: longhorn
  resources:
    requests:
      storage: ${CONTROLM_PVC_SIZE:-50Gi}
EOF
    rc=$?
    if [[ $rc -eq 0 ]]; then
      ok "PVC controlm-data creado (${CONTROLM_PVC_SIZE:-50Gi})"
      APPLIED=$((APPLIED + 1))
    else
      fail "PVC creation falló (exit $rc)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se crearía PVC controlm-data (${CONTROLM_PVC_SIZE:-50Gi})"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# ConfigMap con configuración base
# -----------------------------------------------------------------------------
section "11.4 — CONFIG"

if kubectl get configmap controlm-config -n "${CONTROLM_NAMESPACE}" &>/dev/null; then
  skip "ConfigMap controlm-config ya existe"
else
  if [[ "${DRY_RUN:-false}" == false ]]; then
    kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: controlm-config
  namespace: ${CONTROLM_NAMESPACE}
  labels:
    app: controlm
    app.kubernetes.io/managed-by: homelab-iac
data:
  # Configuración base Control-M
  CTM_SERVER_NAME: "homelab-ctm"
  CTM_AGENT_PORT: "7006"
  CTM_SERVER_PORT: "7080"
  CTM_NAMESPACE: "${CONTROLM_NAMESPACE}"
  CTM_K3S_API: "https://10.10.20.101:6443"
  # Integración
  VAULT_ADDR: "http://vault.vault.svc.cluster.local:8200"
  VAULT_ROLE: "controlm"
  ARGOCD_SERVER: "http://argocd-server.argocd.svc.cluster.local:80"
  JENKINS_URL: "http://jenkins.ci-cd.svc.cluster.local:8080"
  # Nota: secrets en Vault en secret/controlm/*
EOF
    ok "ConfigMap controlm-config creado"
    APPLIED=$((APPLIED + 1))
  else
    log "  ${YELLOW}[DRY]${NC}  Se crearía ConfigMap controlm-config"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# NOTA: Deploy del servidor Control-M
# -----------------------------------------------------------------------------
section "11.5 — CONTROLM SERVER"

log ""
log "  ${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}"
log "  ${YELLOW}║  ACCIÓN MANUAL REQUERIDA${NC}"
log "  ${YELLOW}╠══════════════════════════════════════════════════════════╣${NC}"
log "  ${YELLOW}║  El servidor Control-M requiere:${NC}"
log "  ${YELLOW}║    1. Imagen Docker: controlm/agent o enterprise server${NC}"
log "  ${YELLOW}║    2. Licencia BMC válida${NC}"
log "  ${YELLOW}║    3. Ver: HomeLab-ControlM-Manual.md (sección Deploy K3s)${NC}"
log "  ${YELLOW}║${NC}"
log "  ${YELLOW}║  Namespace y PVC listos. Cuando tengas la imagen:${NC}"
log "  ${YELLOW}║    kubectl apply -f gitops/apps/workload-automation/ctm-deploy.yaml${NC}"
log "  ${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}"
log ""

info "Estado del namespace ${CONTROLM_NAMESPACE}:"
kubectl get all -n "${CONTROLM_NAMESPACE}" 2>/dev/null | \
  tee -a "${LOG_FILE:-/dev/null}" || true

log ""
info "PVC disponible:"
kubectl get pvc -n "${CONTROLM_NAMESPACE}" 2>/dev/null | \
  tee -a "${LOG_FILE:-/dev/null}" || true

print_summary "$MODULE_NAME"
