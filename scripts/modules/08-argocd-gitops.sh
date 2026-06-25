#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 08: ArgoCD GitOps Bootstrap  v1.0
#  Conecta ArgoCD al repo GitHub y aplica el ApplicationSet
#  Solo se ejecuta en el control-plane
#
#  Prerequisitos:
#    - ArgoCD instalado (módulo 06)
#    - Token GitHub en $GITHUB_TOKEN_FILE
#    - Estructura gitops/ commiteada en el repo
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="08-ARGOCD-GITOPS"
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
if ! kubectl get namespace argocd &>/dev/null; then
  fail "Namespace argocd no existe — ejecutar módulo 06 primero"
  print_summary "$MODULE_NAME"
  exit 1
fi

if ! kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-server \
     --no-headers 2>/dev/null | grep -q Running; then
  fail "ArgoCD server no está Running — verificar módulo 06"
  print_summary "$MODULE_NAME"
  exit 1
fi

# Token GitHub
GITHUB_TOKEN_FILE="${GITHUB_TOKEN_FILE:-${ADMIN_HOME}/Documents/Personal/HomeLab/.GitHubToken}"
if [[ ! -f "$GITHUB_TOKEN_FILE" ]]; then
  fail "Token GitHub no encontrado en $GITHUB_TOKEN_FILE"
  info "Crear el archivo con: echo 'ghp_TOKEN' > $GITHUB_TOKEN_FILE"
  print_summary "$MODULE_NAME"
  exit 1
fi

GITHUB_TOKEN=$(cat "$GITHUB_TOKEN_FILE" | tr -d '[:space:]')
if [[ -z "$GITHUB_TOKEN" ]]; then
  fail "Token GitHub vacío en $GITHUB_TOKEN_FILE"
  print_summary "$MODULE_NAME"
  exit 1
fi

ARGOCD_REPO_URL="${ARGOCD_REPO_URL:-https://github.com/Vanguard94-RR/HomeLab.git}"
ARGOCD_REPO_BRANCH="${ARGOCD_BRANCH:-refactor/full-gitops-bootstrap}"
ARGOCD_GITOPS_PATH="${ARGOCD_GITOPS_PATH:-gitops/bootstrap/applicationset.yaml}"
GITHUB_USER="${GITHUB_USER:-Vanguard94-RR}"

info "Repo: $ARGOCD_REPO_URL"
info "Branch: $ARGOCD_REPO_BRANCH"
info "ApplicationSet: $ARGOCD_GITOPS_PATH"
log ""

# -----------------------------------------------------------------------------
# STEP 1 — Credenciales del repo como Secret en argocd
#           Solo necesario para repos PRIVADOS
# -----------------------------------------------------------------------------
section "08.1 — REPO CREDENTIALS"

SECRET_NAME="homelab-repo-creds"

# Verificar si el repo es público (sin credenciales) o privado
REPO_HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5   "${ARGOCD_REPO_URL%.git}" 2>/dev/null || echo "000")

if [[ "$REPO_HTTP" == "200" ]]; then
  info "Repo público detectado (HTTP $REPO_HTTP) — credenciales no requeridas"
  # Borrar Secret si existe (podría causar errores de auth)
  if kubectl get secret "$SECRET_NAME" -n argocd &>/dev/null; then
    do_run "Borrar Secret de credenciales (repo público)"       kubectl delete secret "$SECRET_NAME" -n argocd
  else
    skip "Sin Secret de credenciales (repo público — correcto)"
  fi
else
  info "Repo privado o no accesible (HTTP $REPO_HTTP) — configurando credenciales"
  if kubectl get secret "$SECRET_NAME" -n argocd &>/dev/null; then
    skip "Secret $SECRET_NAME ya existe en argocd"
  else
    info "Creando Secret con credenciales del repo..."
  if [[ "${DRY_RUN:-false}" == false ]]; then
    # ArgoCD espera el Secret con labels específicos para reconocerlo como repo
    kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${SECRET_NAME}
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
type: Opaque
stringData:
  type: git
  url: ${ARGOCD_REPO_URL}
  username: ${GITHUB_USER}
  password: ${GITHUB_TOKEN}
EOF
    rc=$?
    if [[ $rc -eq 0 ]]; then
      ok "Secret $SECRET_NAME creado"
      APPLIED=$((APPLIED + 1))
    else
      fail "kubectl apply Secret falló (exit $rc)"
      print_summary "$MODULE_NAME"
      exit 1
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se crearía Secret $SECRET_NAME con token GitHub"
    APPLIED=$((APPLIED + 1))
  fi
  fi  # fin repo privado
fi

# Verificar que ArgoCD reconoció el repo
if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Esperando que ArgoCD reconozca el repo (max 30s)..."
  WAIT=0
  REPO_OK=false
  while [[ $WAIT -lt 30 ]]; do
    if kubectl get secret "$SECRET_NAME" -n argocd \
       -o jsonpath='{.metadata.labels.argocd\.argoproj\.io/secret-type}' \
       2>/dev/null | grep -q "repository"; then
      REPO_OK=true
      break
    fi
    sleep 3
    WAIT=$((WAIT + 3))
  done
  [[ "$REPO_OK" == true ]] && ok "Repo reconocido por ArgoCD" || \
    warn "No se pudo verificar el repo — continúa de todas formas"
fi

log ""

# -----------------------------------------------------------------------------
# STEP 2 — Password admin ArgoCD
# -----------------------------------------------------------------------------
section "08.2 — ARGOCD ADMIN PASSWORD"

ARGOCD_PASS_FILE="/tmp/argocd-admin-pass.txt"

if [[ -f "$ARGOCD_PASS_FILE" ]]; then
  ARGOCD_PASSWORD=$(cat "$ARGOCD_PASS_FILE" | cut -d: -f2 | tr -d '[:space:]')
  skip "Password ArgoCD ya guardado ($ARGOCD_PASS_FILE)"
else
  ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret \
    -o jsonpath="{.data.password}" 2>/dev/null | base64 -d 2>/dev/null || echo "")
  if [[ -z "$ARGOCD_PASSWORD" ]]; then
    fail "No se pudo obtener password de ArgoCD"
    print_summary "$MODULE_NAME"
    exit 1
  fi
  echo "admin:$ARGOCD_PASSWORD" > "$ARGOCD_PASS_FILE"
  chmod 600 "$ARGOCD_PASS_FILE"
  ok "Password ArgoCD guardado en $ARGOCD_PASS_FILE"
  APPLIED=$((APPLIED + 1))
fi

log ""

# -----------------------------------------------------------------------------
# STEP 3 — ApplicationSet
# -----------------------------------------------------------------------------
section "08.3 — APPLICATIONSET"

APPSET_NAME="homelab-apps"

if kubectl get applicationset "$APPSET_NAME" -n argocd &>/dev/null; then
  skip "ApplicationSet $APPSET_NAME ya existe"
else
  info "Aplicando ApplicationSet desde el repo local..."

  # Buscar el applicationset.yaml en rutas conocidas
  APPSET_FILE=""
  for CANDIDATE in \
    "${ADMIN_HOME}/Documents/Personal/HomeLab/${ARGOCD_GITOPS_PATH}" \
    "${SCRIPTS_DIR}/../${ARGOCD_GITOPS_PATH}" \
    "/tmp/gitops/bootstrap/applicationset.yaml"; do
    if [[ -f "$CANDIDATE" ]]; then
      APPSET_FILE="$CANDIDATE"
      break
    fi
  done

  if [[ -z "$APPSET_FILE" ]]; then
    # Aplicar inline desde heredoc
    info "Archivo no encontrado localmente — aplicando inline"
    if [[ "${DRY_RUN:-false}" == false ]]; then
      kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << EOF
---
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: ${APPSET_NAME}
  namespace: argocd
spec:
  generators:
    - git:
        repoURL: ${ARGOCD_REPO_URL}
        revision: ${ARGOCD_REPO_BRANCH}
        directories:
          - path: gitops/apps/*
  template:
    metadata:
      name: "{{path.basename}}"
      labels:
        app.kubernetes.io/managed-by: argocd-applicationset
        homelab/app: "{{path.basename}}"
    spec:
      project: default
      source:
        repoURL: ${ARGOCD_REPO_URL}
        targetRevision: ${ARGOCD_REPO_BRANCH}
        path: "{{path}}"
      destination:
        server: https://kubernetes.default.svc
        namespace: "{{path.basename}}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
          - ServerSideApply=true
        retry:
          limit: 3
          backoff:
            duration: 30s
            factor: 2
            maxDuration: 3m
EOF
      rc=$?
    fi
  else
    info "Aplicando desde $APPSET_FILE"
    if [[ "${DRY_RUN:-false}" == false ]]; then
      kubectl apply -f "$APPSET_FILE" >> "${LOG_FILE:-/dev/null}" 2>&1
      rc=$?
    fi
  fi

  if [[ "${DRY_RUN:-false}" == false ]]; then
    if [[ ${rc:-0} -eq 0 ]]; then
      ok "ApplicationSet $APPSET_NAME creado"
      APPLIED=$((APPLIED + 1))
    else
      fail "kubectl apply ApplicationSet falló (exit ${rc:-1})"
      print_summary "$MODULE_NAME"
      exit 1
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se crearía ApplicationSet $APPSET_NAME"
    APPLIED=$((APPLIED + 1))
  fi
fi

log ""

# -----------------------------------------------------------------------------
# STEP 4 — Esperar sincronización de Applications
# -----------------------------------------------------------------------------
if [[ "${DRY_RUN:-false}" == false && $FAILED -eq 0 ]]; then
  section "08.4 — VERIFICACIÓN"

  info "Esperando que el ApplicationSet genere las Applications (max 2 min)..."
  WAIT=0
  APPS_OK=false
  while [[ $WAIT -lt 120 ]]; do
    APP_COUNT=$(kubectl get applications -n argocd --no-headers 2>/dev/null | wc -l)
    if [[ $APP_COUNT -gt 0 ]]; then
      APPS_OK=true
      break
    fi
    printf "  Esperando Applications...\r"
    sleep 5
    WAIT=$((WAIT + 5))
  done
  echo ""

  if [[ "$APPS_OK" == true ]]; then
    ok "Applications generadas por el ApplicationSet"
    log ""
    info "Estado de Applications:"
    kubectl get applications -n argocd \
      -o custom-columns="NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REPO:.spec.source.path" \
      2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true
  else
    warn "ApplicationSet no generó Applications aún — puede necesitar más tiempo"
    info "Verificar: kubectl get applications -n argocd"
    info "Ver logs: kubectl logs -n argocd -l app.kubernetes.io/name=argocd-applicationset-controller"
  fi

  log ""
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
  log "  ${BOLD}  ArgoCD UI:${NC}"
  log "  ${CYAN}  kubectl port-forward svc/argocd-server -n argocd 8080:443${NC}"
  log "  ${CYAN}  https://localhost:8080${NC}"
  log "  ${CYAN}  Usuario: admin | Password: $ARGOCD_PASSWORD${NC}"
  log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
fi

print_summary "$MODULE_NAME"
