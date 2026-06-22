#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Common Library  v1.0
#  Source este archivo desde todos los módulos:
#    source "$(dirname "$0")/../lib/common.sh"
# =============================================================================

# -----------------------------------------------------------------------------
# Colores
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# -----------------------------------------------------------------------------
# Contadores globales (cada módulo resetea los suyos)
# -----------------------------------------------------------------------------
APPLIED=0
SKIPPED=0
FAILED=0
ERRORS=()

reset_counters() {
  APPLIED=0
  SKIPPED=0
  FAILED=0
  ERRORS=()
}

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
# LOG_FILE debe estar definido antes de hacer source de este archivo

log()  {
  local msg="$*"
  echo -e "$msg"
  if [[ -n "${LOG_FILE:-}" ]]; then
    echo -e "$msg" >> "$LOG_FILE"
  fi
}

info() { log "${CYAN}  [INFO]${NC} $*"; }
skip() { log "${YELLOW}  [SKIP]${NC} $* -- ya configurado"; SKIPPED=$((SKIPPED + 1)); }
ok()   { log "${GREEN}  [OK]${NC}   $*"; APPLIED=$((APPLIED + 1)); }
fail() { log "${RED}  [FAIL]${NC} $*"; ERRORS+=("$*"); FAILED=$((FAILED + 1)); }
warn() { log "${YELLOW}  [WARN]${NC} $*"; }

section() {
  log ""
  log "${BOLD}[ $* ]${NC}"
}

# -----------------------------------------------------------------------------
# Ejecutores
# -----------------------------------------------------------------------------

# do_run — ejecuta un comando, registra resultado
# Uso: do_run "descripción" comando arg1 arg2
do_run() {
  local desc="$1"; shift
  log "${GREEN}  [RUN]${NC}  $desc"
  if [[ "${DRY_RUN:-false}" == true ]]; then
    log "  ${YELLOW}[DRY]${NC}  Comando: $*"
    APPLIED=$((APPLIED + 1))
    return 0
  fi
  local output rc
  output=$("$@" 2>&1)
  rc=$?
  if [[ -n "${LOG_FILE:-}" ]]; then
    echo "$output" >> "$LOG_FILE"
  fi
  if [[ $rc -eq 0 ]]; then
    ok "$desc"
  else
    fail "$desc (exit $rc)"
    echo "$output" | tail -3 | while IFS= read -r line; do
      log "    ${RED}▶${NC} $line"
    done
  fi
  return $rc
}

# do_run_soft — igual que do_run pero no registra como fallo si hay error
do_run_soft() {
  local desc="$1"; shift
  log "${GREEN}  [RUN]${NC}  $desc"
  if [[ "${DRY_RUN:-false}" == true ]]; then
    log "  ${YELLOW}[DRY]${NC}  Comando: $*"
    APPLIED=$((APPLIED + 1))
    return 0
  fi
  local output
  output=$("$@" 2>&1) || true
  if [[ -n "${LOG_FILE:-}" ]]; then
    echo "$output" >> "$LOG_FILE"
  fi
  ok "$desc"
}

# do_run_stream — para comandos con output largo (curl, helm install)
# El output se muestra en pantalla Y se loggea
do_run_stream() {
  local desc="$1"; shift
  log "${GREEN}  [RUN]${NC}  $desc"
  if [[ "${DRY_RUN:-false}" == true ]]; then
    log "  ${YELLOW}[DRY]${NC}  Comando: $*"
    APPLIED=$((APPLIED + 1))
    return 0
  fi
  if [[ -n "${LOG_FILE:-}" ]]; then
    "$@" 2>&1 | tee -a "$LOG_FILE"
  else
    "$@"
  fi
  local rc=${PIPESTATUS[0]}
  if [[ $rc -eq 0 ]]; then
    ok "$desc"
  else
    fail "$desc (exit $rc)"
  fi
  return $rc
}

# -----------------------------------------------------------------------------
# Helpers de sistema
# -----------------------------------------------------------------------------

require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "ERROR: Este script debe ejecutarse con sudo o como root"
    exit 1
  fi
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: Comando requerido no encontrado: $cmd"
    exit 1
  fi
}

wait_for() {
  # Espera hasta que un comando retorne 0
  # Uso: wait_for "descripción" <max_segundos> <intervalo> comando args
  local desc="$1"
  local max="$2"
  local interval="$3"
  shift 3
  local waited=0
  info "Esperando: $desc (max ${max}s)..."
  while [[ $waited -lt $max ]]; do
    if "$@" &>/dev/null; then
      ok "$desc"
      return 0
    fi
    sleep "$interval"
    waited=$((waited + interval))
    printf "  ·"
  done
  echo ""
  fail "$desc — timeout después de ${max}s"
  return 1
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

print_summary() {
  local module="${1:-}"
  log ""
  log "────────────────────────────────────────────────"
  [[ -n "$module" ]] && log "  ${BOLD}$module${NC}"
  log "  Applied : $APPLIED"
  log "  Skipped : $SKIPPED"
  log "  Failed  : $FAILED"
  if [[ ${#ERRORS[@]} -gt 0 ]]; then
    log ""
    log "  ${RED}Errores:${NC}"
    for E in "${ERRORS[@]}"; do
      log "    ${RED}✗${NC} $E"
    done
  fi
  log "────────────────────────────────────────────────"
  log ""
}
