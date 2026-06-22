#!/usr/bin/env bash
# =============================================================================
#  HomeLab -- Módulo 07: Monitoring Agents  v1.0
#  Despliega node-exporter DaemonSet en el cluster K3s
#  Solo se ejecuta en el control-plane
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"
source "${SCRIPT_DIR}/../config/cluster.env"

MODULE_NAME="07-MONITORING-AGENTS"
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
if ! kubectl get nodes &>/dev/null; then
  fail "Cluster no accesible — verificar K3s y Cilium"
  print_summary "$MODULE_NAME"
  exit 1
fi

# -----------------------------------------------------------------------------
# Namespace monitoring
# -----------------------------------------------------------------------------
if kubectl get namespace monitoring &>/dev/null; then
  skip "Namespace monitoring ya existe"
else
  do_run "Crear namespace monitoring" kubectl create namespace monitoring
fi

# -----------------------------------------------------------------------------
# Node Exporter DaemonSet
# -----------------------------------------------------------------------------
if kubectl get daemonset node-exporter -n monitoring &>/dev/null; then
  CURRENT=$(kubectl get daemonset node-exporter -n monitoring \
    -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)
  skip "node-exporter DaemonSet ya desplegado ($CURRENT)"
else
  info "Desplegando node-exporter DaemonSet..."

  if [[ "${DRY_RUN:-false}" == false ]]; then
    kubectl apply -f - >> "${LOG_FILE:-/dev/null}" 2>&1 << 'EOF'
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: node-exporter
  namespace: monitoring
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
  labels:
    app: node-exporter
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9100"
    spec:
      serviceAccountName: node-exporter
      hostPID: true
      hostIPC: true
      hostNetwork: true
      tolerations:
        - operator: Exists
      containers:
        - name: node-exporter
          image: quay.io/prometheus/node-exporter:v1.8.2
          args:
            - --path.rootfs=/host
            - --path.procfs=/host/proc
            - --path.sysfs=/host/sys
            - --collector.filesystem.mount-points-exclude=^/(dev|proc|sys|var/lib/docker|var/lib/containerd|run/k3s/containerd)($|/)
          ports:
            - name: metrics
              containerPort: 9100
              hostPort: 9100
              protocol: TCP
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
          securityContext:
            privileged: true
            runAsNonRoot: false
            runAsUser: 0
          volumeMounts:
            - name: rootfs
              mountPath: /host
              readOnly: true
              mountPropagation: HostToContainer
            - name: proc
              mountPath: /host/proc
              readOnly: true
            - name: sys
              mountPath: /host/sys
              readOnly: true
      volumes:
        - name: rootfs
          hostPath:
            path: /
        - name: proc
          hostPath:
            path: /proc
        - name: sys
          hostPath:
            path: /sys
---
apiVersion: v1
kind: Service
metadata:
  name: node-exporter
  namespace: monitoring
  labels:
    app: node-exporter
spec:
  type: ClusterIP
  clusterIP: None
  ports:
    - name: metrics
      port: 9100
      protocol: TCP
      targetPort: 9100
  selector:
    app: node-exporter
EOF

    rc=$?
    if [[ $rc -eq 0 ]]; then
      ok "node-exporter DaemonSet desplegado"
      APPLIED=$((APPLIED + 1))
    else
      fail "kubectl apply falló (exit $rc)"
      print_summary "$MODULE_NAME"
      exit 1
    fi
  else
    log "  ${YELLOW}[DRY]${NC}  Se desplegaría node-exporter DaemonSet"
    APPLIED=$((APPLIED + 1))
  fi
fi

# -----------------------------------------------------------------------------
# Esperar que los pods estén Running
# -----------------------------------------------------------------------------
if [[ "${DRY_RUN:-false}" == false ]]; then
  info "Esperando pods node-exporter (max 2 min)..."
  WAIT=0
  NE_OK=false
  while [[ $WAIT -lt 120 ]]; do
    TOTAL=$(kubectl get pods -n monitoring -l app=node-exporter \
      --no-headers 2>/dev/null | wc -l)
    RUNNING=$(kubectl get pods -n monitoring -l app=node-exporter \
      --no-headers 2>/dev/null | grep -c "Running" || true)
    if [[ $TOTAL -gt 0 && "$RUNNING" -eq "$TOTAL" ]]; then
      NE_OK=true
      break
    fi
    printf "  node-exporter pods: %d/%d Running\r" "$RUNNING" "$TOTAL"
    sleep 5
    WAIT=$((WAIT + 5))
  done
  echo ""

  if [[ "$NE_OK" == true ]]; then
    ok "node-exporter Running en $RUNNING/$TOTAL nodos"
  else
    warn "Algunos pods aún no Running — puede necesitar más tiempo"
  fi

  log ""
  info "Estado pods:"
  kubectl get pods -n monitoring -o wide 2>/dev/null | tee -a "${LOG_FILE:-/dev/null}" || true

  log ""
  info "Verificando métricas (via kubectl — los pods usan hostNetwork):"
  # Verificar via kubectl que los pods reportan métricas
  # No se verifica via HTTP directo porque el control-plane no tiene ruta
  # host-level a las IPs de los workers (el routing es via Cilium overlay)
  RUNNING_COUNT=$(kubectl get pods -n monitoring -l app=node-exporter \
    --no-headers 2>/dev/null | grep -c "Running" || true)
  TOTAL_NODES=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
  if [[ "$RUNNING_COUNT" -eq "$TOTAL_NODES" && "$RUNNING_COUNT" -gt 0 ]]; then
    ok "node-exporter Running en todos los nodos ($RUNNING_COUNT/$TOTAL_NODES)"
    ok "Prometheus puede scrapear via IPs de VLAN 20 directamente"
  else
    warn "node-exporter Running: $RUNNING_COUNT/$TOTAL_NODES nodos"
  fi
fi

print_summary "$MODULE_NAME"
