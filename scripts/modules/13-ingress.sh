#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 13: Traefik v3 Ingress  v1.0
#  Despliega Traefik v3 como ingress controller con:
#    - Helm chart oficial de Traefik
#    - IngressClass traefik (default)
#    - NodePort 30080 (HTTP) y 30443 (HTTPS)
#    - Dashboard via IngressRoute
#    - IngressRoutes para todos los servicios del lab
#    - Integración con AdGuard DNS rewrites
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="13-TRAEFIK"
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
# Helm repo Traefik
# -----------------------------------------------------------------------------
section "13.1 — HELM REPO"
if helm repo list 2>/dev/null | grep -q "^traefik"; then
  skip "Repo traefik ya agregado"
else
  do_run "Agregar repo traefik" \
    helm repo add traefik https://traefik.github.io/charts
fi
do_run_soft "Actualizar repos" helm repo update

# -----------------------------------------------------------------------------
# Instalar Traefik v3
# -----------------------------------------------------------------------------
section "13.2 — TRAEFIK INSTALL"

TRAEFIK_NS="${INGRESS_NAMESPACE:-ingress-nginx}"
TRAEFIK_NS="traefik"   # namespace propio para Traefik

if helm status traefik -n "${TRAEFIK_NS}" &>/dev/null; then
  CURRENT=$(helm list -n "${TRAEFIK_NS}" | grep traefik | awk '{print $9}')
  skip "Traefik ya instalado ($CURRENT)"
else
  VERSION_FLAG=""
  [[ -n "${TRAEFIK_VERSION:-}" ]] && VERSION_FLAG="--version ${TRAEFIK_VERSION}"

  # Crear namespace
  kubectl get namespace "${TRAEFIK_NS}" &>/dev/null || \
    kubectl create namespace "${TRAEFIK_NS}" >> "${LOG_FILE:-/dev/null}" 2>&1

  info "Namespace: ${TRAEFIK_NS}"
  info "HTTP NodePort:  30180"
  info "HTTPS NodePort: 30543"
  info "Dashboard:      30900"
  log ""

  if [[ "${DRY_RUN:-false}" == false ]]; then
    # shellcheck disable=SC2086
    helm install traefik traefik/traefik $VERSION_FLAG \
      --namespace "${TRAEFIK_NS}" \
      --set "service.type=NodePort" \
      --set "ports.web.nodePort=30180" \
      --set "ports.websecure.nodePort=30543" \
      --set "ports.traefik.expose.default=true" \
      --set "ports.traefik.nodePort=30900" \
      --set "ingressClass.enabled=true" \
      --set "ingressClass.isDefaultClass=true" \
      --set "ingressClass.name=traefik" \
      --set "providers.kubernetesIngress.enabled=true" \
      --set "providers.kubernetesCRD.enabled=true" \
      --set "api.dashboard=true" \
      --set "api.insecure=true" \
      --set "log.level=INFO" \
      --set "accessLog.enabled=true" \
      --set "resources.requests.cpu=100m" \
      --set "resources.requests.memory=128Mi" \
      --set "resources.limits.cpu=500m" \
      --set "resources.limits.memory=256Mi" \
      2>&1 | tee -a "${LOG_FILE:-/dev/null}"

    rc=${PIPESTATUS[0]}
    if [[ $rc -eq 0 ]]; then
      ok "Traefik v3 instalado via Helm"
      APPLIED=$((APPLIED + 1))
    else
      fail "Helm install Traefik falló (exit $rc)"
      print_summary "$MODULE_NAME"; exit 1
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría Traefik v3 en ${TRAEFIK_NS}"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# Esperar Traefik Ready
# -----------------------------------------------------------------------------
section "13.3 — TRAEFIK READY"

if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Esperando Traefik (max 2 min)..."
  WAIT=0
  TRAEFIK_READY=false
  while [[ $WAIT -lt 120 ]]; do
    RUNNING=$(kubectl get pods -n "${TRAEFIK_NS}" \
      --no-headers 2>/dev/null | grep -c "Running" || true)
    TOTAL=$(kubectl get pods -n "${TRAEFIK_NS}" \
      --no-headers 2>/dev/null | wc -l)
    if [[ $TOTAL -gt 0 && "$RUNNING" -eq "$TOTAL" ]]; then
      TRAEFIK_READY=true; break
    fi
    printf "  Traefik pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 5; WAIT=$((WAIT + 5))
  done
  echo ""
  [[ "$TRAEFIK_READY" == true ]] && ok "Traefik Running" || \
    warn "Traefik aún inicializando"
fi

# -----------------------------------------------------------------------------
# IngressRoutes para todos los servicios del lab
# -----------------------------------------------------------------------------
section "13.4 — INGRESSROUTES"

NODE_IP="${NODE_IP:-10.10.20.101}"

if [[ "${DRY_RUN:-false}" == false ]]; then
  kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << EOF
---
# ArgoCD
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-ingress
  namespace: argocd
  labels:
    app.kubernetes.io/managed-by: homelab-iac
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
    - host: ${ARGOCD_HOST:-argocd.lab.internal}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 80
---
# Longhorn UI
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: longhorn-ingress
  namespace: longhorn-system
  labels:
    app.kubernetes.io/managed-by: homelab-iac
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
    - host: ${LONGHORN_HOST:-longhorn.lab.internal}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: longhorn-frontend
                port:
                  number: 80
---
# Hubble UI
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hubble-ingress
  namespace: kube-system
  labels:
    app.kubernetes.io/managed-by: homelab-iac
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
    - host: ${HUBBLE_HOST:-hubble.lab.internal}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: hubble-ui
                port:
                  number: 80
---
# Vault UI
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: vault-ingress
  namespace: vault
  labels:
    app.kubernetes.io/managed-by: homelab-iac
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
    - host: ${VAULT_HOST:-vault.lab.internal}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: vault-ui
                port:
                  number: 8200
EOF

  rc=$?
  if [[ $rc -eq 0 ]]; then
    ok "IngressRoutes base creadas (ArgoCD, Longhorn, Hubble, Vault)"
    APPLIED=$((APPLIED + 1))
  else
    warn "Algunos IngressRoutes fallaron — servicios pueden no existir aún"
  fi

  # Jenkins e AWX — solo si ya están desplegados
  for NS_SVC in "ci-cd:jenkins:8080:${JENKINS_HOST:-jenkins.lab.internal}:jenkins-ingress" \
                "awx:homelab-awx-service:80:${AWX_HOST:-awx.lab.internal}:awx-ingress"; do
    IFS=':' read -r ING_NS ING_SVC ING_PORT ING_HOST ING_NAME <<< "$NS_SVC"
    if kubectl get namespace "$ING_NS" &>/dev/null && \
       kubectl get svc "$ING_SVC" -n "$ING_NS" &>/dev/null; then
      kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << EOF2
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${ING_NAME}
  namespace: ${ING_NS}
  labels:
    app.kubernetes.io/managed-by: homelab-iac
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
    - host: ${ING_HOST}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${ING_SVC}
                port:
                  number: ${ING_PORT}
EOF2
      ok "Ingress ${ING_NAME} creado (${ING_HOST})"
      APPLIED=$((APPLIED + 1))
    else
      info "Servicio ${ING_SVC} en ${ING_NS} no existe aún — Ingress se creará al desplegarlo"
    fi
  done
fi

# -----------------------------------------------------------------------------
# Instrucciones DNS — AdGuard rewrites
# -----------------------------------------------------------------------------
section "13.5 — DNS CONFIG"

log ""
log "  ${BOLD}━━ Agregar DNS Rewrites en AdGuard (http://10.10.10.3:3000) ━━${NC}"
log "  ${CYAN}  Settings → DNS Rewrites → Add DNS rewrite${NC}"
log ""
log "  ${CYAN}  ${ARGOCD_HOST:-argocd.lab.internal}   → ${NODE_IP}${NC}"
log "  ${CYAN}  ${LONGHORN_HOST:-longhorn.lab.internal} → ${NODE_IP}${NC}"
log "  ${CYAN}  ${HUBBLE_HOST:-hubble.lab.internal}    → ${NODE_IP}${NC}"
log "  ${CYAN}  ${VAULT_HOST:-vault.lab.internal}      → ${NODE_IP}${NC}"
log "  ${CYAN}  ${JENKINS_HOST:-jenkins.lab.internal}  → ${NODE_IP}${NC}"
log "  ${CYAN}  ${AWX_HOST:-awx.lab.internal}          → ${NODE_IP}${NC}"
log "  ${CYAN}  ${GRAFANA_HOST:-grafana.lab.internal}  → 10.10.10.10 (T430, no K3s)${NC}"
log ""
log "  ${BOLD}━━ Acceso directo vía NodePort (sin DNS) ━━${NC}"
log "  ${CYAN}  Traefik Dashboard: http://${NODE_IP}:30900/dashboard/${NC}"
log "  ${CYAN}  HTTP entry:        http://${NODE_IP}:30080${NC}"
log "  ${CYAN}  HTTPS entry:       https://${NODE_IP}:30443${NC}"
log ""
log "  ${BOLD}━━ Con DNS configurado ━━${NC}"
log "  ${CYAN}  http://${ARGOCD_HOST:-argocd.lab.internal}:30080${NC}"
log "  ${CYAN}  http://${LONGHORN_HOST:-longhorn.lab.internal}:30080${NC}"
log "  ${CYAN}  http://${VAULT_HOST:-vault.lab.internal}:30080${NC}"

if [[ "${DRY_RUN:-false}" == false ]]; then
  log ""
  info "Estado Traefik:"
  kubectl get pods -n "${TRAEFIK_NS}" 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true
  log ""
  info "IngressRoutes activos:"
  kubectl get ingress -A 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true
fi

print_summary "$MODULE_NAME"
