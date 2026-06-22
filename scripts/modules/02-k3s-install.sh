#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 02: K3s Install  v1.0
#  Instala K3s server o agent según el rol del nodo
#  No se ejecuta directamente — lo llama bootstrap.sh
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="02-K3S-INSTALL"
reset_counters

section "$MODULE_NAME"

# ROLE, NODE_IP, SERVER_IP, TOKEN vienen de bootstrap.sh como variables de entorno

# -----------------------------------------------------------------------------
# Verificar si ya está instalado
# -----------------------------------------------------------------------------
if systemctl is-active --quiet k3s 2>/dev/null; then
  skip "K3s server ya activo"
  print_summary "$MODULE_NAME"
  exit 0
fi
if systemctl is-active --quiet k3s-agent 2>/dev/null; then
  skip "K3s agent ya activo"
  print_summary "$MODULE_NAME"
  exit 0
fi

info "K3s no instalado — procediendo (rol: ${ROLE})"

# -----------------------------------------------------------------------------
# Variables de entorno del installer
# -----------------------------------------------------------------------------
INSTALL_ENV=""
if [[ -n "${K3S_VERSION:-}" ]]; then
  INSTALL_ENV="INSTALL_K3S_VERSION=$K3S_VERSION"
  info "Versión: $K3S_VERSION"
else
  info "Versión: latest stable"
fi

# Si el binario ya existe localmente (copiado manualmente), saltar descarga
if [[ -x "/usr/local/bin/k3s" ]]; then
  info "Binario k3s presente — saltando descarga"
  INSTALL_ENV="$INSTALL_ENV INSTALL_K3S_SKIP_DOWNLOAD=true"
fi

# -----------------------------------------------------------------------------
# Server
# -----------------------------------------------------------------------------
if [[ "${ROLE}" == "server" ]]; then

  # TLS SANs
  TLS_FLAGS=""
  for SAN in "${TLS_SANS[@]}"; do
    TLS_FLAGS="$TLS_FLAGS --tls-san $SAN"
  done
  # Agregar NODE_IP si no está ya
  if [[ -n "${NODE_IP:-}" ]]; then
    TLS_FLAGS="$TLS_FLAGS --tls-san ${NODE_IP}"
  fi

  # Disable flags
  DISABLE_FLAGS=""
  for COMP in $DISABLE_COMPONENTS; do
    DISABLE_FLAGS="$DISABLE_FLAGS --disable $COMP"
  done

  info "Rol: control-plane (--cluster-init + etcd embebido)"
  info "CNI: flannel deshabilitado — Cilium se instala después"
  info "Deshabilitados: $DISABLE_COMPONENTS"
  info "Node IP: ${NODE_IP}"
  log ""

  if [[ "${DRY_RUN:-false}" == false ]]; then
    log "${GREEN}  [RUN]${NC}  Instalando K3s server..."
    # shellcheck disable=SC2086
    curl -sfL https://get.k3s.io | \
      env $INSTALL_ENV \
      sh -s - server \
        --cluster-init \
        --node-name "$(hostname)" \
        --node-ip "${NODE_IP}" \
        --advertise-address "${NODE_IP}" \
        --cluster-cidr "${CLUSTER_CIDR}" \
        --service-cidr "${SERVICE_CIDR}" \
        --flannel-backend=none \
        --disable-network-policy \
        $DISABLE_FLAGS \
        $TLS_FLAGS \
        --write-kubeconfig-mode 644 \
      >> "${LOG_FILE:-/dev/null}" 2>&1

    K3S_RC=$?
    if [[ $K3S_RC -eq 0 ]]; then
      ok "K3s server instalado"
      APPLIED=$((APPLIED + 1))
    else
      fail "K3s server falló (exit $K3S_RC)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría K3s server con --cluster-init"
    APPLIED=$((APPLIED + 1))
  fi

# -----------------------------------------------------------------------------
# Worker
# -----------------------------------------------------------------------------
else

  info "Rol: worker (agent)"
  info "Server: https://${SERVER_IP}:6443"
  info "Node IP: ${NODE_IP}"
  log ""

  if [[ "${DRY_RUN:-false}" == false ]]; then
    log "${GREEN}  [RUN]${NC}  Instalando K3s agent..."
    # shellcheck disable=SC2086
    curl -sfL https://get.k3s.io | \
      env $INSTALL_ENV \
        K3S_URL="https://${SERVER_IP}:6443" \
        K3S_TOKEN="${TOKEN}" \
      sh -s - agent \
        --node-name "$(hostname)" \
        --node-ip "${NODE_IP}" \
      >> "${LOG_FILE:-/dev/null}" 2>&1

    K3S_RC=$?
    if [[ $K3S_RC -eq 0 ]]; then
      ok "K3s agent instalado"
      APPLIED=$((APPLIED + 1))
    else
      fail "K3s agent falló (exit $K3S_RC)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría K3s agent apuntando a $SERVER_IP"
    APPLIED=$((APPLIED + 1))
  fi

fi

# -----------------------------------------------------------------------------
# Post-install server
# -----------------------------------------------------------------------------
if [[ "${ROLE}" == "server" && "${DRY_RUN:-false}" == false && $FAILED -eq 0 ]]; then

  section "02-K3S-POST-INSTALL"

  # Esperar API server
  wait_for "API server responda" 90 3 kubectl get nodes

  if [[ $FAILED -eq 0 ]]; then
    log ""
    info "Estado del nodo:"
    kubectl get nodes -o wide 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true

    # Extraer token
    TOKEN_FILE="/var/lib/rancher/k3s/server/node-token"
    if [[ -f "$TOKEN_FILE" ]]; then
      TOKEN_VALUE=$(cat "$TOKEN_FILE")
      echo "$TOKEN_VALUE" > /tmp/k3s-node-token.txt
      chmod 600 /tmp/k3s-node-token.txt

      log ""
      log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
      log "  ${BOLD}  TOKEN PARA WORKERS:${NC}"
      log "  ${CYAN}  $TOKEN_VALUE${NC}"
      log "  ${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
      log "  Guardado en: /tmp/k3s-node-token.txt"
      log ""
      log "  ${BOLD}Comando workers:${NC}"
      log "  ${CYAN}sudo bash bootstrap.sh --role worker --server-ip ${NODE_IP} --token $TOKEN_VALUE${NC}"
      log ""
    else
      fail "Token no encontrado en $TOKEN_FILE"
    fi

    # kubeconfig para admin
    ADMIN_HOME_DIR=$(getent passwd "${ADMIN_USER:-admin}" 2>/dev/null | cut -d: -f6 || echo "/home/admin")
    if [[ -d "$ADMIN_HOME_DIR" ]]; then
      mkdir -p "$ADMIN_HOME_DIR/.kube"
      cp /etc/rancher/k3s/k3s.yaml "$ADMIN_HOME_DIR/.kube/config"
      sed -i "s/127.0.0.1/${NODE_IP}/g" "$ADMIN_HOME_DIR/.kube/config"
      chown -R "${ADMIN_USER:-admin}:${ADMIN_USER:-admin}" "$ADMIN_HOME_DIR/.kube"
      chmod 600 "$ADMIN_HOME_DIR/.kube/config"
      ok "kubeconfig configurado en $ADMIN_HOME_DIR/.kube/config"
    fi
  fi
fi

# -----------------------------------------------------------------------------
# Verificación de servicio
# -----------------------------------------------------------------------------
if [[ "${DRY_RUN:-false}" == false ]]; then
  sleep 3
  SVC=$([[ "${ROLE}" == "server" ]] && echo "k3s" || echo "k3s-agent")
  if systemctl is-active --quiet "$SVC" 2>/dev/null; then
    ok "Servicio $SVC activo"
  else
    fail "Servicio $SVC NO activo — revisar: sudo journalctl -u $SVC -n 30 --no-pager"
  fi
fi

print_summary "$MODULE_NAME"
