#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 03: Helm + CLI Tools  v1.0
#  Instala Helm, Cilium CLI, kubectl plugins y otras herramientas
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="03-HELM-TOOLS"
reset_counters

section "$MODULE_NAME"

if [[ "${ROLE:-worker}" != "server" ]]; then
  info "Módulo solo aplica al control-plane — saltando"
  exit 0
fi

# -----------------------------------------------------------------------------
# Helm
# -----------------------------------------------------------------------------
if command -v helm &>/dev/null; then
  skip "Helm ya instalado ($(helm version --short 2>/dev/null | tr -d '\n'))"
else
  info "Instalando Helm..."
  if [[ "${DRY_RUN:-false}" == false ]]; then
    curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \
      | bash >> "${LOG_FILE:-/dev/null}" 2>&1
    rc=$?
    if [[ $rc -eq 0 ]] && command -v helm &>/dev/null; then
      ok "Helm instalado ($(helm version --short 2>/dev/null))"
      APPLIED=$((APPLIED + 1))
    else
      fail "Helm falló (exit $rc)"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría Helm via get-helm-3"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# Cilium CLI
# -----------------------------------------------------------------------------
if command -v cilium &>/dev/null; then
  skip "Cilium CLI ya instalado ($(cilium version --client 2>/dev/null | head -1 | tr -d '\n'))"
else
  info "Instalando Cilium CLI..."
  if [[ "${DRY_RUN:-false}" == false ]]; then
    CILIUM_CLI_VERSION=$(curl -fsSL https://raw.githubusercontent.com/cilium/cilium-cli/main/stable.txt 2>/dev/null)
    if [[ -z "$CILIUM_CLI_VERSION" ]]; then
      fail "No se pudo obtener versión de Cilium CLI"
    else
      ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
      curl -fsSL "https://github.com/cilium/cilium-cli/releases/download/${CILIUM_CLI_VERSION}/cilium-linux-${ARCH}.tar.gz" \
        -o /tmp/cilium-cli.tar.gz >> "${LOG_FILE:-/dev/null}" 2>&1 && \
      tar -xzf /tmp/cilium-cli.tar.gz -C /usr/local/bin cilium >> "${LOG_FILE:-/dev/null}" 2>&1 && \
      chmod +x /usr/local/bin/cilium && \
      rm -f /tmp/cilium-cli.tar.gz

      if command -v cilium &>/dev/null; then
        ok "Cilium CLI instalado ($CILIUM_CLI_VERSION)"
        APPLIED=$((APPLIED + 1))
      else
        fail "Cilium CLI no encontrado tras instalación"
      fi
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría Cilium CLI"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# kubectl (ya viene con K3s como symlink, pero verificamos)
# -----------------------------------------------------------------------------
if command -v kubectl &>/dev/null; then
  skip "kubectl disponible ($(kubectl version --client --short 2>/dev/null | tr -d '\n'))"
else
  warn "kubectl no encontrado — K3s debería haberlo instalado"
fi

# -----------------------------------------------------------------------------
# k9s — TUI para Kubernetes
# -----------------------------------------------------------------------------
if command -v k9s &>/dev/null; then
  skip "k9s ya instalado ($(k9s version --short 2>/dev/null | head -1 | tr -d '\n'))"
else
  info "Instalando k9s..."
  if [[ "${DRY_RUN:-false}" == false ]]; then
    K9S_VERSION=$(curl -fsSL https://api.github.com/repos/derailed/k9s/releases/latest \
      2>/dev/null | grep '"tag_name"' | sed 's/.*"tag_name": *"\(.*\)".*/\1/')
    if [[ -z "$K9S_VERSION" ]]; then
      warn "No se pudo obtener versión de k9s — saltando"
    else
      ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
      curl -fsSL "https://github.com/derailed/k9s/releases/download/${K9S_VERSION}/k9s_Linux_${ARCH}.tar.gz" \
        -o /tmp/k9s.tar.gz >> "${LOG_FILE:-/dev/null}" 2>&1 && \
      tar -xzf /tmp/k9s.tar.gz -C /usr/local/bin k9s >> "${LOG_FILE:-/dev/null}" 2>&1 && \
      chmod +x /usr/local/bin/k9s && \
      rm -f /tmp/k9s.tar.gz

      command -v k9s &>/dev/null && \
        { ok "k9s instalado ($K9S_VERSION)"; APPLIED=$((APPLIED + 1)); } || \
        warn "k9s no disponible tras instalación — no crítico"
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se instalaría k9s"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# Helm repos base
# -----------------------------------------------------------------------------
declare -A HELM_REPOS=(
  ["cilium"]="https://helm.cilium.io/"
  ["longhorn"]="https://charts.longhorn.io"
  ["argo"]="https://argoproj.github.io/argo-helm"
  ["hashicorp"]="https://helm.releases.hashicorp.com"
  ["jenkins"]="https://charts.jenkins.io"
  ["traefik"]="https://traefik.github.io/charts"
  ["awx-operator"]="https://ansible.github.io/awx-operator/"
  ["argo"]="https://argoproj.github.io/argo-helm"
)

for REPO_NAME in "${!HELM_REPOS[@]}"; do
  if helm repo list 2>/dev/null | grep -q "^${REPO_NAME}"; then
    skip "Helm repo $REPO_NAME ya agregado"
  else
    do_run "Agregar Helm repo $REPO_NAME" \
      helm repo add "$REPO_NAME" "${HELM_REPOS[$REPO_NAME]}"
  fi
done

if [[ "${DRY_RUN:-false}" == false ]]; then
  do_run_soft "Actualizar repos Helm" helm repo update
fi

print_summary "$MODULE_NAME"
