# Enterprise HomeLab — Control-M Workbench Implementation Manual

**Version:** 1.0
**Date:** June 2026
**Status:** PLANNED — Implementación posterior a K3s
**Scope:** Control-M Workbench (free) · K3s · Longhorn · Vault · ArgoCD · Jenkins · Prometheus
**Namespace:** `workload-automation`
**Nodo destino:** Dell 7490 #2 (worker1) · 10.10.20.101 · VLAN 20 PROD

---

## Table of Contents

1. [Overview y Arquitectura](#1-overview-y-arquitectura)
2. [Prerequisites](#2-prerequisites)
3. [Cuenta BMC Developer](#3-cuenta-bmc-developer)
4. [Namespace y RBAC](#4-namespace-y-rbac)
5. [Persistent Storage — Longhorn](#5-persistent-storage--longhorn)
6. [Helm Chart — Control-M Workbench](#6-helm-chart--control-m-workbench)
7. [Ingress y DNS](#7-ingress-y-dns)
8. [Configuración inicial Control-M](#8-configuración-inicial-control-m)
9. [Control-M Agent — nodos externos](#9-control-m-agent--nodos-externos)
10. [Integración Prometheus y Grafana](#10-integración-prometheus-y-grafana)
11. [Integración Vault — secrets management](#11-integración-vault--secrets-management)
12. [GitOps con ArgoCD](#12-gitops-con-argocd)
13. [Integración Jenkins CI/CD](#13-integración-jenkins-cicd)
14. [Job Definitions — Ejemplos enterprise](#14-job-definitions--ejemplos-enterprise)
15. [Calendars y Scheduling](#15-calendars-y-scheduling)
16. [Alertas y Notificaciones](#16-alertas-y-notificaciones)
17. [Validación y Health Checks](#17-validación-y-health-checks)
18. [Troubleshooting](#18-troubleshooting)
19. [Roadmap — Scenarios enterprise](#19-roadmap--scenarios-enterprise)

---

## ⚠️ Estado Junio 2026 — BLOQUEADO POR IMAGEN

La infraestructura de Control-M está lista en el cluster K3s pero el deployment está bloqueado:

| Item | Estado |
|---|---|
| Namespace `workload-automation` | ✅ Creado por ArgoCD |
| PVC `controlm-data` 50GB Longhorn | ✅ Bound |
| ServiceAccount + RBAC | ✅ Configurado |
| ConfigMap `controlm-config` | ✅ Con endpoints Vault/Jenkins/ArgoCD |
| Deployment Control-M Workbench | ❌ BLOQUEADO |

**Causa del bloqueo:** BMC removió la imagen `controlm/workbench` de Docker Hub (404). La imagen ahora está en `distribution.bmc.com/ctmem/workbench:9.22.50-GA` y requiere:
1. Cuenta activa en EPD de BMC (Electronic Product Distribution)
2. Login: `docker login distribution.bmc.com -u<USER> -p<TOKEN>`

**Cuando se resuelva el acceso EPD:**
```bash
# Actualizar imagen en cluster.env:
CONTROLM_IMAGE="distribution.bmc.com/ctmem/workbench:9.22.50-GA"

# Re-ejecutar módulo 11:
sudo bash bootstrap.sh --role server --only 11
```

---

## 1. Overview y Arquitectura

### ¿Por qué Control-M en este lab?

Control-M es el estándar enterprise de workload automation. Su presencia en el lab permite:

- Demostrar scheduling enterprise en portafolio
- Practicar para certificaciones BMC Control-M
- Integrar con el pipeline GitOps (ArgoCD + Jenkins + Vault)
- Simular escenarios reales: ETL, batch jobs, file watchers, dependencies

### Control-M Workbench (edición gratuita)

BMC ofrece una edición developer completamente gratuita:

```
Control-M Workbench
  ├── Control-M Server embedded       → scheduling engine
  ├── Control-M Enterprise Manager   → job management
  ├── Control-M Agent embedded       → job execution
  ├── Web UI                         → puerto 8443
  ├── Automation API (REST)          → mismo que producción
  ├── ctm CLI                        → control desde terminal
  └── Job definitions JSON/YAML      → versionables en Git
```

**Limitaciones de la edición gratuita:**
- Máximo 5 jobs en paralelo — suficiente para un lab completo
- Sin SLA enforcement
- Sin clustering/HA
- Requiere registro en BMC Developer Portal (gratuito)

### Arquitectura en el lab

```
┌─────────────────── VLAN 10 MGMT ──────────────────────────────────┐
│  T430 (10.10.10.10)                                                │
│  Prometheus ←── scrape ──→ Control-M :8443/automation-api/metrics │
│  Grafana    ←── queries ─→ dashboards de jobs, SLAs, alertas      │
│  Alertmanager ←── alertas de job failures                         │
└────────────────────────────────────────────────────────────────────┘
                        ↑ pfSense routing VLAN10 ↔ VLAN20
┌─────────────────── VLAN 20 PROD (K3s Cluster) ────────────────────┐
│                                                                     │
│  Namespace: workload-automation                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Control-M Workbench (StatefulSet)                           │  │
│  │  Node: Dell 7490 #2 (worker1) · 10.10.20.101               │  │
│  │  Image: bmc/control-m-workbench:latest                      │  │
│  │  Web UI + API: :8443                                         │  │
│  │  Agent port:   :7006                                         │  │
│  │  PVC Longhorn: 50GB (config + jobs + logs)                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           │                      │                    │             │
│    triggers jobs           consume secrets        GitOps           │
│           ↓                      ↓                    ↓            │
│  K3s Jobs / CronJobs      Vault (KV + PKI)      ArgoCD            │
│  Python/Shell/SQL          credenciales DB        job defs Git     │
│  scripts en PVC            API keys, certs        → REST API       │
│           │                                                         │
│  Jenkins ──→ REST API Control-M (trigger desde pipeline CI)        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                        ↑
┌──────── Git (source of truth) ─────────────────────────────────────┐
│  infrastructure/controlm/                                           │
│  ├── helm/              ← Helm chart values                        │
│  ├── jobs/              ← definiciones JSON de jobs                │
│  ├── folders/           ← job flows / pipelines                    │
│  ├── calendars/         ← calendarios de ejecución                 │
│  ├── connections/       ← connection profiles (sin secrets)        │
│  └── scripts/           ← shell/python ejecutados por jobs         │
└─────────────────────────────────────────────────────────────────────┘
```

### IPs y puertos de referencia

| Servicio | Dirección | Puerto | Protocolo |
|---|---|---|---|
| Control-M Web UI | `controlm.mgmt` | 8443 | HTTPS |
| Control-M API | `controlm.mgmt/automation-api` | 8443 | HTTPS REST |
| Control-M Agent | interno K3s | 7006 | TCP |
| Control-M EM | interno K3s | 2369 | TCP |
| Prometheus scrape | `controlm.mgmt` | 8443 | HTTPS |

---

## 2. Prerequisites

### K3s cluster (requisito bloqueante)

El cluster K3s debe estar completamente operativo antes de iniciar:

```bash
# Verificar estado del cluster
kubectl get nodes -o wide
# Expected: 5 nodos en Ready

# Verificar Cilium
kubectl -n kube-system get pods | grep cilium
# Expected: All Running

# Verificar Longhorn
kubectl -n longhorn-system get pods
# Expected: All Running

# Verificar ArgoCD
kubectl -n argocd get pods
# Expected: All Running

# Verificar Vault
kubectl -n vault get pods
# Expected: vault-0 Running, unsealed

# Verificar Traefik o Nginx Ingress
kubectl -n kube-system get pods | grep traefik
# Expected: Running
```

### StorageClass Longhorn disponible

```bash
kubectl get storageclass
# Expected: longhorn (default)
```

### Helm v3 disponible desde P53

```bash
helm version
# Expected: v3.x.x

helm repo list | grep bmc
# Si no está, se agrega en paso 6
```

### ctm CLI (Control-M Automation API CLI)

```bash
# En P53 — instalar después de desplegar el Workbench
# Download desde https://developers.bmc.com/

# Verificar después de instalación
ctm --version
```

---

## 3. Cuenta BMC Developer

### 3.1 Registro

1. Ir a `https://developers.bmc.com`
2. Click en **Sign Up** (gratuito)
3. Completar registro con email corporativo o personal
4. Confirmar email

### 3.2 Obtener acceso a la imagen Docker

Una vez registrado:

1. Ir a `https://hub.docker.com/u/bmc` o buscar `bmc/control-m-workbench`
2. Hacer login con las credenciales BMC:

```bash
docker login -u <BMC_USERNAME>
# Ingresar contraseña cuando se solicite
```

O en K3s, crear el Secret de registry:

```bash
kubectl create secret docker-registry bmc-registry \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=<BMC_USERNAME> \
  --docker-password=<BMC_PASSWORD> \
  --docker-email=<EMAIL> \
  -n workload-automation
```

### 3.3 Verificar acceso a la imagen

```bash
# En cualquier nodo K3s o desde P53 con Docker
docker pull bmc/control-m-workbench:latest

# Verificar
docker images | grep control-m
```

### 3.4 ctm CLI download

```bash
# Desde la cuenta BMC Developer Portal
# Download → Control-M Workbench → CLI Tool → Linux x64

# Instalar en P53
chmod +x ctm-cli-*.tar.gz
tar xzf ctm-cli-*.tar.gz -C /usr/local/bin/
ctm --version
```

---

## 4. Namespace y RBAC

### 4.1 Namespace

```bash
kubectl create namespace workload-automation
kubectl label namespace workload-automation \
  environment=production \
  team=platform \
  app.kubernetes.io/name=control-m
```

### 4.2 ServiceAccount

```yaml
# infrastructure/controlm/k8s/serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: control-m
  namespace: workload-automation
  labels:
    app: control-m
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: control-m
  namespace: workload-automation
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "pods/exec"]
    verbs: ["get", "list", "create", "delete", "watch"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "create", "delete", "watch", "update"]
  - apiGroups: [""]
    resources: ["secrets", "configmaps"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: control-m
  namespace: workload-automation
subjects:
  - kind: ServiceAccount
    name: control-m
    namespace: workload-automation
roleRef:
  kind: Role
  name: control-m
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply -f infrastructure/controlm/k8s/serviceaccount.yaml
```

### 4.3 NetworkPolicy

```yaml
# infrastructure/controlm/k8s/networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: control-m-policy
  namespace: workload-automation
spec:
  podSelector:
    matchLabels:
      app: control-m
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Web UI y API desde VLAN 10 MGMT y VLAN 30 DEV
    - from:
        - ipBlock:
            cidr: 10.10.10.0/24    # VLAN 10 MGMT (T430 monitoring)
        - ipBlock:
            cidr: 10.10.30.0/24    # VLAN 30 DEV
        - namespaceSelector:
            matchLabels:
              name: ci-cd           # Jenkins puede llamar la API
    ports:
      - protocol: TCP
        port: 8443
  egress:
    # Permitir todo — jobs necesitan salida a internet y otros servicios
    - {}
```

```bash
kubectl apply -f infrastructure/controlm/k8s/networkpolicy.yaml
```

---

## 5. Persistent Storage — Longhorn

### 5.1 StorageClass dedicada para Control-M

```yaml
# infrastructure/controlm/k8s/storageclass.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn-controlm
  annotations:
    storageclass.kubernetes.io/is-default-class: "false"
provisioner: driver.longhorn.io
allowVolumeExpansion: true
reclaimPolicy: Retain    # Retain: no borrar datos al eliminar PVC
parameters:
  numberOfReplicas: "2"           # 2 replicas — datos importantes
  staleReplicaTimeout: "2880"
  fromBackup: ""
  dataLocality: "disabled"
```

```bash
kubectl apply -f infrastructure/controlm/k8s/storageclass.yaml
```

### 5.2 PersistentVolumeClaim

```yaml
# infrastructure/controlm/k8s/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: control-m-data
  namespace: workload-automation
  labels:
    app: control-m
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: longhorn-controlm
  resources:
    requests:
      storage: 50Gi
```

```bash
kubectl apply -f infrastructure/controlm/k8s/pvc.yaml

# Verificar
kubectl -n workload-automation get pvc
# Expected: control-m-data · Bound · 50Gi
```

---

## 6. Helm Chart — Control-M Workbench

### 6.1 Estructura del chart

```
infrastructure/controlm/helm/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── statefulset.yaml
    ├── service.yaml
    ├── configmap.yaml
    └── secret.yaml
```

### 6.2 Chart.yaml

```yaml
# infrastructure/controlm/helm/Chart.yaml
apiVersion: v2
name: control-m-workbench
description: Control-M Workbench deployment for HomeLab
type: application
version: 1.0.0
appVersion: "22.0"
```

### 6.3 values.yaml

```yaml
# infrastructure/controlm/helm/values.yaml

image:
  repository: bmc/control-m-workbench
  tag: latest
  pullPolicy: Always
  pullSecret: bmc-registry

# Recursos — Dell 7490 #2 tiene 32GB DDR4
resources:
  requests:
    cpu: "2"
    memory: "8Gi"
  limits:
    cpu: "4"
    memory: "16Gi"

# Node placement
nodeSelector:
  kubernetes.io/hostname: dell-7490-2

tolerations: []

# Storage
persistence:
  enabled: true
  existingClaim: control-m-data
  mountPath: /home/controlm/ctm_agent/data

# Networking
service:
  type: ClusterIP
  port: 8443
  agentPort: 7006

# Control-M config
controlm:
  # Admin credentials — será sobreescrito por Secret desde Vault
  adminUser: admin
  # password desde Secret k8s
  passwordSecretName: control-m-credentials
  passwordSecretKey: admin-password

  # Agent config
  agent:
    name: "homelab-k3s-agent"
    hostGroup: "K3S_PROD"

  # Workbench específico
  workbench:
    # License — free developer edition no requiere licencia
    licenseType: workbench

# Environment variables adicionales
env:
  - name: CTM_SERVER_NAME
    value: "homelab"
  - name: CTM_AGENT_NAME
    value: "homelab-k3s-agent"
  - name: JAVA_OPTS
    value: "-Xms2g -Xmx6g"

# Probes
livenessProbe:
  httpGet:
    path: /automation-api/session/login
    port: 8443
    scheme: HTTPS
  initialDelaySeconds: 120
  periodSeconds: 30
  timeoutSeconds: 10
  failureThreshold: 5

readinessProbe:
  httpGet:
    path: /automation-api/session/login
    port: 8443
    scheme: HTTPS
  initialDelaySeconds: 90
  periodSeconds: 15
  timeoutSeconds: 10
  failureThreshold: 3
```

### 6.4 StatefulSet template

```yaml
# infrastructure/controlm/helm/templates/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: control-m
  namespace: workload-automation
  labels:
    app: control-m
spec:
  serviceName: control-m
  replicas: 1
  selector:
    matchLabels:
      app: control-m
  template:
    metadata:
      labels:
        app: control-m
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8443"
        prometheus.io/scheme: "https"
        prometheus.io/path: "/automation-api/metrics"
    spec:
      serviceAccountName: control-m
      imagePullSecrets:
        - name: {{ .Values.image.pullSecret }}
      nodeSelector:
        {{- toYaml .Values.nodeSelector | nindent 8 }}
      containers:
        - name: control-m
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: 8443
              name: web
            - containerPort: 7006
              name: agent
          env:
            - name: CTM_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.controlm.passwordSecretName }}
                  key: {{ .Values.controlm.passwordSecretKey }}
            {{- toYaml .Values.env | nindent 12 }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            - name: data
              mountPath: {{ .Values.persistence.mountPath }}
          livenessProbe:
            {{- toYaml .Values.livenessProbe | nindent 12 }}
          readinessProbe:
            {{- toYaml .Values.readinessProbe | nindent 12 }}
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: {{ .Values.persistence.existingClaim }}
```

### 6.5 Service

```yaml
# infrastructure/controlm/helm/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: control-m
  namespace: workload-automation
  labels:
    app: control-m
spec:
  selector:
    app: control-m
  ports:
    - name: web
      port: 8443
      targetPort: 8443
    - name: agent
      port: 7006
      targetPort: 7006
  type: ClusterIP
```

### 6.6 Secret (placeholder — el valor viene de Vault)

```yaml
# infrastructure/controlm/helm/templates/secret.yaml
# NOTA: Este Secret es creado por External Secrets Operator desde Vault
# No hardcodear passwords aquí — este archivo es solo para referencia
apiVersion: v1
kind: Secret
metadata:
  name: control-m-credentials
  namespace: workload-automation
  annotations:
    # Gestionado por External Secrets Operator
    helm.sh/resource-policy: keep
type: Opaque
# Los datos son inyectados por ESO desde Vault
# vault kv put secret/controlm/admin admin-password="<secure-password>"
```

### 6.7 Despliegue

```bash
# Desde P53 — con kubeconfig del cluster

# 1. Primero crear el Secret manualmente (bootstrap)
kubectl create secret generic control-m-credentials \
  --from-literal=admin-password="ControlM2026lab!" \
  -n workload-automation

# 2. Desplegar el chart
helm upgrade --install control-m \
  infrastructure/controlm/helm/ \
  -n workload-automation \
  --wait \
  --timeout 10m

# 3. Monitorear el arranque (tarda ~5 minutos)
kubectl -n workload-automation logs -f statefulset/control-m

# 4. Verificar estado
kubectl -n workload-automation get pods
# Expected: control-m-0   1/1   Running

kubectl -n workload-automation get pvc
# Expected: control-m-data   Bound   50Gi
```

---

## 7. Ingress y DNS

### 7.1 Traefik IngressRoute

```yaml
# infrastructure/controlm/k8s/ingressroute.yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: control-m
  namespace: workload-automation
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`controlm.mgmt`)
      kind: Rule
      services:
        - name: control-m
          port: 8443
          scheme: https    # Traefik habla HTTPS con el backend
  tls:
    secretName: controlm-tls    # cert-manager provee el certificado
```

### 7.2 cert-manager Certificate

```yaml
# infrastructure/controlm/k8s/certificate.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: controlm-tls
  namespace: workload-automation
spec:
  secretName: controlm-tls
  issuerRef:
    name: homelab-ca-issuer    # ClusterIssuer con CA interna
    kind: ClusterIssuer
  dnsNames:
    - controlm.mgmt
    - controlm-api.mgmt
```

```bash
kubectl apply -f infrastructure/controlm/k8s/ingressroute.yaml
kubectl apply -f infrastructure/controlm/k8s/certificate.yaml
```

### 7.3 DNS Rewrite en AdGuard Home

Acceder a `http://adguard.mgmt` o `http://10.10.10.3:3000`:

```
Filters → DNS Rewrites → Add DNS rewrite

Domain:  controlm.mgmt
Answer:  <MetalLB IP asignada por Cilium L2>

Domain:  controlm-api.mgmt
Answer:  <mismo MetalLB IP>
```

Obtener la IP de MetalLB:

```bash
kubectl -n workload-automation get svc
# O desde el LoadBalancer de Traefik
kubectl -n kube-system get svc traefik -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

### 7.4 /etc/hosts en P53 (fallback)

```bash
echo "<MetalLB-IP>  controlm.mgmt controlm-api.mgmt" | sudo tee -a /etc/hosts
```

### 7.5 Verificar acceso

```bash
# Desde P53
curl -sk https://controlm.mgmt/automation-api/session/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ControlM2026lab!"}' | python3 -m json.tool

# Expected: {"token": "...", "version": "22.0.0", "userId": "admin"}
```

---

## 8. Configuración inicial Control-M

### 8.1 Login desde Web UI

```
URL:      https://controlm.mgmt
Usuario:  admin
Password: ControlM2026lab!
```

### 8.2 Login via ctm CLI

```bash
# Configurar endpoint
ctm env add homelab \
  https://controlm.mgmt \
  admin \
  "ControlM2026lab!"

# Verificar
ctm env show homelab

# Login
ctm session login -e homelab
# Expected: Logged in successfully
```

### 8.3 Verificar servidor y agente

```bash
# Estado del servidor
ctm config server::get homelab

# Estado del agente embedded
ctm config agent::get homelab homelab-k3s-agent

# Expected:
# Agent Name: homelab-k3s-agent
# Status: Available
# Host Group: K3S_PROD
```

### 8.4 Crear Host Groups

Los Host Groups agrupan agentes por función:

```bash
# K3s workers como un grupo lógico
ctm config hostgroup::agents::add homelab K3S_PROD homelab-k3s-agent

# Verificar
ctm config hostgroup::agents::get homelab K3S_PROD
```

### 8.5 Connection Profiles — conexiones a sistemas externos

Connection Profiles son las credenciales/configuración para que los jobs conecten a sistemas externos. Los secretos vienen de Vault.

```json
// infrastructure/controlm/connections/ssh-t430.json
{
  "SSHConnection": {
    "Type": "ConnectionProfile:SSHDatabase",
    "AI_Destination": "10.10.10.10",
    "AI_User": "admin",
    "AI_PasswordClear": "%%VAULT_T430_SSH_PASS%%",
    "AI_Port": "22"
  }
}
```

```bash
# Crear connection profile
ctm deploy transform \
  infrastructure/controlm/connections/ssh-t430.json \
  -e homelab
```

---

## 9. Control-M Agent — nodos externos

Para que Control-M ejecute jobs en el T430 (monitoring server) u otras máquinas fuera del cluster, se despliega el agente como servicio systemd.

### 9.1 Instalar agente en T430

```bash
# En T430 (10.10.10.10)

# Descargar instalador del agente desde BMC Developer Portal
# Versión compatible con el Workbench desplegado

# Requerimientos mínimos del agente
# Java 11+
sudo dnf install -y java-11-openjdk

# Crear usuario para el agente
sudo useradd -m -s /bin/bash ctmagent

# Instalar agente
sudo -u ctmagent ./ctminstall.sh \
  -server controlm.mgmt \
  -port 8443 \
  -agentname t430-monitoring \
  -hostgroup MONITORING_MGMT
```

### 9.2 Configurar como servicio systemd

```ini
# /etc/systemd/system/ctmagent.service
[Unit]
Description=Control-M Agent
After=network-online.target

[Service]
Type=forking
User=ctmagent
ExecStart=/home/ctmagent/ctm/scripts/start-ag.sh
ExecStop=/home/ctmagent/ctm/scripts/shut-ag.sh
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ctmagent
sudo systemctl status ctmagent
```

### 9.3 Verificar agente en Control-M

```bash
ctm config agent::get homelab t430-monitoring
# Expected: Status: Available
```

---

## 10. Integración Prometheus y Grafana

### 10.1 Configurar scraping en Prometheus (T430)

Agregar al `prometheus.yml` del T430:

```yaml
# En /opt/monitoring/prometheus/config/prometheus.yml
# Agregar nuevo job:

  - job_name: controlm
    scheme: https
    tls_config:
      insecure_skip_verify: true
    metrics_path: /automation-api/metrics
    params:
      token: ["<CTM_API_TOKEN>"]
    static_configs:
      - targets: ["controlm.mgmt:8443"]
        labels:
          instance: control-m
          service: workload-automation
```

Obtener token de API:

```bash
# Desde P53
TOKEN=$(ctm session login -e homelab | grep token | awk -F'"' '{print $4}')
echo "Token: $TOKEN"
```

Recargar Prometheus:

```bash
# En T430
curl -X POST http://localhost:9091/-/reload
```

### 10.2 Regla de alertas Control-M

Agregar en `/opt/monitoring/prometheus/config/rules/controlm.yml`:

```yaml
groups:

  - name: controlm
    rules:

      - alert: ControlMDown
        expr: up{job="controlm"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Control-M Workbench is unreachable"
          description: "Control-M API at controlm.mgmt not responding for 2m"

      - alert: ControlMJobFailed
        expr: increase(controlm_jobs_failed_total[5m]) > 0
        labels:
          severity: warning
        annotations:
          summary: "Control-M job failure detected"
          description: "{{ $value }} job(s) failed in the last 5 minutes"

      - alert: ControlMAgentDown
        expr: controlm_agent_status == 0
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "Control-M Agent {{ $labels.agent }} is down"

      - alert: ControlMJobSLABreach
        expr: controlm_job_duration_seconds > 3600
        labels:
          severity: warning
        annotations:
          summary: "Job {{ $labels.job_name }} exceeds 1h SLA"
```

```bash
# Recargar Prometheus
curl -X POST http://localhost:9091/-/reload

# Verificar regla
curl -s http://localhost:9091/api/v1/rules | \
  python3 -m json.tool | grep controlm
```

### 10.3 Dashboard Grafana para Control-M

Importar via API desde T430:

```bash
sudo bash << 'EOF'

PASS="HomeLab2026x"

cat > /tmp/controlm-dashboard.json << 'DASH'
{
  "dashboard": {
    "title": "Control-M Workload Automation",
    "tags": ["controlm", "jobs", "scheduling"],
    "panels": [
      {
        "title": "Jobs completados (última hora)",
        "type": "stat",
        "targets": [{"expr": "increase(controlm_jobs_completed_total[1h])"}]
      },
      {
        "title": "Jobs fallidos (última hora)",
        "type": "stat",
        "targets": [{"expr": "increase(controlm_jobs_failed_total[1h])"}]
      },
      {
        "title": "Jobs en ejecución",
        "type": "gauge",
        "targets": [{"expr": "controlm_jobs_running"}]
      },
      {
        "title": "Duración promedio de jobs",
        "type": "timeseries",
        "targets": [{"expr": "avg(controlm_job_duration_seconds)"}]
      },
      {
        "title": "Estado de agentes",
        "type": "table",
        "targets": [{"expr": "controlm_agent_status"}]
      }
    ],
    "refresh": "30s",
    "time": {"from": "now-6h", "to": "now"}
  },
  "overwrite": true,
  "folderId": 0
}
DASH

curl -s -X POST \
  -u "admin:${PASS}" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/dashboards/import \
  -d @/tmp/controlm-dashboard.json | python3 -m json.tool | grep -E "status|url"

EOF
```

---

## 11. Integración Vault — secrets management

### 11.1 Policy Vault para Control-M

```hcl
# infrastructure/controlm/vault/policy.hcl
path "secret/data/controlm/*" {
  capabilities = ["read"]
}

path "secret/data/database/*" {
  capabilities = ["read"]
}

path "secret/data/ssh/*" {
  capabilities = ["read"]
}
```

```bash
# Crear policy en Vault
vault policy write control-m \
  infrastructure/controlm/vault/policy.hcl

# Crear secrets
vault kv put secret/controlm/admin \
  admin-password="ControlM2026lab!" \
  api-token="<generated-token>"

vault kv put secret/controlm/database \
  host="db.lab.internal" \
  port="5432" \
  username="ctmuser" \
  password="<db-password>"

vault kv put secret/ssh/t430 \
  username="admin" \
  password="<ssh-password>"
```

### 11.2 External Secrets Operator

Reemplazar el Secret manual por ESO para sincronización automática desde Vault:

```yaml
# infrastructure/controlm/k8s/externalsecret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: control-m-credentials
  namespace: workload-automation
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: control-m-credentials
    creationPolicy: Owner
  data:
    - secretKey: admin-password
      remoteRef:
        key: secret/controlm/admin
        property: admin-password
    - secretKey: api-token
      remoteRef:
        key: secret/controlm/admin
        property: api-token
```

```bash
kubectl apply -f infrastructure/controlm/k8s/externalsecret.yaml

# Verificar sincronización
kubectl -n workload-automation get externalsecret
# Expected: control-m-credentials   SecretSynced   True
```

### 11.3 Variables de Vault en job definitions

En Control-M, los valores de Vault se referencian como variables `%%VAR%%`:

```json
{
  "DBJob": {
    "Type": "Job:Script",
    "Command": "python3 /scripts/etl/extract.py",
    "Variables": [
      {"%%DB_HOST%%": "%%VAULT_DB_HOST%%"},
      {"%%DB_PASS%%": "%%VAULT_DB_PASS%%"}
    ]
  }
}
```

Los valores `%%VAULT_*%%` son resueltos por Control-M en runtime consultando la integración con Vault.

---

## 12. GitOps con ArgoCD

### 12.1 Estructura del repositorio

```
infrastructure/controlm/
├── helm/               ← Helm chart (sección 6)
├── jobs/
│   ├── etl/
│   │   ├── daily-extract.json
│   │   ├── weekly-transform.json
│   │   └── monthly-report.json
│   ├── monitoring/
│   │   ├── prometheus-backup.json
│   │   └── log-cleanup.json
│   └── k3s/
│       ├── longhorn-backup.json
│       └── node-health-check.json
├── folders/
│   ├── ETL_PIPELINE.json
│   └── MONITORING_OPS.json
├── calendars/
│   ├── WORKDAYS.json
│   └── MONTH_END.json
├── connections/
│   ├── ssh-t430.json
│   └── db-postgres.json
├── scripts/
│   ├── etl/
│   │   ├── extract.py
│   │   └── transform.py
│   └── monitoring/
│       └── backup-prometheus.sh
└── k8s/
    ├── serviceaccount.yaml
    ├── networkpolicy.yaml
    ├── pvc.yaml
    └── externalsecret.yaml
```

### 12.2 ArgoCD Application

```yaml
# argocd/apps/control-m.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: control-m
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: platform
  source:
    repoURL: https://gitea.lab.internal/homelab/infrastructure
    targetRevision: main
    path: controlm/helm
  destination:
    server: https://kubernetes.default.svc
    namespace: workload-automation
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - Replace=true
```

```bash
kubectl apply -f argocd/apps/control-m.yaml

# Verificar sincronización
argocd app get control-m
argocd app sync control-m
```

### 12.3 GitOps pipeline para job definitions

El flujo GitOps para job definitions es:

```
Developer → edita jobs/*.json → git push
    ↓
ArgoCD detecta cambio en el repo (no aplica directo — jobs no son recursos K8s)
    ↓
ArgoCD ejecuta hook post-sync:
  ctm deploy jobs infrastructure/controlm/jobs/ -e homelab
    ↓
Control-M aplica las nuevas definiciones
    ↓
Prometheus detecta nuevos jobs en los scraped metrics
```

#### Post-sync hook

```yaml
# infrastructure/controlm/helm/templates/sync-hook.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: controlm-deploy-jobs
  namespace: workload-automation
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
spec:
  template:
    spec:
      serviceAccountName: control-m
      containers:
        - name: deploy-jobs
          image: curlimages/curl:latest
          command:
            - /bin/sh
            - -c
            - |
              # Login
              TOKEN=$(curl -sk -X POST \
                https://controlm.mgmt/automation-api/session/login \
                -H "Content-Type: application/json" \
                -d "{\"username\":\"admin\",\"password\":\"$CTM_PASS\"}" \
                | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

              # Deploy jobs
              for f in /jobs/*.json; do
                curl -sk -X POST \
                  https://controlm.mgmt/automation-api/deploy \
                  -H "Authorization: Bearer $TOKEN" \
                  -H "Content-Type: application/json" \
                  -d @$f
              done
          env:
            - name: CTM_PASS
              valueFrom:
                secretKeyRef:
                  name: control-m-credentials
                  key: admin-password
          volumeMounts:
            - name: jobs
              mountPath: /jobs
      volumes:
        - name: jobs
          configMap:
            name: controlm-jobs
      restartPolicy: OnFailure
```

---

## 13. Integración Jenkins CI/CD

### 13.1 Plugin Control-M en Jenkins

Instalar desde Jenkins UI o JCasC:

```yaml
# En jenkins values.yaml — agregar al installPlugins:
installPlugins:
  # ... plugins existentes ...
  - bmc-control-m    # Control-M Automation API plugin
```

### 13.2 Jenkins credential para Control-M

```groovy
// Jenkinsfile bootstrap credential
// Vault provee la contraseña via Jenkins Vault plugin

pipeline {
  environment {
    CTM_SERVER = "https://controlm.mgmt"
    CTM_USER   = "admin"
  }
  stages {
    stage('Configure Control-M credential') {
      steps {
        withVault(
          vaultSecrets: [[
            path: 'secret/controlm/admin',
            secretValues: [[envVar: 'CTM_PASS', vaultKey: 'admin-password']]
          ]]
        ) {
          sh '''
            curl -sk -X POST ${CTM_SERVER}/automation-api/session/login \
              -H "Content-Type: application/json" \
              -d "{\\"username\\":\\"${CTM_USER}\\",\\"password\\":\\"${CTM_PASS}\\"}"
          '''
        }
      }
    }
  }
}
```

### 13.3 Trigger de job Control-M desde Jenkinsfile

```groovy
// Jenkinsfile — pipeline que dispara un job de Control-M
pipeline {
  agent any

  environment {
    CTM_SERVER = "https://controlm.mgmt"
  }

  stages {

    stage('Build') {
      steps {
        sh 'mvn clean package'
      }
    }

    stage('Push artifact') {
      steps {
        sh 'docker push harbor.lab.internal/myapp:${BUILD_NUMBER}'
      }
    }

    stage('Trigger ETL via Control-M') {
      steps {
        withVault(
          vaultSecrets: [[
            path: 'secret/controlm/admin',
            secretValues: [
              [envVar: 'CTM_PASS', vaultKey: 'admin-password']
            ]
          ]]
        ) {
          script {
            // Login y obtener token
            def loginResp = sh(
              script: """
                curl -sk -X POST ${CTM_SERVER}/automation-api/session/login \
                  -H 'Content-Type: application/json' \
                  -d '{"username":"admin","password":"${env.CTM_PASS"}'
              """,
              returnStdout: true
            ).trim()

            def token = readJSON(text: loginResp).token

            // Trigger job
            def runResp = sh(
              script: """
                curl -sk -X POST ${CTM_SERVER}/automation-api/run \
                  -H 'Authorization: Bearer ${token}' \
                  -H 'Content-Type: application/json' \
                  -d '{
                    "ctm": "homelab",
                    "folder": "ETL_PIPELINE",
                    "jobs": "POST_BUILD_ETL",
                    "variables": [
                      {"BUILD_NUMBER": "${env.BUILD_NUMBER}"},
                      {"ARTIFACT_VERSION": "${BUILD_NUMBER}"}
                    ]
                  }'
              """,
              returnStdout: true
            ).trim()

            def runId = readJSON(text: runResp).runId
            echo "Control-M run started: ${runId}"

            // Guardar runId para polling
            env.CTM_RUN_ID = runId
          }
        }
      }
    }

    stage('Wait for Control-M completion') {
      steps {
        withVault(
          vaultSecrets: [[
            path: 'secret/controlm/admin',
            secretValues: [
              [envVar: 'CTM_PASS', vaultKey: 'admin-password']
            ]
          ]]
        ) {
          script {
            def token = getCtmToken(env.CTM_SERVER, "admin", env.CTM_PASS)
            def maxWait = 30   // minutos máximos de espera
            def waited  = 0
            def status  = "Executing"

            while (status == "Executing" && waited < maxWait) {
              sleep(60)
              waited++

              def statusResp = sh(
                script: """
                  curl -sk ${CTM_SERVER}/automation-api/run/status/${env.CTM_RUN_ID} \
                    -H 'Authorization: Bearer ${token}'
                """,
                returnStdout: true
              ).trim()

              status = readJSON(text: statusResp).statuses[0].status
              echo "Control-M status (${waited}m): ${status}"
            }

            if (status != "Ended OK") {
              error("Control-M job failed with status: ${status}")
            }
          }
        }
      }
    }
  }
}
```

---

## 14. Job Definitions — Ejemplos enterprise

Los jobs se definen en JSON. Todos los archivos van en `infrastructure/controlm/jobs/`.

### 14.1 Job básico — Shell script

```json
// jobs/monitoring/prometheus-backup.json
{
  "PrometheusBackup": {
    "Type": "Folder",
    "ControlmServer": "homelab",
    "OrderMethod": "Manual",
    "Jobs": {
      "PROMETHEUS_SNAPSHOT": {
        "Type": "Job:Script",
        "Host": "t430-monitoring",
        "RunAs": "admin",
        "Command": "curl -X POST http://localhost:9091/api/v1/admin/tsdb/snapshot",
        "Description": "Crear snapshot de Prometheus TSDB",
        "When": {
          "Weekdays": ["ALL"],
          "Times": [{"From": "02:00", "To": "02:05"}]
        },
        "Notification": {
          "Mail": {
            "OnJobEnd": "admin@homelab.local",
            "OnJobFail": "admin@homelab.local"
          }
        }
      },
      "COPY_SNAPSHOT_TO_BACKUP": {
        "Type": "Job:Script",
        "Host": "t430-monitoring",
        "RunAs": "admin",
        "Command": "rsync -av /opt/monitoring/prometheus/data/snapshots/ /srv/storage2/prometheus-backups/",
        "Description": "Copiar snapshot al disco de backup",
        "DependsOn": [
          {"JobName": "PROMETHEUS_SNAPSHOT", "Condition": "Ended OK"}
        ]
      }
    }
  }
}
```

### 14.2 Pipeline ETL con dependencias

```json
// jobs/etl/daily-pipeline.json
{
  "ETL_DAILY": {
    "Type": "Folder",
    "ControlmServer": "homelab",
    "OrderMethod": "Automatic",
    "When": {
      "Weekdays": ["MON", "TUE", "WED", "THU", "FRI"],
      "Times": [{"From": "06:00", "To": "06:05"}]
    },
    "Jobs": {
      "EXTRACT_SOURCE": {
        "Type": "Job:Script",
        "Host": "homelab-k3s-agent",
        "Command": "python3 /scripts/etl/extract.py --source db --date %%ODATE%%",
        "Variables": [
          {"%%DB_HOST%%": "%%VAULT_DB_HOST%%"},
          {"%%DB_USER%%": "%%VAULT_DB_USER%%"},
          {"%%DB_PASS%%": "%%VAULT_DB_PASS%%"}
        ],
        "Description": "Extracción de datos de la BD origen"
      },
      "TRANSFORM_DATA": {
        "Type": "Job:Script",
        "Host": "homelab-k3s-agent",
        "Command": "python3 /scripts/etl/transform.py --date %%ODATE%%",
        "Description": "Transformación y limpieza de datos",
        "DependsOn": [
          {"JobName": "EXTRACT_SOURCE", "Condition": "Ended OK"}
        ]
      },
      "LOAD_TARGET": {
        "Type": "Job:Script",
        "Host": "homelab-k3s-agent",
        "Command": "python3 /scripts/etl/load.py --date %%ODATE%% --target warehouse",
        "Description": "Carga en el data warehouse",
        "DependsOn": [
          {"JobName": "TRANSFORM_DATA", "Condition": "Ended OK"}
        ]
      },
      "VALIDATE_LOAD": {
        "Type": "Job:Script",
        "Host": "homelab-k3s-agent",
        "Command": "python3 /scripts/etl/validate.py --date %%ODATE%%",
        "Description": "Validación de integridad post-carga",
        "DependsOn": [
          {"JobName": "LOAD_TARGET", "Condition": "Ended OK"}
        ]
      },
      "NOTIFY_SUCCESS": {
        "Type": "Job:Script",
        "Host": "homelab-k3s-agent",
        "Command": "curl -X POST https://hooks.slack.com/... -d '{\"text\":\"ETL completed for %%ODATE%%\"}'",
        "Description": "Notificación de éxito",
        "DependsOn": [
          {"JobName": "VALIDATE_LOAD", "Condition": "Ended OK"}
        ]
      }
    }
  }
}
```

### 14.3 File Watcher — job activado por archivo

```json
// jobs/etl/file-watcher.json
{
  "FILE_WATCH_PIPELINE": {
    "Type": "Folder",
    "ControlmServer": "homelab",
    "OrderMethod": "Manual",
    "Jobs": {
      "WATCH_INCOMING_FILE": {
        "Type": "Job:FileWatcher:Create",
        "Host": "t430-monitoring",
        "FileName": "/srv/storage/incoming/*.csv",
        "Description": "Espera archivo CSV en directorio incoming",
        "TimeLimit": "04:00",
        "MinimumFileSize": "1"
      },
      "PROCESS_FILE": {
        "Type": "Job:Script",
        "Host": "homelab-k3s-agent",
        "Command": "python3 /scripts/etl/process_csv.py --file %%FILE_NAME%%",
        "Description": "Procesa el archivo CSV detectado",
        "DependsOn": [
          {"JobName": "WATCH_INCOMING_FILE", "Condition": "Ended OK"}
        ]
      }
    }
  }
}
```

### 14.4 Job de mantenimiento K3s

```json
// jobs/k3s/longhorn-backup.json
{
  "K3S_MAINTENANCE": {
    "Type": "Folder",
    "ControlmServer": "homelab",
    "OrderMethod": "Automatic",
    "When": {
      "Weekdays": ["SUN"],
      "Times": [{"From": "03:00", "To": "03:05"}]
    },
    "Jobs": {
      "LONGHORN_BACKUP": {
        "Type": "Job:Script",
        "Host": "homelab-k3s-agent",
        "Command": "kubectl annotate volumesnapshot --all backup=true -n longhorn-system",
        "Description": "Trigger backup semanal de Longhorn volumes"
      },
      "NODE_HEALTH_CHECK": {
        "Type": "Job:Script",
        "Host": "homelab-k3s-agent",
        "Command": "kubectl get nodes | grep -v Ready && exit 1 || exit 0",
        "Description": "Verificar que todos los nodos K3s están en Ready",
        "DependsOn": [
          {"JobName": "LONGHORN_BACKUP", "Condition": "Ended OK"}
        ]
      }
    }
  }
}
```

### 14.5 Desplegar todos los job definitions

```bash
# Desde P53 — con ctm CLI configurado
ctm deploy jobs \
  infrastructure/controlm/jobs/ \
  -e homelab \
  -r     # recursivo

# Verificar jobs desplegados
ctm deploy jobs::status -e homelab

# Listar todos los folders
ctm run order -e homelab -s homelab -f "ETL_DAILY"
```

---

## 15. Calendars y Scheduling

### 15.1 Calendario de días hábiles

```json
// calendars/WORKDAYS.json
{
  "WORKDAYS": {
    "Type": "Calendar:Regular",
    "Description": "Días laborables México",
    "Days": {
      "Monday":    true,
      "Tuesday":   true,
      "Wednesday": true,
      "Thursday":  true,
      "Friday":    true,
      "Saturday":  false,
      "Sunday":    false
    },
    "Exceptions": [
      "2026-01-01",  "2026-02-03",  "2026-03-16",
      "2026-05-01",  "2026-09-16",  "2026-11-02",
      "2026-11-16",  "2026-12-25"
    ]
  }
}
```

### 15.2 Calendario de fin de mes

```json
// calendars/MONTH_END.json
{
  "MONTH_END": {
    "Type": "Calendar:Periodic",
    "Description": "Último día hábil de cada mes",
    "Frequency": "Monthly",
    "DaysFromEnd": -1,
    "CalendarToBase": "WORKDAYS"
  }
}
```

```bash
# Desplegar calendarios
ctm deploy calendar \
  infrastructure/controlm/calendars/WORKDAYS.json \
  -e homelab

ctm deploy calendar \
  infrastructure/controlm/calendars/MONTH_END.json \
  -e homelab
```

---

## 16. Alertas y Notificaciones

### 16.1 Alertmanager — job failures via Prometheus

Los alertas de Control-M se integran con Alertmanager vía métricas de Prometheus:

```yaml
# Agregar en alertmanager.yml del T430
receivers:
  - name: controlm-alerts
    slack_configs:
      - api_url: "<SLACK_WEBHOOK_URL>"
        channel: "#lab-alerts"
        title: "Control-M Alert"
        text: "Job {{ $labels.job_name }} — {{ $annotations.summary }}"
    email_configs:
      - to: "admin@homelab.local"
        subject: "Control-M: {{ $labels.alertname }}"
        body: "{{ $annotations.description }}"

route:
  routes:
    - match:
        service: workload-automation
      receiver: controlm-alerts
      repeat_interval: 30m
```

### 16.2 Notificaciones nativas Control-M

Control-M también puede enviar notificaciones directas por email configurando el SMTP:

```bash
# Configurar SMTP en Control-M
ctm config server::param::set homelab \
  SMTP_SERVER smtp.gmail.com \
  SMTP_PORT 587 \
  SMTP_USER "lab@gmail.com" \
  SMTP_PASSWORD "%%VAULT_SMTP_PASS%%"
```

---

## 17. Validación y Health Checks

### 17.1 Verificación completa post-instalación

```bash
#!/bin/bash
# infrastructure/controlm/scripts/validate.sh

echo "=== Control-M Workbench — Validación completa ==="
echo ""

# 1. Pod status
echo "[1/8] Estado del pod..."
kubectl -n workload-automation get pods | grep control-m
echo ""

# 2. API health
echo "[2/8] API health check..."
curl -sk https://controlm.mgmt/automation-api/session/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ControlM2026lab!"}' \
  | python3 -m json.tool | grep -E "token|userId" && echo "[OK] API respondiendo"
echo ""

# 3. Agente embedded
echo "[3/8] Estado del agente embedded..."
TOKEN=$(ctm session login -e homelab 2>/dev/null | grep token | awk -F'"' '{print $4}')
ctm config agent::get homelab homelab-k3s-agent 2>/dev/null | grep -E "Status|Name" && echo "[OK] Agente UP"
echo ""

# 4. PVC
echo "[4/8] Persistent storage..."
kubectl -n workload-automation get pvc control-m-data
echo ""

# 5. Prometheus scraping
echo "[5/8] Prometheus target Control-M..."
curl -s http://10.10.10.10:9091/api/v1/targets | \
  python3 -c "import sys,json; t=json.load(sys.stdin)['data']['activeTargets']; \
  [print(f\"  {x['labels']['job']:20s} {x['health']}\") for x in t if 'controlm' in x['labels'].get('job','')]"
echo ""

# 6. DNS
echo "[6/8] DNS resolution..."
nslookup controlm.mgmt 10.10.10.3 | grep "Address:" | tail -1 && echo "[OK] DNS resuelve"
echo ""

# 7. Jobs desplegados
echo "[7/8] Jobs definidos en Control-M..."
ctm deploy jobs::status -e homelab 2>/dev/null | head -20
echo ""

# 8. ArgoCD sync
echo "[8/8] ArgoCD application status..."
argocd app get control-m 2>/dev/null | grep -E "Health|Sync" && echo "[OK] ArgoCD synced"
echo ""

echo "=== Validación completa ==="
```

```bash
chmod +x infrastructure/controlm/scripts/validate.sh
./infrastructure/controlm/scripts/validate.sh
```

### 17.2 Test de job manual

```bash
# Ejecutar un job de prueba
ctm run order \
  -e homelab \
  -s homelab \
  -f ETL_DAILY \
  -j EXTRACT_SOURCE

# Monitorear ejecución
ctm run status \
  -e homelab \
  -r <run-id> \
  -s Executing

# Ver log del job
ctm run job:log \
  -e homelab \
  -r <run-id> \
  -j EXTRACT_SOURCE
```

---

## 18. Troubleshooting

### Control-M pod en CrashLoopBackOff

```bash
# Ver logs detallados
kubectl -n workload-automation logs statefulset/control-m --previous

# Causas comunes:
# 1. Imagen no accesible — verificar imagePullSecret
kubectl -n workload-automation get secret bmc-registry

# 2. PVC no montado
kubectl -n workload-automation describe pod control-m-0 | grep -A5 "Volumes"

# 3. Java OOM — aumentar límites de memoria
# Editar values.yaml: limits.memory: "20Gi"
helm upgrade control-m infrastructure/controlm/helm/ -n workload-automation

# 4. Puerto 8443 ocupado — verificar colisiones
kubectl -n workload-automation get svc
```

### API retorna 401 Unauthorized

```bash
# Verificar credenciales en el Secret
kubectl -n workload-automation get secret control-m-credentials \
  -o jsonpath='{.data.admin-password}' | base64 -d

# Si ESO sobreescribió el password
kubectl -n workload-automation describe externalsecret control-m-credentials

# Resetear password via contenedor
kubectl -n workload-automation exec -it statefulset/control-m -- \
  ctm session login -u admin -p <nuevo-password> -s https://localhost:8443
```

### Agente en estado "Unavailable"

```bash
# Verificar conectividad desde el pod al agente
kubectl -n workload-automation exec -it statefulset/control-m -- \
  nc -zv homelab-k3s-agent 7006

# Verificar NetworkPolicy no bloquea
kubectl -n workload-automation describe networkpolicy control-m-policy

# Reiniciar agente
kubectl -n workload-automation exec -it statefulset/control-m -- \
  ctm config agent::start homelab homelab-k3s-agent
```

### Job queda en "Wait" sin ejecutar

```bash
# Ver por qué el job no ejecuta
ctm run status -e homelab -r <run-id>

# Causas comunes:
# - Dependencia no satisfecha → revisar DependsOn
# - Recursos del agente agotados → verificar max parallel jobs (límite: 5 en Workbench)
# - Calendario no coincide con fecha actual
# - Variable requerida no definida

# Ver detalles del job
ctm run job:status -e homelab -r <run-id> -j <job-name>
```

### Prometheus no scraping Control-M

```bash
# En T430 — verificar target
curl -s http://localhost:9091/api/v1/targets | \
  python3 -m json.tool | grep -A5 "controlm"

# Si está "down", verificar token expirado
# Renovar token y actualizar prometheus.yml
NEW_TOKEN=$(ctm session login -e homelab | grep token | awk -F'"' '{print $4}')
# Actualizar el job en prometheus.yml con el nuevo token
sudo sed -i "s/token:.*/token: [\"${NEW_TOKEN}\"]/" \
  /opt/monitoring/prometheus/config/prometheus.yml
curl -X POST http://localhost:9091/-/reload
```

### ArgoCD no sincroniza

```bash
# Ver estado de la app
argocd app get control-m

# Forzar sincronización
argocd app sync control-m --force

# Ver diferencias
argocd app diff control-m

# Si hay error de hook post-sync
kubectl -n workload-automation get jobs | grep controlm-deploy
kubectl -n workload-automation logs job/controlm-deploy-jobs
```

---

## 19. Roadmap — Scenarios enterprise

### Fase 1 — Infraestructura base *(completar primero)*

- [ ] Registro cuenta BMC Developer Portal
- [ ] K3s cluster operativo con Cilium + Longhorn + ArgoCD + Vault
- [ ] Namespace `workload-automation` y RBAC
- [ ] Helm chart desplegado y Web UI accesible en `https://controlm.mgmt`
- [ ] DNS rewrite en AdGuard: `controlm.mgmt`
- [ ] Prometheus scraping desde T430
- [ ] Dashboard básico en Grafana

### Fase 2 — Job definitions GitOps

- [ ] Repositorio `infrastructure/controlm/` con estructura completa
- [ ] ArgoCD Application apuntando al repo
- [ ] Calendarios WORKDAYS y MONTH_END
- [ ] Jobs de mantenimiento: Prometheus backup, Longhorn backup, node health
- [ ] Job definitions en Git → ArgoCD → Control-M (post-sync hook)

### Fase 3 — Integración CI/CD

- [ ] Jenkins plugin Control-M instalado
- [ ] Credential de Control-M en Jenkins via Vault
- [ ] Jenkinsfile que dispara y monitorea job de Control-M
- [ ] Vault integration: jobs consumen credenciales via variables `%%VAULT_*%%`

### Fase 4 — Scenarios enterprise avanzados

- [ ] **ETL Pipeline:** Extract → Transform → Load → Validate con dependencias
- [ ] **File Watcher:** Job activado por llegada de archivo en directorio watched
- [ ] **Cross-job dependencies:** Job B de un folder espera Job A de otro folder
- [ ] **Calendar-based:** Jobs de fin de mes, quincenales, anuales
- [ ] **Self-healing:** Job falla → Control-M reintenta automáticamente → alerta si supera umbrales
- [ ] **Control-M + K3s CronJob:** Control-M orquesta CronJobs de K3s como paso dentro de un pipeline mayor

### Fase 5 — Certificación y portafolio

- [ ] Documentar 5+ escenarios enterprise con evidencia de ejecución
- [ ] Capturas de Grafana con métricas reales de jobs
- [ ] Pipeline completo: Git commit → ArgoCD → Control-M → job → notificación
- [ ] Preparación para Control-M Certified Professional Exam (BCO-DEV)

---

## Appendix A — Quick Reference

### Comandos ctm CLI frecuentes

```bash
# Session
ctm session login -e homelab
ctm session logout -e homelab

# Deploy
ctm deploy jobs infrastructure/controlm/jobs/ -e homelab -r
ctm deploy calendar infrastructure/controlm/calendars/ -e homelab -r

# Run / Monitor
ctm run order -e homelab -s homelab -f <FOLDER> -j <JOB>
ctm run status -e homelab -r <run-id>
ctm run job:log -e homelab -r <run-id> -j <JOB>

# Config
ctm config server::get homelab
ctm config agent::get homelab homelab-k3s-agent
ctm config hostgroup::agents::get homelab K3S_PROD

# Active jobs
ctm run jobs -e homelab -s homelab --status Executing
ctm run jobs -e homelab -s homelab --status "Wait Host"
```

### URLs de referencia

| Recurso | URL |
|---|---|
| Control-M Web UI | `https://controlm.mgmt` |
| Automation API docs | `https://controlm.mgmt/automation-api/swagger` |
| BMC Developer Portal | `https://developers.bmc.com` |
| Control-M Docker Hub | `https://hub.docker.com/u/bmc` |
| Grafana dashboard | `http://grafana.mgmt:3000` |
| ArgoCD app | `https://argocd.lab.internal/applications/control-m` |

### Credenciales (referencias Vault)

| Secret | Path en Vault | Key |
|---|---|---|
| Control-M admin | `secret/controlm/admin` | `admin-password` |
| Control-M API token | `secret/controlm/admin` | `api-token` |
| DB ETL source | `secret/controlm/database` | `password` |
| SSH T430 | `secret/ssh/t430` | `password` |
| SMTP | `secret/controlm/smtp` | `password` |

### Puertos del pod Control-M

| Puerto | Protocolo | Uso |
|---|---|---|
| 8443 | HTTPS | Web UI + Automation API + metrics |
| 7006 | TCP | Control-M Agent communication |
| 2369 | TCP | Enterprise Manager internal |
| 7005 | TCP | Control-M Server |

---

## Appendix B — Estructura completa del repositorio

```
infrastructure/controlm/
├── helm/
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── statefulset.yaml
│       ├── service.yaml
│       ├── configmap.yaml
│       ├── secret.yaml
│       └── sync-hook.yaml
├── jobs/
│   ├── etl/
│   │   ├── daily-pipeline.json
│   │   ├── weekly-transform.json
│   │   ├── monthly-report.json
│   │   └── file-watcher.json
│   ├── monitoring/
│   │   ├── prometheus-backup.json
│   │   └── log-cleanup.json
│   └── k3s/
│       ├── longhorn-backup.json
│       └── node-health-check.json
├── folders/
│   ├── ETL_PIPELINE.json
│   └── MONITORING_OPS.json
├── calendars/
│   ├── WORKDAYS.json
│   └── MONTH_END.json
├── connections/
│   ├── ssh-t430.json
│   └── db-postgres.json
├── scripts/
│   ├── etl/
│   │   ├── extract.py
│   │   ├── transform.py
│   │   ├── load.py
│   │   └── validate.py
│   └── monitoring/
│       ├── backup-prometheus.sh
│       └── cleanup-logs.sh
├── k8s/
│   ├── serviceaccount.yaml
│   ├── networkpolicy.yaml
│   ├── storageclass.yaml
│   ├── pvc.yaml
│   ├── ingressroute.yaml
│   ├── certificate.yaml
│   └── externalsecret.yaml
├── vault/
│   └── policy.hcl
└── scripts/
    └── validate.sh
```

---

*Document v1.0 — Control-M Workbench Lab Implementation · Enterprise HomeLab · June 2026*
*Implementación: posterior a K3s cluster · Nodo destino: Dell 7490 #2 · VLAN 20 PROD*
