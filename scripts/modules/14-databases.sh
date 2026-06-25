#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 14: Databases  v1.0
#  Despliega en namespace 'databases':
#    - PostgreSQL (Bitnami) — single instance + Longhorn PVC
#    - Redis      (Bitnami) — single instance + Longhorn PVC
#    - MongoDB    (Bitnami) — single instance + Longhorn PVC
#
#  Credenciales almacenadas en Vault:
#    secret/databases/postgresql
#    secret/databases/redis
#    secret/databases/mongodb
#
#  Acceso interno al cluster:
#    postgresql.databases.svc.cluster.local:5432
#    redis-master.databases.svc.cluster.local:6379
#    mongodb.databases.svc.cluster.local:27017
#
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="14-DATABASES"
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

if ! helm status longhorn -n "${LONGHORN_NAMESPACE:-longhorn-system}" &>/dev/null; then
  fail "Longhorn no instalado — ejecutar módulo 05 primero"
  print_summary "$MODULE_NAME"; exit 1
fi

# -----------------------------------------------------------------------------
# Helm repo Bitnami
# -----------------------------------------------------------------------------
section "14.0 — HELM REPO BITNAMI"

if helm repo list 2>/dev/null | grep -q "^bitnami"; then
  skip "Repo bitnami ya agregado"
else
  do_run "Agregar repo bitnami" \
    helm repo add bitnami https://charts.bitnami.com/bitnami
fi
do_run_soft "Actualizar repos" helm repo update

# -----------------------------------------------------------------------------
# Namespace databases
# -----------------------------------------------------------------------------
section "14.1 — NAMESPACE"

if kubectl get namespace databases &>/dev/null; then
  skip "Namespace databases ya existe"
else
  do_run "Crear namespace databases" \
    kubectl create namespace databases
fi

# Política Vault para databases
if kubectl get pod vault-0 -n "${VAULT_NAMESPACE:-vault}" &>/dev/null; then
  info "Creando política Vault para databases..."
  kubectl exec vault-0 -n "${VAULT_NAMESPACE:-vault}" -- \
    env VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-homelab-root}" \
        VAULT_ADDR="http://127.0.0.1:8200" \
    vault policy write databases - >> "${LOG_FILE:-/dev/null}" 2>&1 << 'POLICY'
path "secret/data/databases/*" {
  capabilities = ["read", "list"]
}
POLICY
  ok "Política Vault databases creada"
  APPLIED=$((APPLIED + 1))

  # K8s auth role para databases
  kubectl exec vault-0 -n "${VAULT_NAMESPACE:-vault}" -- \
    env VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-homelab-root}" \
        VAULT_ADDR="http://127.0.0.1:8200" \
    vault write auth/kubernetes/role/databases \
      bound_service_account_names="*" \
      bound_service_account_namespaces="databases" \
      policies="databases" \
      ttl=1h >> "${LOG_FILE:-/dev/null}" 2>&1 && \
    ok "K8s role databases creado" && APPLIED=$((APPLIED + 1))
else
  warn "Vault no disponible — políticas databases no creadas"
fi

# =============================================================================
# PostgreSQL
# =============================================================================
section "14.2 — POSTGRESQL"

PG_PASSWORD="homelab-pg-$(date +%s | sha256sum | head -c 16)"
PG_USER="homelab"
PG_DB="homelab"

if helm status postgresql -n databases &>/dev/null; then
  skip "PostgreSQL ya instalado"
else
  info "Instalando PostgreSQL (Bitnami)..."
  info "PVC: ${DB_PVC_SIZE:-10Gi} — StorageClass: longhorn"

  if [[ "${DRY_RUN:-false}" == false ]]; then
    helm install postgresql bitnami/postgresql \
      --namespace databases \
      --set auth.username="${PG_USER}" \
      --set auth.password="${PG_PASSWORD}" \
      --set auth.database="${PG_DB}" \
      --set primary.persistence.enabled=true \
      --set primary.persistence.storageClass=longhorn \
      --set primary.persistence.size="${DB_PVC_SIZE:-10Gi}" \
      --set primary.resources.requests.cpu="100m" \
      --set primary.resources.requests.memory="256Mi" \
      --set primary.resources.limits.cpu="500m" \
      --set primary.resources.limits.memory="512Mi" \
      --set metrics.enabled=true \
      --set metrics.serviceMonitor.enabled=false \
      --set backup.enabled=false \
      --set replication.enabled=false \
      2>&1 | tee -a "${LOG_FILE:-/dev/null}"

    rc=${PIPESTATUS[0]}
    if [[ $rc -eq 0 ]]; then
      ok "PostgreSQL instalado"
      APPLIED=$((APPLIED + 1))

      # Guardar credenciales en Vault
      if kubectl get pod vault-0 -n "${VAULT_NAMESPACE:-vault}" &>/dev/null; then
        kubectl exec vault-0 -n "${VAULT_NAMESPACE:-vault}" -- \
          env VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-homelab-root}" \
              VAULT_ADDR="http://127.0.0.1:8200" \
          vault kv put secret/databases/postgresql \
            host="postgresql.databases.svc.cluster.local" \
            port="5432" \
            username="${PG_USER}" \
            password="${PG_PASSWORD}" \
            database="${PG_DB}" \
            connection_string="postgresql://${PG_USER}:${PG_PASSWORD}@postgresql.databases.svc.cluster.local:5432/${PG_DB}" \
          >> "${LOG_FILE:-/dev/null}" 2>&1 && \
          ok "Credenciales PostgreSQL guardadas en Vault (secret/databases/postgresql)" && \
          APPLIED=$((APPLIED + 1))
      fi
    else
      fail "Helm install PostgreSQL falló (exit $rc)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría PostgreSQL en databases"
    APPLIED=$((APPLIED + 1))
  fi
fi

# =============================================================================
# Redis
# =============================================================================
section "14.3 — REDIS"

REDIS_PASSWORD="homelab-redis-$(date +%s | sha256sum | head -c 16)"

if helm status redis -n databases &>/dev/null; then
  skip "Redis ya instalado"
else
  info "Instalando Redis (Bitnami)..."
  info "Modo: standalone (single master, sin réplicas)"

  if [[ "${DRY_RUN:-false}" == false ]]; then
    helm install redis bitnami/redis \
      --namespace databases \
      --set auth.enabled=true \
      --set auth.password="${REDIS_PASSWORD}" \
      --set architecture=standalone \
      --set master.persistence.enabled=true \
      --set master.persistence.storageClass=longhorn \
      --set master.persistence.size="${DB_PVC_SIZE:-5Gi}" \
      --set master.resources.requests.cpu="100m" \
      --set master.resources.requests.memory="128Mi" \
      --set master.resources.limits.cpu="300m" \
      --set master.resources.limits.memory="256Mi" \
      --set metrics.enabled=true \
      2>&1 | tee -a "${LOG_FILE:-/dev/null}"

    rc=${PIPESTATUS[0]}
    if [[ $rc -eq 0 ]]; then
      ok "Redis instalado"
      APPLIED=$((APPLIED + 1))

      # Guardar credenciales en Vault
      if kubectl get pod vault-0 -n "${VAULT_NAMESPACE:-vault}" &>/dev/null; then
        kubectl exec vault-0 -n "${VAULT_NAMESPACE:-vault}" -- \
          env VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-homelab-root}" \
              VAULT_ADDR="http://127.0.0.1:8200" \
          vault kv put secret/databases/redis \
            host="redis-master.databases.svc.cluster.local" \
            port="6379" \
            password="${REDIS_PASSWORD}" \
            connection_string="redis://:${REDIS_PASSWORD}@redis-master.databases.svc.cluster.local:6379" \
          >> "${LOG_FILE:-/dev/null}" 2>&1 && \
          ok "Credenciales Redis guardadas en Vault (secret/databases/redis)" && \
          APPLIED=$((APPLIED + 1))
      fi
    else
      fail "Helm install Redis falló (exit $rc)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría Redis en databases"
    APPLIED=$((APPLIED + 1))
  fi
fi

# =============================================================================
# MongoDB
# =============================================================================
section "14.4 — MONGODB"

MONGO_ROOT_PASSWORD="homelab-mongo-$(date +%s | sha256sum | head -c 16)"
MONGO_USER="homelab"
MONGO_PASSWORD="homelab-mongo-user-$(date +%s | sha256sum | head -c 12)"
MONGO_DB="homelab"

if helm status mongodb -n databases &>/dev/null; then
  skip "MongoDB ya instalado"
else
  info "Instalando MongoDB (Bitnami)..."
  info "Modo: standalone (single instance)"

  if [[ "${DRY_RUN:-false}" == false ]]; then
    helm install mongodb bitnami/mongodb \
      --namespace databases \
      --set architecture=standalone \
      --set auth.enabled=true \
      --set auth.rootPassword="${MONGO_ROOT_PASSWORD}" \
      --set auth.username="${MONGO_USER}" \
      --set auth.password="${MONGO_PASSWORD}" \
      --set auth.database="${MONGO_DB}" \
      --set persistence.enabled=true \
      --set persistence.storageClass=longhorn \
      --set persistence.size="${DB_PVC_SIZE:-10Gi}" \
      --set resources.requests.cpu="100m" \
      --set resources.requests.memory="256Mi" \
      --set resources.limits.cpu="500m" \
      --set resources.limits.memory="512Mi" \
      --set metrics.enabled=true \
      2>&1 | tee -a "${LOG_FILE:-/dev/null}"

    rc=${PIPESTATUS[0]}
    if [[ $rc -eq 0 ]]; then
      ok "MongoDB instalado"
      APPLIED=$((APPLIED + 1))

      # Guardar credenciales en Vault
      if kubectl get pod vault-0 -n "${VAULT_NAMESPACE:-vault}" &>/dev/null; then
        kubectl exec vault-0 -n "${VAULT_NAMESPACE:-vault}" -- \
          env VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-homelab-root}" \
              VAULT_ADDR="http://127.0.0.1:8200" \
          vault kv put secret/databases/mongodb \
            host="mongodb.databases.svc.cluster.local" \
            port="27017" \
            root_password="${MONGO_ROOT_PASSWORD}" \
            username="${MONGO_USER}" \
            password="${MONGO_PASSWORD}" \
            database="${MONGO_DB}" \
            connection_string="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongodb.databases.svc.cluster.local:27017/${MONGO_DB}" \
          >> "${LOG_FILE:-/dev/null}" 2>&1 && \
          ok "Credenciales MongoDB guardadas en Vault (secret/databases/mongodb)" && \
          APPLIED=$((APPLIED + 1))
      fi
    else
      fail "Helm install MongoDB falló (exit $rc)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría MongoDB en databases"
    APPLIED=$((APPLIED + 1))
  fi
fi

# =============================================================================
# Verificación final
# =============================================================================
section "14.5 — ESTADO"

if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Esperando pods databases (max 5 min)..."
  WAIT=0
  while [[ $WAIT -lt 300 ]]; do
    TOTAL=$(kubectl get pods -n databases --no-headers 2>/dev/null | wc -l)
    RUNNING=$(kubectl get pods -n databases --no-headers 2>/dev/null | grep -c "Running" || true)
    [[ $TOTAL -gt 0 && "$RUNNING" -eq "$TOTAL" ]] && break
    printf "  Databases pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 10; WAIT=$((WAIT + 10))
  done
  echo ""

  log ""
  info "Pods databases:"
  kubectl get pods -n databases -o wide 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true

  log ""
  info "PVCs databases:"
  kubectl get pvc -n databases 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true

  log ""
  info "Services databases:"
  kubectl get svc -n databases 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true

  log ""
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
  log "  ${BOLD}  Connection strings (recuperar de Vault):${NC}"
  log "  ${CYAN}  kubectl exec vault-0 -n vault -- env VAULT_TOKEN=homelab-root VAULT_ADDR=http://127.0.0.1:8200 vault kv get secret/databases/postgresql${NC}"
  log "  ${CYAN}  kubectl exec vault-0 -n vault -- env VAULT_TOKEN=homelab-root VAULT_ADDR=http://127.0.0.1:8200 vault kv get secret/databases/redis${NC}"
  log "  ${CYAN}  kubectl exec vault-0 -n vault -- env VAULT_TOKEN=homelab-root VAULT_ADDR=http://127.0.0.1:8200 vault kv get secret/databases/mongodb${NC}"
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
fi

print_summary "$MODULE_NAME"
